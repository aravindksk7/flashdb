import * as sql from 'mssql';
/**
 * SQL connection pool metrics interface
 */
export interface SqlPoolMetrics {
    size: number;
    available: number;
    idle: number;
    activeConnections: number;
    errorCount: number;
    totalRequests: number;
    averageResponseTimeMs: number;
}
/**
 * SQL query result interface
 */
export interface SqlQueryResult<T> {
    recordset: T[];
    rowsAffected: number[];
    executionTimeMs: number;
}
/**
 * Direct MSSQL client with connection pooling and query optimization
 * Provides 5-10x faster execution compared to PowerShell SQL calls
 */
export declare class SqlClient {
    private pool;
    private metrics;
    private readonly MIN_POOL_SIZE;
    private readonly MAX_POOL_SIZE;
    private readonly CONNECTION_TIMEOUT;
    private readonly QUERY_TIMEOUT;
    private readonly MAX_RETRY_ATTEMPTS;
    private readonly RETRY_DELAY_MS;
    private isInitialized;
    private initializePromise;
    private healthCheckInterval;
    /**
     * Initialize the SQL client and connection pool
     */
    initialize(): Promise<void>;
    private ensureConnected;
    /**
     * Start periodic health checks on the connection pool
     */
    private startHealthCheck;
    /**
     * Execute a parameterized query with results
     */
    query<T = any>(sqlString: string, params?: Record<string, any>): Promise<SqlQueryResult<T>>;
    /**
     * Execute a parameterized query without expecting results
     */
    execute(sqlString: string, params?: Record<string, any>): Promise<number>;
    /**
     * Execute a transaction with callback
     */
    transaction<T>(callback: (request: sql.Request) => Promise<T>): Promise<T>;
    /**
     * Get connection pool metrics
     */
    getMetrics(): SqlPoolMetrics;
    /**
     * Record metrics for performance tracking
     */
    private recordMetrics;
    /**
     * Delay utility for retry logic
     */
    private delay;
    /**
     * Check if SQL client is connected and healthy
     */
    isHealthy(): Promise<boolean>;
    /**
     * Shutdown the SQL client and close all connections
     */
    shutdown(): Promise<void>;
    /**
     * Reset metrics
     */
    resetMetrics(): void;
}
/**
 * Get or create the global SQL client instance
 */
export declare function getSqlClient(): SqlClient;
/**
 * Initialize the SQL client
 */
export declare function initializeSqlClient(): Promise<SqlClient>;
/**
 * Shutdown the SQL client
 */
export declare function shutdownSqlClient(): Promise<void>;
//# sourceMappingURL=sqlClient.d.ts.map