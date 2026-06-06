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
declare class InstanceConfig {
    private instanceId;
    private role;
    private status;
    private lastHeartbeat;
    private host;
    private port;
    private version;
    private heartbeatInterval;
    private healthCheckInterval;
    private stateSyncInterval;
    private instanceTTL;
    private isClusterEnabled;
    constructor();
    /**
     * Get the unique instance ID
     */
    getInstanceId(): string;
    /**
     * Get instance role (primary or replica)
     */
    getRole(): InstanceRole;
    /**
     * Get current instance status
     */
    getStatus(): 'active' | 'inactive';
    /**
     * Get instance information
     */
    getInstanceInfo(): InstanceInfo;
    /**
     * Register this instance in the database
     */
    registerInstance(): Promise<void>;
    /**
     * Send heartbeat to keep instance registration alive
     */
    sendHeartbeat(): Promise<void>;
    /**
     * Start periodic heartbeat
     */
    startHeartbeat(): void;
    /**
     * Stop periodic heartbeat
     */
    stopHeartbeat(): void;
    /**
     * Get all active instances in the cluster
     */
    getActiveInstances(): Promise<InstanceInfo[]>;
    /**
     * Get cluster health status
     */
    getClusterStatus(): Promise<ClusterStatus>;
    /**
     * Deregister instance from cluster (on shutdown)
     */
    deregisterInstance(): Promise<void>;
    /**
     * Clean up old instances (remove stale entries)
     */
    cleanupStaleInstances(): Promise<number>;
    /**
     * Check if this instance is the primary
     */
    isPrimary(): boolean;
    /**
     * Check if cluster mode is enabled
     */
    isClusterMode(): boolean;
    /**
     * Get health check interval
     */
    getHealthCheckInterval(): number;
    /**
     * Get state sync interval
     */
    getStateSyncInterval(): number;
    /**
     * Get instance TTL (heartbeat timeout)
     */
    getInstanceTTL(): number;
}
/**
 * Get or create the instance configuration
 */
export declare function getInstanceConfig(): InstanceConfig;
/**
 * Initialize instance configuration (register on startup)
 */
export declare function initializeInstanceConfig(): Promise<InstanceConfig>;
/**
 * Shutdown instance configuration (deregister on shutdown)
 */
export declare function shutdownInstanceConfig(): Promise<void>;
export {};
//# sourceMappingURL=instanceConfig.d.ts.map