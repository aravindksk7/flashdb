"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskWorker = void 0;
exports.getTaskWorker = getTaskWorker;
exports.initializeTaskWorker = initializeTaskWorker;
exports.resetTaskWorkerForTesting = resetTaskWorkerForTesting;
const taskQueue_1 = require("./taskQueue");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pooledPowershellService_1 = require("./pooledPowershellService");
const metadataService_1 = require("./metadataService");
const pgQueueManager_1 = require("./pgQueueManager");
const repository_1 = require("./repository");
const cloneValidationService_1 = require("./cloneValidationService");
const auditMetricsService_1 = require("./auditMetricsService");
const sqlClient_1 = require("./sqlClient");
const logger_1 = __importDefault(require("../logger"));
const caching_1 = require("../middleware/caching");
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Base delay, will be exponential
const POLL_INTERVAL_MS = 5000; // Check queue every 5 seconds
class TaskWorker {
    constructor() {
        this.isRunning = false;
        this.pollInterval = null;
        this.inFlightTasks = new Set();
        this.usePersistence = false; // Whether to use DB persistence
    }
    isWindowsAbsolutePath(input) {
        return /^[a-zA-Z]:[\\/]/.test(input);
    }
    normalizePathForMatch(input) {
        return input.replace(/\\/g, '/').toLowerCase();
    }
    resolveMappedStoragePath(requestedPath) {
        const trimmed = requestedPath.trim();
        // Keep tests deterministic and focused on task orchestration.
        if (process.env.NODE_ENV === 'test') {
            return trimmed;
        }
        // Only attempt Windows->container mapping when running outside Windows runtime.
        if (process.platform === 'win32' || !this.isWindowsAbsolutePath(trimmed)) {
            return trimmed;
        }
        const rawMappings = process.env.FLASHDB_STORAGE_PATH_MAPPINGS || '{}';
        let mappings = {};
        try {
            mappings = JSON.parse(rawMappings);
        }
        catch {
            throw new Error('Invalid FLASHDB_STORAGE_PATH_MAPPINGS JSON.');
        }
        const normalizedRequested = this.normalizePathForMatch(trimmed);
        const normalizedEntries = Object.entries(mappings)
            .map(([source, target]) => ({
            source: this.normalizePathForMatch(String(source).trim()),
            target: String(target).trim(),
        }))
            .filter(entry => entry.source.length > 0 && entry.target.length > 0)
            .sort((a, b) => b.source.length - a.source.length);
        const match = normalizedEntries.find(entry => normalizedRequested === entry.source || normalizedRequested.startsWith(`${entry.source}/`));
        if (!match) {
            throw new Error(`Storage path '${trimmed}' is a Windows path but no container mapping exists. Set FLASHDB_STORAGE_PATH_MAPPINGS.`);
        }
        const suffix = normalizedRequested.slice(match.source.length).replace(/^\//, '');
        const resolved = suffix ? path_1.default.posix.join(match.target, suffix) : match.target;
        return resolved;
    }
    assertStoragePathExists(storagePath) {
        if (!fs_1.default.existsSync(storagePath)) {
            throw new Error(`Storage path does not exist in runtime environment: ${storagePath}`);
        }
        const stat = fs_1.default.statSync(storagePath);
        if (!stat.isDirectory()) {
            throw new Error(`Storage path is not a directory: ${storagePath}`);
        }
    }
    async dropSqlCloneDatabaseIfPresent(databaseType, databaseName) {
        if (String(databaseType || '').toLowerCase() !== 'sql-server') {
            return;
        }
        const dbName = String(databaseName || '').trim();
        if (!dbName) {
            return;
        }
        const protectedDatabases = new Set([
            'master',
            'model',
            'msdb',
            'tempdb',
            String(process.env.SQL_DATABASE || '').toLowerCase(),
        ]);
        if (protectedDatabases.has(dbName.toLowerCase())) {
            logger_1.default.warn(`[TaskWorker] │ Skipping drop for protected database: ${dbName}`);
            return;
        }
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        await sqlClient.query(`DECLARE @db sysname = @databaseName;
       IF DB_ID(@db) IS NOT NULL
       BEGIN
         DECLARE @stmt nvarchar(max) =
           N'ALTER DATABASE ' + QUOTENAME(@db) + N' SET SINGLE_USER WITH ROLLBACK IMMEDIATE; '
           + N'DROP DATABASE ' + QUOTENAME(@db) + N';';
         EXEC sp_executesql @stmt;
       END`, { databaseName: dbName });
        logger_1.default.info(`[TaskWorker] │ SQL clone database deleted (if existed): ${dbName}`);
    }
    /**
     * Phase 4: Drop checkpoint database safely
     * Called during checkpoint deletion to clean up physical SQL Server database
     * Non-fatal error handling: logs warnings but doesn't throw
     */
    async dropCheckpointDatabaseSafely(databaseName) {
        if (!databaseName) {
            logger_1.default.debug('[TaskWorker] No checkpoint database name to drop');
            return;
        }
        const dbName = String(databaseName || '').trim();
        if (!dbName) {
            logger_1.default.debug('[TaskWorker] Empty checkpoint database name after trim');
            return;
        }
        // Protect system databases
        const protectedDatabases = new Set([
            'master',
            'model',
            'msdb',
            'tempdb',
            String(process.env.SQL_DATABASE || '').toLowerCase(),
        ]);
        if (protectedDatabases.has(dbName.toLowerCase())) {
            logger_1.default.warn(`[TaskWorker] Skipping drop for protected checkpoint database: ${dbName}`);
            return;
        }
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            // Check if database exists
            const checkQuery = `
        IF DB_ID(@databaseName) IS NOT NULL
          SELECT 1
        ELSE
          SELECT 0
      `;
            const checkResult = await sqlClient.query(checkQuery, { databaseName: dbName });
            const rows = Array.isArray(checkResult) ? checkResult : [];
            const dbExists = rows.length > 0 && rows[0]?.[Object.keys(rows[0])[0]];
            if (!dbExists) {
                logger_1.default.info(`[TaskWorker] Checkpoint database not found (already dropped?): ${dbName}`);
                return;
            }
            // Drop the database
            const dropQuery = `
        DECLARE @db sysname = @databaseName;
        IF DB_ID(@db) IS NOT NULL
        BEGIN
          DECLARE @stmt nvarchar(max) =
            N'ALTER DATABASE ' + QUOTENAME(@db) + N' SET SINGLE_USER WITH ROLLBACK IMMEDIATE; '
            + N'DROP DATABASE ' + QUOTENAME(@db) + N';';
          EXEC sp_executesql @stmt;
        END
      `;
            await sqlClient.query(dropQuery, { databaseName: dbName });
            logger_1.default.info(`[TaskWorker] Dropped checkpoint database: ${dbName}`);
        }
        catch (error) {
            logger_1.default.warn(`[TaskWorker] Failed to drop checkpoint database (non-fatal): ${dbName} - ${error.message}`);
            // Non-fatal: don't throw, checkpoint metadata is still cleaned up
        }
    }
    async resolveCloneDatabaseNameFromTaskHistory(cloneId) {
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        const query = `SELECT TOP (1)
        COALESCE(
          NULLIF(JSON_VALUE([result], '$.DatabaseName'), ''),
          NULLIF(JSON_VALUE([result], '$.databaseName'), ''),
          NULLIF(JSON_VALUE([payload], '$.databaseName'), '')
        ) AS [databaseName],
        COALESCE(
          NULLIF(JSON_VALUE([result], '$.DatabaseType'), ''),
          NULLIF(JSON_VALUE([result], '$.databaseType'), ''),
          NULLIF(JSON_VALUE([payload], '$.databaseType'), '')
        ) AS [databaseType]
      FROM (
        SELECT [type], [payload], [result], [completed_at] AS [completedAt]
        FROM [dbo].[flashdb_queue]
        UNION ALL
        SELECT [type], [payload], [result], [completed_at] AS [completedAt]
        FROM [dbo].[flashdb_queue_archive]
      ) AS q
      WHERE [type] = 'create-clone'
        AND (
          JSON_VALUE([result], '$.Id') = @cloneId
          OR JSON_VALUE([result], '$.id') = @cloneId
          OR JSON_VALUE([payload], '$.cloneId') = @cloneId
        )
      ORDER BY [completedAt] DESC`;
        const rows = await sqlClient.query(query, { cloneId });
        const row = Array.isArray(rows) ? rows[0] : null;
        const dbType = String(row?.databaseType || '').toLowerCase();
        const dbName = String(row?.databaseName || '').trim();
        if (dbType && dbType !== 'sql-server') {
            return undefined;
        }
        return dbName || undefined;
    }
    isRetryableTaskError(task, errorMessage) {
        // create-clone is not idempotent once the target database has been created.
        // Retrying these errors creates noisy repeated failures and obscures root cause.
        if (task.type === 'create-clone') {
            if (/Target database already exists/i.test(errorMessage)) {
                return false;
            }
            if (/Clone created but metadata persistence failed/i.test(errorMessage)) {
                return false;
            }
            if (/foreign key constraint|duplicate key|PRIMARY KEY/i.test(errorMessage)) {
                return false;
            }
        }
        return true;
    }
    async startWorker() {
        if (this.isRunning) {
            logger_1.default.warn('Task worker is already running');
            return;
        }
        this.isRunning = true;
        logger_1.default.info('Starting task worker');
        // Check if DB persistence is enabled
        const persistMode = process.env.QUEUE_PERSIST_MODE || 'db';
        if (persistMode === 'db') {
            try {
                const pgQueueManager = (0, pgQueueManager_1.getPgQueueManager)();
                if (pgQueueManager.isInitialized()) {
                    this.usePersistence = true;
                    // Load pending tasks from DB on startup
                    const pendingTasks = await pgQueueManager.loadQueueFromDB();
                    const taskQueue = (0, taskQueue_1.getTaskQueue)();
                    for (const task of pendingTasks) {
                        // Add to in-memory queue if not already there
                        const existing = taskQueue.getTask(task.id);
                        if (!existing) {
                            // Reconstruct task in memory with the original durable task ID.
                            taskQueue.enqueueExisting({
                                ...task,
                                status: 'pending',
                                startedAt: null
                            });
                        }
                    }
                    logger_1.default.info(`Loaded ${pendingTasks.length} tasks from DB for recovery`);
                }
            }
            catch (error) {
                logger_1.default.warn(`DB persistence not available: ${error.message}. Falling back to file persistence.`);
                this.usePersistence = false;
            }
        }
        this.pollInterval = setInterval(() => {
            this.processNextTask().catch(error => {
                logger_1.default.error(`Error in task worker poll: ${error.message}`);
            });
        }, POLL_INTERVAL_MS);
    }
    async stopWorker(gracefulWaitMs = 5000) {
        if (!this.isRunning) {
            logger_1.default.warn('Task worker is not running');
            return;
        }
        logger_1.default.info('Stopping task worker gracefully');
        this.isRunning = false;
        // Clear the polling interval
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        // Wait for in-flight tasks with timeout
        const startTime = Date.now();
        while (this.inFlightTasks.size > 0) {
            if (Date.now() - startTime > gracefulWaitMs) {
                logger_1.default.warn(`Grace period expired with ${this.inFlightTasks.size} tasks still in flight`);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        logger_1.default.info('Task worker stopped');
    }
    async processNextTask() {
        if (!this.isRunning)
            return;
        const taskQueue = (0, taskQueue_1.getTaskQueue)();
        const task = taskQueue.dequeue();
        if (!task)
            return;
        this.inFlightTasks.add(task.id);
        try {
            await this.processTask(task);
        }
        catch (error) {
            logger_1.default.error(`Unhandled error processing task ${task.id}: ${error.message}`);
        }
        finally {
            this.inFlightTasks.delete(task.id);
        }
    }
    async processTask(task) {
        const taskQueue = (0, taskQueue_1.getTaskQueue)();
        const psService = (0, pooledPowershellService_1.getPooledPowerShellService)();
        const operationRepo = (0, repository_1.getCheckpointOperationRepository)();
        const validationService = (0, cloneValidationService_1.getCloneValidationService)();
        const auditService = (0, auditMetricsService_1.getAuditMetricsService)();
        let operationId = null;
        try {
            logger_1.default.info(`Processing task: ${task.id} (${task.type})`);
            // Create operation record for checkpoint operations
            if (task.type === 'create-checkpoint' ||
                task.type === 'restore-checkpoint' ||
                task.type === 'delete-checkpoint') {
                // For create operations, checkpointId doesn't exist yet
                if (task.type !== 'create-checkpoint') {
                    try {
                        const operation = await operationRepo.create(task.payload.checkpointId, task.payload.cloneId, task.type.replace('-checkpoint', ''), task.payload.vhdxPath || '');
                        operationId = operation.id;
                        logger_1.default.info(`Created operation record: ${operationId}`);
                    }
                    catch (operationError) {
                        logger_1.default.warn(`Skipping checkpoint operation record for task ${task.id}: ${operationError.message}`);
                    }
                }
            }
            let result;
            switch (task.type) {
                case 'create-clone': {
                    const requestedStoragePath = String(task.payload.storagePath || '').trim();
                    if (!requestedStoragePath) {
                        throw new Error('Missing required field: storagePath');
                    }
                    const runtimeStoragePath = this.resolveMappedStoragePath(requestedStoragePath);
                    this.assertStoragePathExists(runtimeStoragePath);
                    if (runtimeStoragePath !== requestedStoragePath) {
                        logger_1.default.info(`Mapped clone storage path '${requestedStoragePath}' -> '${runtimeStoragePath}'`);
                    }
                    result = await psService.executeCommand('New-FlashdbClone', {
                        GoldenImageId: task.payload.goldenImageId,
                        CloneName: task.payload.cloneName,
                        InstancePath: task.payload.instancePath,
                        StoragePath: runtimeStoragePath,
                        DatabaseType: task.payload.databaseType,
                        DatabaseName: task.payload.databaseName,
                        CompressionEnabled: task.payload.compressionEnabled
                    });
                    if (task.payload.attachAfterCreate === true && result && typeof result === 'object') {
                        await psService.executeCommandRaw('Connect-FlashdbClone', {
                            CloneId: result.Id || result.id,
                            InstancePath: task.payload.instancePath
                        });
                        result.Status = 'Attached';
                    }
                    // Persist clone creation result to database
                    if (result && typeof result === 'object') {
                        try {
                            const sqlClient = (0, sqlClient_1.getSqlClient)();
                            const cloneId = result.Id || result.id;
                            const vhdxPath = result.VhdxPath || result.vhdxPath;
                            const databaseName = result.DatabaseName || task.payload.databaseName || '';
                            await sqlClient.query(`INSERT INTO [dbo].[Clones]
                  ([id], [goldenImageId], [cloneName], [instancePath], [storagePath], [vhdxPath],
                   [status], [databaseType], [databaseName], [compressionEnabled])
                 VALUES
                  (@id, @goldenImageId, @cloneName, @instancePath, @storagePath, @vhdxPath,
                   @status, @databaseType, @databaseName, @compressionEnabled)`, {
                                id: cloneId,
                                goldenImageId: task.payload.goldenImageId,
                                cloneName: task.payload.cloneName,
                                instancePath: task.payload.instancePath,
                                storagePath: runtimeStoragePath,
                                vhdxPath: vhdxPath,
                                status: result.Status || 'Created',
                                databaseType: task.payload.databaseType || 'sql-server',
                                databaseName: databaseName,
                                compressionEnabled: task.payload.compressionEnabled ? 1 : 0
                            });
                            logger_1.default.info(`Persisted clone to database: ${cloneId} (vhdxPath: ${vhdxPath})`);
                        }
                        catch (dbError) {
                            logger_1.default.error(`Failed to persist clone to database: ${dbError.message}`);
                            throw new Error(`Clone created but metadata persistence failed: ${dbError.message}`);
                        }
                    }
                    break;
                }
                case 'delete-clone':
                    // Delete through provider first so Get-FlashdbClone no longer returns the clone,
                    // then delete metadata for SQL consistency.
                    const deleteCloneId = task.payload.cloneId;
                    const deleteVhdx = task.payload.deleteVhdx === true;
                    const payloadDatabaseName = typeof task.payload.databaseName === 'string' ? task.payload.databaseName.trim() : '';
                    const existingClone = await psService.executeCommand('Get-FlashdbClone', {
                        CloneId: deleteCloneId,
                    });
                    let deleteDatabaseName = payloadDatabaseName ||
                        existingClone?.DatabaseName ||
                        existingClone?.databaseName;
                    const deleteDatabaseType = existingClone?.DatabaseType || existingClone?.databaseType;
                    if (!deleteDatabaseName) {
                        deleteDatabaseName = await this.resolveCloneDatabaseNameFromTaskHistory(deleteCloneId);
                        if (deleteDatabaseName) {
                            logger_1.default.info(`[TaskWorker] │ Resolved clone DB from task history: ${deleteDatabaseName}`);
                        }
                    }
                    logger_1.default.info(`[TaskWorker] ┌─ delete-clone task initiated for: ${deleteCloneId}`);
                    logger_1.default.info(`[TaskWorker] │ deleteVhdx: ${deleteVhdx}`);
                    try {
                        logger_1.default.info(`[TaskWorker] ├─ Calling PowerShell: Remove-FlashdbClone`);
                        try {
                            await psService.executeCommandRaw('Remove-FlashdbClone', {
                                CloneId: deleteCloneId,
                                DeleteVhdx: deleteVhdx,
                            });
                            logger_1.default.info(`[TaskWorker] │ PowerShell deletion completed`);
                        }
                        catch (providerError) {
                            const providerMessage = String(providerError?.message || '');
                            if (/not found|cannot find|does not exist/i.test(providerMessage)) {
                                logger_1.default.warn(`[TaskWorker] │ Clone not found in provider (${deleteCloneId}); continuing metadata cleanup`);
                            }
                            else {
                                throw providerError;
                            }
                        }
                        logger_1.default.info(`[TaskWorker] ├─ Calling MetadataService: deleteClone(${deleteCloneId})`);
                        const metadataService = (0, metadataService_1.getMetadataService)();
                        await metadataService.deleteClone(deleteCloneId);
                        logger_1.default.info(`[TaskWorker] │ MetadataService deletion completed`);
                        await this.dropSqlCloneDatabaseIfPresent(deleteDatabaseType || 'sql-server', deleteDatabaseName);
                        result = {
                            success: true,
                            message: `Clone ${deleteCloneId} deleted from provider and metadata store`
                        };
                        logger_1.default.info(`[TaskWorker] └─ ✓ Clone deletion task completed successfully`);
                    }
                    catch (error) {
                        logger_1.default.error(`[TaskWorker] └─ ✗ delete-clone task FAILED`);
                        logger_1.default.error(`[TaskWorker]    Error: ${error.message}`);
                        throw error;
                    }
                    break;
                case 'create-checkpoint':
                    result = await psService.executeCommand('New-FlashdbCheckpoint', {
                        CloneId: task.payload.cloneId,
                        CheckpointName: task.payload.checkpointName,
                        Phase: task.payload.phase || 'manual',
                        Description: task.payload.description,
                        Force: task.payload.force || false
                    });
                    // Phase 2: Capture database name from PowerShell result
                    if (result && typeof result === 'object') {
                        const checkpointDatabaseName = result.DatabaseName || result.databaseName;
                        if (checkpointDatabaseName) {
                            logger_1.default.info(`[TaskWorker] Captured checkpoint database: ${checkpointDatabaseName} (checkpoint: ${task.payload.checkpointName})`);
                            // Phase 3: Save database name to metadata service
                            try {
                                const metadataService = (0, metadataService_1.getMetadataService)();
                                const checkpointId = result.Id || result.id;
                                if (checkpointId) {
                                    await metadataService.saveCheckpointDatabaseName(checkpointId, checkpointDatabaseName);
                                    logger_1.default.info(`[TaskWorker] Saved checkpoint database name: ${checkpointDatabaseName} -> ${checkpointId}`);
                                }
                            }
                            catch (dbError) {
                                logger_1.default.warn(`[TaskWorker] Failed to save checkpoint database name: ${dbError.message} (non-fatal)`);
                            }
                        }
                    }
                    break;
                case 'restore-checkpoint':
                    result = await psService.executeCommand('Restore-FlashdbCheckpoint', {
                        CloneId: task.payload.cloneId,
                        CheckpointId: task.payload.checkpointId,
                        ReattachAfter: task.payload.reattachAfter !== false,
                        Force: true
                    });
                    // Mark checkpoint as restored in database
                    try {
                        const checkpointRepo = (0, repository_1.getCheckpointRepository)();
                        await checkpointRepo.markAsRestored(task.payload.checkpointId);
                        logger_1.default.info(`Marked checkpoint ${task.payload.checkpointId} as restored in database`);
                    }
                    catch (dbError) {
                        logger_1.default.warn(`Failed to update checkpoint restoration timestamp: ${dbError.message}`);
                        // Don't fail the restore if DB update fails - the restore still succeeded
                    }
                    break;
                case 'delete-checkpoint': {
                    // Phase 5a: Get checkpoint metadata including database name before deletion
                    logger_1.default.info(`[TaskWorker] ┌─ delete-checkpoint initiated: ${task.payload.checkpointId}`);
                    const checkpointRepo = (0, repository_1.getCheckpointRepository)();
                    let checkpointDatabaseName = null;
                    try {
                        logger_1.default.info(`[TaskWorker] ├─ Retrieving checkpoint metadata`);
                        const checkpoint = await checkpointRepo.getById(task.payload.checkpointId);
                        if (checkpoint) {
                            checkpointDatabaseName = checkpoint.checkpointDatabaseName || null;
                            if (checkpointDatabaseName) {
                                logger_1.default.info(`[TaskWorker] │ Found checkpoint database: ${checkpointDatabaseName}`);
                            }
                        }
                    }
                    catch (metaError) {
                        logger_1.default.warn(`[TaskWorker] Failed to retrieve checkpoint metadata: ${metaError.message} (continuing with cleanup)`);
                    }
                    // Phase 5b: Delete checkpoint metadata
                    try {
                        logger_1.default.info(`[TaskWorker] ├─ Deleting checkpoint metadata`);
                        const metadataService = (0, metadataService_1.getMetadataService)();
                        await metadataService.deleteCheckpoint(task.payload.cloneId, task.payload.checkpointId);
                        logger_1.default.info(`[TaskWorker] │ Metadata deleted`);
                        // Phase 5c: Drop physical database if applicable
                        if (checkpointDatabaseName) {
                            logger_1.default.info(`[TaskWorker] ├─ Dropping checkpoint database`);
                            await this.dropCheckpointDatabaseSafely(checkpointDatabaseName);
                            logger_1.default.info(`[TaskWorker] │ Database cleanup completed`);
                        }
                        result = {
                            success: true,
                            checkpointId: task.payload.checkpointId,
                            cloneId: task.payload.cloneId,
                            message: 'Checkpoint deleted successfully'
                        };
                        logger_1.default.info(`[TaskWorker] └─ ✓ Checkpoint deletion completed`);
                    }
                    catch (error) {
                        logger_1.default.error(`[TaskWorker] └─ ✗ delete-checkpoint FAILED`);
                        logger_1.default.error(`[TaskWorker]    Error: ${error.message}`);
                        // Check if error is due to pinned checkpoint
                        if (/pinned/i.test(error.message)) {
                            logger_1.default.warn(`[TaskWorker] Checkpoint is pinned: ${task.payload.checkpointId}`);
                            throw new Error(`Cannot delete pinned checkpoint. Unpin first.`);
                        }
                        throw error;
                    }
                    break;
                }
                case 'validate-clone': {
                    const cloneId = task.payload.cloneId;
                    const validationId = task.payload.validationId || `validation-${cloneId}-${Date.now()}`;
                    const startedAt = Date.now();
                    const validation = await validationService.validateClone(cloneId);
                    await auditService.recordValidationComplete(cloneId, validationId, validation.findings, validation.isHealthy);
                    result = {
                        cloneId,
                        validationId,
                        status: validation.isHealthy ? 'Healthy' : 'Unhealthy',
                        findings: validation.findings,
                        validatedAt: validation.validatedAt.toISOString(),
                        duration: {
                            elapsedMs: Date.now() - startedAt
                        }
                    };
                    break;
                }
                case 'repair-clone': {
                    const cloneId = task.payload.cloneId;
                    const repairId = task.payload.repairId || `repair-${cloneId}-${Date.now()}`;
                    const startedAt = Date.now();
                    const attempt = await validationService.executeRepair(cloneId, false);
                    const success = attempt.result === 'Success' || attempt.result === 'Skipped';
                    await auditService.recordRepairComplete(cloneId, repairId, success, attempt.attemptedActions);
                    result = {
                        cloneId,
                        repairId,
                        status: success ? 'Completed' : 'Failed',
                        success,
                        appliedActions: attempt.attemptedActions.map(action => action.message || action.action),
                        durationSeconds: Math.round((Date.now() - startedAt) / 1000),
                        errors: success ? [] : [attempt.resultMessage]
                    };
                    break;
                }
                default:
                    throw new Error(`Unknown task type: ${task.type}`);
            }
            logger_1.default.info(`Task completed successfully: ${task.id}`);
            taskQueue.updateTask(task.id, 'completed', result);
            if (task.type === 'create-checkpoint' ||
                task.type === 'restore-checkpoint' ||
                task.type === 'delete-checkpoint' ||
                task.type === 'validate-clone' ||
                task.type === 'repair-clone') {
                (0, caching_1.invalidateCache)(task.type.includes('checkpoint') ? ['/checkpoints', '/metrics'] : ['/clones', '/metrics']);
            }
            // Update operation record if applicable
            if (operationId) {
                try {
                    await operationRepo.update(operationId, 'completed', new Date(), undefined, result?.stateHash || result?.postHash);
                }
                catch (operationError) {
                    logger_1.default.warn(`Failed to update checkpoint operation record ${operationId}: ${operationError.message}`);
                }
            }
            // Update DB if persistence is enabled
            if (this.usePersistence) {
                const pgQueueManager = (0, pgQueueManager_1.getPgQueueManager)();
                await pgQueueManager.updateTaskStatus(task.id, 'completed', undefined, result);
            }
        }
        catch (error) {
            const errorMessage = error.message || String(error);
            logger_1.default.error(`Task failed: ${task.id}, error: ${errorMessage}, retry: ${task.retryCount}/${MAX_RETRIES}`);
            const shouldRetry = this.isRetryableTaskError(task, errorMessage);
            if (shouldRetry && task.retryCount < MAX_RETRIES) {
                // Retry with exponential backoff
                task.retryCount++;
                const delayMs = RETRY_DELAY_MS * Math.pow(2, task.retryCount - 1);
                logger_1.default.info(`Retrying task ${task.id} in ${delayMs}ms (attempt ${task.retryCount}/${MAX_RETRIES})`);
                // Schedule retry by putting task back to pending after delay
                setTimeout(() => {
                    const taskQueue = (0, taskQueue_1.getTaskQueue)();
                    taskQueue.retryTask(task.id);
                }, delayMs);
            }
            else {
                if (!shouldRetry) {
                    logger_1.default.warn(`Task ${task.id} marked non-retryable; failing immediately.`);
                }
                // Max retries exceeded
                const taskQueue = (0, taskQueue_1.getTaskQueue)();
                taskQueue.updateTask(task.id, 'failed', undefined, errorMessage);
                // Update operation record if applicable
                if (operationId) {
                    try {
                        await operationRepo.update(operationId, 'failed', new Date(), errorMessage);
                    }
                    catch (operationError) {
                        logger_1.default.warn(`Failed to mark checkpoint operation record ${operationId} failed: ${operationError.message}`);
                    }
                }
                // Update DB if persistence is enabled
                if (this.usePersistence) {
                    const pgQueueManager = (0, pgQueueManager_1.getPgQueueManager)();
                    await pgQueueManager.updateTaskStatus(task.id, 'failed', errorMessage);
                }
            }
        }
    }
    isWorkerRunning() {
        return this.isRunning;
    }
    getInFlightTaskCount() {
        return this.inFlightTasks.size;
    }
}
exports.TaskWorker = TaskWorker;
// Singleton instance
let workerInstance = null;
function getTaskWorker() {
    if (!workerInstance) {
        workerInstance = new TaskWorker();
    }
    return workerInstance;
}
function initializeTaskWorker() {
    return getTaskWorker();
}
function resetTaskWorkerForTesting() {
    workerInstance = null;
}
//# sourceMappingURL=taskWorker.js.map