import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { getPooledPowerShellService } from '../services/pooledPowershellService';
import { getTaskQueue } from '../services/taskQueue';
import { enqueueTask } from '../services/durableTaskQueue';
import { getCloneValidationService } from '../services/cloneValidationService';
import { getAuditMetricsService } from '../services/auditMetricsService';
import { getMetadataService } from '../services/metadataService';
import { getSqlClient } from '../services/sqlClient';
import logger from '../logger';
import { invalidateCache } from '../middleware/caching';
import { withLock, getLockInfo } from '../middleware/lockMiddleware';

const router = Router();
const psService = getPooledPowerShellService();
const metadataService = getMetadataService();

const isWindowsAbsolutePath = (input: string): boolean => /^[a-zA-Z]:[\\/]/.test(input);

const normalizePathForMatch = (input: string): string => input.replace(/\\/g, '/').toLowerCase();

function resolveMappedStoragePath(requestedPath: string): string {
  const trimmed = requestedPath.trim();

  if (process.env.NODE_ENV === 'test') return trimmed;
  if (process.platform === 'win32' || !isWindowsAbsolutePath(trimmed)) return trimmed;

  const rawMappings = process.env.FLASHDB_STORAGE_PATH_MAPPINGS || '{}';
  let mappings: Record<string, string> = {};
  try {
    mappings = JSON.parse(rawMappings);
  } catch {
    throw new Error('Invalid FLASHDB_STORAGE_PATH_MAPPINGS JSON.');
  }

  const normalizedRequested = normalizePathForMatch(trimmed);
  const normalizedEntries = Object.entries(mappings)
    .map(([source, target]) => ({
      source: normalizePathForMatch(String(source).trim()),
      target: String(target).trim(),
    }))
    .filter(entry => entry.source.length > 0 && entry.target.length > 0)
    .sort((a, b) => b.source.length - a.source.length);

  const match = normalizedEntries.find(entry =>
    normalizedRequested === entry.source || normalizedRequested.startsWith(`${entry.source}/`)
  );

  if (!match) {
    throw new Error(
      `Storage path '${trimmed}' is a Windows path but no container mapping exists. Set FLASHDB_STORAGE_PATH_MAPPINGS.`
    );
  }

  const suffix = normalizedRequested.slice(match.source.length).replace(/^\//, '');
  return suffix ? path.posix.join(match.target, suffix) : match.target;
}

function assertStoragePathExists(storagePath: string): void {
  if (!fs.existsSync(storagePath)) {
    throw new Error(`Storage path does not exist in runtime environment: ${storagePath}`);
  }
  if (!fs.statSync(storagePath).isDirectory()) {
    throw new Error(`Storage path is not a directory: ${storagePath}`);
  }
}

const toResponseArray = (value: any): any[] => {
  if (value == null) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.filter(item => {
    if (item == null) return false;
    return typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length > 0;
  });
};

function parseJsonField(value: any): any {
  if (!value || typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeValidationStatus(value: any, rowStatus?: string, findings: any[] = []): 'Healthy' | 'Unhealthy' | 'Pending' {
  const normalized = String(value || '').toLowerCase();
  if (normalized === 'healthy' || normalized === 'success') return 'Healthy';
  if (normalized === 'unhealthy' || normalized === 'failed' || normalized === 'failure') return 'Unhealthy';
  if (rowStatus === 'pending' || rowStatus === 'processing') return 'Pending';
  if (rowStatus === 'failed') return 'Unhealthy';
  if (findings.some((finding: any) => finding?.severity === 'Error')) return 'Unhealthy';
  return rowStatus === 'completed' ? 'Healthy' : 'Pending';
}

function mapValidationTaskRow(row: any): any {
  const payload = parseJsonField(row.payload) || {};
  const result = parseJsonField(row.result) || {};
  const findings = Array.isArray(result.findings) ? result.findings : [];
  const validationId = result.validationId || payload.validationId || row.id;

  return {
    cloneId: result.cloneId || payload.cloneId || '',
    validationId,
    taskId: row.id,
    status: normalizeValidationStatus(result.status || result.result, row.status, findings),
    findings,
    findingsCount: findings.length,
    validatedAt: result.validatedAt || row.completedAt || row.startedAt || row.createdAt,
    duration: result.duration,
    taskStatus: row.status
  };
}

async function getPersistentValidationTasks(
  cloneId: string,
  validationId?: string,
  limit: number = 100
): Promise<any[]> {
  try {
    const sqlClient = getSqlClient();
    const result = await sqlClient.query<any>(
      `SELECT TOP (@limit)
          [id],
          [type],
          [status],
          [payload],
          [createdAt],
          [startedAt],
          [completedAt],
          [result]
       FROM (
          SELECT
            [id],
            [type],
            [status],
            [payload],
            [created_at] AS [createdAt],
            [started_at] AS [startedAt],
            [completed_at] AS [completedAt],
            [result]
          FROM [dbo].[flashdb_queue]
          WHERE [type] = 'validate-clone'
          UNION ALL
          SELECT
            [id],
            [type],
            [status],
            [payload],
            [created_at] AS [createdAt],
            [started_at] AS [startedAt],
            [completed_at] AS [completedAt],
            [result]
          FROM [dbo].[flashdb_queue_archive]
          WHERE [type] = 'validate-clone'
       ) AS validations
       ORDER BY COALESCE([completedAt], [startedAt], [createdAt]) DESC`,
      { limit }
    );

    return (result.recordset || [])
      .map(mapValidationTaskRow)
      .filter(item => item.cloneId === cloneId)
      .filter(item => !validationId || item.validationId === validationId);
  } catch (error: any) {
    logger.debug(`Persistent validation tasks unavailable: ${error.message}`);
    return [];
  }
}

// POST - Create clone (queued)
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      goldenImageId,
      cloneName,
      instancePath,
      storagePath,
      databaseType,
      databaseName,
      compressionEnabled,
      attachAfterCreate,
      useQueue = true
    } = req.body;

    if (!goldenImageId || !cloneName || !instancePath || !storagePath) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: goldenImageId, cloneName, instancePath, storagePath'
      });
    }

    logger.info(`Creating clone: ${cloneName}`);

    // Validate that golden image exists before queueing task
    const sqlClient = getSqlClient();
    const goldenImageCheck = await sqlClient.query<any>(
      `SELECT [id] FROM [dbo].[GoldenImages] WHERE [id] = @goldenImageId`,
      { goldenImageId }
    );

    if (!goldenImageCheck.recordset || goldenImageCheck.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Golden image not found: ${goldenImageId}`
      });
    }

    const requestedStoragePath = String(storagePath).trim();
    const runtimeStoragePath = resolveMappedStoragePath(requestedStoragePath);
    assertStoragePathExists(runtimeStoragePath);
    if (runtimeStoragePath !== requestedStoragePath) {
      logger.info(`Mapped clone storage path '${requestedStoragePath}' -> '${runtimeStoragePath}'`);
    }

    // Lock on source to prevent concurrent clones from same golden image
    const lockResourceId = `clone-creation:${goldenImageId}`;

    try {
      const { result: task, lockContext } = await withLock(lockResourceId, async () => {
        // Use task queue for async processing
        if (useQueue !== false) {
          const task = await enqueueTask('create-clone', {
            goldenImageId,
            cloneName,
            instancePath,
            storagePath: runtimeStoragePath,
            databaseType,
            databaseName,
            compressionEnabled,
            attachAfterCreate
          });

          // Invalidate cache for clones and metrics
          invalidateCache(['/clones', '/metrics']);

          return task;
        } else {
          // Synchronous mode (for backward compatibility)
          const params: any = {
            GoldenImageId: goldenImageId,
            CloneName: cloneName,
            InstancePath: instancePath,
            StoragePath: runtimeStoragePath
          };
          if (databaseType) params.DatabaseType = databaseType;
          if (databaseName) params.DatabaseName = databaseName;
          if (compressionEnabled !== undefined) params.CompressionEnabled = compressionEnabled;

          const clone = await psService.executeCommand('New-FlashdbClone', params);

          if (attachAfterCreate === true && clone && typeof clone === 'object') {
            await psService.executeCommandRaw('Connect-FlashdbClone', {
              CloneId: (clone as any).Id || (clone as any).id,
              InstancePath: instancePath
            });
            (clone as any).Status = 'Attached';
          }

          // Invalidate cache for clones and metrics
          invalidateCache(['/clones', '/metrics']);

          return clone;
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
        message: useQueue !== false ? 'Clone creation task queued successfully' : 'Clone created successfully'
      });
    } catch (error: any) {
      if (error.message.includes('LOCK_CONFLICT')) {
        logger.warn(`Clone creation blocked - resource locked: ${lockResourceId}`);
        const lockInfo = await getLockInfo(lockResourceId);
        return res.status(409).json({
          success: false,
          message: 'Clone creation is already in progress for this golden image',
          lockInfo
        });
      }
      throw error;
    }
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

    const clones = toResponseArray(await psService.executeCommand('Get-FlashdbClone', {}));

    // Try to enrich with database data (vhdxPath, etc.)
    try {
      const sqlClient = getSqlClient();
      const dbClones = await sqlClient.query<any>(
        `SELECT [id], [vhdxPath] FROM [dbo].[Clones]`,
        {}
      );
      const dbMap = new Map((dbClones.recordset || []).map((row: any) => [row.id, row]));

      const enrichedClones = clones.map((clone: any) => ({
        ...clone,
        vhdxPath: (clone as any).VhdxPath || dbMap.get((clone as any).Id || (clone as any).id)?.vhdxPath || null
      }));

      return res.json({
        success: true,
        data: enrichedClones,
        message: 'Clones retrieved successfully'
      });
    } catch (dbError: any) {
      logger.debug(`Database enrichment unavailable: ${dbError.message}, returning PowerShell data only`);
      return res.json({
        success: true,
        data: clones,
        message: 'Clones retrieved successfully'
      });
    }
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

    // Try to enrich with database data
    try {
      const sqlClient = getSqlClient();
      const dbResult = await sqlClient.query<any>(
        `SELECT [vhdxPath] FROM [dbo].[Clones] WHERE [id] = @cloneId`,
        { cloneId }
      );
      const dbClone = dbResult.recordset?.[0];
      if (dbClone && dbClone.vhdxPath) {
        (clone as any).vhdxPath = dbClone.vhdxPath;
      }
    } catch (dbError: any) {
      logger.debug(`Database enrichment unavailable for clone ${cloneId}: ${dbError.message}`);
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

    // Invalidate cache for this clone
    invalidateCache(['/clones', '/metrics']);

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

    // Invalidate cache for this clone
    invalidateCache(['/clones', '/metrics']);

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

// DELETE - Remove clone (queued)
router.delete('/:cloneId', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const { deleteVhdx, useQueue = true } = req.query;

    logger.info(`Deleting clone: ${cloneId}`);

    // Lock on clone to prevent delete during active operations
    const lockResourceId = `clone:${cloneId}`;

    try {
      const { result: task, lockContext } = await withLock(lockResourceId, async () => {
        // Use task queue for async processing
        if (useQueue !== 'false') {
          const task = await enqueueTask('delete-clone', {
            cloneId,
            deleteVhdx: deleteVhdx === 'true'
          });

          // Invalidate cache for clones and metrics
          invalidateCache(['/clones', '/metrics']);

          return task;
        } else {
          // Synchronous mode (for backward compatibility)
          await psService.executeCommandRaw('Remove-FlashdbClone', {
            CloneId: cloneId,
            DeleteVhdx: deleteVhdx === 'true'
          });

          // Keep API metadata store consistent with provider deletion.
          await metadataService.deleteClone(cloneId);

          // Invalidate cache for clones and metrics
          invalidateCache(['/clones', '/metrics']);

          return { success: true, message: 'Clone deleted successfully' };
        }
      });

      const isQueued = useQueue !== 'false';
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
        message: isQueued ? 'Clone deletion task queued successfully' : 'Clone deleted successfully'
      });
    } catch (error: any) {
      if (error.message.includes('LOCK_CONFLICT')) {
        logger.warn(`Clone deletion blocked - resource locked: ${lockResourceId}`);
        const lockInfo = await getLockInfo(lockResourceId);
        return res.status(409).json({
          success: false,
          message: 'Clone is currently in use or undergoing another operation',
          lockInfo
        });
      }
      throw error;
    }
  } catch (error: any) {
    logger.error(`Error deleting clone: ${error.message}`);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// ===== Validation Endpoints (Phase 5A) =====

// POST - Validate clone
router.post('/:cloneId/validate', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const queue = req.query.queue !== 'false'; // default true (async)
    const validationId = `validation-${cloneId}-${Date.now()}`;

    logger.info(`[Validation] Starting validation for clone: ${cloneId} (queue: ${queue})`);

    // Check if clone exists
    const clone = await psService.executeCommand('Get-FlashdbClone', {
      CloneId: cloneId
    });

    if (!clone) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'E001_CLONE_NOT_FOUND',
          message: `Clone not found: ${cloneId}`,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Check for validation lock conflict
    const validationLockId = `clone-validation:${cloneId}`;
    const cloneLockId = `clone:${cloneId}`;

    try {
      const { result: validationResult } = await withLock(validationLockId, async () => {
        // Also check if clone is locked by another operation
        try {
          // This will throw if clone is locked
          const { result: innerResult } = await withLock(cloneLockId, async () => {
            // Record validation start
            const auditService = getAuditMetricsService();
            await auditService.recordOperation({
              id: validationId,
              type: 'validation-start',
              entityId: cloneId,
              status: 'pending',
              timestamp: new Date(),
              operatorId: (req as any).user?.id
            });

            if (!queue) {
              // Synchronous mode: validate directly
              const validationService = getCloneValidationService();
              const result = await validationService.validateClone(cloneId);

              // Record completion
              await auditService.recordOperation({
                id: validationId,
                type: 'validation-complete',
                entityId: cloneId,
                status: 'completed',
                result: result.isHealthy ? 'success' : 'failed',
                findings: result.findings,
                timestamp: new Date(),
                completedAt: new Date()
              });

              return {
                isQueued: false,
                data: {
                  cloneId,
                  validationId,
                  status: result.isHealthy ? 'Healthy' : 'Unhealthy',
                  findings: result.findings,
                  validatedAt: result.validatedAt.toISOString(),
                  duration: {
                    elapsedMs: Date.now() - parseInt(validationId.split('-')[2])
                  }
                }
              };
            } else {
              // Asynchronous mode: queue validation task
              const task = await enqueueTask('validate-clone', {
                cloneId,
                validationId
              });

              return {
                isQueued: true,
                data: {
                  taskId: task.id,
                  validationId,
                  status: 'Pending',
                  pollingUrl: `/api/clones/${cloneId}/validation-status?validationId=${validationId}`,
                  estimatedDurationMs: 30000
                }
              };
            }
          }, 30);
          return innerResult;
        } catch (lockError: any) {
          if (lockError.message.includes('LOCK_CONFLICT')) {
            const lockInfo = await getLockInfo(cloneLockId);
            throw {
              code: 'E006_CLONE_LOCKED',
              status: 409,
              lockInfo
            };
          }
          throw lockError;
        }
      }, 30);

      if (!queue) {
        return res.status(200).json({
          success: true,
          data: validationResult.data,
          message: 'Clone validation completed'
        });
      } else {
        return res.status(202).json({
          success: true,
          data: validationResult.data,
          message: 'Clone validation queued'
        });
      }
    } catch (error: any) {
      if (error.code === 'E006_CLONE_LOCKED') {
        return res.status(error.status).json({
          success: false,
          error: {
            code: error.code,
            message: 'Clone is currently in use',
            details: { lockInfo: error.lockInfo },
            timestamp: new Date().toISOString()
          }
        });
      }

      if (error.message.includes('LOCK_CONFLICT')) {
        logger.warn(`[Validation] Validation lock conflict for clone: ${cloneId}`);
        const lockInfo = await getLockInfo(validationLockId);
        return res.status(409).json({
          success: false,
          error: {
            code: 'E002_VALIDATION_IN_PROGRESS',
            message: 'Validation already in progress for this clone',
            details: { lockInfo },
            timestamp: new Date().toISOString()
          }
        });
      }

      throw error;
    }
  } catch (error: any) {
    logger.error(`[Validation] Error validating clone: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: {
        code: 'E007_SERVICE_ERROR',
        message: 'Validation service error',
        details: {
          originalError: error.message,
          requestId: Date.now().toString()
        },
        timestamp: new Date().toISOString()
      }
    });
  }
});

