"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pooledPowershellService_1 = require("../services/pooledPowershellService");
const taskQueue_1 = require("../services/taskQueue");
const logger_1 = __importDefault(require("../logger"));
const caching_1 = require("../middleware/caching");
const lockMiddleware_1 = require("../middleware/lockMiddleware");
const router = (0, express_1.Router)({ mergeParams: true });
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
// POST - Create checkpoint (queued)
router.post('/', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const { checkpointName, phase, description, force, useQueue = true } = req.body;
        if (!checkpointName) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: checkpointName'
            });
        }
        logger_1.default.info(`Creating checkpoint for clone ${cloneId}: ${checkpointName}`);
        // Lock on clone to prevent concurrent checkpoint operations
        const lockResourceId = `checkpoint:${cloneId}`;
        try {
            const { result: task, lockContext } = await (0, lockMiddleware_1.withLockRetry)(lockResourceId, async () => {
                // Use task queue for async processing
                if (useQueue !== false) {
                    const taskQueue = (0, taskQueue_1.getTaskQueue)();
                    const task = taskQueue.enqueue('create-checkpoint', {
                        cloneId,
                        checkpointName,
                        phase: phase || 'manual',
                        description,
                        force: force || false
                    });
                    // Invalidate cache for checkpoints and metrics
                    (0, caching_1.invalidateCache)(['/checkpoints', '/metrics']);
                    return task;
                }
                else {
                    // Synchronous mode (for backward compatibility)
                    const checkpoint = await psService.executeCommand('New-FlashdbCheckpoint', {
                        CloneId: cloneId,
                        CheckpointName: checkpointName,
                        Phase: phase || 'manual',
                        Description: description,
                        Force: force || false
                    });
                    // Invalidate cache for checkpoints and metrics
                    (0, caching_1.invalidateCache)(['/checkpoints', '/metrics']);
                    return checkpoint;
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
                message: useQueue !== false ? 'Checkpoint creation task queued successfully' : 'Checkpoint created successfully'
            });
        }
        catch (error) {
            if (error.message.includes('LOCK_TIMEOUT')) {
                logger_1.default.warn(`Checkpoint creation blocked - resource locked: ${lockResourceId}`);
                const lockInfo = await (0, lockMiddleware_1.getLockInfo)(lockResourceId);
                return res.status(408).json({
                    success: false,
                    message: 'Checkpoint operation timeout - another operation is in progress on this clone',
                    lockInfo
                });
            }
            throw error;
        }
    }
    catch (error) {
        logger_1.default.error(`Error creating checkpoint: ${error.message}`);
        return res.status(400).json({ success: false, message: error.message });
    }
});
// GET - List checkpoints for clone
router.get('/', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const checkpoints = await psService.executeCommand('Get-FlashdbCheckpoint', {
            CloneId: cloneId
        });
        return res.json({
            success: true,
            data: toResponseArray(checkpoints)
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving checkpoints: ${error.message}`);
        return res.status(500).json({ success: false, message: error.message });
    }
});
// POST - Restore checkpoint (queued)
router.post('/:checkpointId/restore', async (req, res) => {
    try {
        const { cloneId, checkpointId } = req.params;
        const { reattachAfter, useQueue = true } = req.body;
        logger_1.default.info(`Restoring checkpoint ${checkpointId} for clone ${cloneId}`);
        // Lock on clone to prevent concurrent checkpoint operations
        const lockResourceId = `checkpoint:${cloneId}`;
        try {
            const { result: task, lockContext } = await (0, lockMiddleware_1.withLockRetry)(lockResourceId, async () => {
                // Use task queue for async processing
                if (useQueue !== false) {
                    const taskQueue = (0, taskQueue_1.getTaskQueue)();
                    const task = taskQueue.enqueue('restore-checkpoint', {
                        cloneId,
                        checkpointId,
                        reattachAfter: reattachAfter !== false
                    });
                    // Invalidate cache for checkpoints and metrics
                    (0, caching_1.invalidateCache)(['/checkpoints', '/metrics']);
                    return task;
                }
                else {
                    // Synchronous mode (for backward compatibility)
                    await psService.executeCommandRaw('Restore-FlashdbCheckpoint', {
                        CloneId: cloneId,
                        CheckpointId: checkpointId,
                        ReattachAfter: reattachAfter !== false,
                        Force: true
                    });
                    // Invalidate cache for checkpoints and metrics
                    (0, caching_1.invalidateCache)(['/checkpoints', '/metrics']);
                    return { success: true, message: 'Checkpoint restored successfully' };
                }
            });
            const isQueued = useQueue !== false;
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
                message: isQueued ? 'Checkpoint restore task queued successfully' : 'Checkpoint restored successfully'
            });
        }
        catch (error) {
            if (error.message.includes('LOCK_TIMEOUT')) {
                logger_1.default.warn(`Checkpoint restore blocked - resource locked: ${lockResourceId}`);
                const lockInfo = await (0, lockMiddleware_1.getLockInfo)(lockResourceId);
                return res.status(408).json({
                    success: false,
                    message: 'Checkpoint operation timeout - another operation is in progress on this clone',
                    lockInfo
                });
            }
            throw error;
        }
    }
    catch (error) {
        logger_1.default.error(`Error restoring checkpoint: ${error.message}`);
        return res.status(400).json({ success: false, message: error.message });
    }
});
// PATCH - Update checkpoint (labels, favorite)
router.patch('/:checkpointId', async (req, res) => {
    try {
        const { cloneId, checkpointId } = req.params;
        const { isFavorite, labels } = req.body;
        const params = {
            CloneId: cloneId,
            CheckpointId: checkpointId
        };
        if (typeof isFavorite === 'boolean')
            params.IsFavorite = isFavorite;
        if (Array.isArray(labels)) {
            params.Labels = labels;
        }
        else if (typeof labels === 'string') {
            params.Labels = labels
                .split(',')
                .map(label => label.trim())
                .filter(Boolean);
        }
        await psService.executeCommandRaw('Set-FlashdbCheckpoint', params);
        // Invalidate cache for checkpoints
        (0, caching_1.invalidateCache)(['/checkpoints']);
        return res.json({
            success: true,
            message: 'Checkpoint updated successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error updating checkpoint: ${error.message}`);
        return res.status(400).json({ success: false, message: error.message });
    }
});
// DELETE - Delete checkpoint (async queued operation)
router.delete('/:checkpointId', async (req, res) => {
    try {
        const { cloneId, checkpointId } = req.params;
        const { cascadeDelete = false, force = false } = req.body || {};
        logger_1.default.info(`Deleting checkpoint ${checkpointId} for clone ${cloneId} (cascadeDelete: ${cascadeDelete}, force: ${force})`);
        // Lock on clone to prevent concurrent checkpoint operations
        const lockResourceId = `checkpoint:${cloneId}`;
        try {
            const { result: task, lockContext } = await (0, lockMiddleware_1.withLockRetry)(lockResourceId, async () => {
                // Validate checkpoint exists and get metadata
                const checkpoint = await psService.executeCommand('Get-FlashdbCheckpoint', {
                    CloneId: cloneId,
                    CheckpointId: checkpointId
                });
                if (!checkpoint) {
                    throw new Error('Checkpoint not found');
                }
                // Check for cascade: query child checkpoints (stub - will be implemented with DB in Step 5)
                // For now, just proceed with async deletion
                if (!force) {
                    logger_1.default.debug(`Cascade delete check requested for ${checkpointId} (will be implemented in Step 3)`);
                }
                // Queue async deletion task
                const taskQueue = (0, taskQueue_1.getTaskQueue)();
                const deleteTask = taskQueue.enqueue('delete-checkpoint', {
                    cloneId,
                    checkpointId,
                    vhdxPath: checkpoint.vhdxPath || '',
                    stateHash: checkpoint.stateHash,
                    cascadeDelete
                });
                return deleteTask;
            });
            // Invalidate cache for checkpoints and metrics
            (0, caching_1.invalidateCache)(['/checkpoints', '/metrics']);
            res.set('Lock-Wait-Time-Ms', lockContext.waitTimeMs.toString());
            return res.status(202).json({
                success: true,
                message: 'Checkpoint deletion task queued successfully',
                data: {
                    taskId: task.id,
                    status: task.status,
                    createdAt: task.createdAt,
                    estimatedCompletionMs: 1800000 // 30 minutes for typical checkpoint
                },
                checkpointInfo: {
                    id: checkpointId,
                    name: task.payload?.checkpointName || 'Unknown'
                }
            });
        }
        catch (error) {
            if (error.message.includes('LOCK_TIMEOUT')) {
                logger_1.default.warn(`Checkpoint deletion blocked - resource locked: ${lockResourceId}`);
                const lockInfo = await (0, lockMiddleware_1.getLockInfo)(lockResourceId);
                return res.status(408).json({
                    success: false,
                    message: 'Checkpoint operation timeout - another operation is in progress on this clone',
                    lockInfo
                });
            }
            throw error;
        }
    }
    catch (error) {
        logger_1.default.error(`Error deleting checkpoint: ${error.message}`);
        return res.status(400).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=checkpoints.js.map