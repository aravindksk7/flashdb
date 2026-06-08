-- Phase 3: Durable Metadata Model
-- Database migration creating all metadata tables
-- Version: 1.0
-- Date: 2026-06-07

-- ============================================================================
-- Golden Images Metadata Table
-- Phase 3, Step 1
-- ============================================================================

CREATE TABLE IF NOT EXISTS golden_images (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('BackupRestore', 'ReplicaBackup', 'TableByTableCopy')),
  output_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Creating', 'Ready', 'Failed', 'Deleting')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP,

  -- Live observations (not durable facts)
  file_size BIGINT,
  row_count INTEGER,
  table_count INTEGER,
  verification_state TEXT CHECK (verification_state IN ('Pending', 'Verified', 'Failed')),

  CONSTRAINT golden_images_unique_name_version UNIQUE (name, version)
);

CREATE INDEX idx_golden_images_status ON golden_images(status);
CREATE INDEX idx_golden_images_created_at ON golden_images(created_at DESC);

COMMENT ON TABLE golden_images IS 'Durable metadata for golden database images';
COMMENT ON COLUMN golden_images.id IS 'Unique identifier (immutable)';
COMMENT ON COLUMN golden_images.name IS 'Human-readable name (durable fact)';
COMMENT ON COLUMN golden_images.version IS 'Version identifier, semver recommended (durable fact)';
COMMENT ON COLUMN golden_images.method IS 'Creation method: BackupRestore|ReplicaBackup|TableByTableCopy (durable fact)';
COMMENT ON COLUMN golden_images.output_path IS 'Storage path for image files (durable fact)';
COMMENT ON COLUMN golden_images.status IS 'Status: Creating|Ready|Failed|Deleting (durable fact)';
COMMENT ON COLUMN golden_images.created_at IS 'Creation timestamp, immutable (durable fact)';
COMMENT ON COLUMN golden_images.updated_at IS 'Last metadata update (durable fact)';
COMMENT ON COLUMN golden_images.file_size IS 'Live observation from storage (NOT a durable fact)';
COMMENT ON COLUMN golden_images.row_count IS 'Live observation from SQL (NOT a durable fact)';
COMMENT ON COLUMN golden_images.table_count IS 'Live observation from SQL (NOT a durable fact)';
COMMENT ON COLUMN golden_images.verification_state IS 'Live validation state (NOT a durable fact)';

-- ============================================================================
-- Clones Metadata Table
-- Phase 3, Step 2
-- ============================================================================

CREATE TABLE IF NOT EXISTS clones (
  id TEXT PRIMARY KEY,
  clone_name TEXT NOT NULL,
  golden_image_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Creating', 'Attached', 'Detached', 'Failed', 'Deleting')),
  instance_path TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  vhdx_path TEXT,
  sql_instance_name TEXT,
  database_name TEXT,
  host TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attached_at TIMESTAMP,

  -- Live observations (not durable facts)
  mount_path TEXT,
  validation_state TEXT CHECK (validation_state IN ('Pending', 'Healthy', 'Unhealthy', 'Unknown')),
  last_validated_at TIMESTAMP,

  CONSTRAINT clones_fk_golden_image FOREIGN KEY (golden_image_id) REFERENCES golden_images(id) ON DELETE RESTRICT,
  CONSTRAINT clones_unique_name UNIQUE (clone_name)
);

CREATE INDEX idx_clones_status ON clones(status);
CREATE INDEX idx_clones_golden_image_id ON clones(golden_image_id);
CREATE INDEX idx_clones_created_at ON clones(created_at DESC);

COMMENT ON TABLE clones IS 'Durable metadata for database clones';
COMMENT ON COLUMN clones.id IS 'Unique identifier (immutable)';
COMMENT ON COLUMN clones.clone_name IS 'Human-readable name (durable fact)';
COMMENT ON COLUMN clones.golden_image_id IS 'Parent golden image ID, immutable (durable fact)';
COMMENT ON COLUMN clones.status IS 'Status: Creating|Attached|Detached|Failed|Deleting (durable fact)';
COMMENT ON COLUMN clones.instance_path IS 'SQL Server instance path (durable fact)';
COMMENT ON COLUMN clones.storage_path IS 'VHD storage path (durable fact)';
COMMENT ON COLUMN clones.vhdx_path IS 'Full path to VHDX file (durable fact)';
COMMENT ON COLUMN clones.sql_instance_name IS 'SQL instance name (durable fact)';
COMMENT ON COLUMN clones.database_name IS 'Attached database name (durable fact)';
COMMENT ON COLUMN clones.host IS 'Target host name, for remote clones (durable fact)';
COMMENT ON COLUMN clones.created_at IS 'Creation timestamp, immutable (durable fact)';
COMMENT ON COLUMN clones.attached_at IS 'Last attach timestamp (durable fact)';
COMMENT ON COLUMN clones.mount_path IS 'Live mount point, Windows-specific (NOT a durable fact)';
COMMENT ON COLUMN clones.validation_state IS 'Live validation state (NOT a durable fact)';
COMMENT ON COLUMN clones.last_validated_at IS 'Last validation timestamp (NOT a durable fact)';

