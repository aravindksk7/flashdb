<#
.SYNOPSIS
    Clone State Management module for FlashDB
    Implements state machine and lifecycle tracking for database clones

.DESCRIPTION
    This module handles clone lifecycle state management including:
    - State transitions (created → attached → detached → expired)
    - State validation and enforcement
    - Automatic state recovery
    - State persistence and synchronization
    - Orphan detection and cleanup
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Define valid clone states
enum CloneState {
    Created
    Attached
    Detached
    Expired
    Error
}

<#
.SYNOPSIS
    Gets the current state of a clone

.DESCRIPTION
    Retrieves and validates the current state of a clone based on its metadata.
    Performs consistency checks between VHDX file and metadata.

.PARAMETER CloneId
    The ID of the clone

.PARAMETER IncludeValidation
    Perform consistency validation (default: $true)

.EXAMPLE
    $state = Get-FlashdbCloneState -CloneId "clone-dev-test-1"

.OUTPUTS
    System.Object with state information
#>
function Get-FlashdbCloneState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneId,

        [Parameter()]
        [bool]$IncludeValidation = $true
    )

    process {
        try {
            Write-Verbose "Getting clone state: $CloneId"

            # Get clone metadata
            $clone = Get-FlashdbClone -CloneId $CloneId -IncludeMetadata -ErrorAction Stop

            if (-not $clone) {
                return [PSCustomObject]@{
                    CloneId = $CloneId
                    State = 'NotFound'
                    IsValid = $false
                    Errors = @("Clone not found")
                }
            }

            $metadata = $clone.Metadata
            $state = $metadata.lifecycle.status

            # Validate state if requested
            $validationErrors = @()
            if ($IncludeValidation) {
                $validationErrors = Test-CloneStateValidity -CloneId $CloneId -Metadata $metadata
            }

            return [PSCustomObject]@{
                CloneId = $CloneId
                CurrentState = $state
                AttachmentStatus = $metadata.attachment.status
                LifecycleStatus = $metadata.lifecycle.status
                CreatedAt = $metadata.clone.createdAt
                LastOperation = $metadata.operations.lastOperation
                CheckpointCount = $metadata.checkpoints.Count
                IsValid = $validationErrors.Count -eq 0
                Errors = $validationErrors
                StateHistory = Get-StateHistory -Metadata $metadata
            }
        } catch {
            Write-Error "Failed to get clone state: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Sets the state of a clone with validation

.DESCRIPTION
    Transitions a clone to a new state with validation of allowed transitions.
    Enforces state machine rules (e.g., cannot go from Expired to Active).

.PARAMETER CloneId
    The ID of the clone

.PARAMETER NewState
    Target state for transition

.PARAMETER Force
    Force state transition even if invalid (use cautiously)

.EXAMPLE
    Set-FlashdbCloneState -CloneId "clone-dev-test-1" -NewState "Detached"

.OUTPUTS
    System.Object with state transition result
#>
function Set-FlashdbCloneState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneId,

        [Parameter(Mandatory = $true)]
        [ValidateSet('Created', 'Attached', 'Detached', 'Expired', 'Error')]
        [string]$NewState,

        [Parameter()]
        [switch]$Force
    )

    process {
        try {
            # Get current state
            $currentStateObj = Get-FlashdbCloneState -CloneId $CloneId -IncludeValidation $true

            if (-not $currentStateObj) {
                throw "Failed to get current state for clone: $CloneId"
            }

            $currentState = $currentStateObj.CurrentState

            Write-Verbose "Transitioning clone state: $currentState → $NewState"

            # Validate state transition
            if (-not (Test-ValidStateTransition -FromState $currentState -ToState $NewState)) {
                if (-not $Force) {
                    throw "Invalid state transition: $currentState → $NewState"
                }
                Write-Warning "Forcing invalid state transition: $currentState → $NewState"
            }

            # Get clone metadata
            $clone = Get-FlashdbClone -CloneId $CloneId -IncludeMetadata -ErrorAction Stop
            $metadata = $clone.Metadata

            # Update state
            $metadata.lifecycle.status = $NewState

            # Handle state-specific logic
            switch ($NewState) {
                'Expired' {
                    $metadata.lifecycle.expiresAt = (Get-Date).ToUniversalTime().ToString("o")
                }
                'Error' {
                    Write-Warning "Clone entering error state: $CloneId"
                }
            }

            # Log state transition
            $operation = @{
                operation = "state-changed"
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                status = "success"
                fromState = $currentState
                toState = $NewState
            }
            $metadata.operations.operationLog += $operation
            $metadata.operations.lastOperation = "state-changed"
            $metadata.operations.lastOperationAt = $operation.timestamp

            # Save metadata
            $vhdxPath = $metadata.clone.vhdxPath
            $metadataPath = $vhdxPath -replace '\.vhdx$', '.json'
            $metadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $metadataPath -Encoding UTF8 -Force

            Write-Verbose "State transition completed successfully"

            return [PSCustomObject]@{
                CloneId = $CloneId
                FromState = $currentState
                ToState = $NewState
                TransitionAt = (Get-Date).ToUniversalTime().ToString("o")
                Success = $true
            }
        } catch {
            Write-Error "Failed to set clone state: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Validates a clone state for consistency

.DESCRIPTION
    Checks that a clone's state is internally consistent:
    - Metadata file matches VHDX file existence
    - Attachment status aligns with actual database attachment
    - Expiration policies are enforced
    - No orphaned checkpoints

.PARAMETER CloneId
    The ID of the clone

.PARAMETER AutoRepair
    Automatically fix minor inconsistencies (default: $false)

.EXAMPLE
    Test-FlashdbCloneState -CloneId "clone-dev-test-1" -AutoRepair

.OUTPUTS
    System.Object with validation results
#>
function Test-FlashdbCloneState {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneId,

        [Parameter()]
        [switch]$AutoRepair
    )

    process {
        try {
            Write-Verbose "Validating clone state: $CloneId"

            $clone = Get-FlashdbClone -CloneId $CloneId -IncludeMetadata -ErrorAction Stop

            if (-not $clone) {
                throw "Clone not found: $CloneId"
            }

            $metadata = $clone.Metadata
            $errors = @()
            $warnings = @()

            # Check VHDX file existence
            if (-not (Test-Path -Path $metadata.clone.vhdxPath)) {
                $errors += "VHDX file not found: $($metadata.clone.vhdxPath)"
            }

            # Check metadata file
            $metadataPath = $metadata.clone.vhdxPath -replace '\.vhdx$', '.json'
            if (-not (Test-Path -Path $metadataPath)) {
                $errors += "Metadata file not found: $metadataPath"
            }

            # Validate checkpoint VHDX files
            foreach ($checkpoint in $metadata.checkpoints) {
                if (-not (Test-Path -Path $checkpoint.vhdxSnapshotPath)) {
                    $warnings += "Checkpoint VHDX not found: $($checkpoint.checkpointId)"
                    if ($AutoRepair) {
                        # Remove checkpoint reference if VHDX missing
                        $metadata.checkpoints = $metadata.checkpoints |
                            Where-Object { $_.checkpointId -ne $checkpoint.checkpointId }
                    }
                }
            }

            # Check expiration
            if ($metadata.lifecycle.expiresAt) {
                $expiresAt = [DateTime]::Parse($metadata.lifecycle.expiresAt)
                if ($expiresAt -lt (Get-Date).ToUniversalTime()) {
                    $warnings += "Clone has expired"
                }
            }

            # Validate state transitions in operation log
            $invalidTransitions = Test-OperationLogValidity -OperationLog $metadata.operations.operationLog
            if ($invalidTransitions.Count -gt 0) {
                $warnings += $invalidTransitions
            }

            # Auto-repair if requested and errors can be fixed
            if ($AutoRepair -and $errors.Count -gt 0) {
                # Repair logic here - save metadata with fixes
                Save-FlashdbMetadata -MetadataPath $metadataPath -Metadata $metadata | Out-Null
            }

            return [PSCustomObject]@{
                CloneId = $CloneId
                IsValid = $errors.Count -eq 0
                Errors = $errors
                Warnings = $warnings
                ValidatedAt = (Get-Date).ToUniversalTime().ToString("o")
            }
        } catch {
            Write-Error "Failed to validate clone state: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Finds and manages orphaned clones

.DESCRIPTION
    Identifies clones with missing VHDX files, stale metadata, or inconsistent state.
    Provides cleanup options for orphaned resources.

.PARAMETER StoragePath
    Directory containing clone storage

.PARAMETER RemoveOrphans
    Automatically remove orphaned metadata (default: $false)

.EXAMPLE
    Find-FlashdbOrphanedClones -StoragePath "D:\CloneStorage" -RemoveOrphans

.OUTPUTS
    System.Object array with orphaned clone information
#>
function Find-FlashdbOrphanedClones {
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$StoragePath,

        [Parameter()]
        [switch]$RemoveOrphans
    )

    process {
        try {
            if (-not $StoragePath) {
                $StoragePath = (Get-FlashdbConfig).defaultCloneStoragePath
            }

            if (-not (Test-Path -Path $StoragePath -PathType Container)) {
                Write-Warning "Storage path not found: $StoragePath"
                return
            }

            Write-Verbose "Scanning for orphaned clones in: $StoragePath"

            $orphans = @()

            # Find all metadata files
            $metadataFiles = Get-ChildItem -Path $StoragePath -Filter "*.json" -ErrorAction SilentlyContinue

            foreach ($metadataFile in $metadataFiles) {
                $metadata = Get-FlashdbMetadata -MetadataPath $metadataFile.FullName -Validate $false

                if (-not $metadata) {
                    $orphans += [PSCustomObject]@{
                        MetadataPath = $metadataFile.FullName
                        Reason = "Corrupted metadata file"
                        CreatedAt = $metadataFile.CreationTime
                        Size = $metadataFile.Length
                    }
                    continue
                }

                # Check if VHDX file exists
                if (-not (Test-Path -Path $metadata.clone.vhdxPath)) {
                    $orphans += [PSCustomObject]@{
                        CloneId = $metadata.clone.id
                        MetadataPath = $metadataFile.FullName
                        Reason = "VHDX file missing"
                        CreatedAt = [DateTime]::Parse($metadata.clone.createdAt)
                        Size = 0
                    }

                    if ($RemoveOrphans) {
                        Write-Verbose "Removing orphaned metadata: $($metadataFile.FullName)"
                        Remove-Item -Path $metadataFile.FullName -Force -ErrorAction SilentlyContinue
                    }
                }
            }

            # Find VHDX files without metadata
            $vhdxFiles = Get-ChildItem -Path $StoragePath -Filter "*.vhdx" -ErrorAction SilentlyContinue

            foreach ($vhdxFile in $vhdxFiles) {
                $metadataPath = $vhdxFile.FullName -replace '\.vhdx$', '.json'
                if (-not (Test-Path -Path $metadataPath)) {
                    $orphans += [PSCustomObject]@{
                        VhdxPath = $vhdxFile.FullName
                        Reason = "Metadata file missing"
                        CreatedAt = $vhdxFile.CreationTime
                        Size = [math]::Round($vhdxFile.Length / 1MB, 2)
                    }

                    if ($RemoveOrphans) {
                        Write-Verbose "Removing orphaned VHDX: $($vhdxFile.FullName)"
                        Remove-Item -Path $vhdxFile.FullName -Force -ErrorAction SilentlyContinue
                    }
                }
            }

            return $orphans
        } catch {
            Write-Error "Failed to find orphaned clones: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Gets state machine transition rules

.DESCRIPTION
    Returns the defined valid state transitions for the clone state machine.

.EXAMPLE
    Get-FlashdbStateTransitionRules

.OUTPUTS
    System.Object with transition matrix
#>
function Get-FlashdbStateTransitionRules {
    [CmdletBinding()]
    param()

    process {
        return [PSCustomObject]@{
            Transitions = @{
                'Created' = @('Attached', 'Error', 'Expired')
                'Attached' = @('Detached', 'Error', 'Expired')
                'Detached' = @('Attached', 'Error', 'Expired')
                'Expired' = @('Error')  # Expired is terminal except for error
                'Error' = @()  # Error is terminal
            }
            Description = @{
                'Created' = 'Clone created but not yet attached'
                'Attached' = 'Clone VHDX mounted and database attached to instance'
                'Detached' = 'Clone database detached from instance, VHDX unmounted'
                'Expired' = 'Clone has expired per retention policy'
                'Error' = 'Clone in error state, requires manual recovery'
            }
            DefaultTimeout = @{
                'Created' = 3600  # 1 hour
                'Attached' = $null  # No auto-timeout
                'Detached' = $null
                'Expired' = 2592000  # 30 days before cleanup
            }
        }
    }
}

# Helper function: Test valid state transition
function Test-ValidStateTransition {
    param(
        [string]$FromState,
        [string]$ToState
    )

    $rules = Get-FlashdbStateTransitionRules
    $allowedTransitions = $rules.Transitions[$FromState]

    return $null -ne $allowedTransitions -and $allowedTransitions -contains $ToState
}

# Helper function: Test clone state validity
function Test-CloneStateValidity {
    param(
        [string]$CloneId,
        [PSObject]$Metadata
    )

    $errors = @()

    # Verify state consistency
    if ($Metadata.attachment.status -eq 'attached' -and $Metadata.lifecycle.status -eq 'expired') {
        $errors += "Invalid: Clone marked attached but lifecycle is expired"
    }

    if ($Metadata.attachment.attachedAt -and $Metadata.attachment.detachedAt) {
        $attachTime = [DateTime]::Parse($Metadata.attachment.attachedAt)
        $detachTime = [DateTime]::Parse($Metadata.attachment.detachedAt)
        if ($detachTime -lt $attachTime) {
            $errors += "Invalid: Detach time before attach time"
        }
    }

    return $errors
}

# Helper function: Get state history from operation log
function Get-StateHistory {
    param([PSObject]$Metadata)

    $stateChanges = $Metadata.operations.operationLog |
        Where-Object { $_.operation -eq 'state-changed' } |
        Select-Object -Property @{n='FromState'; e={$_.fromState}},
                               @{n='ToState'; e={$_.toState}},
                               @{n='Timestamp'; e={$_.timestamp}}

    return $stateChanges
}

# Helper function: Test operation log validity
function Test-OperationLogValidity {
    param([PSObject[]]$OperationLog)

    $warnings = @()

    # Check for long gaps in operations
    for ($i = 0; $i -lt $OperationLog.Count - 1; $i++) {
        $current = [DateTime]::Parse($OperationLog[$i].timestamp)
        $next = [DateTime]::Parse($OperationLog[$i + 1].timestamp)

        if ($next -lt $current) {
            $warnings += "Operations out of chronological order at index $i"
        }
    }

    return $warnings
}

# Export functions
Export-ModuleMember -Function @(
    'Get-FlashdbCloneState'
    'Set-FlashdbCloneState'
    'Test-FlashdbCloneState'
    'Find-FlashdbOrphanedClones'
    'Get-FlashdbStateTransitionRules'
)
