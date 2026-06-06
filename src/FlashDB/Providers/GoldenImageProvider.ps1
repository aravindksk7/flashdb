# Golden Image Provider - SQL Server
# Manages golden image creation and management for database virtualization

# In-memory store for MVP (replace with file/DB persistence in Phase 2)
$script:GoldenImages = @{}
$script:Clones = @{}
$script:Checkpoints = @{}
$script:FlashdbStatePath = if ($env:FLASHDB_STATE_PATH) {
    $env:FLASHDB_STATE_PATH
} else {
    Join-Path ([System.IO.Path]::GetTempPath()) "flashdb-state.json"
}

function Add-OrSetProperty {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Target,

        [Parameter(Mandatory = $true)]
        [string]$Name,

        [object]$Value
    )

    if ($Target.PSObject.Properties.Name -contains $Name) {
        $Target.$Name = $Value
    } else {
        $Target | Add-Member -MemberType NoteProperty -Name $Name -Value $Value
    }
}

function Initialize-FlashdbProviderState {
    if (-not (Test-Path -Path $script:FlashdbStatePath -PathType Leaf)) {
        return
    }

    try {
        $state = Get-Content -Path $script:FlashdbStatePath -Raw | ConvertFrom-Json -ErrorAction Stop

        $script:GoldenImages = @{}
        foreach ($image in @($state.GoldenImages)) {
            if ($image -and $image.Id) {
                $script:GoldenImages[$image.Id] = $image
            }
        }

        $script:Clones = @{}
        foreach ($clone in @($state.Clones)) {
            if ($clone -and $clone.Id) {
                $script:Clones[$clone.Id] = $clone
            }
        }

        $script:Checkpoints = @{}
        foreach ($checkpoint in @($state.Checkpoints)) {
            if ($checkpoint -and $checkpoint.Id) {
                $script:Checkpoints[$checkpoint.Id] = $checkpoint
            }
        }
    } catch {
        Write-Warning "Failed to load FlashDB provider state: $_"
    }
}

function Save-FlashdbProviderState {
    $stateDir = Split-Path -Parent $script:FlashdbStatePath
    if ($stateDir -and -not (Test-Path -Path $stateDir -PathType Container)) {
        New-Item -Path $stateDir -ItemType Directory -Force | Out-Null
    }

    $state = [PSCustomObject]@{
        GoldenImages = @($script:GoldenImages.Values)
        Clones = @($script:Clones.Values)
        Checkpoints = @($script:Checkpoints.Values)
        SavedAt = (Get-Date).ToString("o")
    }

    $state | ConvertTo-Json -Depth 10 | Out-File -FilePath $script:FlashdbStatePath -Encoding UTF8 -Force
}

Initialize-FlashdbProviderState

function ConvertTo-FlashdbSqlIdentifier {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    return "[$($Name.Replace(']', ']]'))]"
}

function ConvertTo-FlashdbTableKey {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SchemaName,

        [Parameter(Mandatory = $true)]
        [string]$TableName
    )

    return "$SchemaName.$TableName".ToLowerInvariant()
}

function ConvertTo-FlashdbSelectedTableMap {
    param(
        [string[]]$SelectedTables
    )

    $map = @{}
    foreach ($selectedTable in @($SelectedTables)) {
        if ([string]::IsNullOrWhiteSpace($selectedTable)) {
            continue
        }

        $trimmed = $selectedTable.Trim()
        $parts = $trimmed.Split('.', 2)
        if ($parts.Count -eq 1) {
            $key = ConvertTo-FlashdbTableKey -SchemaName 'dbo' -TableName $parts[0].Trim()
        } else {
            $key = ConvertTo-FlashdbTableKey -SchemaName $parts[0].Trim() -TableName $parts[1].Trim()
        }

        $map[$key] = $trimmed
    }

    return $map
}

function New-FlashdbSqlConnectionBuilder {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConnectionString,

        [string]$DatabaseName
    )

    Add-Type -AssemblyName System.Data
    $builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new($ConnectionString)
    if ($DatabaseName) {
        $builder['Initial Catalog'] = $DatabaseName
    }

    $builder.TrustServerCertificate = $true
    return $builder
}

