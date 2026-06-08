/**
 * Audit Metrics Service Tests
 * Tests for operation recording and database persistence
 */

import { AuditMetricsService } from '../auditMetricsService';
import * as sqlClient from '../sqlClient';

// Mock sqlClient
jest.mock('../sqlClient');

describe('AuditMetricsService', () => {
  let service: AuditMetricsService;
  let mockSqlClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock SQL client
    mockSqlClient = {
      execute: jest.fn().mockResolvedValue({})
    };

    (sqlClient.getSqlClient as jest.Mock).mockReturnValue(mockSqlClient);

    // Create fresh service instance
    service = new AuditMetricsService();
  });

  describe('recordOperation', () => {
    it('should record operation in memory', async () => {
      const operation = {
        id: 'op-123',
        type: 'validation',
        entityId: 'clone-456',
        status: 'completed' as const,
        timestamp: new Date(),
        completedAt: new Date(),
        findings: []
      };

      await service.recordOperation(operation);

      // Verify operation is stored in memory
      const validations = await service.getValidationOperations('clone-456');
      expect(validations).toHaveLength(1);
      expect(validations[0].id).toBe('op-123');
    });

    it('should persist operation to database', async () => {
      const operation = {
        id: 'op-123',
        type: 'validation',
        entityId: 'clone-456',
        status: 'completed' as const,
        timestamp: new Date(),
        completedAt: new Date(),
        findings: []
      };

      await service.recordOperation(operation);

      // Verify database insert was called
      expect(mockSqlClient.execute).toHaveBeenCalled();
      const call = mockSqlClient.execute.mock.calls[0];
      expect(call[0]).toContain('OperationMetrics');
      expect(call[1].id).toBe('op-123');
      expect(call[1].operationType).toBe('validation');
      expect(call[1].targetId).toBe('clone-456');
    });

    it('should continue recording in memory even if database write fails', async () => {
      mockSqlClient.execute.mockRejectedValueOnce(new Error('DB error'));

      const operation = {
        id: 'op-123',
        type: 'validation',
        entityId: 'clone-456',
        status: 'completed' as const,
        timestamp: new Date(),
        findings: []
      };

      // Should not throw
      await service.recordOperation(operation);

      // In-memory record should still exist
      const validations = await service.getValidationOperations('clone-456');
      expect(validations).toHaveLength(1);
    });
  });

  describe('recordValidationStart', () => {
    it('should record validation start operation', async () => {
      await service.recordValidationStart('clone-123', 'val-456', 'user-789');

      const operations = await service.getValidationOperations('clone-123');
      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe('validation-start');
      expect(operations[0].status).toBe('pending');
    });
  });

  describe('recordValidationComplete', () => {
    it('should record validation completion with findings', async () => {
      const findings = [
        { severity: 'Error', message: 'Test error' },
        { severity: 'Warning', message: 'Test warning' }
      ];

      await service.recordValidationComplete('clone-123', 'val-456', findings, false);

      const operations = await service.getValidationOperations('clone-123');
      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe('validation-complete');
      expect(operations[0].status).toBe('completed');
      expect(operations[0].metrics?.findingsCount).toBe(2);
    });
  });

  describe('recordRepairStart', () => {
    it('should record repair start operation', async () => {
      await service.recordRepairStart('clone-123', 'repair-456', 'val-789');

      const operations = await service.getRepairOperations('clone-123');
      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe('repair-execute');
    });
  });

  describe('recordRepairComplete', () => {
    it('should record repair completion', async () => {
      const actions = [
        { status: 'Succeeded', action: 'action1' },
        { status: 'Failed', action: 'action2' }
      ];

      await service.recordRepairComplete('clone-123', 'repair-456', false, actions);

      const operations = await service.getRepairOperations('clone-123');
      expect(operations).toHaveLength(1);
      expect(operations[0].type).toBe('repair-complete');
      expect(operations[0].metrics?.actionsCompleted).toBe(1);
      expect(operations[0].metrics?.actionsFailed).toBe(1);
    });
  });

  describe('getValidationOperations', () => {
    it('should retrieve validation operations for specific clone', async () => {
      const op1 = {
        id: 'val-1',
        type: 'validation-start',
        entityId: 'clone-123',
        status: 'pending' as const,
        timestamp: new Date()
      };

      const op2 = {
        id: 'val-2',
        type: 'validation-complete',
        entityId: 'clone-456',
        status: 'completed' as const,
        timestamp: new Date(),
        completedAt: new Date()
      };

      await service.recordOperation(op1);
      await service.recordOperation(op2);

      const clone123Ops = await service.getValidationOperations('clone-123');
      expect(clone123Ops).toHaveLength(1);
      expect(clone123Ops[0].entityId).toBe('clone-123');
    });

    it('should retrieve all validation operations without clone filter', async () => {
      const op1 = {
        id: 'val-1',
        type: 'validation-start',
        entityId: 'clone-123',
        status: 'pending' as const,
        timestamp: new Date()
      };

      const op2 = {
        id: 'val-2',
        type: 'validation-complete',
        entityId: 'clone-456',
        status: 'completed' as const,
        timestamp: new Date(),
        completedAt: new Date()
      };

      await service.recordOperation(op1);
      await service.recordOperation(op2);

      const allOps = await service.getValidationOperations();
      expect(allOps).toHaveLength(2);
    });

    it('should sort operations by timestamp descending', async () => {
      const now = new Date();
      const op1 = {
        id: 'val-1',
        type: 'validation-start',
        entityId: 'clone-123',
        status: 'pending' as const,
        timestamp: new Date(now.getTime() - 10000)
      };

      const op2 = {
        id: 'val-2',
        type: 'validation-complete',
        entityId: 'clone-123',
        status: 'completed' as const,
        timestamp: new Date(now.getTime()),
        completedAt: new Date()
      };

      await service.recordOperation(op1);
      await service.recordOperation(op2);

      const ops = await service.getValidationOperations('clone-123');
      expect(ops[0].id).toBe('val-2'); // Most recent first
      expect(ops[1].id).toBe('val-1');
    });
  });

  describe('database persistence', () => {
    it('should calculate duration in milliseconds for persisted operation', async () => {
      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + 5000);

      const operation = {
        id: 'op-123',
        type: 'repair-complete',
        entityId: 'clone-456',
        status: 'completed' as const,
        timestamp: startTime,
        completedAt: endTime
      };

      await service.recordOperation(operation);

      const call = mockSqlClient.execute.mock.calls[0];
      expect(call[1].durationMs).toBe(5000);
    });

    it('should set null duration if operation not completed', async () => {
      const operation = {
        id: 'op-123',
        type: 'validation',
        entityId: 'clone-456',
        status: 'pending' as const,
        timestamp: new Date()
      };

      await service.recordOperation(operation);

      const call = mockSqlClient.execute.mock.calls[0];
      expect(call[1].durationMs).toBeNull();
    });
  });
});
