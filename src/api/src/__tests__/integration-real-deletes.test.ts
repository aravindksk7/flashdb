/**
 * Real Database Integration Tests - DELETE Operations
 *
 * Tests delete operations against actual SQL Server in Docker
 * Verifies cascading deletes persist to database
 */

import { SqlClient } from '../services/sqlClient';
import { getMetadataService } from '../services/metadataService';
import { getProvider } from '../providers/sqlServerProvider';

describe('Real Database DELETE Operations', () => {
  let sqlClient: SqlClient;
  let metadataService: any;
  let provider: any;

  beforeAll(async () => {
    // Set environment variables for Docker SQL Server
    process.env.SQL_SERVER_HOST = 'localhost';
    process.env.SQL_SERVER_PORT = '1434';
    process.env.SQL_SERVER_USER = 'SA';
    process.env.SQL_SERVER_PASSWORD = 'FlashDB@Password123';
    process.env.SQL_DATABASE = 'FlashDB';

    try {
      // Initialize SQL client
      sqlClient = new SqlClient();
      await sqlClient.initialize();
      console.log('[Integration] SQL Client initialized: localhost:1434');

      // Get singleton instances
      metadataService = getMetadataService();
      provider = getProvider();

      console.log('[Integration] MetadataService and Provider ready');
    } catch (error) {
      console.error('[Integration] Failed to initialize:', error);
      throw error;
    }
  });

  describe('Delete Operations with Cascade', () => {
    let testImageId: string;
    let testCloneId: string;
    let testCheckpointId: string;

    it('should create test data (golden image, clone, checkpoint)', async () => {
      // Create golden image
      const image = await provider.createGoldenImage({
        name: `DeleteTest-Image-${Date.now()}`,
        version: '1.0.0',
        method: 'BackupRestore',
        outputPath: '/test/images',
      });

      expect(image).toBeDefined();
      expect(image.id).toBeTruthy();
      testImageId = image.id;

      console.log(`[Integration] Created golden image: ${testImageId}`);

      // Create clone
      const clone = await provider.createClone({
        goldenImageId: testImageId,
        cloneName: `DeleteTest-Clone-${Date.now()}`,
        instancePath: 'MSSQLSERVER',
        storagePath: '/test/clones',
      });

      expect(clone).toBeDefined();
      expect(clone.id).toBeTruthy();
      testCloneId = clone.id;

      console.log(`[Integration] Created clone: ${testCloneId}`);

      // Create checkpoint
      const checkpoint = await provider.createCheckpoint(testCloneId, {
        checkpointName: `DeleteTest-CP-${Date.now()}`,
        phase: 'manual',
        description: 'Test checkpoint for delete verification',
      });

      expect(checkpoint).toBeDefined();
      expect(checkpoint.id).toBeTruthy();
      testCheckpointId = checkpoint.id;

      console.log(`[Integration] Created checkpoint: ${testCheckpointId}`);
    });

    it('should verify test data exists in database before delete', async () => {
      const image = await provider.getGoldenImage(testImageId);
      expect(image).toBeDefined();
      expect(image?.id).toBe(testImageId);

      const clone = await provider.getClone(testCloneId);
      expect(clone).toBeDefined();
      expect(clone?.id).toBe(testCloneId);

      const checkpoint = await provider.getCheckpoint(testCloneId, testCheckpointId);
      expect(checkpoint).toBeDefined();
      expect(checkpoint?.id).toBe(testCheckpointId);

      console.log(
        '[Integration] All test data verified in database before delete'
      );
    });

    it('should delete checkpoint directly', async () => {
      // First unpin if pinned
      const checkpoint = await provider.getCheckpoint(testCloneId, testCheckpointId);
      if (checkpoint?.isPinned) {
        await provider.updateCheckpoint(testCloneId, testCheckpointId, {
          isPinned: false,
        });
      }

      // Delete checkpoint
      await metadataService.deleteCheckpoint(testCloneId, testCheckpointId);

      // Verify deletion
      const deleted = await provider.getCheckpoint(testCloneId, testCheckpointId);
      expect(deleted).toBeNull();

      console.log('[Integration] Checkpoint deleted and verified');
    });

    it('should delete clone with cascade to checkpoints', async () => {
      // Create another checkpoint for this test
      const checkpoint = await provider.createCheckpoint(testCloneId, {
        checkpointName: `CascadeTest-CP-${Date.now()}`,
        phase: 'manual',
      });

      expect(checkpoint).toBeDefined();

      // Delete clone (should cascade to checkpoints)
      await metadataService.deleteClone(testCloneId);

      // Verify clone deleted
      const deletedClone = await provider.getClone(testCloneId);
      expect(deletedClone).toBeNull();

      // Verify checkpoint cascaded
      const deletedCheckpoint = await provider.getCheckpoint(
        testCloneId,
        checkpoint.id
      );
      expect(deletedCheckpoint).toBeNull();

      console.log('[Integration] Clone deleted and checkpoints cascaded');
    });

    it('should delete golden image with cascade to clones and checkpoints', async () => {
      // Create new clone and checkpoint for cascade test
      const clone = await provider.createClone({
        goldenImageId: testImageId,
        cloneName: `CascadeTest-Clone-${Date.now()}`,
        instancePath: 'MSSQLSERVER',
        storagePath: '/test/clones',
      });

      const checkpoint = await provider.createCheckpoint(clone.id, {
        checkpointName: `CascadeTest-CP-${Date.now()}`,
        phase: 'manual',
      });

      console.log('[Integration] Created clone and checkpoint for cascade test');

      // Delete golden image (should cascade to clones and checkpoints)
      await metadataService.deleteGoldenImage(testImageId);

      // Verify golden image deleted
      const deletedImage = await provider.getGoldenImage(testImageId);
      expect(deletedImage).toBeNull();

      // Verify clone cascaded
      const deletedClone = await provider.getClone(clone.id);
      expect(deletedClone).toBeNull();

      // Verify checkpoint cascaded
      const deletedCheckpoint = await provider.getCheckpoint(
        clone.id,
        checkpoint.id
      );
      expect(deletedCheckpoint).toBeNull();

      console.log(
        '[Integration] Golden image deleted and all dependents cascaded'
      );
    });

    it('should handle idempotent deletes (safe to retry)', async () => {
      // Deleting non-existent item should not throw
      await expect(
        metadataService.deleteGoldenImage('non-existent-image-id')
      ).resolves.not.toThrow();

      await expect(
        metadataService.deleteClone('non-existent-clone-id')
      ).resolves.not.toThrow();

      console.log('[Integration] Idempotent deletes work correctly');
    });
  });

  describe('Pinned Checkpoint Protection', () => {
    let testImageId: string;
    let testCloneId: string;
    let testCheckpointId: string;

    beforeAll(async () => {
      // Create test data
      const image = await provider.createGoldenImage({
        name: `PinTest-Image-${Date.now()}`,
        version: '1.0.0',
        method: 'BackupRestore',
        outputPath: '/test/images',
      });
      testImageId = image.id;

      const clone = await provider.createClone({
        goldenImageId: testImageId,
        cloneName: `PinTest-Clone-${Date.now()}`,
        instancePath: 'MSSQLSERVER',
        storagePath: '/test/clones',
      });
      testCloneId = clone.id;

      const checkpoint = await provider.createCheckpoint(testCloneId, {
        checkpointName: `PinTest-CP-${Date.now()}`,
        phase: 'manual',
      });
      testCheckpointId = checkpoint.id;
    });

    it('should prevent deletion of pinned checkpoints', async () => {
      // Pin checkpoint
      await provider.updateCheckpoint(testCloneId, testCheckpointId, {
        isPinned: true,
      });

      // Try to delete pinned checkpoint
      await expect(
        metadataService.deleteCheckpoint(testCloneId, testCheckpointId)
      ).rejects.toThrow('Pinned checkpoint cannot be deleted');

      console.log(
        '[Integration] Pinned checkpoint protection works correctly'
      );
    });

    it('should allow deletion after unpin', async () => {
      // Unpin checkpoint
      await provider.updateCheckpoint(testCloneId, testCheckpointId, {
        isPinned: false,
      });

      // Delete should now succeed
      await metadataService.deleteCheckpoint(testCloneId, testCheckpointId);

      const deleted = await provider.getCheckpoint(
        testCloneId,
        testCheckpointId
      );
      expect(deleted).toBeNull();

      console.log('[Integration] Unpinned checkpoint deleted successfully');
    });

    afterAll(async () => {
      // Cleanup
      try {
        await metadataService.deleteGoldenImage(testImageId);
      } catch (error) {
        console.log('[Integration] Cleanup: ', error);
      }
    });
  });
});
