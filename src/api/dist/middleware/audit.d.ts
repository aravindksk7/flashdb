/**
 * Audit Logging Middleware
 * Implements comprehensive audit logging for compliance
 * - Tracks all state changes (create, update, delete)
 * - Records: user, timestamp, operation type, before/after values
 * - Immutable append-only audit log
 * - Sensitive data redaction
 */
import { Request, Response, NextFunction } from 'express';
interface AuditLogEntry {
    id: string;
    timestamp: string;
    userId: string;
    operation: string;
    resource: string;
    resourceId: string;
    method: string;
    path: string;
    statusCode: number;
    ipAddress: string;
    changes?: {
        before?: any;
        after?: any;
    };
    error?: string;
    duration: number;
}
/**
 * Write Audit Log Entry
 * Append-only, immutable log file
 */
export declare function writeAuditLog(entry: AuditLogEntry): void;
/**
 * Audit Logging Middleware
 * Tracks all HTTP requests and state changes
 */
export declare const auditLoggingMiddleware: (req: Request, res: Response, next: NextFunction) => void;
/**
 * Manual Audit Log Writing
 * For explicit audit logging in route handlers
 */
export declare function logAuditEvent(req: Request, operation: string, resource: string, resourceId: string, changes?: any, error?: string): void;
/**
 * Read Audit Logs
 * Query audit logs by filters
 */
export interface AuditLogFilter {
    userId?: string;
    operation?: string;
    resource?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}
export declare function readAuditLogs(filter?: AuditLogFilter): AuditLogEntry[];
/**
 * Get Audit Log Summary Statistics
 */
export declare function getAuditLogStats(): {
    totalEntries: number;
    fileSize: number;
    oldestEntry: null;
    newestEntry: null;
    fileSizeBytes?: undefined;
} | {
    totalEntries: number;
    fileSizeBytes: number;
    oldestEntry: any;
    newestEntry: any;
    fileSize?: undefined;
};
declare const _default: {
    auditLoggingMiddleware: (req: Request, res: Response, next: NextFunction) => void;
    logAuditEvent: typeof logAuditEvent;
    writeAuditLog: typeof writeAuditLog;
    readAuditLogs: typeof readAuditLogs;
    getAuditLogStats: typeof getAuditLogStats;
};
export default _default;
//# sourceMappingURL=audit.d.ts.map