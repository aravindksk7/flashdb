# FlashDB Cmdlet Reference

**Version:** 0.1.0  
**Schema Version:** 1.0  
**Last Updated:** 2026-06-06

---

## Quick Start Examples

### Import Module
```powershell
# Import FlashDB module
Import-Module C:\flashdb\src\FlashDB\FlashDB.psd1 -Force

# Verify installation
Get-FlashdbModuleInfo

# Test environment
Test-FlashdbEnvironment
```

### Clone Workflow
```powershell
# Create clone from golden image
$clone = New-FlashdbClone `
    -GoldenImageId "golden-prod-20260606" `
    -CloneName "dev-test-1" `
    -InstancePath "LOCALHOST\SQLEXPRESS" `
    -StoragePath "D:\CloneStorage"

# List clones
Get-FlashdbClone

# Attach clone to database instance
Connect-FlashdbClone -CloneId $clone.Id

# Detach clone
Disconnect-FlashdbClone -CloneId $clone.Id

# Remove clone
Remove-FlashdbClone -CloneId $clone.Id -DeleteVhdx -Force
```

### Checkpoint Workflow
```powershell
# Create checkpoint before operation
$cp1 = New-FlashdbCheckpoint `
    -CloneId "clone-dev-test-1" `
    -CheckpointName "Before Delete Test" `
    -Phase "pre-etl"

# Run operation (e.g., DELETE * FROM table)
# ...

# Create checkpoint after operation
$cp2 = New-FlashdbCheckpoint `
    -CloneId "clone-dev-test-1" `
    -CheckpointName "After Delete Test" `
    -Phase "post-etl"

# Compare checkpoints
Get-FlashdbCheckpointDiff `
    -CloneId "clone-dev-test-1" `
    -SourceCheckpointId "cp-001" `
    -TargetCheckpointId "cp-002"

# Restore to checkpoint
Restore-FlashdbCheckpoint `
    -CloneId "clone-dev-test-1" `
    -CheckpointId "cp-001" `
    -ReattachAfter

# Restore to golden image
Restore-FlashdbClone `
    -CloneId "clone-dev-test-1" `
    -ToGolden `
    -ReattachAfter
```

---

## Clone Management Cmdlets

### New-FlashdbClone

**Create a new clone from golden image**

```powershell
New-FlashdbClone `
    -GoldenImageId <string> `
    -CloneName <string> `
    -InstancePath <string> `
    -StoragePath <string> `
    [-CompressionEnabled <bool>] `
    [-DatabaseType <string>]
```

**Parameters:**
- `GoldenImageId` (required): ID of golden image to clone from
- `CloneName` (required): Friendly name for clone (e.g., "dev-test-1")
- `InstancePath` (required): SQL Server instance (e.g., "LOCALHOST\SQLEXPRESS")
- `StoragePath` (required): Directory for clone VHDX
- `CompressionEnabled`: VHDX compression flag (default: $true)
- `DatabaseType`: "sql-server" (default), "postgresql", "mysql"

**Returns:**
```
Id                : clone-dev-test-20260606-143200
Name              : dev-test-1
VhdxPath          : D:\CloneStorage\clone-dev-test-20260606-143200.vhdx
MetadataPath      : D:\CloneStorage\clone-dev-test-20260606-143200.json
InstancePath      : LOCALHOST\SQLEXPRESS
DatabaseName      : dev-test-1_Clone
Status            : created
CreatedAt         : 2026-06-06T14:32:00Z
CreatedBy         : DOMAIN\user
```

---

### Get-FlashdbClone

**List or retrieve clone information**

```powershell
Get-FlashdbClone `
    [-CloneId <string>] `
    [-StoragePath <string>] `
    [-Status <string>] `
    [-IncludeMetadata]
```

**Parameters:**
- `CloneId` (optional): Specific clone ID to retrieve
- `StoragePath` (optional): Storage directory to search
- `Status` (optional): Filter by status (active, detached, expired, error)
- `IncludeMetadata`: Include full metadata object

**Returns:**
```
Id                  : clone-dev-test-20260606-143200
Name                : dev-test-1
CreatedAt           : 2026-06-06T14:32:00Z
CreatedBy           : DOMAIN\user
VhdxPath            : D:\CloneStorage\clone-dev-test-20260606-143200.vhdx
InstancePath        : LOCALHOST\SQLEXPRESS
DatabaseName        : dev-test-1_Clone
Status              : active
AttachmentStatus    : detached
CheckpointCount     : 2
[Optional] Metadata : <full metadata object>
```

---

### Connect-FlashdbClone

**Attach clone VHDX and database to SQL instance**

```powershell
Connect-FlashdbClone `
    -CloneId <string> `
    [-InstancePath <string>] `
    [-Force]
```

