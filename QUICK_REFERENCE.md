# FlashDB Quick Reference Guide

## Common Tasks

### 1. Start Full Stack (Docker)

```bash
cd c:\flashdb
docker-compose -f docker-compose.full-stack.yml up --build
# Wait 30 seconds for all services to start
# API: http://localhost:3001
# GUI: http://localhost:3000
# SQL: localhost:1433 (sa / FlashDB@Password123)
```

### 2. Create Golden Image

**Via REST API:**
```bash
curl -X POST http://localhost:3001/api/golden-images \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ProductionDB",
    "version": "20260606",
    "method": "TableByTableCopy",
    "outputPath": "D:\\GoldenImages\\ProductionDB.vhdx",
    "sourceConnection": "Server=sql-server;User Id=sa;Password=***"
  }'
```

**Via PowerShell:**
```powershell
Import-Module C:\flashdb\src\FlashDB\FlashDB.psm1

New-FlashdbGoldenImage `
  -Name "ProductionDB" `
  -Version "20260606" `
  -Method "TableByTableCopy" `
  -OutputPath "D:\GoldenImages\ProductionDB.vhdx" `
  -SourceConnection "Server=sql-server;User Id=sa;Password=***"
```

### 3. Create Clone

**Via REST API:**
```bash
curl -X POST http://localhost:3001/api/clones \
  -H "Content-Type: application/json" \
  -d '{
    "goldenImageId": "golden-prod-20260606",
    "cloneName": "dev-clone-1",
    "instancePath": "LOCALHOST\\SQLEXPRESS",
    "storagePath": "D:\\CloneStorage"
  }'
```

**Via PowerShell:**
```powershell
New-FlashdbClone `
  -GoldenImageId "golden-prod-20260606" `
  -CloneName "dev-clone-1" `
  -InstancePath "LOCALHOST\SQLEXPRESS" `
  -StoragePath "D:\CloneStorage"
```

### 4. Create Checkpoint

```bash
curl -X POST http://localhost:3001/api/clones/{cloneId}/checkpoints \
  -H "Content-Type: application/json" \
  -d '{
    "checkpointName": "Before Testing",
    "phase": "pre-etl",
    "description": "Baseline before test execution"
  }'
```

### 5. Restore Checkpoint

```bash
curl -X POST http://localhost:3001/api/clones/{cloneId}/checkpoints/{cpId}/restore \
  -H "Content-Type: application/json" \
  -d '{"reattachAfter": true}'
```

### 6. List Clones

```bash
curl http://localhost:3001/api/clones
```

### 7. Delete Clone

```bash
curl -X DELETE "http://localhost:3001/api/clones/{cloneId}?deleteVhdx=true"
```

---

## PowerShell Cmdlets

### Golden Images
```powershell
Get-FlashdbGoldenImage                           # List all
Get-FlashdbGoldenImage -Id "golden-id"           # Get details
New-FlashdbGoldenImage -Name "..." -Version ...  # Create
Remove-FlashdbGoldenImage -GoldenImageId "..."   # Delete
```

### Clones
```powershell
Get-FlashdbClone                                 # List all
Get-FlashdbClone -CloneId "clone-id"             # Get details
New-FlashdbClone -GoldenImageId "..." ...        # Create
Connect-FlashdbClone -CloneId "..." ...          # Attach
Disconnect-FlashdbClone -CloneId "..."           # Detach
Remove-FlashdbClone -CloneId "..."               # Delete
```

### Checkpoints
```powershell
Get-FlashdbCheckpoint -CloneId "..."             # List all
New-FlashdbCheckpoint -CloneId "..." ...         # Create
Restore-FlashdbCheckpoint -CloneId "..." ...     # Restore
Set-FlashdbCheckpoint -CloneId "..." ...         # Update (labels, favorite)
Get-FlashdbCheckpointDiff -CloneId "..." ...     # Compare
Remove-FlashdbCheckpoint -CloneId "..." ...      # Delete
```

---

## REST API Endpoints

### Golden Images
```
POST   /api/golden-images              Create
GET    /api/golden-images              List all
GET    /api/golden-images/{id}         Get one
DELETE /api/golden-images/{id}         Delete
```

### Clones
```
POST   /api/clones                     Create
GET    /api/clones                     List all
GET    /api/clones/{id}                Get one
POST   /api/clones/{id}/attach         Attach
POST   /api/clones/{id}/detach         Detach
DELETE /api/clones/{id}                Delete
```

### Checkpoints
```
POST   /api/clones/{cid}/checkpoints              Create
GET    /api/clones/{cid}/checkpoints              List all
POST   /api/clones/{cid}/checkpoints/{cpid}/restore  Restore
PATCH  /api/clones/{cid}/checkpoints/{cpid}      Update
DELETE /api/clones/{cid}/checkpoints/{cpid}      Delete
```

---

## Troubleshooting

### Docker won't start

```bash
# Check logs
docker-compose -f docker-compose.full-stack.yml logs sql-server
docker-compose -f docker-compose.full-stack.yml logs api
docker-compose -f docker-compose.full-stack.yml logs gui

