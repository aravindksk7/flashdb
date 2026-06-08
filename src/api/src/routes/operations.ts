import { Router, Request, Response } from 'express';
import { getCheckpointOperationRepository } from '../services/repository';
import { getTaskQueue, Task } from '../services/taskQueue';
import { getSqlClient } from '../services/sqlClient';
import logger from '../logger';

const router = Router();

type TimelineOperation = {
  id: string;
  cloneId: string;
  checkpointId: string;
  checkpointName: string;
  type: 'create' | 'restore' | 'delete' | 'validation' | 'repair' | string;
  status: string;
  timestamp: string;
  completedAt?: string | null;
  message?: string | null;
  source: 'repository' | 'queue' | 'audit';
  findingsCount?: number;
  validationStatus?: 'healthy' | 'unhealthy';
  repairStatus?: string;
};

const operationTaskTypes = new Set([
  'create-clone',
  'delete-clone',
  'create-checkpoint',
  'restore-checkpoint',
  'delete-checkpoint',
  'validate-clone',
  'repair-clone',
  'validate-all-clones',
  'validation-start',
  'validation-complete',
  'repair-start',
  'repair-execute',
  'repair-complete',
  'repair-plan'
]);

function toIsoString(value: any): string | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeOperationType(value: any): string {
  const operationType = String(value || '');
  const mappedTypes: Record<string, string> = {
    'create-checkpoint': 'create',
    'restore-checkpoint': 'restore',
    'delete-checkpoint': 'delete',
    'validate-clone': 'validation',
    'validate-all-clones': 'validation',
    'repair-clone': 'repair',
    'validation-start': 'validation',
    'validation-complete': 'validation',
    'repair-start': 'repair',
    'repair-execute': 'repair',
    'repair-complete': 'repair',
    'repair-plan': 'repair'
  };

  if (mappedTypes[operationType]) {
    return mappedTypes[operationType];
  }

  return operationType || 'unknown';
}

