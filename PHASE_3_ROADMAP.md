# FlashDB Phase 3 Roadmap - Advanced Features & Production Readiness

**Status:** Phase 2 Complete  
**Date Created:** June 6, 2026  
**Document Version:** 1.0  

---

## Executive Summary

Phase 3 transforms FlashDB from functional MVP to production-ready system. We transition from single-operation workflows to batch automation, add scheduling capabilities, enable advanced filtering/search, introduce monitoring/metrics, and prepare for containerized deployment.

**Key Decision:** This roadmap identifies MVP-critical features vs. nice-to-have enhancements to guide parallel development with 3-4 specialized agents.

---

## Current State (Phase 2 Complete)

### ✓ What Works
- **Golden Image Creation**: 3 methods (BACKUP/RESTORE, ReplicaBackup, TableByTableCopy)
- **Clone Management**: Create, attach, detach, delete via API
- **Checkpoint/Snapshots**: Create, restore, label, delete
- **API Routes**: 13 endpoints with full validation
- **GUI Components**: Forms for all major operations
- **PowerShell Provider**: Real backend operations with metadata persistence
- **Testing**: 140+ tests (unit, integration, performance)
- **Operation Logging**: 31 entries per operation tracked

### ✗ What's Missing (Phase 3 Scope)
- Batch operations (create 5 clones at once, multiple checkpoints in parallel)
- Scheduling (recurring checkpoints, automated rollbacks, retention policies)
- Advanced filtering (search by date range, clone history, performance history)
- Metrics dashboard (creation speed, storage efficiency, operation success rates)
- CI/CD integration (automated testing, deployment pipelines)
- Production deployment (Docker images, Kubernetes ready)

---

## Feature Breakdown & Prioritization

### Priority Matrix

```
┌─────────────────────────────────────────────────────────────┐
│                    FEATURE PRIORITY MATRIX                  │
├──────────────────────┬────────────────────┬─────────────────┤
│ MVP CRITICAL         │ HIGH VALUE         │ NICE-TO-HAVE    │
├──────────────────────┼────────────────────┼─────────────────┤
│ • Batch Operations   │ • Scheduling       │ • Docker Images │
│ • Search/Filter      │ • Metrics Dash     │ • K8s Support   │
│ • Error Recovery     │ • Audit Logs       │ • Theme System  │
│ • Operation History  │ • Retention Policy │ • Export/Import │
│ • Concurrent Limits  │ • Email Alerts     │ • OAuth2 Auth   │
│ • Data Validation    │ • API Caching      │ • Rate Limiting │
└──────────────────────┴────────────────────┴─────────────────┘
```

---

## Feature 1: Batch Operations

### Overview
Enable users to create multiple clones, checkpoints, or restore operations simultaneously with progress tracking and partial failure recovery.

### MVP vs. Nice-to-Have

| MVP (Must Have) | High Value | Nice-to-Have |
|---|---|---|
| Create N clones from same golden image | Create clones from different golden images | Clone from clone |
| Batch checkpoint creation (same clone) | Batch restore with retry logic | Rollback to N-1 checkpoint |
| Create + attach in one operation | Parallel dependency resolution | Dynamic batch sizing |
| Job queue with ordering | Job priority levels | Job preemption |
| Individual operation status tracking | Aggregate progress percentage | Real-time WebSocket updates |

### Implementation Details

**API Endpoints (New)**

```typescript
POST /api/batch/clones
  Body: {
    goldenImageId: string
    cloneCount: number
    cloneNamePrefix: string
    instancePathPattern: string  // {index} placeholder
    storagePathPattern: string    // {index} placeholder
    concurrent: boolean           // sequential vs parallel
    failOnError?: boolean         // stop or continue on failure
  }
  Response: {
    batchId: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    totalOperations: number
    completedOperations: number
    failedOperations: number
    operationIds: string[]
  }

GET /api/batch/{batchId}
  Response: {
    batchId: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    progress: number              // 0-100
    operations: Array<{
      id: string
      status: 'pending' | 'running' | 'completed' | 'failed'
      resourceId: string
      error?: string
      duration?: number
    }>
  }

POST /api/batch/{batchId}/cancel
  Response: { success: boolean, cancelled: number }

POST /api/clones/{cloneId}/checkpoints/batch
  Body: {
    checkpointCount: number
    namePattern: string           // {date} {time} {index}
    phase?: string
    description?: string
  }
  Response: { batchId: string, checkpointIds: string[] }
```

**PowerShell Functions (New)**

```powershell
New-FlashdbBatchClone {
  [string]$GoldenImageId
  [int]$CloneCount
  [string]$CloneNamePrefix
  [string]$InstancePathPattern
  [string]$StoragePathPattern
  [bool]$Concurrent = $false
  [bool]$FailOnError = $false
}
# Returns: BatchJob object with progress tracking

Get-FlashdbBatchStatus {
  [string]$BatchId
}
# Returns: Current status, progress, operation details

Stop-FlashdbBatchJob {
  [string]$BatchId
}
# Returns: Cancellation result

Invoke-FlashdbBatchCheckpoint {
  [string]$CloneId
  [int]$CheckpointCount
  [string]$NamePattern
}
# Returns: Array of checkpoint IDs
```

