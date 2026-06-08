@{
    RootModule           = 'FlashDB.SqlOperations.psm1'
    ModuleVersion        = '1.0.0'
    GUID                 = '12345678-1234-1234-1234-123456789012'
    Author               = 'FlashDB Team'
    CompanyName          = 'FlashDB'
    Description          = 'SQL Operations adapter using dbatools for FlashDB'
    PowerShellVersion    = '5.1'

    RequiredModules      = @()

    FunctionsToExport    = @(
        'Get-SqlOperationsDependencies'
        'Test-SqlOperationsDependencies'
        'Install-SqlOperationsDependencies'
        'Test-SqlServerConnection'
        'Restore-SqlDatabase'
        'Mount-SqlDatabase'
        'Dismount-SqlDatabase'
        'Test-SqlOperationsHealth'
        'Initialize-SqlOperationsModule'
    )

    CmdletsToExport      = @()
    VariablesToExport    = @()
    AliasesToExport      = @()

    PrivateData          = @{
        PSData = @{
            Tags         = @('FlashDB', 'SQL', 'dbatools', 'SQL-Server')
            LicenseUri   = ''
            ProjectUri   = ''
            ReleaseNotes = ''
        }
    }
}
