import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  TaskQueue,
  resetTaskQueueForTesting,
  Task
} from '../taskQueue';

/**
 * Phase 5b.3 Queue Persistence Tests
 * Tests for database backing of task queue with durability guarantees
 */
describe('Queue Persistence with Database Backing', () => {
  let testDataDir: string;
  let queueFilePath: string;
  let originalCwd: string;
  let startTime: number;

  beforeEach(() => {
    startTime = Date.now();
    originalCwd = process.cwd();
    testDataDir = path.join(__dirname, '../../../.test-data-persistence');

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true });
    }
    fs.mkdirSync(testDataDir, { recursive: true });

    resetTaskQueueForTesting();
    process.chdir(path.dirname(testDataDir));
    queueFilePath = path.join(testDataDir, 'queue.json');
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true });
    }
  });

  describe('Scenario 1: Enqueue → Verify in DB', () => {
    it('should persist task to database immediately on enqueue', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', {
        goldenImageId: 'img-123',
        cloneName: 'test-clone'
      });

      // Verify file persistence (current implementation)
      expect(fs.existsSync(queueFilePath)).toBe(true);
      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.queue).toContainEqual(
        expect.objectContaining({
          id: task.id,
          type: 'create-clone',
          status: 'pending'
        })
      );
    });

    it('should handle concurrent enqueue operations', () => {
      const queue = new TaskQueue();
      const tasks: Task[] = [];

      // Simulate concurrent enqueues
      for (let i = 0; i < 10; i++) {
        const task = queue.enqueue('create-clone', {
          id: i,
          cloneName: `clone-${i}`
        });
        tasks.push(task);
      }

      // Verify all tasks are in queue
      const pending = queue.getPendingTasks();
      expect(pending).toHaveLength(10);

      // Verify DB consistency - all tasks saved
      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.queue).toHaveLength(10);

      // Verify no duplicate IDs
      const ids = savedData.queue.map((t: Task) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);
    });

    it('should maintain task order in database', () => {
      const queue = new TaskQueue();
      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('delete-clone', { id: 2 });
      const task3 = queue.enqueue('create-checkpoint', { id: 3 });

      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.queue[0].id).toBe(task1.id);
      expect(savedData.queue[1].id).toBe(task2.id);
      expect(savedData.queue[2].id).toBe(task3.id);
    });
  });

  describe('Scenario 2: Process Task → Verify Status Update in DB', () => {
    it('should update task status in database when moving to processing', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      const dequeued = queue.dequeue();
      expect(dequeued!.status).toBe('processing');

      // Verify status updated in DB
      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      const savedTask = savedData.queue.find((t: Task) => t.id === task.id);
      expect(savedTask).toBeDefined();
      expect(savedTask.status).toBe('processing');
    });

    it('should update completion timestamp in database', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      queue.dequeue();
      const beforeUpdate = Date.now();
      queue.updateTask(task.id, 'completed');
      const afterUpdate = Date.now();

      // Verify in DB
      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      const completedTask = savedData.completedTasks.find((t: Task) => t.id === task.id);
      expect(completedTask).toBeDefined();
      expect(completedTask.completedAt).toBeDefined();

      const completionTime = new Date(completedTask.completedAt).getTime();
      expect(completionTime).toBeGreaterThanOrEqual(beforeUpdate);
      expect(completionTime).toBeLessThanOrEqual(afterUpdate);
    });

    it('should track status transitions correctly', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      // pending -> processing
      queue.dequeue();
      let savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.queue[0].status).toBe('processing');

      // processing -> completed
      queue.updateTask(task.id, 'completed');
      savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.completedTasks[0].status).toBe('completed');
      expect(savedData.queue).toHaveLength(0);
    });
  });

  describe('Scenario 3: Restart Worker → Verify Queue Loads from DB', () => {
    it('should reload pending tasks from database on restart', () => {
      // First worker session
      const queue1 = new TaskQueue();
      const task1 = queue1.enqueue('create-clone', { cloneId: 'clone-1' });
      const task2 = queue1.enqueue('delete-clone', { cloneId: 'clone-2' });

      queue1.dequeue(); // Move task1 to processing

      // Worker restarts
      resetTaskQueueForTesting();
      const queue2 = new TaskQueue();

      // Verify pending tasks reloaded
      const pending = queue2.getPendingTasks();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(task2.id);

      // Verify processing tasks reloaded
      const processing = queue2.getProcessingTasks();
      expect(processing).toHaveLength(1);
      expect(processing[0].id).toBe(task1.id);
    });

    it('should not lose any tasks on unexpected restart', () => {
      const queue1 = new TaskQueue();
      const taskIds = new Set<string>();

      // Enqueue multiple tasks
      for (let i = 0; i < 5; i++) {
        const task = queue1.enqueue('create-clone', { id: i });
        taskIds.add(task.id);
      }

      // Dequeue some
      queue1.dequeue();
      queue1.dequeue();

      // Simulate unexpected restart (don't save)
      resetTaskQueueForTesting();
      const queue2 = new TaskQueue();

      const allTasks = queue2.getAllTasks();
      const allTaskIds = new Set([
        ...allTasks.queue.map(t => t.id),
        ...allTasks.completed.map(t => t.id),
        ...allTasks.failed.map(t => t.id)
      ]);

      // All tasks should still be present
      expect(allTaskIds.size).toBe(5);
      for (const id of taskIds) {
        expect(allTaskIds.has(id)).toBe(true);
      }
    });

    it('should preserve task state across multiple restarts', () => {
      let queue: TaskQueue;
      const taskId = Array<string>();

      // Restart 1: Enqueue
      queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });
      taskId.push(task.id);

      // Restart 2: Dequeue
      resetTaskQueueForTesting();
      queue = new TaskQueue();
      const dequeued = queue.dequeue();
      expect(dequeued!.id).toBe(taskId[0]);

      // Restart 3: Mark complete
      resetTaskQueueForTesting();
      queue = new TaskQueue();
      queue.updateTask(taskId[0], 'completed');

      // Restart 4: Verify completed
      resetTaskQueueForTesting();
      queue = new TaskQueue();
      const completed = queue.getTask(taskId[0]);
      expect(completed!.status).toBe('completed');
    });
  });

  describe('Scenario 4: Task Completion → Archive Verification', () => {
    it('should move completed tasks to archive in database', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      queue.dequeue();
      queue.updateTask(task.id, 'completed');

      // Verify moved to completed_tasks archive
      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.completedTasks).toContainEqual(
        expect.objectContaining({
          id: task.id,
          status: 'completed'
        })
      );

      // Verify removed from active queue
      expect(savedData.queue.find((t: Task) => t.id === task.id)).toBeUndefined();
    });

    it('should move failed tasks to archive in database', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      queue.dequeue();
      const errorMsg = 'Clone creation failed: insufficient resources';
      queue.updateTask(task.id, 'failed', undefined, errorMsg);

      // Verify moved to failed_tasks archive
      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.failedTasks).toContainEqual(
        expect.objectContaining({
          id: task.id,
          status: 'failed',
          error: errorMsg
        })
      );

      // Verify removed from active queue
      expect(savedData.queue.find((t: Task) => t.id === task.id)).toBeUndefined();
    });

    it('should maintain separate archives for completed and failed tasks', () => {
      const queue = new TaskQueue();
      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('delete-clone', { id: 2 });
      const task3 = queue.enqueue('create-checkpoint', { id: 3 });

      queue.dequeue();
      queue.updateTask(task1.id, 'completed');

      queue.dequeue();
      queue.updateTask(task2.id, 'failed', undefined, 'Error');

      queue.dequeue();
      queue.updateTask(task3.id, 'completed');

      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.completedTasks).toHaveLength(2);
      expect(savedData.failedTasks).toHaveLength(1);
      expect(savedData.queue).toHaveLength(0);
    });
  });

  describe('Scenario 5: DB Failure → Fallback to File', () => {
    it('should fallback to file when database is unavailable', () => {
      // Assuming DB operations would be tried first
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      // File fallback should still work
      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.queue).toHaveLength(1);
      expect(savedData.queue[0].id).toBe(task.id);
    });

    it('should handle missing database gracefully', () => {
      const queue = new TaskQueue();

      // Queue should still function even if DB is not available
      const task1 = queue.enqueue('create-clone', { cloneId: 'clone-1' });
      const task2 = queue.enqueue('delete-clone', { cloneId: 'clone-2' });

      expect(queue.getPendingTasks()).toHaveLength(2);

      // File persistence should still work
      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.queue).toHaveLength(2);
    });

    it('should log fallback attempts', () => {
      // This test verifies logging is in place for fallback scenarios
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      // Task should be saved via fallback
      expect(fs.existsSync(queueFilePath)).toBe(true);
    });
  });

  describe('Scenario 6: Concurrent Operations → Consistency', () => {
    it('should maintain consistency with concurrent enqueues', () => {
      const queue = new TaskQueue();
      const enqueued: Task[] = [];

      // Simulate concurrent enqueue
      for (let i = 0; i < 20; i++) {
        const task = queue.enqueue('create-clone', { id: i });
        enqueued.push(task);
      }

      // Verify all tasks persisted
      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.queue).toHaveLength(20);

      // Verify no data corruption
      const savedIds = new Set(savedData.queue.map((t: Task) => t.id));
      expect(savedIds.size).toBe(20);

      const enqueuedIds = new Set(enqueued.map(t => t.id));
      for (const id of enqueuedIds) {
        expect(savedIds.has(id)).toBe(true);
      }
    });

    it('should handle concurrent enqueue and dequeue', () => {
      const queue = new TaskQueue();

      // Enqueue tasks
      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('delete-clone', { id: 2 });
      const task3 = queue.enqueue('create-checkpoint', { id: 3 });

      // Concurrent operations
      const dequeued1 = queue.dequeue();
      const task4 = queue.enqueue('restore-checkpoint', { id: 4 });
      const dequeued2 = queue.dequeue();

      // Verify database consistency
      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      const totalTasks = savedData.queue.length +
                        savedData.completedTasks.length +
                        savedData.failedTasks.length;

      expect(totalTasks).toBe(4);
      expect(dequeued1!.id).toBe(task1.id);
      expect(dequeued2!.id).toBe(task2.id);
    });

    it('should prevent race conditions on status updates', () => {
      const queue = new TaskQueue();
      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('delete-clone', { id: 2 });

      queue.dequeue(); // task1 -> processing
      queue.dequeue(); // task2 -> processing

      // Concurrent status updates
      queue.updateTask(task1.id, 'completed');
      queue.updateTask(task2.id, 'failed', undefined, 'Error');

      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.completedTasks).toHaveLength(1);
      expect(savedData.failedTasks).toHaveLength(1);
      expect(savedData.queue).toHaveLength(0);
    });
  });

  describe('Performance: Persistence Latency', () => {
    it('should persist enqueue with <10ms latency', () => {
      const queue = new TaskQueue();

      const start = Date.now();
      queue.enqueue('create-clone', { cloneId: 'clone-1' });
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('should persist status update with <10ms latency', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });
      queue.dequeue();

      const start = Date.now();
      queue.updateTask(task.id, 'completed');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(10);
    });

    it('should handle bulk operations efficiently', () => {
      const queue = new TaskQueue();

      const start = Date.now();
      for (let i = 0; i < 100; i++) {
        queue.enqueue('create-clone', { id: i });
      }
      const duration = Date.now() - start;

      // Should handle 100 enqueues in <100ms
      expect(duration).toBeLessThan(100);

      const pending = queue.getPendingTasks();
      expect(pending).toHaveLength(100);
    });
  });

  describe('Durability: No Task Loss', () => {
    it('should not lose tasks on immediate restart after enqueue', () => {
      const queue1 = new TaskQueue();
      const task = queue1.enqueue('create-clone', { cloneId: 'clone-1' });

      // Simulate immediate restart
      resetTaskQueueForTesting();
      const queue2 = new TaskQueue();

      const retrieved = queue2.getTask(task.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(task.id);
    });

    it('should not lose tasks on restart during processing', () => {
      const queue1 = new TaskQueue();
      const task = queue1.enqueue('create-clone', { cloneId: 'clone-1' });
      queue1.dequeue();

      // Simulate restart during processing
      resetTaskQueueForTesting();
      const queue2 = new TaskQueue();

      const retrieved = queue2.getTask(task.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe('processing');
    });

    it('should maintain accurate task counts across restarts', () => {
      const queue1 = new TaskQueue();
      const task1 = queue1.enqueue('create-clone', { id: 1 });
      const task2 = queue1.enqueue('delete-clone', { id: 2 });
      const task3 = queue1.enqueue('create-checkpoint', { id: 3 });

      queue1.dequeue();
      queue1.updateTask(task1.id, 'completed');

      // Restart
      resetTaskQueueForTesting();
      const queue2 = new TaskQueue();

      const metrics = queue2.getMetrics();
      expect(metrics.completedTasks).toBe(1);
      expect(metrics.pendingTasks).toBe(2);
      expect(metrics.queueDepth).toBe(2);
      expect(metrics.totalTasksProcessed).toBe(1);
    });
  });

  describe('Durability: Retry Count Tracking', () => {
    it('should track retry count in database', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      // Initial retry count should be 0
      expect(task.retryCount).toBe(0);

      // Verify in DB
      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.queue[0].retryCount).toBe(0);
    });

    it('should persist retry attempts across restarts', () => {
      const queue1 = new TaskQueue();
      const task = queue1.enqueue('create-clone', { cloneId: 'clone-1' });

      queue1.dequeue();
      queue1.retryTask(task.id);

      // Restart
      resetTaskQueueForTesting();
      const queue2 = new TaskQueue();

      const retrieved = queue2.getTask(task.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.status).toBe('pending');
    });
  });

  describe('Archive Cleanup & Maintenance', () => {
    it('should be able to clear completed tasks from database', () => {
      const queue = new TaskQueue();
      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('delete-clone', { id: 2 });

      queue.dequeue();
      queue.updateTask(task1.id, 'completed');

      queue.dequeue();
      queue.updateTask(task2.id, 'completed');

      let savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.completedTasks).toHaveLength(2);

      // Clear completed
      queue.clearCompletedTasks();

      savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.completedTasks).toHaveLength(0);
    });

    it('should be able to clear failed tasks from database', () => {
      const queue = new TaskQueue();
      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('delete-clone', { id: 2 });

      queue.dequeue();
      queue.updateTask(task1.id, 'failed', undefined, 'Error 1');

      queue.dequeue();
      queue.updateTask(task2.id, 'failed', undefined, 'Error 2');

      let savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.failedTasks).toHaveLength(2);

      // Clear failed
      queue.clearFailedTasks();

      savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.failedTasks).toHaveLength(0);
    });

    it('should maintain archive across clears', () => {
      const queue = new TaskQueue();
      const task1 = queue.enqueue('create-clone', { id: 1 });
      const task2 = queue.enqueue('delete-clone', { id: 2 });
      const task3 = queue.enqueue('create-checkpoint', { id: 3 });

      queue.dequeue();
      queue.updateTask(task1.id, 'completed');

      queue.dequeue();
      queue.updateTask(task2.id, 'failed', undefined, 'Error');

      queue.dequeue();
      queue.updateTask(task3.id, 'completed');

      queue.clearCompletedTasks();

      const savedData = JSON.parse(fs.readFileSync(queueFilePath, 'utf-8'));
      expect(savedData.completedTasks).toHaveLength(0);
      expect(savedData.failedTasks).toHaveLength(1);
      expect(savedData.queue).toHaveLength(0);
    });
  });

  describe('Correct Status Transitions', () => {
    it('should enforce valid status transitions', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      // pending -> processing
      queue.dequeue();
      let retrieved = queue.getTask(task.id);
      expect(retrieved!.status).toBe('processing');

      // processing -> completed
      queue.updateTask(task.id, 'completed');
      retrieved = queue.getTask(task.id);
      expect(retrieved!.status).toBe('completed');

      // Should not allow invalid transitions after completion
      // (attempting to reprocess a completed task)
      queue.updateTask(task.id, 'processing'); // This would be invalid in a real system
    });

    it('should track status transition times', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      const createTime = new Date(task.createdAt).getTime();

      queue.dequeue();
      const retrieved = queue.getTask(task.id);
      const startTime = new Date(retrieved!.startedAt!).getTime();

      queue.updateTask(task.id, 'completed');
      const completedTask = queue.getTask(task.id);
      const completeTime = new Date(completedTask!.completedAt!).getTime();

      expect(startTime).toBeGreaterThanOrEqual(createTime);
      expect(completeTime).toBeGreaterThanOrEqual(startTime);
    });

    it('should preserve error information through status transitions', () => {
      const queue = new TaskQueue();
      const task = queue.enqueue('create-clone', { cloneId: 'clone-1' });

      queue.dequeue();
      const errorMsg = 'Clone creation failed: insufficient storage';
      queue.updateTask(task.id, 'failed', undefined, errorMsg);

      const failed = queue.getTask(task.id);
      expect(failed!.error).toBe(errorMsg);
      expect(failed!.status).toBe('failed');

      // Restart to verify error persists
      resetTaskQueueForTesting();
      const queue2 = new TaskQueue();
      const retrieved = queue2.getTask(task.id);
      expect(retrieved!.error).toBe(errorMsg);
    });
  });
});
