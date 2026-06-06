import { Router, Request, Response } from 'express';
import { PowerShellService } from '../services/powershellService';
import logger from '../logger';

const router = Router({ mergeParams: true });
const psService = new PowerShellService();

// POST - Create checkpoint
router.post('/', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const { checkpointName, phase, description, force } = req.body;

    if (!checkpointName) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: checkpointName'
      });
    }

    logger.info(`Creating checkpoint for clone ${cloneId}: ${checkpointName}`);

    const checkpoint = await psService.executeCommand('New-FlashdbCheckpoint', {
      CloneId: cloneId,
      CheckpointName: checkpointName,
      Phase: phase || 'manual',
      Description: description,
      Force: force || false
    });

    res.status(201).json({
      success: true,
      data: checkpoint,
      message: 'Checkpoint created successfully'
    });
  } catch (error: any) {
    logger.error(`Error creating checkpoint: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET - List checkpoints for clone
router.get('/', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const checkpoints = await psService.executeCommand('Get-FlashdbCheckpoint', {
      CloneId: cloneId
    });

    res.json({
      success: true,
      data: Array.isArray(checkpoints) ? checkpoints : [checkpoints]
    });
  } catch (error: any) {
    logger.error(`Error retrieving checkpoints: ${error.message}`);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST - Restore checkpoint
router.post('/:checkpointId/restore', async (req: Request, res: Response) => {
  try {
    const { cloneId, checkpointId } = req.params;
    const { reattachAfter } = req.body;

    logger.info(`Restoring checkpoint ${checkpointId} for clone ${cloneId}`);

    await psService.executeCommandRaw('Restore-FlashdbCheckpoint', {
      CloneId: cloneId,
      CheckpointId: checkpointId,
      ReattachAfter: reattachAfter !== false
    });

    res.json({
      success: true,
      message: 'Checkpoint restored successfully'
    });
  } catch (error: any) {
    logger.error(`Error restoring checkpoint: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
});

// PATCH - Update checkpoint (labels, favorite)
router.patch('/:checkpointId', async (req: Request, res: Response) => {
  try {
    const { cloneId, checkpointId } = req.params;
    const { isFavorite, labels } = req.body;

    await psService.executeCommandRaw('Set-FlashdbCheckpoint', {
      CloneId: cloneId,
      CheckpointId: checkpointId,
      IsFavorite: isFavorite,
      Labels: labels
    });

    res.json({
      success: true,
      message: 'Checkpoint updated successfully'
    });
  } catch (error: any) {
    logger.error(`Error updating checkpoint: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
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

    res.json({
      success: true,
      message: 'Checkpoint deleted successfully'
    });
  } catch (error: any) {
    logger.error(`Error deleting checkpoint: ${error.message}`);
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
