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
interface SessionEntry {
    token: string;
    userId: string;
    createdAt: number;
    lastActivity: number;
    apiKey?: string;
}
/**
 * Token Format:
 * Bearer <token>
 * Or API-Key <key>
 */
/**
 * Generate a secure token
 */
export declare function generateToken(userId: string, apiKey?: string): string;
/**
 * Validate API Key
 * API keys should be stored securely (hashed) in database
 */
declare function validateApiKey(apiKey: string): boolean;
/**
 * Authentication Middleware
 * Validates API key, Bearer token, or Basic auth
 */
export declare const authenticationMiddleware: (req: Request, res: Response, next: NextFunction) => void;
/**
 * CSRF Protection Middleware
 * Validates CSRF tokens for state-changing requests
 */
export declare const csrfProtectionMiddleware: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Generate CSRF Token
 * Can be called to get a new CSRF token for client-side use
 */
export declare function generateCsrfToken(): string;
/**
 * Session Management
 * Get current session info
 */
export declare function getSession(token: string): SessionEntry | null;
/**
 * Invalidate Session
 * Logout user by removing session
 */
export declare function invalidateSession(token: string): boolean;
/**
 * Cleanup Expired Sessions
 * Remove expired sessions (run periodically)
 */
export declare function cleanupExpiredSessions(): number;
/**
 * Optional Authorization Middleware
 * Checks if user has specific roles/permissions
 */
export declare const authorizeRoles: (allowedRoles: string[]) => (req: Request, res: Response, next: NextFunction) => void;
declare const _default: {
    generateToken: typeof generateToken;
    validateApiKey: typeof validateApiKey;
    generateCsrfToken: typeof generateCsrfToken;
    authenticationMiddleware: (req: Request, res: Response, next: NextFunction) => void;
    csrfProtectionMiddleware: (req: Request, res: Response, next: NextFunction) => void;
    getSession: typeof getSession;
    invalidateSession: typeof invalidateSession;
    cleanupExpiredSessions: typeof cleanupExpiredSessions;
    authorizeRoles: (allowedRoles: string[]) => (req: Request, res: Response, next: NextFunction) => void;
};
export default _default;
//# sourceMappingURL=auth.d.ts.map