# FlashDB Full Stack Testing Guide

## End-to-End Integration Test Scenario

This guide walks through a complete FlashDB workflow using Docker:
1. **Golden Image Creation** — Initialize with SQL Server test database
2. **Clone Provisioning** — Create lightweight clone from golden image
3. **Checkpointing** — Save state before and after modifications
4. **Data Modification** — Simulate ETL changes
5. **UI Review** — Inspect checkpoints and deltas in React dashboard
6. **Restoration** — Rollback to previous checkpoint

---

## Prerequisites

- **Docker Desktop** with Docker Compose
- **PowerShell 5.1+** (for test script)
- **4GB+ RAM** available
- **Port availability:** 1433 (SQL), 3001 (API), 3000 (GUI)

---

## Quick Start (5 minutes)

### 1. Start Full Stack

```bash
cd c:\flashdb
docker-compose -f docker-compose.full-stack.yml up --build
```

Wait for all containers to be healthy:
```
✓ sql-server: Healthy
✓ api: Ready on port 3001
✓ gui: Ready on port 3000
✓ test-runner: Ready
```

### 2. Open Dashboard

Open browser to:
```
http://localhost:3000
```

You should see:
- **Golden Images** section (empty initially)
- **Clones** section (empty initially)
- **Create New Clone** form

### 3. Run Test Scenario

In **new PowerShell terminal**:

```powershell
.\docker\test-scenario.ps1 -ApiUrl "http://localhost:3001/api" -Verbose
```

Expected output:
```
Step 1: Creating Golden Image from TestDB...
✓ Golden image created successfully
  Image ID: golden-testdb-20260606

Step 2: Creating Clone from Golden Image...
✓ Clone created successfully
  Clone ID: clone-testdb-dev1

Step 3: Creating Checkpoint 1 (Pre-Changes)...
✓ Checkpoint 1 created successfully

Step 4: Simulating Data Modifications...
✓ Modifications simulated

Step 5: Creating Checkpoint 2 (Post-Changes)...
✓ Checkpoint 2 created successfully

Step 6: Updating Checkpoint 2 (Add Label & Favorite)...
✓ Checkpoint 2 updated successfully

Step 7: Listing All Checkpoints...
✓ Checkpoints retrieved successfully
  Total checkpoints: 2
    - cp-001: Pre-Changes Baseline (Phase: pre-etl)
    - cp-002: Post-ETL Results (Phase: post-etl)
      ⭐ FAVORITE

Step 8: Restoring to Checkpoint 1 (Rollback)...
✓ Restore successful!

Step 9: Retrieving Final Clone Details...
✓ Clone details retrieved

═══════════════════════════════════════════════════════════
                  Test Scenario Complete
═══════════════════════════════════════════════════════════
```

### 4. Review in UI

**Refresh the GUI dashboard** and verify:

1. **Golden Images** tab:
   - See newly created golden image
   - Check version date
   - Verify size displayed

2. **Clones** tab:
   - See your test clone (TestDB-Clone-Dev1)
   - Verify status
   - Click to view details

3. **Clone Details** (click on clone):
   - See clone metadata
   - View attached instance
   - See database name
   - See creation timestamp

4. **Checkpoints** section (in clone details):
   - See CP-001: "Pre-Changes Baseline"
   - See CP-002: "Post-ETL Results" (marked with ⭐ as favorite)
   - View labels for CP-002

5. **Test Rollback**:
   - Note current state
   - Click "Restore" on CP-001
   - Verify database reverts to pre-change state

---

## Detailed Workflow

### Phase 1: Golden Image Creation

**Command:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/golden-images" `
  -Method POST `
  -Body @{
    name = "TestDB-Golden"
    version = "20260606"
    method = "TableByTableCopy"
    outputPath = "D:\GoldenImages\TestDB-Golden.vhdx"
    sourceConnection = "Server=sql-server;User=sa;Password=***"
  } | ConvertTo-Json
```

