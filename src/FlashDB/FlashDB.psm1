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
$script:SqlOperationsAvailable = $false

# Get module root path
$script:ModuleRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

# Import core modules
Write-Verbose "Loading FlashDB Core modules from $script:ModuleRoot..."

# Import SQL Operations Adapter (Phase 2: dbatools integration)
Write-Verbose "Loading SQL Operations Adapter from $script:ModuleRoot\SqlOperations..."
Import-Module -Name "$script:ModuleRoot\SqlOperations\FlashDB.SqlOperations.psm1" -Force -ErrorAction Continue
if (Get-Module -Name FlashDB.SqlOperations -ErrorAction SilentlyContinue) {
    Write-Verbose "SQL Operations Adapter (dbatools) loaded successfully"
    $script:SqlOperationsAvailable = $true
    # Export SqlOperations functions for use by providers
    $sqlOpsFunctions = @(
        'Restore-SqlDatabase'
        'Mount-SqlDatabase'
        'Dismount-SqlDatabase'
        'Test-SqlServerConnection'
        'Test-SqlOperationsHealth'
        'Get-SqlOperationsDependencies'
    )
    foreach ($func in $sqlOpsFunctions) {
        if (Get-Command -Name $func -Module FlashDB.SqlOperations -ErrorAction SilentlyContinue) {
            Export-ModuleMember -Function $func
        }
    }
} else {
    Write-Warning "SQL Operations Adapter (dbatools integration) failed to load. Backup/restore operations may use legacy methods."
}

# Import VHD Operations Module (Phase 4: VHD lifecycle)
Write-Verbose "Loading VHD Operations Module from $script:ModuleRoot\VhdOperations..."
Import-Module -Name "$script:ModuleRoot\VhdOperations\FlashDB.VhdOperations.psm1" -Force -ErrorAction Continue
if (Get-Module -Name FlashDB.VhdOperations -ErrorAction SilentlyContinue) {
    Write-Verbose "VHD Operations Module (VHDX lifecycle) loaded successfully"
    $script:VhdOperationsAvailable = $true
    # Export VHD Operations functions for use by providers
    $vhdOpsFunctions = @(
        'New-FlashdbBaseDisk'
        'New-FlashdbDifferencingDisk'
        'Mount-FlashdbDisk'
        'Dismount-FlashdbDisk'
        'Test-FlashdbDiskChain'
        'Remove-FlashdbDisk'
        'Invoke-FlashdbDiskCleanup'
        'Test-FlashdbVhdHealth'
    )
    foreach ($func in $vhdOpsFunctions) {
        if (Get-Command -Name $func -Module FlashDB.VhdOperations -ErrorAction SilentlyContinue) {
            Export-ModuleMember -Function $func
        }
    }
} else {
    Write-Warning "VHD Operations Module failed to load. Disk operations may use legacy methods."
    $script:VhdOperationsAvailable = $false
}

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

# Import batch operations
. "$script:ModuleRoot\Core\BatchOperations.ps1"

# Import Golden Image Provider
. "$script:ModuleRoot\Providers\GoldenImageProvider.ps1"

# Import Search Engine
. "$script:ModuleRoot\Core\SearchEngine.ps1"

