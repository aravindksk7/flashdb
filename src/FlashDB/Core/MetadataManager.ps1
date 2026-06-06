<#
.SYNOPSIS
    Metadata Management module for FlashDB
    Provides utilities for reading, writing, and validating clone and checkpoint metadata

.DESCRIPTION
    This module handles all JSON metadata operations including:
    - Reading and parsing clone metadata files
    - Writing and backing up metadata
    - Validating metadata schema
    - Merging partial updates
    - Exporting metadata for reporting
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Metadata schema version
$script:MetadataSchemaVersion = "1.0"

<#
.SYNOPSIS
    Reads and validates clone metadata from JSON file

.DESCRIPTION
    Loads clone metadata from a JSON file with schema validation and
    error handling for corrupted or missing files.

.PARAMETER MetadataPath
    Full path to the .json metadata file

.PARAMETER Validate
    Validate against schema (default: $true)

.EXAMPLE
    $metadata = Get-FlashdbMetadata -MetadataPath "D:\CloneStorage\clone-dev-1.json"

.OUTPUTS
    PSCustomObject containing validated metadata or $null if file invalid
#>
function Get-FlashdbMetadata {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateScript({ Test-Path $_ -PathType Leaf })]
        [string]$MetadataPath,

        [Parameter()]
        [bool]$Validate = $true
    )

    process {
        try {
            Write-Verbose "Reading metadata from: $MetadataPath"

            # Read JSON file
            $content = Get-Content -Path $MetadataPath -Raw -ErrorAction Stop
            $metadata = $content | ConvertFrom-Json -ErrorAction Stop

            if ($Validate) {
                # Validate schema
                if (-not (Test-MetadataSchema -Metadata $metadata)) {
                    Write-Warning "Metadata schema validation failed: $MetadataPath"
                    return $null
                }
            }

            return $metadata
        } catch {
            Write-Error "Failed to read metadata: $_"
            return $null
        }
    }
}

<#
.SYNOPSIS
    Writes clone metadata to JSON file with backup

.DESCRIPTION
    Saves metadata to JSON file with automatic backup of previous version.
    Ensures data integrity through atomic write operations.

.PARAMETER MetadataPath
    Full path to the .json metadata file

.PARAMETER Metadata
    Metadata object to write

.PARAMETER CreateBackup
    Create backup of previous metadata (default: $true)

.PARAMETER BackupPath
    Optional custom backup directory (defaults to same as metadata)

.EXAMPLE
    Save-FlashdbMetadata -MetadataPath "D:\CloneStorage\clone-dev-1.json" `
        -Metadata $metadata `
        -CreateBackup $true

.OUTPUTS
    System.Object with save operation status
#>
function Save-FlashdbMetadata {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$MetadataPath,

        [Parameter(Mandatory = $true)]
        [PSObject]$Metadata,

        [Parameter()]
        [bool]$CreateBackup = $true,

        [Parameter()]
        [string]$BackupPath
    )

    process {
        try {
            Write-Verbose "Saving metadata to: $MetadataPath"

            # Ensure directory exists
            $dir = [System.IO.Path]::GetDirectoryName($MetadataPath)
            if (-not (Test-Path -Path $dir -PathType Container)) {
                New-Item -ItemType Directory -Path $dir -Force | Out-Null
            }

            # Create backup if file exists and backup enabled
            if ($CreateBackup -and (Test-Path -Path $MetadataPath)) {
                if (-not $BackupPath) {
                    $BackupPath = Join-Path $dir "backups"
                }

                if (-not (Test-Path -Path $BackupPath -PathType Container)) {
                    New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null
                }

                $backupName = "{0}.{1}.bak" -f [System.IO.Path]::GetFileNameWithoutExtension($MetadataPath),
                    (Get-Date -Format "yyyyMMdd-HHmmss")
                $backupFile = Join-Path $BackupPath $backupName

                Write-Verbose "Creating metadata backup: $backupFile"
                Copy-Item -Path $MetadataPath -Destination $backupFile -Force -ErrorAction SilentlyContinue
            }

            # Write metadata with atomic operation
            $tempPath = "$MetadataPath.tmp"
            $Metadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $tempPath -Encoding UTF8 -Force

            # Atomic rename (Windows supports this)
            Move-Item -Path $tempPath -Destination $MetadataPath -Force -ErrorAction Stop

            Write-Verbose "Metadata saved successfully"

            return [PSCustomObject]@{
                Path = $MetadataPath
                SavedAt = (Get-Date).ToUniversalTime().ToString("o")
                Status = 'success'
            }
        } catch {
            Write-Error "Failed to save metadata: $_"
            # Cleanup temp file if exists
            if (Test-Path -Path $tempPath) {
                Remove-Item -Path $tempPath -Force -ErrorAction SilentlyContinue
            }
            throw
        }
    }
}