# Clean up
docker-compose -f docker-compose.full-stack.yml down -v
docker-compose -f docker-compose.full-stack.yml up --build
```

### API not responding

```bash
# Check health
curl http://localhost:3001/health

# Check logs
docker logs flashdb-api

# Verify PowerShell available
docker exec flashdb-api pwsh --version
```

### GUI shows "Failed to connect"

```bash
# Verify API is running
curl http://localhost:3001/api/clones

# Check API logs
docker logs flashdb-api

# Refresh browser (Ctrl+R)
```

### PowerShell module not loading

```powershell
# Check path
Test-Path "C:\flashdb\src\FlashDB\FlashDB.psm1"

# Import with verbose
Import-Module "C:\flashdb\src\FlashDB\FlashDB.psm1" -Verbose

# List cmdlets
Get-Command -Module FlashDB
```

---

## Performance Baselines

```
Operation                    Typical Time
─────────────────────────────────────
Clone Creation               2-3 seconds
Checkpoint Creation          0.5 seconds
Restoration                  1-2 seconds
API Response                 50-200ms
List Clones (5 items)        100-150ms
Storage Overhead per Clone   < 5GB (before changes)
```

---

## Important Paths

```
PowerShell Module:      C:\flashdb\src\FlashDB\
Golden Images:          D:\GoldenImages\ (configurable)
Clone Storage:          D:\CloneStorage\ (configurable)
API Code:              C:\flashdb\src\api\
GUI Code:              C:\flashdb\src\gui\
Docker Compose:        C:\flashdb\docker-compose.full-stack.yml
Test Database:         C:\flashdb\docker\init-testdb.sql
Test Scenario:         C:\flashdb\docker\test-scenario.ps1
```

---

## Configuration

### Environment Variables (API)

```env
NODE_ENV=production
PORT=3001
FLASHDB_MODULE_PATH=C:\flashdb\src\FlashDB\FlashDB.psm1
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:3000
```

### SQL Server Connection

```
Server: localhost or server name
Port: 1433
User: sa (default) or Windows auth
Password: Set in docker-compose or environment
Database: Any (user-configured)
Authentication: Windows or SQL Server
```

---

## Monitoring

### Check Docker Containers

```bash
docker-compose -f docker-compose.full-stack.yml ps
```

### View Logs

```bash
# API logs
docker logs flashdb-api -f

# GUI logs
docker logs flashdb-gui -f

# SQL Server logs
docker logs flashdb-sql-server -f
```

### Health Status

```bash
curl http://localhost:3001/health
# Returns: {"status": "healthy", "timestamp": "2026-06-06T..."}
```

---

## Common Workflows

### Development Workflow

```
1. Create golden image from dev database
2. Clone for local testing
3. Create checkpoint before test
4. Run test/modifications
5. Create checkpoint after
6. Review changes in UI
7. Restore to pre-test checkpoint
8. Repeat with different test
```

### QA Workflow

```
1. Create golden image from staging
2. Clone multiple times for test suites
3. Run tests in parallel
4. Checkpoint key states
5. Restore for cleanup
6. Generate reports
```

### Production Support

```
1. Golden image from production
2. Clone for investigation
3. Checkpoint current state
4. Investigate issues
5. Test fixes in clone
6. Restore for next issue
7. Never modify production directly
```

---

## Keyboard Shortcuts (GUI)

```
F5                Refresh dashboard
Ctrl+F            Search clones
Ctrl+N            New clone (form focus)
Escape            Close details modal
```

---

## Support & Documentation

- **Technical Docs:** `docs/` folder
- **API Reference:** `NODE_API_GUI.md`
- **Testing Guide:** `FULL_STACK_TESTING.md`
- **Troubleshooting:** `FULL_STACK_TESTING.md` § Troubleshooting

---

## Emergency Procedures

### Reset All Data

```bash
# Stop containers
docker-compose -f docker-compose.full-stack.yml down

# Remove volumes
docker volume rm flashdb_sql-data flashdb_test-results

# Start fresh
docker-compose -f docker-compose.full-stack.yml up --build
```

### Restore from Checkpoint (via SQL)

```sql
-- Check available backups
SELECT * FROM msdb.dbo.backupset WHERE database_name = 'TestDB'

-- Restore to point in time
RESTORE DATABASE TestDB
FROM DISK = 'D:\CloneStorage\clone-xxx.bak'
WITH REPLACE, RECOVERY
```

### Manual VHDX Recovery

```powershell
# If VHDX is corrupted
Mount-VHD -Path "D:\CloneStorage\clone-xxx.vhdx" -ReadOnly
Get-VHDPath -Path "D:\CloneStorage\clone-xxx.vhdx" | Repair-VHD
Dismount-VHD -Path "D:\CloneStorage\clone-xxx.vhdx"
```

---

## Version Information

```
FlashDB: v0.1.0
PowerShell: 5.1+ or 7+
Node.js: 18+
React: 18
SQL Server: 2017+
Docker: 20.10+
```

---

**Last Updated:** 2026-06-06  
**Status:** Production Ready  
**Support:** See PROJECT_SUMMARY.md or docs/
