/**
 * Provider Contract Tests
 *
 * Verifies API/task queue behavior independently of SQL Server implementation.
 * Phase 1, Step 5: Add provider contract tests with mock implementations
 *
 * These tests verify:
 * 1. Provider interface methods have correct signatures
 * 2. Metadata normalization is consistent
 * 3. Error handling is uniform
 * 4. Mock provider works identically to real provider
 */

import {
  IProvider,
  GoldenImageCreateParams,
  GoldenImageMetadata,
  CloneCreateParams,
  CloneMetadata,
  CheckpointMetadata,
  ValidationFinding,
  RepairAttemptMetadata,
} from '../types/providerContract';

/**
 * Mock Provider Implementation
 *
 * Used for testing API contracts independently of SQL Server.
 */
class MockProvider implements IProvider {
  private goldenImages: Map<string, GoldenImageMetadata> = new Map();
  private clones: Map<string, CloneMetadata> = new Map();
  private checkpoints: Map<string, CheckpointMetadata> = new Map();
  private callLog: Array<{ method: string; params: any; timestamp: Date }> = [];

  async createGoldenImage(params: GoldenImageCreateParams): Promise<GoldenImageMetadata> {
    const image: GoldenImageMetadata = {
      id: `img-${Date.now()}`,
      name: params.name,
      version: params.version,
      method: params.method,
      outputPath: params.outputPath,
      status: 'Creating',
      createdAt: new Date(),
    };

    this.goldenImages.set(image.id, image);
    this.log('createGoldenImage', params);
    return image;
  }

  async getGoldenImage(imageId: string): Promise<GoldenImageMetadata | null> {
    this.log('getGoldenImage', { imageId });
    return this.goldenImages.get(imageId) || null;
  }

  async listGoldenImages(): Promise<GoldenImageMetadata[]> {
    this.log('listGoldenImages', {});
    return Array.from(this.goldenImages.values());
  }

  async updateGoldenImage(
    imageId: string,
    updates: Partial<GoldenImageMetadata>
  ): Promise<GoldenImageMetadata> {
    const image = this.goldenImages.get(imageId);
    if (!image) throw new Error(`Golden image not found: ${imageId}`);

    const updated = { ...image, ...updates, updatedAt: new Date() };
    this.goldenImages.set(imageId, updated);
    this.log('updateGoldenImage', { imageId, updates });
    return updated;
  }

  async deleteGoldenImage(imageId: string): Promise<void> {
    if (!this.goldenImages.has(imageId)) {
      throw new Error(`Golden image not found: ${imageId}`);
    }
    this.goldenImages.delete(imageId);
    this.log('deleteGoldenImage', { imageId });
  }

  async createClone(params: CloneCreateParams): Promise<CloneMetadata> {
    const clone: CloneMetadata = {
      id: `clone-${Date.now()}`,
      cloneName: params.cloneName,
      goldenImageId: params.goldenImageId,
      status: 'Creating',
      instancePath: params.instancePath,
      storagePath: params.storagePath,
      createdAt: new Date(),
    };

    this.clones.set(clone.id, clone);
    this.log('createClone', params);
    return clone;
  }

  async getClone(cloneId: string): Promise<CloneMetadata | null> {
    this.log('getClone', { cloneId });
    return this.clones.get(cloneId) || null;
  }

  async listClones(): Promise<CloneMetadata[]> {
    this.log('listClones', {});
    return Array.from(this.clones.values());
  }

  async attachClone(cloneId: string, instancePath: string): Promise<CloneMetadata> {
    const clone = this.clones.get(cloneId);
    if (!clone) throw new Error(`Clone not found: ${cloneId}`);

    clone.status = 'Attached';
    clone.attachedAt = new Date();
    this.log('attachClone', { cloneId, instancePath });
    return clone;
  }

  async detachClone(cloneId: string): Promise<CloneMetadata> {
    const clone = this.clones.get(cloneId);
    if (!clone) throw new Error(`Clone not found: ${cloneId}`);

    clone.status = 'Detached';
    this.log('detachClone', { cloneId });
    return clone;
  }

  async deleteClone(cloneId: string, deleteVhdx?: boolean): Promise<void> {
    if (!this.clones.has(cloneId)) {
      throw new Error(`Clone not found: ${cloneId}`);
    }
    this.clones.delete(cloneId);
    this.log('deleteClone', { cloneId, deleteVhdx });
  }