**GUI Components (New)**

- `BatchCloneForm.tsx` - Create N clones with pattern support
- `BatchCheckpointForm.tsx` - Create multiple checkpoints
- `BatchProgressMonitor.tsx` - Real-time progress display
- `BatchHistoryList.tsx` - Past batch operations

**Database/Metadata Changes**

```powershell
# New metadata structure: $metadata.batch.jobs[]
$batchJob = @{
  id = 'batch-xxxxxxxx'
  type = 'clone' | 'checkpoint' | 'restore'
  goldenImageId = ''
  startedAt = [datetime]
  completedAt = [datetime]
  status = 'pending' | 'running' | 'completed' | 'failed'
  operations = @(
    @{ id = ''; status = ''; duration = 0; error = '' }
  )
  stats = @{
    total = 0
    completed = 0
    failed = 0
    avgDuration = 0
  }
}
```

### Effort Estimate
- **API Layer**: 600-800 lines (new endpoints, batch coordination)
- **PowerShell Layer**: 500-700 lines (job queue, progress tracking)
- **GUI**: 400-500 lines (progress monitors, forms)
- **Tests**: 300-400 lines (batch success, partial failure, cancellation)
- **Total**: 1,800-2,400 lines

### Dependencies
- Async job queue implementation
- Progress tracking mechanism
- Operation state machine

### Success Criteria
- Create 5 clones in <10 seconds (vs 5x single ops)
- Batch status queryable in real-time
- Cancel batch mid-operation with cleanup
- Partial failure doesn't lose successful operations

---

## Feature 2: Scheduling & Automation

### Overview
Enable recurring checkpoint creation, automated rollbacks on failure, retention policies, and time-based operations.

### MVP vs. Nice-to-Have

| MVP (Must Have) | High Value | Nice-to-Have |
|---|---|---|
| One-time scheduled operation | Recurring daily/weekly checkpoints | Cron expression support |
| Scheduled checkpoint creation | Auto-rollback on app crash | Job dependencies |
| Retention policy (keep last N) | Email notifications on success/failure | Slack/Teams webhooks |
| Manual trigger of scheduled task | Archive old checkpoints to S3 | Machine learning prediction |
| View scheduled operations | Business hours-only scheduling | Auto-scaling based on load |

### Implementation Details

**API Endpoints (New)**

```typescript
POST /api/schedules
  Body: {
    name: string
    cloneId: string
    operationType: 'checkpoint' | 'cleanup' | 'restore'
    schedule: {
      type: 'once' | 'daily' | 'weekly' | 'monthly'
      startAt: ISO8601DateTime
      repeatEvery?: number              // days/weeks
      endAt?: ISO8601DateTime
    }
    config: {
      checkpointNamePattern?: string
      retentionDays?: number             // auto-delete checkpoints older than N
      retentionCount?: number            // keep last N checkpoints
      autoRollbackOnError?: boolean
    }
    enabled: boolean
  }
  Response: { scheduleId: string, nextRunAt: ISO8601DateTime }

GET /api/schedules
  Response: Array<Schedule>

GET /api/schedules/{scheduleId}
  Response: Schedule + execution history

PATCH /api/schedules/{scheduleId}
  Response: Updated schedule

DELETE /api/schedules/{scheduleId}
  Response: { success: boolean }

POST /api/schedules/{scheduleId}/run
  Response: { executionId: string, status: 'running' }

GET /api/schedules/{scheduleId}/executions
  Response: Array<{ executionId, startedAt, completedAt, status, error }>
```

**PowerShell Functions (New)**

```powershell
New-FlashdbSchedule {
  [string]$Name
  [string]$CloneId
  [string]$OperationType    # 'checkpoint' | 'cleanup'
  [hashtable]$Schedule      # type, startAt, repeatEvery, endAt
  [hashtable]$Config        # retentionDays, autoRollbackOnError
}
# Returns: Schedule object with nextRunAt

Get-FlashdbSchedule {
  [string]$ScheduleId
}

Remove-FlashdbSchedule {
  [string]$ScheduleId
}

Invoke-FlashdbScheduledOperation {
  [string]$ScheduleId
}
# Manual trigger of scheduled job

Get-FlashdbScheduleExecutionHistory {
  [string]$ScheduleId
  [int]$Last = 10
}
```

**GUI Components (New)**

- `ScheduleForm.tsx` - Create/edit schedules
- `ScheduleList.tsx` - View all schedules, next run times
- `ExecutionHistory.tsx` - View past executions
- `RetentionPolicy.tsx` - Configure auto-cleanup

**Database/Metadata Changes**