-- ============================================================================
-- Checkpoints Metadata Table
-- Phase 3, Step 3
-- ============================================================================

CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  clone_id TEXT NOT NULL,
  checkpoint_name TEXT NOT NULL,
  phase TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('Creating', 'Ready', 'Restoring', 'Failed', 'Deleting')),
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  labels TEXT[], -- Array of string labels
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  restored_at TIMESTAMP,
  vhdx_path TEXT,
  state_hash TEXT,
  backing_type TEXT CHECK (backing_type IN ('Database', 'Vhdx', 'Hybrid')),

  -- Live observations (not durable facts)
  validation_state TEXT CHECK (validation_state IN ('Pending', 'Valid', 'Invalid', 'Unknown')),

  CONSTRAINT checkpoints_fk_clone FOREIGN KEY (clone_id) REFERENCES clones(id) ON DELETE CASCADE,
  CONSTRAINT checkpoints_unique_per_clone UNIQUE (clone_id, checkpoint_name)
);

CREATE INDEX idx_checkpoints_status ON checkpoints(status);
CREATE INDEX idx_checkpoints_clone_id ON checkpoints(clone_id);
CREATE INDEX idx_checkpoints_is_pinned ON checkpoints(is_pinned);
CREATE INDEX idx_checkpoints_created_at ON checkpoints(created_at DESC);

COMMENT ON TABLE checkpoints IS 'Durable metadata for restore points/snapshots';
COMMENT ON COLUMN checkpoints.id IS 'Unique identifier (immutable)';
COMMENT ON COLUMN checkpoints.clone_id IS 'Parent clone ID, immutable (durable fact)';
COMMENT ON COLUMN checkpoints.checkpoint_name IS 'Human-readable name (durable fact)';
COMMENT ON COLUMN checkpoints.phase IS 'Phase: manual|automatic|custom (durable fact)';
COMMENT ON COLUMN checkpoints.description IS 'User-provided description (durable fact)';
COMMENT ON COLUMN checkpoints.status IS 'Status: Creating|Ready|Restoring|Failed|Deleting (durable fact)';
COMMENT ON COLUMN checkpoints.is_pinned IS 'Pin flag for delete protection (durable fact)';
COMMENT ON COLUMN checkpoints.labels IS 'Array of user labels (durable fact)';
COMMENT ON COLUMN checkpoints.is_favorite IS 'Favorite flag (durable fact)';
COMMENT ON COLUMN checkpoints.created_at IS 'Creation timestamp, immutable (durable fact)';
COMMENT ON COLUMN checkpoints.restored_at IS 'Last restore timestamp (durable fact)';
COMMENT ON COLUMN checkpoints.vhdx_path IS 'Backing VHDX path (durable fact)';
COMMENT ON COLUMN checkpoints.state_hash IS 'Hash for integrity verification (durable fact)';
COMMENT ON COLUMN checkpoints.backing_type IS 'Backing type: Database|Vhdx|Hybrid (durable fact)';
COMMENT ON COLUMN checkpoints.validation_state IS 'Live validation state (NOT a durable fact)';

-- ============================================================================
-- Hosts Metadata Table
-- Phase 3, Step 4
-- ============================================================================

CREATE TABLE IF NOT EXISTS hosts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  fqdn TEXT NOT NULL UNIQUE,
  access_method TEXT NOT NULL CHECK (access_method IN ('Local', 'WinRM', 'SSH')),
  sql_instances TEXT[], -- Array of SQL instance names
  path_mappings JSONB, -- Object mapping UNC paths to local paths
  credential_reference TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Live observations (not durable facts)
  last_validated_at TIMESTAMP,
  validation_state TEXT CHECK (validation_state IN ('Pending', 'Valid', 'Invalid', 'Unknown'))
);

CREATE INDEX idx_hosts_access_method ON hosts(access_method);
CREATE INDEX idx_hosts_fqdn ON hosts(fqdn);

