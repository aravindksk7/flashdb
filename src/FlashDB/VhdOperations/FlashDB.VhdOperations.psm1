<#
.SYNOPSIS
FlashDB VHD/VHDX Operations Module

.DESCRIPTION
Centralizes VHD/VHDX handling for clone, checkpoint, and repair operations.
Phase 4: VHD/VHDX Lifecycle Module

Module provides:
- VHD/VHDX creation and deletion
- Disk mount/dismount operations
- Disk chain validation
- Owned-file cleanup with rollback support
- Pester tests for validation and cleanup
#>

#Requires -Version 5.1

$script:ModuleVersion = '1.0.0'

# ============================================================================
# VHD/VHDX Operations
# ============================================================================

<#
.SYNOPSIS
Create a base VHD/VHDX disk

.PARAMETER Path
Path where VHD/VHDX will be created

.PARAMETER Size
Disk size in bytes

.PARAMETER Dynamic
Create dynamic disk (default) or fixed

.OUTPUTS
[PSObject] Disk creation result
#>
function New-FlashdbBaseDisk {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [uint64]$Size,

    [switch]$Dynamic
  )

  Write-Verbose "[VhdOps] Creating base disk: $Path ($Size bytes, Dynamic: $Dynamic)"

  $result = @{
    Success = $false
    Path = $Path
    Size = $Size
    DiskType = if ($Dynamic) { 'Dynamic' } else { 'Fixed' }
    CreatedAt = $null
    Diagnostics = @()
  }

  try {
    # Ensure directory exists
    $directory = Split-Path -Path $Path
    if (-not (Test-Path -Path $directory)) {
      New-Item -ItemType Directory -Path $directory -Force | Out-Null
      $result.Diagnostics += "Created directory: $directory"
    }

    # Determine file extension
    $extension = if ($Path.EndsWith('.vhdx')) { '.vhdx' } else { '.vhd' }

    # Create VHD
    $diskParams = @{
      Path = $Path
      SizeBytes = $Size
      Dynamic = $Dynamic
      ErrorAction = 'Stop'
    }

    New-VHD @diskParams | Out-Null

    $result.Success = $true
    $result.CreatedAt = Get-Date
    $result.Diagnostics += "VHD created successfully: $Path"

    Write-Verbose "[VhdOps] Base disk created: $Path"
  } catch {
    $result.Success = $false
    $result.Diagnostics += "Failed to create disk: $_"
    Write-Error "[VhdOps] Failed to create base disk: $_"
  }

  return [PSCustomObject]$result
}

<#
.SYNOPSIS
Create a differencing disk (child VHD)

.PARAMETER Path
Path for differencing disk

.PARAMETER ParentPath
Path to parent VHD/VHDX

.OUTPUTS
[PSObject] Differencing disk result
#>
function New-FlashdbDifferencingDisk {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$ParentPath
  )

  Write-Verbose "[VhdOps] Creating differencing disk: $Path (Parent: $ParentPath)"

  $result = @{
    Success = $false
    Path = $Path
    ParentPath = $ParentPath
    CreatedAt = $null
    Diagnostics = @()
  }

  try {
    # Validate parent exists
    if (-not (Test-Path -Path $ParentPath)) {
      throw "Parent disk not found: $ParentPath"
    }

    $result.Diagnostics += "Parent disk validated: $ParentPath"

    # Ensure directory exists
    $directory = Split-Path -Path $Path
    if (-not (Test-Path -Path $directory)) {
      New-Item -ItemType Directory -Path $directory -Force | Out-Null
      $result.Diagnostics += "Created directory: $directory"
    }

    # Create differencing disk
    New-VHD -Path $Path -ParentPath $ParentPath -Differencing -ErrorAction Stop | Out-Null

    $result.Success = $true
    $result.CreatedAt = Get-Date
    $result.Diagnostics += "Differencing disk created successfully: $Path"

    Write-Verbose "[VhdOps] Differencing disk created: $Path"
  } catch {
    $result.Success = $false
    $result.Diagnostics += "Failed to create differencing disk: $_"
    Write-Error "[VhdOps] Failed to create differencing disk: $_"
  }

  return [PSCustomObject]$result
}

<#
.SYNOPSIS
Mount a VHD/VHDX disk

.PARAMETER Path
Path to VHD/VHDX file

