# Verification Plan: Checkpoint Database Orphan Fix

This document provides a step-by-step verification plan to ensure the implementation is correct and complete.

---

## Pre-Implementation Verification

### Verify Current State

Run these queries to document the baseline:

```sql
-- Count existing checkpoints
SELECT 
  COUNT(*) AS total_checkpoints,
  COUNT(*) FILTER (WHERE [checkpointDatabaseName] IS NOT NULL) AS with_db_name,
  COUNT(*) FILTER (WHERE [checkpointDatabaseName] IS NULL) AS without_db_name
FROM [dbo].[Checkpoints];

-- List all databases like checkpoint
SELECT name FROM sys.databases 
WHERE name LIKE 'FlashDB_Checkpoint%'
ORDER BY name;

-- Document creation dates
SELECT 
  [id], 
  [cloneId], 
  [checkpointName], 
  [createdAt]
FROM [dbo].[Checkpoints]
ORDER BY [createdAt] DESC;
```

---

## Phase 1 Verification: Schema Extension

### Checklist

- [ ] Column `checkpointDatabaseName` added
- [ ] Column type is `NVARCHAR(MAX)`
- [ ] Column is nullable (NULL default)
- [ ] No data loss in existing records
- [ ] Verify via SQL query

### Verification Steps

**Step 1.1**: Verify column exists
```sql
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'Checkpoints' AND COLUMN_NAME = 'checkpointDatabaseName';

-- Expected result:
-- COLUMN_NAME: checkpointDatabaseName
-- DATA_TYPE: nvarchar
-- IS_NULLABLE: YES
-- CHARACTER_MAXIMUM_LENGTH: -1 (means MAX)
```

**Step 1.2**: Verify existing data unchanged
```sql
SELECT COUNT(*) AS checkpoint_count FROM [dbo].[Checkpoints];
-- Should match pre-implementation count
```

**Step 1.3**: Verify column is NULL for existing checkpoints
```sql
SELECT COUNT(*) AS null_count 
FROM [dbo].[Checkpoints] 
WHERE [checkpointDatabaseName] IS NULL;

-- Should equal or exceed pre-migration checkpoint count
```

**Step 1.4**: Verify column is updatable
```sql
-- Test update
UPDATE [dbo].[Checkpoints] 
SET [checkpointDatabaseName] = 'TestDB_12345'
WHERE [id] = 'test_checkpoint_id';

-- Verify update
SELECT [checkpointDatabaseName] FROM [dbo].[Checkpoints]
WHERE [id] = 'test_checkpoint_id';
-- Should return: TestDB_12345

-- Rollback test
UPDATE [dbo].[Checkpoints] 
SET [checkpointDatabaseName] = NULL
WHERE [id] = 'test_checkpoint_id';
```

---

## Phase 2 Verification: Database Capture

### Checklist

- [ ] Database name extracted from PowerShell response
- [ ] Both PascalCase and camelCase handled
- [ ] Whitespace trimmed
- [ ] Logged at INFO level
- [ ] Non-fatal if missing

### Verification Steps

**Step 2.1**: Review code for capture logic
```typescript
// Verify taskWorker.ts contains this around line 453-470:
const capturedDatabaseName = 
  String(result?.DatabaseName || result?.databaseName || '').trim();

// Should log:
logger.info(`[TaskWorker] Captured checkpoint database: ${checkpointId} -> ${capturedDatabaseName}`);
```

**Step 2.2**: Check logs during checkpoint creation
```bash
# Create a test checkpoint via API
curl -X POST http://localhost:3000/api/checkpoints \
  -H "Content-Type: application/json" \
  -d '{
    "cloneId": "test_clone_id",
    "checkpointName": "test_checkpoint",
    "phase": "manual"
  }'

# Monitor logs in real-time
# Expected log entries:
# [TaskWorker] Captured checkpoint database: cp_xxxxx -> FlashDB_Checkpoint_cp_xxxxx
```

