<#
.SYNOPSIS
    Search and Filtering Engine for FlashDB
    Provides advanced search and filtering capabilities for operations, clones, and checkpoints

.DESCRIPTION
    This module implements a comprehensive search and filtering system including:
    - Full-text search across clone names and descriptions
    - Date range filtering
    - Status-based filtering
    - Method filtering (BackupRestore, ReplicaBackup, TableByTableCopy)
    - Regex pattern matching
    - Tag-based filtering
    - Multi-criteria combined filters
    - Result sorting and pagination
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

<#
.SYNOPSIS
    Searches operation logs with advanced filtering

.DESCRIPTION
    Searches through operation metadata files with support for keywords, date ranges,
    status, and method filtering. Returns matching operations with pagination support.

.PARAMETER Keyword
    Search keyword to match against operation details (optional)

.PARAMETER DateFrom
    Start date for date range filtering (optional)

.PARAMETER DateTo
    End date for date range filtering (optional)

.PARAMETER Status
    Filter by operation status: ready, attached, detached, failed, in-progress (optional)

.PARAMETER Method
    Filter by operation method: BackupRestore, ReplicaBackup, TableByTableCopy (optional)

.PARAMETER Operator
    Filter operations by specific operator/user (optional)

.PARAMETER Limit
    Maximum number of results to return (default: 100)

.PARAMETER Offset
    Number of results to skip for pagination (default: 0)

.PARAMETER SortBy
    Sort field: createdAt, updatedAt, name, status (default: createdAt)

.PARAMETER SortOrder
    Sort order: asc, desc (default: desc)

.PARAMETER UseRegex
    Treat keyword as regex pattern (default: $false)

.EXAMPLE
    Search-FlashdbOperations -Keyword "backup" -Status "ready" -Limit 50

.EXAMPLE
    Search-FlashdbOperations -DateFrom (Get-Date).AddDays(-7) -DateTo (Get-Date) -Method "BackupRestore"

.OUTPUTS
    Array of PSCustomObject with matching operations
