import { Router, Request, Response } from 'express';
import { getCheckpointOperationRepository } from '../services/repository';
import logger from '../logger';

const router = Router();

/**
 * GET /operations
 * Query checkpoint operations by clone, type, and status
 * Query parameters:
 *   - cloneId (required): Filter by clone ID
 *   - operationType (optional): 'create', 'restore', or 'delete'
 *   - status (optional): 'pending', 'in-progress', 'completed', 'failed', 'rolled-back'
 *   - limit (optional): Max results, default 100
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { cloneId, operationType, status, limit = 100 } = req.query;

    if (!cloneId) {
      return res.status(400).json({
        success: false,
        message: 'cloneId is required'
      });
    }

    const operationRepo = getCheckpointOperationRepository();
    const operations = await operationRepo.listOperations(
      cloneId as string,
      operationType as string | undefined,
      status as string | undefined,
      parseInt(limit as string) || 100
    );

    logger.info(`Retrieved ${operations.length} checkpoint operations for clone ${cloneId}`);

    return res.json({
      success: true,
      data: operations,
      count: operations.length
    });
  } catch (error: any) {
    logger.error(`Error querying checkpoint operations: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /operations/:operationId
 * Get a specific checkpoint operation by ID
 */
router.get('/:operationId', async (req: Request, res: Response) => {
  try {
    const { operationId } = req.params;

    const operationRepo = getCheckpointOperationRepository();
    const operation = await operationRepo.getOperation(operationId);

    if (!operation) {
      return res.status(404).json({
        success: false,
        message: 'Operation not found'
      });
    }

    logger.info(`Retrieved checkpoint operation: ${operationId}`);

    return res.json({
      success: true,
      data: operation
    });
  } catch (error: any) {
    logger.error(`Error getting checkpoint operation: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /operations/checkpoint/:checkpointId/latest
 * Get the latest operation for a checkpoint
 */
router.get('/checkpoint/:checkpointId/latest', async (req: Request, res: Response) => {
  try {
    const { checkpointId } = req.params;

    const operationRepo = getCheckpointOperationRepository();
    const operation = await operationRepo.getLatestOperation(checkpointId);

    if (!operation) {
      return res.status(404).json({
        success: false,
        message: 'No operations found for this checkpoint'
      });
    }

    logger.info(`Retrieved latest operation for checkpoint: ${checkpointId}`);

    return res.json({
      success: true,
      data: operation
    });
  } catch (error: any) {
    logger.error(`Error getting latest checkpoint operation: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /operations/validation-history/:checkpointId
 * Get validation history for a checkpoint (Phase 3)
 * Returns all operations with validation data (hash comparison, rollback status)
 */
router.get('/validation-history/:checkpointId', async (req: Request, res: Response) => {
  try {
    const { checkpointId } = req.params;
    const { limit = 10 } = req.query;

    const operationRepo = getCheckpointOperationRepository();

    // Query operations for this checkpoint with validation data
    const operations = await operationRepo.listOperations(
      '',
      'restore',
      undefined,
      parseInt(limit as string) || 10
    );

    // Filter to include only operations with validation data
    const validationHistory = operations
      .filter((op: any) => {
        // Check if operation has validation-related fields
        return (op.preVhdxStateHash || op.postVhdxStateHash || op.validationStatus);
      })
      .map((op: any) => ({
        operationId: op.operationId || op.operation_id,
        checkpointId: op.checkpointId || op.checkpoint_id,
        preHash: op.preVhdxStateHash || op.pre_vhdx_state_hash,
        postHash: op.postVhdxStateHash || op.post_vhdx_state_hash,
        validationStatus: op.validationStatus || op.validation_status,
        validationError: op.validationError || op.validation_error,
        timestamp: op.timestamp || op.created_at,
        status: op.status
      }));

    logger.info(`Retrieved ${validationHistory.length} validation history records for checkpoint ${checkpointId}`);

    return res.json({
      success: true,
      data: validationHistory,
      count: validationHistory.length
    });
  } catch (error: any) {
    logger.error(`Error getting validation history: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
