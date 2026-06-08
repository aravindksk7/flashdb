/**
 * Feature Flags
 *
 * Phase 10: Feature Flags And Rollout
 * Controls migration from current provider to new dbatools-based implementation
 */

export interface FeatureFlagConfig {
  flag: string;
  description: string;
  default: boolean;
  rolloutPercentage: number;
  dependencies: string[];
}

export const FEATURE_FLAGS: Record<string, FeatureFlagConfig> = {
  // SQL Operations Hardening
  FLASHDB_USE_DBATOOLS: {
    flag: 'FLASHDB_USE_DBATOOLS',
    description: 'Use dbatools for SQL Server operations instead of raw SQL',
    default: false,
    rolloutPercentage: 0,
    dependencies: [],
  },

  // Metadata Layer
  FLASHDB_USE_METADATA: {
    flag: 'FLASHDB_USE_METADATA',
    description: 'Use durable metadata layer for clone/checkpoint tracking',
    default: false,
    rolloutPercentage: 0,
    dependencies: ['FLASHDB_USE_DBATOOLS'],
  },

  // VHD Operations
  FLASHDB_USE_VHD_OPERATIONS: {
    flag: 'FLASHDB_USE_VHD_OPERATIONS',
    description: 'Use centralized VHD operations module',
    default: false,
    rolloutPercentage: 0,
    dependencies: [],
  },

  // Clone Validation and Repair
  FLASHDB_ENABLE_REPAIR: {
    flag: 'FLASHDB_ENABLE_REPAIR',
    description: 'Enable clone validation and repair workflows',
    default: false,
    rolloutPercentage: 0,
    dependencies: ['FLASHDB_USE_METADATA'],
  },

  // Remote Host Support
  FLASHDB_ENABLE_REMOTE_HOSTS: {
    flag: 'FLASHDB_ENABLE_REMOTE_HOSTS',
    description: 'Enable remote host handling with WinRM support',
    default: false,
    rolloutPercentage: 0,
    dependencies: ['FLASHDB_USE_DBATOOLS'],
  },

  // Checkpoint Protection
  FLASHDB_ENABLE_CHECKPOINT_PIN: {
    flag: 'FLASHDB_ENABLE_CHECKPOINT_PIN',
    description: 'Enable pinned checkpoint delete protection',
    default: false,
    rolloutPercentage: 0,
    dependencies: ['FLASHDB_USE_METADATA'],
  },
};

/**
 * Feature Flag Manager
 */
export class FeatureFlagManager {
  private flags: Map<string, boolean>;
  private rolloutSeeds: Map<string, number> = new Map();

  constructor() {
    this.flags = new Map();
    this.initializeFromEnv();
  }

  /**
   * Initialize flags from environment variables
   */
  private initializeFromEnv(): void {
    for (const [key, config] of Object.entries(FEATURE_FLAGS)) {
      const envValue = process.env[key];

      if (envValue !== undefined) {
        this.flags.set(
          key,
          envValue.toLowerCase() === 'true' ||
            envValue === '1' ||
            envValue === 'yes'
        );
      } else {
        this.flags.set(key, config.default);
      }
    }
  }

  /**
   * Check if feature is enabled
   */
  isEnabled(flagName: string, userId?: string): boolean {
    const config = FEATURE_FLAGS[flagName];
    if (!config) {
      return false;
    }

    // Check explicit flag
    const isExplicit = this.flags.get(flagName);
    if (isExplicit) {
      return true;
    }

    // Check rollout percentage
    if (config.rolloutPercentage > 0) {
      if (userId) {
        return this.isInRollout(flagName, userId, config.rolloutPercentage);
      }
      return Math.random() * 100 < config.rolloutPercentage;
    }

    return false;
  }