function New-FlashdbSqlConnection {
    param(
        [Parameter(Mandatory = $true)]
        [System.Data.SqlClient.SqlConnectionStringBuilder]$Builder
    )

    $connection = [System.Data.SqlClient.SqlConnection]::new($Builder.ConnectionString)
    $connection.Open()
    return $connection
}

function Invoke-FlashdbSqlNonQuery {
    param(
        [Parameter(Mandatory = $true)]
        [System.Data.SqlClient.SqlConnection]$Connection,

        [Parameter(Mandatory = $true)]
        [string]$Sql
    )

    $command = $Connection.CreateCommand()
    $command.CommandTimeout = 0
    $command.CommandText = $Sql
    [void]$command.ExecuteNonQuery()
}

function Invoke-FlashdbSqlScalar {
    param(
        [Parameter(Mandatory = $true)]
        [System.Data.SqlClient.SqlConnection]$Connection,

        [Parameter(Mandatory = $true)]
        [string]$Sql
    )

    $command = $Connection.CreateCommand()
    $command.CommandTimeout = 0
    $command.CommandText = $Sql
    return $command.ExecuteScalar()
}

function Invoke-FlashdbSqlQuery {
    param(
        [Parameter(Mandatory = $true)]
        [System.Data.SqlClient.SqlConnection]$Connection,

        [Parameter(Mandatory = $true)]
        [string]$Sql
    )

    $command = $Connection.CreateCommand()
    $command.CommandTimeout = 0
    $command.CommandText = $Sql
    $adapter = [System.Data.SqlClient.SqlDataAdapter]::new($command)
    $table = [System.Data.DataTable]::new()
    [void]$adapter.Fill($table)
    Write-Output -NoEnumerate $table
}

function Get-FlashdbDatabaseSchema {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourceConnection,

        [string]$DatabaseName,
        [string]$SourceDatabase
    )

    $sourceBuilder = New-FlashdbSqlConnectionBuilder -ConnectionString $SourceConnection
    $builderDatabase = [string]$sourceBuilder['Initial Catalog']
    $schemaDatabase = if ($SourceDatabase) { $SourceDatabase } elseif ($DatabaseName) { $DatabaseName } else { $builderDatabase }
    if (-not $schemaDatabase) {
        throw "Schema exploration requires a source database in sourceConnection, sourceDatabase, or databaseName"
    }

    $serverBuilder = New-FlashdbSqlConnectionBuilder -ConnectionString $SourceConnection -DatabaseName 'master'
    $connection = New-FlashdbSqlConnection -Builder $serverBuilder

    try {
        $databaseLiteral = $schemaDatabase.Replace("'", "''")
        $databaseId = ConvertTo-FlashdbSqlIdentifier -Name $schemaDatabase

        $sourceExists = [int](Invoke-FlashdbSqlScalar -Connection $connection -Sql "SELECT COUNT(*) FROM sys.databases WHERE name = N'$databaseLiteral';")
        if ($sourceExists -eq 0) {
            throw "Source database not found: $schemaDatabase"
        }

        $tables = Invoke-FlashdbSqlQuery -Connection $connection -Sql @"
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    ISNULL(SUM(CASE WHEN p.index_id IN (0, 1) THEN p.rows ELSE 0 END), 0) AS [RowCount]
FROM $databaseId.sys.tables t
JOIN $databaseId.sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN $databaseId.sys.partitions p ON t.object_id = p.object_id
WHERE t.is_ms_shipped = 0
GROUP BY s.name, t.name
ORDER BY s.name, t.name;
"@

        $columns = Invoke-FlashdbSqlQuery -Connection $connection -Sql @"
SELECT
    s.name AS SchemaName,
    t.name AS TableName,
    c.name AS ColumnName,
    ty.name AS DataType,
    c.max_length AS MaxLength,
    c.precision AS [PrecisionValue],
    c.scale AS [ScaleValue],
    c.is_nullable AS IsNullable,
    c.is_identity AS IsIdentity,
    c.is_computed AS IsComputed,
    c.column_id AS ColumnId
FROM $databaseId.sys.tables t
JOIN $databaseId.sys.schemas s ON t.schema_id = s.schema_id
JOIN $databaseId.sys.columns c ON t.object_id = c.object_id
JOIN $databaseId.sys.types ty ON c.user_type_id = ty.user_type_id
WHERE t.is_ms_shipped = 0
ORDER BY s.name, t.name, c.column_id;
"@

        $columnsByTable = @{}
        foreach ($column in $columns.Rows) {
            $schemaName = [string]$column.SchemaName
            $tableName = [string]$column.TableName
            $key = ConvertTo-FlashdbTableKey -SchemaName $schemaName -TableName $tableName
            if (-not $columnsByTable.ContainsKey($key)) {
                $columnsByTable[$key] = New-Object System.Collections.ArrayList
            }

            [void]$columnsByTable[$key].Add([PSCustomObject]@{
                Name = [string]$column.ColumnName
                DataType = [string]$column.DataType
                MaxLength = [int]$column.MaxLength
                Precision = [int]$column.PrecisionValue
                Scale = [int]$column.ScaleValue
                IsNullable = [bool]$column.IsNullable
                IsIdentity = [bool]$column.IsIdentity
                IsComputed = [bool]$column.IsComputed
                Ordinal = [int]$column.ColumnId
            })
        }

        $tableResults = foreach ($table in $tables.Rows) {
            $schemaName = [string]$table.SchemaName
            $tableName = [string]$table.TableName
            $key = ConvertTo-FlashdbTableKey -SchemaName $schemaName -TableName $tableName
            $tableColumns = if ($columnsByTable.ContainsKey($key)) { @($columnsByTable[$key]) } else { @() }

            [PSCustomObject]@{
                SchemaName = $schemaName
                TableName = $tableName
                FullName = "$schemaName.$tableName"
                RowCount = [int64]$table.RowCount
                ColumnCount = $tableColumns.Count
                Columns = $tableColumns
            }
        }

        return [PSCustomObject]@{
            DatabaseName = $schemaDatabase
            TableCount = @($tableResults).Count
            Tables = @($tableResults)
        }
    } finally {
        $connection.Dispose()
    }
}