**Step 2.3**: Unit test execution
```bash
npm test -- taskWorker.ts --testNamePattern="capture"

# Expected results:
# ✓ should capture PascalCase DatabaseName property
# ✓ should capture camelCase databaseName property
# ✓ should trim whitespace from database name
# ✓ should handle missing database name gracefully
```

**Step 2.4**: Verify no regressions
```bash
npm test -- taskWorker.ts

# All tests should pass:
# Tests: 50+ passed, 0 failed
```

---

## Phase 3 Verification: Database Storage

### Checklist

- [ ] Database name saved to `dbo.Checkpoints`
- [ ] NULL persisted if name not captured
- [ ] Storage logged at DEBUG (attempt) and INFO (success)
- [ ] Idempotent (safe to call multiple times)

### Verification Steps

**Step 3.1**: Verify new checkpoints have database names stored
```bash
# Create a test checkpoint
curl -X POST http://localhost:3000/api/checkpoints \
  -H "Content-Type: application/json" \
  -d '{
    "cloneId": "test_clone_id",
    "checkpointName": "test_cp_phase3"
  }'

# Wait 5 seconds for async persistence

# Query database
SELECT [id], [checkpointDatabaseName] 
FROM [dbo].[Checkpoints] 
WHERE [checkpointName] = 'test_cp_phase3'
  AND [checkpointDatabaseName] IS NOT NULL;

# Expected: 1 row with database name like FlashDB_Checkpoint_cp_xxxxx
```

**Step 3.2**: Verify old checkpoints still have NULL
```sql
SELECT COUNT(*) AS old_null_count
FROM [dbo].[Checkpoints]
WHERE [createdAt] < DATEADD(HOUR, -1, GETUTCDATE())
  AND [checkpointDatabaseName] IS NULL;

# Expected: Some rows (old checkpoints unaffected)
```

**Step 3.3**: Check logs for persistence
```bash
# Monitor logs
# Expected log entries:
# [MetadataService] Saved checkpoint database name: cp_xxxxx -> FlashDB_Checkpoint_cp_xxxxx
# [TaskWorker] Captured checkpoint database: cp_xxxxx -> FlashDB_Checkpoint_cp_xxxxx
```

**Step 3.4**: Unit test execution
```bash
npm test -- metadataService.ts --testNamePattern="saveCheckpointDatabaseName"

# Expected results:
# ✓ should save checkpoint database name
# ✓ should handle NULL database name gracefully
# ✓ should trim whitespace from database name
# ✓ should be idempotent
```

**Step 3.5**: Verify persistence doesn't block checkpoint creation
```bash
# Create 10 checkpoints rapidly
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/checkpoints \
    -H "Content-Type: application/json" \
    -d "{\"cloneId\": \"clone_$i\", \"checkpointName\": \"cp_$i\"}" \
    &
done
wait

# Verify all 10 created
SELECT COUNT(*) FROM [dbo].[Checkpoints] 
WHERE [checkpointName] LIKE 'cp_%'
  AND [createdAt] > DATEADD(MINUTE, -1, GETUTCDATE());

# Expected: 10 rows
```

---

## Phase 4 Verification: Safe Database Drop

### Checklist

- [ ] Protected databases never dropped
- [ ] Normal databases drop successfully
- [ ] Database set to SINGLE_USER mode
- [ ] Errors logged but non-fatal
- [ ] Existence checked before/after

### Verification Steps

**Step 4.1**: Verify protected database list in code
```typescript
// Verify taskWorker.ts contains this:
const protectedDatabases = new Set([
  'master',
  'model',
  'msdb',
  'tempdb',
  String(process.env.SQL_DATABASE || '').toLowerCase(),
]);
```

**Step 4.2**: Test protected database safety
```bash
# Try to drop master database (should be skipped)
curl -X DELETE http://localhost:3000/api/checkpoints/test_cp \
  -H "Content-Type: application/json" \
  -d '{"databaseName": "master"}'

# Monitor logs
# Expected: [TaskWorker] ⚠ Skipping drop of protected database: master

# Verify master still exists
sqlcmd -S . -d master -Q "SELECT 1"
# Should succeed (master not dropped)
```

