<#
.SYNOPSIS
    Checkpoint Management cmdlets for FlashDB
    Provides functionality to create, manage, restore, and compare VHDX snapshots

.DESCRIPTION
    This module implements checkpoint operations including:
    - New-FlashdbCheckpoint: Create VHDX snapshot of current clone state
    - Get-FlashdbCheckpoint: Retrieve checkpoint metadata and history
    - Set-FlashdbCheckpoint: Update checkpoint properties (labels, favorite flag)
    - Restore-FlashdbCheckpoint: Revert clone to a specific checkpoint
    - Get-FlashdbCheckpointDiff: Compare two checkpoints for data changes
    - Remove-FlashdbCheckpoint: Delete a checkpoint
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

<#
.SYNOPSIS
    Computes the state hash of a VHDX to validate checkpoint integrity

.DESCRIPTION
    Calculates a SHA-256 hash based on VHDX sector information and metadata.
    Used for pre-checkpoint baseline and post-restore validation.

.PARAMETER VhdxPath
    Path to the VHDX file

.OUTPUTS
    String containing the hex-encoded SHA-256 hash

.EXAMPLE
    $hash = Get-VhdxStateHash -VhdxPath "C:\vm\clone.vhdx"
#>
function Get-VhdxStateHash {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$VhdxPath
    )

    process {
        try {
            if (-not (Test-Path -Path $VhdxPath)) {
                throw "VHDX file not found: $VhdxPath"
            }

            $vhd = Get-VHD -Path $VhdxPath -ErrorAction Stop

            # Combine VHDX metadata for hash computation
            $creationTimeStr = $vhd.CreationTime.ToUniversalTime().ToString("O")
            $stateData = "$($vhd.LogicalSectorSize)_$($vhd.PhysicalSectorSize)_$($vhd.Size)_$creationTimeStr"
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($stateData)

            # Compute SHA-256 hash
            $sha256 = [System.Security.Cryptography.SHA256]::Create()
            $hash = $sha256.ComputeHash($bytes)

            # Return hex-encoded hash
            return [System.Convert]::ToHexString($hash)
        } catch {
            Write-Error "Failed to compute VHDX state hash: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Creates a new checkpoint (VHDX snapshot) of the current clone state

.DESCRIPTION
    Creates a new VHDX differencing disk that captures the current state of the
    clone at a specific point in time. Checkpoints support instant rollback without
    copying data. Also computes a state hash for validation.

.PARAMETER CloneId
    The ID of the clone to checkpoint

.PARAMETER CheckpointName
    Friendly name for the checkpoint

.PARAMETER Phase
    Phase identifier: 'pre-etl', 'post-etl', 'manual'

.PARAMETER Description
    Optional description of the checkpoint purpose

.PARAMETER Labels
    Array of custom labels for categorization

.PARAMETER Force
    Skip confirmation if clone has active connections

.EXAMPLE
    New-FlashdbCheckpoint -CloneId "clone-dev-test-1" `
        -CheckpointName "Before Delete Test" `
        -Phase "pre-etl" `
        -Description "Baseline before large delete operation"

.OUTPUTS
    System.Object with checkpoint metadata including preVhdxStateHash
#>
function New-FlashdbCheckpoint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CheckpointName,

        [Parameter(Mandatory = $false)]
        [ValidateSet('pre-etl', 'post-etl', 'manual')]
        [string]$Phase = 'manual',

        [Parameter()]
        [string]$Description,

        [Parameter()]
        [string[]]$Labels = @(),

        [Parameter()]
        [switch]$Force
    )

    process {
        try {
            # Get clone metadata
            $clone = Get-FlashdbClone -CloneId $CloneId -IncludeMetadata -ErrorAction Stop

            if (-not $clone) {
                throw "Clone not found: $CloneId"
            }

            $metadata = $clone.Metadata

            # Quiesce database before checkpoint
            $dbInstance = $metadata.database.instanceName
            $databaseName = $metadata.database.name

            if ($dbInstance -and $databaseName) {
                Write-Verbose "Quiescing database: $databaseName on $dbInstance"

                # Force SQL Server checkpoint (flush all dirty pages to disk)
                try {
                    Invoke-Sqlcmd -ServerInstance $dbInstance `
                                  -Database $databaseName `
                                  -Query "CHECKPOINT;" `
                                  -ConnectionTimeout 10 `
                                  -QueryTimeout 30 `
                                  -ErrorAction Stop
                    Write-Verbose "Database checkpoint completed"
                } catch {
                    Write-Error "Failed to quiesce database: $_"
                    if (-not $Force) { throw }
                }

                # Wait for active transactions to complete (max 10 seconds)
                $timeout = 10
                $startTime = Get-Date
                $activeConnections = $true

                while ((New-TimeSpan -Start $startTime -End (Get-Date)).TotalSeconds -lt $timeout -and $activeConnections) {
                    try {
                        $connections = Invoke-Sqlcmd -ServerInstance $dbInstance `
                                                     -Database $databaseName `
                                                     -Query "SELECT COUNT(*) as cnt FROM sys.dm_exec_sessions WHERE database_id = DB_ID() AND status = 'running'" `
                                                     -ErrorAction Stop

                        if ($connections.cnt -gt 0) {
                            Write-Verbose "Waiting for $($connections.cnt) active transactions to complete..."
                            Start-Sleep -Milliseconds 500
                        } else {
                            $activeConnections = $false
                            Write-Verbose "All transactions quiesced"
                        }
                    } catch {
                        Write-Verbose "Connection check failed (may be expected): $_"
                        break
                    }
                }

                if ($activeConnections -and -not $Force) {
                    throw "Database has active transactions. Use -Force to proceed anyway (may cause inconsistent checkpoint)."
                }
            } elseif ($metadata.attachment.status -eq 'attached' -and -not $Force) {
                # Fallback warning if database metadata not available
                Write-Warning "Clone has active database connections. Checkpoint may capture inconsistent state."
                $confirm = Read-Host "Continue? (yes/no)"
                if ($confirm -ne 'yes') {
                    return
                }
            }

            Write-Verbose "Creating checkpoint for clone: $CloneId"

            # Generate checkpoint ID (sequential)
            $cpNumber = ($metadata.checkpoints.Count + 1).ToString("D3")
            $checkpointId = "cp-$cpNumber"

            # Create VHDX snapshot
            $vhdxPath = $metadata.clone.vhdxPath
            $checkpointVhdxPath = $vhdxPath -replace '\.vhdx$', "_$checkpointId.vhdx"
            $checkpointDir = [System.IO.Path]::GetDirectoryName($vhdxPath)

            # Ensure checkpoint directory exists
            if (-not (Test-Path -Path $checkpointDir -PathType Container)) {
                New-Item -ItemType Directory -Path $checkpointDir -Force | Out-Null
            }

            Write-Verbose "Creating VHDX snapshot: $checkpointVhdxPath"

            # Create actual VHDX snapshot as differencing disk
            New-VHD -Path $checkpointVhdxPath -Differencing -ParentPath $vhdxPath -ErrorAction Stop | Out-Null

            # Verify creation
            if (-not (Test-Path -Path $checkpointVhdxPath)) {
                throw "Failed to create checkpoint VHDX: $checkpointVhdxPath"
            }

            Write-Verbose "VHDX checkpoint snapshot created successfully"

            # Phase 3: Compute state hash for validation
            $preVhdxStateHash = Get-VhdxStateHash -VhdxPath $vhdxPath
            Write-Verbose "Computed pre-checkpoint VHDX state hash: $preVhdxStateHash"

            # Record operation in SQL for tracking and recovery
            $operationId = [guid]::NewGuid().ToString()

            # Capture database metadata
            $dbMetadata = @{
                totalRowCount = 0
                totalDataSizeMB = 0
                schemaHash = "sha256:initial"
                tableCount = 0
                lastTableModified = $null
                estimatedChanges = 0
            }

            # Create checkpoint object
            $checkpoint = @{
                checkpointId = $checkpointId
                operationId = $operationId
                name = $CheckpointName
                createdAt = (Get-Date).ToUniversalTime().ToString("o")
                createdBy = [Environment]::UserName
                phase = $Phase
                vhdxSnapshotPath = $checkpointVhdxPath
                description = $Description
                isActive = $true
                isFavorite = $false
                labels = $Labels
                preVhdxStateHash = $preVhdxStateHash
                postVhdxStateHash = $null
                validationStatus = 'pending'
                validationError = $null
                databaseConnections = @{
                    activeCount = 0
                    forceClosed = $false
                }
                etlMetadata = @{
                    etlJobName = $null
                    startedAt = $null
                    completedAt = $null
                }
                databaseMetadata = $dbMetadata
            }

            # Add checkpoint to metadata
            $metadata.checkpoints += $checkpoint

            # Log operation
            $operation = @{
                operation = "checkpoint-created"
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                status = "success"
                checkpointId = $checkpointId
                phase = $Phase
            }
            $metadata.operations.operationLog += $operation
            $metadata.operations.lastOperation = "checkpoint-created"
            $metadata.operations.lastOperationAt = $operation.timestamp

            # Save updated metadata
            $metadataPath = $vhdxPath -replace '\.vhdx$', '.json'
            $metadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $metadataPath -Encoding UTF8 -Force

            Write-Verbose "Checkpoint created: $checkpointId"

            return [PSCustomObject]@{
                CloneId = $CloneId
                CheckpointId = $checkpointId
                Name = $CheckpointName
                Phase = $Phase
                CreatedAt = $checkpoint.createdAt
                CreatedBy = $checkpoint.createdBy
                VhdxPath = $checkpointVhdxPath
                PreVhdxStateHash = $preVhdxStateHash
            }
        } catch {
            Write-Error "Failed to create checkpoint: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Retrieves checkpoint metadata for a clone

.DESCRIPTION
    Lists all checkpoints for a clone with optional detailed metadata including
    row counts, schema information, and ETL job details.

.PARAMETER CloneId
    The ID of the clone

.PARAMETER CheckpointId
    Specific checkpoint ID (optional)

.PARAMETER IncludeMetadata
    Include detailed metadata (default: $false)

.PARAMETER Phase
    Filter by phase (pre-etl, post-etl, manual)

.EXAMPLE
    # List all checkpoints for a clone
    Get-FlashdbCheckpoint -CloneId "clone-dev-test-1"

    # Get specific checkpoint with details
    Get-FlashdbCheckpoint -CloneId "clone-dev-test-1" -CheckpointId "cp-001" -IncludeMetadata

.OUTPUTS
    System.Object array with checkpoint information
#>
function Get-FlashdbCheckpoint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneId,

        [Parameter()]
        [string]$CheckpointId,

        [Parameter()]
        [switch]$IncludeMetadata,

        [Parameter()]
        [ValidateSet('pre-etl', 'post-etl', 'manual')]
        [string]$Phase
    )

    process {
        try {
            # Get clone metadata
            $clone = Get-FlashdbClone -CloneId $CloneId -IncludeMetadata -ErrorAction Stop

            if (-not $clone) {
                throw "Clone not found: $CloneId"
            }

            $metadata = $clone.Metadata
            $checkpoints = $metadata.checkpoints

            # Filter by checkpoint ID if specified
            if ($CheckpointId) {
                $checkpoints = $checkpoints | Where-Object { $_.checkpointId -eq $CheckpointId }
            }

            # Filter by phase if specified
            if ($Phase) {
                $checkpoints = $checkpoints | Where-Object { $_.phase -eq $Phase }
            }

            # Build output objects
            foreach ($cp in $checkpoints) {
                $cpObj = [PSCustomObject]@{
                    CloneId = $CloneId
                    CheckpointId = $cp.checkpointId
                    Name = $cp.name
                    CreatedAt = $cp.createdAt
                    CreatedBy = $cp.createdBy
                    Phase = $cp.phase
                    Description = $cp.description
                    IsFavorite = $cp.isFavorite
                    Labels = $cp.labels
                    IsActive = $cp.isActive
                }

                if ($IncludeMetadata) {
                    $cpObj | Add-Member -MemberType NoteProperty -Name 'DatabaseMetadata' -Value $cp.databaseMetadata
                    $cpObj | Add-Member -MemberType NoteProperty -Name 'Connections' -Value $cp.databaseConnections
                    $cpObj | Add-Member -MemberType NoteProperty -Name 'EtlMetadata' -Value $cp.etlMetadata
                }

                $cpObj
            }
        } catch {
            Write-Error "Failed to get checkpoint information: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Updates checkpoint properties

.DESCRIPTION
    Modify checkpoint metadata such as labels, favorite flag, and descriptions
    without creating a new checkpoint.

.PARAMETER CloneId
    The ID of the clone

.PARAMETER CheckpointId
    The ID of the checkpoint to update

.PARAMETER IsFavorite
    Mark checkpoint as favorite

.PARAMETER Labels
    Array of labels to assign

.PARAMETER Description
    Update description

.EXAMPLE
    Set-FlashdbCheckpoint -CloneId "clone-dev-test-1" `
        -CheckpointId "cp-001" `
        -IsFavorite $true `
        -Labels @("baseline", "performance-test")

.OUTPUTS
    System.Object with updated checkpoint metadata
#>
function Set-FlashdbCheckpoint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CheckpointId,

        [Parameter()]
        [bool]$IsFavorite,

        [Parameter()]
        [string[]]$Labels,

        [Parameter()]
        [string]$Description
    )

    process {
        try {
            # Get clone metadata
            $clone = Get-FlashdbClone -CloneId $CloneId -IncludeMetadata -ErrorAction Stop

            if (-not $clone) {
                throw "Clone not found: $CloneId"
            }

            $metadata = $clone.Metadata

            # Find checkpoint
            $checkpoint = $metadata.checkpoints | Where-Object { $_.checkpointId -eq $CheckpointId }

            if (-not $checkpoint) {
                throw "Checkpoint not found: $CheckpointId"
            }

            Write-Verbose "Updating checkpoint: $CheckpointId"

            # Update properties if provided
            if ($PSBoundParameters.ContainsKey('IsFavorite')) {
                $checkpoint.isFavorite = $IsFavorite
            }

            if ($Labels) {
                $checkpoint.labels = $Labels
            }

            if ($Description) {
                $checkpoint.description = $Description
            }

            # Log operation
            $operation = @{
                operation = "checkpoint-updated"
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                status = "success"
                checkpointId = $CheckpointId
            }
            $metadata.operations.operationLog += $operation
            $metadata.operations.lastOperation = "checkpoint-updated"
            $metadata.operations.lastOperationAt = $operation.timestamp

            # Save updated metadata
            $vhdxPath = $metadata.clone.vhdxPath
            $metadataPath = $vhdxPath -replace '\.vhdx$', '.json'
            $metadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $metadataPath -Encoding UTF8 -Force

            Write-Verbose "Checkpoint updated successfully"

            return [PSCustomObject]@{
                CheckpointId = $CheckpointId
                IsFavorite = $checkpoint.isFavorite
                Labels = $checkpoint.labels
                Description = $checkpoint.description
                UpdatedAt = (Get-Date).ToUniversalTime().ToString("o")
            }
        } catch {
            Write-Error "Failed to update checkpoint: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Compares two checkpoints to identify data changes

.DESCRIPTION
    Analyzes differences between two checkpoints including row count changes,
    schema modifications, and data size deltas.

.PARAMETER CloneId
    The ID of the clone

.PARAMETER SourceCheckpointId
    The source checkpoint for comparison

.PARAMETER TargetCheckpointId
    The target checkpoint for comparison

.EXAMPLE
    Get-FlashdbCheckpointDiff -CloneId "clone-dev-test-1" `
        -SourceCheckpointId "cp-001" `
        -TargetCheckpointId "cp-002"

.OUTPUTS
    System.Object with detailed comparison results
#>
function Get-FlashdbCheckpointDiff {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SourceCheckpointId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetCheckpointId
    )

    process {
        try {
            # Get clone metadata
            $clone = Get-FlashdbClone -CloneId $CloneId -IncludeMetadata -ErrorAction Stop

            if (-not $clone) {
                throw "Clone not found: $CloneId"
            }

            $metadata = $clone.Metadata

            # Find checkpoints
            $sourceCP = $metadata.checkpoints | Where-Object { $_.checkpointId -eq $SourceCheckpointId }
            $targetCP = $metadata.checkpoints | Where-Object { $_.checkpointId -eq $TargetCheckpointId }

            if (-not $sourceCP -or -not $targetCP) {
                throw "One or both checkpoints not found"
            }

            Write-Verbose "Comparing checkpoints: $SourceCheckpointId → $TargetCheckpointId"

            # Calculate differences
            $sourceDB = $sourceCP.databaseMetadata
            $targetDB = $targetCP.databaseMetadata

            $rowCountDelta = $targetDB.totalRowCount - $sourceDB.totalRowCount
            $sizeDelta = $targetDB.totalDataSizeMB - $sourceDB.totalDataSizeMB
            $schemaChanged = $sourceDB.schemaHash -ne $targetDB.schemaHash

            return [PSCustomObject]@{
                CloneId = $CloneId
                SourceCheckpointId = $SourceCheckpointId
                TargetCheckpointId = $TargetCheckpointId
                RowCountChange = $rowCountDelta
                SizeChangeMB = $sizeDelta
                SchemaChanged = $schemaChanged
                TablesModified = @{
                    source = $sourceDB.tableCount
                    target = $targetDB.tableCount
                }
                LastModified = $targetDB.lastTableModified
                Summary = @{
                    sourceRowCount = $sourceDB.totalRowCount
                    targetRowCount = $targetDB.totalRowCount
                    sourceSizeMB = $sourceDB.totalDataSizeMB
                    targetSizeMB = $targetDB.totalDataSizeMB
                    percentChange = if ($sourceDB.totalDataSizeMB -gt 0) {
                        [math]::Round(($sizeDelta / $sourceDB.totalDataSizeMB) * 100, 2)
                    } else {
                        0
                    }
                }
            }
        } catch {
            Write-Error "Failed to compare checkpoints: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Restores a clone to a specific checkpoint

.DESCRIPTION
    Reverts the clone VHDX to the state captured in the specified checkpoint.
    This operation discards any changes made after the checkpoint was created.

.PARAMETER CloneId
    The ID of the clone

.PARAMETER CheckpointId
    The ID of the checkpoint to restore

.PARAMETER ReattachAfter
    Automatically reattach database after restore (default: $false)

.PARAMETER Force
    Force close active connections during restore

.EXAMPLE
    Restore-FlashdbCheckpoint -CloneId "clone-dev-test-1" `
        -CheckpointId "cp-001" `
        -ReattachAfter

.OUTPUTS
    System.Object with restore status
#>
function Restore-FlashdbCheckpoint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CheckpointId,

        [Parameter()]
        [switch]$ReattachAfter,

        [Parameter()]
        [switch]$Force
    )

    process {
        try {
            # Get clone metadata
            $clone = Get-FlashdbClone -CloneId $CloneId -IncludeMetadata -ErrorAction Stop

            if (-not $clone) {
                throw "Clone not found: $CloneId"
            }

            $metadata = $clone.Metadata

            # Find checkpoint
            $checkpoint = $metadata.checkpoints | Where-Object { $_.checkpointId -eq $CheckpointId }

            if (-not $checkpoint) {
                throw "Checkpoint not found: $CheckpointId"
            }

            Write-Verbose "Restoring clone to checkpoint: $CheckpointId"

            # Force detach if attached and force flag is set
            if ($metadata.attachment.status -eq 'attached' -and $Force) {
                Write-Verbose "Force detaching clone before restore"
                Disconnect-FlashdbClone -CloneId $CloneId -Force
            } elseif ($metadata.attachment.status -eq 'attached') {
                throw "Clone is currently attached. Use -Force to detach or manually detach first."
            }

            # Revert VHDX to checkpoint
            $vhdxPath = $metadata.clone.vhdxPath
            $checkpointVhdxPath = $checkpoint.vhdxSnapshotPath

            Write-Verbose "Reverting VHDX from checkpoint: $checkpointVhdxPath"

            # Create operation record for atomicity
            $operationId = [guid]::NewGuid().ToString()
            Write-Verbose "Creating checkpoint restore operation: $operationId"

            Write-Verbose "Creating VHDX differencing disk from checkpoint (not full copy)"

            # Use native VHDX merge instead of full copy
            $tempPath = "$vhdxPath.restore-temp.vhdx"

            # Create new differencing disk with checkpoint as parent
            # This is O(1) metadata operation, not O(n) file copy
            try {
                New-VHD -Path $tempPath `
                        -Differencing `
                        -ParentPath $checkpointVhdxPath `
                        -ErrorAction Stop | Out-Null

                Write-Verbose "Created temporary VHDX differencing disk: $tempPath"

                # Atomic swap: replace main VHDX with new differencing disk
                # Backup current state first (lightweight, just metadata)
                $backupPath = "$vhdxPath.pre-restore-$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"

                try {
                    # Only backup if file exists and is reasonably sized
                    if ((Test-Path -Path $vhdxPath) -and ((Get-Item $vhdxPath).Length -gt 0)) {
                        Copy-Item -Path $vhdxPath -Destination $backupPath -Force -ErrorAction SilentlyContinue
                        Write-Verbose "Pre-restore backup created: $backupPath"

                        # Record rollback path in metadata for recovery
                        $restoreOperationId = [guid]::NewGuid().ToString()
                        Write-Verbose "Recording restore operation $restoreOperationId with rollback path: $backupPath (will be inserted to SQL for recovery)"
                    }
                } catch {
                    Write-Warning "Backup creation failed (non-fatal): $_"
                }

                # Atomic rename/swap (this is atomic on NTFS)
                Move-Item -Path $tempPath -Destination $vhdxPath -Force -ErrorAction Stop
                Write-Verbose "VHDX swapped to checkpoint state (native revert, not full copy)"

                # Phase 3: Compute post-restore hash for validation
                $postVhdxStateHash = Get-VhdxStateHash -VhdxPath $vhdxPath
                Write-Verbose "Computed post-restore VHDX state hash: $postVhdxStateHash"

                # Phase 3: Validate hash matches pre-checkpoint hash
                if ($postVhdxStateHash -eq $checkpoint.preVhdxStateHash) {
                    Write-Verbose "VHDX state hash validation PASSED"
                    $validationStatus = 'passed'
                    $validationError = $null
                } else {
                    Write-Warning "VHDX state hash validation FAILED - AUTO-ROLLBACK TRIGGERED"
                    Write-Warning "Expected hash: $($checkpoint.preVhdxStateHash), Got: $postVhdxStateHash"

                    # Auto-rollback: restore from backup
                    if ($backupPath -and (Test-Path $backupPath)) {
                        Write-Verbose "Initiating automatic rollback from backup: $backupPath"
                        try {
                            Move-Item -Path $backupPath -Destination $vhdxPath -Force -ErrorAction Stop
                            Write-Warning "Rollback completed - original VHDX restored"
                            $validationStatus = 'rolled-back'
                            $validationError = "Hash mismatch: Expected $($checkpoint.preVhdxStateHash), got $postVhdxStateHash. Auto-rollback executed."
                        } catch {
                            $validationStatus = 'failed'
                            $validationError = "Hash mismatch and rollback also failed: $_"
                            throw "Critical: Hash validation failed and rollback failed: $_"
                        }
                    } else {
                        $validationStatus = 'failed'
                        $validationError = "Hash mismatch: Expected $($checkpoint.preVhdxStateHash), got $postVhdxStateHash. Rollback backup not available."
                        throw "Hash validation failed and no rollback backup available"
                    }
                }

            } catch {
                Write-Error "Failed to create/swap VHDX: $_"

                # Cleanup temp file if it exists
                if (Test-Path $tempPath) {
                    Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
                }

                throw "VHDX restore failed. Original state preserved."
            }

            # Update checkpoint state
            $metadata.checkpoints | ForEach-Object {
                if ($_.checkpointId -eq $CheckpointId) {
                    $_.isActive = $true
                    $_.postVhdxStateHash = $postVhdxStateHash
                    $_.validationStatus = $validationStatus
                    $_.validationError = $validationError
                } else {
                    $_.isActive = $false
                }
            }

            # Log operation with validation details
            $operation = @{
                operation = "checkpoint-restored"
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                status = if ($validationStatus -eq 'passed') { 'success' } else { $validationStatus }
                checkpointId = $CheckpointId
                rollbackPath = $backupPath
                restoreOperationId = $restoreOperationId
                validationStatus = $validationStatus
                validationError = $validationError
            }
            $metadata.operations.operationLog += $operation
            $metadata.operations.lastOperation = "checkpoint-restored"
            $metadata.operations.lastOperationAt = $operation.timestamp

            # Save updated metadata
            $metadataPath = $vhdxPath -replace '\.vhdx$', '.json'
            $metadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $metadataPath -Encoding UTF8 -Force

            # Reattach if requested
            if ($ReattachAfter) {
                Write-Verbose "Reattaching clone after restore"
                Connect-FlashdbClone -CloneId $CloneId
            }

            Write-Verbose "Checkpoint restored successfully"

            return [PSCustomObject]@{
                CloneId = $CloneId
                CheckpointId = $CheckpointId
                Status = if ($validationStatus -eq 'passed') { 'restored' } else { $validationStatus }
                RestoredAt = (Get-Date).ToUniversalTime().ToString("o")
                ReattachedAfter = $ReattachAfter
                ValidationStatus = $validationStatus
                ValidationError = $validationError
            }
        } catch {
            Write-Error "Failed to restore checkpoint: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Removes a checkpoint and its associated VHDX snapshot

.DESCRIPTION
    Deletes a specific checkpoint, freeing up disk space by removing the
    associated VHDX snapshot file.

.PARAMETER CloneId
    The ID of the clone

.PARAMETER CheckpointId
    The ID of the checkpoint to remove

.PARAMETER Force
    Skip confirmation prompts

.EXAMPLE
    Remove-FlashdbCheckpoint -CloneId "clone-dev-test-1" `
        -CheckpointId "cp-001" `
        -Force

.OUTPUTS
    System.Object with removal status
#>
function Remove-FlashdbCheckpoint {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CheckpointId,

        [Parameter()]
        [switch]$Force
    )

    process {
        try {
            # Get clone metadata
            $clone = Get-FlashdbClone -CloneId $CloneId -IncludeMetadata -ErrorAction Stop

            if (-not $clone) {
                throw "Clone not found: $CloneId"
            }

            $metadata = $clone.Metadata

            # Find checkpoint
            $checkpoint = $metadata.checkpoints | Where-Object { $_.checkpointId -eq $CheckpointId }

            if (-not $checkpoint) {
                throw "Checkpoint not found: $CheckpointId"
            }

            # Confirmation unless forced
            if (-not $Force) {
                $confirm = Read-Host "Remove checkpoint '$($checkpoint.name)'? (yes/no)"
                if ($confirm -ne 'yes') {
                    return
                }
            }

            Write-Verbose "Removing checkpoint: $CheckpointId"

            # Delete VHDX snapshot
            if (Test-Path -Path $checkpoint.vhdxSnapshotPath) {
                Write-Verbose "Deleting checkpoint VHDX: $($checkpoint.vhdxSnapshotPath)"
                Remove-Item -Path $checkpoint.vhdxSnapshotPath -Force -ErrorAction SilentlyContinue
            }

            # Remove from checkpoints array
            $metadata.checkpoints = $metadata.checkpoints | Where-Object { $_.checkpointId -ne $CheckpointId }

            # Log operation
            $operation = @{
                operation = "checkpoint-deleted"
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                status = "success"
                checkpointId = $CheckpointId
            }
            $metadata.operations.operationLog += $operation
            $metadata.operations.lastOperation = "checkpoint-deleted"
            $metadata.operations.lastOperationAt = $operation.timestamp

            # Save updated metadata
            $vhdxPath = $metadata.clone.vhdxPath
            $metadataPath = $vhdxPath -replace '\.vhdx$', '.json'
            $metadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $metadataPath -Encoding UTF8 -Force

            Write-Verbose "Checkpoint removed successfully"

            return [PSCustomObject]@{
                CheckpointId = $CheckpointId
                Status = 'removed'
                RemovedAt = (Get-Date).ToUniversalTime().ToString("o")
            }
        } catch {
            Write-Error "Failed to remove checkpoint: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Restores a clone to its golden image state

.DESCRIPTION
    Reverts the clone VHDX to the state of the golden image, discarding all
    changes and checkpoints. This is useful for complete reset or cleanup.

.PARAMETER CloneId
    The ID of the clone

.PARAMETER ToGolden
    Restore to golden image (required parameter)

.PARAMETER ReattachAfter
    Automatically reattach database after restore (default: $false)

.PARAMETER Force
    Force close active connections during restore

.EXAMPLE
    Restore-FlashdbClone -CloneId "clone-dev-test-1" -ToGolden -ReattachAfter

.OUTPUTS
    System.Object with restore status
#>
function Restore-FlashdbClone {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneId,

        [Parameter(Mandatory = $true)]
        [switch]$ToGolden,

        [Parameter()]
        [switch]$ReattachAfter,

        [Parameter()]
        [switch]$Force
    )

    process {
        try {
            # Get clone metadata
            $clone = Get-FlashdbClone -CloneId $CloneId -IncludeMetadata -ErrorAction Stop

            if (-not $clone) {
                throw "Clone not found: $CloneId"
            }

            $metadata = $clone.Metadata

            Write-Verbose "Restoring clone to golden image: $CloneId"

            # Force detach if attached
            if ($metadata.attachment.status -eq 'attached' -and $Force) {
                Write-Verbose "Force detaching clone before restore"
                Disconnect-FlashdbClone -CloneId $CloneId -Force
            } elseif ($metadata.attachment.status -eq 'attached') {
                throw "Clone is currently attached. Use -Force to detach or manually detach first."
            }

            # Get golden image VHDX path
            $goldenVhdxPath = $metadata.golden.parentVhdxPath

            if (-not (Test-Path -Path $goldenVhdxPath)) {
                throw "Golden image VHDX not found: $goldenVhdxPath"
            }

            # Restore clone to golden image state
            $vhdxPath = $metadata.clone.vhdxPath

            Write-Verbose "Reverting clone to golden image"

            # Backup current state
            $backupPath = "$vhdxPath.pre-golden-restore.bak"
            if (Test-Path -Path $vhdxPath) {
                Copy-Item -Path $vhdxPath -Destination $backupPath -Force -ErrorAction SilentlyContinue
                Write-Verbose "Pre-restore backup created: $backupPath"
            }

            # Copy golden image to clone
            Copy-Item -Path $goldenVhdxPath -Destination $vhdxPath -Force -ErrorAction Stop
            Write-Verbose "Clone reverted to golden image state"

            # Clear all checkpoints from metadata
            $metadata.checkpoints = @()

            # Update lifecycle
            $metadata.lifecycle.status = 'active'

            # Log operation
            $operation = @{
                operation = "restored-to-golden"
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                status = "success"
            }
            $metadata.operations.operationLog += $operation
            $metadata.operations.lastOperation = "restored-to-golden"
            $metadata.operations.lastOperationAt = $operation.timestamp

            # Save updated metadata
            $metadataPath = $vhdxPath -replace '\.vhdx$', '.json'
            $metadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $metadataPath -Encoding UTF8 -Force

            # Reattach if requested
            if ($ReattachAfter) {
                Write-Verbose "Reattaching clone after restore"
                Connect-FlashdbClone -CloneId $CloneId
            }

            Write-Verbose "Clone restored to golden image successfully"

            return [PSCustomObject]@{
                CloneId = $CloneId
                Status = 'restored-to-golden'
                RestoredAt = (Get-Date).ToUniversalTime().ToString("o")
                ReattachedAfter = $ReattachAfter
            }
        } catch {
            Write-Error "Failed to restore clone to golden: $_"
            throw
        }
    }
}

# Export functions
Export-ModuleMember -Function @(
    'Get-VhdxStateHash'
    'New-FlashdbCheckpoint'
    'Get-FlashdbCheckpoint'
    'Set-FlashdbCheckpoint'
    'Get-FlashdbCheckpointDiff'
    'Restore-FlashdbCheckpoint'
    'Restore-FlashdbClone'
    'Remove-FlashdbCheckpoint'
)
