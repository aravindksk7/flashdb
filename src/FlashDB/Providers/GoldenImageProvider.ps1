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

function Remove-FlashdbGoldenImage {
    param(
        [string]$GoldenImageId,
        [switch]$Force
    )

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

    $cloneId = "clone-$(Get-Date -Format yyyyMMddHHmmss)-$(Get-Random -Minimum 1000 -Maximum 9999)"

    $clone = [PSCustomObject]@{
        Id = $cloneId
        Name = $CloneName
        GoldenImageId = $GoldenImageId
        InstancePath = $InstancePath
        StoragePath = $StoragePath
        DatabaseType = $DatabaseType
        DatabaseName = if ($DatabaseName) { $DatabaseName } else { "${CloneName}_Clone" }
        CompressionEnabled = $CompressionEnabled
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
        $cloneCheckpoints = $script:Checkpoints.Values | Where-Object { $_.CloneId -eq $CloneId }
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
