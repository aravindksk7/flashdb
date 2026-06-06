################################################################################
# AuditLog.ps1
# PowerShell Audit Logging Module for FlashDB
#
# Provides comprehensive audit logging for PowerShell operations:
# - Create, Modify, Delete operations on VHDX files
# - Checkpoint management tracking
# - Clone operations
# - State changes
# - User and timestamp tracking
# - Immutable append-only log
################################################################################

using namespace System.Collections.Generic

# Configuration
$script:AuditLogDir = $env:AUDIT_LOG_DIR ?? (Join-Path (Split-Path $MyInvocation.MyCommand.Path) "logs")
$script:AuditLogFile = Join-Path $script:AuditLogDir "ps-audit-$(Get-Date -Format 'yyyy-MM-dd').log"
$script:MaxLogSize = 100MB # Rotate logs at 100MB

# Ensure audit log directory exists
if (-not (Test-Path $script:AuditLogDir)) {
  New-Item -ItemType Directory -Path $script:AuditLogDir -Force | Out-Null
  Write-Verbose "Created audit log directory: $script:AuditLogDir"
}

# Set restrictive permissions on audit log directory (Owner only)
$Acl = Get-Acl $script:AuditLogDir
$Acl.SetAccessRuleProtection($true, $false)
$AccessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
  [System.Security.Principal.WindowsIdentity]::GetCurrent().User,
  [System.Security.AccessControl.FileSystemRights]::FullControl,
  [System.Security.AccessControl.InheritanceFlags]::ContainerInherit,
  [System.Security.AccessControl.PropagationFlags]::InheritOnly,
  [System.Security.AccessControl.AccessControlType]::Allow
)
$Acl.AddAccessRule($AccessRule)
Set-Acl $script:AuditLogDir $Acl

<#
.SYNOPSIS
  Generates a unique audit log entry ID
.DESCRIPTION
  Creates a timestamp-based unique ID for audit log entries
.OUTPUTS
  [string] Unique audit log ID
#>
function New-AuditLogId {
  return "$(Get-Date -Format 'yyyyMMddHHmmss')-$((1..8 | ForEach-Object { [char]([48..57] + [65..90] + [97..122] | Get-Random) }) -join '')"
}

<#
.SYNOPSIS
  Writes an audit log entry to the audit log file
.DESCRIPTION
  Appends a JSON-formatted audit log entry to the immutable audit log
.PARAMETER Operation
  Type of operation: CREATE, UPDATE, DELETE, READ, ERROR
.PARAMETER Resource
  Resource type: Clone, Checkpoint, GoldenImage, BatchJob
.PARAMETER ResourceId
  Identifier for the specific resource
.PARAMETER Details
  Additional details about the operation
.PARAMETER Changes
  Before/after values for the change
.PARAMETER Error
  Error message if operation failed
.EXAMPLE
  Write-AuditLog -Operation CREATE -Resource Clone -ResourceId "clone-001" -Details "Clone created from golden image" -Changes @{before=$null; after=$cloneData}
#>
function Write-AuditLog {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('CREATE', 'UPDATE', 'DELETE', 'READ', 'LOGIN', 'LOGOUT', 'ERROR')]
    [string]$Operation,

    [Parameter(Mandatory = $true)]
    [ValidateSet('Clone', 'Checkpoint', 'GoldenImage', 'BatchJob', 'System')]
    [string]$Resource,

    [Parameter(Mandatory = $true)]
    [string]$ResourceId,

    [Parameter()]
    [string]$Details,

    [Parameter()]
    [hashtable]$Changes,

    [Parameter()]
    [string]$Error
  )

  try {
    # Check if log file needs rotation
    if ((Test-Path $script:AuditLogFile) -and (Get-Item $script:AuditLogFile).Length -gt $script:MaxLogSize) {
      $archiveFile = Join-Path $script:AuditLogDir "ps-audit-$(Get-Date -Format 'yyyy-MM-dd-HHmmss').archive.log"
      Move-Item -Path $script:AuditLogFile -Destination $archiveFile -Force
    }

    $timestamp = Get-Date -Format 'o'
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $computerId = [System.Environment]::MachineName
    $id = New-AuditLogId

    # Redact sensitive data
    $redactedChanges = $null
    if ($Changes) {
      $redactedChanges = @{
        before = Redact-SensitiveData -Data $Changes.before
        after = Redact-SensitiveData -Data $Changes.after
      }
    }

    # Create audit log entry
    $entry = @{
      id          = $id
      timestamp   = $timestamp
      operation   = $Operation
      resource    = $Resource
      resourceId  = $ResourceId
      user        = $currentUser
      computer    = $computerId
      details     = $Details
      changes     = $redactedChanges
      error       = $Error
    }

    # Convert to JSON and append to log file
    $json = $entry | ConvertTo-Json -Depth 3 -Compress
    Add-Content -Path $script:AuditLogFile -Value $json

    # Set restrictive permissions (owner read/write only)
    if (Test-Path $script:AuditLogFile) {
      $filePath = (Resolve-Path $script:AuditLogFile).Path
      $Acl = Get-Acl $filePath
      $Acl.SetAccessRuleProtection($true, $false)
      Set-Acl $filePath $Acl
      icacls $filePath /inheritance:r /grant:r "$([System.Security.Principal.WindowsIdentity]::GetCurrent().Name):(F)" | Out-Null
    }

    Write-Verbose "Audit log entry written: $id"
    return $id
  }
  catch {
    Write-Error "Failed to write audit log: $_"
  }
}

