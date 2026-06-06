# FlashDB Docker Testing Guide

## Overview

This guide explains how to test FlashDB in an isolated Docker environment with SQL Server and PowerShell.

## Prerequisites

- **Docker Desktop** (Windows or Linux with WSL2)
- **docker-compose** (included with Docker Desktop)
- **At least 4GB RAM** available for containers

## Quick Start

### 1. Build and Run Tests

```bash
# Navigate to flashdb directory
cd c:\flashdb

# Start SQL Server and run all tests
docker-compose up --build

# Or run specific test type
docker-compose up --build flashdb-test  # Just test container
```

### 2. View Test Results

```bash
# Check test results directory
docker volume inspect flashdb-test-results

# Copy results from container
docker cp flashdb-test-runner:/app/test-results .
```

### 3. Stop and Cleanup

```bash
# Stop containers
docker-compose down

# Remove volumes (cleanup database)
docker-compose down -v
```

---

## Detailed Usage

### Running All Tests

```bash
docker-compose up --build
```

**What happens:**
1. Builds test container with PowerShell 7 and SQL tools
2. Starts SQL Server 2022 container
3. Waits for SQL Server to be healthy
4. Runs FlashDB test suite
5. Generates test report
6. Containers remain running for inspection

### Running Specific Tests

```bash
# Unit tests only
docker-compose run flashdb-test pwsh -Command "& /app/flashdb/docker/run-tests.ps1 -TestType unit"

# Integration tests only
docker-compose run flashdb-test pwsh -Command "& /app/flashdb/docker/run-tests.ps1 -TestType integration"

# All tests with verbose output
docker-compose run flashdb-test pwsh -Command "& /app/flashdb/docker/run-tests.ps1 -TestType all -Verbose"
```

### Interactive Testing

```bash
# Start container without running tests
docker-compose run -it flashdb-test pwsh

# Inside container, test manually:
PS C:\app\flashdb> Import-Module ./src/FlashDB/FlashDB.psm1
PS C:\app\flashdb> Get-Command -Module FlashDB | Measure-Object
PS C:\app\flashdb> Invoke-Pester ./tests/FlashDB/FlashDB.Tests.ps1 -Verbose
```

---

## Environment Variables

Configure behavior with environment variables in `docker-compose.yml`:

```yaml
environment:
  SQL_SERVER_HOST: "sql-server"           # SQL Server hostname
  SQL_SERVER_PORT: "1433"                 # SQL Server port
  SQL_SERVER_USER: "sa"                   # SQL Server user
  SQL_SERVER_PASSWORD: "FlashDB@Pass123"  # SQL Server password
  FLASHDB_HOME: "/app/flashdb"            # FlashDB installation path
```

---

## Test Structure

```
tests/
├── FlashDB/
│   └── FlashDB.Tests.ps1               # 80+ unit tests
├── Providers/SqlServer/
│   └── SqlServerProvider.Tests.ps1     # 85+ provider tests
├── Integration/
│   └── FlashDB.Integration.Tests.ps1   # 70+ integration tests
└── Performance/
    └── FlashDB.Performance.Tests.ps1   # 20+ performance tests
```

### Test Coverage

| Area | Tests | Status |
|------|-------|--------|
| PowerShell Module | 80+ | ✓ Implemented |
| SQL Server Provider | 85+ | ✓ Implemented |
| Integration | 70+ | ✓ Implemented |
| Performance | 20+ | ✓ Implemented |
| **Total** | **305+** | **✓ Ready** |

---

## Validating Output

### Successful Test Run

```
╔════════════════════════════════════════════════════════════╗
║         FlashDB Docker Test Suite                         ║
╚════════════════════════════════════════════════════════════╝

Configuration:
  FlashDB Home: /app/flashdb
  SQL Server: sql-server:1433
  Test Type: all
  Test Results: /app/test-results

Testing SQL Server connection...
✓ SQL Server connection successful
  Version: Microsoft SQL Server 2022...

Testing FlashDB module import...
✓ FlashDB module loaded successfully
  Exported cmdlets: 42

Running unit tests...
  Running: FlashDB.Tests.ps1
  ...
  Running: SqlServerProvider.Tests.ps1
  ...

Running integration tests...
  Running: FlashDB.Integration.Tests.ps1
  ...

╔════════════════════════════════════════════════════════════╗
║                    Test Summary Report                     ║
╚════════════════════════════════════════════════════════════╝

Test Results:
  Total Tests:  305
  Passed:       305 ✓
  Failed:       0 ✗

✓ All tests PASSED!

Test execution complete!
```

