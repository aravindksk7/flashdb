# FlashDB Metadata Schema

**Phase 3: Durable Metadata Model**

This document defines the durable metadata model for FlashDB, including schema definitions, field ownership rules, and migration strategies.

---

## Overview

FlashDB metadata is divided into **5 entity types** stored durably in PostgreSQL:

1. **Golden Images** — Database image templates
2. **Clones** — Instances cloned from golden images
3. **Checkpoints** — Snapshots of clone state
4. **Hosts** — Target machines (local and remote)
5. **Repair Attempts** — History of clone repair operations

Each entity has metadata fields classified as either:
- **Durable Facts** — Configuration stored by FlashDB, source of truth
- **Live Observations** — Current system state, recomputed on demand

---

## Field Classification Rules

### Durable Facts (Authoritative)

Properties that define the configuration and history of an entity:

- Created during entity creation; persist indefinitely
- Primary source for operational decisions
- Update only when explicit operations occur
- Examples: `id`, `created_at`, `clone_name`, `golden_image_id`, `status`

**Guidelines:**
- Never discard durable facts
- Use them for critical operations (delete, restore, etc.)
- Audit all changes to durable facts
- Treat creation timestamps as immutable

### Live Observations (Transient)

Current system state, discovered by probing the system:

- May change frequently (or be stale)
- Recomputed on every health check or validation
- Should not be used for critical decisions without revalidation
- Examples: `mount_path`, `validation_state`, `last_validated_at`, `file_size`

**Guidelines:**
- Discard and recompute before critical operations
- Never assume they are current
- Log time of observation
- Mark with `last_*_at` timestamps to indicate staleness

---

## Entity Schemas

### 1. Golden Images (Schema)

**Purpose:** Metadata for database image templates created via backup/replica/copy

| Field | Type | Durable? | Notes |
|-------|------|----------|-------|
| `id` | text | ✓ | Unique identifier (immutable) |
| `name` | text | ✓ | Human-readable name |
| `version` | text | ✓ | Version identifier (semver recommended) |
| `method` | text | ✓ | Creation method: `BackupRestore`, `ReplicaBackup`, `TableByTableCopy` |
| `output_path` | text | ✓ | Storage path where image files are located |
| `status` | text | ✓ | `Creating`, `Ready`, `Failed`, `Deleting` |
| `created_at` | timestamp | ✓ | Creation timestamp (immutable) |
| `updated_at` | timestamp | ✓ | Last metadata update |
| `file_size` | integer | ✗ | Live observation: storage size in bytes |
| `row_count` | integer | ✗ | Live observation: row count from SQL |
| `table_count` | integer | ✗ | Live observation: table count from SQL |
| `verification_state` | text | ✗ | Live observation: `Pending`, `Verified`, `Failed` |

**Constraints:**
- `(name, version)` must be unique across all golden images
- Once created, `created_at` is immutable

---

### 2. Clones (Schema)

**Purpose:** Metadata for database instances cloned from golden images

| Field | Type | Durable? | Notes |
|-------|------|----------|-------|
| `id` | text | ✓ | Unique identifier (immutable) |
| `clone_name` | text | ✓ | Human-readable name (must be unique) |
| `golden_image_id` | text | ✓ | Parent image ID (immutable, foreign key) |
| `status` | text | ✓ | `Creating`, `Attached`, `Detached`, `Failed`, `Deleting` |
| `instance_path` | text | ✓ | SQL Server instance path |
| `storage_path` | text | ✓ | VHD storage directory path |
| `vhdx_path` | text | ✓ | Full path to VHDX file (if created) |
| `sql_instance_name` | text | ✓ | SQL instance name |
| `database_name` | text | ✓ | Database name in SQL |
| `host` | text | ✓ | Target host (for remote clones) |
| `created_at` | timestamp | ✓ | Creation timestamp (immutable) |
| `attached_at` | timestamp | ✓ | Last attach timestamp |
| `mount_path` | text | ✗ | Live observation: current mount point (Windows) |
| `validation_state` | text | ✗ | Live observation: `Pending`, `Healthy`, `Unhealthy`, `Unknown` |
| `last_validated_at` | timestamp | ✗ | Live observation: last validation time |

**Constraints:**
- `clone_name` must be unique
- `golden_image_id` must reference an existing golden image
- Once created, `created_at` is immutable; `golden_image_id` never changes

