import Pool from 'generic-pool';
import NodeCache from 'node-cache';
import logger from '../logger';
import { PowerShellService } from './powershellService';

/**
 * Connection pool metrics interface
 */
export interface PoolMetrics {
  size: number;
  available: number;
  idle: number;
  pending: number;
  totalCreated: number;
  totalDestroyed: number;
  activeConnections: number;
  errorCount: number;
  averageWaitTime: number;
}

/**
 * Generic connection pool for PowerShell service instances
 * Manages connection lifecycle, reuse, and graceful shutdown
 */
export class ConnectionPool {
  private pool: Pool.Pool<PowerShellService>;
  private metrics: {
    totalCreated: number;
    totalDestroyed: number;
    errorCount: number;
    waitTimes: number[];
  } = {
    totalCreated: 0,
    totalDestroyed: 0,
    errorCount: 0,
    waitTimes: []
  };
  private cache: NodeCache;
  private readonly MIN_SIZE = 2;
  private readonly MAX_SIZE = 8;
  private readonly TTL = 300; // 5 minutes in seconds
  private readonly IDLE_TIMEOUT = 600000; // 10 minutes in milliseconds

  constructor() {
    this.cache = new NodeCache({ stdTTL: this.TTL, checkperiod: 60 });

    const factory: Pool.Factory<PowerShellService> = {
      create: async () => {
        logger.debug('Creating new PowerShell service instance');
        this.metrics.totalCreated++;
        return new PowerShellService();
      },
      destroy: async (_instance: PowerShellService) => {
        logger.debug('Destroying PowerShell service instance');
        this.metrics.totalDestroyed++;
      },
      validate: async (_instance: PowerShellService) => {
        // Validate that the instance is still usable
        // PowerShellService is stateless, so always valid
        return true;
      }
    };

    this.pool = Pool.createPool(factory, {
      min: this.MIN_SIZE,
      max: this.MAX_SIZE,
      acquireTimeoutMillis: 30000, // 30 second timeout
      idleTimeoutMillis: this.IDLE_TIMEOUT,
      fifo: true
    });

    logger.info(
      `Connection pool initialized: min=${this.MIN_SIZE}, max=${this.MAX_SIZE}, TTL=${this.TTL}s`
    );
  }

  /**
   * Acquire a connection from the pool
   */
  async acquire(): Promise<PowerShellService> {
    const startTime = Date.now();

    try {
      const connection = await this.pool.acquire();
      const waitTime = Date.now() - startTime;
      this.metrics.waitTimes.push(waitTime);

      // Keep only last 1000 wait times for memory efficiency
      if (this.metrics.waitTimes.length > 1000) {
        this.metrics.waitTimes.shift();
      }

      logger.debug(`Acquired connection from pool (wait: ${waitTime}ms)`);
      return connection;
    } catch (error: any) {
      this.metrics.errorCount++;
      logger.error(`Failed to acquire connection from pool: ${error.message}`);
      throw new Error(`Connection pool exhausted or timeout: ${error.message}`);
    }
  }

  /**
   * Release a connection back to the pool
   */
  async release(connection: PowerShellService): Promise<void> {
    try {
      await this.pool.release(connection);
      logger.debug('Released connection back to pool');
    } catch (error: any) {
      this.metrics.errorCount++;
      logger.error(`Failed to release connection: ${error.message}`);
      // Destroy the connection if release fails
      try {
        await this.pool.destroy(connection);
      } catch (destroyError: any) {
        logger.error(`Failed to destroy connection: ${destroyError.message}`);
      }
    }
  }

  /**
   * Get current pool metrics
   */
  getMetrics(): PoolMetrics {
    const poolSize = this.pool.size;
    const availableCount = this.pool.available;
    const waitingCount = Math.max(0, poolSize - availableCount);

    const avgWaitTime =
      this.metrics.waitTimes.length > 0
        ? this.metrics.waitTimes.reduce((a, b) => a + b, 0) / this.metrics.waitTimes.length
        : 0;

    return {
      size: poolSize,
      available: availableCount,
      idle: availableCount,
      pending: waitingCount,
      totalCreated: this.metrics.totalCreated,
      totalDestroyed: this.metrics.totalDestroyed,
      activeConnections: poolSize - availableCount,
      errorCount: this.metrics.errorCount,
      averageWaitTime: avgWaitTime
    };
  }

  /**
   * Drain the pool and close all connections
   */
  async drain(): Promise<void> {
    try {
      logger.info('Draining connection pool...');
      await this.pool.drain();
      await this.pool.clear();
      this.cache.flushAll();
      logger.info('Connection pool drained successfully');
    } catch (error: any) {
      logger.error(`Error draining connection pool: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cache a value with TTL
   */
  setCache(key: string, value: any, ttl?: number): void {
    this.cache.set(key, value, ttl || this.TTL);
  }

  /**
   * Retrieve a cached value
   */
  getCache<T = any>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  /**
   * Delete a cached value
   */
  delCache(key: string): number {
    return this.cache.del(key);
  }

  /**
   * Clear all cache
   */
  flushCache(): void {
    this.cache.flushAll();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalCreated: 0,
      totalDestroyed: 0,
      errorCount: 0,
      waitTimes: []
    };
  }
}

// Singleton instance
let poolInstance: ConnectionPool;

/**
 * Get or create the global connection pool instance
 */
export function getConnectionPool(): ConnectionPool {
  if (!poolInstance) {
    poolInstance = new ConnectionPool();
  }
  return poolInstance;
}

/**
 * Initialize the connection pool
 */
export function initializeConnectionPool(): ConnectionPool {
  poolInstance = new ConnectionPool();
  return poolInstance;
}

/**
 * Shutdown the connection pool
 */
export async function shutdownConnectionPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.drain();
  }
}
