"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.acquireOrFail = acquireOrFail;
exports.acquireWithRetry = acquireWithRetry;
exports.releaseLock = releaseLock;
exports.withLock = withLock;
exports.withLockRetry = withLockRetry;
exports.lockMiddleware = lockMiddleware;
exports.getLockInfo = getLockInfo;
exports.isResourceLocked = isResourceLocked;
const pgLockManager_1 = require("../services/pgLockManager");
const logger_1 = __importDefault(require("../logger"));
const uuid_1 = require("uuid");
/**
 * Lock middleware helpers for protecting critical operations
 * Provides utilities for lock-aware request handling
 */
const LOCK_RETRY_ATTEMPTS = parseInt(process.env.LOCK_RETRY_ATTEMPTS || '3', 10);
const LOCK_RETRY_DELAY_MS = parseInt(process.env.LOCK_RETRY_DELAY_MS || '100', 10);
/**
 * Acquire a lock or fail immediately with 409 Conflict
 * @param resourceId - Unique identifier for the resource to lock
 * @param ttlSeconds - Time-to-live for the lock in seconds
 * @returns LockContext if acquired, null if locked by another process
 */
async function acquireOrFail(resourceId, ttlSeconds = 30) {
    try {
        const lockManager = (0, pgLockManager_1.getPgLockManager)();
        const ownerId = (0, uuid_1.v4)();
        const startTime = Date.now();
        const acquired = await lockManager.acquireLock(resourceId, ownerId, ttlSeconds);
        if (!acquired) {
            logger_1.default.debug(`Lock acquisition failed (immediate): ${resourceId}`);
            return null;
        }
        const waitTimeMs = Date.now() - startTime;
        return {
            resourceId,
            ownerId,
            acquiredAt: new Date(),
            waitTimeMs
        };
    }
    catch (error) {
        logger_1.default.error(`Error acquiring lock ${resourceId}: ${error.message}`);
        throw error;
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
async function acquireWithRetry(resourceId, ttlSeconds = 30, maxAttempts = LOCK_RETRY_ATTEMPTS, retryDelayMs = LOCK_RETRY_DELAY_MS) {
    try {
        const lockManager = (0, pgLockManager_1.getPgLockManager)();
        const ownerId = (0, uuid_1.v4)();
        const startTime = Date.now();
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const acquired = await lockManager.acquireLock(resourceId, ownerId, ttlSeconds);
            if (acquired) {
                const waitTimeMs = Date.now() - startTime;
                logger_1.default.debug(`Lock acquired after ${attempt} attempt(s) for ${resourceId} (wait: ${waitTimeMs}ms)`);
                return {
                    resourceId,
                    ownerId,
                    acquiredAt: new Date(),
                    waitTimeMs
                };
            }
            if (attempt < maxAttempts) {
                await delay(retryDelayMs);
            }
        }
        logger_1.default.debug(`Lock acquisition timeout: ${resourceId} (${maxAttempts} attempts)`);
        return null;
    }
    catch (error) {
        logger_1.default.error(`Error acquiring lock with retry ${resourceId}: ${error.message}`);
        throw error;
    }
}
/**
 * Release a lock
 * @param lockContext - Lock context from acquisition
 */
async function releaseLock(lockContext) {
    try {
        const lockManager = (0, pgLockManager_1.getPgLockManager)();
        const released = await lockManager.releaseLock(lockContext.resourceId, lockContext.ownerId);
        if (released) {
            logger_1.default.debug(`Lock released: ${lockContext.resourceId}`);
        }
        return released;
    }
    catch (error) {
        logger_1.default.error(`Error releasing lock ${lockContext.resourceId}: ${error.message}`);
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
async function withLock(resourceId, operation, ttlSeconds = 30) {
    const lockContext = await acquireOrFail(resourceId, ttlSeconds);
    if (!lockContext) {
        throw new Error(`LOCK_CONFLICT: Cannot acquire lock for ${resourceId}`);
    }
    try {
        const result = await operation();
        return { result, lockContext };
    }
    finally {
        try {
            await releaseLock(lockContext);
        }
        catch (error) {
            logger_1.default.warn(`Failed to release lock for ${resourceId}: ${error.message}`);
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
async function withLockRetry(resourceId, operation, ttlSeconds = 30, maxAttempts = LOCK_RETRY_ATTEMPTS, retryDelayMs = LOCK_RETRY_DELAY_MS) {
    const lockContext = await acquireWithRetry(resourceId, ttlSeconds, maxAttempts, retryDelayMs);
    if (!lockContext) {
        throw new Error(`LOCK_TIMEOUT: Cannot acquire lock for ${resourceId} after ${maxAttempts} attempts`);
    }
    try {
        const result = await operation();
        return { result, lockContext };
    }
    finally {
        try {
            await releaseLock(lockContext);
        }
        catch (error) {
            logger_1.default.warn(`Failed to release lock for ${resourceId}: ${error.message}`);
        }
    }
}
/**
 * Express middleware to attach lock helpers to request
 * Enables req.lock.acquire(), req.lock.withLock(), etc.
 */
function lockMiddleware(req, _res, next) {
    // Attach lock helpers to request
    req.lock = {
        acquireOrFail: (resourceId, ttlSeconds) => acquireOrFail(resourceId, ttlSeconds),
        acquireWithRetry: (resourceId, ttlSeconds, maxAttempts, retryDelayMs) => acquireWithRetry(resourceId, ttlSeconds, maxAttempts, retryDelayMs),
        withLock: (resourceId, operation, ttlSeconds) => withLock(resourceId, operation, ttlSeconds),
        withLockRetry: (resourceId, operation, ttlSeconds, maxAttempts, retryDelayMs) => withLockRetry(resourceId, operation, ttlSeconds, maxAttempts, retryDelayMs),
        release: (lockContext) => releaseLock(lockContext)
    };
    next();
}
/**
 * Helper function for delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Get lock info for a resource
 */
async function getLockInfo(resourceId) {
    try {
        const lockManager = (0, pgLockManager_1.getPgLockManager)();
        return await lockManager.getLockInfo(resourceId);
    }
    catch (error) {
        logger_1.default.error(`Error getting lock info for ${resourceId}: ${error.message}`);
        return null;
    }
}
/**
 * Check if a resource is locked
 */
async function isResourceLocked(resourceId) {
    try {
        const lockManager = (0, pgLockManager_1.getPgLockManager)();
        return await lockManager.isLocked(resourceId);
    }
    catch (error) {
        logger_1.default.error(`Error checking lock status for ${resourceId}: ${error.message}`);
        return false;
    }
}
//# sourceMappingURL=lockMiddleware.js.map