<#
.SYNOPSIS
  Redacts sensitive data from audit log entries
.DESCRIPTION
  Replaces sensitive field values with [REDACTED] markers
.PARAMETER Data
  The data object to redact
.OUTPUTS
  [object] Redacted data object
#>
function Redact-SensitiveData {
  [CmdletBinding()]
  param(
    [Parameter()]
    [object]$Data
  )

  if ($null -eq $Data) {
    return $null
  }

  $sensitivePatterns = @(
    'password', 'token', 'apikey', 'api_key', 'secret',
    'credential', 'authorization', 'sql_password', 'db_password'
  )

  if ($Data -is [string]) {
    return $Data
  }

  if ($Data -is [hashtable]) {
    $redacted = @{}
    foreach ($key in $Data.Keys) {
      if ($sensitivePatterns | Where-Object { $key -match $_ }) {
        $redacted[$key] = '[REDACTED]'
      }
      elseif ($Data[$key] -is [hashtable] -or $Data[$key] -is [object]) {
        $redacted[$key] = Redact-SensitiveData -Data $Data[$key]
      }
      else {
        $redacted[$key] = $Data[$key]
      }
    }
    return $redacted
  }

  return $Data
}

<#
.SYNOPSIS
  Reads audit log entries with optional filtering
.DESCRIPTION
  Reads and parses audit log entries from the audit log file
.PARAMETER Filter
  Hashtable with filter criteria: @{Operation='CREATE'; Resource='Clone'; StartDate=(Get-Date).AddDays(-7)}
.PARAMETER Limit
  Maximum number of entries to return (default: 100)
.PARAMETER Offset
  Number of entries to skip (default: 0)
.OUTPUTS
  [PSCustomObject[]] Array of audit log entries
.EXAMPLE
  Get-AuditLog -Filter @{Resource='Clone'} -Limit 50
#>
function Get-AuditLog {
  [CmdletBinding()]
  param(
    [Parameter()]
    [hashtable]$Filter,

    [Parameter()]
    [int]$Limit = 100,

    [Parameter()]
    [int]$Offset = 0
  )

  try {
    if (-not (Test-Path $script:AuditLogFile)) {
      return @()
    }

    $entries = @()
    Get-Content -Path $script:AuditLogFile | ForEach-Object {
      try {
        $entry = $_ | ConvertFrom-Json -AsHashtable -ErrorAction SilentlyContinue
        if ($entry) {
          $entries += $entry
        }
      }
      catch {
        Write-Verbose "Failed to parse audit log entry: $_"
      }
    }

    # Apply filters
    if ($Filter) {
      $entries = $entries | Where-Object {
        $include = $true

        if ($Filter.Operation -and $_.operation -ne $Filter.Operation) { $include = $false }
        if ($Filter.Resource -and $_.resource -ne $Filter.Resource) { $include = $false }
        if ($Filter.ResourceId -and $_.resourceId -ne $Filter.ResourceId) { $include = $false }
        if ($Filter.User -and $_.user -ne $Filter.User) { $include = $false }

        if ($Filter.StartDate -and [datetime]$_.timestamp -lt $Filter.StartDate) { $include = $false }
        if ($Filter.EndDate -and [datetime]$_.timestamp -gt $Filter.EndDate) { $include = $false }

        return $include
      }
    }

    # Sort by timestamp descending
    $entries = $entries | Sort-Object { [datetime]$_.timestamp } -Descending

    # Apply limit and offset
    return $entries | Select-Object -Skip $Offset -First $Limit
  }
  catch {
    Write-Error "Failed to read audit logs: $_"
    return @()
  }
}

