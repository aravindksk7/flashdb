# FlashDB: Database Virtualization Tool — Technical Design Specification

**Document Version:** 1.0  
**Date:** 2026-06-06  
**Status:** Design Review  
**Author:** Senior Architect (Claude)

---

## Executive Summary

FlashDB is a PowerShell-based database virtualization tool that enables developers and testers to rapidly provision lightweight, ephemeral clones of production-sized SQL Server databases using VHDX differencing disks. The tool reduces storage overhead by 70-90% while enabling instant rollback through VHDX snapshots. Multi-interface support (PowerShell, REST API, GUI) with modular database provider architecture allows future expansion to PostgreSQL, MySQL, and other database platforms.

---

## 1. Requirements & Constraints

### 1.1 Functional Requirements

#### 1.1.1 Base Image Creation (Golden Copy)
- **FR-1.1:** Tool must support multiple golden image creation methods:
  - **Method 1 (BACKUP/RESTORE):** Traditional backup file → restore to VHDX
  - **Method 2 (Native Replica Backup):** Backup directly from SQL replica using `BACKUP DATABASE ... FROM MIRROR`
  - **Method 3 (Table-by-Table Copy):** Direct copy from read-only connection (works with any restricted account)
- **FR-1.2:** Restore production backup into read-only, compressed VHDX file (golden image)
- **FR-1.3:** Golden images must support versioning (track creation date, source backup/connection path, hash of parent, creation method)
- **FR-1.4:** Support both on-demand golden image creation and acceptance of pre-made backup files
- **FR-1.5:** Maintain golden image metadata (version, size, creation date, source connection string, method used, row count hash)
- **FR-1.6:** Operator can specify creation method via parameter; default is BACKUP/RESTORE
- **FR-1.7:** Support read-only SQL Server connection strings (no admin rights required for direct copy method)
- **FR-1.8:** Verify consistency: check replica lag, optionally verify row counts before/after copy

#### 1.1.2 Lightweight Cloning (Child Disks)
- **FR-2.1:** Create instantaneous child clones using VHDX differencing disks (copy-on-write semantics)
- **FR-2.2:** Clones must attach to SQL Server instances (local or shared) with near-zero initial disk footprint
- **FR-2.3:** Automate clone creation via PowerShell cmdlets (single-command provision in seconds)
- **FR-2.4:** Support flexible storage: local developer machines or centralized network paths (UNC)
- **FR-2.5:** Provide REST API and GUI interfaces alongside PowerShell for multi-user access

#### 1.1.3 State Management (Pinning & Checkpoints)
- **FR-3.1:** Implement instant VHDX snapshot-based checkpoints (copy-on-write, not full copies)
- **FR-3.2:** Support multiple checkpoints per clone (nested checkpoint hierarchy not required)
- **FR-3.3:** Implement instant rollback to golden image or any named checkpoint
- **FR-3.4:** Track checkpoint metadata: creation timestamp, creator, phase (pre-etl/post-etl/manual), ETL job info
- **FR-3.5:** Handle active database connections gracefully during checkpoint/rollback (warn, force-close with logging)
- **FR-3.6:** Support ETL workflow checkpointing at all phases: pre-ETL, post-ETL, between runs

#### 1.1.4 Lifecycle & Operations
- **FR-4.1:** Track clone state (created, attached, detached, expired) in local JSON metadata
- **FR-4.2:** Maintain immutable operation log per clone (audit trail of all operations)
- **FR-4.3:** Detect stale golden images (compare hash, alert if parent was replaced)
- **FR-4.4:** Support clone expiration policies (manual cleanup or optional auto-expire)

### 1.2 Non-Functional Requirements

| Requirement | Target | Rationale |
|------------|--------|-----------|
| **Storage Efficiency** | 70-90% reduction vs. full copies | VHDX differencing + compression |
| **Clone Creation Time** | < 5 seconds | Sub-second VHDX snap + DB attach |
| **Rollback Time** | < 2 seconds | VHDX snapshot revert (no data copy) |
| **Checkpoint Time** | < 1 second | VHDX snapshot creation (instant) |
| **Concurrent Users** | 2-3 simultaneous | Small team, low coordination overhead |
| **Database Sizes** | GB to TB range | Mostly GB; 1-2 TB outliers supported |
| **SQL Server Versions** | 2017, 2019, 2022 Enterprise | Legacy + current |
| **Availability** | No external service dependency | Decentralized, filesystem-based state |

### 1.3 Out of Scope

