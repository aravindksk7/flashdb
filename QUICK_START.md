# FlashDB Quick Start Guide

## Complete Setup (10 minutes)

### Prerequisites
- Docker Desktop installed and running
- PowerShell 5.1+
- Node.js 18+ (for API/GUI)
- 4GB+ RAM available

---

## Step 1: Start SQL Server in Docker (2 minutes)

```bash
# Open PowerShell and run:
docker run -d `
  --name flashdb-sql `
  -e ACCEPT_EULA=Y `
  -e SA_PASSWORD=FlashDB@Password123 `
  -e MSSQL_PID=Developer `
  -p 1433:1433 `
  -v sql-data:/var/opt/mssql/data `
  mcr.microsoft.com/mssql/server:2022-latest

# Wait 15-20 seconds for SQL Server to start
Write-Host "Waiting for SQL Server to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 20

# Test connection
sqlcmd -S localhost -U sa -P FlashDB@Password123 -Q "SELECT @@VERSION"
```

**Expected output:** SQL Server version information

---

## Step 2: Initialize Test Database (1 minute)

```bash
# Load the test database schema
sqlcmd -S localhost -U sa -P FlashDB@Password123 `
  -i ".\docker\init-testdb.sql"
```

**Expected output:**
```
Test database created successfully!
Tables: Customers, Orders, OrderItems, Products
Total Customers: 5
Total Orders: 5
Total Order Items: 9
Total Products: 8
```

---

## Step 3: Start REST API (2 minutes)

**Open NEW PowerShell terminal:**

```bash
cd c:\flashdb\src\api

# Install dependencies
npm install

# Start API server
npm run dev
```

**Expected output:**
```
FlashDB API running on http://localhost:3001
Environment: development
FlashDB Module: C:\flashdb\src\FlashDB\FlashDB.psm1
```

---

## Step 4: Start React GUI (2 minutes)

**Open ANOTHER NEW PowerShell terminal:**

```bash
cd c:\flashdb\src\gui

# Install dependencies
npm install

# Start GUI server
npm run dev
```

**Expected output:**
```
VITE v5.0.8  ready in XXX ms

➜  Local:   http://localhost:3000/
```

---

## Step 5: Open Dashboard

**Open browser to:** http://localhost:3000

You should see:
- FlashDB Dashboard header
- Golden Images section (empty)
- Clones section (empty)
- Create New Clone form

---

## Step 6: Run Complete Test Scenario (3 minutes)

**Open FOURTH PowerShell terminal:**

```bash
cd c:\flashdb

# Run the 9-step test scenario
.\docker\test-scenario.ps1 -ApiUrl "http://localhost:3001/api" -Verbose
```

**Watch the output:**
```
╔════════════════════════════════════════════════════════════╗
║    FlashDB End-to-End Test Scenario                       ║
╚════════════════════════════════════════════════════════════╝

Step 1: Creating Golden Image from TestDB...
✓ Golden image created successfully

Step 2: Creating Clone from Golden Image...
✓ Clone created successfully

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

Step 8: Restoring to Checkpoint 1 (Rollback)...
✓ Restore successful!

Step 9: Retrieving Final Clone Details...
✓ Clone details retrieved

═══════════════════════════════════════════════════════════
                  Test Scenario Complete
═══════════════════════════════════════════════════════════
```

---

## Step 7: Explore in Dashboard

**Refresh the GUI at http://localhost:3000**

### What You'll See

#### Golden Images Tab
- **TestDB-Golden-[timestamp]**
  - Version: 20260606
  - Size: ~50-100MB
  - Method: TableByTableCopy

#### Clones Tab
- **TestDB-Clone-Dev1**
  - Status: attached
  - Instance: LOCALHOST\SQLEXPRESS
  - Storage: D:\CloneStorage

#### Click on Clone to See Details
- Clone ID
- Golden Image ID
- Instance Path
- Database Name
- Creation Time

#### Checkpoints Section
- **CP-001: Pre-Changes Baseline**
  - Phase: pre-etl
  - Created: [timestamp]
  
- **CP-002: Post-ETL Results** ⭐
  - Phase: post-etl
  - Labels: etl-v1, production-equivalent
  - Marked as favorite (⭐)

---

## Explore Functionalities

### 1. Create a New Clone

**In GUI Dashboard:**
1. Click on "Create New Clone" form
2. Select Golden Image: TestDB-Golden-20260606
3. Clone Name: dev-test-2
4. SQL Instance: LOCALHOST\SQLEXPRESS
5. Storage Path: D:\CloneStorage
6. Click "Create Clone"

**Result:** New clone appears in Clones grid in ~2-3 seconds

### 2. View Clone Details

**In GUI Dashboard:**
1. Click on a clone card
2. View all metadata
3. See attached instance
4. See creation timestamp

### 3. Create Checkpoint

**Via PowerShell:**
```powershell
Import-Module C:\flashdb\src\FlashDB\FlashDB.psm1

New-FlashdbCheckpoint `
  -CloneId "clone-testdb-dev1" `
  -CheckpointName "Custom Checkpoint" `
  -Phase "manual" `
  -Description "My test checkpoint"
```

### 4. Label & Favorite Checkpoint

**Via REST API:**
```bash
curl -X PATCH http://localhost:3001/api/clones/{cloneId}/checkpoints/{cpId} `
  -H "Content-Type: application/json" `
  -d '{
    "isFavorite": true,
    "labels": ["custom-label", "important"]
  }'
```

### 5. Restore Checkpoint

**Via REST API:**
```bash
curl -X POST http://localhost:3001/api/clones/{cloneId}/checkpoints/{cpId}/restore `
  -H "Content-Type: application/json" `
  -d '{"reattachAfter": true}'
```