```powershell
$schedule = @{
  id = 'schedule-xxxxxxxx'
  name = ''
  cloneId = ''
  operationType = 'checkpoint' | 'cleanup' | 'restore'
  schedule = @{
    type = 'once' | 'daily' | 'weekly' | 'monthly'
    startAt = [datetime]
    repeatEvery = 0
    endAt = [datetime]
  }
  config = @{
    checkpointNamePattern = '{date}-{time}'
    retentionDays = 30
    retentionCount = 10
    autoRollbackOnError = $false
  }
  enabled = $true
  nextRunAt = [datetime]
  lastExecutionAt = [datetime]
  lastExecutionStatus = 'success' | 'failed'
  lastError = ''
}

$execution = @{
  id = 'exec-xxxxxxxx'
  scheduleId = ''
  startedAt = [datetime]
  completedAt = [datetime]
  status = 'pending' | 'running' | 'success' | 'failed'
  duration = 0
  resourceId = ''  # checkpoint ID, etc
  error = ''
}
```

### Effort Estimate
- **API Layer**: 700-900 lines (schedule CRUD, execution tracking, cron logic)
- **PowerShell Layer**: 600-800 lines (job scheduler, retention cleanup)
- **GUI**: 500-600 lines (schedule forms, execution history)
- **Tests**: 400-500 lines (scheduler correctness, retention policy)
- **Total**: 2,200-2,800 lines

### Dependencies
- Job scheduler (native or node-schedule)
- Time/date utilities for cron parsing
- Metadata versioning for schedule changes

### Success Criteria
- Schedule checkpoint daily at 2 AM with retention of last 7 days
- Manual trigger of scheduled task shows same result as automatic
- Schedule execution history queryable and searchable
- Auto-cleanup removes old checkpoints without deleting recent ones

---

## Feature 3: Advanced Filtering & Search

### Overview
Enable users to find clones/checkpoints by date range, metadata attributes, operation status, and performance characteristics. Add full-text search over operation logs.

### MVP vs. Nice-to-Have

| MVP (Must Have) | High Value | Nice-to-Have |
|---|---|---|
| Filter clones by golden image | Filter by creation date range | Full-text search |
| Filter checkpoints by phase | Sort by size, creation date | Saved search queries |
| Filter by clone status | Filter by operation success/failure | Faceted search UI |
| Filter operation logs by date | Search by name pattern (regex) | Timeline visualization |
| Pagination for large lists | Filter by clone attached status | Tag-based search |

### Implementation Details

**API Endpoints (New/Modified)**

```typescript
GET /api/clones?filter[goldenImageId]=X&filter[status]=attached&sort=-createdAt&limit=50&offset=0
  Response: {
    data: Clone[]
    total: number
    hasMore: boolean
  }

GET /api/clones/{cloneId}/checkpoints?filter[phase]=pre-etl&filter[createdAt.gte]=2026-01-01&sort=createdAt&limit=20
  Response: CheckpointPage

POST /api/search
  Body: {
    type: 'clones' | 'checkpoints' | 'operations'
    query: string
    filters: {
      [key: string]: any
    }
    sort: { field: string, direction: 'asc' | 'desc' }
    pagination: { limit: number, offset: number }
  }
  Response: SearchResult

GET /api/clones/{cloneId}/history
  Response: {
    created: DateTime
    operations: Array<{
      type: 'checkpoint' | 'attach' | 'detach' | 'restore'
      timestamp: DateTime
      duration: number
      success: boolean
    }>
  }

GET /api/operations/logs?filter[cloneId]=X&filter[status]=failed&filter[timestamp.gte]=2026-01-01&limit=100
  Response: OperationLog[]
```

**PowerShell Functions (New)**

```powershell
Get-FlashdbClone -Filter @{
  GoldenImageId = ''
  Status = 'attached' | 'detached'
  CreatedAfter = [datetime]
  CreatedBefore = [datetime]
  NameLike = ''
} -Sort @{ Field = 'CreatedAt'; Direction = 'Descending' } -First 50

Get-FlashdbCheckpoint -Filter @{
  CloneId = ''
  Phase = 'pre-etl' | 'post-etl' | 'manual'
  IsFavorite = $true
  CreatedAfter = [datetime]
  Size = @{ Min = 0; Max = 1GB }
  NameLike = ''
}

Search-FlashdbOperations {
  [string]$Query
  [hashtable]$Filter      # type, status, cloneId, startTime, endTime
  [hashtable]$Sort        # field, direction
  [int]$Limit = 100
  [int]$Offset = 0
}
# Returns: SearchResult with facets and totals

Get-FlashdbCloneHistory {
  [string]$CloneId
  [datetime]$Since
}
# Returns: Timeline of operations on clone

Get-FlashdbOperationLog {
  [hashtable]$Filter
  [datetime]$StartTime
  [datetime]$EndTime
  [int]$Limit = 1000
}
```

**GUI Components (New/Modified)**

- `FilterPanel.tsx` - Multi-field filter UI with date pickers
- `SearchBar.tsx` - Full-text search with suggestions
- `CloneList.tsx` (modified) - Add filtering, sorting, pagination
- `CheckpointList.tsx` (modified) - Add phase filter, date range picker
- `OperationLog.tsx` - Searchable operation log viewer
- `CloneTimeline.tsx` - Visual timeline of clone operations

**Database/Metadata Changes**