- **Data masking/anonymization** — Golden images use production data as-is
- **Centralized permission/access control** — Trust model: developers own their clones
- **Automatic conflict resolution** — Multiple users operating on same clone not supported (documented limitation)
- **Cloud database support** — Azure SQL Managed Instance, RDS, etc. (future extension)
- **Backup/restore as a service** — Tool assumes admin can provide/manage backups
- **Performance benchmarking** — No built-in perf test harness

---

## 2. System Architecture

### 2.1 Overall Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Interfaces Layer                     │
├──────────────────┬──────────────────┬──────────────────────┤
│  PowerShell      │   REST API       │   GUI (WPF/Web)      │
│  Cmdlets         │   (HTTP Server)  │   Client             │
└────────┬─────────┴────────┬─────────┴──────────────┬────────┘
         │                  │                        │
         └──────────────────┼────────────────────────┘
                            │
         ┌──────────────────▼──────────────────────────┐
         │   FlashDB Core Module (Database-Agnostic)   │
         │  ────────────────────────────────────────   │
         │  • VHDX Management (attach/detach)         │
         │  • Checkpoint/Rollback Logic               │
         │  • State Management (JSON)                 │
         │  • Image Versioning & Lifecycle            │
         │  • Provider Interface (abstract)           │
         └──────────┬──────────────────┬──────────────┘
                    │                  │
         ┌──────────▼──────────────────▼──────────────┐
         │      Database Provider Interface           │
         │  (Plugin architecture - one per DB type)   │
         └──┬──────────────┬──────────────────┬───────┘
            │              │                  │
    ┌───────▼──────┐ ┌────▼─────────┐ ┌─────▼──────────┐
    │ SqlServer    │ │ PostgreSQL   │ │ MySQL/MariaDB  │
    │ Provider     │ │ Provider     │ │ Provider       │
    │ (BACKUP,     │ │ (pg_dump,    │ │ (mysqldump,    │
    │  RESTORE)    │ │  pg_restore) │ │ mysql)         │
    └─────────────┘ └──────────────┘ └────────────────┘
         
         ┌────────────────────────────────────────┐
         │  Storage Layer (VHDX + Metadata)       │
         │  • parent.vhdx (golden image)          │
         │  • clone-N.vhdx (differencing disk)    │
         │  • clone-N.json (metadata)             │
         │  • checkpoints/cp-N.vhdx (snapshots)   │
         └────────────────────────────────────────┘
```

### 2.2 Core Components

| Component | Responsibility | Implementation Notes |
|-----------|-----------------|----------------------|
| **FlashDB PowerShell Module** | VHDX orchestration, clone lifecycle, state management | Core engine; all logic lives here |
| **REST API Server** | HTTP interface for GUI, external tools, cross-machine access | Node.js or .NET, wraps PowerShell module |
| **GUI Client** | Visual clone management, checkpoint history, status dashboard | WPF (Windows) or web-based |
| **Database Provider Interface** | Abstract contract for DB-specific operations | `ICloneProvider` abstract class |
| **SQL Server Provider** | SQL Server BACKUP/RESTORE, T-SQL integration | Windows auth, SMO library |
| **Golden Image Manager** | Version tracking, compression, storage location abstraction | Shared across all providers |
| **Checkpoint Engine** | VHDX snapshot creation/revert, diff disk management | Depends on Windows Server 2016+ VHDX API |
| **State Metadata Store** | Clone JSON metadata, operation logs, checkpoint history | File-based (JSON in clone directory) |

### 2.3 Data Flow: Create Clone

```
User Command: New-Clone -GoldenImage "prod.vhdx" -CloneName "test-clone-1"
       │
       ▼
   FlashDB Core
   ├─ Locate golden image (UNC or local cache)
   ├─ Verify golden image exists and is valid
   ├─ Create VHDX differencing disk (points to parent)
   ├─ Invoke SqlServer Provider
   │  ├─ Restore backup from golden to clone
   │  └─ Attach database to target SQL instance
   ├─ Create clone JSON metadata
   ├─ Log operation: "clone-created" + timestamp
   └─ Return clone ID and status

Result: Clone ready for use in ~2-5 seconds
```

### 2.4 Data Flow: Checkpoint → Rollback → Retry ETL

```
State 1: Golden Image (ready for ETL)
       │
       ├─ Developer: New-Clone-Checkpoint -Phase "pre-etl"
       │  └─ FlashDB: Create VHDX snapshot (cp-001)
       │
State 2: Pre-ETL Checkpoint (saved)
       │
       ├─ ETL runs: INSERT 1M rows, UPDATE structures
       │  └─ Writes to differencing disk (parent unchanged)
       │
