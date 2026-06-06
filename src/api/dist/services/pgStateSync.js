"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PgStateSync = void 0;
exports.getPgStateSync = getPgStateSync;
exports.initializePgStateSync = initializePgStateSync;
const pgStateManager_1 = require("./pgStateManager");
const logger_1 = __importDefault(require("../logger"));
/**
 * PostgreSQL-backed state synchronization service
 * Enables eventually-consistent state sharing between API instances
 * Features:
 * - Publish state changes to database
 * - Subscribe to state changes (polling-based)
 * - Eventually consistent synchronization
 * - Multi-instance awareness
 */
class PgStateSync {
    constructor() {
        this.subscriptions = new Map();
        this.syncInterval = null;
        this.SYNC_INTERVAL_MS = 5000; // 5 seconds
        this.lastSyncTime = {};
        this.isInitialized = false;
        this.stateManager = (0, pgStateManager_1.getPgStateManager)();
    }
    async initialize() {
        if (this.isInitialized) {
            logger_1.default.debug('PgStateSync already initialized');
            return;
        }
        try {
            await this.stateManager.initialize();
            this.isInitialized = true;
            logger_1.default.info('PgStateSync initialized');
        }
        catch (error) {
            logger_1.default.error(`Failed to initialize PgStateSync: ${error.message}`);
            throw error;
        }
    }
    /**
     * Publish a state change
     * Writes to database and notifies all instances
     */
    async publishStateChange(key, value) {
        try {
            // Write to database
            await this.stateManager.setState(key, value);
            // Notify local subscribers
            this.notifyLocalSubscribers(key, value);
            logger_1.default.debug(`State change published: ${key}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to publish state change ${key}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Subscribe to state changes
     * Callback is invoked when state changes across any instance
     * Pattern matching: "clone:*" matches "clone:123", "clone:456", etc.
     */
    async subscribeToChanges(pattern, callback) {
        try {
            // Store subscription
            if (!this.subscriptions.has(pattern)) {
                this.subscriptions.set(pattern, []);
            }
            this.subscriptions.get(pattern).push(callback);
            // Start sync if not already running
            if (!this.syncInterval) {
                this.startSync();
            }
            logger_1.default.debug(`Subscribed to state changes: ${pattern}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to subscribe to changes ${pattern}: ${error.message}`);
            throw error;
        }
    }
    /**
     * Unsubscribe from state changes
     */
    unsubscribeFromChanges(pattern, callback) {
        if (!callback) {
            // Remove all subscribers for pattern
            this.subscriptions.delete(pattern);
        }
        else {
            // Remove specific callback
            const callbacks = this.subscriptions.get(pattern);
            if (callbacks) {
                const index = callbacks.indexOf(callback);
                if (index > -1) {
                    callbacks.splice(index, 1);
                }
                if (callbacks.length === 0) {
                    this.subscriptions.delete(pattern);
                }
            }
        }
        logger_1.default.debug(`Unsubscribed from state changes: ${pattern}`);
    }
    /**
     * Manually sync state
     * Checks database for changes and notifies subscribers
     */
    async syncState() {
        try {
            const allState = await this.stateManager.getAllState();
            for (const [key, value] of Object.entries(allState)) {
                // Check if any subscription pattern matches
                const matchingPatterns = this.getMatchingPatterns(key);
                for (const pattern of matchingPatterns) {
                    const callbacks = this.subscriptions.get(pattern) || [];
                    for (const callback of callbacks) {
                        // Call asynchronously to avoid blocking
                        setImmediate(() => {
                            try {
                                callback(key, value);
                            }
                            catch (error) {
                                logger_1.default.warn(`Callback error for ${pattern}: ${error.message}`);
                            }
                        });
                    }
                }
                // Update last sync time
                this.lastSyncTime[key] = Date.now();
            }
            logger_1.default.debug('State sync completed');
        }
        catch (error) {
            logger_1.default.error(`Failed to sync state: ${error.message}`);
        }
    }
    /**
     * Get matching patterns for a key
     * Supports wildcard patterns like "clone:*"
     */
    getMatchingPatterns(key) {
        const patterns = [];
        for (const pattern of this.subscriptions.keys()) {
            if (pattern === key) {
                // Exact match
                patterns.push(pattern);
            }
            else if (pattern.endsWith(':*')) {
                // Prefix match
                const prefix = pattern.slice(0, -2);
                if (key.startsWith(prefix + ':')) {
                    patterns.push(pattern);
                }
            }
            else if (pattern === '*') {
                // Match all
                patterns.push(pattern);
            }
        }
        return patterns;
    }
    /**
     * Notify local subscribers immediately
     */
    notifyLocalSubscribers(key, value) {
        const matchingPatterns = this.getMatchingPatterns(key);
        for (const pattern of matchingPatterns) {
            const callbacks = this.subscriptions.get(pattern) || [];
            for (const callback of callbacks) {
                // Call asynchronously
                setImmediate(() => {
                    try {
                        callback(key, value);
                    }
                    catch (error) {
                        logger_1.default.warn(`Callback error for ${pattern}: ${error.message}`);
                    }
                });
            }
        }
    }
    /**
     * Start periodic synchronization
     */
    startSync() {
        if (this.syncInterval) {
            return;
        }
        this.syncInterval = setInterval(async () => {
            try {
                if (this.subscriptions.size > 0) {
                    await this.syncState();
                }
            }
            catch (error) {
                logger_1.default.warn(`Sync error: ${error.message}`);
            }
        }, this.SYNC_INTERVAL_MS);
        // Ensure interval doesn't block process exit
        if (this.syncInterval && typeof this.syncInterval === 'object' && 'unref' in this.syncInterval) {
            this.syncInterval.unref();
        }
        logger_1.default.debug('State sync started (5 second interval)');
    }
    /**
     * Stop synchronization
     */
    stopSync() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            logger_1.default.debug('State sync stopped');
        }
    }
    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            this.stopSync();
            this.subscriptions.clear();
            this.lastSyncTime = {};
            this.isInitialized = false;
            logger_1.default.info('PgStateSync shut down successfully');
        }
        catch (error) {
            logger_1.default.error(`Error shutting down PgStateSync: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get subscription statistics
     */
    getStats() {
        const patterns = {};
        let totalCallbacks = 0;
        for (const [pattern, callbacks] of this.subscriptions) {
            patterns[pattern] = callbacks.length;
            totalCallbacks += callbacks.length;
        }
        return {
            totalPatterns: this.subscriptions.size,
            totalCallbacks,
            patterns
        };
    }
    /**
     * Check if syncing is active
     */
    isSyncing() {
        return this.syncInterval !== null && this.subscriptions.size > 0;
    }
}
exports.PgStateSync = PgStateSync;
// Singleton instance
let stateSyncInstance;
/**
 * Get or create the global state sync instance
 */
function getPgStateSync() {
    if (!stateSyncInstance) {
        stateSyncInstance = new PgStateSync();
    }
    return stateSyncInstance;
}
/**
 * Initialize the state sync service
 */
async function initializePgStateSync() {
    stateSyncInstance = new PgStateSync();
    await stateSyncInstance.initialize();
    return stateSyncInstance;
}
//# sourceMappingURL=pgStateSync.js.map