<#
.SYNOPSIS
    FlashDB - PowerShell Module for Database Virtualization

.DESCRIPTION
    FlashDB is a PowerShell-based database virtualization tool that enables rapid
    provisioning of lightweight, ephemeral clones of production-sized SQL Server
    databases using VHDX differencing disks with instant rollback via snapshots.

.NOTES
    Module Version: 0.1.0
    Author: FlashDB Team
    Created: 2026-06-06
#>

# Set strict mode
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Module-level variables
$script:FlashdbConfig = $null
$script:ProviderRegistry = @{}

# Get module root path
$script:ModuleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Import core modules
Write-Verbose "Loading FlashDB Core modules from $script:ModuleRoot..."

# Import VHDX operations (lowest level)
. "$script:ModuleRoot\Core\VhdxOperations.ps1"

# Import metadata manager
. "$script:ModuleRoot\Core\MetadataManager.ps1"

# Import state manager
. "$script:ModuleRoot\Core\StateManager.ps1"

# Import clone management
. "$script:ModuleRoot\Core\CloneManagement.ps1"

# Import checkpoint management
. "$script:ModuleRoot\Core\CheckpointManagement.ps1"

<#
.SYNOPSIS
    Gets the current FlashDB configuration

.DESCRIPTION
    Retrieves the current configuration object with all settings for
    clone storage, database providers, retention policies, etc.

.EXAMPLE
    $config = Get-FlashdbConfig

.OUTPUTS
    PSCustomObject with configuration properties
#>
function Get-FlashdbConfig {
    [CmdletBinding()]
    param()

    if (-not $script:FlashdbConfig) {
        # Initialize default configuration
        $script:FlashdbConfig = [PSCustomObject]@{
            goldenImagePath = "\\shared\GoldenImages"
            defaultCloneStoragePath = "D:\CloneStorage"
            sqlServerProvider = @{
                defaultInstance = "LOCALHOST\SQLEXPRESS"
                authMethod = "Windows"
            }
            checkpointRetentionDays = $null
            maxConcurrentClones = 5
            vhdxCompressionEnabled = $true
            metadataSchemaVersion = "1.0"
            lastLoaded = (Get-Date).ToUniversalTime().ToString("o")
        }
    }

    return $script:FlashdbConfig
}

<#
.SYNOPSIS
    Sets FlashDB configuration properties

.DESCRIPTION
    Updates one or more FlashDB configuration settings.

.PARAMETER Property
    Configuration property name

.PARAMETER Value
    Value to set

.EXAMPLE
    Set-FlashdbConfig -Property "defaultCloneStoragePath" -Value "E:\CloneStorage"

.OUTPUTS
    System.Object with updated configuration
#>
function Set-FlashdbConfig {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Property,

        [Parameter(Mandatory = $true)]
        $Value
    )

    $config = Get-FlashdbConfig

    if (-not $config.PSObject.Properties.Name -contains $Property) {
        throw "Invalid configuration property: $Property"
    }

    $config.$Property = $Value

    Write-Verbose "Configuration updated: $Property = $Value"

    return $config
}

<#
.SYNOPSIS
    Tests FlashDB environment prerequisites

.DESCRIPTION
    Verifies that the FlashDB environment has all required components:
    - Windows VHDX support
    - Storage paths accessible
    - PowerShell version compatibility
    - Required modules available

.PARAMETER Verbose
    Show detailed diagnostic information

.EXAMPLE
    Test-FlashdbEnvironment

.OUTPUTS
    System.Object with test results
