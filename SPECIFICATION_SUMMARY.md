# Specification Summary: Checkpoint Database Orphan Fix

## Problem
Checkpoint databases created by PowerShell (`FlashDB_Checkpoint_cp_<timestamp>_<id>`) are **never stored in metadata**. When checkpoints are deleted, physical SQL Server databases remain orphaned and consume storage.

## Root Cause
1. No column to store database names in `dbo.Checkpoints`
2. PowerShell response not parsed for database name
3. Database drop not implemented in deletion flow
4. No audit trail of what was created/deleted

## Solution Overview: 4 Phases

### Phase 1: Schema (Database)
**Add column** to store checkpoint database names:
```sql
ALTER TABLE [dbo].[Checkpoints]
ADD [checkpointDatabaseName] NVARCHAR(MAX) NULL;
```
- Non-blocking migration
- Backwards compatible (NULL for existing checkpoints)
- Duration: 30 minutes

### Phase 2: Capture (TaskWorker)
**Extract database name** from PowerShell response:
```typescript
const dbName = String(result?.DatabaseName || result?.databaseName || '').trim();
```
- Handle both PascalCase and camelCase
- Log extraction at INFO level
- Non-fatal if missing
- Duration: 1 hour

### Phase 3: Storage (Metadata)
**Save database name** after checkpoint creation:
```typescript
await metadataService.saveCheckpointDatabaseName(checkpointId, dbName);
```
- UPDATE `dbo.Checkpoints` with database name
- Non-fatal if save fails
- Duration: 1.5 hours

### Phase 4: Deletion (Cleanup)
**Drop physical database** when deleting checkpoints:
```typescript
async dropCheckpointDatabaseSafely(databaseName: string) {
  // Check existence, set SINGLE_USER, drop with ROLLBACK IMMEDIATE
}
```
- Guard against protected databases (master, model, msdb, tempdb)
- Non-fatal if drop fails (metadata still deleted)
- Duration: 2 hours (1.5 hrs drop + 1 hr integration)

## Key Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Column Type** | `NVARCHAR(MAX)` nullable | Supports SQL Server names; NULL for old checkpoints |
| **Property Variants** | Handle both cases | PowerShell inconsistency; robust to changes |
| **Drop Strategy** | SINGLE_USER mode | Force disconnect before drop |
| **Error Handling** | Non-fatal in all phases | Prioritize availability over perfectionism |
| **Backwards Compat** | Full support for NULL names | Existing checkpoints still deletable |

## Success Criteria (Pass/Fail)

- [ ] Column `checkpointDatabaseName` exists in schema
- [ ] New checkpoints have database names captured and stored
- [ ] Checkpoint deletion drops physical databases
- [ ] Protected databases never dropped
- [ ] E2E test: Create → Store → Drop → Verify cleanup
- [ ] 100% backwards compatible (NULL handling works)
- [ ] All code reviewed and tested
- [ ] No regressions in checkpoint operations

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Accidental system DB drop | CRITICAL | Protected database list + existence check |
| Incomplete capture | MEDIUM | Handle both property variants + NULL safe |
| Performance impact | MEDIUM | Non-blocking operations + async drop |
| Concurrency issues | MEDIUM | SINGLE_USER mode serializes connections |

## Timeline

| Phase | Duration | Owner | Status |
|-------|----------|-------|--------|
| 1. Schema | 30 min | DBA | Ready |
| 2. Capture | 1 hr | Dev | Ready |
| 3. Storage | 1.5 hrs | Dev | Ready |
| 4. Deletion | 2 hrs | Dev | Ready |
| 5. Testing | 2 hrs | Dev/QA | Ready |
| **Total** | **8.5 hrs** | | |

## Rollback Strategy

If issues arise:
1. Revert code (non-breaking change)
2. Remove column: `ALTER TABLE [dbo].[Checkpoints] DROP COLUMN [checkpointDatabaseName]`
3. Restore from backup if needed
4. **Rollback time**: 15 minutes

## Files to Modify

1. **src/api/src/db/schema.sql** — Add column
2. **src/api/src/services/taskWorker.ts** — Capture + drop helper
3. **src/api/src/services/metadataService.ts** — Persist + delete

## Validation Checklist

```
Schema Phase:
  ☐ Column exists in dbo.Checkpoints
  ☐ Column is nullable
  ☐ No data loss in existing records
  ☐ Verification query passes

Capture Phase:
  ☐ Database name extracted from PowerShell
  ☐ Both PascalCase and camelCase handled
  ☐ Whitespace trimmed
  ☐ Logged at INFO level

Storage Phase:
  ☐ Database name saved after creation
  ☐ NULL persisted if name not captured
  ☐ Idempotent (safe to call multiple times)
  ☐ Logged at DEBUG (attempt) and INFO (success)

Deletion Phase:
  ☐ Physical database dropped when checkpoint deleted
  ☐ Protected databases never dropped
  ☐ SINGLE_USER mode set before drop
  ☐ Errors logged but don't fail deletion
  ☐ Idempotent (safe to delete multiple times)

Integration:
  ☐ E2E: Create checkpoint → Store DB name → Delete → Database gone
  ☐ Backwards compatible: Old checkpoints (NULL) still work
  ☐ No regressions in existing tests
  ☐ npm run build && npm test pass
```

## Post-Deployment Monitoring

Week 1:
- Checkpoint creation success rate > 99.5%
- Database name capture rate = 100% (new checkpoints)
- Database drop success rate > 95%
- Orphaned database count stops growing

Ongoing:
- Monthly audit: Query for checkpoints with NULL database names
- Monthly cleanup: Check for orphaned databases in SQL Server
- Quarterly performance review: Verify no slowdowns

---

For detailed specification, see: **SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md**
