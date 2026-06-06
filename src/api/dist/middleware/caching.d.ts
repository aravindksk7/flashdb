import { Request, Response, NextFunction } from 'express';
/**
 * Generate cache key from request
 * Format: {method}:{path}:{queryHash}
 */
export declare function getCacheKey(req: Request): string;
/**
 * Main caching middleware
 * Only caches GET requests with successful responses
 */
export declare function cacheMiddleware(req: Request, res: Response, next: NextFunction): void | Response<any, Record<string, any>>;
/**
 * Invalidate cache entries
 * Called on POST/PUT/DELETE/PATCH operations
 */
export declare function invalidateCache(patterns?: string[], allCloneRelated?: boolean): void;
/**
 * Get cache metrics
 */
export declare function getCacheMetrics(): {
    keys: number;
    estimatedMemoryMB: string;
    hitRate: string;
    cachedEndpoints: string[];
    hits: number;
    misses: number;
    sets: number;
    invalidations: number;
    memoryUsage: number;
};
/**
 * Clear all cache
 */
export declare function clearCache(): void;
/**
 * Reset cache metrics
 */
export declare function resetCacheMetrics(): void;
//# sourceMappingURL=caching.d.ts.map