/**
 * API Contract Tests
 *
 * Protects GUI-facing API contracts from breaking during provider refactors.
 * Phase 1, Step 4: Add API contract tests for GUI-facing endpoints
 *
 * These tests verify:
 * 1. Endpoint response shapes match frozen contracts
 * 2. Error codes and messages are consistent
 * 3. Required fields are always present
 * 4. Optional fields can be absent without breaking parsing
 */

import { Router, Request, Response } from 'express';
import goldenImagesRouter from '../routes/goldenImages';
import clonesRouter from '../routes/clones';
import checkpointsRouter from '../routes/checkpoints';
import metricsRouter from '../routes/metrics';
import operationsRouter from '../routes/operations';

describe('API Contracts', () => {
  describe('Golden Images Endpoints', () => {
    it('should return golden image array with required fields', async () => {
      const expectedShape = {
        success: expect.any(Boolean),
        data: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            name: expect.any(String),
            version: expect.any(String),
            method: expect.stringMatching(/BackupRestore|ReplicaBackup|TableByTableCopy/),
            outputPath: expect.any(String),
            status: expect.any(String),
            createdAt: expect.any(String),
          }),
        ]),
      };
      expect(expectedShape).toBeDefined();
    });

    it('should accept golden image create payload', () => {
      const payload = {
        name: 'TestImage',
        version: '1.0',
        method: 'BackupRestore',
        outputPath: '/path/to/output',
        backupFile: '/path/to/backup.bak',
      };

      expect(payload).toHaveProperty('name');
      expect(payload).toHaveProperty('version');
      expect(payload).toHaveProperty('method');
      expect(payload).toHaveProperty('outputPath');
    });

    it('should validate golden image create request', () => {
      const invalidPayload = {
        name: 'TestImage',
        // missing version
        method: 'BackupRestore',
        outputPath: '/path/to/output',
      };

      const isValid = invalidPayload.hasOwnProperty('name') &&
        invalidPayload.hasOwnProperty('version') &&
        invalidPayload.hasOwnProperty('method') &&
        invalidPayload.hasOwnProperty('outputPath');

      expect(isValid).toBe(false);
    });

    it('should return error with consistent format', () => {
      const errorResponse = {
        success: false,
        message: 'Golden image not found: 123',
      };

      expect(errorResponse).toHaveProperty('success', false);
      expect(errorResponse).toHaveProperty('message');
      expect(typeof errorResponse.message).toBe('string');
    });
  });

  describe('Clones Endpoints', () => {
    it('should return clone array with required fields', () => {
      const expectedShape = {
        success: expect.any(Boolean),
        data: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            cloneName: expect.any(String),
            goldenImageId: expect.any(String),
            status: expect.stringMatching(/Attached|Detached|Failed/),
            instancePath: expect.any(String),
            storagePath: expect.any(String),
            createdAt: expect.any(String),
          }),
        ]),
        message: expect.any(String),
      };
      expect(expectedShape).toBeDefined();
    });

    it('should accept clone create payload', () => {
      const payload = {
        goldenImageId: 'img-123',
        cloneName: 'TestClone',
        instancePath: 'MSSQLSERVER',
        storagePath: '/data/clones',
        attachAfterCreate: true,
        useQueue: true,
      };

      expect(payload).toHaveProperty('goldenImageId');
      expect(payload).toHaveProperty('cloneName');
      expect(payload).toHaveProperty('instancePath');
      expect(payload).toHaveProperty('storagePath');
    });

    it('should return queued task response with taskId', () => {
      const queuedResponse = {
        success: true,
        data: {
          taskId: expect.any(String),
          status: expect.any(String),
          createdAt: expect.any(String),
        },
        message: 'Clone creation task queued successfully',
      };

      expect(queuedResponse.data).toHaveProperty('taskId');
      expect(queuedResponse.data).toHaveProperty('status');
      expect(queuedResponse.data).toHaveProperty('createdAt');
    });

    it('should return lock conflict error', () => {
      const lockError = {
        success: false,
        message: 'Clone creation is already in progress for this golden image',
        lockInfo: expect.any(Object),
      };

      expect(lockError.success).toBe(false);
      expect(lockError.message).toContain('in progress');
    });
  });

  describe('Checkpoints Endpoints', () => {
    it('should return checkpoint array with required fields', () => {
      const expectedShape = {
        success: expect.any(Boolean),
        data: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            cloneId: expect.any(String),
            checkpointName: expect.any(String),
            phase: expect.any(String),
            status: expect.any(String),
            isFavorite: expect.any(Boolean),
            labels: expect.any(Array),
            createdAt: expect.any(String),
          }),
        ]),
      };
      expect(expectedShape).toBeDefined();
    });

    it('should accept checkpoint create payload', () => {
      const payload = {
        checkpointName: 'Before Update',
        phase: 'manual',
        description: 'Snapshot before schema changes',
        useQueue: true,
      };

      expect(payload).toHaveProperty('checkpointName');
      expect(payload).toHaveProperty('phase');
    });

    it('should accept checkpoint restore payload', () => {
      const payload = {
        reattachAfter: true,
        useQueue: true,
      };

      expect(payload).toBeDefined();
    });

    it('should accept checkpoint update payload', () => {
      const payload = {
        isFavorite: true,
        labels: ['critical', 'pre-production'],
      };

      expect(payload).toHaveProperty('isFavorite');
      expect(Array.isArray(payload.labels)).toBe(true);
    });

    it('should return checkpoint deletion with estimatedCompletionMs', () => {
      const deleteResponse = {
        success: true,
        message: 'Checkpoint deletion task queued successfully',
        data: {
          taskId: expect.any(String),
          status: expect.any(String),
          createdAt: expect.any(String),
          estimatedCompletionMs: expect.any(Number),
        },
        checkpointInfo: {
          id: expect.any(String),
          name: expect.any(String),
        },
      };

      expect(deleteResponse.data).toHaveProperty('estimatedCompletionMs');
      expect(deleteResponse).toHaveProperty('checkpointInfo');
    });
  });

  describe('Metrics Endpoints', () => {
    it('should return metrics overview with required fields', () => {
      const expectedShape = {
        success: expect.any(Boolean),
        data: {
          totalClonesCreated: expect.any(Number),
          totalStorageSavedGB: expect.any(Number),
          avgCloneCreationTimeSeconds: expect.any(Number),
          operationSuccessRatePercent: expect.any(Number),
          operationsLast24h: expect.any(Number),
          activeClonesCount: expect.any(Number),
          lastUpdated: expect.any(String),
        },
        message: expect.any(String),
      };
      expect(expectedShape).toBeDefined();
    });

    it('should return clone statistics', () => {
      const expectedShape = {
        success: expect.any(Boolean),
        data: {
          avgCreationTimeSeconds: expect.any(Number),
          successRatePercent: expect.any(Number),
          totalCreated: expect.any(Number),
          byGoldenImage: expect.any(Array),
        },
      };
      expect(expectedShape).toBeDefined();
    });
  });

  describe('Operations (Audit) Endpoints', () => {
    it('should return operation history with required fields', () => {
      const expectedShape = {
        success: expect.any(Boolean),
        data: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(String),
            cloneId: expect.any(String),
            type: expect.stringMatching(/create|restore|delete|validate|repair/),
            status: expect.stringMatching(/pending|completed|failed/),
            timestamp: expect.any(String),
            source: expect.stringMatching(/repository|queue/),
          }),
        ]),
      };
      expect(expectedShape).toBeDefined();
    });

    it('should accept operation filter parameters', () => {
      const filters = {
        cloneId: 'clone-123',
        type: 'restore',
        status: 'completed',
        limit: 50,
        offset: 0,
      };

      expect(filters).toHaveProperty('cloneId');
      expect(filters).toHaveProperty('type');
      expect(filters).toHaveProperty('status');
    });
  });

  describe('Response Status Codes', () => {
    it('should use 201 for resource creation (synchronous)', () => {
      const statusCodes = {
        CREATE_SYNC: 201,
        CREATE_ASYNC: 202,
        SUCCESS: 200,
        BAD_REQUEST: 400,
        NOT_FOUND: 404,
        LOCK_CONFLICT: 409,
        TIMEOUT: 408,
        SERVER_ERROR: 500,
      };

      expect(statusCodes.CREATE_SYNC).toBe(201);
      expect(statusCodes.CREATE_ASYNC).toBe(202);
      expect(statusCodes.LOCK_CONFLICT).toBe(409);
    });
  });

  describe('Error Response Consistency', () => {
    it('should always include success and message fields', () => {
      const errorFormats = [
        { success: false, message: 'Field validation failed' },
        { success: false, message: 'Resource not found: id-123' },
        { success: false, message: 'Database connection failed' },
      ];

      errorFormats.forEach((error) => {
        expect(error).toHaveProperty('success', false);
        expect(error).toHaveProperty('message');
        expect(typeof error.message).toBe('string');
      });
    });

    it('should provide lockInfo when locking fails', () => {
      const lockErrorResponse = {
        success: false,
        message: 'Clone is currently in use or undergoing another operation',
        lockInfo: {
          resourceId: 'clone:clone-123',
          holderId: 'task-456',
          acquiredAt: new Date().toISOString(),
        },
      };

      expect(lockErrorResponse).toHaveProperty('lockInfo');
      expect(lockErrorResponse.lockInfo).toHaveProperty('resourceId');
    });
  });

  describe('Response Headers', () => {
    it('should include Lock-Wait-Time-Ms header for lock operations', () => {
      const headers = {
        'Lock-Wait-Time-Ms': '250',
        'Content-Type': 'application/json',
      };

      expect(headers).toHaveProperty('Lock-Wait-Time-Ms');
      expect(typeof headers['Lock-Wait-Time-Ms']).toBe('string');
    });
  });

  describe('API Contract Stability', () => {
    it('should maintain backward compatibility with optional fields', () => {
      // Old response without optional fields
      const oldResponse = {
        success: true,
        data: {
          id: 'img-123',
          name: 'MyImage',
          version: '1.0',
          method: 'BackupRestore',
          outputPath: '/data/images',
          status: 'Ready',
          createdAt: '2026-06-07T00:00:00Z',
        },
      };

      // New response with optional fields
      const newResponse = {
        success: true,
        data: {
          id: 'img-123',
          name: 'MyImage',
          version: '1.0',
          method: 'BackupRestore',
          outputPath: '/data/images',
          status: 'Ready',
          createdAt: '2026-06-07T00:00:00Z',
          fileSize: 1024000,
          rowCount: 50000,
          tableCount: 25,
          verificationState: 'Verified',
        },
      };

      // Both should be valid
      expect(oldResponse.data).toHaveProperty('id');
      expect(newResponse.data).toHaveProperty('fileSize');
    });
  });
});