<#
.SYNOPSIS
    Validates metadata against schema

.DESCRIPTION
    Checks that metadata contains all required fields and proper structure.
    Returns detailed validation results including missing or invalid fields.

.PARAMETER Metadata
    Metadata object to validate

.PARAMETER StrictMode
    Enforce strict validation with detailed error reporting (default: $false)

.EXAMPLE
    Test-FlashdbMetadataSchema -Metadata $metadata -StrictMode

.OUTPUTS
    System.Object with validation results
#>
function Test-MetadataSchema {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [PSObject]$Metadata,

        [Parameter()]
        [bool]$StrictMode = $false
    )

    process {
        try {
            # Required top-level sections
            $requiredSections = @('clone', 'golden', 'database', 'attachment', 'checkpoints', 'lifecycle', 'operations')
            $missingFields = @()

            foreach ($section in $requiredSections) {
                if (-not $Metadata.PSObject.Properties.Name -contains $section) {
                    $missingFields += $section
                }
            }

            if ($missingFields.Count -gt 0) {
                if ($StrictMode) {
                    Write-Error "Missing required metadata sections: $($missingFields -join ', ')"
                    return $false
                }
            }

            # Required clone fields
            $cloneRequired = @('id', 'name', 'createdAt', 'vhdxPath')
            foreach ($field in $cloneRequired) {
                if (-not $Metadata.clone.PSObject.Properties.Name -contains $field) {
                    if ($StrictMode) {
                        Write-Error "Missing required clone field: $field"
                        return $false
                    }
                    $missingFields += "clone.$field"
                }
            }

            # Validate timestamps are ISO 8601
            if ($Metadata.clone.createdAt) {
                try {
                    [DateTime]::Parse($Metadata.clone.createdAt)
                } catch {
                    if ($StrictMode) {
                        Write-Error "Invalid ISO 8601 timestamp in clone.createdAt"
                        return $false
                    }
                }
            }

            if ($StrictMode) {
                return $true
            }

            return @{
                Valid = $missingFields.Count -eq 0
                MissingFields = $missingFields
                SchemaVersion = $script:MetadataSchemaVersion
            }
        } catch {
            Write-Error "Metadata validation failed: $_"
            return $false
        }
    }
}

<#
.SYNOPSIS
    Exports metadata for reporting and audit purposes

.DESCRIPTION
    Creates a formatted export of metadata in various formats for
    reporting, backups, or audit trails.

.PARAMETER MetadataPath
    Path to the metadata file

.PARAMETER Format
    Export format: 'json', 'csv', 'html', 'xml'

.PARAMETER OutputPath
    Output file path for export

.PARAMETER IncludeSensitive
    Include potentially sensitive data (default: $false)

.EXAMPLE
    Export-FlashdbMetadata -MetadataPath "clone-dev-1.json" `
        -Format "html" `
        -OutputPath "report.html"

.OUTPUTS
    System.Object with export status and path
