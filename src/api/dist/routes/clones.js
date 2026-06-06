"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pooledPowershellService_1 = require("../services/pooledPowershellService");
const logger_1 = __importDefault(require("../logger"));
const router = (0, express_1.Router)();
const psService = (0, pooledPowershellService_1.getPooledPowerShellService)();
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
// POST - Create clone
router.post('/', async (req, res) => {
    try {
        const { goldenImageId, cloneName, instancePath, storagePath, databaseType, databaseName, compressionEnabled, attachAfterCreate } = req.body;
        if (!goldenImageId || !cloneName || !instancePath || !storagePath) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: goldenImageId, cloneName, instancePath, storagePath'
            });
        }
        logger_1.default.info(`Creating clone: ${cloneName}`);
        const params = {
            GoldenImageId: goldenImageId,
            CloneName: cloneName,
            InstancePath: instancePath,
            StoragePath: storagePath
        };
        if (databaseType)
            params.DatabaseType = databaseType;
        if (databaseName)
            params.DatabaseName = databaseName;
        if (compressionEnabled !== undefined)
            params.CompressionEnabled = compressionEnabled;
        const clone = await psService.executeCommand('New-FlashdbClone', params);
        if (attachAfterCreate === true && clone && typeof clone === 'object') {
            await psService.executeCommandRaw('Connect-FlashdbClone', {
                CloneId: clone.Id || clone.id,
                InstancePath: instancePath
            });
            clone.Status = 'Attached';
        }
        return res.status(201).json({
            success: true,
            data: clone,
            message: 'Clone created successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error creating clone: ${error.message}`);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
});
// GET - List all clones
router.get('/', async (_req, res) => {
    try {
        logger_1.default.info('Retrieving all clones');
        const clones = await psService.executeCommand('Get-FlashdbClone', {});
        return res.json({
            success: true,
            data: toResponseArray(clones),
            message: 'Clones retrieved successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving clones: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
// GET - Get clone by ID
router.get('/:cloneId', async (req, res) => {
    try {
        const { cloneId } = req.params;
        logger_1.default.info(`Retrieving clone: ${cloneId}`);
        const clone = await psService.executeCommand('Get-FlashdbClone', {
            CloneId: cloneId
        });
        if (!clone) {
            return res.status(404).json({
                success: false,
                message: `Clone not found: ${cloneId}`
            });
        }
        return res.json({
            success: true,
            data: clone
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving clone: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: error.message
        });
    }
});
// POST - Attach clone
router.post('/:cloneId/attach', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const { instancePath } = req.body;
        if (!instancePath) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: instancePath'
            });
        }
        logger_1.default.info(`Attaching clone ${cloneId} to ${instancePath}`);
        await psService.executeCommandRaw('Connect-FlashdbClone', {
            CloneId: cloneId,
            InstancePath: instancePath
        });
        return res.json({
            success: true,
            message: 'Clone attached successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error attaching clone: ${error.message}`);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
});
// POST - Detach clone
router.post('/:cloneId/detach', async (req, res) => {
    try {
        const { cloneId } = req.params;
        logger_1.default.info(`Detaching clone: ${cloneId}`);
        await psService.executeCommandRaw('Disconnect-FlashdbClone', {
            CloneId: cloneId
        });
        return res.json({
            success: true,
            message: 'Clone detached successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error detaching clone: ${error.message}`);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
});
// DELETE - Remove clone
router.delete('/:cloneId', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const { deleteVhdx } = req.query;
        logger_1.default.info(`Deleting clone: ${cloneId}`);
        await psService.executeCommandRaw('Remove-FlashdbClone', {
            CloneId: cloneId,
            DeleteVhdx: deleteVhdx === 'true'
        });
        return res.json({
            success: true,
            message: 'Clone deleted successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error deleting clone: ${error.message}`);
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=clones.js.map