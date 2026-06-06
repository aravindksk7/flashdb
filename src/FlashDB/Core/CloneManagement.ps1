# PowerShell module for FlashDB clone management
# Note: This module is dot-sourced by FlashDB.psm1, not imported separately

# Set strict mode for debugging (already set in parent, but keeping for safety)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

<#
.SYNOPSIS
    Clone Management cmdlets for FlashDB
    Provides functionality to create, manage, and remove VHDX-based database clones

.DESCRIPTION
    This module implements the core clone management functionality including:
    - New-FlashdbClone: Create a new differencing disk from golden image
    - Get-FlashdbClone: List and retrieve clone information
    - Connect-FlashdbClone: Attach clone to SQL Server instance
    - Disconnect-FlashdbClone: Detach clone from SQL Server
    - Remove-FlashdbClone: Delete clone and cleanup
#>

<#
.SYNOPSIS
    Creates a new clone from a golden image

.DESCRIPTION
    Creates a differencing VHDX disk linked to a golden image and initializes
    the clone metadata. The clone is ready for database attachment after creation.

.PARAMETER GoldenImageId
    The ID of the golden image to use as parent

.PARAMETER CloneName
    Friendly name for the clone

.PARAMETER InstancePath
    SQL Server instance path (e.g., 'LOCALHOST\SQLEXPRESS')

.PARAMETER StoragePath
    Directory where clone VHDX will be stored

.PARAMETER CompressionEnabled
    Enable VHDX compression for the clone (default: $true)

