import { Request, Response, NextFunction } from 'express';
/**
 * Structured logging middleware
 * Logs all requests in JSON format with metrics
 */
export declare function structuredLoggingMiddleware(req: Request, res: Response, next: NextFunction): void;
/**
 * Error logging middleware
 * Captures unhandled errors and logs them with context
 */
export declare function errorLoggingMiddleware(err: any, req: Request, res: Response, next: NextFunction): void;
/**
 * Request body logging middleware
 * Logs request body in debug mode (with sensitive data redacted)
 */
export declare function bodyLoggingMiddleware(req: Request, res: Response, next: NextFunction): void;
export declare function performanceMetricsMiddleware(req: Request, res: Response, next: NextFunction): void;
/**
 * Get current performance metrics
 */
export declare function getPerformanceMetrics(): Record<string, any>;
/**
 * Reset performance metrics
 */
export declare function resetPerformanceMetrics(): void;
//# sourceMappingURL=logging.d.ts.map