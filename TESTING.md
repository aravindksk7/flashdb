# FlashDB Testing Guide

## Quick Start

### Setup

```powershell
# Install Pester (PowerShell tests)
Install-Module -Name Pester -MinimumVersion 5.0.0 -Force -SkipPublisherCheck

# Install .NET (API tests)
# Download from https://dotnet.microsoft.com/download
```

### Run All Tests

```powershell
# PowerShell tests
cd C:\flashdb
Invoke-Pester -Path tests/FlashDB -PassThru

# API tests
dotnet test tests/FlashDB.Api/FlashDB.Api.Tests.csproj
```

## Test Categories

### 1. PowerShell Module Tests (`tests/FlashDB/`)

**What's tested**: All FlashDB cmdlets and functions

```powershell
# Run all module tests
Invoke-Pester -Path tests/FlashDB -Verbose

# Run specific test file
Invoke-Pester -Path tests/FlashDB/FlashDB.Tests.ps1

# Run tests matching pattern
Invoke-Pester -Path tests/FlashDB -FullNameFilter "*Clone*"
```

**Expected**: 80+ tests, all passing
**Coverage**: 80%+ of module code

### 2. SQL Server Provider Tests (`tests/Providers/SqlServer/`)

**What's tested**: SQL Server provider implementation

```powershell
# Run provider tests
Invoke-Pester -Path tests/Providers/SqlServer -Verbose

# Requires: SQL Server instance running
```

**Expected**: 85+ tests
**Note**: Some tests require SQL Server 2017+ with enabled backups

### 3. Integration Tests (`tests/Integration/`)

**What's tested**: End-to-end workflows

```powershell
# Run integration tests
Invoke-Pester -Path tests/Integration -Verbose
```

**Expected**: 70+ tests covering complete workflows
**Duration**: 5-10 minutes
**Note**: Tests create/delete VHDX files and databases

### 4. Performance Tests (`tests/Performance/`)

**What's tested**: Performance baselines and benchmarks

```powershell
# Run performance tests
Invoke-Pester -Path tests/Performance -Verbose
```

**Expected**: 20+ tests with performance metrics
**Output**: `tests/Performance/performance-report.json`

**Targets**:
- Clone creation: < 5 sec
- Checkpoint creation: < 1 sec
- Rollback: < 2 sec

### 5. API Tests (`tests/FlashDB.Api/`)

**What's tested**: REST API endpoints

```bash
# Build and run
dotnet test tests/FlashDB.Api/FlashDB.Api.Tests.csproj

# With coverage
dotnet test tests/FlashDB.Api/FlashDB.Api.Tests.csproj /p:CollectCoverage=true

# Verbose
dotnet test tests/FlashDB.Api/FlashDB.Api.Tests.csproj -v normal
```

**Expected**: 50+ tests for all API endpoints
**Requires**: API server running

## Running with Coverage

### PowerShell Tests

```powershell
$config = New-PesterConfiguration
$config.Run.Path = 'tests'
$config.CodeCoverage.Enabled = $true
$config.CodeCoverage.Path = 'src/FlashDB'
$config.TestResult.OutputPath = 'tests/results.xml'
Invoke-Pester -Configuration $config
```

### API Tests

```bash
dotnet test tests/FlashDB.Api/FlashDB.Api.Tests.csproj \
  /p:CollectCoverage=true \
  /p:CoverageDirectory=coverage/api
```

## Continuous Integration

Tests run automatically via GitHub Actions:

```yaml
# Triggered on:
- Push to main/develop
- Pull requests
- Daily schedule (2 AM UTC)
- Manual trigger
```

View results in GitHub Actions tab of repository.

## Test Results Interpretation

### Success Example

```
Passed Tests: 305
Failed Tests: 0
Coverage: 82%

Status: ✅ ALL TESTS PASSED
```

### Failure Example

```
Passed Tests: 298
Failed Tests: 7
Coverage: 78%

Failed Tests:
  ❌ Should create clone in less than 5 seconds
  ❌ Should restore checkpoint in less than 2 seconds
  ...
```

## Common Test Scenarios

### Scenario 1: Create Clone in Seconds

```powershell
# Tests that golden image → clone takes < 5 seconds
Invoke-Pester -Path tests/Performance `
  -FullNameFilter "*Clone*Creation*" -Verbose
```

### Scenario 2: Complete ETL Workflow

```powershell
# Tests: Golden → Clone → Pre-ETL CP → ETL → Post-ETL CP → Rollback
Invoke-Pester -Path tests/Integration `
  -FullNameFilter "*ETL*Workflow*" -Verbose
```

### Scenario 3: Multi-Clone Concurrent

```powershell
# Tests: 3 clones simultaneously from same golden image
Invoke-Pester -Path tests/Integration `
  -FullNameFilter "*Multi-Clone*" -Verbose
```

### Scenario 4: API Golden Image Creation

```bash
# Tests all 3 golden image creation methods via API
dotnet test tests/FlashDB.Api/FlashDB.Api.Tests.csproj `
  --filter "GoldenImageApiTests"
```

