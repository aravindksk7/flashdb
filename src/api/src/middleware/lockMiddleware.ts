import { Request, Response, NextFunction } from 'express';
import { getPgLockManager } from '../services/pgLockManager';
import logger from '../logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Lock middleware helpers for protecting critical operations
 * Provides utilities for lock-aware request handling
 */

const LOCK_RETRY_ATTEMPTS = parseInt(process.env.LOCK_RETRY_ATTEMPTS || '5', 10);
const LOCK_BASE_DELAY_MS = parseInt(process.env.LOCK_BASE_DELAY_MS || '100', 10);
const LOCK_MAX_DELAY_MS = parseInt(process.env.LOCK_MAX_DELAY_MS || '5000', 10);
const LOCK_JITTER_MS = parseInt(process.env.LOCK_JITTER_MS || '1000', 10);

export interface LockContext {
  resourceId: string;
  ownerId: string;
  acquiredAt: Date;
  waitTimeMs: number;
  backend?: 'pg' | 'local';
}

const localLocks = new Map<string, { ownerId: string; acquiredAt: Date; expiresAt: number }>();

function acquireLocalLock(resourceId: string, ownerId: string, ttlSeconds: number, startTime: number): LockContext | null {
  const now = Date.now();
  const existing = localLocks.get(resourceId);

  if (existing && existing.expiresAt > now && existing.ownerId !== ownerId) {
    return null;
  }

  const acquiredAt = new Date();
  localLocks.set(resourceId, {
    ownerId,
    acquiredAt,
    expiresAt: now + ttlSeconds * 1000
  });

  return {
    resourceId,
    ownerId,
    acquiredAt,
    waitTimeMs: Date.now() - startTime,
    backend: 'local'
  };
}

function releaseLocalLock(lockContext: LockContext): boolean {
  const existing = localLocks.get(lockContext.resourceId);
  if (!existing || existing.ownerId !== lockContext.ownerId) {
    return false;
  }

  localLocks.delete(lockContext.resourceId);
  return true;
}

/**
 * Acquire a lock or fail immediately with 409 Conflict
 * @param resourceId - Unique identifier for the resource to lock
 * @param ttlSeconds - Time-to-live for the lock in seconds
 * @returns LockContext if acquired, null if locked by another process
 */
export async function acquireOrFail(
  resourceId: string,
  ttlSeconds: number = 30
): Promise<LockContext | null> {
  const ownerId = uuidv4();
  const startTime = Date.now();

  try {
    const lockManager = getPgLockManager();

    const acquired = await lockManager.acquireLock(resourceId, ownerId, ttlSeconds);

    if (!acquired) {
      logger.debug(`Lock acquisition failed (immediate): ${resourceId}`);
      return null;
    }

    const waitTimeMs = Date.now() - startTime;

    return {
      resourceId,
      ownerId,
      acquiredAt: new Date(),
      waitTimeMs,
      backend: 'pg'
    };
  } catch (error: any) {
    logger.warn(`Distributed lock unavailable for ${resourceId}; using local lock fallback: ${error.message}`);
    return acquireLocalLock(resourceId, ownerId, ttlSeconds, startTime);
  }
}

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
export function calculateExponentialBackoff(
  attemptNumber: number,
  baseDelayMs: number = LOCK_BASE_DELAY_MS,
  maxDelayMs: number = LOCK_MAX_DELAY_MS,
  jitterMs: number = LOCK_JITTER_MS
): number {
  // Exponential growth: 100ms, 200ms, 400ms, 800ms, 1600ms (capped at 5000ms)
  const exponentialDelay = Math.min(
    baseDelayMs * Math.pow(2, attemptNumber - 1),
    maxDelayMs
  );

  // Add random jitter (0 to jitterMs) to prevent thundering herd
  const jitter = Math.random() * jitterMs;

  return exponentialDelay + jitter;
}

/**
 * Acquire a lock with retries using exponential backoff
 * Waits with exponentially increasing delays between retries
 * @param resourceId - Unique identifier for the resource to lock
 * @param ttlSeconds - Time-to-live for the lock in seconds
 * @param maxAttempts - Maximum number of retry attempts
 * @returns LockContext if acquired, null if timeout
 */
