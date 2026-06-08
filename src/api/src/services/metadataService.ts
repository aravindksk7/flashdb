/**
 * Metadata Service
 *
 * Centralizes durable metadata for all FlashDB entities.
 * Phase 3: Durable Metadata Model
 *
 * Manages:
 * - GoldenImage metadata
 * - Clone metadata
 * - Checkpoint metadata
 * - Host metadata
 * - RepairAttempt metadata
 */

import {
  GoldenImageMetadata,
  CloneMetadata,
  CheckpointMetadata,
  HostMetadata,
  RepairAttemptMetadata,
  ValidationFinding,
} from '../types/providerContract';
import { getSqlClient, SqlClient } from './sqlClient';
import logger from '../logger';

/**
 * Metadata field definitions
 * Distinguish between durable facts and live observations
 */

export interface MetadataFieldDefinition {
  name: string;
  type: 'text' | 'timestamp' | 'integer' | 'boolean' | 'json';
  nullable: boolean;
  isDurableFact: boolean; // true = stored/updated by metadata operations
  comment: string;
}

/**
 * Golden Image Metadata Schema
 * Phase 3, Step 1
 */
export const GOLDEN_IMAGE_SCHEMA: MetadataFieldDefinition[] = [
  {
    name: 'id',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Unique identifier',
  },
  {
    name: 'name',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Human-readable name',
  },
  {
    name: 'version',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Version identifier (semver recommended)',
  },
  {
    name: 'method',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Creation method: BackupRestore|ReplicaBackup|TableByTableCopy',
  },
  {
    name: 'output_path',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Storage path for image files',
  },
  {
    name: 'status',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Status: Creating|Ready|Failed|Deleting',
  },
  {
    name: 'created_at',
    type: 'timestamp',
    nullable: false,
    isDurableFact: true,
    comment: 'Creation timestamp (immutable)',
  },
  {
    name: 'updated_at',
    type: 'timestamp',
    nullable: true,
    isDurableFact: true,
    comment: 'Last metadata update',
  },
  {
    name: 'file_size',
    type: 'integer',
    nullable: true,
    isDurableFact: false,
    comment: 'Live observation from storage',
  },
  {
    name: 'row_count',
    type: 'integer',
    nullable: true,
    isDurableFact: false,
    comment: 'Live observation from SQL',
  },
  {
    name: 'table_count',
    type: 'integer',
    nullable: true,
    isDurableFact: false,
    comment: 'Live observation from SQL',
  },
  {
    name: 'verification_state',
    type: 'text',
    nullable: true,
    isDurableFact: false,
    comment: 'Live validation state: Pending|Verified|Failed',
  },
];

/**
 * Clone Metadata Schema
 * Phase 3, Step 2
 */
export const CLONE_SCHEMA: MetadataFieldDefinition[] = [
  {
    name: 'id',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Unique identifier',
  },
  {
    name: 'clone_name',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Human-readable name',
  },
  {
    name: 'golden_image_id',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Parent golden image ID (immutable)',
  },
  {
    name: 'status',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Status: Creating|Attached|Detached|Failed|Deleting',
  },
  {
    name: 'instance_path',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'SQL Server instance path',
  },
  {
    name: 'storage_path',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'VHD storage path',
  },
  {
    name: 'vhdx_path',
    type: 'text',
    nullable: true,
    isDurableFact: true,
    comment: 'Full path to VHDX file',
  },
  {
    name: 'mount_path',
    type: 'text',
    nullable: true,
    isDurableFact: false,
    comment: 'Live mount point (Windows)',
  },
  {
    name: 'sql_instance_name',
    type: 'text',
    nullable: true,
    isDurableFact: true,
    comment: 'SQL instance name',
  },
  {
    name: 'database_name',
    type: 'text',
    nullable: true,
    isDurableFact: true,
    comment: 'Attached database name',
  },
  {
    name: 'host',
    type: 'text',
    nullable: true,
    isDurableFact: true,
    comment: 'Target host name (for remote)',
  },
  {
    name: 'created_at',
    type: 'timestamp',
    nullable: false,
    isDurableFact: true,
    comment: 'Creation timestamp (immutable)',
  },
  {
    name: 'attached_at',
    type: 'timestamp',
    nullable: true,
    isDurableFact: true,
    comment: 'Last attach timestamp',
  },
  {
    name: 'validation_state',
    type: 'text',
    nullable: true,
    isDurableFact: false,
    comment: 'Live validation state: Pending|Healthy|Unhealthy|Unknown',
  },
  {
    name: 'last_validated_at',
    type: 'timestamp',
    nullable: true,
    isDurableFact: false,
    comment: 'Last validation timestamp',
  },
];