State 3: Post-ETL (modified state)
       │
       ├─ Developer: New-Clone-Checkpoint -Phase "post-etl" -Name "Results-V1"
       │  └─ FlashDB: Create VHDX snapshot (cp-002)
       │
State 4: Post-ETL Checkpoint (results saved)
       │
       ├─ Developer: Restore-Clone-Checkpoint -CheckpointId "cp-001"
       │  ├─ Detach database from SQL instance
       │  ├─ Revert VHDX to cp-001 snapshot
       │  ├─ Re-attach database
       │  └─ Database now back to pre-ETL state
       │
State 5: Back to Pre-ETL (ready to retry with different transform)
       │
       └─ Repeat: Run ETL v2, create new checkpoint, compare results
```

---

## 3. Key Design Decisions

### 3.1 Metadata Storage (JSON over SQL Server)

**Decision:** Store clone state in JSON files (one per clone) rather than a SQL Server database.

**Why:**
- No external dependency (users with SQL Server may not want another instance for metadata)
- Decentralized: each clone is self-contained, can move/copy freely
- Simpler deployment and upgrades
- Supports both local and network clones without sync complexity

**Trade-off:** No built-in cross-user discovery without a central registry (acceptable for 2-3 users).

### 3.2 VHDX Snapshots for Checkpointing (Not Full Backups)

**Decision:** Checkpoints use VHDX differencing disks (copy-on-write), not full backup files.

**Why:**
- Instant creation (< 1 second) vs. backup time (minutes for large databases)
- Efficient storage: stores only changed blocks
- Fast rollback (revert pointer, not copy data)
- Natural fit with VHDX technology

**Trade-off:** Snapshots are VHDX-specific (cannot move checkpoint to non-VHDX environment easily).

### 3.3 Decentralized Local-First Architecture

**Decision:** PowerShell module is the core; operations are local per clone. No centralized orchestration service.

**Why:**
- Simple deployment (install PowerShell module, done)
- Resilient (no service to fail)
- Fast (no network round-trips for local clones)
- Low coordination overhead for 2-3 concurrent users
- Easy to debug and extend

**Trade-off:** Cross-user discovery requires manual registry or shared listing (optional future feature).

### 3.4 Modular Provider Interface

**Decision:** Database-specific operations isolated behind `ICloneProvider` interface.

**Why:**
- Support SQL Server now, PostgreSQL/MySQL/others in future
- Provider changes don't affect core VHDX logic
- Easy to test each provider independently
- Clear responsibility boundaries

**Implementation:**
```powershell
enum CreationMethod {
    BackupRestore      # Traditional BACKUP/RESTORE (most reliable)
    ReplicaBackup      # BACKUP FROM MIRROR (fastest, requires replica)
    TableByTableCopy   # Direct copy (most flexible, works with read-only account)
}

interface ICloneProvider {
    # Golden image creation (supports multiple methods)
    [void] CreateGoldenImage($sourceConnection, $targetVhdxPath, $method, $options) { }
    
    # Legacy methods (for compatibility with BACKUP/RESTORE workflow)
    [void] BackupDatabase($sourceConnection, $backupPath) { }
    [void] RestoreDatabase($targetConnection, $backupPath) { }
    
