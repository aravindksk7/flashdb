/**
 * Phase 5A: Validation & Repair Endpoints Integration Tests
 *
 * Comprehensive testing of:
 * - POST /api/clones/:cloneId/validate (sync/async modes)
 * - GET /api/clones/:cloneId/validation-status
 * - GET /api/clones/:cloneId/validation-history
 * - POST /api/clones/:cloneId/repair (dry-run and execute)
 * - GET /api/clones/:cloneId/repair-status
 * - POST /api/clones/:cloneId/repair/cancel
 *
 * Tests cover:
 * - Happy path: successful validations and repairs
 * - Error handling: clone not found, locks, invalid states
 * - Audit recording: all operations recorded with metrics
 * - Async operations: queuing, polling, completion
 * - Lock management: preventing concurrent operations
 */

import request from 'supertest';
import express, { Express } from 'express';
import { getAuditMetricsService, AuditMetricsService } from '../services/auditMetricsService';
import { getCloneValidationService } from '../services/cloneValidationService';
import { getTaskQueue } from '../services/taskQueue';
import cloneRoutes from '../routes/clones';

// Mock the PowerShell service before importing routes
jest.mock('../services/pooledPowershellService', () => ({
  getPooledPowerShellService: jest.fn(() => ({
    executeCommand: jest.fn(async (cmd: string, params: any) => {
      if (cmd === 'Get-FlashdbClone') {
        // Return mock clone if it exists
        const validClones = ['clone-healthy', 'clone-unhealthy', 'clone-test-1', 'clone-test-2'];
        if (validClones.includes(params.CloneId)) {
          return {
            CloneId: params.CloneId,
            IsHealthy: params.CloneId === 'clone-healthy',
            LastValidated: new Date()
          };
        }
        return null;
      }
      return null;
    })
  }))
}));

// Mock the validation service
jest.mock('../services/cloneValidationService', () => ({
  getCloneValidationService: jest.fn(() => ({
    validateClone: jest.fn(async (cloneId: string) => ({
      cloneId,
      isHealthy: cloneId === 'clone-healthy',
      findings: cloneId === 'clone-healthy' ? [] : [
        {
          severity: 'Error',
          code: 'TEST_ERROR',
          message: 'Test finding'
        }
      ],
      validatedAt: new Date(),
      details: { checks: [] }
    })),
    repairClone: jest.fn(async (cloneId: string, isDryRun: boolean) => ({
      cloneId,
      isDryRun,
      plannedActions: [
        'Update Metadata',
        'Remount VHD',
        'Attach Database'
      ],
      estimatedDurationSeconds: 120
    }))
  }))
}));

