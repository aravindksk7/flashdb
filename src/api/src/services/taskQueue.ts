import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '../logger';

export type TaskType = 'create-clone' | 'delete-clone' | 'create-checkpoint' | 'restore-checkpoint' | 'delete-checkpoint';
export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Task {
  id: string;
  type: TaskType;
  status: TaskStatus;
  payload: Record<string, any>;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  retryCount: number;
}

export interface QueueMetrics {
  queueDepth: number;
  pendingTasks: number;
  processingTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageProcessingTimeMs: number;
  totalTasksProcessed: number;
  errorCount: number;
}

class TaskQueue {
  private queue: Task[] = [];
  private queueFilePath: string;
  private completedTasks: Task[] = [];
  private failedTasks: Task[] = [];
  private totalTasksProcessed: number = 0;
  private processingTimes: number[] = [];

  constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    this.queueFilePath = path.join(dataDir, 'queue.json');
    this.ensureDataDirectory();
    this.loadQueue();
  }

  private ensureDataDirectory(): void {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
        logger.info(`Created data directory: ${dataDir}`);
      } catch (error: any) {
        logger.error(`Failed to create data directory: ${error.message}`);
      }
    }
  }

  loadQueue(): void {
    try {
      if (fs.existsSync(this.queueFilePath)) {
        const data = fs.readFileSync(this.queueFilePath, 'utf-8');
        const queueData = JSON.parse(data);
        this.queue = queueData.queue || [];
        this.completedTasks = queueData.completedTasks || [];
        this.failedTasks = queueData.failedTasks || [];
        this.totalTasksProcessed = queueData.totalTasksProcessed || 0;
        this.processingTimes = queueData.processingTimes || [];
        logger.info(`Loaded queue from file: ${this.queue.length} pending tasks, ${this.completedTasks.length} completed, ${this.failedTasks.length} failed`);
      }
    } catch (error: any) {
      logger.error(`Failed to load queue from file: ${error.message}`);
      this.queue = [];
      this.completedTasks = [];
      this.failedTasks = [];
    }
  }

  private saveQueue(): void {
    try {
      const data = {
        queue: this.queue,
        completedTasks: this.completedTasks,
        failedTasks: this.failedTasks,
        totalTasksProcessed: this.totalTasksProcessed,
        processingTimes: this.processingTimes,
        savedAt: new Date().toISOString()
      };
      const dataDir = path.dirname(this.queueFilePath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      fs.writeFileSync(this.queueFilePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error: any) {
      logger.error(`Failed to save queue to file: ${error.message}`);
    }
  }

  enqueue(type: TaskType, payload: Record<string, any>): Task {
    const task: Task = {
      id: uuidv4(),
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
    logger.info(`Task enqueued: ${task.id} (${type})`);
    return task;
  }

  dequeue(): Task | null {
    const task = this.queue.find(t => t.status === 'pending');
    if (task) {
      task.status = 'processing';
      task.startedAt = new Date().toISOString();
      this.saveQueue();
      logger.info(`Task dequeued: ${task.id} (${task.type})`);
      return task;
    }
    return null;
  }

  updateTask(id: string, status: TaskStatus, _result?: any, error?: string): void {
    const task = this.queue.find(t => t.id === id);
    if (!task) {
      logger.warn(`Task not found: ${id}`);
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
      logger.info(`Task completed: ${id} (${task.type}), processing time: ${new Date(task.completedAt).getTime() - new Date(task.startedAt!).getTime()}ms`);
    } else if (status === 'failed') {
      this.failedTasks.push(task);
      this.queue = this.queue.filter(t => t.id !== id);
      logger.error(`Task failed: ${id} (${task.type}), error: ${error}`);
    }

    this.saveQueue();
  }

  getMetrics(): QueueMetrics {
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

  getTask(id: string): Task | null {
    const task = this.queue.find(t => t.id === id);
    if (task) return task;

    const completed = this.completedTasks.find(t => t.id === id);
    if (completed) return completed;

    const failed = this.failedTasks.find(t => t.id === id);
    if (failed) return failed;

    return null;
  }

  getAllTasks(): { queue: Task[]; completed: Task[]; failed: Task[] } {
    return {
      queue: this.queue,
      completed: this.completedTasks,
      failed: this.failedTasks
    };
  }

  getPendingTasks(): Task[] {
    return this.queue.filter(t => t.status === 'pending');
  }

  getProcessingTasks(): Task[] {
    return this.queue.filter(t => t.status === 'processing');
  }

  getCompletedTasks(): Task[] {
    return this.completedTasks;
  }

  getFailedTasks(): Task[] {
    return this.failedTasks;
  }

  clearCompletedTasks(): void {
    const clearedCount = this.completedTasks.length;
    this.completedTasks = [];
    this.saveQueue();
    logger.info(`Cleared ${clearedCount} completed tasks from history`);
  }

  clearFailedTasks(): void {
    const clearedCount = this.failedTasks.length;
    this.failedTasks = [];
    this.saveQueue();
    logger.info(`Cleared ${clearedCount} failed tasks from history`);
  }

  retryTask(id: string): boolean {
    const task = this.queue.find(t => t.id === id);
    if (!task) {
      logger.warn(`Task not found for retry: ${id}`);
      return false;
    }

    if (task.status !== 'processing') {
      logger.warn(`Cannot retry task ${id} with status ${task.status}`);
      return false;
    }

    task.status = 'pending';
    task.startedAt = null;
    this.saveQueue();
    logger.info(`Task moved back to pending for retry: ${id}`);
    return true;
  }
}

// Singleton instance
let queueInstance: TaskQueue | null = null;

export function getTaskQueue(): TaskQueue {
  if (!queueInstance) {
    queueInstance = new TaskQueue();
  }
  return queueInstance;
}

export function initializeTaskQueue(): TaskQueue {
  return getTaskQueue();
}

export function resetTaskQueueForTesting(): void {
  queueInstance = null;
}

export { TaskQueue };