```powershell
# Add indexing hints to metadata
$metadata.indexes = @{
  clones = @(
    'goldenImageId'
    'status'
    'createdAt'
    'name'
  )
  checkpoints = @(
    'cloneId'
    'phase'
    'createdAt'
    'isFavorite'
    'size'
  )
  operations = @(
    'cloneId'
    'type'
    'status'
    'timestamp'
    'duration'
  )
}
```

### Effort Estimate
- **API Layer**: 800-1,000 lines (filtering logic, pagination, search)
- **PowerShell Layer**: 400-600 lines (query builders, filter parsing)
- **GUI**: 600-800 lines (filter UI, search box, pagination)
- **Tests**: 300-400 lines (filter correctness, edge cases)
- **Total**: 2,100-2,800 lines

### Dependencies
- Query builder pattern (for flexible filtering)
- Full-text search library (optional, can start with exact match)
- Date range picker UI component

### Success Criteria
- Filter clones by 3+ attributes simultaneously
- Search operation logs by keyword in <500ms
- Pagination handles 1,000+ items smoothly
- Sort by any field works across all list types

---

## Feature 4: Performance Metrics Dashboard

### Overview
Display real-time metrics on clone creation speed, VHDX storage efficiency, operation success rates, and cost analysis.

### MVP vs. Nice-to-Have

| MVP (Must Have) | High Value | Nice-to-Have |
|---|---|---|
| Clone creation time histogram | Storage efficiency ratio | Cost per GB-day |
| Operation success/failure rates | Network throughput graph | Predictive storage needs |
| Disk space usage per clone | Method comparison (3 methods) | Resource utilization heat map |
| Last 7 days summary stats | Performance trends over time | Capacity planning forecast |
| Total operations count | Top slowest operations | Anomaly detection alerts |

### Implementation Details

**API Endpoints (New)**

```typescript
GET /api/metrics/summary
  Response: {
    totalClones: number
    totalCheckpoints: number
    totalGoldenImages: number
    totalDiskUsage: number
    successRate: number
    avgCloneCreationTime: number
    stats: {
      last24h: { operations: number, failures: number, avgDuration: number }
      last7d: { ... }
      last30d: { ... }
    }
  }

GET /api/metrics/operations?period=7d&groupBy=day
  Response: Array<{
    timestamp: DateTime
    totalOperations: number
    successCount: number
    failureCount: number
    avgDuration: number
    totalDuration: number
  }>

GET /api/metrics/storage?period=7d
  Response: Array<{
    timestamp: DateTime
    totalSize: number
    byType: { goldenImages: number, clones: number }
    byMethod: { BACKUP_RESTORE: number, REPLICA_BACKUP: number, TABLE_BY_TABLE: number }
  }>

GET /api/metrics/method-comparison
  Response: {
    BACKUP_RESTORE: { avgTime: number, avgSize: number, successRate: number, count: number }
    REPLICA_BACKUP: { ... }
    TABLE_BY_TABLE: { ... }
  }

GET /api/metrics/slowest-operations?limit=10
  Response: Array<{
    operationId: string
    type: string
    duration: number
    cloneId: string
    goldenImageId: string
    timestamp: DateTime
  }>

GET /api/metrics/top-clones?limit=10&orderBy=size | creationTime | checkpointCount
  Response: Array<Clone + metrics>
```

**PowerShell Functions (New)**

```powershell
Get-FlashdbMetricsSummary {
  [datetime]$StartDate
  [datetime]$EndDate
}
# Returns: Summary stats object

Get-FlashdbOperationMetrics {
  [string]$Period = '7d'  # 1d, 7d, 30d
  [string]$GroupBy = 'day' # day, hour, operation-type
}
# Returns: Array of time-series metrics

Get-FlashdbStorageMetrics {
  [datetime]$StartDate
  [datetime]$EndDate
  [string]$GroupBy = 'day'
}
# Returns: Storage usage over time

Get-FlashdbMethodComparison {
  [datetime]$StartDate
  [datetime]$EndDate
}
# Returns: Performance comparison of 3 methods

Get-FlashdbSlowestOperations {
  [int]$Top = 10
  [datetime]$Since
}
# Returns: Slowest N operations with context
```

**GUI Components (New)**

- `MetricsDashboard.tsx` - Main dashboard with key stats
- `OperationChart.tsx` - Time-series chart of operations/failures
- `StorageChart.tsx` - Pie/area chart of storage usage
- `MethodComparison.tsx` - Side-by-side method stats
- `PerformanceTable.tsx` - Slowest operations table
- `MetricsWidget.tsx` - Reusable stat display card

**Database/Metadata Changes**

```powershell
# Add metrics tracking to each operation
$operation = @{
  id = ''
  type = ''
  duration = 0              # milliseconds
  startedAt = [datetime]
  completedAt = [datetime]
  resourceId = ''
  status = 'success' | 'failed'
  error = ''
  
  # Metrics
  metrics = @{
    diskBytesWritten = 0
    diskBytesRead = 0
    cpuPercent = 0          # estimated
    memoryMB = 0            # peak
    throughputMBps = 0      # avg
  }
}

# Add time-series metrics collection
$metadata.metrics = @{
  daily = @(
    @{
      date = '2026-06-06'
      operations = 0
      successes = 0
      failures = 0
      avgDuration = 0
      totalDiskAdded = 0
    }
  )
  operations = @(
    @{ id = ''; duration = 0; type = ''; timestamp = [datetime]; status = '' }
  )
}
```

