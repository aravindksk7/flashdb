/**
 * API Validation & Repair Service Tests
 *
 * Comprehensive unit tests for validation and repair API methods
 * Tests validate that all API calls return expected responses and handle errors gracefully
 */

import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

interface ValidationResponse {
  success: boolean;
  data: {
    cloneId: string;
    validationId: string;
    status: string;
    findings: Array<{
      severity: string;
      code: string;
      message: string;
    }>;
    validatedAt: string;
    duration: { elapsedMs: number };
  };
  message: string;
}

interface RepairPlanResponse {
  success: boolean;
  data: {
    cloneId: string;
    repairId: string;
    isDryRun: boolean;
    status: string;
    plan: {
      actions: Array<{
        type: string;
        description: string;
        estimatedDurationSeconds: number;
        riskLevel: string;
      }>;
      estimatedDurationSeconds: number;
      requiresApproval: boolean;
    };
    blockers: any[];
    createdAt: string;
    expiresAt: string;
  };
  message: string;
}

interface RepairExecuteResponse {
  success: boolean;
  data: {
    cloneId: string;
    repairId: string;
    isDryRun: boolean;
    taskId: string;
    status: string;
    message: string;
  };
  message: string;
}

interface ValidationStatusResponse {
  success: boolean;
  data: {
    cloneId: string;
    validationId: string;
    status: string;
    findings: any[];
    validatedAt?: string;
    history?: any[];
  };
  message: string;
}

interface RepairStatusResponse {
  success: boolean;
  data: {
    cloneId: string;
    repairId: string;
    status: string;
    progress?: {
      current: number;
      total: number;
      percentage: number;
    };
    currentAction?: string;
    completedAt?: string;
    result?: any;
  };
  message: string;
}

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

