# Clone Validation and Repair Guide

## Overview

This guide explains the clone validation system, the two critical warnings it detects, and how to repair clones when issues are found.

## Validation Warnings

### 1. NO_VHDX_PATH Warning

**What it means:** The clone metadata is missing the `vhdxPath` field, which records the location of the virtual hard disk file.

**Root cause:** The `vhdxPath` is a durable fact (persisted in metadata) but the metadata record may have been created without this field populated.

**Why it matters:** 
- Operations need to know where the VHDX file is located to mount it
- Without this path, the clone cannot be attached to a database instance

**Recovery options:**

#### Option 1: Reconstruct from storage_path (Recommended)
- Uses the existing `storagePath` to construct the expected VHDX filename
- Default pattern: `{storagePath}\{cloneId}.vhdx`
- Success rate: High (standard naming convention)

#### Option 2: Query database metadata (Advanced)
- Queries SQL Server system tables for attachment records
- Looks for where the clone files were previously located
- Success rate: Depends on whether database was ever attached

#### Option 3: Manual recovery
- User provides the VHDX file path
- Useful if files were moved or custom naming was used

**How to repair:**

```typescript
const validationService = getCloneValidationService();

// Preview what will be recovered (dry-run)
const preview = await validationService.recoverVhdxPath('clone-id-123', true);
console.log(preview.recoveredPath); // Shows the path that will be recovered

// Execute the recovery
const result = await validationService.recoverVhdxPath('clone-id-123', false);
if (result.success) {
  console.log('Recovery successful:', result.recoveredPath);
}
```

**Validation process:**
1. Checks if clone exists in metadata
2. Attempts recovery using available data
3. Updates metadata with recovered path (if not dry-run)
4. Validates path format and consistency

### 2. ATTACHED_BUT_NO_MOUNT Warning

**Status: REMOVED (Fixed)**

**Why it was removed:**

The `mount_path` field in clone metadata is marked as `isDurableFact: false`, meaning it is:
- **NOT intended to be persisted** - it's a transient live observation
- **Expected to change** - it resets when the system restarts
- **Not guaranteed to exist** - it's only populated when the VHD is actively mounted

**The issue:** The validation was checking for something that was never meant to be stored.

**The fix:** Removed the `ATTACHED_BUT_NO_MOUNT` check from validation (lines 98-104 in original).

**How mount points are now handled:**
- Mount point is obtained dynamically when needed
- Use PowerShell: `Get-Volume | Where-Object { $_.FileSystemLabel -eq 'clone-name' }`
- Mount point is never validated as a durable requirement

---

## Clone Validation Process

### Complete Validation Checks

```
Clone Validation
├── Metadata exists
├── VHD path is recorded (vhdxPath) ← Can be recovered via NO_VHDX_PATH repair
├── Parent golden image exists
├── Database attachment state (if status = Attached)
└── Database name recorded (if status = Attached)
```

### Running validation:

```typescript
const validationService = getCloneValidationService();
const result = await validationService.validateClone('clone-id-123');

console.log('Is healthy:', result.isHealthy);
console.log('Findings:', result.findings);
// result.findings = [
//   { code: 'NO_VHDX_PATH', severity: 'Warning', ... }
// ]
```

---

## Repair Workflow

### Step 1: Validate the clone

```typescript
const validation = await validationService.validateClone(cloneId);
if (validation.isHealthy) {
  console.log('Clone is healthy, no repair needed');
  return;
}
```

### Step 2: Preview repair actions (dry-run)

```typescript
const plan = await validationService.repairClone(cloneId, true);
console.log('Planned actions:', plan.plannedActions);
console.log('Estimated duration:', plan.estimatedDurationSeconds, 'seconds');
```

Example output:
```
Planned actions:
  - Recover VHDX path from storage metadata
  - Attach database from clone files

Estimated duration: 150 seconds
```

### Step 3: Execute repair

```typescript
const attempt = await validationService.executeRepair(cloneId, false);
console.log('Result:', attempt.result); // 'Success', 'Failed', 'Skipped'
console.log('Message:', attempt.resultMessage);
console.log('Actions taken:', attempt.attemptedActions);
```

---

## Common Issues and Solutions

### Problem: Clone has no VHDX path, recovery fails

**Diagnostics:**
```typescript
const recovery = await validationService.recoverVhdxPath(cloneId, true);
console.log(recovery.message);
```

**Solutions:**

1. **If error: "no storage_path in metadata"**
   - The clone's storage path was lost
   - Action: Locate the VHDX file manually and provide the path
   - Update metadata: `await metadataService.updateClone(cloneId, { vhdxPath: 'full/path/to/file.vhdx' })`

2. **If recovery found a path but file doesn't exist**
   - The VHDX file was moved or deleted
   - Action: Check backup locations or restore from backup
   - Or: Create a new clone from the golden image

### Problem: Clone was attached but cannot find database

**Cause:** The database name wasn't recorded in metadata during attachment