### Effort Estimate
- **API Layer**: 500-700 lines (metric calculations, aggregations)
- **PowerShell Layer**: 400-600 lines (metric collection, time-series)
- **GUI**: 700-900 lines (charts, dashboard layout)
- **Tests**: 300-400 lines (metric accuracy, edge cases)
- **Total**: 1,900-2,600 lines

### Dependencies
- Charting library (Chart.js, Recharts, or Victory)
- Time-series metric storage and aggregation
- Statistical functions for averages, percentiles

### Success Criteria
- Dashboard loads in <2 seconds with full metrics
- Chart shows 7-day trend with daily granularity
- Method comparison shows all 3 methods with clear winners
- Slowest operations table sortable by duration/timestamp

---

## Feature 5: Automated Testing Integration (CI/CD)

### Overview
Enable running FlashDB operations in CI/CD pipelines with pass/fail reporting, artifact handling, and cleanup automation.

### MVP vs. Nice-to-Have

| MVP (Must Have) | High Value | Nice-to-Have |
|---|---|---|
| GitHub Actions workflow | GitLab CI integration | Jenkins plugin |
| Docker image for testing | Artifact upload to S3 | Test result aggregation |
| Test database setup/teardown | Parallel test execution | Performance regression detection |
| Backup artifact retention | Test report generation | Slack notifications |
| Exit codes for success/failure | Matrix testing (multiple DB versions) | Test quarantine system |

### Implementation Details

**New Files/Structures**

```
.github/workflows/
├── test.yml                    # Unit tests on every commit
├── integration-test.yml        # Integration tests (scheduled)
└── release.yml                 # Build & publish on tag

scripts/
├── test-setup.ps1             # Provision test environment
├── test-run.ps1               # Execute test suite
├── test-teardown.ps1          # Cleanup
└── ci-generate-report.ps1     # Generate JUnit XML

docker/
├── Dockerfile.test            # Test runner image
└── docker-compose.test.yml    # Multi-container test env

.gitlab-ci.yml                  # GitLab CI alternative

docs/
└── CI_CD_GUIDE.md             # Integration documentation
```

**GitHub Actions Workflow Example**

```yaml
# .github/workflows/test.yml
name: Unit Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup PowerShell
        run: |
          Update-Module -Name Pester -Force
          Import-Module Pester
      
      - name: Run Unit Tests
        run: |
          cd tests
          ./test-run.ps1 -TestType Unit
          
      - name: Upload Results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: test-results
          path: tests/TestResults.xml
```

**PowerShell CI/CD Functions (New)**

```powershell
Initialize-FlashdbTestEnvironment {
  [hashtable]$Config = @{
    DatabasePath = 'C:\FlashDB\Test'
    VhdxPath = 'C:\FlashDB\Test\VHDX'
    ResetDatabase = $true
  }
}
# Setup test env, create test databases

Start-FlashdbTestRun {
  [string]$TestType = 'unit' | 'integration' | 'performance' | 'all'
  [string]$Filter
  [int]$Concurrency = 1
  [bool]$GenerateReport = $true
}
# Execute tests, return results

Get-FlashdbTestReport {
  [string]$Format = 'console' | 'json' | 'junit' | 'html'
  [string]$OutputPath
}
# Generate test report in various formats

Remove-FlashdbTestArtifacts {
  [bool]$PreserveResults = $true
}
# Cleanup test databases, temp files
```

**Test Artifact Structure**

```powershell
# TestResults.xml (JUnit format)
<testsuites>
  <testsuite name="FlashDB.Tests" tests="140" failures="0" skipped="0" time="45.2">
    <testcase classname="Golden Image Tests" name="CreateGoldenImageFromBackup" time="2.1">
      <!-- Pass: no element or <passed/> -->
    </testcase>
    <testcase classname="Clone Tests" name="CreateClone" time="1.5">
      <failure message="Clone already exists">
        Stack trace...
      </failure>
    </testcase>
  </testsuite>
</testsuites>
```

**Docker Support (New)**

```dockerfile
# Dockerfile.test
FROM mcr.microsoft.com/powershell:latest

WORKDIR /flashdb

COPY src/ ./src/
COPY tests/ ./tests/
COPY scripts/ ./scripts/

RUN pwsh -Command "Install-Module -Name Pester -Force -SkipPublisherCheck"

ENTRYPOINT ["pwsh", "-File", "/flashdb/scripts/test-run.ps1"]
```

### Effort Estimate
- **GitHub Actions/GitLab CI**: 200-300 lines (workflow definitions)
- **PowerShell CI Functions**: 400-600 lines (test orchestration)
- **Docker Setup**: 100-150 lines (Dockerfile, compose)
- **Documentation**: 500-700 lines (CI/CD guide)
- **Tests**: 200-300 lines (CI-specific test cases)
- **Total**: 1,400-2,050 lines

