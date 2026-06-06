import { Router, Request, Response } from 'express';
import { PowerShellService } from '../services/powershellService';
import logger from '../logger';

const router = Router();
const psService = new PowerShellService();

// POST - Create golden image
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, version, method, outputPath, backupFile, sourceConnection } = req.body;

    if (!name || !version || !method || !outputPath) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, version, method, outputPath'
      });
    }

    logger.info(`Creating golden image: ${name}`);

    const params: any = { Name: name, Version: version, Method: method, OutputPath: outputPath };
    if (backupFile) params.BackupFile = backupFile;
    if (sourceConnection) params.SourceConnection = sourceConnection;

    const image = await psService.executeCommand('New-FlashdbGoldenImage', params);

    return res.status(201).json({
      success: true,
      data: image,
      message: 'Golden image created successfully'
    });
  } catch (error: any) {
    logger.error(`Error creating golden image: ${error.message}`);
    return res.status(400).json({ success: false, message: error.message });
  }
});

// GET - List golden images
router.get('/', async (_req: Request, res: Response) => {
  try {
    const images = await psService.executeCommand('Get-FlashdbGoldenImage', {});
    return res.json({
      success: true,
      data: Array.isArray(images) ? images : [images]
    });
  } catch (error: any) {
    logger.error(`Error retrieving golden images: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Get golden image by ID
router.get('/:imageId', async (req: Request, res: Response) => {
  try {
    const image = await psService.executeCommand('Get-FlashdbGoldenImage', {
      Id: req.params.imageId
    });

    if (!image) {
      return res.status(404).json({
        success: false,
        message: `Golden image not found: ${req.params.imageId}`
      });
    }

    return res.json({ success: true, data: image });
  } catch (error: any) {
    logger.error(`Error retrieving golden image: ${error.message}`);
    return res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE - Delete golden image
router.delete('/:imageId', async (req: Request, res: Response) => {
  try {
    await psService.executeCommandRaw('Remove-FlashdbGoldenImage', {
      GoldenImageId: req.params.imageId
    });
    return res.json({ success: true, message: 'Golden image deleted successfully' });
  } catch (error: any) {
    logger.error(`Error deleting golden image: ${error.message}`);
    return res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
