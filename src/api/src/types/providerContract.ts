/**
 * Provider Contract Interface
 *
 * Defines the interface that all provider implementations must conform to.
 * This allows the GUI/API layer to remain independent of SQL Server, VHD, or other
 * low-level implementation details.
 *
 * Phase 1, Step 2: Provider Boundary And Contract Tests
 */

export interface GoldenImageCreateParams {
  name: string;
  version: string;
  method: 'BackupRestore' | 'ReplicaBackup' | 'TableByTableCopy';
  outputPath: string;
  backupFile?: string;
  sourceConnection?: string;
  databaseType?: string;
  databaseName?: string;
  sourceDatabase?: string;
  driver?: string;
  authenticationMode?: string;
  selectedTables?: string[];
}

export interface GoldenImageMetadata {
  id: string;
  name: string;
  version: string;
  method: 'BackupRestore' | 'ReplicaBackup' | 'TableByTableCopy';
  outputPath: string;
  status: 'Creating' | 'Ready' | 'Failed' | 'Deleting';
  createdAt: Date;
  updatedAt?: Date;
  fileSize?: number;
  rowCount?: number;
  tableCount?: number;
  verificationState?: 'Pending' | 'Verified' | 'Failed';
}

export interface CloneCreateParams {
  goldenImageId: string;
  cloneName: string;
  instancePath: string;
  storagePath: string;
  databaseType?: string;
  databaseName?: string;
  compressionEnabled?: boolean;
  attachAfterCreate?: boolean;
}

export interface CloneMetadata {
  id: string;
  cloneName: string;
  goldenImageId: string;
  status: 'Creating' | 'Attached' | 'Detached' | 'Failed' | 'Deleting';
  instancePath: string;
  storagePath: string;
  vhdxPath?: string;
  mountPath?: string;
  sqlInstanceName?: string;
  databaseName?: string;
  host?: string;
  createdAt: Date;
  attachedAt?: Date;
  validationState?: 'Pending' | 'Healthy' | 'Unhealthy' | 'Unknown';
  lastValidatedAt?: Date;
}

export interface CheckpointMetadata {
  id: string;
  cloneId: string;
  checkpointName: string;
  phase: 'manual' | 'automatic' | string;
  description?: string;
  status: 'Creating' | 'Ready' | 'Restoring' | 'Failed' | 'Deleting';
  isPinned?: boolean;
  labels?: string[];
  isFavorite?: boolean;
  createdAt: Date;
  restoredAt?: Date;
  vhdxPath?: string;
  stateHash?: string;
  backingType?: 'Database' | 'Vhdx' | 'Hybrid';
  validationState?: 'Pending' | 'Valid' | 'Invalid' | 'Unknown';
}

export interface HostMetadata {
  id: string;
  name: string;
  fqdn: string;
  accessMethod: 'Local' | 'WinRM' | 'SSH';
  sqlInstances?: string[];
  pathMappings?: Record<string, string>;
  credentialReference?: string;
  lastValidatedAt?: Date;
  validationState?: 'Pending' | 'Valid' | 'Invalid' | 'Unknown';
}

export interface RepairAttemptMetadata {
  id: string;
  cloneId: string;
  validationFindings: ValidationFinding[];
  attemptedActions: RepairAction[];
  result: 'Success' | 'Partial' | 'Failed' | 'Skipped';
  resultMessage: string;
  operatorId?: string;
  taskId?: string;
  startedAt: Date;
  completedAt?: Date;
}

export interface ValidationFinding {
  severity: 'Info' | 'Warning' | 'Error';
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface RepairAction {
  action: 'RemountVhd' | 'DetachDatabase' | 'AttachDatabase' | 'UpdateMetadata' | string;
  status: 'Planned' | 'Attempted' | 'Succeeded' | 'Failed' | 'Skipped';
  message?: string;
}

/**
 * Provider Contract Interface
 *
 * All provider implementations (SQL Server, VHD, etc.) must implement this interface.
 * This allows the API layer to remain provider-agnostic.
 */
export interface IProvider {
  // Golden Image operations
  createGoldenImage(params: GoldenImageCreateParams): Promise<GoldenImageMetadata>;
  getGoldenImage(imageId: string): Promise<GoldenImageMetadata | null>;
  listGoldenImages(): Promise<GoldenImageMetadata[]>;
  updateGoldenImage(imageId: string, updates: Partial<GoldenImageMetadata>): Promise<GoldenImageMetadata>;
  deleteGoldenImage(imageId: string): Promise<void>;

  // Clone operations
  createClone(params: CloneCreateParams): Promise<CloneMetadata>;
  getClone(cloneId: string): Promise<CloneMetadata | null>;
  listClones(): Promise<CloneMetadata[]>;
  attachClone(cloneId: string, instancePath: string): Promise<CloneMetadata>;
  detachClone(cloneId: string): Promise<CloneMetadata>;
  deleteClone(cloneId: string, deleteVhdx?: boolean): Promise<void>;

  // Checkpoint operations
  createCheckpoint(cloneId: string, params: {
    checkpointName: string;
    phase?: string;
    description?: string;
  }): Promise<CheckpointMetadata>;
  getCheckpoint(cloneId: string, checkpointId: string): Promise<CheckpointMetadata | null>;
  listCheckpoints(cloneId: string): Promise<CheckpointMetadata[]>;
  restoreCheckpoint(cloneId: string, checkpointId: string, reattachAfter?: boolean): Promise<void>;
  updateCheckpoint(cloneId: string, checkpointId: string, updates: Partial<CheckpointMetadata>): Promise<CheckpointMetadata>;
  deleteCheckpoint(cloneId: string, checkpointId: string, cascadeDelete?: boolean): Promise<void>;

  // Validation operations
  validateClone(cloneId: string): Promise<{
    isHealthy: boolean;
    findings: ValidationFinding[];
    details: Record<string, any>;
  }>;

  // Repair operations
  repairClone(cloneId: string, dryRun?: boolean): Promise<RepairAttemptMetadata>;

  // Host operations (for remote execution)
  validateHost(hostId: string): Promise<{
    isValid: boolean;
    findings: ValidationFinding[];
    capabilities: string[];
  }>;

  // Metadata operations
  getMetadata(type: 'clone' | 'checkpoint' | 'goldenImage' | 'host', id: string): Promise<any>;
  updateMetadata(type: string, id: string, updates: Record<string, any>): Promise<void>;
}

/**
 * Provider Factory
 *
 * Creates and manages provider instances.
 * The current implementation uses SQL Server with PowerShell.
 */
export interface IProviderFactory {
  getProvider(): IProvider;
  setProvider(provider: IProvider): void;
}
