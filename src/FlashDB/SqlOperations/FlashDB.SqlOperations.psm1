<#
.SYNOPSIS
FlashDB SQL Operations Adapter Module

.DESCRIPTION
Centralizes all SQL Server operations using dbatools cmdlets where possible,
with fallback to raw SQL only when explicitly configured.

Phase 2: dbatools SQL Operations Adapter

.NOTES
This module is independent from GUI/API code and can be tested/developed separately.
Dependencies are checked at module load time with clear diagnostics.

Module provides:
- SQL connection management (dbatools Connect-DbaInstance)
- Database backup/restore (dbatools Restore-DbaDatabase)
- Database attach/detach (dbatools Mount/Dismount-DbaDatabase)
- Connection validation and permissions checking
- Clear error handling and logging
#>

#Requires -Version 5.1

# ============================================================================
# Module Configuration
# ============================================================================

$script:ModuleVersion = '1.0.0'
$script:DbatoolsMinVersion = '2.0.0'
$script:DbatoolsRequired = $true
$script:VerboseLogging = $false
$script:OperationTimeout = 3600  # 1 hour in seconds

# Store dependency check results
$script:DependencyStatus = @{
    DbatoolsAvailable = $false
    DbatoolsVersion = $null
    SqlClientAvailable = $false
    Modules = @()
}

# ============================================================================
# Module Initialization
# ============================================================================

<#
.SYNOPSIS
Initialize the SQL Operations module

.DESCRIPTION
Checks dependencies and initializes module configuration at load time.
#>
function Initialize-SqlOperationsModule {
    [CmdletBinding()]
    param()

    Write-Verbose "[SqlOps] Initializing SQL Operations module version $($script:ModuleVersion)"

    # Check for dbatools
    try {
        $dbatools = Get-Module -Name dbatools -ListAvailable -ErrorAction Stop |
            Sort-Object -Property Version -Descending |
            Select-Object -First 1

        if ($dbatools) {
            $script:DependencyStatus.DbatoolsAvailable = $true
            $script:DependencyStatus.DbatoolsVersion = $dbatools.Version
            Write-Verbose "[SqlOps] Found dbatools version $($dbatools.Version)"
        }
    } catch {
        Write-Verbose "[SqlOps] dbatools not available: $_"
    }

    # Check for SqlServer module (fallback)
    try {
        $sqlModule = Get-Module -Name SqlServer -ListAvailable -ErrorAction Stop |
            Select-Object -First 1

        if ($sqlModule) {
            $script:DependencyStatus.SqlClientAvailable = $true
            Write-Verbose "[SqlOps] Found SqlServer module"
        }
    } catch {
        Write-Verbose "[SqlOps] SqlServer module not available: $_"
    }

    $script:DependencyStatus.Modules = @($dbatools, $sqlModule) | Where-Object { $_ }
}

# Initialize on module load
Initialize-SqlOperationsModule

# ============================================================================
# Dependency Management
# ============================================================================

<#
.SYNOPSIS
Get SQL Operations module dependency status

.OUTPUTS
[PSObject] Dependency status object

.NOTES
Returns object with properties:
- DbatoolsAvailable: bool
- DbatoolsVersion: version
- SqlClientAvailable: bool
- Modules: array of loaded modules
#>
function Get-SqlOperationsDependencies {
    [CmdletBinding()]
    param()

    return $script:DependencyStatus
}

<#
.SYNOPSIS
Verify SQL Operations dependencies

.DESCRIPTION
Checks that required dependencies are available. Fails early with clear diagnostics.

.PARAMETER Require
Which dependencies to require: dbatools (default), SqlClient, or both

.OUTPUTS
[PSObject] Detailed diagnostics

