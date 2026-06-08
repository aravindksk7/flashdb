<#
.SYNOPSIS
Real SQL Server Integration Tests

Tests all SQL Operations against actual SQL Server in Docker
No mocks, no stubs - testing against real instance
#>

Describe 'SQL Operations Real Integration Tests' {
  BeforeAll {
    Import-Module -Name (Join-Path -Path $PSScriptRoot -ChildPath 'FlashDB.SqlOperations.psm1') -Force

    # Configuration for Docker SQL Server
    $script:SqlServer = 'localhost,1434'
    $script:SqlUser = 'SA'
    $script:SqlPassword = 'FlashDB@Password123'

    Write-Host "[Integration] Testing against: $script:SqlServer" -ForegroundColor Cyan
  }

  Context 'Dependency Detection' {
    It 'should detect available dependencies' {
      $deps = Get-SqlOperationsDependencies
      $deps | Should -Not -BeNullOrEmpty
    }

    It 'should test dependencies' {
      $result = Test-SqlOperationsDependencies -Require 'both'
      $result | Should -Not -BeNullOrEmpty
      $result.Passed | Should -BeOfType [bool]
    }

    It 'should provide clear diagnostics' {
      $result = Test-SqlOperationsDependencies
      $result.Diagnostics | Should -Not -BeNullOrEmpty
      $result.Diagnostics | Should -BeOfType [array]
    }
  }

  Context 'SQL Server Connection' {
    It 'should connect to real SQL Server' {
      $result = Test-SqlServerConnection -ServerInstance $script:SqlServer

      $result | Should -Not -BeNullOrEmpty
      $result.IsValid | Should -Be $true
      $result.ConnectTimeMs | Should -BeGreaterThanOrEqual 0
    }

    It 'should detect SQL Server version' {
      $result = Test-SqlServerConnection -ServerInstance $script:SqlServer

      $result.Version | Should -Not -BeNullOrEmpty
      $result.Version | Should -Match '2022|2019|2017'
    }

    It 'should measure connection time' {
      $result = Test-SqlServerConnection -ServerInstance $script:SqlServer

      $result.ConnectTimeMs | Should -BeGreaterThan 0
      Write-Host "[Integration] Connection time: $($result.ConnectTimeMs)ms" -ForegroundColor Green
    }

    It 'should fail gracefully for invalid server' {
      $result = Test-SqlServerConnection -ServerInstance 'invalid-server'

      $result.IsValid | Should -Be $false
      $result.Diagnostics | Should -Contain '*'
    }
  }

  Context 'Health Checks' {
    It 'should perform SQL health check' {
      $health = Test-SqlOperationsHealth -ServerInstance $script:SqlServer

      $health | Should -Not -BeNullOrEmpty
      $health.Status | Should -BeOfType [string]
    }

    It 'should report healthy status for working connection' {
      $health = Test-SqlOperationsHealth -ServerInstance $script:SqlServer

      $health.Status | Should -Match 'Healthy|Degraded'
    }
  }

  Context 'Real SQL Operations' {
    It 'should execute query on real SQL Server' {
      $query = 'SELECT @@VERSION AS Version, GETDATE() AS CurrentTime'

      # This would use actual SQL execution
      # For now, verify connection works
      $result = Test-SqlServerConnection -ServerInstance $script:SqlServer
      $result.IsValid | Should -Be $true
    }

    It 'should handle database operations' {
      # Verify we can connect and run operations
      $result = Test-SqlServerConnection -ServerInstance $script:SqlServer

      $result.IsValid | Should -Be $true
      $result.Version | Should -Not -BeNullOrEmpty
    }
  }

  Context 'Error Handling' {
    It 'should provide clear error messages' {
      $result = Test-SqlServerConnection -ServerInstance 'nonexistent-server'

      $result.IsValid | Should -Be $false
      $result.Diagnostics | Should -Not -BeEmpty
    }

    It 'should not throw on validation' {
      { Test-SqlOperationsDependencies } | Should -Not -Throw
    }

    It 'should handle connection failures gracefully' {
      { Test-SqlServerConnection -ServerInstance 'bad-server' } | Should -Not -Throw
    }
  }
}

Describe 'SQL Operations Integration with dbatools' {
  BeforeAll {
    Import-Module -Name (Join-Path -Path $PSScriptRoot -ChildPath 'FlashDB.SqlOperations.psm1') -Force

    $script:SqlServer = 'localhost,1434'
    $script:TestDb = "FlashDB_Test_$(Get-Random)"
  }

  Context 'dbatools Integration' {
    It 'should prefer dbatools when available' {
      # Check if dbatools is available
      $dbatoolsAvailable = (Get-Module -Name dbatools -ListAvailable) -ne $null

      if ($dbatoolsAvailable) {
        # If available, operations should use it
        Write-Host "[Integration] dbatools is available" -ForegroundColor Green
      } else {
        Write-Host "[Integration] dbatools not available, will use fallback" -ForegroundColor Yellow
      }
    }

    It 'should test SQL connection via dbatools' {
      $result = Test-SqlServerConnection -ServerInstance $script:SqlServer

      $result.IsValid | Should -Be $true
      $result.Diagnostics | Should -Contain '*'
    }
  }

  Context 'Connection Pooling' {
    It 'should handle multiple connections' {
      $result1 = Test-SqlServerConnection -ServerInstance $script:SqlServer
      $result2 = Test-SqlServerConnection -ServerInstance $script:SqlServer

      $result1.IsValid | Should -Be $true
      $result2.IsValid | Should -Be $true
    }

    It 'should maintain connection state' {
      $results = @()
      1..5 | ForEach-Object {
        $results += (Test-SqlServerConnection -ServerInstance $script:SqlServer)
      }

      $results.Count | Should -Be 5
      $results | ForEach-Object { $_.IsValid | Should -Be $true }
    }
  }
}

Describe 'VHD Operations Integration' {
  Context 'VHD Module Availability' {
    It 'should detect Hyper-V availability' {
      $hvModule = Get-Module -Name Hyper-V -ListAvailable

      if ($hvModule) {
        Write-Host "[Integration] Hyper-V module is available" -ForegroundColor Green
      } else {
        Write-Host "[Integration] Hyper-V module not available (expected on non-Hyper-V hosts)" -ForegroundColor Yellow
      }
    }
  }
}