## Troubleshooting

### Test Fails: "Module not found"

```powershell
# Ensure module exists
Get-Module -Name FlashDB -ListAvailable

# Import module manually
Import-Module .\src\FlashDB\FlashDB.psd1 -Force
```

### Test Fails: "SQL Server connection"

```powershell
# Check SQL Server is running
Get-Service -Name MSSQLSERVER

# Verify credentials
sqlcmd -S LOCALHOST\SQLEXPRESS -Q "SELECT @@VERSION"
```

### Test Fails: "VHDX operations"

```powershell
# Check Windows Server version (requires 2016+)
Get-WindowsEdition

# Check Hyper-V features enabled
Get-WindowsFeature *Hyper*
```

### Test Takes Too Long

```powershell
# Run specific category only
Invoke-Pester -Path tests/FlashDB -ExcludeTag "Integration", "Performance"

# Run single test
Invoke-Pester -Path tests/FlashDB `
  -FullNameFilter "TestName" -Verbose
```

### View Detailed Failure

```powershell
# Run with full output
$Config = New-PesterConfiguration
$Config.Debug.ShowFullErrors = $true
$Config.Output.Verbosity = 'Detailed'
Invoke-Pester -Path tests/FlashDB -Configuration $Config
```

## Performance Analysis

### View Performance Report

```powershell
# After running performance tests
Get-Content tests/Performance/performance-report.json | ConvertFrom-Json | Format-Table
```

### Expected Performance

| Operation | Target | Typical |
|-----------|--------|---------|
| Clone creation | < 5 sec | 2-3 sec |
| Checkpoint | < 1 sec | 0.5 sec |
| Rollback | < 2 sec | 1-1.5 sec |
| Storage savings | 70-90% | 75-85% |

### Performance Regression Detection

```powershell
# Compare to baseline
$Current = Get-Content tests/Performance/performance-report.json | ConvertFrom-Json
$Baseline = Get-Content tests/Performance/baseline.json | ConvertFrom-Json

# Check for significant slowdown (> 20%)
foreach ($Op in $Current.Operations) {
  $Base = $Baseline.Operations | Where-Object Operation -eq $Op.Operation
  if ($Op.Duration -gt ($Base.Duration * 1.2)) {
    Write-Warning "Regression in $($Op.Operation): $($Op.Duration)s vs $($Base.Duration)s"
  }
}
```

## Code Coverage

### Generate Coverage Report

```powershell
# PowerShell module coverage
$Config = New-PesterConfiguration
$Config.CodeCoverage.Enabled = $true
$Config.CodeCoverage.Path = 'src/FlashDB'
$Config.CodeCoverage.CoveragePercentTarget = 80
Invoke-Pester -Path tests/FlashDB -Configuration $Config
```

### View Coverage Report

```powershell
# Summary
Write-Host "Coverage: 82%"

# Details per file
Get-Content coverage-report.json | ConvertFrom-Json
```

### Improving Coverage

1. Run coverage: `Invoke-Pester -Path tests -CodeCoverage`
2. Find uncovered lines in code
3. Add tests for those paths
4. Re-run coverage to verify

## Test Data

All test data is in `tests/*/fixtures/` directories:
- PowerShell: mock backup files, VHDX files
- Provider: SQL test databases
- Integration: full test environments
- Performance: benchmark data

**Cleanup**: Tests automatically remove fixtures after completion

## Debugging Tests

### Enable Verbose Output

```powershell
Invoke-Pester -Path tests/FlashDB -Verbose
```

### Debug Single Test

```powershell
# Add breakpoint in test
Invoke-Pester -Path tests/FlashDB `
  -FullNameFilter "TestName" `
  -Verbose `
  -Debug
```

### View Test Output

```powershell
# Capture results
$Results = Invoke-Pester -Path tests/FlashDB -PassThru
$Results.Containers[0].Blocks | Format-Table
```

## CI/CD Integration

### GitHub Actions

Tests run automatically on:
- Every push to main/develop
- Every pull request
- Daily at 2 AM UTC

View in: Actions tab → Workflow runs

### Local CI Simulation

```powershell
# Simulate CI pipeline locally
& .\.github\workflows\test.ps1
```

## Best Practices

1. **Run tests frequently** - Before each commit
2. **Fix failing tests immediately** - Don't let debt accumulate
3. **Add tests for bugs** - Test reproduces bug, then fix
4. **Update tests with code** - Keep coverage consistent
5. **Monitor performance** - Track baseline over time
6. **Document test failures** - Why tests fail, not just that they do

## Contact & Support

For test-related questions:
- Check `tests/README.md` for detailed documentation
- Review test source files for examples
- Check GitHub Issues for known problems
- Contact FlashDB team

## Test Resources

- [Pester Documentation](https://pester.dev/)
- [xUnit.net Documentation](https://xunit.net/)
- [SQL Server Testing](https://docs.microsoft.com/en-us/sql/)
- [VHDX Format](https://docs.microsoft.com/en-us/windows-server/)
