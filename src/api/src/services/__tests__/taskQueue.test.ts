import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  TaskQueue,
  resetTaskQueueForTesting
} from '../taskQueue';

describe('TaskQueue', () => {
  let testDataDir: string;
  let queueFilePath: string;
  let originalCwd: string;

  beforeEach(() => {
    // Setup test data directory
    originalCwd = process.cwd();
    testDataDir = path.join(__dirname, '../../../.test-data');

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true });
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    // Reset singleton AFTER directory is clean
    resetTaskQueueForTesting();
    process.chdir(path.dirname(testDataDir));
    queueFilePath = path.join(testDataDir, 'queue.json');
  });

  afterEach(() => {
    // Cleanup
    process.chdir(originalCwd);
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true });
    }
  });

  describe('Enqueue/Dequeue', () => {
    it('should enqueue a task and return a task with required fields', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', {
        goldenImageId: 'img-123',
        cloneName: 'test-clone'
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.type).toBe('create-clone');
      expect(task.status).toBe('pending');
      expect(task.payload.goldenImageId).toBe('img-123');
      expect(task.payload.cloneName).toBe('test-clone');
      expect(task.createdAt).toBeDefined();
      expect(task.retryCount).toBe(0);
    });

    it('should dequeue the first pending task', () => {
      const queue = new TaskQueue();
      const enqueued = queue.enqueue('delete-clone', { cloneId: 'clone-1' });

      const dequeued = queue.dequeue();

      expect(dequeued).toBeDefined();
      expect(dequeued!.id).toBe(enqueued.id);
      expect(dequeued!.status).toBe('processing');
      expect(dequeued!.startedAt).toBeDefined();
    });

    it('should return null when queue is empty', () => {
      const queue = new TaskQueue();
      const dequeued = queue.dequeue();

      expect(dequeued).toBeNull();
    });

    it('should handle multiple tasks in queue', () => {
      const queue = new TaskQueue();
      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('create-clone', { id: 2 });
      const task3 = queue.enqueue('create-clone', { id: 3 });

      const dequeued1 = queue.dequeue();
      const dequeued2 = queue.dequeue();

      expect(dequeued1!.id).toBe(task1.id);
      expect(dequeued2!.id).toBe(task2.id);

      // Only task3 should still be pending
      const remaining = queue.getPendingTasks();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(task3.id);
    });
  });

  describe('Task Status Updates', () => {
    it('should update task status to completed', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });
      queue.dequeue();

      queue.updateTask(task.id, 'completed');

      const updatedTask = queue.getTask(task.id);
      expect(updatedTask).toBeDefined();
      expect(updatedTask!.status).toBe('completed');
      expect(updatedTask!.completedAt).toBeDefined();
    });

    it('should update task status to failed with error message', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });
      queue.dequeue();

      const errorMsg = 'Failed to create clone: invalid ID';
      queue.updateTask(task.id, 'failed', undefined, errorMsg);

      const updatedTask = queue.getTask(task.id);
      expect(updatedTask).toBeDefined();
      expect(updatedTask!.status).toBe('failed');
      expect(updatedTask!.error).toBe(errorMsg);
    });

    it('should move completed tasks from queue to completed history', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });
      queue.dequeue();
      queue.updateTask(task.id, 'completed');

      const pendingTasks = queue.getPendingTasks();
      const completedTasks = queue.getCompletedTasks();

      expect(pendingTasks).toHaveLength(0);
      expect(completedTasks).toHaveLength(1);
      expect(completedTasks[0].id).toBe(task.id);
    });

    it('should move failed tasks to failed history', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('delete-clone', { cloneId: 'clone-1' });
      queue.dequeue();
      queue.updateTask(task.id, 'failed', undefined, 'Clone not found');

      const pendingTasks = queue.getPendingTasks();
      const failedTasks = queue.getFailedTasks();

      expect(pendingTasks).toHaveLength(0);
      expect(failedTasks).toHaveLength(1);
      expect(failedTasks[0].id).toBe(task.id);
    });

    it('should calculate processing time for completed tasks', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });
      const dequeued = queue.dequeue()!;

      // Simulate some processing time
      expect(dequeued.startedAt).toBeDefined();
      queue.updateTask(task.id, 'completed');

      const metrics = queue.getMetrics();
      expect(metrics.averageProcessingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Queue Metrics', () => {
    it('should return correct queue metrics', () => {
      const queue = new TaskQueue();
      queue.enqueue('create-clone', { id: 1 });
      queue.enqueue('create-clone', { id: 2 });
      queue.enqueue('delete-clone', { id: 3 });

      const metrics = queue.getMetrics();

      expect(metrics.queueDepth).toBe(3);
      expect(metrics.pendingTasks).toBe(3);
      expect(metrics.processingTasks).toBe(0);
      expect(metrics.completedTasks).toBe(0);
      expect(metrics.failedTasks).toBe(0);
    });

    it('should track processing tasks', () => {
      const queue = new TaskQueue();
      queue.enqueue('create-clone', { id: 1 });
      queue.enqueue('create-clone', { id: 2 });
      queue.enqueue('delete-clone', { id: 3 });

      queue.dequeue(); // Move task1 to processing
      queue.dequeue(); // Move task2 to processing

      const metrics = queue.getMetrics();

      expect(metrics.pendingTasks).toBe(1);
      expect(metrics.processingTasks).toBe(2);
      expect(metrics.queueDepth).toBe(3);
    });

    it('should track total processed tasks', () => {
      const queue = new TaskQueue();
      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('create-clone', { id: 2 });

      queue.dequeue();
      queue.updateTask(task1.id, 'completed');

      queue.dequeue();
      queue.updateTask(task2.id, 'completed');

      const metrics = queue.getMetrics();

      expect(metrics.totalTasksProcessed).toBe(2);
      expect(metrics.completedTasks).toBe(2);
    });

    it('should track error count', () => {
      const queue = new TaskQueue();
      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('create-clone', { id: 2 });
      const task3 = queue.enqueue('create-clone', { id: 3 });

      queue.dequeue();
      queue.updateTask(task1.id, 'failed', undefined, 'Error 1');

      queue.dequeue();
      queue.updateTask(task2.id, 'failed', undefined, 'Error 2');

      queue.dequeue();
      queue.updateTask(task3.id, 'completed');

      const metrics = queue.getMetrics();

      expect(metrics.errorCount).toBe(2);
      expect(metrics.failedTasks).toBe(2);
    });

    it('should calculate average processing time', () => {
      const queue = new TaskQueue();
      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('create-clone', { id: 2 });

      queue.dequeue();
      queue.updateTask(task1.id, 'completed');

      queue.dequeue();
      queue.updateTask(task2.id, 'completed');

      const metrics = queue.getMetrics();

      expect(metrics.averageProcessingTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Persistence (File Save/Load)', () => {
    it('should save queue to file', () => {
      const queue = new TaskQueue();
      queue.enqueue('create-clone', { cloneId: 'clone-1' });
      queue.enqueue('delete-clone', { cloneId: 'clone-2' });

      expect(fs.existsSync(queueFilePath)).toBe(true);

      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.queue).toHaveLength(2);
      expect(savedData.queue[0].type).toBe('create-clone');
      expect(savedData.queue[1].type).toBe('delete-clone');
    });

    it('should load queue from file on initialization', () => {
      // First queue instance saves tasks
      const queue1 = new TaskQueue();
      const task1 = queue1.enqueue('create-clone', { cloneId: 'clone-1' });
      const task2 = queue1.enqueue('delete-clone', { cloneId: 'clone-2' });

      // Create new queue instance and verify it loads persisted data
      const queue2 = new TaskQueue();
      const tasks = queue2.getPendingTasks();

      expect(tasks).toHaveLength(2);
      expect(tasks.find(t => t.id === task1.id)).toBeDefined();
      expect(tasks.find(t => t.id === task2.id)).toBeDefined();
    });

    it('should persist task status changes', () => {
      const queue1 = new TaskQueue();
      const task = queue1.enqueue('create-clone', { cloneId: 'clone-1' });

      queue1.dequeue();
      queue1.updateTask(task.id, 'completed');

      // Load from file
      const queue2 = new TaskQueue();
      const loadedTask = queue2.getTask(task.id);

      expect(loadedTask).toBeDefined();
      expect(loadedTask!.status).toBe('completed');
      expect(loadedTask!.completedAt).toBeDefined();
    });

    it('should persist completed and failed task histories', () => {
      const queue1 = new TaskQueue();
      const task1 = queue1.enqueue('create-clone', { id: 1 });
      const task2 = queue1.enqueue('delete-clone', { id: 2 });

      queue1.dequeue();
      queue1.updateTask(task1.id, 'completed');

      queue1.dequeue();
      queue1.updateTask(task2.id, 'failed', undefined, 'Test error');

      // Load from file
      const queue2 = new TaskQueue();
      const completed = queue2.getCompletedTasks();
      const failed = queue2.getFailedTasks();

      expect(completed).toHaveLength(1);
      expect(failed).toHaveLength(1);
      expect(completed[0].id).toBe(task1.id);
      expect(failed[0].id).toBe(task2.id);
    });

    it('should handle corrupted queue file gracefully', () => {
      // Create corrupted file
      fs.writeFileSync(queueFilePath, '{invalid json}');

      // Should not throw, should initialize empty queue
      const queue = new TaskQueue();
      const tasks = queue.getPendingTasks();

      expect(tasks).toHaveLength(0);
    });

    it('should persist queue metrics across restarts', () => {
      const queue1 = new TaskQueue();
      const task1 = queue1.enqueue('create-clone', { id: 1 });
      const task2 = queue1.enqueue('create-clone', { id: 2 });

      queue1.dequeue();
      queue1.updateTask(task1.id, 'completed');

      queue1.dequeue();
      queue1.updateTask(task2.id, 'completed');

      // Load from file
      const queue2 = new TaskQueue();
      const metrics = queue2.getMetrics();

      expect(metrics.totalTasksProcessed).toBe(2);
      expect(metrics.completedTasks).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid task payloads', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', {
        // Missing required fields - but should still work since payload is flexible
        randomField: 'random'
      });

      expect(task).toBeDefined();
      expect(task.payload.randomField).toBe('random');
    });

    it('should handle updating non-existent task gracefully', () => {
      const queue = new TaskQueue();

      // Should not throw
      queue.updateTask('non-existent-id', 'completed');

      const task = queue.getTask('non-existent-id');
      expect(task).toBeNull();
    });

    it('should handle clearing completed tasks', () => {
      const queue = new TaskQueue();
      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('create-clone', { id: 2 });

      queue.dequeue();
      queue.updateTask(task1.id, 'completed');

      queue.dequeue();
      queue.updateTask(task2.id, 'completed');

      let completed = queue.getCompletedTasks();
      expect(completed).toHaveLength(2);

      queue.clearCompletedTasks();

      completed = queue.getCompletedTasks();
      expect(completed).toHaveLength(0);
    });

    it('should handle clearing failed tasks', () => {
      const queue = new TaskQueue();
      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('create-clone', { id: 2 });

      queue.dequeue();
      queue.updateTask(task1.id, 'failed', undefined, 'Error 1');

      queue.dequeue();
      queue.updateTask(task2.id, 'failed', undefined, 'Error 2');

      let failed = queue.getFailedTasks();
      expect(failed).toHaveLength(2);

      queue.clearFailedTasks();

      failed = queue.getFailedTasks();
      expect(failed).toHaveLength(0);
    });

    it('should handle retry of processing tasks', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { id: 1 });

      const dequeued = queue.dequeue();
      expect(dequeued!.status).toBe('processing');

      const retried = queue.retryTask(task.id);
      expect(retried).toBe(true);

      const requeued = queue.getPendingTasks();
      expect(requeued).toHaveLength(1);
      expect(requeued[0].id).toBe(task.id);
      expect(requeued[0].status).toBe('pending');
    });

    it('should return false when retrying non-existent task', () => {
      const queue = new TaskQueue();
      const result = queue.retryTask('non-existent-id');
      expect(result).toBe(false);
    });

    it('should return false when retrying non-processing task', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { id: 1 });

      // Task is still pending
      const result = queue.retryTask(task.id);
      expect(result).toBe(false);
    });
  });

  describe('Task Retrieval', () => {
    it('should retrieve task by ID from pending queue', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      const retrieved = queue.getTask(task.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(task.id);
    });

    it('should retrieve task by ID from completed history', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      queue.dequeue();
      queue.updateTask(task.id, 'completed');

      const retrieved = queue.getTask(task.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(task.id);
      expect(retrieved!.status).toBe('completed');
    });

    it('should retrieve task by ID from failed history', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      queue.dequeue();
      queue.updateTask(task.id, 'failed', undefined, 'Test error');

      const retrieved = queue.getTask(task.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(task.id);
      expect(retrieved!.status).toBe('failed');
    });

    it('should return null for non-existent task', () => {
      const queue = new TaskQueue();
      const retrieved = queue.getTask('non-existent-id');
      expect(retrieved).toBeNull();
    });

    it('should get all tasks', () => {
      const queue = new TaskQueue();
      const task1 = queue.enqueue('create-clone', { id: 1 });
      queue.enqueue('delete-clone', { id: 2 });

      queue.dequeue();
      queue.updateTask(task1.id, 'completed');

      const all = queue.getAllTasks();
      expect(all.queue).toHaveLength(1);
      expect(all.completed).toHaveLength(1);
      expect(all.failed).toHaveLength(0);
    });
  });

  describe('Different Task Types', () => {
    it('should handle create-clone tasks', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', {
        goldenImageId: 'img-123',
        cloneName: 'test-clone'
      });

      expect(task.type).toBe('create-clone');
    });

    it('should handle delete-clone tasks', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('delete-clone', {
        cloneId: 'clone-123',
        deleteVhdx: true
      });

      expect(task.type).toBe('delete-clone');
    });

    it('should handle create-checkpoint tasks', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-checkpoint', {
        cloneId: 'clone-123',
        checkpointName: 'backup-1'
      });

      expect(task.type).toBe('create-checkpoint');
    });

    it('should handle restore-checkpoint tasks', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('restore-checkpoint', {
        cloneId: 'clone-123',
        checkpointId: 'cp-123'
      });

      expect(task.type).toBe('restore-checkpoint');
    });
  });
});
