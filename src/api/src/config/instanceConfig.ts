import { v4 as uuidv4 } from 'uuid';
import { getSqlClient } from '../services/sqlClient';
import logger from '../logger';

/**
 * Instance configuration for multi-instance deployment
 * Enables stateless API instances with shared PostgreSQL state
 */
export type InstanceRole = 'primary' | 'replica';

export interface InstanceInfo {
  instanceId: string;
  role: InstanceRole;
  status: 'active' | 'inactive' | 'unhealthy';
  lastHeartbeat: Date;
  host: string;
  port: number;
  version: string;
}

export interface ClusterStatus {
  totalInstances: number;
  activeInstances: number;
  unhealthyInstances: number;
  instances: InstanceInfo[];
}

class InstanceConfig {
  private instanceId: string;
  private role: InstanceRole;
  private status: 'active' | 'inactive' = 'inactive';
  private lastHeartbeat: Date = new Date();
  private host: string = 'localhost';
  private port: number = 3001;
  private version: string = '1.0.0';
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private healthCheckInterval: number = 5000; // 5 seconds
  private stateSyncInterval: number = 5000; // 5 seconds
  private instanceTTL: number = 30000; // 30 seconds - instances are removed if no heartbeat for 30s
  private isClusterEnabled: boolean = true;

  constructor() {
    // Generate or load instance ID
    this.instanceId = process.env.INSTANCE_ID || uuidv4();
    this.role = (process.env.INSTANCE_ROLE || 'primary') as InstanceRole;
    this.host = process.env.INSTANCE_HOST || 'localhost';
    this.port = parseInt(process.env.PORT || '3001', 10);
    this.version = process.env.API_VERSION || '1.0.0';
    this.isClusterEnabled = process.env.CLUSTER_ENABLED !== 'false';

    logger.info(`Instance configured: ${this.instanceId} (role: ${this.role})`);
  }

  /**
   * Get the unique instance ID
   */
  getInstanceId(): string {
    return this.instanceId;
  }

  /**
   * Get instance role (primary or replica)
   */
  getRole(): InstanceRole {
    return this.role;
  }

  /**
   * Get current instance status
   */
  getStatus(): 'active' | 'inactive' {
    return this.status;
  }

  /**
   * Get instance information
   */
  getInstanceInfo(): InstanceInfo {
    return {
      instanceId: this.instanceId,
      role: this.role,
      status: this.status,
      lastHeartbeat: this.lastHeartbeat,
      host: this.host,
      port: this.port,
      version: this.version
    };
  }

  /**
   * Register this instance in the database
   */
  async registerInstance(): Promise<void> {
    if (!this.isClusterEnabled) {
      logger.info('Cluster mode disabled - skipping instance registration');
      this.status = 'active';
      return;
    }

    try {
      const sqlClient = getSqlClient();
      if (!sqlClient) {
        logger.warn('SQL client not available - cannot register instance');
        return;
      }

      const now = new Date();
      this.lastHeartbeat = now;

      // T-SQL MERGE statement for upsert
      const mergeSQL = `
        MERGE INTO [dbo].[flashdb_instances] AS target
        USING (SELECT @instanceId AS instance_id) AS source
        ON target.instance_id = source.instance_id
        WHEN MATCHED THEN
          UPDATE SET
            role = @role,
            status = @status,
            last_heartbeat = @lastHeartbeat,
            host = @host,
            port = @port,
            version = @version,
            updated_at = GETUTCDATE()
        WHEN NOT MATCHED THEN
          INSERT (instance_id, role, status, last_heartbeat, host, port, version)
          VALUES (@instanceId, @role, @status, @lastHeartbeat, @host, @port, @version);
      `;

      const params: Record<string, any> = {
        instanceId: this.instanceId,
        role: this.role,
        status: 'active',
        lastHeartbeat: now,
        host: this.host,
        port: this.port,
        version: this.version
      };

      await sqlClient.execute(mergeSQL, params);
      this.status = 'active';
      logger.info(`Instance registered: ${this.instanceId} (${this.role}) at ${this.host}:${this.port}`);
    } catch (error: any) {
      logger.error(`Failed to register instance: ${error.message}`);
      // Continue with fallback - cluster is optional
    }
  }

  /**
   * Send heartbeat to keep instance registration alive
   */
  async sendHeartbeat(): Promise<void> {
    if (!this.isClusterEnabled || this.status === 'inactive') {
      return;
    }

    try {
      const sqlClient = getSqlClient();
      if (!sqlClient) {
        return;
      }

      const now = new Date();
      this.lastHeartbeat = now;

      const sql = `
        UPDATE [dbo].[flashdb_instances]
        SET last_heartbeat = @now,
            updated_at = GETUTCDATE()
        WHERE instance_id = @instanceId
      `;

      const params: Record<string, any> = {
        now,
        instanceId: this.instanceId
      };

      await sqlClient.execute(sql, params);
      logger.debug(`Heartbeat sent for instance ${this.instanceId}`);
    } catch (error: any) {
      logger.error(`Failed to send heartbeat: ${error.message}`);
    }
  }

