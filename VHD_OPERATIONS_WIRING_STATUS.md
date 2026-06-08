# VHD/VHDX Lifecycle Module - GUI Wiring Status

**Date:** 2026-06-08  
**Phase:** 4 - VHD/VHDX Lifecycle Module  
**Status:** ⏳ **PARTIALLY WIRED** (Module implemented, not yet fully integrated with providers)

---

## Current Implementation Status

### Module: ✅ IMPLEMENTED
**File:** `src/FlashDB/VhdOperations/FlashDB.VhdOperations.psm1` (450+ lines)

**Functions Implemented:**
1. ✅ `New-FlashdbBaseDisk()` - Create base VHDX disk
2. ✅ `New-FlashdbDifferencingDisk()` - Create differencing disk (for clones)
3. ✅ `Mount-FlashdbDisk()` - Mount disk and return info
4. ✅ `Dismount-FlashdbDisk()` - Dismount disk safely
5. ✅ `Test-FlashdbDiskChain()` - Validate parent-child disk chain
6. ✅ `Remove-FlashdbDisk()` - Delete disk safely
7. ✅ `Invoke-FlashdbDiskCleanup()` - Cleanup on failure
8. ✅ `Test-FlashdbVhdHealth()` - Health check

### Import Status: ✅ IMPORTED
**File:** `src/FlashDB/FlashDB.psm1` (Line 55-57)

```powershell
# Import VHD Operations Module (Phase 4: VHD lifecycle)
Import-Module -Name "$script:ModuleRoot\VhdOperations\FlashDB.VhdOperations.psm1" -Force -ErrorAction Continue
```

### GUI/Provider Usage: ⏳ NOT YET WIRED
- Providers are **NOT calling** VHD Operations functions
- Still using legacy/direct VHD cmdlet calls
- Functions available but unused by backup/clone operations

---

## Operations That Should Use VHD Module

### 1. Golden Image Creation (Backup)
```
SHOULD USE:
  New-FlashdbBaseDisk() → Create backup storage disk
  
CURRENTLY USES:
  Raw VHDX operations (legacy)
```

### 2. Clone Creation
```
SHOULD USE:
  New-FlashdbDifferencingDisk() → Create clone disk from parent
  Mount-FlashdbDisk() → Mount the clone disk
  
CURRENTLY USES:
  Direct Mount-VHD/Dismount-VHD
```

### 3. Checkpoint Creation
```
SHOULD USE:
  New-FlashdbDifferencingDisk() → Create checkpoint snapshot
  
CURRENTLY USES:
  Legacy checkpoint methods
```

### 4. Clone Deletion
```
SHOULD USE:
  Dismount-FlashdbDisk() → Safe dismount
  Remove-FlashdbDisk() → Cleanup
  
CURRENTLY USES:
  Direct Dismount-VHD, then delete files
```

### 5. Validation & Repair
```
SHOULD USE:
  Test-FlashdbDiskChain() → Validate disk integrity
  Test-FlashdbVhdHealth() → Check disk health
  Invoke-FlashdbDiskCleanup() → Rollback on failure
  
CURRENTLY USES:
  Not implemented yet
```

---

## Wiring Needed

### Step 1: Export Functions from Main Module
Add to `src/FlashDB/FlashDB.psm1`:

```powershell
# Export VHD Operations functions for providers to use
$vhdOpsFunctions = @(
    'New-FlashdbBaseDisk'
    'New-FlashdbDifferencingDisk'
    'Mount-FlashdbDisk'
    'Dismount-FlashdbDisk'
    'Test-FlashdbDiskChain'
    'Remove-FlashdbDisk'
    'Invoke-FlashdbDiskCleanup'
    'Test-FlashdbVhdHealth'
)
foreach ($func in $vhdOpsFunctions) {
    Export-ModuleMember -Function $func
}
```

### Step 2: Create Helper Functions (Similar to dbatools wiring)

Add wrappers to `src/FlashDB/FlashDB.psm1`:

```powershell
function Invoke-FlashdbCloneVhdMount {
    [CmdletBinding()]
    param(
        [string]$DiskPath,
        [string]$CloneName
    )
    
    if ((Get-Module FlashDB.VhdOperations -ErrorAction SilentlyContinue)) {
        Mount-FlashdbDisk -Path $DiskPath
    } else {
        Mount-VHD -Path $DiskPath
    }
}

function Invoke-FlashdbCloneVhdDismount {
    [CmdletBinding()]
    param(
        [string]$DiskPath
    )
    
    if ((Get-Module FlashDB.VhdOperations -ErrorAction SilentlyContinue)) {
        Dismount-FlashdbDisk -Path $DiskPath
    } else {
        Dismount-VHD -Path $DiskPath
    }
}
```

### Step 3: Update Providers to Use New Functions

Update `src/FlashDB/Providers/GoldenImageProvider.ps1`:

```powershell
# OLD:
Mount-VHD -Path $diskPath

# NEW:
if ((Get-Module FlashDB.VhdOperations)) {
    Mount-FlashdbDisk -Path $diskPath
} else {
    Mount-VHD -Path $diskPath
}
```

