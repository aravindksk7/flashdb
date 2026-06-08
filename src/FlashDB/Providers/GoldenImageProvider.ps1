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

function Get-FlashdbPropertyValue {
    param(
        [object]$Target,

        [Parameter(Mandatory = $true)]
        [string]$Name,

        [object]$Default = $null
    )

    if ($null -eq $Target) {
        return $Default
    }

    $property = $Target.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) {
        return $Default
    }

    return $property.Value
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

function Get-FlashdbSqlDatabaseSizeBytes {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConnectionString,

        [Parameter(Mandatory = $true)]
        [string]$DatabaseName
    )

    $connection = $null
    try {
        $serverBuilder = New-FlashdbSqlConnectionBuilder -ConnectionString $ConnectionString -DatabaseName 'master'
        $connection = New-FlashdbSqlConnection -Builder $serverBuilder
        $dbId = ConvertTo-FlashdbSqlIdentifier -Name $DatabaseName

        $sizeQuery = @"
SELECT ISNULL(SUM(CAST(size as bigint)) * 8192, 0) as TotalBytes
FROM $dbId.sys.database_files
WHERE state_desc = 'ONLINE';
"@

        return [int64](Invoke-FlashdbSqlScalar -Connection $connection -Sql $sizeQuery)
    } finally {
        if ($connection) {
            $connection.Dispose()
        }
    }
}

function Test-FlashdbSqlDatabaseExists {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConnectionString,

        [Parameter(Mandatory = $true)]
        [string]$DatabaseName
    )

    $connection = $null
    try {
        $serverBuilder = New-FlashdbSqlConnectionBuilder -ConnectionString $ConnectionString -DatabaseName 'master'
        $connection = New-FlashdbSqlConnection -Builder $serverBuilder
        $databaseLiteral = $DatabaseName.Replace("'", "''")
        return ([int](Invoke-FlashdbSqlScalar -Connection $connection -Sql "SELECT COUNT(*) FROM sys.databases WHERE name = N'$databaseLiteral';")) -gt 0
    } finally {
        if ($connection) {
            $connection.Dispose()
        }
    }
}

function Remove-FlashdbSqlDatabase {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConnectionString,

        [Parameter(Mandatory = $true)]
        [string]$DatabaseName
    )

    $connection = $null
    try {
        $serverBuilder = New-FlashdbSqlConnectionBuilder -ConnectionString $ConnectionString -DatabaseName 'master'
        $connection = New-FlashdbSqlConnection -Builder $serverBuilder
        $databaseLiteral = $DatabaseName.Replace("'", "''")
        $databaseId = ConvertTo-FlashdbSqlIdentifier -Name $DatabaseName
        $exists = [int](Invoke-FlashdbSqlScalar -Connection $connection -Sql "SELECT COUNT(*) FROM sys.databases WHERE name = N'$databaseLiteral';")

        if ($exists -gt 0) {
            Invoke-FlashdbSqlNonQuery -Connection $connection -Sql @"
ALTER DATABASE $databaseId SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
DROP DATABASE $databaseId;
"@
        }
    } finally {
        if ($connection) {
            $connection.Dispose()
        }
    }
}

function Rename-FlashdbSqlDatabase {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConnectionString,

        [Parameter(Mandatory = $true)]
        [string]$CurrentName,

        [Parameter(Mandatory = $true)]
        [string]$NewName
    )

    $connection = $null
    try {
        $serverBuilder = New-FlashdbSqlConnectionBuilder -ConnectionString $ConnectionString -DatabaseName 'master'
        $connection = New-FlashdbSqlConnection -Builder $serverBuilder
        $currentId = ConvertTo-FlashdbSqlIdentifier -Name $CurrentName
        $newId = ConvertTo-FlashdbSqlIdentifier -Name $NewName

        Invoke-FlashdbSqlNonQuery -Connection $connection -Sql "ALTER DATABASE $currentId MODIFY NAME = $newId;"
    } finally {
        if ($connection) {
            $connection.Dispose()
        }
    }
}

