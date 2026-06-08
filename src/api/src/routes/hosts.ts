/**
 * Remote Host Management API Routes
 *
 * Phase 6: Remote Host Handling
 * Endpoints for registering, validating, and managing remote hosts
 */

import { Router, Request, Response } from 'express';
import { getRemoteHostService } from '../services/remoteHostService';
import { getAuditMetricsService } from '../services/auditMetricsService';
import logger from '../logger';
import { invalidateCache } from '../middleware/caching';
import { withLock, getLockInfo } from '../middleware/lockMiddleware';
import { HostMetadata } from '../types/providerContract';

const router = Router();
const hostService = getRemoteHostService();
const auditService = getAuditMetricsService();

// In-memory host registry (would be replaced with database in production)
const hostRegistry = new Map<string, HostMetadata>();
const validationCache = new Map<string, { result: any; timestamp: number }>();
const VALIDATION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// GET /api/hosts - List all registered hosts
router.get('/', async (_req: Request, res: Response) => {
  try {
    logger.info('[Hosts] Retrieving all registered hosts');
    const hosts = Array.from(hostRegistry.values());

    return res.json({
      success: true,
      data: hosts,
      message: `Retrieved ${hosts.length} registered host(s)`
    });
  } catch (error: any) {
    logger.error(`[Hosts] Error retrieving hosts: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/hosts/:id - Get host details
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    logger.info(`[Hosts] Retrieving host: ${id}`);

    const host = hostRegistry.get(id);
    if (!host) {
      return res.status(404).json({
        success: false,
        message: `Host not found: ${id}`
      });
    }

    return res.json({
      success: true,
      data: host,
      message: 'Host retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`[Hosts] Error retrieving host: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/hosts - Register new host
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, fqdn, accessMethod, pathMappings, credentialReference } = req.body;

    if (!name || !fqdn || !accessMethod) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, fqdn, accessMethod'
      });
    }

    if (!['Local', 'WinRM', 'SSH'].includes(accessMethod)) {
      return res.status(400).json({
        success: false,
        message: `Invalid access method: ${accessMethod}. Must be Local, WinRM, or SSH`
      });
    }

    logger.info(`[Hosts] Registering new host: ${name} (${fqdn})`);

    const hostId = `host-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const host: HostMetadata = {
      id: hostId,
      name,
      fqdn,
      accessMethod,
      pathMappings: pathMappings || {},
      credentialReference: credentialReference || undefined,
      validationState: 'Pending'
    };

    hostRegistry.set(hostId, host);
    invalidateCache(['/hosts']);

    // Audit log
    auditService.recordEvent('HostRegistered', {
      hostId,
      name,
      fqdn,
      accessMethod
    });

    return res.status(201).json({
      success: true,
      data: host,
      message: 'Host registered successfully'
    });
  } catch (error: any) {
    logger.error(`[Hosts] Error registering host: ${error.message}`);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// PUT /api/hosts/:id - Update host configuration
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, fqdn, accessMethod, pathMappings, credentialReference } = req.body;

    logger.info(`[Hosts] Updating host: ${id}`);

    const host = hostRegistry.get(id);
    if (!host) {
      return res.status(404).json({
        success: false,
        message: `Host not found: ${id}`
      });
    }

    // Validate access method if provided
    if (accessMethod && !['Local', 'WinRM', 'SSH'].includes(accessMethod)) {
      return res.status(400).json({
        success: false,
        message: `Invalid access method: ${accessMethod}`
      });
    }

    // Update fields
    if (name) host.name = name;
    if (fqdn) host.fqdn = fqdn;
    if (accessMethod) host.accessMethod = accessMethod;
    if (pathMappings) host.pathMappings = pathMappings;
    if (credentialReference !== undefined) host.credentialReference = credentialReference;

    // Clear validation cache on update
    validationCache.delete(id);
    host.validationState = 'Pending';

    hostRegistry.set(id, host);
    invalidateCache(['/hosts']);

    // Audit log
    auditService.recordEvent('HostUpdated', {
      hostId: id,
      changes: { name, fqdn, accessMethod }
    });

    return res.json({
      success: true,
      data: host,
      message: 'Host updated successfully'
    });
  } catch (error: any) {
    logger.error(`[Hosts] Error updating host: ${error.message}`);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// DELETE /api/hosts/:id - Delete host
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    logger.info(`[Hosts] Deleting host: ${id}`);

    const host = hostRegistry.get(id);
    if (!host) {
      return res.status(404).json({
        success: false,
        message: `Host not found: ${id}`
      });
    }

    hostRegistry.delete(id);
    validationCache.delete(id);
    invalidateCache(['/hosts']);

    // Audit log
    auditService.recordEvent('HostDeleted', {
      hostId: id,
      name: host.name,
      fqdn: host.fqdn
    });

    return res.json({
      success: true,
      message: 'Host deleted successfully'
    });
  } catch (error: any) {
    logger.error(`[Hosts] Error deleting host: ${error.message}`);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/hosts/:id/validate - Validate host connectivity
router.post('/:id/validate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    logger.info(`[Hosts] Validating host: ${id}`);

    const host = hostRegistry.get(id);
    if (!host) {
      return res.status(404).json({
        success: false,
        message: `Host not found: ${id}`
      });
    }

    // Use lock to prevent concurrent validation of same host
    const lockResourceId = `host-validation:${id}`;

    try {
      const { result: validationResult, lockContext } = await withLock(lockResourceId, async () => {
        // Check cache first
        const cached = validationCache.get(id);
        if (cached && Date.now() - cached.timestamp < VALIDATION_CACHE_TTL) {
          logger.debug(`[Hosts] Using cached validation for host: ${id}`);
          return cached.result;
        }

        // Perform actual validation
        const result = await hostService.validateHost(id, host);

        // Update host with validation state
        host.lastValidatedAt = new Date();
        host.validationState = result.isValid ? 'Valid' : 'Invalid';
        hostRegistry.set(id, host);

        // Cache result
        validationCache.set(id, {
          result,
          timestamp: Date.now()
        });

        return result;
      });

      res.set('Lock-Wait-Time-Ms', lockContext.waitTimeMs.toString());

      // Audit log
      auditService.recordEvent('HostValidated', {
        hostId: id,
        isValid: validationResult.isValid,
        capabilities: validationResult.capabilities,
        findingsCount: validationResult.findings.length
      });

      return res.json({
        success: true,
        data: validationResult,
        message: `Host validation ${validationResult.isValid ? 'succeeded' : 'failed'}`
      });
    } catch (error: any) {
      if (error.message.includes('LOCK_CONFLICT')) {
        logger.warn(`[Hosts] Validation blocked - resource locked: ${lockResourceId}`);
        const lockInfo = await getLockInfo(lockResourceId);
        return res.status(409).json({
          success: false,
          message: 'Host validation is already in progress',
          lockInfo
        });
      }
      throw error;
    }
  } catch (error: any) {
    logger.error(`[Hosts] Error validating host: ${error.message}`);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// POST /api/hosts/test - Test host before saving
router.post('/test', async (req: Request, res: Response) => {
  try {
    const { fqdn, accessMethod, credentialReference } = req.body;

    if (!fqdn || !accessMethod) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: fqdn, accessMethod'
      });
    }

    logger.info(`[Hosts] Testing host connection: ${fqdn} via ${accessMethod}`);

    // Create temporary host metadata for testing
    const tempHost: HostMetadata = {
      id: 'test-temp',
      name: 'Test Host',
      fqdn,
      accessMethod,
      credentialReference: credentialReference || undefined
    };

    const testResult = await hostService.validateHost('test-temp', tempHost);

    // Audit log
    auditService.recordEvent('HostConnectionTested', {
      fqdn,
      accessMethod,
      success: testResult.isValid
    });

    return res.json({
      success: testResult.isValid,
      data: testResult,
      message: testResult.isValid ? 'Host connection test succeeded' : 'Host connection test failed'
    });
  } catch (error: any) {
    logger.error(`[Hosts] Error testing host: ${error.message}`);
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/hosts/:id/status - Get last validation status
router.get('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    logger.info(`[Hosts] Getting validation status for host: ${id}`);

    const host = hostRegistry.get(id);
    if (!host) {
      return res.status(404).json({
        success: false,
        message: `Host not found: ${id}`
      });
    }

    const cached = validationCache.get(id);
    const status = {
      hostId: id,
      validationState: host.validationState || 'Pending',
      lastValidatedAt: host.lastValidatedAt,
      isCached: !!cached,
      cacheAge: cached ? Date.now() - cached.timestamp : null,
      cachedResult: cached?.result || null
    };

    return res.json({
      success: true,
      data: status,
      message: 'Host status retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`[Hosts] Error getting host status: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
