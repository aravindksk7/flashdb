/**
 * Clone Validation Service - Repair Logic Tests
 *
 * Tests for:
 * - NO_VHDX_PATH warning detection and recovery
 * - ATTACHED_BUT_NO_MOUNT warning removal (non-durable fact)
 * - VHDX path recovery methods
 * - Repair plan execution with dry-run support
 */

import { CloneValidationService } from '../services/cloneValidationService';
import { getProvider } from '../providers/sqlServerProvider';

// Mock the provider
jest.mock('../providers/sqlServerProvider');
jest.mock('../services/metadataService');

describe('CloneValidationService - Repair Logic', () => {
  let validationService: CloneValidationService;
  let mockProvider: any;
  let mockMetadataService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup provider mock
    mockProvider = {
      getClone: jest.fn(),
      getGoldenImage: jest.fn(),
    };
    (getProvider as jest.Mock).mockReturnValue(mockProvider);

    // Setup metadata service mock
    mockMetadataService = {
      saveClone: jest.fn().mockResolvedValue({}),
      getMetadataStats: jest.fn(),
    };
    const metadataModule = require('../services/metadataService');
    metadataModule.getMetadataService = jest.fn(() => mockMetadataService);

    // Create service instance
    validationService = new CloneValidationService();
  });

  describe('NO_VHDX_PATH Detection and Recovery', () => {
    it('should detect when clone has no VHDX path recorded', async () => {
      // Setup: Clone exists but vhdxPath is null
      mockProvider.getClone.mockResolvedValue({
        id: 'test-clone-1',
        cloneName: 'TestClone',
        status: 'Detached',
        storagePath: 'D:\\Clones\\test-clone-1',
        vhdxPath: null, // Missing VHDX path
        goldenImageId: 'golden-1',
      });

      mockProvider.getGoldenImage.mockResolvedValue({
        id: 'golden-1',
        name: 'GoldenImage1',
      });

      // Execute validation
      const result = await validationService.validateClone('test-clone-1');

      // Verify: NO_VHDX_PATH warning is present
      expect(result.isHealthy).toBe(true); // Warnings don't make it unhealthy
      expect(result.findings).toContainEqual(
        expect.objectContaining({
          code: 'NO_VHDX_PATH',
          severity: 'Warning',
        })
      );
    });

    it('should recover VHDX path from storage_path', async () => {
      // Setup: Clone with storage path but no vhdxPath
      mockProvider.getClone.mockResolvedValue({
        id: 'test-clone-1',
        cloneName: 'TestClone',
        storagePath: 'D:\\Clones\\test-clone-1',
        vhdxPath: null,
      });

      // Execute dry-run recovery
      const dryRunResult = await validationService.recoverVhdxPath('test-clone-1', true);

      // Verify: Recovery plan identified the path
      expect(dryRunResult.success).toBe(true);
      expect(dryRunResult.recoveredPath).toBe('D:\\Clones\\test-clone-1\\test-clone-1.vhdx');
      expect(dryRunResult.method).toBe('storage_path_construction');
    });

    it('should not modify metadata during dry-run', async () => {
      mockProvider.getClone.mockResolvedValue({
        id: 'test-clone-1',
        storagePath: 'D:\\Clones\\test-clone-1',
        vhdxPath: null,
      });

      // Execute dry-run
      await validationService.recoverVhdxPath('test-clone-1', true);

      // Verify: Metadata service was NOT called
      expect(mockMetadataService.saveClone).not.toHaveBeenCalled();
    });

    it('should update metadata when executing recovery without dry-run', async () => {
      const cloneData = {
        id: 'test-clone-1',
        storagePath: 'D:\\Clones\\test-clone-1',
        vhdxPath: null,
      };
      mockProvider.getClone.mockResolvedValue(cloneData);

      // Execute actual recovery
      const result = await validationService.recoverVhdxPath('test-clone-1', false);

      // Verify: Metadata was updated
      expect(mockMetadataService.saveClone).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-clone-1',
          vhdxPath: 'D:\\Clones\\test-clone-1\\test-clone-1.vhdx',
        })
      );
      expect(result.success).toBe(true);
    });

    it('should return error when clone not found', async () => {
      mockProvider.getClone.mockResolvedValue(null);

      const result = await validationService.recoverVhdxPath('nonexistent-clone', true);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Clone not found');
    });

    it('should return error when storage_path is missing', async () => {
      mockProvider.getClone.mockResolvedValue({
        id: 'test-clone-1',
        storagePath: null, // No storage path to construct from
        vhdxPath: null,
      });

      const result = await validationService.recoverVhdxPath('test-clone-1', true);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Cannot recover VHDX path');
    });
  });

  describe('ATTACHED_BUT_NO_MOUNT Removal', () => {
    it('should NOT report ATTACHED_BUT_NO_MOUNT warning', async () => {
      // Setup: Clone is attached but has no mount path
      mockProvider.getClone.mockResolvedValue({
        id: 'test-clone-1',
        cloneName: 'TestClone',
        status: 'Attached',
        databaseName: 'TestDB',
        vhdxPath: 'D:\\Clones\\test-clone-1\\test-clone-1.vhdx',
        mountPath: null, // No mount path - this is expected!
        goldenImageId: 'golden-1',
      });

      mockProvider.getGoldenImage.mockResolvedValue({
        id: 'golden-1',
        name: 'GoldenImage1',
      });

      // Execute validation
      const result = await validationService.validateClone('test-clone-1');

      // Verify: NO ATTACHED_BUT_NO_MOUNT warning
      const attachedNoMountWarning = result.findings.find(
        (f) => f.code === 'ATTACHED_BUT_NO_MOUNT'
      );
      expect(attachedNoMountWarning).toBeUndefined();

      // Note: This is the fix - mount_path is non-durable, so we don't validate it
      expect(result.isHealthy).toBe(true);
    });

    it('should still report ATTACHED_BUT_NO_DB warning', async () => {
      // Setup: Clone is attached but database not recorded
      mockProvider.getClone.mockResolvedValue({
        id: 'test-clone-1',
        cloneName: 'TestClone',
        status: 'Attached',
        databaseName: null, // No database recorded
        vhdxPath: 'D:\\Clones\\test-clone-1\\test-clone-1.vhdx',
        goldenImageId: 'golden-1',
      });

      mockProvider.getGoldenImage.mockResolvedValue({
        id: 'golden-1',
        name: 'GoldenImage1',
      });

      // Execute validation
      const result = await validationService.validateClone('test-clone-1');

      // Verify: ATTACHED_BUT_NO_DB warning IS present (database is durable)
      const attachedNoDbWarning = result.findings.find(
        (f) => f.code === 'ATTACHED_BUT_NO_DB'
      );
      expect(attachedNoDbWarning).toBeDefined();
      expect(attachedNoDbWarning?.severity).toBe('Warning');
    });
  });

  describe('Repair Plan Generation', () => {
    it('should plan VHDX recovery when clone has missing parent image (error)', async () => {
      // Missing parent image makes validation unhealthy, triggering repair plan
      mockProvider.getClone.mockResolvedValue({
        id: 'test-clone-1',
        cloneName: 'TestClone',
        status: 'Detached',
        vhdxPath: null,
        storagePath: 'D:\\Clones\\test-clone-1',
        goldenImageId: 'golden-1',
      });

      // Parent image doesn't exist - this is an ERROR
      mockProvider.getGoldenImage.mockResolvedValue(null);

      // Execute repair plan
      const plan = await validationService.repairClone('test-clone-1', true);

      // Verify: Repair is blocked due to missing parent
      expect(plan.plannedActions).toContain('ERROR: Cannot repair - parent image is missing');
    });

    it('should validate clone with NO_VHDX_PATH warning but still consider it healthy', async () => {
      // Note: NO_VHDX_PATH is a WARNING, not an ERROR, so clone is still "healthy"
      mockProvider.getClone.mockResolvedValue({
        id: 'test-clone-1',
        cloneName: 'TestClone',
        status: 'Detached',
        vhdxPath: null, // Missing - triggers NO_VHDX_PATH warning
        storagePath: 'D:\\Clones\\test-clone-1',
        goldenImageId: 'golden-1',
      });

      mockProvider.getGoldenImage.mockResolvedValue({
        id: 'golden-1',
        name: 'GoldenImage1',
      });

      // Validate
      const validation = await validationService.validateClone('test-clone-1');

      // Verify: NO_VHDX_PATH warning is detected
      expect(validation.findings).toContainEqual(
        expect.objectContaining({
          code: 'NO_VHDX_PATH',
          severity: 'Warning',
        })
      );

      // But clone is still healthy (warnings don't block)
      expect(validation.isHealthy).toBe(true);

      // Repair plan says "no repair needed" because it's healthy
      const plan = await validationService.repairClone('test-clone-1', true);
      expect(plan.plannedActions).toContain('Clone is healthy, no repair needed');
    });

    it('should not include ATTACHED_BUT_NO_MOUNT in repair plan', async () => {
      mockProvider.getClone.mockResolvedValue({
        id: 'test-clone-1',
        status: 'Attached',
        databaseName: 'TestDB',
        vhdxPath: 'D:\\Clones\\test-clone-1\\test-clone-1.vhdx',
        mountPath: null, // No mount path
        goldenImageId: 'golden-1',
      });

      mockProvider.getGoldenImage.mockResolvedValue({
        id: 'golden-1',
        name: 'GoldenImage1',
      });

      // Execute repair plan
      const plan = await validationService.repairClone('test-clone-1', true);

      // Verify: No mount remount action (since it's not validated)
      const remountAction = plan.plannedActions.find((a) => a.includes('mount'));
      expect(remountAction).toBeUndefined();
    });

    it('should report healthy clone with no repair needed', async () => {
      mockProvider.getClone.mockResolvedValue({
        id: 'test-clone-1',
        status: 'Attached',
        databaseName: 'TestDB',
        vhdxPath: 'D:\\Clones\\test-clone-1\\test-clone-1.vhdx',
        goldenImageId: 'golden-1',
      });

      mockProvider.getGoldenImage.mockResolvedValue({
        id: 'golden-1',
        name: 'GoldenImage1',
      });

      // Execute repair plan
      const plan = await validationService.repairClone('test-clone-1', true);

      // Verify: Healthy clone report
      expect(plan.plannedActions).toContain('Clone is healthy, no repair needed');
    });
  });

  describe('Finding Clones Needing Recovery', () => {
    it('should scan for clones with missing VHDX paths', async () => {
      // This would be implemented with actual database query
      const affectedClones = await validationService.findClonesNeedingVhdxRecovery();

      // Verify: Returns array (may be empty in test)
      expect(Array.isArray(affectedClones)).toBe(true);
    });
  });

  describe('Health Metrics', () => {
    it('should calculate health metrics', async () => {
      const metrics = await validationService.getHealthMetrics();

      expect(metrics).toHaveProperty('totalClones');
      expect(metrics).toHaveProperty('healthyClones');
      expect(metrics).toHaveProperty('unhealthyClones');
      expect(metrics).toHaveProperty('neededRepairs');
    });
  });
});
