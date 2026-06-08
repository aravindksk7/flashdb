# Audit Events Fix - Verification Checklist

## Pre-Deployment Checklist

### Code Changes
- [x] Modified `src/api/src/routes/operations.ts`
  - [x] Extended `operationTaskTypes` Set with 6 new audit event types
  - [x] Updated `normalizeOperationType()` with audit event mappings
  - [x] Updated `getTaskLabel()` for validation/repair labels
  - [x] Updated SQL WHERE clause in `getPersistentQueueOperations()`
  - [x] Enhanced `getPersistedAuditOperations()` with type normalization

### Test Files Created
- [x] `src/api/src/__tests__/audit-events-completeness.test.ts`
  - Tests auditMetricsService event recording
  - Tests database persistence
  - Tests event type normalization
  - Tests timeline integration

- [x] `src/api/src/__tests__/operations-api-audit-events.test.ts`
  - Tests API endpoint response completeness
  - Tests event filtering
  - Tests type normalization from database
  - Tests event deduplication
  - Tests status tracking

### Documentation
- [x] Created `AUDIT_EVENTS_FIX_REPORT.md` with:
  - Root cause analysis (3 issues identified)
  - Implementation details for all 5 fixes
  - Test coverage explanation
  - Data flow diagram
  - Impact analysis

## Deployment Steps

### 1. Pre-Build Verification
- [ ] Verify syntax: Run TypeScript compiler `npm run build`
  - Expected: No errors
  - Expected: All TS files compile to dist/

- [ ] Verify types: Check all imports are correct
  - Expected: `normalizeOperationType` called in correct places
  - Expected: `getTaskLabel` parameters match signature

### 2. Testing
- [ ] Run unit tests: `npm test -- audit-events-completeness`
  - Expected: All tests pass
  - Expected: Event recording works
  - Expected: Database persistence works

- [ ] Run API tests: `npm test -- operations-api-audit-events`
  - Expected: All tests pass
  - Expected: API returns all event types
  - Expected: Type filtering works

- [ ] Run full test suite: `npm test`
  - Expected: No regressions
  - Expected: All tests pass

### 3. Runtime Testing

#### Test Validation Events
1. [ ] Start API: `npm start`
2. [ ] Open GUI and navigate to a clone
3. [ ] Click "Validate" button
4. [ ] Observe:
   - [ ] "Validation" event type appears in Operation History
   - [ ] Event shows in timeline immediately
   - [ ] Event status transitions: pending → completed
   - [ ] Findings count displayed (if any)
   - [ ] Validation status shown (healthy/unhealthy)

#### Test Repair Events
1. [ ] Open GUI and navigate to a clone
2. [ ] Click "Repair" button
3. [ ] Review and execute repair plan
4. [ ] Observe:
   - [ ] "Repair" event type appears in Operation History
   - [ ] Event shows in timeline immediately
   - [ ] Event status transitions: pending → completed
   - [ ] Repair status displayed

#### Test Filtering
1. [ ] Open Operation History
2. [ ] Click "Type" filter dropdown
3. [ ] Observe:
   - [ ] "validation" option available
   - [ ] "repair" option available
   - [ ] Selecting "validation" shows only validation events
   - [ ] Selecting "repair" shows only repair events
   - [ ] Selecting "all" shows all events

#### Test API Endpoints
1. [ ] GET /api/operations
   - [ ] Returns validation and repair events
   - [ ] Events have correct type: "validation" or "repair"
   - [ ] Events have status: "completed" or "pending"

2. [ ] GET /api/operations?cloneId=ABC
   - [ ] Filters to clone ABC
   - [ ] Includes validation and repair for that clone

3. [ ] GET /api/operations/timeline/ABC
   - [ ] Shows all events for clone ABC
   - [ ] Includes validation and repair events
   - [ ] Events sorted by timestamp descending

### 4. Database Verification

#### Check OperationMetrics Table
```sql
SELECT TOP 20 [id], [operationType], [targetId], [status], [startedAt]
FROM [dbo].[OperationMetrics]
ORDER BY [startedAt] DESC
```

- [ ] Contains validation-start entries
- [ ] Contains validation-complete entries
- [ ] Contains repair-start entries
- [ ] Contains repair-complete entries
- [ ] Timestamps are recent (from testing)

#### Check Queue Tables
```sql
SELECT TOP 5 [id], [type], [status], [payload]
FROM [dbo].[flashdb_queue]
WHERE [type] IN ('validation-start', 'validation-complete', 'repair-execute', 'repair-complete')
ORDER BY [created_at] DESC
```

- [ ] Validation/repair tasks appear in queue
- [ ] Status transitions recorded correctly

### 5. Performance Verification
- [ ] API response time for /api/operations: < 500ms
  - Measure with limit=500
  - Should include validation/repair events

- [ ] Timeline endpoint response time: < 500ms
  - Measure: GET /api/operations/timeline/{cloneId}
  - Should include all event types

### 6. Monitoring
- [ ] Check API logs for errors
  - Expected: No errors in logger output
  - Expected: Debug logs show event queries executing

- [ ] Monitor database connection
  - Expected: Queries complete successfully
  - Expected: No timeouts

- [ ] Verify event persistence
  - Expected: Events remain after API restart
  - Expected: No event loss across sessions

## Rollback Plan

If issues are discovered:

1. Revert `src/api/src/routes/operations.ts` to previous commit
2. Rebuild API: `npm run build`
3. Restart API
4. Verify operation history functions

The changes are additive (adding support for more event types), so rollback is simple.

## Success Criteria

All of the following must be true:

1. ✓ Code compiles without errors
2. ✓ All tests pass (existing + new)
3. ✓ Validation events appear in operation history
4. ✓ Repair events appear in operation history
5. ✓ Type filters work correctly
6. ✓ API endpoints return complete data
7. ✓ Database queries include all event types
8. ✓ No performance degradation
9. ✓ Events persist across API restarts

## Sign-Off

- [ ] Developer: Code review completed
- [ ] Tester: All tests passing
- [ ] QA: Runtime testing completed
- [ ] Admin: Database verified
- [ ] Deployment: Changes deployed to production

---

**Document Version**: 1.0
**Date**: 2026-06-08
**Status**: Ready for Deployment
