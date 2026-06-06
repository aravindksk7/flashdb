import { getSqlClient } from '../services/sqlClient';
import logger from '../logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Initialize the database schema
 * Runs SQL schema file to create tables if they don't exist
 */
export async function initializeDatabaseSchema(): Promise<void> {
  try {
    const sqlClient = getSqlClient();

    // Read main schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      logger.error(`Schema file not found: ${schemaPath}`);
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
        } catch (error: any) {
          // Ignore errors about objects that already exist
          if (
            !error.message.includes('already exists') &&
            !error.message.includes('FOREIGN KEY constraint')
          ) {
            logger.warn(`Schema execution warning: ${error.message}`);
          }
        }
      }
    }

    logger.info('Database schema initialized successfully');

    // Initialize state management schema (Phase 5b.1)
    await initializeStateSchema();

    // Initialize queue schema (Phase 5b.3)
    await initializeQueueSchema();

    // Initialize instance schema (Phase 5b.4)
    await initializeInstanceSchema();

    // Initialize RBAC schema (Phase 5b.5)
    await initializeRbacSchema();
  } catch (error: any) {
    logger.error(`Error initializing database schema: ${error.message}`);
    throw error;
  }
}

/**
 * Initialize the queue management schema
 * Creates tables for persistent task queue if they don't exist
 */
export async function initializeQueueSchema(): Promise<void> {
  try {
    const sqlClient = getSqlClient();

    // Read queue schema file
    const queueSchemaPath = path.join(__dirname, 'queueSchema.sql');
    if (!fs.existsSync(queueSchemaPath)) {
      logger.warn(`Queue schema file not found: ${queueSchemaPath}. Queue persistence tables may need manual creation.`);
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
        } catch (error: any) {
          // Ignore errors about objects that already exist
          if (!error.message.includes('already exists')) {
            logger.warn(`Queue schema execution warning: ${error.message}`);
          }
        }
      }
    }

    logger.info('Queue management schema initialized successfully');
  } catch (error: any) {
    logger.error(`Error initializing queue schema: ${error.message}`);
    // Don't throw - queue persistence is optional and can degrade gracefully
  }
}

/**
 * Initialize the state management schema
 * Creates tables for state, locks, and operations if they don't exist
 */
export async function initializeStateSchema(): Promise<void> {
  try {
    const sqlClient = getSqlClient();

    // Read state schema file
    const stateSchemaPath = path.join(__dirname, 'stateSchema.sql');
    if (!fs.existsSync(stateSchemaPath)) {
      logger.warn(`State schema file not found: ${stateSchemaPath}. State management tables may need manual creation.`);
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
        } catch (error: any) {
          // Ignore errors about objects that already exist
          if (!error.message.includes('already exists')) {
            logger.warn(`State schema execution warning: ${error.message}`);
          }
        }
      }
    }

    logger.info('State management schema initialized successfully');
  } catch (error: any) {
    logger.error(`Error initializing state schema: ${error.message}`);
    // Don't throw - state management is optional and can degrade gracefully
  }
}

/**
 * Check if database tables exist
 */
export async function checkDatabaseTables(): Promise<boolean> {
  try {
    const sqlClient = getSqlClient();

    const sql = `
      SELECT COUNT(*) as tableCount
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME IN ('Clones', 'Checkpoints', 'GoldenImages', 'OperationMetrics')
    `;

    const result = await sqlClient.query<{ tableCount: number }>(sql);
    const tableCount = result.recordset[0]?.tableCount ?? 0;

    // We expect all 4 tables to exist
    return tableCount === 4;
  } catch (error: any) {
    logger.error(`Error checking database tables: ${error.message}`);
    return false;
  }
}

/**
 * Check if state management tables exist
 */
export async function checkStateManagementTables(): Promise<boolean> {
  try {
    const sqlClient = getSqlClient();

    const sql = `
      SELECT COUNT(*) as tableCount
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME IN ('flashdb_state', 'flashdb_locks', 'flashdb_operations')
    `;

    const result = await sqlClient.query<{ tableCount: number }>(sql);
    const tableCount = result.recordset[0]?.tableCount ?? 0;

    // We expect all 3 state tables to exist
    return tableCount === 3;
  } catch (error: any) {
    logger.error(`Error checking state management tables: ${error.message}`);
    return false;
  }
}

/**
 * Initialize the instance cluster schema
 * Creates tables for multi-instance deployment if they don't exist
 */
export async function initializeInstanceSchema(): Promise<void> {
  try {
    const sqlClient = getSqlClient();

    // Read instance schema file
    const instanceSchemaPath = path.join(__dirname, 'instanceSchema.sql');
    if (!fs.existsSync(instanceSchemaPath)) {
      logger.warn(`Instance schema file not found: ${instanceSchemaPath}. Multi-instance tables may need manual creation.`);
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
        } catch (error: any) {
          // Ignore errors about objects that already exist
          if (!error.message.includes('already exists')) {
            logger.warn(`Instance schema execution warning: ${error.message}`);
          }
        }
      }
    }

    logger.info('Instance cluster schema initialized successfully');
  } catch (error: any) {
    logger.error(`Error initializing instance schema: ${error.message}`);
    // Don't throw - instance management is optional and can degrade gracefully
  }
}

/**
 * Initialize the RBAC schema
 * Creates tables for user management, roles, permissions, and access control
 */
export async function initializeRbacSchema(): Promise<void> {
  try {
    const sqlClient = getSqlClient();

    // Read RBAC schema file
    const rbacSchemaPath = path.join(__dirname, 'rbacSchema.sql');
    if (!fs.existsSync(rbacSchemaPath)) {
      logger.warn(`RBAC schema file not found: ${rbacSchemaPath}. RBAC tables may need manual creation.`);
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
        } catch (error: any) {
          // Ignore errors about objects that already exist
          if (!error.message.includes('already exists')) {
            logger.warn(`RBAC schema execution warning: ${error.message}`);
          }
        }
      }
    }

    logger.info('RBAC schema initialized successfully');
  } catch (error: any) {
    logger.error(`Error initializing RBAC schema: ${error.message}`);
    // Don't throw - RBAC is optional and can degrade gracefully
  }
}

/**
 * Get database information
 */
export async function getDatabaseInfo(): Promise<any> {
  try {
    const sqlClient = getSqlClient();

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

    const result = await sqlClient.query<any>(sql);
    return result.recordset[0] || {};
  } catch (error: any) {
    logger.error(`Error getting database info: ${error.message}`);
    throw error;
  }
}