function Restore-FlashdbSqlDatabaseFromCheckpoint {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConnectionString,

        [Parameter(Mandatory = $true)]
        [string]$CheckpointDatabase,

        [Parameter(Mandatory = $true)]
        [string]$TargetDatabase
    )

    if (-not (Test-FlashdbSqlDatabaseExists -ConnectionString $ConnectionString -DatabaseName $CheckpointDatabase)) {
        throw "Checkpoint database not found: $CheckpointDatabase"
    }

    $safeTargetName = $TargetDatabase -replace '[^A-Za-z0-9_]', '_'
    $restoreDatabase = "FlashDB_Restore_${safeTargetName}_$(Get-Date -Format yyyyMMddHHmmss)_$(Get-Random -Minimum 1000 -Maximum 9999)"
    $restoreCreated = $false
    $renamed = $false

    try {
        $copyResult = Copy-FlashdbSqlDatabaseTables `
            -ConnectionString $ConnectionString `
            -SourceDatabase $CheckpointDatabase `
            -TargetDatabase $restoreDatabase

        $restoreCreated = $true

        Remove-FlashdbSqlDatabase -ConnectionString $ConnectionString -DatabaseName $TargetDatabase
        Rename-FlashdbSqlDatabase -ConnectionString $ConnectionString -CurrentName $restoreDatabase -NewName $TargetDatabase
        $renamed = $true

        return [PSCustomObject]@{
            DatabaseName = $TargetDatabase
            SourceDatabase = $CheckpointDatabase
            TableCount = $copyResult.TableCount
            RowCount = $copyResult.RowCount
            Tables = @($copyResult.Tables)
        }
    } catch {
        if ($restoreCreated -and -not $renamed) {
            try {
                Remove-FlashdbSqlDatabase -ConnectionString $ConnectionString -DatabaseName $restoreDatabase
            } catch {
                Write-Warning "Failed to clean up restore database $restoreDatabase`: $_"
            }
        }

        throw
    }
}

function Get-FlashdbCloneSourceConnection {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Clone
    )

    $cloneConnection = Get-FlashdbPropertyValue -Target $Clone -Name 'SourceConnection'
    if ($cloneConnection) {
        return $cloneConnection
    }

    $goldenImageId = Get-FlashdbPropertyValue -Target $Clone -Name 'GoldenImageId'
    if ($goldenImageId -and $script:GoldenImages.ContainsKey($goldenImageId)) {
        $image = $script:GoldenImages[$goldenImageId]
        return Get-FlashdbPropertyValue -Target $image -Name 'DestinationConnection' -Default (Get-FlashdbPropertyValue -Target $image -Name 'SourceConnection')
    }

    return $null
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
  AND t.name NOT LIKE 'flashdb[_]%'
  AND t.name NOT IN (
      'GoldenImages',
      'Clones',
      'Checkpoints',
      'CheckpointOperations',
      'OperationMetrics'
  )
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
  AND t.name NOT LIKE 'flashdb[_]%'
  AND t.name NOT IN (
      'GoldenImages',
      'Clones',
      'Checkpoints',
      'CheckpointOperations',
      'OperationMetrics'
  )
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

function ConvertTo-FlashdbSqlColumnDefinition {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Column
    )

    $columnId = ConvertTo-FlashdbSqlIdentifier -Name ([string]$Column.ColumnName)
    $typeName = [string]$Column.TypeName
    $maxLength = [int]$Column.MaxLength
    $precision = [int]$Column.Precision
    $scale = [int]$Column.Scale
    $isNullable = [bool]$Column.IsNullable
    $isIdentity = [bool]$Column.IsIdentity
    $collation = [string]$Column.CollationName

    $typeSql = switch ($typeName.ToLowerInvariant()) {
        { $_ -in @('varchar', 'char', 'varbinary', 'binary') } {
            $length = if ($maxLength -eq -1) { 'max' } else { [string]$maxLength }
            "$typeName($length)"
            break
        }
        { $_ -in @('nvarchar', 'nchar') } {
            $length = if ($maxLength -eq -1) { 'max' } else { [string]([math]::Max(1, $maxLength / 2)) }
            "$typeName($length)"
            break
        }
        { $_ -in @('decimal', 'numeric') } {
            "$typeName($precision,$scale)"
            break
        }
        { $_ -in @('datetime2', 'datetimeoffset', 'time') } {
            "$typeName($scale)"
            break
        }
        default {
            $typeName
        }
    }

    if ($collation -and $typeName.ToLowerInvariant() -in @('varchar', 'char', 'nvarchar', 'nchar', 'text', 'ntext')) {
        $typeSql = "$typeSql COLLATE $collation"
    }

    $identitySql = ''
    if ($isIdentity) {
        $seed = if ($null -ne $Column.IdentitySeed -and $Column.IdentitySeed -ne [DBNull]::Value) { [int64]$Column.IdentitySeed } else { 1 }
        $increment = if ($null -ne $Column.IdentityIncrement -and $Column.IdentityIncrement -ne [DBNull]::Value) { [int64]$Column.IdentityIncrement } else { 1 }
        $identitySql = " IDENTITY($seed,$increment)"
    }

    $nullSql = if ($isNullable -and -not $isIdentity) { 'NULL' } else { 'NOT NULL' }
    return "$columnId $typeSql$identitySql $nullSql"
}

