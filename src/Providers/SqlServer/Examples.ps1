<#
.SYNOPSIS
SQL Server Provider - Usage Examples

.DESCRIPTION
Practical examples demonstrating all SQL Server Provider features.
These examples show real-world scenarios for creating golden images,
managing clones, and verifying consistency.

.AUTHOR
FlashDB Team

.DATE
2026-06-06
#>

#region 1. Basic Connection Validation

# Example: Test connection before operations
$provider = [SqlServerProvider]::new()
$connStr = 'Server=LOCALHOST\SQLEXPRESS;Integrated Security=true;Connection Timeout=30'

Write-Output "Testing SQL Server connection..."
if ($provider.ValidateConnection($connStr)) {
    Write-Output "Connection successful! SQL Server is reachable."
}
else {
    Write-Error "Connection failed! Check server name and credentials."
}

#endregion

#region 2. Golden Image Creation - Method 1: BACKUP/RESTORE

# Example: Create golden image from production backup file
$provider = [SqlServerProvider]::new()
$backupFile = 'C:\Backups\Production_20260606.bak'
$goldenImagePath = '\\shared\GoldenImages\prod-20260606.vhdx'

Write-Output "Creating golden image from backup file..."

$createOptions = @{
    DatabaseName = 'Production'
    BackupFile = $backupFile
    VerifyRowCounts = $true
    Compress = $true
}

try {
    $provider.CreateGoldenImage(
        -SourceConnection '',
        -TargetVhdxPath $goldenImagePath,
        -CreationMethod 'BackupRestore',
        -Options $createOptions
    )
    Write-Output "Golden image created successfully: $goldenImagePath"
}
catch {
    Write-Error "Failed to create golden image: $_"
}

#endregion

#region 3. Golden Image Creation - Method 2: ReplicaBackup

# Example: Create golden image from SQL Server read-only replica
$provider = [SqlServerProvider]::new()
$replicaConnection = 'Server=sql-replica-01;Integrated Security=true;Connection Timeout=30'
$goldenImagePath = '\\shared\GoldenImages\prod-20260606-replica.vhdx'

Write-Output "Creating golden image from read-only replica..."

# First, check replica lag
$replicaLag = $provider.GetReplicaLag($replicaConnection, 'Production')
Write-Output "Replica lag: ${replicaLag} seconds"

if ($replicaLag -le 10) {
    $createOptions = @{
        DatabaseName = 'Production'
        VerifyRowCounts = $true
        Compress = $true
        MaxReplicaLagSeconds = 5
    }

    try {
        $provider.CreateGoldenImage(
            -SourceConnection $replicaConnection,
            -TargetVhdxPath $goldenImagePath,
            -CreationMethod 'ReplicaBackup',
            -Options $createOptions
        )
        Write-Output "Golden image created from replica: $goldenImagePath"
    }
    catch {
        Write-Error "Failed to create golden image: $_"
    }
}
else {
    Write-Warning "Replica lag is too high (${replicaLag}s). Wait for synchronization and try again."
}

#endregion

#region 4. Golden Image Creation - Method 3: TableByTableCopy

# Example: Create golden image via table-by-table copy (most flexible)
$provider = [SqlServerProvider]::new()
$readOnlyConnection = 'Server=prod-ro;User Id=readonly;Password=SecurePassword123;Connection Timeout=30'
$goldenImagePath = '\\shared\GoldenImages\prod-20260606-copy.vhdx'

Write-Output "Creating golden image via table-by-table copy..."

# Validate read-only connection
if ($provider.ValidateConnection($readOnlyConnection)) {
    $createOptions = @{
        DatabaseName = 'Production'
        SourceDatabaseName = 'Production'
        VerifyRowCounts = $true
        Compress = $true
    }

    try {
        $provider.CreateGoldenImage(
            -SourceConnection $readOnlyConnection,
            -TargetVhdxPath $goldenImagePath,
            -CreationMethod 'TableByTableCopy',
            -Options $createOptions
        )
        Write-Output "Golden image created via table copy: $goldenImagePath"
    }
    catch {
        Write-Error "Failed to create golden image: $_"
    }
}
else {
    Write-Error "Cannot connect to read-only account. Check credentials."
}

#endregion

#region 5. Creating a Clone - Attach Database

