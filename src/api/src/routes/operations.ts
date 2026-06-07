import { Router, Request, Response } from 'express';
import { getCheckpointOperationRepository } from '../services/repository';
import { getTaskQueue, Task } from '../services/taskQueue';
import logger from '../logger';

const router = Router();

type TimelineOperation = {
  id: string;
  cloneId: string;
  checkpointId: string;
  checkpointName: string;
  type: 'create' | 'restore' | 'delete' | string;
  status: string;
  timestamp: string;
  completedAt?: string | null;
  message?: string | null;
  source: 'repository' | 'queue';
};

const checkpointTaskTypes = new Set(['create-checkpoint', 'restore-checkpoint', 'delete-checkpoint']);

function toIsoString(value: any): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeOperationType(value: any): string {
  const operationType = String(value || '').replace('-checkpoint', '');
  if (operationType === 'create' || operationType === 'restore' || operationType === 'delete') {
    return operationType;
  }
  return operationType || 'unknown';
}

function stripAnsi(value: any): string | null {
  if (!value) return null;
  return String(value).replace(/\u001b\[[0-9;]*m/g, '').trim();
}

function mapRepositoryOperation(op: any): TimelineOperation {
  const status = op.status || 'unknown';
  return {
    id: op.id || op.operationId || op.operation_id,
    cloneId: op.cloneId || op.clone_id,
    checkpointId: op.checkpointId || op.checkpoint_id || '',
    checkpointName: op.checkpointName || op.checkpoint_name || op.checkpointId || op.checkpoint_id || 'Unknown',
    type: normalizeOperationType(op.operationType || op.operation_type),
    status,
    timestamp: toIsoString(op.startedAt || op.started_at || op.createdAt || op.created_at) || new Date().toISOString(),
    completedAt: toIsoString(op.completedAt || op.completed_at) || null,
    message: stripAnsi(op.errorMessage || op.error_message) || (status === 'completed' ? 'Operation completed successfully' : null),
    source: 'repository'
  };
}

function mapQueueTask(task: Task): TimelineOperation {
  const type = normalizeOperationType(task.type);
  const checkpointId = String(task.payload.checkpointId || '');
  const checkpointName = String(
    task.payload.checkpointName ||
    task.payload.name ||
    checkpointId ||
    (type === 'create' ? 'New restore point' : 'Restore point')
  );

  return {
    id: task.id,
    cloneId: String(task.payload.cloneId || ''),
    checkpointId,
    checkpointName,
    type,
    status: task.status,
    timestamp: task.startedAt || task.createdAt,
    completedAt: task.completedAt,
    message: stripAnsi(task.error) || (task.status === 'completed' ? 'Operation completed successfully' : null),
    source: 'queue'
  };
}

function getQueueOperations(): TimelineOperation[] {
  const taskQueue = getTaskQueue();
  const { queue, completed, failed } = taskQueue.getAllTasks();

  return [...queue, ...completed, ...failed]
    .filter(task => checkpointTaskTypes.has(task.type))
    .map(mapQueueTask);
}

function getQueueOperationsForClone(cloneId: string): TimelineOperation[] {
  return getQueueOperations().filter(operation => operation.cloneId === cloneId);
}

function dedupeAndSortTimeline(operations: TimelineOperation[], limit: number): TimelineOperation[] {
  const byId = new Map<string, TimelineOperation>();
  for (const operation of operations) {
    if (!operation.id) continue;

    const existing = byId.get(operation.id);
    if (!existing || existing.source === 'queue') {
      byId.set(operation.id, operation);
    }
  }

  return Array.from(byId.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);
}

/**
 * GET /operations
 * Query checkpoint operations by clone or checkpoint, type, and status
 * Query parameters:
 *   - cloneId (optional): Filter by clone ID
 *   - checkpointId (optional): Filter by checkpoint ID
 *   - operationType (optional): 'create', 'restore', or 'delete'
 *   - status (optional): 'pending', 'in-progress', 'completed', 'failed', 'rolled-back'
 *   - limit (optional): Max results, default 100
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { cloneId, checkpointId, operationType, status, limit = 100 } = req.query;

    const operationRepo = getCheckpointOperationRepository();

    const parsedLimit = parseInt(limit as string) || 100;

    // Query by checkpoint if checkpointId provided, otherwise by cloneId
    let operations: any[] = [];

    if (checkpointId) {
      // Query all operations and filter by checkpoint
      const allOps = await operationRepo.listOperations(
        '',
        operationType as string | undefined,
        status as string | undefined,
        parsedLimit
      );
      operations = allOps.filter((op: any) =>
        (op.checkpointId || op.checkpoint_id) === checkpointId
      );
      logger.info(`Retrieved ${operations.length} checkpoint operations for checkpoint ${checkpointId}`);
    } else if (cloneId) {
      operations = await operationRepo.listOperations(
        cloneId as string,
        operationType as string | undefined,
        status as string | undefined,
        parsedLimit
      );
      logger.info(`Retrieved ${operations.length} checkpoint operations for clone ${cloneId}`);
    } else {
      logger.info('Retrieving all queued checkpoint operations');
    }

    let data: any[] = operations;
    const queueOperations = (cloneId ? getQueueOperationsForClone(cloneId as string) : getQueueOperations())
      .filter(op => !checkpointId || op.checkpointId === checkpointId)
      .filter(op => !operationType || op.type === operationType)
      .filter(op => !status || op.status === status);

    data = dedupeAndSortTimeline(
      [
        ...operations.map(mapRepositoryOperation),
        ...queueOperations
      ],
      parsedLimit
    );

    return res.json({
      success: true,
      data,
      count: data.length
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
 * GET /operations/timeline/:cloneId
 * Get complete timeline of all operations for a clone
 * Returns: clone created, checkpoints created, checkpoints restored, checkpoints deleted
 */
router.get('/timeline/:cloneId', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const { limit = 100 } = req.query;

    const parsedLimit = parseInt(limit as string) || 100;
    const operationRepo = getCheckpointOperationRepository();

    // Get all checkpoint operations for this clone
    const operations = await operationRepo.listOperations(
      cloneId,
      undefined,
      undefined,
      parsedLimit
    );

    const timeline = dedupeAndSortTimeline(
      [
        ...operations.map(mapRepositoryOperation),
        ...getQueueOperationsForClone(cloneId)
      ],
      parsedLimit
    );

    logger.info(`Retrieved timeline with ${timeline.length} operations for clone ${cloneId}`);

    return res.json({
      success: true,
      data: timeline,
      count: timeline.length,
      cloneId
    });
  } catch (error: any) {
    logger.error(`Error getting timeline: ${error.message}`);
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
