import { Router, Request, Response } from 'express';
import { getInstanceConfig } from '../config/instanceConfig';
import logger from '../logger';

const router = Router();

/**
 * GET /api/admin/instance
 * Get current instance information
 */
router.get('/instance', async (_req: Request, res: Response) => {
  try {
    const config = getInstanceConfig();
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
  } catch (error: any) {
    logger.error(`Error retrieving instance info: ${error.message}`);
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
router.get('/instances', async (_req: Request, res: Response) => {
  try {
    const config = getInstanceConfig();
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
  } catch (error: any) {
    logger.error(`Error retrieving instances: ${error.message}`);
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
router.get('/cluster-status', async (_req: Request, res: Response) => {
  try {
    const config = getInstanceConfig();
    const status = await config.getClusterStatus();
    const currentInstance = config.getInstanceInfo();
    const inactiveInstances = Math.max(
      0,
      status.totalInstances - status.activeInstances - status.unhealthyInstances
    );
    const clusterHealth = status.activeInstances > 0 ? 'healthy' : 'unhealthy';

    return res.json({
      success: true,
      data: {
        clusterEnabled: config.isClusterMode(),
        clusterHealth,
        status: clusterHealth,
        totalInstances: status.totalInstances,
        activeInstances: status.activeInstances,
        inactiveInstances,
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
  } catch (error: any) {
    logger.error(`Error retrieving cluster status: ${error.message}`);
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
router.post('/cleanup', async (_req: Request, res: Response) => {
  try {
    const config = getInstanceConfig();
    const deleted = await config.cleanupStaleInstances();

    return res.json({
      success: true,
      data: {
        staleInstancesRemoved: deleted,
        timestamp: new Date().toISOString()
      },
      message: `Cleaned up ${deleted} stale instance registrations`
    });
  } catch (error: any) {
    logger.error(`Error cleaning up stale instances: ${error.message}`);
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
router.post('/heartbeat', async (_req: Request, res: Response) => {
  try {
    const config = getInstanceConfig();
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
  } catch (error: any) {
    logger.error(`Error sending heartbeat: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