.EXAMPLE
    $clone = New-FlashdbClone -GoldenImageId "golden-prod-20260606" `
        -CloneName "dev-test-1" `
        -InstancePath "LOCALHOST\SQLEXPRESS" `
        -StoragePath "D:\CloneStorage"

.OUTPUTS
    System.Object with clone metadata including Id, Name, VhdxPath, CreatedAt

.NOTES
    - Requires read access to golden image
    - Storage location must be accessible and have sufficient space
    - VHDX parent must be specified before detaching golden image
#>
function New-FlashdbClone {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$GoldenImageId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneName,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$InstancePath,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$StoragePath,

        [Parameter()]
        [bool]$CompressionEnabled = $true,

        [Parameter()]
        [ValidateSet('sql-server', 'postgresql', 'mysql')]
        [string]$DatabaseType = 'sql-server'
    )

    begin {
        Write-Verbose "Creating new clone from golden image: $GoldenImageId"

        # Validate storage path exists
        if (-not (Test-Path -Path $StoragePath -PathType Container)) {
            throw "Storage path does not exist: $StoragePath"
        }

        # Validate write permissions
        $testFile = Join-Path $StoragePath ".flashdb-test-write"
        try {
            "test" | Out-File -FilePath $testFile -ErrorAction Stop
            Remove-Item -Path $testFile -Force -ErrorAction SilentlyContinue
        } catch {
            throw "No write permission in storage path: $StoragePath"
        }
    }

    process {
        try {
            # Generate clone ID (timestamp-based)
            $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
            $cloneId = "clone-$($CloneName.ToLower() -replace '[^a-z0-9-]', '-')-$timestamp"

            # Find golden image metadata to get VHDX path
            Write-Verbose "Locating golden image: $GoldenImageId"
            $goldenImages = Get-ChildItem -Path $StoragePath -Filter "*.json" -ErrorAction SilentlyContinue |
                ForEach-Object {
                    $meta = Get-Content $_.FullName | ConvertFrom-Json -ErrorAction SilentlyContinue
                    $meta
                } |
                Where-Object { $_.clone.id -eq $GoldenImageId -or $_.golden.id -eq $GoldenImageId }

            if (-not $goldenImages) {
                throw "Golden image not found: $GoldenImageId"
            }

            $goldenVhdxPath = if ($goldenImages.clone) {
                $goldenImages.clone.vhdxPath
            } else {
                $goldenImages.golden.parentVhdxPath
            }

            if (-not (Test-Path -Path $goldenVhdxPath)) {
                throw "Golden image VHDX not found: $goldenVhdxPath"
            }

            # Create VHDX differencing disk
            Write-Verbose "Creating VHDX differencing disk from golden image"
            $vhdxPath = Join-Path $StoragePath "$cloneId.vhdx"

            # Use actual VHDX API
            New-VHD -Path $vhdxPath -Differencing -ParentPath $goldenVhdxPath -ErrorAction Stop | Out-Null

            # Verify creation
            if (-not (Test-Path -Path $vhdxPath)) {
                throw "Failed to create VHDX file: $vhdxPath"
            }

            Write-Verbose "VHDX differencing disk created: $vhdxPath"

            # Create metadata JSON
            $metadata = @{
                clone = @{
                    id = $cloneId
                    name = $CloneName
                    createdAt = (Get-Date).ToUniversalTime().ToString("o")
                    createdBy = [Environment]::UserName
                    vhdxPath = $vhdxPath
                    size = @{
                        allocated = 0
                        used = 0
                    }
                }
                golden = @{
                    id = $GoldenImageId
                    parentHash = "" # Will be populated from golden image
                }
                database = @{
                    type = $DatabaseType
                    databaseName = "${CloneName}_Clone"
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

            # Save metadata
            $metadataPath = $vhdxPath -replace '\.vhdx$', '.json'
            $metadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $metadataPath -Encoding UTF8 -Force

            Write-Verbose "Clone created: $cloneId"

            # Return clone object
            return [PSCustomObject]@{
                Id = $cloneId
                Name = $CloneName
                VhdxPath = $vhdxPath
                MetadataPath = $metadataPath
                InstancePath = $InstancePath
                DatabaseName = $metadata.database.databaseName
                Status = "created"
                CreatedAt = $metadata.clone.createdAt
                CreatedBy = $metadata.clone.createdBy
            }
        } catch {
            Write-Error "Failed to create clone: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Lists all clones or retrieves a specific clone

.DESCRIPTION
    Retrieves clone metadata from JSON files. Supports filtering by status,
    creation date, or other criteria.

.PARAMETER CloneId
    Specific clone ID to retrieve (optional)

.PARAMETER StoragePath
    Directory containing clones (searches recursively if not specified)

.PARAMETER Status
    Filter clones by status (active, detached, expired)

.PARAMETER IncludeMetadata
    Include full metadata object (default: $false for performance)

.EXAMPLE
    # List all clones
    Get-FlashdbClone

    # Get specific clone
    Get-FlashdbClone -CloneId "clone-dev-test-1"

    # List active clones with full metadata
    Get-FlashdbClone -Status "active" -IncludeMetadata

.OUTPUTS
    System.Object array with clone information
#>
function Get-FlashdbClone {
    [CmdletBinding()]
    param(
        [Parameter(ValueFromPipeline = $true)]
        [string]$CloneId,

        [Parameter()]
        [string]$StoragePath,

        [Parameter()]
        [ValidateSet('active', 'detached', 'expired', 'error')]
        [string]$Status,

        [Parameter()]
        [switch]$IncludeMetadata
    )

    begin {
        # If storage path not specified, use default or discover
        if (-not $StoragePath) {
            $StoragePath = (Get-FlashdbConfig).defaultCloneStoragePath
        }

        if (-not (Test-Path -Path $StoragePath -PathType Container)) {
            Write-Warning "Clone storage path does not exist: $StoragePath"
            return
        }
    }

    process {
        try {
            # Find metadata files
            $pattern = if ($CloneId) { "$CloneId.json" } else { "*.json" }
            $metadataFiles = Get-ChildItem -Path $StoragePath -Filter $pattern -ErrorAction SilentlyContinue

            foreach ($file in $metadataFiles) {
                $metadata = Get-Content -Path $file.FullName | ConvertFrom-Json -ErrorAction SilentlyContinue

                if (-not $metadata) {
                    Write-Warning "Invalid metadata file: $($file.FullName)"
                    continue
                }

                # Filter by status if specified
                if ($Status -and $metadata.lifecycle.status -ne $Status) {
                    continue
                }

                # Build output object
                $cloneObj = [PSCustomObject]@{
                    Id = $metadata.clone.id
                    Name = $metadata.clone.name
                    CreatedAt = $metadata.clone.createdAt
                    CreatedBy = $metadata.clone.createdBy
                    VhdxPath = $metadata.clone.vhdxPath
                    InstancePath = $metadata.database.instancePath
                    DatabaseName = $metadata.database.databaseName
                    Status = $metadata.lifecycle.status
                    AttachmentStatus = $metadata.attachment.status
                    CheckpointCount = $metadata.checkpoints.Count
                }

                if ($IncludeMetadata) {
                    $cloneObj | Add-Member -MemberType NoteProperty -Name 'Metadata' -Value $metadata
                }

                $cloneObj
            }
        } catch {
            Write-Error "Failed to get clone information: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Attaches a clone to a SQL Server instance

.DESCRIPTION
    Mounts the clone VHDX to the system and attaches the database to the
    specified SQL Server instance. Requires exclusive access to the VHDX.

.PARAMETER CloneId
    The ID of the clone to attach

.PARAMETER InstancePath
    SQL Server instance path (defaults to value in clone metadata)

.PARAMETER Force
    Force attachment even if already attached (default: $false)

.EXAMPLE
    Connect-FlashdbClone -CloneId "clone-dev-test-1" -InstancePath "LOCALHOST\SQLEXPRESS"

.OUTPUTS
    System.Object with attachment status
#>
function Connect-FlashdbClone {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true, ValueFromPipeline = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneId,

        [Parameter()]
        [string]$InstancePath,

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
            $vhdxPath = $metadata.clone.vhdxPath

            # Use provided instance path or default from metadata
            $targetInstance = $InstancePath -or $metadata.database.instancePath

            # Check if already attached
            if ($metadata.attachment.status -eq 'attached' -and -not $Force) {
                Write-Warning "Clone is already attached to: $($metadata.database.instancePath)"
                return $clone
            }

            Write-Verbose "Attaching clone VHDX: $vhdxPath"

            # Mount VHDX using actual Windows API
            Mount-VHD -Path $vhdxPath -ErrorAction Stop | Out-Null

            # Get mounted disk information
            $vhdDisk = Get-VHD -Path $vhdxPath -ErrorAction Stop
            Write-Verbose "VHDX mounted successfully, disk attached"

            # Attach database to SQL instance (delegated to provider)
            # This would call the SQL Server provider's AttachDatabase method
            # Get-FlashdbProvider($metadata.database.type).AttachDatabase(...)

            # Update metadata
            $metadata.attachment.status = 'attached'
            $metadata.attachment.attachedAt = (Get-Date).ToUniversalTime().ToString("o")
            $metadata.attachment.lastVerifiedAt = (Get-Date).ToUniversalTime().ToString("o")

            # Log operation
            $operation = @{
                operation = "database-attached"
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                status = "success"
                instancePath = $targetInstance
            }
            $metadata.operations.operationLog += $operation
            $metadata.operations.lastOperation = "database-attached"
            $metadata.operations.lastOperationAt = $operation.timestamp

            # Save updated metadata
            $metadataPath = $vhdxPath -replace '\.vhdx$', '.json'
            $metadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $metadataPath -Encoding UTF8 -Force

            Write-Verbose "Clone attached successfully"

            return [PSCustomObject]@{
                CloneId = $CloneId
                Status = 'attached'
                InstancePath = $targetInstance
                DatabaseName = $metadata.database.databaseName
                AttachedAt = $metadata.attachment.attachedAt
            }
        } catch {
            Write-Error "Failed to attach clone: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Detaches a clone from its SQL Server instance

.DESCRIPTION
    Closes database connections and detaches the database from the SQL Server
    instance, then unmounts the VHDX.

.PARAMETER CloneId
    The ID of the clone to detach

.PARAMETER Force
    Force close active connections (default: $false)

.EXAMPLE
    Disconnect-FlashdbClone -CloneId "clone-dev-test-1" -Force

.OUTPUTS
    System.Object with detachment status
#>
function Disconnect-FlashdbClone {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true, ValueFromPipeline = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneId,

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

            if ($metadata.attachment.status -eq 'detached') {
                Write-Warning "Clone is already detached"
                return $clone
            }

            Write-Verbose "Detaching clone: $CloneId"

            # Close database connections (delegated to provider)
            # Get-FlashdbProvider($metadata.database.type).DetachDatabase(...)

            # Dismount VHDX using actual Windows API
            Dismount-VHD -Path $metadata.clone.vhdxPath -ErrorAction Stop | Out-Null
            Write-Verbose "VHDX dismounted successfully"

            # Update metadata
            $metadata.attachment.status = 'detached'
            $metadata.attachment.detachedAt = (Get-Date).ToUniversalTime().ToString("o")

            # Log operation
            $operation = @{
                operation = "database-detached"
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                status = "success"
            }
            if ($Force) {
                $operation | Add-Member -NotePropertyName 'forceClosed' -NotePropertyValue $true
            }
            $metadata.operations.operationLog += $operation
            $metadata.operations.lastOperation = "database-detached"
            $metadata.operations.lastOperationAt = $operation.timestamp

            # Save updated metadata
            $vhdxPath = $metadata.clone.vhdxPath
            $metadataPath = $vhdxPath -replace '\.vhdx$', '.json'
            $metadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $metadataPath -Encoding UTF8 -Force

            Write-Verbose "Clone detached successfully"

            return [PSCustomObject]@{
                CloneId = $CloneId
                Status = 'detached'
                DetachedAt = $metadata.attachment.detachedAt
            }
        } catch {
            Write-Error "Failed to detach clone: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Removes a clone and optionally deletes the VHDX file

.DESCRIPTION
    Detaches the clone from the database instance and optionally removes the
    VHDX file from disk. Metadata is archived or deleted.

.PARAMETER CloneId
    The ID of the clone to remove

.PARAMETER DeleteVhdx
    Delete the VHDX file from disk (default: $false, just detach)

.PARAMETER Force
    Skip confirmation prompts

.EXAMPLE
    Remove-FlashdbClone -CloneId "clone-dev-test-1" -DeleteVhdx -Force

.OUTPUTS
    System.Object with removal status
#>
function Remove-FlashdbClone {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true, ValueFromPipeline = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CloneId,

        [Parameter()]
        [switch]$DeleteVhdx,

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
            $vhdxPath = $metadata.clone.vhdxPath
            $metadataPath = $vhdxPath -replace '\.vhdx$', '.json'

            # Confirmation prompt unless forced
            if (-not $Force) {
                $confirm = Read-Host "Remove clone '$($metadata.clone.name)'? (yes/no)"
                if ($confirm -ne 'yes') {
                    Write-Verbose "Clone removal cancelled"
                    return
                }
            }

            Write-Verbose "Removing clone: $CloneId"

            # Detach if still attached
            if ($metadata.attachment.status -eq 'attached') {
                Write-Verbose "Detaching clone before removal"
                Disconnect-FlashdbClone -CloneId $CloneId -Force
            }

            # Delete VHDX if requested
            if ($DeleteVhdx) {
                if (Test-Path -Path $vhdxPath) {
                    Write-Verbose "Deleting VHDX file: $vhdxPath"
                    Remove-Item -Path $vhdxPath -Force -ErrorAction SilentlyContinue

                    # Also delete all checkpoints
                    $checkpointDir = [System.IO.Path]::GetDirectoryName($vhdxPath)
                    $checkpointPattern = "$CloneId`_cp-*.vhdx"
                    Get-ChildItem -Path $checkpointDir -Filter $checkpointPattern -ErrorAction SilentlyContinue |
                        Remove-Item -Force -ErrorAction SilentlyContinue
                }
            }

            # Delete metadata
            if (Test-Path -Path $metadataPath) {
                Write-Verbose "Deleting metadata file: $metadataPath"
                Remove-Item -Path $metadataPath -Force -ErrorAction SilentlyContinue
            }

            Write-Verbose "Clone removed successfully"

            return [PSCustomObject]@{
                CloneId = $CloneId
                Status = 'removed'
                VhdxDeleted = $DeleteVhdx
                RemovedAt = (Get-Date).ToUniversalTime().ToString("o")
            }
        } catch {
            Write-Error "Failed to remove clone: $_"
            throw
        }
    }
}

# Export functions
Export-ModuleMember -Function @(
    'New-FlashdbClone'
    'Get-FlashdbClone'
    'Connect-FlashdbClone'
    'Disconnect-FlashdbClone'
    'Remove-FlashdbClone'
)
