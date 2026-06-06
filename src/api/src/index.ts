import express, { Express, Request, Response } from 'express';
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

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001;

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

// Health check endpoints
app.get('/live', livelinessProbe);
app.get('/ready', readinessProbe);
app.get('/health', healthCheckEndpoint);

// API Routes
app.use('/api/golden-images', goldImageRoutes);
app.use('/api/clones', cloneRoutes);
app.use('/api/clones/:cloneId/checkpoints', checkpointRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/batches', batchRoutes);
app.use('/api/metrics', metricsRoutes);

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
        performance: 'GET /api/metrics/performance (operation metrics)'
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
app.use((err: any, req: Request, res: Response) => {
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
app.listen(port, () => {
  const env = process.env.NODE_ENV || 'development';
  const logLevel = process.env.LOG_LEVEL || 'info';
  const flashdbModule = process.env.FLASHDB_MODULE_PATH || 'C:\\flashdb\\src\\FlashDB\\FlashDB.psm1';

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
  logger.info('='.repeat(60));
});

export default app;