**Step 4.3**: Test normal database drop
```bash
# Create test database
sqlcmd -S . -d master -Q "CREATE DATABASE TestCheckpointDrop"

# Verify exists
sqlcmd -S . -d master -Q "SELECT DB_ID('TestCheckpointDrop')"
# Should return an integer

# Drop via task worker (simulate)
# Expected: Database drops successfully

# Verify dropped
sqlcmd -S . -d master -Q "SELECT DB_ID('TestCheckpointDrop')"
# Should return NULL
```

**Step 4.4**: Unit test execution
```bash
npm test -- taskWorker.ts --testNamePattern="dropCheckpointDatabaseSafely"

# Expected results:
# ✓ should skip protected database drop
# ✓ should skip non-existent database gracefully
# ✓ should drop an existing test database
# ✓ should handle null/empty database name
```

**Step 4.5**: Test error handling
```bash
# Create test database
sqlcmd -S . -d master -Q "CREATE DATABASE TestCheckpointError"

# Connect to database (hold connection)
sqlcmd -S . -d TestCheckpointError -Q "WAITFOR DELAY '00:00:30'"

# Try to drop while in use (in another terminal)
# Expected: Drop fails with error logged at WARN level
# But operation continues without throwing

# Verify database still exists (drop failed but non-fatal)
sqlcmd -S . -d master -Q "SELECT DB_ID('TestCheckpointError')"
# Should return an integer (database still exists)
```

---

## Phase 5 Verification: Deletion Integration

### Checklist

- [ ] Physical database dropped when checkpoint deleted
- [ ] Database name retrieved before deletion
- [ ] Metadata deleted then database dropped
- [ ] Idempotent (can delete multiple times safely)
- [ ] Errors logged but don't fail deletion

### Verification Steps

**Step 5.1**: Verify deletion code updated
```typescript
// Verify taskWorker.ts contains around line 482:
case 'delete-checkpoint':
  // Gets checkpoint metadata
  const checkpoint = await metadataService.getCheckpoint(...);
  // Deletes metadata
  await metadataService.deleteCheckpoint(...);
  // Drops database
  await this.dropCheckpointDatabaseSafely(checkpoint?.checkpointDatabaseName);
```

**Step 5.2**: E2E test: Create and delete with database cleanup
```bash
# 1. Create checkpoint
curl -X POST http://localhost:3000/api/checkpoints \
  -H "Content-Type: application/json" \
  -d '{
    "cloneId": "test_clone_e2e",
    "checkpointName": "test_cp_e2e"
  }'

# Response should include checkpoint ID (e.g., cp_123)

# 2. Query for checkpoint database
SELECT [checkpointDatabaseName] FROM [dbo].[Checkpoints]
WHERE [id] = 'cp_123';
# Should return database name like: FlashDB_Checkpoint_cp_123

# 3. Verify physical database exists
sqlcmd -S . -d master -Q "SELECT DB_ID('FlashDB_Checkpoint_cp_123')"
# Should return an integer (database exists)

# 4. Delete checkpoint
curl -X DELETE http://localhost:3000/api/checkpoints/test_clone_e2e/cp_123

# 5. Verify metadata deleted
SELECT COUNT(*) FROM [dbo].[Checkpoints] WHERE [id] = 'cp_123';
# Should return 0

# 6. Verify physical database dropped
sqlcmd -S . -d master -Q "SELECT DB_ID('FlashDB_Checkpoint_cp_123')"
# Should return NULL (database dropped)
```

**Step 5.3**: Test idempotency
```bash
# Try to delete same checkpoint again
curl -X DELETE http://localhost:3000/api/checkpoints/test_clone_e2e/cp_123

# Expected response:
# HTTP 200 (not 404)
# Message: "Checkpoint not found" or "already deleted"

# Verify no errors in logs
# Should see: "Checkpoint not found: cp_123"
```

**Step 5.4**: Integration test execution
```bash
npm test -- checkpoint-integration.test.ts

# Expected results:
# ✓ should capture, store, and delete checkpoint database
# ✓ should handle checkpoint not found gracefully
# ✓ should handle database drop errors gracefully
# ✓ should be idempotent on deletion
```