### Troubleshooting

**SQL Server connection failed:**
```
✗ SQL Server connection failed: Cannot connect to sql-server:1433
```

**Solution:** Wait for SQL Server to be healthy. Check logs:
```bash
docker logs flashdb-sql-server
```

**FlashDB module not loading:**
```
✗ FlashDB module import failed: Cannot find path
```

**Solution:** Verify source files are present:
```bash
docker run -it flashdb-test pwsh -Command "ls -Recurse /app/flashdb/src"
```

---

## Docker Images

### SQL Server Image

- **Image:** `mcr.microsoft.com/mssql/server:2022-latest`
- **Edition:** Developer (free for development/testing)
- **Port:** 1433 (mapped to host)
- **Data:** Persisted in volume `sql-data`
- **Backups:** Stored in volume `sql-backup`

### Test Runner Image

- **Base:** `mcr.microsoft.com/windows/servercore:ltsc2022`
- **PowerShell:** 7.4.0
- **Tools:** sqlcmd, bcp, Pester 5.0
- **Entrypoint:** PowerShell test script

---

## Advanced Usage

### Running Long-Term Tests

```bash
# Run performance tests with baseline recording
docker-compose run flashdb-test pwsh -Command \
  "& /app/flashdb/docker/run-tests.ps1 -TestType performance -GenerateReport" \
  -v test-results:/app/test-results

# Copy results
docker cp flashdb-test-runner:/app/test-results/performance-baseline.json .
```

### Custom Test Script

Create `docker/custom-test.ps1`:

```powershell
param([string]$ConnectionString = "")

# Your custom test logic here
Write-Host "Running custom tests..."

# Import FlashDB
Import-Module /app/flashdb/src/FlashDB/FlashDB.psm1

# Run tests
# ... your test code ...
```

Run it:

```bash
docker-compose run flashdb-test pwsh /app/flashdb/docker/custom-test.ps1
```

---

## Performance Baseline

The Docker test environment establishes baseline performance metrics:

| Operation | Target | Docker Baseline |
|-----------|--------|-----------------|
| Clone creation | < 5 sec | — |
| Checkpoint | < 1 sec | — |
| Rollback | < 2 sec | — |
| Storage efficiency | 70-90% | — |

**Note:** Performance baselines are collected on first full test run.

---

## CI/CD Integration

Use Docker for automated testing in CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Run FlashDB Tests in Docker
  run: |
    docker-compose -f docker-compose.yml up --build --exit-code-from flashdb-test
    docker cp flashdb-test-runner:/app/test-results ./test-results

- name: Upload Test Results
  uses: actions/upload-artifact@v3
  with:
    name: test-results
    path: test-results/
```

---

## Cleanup

### Remove All Containers

```bash
docker-compose down
```

### Remove Test Results Volume

```bash
docker volume rm flashdb-test-results
```

### Remove All Docker Resources

```bash
docker-compose down -v
docker system prune -a
```

---

## FAQ

**Q: Can I test on Linux?**  
A: Yes, use `mcr.microsoft.com/mssql/server:latest` image (Linux-based SQL Server).

**Q: How long do tests take?**  
A: Full test suite: 10-15 minutes (first run slower due to container setup).

**Q: Where are test results saved?**  
A: In `/app/test-results` directory inside container, mounted to `test-results` volume.

**Q: Can I modify tests while containers run?**  
A: Yes, edit files locally. Tests will use updated code on next run.

**Q: What if a test fails?**  
A: Check error output in container logs. Run with `-Verbose` flag for details.

---

## Next Steps

1. **Run Tests:** `docker-compose up --build`
2. **Review Results:** Check `/app/test-results`
3. **Fix Issues:** Address any test failures
4. **Performance Tuning:** Validate performance baselines
5. **Production Deployment:** Deploy to Windows Server 2016+

---

## Support

For issues with Docker setup:

1. Check Docker logs: `docker logs flashdb-sql-server`
2. Verify containers running: `docker ps`
3. Check volumes: `docker volume ls`
4. Review test output: Check console output during test run

---

**Last Updated:** 2026-06-06  
**Docker Compose Version:** 3.8  
**SQL Server Version:** 2022  
**PowerShell Version:** 7.4.0
