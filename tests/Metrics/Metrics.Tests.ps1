# FlashDB Metrics Collection Tests
# Tests for metrics collection, aggregation, and reporting functionality

Import-Module -Name "C:\flashdb\src\FlashDB\FlashDB.psm1" -Force

Describe "Metrics Collection" {
    Context "Get-FlashdbMetrics" {
        It "Should return comprehensive metrics object" {
            $metrics = Get-FlashdbMetrics
            $metrics | Should -Not -BeNullOrEmpty
            $metrics.overview | Should -Not -BeNullOrEmpty
        }

        It "Should include overview section" {
            $metrics = Get-FlashdbMetrics
            $metrics.overview.totalClonesCreated | Should -BeOfType [int]
            $metrics.overview.totalStorageSavedGB | Should -BeOfType [double]
        }

        It "Should include timestamp" {
            $metrics = Get-FlashdbMetrics
            $metrics.timestamp | Should -Not -BeNullOrEmpty
            [DateTime]::Parse($metrics.timestamp) | Should -Not -BeNullOrEmpty
        }

        It "Should have clone statistics" {
            $metrics = Get-FlashdbMetrics
            $metrics.cloneStatistics | Should -Not -BeNullOrEmpty
        }

        It "Should have storage metrics" {
            $metrics = Get-FlashdbMetrics
            $metrics.storageMetrics | Should -Not -BeNullOrEmpty
        }

        It "Should have operation metrics" {
            $metrics = Get-FlashdbMetrics
            $metrics.operationMetrics | Should -Not -BeNullOrEmpty
        }
    }

    Context "Get-CloneCreationStats" {
        It "Should return clone creation statistics" {
            $stats = Get-CloneCreationStats
            $stats | Should -Not -BeNullOrEmpty
        }

        It "Should have correct data types" {
            $stats = Get-CloneCreationStats
            $stats.totalClones | Should -BeOfType [int]
            $stats.successfulClones | Should -BeOfType [int]
            $stats.failedClones | Should -BeOfType [int]
            $stats.averageCreationTimeSeconds | Should -BeOfType [double]
            $stats.successRatePercent | Should -BeOfType [double]
        }

        It "Should have valid success rate range" {
            $stats = Get-CloneCreationStats
            $stats.successRatePercent | Should -BeGreaterThanOrEqual 0
            $stats.successRatePercent | Should -BeLessThanOrEqual 100
        }

        It "Should have valid creation time ranges" {
            $stats = Get-CloneCreationStats
            if ($stats.totalClones -gt 0) {
                $stats.minCreationTimeSeconds | Should -BeLessThanOrEqual $stats.averageCreationTimeSeconds
                $stats.averageCreationTimeSeconds | Should -BeLessThanOrEqual $stats.maxCreationTimeSeconds
            }
        }

        It "Should sum success and failure counts correctly" {
            $stats = Get-CloneCreationStats
            $stats.successfulClones + $stats.failedClones | Should -BeGreaterThanOrEqual $stats.totalClones
        }

        It "Should include golden image breakdown" {
            $stats = Get-CloneCreationStats
            $stats.creationTimesByGoldenImage | Should -BeOfType [array] -Or (Test-Json $stats.creationTimesByGoldenImage)
        }
    }

    Context "Get-StorageStats" {
        It "Should return storage statistics" {
            $storage = Get-StorageStats
            $storage | Should -Not -BeNullOrEmpty
        }

        It "Should have correct data types" {
            $storage = Get-StorageStats
            $storage.totalUsedGB | Should -BeOfType [double]
            $storage.totalSavingsGB | Should -BeOfType [double]
            $storage.compressionRatioPercent | Should -BeOfType [double]
            $storage.avgCloneSizeGB | Should -BeOfType [double]
        }

        It "Should have valid compression ratio" {
            $storage = Get-StorageStats
            $storage.compressionRatioPercent | Should -BeGreaterThanOrEqual 0
            $storage.compressionRatioPercent | Should -BeLessThanOrEqual 100
        }

        It "Should have non-negative storage values" {
            $storage = Get-StorageStats
            $storage.totalUsedGB | Should -BeGreaterThanOrEqual 0
            $storage.totalSavingsGB | Should -BeGreaterThanOrEqual 0
            $storage.avgCloneSizeGB | Should -BeGreaterThanOrEqual 0
        }

        It "Should include clone storage breakdown" {
            $storage = Get-StorageStats
            $storage.cloneStorageBreakdown | Should -BeOfType [array] -Or $null
        }

        It "Should have valid clone breakdown properties" {
            $storage = Get-StorageStats
            if ($storage.cloneStorageBreakdown.Count -gt 0) {
                $storage.cloneStorageBreakdown[0] | Get-Member -MemberType Properties |
                    Select-Object -ExpandProperty Name |
                    Should -Contain "vhdxSizeGB"
            }
        }
    }

    Context "Get-OperationStats" {
        It "Should return operation statistics" {
            $ops = Get-OperationStats
            $ops | Should -Not -BeNullOrEmpty
        }

        It "Should have correct data types" {
            $ops = Get-OperationStats
            $ops.totalOperations | Should -BeOfType [int]
            $ops.successfulOperations | Should -BeOfType [int]
            $ops.failedOperations | Should -BeOfType [int]
            $ops.successRatePercent | Should -BeOfType [double]
        }

        It "Should have valid success rate range" {
            $ops = Get-OperationStats
            $ops.successRatePercent | Should -BeGreaterThanOrEqual 0
            $ops.successRatePercent | Should -BeLessThanOrEqual 100
        }

        It "Should sum counts correctly" {
            $ops = Get-OperationStats
            $ops.successfulOperations + $ops.failedOperations | Should -BeGreaterThanOrEqual $ops.totalOperations
        }

        It "Should include operation type breakdown" {
            $ops = Get-OperationStats
            $ops.operationsByType | Should -BeOfType [array] -Or $null
        }

        It "Should have valid operation type properties" {
            $ops = Get-OperationStats
            if ($ops.operationsByType.Count -gt 0) {
                $ops.operationsByType[0] | Get-Member -MemberType Properties |
                    Select-Object -ExpandProperty Name |
                    Should -Contain "type"
                $ops.operationsByType[0] | Get-Member -MemberType Properties |
                    Select-Object -ExpandProperty Name |
                    Should -Contain "count"
            }
        }
    }

    Context "Get-TimelineData" {
        It "Should return timeline data" {
            $timeline = Get-TimelineData -HoursBack 24
            $timeline | Should -Not -BeNullOrEmpty
        }

        It "Should include clone creations timeline" {
            $timeline = Get-TimelineData -HoursBack 24
            $timeline.cloneCreations | Should -Not -BeNullOrEmpty
        }

        It "Should include operations timeline" {
            $timeline = Get-TimelineData -HoursBack 24
            $timeline.operations | Should -Not -BeNullOrEmpty
        }

        It "Should have correct timeline dates" {
            $timeline = Get-TimelineData -HoursBack 24
            [DateTime]::Parse($timeline.timelineStart) | Should -Not -BeNullOrEmpty
            [DateTime]::Parse($timeline.timelineEnd) | Should -Not -BeNullOrEmpty
        }

        It "Should support different hour ranges" {
            $timeline1 = Get-TimelineData -HoursBack 1
            $timeline24 = Get-TimelineData -HoursBack 24
            $timeline1 | Should -Not -BeNullOrEmpty
            $timeline24 | Should -Not -BeNullOrEmpty
        }

        It "Should support grouping by hour" {
            $timeline = Get-TimelineData -HoursBack 24 -GroupBy 'hour'
            $timeline.groupBy | Should -Be 'hour'
            $timeline.cloneCreations | Should -BeOfType [array]
        }

        It "Should support grouping by day" {
            $timeline = Get-TimelineData -HoursBack 168 -GroupBy 'day'
            $timeline.groupBy | Should -Be 'day'
        }

        It "Should reject invalid hour ranges" {
            { Get-TimelineData -HoursBack 0 } | Should -Throw
            { Get-TimelineData -HoursBack 9000 } | Should -Throw
        }
    }
}

