# FlashDB Operations Guide

**Version:** 1.0.0  
**Last Updated:** 2026-06-06

Complete operational guide for running and maintaining FlashDB in production.

---

## Table of Contents

1. [Startup Procedures](#startup-procedures)
2. [Shutdown Procedures](#shutdown-procedures)
3. [Health Checks](#health-checks)
4. [Metrics & Monitoring](#metrics--monitoring)
5. [Log Access & Analysis](#log-access--analysis)
6. [Common Issues & Troubleshooting](#common-issues--troubleshooting)
7. [Backup & Recovery](#backup--recovery)
8. [Performance Tuning](#performance-tuning)
9. [Support Contacts](#support-contacts)

---

## Startup Procedures

### Development Environment

**Quick Start:**
```bash
cd /c/flashdb/src/api
npm install
npm run build
npm run dev
```

**Expected Output:**
```
FlashDB API Started on http://localhost:3001
Environment: development
Log Level: info

Health Check Endpoints:
  /live    - Liveness probe (fast heartbeat)
  /ready   - Readiness probe (can serve traffic?)
  /health  - Deep health check (all systems status)
```

### Production Environment

#### Step 1: Verify Prerequisites
```powershell
# Check Node.js
node --version  # Should be 16 or higher

# Check PowerShell
powershell -Command '$PSVersionTable.PSVersion'  # Should be 5.1+

# Check disk space
Get-Volume -DriveLetter C | Select-Object SizeRemaining

# Check memory
Get-ComputerInfo -Property "CsPhyicallyInstalledMemory"
```

#### Step 2: Set Environment Variables
```powershell
$env:NODE_ENV = "production"
$env:PORT = "3001"
$env:LOG_LEVEL = "info"
$env:LOG_DIRECTORY = "C:\flashdb\logs"
$env:CORS_ORIGIN = "https://app.example.com"
$env:JWT_SECRET = "your-secret-key-min-32-chars"
```

#### Step 3: Build Application
```bash
cd src/api
npm install --production
npm run build
```

#### Step 4: Create Directories
```powershell
New-Item -ItemType Directory -Path 'C:\flashdb\logs' -Force
New-Item -ItemType Directory -Path 'C:\flashdb-data' -Force
```

#### Step 5: Start API Server
```bash
cd src/api
npm start
```

**Alternative: Windows Service**
```powershell
# Create service wrapper
$serviceParams = @{
    Name = 'FlashDBAPI'
    BinaryPathName = 'C:\nodejs\node.exe C:\flashdb\src\api\dist\index.js'
    DisplayName = 'FlashDB API Server'
    StartupType = 'Automatic'
}
New-Service @serviceParams

# Start service
Start-Service -Name FlashDBAPI

# Verify
Get-Service -Name FlashDBAPI
```

#### Step 6: Verify Startup
```bash
# Test health endpoint
curl http://localhost:3001/health

# Check logs
tail -f logs/combined.log
```

---

## Shutdown Procedures

### Graceful Shutdown (Recommended)

```bash
# Send SIGTERM signal (graceful shutdown)
kill -TERM <process-id>

# Or via PowerShell
Stop-Process -Name node -Force -PassThru
```

**What happens:**
1. HTTP server closes
2. Active requests complete
3. Task worker stops gracefully (5-second timeout)
4. Database connections close
5. State management persists to database
6. Logger transports close
7. Process exits with code 0

### Windows Service Shutdown
```powershell
# Stop the service
Stop-Service -Name FlashDBAPI

# Check status
Get-Service -Name FlashDBAPI

# Remove service (if needed)
Remove-Service -Name FlashDBAPI -Force
```

### Emergency Shutdown
```bash
# Kill immediately (may lose in-flight requests)
kill -9 <process-id>

# Or via PowerShell
Stop-Process -Name node -Force -PassThru
```

**Note:** Emergency shutdown may result in:
- Incomplete transactions
- In-memory queue loss
- Unrotated logs

---

## Health Checks

### Liveness Probe (Fast Heartbeat)
```bash
curl http://localhost:3001/live

# Response (200 OK)
{
  "status": "live",
  "timestamp": "2026-06-06T14:30:45.000Z"
}
```

**Use for:** Container orchestration (Docker, Kubernetes)  
**Frequency:** Every 10 seconds  
**Timeout:** 5 seconds

### Readiness Probe (Dependencies Check)
```bash
curl http://localhost:3001/ready

# Response (200 OK when ready)
{
  "ready": true,
  "components": {
    "database": "connected",
    "connectionPool": "initialized",
    "taskQueue": "running"
  }
}

# Response (503 Service Unavailable when not ready)
{
  "ready": false,
  "components": {
    "database": "connecting",
    "connectionPool": "initializing"
  }
}
```

**Use for:** Load balancer health checks  
**Frequency:** Every 30 seconds  
**Timeout:** 10 seconds

### Full Health Check (All Systems)
```bash
curl http://localhost:3001/health | jq '.'

# Response (comprehensive)
{
  "status": "healthy",
  "timestamp": "2026-06-06T14:30:45.000Z",
  "uptime": 3661.5,
  "environment": "production",
  "version": "1.0.0",
  "components": {
    "api": {
      "status": "healthy",
      "latency": 1.2
    },
    "database": {
      "status": "healthy",
      "connections": {
        "total": 10,
        "available": 8
      }
    },
    "connectionPool": {
      "status": "healthy",
      "poolSize": 10,
      "available": 8
    },
    "taskQueue": {
      "status": "healthy",
      "pending": 0,
      "completed": 145,
      "failed": 0
    },
    "stateManager": {
      "status": "initialized",
      "mode": "postgresql"
    },
    "lockManager": {
      "status": "healthy",
      "activeLocks": 0
    }
  }
}
```

**Use for:** Manual monitoring, alerting  
**Frequency:** Every 60 seconds  
**Timeout:** 15 seconds

---

## Metrics & Monitoring

### Performance Metrics Endpoint
```bash
curl http://localhost:3001/api/metrics/performance | jq '.'

# Response
{
  "timestamp": "2026-06-06T14:30:45.000Z",
  "metrics": {
    "get-clones": {
      "totalRequests": 245,
      "averageDuration": 42,
      "maxDuration": 1205,
      "minDuration": 12,
      "errorCount": 2,
      "errorRate": "0.82%"
    },
    "post-clones": {
      "totalRequests": 18,
      "averageDuration": 2150,
      "maxDuration": 5604,
      "minDuration": 1203,
      "errorCount": 0,
      "errorRate": "0.00%"
    }
  }
}
```

### Cache Metrics
```bash
curl http://localhost:3001/api/metrics/cache | jq '.'

# Response
{
  "timestamp": "2026-06-06T14:30:45.000Z",
  "cache": {
    "hits": 1240,
    "misses": 156,
    "hitRate": "88.80%",
    "size": 42,
    "items": 12
  }
}
```

### State Management Metrics
```bash
curl http://localhost:3001/api/metrics/state | jq '.'

# Response
{
  "timestamp": "2026-06-06T14:30:45.000Z",
  "stateManager": {
    "operations": 450,
    "syncEvents": 45,
    "pendingSync": 0
  },
  "lockManager": {
    "acquiredLocks": 150,
    "activeLocks": 3,
    "deadlocks": 0
  }
}
```

### Prometheus Metrics
```bash
curl http://localhost:3001/metrics

# Response (Prometheus format)
# HELP flashdb_api_up API is up
# TYPE flashdb_api_up gauge
flashdb_api_up 1
```

---

## Log Access & Analysis

### Log File Locations
```
C:\flashdb\logs\
├── combined.log        # All log entries (JSON)
├── error.log           # Error-level only (JSON)
├── exceptions.log      # Uncaught exceptions
└── rejections.log      # Unhandled rejections
```

### View Logs in Real-Time
```bash
# All logs
tail -f logs/combined.log

# Error logs only
tail -f logs/error.log

# Filter by operation
cat logs/combined.log | jq '.operation' | sort | uniq -c

# Filter by status code
cat logs/combined.log | jq 'select(.statusCode >= 400)'

# Filter by duration (slow requests > 1000ms)
cat logs/combined.log | jq 'select(.duration > 1000)'
```

### Parse JSON Logs
```bash
# Pretty print
cat logs/combined.log | jq '.'

# Extract specific field
cat logs/combined.log | jq '.message'

# Count log levels
cat logs/combined.log | jq '.level' | sort | uniq -c

# Find errors
cat logs/combined.log | jq 'select(.level == "error")'

# Calculate average duration
cat logs/combined.log | jq '.duration' | jq -s 'add/length'
```

### Log Rotation Status
```bash
# Check log sizes
ls -lh logs/

# Verify rotation is working
ls -la logs/*.log | head -20

# Check cleanup (14 days older logs removed)
find logs/ -type f -name "*.log" -mtime +14
```

### Log Configuration

#### Environment Variables
```env
# Log directory
LOG_DIRECTORY=C:\flashdb\logs

# Log level: error, warn, info, debug
LOG_LEVEL=info

# Rotation settings (in logger.ts)
LOG_MAX_SIZE=5242880    # 5MB per file
LOG_MAX_FILES=14        # 14-day retention
```

---

## Common Issues & Troubleshooting

### Issue: API Won't Start

**Symptom:**
```
Error: listen EADDRINUSE: address already in use :::3001
```

**Solution:**
```powershell
# Find process using port 3001
netstat -ano | findstr ":3001"

# Kill process
taskkill /PID <pid> /F

# Or change port
$env:PORT = "3002"
npm start
```

### Issue: High Memory Usage

**Symptom:**
```
Node.exe consuming > 2GB memory
```

**Diagnosis:**
```bash
# Check log size
ls -lh logs/

# Check for memory leaks in logs
grep -i "memory\|leak" logs/combined.log

# Monitor process
Get-Process -Name node | Select-Object -Property Name, WorkingSet | Format-Table -AutoSize
```

**Solution:**
```bash
# Restart service
Stop-Service -Name FlashDBAPI
Start-Service -Name FlashDBAPI

# Or check for large logs
ls -lh logs/ | sort -k5 -h
```

### Issue: Slow Requests

**Symptom:**
```json
{
  "message": "Slow request detected",
  "duration": 5000,
  "operation": "get-clones"
}
```

**Diagnosis:**
```bash
# Find slow operations
cat logs/combined.log | jq 'select(.duration > 2000)' | jq '.operation' | sort | uniq -c

# Check database performance
curl http://localhost:3001/api/metrics/performance | jq '.metrics | with_entries(select(.value.averageDuration > 1000))'

# Check for locks
curl http://localhost:3001/api/metrics/state | jq '.lockManager'
```

**Solutions:**
1. Add database indexes
2. Optimize queries
3. Increase pool size
4. Check network latency

### Issue: High Error Rate

**Symptom:**
```
Error rate: 5.2%
```

**Diagnosis:**
```bash
# Find error patterns
cat logs/error.log | jq '.message' | sort | uniq -c | sort -rn

# Find errors by operation
cat logs/error.log | jq '.operation' | sort | uniq -c

# Get error details
cat logs/error.log | jq 'select(.statusCode >= 500)' | head -10
```

**Solutions:**
1. Check database connectivity
2. Review recent code changes
3. Check rate limits
4. Verify configuration

### Issue: Rate Limiting Too Strict

**Symptom:**
```
429 Too Many Requests
```

**Solution:**
```powershell
# Increase rate limit in security.ts
# Default: 100 req/min per IP

# Or whitelist IP addresses
# See SECURITY_GUIDE.md for configuration
```

### Issue: Logs Not Rotating

**Symptom:**
```
combined.log grows to > 500MB
```

**Diagnosis:**
```bash
# Check log rotation settings
cat src/api/src/logger.ts | grep -A5 "maxsize"

# Verify cleanup function
cat src/api/src/logger.ts | grep -A10 "cleanOldLogs"
```

**Solution:**
```bash
# Manual cleanup
rm logs/combined.log.* logs/error.log.* 2>/dev/null

# Restart to force rotation
npm restart
```

### Issue: Database Connection Errors

**Symptom:**
```json
{
  "error": "connect ECONNREFUSED 127.0.0.1:5432",
  "level": "error"
}
```

**Diagnosis:**
```powershell
# Check PostgreSQL status
Get-Service -Name postgresql-*

# Verify connection string
$env:DATABASE_URL

# Test connection
psql -h localhost -U postgres -d flashdb -c "SELECT 1"
```

**Solution:**
1. Start PostgreSQL service
2. Verify connection string
3. Check firewall rules
4. Verify database exists

---

## Backup & Recovery

### Backup Strategies

#### Database Backup
```powershell
# PostgreSQL backup
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
pg_dump -h localhost -U postgres flashdb > "C:\backups\flashdb-$timestamp.sql"

# Schedule daily
$trigger = New-JobTrigger -Daily -At 2:00AM
Register-ScheduledJob -Name BackupFlashDB -Trigger $trigger -ScriptBlock {
  $timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
  pg_dump -h localhost -U postgres flashdb > "C:\backups\flashdb-$timestamp.sql"
}
```

#### Log Backup
```powershell
# Archive logs
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
Compress-Archive -Path "C:\flashdb\logs\*.log" -DestinationPath "C:\backups\logs-$timestamp.zip"

# Delete old archives
Get-ChildItem "C:\backups\logs-*.zip" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item
```

#### Data Directory Backup
```powershell
# Backup data directory
robocopy "C:\flashdb-data" "C:\backups\flashdb-data-$(Get-Date -Format yyyy-MM-dd)" /S /E

# Verify
dir "C:\backups\flashdb-data-*"
```

### Recovery Procedures

#### Database Recovery
```powershell
# Stop application
Stop-Service -Name FlashDBAPI

# Restore from backup
psql -h localhost -U postgres flashdb < "C:\backups\flashdb-2026-06-06-020000.sql"

# Restart application
Start-Service -Name FlashDBAPI

# Verify
curl http://localhost:3001/health
```

#### Data Directory Recovery
```powershell
# Stop application
Stop-Service -Name FlashDBAPI

# Restore data
robocopy "C:\backups\flashdb-data-2026-06-06" "C:\flashdb-data" /S /E /R:3 /W:10

# Restart
Start-Service -Name FlashDBAPI
```

---

## Performance Tuning

### Connection Pool Optimization
```env
# src/api/.env
CONNECTION_POOL_MIN=5
CONNECTION_POOL_MAX=20
CONNECTION_POOL_TIMEOUT=30000
CONNECTION_POOL_IDLE_TIMEOUT=60000
```

### Cache Optimization
```env
# Cache settings
CACHE_TTL=3600000        # 1 hour
CACHE_CHECK_PERIOD=600000 # 10 minutes
```

### Task Queue Optimization
```env
# Task queue settings
QUEUE_WORKERS=4
QUEUE_BATCH_SIZE=100
QUEUE_TIMEOUT=30000
```

### Database Connection Limits
```powershell
# Check current connections
psql -h localhost -U postgres -d flashdb -c "SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;"

# Increase max connections (PostgreSQL)
# Edit postgresql.conf: max_connections = 1000
```

---

## Support Contacts

### Development Team
- **Email:** dev-team@flashdb.example.com
- **Slack:** #flashdb-support
- **Office Hours:** 9 AM - 5 PM EST

### On-Call Support
- **Email:** oncall@flashdb.example.com
- **Phone:** +1-XXX-XXX-XXXX
- **Available:** 24/7

### Documentation
- **Internal Wiki:** https://wiki.flashdb.example.com
- **GitHub Repo:** https://github.com/flashdb/flashdb
- **Issue Tracker:** https://github.com/flashdb/flashdb/issues

### Emergency Procedures
- **Security Incident:** security@flashdb.example.com
- **Critical Outage:** oncall@flashdb.example.com + escalate to VP Engineering
- **Data Loss:** dev-team@flashdb.example.com + activate recovery procedures

---

## Appendix: Common Commands

```bash
# Start application
npm start

# Build
npm run build

# Run tests
npm test

# Check health
curl http://localhost:3001/health

# View logs
tail -f logs/combined.log

# Search logs
grep "ERROR" logs/combined.log

# Count errors
grep "ERROR" logs/combined.log | wc -l

# Performance metrics
curl http://localhost:3001/api/metrics/performance

# View service status
Get-Service -Name FlashDBAPI

# Restart service
Restart-Service -Name FlashDBAPI
```

---

**Last Updated:** 2026-06-06  
**Version:** 1.0.0
