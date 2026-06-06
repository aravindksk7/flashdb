# FlashDB Administrator Guide

## Table of Contents

1. [Installation & Setup](#installation--setup)
2. [System Configuration](#system-configuration)
3. [Storage Management](#storage-management)
4. [Backup & Recovery](#backup--recovery)
5. [User & Access Management](#user--access-management)
6. [Monitoring & Performance](#monitoring--performance)
7. [Troubleshooting](#troubleshooting)
8. [Operational Procedures](#operational-procedures)
9. [Maintenance](#maintenance)

## Installation & Setup

### System Requirements

**Minimum:**
- CPU: 4 cores with virtualization support
- RAM: 16 GB
- Storage: 500 GB SSD for VHDX files
- OS: Windows Server 2019 or later

**Recommended:**
- CPU: 8+ cores with virtualization support
- RAM: 32+ GB (64 GB for large deployments)
- Storage: 2+ TB SSD NVMe RAID-1
- OS: Windows Server 2022

### Pre-Installation Checklist

```powershell
# 1. Verify Windows Version
$osVersion = [System.Environment]::OSVersion.Version
if ($osVersion -lt [version]"10.0.17763") {
  Write-Error "Windows Server 2019 or later required"
}

# 2. Check Virtualization Support
$vmx = Get-WmiObject -Class Win32_Processor | Select-Object -First 1 | 
  Select-Object -ExpandProperty VirtualizationFirmwareEnabled
if ($vmx -ne $true) {
  Write-Warning "CPU virtualization not enabled - enable in BIOS"
}

# 3. Verify .NET Framework
[System.Runtime.InteropServices.RuntimeEnvironment]::GetRuntimeDirectory()

# 4. Check SQL Server (if available)
Get-Service MSSQL* | Select-Object Name, Status

# 5. Verify Available Storage
Get-Volume | Where-Object {$_.SizeRemaining -gt 500GB}
```

### Installation Steps

**Option 1: Using PowerShell Module**

```powershell
# 1. Download and extract FlashDB
# 2. Import the module
Import-Module "C:\FlashDB\FlashDB.psm1"

# 3. Run installation
Install-FlashDB -InstallationPath "C:\FlashDB" `
  -ModulePath "C:\FlashDB\modules" `
  -Confirm:$false

# 4. Verify installation
Get-Command -Module FlashDB | Measure-Object
Test-FlashdbConnection
```

**Option 2: Docker Deployment**

```bash
# Build images
docker-compose -f docker-compose.yml build

# Start services
docker-compose up -d

# Verify
docker-compose ps
curl http://localhost:3001/health
```

### Initial Configuration

**Set Storage Location:**

```powershell
# Define storage for golden images, clones, checkpoints
Set-FlashdbStoragePath `
  -Path "E:\FlashDB\Data" `
  -CreateIfNotExists `
  -Confirm:$false

# Configure backup location
Set-FlashdbBackupPath `
  -Path "F:\FlashDB\Backups" `
  -CreateIfNotExists
```

**Configure SQL Server Connection:**

```powershell
# Register SQL Server instance for clone attachment
Register-FlashdbSqlServer `
  -ServerName "sql-server-01" `
  -DefaultDatabase "master" `
  -EnablePooling:$true `
  -PoolSize 100
```

**API Configuration:**

```powershell
# Configure API endpoint
Set-FlashdbApiConfig `
  -Port 3001 `
  -EnableSSL:$false `
  -CorsOrigins "http://localhost:3000" `
  -LogLevel "Information"
```

## System Configuration

### Configuration Files

Main configuration files:

```
C:\FlashDB\
├── config/
│   ├── flashdb.config.json      # Core settings
│   ├── api.config.json          # API configuration
│   └── storage.config.json      # Storage paths
├── logs/
│   ├── flashdb.log              # Main application log
│   ├── api.log                  # API server log
│   └── operations.log           # Operation log
└── data/
    ├── metadata/                # System metadata
    └── backup/                  # System backups
```

### Core Configuration

**flashdb.config.json:**

```json
{
  "system": {
    "dataPath": "E:\\FlashDB\\Data",
    "backupPath": "F:\\FlashDB\\Backups",
    "maxConcurrentClones": 10,
    "maxConcurrentOperations": 20,
    "operationTimeout": 3600000
  },
  "golden_images": {
    "enableCompression": true,
    "verifyRowCounts": true,
    "retentionDays": 180
  },
  "clones": {
    "defaultExpirationHours": 168,
    "enableAutoCleanup": true,
    "cleanupCheckInterval": 3600000
  },
  "checkpoints": {
    "maxPerClone": 10,
    "retentionDays": 30,
    "autoDeleteOldest": true
  },
  "monitoring": {
    "enableMetrics": true,
    "metricsInterval": 60000,
    "retentionDays": 90
  }
}
```

### API Configuration

**api.config.json:**

```json
{
  "server": {
    "port": 3001,
    "ssl": false,
    "sslCert": null,
    "sslKey": null
  },
  "cors": {
    "enabled": true,
    "origins": ["http://localhost:3000", "http://localhost:5173"],
    "credentials": true
  },
  "logging": {
    "level": "info",
    "format": "json",
    "maxSize": "100m",
    "maxFiles": 10
  },
  "authentication": {
    "enabled": false,
    "type": "jwt",
    "secretKey": null
  },
  "rateLimit": {
    "enabled": false,
    "windowMs": 900000,
    "maxRequests": 100
  }
}
```

### Storage Configuration

**storage.config.json:**

```json
{
  "paths": {
    "goldenImages": "E:\\FlashDB\\GoldenImages",
    "clones": "E:\\FlashDB\\Clones",
    "checkpoints": "E:\\FlashDB\\Checkpoints"
  },
  "performance": {
    "useCompression": true,
    "compressionLevel": "Medium",
    "enableCaching": true,
    "cacheSize": "4GB"
  },
  "quotas": {
    "maxTotalStorage": "2TB",
    "maxGoldenImageStorage": "500GB",
    "maxCloneStorage": "1TB"
  }
}
```

## Storage Management

### Storage Planning

**Capacity Calculation:**

```
Total Storage = Golden Images + Clones + Checkpoints + Overhead (10%)

Example:
- 3 Golden Images: 100 GB each = 300 GB
- 20 Active Clones: 10 GB average = 200 GB
- 50 Checkpoints: 5 GB average = 250 GB
- Overhead (10%): 75 GB
- Total = 825 GB

Recommendation: Provision 1.5-2x calculated amount
```

**Storage Tiering:**

```
Tier 1 (Hot/Active): NVMe SSD
- Currently used clones
- Recent golden images
- Active operations

Tier 2 (Warm): SSD
- Older golden images
- Archived checkpoints
- Historical data

Tier 3 (Cold): HDD
- Long-term backups
- Archives
```

### Monitoring Storage

**Real-Time Storage Status:**

```powershell
# Get overall storage metrics
Get-FlashdbStorageMetrics

# Get usage by category
Get-FlashdbStorageBreakdown

# Get largest items
Get-FlashdbLargestItems -Top 20
```

**Storage Dashboard:**

```
Dashboard → Metrics → Storage
Shows:
- Total capacity and usage
- Percentage used
- Breakdown by category
- Growth trend over time
- Largest consumers
```

### Storage Cleanup

**Remove Old Golden Images:**

```powershell
# List old golden images
Get-FlashdbGoldenImage | Where-Object {
  $_.CreatedAt -lt (Get-Date).AddDays(-30)
} | Select-Object Name, CreatedAt, SizeBytes

# Delete specific golden image
Remove-FlashdbGoldenImage -Id "prod-20260401" `
  -Confirm:$true
```

**Remove Old Clones:**

```powershell
# List clones modified more than 7 days ago
Get-FlashdbClone | Where-Object {
  $_.LastModified -lt (Get-Date).AddDays(-7)
} | Select-Object Name, LastModified, SizeBytes

# Delete old clones
Remove-FlashdbClone -Id @("test-001", "test-002") `
  -Force:$true
```

**Compress VHDX Files:**

```powershell
# Compact VHDX to reclaim deleted space
Optimize-FlashdbStorage `
  -Path "E:\FlashDB\Data" `
  -Method "Compact" `
  -Verbose

# Estimate space savings
Get-FlashdbStorageAnalysis -Path "E:\FlashDB\Data"
```

## Backup & Recovery

### Backup Strategy

**Three-Tier Backup Approach:**

```
Tier 1: Golden Image Backups
├─ Frequency: Daily
├─ Retention: 7 days
└─ Purpose: Recover corrupted golden images

Tier 2: Configuration Backups
├─ Frequency: After configuration changes
├─ Retention: 30 days
└─ Purpose: Recover system configuration

Tier 3: Full System Backup
├─ Frequency: Weekly
├─ Retention: 90 days
└─ Purpose: Complete disaster recovery
```

### Creating Backups

**Backup Golden Images:**

```powershell
# Backup specific golden image
Backup-FlashdbGoldenImage `
  -ImageId "prod-20260606" `
  -BackupPath "\\backup-server\flashdb\golden-images" `
  -Compress:$true

# Backup all golden images
Get-FlashdbGoldenImage | ForEach-Object {
  Backup-FlashdbGoldenImage `
    -ImageId $_.Id `
    -BackupPath "\\backup-server\flashdb\golden-images"
}
```

**Backup Configuration:**

```powershell
# Backup system configuration
Backup-FlashdbConfiguration `
  -BackupPath "\\backup-server\flashdb\config" `
  -IncludeMetadata:$true

# Creates timestamped backup file
# Example: flashdb-config-20260606-143200.bak
```

**Backup Metadata Database:**

```powershell
# Backup system metadata
Backup-FlashdbMetadata `
  -BackupPath "\\backup-server\flashdb\metadata" `
  -Format "SQLBackup"
```

### Automated Backup Schedule

**Setup Daily Backups:**

```powershell
# Create scheduled task for daily backups
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00 AM"
$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-File C:\FlashDB\scripts\backup.ps1"

Register-ScheduledTask `
  -TaskName "FlashDB-DailyBackup" `
  -Trigger $trigger `
  -Action $action `
  -RunLevel Highest
```

**Backup Script Example:**

```powershell
# C:\FlashDB\scripts\backup.ps1

Import-Module "C:\FlashDB\FlashDB.psm1"

$backupPath = "\\backup-server\flashdb\backups\$(Get-Date -Format 'yyyyMMdd')"
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

# Backup all golden images
Get-FlashdbGoldenImage | ForEach-Object {
  Backup-FlashdbGoldenImage -ImageId $_.Id -BackupPath $backupPath
}

# Backup configuration
Backup-FlashdbConfiguration -BackupPath $backupPath

# Cleanup backups older than 90 days
Get-ChildItem "\\backup-server\flashdb\backups" | 
  Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-90)} |
  Remove-Item -Recurse -Force
```

### Recovery Procedures

**Restore Golden Image:**

```powershell
# List available backups
Get-ChildItem "\\backup-server\flashdb\golden-images" | 
  Sort-Object LastWriteTime -Descending

# Restore from backup
Restore-FlashdbGoldenImage `
  -BackupFile "\\backup-server\flashdb\golden-images\prod-20260606.bak" `
  -ImageId "prod-20260606-restored" `
  -Verify:$true
```

**Restore Configuration:**

```powershell
# Restore system configuration
Restore-FlashdbConfiguration `
  -BackupFile "\\backup-server\flashdb\config\flashdb-config-20260605.bak" `
  -Force:$false `
  -Verify:$true
```

**Full System Recovery:**

```powershell
# 1. Stop all services
Stop-FlashdbService -Force

# 2. Restore configuration
Restore-FlashdbConfiguration -BackupFile "latest-config.bak"

# 3. Restore metadata
Restore-FlashdbMetadata -BackupFile "latest-metadata.bak"

# 4. Start services
Start-FlashdbService

# 5. Verify health
Test-FlashdbIntegrity -Verbose
Get-FlashdbStatus
```

## User & Access Management

### Role-Based Access Control

**Default Roles:**

```
Administrator
├─ Full system access
├─ Create/delete golden images
├─ Manage users and permissions
└─ System configuration

Operator
├─ Create and delete clones
├─ Manage checkpoints
├─ Create/cancel batch operations
└─ View metrics and logs

Developer
├─ Create clones (read-only deletion)
├─ Create/restore checkpoints
├─ Access clone metadata
└─ View personal operations

Viewer
├─ Read-only access
├─ View clones and images
├─ View metrics
└─ No modification permissions
```

### Managing Users

**Create User Account:**

```powershell
# Create new user
New-FlashdbUser `
  -Username "john.doe" `
  -Email "john.doe@company.com" `
  -Role "Developer" `
  -FullName "John Doe" `
  -Enabled:$true

# Output includes temporary password
```

**Assign Roles:**

```powershell
# Assign role to user
Set-FlashdbUserRole `
  -Username "john.doe" `
  -Role "Operator"

# List user permissions
Get-FlashdbUserPermissions -Username "john.doe"
```

**Manage User Accounts:**

```powershell
# List all users
Get-FlashdbUser | Select-Object Username, Role, Email, Enabled

# Disable user
Disable-FlashdbUser -Username "john.doe"

# Reset password
Reset-FlashdbUserPassword -Username "john.doe"

# Delete user
Remove-FlashdbUser -Username "john.doe" -Confirm:$true
```

### Access Control Lists (ACL)

**Golden Image ACL:**

```powershell
# Restrict golden image access
Set-FlashdbResourceAcl `
  -ResourceId "prod-20260606" `
  -ResourceType "GoldenImage" `
  -Permissions @(
    @{Principal = "john.doe"; Permission = "Read"},
    @{Principal = "qa-team"; Permission = "CreateClone"},
    @{Principal = "admin"; Permission = "Full"}
  )
```

**Clone ACL:**

```powershell
# Restrict clone access
Set-FlashdbResourceAcl `
  -ResourceId "test-clone-001" `
  -ResourceType "Clone" `
  -Owner "john.doe" `
  -Permissions @(
    @{Principal = "john.doe"; Permission = "Full"},
    @{Principal = "qa-team"; Permission = "Read"}
  )
```

### Audit Logging

**Enable Audit Logging:**

```powershell
# Enable detailed audit logging
Set-FlashdbAuditPolicy `
  -Enabled:$true `
  -LogLevel "Detailed" `
  -RetentionDays 90 `
  -LogPath "F:\FlashDB\Audit"
```

**Review Audit Logs:**

```powershell
# View audit events
Get-FlashdbAuditLog -Last 1000 | 
  Select-Object Timestamp, User, Action, Resource, Result |
  Format-Table -AutoSize

# Export audit log
Get-FlashdbAuditLog -Since (Get-Date).AddDays(-7) |
  Export-Csv "audit-report-weekly.csv" -NoTypeInformation
```

## Monitoring & Performance

### System Health Monitoring

**Health Check Dashboard:**

```powershell
# Get overall system health
Get-FlashdbHealthStatus

# Output:
# SystemHealth: Healthy
# ComponentStatus:
#   - Core: Running
#   - API: Running
#   - Storage: Normal (85% used)
#   - Database: Connected
# Alerts: None
```

**Performance Counters:**

```powershell
# Get real-time performance metrics
Get-FlashdbPerformanceMetrics | 
  Select-Object @(
    @{Name='CPU %'; Expression={$_.CPUPercent}},
    @{Name='Memory MB'; Expression={$_.MemoryMB}},
    @{Name='Disk I/O'; Expression={$_.DiskIOPerSec}},
    @{Name='Network Mbps'; Expression={$_.NetworkMbps}}
  )
```

### Alerting

**Configure Alerts:**

```powershell
# Storage capacity alert
Set-FlashdbAlert `
  -AlertName "StorageCapacity" `
  -Condition "UsedStorage >= 80%" `
  -Action "SendEmail" `
  -Recipient "admin@company.com" `
  -Enabled:$true

# Operation failure alert
Set-FlashdbAlert `
  -AlertName "OperationFailure" `
  -Condition "OperationStatus = 'Failed'" `
  -Action "SendEmail,CreateTicket" `
  -Recipient "admin@company.com" `
  -Enabled:$true

# Service health alert
Set-FlashdbAlert `
  -AlertName "ServiceDown" `
  -Condition "ServiceStatus = 'Stopped'" `
  -Action "SendAlert,Restart" `
  -Recipient "admin@company.com" `
  -Enabled:$true
```

**View Active Alerts:**

```powershell
Get-FlashdbAlert -Status "Active" | 
  Select-Object Name, Condition, TriggerCount, LastTriggered
```

### Performance Optimization

**Enable Caching:**

```powershell
# Enable result caching
Set-FlashdbCaching `
  -Enabled:$true `
  -MaxSize "2GB" `
  -TTL 3600 `
  -Strategy "LRU"
```

**Optimize Compression:**

```powershell
# Set compression strategy
Set-FlashdbCompressionPolicy `
  -Algorithm "LZFSE" `
  -Level "Balanced" `
  -ParallelThreads 8
```

**Connection Pooling:**

```powershell
# Configure connection pool
Set-FlashdbConnectionPool `
  -Enabled:$true `
  -PoolSize 100 `
  -MaxConnections 200 `
  -IdleTimeout 3600
```

## Troubleshooting

### Common Issues

**Issue: High Disk I/O**

```powershell
# Check for large operations
Get-FlashdbOperation -Status "Running" | 
  Select-Object Id, Type, Progress, Duration

# Monitor disk usage
Get-Process | Sort-Object WorkingSet -Descending | 
  Select-Object -First 10 Name, @{Name='RAM (MB)'; Expression={$_.WorkingSet / 1MB}}
```

**Issue: API Performance Degradation**

```powershell
# Check API metrics
Get-FlashdbApiMetrics | Select-Object @(
  @{Name='Requests/sec'; Expression={$_.RequestsPerSecond}},
  @{Name='Avg Latency (ms)'; Expression={$_.AverageLatency}},
  @{Name='P95 Latency (ms)'; Expression={$_.P95Latency}},
  @{Name='Errors/sec'; Expression={$_.ErrorsPerSecond}}
)

# Restart API service if needed
Restart-FlashdbApiService
```

**Issue: Storage Space Exhaustion**

```powershell
# Identify large items
Get-FlashdbLargestItems -Top 20 | 
  Select-Object Name, Type, SizeGB, CreatedDate |
  Sort-Object SizeGB -Descending

# Aggressive cleanup
Remove-FlashdbClone `
  -Filter @{Status = "Ready"; LastModified = @{LT = (Get-Date).AddDays(-3)}} `
  -Force:$true
```

### Log Analysis

**View Recent Errors:**

```powershell
# Get last 100 errors
Get-FlashdbLog -Level "Error" -Last 100 | 
  Select-Object Timestamp, Message |
  Format-Table -Wrap

# Export error log
Get-FlashdbLog -Level "Error" -Since (Get-Date).AddDays(-1) |
  Export-Csv "errors-$(Get-Date -Format 'yyyyMMdd').csv"
```

**Monitor API Logs:**

```powershell
# Watch API log in real-time
Get-Content "C:\FlashDB\logs\api.log" -Wait -Tail 20

# Filter by status code
Select-String "500|502|503" "C:\FlashDB\logs\api.log" | 
  Select-Object -Last 20
```

## Operational Procedures

### Daily Operations

**Morning Checklist:**

```powershell
# 1. Verify services running
Get-FlashdbService | Where-Object {$_.Status -ne "Running"}

# 2. Check alerts
Get-FlashdbAlert -Status "Active"

# 3. Monitor storage
Get-FlashdbStorageMetrics | Select-Object UsagePercent

# 4. Review failed operations
Get-FlashdbOperation -Status "Failed" -Since (Get-Date).AddHours(-24)
```

**Weekly Maintenance:**

```powershell
# 1. Full system health check
Test-FlashdbIntegrity -Comprehensive

# 2. Review storage trends
Get-FlashdbStorageTrend -Days 7

# 3. Clean old clones
Get-FlashdbClone -Status "Ready" | 
  Where-Object {$_.LastModified -lt (Get-Date).AddDays(-7)} |
  Remove-FlashdbClone -Force

# 4. Verify backups completed
Get-ChildItem "\\backup-server\flashdb\backups" -Recurse | 
  Where-Object {$_.LastWriteTime -ge (Get-Date).AddDays(-1)}
```

**Monthly Tasks:**

```powershell
# 1. Generate usage report
New-FlashdbUsageReport -OutputPath "reports\usage-$(Get-Date -Format 'yyyyMM').csv"

# 2. Archive old audit logs
Get-FlashdbAuditLog -Before (Get-Date).AddMonths(-1) |
  Export-Csv "archive\audit-$(Get-Date -Format 'yyyyMM').csv" |
  Remove-FlashdbAuditLog

# 3. Optimize storage
Optimize-FlashdbStorage -Path "E:\FlashDB\Data" -Method "Compact"

# 4. Review security and access
Get-FlashdbUser | Select-Object Username, Role, LastLogin
```

### Incident Response

**Clone Corruption:**

1. Identify affected clone
2. Check recent checkpoint
3. Restore from checkpoint
4. If no checkpoint, delete and recreate
5. Log incident

**Storage Full:**

1. Stop new operations
2. Identify largest items
3. Delete oldest clones
4. Compact VHDX files
5. Monitor until under 80%

**API Service Down:**

1. Check service status
2. Review recent error logs
3. Restart service
4. Verify connectivity
5. Run health check

## Maintenance

### Scheduled Maintenance Windows

**Recommended Schedule:**

```
Weekly (Sunday 2:00-4:00 AM):
- Defragmentation
- VHDX optimization
- Log rotation
- Backup verification

Monthly (First Sunday):
- Full system health check
- Security audit
- Capacity planning review
- Configuration backup
```

### Version Updates

**Pre-Update:**

```powershell
# 1. Create system backup
Backup-FlashdbConfiguration -BackupPath "pre-update-backup"

# 2. Notify users
Send-FlashdbNotification -Message "Maintenance window scheduled"

# 3. Stop new operations
Set-FlashdbMaintenanceMode -Enabled:$true

# 4. Wait for in-progress ops to complete
Wait-FlashdbOperations
```

**Update:**

```powershell
# 1. Download and extract update
# 2. Stop services
Stop-FlashdbService -Force

# 3. Run update script
& "C:\FlashDB\updates\update-to-v1.1.ps1"

# 4. Start services
Start-FlashdbService

# 5. Verify
Test-FlashdbIntegrity
```

**Post-Update:**

```powershell
# 1. Verify all services running
Get-FlashdbService

# 2. Run compatibility tests
Test-FlashdbApiEndpoints

# 3. Notify users
Send-FlashdbNotification -Message "Maintenance complete"

# 4. Disable maintenance mode
Set-FlashdbMaintenanceMode -Enabled:$false

# 5. Monitor for issues
```

## Support & Documentation

- **Administrator Support**: Admin section in dashboard
- **Troubleshooting Guide**: TROUBLESHOOTING.md
- **API Documentation**: API_REFERENCE.md
- **PowerShell Help**: `Get-Help <cmdlet> -Full`
- **Event Logs**: Event Viewer (FlashDB application events)
