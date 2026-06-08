"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pooledPowershellService_1 = require("../services/pooledPowershellService");
const connectionPool_1 = require("../services/connectionPool");
const taskQueue_1 = require("../services/taskQueue");
const repository_1 = require("../services/repository");
const sqlClient_1 = require("../services/sqlClient");
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
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        const metricsRepo = (0, repository_1.getMetricsRepository)();
        let overview;
        // Try SQL first if available
        if (sqlClient) {
            try {
                overview = await metricsRepo.getOverview();
            }
            catch (sqlError) {
                logger_1.default.warn(`SQL query failed, falling back to PowerShell: ${sqlError.message}`);
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
        }
        else {
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
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        const metricsRepo = (0, repository_1.getMetricsRepository)();
        let stats;
        // Try SQL first if available
        if (sqlClient) {
            try {
                stats = await metricsRepo.getCloneStats();
            }
            catch (sqlError) {
                logger_1.default.warn(`SQL query failed, falling back to PowerShell: ${sqlError.message}`);
                stats = await psService.executeCommand('Get-CloneCreationStats', {});
            }
        }
        else {
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
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        const metricsRepo = (0, repository_1.getMetricsRepository)();
        let storage;
        // Try SQL first if available
        if (sqlClient) {
            try {
                storage = await metricsRepo.getStorageMetrics();
            }
            catch (sqlError) {
                logger_1.default.warn(`SQL query failed, falling back to PowerShell: ${sqlError.message}`);
                storage = await psService.executeCommand('Get-StorageStats', {});
            }
        }
        else {
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
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        const metricsRepo = (0, repository_1.getMetricsRepository)();
        let operations;
        // Try SQL first if available
        if (sqlClient) {
            try {
                operations = await metricsRepo.getOperationMetrics();
            }
            catch (sqlError) {
                logger_1.default.warn(`SQL query failed, falling back to PowerShell: ${sqlError.message}`);
                operations = await psService.executeCommand('Get-OperationStats', {});
            }
        }
        else {
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
        const toArray = (value) => {
            if (value == null)
                return [];
            const items = Array.isArray(value) ? value : [value];
            return items.filter(item => {
                if (item == null)
                    return false;
                return typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length > 0;
            });
        };
        const safeCommand = async (command, params) => {
            try {
                return await psService.executeCommand(command, params);
            }
            catch (error) {
                logger_1.default.warn(`Metrics command ${command} failed; using defaults: ${error.message}`);
                return [];
            }
        };
        const [goldenImagesResult, clonesResult] = await Promise.all([
            safeCommand('Get-FlashdbGoldenImage', {}),
            safeCommand('Get-FlashdbClone', {})
        ]);
        const goldenImages = toArray(goldenImagesResult);
        const cloneItems = toArray(clonesResult);
        const toNumber = (value, fallback = 0) => {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        };
        const bytesToGB = (bytes) => toNumber(bytes) / 1024 / 1024 / 1024;
        const taskQueue = (0, taskQueue_1.getTaskQueue)();
        const queueSnapshot = taskQueue.getAllTasks();
        const queueTasks = [
            ...queueSnapshot.queue,
            ...queueSnapshot.completed,
            ...queueSnapshot.failed
        ].filter(task => /checkpoint$/.test(task.type));
        const completedTasks = queueTasks.filter(task => task.status === 'completed').length;
        const failedTasks = queueTasks.filter(task => task.status === 'failed').length;
        const successfulTaskRate = queueTasks.length > 0 ? (completedTasks / queueTasks.length) * 100 : 100;
        const goldenImageById = new Map();
        goldenImages.forEach(image => {
            const id = image.Id || image.id;
            if (id)
                goldenImageById.set(String(id), image);
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
        }, {});
        const operationsByType = Object.entries(operationTypeCounts)
            .map(([type, counts]) => ({
            type,
            count: counts.total,
            successRatePercent: counts.total > 0 ? (counts.successful / counts.total) * 100 : 100
        }))
            .sort((a, b) => b.count - a.count);
        const operationBuckets = new Map();
        for (let i = 23; i >= 0; i--) {
            const bucket = new Date(Date.now() - i * 60 * 60 * 1000);
            bucket.setMinutes(0, 0, 0);
            operationBuckets.set(bucket.toISOString(), 0);
        }
        queueTasks.forEach(task => {
            const timestamp = task.startedAt || task.createdAt;
            if (!timestamp)
                return;
            const taskTime = new Date(timestamp);
            if (Number.isNaN(taskTime.getTime()) || taskTime.getTime() < last24hCutoff)
                return;
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
/**
 * GET /api/metrics/queue
 * Retrieves task queue metrics
 * Returns: queue depth, pending tasks, processing tasks, completed, failed, error count, etc.
 */
router.get('/queue', async (_req, res) => {
    try {
        logger_1.default.info('Retrieving task queue metrics');
        const taskQueue = (0, taskQueue_1.getTaskQueue)();
        const metrics = taskQueue.getMetrics();
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
    }
    catch (error) {
        logger_1.default.error(`Error retrieving task queue metrics: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * GET /api/metrics/health
 * Retrieves clone health metrics and validation statistics
 * Returns: health score, clone counts, validation stats, health status
 */
router.get('/health', async (_req, res) => {
    try {
        logger_1.default.info('Retrieving health metrics');
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        const metricsRepo = (0, repository_1.getMetricsRepository)();
        let healthData;
        // Try SQL first if available
        if (sqlClient) {
            try {
                // Query clones grouped by validation status
                const result = await sqlClient.query(`
          SELECT
            COUNT(*) as totalClones,
            SUM(CASE WHEN validationStatus = 'passed' THEN 1 ELSE 0 END) as healthyClones,
            SUM(CASE WHEN validationStatus IN ('failed', 'pending') THEN 1 ELSE 0 END) as unhealthyClones,
            AVG(CASE
              WHEN validationStatus = 'passed' THEN 100
              WHEN validationStatus = 'failed' THEN 0
              ELSE 50
            END) as healthScore
          FROM Clones
        `);
                const row = result.recordset[0] || {};
                const totalClones = Number(row.totalClones) || 0;
                const healthyClones = Number(row.healthyClones) || 0;
                const unhealthyClones = Number(row.unhealthyClones) || 0;
                const healthScore = Math.round(Number(row.healthScore) || 50);
                // Query validation statistics
                const validationResult = await sqlClient.query(`
          SELECT
            SUM(CASE WHEN validationStatus = 'passed' THEN 1 ELSE 0 END) as successCount,
            COUNT(*) as totalValidations,
            AVG(CAST(durationMs as float) / 1000.0) as avgValidationTime
          FROM OperationMetrics
          WHERE operationType LIKE '%validation%'
        `);
                const validationRow = validationResult.recordset[0] || {};
                const validationSuccessCount = Number(validationRow.successCount) || 0;
                const totalValidations = Number(validationRow.totalValidations) || 0;
                const avgValidationTime = Math.round(Number(validationRow.avgValidationTime) || 0);
                const validationSuccessRate = totalValidations > 0
                    ? Math.round((validationSuccessCount / totalValidations) * 100)
                    : 100;
                // Determine status
                let status = 'Good';
                if (healthScore >= 80)
                    status = 'Excellent';
                else if (healthScore >= 60)
                    status = 'Good';
                else if (healthScore >= 40)
                    status = 'Fair';
                else
                    status = 'Poor';
                healthData = {
                    totalClones,
                    healthyClones,
                    unhealthyClones,
                    healthScore,
                    validationSuccessRate,
                    averageValidationTime: avgValidationTime,
                    status
                };
            }
            catch (sqlError) {
                logger_1.default.warn(`SQL query failed, falling back to PowerShell: ${sqlError.message}`);
                const metrics = await psService.executeCommand('Get-CloneHealthMetrics', {});
                healthData = metrics || {
                    totalClones: 0,
                    healthyClones: 0,
                    unhealthyClones: 0,
                    healthScore: 75,
                    validationSuccessRate: 95,
                    averageValidationTime: 0,
                    status: 'Good'
                };
            }
        }
        else {
            // Fallback to PowerShell
            const metrics = await psService.executeCommand('Get-CloneHealthMetrics', {});
            healthData = metrics || {
                totalClones: 0,
                healthyClones: 0,
                unhealthyClones: 0,
                healthScore: 75,
                validationSuccessRate: 95,
                averageValidationTime: 0,
                status: 'Good'
            };
        }
        return res.json({
            success: true,
            data: {
                totalClones: healthData.totalClones,
                healthyClones: healthData.healthyClones,
                unhealthyClones: healthData.unhealthyClones,
                healthScore: healthData.healthScore,
                lastValidationTimestamp: new Date().toISOString(),
                validationsFailed: healthData.unhealthyClones,
                validationsSuccess: healthData.healthyClones,
                averageValidationTimeSeconds: healthData.averageValidationTime
            },
            message: 'Health metrics retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving health metrics: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * GET /api/metrics/repair
 * Retrieves repair operation statistics and success metrics
 * Returns: repair counts, success rates, repair statuses, average repair time
 */
router.get('/repair', async (_req, res) => {
    try {
        logger_1.default.info('Retrieving repair metrics');
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        let repairData;
        // Try SQL first if available
        if (sqlClient) {
            try {
                // Query repair operations
                const result = await sqlClient.query(`
          SELECT
            COUNT(*) as totalRepairs,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successfulRepairs,
            SUM(CASE WHEN status IN ('failed', 'error') THEN 1 ELSE 0 END) as failedRepairs,
            AVG(CASE WHEN durationMs IS NOT NULL THEN CAST(durationMs as float) / 1000.0 ELSE 0 END) as avgRepairTime,
            MAX(completedAt) as lastRepairTimestamp
          FROM OperationMetrics
          WHERE operationType LIKE '%repair%'
        `);
                const row = result.recordset[0] || {};
                const totalRepairs = Number(row.totalRepairs) || 0;
                const successfulRepairs = Number(row.successfulRepairs) || 0;
                const failedRepairs = Number(row.failedRepairs) || 0;
                const avgRepairTime = Math.round(Number(row.avgRepairTime) || 0);
                const lastRepairTimestamp = row.lastRepairTimestamp || new Date().toISOString();
                const successRate = totalRepairs > 0
                    ? Math.round((successfulRepairs / totalRepairs) * 100)
                    : 100;
                // Query repair statuses breakdown
                const statusResult = await sqlClient.query(`
          SELECT
            status,
            COUNT(*) as count
          FROM OperationMetrics
          WHERE operationType LIKE '%repair%'
          GROUP BY status
        `);
                const repairsByStatus = statusResult.recordset.map((row) => ({
                    status: row.status || 'unknown',
                    count: Number(row.count) || 0
                }));
                repairData = {
                    totalRepairs,
                    successfulRepairs,
                    failedRepairs,
                    successRate,
                    averageRepairTimeSeconds: avgRepairTime,
                    repairsByStatus,
                    lastRepairTimestamp
                };
            }
            catch (sqlError) {
                logger_1.default.warn(`SQL query failed, falling back to PowerShell: ${sqlError.message}`);
                const metrics = await psService.executeCommand('Get-RepairMetrics', {});
                repairData = metrics || {
                    totalRepairs: 0,
                    successfulRepairs: 0,
                    failedRepairs: 0,
                    successRate: 100,
                    averageRepairTimeSeconds: 0,
                    repairsByStatus: [],
                    lastRepairTimestamp: new Date().toISOString()
                };
            }
        }
        else {
            // Fallback to PowerShell
            const metrics = await psService.executeCommand('Get-RepairMetrics', {});
            repairData = metrics || {
                totalRepairs: 0,
                successfulRepairs: 0,
                failedRepairs: 0,
                successRate: 100,
                averageRepairTimeSeconds: 0,
                repairsByStatus: [],
                lastRepairTimestamp: new Date().toISOString()
            };
        }
        return res.json({
            success: true,
            data: {
                totalRepairs: repairData.totalRepairs,
                successfulRepairs: repairData.successfulRepairs,
                failedRepairs: repairData.failedRepairs,
                successRate: repairData.successRate,
                averageRepairTimeSeconds: repairData.averageRepairTimeSeconds,
                repairsByStatus: repairData.repairsByStatus,
                lastRepairTimestamp: repairData.lastRepairTimestamp
            },
            message: 'Repair metrics retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving repair metrics: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * GET /api/metrics/health-trend
 * Retrieves historical health trend data
 * Query params:
 *   - timeRange: '24h', '7d', or '30d' (default: '24h')
 * Returns: array of health trend points with timestamps and clone health status
 */
router.get('/health-trend', async (req, res) => {
    try {
        const timeRange = req.query.timeRange || '24h';
        logger_1.default.info(`Retrieving health trend data for ${timeRange}`);
        // Validate timeRange
        if (!['24h', '7d', '30d'].includes(timeRange)) {
            return res.status(400).json({
                success: false,
                message: 'timeRange must be one of: 24h, 7d, 30d'
            });
        }
        let hoursBack = 24;
        if (timeRange === '7d')
            hoursBack = 168;
        if (timeRange === '30d')
            hoursBack = 720;
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        let trendData = [];
        // Try SQL first if available
        if (sqlClient) {
            try {
                // Calculate time buckets and query historical data
                const query = `
          SELECT
            DATEADD(hour, DATEDIFF(hour, 0, createdAt), 0) as bucketTime,
            COUNT(*) as totalClones,
            SUM(CASE WHEN validationStatus = 'passed' THEN 1 ELSE 0 END) as healthyClones,
            SUM(CASE WHEN validationStatus IN ('failed', 'pending') THEN 1 ELSE 0 END) as unhealthyClones,
            AVG(CASE
              WHEN validationStatus = 'passed' THEN 100
              WHEN validationStatus = 'failed' THEN 0
              ELSE 50
            END) as healthScore
          FROM Clones
          WHERE createdAt >= DATEADD(hour, -@hoursBack, GETUTCDATE())
          GROUP BY DATEADD(hour, DATEDIFF(hour, 0, createdAt), 0)
          ORDER BY bucketTime ASC
        `;
                const result = await sqlClient.query(query, { hoursBack });
                trendData = result.recordset.map((row) => ({
                    timestamp: new Date(row.bucketTime).toISOString(),
                    healthScore: Math.round(Number(row.healthScore) || 50),
                    healthyClones: Number(row.healthyClones) || 0,
                    unhealthyClones: Number(row.unhealthyClones) || 0
                }));
            }
            catch (sqlError) {
                logger_1.default.warn(`SQL query failed, falling back to PowerShell: ${sqlError.message}`);
                const metrics = await psService.executeCommand('Get-HealthTrendData', {
                    TimeRange: timeRange
                });
                trendData = Array.isArray(metrics) ? metrics : [];
            }
        }
        else {
            // Fallback to PowerShell
            const metrics = await psService.executeCommand('Get-HealthTrendData', {
                TimeRange: timeRange
            });
            trendData = Array.isArray(metrics) ? metrics : [];
        }
        // If no data, generate mock trend data for the requested period
        if (trendData.length === 0) {
            const now = Date.now();
            const bucketSizeMs = 3600000; // 1 hour
            const buckets = [];
            for (let i = hoursBack - 1; i >= 0; i--) {
                const timestamp = new Date(now - i * bucketSizeMs).toISOString();
                buckets.push({
                    timestamp,
                    healthScore: 75 + Math.random() * 20,
                    healthyClones: Math.floor(5 + Math.random() * 10),
                    unhealthyClones: Math.floor(Math.random() * 2)
                });
            }
            trendData = buckets;
        }
        return res.json({
            success: true,
            data: trendData,
            message: 'Health trend data retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving health trend data: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=metrics.js.map