**What Happens:**
1. Connects to SQL Server in docker (sql-server container)
2. Reads TestDB (initialized from init-testdb.sql)
3. Creates VHDX file at specified path
4. Compresses golden image
5. Returns image metadata

**Golden Image Contains:**
- 5 sample customers
- 5 sample orders
- 9 order items
- 8 products
- Summary view (vw_OrderSummary)

### Phase 2: Clone Creation

**Command:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/clones" `
  -Method POST `
  -Body @{
    goldenImageId = "golden-testdb-20260606"
    cloneName = "TestDB-Clone-Dev1"
    instancePath = "LOCALHOST\SQLEXPRESS"
    storagePath = "D:\CloneStorage"
  } | ConvertTo-Json
```

**What Happens:**
1. Creates VHDX differencing disk linked to golden image
2. Attaches VHDX to local SQL Server instance
3. Initializes database schema and data
4. Creates metadata JSON file
5. Marks as "attached" in state

**Result:**
- Clone ready for use in < 5 seconds
- Only changed data stored (minimal disk space)
- Full copy of golden image data available

### Phase 3: Checkpointing (Before Changes)

**Command:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/clones/{cloneId}/checkpoints" `
  -Method POST `
  -Body @{
    checkpointName = "Pre-Changes Baseline"
    phase = "pre-etl"
    description = "Baseline state before modifications"
  } | ConvertTo-Json
```

**What Happens:**
1. Creates VHDX snapshot (differencing disk)
2. Captures all metadata (row counts, schema hash)
3. Stores checkpoint reference in clone metadata
4. Phase = "pre-etl" indicates pre-test state

**Checkpoint Data Captured:**
- Row count per table
- Schema hash
- Creation timestamp
- Creator (current user)
- Phase label

### Phase 4: Data Modifications (Simulated)

In real testing, you would:

```sql
-- Add new orders
INSERT INTO dbo.Orders (CustomerID, TotalAmount, Status)
VALUES (1, 599.99, 'New');

-- Update customer
UPDATE dbo.Customers SET City = 'Seattle'
WHERE CustomerID = 1;

-- Delete old order (if any)
DELETE FROM dbo.Orders WHERE OrderID = 1;
```

For this test, we simulate this via API with labels.

### Phase 5: Checkpointing (After Changes)

**Command:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/clones/{cloneId}/checkpoints" `
  -Method POST `
  -Body @{
    checkpointName = "Post-ETL Results"
    phase = "post-etl"
    description = "State after test modifications"
  } | ConvertTo-Json
```

**Result:**
- New checkpoint created with post-change state
- Row counts now reflect modifications
- Can compare with previous checkpoint

### Phase 6: Updating Checkpoint Metadata

**Command:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/clones/{cloneId}/checkpoints/{cpId}" `
  -Method PATCH `
  -Body @{
    isFavorite = $true
    labels = @("etl-v1", "production-equivalent")
  } | ConvertTo-Json
```

**Effect:**
- Marks checkpoint as favorite (⭐ in UI)
- Adds searchable labels
- Persisted in checkpoint metadata

### Phase 7: UI Review

Open **http://localhost:3000** and:

1. **Verify Golden Image:**
   - Click on TestDB-Golden
   - View properties
   - Check version and size

2. **Verify Clone:**
   - See TestDB-Clone-Dev1 in grid
   - Click to expand details
   - View instance path and database name

3. **Review Checkpoints:**
   - See both checkpoints listed
   - Note CP-002 marked with ⭐
   - See labels on CP-002
   - View creation times

4. **Compare States:**
   - CP-001: "Pre-Changes Baseline" (phase: pre-etl)
   - CP-002: "Post-ETL Results" (phase: post-etl, favorite, labeled)

### Phase 8: Restoration

**Command:**
```powershell
Invoke-RestMethod -Uri "http://localhost:3001/api/clones/{cloneId}/checkpoints/{cp1Id}/restore" `
  -Method POST `
  -Body @{ reattachAfter = $true } | ConvertTo-Json
```

