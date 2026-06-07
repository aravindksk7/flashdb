#Requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }

<#
.SYNOPSIS
    Regression test for checkpoint restore against dbo.Orders data.
.DESCRIPTION
    Exercises the same queued checkpoint restore API path used by the GUI and
    verifies that [TestDB_Clone_1].[dbo].[Orders] is restored at the data level,
    not only that checkpoint metadata is updated.

    Environment overrides:
    - FLASHDB_API_URL, default http://localhost:3001/api
    - FLASHDB_SQL_SERVER, default localhost,1434
    - FLASHDB_SQL_USER, default sa
    - FLASHDB_SQL_PASSWORD, default FlashDB@Password123
    - FLASHDB_RESTORE_TEST_DATABASE, default TestDB_Clone_1
    - FLASHDB_RESTORE_TEST_CLONE_ID, optional clone id override
    - FLASHDB_RESTORE_TEST_TIMEOUT_SECONDS, default 120
    - FLASHDB_RESTORE_TEST_KEEP_CHECKPOINT, set to true to keep the checkpoint
#>

BeforeAll {
    $script:ApiUrl = if ($env:FLASHDB_API_URL) { $env:FLASHDB_API_URL.TrimEnd('/') } else { 'http://localhost:3001/api' }
    $script:SqlServer = if ($env:FLASHDB_SQL_SERVER) { $env:FLASHDB_SQL_SERVER } else { 'localhost,1434' }
    $script:SqlUser = if ($env:FLASHDB_SQL_USER) { $env:FLASHDB_SQL_USER } else { 'sa' }
    $script:SqlPassword = if ($env:FLASHDB_SQL_PASSWORD) { $env:FLASHDB_SQL_PASSWORD } else { 'FlashDB@Password123' }
    $script:DatabaseName = if ($env:FLASHDB_RESTORE_TEST_DATABASE) { $env:FLASHDB_RESTORE_TEST_DATABASE } else { 'TestDB_Clone_1' }
    $script:CloneIdOverride = $env:FLASHDB_RESTORE_TEST_CLONE_ID
    $script:TaskTimeoutSeconds = if ($env:FLASHDB_RESTORE_TEST_TIMEOUT_SECONDS) { [int]$env:FLASHDB_RESTORE_TEST_TIMEOUT_SECONDS } else { 120 }
    $script:KeepCheckpoint = $env:FLASHDB_RESTORE_TEST_KEEP_CHECKPOINT -in @('1', 'true', 'yes', 'on')
    $script:SkipBecause = $null
    $script:CloneId = $null

    function Get-RestoreOrdersProperty {
        param(
            [Parameter(Mandatory)]
            [object]$InputObject,
            [Parameter(Mandatory)]
            [string[]]$Names
        )

        foreach ($name in $Names) {
            $property = $InputObject.PSObject.Properties[$name]
            if ($property -and $null -ne $property.Value) {
                return $property.Value
            }
        }

        return $null
    }

    function New-RestoreOrdersConnectionString {
        param([string]$InitialCatalog = $script:DatabaseName)

        $builder = [System.Data.SqlClient.SqlConnectionStringBuilder]::new()
        $builder['Server'] = $script:SqlServer
        $builder['Initial Catalog'] = $InitialCatalog
        $builder['User ID'] = $script:SqlUser
        $builder['Password'] = $script:SqlPassword
        $builder['Connect Timeout'] = 15
        $builder['Encrypt'] = $false
        $builder['TrustServerCertificate'] = $true
        return $builder.ConnectionString
    }

    function Invoke-RestoreOrdersSqlQuery {
        param(
            [Parameter(Mandatory)]
            [string]$Query,
            [hashtable]$Parameters = @{},
            [string]$DatabaseName = $script:DatabaseName
        )

        $connection = [System.Data.SqlClient.SqlConnection]::new((New-RestoreOrdersConnectionString -InitialCatalog $DatabaseName))
        try {
            $connection.Open()
            $command = $connection.CreateCommand()
            $command.CommandText = $Query
            $command.CommandTimeout = 60

            foreach ($item in $Parameters.GetEnumerator()) {
                $null = $command.Parameters.AddWithValue("@$($item.Key)", $item.Value)
            }

            $reader = $command.ExecuteReader()
            try {
                $table = [System.Data.DataTable]::new()
                $table.Load($reader)
                return ,$table
            }
            finally {
                $reader.Close()
            }
        }
        finally {
            $connection.Close()
        }
    }

    function Invoke-RestoreOrdersSqlScalar {
        param(
            [Parameter(Mandatory)]
            [string]$Query,
            [hashtable]$Parameters = @{},
            [string]$DatabaseName = $script:DatabaseName
        )

        $connection = [System.Data.SqlClient.SqlConnection]::new((New-RestoreOrdersConnectionString -InitialCatalog $DatabaseName))
        try {
            $connection.Open()
            $command = $connection.CreateCommand()
            $command.CommandText = $Query
            $command.CommandTimeout = 60

            foreach ($item in $Parameters.GetEnumerator()) {
                $null = $command.Parameters.AddWithValue("@$($item.Key)", $item.Value)
            }

            return $command.ExecuteScalar()
        }
        finally {
            $connection.Close()
        }
    }

    function Invoke-RestoreOrdersSqlNonQuery {
        param(
            [Parameter(Mandatory)]
            [string]$Query,
            [hashtable]$Parameters = @{},
            [string]$DatabaseName = $script:DatabaseName
        )

        $connection = [System.Data.SqlClient.SqlConnection]::new((New-RestoreOrdersConnectionString -InitialCatalog $DatabaseName))
        try {
            $connection.Open()
            $command = $connection.CreateCommand()
            $command.CommandText = $Query
            $command.CommandTimeout = 60

            foreach ($item in $Parameters.GetEnumerator()) {
                $null = $command.Parameters.AddWithValue("@$($item.Key)", $item.Value)
            }

            return $command.ExecuteNonQuery()
        }
        finally {
            $connection.Close()
        }
    }

    function Invoke-RestoreOrdersApi {
        param(
            [Parameter(Mandatory)]
            [string]$Path,
            [ValidateSet('Get', 'Post', 'Delete')]
            [string]$Method = 'Get',
            [hashtable]$Body
        )

        $uri = "$script:ApiUrl/$($Path.TrimStart('/'))"
        if ($Method -eq 'Get') {
            $separator = if ($uri.Contains('?')) { '&' } else { '?' }
            $uri = "$uri${separator}_t=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
        }

        $parameters = @{
            Uri = $uri
            Method = $Method
            ErrorAction = 'Stop'
        }

        if ($Body) {
            $parameters['ContentType'] = 'application/json'
            $parameters['Body'] = ($Body | ConvertTo-Json -Depth 8)
        }

        return Invoke-RestMethod @parameters
    }

    function Wait-RestoreOrdersTask {
        param(
            [Parameter(Mandatory)]
            [string]$TaskId
        )

        $deadline = (Get-Date).AddSeconds($script:TaskTimeoutSeconds)

        do {
            $response = Invoke-RestoreOrdersApi -Path "/queue/tasks/$TaskId" -Method Get
            $task = $response.data

            if ($task.status -eq 'completed') {
                return $task
            }

            if ($task.status -eq 'failed') {
                throw "Task $TaskId failed: $($task.error)"
            }

            Start-Sleep -Milliseconds 500
        } while ((Get-Date) -lt $deadline)

        throw "Timed out waiting for task $TaskId to complete after $script:TaskTimeoutSeconds seconds."
    }

    function Resolve-RestoreOrdersCloneId {
        $response = Invoke-RestoreOrdersApi -Path '/clones' -Method Get
        $clones = @($response.data)

        if ($script:CloneIdOverride) {
            $clone = $clones | Where-Object {
                (Get-RestoreOrdersProperty -InputObject $_ -Names @('Id', 'id', 'CloneId', 'cloneId')) -eq $script:CloneIdOverride
            } | Select-Object -First 1

            if (-not $clone) {
                throw "Clone id '$script:CloneIdOverride' was not returned by $script:ApiUrl/clones."
            }

            return (Get-RestoreOrdersProperty -InputObject $clone -Names @('Id', 'id', 'CloneId', 'cloneId'))
        }

        $matchingClone = $clones | Where-Object {
            (Get-RestoreOrdersProperty -InputObject $_ -Names @('DatabaseName', 'databaseName')) -eq $script:DatabaseName
        } | Select-Object -First 1

        if (-not $matchingClone) {
            throw "No FlashDB clone returned by the API has DatabaseName '$script:DatabaseName'."
        }

        return (Get-RestoreOrdersProperty -InputObject $matchingClone -Names @('Id', 'id', 'CloneId', 'cloneId'))
    }

    function Get-RestoreOrdersState {
        param([Parameter(Mandatory)][string]$SentinelStatus)

        $table = Invoke-RestoreOrdersSqlQuery -Query @"
SELECT
    CAST(COUNT_BIG(*) AS bigint) AS [RowCount],
    CAST(ISNULL(CHECKSUM_AGG(BINARY_CHECKSUM(OrderID, CustomerID, OrderDate, TotalAmount, Status)), 0) AS int) AS [DataChecksum],
    CAST(SUM(CASE WHEN Status = @SentinelStatus THEN 1 ELSE 0 END) AS int) AS [SentinelCount]
FROM dbo.Orders;
"@ -Parameters @{ SentinelStatus = $SentinelStatus }

        $row = $table.Rows[0]
        return [pscustomobject]@{
            RowCount = [int64]$row.RowCount
            DataChecksum = [int]$row.DataChecksum
            SentinelCount = [int]$row.SentinelCount
        }
    }

    function New-RestoreOrdersCheckpoint {
        param([Parameter(Mandatory)][string]$CheckpointName)

        $response = Invoke-RestoreOrdersApi -Path "/clones/$script:CloneId/checkpoints" -Method Post -Body @{
            checkpointName = $CheckpointName
            phase = 'restore-regression'
            description = "Regression test checkpoint for dbo.Orders restore."
            useQueue = $true
        }

        $taskId = Get-RestoreOrdersProperty -InputObject $response.data -Names @('taskId', 'TaskId')
        if ($taskId) {
            Wait-RestoreOrdersTask -TaskId $taskId | Out-Null
        }

        $deadline = (Get-Date).AddSeconds(15)
        do {
            $checkpoints = @((Invoke-RestoreOrdersApi -Path "/clones/$script:CloneId/checkpoints" -Method Get).data)
            $checkpoint = $checkpoints | Where-Object {
                (Get-RestoreOrdersProperty -InputObject $_ -Names @('Name', 'name', 'CheckpointName', 'checkpointName')) -eq $CheckpointName
            } | Select-Object -First 1

            if ($checkpoint) {
                $checkpointId = Get-RestoreOrdersProperty -InputObject $checkpoint -Names @('CheckpointId', 'checkpointId', 'Id', 'id')
                if ($checkpointId) {
                    return $checkpointId
                }
            }

            Start-Sleep -Milliseconds 500
        } while ((Get-Date) -lt $deadline)

        throw "Checkpoint '$CheckpointName' was created but could not be found in the checkpoint list."
    }

    function Restore-RestoreOrdersCheckpoint {
        param([Parameter(Mandatory)][string]$CheckpointId)

        $response = Invoke-RestoreOrdersApi -Path "/clones/$script:CloneId/checkpoints/$CheckpointId/restore" -Method Post -Body @{
            reattachAfter = $true
            useQueue = $true
        }

        $taskId = Get-RestoreOrdersProperty -InputObject $response.data -Names @('taskId', 'TaskId')
        if ($taskId) {
            Wait-RestoreOrdersTask -TaskId $taskId | Out-Null
        }
    }

    function Remove-RestoreOrdersCheckpoint {
        param([Parameter(Mandatory)][string]$CheckpointId)

        $response = Invoke-RestoreOrdersApi -Path "/clones/$script:CloneId/checkpoints/$CheckpointId" -Method Delete -Body @{
            force = $true
        }

        $taskId = Get-RestoreOrdersProperty -InputObject $response.data -Names @('taskId', 'TaskId')
        if ($taskId) {
            Wait-RestoreOrdersTask -TaskId $taskId | Out-Null
        }
    }

    try {
        $script:CloneId = Resolve-RestoreOrdersCloneId

        $ordersObjectId = Invoke-RestoreOrdersSqlScalar -Query "SELECT OBJECT_ID(N'dbo.Orders', N'U');"
        if ($null -eq $ordersObjectId -or $ordersObjectId -is [System.DBNull]) {
            throw "Table [$script:DatabaseName].[dbo].[Orders] was not found."
        }
    }
    catch {
        $script:SkipBecause = $_.Exception.Message
    }
}

