"use strict";
/**
 * Audit Logging Middleware
 * Implements comprehensive audit logging for compliance
 * - Tracks all state changes (create, update, delete)
 * - Records: user, timestamp, operation type, before/after values
 * - Immutable append-only audit log
 * - Sensitive data redaction
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLoggingMiddleware = void 0;
exports.writeAuditLog = writeAuditLog;
exports.logAuditEvent = logAuditEvent;
exports.readAuditLogs = readAuditLogs;
exports.getAuditLogStats = getAuditLogStats;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = __importDefault(require("../logger"));
// Audit log file path
const auditLogDir = process.env.AUDIT_LOG_DIR || path_1.default.join(process.cwd(), 'logs', 'audit');
const auditLogFile = path_1.default.join(auditLogDir, `audit-${new Date().toISOString().split('T')[0]}.log`);
// Ensure audit log directory exists
if (!fs_1.default.existsSync(auditLogDir)) {
    fs_1.default.mkdirSync(auditLogDir, { recursive: true });
    logger_1.default.info(`Created audit log directory: ${auditLogDir}`);
}
/**
 * Audit Log Entry Generator
 */
function generateAuditLogEntry(userId, operation, resource, resourceId, req, statusCode, duration, changes, error) {
    const timestamp = new Date().toISOString();
    const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return {
        id,
        timestamp,
        userId,
        operation,
        resource,
        resourceId,
        method: req.method,
        path: req.path,
        statusCode,
        ipAddress: req.ip || req.socket.remoteAddress || 'unknown',
        changes: changes ? redactChanges(changes) : undefined,
        error,
        duration
    };
}
/**
 * Redact Sensitive Data in Changes
 */
function redactChanges(changes) {
    const sensitiveFields = [
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
    const redact = (obj) => {
        if (!obj || typeof obj !== 'object')
            return obj;
        if (Array.isArray(obj)) {
            return obj.map(redact);
        }
        const result = { ...obj };
        for (const key in result) {
            if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
                result[key] = '[REDACTED]';
            }
            else if (typeof result[key] === 'object') {
                result[key] = redact(result[key]);
            }
        }
        return result;
    };
    return {
        before: changes.before ? redact(changes.before) : undefined,
        after: changes.after ? redact(changes.after) : undefined
    };
}
/**
 * Write Audit Log Entry
 * Append-only, immutable log file
 */
function writeAuditLog(entry) {
    try {
        const logLine = JSON.stringify(entry) + '\n';
        // Append to audit log file (atomic write)
        fs_1.default.appendFileSync(auditLogFile, logLine, { mode: 0o600 }); // Read/write for owner only
    }
    catch (error) {
        logger_1.default.error('Failed to write audit log:', error);
    }
}
/**
 * Audit Logging Middleware
 * Tracks all HTTP requests and state changes
 */
const auditLoggingMiddleware = (req, res, next) => {
    const startTime = Date.now();
    const user = req.user;
    const userId = user?.id || 'anonymous';
    // Parse resource from path
    const pathParts = req.path.split('/').filter(p => p);
    const resource = pathParts[1] || 'unknown'; // e.g., 'golden-images', 'clones'
    const resourceId = pathParts[2] || '';
    // Capture original request body for comparison
    let originalBody = null;
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        originalBody = JSON.parse(JSON.stringify(req.body));
    }
    // Intercept response to capture status code and modified body
    const originalSend = res.send;
    let responseBody = null;
    let statusCode = res.statusCode;
    res.send = function (data) {
        statusCode = res.statusCode;
        try {
            responseBody = typeof data === 'string' ? JSON.parse(data) : data;
        }
        catch {
            responseBody = data;
        }
        return originalSend.call(this, data);
    };
    // On response finish, log the audit entry
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        // Determine operation type
        let operation = 'READ';
        if (req.method === 'POST')
            operation = 'CREATE';
        else if (['PUT', 'PATCH'].includes(req.method))
            operation = 'UPDATE';
        else if (req.method === 'DELETE')
            operation = 'DELETE';
        // Only audit state-changing operations
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
            const changes = originalBody || responseBody
                ? {
                    before: originalBody,
                    after: responseBody
                }
                : undefined;
            const entry = generateAuditLogEntry(userId, operation, resource, resourceId, req, statusCode, duration, changes, statusCode >= 400 ? `HTTP ${statusCode}` : undefined);
            writeAuditLog(entry);
            // Log summary to application logger
            logger_1.default.info(`Audit: ${operation} ${resource}/${resourceId} by ${userId} - Status: ${statusCode} (${duration}ms)`);
        }
        // Log all requests with errors
        if (statusCode >= 400) {
            const entry = generateAuditLogEntry(userId, 'READ', resource, resourceId, req, statusCode, duration, undefined, `HTTP ${statusCode}`);
            writeAuditLog(entry);
        }
    });
    next();
};
exports.auditLoggingMiddleware = auditLoggingMiddleware;
/**
 * Manual Audit Log Writing
 * For explicit audit logging in route handlers
 */