#>
function Search-FlashdbOperations {
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$Keyword,

        [Parameter()]
        [datetime]$DateFrom,

        [Parameter()]
        [datetime]$DateTo,

        [Parameter()]
        [ValidateSet('ready', 'attached', 'detached', 'failed', 'in-progress')]
        [string]$Status,

        [Parameter()]
        [ValidateSet('BackupRestore', 'ReplicaBackup', 'TableByTableCopy')]
        [string]$Method,

        [Parameter()]
        [string]$Operator,

        [Parameter()]
        [int]$Limit = 100,

        [Parameter()]
        [int]$Offset = 0,

        [Parameter()]
        [ValidateSet('createdAt', 'updatedAt', 'name', 'status')]
        [string]$SortBy = 'createdAt',

        [Parameter()]
        [ValidateSet('asc', 'desc')]
        [string]$SortOrder = 'desc',

        [Parameter()]
        [bool]$UseRegex = $false
    )

    begin {
        Write-Verbose "Searching FlashDB operations with filters: Keyword=$Keyword, Status=$Status, Method=$Method"

        # Get all metadata files
        $config = Get-FlashdbConfig
        $storagePath = $config.defaultCloneStoragePath

        if (-not (Test-Path -Path $storagePath)) {
            Write-Warning "Storage path not found: $storagePath"
            return @()
        }

        $metadataFiles = @()
        $metadataFiles += Get-ChildItem -Path $storagePath -Filter "*.json" -File -ErrorAction SilentlyContinue
        $metadataFiles += Get-ChildItem -Path "$storagePath\backups" -Filter "*.json" -File -ErrorAction SilentlyContinue -Recurse
        $metadataFiles += Get-ChildItem -Path "$storagePath\checkpoints" -Filter "*.json" -File -ErrorAction SilentlyContinue -Recurse

        $allOperations = @()
    }

    process {
        foreach ($file in $metadataFiles) {
            try {
                $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
                $metadata = $content | ConvertFrom-Json -ErrorAction SilentlyContinue

                if ($metadata.operation) {
                    $allOperations += $metadata.operation
                } elseif ($metadata.clone) {
                    # Clone metadata might have operation history
                    if ($metadata.clone.operationHistory) {
                        $allOperations += $metadata.clone.operationHistory
                    }
                }
            } catch {
                Write-Verbose "Failed to parse metadata file: $($file.FullName)"
                continue
            }
        }

        # Filter operations
        $filtered = $allOperations | Where-Object {
            $matchKeyword = $true
            $matchDate = $true
            $matchStatus = $true
            $matchMethod = $true
            $matchOperator = $true

            # Keyword filter
            if ($Keyword) {
                if ($UseRegex) {
                    $matchKeyword = $_.id -match $Keyword -or
                                   $_.name -match $Keyword -or
                                   $_.description -match $Keyword -or
                                   $_.details -match $Keyword
                } else {
                    $matchKeyword = $_.id -like "*$Keyword*" -or
                                   $_.name -like "*$Keyword*" -or
                                   $_.description -like "*$Keyword*" -or
                                   $_.details -like "*$Keyword*"
                }
            }

            # Date range filter
            if ($PSBoundParameters.ContainsKey('DateFrom') -or $PSBoundParameters.ContainsKey('DateTo')) {
                try {
                    $opDate = if ($_.createdAt) { [datetime]::Parse($_.createdAt) } else { [datetime]::MinValue }

                    if ($PSBoundParameters.ContainsKey('DateFrom')) {
                        $matchDate = $matchDate -and ($opDate -ge $DateFrom)
                    }
                    if ($PSBoundParameters.ContainsKey('DateTo')) {
                        $matchDate = $matchDate -and ($opDate -le $DateTo)
                    }
                } catch {
                    $matchDate = $false
                }
            }

            # Status filter
            if ($Status) {
                $matchStatus = $_.status -eq $Status
            }

            # Method filter
            if ($Method) {
                $matchMethod = $_.method -eq $Method
            }

            # Operator filter
            if ($Operator) {
                $matchOperator = $_.operator -eq $Operator
            }

            return $matchKeyword -and $matchDate -and $matchStatus -and $matchMethod -and $matchOperator
        }

        # Sort results
        $sorted = $filtered | Sort-Object -Property $SortBy -Descending:($SortOrder -eq 'desc')

        # Apply pagination
        $paginated = $sorted | Select-Object -Skip $Offset -First $Limit

        return @($paginated)
    }
}

<#
.SYNOPSIS
    Searches clones with advanced filtering

.DESCRIPTION
    Searches through clone metadata with support for keywords, golden image filtering,
    status filtering, and date range filtering. Returns matching clones with pagination.

.PARAMETER Keyword
    Search keyword to match against clone name or description (optional)

.PARAMETER GoldenImageId
    Filter clones by specific golden image (optional)

.PARAMETER Status
    Filter by clone status: ready, attached, detached, failed, orphaned (optional)

.PARAMETER CreatedFrom
    Start date for creation date filtering (optional)

.PARAMETER CreatedTo
    End date for creation date filtering (optional)

.PARAMETER Tags
    Filter clones that have all specified tags (optional array)

.PARAMETER Limit
    Maximum number of results to return (default: 100)

.PARAMETER Offset
    Number of results to skip for pagination (default: 0)

.PARAMETER SortBy
    Sort field: createdAt, updatedAt, name, size (default: createdAt)

.PARAMETER SortOrder
    Sort order: asc, desc (default: desc)

.PARAMETER UseRegex
    Treat keyword as regex pattern (default: $false)

.EXAMPLE
    Filter-FlashdbClones -Keyword "prod" -Status "ready" -Limit 50

.EXAMPLE
    Filter-FlashdbClones -CreatedFrom (Get-Date).AddDays(-30) -Tags @("production", "backup")

.OUTPUTS
    Array of PSCustomObject with matching clones
