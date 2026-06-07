import { Router, Request, Response } from 'express';
import { getPooledPowerShellService } from '../services/pooledPowershellService';
import { getTaskQueue } from '../services/taskQueue';
import logger from '../logger';
import { invalidateCache } from '../middleware/caching';
import { withLockRetry, getLockInfo } from '../middleware/lockMiddleware';

const router = Router({ mergeParams: true });
const psService = getPooledPowerShellService();

const toResponseArray = (value: any): any[] => {
  if (value == null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.filter(item => {
    if (item == null) return false;
    return typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length > 0;
  });
};

// POST - Create checkpoint (queued)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const { checkpointName, phase, description, force, useQueue = true } = req.body;

    if (!checkpointName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: checkpointName'
      });
    }

    logger.info(`Creating checkpoint for clone ${cloneId}: ${checkpointName}`);

    // Lock on clone to prevent concurrent checkpoint operations
    const lockResourceId = `checkpoint:${cloneId}`;

    try {
      const { result: task, lockContext } = await withLockRetry(lockResourceId, async () => {
        // Use task queue for async processing
        if (useQueue !== false) {
          const taskQueue = getTaskQueue();
          const task = taskQueue.enqueue('create-checkpoint', {
            cloneId,
            checkpointName,
            phase: phase || 'manual',
            description,
            force: force || false
          });

          // Invalidate cache for checkpoints and metrics
          invalidateCache(['/checkpoints', '/metrics']);

          return task;
        } else {
          // Synchronous mode (for backward compatibility)
          const checkpoint = await psService.executeCommand('New-FlashdbCheckpoint', {
            CloneId: cloneId,
            CheckpointName: checkpointName,
            Phase: phase || 'manual',
            Description: description,
            Force: force || false
          });

          // Invalidate cache for checkpoints and metrics
          invalidateCache(['/checkpoints', '/metrics']);

          return checkpoint;
        }
      });

      const responseCode = useQueue !== false ? 202 : 201;
      const responseData = useQueue !== false
        ? {
            taskId: (task as any).id,
            status: (task as any).status,
            createdAt: (task as any).createdAt
          }
        : task;

      res.set('Lock-Wait-Time-Ms', lockContext.waitTimeMs.toString());
      return res.status(responseCode).json({
        success: true,
        data: responseData,
        message: useQueue !== false ? 'Checkpoint creation task queued successfully' : 'Checkpoint created successfully'
      });
    } catch (error: any) {
      if (error.message.includes('LOCK_TIMEOUT')) {
        logger.warn(`Checkpoint creation blocked - resource locked: ${lockResourceId}`);
        const lockInfo = await getLockInfo(lockResourceId);
        return res.status(408).json({
          success: false,
          message: 'Checkpoint operation timeout - another operation is in progress on this clone',
          lockInfo
        });
      }
      throw error;
    }
  } catch (error: any) {
    logger.error(`Error creating checkpoint: ${error.message}`);
    return res.status(400).json({ success: false, message: error.message });
  }
});

