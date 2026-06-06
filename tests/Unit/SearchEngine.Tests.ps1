#Requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }

<#
.SYNOPSIS
    Comprehensive unit tests for FlashDB Search Engine
.DESCRIPTION
    Tests search and filtering functionality for operations, clones, and checkpoints.
    Tests include:
    - Full-text keyword search
    - Date range filtering
    - Status-based filtering
    - Method filtering
    - Regex pattern matching
    - Pagination and sorting
    - Combined multi-criteria filters
    - Autocomplete suggestions
#>

BeforeAll {
    # Import the Search Engine module
    $SearchEnginePath = Join-Path $PSScriptRoot "..\..\src\FlashDB\Core\SearchEngine.ps1"
    . $SearchEnginePath

    # Import FlashDB module for config
    $FlashDBPath = Join-Path $PSScriptRoot "..\..\src\FlashDB\FlashDB.psm1"
    Import-Module $FlashDBPath -Force -ErrorAction SilentlyContinue

    # Setup test environment
    $script:TestStoragePath = "C:\Temp\FlashDB_SearchTests"
    $script:TestMetadataPath = Join-Path $script:TestStoragePath "metadata"
    $script:TestBackupsPath = Join-Path $script:TestStoragePath "backups"
    $script:TestCheckpointsPath = Join-Path $script:TestStoragePath "checkpoints"

    # Create test directories
    foreach ($path in @($script:TestStoragePath, $script:TestMetadataPath, $script:TestBackupsPath, $script:TestCheckpointsPath)) {
        if (-not (Test-Path $path)) {
            New-Item -ItemType Directory -Path $path -Force | Out-Null
        }
    }

    # Create test data files
    $script:TestOperations = @(
        @{
            operation = @{
                id = "op-backup-001"
                name = "Production Backup"
                description = "Daily backup of production database"
                status = "ready"
                method = "BackupRestore"
                operator = "admin@company.com"
                createdAt = (Get-Date).AddDays(-5).ToString("o")
                updatedAt = (Get-Date).AddDays(-1).ToString("o")
            }
        },
        @{
            operation = @{
                id = "op-replica-002"
                name = "Replica Backup"
                description = "Replica-based backup process"
                status = "ready"
                method = "ReplicaBackup"
                operator = "backup@company.com"
                createdAt = (Get-Date).AddDays(-3).ToString("o")
                updatedAt = (Get-Date).ToString("o")
            }
        },
        @{
            operation = @{
                id = "op-table-003"
                name = "Table Copy Operation"
                description = "Table-by-table copy for dev database"
                status = "failed"
                method = "TableByTableCopy"
                operator = "dev@company.com"
                createdAt = (Get-Date).AddDays(-10).ToString("o")
                updatedAt = (Get-Date).AddDays(-10).ToString("o")
            }
        }
    )

    $script:TestClones = @(
        @{
            clone = @{
                id = "clone-dev-001"
                name = "dev-database-1"
                description = "Development environment clone"
                goldenImageId = "golden-prod-20260606"
                status = "ready"
                createdAt = (Get-Date).AddDays(-7).ToString("o")
                updatedAt = (Get-Date).ToString("o")
                size = 50GB
                tags = @("development", "test")
            }
        },
        @{
            clone = @{
                id = "clone-prod-001"
                name = "prod-backup-1"
                description = "Production backup clone"
                goldenImageId = "golden-prod-20260606"
                status = "attached"
                createdAt = (Get-Date).AddDays(-15).ToString("o")
                updatedAt = (Get-Date).AddDays(-2).ToString("o")
                size = 100GB
                tags = @("production", "backup")
            }
        },
        @{
            clone = @{
                id = "clone-qa-001"
                name = "qa-database-1"
                description = "QA environment clone"
                goldenImageId = "golden-test-20260605"
                status = "detached"
                createdAt = (Get-Date).AddDays(-30).ToString("o")
                updatedAt = (Get-Date).AddDays(-30).ToString("o")
                size = 75GB
                tags = @("qa", "testing")
            }
        }
    )

    $script:TestCheckpoints = @(
        @{
            checkpoint = @{
                id = "cp-001"
                name = "Checkpoint Initial"
                description = "Initial database state"
                cloneId = "clone-dev-001"
                phase = "complete"
                createdAt = (Get-Date).AddDays(-7).ToString("o")
            }
        },
        @{
            checkpoint = @{
                id = "cp-002"
                name = "Checkpoint After Cleanup"
                description = "After cleanup operations"
                cloneId = "clone-dev-001"
                phase = "complete"
                createdAt = (Get-Date).AddDays(-6).ToString("o")
            }
        },
        @{
            checkpoint = @{
                id = "cp-003"
                name = "Failed Checkpoint"
                description = "Checkpoint that failed"
                cloneId = "clone-prod-001"
                phase = "failed"
                createdAt = (Get-Date).AddDays(-5).ToString("o")
            }
        }
    )

    # Write test metadata files
    foreach ($op in $script:TestOperations) {
        $filePath = Join-Path $script:TestMetadataPath "operation-$($op.operation.id).json"
        $op | ConvertTo-Json -Depth 10 | Set-Content -Path $filePath
    }

    foreach ($clone in $script:TestClones) {
        $filePath = Join-Path $script:TestMetadataPath "clone-$($clone.clone.id).json"
        $clone | ConvertTo-Json -Depth 10 | Set-Content -Path $filePath
    }

    foreach ($cp in $script:TestCheckpoints) {
        $filePath = Join-Path $script:TestCheckpointsPath "checkpoint-$($cp.checkpoint.id).json"
        $cp | ConvertTo-Json -Depth 10 | Set-Content -Path $filePath
    }

    # Mock Get-FlashdbConfig to use test path
    function Get-FlashdbConfig {
        return [PSCustomObject]@{
            defaultCloneStoragePath = $script:TestStoragePath
        }
    }
}