**Critical Operations:**
- Before **detaching**: Revalidate `validation_state`
- Before **deleting**: Ensure all checkpoints are handled
- Before **restoring**: Verify `vhdx_path` exists

---

### 3. Checkpoints (Schema)

**Purpose:** Metadata for restore points/snapshots of clone state

| Field | Type | Durable? | Notes |
|-------|------|----------|-------|
| `id` | text | ✓ | Unique identifier (immutable) |
| `clone_id` | text | ✓ | Parent clone ID (immutable, foreign key) |
| `checkpoint_name` | text | ✓ | Human-readable name (unique per clone) |
| `phase` | text | ✓ | Phase: `manual`, `automatic`, or custom |
| `description` | text | ✓ | User-provided description |
| `status` | text | ✓ | `Creating`, `Ready`, `Restoring`, `Failed`, `Deleting` |
| `is_pinned` | boolean | ✓ | Pin flag for delete protection |
| `labels` | text[] | ✓ | Array of user labels |
| `is_favorite` | boolean | ✓ | Favorite flag |
| `created_at` | timestamp | ✓ | Creation timestamp (immutable) |
| `restored_at` | timestamp | ✓ | Last restore timestamp |
| `vhdx_path` | text | ✓ | Path to backing VHDX file |
| `state_hash` | text | ✓ | Hash for integrity verification |
| `backing_type` | text | ✓ | `Database`, `Vhdx`, or `Hybrid` |
| `validation_state` | text | ✗ | Live observation: `Pending`, `Valid`, `Invalid`, `Unknown` |

**Constraints:**
- `(clone_id, checkpoint_name)` must be unique
- `clone_id` must reference an existing clone
- `is_pinned = true` requires explicit `force=true` to delete
- Once created, `created_at` and `clone_id` are immutable

**Critical Operations:**
- Before **restoring**: Verify backing exists, revalidate `validation_state`
- Before **deleting**: Check `is_pinned` flag; if true, require force flag
- **Delete protection**: Pinned checkpoints cannot be deleted without `force=true`

---

### 4. Hosts (Schema)

**Purpose:** Metadata for target hosts (local and remote execution)

| Field | Type | Durable? | Notes |
|-------|------|----------|-------|
| `id` | text | ✓ | Unique identifier (immutable) |
| `name` | text | ✓ | Short hostname |
| `fqdn` | text | ✓ | Fully qualified domain name (unique) |
| `access_method` | text | ✓ | `Local`, `WinRM`, or `SSH` |
| `sql_instances` | text[] | ✓ | Array of SQL instance names |
| `path_mappings` | jsonb | ✓ | Object mapping UNC paths to local paths |
| `credential_reference` | text | ✓ | Reference to stored credentials |
| `created_at` | timestamp | ✓ | Creation timestamp (immutable) |
| `last_validated_at` | timestamp | ✗ | Live observation: last validation time |
| `validation_state` | text | ✗ | Live observation: `Pending`, `Valid`, `Invalid`, `Unknown` |

**Constraints:**
- `fqdn` must be unique
- Once created, `created_at` and `access_method` are immutable

---

### 5. Repair Attempts (Schema)

**Purpose:** Durable history of clone repair operations

| Field | Type | Durable? | Notes |
|-------|------|----------|-------|
| `id` | text | ✓ | Unique identifier (immutable) |
| `clone_id` | text | ✓ | Clone being repaired (foreign key) |
| `validation_findings` | jsonb | ✓ | Array of `ValidationFinding` objects |
| `attempted_actions` | jsonb | ✓ | Array of `RepairAction` objects |
| `result` | text | ✓ | `Success`, `Partial`, `Failed`, or `Skipped` |
| `result_message` | text | ✓ | Human-readable result message |
| `operator_id` | text | ✓ | User/system that initiated repair |
| `task_id` | text | ✓ | Queue task ID (if any) |
| `started_at` | timestamp | ✓ | Start timestamp (immutable) |
| `completed_at` | timestamp | ✓ | Completion timestamp |

**Constraints:**
- `clone_id` must reference an existing clone
- All fields are immutable after creation
- Used for audit trail and historical analysis

---

## Migration Strategy

### From Existing State (Phase 3, Step 6)

If FlashDB already has operational metadata in files or state tables:

1. **Identify durable facts:**
   - Source of truth for clone names, images, checkpoints
   - Preserve exactly as-is in metadata tables

