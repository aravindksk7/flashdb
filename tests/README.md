# FlashDB Test Suite Documentation

## Overview

The FlashDB test suite provides comprehensive coverage across multiple test categories:

1. **PowerShell Module Tests** - Unit and functional tests for all cmdlets
2. **SQL Server Provider Tests** - Provider implementation tests
3. **API Tests** - REST API endpoint validation
4. **Integration Tests** - End-to-end workflow testing
5. **Performance Tests** - Baseline measurements and benchmarking

## Test Coverage

### PowerShell Module Tests (`tests/FlashDB/`)

**File**: `FlashDB.Tests.ps1`

#### Coverage Areas

- **Golden Image Management**
  - New-FlashdbGoldenImage (3 creation methods: BackupRestore, ReplicaBackup, TableByTableCopy)
  - Get-FlashdbGoldenImage
  - Update-FlashdbGoldenImage
  - Remove-FlashdbGoldenImage
  - Metadata validation and JSON schema

- **Clone Management**
  - New-FlashdbClone
  - Get-FlashdbClone
  - Connect-FlashdbClone
  - Disconnect-FlashdbClone
  - Remove-FlashdbClone
  - Metadata tracking and lifecycle

- **Checkpoint & Rollback**
  - New-FlashdbCheckpoint (pre-etl, post-etl, manual phases)
  - Get-FlashdbCheckpoint
  - Set-FlashdbCheckpoint (favorite, labels)
  - Get-FlashdbCheckpointDiff
  - Restore-FlashdbCheckpoint
  - Restore-FlashdbClone (to golden)
  - Remove-FlashdbCheckpoint

- **Utility Functions**
  - Test-FlashdbGoldenImage
  - Get-FlashdbCloneMetadata
  - Get-FlashdbStorageReport
  - Update-FlashdbConfiguration

- **Error Handling**
  - Invalid inputs
  - State validation
  - Missing dependencies

- **Aliases**
  - All command aliases (nfgi, gfc, nfc, etc.)

**Test Count**: 80+ individual tests

### SQL Server Provider Tests (`tests/Providers/SqlServer/`)

**File**: `SqlServerProvider.Tests.ps1`

#### Coverage Areas

- **Golden Image Creation Methods**
  - BACKUP/RESTORE workflow
  - Native Replica Backup (BACKUP FROM MIRROR)
  - Table-by-Table Copy (direct copy with read-only access)
  - Consistency verification
  - Row count validation
  - Backup verification with RESTORE VERIFYONLY

- **Database Attach/Detach**
  - VHDX database attachment
  - Database detachment
  - Connection management
  - Active connection handling
  - Multi-instance support

- **Backup Operations**
  - Backup file creation
  - Compression support
  - Checksum verification
  - Backup validation

- **Schema & Data Validation**
  - Schema hashing
  - Schema change detection
  - Row count validation
  - Table enumeration
  - Data integrity checks with DBCC

- **Error Handling**
  - Connection errors
  - Database operation failures
  - Transaction handling
  - Deadlock recovery

- **Performance & Optimization**
  - Statistics disable/enable
  - Trigger management
  - Index handling
  - Bulk operations

- **Metadata Tracking**
  - Source tracking
  - Size tracking
  - Operation logging
  - Audit trail

- **Security & Compliance**
  - Connection encryption
  - Certificate validation
  - Sensitive data masking
  - VHDX integrity
  - Audit logging

**Test Count**: 85+ individual tests

### REST API Tests (`tests/FlashDB.Api/`)

**File**: `FlashDB.Api.Tests.cs` (xUnit)

#### Coverage Areas

- **Golden Image Endpoints**
  - POST /api/golden-images (create with 3 methods)
  - GET /api/golden-images (list)
  - GET /api/golden-images/{id} (details with metadata)
  - PATCH /api/golden-images/{id} (update)
  - POST /api/golden-images/{id}/refresh (refresh)
  - Input validation and error handling

- **Clone Endpoints**
  - POST /api/clones (create)
  - GET /api/clones (list)
  - GET /api/clones/{id} (details)
  - POST /api/clones/{id}/attach (attach)
  - POST /api/clones/{id}/detach (detach)
  - DELETE /api/clones/{id} (delete)
  - Error handling for invalid/missing inputs

- **Checkpoint Endpoints**
  - POST /api/clones/{id}/checkpoints (create)
  - GET /api/clones/{id}/checkpoints (list)
  - GET /api/clones/{id}/checkpoints/{cpid} (details)
  - PATCH /api/clones/{id}/checkpoints/{cpid} (update flags/labels)
  - POST /api/clones/{id}/checkpoints/{cpid}/restore (restore)
  - POST /api/clones/{id}/checkpoints/{cpid}/diff (compare)
  - DELETE /api/clones/{id}/checkpoints/{cpid} (delete)

