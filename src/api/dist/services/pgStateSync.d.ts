export type StateChangeCallback = (key: string, value: any) => void;
/**
 * PostgreSQL-backed state synchronization service
 * Enables eventually-consistent state sharing between API instances
 * Features:
 * - Publish state changes to database
 * - Subscribe to state changes (polling-based)
 * - Eventually consistent synchronization
 * - Multi-instance awareness
 */
export declare class PgStateSync {
    private stateManager;
    private subscriptions;
    private syncInterval;
    private readonly SYNC_INTERVAL_MS;
    private lastSyncTime;
    private isInitialized;
    constructor();
    initialize(): Promise<void>;
    /**
     * Publish a state change
     * Writes to database and notifies all instances
     */
    publishStateChange(key: string, value: any): Promise<void>;
    /**
     * Subscribe to state changes
     * Callback is invoked when state changes across any instance
     * Pattern matching: "clone:*" matches "clone:123", "clone:456", etc.
     */
    subscribeToChanges(pattern: string, callback: StateChangeCallback): Promise<void>;
    /**
     * Unsubscribe from state changes
     */
    unsubscribeFromChanges(pattern: string, callback?: StateChangeCallback): void;
    /**
     * Manually sync state
     * Checks database for changes and notifies subscribers
     */
    syncState(): Promise<void>;
    /**
     * Get matching patterns for a key
     * Supports wildcard patterns like "clone:*"
     */
    private getMatchingPatterns;
    /**
     * Notify local subscribers immediately
     */
    private notifyLocalSubscribers;
    /**
     * Start periodic synchronization
     */
    private startSync;
    /**
     * Stop synchronization
     */
    private stopSync;
    /**
     * Graceful shutdown
     */
    shutdown(): Promise<void>;
    /**
     * Get subscription statistics
     */
    getStats(): {
        totalPatterns: number;
        totalCallbacks: number;
        patterns: Record<string, number>;
    };
    /**
     * Check if syncing is active
     */
    isSyncing(): boolean;
}
/**
 * Get or create the global state sync instance
 */
export declare function getPgStateSync(): PgStateSync;
/**
 * Initialize the state sync service
 */
export declare function initializePgStateSync(): Promise<PgStateSync>;
//# sourceMappingURL=pgStateSync.d.ts.map