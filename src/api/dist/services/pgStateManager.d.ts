/**
 * PostgreSQL-backed state manager
 * Replaces Redis for centralized state management
 * Features:
 * - Simple key-value store with JSON values
 * - TTL support for expiring state
 * - Watch mechanism (polling-based)
 * - Auto-cleanup of expired entries
 * - Eventually consistent across instances
 */
export declare class PgStateManager {
    private watchIntervals;
    private readonly WATCH_INTERVAL_MS;
    private readonly CLEANUP_INTERVAL_MS;
    private cleanupInterval;
    private isInitialized;
    initialize(): Promise<void>;
    /**
     * Set state value
     * Performs UPSERT into flashdb_state
     */
    setState(key: string, value: any, ttlSeconds?: number): Promise<void>;
    /**
     * Get state value
     * Returns parsed JSON or null if not found or expired
     */
    getState(key: string): Promise<any | null>;
    /**
     * Delete state value
     */
    deleteState(key: string): Promise<void>;
    /**
     * Get all state keys matching a prefix pattern
     */
    getAllState(prefix?: string): Promise<Record<string, any>>;
    /**
     * Watch for state changes (polling-based)
     * Polls database every 5 seconds and calls callback when value changes
     */
    watchState(key: string, callback: (value: any) => void): Promise<void>;
    /**
     * Stop watching state
     */
    unwatchState(watchKey: string): void;
    /**
     * Start periodic cleanup of expired entries
     */
    private startCleanup;
    /**
     * Graceful shutdown
     */
    shutdown(): Promise<void>;
    /**
     * Check if state manager is healthy
     */
    isHealthy(): Promise<boolean>;
    /**
     * Get state statistics
     */
    getStats(): Promise<{
        totalKeys: number;
        expiredKeys: number;
        oldestKey: string | null;
        newestKey: string | null;
    }>;
}
/**
 * Get or create the global state manager instance
 */
export declare function getPgStateManager(): PgStateManager;
/**
 * Initialize the state manager
 */
export declare function initializePgStateManager(): Promise<PgStateManager>;
//# sourceMappingURL=pgStateManager.d.ts.map