import { Router, Request, Response } from 'express';
import { getPooledPowerShellService } from '../services/pooledPowershellService';
import { invalidateCache } from '../middleware/caching';
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

const normalizeSelectedTables = (value: any): string[] => {
  if (value == null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .map(item => String(item).trim())
    .filter(item => item.length > 0);
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
      authenticationMode,
      selectedTables
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
    const selectedTableList = normalizeSelectedTables(selectedTables);
    if (selectedTableList.length > 0) params.SelectedTables = selectedTableList;

    const image = await psService.executeCommand('New-FlashdbGoldenImage', params);
    invalidateCache(['/golden-images', '/metrics']);

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

// POST - Explore source database schema
router.post('/schema', async (req: Request, res: Response) => {
  try {
    const {
      sourceConnection,
      databaseName,
      sourceDatabase,
      databaseType
    } = req.body;

    if (!sourceConnection) {
      return res.status(400).json({
        success: false,
        message: 'sourceConnection is required'
      });
    }

    if (databaseType && databaseType !== 'sql-server') {
      return res.status(400).json({
        success: false,
        message: 'Schema exploration currently supports SQL Server only'
      });
    }

    logger.info('Exploring source database schema');
    const schema = await psService.executeCommand('Get-FlashdbDatabaseSchema', {
      SourceConnection: sourceConnection,
      DatabaseName: databaseName,
      SourceDatabase: sourceDatabase
    });

    return res.json({
      success: true,
      data: schema,
      message: 'Database schema retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`Error exploring database schema: ${error.message}`);
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

// PUT - Update golden image metadata
router.put('/:imageId', async (req: Request, res: Response) => {
  try {
    const allowedFields = [
      'name',
      'version',
      'method',
      'outputPath',
      'backupFile',
      'sourceConnection',
      'databaseType',
      'databaseName',
      'sourceDatabase',
      'driver',
      'authenticationMode',
      'status'
    ];

    const hasUpdate = allowedFields.some(field => req.body[field] !== undefined && req.body[field] !== null);
    if (!hasUpdate) {
      return res.status(400).json({
        success: false,
        message: `At least one update field is required: ${allowedFields.join(', ')}`
      });
    }

    const params: any = {
      GoldenImageId: req.params.imageId
    };

    const fieldMap: Record<string, string> = {
      name: 'Name',
      version: 'Version',
      method: 'Method',
      outputPath: 'OutputPath',
      backupFile: 'BackupFile',
      sourceConnection: 'SourceConnection',
      databaseType: 'DatabaseType',
      databaseName: 'DatabaseName',
      sourceDatabase: 'SourceDatabase',
      driver: 'Driver',
      authenticationMode: 'AuthenticationMode',
      status: 'Status'
    };

    for (const field of allowedFields) {
      if (req.body[field] !== undefined && req.body[field] !== null) {
        params[fieldMap[field]] = field === 'method'
          ? methodAliases[String(req.body[field])] || req.body[field]
          : req.body[field];
      }
    }

    if (params.Method && !['BackupRestore', 'ReplicaBackup', 'TableByTableCopy'].includes(params.Method)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid method. Use BackupRestore, ReplicaBackup, or TableByTableCopy'
      });
    }

    logger.info(`Updating golden image: ${req.params.imageId}`);
    const image = await psService.executeCommand('Update-FlashdbGoldenImage', params);
    invalidateCache(['/golden-images', '/metrics']);

    return res.json({
      success: true,
      data: image,
      message: 'Golden image updated successfully'
    });
  } catch (error: any) {
    logger.error(`Error updating golden image: ${error.message}`);
    const statusCode = /not found/i.test(error.message) ? 404 : 400;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
});

// DELETE - Delete golden image
router.delete('/:imageId', async (req: Request, res: Response) => {
  try {
    await psService.executeCommandRaw('Remove-FlashdbGoldenImage', {
      GoldenImageId: req.params.imageId
    });
    invalidateCache(['/golden-images', '/metrics']);
    return res.json({ success: true, message: 'Golden image deleted successfully' });
  } catch (error: any) {
    logger.error(`Error deleting golden image: ${error.message}`);
    const statusCode = /not found/i.test(error.message) ? 404 : 400;
    return res.status(statusCode).json({ success: false, message: error.message });
  }
});

export default router;
