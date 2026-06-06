# FlashDB Monitoring Guide

Complete guide to monitoring, alerting, and observability for FlashDB.

## Table of Contents

1. [Monitoring Architecture](#monitoring-architecture)
2. [Key Metrics](#key-metrics)
3. [Alert Thresholds](#alert-thresholds)
4. [Dashboard Setup](#dashboard-setup)
5. [Log Analysis](#log-analysis)
6. [SLO & Error Budgets](#slo--error-budgets)
7. [Troubleshooting Monitoring](#troubleshooting-monitoring)

---

## Monitoring Architecture

### Components

```
┌─────────────┐
│  FlashDB    │
│  API Server │  Emits metrics, logs, traces
└─────┬───────┘
      │
      ├──→ Prometheus (Metrics)
      ├──→ Log Files (Structured JSON)
      └──→ Health Check Endpoint
            │
            ├──→ Grafana (Visualization)
            ├──→ Alertmanager (Alerting)
            └──→ ELK Stack (Log Analysis)
```

### Data Flow

1. **API generates events** → Structured JSON logs
2. **Logs written to disk** → Daily rotation
3. **Prometheus scrapes metrics** → Every 30 seconds
4. **Grafana visualizes** → Real-time dashboards
5. **Alerts evaluated** → Every 30 seconds
6. **Notifications sent** → Email, Slack, PagerDuty

---

## Key Metrics

### API Performance Metrics

#### Request Rate

**Query:**
```promql
rate(http_requests_total[5m])
```

**What to watch:**
- Normal baseline for your service
- Sudden spikes indicate traffic surge or issue
- Gradual increase suggests organic growth

**Target:** Monitor trends, no fixed threshold

#### Error Rate

**Query:**
```promql
rate(http_requests_total{status=~"5.."}[5m])
```

**Alert Threshold:** > 5% of requests (critical)

**What to do:**
- Check recent deployments
- Review error logs for patterns
- Check dependency health (database, PowerShell)

#### Response Time (P95)

**Query:**
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Alert Threshold:** > 2 seconds (warning)

**What to do:**
- Identify slow endpoints using request path
- Check database query performance
- Analyze PowerShell operation duration

#### Response Time (P99)

**Query:**
```promql
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))
```

**Alert Threshold:** > 5 seconds (critical - SLO violation)

**What to do:**
- Immediate investigation
- Check for resource constraints
- Consider scaling

### Resource Metrics

#### Memory Usage

**Query:**
```promql
process_resident_memory_bytes / 1024 / 1024
```

**Alert Thresholds:**
- Yellow: > 512 MB (warning)
- Red: > 900 MB (critical)

**What to watch:**
- Gradual increase over time (potential leak)
- Sudden spikes (inefficient operation)

#### Heap Usage Percentage

**Query:**
```promql
process_resident_memory_bytes / nodejs_heap_size_limit_bytes * 100
```

**Alert Thresholds:**
- Yellow: > 75% (warning)
- Red: > 90% (critical)

**Response:**
- Monitor closely at 75%+
- Plan graceful restart at 85%+
- Immediate remediation at 90%+

#### Disk Usage

**Query:**
```promql
disk_used_bytes / disk_total_bytes * 100
```

**Alert Thresholds:**
- Yellow: > 80% used (10 GB free) - warning
- Red: > 95% used (< 5% free) - critical

**What to do:**
- Archive old logs
- Clean temporary files
- Plan disk expansion

### Operation Metrics

#### Clone Creation Duration

**Query:**
```promql
histogram_quantile(0.95, rate(operation_duration_seconds_bucket{operation="create-clone"}[5m]))
```

**Alert Threshold:** > 30 seconds (warning)

**What to watch:**
- Baseline duration for your infrastructure
- Degradation over time
- Variations by golden image size

#### Clone Creation Count

**Query:**
```promql
rate(clones_created_total[1h])
```

**What to watch:**
- Daily/weekly patterns
- Anomalies that might indicate issues
- Capacity planning

#### Clone Failure Rate

**Query:**
```promql
rate(clone_failures_total[5m])
```

**Alert Threshold:** > 0 (any failures warrant investigation)

**What to do:**
- Check PowerShell logs
- Verify VHDX file integrity
- Check disk space

#### Search Performance

**Query:**
```promql
histogram_quantile(0.95, rate(search_duration_seconds_bucket[5m]))
```

**Alert Threshold:** > 5 seconds (warning)

**What to watch:**
- Index health
- Query complexity
- Database size

### System Metrics

#### PowerShell Integration Health

**Query:**
```promql
rate(powershell_operation_errors_total[5m])
```

**Alert Threshold:** > 0.5 errors/sec (warning)

**What to do:**
- Check PowerShell event log
- Verify Hyper-V availability
- Restart API to reimport module

#### Database Connection Pool

**Query:**
```promql
db_connection_pool_available
```

**Alert Threshold:** < 2 available connections

**What to watch:**
- Pool exhaustion indicates high load or leak
- Correlation with error rate

#### Log Volume

**Query:**
```promql
rate(log_entries_total[5m])
```

**What to watch:**
- Normal logging baseline
- Spike indicates increased activity or errors
- Helps debug issues

---

## Alert Thresholds

### Critical Alerts (Page on-call immediately)

| Alert | Threshold | Response Time |
|-------|-----------|---|
| API Down | No response for 2+ min | < 5 min |
| High Error Rate | > 5% for 5 min | < 10 min |
| P99 Response Time SLO | > 5s for 10 min | < 15 min |
| Out of Memory | Heap > 95% | < 10 min |
| Database Down | Connection failures | < 5 min |
| Critical Disk Space | < 5% free | < 30 min |

### Warning Alerts (Send to Slack/Email)

| Alert | Threshold | Response Time |
|-------|-----------|---|
| Slow Response | P95 > 2s for 5 min | < 30 min |
| High Memory | Heap > 85% for 5 min | < 1 hour |
| Low Disk Space | < 10% free for 5 min | < 2 hours |
| Slow Clone Creation | > 30s for 5 min | < 1 hour |
| High Log Volume | > 100 errors/min | < 30 min |
| PowerShell Errors | > 5 errors/min | < 1 hour |

### Info Alerts (Logged, not notified)

- Deployment events
- Backup completion
- Scale events
- Daily statistics

---

## Dashboard Setup

### Grafana Dashboard Template

```json
{
  "dashboard": {
    "title": "FlashDB Operations",
    "panels": [
      {
        "title": "Request Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])"
          }
        ]
      },
      {
        "title": "Error Rate",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m])"
          }
        ]
      },
      {
        "title": "Response Time (P95)",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))"
          }
        ]
      },
      {
        "title": "Memory Usage",
        "targets": [
          {
            "expr": "process_resident_memory_bytes / 1024 / 1024"
          }
        ]
      }
    ]
  }
}
```

### Dashboard Panels

#### 1. Overview Panel (Top)

Shows current status and key metrics:
- API Status (green/yellow/red)
- Error Rate (%)
- Avg Response Time (ms)
- Memory Usage (%)
- Uptime (hours)

#### 2. Request Metrics

**4 graphs:**
- Request Rate (requests/sec) - line graph
- Error Rate (%) - area graph with warning threshold
- Response Time Distribution (P50/P95/P99) - line graph
- Request Volume by Endpoint - stacked bar

#### 3. Resource Utilization

**4 graphs:**
- Memory Usage (MB) - line graph with threshold lines
- Memory Usage % - gauge with green/yellow/red zones
- Disk Usage (%) - gauge
- CPU Usage (%) - line graph

#### 4. Operation Performance

**4 graphs:**
- Clone Creation Duration (P50/P95) - line graph
- Clone Success Rate (%) - area graph
- Search Performance (P95 duration) - line graph
- Operation Count by Type - bar graph

#### 5. System Health

**Indicators:**
- PowerShell Integration Status - green/yellow/red
- Database Connection Pool Available - number
- Log Error Rate - number
- Last Backup Time - text

### Dashboard Setup Steps

1. **Access Grafana**
   ```
   http://localhost:3000
   ```

2. **Add Prometheus Data Source**
   - Settings → Data Sources
   - Add Prometheus
   - URL: http://localhost:9090

3. **Create Dashboard**
   - Click "+" → Dashboard
   - Add panels using queries above

4. **Set Refresh Rate**
   - Top right: Change to "5s" or "10s"

5. **Save and Share**
   - Save dashboard as "FlashDB Operations"
   - Set to public for team access

---

## Log Analysis

### Log Format

All logs are JSON format with these fields:

```json
{
  "timestamp": "2025-06-06T10:30:45Z",
  "level": "info|warn|error|fatal|debug",
  "service": "flashdb-api",
  "message": "Human readable message",
  "requestId": "uuid",
  "operation": "create-clone",
  "duration": 1234,
  "result": "success|error|warning",
  "data": {
    "cloneId": "clone-123",
    "size": 1024
  },
  "error": {
    "message": "Error message",
    "type": "ErrorType",
    "code": -2147024891,
    "stackTrace": "..."
  }
}
```

### Analyzing Logs

#### Search for Errors

**PowerShell logs:**
```powershell
Get-FlashdbLogs -Level 'error' -Count 100
```

**File-based:**
```bash
cat logs/error-$(date +%Y-%m-%d).log | jq 'select(.level == "error")'
```

#### Filter by Operation

```bash
cat logs/combined-$(date +%Y-%m-%d).log | jq 'select(.operation == "create-clone")'
```

#### Calculate Average Duration

```bash
cat logs/combined-$(date +%Y-%m-%d).log | \
  jq 'select(.operation == "create-clone") | .duration' | \
  jq -s 'add / length'
```

#### Find Slow Operations

```bash
cat logs/combined-$(date +%Y-%m-%d).log | \
  jq 'select(.duration > 5000)' | \
  sort_by(.duration) | \
  reverse | \
  .[0:10]
```

### ELK Stack Setup (Optional)

#### Install Logstash

```bash
# Download and extract
wget https://artifacts.elastic.co/downloads/logstash/logstash-8.0.0.tar.gz
tar -xzf logstash-8.0.0.tar.gz
```

#### Configure Logstash Pipeline

Create `logstash.conf`:

```
input {
  file {
    path => "/var/log/flashdb/combined-*.log"
    start_position => "beginning"
    codec => json
  }
}

filter {
  # Parse JSON automatically
}

output {
  elasticsearch {
    hosts => ["localhost:9200"]
    index => "flashdb-%{+YYYY.MM.dd}"
  }
}
```

#### Index Log Data

```bash
./bin/logstash -f logstash.conf
```

#### Query in Kibana

Open http://localhost:5601 and create index pattern `flashdb-*`

---

## SLO & Error Budgets

### Service Level Objectives

| SLO | Target | Window |
|-----|--------|--------|
| Availability | 99.9% | Monthly |
| Error Rate | < 0.1% | Rolling 5min |
| Response Time P99 | < 5 seconds | Rolling 5min |
| Clone Creation | < 30s P95 | Daily |

### Error Budget Calculation

**Monthly Error Budget:**
- Target: 99.9% uptime
- Allowed downtime: 0.1% × 43,200 min = 43.2 minutes/month
- Already used: (incidents) × (duration)
- Remaining: Budget - Used

**Example:**
```
Target: 99.9%
Allowed: 43.2 min/month
Used: 15 min (1 incident)
Remaining: 28.2 min (65% budget)
```

### Tracking Error Budget

1. **Monthly Review Meeting:**
   - Analyze incidents
   - Calculate error budget consumption
   - Plan improvements

2. **Dashboard Widget:**
   - Display % error budget remaining
   - Alert when < 20% remains
   - Show trend over time

3. **Adjustment Policy:**
   - If > 50% used: Reduce features/risk
   - If < 10% left: Minimal changes, focus on stability
   - At 0%: Freeze features, full stability focus

---

## Troubleshooting Monitoring

### Metrics Not Appearing

1. **Check Prometheus Scrape:**
   ```bash
   curl http://localhost:9090/api/v1/scrape_configs
   ```

2. **Check Target Health:**
   ```
   http://localhost:9090/targets
   ```

3. **Verify Endpoint:**
   ```bash
   curl http://localhost:3001/metrics
   ```

### Alerts Not Firing

1. **Check Alertmanager:**
   ```bash
   curl http://localhost:9093/api/v1/alerts
   ```

2. **Check Rules Syntax:**
   ```bash
   promtool check rules /etc/prometheus/alerts.yml
   ```

3. **Test Alert Query:**
   ```
   http://localhost:9090/graph
   # Paste alert expression
   # Check if it returns values
   ```

### Logs Not Appearing

1. **Check File Permissions:**
   ```powershell
   Get-Acl 'C:\flashdb\logs'
   ```

2. **Verify Log Directory:**
   ```powershell
   Test-Path 'C:\flashdb\logs'
   Get-ChildItem 'C:\flashdb\logs'
   ```

3. **Check Disk Space:**
   ```powershell
   Get-Volume -DriveLetter C
   ```

### Dashboard Not Loading

1. **Check Grafana Status:**
   ```bash
   curl http://localhost:3000/api/health
   ```

2. **Verify Data Source:**
   - Settings → Data Sources
   - Click Prometheus → Test

3. **Inspect Browser Console:**
   - F12 → Console tab
   - Check for errors

---

## Quick Reference

### Useful Queries

```promql
# Request rate
rate(http_requests_total[5m])

# Error percentage
(sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))) * 100

# P95 response time
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Memory usage
process_resident_memory_bytes / 1024 / 1024

# Disk usage
(node_filesystem_size_bytes - node_filesystem_avail_bytes) / node_filesystem_size_bytes * 100

# Clone success rate
rate(clones_created_total[1h]) / (rate(clones_created_total[1h]) + rate(clone_failures_total[1h])) * 100
```

### Alert Query Validation

```bash
# Check if alert would fire
curl 'http://localhost:9090/api/v1/query?query=<ALERT_EXPR>&time=<UNIX_TIMESTAMP>'

# Example
curl 'http://localhost:9090/api/v1/query?query=rate(http_requests_total%7Bstatus=%225..%22%7D[5m])%20%3E%200.05&time=1717667445'
```

---

*Last Updated: 2025-06-06*
*Version: 1.0*
*Owner: Infrastructure Team*
