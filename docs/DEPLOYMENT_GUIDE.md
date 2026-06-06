# FlashDB Deployment Guide

Step-by-step guide for deploying FlashDB with monitoring and logging.

## Quick Start

### 1. Prerequisites

```bash
# Check Node.js version
node --version  # Should be 16+

# Check PowerShell version
powershell -Command '$PSVersionTable.PSVersion'  # Should be 5.1+

# Verify Hyper-V is enabled (Windows)
powershell -Command 'Get-WindowsOptionalFeature -Online -FeatureName *hyper*'
```

### 2. Build API

```bash
cd src/api
npm install
npm run build
```

### 3. Configure Environment

```bash
# Create .env file
cat > src/api/.env << 'EOF'
NODE_ENV=production
PORT=3001
LOG_LEVEL=info
LOG_DIRECTORY=C:\flashdb\logs
LOG_MAX_AGE_DAYS=30
FLASHDB_MODULE_PATH=C:\flashdb\src\FlashDB\FlashDB.psm1
DATA_ROOT=C:\flashdb-data
DB_PATH=C:\flashdb-data\flashdb.db
CORS_ORIGIN=https://app.example.com
EOF
```

### 4. Initialize Logging

```powershell
# Import logging module
Import-Module 'C:\flashdb\src\FlashDB\Core\Logging.ps1'

# Initialize logging system
Initialize-FlashdbLogging

# Verify
Get-FlashdbLogStats
```

### 5. Start API

**Development:**
```bash
cd src/api
npm run dev
```

**Production:**
```bash
cd src/api
npm start
```

### 6. Verify Health

```bash
# Liveness check (quick)
curl http://localhost:3001/live

# Readiness check (dependencies)
curl http://localhost:3001/ready

# Full health check (all systems)
curl http://localhost:3001/health | jq '.'
```

---

## Production Deployment

### 1. Server Setup

**Windows Server 2022:**

```powershell
# Install required features
Install-WindowsFeature Hyper-V
Install-WindowsFeature RSAT-Hyper-V-Tools

# Install Node.js (via Chocolatey)
choco install nodejs

# Create data directory
New-Item -ItemType Directory -Path 'C:\flashdb-data' -Force
New-Item -ItemType Directory -Path 'C:\flashdb\logs' -Force

# Set permissions
icacls 'C:\flashdb-data' /grant:r "$($env:USERNAME):(OI)(CI)F" /T
icacls 'C:\flashdb\logs' /grant:r "$($env:USERNAME):(OI)(CI)F" /T
```

### 2. Install Monitoring Stack

**Option A: Docker Compose (Recommended)**

```yaml
# docker-compose.yml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - '9090:9090'
    volumes:
      - ./monitoring/prometheus-config.yml:/etc/prometheus/prometheus.yml
      - ./monitoring/alerts.yml:/etc/prometheus/alerts.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=15d'

  grafana:
    image: grafana/grafana:latest
    ports:
      - '3000:3000'
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=changeme
    volumes:
      - grafana_data:/var/lib/grafana
    depends_on:
      - prometheus

  alertmanager:
    image: prom/alertmanager:latest
    ports:
      - '9093:9093'
    volumes:
      - ./monitoring/alerts.yml:/etc/alertmanager/alertmanager.yml
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'

volumes:
  prometheus_data:
  grafana_data:
```

```bash
docker-compose up -d
```

**Option B: Windows Services**

```powershell
# Download Prometheus
$version = "2.45.0"
Invoke-WebRequest -Uri "https://github.com/prometheus/prometheus/releases/download/v$version/prometheus-$version.windows-amd64.zip" -OutFile prometheus.zip
Expand-Archive -Path prometheus.zip -DestinationPath 'C:\prometheus'

# Copy config
Copy-Item -Path 'monitoring/prometheus-config.yml' -Destination 'C:\prometheus\prometheus.yml'

# Create Windows Service
New-Service -Name Prometheus -BinaryPathName 'C:\prometheus\prometheus.exe --config.file=C:\prometheus\prometheus.yml' -StartupType Automatic
Start-Service -Name Prometheus

# Download Grafana
# ... (similar process)
```

### 3. SSL/TLS Configuration

**Generate Self-Signed Certificate (Development):**

```powershell
# Create certificate
$cert = New-SelfSignedCertificate -CertStoreLocation 'cert:\LocalMachine\My' -DnsName 'flashdb.local' -NotAfter (Get-Date).AddYears(1)
$thumbprint = $cert.Thumbprint

# Export to .pfx
Export-PfxCertificate -Cert "cert:\LocalMachine\My\$thumbprint" -FilePath 'C:\certificates\flashdb.pfx' -Password (ConvertTo-SecureString -String "password" -AsPlainText -Force)
```

**Use in Node.js:**

```typescript
import https from 'https';
import fs from 'fs';

const options = {
  key: fs.readFileSync('certificates/flashdb.key'),
  cert: fs.readFileSync('certificates/flashdb.crt')
};

https.createServer(options, app).listen(3001);
```

### 4. Process Management

**Option A: PM2 (Node.js Process Manager)**

