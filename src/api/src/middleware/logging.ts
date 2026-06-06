import { Request, Response, NextFunction } from 'express';
import logger from '../logger';
import { v4 as uuidv4 } from 'uuid';

// Sensitive field patterns to redact
const SENSITIVE_PATTERNS = [
  /password/i,
  /token/i,
  /secret/i,
  /api[_-]?key/i,
  /authorization/i,
  /credential/i,
  /connection/i,
  /bearer/i,
  /auth/i
];

interface RequestMetrics {
  requestId: string;
  timestamp: string;
  method: string;
  path: string;
  statusCode: number;
  duration: number;
  service: string;
  operation: string;
  result: 'success' | 'error' | 'redirect';
  userAgent?: string;
  clientIp?: string;
  errorMessage?: string;
  errorStack?: string;
  queryParams?: Record<string, string>;
  responseSize?: number;
}

/**
 * Redact sensitive data from objects
 */
function redactSensitiveData(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const redacted = Array.isArray(obj) ? [...obj] : { ...obj };

  for (const key in redacted) {
    if (Object.prototype.hasOwnProperty.call(redacted, key)) {
      const value = redacted[key];

      // Check if key matches sensitive patterns
      if (SENSITIVE_PATTERNS.some(pattern => pattern.test(key))) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        redacted[key] = redactSensitiveData(value);
      }
    }
  }

  return redacted;
}

/**
 * Extract operation name from request path and method
 */
function extractOperation(method: string, path: string): string {
  const pathSegments = path.split('/').filter(s => s);
  if (pathSegments.length === 0) return 'root';

  // Map common patterns
  const firstSegment = pathSegments[0];

  if (path === '/health') return 'health-check';
  if (path === '/api/docs') return 'api-docs';
  if (firstSegment === 'api') {
    const resource = pathSegments[1] || 'unknown';
    return `${method.toLowerCase()}-${resource}`;
  }

  return `${method.toLowerCase()}-${firstSegment}`;
}

/**
 * Structured logging middleware
 * Logs all requests in JSON format with metrics
 */
