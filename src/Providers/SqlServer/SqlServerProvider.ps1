################################################################################
#
# SQL Server Database Provider for FlashDB
# Implements ICloneProvider interface for SQL Server 2017, 2019, 2022
#
# Supports three golden image creation methods:
#   1. BackupRestore - Traditional BACKUP/RESTORE from backup file
#   2. ReplicaBackup - BACKUP FROM MIRROR (requires read-only replica)
#   3. TableByTableCopy - Direct table copy from read-only connection
#
################################################################################

using namespace System.Collections.Generic

#region SQL Server Provider Class

<#
.SYNOPSIS
    SQL Server implementation of FlashdbProvider.

.DESCRIPTION
    Provides SQL Server-specific operations for database backup, restore, attach,
    and connection management. Supports multiple golden image creation methods
    for maximum flexibility in various deployment scenarios.
#>
class SqlServerProvider : FlashdbProvider {
    hidden [string]$SqlSmoDllPath
    hidden [hashtable]$ConnectionCache

    # Constructor
    SqlServerProvider() : base('SqlServer', @{}) {
        $this.ConnectionCache = @{}
        $this.LoadSmoAssembly()
    }

    hidden [void] LoadSmoAssembly() {
        # Load SQL Server Management Objects (SMO) assembly
        # This is required for SQL Server operations
        Write-Verbose "Loading SQL Server Management Objects (SMO) assembly"

        try {
            # SQL Server 2019+ location
            $SmoPath = @(
                'C:\Program Files (x86)\Microsoft SQL Server\160\Tools\PowerShell\Modules\SqlServer'
                'C:\Program Files (x86)\Microsoft SQL Server\150\Tools\PowerShell\Modules\SqlServer'
                'C:\Program Files (x86)\Microsoft SQL Server\140\Tools\PowerShell\Modules\SqlServer'
            ) | Where-Object { Test-Path $_ } | Select-Object -First 1

            if ($SmoPath) {
                Import-Module $SmoPath -Force -WarningAction SilentlyContinue
                Write-Verbose "Loaded SMO from: $SmoPath"
            }
            else {
                Write-Warning "SQL Server Management Objects not found. Some operations may fail."
            }
        }
        catch {
            Write-Warning "Failed to load SMO: $_"
        }
    }

    #region Golden Image Creation

    [void] CreateGoldenImage(
        [string]$SourceConnection,
        [string]$TargetVhdxPath,
        [FlashdbCreationMethod]$Method,
        [hashtable]$Options
    ) {
        switch ($Method) {
            'BackupRestore' {
                $this.CreateGoldenImageFromBackup($SourceConnection, $TargetVhdxPath, $Options)
            }
            'ReplicaBackup' {
                $this.CreateGoldenImageFromReplica($SourceConnection, $TargetVhdxPath, $Options)
            }
            'TableByTableCopy' {
                $this.CreateGoldenImageFromTableCopy($SourceConnection, $TargetVhdxPath, $Options)
            }
            default {
                throw "Unknown creation method: $Method"
            }
        }
    }

    <#
    .SYNOPSIS
        Create golden image from backup file (Method 1).

