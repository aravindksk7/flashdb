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
/**
 * POST /api/search/operations
 * Search operation logs with advanced filtering
 *
 * Query Parameters:
 * - keyword: Search keyword
 * - dateFrom: Start date (ISO format)
 * - dateTo: End date (ISO format)
 * - status: Operation status (ready, attached, detached, failed, in-progress)
 * - method: Operation method (BackupRestore, ReplicaBackup, TableByTableCopy)
 * - operator: Filter by operator/user
 * - limit: Results per page (default: 100)
 * - offset: Pagination offset (default: 0)
 * - sortBy: Sort field (createdAt, updatedAt, name, status)
 * - sortOrder: Sort direction (asc, desc)
 * - useRegex: Use regex pattern matching (default: false)
 */
router.post('/operations', async (req, res) => {
    try {
        const { keyword, dateFrom, dateTo, status, method, operator, limit = 100, offset = 0, sortBy = 'createdAt', sortOrder = 'desc', useRegex = false } = req.body;
        logger_1.default.info(`Searching operations with filters: keyword=${keyword}, status=${status}, method=${method}`);
        // Validate pagination parameters
        if (limit < 1 || limit > 1000) {
            return res.status(400).json({
                success: false,
                message: 'Limit must be between 1 and 1000'
            });
        }
        if (offset < 0) {
            return res.status(400).json({
                success: false,
                message: 'Offset cannot be negative'
            });
        }
        // Build parameters for PowerShell command
        const psParams = {
            Limit: limit,
            Offset: offset,
            SortBy: sortBy,
            SortOrder: sortOrder,
            UseRegex: useRegex
        };
        if (keyword)
            psParams.Keyword = keyword;
        if (dateFrom)
            psParams.DateFrom = dateFrom;
        if (dateTo)
            psParams.DateTo = dateTo;
        if (status)
            psParams.Status = status;
        if (method)
            psParams.Method = method;
        if (operator)
            psParams.Operator = operator;
        const results = await psService.executeCommand('Search-FlashdbOperations', psParams);
        const resultArray = Array.isArray(results) ? results : (results ? [results] : []);
        return res.json({
            success: true,
            data: resultArray,
            pagination: {
                total: resultArray.length,
                limit,
                offset
            },
            filters: {
                keyword,
                dateFrom,
                dateTo,
                status,
                method,
                operator
            }
        });
    }
    catch (error) {
        logger_1.default.error(`Error searching operations: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: `Search failed: ${error.message}`
        });
    }
});
/**
 * POST /api/search/clones
 * Search clones with advanced filtering
 *
 * Query Parameters:
 * - keyword: Search keyword
 * - goldenImageId: Filter by golden image
 * - status: Clone status (ready, attached, detached, failed, orphaned)
 * - createdFrom: Start creation date (ISO format)
 * - createdTo: End creation date (ISO format)
 * - tags: Array of tags (all must match)
 * - limit: Results per page (default: 100)
 * - offset: Pagination offset (default: 0)
 * - sortBy: Sort field (createdAt, updatedAt, name, size)
 * - sortOrder: Sort direction (asc, desc)
 * - useRegex: Use regex pattern matching (default: false)
 */
router.post('/clones', async (req, res) => {
    try {
        const { keyword, goldenImageId, status, createdFrom, createdTo, tags, limit = 100, offset = 0, sortBy = 'createdAt', sortOrder = 'desc', useRegex = false } = req.body;
        logger_1.default.info(`Searching clones with filters: keyword=${keyword}, status=${status}, goldenImage=${goldenImageId}`);
        // Validate pagination parameters
        if (limit < 1 || limit > 1000) {
            return res.status(400).json({
                success: false,
                message: 'Limit must be between 1 and 1000'
            });
        }
        if (offset < 0) {
            return res.status(400).json({
                success: false,
                message: 'Offset cannot be negative'
            });
        }
        // Build parameters for PowerShell command
        const psParams = {
            Limit: limit,
            Offset: offset,
            SortBy: sortBy,
            SortOrder: sortOrder,
            UseRegex: useRegex
        };
        if (keyword)
            psParams.Keyword = keyword;
        if (goldenImageId)
            psParams.GoldenImageId = goldenImageId;
        if (status)
            psParams.Status = status;
        if (createdFrom)
            psParams.CreatedFrom = createdFrom;
        if (createdTo)
            psParams.CreatedTo = createdTo;
        if (tags && tags.length > 0)
            psParams.Tags = tags;
        const results = await psService.executeCommand('Filter-FlashdbClones', psParams);
        const resultArray = Array.isArray(results) ? results : (results ? [results] : []);
        return res.json({
            success: true,
            data: resultArray,
            pagination: {
                total: resultArray.length,
                limit,
                offset
            },
            filters: {
                keyword,
                goldenImageId,
                status,
                createdFrom,
                createdTo,
                tags
            }
        });
    }
    catch (error) {
        logger_1.default.error(`Error searching clones: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: `Search failed: ${error.message}`
        });
    }
});
/**
 * POST /api/search/checkpoints
 * Search checkpoints with advanced filtering
 *
 * Query Parameters:
 * - keyword: Search keyword
 * - cloneId: Filter by clone ID
 * - phase: Checkpoint phase (initial, in-progress, complete, reverted, failed)
 * - createdFrom: Start creation date (ISO format)
 * - createdTo: End creation date (ISO format)
 * - limit: Results per page (default: 100)
 * - offset: Pagination offset (default: 0)
 * - sortBy: Sort field (createdAt, name, cloneId, phase)
 * - sortOrder: Sort direction (asc, desc)
 * - useRegex: Use regex pattern matching (default: false)
 */
