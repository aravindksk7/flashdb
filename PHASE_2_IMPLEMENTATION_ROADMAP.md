# FlashDB Phase 2 Implementation Roadmap
## SQL Server Provider Real Implementation

**Date:** 2026-06-06  
**Phase:** 2 (Weeks 4-6)  
**Status:** Ready for Implementation  
**Target Owner:** Database Developer

---

## Executive Summary

Phase 2 transforms the SQL Server Provider from stub implementations to fully functional database operations. The provider currently has method signatures and logging but no real VHDX or SQL Server operations. This roadmap details:

1. **Which functions need implementation** (with current file locations and line numbers)
2. **What each function should actually do** (detailed implementation specifications)
3. **Dependencies** (function A must be implemented before B)
4. **Implementation order** (critical path and parallelizable work)
5. **Files to modify vs. create** (no new files needed—all stubs exist)

---

## Current State Analysis

### Files with Stub Implementations

| File | Functions | Status |
|------|-----------|--------|
| `src/Providers/SqlServer/SqlServerProvider.ps1` | 8 main methods + 3 hidden helpers | Stubs only (logging, no ops) |
| `src/FlashDB/Core/VhdxOperations.ps1` | 7 functions | Fully implemented (ready to use) |
| `src/FlashDB/Core/MetadataManager.ps1` | 6 functions | Fully implemented (ready to use) |
| `src/FlashDB/Providers/GoldenImageProvider.ps1` | 11 functions | In-memory stubs (OK for Phase 1) |
| `src/FlashDB/Core/CheckpointManagement.ps1` | 7 functions | Stubs calling undefined helpers |
| `src/FlashDB/Core/CloneManagement.ps1` | 5+ functions | Stubs (calls undefined helpers) |

### Implementation Status by Module

#### VHDX Operations (src/FlashDB/Core/VhdxOperations.ps1)
**Status:** ✓ Fully Implemented - Ready for Phase 2

- `New-VhdxDifferencingDisk` (lines 41-102) - ✓ Real implementation
- `Mount-VhdxDisk` (lines 124-185) - ✓ Real implementation
- `Dismount-VhdxDisk` (lines 207-256) - ✓ Real implementation
- `New-VhdxSnapshot` (lines 282-329) - ✓ Real implementation
- `Restore-VhdxSnapshot` (lines 352-398) - ✓ Real implementation
- `Get-VhdxInfo` (lines 417-457) - ✓ Real implementation
- `Test-VhdxIntegrity` (lines 479-541) - ✓ Real implementation
- `Get-DiskFromVHD` (helper, lines 544-569) - ✓ Real implementation

#### Metadata Manager (src/FlashDB/Core/MetadataManager.ps1)
**Status:** ✓ Fully Implemented - Ready for Phase 2

- `Get-FlashdbMetadata` (lines 41-74) - ✓ Real implementation
- `Save-FlashdbMetadata` (lines 104-171) - ✓ Real implementation
- `Test-MetadataSchema` (lines 193-260) - ✓ Real implementation
- `Export-FlashdbMetadata` (lines 290-358) - ✓ Real implementation
- `Add-FlashdbOperationLog` (lines 389-447) - ✓ Real implementation
- `Get-FlashdbMetadataSchemaInfo` (lines 462-476) - ✓ Real implementation

#### SQL Server Provider (src/Providers/SqlServer/SqlServerProvider.ps1)
**Status:** ✗ Stubs Only - Phase 2 Priority

**Public Methods (need implementation):**
1. `CreateGoldenImage()` - Lines 64-84 (router method, dispatches to 3 methods)
2. `CreateGoldenImageFromBackup()` - Lines 94-149 (stub: logging + placeholders)
3. `CreateGoldenImageFromReplica()` - Lines 160-210 (stub: logging + placeholders)
4. `CreateGoldenImageFromTableCopy()` - Lines 222-278 (stub: logging + placeholders)
5. `BackupDatabase()` - Lines 284-320 (REAL: SQL backup implemented ✓)
6. `RestoreDatabase()` - Lines 322-381 (REAL: SQL restore implemented ✓)
7. `AttachDatabase()` - Lines 387-450 (REAL: CREATE DATABASE FOR ATTACH ✓)
8. `DetachDatabase()` - Lines 452-499 (REAL: sp_detach_db ✓)
9. `ValidateConnection()` - Lines 505-530 (REAL: Test connection ✓)
10. `GetDatabaseInfo()` - Lines 532-595 (REAL: Query database stats ✓)
11. `CloseActiveConnections()` - Lines 597-656 (REAL: Kill SPIDs ✓)

