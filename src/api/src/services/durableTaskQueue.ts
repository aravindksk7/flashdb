import { getPgQueueManager } from './pgQueueManager';
import { getTaskQueue, Task, TaskType } from './taskQueue';
import logger from '../logger';

export async function enqueueTask(type: TaskType, payload: Record<string, any>): Promise<Task> {
  const taskQueue = getTaskQueue();

  try {
    const queueManager = getPgQueueManager();
    if (queueManager.isInitialized()) {
      const task = await queueManager.enqueueWithPersistence(type, payload);
      return taskQueue.enqueueExisting(task);
    }
  } catch (error: any) {
    logger.warn(`Persistent enqueue unavailable for ${type}: ${error.message}. Falling back to file queue.`);
  }

  return taskQueue.enqueue(type, payload);
}
