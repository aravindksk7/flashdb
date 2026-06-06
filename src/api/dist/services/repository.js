"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchRepository = exports.MetricsRepository = exports.CheckpointRepository = exports.CloneRepository = void 0;
exports.getCloneRepository = getCloneRepository;
exports.getCheckpointRepository = getCheckpointRepository;
exports.getMetricsRepository = getMetricsRepository;
exports.getSearchRepository = getSearchRepository;
const sqlClient_1 = require("./sqlClient");
const logger_1 = __importDefault(require("../logger"));
/**
 * Clone Repository - CRUD operations for clones
 */
class CloneRepository {
    constructor() {
        this.sqlClient = (0, sqlClient_1.getSqlClient)();
    }
    /**
     * Create a new clone record
     */
    async create(clone) {
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
            logger_1.default.info(`Clone created: ${id}`);
            return {
                ...clone,
                id,
                createdAt,
                updatedAt
            };
        }
        catch (error) {
            logger_1.default.error(`Error creating clone: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get clone by ID
     */
    async getById(id) {
        const sql = 'SELECT * FROM Clones WHERE id = @id';
        try {
            const result = await this.sqlClient.query(sql, { id });
            return result.recordset[0] || null;
        }
        catch (error) {
            logger_1.default.error(`Error getting clone: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get all clones
     */
    async getAll() {
        const sql = 'SELECT * FROM Clones ORDER BY createdAt DESC';
        try {
            const result = await this.sqlClient.query(sql);
            return result.recordset;
        }
        catch (error) {
            logger_1.default.error(`Error getting all clones: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get clones by golden image ID
     */
    async getByGoldenImageId(goldenImageId) {
        const sql = 'SELECT * FROM Clones WHERE goldenImageId = @goldenImageId ORDER BY createdAt DESC';
        try {
            const result = await this.sqlClient.query(sql, { goldenImageId });
            return result.recordset;
        }
        catch (error) {
            logger_1.default.error(`Error getting clones by golden image: ${error.message}`);
            throw error;
        }
    }
    /**
     * Update clone
     */
    async update(id, updates) {
        const updatedAt = new Date();
        const fields = [];
        const params = { id, updatedAt };
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
            logger_1.default.info(`Clone updated: ${id}`);
        }
        catch (error) {
            logger_1.default.error(`Error updating clone: ${error.message}`);
            throw error;
        }
    }
    /**
     * Delete clone
     */
    async delete(id) {
        const sql = 'DELETE FROM Clones WHERE id = @id';
        try {
            await this.sqlClient.execute(sql, { id });
            logger_1.default.info(`Clone deleted: ${id}`);
        }
        catch (error) {
            logger_1.default.error(`Error deleting clone: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get clones by status
     */
    async getByStatus(status) {
        const sql = 'SELECT * FROM Clones WHERE status = @status ORDER BY createdAt DESC';
        try {
            const result = await this.sqlClient.query(sql, { status });
            return result.recordset;
        }
        catch (error) {
            logger_1.default.error(`Error getting clones by status: ${error.message}`);
            throw error;
        }
    }
}
exports.CloneRepository = CloneRepository;
/**
 * Checkpoint Repository - CRUD operations for checkpoints
 */
class CheckpointRepository {
    constructor() {
        this.sqlClient = (0, sqlClient_1.getSqlClient)();
    }
    /**
     * Create a new checkpoint record
     */
    async create(checkpoint) {
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
            logger_1.default.info(`Checkpoint created: ${id}`);
            return {
                ...checkpoint,
                id,
                createdAt
            };
        }
        catch (error) {
            logger_1.default.error(`Error creating checkpoint: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get checkpoint by ID
     */
    async getById(id) {
        const sql = 'SELECT * FROM Checkpoints WHERE id = @id';
        try {
            const result = await this.sqlClient.query(sql, { id });
            const checkpoint = result.recordset[0];
            if (!checkpoint)
                return null;
            return this.parseCheckpoint(checkpoint);
        }
        catch (error) {
            logger_1.default.error(`Error getting checkpoint: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get checkpoints by clone ID
     */
    async getByCloneId(cloneId) {
        const sql = 'SELECT * FROM Checkpoints WHERE cloneId = @cloneId ORDER BY createdAt DESC';
        try {
            const result = await this.sqlClient.query(sql, { cloneId });
            return result.recordset.map(cp => this.parseCheckpoint(cp));
        }
        catch (error) {
            logger_1.default.error(`Error getting checkpoints: ${error.message}`);
            throw error;
        }
    }
    /**
     * Update checkpoint
     */
    async update(id, updates) {
        const fields = [];
        const params = { id };
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
            logger_1.default.info(`Checkpoint updated: ${id}`);
        }
        catch (error) {
            logger_1.default.error(`Error updating checkpoint: ${error.message}`);
            throw error;
        }
    }
    /**
     * Delete checkpoint
     */
    async delete(id) {
        const sql = 'DELETE FROM Checkpoints WHERE id = @id';
        try {
            await this.sqlClient.execute(sql, { id });
            logger_1.default.info(`Checkpoint deleted: ${id}`);
        }
        catch (error) {
            logger_1.default.error(`Error deleting checkpoint: ${error.message}`);
            throw error;
        }
    }
    /**
     * Parse checkpoint data from database
     */
    parseCheckpoint(data) {
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
exports.CheckpointRepository = CheckpointRepository;
/**
 * Metrics Repository - Query aggregated statistics
 */
class MetricsRepository {
    constructor() {
        this.sqlClient = (0, sqlClient_1.getSqlClient)();
    }
    /**
     * Get overview metrics
     */
    async getOverview() {
        const sql = `
      SELECT
        COUNT(*) as totalClonesCreated,
        COUNT(CASE WHEN status = 'Attached' THEN 1 END) as activeClonesCount,
        ISNULL(SUM(CAST(size AS BIGINT)), 0) / 1024 / 1024 / 1024.0 as totalStorageUsedGB
      FROM Clones
    `;
        try {
            const result = await this.sqlClient.query(sql);
            const row = result.recordset[0];
            return {
                totalClonesCreated: row.totalClonesCreated || 0,
                activeClonesCount: row.activeClonesCount || 0,
                totalStorageSavedGB: 0,
                avgCloneCreationTimeSeconds: 0,
                operationSuccessRatePercent: 100,
                operationsLast24h: 0
            };
        }
        catch (error) {
            logger_1.default.error(`Error getting overview metrics: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get clone creation statistics
     */
    async getCloneStats() {
        const sql = `
      SELECT
        COUNT(*) as totalClones,
        COUNT(CASE WHEN status != 'Failed' THEN 1 END) as successfulClones,
        COUNT(CASE WHEN status = 'Failed' THEN 1 END) as failedClones
      FROM Clones
    `;
        try {
            const result = await this.sqlClient.query(sql);
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
        }
        catch (error) {
            logger_1.default.error(`Error getting clone stats: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get storage metrics
     */
    async getStorageMetrics() {
        const sql = `
      SELECT
        COUNT(*) as cloneCount,
        ISNULL(SUM(CAST(size AS BIGINT)), 0) / 1024 / 1024 / 1024.0 as totalUsedGB
      FROM Clones
    `;
        try {
            const result = await this.sqlClient.query(sql);
            const row = result.recordset[0];
            return {
                totalUsedGB: row.totalUsedGB || 0,
                totalSavingsGB: 0,
                compressionRatioPercent: 0,
                avgCloneSizeGB: row.cloneCount > 0 ? (row.totalUsedGB || 0) / row.cloneCount : 0,
                totalParentSizeGB: 0,
                cloneStorageBreakdown: []
            };
        }
        catch (error) {
            logger_1.default.error(`Error getting storage metrics: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get operation metrics
     */
    async getOperationMetrics() {
        const sql = `
      SELECT
        COUNT(*) as totalOperations,
        COUNT(CASE WHEN status = 'Completed' THEN 1 END) as successfulOperations,
        COUNT(CASE WHEN status = 'Failed' THEN 1 END) as failedOperations
      FROM OperationMetrics
    `;
        try {
            const result = await this.sqlClient.query(sql);
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
        }
        catch (error) {
            logger_1.default.error(`Error getting operation metrics: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get timeline data for the last N hours
     */
    async getTimelineData(hoursBack = 24) {
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
            const result = await this.sqlClient.query(sql, { hoursBack });
            return {
                cloneCreations: result.recordset || [],
                operations: [],
                timelineStart: new Date(Date.now() - hoursBack * 3600000),
                timelineEnd: new Date()
            };
        }
        catch (error) {
            logger_1.default.error(`Error getting timeline data: ${error.message}`);
            throw error;
        }
    }
}
exports.MetricsRepository = MetricsRepository;
/**
 * Search Repository - Full-text search operations
 */
class SearchRepository {
    constructor() {
        this.sqlClient = (0, sqlClient_1.getSqlClient)();
    }
    /**
     * Search clones by name
     */
    async searchClones(query) {
        const sql = `
      SELECT * FROM Clones
      WHERE cloneName LIKE @query OR instancePath LIKE @query
      ORDER BY createdAt DESC
    `;
        try {
            const result = await this.sqlClient.query(sql, {
                query: `%${query}%`
            });
            return result.recordset;
        }
        catch (error) {
            logger_1.default.error(`Error searching clones: ${error.message}`);
            throw error;
        }
    }
    /**
     * Search checkpoints
     */
    async searchCheckpoints(query) {
        const sql = `
      SELECT * FROM Checkpoints
      WHERE checkpointName LIKE @query OR description LIKE @query
      ORDER BY createdAt DESC
    `;
        try {
            const result = await this.sqlClient.query(sql, {
                query: `%${query}%`
            });
            return result.recordset.map((cp) => ({
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
        }
        catch (error) {
            logger_1.default.error(`Error searching checkpoints: ${error.message}`);
            throw error;
        }
    }
    /**
     * Advanced search with multiple criteria
     */
    async advancedSearch(criteria) {
        const fields = [];
        const params = {};
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
            const result = await this.sqlClient.query(sql, params);
            return result.recordset;
        }
        catch (error) {
            logger_1.default.error(`Error in advanced search: ${error.message}`);
            throw error;
        }
    }
}
exports.SearchRepository = SearchRepository;
// Singleton instances
let cloneRepoInstance;
let checkpointRepoInstance;
let metricsRepoInstance;
let searchRepoInstance;
/**
 * Get clone repository instance
 */
function getCloneRepository() {
    if (!cloneRepoInstance) {
        cloneRepoInstance = new CloneRepository();
    }
    return cloneRepoInstance;
}
/**
 * Get checkpoint repository instance
 */
function getCheckpointRepository() {
    if (!checkpointRepoInstance) {
        checkpointRepoInstance = new CheckpointRepository();
    }
    return checkpointRepoInstance;
}
/**
 * Get metrics repository instance
 */
function getMetricsRepository() {
    if (!metricsRepoInstance) {
        metricsRepoInstance = new MetricsRepository();
    }
    return metricsRepoInstance;
}
/**
 * Get search repository instance
 */
function getSearchRepository() {
    if (!searchRepoInstance) {
        searchRepoInstance = new SearchRepository();
    }
    return searchRepoInstance;
}
//# sourceMappingURL=repository.js.map