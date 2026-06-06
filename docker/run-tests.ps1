# FlashDB Docker Testing Script
# Validates FlashDB functionality in isolated Docker environment

param(
    [string]$TestType = "all",  # unit, integration, performance, all
    [switch]$Verbose,
    [switch]$GenerateReport
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$FLASHDB_HOME = $env:FLASHDB_HOME ?? "/app/flashdb"
$SQL_SERVER = $env:SQL_SERVER_HOST ?? "localhost"
$SQL_PORT = $env:SQL_SERVER_PORT ?? "1433"
$SQL_USER = $env:SQL_SERVER_USER ?? "sa"
$SQL_PASSWORD = $env:SQL_SERVER_PASSWORD ?? ""
$TEST_RESULTS = "/app/test-results"

Write-Host "╔════════════════════════════════════════════════════════════╗"
Write-Host "║         FlashDB Docker Test Suite                         ║"
Write-Host "╚════════════════════════════════════════════════════════════╝"
Write-Host ""
Write-Host "Configuration:"
Write-Host "  FlashDB Home: $FLASHDB_HOME"
Write-Host "  SQL Server: $SQL_SERVER`:$SQL_PORT"
Write-Host "  Test Type: $TestType"
Write-Host "  Test Results: $TEST_RESULTS"
Write-Host ""

# Create test results directory
New-Item -ItemType Directory -Path $TEST_RESULTS -Force | Out-Null

# Function to validate SQL Server connection
function Test-SqlServerConnection {
    Write-Host "Testing SQL Server connection..."

    $connectionString = "Server=$SQL_SERVER,$SQL_PORT;User Id=$SQL_USER;Password=$SQL_PASSWORD;Database=master;TrustServerCertificate=Yes"

    try {
        $sqlConn = New-Object System.Data.SqlClient.SqlConnection($connectionString)
        $sqlConn.Open()
        $query = "SELECT @@VERSION AS Version"
        $cmd = $sqlConn.CreateCommand()
        $cmd.CommandText = $query
        $result = $cmd.ExecuteScalar()
        $sqlConn.Close()

        Write-Host "✓ SQL Server connection successful"
        Write-Host "  Version: $($result.Substring(0, 50))..."
        return $true
    } catch {
        Write-Host "✗ SQL Server connection failed: $_"
        return $false
    }
}

# Function to test FlashDB module import
function Test-FlashdbModuleImport {
    Write-Host "Testing FlashDB module import..."

    try {
        Import-Module "$FLASHDB_HOME/src/FlashDB/FlashDB.psm1" -ErrorAction Stop -WarningAction SilentlyContinue
        $cmdlets = Get-Command -Module FlashDB -ErrorAction SilentlyContinue
        $count = @($cmdlets).Count

        if ($count -gt 0) {
            Write-Host "✓ FlashDB module loaded successfully"
            Write-Host "  Exported cmdlets: $count"
            return $true
        } else {
            Write-Host "✗ FlashDB module loaded but no cmdlets exported"
            return $false
        }
    } catch {
        Write-Host "✗ FlashDB module import failed: $_"
        return $false
    }
}

# Function to run unit tests
function Invoke-UnitTests {
    Write-Host ""
    Write-Host "Running unit tests..."

    $testFiles = @(
        "$FLASHDB_HOME/tests/FlashDB/FlashDB.Tests.ps1",
        "$FLASHDB_HOME/tests/Providers/SqlServer/SqlServerProvider.Tests.ps1"
    )

    $results = @()

    foreach ($testFile in $testFiles) {
        if (Test-Path $testFile) {
            Write-Host "  Running: $(Split-Path -Leaf $testFile)"

            try {
                $pesterResults = Invoke-Pester -Path $testFile -PassThru -ErrorAction SilentlyContinue
                $results += $pesterResults
            } catch {
                Write-Host "    Warning: $_"
            }
        }
    }

    return $results
}

# Function to run integration tests
function Invoke-IntegrationTests {
    Write-Host ""
    Write-Host "Running integration tests..."

    $testFile = "$FLASHDB_HOME/tests/Integration/FlashDB.Integration.Tests.ps1"

    if (Test-Path $testFile) {
        Write-Host "  Running: $(Split-Path -Leaf $testFile)"

        try {
            $pesterResults = Invoke-Pester -Path $testFile -PassThru -ErrorAction SilentlyContinue
            return $pesterResults
        } catch {
            Write-Host "    Warning: $_"
        }
    }

    return $null
}

# Function to generate test report
function New-TestReport {
    param([array]$Results)

    Write-Host ""
    Write-Host "╔════════════════════════════════════════════════════════════╗"
    Write-Host "║                    Test Summary Report                     ║"
    Write-Host "╚════════════════════════════════════════════════════════════╝"

    $totalTests = 0
    $passedTests = 0
    $failedTests = 0

    foreach ($result in $Results) {
        if ($result) {
            $totalTests += $result.TotalCount
            $passedTests += $result.PassedCount
            $failedTests += $result.FailedCount
        }
    }

    Write-Host ""
    Write-Host "Test Results:"
    Write-Host "  Total Tests:  $totalTests"
    Write-Host "  Passed:       $passedTests ✓"
    Write-Host "  Failed:       $failedTests ✗"

    if ($failedTests -eq 0 -and $totalTests -gt 0) {
        Write-Host ""
        Write-Host "✓ All tests PASSED!"
        return $true
    } else {
        Write-Host ""
        Write-Host "✗ Some tests failed"
        return $false
    }
}

# Main test execution
Write-Host "Phase 1: Connectivity Tests"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

$sqlConnected = Test-SqlServerConnection
$moduleLoaded = Test-FlashdbModuleImport

if (-not $sqlConnected) {
    Write-Host ""
    Write-Host "✗ Cannot proceed: SQL Server not connected"
    Write-Host "  Please ensure SQL Server container is running and healthy"
    exit 1
}

if (-not $moduleLoaded) {
    Write-Host ""
    Write-Host "⚠ Warning: FlashDB module may not be fully functional"
}

Write-Host ""
Write-Host "Phase 2: Functional Tests"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

$allResults = @()

if ($TestType -in @("unit", "all")) {
    $unitResults = Invoke-UnitTests
    $allResults += $unitResults
}

if ($TestType -in @("integration", "all")) {
    $integrationResults = Invoke-IntegrationTests
    $allResults += $integrationResults
}

# Generate report
if ($GenerateReport -or $TestType -eq "all") {
    $success = New-TestReport $allResults
}

Write-Host ""
Write-Host "Test execution complete!"
Write-Host "Results saved to: $TEST_RESULTS"

# Exit with appropriate code
if ($success) {
    exit 0
} else {
    exit 1
}
