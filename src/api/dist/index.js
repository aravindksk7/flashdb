"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const morgan_1 = __importDefault(require("morgan"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = __importDefault(require("./logger"));
const goldenImages_1 = __importDefault(require("./routes/goldenImages"));
const clones_1 = __importDefault(require("./routes/clones"));
const checkpoints_1 = __importDefault(require("./routes/checkpoints"));
const search_1 = __importDefault(require("./routes/search"));
const batch_1 = __importDefault(require("./routes/batch"));
const metrics_1 = __importDefault(require("./routes/metrics"));
const logging_1 = require("./middleware/logging");
const healthcheck_1 = require("./middleware/healthcheck");
const caching_1 = require("./middleware/caching");
const lockMiddleware_1 = require("./middleware/lockMiddleware");
const connectionPool_1 = require("./services/connectionPool");
const taskQueue_1 = require("./services/taskQueue");
const taskWorker_1 = require("./services/taskWorker");
const sqlClient_1 = require("./services/sqlClient");
const init_1 = require("./db/init");
const pgStateManager_1 = require("./services/pgStateManager");
const pgLockManager_1 = require("./services/pgLockManager");
const pgStateSync_1 = require("./services/pgStateSync");
const pgQueueManager_1 = require("./services/pgQueueManager");
const queue_1 = __importDefault(require("./routes/queue"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
// Initialize SQL client on startup
let sqlClient;
let stateManager;
let lockManager;
let stateSync;
let queueManager;
const initializeSql = async () => {
    try {
        sqlClient = await (0, sqlClient_1.initializeSqlClient)();
        logger_1.default.info('SQL client initialized on startup');
        // Initialize database schema
        await (0, init_1.initializeDatabaseSchema)();
        logger_1.default.info('Database schema initialized');
        // Verify tables exist
        const tablesExist = await (0, init_1.checkDatabaseTables)();
        if (!tablesExist) {
            logger_1.default.warn('Some database tables may not exist. Running schema initialization.');
        }
        // Initialize state management (Phase 5b.1)
        try {
            stateManager = await (0, pgStateManager_1.initializePgStateManager)();
            lockManager = await (0, pgLockManager_1.initializePgLockManager)();
            stateSync = await (0, pgStateSync_1.initializePgStateSync)();
            logger_1.default.info('PostgreSQL state management initialized');
            const stateTablesExist = await (0, init_1.checkStateManagementTables)();
            if (!stateTablesExist) {
                logger_1.default.warn('Some state management tables may not exist. Retrying schema initialization.');
                await (0, init_1.initializeDatabaseSchema)();
            }
        }
        catch (error) {
            logger_1.default.warn(`State management initialization warning: ${error.message}. Continuing without state management.`);
            // State management is optional - continue with fallback
        }
        // Initialize queue manager with DB persistence (Phase 5b.3)
        try {
            const persistMode = process.env.QUEUE_PERSIST_MODE || 'db';
            if (persistMode === 'db') {
                queueManager = await (0, pgQueueManager_1.initializePgQueueManager)();
                logger_1.default.info('PostgreSQL queue manager initialized for task durability');
            }
            else {
                logger_1.default.info('Queue persistence disabled (QUEUE_PERSIST_MODE=file)');
            }
        }
        catch (error) {
            logger_1.default.warn(`Queue manager initialization warning: ${error.message}. Continuing with file-only persistence.`);
            // Queue persistence is optional - continue with file fallback
        }
    }
    catch (error) {
        logger_1.default.error(`SQL initialization failed: ${error.message}`);
        // Continue with PowerShell fallback for backward compatibility
    }
};
// Initialize connection pool on startup
const connectionPool = (0, connectionPool_1.initializeConnectionPool)();
logger_1.default.info('Connection pool initialized on startup');
// Initialize task queue on startup
(0, taskQueue_1.initializeTaskQueue)();
logger_1.default.info('Task queue initialized on startup');
// Initialize and start task worker
const taskWorker = (0, taskWorker_1.initializeTaskWorker)();
// Middleware - Order matters!
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5173'],
    credentials: true
}));
// Logging middleware
app.use(logging_1.structuredLoggingMiddleware);
app.use(logging_1.bodyLoggingMiddleware);
app.use(logging_1.performanceMetricsMiddleware);
// HTTP request logging (Morgan)
app.use((0, morgan_1.default)('combined', { stream: { write: msg => logger_1.default.info(msg.trim()) } }));
// Caching middleware (after logging, before routes)
app.use(caching_1.cacheMiddleware);
// Lock middleware (attach lock helpers to request)
app.use(lockMiddleware_1.lockMiddleware);
// Health check endpoints
app.get('/live', healthcheck_1.livelinessProbe);
app.get('/ready', healthcheck_1.readinessProbe);
app.get('/health', healthcheck_1.healthCheckEndpoint);
app.get('/', (_req, res) => {
    res.json({
        service: 'flashdb-api',
        version: '0.1.0',
        status: 'running',
        endpoints: {
            docs: '/api/docs',
            ready: '/ready',
            health: '/health'
        }
    });
});
// API Routes
app.use('/api/golden-images', goldenImages_1.default);
app.use('/api/clones', clones_1.default);
app.use('/api/clones/:cloneId/checkpoints', checkpoints_1.default);
app.use('/api/search', search_1.default);
app.use('/api/batches', batch_1.default);
app.use('/api/metrics', metrics_1.default);
app.use('/api/queue', queue_1.default);
// Swagger/OpenAPI endpoint (can be expanded later)
app.get('/api/docs', (_req, res) => {
    res.json({
        info: {
            title: 'FlashDB API',
            version: '0.1.0',
            description: 'Database Virtualization Tool - REST API'
        },
        endpoints: {
            health: {
                live: 'GET /live (liveness probe)',
                ready: 'GET /ready (readiness probe)',
                health: 'GET /health (deep health check)'
            },
            goldenImages: '/api/golden-images',
            clones: '/api/clones',
            checkpoints: '/api/clones/{cloneId}/checkpoints',
            search: {
                operations: '/api/search/operations',
                clones: '/api/search/clones',
                checkpoints: '/api/search/checkpoints',
                suggestions: '/api/search/suggestions',
                advanced: '/api/search/advanced'
            },
            batches: {
                create: 'POST /api/batches',
                list: 'GET /api/batches',
                getStatus: 'GET /api/batches/{batchId}',
                start: 'POST /api/batches/{batchId}/start',
                cancel: 'POST /api/batches/{batchId}/cancel',
                results: 'GET /api/batches/{batchId}/results',
                progress: 'GET /api/batches/{batchId}/progress'
            },
            metrics: {
                overview: 'GET /api/metrics/overview',
                clones: 'GET /api/metrics/clones',
                storage: 'GET /api/metrics/storage',
                operations: 'GET /api/metrics/operations',
                timeline: 'GET /api/metrics/timeline',
                all: 'GET /api/metrics/all',
                performance: 'GET /api/metrics/performance (operation metrics)',
                cache: 'GET /api/metrics/cache',
                state: 'GET /api/metrics/state (PostgreSQL state management metrics)'
            },
            queue: {
                metrics: 'GET /api/queue/metrics',
                status: 'GET /api/queue/status',
                tasks: 'GET /api/queue/tasks',
                getTask: 'GET /api/queue/tasks/{taskId}',
                clearCompleted: 'POST /api/queue/clear/completed',
                clearFailed: 'POST /api/queue/clear/failed'
            },
            monitoring: {
                operationMetrics: 'GET /metrics (Prometheus format)',
                performanceStats: 'GET /api/metrics/performance'
            }
        }
    });
});
// Performance metrics endpoint
app.get('/api/metrics/performance', (_req, res) => {
    res.json({
        timestamp: new Date().toISOString(),
        metrics: (0, logging_1.getPerformanceMetrics)()
    });
});
// Cache metrics endpoint
app.get('/api/metrics/cache', (_req, res) => {
    res.json({
        timestamp: new Date().toISOString(),
        cache: (0, caching_1.getCacheMetrics)()
    });
});
// State management metrics endpoint (Phase 5b.1)
app.get('/api/metrics/state', async (_req, res) => {
    try {
        const stats = {
            timestamp: new Date().toISOString(),
            stateManager: null,
            lockManager: null,
            stateSync: null
        };
        if (stateManager) {
            stats.stateManager = await stateManager.getStats();
        }
        if (lockManager) {
            stats.lockManager = await lockManager.getStats();
        }
        if (stateSync) {
            stats.stateSync = stateSync.getStats();
        }
        res.json(stats);
    }
    catch (error) {
        res.status(500).json({
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});
// Prometheus metrics endpoint (placeholder)
app.get('/metrics', (_req, res) => {
    // This would be populated by prometheus client library
    // For now, return basic metrics
    res.setHeader('Content-Type', 'text/plain');
    res.send('# HELP flashdb_api_up API is up\n# TYPE flashdb_api_up gauge\nflashdb_api_up 1\n');
});
// Error logging middleware
app.use(logging_1.errorLoggingMiddleware);
// Error handling middleware
app.use((err, req, res, _next) => {
    const requestId = res.getHeader('X-Request-ID') || 'unknown';
    const statusCode = err.status || 500;
    logger_1.default.error('Unhandled error:', {
        requestId,
        message: err.message,
        status: statusCode,
        path: req.path,
        method: req.method,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal server error',
        requestId,
        error: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});
// 404 handler
app.use((req, res) => {
    const requestId = res.getHeader('X-Request-ID') || 'unknown';
    logger_1.default.warn('Route not found', {
        requestId,
        method: req.method,
        path: req.path
    });
    res.status(404).json({
        success: false,
        message: 'Route not found',
        requestId,
        path: req.path
    });
});
// Start server
const server = app.listen(port, async () => {
    const env = process.env.NODE_ENV || 'development';
    const logLevel = process.env.LOG_LEVEL || 'info';
    const flashdbModule = process.env.FLASHDB_MODULE_PATH || 'C:\\flashdb\\src\\FlashDB\\FlashDB.psm1';
    // Initialize SQL client
    await initializeSql();
    logger_1.default.info('='.repeat(60));
    logger_1.default.info(`FlashDB API Started on http://localhost:${port}`);
    logger_1.default.info(`Environment: ${env}`);
    logger_1.default.info(`Log Level: ${logLevel}`);
    logger_1.default.info(`FlashDB Module: ${flashdbModule}`);
    logger_1.default.info('');
    logger_1.default.info('Health Check Endpoints:');
    logger_1.default.info('  /live    - Liveness probe (fast heartbeat)');
    logger_1.default.info('  /ready   - Readiness probe (can serve traffic?)');
    logger_1.default.info('  /health  - Deep health check (all systems status)');
    logger_1.default.info('');
    logger_1.default.info('Monitoring Endpoints:');
    logger_1.default.info('  /metrics                   - Prometheus metrics');
    logger_1.default.info('  /api/metrics/performance   - Operation performance stats');
    logger_1.default.info('  /api/docs                  - API documentation');
    logger_1.default.info('');
    logger_1.default.info('Database Status:');
    if (sqlClient) {
        logger_1.default.info('  SQL Client: Connected');
        const sqlMetrics = sqlClient.getMetrics();
        logger_1.default.info(`  Connection Pool: ${sqlMetrics.size} total, ${sqlMetrics.available} available`);
    }
    else {
        logger_1.default.info('  SQL Client: Not initialized (using PowerShell fallback)');
    }
    logger_1.default.info('');
    logger_1.default.info('State Management (Phase 5b.1):');
    if (stateManager) {
        logger_1.default.info('  State Manager: Initialized (PostgreSQL-backed)');
        logger_1.default.info('  Lock Manager: Initialized');
        logger_1.default.info('  State Sync: Initialized (eventually consistent)');
    }
    else {
        logger_1.default.info('  State Management: Not initialized (optional, using fallback)');
    }
    logger_1.default.info('');
    logger_1.default.info('Queue Persistence (Phase 5b.3):');
    if (queueManager) {
        logger_1.default.info('  Queue Manager: Initialized (PostgreSQL-backed)');
        logger_1.default.info('  Persistence Mode: DB (durable across restarts)');
        logger_1.default.info(`  Instance ID: ${queueManager.getInstanceId()}`);
    }
    else {
        logger_1.default.info('  Queue Manager: Not initialized (using file persistence fallback)');
    }
    logger_1.default.info('');
    logger_1.default.info('Connection Pool Status:');
    logger_1.default.info(`  Pool Size: ${connectionPool.getMetrics().size}/${connectionPool.getMetrics().size}`);
    logger_1.default.info(`  Available: ${connectionPool.getMetrics().available}`);
    logger_1.default.info('');
    logger_1.default.info('Task Queue Status:');
    logger_1.default.info(`  Queue Initialized: true`);
    logger_1.default.info(`  Task Worker: starting...`);
    logger_1.default.info('='.repeat(60));
    // Start task worker
    try {
        await taskWorker.startWorker();
        logger_1.default.info('Task worker started successfully');
    }
    catch (error) {
        logger_1.default.error(`Failed to start task worker: ${error.message}`);
    }
});
// Graceful shutdown handler
process.on('SIGTERM', async () => {
    logger_1.default.info('SIGTERM signal received: closing HTTP server');
    server.close(async () => {
        logger_1.default.info('HTTP server closed');
        await taskWorker.stopWorker(5000);
        logger_1.default.info('Task worker shut down');
        if (queueManager) {
            logger_1.default.info('Queue manager (no shutdown needed)');
        }
        if (stateSync) {
            await stateSync.shutdown();
            logger_1.default.info('State sync shut down');
        }
        if (lockManager) {
            await lockManager.shutdown();
            logger_1.default.info('Lock manager shut down');
        }
        if (stateManager) {
            await stateManager.shutdown();
            logger_1.default.info('State manager shut down');
        }
        if (sqlClient) {
            await (0, sqlClient_1.shutdownSqlClient)();
            logger_1.default.info('SQL client shut down');
        }
        await (0, connectionPool_1.shutdownConnectionPool)();
        logger_1.default.info('Connection pool shut down');
        process.exit(0);
    });
});
process.on('SIGINT', async () => {
    logger_1.default.info('SIGINT signal received: closing HTTP server');
    server.close(async () => {
        logger_1.default.info('HTTP server closed');
        await taskWorker.stopWorker(5000);
        logger_1.default.info('Task worker shut down');
        if (queueManager) {
            logger_1.default.info('Queue manager (no shutdown needed)');
        }
        if (stateSync) {
            await stateSync.shutdown();
            logger_1.default.info('State sync shut down');
        }
        if (lockManager) {
            await lockManager.shutdown();
            logger_1.default.info('Lock manager shut down');
        }
        if (stateManager) {
            await stateManager.shutdown();
            logger_1.default.info('State manager shut down');
        }
        if (sqlClient) {
            await (0, sqlClient_1.shutdownSqlClient)();
            logger_1.default.info('SQL client shut down');
        }
        await (0, connectionPool_1.shutdownConnectionPool)();
        logger_1.default.info('Connection pool shut down');
        process.exit(0);
    });
});
exports.default = app;
//# sourceMappingURL=index.js.map