# FlashDB Operations Runbook

Complete guide for operating, monitoring, and troubleshooting FlashDB in production.

## Table of Contents

1. [Deployment](#deployment)
2. [Health Checks](#health-checks)
3. [Monitoring](#monitoring)
4. [Backup & Recovery](#backup--recovery)
5. [Incident Response](#incident-response)
6. [Scaling](#scaling)
7. [Troubleshooting](#troubleshooting)
8. [Maintenance](#maintenance)

---

## Deployment

### Prerequisites

- Windows Server 2016+ or Windows 10/11
- PowerShell 5.1+
- Node.js 16+ (for API)
- Docker (optional, for containerized deployment)
- Hyper-V with VHDX support

### Installation Steps

#### 1. Clone Repository

```bash
git clone https://github.com/company/flashdb.git
cd flashdb
```

#### 2. Install Dependencies

**API dependencies:**
```bash
cd src/api
npm install
npm run build
```

**PowerShell modules:**
```powershell
# Import FlashDB module
Import-Module -Name 'C:\flashdb\src\FlashDB\FlashDB.psm1'

# Verify installation
Get-Command -Module FlashDB | Select-Object -First 5
```

#### 3. Environment Configuration

Create `.env` file in `src/api`:

```env
# Server
PORT=3001
NODE_ENV=production
LOG_LEVEL=info

# Paths
FLASHDB_MODULE_PATH=C:\flashdb\src\FlashDB\FlashDB.psm1
DATA_ROOT=C:\flashdb-data

# Database
DB_PATH=C:\flashdb-data\flashdb.db

# CORS
CORS_ORIGIN=https://app.example.com

# Logging
LOG_DIRECTORY=C:\flashdb\logs
LOG_MAX_AGE_DAYS=30
```

#### 4. Initialize Logging

```powershell
# From PowerShell
Import-Module -Name 'C:\flashdb\src\FlashDB\Core\Logging.ps1'
Initialize-FlashdbLogging -LogDirectory 'C:\flashdb\logs' -MaxLogAgeDays 30

# Verify
Get-FlashdbLogStats
```

#### 5. Start API Server

**Development:**
```bash
cd src/api
npm run dev
```

**Production:**
```bash
cd src/api
npm run build
npm start
```

### Systemd Integration (Linux) or Task Scheduler (Windows)

**Windows Task Scheduler:**

1. Open Task Scheduler
2. Create Basic Task → "FlashDB API"
3. Trigger: "At system startup"
4. Action: Start a program
   - Program: `C:\Program Files\nodejs\node.exe`
   - Arguments: `C:\flashdb\src\api\dist\index.js`
   - Start in: `C:\flashdb\src\api`
5. Set to run with highest privileges

---

## Health Checks

### Live Health Endpoint

Check API responsiveness:

```bash
curl http://localhost:3001/live
# Returns 200 with uptime
```

### Readiness Endpoint

Check if API is ready to serve traffic:

```bash
curl http://localhost:3001/ready
# Returns 200 if ready, 503 if not
```

### Deep Health Check

Full system health assessment:

```bash
curl http://localhost:3001/health
```

Response example:

```json
{
  "status": "healthy",
  "timestamp": "2025-06-06T10:30:45Z",
  "uptime": 86400,
  "checks": {
    "api": {
      "status": "healthy",
      "responseTime": 2,
      "details": {
        "message": "API responding normally"
      }
    },
    "filesystem": {
      "status": "healthy",
      "responseTime": 5,
      "details": {
        "logsDir": "C:\\flashdb\\logs",
        "accessible": true
      }
    },
    "powershell": {
      "status": "healthy",
      "responseTime": 150,
      "details": {
        "powershellVersion": "5.1.19041.1234",
        "moduleExists": true
      }
    },
    "memory": {
      "status": "healthy",
      "responseTime": 1,
      "details": {
        "heapUsedMB": 256,
        "heapTotalMB": 512,
        "heapUsagePercent": "50%"
      }
    },
    "disk": {
      "status": "healthy",
      "responseTime": 200,
      "details": {
        "drive": "C:",
        "freeSpaceGB": "50.5"
      }
    }
  },
  "version": "0.1.0",
  "environment": "production"
}
```

---

## Monitoring

### Key Metrics to Watch

| Metric | Threshold | Action |
|--------|-----------|--------|
| API Error Rate | > 5% | Page on-call |
| P95 Response Time | > 2s | Investigate |
| P99 Response Time | > 5s | Critical alert |
| Memory Usage | > 85% | Monitor closely |
| Disk Usage | > 90% | Plan expansion |
| Clone Creation Time | > 30s | Investigate |
| PowerShell Errors | > 10/5m | Check event logs |

### Prometheus Setup

#### 1. Install Prometheus

**Windows:**
```powershell
# Download latest release
$version = "2.45.0"
Invoke-WebRequest -Uri "https://github.com/prometheus/prometheus/releases/download/v$version/prometheus-$version.windows-amd64.zip" -OutFile prometheus.zip
Expand-Archive -Path prometheus.zip -DestinationPath C:\prometheus
```

**Docker:**
```bash
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v C:\flashdb\monitoring\prometheus-config.yml:/etc/prometheus/prometheus.yml \
  -v C:\flashdb\monitoring\alerts.yml:/etc/prometheus/alerts.yml \
  prom/prometheus
```

#### 2. Configure Prometheus

Copy `monitoring/prometheus-config.yml` to `/etc/prometheus/prometheus.yml`:

```yaml
global:
  scrape_interval: 30s
  evaluation_interval: 30s

scrape_configs:
  - job_name: 'flashdb-api'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
```

#### 3. Start Prometheus

```bash
./prometheus --config.file=prometheus.yml
```

Access at http://localhost:9090

### Grafana Dashboard Setup

#### 1. Install Grafana

**Windows:**
```powershell
# Download and run installer
Invoke-WebRequest -Uri "https://grafana.com/grafana/download" -OutFile grafana-installer.exe
.\grafana-installer.exe
```

#### 2. Add Prometheus Data Source

1. Login to Grafana (http://localhost:3000)
2. Settings → Data Sources
3. Add Prometheus
   - URL: http://localhost:9090
4. Save & Test

#### 3. Import Dashboard

1. Create → Import
2. Paste dashboard JSON or use ID `1860` (Prometheus Stats)
3. Configure panels for FlashDB metrics

### Key Queries

**Error rate:**
```promql
rate(flashdb_request_errors_total[5m])
```

**Response time P95:**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Memory usage:**
```promql
flashdb_process_memory_heap_used_bytes / flashdb_process_memory_heap_total_bytes
```

---

## Backup & Recovery

### Backup Strategy

- **Frequency:** Daily at 2 AM
- **Retention:** 30 days
- **Storage:** Network share and S3

### Manual Backup

#### 1. Backup Database

```powershell
# Export clone metadata
$backupPath = "C:\backups\$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $backupPath -Force

# Backup database
Copy-Item -Path "C:\flashdb-data\flashdb.db" -Destination "$backupPath\flashdb.db" -Force

# Backup VHD files
Copy-Item -Path "C:\flashdb-data\clones\*.vhdx" -Destination "$backupPath\clones\" -Recurse -Force
```

#### 2. Backup Logs

```powershell
# Export logs
Import-Module -Name 'C:\flashdb\src\FlashDB\Core\Logging.ps1'
Export-FlashdbLogs -OutputPath "$backupPath\logs.json" -DaysBack 7
```

#### 3. Compress and Upload

```powershell
# Compress backup
Compress-Archive -Path $backupPath -DestinationPath "$backupPath.zip"

# Upload to S3
aws s3 cp "$backupPath.zip" s3://flashdb-backups/
```

### Restore from Backup

#### 1. Verify Backup Integrity

```powershell
# Check backup exists and is readable
Test-Path -Path "C:\backups\backup-20250606-020000\flashdb.db"
```

#### 2. Stop API Service

```bash
# Stop Node.js process
Stop-Process -Name "node" -Force
```

#### 3. Restore Database

```powershell
# Stop any active PowerShell sessions using the module
Unload-Module FlashDB

# Restore from backup
Copy-Item -Path "C:\backups\backup-20250606-020000\flashdb.db" -Destination "C:\flashdb-data\flashdb.db" -Force

# Restore VHD files
Copy-Item -Path "C:\backups\backup-20250606-020000\clones\*.vhdx" -Destination "C:\flashdb-data\clones\" -Force -Recurse
```

#### 4. Restart API Service

```bash
cd src/api
npm start
```

#### 5. Verify Recovery

```bash
curl http://localhost:3001/health
```

### Automated Backup (Windows Task Scheduler)

```powershell
# Create scheduled task for daily backup
$trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument '-File C:\flashdb\scripts\backup.ps1'
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName 'FlashDB-Daily-Backup' -Trigger $trigger -Action $action -Settings $settings -User 'SYSTEM'
```

---

## Incident Response

### High Error Rate

**Alert:** `HighAPIErrorRate` (error rate > 5%)

**Steps:**

1. **Immediate Response:**
   ```bash
   # Check API logs
   tail -f logs/error-$(date +%Y-%m-%d).log
   
   # Check health status
   curl http://localhost:3001/health
   ```

2. **Identify Root Cause:**
   ```powershell
   # Check recent PowerShell operations
   Get-FlashdbLogs -Level 'error' -Count 50
   
   # Check Windows Event Viewer
   Get-EventLog -LogName Application -Source FlashDB -Newest 20
   ```

3. **Remediate:**
   - If DB connection issue: Restart database service
   - If PowerShell issue: Restart API and reimport module
   - If resource issue: Scale up or kill long-running operations

4. **Verify Recovery:**
   ```bash
   curl http://localhost:3001/health
   ```

### API Down

**Alert:** `APIHealthCheckFailing` (API unresponsive for 2+ min)

**Steps:**

1. **Verify Connectivity:**
   ```bash
   # Test endpoint
   curl -v http://localhost:3001/live
   
   # Check port listening
   netstat -ano | grep 3001
   ```

2. **Check Logs:**
   ```bash
   # Check last 100 error logs
   Get-Content logs/error-$(date +%Y-%m-%d).log | Select-Object -Last 100
   ```

3. **Restart Service:**
   ```bash
   # Stop process
   Stop-Process -Name node -Force
   
   # Clear temp files
   Remove-Item -Path "C:\flashdb\logs\*.tmp" -Force
   
   # Restart
   cd src/api && npm start
   ```

4. **If Still Down:**
   ```bash
   # Check for port conflicts
   Get-NetTCPConnection -LocalPort 3001 | Stop-Process
   
   # Restart with debug logging
   $env:LOG_LEVEL = 'debug'
   npm start
   ```

### High Memory Usage

**Alert:** `HighMemoryUsage` (heap > 85%)

**Steps:**

1. **Monitor Memory:**
   ```powershell
   # Get current memory usage
   [System.Diagnostics.Process]::GetCurrentProcess().WorkingSet / 1MB
   ```

2. **Identify Leaks:**
   ```bash
   # Check long-running operations
   curl http://localhost:3001/metrics | grep memory
   ```

3. **Remediate:**
   ```bash
   # Graceful restart (clears memory)
   kill -SIGTERM $(lsof -t -i:3001)
   # Wait 30 seconds
   cd src/api && npm start
   ```

4. **Investigate Root Cause:**
   - Check for inefficient queries
   - Review recent code changes
   - Analyze heap dumps

### Disk Space Critical

**Alert:** `CriticalDiskSpace` (< 5% free)

**Steps:**

1. **Check Usage:**
   ```powershell
   # Get disk usage
   Get-Volume -DriveLetter C | Select-Object SizeRemaining, Size
   
   # Find large files
   Get-ChildItem -Path 'C:\flashdb\logs' -Recurse -File | Sort-Object -Property Length -Descending | Select-Object -First 10
   ```

2. **Free Space Immediately:**
   ```powershell
   # Archive old logs
   Get-ChildItem -Path 'C:\flashdb\logs' -Filter '*.log' | Where-Object {$_.LastWriteTime -lt (Get-Date).AddDays(-7)} | Move-Item -Destination 'C:\backup-logs\' -Force
   
   # Clean temp files
   Remove-Item -Path 'C:\Windows\Temp\*' -Recurse -Force
   ```

3. **Plan Expansion:**
   - Extend C: drive partition
   - Add new data disk
   - Implement log cleanup policy

### Database Connection Lost

**Alert:** `DatabaseConnectionIssue`

**Steps:**

1. **Check Connection:**
   ```powershell
   # Test database file
   Test-Path 'C:\flashdb-data\flashdb.db'
   
   # Check file permissions
   Get-Acl 'C:\flashdb-data\flashdb.db'
   ```

2. **Check for Locks:**
   ```powershell
   # Find processes accessing database
   Get-Process | Where-Object { $_.Handles -gt 1000 }
   ```

3. **Reconnect:**
   ```bash
   # Restart API
   kill $(lsof -t -i:3001)
   cd src/api && npm start
   ```

### PowerShell Integration Errors

**Alert:** `PowerShellIntegrationDegraded`

**Steps:**

1. **Check Module:**
   ```powershell
   # Test module import
   Import-Module 'C:\flashdb\src\FlashDB\FlashDB.psm1' -ErrorAction Stop
   
   # Get version
   (Get-Module FlashDB).Version
   ```

2. **Check Dependencies:**
   ```powershell
   # Verify Hyper-V is installed
   Get-WindowsOptionalFeature -Online | Where-Object {$_.FeatureName -match 'Hyper-V'}
   
   # Test VHDX access
   Get-ChildItem 'C:\flashdb-data\clones' -Filter '*.vhdx'
   ```

3. **Restart Module:**
   ```powershell
   # Remove and reimport
   Remove-Module FlashDB -Force
   Import-Module 'C:\flashdb\src\FlashDB\FlashDB.psm1'
   ```

---

## Scaling

### Horizontal Scaling (Multiple Instances)

#### 1. Setup Load Balancer

**IIS (Windows):**

```powershell
# Add URL Rewrite for load balancing
Add-WindowsFeature Web-Http-Redirect
Add-WindowsFeature Web-Url-Rewrite

# Configure rewrite rule in web.config
```

**HAProxy (Linux):**

```
global
    maxconn 4096

defaults
    mode http
    timeout connect 5000ms
    timeout client 50000ms
    timeout server 50000ms

frontend flashdb_lb
    bind *:80
    default_backend flashdb_servers

backend flashdb_servers
    balance roundrobin
    server flashdb1 localhost:3001
    server flashdb2 localhost:3002
    server flashdb3 localhost:3003
```

#### 2. Scale API Servers

```bash
# Start additional instances on different ports
PORT=3002 npm start &
PORT=3003 npm start &
PORT=3004 npm start &
```

#### 3. Shared Data Directory

```powershell
# Mount network share for data
New-PSDrive -Name F -PSProvider FileSystem -Root "\\nas\flashdb-data" -Credential $credential -Persist

# Update .env for all instances
# DATA_ROOT=F:\flashdb-data
```

### Vertical Scaling (Single Larger Instance)

#### 1. Increase Resources

```powershell
# Add RAM to VM
# Stop VM → Edit settings → Increase memory → Start VM

# Add disk space
# Extend C: drive partition
```

#### 2. Update Node.js Settings

```bash
# Increase heap size
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

---

## Troubleshooting

### General Troubleshooting Checklist

1. **Check Logs:**
   ```bash
   tail -f logs/combined-$(date +%Y-%m-%d).log
   ```

2. **Check Health:**
   ```bash
   curl -s http://localhost:3001/health | jq '.'
   ```

3. **Check Metrics:**
   ```bash
   curl -s http://localhost:3001/metrics | head -20
   ```

4. **Check Resources:**
   ```powershell
   Get-Process -Name node | Select-Object CPU, Memory, ProcessName
   ```

### Common Issues

#### Clone Creation Hanging

**Symptoms:** Clone creation request times out

**Diagnosis:**
```powershell
# Check for hung PowerShell processes
Get-Process powershell | Select-Object Id, Name, CPU, Memory

# Check for stuck VHDX files
Get-ChildItem 'C:\flashdb-data\clones' -Filter '*.vhdx' | Get-Item -Stream *
```

**Solution:**
```powershell
# Kill hung PowerShell process
Stop-Process -Id <pid> -Force

# Restart API
# Clean up incomplete VHDXs
Remove-Item 'C:\flashdb-data\clones\*.tmp' -Force
```

#### Search Queries Slow

**Symptoms:** Search requests take > 5 seconds

**Diagnosis:**
```powershell
# Check database size
(Get-Item 'C:\flashdb-data\flashdb.db').Length / 1MB

# Count records
# Query database directly
```

**Solution:**
```powershell
# Rebuild search index
Import-Module FlashDB
Invoke-SearchIndexRebuild

# Monitor performance
Get-FlashdbLogs -Operation 'search' | Measure-Object -Property Duration -Average
```

#### API Memory Leak

**Symptoms:** Memory usage grows over time

**Diagnosis:**
```bash
# Monitor memory over time
watch -n 5 'curl -s http://localhost:3001/health | jq ".checks.memory"'
```

**Solution:**
```bash
# Implement periodic restart
# Schedule graceful shutdown every 24 hours
# Investigate code changes from past 7 days
```

---

## Maintenance

### Daily Tasks

- Monitor Prometheus dashboard
- Check alert notifications
- Review error logs
- Verify backup completion

### Weekly Tasks

- Review performance metrics
- Check disk usage trends
- Test backup/restore procedure
- Update security patches

### Monthly Tasks

- Analyze operation metrics
- Plan capacity upgrades
- Review and update runbooks
- Conduct disaster recovery drill

### Annual Tasks

- Full security audit
- Database optimization
- Update disaster recovery plan
- Staff training and certification

### Logging Cleanup

```powershell
# Manual cleanup
Import-Module FlashDB
Invoke-LogRotation

# Check log statistics
Get-FlashdbLogStats

# Archive old logs
Export-FlashdbLogs -OutputPath 'C:\backups\archive-$(Get-Date -Format yyyyMM).json' -DaysBack 30
```

---

## Emergency Contacts

| Role | Contact | Phone |
|------|---------|-------|
| On-Call Engineer | ops-team@company.com | +1-555-0100 |
| Engineering Manager | manager@company.com | +1-555-0101 |
| VP Engineering | vp@company.com | +1-555-0102 |

## Appendix: Useful Commands

```bash
# Check API status
curl http://localhost:3001/health

# View live logs
tail -f logs/combined-$(date +%Y-%m-%d).log

# Search logs
grep "error" logs/*.log | head -20

# Get metrics
curl http://localhost:3001/metrics

# Restart service
kill $(lsof -t -i:3001) && sleep 2 && npm start
```

---

*Last Updated: 2025-06-06*
*Version: 1.0*
*Owner: Infrastructure Team*
