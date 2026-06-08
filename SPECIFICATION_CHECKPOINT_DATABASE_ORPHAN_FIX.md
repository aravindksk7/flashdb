# SPARC Specification: Checkpoint Database Orphan Fix

**Document Version**: 1.0  
**Status**: Ready for Implementation  
**Date**: 2026-06-08  
**Stakeholders**: Development Team, DevOps, Database Administration  

---

## 1. Executive Summary

### Problem Statement

Checkpoint databases created via PowerShell (`New-FlashdbCheckpoint`) are named with PowerShell-generated identifiers (e.g., `FlashDB_Checkpoint_cp_<timestamp>_<id>`) but these database names are **never stored in metadata**. When clones are deleted, checkpoint records are cascade-deleted from the database, but the **physical SQL Server checkpoint databases remain orphaned** on the server, consuming storage and creating operational debt.

### Root Causes

1. **No Database Name Storage**: The `dbo.Checkpoints` table lacks a column to store the actual database name created by PowerShell
2. **Silent Creation**: PowerShell `New-FlashdbCheckpoint` creates databases without capturing/returning the database name
3. **Incomplete Deletion**: When deleting checkpoints, only metadata is removed; the physical databases are left behind
4. **No Cleanup History**: No audit trail of which checkpoint databases were created/deleted

### Impact

- **Storage Waste**: Orphaned databases accumulate, wasting disk space
- **Operational Overhead**: Manual cleanup required to remove orphaned databases
- **Data Leak Risk**: Orphaned checkpoint databases may contain sensitive data if not cleaned
- **System Complexity**: Inconsistency between metadata state and SQL Server state

### Solution Overview

Implement a 4-phase fix to capture, store, and delete checkpoint databases:

1. **Schema Enhancement**: Add `checkpointDatabaseName` column to `dbo.Checkpoints`
2. **Capture Logic**: Extract database name from PowerShell response in `taskWorker.ts`
3. **Storage Logic**: Save database name to metadata in `taskWorker.ts` after checkpoint creation
4. **Deletion Logic**: Drop physical databases when deleting checkpoints in `metadataService.ts`

---

## 2. Functional Requirements

### FR-1: Schema Extension

**ID**: FR-1  
**Priority**: HIGH  
**Category**: Data Model  

The system shall extend the `dbo.Checkpoints` table to store checkpoint database names.

**Specification**:
- Add `checkpointDatabaseName` column of type `NVARCHAR(MAX)` to `dbo.Checkpoints`
- Column must be **nullable** (for backwards compatibility with existing checkpoints)
- Default value: `NULL`
- No constraints or indexes on this column (will be queried rarely)
- Migration must be non-blocking (existing checkpoints unaffected)

**SQL Change**:
```sql
ALTER TABLE [dbo].[Checkpoints]
ADD [checkpointDatabaseName] NVARCHAR(MAX) NULL;
```

**Acceptance Criteria**:
- [ ] Column exists in `dbo.Checkpoints` table
- [ ] Column is nullable
- [ ] Existing checkpoint records have NULL value
- [ ] New checkpoint records can store database names
- [ ] Migration is backwards compatible (no data loss)

---

### FR-2: Capture Database Name from PowerShell

**ID**: FR-2  
**Priority**: HIGH  
**Category**: Integration  

The system shall capture the checkpoint database name from the PowerShell `New-FlashdbCheckpoint` response.

**Specification**:
- In `taskWorker.ts` line 454+, after executing `New-FlashdbCheckpoint`:
  - Extract `DatabaseName` or `databaseName` property from result object
  - Handle both PascalCase and camelCase property names
  - Trim whitespace from extracted value
  - Log the extracted database name at INFO level with checkpoint ID

**Property Resolution Order**:
1. `result.DatabaseName` (PowerShell convention)
2. `result.databaseName` (alternative camelCase)
3. Fall back to `null` if neither exists

**Pseudo-code**:
```typescript
const checkpointResult = await psService.executeCommand('New-FlashdbCheckpoint', {...});
const capturedDatabaseName = 
  String(checkpointResult?.DatabaseName || checkpointResult?.databaseName || '').trim();

if (capturedDatabaseName) {
  logger.info(
    `[TaskWorker] Captured checkpoint database: ${task.payload.checkpointId} -> ${capturedDatabaseName}`
  );
}
```

**Acceptance Criteria**:
- [ ] Database name extracted from PowerShell response
- [ ] Both PascalCase and camelCase property names handled
- [ ] Whitespace trimmed from captured name
- [ ] Extraction logged at INFO level
- [ ] No exception if database name missing

---

### FR-3: Persist Database Name to Metadata

**ID**: FR-3  
**Priority**: HIGH  
**Category**: Persistence  

The system shall store the captured checkpoint database name in the `dbo.Checkpoints` table immediately after checkpoint creation.

