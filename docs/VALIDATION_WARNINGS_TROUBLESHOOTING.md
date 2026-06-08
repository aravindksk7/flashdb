# Validation Warnings: Troubleshooting and Fixes

## Summary of Changes

| Warning | Status | Root Cause | Fix |
|---------|--------|-----------|-----|
| **NO_VHDX_PATH** | FIXED with recovery logic | Metadata missing vhdxPath field | Added `recoverVhdxPath()` method; recovers from storage_path |
| **ATTACHED_BUT_NO_MOUNT** | REMOVED | mount_path is non-durable (isDurableFact: false) | Removed validation check; mount point obtained dynamically |

---

## Warning 1: NO_VHDX_PATH

### Problem Description

```
Validation Finding:
  Code: NO_VHDX_PATH
  Severity: Warning
  Message: Clone has no VHDX path recorded
```

The clone metadata exists but the `vhdxPath` field is empty/null.

### Root Cause Analysis

**Why it happens:**

1. Clone was created but `vhdxPath` was never populated
2. Metadata was lost/corrupted and vhdxPath field was not restored
3. Clone files moved but metadata not updated

**Why it matters:**

- VHDX path is a **durable fact** (stored in database, marked `isDurableFact: true`)
- Operations depend on this path to mount/attach the clone
- Without it, the system cannot locate the virtual disk file

### Detection

**In code (cloneValidationService.ts, lines 72-81):**

```typescript
// Check VHD path exists
if (clone.vhdxPath) {
  // Would check file system here
  details.checks.push(`VHDX path: ${clone.vhdxPath}`);
} else {
  findings.push({
    severity: 'Warning',
    code: 'NO_VHDX_PATH',
    message: 'Clone has no VHDX path recorded',
  });
}
```

### Recovery Solution

#### Method 1: Storage Path Construction (Recommended)

**How it works:**
- Reconstructs VHDX path from the clone's `storagePath` and cloneId
- Assumes standard naming: `{storagePath}\{cloneId}.vhdx`
- No file system scanning needed

**Implementation:**

```typescript
const validationService = getCloneValidationService();

// Dry-run: preview the recovery
const preview = await validationService.recoverVhdxPath('clone-123', true);
console.log('Would recover:', preview.recoveredPath);
// Output: D:\Clones\clone-123\clone-123.vhdx

// Execute: actually update metadata
const result = await validationService.recoverVhdxPath('clone-123', false);
if (result.success) {
  console.log('✓ Recovery successful');
  console.log('  Path:', result.recoveredPath);
  console.log('  Method:', result.method);
}
```

**Success rate:** High - assumes standard naming convention

**Limitations:** 
- Only works if `storagePath` is present in metadata
- Assumes VHDX file exists at constructed path (not validated in basic mode)

#### Method 2: Database Query (Advanced)

**How it works:**
- Queries SQL Server system tables for attachment history
- Finds where the clone database was previously attached
- Extracts file path from attachment records

**Currently:** Placeholder implementation (requires database queries)

**When to use:** If storagePath is also missing

#### Method 3: Manual Recovery (Last Resort)

**How it works:**
- User locates the VHDX file manually
- Provides full path through API or manually

**Command:**

```typescript
const metadataService = getMetadataService();

// Manually provide the path
await metadataService.updateClone('clone-123', {
  vhdxPath: 'E:\\CustomLocation\\clone-123.vhdx'
});

// Verify
const clone = await metadataService.getClone('clone-123');
console.log('Updated vhdxPath:', clone.vhdxPath);
```

### Repair Plan

When NO_VHDX_PATH is detected, the repair plan includes:

```
Planned Actions:
  - Recover VHDX path from storage metadata

Estimated Duration: 30 seconds
```

### Testing

**Test scenario: Clone with missing vhdxPath**

```typescript
// Setup
const clone = {
  id: 'test-clone',
  storagePath: 'D:\\Clones\\test-clone',
  vhdxPath: null, // Missing
};

// Validate
const validation = await validationService.validateClone('test-clone');
expect(validation.findings).toContainEqual(
  expect.objectContaining({
    code: 'NO_VHDX_PATH',
    severity: 'Warning'
  })
);

// Recover
const recovery = await validationService.recoverVhdxPath('test-clone', true);
expect(recovery.success).toBe(true);
expect(recovery.recoveredPath).toBe('D:\\Clones\\test-clone\\test-clone.vhdx');
```

