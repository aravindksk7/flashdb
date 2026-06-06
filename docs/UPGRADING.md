# FlashDB Upgrade Guide

## Overview

This guide covers upgrading between FlashDB versions, ensuring smooth transitions with minimal downtime.

## Version Compatibility

### Upgrade Paths

**Direct Upgrades:**
- 1.0.0 → 1.1.0 ✓ (No breaking changes)
- 1.0.0 → 1.2.0 ✓ (Compatible)
- 1.0.0 → 1.x ✓ (v1.x line maintains compatibility)

**Major Version Upgrades:**
- 1.x → 2.0.0 (Requires planning - see below)

### Compatibility Matrix

| From | To | Upgrade | Downtime | Breaking Changes |
|------|-----|---------|----------|-----------------|
| 1.0.0 | 1.1.0 | Direct | None | No |
| 1.0.0 | 1.2.0 | Direct | None | No |
| 1.1.0 | 1.2.0 | Direct | None | No |
| 1.x | 2.0.0 | Manual | Planned | Yes |

## Pre-Upgrade Checklist

Before upgrading, complete this checklist:

```powershell
# 1. Backup current system
Backup-FlashdbConfiguration -BackupPath "pre-upgrade-backup"
Backup-FlashdbMetadata -BackupPath "pre-upgrade-backup"

# 2. Document current state
Get-FlashdbStatus | Export-Csv "pre-upgrade-status.csv"
Get-FlashdbMetrics | Export-Csv "pre-upgrade-metrics.csv"

# 3. Verify all operations complete
Get-FlashdbOperation -Status "Running" | Should -BeNullOrEmpty

# 4. Test in staging environment first
# (Recommended for major upgrades)

# 5. Schedule maintenance window
# (Coordinate with team)

# 6. Notify users
Send-FlashdbNotification -Message "Upgrade scheduled" -Duration "1 hour"
```

## Upgrade Procedures

### v1.0.0 → v1.1.0 (Minor Upgrade)

**Duration:** 5-10 minutes
**Downtime:** None (zero-downtime upgrade)

#### Step 1: Download and Verify

```powershell
# Download v1.1.0
$releaseUrl = "https://github.com/flashdb/flashdb/releases/download/v1.1.0/flashdb-v1.1.0.zip"
Invoke-WebRequest -Uri $releaseUrl -OutFile "flashdb-v1.1.0.zip"

# Verify checksum
$expectedHash = "abc123def456..." # From release notes
$actualHash = (Get-FileHash "flashdb-v1.1.0.zip" -Algorithm SHA256).Hash
if ($actualHash -ne $expectedHash) {
  Write-Error "Checksum mismatch!"
  exit 1
}

# Extract
Expand-Archive "flashdb-v1.1.0.zip" -DestinationPath "C:\FlashDB-v1.1.0"
```

#### Step 2: Backup Current Installation

```powershell
# Backup current installation
Copy-Item "C:\FlashDB" "C:\FlashDB-backup-v1.0.0" -Recurse -Force

# Backup all data
Copy-Item "E:\FlashDB\Data" "E:\FlashDB-backup-v1.0.0" -Recurse -Force
```

#### Step 3: Enable Maintenance Mode

```powershell
# Stop accepting new operations
Set-FlashdbMaintenanceMode -Enabled:$true

# Wait for in-progress operations to complete
Wait-FlashdbOperations -Timeout 300000  # 5 minutes max
```

#### Step 4: Upgrade Service

```powershell
# Stop services
Stop-FlashdbService -Force

# Replace binaries
Remove-Item "C:\FlashDB\src" -Recurse -Force
Copy-Item "C:\FlashDB-v1.1.0\src" "C:\FlashDB\src" -Recurse

# Start services
Start-FlashdbService

# Wait for startup
Start-Sleep -Seconds 10

# Verify
Test-FlashdbConnection
```

#### Step 5: Verify Upgrade

