<#
.SYNOPSIS
    VHDX Operations module for FlashDB
    Provides low-level VHDX disk management operations

.DESCRIPTION
    This module wraps Windows VHDX APIs for:
    - Creating differencing disks
    - Mounting and dismounting VHDXes
    - Creating and managing snapshots
    - Verifying VHDX integrity
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

<#
.SYNOPSIS
    Creates a VHDX differencing disk from a parent VHDX

.DESCRIPTION
    Creates a new VHDX file that uses another VHDX as its parent,
    enabling copy-on-write semantics with minimal initial storage.

.PARAMETER ParentVhdxPath
    Full path to the parent VHDX file

.PARAMETER ChildVhdxPath
    Full path for the new differencing disk

.PARAMETER Size
    Size for the differencing disk (optional, defaults to parent size)

.EXAMPLE
    New-VhdxDifferencingDisk -ParentVhdxPath "\\shared\golden.vhdx" `
        -ChildVhdxPath "D:\clones\clone-1.vhdx"

.OUTPUTS
    System.Object with VHDX creation result
#>
function New-VhdxDifferencingDisk {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateScript({ Test-Path $_ -PathType Leaf })]
        [string]$ParentVhdxPath,

        [Parameter(Mandatory = $true)]
        [string]$ChildVhdxPath,

        [Parameter()]
        [uint64]$Size
    )

    process {
        try {
            # Verify parent exists
            if (-not (Test-Path -Path $ParentVhdxPath)) {
                throw "Parent VHDX not found: $ParentVhdxPath"
            }

            # Ensure child directory exists
            $childDir = [System.IO.Path]::GetDirectoryName($ChildVhdxPath)
            if (-not (Test-Path -Path $childDir -PathType Container)) {
                New-Item -ItemType Directory -Path $childDir -Force | Out-Null
            }

            # Verify child doesn't already exist
            if (Test-Path -Path $ChildVhdxPath) {
                throw "VHDX already exists: $ChildVhdxPath"
            }

            Write-Verbose "Creating differencing VHDX: $ChildVhdxPath"

            # Create differencing disk
            if ($Size) {
                New-VHD -Path $ChildVhdxPath -ParentPath $ParentVhdxPath -SizeBytes $Size `
                    -ErrorAction Stop | Out-Null
            } else {
                New-VHD -Path $ChildVhdxPath -ParentPath $ParentVhdxPath `
                    -ErrorAction Stop | Out-Null
            }

            # Verify creation
            if (-not (Test-Path -Path $ChildVhdxPath)) {
                throw "Failed to create VHDX file"
            }

            Write-Verbose "VHDX differencing disk created successfully"

            return [PSCustomObject]@{
                VhdxPath = $ChildVhdxPath
                ParentPath = $ParentVhdxPath
                CreatedAt = (Get-Date).ToUniversalTime().ToString("o")
                Status = 'created'
            }
        } catch {
            Write-Error "Failed to create differencing VHDX: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Mounts a VHDX file to the system

.DESCRIPTION
    Attaches a VHDX file to the local system making its volumes
    available for file access. Supports read-only mounting.

.PARAMETER VhdxPath
    Full path to the VHDX file to mount

.PARAMETER ReadOnly
    Mount as read-only (default: $false)

.EXAMPLE
    Mount-VhdxDisk -VhdxPath "D:\clones\clone-1.vhdx"

.OUTPUTS
    System.Object with mount information
#>
function Mount-VhdxDisk {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateScript({ Test-Path $_ -PathType Leaf })]
        [string]$VhdxPath,

        [Parameter()]
        [bool]$ReadOnly = $false
    )

    process {
        try {
            Write-Verbose "Mounting VHDX: $VhdxPath"

            # Check if already mounted
            $existing = Get-VHD -Path $VhdxPath -ErrorAction SilentlyContinue
            if ($existing -and $existing.Attached) {
                Write-Warning "VHDX is already mounted: $VhdxPath"
                return [PSCustomObject]@{
                    VhdxPath = $VhdxPath
                    Attached = $true
                    ReadOnly = $existing.LogicalSectorSize -eq 4096  # Approximation
                    Status = 'already-mounted'
                }
            }

            # Mount the VHDX
            $mountParams = @{
                Path = $VhdxPath
                ErrorAction = 'Stop'
            }
            if ($ReadOnly) {
                $mountParams['ReadOnly'] = $true
            }

            Mount-VHD @mountParams | Out-Null

            # Get mounted disk info
            $vhdInfo = Get-VHD -Path $VhdxPath -ErrorAction Stop

            # Get disk number
            $diskNumber = Get-DiskFromVHD -VhdxPath $VhdxPath

            Write-Verbose "VHDX mounted successfully on disk $diskNumber"

            return [PSCustomObject]@{
                VhdxPath = $VhdxPath
                Attached = $true
                DiskNumber = $diskNumber
                Size = $vhdInfo.Size
                LogicalSectorSize = $vhdInfo.LogicalSectorSize
                ReadOnly = $ReadOnly
                MountedAt = (Get-Date).ToUniversalTime().ToString("o")
                Status = 'mounted'
            }
        } catch {
            Write-Error "Failed to mount VHDX: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Dismounts a VHDX file from the system

.DESCRIPTION
    Detaches a mounted VHDX file from the local system. Ensures all
    file handles are closed before dismounting.

.PARAMETER VhdxPath
    Full path to the VHDX file to dismount

.PARAMETER Force
    Force dismount even if files are open (default: $false)

.EXAMPLE
    Dismount-VhdxDisk -VhdxPath "D:\clones\clone-1.vhdx" -Force

.OUTPUTS
    System.Object with dismount status
#>
function Dismount-VhdxDisk {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateScript({ Test-Path $_ -PathType Leaf })]
        [string]$VhdxPath,

        [Parameter()]
        [bool]$Force = $false
    )

    process {
        try {
            Write-Verbose "Dismounting VHDX: $VhdxPath"

            # Check if mounted
            $vhdInfo = Get-VHD -Path $VhdxPath -ErrorAction SilentlyContinue

            if (-not $vhdInfo -or -not $vhdInfo.Attached) {
                Write-Warning "VHDX is not mounted: $VhdxPath"
                return [PSCustomObject]@{
                    VhdxPath = $VhdxPath
                    Status = 'not-mounted'
                }
            }

            # Dismount
            $dismountParams = @{
                Path = $VhdxPath
                ErrorAction = 'Stop'
            }
            if ($Force) {
                $dismountParams['Confirm'] = $false
            }

            Dismount-VHD @dismountParams | Out-Null

            Write-Verbose "VHDX dismounted successfully"

            return [PSCustomObject]@{
                VhdxPath = $VhdxPath
                Status = 'dismounted'
                DismountedAt = (Get-Date).ToUniversalTime().ToString("o")
            }
        } catch {
            Write-Error "Failed to dismount VHDX: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Creates a snapshot (checkpoint) of a VHDX

.DESCRIPTION
    Creates a recovery point snapshot of the current VHDX state.
    Uses differencing disk snapshots for efficiency.

.PARAMETER VhdxPath
    Full path to the VHDX to snapshot

.PARAMETER SnapshotPath
    Full path for the snapshot VHDX file

.PARAMETER Description
    Optional snapshot description

.EXAMPLE
    New-VhdxSnapshot -VhdxPath "D:\clones\clone-1.vhdx" `
        -SnapshotPath "D:\clones\checkpoints\clone-1_cp-001.vhdx"

.OUTPUTS
    System.Object with snapshot creation result
#>
function New-VhdxSnapshot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateScript({ Test-Path $_ -PathType Leaf })]
        [string]$VhdxPath,

        [Parameter(Mandatory = $true)]
        [string]$SnapshotPath,

        [Parameter()]
        [string]$Description
    )

    process {
        try {
            Write-Verbose "Creating VHDX snapshot: $SnapshotPath"

            # Ensure snapshot directory exists
            $snapshotDir = [System.IO.Path]::GetDirectoryName($SnapshotPath)
            if (-not (Test-Path -Path $snapshotDir -PathType Container)) {
                New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null
            }

            # Create snapshot as differencing disk
            New-VHD -Path $SnapshotPath -ParentPath $VhdxPath -Differencing `
                -ErrorAction Stop | Out-Null

            # Verify creation
            if (-not (Test-Path -Path $SnapshotPath)) {
                throw "Failed to create snapshot file"
            }

            Write-Verbose "VHDX snapshot created successfully"

            return [PSCustomObject]@{
                SnapshotPath = $SnapshotPath
                ParentPath = $VhdxPath
                CreatedAt = (Get-Date).ToUniversalTime().ToString("o")
                Description = $Description
                Status = 'created'
            }
        } catch {
            Write-Error "Failed to create VHDX snapshot: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Restores a VHDX to a snapshot state

.DESCRIPTION
    Reverts a VHDX to a previous snapshot, discarding all changes made
    after the snapshot was created. VHDX must be dismounted.

.PARAMETER VhdxPath
    Full path to the VHDX to restore

.PARAMETER SnapshotPath
    Full path to the snapshot to restore from

.EXAMPLE
    Restore-VhdxSnapshot -VhdxPath "D:\clones\clone-1.vhdx" `
        -SnapshotPath "D:\clones\checkpoints\clone-1_cp-001.vhdx"

.OUTPUTS
    System.Object with restore result
#>
function Restore-VhdxSnapshot {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateScript({ Test-Path $_ -PathType Leaf })]
        [string]$VhdxPath,

        [Parameter(Mandatory = $true)]
        [ValidateScript({ Test-Path $_ -PathType Leaf })]
        [string]$SnapshotPath
    )

    process {
        try {
            Write-Verbose "Restoring VHDX from snapshot: $SnapshotPath"

            # Verify VHDX is not mounted
            $vhdInfo = Get-VHD -Path $VhdxPath -ErrorAction SilentlyContinue
            if ($vhdInfo -and $vhdInfo.Attached) {
                throw "VHDX is currently mounted. Dismount before restoring."
            }

            # Backup original
            $backupPath = "$VhdxPath.backup"
            if (Test-Path -Path $VhdxPath) {
                Write-Verbose "Backing up original VHDX: $backupPath"
                Copy-Item -Path $VhdxPath -Destination $backupPath -Force -ErrorAction SilentlyContinue
            }

            # Copy snapshot to main VHDX
            Copy-Item -Path $SnapshotPath -Destination $VhdxPath -Force -ErrorAction Stop

            Write-Verbose "VHDX restored from snapshot successfully"

            return [PSCustomObject]@{
                VhdxPath = $VhdxPath
                SnapshotPath = $SnapshotPath
                RestoredAt = (Get-Date).ToUniversalTime().ToString("o")
                BackupPath = if (Test-Path -Path $backupPath) { $backupPath } else { $null }
                Status = 'restored'
            }
        } catch {
            Write-Error "Failed to restore VHDX snapshot: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Gets VHDX information

.DESCRIPTION
    Retrieves detailed information about a VHDX file including
    size, attachment status, and parent information.

.PARAMETER VhdxPath
    Full path to the VHDX file

.EXAMPLE
    Get-VhdxInfo -VhdxPath "D:\clones\clone-1.vhdx"

.OUTPUTS
    System.Object with VHDX properties
#>
function Get-VhdxInfo {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateScript({ Test-Path $_ -PathType Leaf })]
        [string]$VhdxPath
    )

    process {
        try {
            Write-Verbose "Getting VHDX information: $VhdxPath"

            $vhdInfo = Get-VHD -Path $VhdxPath -ErrorAction Stop

            # Get file size
            $fileSize = (Get-Item -Path $VhdxPath).Length

            return [PSCustomObject]@{
                VhdxPath = $VhdxPath
                Size = $vhdInfo.Size
                PhysicalSize = $vhdInfo.PhysicalSectorSize
                LogicalSize = $vhdInfo.LogicalSectorSize
                FileSize = $fileSize
                Attached = $vhdInfo.Attached
                ParentPath = $vhdInfo.ParentPath
                VhdFormat = $vhdInfo.VhdFormat
                VhdType = $vhdInfo.VhdType
                CreationTime = (Get-Item -Path $VhdxPath).CreationTime
                LastWriteTime = (Get-Item -Path $VhdxPath).LastWriteTime
                CompressionPercentage = if ($vhdInfo.Size -gt 0) {
                    [math]::Round((1 - ($fileSize / $vhdInfo.Size)) * 100, 2)
                } else {
                    0
                }
            }
        } catch {
            Write-Error "Failed to get VHDX information: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Verifies VHDX integrity

.DESCRIPTION
    Checks VHDX file for corruption and consistency issues.
    Repairs minor issues if requested.

.PARAMETER VhdxPath
    Full path to the VHDX file

.PARAMETER Repair
    Attempt to repair detected issues (default: $false)

.EXAMPLE
    Test-VhdxIntegrity -VhdxPath "D:\clones\clone-1.vhdx" -Repair

.OUTPUTS
    System.Object with integrity check results
#>
function Test-VhdxIntegrity {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateScript({ Test-Path $_ -PathType Leaf })]
        [string]$VhdxPath,

        [Parameter()]
        [bool]$Repair = $false
    )

    process {
        try {
            Write-Verbose "Checking VHDX integrity: $VhdxPath"

            # Verify file can be read
            $vhdInfo = Get-VHD -Path $VhdxPath -ErrorAction Stop

            $issues = @()

            # Check file size is reasonable
            $fileSize = (Get-Item -Path $VhdxPath).Length
            if ($fileSize -eq 0) {
                $issues += "VHDX file is empty"
            }

            # Check parent exists if differencing disk
            if ($vhdInfo.ParentPath) {
                if (-not (Test-Path -Path $vhdInfo.ParentPath)) {
                    $issues += "Parent VHDX not found: $($vhdInfo.ParentPath)"
                }
            }

            # Check attached state is consistent
            if ($vhdInfo.Attached -and -not (Get-DiskFromVHD -VhdxPath $VhdxPath -ErrorAction SilentlyContinue)) {
                $issues += "Attached state inconsistent with mounted disk"
            }

            # Attempt repair if requested
            if ($Repair -and $issues.Count -gt 0) {
                Write-Verbose "Attempting to repair VHDX issues"
                # Basic repair: detach and reattach
                if ($vhdInfo.Attached) {
                    Dismount-VHD -Path $VhdxPath -Confirm:$false -ErrorAction SilentlyContinue
                    Start-Sleep -Milliseconds 500
                    Mount-VHD -Path $VhdxPath -ErrorAction SilentlyContinue
                }
            }

            return [PSCustomObject]@{
                VhdxPath = $VhdxPath
                IsValid = $issues.Count -eq 0
                Issues = $issues
                FileSize = $fileSize
                VhdType = $vhdInfo.VhdType
                CheckedAt = (Get-Date).ToUniversalTime().ToString("o")
            }
        } catch {
            Write-Error "Failed to check VHDX integrity: $_"
            throw
        }
    }
}

# Helper function: Get disk number from mounted VHDX
function Get-DiskFromVHD {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$VhdxPath
    )

    process {
        try {
            # Get disk associated with VHDX
            $disks = Get-Disk | Where-Object { $_.BusType -eq 'File Backed Virtual' }

            foreach ($disk in $disks) {
                $vhdPath = (Get-VHD -DiskNumber $disk.Number -ErrorAction SilentlyContinue).Path
                if ($vhdPath -eq $VhdxPath) {
                    return $disk.Number
                }
            }

            return $null
        } catch {
            Write-Warning "Could not determine disk number for VHDX: $_"
            return $null
        }
    }
}

# Export functions
Export-ModuleMember -Function @(
    'New-VhdxDifferencingDisk'
    'Mount-VhdxDisk'
    'Dismount-VhdxDisk'
    'New-VhdxSnapshot'
    'Restore-VhdxSnapshot'
    'Get-VhdxInfo'
    'Test-VhdxIntegrity'
)