**Hidden Helper Methods (need implementation):**
1. `ComputeRowCountHash()` - Lines 662-712 (REAL: SHA256 hash ✓)
2. `GetReplicaLag()` - Lines 714-753 (REAL: Query mirroring status ✓)
3. `GetTableList()` - Lines 755-802 (REAL: Query schema ✓)

### Golden Image Provider (src/FlashDB/Providers/GoldenImageProvider.ps1)
**Status:** ✗ In-Memory Stubs - Currently OK

Functions that are stubs (but work with in-memory store):
- `New-FlashdbGoldenImage` (lines 9-34)
- `Get-FlashdbGoldenImage` (lines 36-55)
- `Remove-FlashdbGoldenImage` (lines 57-69)
- `Get-FlashdbGoldenImageInfo` (lines 71-88)
- `New-FlashdbClone` (lines 90-112)
- `Get-FlashdbClone` (lines 114-127)
- `Connect-FlashdbClone` (lines 129-144)
- `Disconnect-FlashdbClone` (lines 146-160)
- `Remove-FlashdbClone` (lines 162-179)
- `New-FlashdbCheckpoint` (lines 181-205)
- `Get-FlashdbCheckpoint` (lines 207-229)

**Note:** These work with in-memory hashtables. Phase 3 will make them persist to disk using MetadataManager.

---

## Phase 2 Implementation Details

### Layer 1: Golden Image Creation (3 Methods)

All three methods use the same architecture:
1. Create VHDX file (or verify it exists)
2. Mount VHDX to local system
3. Attach database to local SQL Server
4. Populate database (method-specific)
5. Capture metadata (row counts, schema hash)
6. Detach database
7. Save golden image metadata

#### Method 1: BackupRestore
**File:** `src/Providers/SqlServer/SqlServerProvider.ps1`  
**Current:** Lines 94-149 (stub with Write-Host steps)  
**Real Implementation Needed:** Yes

**Implementation Steps:**

```powershell
# Pseudocode for CreateGoldenImageFromBackup
# Lines 94-149

function CreateGoldenImageFromBackup([string]$SourceConnection, [string]$TargetVhdxPath, [hashtable]$Options) {
    # Step 1: Validate inputs
    $backupFile = $Options['BackupFile']
    $databaseName = $Options['DatabaseName']
    $vhdxSize = $Options['VhdxSize'] ?? 50GB
    
    if (-not (Test-Path $backupFile)) { throw "Backup file not found" }
    
    # Step 2: Create parent VHDX (golden image will be the parent)
    # VHDX should be on a shared location or local high-performance disk
    $parentPath = Join-Path (Split-Path $TargetVhdxPath) "parent_$(Get-Date -Format yyyyMMdd).vhdx"
    if (-not (Test-Path $parentPath)) {
        Write-Host "Creating parent VHDX: $parentPath"
        New-VHD -Path $parentPath -SizeBytes $vhdxSize -Fixed | Out-Null
    }
    
    # Step 3: Mount parent VHDX
    Write-Host "Mounting VHDX: $parentPath"
    Mount-VhdxDisk -VhdxPath $parentPath
    
    # Step 4: Format volume and attach to SQL Server
    # (assumes mounted as new drive letter)
    $driveInfo = Get-VhdxInfo -VhdxPath $parentPath
    $driveLetter = Get-DriveLetterFromVHD -VhdxPath $parentPath  # helper needed
    
    # Create MDF/LDF paths on mounted volume
    $mdfPath = "$driveLetter`:\DATA\$databaseName.mdf"
    $ldfPath = "$driveLetter`:\LOGS\$databaseName.ldf"
    New-Item -ItemType Directory -Path (Split-Path $mdfPath) -Force
    New-Item -ItemType Directory -Path (Split-Path $ldfPath) -Force
    
    # Step 5: Restore backup to VHDX-attached database
    $restoreQuery = @"
RESTORE DATABASE [$databaseName]
FROM DISK = '$backupFile'
WITH MOVE '$databaseName' TO '$mdfPath',
     MOVE '$databaseName`_Log' TO '$ldfPath',
     REPLACE, RECOVERY