function Copy-FlashdbSqlDatabaseTables {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConnectionString,

        [Parameter(Mandatory = $true)]
        [string]$SourceDatabase,

        [Parameter(Mandatory = $true)]
        [string]$TargetDatabase,

        [string[]]$SelectedTables
    )

    $serverBuilder = New-FlashdbSqlConnectionBuilder -ConnectionString $ConnectionString -DatabaseName 'master'
    $connection = New-FlashdbSqlConnection -Builder $serverBuilder
    $targetCreated = $false

    try {
        $sourceLiteral = $SourceDatabase.Replace("'", "''")
        $targetLiteral = $TargetDatabase.Replace("'", "''")
        $targetId = ConvertTo-FlashdbSqlIdentifier -Name $TargetDatabase
        $sourceId = ConvertTo-FlashdbSqlIdentifier -Name $SourceDatabase

        $sourceExists = [int](Invoke-FlashdbSqlScalar -Connection $connection -Sql "SELECT COUNT(*) FROM sys.databases WHERE name = N'$sourceLiteral';")
        if ($sourceExists -eq 0) {
            throw "Source database not found: $SourceDatabase"
        }

        $targetExists = [int](Invoke-FlashdbSqlScalar -Connection $connection -Sql "SELECT COUNT(*) FROM sys.databases WHERE name = N'$targetLiteral';")
        if ($targetExists -gt 0) {
            throw "Target database already exists: $TargetDatabase"
        }

        Invoke-FlashdbSqlNonQuery -Connection $connection -Sql "CREATE DATABASE $targetId;"
        $targetCreated = $true

        $tables = Invoke-FlashdbSqlQuery -Connection $connection -Sql @"
SELECT s.name AS SchemaName, t.name AS TableName
FROM $sourceId.sys.tables t
JOIN $sourceId.sys.schemas s ON t.schema_id = s.schema_id
WHERE t.is_ms_shipped = 0
ORDER BY s.name, t.name;
"@

        $selectedMap = ConvertTo-FlashdbSelectedTableMap -SelectedTables $SelectedTables
        $hasSelection = $selectedMap.Count -gt 0
        $matchedSelection = @{}
        $tableCount = 0
        [int64]$rowCount = 0
        $copiedTables = New-Object System.Collections.ArrayList

        foreach ($table in $tables.Rows) {
            $schemaName = [string]$table.SchemaName
            $tableName = [string]$table.TableName
            $tableKey = ConvertTo-FlashdbTableKey -SchemaName $schemaName -TableName $tableName

            if ($hasSelection -and -not $selectedMap.ContainsKey($tableKey)) {
                continue
            }

            if ($hasSelection) {
                $matchedSelection[$tableKey] = $true
            }

            $schemaId = ConvertTo-FlashdbSqlIdentifier -Name $schemaName
            $tableId = ConvertTo-FlashdbSqlIdentifier -Name $tableName
            $schemaLiteral = $schemaName.Replace("'", "''")

            if ($schemaName -ne 'dbo') {
                Invoke-FlashdbSqlNonQuery -Connection $connection -Sql @"
USE $targetId;
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'$schemaLiteral')
BEGIN
    EXEC('CREATE SCHEMA $schemaId');
END
"@
            }

            Invoke-FlashdbSqlNonQuery -Connection $connection -Sql "SELECT * INTO $targetId.$schemaId.$tableId FROM $sourceId.$schemaId.$tableId;"
            $tableRows = Invoke-FlashdbSqlScalar -Connection $connection -Sql "SELECT COUNT_BIG(*) FROM $targetId.$schemaId.$tableId;"
            $rowCount += [int64]$tableRows
            $tableCount++
            [void]$copiedTables.Add("$schemaName.$tableName")
        }

        if ($hasSelection) {
            $missingTables = @($selectedMap.Keys | Where-Object { -not $matchedSelection.ContainsKey($_) } | ForEach-Object { $selectedMap[$_] })
            if ($missingTables.Count -gt 0) {
                throw "Selected table(s) not found in $SourceDatabase`: $($missingTables -join ', ')"
            }
        }

        return [PSCustomObject]@{
            DatabaseName = $TargetDatabase
            SourceDatabase = $SourceDatabase
            TableCount = $tableCount
            RowCount = $rowCount
            Tables = @($copiedTables)
        }
    } catch {
        if ($targetCreated) {
            try {
                Invoke-FlashdbSqlNonQuery -Connection $connection -Sql @"
ALTER DATABASE $targetId SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
DROP DATABASE $targetId;
"@
            } catch {
                Write-Warning "Failed to clean up partial SQL copy $TargetDatabase`: $_"
            }
        }

        throw
    } finally {
        $connection.Dispose()
    }
}

