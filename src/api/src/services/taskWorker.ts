import { getTaskQueue, Task } from './taskQueue';
import { getPooledPowerShellService } from './pooledPowershellService';
import { getMetadataService } from './metadataService';
import { getPgQueueManager } from './pgQueueManager';
import { getCheckpointOperationRepository, getCheckpointRepository } from './repository';
import { getCloneValidationService } from './cloneValidationService';
import { getAuditMetricsService } from './auditMetricsService';
import logger from '../logger';
import { invalidateCache } from '../middleware/caching';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Base delay, will be exponential
const POLL_INTERVAL_MS = 5000; // Check queue every 5 seconds

class TaskWorker {
  private isRunning: boolean = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private inFlightTasks: Set<string> = new Set();
  private usePersistence: boolean = false; // Whether to use DB persistence

  async startWorker(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Task worker is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting task worker');

    // Check if DB persistence is enabled
    const persistMode = process.env.QUEUE_PERSIST_MODE || 'db';
    if (persistMode === 'db') {
      try {
        const pgQueueManager = getPgQueueManager();
        if (pgQueueManager.isInitialized()) {
          this.usePersistence = true;
          // Load pending tasks from DB on startup
          const pendingTasks = await pgQueueManager.loadQueueFromDB();
          const taskQueue = getTaskQueue();
          for (const task of pendingTasks) {
            // Add to in-memory queue if not already there
            const existing = taskQueue.getTask(task.id);
            if (!existing) {
              // Reconstruct task in memory queue
              taskQueue.enqueue(task.type, task.payload);
            }
          }
          logger.info(`Loaded ${pendingTasks.length} tasks from DB for recovery`);
        }
      } catch (error: any) {
        logger.warn(`DB persistence not available: ${error.message}. Falling back to file persistence.`);
        this.usePersistence = false;
      }
    }

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
    const operationRepo = getCheckpointOperationRepository();
    const validationService = getCloneValidationService();
    const auditService = getAuditMetricsService();
    let operationId: string | null = null;

    try {
      logger.info(`Processing task: ${task.id} (${task.type})`);

      // Create operation record for checkpoint operations
      if (
        task.type === 'create-checkpoint' ||
        task.type === 'restore-checkpoint' ||
        task.type === 'delete-checkpoint'
      ) {
        // For create operations, checkpointId doesn't exist yet
        if (task.type !== 'create-checkpoint') {
          try {
            const operation = await operationRepo.create(
              task.payload.checkpointId,
              task.payload.cloneId,
              task.type.replace('-checkpoint', '') as any,
              task.payload.vhdxPath || ''
            );
            operationId = operation.id;
            logger.info(`Created operation record: ${operationId}`);
          } catch (operationError: any) {
            logger.warn(
              `Skipping checkpoint operation record for task ${task.id}: ${operationError.message}`
            );
          }
        }
      }

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
          if (task.payload.attachAfterCreate === true && result && typeof result === 'object') {
            await psService.executeCommandRaw('Connect-FlashdbClone', {
              CloneId: (result as any).Id || (result as any).id,
              InstancePath: task.payload.instancePath
            });
            (result as any).Status = 'Attached';
          }
          break;

        case 'delete-clone':
          // Use MetadataService for delete (cascades to checkpoints)
          logger.info(`[TaskWorker] Deleting clone via MetadataService: ${task.payload.cloneId}`);
          try {
            const metadataService = getMetadataService();
            await metadataService.deleteClone(task.payload.cloneId);
            result = {
              success: true,
              message: `Clone ${task.payload.cloneId} and all dependent checkpoints deleted`
            };
            logger.info(`[TaskWorker] Clone deleted successfully: ${task.payload.cloneId}`);
          } catch (error: any) {
            logger.error(`[TaskWorker] Failed to delete clone: ${error.message}`);
            throw error;
          }
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
          result = await psService.executeCommand('Restore-FlashdbCheckpoint', {
            CloneId: task.payload.cloneId,
            CheckpointId: task.payload.checkpointId,
            ReattachAfter: task.payload.reattachAfter !== false,
            Force: true
          });

          // Mark checkpoint as restored in database
          try {
            const checkpointRepo = getCheckpointRepository();
            await checkpointRepo.markAsRestored(task.payload.checkpointId);
            logger.info(`Marked checkpoint ${task.payload.checkpointId} as restored in database`);
          } catch (dbError: any) {
            logger.warn(`Failed to update checkpoint restoration timestamp: ${dbError.message}`);
            // Don't fail the restore if DB update fails - the restore still succeeded
          }
          break;

        case 'delete-checkpoint':
          // Use MetadataService for delete with pinned protection
          logger.info(`[TaskWorker] Deleting checkpoint via MetadataService: ${task.payload.checkpointId}`);
          try {
            const metadataService = getMetadataService();
            await metadataService.deleteCheckpoint(
              task.payload.cloneId,
              task.payload.checkpointId
            );
            result = {
              success: true,
              checkpointId: task.payload.checkpointId,
              cloneId: task.payload.cloneId,
              message: 'Checkpoint deleted successfully'
            };
            logger.info(`[TaskWorker] Checkpoint deleted: ${task.payload.checkpointId}`);
          } catch (error: any) {
            // Check if error is due to pinned checkpoint
            if (/pinned/i.test(error.message)) {
              logger.warn(`[TaskWorker] Checkpoint is pinned: ${task.payload.checkpointId}`);
              throw new Error(`Cannot delete pinned checkpoint. Unpin first.`);
            }
            logger.error(`[TaskWorker] Failed to delete checkpoint: ${error.message}`);
            throw error;
          }
          break;

        case 'validate-clone': {
          const cloneId = task.payload.cloneId;
          const validationId = task.payload.validationId || `validation-${cloneId}-${Date.now()}`;
          const startedAt = Date.now();
          const validation = await validationService.validateClone(cloneId);

          await auditService.recordValidationComplete(
            cloneId,
            validationId,
            validation.findings,
            validation.isHealthy
          );

          result = {
            cloneId,
            validationId,
            status: validation.isHealthy ? 'Healthy' : 'Unhealthy',
            findings: validation.findings,
            validatedAt: validation.validatedAt.toISOString(),
            duration: {
              elapsedMs: Date.now() - startedAt
            }
          };
          break;
        }

        case 'repair-clone': {
          const cloneId = task.payload.cloneId;
          const repairId = task.payload.repairId || `repair-${cloneId}-${Date.now()}`;
          const startedAt = Date.now();
          const attempt = await validationService.executeRepair(cloneId, false);
          const success = attempt.result === 'Success' || attempt.result === 'Skipped';

          await auditService.recordRepairComplete(
            cloneId,
            repairId,
            success,
            attempt.attemptedActions
          );

          result = {
            cloneId,
            repairId,
            status: success ? 'Completed' : 'Failed',
            success,
            appliedActions: attempt.attemptedActions.map(action => action.message || action.action),
            durationSeconds: Math.round((Date.now() - startedAt) / 1000),
            errors: success ? [] : [attempt.resultMessage]
          };
          break;
        }

        default:
          throw new Error(`Unknown task type: ${task.type}`);
      }

      logger.info(`Task completed successfully: ${task.id}`);
      taskQueue.updateTask(task.id, 'completed', result);

      if (
        task.type === 'create-checkpoint' ||
        task.type === 'restore-checkpoint' ||
        task.type === 'delete-checkpoint' ||
        task.type === 'validate-clone' ||
        task.type === 'repair-clone'
      ) {
        invalidateCache(task.type.includes('checkpoint') ? ['/checkpoints', '/metrics'] : ['/clones', '/metrics']);
      }

      // Update operation record if applicable
      if (operationId) {
        try {
          await operationRepo.update(
            operationId,
            'completed',
            new Date(),
            undefined,
            result?.stateHash || result?.postHash
          );
        } catch (operationError: any) {
          logger.warn(
            `Failed to update checkpoint operation record ${operationId}: ${operationError.message}`
          );
        }
      }

      // Update DB if persistence is enabled
      if (this.usePersistence) {
        const pgQueueManager = getPgQueueManager();
        await pgQueueManager.updateTaskStatus(task.id, 'completed', undefined, result);
      }
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

        // Update operation record if applicable
        if (operationId) {
          try {
            await operationRepo.update(
              operationId,
              'failed',
              new Date(),
              errorMessage
            );
          } catch (operationError: any) {
            logger.warn(
              `Failed to mark checkpoint operation record ${operationId} failed: ${operationError.message}`
            );
          }
        }

        // Update DB if persistence is enabled
        if (this.usePersistence) {
          const pgQueueManager = getPgQueueManager();
          await pgQueueManager.updateTaskStatus(task.id, 'failed', errorMessage);
        }
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