    # Clone operations
    [void] AttachDatabase($instancePath, $vhdxPath, $databaseName) { }
    [void] DetachDatabase($instancePath, $databaseName) { }
    [bool] ValidateConnection($connectionString) { }
    [object] GetDatabaseInfo($connectionString, $databaseName) { }
}
```

**Method details:**
- **BackupRestore:** User provides backup file or connection to backup location
- **ReplicaBackup:** Requires `BACKUP DATABASE ... FROM MIRROR` support; faster for large databases
- **TableByTableCopy:** Works with any read-only connection; slower but most flexible (no admin rights needed)

### 3.5 Golden Image Creation Methods (Three Options)

**Decision:** Support three methods for creating golden images; operator chooses based on access/performance requirements.

**Method 1: BACKUP/RESTORE (Default)**
- **Process:** User provides backup file (or connection to backup location) → FlashDB restores to VHDX
- **Requirements:** Backup file available (or backup credentials)
- **Pros:** Most reliable, works offline, no performance impact on source
- **Cons:** Requires backup file management, slower for large databases
- **Best for:** Production environments with backup infrastructure, largest databases

**Method 2: Native Replica Backup (BACKUP FROM MIRROR)**
- **Process:** Connect to read-only replica → execute `BACKUP DATABASE ... FROM MIRROR` → restore to VHDX
- **Requirements:** SQL Server replica exists; `BACKUP FROM MIRROR` support (SQL 2012+)
- **Pros:** Faster than restore from file, no impact on primary production server
- **Cons:** Requires replica infrastructure, read-only replica must be healthy
- **Best for:** Large databases with replicas, where speed matters, no backup files available

**Method 3: Table-by-Table Copy (Most Flexible)**
- **Process:** Connect via read-only account → iterate tables → copy data directly to VHDX-attached database
- **Requirements:** Read-only SQL login; no admin rights needed
- **Pros:** Most flexible, works with restricted accounts, no backup files needed, minimal permissions
- **Cons:** Slower for large databases (network I/O), transaction log considerations
- **Best for:** Restricted access scenarios, CI/CD pipelines, environments without backup infrastructure

**Consistency Handling (All Methods):**
- Check replica lag if using ReplicaBackup (warn if > X seconds)
- Optional row count verification before/after copy (parameter: `-VerifyRowCounts`)
- Capture row count hash for audit trail and consistency verification
- Record source connection info for traceability

### 3.6 Force-Close Connections During Rollback

**Decision:** When rolling back a clone with active connections, force-close them (record in metadata).

**Why:**
- VHDX revert requires exclusive access to the disk
- ETL jobs have well-defined start/stop boundaries (can reconnect after rollback)
- Testers expect instant rollback

**Implementation:**
- Attempt graceful close with timeout (5 seconds)
- If connections persist, force-close and log reason
- Application automatically reconnects on next query attempt

---

## 4. Clone Metadata Schema (JSON)

Each clone has a `.json` metadata file tracking its complete lifecycle:

```json
{
  "clone": {
    "id": "clone-prod-20260606-dev1",
    "name": "Production Clone - Dev1",
    "createdAt": "2026-06-06T14:32:00Z",
    "createdBy": "developer@company.com",
    "vhdxPath": "D:\\CloneStorage\\clone-prod-20260606-dev1.vhdx",
    "size": {
      "allocated": 15728640000,
      "used": 2147483648
    }
  },
  "golden": {
    "id": "golden-prod-20260601",
    "parentVhdxPath": "\\\\shared\\GoldenImages\\prod-main-20260601.vhdx",
    "version": "20260601",
    "parentHash": "sha256:abc123...",
    "createdAt": "2026-06-01T08:00:00Z",
    "creationMethod": "ReplicaBackup",
    "sourceConnection": "Server=prod-replica;Database=AdventureWorks;Encrypt=true",
    "sourceRowCountHash": "sha256:def456...",
    "verificationStatus": "verified",
    "verificationDetails": {
      "rowCountVerified": true,
      "schemaVerified": true,
      "replicaLagSeconds": 0,
      "verifiedAt": "2026-06-01T08:45:00Z"
    }
  },
  "database": {
    "type": "SqlServer",
    "databaseName": "AdventureWorks_Clone",
    "instancePath": "LOCALHOST\\SQLEXPRESS",
    "backupSourcePath": "\\\\prod-server\\Backups\\AdventureWorks_20260601.bak"
  },
  "attachment": {
    "status": "attached",
    "attachedAt": "2026-06-06T14:35:00Z",
    "detachedAt": null,
    "lastVerifiedAt": "2026-06-06T14:35:30Z"
  },
  "checkpoints": [
    {
      "checkpointId": "cp-001",
      "name": "Before Performance Test",
      "createdAt": "2026-06-06T15:00:00Z",
      "createdBy": "tester@company.com",
      "phase": "pre-etl",
      "vhdxSnapshotPath": "D:\\CloneStorage\\checkpoints\\clone-prod-20260606-dev1_cp-001.vhdx",
      "description": "Baseline state before load testing",
      "isActive": false,
      "isFavorite": true,
      "labels": ["perf-baseline", "golden-state"],
      "databaseConnections": {
        "activeCount": 0,
        "forceClosed": false
      },
      "etlMetadata": {
        "etlJobName": null,
        "startedAt": null,
        "completedAt": null
      },
      "databaseMetadata": {
        "totalRowCount": 15000000,
        "totalDataSizeMB": 512,
        "schemaHash": "sha256:xyz789...",
        "tableCount": 45,
        "lastTableModified": null,
        "estimatedChanges": 0
      }
    },
    {
      "checkpointId": "cp-002",
      "name": "After First Test Run",
      "createdAt": "2026-06-06T15:15:00Z",
      "createdBy": "tester@company.com",
      "phase": "post-etl",
      "vhdxSnapshotPath": "D:\\CloneStorage\\checkpoints\\clone-prod-20260606-dev1_cp-002.vhdx",
      "description": null,
      "isActive": true,
      "isFavorite": false,
      "labels": ["etl-v2-results"],
      "databaseConnections": {
        "activeCount": 0,
        "forceClosed": true,
        "closedAt": "2026-06-06T15:14:55Z"
      },
      "etlMetadata": {
        "etlJobName": "DailyTransform_v2",
        "startedAt": "2026-06-06T14:05:00Z",
        "completedAt": "2026-06-06T14:43:00Z"
      },
      "databaseMetadata": {
        "totalRowCount": 18500000,
        "totalDataSizeMB": 625,
        "schemaHash": "sha256:xyz789...",
        "tableCount": 45,
        "lastTableModified": "2026-06-06T14:40:00Z",
        "estimatedChanges": 3500000
      }
    }
  ],
  "lifecycle": {
    "status": "active",
    "expirationPolicy": "manual",
    "expiresAt": null,
    "tags": ["dev", "testing", "performance-baseline"]
  },
  "operations": {
    "lastOperation": "checkpoint-created",
    "lastOperationAt": "2026-06-06T15:15:00Z",
    "operationLog": [
      {
        "operation": "clone-created",
        "timestamp": "2026-06-06T14:32:00Z",
        "status": "success"
      },
      {
        "operation": "database-attached",
        "timestamp": "2026-06-06T14:35:00Z",
        "status": "success"
      },
      {
        "operation": "checkpoint-created",
        "timestamp": "2026-06-06T15:00:00Z",
        "status": "success",
        "checkpointId": "cp-001"
      },
      {
        "operation": "checkpoint-created",
        "timestamp": "2026-06-06T15:15:00Z",
        "status": "success",
        "checkpointId": "cp-002"
      }
    ]
  }
}
```

---

## 4.1 Checkpoint Diff & Comparison

When comparing two checkpoints, the tool captures:
- **Row count deltas** per table (how many rows were inserted, deleted, updated)
- **Schema hash** to detect structural changes (new columns, dropped indexes, etc.)
- **Data size changes** (MB before vs after)
- **Modified timestamp** for each table (last write)

Example diff output:
```
Checkpoint cp-001 vs cp-002 Comparison
=====================================
Table: Orders
  Row Count: 1,000,000 → 1,250,000 (+250,000 inserted)
  Data Size: 150 MB → 175 MB
  Last Modified: 2026-06-06T14:40:00Z