---

## Warning 2: ATTACHED_BUT_NO_MOUNT

### Problem Description

**Status: FIXED - This warning has been removed**

```
BEFORE (cloneValidationService.ts, original lines 98-104):
  Code: ATTACHED_BUT_NO_MOUNT
  Severity: Warning
  Message: Clone marked as attached but no mount path recorded
```

### Root Cause Analysis

**The Design Mismatch:**

In `metadataService.ts` (line 188):
```typescript
{
  name: 'mount_path',
  type: 'text',
  nullable: true,
  isDurableFact: false,  // ← This is the key!
  comment: 'Live mount point (Windows)',
}
```

**The problem:** Validation was checking for `mount_path`, but:
1. `isDurableFact: false` means it's NOT meant to be persisted
2. It's a transient "live observation" that changes
3. It's only populated when VHD is actively mounted
4. It resets when system restarts

**Why validation was wrong:**
- Checking for a non-durable field violates the schema intent
- The warning was never going to be resolved (mount_path is transient)
- System design never required mount_path to be stored

### The Fix

**Removed the validation check:**

```typescript
// BEFORE:
if (clone.status === 'Attached' && !clone.mountPath) {
  findings.push({
    severity: 'Warning',
    code: 'ATTACHED_BUT_NO_MOUNT',
    message: 'Clone marked as attached but no mount path recorded',
  });
}

// AFTER:
// Note: mount_path is NOT a durable fact (isDurableFact: false in metadataService.ts:188)
// It is a transient live observation that changes when the system restarts.
// We do NOT check for its presence because it's expected to be empty on fresh queries.
// Mount point is obtained dynamically via Get-Volume or similar calls when needed.
```

### How Mount Points Are Obtained Now

When you need the mount point, query it dynamically:

```powershell
# PowerShell - Get mount point for a clone
$clone = Get-FlashdbClone -CloneId "clone-123"
$volume = Get-Volume | Where-Object { 
  $_.FileSystemLabel -eq $clone.CloneName 
}
$mountPath = $volume.DriveLetter + ':'  # e.g., 'F:'
```

**OR** in TypeScript:

```typescript
// Run PowerShell to get live mount point
const result = await powershellService.execute(`
  Get-Volume | Where-Object { $_.FileSystemLabel -eq 'clone-123' } | 
  Select-Object -ExpandProperty DriveLetter
`);
const mountPath = result + ':';
```

### Why This Approach Is Better

1. **Accurate:** Always gets current mount point (not stale metadata)
2. **Resilient:** Works after system restarts (no stored data to lose)
3. **Consistent:** Matches system state rather than metadata
4. **Simple:** No need to keep mount_path in sync

### Impact

**Before fix:**
- Clone with status=Attached and no mount_path → WARNING
- User expected to fix something that can't be fixed
- Confusion about what "attached" means

**After fix:**
- Clone with status=Attached and no mount_path → NO WARNING
- System gets mount point dynamically when needed
- Clear separation: durable facts vs. live observations

### Testing

**Test: Attached clone without mount_path should not warn**

```typescript
const clone = {
  status: 'Attached',
  databaseName: 'TestDB',
  vhdxPath: '/path/to/file.vhdx',
  mountPath: null, // No mount path - this is OK now
};

const validation = await validationService.validateClone('clone-id');

// Should NOT contain ATTACHED_BUT_NO_MOUNT warning
const mountWarning = validation.findings.find(
  f => f.code === 'ATTACHED_BUT_NO_MOUNT'
);
expect(mountWarning).toBeUndefined();
```

---

## Code Changes Summary

### File: src/api/src/services/cloneValidationService.ts

**Changes:**

1. **Lines 98-104: Removed ATTACHED_BUT_NO_MOUNT check**
   - Replaced with explanatory comment
   - Explains why mount_path is not validated

2. **Lines 277-372: Added VHDX path recovery methods**
   - `recoverVhdxPath(cloneId, dryRun)` - Main recovery method
   - `findClonesNeedingVhdxRecovery()` - Find affected clones
   - Supports dry-run mode for preview

3. **Line 179-181: Updated repair plan**
   - Changed from "Remount VHD disk" to "Recover VHDX path"
   - Removed ATTACHED_BUT_NO_MOUNT from repair actions

### File: src/api/src/services/metadataService.ts

**No changes needed** - schema is already correct, comments clarified the intent:
- `mount_path` at line 188: `isDurableFact: false`

