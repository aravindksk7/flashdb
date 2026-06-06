# FlashDB Test Configuration & Standards

## Test Suite Overview

FlashDB implements 450+ tests across multiple categories for v1.0.0 production release.

### Test Categories

| Category | File(s) | Test Count | Target Coverage |
|----------|---------|-----------|-----------------|
| Unit Tests | `Unit/**` | 50+ | 95%+ |
| Integration | `Integration/**` | 80+ | 90%+ |
| API Tests | `FlashDB.Api/**` | 60+ | 85%+ |
| Performance | `Performance/**` | 120+ | 100% |
| Load Tests | `Performance/LoadTests.ps1` | 100+ | N/A |
| Security | `Security/**` | 180+ | 100% |
| Resilience | `Resilience/**` | 50+ | N/A |
| Metrics | `Metrics/**` | 30+ | 100% |

**Total: 450+ tests**

## Test Execution

### Quick Run
```powershell
cd c:\flashdb
.\tests\RUN_TESTS.ps1
```

### Full Test Suite
```powershell
# Run all tests with coverage
$config = New-PesterConfiguration
$config.Run.Path = 'tests'
$config.CodeCoverage.Enabled = $true
$config.CodeCoverage.Path = 'src/FlashDB'
Invoke-Pester -Configuration $config
```

### Individual Test Suites
```powershell
# Load tests
Invoke-Pester -Path 'tests/Performance/LoadTests.ps1'

# Security tests
Invoke-Pester -Path 'tests/Security/SecurityTests.ps1'

# Resilience tests
Invoke-Pester -Path 'tests/Resilience/ResilienceTests.ps1'
```

## Load Testing

### Configuration
- **File:** `tests/Performance/LoadTests.ps1`
- **Duration:** ~10-15 minutes
- **Concurrent Users:** 5, 10, 20
- **Operations Per User:** 10
- **Total Requests:** 1,500+

### Metrics Tracked
| Metric | Target | Threshold |
|--------|--------|-----------|
| Success Rate (5 users) | 99% | ≥95% |
| Success Rate (10 users) | 98% | ≥95% |
| Success Rate (20 users) | 90% | ≥80% |
| Response Time Average | <2s | <3s |
| Response Time P95 | <2s | <3s |
| Throughput | >5 req/s | >3 req/s |
| Error Rate | <2% | <5% |

### Load Test Results Output
```json
{
  "Timestamp": "2026-06-06T12:00:00Z",
  "TotalRequests": 1500,
  "SuccessfulRequests": 1470,
  "FailedRequests": 30,
  "SuccessRate": 0.98,
  "AverageResponseTime": 1850,
  "Throughput": 5.2,
  "TestDuration": 288.5,
  "Results": [
    {
      "Scenario": "5-Concurrent-Users",
      "AverageResponseTime": 1200,
      "SuccessRate": 0.99,
      "TotalOperations": 50
    },
    {
      "Scenario": "10-Concurrent-Users",
      "AverageResponseTime": 1850,
      "SuccessRate": 0.98,
      "TotalOperations": 100
    },
    {
      "Scenario": "20-Concurrent-Users",
      "AverageResponseTime": 2300,
      "SuccessRate": 0.90,
      "TotalOperations": 200
    }
  ]
}
```

## Security Testing

### Configuration
- **File:** `tests/Security/SecurityTests.ps1`
- **Input Validation:** `tests/Security/InputValidation.Tests.ps1`
- **Duration:** ~5-8 minutes
- **Test Scenarios:** 180+

### OWASP Coverage

#### A01:2021 - Broken Access Control
- ✅ Authentication enforcement
- ✅ Authorization checks
- ✅ Admin endpoint protection
- ✅ User isolation
- ✅ Token validation

#### A02:2021 - Cryptographic Failures
- ✅ HTTPS enforcement
- ✅ Data encryption at rest
- ✅ Secure password hashing
- ✅ TLS/SSL validation

#### A03:2021 - Injection
- ✅ SQL injection prevention (7+ payloads)
- ✅ Command injection prevention (5+ payloads)
- ✅ Path traversal prevention
- ✅ Input sanitization

#### A07:2021 - Cross-Site Scripting (XSS)
- ✅ Output encoding
- ✅ Content Security Policy
- ✅ HTML entity encoding
- ✅ JavaScript context escaping

### Input Validation Coverage
- String parameters
- Numeric ranges
- Boolean values
- Array/collection limits
- Email format
- URL format
- Date/time format
- Enum constraints
- Required fields

### Security Test Output
```json
{
  "Timestamp": "2026-06-06T12:00:00Z",
  "TotalTests": 180,
  "PassedTests": 175,
  "FailedTests": 0,
  "WarningTests": 5,
  "Results": [
    {
      "Test": "Password-Requirements",
      "Category": "Authentication",
      "Result": "PASS",
      "Details": "Weak passwords rejected: 5/5"
    },
    {
      "Test": "SQL-Injection-Prevention",
      "Category": "Input-Validation",
      "Result": "PASS",
      "Details": "SQL injection attempts blocked: 7/7"
    }
  ]
}
```

## Resilience Testing

### Configuration
- **File:** `tests/Resilience/ResilienceTests.ps1`
- **Duration:** ~8-12 minutes
- **Test Scenarios:** 50+

### Failure Scenarios Covered
- Network timeouts
- Database disconnection
- Service unavailability
- Concurrent access conflicts
- Long-running operation timeouts
- Service restart recovery
- File operation failures
- Rate limiting triggers

