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

/**
 * Poll validation status until completion or timeout
 */
export const waitForValidationCompletion = async (
  cloneId: string,
  validationId: string,
  pollIntervalMs = 2000,
  maxAttempts = 60
) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await axios.get(
      `${API_BASE}/clones/${cloneId}/validation-status`,
      { params: { validationId, _t: Date.now() } }
    );
    const validation = response.data?.data || response.data;
    const status = validation?.status;

    if (status === 'Healthy' || status === 'Unhealthy') {
      return validation;
    }

    if (status === 'Error' || status === 'Failed') {
      throw new Error(validation?.error || 'Validation failed');
    }

    await sleep(pollIntervalMs);
  }

  throw new Error('Timed out waiting for validation to complete');
};

/**
 * Poll repair status until completion or timeout
 */
export const waitForRepairCompletion = async (
  cloneId: string,
  taskId: string,
  pollIntervalMs = 2000,
  maxAttempts = 120
) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await axios.get(
      `${API_BASE}/clones/${cloneId}/repair-status`,
      { params: { taskId, _t: Date.now() } }
    );
    const repair = response.data?.data || response.data;
    const status = repair?.status;

    if (status === 'Completed' || status === 'Failed' || status === 'Cancelled') {
      return repair;
    }

    await sleep(pollIntervalMs);
  }

  throw new Error('Timed out waiting for repair to complete');
};
