"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const taskQueue_1 = require("../services/taskQueue");
const logger_1 = __importDefault(require("../logger"));
const router = (0, express_1.Router)();
/**
 * GET /api/queue/metrics
 * Retrieve queue metrics (depth, processing stats, error count)
 */
router.get('/metrics', (_req, res) => {
    try {
        const taskQueue = (0, taskQueue_1.getTaskQueue)();
        const metrics = taskQueue.getMetrics();
        return res.json({
            success: true,
            data: {
                ...metrics,
                timestamp: new Date().toISOString()
            },
            message: 'Queue metrics retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving queue metrics: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * GET /api/queue/status
 * Retrieve queue status and tasks
 */
router.get('/status', (_req, res) => {
    try {
        const taskQueue = (0, taskQueue_1.getTaskQueue)();
        const { queue, completed, failed } = taskQueue.getAllTasks();
        return res.json({
            success: true,
            data: {
                pending: queue.filter(t => t.status === 'pending'),
                processing: queue.filter(t => t.status === 'processing'),
                completed: completed.slice(-10), // Return last 10 completed
                failed: failed.slice(-10), // Return last 10 failed
                metrics: taskQueue.getMetrics(),
                timestamp: new Date().toISOString()
            },
            message: 'Queue status retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving queue status: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * GET /api/queue/tasks/:taskId
 * Retrieve a specific task by ID
 */
router.get('/tasks/:taskId', (req, res) => {
    try {
        const { taskId } = req.params;
        const taskQueue = (0, taskQueue_1.getTaskQueue)();
        const task = taskQueue.getTask(taskId);
        if (!task) {
            return res.status(404).json({
                success: false,
                message: `Task not found: ${taskId}`
            });
        }
        return res.json({
            success: true,
            data: task,
            message: 'Task retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving task: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * GET /api/queue/tasks
 * Retrieve all tasks (with optional filtering)
 * Query params:
 *   - status: 'pending' | 'processing' | 'completed' | 'failed'
 *   - limit: max number of tasks to return (default: 100)
 */
router.get('/tasks', (req, res) => {
    try {
        const { status, limit: limitStr } = req.query;
        const limit = parseInt(limitStr) || 100;
        const taskQueue = (0, taskQueue_1.getTaskQueue)();
        let { queue, completed, failed } = taskQueue.getAllTasks();
        let tasks = [];
        if (status === 'pending') {
            tasks = queue.filter(t => t.status === 'pending');
        }
        else if (status === 'processing') {
            tasks = queue.filter(t => t.status === 'processing');
        }
        else if (status === 'completed') {
            tasks = completed;
        }
        else if (status === 'failed') {
            tasks = failed;
        }
        else {
            tasks = [...queue, ...completed, ...failed];
        }
        tasks = tasks.slice(-limit);
        return res.json({
            success: true,
            data: {
                tasks,
                count: tasks.length,
                totalInQueue: queue.length,
                totalCompleted: completed.length,
                totalFailed: failed.length,
                timestamp: new Date().toISOString()
            },
            message: 'Tasks retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving tasks: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * POST /api/queue/clear/completed
 * Clear completed tasks from history
 */
router.post('/clear/completed', (_req, res) => {
    try {
        const taskQueue = (0, taskQueue_1.getTaskQueue)();
        const beforeCount = taskQueue.getCompletedTasks().length;
        taskQueue.clearCompletedTasks();
        const afterCount = taskQueue.getCompletedTasks().length;
        return res.json({
            success: true,
            data: {
                clearedCount: beforeCount - afterCount,
                timestamp: new Date().toISOString()
            },
            message: 'Completed tasks cleared successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error clearing completed tasks: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
/**
 * POST /api/queue/clear/failed
 * Clear failed tasks from history
 */
router.post('/clear/failed', (_req, res) => {
    try {
        const taskQueue = (0, taskQueue_1.getTaskQueue)();
        const beforeCount = taskQueue.getFailedTasks().length;
        taskQueue.clearFailedTasks();
        const afterCount = taskQueue.getFailedTasks().length;
        return res.json({
            success: true,
            data: {
                clearedCount: beforeCount - afterCount,
                timestamp: new Date().toISOString()
            },
            message: 'Failed tasks cleared successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error clearing failed tasks: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=queue.js.map