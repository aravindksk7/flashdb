"use strict";
/**
 * Authentication Middleware
 * Implements API security through:
 * - Bearer token (JWT-style) validation
 * - API key validation
 * - Basic authentication support
 * - Session timeout enforcement (24 hours)
 * - CSRF protection
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authorizeRoles = exports.csrfProtectionMiddleware = exports.authenticationMiddleware = void 0;
exports.generateToken = generateToken;
exports.generateCsrfToken = generateCsrfToken;
exports.getSession = getSession;
exports.invalidateSession = invalidateSession;
exports.cleanupExpiredSessions = cleanupExpiredSessions;
const logger_1 = __importDefault(require("../logger"));
const crypto_1 = __importDefault(require("crypto"));
const sessionStore = new Map();
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
function generateToken(userId, apiKey) {
    // Simple token generation (for production, use proper JWT library)
    const token = crypto_1.default.randomBytes(32).toString('hex');
    const sessionId = crypto_1.default.randomBytes(16).toString('hex');
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
function validateApiKey(apiKey) {
    const validKeys = (process.env.VALID_API_KEYS || '').split(',').filter(k => k.trim());
    return validKeys.includes(apiKey.trim());
}
/**
 * Validate Bearer Token
 */
function validateBearerToken(token) {
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
        logger_1.default.warn(`Session expired for user: ${session.userId}`);
        return null;
    }
    // Check for inactivity
    if (Date.now() - session.lastActivity > INACTIVITY_TIMEOUT_MS) {
        sessionStore.delete(sessionId);
        logger_1.default.warn(`Session inactive timeout for user: ${session.userId}`);
        return null;
    }
    // Verify token value matches
    if (session.token !== tokenValue) {
        logger_1.default.warn(`Invalid token for session: ${sessionId}`);
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
function validateBasicAuth(authHeader) {
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
        logger_1.default.warn(`Failed basic auth attempt for user: ${username}`);
        return null;
    }
    catch (error) {
        logger_1.default.error('Basic auth validation error:', error);
        return null;
    }
}
/**
 * Authentication Middleware
 * Validates API key, Bearer token, or Basic auth
 */
const authenticationMiddleware = (req, res, next) => {
    // Skip authentication for health check and docs
    if (req.path === '/health' || req.path === '/api/docs') {
        return next();
    }
    const authHeader = req.headers.authorization;
    const apiKey = req.headers['x-api-key'];
    // Check API Key
    if (apiKey) {
        if (validateApiKey(apiKey)) {
            req.user = {
                id: 'api-key-user',
                type: 'api-key'
            };
            return next();
        }
        else {
            logger_1.default.warn('Invalid API key attempt');
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
            req.user = {
                id: session.userId,
                type: 'bearer',
                sessionId: authHeader.split('.')[0]
            };
            return next();
        }
        else {
            logger_1.default.warn('Invalid bearer token');
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
            req.user = {
                id: credentials.username,
                type: 'basic'
            };
            return next();
        }
        else {
            res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
            return;
        }
    }
    // No valid authentication provided
    logger_1.default.warn(`Unauthenticated request to ${req.method} ${req.path}`);
    res.status(401).json({
        success: false,
        message: 'Authentication required. Provide API key or Bearer token'
    });
};
exports.authenticationMiddleware = authenticationMiddleware;
/**
 * CSRF Protection Middleware
 * Validates CSRF tokens for state-changing requests
 */
const csrfProtectionMiddleware = (req, res, next) => {
    // Only protect state-changing requests
    if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        return next();
    }
    const csrfToken = req.headers['x-csrf-token'];
    // In production, verify CSRF token against session
    // For now, just ensure token is provided for state-changing requests from browsers
    if (req.headers.origin && !csrfToken) {
        logger_1.default.warn(`CSRF token missing for ${req.method} ${req.path}`);
        res.status(403).json({
            success: false,
            message: 'CSRF token required'
        });
        return;
    }
    next();
};
exports.csrfProtectionMiddleware = csrfProtectionMiddleware;
/**
 * Generate CSRF Token
 * Can be called to get a new CSRF token for client-side use
 */
function generateCsrfToken() {
    return crypto_1.default.randomBytes(32).toString('hex');
}
/**
 * Session Management
 * Get current session info
 */
function getSession(token) {
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
function invalidateSession(token) {
    const [sessionId] = token.split('.');
    return sessionStore.delete(sessionId);
}
/**
 * Cleanup Expired Sessions
 * Remove expired sessions (run periodically)
 */
function cleanupExpiredSessions() {
    let deletedCount = 0;
    const now = Date.now();
    for (const [sessionId, session] of sessionStore) {
        if (now - session.createdAt > SESSION_TIMEOUT_MS) {
            sessionStore.delete(sessionId);
            deletedCount++;
        }
    }
    if (deletedCount > 0) {
        logger_1.default.info(`Cleaned up ${deletedCount} expired sessions`);
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
const authorizeRoles = (allowedRoles) => {
    return (req, res, next) => {
        const user = req.user;
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
            logger_1.default.warn(`Unauthorized access attempt by user: ${user.id}`);
            res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
            return;
        }
        next();
    };
};
exports.authorizeRoles = authorizeRoles;
exports.default = {
    generateToken,
    validateApiKey,
    generateCsrfToken,
    authenticationMiddleware: exports.authenticationMiddleware,
    csrfProtectionMiddleware: exports.csrfProtectionMiddleware,
    getSession,
    invalidateSession,
    cleanupExpiredSessions,
    authorizeRoles: exports.authorizeRoles
};
//# sourceMappingURL=auth.js.map