<#
.SYNOPSIS
Provider Contract Definition for FlashDB

.DESCRIPTION
Defines the interface that all provider implementations must conform to.
This isolates the API/GUI layer from low-level SQL/VHD implementation details.

Phase 1, Step 2: Provider Boundary And Contract Tests

.NOTES
All provider implementations must expose these cmdlets with exact signatures and response types.
Current provider: SQL Server with PowerShell
#>

# ============================================================================
# Golden Image Operations
# ============================================================================

<#
.SYNOPSIS
Create a new golden image

.PARAMETER Name
Name of the golden image

.PARAMETER Version
Version identifier

.PARAMETER Method
Creation method: BackupRestore, ReplicaBackup, or TableByTableCopy

.PARAMETER OutputPath
Path where the image files will be stored

.PARAMETER BackupFile
Path to backup file (required for BackupRestore)

.PARAMETER SourceConnection
Connection string to source database (required for ReplicaBackup/TableByTableCopy)

.OUTPUTS
[PSObject] GoldenImage metadata object with properties:
  - Id: Unique identifier
  - Name: Image name
  - Version: Version string
  - Method: Creation method used
  - OutputPath: Storage path
  - Status: Creating|Ready|Failed|Deleting
  - CreatedAt: ISO8601 timestamp
  - FileSize: Size in bytes (optional)
  - RowCount: Total rows (optional)
  - TableCount: Total tables (optional)
  - VerificationState: Pending|Verified|Failed (optional)
#>
function New-FlashdbGoldenImage {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Version,

    [Parameter(Mandatory = $true)]
    [ValidateSet('BackupRestore', 'ReplicaBackup', 'TableByTableCopy')]
    [string]$Method,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [Parameter(Mandatory = $false)]
    [string]$BackupFile,

    [Parameter(Mandatory = $false)]
    [string]$SourceConnection,

    [Parameter(Mandatory = $false)]
    [string]$DatabaseType,

    [Parameter(Mandatory = $false)]
    [string]$DatabaseName,

    [Parameter(Mandatory = $false)]
    [string]$SourceDatabase,

    [Parameter(Mandatory = $false)]
    [string]$Driver,

    [Parameter(Mandatory = $false)]
    [string]$AuthenticationMode,

    [Parameter(Mandatory = $false)]
    [string[]]$SelectedTables
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

<#
.SYNOPSIS
Get a golden image by ID

.PARAMETER Id
Golden image ID (optional; returns all if not specified)

.OUTPUTS
[PSObject] or [PSObject[]] Golden image metadata
#>
function Get-FlashdbGoldenImage {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $false)]
    [string]$Id
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

<#
.SYNOPSIS
Update golden image metadata

.PARAMETER GoldenImageId
Golden image ID

.PARAMETER Name
New name (optional)

.PARAMETER Version
New version (optional)

.PARAMETER Status
New status: Creating|Ready|Failed|Deleting (optional)