#>
function Test-FlashdbEnvironment {
    [CmdletBinding()]
    param()

    $results = @{
        PowerShellVersion = $PSVersionTable.PSVersion.ToString()
        OperatingSystem = [System.Environment]::OSVersion.VersionString
        VhdxSupport = $false
        StoragePathsAccessible = $true
        RequiredModulesLoaded = $true
        Issues = @()
    }

    # Check PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        $results.Issues += "PowerShell 5.1 or higher required (current: $($PSVersionTable.PSVersion))"
    }

    # Check VHDX support
    try {
        $vhdxSupport = Get-Command -Name Get-VHD -ErrorAction Stop
        $results.VhdxSupport = $true
    } catch {
        $results.VhdxSupport = $false
        $results.Issues += "Windows VHDX cmdlets not available. Requires Windows Server 2012 R2+ or Windows 8.1+"
    }

    # Check storage paths
    $config = Get-FlashdbConfig
    $storagePaths = @(
        $config.goldenImagePath
        $config.defaultCloneStoragePath
    )

    foreach ($path in $storagePaths) {
        $pathExists = $false
        try {
            $pathExists = Test-Path -Path $path -PathType Container -ErrorAction Stop
        } catch {
            # Path doesn't exist or is inaccessible (e.g., UNC to non-existent server)
            $pathExists = $false
        }

        if (-not $pathExists) {
            try {
                New-Item -ItemType Directory -Path $path -Force -ErrorAction Stop | Out-Null
                Write-Verbose "Created storage path: $path"
            } catch {
                $results.StoragePathsAccessible = $false
                $results.Issues += "Cannot access/create storage path: $path - $($_.Exception.Message)"
            }
        }
    }

    # Check required cmdlet availability
    $requiredCmdlets = @('Mount-VHD', 'Dismount-VHD', 'New-VHD', 'Get-VHD')
    foreach ($cmdlet in $requiredCmdlets) {
        if (-not (Get-Command -Name $cmdlet -ErrorAction SilentlyContinue)) {
            $results.RequiredModulesLoaded = $false
            $results.Issues += "Required cmdlet not available: $cmdlet"
        }
    }

    return [PSCustomObject]$results
}

<#
.SYNOPSIS
    Gets module information

.DESCRIPTION
    Returns version, status, and capability information about the FlashDB module.

.EXAMPLE
    Get-FlashdbModuleInfo

.OUTPUTS
    System.Object with module information
#>
function Get-FlashdbModuleInfo {
    [CmdletBinding()]
    param()

    return [PSCustomObject]@{
        Name = "FlashDB"
        Version = "0.1.0"
        ModuleRoot = $script:ModuleRoot
        LoadedAt = (Get-Date).ToUniversalTime().ToString("o")
        SupportedDatabases = @('sql-server', 'postgresql', 'mysql')
        AvailableProviders = @(Get-FlashdbProviderRegistry).Keys
        Features = @(
            'Clone Management'
            'VHDX Differencing Disks'
            'Checkpoint/Snapshot Support'
            'Metadata Management'
            'State Machine'
            'Multi-Database Support'
        )
        Status = if ((Test-FlashdbEnvironment).Issues.Count -eq 0) { 'Ready' } else { 'Warnings' }
    }
}

<#
.SYNOPSIS
    Gets registered database providers

.DESCRIPTION
    Returns list of available database providers for different database types.

.EXAMPLE
    Get-FlashdbProviderRegistry

.OUTPUTS
    Hashtable with provider information
#>
function Get-FlashdbProviderRegistry {
    [CmdletBinding()]
    param()

    # Initialize with SQL Server provider
    if ($script:ProviderRegistry.Count -eq 0) {
        $script:ProviderRegistry['sql-server'] = @{
            Name = 'SQL Server Provider'
            Version = '0.1.0'
            Supported = $true
            Methods = @('BackupRestore', 'ReplicaBackup', 'TableByTableCopy')
        }
        # Other providers can be registered here in future
    }

    return $script:ProviderRegistry
}

<#
.SYNOPSIS
    Initializes FlashDB environment

.DESCRIPTION
    Performs one-time initialization tasks including creating storage
    directories, validating configuration, and registering providers.

.PARAMETER Force
    Force reinitialization even if already initialized