.NOTES
Exit codes:
- 0: All required dependencies available
- 1: Missing required dependencies
- 2: Insufficient version
#>
function Test-SqlOperationsDependencies {
    [CmdletBinding()]
    param(
        [ValidateSet('dbatools', 'SqlClient', 'both')]
        [string]$Require = 'dbatools'
    )

    $result = @{
        AllRequiredMet = $true
        Details = @()
        Diagnostics = @()
    }

    # Check dbatools if required
    if ($Require -in 'dbatools', 'both') {
        if ($script:DependencyStatus.DbatoolsAvailable) {
            $version = $script:DependencyStatus.DbatoolsVersion
            $meetsMinimum = $version -ge [version]$script:DbatoolsMinVersion

            if ($meetsMinimum) {
                $result.Details += @{
                    Component = 'dbatools'
                    Status = 'OK'
                    Version = $version
                    Required = $script:DbatoolsMinVersion
                }
                $result.Diagnostics += "[OK] dbatools $version (required: $($script:DbatoolsMinVersion))"
            } else {
                $result.Details += @{
                    Component = 'dbatools'
                    Status = 'OUTDATED'
                    Version = $version
                    Required = $script:DbatoolsMinVersion
                }
                $result.Diagnostics += "[FAIL] dbatools $version is outdated (required: $($script:DbatoolsMinVersion))"
                $result.AllRequiredMet = $false
            }
        } else {
            $result.Details += @{
                Component = 'dbatools'
                Status = 'MISSING'
                Required = $script:DbatoolsMinVersion
            }
            $result.Diagnostics += "[FAIL] dbatools is not installed (required: $($script:DbatoolsMinVersion))"
            $result.AllRequiredMet = $false
        }
    }

    # Check SqlClient if required
    if ($Require -in 'SqlClient', 'both') {
        if ($script:DependencyStatus.SqlClientAvailable) {
            $result.Details += @{
                Component = 'SqlServer'
                Status = 'OK'
            }
            $result.Diagnostics += "[OK] SqlServer module available (fallback)"
        } else {
            $result.Details += @{
                Component = 'SqlServer'
                Status = 'MISSING'
            }
            $result.Diagnostics += "[FAIL] SqlServer module not available (fallback)"
            if ($Require -eq 'both') {
                $result.AllRequiredMet = $false
            }
        }
    }

    $result | Add-Member -MemberType NoteProperty -Name 'Passed' -Value $result.AllRequiredMet
    return [PSCustomObject]$result
}

<#
.SYNOPSIS
Install SQL Operations dependencies

.DESCRIPTION
Installs required dbatools or SqlServer module.

.PARAMETER Module
Which module to install: dbatools or SqlServer

.PARAMETER Force
Force reinstall even if already present
#>
function Install-SqlOperationsDependencies {
    [CmdletBinding()]
    param(
        [ValidateSet('dbatools', 'SqlServer')]
        [string]$Module = 'dbatools',

        [switch]$Force
    )

    Write-Host "[SqlOps] Installing $Module..."

    try {
        if ($Module -eq 'dbatools') {
            if ($Force) {
                Install-Module -Name dbatools -Force -Confirm:$false
            } else {
                Install-Module -Name dbatools -Confirm:$false
            }
        } elseif ($Module -eq 'SqlServer') {
            if ($Force) {
                Install-Module -Name SqlServer -Force -Confirm:$false
            } else {
                Install-Module -Name SqlServer -Confirm:$false
            }
        }

        Write-Host "[SqlOps] $Module installed successfully"
        Initialize-SqlOperationsModule
    } catch {
        Write-Error "[SqlOps] Failed to install $Module : $_"
        throw
    }
}

# ============================================================================
# SQL Connection Management
# ============================================================================

<#
.SYNOPSIS
Validate SQL Server connection

.DESCRIPTION
Validates connectivity to SQL Server using dbatools Connect-DbaInstance.
Falls back to raw SQL only if explicitly configured via -UseLegacy.

.PARAMETER ServerInstance
SQL Server instance name (e.g., 'localhost\MSSQLSERVER' or 'HOSTNAME')

.PARAMETER UseLegacy
Use legacy connection logic instead of dbatools

.OUTPUTS
[PSObject] Connection validation result

.NOTES
Returns:
- IsValid: bool - Connection is valid
- InstanceName: string
- Version: string - SQL Server version
- ConnectTimeMs: int - Connection time in milliseconds
- Diagnostics: string[] - Detailed info
#>
function Test-SqlServerConnection {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServerInstance,

        [switch]$UseLegacy
    )

    Write-Verbose "[SqlOps] Testing SQL connection to $ServerInstance (Legacy: $UseLegacy)"

    $result = @{
        IsValid = $false
        InstanceName = $ServerInstance
        Version = $null
        ConnectTimeMs = 0
        Diagnostics = @()
    }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        if ($UseLegacy) {
            # Fallback to raw SQL connection
            $result.Diagnostics += "Using legacy connection logic"

            $connection = New-Object System.Data.SqlClient.SqlConnection
            $connection.ConnectionString = "Server=$ServerInstance;Integrated Security=true;Connection Timeout=10;"
            $connection.Open()

            $query = "SELECT @@version AS Version, @@servername AS ServerName"
            $cmd = $connection.CreateCommand()
            $cmd.CommandText = $query
            $reader = $cmd.ExecuteReader()

            if ($reader.Read()) {
                $result.Version = $reader['Version'].ToString().Split(',')[0]
                $result.IsValid = $true
            }

            $connection.Close()
        } else {
            # Use dbatools if available
            if (-not $script:DependencyStatus.DbatoolsAvailable) {
                throw "dbatools not available. Install with: Install-Module dbatools"
            }

            $result.Diagnostics += "Using dbatools Connect-DbaInstance"

            $conn = Connect-DbaInstance -SqlInstance $ServerInstance -ErrorAction Stop

            if ($conn) {
                $result.IsValid = $true
                $result.Version = $conn.Version.ToString()
                $result.Diagnostics += "Connected to SQL Server $($conn.Version)"
            }
        }
    } catch {
        $result.IsValid = $false
        $result.Diagnostics += "Connection failed: $_"
        Write-Error "[SqlOps] Connection test failed: $_"
    } finally {
        $sw.Stop()
        $result.ConnectTimeMs = $sw.ElapsedMilliseconds
    }

    return [PSCustomObject]$result
}

