# Audit Events Fix - Detailed Code Changes

## File: src/api/src/routes/operations.ts

### Change 1: Extended operationTaskTypes Set (Lines 25-40)

**Before:**
```typescript
const operationTaskTypes = new Set([
  'create-clone',
  'delete-clone',
  'create-checkpoint',
  'restore-checkpoint',
  'delete-checkpoint',
  'validate-clone',
  'repair-clone',
  'validate-all-clones'
]);
```

**After:**
```typescript
const operationTaskTypes = new Set([
  'create-clone',
  'delete-clone',
  'create-checkpoint',
  'restore-checkpoint',
  'delete-checkpoint',
  'validate-clone',
  'repair-clone',
  'validate-all-clones',
  'validation-start',
  'validation-complete',
  'repair-start',
  'repair-execute',
  'repair-complete',
  'repair-plan'
]);
```

**Rationale**: This Set is used to filter task queue operations. By adding the 6 audit event types, they will now be included when retrieving from the queue.

---

### Change 2: Extended normalizeOperationType() Mappings (Lines 49-71)

**Before:**
```typescript
function normalizeOperationType(value: any): string {
  const operationType = String(value || '');
  const mappedTypes: Record<string, string> = {
    'create-checkpoint': 'create',
    'restore-checkpoint': 'restore',
    'delete-checkpoint': 'delete',
    'validate-clone': 'validation',
    'validate-all-clones': 'validation',
    'repair-clone': 'repair'
  };

  if (mappedTypes[operationType]) {
    return mappedTypes[operationType];
  }

  return operationType || 'unknown';
}
```

**After:**
```typescript
function normalizeOperationType(value: any): string {
  const operationType = String(value || '');
  const mappedTypes: Record<string, string> = {
    'create-checkpoint': 'create',
    'restore-checkpoint': 'restore',
    'delete-checkpoint': 'delete',
    'validate-clone': 'validation',
    'validate-all-clones': 'validation',
    'repair-clone': 'repair',
    'validation-start': 'validation',
    'validation-complete': 'validation',
    'repair-start': 'repair',
    'repair-execute': 'repair',
    'repair-complete': 'repair',
    'repair-plan': 'repair'
  };

  if (mappedTypes[operationType]) {
    return mappedTypes[operationType];
  }

  return operationType || 'unknown';
}
```

**Rationale**: Audit events use different internal type names (e.g., 'validation-start', 'repair-execute'). This function normalizes them to consistent names ('validation', 'repair') for GUI display and filtering.

---

### Change 3: Updated getTaskLabel() (Lines 95-100)

**Before:**
```typescript
function getTaskLabel(type: string, payload: Record<string, any>): string {
  if (type === 'validation') return 'Clone validation';
  if (type === 'repair') return 'Clone repair';
  if (type === 'create-clone') return payload.name || payload.cloneName || 'Clone creation';
  if (type === 'delete-clone') return payload.name || payload.cloneName || 'Clone deletion';
  if (type === 'create') return payload.checkpointName || payload.name || 'New restore point';
  if (type === 'restore') return payload.checkpointName || payload.name || 'Restore point';
  if (type === 'delete') return payload.checkpointName || payload.name || 'Restore point';
  return payload.name || 'Operation';
}
```

**After:**
```typescript
function getTaskLabel(type: string, payload: Record<string, any>): string {
  if (type === 'validation') return `Clone validation (${payload.cloneId || 'Unknown'})`;
  if (type === 'repair') return `Clone repair (${payload.cloneId || 'Unknown'})`;
  if (type === 'create-clone') return payload.name || payload.cloneName || 'Clone creation';
  if (type === 'delete-clone') return payload.name || payload.cloneName || 'Clone deletion';
  if (type === 'create') return payload.checkpointName || payload.name || 'New restore point';
  if (type === 'restore') return payload.checkpointName || payload.name || 'Restore point';
  if (type === 'delete') return payload.checkpointName || payload.name || 'Restore point';
  return payload.name || 'Operation';
}
```

**Rationale**: Improved labels to include the clone ID, making it clearer which clone the validation/repair was performed on.

---

### Change 4: Updated SQL WHERE Clause in getPersistentQueueOperations (Lines 227-242)

**Before:**
```sql
       WHERE [type] IN (
          'create-clone',
          'delete-clone',
          'create-checkpoint',
          'restore-checkpoint',
          'delete-checkpoint',
          'validate-clone',
          'repair-clone',
          'validate-all-clones'
       )
```

**After:**
```sql
       WHERE [type] IN (
          'create-clone',
          'delete-clone',
          'create-checkpoint',
          'restore-checkpoint',
          'delete-checkpoint',
          'validate-clone',
          'repair-clone',
          'validate-all-clones',
          'validation-start',
          'validation-complete',
          'repair-start',
          'repair-execute',
          'repair-complete',
          'repair-plan'
       )
```

**Rationale**: This SQL query retrieves persisted task queue operations from the database. By adding the audit event types to the WHERE clause, these events will now be included in the results.

