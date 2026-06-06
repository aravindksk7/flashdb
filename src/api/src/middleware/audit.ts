/**
 * Audit Logging Middleware
 * Implements comprehensive audit logging for compliance
 * - Tracks all state changes (create, update, delete)
 * - Records: user, timestamp, operation type, before/after values
 * - Immutable append-only audit log
 * - Sensitive data redaction
 */

import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import logger from '../logger';

interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  operation: string; // CREATE, READ, UPDATE, DELETE, LOGIN, LOGOUT
  resource: string; // e.g., 'golden-image', 'clone', 'checkpoint'
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
  duration: number; // milliseconds
}

// Audit log file path
const auditLogDir = process.env.AUDIT_LOG_DIR || path.join(process.cwd(), 'logs', 'audit');
const auditLogFile = path.join(auditLogDir, `audit-${new Date().toISOString().split('T')[0]}.log`);

// Ensure audit log directory exists
if (!fs.existsSync(auditLogDir)) {
  fs.mkdirSync(auditLogDir, { recursive: true });
  logger.info(`Created audit log directory: ${auditLogDir}`);
}

/**
 * Audit Log Entry Generator
 */
function generateAuditLogEntry(
  userId: string,
  operation: string,
  resource: string,
  resourceId: string,
  req: Request,
  statusCode: number,
  duration: number,
  changes?: any,
  error?: string
): AuditLogEntry {
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
function redactChanges(changes: any): any {
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

  const redact = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return obj;

    if (Array.isArray(obj)) {
      return obj.map(redact);
    }

    const result = { ...obj };
    for (const key in result) {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        result[key] = '[REDACTED]';
      } else if (typeof result[key] === 'object') {
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
export function writeAuditLog(entry: AuditLogEntry): void {
  try {
    const logLine = JSON.stringify(entry) + '\n';

    // Append to audit log file (atomic write)
    fs.appendFileSync(auditLogFile, logLine, { mode: 0o600 }); // Read/write for owner only
  } catch (error) {
    logger.error('Failed to write audit log:', error);
  }
}

/**
 * Audit Logging Middleware
 * Tracks all HTTP requests and state changes
 */
export const auditLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();
  const user = (req as any).user;
  const userId = user?.id || 'anonymous';

  // Parse resource from path
  const pathParts = req.path.split('/').filter(p => p);
  const resource = pathParts[1] || 'unknown'; // e.g., 'golden-images', 'clones'
  const resourceId = pathParts[2] || '';

  // Capture original request body for comparison
  let originalBody: any = null;
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    originalBody = JSON.parse(JSON.stringify(req.body));
  }

  // Intercept response to capture status code and modified body
  const originalSend = res.send;
  let responseBody: any = null;
  let statusCode = res.statusCode;

  res.send = function (data: any) {
    statusCode = res.statusCode;
    try {
      responseBody = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      responseBody = data;
    }

    return originalSend.call(this, data);
  };

  // On response finish, log the audit entry
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    // Determine operation type
    let operation = 'READ';
    if (req.method === 'POST') operation = 'CREATE';
    else if (['PUT', 'PATCH'].includes(req.method)) operation = 'UPDATE';
    else if (req.method === 'DELETE') operation = 'DELETE';

    // Only audit state-changing operations
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const changes =
        originalBody || responseBody
          ? {
              before: originalBody,
              after: responseBody
            }
          : undefined;

      const entry = generateAuditLogEntry(
        userId,
        operation,
        resource,
        resourceId,
        req,
        statusCode,
        duration,
        changes,
        statusCode >= 400 ? `HTTP ${statusCode}` : undefined
      );

      writeAuditLog(entry);

      // Log summary to application logger
      logger.info(
        `Audit: ${operation} ${resource}/${resourceId} by ${userId} - Status: ${statusCode} (${duration}ms)`
      );
    }

    // Log all requests with errors
    if (statusCode >= 400) {
      const entry = generateAuditLogEntry(
        userId,
        'READ',
        resource,
        resourceId,
        req,
        statusCode,
        duration,
        undefined,
        `HTTP ${statusCode}`
      );

      writeAuditLog(entry);
    }
  });

  next();
};

/**
 * Manual Audit Log Writing
 * For explicit audit logging in route handlers
 */
export function logAuditEvent(
  req: Request,
  operation: string,
  resource: string,
  resourceId: string,
  changes?: any,
  error?: string
): void {
  const user = (req as any).user;
  const userId = user?.id || 'anonymous';

  const entry = generateAuditLogEntry(
    userId,
    operation,
    resource,
    resourceId,
    req,
    200,
    0,
    changes,
    error
  );

  writeAuditLog(entry);
}

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

export function readAuditLogs(filter: AuditLogFilter = {}): AuditLogEntry[] {
  try {
    if (!fs.existsSync(auditLogFile)) {
      return [];
    }

    const logContent = fs.readFileSync(auditLogFile, 'utf-8');
    const lines = logContent.split('\n').filter(line => line.trim());

    let entries: AuditLogEntry[] = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Apply filters
    entries = entries.filter(entry => {
      if (filter.userId && entry.userId !== filter.userId) return false;
      if (filter.operation && entry.operation !== filter.operation) return false;
      if (filter.resource && entry.resource !== filter.resource) return false;
      if (filter.resourceId && entry.resourceId !== filter.resourceId) return false;

      if (filter.startDate && new Date(entry.timestamp) < filter.startDate) return false;
      if (filter.endDate && new Date(entry.timestamp) > filter.endDate) return false;

      return true;
    });

    // Sort by timestamp descending
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply limit and offset
    const offset = filter.offset || 0;
    const limit = filter.limit || 100;

    return entries.slice(offset, offset + limit);
  } catch (error) {
    logger.error('Error reading audit logs:', error);
    return [];
  }
}

/**
 * Get Audit Log Summary Statistics
 */
export function getAuditLogStats() {
  try {
    if (!fs.existsSync(auditLogFile)) {
      return {
        totalEntries: 0,
        fileSize: 0,
        oldestEntry: null,
        newestEntry: null
      };
    }

    const stat = fs.statSync(auditLogFile);
    const logContent = fs.readFileSync(auditLogFile, 'utf-8');
    const lines = logContent.split('\n').filter(line => line.trim());
    const entries = lines.map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    return {
      totalEntries: entries.length,
      fileSizeBytes: stat.size,
      oldestEntry: entries.length > 0 ? entries[entries.length - 1] : null,
      newestEntry: entries.length > 0 ? entries[0] : null
    };
  } catch (error) {
    logger.error('Error getting audit log stats:', error);
    return { totalEntries: 0, fileSize: 0, oldestEntry: null, newestEntry: null };
  }
}

export default {
  auditLoggingMiddleware,
  logAuditEvent,
  writeAuditLog,
  readAuditLogs,
  getAuditLogStats
};