router.post('/checkpoints', async (req, res) => {
    try {
        const { keyword, cloneId, phase, createdFrom, createdTo, limit = 100, offset = 0, sortBy = 'createdAt', sortOrder = 'desc', useRegex = false } = req.body;
        logger_1.default.info(`Searching checkpoints with filters: keyword=${keyword}, cloneId=${cloneId}, phase=${phase}`);
        // Validate pagination parameters
        if (limit < 1 || limit > 1000) {
            return res.status(400).json({
                success: false,
                message: 'Limit must be between 1 and 1000'
            });
        }
        if (offset < 0) {
            return res.status(400).json({
                success: false,
                message: 'Offset cannot be negative'
            });
        }
        // Build parameters for PowerShell command
        const psParams = {
            Limit: limit,
            Offset: offset,
            SortBy: sortBy,
            SortOrder: sortOrder,
            UseRegex: useRegex
        };
        if (keyword)
            psParams.Keyword = keyword;
        if (cloneId)
            psParams.CloneId = cloneId;
        if (phase)
            psParams.Phase = phase;
        if (createdFrom)
            psParams.CreatedFrom = createdFrom;
        if (createdTo)
            psParams.CreatedTo = createdTo;
        const results = await psService.executeCommand('Filter-FlashdbCheckpoints', psParams);
        const resultArray = Array.isArray(results) ? results : (results ? [results] : []);
        return res.json({
            success: true,
            data: resultArray,
            pagination: {
                total: resultArray.length,
                limit,
                offset
            },
            filters: {
                keyword,
                cloneId,
                phase,
                createdFrom,
                createdTo
            }
        });
    }
    catch (error) {
        logger_1.default.error(`Error searching checkpoints: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: `Search failed: ${error.message}`
        });
    }
});
/**
 * GET /api/search/suggestions
 * Get autocomplete suggestions for clone and golden image names
 *
 * Query Parameters:
 * - q: Search query (required)
 * - type: Type to search (clone, golden-image, all)
 * - limit: Maximum suggestions (default: 20)
 */
router.get('/suggestions', async (req, res) => {
    try {
        const { q, type = 'all', limit = 20 } = req.query;
        if (!q) {
            return res.status(400).json({
                success: false,
                message: 'Search query (q) is required'
            });
        }
        const limitNum = Math.min(parseInt(limit) || 20, 100);
        logger_1.default.info(`Getting search suggestions for query: ${q}, type: ${type}`);
        const suggestions = await psService.executeCommand('Get-FlashdbSearchSuggestions', {
            Query: String(q),
            Type: String(type),
            Limit: limitNum
        });
        const suggestionArray = Array.isArray(suggestions) ? suggestions : (suggestions ? [suggestions] : []);
        return res.json({
            success: true,
            data: suggestionArray,
            query: q,
            type,
            count: suggestionArray.length
        });
    }
    catch (error) {
        logger_1.default.error(`Error getting search suggestions: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: `Failed to get suggestions: ${error.message}`
        });
    }
});
/**
 * POST /api/search/advanced
 * Advanced combined search across operations, clones, and checkpoints
 *
 * Body:
 * - keyword: Search keyword (required)
 * - searchIn: Array of types to search (operations, clones, checkpoints)
 * - dateFrom: Start date
 * - dateTo: End date
 * - limit: Results per page (default: 50)
 * - offset: Pagination offset (default: 0)
 */
