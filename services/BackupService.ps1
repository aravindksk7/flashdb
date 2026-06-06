# FlashDB Backup Service
# Automated backup service for production SQL Server database
# Runs on 4-hour schedule with 30-day retention

# Configuration from environment variables
$Script:Config = @{
    DbHost = $env:DB_HOST -or "sql-server"
    DbPort = $env:DB_PORT -or 1433
    DbUser = $env:DB_USER -or "sa"
    DbPassword = $env:DB_PASSWORD -or "FlashDB@Prod123"
    BackupRetentionDays = [int]($env:BACKUP_RETENTION_DAYS -or 30)
    BackupIntervalHours = [int]($env:BACKUP_INTERVAL_HOURS -or 4)
    BackupPath = "/app/backups"
    LogPath = "/app/logs"
    TZ = $env:TZ -or "UTC"
}

# Ensure directories exist
$null = New-Item -ItemType Directory -Path $Script:Config.BackupPath -Force -ErrorAction SilentlyContinue
$null = New-Item -ItemType Directory -Path $Script:Config.LogPath -Force -ErrorAction SilentlyContinue

# ============================================================================
# Logging Helper Functions
# ============================================================================

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("Info", "Warning", "Error", "Success")]
        [string]$Level = "Info"
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logFile = Join-Path $Script:Config.LogPath "backup-$(Get-Date -Format 'yyyy-MM-dd').log"
    $logEntry = "[$timestamp] [$Level] $Message"

    # Write to console with color
    switch ($Level) {
        "Info"    { Write-Host $logEntry -ForegroundColor Cyan }
        "Warning" { Write-Host $logEntry -ForegroundColor Yellow }
        "Error"   { Write-Host $logEntry -ForegroundColor Red }
        "Success" { Write-Host $logEntry -ForegroundColor Green }
    }

    # Append to log file
    Add-Content -Path $logFile -Value $logEntry
}

function Write-StatusFile {
    param(
        [string]$Status,
        [string]$Message = "",
        [datetime]$LastRun = (Get-Date),
        [string]$NextRun = ""
    )

    $statusFile = Join-Path $Script:Config.LogPath "backup-status.json"
    $statusJson = @{
        status = $Status
        message = $Message
        lastRun = $LastRun.ToString("o")
        nextRun = $NextRun
        backupPath = $Script:Config.BackupPath
        retentionDays = $Script:Config.BackupRetentionDays
    } | ConvertTo-Json

    Set-Content -Path $statusFile -Value $statusJson -Force
}

# ============================================================================
# Database Connection Helper
# ============================================================================

function Test-DatabaseConnection {
    param(
        [int]$MaxRetries = 3,
        [int]$RetryDelaySeconds = 5
    )

    $attempt = 0
    while ($attempt -lt $MaxRetries) {
        try {
            $attempt++
            Write-Log "Testing database connection (attempt $attempt/$MaxRetries)..."

            # Build connection string
            $connectionString = "Server=$($Script:Config.DbHost),$($Script:Config.DbPort);User Id=$($Script:Config.DbUser);Password=$($Script:Config.DbPassword);"

            # Test connection using PowerShell SQL module
            $sqlConnection = New-Object System.Data.SqlClient.SqlConnection
            $sqlConnection.ConnectionString = $connectionString
            $sqlConnection.Open()
            $sqlConnection.Close()

            Write-Log "Database connection successful!" -Level "Success"
            return $true
        }
        catch {
            Write-Log "Connection failed: $_" -Level "Warning"
            if ($attempt -lt $MaxRetries) {
                Write-Log "Retrying in $RetryDelaySeconds seconds..." -Level "Info"
                Start-Sleep -Seconds $RetryDelaySeconds
            }
        }
    }

    Write-Log "Failed to connect to database after $MaxRetries attempts" -Level "Error"
    return $false
}

# ============================================================================
# Backup Functions
# ============================================================================

function Get-DatabaseList {
    try {
        Write-Log "Retrieving list of databases..."

        $connectionString = "Server=$($Script:Config.DbHost),$($Script:Config.DbPort);User Id=$($Script:Config.DbUser);Password=$($Script:Config.DbPassword);"

        $sqlConnection = New-Object System.Data.SqlClient.SqlConnection
        $sqlConnection.ConnectionString = $connectionString
        $sqlConnection.Open()

        $sqlCommand = $sqlConnection.CreateCommand()
        $sqlCommand.CommandText = "SELECT name FROM sys.databases WHERE database_id > 4 AND state = 0 ORDER BY name"

        $reader = $sqlCommand.ExecuteReader()
        $databases = @()

        while ($reader.Read()) {
            $databases += $reader["name"]
        }

        $reader.Close()
        $sqlConnection.Close()

        Write-Log "Found $($databases.Count) user database(s): $($databases -join ', ')" -Level "Info"
        return $databases
    }
    catch {
        Write-Log "Failed to retrieve database list: $_" -Level "Error"
        return @()
    }
}

