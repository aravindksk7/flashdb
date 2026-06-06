export interface LockInfo {
    resourceId: string;
    ownerId: string;
    acquiredAt: Date;
    expiresAt: Date;
    isLocked: boolean;
}
/**
 * PostgreSQL-backed distributed lock manager
 * Uses database locks for distributed coordination across API instances
 * Features:
 * - Distributed locks with configurable TTL (default 30 seconds)
 * - Lock acquisition, renewal, and release
 * - Automatic cleanup of expired locks
 * - Lock info retrieval
 */
export declare class PgLockManager {
    private readonly DEFAULT_LOCK_TTL_SECONDS;
    private readonly CLEANUP_INTERVAL_MS;
    private cleanupInterval;
    private isInitialized;
    initialize(): Promise<void>;
    /**
     * Acquire a distributed lock
     * Returns true if lock was successfully acquired
     */
    acquireLock(resourceId: string, ownerId: string, ttlSeconds?: number): Promise<boolean>;
    /**
     * Release a distributed lock
     * Only the owner can release the lock
     */
    releaseLock(resourceId: string, ownerId: string): Promise<boolean>;
    /**
     * Check if a resource is currently locked
     */
    isLocked(resourceId: string): Promise<boolean>;
    /**
     * Renew a lock (extend its lifetime)
     * Only the owner can renew
     */
    renewLock(resourceId: string, ownerId: string, ttlSeconds?: number): Promise<boolean>;
    /**
     * Get lock information
     */
    getLockInfo(resourceId: string): Promise<LockInfo | null>;
    /**
     * Try to acquire lock with retries
     * Useful for operations that need to wait for lock availability
     */
    acquireLockWithRetry(resourceId: string, ownerId: string, ttlSeconds?: number, maxAttempts?: number, retryDelayMs?: number): Promise<boolean>;
    /**
     * Execute a function while holding a lock
     * Automatically acquires and releases lock
     */
    withLock<T>(resourceId: string, ttlSeconds: number | undefined, fn: () => Promise<T>): Promise<T>;
    /**
     * Start periodic cleanup of expired locks
     */
    private startCleanup;
    /**
     * Graceful shutdown
     */
    shutdown(): Promise<void>;
    /**
     * Delay utility
     */
    private delay;
    /**
     * Check if lock manager is healthy
     */
    isHealthy(): Promise<boolean>;
    /**
     * Get lock statistics
     */
    getStats(): Promise<{
        totalLocks: number;
        activeLocks: number;
        expiredLocks: number;
    }>;
}
/**
 * Get or create the global lock manager instance
 */
export declare function getPgLockManager(): PgLockManager;
/**
 * Initialize the lock manager
 */
export declare function initializePgLockManager(): Promise<PgLockManager>;
//# sourceMappingURL=pgLockManager.d.ts.map