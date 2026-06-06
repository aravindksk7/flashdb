import express, { Express, NextFunction, Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import logger from './logger';
import goldImageRoutes from './routes/goldenImages';
import cloneRoutes from './routes/clones';
import checkpointRoutes from './routes/checkpoints';
import searchRoutes from './routes/search';
import batchRoutes from './routes/batch';
import metricsRoutes from './routes/metrics';
import {
  structuredLoggingMiddleware,
  errorLoggingMiddleware,
  bodyLoggingMiddleware,
  performanceMetricsMiddleware,
  getPerformanceMetrics
} from './middleware/logging';
import {
  healthCheckEndpoint,
  livelinessProbe,
  readinessProbe
} from './middleware/healthcheck';
import {
  cacheMiddleware,
  getCacheMetrics
} from './middleware/caching';
import { lockMiddleware } from './middleware/lockMiddleware';
import { initializeConnectionPool, shutdownConnectionPool } from './services/connectionPool';
import { initializeTaskQueue } from './services/taskQueue';
import { initializeTaskWorker } from './services/taskWorker';
import { initializeSqlClient, shutdownSqlClient } from './services/sqlClient';
import { initializeDatabaseSchema, checkDatabaseTables, checkStateManagementTables } from './db/init';
import { initializePgStateManager } from './services/pgStateManager';
import { initializePgLockManager } from './services/pgLockManager';
import { initializePgStateSync } from './services/pgStateSync';
import { initializePgQueueManager } from './services/pgQueueManager';
import queueRoutes from './routes/queue';
import { initializeInstanceConfig, shutdownInstanceConfig, getInstanceConfig } from './config/instanceConfig';
import adminRoutes from './routes/admin';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001;

// Initialize SQL client on startup
let sqlClient: any;
let stateManager: any;
let lockManager: any;
let stateSync: any;
let queueManager: any;

const initializeSql = async () => {
  try {
    sqlClient = await initializeSqlClient();
    logger.info('SQL client initialized on startup');

    // Initialize database schema
    await initializeDatabaseSchema();
    logger.info('Database schema initialized');

    // Verify tables exist
    const tablesExist = await checkDatabaseTables();
    if (!tablesExist) {
      logger.warn('Some database tables may not exist. Running schema initialization.');
    }

    // Initialize state management (Phase 5b.1)
    try {
      stateManager = await initializePgStateManager();
      lockManager = await initializePgLockManager();
      stateSync = await initializePgStateSync();
      logger.info('PostgreSQL state management initialized');

      const stateTablesExist = await checkStateManagementTables();
      if (!stateTablesExist) {
        logger.warn('Some state management tables may not exist. Retrying schema initialization.');
        await initializeDatabaseSchema();
      }
    } catch (error: any) {
      logger.warn(`State management initialization warning: ${error.message}. Continuing without state management.`);
      // State management is optional - continue with fallback
    }

    // Initialize queue manager with DB persistence (Phase 5b.3)
    try {
      const persistMode = process.env.QUEUE_PERSIST_MODE || 'db';
      if (persistMode === 'db') {
        queueManager = await initializePgQueueManager();
        logger.info('PostgreSQL queue manager initialized for task durability');
      } else {
        logger.info('Queue persistence disabled (QUEUE_PERSIST_MODE=file)');
      }
    } catch (error: any) {
      logger.warn(`Queue manager initialization warning: ${error.message}. Continuing with file-only persistence.`);
      // Queue persistence is optional - continue with file fallback
    }
  } catch (error: any) {
    logger.error(`SQL initialization failed: ${error.message}`);
    // Continue with PowerShell fallback for backward compatibility
  }
};

// Initialize connection pool on startup
const connectionPool = initializeConnectionPool();
logger.info('Connection pool initialized on startup');

// Initialize task queue on startup
initializeTaskQueue();
logger.info('Task queue initialized on startup');

// Initialize and start task worker
const taskWorker = initializeTaskWorker();

// Middleware - Order matters!
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));

// Logging middleware
app.use(structuredLoggingMiddleware);
app.use(bodyLoggingMiddleware);
app.use(performanceMetricsMiddleware);

// HTTP request logging (Morgan)
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Caching middleware (after logging, before routes)
app.use(cacheMiddleware);

