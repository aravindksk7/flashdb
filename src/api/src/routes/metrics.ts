import { Router, Request, Response } from 'express';
import { getPooledPowerShellService } from '../services/pooledPowershellService';
import { getConnectionPool } from '../services/connectionPool';
import { getTaskQueue } from '../services/taskQueue';
import { getMetricsRepository } from '../services/repository';
import { getSqlClient } from '../services/sqlClient';
import logger from '../logger';

const router = Router();
const psService = getPooledPowerShellService();

/**
 * GET /api/metrics/overview
 * Retrieves comprehensive metrics overview
 * Returns: summary stats (total clones, storage used, operations/day)
 */
router.get('/overview', async (_req: Request, res: Response) => {
  try {
    logger.info('Retrieving metrics overview');

    const sqlClient = getSqlClient();
    const metricsRepo = getMetricsRepository();

    let overview: any;

    // Try SQL first if available
    if (sqlClient) {
      try {
        overview = await metricsRepo.getOverview();
      } catch (sqlError: any) {
        logger.warn(`SQL query failed, falling back to PowerShell: ${sqlError.message}`);
        const metrics = await psService.executeCommand('Get-FlashdbMetrics', {});
        overview = metrics?.overview || {
          totalClonesCreated: 0,
          totalStorageSavedGB: 0,
          avgCloneCreationTimeSeconds: 0,
          operationSuccessRatePercent: 100,
          operationsLast24h: 0,
          activeClonesCount: 0
        };
      }
    } else {
      // Fallback to PowerShell
      const metrics = await psService.executeCommand('Get-FlashdbMetrics', {});
      overview = metrics?.overview || {
        totalClonesCreated: 0,
        totalStorageSavedGB: 0,
        avgCloneCreationTimeSeconds: 0,
        operationSuccessRatePercent: 100,
        operationsLast24h: 0,
        activeClonesCount: 0
      };
    }

    return res.json({
      success: true,
      data: {
        totalClonesCreated: overview.totalClonesCreated,
        totalStorageSavedGB: overview.totalStorageSavedGB,
        avgCloneCreationTimeSeconds: overview.avgCloneCreationTimeSeconds,
        operationSuccessRatePercent: overview.operationSuccessRatePercent,
        operationsLast24h: overview.operationsLast24h,
        activeClonesCount: overview.activeClonesCount,
        lastUpdated: new Date().toISOString()
      },
      message: 'Metrics overview retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`Error retrieving metrics overview: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/metrics/clones
 * Retrieves clone creation statistics
 * Returns: avg creation time, success rate, breakdown by golden image
 */
router.get('/clones', async (_req: Request, res: Response) => {
  try {
    logger.info('Retrieving clone statistics');

    const sqlClient = getSqlClient();
    const metricsRepo = getMetricsRepository();

    let stats: any;

    // Try SQL first if available
    if (sqlClient) {
      try {
        stats = await metricsRepo.getCloneStats();
      } catch (sqlError: any) {
        logger.warn(`SQL query failed, falling back to PowerShell: ${sqlError.message}`);
        stats = await psService.executeCommand('Get-CloneCreationStats', {});
      }
    } else {
      stats = await psService.executeCommand('Get-CloneCreationStats', {});
    }

    return res.json({
      success: true,
      data: {
        totalClones: stats?.totalClones || 0,
        successfulClones: stats?.successfulClones || 0,
        failedClones: stats?.failedClones || 0,
        averageCreationTimeSeconds: stats?.averageCreationTimeSeconds || 0,
        minCreationTimeSeconds: stats?.minCreationTimeSeconds || 0,
        maxCreationTimeSeconds: stats?.maxCreationTimeSeconds || 0,
        successRatePercent: stats?.successRatePercent || 100,
        creationTimesByGoldenImage: stats?.creationTimesByGoldenImage || []
      },
      message: 'Clone statistics retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`Error retrieving clone statistics: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/metrics/storage
 * Retrieves storage analysis metrics
 * Returns: VHDX sizes, compression ratio, storage breakdown by clone
 */
router.get('/storage', async (_req: Request, res: Response) => {
  try {
    logger.info('Retrieving storage metrics');

    const sqlClient = getSqlClient();
    const metricsRepo = getMetricsRepository();

    let storage: any;

    // Try SQL first if available
    if (sqlClient) {
      try {
        storage = await metricsRepo.getStorageMetrics();
      } catch (sqlError: any) {
        logger.warn(`SQL query failed, falling back to PowerShell: ${sqlError.message}`);
        storage = await psService.executeCommand('Get-StorageStats', {});
      }
    } else {
      storage = await psService.executeCommand('Get-StorageStats', {});
    }

    return res.json({
      success: true,
      data: {
        totalUsedGB: storage?.totalUsedGB || 0,
        totalSavingsGB: storage?.totalSavingsGB || 0,
        compressionRatioPercent: storage?.compressionRatioPercent || 0,
        avgCloneSizeGB: storage?.avgCloneSizeGB || 0,
        totalParentSizeGB: storage?.totalParentSizeGB || 0,
        cloneStorageBreakdown: storage?.cloneStorageBreakdown || [],
        storageEfficiency: {
          compressionRatioPercent: storage?.compressionRatioPercent || 0,
          estimatedBackupVsCloneSize: storage?.totalParentSizeGB || 0,
          storageSavedGB: storage?.totalSavingsGB || 0
        }
      },
      message: 'Storage metrics retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`Error retrieving storage metrics: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/metrics/operations
 * Retrieves operation statistics and success rates
 * Returns: operation success/failure rates by method
 */
router.get('/operations', async (_req: Request, res: Response) => {
  try {
    logger.info('Retrieving operation metrics');

    const sqlClient = getSqlClient();
    const metricsRepo = getMetricsRepository();

    let operations: any;

    // Try SQL first if available
    if (sqlClient) {
      try {
        operations = await metricsRepo.getOperationMetrics();
      } catch (sqlError: any) {
        logger.warn(`SQL query failed, falling back to PowerShell: ${sqlError.message}`);
        operations = await psService.executeCommand('Get-OperationStats', {});
      }
    } else {
      operations = await psService.executeCommand('Get-OperationStats', {});
    }

    return res.json({
      success: true,
      data: {
        totalOperations: operations?.totalOperations || 0,
        successfulOperations: operations?.successfulOperations || 0,
        failedOperations: operations?.failedOperations || 0,
        successRatePercent: operations?.successRatePercent || 100,
        operationsByType: operations?.operationsByType || [],
        summary: {
          totalOperations: operations?.totalOperations || 0,
          successRate: operations?.successRatePercent || 100,
          topOperation: operations?.operationsByType?.[0]?.type || 'unknown',
          topOperationCount: operations?.operationsByType?.[0]?.count || 0
        }
      },
      message: 'Operation metrics retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`Error retrieving operation metrics: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/metrics/timeline
 * Retrieves historical timeline data for charts
 * Query params:
 *   - hoursBack: number of hours to look back (default: 24)
 *   - groupBy: 'hour' or 'day' (default: 'hour')
 */
router.get('/timeline', async (req: Request, res: Response) => {
  try {
    const hoursBack = parseInt(req.query.hoursBack as string) || 24;
    const groupBy = (req.query.groupBy as string) || 'hour';

    logger.info(`Retrieving timeline data for last ${hoursBack} hours, grouped by ${groupBy}`);

    if (hoursBack < 1 || hoursBack > 8760) {
      return res.status(400).json({
        success: false,
        message: 'hoursBack must be between 1 and 8760'
      });
    }

    if (groupBy !== 'hour' && groupBy !== 'day') {
      return res.status(400).json({
        success: false,
        message: 'groupBy must be either "hour" or "day"'
      });
    }

    const timeline = await psService.executeCommand('Get-TimelineData', {
      HoursBack: hoursBack,
      GroupBy: groupBy
    });

    return res.json({
      success: true,
      data: {
        cloneCreations: timeline?.cloneCreations || [],
        operations: timeline?.operations || [],
        timelineStart: timeline?.timelineStart,
        timelineEnd: timeline?.timelineEnd,
        groupBy: groupBy,
        hoursBack: hoursBack
      },
      message: 'Timeline data retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`Error retrieving timeline data: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/metrics/all
 * Convenience endpoint that retrieves all metrics at once
 * Combines overview, clones, storage, and operations
 */
router.get('/all', async (_req: Request, res: Response) => {
  try {
    logger.info('Retrieving all metrics');

    const toArray = (value: any): any[] => {
      if (value == null) return [];
      const items = Array.isArray(value) ? value : [value];
      return items.filter(item => {
        if (item == null) return false;
        return typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length > 0;
      });
    };

    const safeCommand = async (command: string, params: Record<string, any>) => {
      try {
        return await psService.executeCommand(command, params);
      } catch (error: any) {
        logger.warn(`Metrics command ${command} failed; using defaults: ${error.message}`);
        return [];
      }
    };

    const [goldenImagesResult, clonesResult] = await Promise.all([
      safeCommand('Get-FlashdbGoldenImage', {}),
      safeCommand('Get-FlashdbClone', {})
    ]);

    const goldenImages = toArray(goldenImagesResult);
    const cloneItems = toArray(clonesResult);
    const toNumber = (value: any, fallback = 0): number => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const bytesToGB = (bytes: any): number => toNumber(bytes) / 1024 / 1024 / 1024;
    const taskQueue = getTaskQueue();
    const queueSnapshot = taskQueue.getAllTasks();
    const queueTasks = [
      ...queueSnapshot.queue,
      ...queueSnapshot.completed,
      ...queueSnapshot.failed
    ].filter(task => /checkpoint$/.test(task.type));
    const completedTasks = queueTasks.filter(task => task.status === 'completed').length;
    const failedTasks = queueTasks.filter(task => task.status === 'failed').length;
    const successfulTaskRate = queueTasks.length > 0 ? (completedTasks / queueTasks.length) * 100 : 100;
    const goldenImageById = new Map<string, any>();
    goldenImages.forEach(image => {
      const id = image.Id || image.id;
      if (id) goldenImageById.set(String(id), image);
    });
    const failedClones = cloneItems.filter(clone => /failed/i.test(clone.Status || clone.status || '')).length;
    const successfulClones = Math.max(0, cloneItems.length - failedClones);
    const activeClones = cloneItems.filter(clone => /ready|attached/i.test(clone.Status || clone.status || '')).length;
    const cloneStorageBreakdown = cloneItems.map(clone => {
      const goldenImage = goldenImageById.get(String(clone.GoldenImageId || clone.goldenImageId || ''));
      const cloneSizeBytes = clone.SizeBytes || clone.sizeBytes || clone.Size || clone.size || clone.VhdxSizeBytes || clone.vhdxSizeBytes;
      const parentSizeBytes = clone.ParentSizeBytes || clone.parentSizeBytes || clone.ParentSize || clone.parentSize || goldenImage?.SizeBytes || goldenImage?.sizeBytes || goldenImage?.Size || goldenImage?.size;
      const vhdxSizeGB = bytesToGB(cloneSizeBytes || parentSizeBytes);
      const parentSizeGB = bytesToGB(parentSizeBytes || cloneSizeBytes);
      const savingsGB = Math.max(0, parentSizeGB - vhdxSizeGB);

      return {
        cloneId: clone.Id || clone.id,
        cloneName: clone.Name || clone.name,
        databaseName: clone.DatabaseName || clone.databaseName,
        tableCount: toNumber(clone.TableCount || clone.tableCount),
        rows: toNumber(clone.RowCount || clone.rowCount),
        vhdxSizeGB,
        parentSizeGB,
        savingsGB
      };
    });
    const totalUsedGB = cloneStorageBreakdown.reduce((sum, clone) => sum + clone.vhdxSizeGB, 0);
    const totalParentSizeGB = cloneStorageBreakdown.reduce((sum, clone) => sum + clone.parentSizeGB, 0);
    const totalSavingsGB = cloneStorageBreakdown.reduce((sum, clone) => sum + clone.savingsGB, 0);
    const compressionRatioPercent = totalParentSizeGB > 0 ? (totalSavingsGB / totalParentSizeGB) * 100 : 0;
    const last24hCutoff = Date.now() - 24 * 60 * 60 * 1000;
    const operationsLast24h = queueTasks
      .filter(task => {
        const createdAt = task.startedAt || task.createdAt;
        return createdAt && new Date(createdAt).getTime() >= last24hCutoff;
      }).length;
    const operationTypeCounts = queueTasks.reduce((acc, task) => {
      const type = task.type.replace('-checkpoint', '');
      if (!acc[type]) {
        acc[type] = { total: 0, successful: 0 };
      }
      acc[type].total++;
      if (task.status === 'completed') {
        acc[type].successful++;
      }
      return acc;
    }, {} as Record<string, { total: number; successful: number }>);
    const operationsByType = Object.entries(operationTypeCounts)
      .map(([type, counts]) => ({
        type,
        count: counts.total,
        successRatePercent: counts.total > 0 ? (counts.successful / counts.total) * 100 : 100
      }))
      .sort((a, b) => b.count - a.count);
    const operationBuckets = new Map<string, number>();
    for (let i = 23; i >= 0; i--) {
      const bucket = new Date(Date.now() - i * 60 * 60 * 1000);
      bucket.setMinutes(0, 0, 0);
      operationBuckets.set(bucket.toISOString(), 0);
    }
    queueTasks.forEach(task => {
      const timestamp = task.startedAt || task.createdAt;
      if (!timestamp) return;
      const taskTime = new Date(timestamp);
      if (Number.isNaN(taskTime.getTime()) || taskTime.getTime() < last24hCutoff) return;
      taskTime.setMinutes(0, 0, 0);
      const key = taskTime.toISOString();
      operationBuckets.set(key, (operationBuckets.get(key) || 0) + 1);
    });

    const overviewData = {
      totalClonesCreated: cloneItems.length,
      totalStorageSavedGB: totalSavingsGB,
      avgCloneCreationTimeSeconds: 0,
      operationSuccessRatePercent: successfulTaskRate,
      operationsLast24h,
      activeClonesCount: activeClones
    };

    const clones = {
      totalClones: cloneItems.length,
      successfulClones,
      failedClones,
      averageCreationTimeSeconds: 0,
      minCreationTimeSeconds: 0,
      maxCreationTimeSeconds: 0,
      successRatePercent: cloneItems.length === 0 ? 100 : (successfulClones / cloneItems.length) * 100,
      creationTimesByGoldenImage: []
    };

    const storage = {
      totalUsedGB,
      totalSavingsGB,
      compressionRatioPercent,
      totalParentSizeGB,
      avgCloneSizeGB: cloneStorageBreakdown.length > 0 ? totalUsedGB / cloneStorageBreakdown.length : 0,
      cloneStorageBreakdown
    };

    const operations = {
      totalOperations: queueTasks.length,
      successfulOperations: completedTasks,
      failedOperations: failedTasks,
      successRatePercent: successfulTaskRate,
      operationsByType
    };

    const timeline = {
      cloneCreations: cloneItems.map(clone => ({
        timestamp: clone.CreatedAt || clone.createdAt,
        clones: 1,
        cloneName: clone.Name || clone.name
      })),
      operations: Array.from(operationBuckets.entries()).map(([timestamp, operations]) => ({
        timestamp,
        operations
      })),
      timelineStart: new Date(last24hCutoff).toISOString(),
      timelineEnd: new Date().toISOString()
    };

    return res.json({
      success: true,
      data: {
        overview: {
          totalClonesCreated: overviewData.totalClonesCreated || 0,
          totalStorageSavedGB: overviewData.totalStorageSavedGB || 0,
          avgCloneCreationTimeSeconds: overviewData.avgCloneCreationTimeSeconds || 0,
          operationSuccessRatePercent: overviewData.operationSuccessRatePercent ?? 100,
          operationsLast24h,
          activeClonesCount: overviewData.activeClonesCount || 0
        },
        cloneStatistics: {
          totalClones: clones?.totalClones || 0,
          successfulClones: clones?.successfulClones || 0,
          failedClones: clones?.failedClones || 0,
          averageCreationTimeSeconds: clones?.averageCreationTimeSeconds || 0,
          minCreationTimeSeconds: clones?.minCreationTimeSeconds || 0,
          maxCreationTimeSeconds: clones?.maxCreationTimeSeconds || 0,
          successRatePercent: clones?.successRatePercent || 0,
          creationTimesByGoldenImage: clones?.creationTimesByGoldenImage || []
        },
        storageMetrics: {
          totalUsedGB: storage?.totalUsedGB || 0,
          totalSavingsGB: storage?.totalSavingsGB || 0,
          compressionRatioPercent: storage?.compressionRatioPercent || 0,
          totalParentSizeGB: storage?.totalParentSizeGB || 0,
          avgCloneSizeGB: storage?.avgCloneSizeGB || 0,
          cloneStorageBreakdown: storage?.cloneStorageBreakdown || []
        },
        operationMetrics: {
          totalOperations: operations?.totalOperations || 0,
          successfulOperations: operations?.successfulOperations || 0,
          failedOperations: operations?.failedOperations || 0,
          successRatePercent: operations?.successRatePercent ?? 100,
          operationsByType: operations?.operationsByType || []
        },
        timeline: {
          cloneCreations: timeline?.cloneCreations || [],
          operations: timeline?.operations || [],
          timelineStart: timeline?.timelineStart,
          timelineEnd: timeline?.timelineEnd
        },
        timestamp: new Date().toISOString()
      },
      message: 'All metrics retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`Error retrieving all metrics: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/metrics/pool
 * Retrieves connection pool status and metrics
 * Returns: active connections, idle connections, pool size, error count, etc.
 */
router.get('/pool', async (_req: Request, res: Response) => {
  try {
    logger.info('Retrieving connection pool metrics');
    const pool = getConnectionPool();
    const metrics = pool.getMetrics();
    const cacheStats = pool.getCacheStats();

    return res.json({
      success: true,
      data: {
        pool: {
          size: metrics.size,
          available: metrics.available,
          idle: metrics.idle,
          activeConnections: metrics.activeConnections,
          pending: metrics.pending,
          totalCreated: metrics.totalCreated,
          totalDestroyed: metrics.totalDestroyed,
          errorCount: metrics.errorCount,
          averageWaitTimeMs: metrics.averageWaitTime
        },
        cache: {
          keys: cacheStats.keys,
          hits: cacheStats.hits,
          misses: cacheStats.misses,
          ksize: cacheStats.ksize,
          vsize: cacheStats.vsize
        },
        timestamp: new Date().toISOString()
      },
      message: 'Connection pool metrics retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`Error retrieving pool metrics: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/metrics/queue
 * Retrieves task queue metrics
 * Returns: queue depth, pending tasks, processing tasks, completed, failed, error count, etc.
 */
router.get('/queue', async (_req: Request, res: Response) => {
  try {
    logger.info('Retrieving task queue metrics');
    const taskQueue = getTaskQueue();
    const metrics: any = taskQueue.getMetrics();
    const pending = metrics.pending ?? metrics.pendingTasks ?? metrics.queueDepth ?? 0;
    const processing = metrics.processing ?? metrics.processingTasks ?? 0;
    const completed = metrics.completed ?? metrics.completedTasks ?? metrics.totalTasksProcessed ?? 0;
    const failed = metrics.failed ?? metrics.failedTasks ?? 0;

    return res.json({
      success: true,
      data: {
        ...metrics,
        pending,
        processing,
        completed,
        failed,
        totalEnqueued: metrics.totalEnqueued ?? pending + processing + completed + failed,
        maxRetries: metrics.maxRetries ?? 0,
        timestamp: new Date().toISOString()
      },
      message: 'Task queue metrics retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`Error retrieving task queue metrics: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