"@
    
    $conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=true;")
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $restoreQuery
    $cmd.CommandTimeout = 3600
    $cmd.ExecuteNonQuery()
    $conn.Close()
    
    # Step 6: Compute metadata (row counts, schema hash)
    $rowCountHash = $this.ComputeRowCountHash($databaseName)  # Already real
    
    # Step 7: Detach database
    $this.DetachDatabase("localhost", $databaseName)  # Already real
    
    # Step 8: Dismount VHDX
    Dismount-VhdxDisk -VhdxPath $parentPath
    
    # Step 9: Copy parent to target golden image path (consolidate)
    Copy-Item -Path $parentPath -Destination $TargetVhdxPath -Force
    
    Write-Host "Golden image created: $TargetVhdxPath"
    Write-Verbose "Row count hash: $rowCountHash"
    
    return [PSCustomObject]@{
        VhdxPath = $TargetVhdxPath
        DatabaseName = $databaseName
        RowCountHash = $rowCountHash
        CreatedAt = (Get-Date).ToUniversalTime().ToString("o")
        Status = 'created'
    }
}
```

**Key Changes from Stub:**
- Replace `Write-Host "Step 1: Creating VHDX..."` with actual `New-VHD` call
- Replace `Write-Host "Step 2: Restoring backup..."` with actual RESTORE T-SQL
- Replace `Write-Host "Step 3: Verifying restore..."` with actual integrity check
- Compute actual row count hash (using existing `ComputeRowCountHash()`)
- Actually mount and unmount VHDX
- Actually restore from backup file

**Lines to Replace:**
- 124: Replace comment with `New-VHD` call
- 127: Replace comment with `Mount-VhdxDisk` call
- 130-131: Replace comment with RESTORE T-SQL

---

#### Method 2: ReplicaBackup
**File:** `src/Providers/SqlServer/SqlServerProvider.ps1`  
**Current:** Lines 160-210 (stub with placeholders)  
**Real Implementation Needed:** Yes

**Implementation Steps:**

```powershell
# Pseudocode for CreateGoldenImageFromReplica
# Lines 160-210

function CreateGoldenImageFromReplica([string]$SourceConnection, [string]$TargetVhdxPath, [hashtable]$Options) {
    # Step 1: Connect to replica and verify lag
    $databaseName = $Options['DatabaseName']
    $maxReplicaLagSeconds = $Options['MaxReplicaLagSeconds'] ?? 5
    
    $replicaLag = $this.GetReplicaLag($SourceConnection, $databaseName)  # Already real
    Write-Verbose "Replica lag: $replicaLag seconds"
    
    if ($replicaLag -gt $maxReplicaLagSeconds) {
        Write-Warning "Replica lag exceeds threshold"
    }
    
    # Step 2: Create VHDX (same as Method 1)
    $parentPath = Join-Path (Split-Path $TargetVhdxPath) "replica_backup_$(Get-Date -Format yyyyMMdd).vhdx"
    New-VHD -Path $parentPath -SizeBytes 50GB -Fixed
    
    # Step 3: Mount VHDX
    Mount-VhdxDisk -VhdxPath $parentPath
    
    # Step 4: Execute BACKUP FROM MIRROR to staging location
    # This is the key difference from Method 1
    $stagingBackup = Join-Path $env:Temp "backup_$(Get-Random).bak"
    
    $backupQuery = @"
BACKUP DATABASE [$databaseName]
FROM MIRROR
TO DISK = '$stagingBackup'
WITH FORMAT, INIT, COMPRESSION
"@
    
    $conn = New-Object System.Data.SqlClient.SqlConnection($SourceConnection)
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $backupQuery
    $cmd.CommandTimeout = 3600
    $cmd.ExecuteNonQuery()
    $conn.Close()
    
    # Step 5: Verify backup created
    if (-not (Test-Path $stagingBackup)) {
        throw "Backup FROM MIRROR failed: file not created"
    }
    
    # Step 6: Restore to VHDX-attached database (same as Method 1)
    $driveLetter = Get-DriveLetterFromVHD -VhdxPath $parentPath
    $mdfPath = "$driveLetter`:\DATA\$databaseName.mdf"
    $ldfPath = "$driveLetter`:\LOGS\$databaseName.ldf"
    
    $restoreQuery = @"
RESTORE DATABASE [$databaseName]
FROM DISK = '$stagingBackup'
WITH MOVE '*' TO '$mdfPath',
     MOVE '*' TO '$ldfPath',
     REPLACE, RECOVERY
"@
    
    $conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=true;")
    $conn.Open()
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = $restoreQuery
    $cmd.CommandTimeout = 3600
    $cmd.ExecuteNonQuery()
    $conn.Close()
    
    # Step 7-8: Metadata, detach, dismount (same as Method 1)
    $rowCountHash = $this.ComputeRowCountHash($databaseName)
    $this.DetachDatabase("localhost", $databaseName)
    Dismount-VhdxDisk -VhdxPath $parentPath
    
    # Step 9: Consolidate
    Copy-Item -Path $parentPath -Destination $TargetVhdxPath -Force
    
    # Cleanup staging backup
    Remove-Item -Path $stagingBackup -Force -ErrorAction SilentlyContinue
    
    Write-Host "Golden image created from replica backup: $TargetVhdxPath"
    
    return [PSCustomObject]@{
        VhdxPath = $TargetVhdxPath
        DatabaseName = $databaseName
        RowCountHash = $rowCountHash
        ReplicaLag = $replicaLag
        CreatedAt = (Get-Date).ToUniversalTime().ToString("o")
        Status = 'created'
    }
}
```

**Key Changes from Stub:**
- Replace line 180 comment with actual `GetReplicaLag()` call
- Replace line 188 with actual `BACKUP FROM MIRROR` T-SQL
- Replace line 193 with actual RESTORE
- Clean up staging backup file

**Lines to Replace:**
- 180: Actual replica lag check
- 188: Actual `BACKUP FROM MIRROR` execution
- 193: Actual RESTORE from staging backup
- 204: Delete staging backup file

---

#### Method 3: TableByTableCopy
**File:** `src/Providers/SqlServer/SqlServerProvider.ps1`  
**Current:** Lines 222-278 (stub with loop structure)  
**Real Implementation Needed:** Yes

**Implementation Steps:**

```powershell
# Pseudocode for CreateGoldenImageFromTableCopy
# Lines 222-278

