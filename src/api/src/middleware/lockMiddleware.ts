import { Request, Response, NextFunction } from 'express';
import { getPgLockManager } from '../services/pgLockManager';
import logger from '../logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Lock middleware helpers for protecting critical operations
 * Provides utilities for lock-aware request handling
 */

const LOCK_RETRY_ATTEMPTS = parseInt(process.env.LOCK_RETRY_ATTEMPTS || '3', 10);
const LOCK_RETRY_DELAY_MS = parseInt(process.env.LOCK_RETRY_DELAY_MS || '100', 10);

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
 * Acquire a lock with retries
 * Waits up to maxAttempts * retryDelayMs milliseconds
 * @param resourceId - Unique identifier for the resource to lock
 * @param ttlSeconds - Time-to-live for the lock in seconds
 * @param maxAttempts - Maximum number of retry attempts
 * @param retryDelayMs - Delay between retries in milliseconds
 * @returns LockContext if acquired, null if timeout
 */
export async function acquireWithRetry(
  resourceId: string,
  ttlSeconds: number = 30,
  maxAttempts: number = LOCK_RETRY_ATTEMPTS,
  retryDelayMs: number = LOCK_RETRY_DELAY_MS
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
        await delay(retryDelayMs);
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
  maxAttempts: number = LOCK_RETRY_ATTEMPTS,
  retryDelayMs: number = LOCK_RETRY_DELAY_MS
): Promise<{ result: T; lockContext: LockContext }> {
  const lockContext = await acquireWithRetry(resourceId, ttlSeconds, maxAttempts, retryDelayMs);

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
      maxAttempts?: number,
      retryDelayMs?: number
    ) => acquireWithRetry(resourceId, ttlSeconds, maxAttempts, retryDelayMs),
    withLock: (resourceId: string, operation: () => Promise<any>, ttlSeconds?: number) =>
      withLock(resourceId, operation, ttlSeconds),
    withLockRetry: (
      resourceId: string,
      operation: () => Promise<any>,
      ttlSeconds?: number,
      maxAttempts?: number,
      retryDelayMs?: number
    ) => withLockRetry(resourceId, operation, ttlSeconds, maxAttempts, retryDelayMs),
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