// Lock middleware (attach lock helpers to request)
app.use(lockMiddleware);

// Health check endpoints
app.get('/live', livelinessProbe);
app.get('/ready', readinessProbe);
app.get('/health', healthCheckEndpoint);

app.get('/', (_req: Request, res: Response) => {
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
app.use('/api/golden-images', goldImageRoutes);
app.use('/api/clones', cloneRoutes);
app.use('/api/clones/:cloneId/checkpoints', checkpointRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/admin', adminRoutes);

// Swagger/OpenAPI endpoint (can be expanded later)
app.get('/api/docs', (_req: Request, res: Response) => {
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
      admin: {
        instance: 'GET /api/admin/instance (current instance info)',
        instances: 'GET /api/admin/instances (all active instances)',
        clusterStatus: 'GET /api/admin/cluster-status (cluster health)',
        heartbeat: 'POST /api/admin/heartbeat (manual heartbeat)',
        cleanup: 'POST /api/admin/cleanup (cleanup stale instances)'
      },
      monitoring: {
        operationMetrics: 'GET /metrics (Prometheus format)',
        performanceStats: 'GET /api/metrics/performance'
      }
    }
  });
});

// Performance metrics endpoint
app.get('/api/metrics/performance', (_req: Request, res: Response) => {
  res.json({
    timestamp: new Date().toISOString(),
    metrics: getPerformanceMetrics()
  });
});

// Cache metrics endpoint
app.get('/api/metrics/cache', (_req: Request, res: Response) => {
  res.json({
    timestamp: new Date().toISOString(),
    cache: getCacheMetrics()
  });
});