function CreateGoldenImageFromTableCopy([string]$SourceConnection, [string]$TargetVhdxPath, [hashtable]$Options) {
    $databaseName = $Options['DatabaseName']
    $sourceDbName = $Options['SourceDatabaseName'] ?? $databaseName
    $batchSize = $Options['BatchSize'] ?? 10000  # Copy in batches
    
    # Step 1: Create and mount VHDX (same as previous methods)
    $parentPath = Join-Path (Split-Path $TargetVhdxPath) "tbt_copy_$(Get-Date -Format yyyyMMdd).vhdx"
    New-VHD -Path $parentPath -SizeBytes 50GB -Fixed
    Mount-VhdxDisk -VhdxPath $parentPath
    
    # Step 2: Create empty database on local instance
    $driveLetter = Get-DriveLetterFromVHD -VhdxPath $parentPath
    $mdfPath = "$driveLetter`:\DATA\$databaseName.mdf"
    $ldfPath = "$driveLetter`:\LOGS\$databaseName.ldf"
    
    $createDbQuery = @"
CREATE DATABASE [$databaseName]
ON PRIMARY (
    NAME = N'$databaseName',
    FILENAME = N'$mdfPath'
)
LOG ON (
    NAME = N'$databaseName`_Log',
    FILENAME = N'$ldfPath'
)
"@
    
    $localConn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=true;")
    $localConn.Open()
    $cmd = $localConn.CreateCommand()
    $cmd.CommandText = $createDbQuery
    $cmd.ExecuteNonQuery()
    $localConn.Close()
    
    # Step 3: Get table list from source
    $tables = $this.GetTableList($SourceConnection, $sourceDbName)  # Already real
    Write-Verbose "Found $($tables.Count) tables to copy"
    
    # Step 4: Copy each table
    $copiedTables = 0
    foreach ($table in $tables) {
        $tableName = "$($table.Schema).$($table.Name)"
        Write-Verbose "Copying table: $tableName"
        
        try {
            # Use INSERT INTO SELECT to copy data
            # This is more reliable than BCP for most scenarios
            $copyQuery = @"
INSERT INTO [$databaseName].[$($table.Schema)].[$($table.Name)]
SELECT *
FROM [$sourceDbName].[$($table.Schema)].[$($table.Name)]
"@
            
            $sourceConn = New-Object System.Data.SqlClient.SqlConnection($SourceConnection)
            $sourceConn.Open()
            $cmd = $sourceConn.CreateCommand()
            $cmd.CommandText = $copyQuery
            $cmd.CommandTimeout = 3600
            [int]$rowsCopied = $cmd.ExecuteNonQuery()
            $sourceConn.Close()
            
            $copiedTables++
            Write-Verbose "Copied $rowsCopied rows from $tableName"
            
            if ($copiedTables % 10 -eq 0) {
                Write-Host "Progress: $copiedTables / $($tables.Count) tables copied"
            }
        }
        catch {
            Write-Warning "Failed to copy table $tableName : $_"
            # Continue with next table instead of failing
        }
    }
    
    Write-Host "Completed: $copiedTables / $($tables.Count) tables copied"
    
    # Step 5: Verify data integrity (row count comparison)
    $sourceRowCounts = @{}
    $targetRowCounts = @{}
    
    foreach ($table in $tables) {
        $tableName = "$($table.Schema).$($table.Name)"
        
        # Get source row count
        $sourceConn = New-Object System.Data.SqlClient.SqlConnection($SourceConnection)
        $sourceConn.Open()
        $cmd = $sourceConn.CreateCommand()
        $cmd.CommandText = "SELECT COUNT(*) FROM [$sourceDbName].[$($table.Schema)].[$($table.Name)]"
        $sourceRowCounts[$tableName] = $cmd.ExecuteScalar()
        $sourceConn.Close()
        
        # Get target row count
        $localConn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=true;Initial Catalog=$databaseName;")
        $localConn.Open()
        $cmd = $localConn.CreateCommand()
        $cmd.CommandText = "SELECT COUNT(*) FROM [$($table.Schema)].[$($table.Name)]"
        $targetRowCounts[$tableName] = $cmd.ExecuteScalar()
        $localConn.Close()
        
        # Compare
        if ($sourceRowCounts[$tableName] -ne $targetRowCounts[$tableName]) {
            Write-Warning "Row count mismatch in $tableName : source=$($sourceRowCounts[$tableName]) target=$($targetRowCounts[$tableName])"
        }
    }
    
    # Step 6: Compute metadata
    $rowCountHash = $this.ComputeRowCountHash($databaseName)
    
    # Step 7: Detach and dismount
    $this.DetachDatabase("localhost", $databaseName)
    Dismount-VhdxDisk -VhdxPath $parentPath
    
    # Step 8: Consolidate
    Copy-Item -Path $parentPath -Destination $TargetVhdxPath -Force
    
    Write-Host "Golden image created via table-by-table copy: $TargetVhdxPath"
    
    return [PSCustomObject]@{
        VhdxPath = $TargetVhdxPath
        DatabaseName = $databaseName
        TablesCopied = $copiedTables
        RowCountHash = $rowCountHash
        CreatedAt = (Get-Date).ToUniversalTime().ToString("o")
        Status = 'created'
    }
}
```

**Key Changes from Stub:**
- Replace loop with actual INSERT INTO SELECT
- Actually verify row counts
- Handle table copy failures gracefully
- Return actual table copy count

**Lines to Replace:**
- 244: Actual VHDX creation
- 248: Actual database creation query
- 256: Actual table list retrieval
- 263-265: Actual INSERT INTO SELECT copy logic
- 288: Actual row count verification

---

### Layer 2: Database Operations (Already Mostly Real)

**Status:** Most are already implemented! Only 2 need updates.

#### Already Implemented (No Changes Needed)

1. **BackupDatabase()** (lines 284-320)
   - Status: ✓ Real implementation using T-SQL BACKUP DATABASE
   - No changes needed

2. **RestoreDatabase()** (lines 322-381)
   - Status: ✓ Real implementation using T-SQL RESTORE DATABASE
   - No changes needed

3. **AttachDatabase()** (lines 387-450)
   - Status: ✓ Real implementation using CREATE DATABASE FOR ATTACH
   - No changes needed

4. **DetachDatabase()** (lines 452-499)
   - Status: ✓ Real implementation using sp_detach_db
   - No changes needed

5. **ValidateConnection()** (lines 505-530)
   - Status: ✓ Real implementation, tests connection
   - No changes needed

6. **GetDatabaseInfo()** (lines 532-595)
   - Status: ✓ Real implementation, queries database stats
   - No changes needed

7. **CloseActiveConnections()** (lines 597-656)
   - Status: ✓ Real implementation, kills SPIDs
   - No changes needed

#### Already Implemented Helper Methods

1. **ComputeRowCountHash()** (lines 662-712)
   - Status: ✓ Real implementation using SHA256
   - Already used by golden image methods
   - No changes needed

2. **GetReplicaLag()** (lines 714-753)
   - Status: ✓ Real implementation using DMV query
   - Already used by ReplicaBackup method
   - No changes needed

3. **GetTableList()** (lines 755-802)
   - Status: ✓ Real implementation using information_schema
   - Already used by TableByTableCopy method
   - No changes needed

---

## Dependencies and Implementation Order

### Critical Path (Must Implement in This Order)

```
Method 1: BackupRestore
├── Uses: BackupDatabase() ✓ (already real)
├── Uses: RestoreDatabase() ✓ (already real)
├── Uses: AttachDatabase() ✓ (already real)
├── Uses: DetachDatabase() ✓ (already real)
├── Uses: ComputeRowCountHash() ✓ (already real)
├── Uses: VHDX Operations ✓ (all real)
└── Uses: MetadataManager ✓ (all real)

