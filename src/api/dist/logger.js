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
const winston_1 = __importDefault(require("winston"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Ensure logs directory exists
const logsDir = process.env.LOG_DIRECTORY || 'logs';
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}
/**
 * Cleanup old log files to maintain log rotation
 */
function cleanOldLogs() {
    const maxDays = 14;
    try {
        const files = fs.readdirSync(logsDir);
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(logsDir, file);
            const stats = fs.statSync(filePath);
            const ageInDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
            if (ageInDays > maxDays && file.endsWith('.log')) {
                fs.unlinkSync(filePath);
                console.log(`Archived log file: ${file}`);
            }
        });
    }
    catch (error) {
        console.error('Error cleaning old logs:', error);
    }
}
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.splat(), winston_1.default.format.json()),
    defaultMeta: { service: 'flashdb-api', environment: process.env.NODE_ENV || 'development' },
    transports: [
        // Error logs (level: error only)
        new winston_1.default.transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 14,
            format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json())
        }),
        // Combined logs (all levels)
        new winston_1.default.transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5242880, // 5MB
            maxFiles: 14,
            format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.json())
        })
    ],
    exceptionHandlers: [
        new winston_1.default.transports.File({
            filename: path.join(logsDir, 'exceptions.log'),
            format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.json())
        })
    ],
    rejectionHandlers: [
        new winston_1.default.transports.File({
            filename: path.join(logsDir, 'rejections.log'),
            format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.json())
        })
    ]
});
// Console logging in development
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston_1.default.transports.Console({
        format: winston_1.default.format.combine(winston_1.default.format.colorize(), winston_1.default.format.printf(({ level, message, timestamp, ...meta }) => {
            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            return `${timestamp} [${level}]: ${message} ${metaStr}`;
        }))
    }));
}
exports.default = logger;
//# sourceMappingURL=logger.js.map