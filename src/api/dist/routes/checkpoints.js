"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const powershellService_1 = require("../services/powershellService");
const logger_1 = __importDefault(require("../logger"));
const router = (0, express_1.Router)({ mergeParams: true });
const psService = new powershellService_1.PowerShellService();
// POST - Create checkpoint
router.post('/', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const { checkpointName, phase, description, force } = req.body;
        if (!checkpointName) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: checkpointName'
            });
        }
        logger_1.default.info(`Creating checkpoint for clone ${cloneId}: ${checkpointName}`);
        const checkpoint = await psService.executeCommand('New-FlashdbCheckpoint', {
            CloneId: cloneId,
            CheckpointName: checkpointName,
            Phase: phase || 'manual',
            Description: description,
            Force: force || false
        });
        return res.status(201).json({
            success: true,
            data: checkpoint,
            message: 'Checkpoint created successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error creating checkpoint: ${error.message}`);
        return res.status(400).json({ success: false, message: error.message });
    }
});
// GET - List checkpoints for clone
router.get('/', async (req, res) => {
    try {
        const { cloneId } = req.params;
        const checkpoints = await psService.executeCommand('Get-FlashdbCheckpoint', {
            CloneId: cloneId
        });
        return res.json({
            success: true,
            data: Array.isArray(checkpoints) ? checkpoints : [checkpoints]
        });
    }
    catch (error) {
        logger_1.default.error(`Error retrieving checkpoints: ${error.message}`);
        return res.status(500).json({ success: false, message: error.message });
    }
});
// POST - Restore checkpoint
router.post('/:checkpointId/restore', async (req, res) => {
    try {
        const { cloneId, checkpointId } = req.params;
        const { reattachAfter } = req.body;
        logger_1.default.info(`Restoring checkpoint ${checkpointId} for clone ${cloneId}`);
        await psService.executeCommandRaw('Restore-FlashdbCheckpoint', {
            CloneId: cloneId,
            CheckpointId: checkpointId,
            ReattachAfter: reattachAfter !== false
        });
        return res.json({
            success: true,
            message: 'Checkpoint restored successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error restoring checkpoint: ${error.message}`);
        return res.status(400).json({ success: false, message: error.message });
    }
});
// PATCH - Update checkpoint (labels, favorite)
router.patch('/:checkpointId', async (req, res) => {
    try {
        const { cloneId, checkpointId } = req.params;
        const { isFavorite, labels } = req.body;
        await psService.executeCommandRaw('Set-FlashdbCheckpoint', {
            CloneId: cloneId,
            CheckpointId: checkpointId,
            IsFavorite: isFavorite,
            Labels: labels
        });
        return res.json({
            success: true,
            message: 'Checkpoint updated successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error updating checkpoint: ${error.message}`);
        return res.status(400).json({ success: false, message: error.message });
    }
});
// DELETE - Delete checkpoint
router.delete('/:checkpointId', async (req, res) => {
    try {
        const { cloneId, checkpointId } = req.params;
        await psService.executeCommandRaw('Remove-FlashdbCheckpoint', {
            CloneId: cloneId,
            CheckpointId: checkpointId
        });
        return res.json({
            success: true,
            message: 'Checkpoint deleted successfully'
        });
    }
    catch (error) {
        logger_1.default.error(`Error deleting checkpoint: ${error.message}`);
        return res.status(400).json({ success: false, message: error.message });
    }
});
exports.default = router;
//# sourceMappingURL=checkpoints.js.map