```powershell
# Check version
Get-FlashdbVersion
# Should output: 1.1.0

# Test key endpoints
Get-FlashdbClone | Should -Not -BeNullOrEmpty
Get-FlashdbGoldenImage | Should -Not -BeNullOrEmpty

# Verify data integrity
Test-FlashdbIntegrity -Verbose

# Check for errors
Get-FlashdbLog -Level "Error" -Since (Get-Date).AddMinutes(-5)
```

#### Step 6: Disable Maintenance Mode

```powershell
# Resume normal operations
Set-FlashdbMaintenanceMode -Enabled:$false

# Notify users
Send-FlashdbNotification -Message "Upgrade complete - System operational"
```

#### Step 7: Post-Upgrade Tasks

```powershell
# Test new features
# (Test v1.1.0 specific features)

# Verify backups
# (Run backup job to ensure still working)

# Monitor for issues
# (Watch logs for next 1-2 hours)

# Save upgrade report
New-FlashdbUpgradeReport -OutputPath "upgrade-v1.1.0-report.txt"
```

### v1.0.0 → v1.2.0 (Minor Upgrade)

Same process as v1.0.0 → v1.1.0:

1. Download v1.2.0
2. Backup current installation
3. Enable maintenance mode
4. Upgrade service
5. Verify upgrade
6. Disable maintenance mode
7. Post-upgrade tasks

### v1.x → v2.0.0 (Major Upgrade)

**Duration:** 30-60 minutes
**Downtime:** 15-30 minutes (planned maintenance window)
**Complexity:** High (Breaking changes may require adjustments)

#### What Changes in v2.0.0

```
Breaking Changes:
- Multi-database support requires new configuration format
- API endpoint changes for database selection
- Storage structure changes
- PowerShell cmdlet parameter changes

Non-Breaking:
- Existing clones and golden images remain functional
- API v1 endpoints supported with compatibility layer
- Configuration auto-migration provided
```

#### Pre-Upgrade for v2.0.0

**1 Week Before:**
```powershell
# Review migration guide
# https://github.com/flashdb/flashdb/wiki/v2.0-migration

# Test in isolated staging environment
# Install v2.0.0 beta/RC in test environment

# Identify any custom scripts or integrations
Get-ChildItem "C:\FlashDB\scripts" -Filter "*.ps1"
# Review each for compatibility

# Check for third-party integrations
# Document dependencies
```

**1 Day Before:**
```powershell
# Full system backup
Backup-FlashdbFull -BackupPath "\\backup\flashdb-pre-v2.0" `
  -IncludeData:$true -IncludeMetadata:$true

# Verify backup completeness
Test-FlashdbBackup -BackupPath "\\backup\flashdb-pre-v2.0"

# Document current configuration
Export-FlashdbConfiguration -OutputPath "config-v1.x.json"

# Create recovery plan document
```

#### Upgrade Steps for v2.0.0

**Phase 1: Pre-Upgrade (15 min, no downtime)**

```powershell
# 1. Download and verify
$releaseUrl = "https://github.com/flashdb/flashdb/releases/download/v2.0.0/flashdb-v2.0.0.zip"
Invoke-WebRequest -Uri $releaseUrl -OutFile "flashdb-v2.0.0.zip"

# Verify checksum
$expectedHash = "v2hash..."
$actualHash = (Get-FileHash "flashdb-v2.0.0.zip" -Algorithm SHA256).Hash
if ($actualHash -ne $expectedHash) { exit 1 }

# Extract to staging
Expand-Archive "flashdb-v2.0.0.zip" -DestinationPath "C:\FlashDB-v2.0.0-staging"

# 2. Run pre-flight checks
& "C:\FlashDB-v2.0.0-staging\migration\pre-flight-check.ps1"
# (Checks compatibility, identifies migration needs)

