# Phase 3 Architecture & Integration Points

## System Architecture (Phase 2 + Phase 3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           FLASHDB SYSTEM v3.0                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                        REACT GUI (Port 3000)                        │ │
│  ├──────────────────────────────────────────────────────────────────────┤ │
│  │ Phase 2:                                                           │ │
│  │  - Golden Image Form                                              │ │
│  │  - Clone Manager                                                  │ │
│  │  - Checkpoint Manager                                             │ │
│  │                                                                    │ │
│  │ Phase 3 (NEW):                                                    │ │
│  │  ✓ BatchCloneForm → BatchProgressMonitor                         │ │
│  │  ✓ ScheduleForm → ExecutionHistory                               │ │
│  │  ✓ FilterPanel → CloneList/CheckpointList (with sorting)        │ │
│  │  ✓ MetricsDashboard → OperationChart, StorageChart              │ │
│  │  ✓ SearchBar (across all entities)                              │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                │                                           │
│                    HTTP REST API (Port 3001)                              │
│                                │                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                    EXPRESS.JS API SERVER                           │ │
│  ├──────────────────────────────────────────────────────────────────────┤ │
│  │                                                                    │ │
│  │  Phase 2 Routes (13 endpoints):                                  │ │
│  │  ├─ POST   /api/golden-images                                   │ │
│  │  ├─ GET    /api/golden-images                                   │ │
│  │  ├─ DELETE /api/golden-images/:id                               │ │
│  │  ├─ POST   /api/clones                                          │ │
│  │  ├─ GET    /api/clones                                          │ │
│  │  ├─ POST   /api/clones/:id/attach                               │ │
│  │  ├─ POST   /api/clones/:id/detach                               │ │
│  │  ├─ DELETE /api/clones/:id                                      │ │
│  │  └─ ... checkpoints (5 endpoints)                               │ │
│  │                                                                    │ │
│  │  Phase 3 NEW Routes (17 endpoints):                              │ │
│  │  ├─ /api/batch/clones                                           │ │
│  │  ├─ /api/batch/{id}                                             │ │
│  │  ├─ /api/schedules (CRUD + executions)                          │ │
│  │  ├─ /api/search (global search)                                 │ │
│  │  ├─ /api/clones?filter[*]=*&sort=* (enhanced)                  │ │
│  │  └─ /api/metrics/* (5 endpoint variations)                      │ │
│  │                                                                    │ │
│  │  Services:                                                        │ │
│  │  ├─ PowerShellService (Phase 2)                                 │ │
│  │  ├─ BatchService (Phase 3 NEW) ─┐                              │ │
│  │  ├─ SchedulerService (Phase 3 NEW)                             │ │
│  │  ├─ MetricsService (Phase 3 NEW)                               │ │
│  │  └─ QueryBuilder (Phase 3 NEW)                                 │ │
│  │                                                                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                │                                           │
│                        PowerShell Execution Layer                          │
│                                │                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                    POWERSHELL PROVIDER (Core)                      │ │
│  ├──────────────────────────────────────────────────────────────────────┤ │
│  │                                                                    │ │
│  │  Core Modules:                                                   │ │
│  │  ├─ GoldenImageProvider.ps1 (Phase 2)                           │ │
│  │  ├─ CloneManagement.ps1 (Phase 2)                               │ │
│  │  ├─ CheckpointManagement.ps1 (Phase 2)                          │ │
│  │  ├─ VhdxOperations.ps1 (Phase 2)                                │ │
│  │  ├─ MetadataManager.ps1 (Phase 2)                               │ │
│  │  └─ StateManager.ps1 (Phase 2)                                  │ │
│  │                                                                    │ │
│  │  Phase 3 NEW Services:                                           │ │
│  │  ├─ BatchJobService.ps1                                         │ │
│  │  │  └─ New-FlashdbBatchClone                                   │ │
│  │  │  └─ Get-FlashdbBatchStatus                                  │ │
│  │  │  └─ Stop-FlashdbBatchJob                                    │ │
│  │  │                                                              │ │
│  │  ├─ SchedulerService.ps1                                        │ │
│  │  │  └─ New-FlashdbSchedule                                     │ │
│  │  │  └─ Invoke-FlashdbScheduledOperation                        │ │
│  │  │  └─ Get-FlashdbScheduleExecutionHistory                     │ │
│  │  │                                                              │ │
│  │  ├─ MetricsService.ps1                                          │ │
│  │  │  └─ Get-FlashdbMetricsSummary                               │ │
│  │  │  └─ Get-FlashdbOperationMetrics                             │ │
│  │  │  └─ Get-FlashdbMethodComparison                             │ │
│  │  │                                                              │ │
│  │  └─ DateUtilities.ps1, QueryBuilder.ps1                        │ │
│  │                                                                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                │                                           │
│                   Data & State Management Layer                            │
│                                │                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                   METADATA & PERSISTENCE                           │ │
│  ├──────────────────────────────────────────────────────────────────────┤ │
│  │                                                                    │ │
│  │  Files on C:\FlashDB\Metadata\:                                  │ │
│  │  ├─ golden-images.json (Phase 2)                                │ │
│  │  ├─ clones.json (Phase 2)                                       │ │
│  │  ├─ checkpoints.json (Phase 2)                                  │ │
│  │  ├─ operations.json (Phase 2) [31 fields]                       │ │
│  │  ├─ batch-jobs.json (Phase 3 NEW)                               │ │
│  │  ├─ schedules.json (Phase 3 NEW)                                │ │
│  │  └─ metrics.json (Phase 3 NEW) [time-series]                    │ │
│  │                                                                    │ │
│  │  Each file includes:                                             │ │
│  │  ├─ Current state snapshot                                       │ │
│  │  ├─ Timestamp & version                                          │ │
│  │  └─ Backup copy (*.bak)                                          │ │
│  │                                                                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                │                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │              SQL SERVER 2022 (Docker Container)                   │ │
│  │                        Port 1433                                  │ │
│  │                                                                    │ │
│  │  Golden Images (VHDX files)                                      │ │
│  │  ├─ Source databases (backup/restore)                            │ │
│  │  └─ Golden database copies (on VHDX)                             │ │
│  │                                                                    │ │
│  │  Clone Databases                                                 │ │
│  │  └─ Attached differencing disks                                  │ │
│  │                                                                    │ │
│  │  Metadata Tables (Optional - Phase 3)                            │ │
│  │  ├─ BatchJobs (for persistent tracking)                         │ │
│  │  ├─ Schedules (for permanent storage)                           │ │
│  │  └─ Metrics (for data warehouse querying)                       │ │
│  │                                                                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │                  BACKGROUND JOBS (Phase 3 NEW)                     │ │
│  ├──────────────────────────────────────────────────────────────────────┤ │
│  │                                                                    │ │
│  │  Scheduler Service (Node.js)                                     │ │
│  │  ├─ Evaluates schedules every 60 seconds                        │ │
│  │  ├─ Executes due checkpoint creation                            │ │
│  │  ├─ Runs retention cleanup policies                             │ │
│  │  └─ Records execution history                                   │ │
│  │                                                                    │ │
│  │  Batch Job Queue (Node.js)                                       │ │
│  │  ├─ Manages concurrent clone creation (N at once)               │ │
│  │  ├─ Reports progress to connected clients                       │ │
│  │  └─ Handles partial failures & retries                          │ │
│  │                                                                    │
│  │  Metrics Aggregator (Node.js)                                    │ │
│  │  ├─ Rolls up operation logs into daily buckets                  │ │
│  │  ├─ Calculates trend lines & comparisons                        │ │
│  │  └─ Archives old raw data                                       │ │
│  │                                                                    │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Diagram: Batch Operations

```
┌──────────────────────────────────────────────────────────────────────┐
│              USER CREATES BATCH (5 CLONES) - SEQUENCE               │
└──────────────────────────────────────────────────────────────────────┘

1. USER:
   GUI BatchCloneForm.tsx
   ├─ Input: goldImageId='img-123', count=5, namePrefix='app'
   └─ Click: "Create Batch"

2. API CALL:
   POST /api/batch/clones
   {
     "goldenImageId": "img-123",
     "cloneCount": 5,
     "cloneNamePrefix": "app",
     "instancePathPattern": "C:\\SQLSERVER\\{index}",
     "storagePathPattern": "D:\\VHD\\{index}"
   }

3. EXPRESS ROUTE (batch.ts):
   ├─ Validate input (count range, paths exist)
   ├─ Create batch job record: { id: 'batch-xxx', status: 'pending' }
   └─ Call BatchService.createBatch()

4. BATCH SERVICE (batchService.ts):
   ├─ Queue 5 clone creation tasks
   ├─ Register progress listeners
   └─ Return { batchId, operationIds }

5. POWERSHELL EXECUTION:
   PowerShell Service spawns: New-FlashdbBatchClone -GoldenImageId 'img-123' -Count 5

6. BATCH JOB SERVICE (BatchJobService.ps1):
   ├─ Create job queue
   ├─ Loop: for ($i = 1; $i -le 5; $i++)
   │  ├─ Call: New-FlashdbClone -CloneName "app-$i"
   │  ├─ Record: operation_$i.json → operations.json
   │  ├─ Update: batch_xxx.json { completed: $i, status: 'running' }
   │  └─ Emit: progress event (33%, 66%, etc.)
   ├─ On error: log to operation log, continue or abort
   └─ Write final: batch_xxx.json { status: 'completed', completedAt }

7. API RESPONSE TO CLIENT:
   Initial (immediate):
   {
     "batchId": "batch-xxx",
     "status": "running",
     "totalOperations": 5,
     "completedOperations": 0,
     "operationIds": ["op-1", "op-2", "op-3", "op-4", "op-5"]
   }

8. GUI PROGRESS MONITOR:
   GET /api/batch/batch-xxx (poll every 1 second)
   Response updates as operations complete:
   {
     "status": "running",
     "completedOperations": 1,
     "progress": 20,
     "operations": [
       { "id": "op-1", "status": "completed", "duration": 2500 },
       { "id": "op-2", "status": "running", "duration": 1200 },
       { "id": "op-3", "status": "pending", ... },
       ...
     ]
   }

9. COMPLETION:
   GET /api/batch/batch-xxx
   {
     "status": "completed",
     "completedOperations": 5,
     "progress": 100,
     "totalDuration": 12500,
     "avgOperationTime": 2500
   }

10. METADATA UPDATED:
    ├─ clones.json: 5 new clone entries
    ├─ operations.json: 5 new operation entries (31 fields each)
    └─ batch-jobs.json: batch-xxx entry with full history
```

## Data Flow Diagram: Scheduling

```
┌──────────────────────────────────────────────────────────────────────┐
│          USER SCHEDULES DAILY CHECKPOINT - SEQUENCE                 │
└──────────────────────────────────────────────────────────────────────┘

1. USER:
   GUI ScheduleForm.tsx
   ├─ Select: clone = 'clone-123'
   ├─ Input: name = 'Daily-2am', schedule.type = 'daily', schedule.startAt = '02:00'
   ├─ Config: retentionDays = 7, autoRollbackOnError = false
   └─ Click: "Create Schedule"

2. API CALL:
   POST /api/schedules
   {
     "name": "Daily-2am",
     "cloneId": "clone-123",
     "operationType": "checkpoint",
     "schedule": {
       "type": "daily",
       "startAt": "2026-06-07T02:00:00Z",
       "repeatEvery": 1
     },
     "config": {
       "checkpointNamePattern": "{date}-{time}",
       "retentionDays": 7
     }
   }

3. EXPRESS ROUTE (schedules.ts):
   ├─ Validate: clone exists, cron expression valid
   ├─ Calculate: nextRunAt = tomorrow at 02:00
   ├─ Create: schedule record
   └─ Return { scheduleId, nextRunAt }

4. METADATA STORED:
   ├─ schedules.json appends new schedule
   └─ schedule_xxx.json created with full config

5. SCHEDULER SERVICE RUNS (every 60 seconds):
   SchedulerService.ps1 main loop:
   ├─ Read: schedules.json
   ├─ For each schedule:
   │  ├─ IF now >= nextRunAt:
   │  │  ├─ Create execution record: { id: 'exec-xxx', status: 'running' }
   │  │  ├─ Call: Invoke-FlashdbScheduledOperation -ScheduleId
   │  │  ├─ On success:
   │  │  │  ├─ Update: execution to { status: 'completed' }
   │  │  │  ├─ Update: schedule.lastExecutionAt = now
   │  │  │  ├─ Calculate: nextRunAt = now + 1 day
   │  │  │  └─ Trigger: retention cleanup (delete checkpoints older than 7 days)
   │  │  └─ On failure:
   │  │     ├─ Update: execution to { status: 'failed', error: '...' }
   │  │     └─ Optionally: trigger auto-rollback
   │  │
   │  └─ ELSE: wait for next evaluation
   │
   └─ Every 10 iterations: persist schedules.json

6. AT 02:00 UTC:
   Scheduler detects: now >= schedule.nextRunAt
   ├─ Calls: Invoke-FlashdbScheduledOperation -ScheduleId 'schedule-xxx'
   │  └─ This calls: New-FlashdbCheckpoint -CloneId 'clone-123' -CheckpointName 'Daily-2026-06-07-02-00'
   │
   ├─ Creates: checkpoint with auto-generated name
   │  └─ checkpoints.json gets new entry
   │
   └─ Records: execution_xxx.json { status: 'completed', startedAt, completedAt, duration }

7. RETENTION POLICY RUNS:
   After checkpoint creation:
   ├─ Find: all checkpoints for clone-123
   ├─ Filter: createdAt < (now - 7 days)
   ├─ For each old checkpoint:
   │  ├─ Call: Remove-FlashdbCheckpoint
   │  └─ Log: deletion to operations.json
   │
   └─ Update: schedules.json to reflect new nextRunAt

8. USER VIEWS SCHEDULE:
   GET /api/schedules/schedule-xxx
   Response:
   {
     "id": "schedule-xxx",
     "name": "Daily-2am",
     "cloneId": "clone-123",
     "status": "enabled",
     "nextRunAt": "2026-06-08T02:00:00Z",
     "lastExecutionAt": "2026-06-07T02:00:15Z",
     "lastExecutionStatus": "completed",
     "executions": [
       { "id": "exec-1", "startedAt": "2026-06-07T02:00:15Z", "duration": 3200, "status": "completed" },
       { "id": "exec-2", "startedAt": "2026-06-06T02:00:12Z", "duration": 3100, "status": "completed" },
       ...
     ]
   }

9. CLEANUP RUNS AUTOMATICALLY:
   Every 86,400 seconds (daily):
   ├─ For each schedule:
   │  ├─ Find: checkpoints older than retentionDays
   │  └─ Delete: old checkpoints (log all deletions)
   └─ Compact: schedules.json (remove old execution records)
```

## Feature Interaction Map

```
┌──────────────────────────────────────────────────────────────────────┐
│                    FEATURE INTERACTION MATRIX                        │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Batch Operations                                                    │
│  ├─ Uses: Existing New-FlashdbClone, New-FlashdbCheckpoint         │
│  ├─ Extends: With N-parallel execution + progress tracking         │
│  ├─ Depends: None (standalone feature)                              │
│  └─ Enables: Scheduling (batch checkpoints), Metrics (operation stats)
│                                                                      │
│  Scheduling                                                          │
│  ├─ Uses: Batch checkpoints (via Invoke-FlashdbBatchCheckpoint)    │
│  ├─ Depends: Batch Operations (for parallel checkpoint support)    │
│  ├─ Extends: With time-based recurring operations                   │
│  └─ Enables: Metrics (scheduled operation tracking)                │
│                                                                      │
│  Search & Filtering                                                 │
│  ├─ Uses: Standard metadata files (no new data)                    │
│  ├─ Depends: None (reads existing metadata)                        │
│  ├─ Extends: With query builders & pagination                      │
│  └─ Provides: Data to Metrics & Scheduling (queries historical data)
│                                                                      │
│  Metrics Dashboard                                                   │
│  ├─ Uses: All operations (via operations.json + batch/schedule logs)
│  ├─ Depends: Batch, Scheduling, Search (reads their operations)   │
│  ├─ Extends: With aggregation & visualization                      │
│  └─ Consumes: 100% of new operation data                           │
│                                                                      │
│  CI/CD Integration                                                   │
│  ├─ Uses: Docker images (from Docker feature)                      │
│  ├─ Depends: None (can start immediately)                          │
│  ├─ Extends: With automated test execution                         │
│  └─ Tests: All Phase 3 features                                    │
│                                                                      │
│  Docker Images                                                       │
│  ├─ Uses: All API features (batch, scheduling, etc)               │
│  ├─ Depends: CI/CD (to provide test validation)                   │
│  ├─ Extends: With containerization & deployment                    │
│  └─ Enables: Production deployment & scaling                       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

## Metadata Evolution: Phase 2 vs Phase 3

### Phase 2 Structure (Current)
```
C:\FlashDB\Metadata\
├─ golden-images.json        [array of golden image objects]
├─ clones.json               [array of clone objects]
├─ checkpoints.json          [array of checkpoint objects]
└─ operations.json           [array of 31-field operation logs]
```

### Phase 3 Structure (New)
```
C:\FlashDB\Metadata\
├─ [Phase 2 files continue]
├─ batch-jobs.json           [array of batch job records with operations]
├─ schedules.json            [array of schedule definitions + execution refs]
├─ schedule-executions.json  [time-series execution history]
└─ metrics/
   ├─ daily-2026-06-06.json  [daily aggregated metrics]
   ├─ daily-2026-06-05.json
   └─ ... (monthly cleanup keeps last 180 days)
```

### New Fields in operations.json (Phase 3)

```json
{
  "id": "op-xxx",
  "type": "clone|checkpoint|batch|schedule",
  
  // Phase 2 fields (existing):
  "timestamp": "2026-06-06T10:30:00Z",
  "duration": 2500,
  "status": "success|failed",
  "error": null,
  
  // Phase 3 NEW fields:
  "batchId": "batch-xxx",              // links to batch job
  "scheduleId": "schedule-xxx",        // links to schedule
  "priority": "normal|high|low",       // for queue ordering
  "retries": 0,                        // number of retries
  "metrics": {
    "cpuPercent": 45.2,
    "memoryMB": 512,
    "diskBytesRead": 1024000,
    "diskBytesWritten": 2048000,
    "throughputMBps": 12.5
  }
}
```

## API Versioning Strategy

**No version numbers in routes (backward compatible):**
- Phase 2: `/api/clones`, `/api/golden-images`, `/api/checkpoints`
- Phase 3: `/api/batch/*`, `/api/schedules/*`, `/api/metrics/*`

**Separation by purpose, not version:**
- Resource routes (clones, images) → unchanged
- Batch coordination → new `/api/batch/*`
- Scheduling → new `/api/schedules/*`
- Querying → enhanced existing routes + `/api/search`
- Observability → new `/api/metrics/*`

**Breaking changes (NEVER):**
- Existing endpoint responses remain identical
- Query parameters only added, never removed
- New fields appended to responses, never removed

## Database vs File Storage Decision

**Why File-Based (Phase 2-3):**
- Faster development (no DB schema migrations)
- Easier testing (JSON files as fixtures)
- Better portability (zip entire metadata folder)
- Human-readable debugging

**Phase 3 consideration:**
- If metrics grow to >100MB/day, migrate metrics to SQL Server table
- Batch jobs & schedules stay in JSON (small size)
- Operations log can stay JSON if <1GB total

**Migration path (if needed):**
```
Phase 3.5: Optional "Hybrid Mode"
├─ JSON: Active batch jobs, schedules, recent operations
├─ SQL: Historical operations, metrics (queries via /api/metrics)
└─ Replication daemon: Copy completed operations to SQL nightly
```

---

This architecture enables 3-4 agents to develop Phase 3 features in parallel while maintaining backward compatibility and system stability.
