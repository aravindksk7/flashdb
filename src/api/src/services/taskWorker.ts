import { getTaskQueue, Task } from './taskQueue';
import { getPooledPowerShellService } from './pooledPowershellService';
import logger from '../logger';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Base delay, will be exponential
const POLL_INTERVAL_MS = 5000; // Check queue every 5 seconds

class TaskWorker {
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private inFlightTasks: Set<string> = new Set();

  async startWorker(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Task worker is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting task worker');

    this.pollInterval = setInterval(() => {
      this.processNextTask().catch(error => {
        logger.error(`Error in task worker poll: ${error.message}`);
      });
    }, POLL_INTERVAL_MS);
  }

  async stopWorker(gracefulWaitMs: number = 5000): Promise<void> {
    if (!this.isRunning) {
      logger.warn('Task worker is not running');
      return;
    }

    logger.info('Stopping task worker gracefully');
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
        logger.warn(`Grace period expired with ${this.inFlightTasks.size} tasks still in flight`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info('Task worker stopped');
  }

  private async processNextTask(): Promise<void> {
    if (!this.isRunning) return;

    const taskQueue = getTaskQueue();
    const task = taskQueue.dequeue();

    if (!task) return;

    this.inFlightTasks.add(task.id);

    try {
      await this.processTask(task);
    } catch (error: any) {
      logger.error(`Unhandled error processing task ${task.id}: ${error.message}`);
    } finally {
      this.inFlightTasks.delete(task.id);
    }
  }

  async processTask(task: Task): Promise<void> {
    const taskQueue = getTaskQueue();
    const psService = getPooledPowerShellService();

    try {
      logger.info(`Processing task: ${task.id} (${task.type})`);

      let result: any;

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

      logger.info(`Task completed successfully: ${task.id}`);
      taskQueue.updateTask(task.id, 'completed', result);
    } catch (error: any) {
      const errorMessage = error.message || String(error);
      logger.error(`Task failed: ${task.id}, error: ${errorMessage}, retry: ${task.retryCount}/${MAX_RETRIES}`);

      if (task.retryCount < MAX_RETRIES) {
        // Retry with exponential backoff
        task.retryCount++;
        const delayMs = RETRY_DELAY_MS * Math.pow(2, task.retryCount - 1);
        logger.info(`Retrying task ${task.id} in ${delayMs}ms (attempt ${task.retryCount}/${MAX_RETRIES})`);

        // Schedule retry by putting task back to pending after delay
        setTimeout(() => {
          const taskQueue = getTaskQueue();
          taskQueue.retryTask(task.id);
        }, delayMs);
      } else {
        // Max retries exceeded
        const taskQueue = getTaskQueue();
        taskQueue.updateTask(task.id, 'failed', undefined, errorMessage);
      }
    }
  }

  isWorkerRunning(): boolean {
    return this.isRunning;
  }

  getInFlightTaskCount(): number {
    return this.inFlightTasks.size;
  }
}

// Singleton instance
let workerInstance: TaskWorker | null = null;

export function getTaskWorker(): TaskWorker {
  if (!workerInstance) {
    workerInstance = new TaskWorker();
  }
  return workerInstance;
}

export function initializeTaskWorker(): TaskWorker {
  return getTaskWorker();
}

export function resetTaskWorkerForTesting(): void {
  workerInstance = null;
}

export { TaskWorker };