# Import Metrics Collector
. "$script:ModuleRoot\Core\MetricsCollector.ps1"

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
        # Initialize default configuration from environment or use sensible defaults
        $tempRoot = [System.IO.Path]::GetTempPath()
        if ([string]::IsNullOrWhiteSpace($tempRoot)) {
            $tempRoot = if ($IsWindows -and $env:TEMP) { $env:TEMP } else { "/tmp" }
        }

        $goldenImagePath = $env:FLASHDB_GOLDEN_IMAGE_PATH
        if (-not $goldenImagePath) {
            $goldenImagePath = Join-Path -Path $tempRoot -ChildPath "flashdb/golden-images"
        }

        $cloneStoragePath = $env:FLASHDB_CLONE_STORAGE_PATH
        if (-not $cloneStoragePath) {
            $cloneStoragePath = Join-Path -Path $tempRoot -ChildPath "flashdb/clones"
        }

        $script:FlashdbConfig = [PSCustomObject]@{
            goldenImagePath = $goldenImagePath
            defaultCloneStoragePath = $cloneStoragePath
            sqlServerProvider = @{
                defaultInstance = if ($env:FLASHDB_SQL_INSTANCE) { $env:FLASHDB_SQL_INSTANCE } else { "LOCALHOST\SQLEXPRESS" }
                authMethod = if ($env:FLASHDB_SQL_AUTH_METHOD) { $env:FLASHDB_SQL_AUTH_METHOD } else { "Windows" }
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
    Gets the status of SQL Operations (dbatools) support

.DESCRIPTION
    Returns whether the dbatools SQL Operations adapter is available.
    Providers should check this before using dbatools functions.

.EXAMPLE
    if ((Get-FlashdbSqlOperationsStatus).Available) {
        # Use dbatools functions
        Restore-SqlDatabase ...
    }

.OUTPUTS
    PSCustomObject with Available property
#>
function Get-FlashdbSqlOperationsStatus {
    [CmdletBinding()]
    param()

    $available = $script:SqlOperationsAvailable
    $status = if ($available) {
        try {
            Test-SqlOperationsHealth
        } catch {
            @{ Healthy = $false; Issues = @($_) }
        }
    } else {
        @{ Healthy = $false; Issues = @('SQL Operations Adapter not loaded') }
    }

    return [PSCustomObject]@{
        Available = $available
        Status = $status
    }
}

<#
.SYNOPSIS
    Restores a SQL Server database using dbatools if available

.DESCRIPTION
    Wrapper that uses dbatools Restore-SqlDatabase if the adapter is loaded,
    otherwise falls back to legacy restore methods.
    Providers should use this instead of direct SQL restore calls.

.PARAMETER BackupFile
    Path to the backup file

.PARAMETER DestinationServer
    SQL Server instance to restore to

.PARAMETER DestinationDatabase
    Target database name

.OUTPUTS
    Restoration result object
#>
function Invoke-FlashdbDatabaseRestore {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$BackupFile,

        [Parameter(Mandatory = $true)]
        [string]$DestinationServer,

        [Parameter(Mandatory = $true)]
        [string]$DestinationDatabase
    )

    if ($script:SqlOperationsAvailable) {
        Write-Verbose "[FlashDB] Using dbatools Restore-SqlDatabase"
        try {
            return Restore-SqlDatabase `
                -BackupFile $BackupFile `
                -DestinationServer $DestinationServer `
                -DestinationDatabase $DestinationDatabase
        } catch {
            Write-Warning "dbatools restore failed, falling back to legacy method: $_"
        }
    }

    Write-Verbose "[FlashDB] Using legacy SQL restore"
    # Fall back to legacy restore method (existing implementation)
    throw "Legacy restore method not yet wired. Requires dbatools or manual implementation."
}

<#
.SYNOPSIS
    Attaches a SQL Server database using dbatools if available

.DESCRIPTION
    Wrapper that uses dbatools Mount-SqlDatabase if the adapter is loaded,
    otherwise falls back to legacy attach methods.
    Providers should use this instead of direct SQL attach calls.

.PARAMETER ServerInstance
    SQL Server instance

.PARAMETER Database
    Database name

.OUTPUTS
    Mount result object
#>
function Invoke-FlashdbDatabaseMount {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServerInstance,

        [Parameter(Mandatory = $true)]
        [string]$Database
    )

    if ($script:SqlOperationsAvailable) {
        Write-Verbose "[FlashDB] Using dbatools Mount-SqlDatabase"
        try {
            return Mount-SqlDatabase `
                -ServerInstance $ServerInstance `
                -Database $Database
        } catch {
            Write-Warning "dbatools mount failed, falling back to legacy method: $_"
        }
    }

    Write-Verbose "[FlashDB] Using legacy SQL attach"
    throw "Legacy attach method not yet wired. Requires dbatools or manual implementation."
}

<#
.SYNOPSIS
    Detaches a SQL Server database using dbatools if available

.DESCRIPTION
    Wrapper that uses dbatools Dismount-SqlDatabase if the adapter is loaded,
    otherwise falls back to legacy detach methods.
    Providers should use this instead of direct SQL detach calls.

.PARAMETER ServerInstance
    SQL Server instance

.PARAMETER Database
    Database name

.OUTPUTS
    Dismount result object
#>
function Invoke-FlashdbDatabaseDismount {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ServerInstance,

        [Parameter(Mandatory = $true)]
        [string]$Database
    )

    if ($script:SqlOperationsAvailable) {
        Write-Verbose "[FlashDB] Using dbatools Dismount-SqlDatabase"
        try {
            return Dismount-SqlDatabase `
                -ServerInstance $ServerInstance `
                -Database $Database
        } catch {
            Write-Warning "dbatools dismount failed, falling back to legacy method: $_"
        }
    }

    Write-Verbose "[FlashDB] Using legacy SQL detach"
    throw "Legacy detach method not yet wired. Requires dbatools or manual implementation."
}

<#
.SYNOPSIS
    Gets VHD Operations status

.DESCRIPTION
    Returns whether the VHD/VHDX Lifecycle module is available.
    Providers should check this before using VHD operations.

.EXAMPLE
    if ((Get-FlashdbVhdOperationsStatus).Available) {
        # Use VHD functions
        New-FlashdbBaseDisk ...
    }

.OUTPUTS
    PSCustomObject with Available property
#>
function Get-FlashdbVhdOperationsStatus {
    [CmdletBinding()]
    param()

    $available = $script:VhdOperationsAvailable
    return [PSCustomObject]@{
        Available = $available
        Status = if ($available) { "Ready" } else { "Not Available" }
    }
}

<#
.SYNOPSIS
    Creates a clone disk using VHD Operations module

.DESCRIPTION
    Wrapper that uses FlashDB.VhdOperations New-FlashdbDifferencingDisk if available,
    otherwise falls back to legacy VHD operations.
    Providers should use this for clone disk creation.

.PARAMETER ParentDiskPath
    Path to parent (golden image) disk

.PARAMETER CloneDiskPath
    Path for new clone differencing disk

.OUTPUTS
    Disk creation result object
#>
function Invoke-FlashdbCloneDiskCreate {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$ParentDiskPath,

        [Parameter(Mandatory = $true)]
        [string]$CloneDiskPath
    )

    if ($script:VhdOperationsAvailable) {
        Write-Verbose "[FlashDB] Using VHD Operations New-FlashdbDifferencingDisk"
        try {
            return New-FlashdbDifferencingDisk `
                -ParentPath $ParentDiskPath `
                -Path $CloneDiskPath
        } catch {
            Write-Warning "VHD Operations failed, falling back to legacy method: $_"
        }
    }

    Write-Verbose "[FlashDB] Using legacy New-VHD for differencing disk"
    try {
        $result = @{
            Success = $false
            Path = $CloneDiskPath
            Diagnostics = @()
        }
        New-VHD -Path $CloneDiskPath -ParentPath $ParentDiskPath -ErrorAction Stop | Out-Null
        $result.Success = $true
        $result.Diagnostics += "Clone disk created via New-VHD: $CloneDiskPath"
        return [PSCustomObject]$result
    } catch {
        throw "Failed to create clone disk: $_"
    }
}

<#
.SYNOPSIS
    Mounts a clone disk using VHD Operations module

.DESCRIPTION
    Wrapper that uses FlashDB.VhdOperations Mount-FlashdbDisk if available,
    otherwise falls back to legacy Mount-VHD.
    Providers should use this for clone disk mounting.

.PARAMETER DiskPath
    Path to disk to mount

.OUTPUTS
    Mount result object
#>
function Invoke-FlashdbCloneDiskMount {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$DiskPath
    )

    if ($script:VhdOperationsAvailable) {
        Write-Verbose "[FlashDB] Using VHD Operations Mount-FlashdbDisk"
        try {
            return Mount-FlashdbDisk -Path $DiskPath
        } catch {
            Write-Warning "VHD Operations mount failed, falling back to legacy method: $_"
        }
    }

    Write-Verbose "[FlashDB] Using legacy Mount-VHD"
    try {
        $disk = Mount-VHD -Path $DiskPath -PassThru -ErrorAction Stop
        return [PSCustomObject]@{
            Success = $true
            DiskNumber = $disk.DiskNumber
            Attached = $disk.Attached
            Path = $DiskPath
            Diagnostics = @("Mounted via Mount-VHD")
        }
    } catch {
        throw "Failed to mount clone disk: $_"
    }
}

<#
.SYNOPSIS
    Dismounts a clone disk using VHD Operations module

.DESCRIPTION
    Wrapper that uses FlashDB.VhdOperations Dismount-FlashdbDisk if available,
    otherwise falls back to legacy Dismount-VHD.
    Providers should use this for safe clone disk dismounting.

.PARAMETER DiskPath
    Path to disk to dismount

.OUTPUTS
    Dismount result object
#>
function Invoke-FlashdbCloneDiskDismount {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$DiskPath
    )

    if ($script:VhdOperationsAvailable) {
        Write-Verbose "[FlashDB] Using VHD Operations Dismount-FlashdbDisk"
        try {
            return Dismount-FlashdbDisk -Path $DiskPath
        } catch {
            Write-Warning "VHD Operations dismount failed, falling back to legacy method: $_"
        }
    }

    Write-Verbose "[FlashDB] Using legacy Dismount-VHD"
    try {
        Dismount-VHD -Path $DiskPath -ErrorAction Stop
        return [PSCustomObject]@{
            Success = $true
            Path = $DiskPath
            Diagnostics = @("Dismounted via Dismount-VHD")
        }
    } catch {
        throw "Failed to dismount clone disk: $_"
    }
}

<#
.SYNOPSIS
    Removes a clone disk using VHD Operations module

.DESCRIPTION
    Wrapper that uses FlashDB.VhdOperations Remove-FlashdbDisk if available,
    otherwise falls back to legacy file deletion.
    Providers should use this for safe clone disk cleanup.

.PARAMETER DiskPath
    Path to disk to remove

.OUTPUTS
    Removal result object
#>
function Invoke-FlashdbCloneDiskRemove {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$DiskPath
    )

    if ($script:VhdOperationsAvailable) {
        Write-Verbose "[FlashDB] Using VHD Operations Remove-FlashdbDisk"
        try {
            return Remove-FlashdbDisk -Path $DiskPath
        } catch {
            Write-Warning "VHD Operations removal failed, falling back to legacy method: $_"
        }
    }

    Write-Verbose "[FlashDB] Using legacy file deletion"
    try {
        if (Test-Path -Path $DiskPath) {
            Remove-Item -Path $DiskPath -Force -ErrorAction Stop
            return [PSCustomObject]@{
                Success = $true
                Path = $DiskPath
                Diagnostics = @("Removed via Remove-Item")
            }
        } else {
            return [PSCustomObject]@{
                Success = $true
                Path = $DiskPath
                Diagnostics = @("File does not exist (already removed)")
            }
        }
    } catch {
        throw "Failed to remove clone disk: $_"
    }
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
        Write-Verbose "Environment issues detected:"
        foreach ($issue in $envTest.Issues) {
            Write-Verbose "  - $issue"
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
        $pathExists = $false
        try {
            $pathExists = Test-Path -Path $path -PathType Container -ErrorAction Stop
        } catch {
            # Path is inaccessible (e.g., UNC path to non-existent server)
            $pathExists = $false
        }

        if (-not $pathExists) {
            try {
                New-Item -ItemType Directory -Path $path -Force | Out-Null
                Write-Verbose "Created directory: $path"
            } catch {
                Write-Verbose "Failed to create directory: $path ($_)"
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
    Write-Verbose "FlashDB loaded with configuration warnings. Run Test-FlashdbEnvironment for details."
}

Set-Alias -Name nfgi -Value New-FlashdbGoldenImage
Set-Alias -Name gfgi -Value Get-FlashdbGoldenImage
Set-Alias -Name nfc -Value New-FlashdbClone
Set-Alias -Name gfc -Value Get-FlashdbClone
Set-Alias -Name cfc -Value Connect-FlashdbClone
Set-Alias -Name dfc -Value Disconnect-FlashdbClone
Set-Alias -Name nfcp -Value New-FlashdbCheckpoint
Set-Alias -Name gfcp -Value Get-FlashdbCheckpoint
Set-Alias -Name rfc -Value Restore-FlashdbCheckpoint

# Export public functions
Export-ModuleMember -Function @(
    # Configuration
    'Get-FlashdbConfig'
    'Set-FlashdbConfig'
    'Test-FlashdbEnvironment'
    'Get-FlashdbModuleInfo'
    'Initialize-FlashdbEnvironment'
    'Get-FlashdbProviderRegistry'

    # Golden Image Management
    'New-FlashdbGoldenImage'
    'Get-FlashdbGoldenImage'
    'Get-FlashdbDatabaseSchema'
    'Update-FlashdbGoldenImage'
    'Update-FlashdbGoldenImageSizes'
    'Remove-FlashdbGoldenImage'
    'Get-FlashdbGoldenImageInfo'

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

    # Batch Operations
    'New-FlashdbBatchOperation'
    'Get-FlashdbBatchOperation'
    'Get-FlashdbBatchOperations'
    'Start-FlashdbBatchQueue'
    'Cancel-FlashdbBatchOperation'
    'Get-FlashdbBatchResults'

    # Search and Filtering
    'Search-FlashdbOperations'
    'Filter-FlashdbClones'
    'Filter-FlashdbCheckpoints'
    'Get-FlashdbSearchSuggestions'

    # Metrics and Analytics
    'Get-FlashdbMetrics'
    'Get-CloneCreationStats'
    'Get-StorageStats'
    'Get-OperationStats'
    'Get-TimelineData'
)

# Export module variables
Export-ModuleMember -Variable @(
    'FlashdbConfig'
    'FlashdbProviderRegistry'
)

Export-ModuleMember -Alias @(
    'nfgi',
    'gfgi',
    'nfc',
    'gfc',
    'cfc',
    'dfc',
    'nfcp',
    'gfcp',
    'rfc'
)

Write-Verbose "FlashDB module loaded successfully (v0.1.0)"