.OUTPUTS
[PSObject] Updated golden image metadata
#>
function Update-FlashdbGoldenImage {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$GoldenImageId,

    [Parameter(Mandatory = $false)]
    [string]$Name,

    [Parameter(Mandatory = $false)]
    [string]$Version,

    [Parameter(Mandatory = $false)]
    [string]$Status
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

<#
.SYNOPSIS
Delete a golden image

.PARAMETER GoldenImageId
Golden image ID to delete
#>
function Remove-FlashdbGoldenImage {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$GoldenImageId
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

# ============================================================================
# Clone Operations
# ============================================================================

<#
.SYNOPSIS
Create a new clone from a golden image

.PARAMETER GoldenImageId
Parent golden image ID

.PARAMETER CloneName
Name for the new clone

.PARAMETER InstancePath
SQL Server instance path

.PARAMETER StoragePath
Path where clone VHD files will be stored

.PARAMETER AttachAfterCreate
Whether to attach to SQL after creation

.OUTPUTS
[PSObject] Clone metadata with properties:
  - Id: Unique identifier
  - CloneName: Clone name
  - GoldenImageId: Parent image ID
  - Status: Creating|Attached|Detached|Failed|Deleting
  - InstancePath: Instance path
  - StoragePath: Storage path
  - VhdxPath: Path to VHDX file (optional)
  - MountPath: Mount point (optional)
  - SqlInstanceName: Instance name (optional)
  - DatabaseName: Database name (optional)
  - Host: Host name (optional)
  - CreatedAt: ISO8601 timestamp
#>
function New-FlashdbClone {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$GoldenImageId,

    [Parameter(Mandatory = $true)]
    [string]$CloneName,

    [Parameter(Mandatory = $true)]
    [string]$InstancePath,

    [Parameter(Mandatory = $true)]
    [string]$StoragePath,

    [Parameter(Mandatory = $false)]
    [string]$DatabaseType,

    [Parameter(Mandatory = $false)]
    [string]$DatabaseName,

    [Parameter(Mandatory = $false)]
    [bool]$CompressionEnabled,

    [Parameter(Mandatory = $false)]
    [bool]$AttachAfterCreate
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

<#
.SYNOPSIS
Get a clone by ID

.PARAMETER CloneId
Clone ID (optional; returns all if not specified)

.OUTPUTS
[PSObject] or [PSObject[]] Clone metadata
#>
function Get-FlashdbClone {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $false)]
    [string]$CloneId
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

<#
.SYNOPSIS
Attach a clone to SQL Server

.PARAMETER CloneId
Clone ID

.PARAMETER InstancePath
SQL Server instance path

.OUTPUTS
[PSObject] Updated clone metadata
#>
function Connect-FlashdbClone {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CloneId,

    [Parameter(Mandatory = $true)]
    [string]$InstancePath
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

<#
.SYNOPSIS
Detach a clone from SQL Server

.PARAMETER CloneId
Clone ID
#>
function Disconnect-FlashdbClone {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CloneId
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

<#
.SYNOPSIS
Delete a clone

.PARAMETER CloneId
Clone ID

.PARAMETER DeleteVhdx
Whether to delete VHDX files as well
#>
function Remove-FlashdbClone {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CloneId,

    [Parameter(Mandatory = $false)]
    [bool]$DeleteVhdx
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

# ============================================================================
# Checkpoint Operations
# ============================================================================

<#
.SYNOPSIS
Create a checkpoint for a clone

.PARAMETER CloneId
Clone ID

.PARAMETER CheckpointName
Name for the checkpoint

.PARAMETER Phase
Phase identifier (manual, automatic, etc.)

.PARAMETER Description
Optional description

.OUTPUTS
[PSObject] Checkpoint metadata with properties:
  - Id: Unique identifier
  - CloneId: Parent clone ID
  - CheckpointName: Checkpoint name
  - Phase: Phase identifier
  - Status: Creating|Ready|Restoring|Failed|Deleting
  - IsPinned: Whether checkpoint is pinned
  - Labels: Array of labels
  - IsFavorite: Favorite flag
  - CreatedAt: ISO8601 timestamp
#>
function New-FlashdbCheckpoint {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CloneId,

    [Parameter(Mandatory = $true)]
    [string]$CheckpointName,

    [Parameter(Mandatory = $false)]
    [string]$Phase = 'manual',

    [Parameter(Mandatory = $false)]
    [string]$Description,

    [Parameter(Mandatory = $false)]
    [bool]$Force
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

<#
.SYNOPSIS
Get a checkpoint

.PARAMETER CloneId
Clone ID

.PARAMETER CheckpointId
Checkpoint ID (optional; returns all for clone if not specified)

.OUTPUTS
[PSObject] or [PSObject[]] Checkpoint metadata
#>
function Get-FlashdbCheckpoint {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CloneId,

    [Parameter(Mandatory = $false)]
    [string]$CheckpointId
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

<#
.SYNOPSIS
Restore a checkpoint

.PARAMETER CloneId
Clone ID

.PARAMETER CheckpointId
Checkpoint ID

.PARAMETER ReattachAfter
Whether to reattach to SQL after restore

.PARAMETER Force
Force restore even if validations fail
#>
function Restore-FlashdbCheckpoint {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CloneId,

    [Parameter(Mandatory = $true)]
    [string]$CheckpointId,

    [Parameter(Mandatory = $false)]
    [bool]$ReattachAfter = $true,

    [Parameter(Mandatory = $false)]
    [bool]$Force
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

<#
.SYNOPSIS
Update checkpoint metadata

.PARAMETER CloneId
Clone ID

.PARAMETER CheckpointId
Checkpoint ID

.PARAMETER IsFavorite
Favorite flag

.PARAMETER Labels
Array of labels

.OUTPUTS
[PSObject] Updated checkpoint metadata
#>
function Set-FlashdbCheckpoint {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CloneId,

    [Parameter(Mandatory = $true)]
    [string]$CheckpointId,

    [Parameter(Mandatory = $false)]
    [bool]$IsFavorite,

    [Parameter(Mandatory = $false)]
    [string[]]$Labels
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

<#
.SYNOPSIS
Delete a checkpoint

.PARAMETER CloneId
Clone ID

.PARAMETER CheckpointId
Checkpoint ID

.PARAMETER CascadeDelete
Whether to delete dependent checkpoints

.PARAMETER Force
Force delete without validation
#>
function Remove-FlashdbCheckpoint {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CloneId,

    [Parameter(Mandatory = $true)]
    [string]$CheckpointId,

    [Parameter(Mandatory = $false)]
    [bool]$CascadeDelete,

    [Parameter(Mandatory = $false)]
    [bool]$Force
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

# ============================================================================
# Validation Operations
# ============================================================================

<#
.SYNOPSIS
Validate clone health

.PARAMETER CloneId
Clone ID

.OUTPUTS
[PSObject] Validation result with properties:
  - IsHealthy: Boolean health status
  - Findings: Array of ValidationFinding objects
  - Details: Hash table with detailed info

.NOTES
Checks:
- Clone metadata validity
- VHD path and parent image
- Mount state
- SQL file presence
- Database attach state
#>
function Test-FlashdbCloneHealth {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CloneId
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

# ============================================================================
# Repair Operations
# ============================================================================

<#
.SYNOPSIS
Repair a clone (dry-run capable)

.PARAMETER CloneId
Clone ID

.PARAMETER DryRun
If $true, report actions without executing them

.OUTPUTS
[PSObject] RepairAttempt metadata with properties:
  - Id: Repair attempt ID
  - CloneId: Clone ID
  - ValidationFindings: Array of findings
  - AttemptedActions: Array of RepairAction objects
  - Result: Success|Partial|Failed|Skipped
  - ResultMessage: Human-readable result
  - StartedAt: ISO8601 timestamp
  - CompletedAt: ISO8601 timestamp (optional)

.NOTES
Possible repair actions:
- RemountVhd: Remount missing VHD
- DetachDatabase: Detach stale SQL database
- AttachDatabase: Attach database from clone files
- UpdateMetadata: Update clone metadata and status
#>
function Repair-FlashdbClone {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CloneId,

    [Parameter(Mandatory = $false)]
    [bool]$DryRun
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

# ============================================================================
# Metrics Operations (Read-only for contracts)
# ============================================================================

<#
.SYNOPSIS
Get metrics overview

.OUTPUTS
[PSObject] Metrics with properties:
  - totalClonesCreated
  - totalStorageSavedGB
  - avgCloneCreationTimeSeconds
  - operationSuccessRatePercent
  - operationsLast24h
  - activeClonesCount
#>
function Get-FlashdbMetrics {
  [CmdletBinding()]
  param()

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}

# ============================================================================
# Schema Exploration (for UI support)
# ============================================================================

<#
.SYNOPSIS
Explore source database schema

.PARAMETER SourceConnection
Connection string to source database

.PARAMETER DatabaseName
Database name (optional)

.PARAMETER SourceDatabase
Alternative database name parameter (optional)

.OUTPUTS
[PSObject] Database schema information
#>
function Get-FlashdbDatabaseSchema {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceConnection,

    [Parameter(Mandatory = $false)]
    [string]$DatabaseName,

    [Parameter(Mandatory = $false)]
    [string]$SourceDatabase
  )

  # IMPLEMENTATION: Provider-specific logic here
  throw 'Not implemented by this provider'
}
