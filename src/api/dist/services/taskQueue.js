"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTaskQueue = getTaskQueue;
exports.initializeTaskQueue = initializeTaskQueue;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const logger_1 = __importDefault(require("../logger"));
class TaskQueue {
    constructor() {
        this.queue = [];
        this.completedTasks = [];
        this.failedTasks = [];
        this.totalTasksProcessed = 0;
        this.processingTimes = [];
        const dataDir = path_1.default.join(process.cwd(), 'data');
        this.queueFilePath = path_1.default.join(dataDir, 'queue.json');
        this.ensureDataDirectory();
        this.loadQueue();
    }
    ensureDataDirectory() {
        const dataDir = path_1.default.join(process.cwd(), 'data');
        if (!fs_1.default.existsSync(dataDir)) {
            try {
                fs_1.default.mkdirSync(dataDir, { recursive: true });
                logger_1.default.info(`Created data directory: ${dataDir}`);
            }
            catch (error) {
                logger_1.default.error(`Failed to create data directory: ${error.message}`);
            }
        }
    }
    loadQueue() {
        try {
            if (fs_1.default.existsSync(this.queueFilePath)) {
                const data = fs_1.default.readFileSync(this.queueFilePath, 'utf-8');
                const queueData = JSON.parse(data);
                this.queue = queueData.queue || [];
                this.completedTasks = queueData.completedTasks || [];
                this.failedTasks = queueData.failedTasks || [];
                this.totalTasksProcessed = queueData.totalTasksProcessed || 0;
                this.processingTimes = queueData.processingTimes || [];
                logger_1.default.info(`Loaded queue from file: ${this.queue.length} pending tasks, ${this.completedTasks.length} completed, ${this.failedTasks.length} failed`);
            }
        }
        catch (error) {
            logger_1.default.error(`Failed to load queue from file: ${error.message}`);
            this.queue = [];
            this.completedTasks = [];
            this.failedTasks = [];
        }
    }
    saveQueue() {
        try {
            const data = {
                queue: this.queue,
                completedTasks: this.completedTasks,
                failedTasks: this.failedTasks,
                totalTasksProcessed: this.totalTasksProcessed,
                processingTimes: this.processingTimes,
                savedAt: new Date().toISOString()
            };
            const dataDir = path_1.default.dirname(this.queueFilePath);
            if (!fs_1.default.existsSync(dataDir)) {
                fs_1.default.mkdirSync(dataDir, { recursive: true });
            }
            fs_1.default.writeFileSync(this.queueFilePath, JSON.stringify(data, null, 2), 'utf-8');
        }
        catch (error) {
            logger_1.default.error(`Failed to save queue to file: ${error.message}`);
        }
    }
    enqueue(type, payload) {
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
        this.queue.push(task);
        this.saveQueue();
        logger_1.default.info(`Task enqueued: ${task.id} (${type})`);
        return task;
    }
    dequeue() {
        const task = this.queue.find(t => t.status === 'pending');
        if (task) {
            task.status = 'processing';
            task.startedAt = new Date().toISOString();
            this.saveQueue();
            logger_1.default.info(`Task dequeued: ${task.id} (${task.type})`);
            return task;
        }
        return null;
    }
    updateTask(id, status, _result, error) {
        const task = this.queue.find(t => t.id === id);
        if (!task) {
            logger_1.default.warn(`Task not found: ${id}`);
            return;
        }
        task.status = status;
        task.completedAt = new Date().toISOString();
        if (error) {
            task.error = error;
        }
        if (task.startedAt && status === 'completed') {
            const processingTime = new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime();
            this.processingTimes.push(processingTime);
            // Keep only last 1000 processing times
            if (this.processingTimes.length > 1000) {
                this.processingTimes.shift();
            }
        }
        // Move completed/failed tasks out of main queue
        if (status === 'completed') {
            this.completedTasks.push(task);
            this.queue = this.queue.filter(t => t.id !== id);
            this.totalTasksProcessed++;
            logger_1.default.info(`Task completed: ${id} (${task.type}), processing time: ${new Date(task.completedAt).getTime() - new Date(task.startedAt).getTime()}ms`);
        }
        else if (status === 'failed') {
            this.failedTasks.push(task);
            this.queue = this.queue.filter(t => t.id !== id);
            logger_1.default.error(`Task failed: ${id} (${task.type}), error: ${error}`);
        }
        this.saveQueue();
    }
    getMetrics() {
        const pendingTasks = this.queue.filter(t => t.status === 'pending').length;
        const processingTasks = this.queue.filter(t => t.status === 'processing').length;
        const averageProcessingTimeMs = this.processingTimes.length > 0
            ? this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length
            : 0;
        return {
            queueDepth: this.queue.length,
            pendingTasks,
            processingTasks,
            completedTasks: this.completedTasks.length,
            failedTasks: this.failedTasks.length,
            averageProcessingTimeMs,
            totalTasksProcessed: this.totalTasksProcessed,
            errorCount: this.failedTasks.length
        };
    }
    getTask(id) {
        const task = this.queue.find(t => t.id === id);
        if (task)
            return task;
        const completed = this.completedTasks.find(t => t.id === id);
        if (completed)
            return completed;
        const failed = this.failedTasks.find(t => t.id === id);
        if (failed)
            return failed;
        return null;
    }
    getAllTasks() {
        return {
            queue: this.queue,
            completed: this.completedTasks,
            failed: this.failedTasks
        };
    }
    getPendingTasks() {
        return this.queue.filter(t => t.status === 'pending');
    }
    getProcessingTasks() {
        return this.queue.filter(t => t.status === 'processing');
    }
    getCompletedTasks() {
        return this.completedTasks;
    }
    getFailedTasks() {
        return this.failedTasks;
    }
    clearCompletedTasks() {
        const clearedCount = this.completedTasks.length;
        this.completedTasks = [];
        this.saveQueue();
        logger_1.default.info(`Cleared ${clearedCount} completed tasks from history`);
    }
    clearFailedTasks() {
        const clearedCount = this.failedTasks.length;
        this.failedTasks = [];
        this.saveQueue();
        logger_1.default.info(`Cleared ${clearedCount} failed tasks from history`);
    }
    retryTask(id) {
        const task = this.queue.find(t => t.id === id);
        if (!task) {
            logger_1.default.warn(`Task not found for retry: ${id}`);
            return false;
        }
        if (task.status !== 'processing') {
            logger_1.default.warn(`Cannot retry task ${id} with status ${task.status}`);
            return false;
        }
        task.status = 'pending';
        task.startedAt = null;
        this.saveQueue();
        logger_1.default.info(`Task moved back to pending for retry: ${id}`);
        return true;
    }
}
// Singleton instance
let queueInstance = null;
function getTaskQueue() {
    if (!queueInstance) {
        queueInstance = new TaskQueue();
    }
    return queueInstance;
}
function initializeTaskQueue() {
    return getTaskQueue();
}
//# sourceMappingURL=taskQueue.js.map