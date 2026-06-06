"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInstanceConfig = getInstanceConfig;
exports.initializeInstanceConfig = initializeInstanceConfig;
exports.shutdownInstanceConfig = shutdownInstanceConfig;
const uuid_1 = require("uuid");
const sqlClient_1 = require("../services/sqlClient");
const logger_1 = __importDefault(require("../logger"));
class InstanceConfig {
    constructor() {
        this.status = 'inactive';
        this.lastHeartbeat = new Date();
        this.host = 'localhost';
        this.port = 3001;
        this.version = '1.0.0';
        this.heartbeatInterval = null;
        this.healthCheckInterval = 5000; // 5 seconds
        this.stateSyncInterval = 5000; // 5 seconds
        this.instanceTTL = 30000; // 30 seconds - instances are removed if no heartbeat for 30s
        this.isClusterEnabled = true;
        // Generate or load instance ID
        this.instanceId = process.env.INSTANCE_ID || (0, uuid_1.v4)();
        this.role = (process.env.INSTANCE_ROLE || 'primary');
        this.host = process.env.INSTANCE_HOST || 'localhost';
        this.port = parseInt(process.env.PORT || '3001', 10);
        this.version = process.env.API_VERSION || '1.0.0';
        this.isClusterEnabled = process.env.CLUSTER_ENABLED !== 'false';
        logger_1.default.info(`Instance configured: ${this.instanceId} (role: ${this.role})`);
    }
    /**
     * Get the unique instance ID
     */
    getInstanceId() {
        return this.instanceId;
    }
    /**
     * Get instance role (primary or replica)
     */
    getRole() {
        return this.role;
    }
    /**
     * Get current instance status
     */
    getStatus() {
        return this.status;
    }
    /**
     * Get instance information
     */
    getInstanceInfo() {
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
    async registerInstance() {
        if (!this.isClusterEnabled) {
            logger_1.default.info('Cluster mode disabled - skipping instance registration');
            this.status = 'active';
            return;
        }
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            if (!sqlClient) {
                logger_1.default.warn('SQL client not available - cannot register instance');
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
            const params = {
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
            logger_1.default.info(`Instance registered: ${this.instanceId} (${this.role}) at ${this.host}:${this.port}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to register instance: ${error.message}`);
            // Continue with fallback - cluster is optional
        }
    }
    /**
     * Send heartbeat to keep instance registration alive
     */
    async sendHeartbeat() {
        if (!this.isClusterEnabled || this.status === 'inactive') {
            return;
        }
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
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
            const params = {
                now,
                instanceId: this.instanceId
            };
            await sqlClient.execute(sql, params);
            logger_1.default.debug(`Heartbeat sent for instance ${this.instanceId}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to send heartbeat: ${error.message}`);
        }
    }
    /**
     * Start periodic heartbeat
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            logger_1.default.warn('Heartbeat already running');
            return;
        }
        this.heartbeatInterval = setInterval(async () => {
            await this.sendHeartbeat();
        }, this.healthCheckInterval);
        logger_1.default.info(`Heartbeat started every ${this.healthCheckInterval}ms`);
    }
    /**
     * Stop periodic heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
            logger_1.default.info('Heartbeat stopped');
        }
    }
    /**
     * Get all active instances in the cluster
     */
    async getActiveInstances() {
        if (!this.isClusterEnabled) {
            return [this.getInstanceInfo()];
        }
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
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
            const result = await sqlClient.query(sql);
            return result.recordset.map((row) => ({
                instanceId: row.instanceId,
                role: row.role,
                status: row.status,
                lastHeartbeat: row.lastHeartbeat,
                host: row.host,
                port: row.port,
                version: row.version
            }));
        }
        catch (error) {
            logger_1.default.error(`Failed to get active instances: ${error.message}`);
            return [this.getInstanceInfo()];
        }
    }
    /**
     * Get cluster health status
     */
    async getClusterStatus() {
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
    async deregisterInstance() {
        if (!this.isClusterEnabled) {
            return;
        }
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            if (!sqlClient) {
                return;
            }
            const sql = `
        UPDATE [dbo].[flashdb_instances]
        SET status = 'inactive',
            updated_at = GETUTCDATE()
        WHERE instance_id = @instanceId
      `;
            const params = {
                instanceId: this.instanceId
            };
            await sqlClient.execute(sql, params);
            this.status = 'inactive';
            logger_1.default.info(`Instance deregistered: ${this.instanceId}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to deregister instance: ${error.message}`);
        }
    }
    /**
     * Clean up old instances (remove stale entries)
     */
    async cleanupStaleInstances() {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            if (!sqlClient) {
                return 0;
            }
            const sql = `
        DELETE FROM [dbo].[flashdb_instances]
        WHERE last_heartbeat < DATEADD(second, -30, GETUTCDATE())
          OR status = 'inactive'
      `;
            const deleted = await sqlClient.execute(sql);
            if (deleted > 0) {
                logger_1.default.info(`Cleaned up ${deleted} stale instance registrations`);
            }
            return deleted;
        }
        catch (error) {
            logger_1.default.error(`Failed to cleanup stale instances: ${error.message}`);
            return 0;
        }
    }
    /**
     * Check if this instance is the primary
     */
    isPrimary() {
        return this.role === 'primary';
    }
    /**
     * Check if cluster mode is enabled
     */
    isClusterMode() {
        return this.isClusterEnabled;
    }
    /**
     * Get health check interval
     */
    getHealthCheckInterval() {
        return this.healthCheckInterval;
    }
    /**
     * Get state sync interval
     */
    getStateSyncInterval() {
        return this.stateSyncInterval;
    }
    /**
     * Get instance TTL (heartbeat timeout)
     */
    getInstanceTTL() {
        return this.instanceTTL;
    }
}
// Singleton instance
let instanceConfig = null;
/**
 * Get or create the instance configuration
 */
function getInstanceConfig() {
    if (!instanceConfig) {
        instanceConfig = new InstanceConfig();
    }
    return instanceConfig;
}
/**
 * Initialize instance configuration (register on startup)
 */
async function initializeInstanceConfig() {
    const config = getInstanceConfig();
    await config.registerInstance();
    config.startHeartbeat();
    return config;
}
/**
 * Shutdown instance configuration (deregister on shutdown)
 */
async function shutdownInstanceConfig() {
    const config = getInstanceConfig();
    config.stopHeartbeat();
    await config.deregisterInstance();
}
//# sourceMappingURL=instanceConfig.js.map