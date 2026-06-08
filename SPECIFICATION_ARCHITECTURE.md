# Architecture & Data Flow: Checkpoint Database Orphan Fix

This document visualizes the system architecture and data flow for the orphaned checkpoint database fix.

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          FlashDB System Architecture                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ┌─────────────────┐                                                    │
│  │   Client GUI    │                                                    │
│  │  (Browser)      │                                                    │
│  └────────┬────────┘                                                    │
│           │                                                             │
│           │ REST API                                                    │
│           ▼                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │            Express API Server (taskWorker)                      │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │  ┌──────────────────┐      ┌──────────────────────────┐        │   │
│  │  │  Create-Checkpoint│ ──► │  1. PowerShell Response  │        │   │
│  │  │     Task         │      │     (has DatabaseName)   │        │   │
│  │  └──────────────────┘      └──────────────────────────┘        │   │
│  │           │                                                    │   │
│  │           │ PHASE 2: Capture                                  │   │
│  │           ▼                                                    │   │
│  │  ┌──────────────────────────────────────┐                    │   │
│  │  │ Extract DatabaseName from Response   │                    │   │
│  │  │ (Handle PascalCase & camelCase)      │                    │   │
│  │  └──────────────────────────────────────┘                    │   │
│  │           │                                                    │   │
│  │           │ PHASE 3: Store                                    │   │
│  │           ▼                                                    │   │
│  │  ┌──────────────────────────────────────┐                    │   │
│  │  │ MetadataService.saveCheckpointDB()   │                    │   │
│  │  │ → UPDATE dbo.Checkpoints             │                    │   │
│  │  └──────────────────────────────────────┘                    │   │
│  │                                                               │   │
│  │                                                               │   │
│  │  ┌──────────────────────────────────────┐                    │   │
│  │  │  Delete-Checkpoint Task              │                    │   │
│  │  └──────────────────────────────────────┘                    │   │
│  │           │                                                    │   │
│  │           │ PHASE 5: Retrieve & Delete                        │   │
│  │           ▼                                                    │   │
│  │  ┌──────────────────────────────────────┐                    │   │
│  │  │ 1. Get checkpoint metadata           │                    │   │
│  │  │    (including checkpointDatabaseName)│                    │   │
│  │  └──────────────────────────────────────┘                    │   │
│  │           │                                                    │   │
│  │           ▼                                                    │   │
│  │  ┌──────────────────────────────────────┐                    │   │
│  │  │ 2. Delete metadata                   │                    │   │
│  │  │    FROM dbo.Checkpoints              │                    │   │
│  │  └──────────────────────────────────────┘                    │   │
│  │           │                                                    │   │
│  │           ▼                                                    │   │
│  │  ┌──────────────────────────────────────┐                    │   │
│  │  │ 3. Drop physical database            │                    │   │
│  │  │    (PHASE 4: Safe Drop Helper)       │                    │   │
│  │  └──────────────────────────────────────┘                    │   │
│  │           │                                                    │   │
│  │           ▼                                                    │   │
│  │  ┌──────────────────────────────────────┐                    │   │
│  │  │ DROP DATABASE with guards:           │                    │   │
│  │  │ • Check existence                    │                    │   │
│  │  │ • Verify not protected               │                    │   │
│  │  │ • Set SINGLE_USER mode               │                    │   │
│  │  │ • Drop with ROLLBACK IMMEDIATE       │                    │   │
│  │  └──────────────────────────────────────┘                    │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│           │                                                             │
│           │ SQL Queries                                               │
│           ▼                                                            │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │        SQL Server Database (sqlClient)                         │   │
│  ├────────────────────────────────────────────────────────────────┤   │
│  │  ┌─────────────────────────────────────────────────────────┐  │   │
│  │  │ PHASE 1: Schema Extension                               │  │   │
│  │  │ dbo.Checkpoints Table:                                  │  │   │
│  │  │ ├─ id (NVARCHAR(36))                                   │  │   │
│  │  │ ├─ cloneId (NVARCHAR(36))                              │  │   │
│  │  │ ├─ checkpointName (NVARCHAR(255))                      │  │   │
│  │  │ ├─ phase (NVARCHAR(50))                                │  │   │
│  │  │ ├─ ... other columns ...                               │  │   │
│  │  │ └─ checkpointDatabaseName (NVARCHAR(MAX)) NULL ◄──────────┼─ NEW!
│  │  │                                                         │  │   │
│  │  │ Physical Checkpoint Databases:                          │  │   │
│  │  │ ├─ FlashDB_Checkpoint_cp_20260608_xyz1               │  │   │
│  │  │ ├─ FlashDB_Checkpoint_cp_20260608_xyz2               │  │   │
│  │  │ └─ ... etc ...                                        │  │   │
│  │  └─────────────────────────────────────────────────────────┘  │   │
│  │                                                                │   │
│  │  System Databases (Protected):                               │   │
│  │  ├─ master                                                   │   │
│  │  ├─ model                                                    │   │
│  │  ├─ msdb                                                     │   │
│  │  ├─ tempdb                                                   │   │
│  │  └─ flashdb_queue (or configured)                            │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
│           ▲                                                           │
│           │ PowerShell Execution (via pooledPowerShellService)       │
│           │                                                           │
│  ┌────────┴──────────────────────────────────────────────────────┐   │
│  │        PowerShell Provider (FlashDB Cmdlets)                  │   │
│  ├────────────────────────────────────────────────────────────────┤   │
│  │                                                                │   │
│  │  New-FlashdbCheckpoint                                        │   │
│  │  ├─ Input: CloneId, CheckpointName, Phase, Description      │   │
│  │  └─ Output: {Id, DatabaseName, Status}                      │   │
│  │                                    ▲                         │   │
│  │                                    │                         │   │
│  │                            Creates DB                        │   │
│  │                                                                │   │
│  │  Remove-FlashdbCheckpoint                                     │   │
│  │  ├─ Input: CheckpointId                                      │   │
│  │  └─ Deletes checkpoint (but not DB)                         │   │
│  │                                                                │   │
│  └────────────────────────────────────────────────────────────────┘   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### Checkpoint Creation Flow (with Database Capture & Storage)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CHECKPOINT CREATION FLOW                          │
└─────────────────────────────────────────────────────────────────────────┘

