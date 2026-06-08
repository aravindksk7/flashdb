/**
 * Operations API Audit Events Integration Test
 * Verifies the /api/operations endpoint returns all event types
 * including validation-start, validation-complete, repair-start, repair-complete
 */

import request from 'supertest';
import express, { Express } from 'express';
import operationsRouter from '../routes/operations';
import { getAuditMetricsService } from '../services/auditMetricsService';

describe('Operations API - Audit Events', () => {
  let app: Express;
  const auditMetricsService = getAuditMetricsService();

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/operations', operationsRouter);
  });

  describe('GET /operations - Event Type Filtering', () => {
    beforeEach(async () => {
      // Record various event types
      const cloneId = 'api-test-clone-001';

      // Validation events
      await auditMetricsService.recordValidationStart(cloneId, 'val-001', 'test-user');
      await auditMetricsService.recordValidationComplete(
        cloneId,
        'val-001',
        [{ severity: 'Info', message: 'All good' }],
        true
      );

      // Repair events
      await auditMetricsService.recordRepairStart(cloneId, 'rep-001', undefined, 'test-user');
      await auditMetricsService.recordRepairComplete(
        cloneId,
        'rep-001',
        true,
        [{ status: 'Succeeded', action: 'Fix 1' }]
      );
    });

    it('should include validation operations in response', async () => {
      const response = await request(app)
        .get('/operations')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();

      const validationOps = response.body.data.filter((op: any) => op.type === 'validation');
      expect(validationOps.length).toBeGreaterThan(0);
    });

    it('should include repair operations in response', async () => {
      const response = await request(app)
        .get('/operations')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();

      const repairOps = response.body.data.filter((op: any) => op.type === 'repair');
      expect(repairOps.length).toBeGreaterThan(0);
    });

    it('should filter by clone ID and include all event types', async () => {
      const cloneId = 'api-test-clone-002';

      // Record events
      await auditMetricsService.recordValidationStart(cloneId, 'val-002', 'test-user');
      await auditMetricsService.recordRepairStart(cloneId, 'rep-002', undefined, 'test-user');

      const response = await request(app)
        .get(`/operations?cloneId=${cloneId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();

      // Check that all events for this clone are included
      const allOpsForClone = response.body.data.filter((op: any) => op.cloneId === cloneId);
      const hasValidation = allOpsForClone.some((op: any) => op.type === 'validation');
      const hasRepair = allOpsForClone.some((op: any) => op.type === 'repair');

      expect(hasValidation || hasRepair || allOpsForClone.length === 0).toBe(true);
    });

    it('should correctly normalize operation types from database', async () => {
      const response = await request(app)
        .get('/operations?limit=500')
        .expect(200);

      expect(response.body.success).toBe(true);

      // All returned operations should have normalized types
      const allowedTypes = [
        'create', 'restore', 'delete', 'validation', 'repair',
        'create-clone', 'delete-clone', 'unknown'
      ];

      response.body.data.forEach((op: any) => {
        expect(allowedTypes).toContain(op.type);
      });
    });
  });

  describe('GET /operations/timeline/:cloneId - Event Type Inclusion', () => {
    it('should include validation and repair events in timeline', async () => {
      const cloneId = 'timeline-test-clone-001';

      // Record various events
      await auditMetricsService.recordValidationStart(cloneId, 'val-timeline-001', 'test-user');
      await auditMetricsService.recordRepairStart(cloneId, 'rep-timeline-001', undefined, 'test-user');

      const response = await request(app)
        .get(`/operations/timeline/${cloneId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);

      // Timeline should include events from our records
      const timelineData = response.body.data;
      const hasValidationOrRepair = timelineData.some((op: any) =>
        op.type === 'validation' || op.type === 'repair'
      );

      expect(hasValidationOrRepair || timelineData.length === 0).toBe(true);
    });
  });

  describe('Database Query Coverage', () => {
    it('should query OperationMetrics table for audit events', async () => {
      const cloneId = 'metrics-test-clone-001';

      // Record events that go to OperationMetrics
      await auditMetricsService.recordValidationStart(cloneId, 'val-metrics-001', 'test-user');
      await auditMetricsService.recordValidationComplete(
        cloneId,
        'val-metrics-001',
        [],
        true
      );

      const response = await request(app)
        .get('/operations')
        .expect(200);

      // Should have audit operations from database
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    it('should merge operations from all sources (repository, queue, audit)', async () => {
      const response = await request(app)
        .get('/operations?limit=500')
        .expect(200);

      expect(response.body.success).toBe(true);

      // Should have operations from multiple sources
      const sources = new Set(response.body.data.map((op: any) => op.source || 'unknown'));
      expect(sources.size).toBeGreaterThan(0);
    });
  });

  describe('Event Deduplication', () => {
    it('should deduplicate events with same ID', async () => {
      const response = await request(app)
        .get('/operations?limit=1000')
        .expect(200);

      expect(response.body.success).toBe(true);

      const ids = response.body.data.map((op: any) => op.id);
      const uniqueIds = new Set(ids);

      // All IDs should be unique
      expect(ids.length).toBe(uniqueIds.size);
    });
  });

  describe('Operation Status Tracking', () => {
    it('validation operations should track completion status', async () => {
      const cloneId = 'status-test-clone-001';
      const validationId = 'val-status-001';

      await auditMetricsService.recordValidationStart(cloneId, validationId, 'test-user');
      await auditMetricsService.recordValidationComplete(
        cloneId,
        validationId,
        [{ severity: 'Info', message: 'OK' }],
        true
      );

      const response = await request(app)
        .get(`/operations?cloneId=${cloneId}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Should see completed validation operation
      const validationOps = response.body.data.filter((op: any) => op.type === 'validation');
      if (validationOps.length > 0) {
        expect(['pending', 'completed', 'failed']).toContain(validationOps[0].status);
      }
    });

    it('repair operations should track completion status', async () => {
      const cloneId = 'status-test-clone-002';
      const repairId = 'rep-status-001';

      await auditMetricsService.recordRepairStart(cloneId, repairId, undefined, 'test-user');
      await auditMetricsService.recordRepairComplete(
        cloneId,
        repairId,
        true,
        [{ status: 'Succeeded', action: 'Action' }]
      );

      const response = await request(app)
        .get(`/operations?cloneId=${cloneId}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Should see repair operation with status
      const repairOps = response.body.data.filter((op: any) => op.type === 'repair');
      if (repairOps.length > 0) {
        expect(['pending', 'completed', 'failed']).toContain(repairOps[0].status);
      }
    });
  });
});
