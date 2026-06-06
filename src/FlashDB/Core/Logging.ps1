<#
.SYNOPSIS
FlashDB Structured Logging Module

.DESCRIPTION
Provides production-grade structured logging for PowerShell operations.
Outputs logs in JSON format to both file and console.
Supports log rotation with 30-day retention.

.NOTES
Part of FlashDB Core infrastructure
#>

# Log configuration
$script:LogConfig = @{
    LogDirectory = 'C:\flashdb\logs'
    MaxLogAgeDays = 30
    LogLevel = $env:LOG_LEVEL -or 'info'
    JsonOutput = $true
    ConsoleOutput = $true
    Service = 'flashdb-core'
}

# Log levels with numeric values for filtering
$script:LogLevels = @{
    'debug' = 0
    'info' = 1
    'warn' = 2
    'error' = 3
    'fatal' = 4
}

<#
.SYNOPSIS
Initialize the logging system

.DESCRIPTION
Sets up the logging directory and configures retention policies.

.PARAMETER LogDirectory
Path where logs will be stored

.PARAMETER MaxLogAgeDays
Number of days to retain logs (default: 30)

.EXAMPLE
Initialize-FlashdbLogging -LogDirectory 'C:\flashdb\logs' -MaxLogAgeDays 30
#>
function Initialize-FlashdbLogging {
    [CmdletBinding()]
    param(
        [string]$LogDirectory = 'C:\flashdb\logs',
        [int]$MaxLogAgeDays = 30
    )

    try {
        # Create log directory if it doesn't exist
        if (-not (Test-Path -Path $LogDirectory)) {
            New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
            Write-Host "[INFO] Created log directory: $LogDirectory"
        }

        # Update configuration
        $script:LogConfig.LogDirectory = $LogDirectory
        $script:LogConfig.MaxLogAgeDays = $MaxLogAgeDays

        # Clean old logs
        Invoke-LogRotation

        Write-FlashdbLog -Level 'info' -Message 'Logging system initialized' -Operation 'logging-init'
    }
    catch {
        Write-Host "[ERROR] Failed to initialize logging: $_" -ForegroundColor Red
        throw $_
    }
}

<#
.SYNOPSIS
Write a structured log entry

.DESCRIPTION
Writes a log entry in JSON format with contextual information.
Sensitive data is automatically redacted.

.PARAMETER Message
The log message

.PARAMETER Level
Log level: debug, info, warn, error, fatal

.PARAMETER Operation
The operation name (for metrics tracking)

.PARAMETER Duration
Duration of the operation in milliseconds

.PARAMETER Result
Result status: success, error, warning

.PARAMETER Data
Additional contextual data (hashtable)

.PARAMETER ErrorDetails
Error object for error logging

.PARAMETER RequestId
Unique request identifier for tracing

.EXAMPLE
Write-FlashdbLog -Level 'info' -Message 'Clone created' -Operation 'create-clone' -Duration 1234 -Result 'success'

