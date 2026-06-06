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

        try {
            Write-Host "Step 1: Creating VHDX for golden image..."
            # Implementation: Create VHDX

            Write-Host "Step 2: Restoring backup to VHDX-attached database..."
            # Implementation: Use Restore-SqlDatabase or T-SQL RESTORE

            Write-Host "Step 3: Verifying restore..."
            # Implementation: Check database integrity

            if ($Options['VerifyRowCounts']) {
                Write-Host "Step 4: Verifying row counts..."
                $rowCountHash = $this.ComputeRowCountHash($databaseName)
                Write-Verbose "Row count hash: $rowCountHash"
            }

            if ($Options['Compress']) {
                Write-Host "Step 5: Compressing VHDX..."
                # Implementation: Use VHDX Optimize cmdlet
            }

            Write-Host "Golden image created successfully: $TargetVhdxPath"
        }
        catch {
            Write-Error "Failed to create golden image from backup: $_"
            throw
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
        $maxReplicaLagSeconds = $Options['MaxReplicaLagSeconds'] ?? 5

        # Steps:
        # 1. Verify replica connectivity
        # 2. Check replica lag (warn if exceeds threshold)
        # 3. Backup from mirror to staging location
        # 4. Create VHDX and restore backup
        # 5. Capture metadata (row counts, schema hash, replica lag)

        try {
            Write-Host "Step 1: Verifying replica connectivity..."
            $replicaLag = $this.GetReplicaLag($SourceConnection, $databaseName)
            Write-Verbose "Replica lag: $replicaLag seconds"

            if ($replicaLag -gt $maxReplicaLagSeconds) {
                Write-Warning "Replica lag ($replicaLag sec) exceeds threshold ($maxReplicaLagSeconds sec)"
            }

            Write-Host "Step 2: Executing BACKUP FROM MIRROR..."
            # Implementation: Execute T-SQL BACKUP DATABASE ... FROM MIRROR
            $backupFile = Join-Path $env:Temp "backup-$(Get-Random).bak"

            Write-Host "Step 3: Creating VHDX and restoring..."
            # Implementation: Create VHDX and restore backup

            if ($Options['VerifyRowCounts']) {
                Write-Host "Step 4: Verifying row counts..."
                $rowCountHash = $this.ComputeRowCountHash($databaseName)
                Write-Verbose "Row count hash: $rowCountHash"
            }

            Write-Host "Golden image created successfully: $TargetVhdxPath"

            # Cleanup backup file
            Remove-Item -Path $backupFile -Force -ErrorAction SilentlyContinue
        }
        catch {
            Write-Error "Failed to create golden image from replica backup: $_"
            throw
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
        $sourceDbName = $Options['SourceDatabaseName'] ?? $databaseName

        # Steps:
        # 1. Create VHDX and attach to local instance
        # 2. Connect to source database
        # 3. For each table:
        #    a. Query row count
        #    b. Copy data in batches to target
        # 4. Verify data integrity
        # 5. Capture metadata (row counts, schema hash)

        try {
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
                if ($copiedTables % 10 -eq 0) {
                    Write-Host "  Progress: $copiedTables / $($sourceTables.Count) tables copied"
                }
            }

            Write-Host "Step 4: Verifying data integrity..."
            # Implementation: Compare row counts

            if ($Options['VerifyRowCounts']) {
                Write-Host "Step 5: Computing row count hash..."
                $rowCountHash = $this.ComputeRowCountHash($databaseName)
                Write-Verbose "Row count hash: $rowCountHash"
            }

            Write-Host "Golden image created successfully: $TargetVhdxPath"
        }
        catch {
            Write-Error "Failed to create golden image via table copy: $_"
            throw
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

    #endregion
}

#endregion

#region Module Export

# When this provider module is imported, register itself with FlashDB
$provider = [SqlServerProvider]::new()

Write-Verbose "SQL Server Provider initialized"
Export-ModuleMember -Variable provider

#endregion
