import NodeCache from 'node-cache';
import { PowerShellService } from './powershellService';
/**
 * Connection pool metrics interface
 */
export interface PoolMetrics {
    size: number;
    available: number;
    idle: number;
    pending: number;
    totalCreated: number;
    totalDestroyed: number;
    activeConnections: number;
    errorCount: number;
    averageWaitTime: number;
}
/**
 * Generic connection pool for PowerShell service instances
 * Manages connection lifecycle, reuse, and graceful shutdown
 */
export declare class ConnectionPool {
    private pool;
    private metrics;
    private cache;
    private readonly MIN_SIZE;
    private readonly MAX_SIZE;
    private readonly TTL;
    private readonly IDLE_TIMEOUT;
    constructor();
    /**
     * Acquire a connection from the pool
     */
    acquire(): Promise<PowerShellService>;
    /**
     * Release a connection back to the pool
     */
    release(connection: PowerShellService): Promise<void>;
    /**
     * Get current pool metrics
     */
    getMetrics(): PoolMetrics;
    /**
     * Drain the pool and close all connections
     */
    drain(): Promise<void>;
    /**
     * Cache a value with TTL
     */
    setCache(key: string, value: any, ttl?: number): void;
    /**
     * Retrieve a cached value
     */
    getCache<T = any>(key: string): T | undefined;
    /**
     * Delete a cached value
     */
    delCache(key: string): number;
    /**
     * Clear all cache
     */
    flushCache(): void;
    /**
     * Get cache statistics
     */
    getCacheStats(): NodeCache.Stats;
    /**
     * Reset metrics
     */
    resetMetrics(): void;
}
/**
 * Get or create the global connection pool instance
 */
export declare function getConnectionPool(): ConnectionPool;
/**
 * Initialize the connection pool
 */
export declare function initializeConnectionPool(): ConnectionPool;
/**
 * Shutdown the connection pool
 */
export declare function shutdownConnectionPool(): Promise<void>;
//# sourceMappingURL=connectionPool.d.ts.map