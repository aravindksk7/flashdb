import { Request, Response, NextFunction } from 'express';
import NodeCache from 'node-cache';
import crypto from 'crypto';
import logger from '../logger';

// Initialize cache with 10 minute standard TTL
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

// Cache metrics
interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  invalidations: number;
  memoryUsage: number;
}

const metrics: CacheMetrics = {
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0,
  memoryUsage: 0
};

/**
 * Generate cache key from request
 * Format: {method}:{path}:{queryHash}
 */
export function getCacheKey(req: Request): string {
  const method = req.method;
  const path = req.path;
  const query = JSON.stringify(req.query);
  const queryHash = crypto.createHash('md5').update(query).digest('hex');

  return `${method}:${path}:${queryHash}`;
}

/**
 * Determine TTL based on endpoint
 */
function getTTL(path: string): number {
  // Clone/checkpoint queries: 30 seconds
  if (path.includes('/clones') || path.includes('/checkpoints')) {
    return 30;
  }
  // Metrics endpoints: 5 minutes
  if (path.includes('/metrics')) {
    return 300;
  }
  // Golden images: 10 minutes
  if (path.includes('/golden-images')) {
    return 600;
  }
  // Default: 10 minutes
  return 600;
}

/**
 * Main caching middleware
 * Only caches GET requests with successful responses
 */
export function cacheMiddleware(req: Request, res: Response, next: NextFunction) {
  // Only cache GET requests
  if (req.method !== 'GET') {
    return next();
  }

  const cacheKey = getCacheKey(req);
  const cachedResponse = cache.get<any>(cacheKey);

  if (cachedResponse) {
    metrics.hits++;
    logger.debug('Cache hit', {
      cacheKey,
      path: req.path,
      hits: metrics.hits,
      misses: metrics.misses
    });

    // Add cache indicator header
    res.setHeader('X-Cache', 'HIT');
    return res.json(cachedResponse);
  }

  metrics.misses++;

  // Capture original send function
  const originalSend = res.send;
  const ttl = getTTL(req.path);

  res.send = function (data) {
    // Cache successful responses (2xx status codes)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const responseData = typeof data === 'string' ? JSON.parse(data) : data;
        cache.set(cacheKey, responseData, ttl);
        metrics.sets++;

        logger.debug('Response cached', {
          cacheKey,
          path: req.path,
          ttl,
          status: res.statusCode
        });
      } catch (error) {
        logger.debug('Failed to cache response', {
          cacheKey,
          error: (error as Error).message
        });
      }
    }

    // Add cache indicator header
    res.setHeader('X-Cache', 'MISS');

    return originalSend.call(this, data);
  };

  next();
}

/**
 * Invalidate cache entries
 * Called on POST/PUT/DELETE/PATCH operations
 */
export function invalidateCache(
  patterns?: string[],
  allCloneRelated?: boolean
): void {
  try {
    const keys = cache.keys();
    let invalidated = 0;

    if (allCloneRelated) {
      // Invalidate all cache entries related to clones/checkpoints/metrics
      const toDelete = keys.filter(
        key =>
          key.includes('/clones') ||
          key.includes('/checkpoints') ||
          key.includes('/metrics') ||
          key.includes('/golden-images')
      );
      toDelete.forEach(key => cache.del(key));
      invalidated = toDelete.length;

      logger.info('Cache invalidated (all clone-related entries)', {
        count: invalidated,
        totalCacheKeys: keys.length
      });
    } else if (patterns && patterns.length > 0) {
      // Invalidate entries matching specific patterns
      const toDelete = keys.filter(key =>
        patterns.some(pattern => key.includes(pattern))
      );
      toDelete.forEach(key => cache.del(key));
      invalidated = toDelete.length;

      logger.info('Cache invalidated (pattern-based)', {
        patterns,
        count: invalidated,
        totalCacheKeys: keys.length
      });
    } else {
      // Clear entire cache
      cache.flushAll();
      invalidated = keys.length;

      logger.info('Cache flushed completely', {
        count: invalidated
      });
    }

    metrics.invalidations++;
    updateMemoryUsage();
  } catch (error) {
    logger.error('Error invalidating cache', {
      error: (error as Error).message
    });
  }
}

/**
 * Update memory usage estimate (rough calculation)
 */
function updateMemoryUsage(): void {
  try {
    const keys = cache.keys();
    let totalSize = 0;

    keys.forEach(key => {
      const value = cache.get(key);
      if (value) {
        totalSize += JSON.stringify(value).length;
      }
    });

    metrics.memoryUsage = totalSize;
  } catch (error) {
    logger.debug('Error calculating memory usage', {
      error: (error as Error).message
    });
  }
}

/**
 * Get cache metrics
 */
export function getCacheMetrics() {
  const keys = cache.keys();
  updateMemoryUsage();

  return {
    ...metrics,
    keys: keys.length,
    estimatedMemoryMB: (metrics.memoryUsage / (1024 * 1024)).toFixed(2),
    hitRate:
      metrics.hits + metrics.misses > 0
        ? (
            (metrics.hits / (metrics.hits + metrics.misses)) *
            100
          ).toFixed(2)
        : '0.00',
    cachedEndpoints: keys
  };
}

/**
 * Clear all cache
 */
export function clearCache(): void {
  cache.flushAll();
  logger.info('Cache cleared');
}

/**
 * Reset cache metrics
 */
export function resetCacheMetrics(): void {
  metrics.hits = 0;
  metrics.misses = 0;
  metrics.sets = 0;
  metrics.invalidations = 0;
  metrics.memoryUsage = 0;
  logger.info('Cache metrics reset');
}