// State management metrics endpoint (Phase 5b.1)
app.get('/api/metrics/state', async (_req: Request, res: Response) => {
  try {
    const stats: any = {
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
  } catch (error: any) {
    res.status(500).json({
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Prometheus metrics endpoint (placeholder)
app.get('/metrics', (_req: Request, res: Response) => {
  // This would be populated by prometheus client library
  // For now, return basic metrics
  res.setHeader('Content-Type', 'text/plain');
  res.send('# HELP flashdb_api_up API is up\n# TYPE flashdb_api_up gauge\nflashdb_api_up 1\n');
});

// Error logging middleware
app.use(errorLoggingMiddleware);

// Error handling middleware
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const requestId = res.getHeader('X-Request-ID') || 'unknown';
  const statusCode = err.status || 500;

  logger.error('Unhandled error:', {
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
app.use((req: Request, res: Response) => {
  const requestId = res.getHeader('X-Request-ID') || 'unknown';

  logger.warn('Route not found', {
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

  // Initialize multi-instance configuration (Phase 5b.4)
  try {
    await initializeInstanceConfig();
    logger.info('Multi-instance configuration initialized');
  } catch (error: any) {
    logger.warn(`Multi-instance initialization warning: ${error.message}. Continuing without cluster mode.`);
  }

  logger.info('='.repeat(60));
  logger.info(`FlashDB API Started on http://localhost:${port}`);
  logger.info(`Environment: ${env}`);
  logger.info(`Log Level: ${logLevel}`);
  logger.info(`FlashDB Module: ${flashdbModule}`);
  logger.info('');
  logger.info('Health Check Endpoints:');
  logger.info('  /live    - Liveness probe (fast heartbeat)');
  logger.info('  /ready   - Readiness probe (can serve traffic?)');
  logger.info('  /health  - Deep health check (all systems status)');
  logger.info('');
  logger.info('Monitoring Endpoints:');
  logger.info('  /metrics                   - Prometheus metrics');
  logger.info('  /api/metrics/performance   - Operation performance stats');
  logger.info('  /api/docs                  - API documentation');
  logger.info('');
  logger.info('Database Status:');
  if (sqlClient) {
    logger.info('  SQL Client: Connected');
    const sqlMetrics = sqlClient.getMetrics();
    logger.info(`  Connection Pool: ${sqlMetrics.size} total, ${sqlMetrics.available} available`);
  } else {
    logger.info('  SQL Client: Not initialized (using PowerShell fallback)');
  }
  logger.info('');
  logger.info('State Management (Phase 5b.1):');
  if (stateManager) {
    logger.info('  State Manager: Initialized (PostgreSQL-backed)');
    logger.info('  Lock Manager: Initialized');
    logger.info('  State Sync: Initialized (eventually consistent)');
  } else {
    logger.info('  State Management: Not initialized (optional, using fallback)');
  }
  logger.info('');
  logger.info('Queue Persistence (Phase 5b.3):');
  if (queueManager) {
    logger.info('  Queue Manager: Initialized (PostgreSQL-backed)');
    logger.info('  Persistence Mode: DB (durable across restarts)');
    logger.info(`  Instance ID: ${queueManager.getInstanceId()}`);
  } else {
    logger.info('  Queue Manager: Not initialized (using file persistence fallback)');
  }
  logger.info('');
  logger.info('Multi-Instance Cluster (Phase 5b.4):');
  try {
    const instanceConfig = getInstanceConfig();
    const clusterEnabled = instanceConfig.isClusterMode();
    if (clusterEnabled) {
      const info = instanceConfig.getInstanceInfo();
      logger.info('  Cluster Mode: Enabled');
      logger.info(`  Instance ID: ${info.instanceId}`);
      logger.info(`  Instance Role: ${info.role}`);
      logger.info(`  Instance Status: ${info.status}`);
      logger.info(`  Host: ${info.host}:${info.port}`);
      logger.info('  Features: Instance discovery, health monitoring, shared state');
    } else {
      logger.info('  Cluster Mode: Disabled (CLUSTER_ENABLED=false)');
    }
  } catch (error: any) {
    logger.info('  Multi-Instance: Not initialized (optional)');
  }
  logger.info('');
  logger.info('Connection Pool Status:');
  logger.info(`  Pool Size: ${connectionPool.getMetrics().size}/${connectionPool.getMetrics().size}`);
  logger.info(`  Available: ${connectionPool.getMetrics().available}`);
  logger.info('');
  logger.info('Task Queue Status:');
  logger.info(`  Queue Initialized: true`);
  logger.info(`  Task Worker: starting...`);
  logger.info('='.repeat(60));

  // Start task worker
  try {
    await taskWorker.startWorker();
    logger.info('Task worker started successfully');
  } catch (error: any) {
    logger.error(`Failed to start task worker: ${error.message}`);
  }
});

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(async () => {
    logger.info('HTTP server closed');
    await taskWorker.stopWorker(5000);
    logger.info('Task worker shut down');
    if (queueManager) {
      logger.info('Queue manager (no shutdown needed)');
    }
    // Deregister instance from cluster (Phase 5b.4)
    try {
      await shutdownInstanceConfig();
      logger.info('Instance deregistered from cluster');
    } catch (error: any) {
      logger.warn(`Instance deregistration warning: ${error.message}`);
    }
    if (stateSync) {
      await stateSync.shutdown();
      logger.info('State sync shut down');
    }
    if (lockManager) {
      await lockManager.shutdown();
      logger.info('Lock manager shut down');
    }
    if (stateManager) {
      await stateManager.shutdown();
      logger.info('State manager shut down');
    }
    if (sqlClient) {
      await shutdownSqlClient();
      logger.info('SQL client shut down');
    }
    await shutdownConnectionPool();
    logger.info('Connection pool shut down');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(async () => {
    logger.info('HTTP server closed');
    await taskWorker.stopWorker(5000);
    logger.info('Task worker shut down');
    if (queueManager) {
      logger.info('Queue manager (no shutdown needed)');
    }
    // Deregister instance from cluster (Phase 5b.4)
    try {
      await shutdownInstanceConfig();
      logger.info('Instance deregistered from cluster');
    } catch (error: any) {
      logger.warn(`Instance deregistration warning: ${error.message}`);
    }
    if (stateSync) {
      await stateSync.shutdown();
      logger.info('State sync shut down');
    }
    if (lockManager) {
      await lockManager.shutdown();
      logger.info('Lock manager shut down');
    }
    if (stateManager) {
      await stateManager.shutdown();
      logger.info('State manager shut down');
    }
    if (sqlClient) {
      await shutdownSqlClient();
      logger.info('SQL client shut down');
    }
    await shutdownConnectionPool();
    logger.info('Connection pool shut down');
    process.exit(0);
  });
});

export default app;
