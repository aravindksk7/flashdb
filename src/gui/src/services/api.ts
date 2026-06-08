/**
 * API Client for Clone Validation & Repair
 *
 * Provides TypeScript-typed methods for validating and repairing database clones.
 * Handles polling, error transformation, and response validation.
 */

import axios from 'axios';

const API_BASE_URL = '/api';

const normalizeValidationStatus = (status: any): ValidationResult['status'] => {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'healthy') return 'Healthy';
  if (normalized === 'unhealthy') return 'Unhealthy';
  return 'Pending';
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ValidationFinding {
  severity: 'Error' | 'Warning' | 'Info';
  code: string;
  message: string;
  affectedComponents?: string[];
}

export interface ValidationResult {
  cloneId: string;
  validationId: string;
  status: 'Healthy' | 'Unhealthy' | 'Pending';
  findings: ValidationFinding[];
  validatedAt?: string;
  duration?: {
    elapsedMs: number;
  };
}

export interface ValidationStatus {
  cloneId: string;
  validationId: string;
  status: 'Healthy' | 'Unhealthy' | 'Pending';
  findings: ValidationFinding[];
  validatedAt?: string;
  history?: ValidationResult[];
}

export interface RepairAction {
  type: string;
  description: string;
  estimatedDurationSeconds: number;
  riskLevel: 'Low' | 'Medium' | 'High';
}

export interface RepairPlan {
  actions: RepairAction[];
  estimatedDurationSeconds: number;
  requiresApproval: boolean;
}

export interface RepairPlanResponse {
  cloneId: string;
  repairId: string;
  isDryRun: boolean;
  status: 'Planned' | 'Executing' | 'Completed' | 'Failed' | 'Cancelled';
  plan: RepairPlan;
  blockers: string[];
  createdAt: string;
  expiresAt: string;
}

export interface RepairExecutionResponse {
  cloneId: string;
  repairId: string;
  isDryRun: boolean;
  taskId: string;
  status: 'Queued' | 'InProgress' | 'Completed' | 'Failed' | 'Cancelled';
  message: string;
}

export interface RepairProgress {
  current: number;
  total: number;
  percentage: number;
}

export interface RepairExecutionStatus {
  cloneId: string;
  repairId: string;
  status: 'Queued' | 'InProgress' | 'Completed' | 'Failed' | 'Cancelled';
  progress?: RepairProgress;
  currentAction?: string;
  completedAt?: string;
  result?: {
    success: boolean;
    appliedActions: string[];
    durationSeconds: number;
    errors?: string[];
  };
}

export interface ApiError {
  code: string;
  message: string;
  details?: {
    lockInfo?: {
      ownerId: string;
      acquiredAt: string;
    };
  };
  timestamp: string;
}

// ============================================================================
// ERROR CODES & MESSAGES
// ============================================================================

const ERROR_MESSAGES: Record<string, string> = {
  E001_CLONE_NOT_FOUND: 'Clone not found. Please refresh the clone list.',
  E002_VALIDATION_IN_PROGRESS: 'Validation is already running for this clone.',
  E003_REPAIR_IN_PROGRESS: 'Repair is already running for this clone.',
  E004_INVALID_REPAIR_PLAN: 'The repair plan is no longer valid.',
  E005_REPAIR_BLOCKED: 'Repair is blocked by pending operations.',
  E006_CLONE_LOCKED: 'Clone is currently locked by another operation.',
  E007_SERVICE_ERROR: 'Service error occurred. Please try again later.'
};

// ============================================================================
// API CLIENT METHODS
// ============================================================================

/**
 * Validate a clone's health status
 * Triggers async validation and returns validation ID for polling
 */
export const validateClone = async (
  cloneId: string,
  queue: boolean = true
): Promise<ValidationResult> => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/clones/${cloneId}/validate`,
      {},
      { params: { queue } }
    );

    const data = response.data?.data || response.data;
    return {
      cloneId: data.cloneId || cloneId,
      validationId: data.validationId,
      status: normalizeValidationStatus(data.status),
      findings: data.findings || [],
      validatedAt: data.validatedAt,
      duration: data.duration
    };
  } catch (error) {
    throw transformError(error);
  }
};

/**
 * Get validation status and results
 * Polls the validation status endpoint
 */
export const getValidationStatus = async (
  cloneId: string,
  validationId?: string
): Promise<ValidationStatus> => {
  try {
    const params = validationId ? { validationId } : {};
    const response = await axios.get(
      `${API_BASE_URL}/clones/${cloneId}/validation-status`,
      { params }
    );

    const data = response.data?.data || response.data;
    return {
      cloneId: data.cloneId || cloneId,
      validationId: data.validationId,
      status: normalizeValidationStatus(data.status),
      findings: data.findings || [],
      validatedAt: data.validatedAt,
      history: data.history
    };
  } catch (error) {
    throw transformError(error);
  }
};

/**
 * Get validation history for a clone
 * Returns paginated list of past validations
 */
export const getValidationHistory = async (
  cloneId: string,
  limit: number = 10,
  offset: number = 0
): Promise<ValidationResult[]> => {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/clones/${cloneId}/validation-history`,
      {
        params: { limit, offset }
      }
    );

    const data = response.data?.data || response.data || [];
    return Array.isArray(data)
      ? data.map((item: any) => ({
          cloneId: item.cloneId || cloneId,
          validationId: item.validationId,
          status: normalizeValidationStatus(item.status),
          findings: item.findings || [],
          validatedAt: item.validatedAt,
          duration: item.duration
        }))
      : [];
  } catch (error) {
    throw transformError(error);
  }
};