---

## Phase 6 Verification: Full System Integrity

### Checklist

- [ ] All acceptance criteria test cases pass
- [ ] No regressions in existing tests
- [ ] Build successful
- [ ] Backwards compatible with NULL names
- [ ] Logs complete and informative

### Verification Steps

**Step 6.1**: Run full test suite
```bash
npm run build
npm test

# Expected:
# > 100 tests passing
# 0 tests failing
# Coverage > 85%
```

**Step 6.2**: Run integration tests
```bash
npm run test:integration

# Expected:
# All checkpoint operations work
# All clone operations work (unchanged)
# All deletion cascades work
```

**Step 6.3**: Backwards compatibility test
```sql
-- Query for old checkpoints (NULL database names)
SELECT COUNT(*) AS old_null_count
FROM [dbo].[Checkpoints]
WHERE [checkpointDatabaseName] IS NULL;

-- If > 0, test deleting old checkpoint
-- Should work without database drop attempt

-- Expected:
-- Checkpoint deletes successfully
-- Log shows: "Skipping database drop: no database name"
-- No errors
```

**Step 6.4**: Verify log completeness
```bash
# Monitor logs during typical operations
# Expected log entries:

# During checkpoint creation:
# [TaskWorker] ┌─ create-checkpoint task initiated
# [TaskWorker] ├─ Executing PowerShell: New-FlashdbCheckpoint
# [TaskWorker] │ Captured checkpoint database: cp_xxxxx -> FlashDB_Checkpoint_cp_xxxxx
# [MetadataService] │ Saved checkpoint database name: cp_xxxxx -> FlashDB_Checkpoint_cp_xxxxx
# [TaskWorker] └─ ✓ Checkpoint created successfully

# During checkpoint deletion:
# [TaskWorker] ┌─ delete-checkpoint task initiated: cp_xxxxx
# [TaskWorker] ├─ Retrieving checkpoint metadata
# [TaskWorker] ├─ Calling MetadataService: deleteCheckpoint()
# [TaskWorker] │ Checkpoint metadata deleted
# [TaskWorker] ├─ Dropping checkpoint database: FlashDB_Checkpoint_cp_xxxxx
# [TaskWorker] │  └─ ✓ Checkpoint database dropped: FlashDB_Checkpoint_cp_xxxxx
# [TaskWorker] └─ ✓ Checkpoint deletion completed successfully
```

---

## Post-Deployment Verification (Week 1)

### Daily Monitoring

Run these queries daily for 7 days:

**Query 1**: New checkpoints have database names
```sql
SELECT 
  COUNT(*) AS new_checkpoints,
  COUNT(*) FILTER (WHERE [checkpointDatabaseName] IS NOT NULL) AS with_db_name,
  COUNT(*) FILTER (WHERE [checkpointDatabaseName] IS NULL) AS without_db_name
FROM [dbo].[Checkpoints]
WHERE [createdAt] > DATEADD(DAY, -1, GETUTCDATE());

-- Expected: with_db_name > 0 and without_db_name = 0
```

**Query 2**: No unexpected orphaned databases
```sql
SELECT COUNT(*) AS orphaned_count
FROM sys.databases
WHERE name LIKE 'FlashDB_Checkpoint%'
  AND DB_ID(name) IS NOT NULL
  AND database_id > 4; -- Skip system databases

-- Expected: Orphaned count is stable or decreasing
```

**Query 3**: Checkpoint operations succeed
```bash
# Monitor error logs
grep -i "error\|failed" /var/log/flashdb/api.log | grep -i checkpoint | wc -l

# Expected: 0 or minimal errors
```

---

## Rollback Verification

### Test Rollback Procedure

**Step 1**: Document current state
```sql
SELECT COUNT(*) AS checkpoint_count FROM [dbo].[Checkpoints];
SELECT COUNT(*) AS with_db_name 
FROM [dbo].[Checkpoints] 
WHERE [checkpointDatabaseName] IS NOT NULL;
```

**Step 2**: Simulate rollback