function Copy-FlashdbSqlDatabaseTablesCrossConnection {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourceConnectionString,

        [Parameter(Mandatory = $true)]
        [string]$DestinationConnectionString,

        [Parameter(Mandatory = $true)]
        [string]$SourceDatabase,

        [Parameter(Mandatory = $true)]
        [string]$TargetDatabase,

        [string[]]$SelectedTables
    )

    $sourceBuilder = New-FlashdbSqlConnectionBuilder -ConnectionString $SourceConnectionString -DatabaseName $SourceDatabase
    $sourceConnection = New-FlashdbSqlConnection -Builder $sourceBuilder
    $destinationMasterBuilder = New-FlashdbSqlConnectionBuilder -ConnectionString $DestinationConnectionString -DatabaseName 'master'
    $destinationMasterConnection = New-FlashdbSqlConnection -Builder $destinationMasterBuilder
    $destinationConnection = $null
    $targetCreated = $false

    try {
        $targetLiteral = $TargetDatabase.Replace("'", "''")
        $targetId = ConvertTo-FlashdbSqlIdentifier -Name $TargetDatabase
        $targetExists = [int](Invoke-FlashdbSqlScalar -Connection $destinationMasterConnection -Sql "SELECT COUNT(*) FROM sys.databases WHERE name = N'$targetLiteral';")
        if ($targetExists -gt 0) {
            throw "Target database already exists: $TargetDatabase"
        }

        Invoke-FlashdbSqlNonQuery -Connection $destinationMasterConnection -Sql "CREATE DATABASE $targetId;"
        $targetCreated = $true

        $destinationBuilder = New-FlashdbSqlConnectionBuilder -ConnectionString $DestinationConnectionString -DatabaseName $TargetDatabase
        $destinationConnection = New-FlashdbSqlConnection -Builder $destinationBuilder

        $tables = Invoke-FlashdbSqlQuery -Connection $sourceConnection -Sql @"
SELECT s.name AS SchemaName, t.name AS TableName
FROM sys.tables t
JOIN sys.schemas s ON t.schema_id = s.schema_id
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
            $tableLiteral = $tableName.Replace("'", "''")

            if ($schemaName -ne 'dbo') {
                Invoke-FlashdbSqlNonQuery -Connection $destinationConnection -Sql @"
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'$schemaLiteral')
BEGIN
    EXEC('CREATE SCHEMA $schemaId');
END
"@
            }

            $columns = Invoke-FlashdbSqlQuery -Connection $sourceConnection -Sql @"
SELECT
    c.column_id AS ColumnId,
    c.name AS ColumnName,
    TYPE_NAME(c.user_type_id) AS TypeName,
    c.max_length AS MaxLength,
    c.precision AS Precision,
    c.scale AS Scale,
    c.is_nullable AS IsNullable,
    c.is_identity AS IsIdentity,
    ic.seed_value AS IdentitySeed,
    ic.increment_value AS IdentityIncrement,
    c.collation_name AS CollationName
FROM sys.columns c
JOIN sys.tables t ON c.object_id = t.object_id
JOIN sys.schemas s ON t.schema_id = s.schema_id
LEFT JOIN sys.identity_columns ic ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE s.name = N'$schemaLiteral'
  AND t.name = N'$tableLiteral'
  AND c.is_computed = 0
