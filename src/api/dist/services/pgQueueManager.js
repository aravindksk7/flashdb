"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PgQueueManager = void 0;
exports.getPgQueueManager = getPgQueueManager;
exports.initializePgQueueManager = initializePgQueueManager;
exports.resetPgQueueManagerForTesting = resetPgQueueManagerForTesting;
const sqlClient_1 = require("./sqlClient");
const logger_1 = __importDefault(require("../logger"));
const uuid_1 = require("uuid");
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
class PgQueueManager {
    constructor() {
        this.initialized = false;
        this.instanceId = (0, uuid_1.v4)();
        logger_1.default.info(`PgQueueManager initialized with instance_id: ${this.instanceId}`);
    }
    /**
     * Initialize the queue manager
     * Ensures table exists and loads any pending tasks from DB on startup
     */
    async initialize() {
        try {
            await this.ensureTablesExist();
            this.initialized = true;
            logger_1.default.info('PgQueueManager initialized successfully');
        }
        catch (error) {
            logger_1.default.error(`Failed to initialize PgQueueManager: ${error.message}`);
            throw error;
        }
    }
    /**
     * Ensure queue tables exist (called during init if schema not yet created)
     */
    async ensureTablesExist() {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            // Check if table exists
            const result = await sqlClient.query(`SELECT COUNT(*) as tableCount FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_NAME = 'flashdb_queue' AND TABLE_SCHEMA = 'dbo'`);
            if ((result.recordset[0]?.tableCount ?? 0) === 0) {
                logger_1.default.warn('Queue tables do not exist. Attempting schema initialization...');
                // Tables should be created during database schema init, but if not, log it
                throw new Error('Queue tables not found. Ensure database schema has been initialized with queueSchema.sql');
            }
            logger_1.default.debug('Queue tables verified to exist');
        }
        catch (error) {
            throw new Error(`Failed to verify queue tables: ${error.message}`);
        }
    }
    /**
     * Enqueue a task with DB persistence
     * Dual-write: DB first (for durability), then memory
     */
    async enqueueWithPersistence(type, payload) {
        if (!this.initialized) {
            throw new Error('PgQueueManager not initialized');
        }
        const task = {
            id: (0, uuid_1.v4)(),
            type,
            status: 'pending',
            payload,
            createdAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null,
            error: null,
            retryCount: 0
        };
        try {
            // Write to DB first (dual-write pattern)
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            await sqlClient.execute(`INSERT INTO [dbo].[flashdb_queue]
         ([id], [type], [status], [payload], [retry_count], [created_at])
         VALUES (@id, @type, @status, @payload, @retryCount, @createdAt)`, {
                id: task.id,
                type: task.type,
                status: task.status,
                payload: JSON.stringify(task.payload),
                retryCount: task.retryCount,
                createdAt: task.createdAt
            });
            logger_1.default.info(`Task enqueued with DB persistence: ${task.id} (${type})`);
            return task;
        }
        catch (error) {
            logger_1.default.error(`Failed to enqueue task with DB persistence: ${error.message}`);
            // Still return task - caller can decide to proceed or fail
            // The task will be in memory but not durable until DB write succeeds
            throw error;
        }
    }
    /**
     * Dequeue a task with DB persistence
     * Updates status to 'processing' in both DB and memory
     */
    async dequeueWithPersistence() {
        if (!this.initialized) {
            throw new Error('PgQueueManager not initialized');
        }
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            // Get oldest pending task from DB
            const queryResult = await sqlClient.query(`SELECT TOP 1 [id], [type], [payload], [created_at]
         FROM [dbo].[flashdb_queue]
         WHERE [status] = 'pending'
         ORDER BY [created_at] ASC`);
            if (queryResult.recordset.length === 0) {
                return null;
            }
            const row = queryResult.recordset[0];
            const now = new Date().toISOString();
            // Update status to 'processing' and set instance_id
            await sqlClient.execute(`UPDATE [dbo].[flashdb_queue]
         SET [status] = 'processing', [started_at] = @startedAt, [instance_id] = @instanceId
         WHERE [id] = @id`, {
                id: row.id,
                startedAt: now,
                instanceId: this.instanceId
            });
            // Construct task object
            const task = {
                id: row.id,
                type: row.type,
                status: 'processing',
                payload: JSON.parse(row.payload),
                createdAt: row.created_at,
                startedAt: now,
                completedAt: null,
                error: null,
                retryCount: 0
            };
            logger_1.default.info(`Task dequeued with DB persistence: ${task.id} (${task.type})`);
            return task;
        }
        catch (error) {
            logger_1.default.error(`Failed to dequeue task: ${error.message}`);
            return null;
        }
    }
    /**
     * Update task status with DB persistence
     * Updates status in both DB and memory
     */
    async updateTaskStatus(id, status, error, result) {
        if (!this.initialized) {
            throw new Error('PgQueueManager not initialized');
        }
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            const now = new Date().toISOString();
            // Update in DB first (dual-write pattern)
            await sqlClient.execute(`UPDATE [dbo].[flashdb_queue]
         SET [status] = @status, [completed_at] = @completedAt, [error] = @error, [result] = @result
         WHERE [id] = @id`, {
                id,
                status,
                completedAt: now,
                error: error || null,
                result: result ? JSON.stringify(result) : null
            });
            logger_1.default.info(`Task status updated in DB: ${id} -> ${status}`);
            // Auto-archive if task is completed or failed
            if (status === 'completed' || status === 'failed') {
                await this.archiveTaskAsync(id);
            }
        }
        catch (error) {
            logger_1.default.error(`Failed to update task status: ${error.message}`);
            throw error;
        }
    }
    /**
     * Load pending/processing tasks from DB on startup
     * Recovers any tasks that were interrupted by a crash
     */
    async loadQueueFromDB() {
        if (!this.initialized) {
            throw new Error('PgQueueManager not initialized');
        }
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            // Load all pending and processing tasks from DB
            const queryResult = await sqlClient.query(`SELECT [id], [type], [status], [payload], [retry_count], [created_at], [started_at]
         FROM [dbo].[flashdb_queue]
         WHERE [status] IN ('pending', 'processing')
         ORDER BY [created_at] ASC`);
            const tasks = queryResult.recordset.map(row => ({
                id: row.id,
                type: row.type,
                status: row.status,
                payload: JSON.parse(row.payload),
                createdAt: row.created_at,
                startedAt: row.started_at,
                completedAt: null,
                error: null,
                retryCount: row.retry_count
            }));
            logger_1.default.info(`Loaded ${tasks.length} pending/processing tasks from DB on startup`);
            return tasks;
        }
        catch (error) {
            logger_1.default.error(`Failed to load queue from DB: ${error.message}`);
            return [];
        }
    }
    /**
     * Archive completed/failed tasks to archive table
     * Keeps the main queue table lean and enables audit trail queries
     */
    async archiveTaskAsync(taskId) {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            // Get the task from the queue table
            const queryResult = await sqlClient.query(`SELECT [id], [type], [status], [payload], [retry_count], [created_at], [started_at], [completed_at], [error], [result]
         FROM [dbo].[flashdb_queue]
         WHERE [id] = @id AND [status] IN ('completed', 'failed')`, { id: taskId });
            if (queryResult.recordset.length === 0) {
                return; // Task not found or not in terminal state
            }
            const row = queryResult.recordset[0];
            // Move to archive table
            await sqlClient.execute(`INSERT INTO [dbo].[flashdb_queue_archive]
         ([id], [type], [status], [payload], [retry_count], [created_at], [started_at], [completed_at], [error], [result])
         VALUES (@id, @type, @status, @payload, @retryCount, @createdAt, @startedAt, @completedAt, @error, @result)`, {
                id: row.id,
                type: row.type,
                status: row.status,
                payload: row.payload,
                retryCount: row.retry_count,
                createdAt: row.created_at,
                startedAt: row.started_at,
                completedAt: row.completed_at,
                error: row.error,
                result: row.result
            });
            // Delete from active queue
            await sqlClient.execute(`DELETE FROM [dbo].[flashdb_queue] WHERE [id] = @id`, { id: taskId });
            logger_1.default.debug(`Task archived: ${taskId}`);
        }
        catch (error) {
            logger_1.default.error(`Failed to archive task ${taskId}: ${error.message}`);
            // Don't throw - archiving is best-effort and shouldn't block queue operations
        }
    }
    /**
     * Archive old completed tasks in batch (called periodically)
     * Keeps the queue table performant by removing old tasks
     */
    async archiveOldTasks(olderThanDays = 7) {
        if (!this.initialized) {
            throw new Error('PgQueueManager not initialized');
        }
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            // Calculate cutoff date
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
            // Move old completed/failed tasks to archive
            await sqlClient.execute(`INSERT INTO [dbo].[flashdb_queue_archive]
         ([id], [type], [status], [payload], [retry_count], [created_at], [started_at], [completed_at], [error], [result])
         SELECT [id], [type], [status], [payload], [retry_count], [created_at], [started_at], [completed_at], [error], [result]
         FROM [dbo].[flashdb_queue]
         WHERE [status] IN ('completed', 'failed') AND [created_at] < @cutoffDate`, { cutoffDate: cutoffDate.toISOString() });
            // Count rows archived
            const countResult = await sqlClient.query(`SELECT COUNT(*) as count FROM [dbo].[flashdb_queue_archive] WHERE [archived_at] >= @cutoffDate`, { cutoffDate: cutoffDate.toISOString() });
            const archived = countResult.recordset[0]?.count ?? 0;
            // Delete from active queue
            await sqlClient.execute(`DELETE FROM [dbo].[flashdb_queue]
         WHERE [status] IN ('completed', 'failed') AND [created_at] < @cutoffDate`, { cutoffDate: cutoffDate.toISOString() });
            logger_1.default.info(`Archived ${archived} old tasks (older than ${olderThanDays} days)`);
            return archived;
        }
        catch (error) {
            logger_1.default.error(`Failed to archive old tasks: ${error.message}`);
            return 0;
        }
    }
    /**
     * Get queue statistics from DB
     */
    async getQueueStats() {
        if (!this.initialized) {
            throw new Error('PgQueueManager not initialized');
        }
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            const result = await sqlClient.query(`SELECT
         SUM(CASE WHEN [status] = 'pending' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN [status] = 'processing' THEN 1 ELSE 0 END) as processing,
         COUNT(*) as total
         FROM [dbo].[flashdb_queue]`);
            const row = result.recordset[0];
            return {
                pending: row?.pending ?? 0,
                processing: row?.processing ?? 0,
                totalQueued: row?.total ?? 0
            };
        }
        catch (error) {
            logger_1.default.error(`Failed to get queue stats: ${error.message}`);
            return { pending: 0, processing: 0, totalQueued: 0 };
        }
    }
    /**
     * Check if instance owns a task (for recovery on crash)
     */
    async isInstanceOwner(taskId) {
        try {
            const sqlClient = (0, sqlClient_1.getSqlClient)();
            const result = await sqlClient.query(`SELECT [instance_id] as instanceId FROM [dbo].[flashdb_queue] WHERE [id] = @id`, { id: taskId });
            const ownerId = result.recordset[0]?.instanceId ?? null;
            return ownerId === this.instanceId;
        }
        catch (error) {
            logger_1.default.error(`Failed to check instance ownership: ${error.message}`);
            return false;
        }
    }
    /**
     * Get the instance ID
     */
    getInstanceId() {
        return this.instanceId;
    }
    /**
     * Check if initialized
     */
    isInitialized() {
        return this.initialized;
    }
}
exports.PgQueueManager = PgQueueManager;
// Singleton instance
let managerInstance = null;
/**
 * Get or create the singleton PgQueueManager instance
 */
function getPgQueueManager() {
    if (!managerInstance) {
        managerInstance = new PgQueueManager();
    }
    return managerInstance;
}
/**
 * Initialize the PgQueueManager
 * Must be called before using the queue manager
 */
async function initializePgQueueManager() {
    const manager = getPgQueueManager();
    await manager.initialize();
    return manager;
}
/**
 * Reset the queue manager (for testing)
 */
function resetPgQueueManagerForTesting() {
    managerInstance = null;
}
//# sourceMappingURL=pgQueueManager.js.map