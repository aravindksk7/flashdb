/**
 * Remote Host Management API Routes
 *
 * Phase 6: Remote Host Handling
 * Endpoints for registering, validating, and managing remote hosts
 */

import { Router, Request, Response } from 'express';
import { getRemoteHostService } from '../services/remoteHostService';
import { getAuditMetricsService } from '../services/auditMetricsService';
import { getSqlClient } from '../services/sqlClient';
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
let hostStoreInitPromise: Promise<boolean> | null = null;

function parseJson<T>(value: any, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function mapHostRow(row: any): HostMetadata {
  return {
    id: row.id,
    name: row.name,
    fqdn: row.fqdn,
    accessMethod: row.accessMethod,
    sqlInstances: parseJson<string[]>(row.sqlInstances, []),
    pathMappings: parseJson<Record<string, string>>(row.pathMappings, {}),
    credentialReference: row.credentialReference || undefined,
    lastValidatedAt: row.lastValidatedAt ? new Date(row.lastValidatedAt) : undefined,
    validationState: row.validationState || 'Pending'
  };
}

async function ensureHostStore(): Promise<boolean> {
  if (!hostStoreInitPromise) {
    hostStoreInitPromise = (async () => {
      try {
        const sqlClient = getSqlClient();
        await sqlClient.execute(`
          IF OBJECT_ID(N'[dbo].[flashdb_hosts]', N'U') IS NULL
          BEGIN
            CREATE TABLE [dbo].[flashdb_hosts] (
              [id] NVARCHAR(100) NOT NULL PRIMARY KEY,
              [name] NVARCHAR(255) NOT NULL,
              [fqdn] NVARCHAR(512) NOT NULL,
              [access_method] NVARCHAR(20) NOT NULL,
              [sql_instances] NVARCHAR(MAX) NOT NULL CONSTRAINT [DF_flashdb_hosts_sql_instances] DEFAULT N'[]',
              [path_mappings] NVARCHAR(MAX) NOT NULL CONSTRAINT [DF_flashdb_hosts_path_mappings] DEFAULT N'{}',
              [credential_reference] NVARCHAR(512) NULL,
              [last_validated_at] DATETIME2 NULL,
              [validation_state] NVARCHAR(20) NOT NULL CONSTRAINT [DF_flashdb_hosts_validation_state] DEFAULT N'Pending',
              [created_at] DATETIME2 NOT NULL CONSTRAINT [DF_flashdb_hosts_created_at] DEFAULT SYSUTCDATETIME(),
              [updated_at] DATETIME2 NOT NULL CONSTRAINT [DF_flashdb_hosts_updated_at] DEFAULT SYSUTCDATETIME()
            );

            CREATE INDEX [IX_flashdb_hosts_fqdn] ON [dbo].[flashdb_hosts] ([fqdn]);
            CREATE INDEX [IX_flashdb_hosts_validation_state] ON [dbo].[flashdb_hosts] ([validation_state]);
          END
        `);
        return true;
      } catch (error: any) {
        logger.debug(`[Hosts] SQL host store unavailable; using in-memory registry: ${error.message}`);
        return false;
      }
    })();
  }

  const initialized = await hostStoreInitPromise;
  if (!initialized) {
    hostStoreInitPromise = null;
  }
  return initialized;
}

async function listStoredHosts(): Promise<HostMetadata[]> {
  if (!(await ensureHostStore())) {
    return Array.from(hostRegistry.values());
  }

  try {
    const sqlClient = getSqlClient();
    const result = await sqlClient.query<any>(`
      SELECT
        [id],
        [name],
        [fqdn],
        [access_method] AS [accessMethod],
        [sql_instances] AS [sqlInstances],
        [path_mappings] AS [pathMappings],
        [credential_reference] AS [credentialReference],
        [last_validated_at] AS [lastValidatedAt],
        [validation_state] AS [validationState]
      FROM [dbo].[flashdb_hosts]
      ORDER BY [name], [fqdn]
    `);
    const hosts = (result.recordset || []).map(mapHostRow);
    hosts.forEach(host => hostRegistry.set(host.id, host));
    return hosts;
  } catch (error: any) {
    logger.warn(`[Hosts] Failed to read SQL host store; using in-memory registry: ${error.message}`);
    return Array.from(hostRegistry.values());
  }
}

async function getStoredHost(id: string): Promise<HostMetadata | null> {
  if (await ensureHostStore()) {
    try {
      const sqlClient = getSqlClient();
      const result = await sqlClient.query<any>(`
        SELECT TOP 1
          [id],
          [name],
          [fqdn],
          [access_method] AS [accessMethod],
          [sql_instances] AS [sqlInstances],
          [path_mappings] AS [pathMappings],
          [credential_reference] AS [credentialReference],
          [last_validated_at] AS [lastValidatedAt],
          [validation_state] AS [validationState]
        FROM [dbo].[flashdb_hosts]
        WHERE [id] = @id
      `, { id });
      const row = result.recordset?.[0];
      if (row) {
        const host = mapHostRow(row);
        hostRegistry.set(host.id, host);
        return host;
      }
    } catch (error: any) {
      logger.warn(`[Hosts] Failed to read host ${id} from SQL store: ${error.message}`);
    }
  }

  return hostRegistry.get(id) || null;
}

async function saveStoredHost(host: HostMetadata): Promise<void> {
  hostRegistry.set(host.id, host);

  if (!(await ensureHostStore())) return;

  try {
    const sqlClient = getSqlClient();
    await sqlClient.execute(`
      MERGE [dbo].[flashdb_hosts] WITH (HOLDLOCK) AS target
      USING (SELECT @id AS [id]) AS source
      ON target.[id] = source.[id]
      WHEN MATCHED THEN UPDATE SET
        [name] = @name,
        [fqdn] = @fqdn,
        [access_method] = @accessMethod,
        [sql_instances] = @sqlInstances,
        [path_mappings] = @pathMappings,
        [credential_reference] = @credentialReference,
        [last_validated_at] = @lastValidatedAt,
        [validation_state] = @validationState,
        [updated_at] = SYSUTCDATETIME()
      WHEN NOT MATCHED THEN INSERT
        ([id], [name], [fqdn], [access_method], [sql_instances], [path_mappings],
         [credential_reference], [last_validated_at], [validation_state])
        VALUES
        (@id, @name, @fqdn, @accessMethod, @sqlInstances, @pathMappings,
         @credentialReference, @lastValidatedAt, @validationState);
    `, {
      id: host.id,
      name: host.name,
      fqdn: host.fqdn,
      accessMethod: host.accessMethod,
      sqlInstances: JSON.stringify(host.sqlInstances || []),
      pathMappings: JSON.stringify(host.pathMappings || {}),
      credentialReference: host.credentialReference || null,
      lastValidatedAt: host.lastValidatedAt || null,
      validationState: host.validationState || 'Pending'
    });
  } catch (error: any) {
    logger.warn(`[Hosts] Failed to persist host ${host.id}; in-memory registry still updated: ${error.message}`);
  }
}

async function deleteStoredHost(id: string): Promise<void> {
  hostRegistry.delete(id);

  if (!(await ensureHostStore())) return;

  try {
    const sqlClient = getSqlClient();
    await sqlClient.execute('DELETE FROM [dbo].[flashdb_hosts] WHERE [id] = @id', { id });
  } catch (error: any) {
    logger.warn(`[Hosts] Failed to delete host ${id} from SQL store: ${error.message}`);
  }
}

// GET /api/hosts - List all registered hosts
router.get('/', async (_req: Request, res: Response) => {
  try {
    logger.info('[Hosts] Retrieving all registered hosts');
    const hosts = await listStoredHosts();

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

    const host = await getStoredHost(id);
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

    await saveStoredHost(host);
    invalidateCache(['/hosts']);

    // Audit log
    await auditService.recordOperation({
      id: hostId,
      type: 'host-registered',
      entityId: hostId,
      status: 'completed',
      timestamp: new Date(),
      metrics: { name, fqdn, accessMethod }
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

    const host = await getStoredHost(id);
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
    if (pathMappings !== undefined) host.pathMappings = pathMappings;
    if (credentialReference !== undefined) host.credentialReference = credentialReference;

    // Clear validation cache on update
    validationCache.delete(id);
    host.validationState = 'Pending';

    await saveStoredHost(host);
    invalidateCache(['/hosts']);

    // Audit log
    await auditService.recordOperation({
      id: `update-${id}`,
      type: 'host-updated',
      entityId: id,
      status: 'completed',
      timestamp: new Date(),
      metrics: { changes: { name, fqdn, accessMethod } }
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

    const host = await getStoredHost(id);
    if (!host) {
      return res.status(404).json({
        success: false,
        message: `Host not found: ${id}`
      });
    }

    await deleteStoredHost(id);
    validationCache.delete(id);
    invalidateCache(['/hosts']);

    // Audit log
    await auditService.recordOperation({
      id: `delete-${id}`,
      type: 'host-deleted',
      entityId: id,
      status: 'completed',
      timestamp: new Date(),
      metrics: { name: host.name, fqdn: host.fqdn }
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

    const host = await getStoredHost(id);
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
        await saveStoredHost(host);

        // Cache result
        validationCache.set(id, {
          result,
          timestamp: Date.now()
        });

        return result;
      });

      res.set('Lock-Wait-Time-Ms', lockContext.waitTimeMs.toString());

      // Audit log
      await auditService.recordOperation({
        id: `validate-${id}`,
        type: 'host-validated',
        entityId: id,
        status: 'completed',
        result: validationResult.isValid ? 'success' : 'failed',
        timestamp: new Date(),
        metrics: {
          isValid: validationResult.isValid,
          capabilities: validationResult.capabilities,
          findingsCount: validationResult.findings.length
        }
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
    await auditService.recordOperation({
      id: `test-${Date.now()}`,
      type: 'host-connection-tested',
      entityId: fqdn,
      status: 'completed',
      result: testResult.isValid ? 'success' : 'failed',
      timestamp: new Date(),
      metrics: { fqdn, accessMethod, success: testResult.isValid }
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

    const host = await getStoredHost(id);
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