<#
.SYNOPSIS
  Gets audit log statistics
.DESCRIPTION
  Returns summary statistics about the audit log
.OUTPUTS
  [PSCustomObject] Statistics object with TotalEntries, FileSize, OldestEntry, NewestEntry
#>
function Get-AuditLogStats {
  [CmdletBinding()]
  param()

  try {
    $stats = @{
      TotalEntries  = 0
      FileSizeBytes = 0
      OldestEntry   = $null
      NewestEntry   = $null
      FilePath      = $script:AuditLogFile
    }

    if (Test-Path $script:AuditLogFile) {
      $fileInfo = Get-Item $script:AuditLogFile
      $stats.FileSizeBytes = $fileInfo.Length

      $entries = Get-AuditLog -Limit 999999
      $stats.TotalEntries = $entries.Count

      if ($entries.Count -gt 0) {
        $stats.OldestEntry = $entries | Sort-Object { [datetime]$_.timestamp } | Select-Object -First 1
        $stats.NewestEntry = $entries | Sort-Object { [datetime]$_.timestamp } | Select-Object -Last 1
      }
    }

    return [PSCustomObject]$stats
  }
  catch {
    Write-Error "Failed to get audit log statistics: $_"
  }
}

<#
.SYNOPSIS
  Logs a clone creation
.DESCRIPTION
  Convenience function to log clone creation with standard details
.PARAMETER CloneId
  Clone identifier
.PARAMETER ParentId
  Golden image parent identifier
.PARAMETER Details
  Additional details about the clone
#>
function Log-CloneCreated {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CloneId,

    [Parameter(Mandatory = $true)]
    [string]$ParentId,

    [Parameter()]
    [string]$Details
  )

  $changeDetails = @{
    cloneId = $CloneId
    parentId = $ParentId
    createdAt = Get-Date -Format 'o'
  }

  Write-AuditLog -Operation CREATE -Resource Clone -ResourceId $CloneId `
    -Details "Clone created from $ParentId : $Details" `
    -Changes @{ before = $null; after = $changeDetails }
}

<#
.SYNOPSIS
  Logs a checkpoint creation
.DESCRIPTION
  Convenience function to log checkpoint creation
.PARAMETER CheckpointId
  Checkpoint identifier
.PARAMETER CloneId
  Associated clone identifier
.PARAMETER Details
  Additional details
#>
function Log-CheckpointCreated {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CheckpointId,

    [Parameter(Mandatory = $true)]
    [string]$CloneId,

    [Parameter()]
    [string]$Details
  )

  Write-AuditLog -Operation CREATE -Resource Checkpoint -ResourceId $CheckpointId `
    -Details "Checkpoint created for clone $CloneId : $Details" `
    -Changes @{ before = $null; after = @{ checkpointId = $CheckpointId; cloneId = $CloneId } }
}

<#
.SYNOPSIS
  Logs a clone deletion
.DESCRIPTION
  Convenience function to log clone deletion
.PARAMETER CloneId
  Clone identifier being deleted
#>
function Log-CloneDeleted {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CloneId
  )

  Write-AuditLog -Operation DELETE -Resource Clone -ResourceId $CloneId `
    -Details "Clone deleted" `
    -Changes @{ before = @{ cloneId = $CloneId }; after = $null }
}

<#
.SYNOPSIS
  Logs a checkpoint deletion
.DESCRIPTION
  Convenience function to log checkpoint deletion
.PARAMETER CheckpointId
  Checkpoint identifier being deleted
.PARAMETER CloneId
  Associated clone identifier
#>
function Log-CheckpointDeleted {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$CheckpointId,

    [Parameter(Mandatory = $true)]
    [string]$CloneId
  )

  Write-AuditLog -Operation DELETE -Resource Checkpoint -ResourceId $CheckpointId `
    -Details "Checkpoint deleted from clone $CloneId" `
    -Changes @{ before = @{ checkpointId = $CheckpointId }; after = $null }
}

# Export public functions
Export-ModuleMember -Function @(
  'Write-AuditLog',
  'Get-AuditLog',
  'Get-AuditLogStats',
  'Log-CloneCreated',
  'Log-CheckpointCreated',
  'Log-CloneDeleted',
  'Log-CheckpointDeleted',
  'Redact-SensitiveData'
)