/**
 * Plan a repair operation (dry-run mode)
 * Returns repair plan without executing it
 */
export const planRepair = async (
  cloneId: string
): Promise<RepairPlanResponse> => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/clones/${cloneId}/repair`,
      { dryRun: true }
    );

    const data = response.data?.data || response.data;
    return {
      cloneId: data.cloneId || cloneId,
      repairId: data.repairId,
      isDryRun: true,
      status: data.status || 'Planned',
      plan: data.plan || {
        actions: [],
        estimatedDurationSeconds: 0,
        requiresApproval: true
      },
      blockers: data.blockers || [],
      createdAt: data.createdAt,
      expiresAt: data.expiresAt
    };
  } catch (error) {
    throw transformError(error);
  }
};

/**
 * Execute a repair operation
 * Queues repair task and returns task ID for polling
 */
export const executeRepair = async (
  cloneId: string
): Promise<RepairExecutionResponse> => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/clones/${cloneId}/repair`,
      { dryRun: false }
    );

    const data = response.data?.data || response.data;
    return {
      cloneId: data.cloneId || cloneId,
      repairId: data.repairId,
      isDryRun: false,
      taskId: data.taskId,
      status: data.status || 'Queued',
      message: data.message || 'Repair queued'
    };
  } catch (error) {
    throw transformError(error);
  }
};

/**
 * Get repair execution status and progress
 * Polls the repair status endpoint with taskId
 */
export const getRepairStatus = async (
  cloneId: string,
  taskId?: string
): Promise<RepairExecutionStatus> => {
  try {
    const params = taskId ? { taskId } : {};
    const response = await axios.get(
      `${API_BASE_URL}/clones/${cloneId}/repair-status`,
      { params }
    );

    const data = response.data?.data || response.data;
    return {
      cloneId: data.cloneId || cloneId,
      repairId: data.repairId,
      status: data.status || 'Queued',
      progress: data.progress,
      currentAction: data.currentAction,
      completedAt: data.completedAt,
      result: data.result
    };
  } catch (error) {
    throw transformError(error);
  }
};

/**
 * Cancel an in-progress repair
 */
export const cancelRepair = async (
  cloneId: string,
  repairId: string,
  taskId?: string | null
): Promise<{ status: string; message: string }> => {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/clones/${cloneId}/repair/cancel`,
      {},
      {
        params: {
          repairId,
          ...(taskId ? { taskId } : {})
        }
      }
    );

    const data = response.data?.data || response.data;
    return {
      status: data.status || 'Cancelled',
      message: data.message || 'Repair cancelled'
    };
  } catch (error) {
    throw transformError(error);
  }
};

// ============================================================================
// ERROR HANDLING
// ============================================================================

interface TransformedError extends Error {
  code?: string;
  statusCode?: number;
  details?: any;
  lockInfo?: {
    ownerId: string;
    acquiredAt: string;
  };
}

const transformError = (error: any): TransformedError => {
  const result: TransformedError = new Error();

  if (axios.isAxiosError(error) && error.response) {
    const status = error.response.status;
    const apiError: ApiError = error.response.data?.error || error.response.data;

    result.code = apiError.code || `HTTP_${status}`;
    result.statusCode = status;
    result.message =
      ERROR_MESSAGES[apiError.code] ||
      apiError.message ||
      'An error occurred';
    result.details = apiError.details;

    if (apiError.details?.lockInfo) {
      result.lockInfo = apiError.details.lockInfo;
    }

    // Handle specific status codes
    if (status === 404) {
      result.message = ERROR_MESSAGES.E001_CLONE_NOT_FOUND;
      result.code = 'E001_CLONE_NOT_FOUND';
    } else if (status === 409) {
      // Conflict - determine which type
      if (result.code?.includes('VALIDATION')) {
        result.message = ERROR_MESSAGES.E002_VALIDATION_IN_PROGRESS;
        result.code = 'E002_VALIDATION_IN_PROGRESS';
      } else if (result.code?.includes('REPAIR')) {
        result.message = ERROR_MESSAGES.E003_REPAIR_IN_PROGRESS;
        result.code = 'E003_REPAIR_IN_PROGRESS';
      } else {
        result.message = ERROR_MESSAGES.E006_CLONE_LOCKED;
        result.code = 'E006_CLONE_LOCKED';
      }
    } else if (status === 503) {
      result.message = ERROR_MESSAGES.E007_SERVICE_ERROR;
      result.code = 'E007_SERVICE_ERROR';
    }
  } else if (error instanceof Error) {
    result.message = error.message;
    result.code = 'UNKNOWN_ERROR';
  } else {
    result.message = 'An unknown error occurred';
    result.code = 'UNKNOWN_ERROR';
  }

  return result;
};

export const getErrorMessage = (error: any): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
};

export const isLockConflict = (error: any): boolean => {
  return (
    error?.statusCode === 409 &&
    (error?.code?.includes('LOCKED') ||
      error?.code?.includes('VALIDATION_IN_PROGRESS') ||
      error?.code?.includes('REPAIR_IN_PROGRESS'))
  );
};

export const getLockInfo = (error: any): { ownerId: string; acquiredAt: string } | null => {
  return error?.lockInfo || null;
};