export function structuredLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = uuidv4();
  const startTime = Date.now();

  // Attach request ID to response headers
  res.setHeader('X-Request-ID', requestId);
  res.setHeader('X-Service', 'flashdb-api');

  // Capture original send function
  const originalSend = res.send;
  let responseSize = 0;

  // Override send to capture response
  res.send = function (data) {
    if (data) {
      responseSize = typeof data === 'string' ? data.length : JSON.stringify(data).length;
    }
    return originalSend.call(this, data);
  };

  // Log on response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    // Determine result
    let result: 'success' | 'error' | 'redirect' = 'success';
    if (statusCode >= 400) result = 'error';
    else if (statusCode >= 300) result = 'redirect';

    const metrics: RequestMetrics = {
      requestId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      statusCode,
      duration,
      service: 'flashdb-api',
      operation: extractOperation(req.method, req.path),
      result,
      userAgent: req.get('user-agent'),
      clientIp: req.ip,
      responseSize
    };

    // Log error details for 4xx and 5xx
    if (result === 'error') {
      metrics.errorMessage = res.statusMessage || 'Unknown error';
    }

    // Log query parameters (non-sensitive)
    if (Object.keys(req.query).length > 0) {
      metrics.queryParams = redactSensitiveData(req.query) as Record<string, string>;
    }

    // Log using structured format
    logger.info('Request completed', metrics);

    // Also log warnings for slow requests (> 2 seconds)
    if (duration > 2000) {
      logger.warn('Slow request detected', {
        requestId,
        operation: metrics.operation,
        duration,
        threshold: 2000,
        statusCode
      });
    }

    // Log errors for failed requests
    if (statusCode >= 500) {
      logger.error('Server error', {
        requestId,
        operation: metrics.operation,
        statusCode,
        duration,
        method: req.method,
        path: req.path
      });
    } else if (statusCode >= 400 && statusCode < 500) {
      logger.warn('Client error', {
        requestId,
        operation: metrics.operation,
        statusCode,
        duration,
        method: req.method,
        path: req.path
      });
    }
  });

  // Capture any errors during request processing
  res.on('error', (err) => {
    const duration = Date.now() - startTime;
    logger.error('Response error', {
      requestId,
      operation: extractOperation(req.method, req.path),
      duration,
      method: req.method,
      path: req.path,
      errorMessage: err.message,
      errorStack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  // Log request details in development
  if (process.env.LOG_LEVEL === 'debug') {
    logger.debug('Incoming request', {
      requestId,
      method: req.method,
      path: req.path,
      query: redactSensitiveData(req.query),
      headers: redactSensitiveData(req.headers),
      timestamp: new Date().toISOString()
    });
  }

  next();
}

/**
 * Error logging middleware
 * Captures unhandled errors and logs them with context
 */
export function errorLoggingMiddleware(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const requestId = res.getHeader('X-Request-ID') || 'unknown';
  const timestamp = new Date().toISOString();

  const errorMetrics = {
    requestId,
    timestamp,
    method: req.method,
    path: req.path,
    statusCode: err.status || 500,
    service: 'flashdb-api',
    operation: extractOperation(req.method, req.path),
    errorMessage: err.message,
    errorCode: err.code,
    errorStack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl,
    query: redactSensitiveData(req.query),
    userAgent: req.get('user-agent'),
    clientIp: req.ip
  };

  logger.error('Unhandled error in request', errorMetrics);

  next(err);
}

/**
 * Request body logging middleware
 * Logs request body in debug mode (with sensitive data redacted)
 */
export function bodyLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (process.env.LOG_LEVEL === 'debug' && Object.keys(req.body).length > 0) {
    logger.debug('Request body', {
      requestId: res.getHeader('X-Request-ID'),
      path: req.path,
      method: req.method,
      body: redactSensitiveData(req.body),
      timestamp: new Date().toISOString()
    });
  }

  next();
}

/**
 * Performance metrics middleware
 * Tracks and logs performance metrics per operation
 */
const operationMetrics: Map<string, { count: number; totalDuration: number; maxDuration: number; minDuration: number; errors: number }> = new Map();

export function performanceMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const startTime = Date.now();
  const operation = extractOperation(req.method, req.path);

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const isError = res.statusCode >= 400;

    if (!operationMetrics.has(operation)) {
      operationMetrics.set(operation, {
        count: 0,
        totalDuration: 0,
        maxDuration: 0,
        minDuration: Infinity,
        errors: 0
      });
    }

    const metrics = operationMetrics.get(operation)!;
    metrics.count++;
    metrics.totalDuration += duration;
    metrics.maxDuration = Math.max(metrics.maxDuration, duration);
    metrics.minDuration = Math.min(metrics.minDuration, duration);
    if (isError) metrics.errors++;

    // Log summary every 100 requests or daily
    if (metrics.count % 100 === 0) {
      const avgDuration = Math.round(metrics.totalDuration / metrics.count);
      const errorRate = ((metrics.errors / metrics.count) * 100).toFixed(2);

      logger.info('Operation metrics summary', {
        operation,
        count: metrics.count,
        avgDuration,
        maxDuration: metrics.maxDuration,
        minDuration: metrics.minDuration,
        errorCount: metrics.errors,
        errorRate: `${errorRate}%`,
        timestamp: new Date().toISOString()
      });
    }
  });

  next();
}

/**
 * Get current performance metrics
 */
export function getPerformanceMetrics() {
  const metrics: Record<string, any> = {};

  operationMetrics.forEach((value, key) => {
    metrics[key] = {
      totalRequests: value.count,
      averageDuration: Math.round(value.totalDuration / value.count),
      maxDuration: value.maxDuration,
      minDuration: value.minDuration,
      errorCount: value.errors,
      errorRate: ((value.errors / value.count) * 100).toFixed(2) + '%'
    };
  });

  return metrics;
}

/**
 * Reset performance metrics
 */
export function resetPerformanceMetrics() {
  operationMetrics.clear();
}
