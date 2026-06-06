import { Task, TaskStatus, TaskType } from './taskQueue';
/**
 * PostgreSQL-backed queue manager
 * Wraps the in-memory taskQueue with persistent SQL Server backing for durability across restarts.
 *
 * Dual-write pattern:
 * 1. Always write to DB first (ensures data is durable before in-memory operation)
 * 2. Then update in-memory queue
 * 3. On startup, load pending/processing tasks from DB
 * 4. Archive completed/failed tasks to separate table for audit trail
 *
 * This ensures no task is lost even if the API crashes between memory operation and disk save.
 */
export declare class PgQueueManager {
    private instanceId;
    private initialized;
    constructor();
    /**
     * Initialize the queue manager
     * Ensures table exists and loads any pending tasks from DB on startup
     */
    initialize(): Promise<void>;
    /**
     * Ensure queue tables exist (called during init if schema not yet created)
     */
    private ensureTablesExist;
    /**
     * Enqueue a task with DB persistence
     * Dual-write: DB first (for durability), then memory
     */
    enqueueWithPersistence(type: TaskType, payload: Record<string, any>): Promise<Task>;
    /**
     * Dequeue a task with DB persistence
     * Updates status to 'processing' in both DB and memory
     */
    dequeueWithPersistence(): Promise<Task | null>;
    /**
     * Update task status with DB persistence
     * Updates status in both DB and memory
     */
    updateTaskStatus(id: string, status: TaskStatus, error?: string, result?: any): Promise<void>;
    /**
     * Load pending/processing tasks from DB on startup
     * Recovers any tasks that were interrupted by a crash
     */
    loadQueueFromDB(): Promise<Task[]>;
    /**
     * Archive completed/failed tasks to archive table
     * Keeps the main queue table lean and enables audit trail queries
     */
    archiveTaskAsync(taskId: string): Promise<void>;
    /**
     * Archive old completed tasks in batch (called periodically)
     * Keeps the queue table performant by removing old tasks
     */
    archiveOldTasks(olderThanDays?: number): Promise<number>;
    /**
     * Get queue statistics from DB
     */
    getQueueStats(): Promise<{
        pending: number;
        processing: number;
        totalQueued: number;
    }>;
    /**
     * Check if instance owns a task (for recovery on crash)
     */
    isInstanceOwner(taskId: string): Promise<boolean>;
    /**
     * Get the instance ID
     */
    getInstanceId(): string;
    /**
     * Check if initialized
     */
    isInitialized(): boolean;
}
/**
 * Get or create the singleton PgQueueManager instance
 */
export declare function getPgQueueManager(): PgQueueManager;
/**
 * Initialize the PgQueueManager
 * Must be called before using the queue manager
 */
export declare function initializePgQueueManager(): Promise<PgQueueManager>;
/**
 * Reset the queue manager (for testing)
 */
export declare function resetPgQueueManagerForTesting(): void;
//# sourceMappingURL=pgQueueManager.d.ts.map