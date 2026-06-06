# Phase 5b.4 Multi-Instance - Quick Reference Card

## What Was Built

A complete **multi-instance cluster architecture** for FlashDB API with:
- 3 API instances (1 primary + 2 replicas)
- Shared SQL Server database for state
- Automatic instance discovery & registration
- 5-second heartbeat monitoring
- 30-second TTL for dead instance detection
- Admin API for cluster management

## Key Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/api/src/config/instanceConfig.ts` | 412 | Instance lifecycle management |
| `src/api/src/routes/admin.ts` | 178 | Cluster admin endpoints |
| `docker-compose-multi.yml` | 135 | 3-instance Docker setup |
| `src/api/src/__tests__/multiInstance.test.ts` | 850+ | 38 test cases |

## Quick Start (Windows)

```powershell
# From project root
.\test-multi-instance.ps1
```

## Manual Testing (All Platforms)

```bash
# Build
cd src/api && npm run build

# Start 3-instance cluster
docker-compose -f docker-compose-multi.yml up -d

# Wait for health (~30s)
docker-compose -f docker-compose-multi.yml ps

# Run tests
npm test -- --testPathPattern=multiInstance

# Stop
docker-compose -f docker-compose-multi.yml down
```

## Test Endpoints

```bash
# Current instance info
curl http://localhost:3001/api/admin/instance

# All active instances (cluster discovery)
curl http://localhost:3001/api/admin/instances

# Cluster health status
curl http://localhost:3001/api/admin/cluster-status

# Manual heartbeat trigger
curl -X POST http://localhost:3001/api/admin/heartbeat

# Clean stale instances
curl -X POST http://localhost:3001/api/admin/cleanup
```

## Test Coverage

- **38 Total Tests** across 10 categories
- Instance registration & discovery (3)
- Cluster discovery (3)
- Cluster status monitoring (4)
- Heartbeat management (3)
- State consistency (3)
- Information consistency (1)
- Cluster cleanup (2)
- Status fields (3)
- Error handling (2)
- Performance (2)

## Success Criteria

✓ All 3 instances register in database  
✓ Instance discovery works (each sees all)  
✓ Cluster status reports healthy  
✓ State consistent across instances  
✓ All 38 tests pass  
✓ Response times < 1 second  
✓ Graceful shutdown works  

## Key Metrics

| Metric | Value |
|--------|-------|
| Heartbeat Interval | 5 seconds |
| Instance TTL | 30 seconds |
| API Response Time | < 500ms |
| Cluster Status Response | < 1000ms |
| Total Test Cases | 38 |
| Instances in Test | 3 (1 primary + 2 replicas) |
| Database Tables | 1 (flashdb_instances) |
| Performance Indexes | 4 |

## Architecture

```
┌─────────────────────────┐
│   SQL Server (1433)     │
│ flashdb_instances table │
└────────┬─────┬─────┬────┘
         │     │     │
    ┌────▼─────▼─────▼────┐
    │   3 API Instances   │
    │  (3001, 3002, 3003) │
    └────┬─────┬─────┬────┘
         │     │     │
    ┌────▼─────▼─────▼────┐
    │  Admin API Routes   │
    │ /api/admin/*        │
    └─────────────────────┘
```

## Docker Commands

```bash
# Start
docker-compose -f docker-compose-multi.yml up -d

# View status
docker-compose -f docker-compose-multi.yml ps

# View logs
docker-compose -f docker-compose-multi.yml logs -f

# Stop
docker-compose -f docker-compose-multi.yml down

# Clean all
docker-compose -f docker-compose-multi.yml down -v
```

## Database Query

```sql
-- Check instance registration
SELECT instance_id, role, status, last_heartbeat 
FROM dbo.flashdb_instances
ORDER BY last_heartbeat DESC;

-- Count active instances
SELECT COUNT(*) as active_count 
FROM dbo.flashdb_instances 
WHERE status = 'active' 
  AND last_heartbeat > DATEADD(second, -30, GETUTCDATE());
```

## Environment Variables

```bash
INSTANCE_ID=api-primary-001      # Unique ID
INSTANCE_ROLE=primary            # primary or replica
INSTANCE_HOST=api-primary        # Host name
CLUSTER_ENABLED=true             # Enable clustering
PORT=3001                         # API port
SQL_SERVER_HOST=sqlserver         # DB host
SQL_DATABASE=FlashDB              # DB name
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Ports already in use | `docker-compose down` first |
| SQL Server won't start | Check SA password, wait 30s |
| Instances not registering | Check SQL Server logs |
| Tests timeout | Increase timeout, check DB |
| Memory errors | Need 3GB RAM minimum |

## Documentation

- **Full Guide:** `/MULTI_INSTANCE_TESTING_GUIDE.md`
- **Validation:** `/MULTI_INSTANCE_VALIDATION_CHECKLIST.md`
- **Implementation:** `/PHASE_5B4_MULTI_INSTANCE_IMPLEMENTATION_COMPLETE.md`

## Expected Output (Success)

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
  ✓ State consistency verified
Step 8: Testing heartbeat functionality...
  ✓ All heartbeats successful
Step 9: Running Jest tests...
  PASS multiInstance.test.ts
  Tests: 38 passed, 38 total

========================================
✓ All multi-instance tests passed!
========================================
```

## Next Phase (5b.5)

After passing Phase 5b.4:
- Load balancing across instances
- Automatic failover
- Instance scaling policies
- Advanced monitoring metrics
- Distributed tracing

## Support

For issues or questions:
1. Check MULTI_INSTANCE_TESTING_GUIDE.md Troubleshooting section
2. Review logs: `docker-compose -f docker-compose-multi.yml logs`
3. Check database: `SELECT * FROM dbo.flashdb_instances`
4. Run individual tests: `npm test -- --testNamePattern="specific test"`

---

**Status:** ✓ READY FOR TESTING  
**Build:** ✓ SUCCESSFUL  
**Tests:** 38 test cases prepared  
**Expected Result:** All tests pass, cluster healthy