**Solution:**
1. Query SQL Server for attached databases
2. Identify which database belongs to this clone
3. Update metadata: `await metadataService.updateClone(cloneId, { databaseName: 'DatabaseName' })`

### Problem: Repair dry-run shows actions but they don't execute

**Likely cause:** Clone data is missing or inconsistent

**Diagnostics:**
```typescript
const clone = await provider.getClone(cloneId);
const golden = await provider.getGoldenImage(clone.goldenImageId);

// Check which fields are null or invalid
console.log('Clone fields:', clone);
console.log('Golden image:', golden);
```

---

## Schema Reference

### Clone Metadata Fields (CLONE_SCHEMA)

| Field | Type | Durable | Purpose |
|-------|------|---------|---------|
| id | text | ✓ | Unique identifier |
| clone_name | text | ✓ | Display name |
| status | text | ✓ | Creating, Attached, Detached, Failed |
| vhdx_path | text | ✓ | Full path to VHDX file (can be recovered) |
| mount_path | text | ✗ | Live mount point (NOT validated) |
| database_name | text | ✓ | Attached database name |
| storage_path | text | ✓ | Storage directory (used for recovery) |
| golden_image_id | text | ✓ | Parent image reference |

**Legend:**
- ✓ Durable = Persisted and validated
- ✗ Non-durable = Transient, not persisted

---

## Repair Audit Trail

All repair attempts are recorded:

```typescript
// After repair execution
const attempt = await validationService.executeRepair(cloneId, false);

// Saved in metadata
{
  id: 'repair-clone-id-123-1718000000000',
  cloneId: 'clone-id-123',
  validationFindings: [...],
  attemptedActions: [
    { action: 'Recover VHDX path...', status: 'Succeeded', message: '...' }
  ],
  result: 'Success',
  resultMessage: 'Repair completed: 1 action applied',
  startedAt: '2026-06-08T10:30:00Z',
  completedAt: '2026-06-08T10:31:30Z'
}
```

---

## Testing Repairs

### Unit Tests

```bash
npm test -- clone-validation-repairs.test.ts
```

Tests cover:
- ✓ NO_VHDX_PATH detection
- ✓ VHDX path recovery (storage_path method)
- ✓ Recovery dry-run (no metadata changes)
- ✓ Recovery execution (metadata updated)
- ✓ ATTACHED_BUT_NO_MOUNT removal
- ✓ Repair plan generation
- ✓ Health metrics calculation

### Integration Tests

```bash
npm run test:integration
```

Tests against:
- Real metadata service
- Real provider (SQL Server or mock)
- Actual repair execution

---

## Best Practices

1. **Always dry-run first**
   ```typescript
   await validationService.repairClone(cloneId, true); // dry-run
   // Review plan before executing
   await validationService.executeRepair(cloneId, true); // dry-run
   await validationService.executeRepair(cloneId, false); // execute
   ```

2. **Keep storage paths consistent**
   - Use standard location: `{ROOT}\{cloneId}.vhdx`
   - Document any custom locations in clone metadata

3. **Validate after repair**
   ```typescript
   const result = await validationService.executeRepair(cloneId, false);
   const validation = await validationService.validateClone(cloneId);
   console.log('After repair, is healthy:', validation.isHealthy);
   ```

4. **Monitor repair audit trail**
   - Check `RepairAttemptMetadata` for all changes
   - Track success/failure patterns
   - Debug issues by examining the audit log

---

## API Endpoints

### GET /clones/{cloneId}/validate
Returns validation result with findings

### POST /clones/{cloneId}/repair/plan
Returns repair plan (dry-run)

### POST /clones/{cloneId}/repair/execute
Executes repair with optional dry-run flag

### GET /clones/{cloneId}/recover-vhdx
Preview VHDX path recovery

### POST /clones/{cloneId}/recover-vhdx
Execute VHDX path recovery (without dry-run by default)

---

## Troubleshooting

### Enable debug logging

```typescript
process.env.LOG_LEVEL = 'debug';
import logger from './logger';
// Now logs will show detailed validation steps
```

### Check metadata directly

```typescript
const metadataService = getMetadataService();
const clone = await metadataService.getClone(cloneId);
console.log('Current metadata:', clone);

// Check what's missing
console.log('vhdxPath:', clone.vhdxPath);
console.log('storagePath:', clone.storagePath);
console.log('databaseName:', clone.databaseName);
```

### Manually update metadata

```typescript
await metadataService.updateClone(cloneId, {
  vhdxPath: '/path/to/file.vhdx',
  databaseName: 'MyDatabase'
});

// Verify update
const updated = await metadataService.getClone(cloneId);
console.log('Updated metadata:', updated);
```

---

## See Also

- [Clone Management Guide](./CLONE_MANAGEMENT.md)
- [Metadata Schema](./METADATA_SCHEMA.md)
- [API Contracts](./API_CONTRACTS.md)