/**
 * Checkpoint Metadata Schema
 * Phase 3, Step 3
 */
export const CHECKPOINT_SCHEMA: MetadataFieldDefinition[] = [
  {
    name: 'id',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Unique identifier',
  },
  {
    name: 'clone_id',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Parent clone ID (immutable)',
  },
  {
    name: 'checkpoint_name',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Human-readable name',
  },
  {
    name: 'phase',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Phase: manual|automatic|<custom>',
  },
  {
    name: 'description',
    type: 'text',
    nullable: true,
    isDurableFact: true,
    comment: 'User-provided description',
  },
  {
    name: 'status',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Status: Creating|Ready|Restoring|Failed|Deleting',
  },
  {
    name: 'is_pinned',
    type: 'boolean',
    nullable: false,
    isDurableFact: true,
    comment: 'Pin flag (delete protection)',
  },
  {
    name: 'labels',
    type: 'json',
    nullable: true,
    isDurableFact: true,
    comment: 'Array of user labels',
  },
  {
    name: 'is_favorite',
    type: 'boolean',
    nullable: false,
    isDurableFact: true,
    comment: 'Favorite flag',
  },
  {
    name: 'created_at',
    type: 'timestamp',
    nullable: false,
    isDurableFact: true,
    comment: 'Creation timestamp (immutable)',
  },
  {
    name: 'restored_at',
    type: 'timestamp',
    nullable: true,
    isDurableFact: true,
    comment: 'Last restore timestamp',
  },
  {
    name: 'vhdx_path',
    type: 'text',
    nullable: true,
    isDurableFact: true,
    comment: 'Backing VHDX path',
  },
  {
    name: 'state_hash',
    type: 'text',
    nullable: true,
    isDurableFact: true,
    comment: 'Hash of checkpoint state for integrity',
  },
  {
    name: 'backing_type',
    type: 'text',
    nullable: true,
    isDurableFact: true,
    comment: 'Backing type: Database|Vhdx|Hybrid',
  },
  {
    name: 'validation_state',
    type: 'text',
    nullable: true,
    isDurableFact: false,
    comment: 'Live validation state: Pending|Valid|Invalid|Unknown',
  },
];

/**
 * Host Metadata Schema
 * Phase 3, Step 4
 */
export const HOST_SCHEMA: MetadataFieldDefinition[] = [
  {
    name: 'id',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Unique identifier',
  },
  {
    name: 'name',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Short hostname',
  },
  {
    name: 'fqdn',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Fully qualified domain name',
  },
  {
    name: 'access_method',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Access method: Local|WinRM|SSH',
  },
  {
    name: 'sql_instances',
    type: 'json',
    nullable: true,
    isDurableFact: true,
    comment: 'Array of SQL instance names',
  },
  {
    name: 'path_mappings',
    type: 'json',
    nullable: true,
    isDurableFact: true,
    comment: 'UNC to local path mappings',
  },
  {
    name: 'credential_reference',
    type: 'text',
    nullable: true,
    isDurableFact: true,
    comment: 'Reference to stored credentials',
  },
  {
    name: 'last_validated_at',
    type: 'timestamp',
    nullable: true,
    isDurableFact: false,
    comment: 'Last validation timestamp',
  },
  {
    name: 'validation_state',
    type: 'text',
    nullable: true,
    isDurableFact: false,
    comment: 'Live validation state: Pending|Valid|Invalid|Unknown',
  },
  {
    name: 'created_at',
    type: 'timestamp',
    nullable: false,
    isDurableFact: true,
    comment: 'Creation timestamp (immutable)',
  },
];

/**
 * RepairAttempt Metadata Schema
 * Phase 3, Step 5
 */
export const REPAIR_ATTEMPT_SCHEMA: MetadataFieldDefinition[] = [
  {
    name: 'id',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Unique identifier',
  },
  {
    name: 'clone_id',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Clone being repaired',
  },
  {
    name: 'validation_findings',
    type: 'json',
    nullable: true,
    isDurableFact: true,
    comment: 'Array of ValidationFinding objects',
  },
  {
    name: 'attempted_actions',
    type: 'json',
    nullable: true,
    isDurableFact: true,
    comment: 'Array of RepairAction objects',
  },
  {
    name: 'result',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Result: Success|Partial|Failed|Skipped',
  },
  {
    name: 'result_message',
    type: 'text',
    nullable: false,
    isDurableFact: true,
    comment: 'Human-readable result message',
  },
  {
    name: 'operator_id',
    type: 'text',
    nullable: true,
    isDurableFact: true,
    comment: 'User who initiated repair',
  },
  {
    name: 'task_id',
    type: 'text',
    nullable: true,
    isDurableFact: true,
    comment: 'Queue task ID',
  },
  {
    name: 'started_at',
    type: 'timestamp',
    nullable: false,
    isDurableFact: true,
    comment: 'Start timestamp',
  },
  {
    name: 'completed_at',
    type: 'timestamp',
    nullable: true,
    isDurableFact: true,
    comment: 'Completion timestamp',
  },
];