Describe "Restore checkpoint against [TestDB_Clone_1].[dbo].[Orders]" -Tag 'Integration', 'Restore' {
    It "removes data inserted after the checkpoint is restored" {
        if ($script:SkipBecause) {
            Set-ItResult -Skipped -Because $script:SkipBecause
            return
        }

        $suffix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString().Substring(4)
        $checkpointName = "orders-restore-$suffix"
        $sentinelStatus = "FBRT$suffix"
        $checkpointId = $null
        $insertedOrderId = $null

        try {
            $baseline = Get-RestoreOrdersState -SentinelStatus $sentinelStatus
            $baseline.SentinelCount | Should -Be 0

            $checkpointId = New-RestoreOrdersCheckpoint -CheckpointName $checkpointName

            $insertedOrderId = Invoke-RestoreOrdersSqlScalar -Query @"
INSERT INTO dbo.Orders (CustomerID, OrderDate, TotalAmount, Status)
OUTPUT INSERTED.OrderID
VALUES (1, GETDATE(), 123.45, @SentinelStatus);
"@ -Parameters @{ SentinelStatus = $sentinelStatus }

            $changed = Get-RestoreOrdersState -SentinelStatus $sentinelStatus
            $changed.RowCount | Should -Be ($baseline.RowCount + 1)
            $changed.SentinelCount | Should -Be 1

            Restore-RestoreOrdersCheckpoint -CheckpointId $checkpointId

            $restored = Get-RestoreOrdersState -SentinelStatus $sentinelStatus
            $restored.RowCount | Should -Be $baseline.RowCount
            $restored.DataChecksum | Should -Be $baseline.DataChecksum
            $restored.SentinelCount | Should -Be 0
        }
        finally {
            if ($insertedOrderId) {
                Invoke-RestoreOrdersSqlNonQuery -Query "DELETE FROM dbo.Orders WHERE Status = @SentinelStatus;" -Parameters @{
                    SentinelStatus = $sentinelStatus
                } | Out-Null
            }

            if ($checkpointId -and -not $script:KeepCheckpoint) {
                try {
                    Remove-RestoreOrdersCheckpoint -CheckpointId $checkpointId
                }
                catch {
                    Write-Warning "Failed to delete restore regression checkpoint ${checkpointId}: $($_.Exception.Message)"
                }
            }
        }
    }
}