**Parameters:**
- `CloneId` (required): Clone to attach
- `InstancePath` (optional): Override instance from metadata
- `Force`: Overwrite if already attached

**Returns:**
```
CloneId         : clone-dev-test-20260606-143200
Status          : attached
InstancePath    : LOCALHOST\SQLEXPRESS
DatabaseName    : dev-test-1_Clone
AttachedAt      : 2026-06-06T14:35:00Z
```

---

### Disconnect-FlashdbClone

**Detach clone VHDX and database from SQL instance**

```powershell
Disconnect-FlashdbClone `
    -CloneId <string> `
    [-Force]
```

**Parameters:**
- `CloneId` (required): Clone to detach
- `Force`: Force-close active connections

**Returns:**
```
CloneId      : clone-dev-test-20260606-143200
Status       : detached
DetachedAt   : 2026-06-06T14:45:00Z
```

---

### Remove-FlashdbClone

**Delete clone and optional VHDX file**

```powershell
Remove-FlashdbClone `
    -CloneId <string> `
    [-DeleteVhdx] `
    [-Force]
```

**Parameters:**
- `CloneId` (required): Clone to remove
- `DeleteVhdx`: Also delete VHDX file from disk
- `Force`: Skip confirmation prompt

**Returns:**
```
CloneId      : clone-dev-test-20260606-143200
Status       : removed
VhdxDeleted  : True
RemovedAt    : 2026-06-06T14:50:00Z
```

---

## Checkpoint Management Cmdlets

### New-FlashdbCheckpoint

**Create VHDX snapshot of current clone state**

```powershell
New-FlashdbCheckpoint `
    -CloneId <string> `
    -CheckpointName <string> `
    [-Phase <string>] `
    [-Description <string>] `
    [-Labels <string[]>] `
    [-Force]
```

**Parameters:**
- `CloneId` (required): Clone to checkpoint
- `CheckpointName` (required): Descriptive checkpoint name
- `Phase` (optional): "pre-etl", "post-etl", or "manual"
- `Description` (optional): Longer description
- `Labels` (optional): Array of tags for categorization
- `Force`: Skip confirmation if active connections

**Returns:**
```
CloneId     : clone-dev-test-20260606-143200
CheckpointId: cp-001
Name        : Before Delete Test
Phase       : pre-etl
CreatedAt   : 2026-06-06T15:00:00Z
CreatedBy   : DOMAIN\user
VhdxPath    : D:\CloneStorage\checkpoints\..._cp-001.vhdx
```

---

### Get-FlashdbCheckpoint

**List checkpoint metadata for clone**

```powershell
Get-FlashdbCheckpoint `
    -CloneId <string> `
    [-CheckpointId <string>] `
    [-IncludeMetadata] `
    [-Phase <string>]
```

**Parameters:**
- `CloneId` (required): Clone to query
- `CheckpointId` (optional): Specific checkpoint
- `IncludeMetadata`: Include row counts, schema hash, etc.
- `Phase` (optional): Filter by phase

**Returns:**
```
CloneId         : clone-dev-test-20260606-143200
CheckpointId    : cp-001
Name            : Before Delete Test
CreatedAt       : 2026-06-06T15:00:00Z
CreatedBy       : DOMAIN\user
Phase           : pre-etl
Description     : null
IsFavorite      : False
Labels          : {baseline, important}
IsActive        : False
[Optional] DatabaseMetadata : {totalRowCount: 15000000, ...}
[Optional] Connections      : {activeCount: 0, forceClosed: False}
[Optional] EtlMetadata      : {etlJobName: null, ...}
```

---

### Set-FlashdbCheckpoint

**Update checkpoint properties**

```powershell
Set-FlashdbCheckpoint `
    -CloneId <string> `
    -CheckpointId <string> `
    [-IsFavorite <bool>] `
    [-Labels <string[]>] `
    [-Description <string>]
```

**Parameters:**
- `CloneId` (required): Clone containing checkpoint
- `CheckpointId` (required): Checkpoint to update
- `IsFavorite` (optional): Mark/unmark as favorite
- `Labels` (optional): Replace labels array
- `Description` (optional): Update description

**Returns:**
```
CheckpointId : cp-001
IsFavorite   : True
Labels       : {baseline, important, gold}
Description  : Before major test run
UpdatedAt    : 2026-06-06T15:30:00Z
```

