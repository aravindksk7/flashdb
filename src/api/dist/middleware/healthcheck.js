"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthCheckEndpoint = healthCheckEndpoint;
exports.livelinessProbe = livelinessProbe;
exports.readinessProbe = readinessProbe;
const logger_1 = __importDefault(require("../logger"));
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const instanceConfig_1 = require("../config/instanceConfig");
const startTime = Date.now();
const API_VERSION = '0.1.0';
function getPowerShellCommand() {
    return process.env.POWERSHELL_COMMAND || (process.platform === 'win32' ? 'powershell' : 'pwsh');
}
function getFlashdbModulePath() {
    return process.env.FLASHDB_MODULE_PATH ||
        (process.platform === 'win32'
            ? 'C:\\flashdb\\src\\FlashDB\\FlashDB.psm1'
            : '/app/src/FlashDB/FlashDB.psm1');
}
/**
 * Check API responsiveness
 */
async function checkAPI() {
    const startCheck = Date.now();
    try {
        // Simple in-process check
        const responseTime = Date.now() - startCheck;
        return {
            status: 'healthy',
            responseTime,
            details: { message: 'API responding normally' }
        };
    }
    catch (error) {
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
async function checkFilesystem() {
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
    }
    catch (error) {
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
async function checkPowerShell() {
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
        const result = (0, child_process_1.spawnSync)(powerShellCommand, ['-NoLogo', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
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
    }
    catch (error) {
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
async function checkMemory() {
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
        let status = 'healthy';
        if (heapUsagePercent > 90) {
            status = 'unhealthy';
        }
        else if (heapUsagePercent > 75) {
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
    }
    catch (error) {
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
async function checkDisk() {
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
        const result = (0, child_process_1.spawnSync)(getPowerShellCommand(), [
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
        }
        catch {
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
        let status = 'healthy';
        const freeGB = sizeRemainingMB / 1024;
        if (freeGB < 1) { // Less than 1 GB
            status = 'unhealthy';
        }
        else if (freeGB < 5) { // Less than 5 GB
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
    }
    catch (error) {
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
async function healthCheckEndpoint(_req, res) {
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
        let overallStatus;
        if (statuses.includes('unhealthy')) {
            overallStatus = 'unhealthy';
        }
        else if (statuses.includes('degraded')) {
            overallStatus = 'degraded';
        }
        else {
            overallStatus = 'healthy';
        }
        const uptime = Math.round((Date.now() - startTime) / 1000);
        const checkDuration = Date.now() - checkStart;
        // Add instance information (Phase 5b.4)
        let instanceInfo;
        try {
            const instanceConfig = (0, instanceConfig_1.getInstanceConfig)();
            if (instanceConfig.isClusterMode()) {
                const info = instanceConfig.getInstanceInfo();
                instanceInfo = {
                    instanceId: info.instanceId,
                    role: info.role,
                    status: info.status,
                    isPrimary: instanceConfig.isPrimary()
                };
            }
        }
        catch (error) {
            logger_1.default.debug('Instance info not available in health check');
        }
        const healthStatus = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime,
            checks,
            version: API_VERSION,
            environment: process.env.NODE_ENV || 'development',
            instance: instanceInfo
        };
        // Log health check result
        logger_1.default.info('Health check completed', {
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
    }
    catch (error) {
        logger_1.default.error('Health check failed', {
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
function livelinessProbe(_req, res) {
    res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: Math.round((Date.now() - startTime) / 1000)
    });
}
/**
 * Readiness check (for orchestrators)
 */
async function readinessProbe(_req, res) {
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
    }
    catch (error) {
        res.status(503).json({
            ready: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
//# sourceMappingURL=healthcheck.js.map