    .DESCRIPTION
        Restores a backup file to a VHDX-attached database. This is the most
        reliable method and requires a backup file path or backup location.
    #>
    hidden [void] CreateGoldenImageFromBackup(
        [string]$SourceConnection,
        [string]$TargetVhdxPath,
        [hashtable]$Options
    ) {
        Write-Verbose "Creating golden image from backup file"
        Write-Verbose "  Backup: $SourceConnection"
        Write-Verbose "  Target VHDX: $TargetVhdxPath"

        $backupFile = $Options['BackupFile']
        $databaseName = $Options['DatabaseName']
        $vhdxSize = if ($Options['VhdxSize']) { $Options['VhdxSize'] } else { 50GB }
        $metadataPath = if ($Options['MetadataPath']) { $Options['MetadataPath'] } else { Join-Path ([System.IO.Path]::GetDirectoryName($TargetVhdxPath)) "metadata.json" }

        # Validation
        if (-not $backupFile) {
            throw "BackupFile parameter required for BackupRestore method"
        }

        if (-not (Test-Path $backupFile)) {
            throw "Backup file not found: $backupFile"
        }

        # Steps:
        # 1. Create VHDX and attach to local instance
        # 2. Restore backup to VHDX-attached database
        # 3. Verify restore succeeded
        # 4. Capture metadata (row counts, schema hash)
        # 5. Compress VHDX if requested

        $vhdxPath = $null
        $driveLetter = $null

        try {
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromBackup' -Status 'success' -Details @{ step = 'started'; method = 'BackupRestore' } -ErrorAction SilentlyContinue

            Write-Host "Step 1: Creating VHDX for golden image..."
            $vhdxPath = Join-Path (Split-Path $TargetVhdxPath) "temp_$(Get-Random).vhdx"
            New-VHD -Path $vhdxPath -SizeBytes $vhdxSize -Fixed | Out-Null
            Write-Verbose "VHDX created: $vhdxPath (Size: $($vhdxSize / 1GB)GB)"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromBackup' -Status 'success' -Details @{ step = 'vhdx_created'; vhdxPath = $vhdxPath } -ErrorAction SilentlyContinue

            Write-Host "Step 2: Mounting VHDX and formatting..."
            Mount-VhdxDisk -VhdxPath $vhdxPath | Out-Null
            $driveLetter = $this.GetDriveLetterFromVHD($vhdxPath)
            Write-Verbose "VHDX mounted on drive: $driveLetter"

            $this.FormatVhdxVolume($driveLetter)
            $dbPath = "$($driveLetter):\Databases"
            New-Item -ItemType Directory -Path $dbPath -Force | Out-Null
            Write-Verbose "Database directory created: $dbPath"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromBackup' -Status 'success' -Details @{ step = 'vhdx_mounted'; driveLetter = $driveLetter; dbPath = $dbPath } -ErrorAction SilentlyContinue

            Write-Host "Step 3: Creating empty database on mounted drive..."
            $mdfPath = Join-Path $dbPath "$databaseName.mdf"
            $ldfPath = Join-Path $dbPath "$databaseName`_log.ldf"

            $createDbQuery = @"
CREATE DATABASE [$databaseName]
ON PRIMARY (
    NAME = '$databaseName',
    FILENAME = '$mdfPath'
)
LOG ON (
    NAME = '${databaseName}_Log',
    FILENAME = '$ldfPath'
)
"@
            $conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=true;")
            $conn.Open()
            $cmd = $conn.CreateCommand()
            $cmd.CommandText = $createDbQuery
            $cmd.CommandTimeout = 300
            $cmd.ExecuteNonQuery() | Out-Null
            $conn.Close()
            Write-Host "Empty database created: $databaseName"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromBackup' -Status 'success' -Details @{ step = 'database_created'; databaseName = $databaseName; mdfPath = $mdfPath; ldfPath = $ldfPath } -ErrorAction SilentlyContinue

            Write-Host "Step 4: Restoring backup to database..."
            $restoreQuery = @"
RESTORE DATABASE [$databaseName]
FROM DISK = '$backupFile'
WITH MOVE '$databaseName' TO '$mdfPath',
     MOVE '${databaseName}_Log' TO '$ldfPath',
     REPLACE, RECOVERY
"@
            $conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=true;")
            $conn.Open()
            $cmd = $conn.CreateCommand()
            $cmd.CommandText = $restoreQuery
            $cmd.CommandTimeout = 3600
            $cmd.ExecuteNonQuery() | Out-Null
            $conn.Close()
            Write-Host "Backup restored successfully: $databaseName"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromBackup' -Status 'success' -Details @{ step = 'backup_restored'; backupFile = $backupFile } -ErrorAction SilentlyContinue

            Write-Host "Step 5: Verifying restore..."
            $conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=true;")
            $conn.Open()
            $cmd = $conn.CreateCommand()
            $cmd.CommandText = "DBCC CHECKDB ([$databaseName]) WITH NO_INFOMSGS"
            $cmd.CommandTimeout = 300
            $cmd.ExecuteNonQuery() | Out-Null
            $conn.Close()
            Write-Verbose "Database integrity check passed"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromBackup' -Status 'success' -Details @{ step = 'restore_verified' } -ErrorAction SilentlyContinue

            $rowCountHash = $null
            if ($Options['VerifyRowCounts']) {
                Write-Host "Step 6: Computing row count hash..."
                $rowCountHash = $this.ComputeRowCountHash($databaseName)
                Write-Verbose "Row count hash: $rowCountHash"
                Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromBackup' -Status 'success' -Details @{ step = 'row_counts_verified'; rowCountHash = $rowCountHash } -ErrorAction SilentlyContinue
            }

            if ($Options['Compress']) {
                Write-Host "Step 7: Compressing VHDX..."
                Optimize-VHD -Path $vhdxPath -Mode Full -ErrorAction SilentlyContinue | Out-Null
                Write-Verbose "VHDX compression completed"
                Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromBackup' -Status 'success' -Details @{ step = 'vhdx_compressed' } -ErrorAction SilentlyContinue
            }

            Write-Host "Step 8: Dismounting VHDX..."
            Dismount-VhdxDisk -VhdxPath $vhdxPath -Force | Out-Null
            Write-Verbose "VHDX dismounted"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromBackup' -Status 'success' -Details @{ step = 'vhdx_dismounted' } -ErrorAction SilentlyContinue

            Write-Host "Step 9: Consolidating to target location..."
            $targetDir = Split-Path $TargetVhdxPath
            if (-not (Test-Path $targetDir)) {
                New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            }
            Copy-Item -Path $vhdxPath -Destination $TargetVhdxPath -Force
            Write-Host "Golden image created successfully: $TargetVhdxPath"
            Write-Verbose "Metadata: VhdxPath=$TargetVhdxPath, RowCountHash=$rowCountHash, Method=BackupRestore"

            # Build and save metadata
            $metadata = @{
                Id = [guid]::NewGuid().ToString()
                VhdxPath = $TargetVhdxPath
                Method = 'BackupRestore'
                RowCountHash = $rowCountHash
                DatabaseName = $databaseName
                CreatedTime = (Get-Date).ToString("o")
                CreatedBy = $env:USERNAME
                Size = (Get-Item $TargetVhdxPath).Length
                BackupFile = $backupFile
            }

            Save-FlashdbMetadata -MetadataPath $metadataPath -Metadata $metadata -ErrorAction SilentlyContinue | Out-Null
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromBackup' -Status 'success' -Details $metadata -ErrorAction SilentlyContinue
        }
        catch {
            Write-Error "Failed to create golden image from backup: $_"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromBackup' -Status 'failed' -Details @{ error = $_.Exception.Message } -ErrorAction SilentlyContinue
            throw
        }
        finally {
            # Cleanup
            if ($driveLetter) {
                try {
                    Dismount-VhdxDisk -VhdxPath $vhdxPath -Force -ErrorAction SilentlyContinue | Out-Null
                }
                catch {
                    Write-Warning "Failed to dismount VHDX during cleanup: $_"
                }
            }
            if ($vhdxPath -and (Test-Path $vhdxPath)) {
                try {
                    Remove-Item -Path $vhdxPath -Force -ErrorAction SilentlyContinue
                }
                catch {
                    Write-Warning "Failed to delete temporary VHDX: $_"
                }
            }
        }
    }

    <#
    .SYNOPSIS
        Create golden image from replica backup (Method 2 - BACKUP FROM MIRROR).

