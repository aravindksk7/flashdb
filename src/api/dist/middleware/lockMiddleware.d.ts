import { Request, Response, NextFunction } from 'express';
export interface LockContext {
    resourceId: string;
    ownerId: string;
    acquiredAt: Date;
    waitTimeMs: number;
    backend?: 'pg' | 'local';
}
/**
 * Acquire a lock or fail immediately with 409 Conflict
 * @param resourceId - Unique identifier for the resource to lock
 * @param ttlSeconds - Time-to-live for the lock in seconds
 * @returns LockContext if acquired, null if locked by another process
 */
export declare function acquireOrFail(resourceId: string, ttlSeconds?: number): Promise<LockContext | null>;
/**
 * Calculate exponential backoff delay with jitter
 * Formula: min(BASE × 2^(attempt-1), MAX) + random(0, JITTER)
 * Prevents thundering herd and gives other processes time to release locks
 * @param attemptNumber - Current attempt number (1-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @param jitterMs - Maximum random jitter to add
 * @returns Delay in milliseconds
 */
export declare function calculateExponentialBackoff(attemptNumber: number, baseDelayMs?: number, maxDelayMs?: number, jitterMs?: number): number;
/**
 * Acquire a lock with retries using exponential backoff
 * Waits with exponentially increasing delays between retries
 * @param resourceId - Unique identifier for the resource to lock
 * @param ttlSeconds - Time-to-live for the lock in seconds
 * @param maxAttempts - Maximum number of retry attempts
 * @returns LockContext if acquired, null if timeout
 */
export declare function acquireWithRetry(resourceId: string, ttlSeconds?: number, maxAttempts?: number): Promise<LockContext | null>;
/**
 * Release a lock
 * @param lockContext - Lock context from acquisition
 */
export declare function releaseLock(lockContext: LockContext): Promise<boolean>;
/**
 * Async wrapper for operations requiring a lock
 * Automatically acquires lock before operation, releases after
 * Fails with 409 Conflict if lock cannot be acquired immediately
 *
 * Usage:
 *   const result = await withLock(
 *     `clone:${cloneId}`,
 *     async () => {
 *       return await psService.executeCommand(...);
 *     }
 *   );
 *
 * @param resourceId - Unique identifier for the resource to lock
 * @param operation - Async function to execute while holding lock
 * @param ttlSeconds - Time-to-live for the lock in seconds
 * @returns Result of the operation
 * @throws Error if lock cannot be acquired
 */
export declare function withLock<T>(resourceId: string, operation: () => Promise<T>, ttlSeconds?: number): Promise<{
    result: T;
    lockContext: LockContext;
}>;
/**
 * Async wrapper with retry logic
 * Retries lock acquisition up to maxAttempts times
 *
 * Usage:
 *   const result = await withLockRetry(
 *     `checkpoint:${cloneId}`,
 *     async () => {
 *       return await psService.executeCommand(...);
 *     }
 *   );
 *
 * @param resourceId - Unique identifier for the resource to lock
 * @param operation - Async function to execute while holding lock
 * @param ttlSeconds - Time-to-live for the lock in seconds
 * @param maxAttempts - Maximum number of lock acquisition attempts
 * @param retryDelayMs - Delay between retry attempts
 * @returns Result of the operation
 * @throws Error if lock cannot be acquired after retries
 */
export declare function withLockRetry<T>(resourceId: string, operation: () => Promise<T>, ttlSeconds?: number, maxAttempts?: number): Promise<{
    result: T;
    lockContext: LockContext;
}>;
/**
 * Express middleware to attach lock helpers to request
 * Enables req.lock.acquire(), req.lock.withLock(), etc.
 */
export declare function lockMiddleware(req: Request, _res: Response, next: NextFunction): void;
/**
 * Get lock info for a resource
 */
export declare function getLockInfo(resourceId: string): Promise<import("../services/pgLockManager").LockInfo | null>;
/**
 * Check if a resource is locked
 */
export declare function isResourceLocked(resourceId: string): Promise<boolean>;
//# sourceMappingURL=lockMiddleware.d.ts.map