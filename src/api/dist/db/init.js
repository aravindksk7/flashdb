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
exports.initializeDatabaseSchema = initializeDatabaseSchema;
exports.initializeQueueSchema = initializeQueueSchema;
exports.initializeStateSchema = initializeStateSchema;
exports.checkDatabaseTables = checkDatabaseTables;
exports.checkStateManagementTables = checkStateManagementTables;
exports.initializeInstanceSchema = initializeInstanceSchema;
exports.initializeRbacSchema = initializeRbacSchema;
exports.getDatabaseInfo = getDatabaseInfo;
const sqlClient_1 = require("../services/sqlClient");
const logger_1 = __importDefault(require("../logger"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Initialize the database schema
 * Runs SQL schema file to create tables if they don't exist
 */
async function initializeDatabaseSchema() {
    try {
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        // Read main schema file
        const schemaPath = path.join(__dirname, 'schema.sql');
        if (!fs.existsSync(schemaPath)) {
            logger_1.default.error(`Schema file not found: ${schemaPath}`);
            throw new Error(`Database schema file not found at ${schemaPath}`);
        }
        const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');
        // Split by GO statements and execute each batch
        const batches = schemaSQL.split(/\nGO\n/i);
        for (const batch of batches) {
            const trimmedBatch = batch.trim();
            if (trimmedBatch.length > 0) {
                try {
                    await sqlClient.execute(trimmedBatch);
                }
                catch (error) {
                    // Ignore errors about objects that already exist
                    if (!error.message.includes('already exists') &&
                        !error.message.includes('FOREIGN KEY constraint')) {
                        logger_1.default.warn(`Schema execution warning: ${error.message}`);
                    }
                }
            }
        }
        logger_1.default.info('Database schema initialized successfully');
        // Initialize state management schema (Phase 5b.1)
        await initializeStateSchema();
        // Initialize queue schema (Phase 5b.3)
        await initializeQueueSchema();
        // Initialize instance schema (Phase 5b.4)
        await initializeInstanceSchema();
        // Initialize RBAC schema (Phase 5b.5)
        await initializeRbacSchema();
    }
    catch (error) {
        logger_1.default.error(`Error initializing database schema: ${error.message}`);
        throw error;
    }
}
/**
 * Initialize the queue management schema
 * Creates tables for persistent task queue if they don't exist
 */
async function initializeQueueSchema() {
    try {
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        // Read queue schema file
        const queueSchemaPath = path.join(__dirname, 'queueSchema.sql');
        if (!fs.existsSync(queueSchemaPath)) {
            logger_1.default.warn(`Queue schema file not found: ${queueSchemaPath}. Queue persistence tables may need manual creation.`);
            return;
        }
        const queueSchemaSQL = fs.readFileSync(queueSchemaPath, 'utf-8');
        // Split by GO statements and execute each batch
        const batches = queueSchemaSQL.split(/\nGO\n/i);
        for (const batch of batches) {
            const trimmedBatch = batch.trim();
            if (trimmedBatch.length > 0) {
                try {
                    await sqlClient.execute(trimmedBatch);
                }
                catch (error) {
                    // Ignore errors about objects that already exist
                    if (!error.message.includes('already exists')) {
                        logger_1.default.warn(`Queue schema execution warning: ${error.message}`);
                    }
                }
            }
        }
        logger_1.default.info('Queue management schema initialized successfully');
    }
    catch (error) {
        logger_1.default.error(`Error initializing queue schema: ${error.message}`);
        // Don't throw - queue persistence is optional and can degrade gracefully
    }
}
/**
 * Initialize the state management schema
 * Creates tables for state, locks, and operations if they don't exist
 */
async function initializeStateSchema() {
    try {
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        // Read state schema file
        const stateSchemaPath = path.join(__dirname, 'stateSchema.sql');
        if (!fs.existsSync(stateSchemaPath)) {
            logger_1.default.warn(`State schema file not found: ${stateSchemaPath}. State management tables may need manual creation.`);
            return;
        }
        const stateSchemaSQL = fs.readFileSync(stateSchemaPath, 'utf-8');
        // Split by GO statements and execute each batch
        const batches = stateSchemaSQL.split(/\nGO\n/i);
        for (const batch of batches) {
            const trimmedBatch = batch.trim();
            if (trimmedBatch.length > 0) {
                try {
                    await sqlClient.execute(trimmedBatch);
                }
                catch (error) {
                    // Ignore errors about objects that already exist
                    if (!error.message.includes('already exists')) {
                        logger_1.default.warn(`State schema execution warning: ${error.message}`);
                    }
                }
            }
        }
        logger_1.default.info('State management schema initialized successfully');
    }
    catch (error) {
        logger_1.default.error(`Error initializing state schema: ${error.message}`);
        // Don't throw - state management is optional and can degrade gracefully
    }
}
/**
 * Check if database tables exist
 */
async function checkDatabaseTables() {
    try {
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        const sql = `
      SELECT COUNT(*) as tableCount
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME IN ('Clones', 'Checkpoints', 'GoldenImages', 'OperationMetrics')
    `;
        const result = await sqlClient.query(sql);
        const tableCount = result.recordset[0]?.tableCount ?? 0;
        // We expect all 4 tables to exist
        return tableCount === 4;
    }
    catch (error) {
        logger_1.default.error(`Error checking database tables: ${error.message}`);
        return false;
    }
}
/**
 * Check if state management tables exist
 */
async function checkStateManagementTables() {
    try {
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        const sql = `
      SELECT COUNT(*) as tableCount
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME IN ('flashdb_state', 'flashdb_locks', 'flashdb_operations')
    `;
        const result = await sqlClient.query(sql);
        const tableCount = result.recordset[0]?.tableCount ?? 0;
        // We expect all 3 state tables to exist
        return tableCount === 3;
    }
    catch (error) {
        logger_1.default.error(`Error checking state management tables: ${error.message}`);
        return false;
    }
}
/**
 * Initialize the instance cluster schema
 * Creates tables for multi-instance deployment if they don't exist
 */
async function initializeInstanceSchema() {
    try {
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        // Read instance schema file
        const instanceSchemaPath = path.join(__dirname, 'instanceSchema.sql');
        if (!fs.existsSync(instanceSchemaPath)) {
            logger_1.default.warn(`Instance schema file not found: ${instanceSchemaPath}. Multi-instance tables may need manual creation.`);
            return;
        }
        const instanceSchemaSQL = fs.readFileSync(instanceSchemaPath, 'utf-8');
        // Split by GO statements and execute each batch
        const batches = instanceSchemaSQL.split(/\nGO\n/i);
        for (const batch of batches) {
            const trimmedBatch = batch.trim();
            if (trimmedBatch.length > 0) {
                try {
                    await sqlClient.execute(trimmedBatch);
                }
                catch (error) {
                    // Ignore errors about objects that already exist
                    if (!error.message.includes('already exists')) {
                        logger_1.default.warn(`Instance schema execution warning: ${error.message}`);
                    }
                }
            }
        }
        logger_1.default.info('Instance cluster schema initialized successfully');
    }
    catch (error) {
        logger_1.default.error(`Error initializing instance schema: ${error.message}`);
        // Don't throw - instance management is optional and can degrade gracefully
    }
}
/**
 * Initialize the RBAC schema
 * Creates tables for user management, roles, permissions, and access control
 */
async function initializeRbacSchema() {
    try {
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        // Read RBAC schema file
        const rbacSchemaPath = path.join(__dirname, 'rbacSchema.sql');
        if (!fs.existsSync(rbacSchemaPath)) {
            logger_1.default.warn(`RBAC schema file not found: ${rbacSchemaPath}. RBAC tables may need manual creation.`);
            return;
        }
        const rbacSchemaSQL = fs.readFileSync(rbacSchemaPath, 'utf-8');
        // Split by GO statements and execute each batch
        const batches = rbacSchemaSQL.split(/\nGO\n/i);
        for (const batch of batches) {
            const trimmedBatch = batch.trim();
            if (trimmedBatch.length > 0) {
                try {
                    await sqlClient.execute(trimmedBatch);
                }
                catch (error) {
                    // Ignore errors about objects that already exist
                    if (!error.message.includes('already exists')) {
                        logger_1.default.warn(`RBAC schema execution warning: ${error.message}`);
                    }
                }
            }
        }
        logger_1.default.info('RBAC schema initialized successfully');
    }
    catch (error) {
        logger_1.default.error(`Error initializing RBAC schema: ${error.message}`);
        // Don't throw - RBAC is optional and can degrade gracefully
    }
}
/**
 * Get database information
 */
async function getDatabaseInfo() {
    try {
        const sqlClient = (0, sqlClient_1.getSqlClient)();
        const sql = `
      SELECT
        DB_NAME() as databaseName,
        COUNT(*) as tableCount,
        ISNULL(SUM(CAST(p.rows AS BIGINT)), 0) as totalRows
      FROM INFORMATION_SCHEMA.TABLES t
      LEFT JOIN sys.partitions p ON p.object_id = OBJECT_ID(t.TABLE_SCHEMA + '.' + t.TABLE_NAME)
      WHERE TABLE_SCHEMA = 'dbo'
      GROUP BY DB_NAME()
    `;
        const result = await sqlClient.query(sql);
        return result.recordset[0] || {};
    }
    catch (error) {
        logger_1.default.error(`Error getting database info: ${error.message}`);
        throw error;
    }
}
//# sourceMappingURL=init.js.map