#>
function Export-FlashdbMetadata {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateScript({ Test-Path $_ -PathType Leaf })]
        [string]$MetadataPath,

        [Parameter()]
        [ValidateSet('json', 'csv', 'html', 'xml')]
        [string]$Format = 'json',

        [Parameter()]
        [string]$OutputPath,

        [Parameter()]
        [bool]$IncludeSensitive = $false
    )

    process {
        try {
            # Read metadata
            $metadata = Get-FlashdbMetadata -MetadataPath $MetadataPath

            if (-not $metadata) {
                throw "Failed to read metadata: $MetadataPath"
            }

            # Generate output filename if not provided
            if (-not $OutputPath) {
                $base = [System.IO.Path]::GetFileNameWithoutExtension($MetadataPath)
                $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
                $OutputPath = "{0}_export_{1}.{2}" -f $base, $timestamp, $Format
            }

            Write-Verbose "Exporting metadata to: $OutputPath"

            # Export in requested format
            switch ($Format) {
                'json' {
                    $metadata | ConvertTo-Json -Depth 10 | Out-File -FilePath $OutputPath -Encoding UTF8 -Force
                }
                'html' {
                    $html = ConvertTo-HtmlReport -Metadata $metadata
                    $html | Out-File -FilePath $OutputPath -Encoding UTF8 -Force
                }
                'xml' {
                    $metadata | ConvertTo-Xml -As String | Out-File -FilePath $OutputPath -Encoding UTF8 -Force
                }
                'csv' {
                    # Flatten metadata for CSV
                    $flattened = ConvertTo-FlatObject -InputObject $metadata
                    $flattened | ConvertTo-Csv | Out-File -FilePath $OutputPath -Encoding UTF8 -Force
                }
            }

            Write-Verbose "Export completed successfully"

            return [PSCustomObject]@{
                ExportPath = $OutputPath
                Format = $Format
                ExportedAt = (Get-Date).ToUniversalTime().ToString("o")
                Status = 'success'
            }
        } catch {
            Write-Error "Failed to export metadata: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Logs an operation to clone metadata

.DESCRIPTION
    Adds a new operation entry to the operation log in clone metadata.
    Maintains immutable audit trail of all clone operations.

.PARAMETER MetadataPath
    Path to the metadata file

.PARAMETER Operation
    Operation name/identifier

.PARAMETER Status
    Operation status (success, failed, warning)

.PARAMETER Details
    Additional operation details (optional)

.EXAMPLE
    Add-FlashdbOperationLog -MetadataPath "clone-dev-1.json" `
        -Operation "checkpoint-created" `
        -Status "success" `
        -Details @{ checkpointId = "cp-001"; phase = "pre-etl" }

.OUTPUTS
    System.Object with log entry
#>
function Add-FlashdbOperationLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateScript({ Test-Path $_ -PathType Leaf })]
        [string]$MetadataPath,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Operation,

        [Parameter(Mandatory = $true)]
        [ValidateSet('success', 'failed', 'warning')]
        [string]$Status,

        [Parameter()]
        [hashtable]$Details
    )

    process {
        try {
            Write-Verbose "Adding operation log: $Operation"

            # Read current metadata
            $metadata = Get-FlashdbMetadata -MetadataPath $MetadataPath

            if (-not $metadata) {
                throw "Failed to read metadata: $MetadataPath"
            }

            # Create operation entry
            $logEntry = @{
                operation = $Operation
                timestamp = (Get-Date).ToUniversalTime().ToString("o")
                status = $Status
            }

            # Add details if provided
            if ($Details) {
                foreach ($key in $Details.Keys) {
                    $logEntry[$key] = $Details[$key]
                }
            }

            # Add to operation log
            $metadata.operations.operationLog += $logEntry
            $metadata.operations.lastOperation = $Operation
            $metadata.operations.lastOperationAt = $logEntry.timestamp

            # Save metadata
            Save-FlashdbMetadata -MetadataPath $MetadataPath -Metadata $metadata | Out-Null

            return $logEntry
        } catch {
            Write-Error "Failed to add operation log: $_"
            throw
        }
    }
}

<#
.SYNOPSIS
    Gets metadata schema version information

.DESCRIPTION
    Returns the current metadata schema version and format information.

.EXAMPLE
    Get-FlashdbMetadataSchemaInfo

.OUTPUTS
    System.Object with schema version and description
#>
function Get-FlashdbMetadataSchemaInfo {
    [CmdletBinding()]
    param()

    process {
        return [PSCustomObject]@{
            SchemaVersion = $script:MetadataSchemaVersion
            LastUpdated = "2026-06-06"
            SupportedDatabaseTypes = @('sql-server', 'postgresql', 'mysql')
            RequiredSections = @('clone', 'golden', 'database', 'attachment', 'checkpoints', 'lifecycle', 'operations')
            PhaseValues = @('pre-etl', 'post-etl', 'manual')
            LifecycleStatuses = @('active', 'detached', 'expired', 'archived')
        }
    }
}

# Helper function: Convert to HTML report
function ConvertTo-HtmlReport {
    param([PSObject]$Metadata)

    $html = @"
<!DOCTYPE html>
<html>
<head>
    <title>FlashDB Metadata Report</title>
    <style>
        body { font-family: Arial; margin: 20px; }
        .section { margin: 20px 0; }
        .section-title { font-size: 18px; font-weight: bold; background: #f0f0f0; padding: 10px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #4CAF50; color: white; }
        .timestamp { font-family: monospace; }
    </style>
</head>
<body>
    <h1>FlashDB Clone Metadata Report</h1>

    <div class="section">
        <div class="section-title">Clone Information</div>
        <table>
            <tr><th>Property</th><th>Value</th></tr>
            <tr><td>ID</td><td>$($Metadata.clone.id)</td></tr>
            <tr><td>Name</td><td>$($Metadata.clone.name)</td></tr>
            <tr><td>Created At</td><td class="timestamp">$($Metadata.clone.createdAt)</td></tr>
            <tr><td>Created By</td><td>$($Metadata.clone.createdBy)</td></tr>
            <tr><td>VHDX Path</td><td>$($Metadata.clone.vhdxPath)</td></tr>
        </table>
    </div>

    <div class="section">
        <div class="section-title">Checkpoints ($($Metadata.checkpoints.Count) total)</div>
        <table>
            <tr><th>ID</th><th>Name</th><th>Phase</th><th>Created At</th><th>Created By</th></tr>
            $(foreach ($cp in $Metadata.checkpoints) {
                "<tr><td>$($cp.checkpointId)</td><td>$($cp.name)</td><td>$($cp.phase)</td><td class='timestamp'>$($cp.createdAt)</td><td>$($cp.createdBy)</td></tr>"
            })
        </table>
    </div>

    <div class="section">
        <div class="section-title">Recent Operations</div>
        <table>
            <tr><th>Operation</th><th>Status</th><th>Timestamp</th></tr>
            $(foreach ($op in $Metadata.operations.operationLog | Select-Object -Last 10) {
                "<tr><td>$($op.operation)</td><td>$($op.status)</td><td class='timestamp'>$($op.timestamp)</td></tr>"
            })
        </table>
    </div>

    <p><small>Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")</small></p>
</body>
</html>
"@

    return $html
}

# Helper function: Convert to flat object for CSV
function ConvertTo-FlatObject {
    param([PSObject]$InputObject, [string]$Prefix = "")

    $flat = @{}

    foreach ($prop in $InputObject.PSObject.Properties) {
        $key = if ($Prefix) { "$Prefix.$($prop.Name)" } else { $prop.Name }

        if ($prop.Value -is [PSObject] -and $prop.Value -isnot [string]) {
            $subFlat = ConvertTo-FlatObject -InputObject $prop.Value -Prefix $key
            foreach ($subKey in $subFlat.Keys) {
                $flat[$subKey] = $subFlat[$subKey]
            }
        } else {
            $flat[$key] = $prop.Value
        }
    }

    return $flat
}

# Export functions
Export-ModuleMember -Function @(
    'Get-FlashdbMetadata'
    'Save-FlashdbMetadata'
    'Test-MetadataSchema'
    'Export-FlashdbMetadata'
    'Add-FlashdbOperationLog'
    'Get-FlashdbMetadataSchemaInfo'
)
