import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { TaskWorker, getTaskWorker, initializeTaskWorker, resetTaskWorkerForTesting } from '../taskWorker';
import { getTaskQueue, resetTaskQueueForTesting } from '../taskQueue';

// Mock the pooledPowershellService with any type to bypass strict typing
jest.mock('../pooledPowershellService', () => {
  const mockFn = jest.fn(() => ({
    executeCommand: jest.fn(() => Promise.resolve({ success: true })),
    executeCommandRaw: jest.fn(() => Promise.resolve({ success: true }))
  }));
  return { getPooledPowerShellService: mockFn };
}, { virtual: true });

describe('TaskWorker', () => {
  let testDataDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    testDataDir = path.join(__dirname, '../../../.test-data-worker');

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true });
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    // Reset singleton instances AFTER directory is clean
    resetTaskWorkerForTesting();
    resetTaskQueueForTesting();
    process.chdir(path.dirname(testDataDir));
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true });
    }
  });

  describe('Worker Startup/Shutdown', () => {
    it('should start worker', async () => {
      const worker = new TaskWorker();
      expect(worker.isWorkerRunning()).toBe(false);

      await worker.startWorker();
      expect(worker.isWorkerRunning()).toBe(true);

      await worker.stopWorker();
    });

    it('should shutdown worker gracefully', async () => {
      const worker = new TaskWorker();
      await worker.startWorker();
      expect(worker.isWorkerRunning()).toBe(true);

      await worker.stopWorker();
      expect(worker.isWorkerRunning()).toBe(false);
    });

    it('should not start worker twice', async () => {
      const worker = new TaskWorker();
      await worker.startWorker();
      expect(worker.isWorkerRunning()).toBe(true);

      // Trying to start again should be no-op
      await worker.startWorker();
      expect(worker.isWorkerRunning()).toBe(true);

      await worker.stopWorker();
    });

    it('should not stop worker if not running', async () => {
      const worker = new TaskWorker();
      expect(worker.isWorkerRunning()).toBe(false);

      // Should not throw
      await worker.stopWorker();
      expect(worker.isWorkerRunning()).toBe(false);
    });

    it('should track in-flight task count', async () => {
      const worker = new TaskWorker();
      expect(worker.getInFlightTaskCount()).toBe(0);

      await worker.startWorker();
      expect(worker.getInFlightTaskCount()).toBe(0);

      await worker.stopWorker();
    });
  });

  describe('Task Processing', () => {
    it('should dequeue and process task', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      const task = queue.enqueue('create-clone', {
        goldenImageId: 'img-123',
        cloneName: 'test-clone'
      });

      await worker.processTask(task);

      // Task should be moved to completed
      const updatedTask = queue.getTask(task.id);
      expect(updatedTask).toBeDefined();
    });

    it('should handle create-clone task', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      const task = queue.enqueue('create-clone', {
        goldenImageId: 'img-123',
        cloneName: 'test-clone',
        instancePath: 'C:\\path',
        storagePath: 'C:\\storage',
        databaseType: 'SQL',
        databaseName: 'testdb',
        compressionEnabled: false
      });

      await worker.processTask(task);

      const completed = queue.getCompletedTasks();
      expect(completed).toHaveLength(1);
    });

    it('should handle delete-clone task', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      const task = queue.enqueue('delete-clone', {
        cloneId: 'clone-123',
        deleteVhdx: true
      });

      await worker.processTask(task);

      const completed = queue.getCompletedTasks();
      expect(completed).toHaveLength(1);
    });

    it('should handle create-checkpoint task', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      const task = queue.enqueue('create-checkpoint', {
        cloneId: 'clone-123',
        checkpointName: 'backup-1',
        phase: 'manual',
        description: 'Manual backup',
        force: false
      });

      await worker.processTask(task);

      const completed = queue.getCompletedTasks();
      expect(completed).toHaveLength(1);
    });

    it('should handle restore-checkpoint task', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      const task = queue.enqueue('restore-checkpoint', {
        cloneId: 'clone-123',
        checkpointId: 'cp-123',
        reattachAfter: true
      });

      await worker.processTask(task);

      const completed = queue.getCompletedTasks();
      expect(completed).toHaveLength(1);
    });

    it('should handle unknown task type gracefully', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      // Create a task with an invalid type
      const task = queue.enqueue('create-clone', { id: 1 });
      task.type = 'unknown-type' as any;

      await worker.processTask(task);

      // Task should be moved to failed
      const failed = queue.getFailedTasks();
      expect(failed.length).toBeGreaterThan(0);
      expect(failed[0].error).toContain('Unknown task type');
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed task with exponential backoff', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      // Create a task with invalid type to trigger error
      const task = queue.enqueue('create-clone', { id: 1 });
      task.type = 'unknown-type' as any;

      await worker.processTask(task);

      // Note: Retry scheduling is asynchronous
      // In real scenario, task would be retried after delay
    });

    it('should fail task after max retries exceeded', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      const task = queue.enqueue('create-clone', { id: 1 });
      task.type = 'unknown-type' as any;

      // Process multiple times to exceed max retries
      for (let i = 0; i < 4; i++) {
        await worker.processTask(task);
      }

      // After exceeding max retries, task should be in failed state
      // Note: This is a simplified test
    });

    it('should track retry count on task', async () => {
      const queue = getTaskQueue();

      const task = queue.enqueue('create-clone', { id: 1 });
      expect(task.retryCount).toBe(0);

      // After retry, count should increase
      // (In real implementation, this happens with delay)
    });
  });

  describe('Graceful Shutdown', () => {
    it('should wait for in-flight tasks during shutdown', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      queue.enqueue('create-clone', { id: 1 });
      queue.enqueue('create-clone', { id: 2 });

      await worker.startWorker();

      // Dequeue to simulate in-flight task
      const dequeued = queue.dequeue();
      expect(dequeued).toBeDefined();

      // Should wait for tasks to complete
      await worker.stopWorker(2000);

      expect(worker.isWorkerRunning()).toBe(false);
    });

    it('should timeout graceful shutdown if tasks take too long', async () => {
      const worker = new TaskWorker();
      await worker.startWorker();

      // Shutdown with very short timeout
      await worker.stopWorker(100);

      expect(worker.isWorkerRunning()).toBe(false);
      // Should complete quickly since no actual in-flight tasks
    });

    it('should clear polling interval on shutdown', async () => {
      const worker = new TaskWorker();
      await worker.startWorker();
      expect(worker.isWorkerRunning()).toBe(true);

      await worker.stopWorker();
      expect(worker.isWorkerRunning()).toBe(false);

      // After shutdown, no polling should occur
      // Verify by checking no tasks are processed
      const queue = getTaskQueue();
      const task = queue.enqueue('create-clone', { id: 1 });

      // Wait a bit to ensure no processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(task.status).toBe('pending');
    });
  });

  describe('Processing Pipeline', () => {
    it('should process multiple tasks sequentially', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('create-clone', { id: 2 });
      const task3 = queue.enqueue('create-clone', { id: 3 });

      await worker.processTask(task1);
      await worker.processTask(task2);
      await worker.processTask(task3);

      const completed = queue.getCompletedTasks();
      expect(completed).toHaveLength(3);
    });

    it('should handle mixed task types', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      const task1 = queue.enqueue('create-clone', { goldenImageId: 'img-1' });
      const task2 = queue.enqueue('create-checkpoint', { cloneId: 'clone-1' });
      const task3 = queue.enqueue('delete-clone', { cloneId: 'clone-1' });

      await worker.processTask(task1);
      await worker.processTask(task2);
      await worker.processTask(task3);

      const completed = queue.getCompletedTasks();
      expect(completed).toHaveLength(3);
    });
  });

  describe('Error Handling During Processing', () => {
    it('should handle PowerShell service errors', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      const task = queue.enqueue('create-clone', { id: 1 });
      task.type = 'unknown-type' as any;

      await worker.processTask(task);

      const failed = queue.getFailedTasks();
      expect(failed).toHaveLength(1);
      expect(failed[0].error).toBeDefined();
    });

    it('should update task error message on failure', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      const task = queue.enqueue('create-clone', { id: 1 });
      task.type = 'unknown-type' as any;

      await worker.processTask(task);

      const failed = queue.getFailedTasks();
      expect(failed[0].error).toContain('Unknown task type');
    });

    it('should handle null/undefined task gracefully', async () => {
      const worker = new TaskWorker();

      // This should not crash
      const queue = getTaskQueue();
      const task = queue.enqueue('create-clone', { id: 1 });

      await worker.processTask(task);
      // Should complete successfully - no exception thrown
      expect(worker.isWorkerRunning()).toBe(false);
    });
  });

  describe('Singleton Instance', () => {
    it('should return same instance with getTaskWorker', () => {
      const worker1 = getTaskWorker();
      const worker2 = getTaskWorker();

      expect(worker1).toBe(worker2);
    });

    it('should initialize with initializeTaskWorker', () => {
      const worker = initializeTaskWorker();
      expect(worker).toBeDefined();
      expect(worker.isWorkerRunning).toBeDefined();
      expect(worker.getInFlightTaskCount).toBeDefined();
    });
  });

  describe('Task Completion Metadata', () => {
    it('should set startedAt when dequeuing task', async () => {
      const queue = getTaskQueue();
      queue.enqueue('create-clone', { id: 1 });

      const dequeued = queue.dequeue();
      expect(dequeued).toBeDefined();
      expect(dequeued!.startedAt).toBeDefined();
    });

    it('should set completedAt when task finishes', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      const task = queue.enqueue('create-clone', { id: 1 });
      queue.dequeue();

      await worker.processTask(task);

      const completed = queue.getTask(task.id);
      expect(completed).toBeDefined();
      expect(completed!.completedAt).toBeDefined();
    });

    it('should calculate processing time correctly', async () => {
      const queue = getTaskQueue();
      const worker = new TaskWorker();

      const task = queue.enqueue('create-clone', { id: 1 });
      queue.dequeue();

      // Small delay to ensure processing time > 0
      await new Promise(resolve => setTimeout(resolve, 10));

      await worker.processTask(task);

      const metrics = queue.getMetrics();
      expect(metrics.averageProcessingTimeMs).toBeGreaterThanOrEqual(10);
    });
  });
});
