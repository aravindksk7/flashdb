@{
    # Module metadata
    RootModule = 'FlashDB.psm1'
    ModuleVersion = '0.1.0'
    GUID = '8c7c5e9a-2b4f-4c8d-9e1a-6b3f5c2d8e9a'
    Author = 'FlashDB Team'
    CompanyName = 'FlashDB'
    Copyright = '(c) 2026 FlashDB. All rights reserved.'
    Description = 'PowerShell module for database virtualization using VHDX differencing disks'

    # PowerShell compatibility
    PowerShellVersion = '5.1'
    CompatiblePSEditions = @('Desktop', 'Core')

    # Public cmdlets exported to users
    FunctionsToExport = @(
        # Golden Image Management
        'New-FlashdbGoldenImage'
        'Get-FlashdbGoldenImage'
        'Get-FlashdbDatabaseSchema'
        'Update-FlashdbGoldenImage'
        'Remove-FlashdbGoldenImage'

        # Clone Management
        'New-FlashdbClone'
        'Get-FlashdbClone'
        'Connect-FlashdbClone'
        'Disconnect-FlashdbClone'
        'Remove-FlashdbClone'

        # Checkpoint & Rollback
        'New-FlashdbCheckpoint'
        'Get-FlashdbCheckpoint'
        'Set-FlashdbCheckpoint'
        'Get-FlashdbCheckpointDiff'
        'Restore-FlashdbCheckpoint'
        'Restore-FlashdbClone'
        'Remove-FlashdbCheckpoint'

        # Utility
        'Test-FlashdbGoldenImage'
        'Get-FlashdbCloneMetadata'
        'Get-FlashdbStorageReport'
        'Update-FlashdbConfiguration'
    )

    # Classes exported
    VariablesToExport = @(
        'FlashdbConfig'
        'FlashdbProviderRegistry'
    )

    # Private data
    PrivateData = @{
        # Provider registry
        PSData = @{
            Tags = @('Database', 'VHDX', 'Virtualization', 'Testing', 'SQL-Server')
            LicenseUri = 'https://github.com/flashdb/flashdb/blob/main/LICENSE'
            ProjectUri = 'https://github.com/flashdb/flashdb'
            ReleaseNotes = 'Initial release - v0.1.0 with SQL Server support'
            PreRelease = 'alpha'
        }
    }

    # Required assemblies
    RequiredAssemblies = @(
        # System assemblies for SMO and VHDX operations
    )

    # Required modules
    RequiredModules = @()

    # Cmdlet definitions
    CmdletsToExport = @()

    # Aliases to export
    AliasesToExport = @(
        'nfgi'    # New-FlashdbGoldenImage
        'gfgi'    # Get-FlashdbGoldenImage
        'nfc'     # New-FlashdbClone
        'gfc'     # Get-FlashdbClone
        'cfc'     # Connect-FlashdbClone
        'dfc'     # Disconnect-FlashdbClone
        'nfcp'    # New-FlashdbCheckpoint
        'gfcp'    # Get-FlashdbCheckpoint
        'rfc'     # Restore-FlashdbCheckpoint
    )
}