Table: OrderDetails
  Row Count: 5,000,000 → 5,000,000 (no change)
  Data Size: 300 MB → 300 MB
  Last Modified: (no change)

Table: Customers
  Row Count: 100,000 → 100,000 (no change)
  Data Size: 10 MB → 10 MB
  Schema Hash: sha256:abc → sha256:def (SCHEMA CHANGED - new column added)
  Last Modified: 2026-06-06T14:35:00Z

Summary:
  Total Row Changes: +250,000
  Total Size Change: +25 MB
  Tables Modified: 2 (Orders, Customers)
  Tables Unchanged: 43
```

**Use cases:**
- Compare ETL v1 vs v2 results (which produces more/fewer rows?)
- Verify rollback (ensure checkpoint state matches expected baseline)
- Debug data pipeline (see exactly what changed after a transformation)

---

## 5. Interface Specifications

### 5.1 PowerShell Cmdlets (Primary Interface)

#### Golden Image Management
```powershell
# Method 1: Create golden image from backup file
New-FlashdbGoldenImage -BackupFile "C:\Backups\prod.bak" -OutputPath "\\shared\GoldenImages\prod-20260606.vhdx" -Version "20260606" -Method BackupRestore -Compress

# Method 2: Create golden image directly from read-only replica (BACKUP FROM MIRROR)
New-FlashdbGoldenImage -SourceConnection "Server=prod-replica;Encrypt=true;TrustServerCertificate=false" -DatabaseName "AdventureWorks" -OutputPath "\\shared\GoldenImages\prod-20260606.vhdx" -Version "20260606" -Method ReplicaBackup -Compress

# Method 3: Create golden image via table-by-table copy from read-only connection (most flexible)
New-FlashdbGoldenImage -SourceConnection "Server=prod-ro-account;User Id=readonly;Password=***;Encrypt=true" -DatabaseName "AdventureWorks" -OutputPath "\\shared\GoldenImages\prod-20260606.vhdx" -Version "20260606" -Method TableByTableCopy -VerifyRowCounts -Compress