router.post('/advanced', async (req, res) => {
    try {
        const { keyword, searchIn = ['operations', 'clones', 'checkpoints'], dateFrom, dateTo, limit = 50, offset = 0 } = req.body;
        if (!keyword) {
            return res.status(400).json({
                success: false,
                message: 'Keyword is required'
            });
        }
        logger_1.default.info(`Running advanced search with keyword: ${keyword} across ${searchIn.join(', ')}`);
        const results = {
            operations: [],
            clones: [],
            checkpoints: []
        };
        // Search operations
        if (searchIn.includes('operations')) {
            try {
                const opResults = await psService.executeCommand('Search-FlashdbOperations', {
                    Keyword: keyword,
                    DateFrom: dateFrom,
                    DateTo: dateTo,
                    Limit: limit,
                    Offset: offset
                });
                results.operations = Array.isArray(opResults) ? opResults : (opResults ? [opResults] : []);
            }
            catch (error) {
                logger_1.default.warn(`Error searching operations: ${error.message}`);
            }
        }
        // Search clones
        if (searchIn.includes('clones')) {
            try {
                const cloneResults = await psService.executeCommand('Filter-FlashdbClones', {
                    Keyword: keyword,
                    CreatedFrom: dateFrom,
                    CreatedTo: dateTo,
                    Limit: limit,
                    Offset: offset
                });
                results.clones = Array.isArray(cloneResults) ? cloneResults : (cloneResults ? [cloneResults] : []);
            }
            catch (error) {
                logger_1.default.warn(`Error searching clones: ${error.message}`);
            }
        }
        // Search checkpoints
        if (searchIn.includes('checkpoints')) {
            try {
                const cpResults = await psService.executeCommand('Filter-FlashdbCheckpoints', {
                    Keyword: keyword,
                    CreatedFrom: dateFrom,
                    CreatedTo: dateTo,
                    Limit: limit,
                    Offset: offset
                });
                results.checkpoints = Array.isArray(cpResults) ? cpResults : (cpResults ? [cpResults] : []);
            }
            catch (error) {
                logger_1.default.warn(`Error searching checkpoints: ${error.message}`);
            }
        }
        return res.json({
            success: true,
            data: results,
            summary: {
                operationCount: results.operations.length,
                cloneCount: results.clones.length,
                checkpointCount: results.checkpoints.length,
                totalResults: results.operations.length + results.clones.length + results.checkpoints.length
            },
            keyword,
            searchIn
        });
    }
    catch (error) {
        logger_1.default.error(`Error in advanced search: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: `Advanced search failed: ${error.message}`
        });
    }
});
exports.default = router;
//# sourceMappingURL=search.js.map