function Backup-Database {
    param(
        [string]$DatabaseName
    )

    try {
        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $backupFileName = "FlashDB_${DatabaseName}_${timestamp}.bak"
        $backupFilePath = Join-Path $Script:Config.BackupPath $backupFileName

        Write-Log "Starting backup of database: $DatabaseName" -Level "Info"
        Write-Log "Backup path: $backupFilePath" -Level "Info"

        $connectionString = "Server=$($Script:Config.DbHost),$($Script:Config.DbPort);User Id=$($Script:Config.DbUser);Password=$($Script:Config.DbPassword);"

        $sqlConnection = New-Object System.Data.SqlClient.SqlConnection
        $sqlConnection.ConnectionString = $connectionString
        $sqlConnection.Open()

        $sqlCommand = $sqlConnection.CreateCommand()
        $sqlCommand.CommandText = "BACKUP DATABASE [$DatabaseName] TO DISK = '$backupFilePath' WITH INIT, COMPRESSION"
        $sqlCommand.CommandTimeout = 3600  # 1 hour timeout for backup

        $backupStart = Get-Date
        $sqlCommand.ExecuteNonQuery()
        $backupDuration = (Get-Date) - $backupStart

        $sqlConnection.Close()

        # Verify backup file was created
        if (Test-Path $backupFilePath) {
            $fileSize = (Get-Item $backupFilePath).Length
            $fileSizeMB = [math]::Round($fileSize / 1MB, 2)
            Write-Log "Backup completed successfully! Size: ${fileSizeMB}MB Duration: $($backupDuration.TotalSeconds)s" -Level "Success"
            return @{
                Success = $true
                Database = $DatabaseName
                FilePath = $backupFilePath
                FileName = $backupFileName
                FileSize = $fileSize
                Duration = $backupDuration
            }
        }
        else {
            Write-Log "Backup file not created despite successful command execution" -Level "Error"
            return @{
                Success = $false
                Database = $DatabaseName
                Error = "Backup file not found"
            }
        }
    }
    catch {
        Write-Log "Backup failed for database $DatabaseName : $_" -Level "Error"
        return @{
            Success = $false
            Database = $DatabaseName
            Error = $_.Exception.Message
        }
    }
}

function Backup-Metadata {
    try {
        Write-Log "Backing up metadata and configuration..."

        $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
        $metadataBackupDir = Join-Path $Script:Config.BackupPath "metadata_$timestamp"
        $null = New-Item -ItemType Directory -Path $metadataBackupDir -Force

        # Backup operation logs if they exist
        $logsSourcePath = "/app/logs"
        if (Test-Path $logsSourcePath) {
            $logsBackupPath = Join-Path $metadataBackupDir "logs"
            Copy-Item -Path "$logsSourcePath\*.log" -Destination $logsBackupPath -Force -ErrorAction SilentlyContinue
            Write-Log "Metadata: Copied operation logs" -Level "Info"
        }

        # Create backup manifest
        $manifest = @{
            timestamp = Get-Date -Format "o"
            databases = Get-DatabaseList
            backupPath = $Script:Config.BackupPath
            retentionDays = $Script:Config.BackupRetentionDays
            hostname = [System.Net.Dns]::GetHostName()
            version = "1.0"
        } | ConvertTo-Json

        $manifestPath = Join-Path $metadataBackupDir "manifest.json"
        Set-Content -Path $manifestPath -Value $manifest -Force

        Write-Log "Metadata backup completed" -Level "Success"
        return $true
    }
    catch {
        Write-Log "Metadata backup failed: $_" -Level "Error"
        return $false
    }
}

function Remove-OldBackups {
    try {
        Write-Log "Checking for backups older than $($Script:Config.BackupRetentionDays) days..."

        $cutoffDate = (Get-Date).AddDays(-$Script:Config.BackupRetentionDays)
        $backupFiles = Get-ChildItem -Path $Script:Config.BackupPath -Filter "*.bak" -File

        $deletedCount = 0
        $totalDeletedSize = 0

        foreach ($file in $backupFiles) {
            if ($file.LastWriteTime -lt $cutoffDate) {
                Write-Log "Removing old backup: $($file.Name) (created: $($file.LastWriteTime.ToString('yyyy-MM-dd HH:mm')))" -Level "Info"
                $totalDeletedSize += $file.Length
                Remove-Item -Path $file.FullName -Force
                $deletedCount++
            }
        }

        # Remove old metadata directories
        $metadataDirs = Get-ChildItem -Path $Script:Config.BackupPath -Filter "metadata_*" -Directory
        foreach ($dir in $metadataDirs) {
            if ($dir.CreationTime -lt $cutoffDate) {
                Write-Log "Removing old metadata backup: $($dir.Name)" -Level "Info"
                Remove-Item -Path $dir.FullName -Recurse -Force
                $deletedCount++
            }
        }

        if ($deletedCount -gt 0) {
            $deletedSizeMB = [math]::Round($totalDeletedSize / 1MB, 2)
            Write-Log "Retention cleanup complete. Deleted $deletedCount items, freed ${deletedSizeMB}MB" -Level "Success"
        }
        else {
            Write-Log "No old backups found for deletion" -Level "Info"
        }

        return $true
    }
    catch {
        Write-Log "Retention cleanup failed: $_" -Level "Error"
        return $false
    }
}