- **Clone Restore Endpoints**
  - POST /api/clones/{id}/restore-golden (restore to golden)

- **Error Handling**
  - 404 Not Found
  - 400 Bad Request (validation)
  - 405 Method Not Allowed
  - Malformed JSON

- **Security**
  - Password masking in responses
  - Input length validation
  - Sensitive data protection

**Test Count**: 50+ individual tests

### Integration Tests (`tests/Integration/`)

**File**: `FlashDB.Integration.Tests.ps1`

**Restore Regression**: `RestoreOrders.Tests.ps1`

#### Coverage Areas

- **Complete Workflows**
  - Create golden → Clone → Checkpoint → Rollback cycle
  - State validation throughout workflow
  - Operation logging

- **Multi-Clone Operations**
  - Create 3 clones from same golden
  - Concurrent attach/detach
  - Concurrent checkpoints
  - Concurrent rollbacks
  - Storage efficiency with multiple clones
  - Checkpoint isolation between clones

- **ETL Workflow Testing**
  - Pre-ETL checkpoint creation
  - ETL execution simulation
  - Post-ETL checkpoint
  - Checkpoint comparison
  - Rollback for retry
  - ETL v1 vs v2 comparison
  - Metadata tracking (job name, timestamps)
  - Failure recovery

- **Cross-Instance Operations**
  - Local SQL Express clones
  - Network instance clones
  - UNC path support

- **Clone Lifecycle**
  - Create → Attach → Detach → Reattach → Delete
  - Expiration policies
  - Cleanup validation

- **Data Integrity**
  - Row count consistency after restore
  - Schema consistency verification
  - Data corruption detection
  - Checkpoint restore rollback on `[TestDB_Clone_1].[dbo].[Orders]`
  - Probe row cleanup after restoring a checkpoint

- **Error Recovery**
  - Instance offline scenarios
  - Disk space exhaustion
  - VHDX corruption
  - Active connection handling during rollback

- **Audit & Logging**
  - Operation timestamps
  - ETL metadata
  - Connection force-close logging
  - Immutable operation log

**Test Count**: 70+ individual tests

### Performance Tests (`tests/Performance/`)

**File**: `FlashDB.Performance.Tests.ps1`

#### Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Clone Creation | < 5 sec | VHDX differencing disk |
| Checkpoint Creation | < 1 sec | VHDX snapshot |
| Rollback (restore) | < 2 sec | VHDX revert + DB reattach |
| Clone Creation (10 GB golden) | < 10 sec | Size-independent with VHDX |
| Clone Creation (100 GB golden) | < 10 sec | Demonstrates VHDX efficiency |
| Storage Savings | 70-90% | vs full database copies |

#### Test Coverage

- **Clone Creation Performance**
  - Individual clone creation time
  - Batch clone creation
  - Variance measurement (< 20%)
  - Performance with different golden sizes (10 GB, 100 GB)

- **Checkpoint Performance**
  - Individual checkpoint creation
  - Multiple sequential checkpoints
  - Checkpoint after large ETL (1 GB changes)
  - Metadata capture overhead

- **Rollback Performance**
  - Checkpoint restore timing
  - Golden image restore timing
  - Multi-checkpoint clone restore
  - Database reattach time inclusion

- **Storage Operations**
  - Golden image creation (3 methods)
  - VHDX differencing efficiency
  - Storage savings calculation

- **Concurrent Operations**
  - Parallel clone creation (3 clones)
  - Concurrent checkpoints
  - Speedup factor measurement

- **Metadata Operations**
  - Metadata retrieval time
  - Storage report generation

**Output**: `performance-report.json` with detailed timing data

**Test Count**: 20+ performance tests

## Running Tests

### Prerequisites

- PowerShell 5.1+ or PowerShell 7.x
- Pester 5.0+
- SQL Server 2017+ (for provider tests)
- .NET 6.0+ (for API tests)

### Installation

```powershell
# Install Pester
Install-Module -Name Pester -MinimumVersion 5.0.0 -Force

# Install PSScriptAnalyzer (optional, for code quality)
Install-Module -Name PSScriptAnalyzer -Force
```

### Running All Tests

```powershell
# Run all PowerShell tests with coverage
$config = New-PesterConfiguration
$config.Run.Path = 'tests'
$config.CodeCoverage.Enabled = $true
$config.CodeCoverage.Path = 'src'
Invoke-Pester -Configuration $config
```

### Running Specific Test Categories