function New-FlashdbGoldenImage {
    param(
        [string]$Name,
        [string]$Version,
        [ValidateSet('BackupRestore', 'ReplicaBackup', 'TableByTableCopy', 'BACKUP_RESTORE', 'REPLICA_BACKUP', 'TABLE_BY_TABLE')]
        [string]$Method = 'TableByTableCopy',
        [string]$OutputPath,
        [string]$BackupFile,
        [string]$SourceConnection,
        [string]$DatabaseType = 'sql-server',
        [string]$DatabaseName,
        [string]$SourceDatabase,
        [string]$Driver = 'System.Data.SqlClient',
        [string]$AuthenticationMode = 'SqlPassword',
        [string[]]$SelectedTables,
        [switch]$Force
    )

    $methodMap = @{
        BACKUP_RESTORE = 'BackupRestore'
        REPLICA_BACKUP = 'ReplicaBackup'
        TABLE_BY_TABLE = 'TableByTableCopy'
    }
    if ($methodMap.ContainsKey($Method)) {
        $Method = $methodMap[$Method]
    }

    if ($Method -eq 'BackupRestore' -and -not $BackupFile) {
        throw "BackupRestore requires a backup file path"
    }

    if ($Method -eq 'BackupRestore' -and $BackupFile -and -not (Test-Path -Path $BackupFile -PathType Leaf)) {
        throw "Backup file not found: $BackupFile"
    }

    if (($Method -eq 'ReplicaBackup' -or $Method -eq 'TableByTableCopy') -and -not $SourceConnection) {
        throw "$Method requires a source connection"
    }

    $sqlCopy = $null
    if ($DatabaseType -eq 'sql-server' -and $Method -eq 'TableByTableCopy') {
        $sourceBuilder = New-FlashdbSqlConnectionBuilder -ConnectionString $SourceConnection
        $builderDatabase = [string]$sourceBuilder['Initial Catalog']
        $copySourceDatabase = if ($SourceDatabase) { $SourceDatabase } elseif ($builderDatabase) { $builderDatabase } else { $DatabaseName }
        if (-not $copySourceDatabase) {
            throw "TableByTableCopy requires a source database in sourceConnection, sourceDatabase, or databaseName"
        }

        $targetDatabase = "FlashDB_Golden_$(Get-Date -Format yyyyMMddHHmmss)_$(Get-Random -Minimum 1000 -Maximum 9999)"
        $sqlCopy = Copy-FlashdbSqlDatabaseTables `
            -ConnectionString $SourceConnection `
            -SourceDatabase $copySourceDatabase `
            -TargetDatabase $targetDatabase `
            -SelectedTables $SelectedTables
    }

    $imageId = "golden-$(Get-Date -Format yyyyMMddHHmmss)-$(Get-Random -Minimum 1000 -Maximum 9999)"

    $image = [PSCustomObject]@{
        Id = $imageId
        Name = $Name
        Version = $Version
        Method = $Method
        OutputPath = $OutputPath
        BackupFile = $BackupFile
        SourceConnection = $SourceConnection
        DatabaseType = $DatabaseType
        DatabaseName = $DatabaseName
        SourceDatabase = $SourceDatabase
        Driver = $Driver
        AuthenticationMode = $AuthenticationMode
        SelectedTables = @($SelectedTables)
        GoldenDatabaseName = if ($sqlCopy) { $sqlCopy.DatabaseName } else { $null }
        Actualized = [bool]$sqlCopy
        TableCount = if ($sqlCopy) { $sqlCopy.TableCount } else { 0 }
        RowCount = if ($sqlCopy) { $sqlCopy.RowCount } else { 0 }
        CopiedTables = if ($sqlCopy) { @($sqlCopy.Tables) } else { @() }
        CreatedAt = (Get-Date).ToString("o")
        Status = 'Ready'
    }

    $script:GoldenImages[$imageId] = $image
    Save-FlashdbProviderState
    return $image
}

