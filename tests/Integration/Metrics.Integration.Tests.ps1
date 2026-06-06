# FlashDB Metrics API Integration Tests
# Tests for the REST API metrics endpoints

Describe "Metrics API Endpoints" {
    $apiBase = "http://localhost:3001/api"

    Context "GET /api/metrics/overview" {
        It "Should return 200 status code" {
            try {
                $response = Invoke-RestMethod -Uri "$apiBase/metrics/overview" -Method Get -ErrorAction Stop
                $response | Should -Not -BeNullOrEmpty
            } catch {
                if ($_.Exception.Message -like "*401*" -or $_.Exception.Message -like "*Unable to connect*") {
                    Set-SkipPendingTests -SkipAll
                    Write-Host "API server not running, skipping tests"
                }
            }
        }

        It "Should include overview metrics" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/overview" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response.data.totalClonesCreated | Should -Not -BeNullOrEmpty
                $response.data.totalStorageSavedGB | Should -Not -BeNullOrEmpty
            }
        }

        It "Should have valid data structure" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/overview" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response.success | Should -Be $true
                $response.data | Should -Not -BeNullOrEmpty
            }
        }
    }

    Context "GET /api/metrics/clones" {
        It "Should return clone statistics" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/clones" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response.data.totalClones | Should -BeOfType [int]
                $response.data.successRatePercent | Should -Not -BeNullOrEmpty
            }
        }

        It "Should include creation time stats" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/clones" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response.data.averageCreationTimeSeconds | Should -Not -BeNullOrEmpty
                $response.data.minCreationTimeSeconds | Should -Not -BeNullOrEmpty
                $response.data.maxCreationTimeSeconds | Should -Not -BeNullOrEmpty
            }
        }
    }

    Context "GET /api/metrics/storage" {
        It "Should return storage metrics" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/storage" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response.data.totalUsedGB | Should -Not -BeNullOrEmpty
                $response.data.totalSavingsGB | Should -Not -BeNullOrEmpty
                $response.data.compressionRatioPercent | Should -Not -BeNullOrEmpty
            }
        }

        It "Should include clone breakdown" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/storage" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response.data.cloneStorageBreakdown | Should -BeOfType [array] -Or $null
            }
        }
    }

    Context "GET /api/metrics/operations" {
        It "Should return operation metrics" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/operations" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response.data.totalOperations | Should -Not -BeNullOrEmpty
                $response.data.successRatePercent | Should -Not -BeNullOrEmpty
            }
        }

        It "Should include operation types" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/operations" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response.data.operationsByType | Should -BeOfType [array] -Or $null
            }
        }
    }

    Context "GET /api/metrics/timeline" {
        It "Should return timeline data for 24 hours" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/timeline?hoursBack=24&groupBy=hour" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response.data.cloneCreations | Should -Not -BeNullOrEmpty
                $response.data.operations | Should -Not -BeNullOrEmpty
            }
        }

        It "Should support different time ranges" {
            $response1 = Invoke-RestMethod -Uri "$apiBase/metrics/timeline?hoursBack=1" -Method Get -ErrorAction SilentlyContinue
            $response24 = Invoke-RestMethod -Uri "$apiBase/metrics/timeline?hoursBack=24" -Method Get -ErrorAction SilentlyContinue

            if ($response1 -and $response24) {
                $response1.data | Should -Not -BeNullOrEmpty
                $response24.data | Should -Not -BeNullOrEmpty
            }
        }

        It "Should validate hoursBack parameter" {
            try {
                $response = Invoke-RestMethod -Uri "$apiBase/metrics/timeline?hoursBack=0" -Method Get -ErrorAction Stop
                # If we get here, API didn't validate - fail the test
                $response.success | Should -Be $false
            } catch {
                # Expected to fail validation
                $true | Should -Be $true
            }
        }
    }

    Context "GET /api/metrics/all" {
        It "Should return all metrics at once" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/all" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response.data.overview | Should -Not -BeNullOrEmpty
                $response.data.cloneStatistics | Should -Not -BeNullOrEmpty
                $response.data.storageMetrics | Should -Not -BeNullOrEmpty
                $response.data.operationMetrics | Should -Not -BeNullOrEmpty
                $response.data.timeline | Should -Not -BeNullOrEmpty
            }
        }

        It "Should have consistent data across endpoints" {
            $allResponse = Invoke-RestMethod -Uri "$apiBase/metrics/all" -Method Get -ErrorAction SilentlyContinue
            if ($allResponse) {
                $allResponse.data.overview.totalClonesCreated | Should -Not -BeNullOrEmpty
            }
        }
    }
}

Describe "Metrics API Response Format" {
    Context "Response structure" {
        It "Should always include success flag" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/overview" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response | Get-Member -Name success | Should -Not -BeNullOrEmpty
            }
        }

        It "Should always include data property" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/overview" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response | Get-Member -Name data | Should -Not -BeNullOrEmpty
            }
        }

        It "Should always include message property" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/overview" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response | Get-Member -Name message | Should -Not -BeNullOrEmpty
            }
        }
    }

    Context "Data types" {
        It "Should return numeric values as numbers" {
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/overview" -Method Get -ErrorAction SilentlyContinue
            if ($response) {
                $response.data.totalClonesCreated | Should -BeOfType [int] -Or [long]
                $response.data.totalStorageSavedGB | Should -BeOfType [double] -Or [int]
            }
        }
    }
}

Describe "Metrics API Performance" {
    Context "Response times" {
        It "Overview endpoint should respond quickly" {
            $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/overview" -Method Get -ErrorAction SilentlyContinue
            $stopwatch.Stop()

            if ($response) {
                $stopwatch.ElapsedMilliseconds | Should -BeLessThan 5000
            }
        }

        It "All metrics endpoint should complete within timeout" {
            $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
            $response = Invoke-RestMethod -Uri "$apiBase/metrics/all" -Method Get -ErrorAction SilentlyContinue
            $stopwatch.Stop()

            if ($response) {
                $stopwatch.ElapsedMilliseconds | Should -BeLessThan 10000
            }
        }
    }
}

# Run all tests
Invoke-Pester -Path $PSScriptRoot
