# PowerShell module for FlashDB Metrics Collection
# Note: This module is dot-sourced by FlashDB.psm1, not imported separately

# Set strict mode for debugging (already set in parent, but keeping for safety)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

<#
.SYNOPSIS
    Metrics Collection module for FlashDB
    Provides functionality to collect, aggregate, and report metrics on clone operations

.DESCRIPTION
    This module implements the metrics collection functionality including:
    - Get-FlashdbMetrics: Retrieve comprehensive metrics overview
    - Get-CloneCreationStats: Analyze clone creation performance
    - Get-StorageStats: Analyze storage efficiency and usage
    - Get-OperationStats: Analyze operation success rates and trends
    - Get-TimelineData: Generate historical data for charts
#>

<#
.SYNOPSIS
    Retrieves comprehensive metrics overview for FlashDB

.DESCRIPTION
    Aggregates all key metrics from clone operations, storage analysis, and timeline data.
    Returns summary statistics suitable for dashboard display.

.EXAMPLE
    $metrics = Get-FlashdbMetrics

.OUTPUTS
    System.Object with comprehensive metrics including overview, clones, storage, operations
#>
function Get-FlashdbMetrics {
    [CmdletBinding()]
    param()

    process {
        try {
            Write-Verbose "Collecting comprehensive FlashDB metrics"

            # Get all clones
            $allClones = Get-FlashdbClone -ErrorAction SilentlyContinue
            $cloneCount = if ($allClones) { @($allClones).Count } else { 0 }

            # Calculate basic overview
            $creationStats = Get-CloneCreationStats
            $storageStats = Get-StorageStats
            $operationStats = Get-OperationStats

            # Get timeline data for last 24 hours
            $last24hData = Get-TimelineData -HoursBack 24
            $operationsLast24h = $last24hData.cloneCreations

            return [PSCustomObject]@{
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                overview = [PSCustomObject]@{
                    totalClonesCreated = $cloneCount
                    totalStorageSavedGB = $storageStats.totalSavingsGB
                    avgCloneCreationTimeSeconds = $creationStats.averageCreationTimeSeconds
                    operationSuccessRatePercent = $operationStats.successRatePercent
                    operationsLast24h = $operationsLast24h
                    activeClonesCount = @($allClones | Where-Object { $_.Status -eq 'Attached' } | Measure-Object).Count
                }
                cloneStatistics = $creationStats
                storageMetrics = $storageStats
                operationMetrics = $operationStats
                lastUpdated = (Get-Date).ToUniversalTime().ToString("o")
            }
        } catch {
            Write-Error "Failed to collect metrics: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Retrieves clone creation statistics

.DESCRIPTION
    Analyzes all clones to calculate creation performance metrics including:
    - Average, minimum, and maximum creation times
    - Success rate for clone creation operations
    - Clone distribution by golden image

.EXAMPLE
    $stats = Get-CloneCreationStats

.OUTPUTS
    System.Object with clone creation statistics
#>
function Get-CloneCreationStats {
    [CmdletBinding()]
    param()

    process {
        try {
            Write-Verbose "Calculating clone creation statistics"

            # Get all clones
            $allClones = Get-FlashdbClone -ErrorAction SilentlyContinue
            if (-not $allClones) {
                return [PSCustomObject]@{
                    totalClones = 0
                    successfulClones = 0
                    failedClones = 0
                    averageCreationTimeSeconds = 0
                    minCreationTimeSeconds = 0
                    maxCreationTimeSeconds = 0
                    successRatePercent = 0
                    creationTimesByGoldenImage = @()
                }
            }

            # Ensure $allClones is an array
            $cloneArray = @($allClones)
            $totalClones = $cloneArray.Count

            # Calculate creation times for clones with CreatedAt metadata
            $creationTimes = @()
            $successCount = 0
            $failureCount = 0

            foreach ($clone in $cloneArray) {
                # Try to get metadata
                $metadata = $null
                if ($clone.MetadataPath -and (Test-Path $clone.MetadataPath)) {
                    try {
                        $metadata = Get-Content $clone.MetadataPath | ConvertFrom-Json
                    } catch {
                        Write-Verbose "Could not read metadata for clone: $($clone.Id)"
                    }
                }

                # Extract creation time if available
                if ($metadata -and $metadata.clone.createdAt) {
                    try {
                        $createdAt = [DateTime]::Parse($metadata.clone.createdAt)
                        $completedAt = $createdAt

                        # Try to find completed time from operations
                        if ($metadata.operations -and $metadata.operations.history) {
                            $lastOp = $metadata.operations.history | Select-Object -Last 1
                            if ($lastOp -and $lastOp.completedAt) {
                                $completedAt = [DateTime]::Parse($lastOp.completedAt)
                            }
                        }

                        $creationTimeSeconds = [Math]::Max(0, ($completedAt - $createdAt).TotalSeconds)
                        $creationTimes += $creationTimeSeconds
                    } catch {
                        Write-Verbose "Could not calculate creation time for clone: $($clone.Id)"
                    }
                }

                # Count success/failure
                if ($clone.Status -eq 'Attached' -or $clone.Status -eq 'Active') {
                    $successCount++
                } elseif ($clone.Status -eq 'Error' -or $clone.Status -eq 'Failed') {
                    $failureCount++
                } else {
                    $successCount++  # Default to success for other states
                }
            }

            # Calculate statistics
            $avgCreationTime = 0
            $minCreationTime = 0
            $maxCreationTime = 0
            if ($creationTimes.Count -gt 0) {
                $avgCreationTime = ($creationTimes | Measure-Object -Average).Average
                $minCreationTime = ($creationTimes | Measure-Object -Minimum).Minimum
                $maxCreationTime = ($creationTimes | Measure-Object -Maximum).Maximum
            }

            $successRatePercent = if ($totalClones -gt 0) {
                [Math]::Round(($successCount / $totalClones) * 100, 2)
            } else {
                0
            }

            # Group by golden image
            $byGoldenImage = $cloneArray | Group-Object -Property GoldenImageId | ForEach-Object {
                [PSCustomObject]@{
                    goldenImageId = $_.Name
                    cloneCount = $_.Count
                    avgCreationTimeSeconds = (($_.Group | ForEach-Object {
                        $createdAt = if ($_.Metadata) { [DateTime]::Parse($_.Metadata.clone.createdAt) } else { $_.CreatedAt }
                        $completedAt = $createdAt
                        [Math]::Max(0, ($completedAt - $createdAt).TotalSeconds)
                    }) | Measure-Object -Average).Average
                }
            }

            return [PSCustomObject]@{
                totalClones = $totalClones
                successfulClones = $successCount
                failedClones = $failureCount
                averageCreationTimeSeconds = [Math]::Round($avgCreationTime, 2)
                minCreationTimeSeconds = [Math]::Round($minCreationTime, 2)
                maxCreationTimeSeconds = [Math]::Round($maxCreationTime, 2)
                successRatePercent = $successRatePercent
                creationTimesByGoldenImage = $byGoldenImage
            }
        } catch {
            Write-Error "Failed to calculate clone creation stats: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Retrieves storage statistics and efficiency metrics

.DESCRIPTION
    Analyzes VHDX files to calculate storage efficiency including:
    - Total storage used by clones
    - Storage saved through differentiation and compression
    - Compression ratios
    - Storage breakdown by clone

.EXAMPLE
    $storage = Get-StorageStats

.OUTPUTS
    System.Object with storage metrics and breakdown
#>
function Get-StorageStats {
    [CmdletBinding()]
    param()

    process {
        try {
            Write-Verbose "Calculating storage statistics"

            # Get all clones
            $allClones = Get-FlashdbClone -ErrorAction SilentlyContinue
            if (-not $allClones) {
                return [PSCustomObject]@{
                    totalUsedGB = 0
                    totalSavingsGB = 0
                    compressionRatioPercent = 0
                    cloneStorageBreakdown = @()
                    avgCloneSizeGB = 0
                }
            }

            # Ensure $allClones is an array
            $cloneArray = @($allClones)
            $totalUsedBytes = 0
            $totalSavingsBytes = 0
            $storageBreakdown = @()

            foreach ($clone in $cloneArray) {
                try {
                    # Get metadata for parent size
                    $metadata = $null
                    $parentSizeBytes = 0
                    if ($clone.MetadataPath -and (Test-Path $clone.MetadataPath)) {
                        try {
                            $metadata = Get-Content $clone.MetadataPath | ConvertFrom-Json
                            if ($metadata.vhdx.parentSizeBytes) {
                                $parentSizeBytes = [int64]$metadata.vhdx.parentSizeBytes
                            }
                        } catch {
                            Write-Verbose "Could not read metadata for storage calculation: $($clone.Id)"
                        }
                    }

                    # Get VHDX file size
                    $vhdxPath = $clone.VhdxPath
                    if ($vhdxPath -and (Test-Path $vhdxPath)) {
                        $vhdxSizeBytes = (Get-Item $vhdxPath).Length
                        $totalUsedBytes += $vhdxSizeBytes

                        # Calculate savings (parent size - actual clone size = savings through differentiation)
                        if ($parentSizeBytes -gt 0) {
                            $savingsBytes = [Math]::Max(0, $parentSizeBytes - $vhdxSizeBytes)
                            $totalSavingsBytes += $savingsBytes
                        }

                        $storageBreakdown += [PSCustomObject]@{
                            cloneId = $clone.Id
                            cloneName = $clone.Name
                            vhdxSizeGB = [Math]::Round($vhdxSizeBytes / 1GB, 2)
                            parentSizeGB = [Math]::Round($parentSizeBytes / 1GB, 2)
                            savingsGB = [Math]::Round($savingsBytes / 1GB, 2)
                            compressionPercent = if ($parentSizeBytes -gt 0) {
                                [Math]::Round((1 - ($vhdxSizeBytes / $parentSizeBytes)) * 100, 2)
                            } else {
                                0
                            }
                        }
                    }
                } catch {
                    Write-Verbose "Could not calculate storage for clone: $($clone.Id) - $_"
                }
            }

            $totalUsedGB = [Math]::Round($totalUsedBytes / 1GB, 2)
            $totalSavingsGB = [Math]::Round($totalSavingsBytes / 1GB, 2)
            $avgCloneSizeGB = if ($cloneArray.Count -gt 0) {
                [Math]::Round($totalUsedGB / $cloneArray.Count, 2)
            } else {
                0
            }

            $totalParentSizeGB = ($storageBreakdown | Measure-Object -Property parentSizeGB -Sum).Sum
            $compressionRatio = if ($totalParentSizeGB -gt 0) {
                [Math]::Round((1 - ($totalUsedGB / $totalParentSizeGB)) * 100, 2)
            } else {
                0
            }

            return [PSCustomObject]@{
                totalUsedGB = $totalUsedGB
                totalSavingsGB = $totalSavingsGB
                compressionRatioPercent = $compressionRatio
                cloneStorageBreakdown = $storageBreakdown
                avgCloneSizeGB = $avgCloneSizeGB
                totalParentSizeGB = $totalParentSizeGB
            }
        } catch {
            Write-Error "Failed to calculate storage stats: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Retrieves operation statistics and success rates

.DESCRIPTION
    Analyzes operation logs to calculate operation metrics including:
    - Success/failure rates for different operation types
    - Common operations used
    - Operation performance metrics

.EXAMPLE
    $stats = Get-OperationStats

.OUTPUTS
    System.Object with operation metrics
#>
function Get-OperationStats {
    [CmdletBinding()]
    param()

    process {
        try {
            Write-Verbose "Calculating operation statistics"

            # Get all clones
            $allClones = Get-FlashdbClone -ErrorAction SilentlyContinue
            if (-not $allClones) {
                return [PSCustomObject]@{
                    totalOperations = 0
                    successfulOperations = 0
                    failedOperations = 0
                    successRatePercent = 100
                    operationsByType = @()
                }
            }

            # Ensure $allClones is an array
            $cloneArray = @($allClones)
            $totalOperations = 0
            $successCount = 0
            $failureCount = 0
            $operationTypes = @{}

            foreach ($clone in $cloneArray) {
                try {
                    # Get metadata for operation history
                    if ($clone.MetadataPath -and (Test-Path $clone.MetadataPath)) {
                        try {
                            $metadata = Get-Content $clone.MetadataPath | ConvertFrom-Json

                            # Process operation history
                            if ($metadata.operations -and $metadata.operations.history) {
                                foreach ($op in $metadata.operations.history) {
                                    $totalOperations++

                                    $opType = $op.type
                                    if (-not $operationTypes[$opType]) {
                                        $operationTypes[$opType] = @{
                                            count = 0
                                            success = 0
                                            failure = 0
                                        }
                                    }

                                    $operationTypes[$opType].count++

                                    if ($op.status -eq 'success' -or $op.status -eq 'completed') {
                                        $successCount++
                                        $operationTypes[$opType].success++
                                    } else {
                                        $failureCount++
                                        $operationTypes[$opType].failure++
                                    }
                                }
                            }
                        } catch {
                            Write-Verbose "Could not read operation history for clone: $($clone.Id)"
                        }
                    }

                    # If no operation history in metadata, assume creation operation succeeded
                    if ($clone.Status -eq 'Attached' -or $clone.Status -eq 'Active') {
                        if (-not $operationTypes['create-clone']) {
                            $operationTypes['create-clone'] = @{
                                count = 0
                                success = 0
                                failure = 0
                            }
                        }
                        $operationTypes['create-clone'].count++
                        $operationTypes['create-clone'].success++
                        $totalOperations++
                        $successCount++
                    }
                } catch {
                    Write-Verbose "Could not process operations for clone: $($clone.Id) - $_"
                }
            }

            # Default to success if no operations found
            if ($totalOperations -eq 0) {
                $totalOperations = $cloneArray.Count
                $successCount = $cloneArray.Count
            }

            $successRatePercent = if ($totalOperations -gt 0) {
                [Math]::Round(($successCount / $totalOperations) * 100, 2)
            } else {
                100
            }

            # Convert operation types to array
            $opTypesArray = @()
            foreach ($opType in $operationTypes.Keys) {
                $opData = $operationTypes[$opType]
                $typeSuccessRate = if ($opData.count -gt 0) {
                    [Math]::Round(($opData.success / $opData.count) * 100, 2)
                } else {
                    100
                }

                $opTypesArray += [PSCustomObject]@{
                    type = $opType
                    count = $opData.count
                    successCount = $opData.success
                    failureCount = $opData.failure
                    successRatePercent = $typeSuccessRate
                }
            }

            # Sort by count descending
            $opTypesArray = $opTypesArray | Sort-Object -Property count -Descending

            return [PSCustomObject]@{
                totalOperations = $totalOperations
                successfulOperations = $successCount
                failedOperations = $failureCount
                successRatePercent = $successRatePercent
                operationsByType = $opTypesArray
            }
        } catch {
            Write-Error "Failed to calculate operation stats: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Retrieves historical timeline data for metrics

.DESCRIPTION
    Aggregates clone creation and operation data by time period (hourly, daily).
    Useful for timeline charts showing activity over time.

.PARAMETER HoursBack
    Number of hours to look back (default: 24)

.PARAMETER GroupBy
    Group data by 'hour' or 'day' (default: 'hour')

.EXAMPLE
    $timeline = Get-TimelineData -HoursBack 24 -GroupBy 'hour'

.OUTPUTS
    System.Object with timeline data for each time period
#>
function Get-TimelineData {
    [CmdletBinding()]
    param(
        [Parameter()]
        [ValidateRange(1, 8760)]
        [int]$HoursBack = 24,

        [Parameter()]
        [ValidateSet('hour', 'day')]
        [string]$GroupBy = 'hour'
    )

    process {
        try {
            Write-Verbose "Generating timeline data for last $HoursBack hours, grouped by $GroupBy"

            # Get all clones
            $allClones = Get-FlashdbClone -ErrorAction SilentlyContinue
            if (-not $allClones) {
                return [PSCustomObject]@{
                    cloneCreations = @()
                    operations = @()
                    timelineStart = (Get-Date).AddHours(-$HoursBack)
                    timelineEnd = (Get-Date)
                }
            }

            # Ensure $allClones is an array
            $cloneArray = @($allClones)
            $timelineStart = (Get-Date).AddHours(-$HoursBack)
            $now = (Get-Date)

            # Initialize timeline buckets
            $cloneCreationsByTime = @{}
            $operationsByTime = @{}

            # Iterate through time buckets
            $currentBucket = $timelineStart
            while ($currentBucket -lt $now) {
                $nextBucket = if ($GroupBy -eq 'hour') {
                    $currentBucket.AddHours(1)
                } else {
                    $currentBucket.AddDays(1)
                }

                $bucketKey = if ($GroupBy -eq 'hour') {
                    $currentBucket.ToString("yyyy-MM-dd HH:00")
                } else {
                    $currentBucket.ToString("yyyy-MM-dd")
                }

                $cloneCreationsByTime[$bucketKey] = 0
                $operationsByTime[$bucketKey] = 0

                $currentBucket = $nextBucket
            }

            # Aggregate clone creation times
            foreach ($clone in $cloneArray) {
                try {
                    if ($clone.MetadataPath -and (Test-Path $clone.MetadataPath)) {
                        try {
                            $metadata = Get-Content $clone.MetadataPath | ConvertFrom-Json

                            if ($metadata.clone.createdAt) {
                                $createdAt = [DateTime]::Parse($metadata.clone.createdAt)

                                if ($createdAt -ge $timelineStart -and $createdAt -le $now) {
                                    $bucketKey = if ($GroupBy -eq 'hour') {
                                        $createdAt.ToString("yyyy-MM-dd HH:00")
                                    } else {
                                        $createdAt.ToString("yyyy-MM-dd")
                                    }

                                    if ($cloneCreationsByTime.ContainsKey($bucketKey)) {
                                        $cloneCreationsByTime[$bucketKey]++
                                    }
                                }
                            }

                            # Aggregate operations
                            if ($metadata.operations -and $metadata.operations.history) {
                                foreach ($op in $metadata.operations.history) {
                                    $opTime = if ($op.timestamp) {
                                        [DateTime]::Parse($op.timestamp)
                                    } else {
                                        $createdAt
                                    }

                                    if ($opTime -ge $timelineStart -and $opTime -le $now) {
                                        $bucketKey = if ($GroupBy -eq 'hour') {
                                            $opTime.ToString("yyyy-MM-dd HH:00")
                                        } else {
                                            $opTime.ToString("yyyy-MM-dd")
                                        }

                                        if ($operationsByTime.ContainsKey($bucketKey)) {
                                            $operationsByTime[$bucketKey]++
                                        }
                                    }
                                }
                            }
                        } catch {
                            Write-Verbose "Could not read metadata for timeline: $($clone.Id)"
                        }
                    }
                } catch {
                    Write-Verbose "Could not process clone for timeline: $($clone.Id) - $_"
                }
            }

            # Convert to arrays
            $creationTimeline = @()
            $operationTimeline = @()

            foreach ($bucket in ($cloneCreationsByTime.Keys | Sort-Object)) {
                $creationTimeline += [PSCustomObject]@{
                    timestamp = $bucket
                    clones = $cloneCreationsByTime[$bucket]
                }
            }

            foreach ($bucket in ($operationsByTime.Keys | Sort-Object)) {
                $operationTimeline += [PSCustomObject]@{
                    timestamp = $bucket
                    operations = $operationsByTime[$bucket]
                }
            }

            return [PSCustomObject]@{
                cloneCreations = $creationTimeline
                operations = $operationTimeline
                timelineStart = $timelineStart.ToString("o")
                timelineEnd = $now.ToString("o")
                groupBy = $GroupBy
            }
        } catch {
            Write-Error "Failed to generate timeline data: $_"
            throw
        }
    }
}

# Export metrics functions
Export-ModuleMember -Function @(
    'Get-FlashdbMetrics',
    'Get-CloneCreationStats',
    'Get-StorageStats',
    'Get-OperationStats',
    'Get-TimelineData'
)