# List available golden images
Get-FlashdbGoldenImage

# Get details about a golden image (including creation method)
Get-FlashdbGoldenImage -Id "golden-prod-20260606" -IncludeMetadata

# Update golden image with new backup (using preferred method)
Update-FlashdbGoldenImage -GoldenImageId "golden-prod-20260601" -SourceConnection "Server=prod-replica;..." -Method ReplicaBackup
```

#### Clone Management
```powershell
# Create a new clone
New-FlashdbClone -GoldenImageId "golden-prod-20260601" -CloneName "dev-clone-1" -InstancePath "LOCALHOST\SQLEXPRESS" -StoragePath "D:\CloneStorage"

# List all clones
Get-FlashdbClone

# Attach clone to SQL instance
Connect-FlashdbClone -CloneId "clone-prod-dev1" -InstancePath "LOCALHOST\SQLEXPRESS"

# Detach clone from SQL instance
Disconnect-FlashdbClone -CloneId "clone-prod-dev1"

# Remove clone (cleanup)
Remove-FlashdbClone -CloneId "clone-prod-dev1" -DeleteVhdx
```

#### Checkpoint & Rollback
```powershell
# Create checkpoint
New-FlashdbCheckpoint -CloneId "clone-prod-dev1" -CheckpointName "Post-ETL Results" -Phase "post-etl" -Description "Results after DailyTransform_v2" -Force

# List checkpoints for a clone
Get-FlashdbCheckpoint -CloneId "clone-prod-dev1"

# Get detailed checkpoint metadata (row counts, schema info)
Get-FlashdbCheckpoint -CloneId "clone-prod-dev1" -CheckpointId "cp-001" -IncludeMetadata

# Star/favorite a checkpoint for quick access
Set-FlashdbCheckpoint -CloneId "clone-prod-dev1" -CheckpointId "cp-001" -IsFavorite $true

# Add custom labels/tags to checkpoint
Set-FlashdbCheckpoint -CloneId "clone-prod-dev1" -CheckpointId "cp-001" -Labels @("etl-v2-results", "perf-baseline")

# Compare two checkpoints (see what changed)
Get-FlashdbCheckpointDiff -CloneId "clone-prod-dev1" -SourceCheckpointId "cp-001" -TargetCheckpointId "cp-002"

# Restore to checkpoint
Restore-FlashdbCheckpoint -CloneId "clone-prod-dev1" -CheckpointId "cp-001" -ReattachAfter

# Restore to golden image (discard all changes)
Restore-FlashdbClone -CloneId "clone-prod-dev1" -ToGolden -ReattachAfter

# Remove checkpoint
Remove-FlashdbCheckpoint -CloneId "clone-prod-dev1" -CheckpointId "cp-001"
```

### 5.2 REST API

```
POST   /api/golden-images              → Create golden image (supports method parameter)
GET    /api/golden-images              → List golden images
GET    /api/golden-images/{id}         → Get details (including creation method)
PATCH  /api/golden-images/{id}         → Update version
POST   /api/golden-images/{id}/refresh → Refresh from source (use original method)

POST   /api/clones                      → Create clone
GET    /api/clones                      → List clones
GET    /api/clones/{id}                 → Get clone details
POST   /api/clones/{id}/attach          → Attach to instance
POST   /api/clones/{id}/detach          → Detach from instance
DELETE /api/clones/{id}                 → Delete clone

POST   /api/clones/{id}/checkpoints     → Create checkpoint
GET    /api/clones/{id}/checkpoints     → List checkpoints (with metadata option)
GET    /api/clones/{id}/checkpoints/{cpid}        → Get checkpoint details
PATCH  /api/clones/{id}/checkpoints/{cpid}        → Update (labels, favorite flag)
POST   /api/clones/{id}/checkpoints/{cpid}/restore  → Restore checkpoint
POST   /api/clones/{id}/checkpoints/{cpid}/diff     → Compare with another checkpoint
DELETE /api/clones/{id}/checkpoints/{cpid}         → Delete checkpoint