---

## Validation Before and After

### Before Fixes

```
Validation Result for clone-123:
  isHealthy: true (warnings don't fail validation)
  Findings:
    1. NO_VHDX_PATH (Warning) - vhdxPath is missing
    2. ATTACHED_BUT_NO_MOUNT (Warning) - mountPath is missing (but clone is Attached)

  Issues: 
    - NO_VHDX_PATH can be fixed with recovery
    - ATTACHED_BUT_NO_MOUNT is confusing (can't be fixed, expected behavior)
```

### After Fixes

```
Validation Result for clone-123:
  isHealthy: true
  Findings:
    1. NO_VHDX_PATH (Warning) - vhdxPath is missing
       → Can be recovered via recoverVhdxPath()

  Issues:
    - ATTACHED_BUT_NO_MOUNT removed (no longer checked)
    - Mount point obtained dynamically when needed
```

---

## Migration Guide

### If you have existing code checking for ATTACHED_BUT_NO_MOUNT:

**Before:**
```typescript
const findings = await validationService.validateClone(cloneId);
const mountWarning = findings.findings.find(f => f.code === 'ATTACHED_BUT_NO_MOUNT');
if (mountWarning) {
  console.log('Mount path missing!');
}
```

**After:**
```typescript
// This warning will never appear - no code change needed
// If you need the mount point, query it dynamically:
const result = await powershellService.execute(`
  Get-Volume | Where-Object { $_.FileSystemLabel -eq '${cloneName}' }
`);
const mountPath = result.DriveLetter;
```

---

## Verification

### Run Tests

```bash
npm test -- clone-validation-repairs.test.ts

# Expected output:
#   CloneValidationService - Repair Logic
#     NO_VHDX_PATH Detection and Recovery
#       ✓ should detect when clone has no VHDX path recorded
#       ✓ should recover VHDX path from storage_path
#       ✓ should not modify metadata during dry-run
#       ✓ should update metadata when executing recovery without dry-run
#       ...
#     ATTACHED_BUT_NO_MOUNT Removal
#       ✓ should NOT report ATTACHED_BUT_NO_MOUNT warning
#       ✓ should still report ATTACHED_BUT_NO_DB warning
#     ...
```

### Manual Verification

```typescript
const validationService = getCloneValidationService();

// 1. Check that NO_VHDX_PATH can be recovered
const recovery = await validationService.recoverVhdxPath('test-clone', true);
console.log('✓ NO_VHDX_PATH recovery available:', recovery.success);

// 2. Check that ATTACHED_BUT_NO_MOUNT is not reported
const validation = await validationService.validateClone('test-clone');
const mountWarning = validation.findings.find(f => f.code === 'ATTACHED_BUT_NO_MOUNT');
console.log('✓ ATTACHED_BUT_NO_MOUNT removed:', !mountWarning);

// 3. Check that other warnings still work
const hasOtherWarnings = validation.findings.length > 0;
console.log('✓ Other warnings still detected:', hasOtherWarnings);
```

---

## FAQ

**Q: What if my clone needs mount_path to be stored?**
A: Mount path is transient. Get it dynamically using Get-Volume. If you need to persist metadata about mounts, create a separate audit table.

**Q: Can I store mount_path if I want to?**
A: You can add it to metadata manually, but it won't be maintained by the system. It will become stale after restarts. Better to query dynamically.

**Q: What if the VHDX file doesn't exist at the recovered path?**
A: Recovery shows the path that should exist. If file is missing, you need to locate it manually or restore from backup. Update metadata manually with correct path.

**Q: Can I repair multiple clones at once?**
A: Use `findClonesNeedingVhdxRecovery()` to find affected clones, then repair each one:
```typescript
const affected = await validationService.findClonesNeedingVhdxRecovery();
for (const cloneId of affected) {
  await validationService.recoverVhdxPath(cloneId, false);
}
```

**Q: Are repairs audited?**
A: Yes, all repair attempts are saved in metadata via `saveRepairAttempt()`, including what was attempted, what succeeded/failed, and timestamps.

---

## Related Documentation

- [Validation Repair Guide](./VALIDATION_REPAIR_GUIDE.md) - Full workflow
- [Metadata Schema](./METADATA_SCHEMA.md) - Field definitions
- [Clone Management Guide](./CLONE_MANAGEMENT.md) - Clone lifecycle
