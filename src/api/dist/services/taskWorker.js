"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskWorker = void 0;
exports.getTaskWorker = getTaskWorker;
exports.initializeTaskWorker = initializeTaskWorker;
exports.resetTaskWorkerForTesting = resetTaskWorkerForTesting;
const taskQueue_1 = require("./taskQueue");
const pooledPowershellService_1 = require("./pooledPowershellService");
const pgQueueManager_1 = require("./pgQueueManager");
const logger_1 = __importDefault(require("../logger"));
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Base delay, will be exponential
const POLL_INTERVAL_MS = 5000; // Check queue every 5 seconds
class TaskWorker {
    constructor() {
        this.isRunning = false;
        this.pollInterval = null;
        this.inFlightTasks = new Set();
        this.usePersistence = false; // Whether to use DB persistence
    }
    async startWorker() {
        if (this.isRunning) {
            logger_1.default.warn('Task worker is already running');
            return;
        }
        this.isRunning = true;
        logger_1.default.info('Starting task worker');
        // Check if DB persistence is enabled
        const persistMode = process.env.QUEUE_PERSIST_MODE || 'db';
        if (persistMode === 'db') {
            try {
                const pgQueueManager = (0, pgQueueManager_1.getPgQueueManager)();
                if (pgQueueManager.isInitialized()) {
                    this.usePersistence = true;
                    // Load pending tasks from DB on startup
                    const pendingTasks = await pgQueueManager.loadQueueFromDB();
                    const taskQueue = (0, taskQueue_1.getTaskQueue)();
                    for (const task of pendingTasks) {
                        // Add to in-memory queue if not already there
                        const existing = taskQueue.getTask(task.id);
                        if (!existing) {
                            // Reconstruct task in memory queue
                            taskQueue.enqueue(task.type, task.payload);
                        }
                    }
                    logger_1.default.info(`Loaded ${pendingTasks.length} tasks from DB for recovery`);
                }
            }
            catch (error) {
                logger_1.default.warn(`DB persistence not available: ${error.message}. Falling back to file persistence.`);
                this.usePersistence = false;
            }
        }
        this.pollInterval = setInterval(() => {
            this.processNextTask().catch(error => {
                logger_1.default.error(`Error in task worker poll: ${error.message}`);
            });
        }, POLL_INTERVAL_MS);
    }
    async stopWorker(gracefulWaitMs = 5000) {
        if (!this.isRunning) {
            logger_1.default.warn('Task worker is not running');
            return;
        }
        logger_1.default.info('Stopping task worker gracefully');
        this.isRunning = false;
        // Clear the polling interval
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        // Wait for in-flight tasks with timeout
        const startTime = Date.now();
        while (this.inFlightTasks.size > 0) {
            if (Date.now() - startTime > gracefulWaitMs) {
                logger_1.default.warn(`Grace period expired with ${this.inFlightTasks.size} tasks still in flight`);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        logger_1.default.info('Task worker stopped');
    }
    async processNextTask() {
        if (!this.isRunning)
            return;
        const taskQueue = (0, taskQueue_1.getTaskQueue)();
        const task = taskQueue.dequeue();
        if (!task)
            return;
        this.inFlightTasks.add(task.id);
        try {
            await this.processTask(task);
        }
        catch (error) {
            logger_1.default.error(`Unhandled error processing task ${task.id}: ${error.message}`);
        }
        finally {
            this.inFlightTasks.delete(task.id);
        }
    }
    async processTask(task) {
        const taskQueue = (0, taskQueue_1.getTaskQueue)();
        const psService = (0, pooledPowershellService_1.getPooledPowerShellService)();
        try {
            logger_1.default.info(`Processing task: ${task.id} (${task.type})`);
            let result;
            switch (task.type) {
                case 'create-clone':
                    result = await psService.executeCommand('New-FlashdbClone', {
                        GoldenImageId: task.payload.goldenImageId,
                        CloneName: task.payload.cloneName,
                        InstancePath: task.payload.instancePath,
                        StoragePath: task.payload.storagePath,
                        DatabaseType: task.payload.databaseType,
                        DatabaseName: task.payload.databaseName,
                        CompressionEnabled: task.payload.compressionEnabled
                    });
                    break;
                case 'delete-clone':
                    result = await psService.executeCommandRaw('Remove-FlashdbClone', {
                        CloneId: task.payload.cloneId,
                        DeleteVhdx: task.payload.deleteVhdx || false
                    });
                    break;
                case 'create-checkpoint':
                    result = await psService.executeCommand('New-FlashdbCheckpoint', {
                        CloneId: task.payload.cloneId,
                        CheckpointName: task.payload.checkpointName,
                        Phase: task.payload.phase || 'manual',
                        Description: task.payload.description,
                        Force: task.payload.force || false
                    });
                    break;
                case 'restore-checkpoint':
                    result = await psService.executeCommandRaw('Restore-FlashdbCheckpoint', {
                        CloneId: task.payload.cloneId,
                        CheckpointId: task.payload.checkpointId,
                        ReattachAfter: task.payload.reattachAfter !== false
                    });
                    break;
                default:
                    throw new Error(`Unknown task type: ${task.type}`);
            }
            logger_1.default.info(`Task completed successfully: ${task.id}`);
            taskQueue.updateTask(task.id, 'completed', result);
            // Update DB if persistence is enabled
            if (this.usePersistence) {
                const pgQueueManager = (0, pgQueueManager_1.getPgQueueManager)();
                await pgQueueManager.updateTaskStatus(task.id, 'completed', undefined, result);
            }
        }
        catch (error) {
            const errorMessage = error.message || String(error);
            logger_1.default.error(`Task failed: ${task.id}, error: ${errorMessage}, retry: ${task.retryCount}/${MAX_RETRIES}`);
            if (task.retryCount < MAX_RETRIES) {
                // Retry with exponential backoff
                task.retryCount++;
                const delayMs = RETRY_DELAY_MS * Math.pow(2, task.retryCount - 1);
                logger_1.default.info(`Retrying task ${task.id} in ${delayMs}ms (attempt ${task.retryCount}/${MAX_RETRIES})`);
                // Schedule retry by putting task back to pending after delay
                setTimeout(() => {
                    const taskQueue = (0, taskQueue_1.getTaskQueue)();
                    taskQueue.retryTask(task.id);
                }, delayMs);
            }
            else {
                // Max retries exceeded
                const taskQueue = (0, taskQueue_1.getTaskQueue)();
                taskQueue.updateTask(task.id, 'failed', undefined, errorMessage);
                // Update DB if persistence is enabled
                if (this.usePersistence) {
                    const pgQueueManager = (0, pgQueueManager_1.getPgQueueManager)();
                    await pgQueueManager.updateTaskStatus(task.id, 'failed', errorMessage);
                }
            }
        }
    }
    isWorkerRunning() {
        return this.isRunning;
    }
    getInFlightTaskCount() {
        return this.inFlightTasks.size;
    }
}
exports.TaskWorker = TaskWorker;
// Singleton instance
let workerInstance = null;
function getTaskWorker() {
    if (!workerInstance) {
        workerInstance = new TaskWorker();
    }
    return workerInstance;
}
function initializeTaskWorker() {
    return getTaskWorker();
}
function resetTaskWorkerForTesting() {
    workerInstance = null;
}
//# sourceMappingURL=taskWorker.js.map