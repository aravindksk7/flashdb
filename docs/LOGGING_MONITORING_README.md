# FlashDB Logging & Monitoring Setup

Complete reference for the production logging and monitoring infrastructure implemented in Sprint 3.

## Overview

FlashDB now includes:
- **Structured JSON Logging** - All events logged in machine-readable format
- **Health Checks** - Comprehensive system health assessment
- **Prometheus Metrics** - Integration-ready metrics collection
- **Grafana Dashboards** - Real-time visualization templates
- **Alert Rules** - Automated alerting for critical conditions
- **Log Rotation** - Automatic cleanup with 30-day retention
- **Operational Runbooks** - Procedures for incident response and maintenance

## Files Created

### Logging

| File | Purpose | Size |
|------|---------|------|
| `src/api/src/middleware/logging.ts` | Structured logging middleware | 280 lines |
| `src/FlashDB/Core/Logging.ps1` | PowerShell logging module | 320 lines |

### Health Checks

| File | Purpose | Size |
|------|---------|------|
| `src/api/src/middleware/healthcheck.ts` | Deep health check endpoints | 350 lines |

### Monitoring Configuration

| File | Purpose | Size |
|------|---------|------|
| `monitoring/prometheus-config.yml` | Prometheus scrape config | 150 lines |
| `monitoring/alerts.yml` | Alert rules and routing | 300 lines |

### Documentation

| File | Purpose | Size |
|------|---------|------|
| `docs/OPERATIONS_RUNBOOK.md` | Incident response & ops procedures | 800 lines |
| `docs/MONITORING_GUIDE.md` | Monitoring setup & metrics guide | 400 lines |
| `docs/DEPLOYMENT_GUIDE.md` | Production deployment procedures | 350 lines |

## Quick Start

### 1. Install Dependencies

```bash
cd src/api
npm install  # Includes uuid package
npm run build
```

### 2. Initialize Logging

```powershell
Import-Module 'C:\flashdb\src\FlashDB\Core\Logging.ps1'
Initialize-FlashdbLogging
```

### 3. Start API with Logging

```bash
cd src/api
npm start
```

### 4. Verify Health Endpoints

```bash
# Liveness (fast heartbeat)
curl http://localhost:3001/live

# Readiness (can serve traffic?)
curl http://localhost:3001/ready

# Deep health check (all systems)
curl http://localhost:3001/health
```

### 5. View Logs

```powershell
# Get recent logs
Get-FlashdbLogs -Count 20

# Filter by level
Get-FlashdbLogs -Level 'error' -Count 10

# Filter by operation
Get-FlashdbLogs -Operation 'create-clone' -Count 5
```

## Logging Features

### Structured JSON Format

Every log entry includes:
- `timestamp` - ISO 8601 format
- `level` - debug, info, warn, error, fatal
- `service` - flashdb-api or flashdb-core
- `message` - Human-readable message
- `requestId` - UUID for request tracing
- `operation` - Operation name for metrics
- `duration` - Operation duration in ms
- `result` - success, error, warning, in-progress
- `data` - Contextual information (hashtable)
- `error` - Error details if applicable

### Automatic Redaction

Sensitive fields are automatically masked:
- `password` → `[REDACTED]`
- `token` → `[REDACTED]`
- `secret` → `[REDACTED]`
- `api_key` → `[REDACTED]`
- Any field matching `auth*` → `[REDACTED]`

### Log Files

- **Combined Log**: `logs/combined-YYYY-MM-DD.log` (all events)
- **Error Log**: `logs/error-YYYY-MM-DD.log` (errors only)
- **Warning Log**: `logs/warnings-YYYY-MM-DD.log` (warnings only)
- **Performance Log**: `logs/performance-YYYY-MM-DD.log` (timed operations)

### Log Rotation

- Daily log rotation (separate file per day)
- 30-day retention (configurable)
- Automatic cleanup of old logs
- Archive capability for long-term storage

## Health Check Endpoints

### GET /live
**Liveness Probe** - Quick heartbeat check

```bash
curl http://localhost:3001/live
```

Response:
```json
{
  "status": "alive",
  "timestamp": "2025-06-06T10:30:45Z",
  "uptime": 3600
}
```

### GET /ready
**Readiness Probe** - Can service accept traffic?

```bash
curl http://localhost:3001/ready
```

Response:
```json
{
  "ready": true,
  "timestamp": "2025-06-06T10:30:45Z",
  "checks": {
    "api": "healthy",
    "filesystem": "healthy"
  }
}
```

### GET /health
**Deep Health Check** - All systems status

```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2025-06-06T10:30:45Z",
  "uptime": 3600,
  "checks": {
    "api": {
      "status": "healthy",
      "responseTime": 2
    },
    "filesystem": {
      "status": "healthy",
      "responseTime": 5
    },
    "powershell": {
      "status": "healthy",
      "responseTime": 150
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

## Monitoring Setup

### Prometheus Installation

**Docker (Recommended):**
```bash
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/monitoring/prometheus-config.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus
```

**Windows (Standalone):**
```powershell
# Download
Invoke-WebRequest -Uri "https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.windows-amd64.zip" -OutFile prometheus.zip

# Extract and run
.\prometheus.exe --config.file=monitoring/prometheus-config.yml
```

Access at: http://localhost:9090

### Grafana Installation

**Docker:**
```bash
docker run -d \
  --name grafana \
  -p 3000:3000 \
  grafana/grafana
```

**Windows:**
Download from https://grafana.com/grafana/download

Access at: http://localhost:3000 (default: admin/admin)

### Key Metrics to Monitor

```promql
# Error rate
rate(http_requests_total{status=~"5.."}[5m])

