# Phase 2 Quick Reference - Function Implementation Matrix

## At-a-Glance Function Status

### SqlServerProvider.ps1 - Implementation Status

| Function | Lines | Current Status | Phase 2 Action | Priority |
|----------|-------|-----------------|-----------------|----------|
| **CreateGoldenImage()** | 64-84 | Router stub | Replace with call dispatch | HIGH |
| **CreateGoldenImageFromBackup()** | 94-149 | Logging only | Full implementation | CRITICAL |
| **CreateGoldenImageFromReplica()** | 160-210 | Logging only | Full implementation | CRITICAL |
| **CreateGoldenImageFromTableCopy()** | 222-278 | Stub loop | Full implementation | CRITICAL |
| **BackupDatabase()** | 284-320 | ✓ Real (T-SQL) | No change | - |
| **RestoreDatabase()** | 322-381 | ✓ Real (T-SQL) | No change | - |
| **AttachDatabase()** | 387-450 | ✓ Real (T-SQL) | No change | - |
| **DetachDatabase()** | 452-499 | ✓ Real (T-SQL) | No change | - |
| **ValidateConnection()** | 505-530 | ✓ Real (test query) | No change | - |
| **GetDatabaseInfo()** | 532-595 | ✓ Real (DMV query) | No change | - |
| **CloseActiveConnections()** | 597-656 | ✓ Real (kill SPID) | No change | - |
| **ComputeRowCountHash()** [hidden] | 662-712 | ✓ Real (SHA256) | No change | - |
| **GetReplicaLag()** [hidden] | 714-753 | ✓ Real (DMV query) | No change | - |
| **GetTableList()** [hidden] | 755-802 | ✓ Real (schema query) | No change | - |

### New Helper Functions Needed

| Function | Purpose | Location | LOC | Priority |
|----------|---------|----------|-----|----------|
| **GetDriveLetterFromVHD()** [hidden] | Map VHDX path to drive letter | SqlServerProvider.ps1 | ~20 | HIGH |
| **FormatVhdxVolume()** [hidden] | Format and prepare VHDX volume | SqlServerProvider.ps1 | ~15 | MEDIUM |
| **GetTableSchema()** [hidden] | Get complete table structure | SqlServerProvider.ps1 | ~30 | LOW |

---

## Line-by-Line Changes Required

### Method 1: BackupRestore (Lines 94-149)

**Current (Stub):**
```powershell
Write-Host "Step 1: Creating VHDX for golden image..."
# Implementation: Create VHDX

Write-Host "Step 2: Restoring backup to VHDX-attached database..."
# Implementation: Use Restore-SqlDatabase or T-SQL RESTORE
```

**Required Changes:**
1. Line 124: Replace comment with `New-VHD` call
   - Create VHDX at $TargetVhdxPath
   - Size from $Options['VhdxSize'] or default 50GB

2. Line 127: Replace comment with `Mount-VhdxDisk` call
   - Mount the VHDX
   - Get drive letter

3. Line 130: Replace comment with `CREATE DATABASE` + RESTORE
   - Execute RESTORE with proper file paths
   - Set recovery mode

4. Line 132-136: Replace comment block
   - Add actual row count hash computation
   - Use existing `ComputeRowCountHash()` helper

5. Line 138-141: Replace comment block
   - Add actual VHDX optimization (optional)
   - Already implemented elsewhere

6. Line 143: Replace comment with actual consolidation
   - Copy from temp location to $TargetVhdxPath

---

### Method 2: ReplicaBackup (Lines 160-210)

**Current (Stub):**
```powershell
Write-Host "Step 1: Verifying replica connectivity..."
$replicaLag = $this.GetReplicaLag($SourceConnection, $databaseName)
# But $replicaLag is never used in stub

Write-Host "Step 2: Executing BACKUP FROM MIRROR..."
# Implementation: Execute T-SQL BACKUP DATABASE ... FROM MIRROR
$backupFile = Join-Path $env:Temp "backup-$(Get-Random).bak"
```

**Required Changes:**
1. Line 180-182: Implement actual replica lag check
   - Call `$this.GetReplicaLag()` - already implemented ✓
   - Check against threshold (already done)

2. Line 188: Replace comment with BACKUP FROM MIRROR
   - Execute T-SQL: `BACKUP DATABASE ... FROM MIRROR`
   - Save to $backupFile (staging location)