describe('Phase 5A: Validation & Repair Endpoints', () => {
  let app: Express;
  let auditService: AuditMetricsService;
  let validationService: any;
  let taskQueue: any;

  beforeAll(async () => {
    // Create a minimal Express app for testing
    app = express();
    app.use(express.json());
    app.use('/api/clones', cloneRoutes);

    auditService = getAuditMetricsService();
    validationService = getCloneValidationService();
    taskQueue = getTaskQueue();
  });

  beforeEach(() => {
    // Clear any previous test data
    jest.clearAllMocks();
  });

  // ===== POST /api/clones/:cloneId/validate Tests =====

  describe('POST /api/clones/:cloneId/validate', () => {
    it('should successfully validate clone synchronously (queue=false)', async () => {
      const cloneId = 'clone-healthy';
      const response = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.cloneId).toBe(cloneId);
      expect(response.body.data.validationId).toBeDefined();
      expect(response.body.data.status).toBeDefined();
      expect(response.body.data.findings).toBeDefined();
      expect(Array.isArray(response.body.data.findings)).toBe(true);
      expect(response.body.data.validatedAt).toBeDefined();
      expect(response.body.data.duration).toBeDefined();
      expect(response.body.data.duration.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(response.body.message).toBe('Clone validation completed');
    });

    it('should queue validation asynchronously (queue=true, default)', async () => {
      const cloneId = 'clone-test-1';
      const response = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'true' })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.taskId).toBeDefined();
      expect(response.body.data.validationId).toBeDefined();
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.pollingUrl).toContain(cloneId);
      expect(response.body.data.pollingUrl).toContain('validation-status');
      expect(response.body.data.estimatedDurationMs).toBeGreaterThan(0);
      expect(response.body.message).toBe('Clone validation queued');
    });

    it('should default to async validation when queue param not specified', async () => {
      const cloneId = 'clone-test-2';
      const response = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data.taskId).toBeDefined();
      expect(response.body.data.status).toBe('pending');
    });

    it('should return 404 when clone not found (E001)', async () => {
      const cloneId = 'clone-nonexistent';
      const response = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBe('E001_CLONE_NOT_FOUND');
      expect(response.body.error.message).toContain(cloneId);
      expect(response.body.error.timestamp).toBeDefined();
    });

    it('should handle validation already in progress (E002)', async () => {
      const cloneId = 'clone-healthy';

      // Start first validation
      await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'true' })
        .expect(202);

      // Attempt second validation immediately (should fail with lock)
      const response = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'true' })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('E002_VALIDATION_IN_PROGRESS');
      expect(response.body.error.details).toBeDefined();
      expect(response.body.error.details.lockInfo).toBeDefined();
    });

    it('should record validation-start audit event', async () => {
      const cloneId = 'clone-test-1';
      const recordOperationSpy = jest.spyOn(auditService, 'recordOperation');

      await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' });

      expect(recordOperationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'validation-start',
          entityId: cloneId,
          status: 'pending'
        })
      );
    });

    it('should record validation-complete audit event on sync validation', async () => {
      const cloneId = 'clone-healthy';
      const recordOperationSpy = jest.spyOn(auditService, 'recordOperation');

      const response = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' })
        .expect(200);

      // Check that completion event was recorded
      const completionCalls = recordOperationSpy.mock.calls.filter(
        call => call[0].type === 'validation-complete'
      );

      expect(completionCalls.length).toBeGreaterThan(0);
      expect(completionCalls[0][0]).toMatchObject({
        entityId: cloneId,
        status: 'completed',
        type: 'validation-complete'
      });
    });
  });

  // ===== GET /api/clones/:cloneId/validation-status Tests =====

  describe('GET /api/clones/:cloneId/validation-status', () => {
    it('should return latest validation status', async () => {
      const cloneId = 'clone-healthy';

      // First, validate the clone
      await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' });

      // Then get status
      const response = await request(app)
        .get(`/api/clones/${cloneId}/validation-status`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.cloneId).toBe(cloneId);
      expect(response.body.data.validationId).toBeDefined();
      expect(response.body.data.status).toBeDefined();
      expect(['Healthy', 'Unhealthy']).toContain(response.body.data.status);
      expect(response.body.data.findings).toBeDefined();
      expect(Array.isArray(response.body.data.findings)).toBe(true);
      expect(response.body.data.validatedAt).toBeDefined();
    });

    it('should filter by validationId when provided', async () => {
      const cloneId = 'clone-test-1';

      // Validate clone
      const validateResponse = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' })
        .expect(200);

      const validationId = validateResponse.body.data.validationId;

      // Get status by specific validation ID
      const response = await request(app)
        .get(`/api/clones/${cloneId}/validation-status`)
        .query({ validationId })
        .expect(200);

      expect(response.body.data.validationId).toBe(validationId);
    });

    it('should include history when includeHistory=true', async () => {
      const cloneId = 'clone-healthy';

      // Validate multiple times
      await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' });

      await new Promise(resolve => setTimeout(resolve, 100)); // Small delay

      await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' });

      // Get status with history
      const response = await request(app)
        .get(`/api/clones/${cloneId}/validation-status`)
        .query({ includeHistory: 'true' })
        .expect(200);

      expect(response.body.data.history).toBeDefined();
      expect(Array.isArray(response.body.data.history)).toBe(true);
      expect(response.body.data.history.length).toBeGreaterThan(0);

      // Each history item should have required fields
      response.body.data.history.forEach((item: any) => {
        expect(item.validationId).toBeDefined();
        expect(item.status).toBeDefined();
        expect(item.findingsCount).toBeDefined();
        expect(item.validatedAt).toBeDefined();
      });
    });

    it('should return 404 when clone not found', async () => {
      const cloneId = 'clone-nonexistent';
      const response = await request(app)
        .get(`/api/clones/${cloneId}/validation-status`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('E001_CLONE_NOT_FOUND');
    });

    it('should return 404 when no validation history exists', async () => {
      const cloneId = 'clone-test-2';

      // Don't validate, just try to get status
      const response = await request(app)
        .get(`/api/clones/${cloneId}/validation-status`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('E001_CLONE_NOT_FOUND');
      expect(response.body.error.message).toContain('No validation history');
    });
  });

  // ===== GET /api/clones/:cloneId/validation-history Tests =====

  describe('GET /api/clones/:cloneId/validation-history', () => {
    it('should return paginated validation history with default limit', async () => {
      const cloneId = 'clone-healthy';

      // Create multiple validations
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post(`/api/clones/${cloneId}/validate`)
          .query({ queue: 'false' });

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const response = await request(app)
        .get(`/api/clones/${cloneId}/validation-history`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.cloneId).toBe(cloneId);
      expect(Array.isArray(response.body.data.validations)).toBe(true);
      expect(response.body.data.total).toBeGreaterThanOrEqual(0);
      expect(response.body.data.limit).toBeLessThanOrEqual(100);
      expect(response.body.data.offset).toBeDefined();
    });

    it('should respect custom limit parameter', async () => {
      const cloneId = 'clone-healthy';

      // Create validations
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(`/api/clones/${cloneId}/validate`)
          .query({ queue: 'false' });

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const limit = 2;
      const response = await request(app)
        .get(`/api/clones/${cloneId}/validation-history`)
        .query({ limit })
        .expect(200);

      expect(response.body.data.limit).toBe(limit);
      expect(response.body.data.validations.length).toBeLessThanOrEqual(limit);
    });

    it('should support offset pagination', async () => {
      const cloneId = 'clone-test-1';

      // Create validations
      for (let i = 0; i < 4; i++) {
        await request(app)
          .post(`/api/clones/${cloneId}/validate`)
          .query({ queue: 'false' });

        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const response1 = await request(app)
        .get(`/api/clones/${cloneId}/validation-history`)
        .query({ limit: 2, offset: 0 })
        .expect(200);

      const response2 = await request(app)
        .get(`/api/clones/${cloneId}/validation-history`)
        .query({ limit: 2, offset: 2 })
        .expect(200);

      expect(response1.body.data.validations.length).toBeLessThanOrEqual(2);
      expect(response2.body.data.validations.length).toBeLessThanOrEqual(2);

      // Different pages should have different items
      if (response1.body.data.validations.length > 0 && response2.body.data.validations.length > 0) {
        const firstPageIds = response1.body.data.validations.map((v: any) => v.validationId);
        const secondPageIds = response2.body.data.validations.map((v: any) => v.validationId);
        expect(firstPageIds).not.toEqual(secondPageIds);
      }
    });

    it('should filter by status (Healthy/Unhealthy)', async () => {
      const cloneId = 'clone-healthy';

      // Create validations
      await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' });

      const response = await request(app)
        .get(`/api/clones/${cloneId}/validation-history`)
        .query({ status: 'Healthy' })
        .expect(200);

      expect(response.body.success).toBe(true);

      // All returned validations should have the filtered status
      response.body.data.validations.forEach((validation: any) => {
        expect(validation.status).toBe('Healthy');
      });
    });

    it('should include finding counts in history items', async () => {
      const cloneId = 'clone-healthy';

      await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' });

      const response = await request(app)
        .get(`/api/clones/${cloneId}/validation-history`)
        .expect(200);

      response.body.data.validations.forEach((item: any) => {
        expect(item.validationId).toBeDefined();
        expect(item.status).toBeDefined();
        expect(item.findingsCount).toBeDefined();
        expect(typeof item.findingsCount).toBe('number');
        expect(item.errorCount).toBeDefined();
        expect(typeof item.errorCount).toBe('number');
        expect(item.warningCount).toBeDefined();
        expect(typeof item.warningCount).toBe('number');
        expect(item.validatedAt).toBeDefined();
        expect(item.duration).toBeDefined();
        expect(typeof item.duration).toBe('number');
      });
    });

    it('should return 404 when clone not found', async () => {
      const cloneId = 'clone-nonexistent';
      const response = await request(app)
        .get(`/api/clones/${cloneId}/validation-history`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('E001_CLONE_NOT_FOUND');
    });

    it('should return empty history for clone with no validations', async () => {
      const cloneId = 'clone-test-2';

      const response = await request(app)
        .get(`/api/clones/${cloneId}/validation-history`)
        .expect(200);

      expect(response.body.data.validations).toBeDefined();
      expect(Array.isArray(response.body.data.validations)).toBe(true);
      expect(response.body.data.total).toBe(0);
    });
  });

  // ===== POST /api/clones/:cloneId/repair Tests =====

  describe('POST /api/clones/:cloneId/repair', () => {
    it('should create repair plan in dry-run mode (dryRun=true, default)', async () => {
      const cloneId = 'clone-unhealthy';

      const response = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.cloneId).toBe(cloneId);
      expect(response.body.data.repairId).toBeDefined();
      expect(response.body.data.isDryRun).toBe(true);
      expect(response.body.data.status).toBeDefined();
      expect(['Planned', 'CannotRepair']).toContain(response.body.data.status);
      expect(response.body.data.plan).toBeDefined();
      expect(response.body.data.plan.actions).toBeDefined();
      expect(Array.isArray(response.body.data.plan.actions)).toBe(true);
      expect(response.body.data.plan.estimatedDurationSeconds).toBeDefined();
      expect(response.body.data.plan.requiresApproval).toBeDefined();
      expect(response.body.data.createdAt).toBeDefined();
      expect(response.body.data.expiresAt).toBeDefined();
      expect(response.body.message).toBe('Repair plan created');
    });

    it('should execute repair when dryRun=false', async () => {
      const cloneId = 'clone-unhealthy';

      const response = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .query({ dryRun: 'false' })
        .expect(202);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.cloneId).toBe(cloneId);
      expect(response.body.data.repairId).toBeDefined();
      expect(response.body.data.isDryRun).toBe(false);
      expect(response.body.data.taskId).toBeDefined();
      expect(response.body.data.status).toBe('Queued');
      expect(response.body.message).toBe('Repair execution queued');
    });

    it('should support dryRun in request body', async () => {
      const cloneId = 'clone-unhealthy';

      const response = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .send({ dryRun: false })
        .expect(202);

      expect(response.body.data.isDryRun).toBe(false);
      expect(response.body.data.taskId).toBeDefined();
    });

    it('should include valid actions in repair plan', async () => {
      const cloneId = 'clone-unhealthy';

      const response = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .expect(200);

      const actions = response.body.data.plan.actions;
      expect(actions.length).toBeGreaterThan(0);

      actions.forEach((action: any) => {
        expect(action.type).toBeDefined();
        expect([
          'RemountVhd',
          'AttachDatabase',
          'DetachDatabase',
          'UpdateMetadata',
          'Other'
        ]).toContain(action.type);
        expect(action.description).toBeDefined();
        expect(action.estimatedDurationSeconds).toBeDefined();
        expect(typeof action.estimatedDurationSeconds).toBe('number');
        expect(action.riskLevel).toBeDefined();
      });
    });

    it('should return 404 when clone not found (E001)', async () => {
      const cloneId = 'clone-nonexistent';

      const response = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('E001_CLONE_NOT_FOUND');
    });

    it('should prevent concurrent repairs (E003)', async () => {
      const cloneId = 'clone-unhealthy';

      // Start first repair
      await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .query({ dryRun: 'false' })
        .expect(202);

      // Attempt second repair immediately
      const response = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .query({ dryRun: 'false' })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('E003_REPAIR_IN_PROGRESS');
      expect(response.body.error.details).toBeDefined();
      expect(response.body.error.details.lockInfo).toBeDefined();
    });

    it('should record repair-execute audit event on execute', async () => {
      const cloneId = 'clone-unhealthy';
      const recordOperationSpy = jest.spyOn(auditService, 'recordOperation');

      await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .query({ dryRun: 'false' });

      const repairCalls = recordOperationSpy.mock.calls.filter(
        call => call[0].type === 'repair-execute'
      );

      expect(repairCalls.length).toBeGreaterThan(0);
      expect(repairCalls[0][0]).toMatchObject({
        entityId: cloneId,
        type: 'repair-execute',
        status: 'pending'
      });
    });
  });

  // ===== GET /api/clones/:cloneId/repair-status Tests =====

  describe('GET /api/clones/:cloneId/repair-status', () => {
    it('should return repair status by repairId', async () => {
      const cloneId = 'clone-unhealthy';

      // Start repair
      const repairResponse = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .query({ dryRun: 'false' })
        .expect(202);

      const repairId = repairResponse.body.data.repairId;

      // Get repair status
      const response = await request(app)
        .get(`/api/clones/${cloneId}/repair-status`)
        .query({ repairId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.cloneId).toBe(cloneId);
      expect(response.body.data.repairId).toBeDefined();
      expect(response.body.data.status).toBeDefined();
      expect(['Queued', 'InProgress', 'Completed', 'Failed']).toContain(
        response.body.data.status
      );
    });

    it('should return repair status by taskId', async () => {
      const cloneId = 'clone-unhealthy';

      // Start repair
      const repairResponse = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .query({ dryRun: 'false' })
        .expect(202);

      const taskId = repairResponse.body.data.taskId;

      // Get status by task ID
      const response = await request(app)
        .get(`/api/clones/${cloneId}/repair-status`)
        .query({ taskId })
        .expect(200);

      expect(response.body.data.taskId).toBe(taskId);
      expect(response.body.data.status).toBeDefined();
    });

    it('should include result when repair is completed', async () => {
      const cloneId = 'clone-unhealthy';

      // Start and complete repair
      const repairResponse = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .query({ dryRun: 'false' })
        .expect(202);

      const taskId = repairResponse.body.data.taskId;

      // Simulate task completion
      taskQueue.updateTask(taskId, 'completed', { success: true, actions: [] });

      // Get status
      const response = await request(app)
        .get(`/api/clones/${cloneId}/repair-status`)
        .query({ taskId })
        .expect(200);

      expect(response.body.data.status).toBe('Completed');
      expect(response.body.data.result).toBeDefined();
      expect(response.body.data.result.success).toBeDefined();
      expect(response.body.data.result.actions).toBeDefined();
      expect(Array.isArray(response.body.data.result.actions)).toBe(true);
      expect(response.body.data.result.totalDuration).toBeDefined();
    });

    it('should track repair progress', async () => {
      const cloneId = 'clone-unhealthy';

      // Start repair
      const repairResponse = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .query({ dryRun: 'false' })
        .expect(202);

      const taskId = repairResponse.body.data.taskId;

      // Get status while queued
      let response = await request(app)
        .get(`/api/clones/${cloneId}/repair-status`)
        .query({ taskId })
        .expect(200);

      expect(response.body.data.status).toBe('Queued');

      // Simulate processing
      taskQueue.updateTask(taskId, 'processing');

      response = await request(app)
        .get(`/api/clones/${cloneId}/repair-status`)
        .query({ taskId })
        .expect(200);

      expect(response.body.data.status).toBe('InProgress');
    });

    it('should return 404 when clone not found', async () => {
      const cloneId = 'clone-nonexistent';

      const response = await request(app)
        .get(`/api/clones/${cloneId}/repair-status`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('E001_CLONE_NOT_FOUND');
    });

    it('should return 404 when taskId not found', async () => {
      const cloneId = 'clone-healthy';
      const fakeTaskId = 'task-nonexistent-123';

      const response = await request(app)
        .get(`/api/clones/${cloneId}/repair-status`)
        .query({ taskId: fakeTaskId })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 404 when no repair history exists', async () => {
      const cloneId = 'clone-test-2';

      const response = await request(app)
        .get(`/api/clones/${cloneId}/repair-status`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('E001_CLONE_NOT_FOUND');
      expect(response.body.error.message).toContain('No repair history');
    });
  });

  // ===== POST /api/clones/:cloneId/repair/cancel Tests =====

  describe('POST /api/clones/:cloneId/repair/cancel', () => {
    it('should cancel queued repair', async () => {
      const cloneId = 'clone-unhealthy';

      // Start repair
      const repairResponse = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .query({ dryRun: 'false' })
        .expect(202);

      const taskId = repairResponse.body.data.taskId;

      // Cancel repair
      const response = await request(app)
        .post(`/api/clones/${cloneId}/repair/cancel`)
        .query({ taskId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.cloneId).toBe(cloneId);
      expect(response.body.data.status).toBe('Cancelled');
      expect(response.body.message).toBe('Repair cancelled successfully');
    });

    it('should record repair-cancel audit event', async () => {
      const cloneId = 'clone-unhealthy';
      const recordOperationSpy = jest.spyOn(auditService, 'recordOperation');

      // Start repair
      const repairResponse = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .query({ dryRun: 'false' })
        .expect(202);

      const taskId = repairResponse.body.data.taskId;

      // Cancel repair
      await request(app)
        .post(`/api/clones/${cloneId}/repair/cancel`)
        .query({ taskId });

      const cancelCalls = recordOperationSpy.mock.calls.filter(
        call => call[0].type === 'repair-cancel'
      );

      expect(cancelCalls.length).toBeGreaterThan(0);
      expect(cancelCalls[0][0]).toMatchObject({
        entityId: cloneId,
        type: 'repair-cancel',
        status: 'completed'
      });
    });

    it('should prevent cancellation of completed repair', async () => {
      const cloneId = 'clone-unhealthy';

      // Start repair
      const repairResponse = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .query({ dryRun: 'false' })
        .expect(202);

      const taskId = repairResponse.body.data.taskId;

      // Mark as completed
      taskQueue.updateTask(taskId, 'completed', { success: true });

      // Try to cancel
      const response = await request(app)
        .post(`/api/clones/${cloneId}/repair/cancel`)
        .query({ taskId })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('E004_INVALID_REPAIR_STATE');
      expect(response.body.error.message).toContain('Cannot cancel');
    });

    it('should return 404 when clone not found', async () => {
      const cloneId = 'clone-nonexistent';

      const response = await request(app)
        .post(`/api/clones/${cloneId}/repair/cancel`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('E001_CLONE_NOT_FOUND');
    });

    it('should return 404 when taskId not found', async () => {
      const cloneId = 'clone-healthy';
      const fakeTaskId = 'task-nonexistent-456';

      const response = await request(app)
        .post(`/api/clones/${cloneId}/repair/cancel`)
        .query({ taskId: fakeTaskId })
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  // ===== Integration Tests =====

  describe('Integration: Validation + Repair Workflow', () => {
    it('should complete full validation-to-repair flow', async () => {
      const cloneId = 'clone-unhealthy';

      // Step 1: Validate clone
      const validateResponse = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' })
        .expect(200);

      const validationId = validateResponse.body.data.validationId;
      expect(validateResponse.body.data.status).toBeDefined();

      // Step 2: Get validation status
      const statusResponse = await request(app)
        .get(`/api/clones/${cloneId}/validation-status`)
        .expect(200);

      expect(statusResponse.body.data.validationId).toBeDefined();

      // Step 3: Plan repair (dry-run)
      const planResponse = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .expect(200);

      expect(planResponse.body.data.isDryRun).toBe(true);
      expect(planResponse.body.data.plan).toBeDefined();

      // Step 4: Execute repair
      const repairResponse = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .query({ dryRun: 'false' })
        .expect(202);

      const taskId = repairResponse.body.data.taskId;
      expect(repairResponse.body.data.status).toBe('Queued');

      // Step 5: Get repair status
      const repairStatusResponse = await request(app)
        .get(`/api/clones/${cloneId}/repair-status`)
        .query({ taskId })
        .expect(200);

      expect(repairStatusResponse.body.data.taskId).toBe(taskId);
    });

    it('should support dry-run preview then execute workflow', async () => {
      const cloneId = 'clone-unhealthy';

      // Plan repair
      const planResponse = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .expect(200);

      const plan = planResponse.body.data.plan;
      expect(plan.actions).toBeDefined();
      expect(plan.estimatedDurationSeconds).toBeDefined();

      // Then execute with confidence
      const executeResponse = await request(app)
        .post(`/api/clones/${cloneId}/repair`)
        .query({ dryRun: 'false' })
        .expect(202);

      expect(executeResponse.body.data.isDryRun).toBe(false);
      expect(executeResponse.body.data.taskId).toBeDefined();
    });

    it('should prevent concurrent operations with lock management', async () => {
      const cloneId = 'clone-test-1';

      // Start validation
      const validatePromise = request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'true' });

      // Immediately try another validation
      const validate2Promise = request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'true' });

      const [res1, res2] = await Promise.all([validatePromise, validate2Promise]);

      // One should succeed, one should get lock conflict
      const statuses = [res1.status, res2.status];
      expect(statuses).toContain(202); // At least one succeeded

      if (statuses.includes(409)) {
        // Lock conflict happened, verify it's correct error
        const conflictResponse = res2.status === 409 ? res2 : res1;
        expect(conflictResponse.body.error.code).toBe('E002_VALIDATION_IN_PROGRESS');
      }
    });
  });

  // ===== Error Handling Tests =====

  describe('Error Handling', () => {
    it('should handle service errors gracefully (E007)', async () => {
      const cloneId = 'clone-healthy';

      // Mock a service error by having validation service throw
      jest.spyOn(validationService, 'validateClone')
        .mockRejectedValueOnce(new Error('Service unavailable'));

      const response = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' });

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('E007_SERVICE_ERROR');
      expect(response.body.error.details).toBeDefined();
      expect(response.body.error.details.originalError).toBeDefined();
    });

    it('should include timestamp in all error responses', async () => {
      const cloneId = 'clone-nonexistent';

      const response = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .expect(404);

      expect(response.body.error.timestamp).toBeDefined();
      // Verify it's a valid ISO string
      expect(() => new Date(response.body.error.timestamp)).not.toThrow();
    });

    it('should include requestId or context in service errors', async () => {
      const cloneId = 'clone-healthy';

      jest.spyOn(validationService, 'validateClone')
        .mockRejectedValueOnce(new Error('Database error'));

      const response = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' });

      expect(response.body.error.details.requestId).toBeDefined();
    });
  });

  // ===== Audit Recording Verification =====

  describe('Audit Recording', () => {
    it('should record validation metrics including findings count', async () => {
      const cloneId = 'clone-unhealthy';
      const recordOperationSpy = jest.spyOn(auditService, 'recordOperation');

      await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' });

      const completeCalls = recordOperationSpy.mock.calls.filter(
        call => call[0].type === 'validation-complete'
      );

      expect(completeCalls.length).toBeGreaterThan(0);
      const completeOperation = completeCalls[0][0];

      expect(completeOperation.findings).toBeDefined();
      expect(completeOperation.metrics).toBeDefined();
      expect(completeOperation.metrics.findingsCount).toBeDefined();
      expect(completeOperation.metrics.errorCount).toBeDefined();
      expect(completeOperation.metrics.warningCount).toBeDefined();
    });

    it('should record operator ID when available', async () => {
      const cloneId = 'clone-test-1';
      const recordOperationSpy = jest.spyOn(auditService, 'recordOperation');

      // Request with user context
      await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' })
        .set('Authorization', 'Bearer test-token');

      const calls = recordOperationSpy.mock.calls.filter(
        call => call[0].entityId === cloneId
      );

      expect(calls.length).toBeGreaterThan(0);
      // At least some calls should attempt to capture operator ID
      expect(calls.some(call => call[0].operatorId !== undefined)).toBe(true);
    });

    it('should track completion timestamps', async () => {
      const cloneId = 'clone-healthy';
      const recordOperationSpy = jest.spyOn(auditService, 'recordOperation');

      await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' });

      const completeCalls = recordOperationSpy.mock.calls.filter(
        call => call[0].type === 'validation-complete'
      );

      const completeOperation = completeCalls[0][0];
      expect(completeOperation.completedAt).toBeDefined();
      expect(completeOperation.status).toBe('completed');
    });
  });

  // ===== Response Format Validation =====

  describe('Response Format Consistency', () => {
    it('should always include success field', async () => {
      const cloneId = 'clone-healthy';

      const validationRes = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' });

      expect(validationRes.body.success).toBeDefined();
      expect(typeof validationRes.body.success).toBe('boolean');

      const statusRes = await request(app)
        .get(`/api/clones/${cloneId}/validation-status`);

      expect(statusRes.body.success).toBeDefined();
    });

    it('should always include message field', async () => {
      const cloneId = 'clone-healthy';

      const validationRes = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' });

      expect(validationRes.body.message).toBeDefined();
      expect(typeof validationRes.body.message).toBe('string');
    });

    it('should include data field on success, error field on failure', async () => {
      const cloneId = 'clone-healthy';

      const successRes = await request(app)
        .post(`/api/clones/${cloneId}/validate`)
        .query({ queue: 'false' });

      expect(successRes.body.data).toBeDefined();
      expect(successRes.body.error).toBeUndefined();

      const errorRes = await request(app)
        .post(`/api/clones/nonexistent/validate`);

      expect(errorRes.body.error).toBeDefined();
      expect(errorRes.body.data).toBeUndefined();
    });

    it('should use consistent status codes for same error types', async () => {
      // 404 for not found
      const notFoundRes1 = await request(app)
        .post(`/api/clones/nonexistent/validate`);

      const notFoundRes2 = await request(app)
        .get(`/api/clones/nonexistent/validation-status`);

      expect(notFoundRes1.status).toBe(404);
      expect(notFoundRes2.status).toBe(404);

      // 500 for service errors
      jest.spyOn(validationService, 'validateClone')
        .mockRejectedValueOnce(new Error('Service error'));

      const serviceErrorRes = await request(app)
        .post(`/api/clones/clone-healthy/validate`)
        .query({ queue: 'false' });

      expect(serviceErrorRes.status).toBe(500);
    });
  });
});