Client                  API                  PowerShell              Database
  │                     │                        │                      │
  │ POST /checkpoints   │                        │                      │
  ├────────────────────►│                        │                      │
  │                     │ Enqueue Task           │                      │
  │                     │                        │                      │
  │                     │ Process create-checkpoint Task                │
  │                     ├──────────────────────►│                      │
  │                     │                        │ Create Checkpoint   │
  │                     │                        │ Create Database      │
  │                     │                        │ Get database name    │
  │                     │◄────────────────────{Id, DatabaseName}       │
  │                     │                        │                      │
  │                     │ PHASE 2: Extract name                        │
  │                     │ (handle PascalCase & camelCase)              │
  │                     │                        │                      │
  │                     │ PHASE 3: Persist name                        │
  │                     ├───────────────────────────────────────────► │
  │                     │                        │  UPDATE Checkpoints │
  │                     │                        │  SET checkpointDB   │
  │                     │◄───────────────────────────────────────────┤
  │                     │                        │                      │
  │ Checkpoint created  │                        │                      │
  │◄────────────────────┤                        │                      │
  │ {ID, DatabaseName}  │                        │                      │
  │                     │                        │                      │

Success Outcome:
├─ Metadata: Checkpoint record with checkpointDatabaseName stored
├─ Database: Physical checkpoint database exists
└─ Logs: "Captured checkpoint database: cp_xxx → FlashDB_Checkpoint_cp_xxx"
```

---

### Checkpoint Deletion Flow (with Database Cleanup)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        CHECKPOINT DELETION FLOW                           │
└──────────────────────────────────────────────────────────────────────────┘

Client              API                    Database                PowerShell
  │                 │                         │                       │
  │ DELETE          │                         │                       │
  │ /checkpoints    │                         │                       │
  ├────────────────►│                         │                       │
  │                 │ Enqueue delete-checkpoint Task                   │
  │                 │                         │                       │
  │                 │ Process Task            │                       │
  │                 │                         │                       │
  │                 │ PHASE 5 Step 1:         │                       │
  │                 │ Retrieve checkpoint     │                       │
  │                 ├────────────────────────►│                       │
  │                 │ SELECT with DB name     │                       │
  │                 │◄────────────────────────┤                       │
  │                 │ {name, checkpointDB}    │                       │
  │                 │                         │                       │
  │                 │ PHASE 5 Step 2:         │                       │
  │                 │ Delete metadata         │                       │
  │                 ├────────────────────────►│                       │
  │                 │ DELETE FROM Checkpoints │                       │
  │                 │◄────────────────────────┤                       │
  │                 │ OK                      │                       │
  │                 │                         │                       │
  │                 │ PHASE 4 Step 3:         │                       │
  │                 │ Drop physical database  │                       │
  │                 ├────────────────────────►│                       │
  │                 │ ALTER DATABASE...       │                       │
  │                 │ SET SINGLE_USER         │                       │
  │                 │ DROP DATABASE           │                       │
  │                 │◄────────────────────────┤                       │
  │                 │ OK (or warning if fails)│                       │
  │                 │                         │                       │
  │ Deleted OK      │                         │                       │
  │◄────────────────┤                         │                       │
  │ {success: true} │                         │                       │
  │                 │                         │                       │

Success Outcome:
├─ Metadata: Checkpoint record deleted from database
├─ Database: Physical checkpoint database dropped
├─ Logs: "Checkpoint database dropped: FlashDB_Checkpoint_cp_xxx"
└─ Storage: Space reclaimed

Failure Scenario (Database Drop Fails):
├─ Metadata: ✓ Checkpoint deleted
├─ Database: ✗ Physical database still exists (in use by another process)
├─ Logs: ⚠ "Failed to drop checkpoint database"
└─ Result: Non-fatal, operation completes, database can be cleaned up manually
```

