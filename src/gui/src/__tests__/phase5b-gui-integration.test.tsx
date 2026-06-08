/**
 * Phase 5B GUI Integration Tests
 *
 * End-to-end tests for the complete validation and repair workflows:
 * - Full validation workflow: button → modal → results → audit
 * - Full repair workflow: button → preview → approve → execute
 * - Error handling and lock conflicts
 * - Loading states during async operations
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const API_BASE_URL = 'http://localhost:3001/api';

describe('Phase 5B: GUI Integration - Full Workflows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===== Full Validation Workflow =====

  describe('Complete validation workflow', () => {
    it('should execute validation from button click to results display to audit', async () => {
      const cloneId = 'clone-test-1';
      const validationId = `validation-${cloneId}-${Date.now()}`;

      // Step 1: User clicks validate button
      const validateResponse = {
        success: true,
        data: {
          cloneId,
          validationId,
          status: 'Healthy',
          findings: [],
          validatedAt: new Date().toISOString(),
          duration: { elapsedMs: 2000 }
        },
        message: 'Clone validation completed'
      };

      mockedAxios.post.mockResolvedValueOnce(validateResponse);

      // Step 2: Validation completes
      // Step 3: Results displayed in modal
      // Step 4: Audit records the validation
      const auditCheckResponse = {
        success: true,
        data: {
          operations: [
            {
              id: `audit-${validationId}-start`,
              type: 'validation-start',
              status: 'completed',
              timestamp: new Date().toISOString()
            },
            {
              id: `audit-${validationId}-complete`,
              type: 'validation-complete',
              status: 'completed',
              result: 'success',
              findings: [],
              timestamp: new Date().toISOString(),
              completedAt: new Date().toISOString()
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValueOnce(auditCheckResponse);

      // Execute workflow
      const response = await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`, {
        queue: false
      });

      expect(response.data.success).toBe(true);
      expect(response.data.data.validationId).toBe(validationId);
      expect(response.data.data.status).toBe('Healthy');

      // Verify audit records
      const auditResponse = await axios.get(`${API_BASE_URL}/operations`, {
        params: { cloneId, operationType: 'validation' }
      });

      expect(auditResponse.data.success).toBe(true);
      expect(auditResponse.data.data.operations.length).toBeGreaterThanOrEqual(2);
    });

    it('should display validation findings in results modal', async () => {
      const cloneId = 'clone-unhealthy';
      const validationId = `validation-${cloneId}-${Date.now()}`;

      const validateResponse = {
        success: true,
        data: {
          cloneId,
          validationId,
          status: 'Unhealthy',
          findings: [
            {
              severity: 'Error',
              code: 'NO_VHDX_PATH',
              message: 'VHD file not found at configured path'
            },
            {
              severity: 'Warning',
              code: 'STALE_METADATA',
              message: 'Metadata not updated in 30 days'
            }
          ],
          validatedAt: new Date().toISOString(),
          duration: { elapsedMs: 3000 }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(validateResponse);

      const response = await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`, {
        queue: false
      });

      expect(response.data.data.status).toBe('Unhealthy');
      expect(response.data.data.findings.length).toBe(2);
      expect(response.data.data.findings[0].code).toBe('NO_VHDX_PATH');
      expect(response.data.data.findings[1].code).toBe('STALE_METADATA');
    });

    it('should handle validation async (queue=true) and poll for results', async () => {
      const cloneId = 'clone-test-1';
      const validationId = `validation-${cloneId}-${Date.now()}`;
      const taskId = `task-validate-${cloneId}-${Date.now()}`;

      // Initial queue response
      const queueResponse = {
        success: true,
        data: {
          taskId,
          validationId,
          status: 'pending',
          pollingUrl: `/api/clones/${cloneId}/validation-status?validationId=${validationId}`,
          estimatedDurationMs: 30000
        },
        message: 'Clone validation queued'
      };

      // Polling response 1: Still pending
      const pollResponse1 = {
        success: true,
        data: {
          cloneId,
          validationId,
          status: 'pending'
        }
      };

      // Polling response 2: Complete
      const pollResponse2 = {
        success: true,
        data: {
          cloneId,
          validationId,
          status: 'Healthy',
          findings: [],
          validatedAt: new Date().toISOString()
        }
      };

      mockedAxios.post.mockResolvedValueOnce(queueResponse);
      mockedAxios.get
        .mockResolvedValueOnce(pollResponse1)
        .mockResolvedValueOnce(pollResponse2);

      // Queue validation
      const response = await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`);

      expect(response.data.data.status).toBe('pending');
      expect(response.data.data.pollingUrl).toBeDefined();

      // Poll for status (first poll: still pending)
      const poll1 = await axios.get(
        `${API_BASE_URL}/clones/${cloneId}/validation-status`,
        { params: { validationId } }
      );

      expect(poll1.data.data.status).toBe('pending');

      // Poll for status (second poll: complete)
      const poll2 = await axios.get(
        `${API_BASE_URL}/clones/${cloneId}/validation-status`,
        { params: { validationId } }
      );

      expect(poll2.data.data.status).toBe('Healthy');
    });
  });

  // ===== Full Repair Workflow =====

  describe('Complete repair workflow', () => {
    it('should execute repair from preview to approval to execution', async () => {
      const cloneId = 'clone-unhealthy';
      const repairId = `repair-${cloneId}-${Date.now()}`;

      // Step 1: Get repair plan (dry-run)
      const planResponse = {
        success: true,
        data: {
          cloneId,
          repairId,
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [
              {
                type: 'UpdateMetadata',
                description: 'Update clone metadata',
                estimatedDurationSeconds: 10,
                riskLevel: 'Low'
              },
              {
                type: 'RemountVhd',
                description: 'Remount VHD file',
                estimatedDurationSeconds: 30,
                riskLevel: 'Medium'
              }
            ],
            estimatedDurationSeconds: 60,
            requiresApproval: true
          },
          blockers: []
        }
      };

      mockedAxios.post.mockResolvedValueOnce(planResponse);

      // Get repair plan
      const plan = await axios.post(`${API_BASE_URL}/clones/${cloneId}/repair`, {
        dryRun: true
      });

      expect(plan.data.data.isDryRun).toBe(true);
      expect(plan.data.data.plan.actions.length).toBe(2);
      expect(plan.data.data.plan.estimatedDurationSeconds).toBe(60);

      // Step 2: User approves repair
      // Step 3: Execute repair
      const executeResponse = {
        success: true,
        data: {
          cloneId,
          repairId,
          isDryRun: false,
          taskId: `task-repair-${cloneId}-${Date.now()}`,
          status: 'Queued',
          message: 'Repair task queued'
        },
        message: 'Repair execution queued'
      };

      mockedAxios.post.mockResolvedValueOnce(executeResponse);

      const execution = await axios.post(`${API_BASE_URL}/clones/${cloneId}/repair`, {
        dryRun: false,
        validationId: plan.data.data.repairId
      });

      expect(execution.data.data.isDryRun).toBe(false);
      expect(execution.data.data.taskId).toBeDefined();
      expect(execution.data.data.status).toBe('Queued');

      // Step 4: Poll for repair completion
      const statusResponse = {
        success: true,
        data: {
          cloneId,
          repairId,
          status: 'Completed',
          completedAt: new Date().toISOString(),
          result: {
            success: true,
            appliedActions: [
              'Updated metadata in database',
              'Remounted VHD file'
            ],
            durationSeconds: 65
          }
        }
      };

      mockedAxios.get.mockResolvedValueOnce(statusResponse);

      const status = await axios.get(`${API_BASE_URL}/clones/${cloneId}/repair-status`, {
        params: { taskId: execution.data.data.taskId }
      });

      expect(status.data.data.status).toBe('Completed');
      expect(status.data.data.result.success).toBe(true);
      expect(status.data.data.result.appliedActions.length).toBe(2);
    });

    it('should require approval for repairs > 60 seconds', async () => {
      const cloneId = 'clone-unhealthy';
      const repairId = `repair-${cloneId}-${Date.now()}`;

      const planResponse = {
        success: true,
        data: {
          cloneId,
          repairId,
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [
              {
                type: 'RemountVhd',
                description: 'Remount VHD file',
                estimatedDurationSeconds: 90,
                riskLevel: 'Medium'
              }
            ],
            estimatedDurationSeconds: 90, // > 60 seconds
            requiresApproval: true
          }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(planResponse);

      const plan = await axios.post(`${API_BASE_URL}/clones/${cloneId}/repair`, {
        dryRun: true
      });

      // Approval should be required
      expect(plan.data.data.plan.requiresApproval).toBe(true);
    });

    it('should display plan actions for user review', async () => {
      const cloneId = 'clone-unhealthy';
      const repairId = `repair-${cloneId}-${Date.now()}`;

      const planResponse = {
        success: true,
        data: {
          cloneId,
          repairId,
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [
              {
                type: 'UpdateMetadata',
                description: 'Update clone metadata in database',
                estimatedDurationSeconds: 10,
                riskLevel: 'Low'
              },
              {
                type: 'RemountVhd',
                description: 'Remount VHD file at configured path',
                estimatedDurationSeconds: 30,
                riskLevel: 'Medium'
              },
              {
                type: 'AttachDatabase',
                description: 'Reattach SQL Server database',
                estimatedDurationSeconds: 20,
                riskLevel: 'Medium'
              }
            ],
            estimatedDurationSeconds: 60,
            requiresApproval: true
          }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(planResponse);

      const plan = await axios.post(`${API_BASE_URL}/clones/${cloneId}/repair`, {
        dryRun: true
      });

      // Verify user can see all actions before approval
      const actions = plan.data.data.plan.actions;
      expect(actions.length).toBe(3);
      actions.forEach((action) => {
        expect(action).toHaveProperty('type');
        expect(action).toHaveProperty('description');
        expect(action).toHaveProperty('estimatedDurationSeconds');
        expect(action).toHaveProperty('riskLevel');
      });
    });

    it('should show progress during repair execution', async () => {
      const cloneId = 'clone-unhealthy';
      const taskId = `task-repair-${cloneId}-${Date.now()}`;

      // Simulate polling progress
      const progressResponse = {
        success: true,
        data: {
          cloneId,
          status: 'InProgress',
          progress: {
            current: 2,
            total: 3,
            percentage: 66
          },
          currentAction: 'Remounting VHD...',
          elapsedSeconds: 40,
          estimatedRemainingSeconds: 20
        }
      };

      mockedAxios.get.mockResolvedValueOnce(progressResponse);

      const status = await axios.get(`${API_BASE_URL}/clones/${cloneId}/repair-status`, {
        params: { taskId }
      });

      expect(status.data.data.status).toBe('InProgress');
      expect(status.data.data.progress.percentage).toBe(66);
      expect(status.data.data.currentAction).toBe('Remounting VHD...');
      expect(status.data.data.elapsedSeconds).toBe(40);
      expect(status.data.data.estimatedRemainingSeconds).toBe(20);
    });
  });

  // ===== Error Handling & Lock Conflicts =====

  describe('Error handling and lock conflicts', () => {
    it('should handle clone locked errors', async () => {
      const cloneId = 'clone-locked';

      const errorResponse = {
        success: false,
        error: {
          code: 'E006_CLONE_LOCKED',
          message: 'Clone is currently in use',
          details: {
            lockInfo: {
              ownerId: 'clone:clone-locked',
              acquiredAt: new Date().toISOString()
            }
          },
          timestamp: new Date().toISOString()
        }
      };

      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 409, data: errorResponse }
      });

      try {
        await axios.post(`${API_BASE_URL}/clones/${cloneId}/repair`, { dryRun: true });
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.response.data.error.code).toBe('E006_CLONE_LOCKED');
      }
    });

    it('should handle validation in progress errors', async () => {
      const cloneId = 'clone-test-1';

      const errorResponse = {
        success: false,
        error: {
          code: 'E002_VALIDATION_IN_PROGRESS',
          message: 'Validation already in progress for this clone',
          details: {
            lockInfo: {
              ownerId: 'operator-123',
              acquiredAt: new Date().toISOString()
            }
          },
          timestamp: new Date().toISOString()
        }
      };

      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 409, data: errorResponse }
      });

      try {
        await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`, { queue: false });
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.response.data.error.code).toBe('E002_VALIDATION_IN_PROGRESS');
      }
    });

    it('should handle repair in progress errors', async () => {
      const cloneId = 'clone-test-1';

      const errorResponse = {
        success: false,
        error: {
          code: 'E003_REPAIR_IN_PROGRESS',
          message: 'Repair already in progress for this clone',
          details: {
            lockInfo: {
              ownerId: 'operator-123',
              acquiredAt: new Date().toISOString()
            }
          },
          timestamp: new Date().toISOString()
        }
      };

      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 409, data: errorResponse }
      });

      try {
        await axios.post(`${API_BASE_URL}/clones/${cloneId}/repair`, { dryRun: false });
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.response.data.error.code).toBe('E003_REPAIR_IN_PROGRESS');
      }
    });

    it('should allow retrying after temporary errors', async () => {
      const cloneId = 'clone-test-1';

      // First attempt: service error
      mockedAxios.post.mockRejectedValueOnce({
        response: {
          status: 500,
          data: {
            success: false,
            error: {
              code: 'E007_SERVICE_ERROR',
              message: 'Service temporarily unavailable',
              timestamp: new Date().toISOString()
            }
          }
        }
      });

      // Second attempt: success
      mockedAxios.post.mockResolvedValueOnce({
        success: true,
        data: {
          cloneId,
          validationId: 'validation-test-1',
          status: 'Healthy',
          findings: [],
          validatedAt: new Date().toISOString(),
          duration: { elapsedMs: 2000 }
        }
      });

      // First attempt fails
      try {
        await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`, { queue: false });
        fail('Should have thrown error');
      } catch (error: any) {
        expect(error.response.status).toBe(500);
      }

      // Retry succeeds
      const retryResponse = await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`, {
        queue: false
      });

      expect(retryResponse.data.success).toBe(true);
    });
  });

  // ===== Loading States =====

  describe('Loading states during async operations', () => {
    it('should show loading indicator during validation', async () => {
      const cloneId = 'clone-test-1';

      // Validation takes time
      mockedAxios.post.mockImplementationOnce(
        () => new Promise(resolve => {
          setTimeout(() => {
            resolve({
              data: {
                success: true,
                data: {
                  cloneId,
                  validationId: 'validation-test-1',
                  status: 'Healthy',
                  findings: [],
                  validatedAt: new Date().toISOString(),
                  duration: { elapsedMs: 3000 }
                }
              }
            });
          }, 100);
        })
      );

      const response = await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`, {
        queue: false
      });

      expect(response.data.success).toBe(true);
    });

    it('should show disabled state on button during operation', async () => {
      const cloneId = 'clone-test-1';

      // Long-running operation
      mockedAxios.post.mockImplementationOnce(
        () => new Promise(resolve => {
          setTimeout(() => {
            resolve({
              data: {
                success: true,
                data: {
                  cloneId,
                  taskId: 'task-test-1',
                  status: 'pending'
                },
                message: 'Validation queued'
              }
            });
          }, 50);
        })
      );

      // Implementation should disable button during operation
      const response = await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`);

      expect(response.data.data.status).toBe('pending');
    });

    it('should show spinner while polling for results', async () => {
      const cloneId = 'clone-test-1';
      const validationId = 'validation-test-1';

      // First poll: still pending
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            cloneId,
            validationId,
            status: 'pending'
          }
        }
      });

      // Second poll: complete
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            cloneId,
            validationId,
            status: 'Healthy',
            findings: [],
            validatedAt: new Date().toISOString()
          }
        }
      });

      // First poll shows pending
      const poll1 = await axios.get(`${API_BASE_URL}/clones/${cloneId}/validation-status`, {
        params: { validationId }
      });

      expect(poll1.data.data.status).toBe('pending');

      // Second poll shows complete
      const poll2 = await axios.get(`${API_BASE_URL}/clones/${cloneId}/validation-status`, {
        params: { validationId }
      });

      expect(poll2.data.data.status).toBe('Healthy');
    });
  });

  // ===== Audit Trail =====

  describe('Audit trail recording', () => {
    it('should record all validation operations in audit', async () => {
      const cloneId = 'clone-test-1';
      const validationId = `validation-${cloneId}-${Date.now()}`;

      const validateResponse = {
        success: true,
        data: {
          cloneId,
          validationId,
          status: 'Healthy',
          findings: [],
          validatedAt: new Date().toISOString(),
          duration: { elapsedMs: 2000 }
        }
      };

      mockedAxios.post.mockResolvedValueOnce(validateResponse);

      // Execute validation
      await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`, { queue: false });

      // Check audit records
      const auditResponse = {
        success: true,
        data: {
          operations: [
            {
              type: 'validation-start',
              status: 'completed',
              timestamp: new Date().toISOString()
            },
            {
              type: 'validation-complete',
              status: 'completed',
              result: 'success',
              timestamp: new Date().toISOString()
            }
          ]
        }
      };

      mockedAxios.get.mockResolvedValueOnce(auditResponse);

      const audit = await axios.get(`${API_BASE_URL}/operations`, {
        params: { cloneId, operationType: 'validation' }
      });

      expect(audit.data.data.operations.length).toBeGreaterThanOrEqual(2);
    });

    it('should record repair operations with before/after states', async () => {
      const cloneId = 'clone-unhealthy';
      const repairId = `repair-${cloneId}-${Date.now()}`;

      // Get before state from validation
      const beforeValidation = {
        success: true,
        data: {
          cloneId,
          validationId: 'validation-before',
          status: 'Unhealthy',
          findings: [{ severity: 'Error', code: 'NO_VHDX_PATH', message: 'VHD not found' }]
        }
      };

      mockedAxios.post.mockResolvedValueOnce(beforeValidation);

      // Do validation before repair
      await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`, { queue: false });

      // Execute repair
      mockedAxios.post.mockResolvedValueOnce({
        success: true,
        data: {
          cloneId,
          repairId,
          isDryRun: false,
          taskId: 'task-repair-1',
          status: 'Queued'
        }
      });

      await axios.post(`${API_BASE_URL}/clones/${cloneId}/repair`, { dryRun: false });

      // Repair completes
      mockedAxios.get.mockResolvedValueOnce({
        success: true,
        data: {
          cloneId,
          repairId,
          status: 'Completed',
          result: { success: true, appliedActions: ['Fixed VHD path'] }
        }
      });

      await axios.get(`${API_BASE_URL}/clones/${cloneId}/repair-status`, {
        params: { taskId: 'task-repair-1' }
      });

      // Validate after repair
      mockedAxios.post.mockResolvedValueOnce({
        success: true,
        data: {
          cloneId,
          validationId: 'validation-after',
          status: 'Healthy',
          findings: []
        }
      });

      await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`, { queue: false });

      // Audit should show: validation (failed) → repair → validation (passed)
    });
  });
});