# Response time (P95)
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Memory usage
process_resident_memory_bytes / 1024 / 1024

# Clone creation duration
histogram_quantile(0.95, rate(operation_duration_seconds_bucket{operation="create-clone"}[5m]))

# Request rate
rate(http_requests_total[5m])
```

## Alert Configuration

### Alert Rules File

Location: `monitoring/alerts.yml`

Includes rules for:
- **Critical**: API down, high error rate, SLO violations, out of memory, disk critical
- **Warning**: Slow responses, high memory, low disk space, PowerShell errors
- **Info**: Deployment events, backups, scaling events

### Alert Routing

Alerts are routed to:
- **Critical** → PagerDuty + Email (immediate)
- **Warning** → Slack + Email (30 min digest)
- **SLO Violations** → Engineering lead (1 hour)

### Configure Alert Notifications

Edit `monitoring/alerts.yml`:

```yaml
receivers:
  - name: 'critical'
    # Add your email
    email_configs:
      - to: 'your-email@company.com'
        from: 'alerts@company.com'
        smarthost: 'smtp.company.com:587'
        auth_username: 'alerts@company.com'
        auth_password: '${SMTP_PASSWORD}'
    
    # Add PagerDuty
    pagerduty_configs:
      - service_key: '${PAGERDUTY_KEY}'
    
    # Add Slack
    slack_configs:
      - api_url: '${SLACK_WEBHOOK_URL}'
        channel: '#flashdb-alerts'
```

## PowerShell Logging Module

### Usage Examples

```powershell
Import-Module 'C:\flashdb\src\FlashDB\Core\Logging.ps1'

# Log info
Write-FlashdbLog -Level 'info' -Message 'Clone created' -Operation 'create-clone' -Duration 1234 -Result 'success'

# Log error
Write-FlashdbLog -Level 'error' -Message 'Clone failed' -ErrorDetails $_ -RequestId 'abc-123'

# Get statistics
Get-FlashdbLogStats

# View recent logs
Get-FlashdbLogs -Count 50

# Filter by level
Get-FlashdbLogs -Level 'error' -Count 10

# Filter by operation
Get-FlashdbLogs -Operation 'create-clone' -Count 20

# Export logs
Export-FlashdbLogs -OutputPath 'C:\backup\logs.json' -DaysBack 7 -Format 'json'

# Rotate logs
Invoke-LogRotation
```

## Performance Metrics Endpoint

Get operation-level performance stats:

```bash
curl http://localhost:3001/api/metrics/performance
```

Response:
```json
{
  "timestamp": "2025-06-06T10:30:45Z",
  "metrics": {
    "get-golden-images": {
      "totalRequests": 150,
      "averageDuration": 45,
      "maxDuration": 250,
      "minDuration": 12,
      "errorCount": 0,
      "errorRate": "0.00%"
    },
    "create-clone": {
      "totalRequests": 45,
      "averageDuration": 12340,
      "maxDuration": 45000,
      "minDuration": 5000,
      "errorCount": 2,
      "errorRate": "4.44%"
    }
  }
}
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
# .github/workflows/healthcheck.yml
name: Health Check

on:
  schedule:
    - cron: '*/5 * * * *'

jobs:
  healthcheck:
    runs-on: ubuntu-latest
    steps:
      - name: Check API Health
        run: |
          curl -f http://${{ secrets.API_HOST }}:3001/health || exit 1
          
      - name: Alert on Failure
        if: failure()
        run: |
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
            -H 'Content-Type: application/json' \
            -d '{"text":"FlashDB Health Check Failed"}'
```

## Troubleshooting

### Logs Not Appearing

1. Check permissions:
   ```powershell
   Get-Acl 'C:\flashdb\logs'
   ```

2. Check disk space:
   ```powershell
   Get-Volume -DriveLetter C
   ```

3. Verify log directory exists:
   ```powershell
   Test-Path 'C:\flashdb\logs'
   ```

### Health Check Failing

1. Check API is running:
   ```bash
   curl http://localhost:3001/live
   ```

2. Check PowerShell module:
   ```powershell
   Import-Module 'C:\flashdb\src\FlashDB\FlashDB.psm1' -Verbose
   ```

3. Check file system access:
   ```powershell
   Test-Path 'C:\flashdb-data'
   ```

### Metrics Not Scraping

1. Verify Prometheus can reach API:
   ```bash
   curl http://localhost:3001/metrics
   ```

2. Check Prometheus config:
   ```bash
   cat monitoring/prometheus-config.yml
   ```

3. Check Prometheus logs:
   ```bash
   docker logs prometheus  # if using Docker
   ```

## Best Practices

1. **Regular Log Review** - Check error logs daily
2. **Monitor Trends** - Use Grafana to spot degradation
3. **Backup Logs** - Archive logs regularly
4. **Test Alerts** - Verify alert routing works
5. **Update Runbooks** - Keep procedures current
6. **Scale Proactively** - Monitor capacity trends
7. **Document Changes** - Log all manual interventions

## Related Documentation

- **Operations Runbook** - `docs/OPERATIONS_RUNBOOK.md` - Incident response procedures
- **Monitoring Guide** - `docs/MONITORING_GUIDE.md` - Metrics and dashboard setup
- **Deployment Guide** - `docs/DEPLOYMENT_GUIDE.md` - Production deployment steps
- **API Specification** - `docs/API_SPECIFICATION.md` - API endpoints

## Support

For issues or questions:
- Email: ops-team@company.com
- Slack: #flashdb-ops
- On-Call: See OPERATIONS_RUNBOOK.md

---

*Implementation Date: 2025-06-06*
*Sprint: 3 (Weeks 5-6)*
*Status: Complete ✓*