.EXAMPLE
    Initialize-FlashdbEnvironment

.OUTPUTS
    System.Object with initialization results
#>
function Initialize-FlashdbEnvironment {
    [CmdletBinding()]
    param(
        [Parameter()]
        [switch]$Force
    )

    Write-Verbose "Initializing FlashDB environment..."

    # Test environment
    $envTest = Test-FlashdbEnvironment
    if ($envTest.Issues.Count -gt 0) {
        Write-Warning "Environment issues detected:"
        foreach ($issue in $envTest.Issues) {
            Write-Warning "  - $issue"
        }
    }

    # Ensure storage paths exist
    $config = Get-FlashdbConfig
    $storagePaths = @(
        $config.goldenImagePath
        $config.defaultCloneStoragePath
        "$($config.defaultCloneStoragePath)\backups"
        "$($config.defaultCloneStoragePath)\checkpoints"
    )

    foreach ($path in $storagePaths) {
        if (-not (Test-Path -Path $path -PathType Container)) {
            try {
                New-Item -ItemType Directory -Path $path -Force | Out-Null
                Write-Verbose "Created directory: $path"
            } catch {
                Write-Warning "Failed to create directory: $path ($_)"
            }
        }
    }

    # Register providers
    Get-FlashdbProviderRegistry | Out-Null

    return [PSCustomObject]@{
        Initialized = $envTest.Issues.Count -eq 0
        ConfigVersion = $config.metadataSchemaVersion
        StoragePathsReady = $true
        ProvidersRegistered = (Get-FlashdbProviderRegistry).Count
        Issues = $envTest.Issues
        InitializedAt = (Get-Date).ToUniversalTime().ToString("o")
    }
}

# Run initialization on module load
$initResult = Initialize-FlashdbEnvironment
if ($initResult.Issues.Count -gt 0) {
    Write-Warning "FlashDB loaded with configuration warnings. Run Test-FlashdbEnvironment for details."
}

# Export public functions
Export-ModuleMember -Function @(
    # Configuration
    'Get-FlashdbConfig'
    'Set-FlashdbConfig'
    'Test-FlashdbEnvironment'
    'Get-FlashdbModuleInfo'
    'Initialize-FlashdbEnvironment'
    'Get-FlashdbProviderRegistry'

    # Clone Management
    'New-FlashdbClone'
    'Get-FlashdbClone'
    'Connect-FlashdbClone'
    'Disconnect-FlashdbClone'
    'Remove-FlashdbClone'

    # Checkpoint Management
    'New-FlashdbCheckpoint'
    'Get-FlashdbCheckpoint'
    'Set-FlashdbCheckpoint'
    'Get-FlashdbCheckpointDiff'
    'Restore-FlashdbCheckpoint'
    'Restore-FlashdbClone'
    'Remove-FlashdbCheckpoint'

    # Metadata Management
    'Get-FlashdbMetadata'
    'Save-FlashdbMetadata'
    'Test-MetadataSchema'
    'Export-FlashdbMetadata'
    'Add-FlashdbOperationLog'
    'Get-FlashdbMetadataSchemaInfo'

    # State Management
    'Get-FlashdbCloneState'
    'Set-FlashdbCloneState'
    'Test-FlashdbCloneState'
    'Find-FlashdbOrphanedClones'
    'Get-FlashdbStateTransitionRules'

    # VHDX Operations
    'New-VhdxDifferencingDisk'
    'Mount-VhdxDisk'
    'Dismount-VhdxDisk'
    'New-VhdxSnapshot'
    'Restore-VhdxSnapshot'
    'Get-VhdxInfo'
    'Test-VhdxIntegrity'
)

# Export module variables
Export-ModuleMember -Variable @(
    'FlashdbConfig'
    'FlashdbProviderRegistry'
)

Write-Verbose "FlashDB module loaded successfully (v0.1.0)"