---

### Change 5: Enhanced getPersistedAuditOperations() (Lines 290-303)

**Before:**
```typescript
    return (result.recordset || []).map(row => ({
      id: row.id,
      cloneId: row.targetId || '',
      checkpointId: '',
      checkpointName: 'Audit Operation',
      type: row.operationType || 'unknown',
      status: row.status || 'unknown',
      timestamp: toIsoString(row.startedAt) || new Date().toISOString(),
      completedAt: toIsoString(row.completedAt) || null,
      message: row.errorMessage || null,
      source: 'audit' as const
    } as TimelineOperation));
```

**After:**
```typescript
    return (result.recordset || []).map(row => {
      const normalizedType = normalizeOperationType(row.operationType);
      return {
        id: row.id,
        cloneId: row.targetId || '',
        checkpointId: '',
        checkpointName: getTaskLabel(normalizedType, { cloneId: row.targetId }),
        type: normalizedType,
        status: row.status || 'unknown',
        timestamp: toIsoString(row.startedAt) || new Date().toISOString(),
        completedAt: toIsoString(row.completedAt) || null,
        message: row.errorMessage || null,
        source: 'audit' as const
      } as TimelineOperation;
    });
```

**Rationale**: 
- Before: Returned events with raw database type names and generic checkpoint name
- After: Normalizes types and generates proper labels, making events consistent with other operation types

---

## New Test Files

### File 1: src/api/src/__tests__/audit-events-completeness.test.ts

Complete test suite for auditMetricsService event recording:

```typescript
describe('Audit Events Completeness', () => {
  const auditMetricsService = getAuditMetricsService();

  describe('Event Type Coverage', () => {
    it('should record validation-start events', async () => { ... });
    it('should record validation-complete events', async () => { ... });
    it('should record repair-start events', async () => { ... });
    it('should record repair-complete events', async () => { ... });
  });

  describe('Database Persistence', () => {
    it('should persist validation events to OperationMetrics table', async () => { ... });
    it('should persist repair events to OperationMetrics table', async () => { ... });
  });

  describe('Event Type Normalization', () => {
    it('should normalize validation event types correctly', () => { ... });
    it('should normalize repair event types correctly', () => { ... });
  });

  describe('Operation Timeline Integration', () => {
    it('validation and repair operations should be included in timeline', async () => { ... });
  });
});
```

**Purpose**: Verifies that auditMetricsService correctly records and stores all event types.

---

### File 2: src/api/src/__tests__/operations-api-audit-events.test.ts

Complete test suite for /api/operations endpoint:

```typescript
describe('Operations API - Audit Events', () => {
  describe('GET /operations - Event Type Filtering', () => {
    it('should include validation operations in response', async () => { ... });
    it('should include repair operations in response', async () => { ... });
    it('should filter by clone ID and include all event types', async () => { ... });
    it('should correctly normalize operation types from database', async () => { ... });
  });

  describe('GET /operations/timeline/:cloneId - Event Type Inclusion', () => {
    it('should include validation and repair events in timeline', async () => { ... });
  });

  describe('Database Query Coverage', () => {
    it('should query OperationMetrics table for audit events', async () => { ... });
    it('should merge operations from all sources', async () => { ... });
  });

  describe('Event Deduplication', () => {
    it('should deduplicate events with same ID', async () => { ... });
  });

  describe('Operation Status Tracking', () => {
    it('validation operations should track completion status', async () => { ... });
    it('repair operations should track completion status', async () => { ... });
  });
});
```

**Purpose**: Verifies that the /api/operations endpoint correctly retrieves, normalizes, and returns all event types.

---

## Summary of Changes

| Area | Lines | Change | Impact |
|------|-------|--------|--------|
| operationTaskTypes | 25-40 | Added 6 event types | Queue filtering now includes audit events |
| normalizeOperationType | 49-71 | Added 6 mappings | Events normalized to 'validation'/'repair' |
| getTaskLabel | 95-100 | Improved labels | Better event descriptions |
| SQL WHERE clause | 227-242 | Added 6 types | Database queries include audit events |
| getPersistedAuditOperations | 290-303 | Type normalization | Consistent event structure from DB |

---

## Backward Compatibility

All changes are backward compatible:
- ✓ No database schema changes
- ✓ No API contract changes
- ✓ No breaking changes to existing operations
- ✓ Only adding support for new event types
- ✓ Existing events still display correctly

---

## Testing Commands

```bash
# Run audit events completeness tests
npm test -- audit-events-completeness

# Run operations API tests
npm test -- operations-api-audit-events

# Run all tests
npm test

# Build TypeScript
npm run build

# Start API
npm start
```

---

## Deployment

1. Apply code changes to `src/api/src/routes/operations.ts`
2. Add new test files to test directory
3. Run `npm run build` to verify compilation
4. Run `npm test` to verify all tests pass
5. Restart API server
6. Test in GUI to verify validation/repair events appear

---

**Document Version**: 1.0
**Last Updated**: 2026-06-08