COMMENT ON TABLE hosts IS 'Durable metadata for target hosts (local and remote)';
COMMENT ON COLUMN hosts.id IS 'Unique identifier (immutable)';
COMMENT ON COLUMN hosts.name IS 'Short hostname (durable fact)';
COMMENT ON COLUMN hosts.fqdn IS 'Fully qualified domain name (durable fact)';
COMMENT ON COLUMN hosts.access_method IS 'Access method: Local|WinRM|SSH (durable fact)';
COMMENT ON COLUMN hosts.sql_instances IS 'Array of SQL instance names (durable fact)';
COMMENT ON COLUMN hosts.path_mappings IS 'UNC to local path mappings (durable fact)';
COMMENT ON COLUMN hosts.credential_reference IS 'Reference to stored credentials (durable fact)';
COMMENT ON COLUMN hosts.created_at IS 'Creation timestamp, immutable (durable fact)';
COMMENT ON COLUMN hosts.last_validated_at IS 'Last validation timestamp (NOT a durable fact)';
COMMENT ON COLUMN hosts.validation_state IS 'Live validation state (NOT a durable fact)';

-- ============================================================================
-- Repair Attempts Metadata Table
-- Phase 3, Step 5
-- ============================================================================

CREATE TABLE IF NOT EXISTS repair_attempts (
  id TEXT PRIMARY KEY,
  clone_id TEXT NOT NULL,
  validation_findings JSONB, -- Array of ValidationFinding objects
  attempted_actions JSONB, -- Array of RepairAction objects
  result TEXT NOT NULL CHECK (result IN ('Success', 'Partial', 'Failed', 'Skipped')),
  result_message TEXT NOT NULL,
  operator_id TEXT,
  task_id TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,

  CONSTRAINT repair_attempts_fk_clone FOREIGN KEY (clone_id) REFERENCES clones(id) ON DELETE CASCADE
);

CREATE INDEX idx_repair_attempts_clone_id ON repair_attempts(clone_id);
CREATE INDEX idx_repair_attempts_result ON repair_attempts(result);
CREATE INDEX idx_repair_attempts_started_at ON repair_attempts(started_at DESC);

COMMENT ON TABLE repair_attempts IS 'Durable history of clone repair attempts';
COMMENT ON COLUMN repair_attempts.id IS 'Unique identifier (immutable)';
COMMENT ON COLUMN repair_attempts.clone_id IS 'Clone being repaired (immutable, durable fact)';
COMMENT ON COLUMN repair_attempts.validation_findings IS 'Array of ValidationFinding objects (durable fact)';
COMMENT ON COLUMN repair_attempts.attempted_actions IS 'Array of RepairAction objects (durable fact)';
COMMENT ON COLUMN repair_attempts.result IS 'Result: Success|Partial|Failed|Skipped (durable fact)';
COMMENT ON COLUMN repair_attempts.result_message IS 'Human-readable result message (durable fact)';
COMMENT ON COLUMN repair_attempts.operator_id IS 'User who initiated repair (durable fact)';
COMMENT ON COLUMN repair_attempts.task_id IS 'Queue task ID (durable fact)';
COMMENT ON COLUMN repair_attempts.started_at IS 'Start timestamp (immutable, durable fact)';
COMMENT ON COLUMN repair_attempts.completed_at IS 'Completion timestamp (durable fact)';

-- ============================================================================
-- Metadata Schema Version Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS metadata_schema_version (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO metadata_schema_version (version, name, description)
VALUES (1, 'Create metadata tables', 'Initial schema with all 5 metadata entity tables')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- Metadata Ownership and Facts Documentation
-- Phase 3, Step 8
-- ============================================================================

/*
METADATA FIELD CLASSIFICATION:

Durable Facts (stored and maintained by FlashDB):
- Never change after creation (except updates field)
- Source of truth for configuration decisions
- Examples: id, golden_image_id, created_at, clone_name, vhdx_path

Live Observations (observed from system state):
- May change frequently based on current system state
- Should be recomputed on every health check
- Should not be relied upon for critical decisions
- Examples: mount_path, validation_state, last_validated_at, file_size

Guidelines:
1. When reading metadata, assume only durable facts are correct
2. When observing system state, update live observations
3. Never use live observations for critical operations without revalidating
4. All operations that change durable facts must be recorded
5. Timestamps of durable facts are immutable (created_at, clone_id, etc.)

Migration Strategy (Phase 3, Step 6):
- If existing state is in files: map to durable facts
- If state was inferred: discard and recompute as live observations
- Preserve all operational history in audit tables
*/