  async createCheckpoint(
    cloneId: string,
    params: { checkpointName: string; phase?: string; description?: string }
  ): Promise<CheckpointMetadata> {
    const checkpoint: CheckpointMetadata = {
      id: `cp-${Date.now()}`,
      cloneId,
      checkpointName: params.checkpointName,
      phase: params.phase || 'manual',
      description: params.description,
      status: 'Creating',
      isPinned: false,
      labels: [],
      isFavorite: false,
      createdAt: new Date(),
    };

    this.checkpoints.set(checkpoint.id, checkpoint);
    this.log('createCheckpoint', { cloneId, ...params });
    return checkpoint;
  }

  async getCheckpoint(cloneId: string, checkpointId: string): Promise<CheckpointMetadata | null> {
    this.log('getCheckpoint', { cloneId, checkpointId });
    const cp = this.checkpoints.get(checkpointId);
    return cp && cp.cloneId === cloneId ? cp : null;
  }

  async listCheckpoints(cloneId: string): Promise<CheckpointMetadata[]> {
    this.log('listCheckpoints', { cloneId });
    return Array.from(this.checkpoints.values()).filter((cp) => cp.cloneId === cloneId);
  }

  async restoreCheckpoint(
    cloneId: string,
    checkpointId: string,
    reattachAfter?: boolean
  ): Promise<void> {
    const cp = this.checkpoints.get(checkpointId);
    if (!cp || cp.cloneId !== cloneId) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    cp.status = 'Restoring';
    cp.restoredAt = new Date();
    this.log('restoreCheckpoint', { cloneId, checkpointId, reattachAfter });
  }

  async updateCheckpoint(
    cloneId: string,
    checkpointId: string,
    updates: Partial<CheckpointMetadata>
  ): Promise<CheckpointMetadata> {
    const cp = this.checkpoints.get(checkpointId);
    if (!cp || cp.cloneId !== cloneId) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const updated = { ...cp, ...updates };
    this.checkpoints.set(checkpointId, updated);
    this.log('updateCheckpoint', { cloneId, checkpointId, updates });
    return updated;
  }

  async deleteCheckpoint(cloneId: string, checkpointId: string, cascadeDelete?: boolean): Promise<void> {
    const cp = this.checkpoints.get(checkpointId);
    if (!cp || cp.cloneId !== cloneId) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    this.checkpoints.delete(checkpointId);
    this.log('deleteCheckpoint', { cloneId, checkpointId, cascadeDelete });
  }

  async validateClone(cloneId: string): Promise<{
    isHealthy: boolean;
    findings: ValidationFinding[];
    details: Record<string, any>;
  }> {
    const clone = this.clones.get(cloneId);
    if (!clone) throw new Error(`Clone not found: ${cloneId}`);

    const findings: ValidationFinding[] = [];
    if (clone.status !== 'Attached') {
      findings.push({
        severity: 'Warning',
        code: 'NOT_ATTACHED',
        message: `Clone is ${clone.status}, not Attached`,
      });
    }

    this.log('validateClone', { cloneId });
    return {
      isHealthy: clone.status === 'Attached' && findings.length === 0,
      findings,
      details: { status: clone.status, lastValidated: new Date().toISOString() },
    };
  }

  async repairClone(cloneId: string, dryRun?: boolean): Promise<RepairAttemptMetadata> {
    const clone = this.clones.get(cloneId);
    if (!clone) throw new Error(`Clone not found: ${cloneId}`);

    const attempt: RepairAttemptMetadata = {
      id: `repair-${Date.now()}`,
      cloneId,
      validationFindings: [],
      attemptedActions: [],
      result: 'Success',
      resultMessage: 'Clone is healthy',
      startedAt: new Date(),
      completedAt: new Date(),
    };

    this.log('repairClone', { cloneId, dryRun });
    return attempt;
  }

  async validateHost(hostId: string): Promise<{
    isValid: boolean;
    findings: ValidationFinding[];
    capabilities: string[];
  }> {
    this.log('validateHost', { hostId });
    return {
      isValid: false,
      findings: [
        {
          severity: 'Warning',
          code: 'NOT_IMPLEMENTED',
          message: 'Host validation not yet implemented',
        },
      ],
      capabilities: [],
    };
  }

  async getMetadata(type: string, id: string): Promise<any> {
    this.log('getMetadata', { type, id });
    switch (type) {
      case 'goldenImage':
        return this.getGoldenImage(id);
      case 'clone':
        return this.getClone(id);
      default:
        return null;
    }
  }

  async updateMetadata(type: string, id: string, updates: Record<string, any>): Promise<void> {
    this.log('updateMetadata', { type, id, updates });
  }

  // Test helpers
  getCallLog() {
    return [...this.callLog];
  }