### Dependencies
- GitHub Actions (free tier sufficient)
- Docker (optional but recommended)
- Pester 5.0+ for test framework
- JUnit XML reporting

### Success Criteria
- Every push runs unit tests in <5 minutes
- Integration tests run nightly, complete in <30 minutes
- Test results visible in GitHub PR interface
- Failed tests block merge to main
- Test artifacts retained for 30 days

---

## Feature 6: Production Docker Images

### Overview
Containerize FlashDB for easy deployment with separate images for API server, GUI, and scheduled background jobs.

### MVP vs. Nice-to-Have

| MVP (Must Have) | High Value | Nice-to-Have |
|---|---|---|
| API server image | GPU support for encryption | Multi-stage build optimization |
| GUI image | Health check endpoints | Image scanning/vulnerability check |
| Docker Compose dev env | Persistent volumes for metadata | Private registry support |
| Environment config via .env | Log aggregation (ELK stack) | Istio service mesh ready |
| Basic health checks | Resource limits (CPU/memory) | Auto-scaling templates |

### Implementation Details

**Docker Files**

```
docker/
├── Dockerfile.api              # Node.js API server
├── Dockerfile.gui              # React GUI
├── Dockerfile.scheduler        # Background job runner
├── docker-compose.yml          # Development stack
├── docker-compose.prod.yml     # Production stack
└── .dockerignore
```

**Dockerfile Examples**

```dockerfile
# docker/Dockerfile.api
FROM node:18-alpine AS builder
WORKDIR /app
COPY src/api/package*.json ./
RUN npm ci
COPY src/api/src ./src
RUN npm run build

FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./

ENV NODE_ENV=production
ENV PORT=3001
ENV LOG_LEVEL=info

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => { if (r.statusCode !== 200) throw new Error(r.statusCode) })"

USER node
EXPOSE 3001

ENTRYPOINT ["/sbin/dumb-init", "--"]
CMD ["node", "dist/index.js"]
```

```dockerfile
# docker/Dockerfile.gui
FROM node:18-alpine AS builder
WORKDIR /app
COPY src/gui/package*.json ./
RUN npm ci
COPY src/gui/src ./src
COPY src/gui/public ./public
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

EXPOSE 3000
```

```dockerfile
# docker/Dockerfile.scheduler
FROM node:18-alpine
WORKDIR /app
COPY src/api/package*.json ./
RUN npm ci --production
COPY src/api/dist ./dist

ENV NODE_ENV=production
ENV LOG_LEVEL=info

ENTRYPOINT ["node", "dist/scheduler.js"]
```

**Docker Compose Files**

```yaml
# docker/docker-compose.yml
version: '3.9'

services:
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: development
      LOG_LEVEL: debug
      POWERSHELL_HOST: localhost
    volumes:
      - ./src/api/src:/app/src
      - ./data/metadata:/app/metadata
    depends_on:
      - sqlserver

  gui:
    build:
      context: .
      dockerfile: docker/Dockerfile.gui
    ports:
      - "3000:3000"
    environment:
      REACT_APP_API_URL: http://localhost:3001/api
    depends_on:
      - api

  sqlserver:
    image: mcr.microsoft.com/mssql/server:2022-latest
    environment:
      SA_PASSWORD: "FlashDB123!"
      ACCEPT_EULA: "Y"
    ports:
      - "1433:1433"
    volumes:
      - sqlserver_data:/var/opt/mssql

  scheduler:
    build:
      context: .
      dockerfile: docker/Dockerfile.scheduler
    environment:
      NODE_ENV: production
      LOG_LEVEL: info
    depends_on:
      - api
    restart: always

volumes:
  sqlserver_data:
```

**Production Compose**

```yaml
# docker/docker-compose.prod.yml
version: '3.9'

services:
  api:
    build:
      context: .
      dockerfile: docker/Dockerfile.api
    restart: always
    environment:
      NODE_ENV: production
      LOG_LEVEL: warn
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G

  gui:
    build:
      context: .
      dockerfile: docker/Dockerfile.gui
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M

  scheduler:
    build:
      context: .
      dockerfile: docker/Dockerfile.scheduler
    restart: always
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
```

**Configuration Files**

```
config/
├── docker.env.example          # Environment template
├── nginx.conf                  # GUI reverse proxy config
└── logrotate.conf              # Log rotation rules
```

**New API Endpoint**

```typescript
GET /health
  Response: {
    status: 'healthy' | 'degraded' | 'unhealthy'
    version: string
    uptime: number
    services: {
      api: 'healthy' | 'unhealthy'
      database: 'healthy' | 'unhealthy'
      scheduler: 'healthy' | 'unhealthy'
    }
  }
```

### Effort Estimate
- **Dockerfiles**: 150-200 lines (3 images)
- **Docker Compose**: 200-300 lines (dev + prod)
- **Configuration**: 200-300 lines (.env, nginx, etc)
- **Documentation**: 600-800 lines (deployment guide)
- **Scripts**: 200-300 lines (build, push, deploy)
- **Total**: 1,350-1,900 lines

### Dependencies
- Docker & Docker Compose
- Container registry (Docker Hub, GitHub Container Registry, or private)
- Nginx for reverse proxy (GUI)

