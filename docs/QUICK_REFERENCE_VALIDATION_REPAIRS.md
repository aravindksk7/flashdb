# Quick Reference: Validation Repairs

## Two Fixes Applied

### Fix 1: NO_VHDX_PATH - Now Has Recovery Logic

```typescript
// Detect
const result = await validationService.validateClone(cloneId);
// → finds: { code: 'NO_VHDX_PATH', severity: 'Warning' }

// Preview recovery (dry-run)
const preview = await validationService.recoverVhdxPath(cloneId, true);
// → { success: true, recoveredPath: 'D:\Clones\clone-123\clone-123.vhdx' }

// Execute recovery
const recovery = await validationService.recoverVhdxPath(cloneId, false);
// → { success: true, recoveredPath: '...' } + metadata updated
```

### Fix 2: ATTACHED_BUT_NO_MOUNT - Validation Check Removed

```typescript
// Before: Would warn about missing mount_path
// After: mount_path is obtained dynamically, not validated

// To get mount point:
const volume = Get-Volume | Where-Object { $_.FileSystemLabel -eq 'clone-name' }
const mountPath = $volume.DriveLetter + ':'  // e.g., 'F:'
```

---

## Common Tasks

### Check if clone needs repair
```typescript
const validation = await validationService.validateClone(cloneId);
console.log('Healthy?', validation.isHealthy);
console.log('Warnings:', validation.findings);
```

### Preview what repair will do
```typescript
const plan = await validationService.repairClone(cloneId, true);
console.log('Actions:', plan.plannedActions);
console.log('Duration:', plan.estimatedDurationSeconds, 'sec');
```

### Execute repair
```typescript
const result = await validationService.executeRepair(cloneId, false);
console.log('Result:', result.result);  // 'Success', 'Failed', 'Skipped'
```

### Just recover VHDX path
```typescript
const result = await validationService.recoverVhdxPath(cloneId, false);
if (result.success) {
  console.log('Recovered:', result.recoveredPath);
}
```

---

## What Changed in Code

| Item | Before | After |
|------|--------|-------|
| **NO_VHDX_PATH warning** | ✓ Detected | ✓ Detected + Can recover |
| **ATTACHED_BUT_NO_MOUNT warning** | ✓ Detected | ✗ Removed (non-durable) |
| **Mount point behavior** | Expected in metadata | Obtained dynamically |
| **VHDX recovery** | N/A | ✓ New: `recoverVhdxPath()` |

---

## Files Modified

- `src/api/src/services/cloneValidationService.ts` - Added recovery logic, removed mount check
- `src/api/src/__tests__/clone-validation-repairs.test.ts` - New test suite
- `docs/VALIDATION_REPAIR_GUIDE.md` - Full workflow documentation
- `docs/VALIDATION_WARNINGS_TROUBLESHOOTING.md` - Detailed troubleshooting

---

## Test Command

```bash
npm test -- clone-validation-repairs.test.ts
```

Expected: All tests pass, including:
- NO_VHDX_PATH detection
- VHDX path recovery
- ATTACHED_BUT_NO_MOUNT removal
- Repair plan generation

---

## Key Concept: Durable vs Non-Durable

**Durable facts** (checked, validated, repaired):
- vhdxPath ✓
- databaseName ✓
- storagePath ✓
- status ✓

**Non-durable observations** (NOT checked):
- mountPath ✗ (transient, changes after restart)
- Get dynamically when needed

---

## Troubleshooting

**Q: Recovery says no storagePath found?**
A: Clone metadata is incomplete. Provide path manually:
```typescript
await metadataService.updateClone(cloneId, {
  vhdxPath: '/full/path/to/clone.vhdx'
});
```

**Q: Still seeing ATTACHED_BUT_NO_MOUNT?**
A: Reload service - it's removed from validation checks.

**Q: Need mount point?**
A: Query dynamically (don't rely on metadata):
```powershell
Get-Volume | Where-Object { $_.FileSystemLabel -eq 'clone-name' }
```

---

## See Also

- Full guide: [VALIDATION_REPAIR_GUIDE.md](./VALIDATION_REPAIR_GUIDE.md)
- Detailed troubleshooting: [VALIDATION_WARNINGS_TROUBLESHOOTING.md](./VALIDATION_WARNINGS_TROUBLESHOOTING.md)