function Get-FlashdbGoldenImage {
    param(
        [string]$Id,
        [string]$Name
    )

    if ($Id) {
        return $script:GoldenImages[$Id]
    }

    if ($Name) {
        return $script:GoldenImages.Values | Where-Object { $_.Name -eq $Name }
    }

    # Return all golden images as array
    if ($script:GoldenImages.Count -eq 0) {
        return @()
    }
    return @($script:GoldenImages.Values)
}

function Update-FlashdbGoldenImage {
    param(
        [Parameter(Mandatory = $true)]
        [string]$GoldenImageId,

        [string]$Name,
        [string]$Version,
        [string]$Method,
        [string]$OutputPath,
        [string]$BackupFile,
        [string]$SourceConnection,
        [string]$DatabaseType,
        [string]$DatabaseName,
        [string]$SourceDatabase,
        [string]$Driver,
        [string]$AuthenticationMode,
        [string]$Status
    )

    if (-not $script:GoldenImages.ContainsKey($GoldenImageId)) {
        throw "Golden image not found: $GoldenImageId"
    }

    $image = $script:GoldenImages[$GoldenImageId]
    $updates = @{
        Name = $Name
        Version = $Version
        Method = $Method
        OutputPath = $OutputPath
        BackupFile = $BackupFile
        SourceConnection = $SourceConnection
        DatabaseType = $DatabaseType
        DatabaseName = $DatabaseName
        SourceDatabase = $SourceDatabase
        Driver = $Driver
        AuthenticationMode = $AuthenticationMode
        Status = $Status
    }

    foreach ($key in $updates.Keys) {
        if ($null -ne $updates[$key] -and $updates[$key] -ne '') {
            Add-OrSetProperty -Target $image -Name $key -Value $updates[$key]
        }
    }

    Add-OrSetProperty -Target $image -Name 'UpdatedAt' -Value (Get-Date).ToString("o")
    $script:GoldenImages[$GoldenImageId] = $image
    Save-FlashdbProviderState

    return $image
}

function Remove-FlashdbGoldenImage {
    param(
        [string]$GoldenImageId,
        [switch]$Force
    )

    if (-not $script:GoldenImages.ContainsKey($GoldenImageId)) {
        throw "Golden image not found: $GoldenImageId"
    }

    $script:GoldenImages.Remove($GoldenImageId)
    Save-FlashdbProviderState

    return [PSCustomObject]@{
        Success = $true
        Message = "Golden image $GoldenImageId deleted"
    }
}