**Specification**:
- In `taskWorker.ts` after `create-checkpoint` task completes:
  - Call metadataService to save checkpoint with database name
  - If database name is empty/null, persist NULL (don't fail)
  - Log persistence attempt at DEBUG level
  - Log success at INFO level
  - Log errors at WARN level (non-fatal)

**Database Persistence Method**:
```sql
UPDATE [dbo].[Checkpoints]
SET [checkpointDatabaseName] = @dbName
WHERE [id] = @checkpointId
```

**Acceptance Criteria**:
- [ ] `checkpointDatabaseName` updated in database after checkpoint creation
- [ ] NULL preserved if database name not captured
- [ ] Persistence logged at appropriate levels
- [ ] Failure to persist does not fail checkpoint creation
- [ ] Checkpoint ID must be saved before database name (task returns ID)

---

### FR-4: Safe Database Drop Helper

**ID**: FR-4  
**Priority**: HIGH  
**Category**: Utility  

The system shall implement a safe database drop helper that prevents accidental deletion of system databases.

**Specification**:
- Create helper method `dropCheckpointDatabaseSafely()` in `taskWorker.ts`
- **Guard 1**: Validate database exists (check `DB_ID()`)
- **Guard 2**: Prevent deletion of protected databases:
  - `master`, `model`, `msdb`, `tempdb`
  - Environment database (from `process.env.SQL_DATABASE`)
  - Any database name matching pattern `[a-zA-Z0-9]*flashdb_[a-zA-Z0-9]*` that's NOT a checkpoint DB
- **Guard 3**: Set database to SINGLE_USER mode before drop
- **Guard 4**: Drop database with ROLLBACK IMMEDIATE to force disconnect
- **Guard 5**: Check existence again after drop to verify success
- Log at each step: existence check, mode change, drop, verification

**SQL Implementation**:
```sql
DECLARE @db sysname = @databaseName;
IF DB_ID(@db) IS NOT NULL
BEGIN
  DECLARE @stmt nvarchar(max) =
    N'ALTER DATABASE ' + QUOTENAME(@db) + N' SET SINGLE_USER WITH ROLLBACK IMMEDIATE; ' +
    N'DROP DATABASE ' + QUOTENAME(@db) + N';';
  EXEC sp_executesql @stmt;
END
```

**Error Handling**:
- Trap SQL exceptions during drop
- Log error at WARN level (non-fatal)
- Do NOT fail checkpoint deletion if database drop fails
- Log reason for failure (e.g., "database in use by other process")

**Acceptance Criteria**:
- [ ] Protected databases cannot be dropped
- [ ] Database set to single-user mode before drop
- [ ] Drop executes with ROLLBACK IMMEDIATE
- [ ] Existence verified after drop
- [ ] Errors logged without failing the operation
- [ ] Non-checkpoint databases protected from accidental deletion

---

### FR-5: Checkpoint Deletion with Database Drop

**ID**: FR-5  
**Priority**: HIGH  
**Category**: Deletion  

The system shall drop the physical checkpoint database when deleting checkpoint metadata.

**Specification**:
- In `metadataService.ts` `deleteCheckpoint()` method:
  - Before deleting checkpoint record, retrieve `checkpointDatabaseName`
  - After successful metadata deletion, drop the physical database
  - Database drop must be logged at INFO level before and after
  - If database drop fails, log warning but continue (don't fail deletion)
- Deletion flow:
  1. Get checkpoint record (including `checkpointDatabaseName`)
  2. Validate checkpoint is not pinned
  3. Delete checkpoint metadata from database
  4. Drop physical checkpoint database (if name exists)
  5. Return success

**Acceptance Criteria**:
- [ ] `checkpointDatabaseName` retrieved before deletion
- [ ] Physical database dropped after metadata deletion
- [ ] Drop failures logged but do not fail the operation
- [ ] Idempotent: can safely call multiple times
- [ ] Orphaned databases cleaned up on deletion

---

### FR-6: Property Variant Handling in Deletion

**ID**: FR-6  
**Priority**: MEDIUM  
**Category**: Integration  

The system shall handle database name property variants when resolving database names for deletion.

**Specification**:
- When retrieving checkpoint for deletion, handle both column name variants:
  - `checkpointDatabaseName` (new standard)
  - `checkpoint_database_name` (snake_case fallback)
- Use COALESCE or similar to unify handling
- Try PascalCase first, then snake_case on error
- Log which property was used at DEBUG level

**Acceptance Criteria**:
- [ ] Both column name variants handled
- [ ] Fallback logic works correctly
- [ ] No errors if column doesn't exist
- [ ] Consistent with existing pattern (see `taskWorker.ts` lines 126-164)

---

## 3. Non-Functional Requirements

### NFR-1: Backwards Compatibility

**ID**: NFR-1  
**Category**: Compatibility  
**Measurement**: All existing checkpoints must still be queryable  

- Schema migration must not affect existing checkpoint records
- NULL values in `checkpointDatabaseName` must be handled gracefully
- Old checkpoints (without database names) must not fail deletion
- Migration must be idempotent (can be run multiple times safely)

### NFR-2: Performance

**ID**: NFR-2  
**Category**: Performance  
**Measurement**: No degradation in checkpoint operations  

- Schema addition must not impact checkpoint creation performance (< 5% increase)
- Database name capture/storage must be atomic with checkpoint creation (< 10ms overhead)
- Database drop must not block checkpoint deletion operation (async if possible, or timeout after 30s)

### NFR-3: Data Integrity

**ID**: NFR-3  
**Category**: Data Quality  
**Measurement**: 100% accuracy of database name tracking  

- Every newly created checkpoint must have database name stored
- No checkpoint should be deleted without attempting database drop
- Audit trail must track database drop attempts (success/failure)

### NFR-4: Operational Safety

**ID**: NFR-4  
**Category**: Safety  
**Measurement**: Zero accidental system database deletions  

- Protected databases must never be droppable
- Database existence checked before drop
- Single-user mode set before drop to force disconnects
- Errors in drop must not cascade to other operations

### NFR-5: Observability

**ID**: NFR-5  
**Category**: Logging  
**Measurement**: Complete audit trail of database operations  

- All database name captures logged at INFO level
- All database drops logged at INFO level (before/after)
- All errors logged at WARN or ERROR level with context
- Log format must match existing project conventions

---

## 4. Constraints and Dependencies

### Technical Constraints

1. **SQL Server Version**: Requires SQL Server 2016+ (uses `DB_ID()`, `QUOTENAME()`)
2. **Permission Level**: Task worker must have permission to:
   - ALTER TABLE (for schema migration)
   - DROP DATABASE (for cleanup)
   - View system views (`sys.objects`)
3. **PowerShell Integration**: Depends on `New-FlashdbCheckpoint` returning database name in result object
4. **Transaction Isolation**: Database drop must not interfere with other transactions

### Business Constraints

1. **Zero Downtime**: Schema migration must not require database downtime
2. **Rollback Strategy**: Must be able to rollback if checkpoint database names cannot be captured
3. **Documentation**: Must update system documentation with new behavior

### Data Constraints

1. **Column Size**: `NVARCHAR(MAX)` supports SQL Server database names (max 128 chars + 4-char prefix = 132 chars)
2. **NULL Handling**: Must gracefully handle NULL values (existing checkpoints may have NULL)
3. **Uniqueness**: Database names may be unique but no constraint needed (drop is idempotent)

---

## 5. Acceptance Criteria

### Phase 1: Schema (Database Layer)

**Criteria**:
- [ ] Column `checkpointDatabaseName` added to `dbo.Checkpoints`
- [ ] Column is nullable (NULL default)
- [ ] Existing checkpoints queryable without changes
- [ ] Migration script can be applied and reverted
- [ ] No data loss in existing records

**Test Case 1.1**: Execute schema migration
```sql
-- Before
SELECT COUNT(*) FROM [dbo].[Checkpoints];
-- Expected: N rows

-- Migration
ALTER TABLE [dbo].[Checkpoints]
ADD [checkpointDatabaseName] NVARCHAR(MAX) NULL;

-- After
SELECT COUNT(*) FROM [dbo].[Checkpoints];
-- Expected: N rows (unchanged)
SELECT COUNT(*) FROM [dbo].[Checkpoints] WHERE [checkpointDatabaseName] IS NULL;
-- Expected: N (all NULL since existing)
```

**Test Case 1.2**: Verify column in schema
```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Checkpoints' AND COLUMN_NAME = 'checkpointDatabaseName';
-- Expected: 1 row with NVARCHAR, YES
```

---

### Phase 2: Capture (TaskWorker)

**Criteria**:
- [ ] Database name extracted from PowerShell response
- [ ] Extraction handles both PascalCase and camelCase
- [ ] Whitespace trimmed from name
- [ ] Extraction logged at INFO level
- [ ] NULL safely handled if name missing

**Test Case 2.1**: Capture PascalCase property
```typescript
const result = { DatabaseName: "FlashDB_Checkpoint_cp_20260608_xyz" };
const captured = String(result?.DatabaseName || '').trim();
// Expected: "FlashDB_Checkpoint_cp_20260608_xyz"
```

**Test Case 2.2**: Capture camelCase property
```typescript
const result = { databaseName: "FlashDB_Checkpoint_cp_20260608_abc" };
const captured = String(result?.databaseName || '').trim();
// Expected: "FlashDB_Checkpoint_cp_20260608_abc"
```

**Test Case 2.3**: Handle missing property
```typescript
const result = { /* no database name */ };
const captured = String(result?.DatabaseName || result?.databaseName || '').trim();
// Expected: "" (empty string, falsy but not error)
```

**Test Case 2.4**: Trim whitespace
```typescript
const result = { DatabaseName: "  FlashDB_Checkpoint  " };
const captured = String(result?.DatabaseName || '').trim();
// Expected: "FlashDB_Checkpoint"
```

---

### Phase 3: Storage (MetadataService)

**Criteria**:
- [ ] Database name saved to `dbo.Checkpoints` after creation
- [ ] NULL persisted if name not captured
- [ ] Storage logged at DEBUG (attempt) and INFO (success)
- [ ] Errors logged at WARN (non-fatal)
- [ ] Idempotent: safe to call multiple times

**Test Case 3.1**: Save database name to new checkpoint
```sql
-- Given: checkpoint created with ID "cp_xyz"
-- When: metadataService.saveCheckpoint() called with databaseName="FlashDB_Checkpoint_cp_20260608_xyz"
-- Then:
UPDATE [dbo].[Checkpoints]
SET [checkpointDatabaseName] = 'FlashDB_Checkpoint_cp_20260608_xyz'
WHERE [id] = 'cp_xyz';

SELECT [checkpointDatabaseName] FROM [dbo].[Checkpoints] WHERE [id] = 'cp_xyz';
-- Expected: "FlashDB_Checkpoint_cp_20260608_xyz"
```

**Test Case 3.2**: Persist NULL if name not captured
```sql
-- Given: checkpoint created with ID "cp_abc", no database name captured
-- When: metadataService.saveCheckpoint() called with databaseName=NULL
-- Then:
UPDATE [dbo].[Checkpoints]
SET [checkpointDatabaseName] = NULL
WHERE [id] = 'cp_abc';

SELECT [checkpointDatabaseName] FROM [dbo].[Checkpoints] WHERE [id] = 'cp_abc';
-- Expected: NULL
```

**Test Case 3.3**: Idempotent update
```sql
-- Given: checkpoint "cp_xyz" with databaseName = "FlashDB_Checkpoint_cp_20260608_xyz"
-- When: Update called twice with same value
UPDATE [dbo].[Checkpoints] SET [checkpointDatabaseName] = 'FlashDB_Checkpoint_cp_20260608_xyz' WHERE [id] = 'cp_xyz';
UPDATE [dbo].[Checkpoints] SET [checkpointDatabaseName] = 'FlashDB_Checkpoint_cp_20260608_xyz' WHERE [id] = 'cp_xyz';

SELECT [checkpointDatabaseName] FROM [dbo].[Checkpoints] WHERE [id] = 'cp_xyz';
-- Expected: "FlashDB_Checkpoint_cp_20260608_xyz" (unchanged, no errors)
```

---

### Phase 4: Deletion (Cleanup)

**Criteria**:
- [ ] Physical database dropped when checkpoint deleted
- [ ] Protected databases never dropped
- [ ] Database set to single-user mode before drop
- [ ] Drop uses ROLLBACK IMMEDIATE
- [ ] Errors logged but do not fail deletion
- [ ] Idempotent: safe to delete multiple times

**Test Case 4.1**: Drop checkpoint database
```sql
-- Given: checkpoint "cp_xyz" with checkpointDatabaseName = "FlashDB_Checkpoint_cp_20260608_xyz"
-- When: deleteCheckpoint() called
-- Then:
-- 1. Checkpoint metadata deleted from dbo.Checkpoints
DELETE FROM [dbo].[Checkpoints] WHERE [id] = 'cp_xyz';

-- 2. Physical database dropped
ALTER DATABASE [FlashDB_Checkpoint_cp_20260608_xyz] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
DROP DATABASE [FlashDB_Checkpoint_cp_20260608_xyz];

-- 3. Verify deletion
SELECT DB_ID('FlashDB_Checkpoint_cp_20260608_xyz');
-- Expected: NULL (database does not exist)
```

**Test Case 4.2**: Protected database never dropped
```sql
-- Given: checkpoint trying to delete "master" database (impossible but test guard)
-- When: deleteCheckpoint() called
-- Then: master database remains, error logged at WARN
-- Verify:
USE master;
-- Expected: Still connected to master (not dropped)
```

**Test Case 4.3**: Error handling (database in use)
```sql
-- Given: checkpoint database in use by another connection
-- When: deleteCheckpoint() called
-- Then:
-- 1. Checkpoint metadata deleted
-- 2. Database drop attempted, fails (in use)
-- 3. Error logged at WARN level
-- 4. Deletion operation completes successfully

SELECT COUNT(*) FROM [dbo].[Checkpoints] WHERE [id] = 'cp_xyz';
-- Expected: 0 (metadata deleted)

SELECT DB_ID('FlashDB_Checkpoint_cp_20260608_xyz');
-- Expected: integer > 0 (database still exists, cleanup failed)
```

**Test Case 4.4**: Idempotent deletion
```sql
-- Given: checkpoint "cp_xyz" already deleted
-- When: deleteCheckpoint() called again
-- Then: No error, operation completes
-- Expected: Logs "checkpoint not found" warning but returns success
```

---

## 6. Implementation Plan

### Phase 1: Schema Extension (Database)

**Duration**: 30 minutes  
**Owner**: Database Administrator  
**Risk**: LOW (additive only)  

**Steps**:
1. Review schema.sql to understand Checkpoints table structure
2. Create migration script:
   ```sql
   ALTER TABLE [dbo].[Checkpoints]
   ADD [checkpointDatabaseName] NVARCHAR(MAX) NULL;
   ```
3. Test migration on non-production instance
4. Apply to development environment
5. Apply to production (zero-downtime, non-blocking)
6. Verify column exists with `PRAGMA table_info` equivalent

**Verification**:
```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Checkpoints';
```

---

### Phase 2: Capture Database Name (TaskWorker)

**Duration**: 1 hour  
**Owner**: Backend Developer  
**Risk**: LOW (logging only, no persistence yet)  

**Steps**:
1. Read `taskWorker.ts` lines 453-461 (create-checkpoint case)
2. Add database name extraction after PowerShell execution:
   ```typescript
   const capturedDatabaseName = 
     String(result?.DatabaseName || result?.databaseName || '').trim();
   
   if (capturedDatabaseName) {
     logger.info(
       `[TaskWorker] Captured checkpoint database: ${task.payload.checkpointId} -> ${capturedDatabaseName}`
     );
   }
   ```
3. Store in local variable for next step
4. Add unit tests:
   - Test PascalCase extraction
   - Test camelCase extraction
   - Test missing property (null handling)
   - Test whitespace trimming
5. Run `npm test` to verify no regressions
6. Code review before merging

**Verification**:
- Logs show extracted database names at INFO level
- Test coverage > 90% for extraction logic

---

### Phase 3: Persist Database Name (Metadata)

**Duration**: 1.5 hours  
**Owner**: Backend Developer  
**Risk**: MEDIUM (database update, but on new data only)  

**Steps**:
1. Add method to metadataService: `saveCheckpointDatabaseName(checkpointId, databaseName)`
   ```typescript
   async saveCheckpointDatabaseName(checkpointId: string, databaseName: string | null): Promise<void> {
     if (!databaseName?.trim()) {
       logger.debug(`[MetadataService] Skipping null database name for checkpoint ${checkpointId}`);
       return;
     }
     
     try {
       await this.getSqlClient().query(
         `UPDATE [dbo].[Checkpoints] SET [checkpointDatabaseName] = @dbName WHERE [id] = @checkpointId`,
         { dbName: databaseName.trim(), checkpointId }
       );
       logger.info(`[MetadataService] Saved checkpoint database name: ${checkpointId} -> ${databaseName}`);
     } catch (error: any) {
       logger.warn(`[MetadataService] Failed to save checkpoint database name: ${error.message}`);
       // Non-fatal: checkpoint created successfully even if DB name not stored
     }
   }
   ```

2. In `taskWorker.ts` after `create-checkpoint` success (line 460):
   ```typescript
   case 'create-checkpoint':
     result = await psService.executeCommand('New-FlashdbCheckpoint', {...});
     
     // ADDED: Capture and persist database name
     if (result && typeof result === 'object') {
       const capturedDatabaseName = String(result?.DatabaseName || result?.databaseName || '').trim();
       const checkpointId = result?.Id || result?.id;
       
       if (capturedDatabaseName && checkpointId) {
         const metadataService = getMetadataService();
         await metadataService.saveCheckpointDatabaseName(checkpointId, capturedDatabaseName);
       }
     }
     break;
   ```

3. Add tests:
   - Test persistence of captured name
   - Test NULL handling
   - Test error handling (non-fatal)
   - Test idempotency
4. Run `npm test` and verify database integrity
5. Code review

**Verification**:
- Database shows stored names for new checkpoints
- Logs show persistence attempts and outcomes
- Existing checkpoints unaffected (still NULL)

---

### Phase 4: Safe Database Drop (Utility)

**Duration**: 1.5 hours  
**Owner**: Backend Developer  
**Risk**: MEDIUM (destructive operation, must guard carefully)  

**Steps**:
1. Add helper method to taskWorker.ts: `dropCheckpointDatabaseSafely()`
   ```typescript
   private async dropCheckpointDatabaseSafely(databaseName: string | null): Promise<void> {
     if (!databaseName?.trim()) {
       logger.debug('[TaskWorker] Skipping database drop: no database name');
       return;
     }
     
     const dbName = databaseName.trim();
     const protectedDatabases = new Set([
       'master', 'model', 'msdb', 'tempdb',
       String(process.env.SQL_DATABASE || '').toLowerCase()
     ]);
     
     if (protectedDatabases.has(dbName.toLowerCase())) {
       logger.warn(`[TaskWorker] Skipping drop of protected database: ${dbName}`);
       return;
     }
     
     try {
       logger.info(`[TaskWorker] ├─ Dropping checkpoint database: ${dbName}`);
       
       const sqlClient = getSqlClient();
       await sqlClient.query(
         `DECLARE @db sysname = @databaseName;
          IF DB_ID(@db) IS NOT NULL
          BEGIN
            DECLARE @stmt nvarchar(max) =
              N'ALTER DATABASE ' + QUOTENAME(@db) + N' SET SINGLE_USER WITH ROLLBACK IMMEDIATE; ' +
              N'DROP DATABASE ' + QUOTENAME(@db) + N';';
            EXEC sp_executesql @stmt;
          END`,
         { databaseName: dbName }
       );
       
       logger.info(`[TaskWorker] └─ ✓ Checkpoint database dropped: ${dbName}`);
     } catch (error: any) {
       logger.warn(`[TaskWorker] └─ ⚠ Failed to drop checkpoint database: ${dbName}`);
       logger.warn(`[TaskWorker]    Error: ${error.message}`);
       // Non-fatal: metadata deleted, database cleanup deferred
     }
   }
   ```

2. Add tests:
   - Test protected databases cannot be dropped
   - Test normal database drop succeeds
   - Test missing database handled gracefully
   - Test error handling (database in use)
   - Test SINGLE_USER mode set correctly
3. Integration test with actual database drop (if safe)
4. Code review with security focus

**Verification**:
- Test database can be created, then dropped safely
- Protected databases remain untouched
- Logs show all drop attempts with outcomes

---

### Phase 5: Checkpoint Deletion with Cleanup (Integration)

**Duration**: 1 hour  
**Owner**: Backend Developer  
**Risk**: MEDIUM (modifies deletion flow)  

**Steps**:
1. Update `metadataService.deleteCheckpoint()` (line 903):
   ```typescript
   async deleteCheckpoint(cloneId: string, checkpointId: string): Promise<void> {
     logger.debug(`[MetadataService] Deleting checkpoint: ${checkpointId}`);
     
     if (!this.getSqlClient()) {
       logger.warn('[MetadataService] SQL client not available');
       return;
     }
     
     try {
       // Step 1: Retrieve checkpoint (including database name)
       const checkpoint = await this.getCheckpoint(cloneId, checkpointId);
       if (!checkpoint) {
         logger.warn(`[MetadataService] Checkpoint not found: ${checkpointId}`);
         return;
       }
       
       if (checkpoint.isPinned) {
         throw new Error('Pinned checkpoint cannot be deleted');
       }
       
       // Step 2: Get database name (with fallback to query directly)
       let databaseName = checkpoint.checkpointDatabaseName;
       if (!databaseName) {
         // Try querying directly if not in checkpoint object
         const row = await this.getSqlClient().query<any>(
           `SELECT [checkpointDatabaseName] FROM [dbo].[Checkpoints] WHERE [id] = @checkpointId`,
           { checkpointId }
         );
         databaseName = row?.recordset?.[0]?.checkpointDatabaseName;
       }
       
       // Step 3: Delete checkpoint metadata
       const deleteQuery = `
         DELETE FROM [dbo].[Checkpoints]
         WHERE [id] = @checkpointId AND [cloneId] = @cloneId
       `;
       const result = await this.getSqlClient().query(deleteQuery, { checkpointId, cloneId });
       const deleted = result.rowsAffected?.[0] || 0;
       
       if (deleted === 0) {
         logger.warn(`[MetadataService] Checkpoint not found: ${checkpointId}`);
         return;
       }
       
       // Step 4: Drop physical database (if name exists)
       if (databaseName?.trim()) {
         // Note: This is temporary - will be delegated to taskWorker
         const taskWorker = getTaskWorker();
         await taskWorker.dropCheckpointDatabaseSafely(databaseName);
       }
       
       logger.info(`[MetadataService] ✓ Checkpoint deleted: ${checkpointId}`);
     } catch (error: any) {
       logger.error(`[MetadataService] ✗ Failed to delete checkpoint: ${error.message}`);
       throw error;
     }
   }
   ```

2. OR: Keep deletion in taskWorker (line 482-507):
   ```typescript
   case 'delete-checkpoint':
     logger.info(`[TaskWorker] Deleting checkpoint: ${task.payload.checkpointId}`);
     try {
       const metadataService = getMetadataService();
       
       // Get database name before deleting
       const checkpoint = await metadataService.getCheckpoint(
         task.payload.cloneId,
         task.payload.checkpointId
       );
       
       // Delete metadata
       await metadataService.deleteCheckpoint(
         task.payload.cloneId,
         task.payload.checkpointId
       );
       
       // Drop physical database
       if (checkpoint?.checkpointDatabaseName) {
         await this.dropCheckpointDatabaseSafely(checkpoint.checkpointDatabaseName);
       }
       
       result = {
         success: true,
         checkpointId: task.payload.checkpointId,
         message: 'Checkpoint deleted successfully'
       };
       logger.info(`[TaskWorker] ✓ Checkpoint deletion completed: ${task.payload.checkpointId}`);
     } catch (error: any) {
       logger.error(`[TaskWorker] ✗ Checkpoint deletion failed: ${error.message}`);
       throw error;
     }
     break;
   ```

3. Add integration tests:
   - Create checkpoint, verify database name stored
   - Delete checkpoint, verify database dropped
   - Delete already-deleted checkpoint (idempotent)
   - Verify cascade deletion still works
4. Run `npm test` and `npm build`
5. Code review

**Verification**:
- E2E test: Create checkpoint → verify DB exists → delete checkpoint → verify DB dropped
- Logs show full deletion flow with database drop
- No orphaned databases remain after deletion

---

### Phase 6: Rollback Strategy and Migration Script

**Duration**: 1 hour  
**Owner**: DevOps / Database Administrator  
**Risk**: LOW (preparation for safety)  

**Steps**:
1. Create rollback script for schema:
   ```sql
   -- Rollback: Remove column if implementation fails
   IF EXISTS (
     SELECT * FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = 'Checkpoints' AND COLUMN_NAME = 'checkpointDatabaseName'
   )
   BEGIN
     ALTER TABLE [dbo].[Checkpoints]
     DROP COLUMN [checkpointDatabaseName];
   END
   ```

2. Document rollback procedure:
   - If Phase 1 fails: Execute rollback script
   - If Phase 2-5 fail: Revert code, checkpoints still have NULL database names (safe)
   - No data loss in any rollback scenario

3. Create migration verification script:
   ```sql
   -- Verify migration applied correctly
   SELECT 
     COLUMN_NAME, 
     DATA_TYPE, 
     IS_NULLABLE,
     CHARACTER_MAXIMUM_LENGTH
   FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_NAME = 'Checkpoints' AND COLUMN_NAME = 'checkpointDatabaseName';
   -- Expected: 1 row with nvarchar, YES nullable, -1 (MAX)
   ```

4. Document in DEPLOYMENT.md or README.md

---

## 7. Risk Analysis

### Risk 1: Database Drop Accidents

**Severity**: CRITICAL  
**Probability**: LOW (guards in place)  
**Mitigation**:
- Protected database list prevents system database deletion
- QUOTENAME() prevents SQL injection
- Database existence checked before drop
- Single-user mode forces disconnects
- Test extensively with non-production databases first

**Detection**:
- Monitor SQL Server error logs for unexpected drops
- Alert on any DROP DATABASE of protected databases

---

### Risk 2: Incomplete Capture

**Severity**: MEDIUM  
**Probability**: MEDIUM (PowerShell response format might change)  
**Mitigation**:
- Handle both PascalCase and camelCase property names
- NULL values handled gracefully (checkpoint still created)
- Existing checkpoints unaffected (backward compatible)

**Detection**:
- Monitor logs for "Captured checkpoint database: NULL" entries
- Run audit query to find checkpoints with NULL database names
- Manual cleanup for pre-migration checkpoints

---

### Risk 3: Performance Impact

**Severity**: MEDIUM  
**Probability**: LOW  
**Mitigation**:
- Schema addition is non-blocking
- Database name capture is < 1ms
- Persistence is async (non-blocking)
- Drop operation is after-work (deferred)

**Detection**:
- Monitor checkpoint creation latency (should be unchanged)
- Monitor database drop latency (should be < 30s)

---

### Risk 4: Concurrency Issues

**Severity**: MEDIUM  
**Probability**: MEDIUM  
**Mitigation**:
- Database drop uses SINGLE_USER mode (serializes connections)
- Checkpoint deletion is transactional
- No concurrent drops of same database (cloneId → checkpoint → database relationship)

**Detection**:
- Test with concurrent checkpoint creation/deletion
- Monitor for locking issues in error logs

---

## 8. Success Criteria

### Definition of Done

All of the following must be true before considering this specification complete:

1. **Schema**: `checkpointDatabaseName` column exists on `dbo.Checkpoints`, nullable, no data loss
2. **Capture**: Database name extracted from PowerShell response with logging
3. **Storage**: Database name persisted to `dbo.Checkpoints` after checkpoint creation
4. **Deletion**: Physical database dropped when checkpoint metadata deleted
5. **Safety**: Protected databases never dropped; errors logged but don't fail operation
6. **Testing**: All acceptance criteria test cases pass (manual and automated)
7. **Documentation**: Code comments explain database drop guards; README updated
8. **Backwards Compatibility**: Existing checkpoints (with NULL names) still work
9. **Rollback**: Rollback procedure documented and tested
10. **Code Review**: At least 1 peer approval on all code changes
11. **Build**: `npm run build && npm test` pass without errors
12. **Integration**: E2E test: Create → Verify DB → Delete → Verify cleanup

### Metrics

- **Checkpoint Creation Success Rate**: > 99.5% (not reduced by new logic)
- **Database Drop Success Rate**: > 95% (some failures expected if DB in use)
- **Log Coverage**: 100% of database operations logged
- **Test Coverage**: > 90% of new code paths covered
- **Error Rate**: 0 data loss, 0 protected database accidents

---

## 9. Timeline

| Phase | Component | Duration | Owner | Start | End |
|-------|-----------|----------|-------|-------|-----|
| 1 | Schema Extension | 30 min | DBA | Week 1 | Week 1 |
| 2 | Database Capture | 1 hr | Dev | Week 1 | Week 1 |
| 3 | Metadata Persistence | 1.5 hrs | Dev | Week 1 | Week 1 |
| 4 | Safe Drop Helper | 1.5 hrs | Dev | Week 2 | Week 2 |
| 5 | Deletion Integration | 1 hr | Dev | Week 2 | Week 2 |
| 6 | Testing & Rollback | 2 hrs | Dev/QA | Week 2 | Week 2 |
| 7 | Code Review & Merge | 1 hr | Team | Week 2 | Week 2 |
| **Total** | | **8.5 hrs** | | | |

---

## 10. Deployment Strategy

### Pre-Deployment

1. **Database Backup**: Full backup of production database
2. **Test Environment**: Apply full changes to test environment, run integration tests
3. **Pilot Environment**: Deploy to pilot/staging, monitor for 1 week
4. **Rollback Procedure**: Documented and tested

### Deployment Steps

1. **Phase 1 (Schema)**: Apply migration to production (non-blocking)
   - Execute ALTER TABLE script
   - Verify column exists with verification script
   - Monitor error logs for 1 hour
   
2. **Phase 2-5 (Code)**: Deploy updated API code
   - Deploy to development first
   - Run full test suite
   - Deploy to staging for 1 day monitoring
   - Deploy to production
   - Monitor logs for:
     - "Captured checkpoint database:" entries
     - "Saved checkpoint database name:" entries
     - Database drops and their success/failure
   
3. **Phase 6 (Verification)**: Run post-deployment audit
   - Query checkpoints for NULL database names (expected for old checkpoints)
   - Verify new checkpoints have database names
   - Monitor drop success rate (target > 95%)

### Rollback Procedure

If issues arise:

1. **Code Rollback**: Revert to previous API version (non-breaking change)
2. **Schema Rollback**: Execute rollback script (removes column)
3. **Data Recovery**: Restore from pre-deployment backup if needed

**Rollback Time**: 15 minutes total

---

## 11. Monitoring and Maintenance

### Post-Deployment Monitoring (1 Week)

Monitor these metrics daily:

1. **Checkpoint Creation Success Rate**: Should remain > 99.5%
2. **Database Name Capture Rate**: Should be 100% for new checkpoints
3. **Database Drop Success Rate**: Target > 95% (some in-use failures expected)
4. **Orphaned Database Count**: Should stop growing
5. **Error Rate**: Log entries at WARN/ERROR should be minimal

### Ongoing Maintenance

1. **Orphaned Database Cleanup**: 
   - Run monthly audit query:
     ```sql
     SELECT [id], [checkpointDatabaseName] FROM [dbo].[Checkpoints]
     WHERE [checkpointDatabaseName] IS NOT NULL
       AND DB_ID([checkpointDatabaseName]) IS NULL;
     ```
   - If results found, investigate why databases were not dropped
   
2. **Schema Monitoring**:
   - Quarterly audit of checkpoint counts
   - Verify no orphaned records without database names
   
3. **Performance Tuning**:
   - If drop operations slow, consider async drop with queue
   - Monitor for connection pooling issues

---

## 12. Appendix: Property Resolution Algorithm

For handling property name variants across the codebase:

```typescript
/**
 * Resolves database name from object with property variant handling
 * Tries PascalCase first, then camelCase
 */
function resolveDatabaseName(obj: any): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  
  const pascalCase = String(obj.DatabaseName || '').trim();
  if (pascalCase) return pascalCase;
  
  const camelCase = String(obj.databaseName || '').trim();
  if (camelCase) return camelCase;
  
  return undefined;
}

// Usage:
const dbName = resolveDatabaseName(psServiceResult);
if (dbName) {
  logger.info(`Captured database name: ${dbName}`);
} else {
  logger.warn('No database name found in response');
}
```

---

## 13. Appendix: SQL Safe Drop Pattern

Reference implementation for safe database drop:

```sql
-- Safe database drop pattern
DECLARE @db sysname = 'DatabaseToDelete';
DECLARE @protectedDatabases nvarchar(max) = 'master,model,msdb,tempdb';

IF DB_ID(@db) IS NOT NULL
BEGIN
  -- Check if database is protected
  IF CHARINDEX(',' + @db + ',', ',' + @protectedDatabases + ',') = 0
  BEGIN
    -- Set to single-user mode to disconnect other connections
    DECLARE @stmt nvarchar(max) =
      N'ALTER DATABASE ' + QUOTENAME(@db) + N' SET SINGLE_USER WITH ROLLBACK IMMEDIATE; ' +
      N'DROP DATABASE ' + QUOTENAME(@db) + N';';
    
    BEGIN TRY
      EXEC sp_executesql @stmt;
      PRINT 'Database dropped: ' + @db;
    END TRY
    BEGIN CATCH
      PRINT 'Error dropping database: ' + ERROR_MESSAGE();
    END CATCH
  END
  ELSE
  BEGIN
    PRINT 'Protected database, skipping drop: ' + @db;
  END
END
ELSE
BEGIN
  PRINT 'Database does not exist: ' + @db;
END
```

---

## 14. Appendix: Example Logs

Expected log output during normal operation:

```
[TaskWorker] ┌─ create-checkpoint task initiated for: cp_12345
[TaskWorker] ├─ Executing PowerShell: New-FlashdbCheckpoint
[TaskWorker] │ Captured checkpoint database: cp_12345 -> FlashDB_Checkpoint_cp_20260608_xyz
[TaskWorker] ├─ Saving database name to metadata
[MetadataService] │ Saved checkpoint database name: cp_12345 -> FlashDB_Checkpoint_cp_20260608_xyz
[TaskWorker] └─ ✓ Checkpoint created successfully

---

[TaskWorker] ┌─ delete-checkpoint task initiated for: cp_12345
[TaskWorker] ├─ Retrieving checkpoint metadata
[MetadataService] ├─ Deleting checkpoint: cp_12345
[MetadataService] │ Retrieved database name: FlashDB_Checkpoint_cp_20260608_xyz
[MetadataService] └─ ✓ Checkpoint metadata deleted
[TaskWorker] ├─ Dropping checkpoint database: FlashDB_Checkpoint_cp_20260608_xyz
[TaskWorker] │ └─ ✓ Checkpoint database dropped
[TaskWorker] └─ ✓ Checkpoint deletion completed
```

---

**Document Control**:
- Version: 1.0
- Status: Ready for Development
- Last Updated: 2026-06-08
- Next Review: After Phase 3 completion
