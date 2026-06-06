"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pooledPowershellService_1 = require("../services/pooledPowershellService");
const connectionPool_1 = require("../services/connectionPool");
const logger_1 = __importDefault(require("../logger"));
const router = (0, express_1.Router)();
const psService = (0, pooledPowershellService_1.getPooledPowerShellService)();
/**
 * GET /api/metrics/overview
 * Retrieves comprehensive metrics overview
 * Returns: summary stats (total clones, storage used, operations/day)
 */
router.get('/overview', async (_req, res) => {
    try {
        logger_1.default.info('Retrieving metrics overview');
        const metrics = await psService.executeCommand('Get-FlashdbMetrics', {});
        // Extract overview from metrics
        const overview = metrics?.overview || {
            totalClonesCreated: 0,
            totalStorageSavedGB: 0,
            avgCloneCreationTimeSeconds: 0,
            operationSuccessRatePercent: 100,
            operationsLast24h: 0,
            activeClonesCount: 0
        };
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
    }
    catch (error) {
        logger_1.default.error(`Error retrieving metrics overview: ${error.message}`);
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
router.get('/clones', async (_req, res) => {
    try {
        logger_1.default.info('Retrieving clone statistics');
        const stats = await psService.executeCommand('Get-CloneCreationStats', {});
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
    }
    catch (error) {
        logger_1.default.error(`Error retrieving clone statistics: ${error.message}`);
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
router.get('/storage', async (_req, res) => {
    try {
        logger_1.default.info('Retrieving storage metrics');
        const storage = await psService.executeCommand('Get-StorageStats', {});
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
    }
    catch (error) {
        logger_1.default.error(`Error retrieving storage metrics: ${error.message}`);
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
router.get('/operations', async (_req, res) => {
    try {
        logger_1.default.info('Retrieving operation metrics');
        const operations = await psService.executeCommand('Get-OperationStats', {});
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
    }
    catch (error) {
        logger_1.default.error(`Error retrieving operation metrics: ${error.message}`);
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
router.get('/timeline', async (req, res) => {
    try {
        const hoursBack = parseInt(req.query.hoursBack) || 24;
        const groupBy = req.query.groupBy || 'hour';
        logger_1.default.info(`Retrieving timeline data for last ${hoursBack} hours, grouped by ${groupBy}`);
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
    }
    catch (error) {
        logger_1.default.error(`Error retrieving timeline data: ${error.message}`);
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
router.get('/all', async (_req, res) => {
    try {
        logger_1.default.info('Retrieving all metrics');
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
    }
    catch (error) {
        logger_1.default.error(`Error retrieving all metrics: ${error.message}`);
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
router.get('/pool', async (_req, res) => {
    try {
        logger_1.default.info('Retrieving connection pool metrics');
        const pool = (0, connectionPool_1.getConnectionPool)();
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
    }
    catch (error) {
        logger_1.default.error(`Error retrieving pool metrics: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=metrics.js.map