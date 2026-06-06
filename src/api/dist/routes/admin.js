"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const instanceConfig_1 = require("../config/instanceConfig");
const logger_1 = __importDefault(require("../logger"));
const router = (0, express_1.Router)();
/**
 * GET /api/admin/instance
 * Get current instance information
 */
router.get('/instance', async (_req, res) => {
    try {
        const config = (0, instanceConfig_1.getInstanceConfig)();
        const info = config.getInstanceInfo();
        return res.json({
            success: true,
            data: {
                instanceId: info.instanceId,
                role: info.role,
                status: info.status,
                host: info.host,
                port: info.port,
                version: info.version,
                lastHeartbeat: info.lastHeartbeat,
                isPrimary: config.isPrimary(),
                isClusterMode: config.isClusterMode()
            },
            message: 'Current instance information'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving instance info: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * GET /api/admin/instances
 * List all active instances in the cluster
 */
router.get('/instances', async (_req, res) => {
    try {
        const config = (0, instanceConfig_1.getInstanceConfig)();
        const instances = await config.getActiveInstances();
        return res.json({
            success: true,
            data: {
                totalInstances: instances.length,
                instances: instances.map(i => ({
                    instanceId: i.instanceId,
                    role: i.role,
                    status: i.status,
                    host: i.host,
                    port: i.port,
                    version: i.version,
                    lastHeartbeat: i.lastHeartbeat,
                    isPrimary: i.role === 'primary'
                }))
            },
            message: 'Active instances in cluster'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving instances: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * GET /api/admin/cluster-status
 * Get overall cluster health status
 */
router.get('/cluster-status', async (_req, res) => {
    try {
        const config = (0, instanceConfig_1.getInstanceConfig)();
        const status = await config.getClusterStatus();
        const currentInstance = config.getInstanceInfo();
        return res.json({
            success: true,
            data: {
                clusterEnabled: config.isClusterMode(),
                clusterHealth: status.activeInstances > 0 ? 'healthy' : 'unhealthy',
                totalInstances: status.totalInstances,
                activeInstances: status.activeInstances,
                unhealthyInstances: status.unhealthyInstances,
                currentInstance: {
                    instanceId: currentInstance.instanceId,
                    isPrimary: config.isPrimary(),
                    role: currentInstance.role,
                    status: currentInstance.status
                },
                instances: status.instances.map(i => ({
                    instanceId: i.instanceId,
                    role: i.role,
                    status: i.status,
                    host: i.host,
                    port: i.port,
                    version: i.version,
                    lastHeartbeat: i.lastHeartbeat
                })),
                timestamp: new Date().toISOString()
            },
            message: 'Cluster health status'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving cluster status: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * POST /api/admin/cleanup
 * Manually trigger cleanup of stale instances (admin only)
 */
router.post('/cleanup', async (_req, res) => {
    try {
        const config = (0, instanceConfig_1.getInstanceConfig)();
        const deleted = await config.cleanupStaleInstances();
        return res.json({
            success: true,
            data: {
                staleInstancesRemoved: deleted,
                timestamp: new Date().toISOString()
            },
            message: `Cleaned up ${deleted} stale instance registrations`
        });
    }
    catch (error) {
        logger_1.default.error(`Error cleaning up stale instances: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * POST /api/admin/heartbeat
 * Manually trigger heartbeat (for monitoring)
 */
router.post('/heartbeat', async (_req, res) => {
    try {
        const config = (0, instanceConfig_1.getInstanceConfig)();
        await config.sendHeartbeat();
        const info = config.getInstanceInfo();
        return res.json({
            success: true,
            data: {
                instanceId: info.instanceId,
                lastHeartbeat: info.lastHeartbeat,
                status: info.status,
                timestamp: new Date().toISOString()
            },
            message: 'Heartbeat sent successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error sending heartbeat: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map