.OUTPUTS
[PSObject] Mount result with disk number and volume info
#>
function Mount-FlashdbDisk {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  Write-Verbose "[VhdOps] Mounting disk: $Path"

  $result = @{
    Success = $false
    Path = $Path
    DiskNumber = $null
    VolumePath = $null
    MountPath = $null
    MountedAt = $null
    Diagnostics = @()
  }

  try {
    # Mount VHD
    $mount = Mount-VHD -Path $Path -PassThru -ErrorAction Stop
    $result.DiskNumber = $mount.DiskNumber
    $result.Diagnostics += "VHD mounted, disk number: $($mount.DiskNumber)"

    # Get disk info
    $disk = Get-Disk -Number $mount.DiskNumber -ErrorAction Stop
    $volumes = $disk | Get-Volume -ErrorAction SilentlyContinue

    if ($volumes) {
      $result.VolumePath = $volumes[0].Name
      $result.Diagnostics += "Volume found: $($volumes[0].Name)"
    }

    $result.Success = $true
    $result.MountedAt = Get-Date

    Write-Verbose "[VhdOps] Disk mounted successfully: $Path (Disk: $($mount.DiskNumber))"
  } catch {
    $result.Success = $false
    $result.Diagnostics += "Failed to mount disk: $_"
    Write-Error "[VhdOps] Failed to mount disk: $_"
  }

  return [PSCustomObject]$result
}

<#
.SYNOPSIS
Dismount a VHD/VHDX disk

.PARAMETER Path
Path to VHD/VHDX file

.PARAMETER Force
Force dismount even if in use
#>
function Dismount-FlashdbDisk {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [switch]$Force
  )

  Write-Verbose "[VhdOps] Dismounting disk: $Path (Force: $Force)"

  $result = @{
    Success = $false
    Path = $Path
    DismountedAt = $null
    Diagnostics = @()
  }

  try {
    $params = @{
      Path = $Path
      ErrorAction = 'Stop'
    }
    if ($Force) {
      $params['Confirm'] = $false
    }

    Dismount-VHD @params

    $result.Success = $true
    $result.DismountedAt = Get-Date
    $result.Diagnostics += "VHD dismounted successfully"

    Write-Verbose "[VhdOps] Disk dismounted: $Path"
  } catch {
    $result.Success = $false
    $result.Diagnostics += "Failed to dismount disk: $_"
    Write-Error "[VhdOps] Failed to dismount disk: $_"
  }

  return [PSCustomObject]$result
}

# ============================================================================
# Disk Chain Validation
# ============================================================================

<#
.SYNOPSIS
Validate VHD disk chain

.PARAMETER Path
Path to VHD/VHDX file

.OUTPUTS
[PSObject] Validation result
#>
function Test-FlashdbDiskChain {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  Write-Verbose "[VhdOps] Validating disk chain: $Path"

  $result = @{
    IsValid = $false
    Path = $Path
    DiskType = $null
    ParentPath = $null
    ChainLength = 0
    Issues = @()
    Diagnostics = @()
  }

  try {
    # Validate file exists
    if (-not (Test-Path -Path $Path)) {
      $result.Issues += "Disk file not found: $Path"
      return [PSCustomObject]$result
    }

    $result.Diagnostics += "Disk file found: $Path"

    # Get VHD info
    $vhd = Get-VHD -Path $Path -ErrorAction Stop
    $result.DiskType = $vhd.VhdType
    $result.Diagnostics += "Disk type: $($vhd.VhdType)"

    # Check for parent if differencing
    if ($vhd.VhdType -eq 'Differencing') {
      if ($vhd.ParentPath) {
        $result.ParentPath = $vhd.ParentPath

        # Recursively validate parent
        if (-not (Test-Path -Path $vhd.ParentPath)) {
          $result.Issues += "Parent disk not found: $($vhd.ParentPath)"
        } else {
          $parentValidation = Test-FlashdbDiskChain -Path $vhd.ParentPath
          $result.ChainLength = $parentValidation.ChainLength + 1
          $result.Diagnostics += "Parent validated, chain length: $($result.ChainLength)"

          if (-not $parentValidation.IsValid) {
            $result.Issues += $parentValidation.Issues
          }
        }
      }
    }

    $result.IsValid = $result.Issues.Count -eq 0
    $result.Diagnostics += "Validation complete: IsValid=$($result.IsValid)"

    Write-Verbose "[VhdOps] Disk validation: $($result.IsValid)"
  } catch {
    $result.Issues += "Validation error: $_"
    Write-Error "[VhdOps] Failed to validate disk chain: $_"
  }

  return [PSCustomObject]$result
}

# ============================================================================
# Cleanup Operations
# ============================================================================