### Recovery Expectations
| Failure Type | Recovery Time | Status Code |
|--------------|---------------|------------|
| Connection Timeout | <5 seconds | 503 |
| Database Error | <10 seconds | 503 |
| Service Down | <30 seconds | 503 |
| Rate Limited | Retry after 60s | 429 |

### Resilience Test Output
```json
{
  "Timestamp": "2026-06-06T12:00:00Z",
  "TotalTests": 50,
  "PassedTests": 48,
  "FailedTests": 0,
  "SuccessfulRecoveries": 47,
  "Results": [
    {
      "Test": "Circuit-Breaker",
      "Category": "Network-Resilience",
      "Result": "PASS",
      "FailureCount": 5,
      "Details": "Circuit breaker triggered after 5 failures"
    }
  ]
}
```

## Code Coverage

### Target: 85%+
```
FlashDB Module
├── Core
│   ├── GoldenImage Management: 95%
│   ├── Clone Management: 92%
│   ├── Checkpoint & Rollback: 88%
│   └── Utility Functions: 90%
├── Providers
│   ├── SqlServer: 85%
│   └── File Storage: 82%
└── API
    ├── Controllers: 87%
    ├── Services: 89%
    └── Middleware: 83%
```

### Coverage Reports
- Generated by Pester: `coverage.xml`
- Uploaded to Codecov
- Trend tracking per commit
- Diff coverage for PRs

## Performance Baselines

### Clone Operations
- Create clone: <5 seconds
- List clones: <2 seconds
- Get clone details: <1 second
- Delete clone: <3 seconds

### Checkpoint Operations
- Create checkpoint: <1 second
- List checkpoints: <2 seconds
- Restore checkpoint: <5 seconds

### API Operations
- Health check: <500ms
- Authentication: <1 second
- List operations: <2 seconds

## Continuous Integration

### GitHub Actions Workflow
```
PR/Push
  ├─ test.yml (runs in ~15 minutes)
  │  ├─ PowerShell tests (multi-version)
  │  ├─ API tests
  │  ├─ Code quality & coverage
  │  ├─ Security scan
  │  ├─ Performance baseline
  │  ├─ Load tests
  │  ├─ Resilience tests
  │  └─ Summary
  │
  ├─ security.yml (runs in ~20 minutes)
  │  ├─ CodeQL analysis
  │  ├─ Dependency check
  │  ├─ Secrets scanning
  │  ├─ SAST analysis
  │  ├─ API security tests
  │  └─ Security report
  │
  └─ build.yml (if release tag)
     ├─ API build
     ├─ GUI build
     ├─ PowerShell module
     ├─ Docker images
     └─ Release creation
```

### Branch Protection
- ✅ Require test.yml to pass
- ✅ Require security.yml to pass
- ✅ Dismiss stale approvals
- ✅ Require code review (1+)

## Test Standards

### Naming Convention
```powershell
Describe "Feature-Category: Specific Functionality" {
    Context "Specific Scenario" {
        It "Should expected behavior under condition" {
            # Arrange
            # Act
            # Assert
        }
    }
}
```

### Test Structure (AAA Pattern)
```powershell
# Arrange - Setup test data and conditions
$TestData = @{ id = 1; name = 'test' }

# Act - Execute the code being tested
$Result = Invoke-Function -Data $TestData

# Assert - Verify results match expectations
$Result | Should -Be $Expected
```

### Assertion Standards
```powershell
# Value assertions
$value | Should -Be $expected
$value | Should -Equal $expected
$value | Should -Match $pattern

# Range assertions
$value | Should -BeLessThan 100
$value | Should -BeGreaterThan 0
$value | Should -BeInRange 0 100

# Collection assertions
$array | Should -Contain $item
$array | Should -HaveCount 5

# Exception assertions
{ command } | Should -Throw
{ command } | Should -Not -Throw

# Null assertions
$value | Should -BeNullOrEmpty
$value | Should -Not -BeNullOrEmpty
```

## Debugging Failed Tests

### Enable Verbose Output
```powershell
$config = New-PesterConfiguration
$config.Output.Verbosity = 'Detailed'
Invoke-Pester -Configuration $config
```

### Run Single Test
```powershell
Invoke-Pester -Path 'tests/Security/SecurityTests.ps1' `
    -FilterScript { $_.Name -match 'SQL-Injection' }
```

### Save Test Results
```powershell
$config = New-PesterConfiguration
$config.TestResult.Enabled = $true
$config.TestResult.OutputPath = 'test-results.xml'
Invoke-Pester -Configuration $config
```

## Known Issues & Workarounds

### Issue: Load tests fail if API not running
**Workaround:** Start API in separate terminal before running load tests
```powershell
# Terminal 1: Start API
dotnet run --project src/FlashDB.Api

# Terminal 2: Run tests
Invoke-Pester -Path 'tests/Performance/LoadTests.ps1'
```

### Issue: SQL Server not accessible in CI
**Workaround:** Use test database container (set up in workflow)
```powershell
# SQL Server container started before tests in CI workflow
```

### Issue: Concurrent test conflicts
**Workaround:** Use unique identifiers in test data
```powershell
$UniqueName = "test-$(Get-Random)"
```

## Future Enhancements

Phase 5 - Additional Testing:
- [ ] End-to-end UI testing with Selenium
- [ ] API contract testing
- [ ] Chaos engineering tests
- [ ] Multi-region resilience
- [ ] Disaster recovery testing
- [ ] Load testing with realistic data
- [ ] Long-running stability tests
- [ ] Accessibility testing

---

**Last Updated:** June 6, 2026
**Version:** 1.0.0-prod
**Status:** Production Ready ✅