// GET - Get validation status
router.get('/:cloneId/validation-status', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const { validationId, includeHistory } = req.query;

    logger.info(`[Validation] Getting validation status for clone: ${cloneId}`);

    // Check if clone exists
    const clone = await psService.executeCommand('Get-FlashdbClone', {
      CloneId: cloneId
    });

    if (!clone) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'E001_CLONE_NOT_FOUND',
          message: `Clone not found: ${cloneId}`,
          timestamp: new Date().toISOString()
        }
      });
    }

    const persistentValidationTasks = await getPersistentValidationTasks(
      cloneId,
      typeof validationId === 'string' ? validationId : undefined,
      250
    );

    if (persistentValidationTasks.length > 0) {
      const latestTaskValidation = persistentValidationTasks[0];
      const responseData: any = {
        cloneId,
        validationId: latestTaskValidation.validationId,
        status: latestTaskValidation.status,
        findings: latestTaskValidation.findings,
        validatedAt: latestTaskValidation.validatedAt,
        duration: latestTaskValidation.duration,
        taskId: latestTaskValidation.taskId,
        taskStatus: latestTaskValidation.taskStatus
      };

      if (includeHistory === 'true') {
        const historyTasks = await getPersistentValidationTasks(cloneId, undefined, 250);
        responseData.history = historyTasks.slice(0, 10).map(item => ({
          validationId: item.validationId,
          status: item.status,
          findingsCount: item.findingsCount,
          validatedAt: item.validatedAt,
          taskId: item.taskId
        }));
      }

      return res.json({
        success: true,
        data: responseData,
        message: 'Validation status retrieved'
      });
    }

    // Get latest validation from audit service
    const auditService = getAuditMetricsService();
    const validationOperations = await auditService.getValidationOperations(cloneId);

    if (!validationOperations || validationOperations.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'E001_CLONE_NOT_FOUND',
          message: `No validation history found for clone: ${cloneId}`,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Find specific validation or latest
    let latestValidation = validationOperations[0];
    if (validationId && typeof validationId === 'string') {
      const found = validationOperations.find(op => op.id === validationId);
      if (found) {
        latestValidation = found;
      }
    }

    const latestValidationStatus =
      latestValidation.status === 'pending'
        ? 'Pending'
        : latestValidation.result === 'success'
          ? 'Healthy'
          : 'Unhealthy';

    const responseData: any = {
      cloneId,
      validationId: latestValidation.id,
      status: latestValidationStatus,
      findings: latestValidation.findings || [],
      validatedAt: latestValidation.timestamp.toISOString()
    };

    if (includeHistory === 'true') {
      responseData.history = validationOperations.slice(0, 10).map((op: any) => ({
        validationId: op.id,
        status: op.status === 'pending' ? 'Pending' : op.result === 'success' ? 'Healthy' : 'Unhealthy',
        findingsCount: op.findings?.length || 0,
        validatedAt: op.timestamp.toISOString()
      }));
    }

    return res.json({
      success: true,
      data: responseData,
      message: 'Validation status retrieved'
    });
  } catch (error: any) {
    logger.error(`[Validation] Error getting validation status: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: {
        code: 'E007_SERVICE_ERROR',
        message: 'Validation service error',
        details: { originalError: error.message },
        timestamp: new Date().toISOString()
      }
    });
  }
});

// GET - Get validation history
router.get('/:cloneId/validation-history', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const status = req.query.status as string;

    logger.info(`[Validation] Getting validation history for clone: ${cloneId}`);

    // Check if clone exists
    const clone = await psService.executeCommand('Get-FlashdbClone', {
      CloneId: cloneId
    });

    if (!clone) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'E001_CLONE_NOT_FOUND',
          message: `Clone not found: ${cloneId}`,
          timestamp: new Date().toISOString()
        }
      });
    }

    const persistentValidationTasks = await getPersistentValidationTasks(cloneId, undefined, 500);
    if (persistentValidationTasks.length > 0) {
      let filteredTasks = persistentValidationTasks;
      if (status) {
        filteredTasks = filteredTasks.filter((item: any) => item.status === status);
      }

      const total = filteredTasks.length;
      const validations = filteredTasks.slice(offset, offset + limit).map((item: any) => {
        const errorCount = item.findings.filter((finding: any) => finding.severity === 'Error').length;
        const warningCount = item.findings.filter((finding: any) => finding.severity === 'Warning').length;

        return {
          validationId: item.validationId,
          taskId: item.taskId,
          status: item.status,
          findings: item.findings,
          findingsCount: item.findingsCount,
          errorCount,
          warningCount,
          validatedAt: item.validatedAt,
          duration: item.duration?.elapsedMs || 0
        };
      });

      return res.json({
        success: true,
        data: {
          cloneId,
          validations,
          total,
          limit,
          offset
        },
        message: 'Validation history retrieved'
      });
    }

    // Get validation history from audit service
    const auditService = getAuditMetricsService();
    const validationOperations = await auditService.getValidationOperations(cloneId);

    let filtered = validationOperations || [];

    // Filter by status if provided
    if (status) {
      filtered = filtered.filter((op: any) => {
        const opStatus = op.status === 'pending' ? 'Pending' : op.result === 'success' ? 'Healthy' : 'Unhealthy';
        return opStatus === status;
      });
    }

    // Apply pagination
    const total = filtered.length;
    const validations = filtered.slice(offset, offset + limit).map((op: any) => {
      const errorCount = op.findings?.filter((f: any) => f.severity === 'Error').length || 0;
      const warningCount = op.findings?.filter((f: any) => f.severity === 'Warning').length || 0;

      return {
        validationId: op.id,
        status: op.status === 'pending' ? 'Pending' : op.result === 'success' ? 'Healthy' : 'Unhealthy',
        findingsCount: op.findings?.length || 0,
        errorCount,
        warningCount,
        validatedAt: op.timestamp.toISOString(),
        duration: op.completedAt ? new Date(op.completedAt).getTime() - new Date(op.timestamp).getTime() : 0
      };
    });

    return res.json({
      success: true,
      data: {
        cloneId,
        validations,
        total,
        limit,
        offset
      },
      message: 'Validation history retrieved'
    });
  } catch (error: any) {
    logger.error(`[Validation] Error getting validation history: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: {
        code: 'E007_SERVICE_ERROR',
        message: 'Validation service error',
        details: { originalError: error.message },
        timestamp: new Date().toISOString()
      }
    });
  }
});