.EXAMPLE
Write-FlashdbLog -Level 'error' -Message 'Clone failed' -ErrorDetails $_ -RequestId 'abc123'
#>
function Write-FlashdbLog {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [ValidateSet('debug', 'info', 'warn', 'error', 'fatal')]
        [string]$Level = 'info',

        [string]$Operation = '',

        [int]$Duration = 0,

        [ValidateSet('success', 'error', 'warning', 'in-progress')]
        [string]$Result = '',

        [hashtable]$Data = @{},

        [object]$ErrorDetails = $null,

        [string]$RequestId = [guid]::NewGuid().ToString()
    )

    try {
        # Check log level threshold
        if ($script:LogLevels[$Level] -lt $script:LogLevels[$script:LogConfig.LogLevel]) {
            return
        }

        # Build log entry
        $timestamp = (Get-Date).ToUniversalTime().ToString('o')
        $hostname = $env:COMPUTERNAME
        $processId = $PID
        $processName = [System.Diagnostics.Process]::GetCurrentProcess().ProcessName

        # Redact sensitive data from Data hashtable
        $redactedData = Redact-SensitiveData -Data $Data

        # Build structured log object
        $logEntry = [ordered]@{
            timestamp = $timestamp
            level = $Level
            service = $script:LogConfig.Service
            message = $Message
            requestId = $RequestId
            operation = $Operation
            duration = $Duration
            result = $Result
            host = $hostname
            processId = $processId
            processName = $processName
        }

        # Add contextual data
        if ($redactedData.Count -gt 0) {
            $logEntry['data'] = $redactedData
        }

        # Add error details if present
        if ($ErrorDetails) {
            $logEntry['error'] = @{
                message = $ErrorDetails.Exception.Message
                type = $ErrorDetails.Exception.GetType().Name
                code = $ErrorDetails.Exception.HResult
                stackTrace = if ($env:NODE_ENV -eq 'development') { $ErrorDetails.Exception.StackTrace } else { $null }
            }
        }

        # Convert to JSON
        $jsonLog = $logEntry | ConvertTo-Json -Compress

        # Write to file
        if ($script:LogConfig.JsonOutput) {
            Write-LogToFile -JsonLog $jsonLog -Level $Level
        }

        # Write to console
        if ($script:LogConfig.ConsoleOutput) {
            Write-LogToConsole -LogEntry $logEntry -Level $Level
        }
    }
    catch {
        # Fallback to console if logging fails
        Write-Host "[LOGGING_ERROR] $_" -ForegroundColor Red
    }
}

<#
.SYNOPSIS
Write log to file

.DESCRIPTION
Appends log entry to the appropriate log file.

.PARAMETER JsonLog
JSON-formatted log entry

.PARAMETER Level
Log level for file routing
#>
function Write-LogToFile {
    [CmdletBinding()]
    param(
        [string]$JsonLog,
        [string]$Level
    )

    try {
        $logDir = $script:LogConfig.LogDirectory
        $date = (Get-Date).ToString('yyyy-MM-dd')

        # All logs go to combined.log
        $combinedFile = Join-Path -Path $logDir -ChildPath "combined-$date.log"
        Add-Content -Path $combinedFile -Value $jsonLog -Encoding UTF8 -Force

        # Errors also go to error.log
        if ($Level -in @('error', 'fatal')) {
            $errorFile = Join-Path -Path $logDir -ChildPath "error-$date.log"
            Add-Content -Path $errorFile -Value $jsonLog -Encoding UTF8 -Force
        }

        # Warnings go to warnings.log
        if ($Level -eq 'warn') {
            $warnFile = Join-Path -Path $logDir -ChildPath "warnings-$date.log"
            Add-Content -Path $warnFile -Value $jsonLog -Encoding UTF8 -Force
        }

        # Performance logs for operations with duration
        if ([int]$Duration -gt 0) {
            $perfFile = Join-Path -Path $logDir -ChildPath "performance-$date.log"
            Add-Content -Path $perfFile -Value $jsonLog -Encoding UTF8 -Force
        }
    }
    catch {
        # Silently fail if file write fails (don't recurse)
        Write-Host "[FILE_LOG_ERROR] Failed to write log: $_" -ForegroundColor Red
    }
}

<#
.SYNOPSIS
Write log to console with formatting

.DESCRIPTION
Outputs log entry to console with color coding and formatting.

.PARAMETER LogEntry
Ordered hashtable with log entry

