/**
 * Initialize the database schema
 * Runs SQL schema file to create tables if they don't exist
 */
export declare function initializeDatabaseSchema(): Promise<void>;
/**
 * Check if database tables exist
 */
export declare function checkDatabaseTables(): Promise<boolean>;
/**
 * Get database information
 */
export declare function getDatabaseInfo(): Promise<any>;
//# sourceMappingURL=init.d.ts.map