2. **Identify live observations:**
   - Any inferred state (mount points, file sizes, validation states)
   - Discard these; they will be recomputed on first health check

3. **Preserve operational history:**
   - If audit/operation logs exist, migrate to audit tables
   - Do not pollute metadata tables with historical observations

4. **Validation:**
   - After migration, run full health checks
   - Recompute all live observations
   - Verify durable facts match actual system state

### Migration Example

```
Old state (in files):
  clone: "Clone1"
  status: "Attached"
  mount_point: "D:"
  validation: "Healthy"

New metadata (durable facts):
  id: "clone-<uuid>"
  clone_name: "Clone1"
  status: "Attached"
  created_at: <preserved if known>

New metadata (live observations):
  mount_path: NULL  (will be recomputed)
  validation_state: NULL  (will be recomputed)
  last_validated_at: NULL
```

---

## Ownership and Update Rules

### Who Updates What

| Entity | Can Update | Conditions |
|--------|-----------|-----------|
| Golden Image | Admin, API | Only `status`, `name`, `version` after creation |
| Clone | API, Tasks | Only `status`, `attached_at` via operations |
| Checkpoint | User, API | Only `labels`, `is_favorite`, `is_pinned` after creation |
| Host | Admin | Configuration changes only |
| Repair Attempt | Internal | Read-only after creation (complete audit trail) |

### Update Audit Trail

Every update to a durable fact must:
1. Be recorded in the operation history (audit table)
2. Include timestamp and operator ID
3. Reference the metadata ID
4. Include reason/context

---

## Health Check and Validation

### Recompute Live Observations

Every health check MUST recompute and update:

```
For each clone:
  1. Verify VHDX exists and is accessible
  2. Query SQL for database attachment state
  3. Check mount point accessibility
  4. Validate parent golden image exists
  5. Update: mount_path, validation_state, last_validated_at
```

### Unhealthy State Detection

Metadata indicates unhealthy state when:

| Condition | Indicator |
|-----------|-----------|
| VHD file missing | `validation_state = 'Invalid'` |
| Database detached | `validation_state = 'Unhealthy'` |
| Parent image deleted | Broken foreign key (error) |
| Pinned checkpoint exists | `is_pinned = true` (prevents delete) |
| Repair needed | `validation_state != 'Healthy'` |

---

## API Usage Examples

### Creating a Clone (Stores Durable Facts)

```javascript
// Create metadata immediately
const clone = {
  id: generateId(),
  clone_name: "Production-Clone-1",
  golden_image_id: "img-123",
  status: "Creating",
  instance_path: "MSSQLSERVER",
  storage_path: "/data/clones",
  created_at: now(),  // ← Immutable
};

await metadataService.saveClone(clone);

// Later, when VHDX is created:
clone.vhdx_path = "/data/clones/clone1.vhdx";  // ← Durable fact
clone.status = "Attached";
clone.attached_at = now();
await metadataService.saveClone(clone);
```

### Validating a Clone (Live Observations)

```javascript
// Do NOT trust metadata's validation_state
const clone = await metadataService.getClone(cloneId);

// Recompute validation
const validation = await validateClone(cloneId);  // Probes system

// Update live observations
clone.validation_state = validation.isHealthy ? "Healthy" : "Unhealthy";
clone.last_validated_at = now();
await metadataService.saveClone(clone);
```

### Deleting a Pinned Checkpoint (Check Ownership Rules)

```javascript
const checkpoint = await metadataService.getCheckpoint(cloneId, checkpointId);

if (checkpoint.is_pinned && !force) {
  throw new Error("Checkpoint is pinned; use force=true to delete");
}

// Record deletion in audit trail
await auditLog.record({
  type: "checkpoint-delete",
  checkpointId,
  operator: userId,
  force,
  timestamp: now(),
});

// Delete durable metadata
await metadataService.deleteCheckpoint(cloneId, checkpointId);
```

---

## Summary

**Key Principles:**

1. ✓ Durable facts are source of truth for configuration
2. ✓ Live observations are recomputed on every health check
3. ✓ Never use stale live observations for critical operations
4. ✓ All changes to durable facts are audited
5. ✓ Timestamps of durable facts are immutable (created_at, IDs, etc.)
6. ✓ Pinned checkpoints have explicit delete protection
7. ✓ Metadata enables repair workflows and health checks

This model provides both **durability** (for operational decisions) and **flexibility** (for system state observation).
