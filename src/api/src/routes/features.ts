import { Router, Request, Response } from 'express';
import logger from '../logger';

const router = Router();

interface FeatureFlag {
  name: string;
  displayName: string;
  description: string;
  status: 'enabled' | 'disabled' | 'beta' | 'deprecated';
  rolloutPercentage: number;
  phase: string;
  enabled: boolean;
  createdAt: string;
  enabledAt?: string;
  disabledAt?: string;
  rolloutStartedAt?: string;
  expectedCompletionDate?: string;
  usersAffected: number;
  recentlyChanged: boolean;
  badges: ('NEW' | 'BETA' | 'DEPRECATED')[];
}

interface FeatureFlagHistory {
  timestamp: string;
  action: 'enabled' | 'disabled' | 'rollout_updated';
  previousValue: number;
  newValue: number;
  changedBy: string;
}

interface FeatureFlagsResponse {
  totalFlags: number;
  enabledCount: number;
  betaCount: number;
  disabledCount: number;
  flags: FeatureFlag[];
  lastUpdated: string;
}

/**
 * GET /api/features
 * List all feature flags and their rollout status
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    logger.info('Retrieving all feature flags');

    const flagsResponse: FeatureFlagsResponse = {
      totalFlags: 8,
      enabledCount: 5,
      betaCount: 2,
      disabledCount: 1,
      flags: [
        {
          name: 'FLASHDB_ENABLE_METADATA_SYSTEM',
          displayName: 'Metadata System',
          description: 'Enable enhanced metadata tracking and state management',
          status: 'enabled',
          rolloutPercentage: 100,
          phase: 'Phase 5',
          enabled: true,
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          enabledAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          usersAffected: 0,
          recentlyChanged: false,
          badges: []
        },
        {
          name: 'FLASHDB_ENABLE_REPAIR',
          displayName: 'Clone Repair & Validation',
          description: 'Enable automatic clone repair and validation capabilities',
          status: 'beta',
          rolloutPercentage: 65,
          phase: 'Phase 8',
          enabled: true,
          createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
          enabledAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          rolloutStartedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
          expectedCompletionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          usersAffected: 65,
          recentlyChanged: true,
          badges: ['BETA']
        },
        {
          name: 'FLASHDB_ENABLE_CONTRACT_COMPLIANCE',
          displayName: 'Contract Compliance',
          description: 'Monitor and report provider contract compliance metrics',
          status: 'beta',
          rolloutPercentage: 30,
          phase: 'Phase 1',
          enabled: true,
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          enabledAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          rolloutStartedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          expectedCompletionDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          usersAffected: 30,
          recentlyChanged: true,
          badges: ['NEW', 'BETA']
        },
        {
          name: 'FLASHDB_ENABLE_RELEASE_GATES',
          displayName: 'Release Gates',
          description: 'Manage and track release gate progress and blockers',
          status: 'beta',
          rolloutPercentage: 20,
          phase: 'Phase 9',
          enabled: true,
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          enabledAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          rolloutStartedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          expectedCompletionDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
          usersAffected: 20,
          recentlyChanged: true,
          badges: ['NEW', 'BETA']
        },
        {
          name: 'FLASHDB_ENABLE_FEATURE_FLAGS',
          displayName: 'Feature Flags Management',
          description: 'Control and monitor feature flag rollout percentages',
          status: 'beta',
          rolloutPercentage: 15,
          phase: 'Phase 10',
          enabled: true,
          createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          enabledAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          rolloutStartedAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
          expectedCompletionDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000).toISOString(),
          usersAffected: 15,
          recentlyChanged: true,
          badges: ['NEW', 'BETA']
        },
        {
          name: 'FLASHDB_ENABLE_ADVANCED_POOLING',
          displayName: 'Advanced Connection Pooling',
          description: 'Enable advanced connection pool management features',
          status: 'enabled',
          rolloutPercentage: 100,
          phase: 'Phase 4',
          enabled: true,
          createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
          enabledAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
          usersAffected: 0,
          recentlyChanged: false,
          badges: []
        },
        {
          name: 'FLASHDB_ENABLE_EXPERIMENTAL_CACHING',
          displayName: 'Experimental Caching',
          description: 'Beta caching layer for improved performance',
          status: 'disabled',
          rolloutPercentage: 0,
          phase: 'Phase 11',
          enabled: false,
          createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          disabledAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
          usersAffected: 0,
          recentlyChanged: false,
          badges: []
        },
        {
          name: 'FLASHDB_ENABLE_TELEMETRY_V2',
          displayName: 'Telemetry v2',
          description: 'Enhanced telemetry and analytics',
          status: 'enabled',
          rolloutPercentage: 100,
          phase: 'Phase 6',
          enabled: true,
          createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
          enabledAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          usersAffected: 0,
          recentlyChanged: false,
          badges: []
        }
      ],
      lastUpdated: new Date().toISOString()
    };

    return res.json({
      success: true,
      data: flagsResponse,
      message: 'Feature flags retrieved successfully'
    });
  } catch (error: any) {
    logger.error(`Error retrieving feature flags: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/features/:flagName
 * Get details about a specific feature flag
 */
