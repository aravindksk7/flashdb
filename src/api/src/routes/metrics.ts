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

    const [overview, clones, storage, operations, timeline] = await Promise.all([
      psService.executeCommand('Get-FlashdbMetrics', {}),
      psService.executeCommand('Get-CloneCreationStats', {}),
      psService.executeCommand('Get-StorageStats', {}),
      psService.executeCommand('Get-OperationStats', {}),
      psService.executeCommand('Get-TimelineData', {
        HoursBack: 24,
        GroupBy: 'hour'
      })
    ]);

    const overviewData = overview?.overview || {};
    const operationsLast24h = typeof overviewData.operationsLast24h === 'number'
      ? overviewData.operationsLast24h
      : 0;

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
    const metrics = taskQueue.getMetrics();

    return res.json({
      success: true,
      data: {
        ...metrics,
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
