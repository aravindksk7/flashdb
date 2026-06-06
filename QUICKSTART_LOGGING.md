# FlashDB Logging & Monitoring - Quick Start

**Goal**: Get logging and health checks working in 5 minutes.

---

## Prerequisites

- Node.js 16+ installed
- PowerShell 5.1+ installed
- Windows Server 2016+ (for full PowerShell features)

---

## Quick Start (5 Minutes)

### 1. Install Dependencies (2 min)

```bash
cd c:\flashdb\src\api
npm install
npm run build
```

### 2. Initialize Logging (1 min)

```powershell
Import-Module 'c:\flashdb\src\FlashDB\Core\Logging.ps1'
Initialize-FlashdbLogging
```

### 3. Start API (1 min)

```bash
cd c:\flashdb\src\api
npm start
```

Expected output:
```
============================================================
FlashDB API Started on http://localhost:3001
Environment: development
Log Level: info
FlashDB Module: C:\flashdb\src\FlashDB\FlashDB.psm1

Health Check Endpoints:
  /live    - Liveness probe (fast heartbeat)
  /ready   - Readiness probe (can serve traffic?)
  /health  - Deep health check (all systems status)

Monitoring Endpoints:
  /metrics                   - Prometheus metrics
  /api/metrics/performance   - Operation performance stats
  /api/docs                  - API documentation
============================================================
```

### 4. Test Health Endpoints (1 min)

```bash
# Quick check
curl http://localhost:3001/live

# Ready for traffic?
curl http://localhost:3001/ready

# Full health report
curl http://localhost:3001/health | jq '.'
```

### 5. View Logs (done!)

```powershell
# See recent logs
Get-FlashdbLogs -Count 10

# Filter by level
Get-FlashdbLogs -Level 'error'

# Find logs for specific operation
Get-FlashdbLogs -Operation 'create-clone'
```

---

## Common Commands

### View Logs

```powershell
# Last 20 logs
Get-FlashdbLogs -Count 20

# Only errors
Get-FlashdbLogs -Level 'error' -Count 50

# Specific operation
Get-FlashdbLogs -Operation 'search' -Count 20

# Export to file
Export-FlashdbLogs -OutputPath 'C:\backup\logs.json' -DaysBack 7
```

### Check Health

```bash
# All three in sequence
curl http://localhost:3001/live
curl http://localhost:3001/ready
curl http://localhost:3001/health
```

### Get Performance Stats

```bash
curl http://localhost:3001/api/metrics/performance | jq '.'
```

### Manage Logs

```powershell
# Get log statistics
Get-FlashdbLogStats

# Rotate logs manually
Invoke-LogRotation

# Write custom log (from PowerShell)
Write-FlashdbLog -Level 'info' -Message 'My operation' -Operation 'test' -Duration 100 -Result 'success'
```

---

## Log Files Location

All logs stored in: `C:\flashdb\logs\`

- **combined-YYYY-MM-DD.log** - All events
- **error-YYYY-MM-DD.log** - Errors only
- **warnings-YYYY-MM-DD.log** - Warnings only
- **performance-YYYY-MM-DD.log** - Timed operations

Rotate daily, kept for 30 days.

---

## Environment Variables

Optional customization:

```powershell
# Set custom log level
$env:LOG_LEVEL = 'debug'  # debug, info, warn, error, fatal

# Set custom port
$env:PORT = 3002

# Set environment
$env:NODE_ENV = 'production'

# Set log directory
$env:LOG_DIRECTORY = 'C:\custom\logs'
```

---

## Next Steps

1. **Setup Monitoring** → See `docs/DEPLOYMENT_GUIDE.md` for Prometheus/Grafana
2. **Configure Alerts** → See `docs/MONITORING_GUIDE.md` for alert setup
3. **Production Deploy** → See `docs/DEPLOYMENT_GUIDE.md` for production checklist
4. **Incident Response** → See `docs/OPERATIONS_RUNBOOK.md` for troubleshooting

---

## Troubleshooting

### Logs not appearing?

```powershell
# Check directory exists
Test-Path 'C:\flashdb\logs'

# Check permissions
Get-Acl 'C:\flashdb\logs'

# Check disk space
Get-Volume -DriveLetter C

# Manually write test log
Write-FlashdbLog -Level 'info' -Message 'Test' -Operation 'test'
```

### Health check failing?

```bash
# Check API is running
curl http://localhost:3001/live

# Check logs for errors
Get-FlashdbLogs -Level 'error' -Count 5
```

### Module import error?

```powershell
# Verify module path
Test-Path 'C:\flashdb\src\FlashDB\Core\Logging.ps1'

# Check PowerShell version
$PSVersionTable.PSVersion

# Try importing again
Import-Module 'C:\flashdb\src\FlashDB\Core\Logging.ps1' -Verbose
```

---

## Architecture Overview

```
API Requests
    ↓
Structured Logging Middleware
    ↓
JSON Log Files (daily rotation)
    ├─ combined.log (all events)
    ├─ error.log (errors)
    ├─ warnings.log (warnings)
    └─ performance.log (metrics)
    ↓
Health Check Endpoints
    ├─ /live (liveness)
    ├─ /ready (readiness)
    └─ /health (deep check)
    ↓
Prometheus Metrics
    ↓
Grafana Dashboards
    ↓
Alerts (Email/Slack/PagerDuty)
```

---

## Key Metrics

**Health Checks**:
- API responsiveness
- Filesystem access
- PowerShell integration
- Memory usage
- Disk space

**Performance Tracking**:
- Request rate
- Response times (P50, P95, P99)
- Error rates
- Operation duration

---

## Support

For detailed information:
- **Quick Reference**: `docs/LOGGING_MONITORING_README.md`
- **Deployment**: `docs/DEPLOYMENT_GUIDE.md`
- **Monitoring**: `docs/MONITORING_GUIDE.md`
- **Operations**: `docs/OPERATIONS_RUNBOOK.md`

For issues:
- Email: ops-team@company.com
- Check logs: `Get-FlashdbLogs -Level 'error'`

---

**That's it! You're ready to go.** 🚀

*For production deployment, see DEPLOYMENT_GUIDE.md*
