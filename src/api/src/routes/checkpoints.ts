import { Router, Request, Response } from 'express';
import { getPooledPowerShellService } from '../services/pooledPowershellService';
import { getTaskQueue } from '../services/taskQueue';
import logger from '../logger';
import { invalidateCache } from '../middleware/caching';

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

      return res.status(202).json({
        success: true,
        data: {
          taskId: task.id,
          status: task.status,
          createdAt: task.createdAt
        },
        message: 'Checkpoint creation task queued successfully'
      });
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

      return res.status(201).json({
        success: true,
        data: checkpoint,
        message: 'Checkpoint created successfully'
      });
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

      return res.status(202).json({
        success: true,
        data: {
          taskId: task.id,
          status: task.status,
          createdAt: task.createdAt
        },
        message: 'Checkpoint restore task queued successfully'
      });
    } else {
      // Synchronous mode (for backward compatibility)
      await psService.executeCommandRaw('Restore-FlashdbCheckpoint', {
        CloneId: cloneId,
        CheckpointId: checkpointId,
        ReattachAfter: reattachAfter !== false
      });

      // Invalidate cache for checkpoints and metrics
      invalidateCache(['/checkpoints', '/metrics']);

      return res.json({
        success: true,
        message: 'Checkpoint restored successfully'
      });
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

// DELETE - Delete checkpoint
router.delete('/:checkpointId', async (req: Request, res: Response) => {
  try {
    const { cloneId, checkpointId } = req.params;

    await psService.executeCommandRaw('Remove-FlashdbCheckpoint', {
      CloneId: cloneId,
      CheckpointId: checkpointId
    });

    // Invalidate cache for checkpoints and metrics
    invalidateCache(['/checkpoints', '/metrics']);

    return res.json({
      success: true,
      message: 'Checkpoint deleted successfully'
    });
  } catch (error: any) {
    logger.error(`Error deleting checkpoint: ${error.message}`);
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