#>
function Filter-FlashdbClones {
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$Keyword,

        [Parameter()]
        [string]$GoldenImageId,

        [Parameter()]
        [ValidateSet('ready', 'attached', 'detached', 'failed', 'orphaned')]
        [string]$Status,

        [Parameter()]
        [datetime]$CreatedFrom,

        [Parameter()]
        [datetime]$CreatedTo,

        [Parameter()]
        [string[]]$Tags,

        [Parameter()]
        [int]$Limit = 100,

        [Parameter()]
        [int]$Offset = 0,

        [Parameter()]
        [ValidateSet('createdAt', 'updatedAt', 'name', 'size')]
        [string]$SortBy = 'createdAt',

        [Parameter()]
        [ValidateSet('asc', 'desc')]
        [string]$SortOrder = 'desc',

        [Parameter()]
        [bool]$UseRegex = $false
    )

    begin {
        Write-Verbose "Filtering FlashDB clones with criteria: Keyword=$Keyword, Status=$Status, GoldenImage=$GoldenImageId"

        $config = Get-FlashdbConfig
        $storagePath = $config.defaultCloneStoragePath

        if (-not (Test-Path -Path $storagePath)) {
            Write-Warning "Storage path not found: $storagePath"
            return @()
        }

        $allClones = @()
    }

    process {
        # Load clone metadata from files
        $metadataFiles = Get-ChildItem -Path $storagePath -Filter "*clone*.json" -File -ErrorAction SilentlyContinue

        foreach ($file in $metadataFiles) {
            try {
                $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
                $metadata = $content | ConvertFrom-Json -ErrorAction SilentlyContinue

                if ($metadata.clone) {
                    $allClones += $metadata.clone
                }
            } catch {
                Write-Verbose "Failed to parse clone metadata file: $($file.FullName)"
                continue
            }
        }

        # Apply filters
        $filtered = $allClones | Where-Object {
            $matchKeyword = $true
            $matchGolden = $true
            $matchStatus = $true
            $matchCreatedDate = $true
            $matchTags = $true

            # Keyword filter
            if ($Keyword) {
                if ($UseRegex) {
                    $matchKeyword = $_.name -match $Keyword -or
                                   $_.description -match $Keyword -or
                                   $_.id -match $Keyword
                } else {
                    $matchKeyword = $_.name -like "*$Keyword*" -or
                                   $_.description -like "*$Keyword*" -or
                                   $_.id -like "*$Keyword*"
                }
            }

            # Golden image filter
            if ($GoldenImageId) {
                $matchGolden = $_.goldenImageId -eq $GoldenImageId
            }

            # Status filter
            if ($Status) {
                $matchStatus = $_.status -eq $Status
            }

            # Creation date range filter
            if ($PSBoundParameters.ContainsKey('CreatedFrom') -or $PSBoundParameters.ContainsKey('CreatedTo')) {
                try {
                    $cloneCreated = if ($_.createdAt) { [datetime]::Parse($_.createdAt) } else { [datetime]::MinValue }

                    if ($PSBoundParameters.ContainsKey('CreatedFrom')) {
                        $matchCreatedDate = $matchCreatedDate -and ($cloneCreated -ge $CreatedFrom)
                    }
                    if ($PSBoundParameters.ContainsKey('CreatedTo')) {
                        $matchCreatedDate = $matchCreatedDate -and ($cloneCreated -le $CreatedTo)
                    }
                } catch {
                    $matchCreatedDate = $false
                }
            }

            # Tags filter - all specified tags must be present
            if ($Tags -and $Tags.Count -gt 0) {
                if ($_.tags -and $_.tags.Count -gt 0) {
                    $matchTags = $Tags | ForEach-Object { $_ -in $_.tags } | Where-Object { $_ } | Measure-Object | Select-Object -ExpandProperty Count -eq $Tags.Count
                } else {
                    $matchTags = $false
                }
            }

            return $matchKeyword -and $matchGolden -and $matchStatus -and $matchCreatedDate -and $matchTags
        }

        # Sort results
        $sorted = $filtered | Sort-Object -Property $SortBy -Descending:($SortOrder -eq 'desc')

        # Apply pagination
        $paginated = $sorted | Select-Object -Skip $Offset -First $Limit

        return @($paginated)
    }
}