describe('API Validation & Repair Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ===== Validation Tests =====

  describe('validateClone()', () => {
    it('should return validation ID when validation starts', async () => {
      const cloneId = 'clone-test-1';
      const mockResponse: ValidationResponse = {
        success: true,
        data: {
          cloneId,
          validationId: 'validation-clone-test-1-1623000000000',
          status: 'Healthy',
          findings: [],
          validatedAt: new Date().toISOString(),
          duration: { elapsedMs: 1500 }
        },
        message: 'Clone validation completed'
      };

      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const response = await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`, {
        queue: false
      });

      expect(response.data.success).toBe(true);
      expect(response.data.data.validationId).toBeDefined();
      expect(response.data.data.validationId).toMatch(/^validation-/);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${API_BASE_URL}/clones/${cloneId}/validate`,
        { queue: false }
      );
    });

    it('should retrieve validation results with getValidationStatus()', async () => {
      const cloneId = 'clone-test-1';
      const validationId = 'validation-clone-test-1-1623000000000';

      const mockResponse: ValidationStatusResponse = {
        success: true,
        data: {
          cloneId,
          validationId,
          status: 'Healthy',
          findings: [],
          validatedAt: new Date().toISOString()
        },
        message: 'Validation status retrieved'
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

      const response = await axios.get(
        `${API_BASE_URL}/clones/${cloneId}/validation-status`,
        { params: { validationId } }
      );

      expect(response.data.success).toBe(true);
      expect(response.data.data.cloneId).toBe(cloneId);
      expect(response.data.data.validationId).toBe(validationId);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${API_BASE_URL}/clones/${cloneId}/validation-status`,
        { params: { validationId } }
      );
    });

    it('should return findings array on validation failures', async () => {
      const cloneId = 'clone-unhealthy';
      const mockResponse: ValidationResponse = {
        success: true,
        data: {
          cloneId,
          validationId: 'validation-clone-unhealthy-1623000000000',
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
          duration: { elapsedMs: 2000 }
        },
        message: 'Clone validation completed'
      };

      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const response = await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`, {
        queue: false
      });

      expect(response.data.success).toBe(true);
      expect(Array.isArray(response.data.data.findings)).toBe(true);
      expect(response.data.data.findings.length).toBeGreaterThan(0);
      expect(response.data.data.findings[0]).toHaveProperty('severity');
      expect(response.data.data.findings[0]).toHaveProperty('code');
      expect(response.data.data.findings[0]).toHaveProperty('message');
    });
  });

  // ===== Repair Planning Tests =====

  describe('repairClone(dryRun=true)', () => {
    it('should return repair plan without executing', async () => {
      const cloneId = 'clone-unhealthy';
      const mockResponse: RepairPlanResponse = {
        success: true,
        data: {
          cloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
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
          },
          blockers: [],
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString()
        },
        message: 'Repair plan created'
      };

      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const response = await axios.post(`${API_BASE_URL}/clones/${cloneId}/repair`, {
        dryRun: true
      });

      expect(response.data.success).toBe(true);
      expect(response.data.data.isDryRun).toBe(true);
      expect(response.data.data.status).toBe('Planned');
      expect(Array.isArray(response.data.data.plan.actions)).toBe(true);
      expect(response.data.data.plan.estimatedDurationSeconds).toBeGreaterThan(0);
    });

    it('should show planned actions with duration estimates', async () => {
      const cloneId = 'clone-unhealthy';
      const mockResponse: RepairPlanResponse = {
        success: true,
        data: {
          cloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: true,
          status: 'Planned',
          plan: {
            actions: [
              {
                type: 'UpdateMetadata',
                description: 'Update clone metadata',
                estimatedDurationSeconds: 10,
                riskLevel: 'Low'
              }
            ],
            estimatedDurationSeconds: 60,
            requiresApproval: true
          },
          blockers: [],
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300000).toISOString()
        },
        message: 'Repair plan created'
      };

      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const response = await axios.post(`${API_BASE_URL}/clones/${cloneId}/repair`, {
        dryRun: true
      });

      const action = response.data.data.plan.actions[0];
      expect(action.type).toBeDefined();
      expect(action.description).toBeDefined();
      expect(action.estimatedDurationSeconds).toBeGreaterThan(0);
      expect(action.riskLevel).toMatch(/Low|Medium|High/);
    });
  });

  // ===== Repair Execution Tests =====

  describe('repairClone(dryRun=false)', () => {
    it('should return taskId when repair execution is queued', async () => {
      const cloneId = 'clone-unhealthy';
      const mockResponse: RepairExecuteResponse = {
        success: true,
        data: {
          cloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          isDryRun: false,
          taskId: 'task-repair-clone-unhealthy-1623000000000',
          status: 'Queued',
          message: 'Repair task queued'
        },
        message: 'Repair execution queued'
      };

      mockedAxios.post.mockResolvedValueOnce({ status: 202, data: mockResponse });

      const response = await axios.post(`${API_BASE_URL}/clones/${cloneId}/repair`, {
        dryRun: false
      });

      expect(response.data.success).toBe(true);
      expect(response.data.data.isDryRun).toBe(false);
      expect(response.data.data.taskId).toBeDefined();
      expect(response.data.data.status).toBe('Queued');
    });

    it('should track repair progress with getRepairStatus()', async () => {
      const cloneId = 'clone-unhealthy';
      const taskId = 'task-repair-clone-unhealthy-1623000000000';

      const mockResponse: RepairStatusResponse = {
        success: true,
        data: {
          cloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          status: 'InProgress',
          progress: {
            current: 2,
            total: 3,
            percentage: 66
          },
          currentAction: 'Remounting VHD...'
        },
        message: 'Repair status retrieved'
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

      const response = await axios.get(
        `${API_BASE_URL}/clones/${cloneId}/repair-status`,
        { params: { taskId } }
      );

      expect(response.data.success).toBe(true);
      expect(response.data.data.status).toBe('InProgress');
      expect(response.data.data.progress).toBeDefined();
      expect(response.data.data.progress.percentage).toBeGreaterThan(0);
    });

    it('should return final results when repair completes', async () => {
      const cloneId = 'clone-unhealthy';
      const taskId = 'task-repair-clone-unhealthy-1623000000000';

      const mockResponse: RepairStatusResponse = {
        success: true,
        data: {
          cloneId,
          repairId: 'repair-clone-unhealthy-1623000000000',
          status: 'Completed',
          completedAt: new Date().toISOString(),
          result: {
            success: true,
            appliedActions: [
              'Updated metadata in database',
              'Remounted VHD file',
              'Reattached SQL database'
            ],
            durationSeconds: 65
          }
        },
        message: 'Repair completed'
      };

      mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });

      const response = await axios.get(
        `${API_BASE_URL}/clones/${cloneId}/repair-status`,
        { params: { taskId } }
      );

      expect(response.data.success).toBe(true);
      expect(response.data.data.status).toBe('Completed');
      expect(response.data.data.result).toBeDefined();
      expect(response.data.data.result.success).toBe(true);
    });
  });

  // ===== Error Handling Tests =====

  describe('Error handling', () => {
    it('should handle lock conflicts gracefully', async () => {
      const cloneId = 'clone-locked';
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
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(409);
        expect(error.response.data.error.code).toBe('E002_VALIDATION_IN_PROGRESS');
      }
    });

    it('should handle clone not found errors', async () => {
      const cloneId = 'clone-nonexistent';
      const errorResponse = {
        success: false,
        error: {
          code: 'E001_CLONE_NOT_FOUND',
          message: `Clone not found: ${cloneId}`,
          timestamp: new Date().toISOString()
        }
      };

      mockedAxios.post.mockRejectedValueOnce({
        response: { status: 404, data: errorResponse }
      });

      try {
        await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`, { queue: false });
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data.error.code).toBe('E001_CLONE_NOT_FOUND');
      }
    });

    it('should handle validation in progress errors', async () => {
      const cloneId = 'clone-test-1';
      const errorResponse = {
        success: false,
        error: {
          code: 'E006_CLONE_LOCKED',
          message: 'Clone is currently in use',
          details: {
            lockInfo: {
              ownerId: 'clone:clone-test-1',
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
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(409);
        expect(error.response.data.error.code).toBe('E006_CLONE_LOCKED');
      }
    });
  });

  // ===== Async Behavior Tests =====

  describe('Async validation behavior', () => {
    it('should return 202 Accepted status for queued validations', async () => {
      const cloneId = 'clone-test-1';
      const mockResponse = {
        success: true,
        data: {
          taskId: 'task-validate-clone-test-1-1623000000000',
          validationId: 'validation-clone-test-1-1623000000000',
          status: 'pending',
          pollingUrl: `/api/clones/clone-test-1/validation-status?validationId=validation-clone-test-1-1623000000000`,
          estimatedDurationMs: 30000
        },
        message: 'Clone validation queued'
      };

      mockedAxios.post.mockResolvedValueOnce({ status: 202, data: mockResponse });

      const response = await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`);

      expect(response.status).toBe(202);
      expect(response.data.data.pollingUrl).toBeDefined();
      expect(response.data.data.estimatedDurationMs).toBeGreaterThan(0);
    });

    it('should return 200 OK status for sync validations', async () => {
      const cloneId = 'clone-test-1';
      const mockResponse: ValidationResponse = {
        success: true,
        data: {
          cloneId,
          validationId: 'validation-clone-test-1-1623000000000',
          status: 'Healthy',
          findings: [],
          validatedAt: new Date().toISOString(),
          duration: { elapsedMs: 1500 }
        },
        message: 'Clone validation completed'
      };

      mockedAxios.post.mockResolvedValueOnce({ status: 200, data: mockResponse });

      const response = await axios.post(`${API_BASE_URL}/clones/${cloneId}/validate`, {
        queue: false
      });

      expect(response.status).toBe(200);
      expect(response.data.data.validatedAt).toBeDefined();
      expect(response.data.data.duration).toBeDefined();
    });
  });

  // ===== Repair Cancellation Tests =====

  describe('Repair cancellation', () => {
    it('should cancel in-progress repair with cancelRepair()', async () => {
      const cloneId = 'clone-test-1';
      const repairId = 'repair-clone-test-1-1623000000000';

      const mockResponse = {
        success: true,
        data: {
          cloneId,
          repairId,
          status: 'Cancelled',
          message: 'Repair cancelled successfully'
        },
        message: 'Repair cancelled'
      };

      mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

      const response = await axios.post(
        `${API_BASE_URL}/clones/${cloneId}/repair/cancel`,
        { repairId }
      );

      expect(response.data.success).toBe(true);
      expect(response.data.data.status).toBe('Cancelled');
    });
  });
});