ORDER BY c.column_id;
"@

            if ($columns.Rows.Count -eq 0) {
                continue
            }

            $columnDefinitions = @($columns.Rows | ForEach-Object { ConvertTo-FlashdbSqlColumnDefinition -Column $_ })
            Invoke-FlashdbSqlNonQuery -Connection $destinationConnection -Sql "CREATE TABLE $schemaId.$tableId ($($columnDefinitions -join ', '));"

            $columnNames = @($columns.Rows | ForEach-Object { [string]$_.ColumnName })
            $columnList = ($columnNames | ForEach-Object { ConvertTo-FlashdbSqlIdentifier -Name $_ }) -join ', '
            $reader = $null
            $bulkCopy = $null
            try {
                $command = $sourceConnection.CreateCommand()
                $command.CommandTimeout = 0
                $command.CommandText = "SELECT $columnList FROM $schemaId.$tableId;"
                $reader = $command.ExecuteReader()
                $bulkCopy = [System.Data.SqlClient.SqlBulkCopy]::new(
                    $destinationConnection,
                    [System.Data.SqlClient.SqlBulkCopyOptions]::KeepIdentity,
                    $null
                )
                $bulkCopy.DestinationTableName = "$schemaId.$tableId"
                $bulkCopy.BulkCopyTimeout = 0
                foreach ($columnName in $columnNames) {
                    [void]$bulkCopy.ColumnMappings.Add($columnName, $columnName)
                }
                $bulkCopy.WriteToServer($reader)
            } finally {
                if ($reader) {
                    $reader.Close()
                }
                if ($bulkCopy) {
                    $bulkCopy.Close()
                }
            }

            $tableRows = Invoke-FlashdbSqlScalar -Connection $destinationConnection -Sql "SELECT COUNT_BIG(*) FROM $schemaId.$tableId;"
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
                Remove-FlashdbSqlDatabase -ConnectionString $DestinationConnectionString -DatabaseName $TargetDatabase
            } catch {
                Write-Warning "Failed to clean up partial SQL copy $TargetDatabase`: $_"
            }
        }

        throw
    } finally {
        if ($destinationConnection) {
            $destinationConnection.Dispose()
        }
        $destinationMasterConnection.Dispose()
        $sourceConnection.Dispose()
    }
}

function Copy-FlashdbSqlDatabaseTables {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ConnectionString,

        [string]$DestinationConnectionString,

        [Parameter(Mandatory = $true)]
        [string]$SourceDatabase,

        [Parameter(Mandatory = $true)]
        [string]$TargetDatabase,

        [string[]]$SelectedTables
    )

    if ($DestinationConnectionString -and $DestinationConnectionString -ne $ConnectionString) {
        return Copy-FlashdbSqlDatabaseTablesCrossConnection `
            -SourceConnectionString $ConnectionString `
            -DestinationConnectionString $DestinationConnectionString `
            -SourceDatabase $SourceDatabase `
            -TargetDatabase $TargetDatabase `
            -SelectedTables $SelectedTables
    }

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
        [string]$DestinationConnection,
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

    $effectiveDestinationConnection = if ($DestinationConnection) { $DestinationConnection } else { $SourceConnection }

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
            -DestinationConnectionString $effectiveDestinationConnection `
            -SourceDatabase $copySourceDatabase `
            -TargetDatabase $targetDatabase `
            -SelectedTables $SelectedTables
    }

    $imageId = "golden-$(Get-Date -Format yyyyMMddHHmmss)-$(Get-Random -Minimum 1000 -Maximum 9999)"

    # Calculate database size if it exists
    $sizeBytes = 0
    if ($sqlCopy) {
        try {
            $sizeBytes = Get-FlashdbSqlDatabaseSizeBytes -ConnectionString $effectiveDestinationConnection -DatabaseName $sqlCopy.DatabaseName
        } catch {
            Write-Verbose "Failed to query golden image database size: $_"
            $sizeBytes = 0
        }
    }

    $image = [PSCustomObject]@{
        Id = $imageId
        Name = $Name
        Version = $Version
        Method = $Method
        OutputPath = $OutputPath
        BackupFile = $BackupFile
        SourceConnection = $SourceConnection
        DestinationConnection = $effectiveDestinationConnection
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
        SizeBytes = $sizeBytes
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
        [string]$DestinationConnection,
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
        DestinationConnection = $DestinationConnection
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

    $image = $script:GoldenImages[$GoldenImageId]
    $databaseType = Get-FlashdbPropertyValue -Target $image -Name 'DatabaseType' -Default 'sql-server'
    $sourceConnection = Get-FlashdbPropertyValue -Target $image -Name 'DestinationConnection' -Default (Get-FlashdbPropertyValue -Target $image -Name 'SourceConnection')
    $goldenDatabaseName = Get-FlashdbPropertyValue -Target $image -Name 'GoldenDatabaseName'
    $outputPath = Get-FlashdbPropertyValue -Target $image -Name 'OutputPath'
    $deletedDatabase = $false
    $deletedFile = $false

    if ($databaseType -eq 'sql-server' -and $sourceConnection -and $goldenDatabaseName) {
        Remove-FlashdbSqlDatabase -ConnectionString $sourceConnection -DatabaseName $goldenDatabaseName
        $deletedDatabase = $true
    }

    if ($outputPath -and (Test-Path -Path $outputPath -PathType Leaf)) {
        try {
            Remove-Item -Path $outputPath -Force -ErrorAction Stop
            $deletedFile = $true
        } catch {
            if (-not $Force) {
                throw "Failed to delete golden image file '$outputPath': $_"
            }

            Write-Warning "Failed to delete golden image file '$outputPath': $_"
        }
    }

    $script:GoldenImages.Remove($GoldenImageId)
    Save-FlashdbProviderState

    return [PSCustomObject]@{
        Success = $true
        Message = "Golden image $GoldenImageId deleted"
        GoldenImageId = $GoldenImageId
        GoldenDatabaseName = $goldenDatabaseName
        DeletedDatabase = $deletedDatabase
        DeletedFile = $deletedFile
    }
}

