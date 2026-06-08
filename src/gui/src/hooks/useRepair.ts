/**
 * useRepair Hook
 *
 * Manages repair state machine with approval workflow
 * States: idle → planning → approval → executing → completed/error
 */

import { useState, useCallback, useRef } from 'react';
import {
  planRepair,
  executeRepair,
  getRepairStatus,
  cancelRepair,
  RepairPlanResponse,
  RepairExecutionStatus,
  getErrorMessage,
  isLockConflict,
  getLockInfo
} from '../services/api';

export type RepairState = 'idle' | 'planning' | 'approval' | 'executing' | 'completed' | 'error';

export interface UseRepairReturn {
  state: RepairState;
  plan: RepairPlanResponse | null;
  execution: RepairExecutionStatus | null;
  error: string | null;
  errorCode: string | null;
  lockInfo: { ownerId: string; acquiredAt: string } | null;
  approved: boolean;
  setApproved: (approved: boolean) => void;
  startPlanning: () => Promise<void>;
  startExecution: (approvedOverride?: boolean) => Promise<void>;
  pollExecution: () => Promise<void>;
  cancelExecution: () => Promise<void>;
  reset: () => void;
}

export const useRepair = (cloneId: string): UseRepairReturn => {
  const [state, setState] = useState<RepairState>('idle');
  const [plan, setPlan] = useState<RepairPlanResponse | null>(null);
  const [execution, setExecution] = useState<RepairExecutionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [lockInfo, setLockInfo] = useState<{ ownerId: string; acquiredAt: string } | null>(null);
  const [approved, setApproved] = useState(false);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const taskIdRef = useRef<string | null>(null);

  const clearTimeout = useCallback(() => {
    if (pollingTimeoutRef.current) {
      global.clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, []);

  const startPlanning = useCallback(async () => {
    try {
      clearTimeout();
      setState('planning');
      setError(null);
      setErrorCode(null);
      setLockInfo(null);
      setApproved(false);

      const repairPlan = await planRepair(cloneId);
      setPlan(repairPlan);

      // Check for blockers
      if (repairPlan.blockers && repairPlan.blockers.length > 0) {
        setError(`Repair blocked: ${repairPlan.blockers[0]}`);
        setErrorCode('E005_REPAIR_BLOCKED');
        setState('error');
        return;
      }

      // Move to approval step
      setState('approval');
    } catch (err: any) {
      setError(getErrorMessage(err));
      setErrorCode(err.code || null);
      if (isLockConflict(err)) {
        setLockInfo(getLockInfo(err));
      }
      setState('error');
    }
  }, [cloneId, clearTimeout]);

  const startExecution = useCallback(async (approvedOverride = false) => {
    if (!approved && !approvedOverride) {
      setError('Repair must be approved before execution');
      setState('error');
      return;
    }

    try {
      clearTimeout();
      setState('executing');
      setError(null);
      setErrorCode(null);

      const executionResult = await executeRepair(cloneId);
      taskIdRef.current = executionResult.taskId;

      setExecution({
        cloneId: executionResult.cloneId,
        repairId: executionResult.repairId,
        status: executionResult.status,
        progress: undefined
      });

      // Start polling
      await pollExecutionInternal(executionResult.taskId);
    } catch (err: any) {
      setError(getErrorMessage(err));
      setErrorCode(err.code || null);
      if (isLockConflict(err)) {
        setLockInfo(getLockInfo(err));
      }
      setState('error');
    }
  }, [approved, cloneId, clearTimeout]);

  const pollExecutionInternal = useCallback(
    async (taskId: string) => {
      try {
        const status = await getRepairStatus(cloneId, taskId);
        setExecution(status);

        if (
          status.status === 'Queued' ||
          status.status === 'InProgress'
        ) {
          // Still in progress, schedule another poll
          pollingTimeoutRef.current = setTimeout(
            () => pollExecutionInternal(taskId),
            2000
          ) as any;
        } else {
          // Completed, failed, or cancelled
          setState('completed');
        }
      } catch (err: any) {
        setError(getErrorMessage(err));
        setErrorCode(err.code || null);
        setState('error');
      }
    },
    [cloneId]
  );

  const pollExecution = useCallback(async () => {
    if (!taskIdRef.current) return;
    try {
      setError(null);
      setErrorCode(null);
      setState('executing');
      await pollExecutionInternal(taskIdRef.current);
    } catch (err: any) {
      setError(getErrorMessage(err));
      setErrorCode(err.code || null);
      setState('error');
    }
  }, [pollExecutionInternal]);

  const cancelExecution = useCallback(async () => {
    if (!plan) return;
    try {
      setError(null);
      setErrorCode(null);
      await cancelRepair(cloneId, plan.repairId, taskIdRef.current);
      reset();
    } catch (err: any) {
      setError(getErrorMessage(err));
      setErrorCode(err.code || null);
      setState('error');
    }
  }, [cloneId, plan]);

  const reset = useCallback(() => {
    clearTimeout();
    setState('idle');
    setPlan(null);
    setExecution(null);
    setError(null);
    setErrorCode(null);
    setLockInfo(null);
    setApproved(false);
    taskIdRef.current = null;
  }, [clearTimeout]);

  return {
    state,
    plan,
    execution,
    error,
    errorCode,
    lockInfo,
    approved,
    setApproved,
    startPlanning,
    startExecution,
    pollExecution,
    cancelExecution,
    reset
  };
};