---

## Test Key Features

### Feature 1: Storage Efficiency
```powershell
# Check VHDX file sizes
Get-ChildItem D:\CloneStorage -Recurse | 
  Select-Object FullName, Length | 
  Format-Table -AutoSize

# Golden image: ~100MB
# Each clone differencing disk: ~5-10MB (before changes)
# 75%+ storage savings vs full copy
```

### Feature 2: Instant Cloning
```powershell
# Measure clone creation time
$start = Get-Date
New-FlashdbClone -GoldenImageId "golden-id" -CloneName "speed-test" ...
$duration = (Get-Date) - $start
Write-Host "Clone created in $($duration.TotalSeconds) seconds"

# Expected: 2-3 seconds
```

### Feature 3: Instant Rollback
```powershell
# Create checkpoint before changes
New-FlashdbCheckpoint -CloneId "clone-id" -CheckpointName "Before"

# Make SQL changes to clone database
sqlcmd -S localhost -U sa -P FlashDB@Password123 -d TestDB `
  -Q "INSERT INTO dbo.Customers (CustomerName) VALUES ('Test Customer')"

# Restore to checkpoint
Restore-FlashdbCheckpoint -CloneId "clone-id" -CheckpointId "cp-001"

# Verify: Customer insert rolled back
```

### Feature 4: Checkpoint Diff
```powershell
# Compare two checkpoints
Get-FlashdbCheckpointDiff `
  -CloneId "clone-id" `
  -SourceCheckpointId "cp-001" `
  -TargetCheckpointId "cp-002"

# Shows: Row count changes, table modifications
```

### Feature 5: Multi-Clone Management
```powershell
# List all clones
Get-FlashdbClone

# Get specific clone
Get-FlashdbClone -CloneId "clone-testdb-dev1"

# List checkpoints for clone
Get-FlashdbCheckpoint -CloneId "clone-testdb-dev1"

# Delete clone
Remove-FlashdbClone -CloneId "clone-id" -DeleteVhdx $true
```

---

## Monitoring

### Check SQL Server
```powershell
# Connect to SQL Server
sqlcmd -S localhost -U sa -P FlashDB@Password123

# Query test database
SELECT COUNT(*) FROM TestDB.dbo.Customers
SELECT COUNT(*) FROM TestDB.dbo.Orders
GO
```

### Check API Health
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-06-06T..."
}
```

### Check API Logs
```bash
# The API logs are in: src/api/logs/combined.log
Get-Content src/api/logs/combined.log -Tail 20
```

### Check GUI Network Requests
Open browser DevTools (F12):
- **Network tab** - see API calls to http://localhost:3001/api
- **Console** - see any errors
- **Application** - local storage for session data

---

## Cleanup Commands

### Stop All Services
```bash
# Stop GUI (Ctrl+C in GUI terminal)
# Stop API (Ctrl+C in API terminal)

# Stop SQL Server container
docker stop flashdb-sql

# Remove SQL Server container
docker rm flashdb-sql

# Clean volumes (optional)
docker volume rm sql-data
```

---

## Troubleshooting

### SQL Server won't start
```bash
# Check container logs
docker logs flashdb-sql

# Restart container
docker restart flashdb-sql

# Wait 20 seconds and retry connection test
```

### API shows "PowerShell not found"
```powershell
# Verify PowerShell is available
pwsh --version

# If not installed, install PowerShell 7:
# https://github.com/PowerShell/PowerShell/releases
```

### GUI shows "Failed to connect to API"
```bash
# Check API is running
curl http://localhost:3001/health

# Check browser console (F12)
# Look for CORS errors or connection refused
```

### Clone creation fails
```powershell
# Check golden image exists
Get-FlashdbGoldenImage

# Check SQL Server connection
Test-NetConnection -ComputerName localhost -Port 1433

# Check storage path exists
Test-Path D:\CloneStorage
```

---

## Performance Baselines

```
Operation              Typical Time    Target
──────────────────────────────────────────────
Golden Image Create    15-20s          < 30s ✓
Clone Creation         2-3s            < 5s ✓
Checkpoint Creation    0.5s            < 1s ✓
Rollback/Restore       1-2s            < 2s ✓
API Response           50-200ms        < 500ms ✓
Storage Efficiency     75%             70-90% ✓
```

---

## Next Steps

1. ✅ SQL Server running
2. ✅ Test database initialized  
3. ✅ API server running
4. ✅ GUI dashboard accessible
5. ✅ Test scenario completed
6. **Now:** Explore features using commands above
7. **Then:** Create your own test scenarios

---

## API Endpoints Reference

```
Golden Images:
  POST   /api/golden-images
  GET    /api/golden-images
  GET    /api/golden-images/{id}
  DELETE /api/golden-images/{id}

Clones:
  POST   /api/clones
  GET    /api/clones
  GET    /api/clones/{id}
  POST   /api/clones/{id}/attach
  POST   /api/clones/{id}/detach
  DELETE /api/clones/{id}

Checkpoints:
  POST   /api/clones/{cid}/checkpoints
  GET    /api/clones/{cid}/checkpoints
  POST   /api/clones/{cid}/checkpoints/{cpid}/restore
  PATCH  /api/clones/{cid}/checkpoints/{cpid}
  DELETE /api/clones/{cid}/checkpoints/{cpid}
```

---

## Support Documents

- `PROJECT_SUMMARY.md` — Complete project overview
- `QUICK_REFERENCE.md` — Command reference
- `FULL_STACK_TESTING.md` — Testing guide
- `NODE_API_GUI.md` — API/GUI developer guide

---

**FlashDB is ready to explore!** 🎉