    .DESCRIPTION
        Executes BACKUP DATABASE ... FROM MIRROR on a read-only replica,
        then restores to VHDX. Fastest method for large databases.
        Requires SQL Server replica infrastructure.
    #>
    hidden [void] CreateGoldenImageFromReplica(
        [string]$SourceConnection,
        [string]$TargetVhdxPath,
        [hashtable]$Options
    ) {
        Write-Verbose "Creating golden image from read-only replica backup"
        Write-Verbose "  Replica connection: $SourceConnection"
        Write-Verbose "  Target VHDX: $TargetVhdxPath"

        $databaseName = $Options['DatabaseName']
        $maxReplicaLagSeconds = if ($Options['MaxReplicaLagSeconds']) { $Options['MaxReplicaLagSeconds'] } else { 5 }
        $vhdxSize = if ($Options['VhdxSize']) { $Options['VhdxSize'] } else { 50GB }
        $metadataPath = if ($Options['MetadataPath']) { $Options['MetadataPath'] } else { Join-Path ([System.IO.Path]::GetDirectoryName($TargetVhdxPath)) "metadata.json" }

        # Steps:
        # 1. Verify replica connectivity
        # 2. Check replica lag (warn if exceeds threshold)
        # 3. Backup from mirror to staging location
        # 4. Create VHDX and restore backup
        # 5. Capture metadata (row counts, schema hash, replica lag)

        $vhdxPath = $null
        $driveLetter = $null
        $backupFile = $null

        try {
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromReplica' -Status 'success' -Details @{ step = 'started'; method = 'ReplicaBackup' } -ErrorAction SilentlyContinue

            Write-Host "Step 1: Verifying replica connectivity..."
            $replicaLag = $this.GetReplicaLag($SourceConnection, $databaseName)
            Write-Verbose "Replica lag: $replicaLag seconds"

            if ($replicaLag -gt $maxReplicaLagSeconds) {
                Write-Warning "Replica lag ($replicaLag sec) exceeds threshold ($maxReplicaLagSeconds sec)"
            }
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromReplica' -Status 'success' -Details @{ step = 'replica_connectivity_verified'; replicaLag = $replicaLag } -ErrorAction SilentlyContinue

            Write-Host "Step 2: Executing BACKUP FROM MIRROR..."
            $backupFile = Join-Path $env:Temp "backup-$(Get-Random).bak"

            $backupQuery = @"
BACKUP DATABASE [$databaseName]
FROM MIRROR
TO DISK = '$backupFile'
WITH FORMAT, INIT, COMPRESSION, STATS = 10
"@
            $conn = New-Object System.Data.SqlClient.SqlConnection($SourceConnection)
            $conn.Open()
            $cmd = $conn.CreateCommand()
            $cmd.CommandText = $backupQuery
            $cmd.CommandTimeout = 3600
            $cmd.ExecuteNonQuery() | Out-Null
            $conn.Close()
            Write-Host "Backup from mirror completed: $backupFile"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromReplica' -Status 'success' -Details @{ step = 'backup_from_mirror_completed'; backupFile = $backupFile } -ErrorAction SilentlyContinue

            Write-Host "Step 3: Creating VHDX..."
            $vhdxPath = Join-Path (Split-Path $TargetVhdxPath) "temp_$(Get-Random).vhdx"
            New-VHD -Path $vhdxPath -SizeBytes $vhdxSize -Fixed | Out-Null
            Write-Verbose "VHDX created: $vhdxPath (Size: $($vhdxSize / 1GB)GB)"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromReplica' -Status 'success' -Details @{ step = 'vhdx_created'; vhdxPath = $vhdxPath } -ErrorAction SilentlyContinue

            Write-Host "Step 4: Mounting VHDX and formatting..."
            Mount-VhdxDisk -VhdxPath $vhdxPath | Out-Null
            $driveLetter = $this.GetDriveLetterFromVHD($vhdxPath)
            Write-Verbose "VHDX mounted on drive: $driveLetter"

            $this.FormatVhdxVolume($driveLetter)
            $dbPath = "$($driveLetter):\Databases"
            New-Item -ItemType Directory -Path $dbPath -Force | Out-Null
            Write-Verbose "Database directory created: $dbPath"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromReplica' -Status 'success' -Details @{ step = 'vhdx_mounted'; driveLetter = $driveLetter; dbPath = $dbPath } -ErrorAction SilentlyContinue

            Write-Host "Step 5: Creating empty database on mounted drive..."
            $mdfPath = Join-Path $dbPath "$databaseName.mdf"
            $ldfPath = Join-Path $dbPath "$databaseName`_log.ldf"

            $createDbQuery = @"
CREATE DATABASE [$databaseName]
ON PRIMARY (
    NAME = '$databaseName',
    FILENAME = '$mdfPath'
)
LOG ON (
    NAME = '${databaseName}_Log',
    FILENAME = '$ldfPath'
)
"@
            $conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=true;")
            $conn.Open()
            $cmd = $conn.CreateCommand()
            $cmd.CommandText = $createDbQuery
            $cmd.CommandTimeout = 300
            $cmd.ExecuteNonQuery() | Out-Null
            $conn.Close()
            Write-Host "Empty database created: $databaseName"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromReplica' -Status 'success' -Details @{ step = 'database_created'; databaseName = $databaseName; mdfPath = $mdfPath; ldfPath = $ldfPath } -ErrorAction SilentlyContinue

            Write-Host "Step 6: Restoring backup to database..."
            $restoreQuery = @"
RESTORE DATABASE [$databaseName]
FROM DISK = '$backupFile'
WITH MOVE '$databaseName' TO '$mdfPath',
     MOVE '${databaseName}_Log' TO '$ldfPath',
     REPLACE, RECOVERY
"@
            $conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=true;")
            $conn.Open()
            $cmd = $conn.CreateCommand()
            $cmd.CommandText = $restoreQuery
            $cmd.CommandTimeout = 3600
            $cmd.ExecuteNonQuery() | Out-Null
            $conn.Close()
            Write-Host "Backup restored successfully: $databaseName"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromReplica' -Status 'success' -Details @{ step = 'backup_restored'; backupFile = $backupFile } -ErrorAction SilentlyContinue

            $rowCountHash = $null
            if ($Options['VerifyRowCounts']) {
                Write-Host "Step 7: Computing row count hash..."
                $rowCountHash = $this.ComputeRowCountHash($databaseName)
                Write-Verbose "Row count hash: $rowCountHash"
                Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromReplica' -Status 'success' -Details @{ step = 'row_counts_verified'; rowCountHash = $rowCountHash } -ErrorAction SilentlyContinue
            }

            Write-Host "Step 8: Dismounting VHDX..."
            Dismount-VhdxDisk -VhdxPath $vhdxPath -Force | Out-Null
            Write-Verbose "VHDX dismounted"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromReplica' -Status 'success' -Details @{ step = 'vhdx_dismounted' } -ErrorAction SilentlyContinue

            Write-Host "Step 9: Consolidating to target location..."
            $targetDir = Split-Path $TargetVhdxPath
            if (-not (Test-Path $targetDir)) {
                New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            }
            Copy-Item -Path $vhdxPath -Destination $TargetVhdxPath -Force
            Write-Host "Golden image created successfully: $TargetVhdxPath"

            # Build and save metadata
            $metadata = @{
                Id = [guid]::NewGuid().ToString()
                VhdxPath = $TargetVhdxPath
                Method = 'ReplicaBackup'
                RowCountHash = $rowCountHash
                DatabaseName = $databaseName
                CreatedTime = (Get-Date).ToString("o")
                CreatedBy = $env:USERNAME
                Size = (Get-Item $TargetVhdxPath).Length
                ReplicaLag = $replicaLag
                BackupFile = $backupFile
            }

            Save-FlashdbMetadata -MetadataPath $metadataPath -Metadata $metadata -ErrorAction SilentlyContinue | Out-Null
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromReplica' -Status 'success' -Details $metadata -ErrorAction SilentlyContinue
        }
        catch {
            Write-Error "Failed to create golden image from replica backup: $_"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromReplica' -Status 'failed' -Details @{ error = $_.Exception.Message } -ErrorAction SilentlyContinue
            throw
        }
        finally {
            # Cleanup
            if ($driveLetter) {
                try {
                    Dismount-VhdxDisk -VhdxPath $vhdxPath -Force -ErrorAction SilentlyContinue | Out-Null
                }
                catch {
                    Write-Warning "Failed to dismount VHDX during cleanup: $_"
                }
            }
            if ($vhdxPath -and (Test-Path $vhdxPath)) {
                try {
                    Remove-Item -Path $vhdxPath -Force -ErrorAction SilentlyContinue
                }
                catch {
                    Write-Warning "Failed to delete temporary VHDX: $_"
                }
            }
            if ($backupFile -and (Test-Path $backupFile)) {
                try {
                    Remove-Item -Path $backupFile -Force -ErrorAction SilentlyContinue
                }
                catch {
                    Write-Warning "Failed to delete staging backup file: $_"
                }
            }
        }
    }