---

## Complete GUI Flow After Wiring

```
User clicks "Create Clone" in GUI
    ↓
API: POST /api/clones
    ↓
Task: 'create-clone' queued
    ↓
Task Worker executes: New-FlashdbClone
    ↓
GoldenImageProvider calls:
  1. New-FlashdbDifferencingDisk($parentDisk, $clonePath)
     ↓ Creates differencing disk linked to golden image
  
  2. Mount-FlashdbDisk($clonePath)
     ↓ Mounts disk, returns volume info
  
  3. Invoke-FlashdbDatabaseMount($server, $db)
     ↓ Uses dbatools to attach database
    ↓
✓ Clone fully operational
    ↓
GUI refreshes clone list
```

---

## Advantages of Wiring VHD Module

| Feature | Advantage |
|---------|-----------|
| **Centralized Logic** | All VHD operations in one place |
| **Error Handling** | Consistent error handling across operations |
| **Validation** | Disk chain validation before operations |
| **Cleanup** | Rollback cleanup on partial failures |
| **Testing** | Pester tests already in place |
| **Logging** | Detailed diagnostic information |
| **Repair** | Built-in repair and health check |

---

## Current Files Status

| File | Status | Action |
|------|--------|--------|
| `FlashDB.VhdOperations.psm1` | ✅ Implemented | Ready to wire |
| `FlashDB.psm1` | ✅ Imports module | Needs export + helpers |
| `GoldenImageProvider.ps1` | ❌ Not using | Needs update |
| `CloneManagement.ps1` | ❌ Not using | Needs update |
| `CheckpointManagement.ps1` | ❌ Not using | Needs update |

---

## Comparison: Before vs After

### BEFORE (Current - No Wiring):
```powershell
# Raw VHD operations
Mount-VHD -Path $diskPath
Dismount-VHD -Path $diskPath
New-VHD -Path $vhdPath -Size 50GB
# No validation, no cleanup, limited error handling
```

### AFTER (Fully Wired):
```powershell
# Safe VHD operations via module
Mount-FlashdbDisk -Path $diskPath
  ✓ Validates disk existence
  ✓ Handles mount errors
  ✓ Returns full disk info
  ✓ Logs operation
  
Dismount-FlashdbDisk -Path $diskPath
  ✓ Validates mounted state
  ✓ Force-closes volumes if needed
  ✓ Handles mount point cleanup
  ✓ Logs operation
  
New-FlashdbBaseDisk -Path $path -Size 50GB
  ✓ Creates directory if needed
  ✓ Validates size
  ✓ Returns creation metadata
  ✓ Full diagnostic info
```

---

## Integration Checklist

- [ ] Export VHD functions from main module
- [ ] Create helper wrappers (optional but recommended)
- [ ] Update GoldenImageProvider to use VHD module
- [ ] Update CloneManagement to use VHD module
- [ ] Update CheckpointManagement to use VHD module
- [ ] Test golden image creation with VHD module
- [ ] Test clone creation with VHD module
- [ ] Test clone deletion with VHD module
- [ ] Test checkpoint creation with VHD module
- [ ] Verify disk validation works
- [ ] Verify cleanup on error works
- [ ] Verify health checks work

---

## Summary

| Aspect | Status | Notes |
|--------|--------|-------|
| **Implementation** | ✅ Complete | 450+ lines, 8 functions |
| **Module Import** | ✅ Done | Imported in FlashDB.psm1 |
| **Export to Providers** | ❌ Pending | Functions not exported yet |
| **Provider Usage** | ❌ Not wired | Providers not calling VHD functions |
| **GUI Integration** | ❌ Incomplete | Depends on provider updates |
| **Tests** | ✅ Ready | Pester tests included |
| **Documentation** | ✅ Ready | Help functions documented |

---

## Next Steps

**To complete VHD/VHDX Lifecycle Module wiring:**

1. **Export Functions** (5 minutes)
   - Add Export-ModuleMember calls to main module
   
2. **Create Helpers** (10 minutes)
   - Add wrapper functions for easy provider adoption
   
3. **Update Providers** (30-60 minutes)
   - GoldenImageProvider: Use New-FlashdbBaseDisk
   - CloneManagement: Use New-FlashdbDifferencingDisk, Mount-FlashdbDisk
   - Cleanup: Use Dismount-FlashdbDisk, Remove-FlashdbDisk
   
4. **Test End-to-End** (30 minutes)
   - Create golden image → verify disk created
   - Create clone → verify mount works
   - Delete clone → verify cleanup works

**Estimated Total Time:** 90 minutes

---

## Conclusion

**VHD/VHDX Lifecycle Module Status:**
- ✅ Fully implemented and tested
- ✅ Module imported into main FlashDB
- ⏳ Awaiting provider integration
- ⏳ Not yet used by GUI operations

**GUI Wiring Status:** **⏳ PENDING PROVIDER UPDATES**

The module is ready. Providers just need to call the functions instead of raw VHD cmdlets.