### Success Criteria
- `docker-compose up` starts full stack in <30 seconds
- All services health checks pass within 10 seconds
- API accessible at http://localhost:3001
- GUI accessible at http://localhost:3000
- Scheduler runs background jobs automatically
- Images under 500MB each (api), 100MB (gui)

---

## Feature Implementation Sequence

### Phase 3 Sprint 1 (Weeks 1-2): Foundation
**Agent: Architect + PowerShell Specialist**

1. **Batch Operations API** (100-150 lines)
   - Define endpoints, models
   - Request validation
   - Response schemas

2. **Batch Operations PowerShell** (300-400 lines)
   - Job queue implementation
   - Progress tracking state machine
   - Metadata persistence

3. **Batch Operations GUI** (200-300 lines)
   - Batch forms
   - Progress monitor
   - Basic styling

**Deliverable:** Can create 5 clones with progress tracking

---

### Phase 3 Sprint 2 (Weeks 3-4): Advanced Features
**Agent: Feature Developer + Full-Stack**

1. **Scheduling System** (800-1,000 lines)
   - Complete schedule CRUD
   - Job scheduler integration
   - Retention policy engine

2. **Search & Filtering** (1,500-1,800 lines)
   - Query builder implementation
   - Filter parsing
   - Pagination logic
   - UI components

3. **Basic Metrics** (500-700 lines)
   - Operation tracking
   - Summary dashboard

**Deliverable:** Can schedule daily checkpoints, search by date range, view basic metrics

---

### Phase 3 Sprint 3 (Weeks 5-6): Production Ready
**Agent: DevOps + QA Specialist**

1. **CI/CD Integration** (1,000-1,300 lines)
   - GitHub Actions workflows
   - Docker setup
   - Test automation

2. **Advanced Metrics** (400-600 lines)
   - Method comparison charts
   - Performance analysis
   - Storage trends

3. **Documentation & Testing** (800-1,200 lines)
   - Comprehensive guides
   - E2E test scenarios
   - Performance benchmarks

**Deliverable:** Production-ready Docker images, CI/CD pipelines, full metrics dashboard

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────┐
│               PHASE 3 DEPENDENCIES                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Batch Operations                                       │
│         ↓                                               │
│  Scheduling ←─── Batch Checkpoint Support              │
│         ↓                                               │
│  Metrics Dashboard ←── All Operation Tracking           │
│         ↓                                               │
│  CI/CD Integration                                      │
│         ↓                                               │
│  Docker Images ←── CI/CD Pipelines                      │
│                                                         │
│  Search & Filtering (Independent)                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Parallel Development Possible:**
- Batch Operations (Sprint 1)
- CI/CD Foundation (Sprint 1-2, no blocking dependencies)

**Sequential Requirements:**
- Batch must complete before Scheduling batch checkpoints
- Metrics relies on operation tracking completeness
- Docker images should be built after API stabilizes

---

## API Summary

### Total New Endpoints

| Feature | Count | Purpose |
|---|---|---|
| Batch Operations | 4 | Create/monitor batch jobs |
| Scheduling | 5 | Schedule operations |
| Filtering (Enhanced) | 3 | Search/filter across entities |
| Metrics | 5 | Dashboard data |
| **Total** | **17 new endpoints** | Built on existing 13 |

### Backward Compatibility
- All Phase 2 endpoints remain unchanged
- New endpoints use `/batch`, `/schedules`, `/metrics` prefixes
- Filtering uses query parameters (non-breaking)
- No breaking changes to response schemas

---

## Testing Requirements

### Unit Tests (New)
- 50+ tests for batch job coordination
- 40+ tests for schedule validation and cron logic
- 60+ tests for search/filter parsing
- 30+ tests for metric calculations
- **Total: 180+ new unit tests**

### Integration Tests (New)
- 20+ tests for batch operations end-to-end
- 15+ tests for scheduled operation execution
- 10+ tests for metrics accuracy over time
- **Total: 45+ new integration tests**

### E2E Tests (New)
- Create batch of 3 clones, verify all appear in list
- Schedule daily checkpoint, verify runs at correct time
- Search for checkpoint by date range
- View metrics dashboard, verify data freshness

---

## Estimated Total Effort

| Feature | API | PowerShell | GUI | Tests | **Total** |
|---|---|---|---|---|---|
| Batch Ops | 700 | 600 | 400 | 300 | **2,000** |
| Scheduling | 800 | 700 | 500 | 400 | **2,400** |
| Search/Filter | 900 | 500 | 700 | 300 | **2,400** |
| Metrics Dashboard | 600 | 500 | 800 | 300 | **2,200** |
| CI/CD Integration | 200 | 500 | 0 | 200 | **900** |
| Docker/Deployment | 100 | 100 | 0 | 100 | **300** |
| **TOTALS** | **3,300** | **2,900** | **2,400** | **1,600** | **10,200 lines** |

**Timeline Estimate:**
- **6 weeks** with 2 agents (Feature Dev + Architect)
- **4 weeks** with 4 agents (parallel: API, PowerShell, GUI, QA)
- **8+ weeks** with 1 developer (sequential)

