"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PgLockManager = void 0;
exports.getPgLockManager = getPgLockManager;
exports.initializePgLockManager = initializePgLockManager;
const sqlClient_1 = require("./sqlClient");
const logger_1 = __importDefault(require("../logger"));
const uuid_1 = require("uuid");
/**
 * PostgreSQL-backed distributed lock manager
 * Uses database locks for distributed coordination across API instances
 * Features:
 * - Distributed locks with configurable TTL (default 30 seconds)
 * - Lock acquisition, renewal, and release
 * - Automatic cleanup of expired locks
 * - Lock info retrieval
 */
class PgLockManager {
    constructor() {
        this.DEFAULT_LOCK_TTL_SECONDS = 30;
        this.CLEANUP_INTERVAL_MS = 300000; // 5 minutes
        this.cleanupInterval = null;
        this.isInitialized = false;
    }
    async initialize() {
        if (this.isInitialized) {
            logger_1.default.debug('PgLockManager already initialized');
            return;
        }
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            // Verify locks table exists
            const result = await sqlClient.query(`SELECT COUNT(*) as tableCount
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'flashdb_locks'`);
            if ((result.recordset[0]?.tableCount ?? 0) === 0) {
                logger_1.default.warn('flashdb_locks table does not exist. It will be created on demand.');
            }
            this.isInitialized = true;
            logger_1.default.info('PgLockManager initialized');
            // Start cleanup interval
            this.startCleanup();
        }
        catch (error) {
            logger_1.default.error(`Failed to initialize PgLockManager: ${error.message}`);
            throw error;
        }
    }
    /**
     * Acquire a distributed lock
     * Returns true if lock was successfully acquired
     */
    async acquireLock(resourceId, ownerId, ttlSeconds = this.DEFAULT_LOCK_TTL_SECONDS) {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            // Check if lock already exists and is still valid
            const checkSql = `
        SELECT [owner_id], [expires_at]
        FROM [dbo].[flashdb_locks]
        WHERE [resource_id] = @resourceId
          AND [expires_at] > GETUTCDATE()
      `;
            const checkResult = await sqlClient.query(checkSql, { resourceId });
            // If lock exists and not expired, check if we own it
            if (checkResult.recordset.length > 0) {
                const existingLock = checkResult.recordset[0];
                if (existingLock.owner_id !== ownerId) {
                    logger_1.default.debug(`Lock already held for ${resourceId} by ${existingLock.owner_id}, owned by ${ownerId}`);
                    return false;
                }
                // We own the lock, try to renew it
                return this.renewLock(resourceId, ownerId, ttlSeconds);
            }
            // Try to acquire new lock
            const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
            const sql = `
        INSERT INTO [dbo].[flashdb_locks] ([resource_id], [owner_id], [acquired_at], [expires_at])
        VALUES (@resourceId, @ownerId, GETUTCDATE(), @expiresAt)
      `;
            try {
                await sqlClient.execute(sql, {
                    resourceId,
                    ownerId,
                    expiresAt: expiresAt.toISOString()
                });
                logger_1.default.debug(`Lock acquired: ${resourceId} by ${ownerId}`);
                return true;
            }
            catch (error) {
                // Lock may have been acquired by another instance in the meantime
                if (error.message.includes('PRIMARY KEY')) {
                    logger_1.default.debug(`Lock already exists for ${resourceId}`);
                    return false;
                }
                throw error;
            }
        }
        catch (error) {
            logger_1.default.error(`Failed to acquire lock ${resourceId}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Release a distributed lock
     * Only the owner can release the lock
     */
    async releaseLock(resourceId, ownerId) {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            const sql = `
        DELETE FROM [dbo].[flashdb_locks]
        WHERE [resource_id] = @resourceId
          AND [owner_id] = @ownerId
      `;
            const result = await sqlClient.execute(sql, {
                resourceId,
                ownerId
            });
            if (result > 0) {
                logger_1.default.debug(`Lock released: ${resourceId} by ${ownerId}`);
                return true;
            }
            else {
                logger_1.default.debug(`Lock not found or owned by different instance: ${resourceId}`);
                return false;
            }
        }
        catch (error) {
            logger_1.default.error(`Failed to release lock ${resourceId}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Check if a resource is currently locked
     */
    async isLocked(resourceId) {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            const sql = `
        SELECT COUNT(*) as lockCount
        FROM [dbo].[flashdb_locks]
        WHERE [resource_id] = @resourceId
          AND [expires_at] > GETUTCDATE()
      `;
            const result = await sqlClient.query(sql, { resourceId });
            return (result.recordset[0]?.lockCount ?? 0) > 0;
        }
        catch (error) {
            logger_1.default.error(`Failed to check lock status for ${resourceId}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Renew a lock (extend its lifetime)
     * Only the owner can renew
     */
    async renewLock(resourceId, ownerId, ttlSeconds = this.DEFAULT_LOCK_TTL_SECONDS) {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
            const sql = `
        UPDATE [dbo].[flashdb_locks]
        SET [expires_at] = @expiresAt
        WHERE [resource_id] = @resourceId
          AND [owner_id] = @ownerId
      `;
            const result = await sqlClient.execute(sql, {
                resourceId,
                ownerId,
                expiresAt: expiresAt.toISOString()
            });
            if (result > 0) {
                logger_1.default.debug(`Lock renewed: ${resourceId} by ${ownerId} (TTL: ${ttlSeconds}s)`);
                return true;
            }
            else {
                logger_1.default.debug(`Could not renew lock ${resourceId} (not owned by ${ownerId} or expired)`);
                return false;
            }
        }
        catch (error) {
            logger_1.default.error(`Failed to renew lock ${resourceId}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get lock information
     */
    async getLockInfo(resourceId) {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            const sql = `
        SELECT [resource_id], [owner_id], [acquired_at], [expires_at]
        FROM [dbo].[flashdb_locks]
        WHERE [resource_id] = @resourceId
      `;
            const result = await sqlClient.query(sql, { resourceId });
            if (result.recordset.length === 0) {
                return null;
            }
            const row = result.recordset[0];
            const expiresAt = new Date(row.expires_at);
            const isLocked = expiresAt > new Date();
            return {
                resourceId: row.resource_id,
                ownerId: row.owner_id,
                acquiredAt: new Date(row.acquired_at),
                expiresAt,
                isLocked
            };
        }
        catch (error) {
            logger_1.default.error(`Failed to get lock info for ${resourceId}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Try to acquire lock with retries
     * Useful for operations that need to wait for lock availability
     */
    async acquireLockWithRetry(resourceId, ownerId, ttlSeconds = this.DEFAULT_LOCK_TTL_SECONDS, maxAttempts = 5, retryDelayMs = 500) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const acquired = await this.acquireLock(resourceId, ownerId, ttlSeconds);
            if (acquired) {
                return true;
            }
            if (attempt < maxAttempts) {
                logger_1.default.debug(`Lock acquisition failed (attempt ${attempt}/${maxAttempts}), retrying in ${retryDelayMs}ms`);
                await this.delay(retryDelayMs);
            }
        }
        logger_1.default.warn(`Failed to acquire lock ${resourceId} after ${maxAttempts} attempts`);
        return false;
    }
    /**
     * Execute a function while holding a lock
     * Automatically acquires and releases lock
     */
    async withLock(resourceId, ttlSeconds = this.DEFAULT_LOCK_TTL_SECONDS, fn) {
        const ownerId = (0, uuid_1.v4)();
        const acquired = await this.acquireLock(resourceId, ownerId, ttlSeconds);
        if (!acquired) {
            throw new Error(`Failed to acquire lock for ${resourceId}`);
        }
        try {
            return await fn();
        }
        finally {
            await this.releaseLock(resourceId, ownerId);
        }
    }
    /**
     * Start periodic cleanup of expired locks
     */
    startCleanup() {
        if (this.cleanupInterval) {
            return;
        }
        this.cleanupInterval = setInterval(async () => {
            try {
                const sqlClient = (0, sqlClient_1.getSqlClient)();
                const sql = `
          DELETE FROM [dbo].[flashdb_locks]
          WHERE [expires_at] <= GETUTCDATE()
        `;
                const rowsDeleted = await sqlClient.execute(sql);
                if (rowsDeleted > 0) {
                    logger_1.default.debug(`Cleanup removed ${rowsDeleted} expired locks`);
                }
            }
            catch (error) {
                logger_1.default.warn(`Lock cleanup failed: ${error.message}`);
            }
        }, this.CLEANUP_INTERVAL_MS);
        // Ensure interval doesn't block process exit
        if (this.cleanupInterval && typeof this.cleanupInterval === 'object' && 'unref' in this.cleanupInterval) {
            this.cleanupInterval.unref();
        }
        logger_1.default.debug('Lock cleanup started (5 minute interval)');
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }
            this.isInitialized = false;
            logger_1.default.info('PgLockManager shut down successfully');
        }
        catch (error) {
            logger_1.default.error(`Error shutting down PgLockManager: ${error.message}`);
            throw error;
        }
    }
    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Check if lock manager is healthy
     */
    async isHealthy() {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            await sqlClient.query('SELECT 1 as test FROM [dbo].[flashdb_locks] WHERE 1=0');
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Get lock statistics
     */
    async getStats() {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            const sql = `
        SELECT
          COUNT(*) as totalLocks,
          SUM(CASE WHEN [expires_at] > GETUTCDATE() THEN 1 ELSE 0 END) as activeLocks,
          SUM(CASE WHEN [expires_at] <= GETUTCDATE() THEN 1 ELSE 0 END) as expiredLocks
        FROM [dbo].[flashdb_locks]
      `;
            const result = await sqlClient.query(sql);
            const row = result.recordset[0];
            return {
                totalLocks: row?.totalLocks ?? 0,
                activeLocks: row?.activeLocks ?? 0,
                expiredLocks: row?.expiredLocks ?? 0
            };
        }
        catch (error) {
            logger_1.default.error(`Failed to get lock stats: ${error.message}`);
            throw error;
        }
    }
}
exports.PgLockManager = PgLockManager;
// Singleton instance
let lockManagerInstance;
/**
 * Get or create the global lock manager instance
 */
function getPgLockManager() {
    if (!lockManagerInstance) {
        lockManagerInstance = new PgLockManager();
    }
    return lockManagerInstance;
}
/**
 * Initialize the lock manager
 */
async function initializePgLockManager() {
    lockManagerInstance = new PgLockManager();
    await lockManagerInstance.initialize();
    return lockManagerInstance;
}
//# sourceMappingURL=pgLockManager.js.map