  /**
   * Start periodic heartbeat
   */
  startHeartbeat(): void {
    if (this.heartbeatInterval) {
      logger.warn('Heartbeat already running');
      return;
    }

    this.heartbeatInterval = setInterval(async () => {
      await this.sendHeartbeat();
    }, this.healthCheckInterval);

    logger.info(`Heartbeat started every ${this.healthCheckInterval}ms`);
  }

  /**
   * Stop periodic heartbeat
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      logger.info('Heartbeat stopped');
    }
  }

  /**
   * Get all active instances in the cluster
   */
  async getActiveInstances(): Promise<InstanceInfo[]> {
    if (!this.isClusterEnabled) {
      return [this.getInstanceInfo()];
    }

    try {
      const sqlClient = getSqlClient();
      if (!sqlClient) {
        return [this.getInstanceInfo()];
      }

      const sql = `
        SELECT
          instance_id AS instanceId,
          role,
          status,
          last_heartbeat AS lastHeartbeat,
          host,
          port,
          version
        FROM [dbo].[flashdb_instances]
        WHERE status = 'active'
          AND last_heartbeat > DATEADD(second, -30, GETUTCDATE())
        ORDER BY last_heartbeat DESC
      `;

      const result = await sqlClient.query<any>(sql);

      return result.recordset.map((row: any) => ({
        instanceId: row.instanceId,
        role: row.role,
        status: row.status,
        lastHeartbeat: row.lastHeartbeat,
        host: row.host,
        port: row.port,
        version: row.version
      }));
    } catch (error: any) {
      logger.error(`Failed to get active instances: ${error.message}`);
      return [this.getInstanceInfo()];
    }
  }

  /**
   * Get cluster health status
   */
  async getClusterStatus(): Promise<ClusterStatus> {
    const instances = await this.getActiveInstances();

    return {
      totalInstances: instances.length,
      activeInstances: instances.filter(i => i.status === 'active').length,
      unhealthyInstances: instances.filter(i => i.status === 'unhealthy').length,
      instances
    };
  }

  /**
   * Deregister instance from cluster (on shutdown)
   */
  async deregisterInstance(): Promise<void> {
    if (!this.isClusterEnabled) {
      return;
    }

    try {
      const sqlClient = getSqlClient();
      if (!sqlClient) {
        return;
      }

      const sql = `
        UPDATE [dbo].[flashdb_instances]
        SET status = 'inactive',
            updated_at = GETUTCDATE()
        WHERE instance_id = @instanceId
      `;

      const params: Record<string, any> = {
        instanceId: this.instanceId
      };

      await sqlClient.execute(sql, params);
      this.status = 'inactive';
      logger.info(`Instance deregistered: ${this.instanceId}`);
    } catch (error: any) {
      logger.error(`Failed to deregister instance: ${error.message}`);
    }
  }

  /**
   * Clean up old instances (remove stale entries)
   */
  async cleanupStaleInstances(): Promise<number> {
    try {
      const sqlClient = getSqlClient();
      if (!sqlClient) {
        return 0;
      }

      const sql = `
        DELETE FROM [dbo].[flashdb_instances]
        WHERE last_heartbeat < DATEADD(second, -30, GETUTCDATE())
          OR status = 'inactive'
      `;

      const result = await sqlClient.execute(sql);
      const deleted = result.rowsAffected?.[0] ?? 0;

      if (deleted > 0) {
        logger.info(`Cleaned up ${deleted} stale instance registrations`);
      }

      return deleted;
    } catch (error: any) {
      logger.error(`Failed to cleanup stale instances: ${error.message}`);
      return 0;
    }
  }

  /**
   * Check if this instance is the primary
   */
  isPrimary(): boolean {
    return this.role === 'primary';
  }

  /**
   * Check if cluster mode is enabled
   */
  isClusterMode(): boolean {
    return this.isClusterEnabled;
  }

  /**
   * Get health check interval
   */
  getHealthCheckInterval(): number {
    return this.healthCheckInterval;
  }

  /**
   * Get state sync interval
   */
  getStateSyncInterval(): number {
    return this.stateSyncInterval;
  }

  /**
   * Get instance TTL (heartbeat timeout)
   */
  getInstanceTTL(): number {
    return this.instanceTTL;
  }
}

// Singleton instance
let instanceConfig: InstanceConfig | null = null;

/**
 * Get or create the instance configuration
 */
export function getInstanceConfig(): InstanceConfig {
  if (!instanceConfig) {
    instanceConfig = new InstanceConfig();
  }
  return instanceConfig;
}

/**
 * Initialize instance configuration (register on startup)
 */
export async function initializeInstanceConfig(): Promise<InstanceConfig> {
  const config = getInstanceConfig();
  await config.registerInstance();
  config.startHeartbeat();
  return config;
}

/**
 * Shutdown instance configuration (deregister on shutdown)
 */
export async function shutdownInstanceConfig(): Promise<void> {
  const config = getInstanceConfig();
  config.stopHeartbeat();
  await config.deregisterInstance();
}
