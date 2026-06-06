import { Router, Request, Response } from 'express';
import { PowerShellService } from '../services/powershellService';
import logger from '../logger';

const router = Router();
const psService = new PowerShellService();

// POST - Create clone
router.post('/', async (req: Request, res: Response) => {
  try {
    const { goldenImageId, cloneName, instancePath, storagePath } = req.body;

    if (!goldenImageId || !cloneName || !instancePath || !storagePath) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: goldenImageId, cloneName, instancePath, storagePath'
      });
    }

    logger.info(`Creating clone: ${cloneName}`);

    const clone = await psService.executeCommand('New-FlashdbClone', {
      GoldenImageId: goldenImageId,
      CloneName: cloneName,
      InstancePath: instancePath,
      StoragePath: storagePath
    });

    return res.status(201).json({
      success: true,
      data: clone,
      message: 'Clone created successfully'
    });
  } catch (error: any) {
    logger.error(`Error creating clone: ${error.message}`);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// GET - List all clones
router.get('/', async (_req: Request, res: Response) => {
  try {
    logger.info('Retrieving all clones');

    const clones = await psService.executeCommand('Get-FlashdbClone', {});

    return res.json({
      success: true,
      data: Array.isArray(clones) ? clones : [clones],
      message: 'Clones retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`Error retrieving clones: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET - Get clone by ID
router.get('/:cloneId', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    logger.info(`Retrieving clone: ${cloneId}`);

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
  } catch (error: any) {
    logger.error(`Error retrieving clone: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// POST - Attach clone
router.post('/:cloneId/attach', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const { instancePath } = req.body;

    if (!instancePath) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: instancePath'
      });
    }

    logger.info(`Attaching clone ${cloneId} to ${instancePath}`);

    await psService.executeCommandRaw('Connect-FlashdbClone', {
      CloneId: cloneId,
      InstancePath: instancePath
    });

    return res.json({
      success: true,
      message: 'Clone attached successfully'
    });
  } catch (error: any) {
    logger.error(`Error attaching clone: ${error.message}`);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// POST - Detach clone
router.post('/:cloneId/detach', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    logger.info(`Detaching clone: ${cloneId}`);

    await psService.executeCommandRaw('Disconnect-FlashdbClone', {
      CloneId: cloneId
    });

    return res.json({
      success: true,
      message: 'Clone detached successfully'
    });
  } catch (error: any) {
    logger.error(`Error detaching clone: ${error.message}`);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// DELETE - Remove clone
router.delete('/:cloneId', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const { deleteVhdx } = req.query;

    logger.info(`Deleting clone: ${cloneId}`);

    await psService.executeCommandRaw('Remove-FlashdbClone', {
      CloneId: cloneId,
      DeleteVhdx: deleteVhdx === 'true'
    });

    return res.json({
      success: true,
      message: 'Clone deleted successfully'
    });
  } catch (error: any) {
    logger.error(`Error deleting clone: ${error.message}`);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
