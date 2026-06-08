<#
.SYNOPSIS
Pester Tests for FlashDB.SqlOperations module

.DESCRIPTION
Tests for the SQL Operations adapter covering success and failure scenarios.
Tests use mocks to avoid requiring SQL Server or dbatools.

Phase 2, Step 8: Add Pester tests for adapter
#>

Describe 'FlashDB.SqlOperations Module' {
    BeforeAll {
        # Import the module
        $ModulePath = Join-Path -Path $PSScriptRoot -ChildPath 'FlashDB.SqlOperations.psm1'
        Import-Module -Name $ModulePath -Force
    }

    Context 'Module Initialization' {
        It 'Should load the module' {
            Get-Module -Name FlashDB.SqlOperations | Should -Not -BeNullOrEmpty
        }

        It 'Should export required functions' {
            $functions = @(
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

            foreach ($func in $functions) {
                Get-Command -Name $func -Module FlashDB.SqlOperations -ErrorAction SilentlyContinue | Should -Not -BeNullOrEmpty
            }
        }
    }

    Context 'Dependency Management' {
        It 'Should get dependency status' {
            $status = Get-SqlOperationsDependencies
            $status | Should -Not -BeNullOrEmpty
            $status.DbatoolsAvailable | Should -BeOfType [bool]
            $status.SqlClientAvailable | Should -BeOfType [bool]
        }

        It 'Should test dependencies and return result object' {
            $result = Test-SqlOperationsDependencies -Require 'both'
            $result | Should -Not -BeNullOrEmpty
            $result.Passed | Should -BeOfType [bool]
            $result.AllRequiredMet | Should -BeOfType [bool]
            $result.Details | Should -BeOfType [array]
            $result.Diagnostics | Should -BeOfType [array]
        }

        It 'Should handle missing dbatools gracefully' {
            # This test verifies that the module handles missing dbatools
            $result = Test-SqlOperationsDependencies -Require 'dbatools'
            $result | Should -Not -BeNullOrEmpty

            if (-not $result.Passed) {
                $result.Diagnostics | Should -Contain '*dbatools*'
            }
        }

        It 'Should provide clear diagnostic messages' {
            $result = Test-SqlOperationsDependencies -Require 'both'
            $result.Diagnostics | Should -BeOfType [array]
            $result.Diagnostics | ForEach-Object { $_ | Should -BeOfType [string] }
        }
    }

    Context 'SQL Connection Management' {
        It 'Should handle connection test with legacy mode' {
            # Mock SqlClient connection
            Mock -CommandName 'New-Object' -MockWith {
                param($TypeName)
                if ($TypeName -eq 'System.Data.SqlClient.SqlConnection') {
                    @{
                        ConnectionString = ''
                        Open             = { }
                        CreateCommand    = { @{ CommandText = ''; ExecuteReader = { } } }
                        Close            = { }
                    }
                }
            } -ParameterFilter { $TypeName -eq 'System.Data.SqlClient.SqlConnection' }

            # Test should not throw
            { Test-SqlServerConnection -ServerInstance 'localhost' -UseLegacy } | Should -Not -Throw
        }

        It 'Should return connection result object' {
            Mock -CommandName 'Connect-DbaInstance' -MockWith {
                @{
                    InstanceName = 'localhost'
                    Version      = [version]'15.0.2000.5'
                }
            }

            $result = Test-SqlServerConnection -ServerInstance 'localhost'
            $result | Should -Not -BeNullOrEmpty
            $result.IsValid | Should -BeOfType [bool]
            $result.InstanceName | Should -Not -BeNullOrEmpty
            $result.ConnectTimeMs | Should -BeOfType [int]
            $result.Diagnostics | Should -BeOfType [array]
        }

        It 'Should set IsValid to true on successful connection' {
            Mock -CommandName 'Connect-DbaInstance' -MockWith {
                @{
                    InstanceName = 'localhost'
                    Version      = [version]'15.0.2000.5'
                }
            }

            $result = Test-SqlServerConnection -ServerInstance 'localhost'
            $result.IsValid | Should -Be $true
        }

        It 'Should set IsValid to false on failed connection' {
            Mock -CommandName 'Connect-DbaInstance' -MockWith {
                throw "Connection failed"
            }

            $result = Test-SqlServerConnection -ServerInstance 'localhost'
            $result.IsValid | Should -Be $false
            $result.Diagnostics | Should -Contain '*Connection failed*'
        }

        It 'Should require dbatools unless -UseLegacy specified' {
            Mock -CommandName 'Connect-DbaInstance' -MockWith {
                throw "dbatools not available"
            }

            # Without -UseLegacy and dbatools unavailable, should fail
            { Test-SqlServerConnection -ServerInstance 'localhost' } | Should -Throw
        }
    }

    Context 'Database Restore Operations' {
        It 'Should require dbatools for restore' {
            Mock -CommandName 'Restore-DbaDatabase' -MockWith {
                throw "dbatools not available"
            }

            { Restore-SqlDatabase -ServerInstance 'localhost' -DatabaseName 'TestDB' -BackupFile 'C:\backup.bak' } | Should -Throw
        }

        It 'Should return restore result object' {
            Mock -CommandName 'Restore-DbaDatabase' -MockWith {
                @{ RestoreComplete = $true }
            }

            $result = Restore-SqlDatabase -ServerInstance 'localhost' -DatabaseName 'TestDB' -BackupFile 'C:\backup.bak'
            $result | Should -Not -BeNullOrEmpty
            $result.Success | Should -BeOfType [bool]
            $result.DatabaseName | Should -Be 'TestDB'
            $result.RestoredAt | Should -BeOfType [datetime]
            $result.Diagnostics | Should -BeOfType [array]
        }

        It 'Should pass ReplaceExisting parameter' {
            Mock -CommandName 'Restore-DbaDatabase' -MockWith {
                $ReplaceExisting | Should -Be $true
                @{ RestoreComplete = $true }
            }

            Restore-SqlDatabase -ServerInstance 'localhost' -DatabaseName 'TestDB' -BackupFile 'C:\backup.bak' -ReplaceExisting $true
        }

        It 'Should handle restore failures' {
            Mock -CommandName 'Restore-DbaDatabase' -MockWith {
                throw "Restore failed: backup file not found"
            }

            $result = Restore-SqlDatabase -ServerInstance 'localhost' -DatabaseName 'TestDB' -BackupFile 'C:\backup.bak'
            $result.Success | Should -Be $false
            $result.Diagnostics | Should -Contain '*Restore failed*'
        }
    }

    Context 'Database Mount Operations' {
        It 'Should require dbatools for mount' {
            Mock -CommandName 'Mount-DbaDatabase' -MockWith {
                throw "dbatools not available"
            }

            { Mount-SqlDatabase -ServerInstance 'localhost' -DatabaseName 'TestDB' -DataPath 'C:\data' } | Should -Throw
        }

        It 'Should return mount result object' {
            Mock -CommandName 'Mount-DbaDatabase' -MockWith { $true }

            $result = Mount-SqlDatabase -ServerInstance 'localhost' -DatabaseName 'TestDB' -DataPath 'C:\data'
            $result | Should -Not -BeNullOrEmpty
            $result.Success | Should -BeOfType [bool]
            $result.DatabaseName | Should -Be 'TestDB'
            $result.MountedAt | Should -BeOfType [datetime]
            $result.Diagnostics | Should -BeOfType [array]
        }

        It 'Should handle mount failures' {
            Mock -CommandName 'Mount-DbaDatabase' -MockWith {
                throw "Database file not found"
            }

            $result = Mount-SqlDatabase -ServerInstance 'localhost' -DatabaseName 'TestDB' -DataPath 'C:\data'
            $result.Success | Should -Be $false
            $result.Diagnostics | Should -Contain '*Mount failed*'
        }
    }

    Context 'Database Dismount Operations' {
        It 'Should require dbatools for dismount' {
            Mock -CommandName 'Dismount-DbaDatabase' -MockWith {
                throw "dbatools not available"
            }
            Mock -CommandName 'Detach-DbaDatabase' -MockWith {
                throw "dbatools not available"
            }

            { Dismount-SqlDatabase -ServerInstance 'localhost' -DatabaseName 'TestDB' } | Should -Throw
        }

        It 'Should force-close connections when -Force specified' {
            Mock -CommandName 'Invoke-SqlCmd' -MockWith { }
            Mock -CommandName 'Dismount-DbaDatabase' -MockWith { }

            $result = Dismount-SqlDatabase -ServerInstance 'localhost' -DatabaseName 'TestDB' -Force
            Assert-MockCalled -CommandName 'Invoke-SqlCmd' -Times 1
        }

        It 'Should return dismount result object' {
            Mock -CommandName 'Dismount-DbaDatabase' -MockWith { $true }

            $result = Dismount-SqlDatabase -ServerInstance 'localhost' -DatabaseName 'TestDB'
            $result | Should -Not -BeNullOrEmpty
            $result.Success | Should -BeOfType [bool]
            $result.DatabaseName | Should -Be 'TestDB'
            $result.DismountedAt | Should -BeOfType [datetime]
            $result.Diagnostics | Should -BeOfType [array]
        }

        It 'Should fall back to Detach-DbaDatabase if Dismount fails' {
            Mock -CommandName 'Dismount-DbaDatabase' -MockWith {
                throw "Dismount not available"
            }
            Mock -CommandName 'Detach-DbaDatabase' -MockWith { $true }

            $result = Dismount-SqlDatabase -ServerInstance 'localhost' -DatabaseName 'TestDB'
            $result.Success | Should -Be $true
            Assert-MockCalled -CommandName 'Detach-DbaDatabase' -Times 1
        }

        It 'Should handle dismount failures' {
            Mock -CommandName 'Dismount-DbaDatabase' -MockWith {
                throw "Database in use"
            }
            Mock -CommandName 'Detach-DbaDatabase' -MockWith {
                throw "Database in use"
            }

            $result = Dismount-SqlDatabase -ServerInstance 'localhost' -DatabaseName 'TestDB'
            $result.Success | Should -Be $false
            $result.Diagnostics | Should -Contain '*Dismount failed*'
        }
    }

    Context 'Health Checks' {
        It 'Should perform comprehensive health check' {
            Mock -CommandName 'Test-SqlOperationsDependencies' -MockWith {
                @{
                    Passed    = $true
                    Details   = @()
                    AllRequiredMet = $true
                    Diagnostics = @()
                }
            }

            $health = Test-SqlOperationsHealth
            $health | Should -Not -BeNullOrEmpty
            $health.Status | Should -BeOfType [string]
            $health.Components | Should -BeOfType [array]
            $health.Warnings | Should -BeOfType [array]
            $health.Errors | Should -BeOfType [array]
        }

        It 'Should include SQL connection test when ServerInstance specified' {
            Mock -CommandName 'Test-SqlOperationsDependencies' -MockWith {
                @{
                    Passed    = $true
                    Details   = @()
                    AllRequiredMet = $true
                    Diagnostics = @()
                }
            }
            Mock -CommandName 'Test-SqlServerConnection' -MockWith {
                @{ IsValid = $true }
            }

            $health = Test-SqlOperationsHealth -ServerInstance 'localhost'
            $health.Components.Count | Should -BeGreaterThan 1
        }

        It 'Should mark health as Unhealthy when connection fails' {
            Mock -CommandName 'Test-SqlOperationsDependencies' -MockWith {
                @{
                    Passed    = $true
                    Details   = @()
                    AllRequiredMet = $true
                    Diagnostics = @()
                }
            }
            Mock -CommandName 'Test-SqlServerConnection' -MockWith {
                @{ IsValid = $false; Diagnostics = @('Connection failed') }
            }

            $health = Test-SqlOperationsHealth -ServerInstance 'localhost'
            $health.Status | Should -Be 'Unhealthy'
        }
    }

    Context 'Error Handling' {
        It 'Should not throw on valid inputs' {
            Mock -CommandName 'Connect-DbaInstance' -MockWith {
                @{ InstanceName = 'localhost'; Version = [version]'15.0.2000.5' }
            }

            { Test-SqlServerConnection -ServerInstance 'localhost' } | Should -Not -Throw
        }

        It 'Should provide diagnostics on failures' {
            Mock -CommandName 'Connect-DbaInstance' -MockWith {
                throw "Connection timeout"
            }

            $result = Test-SqlServerConnection -ServerInstance 'localhost'
            $result.Diagnostics | Should -Not -BeNullOrEmpty
            $result.Diagnostics | Should -Contain '*Connection timeout*'
        }

        It 'Should measure operation timing' {
            Mock -CommandName 'Connect-DbaInstance' -MockWith {
                @{ InstanceName = 'localhost'; Version = [version]'15.0.2000.5' }
            }

            $result = Test-SqlServerConnection -ServerInstance 'localhost'
            $result.ConnectTimeMs | Should -BeGreaterThanOrEqual 0
            $result.ConnectTimeMs | Should -BeOfType [int]
        }
    }
}