function Get-FlashdbGoldenImageInfo {
    param(
        [string]$ImageId
    )

    $image = $script:GoldenImages[$ImageId]
    if (!$image) {
        return $null
    }

    return [PSCustomObject]@{
        Id = $ImageId
        Name = $image.Name
        Size = 0
        Tables = 0
        Rows = 0
    }
}

function New-FlashdbClone {
    param(
        [string]$GoldenImageId,
        [string]$CloneName,
        [string]$InstancePath,
        [string]$StoragePath,
        [string]$DatabaseType = 'sql-server',
        [string]$DatabaseName,
        [bool]$CompressionEnabled = $true
    )

    if ($GoldenImageId -and -not $script:GoldenImages.ContainsKey($GoldenImageId)) {
        throw "Golden image not found: $GoldenImageId"
    }

    $image = if ($GoldenImageId) { $script:GoldenImages[$GoldenImageId] } else { $null }
    $sqlCopy = $null
    if ($image -and $image.DatabaseType -eq 'sql-server' -and $image.GoldenDatabaseName) {
        $targetDatabase = if ($DatabaseName) { $DatabaseName } else { "${CloneName}_Clone" }
        $sqlCopy = Copy-FlashdbSqlDatabaseTables `
            -ConnectionString $image.SourceConnection `
            -SourceDatabase $image.GoldenDatabaseName `
            -TargetDatabase $targetDatabase
    }

    $cloneId = "clone-$(Get-Date -Format yyyyMMddHHmmss)-$(Get-Random -Minimum 1000 -Maximum 9999)"

    $clone = [PSCustomObject]@{
        Id = $cloneId
        Name = $CloneName
        GoldenImageId = $GoldenImageId
        InstancePath = $InstancePath
        StoragePath = $StoragePath
        DatabaseType = $DatabaseType
        DatabaseName = if ($sqlCopy) { $sqlCopy.DatabaseName } elseif ($DatabaseName) { $DatabaseName } else { "${CloneName}_Clone" }
        CompressionEnabled = $CompressionEnabled
        SourceGoldenDatabaseName = if ($sqlCopy) { $sqlCopy.SourceDatabase } else { $null }
        Actualized = [bool]$sqlCopy
        TableCount = if ($sqlCopy) { $sqlCopy.TableCount } else { 0 }
        RowCount = if ($sqlCopy) { $sqlCopy.RowCount } else { 0 }
        CreatedAt = (Get-Date).ToString("o")
        Status = 'Ready'
    }

    $script:Clones[$cloneId] = $clone
    Save-FlashdbProviderState
    return $clone
}

function Get-FlashdbClone {
    param(
        [string]$CloneId
    )

    if ($CloneId) {
        return $script:Clones[$CloneId]
    }

    if ($script:Clones.Count -eq 0) {
        return @()
    }
    return @($script:Clones.Values)
}

function Connect-FlashdbClone {
    param(
        [string]$CloneId,
        [string]$InstancePath
    )

    $clone = $script:Clones[$CloneId]
    if ($clone) {
        $clone.Status = 'Attached'
        Save-FlashdbProviderState
    }

    return [PSCustomObject]@{
        Success = $true
        Message = "Clone $CloneId connected"
    }
}

function Disconnect-FlashdbClone {
    param(
        [string]$CloneId
    )

    $clone = $script:Clones[$CloneId]
    if ($clone) {
        $clone.Status = 'Detached'
        Save-FlashdbProviderState
    }

    return [PSCustomObject]@{
        Success = $true
        Message = "Clone $CloneId disconnected"
    }
}

function Remove-FlashdbClone {
    param(
        [string]$CloneId,
        [switch]$DeleteVhdx
    )

    $script:Clones.Remove($CloneId)
    # Also remove associated checkpoints
    $checkpointsToRemove = $script:Checkpoints.Keys | Where-Object { $script:Checkpoints[$_].CloneId -eq $CloneId }
    foreach ($cpId in $checkpointsToRemove) {
        $script:Checkpoints.Remove($cpId)
    }
    Save-FlashdbProviderState

    return [PSCustomObject]@{
        Success = $true
        Message = "Clone $CloneId removed"
    }
}

function New-FlashdbCheckpoint {
    param(
        [string]$CloneId,
        [string]$CheckpointName,
        [string]$Phase = 'manual',
        [string]$Description,
        [switch]$Force
    )

    $cpId = "cp-$(Get-Date -Format yyyyMMddHHmmss)-$(Get-Random -Minimum 1000 -Maximum 9999)"

    if ($CloneId -and -not $script:Clones.ContainsKey($CloneId)) {
        throw "Clone not found: $CloneId"
    }

    $checkpoint = [PSCustomObject]@{
        Id = $cpId
        CloneId = $CloneId
        Name = $CheckpointName
        Phase = $Phase
        Description = $Description
        CreatedAt = (Get-Date).ToString("o")
        IsFavorite = $false
        Labels = @()
    }

    $script:Checkpoints[$cpId] = $checkpoint
    Save-FlashdbProviderState
    return $checkpoint
}

function Get-FlashdbCheckpoint {
    param(
        [string]$CloneId,
        [string]$CheckpointId
    )

    if ($CheckpointId) {
        return $script:Checkpoints[$CheckpointId]
    }

    if ($CloneId) {
        $cloneCheckpoints = @($script:Checkpoints.Values | Where-Object { $_.CloneId -eq $CloneId })
        if ($cloneCheckpoints.Count -eq 0) {
            return @()
        }
        return @($cloneCheckpoints)
    }

    if ($script:Checkpoints.Count -eq 0) {
        return @()
    }
    return @($script:Checkpoints.Values)
}

function Set-FlashdbCheckpoint {
    param(
        [string]$CloneId,
        [string]$CheckpointId,
        [bool]$IsFavorite,
        [string[]]$Labels
    )

    $checkpoint = $script:Checkpoints[$CheckpointId]
    if ($checkpoint) {
        if ($PSBoundParameters.ContainsKey('IsFavorite')) {
            $checkpoint.IsFavorite = $IsFavorite
        }
        if ($PSBoundParameters.ContainsKey('Labels')) {
            $checkpoint.Labels = @($Labels)
        }
        Add-OrSetProperty -Target $checkpoint -Name 'UpdatedAt' -Value (Get-Date).ToString("o")
        Save-FlashdbProviderState
    }

    return [PSCustomObject]@{
        Success = $true
        Message = "Checkpoint updated"
    }
}

function Restore-FlashdbCheckpoint {
    param(
        [string]$CloneId,
        [string]$CheckpointId,
        [bool]$ReattachAfter = $true
    )

    $checkpoint = $script:Checkpoints[$CheckpointId]
    if (-not $checkpoint) {
        throw "Checkpoint not found: $CheckpointId"
    }

    $clone = $script:Clones[$CloneId]
    if (-not $clone) {
        throw "Clone not found: $CloneId"
    }

    $restoredAt = (Get-Date).ToString("o")
    Add-OrSetProperty -Target $clone -Name 'LastRestoredCheckpointId' -Value $CheckpointId
    Add-OrSetProperty -Target $clone -Name 'LastRestoredAt' -Value $restoredAt
    Add-OrSetProperty -Target $checkpoint -Name 'LastRestoredAt' -Value $restoredAt
    Save-FlashdbProviderState

    return [PSCustomObject]@{
        Success = $true
        Message = "Checkpoint restored"
        CloneId = $CloneId
        CheckpointId = $CheckpointId
        RestoredAt = $restoredAt
        ReattachAfter = $ReattachAfter
    }
}

function Remove-FlashdbCheckpoint {
    param(
        [string]$CloneId,
        [string]$CheckpointId
    )

    $script:Checkpoints.Remove($CheckpointId)
    Save-FlashdbProviderState

    return [PSCustomObject]@{
        Success = $true
        Message = "Checkpoint removed"
    }
}

function Get-FlashdbCheckpointDiff {
    param(
        [string]$CloneId,
        [string]$SourceCheckpointId,
        [string]$TargetCheckpointId
    )

    return [PSCustomObject]@{
        SourceId = $SourceCheckpointId
        TargetId = $TargetCheckpointId
        Changes = @()
    }
}

Write-Verbose "Golden Image Provider loaded"