// ===== Repair Endpoints (Phase 5A) =====

// POST - Plan or execute clone repair
router.post('/:cloneId/repair', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const dryRun = req.query.dryRun !== 'false' && (req.body.dryRun !== false);
    const repairId = `repair-${cloneId}-${Date.now()}`;

    logger.info(`[Repair] Starting repair for clone: ${cloneId} (dryRun: ${dryRun})`);

    // Check if clone exists
    const clone = await psService.executeCommand('Get-FlashdbClone', {
      CloneId: cloneId
    });

    if (!clone) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'E001_CLONE_NOT_FOUND',
          message: `Clone not found: ${cloneId}`,
          timestamp: new Date().toISOString()
        }
      });
    }

    const validationService = getCloneValidationService();
    const auditService = getAuditMetricsService();

    if (dryRun) {
      // Dry-run: plan the repair
      const plan = await validationService.repairClone(cloneId, true);

      return res.json({
        success: true,
        data: {
          cloneId,
          repairId,
          isDryRun: true,
          status: plan.plannedActions.some(a => a.startsWith('ERROR:')) ? 'CannotRepair' : 'Planned',
          plan: {
            actions: plan.plannedActions.map(action => ({
              type: action.includes('Remount') ? 'RemountVhd' :
                     action.includes('Attach') ? 'AttachDatabase' :
                     action.includes('Detach') ? 'DetachDatabase' :
                     action.includes('Update') ? 'UpdateMetadata' : 'Other',
              description: action,
              estimatedDurationSeconds: plan.estimatedDurationSeconds / Math.max(plan.plannedActions.length, 1),
              riskLevel: 'Medium' as const
            })),
            estimatedDurationSeconds: plan.estimatedDurationSeconds,
            requiresApproval: plan.estimatedDurationSeconds > 60
          },
          blockers: [],
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString() // 5 minute cache
        },
        message: 'Repair plan created'
      });
    } else {
      // Execute mode: queue the repair
      const repairLockId = `clone-repair:${cloneId}`;
      const cloneLockId = `clone:${cloneId}`;

      try {
        const { result: repairResult } = await withLock(repairLockId, async () => {
          // Check if clone is locked
          try {
            const { result: innerResult } = await withLock(cloneLockId, async () => {
              // Record repair start
              await auditService.recordOperation({
                id: repairId,
                type: 'repair-execute',
                entityId: cloneId,
                status: 'pending',
                timestamp: new Date(),
                operatorId: (req as any).user?.id || req.body.approvedByOperator
              });

              // Queue the repair task
              const task = await enqueueTask('repair-clone', {
                cloneId,
                repairId,
                isDryRun: false,
                validationId: req.body.validationId
              });

              return {
                taskId: task.id,
                repairId,
                status: 'Queued'
              };
            }, 30);
            return innerResult;
          } catch (lockError: any) {
            if (lockError.message.includes('LOCK_CONFLICT')) {
              const lockInfo = await getLockInfo(cloneLockId);
              throw {
                code: 'E006_CLONE_LOCKED',
                status: 409,
                lockInfo
              };
            }
            throw lockError;
          }
        }, 30);

        return res.status(202).json({
          success: true,
          data: {
            cloneId,
            repairId: repairResult.repairId,
            isDryRun: false,
            taskId: repairResult.taskId,
            status: 'Queued',
            message: 'Repair task queued'
          },
          message: 'Repair execution queued'
        });
      } catch (error: any) {
        if (error.code === 'E006_CLONE_LOCKED') {
          return res.status(error.status).json({
            success: false,
            error: {
              code: error.code,
              message: 'Clone is currently in use',
              details: { lockInfo: error.lockInfo },
              timestamp: new Date().toISOString()
            }
          });
        }

        if (error.message.includes('LOCK_CONFLICT')) {
          logger.warn(`[Repair] Repair lock conflict for clone: ${cloneId}`);
          const lockInfo = await getLockInfo(repairLockId);
          return res.status(409).json({
            success: false,
            error: {
              code: 'E003_REPAIR_IN_PROGRESS',
              message: 'Repair already in progress for this clone',
              details: { lockInfo },
              timestamp: new Date().toISOString()
            }
          });
        }

        throw error;
      }
    }
  } catch (error: any) {
    logger.error(`[Repair] Error executing repair: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: {
        code: 'E007_SERVICE_ERROR',
        message: 'Repair service error',
        details: { originalError: error.message },
        timestamp: new Date().toISOString()
      }
    });
  }
});

// GET - Get repair status
router.get('/:cloneId/repair-status', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const { repairId, taskId } = req.query;

    logger.info(`[Repair] Getting repair status for clone: ${cloneId}`);

    // Check if clone exists
    const clone = await psService.executeCommand('Get-FlashdbClone', {
      CloneId: cloneId
    });

    if (!clone) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'E001_CLONE_NOT_FOUND',
          message: `Clone not found: ${cloneId}`,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (taskId && typeof taskId === 'string') {
      // Get task status from queue
      const taskQueue = getTaskQueue();
      const task = taskQueue.getTask(taskId);

      if (!task) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'E001_CLONE_NOT_FOUND',
            message: `Repair task not found: ${taskId}`,
            timestamp: new Date().toISOString()
          }
        });
      }

      const taskResult = task.result || {};
      const taskDurationSeconds = task.completedAt && task.startedAt
        ? Math.round(
            (new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()) / 1000
          )
        : 0;
      const status =
        task.status === 'pending' ? 'Queued' :
        task.status === 'processing' ? 'InProgress' :
        task.status === 'completed' ? (taskResult.status || 'Completed') :
        'Failed';
      const result = task.status === 'completed' || task.status === 'failed'
        ? {
            success: taskResult.success ?? (task.status === 'completed' && !task.error),
            appliedActions: taskResult.appliedActions || taskResult.actions || [],
            durationSeconds: taskResult.durationSeconds ?? taskDurationSeconds,
            errors: taskResult.errors || (task.error ? [task.error] : [])
          }
        : undefined;

      return res.json({
        success: true,
        data: {
          cloneId,
          repairId: repairId || task.payload.repairId || taskId,
          taskId,
          status,
          result,
          completedAt: task.completedAt
        },
        message: 'Repair status retrieved'
      });
    }

    // Get repair status from audit service
    const auditService = getAuditMetricsService();
    const repairOperations = await auditService.getRepairOperations(cloneId);

    if (!repairOperations || repairOperations.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'E001_CLONE_NOT_FOUND',
          message: `No repair history found for clone: ${cloneId}`,
          timestamp: new Date().toISOString()
        }
      });
    }

    const latestRepair = repairOperations[0];

    return res.json({
      success: true,
      data: {
        cloneId,
        repairId: latestRepair.id,
        status: latestRepair.status === 'pending'
          ? 'Queued'
          : latestRepair.status === 'completed'
            ? 'Completed'
            : 'Failed',
        result: latestRepair.status === 'completed' ? {
          success: latestRepair.result === 'success',
          appliedActions: [],
          durationSeconds: latestRepair.completedAt ?
            Math.round((new Date(latestRepair.completedAt).getTime() - new Date(latestRepair.timestamp).getTime()) / 1000) : 0,
          errors: latestRepair.result === 'success' ? [] : ['Repair failed']
        } : undefined,
        completedAt: latestRepair.completedAt?.toISOString()
      },
      message: 'Repair status retrieved'
    });
  } catch (error: any) {
    logger.error(`[Repair] Error getting repair status: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: {
        code: 'E007_SERVICE_ERROR',
        message: 'Repair service error',
        details: { originalError: error.message },
        timestamp: new Date().toISOString()
      }
    });
  }
});

