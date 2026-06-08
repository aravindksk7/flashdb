/**
 * Clone data model
 */
export interface CloneData {
    id: string;
    goldenImageId: string;
    cloneName: string;
    instancePath: string;
    storagePath: string;
    status: string;
    databaseType?: string;
    databaseName?: string;
    compressionEnabled: boolean;
    createdAt: Date;
    updatedAt: Date;
    size?: number;
    lastModified?: Date;
}
/**
 * Checkpoint data model
 */
export interface CheckpointData {
    id: string;
    cloneId: string;
    checkpointName: string;
    phase: string;
    description?: string;
    isFavorite: boolean;
    labels: string[];
    createdAt: Date;
    restoredAt?: Date;
    size?: number;
}
/**
 * Operation metric data model
 */
export interface OperationMetricData {
    id: string;
    operationType: string;
    targetId: string;
    status: string;
    startedAt: Date;
    completedAt?: Date;
    durationMs: number;
    errorMessage?: string;
}
/**
 * Clone Repository - CRUD operations for clones
 */
export declare class CloneRepository {
    private sqlClient;
    /**
     * Create a new clone record
     */
    create(clone: Omit<CloneData, 'id' | 'createdAt' | 'updatedAt'>): Promise<CloneData>;
    /**
     * Get clone by ID
     */
    getById(id: string): Promise<CloneData | null>;
    /**
     * Get all clones
     */
    getAll(): Promise<CloneData[]>;
    /**
     * Get clones by golden image ID
     */
    getByGoldenImageId(goldenImageId: string): Promise<CloneData[]>;
    /**
     * Update clone
     */
    update(id: string, updates: Partial<CloneData>): Promise<void>;
    /**
     * Delete clone
     */
    delete(id: string): Promise<void>;
    /**
     * Get clones by status
     */
    getByStatus(status: string): Promise<CloneData[]>;
}
/**
 * Checkpoint Operation data model
 */
export interface CheckpointOperationData {
    id: string;
    checkpointId: string;
    cloneId: string;
    operationType: 'create' | 'restore' | 'delete';
    status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'rolled-back';
    vhdxPath: string;
    backupVhdxPath?: string;
    databaseCheckpointLsn?: string;
    preVhdxStateHash?: string;
    postVhdxStateHash?: string;
    validationStatus?: 'pending' | 'passed' | 'failed';
    validationError?: string;
    startedAt: Date;
    completedAt?: Date;
    errorMessage?: string;
    rollbackPath?: string;
}
/**
 * Checkpoint Repository - CRUD operations for checkpoints
 */
export declare class CheckpointRepository {
    private sqlClient;
    /**
     * Create a new checkpoint record
     */
    create(checkpoint: Omit<CheckpointData, 'id' | 'createdAt'>): Promise<CheckpointData>;
    /**
     * Query child checkpoint count
     */
    queryChildCheckpointCount(checkpointId: string): Promise<number>;
    /**
     * Query child checkpoints (recursive CTE for full hierarchy)
     */
    queryChildCheckpoints(checkpointId: string): Promise<any[]>;
    /**
     * Mark checkpoints as orphaned (recursive)
     */
    markCheckpointsAsOrphaned(checkpointId: string): Promise<number>;
    /**
     * Get checkpoint by ID
     */
    getById(id: string): Promise<CheckpointData | null>;
    /**
     * Get checkpoints by clone ID
     */
    getByCloneId(cloneId: string): Promise<CheckpointData[]>;
    /**
     * Update checkpoint
     */
    update(id: string, updates: Partial<CheckpointData>): Promise<void>;
    /**
     * Update checkpoint restored timestamp
     */
    markAsRestored(id: string, restoredAt?: Date): Promise<void>;
    /**
     * Delete checkpoint
     */
    delete(id: string): Promise<void>;
    /**
     * Parse checkpoint data from database
     */
    private parseCheckpoint;
}
/**
 * Metrics Repository - Query aggregated statistics
 */
export declare class MetricsRepository {
    private sqlClient;
    /**
     * Get overview metrics
     */
    getOverview(): Promise<any>;
    /**
     * Get clone creation statistics
     */
    getCloneStats(): Promise<any>;
    /**
     * Get storage metrics
     */
    getStorageMetrics(): Promise<any>;
    /**
     * Get operation metrics
     */
    getOperationMetrics(): Promise<any>;
    /**
     * Get timeline data for the last N hours
     */
    getTimelineData(hoursBack?: number): Promise<any>;
}
/**
 * Checkpoint Operation Repository - Track all checkpoint operations for audit
 */
export declare class CheckpointOperationRepository {
    private sqlClient;
    /**
     * Create a new checkpoint operation record
     */
    create(checkpointId: string, cloneId: string, operationType: 'create' | 'restore' | 'delete', vhdxPath: string): Promise<CheckpointOperationData>;
    /**
     * Update checkpoint operation status
     */
    update(operationId: string, status: string, completedAt?: Date, errorMessage?: string, postVhdxStateHash?: string, validationStatus?: string): Promise<boolean>;
    /**
     * Get operation by ID
     */
    getOperation(operationId: string): Promise<CheckpointOperationData | null>;
    /**
     * Get latest operation for checkpoint
     */
    getLatestOperation(checkpointId: string): Promise<CheckpointOperationData | null>;
    /**
     * List operations for clone
     */
    listOperations(cloneId: string, operationType?: string, status?: string, limit?: number): Promise<CheckpointOperationData[]>;
    /**
     * Get failed operations from last N minutes
     */
    getFailedOperations(sinceMinutesAgo?: number): Promise<CheckpointOperationData[]>;
}
/**
 * Search Repository - Full-text search operations
 */
export declare class SearchRepository {
    private sqlClient;
    /**
     * Search clones by name
     */
    searchClones(query: string): Promise<CloneData[]>;
    /**
     * Search checkpoints
     */
    searchCheckpoints(query: string): Promise<CheckpointData[]>;
    /**
     * Advanced search with multiple criteria
     */
    advancedSearch(criteria: Record<string, any>): Promise<any[]>;
}
/**
 * Get clone repository instance
 */
export declare function getCloneRepository(): CloneRepository;
/**
 * Get checkpoint repository instance
 */
export declare function getCheckpointRepository(): CheckpointRepository;
/**
 * Get checkpoint operation repository instance
 */
export declare function getCheckpointOperationRepository(): CheckpointOperationRepository;
/**
 * Get metrics repository instance
 */
export declare function getMetricsRepository(): MetricsRepository;
/**
 * Get search repository instance
 */
export declare function getSearchRepository(): SearchRepository;
//# sourceMappingURL=repository.d.ts.map