3. Line 193: Replace comment with RESTORE
   - Execute RESTORE from $backupFile (same as Method 1)

4. Line 195-199: Replace comment block
   - Actual row count hash computation

5. Line 204: Replace comment
   - Actually delete $backupFile (staging)

---

### Method 3: TableByTableCopy (Lines 222-278)

**Current (Stub):**
```powershell
Write-Host "Step 1: Creating VHDX..."
# Implementation: Create VHDX

Write-Host "Step 2: Connecting to source database..."
$sourceTables = $this.GetTableList($SourceConnection, $sourceDbName)
Write-Verbose "Found $($sourceTables.Count) tables to copy"

Write-Host "Step 3: Copying tables..."
$copiedTables = 0
foreach ($table in $sourceTables) {
    Write-Verbose "Copying table: $($table.Schema).$($table.Name)"
    # Implementation: BCP or SELECT INTO to copy data
    $copiedTables++
}
```

**Required Changes:**
1. Line 244: Replace comment with CREATE VHDX
   - Same as Method 1

2. Line 248: Already calls `GetTableList()` ✓
   - This is already correct

3. Line 253-256: Replace loop body
   - Execute INSERT INTO SELECT for each table
   - Handle copy failures gracefully
   - Count actual rows copied

4. Line 263: Replace comment block
   - Verify row counts match source vs. target
   - Log any mismatches as warnings

5. Line 267: Replace comment block
   - Actual row count hash computation

---

## Code Templates for Copy/Paste

### Template 1: VHDX Creation + Mount + Dismount

```powershell
# Create VHDX
$parentPath = Join-Path (Split-Path $TargetVhdxPath) "parent_$(Get-Date -Format yyyyMMdd).vhdx"
Write-Verbose "Creating VHDX: $parentPath"
New-VHD -Path $parentPath -SizeBytes 50GB -Fixed | Out-Null

# Mount VHDX
Mount-VhdxDisk -VhdxPath $parentPath

# ... do work ...

# Dismount VHDX
Dismount-VhdxDisk -VhdxPath $parentPath -Force

# Consolidate
Copy-Item -Path $parentPath -Destination $TargetVhdxPath -Force
```

### Template 2: Database RESTORE

```powershell
$restoreQuery = @"
RESTORE DATABASE [$databaseName]
FROM DISK = '$backupFile'
WITH MOVE '$logicalName' TO '$mdfPath',
     MOVE '$logicalName`_Log' TO '$ldfPath',
     REPLACE, RECOVERY
"@

$conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=true;")
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = $restoreQuery
$cmd.CommandTimeout = 3600
$cmd.ExecuteNonQuery() | Out-Null
$conn.Close()
```

### Template 3: Table-by-Table Copy

```powershell
foreach ($table in $tables) {
    $tableName = "$($table.Schema).$($table.Name)"
    
    $copyQuery = @"
INSERT INTO [$databaseName].[$($table.Schema)].[$($table.Name)]
SELECT *
FROM [$sourceDbName].[$($table.Schema)].[$($table.Name)]
"@
    
    $conn = New-Object System.Data.SqlClient.SqlConnection($SourceConnection)
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $copyQuery
    $cmd.CommandTimeout = 3600
    [int]$rowsCopied = $cmd.ExecuteNonQuery()
    $conn.Close()
    
    Write-Verbose "Copied $rowsCopied rows to $tableName"
}
```

### Template 4: Row Count Hash (Already Implemented)

```powershell
# This is already implemented in the helper - just call it:
$rowCountHash = $this.ComputeRowCountHash($databaseName)
```

---

## Parallel Work Streams

### Can Work in Parallel (No Dependencies)

1. **Unit Test Framework** (Week 1-2)
   - Setup Pester test file
   - Create mock SQL connections
   - Can write tests before implementation

2. **Integration Test Harness** (Week 1)
   - Create test SQL databases
   - Create test backup files
   - Setup VHDX test paths
   - Run tests against real SQL Server

3. **Performance Benchmark Script** (Week 2)
   - Time each golden image method
   - Measure VHDX sizes
   - Profile SQL operations

### Must Do Sequentially

1. **Implement Method 1** → **Test Method 1** → **Implement Method 2**
2. **Method 2 Test** → **Implement Method 3**
3. **All 3 tested** → **Performance & refinement**

---

## Testing Checklist

### Unit Test Checklist (Mock-Based)

- [ ] CreateGoldenImageFromBackup handles missing backup file
- [ ] CreateGoldenImageFromBackup calls VHDX functions in order
- [ ] CreateGoldenImageFromBackup returns correct metadata structure
- [ ] CreateGoldenImageFromReplica checks replica lag before backup
- [ ] CreateGoldenImageFromReplica handles BACKUP FROM MIRROR
- [ ] CreateGoldenImageFromTableCopy creates target database
- [ ] CreateGoldenImageFromTableCopy copies all tables
- [ ] CreateGoldenImageFromTableCopy handles copy failures gracefully
- [ ] ComputeRowCountHash returns SHA256 format
- [ ] GetReplicaLag handles non-mirrored databases
- [ ] GetTableList returns correct schema objects

### Integration Test Checklist (Real SQL Server)

- [ ] BackupRestore creates actual VHDX file
- [ ] BackupRestore VHDX has correct size (data + overhead)
- [ ] BackupRestore database can attach to SQL Server
- [ ] BackupRestore row counts match source backup
- [ ] ReplicaBackup (requires mirror setup)
- [ ] TableByTableCopy creates working database
- [ ] TableByTableCopy row counts match source database
- [ ] TableByTableCopy schema and indexes intact
- [ ] Metadata stored correctly for all 3 methods

### Performance Checklist

- [ ] VHDX mount/unmount < 2 seconds
- [ ] Method 1 (BackupRestore) < 5 minutes for 10GB database
- [ ] Method 2 (ReplicaBackup) comparable to Method 1
- [ ] Method 3 (TableByTableCopy) < 10 minutes for 10GB database
- [ ] Storage efficiency > 70% reduction vs. backup
- [ ] No memory leaks during long operations

---

## Common Pitfalls to Avoid

| Pitfall | Prevention |
|---------|-----------|
| Forgetting to mount VHDX before database operations | Add test to verify drive letter exists |
| Not setting CommandTimeout high enough | Use 3600 seconds for RESTORE/BACKUP |
| Trying to restore to existing database | Always use REPLACE clause |
| Leaving VHDX mounted after completion | Add cleanup in finally block |
| Not handling SQL connection failures | Wrap in try-catch, validate connection first |
| VHDX space too small for restore | Calculate size = backup size × 1.2 + log space |
| Mixing up source and target databases | Use explicit database names in all queries |

---

## Quick Debugging Checklist

**If BackupRestore fails:**
1. Check if backup file exists and is readable
2. Verify VHDX mount point is accessible
3. Check SQL Server error log for RESTORE error
4. Verify database has space for restore
5. Check if database already exists (use REPLACE)

**If ReplicaBackup fails:**
1. Verify replica is accessible and lag < threshold
2. Check if BACKUP FROM MIRROR is supported (requires mirroring)
3. Verify staging location has disk space
4. Check if backup file was actually created

**If TableByTableCopy fails:**
1. Verify source database is accessible
2. Check if target database creation succeeded
3. Verify all tables enumerated correctly
4. Check individual table copy errors (may be partial success)

---

## File Locations Quick Reference

| Component | File | Modify? | Lines |
|-----------|------|---------|-------|
| Main provider | `src/Providers/SqlServer/SqlServerProvider.ps1` | YES | 94-149, 160-210, 222-278 |
| Add helpers | `src/Providers/SqlServer/SqlServerProvider.ps1` | YES | After line 802 (+~80 LOC) |
| Tests | `tests/Unit/SqlServerProvider.Tests.ps1` | CREATE | New file |
| Integration | `tests/Integration/SqlServerGoldenImage.Tests.ps1` | CREATE | New file |
| Performance | `tests/Performance/SqlServerPerf.ps1` | CREATE | New file |

---

## Summary: Lines to Change

```
Total lines to modify: ~150
Total lines to add (helpers): ~80
Total new test lines: ~500
Estimated implementation time: 10 days (2 developers)

Critical path:
  Day 1-2: Method 1 implementation + unit tests
  Day 2-3: Method 2 implementation + unit tests  
  Day 3-5: Method 3 implementation + unit tests
  Day 5-7: Integration testing
  Day 7-10: Performance testing + bug fixes
```

---

End of Quick Reference