function stripAnsi(value: any): string | null {
  if (!value) return null;
  return String(value).replace(/\u001b\[[0-9;]*m/g, '').trim();
}

function parseJsonField(value: any): any {
  if (!value || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeHealthStatus(value: any): 'healthy' | 'unhealthy' | undefined {
  if (!value) return undefined;
  const normalized = String(value).toLowerCase();
  if (normalized === 'healthy' || normalized === 'success') return 'healthy';
  if (normalized === 'unhealthy' || normalized === 'failed' || normalized === 'failure') return 'unhealthy';
  return undefined;
}

function getTaskLabel(type: string, payload: Record<string, any>): string {
  if (type === 'validation') return `Clone validation (${payload.cloneId || 'Unknown'})`;
  if (type === 'repair') return `Clone repair (${payload.cloneId || 'Unknown'})`;
  if (type === 'create-clone') return payload.name || payload.cloneName || 'Clone creation';
  if (type === 'delete-clone') return payload.name || payload.cloneName || 'Clone deletion';
  if (type === 'create') return payload.checkpointName || payload.name || 'New restore point';
  if (type === 'restore') return payload.checkpointName || payload.name || 'Restore point';
  if (type === 'delete') return payload.checkpointName || payload.name || 'Restore point';
  return payload.name || 'Operation';
}

function getTaskMessage(task: Task, type: string, result: any): string | null {
  const error = stripAnsi(task.error);
  if (error) return error;

  if (task.status !== 'completed') return null;

  if (type === 'validation') {
    const status = result?.status ? `: ${result.status}` : '';
    return `Validation completed${status}`;
  }

  if (type === 'repair') {
    const status = result?.status ? `: ${result.status}` : '';
    return `Repair completed${status}`;
  }

  return stripAnsi(result?.message) || 'Operation completed successfully';
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
  const payload = task.payload || {};
  const result = task.result || {};
  const checkpointId = String(payload.checkpointId || payload.validationId || payload.repairId || '');
  const checkpointName = String(payload.checkpointName || getTaskLabel(type, payload));
  const findingsCount = Array.isArray(result.findings)
    ? result.findings.length
    : typeof result.findingsCount === 'number'
      ? result.findingsCount
      : undefined;
  const validationStatus = type === 'validation'
    ? normalizeHealthStatus(result.status || result.result)
    : undefined;
  const repairStatus = type === 'repair'
    ? String(result.status || (task.status === 'completed' ? 'Completed' : task.status))
    : undefined;

  return {
    id: task.id,
    cloneId: String(payload.cloneId || result.cloneId || ''),
    checkpointId,
    checkpointName,
    type,
    status: task.status,
    timestamp: task.startedAt || task.createdAt,
    completedAt: task.completedAt,
    message: getTaskMessage(task, type, result),
    source: 'queue',
    findingsCount,
    validationStatus,
    repairStatus
  };
}

function getQueueOperations(): TimelineOperation[] {
  const taskQueue = getTaskQueue();
  const { queue, completed, failed } = taskQueue.getAllTasks();

  return [...queue, ...completed, ...failed]
    .filter(task => operationTaskTypes.has(task.type))
    .map(mapQueueTask);
}

async function getPersistentQueueOperations(limit: number): Promise<TimelineOperation[]> {
  try {
    const sqlClient = getSqlClient();
    const result = await sqlClient.query<any>(
      `SELECT TOP (@limit)
          [id],
          [type],
          [status],
          [payload],
          [retryCount],
          [createdAt],
          [startedAt],
          [completedAt],
          [error],
          [result]
       FROM (
          SELECT
            [id],
            [type],
            [status],
            [payload],
            [retry_count] AS [retryCount],
            [created_at] AS [createdAt],
            [started_at] AS [startedAt],
            [completed_at] AS [completedAt],
            [error],
            [result]
          FROM [dbo].[flashdb_queue]
          UNION ALL
          SELECT
            [id],
            [type],
            [status],
            [payload],
            [retry_count] AS [retryCount],
            [created_at] AS [createdAt],
            [started_at] AS [startedAt],
            [completed_at] AS [completedAt],
            [error],
            [result]
          FROM [dbo].[flashdb_queue_archive]
       ) AS tasks
       WHERE [type] IN (
          'create-clone',
          'delete-clone',
          'create-checkpoint',
          'restore-checkpoint',
          'delete-checkpoint',
          'validate-clone',
          'repair-clone',
          'validate-all-clones',
          'validation-start',
          'validation-complete',
          'repair-start',
          'repair-execute',
          'repair-complete',
          'repair-plan'
       )
       ORDER BY COALESCE([completedAt], [startedAt], [createdAt]) DESC`,
      { limit }
    );

    return (result.recordset || []).map(row => mapQueueTask({
      id: row.id,
      type: row.type,
      status: row.status,
      payload: parseJsonField(row.payload) || {},
      createdAt: toIsoString(row.createdAt) || new Date().toISOString(),
      startedAt: toIsoString(row.startedAt) || null,
      completedAt: toIsoString(row.completedAt) || null,
      error: row.error || null,
      result: parseJsonField(row.result),
      retryCount: row.retryCount || 0
    } as Task));
  } catch (error: any) {
    logger.debug(`Persistent queue operations unavailable: ${error.message}`);
    return [];
  }
}

async function getPersistedAuditOperations(cloneId?: string, limit: number = 250): Promise<TimelineOperation[]> {
  try {
    const sqlClient = getSqlClient();

    let query = `SELECT TOP (@limit)
      [id],
      [operationType],
      [targetId],
      [status],
      [startedAt],
      [completedAt],
      [errorMessage]
     FROM [dbo].[OperationMetrics]`;

    const params: Record<string, any> = { limit };

    if (cloneId) {
      query += ` WHERE [targetId] = @targetId`;
      params.targetId = cloneId;
    }

    query += ` ORDER BY [startedAt] DESC`;

    const result = await sqlClient.query<any>(query, params);

    return (result.recordset || []).map(row => {
      const normalizedType = normalizeOperationType(row.operationType);
      return {
        id: row.id,
        cloneId: row.targetId || '',
        checkpointId: '',
        checkpointName: getTaskLabel(normalizedType, { cloneId: row.targetId }),
        type: normalizedType,
        status: row.status || 'unknown',
        timestamp: toIsoString(row.startedAt) || new Date().toISOString(),
        completedAt: toIsoString(row.completedAt) || null,
        message: row.errorMessage || null,
        source: 'audit' as const
      } as TimelineOperation;
    });
  } catch (error: any) {
    logger.debug(`Persisted audit operations unavailable: ${error.message}`);
    return [];
  }
}

async function listCheckpointOperationsSafely(
  operationRepo: any,
  cloneId: string,
  operationType: string | undefined,
  status: string | undefined,
  limit: number
): Promise<any[]> {
  try {
    return await operationRepo.listOperations(cloneId, operationType, status, limit);
  } catch (error: any) {
    logger.warn(`Checkpoint operation history unavailable: ${error.message}`);
    return [];
  }
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
      const allOps = await listCheckpointOperationsSafely(
        operationRepo,
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
      operations = await listCheckpointOperationsSafely(
        operationRepo,
        cloneId as string,
        operationType as string | undefined,
        status as string | undefined,
        parsedLimit
      );
      logger.info(`Retrieved ${operations.length} checkpoint operations for clone ${cloneId}`);
    } else {
      operations = await listCheckpointOperationsSafely(
        operationRepo,
        '',
        operationType as string | undefined,
        status as string | undefined,
        parsedLimit
      );
      logger.info(`Retrieved ${operations.length} checkpoint operations across all clones`);
    }

    const persistentQueueOperations = await getPersistentQueueOperations(parsedLimit);
    const allQueueOperations = [
      ...persistentQueueOperations,
      ...(cloneId ? getQueueOperationsForClone(cloneId as string) : getQueueOperations())
    ];
    const queueOperations = allQueueOperations
      .filter(op => !cloneId || op.cloneId === cloneId)
      .filter(op => !checkpointId || op.checkpointId === checkpointId)
      .filter(op => !operationType || op.type === operationType)
      .filter(op => !status || op.status === status);

    // Also retrieve persisted audit operations from OperationMetrics table
    const auditOperations = await getPersistedAuditOperations(
      cloneId as string | undefined,
      parsedLimit
    );

    const data = dedupeAndSortTimeline(
      [
        ...operations.map(mapRepositoryOperation),
        ...queueOperations,
        ...auditOperations
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