Method 2: ReplicaBackup
├── Depends on: Method 1 (same structure)
├── Uses: GetReplicaLag() ✓ (already real)
├── Additional: BACKUP FROM MIRROR T-SQL (new)
└── Rest same as Method 1

Method 3: TableByTableCopy
├── Depends on: Method 1 (same structure)
├── Uses: GetTableList() ✓ (already real)
├── Additional: CREATE DATABASE query (new)
├── Additional: INSERT INTO SELECT (new)
└── Rest same as Method 1
```

### Recommended Implementation Sequence

**Week 1 (Days 1-2):**
1. Implement Method 1: BackupRestore (lines 94-149)
   - Most straightforward (just call existing functions)
   - Foundation for other methods
   - Estimated: 2-3 hours

**Week 1 (Days 3-4):**
2. Implement Method 2: ReplicaBackup (lines 160-210)
   - Builds on Method 1
   - Adds BACKUP FROM MIRROR logic
   - Estimated: 2-3 hours

**Week 1 (Days 5) + Week 2 (Days 1-2):**
3. Implement Method 3: TableByTableCopy (lines 222-278)
   - Most complex (schema discovery + bulk copy)
   - Can work in parallel with testing Method 1 & 2
   - Estimated: 4-5 hours

**Week 2 (Days 3-5) + Week 3:**
4. Integration testing and refinement
5. Performance optimization
6. Error handling and edge cases

---

## Helper Functions Needed

Several helper functions are called but not yet implemented. Add these to `SqlServerProvider.ps1`:

### Helper 1: Get-DriveLetterFromVHD
**Purpose:** Map a mounted VHDX path to its drive letter

```powershell
hidden [string] GetDriveLetterFromVHD([string]$VhdxPath) {
    <#
    Implementation:
    1. Get mounted disks
    2. Match to VHDX path
    3. Find first volume on disk
    4. Return drive letter (e.g., "E:", "F:")
    #>
}
```

**Used by:** All 3 golden image methods (to find where VHDX mounted)

### Helper 2: Format-VhdxVolume
**Purpose:** Format newly mounted VHDX volume (optional, may use VHDX with pre-existing filesystem)

```powershell
hidden [void] FormatVhdxVolume([string]$DriveLetter) {
    <#
    Implementation:
    1. Format $DriveLetter as NTFS
    2. Create DATA and LOGS folders
    3. Set permissions
    #>
}
```

**Used by:** CreateGoldenImageFromTableCopy (needs formatted volume for CREATE DATABASE)

### Helper 3: Get-TableSchema
**Purpose:** Get full table schema (columns, indexes, constraints) for copying

```powershell
hidden [object] GetTableSchema([string]$ConnectionString, [string]$TableName) {
    <#
    Implementation:
    1. Query information_schema.columns
    2. Query information_schema.table_constraints
    3. Query information_schema.key_column_usage
    4. Return schema object
    #>
}
```

**Used by:** CreateGoldenImageFromTableCopy (optional, for more reliable copying)

---

## Testing Strategy for Phase 2

### Unit Tests (Lines of Code to Test)

1. **CreateGoldenImageFromBackup**
   - Mock: File system (VHDX creation)
   - Mock: SQL Server connection (RESTORE execution)
   - Verify: Steps called in correct order
   - Verify: Metadata returned correctly

2. **CreateGoldenImageFromReplica**
   - Mock: Replica lag check
   - Mock: BACKUP FROM MIRROR execution
   - Mock: RESTORE execution
   - Verify: Handles replica lag warnings

3. **CreateGoldenImageFromTableCopy**
   - Mock: Table list retrieval
   - Mock: Row count queries
   - Mock: INSERT INTO SELECT execution
   - Verify: All tables copied
   - Verify: Handles copy failures gracefully

### Integration Tests

1. **Full golden image creation** (with real SQL Server instance)
   - Create test backup
   - Create golden image via BackupRestore
   - Verify VHDX file created
   - Verify metadata correct
   - Clean up

2. **Replica backup** (requires replica setup)
   - Connect to replica
   - Create golden image via ReplicaBackup
   - Verify backup lag tracking

3. **Table-by-table copy** (with real databases)
   - Create source database with test data
   - Create golden image via TableByTableCopy
   - Verify all rows copied
   - Verify no data corruption

### Performance Tests

1. **Backup size impact**
   - Measure VHDX size after golden image creation
   - Should be similar to backup file size

2. **Restore performance**
   - Measure time to restore large database
   - Target: < 1 minute for 10GB database

3. **Table copy performance**
   - Measure time to copy table-by-table
   - Should be comparable to backup method for databases < 100GB

---

## File Modifications Summary

### Files to Modify (No New Files Needed)

| File | Lines | Changes | Impact |
|------|-------|---------|--------|
| `src/Providers/SqlServer/SqlServerProvider.ps1` | 94-149 | Replace stub with real BackupRestore implementation | HIGH |
| `src/Providers/SqlServer/SqlServerProvider.ps1` | 160-210 | Replace stub with real ReplicaBackup implementation | HIGH |
| `src/Providers/SqlServer/SqlServerProvider.ps1` | 222-278 | Replace stub with real TableByTableCopy implementation | HIGH |
| `src/Providers/SqlServer/SqlServerProvider.ps1` | Add ~200 lines | Add 3 helper functions (GetDriveLetterFromVHD, etc.) | MEDIUM |

### No New Files Required
- All supporting infrastructure exists
- VHDX operations fully implemented
- Metadata management fully implemented
- Database operations mostly implemented

---

## Success Criteria for Phase 2

Phase 2 is complete when:

- [ ] `CreateGoldenImageFromBackup()` creates VHDX with real backup restore
- [ ] `CreateGoldenImageFromReplica()` creates VHDX from replica mirror backup
- [ ] `CreateGoldenImageFromTableCopy()` creates VHDX via table-by-table copy
- [ ] All 3 methods produce identical metadata (row count hash, row counts, etc.)
- [ ] VHDX files are created in correct location with correct size
- [ ] Metadata is captured and stored correctly
- [ ] Integration tests pass (with real SQL Server instance)
- [ ] Performance targets met (< 5 seconds for 1GB database)
- [ ] Error handling for edge cases (missing backup, replica lag, table copy failures)
- [ ] Documentation updated with real implementation details

---

## Risks and Mitigations

### Risk 1: VHDX Mounting Issues
**Probability:** Medium  
**Impact:** High (blocks all 3 methods)  
**Mitigation:** 
- Test VHDX mount/dismount separately before implementing
- Add retry logic for mount operations
- Detailed logging of mount failures

### Risk 2: SQL Server Connection Timeouts
**Probability:** Medium  
**Impact:** High (blocks restore/copy operations)  
**Mitigation:**
- Increase command timeouts for large databases
- Implement connection pooling
- Add exponential backoff for retries

### Risk 3: Insufficient VHDX Space
**Probability:** Low  
**Impact:** High (corrupted VHDX)  
**Mitigation:**
- Validate VHDX size before restore/copy
- Calculate required space (data + logs + 10% overhead)
- Fail fast if insufficient space

### Risk 4: Replica Lag > Threshold
**Probability:** Medium  
**Impact:** Low (warning only, can proceed)  
**Mitigation:**
- Make maxReplicaLagSeconds configurable
- Log replica lag for troubleshooting
- Allow override with force flag

### Risk 5: Table Copy Data Loss
**Probability:** Low  
**Impact:** High (golden image useless)  
**Mitigation:**
- Verify row counts match source vs. target
- Log any mismatches
- Implement transaction rollback on failure
- Add option to verify checksums

---

## Dependencies on Other Phases

### Phase 1 Completion Required
- ✓ VHDX Operations (fully implemented)
- ✓ MetadataManager (fully implemented)
- ✓ Core configuration system (exists)

### Enables Phase 3
- Clone creation (depends on golden image creation)
- Checkpoint creation (depends on VHDX operations)
- Golden image management UI

### Optional for Phase 2
- Golden image provider in-memory caching (can stay as-is)
- API endpoints (not tested until Phase 4)
- GUI (not tested until Phase 5)

---

## Time Estimate

| Task | Days | Person | Notes |
|------|------|--------|-------|
| CreateGoldenImageFromBackup | 1 | Dev 1 | Most straightforward |
| CreateGoldenImageFromReplica | 1 | Dev 1 | Builds on Method 1 |
| CreateGoldenImageFromTableCopy | 2 | Dev 2 | Can parallelize |
| Helper functions | 0.5 | Dev 1 | GetDriveLetterFromVHD, etc. |
| Unit tests | 1.5 | Dev 1 | Mock SQL/VHDX operations |
| Integration tests | 2 | Dev 2 | Requires real SQL instance |
| Performance testing | 1 | Dev 2 | Benchmark large databases |
| Bug fixes & refinement | 1 | Dev 1 | Based on test results |
| **Total** | **10** | **2 devs** | **Weeks 4-5.5 (4-5 hours/day)** |

---

## Success Metrics

### Functional Metrics
- All 3 golden image creation methods functional
- VHDX files created with correct size
- Metadata captured accurately
- No data loss during copy

### Performance Metrics
- Golden image creation < 5 minutes for 10GB database
- VHDX mount/unmount < 2 seconds
- Table-by-table copy at least as fast as backup method
- Storage efficiency 70%+ reduction vs. backup

### Quality Metrics
- 85%+ code coverage
- Zero data corruption issues in testing
- All documented error cases handled
- No memory leaks during long operations

---

## Handoff to Phase 3

After Phase 2 completion, Phase 3 will use:

1. **Golden image creation** (fully implemented)
   - Called by GoldenImageProvider wrapper
   - Returns VHDX path and metadata

2. **VHDX operations** (already working)
   - Create differencing disks (clones)
   - Mount/unmount for clone attachment
   - Snapshot creation for checkpoints

3. **Metadata management** (already working)
   - Persist golden image metadata
   - Persist clone metadata
   - Persist checkpoint metadata

Phase 3 will implement clone lifecycle management and checkpoint operations using these foundations.

---

## Appendix A: SQL Server Specifics

### Connection String Format
```
Server=INSTANCE_NAME;Database=master;Integrated Security=true;Connection Timeout=30
```

### Key T-SQL Commands Used

**BACKUP DATABASE**
```sql
BACKUP DATABASE [DatabaseName]
TO DISK = 'path/to/backup.bak'
WITH INIT, COMPRESSION
```

**RESTORE DATABASE**
```sql
RESTORE DATABASE [DatabaseName]
FROM DISK = 'path/to/backup.bak'
WITH MOVE 'LogicalName' TO 'path/to/file.mdf',
     REPLACE, RECOVERY
