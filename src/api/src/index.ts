import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import logger from './logger';
import { PowerShellService } from './services/powershellService';
import goldImageRoutes from './routes/goldenImages';
import cloneRoutes from './routes/clones';
import checkpointRoutes from './routes/checkpoints';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001;
const psService = new PowerShellService();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/api/golden-images', goldImageRoutes);
app.use('/api/clones', cloneRoutes);
app.use('/api/clones/:cloneId/checkpoints', checkpointRoutes);

// Swagger/OpenAPI endpoint (can be expanded later)
app.get('/api/docs', (req: Request, res: Response) => {
  res.json({
    info: {
      title: 'FlashDB API',
      version: '0.1.0',
      description: 'Database Virtualization Tool - REST API'
    },
    endpoints: {
      goldenImages: '/api/golden-images',
      clones: '/api/clones',
      checkpoints: '/api/clones/{cloneId}/checkpoints'
    }
  });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : undefined
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.path}`
  });
});

// Start server
app.listen(port, () => {
  logger.info(`FlashDB API running on http://localhost:${port}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`FlashDB Module: ${process.env.FLASHDB_MODULE_PATH || 'C:\\flashdb\\src\\FlashDB\\FlashDB.psm1'}`);
});

export default app;