// POST - Cancel repair
router.post('/:cloneId/repair/cancel', async (req: Request, res: Response) => {
  try {
    const { cloneId } = req.params;
    const repairId = req.query.repairId || req.body.repairId;
    const taskId = req.query.taskId || req.body.taskId;

    logger.info(`[Repair] Canceling repair for clone: ${cloneId}`);

    // Check if clone exists
    const clone = await psService.executeCommand('Get-FlashdbClone', {
      CloneId: cloneId
    });

    if (!clone) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'E001_CLONE_NOT_FOUND',
          message: `Clone not found: ${cloneId}`,
          timestamp: new Date().toISOString()
        }
      });
    }

    const taskQueue = getTaskQueue();
    const auditService = getAuditMetricsService();

    if (taskId && typeof taskId === 'string') {
      const task = taskQueue.getTask(taskId);

      if (!task) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'E001_CLONE_NOT_FOUND',
            message: `Repair task not found: ${taskId}`,
            timestamp: new Date().toISOString()
          }
        });
      }

      if (task.status === 'completed' || task.status === 'failed') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'E004_INVALID_REPAIR_STATE',
            message: `Cannot cancel repair with status: ${task.status}`,
            timestamp: new Date().toISOString()
          }
        });
      }

      // Update task status
      taskQueue.updateTask(taskId, 'failed', undefined, 'Repair cancelled by user');

      // Record cancel
      await auditService.recordOperation({
        id: `audit-${taskId}-cancel`,
        type: 'repair-cancel',
        entityId: cloneId,
        status: 'completed',
        timestamp: new Date(),
        operatorId: (req as any).user?.id
      });
    }

    return res.json({
      success: true,
      data: {
        cloneId,
        repairId: repairId || (typeof taskId === 'string' ? taskId : ''),
        status: 'Cancelled',
        message: 'Repair cancelled'
      },
      message: 'Repair cancelled successfully'
    });
  } catch (error: any) {
    logger.error(`[Repair] Error canceling repair: ${error.message}`);
    return res.status(500).json({
      success: false,
      error: {
        code: 'E007_SERVICE_ERROR',
        message: 'Repair service error',
        details: { originalError: error.message },
        timestamp: new Date().toISOString()
      }
    });
  }
});

export default router;