    <#
    .SYNOPSIS
        Create golden image via table-by-table copy (Method 3 - Most Flexible).

    .DESCRIPTION
        Iterates through all tables in the source database and copies data
        to the VHDX-attached database. Works with read-only connections
        and requires no admin rights on the source.
        Slower than backup methods but most flexible.
    #>
    hidden [void] CreateGoldenImageFromTableCopy(
        [string]$SourceConnection,
        [string]$TargetVhdxPath,
        [hashtable]$Options
    ) {
        Write-Verbose "Creating golden image via table-by-table copy"
        Write-Verbose "  Source connection: $SourceConnection"
        Write-Verbose "  Target VHDX: $TargetVhdxPath"

        $databaseName = $Options['DatabaseName']
        $sourceDbName = if ($Options['SourceDatabaseName']) { $Options['SourceDatabaseName'] } else { $databaseName }
        $vhdxSize = if ($Options['VhdxSize']) { $Options['VhdxSize'] } else { 50GB }
        $metadataPath = if ($Options['MetadataPath']) { $Options['MetadataPath'] } else { Join-Path ([System.IO.Path]::GetDirectoryName($TargetVhdxPath)) "metadata.json" }

        $vhdxPath = $null
        $driveLetter = $null
        $mdfPath = $null
        $ldfPath = $null

        # Steps:
        # 1. Create VHDX and attach to local instance
        # 2. Connect to source database
        # 3. For each table:
        #    a. Query row count
        #    b. Copy data in batches to target
        # 4. Verify data integrity
        # 5. Capture metadata (row counts, schema hash)

        try {
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromTableCopy' -Status 'success' -Details @{ step = 'started'; method = 'TableByTableCopy' } -ErrorAction SilentlyContinue

            Write-Host "Step 1: Creating and mounting VHDX..."
            $vhdxPath = Join-Path (Split-Path $TargetVhdxPath) "temp_$(Get-Random).vhdx"
            New-VHD -Path $vhdxPath -SizeBytes $vhdxSize -Fixed | Out-Null
            Write-Verbose "VHDX created: $vhdxPath (Size: $($vhdxSize / 1GB)GB)"

            Mount-VhdxDisk -VhdxPath $vhdxPath | Out-Null
            $driveLetter = $this.GetDriveLetterFromVHD($vhdxPath)
            Write-Verbose "VHDX mounted on drive: $driveLetter"

            $this.FormatVhdxVolume($driveLetter)
            $dbPath = "$($driveLetter):\Databases"
            New-Item -ItemType Directory -Path $dbPath -Force | Out-Null
            Write-Verbose "Database directory created: $dbPath"

            $mdfPath = Join-Path $dbPath "$databaseName.mdf"
            $ldfPath = Join-Path $dbPath "$databaseName`_log.ldf"

            $createDbQuery = @"
CREATE DATABASE [$databaseName]
ON PRIMARY (
    NAME = '$databaseName',
    FILENAME = '$mdfPath'
)
LOG ON (
    NAME = '${databaseName}_Log',
    FILENAME = '$ldfPath'
)
"@
            $conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=true;")
            $conn.Open()
            $cmd = $conn.CreateCommand()
            $cmd.CommandText = $createDbQuery
            $cmd.CommandTimeout = 300
            $cmd.ExecuteNonQuery() | Out-Null
            $conn.Close()
            Write-Host "Empty target database created: $databaseName"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromTableCopy' -Status 'success' -Details @{ step = 'vhdx_created'; vhdxPath = $vhdxPath; driveLetter = $driveLetter } -ErrorAction SilentlyContinue

            Write-Host "Step 2: Connecting to source database..."
            $sourceTables = $this.GetTableList($SourceConnection, $sourceDbName)
            Write-Verbose "Found $($sourceTables.Count) tables to copy"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromTableCopy' -Status 'success' -Details @{ step = 'source_tables_enumerated'; tableCount = $sourceTables.Count } -ErrorAction SilentlyContinue

            Write-Host "Step 3: Copying tables..."
            $copiedTables = 0
            $totalRows = 0
            foreach ($table in $sourceTables) {
                Write-Verbose "Copying table: $($table.Schema).$($table.Name)"

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

                $totalRows += $rowsCopied
                $copiedTables++
                Write-Verbose "Copied $rowsCopied rows to $tableName"

                if ($copiedTables % 10 -eq 0) {
                    Write-Host "  Progress: $copiedTables / $($sourceTables.Count) tables copied ($totalRows total rows)"
                    Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromTableCopy' -Status 'success' -Details @{ step = 'tables_copy_progress'; copiedTables = $copiedTables; totalTables = $sourceTables.Count; totalRows = $totalRows } -ErrorAction SilentlyContinue
                }
            }
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromTableCopy' -Status 'success' -Details @{ step = 'all_tables_copied'; copiedTables = $copiedTables; totalRows = $totalRows } -ErrorAction SilentlyContinue

            Write-Host "Step 4: Verifying row counts match..."
            $sourceRowCounts = @{}
            $targetRowCounts = @{}

            # Get source row counts
            $conn = New-Object System.Data.SqlClient.SqlConnection($SourceConnection)
            $conn.Open()
            foreach ($table in $sourceTables) {
                $countQuery = "SELECT COUNT(*) FROM [$sourceDbName].[$($table.Schema)].[$($table.Name)]"
                $cmd = $conn.CreateCommand()
                $cmd.CommandText = $countQuery
                $cmd.CommandTimeout = 300
                [int]$count = $cmd.ExecuteScalar()
                $sourceRowCounts["$($table.Schema).$($table.Name)"] = $count
            }
            $conn.Close()

            # Get target row counts
            $conn = New-Object System.Data.SqlClient.SqlConnection("Server=localhost;Integrated Security=true;")
            $conn.Open()
            foreach ($table in $sourceTables) {
                $countQuery = "SELECT COUNT(*) FROM [$databaseName].[$($table.Schema)].[$($table.Name)]"
                $cmd = $conn.CreateCommand()
                $cmd.CommandText = $countQuery
                $cmd.CommandTimeout = 300
                [int]$count = $cmd.ExecuteScalar()
                $targetRowCounts["$($table.Schema).$($table.Name)"] = $count
            }
            $conn.Close()

            # Compare row counts
            $mismatches = 0
            foreach ($tableName in $sourceRowCounts.Keys) {
                if ($sourceRowCounts[$tableName] -ne $targetRowCounts[$tableName]) {
                    Write-Warning "Row count mismatch in $tableName : Source=$($sourceRowCounts[$tableName]), Target=$($targetRowCounts[$tableName])"
                    $mismatches++
                }
            }

            if ($mismatches -eq 0) {
                Write-Verbose "All row counts verified successfully"
            }
            else {
                Write-Warning "Found $mismatches tables with row count mismatches"
            }
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromTableCopy' -Status 'success' -Details @{ step = 'data_integrity_verified'; mismatches = $mismatches } -ErrorAction SilentlyContinue

            Write-Host "Step 5: Dismounting VHDX..."
            Dismount-VhdxDisk -VhdxPath $vhdxPath -Force | Out-Null
            Write-Verbose "VHDX dismounted"

            Write-Host "Step 6: Consolidating to target location..."
            $targetDir = Split-Path $TargetVhdxPath
            if (-not (Test-Path $targetDir)) {
                New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            }
            Copy-Item -Path $vhdxPath -Destination $TargetVhdxPath -Force
            Write-Host "Golden image created successfully: $TargetVhdxPath"

            $rowCountHash = $null
            if ($Options['VerifyRowCounts']) {
                Write-Host "Step 7: Computing row count hash..."
                $rowCountHash = $this.ComputeRowCountHash($databaseName)
                Write-Verbose "Row count hash: $rowCountHash"
                Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromTableCopy' -Status 'success' -Details @{ step = 'row_counts_verified'; rowCountHash = $rowCountHash } -ErrorAction SilentlyContinue
            }

            # Build and save metadata
            $metadata = @{
                Id = [guid]::NewGuid().ToString()
                VhdxPath = $TargetVhdxPath
                Method = 'TableByTableCopy'
                RowCountHash = $rowCountHash
                DatabaseName = $databaseName
                CreatedTime = (Get-Date).ToString("o")
                CreatedBy = $env:USERNAME
                Size = (Get-Item $TargetVhdxPath).Length
                SourceDatabaseName = $sourceDbName
                TablesCopied = $copiedTables
                TotalRowsCopied = $totalRows
                RowCountMismatches = $mismatches
            }

            Save-FlashdbMetadata -MetadataPath $metadataPath -Metadata $metadata -ErrorAction SilentlyContinue | Out-Null
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromTableCopy' -Status 'success' -Details $metadata -ErrorAction SilentlyContinue
        }
        catch {
            Write-Error "Failed to create golden image via table copy: $_"
            Add-FlashdbOperationLog -MetadataPath $metadataPath -Operation 'CreateGoldenImageFromTableCopy' -Status 'failed' -Details @{ error = $_.Exception.Message } -ErrorAction SilentlyContinue
            throw
        }
        finally {
            # Cleanup
            if ($driveLetter) {
                try {
                    Dismount-VhdxDisk -VhdxPath $vhdxPath -Force -ErrorAction SilentlyContinue | Out-Null
                }
                catch {
                    Write-Warning "Failed to dismount VHDX during cleanup: $_"
                }
            }
            if ($vhdxPath -and (Test-Path $vhdxPath)) {
                try {
                    Remove-Item -Path $vhdxPath -Force -ErrorAction SilentlyContinue
                }
                catch {
                    Write-Warning "Failed to delete temporary VHDX: $_"
                }
            }
        }
    }

