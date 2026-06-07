import axios from 'axios';

const API_BASE = '/api';

const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

export const waitForTaskCompletion = async (
  taskId: string,
  pollIntervalMs = 1000,
  maxAttempts = 120
) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await axios.get(`${API_BASE}/queue/tasks/${taskId}`, {
      params: { _t: Date.now() }
    });
    const task = response.data?.data || response.data;
    const status = task?.status;

    if (status === 'completed') {
      return task;
    }

    if (status === 'failed') {
      throw new Error(task?.error || 'Queued task failed');
    }

    await sleep(pollIntervalMs);
  }

  throw new Error('Timed out waiting for queued task to complete');
};