# 3. Backup current installation
Copy-Item "C:\FlashDB" "C:\FlashDB-v1.x-backup" -Recurse -Force
Copy-Item "E:\FlashDB\Data" "E:\FlashDB-v1.x-backup" -Recurse -Force
```

**Phase 2: Maintenance Window (30 min downtime)**

```powershell
# Announce maintenance
Send-FlashdbNotification -Message "FlashDB maintenance window starting" `
  -EndTime (Get-Date).AddMinutes(30)

# 1. Stop all services
Stop-FlashdbService -Force
Start-Sleep -Seconds 5

# 2. Run migration script
$migrationScript = "C:\FlashDB-v2.0.0-staging\migration\migrate-v1-to-v2.ps1"
& $migrationScript -SourcePath "C:\FlashDB" `
  -DataPath "E:\FlashDB\Data" `
  -Verbose

# 3. Backup migrated data before starting v2.0.0
Copy-Item "C:\FlashDB" "C:\FlashDB-v2.0.0-pre-startup" -Recurse -Force

# 4. Move new version into place
Remove-Item "C:\FlashDB\src" -Recurse -Force
Copy-Item "C:\FlashDB-v2.0.0-staging\src" "C:\FlashDB\src" -Recurse
Copy-Item "C:\FlashDB-v2.0.0-staging\migration" "C:\FlashDB\migration" -Recurse

# 5. Start v2.0.0 services
Start-FlashdbService
Start-Sleep -Seconds 10

# 6. Verify startup
if ((Get-FlashdbStatus).Overall -ne "Healthy") {
  Write-Error "Service failed to start - Rolling back..."
  # Execute rollback
  exit 1
}
```

**Phase 3: Post-Upgrade (15 min, operational)**

```powershell
# 1. Verify data integrity
Test-FlashdbIntegrity -Comprehensive -Verbose

# 2. Run post-migration tests
& "C:\FlashDB-v2.0.0-staging\migration\post-migration-tests.ps1"

# 3. Test new v2.0.0 features
# (Create test database, clone, etc.)

# 4. Check for migration issues
Get-FlashdbLog -Level "Error" -Since (Get-Date).AddMinutes(-30)

# 5. Notify users
Send-FlashdbNotification -Message "FlashDB v2.0.0 upgrade complete"
```

#### Rollback Procedure for v2.0.0

If v2.0.0 upgrade fails:

```powershell
# 1. Stop v2.0.0
Stop-FlashdbService -Force

# 2. Restore v1.x installation
Remove-Item "C:\FlashDB\src" -Recurse -Force
Copy-Item "C:\FlashDB-v1.x-backup\src" "C:\FlashDB\src" -Recurse

# 3. Restore data (if modified)
Remove-Item "E:\FlashDB\Data" -Recurse -Force
Copy-Item "E:\FlashDB-v1.x-backup\Data" "E:\FlashDB\Data" -Recurse

# 4. Start v1.x
Start-FlashdbService

# 5. Verify
Test-FlashdbConnection
Get-FlashdbStatus

# 6. Document incident
# Contact support with error logs
Get-FlashdbLog -Level "Error" | Export-Csv "rollback-errors.csv"
```

## Database Migration

### Metadata Migration

When upgrading versions, metadata may need migration:

```powershell
# Automatic migration (most cases)
Update-FlashdbMetadata -TargetVersion "1.1.0"

# Manual migration (if automatic fails)
Export-FlashdbMetadata -Version "1.0.0" -OutputPath "metadata-export.sql"
# ... manually adjust if needed ...
Import-FlashdbMetadata -SourcePath "metadata-export.sql" -Force
```

### Configuration Migration

Configuration format may change between versions:

```powershell
# v1.0.0 format:
{
  "storageLocation": "E:\\FlashDB",
  "port": 3001
}

# v1.1.0 format (backward compatible):
{
  "storage": {
    "location": "E:\\FlashDB",
    "compression": "enabled"
  },
  "api": {
    "port": 3001,
    "cors": {
      "origins": ["http://localhost:3000"]
    }
  }
}

# Automatic upgrade
Update-FlashdbConfiguration -TargetVersion "1.1.0"
```

## Downtime and Maintenance Windows

### Recommended Maintenance Windows

**For Minor Upgrades (1.x → 1.y):**
- Scheduled downtime: 0 minutes (zero-downtime upgrade)
- Maintenance window: 5-10 minutes
- Best time: Off-peak (e.g., 2 AM Sunday)