```powershell
# Module tests only
Invoke-Pester -Path tests/FlashDB -PassThru

# Provider tests only
Invoke-Pester -Path tests/Providers/SqlServer -PassThru

# Integration tests only
Invoke-Pester -Path tests/Integration -PassThru

# Restore rollback regression for TestDB_Clone_1.dbo.Orders
Invoke-Pester -Path tests/Integration/RestoreOrders.Tests.ps1 -PassThru

# Performance tests only
Invoke-Pester -Path tests/Performance -PassThru
```

### Restore Orders Regression

`tests/Integration/RestoreOrders.Tests.ps1` validates the GUI restore workflow at
the database level. It creates a checkpoint for `TestDB_Clone_1`, inserts an
`FBRT%` probe row into `[TestDB_Clone_1].[dbo].[Orders]`, restores the checkpoint,
and verifies that the probe row is gone.

Prerequisites:

- Pester 5.0+
- FlashDB API and SQL Server stack running
- `TestDB_Clone_1` online with the sample `dbo.Orders` table
- API reachable at the configured base URL

### Running API Tests

```bash
# Build and test
dotnet test tests/FlashDB.Api/FlashDB.Api.Tests.csproj

# With coverage
dotnet test tests/FlashDB.Api/FlashDB.Api.Tests.csproj /p:CollectCoverage=true
```

## Test Results

### Expected Coverage

- **PowerShell Module**: 80%+ code coverage
- **SQL Provider**: 85%+ code coverage
- **API Endpoints**: 90%+ coverage
- **Integration Workflows**: All major workflows tested
- **Performance**: Baseline established and validated

### Test Execution Output

Each test run produces:
- Pass/Fail summary
- Coverage reports
- Performance baseline reports
- Error details and logs

### CI/CD Integration

Tests run automatically on:
- Push to main/develop branches
- Pull requests
- Daily schedule (2 AM UTC)
- Manual trigger

Results are available in GitHub Actions workflow artifacts.

## Mocking Strategy

### PowerShell Tests

- Mock VHDX operations using Pester mocks
- Mock SQL Server connections
- Mock file system operations
- Mock metadata JSON files

### API Tests

- Mock HTTP responses
- Test error scenarios
- Validate input validation
- Test edge cases

### Integration Tests

- Use real SQL Server instances (if available)
- Create actual VHDX files in test fixtures
- Cleanup after each test
- Support both local and network paths

## Performance Baseline

Performance tests establish baselines for:

1. **Clone creation time** - Must be < 5 seconds
2. **Checkpoint creation** - Must be < 1 second  
3. **Rollback time** - Must be < 2 seconds
4. **Storage efficiency** - 70-90% savings vs full copies

Baseline results are stored in `tests/Performance/performance-report.json`.

## Test Data

Test fixtures are stored in fixture directories:
- `tests/FlashDB/fixtures/` - PowerShell test data
- `tests/Providers/SqlServer/fixtures/` - Provider test data
- `tests/Integration/fixtures/` - Integration test environments
- `tests/Performance/fixtures/` - Performance test data

All fixtures are cleaned up after tests complete.

## Known Issues & Limitations

1. **SQL Server Dependency** - Provider tests require SQL Server instance
2. **VHDX Operations** - Require Windows Server 2016+
3. **Network Tests** - UNC path tests require network access
4. **Performance Variance** - Results may vary based on system load

## Troubleshooting

### Common Issues

**Test fails with "Module not found"**
```powershell
# Ensure module is in correct location
Get-Module -Name FlashDB -ListAvailable
```

**SQL Server connection fails**
```powershell
# Check SQL Server is running
Get-Service -Name MSSQLSERVER
```

**VHDX operations not available**
```powershell
# Check Windows version
Get-WindowsEdition
# Requires Windows Server 2016+
```

### Debug Mode

```powershell
# Run tests with verbose output
Invoke-Pester -Path tests/FlashDB -Verbose

# Run specific test
Invoke-Pester -Path tests/FlashDB -FullNameFilter "TestName"
```

## Contributing

When adding new tests:

1. Follow existing test structure
2. Add tests to appropriate category
3. Include both positive and negative cases
4. Test error handling thoroughly
5. Update documentation
6. Ensure performance tests include baseline
7. Add metadata validation tests

## Test Maintenance

Tests should be reviewed and updated:
- When code changes
- When new features are added
- When bugs are discovered
- When performance targets change
- Quarterly for coverage improvement

## Resources

- [Pester Documentation](https://pester.dev/)
- [xUnit Documentation](https://xunit.net/)
- [SQL Server Testing](https://docs.microsoft.com/sql/)
- [VHDX Format Specification](https://docs.microsoft.com/windows-server/)

## Contact

For questions about the test suite, contact the FlashDB team.
