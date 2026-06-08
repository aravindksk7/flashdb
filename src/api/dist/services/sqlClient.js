"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlClient = void 0;
exports.getSqlClient = getSqlClient;
exports.initializeSqlClient = initializeSqlClient;
exports.shutdownSqlClient = shutdownSqlClient;
const sql = __importStar(require("mssql"));
const logger_1 = __importDefault(require("../logger"));
/**
 * Direct MSSQL client with connection pooling and query optimization
 * Provides 5-10x faster execution compared to PowerShell SQL calls
 */
class SqlClient {
    constructor() {
        this.metrics = {
            errorCount: 0,
            totalRequests: 0,
            responseTimes: []
        };
        this.MIN_POOL_SIZE = 5;
        this.MAX_POOL_SIZE = 20;
        this.CONNECTION_TIMEOUT = 30000; // 30 seconds
        this.QUERY_TIMEOUT = 60000; // 60 seconds
        this.MAX_RETRY_ATTEMPTS = 3;
        this.RETRY_DELAY_MS = 100;
        this.isInitialized = false;
        this.initializePromise = null;
        this.healthCheckInterval = null;
    }
    /**
     * Initialize the SQL client and connection pool
     */
    async initialize() {
        if (this.isInitialized && this.pool?.connected) {
            logger_1.default.debug('SQL client already initialized');
            return;
        }
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        const config = {
            server: process.env.SQL_SERVER_HOST || 'localhost',
            port: parseInt(process.env.SQL_SERVER_PORT || '1433', 10),
            user: process.env.SQL_SERVER_USER || 'sa',
            password: process.env.SQL_SERVER_PASSWORD || '',
            database: process.env.SQL_DATABASE || 'FlashDB',
            connectionTimeout: this.CONNECTION_TIMEOUT,
            requestTimeout: this.QUERY_TIMEOUT,
            pool: {
                min: this.MIN_POOL_SIZE,
                max: this.MAX_POOL_SIZE,
                idleTimeoutMillis: 300000 // 5 minutes
            },
            options: {
                encrypt: false,
                trustServerCertificate: false,
                enableArithAbort: true
            }
        };
        this.pool = new sql.ConnectionPool(config);
        try {
            await this.pool.connect();
            this.isInitialized = true;
            logger_1.default.info(`SQL client initialized: ${config.server}:${config.port}/${config.database}`);
            logger_1.default.info(`Connection pool: min=${this.MIN_POOL_SIZE}, max=${this.MAX_POOL_SIZE}`);
            // Start health check
            this.startHealthCheck();
        }
        catch (error) {
            logger_1.default.error(`Failed to initialize SQL client: ${error.message}`);
            throw new Error(`SQL client initialization failed: ${error.message}`);
        }
    }
    async ensureConnected() {
        if (this.isInitialized && this.pool?.connected) {
            return;
        }
        if (!this.initializePromise) {
            this.initializePromise = this.initialize().finally(() => {
                this.initializePromise = null;
            });
        }
        await this.initializePromise;
    }
    /**
     * Start periodic health checks on the connection pool
     */
    startHealthCheck() {
        this.healthCheckInterval = setInterval(async () => {
            try {
                await this.ensureConnected();
                const request = new sql.Request(this.pool);
                await request.query('SELECT 1');
                logger_1.default.debug('SQL connection health check passed');
            }
            catch (error) {
                logger_1.default.warn(`SQL connection health check failed: ${error.message}`);
                this.metrics.errorCount++;
            }
        }, 60000); // Check every 60 seconds
        // Ensure interval has unref to not block process exit
        if (this.healthCheckInterval && typeof this.healthCheckInterval === 'object' && 'unref' in this.healthCheckInterval) {
            this.healthCheckInterval.unref();
        }
    }
    /**
     * Execute a parameterized query with results
     */
    async query(sqlString, params = {}) {
        const startTime = Date.now();
        let attempt = 0;
        while (attempt < this.MAX_RETRY_ATTEMPTS) {
            try {
                await this.ensureConnected();
                const request = new sql.Request(this.pool);
                request.connectionTimeout = this.CONNECTION_TIMEOUT;
                request.timeout = this.QUERY_TIMEOUT;
                // Add parameters with proper typing
                for (const [key, value] of Object.entries(params)) {
                    request.input(key, value);
                }
                // Prepend QUOTED_IDENTIFIER setting to ensure bracketed identifiers work
                const fullQuery = `SET QUOTED_IDENTIFIER ON;\n${sqlString}`;
                const result = await request.query(fullQuery);
                const executionTime = Date.now() - startTime;
                this.recordMetrics(executionTime);
                logger_1.default.debug(`Query executed in ${executionTime}ms`);
                return {
                    recordset: result.recordset,
                    rowsAffected: result.rowsAffected,
                    executionTimeMs: executionTime
                };
            }
            catch (error) {
                attempt++;
                this.metrics.errorCount++;
                if (attempt < this.MAX_RETRY_ATTEMPTS) {
                    logger_1.default.warn(`Query execution failed (attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS}): ${error.message}. Retrying...`);
                    await this.delay(this.RETRY_DELAY_MS * attempt);
                }
                else {
                    logger_1.default.error(`Query execution failed after ${this.MAX_RETRY_ATTEMPTS} attempts: ${error.message}`);
                    throw new Error(`SQL query failed: ${error.message}`);
                }
            }
        }
        throw new Error('Query execution failed - max retries exceeded');
    }
    /**
     * Execute a parameterized query without expecting results
     */
    async execute(sqlString, params = {}) {
        const startTime = Date.now();
        let attempt = 0;
        while (attempt < this.MAX_RETRY_ATTEMPTS) {
            try {
                const request = new sql.Request(this.pool);
                request.connectionTimeout = this.CONNECTION_TIMEOUT;
                request.timeout = this.QUERY_TIMEOUT;
                // Add parameters with proper typing
                for (const [key, value] of Object.entries(params)) {
                    request.input(key, value);
                }
                // Prepend QUOTED_IDENTIFIER setting to ensure bracketed identifiers work
                const fullQuery = `SET QUOTED_IDENTIFIER ON;\n${sqlString}`;
                const result = await request.query(fullQuery);
                const executionTime = Date.now() - startTime;
                this.recordMetrics(executionTime);
                logger_1.default.debug(`Execute completed in ${executionTime}ms`);
                return result.rowsAffected[0] || 0;
            }
            catch (error) {
                attempt++;
                this.metrics.errorCount++;
                if (attempt < this.MAX_RETRY_ATTEMPTS) {
                    logger_1.default.warn(`Execute failed (attempt ${attempt}/${this.MAX_RETRY_ATTEMPTS}): ${error.message}. Retrying...`);
                    await this.delay(this.RETRY_DELAY_MS * attempt);
                }
                else {
                    logger_1.default.error(`Execute failed after ${this.MAX_RETRY_ATTEMPTS} attempts: ${error.message}`);
                    throw new Error(`SQL execute failed: ${error.message}`);
                }
            }
        }
        throw new Error('Execute failed - max retries exceeded');
    }
    /**
     * Execute a transaction with callback
     */
    async transaction(callback) {
        const startTime = Date.now();
        let transaction = null;
        try {
            await this.ensureConnected();
            const connection = await this.pool.acquire();
            transaction = new sql.Transaction(connection);
            await transaction.begin();
            const request = new sql.Request(transaction);
            const result = await callback(request);
            await transaction.commit();
            const executionTime = Date.now() - startTime;
            this.recordMetrics(executionTime);
            logger_1.default.debug(`Transaction completed in ${executionTime}ms`);
            return result;
        }
        catch (error) {
            if (transaction) {
                try {
                    await transaction.rollback();
                }
                catch (rollbackError) {
                    logger_1.default.error(`Transaction rollback failed: ${rollbackError.message}`);
                }
            }
            this.metrics.errorCount++;
            logger_1.default.error(`Transaction failed: ${error.message}`);
            throw new Error(`SQL transaction failed: ${error.message}`);
        }
    }
    /**
     * Get connection pool metrics
     */
    getMetrics() {
        const avgTime = this.metrics.responseTimes.length > 0
            ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
            : 0;
        // Get pool stats if available
        const poolStats = this.pool.pool?.genericPool?.resourceCount ?? 0;
        const availableStats = this.pool.pool?.genericPool?.availableObjectQueue?.length ?? 0;
        return {
            size: poolStats,
            available: availableStats,
            idle: availableStats,
            activeConnections: Math.max(0, poolStats - availableStats),
            errorCount: this.metrics.errorCount,
            totalRequests: this.metrics.totalRequests,
            averageResponseTimeMs: avgTime
        };
    }
    /**
     * Record metrics for performance tracking
     */
    recordMetrics(responseTime) {
        this.metrics.totalRequests++;
        this.metrics.responseTimes.push(responseTime);
        // Keep only last 1000 response times for memory efficiency
        if (this.metrics.responseTimes.length > 1000) {
            this.metrics.responseTimes.shift();
        }
    }
    /**
     * Delay utility for retry logic
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Check if SQL client is connected and healthy
     */
    async isHealthy() {
        try {
            const result = await this.query('SELECT 1 as test');
            return result.recordset.length > 0;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Shutdown the SQL client and close all connections
     */
    async shutdown() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
        try {
            if (this.isInitialized && this.pool) {
                await this.pool.close();
                this.isInitialized = false;
                logger_1.default.info('SQL client shut down successfully');
            }
        }
        catch (error) {
            logger_1.default.error(`Error shutting down SQL client: ${error.message}`);
            throw error;
        }
    }
    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            errorCount: 0,
            totalRequests: 0,
            responseTimes: []
        };
    }
}
exports.SqlClient = SqlClient;
// Singleton instance
let sqlClientInstance;
/**
 * Get or create the global SQL client instance
 */
function getSqlClient() {
    if (!sqlClientInstance) {
        sqlClientInstance = new SqlClient();
    }
    return sqlClientInstance;
}
/**
 * Initialize the SQL client
 */
async function initializeSqlClient() {
    sqlClientInstance = new SqlClient();
    await sqlClientInstance.initialize();
    return sqlClientInstance;
}
/**
 * Shutdown the SQL client
 */
async function shutdownSqlClient() {
    if (sqlClientInstance) {
        await sqlClientInstance.shutdown();
    }
}
//# sourceMappingURL=sqlClient.js.map