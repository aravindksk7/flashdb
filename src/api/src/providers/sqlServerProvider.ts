/**
 * SQL Server Provider Implementation
 *
 * Concrete implementation of IProvider that wraps PowerShell cmdlets.
 * Phase 1, Step 3: Move provider-specific logic behind the interface
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
import { getPooledPowerShellService } from '../services/pooledPowershellService';
import logger from '../logger';

export class SqlServerProvider implements IProvider {
  private psService = getPooledPowerShellService();

  // ========================================================================
  // Golden Image Operations
  // ========================================================================

  async createGoldenImage(params: GoldenImageCreateParams): Promise<GoldenImageMetadata> {
    try {
      logger.info(`[Provider] Creating golden image: ${params.name}`);

      const psParams: any = {
        Name: params.name,
        Version: params.version,
        Method: params.method,
        OutputPath: params.outputPath,
      };

      if (params.backupFile) psParams.BackupFile = params.backupFile;
      if (params.sourceConnection) psParams.SourceConnection = params.sourceConnection;
      if (params.databaseType) psParams.DatabaseType = params.databaseType;
      if (params.databaseName) psParams.DatabaseName = params.databaseName;
      if (params.sourceDatabase) psParams.SourceDatabase = params.sourceDatabase;
      if (params.driver) psParams.Driver = params.driver;
      if (params.authenticationMode) psParams.AuthenticationMode = params.authenticationMode;
      if (params.selectedTables && params.selectedTables.length > 0) {
        psParams.SelectedTables = params.selectedTables;
      }

      const result = await this.psService.executeCommand('New-FlashdbGoldenImage', psParams);
      return this.normalizeGoldenImageMetadata(result);
    } catch (error) {
      logger.error(`[Provider] Error creating golden image: ${error}`);
      throw error;
    }
  }

  async getGoldenImage(imageId: string): Promise<GoldenImageMetadata | null> {
    try {
      const result = await this.psService.executeCommand('Get-FlashdbGoldenImage', {
        Id: imageId,
      });
      return result ? this.normalizeGoldenImageMetadata(result) : null;
    } catch (error) {
      logger.error(`[Provider] Error getting golden image: ${error}`);
      throw error;
    }
  }

  async listGoldenImages(): Promise<GoldenImageMetadata[]> {
    try {
      const result = await this.psService.executeCommand('Get-FlashdbGoldenImage', {});
      const items = Array.isArray(result) ? result : result ? [result] : [];
      return items.map((item) => this.normalizeGoldenImageMetadata(item));
    } catch (error) {
      logger.error(`[Provider] Error listing golden images: ${error}`);
      throw error;
    }
  }

  async updateGoldenImage(
    imageId: string,
    updates: Partial<GoldenImageMetadata>
  ): Promise<GoldenImageMetadata> {
    try {
      const psParams: any = { GoldenImageId: imageId };
      if (updates.name) psParams.Name = updates.name;
      if (updates.version) psParams.Version = updates.version;
      if (updates.status) psParams.Status = updates.status;

      const result = await this.psService.executeCommand('Update-FlashdbGoldenImage', psParams);
      return this.normalizeGoldenImageMetadata(result);
    } catch (error) {
      logger.error(`[Provider] Error updating golden image: ${error}`);
      throw error;
    }
  }

  async deleteGoldenImage(imageId: string): Promise<void> {
    try {
      await this.psService.executeCommandRaw('Remove-FlashdbGoldenImage', {
        GoldenImageId: imageId,
      });
    } catch (error) {
      logger.error(`[Provider] Error deleting golden image: ${error}`);
      throw error;
    }
  }

  // ========================================================================
  // Clone Operations
  // ========================================================================

  async createClone(params: CloneCreateParams): Promise<CloneMetadata> {
    try {
      logger.info(`[Provider] Creating clone: ${params.cloneName}`);

      const psParams: any = {
        GoldenImageId: params.goldenImageId,
        CloneName: params.cloneName,
        InstancePath: params.instancePath,
        StoragePath: params.storagePath,
      };

      if (params.databaseType) psParams.DatabaseType = params.databaseType;
      if (params.databaseName) psParams.DatabaseName = params.databaseName;
      if (params.compressionEnabled !== undefined) psParams.CompressionEnabled = params.compressionEnabled;

      const result = await this.psService.executeCommand('New-FlashdbClone', psParams);
      return this.normalizeCloneMetadata(result);
    } catch (error) {
      logger.error(`[Provider] Error creating clone: ${error}`);
      throw error;
    }
  }

  async getClone(cloneId: string): Promise<CloneMetadata | null> {
    try {
      const result = await this.psService.executeCommand('Get-FlashdbClone', {
        CloneId: cloneId,
      });
      return result ? this.normalizeCloneMetadata(result) : null;
    } catch (error) {
      logger.error(`[Provider] Error getting clone: ${error}`);
      throw error;
    }
  }

  async listClones(): Promise<CloneMetadata[]> {
    try {
      const result = await this.psService.executeCommand('Get-FlashdbClone', {});
      const items = Array.isArray(result) ? result : result ? [result] : [];
      return items.map((item) => this.normalizeCloneMetadata(item));
    } catch (error) {
      logger.error(`[Provider] Error listing clones: ${error}`);
      throw error;
    }
  }

  async attachClone(cloneId: string, instancePath: string): Promise<CloneMetadata> {
    try {
      logger.info(`[Provider] Attaching clone ${cloneId}`);

      await this.psService.executeCommandRaw('Connect-FlashdbClone', {
        CloneId: cloneId,
        InstancePath: instancePath,
      });

      const clone = await this.getClone(cloneId);
      if (!clone) throw new Error('Clone not found after attach');
      return clone;
    } catch (error) {
      logger.error(`[Provider] Error attaching clone: ${error}`);
      throw error;
    }
  }

  async detachClone(cloneId: string): Promise<CloneMetadata> {
    try {
      logger.info(`[Provider] Detaching clone ${cloneId}`);

      await this.psService.executeCommandRaw('Disconnect-FlashdbClone', {
        CloneId: cloneId,
      });

      const clone = await this.getClone(cloneId);
      if (!clone) throw new Error('Clone not found after detach');
      return clone;
    } catch (error) {
      logger.error(`[Provider] Error detaching clone: ${error}`);
      throw error;
    }
  }

  async deleteClone(cloneId: string, deleteVhdx?: boolean): Promise<void> {
    try {
      logger.info(`[Provider] Deleting clone ${cloneId}`);

      await this.psService.executeCommandRaw('Remove-FlashdbClone', {
        CloneId: cloneId,
        DeleteVhdx: deleteVhdx === true,
      });
    } catch (error) {
      logger.error(`[Provider] Error deleting clone: ${error}`);
      throw error;
    }
  }

  // ========================================================================
  // Checkpoint Operations
  // ========================================================================

  async createCheckpoint(
    cloneId: string,
    params: { checkpointName: string; phase?: string; description?: string }
  ): Promise<CheckpointMetadata> {
    try {
      logger.info(`[Provider] Creating checkpoint ${params.checkpointName} for clone ${cloneId}`);

      const psParams: any = {
        CloneId: cloneId,
        CheckpointName: params.checkpointName,
        Phase: params.phase || 'manual',
      };

      if (params.description) psParams.Description = params.description;

      const result = await this.psService.executeCommand('New-FlashdbCheckpoint', psParams);
      return this.normalizeCheckpointMetadata(result);
    } catch (error) {
      logger.error(`[Provider] Error creating checkpoint: ${error}`);
      throw error;
    }
  }

  async getCheckpoint(cloneId: string, checkpointId: string): Promise<CheckpointMetadata | null> {
    try {
      const result = await this.psService.executeCommand('Get-FlashdbCheckpoint', {
        CloneId: cloneId,
        CheckpointId: checkpointId,
      });
      return result ? this.normalizeCheckpointMetadata(result) : null;
    } catch (error) {
      logger.error(`[Provider] Error getting checkpoint: ${error}`);
      throw error;
    }
  }

  async listCheckpoints(cloneId: string): Promise<CheckpointMetadata[]> {
    try {
      const result = await this.psService.executeCommand('Get-FlashdbCheckpoint', {
        CloneId: cloneId,
      });
      const items = Array.isArray(result) ? result : result ? [result] : [];
      return items.map((item) => this.normalizeCheckpointMetadata(item));
    } catch (error) {
      logger.error(`[Provider] Error listing checkpoints: ${error}`);
      throw error;
    }
  }

  async restoreCheckpoint(
    cloneId: string,
    checkpointId: string,
    reattachAfter?: boolean
  ): Promise<void> {
    try {
      logger.info(`[Provider] Restoring checkpoint ${checkpointId} for clone ${cloneId}`);

      await this.psService.executeCommandRaw('Restore-FlashdbCheckpoint', {
        CloneId: cloneId,
        CheckpointId: checkpointId,
        ReattachAfter: reattachAfter !== false,
        Force: true,
      });
    } catch (error) {
      logger.error(`[Provider] Error restoring checkpoint: ${error}`);
      throw error;
    }
  }

  async updateCheckpoint(
    cloneId: string,
    checkpointId: string,
    updates: Partial<CheckpointMetadata>
  ): Promise<CheckpointMetadata> {
    try {
      const psParams: any = {
        CloneId: cloneId,
        CheckpointId: checkpointId,
      };

      if (updates.isFavorite !== undefined) psParams.IsFavorite = updates.isFavorite;
      if (updates.labels) psParams.Labels = updates.labels;

      await this.psService.executeCommandRaw('Set-FlashdbCheckpoint', psParams);

      const checkpoint = await this.getCheckpoint(cloneId, checkpointId);
      if (!checkpoint) throw new Error('Checkpoint not found after update');
      return checkpoint;
    } catch (error) {
      logger.error(`[Provider] Error updating checkpoint: ${error}`);
      throw error;
    }
  }

  async deleteCheckpoint(cloneId: string, checkpointId: string, cascadeDelete?: boolean): Promise<void> {
    try {
      logger.info(`[Provider] Deleting checkpoint ${checkpointId} for clone ${cloneId}`);

      await this.psService.executeCommandRaw('Remove-FlashdbCheckpoint', {
        CloneId: cloneId,
        CheckpointId: checkpointId,
        CascadeDelete: cascadeDelete === true,
      });
    } catch (error) {
      logger.error(`[Provider] Error deleting checkpoint: ${error}`);
      throw error;
    }
  }

  // ========================================================================
  // Validation Operations
  // ========================================================================

  async validateClone(cloneId: string): Promise<{
    isHealthy: boolean;
    findings: ValidationFinding[];
    details: Record<string, any>;
  }> {
    try {
      logger.info(`[Provider] Validating clone ${cloneId}`);

      const result = await this.psService.executeCommand('Test-FlashdbCloneHealth', {
        CloneId: cloneId,
      });

      return {
        isHealthy: result?.isHealthy || false,
        findings: result?.findings || [],
        details: result?.details || {},
      };
    } catch (error) {
      logger.error(`[Provider] Error validating clone: ${error}`);
      throw error;
    }
  }

  // ========================================================================
  // Repair Operations
  // ========================================================================

  async repairClone(cloneId: string, dryRun?: boolean): Promise<RepairAttemptMetadata> {
    try {
      logger.info(`[Provider] Repairing clone ${cloneId} (dryRun: ${dryRun})`);

      const result = await this.psService.executeCommand('Repair-FlashdbClone', {
        CloneId: cloneId,
        DryRun: dryRun === true,
      });

      return {
        id: result?.id || `repair-${cloneId}-${Date.now()}`,
        cloneId,
        validationFindings: result?.validationFindings || [],
        attemptedActions: result?.attemptedActions || [],
        result: result?.result || 'Failed',
        resultMessage: result?.resultMessage || 'Unknown error',
        startedAt: result?.startedAt ? new Date(result.startedAt) : new Date(),
        completedAt: result?.completedAt ? new Date(result.completedAt) : undefined,
      };
    } catch (error) {
      logger.error(`[Provider] Error repairing clone: ${error}`);
      throw error;
    }
  }

  // ========================================================================
  // Host Operations
  // ========================================================================

  async validateHost(hostId: string): Promise<{
    isValid: boolean;
    findings: ValidationFinding[];
    capabilities: string[];
  }> {
    // Placeholder for future remote host support
    logger.warn(`[Provider] Host validation not yet implemented: ${hostId}`);
    return {
      isValid: false,
      findings: [
        {
          severity: 'Warning',
          code: 'NOT_IMPLEMENTED',
          message: 'Remote host validation is not yet implemented',
        },
      ],
      capabilities: [],
    };
  }

  // ========================================================================
  // Metadata Operations
  // ========================================================================

  async getMetadata(type: 'clone' | 'checkpoint' | 'goldenImage' | 'host', id: string): Promise<any> {
    switch (type) {
      case 'goldenImage':
        return this.getGoldenImage(id);
      case 'clone':
        return this.getClone(id);
      case 'checkpoint': {
        // Checkpoints need cloneId too - for now return null
        logger.warn(`[Provider] Checkpoint metadata needs cloneId: ${id}`);
        return null;
      }
      case 'host':
        logger.warn(`[Provider] Host metadata not yet implemented: ${id}`);
        return null;
      default:
        throw new Error(`Unknown metadata type: ${type}`);
    }
  }

  async updateMetadata(type: string, id: string, updates: Record<string, any>): Promise<void> {
    logger.debug(`[Provider] Updating metadata type=${type} id=${id}`);
    // This will be expanded in Phase 3 with durable metadata
  }

  // ========================================================================
  // Normalization Helpers
  // ========================================================================

  private normalizeGoldenImageMetadata(data: any): GoldenImageMetadata {
    return {
      id: data?.id || data?.Id || '',
      name: data?.name || data?.Name || '',
      version: data?.version || data?.Version || '',
      method: data?.method || data?.Method || 'BackupRestore',
      outputPath: data?.outputPath || data?.OutputPath || '',
      status: data?.status || data?.Status || 'Ready',
      createdAt: data?.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: data?.updatedAt ? new Date(data.updatedAt) : undefined,
      fileSize: data?.fileSize || data?.FileSize,
      rowCount: data?.rowCount || data?.RowCount,
      tableCount: data?.tableCount || data?.TableCount,
      verificationState: data?.verificationState || data?.VerificationState,
    };
  }

  private normalizeCloneMetadata(data: any): CloneMetadata {
    return {
      id: data?.id || data?.Id || '',
      cloneName: data?.cloneName || data?.CloneName || '',
      goldenImageId: data?.goldenImageId || data?.GoldenImageId || '',
      status: data?.status || data?.Status || 'Detached',
      instancePath: data?.instancePath || data?.InstancePath || '',
      storagePath: data?.storagePath || data?.StoragePath || '',
      vhdxPath: data?.vhdxPath || data?.VhdxPath,
      mountPath: data?.mountPath || data?.MountPath,
      sqlInstanceName: data?.sqlInstanceName || data?.SqlInstanceName,
      databaseName: data?.databaseName || data?.DatabaseName,
      host: data?.host || data?.Host,
      createdAt: data?.createdAt ? new Date(data.createdAt) : new Date(),
      attachedAt: data?.attachedAt ? new Date(data.attachedAt) : undefined,
      validationState: data?.validationState || data?.ValidationState,
      lastValidatedAt: data?.lastValidatedAt ? new Date(data.lastValidatedAt) : undefined,
    };
  }

  private normalizeCheckpointMetadata(data: any): CheckpointMetadata {
    return {
      id: data?.id || data?.Id || '',
      cloneId: data?.cloneId || data?.CloneId || '',
      checkpointName: data?.checkpointName || data?.CheckpointName || '',
      phase: data?.phase || data?.Phase || 'manual',
      description: data?.description || data?.Description,
      status: data?.status || data?.Status || 'Ready',
      isPinned: data?.isPinned || data?.IsPinned || false,
      labels: data?.labels || data?.Labels || [],
      isFavorite: data?.isFavorite || data?.IsFavorite || false,
      createdAt: data?.createdAt ? new Date(data.createdAt) : new Date(),
      restoredAt: data?.restoredAt ? new Date(data.restoredAt) : undefined,
      vhdxPath: data?.vhdxPath || data?.VhdxPath,
      stateHash: data?.stateHash || data?.StateHash,
      backingType: data?.backingType || data?.BackingType,
      validationState: data?.validationState || data?.ValidationState,
    };
  }
}

// Singleton provider instance
let providerInstance: SqlServerProvider | null = null;

export function getProvider(): IProvider {
  if (!providerInstance) {
    providerInstance = new SqlServerProvider();
  }
  return providerInstance;
}

export function setProvider(provider: IProvider): void {
  // For testing purposes
  providerInstance = provider as SqlServerProvider;
}