// GET - List checkpoints for clone
router.get('/', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const checkpoints = await psService.executeCommand('Get-FlashdbCheckpoint', {
      CloneId: cloneId
    });

    return res.json({
      success: true,
      data: toResponseArray(checkpoints)
    });
  } catch (error: any) {
    logger.error(`Error retrieving checkpoints: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// POST - Restore checkpoint (queued)
router.post('/:checkpointId/restore', async (req: Request, res: Response) => {
  try {
    const { cloneId, checkpointId } = req.params;
    const { reattachAfter, useQueue = true } = req.body;

    logger.info(`Restoring checkpoint ${checkpointId} for clone ${cloneId}`);

    // Lock on clone to prevent concurrent checkpoint operations
    const lockResourceId = `checkpoint:${cloneId}`;

    try {
      const { result: task, lockContext } = await withLockRetry(lockResourceId, async () => {
        // Use task queue for async processing
        if (useQueue !== false) {
          const taskQueue = getTaskQueue();
          const task = taskQueue.enqueue('restore-checkpoint', {
            cloneId,
            checkpointId,
            reattachAfter: reattachAfter !== false
          });

          // Invalidate cache for checkpoints and metrics
          invalidateCache(['/checkpoints', '/metrics']);

          return task;
        } else {
          // Synchronous mode (for backward compatibility)
          await psService.executeCommandRaw('Restore-FlashdbCheckpoint', {
            CloneId: cloneId,
            CheckpointId: checkpointId,
            ReattachAfter: reattachAfter !== false,
            Force: true
          });

          // Invalidate cache for checkpoints and metrics
          invalidateCache(['/checkpoints', '/metrics']);

          return { success: true, message: 'Checkpoint restored successfully' };
        }
      });

      const isQueued = useQueue !== false;
      const responseData = isQueued
        ? {
            taskId: (task as any).id,
            status: (task as any).status,
            createdAt: (task as any).createdAt
          }
        : task;

      res.set('Lock-Wait-Time-Ms', lockContext.waitTimeMs.toString());
      return res.status(isQueued ? 202 : 200).json({
        success: true,
        data: responseData,
        message: isQueued ? 'Checkpoint restore task queued successfully' : 'Checkpoint restored successfully'
      });
    } catch (error: any) {
      if (error.message.includes('LOCK_TIMEOUT')) {
        logger.warn(`Checkpoint restore blocked - resource locked: ${lockResourceId}`);
        const lockInfo = await getLockInfo(lockResourceId);
        return res.status(408).json({
          success: false,
          message: 'Checkpoint operation timeout - another operation is in progress on this clone',
          lockInfo
        });
      }
      throw error;
    }
  } catch (error: any) {
    logger.error(`Error restoring checkpoint: ${error.message}`);
    return res.status(400).json({ success: false, message: error.message });
  }
});

// PATCH - Update checkpoint (labels, favorite)
router.patch('/:checkpointId', async (req: Request, res: Response) => {
  try {
    const { cloneId, checkpointId } = req.params;
    const { isFavorite, labels } = req.body;

    const params: any = {
      CloneId: cloneId,
      CheckpointId: checkpointId
    };
    if (typeof isFavorite === 'boolean') params.IsFavorite = isFavorite;
    if (Array.isArray(labels)) {
      params.Labels = labels;
    } else if (typeof labels === 'string') {
      params.Labels = labels
        .split(',')
        .map(label => label.trim())
        .filter(Boolean);
    }

    await psService.executeCommandRaw('Set-FlashdbCheckpoint', params);

    // Invalidate cache for checkpoints
    invalidateCache(['/checkpoints']);

    return res.json({
      success: true,
      message: 'Checkpoint updated successfully'
    });
  } catch (error: any) {
    logger.error(`Error updating checkpoint: ${error.message}`);
    return res.status(400).json({ success: false, message: error.message });
  }
});

// DELETE - Delete checkpoint (async queued operation)
router.delete('/:checkpointId', async (req: Request, res: Response) => {
  try {
    const { cloneId, checkpointId } = req.params;
    const { cascadeDelete = false, force = false } = req.body || {};

    logger.info(`Deleting checkpoint ${checkpointId} for clone ${cloneId} (cascadeDelete: ${cascadeDelete}, force: ${force})`);

    // Lock on clone to prevent concurrent checkpoint operations
    const lockResourceId = `checkpoint:${cloneId}`;

    try {
      const { result: task, lockContext } = await withLockRetry(lockResourceId, async () => {
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
          logger.debug(`Cascade delete check requested for ${checkpointId} (will be implemented in Step 3)`);
        }

        // Queue async deletion task
        const taskQueue = getTaskQueue();
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
      invalidateCache(['/checkpoints', '/metrics']);

      res.set('Lock-Wait-Time-Ms', lockContext.waitTimeMs.toString());
      return res.status(202).json({
        success: true,
        message: 'Checkpoint deletion task queued successfully',
        data: {
          taskId: (task as any).id,
          status: (task as any).status,
          createdAt: (task as any).createdAt,
          estimatedCompletionMs: 1800000  // 30 minutes for typical checkpoint
        },
        checkpointInfo: {
          id: checkpointId,
          name: (task as any).payload?.checkpointName || 'Unknown'
        }
      });
    } catch (error: any) {
      if (error.message.includes('LOCK_TIMEOUT')) {
        logger.warn(`Checkpoint deletion blocked - resource locked: ${lockResourceId}`);
        const lockInfo = await getLockInfo(lockResourceId);
        return res.status(408).json({
          success: false,
          message: 'Checkpoint operation timeout - another operation is in progress on this clone',
          lockInfo
        });
      }
      throw error;
    }
  } catch (error: any) {
    logger.error(`Error deleting checkpoint: ${error.message}`);
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
