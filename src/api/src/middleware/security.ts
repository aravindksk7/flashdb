/**
 * Security Middleware
 * Implements comprehensive security hardening for the FlashDB API
 * - CORS configuration with origin whitelisting
 * - Rate limiting (100 req/min per IP)
 * - Request validation
 * - Security headers (CSP, X-Frame-Options, X-Content-Type-Options, etc.)
 * - HTTPS/TLS enforcement
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../logger';

// Rate limiting store (in-memory, suitable for single instance)
// For distributed systems, use Redis
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * CORS Configuration
 * Whitelist only trusted origins
 */
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:5173').split(',');

    // Allow requests with no origin (mobile apps, curl requests)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('CORS policy: Origin not allowed'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Request-ID'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count', 'X-RateLimit-Remaining'],
  maxAge: 86400 // 24 hours
};

/**
 * Rate Limiting Middleware
 * Limits requests to 100 per minute per IP address
 */
export const rateLimitMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const limit = 100;
  const windowMs = 60000; // 1 minute

  const now = Date.now();
  let entry = rateLimitStore.get(ip);

  // Clean up expired entries
  if (entry && now >= entry.resetTime) {
    rateLimitStore.delete(ip);
    entry = undefined;
  }

  if (!entry) {
    entry = {
      count: 1,
      resetTime: now + windowMs
    };
    rateLimitStore.set(ip, entry);
  } else {
    entry.count++;
  }

  // Set rate limit headers
  const remaining = Math.max(0, limit - entry.count);
  const resetTime = Math.ceil((entry.resetTime - now) / 1000);

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', resetTime);

  if (entry.count > limit) {
    logger.warn(`Rate limit exceeded for IP: ${ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests, please try again later',
      retryAfter: resetTime
    });
    return;
  }

  next();
};

/**
 * Security Headers Middleware
 * Adds essential security headers to all responses
 */
export const securityHeadersMiddleware = (
  _req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Enable XSS protection in older browsers
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Content Security Policy
  // Restrict to self + trusted CDNs only
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Can be tightened for production
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self' https:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);

  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Feature Policy / Permissions Policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  // HTTPS enforcement (when in production)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
};

/**
 * HTTPS Enforcement Middleware
 * Redirects HTTP requests to HTTPS in production
 */
export const httpsEnforcementMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (
    process.env.NODE_ENV === 'production' &&
    req.header('x-forwarded-proto') !== 'https' &&
    req.protocol !== 'https'
  ) {
    res.redirect(301, `https://${req.header('host')}${req.url}`);
    return;
  }
  next();
};

/**
 * Request Validation Middleware
 * Validates incoming request format and size
 */
export const requestValidationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check for suspicious patterns
  if (req.method !== 'OPTIONS') {
    // Validate Content-Type for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      const contentType = req.headers['content-type'];
      if (contentType && !contentType.includes('application/json')) {
        logger.warn(`Invalid Content-Type: ${contentType}`);
        res.status(400).json({
          success: false,
          message: 'Content-Type must be application/json'
        });
        return;
      }
    }

    // Check for excessively large request bodies (handled by express.json middleware with limit)
    // Check for SQL injection patterns in query parameters
    const params = { ...req.query, ...req.body };
    const suspiciousPatterns = /('|"|;|--|\/\*|\*\/|xp_|sp_)/gi;

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && suspiciousPatterns.test(value)) {
        logger.warn(`Suspicious pattern detected in ${key}: ${value.substring(0, 50)}`);
        res.status(400).json({
          success: false,
          message: 'Invalid input detected'
        });
        return;
      }
    }
  }

  next();
};

/**
 * Request ID Middleware
 * Adds a unique request ID for tracing
 */
export const requestIdMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const requestId = req.headers['x-request-id'] as string || generateRequestId();
  (req as any).id = requestId;
  next();
};

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Sensitive Data Redaction
 * Prevents sensitive data from being logged or exposed in error messages
 */
export const sensitiveFields = [
  'password',
  'token',
  'apiKey',
  'api_key',
  'secret',
  'credential',
  'authorization',
  'sql_password',
  'db_password'
];

/**
 * Redact sensitive data from an object
 */
export function redactSensitiveData(obj: any): any {
  if (!obj) return obj;

  if (typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item));
  }

  const result = { ...obj };
  for (const key in result) {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      result[key] = '[REDACTED]';
    } else if (typeof result[key] === 'object') {
      result[key] = redactSensitiveData(result[key]);
    }
  }

  return result;
}

/**
 * Security Headers Options
 * Returns recommended security headers configuration
 */
export const getSecurityConfig = () => ({
  corsOptions,
  rateLimitWindowMs: 60000,
  rateLimitMax: 100,
  https: process.env.NODE_ENV === 'production',
  sessionTimeout: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
});

export default {
  corsOptions,
  rateLimitMiddleware,
  securityHeadersMiddleware,
  httpsEnforcementMiddleware,
  requestValidationMiddleware,
  requestIdMiddleware,
  redactSensitiveData,
  getSecurityConfig
};
