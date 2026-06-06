import { getPgStateManager, PgStateManager } from './pgStateManager';
import logger from '../logger';

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
export class PgStateSync {
  private stateManager: PgStateManager;
  private subscriptions: Map<string, StateChangeCallback[]> = new Map();
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 5000; // 5 seconds
  private lastSyncTime: Record<string, number> = {};
  private isInitialized = false;

  constructor() {
    this.stateManager = getPgStateManager();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('PgStateSync already initialized');
      return;
    }

    try {
      await this.stateManager.initialize();
      this.isInitialized = true;
      logger.info('PgStateSync initialized');
    } catch (error: any) {
      logger.error(`Failed to initialize PgStateSync: ${error.message}`);
      throw error;
    }
  }

  /**
   * Publish a state change
   * Writes to database and notifies all instances
   */
  async publishStateChange(key: string, value: any): Promise<void> {
    try {
      // Write to database
      await this.stateManager.setState(key, value);

      // Notify local subscribers
      this.notifyLocalSubscribers(key, value);

      logger.debug(`State change published: ${key}`);
    } catch (error: any) {
      logger.error(`Failed to publish state change ${key}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Subscribe to state changes
   * Callback is invoked when state changes across any instance
   * Pattern matching: "clone:*" matches "clone:123", "clone:456", etc.
   */
  async subscribeToChanges(pattern: string, callback: StateChangeCallback): Promise<void> {
    try {
      // Store subscription
      if (!this.subscriptions.has(pattern)) {
        this.subscriptions.set(pattern, []);
      }
      this.subscriptions.get(pattern)!.push(callback);

      // Start sync if not already running
      if (!this.syncInterval) {
        this.startSync();
      }

      logger.debug(`Subscribed to state changes: ${pattern}`);
    } catch (error: any) {
      logger.error(`Failed to subscribe to changes ${pattern}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Unsubscribe from state changes
   */
  unsubscribeFromChanges(pattern: string, callback?: StateChangeCallback): void {
    if (!callback) {
      // Remove all subscribers for pattern
      this.subscriptions.delete(pattern);
    } else {
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

    logger.debug(`Unsubscribed from state changes: ${pattern}`);
  }

  /**
   * Manually sync state
   * Checks database for changes and notifies subscribers
   */
  async syncState(): Promise<void> {
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
              } catch (error: any) {
                logger.warn(`Callback error for ${pattern}: ${error.message}`);
              }
            });
          }
        }

        // Update last sync time
        this.lastSyncTime[key] = Date.now();
      }

      logger.debug('State sync completed');
    } catch (error: any) {
      logger.error(`Failed to sync state: ${error.message}`);
    }
  }

  /**
   * Get matching patterns for a key
   * Supports wildcard patterns like "clone:*"
   */
  private getMatchingPatterns(key: string): string[] {
    const patterns: string[] = [];

    for (const pattern of this.subscriptions.keys()) {
      if (pattern === key) {
        // Exact match
        patterns.push(pattern);
      } else if (pattern.endsWith(':*')) {
        // Prefix match
        const prefix = pattern.slice(0, -2);
        if (key.startsWith(prefix + ':')) {
          patterns.push(pattern);
        }
      } else if (pattern === '*') {
        // Match all
        patterns.push(pattern);
      }
    }

    return patterns;
  }

  /**
   * Notify local subscribers immediately
   */
  private notifyLocalSubscribers(key: string, value: any): void {
    const matchingPatterns = this.getMatchingPatterns(key);

    for (const pattern of matchingPatterns) {
      const callbacks = this.subscriptions.get(pattern) || [];
      for (const callback of callbacks) {
        // Call asynchronously
        setImmediate(() => {
          try {
            callback(key, value);
          } catch (error: any) {
            logger.warn(`Callback error for ${pattern}: ${error.message}`);
          }
        });
      }
    }
  }

  /**
   * Start periodic synchronization
   */
  private startSync(): void {
    if (this.syncInterval) {
      return;
    }

    this.syncInterval = setInterval(async () => {
      try {
        if (this.subscriptions.size > 0) {
          await this.syncState();
        }
      } catch (error: any) {
        logger.warn(`Sync error: ${error.message}`);
      }
    }, this.SYNC_INTERVAL_MS);

    // Ensure interval doesn't block process exit
    if (this.syncInterval && typeof this.syncInterval === 'object' && 'unref' in this.syncInterval) {
      (this.syncInterval as any).unref();
    }

    logger.debug('State sync started (5 second interval)');
  }

  /**
   * Stop synchronization
   */
  private stopSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.debug('State sync stopped');
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    try {
      this.stopSync();
      this.subscriptions.clear();
      this.lastSyncTime = {};
      this.isInitialized = false;
      logger.info('PgStateSync shut down successfully');
    } catch (error: any) {
      logger.error(`Error shutting down PgStateSync: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get subscription statistics
   */
  getStats(): {
    totalPatterns: number;
    totalCallbacks: number;
    patterns: Record<string, number>;
  } {
    const patterns: Record<string, number> = {};
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
  isSyncing(): boolean {
    return this.syncInterval !== null && this.subscriptions.size > 0;
  }
}

// Singleton instance
let stateSyncInstance: PgStateSync;

/**
 * Get or create the global state sync instance
 */
export function getPgStateSync(): PgStateSync {
  if (!stateSyncInstance) {
    stateSyncInstance = new PgStateSync();
  }
  return stateSyncInstance;
}

/**
 * Initialize the state sync service
 */
export async function initializePgStateSync(): Promise<PgStateSync> {
  stateSyncInstance = new PgStateSync();
  await stateSyncInstance.initialize();
  return stateSyncInstance;
}
