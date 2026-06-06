import { getSqlClient } from './sqlClient';
import logger from '../logger';
import { v4 as uuidv4 } from 'uuid';

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
export class PgLockManager {
  private readonly DEFAULT_LOCK_TTL_SECONDS = 30;
  private readonly CLEANUP_INTERVAL_MS = 300000; // 5 minutes
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('PgLockManager already initialized');
      return;
    }

    try {
      const sqlClient = getSqlClient();

      // Verify locks table exists
      const result = await sqlClient.query(
        `SELECT COUNT(*) as tableCount
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'flashdb_locks'`
      );

      if ((result.recordset[0]?.tableCount ?? 0) === 0) {
        logger.warn('flashdb_locks table does not exist. It will be created on demand.');
      }

      this.isInitialized = true;
      logger.info('PgLockManager initialized');

      // Start cleanup interval
      this.startCleanup();
    } catch (error: any) {
      logger.error(`Failed to initialize PgLockManager: ${error.message}`);
      throw error;
    }
  }

  /**
   * Acquire a distributed lock
   * Returns true if lock was successfully acquired
   */
  async acquireLock(
    resourceId: string,
    ownerId: string,
    ttlSeconds: number = this.DEFAULT_LOCK_TTL_SECONDS
  ): Promise<boolean> {
    try {
      const sqlClient = getSqlClient();

      // Check if lock already exists and is still valid
      const checkSql = `
        SELECT [owner_id], [expires_at]
        FROM [dbo].[flashdb_locks]
        WHERE [resource_id] = @resourceId
          AND [expires_at] > GETUTCDATE()
      `;

      const checkResult = await sqlClient.query<{ owner_id: string; expires_at: string }>(
        checkSql,
        { resourceId }
      );

      // If lock exists and not expired, check if we own it
      if (checkResult.recordset.length > 0) {
        const existingLock = checkResult.recordset[0];
        if (existingLock.owner_id !== ownerId) {
          logger.debug(
            `Lock already held for ${resourceId} by ${existingLock.owner_id}, owned by ${ownerId}`
          );
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

        logger.debug(`Lock acquired: ${resourceId} by ${ownerId}`);
        return true;
      } catch (error: any) {
        // Lock may have been acquired by another instance in the meantime
        if (error.message.includes('PRIMARY KEY')) {
          logger.debug(`Lock already exists for ${resourceId}`);
          return false;
        }
        throw error;
      }
    } catch (error: any) {
      logger.error(`Failed to acquire lock ${resourceId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Release a distributed lock
   * Only the owner can release the lock
   */
  async releaseLock(resourceId: string, ownerId: string): Promise<boolean> {
    try {
      const sqlClient = getSqlClient();

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
        logger.debug(`Lock released: ${resourceId} by ${ownerId}`);
        return true;
      } else {
        logger.debug(`Lock not found or owned by different instance: ${resourceId}`);
        return false;
      }
    } catch (error: any) {
      logger.error(`Failed to release lock ${resourceId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if a resource is currently locked
   */
  async isLocked(resourceId: string): Promise<boolean> {
    try {
      const sqlClient = getSqlClient();

      const sql = `
        SELECT COUNT(*) as lockCount
        FROM [dbo].[flashdb_locks]
        WHERE [resource_id] = @resourceId
          AND [expires_at] > GETUTCDATE()
      `;

      const result = await sqlClient.query<{ lockCount: number }>(sql, { resourceId });

      return (result.recordset[0]?.lockCount ?? 0) > 0;
    } catch (error: any) {
      logger.error(`Failed to check lock status for ${resourceId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Renew a lock (extend its lifetime)
   * Only the owner can renew
   */
  async renewLock(
    resourceId: string,
    ownerId: string,
    ttlSeconds: number = this.DEFAULT_LOCK_TTL_SECONDS
  ): Promise<boolean> {
    try {
      const sqlClient = getSqlClient();

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
        logger.debug(`Lock renewed: ${resourceId} by ${ownerId} (TTL: ${ttlSeconds}s)`);
        return true;
      } else {
        logger.debug(
          `Could not renew lock ${resourceId} (not owned by ${ownerId} or expired)`
        );
        return false;
      }
    } catch (error: any) {
      logger.error(`Failed to renew lock ${resourceId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get lock information
   */
  async getLockInfo(resourceId: string): Promise<LockInfo | null> {
    try {
      const sqlClient = getSqlClient();

      const sql = `
        SELECT [resource_id], [owner_id], [acquired_at], [expires_at]
        FROM [dbo].[flashdb_locks]
        WHERE [resource_id] = @resourceId
      `;

      const result = await sqlClient.query<{
        resource_id: string;
        owner_id: string;
        acquired_at: string;
        expires_at: string;
      }>(sql, { resourceId });

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
    } catch (error: any) {
      logger.error(`Failed to get lock info for ${resourceId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Try to acquire lock with retries
   * Useful for operations that need to wait for lock availability
   */
  async acquireLockWithRetry(
    resourceId: string,
    ownerId: string,
    ttlSeconds: number = this.DEFAULT_LOCK_TTL_SECONDS,
    maxAttempts: number = 5,
    retryDelayMs: number = 500
  ): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const acquired = await this.acquireLock(resourceId, ownerId, ttlSeconds);

      if (acquired) {
        return true;
      }

      if (attempt < maxAttempts) {
        logger.debug(
          `Lock acquisition failed (attempt ${attempt}/${maxAttempts}), retrying in ${retryDelayMs}ms`
        );
        await this.delay(retryDelayMs);
      }
    }

    logger.warn(
      `Failed to acquire lock ${resourceId} after ${maxAttempts} attempts`
    );
    return false;
  }

  /**
   * Execute a function while holding a lock
   * Automatically acquires and releases lock
   */
  async withLock<T>(
    resourceId: string,
    ttlSeconds: number = this.DEFAULT_LOCK_TTL_SECONDS,
    fn: () => Promise<T>
  ): Promise<T> {
    const ownerId = uuidv4();
    const acquired = await this.acquireLock(resourceId, ownerId, ttlSeconds);

    if (!acquired) {
      throw new Error(`Failed to acquire lock for ${resourceId}`);
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(resourceId, ownerId);
    }
  }

  /**
   * Start periodic cleanup of expired locks
   */
  private startCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(async () => {
      try {
        const sqlClient = getSqlClient();

        const sql = `
          DELETE FROM [dbo].[flashdb_locks]
          WHERE [expires_at] <= GETUTCDATE()
        `;

        const rowsDeleted = await sqlClient.execute(sql);

        if (rowsDeleted > 0) {
          logger.debug(`Cleanup removed ${rowsDeleted} expired locks`);
        }
      } catch (error: any) {
        logger.warn(`Lock cleanup failed: ${error.message}`);
      }
    }, this.CLEANUP_INTERVAL_MS);

    // Ensure interval doesn't block process exit
    if (this.cleanupInterval && typeof this.cleanupInterval === 'object' && 'unref' in this.cleanupInterval) {
      (this.cleanupInterval as any).unref();
    }

    logger.debug('Lock cleanup started (5 minute interval)');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      this.isInitialized = false;
      logger.info('PgLockManager shut down successfully');
    } catch (error: any) {
      logger.error(`Error shutting down PgLockManager: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if lock manager is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const sqlClient = getSqlClient();
      await sqlClient.query('SELECT 1 as test FROM [dbo].[flashdb_locks] WHERE 1=0');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get lock statistics
   */
  async getStats(): Promise<{
    totalLocks: number;
    activeLocks: number;
    expiredLocks: number;
  }> {
    try {
      const sqlClient = getSqlClient();

      const sql = `
        SELECT
          COUNT(*) as totalLocks,
          SUM(CASE WHEN [expires_at] > GETUTCDATE() THEN 1 ELSE 0 END) as activeLocks,
          SUM(CASE WHEN [expires_at] <= GETUTCDATE() THEN 1 ELSE 0 END) as expiredLocks
        FROM [dbo].[flashdb_locks]
      `;

      const result = await sqlClient.query<{
        totalLocks: number;
        activeLocks: number;
        expiredLocks: number;
      }>(sql);

      const row = result.recordset[0];
      return {
        totalLocks: row?.totalLocks ?? 0,
        activeLocks: row?.activeLocks ?? 0,
        expiredLocks: row?.expiredLocks ?? 0
      };
    } catch (error: any) {
      logger.error(`Failed to get lock stats: ${error.message}`);
      throw error;
    }
  }
}

// Singleton instance
let lockManagerInstance: PgLockManager;

/**
 * Get or create the global lock manager instance
 */
export function getPgLockManager(): PgLockManager {
  if (!lockManagerInstance) {
    lockManagerInstance = new PgLockManager();
  }
  return lockManagerInstance;
}

/**
 * Initialize the lock manager
 */
export async function initializePgLockManager(): Promise<PgLockManager> {
  lockManagerInstance = new PgLockManager();
  await lockManagerInstance.initialize();
  return lockManagerInstance;
}
