/**
 * useValidation Hook
 *
 * Manages validation state machine and polling logic
 * States: idle → loading → completed/error
 */

import { useState, useCallback, useRef } from 'react';
import {
  validateClone,
  getValidationStatus,
  ValidationResult,
  getErrorMessage,
  isLockConflict,
  getLockInfo
} from '../services/api';

export type ValidationState = 'idle' | 'loading' | 'completed' | 'error';

export interface UseValidationReturn {
  state: ValidationState;
  result: ValidationResult | null;
  error: string | null;
  errorCode: string | null;
  lockInfo: { ownerId: string; acquiredAt: string } | null;
  validationId: string | null;
  startValidation: () => Promise<void>;
  pollValidation: () => Promise<void>;
  reset: () => void;
}

export const useValidation = (cloneId: string): UseValidationReturn => {
  const [state, setState] = useState<ValidationState>('idle');
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [lockInfo, setLockInfo] = useState<{ ownerId: string; acquiredAt: string } | null>(null);
  const [validationId, setValidationId] = useState<string | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearTimeout = useCallback(() => {
    if (pollingTimeoutRef.current) {
      global.clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, []);

  const startValidation = useCallback(async () => {
    try {
      clearTimeout();
      setState('loading');
      setError(null);
      setErrorCode(null);
      setLockInfo(null);

      const validationResult = await validateClone(cloneId, true);
      setValidationId(validationResult.validationId);
      setResult(validationResult);

      // If validation completed immediately (status not Pending), move to completed
      if (validationResult.status !== 'Pending') {
        setState('completed');
      } else {
        // Otherwise, start polling
        setState('loading');
        pollValidationInternal(validationResult.validationId);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
      setErrorCode(err.code || null);
      if (isLockConflict(err)) {
        setLockInfo(getLockInfo(err));
      }
      setState('error');
    }
  }, [cloneId, clearTimeout]);

  const pollValidationInternal = useCallback(
    async (valId: string) => {
      try {
        const status = await getValidationStatus(cloneId, valId);

        setResult({
          cloneId: status.cloneId,
          validationId: status.validationId,
          status: status.status,
          findings: status.findings,
          validatedAt: status.validatedAt
        });

        if (status.status === 'Pending') {
          // Still pending, schedule another poll
          pollingTimeoutRef.current = setTimeout(
            () => pollValidationInternal(valId),
            2000
          ) as any;
        } else {
          // Completed or error
          setState('completed');
        }
      } catch (err: any) {
        setError(getErrorMessage(err));
        setErrorCode(err.code || null);
        if (isLockConflict(err)) {
          setLockInfo(getLockInfo(err));
        }
        setState('error');
      }
    },
    [cloneId]
  );

  const pollValidation = useCallback(async () => {
    if (!validationId) return;
    try {
      setError(null);
      setErrorCode(null);
      setState('loading');
      await pollValidationInternal(validationId);
    } catch (err: any) {
      setError(getErrorMessage(err));
      setErrorCode(err.code || null);
      setState('error');
    }
  }, [validationId, pollValidationInternal]);

  const reset = useCallback(() => {
    clearTimeout();
    setState('idle');
    setResult(null);
    setError(null);
    setErrorCode(null);
    setLockInfo(null);
    setValidationId(null);
  }, [clearTimeout]);

  return {
    state,
    result,
    error,
    errorCode,
    lockInfo,
    validationId,
    startValidation,
    pollValidation,
    reset
  };
};
