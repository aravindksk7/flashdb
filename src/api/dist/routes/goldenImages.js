"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pooledPowershellService_1 = require("../services/pooledPowershellService");
const caching_1 = require("../middleware/caching");
const logger_1 = __importDefault(require("../logger"));
const router = (0, express_1.Router)();
const psService = (0, pooledPowershellService_1.getPooledPowerShellService)();
const methodAliases = {
    BACKUP_RESTORE: 'BackupRestore',
    BackupRestore: 'BackupRestore',
    REPLICA_BACKUP: 'ReplicaBackup',
    ReplicaBackup: 'ReplicaBackup',
    TABLE_BY_TABLE: 'TableByTableCopy',
    TableByTableCopy: 'TableByTableCopy'
};
const toResponseArray = (value) => {
    if (value == null)
        return [];
    const items = Array.isArray(value) ? value : [value];
    return items.filter(item => {
        if (item == null)
            return false;
        return typeof item !== 'object' || Array.isArray(item) || Object.keys(item).length > 0;
    });
};
const normalizeSelectedTables = (value) => {
    if (value == null)
        return [];
    const items = Array.isArray(value) ? value : [value];
    return items
        .map(item => String(item).trim())
        .filter(item => item.length > 0);
};
// POST - Create golden image
router.post('/', async (req, res) => {
    try {
        const { name, version, method, outputPath, backupFile, sourceConnection, destinationConnection, databaseType, databaseName, sourceDatabase, driver, authenticationMode, selectedTables } = req.body;
        if (!name || !version || !method || !outputPath) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, version, method, outputPath'
            });
        }
        const normalizedMethod = methodAliases[String(method)] || method;
        if (!['BackupRestore', 'ReplicaBackup', 'TableByTableCopy'].includes(normalizedMethod)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid method. Use BackupRestore, ReplicaBackup, or TableByTableCopy'
            });
        }
        if (normalizedMethod === 'BackupRestore' && !backupFile) {
            return res.status(400).json({
                success: false,
                message: 'BackupRestore requires backupFile'
            });
        }
        if (['ReplicaBackup', 'TableByTableCopy'].includes(normalizedMethod) && !sourceConnection) {
            return res.status(400).json({
                success: false,
                message: `${normalizedMethod} requires sourceConnection`
            });
        }
        logger_1.default.info(`Creating golden image: ${name}`);
        const params = {
            Name: name,
            Version: version,
            Method: normalizedMethod,
            OutputPath: outputPath
        };
        if (backupFile)
            params.BackupFile = backupFile;
        if (sourceConnection)
            params.SourceConnection = sourceConnection;
        if (destinationConnection)
            params.DestinationConnection = destinationConnection;
        if (databaseType)
            params.DatabaseType = databaseType;
        if (databaseName)
            params.DatabaseName = databaseName;
        if (sourceDatabase)
            params.SourceDatabase = sourceDatabase;
        if (driver)
            params.Driver = driver;
        if (authenticationMode)
            params.AuthenticationMode = authenticationMode;
        const selectedTableList = normalizeSelectedTables(selectedTables);
        if (selectedTableList.length > 0)
            params.SelectedTables = selectedTableList;
        const image = await psService.executeCommand('New-FlashdbGoldenImage', params);
        (0, caching_1.invalidateCache)(['/golden-images', '/metrics']);
        return res.status(201).json({
            success: true,
            data: image,
            message: 'Golden image created successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error creating golden image: ${error.message}`);
        return res.status(400).json({ success: false, message: error.message });
    }
});
// POST - Explore source database schema
router.post('/schema', async (req, res) => {
    try {
        const { sourceConnection, databaseName, sourceDatabase, databaseType } = req.body;
        if (!sourceConnection) {
            return res.status(400).json({
                success: false,
                message: 'sourceConnection is required'
            });
        }
        if (databaseType && databaseType !== 'sql-server') {
            return res.status(400).json({
                success: false,
                message: 'Schema exploration currently supports SQL Server only'
            });
        }
        logger_1.default.info('Exploring source database schema');
        const schema = await psService.executeCommand('Get-FlashdbDatabaseSchema', {
            SourceConnection: sourceConnection,
            DatabaseName: databaseName,
            SourceDatabase: sourceDatabase
        });
        return res.json({
            success: true,
            data: schema,
            message: 'Database schema retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error exploring database schema: ${error.message}`);
        return res.status(400).json({ success: false, message: error.message });
    }
});
// GET - List golden images
router.get('/', async (_req, res) => {
    try {
        // Try to update sizes for old golden images, but don't fail if this errors
        try {
            await psService.executeCommand('Update-FlashdbGoldenImageSizes', {});
        }
        catch (sizeError) {
            logger_1.default.warn(`Failed to update golden image sizes (non-blocking): ${sizeError.message}`);
        }
        // Get all golden images
        const images = await psService.executeCommand('Get-FlashdbGoldenImage', {});
        return res.json({
            success: true,
            data: toResponseArray(images)
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving golden images: ${error.message}`);
        return res.status(500).json({ success: false, message: error.message });
    }
});
// GET - Get golden image by ID
router.get('/:imageId', async (req, res) => {
    try {
        const image = await psService.executeCommand('Get-FlashdbGoldenImage', {
            Id: req.params.imageId
        });
        if (!image) {
            return res.status(404).json({
                success: false,
                message: `Golden image not found: ${req.params.imageId}`
            });
        }
        return res.json({ success: true, data: image });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving golden image: ${error.message}`);
        return res.status(500).json({ success: false, message: error.message });
    }
});
// PUT - Update golden image metadata
router.put('/:imageId', async (req, res) => {
    try {
        const allowedFields = [
            'name',
            'version',
            'method',
            'outputPath',
            'backupFile',
            'sourceConnection',
            'destinationConnection',
            'databaseType',
            'databaseName',
            'sourceDatabase',
            'driver',
            'authenticationMode',
            'status'
        ];
        const hasUpdate = allowedFields.some(field => req.body[field] !== undefined && req.body[field] !== null);
        if (!hasUpdate) {
            return res.status(400).json({
                success: false,
                message: `At least one update field is required: ${allowedFields.join(', ')}`
            });
        }
        const params = {
            GoldenImageId: req.params.imageId
        };
        const fieldMap = {
            name: 'Name',
            version: 'Version',
            method: 'Method',
            outputPath: 'OutputPath',
            backupFile: 'BackupFile',
            sourceConnection: 'SourceConnection',
            destinationConnection: 'DestinationConnection',
            databaseType: 'DatabaseType',
            databaseName: 'DatabaseName',
            sourceDatabase: 'SourceDatabase',
            driver: 'Driver',
            authenticationMode: 'AuthenticationMode',
            status: 'Status'
        };
        for (const field of allowedFields) {
            if (req.body[field] !== undefined && req.body[field] !== null) {
                params[fieldMap[field]] = field === 'method'
                    ? methodAliases[String(req.body[field])] || req.body[field]
                    : req.body[field];
            }
        }
        if (params.Method && !['BackupRestore', 'ReplicaBackup', 'TableByTableCopy'].includes(params.Method)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid method. Use BackupRestore, ReplicaBackup, or TableByTableCopy'
            });
        }
        logger_1.default.info(`Updating golden image: ${req.params.imageId}`);
        const image = await psService.executeCommand('Update-FlashdbGoldenImage', params);
        (0, caching_1.invalidateCache)(['/golden-images', '/metrics']);
        return res.json({
            success: true,
            data: image,
            message: 'Golden image updated successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error updating golden image: ${error.message}`);
        const statusCode = /not found/i.test(error.message) ? 404 : 400;
        return res.status(statusCode).json({ success: false, message: error.message });
    }
});
// DELETE - Delete golden image
router.delete('/:imageId', async (req, res) => {
    try {
        const imageId = req.params.imageId;
        logger_1.default.info(`Deleting golden image: ${imageId}`);
        const result = await psService.executeCommand('Remove-FlashdbGoldenImage', {
            GoldenImageId: imageId,
            Force: req.query.force === 'true'
        });
        (0, caching_1.invalidateCache)(['/golden-images', '/clones', '/checkpoints', '/metrics']);
        return res.json({
            success: true,
            data: result,
            message: 'Golden image deleted successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error deleting golden image: ${error.message}`);
        const statusCode = /not found/i.test(error.message) ? 404 : 400;
        return res.status(statusCode).json({
            success: false,
            message: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=goldenImages.js.map