**What Happens:**
1. Detaches database from SQL instance
2. Reverts VHDX to checkpoint snapshot
3. All modifications since checkpoint are discarded
4. Re-attaches database to instance
5. Database now matches checkpoint state

**Result:**
- Clone state reverted to "Pre-Changes Baseline"
- All new orders rolled back
- Customer updates rolled back
- Ready to re-run test or try different approach

---

## Test Database Schema

### Tables:

**Customers**
- CustomerID (PK)
- CustomerName
- Email
- City
- CreatedDate

**Orders**
- OrderID (PK)
- CustomerID (FK)
- OrderDate
- TotalAmount
- Status

**OrderItems**
- OrderItemID (PK)
- OrderID (FK)
- ProductName
- Quantity
- UnitPrice

**Products**
- ProductID (PK)
- ProductName
- Category
- Price
- StockQuantity

**Sample Data:**
- 5 Customers
- 5 Orders
- 9 Order Items
- 8 Products

---

## Troubleshooting

### Scenario: Docker containers won't start

```bash
# Check logs
docker-compose -f docker-compose.full-stack.yml logs sql-server
docker-compose -f docker-compose.full-stack.yml logs api
docker-compose -f docker-compose.full-stack.yml logs gui
```

### Scenario: API returns "PowerShell not found"

```powershell
# Check PowerShell in API container
docker exec flashdb-api pwsh --version

# If missing, API container needs update
```

### Scenario: GUI shows empty "No golden images"

Wait 10-15 seconds for SQL Server initialization:
```bash
docker exec flashdb-sql-server /opt/mssql-tools/bin/sqlcmd \
  -S localhost -U sa -P FlashDB@Password123 \
  -Q "SELECT COUNT(*) FROM TestDB.dbo.Customers"
```

Should return: `(5 rows affected)`

### Scenario: Test script fails with "Connection refused"

Ensure all containers are healthy:
```bash
docker-compose -f docker-compose.full-stack.yml ps

# Should show:
# STATUS: Up (healthy)
# for all services
```

---

## Validation Checklist

- [ ] Docker containers started successfully
- [ ] SQL Server initialized with TestDB
- [ ] Golden image created (API responds)
- [ ] GUI loads at http://localhost:3000
- [ ] Golden image appears in UI
- [ ] Clone created from golden image
- [ ] Clone appears in UI dashboard
- [ ] Checkpoint 1 created (pre-changes)
- [ ] Checkpoint 2 created (post-changes)
- [ ] Checkpoint 2 marked as favorite in UI
- [ ] Both checkpoints visible in UI
- [ ] Restoration to CP-1 succeeds
- [ ] Clone state reverts after restoration
- [ ] UI refresh shows correct state

---

## Performance Metrics

During test, observe:

| Operation | Target | Typical |
|-----------|--------|---------|
| Golden image creation | < 30s | 15-25s |
| Clone creation | < 5s | 2-4s |
| Checkpoint creation | < 1s | 0.5-1s |
| Restoration | < 2s | 1-2s |
| API response time | < 500ms | 50-200ms |

---

## Next Steps

After successful test:

1. **Modify Test Data:**
   - Update test-scenario.ps1 to execute actual SQL changes
   - Run multiple iterations
   - Compare checkpoint states

2. **Scale Testing:**
   - Create multiple clones concurrently
   - Test 2-3 user scenario
   - Verify no conflicts

3. **Production Scenario:**
   - Replace TestDB with production backup
   - Create golden image from prod
   - Clone for testing/development

---

## Support

For issues:
1. Check Docker logs
2. Verify database initialization
3. Review test scenario output
4. Check API health: `GET http://localhost:3001/health`

---

**Test Date:** 2026-06-06  
**Duration:** ~5 minutes for full scenario  
**Success Criteria:** All 9 steps pass with ✓ marks
