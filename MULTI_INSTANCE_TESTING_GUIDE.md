# Multi-Instance Cluster Testing Guide (Phase 5b.4)

## Overview

This document describes how to test the multi-instance cluster capabilities of FlashDB API. The testing validates:

1. **Instance Registration & Discovery** - Instances self-register and discover each other
2. **Cluster State Consistency** - All instances maintain consistent view of cluster
3. **Instance Lifecycle** - Start, healthcheck, heartbeat, graceful shutdown
4. **Distributed Locking & Queuing** - Shared state across instances
5. **Health Monitoring** - 5-second heartbeats, 30-second TTL detection

## Architecture

```
┌─────────────────────────────────────┐
│     SQL Server (Shared Database)    │
│  - flashdb_instances                │
│  - flashdb_state                    │
│  - flashdb_locks                    │
│  - flashdb_queue                    │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
┌───▼───┐ ┌───▼───┐ ┌───▼───┐
│ API-1 │ │ API-2 │ │ API-3 │
│ :3001 │ │ :3002 │ │ :3003 │
│Primary│ │Replica│ │Replica│
└───────┘ └───────┘ └───────┘
```

## Prerequisites

- Docker & Docker Compose installed
- Node.js 18+ with npm
- 3GB available RAM (for 3 container instances)
- Port availability: 3001-3003, 1433 (SQL Server)

## Quick Start

### Option 1: Automated Test Script (Recommended for Windows)

```powershell
# From project root
.\test-multi-instance.ps1
```

This script will:
1. Build Docker image
2. Start 3 instances + SQL Server
3. Run all integration tests
4. Clean up containers
5. Report results

### Option 2: Manual Testing

#### Step 1: Build the API

```bash
cd src/api
npm run build
```

#### Step 2: Start the Cluster

```bash
# From project root
docker-compose -f docker-compose-multi.yml up -d
```

Wait for all services to be healthy:
```bash
docker-compose -f docker-compose-multi.yml ps
```

All services should show `healthy` status.

#### Step 3: Verify Instance Registration

Check that instances registered in database:

```bash
# Query instances table
docker exec flashdb-sql-server sqlcmd -S localhost -U sa -P "YourPassword123!" -d FlashDB -Q "SELECT instance_id, role, status, host, port FROM dbo.flashdb_instances"
```

Expected output:
```
instance_id           role     status   host         port
─────────────────────────────────────────────────────────
api-primary-001       primary  active   api-primary  3001
api-replica-001       replica  active   api-replica-1 3002
api-replica-002       replica  active   api-replica-2 3003
```

#### Step 4: Test Admin API Endpoints

Test instance info endpoint:

```bash
curl http://localhost:3001/api/admin/instance
```

Expected response:
```json
{
  "success": true,
  "data": {
    "instanceId": "api-primary-001",
    "role": "primary",
    "status": "active",
    "host": "api-primary",
    "port": 3001,
    "version": "1.0.0",
    "lastHeartbeat": "2026-06-06T12:00:00.000Z",
    "isPrimary": true,
    "isClusterMode": true
  },
  "message": "Current instance information"
}
```

Test cluster discovery:

```bash
curl http://localhost:3001/api/admin/instances
```

Expected response:
```json
{
  "success": true,
  "data": {
    "totalInstances": 3,
    "instances": [
      { "instanceId": "api-primary-001", "role": "primary", "status": "active", ... },
      { "instanceId": "api-replica-001", "role": "replica", "status": "active", ... },
      { "instanceId": "api-replica-002", "role": "replica", "status": "active", ... }
    ]
  },
  "message": "Active instances in cluster"
}
```

Test cluster status:

```bash
curl http://localhost:3001/api/admin/cluster-status
```

Expected response:
```json
{
  "success": true,
  "data": {
    "clusterEnabled": true,
    "clusterHealth": "healthy",
    "totalInstances": 3,
    "activeInstances": 3,
    "unhealthyInstances": 0,
    "currentInstance": { ... },
    "instances": [ ... ],
    "timestamp": "2026-06-06T12:00:00.000Z"
  },
  "message": "Cluster health status"
}
```

