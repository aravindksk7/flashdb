/**
 * Authentication Middleware
 * Implements API security through:
 * - Bearer token (JWT-style) validation
 * - API key validation
 * - Basic authentication support
 * - Session timeout enforcement (24 hours)
 * - CSRF protection
 */

import { Request, Response, NextFunction } from 'express';
import logger from '../logger';
import crypto from 'crypto';

// Session store (in-memory, suitable for single instance)
// For distributed systems, use Redis
interface SessionEntry {
  token: string;
  userId: string;
  createdAt: number;
  lastActivity: number;
  apiKey?: string;
}

const sessionStore = new Map<string, SessionEntry>();
const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000; // 24 hours
const INACTIVITY_TIMEOUT_MS = 1 * 60 * 60 * 1000; // 1 hour

/**
 * Token Format:
 * Bearer <token>
 * Or API-Key <key>
 */

/**
 * Generate a secure token
 */
export function generateToken(userId: string, apiKey?: string): string {
  // Simple token generation (for production, use proper JWT library)
  const token = crypto.randomBytes(32).toString('hex');
  const sessionId = crypto.randomBytes(16).toString('hex');

  sessionStore.set(sessionId, {
    token,
    userId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    apiKey
  });

  return `${sessionId}.${token}`;
}

/**
 * Validate API Key
 * API keys should be stored securely (hashed) in database
 */
function validateApiKey(apiKey: string): boolean {
  const validKeys = (process.env.VALID_API_KEYS || '').split(',').filter(k => k.trim());
  return validKeys.includes(apiKey.trim());
}

/**
 * Validate Bearer Token
 */
function validateBearerToken(token: string): SessionEntry | null {
  const [sessionId, tokenValue] = token.split('.');

  if (!sessionId || !tokenValue) {
    return null;
  }

  const session = sessionStore.get(sessionId);

  if (!session) {
    return null;
  }

  // Check if session has expired
  if (Date.now() - session.createdAt > SESSION_TIMEOUT_MS) {
    sessionStore.delete(sessionId);
    logger.warn(`Session expired for user: ${session.userId}`);
    return null;
  }

  // Check for inactivity
  if (Date.now() - session.lastActivity > INACTIVITY_TIMEOUT_MS) {
    sessionStore.delete(sessionId);
    logger.warn(`Session inactive timeout for user: ${session.userId}`);
    return null;
  }

  // Verify token value matches
  if (session.token !== tokenValue) {
    logger.warn(`Invalid token for session: ${sessionId}`);
    return null;
  }

  // Update last activity
  session.lastActivity = Date.now();

  return session;
}

/**
 * Validate Basic Authentication
 * Format: Authorization: Basic base64(username:password)
 */
function validateBasicAuth(authHeader: string): { username: string; password: string } | null {
  try {
    const base64Credentials = authHeader.replace(/^Basic\s+/, '');
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');

    // In production, validate against database with hashed passwords
    const validUsername = process.env.API_USERNAME || 'admin';
    const validPassword = process.env.API_PASSWORD || 'changeme';

    if (username === validUsername && password === validPassword) {
      return { username, password };
    }

    logger.warn(`Failed basic auth attempt for user: ${username}`);
    return null;
  } catch (error) {
    logger.error('Basic auth validation error:', error);
    return null;
  }
}

/**
 * Authentication Middleware
 * Validates API key, Bearer token, or Basic auth
 */
export const authenticationMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Skip authentication for health check and docs
  if (req.path === '/health' || req.path === '/api/docs') {
    return next();
  }

  const authHeader = req.headers.authorization;
  const apiKey = req.headers['x-api-key'] as string;

  // Check API Key
  if (apiKey) {
    if (validateApiKey(apiKey)) {
      (req as any).user = {
        id: 'api-key-user',
        type: 'api-key'
      };
      return next();
    } else {
      logger.warn('Invalid API key attempt');
      res.status(401).json({
        success: false,
        message: 'Invalid API key'
      });
      return;
    }
  }

  // Check Bearer Token
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const session = validateBearerToken(token);

    if (session) {
      (req as any).user = {
        id: session.userId,
        type: 'bearer',
        sessionId: authHeader.split('.')[0]
      };
      return next();
    } else {
      logger.warn('Invalid bearer token');
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
      return;
    }
  }

  // Check Basic Authentication
  if (authHeader && authHeader.startsWith('Basic ')) {
    const credentials = validateBasicAuth(authHeader);

    if (credentials) {
      (req as any).user = {
        id: credentials.username,
        type: 'basic'
      };
      return next();
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
      return;
    }
  }

  // No valid authentication provided
  logger.warn(`Unauthenticated request to ${req.method} ${req.path}`);
  res.status(401).json({
    success: false,
    message: 'Authentication required. Provide API key or Bearer token'
  });
};

/**
 * CSRF Protection Middleware
 * Validates CSRF tokens for state-changing requests
 */
export const csrfProtectionMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Only protect state-changing requests
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return next();
  }

  const csrfToken = req.headers['x-csrf-token'] as string;

  // In production, verify CSRF token against session
  // For now, just ensure token is provided for state-changing requests from browsers
  if (req.headers.origin && !csrfToken) {
    logger.warn(`CSRF token missing for ${req.method} ${req.path}`);
    res.status(403).json({
      success: false,
      message: 'CSRF token required'
    });
    return;
  }

  next();
};

/**
 * Generate CSRF Token
 * Can be called to get a new CSRF token for client-side use
 */
export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Session Management
 * Get current session info
 */
export function getSession(token: string): SessionEntry | null {
  const [sessionId, tokenValue] = token.split('.');
  const session = sessionStore.get(sessionId);

  if (session && session.token === tokenValue) {
    return session;
  }

  return null;
}

/**
 * Invalidate Session
 * Logout user by removing session
 */
export function invalidateSession(token: string): boolean {
  const [sessionId] = token.split('.');
  return sessionStore.delete(sessionId);
}

/**
 * Cleanup Expired Sessions
 * Remove expired sessions (run periodically)
 */
export function cleanupExpiredSessions(): number {
  let deletedCount = 0;
  const now = Date.now();

  for (const [sessionId, session] of sessionStore) {
    if (now - session.createdAt > SESSION_TIMEOUT_MS) {
      sessionStore.delete(sessionId);
      deletedCount++;
    }
  }

  if (deletedCount > 0) {
    logger.info(`Cleaned up ${deletedCount} expired sessions`);
  }

  return deletedCount;
}

// Run cleanup every 10 minutes
setInterval(() => {
  cleanupExpiredSessions();
}, 10 * 60 * 1000);

/**
 * Optional Authorization Middleware
 * Checks if user has specific roles/permissions
 */
export const authorizeRoles = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    // In production, fetch user roles from database
    const userRoles = (process.env.USER_ROLES || 'admin').split(',');
    const hasRole = allowedRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      logger.warn(`Unauthorized access attempt by user: ${user.id}`);
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
};

export default {
  generateToken,
  validateApiKey,
  generateCsrfToken,
  authenticationMiddleware,
  csrfProtectionMiddleware,
  getSession,
  invalidateSession,
  cleanupExpiredSessions,
  authorizeRoles
};