# Example: Provision a new clone from golden image
$provider = [SqlServerProvider]::new()
$instancePath = 'LOCALHOST\SQLEXPRESS'
$cloneVhdxPath = 'D:\Clones\clone-dev-001.vhdx'
$cloneDatabaseName = 'Production_Clone_Dev1'

Write-Output "Attaching clone database to SQL instance..."

try {
    $provider.AttachDatabase(
        -InstancePath $instancePath,
        -VhdxPath $cloneVhdxPath,
        -DatabaseName $cloneDatabaseName
    )
    Write-Output "Clone database attached: $cloneDatabaseName on $instancePath"

    # Verify attachment
    $dbInfo = $provider.GetDatabaseInfo(
        "Server=$instancePath;Integrated Security=true",
        $cloneDatabaseName
    )
    Write-Output "Clone database info: $($dbInfo.TableCount) tables, $($dbInfo.Size) MB"
}
catch {
    Write-Error "Failed to attach clone: $_"
}

#endregion

#region 6. Detaching a Clone - Prepare for Snapshot

# Example: Detach database before creating VHDX checkpoint
$provider = [SqlServerProvider]::new()
$instancePath = 'LOCALHOST\SQLEXPRESS'
$cloneDatabaseName = 'Production_Clone_Dev1'

Write-Output "Detaching clone database..."

try {
    $provider.DetachDatabase(
        -InstancePath $instancePath,
        -DatabaseName $cloneDatabaseName
    )
    Write-Output "Clone database detached. VHDX is now ready for snapshot."
}
catch {
    Write-Error "Failed to detach clone: $_"
}

#endregion

#region 7. Getting Database Information

# Example: Retrieve database metadata
$provider = [SqlServerProvider]::new()
$connStr = 'Server=LOCALHOST\SQLEXPRESS;Integrated Security=true'
$dbName = 'Production'

Write-Output "Retrieving database information..."

try {
    $dbInfo = $provider.GetDatabaseInfo($connStr, $dbName)

    Write-Output @"
Database: $($dbInfo.DatabaseName)
Size: $($dbInfo.Size) MB
Tables: $($dbInfo.TableCount)
Row Count Hash: $($dbInfo.RowCountHash)
Retrieved At: $($dbInfo.RetrievedAt)
"@
}
catch {
    Write-Error "Failed to get database info: $_"
}

#endregion

#region 8. Table Enumeration

# Example: Get list of all tables in database
$provider = [SqlServerProvider]::new()
$connStr = 'Server=LOCALHOST\SQLEXPRESS;Integrated Security=true'
$dbName = 'Production'

Write-Output "Enumerating tables in database..."

$tables = $provider.GetTableList($connStr, $dbName)
Write-Output "Found $($tables.Count) tables:`n"

$tables | ForEach-Object {
    Write-Output "  $($_.Schema).$($_.Name) ($($_.ColumnCount) columns)"
}

#endregion

#region 9. Backup and Restore Workflow

# Example: Manual backup and restore to different instance
$provider = [SqlServerProvider]::new()
$sourceConnStr = 'Server=sql-prod;Integrated Security=true'
$targetConnStr = 'Server=LOCALHOST\SQLEXPRESS;Integrated Security=true'
$backupPath = 'C:\Backups\ManualBackup_20260606.bak'

Write-Output "Executing manual backup workflow..."

try {
    # Step 1: Backup from production
    Write-Output "Step 1: Backing up production database..."
    $provider.BackupDatabase($sourceConnStr, $backupPath)
    Write-Output "Backup completed: $backupPath"

    # Step 2: Restore to local instance
    Write-Output "Step 2: Restoring backup to local instance..."
    $provider.RestoreDatabase($targetConnStr, $backupPath, 'Production_Restored')
    Write-Output "Restore completed: Production_Restored"

    # Step 3: Verify
    $dbInfo = $provider.GetDatabaseInfo($targetConnStr, 'Production_Restored')
    Write-Output "Verification: $($dbInfo.TableCount) tables, $($dbInfo.Size) MB"
}
catch {
    Write-Error "Workflow failed: $_"
}

#endregion

#region 10. Complete Clone Lifecycle

# Example: Full workflow - Create clone, checkpoint, test, rollback
$provider = [SqlServerProvider]::new()
$instancePath = 'LOCALHOST\SQLEXPRESS'
$cloneVhdxPath = 'D:\Clones\clone-etl-test.vhdx'
$cloneDatabaseName = 'Production_ETL_Test'