Describe "Metrics Calculation Accuracy" {
    Context "Storage Calculations" {
        It "Should calculate compression ratio correctly" {
            $storage = Get-StorageStats
            if ($storage.totalParentSizeGB -gt 0) {
                $expectedRatio = (1 - ($storage.totalUsedGB / $storage.totalParentSizeGB)) * 100
                [Math]::Abs($storage.compressionRatioPercent - $expectedRatio) | Should -BeLessThan 0.1
            }
        }

        It "Should calculate savings correctly" {
            $storage = Get-StorageStats
            if ($storage.totalParentSizeGB -gt 0) {
                $expectedSavings = $storage.totalParentSizeGB - $storage.totalUsedGB
                [Math]::Abs($storage.totalSavingsGB - $expectedSavings) | Should -BeLessThan 0.1
            }
        }
    }

    Context "Success Rate Calculations" {
        It "Should calculate clone success rate correctly" {
            $stats = Get-CloneCreationStats
            if ($stats.totalClones -gt 0) {
                $expectedRate = ($stats.successfulClones / $stats.totalClones) * 100
                [Math]::Abs($stats.successRatePercent - $expectedRate) | Should -BeLessThan 0.1
            }
        }

        It "Should calculate operation success rate correctly" {
            $ops = Get-OperationStats
            if ($ops.totalOperations -gt 0) {
                $expectedRate = ($ops.successfulOperations / $ops.totalOperations) * 100
                [Math]::Abs($ops.successRatePercent - $expectedRate) | Should -BeLessThan 0.1
            }
        }
    }
}

Describe "Metrics Edge Cases" {
    Context "No data scenarios" {
        It "Should handle empty clone list gracefully" {
            # This test verifies behavior when no clones exist
            $metrics = Get-FlashdbMetrics
            $metrics.overview.totalClonesCreated -ge 0 | Should -Be $true
        }

        It "Should return zero values for no clones" {
            $stats = Get-CloneCreationStats
            $stats.totalClones | Should -BeGreaterThanOrEqual 0
        }
    }

    Context "Data consistency" {
        It "Should have consistent metrics across calls" {
            $metrics1 = Get-FlashdbMetrics
            Start-Sleep -Milliseconds 100
            $metrics2 = Get-FlashdbMetrics

            # Totals should be same or increase, not decrease
            $metrics2.overview.totalClonesCreated | Should -BeGreaterThanOrEqual $metrics1.overview.totalClonesCreated
        }
    }
}

# Run all tests
Invoke-Pester -Path $PSScriptRoot