---

## State Diagram: Checkpoint Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CHECKPOINT LIFECYCLE (Updated)                        │
└─────────────────────────────────────────────────────────────────────────┘

         CREATE               RESTORE              DELETE
           │                    │                    │
           ▼                    ▼                    ▼

      ┌──────────┐          ┌──────────┐        ┌──────────┐
      │ Creating │          │Restoring │        │ Deleting │
      │          │          │          │        │          │
      │ State:   │          │ State:   │        │ State:   │
      │ - Record │          │ - Reverting to  │ - Remove  │
      │   created│          │   checkpoint DB │   metadata│
      │ - DB     │          │ - Verify state  │ - Drop    │
      │   being  │          │                 │   physical│
      │ - DB name│          │                 │   database│
      │ captured │          │                 │ - Reclaim │
      └────┬─────┘          └────┬─────┘      └────┬──────┘
           │                     │                   │
           │ Success             │ Success          │ Success
           ▼                     ▼                   ▼
      ┌──────────┐          ┌──────────┐        ┌──────────┐
      │  Ready   │────────►│ Restored │        │ Deleted  │
      │          │         │          │        │          │
      │ State:   │ manual  │ State:   │        │ State:   │
      │ - Record │ restore │ - DB at  │        │ - Record │
      │   stored │         │   point  │        │   gone   │
      │ - DB name│         │ - State  │        │ - DB     │
      │ - DB     │         │   reverted       │   dropped │
      │ - DB     │         │ - Ready for      │           │
      │   exists │         │   work           │           │
      └──────────┘         └──────────┘       └───────────┘
           ▲                    ▲                   ▲
           │                    │                   │
           │ Error              │ Error            │ Error
           │ (partial)          │ (rollback)       │ (cleanup)
           │                    │                  │
      ┌────────────────────────────────────────────────┐
      │         Failed / Orphaned State                │
      │                                                │
      │ • Record exists but DB may be missing         │
      │ • Record deleted but DB may remain            │
      │ • Requires manual recovery                    │
      │ • Detection: isOrphaned flag = 1              │
      └────────────────────────────────────────────────┘

        ▲
        │ Recovery
        │ - Manual cleanup of orphaned DBs
        │ - Audit and repair
        │ - sp_CleanupOrphanedCheckpoints
        │
        └─ Back to Ready or Deleted
