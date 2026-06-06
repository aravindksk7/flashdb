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

    // Read schema file
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
  } catch (error: any) {
    logger.error(`Error initializing database schema: ${error.message}`);
    throw error;
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
