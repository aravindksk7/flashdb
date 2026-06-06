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
/**
 * CORS Configuration
 * Whitelist only trusted origins
 */
export declare const corsOptions: {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
    credentials: boolean;
    methods: string[];
    allowedHeaders: string[];
    exposedHeaders: string[];
    maxAge: number;
};
/**
 * Rate Limiting Middleware
 * Limits requests to 100 per minute per IP address
 */
export declare const rateLimitMiddleware: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Security Headers Middleware
 * Adds essential security headers to all responses
 */
export declare const securityHeadersMiddleware: (_req: Request, res: Response, next: NextFunction) => void;
/**
 * HTTPS Enforcement Middleware
 * Redirects HTTP requests to HTTPS in production
 */
export declare const httpsEnforcementMiddleware: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Request Validation Middleware
 * Validates incoming request format and size
 */
export declare const requestValidationMiddleware: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Request ID Middleware
 * Adds a unique request ID for tracing
 */
export declare const requestIdMiddleware: (req: Request, _res: Response, next: NextFunction) => void;
/**
 * Sensitive Data Redaction
 * Prevents sensitive data from being logged or exposed in error messages
 */
export declare const sensitiveFields: string[];
/**
 * Redact sensitive data from an object
 */
export declare function redactSensitiveData(obj: any): any;
/**
 * Security Headers Options
 * Returns recommended security headers configuration
 */
export declare const getSecurityConfig: () => {
    corsOptions: {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
        credentials: boolean;
        methods: string[];
        allowedHeaders: string[];
        exposedHeaders: string[];
        maxAge: number;
    };
    rateLimitWindowMs: number;
    rateLimitMax: number;
    https: boolean;
    sessionTimeout: number;
};
declare const _default: {
    corsOptions: {
        origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
        credentials: boolean;
        methods: string[];
        allowedHeaders: string[];
        exposedHeaders: string[];
        maxAge: number;
    };
    rateLimitMiddleware: (req: Request, res: Response, next: NextFunction) => void;
    securityHeadersMiddleware: (_req: Request, res: Response, next: NextFunction) => void;
    httpsEnforcementMiddleware: (req: Request, res: Response, next: NextFunction) => void;
    requestValidationMiddleware: (req: Request, res: Response, next: NextFunction) => void;
    requestIdMiddleware: (req: Request, _res: Response, next: NextFunction) => void;
    redactSensitiveData: typeof redactSensitiveData;
    getSecurityConfig: () => {
        corsOptions: {
            origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void;
            credentials: boolean;
            methods: string[];
            allowedHeaders: string[];
            exposedHeaders: string[];
            maxAge: number;
        };
        rateLimitWindowMs: number;
        rateLimitMax: number;
        https: boolean;
        sessionTimeout: number;
    };
};
export default _default;
//# sourceMappingURL=security.d.ts.map