POST   /api/clones/{id}/restore-golden → Restore to golden image
```

### 5.3 GUI

- **Dashboard:** Overview of all clones, golden images, storage usage
- **Golden Image Panel:** Create, version, delete golden images
- **Clone Management:** Create, delete, attach, detach clones
- **Checkpoint History:** Visual timeline of checkpoints with metadata (row counts, schema changes); star/favorite button; custom labels
- **Checkpoint Diff Viewer:** Side-by-side comparison of two checkpoints showing changed tables, row count deltas, schema modifications
- **Checkpoint Navigator:** Quick jump to favorite checkpoints; filter by label/phase; search by name
- **Metadata Display:** Per-checkpoint info (ETL job name, created by, row counts, file sizes, schema hash)
- **Storage Analytics:** Disk usage per clone, compression ratio, checkpoint size breakdown, potential savings

---

## 6. Error Handling & Recovery

| Scenario | Handling | Recovery |
|----------|----------|----------|
| **Golden image not found** | Fail clone creation with clear error | User must provide correct path or create new golden |
| **Insufficient disk space** | Warn before creating clone/checkpoint | User frees space or changes storage location |
| **Database attach fails** | Log error, rollback VHDX attach, notify user | Check instance connectivity, credentials, database name |
| **Active connections during rollback** | Force-close with warning, log connection info | Application reconnects automatically on next query |
| **VHDX corruption detected** | Detect on open, fail operation with error | User restores from backup or recreates golden |
| **Orphaned VHDX file** | Detect mismatch between metadata and file | Cleanup utility to match state or remove orphans |
| **Network path unavailable** | Fail gracefully, suggest alternative storage | User mounts share or uses local path |

---

## 7. Security Considerations

### 7.1 Data Protection

- **Golden images:** Stored in read-only compressed VHDX (production data, trusted deployment only)
- **Clones:** Stored on developer machines or secured network shares (assume same trust boundary)
- **Credentials:** PowerShell jobs use Windows auth (Kerberos/NTLM) — no credential storage in tool
- **Audit trail:** Operation log in JSON metadata (timestamps, usernames)

### 7.2 Access Control

- **Local clones:** File system permissions (NTFS ACLs) control access
- **Shared clones:** UNC share permissions enforce multi-user boundaries
- **SQL Server:** Clones attached via SQL login (same as production or dedicated read-only account)

### 7.3 Threat Model

| Threat | Mitigation |
|--------|-----------|
| **Unauthorized clone access** | File system ACLs; SQL login controls |
| **Data exfiltration via clone** | Treat clones as production-equivalent; deploy in trusted environment |
| **Malicious rollback** | Audit trail logs all operations; immutable operation log |
| **VHDX tampering** | Integrity check (hash verification of parent golden image) |

---

## 8. Testing Strategy

### 8.1 Unit Tests
- PowerShell module cmdlets (mock VHDX and SQL operations)
- Provider interface implementations (SQL Server backup/restore)
- Metadata schema validation (JSON parsing, required fields)

### 8.2 Integration Tests
- **Golden image creation:** Backup → VHDX compression → verification
- **Clone creation:** VHDX differencing → DB attach → connectivity
- **Checkpoint flow:** Snapshot → rollback → state verification
- **ETL workflow:** Pre-ETL checkpoint → ETL run → post-ETL checkpoint → rollback

### 8.3 Performance Tests
- Clone creation time (target: < 5 sec)
- Checkpoint creation (target: < 1 sec)
- Rollback time (target: < 2 sec)
- Storage efficiency (target: 70-90% reduction)

### 8.4 Manual Testing (QA Checklist)
- [ ] Create golden image from production backup
- [ ] Create multiple clones from golden
- [ ] Attach clones to local and shared SQL instances
- [ ] Run ETL transformations on clone
- [ ] Create pre-ETL checkpoint
- [ ] Create post-ETL checkpoint
- [ ] Rollback to pre-ETL checkpoint
- [ ] Verify database state matches golden + applied checkpoint
- [ ] Delete clone and verify cleanup
- [ ] Force-close active connections during rollback
- [ ] Multi-user concurrent clone operations (2-3 users)
- [ ] Network share storage and local storage paths
- [ ] Golden image update and version hash detection

---

## 9. Deployment & Maintenance

### 9.1 Installation
```powershell
# Install PowerShell module
Install-Module FlashDB -Repository PSGallery

# (Optional) Install REST API service
# Install-FlashdbService