Write-Output "=== Complete Clone Lifecycle ===" `n

try {
    # Phase 1: Attach clone
    Write-Output "Phase 1: Attaching clone database..."
    $provider.AttachDatabase($instancePath, $cloneVhdxPath, $cloneDatabaseName)
    Write-Output "Clone attached successfully`n"

    # Phase 2: Get baseline info
    Write-Output "Phase 2: Capturing baseline state..."
    $baselineInfo = $provider.GetDatabaseInfo(
        "Server=$instancePath;Integrated Security=true",
        $cloneDatabaseName
    )
    Write-Output "Baseline: $($baselineInfo.TableCount) tables, $($baselineInfo.RowCountHash)`n"

    # Phase 3: Run ETL (simulated)
    Write-Output "Phase 3: Running ETL transformations (simulated)..."
    Write-Output "  [Would run ETL job here]`n"

    # Phase 4: Verify state after ETL
    Write-Output "Phase 4: Verifying post-ETL state..."
    $postEtlInfo = $provider.GetDatabaseInfo(
        "Server=$instancePath;Integrated Security=true",
        $cloneDatabaseName
    )
    Write-Output "Post-ETL: $($postEtlInfo.TableCount) tables, $($postEtlInfo.RowCountHash)`n"

    # Phase 5: Compare states
    if ($baselineInfo.RowCountHash -ne $postEtlInfo.RowCountHash) {
        Write-Output "Phase 5: Data changed during ETL (as expected)"
    }
    else {
        Write-Output "Phase 5: Data unchanged during ETL"
    }

    # Phase 6: Detach for snapshot
    Write-Output "`nPhase 6: Detaching database for VHDX snapshot..."
    $provider.DetachDatabase($instancePath, $cloneDatabaseName)
    Write-Output "Clone detached. Ready for checkpoint/rollback.`n"

    Write-Output "=== Lifecycle Complete ==="
}
catch {
    Write-Error "Lifecycle failed: $_"
}

#endregion

#region 11. Error Handling Examples

# Example: Proper error handling patterns
$provider = [SqlServerProvider]::new()

# Pattern 1: Connection validation before operations
$connStr = 'Server=potentially-invalid;Connection Timeout=5'
if (-not $provider.ValidateConnection($connStr)) {
    Write-Warning "Connection failed. Using fallback instance."
    $connStr = 'Server=LOCALHOST\SQLEXPRESS;Integrated Security=true'
}

# Pattern 2: Try-catch for operations
try {
    $provider.BackupDatabase($connStr, 'C:\Backups\test.bak')
}
catch {
    Write-Error "Backup failed: $($_.Exception.Message)"
    # Implement recovery logic
}

# Pattern 3: Validation before attach
$vhdxPath = 'D:\Clones\test.vhdx'
if (-not (Test-Path $vhdxPath)) {
    Write-Error "VHDX not found: $vhdxPath"
}
else {
    $provider.AttachDatabase('LOCALHOST\SQLEXPRESS', $vhdxPath, 'TestDb')
}

#endregion

#region 12. Advanced: Custom Integration

# Example: Integration with other systems
$provider = [SqlServerProvider]::new()

# Scenario: Create golden image with audit trail
function New-AuditedGoldenImage {
    param(
        [string]$Method,
        [hashtable]$Options,
        [string]$AuditPath = 'C:\Audit\golden-images.log'
    )

    $provider = [SqlServerProvider]::new()
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $logEntry = "$timestamp | Creating golden image via $Method"

    try {
        Add-Content -Path $AuditPath -Value "START: $logEntry"

        switch ($Method) {
            'BackupRestore' {
                $provider.CreateGoldenImage('', $Options.TargetPath, 'BackupRestore', $Options)
            }
            'ReplicaBackup' {
                $provider.CreateGoldenImage($Options.SourceConnection, $Options.TargetPath, 'ReplicaBackup', $Options)
            }
            'TableByTableCopy' {
                $provider.CreateGoldenImage($Options.SourceConnection, $Options.TargetPath, 'TableByTableCopy', $Options)
            }
        }

        Add-Content -Path $AuditPath -Value "SUCCESS: $logEntry"
        Write-Output "Golden image created and logged."
    }
    catch {
        Add-Content -Path $AuditPath -Value "FAILED: $logEntry - Error: $_"
        throw
    }
}

#endregion