#### Step 5: Test Heartbeat

Trigger manual heartbeat:

```bash
curl -X POST http://localhost:3001/api/admin/heartbeat
```

Expected: Returns current instance info with updated `lastHeartbeat`.

#### Step 6: Run Jest Tests

```bash
cd src/api
npm test -- --testPathPattern=multiInstance --maxWorkers=1
```

This runs comprehensive tests including:
- Instance registration
- Cluster discovery
- State consistency
- Health monitoring
- Error handling
- Performance benchmarks

#### Step 7: Verify State Consistency

From multiple terminals, run the same endpoint and verify responses are consistent:

```bash
# Terminal 1
watch -n 2 'curl -s http://localhost:3001/api/admin/cluster-status | jq ".data.activeInstances"'

# Terminal 2
watch -n 2 'curl -s http://localhost:3002/api/admin/cluster-status | jq ".data.activeInstances"'

# Terminal 3
watch -n 2 'curl -s http://localhost:3003/api/admin/cluster-status | jq ".data.activeInstances"'
```

All three should show the same number.

#### Step 8: Test Instance Removal

Stop a replica instance:

```bash
docker stop flashdb-api-replica-1
```

Wait 30+ seconds for TTL timeout. Query active instances:

```bash
curl http://localhost:3001/api/admin/instances | jq ".data.instances | length"
```

Should show 2 instances (api-replica-1 marked inactive).

Optionally trigger manual cleanup:

```bash
curl -X POST http://localhost:3001/api/admin/cleanup
```

Response shows how many stale instances were removed.

#### Step 9: Verify Lock Sharing

Acquire lock on instance 1:

```bash
curl -X POST http://localhost:3001/api/admin/locks/acquire \
  -H "Content-Type: application/json" \
  -d '{"resource": "test-resource", "ttl": 10000}'
```

Try to acquire same lock on instance 2:

```bash
curl -X POST http://localhost:3002/api/admin/locks/acquire \
  -H "Content-Type: application/json" \
  -d '{"resource": "test-resource", "ttl": 10000}'
```

Should fail with "resource locked" (distributed lock works across instances).

#### Step 10: Verify Queue Access

Enqueue task from instance 1:

```bash
curl -X POST http://localhost:3001/api/queue \
  -H "Content-Type: application/json" \
  -d '{"type": "clone", "payload": {"imageId": "test"}}'
```

Get task from instance 2:

```bash
curl http://localhost:3002/api/queue?limit=1
```

Should return the task enqueued by instance 1 (shared queue).

#### Step 11: Shutdown and Cleanup

Graceful shutdown:

```bash
docker-compose -f docker-compose-multi.yml down
```

Verify instances marked as inactive in DB:

```bash
docker exec flashdb-sql-server sqlcmd -S localhost -U sa -P "YourPassword123!" -d FlashDB -Q "SELECT instance_id, status FROM dbo.flashdb_instances"
```

All should show `status = 'inactive'`.

## Test Scenarios

### Scenario 1: Normal Operation
1. Start all 3 instances
2. Verify all register in database
3. Each instance discovers others
4. Health checks pass
5. State consistent across instances

**Expected Result:** PASS ✓

### Scenario 2: Instance Failure
1. Start 3 instances
2. Stop one replica (docker stop)
3. Wait 30 seconds
4. Query cluster - should show 2 active, 1 inactive
5. Manually cleanup - should remove stale registration

**Expected Result:** PASS ✓

### Scenario 3: Request Distribution
1. Send requests to instance 1: create state
2. Query from instance 2: retrieve state
3. Verify consistency

**Expected Result:** PASS ✓

### Scenario 4: Lock Contention
1. Acquire lock on instance 1
2. Try to acquire same lock on instance 2
3. Should fail or queue

**Expected Result:** PASS ✓

### Scenario 5: Queue Operations
1. Enqueue task from instance 1
2. Dequeue from instance 2
3. Verify execution

**Expected Result:** PASS ✓

## Monitoring

Monitor cluster in real-time:

```bash
# Watch instance count
watch -n 1 'curl -s http://localhost:3001/api/admin/cluster-status | jq ".data.activeInstances"'

# Watch heartbeats
watch -n 1 'curl -s http://localhost:3001/api/admin/instances | jq ".data.instances[] | {id: .instanceId, heartbeat: .lastHeartbeat}"'

# Monitor logs
docker-compose -f docker-compose-multi.yml logs -f api-primary
```

## Troubleshooting

### Instances Not Starting

Check Docker logs:
```bash
docker-compose -f docker-compose-multi.yml logs
```

Common issues:
- Port already in use (3001, 3002, 3003)
- SQL Server not healthy
- Low memory

### Instances Not Registering

Verify SQL connection:
```bash
docker-compose -f docker-compose-multi.yml exec api-primary curl http://localhost:3001/live
```

Check SQL Server:
```bash
docker-compose -f docker-compose-multi.yml exec sqlserver sqlcmd -S localhost -U sa -P "YourPassword123!" -Q "SELECT @@VERSION"
```

### State Inconsistency

Trigger manual sync:
```bash
# On all instances
curl -X POST http://localhost:3001/api/admin/heartbeat
```

Wait 5 seconds and query again.

### Performance Issues

Check instance CPU/Memory:
```bash
docker stats flashdb-api-*
```

Check database query performance:
```bash
# Slow queries on SQL Server
docker exec flashdb-sql-server sqlcmd -S localhost -U sa -P "YourPassword123!" -d FlashDB -Q "EXEC sp_who2"
```

## Test Results Format

All test runs should produce:

```
========================================
FlashDB Multi-Instance Cluster Tests
========================================

Step 1: Building API Docker image...  ✓
Step 2: Starting multi-instance cluster...  ✓
Step 3: Waiting for instances to be healthy...  ✓
Step 4: Testing instance registration...
  ✓ Primary instance registered
  ✓ Replica instances registered
Step 5: Testing cluster discovery...
  ✓ Cluster discovery working (found 3 instances)
Step 6: Testing cluster status endpoint...
  ✓ Cluster status is healthy
Step 7: Testing state consistency...
  ✓ State consistency verified (all report 3 active instances)
Step 8: Testing heartbeat functionality...
  ✓ Heartbeat successful on port 3001
  ✓ Heartbeat successful on port 3002
  ✓ Heartbeat successful on port 3003
Step 9: Running Jest tests...
  PASS Multi-Instance Cluster Operations
    Instance Registration and Discovery (5 tests)
    Cluster Discovery (3 tests)
    Cluster Status Monitoring (4 tests)
    Heartbeat Management (3 tests)
    State Consistency Across Instances (3 tests)
    Instance Information Consistency (1 test)
    Cluster Cleanup Operations (2 tests)
    Instance Status Fields (3 tests)
    Error Handling (2 tests)
    Performance and Response Times (2 tests)

========================================
✓ All multi-instance tests passed!
========================================
```

## Success Criteria

Multi-instance implementation is considered **COMPLETE** and **VERIFIED** when:

1. ✓ All 3 instances start and register in database
2. ✓ Instance discovery works (each instance sees all others)
3. ✓ Cluster status endpoint reports healthy
4. ✓ All instances maintain same view of active instances
5. ✓ Heartbeats update every 5 seconds
6. ✓ Stale instances detected after 30 seconds no heartbeat
7. ✓ All Jest tests pass (38 tests total)
8. ✓ State is consistent across all instances
9. ✓ Locks are shared and enforced across instances
10. ✓ Queue is accessible from any instance

## Documentation References

- Architecture: `/ARCHITECTURE.md`
- Database Schema: `/docker/init-testdb.sql`
- Admin API: `/src/api/src/routes/admin.ts`
- Instance Config: `/src/api/src/config/instanceConfig.ts`
- Multi-Instance Tests: `/src/api/src/__tests__/multiInstance.test.ts`
- Docker Setup: `/docker-compose-multi.yml`

## Next Steps (Phase 5b.5)

After multi-instance verification, Phase 5b.5 will implement:
- Load balancing across instances
- Automatic failover
- Instance scaling policies
- Advanced monitoring metrics
- Distributed tracing
