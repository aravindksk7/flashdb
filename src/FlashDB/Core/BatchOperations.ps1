# PowerShell module for FlashDB batch operations
# Note: This module is dot-sourced by FlashDB.psm1, not imported separately

# Set strict mode for debugging (already set in parent, but keeping for safety)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

<#
.SYNOPSIS
    Batch Operations module for FlashDB
    Provides functionality to create and manage batch operations with parallel execution

.DESCRIPTION
    This module implements batch operations including:
    - New-FlashdbBatchOperation: Create a new batch operation
    - Get-FlashdbBatchOperation: Retrieve batch operation status
    - Start-FlashdbBatchQueue: Execute batch operations with concurrent job handling
    - Cancel-FlashdbBatchOperation: Cancel a running batch
    - Get-FlashdbBatchResults: Get results after completion
#>

# Batch operation states
$script:BatchStates = @{
    Pending = 'pending'
    Running = 'running'
    Completed = 'completed'
    Failed = 'failed'
    Cancelled = 'cancelled'
}

<#
.SYNOPSIS
    Creates a new batch operation for managing multiple concurrent operations

.DESCRIPTION
    Creates a batch operation record that can contain multiple clone, checkpoint,
    delete, or restore operations to be executed in parallel.

.PARAMETER OperationType
    Type of operation: 'clone-batch', 'checkpoint-batch', 'delete-batch', 'restore-batch'

.PARAMETER Operations
    Array of operation specifications, each with required parameters for the operation type

.PARAMETER ConcurrencyLimit
    Maximum number of parallel jobs to execute (default: 3)

.PARAMETER StoragePath
    Directory where batch metadata will be stored