**For Major Upgrades (1.x → 2.0):**
- Scheduled downtime: 15-30 minutes
- Maintenance window: 30-60 minutes
- Best time: Off-peak (e.g., Sunday 2-3 AM)

**Notification Timeline:**
- 1 week before: Announce upgrade
- 3 days before: Detailed notice
- 1 day before: Final reminder
- At start: Notify all users

## Rollback Procedures

### Quick Rollback (v1.x → 1.y)

If minor upgrade fails:

```powershell
# 1. Stop services
Stop-FlashdbService -Force

# 2. Restore previous version
Copy-Item "C:\FlashDB-backup-v1.0.0\*" "C:\FlashDB" -Recurse -Force

# 3. Start services
Start-FlashdbService

# 4. Verify
Get-FlashdbStatus
```

### Complete Rollback (from backup)

If critical failure occurs:

```powershell
# 1. Stop services
Stop-FlashdbService -Force

# 2. Restore full backup
Restore-FlashdbBackup -BackupPath "\\backup\flashdb-pre-upgrade.bak" `
  -Force:$true

# 3. Verify integrity
Test-FlashdbIntegrity -Comprehensive

# 4. Start services
Start-FlashdbService
```

## Monitoring Post-Upgrade

### First 24 Hours

```powershell
# Check every 2 hours
$checkInterval = New-TimeSpan -Hours 2
$endTime = (Get-Date).AddHours(24)

while ((Get-Date) -lt $endTime) {
  Write-Host "$(Get-Date): Running health check..."
  
  $health = Get-FlashdbStatus
  $metrics = Get-FlashdbMetrics
  
  # Check for errors
  $errors = Get-FlashdbLog -Level "Error" -Since (Get-Date).AddMinutes(-15)
  
  if ($health.Overall -ne "Healthy") {
    Write-Error "Health check failed!"
    # Investigate or rollback
  }
  
  Start-Sleep -Seconds $checkInterval.TotalSeconds
}
```

### First Week

- Daily health checks
- Performance baseline comparison
- Error log review
- User feedback collection
- Metrics trending

## FAQ

**Q: Can I skip versions (1.0.0 → 1.2.0 directly)?**
A: Yes, all v1.x versions are forward compatible. You can upgrade directly to the latest 1.x version.

**Q: What if upgrade fails?**
A: Use the rollback procedure to restore from backup. Contact support if issues persist.

**Q: Will my clones and checkpoints survive an upgrade?**
A: Yes, all data is preserved. The upgrade only affects the FlashDB software itself.

**Q: How long does v2.0.0 upgrade take?**
A: Plan for 30-60 minutes total, with 15-30 minutes of downtime.

**Q: Can I have v1.0.0 and v2.0.0 running at the same time?**
A: Not recommended. Upgrade one instance at a time, or use separate servers.

**Q: What about my custom scripts and integrations?**
A: v1.x line maintains compatibility. For v2.0.0, review the migration guide and test thoroughly.

## Support

For issues during upgrade:

1. **Check logs**: `Get-FlashdbLog -Level "Error"`
2. **Review guide**: Reread relevant section
3. **Try rollback**: Execute rollback procedure
4. **Contact support**: Open GitHub issue with error logs

## Version Support

| Version | Released | Support Until | Status |
|---------|----------|----------------|--------|
| 1.0.0 | 2026-06-06 | 2027-06-06 | Current |
| 1.1.0 | Q3 2026 | Q3 2027 | Planned |
| 1.2.0 | Q4 2026 | Q4 2027 | Planned |
| 2.0.0 | 2027 | 2028 | Planned |

## Next Steps

After successful upgrade:

1. Test functionality with test clones
2. Monitor system for 24+ hours
3. Collect user feedback
4. Document any issues
5. Plan next maintenance window

---

For detailed upgrade information, see:
- CHANGELOG.md - Version history
- RELEASE_NOTES_v1.0.0.md - Features
- ADMINISTRATOR_GUIDE.md - Configuration