Code Rollback:
```bash
git revert <commit_hash>
npm run build
npm test
```

Schema Rollback (if needed):
```sql
ALTER TABLE [dbo].[Checkpoints]
DROP COLUMN [checkpointDatabaseName];
```

**Step 3**: Verify operations continue
```sql
-- Verify checkpoints still queryable
SELECT COUNT(*) FROM [dbo].[Checkpoints];

-- Verify delete operations work
-- (with null database name, should skip drop)
```

---

## Success Metrics

| Metric | Target | Acceptance |
|--------|--------|-----------|
| Unit test coverage | > 90% | ≥ 80% |
| Integration test pass rate | 100% | ≥ 95% |
| New checkpoint capture rate | 100% | ≥ 99% |
| Database drop success rate | > 95% | ≥ 90% |
| API latency increase | < 5% | ≥ 10% |
| Error rate on deletion | 0% data loss | = 0% |
| Protected DB safety | 0 accidents | = 0 |

---

## Final Acceptance Sign-Off

All of the following must be completed before marking specification as DONE:

- [ ] **Phase 1**: Schema column exists and verified
- [ ] **Phase 2**: Database name captured in logs
- [ ] **Phase 3**: Database name stored in metadata
- [ ] **Phase 4**: Safe drop helper prevents protected DB deletion
- [ ] **Phase 5**: E2E test passes (create → store → delete → cleanup)
- [ ] **Phase 6**: Full test suite passes, no regressions
- [ ] **Backwards Compatibility**: Old checkpoints (NULL) still work
- [ ] **Logs**: All operations logged at appropriate levels
- [ ] **Code Review**: At least 1 peer approval
- [ ] **Build**: `npm run build && npm test` passes
- [ ] **Documentation**: Code comments and README updated
- [ ] **Rollback**: Rollback procedure documented and tested
- [ ] **Post-Deployment**: Monitored for 1 week without critical issues

**Signed off by**: _____________ (Developer)  
**Reviewed by**: _____________ (Peer)  
**Approved by**: _____________ (Team Lead)  
**Date**: _____________

---

## Appendix: Troubleshooting

### Issue: Database name not captured

**Symptoms**: Logs show "Captured checkpoint database: cp_xxxxx -> " (empty)

**Diagnosis**:
```bash
# Check PowerShell response format
# Expected properties: DatabaseName or databaseName
# Verify case sensitivity handling
grep -i "databasename\|databaseName" logs/api.log | head -5
```

**Solution**:
- [ ] Verify PowerShell script returns database name in response
- [ ] Update property resolution in taskWorker.ts line 456
- [ ] Test with actual PowerShell response format

---

### Issue: Database drop fails but deletion continues

**Symptoms**: Checkpoint deleted from metadata but database still exists

**Diagnosis**:
```sql
-- Find orphaned databases
SELECT name FROM sys.databases
WHERE name LIKE 'FlashDB_Checkpoint%'
  AND DB_ID(name) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM [dbo].[Checkpoints]
    WHERE [checkpointDatabaseName] = name
  );
```

**Solution**:
- [ ] Check error logs for "Failed to drop checkpoint database"
- [ ] Verify database not in use by other connection
- [ ] If drop is timing out, increase timeout in code
- [ ] Manually drop orphaned database:
  ```sql
  ALTER DATABASE [FlashDB_Checkpoint_cp_xxxxx] 
  SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  DROP DATABASE [FlashDB_Checkpoint_cp_xxxxx];
  ```

---

### Issue: Performance degradation

**Symptoms**: Checkpoint creation latency increased > 10%

**Diagnosis**:
```bash
# Compare latency before/after
grep "create-checkpoint" logs/api.log | grep -oP 'duration:\K[\d.]+' | \
  awk '{sum+=$1; count++} END {print "Average: " sum/count " ms"}'
```

**Solution**:
- [ ] Make database name persistence async (non-blocking)
- [ ] Consider batching name saves
- [ ] Profile code to find bottleneck
- [ ] Optimize SQL query if needed

---

End of Verification Plan