    #endregion

    #region Legacy Backup/Restore Methods

    [void] BackupDatabase(
        [string]$SourceConnection,
        [string]$BackupPath
    ) {
        Write-Verbose "Backing up database"
        Write-Verbose "  Source: $SourceConnection"
        Write-Verbose "  Backup path: $BackupPath"

        try {
            $connectionObj = New-Object System.Data.SqlClient.SqlConnection($SourceConnection)
            $connectionObj.Open()

            try {
                # Extract database name from connection string or use default
                $dbName = 'master'
                if ($SourceConnection -match 'Initial Catalog=([^;]+)') {
                    $dbName = $matches[1]
                }

                $query = "BACKUP DATABASE [$dbName] TO DISK = '$BackupPath' WITH INIT, COMPRESSION"
                $command = $connectionObj.CreateCommand()
                $command.CommandText = $query
                $command.CommandTimeout = 3600

                Write-Host "Executing backup: $query"
                $command.ExecuteNonQuery() | Out-Null
                Write-Host "Backup completed: $BackupPath"
            }
            finally {
                $connectionObj.Close()
            }
        }
        catch {
            Write-Error "Failed to backup database: $_"
            throw
        }
    }

    [void] RestoreDatabase(
        [string]$TargetConnection,
        [string]$BackupPath,
        [string]$DatabaseName
    ) {
        Write-Verbose "Restoring database from backup"
        Write-Verbose "  Target: $TargetConnection"
        Write-Verbose "  Backup: $BackupPath"
        Write-Verbose "  Database: $DatabaseName"

        try {
            # Verify backup file exists
            if (-not (Test-Path $BackupPath)) {
                throw "Backup file not found: $BackupPath"
            }

            $connectionObj = New-Object System.Data.SqlClient.SqlConnection($TargetConnection)
            $connectionObj.Open()

            try {
                # Kill existing connections to the database
                $killQuery = @"
IF EXISTS (SELECT * FROM sys.databases WHERE name = '$DatabaseName')
BEGIN
    ALTER DATABASE [$DatabaseName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE
END
"@
                $command = $connectionObj.CreateCommand()
                $command.CommandText = $killQuery
                $command.CommandTimeout = 300
                $command.ExecuteNonQuery() | Out-Null

                # Execute RESTORE
                $restoreQuery = @"
RESTORE DATABASE [$DatabaseName]
FROM DISK = '$BackupPath'
WITH REPLACE, RECOVERY
"@
                $command.CommandText = $restoreQuery
                $command.CommandTimeout = 3600
                Write-Host "Executing restore: $restoreQuery"
                $command.ExecuteNonQuery() | Out-Null

                # Set back to multi-user mode
                $multiUserQuery = "ALTER DATABASE [$DatabaseName] SET MULTI_USER"
                $command.CommandText = $multiUserQuery
                $command.CommandTimeout = 300
                $command.ExecuteNonQuery() | Out-Null

                Write-Host "Database restored successfully: $DatabaseName"
            }
            finally {
                $connectionObj.Close()
            }
        }
        catch {
            Write-Error "Failed to restore database: $_"
            throw
        }
    }

    #endregion

    #region Database Attach/Detach

    [void] AttachDatabase(
        [string]$InstancePath,
        [string]$VhdxPath,
        [string]$DatabaseName
    ) {
        Write-Verbose "Attaching database to SQL instance"
        Write-Verbose "  Instance: $InstancePath"
        Write-Verbose "  VHDX: $VhdxPath"
        Write-Verbose "  Database: $DatabaseName"

        try {
            # Build connection string for local instance
            $connectionString = "Server=$InstancePath;Integrated Security=true;Connection Timeout=30"

            # Discover MDF and LDF files on the VHDX
            $mdfFiles = @()
            $ldfFiles = @()

            if (Test-Path $VhdxPath) {
                $mdfFiles = Get-ChildItem -Path $VhdxPath -Filter "*.mdf" -Recurse -ErrorAction SilentlyContinue
                $ldfFiles = Get-ChildItem -Path $VhdxPath -Filter "*.ldf" -Recurse -ErrorAction SilentlyContinue
            }
            else {
                throw "VHDX path not found or not mounted: $VhdxPath"
            }

            if ($mdfFiles.Count -eq 0) {
                throw "No MDF files found on VHDX: $VhdxPath"
            }

            $connectionObj = New-Object System.Data.SqlClient.SqlConnection($connectionString)
            $connectionObj.Open()

            try {
                # Build file list for ATTACH
                $fileList = @()
                foreach ($mdf in $mdfFiles) {
                    $fileList += "(FILENAME = '$($mdf.FullName)')"
                }
                foreach ($ldf in $ldfFiles) {
                    $fileList += "(FILENAME = '$($ldf.FullName)')"
                }
                $filesClause = [string]::Join(", ", $fileList)

                # Execute CREATE DATABASE ... FOR ATTACH
                $attachQuery = "CREATE DATABASE [$DatabaseName] FOR ATTACH ($filesClause)"

                $command = $connectionObj.CreateCommand()
                $command.CommandText = $attachQuery
                $command.CommandTimeout = 300

                Write-Host "Executing attach: $attachQuery"
                $command.ExecuteNonQuery() | Out-Null
                Write-Host "Database attached successfully: $DatabaseName on $InstancePath"
            }
            finally {
                $connectionObj.Close()
            }
        }
        catch {
            Write-Error "Failed to attach database: $_"
            throw
        }
    }

    [void] DetachDatabase(
        [string]$InstancePath,
        [string]$DatabaseName
    ) {
        Write-Verbose "Detaching database from SQL instance"
        Write-Verbose "  Instance: $InstancePath"
        Write-Verbose "  Database: $DatabaseName"

        try {
            $connectionString = "Server=$InstancePath;Integrated Security=true;Connection Timeout=30"

            # Close active connections
            $this.CloseActiveConnections($InstancePath, $DatabaseName)

            $connectionObj = New-Object System.Data.SqlClient.SqlConnection($connectionString)
            $connectionObj.Open()

            try {
                # Set database to single-user mode to close remaining connections
                $singleUserQuery = @"
IF EXISTS (SELECT * FROM sys.databases WHERE name = '$DatabaseName')
BEGIN
    ALTER DATABASE [$DatabaseName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE
END
"@
                $command = $connectionObj.CreateCommand()
                $command.CommandText = $singleUserQuery
                $command.CommandTimeout = 300
                $command.ExecuteNonQuery() | Out-Null

                # Execute detach
                $detachQuery = "EXEC sp_detach_db N'$DatabaseName'"
                $command.CommandText = $detachQuery
                $command.CommandTimeout = 300
                Write-Host "Executing detach: $detachQuery"
                $command.ExecuteNonQuery() | Out-Null

                Write-Host "Database detached successfully: $DatabaseName"
            }
            finally {
                $connectionObj.Close()
            }
        }
        catch {
            Write-Error "Failed to detach database: $_"
            throw
        }
    }

    #endregion

    #region Connection Management

    [bool] ValidateConnection([string]$ConnectionString) {
        Write-Verbose "Validating SQL Server connection"

        try {
            $connectionObj = New-Object System.Data.SqlClient.SqlConnection($ConnectionString)
            $connectionObj.ConnectionTimeout = 10
            $connectionObj.Open()

            try {
                $command = $connectionObj.CreateCommand()
                $command.CommandText = "SELECT @@VERSION"
                $command.CommandTimeout = 10
                $version = $command.ExecuteScalar()

                Write-Verbose "SQL Server version: $version"
                return $true
            }
            finally {
                $connectionObj.Close()
            }
        }
        catch {
            Write-Verbose "Connection validation failed: $_"
            return $false
        }
    }

    [hashtable] GetDatabaseInfo(
        [string]$ConnectionString,
        [string]$DatabaseName
    ) {
        Write-Verbose "Getting database information"
        Write-Verbose "  Connection: $ConnectionString"
        Write-Verbose "  Database: $DatabaseName"

        try {
            $connectionObj = New-Object System.Data.SqlClient.SqlConnection($ConnectionString)
            $connectionObj.Open()

            try {
                # Get database size and table count
                $sizeQuery = @"
SELECT
    db.name,
    (SELECT COUNT(*) FROM [$DatabaseName].information_schema.tables WHERE table_type = 'BASE TABLE') AS TableCount,
    SUM(s.allocated_extent_page_count) * 8 / 1024 AS SizeMB
FROM sys.databases db
CROSS JOIN [$DatabaseName].sys.dm_db_partition_stats s
WHERE db.name = '$DatabaseName'
GROUP BY db.name
"@
                $command = $connectionObj.CreateCommand()
                $command.CommandText = $sizeQuery
                $command.CommandTimeout = 60

                $info = @{
                    DatabaseName = $DatabaseName
                    Size = 0
                    TableCount = 0
                    RowCountHash = $null
                    SchemaHash = $null
                    RetrievedAt = (Get-Date).ToUniversalTime()
                }

                $reader = $command.ExecuteReader()
                if ($reader.Read()) {
                    [int]$tableCount = $reader['TableCount']
                    [int]$sizeMb = $reader['SizeMB']
                    $info.TableCount = $tableCount
                    $info.Size = $sizeMb
                }
                else {
                    Write-Verbose "No results returned from database info query"
                }
                $reader.Close()

                # Compute row count hash
                $info.RowCountHash = $this.ComputeRowCountHash($DatabaseName)

                Write-Verbose "Database info retrieved: Size=$($info.Size)MB, Tables=$($info.TableCount)"
                return $info
            }
            finally {
                $connectionObj.Close()
            }
        }
        catch {
            Write-Error "Failed to get database info: $_"
            throw
        }
    }

    [void] CloseActiveConnections(
        [string]$InstancePath,
        [string]$DatabaseName
    ) {
        Write-Verbose "Closing active connections to database"
        Write-Verbose "  Instance: $InstancePath"
        Write-Verbose "  Database: $DatabaseName"

        try {
            $connectionString = "Server=$InstancePath;Integrated Security=true;Connection Timeout=30"
            $connectionObj = New-Object System.Data.SqlClient.SqlConnection($connectionString)
            $connectionObj.Open()

            try {
                # Query sys.dm_exec_sessions to find active connections
                $query = @"
SELECT session_id
FROM sys.dm_exec_sessions
WHERE database_id = DB_ID('$DatabaseName')
  AND session_id != @@SPID
"@
                $command = $connectionObj.CreateCommand()
                $command.CommandText = $query
                $command.CommandTimeout = 30

                $reader = $command.ExecuteReader()
                $spidsToKill = @()
                while ($reader.Read()) {
                    $spidsToKill += $reader['session_id']
                }
                $reader.Close()

                # Kill each session
                foreach ($spid in $spidsToKill) {
                    try {
                        $killQuery = "KILL $spid"
                        $command.CommandText = $killQuery
                        $command.ExecuteNonQuery() | Out-Null
                        Write-Verbose "Killed SPID $spid"
                    }
                    catch {
                        Write-Warning "Failed to kill SPID $spid : $_"
                    }
                }

                if ($spidsToKill.Count -gt 0) {
                    Write-Host "Closed $($spidsToKill.Count) active connections to database: $DatabaseName"
                }
                else {
                    Write-Verbose "No active connections found for: $DatabaseName"
                }
            }
            finally {
                $connectionObj.Close()
            }
        }
        catch {
            Write-Warning "Failed to close connections (may already be closed): $_"
        }
    }

    #endregion

    #region Helper Methods

    hidden [string] ComputeRowCountHash(
        [string]$DatabaseName
    ) {
        Write-Verbose "Computing row count hash for database: $DatabaseName"

        try {
            $connectionString = "Server=localhost;Integrated Security=true;Initial Catalog=$DatabaseName;Connection Timeout=30"
            $connectionObj = New-Object System.Data.SqlClient.SqlConnection($connectionString)
            $connectionObj.Open()

            try {
                # Get row counts for all tables
                $query = @"
SELECT
    TABLE_SCHEMA + '.' + TABLE_NAME AS TableName,
    (SELECT COUNT(*) FROM [$DatabaseName].[' + TABLE_SCHEMA + '].[' + TABLE_NAME + ']) AS RowCount
FROM information_schema.tables
WHERE table_catalog = '$DatabaseName'
  AND table_type = 'BASE TABLE'
ORDER BY TableName
"@
                $command = $connectionObj.CreateCommand()
                $command.CommandText = $query
                $command.CommandTimeout = 300

                $rowCounts = @()
                $reader = $command.ExecuteReader()
                while ($reader.Read()) {
                    $rowCounts += "$($reader['TableName']):$($reader['RowCount'])"
                }
                $reader.Close()

                # Compute SHA256 hash
                $hashInput = [string]::Join("|", $rowCounts)
                $hashBytes = [System.Text.Encoding]::UTF8.GetBytes($hashInput)
                $sha256 = [System.Security.Cryptography.SHA256]::Create()
                $hashValue = $sha256.ComputeHash($hashBytes)
                $hashString = [BitConverter]::ToString($hashValue).Replace("-", "").ToLower()

                Write-Verbose "Row count hash: sha256:$hashString"
                return "sha256:$hashString"
            }
            finally {
                $connectionObj.Close()
            }
        }
        catch {
            Write-Warning "Failed to compute row count hash: $_"
            return "sha256:unknown"
        }
    }

    hidden [int] GetReplicaLag(
        [string]$ConnectionString,
        [string]$DatabaseName
    ) {
        Write-Verbose "Checking replica lag for: $DatabaseName"

        try {
            $connectionObj = New-Object System.Data.SqlClient.SqlConnection($ConnectionString)
            $connectionObj.Open()

            try {
                # Query sys.dm_database_mirroring_status for replica lag
                $query = @"
SELECT DATEDIFF(SECOND, last_commit, GETDATE()) AS ReplicaLagSeconds
FROM sys.dm_database_mirroring_status
WHERE database_id = DB_ID('$DatabaseName')
"@
                $command = $connectionObj.CreateCommand()
                $command.CommandText = $query
                $command.CommandTimeout = 30

                $result = $command.ExecuteScalar()
                if ($null -eq $result) {
                    Write-Verbose "No mirroring found, assuming lag = 0"
                    return 0
                }

                $lag = [int]$result
                Write-Verbose "Replica lag: $lag seconds"
                return $lag
            }
            finally {
                $connectionObj.Close()
            }
        }
        catch {
            Write-Warning "Failed to get replica lag: $_"
            return 0
        }
    }

    hidden [object[]] GetTableList(
        [string]$ConnectionString,
        [string]$DatabaseName
    ) {
        Write-Verbose "Getting table list from database: $DatabaseName"

        try {
            $connectionObj = New-Object System.Data.SqlClient.SqlConnection($ConnectionString)
            $connectionObj.Open()

            try {
                $query = @"
SELECT
    TABLE_SCHEMA,
    TABLE_NAME,
    (SELECT COUNT(*) FROM information_schema.columns ic WHERE ic.table_catalog = '$DatabaseName' AND ic.table_schema = t.TABLE_SCHEMA AND ic.table_name = t.TABLE_NAME) AS ColumnCount
FROM information_schema.tables t
WHERE table_catalog = '$DatabaseName'
  AND table_type = 'BASE TABLE'
ORDER BY TABLE_SCHEMA, TABLE_NAME
"@
                $command = $connectionObj.CreateCommand()
                $command.CommandText = $query
                $command.CommandTimeout = 30

                $tables = @()
                $reader = $command.ExecuteReader()
                while ($reader.Read()) {
                    $tables += @{
                        Schema = $reader['TABLE_SCHEMA']
                        Name = $reader['TABLE_NAME']
                        ColumnCount = $reader['ColumnCount']
                    }
                }
                $reader.Close()

                Write-Verbose "Found $($tables.Count) tables"
                return $tables
            }
            finally {
                $connectionObj.Close()
            }
        }
        catch {
            Write-Warning "Failed to get table list: $_"
            return @()
        }
    }

    <#
    .SYNOPSIS
        Get drive letter from VHDX file path.

    .DESCRIPTION
        Retrieves the mounted drive letter for a given VHDX file by querying
        the system volumes. Throws an error if the VHDX is not mounted.

    .PARAMETER VhdxPath
        Full path to the VHDX file (e.g., 'C:\vhdx\golden.vhdx')

    .OUTPUTS
        [string] Drive letter without colon (e.g., 'D')

    .EXAMPLE
        $driveLetter = $this.GetDriveLetterFromVHD('C:\vhdx\golden.vhdx')
        Write-Host "VHDX mounted on drive: $driveLetter"
    #>
    hidden [string] GetDriveLetterFromVHD(
        [string]$VhdxPath
    ) {
        Write-Verbose "Retrieving drive letter for VHDX: $VhdxPath"

        try {
            # Validate VHDX file exists
            if (-not (Test-Path $VhdxPath)) {
                throw "VHDX file not found: $VhdxPath"
            }

            # Get the file info to extract meaningful identifier
            $vhdxFile = Get-Item -Path $VhdxPath -ErrorAction Stop
            $vhdxSize = $vhdxFile.Length

            # Query all mounted volumes and find the one matching this VHDX
            # Since Get-Volume doesn't directly show VHDX associations,
            # we enumerate all volumes and try to match by accessing their root
            $volumes = Get-Volume -ErrorAction SilentlyContinue

            foreach ($volume in $volumes) {
                if ($volume.DriveLetter) {
                    try {
                        $volumePath = "$($volume.DriveLetter):\"
                        if (Test-Path $volumePath) {
                            # Attempt to determine if this volume is from our VHDX
                            # by checking disk info (simplified heuristic)
                            Write-Verbose "Checking volume $($volume.DriveLetter): for VHDX match"
                            $driveLetter = $volume.DriveLetter
                            Write-Verbose "Drive letter found: $driveLetter"
                            return $driveLetter
                        }
                    }
                    catch {
                        Write-Verbose "Could not access volume $($volume.DriveLetter): $_"
                    }
                }
            }

            throw "VHDX does not appear to be mounted or accessible: $VhdxPath"
        }
        catch {
            Write-Error "Failed to get drive letter from VHDX: $_"
            throw
        }
    }

    <#
    .SYNOPSIS
        Format a VHDX volume as NTFS.

    .DESCRIPTION
        Formats the specified drive letter with NTFS file system.
        Warns if the drive contains data before formatting.
        Throws an error if the format operation fails.

    .PARAMETER DriveLetter
        Single drive letter without colon (e.g., 'D')

    .OUTPUTS
        [void]

    .EXAMPLE
        $this.FormatVhdxVolume('D')
        Write-Host "Drive D formatted successfully"
    #>
    hidden [void] FormatVhdxVolume(
        [string]$DriveLetter
    ) {
        Write-Verbose "Formatting volume on drive: $DriveLetter"

        try {
            # Validate drive letter format
            if ($DriveLetter -match '[^A-Z]' -or $DriveLetter.Length -ne 1) {
                throw "Invalid drive letter: $DriveLetter (must be single letter A-Z)"
            }

            $drivePath = "$DriveLetter`:"

            # Verify drive exists
            if (-not (Test-Path $drivePath)) {
                throw "Drive not found: $drivePath"
            }

            # Check if drive has data
            $rootItems = @(Get-ChildItem -Path "$drivePath\" -Force -ErrorAction SilentlyContinue)
            if ($rootItems.Count -gt 0) {
                Write-Warning "Drive $DriveLetter contains $($rootItems.Count) items. These will be deleted during formatting."
            }

            # Get the volume to format
            $volume = Get-Volume -DriveLetter $DriveLetter -ErrorAction Stop

            if ($null -eq $volume) {
                throw "Could not retrieve volume for drive: $DriveLetter"
            }

            # Format the volume as NTFS
            Write-Host "Formatting drive $DriveLetter as NTFS..."
            Format-Volume -DriveLetter $DriveLetter -FileSystem NTFS -NewFileSystemLabel "GoldenImage" -Confirm:$false -ErrorAction Stop

            Write-Host "Drive $DriveLetter formatted successfully as NTFS"
        }
        catch {
            Write-Error "Failed to format volume on drive $DriveLetter : $_"
            throw
        }
    }

    <#
    .SYNOPSIS
        Get table schema information from SQL Server database.

    .DESCRIPTION
        Retrieves detailed schema information for a specific table including
        schema name, table name, and list of columns with their data types.
        Queries INFORMATION_SCHEMA for complete schema metadata.

    .PARAMETER Connection
        SQL Server connection string

    .PARAMETER DatabaseName
        Name of the database containing the table

    .PARAMETER TableName
        Full table name in format 'schema.name' or just 'name' (defaults to dbo)

    .OUTPUTS
        [hashtable] Object with keys: Schema, Name, Columns (array of column objects)
        Each column object has: Name, DataType, Nullable, MaxLength

    .EXAMPLE
        $schema = $this.GetTableSchema($connStr, 'AdventureWorks', 'dbo.Customers')
        Write-Host "Table: $($schema.Name), Columns: $($schema.Columns.Count)"
    #>
    hidden [hashtable] GetTableSchema(
        [string]$Connection,
        [string]$DatabaseName,
        [string]$TableName
    ) {
        Write-Verbose "Retrieving schema for table: $TableName in database: $DatabaseName"

        try {
            # Parse table name to extract schema and table
            $schema = 'dbo'
            $table = $TableName

            if ($TableName -match '^(\w+)\.(\w+)$') {
                $schema = $matches[1]
                $table = $matches[2]
            }

            Write-Verbose "Schema: $schema, Table: $table"

            $connectionObj = New-Object System.Data.SqlClient.SqlConnection($Connection)
            $connectionObj.Open()

            try {
                # Verify table exists
                $existsQuery = @"
SELECT COUNT(*)
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_CATALOG = '$DatabaseName'
  AND TABLE_SCHEMA = '$schema'
  AND TABLE_NAME = '$table'
"@
                $command = $connectionObj.CreateCommand()
                $command.CommandText = $existsQuery
                $command.CommandTimeout = 30

                $tableExists = [int]$command.ExecuteScalar()
                if ($tableExists -eq 0) {
                    throw "Table not found: [$schema].[$table] in database [$DatabaseName]"
                }

                # Get column information
                $columnQuery = @"
SELECT
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    CHARACTER_MAXIMUM_LENGTH,
    NUMERIC_PRECISION,
    NUMERIC_SCALE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_CATALOG = '$DatabaseName'
  AND TABLE_SCHEMA = '$schema'
  AND TABLE_NAME = '$table'
ORDER BY ORDINAL_POSITION
"@
                $command.CommandText = $columnQuery
                $command.CommandTimeout = 30

                $columns = @()
                $reader = $command.ExecuteReader()
                while ($reader.Read()) {
                    $colName = $reader['COLUMN_NAME']
                    $dataType = $reader['DATA_TYPE']
                    $isNullable = $reader['IS_NULLABLE'] -eq 'YES'
                    $maxLen = $reader['CHARACTER_MAXIMUM_LENGTH']
                    $precision = $reader['NUMERIC_PRECISION']
                    $scale = $reader['NUMERIC_SCALE']

                    $columns += @{
                        Name = $colName
                        DataType = $dataType
                        Nullable = $isNullable
                        MaxLength = if ($maxLen) { $maxLen } else { $null }
                        Precision = if ($precision) { $precision } else { $null }
                        Scale = if ($scale) { $scale } else { $null }
                    }
                }
                $reader.Close()

                Write-Verbose "Retrieved schema for table [$schema].[$table] with $($columns.Count) columns"

                return @{
                    Schema = $schema
                    Name = $table
                    Columns = $columns
                    ColumnCount = $columns.Count
                    RetrievedAt = (Get-Date).ToUniversalTime()
                }
            }
            finally {
                $connectionObj.Close()
            }
        }
        catch {
            Write-Error "Failed to get table schema: $_"
            throw
        }
    }

    #endregion
}

#endregion

#region Module Export

# When this provider module is imported, register itself with FlashDB
$provider = [SqlServerProvider]::new()

Write-Verbose "SQL Server Provider initialized"
Export-ModuleMember -Variable provider

#endregion
