"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pooledPowershellService_1 = require("../services/pooledPowershellService");
const taskQueue_1 = require("../services/taskQueue");
const cloneValidationService_1 = require("../services/cloneValidationService");
const auditMetricsService_1 = require("../services/auditMetricsService");
const logger_1 = __importDefault(require("../logger"));
const caching_1 = require("../middleware/caching");
const lockMiddleware_1 = require("../middleware/lockMiddleware");
const router = (0, express_1.Router)();
const psService = (0, pooledPowershellService_1.getPooledPowerShellService)();
const toResponseArray = (value) => {
    if (value == null)
        return [];
    const items = Array.isArray(value) ? value : [value];
    return items.filter(item => {
        if (item == null)
            return false;
        return typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length > 0;
    });
};
// POST - Create clone (queued)
router.post('/', async (req, res) => {
    try {
        const { goldenImageId, cloneName, instancePath, storagePath, databaseType, databaseName, compressionEnabled, attachAfterCreate, useQueue = true } = req.body;
        if (!goldenImageId || !cloneName || !instancePath || !storagePath) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: goldenImageId, cloneName, instancePath, storagePath'
            });
        }
        logger_1.default.info(`Creating clone: ${cloneName}`);
        // Lock on source to prevent concurrent clones from same golden image
        const lockResourceId = `clone-creation:${goldenImageId}`;
        try {
            const { result: task, lockContext } = await (0, lockMiddleware_1.withLock)(lockResourceId, async () => {
                // Use task queue for async processing
                if (useQueue !== false) {
                    const taskQueue = (0, taskQueue_1.getTaskQueue)();
                    const task = taskQueue.enqueue('create-clone', {
                        goldenImageId,
                        cloneName,
                        instancePath,
                        storagePath,
                        databaseType,
                        databaseName,
                        compressionEnabled,
                        attachAfterCreate
                    });
                    // Invalidate cache for clones and metrics
                    (0, caching_1.invalidateCache)(['/clones', '/metrics']);
                    return task;
                }
                else {
                    // Synchronous mode (for backward compatibility)
                    const params = {
                        GoldenImageId: goldenImageId,
                        CloneName: cloneName,
                        InstancePath: instancePath,
                        StoragePath: storagePath
                    };
                    if (databaseType)
                        params.DatabaseType = databaseType;
                    if (databaseName)
                        params.DatabaseName = databaseName;
                    if (compressionEnabled !== undefined)
                        params.CompressionEnabled = compressionEnabled;
                    const clone = await psService.executeCommand('New-FlashdbClone', params);
                    if (attachAfterCreate === true && clone && typeof clone === 'object') {
                        await psService.executeCommandRaw('Connect-FlashdbClone', {
                            CloneId: clone.Id || clone.id,
                            InstancePath: instancePath
                        });
                        clone.Status = 'Attached';
                    }
                    // Invalidate cache for clones and metrics
                    (0, caching_1.invalidateCache)(['/clones', '/metrics']);
                    return clone;
                }
            });
            const responseCode = useQueue !== false ? 202 : 201;
            const responseData = useQueue !== false
                ? {
                    taskId: task.id,
                    status: task.status,
                    createdAt: task.createdAt
                }
                : task;
            res.set('Lock-Wait-Time-Ms', lockContext.waitTimeMs.toString());
            return res.status(responseCode).json({
                success: true,
                data: responseData,
                message: useQueue !== false ? 'Clone creation task queued successfully' : 'Clone created successfully'
            });
        }
        catch (error) {
            if (error.message.includes('LOCK_CONFLICT')) {
                logger_1.default.warn(`Clone creation blocked - resource locked: ${lockResourceId}`);
                const lockInfo = await (0, lockMiddleware_1.getLockInfo)(lockResourceId);
                return res.status(409).json({
                    success: false,
                    message: 'Clone creation is already in progress for this golden image',
                    lockInfo
                });
            }
            throw error;
        }
    }
    catch (error) {
        logger_1.default.error(`Error creating clone: ${error.message}`);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
});
// GET - List all clones
router.get('/', async (_req, res) => {
    try {
        logger_1.default.info('Retrieving all clones');
        const clones = await psService.executeCommand('Get-FlashdbClone', {});
        return res.json({
            success: true,
            data: toResponseArray(clones),
            message: 'Clones retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving clones: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
// GET - Get clone by ID
router.get('/:cloneId', async (req, res) => {
    try {
        const { cloneId } = req.params;
        logger_1.default.info(`Retrieving clone: ${cloneId}`);
        const clone = await psService.executeCommand('Get-FlashdbClone', {
            CloneId: cloneId
        });
        if (!clone) {
            return res.status(404).json({
                success: false,
                message: `Clone not found: ${cloneId}`
            });
        }
        return res.json({
            success: true,
            data: clone
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving clone: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
// POST - Attach clone
router.post('/:cloneId/attach', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const { instancePath } = req.body;
        if (!instancePath) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: instancePath'
            });
        }
        logger_1.default.info(`Attaching clone ${cloneId} to ${instancePath}`);
        await psService.executeCommandRaw('Connect-FlashdbClone', {
            CloneId: cloneId,
            InstancePath: instancePath
        });
        // Invalidate cache for this clone
        (0, caching_1.invalidateCache)(['/clones', '/metrics']);
        return res.json({
            success: true,
            message: 'Clone attached successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error attaching clone: ${error.message}`);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
});
// POST - Detach clone
router.post('/:cloneId/detach', async (req, res) => {
    try {
        const { cloneId } = req.params;
        logger_1.default.info(`Detaching clone: ${cloneId}`);
        await psService.executeCommandRaw('Disconnect-FlashdbClone', {
            CloneId: cloneId
        });
        // Invalidate cache for this clone
        (0, caching_1.invalidateCache)(['/clones', '/metrics']);
        return res.json({
            success: true,
            message: 'Clone detached successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error detaching clone: ${error.message}`);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
});
// DELETE - Remove clone (queued)
router.delete('/:cloneId', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const { deleteVhdx, useQueue = true } = req.query;
        logger_1.default.info(`Deleting clone: ${cloneId}`);
        // Lock on clone to prevent delete during active operations
        const lockResourceId = `clone:${cloneId}`;
        try {
            const { result: task, lockContext } = await (0, lockMiddleware_1.withLock)(lockResourceId, async () => {
                // Use task queue for async processing
                if (useQueue !== 'false') {
                    const taskQueue = (0, taskQueue_1.getTaskQueue)();
                    const task = taskQueue.enqueue('delete-clone', {
                        cloneId,
                        deleteVhdx: deleteVhdx === 'true'
                    });
                    // Invalidate cache for clones and metrics
                    (0, caching_1.invalidateCache)(['/clones', '/metrics']);
                    return task;
                }
                else {
                    // Synchronous mode (for backward compatibility)
                    await psService.executeCommandRaw('Remove-FlashdbClone', {
                        CloneId: cloneId,
                        DeleteVhdx: deleteVhdx === 'true'
                    });
                    // Invalidate cache for clones and metrics
                    (0, caching_1.invalidateCache)(['/clones', '/metrics']);
                    return { success: true, message: 'Clone deleted successfully' };
                }
            });
            const isQueued = useQueue !== 'false';
            const responseData = isQueued
                ? {
                    taskId: task.id,
                    status: task.status,
                    createdAt: task.createdAt
                }
                : task;
            res.set('Lock-Wait-Time-Ms', lockContext.waitTimeMs.toString());
            return res.status(isQueued ? 202 : 200).json({
                success: true,
                data: responseData,
                message: isQueued ? 'Clone deletion task queued successfully' : 'Clone deleted successfully'
            });
        }
        catch (error) {
            if (error.message.includes('LOCK_CONFLICT')) {
                logger_1.default.warn(`Clone deletion blocked - resource locked: ${lockResourceId}`);
                const lockInfo = await (0, lockMiddleware_1.getLockInfo)(lockResourceId);
                return res.status(409).json({
                    success: false,
                    message: 'Clone is currently in use or undergoing another operation',
                    lockInfo
                });
            }
            throw error;
        }
    }
    catch (error) {
        logger_1.default.error(`Error deleting clone: ${error.message}`);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
});
// ===== Validation Endpoints (Phase 5A) =====
// POST - Validate clone
router.post('/:cloneId/validate', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const queue = req.query.queue !== 'false'; // default true (async)
        const validationId = `validation-${cloneId}-${Date.now()}`;
        logger_1.default.info(`[Validation] Starting validation for clone: ${cloneId} (queue: ${queue})`);
        // Check if clone exists
        const clone = await psService.executeCommand('Get-FlashdbClone', {
            CloneId: cloneId
        });
        if (!clone) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'E001_CLONE_NOT_FOUND',
                    message: `Clone not found: ${cloneId}`,
                    timestamp: new Date().toISOString()
                }
            });
        }
        // Check for validation lock conflict
        const validationLockId = `clone-validation:${cloneId}`;
        const cloneLockId = `clone:${cloneId}`;
        try {
            const { result: validationResult } = await (0, lockMiddleware_1.withLock)(validationLockId, async () => {
                // Also check if clone is locked by another operation
                try {
                    // This will throw if clone is locked
                    const { result: innerResult } = await (0, lockMiddleware_1.withLock)(cloneLockId, async () => {
                        // Record validation start
                        const auditService = (0, auditMetricsService_1.getAuditMetricsService)();
                        await auditService.recordOperation({
                            id: validationId,
                            type: 'validation-start',
                            entityId: cloneId,
                            status: 'pending',
                            timestamp: new Date(),
                            operatorId: req.user?.id
                        });
                        if (!queue) {
                            // Synchronous mode: validate directly
                            const validationService = (0, cloneValidationService_1.getCloneValidationService)();
                            const result = await validationService.validateClone(cloneId);
                            // Record completion
                            await auditService.recordOperation({
                                id: validationId,
                                type: 'validation-complete',
                                entityId: cloneId,
                                status: 'completed',
                                result: result.isHealthy ? 'success' : 'failed',
                                findings: result.findings,
                                timestamp: new Date(),
                                completedAt: new Date()
                            });
                            return {
                                isQueued: false,
                                data: {
                                    cloneId,
                                    validationId,
                                    status: result.isHealthy ? 'Healthy' : 'Unhealthy',
                                    findings: result.findings,
                                    validatedAt: result.validatedAt.toISOString(),
                                    duration: {
                                        elapsedMs: Date.now() - parseInt(validationId.split('-')[2])
                                    }
                                }
                            };
                        }
                        else {
                            // Asynchronous mode: queue validation task
                            const taskQueue = (0, taskQueue_1.getTaskQueue)();
                            const task = taskQueue.enqueue('validate-clone', {
                                cloneId,
                                validationId
                            });
                            return {
                                isQueued: true,
                                data: {
                                    taskId: task.id,
                                    validationId,
                                    status: 'Pending',
                                    pollingUrl: `/api/clones/${cloneId}/validation-status?validationId=${validationId}`,
                                    estimatedDurationMs: 30000
                                }
                            };
                        }
                    }, 30);
                    return innerResult;
                }
                catch (lockError) {
                    if (lockError.message.includes('LOCK_CONFLICT')) {
                        const lockInfo = await (0, lockMiddleware_1.getLockInfo)(cloneLockId);
                        throw {
                            code: 'E006_CLONE_LOCKED',
                            status: 409,
                            lockInfo
                        };
                    }
                    throw lockError;
                }
            }, 30);
            if (!queue) {
                return res.status(200).json({
                    success: true,
                    data: validationResult.data,
                    message: 'Clone validation completed'
                });
            }
            else {
                return res.status(202).json({
                    success: true,
                    data: validationResult.data,
                    message: 'Clone validation queued'
                });
            }
        }
        catch (error) {
            if (error.code === 'E006_CLONE_LOCKED') {
                return res.status(error.status).json({
                    success: false,
                    error: {
                        code: error.code,
                        message: 'Clone is currently in use',
                        details: { lockInfo: error.lockInfo },
                        timestamp: new Date().toISOString()
                    }
                });
            }
            if (error.message.includes('LOCK_CONFLICT')) {
                logger_1.default.warn(`[Validation] Validation lock conflict for clone: ${cloneId}`);
                const lockInfo = await (0, lockMiddleware_1.getLockInfo)(validationLockId);
                return res.status(409).json({
                    success: false,
                    error: {
                        code: 'E002_VALIDATION_IN_PROGRESS',
                        message: 'Validation already in progress for this clone',
                        details: { lockInfo },
                        timestamp: new Date().toISOString()
                    }
                });
            }
            throw error;
        }
    }
    catch (error) {
        logger_1.default.error(`[Validation] Error validating clone: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: {
                code: 'E007_SERVICE_ERROR',
                message: 'Validation service error',
                details: {
                    originalError: error.message,
                    requestId: Date.now().toString()
                },
                timestamp: new Date().toISOString()
            }
        });
    }
});
// GET - Get validation status
router.get('/:cloneId/validation-status', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const { validationId, includeHistory } = req.query;
        logger_1.default.info(`[Validation] Getting validation status for clone: ${cloneId}`);
        // Check if clone exists
        const clone = await psService.executeCommand('Get-FlashdbClone', {
            CloneId: cloneId
        });
        if (!clone) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'E001_CLONE_NOT_FOUND',
                    message: `Clone not found: ${cloneId}`,
                    timestamp: new Date().toISOString()
                }
            });
        }
        // Get latest validation from audit service
        const auditService = (0, auditMetricsService_1.getAuditMetricsService)();
        const validationOperations = await auditService.getValidationOperations(cloneId);
        if (!validationOperations || validationOperations.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'E001_CLONE_NOT_FOUND',
                    message: `No validation history found for clone: ${cloneId}`,
                    timestamp: new Date().toISOString()
                }
            });
        }
        // Find specific validation or latest
        let latestValidation = validationOperations[0];
        if (validationId && typeof validationId === 'string') {
            const found = validationOperations.find(op => op.id === validationId);
            if (found) {
                latestValidation = found;
            }
        }
        const latestValidationStatus = latestValidation.status === 'pending'
            ? 'Pending'
            : latestValidation.result === 'success'
                ? 'Healthy'
                : 'Unhealthy';
        const responseData = {
            cloneId,
            validationId: latestValidation.id,
            status: latestValidationStatus,
            findings: latestValidation.findings || [],
            validatedAt: latestValidation.timestamp.toISOString()
        };
        if (includeHistory === 'true') {
            responseData.history = validationOperations.slice(0, 10).map((op) => ({
                validationId: op.id,
                status: op.status === 'pending' ? 'Pending' : op.result === 'success' ? 'Healthy' : 'Unhealthy',
                findingsCount: op.findings?.length || 0,
                validatedAt: op.timestamp.toISOString()
            }));
        }
        return res.json({
            success: true,
            data: responseData,
            message: 'Validation status retrieved'
        });
    }
    catch (error) {
        logger_1.default.error(`[Validation] Error getting validation status: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: {
                code: 'E007_SERVICE_ERROR',
                message: 'Validation service error',
                details: { originalError: error.message },
                timestamp: new Date().toISOString()
            }
        });
    }
});
// GET - Get validation history
router.get('/:cloneId/validation-history', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const offset = parseInt(req.query.offset) || 0;
        const status = req.query.status;
        logger_1.default.info(`[Validation] Getting validation history for clone: ${cloneId}`);
        // Check if clone exists
        const clone = await psService.executeCommand('Get-FlashdbClone', {
            CloneId: cloneId
        });
        if (!clone) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'E001_CLONE_NOT_FOUND',
                    message: `Clone not found: ${cloneId}`,
                    timestamp: new Date().toISOString()
                }
            });
        }
        // Get validation history from audit service
        const auditService = (0, auditMetricsService_1.getAuditMetricsService)();
        const validationOperations = await auditService.getValidationOperations(cloneId);
        let filtered = validationOperations || [];
        // Filter by status if provided
        if (status) {
            filtered = filtered.filter((op) => {
                const opStatus = op.status === 'pending' ? 'Pending' : op.result === 'success' ? 'Healthy' : 'Unhealthy';
                return opStatus === status;
            });
        }
        // Apply pagination
        const total = filtered.length;
        const validations = filtered.slice(offset, offset + limit).map((op) => {
            const errorCount = op.findings?.filter((f) => f.severity === 'Error').length || 0;
            const warningCount = op.findings?.filter((f) => f.severity === 'Warning').length || 0;
            return {
                validationId: op.id,
                status: op.status === 'pending' ? 'Pending' : op.result === 'success' ? 'Healthy' : 'Unhealthy',
                findingsCount: op.findings?.length || 0,
                errorCount,
                warningCount,
                validatedAt: op.timestamp.toISOString(),
                duration: op.completedAt ? new Date(op.completedAt).getTime() - new Date(op.timestamp).getTime() : 0
            };
        });
        return res.json({
            success: true,
            data: {
                cloneId,
                validations,
                total,
                limit,
                offset
            },
            message: 'Validation history retrieved'
        });
    }
    catch (error) {
        logger_1.default.error(`[Validation] Error getting validation history: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: {
                code: 'E007_SERVICE_ERROR',
                message: 'Validation service error',
                details: { originalError: error.message },
                timestamp: new Date().toISOString()
            }
        });
    }
});
// ===== Repair Endpoints (Phase 5A) =====
// POST - Plan or execute clone repair
router.post('/:cloneId/repair', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const dryRun = req.query.dryRun !== 'false' && (req.body.dryRun !== false);
        const repairId = `repair-${cloneId}-${Date.now()}`;
        logger_1.default.info(`[Repair] Starting repair for clone: ${cloneId} (dryRun: ${dryRun})`);
        // Check if clone exists
        const clone = await psService.executeCommand('Get-FlashdbClone', {
            CloneId: cloneId
        });
        if (!clone) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'E001_CLONE_NOT_FOUND',
                    message: `Clone not found: ${cloneId}`,
                    timestamp: new Date().toISOString()
                }
            });
        }
        const validationService = (0, cloneValidationService_1.getCloneValidationService)();
        const auditService = (0, auditMetricsService_1.getAuditMetricsService)();
        if (dryRun) {
            // Dry-run: plan the repair
            const plan = await validationService.repairClone(cloneId, true);
            return res.json({
                success: true,
                data: {
                    cloneId,
                    repairId,
                    isDryRun: true,
                    status: plan.plannedActions.some(a => a.startsWith('ERROR:')) ? 'CannotRepair' : 'Planned',
                    plan: {
                        actions: plan.plannedActions.map(action => ({
                            type: action.includes('Remount') ? 'RemountVhd' :
                                action.includes('Attach') ? 'AttachDatabase' :
                                    action.includes('Detach') ? 'DetachDatabase' :
                                        action.includes('Update') ? 'UpdateMetadata' : 'Other',
                            description: action,
                            estimatedDurationSeconds: plan.estimatedDurationSeconds / Math.max(plan.plannedActions.length, 1),
                            riskLevel: 'Medium'
                        })),
                        estimatedDurationSeconds: plan.estimatedDurationSeconds,
                        requiresApproval: plan.estimatedDurationSeconds > 60
                    },
                    blockers: [],
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 300000).toISOString() // 5 minute cache
                },
                message: 'Repair plan created'
            });
        }
        else {
            // Execute mode: queue the repair
            const repairLockId = `clone-repair:${cloneId}`;
            const cloneLockId = `clone:${cloneId}`;
            try {
                const { result: repairResult } = await (0, lockMiddleware_1.withLock)(repairLockId, async () => {
                    // Check if clone is locked
                    try {
                        const { result: innerResult } = await (0, lockMiddleware_1.withLock)(cloneLockId, async () => {
                            // Record repair start
                            await auditService.recordOperation({
                                id: repairId,
                                type: 'repair-execute',
                                entityId: cloneId,
                                status: 'pending',
                                timestamp: new Date(),
                                operatorId: req.user?.id || req.body.approvedByOperator
                            });
                            // Queue the repair task
                            const taskQueue = (0, taskQueue_1.getTaskQueue)();
                            const task = taskQueue.enqueue('repair-clone', {
                                cloneId,
                                repairId,
                                isDryRun: false,
                                validationId: req.body.validationId
                            });
                            return {
                                taskId: task.id,
                                repairId,
                                status: 'Queued'
                            };
                        }, 30);
                        return innerResult;
                    }
                    catch (lockError) {
                        if (lockError.message.includes('LOCK_CONFLICT')) {
                            const lockInfo = await (0, lockMiddleware_1.getLockInfo)(cloneLockId);
                            throw {
                                code: 'E006_CLONE_LOCKED',
                                status: 409,
                                lockInfo
                            };
                        }
                        throw lockError;
                    }
                }, 30);
                return res.status(202).json({
                    success: true,
                    data: {
                        cloneId,
                        repairId: repairResult.repairId,
                        isDryRun: false,
                        taskId: repairResult.taskId,
                        status: 'Queued',
                        message: 'Repair task queued'
                    },
                    message: 'Repair execution queued'
                });
            }
            catch (error) {
                if (error.code === 'E006_CLONE_LOCKED') {
                    return res.status(error.status).json({
                        success: false,
                        error: {
                            code: error.code,
                            message: 'Clone is currently in use',
                            details: { lockInfo: error.lockInfo },
                            timestamp: new Date().toISOString()
                        }
                    });
                }
                if (error.message.includes('LOCK_CONFLICT')) {
                    logger_1.default.warn(`[Repair] Repair lock conflict for clone: ${cloneId}`);
                    const lockInfo = await (0, lockMiddleware_1.getLockInfo)(repairLockId);
                    return res.status(409).json({
                        success: false,
                        error: {
                            code: 'E003_REPAIR_IN_PROGRESS',
                            message: 'Repair already in progress for this clone',
                            details: { lockInfo },
                            timestamp: new Date().toISOString()
                        }
                    });
                }
                throw error;
            }
        }
    }
    catch (error) {
        logger_1.default.error(`[Repair] Error executing repair: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: {
                code: 'E007_SERVICE_ERROR',
                message: 'Repair service error',
                details: { originalError: error.message },
                timestamp: new Date().toISOString()
            }
        });
    }
});
// GET - Get repair status
router.get('/:cloneId/repair-status', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const { repairId, taskId } = req.query;
        logger_1.default.info(`[Repair] Getting repair status for clone: ${cloneId}`);
        // Check if clone exists
        const clone = await psService.executeCommand('Get-FlashdbClone', {
            CloneId: cloneId
        });
        if (!clone) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'E001_CLONE_NOT_FOUND',
                    message: `Clone not found: ${cloneId}`,
                    timestamp: new Date().toISOString()
                }
            });
        }
        if (taskId && typeof taskId === 'string') {
            // Get task status from queue
            const taskQueue = (0, taskQueue_1.getTaskQueue)();
            const task = taskQueue.getTask(taskId);
            if (!task) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'E001_CLONE_NOT_FOUND',
                        message: `Repair task not found: ${taskId}`,
                        timestamp: new Date().toISOString()
                    }
                });
            }
            const taskResult = task.result || {};
            const taskDurationSeconds = task.completedAt && task.startedAt
                ? Math.round((new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 1000)
                : 0;
            const status = task.status === 'pending' ? 'Queued' :
                task.status === 'processing' ? 'InProgress' :
                    task.status === 'completed' ? (taskResult.status || 'Completed') :
                        'Failed';
            const result = task.status === 'completed' || task.status === 'failed'
                ? {
                    success: taskResult.success ?? (task.status === 'completed' && !task.error),
                    appliedActions: taskResult.appliedActions || taskResult.actions || [],
                    durationSeconds: taskResult.durationSeconds ?? taskDurationSeconds,
                    errors: taskResult.errors || (task.error ? [task.error] : [])
                }
                : undefined;
            return res.json({
                success: true,
                data: {
                    cloneId,
                    repairId: repairId || task.payload.repairId || taskId,
                    taskId,
                    status,
                    result,
                    completedAt: task.completedAt
                },
                message: 'Repair status retrieved'
            });
        }
        // Get repair status from audit service
        const auditService = (0, auditMetricsService_1.getAuditMetricsService)();
        const repairOperations = await auditService.getRepairOperations(cloneId);
        if (!repairOperations || repairOperations.length === 0) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'E001_CLONE_NOT_FOUND',
                    message: `No repair history found for clone: ${cloneId}`,
                    timestamp: new Date().toISOString()
                }
            });
        }
        const latestRepair = repairOperations[0];
        return res.json({
            success: true,
            data: {
                cloneId,
                repairId: latestRepair.id,
                status: latestRepair.status === 'pending'
                    ? 'Queued'
                    : latestRepair.status === 'completed'
                        ? 'Completed'
                        : 'Failed',
                result: latestRepair.status === 'completed' ? {
                    success: latestRepair.result === 'success',
                    appliedActions: [],
                    durationSeconds: latestRepair.completedAt ?
                        Math.round((new Date(latestRepair.completedAt).getTime() - new Date(latestRepair.timestamp).getTime()) / 1000) : 0,
                    errors: latestRepair.result === 'success' ? [] : ['Repair failed']
                } : undefined,
                completedAt: latestRepair.completedAt?.toISOString()
            },
            message: 'Repair status retrieved'
        });
    }
    catch (error) {
        logger_1.default.error(`[Repair] Error getting repair status: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: {
                code: 'E007_SERVICE_ERROR',
                message: 'Repair service error',
                details: { originalError: error.message },
                timestamp: new Date().toISOString()
            }
        });
    }
});
// POST - Cancel repair
router.post('/:cloneId/repair/cancel', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const repairId = req.query.repairId || req.body.repairId;
        const taskId = req.query.taskId || req.body.taskId;
        logger_1.default.info(`[Repair] Canceling repair for clone: ${cloneId}`);
        // Check if clone exists
        const clone = await psService.executeCommand('Get-FlashdbClone', {
            CloneId: cloneId
        });
        if (!clone) {
            return res.status(404).json({
                success: false,
                error: {
                    code: 'E001_CLONE_NOT_FOUND',
                    message: `Clone not found: ${cloneId}`,
                    timestamp: new Date().toISOString()
                }
            });
        }
        const taskQueue = (0, taskQueue_1.getTaskQueue)();
        const auditService = (0, auditMetricsService_1.getAuditMetricsService)();
        if (taskId && typeof taskId === 'string') {
            const task = taskQueue.getTask(taskId);
            if (!task) {
                return res.status(404).json({
                    success: false,
                    error: {
                        code: 'E001_CLONE_NOT_FOUND',
                        message: `Repair task not found: ${taskId}`,
                        timestamp: new Date().toISOString()
                    }
                });
            }
            if (task.status === 'completed' || task.status === 'failed') {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'E004_INVALID_REPAIR_STATE',
                        message: `Cannot cancel repair with status: ${task.status}`,
                        timestamp: new Date().toISOString()
                    }
                });
            }
            // Update task status
            taskQueue.updateTask(taskId, 'failed', undefined, 'Repair cancelled by user');
            // Record cancel
            await auditService.recordOperation({
                id: `audit-${taskId}-cancel`,
                type: 'repair-cancel',
                entityId: cloneId,
                status: 'completed',
                timestamp: new Date(),
                operatorId: req.user?.id
            });
        }
        return res.json({
            success: true,
            data: {
                cloneId,
                repairId: repairId || (typeof taskId === 'string' ? taskId : ''),
                status: 'Cancelled',
                message: 'Repair cancelled'
            },
            message: 'Repair cancelled successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`[Repair] Error canceling repair: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: {
                code: 'E007_SERVICE_ERROR',
                message: 'Repair service error',
                details: { originalError: error.message },
                timestamp: new Date().toISOString()
            }
        });
    }
});
exports.default = router;
//# sourceMappingURL=clones.js.map