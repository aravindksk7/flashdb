import { getSqlClient } from './sqlClient';
import logger from '../logger';

/**
 * Clone data model
 */
export interface CloneData {
  id: string;
  goldenImageId: string;
  cloneName: string;
  instancePath: string;
  storagePath: string;
  status: string;
  databaseType?: string;
  databaseName?: string;
  compressionEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  size?: number;
  lastModified?: Date;
}

/**
 * Checkpoint data model
 */
export interface CheckpointData {
  id: string;
  cloneId: string;
  checkpointName: string;
  phase: string;
  description?: string;
  isFavorite: boolean;
  labels: string[];
  createdAt: Date;
  restoredAt?: Date;
  size?: number;
}

/**
 * Operation metric data model
 */
export interface OperationMetricData {
  id: string;
  operationType: string;
  targetId: string;
  status: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs: number;
  errorMessage?: string;
}

/**
 * Clone Repository - CRUD operations for clones
 */
export class CloneRepository {
  private sqlClient = getSqlClient();

  /**
   * Create a new clone record
   */
  async create(clone: Omit<CloneData, 'id' | 'createdAt' | 'updatedAt'>): Promise<CloneData> {
    const id = require('uuid').v4();
    const createdAt = new Date();
    const updatedAt = new Date();

    const sql = `
      INSERT INTO Clones (
        id, goldenImageId, cloneName, instancePath, storagePath,
        status, databaseType, databaseName, compressionEnabled,
        createdAt, updatedAt
      ) VALUES (
        @id, @goldenImageId, @cloneName, @instancePath, @storagePath,
        @status, @databaseType, @databaseName, @compressionEnabled,
        @createdAt, @updatedAt
      )
    `;

    try {
      await this.sqlClient.execute(sql, {
        id,
        goldenImageId: clone.goldenImageId,
        cloneName: clone.cloneName,
        instancePath: clone.instancePath,
        storagePath: clone.storagePath,
        status: clone.status || 'Pending',
        databaseType: clone.databaseType || null,
        databaseName: clone.databaseName || null,
        compressionEnabled: clone.compressionEnabled || false,
        createdAt,
        updatedAt
      });

      logger.info(`Clone created: ${id}`);

      return {
        ...clone,
        id,
        createdAt,
        updatedAt
      };
    } catch (error: any) {
      logger.error(`Error creating clone: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get clone by ID
   */
  async getById(id: string): Promise<CloneData | null> {
    const sql = 'SELECT * FROM Clones WHERE id = @id';

    try {
      const result = await this.sqlClient.query<CloneData>(sql, { id });
      return result.recordset[0] || null;
    } catch (error: any) {
      logger.error(`Error getting clone: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all clones
   */
  async getAll(): Promise<CloneData[]> {
    const sql = 'SELECT * FROM Clones ORDER BY createdAt DESC';

    try {
      const result = await this.sqlClient.query<CloneData>(sql);
      return result.recordset;
    } catch (error: any) {
      logger.error(`Error getting all clones: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get clones by golden image ID
   */
  async getByGoldenImageId(goldenImageId: string): Promise<CloneData[]> {
    const sql = 'SELECT * FROM Clones WHERE goldenImageId = @goldenImageId ORDER BY createdAt DESC';

    try {
      const result = await this.sqlClient.query<CloneData>(sql, { goldenImageId });
      return result.recordset;
    } catch (error: any) {
      logger.error(`Error getting clones by golden image: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update clone
   */
  async update(id: string, updates: Partial<CloneData>): Promise<void> {
    const updatedAt = new Date();
    const fields: string[] = [];
    const params: Record<string, any> = { id, updatedAt };

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'createdAt') {
        fields.push(`${key} = @${key}`);
        params[key] = value;
      }
    }

    if (fields.length === 0) {
      return;
    }

    fields.push('updatedAt = @updatedAt');

    const sql = `UPDATE Clones SET ${fields.join(', ')} WHERE id = @id`;

    try {
      await this.sqlClient.execute(sql, params);
      logger.info(`Clone updated: ${id}`);
    } catch (error: any) {
      logger.error(`Error updating clone: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete clone
   */
  async delete(id: string): Promise<void> {
    const sql = 'DELETE FROM Clones WHERE id = @id';

    try {
      await this.sqlClient.execute(sql, { id });
      logger.info(`Clone deleted: ${id}`);
    } catch (error: any) {
      logger.error(`Error deleting clone: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get clones by status
   */
  async getByStatus(status: string): Promise<CloneData[]> {
    const sql = 'SELECT * FROM Clones WHERE status = @status ORDER BY createdAt DESC';

    try {
      const result = await this.sqlClient.query<CloneData>(sql, { status });
      return result.recordset;
    } catch (error: any) {
      logger.error(`Error getting clones by status: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Checkpoint Repository - CRUD operations for checkpoints
 */
export class CheckpointRepository {
  private sqlClient = getSqlClient();

  /**
   * Create a new checkpoint record
   */
  async create(checkpoint: Omit<CheckpointData, 'id' | 'createdAt'>): Promise<CheckpointData> {
    const id = require('uuid').v4();
    const createdAt = new Date();

    const sql = `
      INSERT INTO Checkpoints (
        id, cloneId, checkpointName, phase, description,
        isFavorite, labels, createdAt
      ) VALUES (
        @id, @cloneId, @checkpointName, @phase, @description,
        @isFavorite, @labels, @createdAt
      )
    `;

    try {
      await this.sqlClient.execute(sql, {
        id,
        cloneId: checkpoint.cloneId,
        checkpointName: checkpoint.checkpointName,
        phase: checkpoint.phase,
        description: checkpoint.description || null,
        isFavorite: checkpoint.isFavorite || false,
        labels: JSON.stringify(checkpoint.labels || []),
        createdAt
      });

      logger.info(`Checkpoint created: ${id}`);

      return {
        ...checkpoint,
        id,
        createdAt
      };
    } catch (error: any) {
      logger.error(`Error creating checkpoint: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get checkpoint by ID
   */
  async getById(id: string): Promise<CheckpointData | null> {
    const sql = 'SELECT * FROM Checkpoints WHERE id = @id';

    try {
      const result = await this.sqlClient.query<any>(sql, { id });
      const checkpoint = result.recordset[0];
      if (!checkpoint) return null;

      return this.parseCheckpoint(checkpoint);
    } catch (error: any) {
      logger.error(`Error getting checkpoint: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get checkpoints by clone ID
   */
  async getByCloneId(cloneId: string): Promise<CheckpointData[]> {
    const sql = 'SELECT * FROM Checkpoints WHERE cloneId = @cloneId ORDER BY createdAt DESC';

    try {
      const result = await this.sqlClient.query<any>(sql, { cloneId });
      return result.recordset.map(cp => this.parseCheckpoint(cp));
    } catch (error: any) {
      logger.error(`Error getting checkpoints: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update checkpoint
   */
  async update(id: string, updates: Partial<CheckpointData>): Promise<void> {
    const fields: string[] = [];
    const params: Record<string, any> = { id };

    for (const [key, value] of Object.entries(updates)) {
      if (key !== 'id' && key !== 'createdAt') {
        fields.push(`${key} = @${key}`);
        params[key] = key === 'labels' ? JSON.stringify(value) : value;
      }
    }

    if (fields.length === 0) {
      return;
    }

    const sql = `UPDATE Checkpoints SET ${fields.join(', ')} WHERE id = @id`;

    try {
      await this.sqlClient.execute(sql, params);
      logger.info(`Checkpoint updated: ${id}`);
    } catch (error: any) {
      logger.error(`Error updating checkpoint: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete checkpoint
   */
  async delete(id: string): Promise<void> {
    const sql = 'DELETE FROM Checkpoints WHERE id = @id';

    try {
      await this.sqlClient.execute(sql, { id });
      logger.info(`Checkpoint deleted: ${id}`);
    } catch (error: any) {
      logger.error(`Error deleting checkpoint: ${error.message}`);
      throw error;
    }
  }

  /**
   * Parse checkpoint data from database
   */
  private parseCheckpoint(data: any): CheckpointData {
    return {
      id: data.id,
      cloneId: data.cloneId,
      checkpointName: data.checkpointName,
      phase: data.phase,
      description: data.description,
      isFavorite: data.isFavorite || false,
      labels: typeof data.labels === 'string' ? JSON.parse(data.labels) : data.labels || [],
      createdAt: new Date(data.createdAt),
      restoredAt: data.restoredAt ? new Date(data.restoredAt) : undefined,
      size: data.size
    };
  }
}

/**
 * Metrics Repository - Query aggregated statistics
 */
export class MetricsRepository {
  private sqlClient = getSqlClient();

  /**
   * Get overview metrics
   */
  async getOverview(): Promise<any> {
    const sql = `
      SELECT
        COUNT(*) as totalClonesCreated,
        COUNT(CASE WHEN status = 'Attached' THEN 1 END) as activeClonesCount,
        ISNULL(SUM(CAST(size AS BIGINT)), 0) / 1024 / 1024 / 1024.0 as totalStorageUsedGB
      FROM Clones
    `;

    try {
      const result = await this.sqlClient.query<any>(sql);
      const row = result.recordset[0];

      return {
        totalClonesCreated: row.totalClonesCreated || 0,
        activeClonesCount: row.activeClonesCount || 0,
        totalStorageSavedGB: 0,
        avgCloneCreationTimeSeconds: 0,
        operationSuccessRatePercent: 100,
        operationsLast24h: 0
      };
    } catch (error: any) {
      logger.error(`Error getting overview metrics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get clone creation statistics
   */
  async getCloneStats(): Promise<any> {
    const sql = `
      SELECT
        COUNT(*) as totalClones,
        COUNT(CASE WHEN status != 'Failed' THEN 1 END) as successfulClones,
        COUNT(CASE WHEN status = 'Failed' THEN 1 END) as failedClones
      FROM Clones
    `;

    try {
      const result = await this.sqlClient.query<any>(sql);
      const row = result.recordset[0];

      const total = row.totalClones || 0;
      const successful = row.successfulClones || 0;
      const failed = row.failedClones || 0;

      return {
        totalClones: total,
        successfulClones: successful,
        failedClones: failed,
        averageCreationTimeSeconds: 0,
        minCreationTimeSeconds: 0,
        maxCreationTimeSeconds: 0,
        successRatePercent: total > 0 ? Math.round((successful / total) * 100) : 100,
        creationTimesByGoldenImage: []
      };
    } catch (error: any) {
      logger.error(`Error getting clone stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get storage metrics
   */
  async getStorageMetrics(): Promise<any> {
    const sql = `
      SELECT
        COUNT(*) as cloneCount,
        ISNULL(SUM(CAST(size AS BIGINT)), 0) / 1024 / 1024 / 1024.0 as totalUsedGB
      FROM Clones
    `;

    try {
      const result = await this.sqlClient.query<any>(sql);
      const row = result.recordset[0];

      return {
        totalUsedGB: row.totalUsedGB || 0,
        totalSavingsGB: 0,
        compressionRatioPercent: 0,
        avgCloneSizeGB: row.cloneCount > 0 ? (row.totalUsedGB || 0) / row.cloneCount : 0,
        totalParentSizeGB: 0,
        cloneStorageBreakdown: []
      };
    } catch (error: any) {
      logger.error(`Error getting storage metrics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get operation metrics
   */
  async getOperationMetrics(): Promise<any> {
    const sql = `
      SELECT
        COUNT(*) as totalOperations,
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) as successfulOperations,
        COUNT(CASE WHEN status = 'Failed' THEN 1 END) as failedOperations
      FROM OperationMetrics
    `;

    try {
      const result = await this.sqlClient.query<any>(sql);
      const row = result.recordset[0];

      const total = row.totalOperations || 0;
      const successful = row.successfulOperations || 0;
      const failed = row.failedOperations || 0;

      return {
        totalOperations: total,
        successfulOperations: successful,
        failedOperations: failed,
        successRatePercent: total > 0 ? Math.round((successful / total) * 100) : 100,
        operationsByType: []
      };
    } catch (error: any) {
      logger.error(`Error getting operation metrics: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get timeline data for the last N hours
   */
  async getTimelineData(hoursBack: number = 24): Promise<any> {
    const sql = `
      SELECT
        DATEADD(HOUR, -DATEDIFF(HOUR, GETUTCDATE(), createdAt), createdAt) as timeSlot,
        COUNT(*) as cloneCount
      FROM Clones
      WHERE createdAt >= DATEADD(HOUR, -@hoursBack, GETUTCDATE())
      GROUP BY DATEADD(HOUR, -DATEDIFF(HOUR, GETUTCDATE(), createdAt), createdAt)
      ORDER BY timeSlot
    `;

    try {
      const result = await this.sqlClient.query<any>(sql, { hoursBack });

      return {
        cloneCreations: result.recordset || [],
        operations: [],
        timelineStart: new Date(Date.now() - hoursBack * 3600000),
        timelineEnd: new Date()
      };
    } catch (error: any) {
      logger.error(`Error getting timeline data: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Search Repository - Full-text search operations
 */
export class SearchRepository {
  private sqlClient = getSqlClient();

  /**
   * Search clones by name
   */
  async searchClones(query: string): Promise<CloneData[]> {
    const sql = `
      SELECT * FROM Clones
      WHERE cloneName LIKE @query OR instancePath LIKE @query
      ORDER BY createdAt DESC
    `;

    try {
      const result = await this.sqlClient.query<CloneData>(sql, {
        query: `%${query}%`
      });
      return result.recordset;
    } catch (error: any) {
      logger.error(`Error searching clones: ${error.message}`);
      throw error;
    }
  }

  /**
   * Search checkpoints
   */
  async searchCheckpoints(query: string): Promise<CheckpointData[]> {
    const sql = `
      SELECT * FROM Checkpoints
      WHERE checkpointName LIKE @query OR description LIKE @query
      ORDER BY createdAt DESC
    `;

    try {
      const result = await this.sqlClient.query<any>(sql, {
        query: `%${query}%`
      });

      return result.recordset.map((cp: any) => ({
        id: cp.id,
        cloneId: cp.cloneId,
        checkpointName: cp.checkpointName,
        phase: cp.phase,
        description: cp.description,
        isFavorite: cp.isFavorite || false,
        labels: typeof cp.labels === 'string' ? JSON.parse(cp.labels) : cp.labels || [],
        createdAt: new Date(cp.createdAt),
        restoredAt: cp.restoredAt ? new Date(cp.restoredAt) : undefined,
        size: cp.size
      }));
    } catch (error: any) {
      logger.error(`Error searching checkpoints: ${error.message}`);
      throw error;
    }
  }

  /**
   * Advanced search with multiple criteria
   */
  async advancedSearch(criteria: Record<string, any>): Promise<any[]> {
    const fields: string[] = [];
    const params: Record<string, any> = {};

    if (criteria.cloneName) {
      fields.push('cloneName LIKE @cloneName');
      params.cloneName = `%${criteria.cloneName}%`;
    }

    if (criteria.status) {
      fields.push('status = @status');
      params.status = criteria.status;
    }

    if (criteria.fromDate) {
      fields.push('createdAt >= @fromDate');
      params.fromDate = criteria.fromDate;
    }

    if (criteria.toDate) {
      fields.push('createdAt <= @toDate');
      params.toDate = criteria.toDate;
    }

    const whereClause = fields.length > 0 ? `WHERE ${fields.join(' AND ')}` : '';
    const sql = `SELECT * FROM Clones ${whereClause} ORDER BY createdAt DESC`;

    try {
      const result = await this.sqlClient.query<CloneData>(sql, params);
      return result.recordset;
    } catch (error: any) {
      logger.error(`Error in advanced search: ${error.message}`);
      throw error;
    }
  }
}

// Singleton instances
let cloneRepoInstance: CloneRepository;
let checkpointRepoInstance: CheckpointRepository;
let metricsRepoInstance: MetricsRepository;
let searchRepoInstance: SearchRepository;

/**
 * Get clone repository instance
 */
export function getCloneRepository(): CloneRepository {
  if (!cloneRepoInstance) {
    cloneRepoInstance = new CloneRepository();
  }
  return cloneRepoInstance;
}

/**
 * Get checkpoint repository instance
 */
export function getCheckpointRepository(): CheckpointRepository {
  if (!checkpointRepoInstance) {
    checkpointRepoInstance = new CheckpointRepository();
  }
  return checkpointRepoInstance;
}

/**
 * Get metrics repository instance
 */
export function getMetricsRepository(): MetricsRepository {
  if (!metricsRepoInstance) {
    metricsRepoInstance = new MetricsRepository();
  }
  return metricsRepoInstance;
}

/**
 * Get search repository instance
 */
export function getSearchRepository(): SearchRepository {
  if (!searchRepoInstance) {
    searchRepoInstance = new SearchRepository();
  }
  return searchRepoInstance;
}
