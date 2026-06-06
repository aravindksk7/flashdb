# Test suite for FlashDB batch operations
# Tests batch creation, execution, cancellation, and results retrieval

#Requires -Version 5.1
#Requires -Modules Pester

Import-Module -Name "C:\flashdb\src\FlashDB\FlashDB.psm1" -Force

Describe "Batch Operations" {
    BeforeAll {
        # Setup test storage path
        $script:TestStoragePath = "C:\temp\flashdb-batch-tests"

        # Ensure directory exists
        if (-not (Test-Path -Path $script:TestStoragePath)) {
            New-Item -ItemType Directory -Path $script:TestStoragePath -Force | Out-Null
        }

        # Create mock golden image metadata for testing
        $mockGoldenImageMeta = @{
            golden = @{
                id = "golden-test-20260606"
                databaseName = "TestDB"
                databaseSize = "10GB"
                parentVhdxPath = "D:\GoldenImages\TestDB-20260606.vhdx"
            }
        }

        $goldenImagePath = Join-Path $script:TestStoragePath "golden-test-20260606.json"
        $mockGoldenImageMeta | ConvertTo-Json -Depth 10 | Out-File -FilePath $goldenImagePath -Encoding UTF8 -Force
    }

    Context "Batch Creation" {
        It "Creates a clone batch operation with multiple operations" {
            $operations = @(
                @{
                    GoldenImageId = "golden-test-20260606"
                    CloneName = "clone-test-1"
                    InstancePath = "LOCALHOST\SQLEXPRESS"
                    StoragePath = $script:TestStoragePath
                },
                @{
                    GoldenImageId = "golden-test-20260606"
                    CloneName = "clone-test-2"
                    InstancePath = "LOCALHOST\SQLEXPRESS"
                    StoragePath = $script:TestStoragePath
                }
            )

            $batch = New-FlashdbBatchOperation `
                -OperationType 'clone-batch' `
                -Operations $operations `
                -ConcurrencyLimit 2 `
                -StoragePath $script:TestStoragePath

            $batch | Should -Not -BeNullOrEmpty
            $batch.id | Should -Match '^batch-clone-batch-'
            $batch.type | Should -Be 'clone-batch'
            $batch.state | Should -Be 'pending'
            $batch.totalOperations | Should -Be 2
            $batch.concurrencyLimit | Should -Be 2
            $batch.operations | Should -HaveCount 2
        }

        It "Creates a checkpoint batch operation" {
            $operations = @(
                @{ CloneId = "clone-1"; CheckpointName = "pre-test" },
                @{ CloneId = "clone-2"; CheckpointName = "pre-test" }
            )

            $batch = New-FlashdbBatchOperation `
                -OperationType 'checkpoint-batch' `
                -Operations $operations `
                -StoragePath $script:TestStoragePath

            $batch.type | Should -Be 'checkpoint-batch'
            $batch.state | Should -Be 'pending'
        }

        It "Creates a delete batch operation" {
            $operations = @(
                @{ CloneId = "clone-1" },
                @{ CloneId = "clone-2" },
                @{ CloneId = "clone-3" }
            )

            $batch = New-FlashdbBatchOperation `
                -OperationType 'delete-batch' `
                -Operations $operations `
                -StoragePath $script:TestStoragePath

            $batch.type | Should -Be 'delete-batch'
            $batch.totalOperations | Should -Be 3
        }

        It "Validates concurrency limit bounds" {
            $operations = @(@{ CloneId = "clone-1" })

            {
                New-FlashdbBatchOperation `
                    -OperationType 'delete-batch' `
                    -Operations $operations `
                    -ConcurrencyLimit 0 `
                    -StoragePath $script:TestStoragePath
            } | Should -Throw

            {
                New-FlashdbBatchOperation `
                    -OperationType 'delete-batch' `
                    -Operations $operations `
                    -ConcurrencyLimit 11 `
                    -StoragePath $script:TestStoragePath
            } | Should -Throw
        }

        It "Saves batch metadata to .flashdb-batches directory" {
            $operations = @(@{ CloneId = "clone-test" })

            $batch = New-FlashdbBatchOperation `
                -OperationType 'delete-batch' `
                -Operations $operations `
                -StoragePath $script:TestStoragePath

            $metadataDir = Join-Path $script:TestStoragePath ".flashdb-batches"
            $metadataFile = Join-Path $metadataDir "$($batch.id).json"

            $metadataFile | Should -Exist
        }
    }

    Context "Batch Retrieval" {
        BeforeEach {
            $script:TestBatch = New-FlashdbBatchOperation `
                -OperationType 'clone-batch' `
                -Operations @(
                    @{ GoldenImageId = "golden-1"; CloneName = "clone-1"; InstancePath = "SQL"; StoragePath = $script:TestStoragePath },
                    @{ GoldenImageId = "golden-1"; CloneName = "clone-2"; InstancePath = "SQL"; StoragePath = $script:TestStoragePath }
                ) `
                -StoragePath $script:TestStoragePath
        }

        It "Retrieves batch by ID" {
            $retrieved = Get-FlashdbBatchOperation `
                -BatchId $script:TestBatch.id `
                -StoragePath $script:TestStoragePath

            $retrieved | Should -Not -BeNullOrEmpty
            $retrieved.id | Should -Be $script:TestBatch.id
            $retrieved.type | Should -Be 'clone-batch'
        }

        It "Lists all batches" {
            $batches = Get-FlashdbBatchOperations -StoragePath $script:TestStoragePath

            $batches | Should -Not -BeNullOrEmpty
            $batches | Should -BeOfType @('PSCustomObject', 'Object')
        }

        It "Filters batches by state" {
            $pendingBatches = Get-FlashdbBatchOperations `
                -StoragePath $script:TestStoragePath `
                -State 'pending'

            $pendingBatches | Should -Not -BeNullOrEmpty
            foreach ($batch in $pendingBatches) {
                $batch.state | Should -Be 'pending'
            }
        }

        It "Returns error for non-existent batch" {
            {
                Get-FlashdbBatchOperation `
                    -BatchId "batch-nonexistent" `
                    -StoragePath $script:TestStoragePath
            } | Should -Throw
        }
    }

    Context "Batch Cancellation" {
        BeforeEach {
            $script:CancelTestBatch = New-FlashdbBatchOperation `
                -OperationType 'clone-batch' `
                -Operations @(
                    @{ GoldenImageId = "golden-1"; CloneName = "clone-1"; InstancePath = "SQL"; StoragePath = $script:TestStoragePath },
                    @{ GoldenImageId = "golden-1"; CloneName = "clone-2"; InstancePath = "SQL"; StoragePath = $script:TestStoragePath }
                ) `
                -StoragePath $script:TestStoragePath
        }

        It "Cancels a pending batch" {
            $cancelled = Cancel-FlashdbBatchOperation `
                -BatchId $script:CancelTestBatch.id `
                -StoragePath $script:TestStoragePath

            $cancelled.state | Should -Be 'cancelled'
            $cancelled.cancelledOperations | Should -Be 2
        }

        It "Updates cancellation time" {
            $cancelled = Cancel-FlashdbBatchOperation `
                -BatchId $script:CancelTestBatch.id `
                -StoragePath $script:TestStoragePath

            $cancelled.completedAt | Should -Not -BeNullOrEmpty
        }
    }

    Context "Batch Results" {
        BeforeEach {
            $script:ResultTestBatch = New-FlashdbBatchOperation `
                -OperationType 'delete-batch' `
                -Operations @(
                    @{ CloneId = "clone-1" },
                    @{ CloneId = "clone-2" }
                ) `
                -StoragePath $script:TestStoragePath
        }

        It "Retrieves batch results" {
            $results = Get-FlashdbBatchResults `
                -BatchId $script:ResultTestBatch.id `
                -StoragePath $script:TestStoragePath

            $results | Should -Not -BeNullOrEmpty
            $results.batchId | Should -Be $script:ResultTestBatch.id
            $results.type | Should -Be 'delete-batch'
            $results.totalOperations | Should -Be 2
        }

        It "Includes operation details in results" {
            $results = Get-FlashdbBatchResults `
                -BatchId $script:ResultTestBatch.id `
                -StoragePath $script:TestStoragePath

            $results.operations | Should -HaveCount 2
            $results.operations[0] | Should -HaveProperty 'index'
            $results.operations[0] | Should -HaveProperty 'operationId'
            $results.operations[0] | Should -HaveProperty 'status'
        }

        It "Can exclude errors from results" {
            $resultsWithErrors = Get-FlashdbBatchResults `
                -BatchId $script:ResultTestBatch.id `
                -StoragePath $script:TestStoragePath `
                -IncludeErrors $true

            $resultsWithoutErrors = Get-FlashdbBatchResults `
                -BatchId $script:ResultTestBatch.id `
                -StoragePath $script:TestStoragePath `
                -IncludeErrors $false

            # Both should return results, just with/without error details
            $resultsWithErrors | Should -Not -BeNullOrEmpty
            $resultsWithoutErrors | Should -Not -BeNullOrEmpty
        }
    }

    Context "Batch State Management" {
        It "Tracks batch state transitions" {
            $batch = New-FlashdbBatchOperation `
                -OperationType 'clone-batch' `
                -Operations @(@{ CloneId = "clone-1" }) `
                -StoragePath $script:TestStoragePath

            $batch.state | Should -Be 'pending'
            $batch.createdAt | Should -Not -BeNullOrEmpty

            # After cancellation, state should change
            $cancelled = Cancel-FlashdbBatchOperation `
                -BatchId $batch.id `
                -StoragePath $script:TestStoragePath

            $cancelled.state | Should -Be 'cancelled'
        }

        It "Maintains operation statuses within batch" {
            $batch = New-FlashdbBatchOperation `
                -OperationType 'delete-batch' `
                -Operations @(
                    @{ CloneId = "clone-1" },
                    @{ CloneId = "clone-2" }
                ) `
                -StoragePath $script:TestStoragePath

            foreach ($op in $batch.operations) {
                $op.status | Should -Be 'pending'
                $op.operationId | Should -Match '^op-'
            }
        }
    }

    AfterAll {
        # Cleanup test storage path
        if (Test-Path -Path $script:TestStoragePath) {
            Remove-Item -Path $script:TestStoragePath -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}