```

**CREATE DATABASE FOR ATTACH**
```sql
CREATE DATABASE [DatabaseName]
FOR ATTACH
(FILENAME = 'path/to/file.mdf'),
(FILENAME = 'path/to/file.ldf')
```

**BACKUP FROM MIRROR** (requires mirroring setup)
```sql
BACKUP DATABASE [DatabaseName]
FROM MIRROR
TO DISK = 'path/to/backup.bak'
WITH FORMAT, COMPRESSION
```

### VHDX Mount Point Discovery

After mounting VHDX with `Mount-VHD`, discover the drive letter:
```powershell
$vhd = Get-VHD -Path $vhdxPath
$disk = Get-Disk | Where-Object { $_.BusType -eq 'Virtual' } | 
        Where-Object { $disk.Number -eq $vhd.DiskNumber }
$volume = Get-Volume | Where-Object { $_.DriveLetter -ne '' } |
          Where-Object { $_.DriveLetter -gt $disk.UniqueId }
# Now $volume.DriveLetter is the drive letter (e.g., 'E')
```

---

## Appendix B: Helper Function Templates

### Template: GetDriveLetterFromVHD

```powershell
hidden [string] GetDriveLetterFromVHD([string]$VhdxPath) {
    try {
        # Get VHDX info
        $vhdInfo = Get-VHD -Path $VhdxPath
        
        # Get disk number for this VHDX
        $disk = Get-Disk | Where-Object {
            $_.BusType -eq 'Virtual'
        } | ForEach-Object {
            try {
                $vhd = Get-VHD -DiskNumber $_.Number -ErrorAction SilentlyContinue
                if ($vhd.Path -eq $VhdxPath) { return $_ }
            } catch { }
        } | Select-Object -First 1
        
        if (-not $disk) {
            throw "Could not find disk for VHDX: $VhdxPath"
        }
        
        # Get volume on that disk
        $volume = Get-Volume | Where-Object {
            $_.DriveLetter -gt 0
        } | Where-Object {
            # Match volume to disk (more complex logic here)
            $true
        } | Select-Object -First 1
        
        if (-not $volume) {
            throw "Could not find volume for disk: $($disk.Number)"
        }
        
        return $volume.DriveLetter
    }
    catch {
        Write-Error "Failed to get drive letter from VHDX: $_"
        throw
    }
}
```

---

End of Phase 2 Implementation Roadmap
