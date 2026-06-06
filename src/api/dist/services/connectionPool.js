"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionPool = void 0;
exports.getConnectionPool = getConnectionPool;
exports.initializeConnectionPool = initializeConnectionPool;
exports.shutdownConnectionPool = shutdownConnectionPool;
const generic_pool_1 = __importDefault(require("generic-pool"));
const node_cache_1 = __importDefault(require("node-cache"));
const logger_1 = __importDefault(require("../logger"));
const powershellService_1 = require("./powershellService");
/**
 * Generic connection pool for PowerShell service instances
 * Manages connection lifecycle, reuse, and graceful shutdown
 */
class ConnectionPool {
    constructor() {
        this.metrics = {
            totalCreated: 0,
            totalDestroyed: 0,
            errorCount: 0,
            waitTimes: []
        };
        this.MIN_SIZE = 2;
        this.MAX_SIZE = 8;
        this.TTL = 300; // 5 minutes in seconds
        this.IDLE_TIMEOUT = 600000; // 10 minutes in milliseconds
        this.cache = new node_cache_1.default({ stdTTL: this.TTL, checkperiod: 60 });
        const factory = {
            create: async () => {
                logger_1.default.debug('Creating new PowerShell service instance');
                this.metrics.totalCreated++;
                return new powershellService_1.PowerShellService();
            },
            destroy: async (_instance) => {
                logger_1.default.debug('Destroying PowerShell service instance');
                this.metrics.totalDestroyed++;
            },
            validate: async (_instance) => {
                // Validate that the instance is still usable
                // PowerShellService is stateless, so always valid
                return true;
            }
        };
        this.pool = generic_pool_1.default.createPool(factory, {
            min: this.MIN_SIZE,
            max: this.MAX_SIZE,
            acquireTimeoutMillis: 30000, // 30 second timeout
            idleTimeoutMillis: this.IDLE_TIMEOUT,
            fifo: true
        });
        logger_1.default.info(`Connection pool initialized: min=${this.MIN_SIZE}, max=${this.MAX_SIZE}, TTL=${this.TTL}s`);
    }
    /**
     * Acquire a connection from the pool
     */
    async acquire() {
        const startTime = Date.now();
        try {
            const connection = await this.pool.acquire();
            const waitTime = Date.now() - startTime;
            this.metrics.waitTimes.push(waitTime);
            // Keep only last 1000 wait times for memory efficiency
            if (this.metrics.waitTimes.length > 1000) {
                this.metrics.waitTimes.shift();
            }
            logger_1.default.debug(`Acquired connection from pool (wait: ${waitTime}ms)`);
            return connection;
        }
        catch (error) {
            this.metrics.errorCount++;
            logger_1.default.error(`Failed to acquire connection from pool: ${error.message}`);
            throw new Error(`Connection pool exhausted or timeout: ${error.message}`);
        }
    }
    /**
     * Release a connection back to the pool
     */
    async release(connection) {
        try {
            await this.pool.release(connection);
            logger_1.default.debug('Released connection back to pool');
        }
        catch (error) {
            this.metrics.errorCount++;
            logger_1.default.error(`Failed to release connection: ${error.message}`);
            // Destroy the connection if release fails
            try {
                await this.pool.destroy(connection);
            }
            catch (destroyError) {
                logger_1.default.error(`Failed to destroy connection: ${destroyError.message}`);
            }
        }
    }
    /**
     * Get current pool metrics
     */
    getMetrics() {
        const poolSize = this.pool.size;
        const availableCount = this.pool.available;
        const waitingCount = Math.max(0, poolSize - availableCount);
        const avgWaitTime = this.metrics.waitTimes.length > 0
            ? this.metrics.waitTimes.reduce((a, b) => a + b, 0) / this.metrics.waitTimes.length
            : 0;
        return {
            size: poolSize,
            available: availableCount,
            idle: availableCount,
            pending: waitingCount,
            totalCreated: this.metrics.totalCreated,
            totalDestroyed: this.metrics.totalDestroyed,
            activeConnections: poolSize - availableCount,
            errorCount: this.metrics.errorCount,
            averageWaitTime: avgWaitTime
        };
    }
    /**
     * Drain the pool and close all connections
     */
    async drain() {
        try {
            logger_1.default.info('Draining connection pool...');
            await this.pool.drain();
            await this.pool.clear();
            this.cache.flushAll();
            logger_1.default.info('Connection pool drained successfully');
        }
        catch (error) {
            logger_1.default.error(`Error draining connection pool: ${error.message}`);
            throw error;
        }
    }
    /**
     * Cache a value with TTL
     */
    setCache(key, value, ttl) {
        this.cache.set(key, value, ttl || this.TTL);
    }
    /**
     * Retrieve a cached value
     */
    getCache(key) {
        return this.cache.get(key);
    }
    /**
     * Delete a cached value
     */
    delCache(key) {
        return this.cache.del(key);
    }
    /**
     * Clear all cache
     */
    flushCache() {
        this.cache.flushAll();
    }
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return this.cache.getStats();
    }
    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            totalCreated: 0,
            totalDestroyed: 0,
            errorCount: 0,
            waitTimes: []
        };
    }
}
exports.ConnectionPool = ConnectionPool;
// Singleton instance
let poolInstance;
/**
 * Get or create the global connection pool instance
 */
function getConnectionPool() {
    if (!poolInstance) {
        poolInstance = new ConnectionPool();
    }
    return poolInstance;
}
/**
 * Initialize the connection pool
 */
function initializeConnectionPool() {
    poolInstance = new ConnectionPool();
    return poolInstance;
}
/**
 * Shutdown the connection pool
 */
async function shutdownConnectionPool() {
    if (poolInstance) {
        await poolInstance.drain();
    }
}
//# sourceMappingURL=connectionPool.js.map