```

---

## Database Schema Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         UPDATED SCHEMA (Phase 1)                         │
└──────────────────────────────────────────────────────────────────────────┘

╔══════════════════════════════════════════════════════════════════════════╗
║                          dbo.GoldenImages                                ║
╠══════════════════════════════════════════════════════════════════════════╣
║ PK  id                  NVARCHAR(36)                                    ║
║     imageName           NVARCHAR(255)                                   ║
║     imagePath           NVARCHAR(MAX)                                   ║
║     createdAt           DATETIME2(7)                                    ║
║     updatedAt           DATETIME2(7)                                    ║
╚══════════════════════════════════════════════════════════════════════════╝
              │
              │ 1:N
              ▼
╔══════════════════════════════════════════════════════════════════════════╗
║                          dbo.Clones                                      ║
╠══════════════════════════════════════════════════════════════════════════╣
║ PK  id                  NVARCHAR(36)                                    ║
║ FK  goldenImageId       NVARCHAR(36) ──────────────►[GoldenImages.id]  ║
║     cloneName           NVARCHAR(255)                                   ║
║     databaseType        NVARCHAR(50)                                    ║
║     databaseName        NVARCHAR(255)                                   ║
║     createdAt           DATETIME2(7)                                    ║
║     updatedAt           DATETIME2(7)                                    ║
╚══════════════════════════════════════════════════════════════════════════╝
              │
              │ 1:N (ON DELETE CASCADE)
              ▼
╔══════════════════════════════════════════════════════════════════════════╗
║                        dbo.Checkpoints (UPDATED)                        ║
╠══════════════════════════════════════════════════════════════════════════╣
║ PK  id                  NVARCHAR(36)                                    ║
║ FK  cloneId             NVARCHAR(36) ──────────────►[Clones.id]        ║
║     checkpointName      NVARCHAR(255)                                   ║
║     phase               NVARCHAR(50)                                    ║
║     description         NVARCHAR(MAX)                                   ║
║ NEW checkpointDatabaseName  NVARCHAR(MAX) NULL    ◄─────────── ADDED   ║
║     isFavorite          BIT DEFAULT 0                                   ║
║     size                BIGINT                                          ║
║     restoredAt          DATETIME2(7)                                    ║
║     createdAt           DATETIME2(7) DEFAULT GETUTCDATE()              ║
║     isOrphaned          BIT DEFAULT 0                                   ║
║     vhdxPath            NVARCHAR(MAX)                                   ║
║     stateHash           NVARCHAR(64)                                    ║
║     parentCheckpointId  NVARCHAR(36) ──────────┐                      ║
║                                                  │                      ║
║ FK  parentCheckpointId  ───────────────────────┘ (self-reference)     ║
╚══════════════════════════════════════════════════════════════════════════╝
              │
              │ 1:N (ON DELETE CASCADE via checkpointId)
              ▼
╔══════════════════════════════════════════════════════════════════════════╗
║                    dbo.CheckpointOperations                             ║
╠══════════════════════════════════════════════════════════════════════════╣
║ PK  id                  NVARCHAR(36)                                    ║
║ FK  checkpointId        NVARCHAR(36) ──────────────►[Checkpoints.id]  ║
║ FK  cloneId             NVARCHAR(36) ──────────────►[Clones.id]       ║
║     operationType       NVARCHAR(50)                                    ║
║     status              NVARCHAR(50)                                    ║
║     startedAt           DATETIME2(7)                                    ║
║     completedAt         DATETIME2(7)                                    ║
║     errorMessage        NVARCHAR(MAX)                                   ║
╚══════════════════════════════════════════════════════════════════════════╝

Key Changes (Phase 1):
  ✓ Added: checkpointDatabaseName NVARCHAR(MAX) NULL
    - Stores checkpoint database name from PowerShell
    - NULL for existing checkpoints (backwards compatible)
    - Used by deletion flow to cleanup physical databases
```

---