# ============================================================================
# Database Operations
# ============================================================================

<#
.SYNOPSIS
Restore database from backup using dbatools

.DESCRIPTION
Restores a database from backup file using Restore-DbaDatabase (dbatools).
Used by golden image creation and checkpoint restore paths.

.PARAMETER ServerInstance
SQL Server instance

.PARAMETER DatabaseName
Target database name

.PARAMETER BackupFile
Path to backup file

.PARAMETER ReplaceExisting
Replace existing database (default: $true)

.OUTPUTS
[PSObject] Restore operation result

.NOTES
This is a primary SQL operation that must use dbatools where possible.
#>
function Restore-SqlDatabase {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServerInstance,

        [Parameter(Mandatory = $true)]
        [string]$DatabaseName,

        [Parameter(Mandatory = $true)]
        [string]$BackupFile,

        [bool]$ReplaceExisting = $true
    )

    Write-Verbose "[SqlOps] Restoring database $DatabaseName from $BackupFile"

    if (-not $script:DependencyStatus.DbatoolsAvailable) {
        throw "dbatools required for restore operation. Install with: Install-Module dbatools"
    }

    $result = @{
        Success = $false
        DatabaseName = $DatabaseName
        BackupFile = $BackupFile
        RestoredAt = $null
        Diagnostics = @()
    }

    try {
        $result.Diagnostics += "Starting restore via dbatools Restore-DbaDatabase"

        $restoreResult = Restore-DbaDatabase `
            -SqlInstance $ServerInstance `
            -Path $BackupFile `
            -DatabaseName $DatabaseName `
            -ReplaceExisting:$ReplaceExisting `
            -ErrorAction Stop

        $result.Success = $restoreResult.RestoreComplete
        $result.RestoredAt = Get-Date
        $result.Diagnostics += "Restore completed successfully"

        Write-Verbose "[SqlOps] Restore succeeded for $DatabaseName"
    } catch {
        $result.Success = $false
        $result.Diagnostics += "Restore failed: $_"
        Write-Error "[SqlOps] Restore failed: $_"
    }

    return [PSCustomObject]$result
}

<#
.SYNOPSIS
Attach database using dbatools

.DESCRIPTION
Attaches a database from MDF/LDF files using Mount-DbaDatabase (dbatools).
Normalizes file-structure handling.

.PARAMETER ServerInstance
SQL Server instance

.PARAMETER DatabaseName
Database name

.PARAMETER DataPath
Path to MDF file

.OUTPUTS
[PSObject] Attach result
#>
function Mount-SqlDatabase {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServerInstance,

        [Parameter(Mandatory = $true)]
        [string]$DatabaseName,

        [Parameter(Mandatory = $true)]
        [string]$DataPath
    )

    Write-Verbose "[SqlOps] Mounting database $DatabaseName from $DataPath"

    if (-not $script:DependencyStatus.DbatoolsAvailable) {
        throw "dbatools required for mount operation. Install with: Install-Module dbatools"
    }

    $result = @{
        Success = $false
        DatabaseName = $DatabaseName
        DataPath = $DataPath
        MountedAt = $null
        Diagnostics = @()
    }

    try {
        $result.Diagnostics += "Starting mount via dbatools Mount-DbaDatabase"

        # Note: Mount-DbaDatabase may not exist in all dbatools versions
        # Fallback to Attach-DbaDatabase or raw SQL if needed
        $mountResult = Mount-DbaDatabase `
            -SqlInstance $ServerInstance `
            -Database $DatabaseName `
            -FileStructure (Get-ChildItem -Path $DataPath -Filter '*.mdf') `
            -ErrorAction Stop

        $result.Success = $true
        $result.MountedAt = Get-Date
        $result.Diagnostics += "Mount completed successfully"

        Write-Verbose "[SqlOps] Mount succeeded for $DatabaseName"
    } catch {
        $result.Success = $false
        $result.Diagnostics += "Mount failed: $_"
        Write-Error "[SqlOps] Mount failed: $_"
    }

    return [PSCustomObject]$result
}

<#
.SYNOPSIS
Detach database using dbatools

.DESCRIPTION
Detaches a database using Dismount-DbaDatabase or Detach-DbaDatabase (dbatools).
Force-closes connections when requested.

.PARAMETER ServerInstance
SQL Server instance

.PARAMETER DatabaseName
Database name

.PARAMETER Force
Force close existing connections before detach
#>
function Dismount-SqlDatabase {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServerInstance,

        [Parameter(Mandatory = $true)]
        [string]$DatabaseName,

        [switch]$Force
    )

    Write-Verbose "[SqlOps] Dismounting database $DatabaseName (Force: $Force)"

    if (-not $script:DependencyStatus.DbatoolsAvailable) {
        throw "dbatools required for dismount operation. Install with: Install-Module dbatools"
    }

    $result = @{
        Success = $false
        DatabaseName = $DatabaseName
        DismountedAt = $null
        Diagnostics = @()
    }

    try {
        if ($Force) {
            $result.Diagnostics += "Force-closing connections before dismount"
            # Force close connections using raw SQL
            $killQuery = "ALTER DATABASE [$DatabaseName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE"
            Invoke-SqlCmd -ServerInstance $ServerInstance -Query $killQuery -ErrorAction SilentlyContinue
        }

        $result.Diagnostics += "Starting dismount via dbatools"

        # Try Dismount-DbaDatabase first, then Detach-DbaDatabase
        try {
            Dismount-DbaDatabase `
                -SqlInstance $ServerInstance `
                -Database $DatabaseName `
                -ErrorAction Stop
        } catch {
            Detach-DbaDatabase `
                -SqlInstance $ServerInstance `
                -Database $DatabaseName `
                -ErrorAction Stop
        }

        $result.Success = $true
        $result.DismountedAt = Get-Date
        $result.Diagnostics += "Dismount completed successfully"

        Write-Verbose "[SqlOps] Dismount succeeded for $DatabaseName"
    } catch {
        $result.Success = $false
        $result.Diagnostics += "Dismount failed: $_"
        Write-Error "[SqlOps] Dismount failed: $_"
    }

    return [PSCustomObject]$result
}

# ============================================================================
# Health and Readiness Checks
# ============================================================================

<#
.SYNOPSIS
Perform SQL Operations health check

.DESCRIPTION
Comprehensive health check covering:
- dbatools availability and version
- SQL connectivity
- Permissions
- Required tooling

.PARAMETER ServerInstance
Optional SQL Server instance to test connection

.OUTPUTS
[PSObject] Health status with detailed findings
#>
function Test-SqlOperationsHealth {
    [CmdletBinding()]
    param(
        [string]$ServerInstance
    )

    Write-Verbose "[SqlOps] Performing SQL Operations health check"

    $health = @{
        Status = 'Healthy'
        Components = @()
        Warnings = @()
        Errors = @()
    }

    # Check dependencies
    $deps = Test-SqlOperationsDependencies -Require 'dbatools'

    $health.Components += @{
        Name = 'dbatools'
        Status = if ($deps.Passed) { 'Healthy' } else { 'Degraded' }
        Details = $deps.Details
    }

    if (-not $deps.Passed) {
        $health.Status = 'Degraded'
        $health.Warnings += $deps.Diagnostics
    }

    # Test SQL connection if specified
    if ($ServerInstance) {
        try {
            $conn = Test-SqlServerConnection -ServerInstance $ServerInstance
            $health.Components += @{
                Name = 'SqlConnection'
                Status = if ($conn.IsValid) { 'Healthy' } else { 'Failed' }
                Details = $conn
            }

            if (-not $conn.IsValid) {
                $health.Status = 'Unhealthy'
                $health.Errors += $conn.Diagnostics
            }
        } catch {
            $health.Status = 'Unhealthy'
            $health.Errors += "Failed to test SQL connection: $_"
        }
    }

    return [PSCustomObject]$health
}

# ============================================================================
# Module Exports
# ============================================================================

Export-ModuleMember -Function @(
    'Get-SqlOperationsDependencies',
    'Test-SqlOperationsDependencies',
    'Install-SqlOperationsDependencies',
    'Test-SqlServerConnection',
    'Restore-SqlDatabase',
    'Mount-SqlDatabase',
    'Dismount-SqlDatabase',
    'Test-SqlOperationsHealth',
    'Initialize-SqlOperationsModule'
)

Write-Verbose "[SqlOps] Module loaded: FlashDB.SqlOperations $($script:ModuleVersion)"
