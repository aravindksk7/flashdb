"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pooledPowershellService_1 = require("../services/pooledPowershellService");
const logger_1 = __importDefault(require("../logger"));
const router = (0, express_1.Router)();
const psService = (0, pooledPowershellService_1.getPooledPowerShellService)();
/**
 * POST /api/batches
 * Create a new batch operation
 */
router.post('/', async (req, res) => {
    try {
        const { operationType, operations, concurrencyLimit = 3, storagePath } = req.body;
        // Validate required fields
        if (!operationType) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: operationType (clone-batch|checkpoint-batch|delete-batch|restore-batch)'
            });
        }
        if (!Array.isArray(operations) || operations.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: operations (non-empty array)'
            });
        }
        if (!storagePath) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: storagePath'
            });
        }
        // Validate operation type
        const validTypes = ['clone-batch', 'checkpoint-batch', 'delete-batch', 'restore-batch'];
        if (!validTypes.includes(operationType)) {
            return res.status(400).json({
                success: false,
                message: `Invalid operationType. Must be one of: ${validTypes.join(', ')}`
            });
        }
        // Validate concurrency limit
        if (concurrencyLimit < 1 || concurrencyLimit > 10) {
            return res.status(400).json({
                success: false,
                message: 'concurrencyLimit must be between 1 and 10'
            });
        }
        logger_1.default.info(`Creating batch operation: ${operationType} with ${operations.length} operations`);
        const batch = await psService.executeCommand('New-FlashdbBatchOperation', {
            OperationType: operationType,
            Operations: operations,
            ConcurrencyLimit: concurrencyLimit,
            StoragePath: storagePath
        });
        return res.status(201).json({
            success: true,
            data: batch,
            message: 'Batch operation created successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error creating batch: ${error.message}`);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * GET /api/batches
 * List all batches, optionally filtered by state
 */
router.get('/', async (req, res) => {
    try {
        const { storagePath, state } = req.query;
        if (!storagePath) {
            return res.status(400).json({
                success: false,
                message: 'Missing required query parameter: storagePath'
            });
        }
        logger_1.default.info(`Retrieving batches${state ? ` with state: ${state}` : ''}`);
        const batches = await psService.executeCommand('Get-FlashdbBatchOperations', {
            StoragePath: storagePath,
            ...(state && { State: state })
        });
        return res.json({
            success: true,
            data: Array.isArray(batches) ? batches : (batches ? [batches] : []),
            message: 'Batches retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving batches: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * GET /api/batches/:batchId
 * Get status of a specific batch
 */
router.get('/:batchId', async (req, res) => {
    try {
        const { batchId } = req.params;
        const { storagePath } = req.query;
        if (!storagePath) {
            return res.status(400).json({
                success: false,
                message: 'Missing required query parameter: storagePath'
            });
        }
        logger_1.default.info(`Retrieving batch status: ${batchId}`);
        const batch = await psService.executeCommand('Get-FlashdbBatchOperation', {
            BatchId: batchId,
            StoragePath: storagePath
        });
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: `Batch not found: ${batchId}`
            });
        }
        return res.json({
            success: true,
            data: batch,
            message: 'Batch retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving batch: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * POST /api/batches/:batchId/start
 * Start executing a batch operation
 */
router.post('/:batchId/start', async (req, res) => {
    try {
        const { batchId } = req.params;
        const { storagePath } = req.body;
        if (!storagePath) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: storagePath'
            });
        }
        logger_1.default.info(`Starting batch execution: ${batchId}`);
        const result = await psService.executeCommand('Start-FlashdbBatchQueue', {
            BatchId: batchId,
            StoragePath: storagePath
        });
        return res.json({
            success: true,
            data: result,
            message: 'Batch execution started successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error starting batch: ${error.message}`);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * POST /api/batches/:batchId/cancel
 * Cancel a running batch operation
 */
router.post('/:batchId/cancel', async (req, res) => {
    try {
        const { batchId } = req.params;
        const { storagePath } = req.body;
        if (!storagePath) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: storagePath'
            });
        }
        logger_1.default.info(`Cancelling batch: ${batchId}`);
        const result = await psService.executeCommand('Cancel-FlashdbBatchOperation', {
            BatchId: batchId,
            StoragePath: storagePath
        });
        return res.json({
            success: true,
            data: result,
            message: 'Batch cancelled successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error cancelling batch: ${error.message}`);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * GET /api/batches/:batchId/results
 * Get results from a completed batch
 */
router.get('/:batchId/results', async (req, res) => {
    try {
        const { batchId } = req.params;
        const { storagePath, includeErrors = 'true' } = req.query;
        if (!storagePath) {
            return res.status(400).json({
                success: false,
                message: 'Missing required query parameter: storagePath'
            });
        }
        logger_1.default.info(`Retrieving batch results: ${batchId}`);
        const results = await psService.executeCommand('Get-FlashdbBatchResults', {
            BatchId: batchId,
            StoragePath: storagePath,
            IncludeErrors: includeErrors === 'true'
        });
        return res.json({
            success: true,
            data: results,
            message: 'Batch results retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving batch results: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * GET /api/batches/:batchId/progress
 * Get real-time progress of a running batch
 */
router.get('/:batchId/progress', async (req, res) => {
    try {
        const { batchId } = req.params;
        const { storagePath } = req.query;
        if (!storagePath) {
            return res.status(400).json({
                success: false,
                message: 'Missing required query parameter: storagePath'
            });
        }
        logger_1.default.info(`Retrieving batch progress: ${batchId}`);
        const batch = await psService.executeCommand('Get-FlashdbBatchOperation', {
            BatchId: batchId,
            StoragePath: storagePath
        });
        if (!batch) {
            return res.status(404).json({
                success: false,
                message: `Batch not found: ${batchId}`
            });
        }
        // Calculate progress
        const progress = {
            batchId: batch.id,
            state: batch.state,
            totalOperations: batch.totalOperations,
            completedOperations: batch.completedOperations,
            failedOperations: batch.failedOperations,
            cancelledOperations: batch.cancelledOperations,
            percentComplete: batch.totalOperations > 0
                ? Math.round(((batch.completedOperations + batch.failedOperations + batch.cancelledOperations) / batch.totalOperations) * 100)
                : 0,
            createdAt: batch.createdAt,
            startedAt: batch.startedAt,
            completedAt: batch.completedAt,
            operationStatuses: batch.operations?.map((op) => ({
                index: op.index,
                status: op.status,
                startTime: op.startTime,
                endTime: op.endTime,
                error: op.error ? op.error.substring(0, 200) : undefined // Truncate errors for progress view
            }))
        };
        return res.json({
            success: true,
            data: progress,
            message: 'Batch progress retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving batch progress: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=batch.js.map