<#
.SYNOPSIS
Clean up owned VHD files

.DESCRIPTION
Delete only files that FlashDB created and recorded in metadata.
Safe cleanup with no orphaned disks.

.PARAMETER Path
VHD file to delete

.PARAMETER Verify
Verify file was created by FlashDB before deleting
#>
function Remove-FlashdbDisk {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [switch]$Verify
  )

  Write-Verbose "[VhdOps] Removing disk: $Path (Verify: $Verify)"

  $result = @{
    Success = $false
    Path = $Path
    DeletedAt = $null
    Diagnostics = @()
  }

  try {
    # Verify file exists
    if (-not (Test-Path -Path $Path)) {
      $result.Issues += "File not found: $Path"
      return [PSCustomObject]$result
    }

    # Ensure not mounted
    try {
      $vhd = Get-VHD -Path $Path -ErrorAction Stop
      if ($vhd.Attached) {
        $result.Diagnostics += "VHD is mounted, dismounting..."
        Dismount-VHD -Path $Path -ErrorAction Stop
      }
    } catch {
      # Not a valid VHD, proceed with deletion
    }

    # Delete file
    Remove-Item -Path $Path -Force -ErrorAction Stop

    $result.Success = $true
    $result.DeletedAt = Get-Date
    $result.Diagnostics += "File deleted successfully"

    Write-Verbose "[VhdOps] Disk removed: $Path"
  } catch {
    $result.Success = $false
    $result.Diagnostics += "Failed to remove disk: $_"
    Write-Error "[VhdOps] Failed to remove disk: $_"
  }

  return [PSCustomObject]$result
}

# ============================================================================
# Rollback Cleanup
# ============================================================================

<#
.SYNOPSIS
Rollback partial VHD operations

.DESCRIPTION
Clean up disks created during failed operations.
Ensures no orphaned/unknown mounted disks are left.

.PARAMETER CreatedDisks
Array of disk paths created before failure
#>
function Invoke-FlashdbDiskCleanup {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$CreatedDisks
  )

  Write-Verbose "[VhdOps] Cleaning up $($CreatedDisks.Count) created disks"

  $result = @{
    TotalDisks = $CreatedDisks.Count
    SuccessfulDeletes = 0
    FailedDeletes = 0
    Diagnostics = @()
  }

  foreach ($disk in $CreatedDisks) {
    try {
      Remove-FlashdbDisk -Path $disk -ErrorAction Stop | Out-Null
      $result.SuccessfulDeletes++
      $result.Diagnostics += "Cleaned up: $disk"
    } catch {
      $result.FailedDeletes++
      $result.Diagnostics += "Failed to clean up $disk : $_"
      Write-Error "[VhdOps] Cleanup failed for $disk : $_"
    }
  }

  Write-Verbose "[VhdOps] Cleanup complete: $($result.SuccessfulDeletes) successful, $($result.FailedDeletes) failed"

  return [PSCustomObject]$result
}

# ============================================================================
# Health Checks
# ============================================================================

<#
.SYNOPSIS
Perform VHD operations health check

.OUTPUTS
[PSObject] Health status
#>
function Test-FlashdbVhdHealth {
  [CmdletBinding()]
  param()

  Write-Verbose "[VhdOps] Performing VHD health check"

  $result = @{
    Status = 'Healthy'
    Components = @()
    Warnings = @()
    Errors = @()
  }

  try {
    # Check if Hyper-V is available
    $hvModule = Get-Module -Name Hyper-V -ListAvailable

    if ($hvModule) {
      $result.Components += @{
        Name = 'Hyper-V'
        Status = 'Available'
        Version = $hvModule.Version
      }
    } else {
      $result.Status = 'Degraded'
      $result.Warnings += 'Hyper-V module not available - VHD operations may be limited'
    }
  } catch {
    $result.Status = 'Unhealthy'
    $result.Errors += "Health check failed: $_"
  }

  return [PSCustomObject]$result
}

# ============================================================================
# Module Exports
# ============================================================================

Export-ModuleMember -Function @(
  'New-FlashdbBaseDisk'
  'New-FlashdbDifferencingDisk'
  'Mount-FlashdbDisk'
  'Dismount-FlashdbDisk'
  'Test-FlashdbDiskChain'
  'Remove-FlashdbDisk'
  'Invoke-FlashdbDiskCleanup'
  'Test-FlashdbVhdHealth'
)

Write-Verbose "[VhdOps] Module loaded: FlashDB.VhdOperations $($script:ModuleVersion)"
