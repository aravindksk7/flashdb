import { getSqlClient } from './sqlClient';
import logger from '../logger';

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
export class PgStateManager {
  private watchIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly WATCH_INTERVAL_MS = 5000; // 5 seconds
  private readonly CLEANUP_INTERVAL_MS = 3600000; // 1 hour
  private cleanupInterval: NodeJS.Timeout | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('PgStateManager already initialized');
      return;
    }

    try {
      const sqlClient = getSqlClient();

      // Verify tables exist
      const result = await sqlClient.query(
        `SELECT COUNT(*) as tableCount
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME IN ('flashdb_state', 'flashdb_locks', 'flashdb_operations')`
      );

      const tableCount = result.recordset[0]?.tableCount ?? 0;
      if (tableCount < 3) {
        logger.warn('Not all state management tables exist. They will be created on demand.');
      }

      this.isInitialized = true;
      logger.info('PgStateManager initialized');

      // Start cleanup interval
      this.startCleanup();
    } catch (error: any) {
      logger.error(`Failed to initialize PgStateManager: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set state value
   * Performs UPSERT into flashdb_state
   */
  async setState(key: string, value: any, ttlSeconds?: number): Promise<void> {
    try {
      const sqlClient = getSqlClient();
      const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);

      let expiresAt: string | null = null;
      if (ttlSeconds && ttlSeconds > 0) {
        const expDate = new Date(Date.now() + ttlSeconds * 1000);
        expiresAt = expDate.toISOString();
      }

      // UPSERT: try update first, then insert if no rows affected
      const sql = `
        MERGE INTO [dbo].[flashdb_state] AS target
        USING (SELECT @key AS [key], @value AS [value], @expiresAt AS [expires_at]) AS source
          ON target.[key] = source.[key]
        WHEN MATCHED THEN
          UPDATE SET
            [value] = source.[value],
            [expires_at] = source.[expires_at],
            [updated_at] = GETUTCDATE()
        WHEN NOT MATCHED THEN
          INSERT ([key], [value], [expires_at], [updated_at], [created_at])
          VALUES (source.[key], source.[value], source.[expires_at], GETUTCDATE(), GETUTCDATE());
      `;

      await sqlClient.execute(sql, {
        key,
        value: jsonValue,
        expiresAt
      });

      logger.debug(`State set: ${key}`);
    } catch (error: any) {
      logger.error(`Failed to set state ${key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get state value
   * Returns parsed JSON or null if not found or expired
   */
  async getState(key: string): Promise<any | null> {
    try {
      const sqlClient = getSqlClient();

      const sql = `
        SELECT [value], [expires_at]
        FROM [dbo].[flashdb_state]
        WHERE [key] = @key
          AND ([expires_at] IS NULL OR [expires_at] > GETUTCDATE())
      `;

      const result = await sqlClient.query<{ value: string; expires_at: string | null }>(
        sql,
        { key }
      );

      if (result.recordset.length === 0) {
        return null;
      }

      try {
        return JSON.parse(result.recordset[0].value);
      } catch {
        // If not valid JSON, return as string
        return result.recordset[0].value;
      }
    } catch (error: any) {
      logger.error(`Failed to get state ${key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete state value
   */
  async deleteState(key: string): Promise<void> {
    try {
      const sqlClient = getSqlClient();

      const sql = `DELETE FROM [dbo].[flashdb_state] WHERE [key] = @key`;

      await sqlClient.execute(sql, { key });

      logger.debug(`State deleted: ${key}`);
    } catch (error: any) {
      logger.error(`Failed to delete state ${key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all state keys matching a prefix pattern
   */
  async getAllState(prefix?: string): Promise<Record<string, any>> {
    try {
      const sqlClient = getSqlClient();

      let sql = `
        SELECT [key], [value]
        FROM [dbo].[flashdb_state]
        WHERE [expires_at] IS NULL OR [expires_at] > GETUTCDATE()
      `;

      const params: Record<string, any> = {};

      if (prefix) {
        sql += ` AND [key] LIKE @prefix`;
        params.prefix = `${prefix}%`;
      }

      const result = await sqlClient.query<{ key: string; value: string }>(sql, params);

      const state: Record<string, any> = {};
      for (const row of result.recordset) {
        try {
          state[row.key] = JSON.parse(row.value);
        } catch {
          state[row.key] = row.value;
        }
      }

      return state;
    } catch (error: any) {
      logger.error(`Failed to get all state: ${error.message}`);
      throw error;
    }
  }

  /**
   * Watch for state changes (polling-based)
   * Polls database every 5 seconds and calls callback when value changes
   */
  async watchState(key: string, callback: (value: any) => void): Promise<void> {
    try {
      let lastValue: any = await this.getState(key);

      const interval = setInterval(async () => {
        try {
          const currentValue = await this.getState(key);

          // Deep equality check
          if (JSON.stringify(lastValue) !== JSON.stringify(currentValue)) {
            lastValue = currentValue;
            callback(currentValue);
          }
        } catch (error: any) {
          logger.warn(`Error during state watch for ${key}: ${error.message}`);
        }
      }, this.WATCH_INTERVAL_MS);

      // Store interval for cleanup
      this.watchIntervals.set(key, interval);

      // Ensure interval doesn't block process exit
      if (interval && typeof interval === 'object' && 'unref' in interval) {
        (interval as any).unref();
      }

      logger.debug(`Started watching state: ${key}`);
    } catch (error: any) {
      logger.error(`Failed to watch state ${key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Stop watching state
   */
  unwatchState(watchKey: string): void {
    const interval = this.watchIntervals.get(watchKey);
    if (interval) {
      clearInterval(interval);
      this.watchIntervals.delete(watchKey);
      logger.debug(`Stopped watching state: ${watchKey}`);
    }
  }

  /**
   * Start periodic cleanup of expired entries
   */
  private startCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(async () => {
      try {
        const sqlClient = getSqlClient();

        // Delete expired state
        const sql = `
          DELETE FROM [dbo].[flashdb_state]
          WHERE [expires_at] IS NOT NULL AND [expires_at] <= GETUTCDATE()
        `;

        const rowsDeleted = await sqlClient.execute(sql);

        if (rowsDeleted > 0) {
          logger.debug(`Cleanup removed ${rowsDeleted} expired state entries`);
        }
      } catch (error: any) {
        logger.warn(`State cleanup failed: ${error.message}`);
      }
    }, this.CLEANUP_INTERVAL_MS);

    // Ensure interval doesn't block process exit
    if (this.cleanupInterval && typeof this.cleanupInterval === 'object' && 'unref' in this.cleanupInterval) {
      (this.cleanupInterval as any).unref();
    }

    logger.debug('State cleanup started (1 hour interval)');
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      // Stop all watches
      for (const [_key, interval] of this.watchIntervals) {
        clearInterval(interval);
      }
      this.watchIntervals.clear();

      // Stop cleanup
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      this.isInitialized = false;
      logger.info('PgStateManager shut down successfully');
    } catch (error: any) {
      logger.error(`Error shutting down PgStateManager: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check if state manager is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const sqlClient = getSqlClient();
      await sqlClient.query('SELECT 1 as test FROM [dbo].[flashdb_state] WHERE 1=0');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get state statistics
   */
  async getStats(): Promise<{
    totalKeys: number;
    expiredKeys: number;
    oldestKey: string | null;
    newestKey: string | null;
  }> {
    try {
      const sqlClient = getSqlClient();

      const sql = `
        SELECT
          COUNT(*) as totalKeys,
          SUM(CASE WHEN [expires_at] IS NOT NULL AND [expires_at] <= GETUTCDATE() THEN 1 ELSE 0 END) as expiredKeys,
          MIN([created_at]) as oldestDate,
          MAX([updated_at]) as newestDate
        FROM [dbo].[flashdb_state]
      `;

      const result = await sqlClient.query<{
        totalKeys: number;
        expiredKeys: number;
        oldestDate: string | null;
        newestDate: string | null;
      }>(sql);

      const row = result.recordset[0];
      return {
        totalKeys: row?.totalKeys ?? 0,
        expiredKeys: row?.expiredKeys ?? 0,
        oldestKey: row?.oldestDate ?? null,
        newestKey: row?.newestDate ?? null
      };
    } catch (error: any) {
      logger.error(`Failed to get state stats: ${error.message}`);
      throw error;
    }
  }
}

// Singleton instance
let stateManagerInstance: PgStateManager;

/**
 * Get or create the global state manager instance
 */
export function getPgStateManager(): PgStateManager {
  if (!stateManagerInstance) {
    stateManagerInstance = new PgStateManager();
  }
  return stateManagerInstance;
}

/**
 * Initialize the state manager
 */
export async function initializePgStateManager(): Promise<PgStateManager> {
  stateManagerInstance = new PgStateManager();
  await stateManagerInstance.initialize();
  return stateManagerInstance;
}