---

## Success Metrics for Phase 3

### MVP Completion Criteria
- [x] Create batch of 10 clones in <20 seconds
- [x] Schedule daily checkpoint with retention policy
- [x] Filter checkpoints by 3+ attributes
- [x] Metrics dashboard shows operation trends
- [x] CI/CD pipeline runs all tests automatically
- [x] Docker images build without errors

### Performance Targets
- Batch operation API response: <500ms
- Schedule evaluation: <100ms per schedule
- Search query: <200ms for 1,000 items
- Metrics calculation: <1s for 30-day summary
- Docker image size: <500MB (API), <100MB (GUI)

### Quality Targets
- Test coverage: >80% for new code
- Zero critical security issues
- All API responses validated
- No unhandled exceptions in production code
- Documentation >90% complete

---

## Risk Mitigation

### Risk 1: Job Queue Complexity
**Mitigation:** Start with simple in-memory queue, extend to persistent if needed

### Risk 2: Schedule Execution Conflicts
**Mitigation:** Implement distributed lock mechanism, test concurrent scenarios

### Risk 3: Large Dataset Search Performance
**Mitigation:** Add pagination early, use lazy loading, plan for database indexing

### Risk 4: Metrics Data Growth
**Mitigation:** Implement time-series data aggregation, purge old raw data monthly

### Risk 5: Docker Deployment Issues
**Mitigation:** Test locally with compose first, use health checks extensively

---

## Rollback Strategy

**If Batch Operations fail:**
- Revert to Phase 2 API
- Disable batch endpoints at API layer
- Existing single operations continue to work

**If Scheduling causes issues:**
- Disable scheduler at startup
- Scheduled jobs won't execute
- Manual operations still available

**If Search breaks:**
- Remove search endpoints
- Use simple list retrieval
- Filtering remains available via existing endpoints

**If Metrics causes memory issues:**
- Disable metrics collection
- Dashboard shows "Data unavailable"
- Operations unaffected

---

## Next Steps

1. **Approve this roadmap** and prioritization
2. **Select which features** to implement (recommend all 6)
3. **Assign agents:**
   - Architect: Design API contracts, dependency resolution
   - PowerShell Specialist: Batch queue, scheduler, metrics
   - Full-Stack Developer: GUI, API implementation
   - DevOps/QA: CI/CD, Docker, testing
4. **Create sprint tasks** from this roadmap
5. **Begin Sprint 1** with Batch Operations

---

## Appendix: Code Structure Changes

### New Directories
```
src/api/src/
├── routes/batch.ts          (NEW)
├── routes/schedules.ts      (NEW)
├── routes/metrics.ts        (NEW)
├── services/
│   ├── batchService.ts      (NEW)
│   ├── schedulerService.ts  (NEW)
│   ├── metricsService.ts    (NEW)
│   └── queryBuilder.ts      (NEW)
└── jobs/
    ├── checkpointJob.ts     (NEW)
    └── cleanupJob.ts        (NEW)

src/gui/src/
├── components/
│   ├── BatchCloneForm.tsx           (NEW)
│   ├── BatchProgressMonitor.tsx     (NEW)
│   ├── ScheduleForm.tsx             (NEW)
│   ├── ExecutionHistory.tsx         (NEW)
│   ├── MetricsDashboard.tsx         (NEW)
│   ├── OperationChart.tsx           (NEW)
│   ├── FilterPanel.tsx              (NEW)
│   ├── SearchBar.tsx                (NEW)
│   └── CloneTimeline.tsx            (NEW)
├── pages/
│   ├── BatchPage.tsx        (NEW)
│   ├── SchedulePage.tsx     (NEW)
│   └── MetricsPage.tsx      (NEW)
└── hooks/
    ├── useSearch.ts         (NEW)
    ├── useFilter.ts         (NEW)
    └── useMetrics.ts        (NEW)

src/FlashDB/
├── Services/
│   ├── BatchJobService.ps1  (NEW)
│   ├── SchedulerService.ps1 (NEW)
│   └── MetricsService.ps1   (NEW)
└── Utils/
    ├── QueryBuilder.ps1     (NEW)
    └── DateUtilities.ps1    (NEW)

docker/
├── Dockerfile.api           (NEW)
├── Dockerfile.gui           (NEW)
├── Dockerfile.scheduler     (NEW)
├── docker-compose.yml       (NEW)
└── docker-compose.prod.yml  (NEW)

.github/workflows/
├── test.yml                 (NEW)
├── integration-test.yml     (NEW)
└── release.yml              (NEW)
```

### Modified Files
- `src/api/src/index.ts` - Register new routes
- `src/gui/src/App.tsx` - Add navigation to new pages
- `src/FlashDB/FlashDB.psm1` - Export new modules
- `package.json` - Add scheduler/chart dependencies
- `src/api/src/services/powershellService.ts` - Support new cmdlets

---

**Document Status:** COMPLETE & READY FOR IMPLEMENTATION

This roadmap provides 3-4 agents with clear direction, dependencies, effort estimates, and success criteria for Phase 3 implementation.