<#
.SYNOPSIS
    Searches checkpoints with advanced filtering

.DESCRIPTION
    Searches through checkpoint metadata with support for keywords, clone filtering,
    phase filtering, and date range filtering. Returns matching checkpoints with pagination.

.PARAMETER Keyword
    Search keyword to match against checkpoint name or description (optional)

.PARAMETER CloneId
    Filter checkpoints by specific clone (optional)

.PARAMETER Phase
    Filter by checkpoint phase: initial, in-progress, complete, reverted, failed (optional)

.PARAMETER CreatedFrom
    Start date for creation date filtering (optional)

.PARAMETER CreatedTo
    End date for creation date filtering (optional)

.PARAMETER Limit
    Maximum number of results to return (default: 100)

.PARAMETER Offset
    Number of results to skip for pagination (default: 0)

.PARAMETER SortBy
    Sort field: createdAt, name, cloneId, phase (default: createdAt)

.PARAMETER SortOrder
    Sort order: asc, desc (default: desc)

.PARAMETER UseRegex
    Treat keyword as regex pattern (default: $false)

.EXAMPLE
    Filter-FlashdbCheckpoints -CloneId "clone-dev-1" -Phase "complete" -Limit 50

.EXAMPLE
    Filter-FlashdbCheckpoints -CreatedFrom (Get-Date).AddDays(-30) | Select-Object -First 10

.OUTPUTS
    Array of PSCustomObject with matching checkpoints
#>
function Filter-FlashdbCheckpoints {
    [CmdletBinding()]
    param(
        [Parameter()]
        [string]$Keyword,

        [Parameter()]
        [string]$CloneId,

        [Parameter()]
        [ValidateSet('initial', 'in-progress', 'complete', 'reverted', 'failed')]
        [string]$Phase,

        [Parameter()]
        [datetime]$CreatedFrom,

        [Parameter()]
        [datetime]$CreatedTo,

        [Parameter()]
        [int]$Limit = 100,

        [Parameter()]
        [int]$Offset = 0,

        [Parameter()]
        [ValidateSet('createdAt', 'name', 'cloneId', 'phase')]
        [string]$SortBy = 'createdAt',

        [Parameter()]
        [ValidateSet('asc', 'desc')]
        [string]$SortOrder = 'desc',

        [Parameter()]
        [bool]$UseRegex = $false
    )

    begin {
        Write-Verbose "Filtering FlashDB checkpoints with criteria: Keyword=$Keyword, CloneId=$CloneId, Phase=$Phase"

        $config = Get-FlashdbConfig
        $storagePath = $config.defaultCloneStoragePath
        $checkpointPath = Join-Path $storagePath "checkpoints"

        if (-not (Test-Path -Path $checkpointPath)) {
            Write-Warning "Checkpoint path not found: $checkpointPath"
            return @()
        }

        $allCheckpoints = @()
    }

    process {
        # Load checkpoint metadata from files
        $metadataFiles = Get-ChildItem -Path $checkpointPath -Filter "*.json" -File -ErrorAction SilentlyContinue -Recurse

        foreach ($file in $metadataFiles) {
            try {
                $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
                $metadata = $content | ConvertFrom-Json -ErrorAction SilentlyContinue

                if ($metadata.checkpoint) {
                    $allCheckpoints += $metadata.checkpoint
                }
            } catch {
                Write-Verbose "Failed to parse checkpoint metadata file: $($file.FullName)"
                continue
            }
        }

        # Apply filters
        $filtered = $allCheckpoints | Where-Object {
            $matchKeyword = $true
            $matchClone = $true
            $matchPhase = $true
            $matchCreatedDate = $true

            # Keyword filter
            if ($Keyword) {
                if ($UseRegex) {
                    $matchKeyword = $_.name -match $Keyword -or
                                   $_.description -match $Keyword -or
                                   $_.id -match $Keyword
                } else {
                    $matchKeyword = $_.name -like "*$Keyword*" -or
                                   $_.description -like "*$Keyword*" -or
                                   $_.id -like "*$Keyword*"
                }
            }

            # Clone ID filter
            if ($CloneId) {
                $matchClone = $_.cloneId -eq $CloneId
            }

            # Phase filter
            if ($Phase) {
                $matchPhase = $_.phase -eq $Phase
            }

            # Creation date range filter
            if ($PSBoundParameters.ContainsKey('CreatedFrom') -or $PSBoundParameters.ContainsKey('CreatedTo')) {
                try {
                    $checkpointCreated = if ($_.createdAt) { [datetime]::Parse($_.createdAt) } else { [datetime]::MinValue }

                    if ($PSBoundParameters.ContainsKey('CreatedFrom')) {
                        $matchCreatedDate = $matchCreatedDate -and ($checkpointCreated -ge $CreatedFrom)
                    }
                    if ($PSBoundParameters.ContainsKey('CreatedTo')) {
                        $matchCreatedDate = $matchCreatedDate -and ($checkpointCreated -le $CreatedTo)
                    }
                } catch {
                    $matchCreatedDate = $false
                }
            }

            return $matchKeyword -and $matchClone -and $matchPhase -and $matchCreatedDate
        }

        # Sort results
        $sorted = $filtered | Sort-Object -Property $SortBy -Descending:($SortOrder -eq 'desc')

        # Apply pagination
        $paginated = $sorted | Select-Object -Skip $Offset -First $Limit

        return @($paginated)
    }
}