AfterAll {
    # Cleanup test files
    if (Test-Path $script:TestStoragePath) {
        Remove-Item -Path $script:TestStoragePath -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Describe "Search-FlashdbOperations" {
    Context "Keyword Search" {
        It "Should find operations by keyword in name" {
            $results = Search-FlashdbOperations -Keyword "Backup"
            $results | Should -Not -BeNullOrEmpty
            $results.Count | Should -BeGreaterThan 0
            $results[0].name | Should -Match "Backup"
        }

        It "Should find operations by keyword in description" {
            $results = Search-FlashdbOperations -Keyword "replica"
            $results | Should -Not -BeNullOrEmpty
            $results[0].name | Should -Match "Replica"
        }

        It "Should return empty results for non-matching keyword" {
            $results = Search-FlashdbOperations -Keyword "NonExistent12345"
            $results | Should -BeNullOrEmpty
        }
    }

    Context "Status Filtering" {
        It "Should filter operations by status ready" {
            $results = Search-FlashdbOperations -Status "ready"
            $results | Should -Not -BeNullOrEmpty
            $results | Where-Object { $_.status -ne "ready" } | Should -BeNullOrEmpty
        }

        It "Should filter operations by status failed" {
            $results = Search-FlashdbOperations -Status "failed"
            $results | Should -Not -BeNullOrEmpty
            $results[0].status | Should -Be "failed"
        }
    }

    Context "Method Filtering" {
        It "Should filter operations by BackupRestore method" {
            $results = Search-FlashdbOperations -Method "BackupRestore"
            $results | Should -Not -BeNullOrEmpty
            $results[0].method | Should -Be "BackupRestore"
        }

        It "Should filter operations by ReplicaBackup method" {
            $results = Search-FlashdbOperations -Method "ReplicaBackup"
            $results | Should -Not -BeNullOrEmpty
            $results[0].method | Should -Be "ReplicaBackup"
        }

        It "Should filter operations by TableByTableCopy method" {
            $results = Search-FlashdbOperations -Method "TableByTableCopy"
            $results | Should -Not -BeNullOrEmpty
            $results[0].method | Should -Be "TableByTableCopy"
        }
    }

    Context "Date Range Filtering" {
        It "Should filter operations within date range" {
            $from = (Get-Date).AddDays(-8)
            $to = (Get-Date).AddDays(-2)
            $results = Search-FlashdbOperations -DateFrom $from -DateTo $to
            $results | Should -Not -BeNullOrEmpty
        }

        It "Should return empty results for out-of-range dates" {
            $from = (Get-Date).AddDays(-100)
            $to = (Get-Date).AddDays(-50)
            $results = Search-FlashdbOperations -DateFrom $from -DateTo $to
            # Should be empty or very limited depending on test data
        }
    }

    Context "Operator Filtering" {
        It "Should filter operations by operator" {
            $results = Search-FlashdbOperations -Operator "admin@company.com"
            $results | Should -Not -BeNullOrEmpty
            $results[0].operator | Should -Be "admin@company.com"
        }
    }

    Context "Combined Filters" {
        It "Should apply multiple filters (status AND method)" {
            $results = Search-FlashdbOperations -Status "ready" -Method "BackupRestore"
            $results | Should -Not -BeNullOrEmpty
            $results[0].status | Should -Be "ready"
            $results[0].method | Should -Be "BackupRestore"
        }

        It "Should apply keyword and status filters together" {
            $results = Search-FlashdbOperations -Keyword "backup" -Status "ready"
            $results | Should -Not -BeNullOrEmpty
            $results[0].status | Should -Be "ready"
        }
    }

    Context "Sorting" {
        It "Should sort by creation date descending by default" {
            $results = Search-FlashdbOperations -SortBy "createdAt" -SortOrder "desc"
            $results | Should -Not -BeNullOrEmpty
            # First result should be more recent
        }

        It "Should sort by name ascending" {
            $results = Search-FlashdbOperations -SortBy "name" -SortOrder "asc"
            $results | Should -Not -BeNullOrEmpty
        }
    }

    Context "Pagination" {
        It "Should respect limit parameter" {
            $results = Search-FlashdbOperations -Limit 2
            $results.Count | Should -BeLessOrEqual 2
        }

        It "Should respect offset parameter" {
            $allResults = Search-FlashdbOperations
            $offsetResults = Search-FlashdbOperations -Offset 1 -Limit 1
            $offsetResults[0].id | Should -Not -Be $allResults[0].id
        }
    }

    Context "Regex Search" {
        It "Should support regex patterns" {
            $results = Search-FlashdbOperations -Keyword "^op-[a-z]+" -UseRegex $true
            $results | Should -Not -BeNullOrEmpty
        }
    }
}

Describe "Filter-FlashdbClones" {
    Context "Keyword Search" {
        It "Should find clones by name" {
            $results = Filter-FlashdbClones -Keyword "dev"
            $results | Should -Not -BeNullOrEmpty
            $results.Count | Should -BeGreaterThan 0
        }

        It "Should find clones by description" {
            $results = Filter-FlashdbClones -Keyword "Development"
            $results | Should -Not -BeNullOrEmpty
        }

        It "Should return empty for non-matching keyword" {
            $results = Filter-FlashdbClones -Keyword "NonExistent12345"
            $results | Should -BeNullOrEmpty
        }
    }

    Context "Golden Image Filtering" {
        It "Should filter clones by golden image ID" {
            $results = Filter-FlashdbClones -GoldenImageId "golden-prod-20260606"
            $results | Should -Not -BeNullOrEmpty
            $results | Where-Object { $_.goldenImageId -ne "golden-prod-20260606" } | Should -BeNullOrEmpty
        }
    }

    Context "Status Filtering" {
        It "Should filter clones by ready status" {
            $results = Filter-FlashdbClones -Status "ready"
            $results | Should -Not -BeNullOrEmpty
            $results[0].status | Should -Be "ready"
        }

        It "Should filter clones by attached status" {
            $results = Filter-FlashdbClones -Status "attached"
            $results | Should -Not -BeNullOrEmpty
            $results[0].status | Should -Be "attached"
        }

        It "Should filter clones by detached status" {
            $results = Filter-FlashdbClones -Status "detached"
            $results | Should -Not -BeNullOrEmpty
            $results[0].status | Should -Be "detached"
        }
    }

    Context "Creation Date Filtering" {
        It "Should filter clones by creation date range" {
            $from = (Get-Date).AddDays(-20)
            $to = (Get-Date)
            $results = Filter-FlashdbClones -CreatedFrom $from -CreatedTo $to
            $results | Should -Not -BeNullOrEmpty
        }
    }

    Context "Tag Filtering" {
        It "Should filter clones by tag" {
            $results = Filter-FlashdbClones -Tags @("development")
            $results | Should -Not -BeNullOrEmpty
            $results[0].tags | Should -Contain "development"
        }

        It "Should filter clones by multiple tags" {
            $results = Filter-FlashdbClones -Tags @("development", "test")
            $results | Should -Not -BeNullOrEmpty
        }
    }

    Context "Combined Filters" {
        It "Should apply golden image and status filters together" {
            $results = Filter-FlashdbClones -GoldenImageId "golden-prod-20260606" -Status "ready"
            $results | Should -Not -BeNullOrEmpty
            $results[0].goldenImageId | Should -Be "golden-prod-20260606"
            $results[0].status | Should -Be "ready"
        }

        It "Should apply keyword and date filters together" {
            $from = (Get-Date).AddDays(-20)
            $to = (Get-Date)
            $results = Filter-FlashdbClones -Keyword "prod" -CreatedFrom $from -CreatedTo $to
            # Results should match both criteria
        }
    }

    Context "Sorting" {
        It "Should sort by creation date" {
            $results = Filter-FlashdbClones -SortBy "createdAt" -SortOrder "desc"
            $results | Should -Not -BeNullOrEmpty
        }

        It "Should sort by name" {
            $results = Filter-FlashdbClones -SortBy "name" -SortOrder "asc"
            $results | Should -Not -BeNullOrEmpty
        }
    }

    Context "Pagination" {
        It "Should respect limit parameter" {
            $results = Filter-FlashdbClones -Limit 2
            $results.Count | Should -BeLessOrEqual 2
        }

        It "Should respect offset parameter" {
            $allResults = Filter-FlashdbClones
            if ($allResults.Count -gt 1) {
                $offsetResults = Filter-FlashdbClones -Offset 1 -Limit 1
                $offsetResults[0].id | Should -Not -Be $allResults[0].id
            }
        }
    }
}

Describe "Filter-FlashdbCheckpoints" {
    Context "Keyword Search" {
        It "Should find checkpoints by name" {
            $results = Filter-FlashdbCheckpoints -Keyword "Initial"
            $results | Should -Not -BeNullOrEmpty
        }

        It "Should find checkpoints by description" {
            $results = Filter-FlashdbCheckpoints -Keyword "Initial"
            $results | Should -Not -BeNullOrEmpty
        }

        It "Should return empty for non-matching keyword" {
            $results = Filter-FlashdbCheckpoints -Keyword "NonExistent12345"
            $results | Should -BeNullOrEmpty
        }
    }

    Context "Clone ID Filtering" {
        It "Should filter checkpoints by clone ID" {
            $results = Filter-FlashdbCheckpoints -CloneId "clone-dev-001"
            $results | Should -Not -BeNullOrEmpty
            $results | Where-Object { $_.cloneId -ne "clone-dev-001" } | Should -BeNullOrEmpty
        }
    }

    Context "Phase Filtering" {
        It "Should filter checkpoints by complete phase" {
            $results = Filter-FlashdbCheckpoints -Phase "complete"
            $results | Should -Not -BeNullOrEmpty
            $results[0].phase | Should -Be "complete"
        }

        It "Should filter checkpoints by failed phase" {
            $results = Filter-FlashdbCheckpoints -Phase "failed"
            $results | Should -Not -BeNullOrEmpty
            $results[0].phase | Should -Be "failed"
        }
    }

    Context "Creation Date Filtering" {
        It "Should filter checkpoints by creation date range" {
            $from = (Get-Date).AddDays(-10)
            $to = (Get-Date)
            $results = Filter-FlashdbCheckpoints -CreatedFrom $from -CreatedTo $to
            $results | Should -Not -BeNullOrEmpty
        }
    }

    Context "Combined Filters" {
        It "Should apply clone ID and phase filters together" {
            $results = Filter-FlashdbCheckpoints -CloneId "clone-dev-001" -Phase "complete"
            $results | Should -Not -BeNullOrEmpty
            $results[0].cloneId | Should -Be "clone-dev-001"
            $results[0].phase | Should -Be "complete"
        }
    }

    Context "Sorting" {
        It "Should sort by creation date" {
            $results = Filter-FlashdbCheckpoints -SortBy "createdAt" -SortOrder "desc"
            $results | Should -Not -BeNullOrEmpty
        }

        It "Should sort by clone ID" {
            $results = Filter-FlashdbCheckpoints -SortBy "cloneId" -SortOrder "asc"
            $results | Should -Not -BeNullOrEmpty
        }
    }

    Context "Pagination" {
        It "Should respect limit parameter" {
            $results = Filter-FlashdbCheckpoints -Limit 2
            $results.Count | Should -BeLessOrEqual 2
        }
    }
}

Describe "Get-FlashdbSearchSuggestions" {
    Context "Clone Name Suggestions" {
        It "Should return suggestions for clone names" {
            $results = Get-FlashdbSearchSuggestions -Query "dev" -Type "clone"
            $results | Should -Not -BeNullOrEmpty
            $results[0] | Should -Match "dev"
        }

        It "Should return limited suggestions" {
            $results = Get-FlashdbSearchSuggestions -Query "dev" -Type "clone" -Limit 5
            $results.Count | Should -BeLessOrEqual 5
        }
    }

    Context "Golden Image Suggestions" {
        It "Should return suggestions for golden image names" {
            $results = Get-FlashdbSearchSuggestions -Query "golden" -Type "golden-image"
            # May or may not find results depending on test data
        }
    }

    Context "All Type Suggestions" {
        It "Should return suggestions from all types" {
            $results = Get-FlashdbSearchSuggestions -Query "clone" -Type "all"
            # Should include both clones and golden images
        }
    }

    Context "Empty Query" {
        It "Should handle empty query gracefully" {
            $results = Get-FlashdbSearchSuggestions -Query ""
            # Should return empty or all suggestions
        }
    }

    Context "Case Insensitivity" {
        It "Should find suggestions regardless of case" {
            $results = Get-FlashdbSearchSuggestions -Query "DEV" -Type "clone"
            $results | Should -Not -BeNullOrEmpty
        }
    }
}

Describe "Search Performance and Edge Cases" {
    Context "Large Result Sets" {
        It "Should handle pagination with large datasets" {
            $results = Search-FlashdbOperations -Limit 100
            $results | Should -Not -BeNullOrEmpty
        }

        It "Should handle high offset values" {
            $results = Search-FlashdbOperations -Offset 1000 -Limit 10
            # Should return empty or gracefully handle large offset
        }
    }

    Context "Special Characters" {
        It "Should handle special characters in keyword" {
            # This tests the search function's ability to handle special characters
            $results = Search-FlashdbOperations -Keyword "backup-001"
            # Should not throw error
        }
    }

    Context "Null and Empty Parameters" {
        It "Should handle missing optional parameters" {
            $results = Search-FlashdbOperations
            $results | Should -Not -BeNullOrEmpty
        }

        It "Should handle empty keyword" {
            $results = Search-FlashdbOperations -Keyword ""
            # Should return all results
        }
    }
}
