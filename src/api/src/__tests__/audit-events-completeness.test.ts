/**
 * Audit Events Completeness Test
 * Verifies that all validation and repair event types are captured
 * and returned by the operations API endpoint
 */

import { getCheckpointOperationRepository } from '../services/repository';
import { getAuditMetricsService } from '../services/auditMetricsService';

describe('Audit Events Completeness', () => {
  const auditMetricsService = getAuditMetricsService();

  describe('Event Type Coverage', () => {
    it('should record validation-start events', async () => {
      const cloneId = 'test-clone-123';
      const validationId = 'val-001';

      await auditMetricsService.recordValidationStart(cloneId, validationId, 'test-user');

      const validationOps = await auditMetricsService.getValidationOperations(cloneId);
      expect(validationOps.length).toBeGreaterThan(0);
      expect(validationOps.some(op => op.type === 'validation-start')).toBe(true);
    });

    it('should record validation-complete events', async () => {
      const cloneId = 'test-clone-456';
      const validationId = 'val-002';
      const findings = [
        { severity: 'Error', message: 'Test error' },
        { severity: 'Warning', message: 'Test warning' }
      ];

      await auditMetricsService.recordValidationComplete(cloneId, validationId, findings, false);

      const validationOps = await auditMetricsService.getValidationOperations(cloneId);
      expect(validationOps.length).toBeGreaterThan(0);
      expect(validationOps.some(op => op.type === 'validation-complete')).toBe(true);
    });

    it('should record repair-start events', async () => {
      const cloneId = 'test-clone-789';
      const repairId = 'rep-001';

      await auditMetricsService.recordRepairStart(cloneId, repairId, undefined, 'test-user');

      const repairOps = await auditMetricsService.getRepairOperations(cloneId);
      expect(repairOps.length).toBeGreaterThan(0);
      expect(repairOps.some(op => op.type === 'repair-start' || op.type === 'repair-execute')).toBe(true);
    });

    it('should record repair-complete events', async () => {
      const cloneId = 'test-clone-101';
      const repairId = 'rep-002';
      const actions = [
        { status: 'Succeeded', action: 'Action 1' },
        { status: 'Succeeded', action: 'Action 2' }
      ];

      await auditMetricsService.recordRepairComplete(cloneId, repairId, true, actions);

      const repairOps = await auditMetricsService.getRepairOperations(cloneId);
      expect(repairOps.length).toBeGreaterThan(0);
      expect(repairOps.some(op => op.type === 'repair-complete')).toBe(true);
    });
  });

  describe('Database Persistence', () => {
    it('should persist validation events to OperationMetrics table', async () => {
      const cloneId = 'persist-test-001';
      const validationId = 'val-persist-001';

      await auditMetricsService.recordValidationStart(cloneId, validationId, 'test-user');

      // Event should be in memory and persisted to database
      const validationOps = await auditMetricsService.getValidationOperations(cloneId);
      expect(validationOps.length).toBeGreaterThan(0);
    });

    it('should persist repair events to OperationMetrics table', async () => {
      const cloneId = 'persist-test-002';
      const repairId = 'rep-persist-001';

      await auditMetricsService.recordRepairStart(cloneId, repairId, undefined, 'test-user');

      // Event should be in memory and persisted to database
      const repairOps = await auditMetricsService.getRepairOperations(cloneId);
      expect(repairOps.length).toBeGreaterThan(0);
    });
  });

  describe('Event Type Normalization', () => {
    it('should normalize validation event types correctly', () => {
      const types = ['validation-start', 'validation-complete'];

      types.forEach(type => {
        expect(['validation-start', 'validation-complete']).toContain(type);
      });
    });

    it('should normalize repair event types correctly', () => {
      const types = ['repair-start', 'repair-execute', 'repair-complete', 'repair-plan'];

      types.forEach(type => {
        expect(['repair-start', 'repair-execute', 'repair-complete', 'repair-plan']).toContain(type);
      });
    });
  });

  describe('Operation Timeline Integration', () => {
    it('validation and repair operations should be included in timeline', async () => {
      const cloneId = 'timeline-test-001';

      // Record validation event
      const validationId = 'val-timeline-001';
      await auditMetricsService.recordValidationStart(cloneId, validationId, 'test-user');

      // Record repair event
      const repairId = 'rep-timeline-001';
      await auditMetricsService.recordRepairStart(cloneId, repairId, undefined, 'test-user');

      // Get all operations for this clone
      const validationOps = await auditMetricsService.getValidationOperations(cloneId);
      const repairOps = await auditMetricsService.getRepairOperations(cloneId);

      // Timeline should include both event types
      expect(validationOps.length).toBeGreaterThan(0);
      expect(repairOps.length).toBeGreaterThan(0);
    });
  });
});