## Component Responsibilities

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    COMPONENT RESPONSIBILITIES                            │
└──────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  taskWorker.ts (TaskWorker Class)               │
├─────────────────────────────────────────────────┤
│                                                 │
│  PHASE 2: Capture Database Name                 │
│  ├─ Extract from PowerShell result              │
│  ├─ Handle PascalCase & camelCase              │
│  ├─ Trim whitespace                            │
│  └─ Log at INFO level                          │
│                                                 │
│  PHASE 4: Safe Database Drop                    │
│  ├─ dropCheckpointDatabaseSafely()             │
│  ├─ Check protected database list              │
│  ├─ Verify database exists                     │
│  ├─ Set SINGLE_USER mode                       │
│  ├─ Execute DROP DATABASE                      │
│  └─ Log errors non-fatally                     │
│                                                 │
│  PHASE 5: Integration                           │
│  ├─ Get checkpoint with database name          │
│  ├─ Delete metadata via MetadataService        │
│  ├─ Call dropCheckpointDatabaseSafely()        │
│  └─ Log full operation flow                    │
│                                                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  metadataService.ts (MetadataService Class)    │
├─────────────────────────────────────────────────┤
│                                                 │
│  PHASE 3: Persist Database Name                 │
│  ├─ saveCheckpointDatabaseName()               │
│  ├─ UPDATE dbo.Checkpoints                     │
│  ├─ Handle NULL values                         │
│  ├─ Non-fatal error handling                   │
│  └─ Log at DEBUG/INFO/WARN levels              │
│                                                 │
│  PHASE 5: Integration                           │
│  ├─ getCheckpoint() includes database name     │
│  ├─ deleteCheckpoint() - unchanged logic      │
│  │  (database drop delegated to taskWorker)    │
│  └─ Logs operation flow                        │
│                                                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  schema.sql (Database Layer)                    │
├─────────────────────────────────────────────────┤
│                                                 │
│  PHASE 1: Schema Extension                      │
│  ├─ ADD checkpointDatabaseName to Checkpoints │
│  ├─ Type: NVARCHAR(MAX) NULL                  │
│  ├─ Non-blocking migration                     │
│  └─ Backwards compatible (NULL for old records)│
│                                                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  sqlClient.ts (Database Access Layer)           │
├─────────────────────────────────────────────────┤
│                                                 │
│  Unchanged - handles all SQL execution         │
│  ├─ Used by MetadataService for queries       │
│  ├─ Used by TaskWorker for schema checks      │
│  └─ Used by TaskWorker for database drops     │
│                                                 │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│  PowerShell Provider (External)                 │
├─────────────────────────────────────────────────┤
│                                                 │
│  New-FlashdbCheckpoint cmdlet                  │
│  ├─ Must return: { Id, DatabaseName, ... }   │
│  ├─ Support both PascalCase & camelCase      │
│  └─ Database name captures in PHASE 2         │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Error Handling Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         ERROR HANDLING FLOW                              │
└──────────────────────────────────────────────────────────────────────────┘

Checkpoint Creation (Non-blocking Errors):
───────────────────────────────────────────
  Create Checkpoint
    ├─ Success ──► Capture DB name
    │              ├─ Success ──► Persist to metadata
    │              │              ├─ Success ──► Checkpoint created ✓
    │              │              └─ Fail ──► Log WARN, continue ⚠
    │              │                          (checkpoint still created)
    │              └─ Fail ──► Log INFO, continue
    │                          (no DB name, NULL in DB)
    └─ Fail ──► Checkpoint creation failed ✗
                Log ERROR, throw exception

Checkpoint Deletion (Non-fatal Database Drop):
──────────────────────────────────────────────
  Get Checkpoint (with DB name)
    ├─ Success ──► Delete metadata
    │              ├─ Success ──► Drop database
    │              │              ├─ Success ──► Deletion complete ✓
    │              │              └─ Fail ──► Log WARN, continue ⚠
    │              │                         (metadata deleted, DB orphaned)
    │              └─ Fail ──► Deletion failed ✗
    │                          Log ERROR, throw exception
    └─ Not found ──► Idempotent, return success
                     Log DEBUG, continue

Protected Database Drop Guard:
──────────────────────────────
  Check if protected: [master|model|msdb|tempdb|SQL_DATABASE]
    ├─ Yes ──► Log WARN, skip drop
    │          Return success (database not dropped) ✓
    └─ No ──► Continue to existence check

Database Existence Check:
─────────────────────────
  DB_ID(@db) IS NOT NULL
    ├─ Yes ──► Continue to SINGLE_USER mode
    │          Then DROP DATABASE
    │          (may fail if in use)
    └─ No ──► Log INFO, already dropped ✓
              Return success (idempotent)