function Update-FlashdbGoldenImageSize {
    param(
        [string]$GoldenImageId
    )

    $image = $script:GoldenImages[$GoldenImageId]
    if (-not $image) {
        throw "Golden image not found: $GoldenImageId"
    }

    $sizeBytes = 0
    $databaseType = Get-FlashdbPropertyValue -Target $image -Name 'DatabaseType' -Default 'sql-server'
    $goldenDatabaseName = Get-FlashdbPropertyValue -Target $image -Name 'GoldenDatabaseName'
    $sourceConnection = Get-FlashdbPropertyValue -Target $image -Name 'DestinationConnection' -Default (Get-FlashdbPropertyValue -Target $image -Name 'SourceConnection')

    if ($databaseType -eq 'sql-server' -and $goldenDatabaseName -and $sourceConnection) {
        try {
            $sizeBytes = Get-FlashdbSqlDatabaseSizeBytes -ConnectionString $sourceConnection -DatabaseName $goldenDatabaseName

            if ($sizeBytes -gt 0) {
                Add-OrSetProperty -Target $image -Name 'SizeBytes' -Value $sizeBytes
                Add-OrSetProperty -Target $image -Name 'LastSizeUpdateAt' -Value (Get-Date).ToString("o")
                Save-FlashdbProviderState
                Write-Verbose "Updated golden image size: $GoldenImageId = $sizeBytes bytes"
            }
        } catch {
            Write-Verbose "Failed to update golden image size for $GoldenImageId : $_"
        }
    } else {
        $outputPath = Get-FlashdbPropertyValue -Target $image -Name 'OutputPath'
        if ($outputPath -and (Test-Path -Path $outputPath -PathType Leaf)) {
            $sizeBytes = [int64](Get-Item -Path $outputPath).Length
            Add-OrSetProperty -Target $image -Name 'SizeBytes' -Value $sizeBytes
            Add-OrSetProperty -Target $image -Name 'LastSizeUpdateAt' -Value (Get-Date).ToString("o")
            Save-FlashdbProviderState
        }
    }

    return $sizeBytes
}