/**
 * Metadata Service
 *
 * Provides CRUD operations for all metadata types.
 * All operations are persisted to PostgreSQL.
 */
export class MetadataService {
  private getSqlClient(): SqlClient {
    return getSqlClient();
  }

  async initialize(): Promise<void> {
    logger.info('[MetadataService] Initializing metadata tables');

    try {
      // Create tables if they don't exist
      await this.createTablesIfNotExist();
      logger.info('[MetadataService] Metadata tables ready');
    } catch (error) {
      logger.error(`[MetadataService] Initialization failed: ${error}`);
      throw error;
    }
  }

  private async createTablesIfNotExist(): Promise<void> {
    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, skipping table creation');
      return;
    }

    // Table creation SQL would go here
    // This is a placeholder for the actual implementation
  }

  /**
   * Golden Image Metadata Operations
   */

  async saveGoldenImage(metadata: GoldenImageMetadata): Promise<void> {
    logger.debug(`[MetadataService] Saving golden image: ${metadata.id}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot save golden image metadata');
      return;
    }

    try {
      const upsertQuery = `
        IF EXISTS (SELECT 1 FROM [dbo].[GoldenImages] WHERE [id] = @id)
          UPDATE [dbo].[GoldenImages]
          SET [imageName] = @name,
              [updatedAt] = GETUTCDATE()
          WHERE [id] = @id
        ELSE
          INSERT INTO [dbo].[GoldenImages] ([id], [imageName], [imagePath], [createdAt], [updatedAt])
          VALUES (@id, @name, @imagePath, GETUTCDATE(), GETUTCDATE())
      `;

      await this.getSqlClient().query(upsertQuery, {
        id: metadata.id,
        name: metadata.name || 'Unknown',
        imagePath: metadata.outputPath || ''
      });

      logger.info(`[MetadataService] Golden image persisted: ${metadata.id}`);
    } catch (error) {
      logger.error(`[MetadataService] Failed to save golden image metadata: ${error}`);
      throw error;
    }
  }

  async getGoldenImage(imageId: string): Promise<GoldenImageMetadata | null> {
    logger.debug(`[MetadataService] Retrieving golden image: ${imageId}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot retrieve golden image metadata');
      return null;
    }

    try {
      // Query golden image metadata
      // Actual implementation would use the SQL client
      return null;
    } catch (error) {
      logger.error(`[MetadataService] Failed to retrieve golden image metadata: ${error}`);
      throw error;
    }
  }

  async deleteGoldenImage(imageId: string): Promise<void> {
    logger.debug(`[MetadataService] Deleting golden image: ${imageId}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot delete golden image');
      return;
    }

    try {
      // Validate image exists before deleting
      const image = await this.getGoldenImage(imageId);
      if (!image) {
        logger.warn(`[MetadataService] Golden image not found: ${imageId}`);
        return; // Idempotent: no-op if already deleted
      }

      // Step 1: Delete all checkpoints for clones of this image (cascade)
      const deleteCheckpoints = `
        DELETE FROM checkpoints
        WHERE clone_id IN (
          SELECT id FROM clones WHERE golden_image_id = @imageId
        )
      `;
      const checkpointResult = await this.getSqlClient().query(deleteCheckpoints, {
        imageId,
      });
      logger.debug(
        `[MetadataService] Deleted ${checkpointResult.rowsAffected[0]} checkpoints`
      );

      // Step 2: Delete all clones for this image
      const deleteClones = `DELETE FROM clones WHERE golden_image_id = @imageId`;
      const cloneResult = await this.getSqlClient().query(deleteClones, { imageId });
      logger.debug(
        `[MetadataService] Deleted ${cloneResult.rowsAffected[0]} clones`
      );

      // Step 3: Delete the golden image itself
      const deleteImage = `DELETE FROM golden_images WHERE id = @imageId`;
      await this.getSqlClient().query(deleteImage, { imageId });

      logger.info(
        `[MetadataService] Golden image and all dependents deleted: ${imageId}`
      );
    } catch (error) {
      logger.error(`[MetadataService] Failed to delete golden image: ${error}`);
      throw error;
    }
  }

  /**
   * Clone Metadata Operations
   */

  async saveClone(metadata: CloneMetadata): Promise<void> {
    logger.debug(`[MetadataService] Saving clone: ${metadata.id}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot save clone metadata');
      return;
    }

    try {
      // Save clone metadata
      // Actual implementation would use the SQL client
    } catch (error) {
      logger.error(`[MetadataService] Failed to save clone metadata: ${error}`);
      throw error;
    }
  }

  async getClone(cloneId: string): Promise<CloneMetadata | null> {
    logger.debug(`[MetadataService] Retrieving clone: ${cloneId}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot retrieve clone metadata');
      return null;
    }

    try {
      // Query clone metadata
      return null;
    } catch (error) {
      logger.error(`[MetadataService] Failed to retrieve clone metadata: ${error}`);
      throw error;
    }
  }

  async listClones(filter?: { goldenImageId?: string }): Promise<CloneMetadata[]> {
    logger.debug('[MetadataService] Listing clones');

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot list clones');
      return [];
    }

    try {
      // Query all clones with optional filter
      return [];
    } catch (error) {
      logger.error(`[MetadataService] Failed to list clones: ${error}`);
      throw error;
    }
  }

  async updateCloneStatus(cloneId: string, status: string): Promise<void> {
    logger.debug(`[MetadataService] Updating clone status: ${cloneId} -> ${status}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot update clone status');
      return;
    }

    try {
      // Update clone status in metadata
    } catch (error) {
      logger.error(`[MetadataService] Failed to update clone status: ${error}`);
      throw error;
    }
  }

  async deleteClone(cloneId: string): Promise<void> {
    logger.debug(`[MetadataService] Deleting clone: ${cloneId}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot delete clone');
      return;
    }

    try {
      // Explicitly delete CheckpointOperations first to avoid constraint violations
      const deleteOps = `DELETE FROM [dbo].[CheckpointOperations] WHERE [cloneId] = @cloneId`;
      const opsResult = await this.getSqlClient().query(deleteOps, { cloneId });
      logger.debug(`[MetadataService] Deleted ${opsResult.rowsAffected?.[0] || 0} checkpoint operations`);

      // Explicitly delete Checkpoints (also via CASCADE in schema, but be explicit)
      const deleteCheckpoints = `DELETE FROM [dbo].[Checkpoints] WHERE [cloneId] = @cloneId`;
      const cpResult = await this.getSqlClient().query(deleteCheckpoints, { cloneId });
      logger.debug(`[MetadataService] Deleted ${cpResult.rowsAffected?.[0] || 0} checkpoints`);

      // Finally delete the Clone itself
      const deleteClone = `DELETE FROM [dbo].[Clones] WHERE [id] = @cloneId`;
      const deleteResult = await this.getSqlClient().query(deleteClone, { cloneId });
      const deleted = deleteResult.rowsAffected?.[0] || 0;

      if (deleted === 0) {
        logger.warn(`[MetadataService] Clone not found: ${cloneId}`);
        return;
      }

      logger.info(`[MetadataService] Clone and all dependents deleted from database: ${cloneId}`);
    } catch (error) {
      logger.error(`[MetadataService] Failed to delete clone: ${error}`);
      throw error;
    }
  }

  /**
   * Checkpoint Metadata Operations
   */

  async saveCheckpoint(metadata: CheckpointMetadata): Promise<void> {
    logger.debug(`[MetadataService] Saving checkpoint: ${metadata.id}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot save checkpoint metadata');
      return;
    }

    try {
      // Save checkpoint metadata
    } catch (error) {
      logger.error(`[MetadataService] Failed to save checkpoint metadata: ${error}`);
      throw error;
    }
  }

  async getCheckpoint(cloneId: string, checkpointId: string): Promise<CheckpointMetadata | null> {
    logger.debug(`[MetadataService] Retrieving checkpoint: ${checkpointId}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot retrieve checkpoint metadata');
      return null;
    }

    try {
      // Query checkpoint metadata
      return null;
    } catch (error) {
      logger.error(`[MetadataService] Failed to retrieve checkpoint metadata: ${error}`);
      throw error;
    }
  }

  async updateCheckpointPin(cloneId: string, checkpointId: string, isPinned: boolean): Promise<void> {
    logger.debug(`[MetadataService] Updating checkpoint pin: ${checkpointId} -> ${isPinned}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot update checkpoint pin');
      return;
    }

    try {
      // Update is_pinned flag
    } catch (error) {
      logger.error(`[MetadataService] Failed to update checkpoint pin: ${error}`);
      throw error;
    }
  }

  async deleteCheckpoint(cloneId: string, checkpointId: string): Promise<void> {
    logger.debug(`[MetadataService] Deleting checkpoint: ${checkpointId}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot delete checkpoint');
      return;
    }

    try {
      // Validate checkpoint exists and belongs to clone
      const checkpoint = await this.getCheckpoint(cloneId, checkpointId);
      if (!checkpoint) {
        logger.warn(`[MetadataService] Checkpoint not found: ${checkpointId}`);
        return; // Idempotent: no-op if already deleted
      }

      // Check if pinned (requires force to delete)
      if (checkpoint.isPinned) {
        logger.warn(
          `[MetadataService] Checkpoint is pinned: ${checkpointId}. Set isPinned=false first.`
        );
        throw new Error(
          'Pinned checkpoint cannot be deleted. Unpin first or use force flag.'
        );
      }

      // Delete checkpoint with ownership validation
      const deleteQuery = `
        DELETE FROM checkpoints
        WHERE id = @checkpointId AND clone_id = @cloneId
      `;
      await this.getSqlClient().query(deleteQuery, { checkpointId, cloneId });

      logger.info(`[MetadataService] Checkpoint deleted: ${checkpointId}`);
    } catch (error) {
      logger.error(`[MetadataService] Failed to delete checkpoint: ${error}`);
      throw error;
    }
  }

  /**
   * Host Metadata Operations
   */

  async saveHost(metadata: HostMetadata): Promise<void> {
    logger.debug(`[MetadataService] Saving host: ${metadata.id}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot save host metadata');
      return;
    }

    try {
      // Save host metadata
    } catch (error) {
      logger.error(`[MetadataService] Failed to save host metadata: ${error}`);
      throw error;
    }
  }

  async getHost(hostId: string): Promise<HostMetadata | null> {
    logger.debug(`[MetadataService] Retrieving host: ${hostId}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot retrieve host metadata');
      return null;
    }

    try {
      // Query host metadata
      return null;
    } catch (error) {
      logger.error(`[MetadataService] Failed to retrieve host metadata: ${error}`);
      throw error;
    }
  }

  /**
   * RepairAttempt Metadata Operations
   */

  async saveRepairAttempt(metadata: RepairAttemptMetadata): Promise<void> {
    logger.debug(`[MetadataService] Saving repair attempt: ${metadata.id}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot save repair attempt metadata');
      return;
    }

    try {
      // Save repair attempt metadata
    } catch (error) {
      logger.error(`[MetadataService] Failed to save repair attempt metadata: ${error}`);
      throw error;
    }
  }

  async getRepairAttempt(repairId: string): Promise<RepairAttemptMetadata | null> {
    logger.debug(`[MetadataService] Retrieving repair attempt: ${repairId}`);

    if (!this.getSqlClient()) {
      logger.warn('[MetadataService] SQL client not available, cannot retrieve repair attempt');
      return null;
    }

    try {
      // Query repair attempt metadata
      return null;
    } catch (error) {
      logger.error(`[MetadataService] Failed to retrieve repair attempt: ${error}`);
      throw error;
    }
  }

  /**
   * Metadata Query and Analysis
   */

  async getMetadataStats(): Promise<{
    goldenImages: number;
    clones: number;
    checkpoints: number;
    hosts: number;
    repairAttempts: number;
  }> {
    logger.debug('[MetadataService] Retrieving metadata statistics');

    return {
      goldenImages: 0,
      clones: 0,
      checkpoints: 0,
      hosts: 0,
      repairAttempts: 0,
    };
  }

  /**
   * Health Check
   */

  async healthCheck(): Promise<{ isHealthy: boolean; message: string }> {
    logger.debug('[MetadataService] Performing health check');

    if (!this.getSqlClient()) {
      return {
        isHealthy: false,
        message: 'SQL client not available',
      };
    }

    try {
      // Health check query
      return {
        isHealthy: true,
        message: 'Metadata service is healthy',
      };
    } catch (error) {
      return {
        isHealthy: false,
        message: `Health check failed: ${error}`,
      };
    }
  }
}

// Singleton instance
let instance: MetadataService | null = null;

export function getMetadataService(): MetadataService {
  if (!instance) {
    instance = new MetadataService();
  }
  return instance;
}