function logAuditEvent(req, operation, resource, resourceId, changes, error) {
    const user = req.user;
    const userId = user?.id || 'anonymous';
    const entry = generateAuditLogEntry(userId, operation, resource, resourceId, req, 200, 0, changes, error);
    writeAuditLog(entry);
}
function readAuditLogs(filter = {}) {
    try {
        if (!fs_1.default.existsSync(auditLogFile)) {
            return [];
        }
        const logContent = fs_1.default.readFileSync(auditLogFile, 'utf-8');
        const lines = logContent.split('\n').filter(line => line.trim());
        let entries = lines.map(line => {
            try {
                return JSON.parse(line);
            }
            catch {
                return null;
            }
        }).filter(Boolean);
        // Apply filters
        entries = entries.filter(entry => {
            if (filter.userId && entry.userId !== filter.userId)
                return false;
            if (filter.operation && entry.operation !== filter.operation)
                return false;
            if (filter.resource && entry.resource !== filter.resource)
                return false;
            if (filter.resourceId && entry.resourceId !== filter.resourceId)
                return false;
            if (filter.startDate && new Date(entry.timestamp) < filter.startDate)
                return false;
            if (filter.endDate && new Date(entry.timestamp) > filter.endDate)
                return false;
            return true;
        });
        // Sort by timestamp descending
        entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        // Apply limit and offset
        const offset = filter.offset || 0;
        const limit = filter.limit || 100;
        return entries.slice(offset, offset + limit);
    }
    catch (error) {
        logger_1.default.error('Error reading audit logs:', error);
        return [];
    }
}
/**
 * Get Audit Log Summary Statistics
 */
function getAuditLogStats() {
    try {
        if (!fs_1.default.existsSync(auditLogFile)) {
            return {
                totalEntries: 0,
                fileSize: 0,
                oldestEntry: null,
                newestEntry: null
            };
        }
        const stat = fs_1.default.statSync(auditLogFile);
        const logContent = fs_1.default.readFileSync(auditLogFile, 'utf-8');
        const lines = logContent.split('\n').filter(line => line.trim());
        const entries = lines.map(line => {
            try {
                return JSON.parse(line);
            }
            catch {
                return null;
            }
        }).filter(Boolean);
        return {
            totalEntries: entries.length,
            fileSizeBytes: stat.size,
            oldestEntry: entries.length > 0 ? entries[entries.length - 1] : null,
            newestEntry: entries.length > 0 ? entries[0] : null
        };
    }
    catch (error) {
        logger_1.default.error('Error getting audit log stats:', error);
        return { totalEntries: 0, fileSize: 0, oldestEntry: null, newestEntry: null };
    }
}
exports.default = {
    auditLoggingMiddleware: exports.auditLoggingMiddleware,
    logAuditEvent,
    writeAuditLog,
    readAuditLogs,
    getAuditLogStats
};
//# sourceMappingURL=audit.js.map