function Update-FlashdbGoldenImageSizes {
    param(
        [switch]$Force
    )

    $updated = 0
    $failed = 0
    $skipped = 0

    foreach ($imageId in @($script:GoldenImages.Keys)) {
        $image = $script:GoldenImages[$imageId]
        $currentSizeBytes = [int64](Get-FlashdbPropertyValue -Target $image -Name 'SizeBytes' -Default 0)

        # Skip if already has recent size data and not forced
        if (-not $Force -and $currentSizeBytes -gt 0) {
            $skipped++
            continue
        }

        try {
            $sizeBytes = Update-FlashdbGoldenImageSize -GoldenImageId $imageId -ErrorAction Stop
            if ($sizeBytes -gt 0) {
                $updated++
            } else {
                $skipped++
            }
        } catch {
            $failed++
            Write-Verbose "Failed to update size for $imageId : $_"
        }
    }

    return [PSCustomObject]@{
        TotalImages = $script:GoldenImages.Count
        Updated = $updated
        Failed = $failed
        Skipped = $skipped
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

    # Use stored size if available, otherwise try to calculate it
    $storedSizeBytes = [int64](Get-FlashdbPropertyValue -Target $image -Name 'SizeBytes' -Default 0)
    $sizeBytes = if ($storedSizeBytes -gt 0) {
        $storedSizeBytes
    } else {
        # Try to update size for existing golden images that don't have it
        Update-FlashdbGoldenImageSize -GoldenImageId $ImageId -ErrorAction SilentlyContinue
    }

    return [PSCustomObject]@{
        Id = $ImageId
        Name = $image.Name
        Size = $sizeBytes
        SizeGB = [math]::Round($sizeBytes / 1GB, 2)
        Tables = [int](Get-FlashdbPropertyValue -Target $image -Name 'TableCount' -Default 0)
        Rows = [int64](Get-FlashdbPropertyValue -Target $image -Name 'RowCount' -Default 0)
        DatabaseName = Get-FlashdbPropertyValue -Target $image -Name 'GoldenDatabaseName' -Default (Get-FlashdbPropertyValue -Target $image -Name 'DatabaseName')
        CreatedAt = Get-FlashdbPropertyValue -Target $image -Name 'CreatedAt'
        Status = Get-FlashdbPropertyValue -Target $image -Name 'Status'
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
    $imageConnection = if ($image) {
        Get-FlashdbPropertyValue -Target $image -Name 'DestinationConnection' -Default (Get-FlashdbPropertyValue -Target $image -Name 'SourceConnection')
    } else {
        $null
    }
    if ($image -and $image.DatabaseType -eq 'sql-server' -and $image.GoldenDatabaseName) {
        $targetDatabase = if ($DatabaseName) { $DatabaseName } else { "${CloneName}_Clone" }
        $sqlCopy = Copy-FlashdbSqlDatabaseTables `
            -ConnectionString $imageConnection `
            -SourceDatabase $image.GoldenDatabaseName `
            -TargetDatabase $targetDatabase
    }

    $cloneId = "clone-$(Get-Date -Format yyyyMMddHHmmss)-$(Get-Random -Minimum 1000 -Maximum 9999)"
    $finalDatabaseName = if ($sqlCopy) { $sqlCopy.DatabaseName } elseif ($DatabaseName) { $DatabaseName } else { "${CloneName}_Clone" }
    $cloneSizeBytes = 0
    if ($sqlCopy -and $imageConnection) {
        try {
            $cloneSizeBytes = Get-FlashdbSqlDatabaseSizeBytes -ConnectionString $imageConnection -DatabaseName $finalDatabaseName
        } catch {
            Write-Verbose "Failed to query clone database size: $_"
            $cloneSizeBytes = 0
        }
    }

    $clone = [PSCustomObject]@{
        Id = $cloneId
        Name = $CloneName
        GoldenImageId = $GoldenImageId
        InstancePath = $InstancePath
        StoragePath = $StoragePath
        DatabaseType = $DatabaseType
        DatabaseName = $finalDatabaseName
        CompressionEnabled = $CompressionEnabled
        SourceGoldenDatabaseName = if ($sqlCopy) { $sqlCopy.SourceDatabase } else { $null }
        SourceConnection = $imageConnection
        Actualized = [bool]$sqlCopy
        TableCount = if ($sqlCopy) { $sqlCopy.TableCount } else { 0 }
        RowCount = if ($sqlCopy) { $sqlCopy.RowCount } else { 0 }
        SizeBytes = $cloneSizeBytes
        CreatedAt = (Get-Date).ToString("o")
        Status = 'Ready'
    }

    $script:Clones[$cloneId] = $clone
    Save-FlashdbProviderState

    # Also create JSON metadata file for compatibility with CloneManagement.ps1
    if ($StoragePath -and (Test-Path -Path $StoragePath -PathType Container)) {
        $metadata = @{
            clone = @{
                id = $cloneId
                name = $CloneName
                createdAt = (Get-Date).ToUniversalTime().ToString("o")
                createdBy = [Environment]::UserName
                vhdxPath = ""  # GoldenImageProvider doesn't use VHDX files
                size = @{
                    allocated = 0
                    used = 0
                }
            }
            golden = @{
                id = $GoldenImageId
                parentHash = ""
            }
            database = @{
                type = $DatabaseType
                databaseName = $finalDatabaseName
                instancePath = $InstancePath
            }
            attachment = @{
                status = "detached"
                attachedAt = $null
                detachedAt = $null
                lastVerifiedAt = $null
            }
            checkpoints = @()
            lifecycle = @{
                status = "active"
                expirationPolicy = "manual"
                expiresAt = $null
                tags = @()
            }
            operations = @{
                lastOperation = "clone-created"
                lastOperationAt = (Get-Date).ToUniversalTime().ToString("o")
                operationLog = @(
                    @{
                        operation = "clone-created"
                        timestamp = (Get-Date).ToUniversalTime().ToString("o")
                        status = "success"
                    }
                )
            }
        }

        $metadataPath = Join-Path $StoragePath "$cloneId.json"
        try {
            $metadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $metadataPath -Encoding UTF8 -Force
        } catch {
            Write-Warning "Failed to save clone metadata JSON: $_"
        }
    }

    return $clone
}

function Update-FlashdbCloneSize {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Clone
    )

    $currentSizeBytes = [int64](Get-FlashdbPropertyValue -Target $Clone -Name 'SizeBytes' -Default 0)
    if ($currentSizeBytes -gt 0) {
        return $currentSizeBytes
    }

    $databaseType = Get-FlashdbPropertyValue -Target $Clone -Name 'DatabaseType'
    $databaseName = Get-FlashdbPropertyValue -Target $Clone -Name 'DatabaseName'
    $sourceConnection = Get-FlashdbCloneSourceConnection -Clone $Clone
    if ($databaseType -ne 'sql-server' -or -not $databaseName -or -not $sourceConnection) {
        return 0
    }

    try {
        $sizeBytes = Get-FlashdbSqlDatabaseSizeBytes -ConnectionString $sourceConnection -DatabaseName $databaseName
        if ($sizeBytes -gt 0) {
            Add-OrSetProperty -Target $Clone -Name 'SizeBytes' -Value $sizeBytes
            Save-FlashdbProviderState
        }
        return $sizeBytes
    } catch {
        Write-Verbose "Failed to update clone size for $databaseName`: $_"
        return 0
    }
}

function Get-FlashdbClone {
    param(
        [string]$CloneId
    )

    if ($CloneId) {
        $clone = $script:Clones[$CloneId]
        if ($clone) {
            Update-FlashdbCloneSize -Clone $clone | Out-Null
        }
        return $clone
    }

    if ($script:Clones.Count -eq 0) {
        return @()
    }
    foreach ($clone in @($script:Clones.Values)) {
        Update-FlashdbCloneSize -Clone $clone | Out-Null
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

    $clone = $script:Clones[$CloneId]
    $sqlCopy = $null
    $checkpointDatabaseName = $null
    $sourceCloneDatabaseName = $null
    $sizeBytes = 0

    if ($clone) {
        $databaseType = Get-FlashdbPropertyValue -Target $clone -Name 'DatabaseType'
        $sourceCloneDatabaseName = Get-FlashdbPropertyValue -Target $clone -Name 'DatabaseName'
        $sourceConnection = Get-FlashdbCloneSourceConnection -Clone $clone

        if ($databaseType -eq 'sql-server' -and $sourceCloneDatabaseName -and $sourceConnection) {
            $checkpointDatabaseName = "FlashDB_Checkpoint_$($cpId -replace '[^A-Za-z0-9_]', '_')"
            $sqlCopy = Copy-FlashdbSqlDatabaseTables `
                -ConnectionString $sourceConnection `
                -SourceDatabase $sourceCloneDatabaseName `
                -TargetDatabase $checkpointDatabaseName

            try {
                $sizeBytes = Get-FlashdbSqlDatabaseSizeBytes -ConnectionString $sourceConnection -DatabaseName $checkpointDatabaseName
            } catch {
                Write-Verbose "Failed to query checkpoint database size: $_"
                $sizeBytes = 0
            }
        }
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
        CheckpointDatabaseName = $checkpointDatabaseName
        SourceCloneDatabaseName = $sourceCloneDatabaseName
        Actualized = [bool]$sqlCopy
        TableCount = if ($sqlCopy) { $sqlCopy.TableCount } else { 0 }
        RowCount = if ($sqlCopy) { $sqlCopy.RowCount } else { 0 }
        SizeBytes = $sizeBytes
        CopiedTables = if ($sqlCopy) { @($sqlCopy.Tables) } else { @() }
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
        [bool]$ReattachAfter = $true,
        [switch]$Force
    )

    $checkpoint = $script:Checkpoints[$CheckpointId]
    if (-not $checkpoint) {
        throw "Checkpoint not found: $CheckpointId"
    }

    $clone = $script:Clones[$CloneId]
    if (-not $clone) {
        throw "Clone not found: $CloneId"
    }

    $restoreResult = $null
    $databaseType = Get-FlashdbPropertyValue -Target $clone -Name 'DatabaseType'
    $targetDatabaseName = Get-FlashdbPropertyValue -Target $clone -Name 'DatabaseName'
    $checkpointDatabaseName = Get-FlashdbPropertyValue -Target $checkpoint -Name 'CheckpointDatabaseName'
    $sourceConnection = Get-FlashdbCloneSourceConnection -Clone $clone

    if ($databaseType -eq 'sql-server') {
        if (-not $checkpointDatabaseName) {
            throw "Checkpoint $CheckpointId does not contain SQL snapshot data. Create a new checkpoint before restoring SQL data."
        }

        if (-not $targetDatabaseName) {
            throw "Clone $CloneId does not have a SQL database name."
        }

        if (-not $sourceConnection) {
            throw "Clone $CloneId does not have a SQL source connection."
        }

        $restoreResult = Restore-FlashdbSqlDatabaseFromCheckpoint `
            -ConnectionString $sourceConnection `
            -CheckpointDatabase $checkpointDatabaseName `
            -TargetDatabase $targetDatabaseName

        Add-OrSetProperty -Target $clone -Name 'TableCount' -Value $restoreResult.TableCount
        Add-OrSetProperty -Target $clone -Name 'RowCount' -Value $restoreResult.RowCount
        try {
            $restoredSizeBytes = Get-FlashdbSqlDatabaseSizeBytes -ConnectionString $sourceConnection -DatabaseName $targetDatabaseName
            Add-OrSetProperty -Target $clone -Name 'SizeBytes' -Value $restoredSizeBytes
        } catch {
            Write-Verbose "Failed to query restored clone database size: $_"
        }
        Add-OrSetProperty -Target $clone -Name 'Status' -Value $(if ($ReattachAfter) { 'Attached' } else { 'Ready' })
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
        DatabaseName = $targetDatabaseName
        CheckpointDatabaseName = $checkpointDatabaseName
        TableCount = if ($restoreResult) { $restoreResult.TableCount } else { 0 }
        RowCount = if ($restoreResult) { $restoreResult.RowCount } else { 0 }
        SizeBytes = if ($restoreResult) { Get-FlashdbPropertyValue -Target $clone -Name 'SizeBytes' -Default 0 } else { 0 }
    }
}

function Remove-FlashdbCheckpoint {
    param(
        [string]$CloneId,
        [string]$CheckpointId,
        [switch]$Force
    )

    $checkpoint = $script:Checkpoints[$CheckpointId]
    if ($checkpoint) {
        $checkpointDatabaseName = Get-FlashdbPropertyValue -Target $checkpoint -Name 'CheckpointDatabaseName'
        $clone = if ($CloneId -and $script:Clones.ContainsKey($CloneId)) { $script:Clones[$CloneId] } else { $script:Clones[$checkpoint.CloneId] }

        if ($checkpointDatabaseName) {
            $sourceConnection = if ($clone) { Get-FlashdbCloneSourceConnection -Clone $clone } else { $null }
            if ($sourceConnection) {
                Remove-FlashdbSqlDatabase -ConnectionString $sourceConnection -DatabaseName $checkpointDatabaseName
            } elseif (-not $Force) {
                throw "Cannot remove checkpoint database $checkpointDatabaseName because no SQL source connection was found."
            }
        }

        if ($clone -and (Get-FlashdbPropertyValue -Target $clone -Name 'LastRestoredCheckpointId') -eq $CheckpointId) {
            Add-OrSetProperty -Target $clone -Name 'LastRestoredCheckpointId' -Value $null
            Add-OrSetProperty -Target $clone -Name 'LastRestoredAt' -Value $null
        }
    }

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