  /**
   * Check if user is in rollout
   */
  private isInRollout(
    flagName: string,
    userId: string,
    rolloutPercentage: number
  ): boolean {
    // Deterministic rollout: same user always gets same result
    if (!this.rolloutSeeds.has(flagName)) {
      this.rolloutSeeds.set(flagName, Math.random() * 1000);
    }

    const seed = this.rolloutSeeds.get(flagName)!;
    const hash = this.hashUserId(userId, seed);

    return (hash % 100) < rolloutPercentage;
  }

  /**
   * Hash user ID for deterministic rollout
   */
  private hashUserId(userId: string, seed: number): number {
    let hash = seed;
    for (let i = 0; i < userId.length; i++) {
      hash = (hash << 5) - hash + userId.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit int
    }
    return Math.abs(hash);
  }

  /**
   * Enable feature flag (testing only)
   */
  enable(flagName: string): void {
    this.flags.set(flagName, true);
  }

  /**
   * Disable feature flag (testing only)
   */
  disable(flagName: string): void {
    this.flags.set(flagName, false);
  }

  /**
   * Set rollout percentage
   */
  setRollout(flagName: string, percentage: number): void {
    if (FEATURE_FLAGS[flagName]) {
      FEATURE_FLAGS[flagName].rolloutPercentage = Math.min(
        100,
        Math.max(0, percentage)
      );
    }
  }

  /**
   * Get all flags status
   */
  getAllFlags(): Record<string, boolean> {
    const result: Record<string, boolean> = {};

    for (const [key] of Object.entries(FEATURE_FLAGS)) {
      result[key] = this.isEnabled(key);
    }

    return result;
  }
}

// Singleton
let manager: FeatureFlagManager | null = null;

export function getFeatureFlagManager(): FeatureFlagManager {
  if (!manager) {
    manager = new FeatureFlagManager();
  }
  return manager;
}

/**
 * Rollout Strategy
 *
 * Phase 1: Verify (0-5%)
 *   - Small user percentage
 *   - Close monitoring
 *   - Tests passing
 *
 * Phase 2: Expand (5-25%)
 *   - No critical issues
 *   - Metrics stable
 *
 * Phase 3: Wider (25-50%)
 *   - User feedback positive
 *   - Performance acceptable
 *
 * Phase 4: Majority (50-95%)
 *   - Battle-tested
 *   - Ready for most users
 *
 * Phase 5: Complete (100%)
 *   - Old path deprecated
 *   - Scheduled removal
 */
export const ROLLOUT_SCHEDULE = {
  FLASHDB_USE_DBATOOLS: {
    phase1_verify: { percentage: 5, startDate: '2026-07-01', duration: '2 weeks' },
    phase2_expand: { percentage: 25, startDate: '2026-07-15', duration: '2 weeks' },
    phase3_wider: { percentage: 50, startDate: '2026-07-29', duration: '1 month' },
    phase4_majority: { percentage: 95, startDate: '2026-08-29', duration: '2 weeks' },
    phase5_complete: { percentage: 100, startDate: '2026-09-12', scheduleRemoval: '2026-10-01' },
  },

  FLASHDB_ENABLE_REPAIR: {
    phase1_verify: { percentage: 5, startDate: '2026-08-01', duration: '2 weeks' },
    phase2_expand: { percentage: 25, startDate: '2026-08-15', duration: '2 weeks' },
    phase3_wider: { percentage: 50, startDate: '2026-08-29', duration: '1 month' },
    phase4_majority: { percentage: 95, startDate: '2026-09-29', duration: '2 weeks' },
    phase5_complete: { percentage: 100, startDate: '2026-10-13' },
  },

  FLASHDB_ENABLE_REMOTE_HOSTS: {
    phase1_verify: { percentage: 5, startDate: '2026-09-01', duration: '3 weeks' },
    phase2_expand: { percentage: 25, startDate: '2026-09-22', duration: '2 weeks' },
    phase3_wider: { percentage: 50, startDate: '2026-10-06', duration: '1 month' },
    phase4_majority: { percentage: 95, startDate: '2026-11-06', duration: '2 weeks' },
    phase5_complete: { percentage: 100, startDate: '2026-11-20' },
  },
};
