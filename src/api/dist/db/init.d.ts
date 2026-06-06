/**
 * Initialize the database schema
 * Runs SQL schema file to create tables if they don't exist
 */
export declare function initializeDatabaseSchema(): Promise<void>;
/**
 * Initialize the state management schema
 * Creates tables for state, locks, and operations if they don't exist
 */
export declare function initializeStateSchema(): Promise<void>;
/**
 * Check if database tables exist
 */
export declare function checkDatabaseTables(): Promise<boolean>;
/**
 * Check if state management tables exist
 */
export declare function checkStateManagementTables(): Promise<boolean>;
/**
 * Get database information
 */
export declare function getDatabaseInfo(): Promise<any>;
//# sourceMappingURL=init.d.ts.map