# (Optional) Install GUI
# Install-FlashdbGui
```

### 9.2 Configuration
```json
{
  "goldenImagePath": "\\shared\GoldenImages",
  "defaultCloneStoragePath": "D:\CloneStorage",
  "sqlServerProvider": {
    "defaultInstance": "LOCALHOST\SQLEXPRESS",
    "authMethod": "Windows"
  },
  "checkpointRetentionDays": null,
  "maxConcurrentClones": 5,
  "vhdxCompressionEnabled": true
}
```

### 9.3 Maintenance Tasks
- **Golden image updates:** Run New-FlashdbGoldenImage periodically (weekly/monthly)
- **Orphan cleanup:** Identify and remove orphaned VHDX files
- **Storage monitoring:** Track disk usage, alert if above threshold
- **Backup golden images:** Archive critical golden images separately

---

## 10. Future Enhancements (Out of Scope for V1)

1. **PostgreSQL/MySQL providers** — Extend modular provider interface
2. **Central clone registry** — Optional shared catalog of clones for team discovery
3. **Cloud storage** — Backup golden images to Azure Blob / S3
4. **Performance test harness** — Built-in benchmarking framework
5. **Data masking** — Optional anonymization during golden image creation
6. **Incremental backups** — Reduce golden image creation time for large databases
7. **Kubernetes support** — SQL Server in containers with VHDX cloning

---

## 11. Glossary

| Term | Definition |
|------|-----------|
| **Golden Image** | Read-only, compressed VHDX containing a backup of production database; parent to all clones |
| **Clone** | Differencing VHDX disk linked to golden image; stores only changed blocks (copy-on-write) |
| **Differencing Disk** | VHDX file that stores changes relative to a parent VHDX; minimal initial overhead |
| **Checkpoint** | VHDX snapshot of a clone at a specific point in time; supports instant rollback |
| **Rollback** | Revert clone to a previous checkpoint or golden image (discarding changes) |
| **Attach** | Connect a clone to a SQL Server instance (make database available for queries) |
| **Detach** | Disconnect a clone from a SQL Server instance (release VHDX for other operations) |
| **ETL** | Extract-Transform-Load; batch data pipeline (primary use case for testers) |
| **Provider** | Pluggable database-specific implementation (SQL Server, PostgreSQL, etc.) |
| **UNC Path** | Universal Naming Convention (\\server\share); network file path |

---

## Appendix A: Example Workflows

### Workflow 1: Developer Setting Up a Fresh Clone for Testing

```powershell
# 1. Get latest golden image
$golden = Get-FlashdbGoldenImage | Where-Object Version -eq "20260606" | Select-Object -First 1

# 2. Create a new clone
$clone = New-FlashdbClone -GoldenImageId $golden.Id -CloneName "my-test-clone" -InstancePath "LOCALHOST\SQLEXPRESS" -StoragePath "D:\CloneStorage"

# 3. Verify attachment
$clone | Connect-FlashdbClone

# 4. Use for testing (application connects to LOCALHOST\SQLEXPRESS)
# ... run ETL, tests, queries ...

# 5. Save state before destructive operation
New-FlashdbCheckpoint -CloneId $clone.Id -CheckpointName "Before Delete Test" -Phase "pre-etl"

# 6. Run destructive operation
# ... DELETE * FROM large_table ...

# 7. Rollback instantly
Restore-FlashdbCheckpoint -CloneId $clone.Id -CheckpointId "cp-001" -ReattachAfter

# 8. Cleanup when done
Remove-FlashdbClone -CloneId $clone.Id -DeleteVhdx
```

### Workflow 2: Tester Comparing ETL Versions

```powershell
# 1. Create clone from golden
$clone = New-FlashdbClone -GoldenImageId "golden-prod-20260601" ...

# 2. Checkpoint before ETL v1
New-FlashdbCheckpoint -CloneId $clone.Id -CheckpointName "Pre-ETL" -Phase "pre-etl"

# 3. Run ETL v1 (application does the work)
# ... ETL job processes data ...

# 4. Checkpoint results of v1
New-FlashdbCheckpoint -CloneId $clone.Id -CheckpointName "ETL v1 Results" -Phase "post-etl"

# 5. Rollback to pre-ETL state
Restore-FlashdbCheckpoint -CloneId $clone.Id -CheckpointId "cp-001" -ReattachAfter

# 6. Run ETL v2 (different code path)
# ... ETL v2 job processes data ...

# 7. Checkpoint results of v2
New-FlashdbCheckpoint -CloneId $clone.Id -CheckpointName "ETL v2 Results" -Phase "post-etl"

# 8. Compare results (v1 vs v2 checkpoints)
# Use SQL queries to compare state of both checkpoints
Get-FlashdbCheckpoint -CloneId $clone.Id
```

---

## Sign-Off

**Design Review Status:** Pending user approval

**Next Steps:**
1. User reviews this specification
2. Request changes if needed
3. Once approved, invoke writing-plans skill to create implementation roadmap
4. Begin implementation phase

---

*End of Document*