<#
.SYNOPSIS
    Gets autocomplete suggestions for clone and golden image names

.DESCRIPTION
    Returns a list of matching names for autocomplete functionality in the UI.
    Searches both clone and golden image names.

.PARAMETER Query
    Partial name to search for

.PARAMETER Type
    Type to search: clone, golden-image, or all (default: all)

.PARAMETER Limit
    Maximum number of suggestions to return (default: 20)

.EXAMPLE
    Get-FlashdbSearchSuggestions -Query "prod" -Type "clone"

.OUTPUTS
    Array of suggestion strings
#>
function Get-FlashdbSearchSuggestions {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Query,

        [Parameter()]
        [ValidateSet('clone', 'golden-image', 'all')]
        [string]$Type = 'all',

        [Parameter()]
        [int]$Limit = 20
    )

    begin {
        Write-Verbose "Getting search suggestions for query: $Query"

        $config = Get-FlashdbConfig
        $storagePath = $config.defaultCloneStoragePath

        if (-not (Test-Path -Path $storagePath)) {
            return @()
        }

        $suggestions = @()
    }

    process {
        # Search clones
        if ($Type -in @('clone', 'all')) {
            try {
                $cloneFiles = Get-ChildItem -Path $storagePath -Filter "*clone*.json" -File -ErrorAction SilentlyContinue
                foreach ($file in $cloneFiles) {
                    $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
                    $metadata = $content | ConvertFrom-Json -ErrorAction SilentlyContinue

                    if ($metadata.clone -and $metadata.clone.name -like "*$Query*") {
                        $suggestions += $metadata.clone.name
                    }
                }
            } catch {
                Write-Verbose "Error searching clone metadata: $_"
            }
        }

        # Search golden images
        if ($Type -in @('golden-image', 'all')) {
            try {
                $goldenFiles = Get-ChildItem -Path $storagePath -Filter "*golden*.json" -File -ErrorAction SilentlyContinue
                foreach ($file in $goldenFiles) {
                    $content = Get-Content -Path $file.FullName -Raw -ErrorAction SilentlyContinue
                    $metadata = $content | ConvertFrom-Json -ErrorAction SilentlyContinue

                    if ($metadata.golden -and $metadata.golden.name -like "*$Query*") {
                        $suggestions += $metadata.golden.name
                    }
                }
            } catch {
                Write-Verbose "Error searching golden image metadata: $_"
            }
        }

        # Return unique suggestions, sorted and limited
        return @($suggestions | Select-Object -Unique | Sort-Object | Select-Object -First $Limit)
    }
}