Database Drop Failure (In Use):
────────────────────────────────
  ALTER DATABASE ... SET SINGLE_USER fails
    ├─ Error: "Database in use" ──► Log WARN
    │                                 Continue (non-fatal)
    │                                 Result: Metadata deleted, DB orphaned
    └─ Error: "Other error" ──► Log WARN
                                 Continue (non-fatal)
                                 Manual cleanup required later
```

---

## Sequence Diagram: Complete Checkpoint Lifecycle

```
Client      GUI       API       PowerShell   Database    Storage
  │         │         │           │            │           │
  │ Click   │         │           │            │           │
  │ Create  │         │           │            │           │
  │────────►│         │           │            │           │
  │         │ POST    │           │            │           │
  │         │────────►│           │            │           │
  │         │         │ Enqueue   │            │           │
  │         │         │ Task      │            │           │
  │         │         │           │            │           │
  │         │         │ Poll      │            │           │
  │         │         ├───────────────────────►│           │
  │         │         │                        │           │
  │         │         │ Execute New-Checkpoint │           │
  │         │         ├───────────────────────►│           │
  │         │         │                        │ Create DB │
  │         │         │                        ├──────────►│
  │         │         │◄────────────────────────────{DatabaseName}
  │         │         │                        │           │
  │         │         │ [PHASE 2] Extract Name │           │
  │         │         │ [PHASE 3] Save Name    │           │
  │         │         ├───────────────────────────────────►│
  │         │         │                        │  UPDATE   │
  │         │         │◄───────────────────────────────────┤
  │         │◄────────┤                        │           │
  │         │ Updated │                        │           │
  │         │────────►│ Display success        │           │
  │ Checkpoint visible with DB name           │           │
  │                                            │           │
  │ Click                                      │           │
  │ Delete                                     │           │
  │────────►│                                  │           │
  │         │ DELETE                           │           │
  │         │────────►│                        │           │
  │         │         │ Enqueue Delete Task    │           │
  │         │         │                        │           │
  │         │         │ Get checkpoint + DB    │           │
  │         │         ├───────────────────────►│           │
  │         │         │◄────────────────────────{DatabaseName}
  │         │         │                        │           │
  │         │         │ Delete metadata        │           │
  │         │         ├───────────────────────►│           │
  │         │         │                        │ DELETE    │
  │         │         │◄────────────────────────────────────┤
  │         │         │                        │           │
  │         │         │ [PHASE 4] Drop DB      │           │
  │         │         ├───────────────────────────────────►│
  │         │         │                        │ ALTER     │
  │         │         │                        │ DROP      │
  │         │         │◄───────────────────────────────────┤
  │         │         │                        │           │
  │         │◄────────┤ Deletion complete      │           │
  │         │ Removed │                        │           │
  │         │────────►│ Display: Deleted       │           │
  │ Checkpoint gone, Storage reclaimed        │           │
```

---

## Technology Stack & Dependencies

```
┌──────────────────────────────────────────────────────────────────────────┐
│                      TECHNOLOGY & DEPENDENCIES                           │
└──────────────────────────────────────────────────────────────────────────┘

Frontend Layer:
  ├─ React.tsx (GUI Components)
  └─ REST API calls to /api/checkpoints

Backend Layer:
  ├─ Express.js (taskWorker, API routes)
  ├─ TypeScript (type safety)
  └─ Node.js (runtime)

Service Layer:
  ├─ TaskWorker class (task processing, PHASE 2/4/5)
  ├─ MetadataService class (PHASE 3)
  ├─ PooledPowerShellService (PowerShell execution)
  ├─ SqlClient (database access)
  └─ Logger (Winston)

Database Layer:
  ├─ SQL Server 2016+ (primary)
  └─ TSQL (SQL implementation)

External Dependencies:
  ├─ PowerShell 5.1+ (FlashDB cmdlets)
  └─ Hyper-V (checkpoint storage)

Assumptions:
  ├─ PowerShell: Returns {DatabaseName | databaseName} in response
  ├─ SQL Server: 2016+ with proper permissions (ALTER, DROP)
  ├─ Network: TaskWorker ↔ SQL Server accessible
  └─ Storage: Sufficient disk for checkpoint databases
```

---

End of Architecture Documentation