```bash
# Install PM2 globally
npm install -g pm2

# Create ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'flashdb-api',
      script: 'src/api/dist/index.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        LOG_LEVEL: 'info'
      },
      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      log_file: 'logs/pm2.log',
      time: true,
      max_memory_restart: '1G',
      restart_delay: 4000,
      listen_timeout: 5000,
      kill_timeout: 5000
    }
  ]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js

# Monitor
pm2 monit

# Logs
pm2 logs flashdb-api
```

**Option B: Windows Task Scheduler**

```powershell
# Create scheduled task
$trigger = New-ScheduledTaskTrigger -AtStartup
$action = New-ScheduledTaskAction -Execute 'C:\Program Files\nodejs\node.exe' -Argument 'C:\flashdb\src\api\dist\index.js' -WorkingDirectory 'C:\flashdb\src\api'
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -Compatibility Win8 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName 'FlashDB-API' -Trigger $trigger -Action $action -Settings $settings -RunLevel Highest -User 'SYSTEM'

# Start service
Start-ScheduledTask -TaskName 'FlashDB-API'
```

### 5. Configure Firewall

```powershell
# Allow API port
New-NetFirewallRule -DisplayName 'FlashDB API' -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow

# Allow monitoring ports
New-NetFirewallRule -DisplayName 'Prometheus' -Direction Inbound -LocalPort 9090 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName 'Grafana' -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName 'Alertmanager' -Direction Inbound -LocalPort 9093 -Protocol TCP -Action Allow
```

### 6. Backup Configuration

```powershell
# Create daily backup task
$trigger = New-ScheduledTaskTrigger -Daily -At 2:00AM
$script = @'
Import-Module 'C:\flashdb\src\FlashDB\Core\Logging.ps1'

$backupPath = "C:\backups\$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

# Backup database
Copy-Item -Path 'C:\flashdb-data\flashdb.db' -Destination "$backupPath\flashdb.db" -Force

# Backup logs
Export-FlashdbLogs -OutputPath "$backupPath\logs.json" -DaysBack 7

# Compress
Compress-Archive -Path $backupPath -DestinationPath "$backupPath.zip"

# Upload to S3
# aws s3 cp "$backupPath.zip" s3://flashdb-backups/

Write-FlashdbLog -Level 'info' -Message 'Daily backup completed' -Operation 'backup'
'@

$action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -Command `"$script`""
Register-ScheduledTask -TaskName 'FlashDB-Backup' -Trigger $trigger -Action $action -RunLevel Highest -User 'SYSTEM'
```

---

## Post-Deployment Verification

### Health Checks

```bash
# All endpoints should return 2xx
curl http://localhost:3001/live        # 200
curl http://localhost:3001/ready       # 200
curl http://localhost:3001/health      # 200

# Verify each subsystem
curl http://localhost:3001/health | jq '.checks'
```

### Log Verification

```powershell
# Check logs are being written
Get-ChildItem 'C:\flashdb\logs' -Filter '*.log' | Select-Object Name, Length

# View recent logs
Get-FlashdbLogs -Count 10

# Check for errors
Get-FlashdbLogs -Level 'error' -Count 5
```

### Monitoring Setup

1. **Prometheus** http://localhost:9090
   - Go to Status → Targets
   - Verify "flashdb-api" shows "UP"

2. **Grafana** http://localhost:3000
   - Login with default credentials
   - Add Prometheus data source
   - Import dashboard

3. **Alertmanager** http://localhost:9093
   - Go to Alerts
   - Verify no critical alerts firing

---

## Troubleshooting Deployment

### API Won't Start

```powershell
# Check Node.js is installed
node --version

# Check port availability
netstat -ano | grep 3001

# Check logs for errors
cat 'C:\flashdb\logs\error-*.log' | tail -20

# Check environment variables
$env:NODE_ENV
$env:LOG_LEVEL
$env:FLASHDB_MODULE_PATH
```

### Logs Not Writing

```powershell
# Check directory permissions
Get-Acl 'C:\flashdb\logs'

# Check disk space
Get-Volume -DriveLetter C

# Manually test logging
Import-Module 'C:\flashdb\src\FlashDB\Core\Logging.ps1'
Write-FlashdbLog -Level 'info' -Message 'Test log'
```

### Monitoring Not Collecting

```bash
# Check Prometheus can reach API
curl http://localhost:3001/metrics

# Check Prometheus config
cat /etc/prometheus/prometheus.yml

# Check Prometheus logs
docker logs prometheus
```

### PowerShell Module Issues

```powershell
# Test module import
Import-Module 'C:\flashdb\src\FlashDB\FlashDB.psm1' -Verbose

# Check for syntax errors
Test-Path 'C:\flashdb\src\FlashDB\FlashDB.psm1'

# Get module info
Get-Module FlashDB -ListAvailable
```

---

## Next Steps

1. **Setup Monitoring Dashboards** - See `MONITORING_GUIDE.md`
2. **Configure Alerting** - Update `monitoring/alerts.yml` with your contact info
3. **Test Backup/Restore** - Follow procedures in `OPERATIONS_RUNBOOK.md`
4. **Schedule Regular Maintenance** - Use Windows Task Scheduler for automated tasks
5. **Plan Capacity** - Monitor metrics over time and plan scaling

---

*For support, contact: ops-team@company.com*
*Last Updated: 2025-06-06*
