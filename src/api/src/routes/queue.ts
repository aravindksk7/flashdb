import { Router, Request, Response } from 'express';
import { getTaskQueue } from '../services/taskQueue';
import logger from '../logger';

const router = Router();

/**
 * GET /api/queue/metrics
 * Retrieve queue metrics (depth, processing stats, error count)
 */
router.get('/metrics', (_req: Request, res: Response) => {
  try {
    const taskQueue = getTaskQueue();
    const metrics = taskQueue.getMetrics();

    return res.json({
      success: true,
      data: {
        ...metrics,
        timestamp: new Date().toISOString()
      },
      message: 'Queue metrics retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`Error retrieving queue metrics: ${error.message}`);
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
router.get('/status', (_req: Request, res: Response) => {
  try {
    const taskQueue = getTaskQueue();
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
  } catch (error: any) {
    logger.error(`Error retrieving queue status: ${error.message}`);
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
router.get('/tasks/:taskId', (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const taskQueue = getTaskQueue();
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
  } catch (error: any) {
    logger.error(`Error retrieving task: ${error.message}`);
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
router.get('/tasks', (req: Request, res: Response) => {
  try {
    const { status, limit: limitStr } = req.query;
    const limit = parseInt(limitStr as string) || 100;

    const taskQueue = getTaskQueue();
    let { queue, completed, failed } = taskQueue.getAllTasks();

    let tasks: any[] = [];

    if (status === 'pending') {
      tasks = queue.filter(t => t.status === 'pending');
    } else if (status === 'processing') {
      tasks = queue.filter(t => t.status === 'processing');
    } else if (status === 'completed') {
      tasks = completed;
    } else if (status === 'failed') {
      tasks = failed;
    } else {
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
  } catch (error: any) {
    logger.error(`Error retrieving tasks: ${error.message}`);
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
router.post('/clear/completed', (_req: Request, res: Response) => {
  try {
    const taskQueue = getTaskQueue();
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
  } catch (error: any) {
    logger.error(`Error clearing completed tasks: ${error.message}`);
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
router.post('/clear/failed', (_req: Request, res: Response) => {
  try {
    const taskQueue = getTaskQueue();
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
  } catch (error: any) {
    logger.error(`Error clearing failed tasks: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