router.get('/:flagName', async (req: Request, res: Response) => {
  try {
    const { flagName } = req.params;
    logger.info(`Retrieving details for feature flag: ${flagName}`);

    // Mock feature flag details
    const flagDetails = {
      name: flagName,
      displayName: flagName.replace(/FLASHDB_ENABLE_/g, '').replace(/_/g, ' '),
      description: 'Feature flag details',
      status: 'beta',
      rolloutPercentage: 50,
      phase: 'Phase X',
      enabled: true,
      createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      enabledAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      rolloutStartedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      expectedCompletionDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      usersAffected: 50,
      recentlyChanged: true,
      badges: ['BETA']
    };

    return res.json({
      success: true,
      data: flagDetails,
      message: `Details for feature flag ${flagName} retrieved successfully`
    });
  } catch (error: any) {
    logger.error(`Error retrieving feature flag: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/features/:flagName/rollout
 * Get rollout progress for a specific feature flag
 */
router.get('/:flagName/rollout', async (req: Request, res: Response) => {
  try {
    const { flagName } = req.params;
    logger.info(`Retrieving rollout progress for flag: ${flagName}`);

    const rolloutProgress = {
      flagName,
      currentPercentage: 50,
      targetPercentage: 100,
      usersOnNewVersion: 500,
      usersOnOldVersion: 500,
      totalUsers: 1000,
      rolloutStartDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      estimatedCompletionDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      hourlyProgress: [
        { hour: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), percentage: 0 },
        { hour: new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(), percentage: 10 },
        { hour: new Date(Date.now() - 16 * 60 * 60 * 1000).toISOString(), percentage: 20 },
        { hour: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(), percentage: 30 },
        { hour: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), percentage: 40 },
        { hour: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), percentage: 50 },
        { hour: new Date().toISOString(), percentage: 50 }
      ],
      errorRate: {
        newVersion: 0.2,
        oldVersion: 0.15,
        percentageIncrease: 33
      },
      performanceMetrics: {
        newVersion: {
          avgResponseTime: 250,
          p99ResponseTime: 1200
        },
        oldVersion: {
          avgResponseTime: 230,
          p99ResponseTime: 1100
        }
      },
      canPause: true,
      canRollback: true
    };

    return res.json({
      success: true,
      data: rolloutProgress,
      message: `Rollout progress for flag ${flagName} retrieved successfully`
    });
  } catch (error: any) {
    logger.error(`Error retrieving rollout progress: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * PUT /api/features/:flagName
 * Update feature flag status or rollout percentage
 */
router.put('/:flagName', async (req: Request, res: Response) => {
  try {
    const { flagName } = req.params;
    const { rolloutPercentage, status } = req.body;

    logger.info(`Updating feature flag ${flagName}: rollout=${rolloutPercentage}, status=${status}`);

    // Validate input
    if (rolloutPercentage !== undefined) {
      if (typeof rolloutPercentage !== 'number' || rolloutPercentage < 0 || rolloutPercentage > 100) {
        return res.status(400).json({
          success: false,
          message: 'rolloutPercentage must be a number between 0 and 100'
        });
      }
    }

    if (status !== undefined && !['enabled', 'disabled', 'beta'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be one of: enabled, disabled, beta'
      });
    }

    // In production, update in database
    const updatedFlag = {
      name: flagName,
      rolloutPercentage: rolloutPercentage ?? 50,
      status: status ?? 'beta',
      updatedAt: new Date().toISOString(),
      previousRolloutPercentage: 45,
      previousStatus: 'beta',
      changedBy: 'admin@example.com'
    };

    logger.info(`Feature flag ${flagName} updated successfully`);

    return res.json({
      success: true,
      data: updatedFlag,
      message: `Feature flag ${flagName} updated successfully`
    });
  } catch (error: any) {
    logger.error(`Error updating feature flag: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

/**
 * GET /api/features/:flagName/history
 * Get historical changes for a feature flag
 */
router.get('/:flagName/history', async (req: Request, res: Response) => {
  try {
    const { flagName } = req.params;
    logger.info(`Retrieving history for feature flag: ${flagName}`);

    const history: FeatureFlagHistory[] = [
      {
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        action: 'enabled',
        previousValue: 0,
        newValue: 1,
        changedBy: 'admin@example.com'
      },
      {
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        action: 'rollout_updated',
        previousValue: 0,
        newValue: 20,
        changedBy: 'devops@example.com'
      },
      {
        timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        action: 'rollout_updated',
        previousValue: 20,
        newValue: 50,
        changedBy: 'devops@example.com'
      }
    ];

    return res.json({
      success: true,
      data: {
        flagName,
        history,
        totalChanges: history.length
      },
      message: `History for feature flag ${flagName} retrieved successfully`
    });
  } catch (error: any) {
    logger.error(`Error retrieving feature flag history: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
