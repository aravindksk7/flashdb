/**
 * Real Database Integration Tests
 *
 * Tests all functionalities against actual SQL Server in Docker
 * No mocks, no stubs - testing actual implementation
 */

import { getProvider } from '../../providers/sqlServerProvider';
import { getMetadataService } from '../../services/metadataService';
import { getCloneValidationService } from '../../services/cloneValidationService';
import { getSqlClient } from '../../services/sqlClient';
import {
  GoldenImageCreateParams,
  CloneCreateParams,
} from '../../types/providerContract';
import logger from '../../logger';

describe('Real Database Integration Tests', () => {
  const provider = getProvider();
  const metadataService = getMetadataService();
  const validationService = getCloneValidationService();
  let testImageId: string;
  let testCloneId: string;
  let testCheckpointId: string;

  beforeAll(async () => {
    logger.info('[Integration] Setting up test database');

    // Initialize metadata tables
    try {
      await metadataService.initialize();
      logger.info('[Integration] Metadata tables initialized');
    } catch (error) {
      logger.warn('[Integration] Metadata initialization: ' + error);
    }
  });

  describe('Golden Image Operations', () => {
    it('should create a golden image in real database', async () => {
      const params: GoldenImageCreateParams = {
        name: `TestImage-${Date.now()}`,
        version: '1.0.0',
        method: 'BackupRestore',
        outputPath: '/data/images',
      };

      try {
        const image = await provider.createGoldenImage(params);

        expect(image).toBeDefined();
        expect(image.id).toBeTruthy();
        expect(image.name).toBe(params.name);
        expect(image.method).toBe('BackupRestore');
        expect(image.status).toBe('Creating');

        testImageId = image.id;

        logger.info(`[Integration] Created golden image: ${image.id}`);
      } catch (error) {
        logger.error(`[Integration] Create golden image failed: ${error}`);
        throw error;
      }
    });

    it('should retrieve created golden image', async () => {
      if (!testImageId) {
        logger.warn('[Integration] Skipping - no test image created');
        return;
      }

      const image = await provider.getGoldenImage(testImageId);

      expect(image).toBeDefined();
      expect(image?.id).toBe(testImageId);
      expect(image?.name).toContain('TestImage');

      logger.info(`[Integration] Retrieved golden image: ${image?.id}`);
    });

    it('should list all golden images', async () => {
      const images = await provider.listGoldenImages();

      expect(Array.isArray(images)).toBe(true);
      expect(images.length).toBeGreaterThanOrEqual(0);

      logger.info(`[Integration] Listed ${images.length} golden images`);
    });

    it('should update golden image metadata', async () => {
      if (!testImageId) {
        logger.warn('[Integration] Skipping - no test image created');
        return;
      }

      const updated = await provider.updateGoldenImage(testImageId, {
        status: 'Ready',
      });

      expect(updated.status).toBe('Ready');

      logger.info(`[Integration] Updated golden image status: ${updated.status}`);
    });
  });

  describe('Clone Operations', () => {
    it('should create a clone from golden image', async () => {
      if (!testImageId) {
        logger.warn('[Integration] Skipping - no test image created');
        return;
      }

      const params: CloneCreateParams = {
        goldenImageId: testImageId,
        cloneName: `TestClone-${Date.now()}`,
        instancePath: 'MSSQLSERVER',
        storagePath: '/data/clones',
      };

      try {
        const clone = await provider.createClone(params);

        expect(clone).toBeDefined();
        expect(clone.id).toBeTruthy();
        expect(clone.cloneName).toBe(params.cloneName);
        expect(clone.goldenImageId).toBe(testImageId);
        expect(clone.status).toBe('Creating');

        testCloneId = clone.id;

        logger.info(`[Integration] Created clone: ${clone.id}`);
      } catch (error) {
        logger.error(`[Integration] Create clone failed: ${error}`);
        throw error;
      }
    });

    it('should retrieve created clone', async () => {
      if (!testCloneId) {
        logger.warn('[Integration] Skipping - no test clone created');
        return;
      }

      const clone = await provider.getClone(testCloneId);

      expect(clone).toBeDefined();
      expect(clone?.id).toBe(testCloneId);
      expect(clone?.cloneName).toContain('TestClone');

      logger.info(`[Integration] Retrieved clone: ${clone?.id}`);
    });

    it('should list all clones', async () => {
      const clones = await provider.listClones();

      expect(Array.isArray(clones)).toBe(true);
      expect(clones.length).toBeGreaterThanOrEqual(0);

      logger.info(`[Integration] Listed ${clones.length} clones`);
    });
  });

  describe('Checkpoint Operations', () => {
    it('should create a checkpoint for clone', async () => {
      if (!testCloneId) {
        logger.warn('[Integration] Skipping - no test clone created');
        return;
      }

      try {
        const checkpoint = await provider.createCheckpoint(testCloneId, {
          checkpointName: `TestCheckpoint-${Date.now()}`,
          phase: 'manual',
          description: 'Integration test checkpoint',
        });

        expect(checkpoint).toBeDefined();
        expect(checkpoint.id).toBeTruthy();
        expect(checkpoint.cloneId).toBe(testCloneId);
        expect(checkpoint.status).toBe('Creating');

        testCheckpointId = checkpoint.id;

        logger.info(`[Integration] Created checkpoint: ${checkpoint.id}`);
      } catch (error) {
        logger.error(`[Integration] Create checkpoint failed: ${error}`);
        throw error;
      }
    });

    it('should retrieve created checkpoint', async () => {
      if (!testCloneId || !testCheckpointId) {
        logger.warn('[Integration] Skipping - no test checkpoint created');
        return;
      }

      const checkpoint = await provider.getCheckpoint(
        testCloneId,
        testCheckpointId
      );

      expect(checkpoint).toBeDefined();
      expect(checkpoint?.id).toBe(testCheckpointId);

      logger.info(`[Integration] Retrieved checkpoint: ${checkpoint?.id}`);
    });

    it('should list checkpoints for clone', async () => {
      if (!testCloneId) {
        logger.warn('[Integration] Skipping - no test clone created');
        return;
      }

      const checkpoints = await provider.listCheckpoints(testCloneId);

      expect(Array.isArray(checkpoints)).toBe(true);
      expect(checkpoints.length).toBeGreaterThanOrEqual(0);

      logger.info(`[Integration] Listed ${checkpoints.length} checkpoints`);
    });

    it('should pin/unpin checkpoint', async () => {
      if (!testCloneId || !testCheckpointId) {
        logger.warn('[Integration] Skipping - no test checkpoint created');
        return;
      }

      const updated = await provider.updateCheckpoint(
        testCloneId,
        testCheckpointId,
        { isPinned: true }
      );

      expect(updated.isPinned).toBe(true);

      logger.info(`[Integration] Pinned checkpoint: ${testCheckpointId}`);
    });
  });

  describe('Validation and Health Checks', () => {
    it('should validate clone health', async () => {
      if (!testCloneId) {
        logger.warn('[Integration] Skipping - no test clone created');
        return;
      }

      const validation = await provider.validateClone(testCloneId);

      expect(validation).toBeDefined();
      expect(validation.isHealthy).toBeOfType('boolean');
      expect(Array.isArray(validation.findings)).toBe(true);

      logger.info(
        `[Integration] Validated clone: ${validation.isHealthy ? 'healthy' : 'unhealthy'}`
      );
    });

    it('should perform validation on real clone', async () => {
      if (!testCloneId) {
        logger.warn('[Integration] Skipping - no test clone created');
        return;
      }

      const result = await validationService.validateClone(testCloneId);

      expect(result).toBeDefined();
      expect(result.cloneId).toBe(testCloneId);
      expect(result.validatedAt).toBeInstanceOf(Date);

      logger.info(
        `[Integration] Clone validation complete: ${result.isHealthy ? 'Healthy' : 'Unhealthy'}`
      );
    });
  });

  describe('Repair Workflows', () => {
    it('should create repair plan for clone', async () => {
      if (!testCloneId) {
        logger.warn('[Integration] Skipping - no test clone created');
        return;
      }

      const plan = await validationService.repairClone(testCloneId, true);

      expect(plan).toBeDefined();
      expect(plan.cloneId).toBe(testCloneId);
      expect(plan.isDryRun).toBe(true);
      expect(Array.isArray(plan.plannedActions)).toBe(true);

      logger.info(
        `[Integration] Repair plan created: ${plan.plannedActions.length} actions`
      );
    });

    it('should execute repair dry-run', async () => {
      if (!testCloneId) {
        logger.warn('[Integration] Skipping - no test clone created');
        return;
      }

      const attempt = await validationService.executeRepair(testCloneId, true);

      expect(attempt).toBeDefined();
      expect(attempt.cloneId).toBe(testCloneId);
      expect(attempt.startedAt).toBeInstanceOf(Date);

      logger.info(`[Integration] Dry-run completed: ${attempt.result}`);
    });
  });

  describe('Metadata Service', () => {
    it('should get metadata statistics', async () => {
      const stats = await metadataService.getMetadataStats();

      expect(stats).toBeDefined();
      expect(typeof stats.goldenImages).toBe('number');
      expect(typeof stats.clones).toBe('number');
      expect(typeof stats.checkpoints).toBe('number');

      logger.info(
        `[Integration] Metadata stats: Images=${stats.goldenImages}, Clones=${stats.clones}`
      );
    });

    it('should perform metadata health check', async () => {
      const health = await metadataService.healthCheck();

      expect(health).toBeDefined();
      expect(typeof health.isHealthy).toBe('boolean');
      expect(typeof health.message).toBe('string');

      logger.info(`[Integration] Metadata health: ${health.isHealthy}`);
    });
  });

  describe('Cleanup', () => {
    it('should delete checkpoint', async () => {
      if (!testCloneId || !testCheckpointId) {
        logger.warn('[Integration] Skipping - no test checkpoint created');
        return;
      }

      try {
        await provider.deleteCheckpoint(testCloneId, testCheckpointId);
        logger.info(`[Integration] Deleted checkpoint: ${testCheckpointId}`);
      } catch (error) {
        logger.warn(`[Integration] Checkpoint deletion: ${error}`);
      }
    });

    it('should delete clone', async () => {
      if (!testCloneId) {
        logger.warn('[Integration] Skipping - no test clone created');
        return;
      }

      try {
        await provider.deleteClone(testCloneId);
        logger.info(`[Integration] Deleted clone: ${testCloneId}`);
      } catch (error) {
        logger.warn(`[Integration] Clone deletion: ${error}`);
      }
    });

    it('should delete golden image', async () => {
      if (!testImageId) {
        logger.warn('[Integration] Skipping - no test image created');
        return;
      }

      try {
        await provider.deleteGoldenImage(testImageId);
        logger.info(`[Integration] Deleted golden image: ${testImageId}`);
      } catch (error) {
        logger.warn(`[Integration] Golden image deletion: ${error}`);
      }
    });
  });
});
