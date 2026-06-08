# Architecture: Orphaned Checkpoint Database Cleanup

## Problem Statement
When checkpoints are created, PowerShell creates a SQL Server database. When checkpoints are deleted, the metadata records are removed but the physical databases remain on SQL Server, creating orphaned databases that consume disk space and are untrackable.

## Solution Overview
Implement end-to-end database name tracking and cleanup:
1. **Capture**: Extract database name from PowerShell response (DatabaseName or databaseName variant)
2. **Store**: Persist database name in dbo.Checkpoints.[checkpointDatabaseName] column
3. **Drop**: When deleting checkpoint, safely DROP the physical database from SQL Server

## Architecture Components

### 1. Data Flow: Creation Path
```
PowerShell (New-FlashdbCheckpoint)
  → Returns: { success: true, checkpointId, DatabaseName/databaseName, ... }
  ↓
TaskWorker.executeTask() [line 453-461]
  → Receives result object with database name
  ↓
Capture Logic [NEW, after line 461]
  → Extract: result.DatabaseName || result.databaseName
  → Store in task context for metadata persistence
  ↓
MetadataService.saveCheckpoint() [to be enhanced]
  → INSERT INTO Checkpoints WITH checkpointDatabaseName
  ↓
Database: dbo.Checkpoints row created with database name
```

### 2. Data Flow: Deletion Path
```
Frontend DELETE request → checkpoints.ts DELETE endpoint
  ↓
MetadataService.deleteCheckpoint(cloneId, checkpointId) [line 903]
  → Fetch current checkpoint record (includes checkpointDatabaseName)
  → Delete metadata records (FK cascade: Checkpoints → CheckpointOperations)
  → Return database name for cleanup
  ↓
TaskWorker [NEW call in deleteCheckpoint]
  → DROP DATABASE with guards
  → Log success/failure (non-blocking)
  ↓
Complete deletion: metadata gone, physical database gone
```

### 3. Schema Addition
**File**: src/api/src/db/schema.sql (line 72-92)

Add to dbo.Checkpoints table after [isOrphaned] column:
```sql
[checkpointDatabaseName] NVARCHAR(255) NULL,
```

Properties:
- Nullable (backwards compatible with existing checkpoints)
- Indexed for quick lookups on deletion
- Stores exact name returned by PowerShell

### 4. Capture Logic (Property Resolution Order)
**File**: src/api/src/services/taskWorker.ts (after line 461)

```typescript
// After result = await psService.executeCommand(...)
if (task.type === 'create-checkpoint' && result?.success) {
  // Extract database name from PowerShell response
  // Try both casing variants (PowerShell inconsistency)
  const dbName = result.DatabaseName || result.databaseName;
  if (dbName) {
    result.checkpointDatabaseName = dbName;
    logger.info(`[TaskWorker] Captured checkpoint database: ${dbName}`);
  }
}
```

### 5. Metadata Persistence
**File**: src/api/src/services/metadataService.ts (enhance saveCheckpoint method, line 806)

Enhance to include checkpointDatabaseName:
```typescript
async saveCheckpoint(metadata: CheckpointMetadata, dbName?: string): Promise<void> {
  // INSERT INTO Checkpoints (id, cloneId, ..., checkpointDatabaseName)
  // VALUES (@id, @cloneId, ..., @checkpointDatabaseName)
  // Pass dbName param in addition to metadata
}
```

### 6. Drop-Helper Method
**File**: src/api/src/services/taskWorker.ts (NEW method ~line 250)

```typescript
private async safeDropDatabase(databaseName: string): Promise<void> {
  // Guards:
  // 1. Whitelist validation (only alphanumeric, underscore, hyphen)
  // 2. Protected databases: never drop master, model, msdb, tempdb
  // 3. Set SINGLE_USER mode with ROLLBACK IMMEDIATE
  // 4. Execute: DROP DATABASE
  // 5. Log results, don't throw (checkpoint deletion succeeds anyway)
}
```

### 7. Integration Point
**File**: src/api/src/services/metadataService.ts (enhance deleteCheckpoint, line 903)

```typescript
async deleteCheckpoint(cloneId: string, checkpointId: string): Promise<void> {
  // Fetch checkpoint record (includes checkpointDatabaseName)
  const checkpoint = await this.getCheckpoint(cloneId, checkpointId);
  
  // Delete metadata records
  // ... existing deletion logic ...
  
  // Drop physical database if name available
  if (checkpoint?.checkpointDatabaseName) {
    const taskWorker = new TaskWorker(); // or dependency inject
    await taskWorker.safeDropDatabase(checkpoint.checkpointDatabaseName)
      .catch(err => logger.warn(`Failed to drop checkpoint DB: ${err.message}`));
    // Non-blocking: don't fail checkpoint deletion if DROP fails
  }
}
```

## Error Handling Strategy

| Error | Location | Handling | Impact |
|-------|----------|----------|--------|
| PowerShell missing DatabaseName | Capture logic | Log warning, continue | Checkpoint created but not tracked for cleanup |
| saveCheckpoint() fails | Metadata persistence | Throw (operation fails) | Checkpoint not recorded at all |
| DROP DATABASE fails | safeDropDatabase() | Log warning only | Physical DB remains; checkpoint records cleaned |
| Protected DB in drop list | safeDropDatabase() | Reject, log error | Safety check prevents accidental deletion |

**Philosophy**: Metadata consistency is critical (fail fast). Physical cleanup is best-effort (non-blocking).

## Backwards Compatibility

- Column checkpointDatabaseName is NULLABLE
- Existing checkpoints without database names will have NULL
- Deletion of old checkpoints: metadata deleted normally, no database drop attempted
- New checkpoints: database name captured and persisted

## Testing Strategy

1. **Unit**: safeDropDatabase() validation (guards, name whitelist)
2. **Integration**: Create checkpoint → capture database name → verify stored in metadata
3. **End-to-End**: Create checkpoint → delete checkpoint → verify metadata deleted AND database dropped from SQL Server
4. **Backwards Compat**: Delete old checkpoint without database name → should succeed without errors
5. **Safety**: Try to drop protected database (master, model) → should be rejected
6. **Error Resilience**: Force DROP to fail → checkpoint deletion should still succeed (metadata cleaned)

## Implementation Phases

| Phase | Files | Est. Time | Deliverable |
|-------|-------|-----------|-------------|
| 1. Schema | schema.sql | 5 min | Column added, migration ready |
| 2. Capture | taskWorker.ts | 15 min | Database name extracted from response |
| 3. Store | metadataService.ts | 15 min | Database name persisted to metadata table |
| 4. Drop-Helper | taskWorker.ts | 20 min | Safe DROP implementation with guards |
| 5. Integration | metadataService.ts | 15 min | Wired together: delete → drop database |

**Total**: ~70 minutes for end-to-end implementation

## Files to Modify

1. **src/api/src/db/schema.sql** — Add checkpointDatabaseName column
2. **src/api/src/services/taskWorker.ts** — Capture logic + safeDropDatabase() method
3. **src/api/src/services/metadataService.ts** — Enhance saveCheckpoint() + deleteCheckpoint()

## Open Questions for Developer

1. Should we implement recovery for orphaned databases (scan existing databases)?
2. Should checkpointDatabaseName be indexed for performance?
3. Do we need audit logging of DROP DATABASE operations?
4. What's the rollback strategy if DROP DATABASE partially succeeds?

## Success Criteria

- Checkpoint creation captures and stores database name
- Checkpoint deletion removes metadata AND drops physical database
- No orphaned databases left after checkpoint deletion
- All safety guards prevent accidental system database drops
- Backwards compatible with existing checkpoints