.EXAMPLE
    $ops = @(
        @{ GoldenImageId = "golden-1"; CloneName = "clone-1"; InstancePath = "LOCALHOST\SQLEXPRESS"; StoragePath = "D:\CloneStorage" },
        @{ GoldenImageId = "golden-1"; CloneName = "clone-2"; InstancePath = "LOCALHOST\SQLEXPRESS"; StoragePath = "D:\CloneStorage" }
    )
    $batch = New-FlashdbBatchOperation -OperationType 'clone-batch' `
        -Operations $ops `
        -ConcurrencyLimit 2 `
        -StoragePath "D:\CloneStorage"

.OUTPUTS
    PSCustomObject with batch metadata including Id, State, Progress
#>
function New-FlashdbBatchOperation {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet('clone-batch', 'checkpoint-batch', 'delete-batch', 'restore-batch')]
        [string]$OperationType,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [object[]]$Operations,

        [Parameter()]
        [ValidateRange(1, 10)]
        [int]$ConcurrencyLimit = 3,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$StoragePath
    )

    begin {
        Write-Verbose "Creating new batch operation: $OperationType with $($Operations.Count) operations"

        # Validate storage path
        if (-not (Test-Path -Path $StoragePath -PathType Container)) {
            throw "Storage path does not exist: $StoragePath"
        }
    }

    process {
        try {
            # Generate batch ID
            $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
            $randomSuffix = Get-Random -Minimum 1000 -Maximum 9999
            $batchId = "batch-$OperationType-$timestamp-$randomSuffix"

            # Initialize operation tracking
            $operationList = @()
            for ($i = 0; $i -lt $Operations.Count; $i++) {
                $operationList += @{
                    index = $i
                    operationId = "op-$batchId-$i"
                    status = $script:BatchStates.Pending
                    params = $Operations[$i]
                    result = $null
                    error = $null
                    startTime = $null
                    endTime = $null
                    jobId = $null
                }
            }

            # Create batch metadata
            $batchMetadata = @{
                batch = @{
                    id = $batchId
                    type = $OperationType
                    state = $script:BatchStates.Pending
                    createdAt = (Get-Date).ToUniversalTime().ToString("o")
                    startedAt = $null
                    completedAt = $null
                    concurrencyLimit = $ConcurrencyLimit
                    totalOperations = $Operations.Count
                    completedOperations = 0
                    failedOperations = 0
                    cancelledOperations = 0
                    operations = $operationList
                }
            }

            # Save batch metadata
            $metadataDir = Join-Path $StoragePath ".flashdb-batches"
            if (-not (Test-Path -Path $metadataDir -PathType Container)) {
                New-Item -ItemType Directory -Path $metadataDir -Force | Out-Null
            }

            $metadataPath = Join-Path $metadataDir "$batchId.json"
            $batchMetadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $metadataPath -Encoding UTF8 -Force

            Write-Verbose "Batch metadata saved to: $metadataPath"

            # Return batch object
            $batch = $batchMetadata.batch
            $batch | Add-Member -NotePropertyName 'MetadataPath' -NotePropertyValue $metadataPath
            return $batch

        } catch {
            Write-Error "Failed to create batch operation: $_"
            throw $_
        }
    }
}

<#
.SYNOPSIS
    Retrieves the status of a batch operation

.DESCRIPTION
    Gets the current status, progress, and details of a batch operation
    including individual operation statuses and any errors.

.PARAMETER BatchId
    The ID of the batch operation to retrieve

.PARAMETER StoragePath
    Directory containing batch metadata

.EXAMPLE
    $batch = Get-FlashdbBatchOperation -BatchId "batch-clone-batch-20260606-120000-5432" -StoragePath "D:\CloneStorage"

.OUTPUTS
    PSCustomObject with batch status and operation details
#>
function Get-FlashdbBatchOperation {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$BatchId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$StoragePath
    )

    process {
        try {
            $metadataDir = Join-Path $StoragePath ".flashdb-batches"
            $metadataPath = Join-Path $metadataDir "$BatchId.json"

            if (-not (Test-Path -Path $metadataPath)) {
                throw "Batch not found: $BatchId"
            }

            # Load batch metadata
            $content = Get-Content -Path $metadataPath -Raw -ErrorAction Stop
            $batchData = $content | ConvertFrom-Json -ErrorAction Stop

            return $batchData.batch

        } catch {
            Write-Error "Failed to retrieve batch operation: $_"
            throw $_
        }
    }
}

<#
.SYNOPSIS
    Lists all batch operations

.DESCRIPTION
    Retrieves all batch operations in the storage location with basic status info.

.PARAMETER StoragePath
    Directory containing batch metadata

.PARAMETER State
    Filter by state: pending, running, completed, failed, cancelled

.EXAMPLE
    $batches = Get-FlashdbBatchOperation -StoragePath "D:\CloneStorage"
    $failedBatches = Get-FlashdbBatchOperation -StoragePath "D:\CloneStorage" -State "failed"

.OUTPUTS
    Array of PSCustomObject with batch information
#>
function Get-FlashdbBatchOperations {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$StoragePath,

        [Parameter()]
        [ValidateSet('pending', 'running', 'completed', 'failed', 'cancelled')]
        [string]$State
    )

    process {
        try {
            $metadataDir = Join-Path $StoragePath ".flashdb-batches"

            if (-not (Test-Path -Path $metadataDir -PathType Container)) {
                return @()
            }

            $batches = @()
            $metadataFiles = Get-ChildItem -Path $metadataDir -Filter "batch-*.json" -ErrorAction SilentlyContinue

            foreach ($file in $metadataFiles) {
                try {
                    $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
                    $batchData = $content | ConvertFrom-Json -ErrorAction SilentlyContinue

                    if ($batchData -and $batchData.batch) {
                        $batch = $batchData.batch

                        # Filter by state if specified
                        if (-not $State -or $batch.state -eq $State) {
                            $batches += $batch
                        }
                    }
                } catch {
                    Write-Warning "Failed to load batch from: $($file.FullName)"
                }
            }

            return $batches

        } catch {
            Write-Error "Failed to list batch operations: $_"
            throw $_
        }
    }
}

<#
.SYNOPSIS
    Executes a batch operation with concurrent job management

.DESCRIPTION
    Starts execution of a batch operation, managing concurrent jobs up to
    the specified concurrency limit. Updates batch status in metadata.

.PARAMETER BatchId
    The ID of the batch operation to execute

.PARAMETER StoragePath
    Directory containing batch metadata and clone storage

.EXAMPLE
    Start-FlashdbBatchQueue -BatchId "batch-clone-batch-20260606-120000-5432" -StoragePath "D:\CloneStorage"

.OUTPUTS
    PSCustomObject with execution status
#>
function Start-FlashdbBatchQueue {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$BatchId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$StoragePath
    )

    process {
        try {
            # Load batch metadata
            $batch = Get-FlashdbBatchOperation -BatchId $BatchId -StoragePath $StoragePath
            $metadataDir = Join-Path $StoragePath ".flashdb-batches"
            $metadataPath = Join-Path $metadataDir "$BatchId.json"

            # Update batch state to running
            $content = Get-Content -Path $metadataPath -Raw
            $batchData = $content | ConvertFrom-Json
            $batchData.batch.state = $script:BatchStates.Running
            $batchData.batch.startedAt = (Get-Date).ToUniversalTime().ToString("o")

            # Prepare operation queue
            $pendingOps = $batchData.batch.operations | Where-Object { $_.status -eq $script:BatchStates.Pending }
            $concurrencyLimit = $batchData.batch.concurrencyLimit
            $runningJobs = @{}

            # Execute operations with concurrency management
            Write-Verbose "Starting batch execution with concurrency limit: $concurrencyLimit"

            foreach ($op in $pendingOps) {
                # Wait for available job slot
                while ($runningJobs.Count -ge $concurrencyLimit) {
                    Start-Sleep -Milliseconds 100

                    # Check for completed jobs
                    $completedIds = @()
                    foreach ($jobId in $runningJobs.Keys) {
                        $job = Get-Job -Id $jobId -ErrorAction SilentlyContinue
                        if ($job -and $job.State -in @('Completed', 'Failed')) {
                            $completedIds += $jobId
                        }
                    }

                    # Process completed jobs
                    foreach ($jobId in $completedIds) {
                        try {
                            $job = Get-Job -Id $jobId -ErrorAction SilentlyContinue
                            $opIndex = $runningJobs[$jobId]
                            $currentOp = $batchData.batch.operations[$opIndex]

                            if ($job.State -eq 'Completed') {
                                $result = Receive-Job -Job $job -ErrorAction SilentlyContinue
                                $currentOp.status = $script:BatchStates.Completed
                                $currentOp.result = $result
                                $batchData.batch.completedOperations++
                            } else {
                                $error = $job.ChildJobs[0].Error | Out-String
                                $currentOp.status = $script:BatchStates.Failed
                                $currentOp.error = $error
                                $batchData.batch.failedOperations++
                            }

                            $currentOp.endTime = (Get-Date).ToUniversalTime().ToString("o")
                            $runningJobs.Remove($jobId)
                            Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
                        } catch {
                            Write-Warning "Error processing completed job: $_"
                        }
                    }
                }

                # Start new job
                try {
                    $scriptBlock = {
                        param($OperationType, $Params)

                        # Import FlashDB module in job context
                        Import-Module "C:\flashdb\src\FlashDB\FlashDB.psm1" -Force -ErrorAction Stop

                        switch ($OperationType) {
                            'clone-batch' {
                                New-FlashdbClone @Params
                            }
                            'checkpoint-batch' {
                                New-FlashdbCheckpoint @Params
                            }
                            'delete-batch' {
                                Remove-FlashdbClone @Params
                            }
                            'restore-batch' {
                                Restore-FlashdbClone @Params
                            }
                            default {
                                throw "Unknown operation type: $OperationType"
                            }
                        }
                    }

                    $job = Start-Job -ScriptBlock $scriptBlock `
                        -ArgumentList $batchData.batch.type, $op.params `
                        -ErrorAction Stop

                    $op.jobId = $job.Id
                    $op.status = $script:BatchStates.Running
                    $op.startTime = (Get-Date).ToUniversalTime().ToString("o")
                    $runningJobs[$job.Id] = $op.index

                    Write-Verbose "Started job for operation $($op.index): Job ID $($job.Id)"

                } catch {
                    $op.status = $script:BatchStates.Failed
                    $op.error = "Failed to start job: $_"
                    $op.endTime = (Get-Date).ToUniversalTime().ToString("o")
                    $batchData.batch.failedOperations++
                    Write-Warning "Failed to start operation $($op.index): $_"
                }
            }

            # Wait for all remaining jobs to complete
            Write-Verbose "Waiting for remaining jobs to complete..."
            while ($runningJobs.Count -gt 0) {
                Start-Sleep -Milliseconds 100

                $completedIds = @()
                foreach ($jobId in $runningJobs.Keys) {
                    $job = Get-Job -Id $jobId -ErrorAction SilentlyContinue
                    if ($job -and $job.State -in @('Completed', 'Failed')) {
                        $completedIds += $jobId
                    }
                }

                foreach ($jobId in $completedIds) {
                    try {
                        $job = Get-Job -Id $jobId -ErrorAction SilentlyContinue
                        $opIndex = $runningJobs[$jobId]
                        $currentOp = $batchData.batch.operations[$opIndex]

                        if ($job.State -eq 'Completed') {
                            $result = Receive-Job -Job $job -ErrorAction SilentlyContinue
                            $currentOp.status = $script:BatchStates.Completed
                            $currentOp.result = $result
                            $batchData.batch.completedOperations++
                        } else {
                            $error = $job.ChildJobs[0].Error | Out-String
                            $currentOp.status = $script:BatchStates.Failed
                            $currentOp.error = $error
                            $batchData.batch.failedOperations++
                        }

                        $currentOp.endTime = (Get-Date).ToUniversalTime().ToString("o")
                        $runningJobs.Remove($jobId)
                        Remove-Job -Job $job -Force -ErrorAction SilentlyContinue
                    } catch {
                        Write-Warning "Error processing completed job: $_"
                    }
                }
            }

            # Update final batch state
            $allCompleted = @($batchData.batch.operations | Where-Object { $_.status -in @($script:BatchStates.Completed, $script:BatchStates.Failed, $script:BatchStates.Cancelled) }).Count

            if ($allCompleted -eq $batchData.batch.totalOperations) {
                if ($batchData.batch.failedOperations -gt 0) {
                    $batchData.batch.state = $script:BatchStates.Failed
                } else {
                    $batchData.batch.state = $script:BatchStates.Completed
                }
            }

            $batchData.batch.completedAt = (Get-Date).ToUniversalTime().ToString("o")

            # Save final metadata
            $batchData | ConvertTo-Json -Depth 10 | Out-File -FilePath $metadataPath -Encoding UTF8 -Force

            return $batchData.batch

        } catch {
            Write-Error "Failed to execute batch queue: $_"
            throw $_
        }
    }
}

<#
.SYNOPSIS
    Cancels a running batch operation

.DESCRIPTION
    Stops all running jobs in a batch and updates its state to cancelled.
    Already completed operations remain unchanged.

.PARAMETER BatchId
    The ID of the batch operation to cancel

.PARAMETER StoragePath
    Directory containing batch metadata

.EXAMPLE
    Cancel-FlashdbBatchOperation -BatchId "batch-clone-batch-20260606-120000-5432" -StoragePath "D:\CloneStorage"

.OUTPUTS
    PSCustomObject with cancellation status
#>
function Cancel-FlashdbBatchOperation {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$BatchId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$StoragePath
    )

    process {
        try {
            # Load batch metadata
            $metadataDir = Join-Path $StoragePath ".flashdb-batches"
            $metadataPath = Join-Path $metadataDir "$BatchId.json"

            $content = Get-Content -Path $metadataPath -Raw
            $batchData = $content | ConvertFrom-Json

            # Cancel all running operations
            $runningOps = @($batchData.batch.operations | Where-Object { $_.status -eq $script:BatchStates.Running })

            foreach ($op in $runningOps) {
                if ($op.jobId) {
                    Stop-Job -Id $op.jobId -ErrorAction SilentlyContinue
                    Remove-Job -Id $op.jobId -Force -ErrorAction SilentlyContinue
                }

                $op.status = $script:BatchStates.Cancelled
                $op.endTime = (Get-Date).ToUniversalTime().ToString("o")
                $batchData.batch.cancelledOperations++
            }

            # Update batch state
            $batchData.batch.state = $script:BatchStates.Cancelled
            $batchData.batch.completedAt = (Get-Date).ToUniversalTime().ToString("o")

            # Save updated metadata
            $batchData | ConvertTo-Json -Depth 10 | Out-File -FilePath $metadataPath -Encoding UTF8 -Force

            Write-Verbose "Batch operation cancelled: $BatchId (cancelled $($batchData.batch.cancelledOperations) operations)"

            return $batchData.batch

        } catch {
            Write-Error "Failed to cancel batch operation: $_"
            throw $_
        }
    }
}

<#
.SYNOPSIS
    Retrieves results from a completed batch operation

.DESCRIPTION
    Gets the results of all operations in a batch, including successes and failures.

.PARAMETER BatchId
    The ID of the batch operation

.PARAMETER StoragePath
    Directory containing batch metadata

.PARAMETER IncludeErrors
    Include error details for failed operations (default: $true)

.EXAMPLE
    $results = Get-FlashdbBatchResults -BatchId "batch-clone-batch-20260606-120000-5432" -StoragePath "D:\CloneStorage"

.OUTPUTS
    PSCustomObject with operation results
#>
function Get-FlashdbBatchResults {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$BatchId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$StoragePath,

        [Parameter()]
        [bool]$IncludeErrors = $true
    )

    process {
        try {
            $batch = Get-FlashdbBatchOperation -BatchId $BatchId -StoragePath $StoragePath

            # Build results object
            $results = @{
                batchId = $batch.id
                type = $batch.type
                state = $batch.state
                totalOperations = $batch.totalOperations
                completedOperations = $batch.completedOperations
                failedOperations = $batch.failedOperations
                cancelledOperations = $batch.cancelledOperations
                createdAt = $batch.createdAt
                startedAt = $batch.startedAt
                completedAt = $batch.completedAt
                operations = @()
            }

            foreach ($op in $batch.operations) {
                $opResult = @{
                    index = $op.index
                    operationId = $op.operationId
                    status = $op.status
                    result = $op.result
                }

                if ($IncludeErrors -and $op.error) {
                    $opResult['error'] = $op.error
                }

                if ($op.startTime) { $opResult['startTime'] = $op.startTime }
                if ($op.endTime) { $opResult['endTime'] = $op.endTime }

                $results.operations += $opResult
            }

            return [PSCustomObject]$results

        } catch {
            Write-Error "Failed to retrieve batch results: $_"
            throw $_
        }
    }
}