.PARAMETER Level
Log level for color coding
#>
function Write-LogToConsole {
    [CmdletBinding()]
    param(
        [object]$LogEntry,
        [string]$Level
    )

    $colors = @{
        'debug' = 'Gray'
        'info' = 'Green'
        'warn' = 'Yellow'
        'error' = 'Red'
        'fatal' = 'Magenta'
    }

    $color = $colors[$Level]
    $timestamp = $LogEntry['timestamp']
    $message = $LogEntry['message']
    $operation = $LogEntry['operation']
    $duration = $LogEntry['duration']

    # Format: [TIMESTAMP] [LEVEL] [OPERATION] Message (Duration: XXms)
    $output = "[$timestamp] [$($Level.ToUpper())]"

    if ($operation) {
        $output += " [$operation]"
    }

    $output += " $message"

    if ($duration -gt 0) {
        $output += " (${duration}ms)"
    }

    Write-Host $output -ForegroundColor $color
}

<#
.SYNOPSIS
Redact sensitive data from a hashtable

.DESCRIPTION
Removes or masks sensitive information like passwords, tokens, etc.

.PARAMETER Data
Hashtable to redact

.OUTPUTS
Hashtable with sensitive data masked
#>
function Redact-SensitiveData {
    [CmdletBinding()]
    param(
        [hashtable]$Data
    )

    $sensitivePatterns = @(
        'password',
        'token',
        'secret',
        'api[_-]?key',
        'authorization',
        'credential',
        'bearer',
        'auth'
    )

    $redacted = @{}

    foreach ($key in $Data.Keys) {
        $value = $Data[$key]

        # Check if key matches sensitive patterns
        $isSensitive = $sensitivePatterns | Where-Object { $key -match $_ }

        if ($isSensitive) {
            $redacted[$key] = '[REDACTED]'
        }
        elseif ($value -is [hashtable]) {
            $redacted[$key] = Redact-SensitiveData -Data $value
        }
        else {
            $redacted[$key] = $value
        }
    }

    return $redacted
}

<#
.SYNOPSIS
Invoke log rotation

.DESCRIPTION
Removes log files older than MaxLogAgeDays.

.EXAMPLE
Invoke-LogRotation
#>
function Invoke-LogRotation {
    [CmdletBinding()]
    param()

    try {
        $logDir = $script:LogConfig.LogDirectory
        $maxAge = $script:LogConfig.MaxLogAgeDays

        if (-not (Test-Path -Path $logDir)) {
            return
        }

        $cutoffDate = (Get-Date).AddDays(-$maxAge)
        $oldLogs = Get-ChildItem -Path $logDir -Filter "*.log" | Where-Object { $_.LastWriteTime -lt $cutoffDate }

        if ($oldLogs) {
            $oldLogs | Remove-Item -Force
            Write-Host "[INFO] Removed $($oldLogs.Count) old log files"
        }
    }
    catch {
        Write-Host "[ROTATION_ERROR] Failed to rotate logs: $_" -ForegroundColor Red
    }
}

<#
.SYNOPSIS
Get log statistics

.DESCRIPTION
Returns statistics about current logs (count, size, etc).

.OUTPUTS
PSObject with log statistics
#>
function Get-FlashdbLogStats {
    [CmdletBinding()]
    param()

    try {
        $logDir = $script:LogConfig.LogDirectory

        if (-not (Test-Path -Path $logDir)) {
            return $null
        }

        $logFiles = Get-ChildItem -Path $logDir -Filter "*.log"
        $totalSize = ($logFiles | Measure-Object -Property Length -Sum).Sum

        return [PSCustomObject]@{
            LogDirectory = $logDir
            FileCount = $logFiles.Count
            TotalSizeBytes = $totalSize
            TotalSizeMB = [math]::Round($totalSize / 1MB, 2)
            OldestLogDate = ($logFiles | Measure-Object -Property LastWriteTime -Minimum).Minimum
            NewestLogDate = ($logFiles | Measure-Object -Property LastWriteTime -Maximum).Maximum
            RetentionDays = $script:LogConfig.MaxLogAgeDays
        }
    }
    catch {
        Write-Host "[STATS_ERROR] Failed to get log statistics: $_" -ForegroundColor Red
        return $null
    }
}