export async function acquireWithRetry(
  resourceId: string,
  ttlSeconds: number = 30,
  maxAttempts: number = LOCK_RETRY_ATTEMPTS
): Promise<LockContext | null> {
  const ownerId = uuidv4();
  const startTime = Date.now();

  try {
    const lockManager = getPgLockManager();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const acquired = await lockManager.acquireLock(resourceId, ownerId, ttlSeconds);

      if (acquired) {
        const waitTimeMs = Date.now() - startTime;
        logger.debug(`Lock acquired after ${attempt} attempt(s) for ${resourceId} (wait: ${waitTimeMs}ms)`);
        return {
          resourceId,
          ownerId,
          acquiredAt: new Date(),
          waitTimeMs,
          backend: 'pg'
        };
      }

      if (attempt < maxAttempts) {
        const backoffDelay = calculateExponentialBackoff(attempt);
        logger.debug(`Lock contention on ${resourceId} (attempt ${attempt}/${maxAttempts}), waiting ${Math.round(backoffDelay)}ms`);
        await delay(backoffDelay);
      }
    }

    logger.debug(`Lock acquisition timeout: ${resourceId} (${maxAttempts} attempts)`);
    return null;
  } catch (error: any) {
    logger.warn(`Distributed lock unavailable for ${resourceId}; using local lock fallback: ${error.message}`);
    return acquireLocalLock(resourceId, ownerId, ttlSeconds, startTime);
  }
}

/**
 * Release a lock
 * @param lockContext - Lock context from acquisition
 */
export async function releaseLock(lockContext: LockContext): Promise<boolean> {
  if (lockContext.backend === 'local') {
    return releaseLocalLock(lockContext);
  }

  try {
    const lockManager = getPgLockManager();
    const released = await lockManager.releaseLock(lockContext.resourceId, lockContext.ownerId);

    if (released) {
      logger.debug(`Lock released: ${lockContext.resourceId}`);
    }

    return released;
  } catch (error: any) {
    logger.error(`Error releasing lock ${lockContext.resourceId}: ${error.message}`);
    throw error;
  }
}

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
export async function withLock<T>(
  resourceId: string,
  operation: () => Promise<T>,
  ttlSeconds: number = 30
): Promise<{ result: T; lockContext: LockContext }> {
  const lockContext = await acquireOrFail(resourceId, ttlSeconds);

  if (!lockContext) {
    throw new Error(`LOCK_CONFLICT: Cannot acquire lock for ${resourceId}`);
  }

  try {
    const result = await operation();
    return { result, lockContext };
  } finally {
    try {
      await releaseLock(lockContext);
    } catch (error: any) {
      logger.warn(`Failed to release lock for ${resourceId}: ${error.message}`);
    }
  }
}

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
export async function withLockRetry<T>(
  resourceId: string,
  operation: () => Promise<T>,
  ttlSeconds: number = 30,
  maxAttempts: number = LOCK_RETRY_ATTEMPTS
): Promise<{ result: T; lockContext: LockContext }> {
  const lockContext = await acquireWithRetry(resourceId, ttlSeconds, maxAttempts);

  if (!lockContext) {
    throw new Error(`LOCK_TIMEOUT: Cannot acquire lock for ${resourceId} after ${maxAttempts} attempts`);
  }

  try {
    const result = await operation();
    return { result, lockContext };
  } finally {
    try {
      await releaseLock(lockContext);
    } catch (error: any) {
      logger.warn(`Failed to release lock for ${resourceId}: ${error.message}`);
    }
  }
}

/**
 * Express middleware to attach lock helpers to request
 * Enables req.lock.acquire(), req.lock.withLock(), etc.
 */
export function lockMiddleware(req: Request, _res: Response, next: NextFunction) {
  // Attach lock helpers to request
  (req as any).lock = {
    acquireOrFail: (resourceId: string, ttlSeconds?: number) =>
      acquireOrFail(resourceId, ttlSeconds),
    acquireWithRetry: (
      resourceId: string,
      ttlSeconds?: number,
      maxAttempts?: number
    ) => acquireWithRetry(resourceId, ttlSeconds, maxAttempts),
    withLock: (resourceId: string, operation: () => Promise<any>, ttlSeconds?: number) =>
      withLock(resourceId, operation, ttlSeconds),
    withLockRetry: (
      resourceId: string,
      operation: () => Promise<any>,
      ttlSeconds?: number,
      maxAttempts?: number
    ) => withLockRetry(resourceId, operation, ttlSeconds, maxAttempts),
    release: (lockContext: LockContext) => releaseLock(lockContext)
  };

  next();
}

/**
 * Helper function for delay
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get lock info for a resource
 */
export async function getLockInfo(resourceId: string) {
  try {
    const lockManager = getPgLockManager();
    return await lockManager.getLockInfo(resourceId);
  } catch (error: any) {
    logger.error(`Error getting lock info for ${resourceId}: ${error.message}`);
    return null;
  }
}

/**
 * Check if a resource is locked
 */
export async function isResourceLocked(resourceId: string): Promise<boolean> {
  try {
    const lockManager = getPgLockManager();
    return await lockManager.isLocked(resourceId);
  } catch (error: any) {
    logger.error(`Error checking lock status for ${resourceId}: ${error.message}`);
    return false;
  }
}