---

### Get-FlashdbCheckpointDiff

**Compare two checkpoints for data changes**

```powershell
Get-FlashdbCheckpointDiff `
    -CloneId <string> `
    -SourceCheckpointId <string> `
    -TargetCheckpointId <string>
```

**Parameters:**
- `CloneId` (required): Clone containing checkpoints
- `SourceCheckpointId` (required): Source checkpoint (baseline)
- `TargetCheckpointId` (required): Target checkpoint (comparison)

**Returns:**
```
CloneId              : clone-dev-test-20260606-143200
SourceCheckpointId   : cp-001
TargetCheckpointId   : cp-002
RowCountChange       : 250000
SizeChangeMB         : 25
SchemaChanged        : False
TablesModified       : @{source=45; target=45}
LastModified         : 2026-06-06T14:40:00Z
Summary              : @{
                         sourceRowCount=15000000;
                         targetRowCount=15250000;
                         sourceSizeMB=512;
                         targetSizeMB=537;
                         percentChange=4.88
                       }
```

---

### Restore-FlashdbCheckpoint

**Revert clone to specific checkpoint**

```powershell
Restore-FlashdbCheckpoint `
    -CloneId <string> `
    -CheckpointId <string> `
    [-ReattachAfter] `
    [-Force]
```

**Parameters:**
- `CloneId` (required): Clone to restore
- `CheckpointId` (required): Target checkpoint
- `ReattachAfter` (optional): Automatically reattach after
- `Force`: Force-close active connections

**Returns:**
```
CloneId        : clone-dev-test-20260606-143200
CheckpointId   : cp-001
Status         : restored
RestoredAt     : 2026-06-06T15:15:00Z
ReattachedAfter: True
```

---

### Restore-FlashdbClone

**Revert clone to golden image state**

```powershell
Restore-FlashdbClone `
    -CloneId <string> `
    -ToGolden `
    [-ReattachAfter] `
    [-Force]
```

**Parameters:**
- `CloneId` (required): Clone to restore
- `ToGolden` (required): Restore to golden image
- `ReattachAfter` (optional): Automatically reattach
- `Force`: Force-close active connections

**Returns:**
```
CloneId        : clone-dev-test-20260606-143200
Status         : restored-to-golden
RestoredAt     : 2026-06-06T15:20:00Z
ReattachedAfter: True
```

---

### Remove-FlashdbCheckpoint

**Delete checkpoint and free disk space**

```powershell
Remove-FlashdbCheckpoint `
    -CloneId <string> `
    -CheckpointId <string> `
    [-Force]
```

**Parameters:**
- `CloneId` (required): Clone containing checkpoint
- `CheckpointId` (required): Checkpoint to delete
- `Force`: Skip confirmation

**Returns:**
```
CheckpointId : cp-001
Status       : removed
RemovedAt    : 2026-06-06T15:25:00Z
```

---

## Metadata Management Cmdlets

### Get-FlashdbMetadata

**Read and validate clone metadata JSON**

```powershell
Get-FlashdbMetadata `
    -MetadataPath <string> `
    [-Validate <bool>]
```

**Returns:** Parsed JSON object or $null if invalid

---

### Save-FlashdbMetadata

**Write metadata with automatic backup**

```powershell
Save-FlashdbMetadata `
    -MetadataPath <string> `
    -Metadata <PSObject> `
    [-CreateBackup <bool>] `
    [-BackupPath <string>]
```

**Returns:** Save operation status

---

### Test-MetadataSchema

**Validate metadata against schema**

```powershell
Test-MetadataSchema `
    -Metadata <PSObject> `
    [-StrictMode <bool>]
```

**Returns:** Validation result with issues list

---

### Export-FlashdbMetadata

**Export metadata for reporting**

```powershell
Export-FlashdbMetadata `
    -MetadataPath <string> `
    [-Format <string>] `
    [-OutputPath <string>] `
    [-IncludeSensitive <bool>]
```

**Formats:** json, csv, html, xml

**Returns:** Export file path and status

---

### Add-FlashdbOperationLog

**Log operation to audit trail**

```powershell
Add-FlashdbOperationLog `
    -MetadataPath <string> `
    -Operation <string> `
    -Status <string> `
    [-Details <hashtable>]
```

**Status values:** success, failed, warning

**Returns:** Log entry

---

## State Management Cmdlets

### Get-FlashdbCloneState

**Get current clone lifecycle state**

```powershell
Get-FlashdbCloneState `
    -CloneId <string> `
    [-IncludeValidation <bool>]
```