<#
.SYNOPSIS
Get recent log entries

.DESCRIPTION
Returns recent log entries from the current log file.

.PARAMETER Count
Number of entries to return (default: 50)

.PARAMETER Level
Filter by log level

.PARAMETER Operation
Filter by operation name

.OUTPUTS
Array of log entries
#>
function Get-FlashdbLogs {
    [CmdletBinding()]
    param(
        [int]$Count = 50,
        [string]$Level = '',
        [string]$Operation = ''
    )

    try {
        $logDir = $script:LogConfig.LogDirectory
        $date = (Get-Date).ToString('yyyy-MM-dd')
        $logFile = Join-Path -Path $logDir -ChildPath "combined-$date.log"

        if (-not (Test-Path -Path $logFile)) {
            return @()
        }

        $logs = Get-Content -Path $logFile -Tail $Count | ForEach-Object {
            try {
                $_ | ConvertFrom-Json
            }
            catch {
                $null
            }
        }

        # Filter by level if specified
        if ($Level) {
            $logs = $logs | Where-Object { $_.level -eq $Level }
        }

        # Filter by operation if specified
        if ($Operation) {
            $logs = $logs | Where-Object { $_.operation -like "*$Operation*" }
        }

        return $logs
    }
    catch {
        Write-Host "[RETRIEVAL_ERROR] Failed to retrieve logs: $_" -ForegroundColor Red
        return @()
    }
}

<#
.SYNOPSIS
Export logs to file

.DESCRIPTION
Exports logs to a specified format (JSON, CSV, etc).

.PARAMETER OutputPath
Path where logs should be exported

.PARAMETER Format
Export format: json, csv

.PARAMETER DaysBack
Number of days to include (default: 1)

.EXAMPLE
Export-FlashdbLogs -OutputPath 'C:\backups\logs.json' -Format 'json' -DaysBack 7
#>
function Export-FlashdbLogs {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$OutputPath,

        [ValidateSet('json', 'csv')]
        [string]$Format = 'json',

        [int]$DaysBack = 1
    )

    try {
        $logDir = $script:LogConfig.LogDirectory
        $startDate = (Get-Date).AddDays(-$DaysBack)

        # Collect all matching log files
        $logFiles = Get-ChildItem -Path $logDir -Filter "*.log" | Where-Object {
            $_.LastWriteTime -ge $startDate
        }

        if (-not $logFiles) {
            Write-FlashdbLog -Level 'warn' -Message 'No logs found to export' -Operation 'export-logs'
            return
        }

        # Parse all logs
        $allLogs = @()
        foreach ($file in $logFiles) {
            $content = Get-Content -Path $file.FullName
            foreach ($line in $content) {
                try {
                    $allLogs += $line | ConvertFrom-Json
                }
                catch {
                    # Skip malformed lines
                }
            }
        }

        # Export based on format
        if ($Format -eq 'json') {
            $allLogs | ConvertTo-Json | Set-Content -Path $OutputPath -Encoding UTF8
        }
        else {
            $allLogs | ConvertTo-Csv -NoTypeInformation | Set-Content -Path $OutputPath -Encoding UTF8
        }

        Write-FlashdbLog -Level 'info' -Message "Exported $($allLogs.Count) log entries" -Operation 'export-logs' `
            -Data @{ outputPath = $OutputPath; format = $Format; entriesCount = $allLogs.Count }
    }
    catch {
        Write-FlashdbLog -Level 'error' -Message 'Failed to export logs' -ErrorDetails $_ -Operation 'export-logs'
    }
}

# Ensure logging is initialized on module import
Initialize-FlashdbLogging

# Export public functions
Export-ModuleMember -Function @(
    'Write-FlashdbLog',
    'Initialize-FlashdbLogging',
    'Get-FlashdbLogStats',
    'Get-FlashdbLogs',
    'Export-FlashdbLogs',
    'Invoke-LogRotation'
)