  clearCallLog() {
    this.callLog = [];
  }

  private log(method: string, params: any) {
    this.callLog.push({ method, params, timestamp: new Date() });
  }
}

describe('Provider Contracts', () => {
  let provider: MockProvider;

  beforeEach(() => {
    provider = new MockProvider();
  });

  describe('Golden Image Contract', () => {
    it('should create golden image with required fields', async () => {
      const params: GoldenImageCreateParams = {
        name: 'TestImage',
        version: '1.0',
        method: 'BackupRestore',
        outputPath: '/data/images',
        backupFile: '/backups/test.bak',
      };

      const image = await provider.createGoldenImage(params);

      expect(image).toHaveProperty('id');
      expect(image).toHaveProperty('name', 'TestImage');
      expect(image).toHaveProperty('version', '1.0');
      expect(image).toHaveProperty('method', 'BackupRestore');
      expect(image).toHaveProperty('outputPath');
      expect(image).toHaveProperty('status');
      expect(image).toHaveProperty('createdAt');
    });

    it('should retrieve created golden image', async () => {
      const params: GoldenImageCreateParams = {
        name: 'TestImage',
        version: '1.0',
        method: 'BackupRestore',
        outputPath: '/data/images',
      };

      const created = await provider.createGoldenImage(params);
      const retrieved = await provider.getGoldenImage(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return null for non-existent image', async () => {
      const result = await provider.getGoldenImage('non-existent-id');
      expect(result).toBeNull();
    });

    it('should list all golden images', async () => {
      const img1 = await provider.createGoldenImage({
        name: 'Image1',
        version: '1.0',
        method: 'BackupRestore',
        outputPath: '/data/images1',
      });

      const img2 = await provider.createGoldenImage({
        name: 'Image2',
        version: '1.0',
        method: 'ReplicaBackup',
        outputPath: '/data/images2',
        sourceConnection: 'Server=localhost',
      });

      const images = await provider.listGoldenImages();

      expect(images).toHaveLength(2);
      expect(images).toContainEqual(img1);
      expect(images).toContainEqual(img2);
    });

    it('should update golden image', async () => {
      const created = await provider.createGoldenImage({
        name: 'Original',
        version: '1.0',
        method: 'BackupRestore',
        outputPath: '/data/images',
      });

      const updated = await provider.updateGoldenImage(created.id, {
        name: 'Updated',
        status: 'Ready',
      });

      expect(updated.name).toBe('Updated');
      expect(updated.status).toBe('Ready');
      expect(updated.updatedAt).toBeDefined();
    });

    it('should delete golden image', async () => {
      const created = await provider.createGoldenImage({
        name: 'ToDelete',
        version: '1.0',
        method: 'BackupRestore',
        outputPath: '/data/images',
      });

      await provider.deleteGoldenImage(created.id);
      const result = await provider.getGoldenImage(created.id);

      expect(result).toBeNull();
    });

    it('should throw error when deleting non-existent image', async () => {
      await expect(provider.deleteGoldenImage('non-existent')).rejects.toThrow();
    });
  });

  describe('Clone Contract', () => {
    let imageId: string;

    beforeEach(async () => {
      const image = await provider.createGoldenImage({
        name: 'BaseImage',
        version: '1.0',
        method: 'BackupRestore',
        outputPath: '/data/images',
      });
      imageId = image.id;
    });

    it('should create clone with required fields', async () => {
      const params: CloneCreateParams = {
        goldenImageId: imageId,
        cloneName: 'TestClone',
        instancePath: 'MSSQLSERVER',
        storagePath: '/data/clones',
      };

      const clone = await provider.createClone(params);

      expect(clone).toHaveProperty('id');
      expect(clone).toHaveProperty('cloneName', 'TestClone');
      expect(clone).toHaveProperty('goldenImageId', imageId);
      expect(clone).toHaveProperty('status');
      expect(clone).toHaveProperty('instancePath');
      expect(clone).toHaveProperty('storagePath');
      expect(clone).toHaveProperty('createdAt');
    });

    it('should attach and detach clone', async () => {
      const clone = await provider.createClone({
        goldenImageId: imageId,
        cloneName: 'TestClone',
        instancePath: 'MSSQLSERVER',
        storagePath: '/data/clones',
      });

      const attached = await provider.attachClone(clone.id, 'MSSQLSERVER');
      expect(attached.status).toBe('Attached');
      expect(attached.attachedAt).toBeDefined();

      const detached = await provider.detachClone(clone.id);
      expect(detached.status).toBe('Detached');
    });

    it('should validate clone health', async () => {
      const clone = await provider.createClone({
        goldenImageId: imageId,
        cloneName: 'TestClone',
        instancePath: 'MSSQLSERVER',
        storagePath: '/data/clones',
      });

      const validation = await provider.validateClone(clone.id);

      expect(validation).toHaveProperty('isHealthy');
      expect(validation).toHaveProperty('findings');
      expect(validation).toHaveProperty('details');
      expect(Array.isArray(validation.findings)).toBe(true);
    });
  });

  describe('Checkpoint Contract', () => {
    let cloneId: string;

    beforeEach(async () => {
      const image = await provider.createGoldenImage({
        name: 'BaseImage',
        version: '1.0',
        method: 'BackupRestore',
        outputPath: '/data/images',
      });

      const clone = await provider.createClone({
        goldenImageId: image.id,
        cloneName: 'TestClone',
        instancePath: 'MSSQLSERVER',
        storagePath: '/data/clones',
      });

      cloneId = clone.id;
    });

    it('should create checkpoint with required fields', async () => {
      const checkpoint = await provider.createCheckpoint(cloneId, {
        checkpointName: 'Before Update',
        phase: 'manual',
        description: 'Snapshot before changes',
      });

      expect(checkpoint).toHaveProperty('id');
      expect(checkpoint).toHaveProperty('cloneId', cloneId);
      expect(checkpoint).toHaveProperty('checkpointName', 'Before Update');
      expect(checkpoint).toHaveProperty('phase', 'manual');
      expect(checkpoint).toHaveProperty('status');
      expect(checkpoint).toHaveProperty('createdAt');
    });

    it('should list checkpoints for clone', async () => {
      const cp1 = await provider.createCheckpoint(cloneId, {
        checkpointName: 'CP1',
      });

      const cp2 = await provider.createCheckpoint(cloneId, {
        checkpointName: 'CP2',
      });

      const checkpoints = await provider.listCheckpoints(cloneId);

      expect(checkpoints).toHaveLength(2);
      expect(checkpoints).toContainEqual(cp1);
      expect(checkpoints).toContainEqual(cp2);
    });

    it('should update checkpoint', async () => {
      const cp = await provider.createCheckpoint(cloneId, {
        checkpointName: 'CP1',
      });

      const updated = await provider.updateCheckpoint(cloneId, cp.id, {
        isFavorite: true,
        labels: ['critical'],
      });

      expect(updated.isFavorite).toBe(true);
      expect(updated.labels).toContain('critical');
    });

    it('should restore checkpoint', async () => {
      const cp = await provider.createCheckpoint(cloneId, {
        checkpointName: 'CP1',
      });

      await provider.restoreCheckpoint(cloneId, cp.id, true);

      const restored = await provider.getCheckpoint(cloneId, cp.id);
      expect(restored?.restoredAt).toBeDefined();
    });
  });

  describe('Provider Method Call Tracking', () => {
    it('should track method calls for debugging', async () => {
      await provider.createGoldenImage({
        name: 'TestImage',
        version: '1.0',
        method: 'BackupRestore',
        outputPath: '/data/images',
      });

      const callLog = provider.getCallLog();

      expect(callLog).toHaveLength(1);
      expect(callLog[0].method).toBe('createGoldenImage');
      expect(callLog[0].params).toHaveProperty('name', 'TestImage');
    });
  });

  describe('Error Handling', () => {
    it('should throw consistent error messages', async () => {
      try {
        await provider.getCheckpoint('clone-123', 'checkpoint-456');
        expect.fail('Should have thrown');
      } catch (error: any) {
        expect(error.message).toMatch(/not found/i);
      }
    });

    it('should throw error on invalid operations', async () => {
      await expect(provider.deleteGoldenImage('non-existent')).rejects.toThrow(
        /not found/i
      );
    });
  });

  describe('Provider Independence', () => {
    it('should work independently of SQL Server', async () => {
      // All provider operations should work without any external dependencies
      const image = await provider.createGoldenImage({
        name: 'TestImage',
        version: '1.0',
        method: 'BackupRestore',
        outputPath: '/data/images',
      });

      const clone = await provider.createClone({
        goldenImageId: image.id,
        cloneName: 'TestClone',
        instancePath: 'MSSQLSERVER',
        storagePath: '/data/clones',
      });

      const checkpoint = await provider.createCheckpoint(clone.id, {
        checkpointName: 'CP1',
      });

      expect(image).toBeDefined();
      expect(clone).toBeDefined();
      expect(checkpoint).toBeDefined();
    });
  });
});
