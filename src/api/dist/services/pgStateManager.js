"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PgStateManager = void 0;
exports.getPgStateManager = getPgStateManager;
exports.initializePgStateManager = initializePgStateManager;
const sqlClient_1 = require("./sqlClient");
const logger_1 = __importDefault(require("../logger"));
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
class PgStateManager {
    constructor() {
        this.watchIntervals = new Map();
        this.WATCH_INTERVAL_MS = 5000; // 5 seconds
        this.CLEANUP_INTERVAL_MS = 3600000; // 1 hour
        this.cleanupInterval = null;
        this.isInitialized = false;
    }
    async initialize() {
        if (this.isInitialized) {
            logger_1.default.debug('PgStateManager already initialized');
            return;
        }
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            // Verify tables exist
            const result = await sqlClient.query(`SELECT COUNT(*) as tableCount
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME IN ('flashdb_state', 'flashdb_locks', 'flashdb_operations')`);
            const tableCount = result.recordset[0]?.tableCount ?? 0;
            if (tableCount < 3) {
                logger_1.default.warn('Not all state management tables exist. They will be created on demand.');
            }
            this.isInitialized = true;
            logger_1.default.info('PgStateManager initialized');
            // Start cleanup interval
            this.startCleanup();
        }
        catch (error) {
            logger_1.default.error(`Failed to initialize PgStateManager: ${error.message}`);
            throw error;
        }
    }
    /**
     * Set state value
     * Performs UPSERT into flashdb_state
     */
    async setState(key, value, ttlSeconds) {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            const jsonValue = typeof value === 'string' ? value : JSON.stringify(value);
            let expiresAt = null;
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
            logger_1.default.debug(`State set: ${key}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to set state ${key}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get state value
     * Returns parsed JSON or null if not found or expired
     */
    async getState(key) {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            const sql = `
        SELECT [value], [expires_at]
        FROM [dbo].[flashdb_state]
        WHERE [key] = @key
          AND ([expires_at] IS NULL OR [expires_at] > GETUTCDATE())
      `;
            const result = await sqlClient.query(sql, { key });
            if (result.recordset.length === 0) {
                return null;
            }
            try {
                return JSON.parse(result.recordset[0].value);
            }
            catch {
                // If not valid JSON, return as string
                return result.recordset[0].value;
            }
        }
        catch (error) {
            logger_1.default.error(`Failed to get state ${key}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Delete state value
     */
    async deleteState(key) {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            const sql = `DELETE FROM [dbo].[flashdb_state] WHERE [key] = @key`;
            await sqlClient.execute(sql, { key });
            logger_1.default.debug(`State deleted: ${key}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to delete state ${key}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get all state keys matching a prefix pattern
     */
    async getAllState(prefix) {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            let sql = `
        SELECT [key], [value]
        FROM [dbo].[flashdb_state]
        WHERE [expires_at] IS NULL OR [expires_at] > GETUTCDATE()
      `;
            const params = {};
            if (prefix) {
                sql += ` AND [key] LIKE @prefix`;
                params.prefix = `${prefix}%`;
            }
            const result = await sqlClient.query(sql, params);
            const state = {};
            for (const row of result.recordset) {
                try {
                    state[row.key] = JSON.parse(row.value);
                }
                catch {
                    state[row.key] = row.value;
                }
            }
            return state;
        }
        catch (error) {
            logger_1.default.error(`Failed to get all state: ${error.message}`);
            throw error;
        }
    }
    /**
     * Watch for state changes (polling-based)
     * Polls database every 5 seconds and calls callback when value changes
     */
    async watchState(key, callback) {
        try {
            let lastValue = await this.getState(key);
            const interval = setInterval(async () => {
                try {
                    const currentValue = await this.getState(key);
                    // Deep equality check
                    if (JSON.stringify(lastValue) !== JSON.stringify(currentValue)) {
                        lastValue = currentValue;
                        callback(currentValue);
                    }
                }
                catch (error) {
                    logger_1.default.warn(`Error during state watch for ${key}: ${error.message}`);
                }
            }, this.WATCH_INTERVAL_MS);
            // Store interval for cleanup
            this.watchIntervals.set(key, interval);
            // Ensure interval doesn't block process exit
            if (interval && typeof interval === 'object' && 'unref' in interval) {
                interval.unref();
            }
            logger_1.default.debug(`Started watching state: ${key}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to watch state ${key}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Stop watching state
     */
    unwatchState(watchKey) {
        const interval = this.watchIntervals.get(watchKey);
        if (interval) {
            clearInterval(interval);
            this.watchIntervals.delete(watchKey);
            logger_1.default.debug(`Stopped watching state: ${watchKey}`);
        }
    }
    /**
     * Start periodic cleanup of expired entries
     */
    startCleanup() {
        if (this.cleanupInterval) {
            return;
        }
        this.cleanupInterval = setInterval(async () => {
            try {
                const sqlClient = (0, sqlClient_1.getSqlClient)();
                // Delete expired state
                const sql = `
          DELETE FROM [dbo].[flashdb_state]
          WHERE [expires_at] IS NOT NULL AND [expires_at] <= GETUTCDATE()
        `;
                const rowsDeleted = await sqlClient.execute(sql);
                if (rowsDeleted > 0) {
                    logger_1.default.debug(`Cleanup removed ${rowsDeleted} expired state entries`);
                }
            }
            catch (error) {
                logger_1.default.warn(`State cleanup failed: ${error.message}`);
            }
        }, this.CLEANUP_INTERVAL_MS);
        // Ensure interval doesn't block process exit
        if (this.cleanupInterval && typeof this.cleanupInterval === 'object' && 'unref' in this.cleanupInterval) {
            this.cleanupInterval.unref();
        }
        logger_1.default.debug('State cleanup started (1 hour interval)');
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
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
            logger_1.default.info('PgStateManager shut down successfully');
        }
        catch (error) {
            logger_1.default.error(`Error shutting down PgStateManager: ${error.message}`);
            throw error;
        }
    }
    /**
     * Check if state manager is healthy
     */
    async isHealthy() {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            await sqlClient.query('SELECT 1 as test FROM [dbo].[flashdb_state] WHERE 1=0');
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Get state statistics
     */
    async getStats() {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            const sql = `
        SELECT
          COUNT(*) as totalKeys,
          SUM(CASE WHEN [expires_at] IS NOT NULL AND [expires_at] <= GETUTCDATE() THEN 1 ELSE 0 END) as expiredKeys,
          MIN([created_at]) as oldestDate,
          MAX([updated_at]) as newestDate
        FROM [dbo].[flashdb_state]
      `;
            const result = await sqlClient.query(sql);
            const row = result.recordset[0];
            return {
                totalKeys: row?.totalKeys ?? 0,
                expiredKeys: row?.expiredKeys ?? 0,
                oldestKey: row?.oldestDate ?? null,
                newestKey: row?.newestDate ?? null
            };
        }
        catch (error) {
            logger_1.default.error(`Failed to get state stats: ${error.message}`);
            throw error;
        }
    }
}
exports.PgStateManager = PgStateManager;
// Singleton instance
let stateManagerInstance;
/**
 * Get or create the global state manager instance
 */
function getPgStateManager() {
    if (!stateManagerInstance) {
        stateManagerInstance = new PgStateManager();
    }
    return stateManagerInstance;
}
/**
 * Initialize the state manager
 */
async function initializePgStateManager() {
    stateManagerInstance = new PgStateManager();
    await stateManagerInstance.initialize();
    return stateManagerInstance;
}
//# sourceMappingURL=pgStateManager.js.map