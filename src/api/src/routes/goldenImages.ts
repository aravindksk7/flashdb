import { Router, Request, Response } from 'express';
import { getPooledPowerShellService } from '../services/pooledPowershellService';
import logger from '../logger';

const router = Router();
const psService = getPooledPowerShellService();

const methodAliases: Record<string, string> = {
  BACKUP_RESTORE: 'BackupRestore',
  BackupRestore: 'BackupRestore',
  REPLICA_BACKUP: 'ReplicaBackup',
  ReplicaBackup: 'ReplicaBackup',
  TABLE_BY_TABLE: 'TableByTableCopy',
  TableByTableCopy: 'TableByTableCopy'
};

const toResponseArray = (value: any): any[] => {
  if (value == null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.filter(item => {
    if (item == null) return false;
    return typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length > 0;
  });
};

// POST - Create golden image
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name,
      version,
      method,
      outputPath,
      backupFile,
      sourceConnection,
      databaseType,
      databaseName,
      sourceDatabase,
      driver,
      authenticationMode
    } = req.body;

    if (!name || !version || !method || !outputPath) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, version, method, outputPath'
      });
    }

    const normalizedMethod = methodAliases[String(method)] || method;

    if (!['BackupRestore', 'ReplicaBackup', 'TableByTableCopy'].includes(normalizedMethod)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid method. Use BackupRestore, ReplicaBackup, or TableByTableCopy'
      });
    }

    if (normalizedMethod === 'BackupRestore' && !backupFile) {
      return res.status(400).json({
        success: false,
        message: 'BackupRestore requires backupFile'
      });
    }

    if (['ReplicaBackup', 'TableByTableCopy'].includes(normalizedMethod) && !sourceConnection) {
      return res.status(400).json({
        success: false,
        message: `${normalizedMethod} requires sourceConnection`
      });
    }

    logger.info(`Creating golden image: ${name}`);

    const params: any = {
      Name: name,
      Version: version,
      Method: normalizedMethod,
      OutputPath: outputPath
    };
    if (backupFile) params.BackupFile = backupFile;
    if (sourceConnection) params.SourceConnection = sourceConnection;
    if (databaseType) params.DatabaseType = databaseType;
    if (databaseName) params.DatabaseName = databaseName;
    if (sourceDatabase) params.SourceDatabase = sourceDatabase;
    if (driver) params.Driver = driver;
    if (authenticationMode) params.AuthenticationMode = authenticationMode;

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
      data: toResponseArray(images)
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