function Get-BackupStats {
    try {
        $backupFiles = Get-ChildItem -Path $Script:Config.BackupPath -Filter "*.bak" -File
        $totalSize = ($backupFiles | Measure-Object -Property Length -Sum).Sum

        $backupCount = $backupFiles.Count
        $totalSizeMB = [math]::Round($totalSize / 1MB, 2)
        $totalSizeGB = [math]::Round($totalSize / 1GB, 2)

        Write-Log "Backup statistics: $backupCount files, Total size: ${totalSizeMB}MB (${totalSizeGB}GB)" -Level "Info"

        return @{
            FileCount = $backupCount
            TotalSize = $totalSize
            TotalSizeMB = $totalSizeMB
            TotalSizeGB = $totalSizeGB
        }
    }
    catch {
        Write-Log "Failed to get backup stats: $_" -Level "Error"
        return $null
    }
}

# ============================================================================
# Main Backup Cycle
# ============================================================================

function Invoke-BackupCycle {
    Write-Log "======================================================================"
    Write-Log "Starting FlashDB Backup Cycle" -Level "Info"
    Write-Log "======================================================================"

    $cycleStart = Get-Date
    $nextRunTime = $cycleStart.AddHours($Script:Config.BackupIntervalHours)

    # Test database connection first
    if (-not (Test-DatabaseConnection)) {
        Write-StatusFile -Status "Failed" -Message "Database connection failed"
        Write-Log "Backup cycle aborted due to database connection failure" -Level "Error"
        return
    }

    # Get list of databases
    $databases = Get-DatabaseList
    if ($databases.Count -eq 0) {
        Write-Log "No databases found for backup" -Level "Warning"
        Write-StatusFile -Status "Skipped" -Message "No databases found"
        return
    }

    # Backup each database
    $backupResults = @()
    foreach ($db in $databases) {
        $result = Backup-Database -DatabaseName $db
        $backupResults += $result
    }

    # Backup metadata
    Backup-Metadata | Out-Null

    # Remove old backups based on retention policy
    Remove-OldBackups | Out-Null

    # Get statistics
    $stats = Get-BackupStats

    # Calculate cycle duration
    $cycleDuration = (Get-Date) - $cycleStart

    # Report results
    Write-Log "======================================================================"
    Write-Log "Backup Cycle Complete" -Level "Success"
    Write-Log "Duration: $($cycleDuration.TotalSeconds)s"
    Write-Log "Next scheduled backup: $($nextRunTime.ToString('yyyy-MM-dd HH:mm:ss'))"
    Write-Log "======================================================================"

    # Update status file
    Write-StatusFile -Status "Success" -Message "Backup cycle completed successfully" -LastRun $cycleStart -NextRun $nextRunTime.ToString("o")
}

# ============================================================================
# Service Entry Point - Main Loop
# ============================================================================

Write-Log "FlashDB Backup Service Starting..." -Level "Info"
Write-Log "Configuration: Host=$($Script:Config.DbHost), Interval=$($Script:Config.BackupIntervalHours)h, Retention=$($Script:Config.BackupRetentionDays)d" -Level "Info"

# Initial status
Write-StatusFile -Status "Running" -Message "Service initialized"

# Main loop - runs indefinitely
while ($true) {
    try {
        # Calculate next run time
        $now = Get-Date
        $nextRun = $now.AddHours($Script:Config.BackupIntervalHours)

        # Run backup cycle immediately on first start
        Invoke-BackupCycle

        # Wait for next scheduled backup
        $sleepSeconds = $Script:Config.BackupIntervalHours * 3600

        Write-Log "Next backup scheduled in $($Script:Config.BackupIntervalHours) hours at $($nextRun.ToString('yyyy-MM-dd HH:mm:ss'))" -Level "Info"
        Write-Log "Service sleeping for $sleepSeconds seconds..." -Level "Info"

        Start-Sleep -Seconds $sleepSeconds
    }
    catch {
        Write-Log "Error in backup service main loop: $_" -Level "Error"
        Write-Log "Service will retry in 60 seconds..." -Level "Warning"
        Start-Sleep -Seconds 60
    }
}
