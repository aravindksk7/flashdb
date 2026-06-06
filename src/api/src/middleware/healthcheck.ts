import { Request, Response } from 'express';
import logger from '../logger';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    api: HealthCheck;
    filesystem: HealthCheck;
    powershell: HealthCheck;
    memory: HealthCheck;
    disk: HealthCheck;
  };
  version: string;
  environment: string;
}

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  details?: any;
  error?: string;
}

const startTime = Date.now();
const API_VERSION = '0.1.0';

function getPowerShellCommand(): string {
  return process.env.POWERSHELL_COMMAND || (process.platform === 'win32' ? 'powershell' : 'pwsh');
}

function getFlashdbModulePath(): string {
  return process.env.FLASHDB_MODULE_PATH ||
    (process.platform === 'win32'
      ? 'C:\\flashdb\\src\\FlashDB\\FlashDB.psm1'
      : '/app/src/FlashDB/FlashDB.psm1');
}

/**
 * Check API responsiveness
 */
async function checkAPI(): Promise<HealthCheck> {
  const startCheck = Date.now();
  try {
    // Simple in-process check
    const responseTime = Date.now() - startCheck;
    return {
      status: 'healthy',
      responseTime,
      details: { message: 'API responding normally' }
    };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startCheck,
      error: error.message
    };
  }
}

/**
 * Check filesystem access
 */
async function checkFilesystem(): Promise<HealthCheck> {
  const startCheck = Date.now();
  try {
    const logsDir = path.join(process.cwd(), 'logs');

    // Ensure logs directory exists
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Try to write a test file
    const testFile = path.join(logsDir, '.health-check');
    fs.writeFileSync(testFile, `${new Date().toISOString()}\n`, { flag: 'a' });

    const responseTime = Date.now() - startCheck;

    fs.accessSync(logsDir, fs.constants.W_OK);
    const diskInfo = {
      logsDir: logsDir,
      accessible: true,
      writeableVia: 'node'
    };

    return {
      status: 'healthy',
      responseTime,
      details: diskInfo
    };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - startCheck,
      error: error.message,
      details: { reason: 'Cannot access or write to logs directory' }
    };
  }
}

/**
 * Check PowerShell connectivity
 */
async function checkPowerShell(): Promise<HealthCheck> {
  const startCheck = Date.now();
  try {
    const flashdbModulePath = getFlashdbModulePath();
    const powerShellCommand = getPowerShellCommand();

    // Check if module file exists
    if (!fs.existsSync(flashdbModulePath)) {
      return {
        status: 'degraded',
        responseTime: Date.now() - startCheck,
        error: `FlashDB module not found at ${flashdbModulePath}`,
        details: { modulePath: flashdbModulePath }
      };
    }

    // Try to spawn PowerShell and get version (no module import, just version check)
    const result = spawnSync(powerShellCommand, ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
      timeout: 5000,
      encoding: 'utf-8'
    });

    if (result.error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startCheck,
        error: result.error.message,
        details: { reason: 'Cannot spawn PowerShell process' }
      };
    }

    const psVersion = result.stdout?.trim() || 'unknown';
    const responseTime = Date.now() - startCheck;

    return {
      status: 'healthy',
      responseTime,
      details: {
        powershellVersion: psVersion,
        executable: powerShellCommand,
        modulePath: flashdbModulePath,
        moduleExists: true
      }
    };
  } catch (error: any) {
    return {
      status: 'degraded',
      responseTime: Date.now() - startCheck,
      error: error.message,
      details: { reason: 'PowerShell integration not available' }
    };
  }
}

/**
 * Check memory usage
 */
async function checkMemory(): Promise<HealthCheck> {
  const startCheck = Date.now();
  try {
    const used = process.memoryUsage();
    const responseTime = Date.now() - startCheck;

    // Convert to MB
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    const externalMB = Math.round(used.external / 1024 / 1024);
    const heapUsagePercent = Math.round((used.heapUsed / used.heapTotal) * 100);

    // Determine status based on usage
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (heapUsagePercent > 90) {
      status = 'unhealthy';
    } else if (heapUsagePercent > 75) {
      status = 'degraded';
    }

    return {
      status,
      responseTime,
      details: {
        heapUsedMB,
        heapTotalMB,
        externalMB,
        heapUsagePercent: `${heapUsagePercent}%`,
        rss: Math.round(used.rss / 1024 / 1024) + 'MB',
        arrayBuffers: Math.round(used.arrayBuffers / 1024 / 1024) + 'MB'
      }
    };
  } catch (error: any) {
    return {
      status: 'degraded',
      responseTime: Date.now() - startCheck,
      error: error.message
    };
  }
}

/**
 * Check disk space (Windows-specific)
 */