**States:** Created, Attached, Detached, Expired, Error

**Returns:** State info with consistency checks

---

### Set-FlashdbCloneState

**Transition clone to new state**

```powershell
Set-FlashdbCloneState `
    -CloneId <string> `
    -NewState <string> `
    [-Force]
```

**Valid Transitions:**
- Created → Attached, Error, Expired
- Attached → Detached, Error, Expired
- Detached → Attached, Error, Expired
- Expired → Error
- Error (terminal)

**Returns:** Transition result

---

### Test-FlashdbCloneState

**Validate clone state consistency**

```powershell
Test-FlashdbCloneState `
    -CloneId <string> `
    [-AutoRepair]
```

**Returns:** Validation result with errors/warnings

---

### Find-FlashdbOrphanedClones

**Detect orphaned VHDX or metadata files**

```powershell
Find-FlashdbOrphanedClones `
    [-StoragePath <string>] `
    [-RemoveOrphans]
```

**Returns:** Array of orphan records

---

## VHDX Operations Cmdlets

### New-VhdxDifferencingDisk

**Create VHDX differencing disk**

```powershell
New-VhdxDifferencingDisk `
    -ParentVhdxPath <string> `
    -ChildVhdxPath <string> `
    [-Size <uint64>]
```

**Returns:** Creation metadata

---

### Mount-VhdxDisk

**Mount VHDX to system**

```powershell
Mount-VhdxDisk `
    -VhdxPath <string> `
    [-ReadOnly <bool>]
```

**Returns:** Mount info with disk number

---

### Dismount-VhdxDisk

**Dismount VHDX from system**

```powershell
Dismount-VhdxDisk `
    -VhdxPath <string> `
    [-Force <bool>]
```

**Returns:** Dismount status

---

### New-VhdxSnapshot

**Create VHDX snapshot**

```powershell
New-VhdxSnapshot `
    -VhdxPath <string> `
    -SnapshotPath <string> `
    [-Description <string>]
```

**Returns:** Snapshot creation metadata

---

### Restore-VhdxSnapshot

**Restore VHDX to snapshot**

```powershell
Restore-VhdxSnapshot `
    -VhdxPath <string> `
    -SnapshotPath <string>
```

**Returns:** Restore result with backup path

---

### Get-VhdxInfo

**Get VHDX properties**

```powershell
Get-VhdxInfo -VhdxPath <string>
```

**Returns:** Size, compression %, attachment status, etc.

---

### Test-VhdxIntegrity

**Check VHDX for corruption**

```powershell
Test-VhdxIntegrity `
    -VhdxPath <string> `
    [-Repair <bool>]
```

**Returns:** Integrity check results

---

## Configuration Cmdlets

### Get-FlashdbConfig

**Get module configuration**

```powershell
Get-FlashdbConfig
```

**Returns:** Configuration object

---

### Set-FlashdbConfig

**Update configuration property**

```powershell
Set-FlashdbConfig -Property <string> -Value <object>
```

**Returns:** Updated configuration

---

### Test-FlashdbEnvironment

**Test environment prerequisites**

```powershell
Test-FlashdbEnvironment
```

**Returns:** Environment test results

---

## Aliases (Shortcuts)

| Alias | Full Cmdlet |
|-------|-------------|
| nfgi  | New-FlashdbGoldenImage |
| gfgi  | Get-FlashdbGoldenImage |
| nfc   | New-FlashdbClone |
| gfc   | Get-FlashdbClone |
| cfc   | Connect-FlashdbClone |
| dfc   | Disconnect-FlashdbClone |
| nfcp  | New-FlashdbCheckpoint |
| gfcp  | Get-FlashdbCheckpoint |
| rfc   | Restore-FlashdbCheckpoint |

---

## Error Handling

All cmdlets use consistent error handling:

```powershell
try {
    # Cmdlet operation
} catch {
    Write-Error "Operation failed: $_"
    throw
}
```

Common errors:
- "Clone not found: ID" - Metadata file missing or invalid
- "Golden image not found: ID" - Parent VHDX missing
- "Invalid state transition: A → B" - State machine violation
- "VHDX is currently mounted" - Cannot restore while attached
- "No write permission in storage path" - Check directory permissions

---

## Performance Expectations

| Operation | Time |
|-----------|------|
| Clone creation | < 5 seconds |
| Checkpoint creation | < 1 second |
| Restore to checkpoint | < 2 seconds |
| Mount VHDX | < 1 second |
| Dismount VHDX | < 1 second |

---

*For detailed implementation, see IMPLEMENTATION_SUMMARY.md*
