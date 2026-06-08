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
const pooledPowershellService_1 = require("./pooledPowershellService");
const metadataService_1 = require("./metadataService");
const pgQueueManager_1 = require("./pgQueueManager");
const repository_1 = require("./repository");
const cloneValidationService_1 = require("./cloneValidationService");
const auditMetricsService_1 = require("./auditMetricsService");
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
                            // Reconstruct task in memory queue
                            taskQueue.enqueue(task.type, task.payload);
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
                case 'create-clone':
                    result = await psService.executeCommand('New-FlashdbClone', {
                        GoldenImageId: task.payload.goldenImageId,
                        CloneName: task.payload.cloneName,
                        InstancePath: task.payload.instancePath,
                        StoragePath: task.payload.storagePath,
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
                    break;
                case 'delete-clone':
                    // Use MetadataService for delete (cascades to checkpoints)
                    logger_1.default.info(`[TaskWorker] Deleting clone via MetadataService: ${task.payload.cloneId}`);
                    try {
                        const metadataService = (0, metadataService_1.getMetadataService)();
                        await metadataService.deleteClone(task.payload.cloneId);
                        result = {
                            success: true,
                            message: `Clone ${task.payload.cloneId} and all dependent checkpoints deleted`
                        };
                        logger_1.default.info(`[TaskWorker] Clone deleted successfully: ${task.payload.cloneId}`);
                    }
                    catch (error) {
                        logger_1.default.error(`[TaskWorker] Failed to delete clone: ${error.message}`);
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
                case 'delete-checkpoint':
                    // Use MetadataService for delete with pinned protection
                    logger_1.default.info(`[TaskWorker] Deleting checkpoint via MetadataService: ${task.payload.checkpointId}`);
                    try {
                        const metadataService = (0, metadataService_1.getMetadataService)();
                        await metadataService.deleteCheckpoint(task.payload.cloneId, task.payload.checkpointId);
                        result = {
                            success: true,
                            checkpointId: task.payload.checkpointId,
                            cloneId: task.payload.cloneId,
                            message: 'Checkpoint deleted successfully'
                        };
                        logger_1.default.info(`[TaskWorker] Checkpoint deleted: ${task.payload.checkpointId}`);
                    }
                    catch (error) {
                        // Check if error is due to pinned checkpoint
                        if (/pinned/i.test(error.message)) {
                            logger_1.default.warn(`[TaskWorker] Checkpoint is pinned: ${task.payload.checkpointId}`);
                            throw new Error(`Cannot delete pinned checkpoint. Unpin first.`);
                        }
                        logger_1.default.error(`[TaskWorker] Failed to delete checkpoint: ${error.message}`);
                        throw error;
                    }
                    break;
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
            if (task.retryCount < MAX_RETRIES) {
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