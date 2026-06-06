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

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

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
        all: 'GET /api/metrics/all'
      }
    }
  });
});

// Error handling middleware
app.use((err: any, _req: Request, res: Response) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : undefined
  });
});

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
app.listen(port, () => {
  logger.info(`FlashDB API running on http://localhost:${port}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`FlashDB Module: ${process.env.FLASHDB_MODULE_PATH || 'C:\\flashdb\\src\\FlashDB\\FlashDB.psm1'}`);
});

export default app;