async function checkDisk(): Promise<HealthCheck> {
  const startCheck = Date.now();
  try {
    // Check if we're on Windows
    if (process.platform !== 'win32') {
      return {
        status: 'healthy',
        responseTime: Date.now() - startCheck,
        details: { skipped: 'Not on Windows', platform: process.platform }
      };
    }

    // Use PowerShell to get disk space
    const result = spawnSync(getPowerShellCommand(), [
      '-NoLogo',
      '-NoProfile',
      '-Command',
      '(Get-Volume -DriveLetter C | Select-Object -Property SizeRemaining,Size) | ConvertTo-Json'
    ], {
      timeout: 5000,
      encoding: 'utf-8'
    });

    const responseTime = Date.now() - startCheck;

    if (result.error || !result.stdout) {
      return {
        status: 'degraded',
        responseTime,
        error: result.error?.message || 'Could not retrieve disk info'
      };
    }

    let diskInfo;
    try {
      diskInfo = JSON.parse(result.stdout);
    } catch {
      // Fallback if JSON parsing fails
      return {
        status: 'degraded',
        responseTime,
        details: { message: 'Could not parse disk information' }
      };
    }

    const sizeRemainingMB = Math.round((diskInfo.SizeRemaining || 0) / 1024 / 1024);
    const sizeTotalMB = Math.round((diskInfo.Size || 0) / 1024 / 1024);
    const usedPercent = sizeTotalMB > 0 ? Math.round(((sizeTotalMB - sizeRemainingMB) / sizeTotalMB) * 100) : 0;

    // Determine status based on free space
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    const freeGB = sizeRemainingMB / 1024;

    if (freeGB < 1) { // Less than 1 GB
      status = 'unhealthy';
    } else if (freeGB < 5) { // Less than 5 GB
      status = 'degraded';
    }

    return {
      status,
      responseTime,
      details: {
        drive: 'C:',
        sizeRemainingGB: (sizeRemainingMB / 1024).toFixed(2),
        sizeTotalGB: (sizeTotalMB / 1024).toFixed(2),
        usedPercent: `${usedPercent}%`,
        freeSpaceGB: freeGB.toFixed(2)
      }
    };
  } catch (error: any) {
    return {
      status: 'degraded',
      responseTime: Date.now() - startCheck,
      error: error.message,
      details: { reason: 'Could not check disk space' }
    };
  }
}

/**
 * Main health check endpoint
 */
export async function healthCheckEndpoint(_req: Request, res: Response) {
  try {
    const checkStart = Date.now();

    // Run all checks in parallel
    const [apiCheck, filesystemCheck, powershellCheck, memoryCheck, diskCheck] = await Promise.all([
      checkAPI(),
      checkFilesystem(),
      checkPowerShell(),
      checkMemory(),
      checkDisk()
    ]);

    // Determine overall status
    const checks = {
      api: apiCheck,
      filesystem: filesystemCheck,
      powershell: powershellCheck,
      memory: memoryCheck,
      disk: diskCheck
    };

    const statuses = Object.values(checks).map(c => c.status);
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';

    if (statuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    const uptime = Math.round((Date.now() - startTime) / 1000);
    const checkDuration = Date.now() - checkStart;

    const healthStatus: HealthStatus = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime,
      checks,
      version: API_VERSION,
      environment: process.env.NODE_ENV || 'development'
    };

    // Log health check result
    logger.info('Health check completed', {
      status: overallStatus,
      duration: checkDuration,
      timestamp: new Date().toISOString(),
      uptime,
      checks: {
        api: apiCheck.status,
        filesystem: filesystemCheck.status,
        powershell: powershellCheck.status,
        memory: memoryCheck.status,
        disk: diskCheck.status
      }
    });

    // Set HTTP status based on health
    const httpStatus = overallStatus === 'unhealthy' ? 503 : overallStatus === 'degraded' ? 200 : 200;
    res.status(httpStatus).json(healthStatus);
  } catch (error: any) {
    logger.error('Health check failed', {
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message,
      version: API_VERSION,
      environment: process.env.NODE_ENV || 'development'
    });
  }
}

/**
 * Lightweight health check (for load balancers)
 */
export function livelinessProbe(_req: Request, res: Response) {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: Math.round((Date.now() - startTime) / 1000)
  });
}

/**
 * Readiness check (for orchestrators)
 */
export async function readinessProbe(_req: Request, res: Response) {
  try {
    // Quick check that all critical systems are available
    const [apiCheck, filesystemCheck] = await Promise.all([
      checkAPI(),
      checkFilesystem()
    ]);

    const isReady = apiCheck.status === 'healthy' && filesystemCheck.status !== 'unhealthy';

    res.status(isReady ? 200 : 503).json({
      ready: isReady,
      timestamp: new Date().toISOString(),
      checks: {
        api: apiCheck.status,
        filesystem: filesystemCheck.status
      }
    });
  } catch (error: any) {
    res.status(503).json({
      ready: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
