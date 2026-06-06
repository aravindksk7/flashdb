<#
.SYNOPSIS
    Master test runner for FlashDB SQL Server Provider test suite
.DESCRIPTION
    Orchestrates execution of unit, integration, and performance tests
    with result aggregation and reporting.

.EXAMPLE
    .\RUN_TESTS.ps1
    .\RUN_TESTS.ps1 -TestType Unit
    .\RUN_TESTS.ps1 -TestType Integration -Verbose
    .\RUN_TESTS.ps1 -GenerateReport
#>

param(
    [ValidateSet('All', 'Unit', 'Integration', 'Performance')]
    [string]$TestType = 'All',

    [switch]$Verbose = $false,

    [switch]$GenerateReport = $false,

    [string]$OutputPath = "tests/TestResults.xml"
)

#region Setup

$ErrorActionPreference = 'Continue'

# Resolve paths
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptRoot
$TestsPath = $ScriptRoot

# Colors for output
$Colors = @{
    Success = 'Green'
    Failure = 'Red'
    Warning = 'Yellow'
    Info = 'Cyan'
}

function Write-ColorOutput {
    param([string]$Message, [ConsoleColor]$Color = 'White')
    Write-Host $Message -ForegroundColor $Color
}

#endregion

#region Test Execution Functions

function Invoke-UnitTests {
    Write-ColorOutput "`n[UNIT TESTS]" -Color $Colors.Info
    Write-ColorOutput "=" * 60 -Color $Colors.Info

    $unitTestPath = Join-Path $TestsPath "Unit\SqlServerProvider.Tests.ps1"

    if (-not (Test-Path $unitTestPath)) {
        Write-ColorOutput "ERROR: Unit test file not found at $unitTestPath" -Color $Colors.Failure
        return $null
    }

    Write-ColorOutput "Executing: $unitTestPath"
    Write-Host ""

    $verboseFlag = if ($Verbose) { $true } else { $false }

    $result = Invoke-Pester -Path $unitTestPath `
        -PassThru `
        -Verbose:$verboseFlag

    return $result
}

function Invoke-IntegrationTests {
    Write-ColorOutput "`n[INTEGRATION TESTS]" -Color $Colors.Info
    Write-ColorOutput "=" * 60 -Color $Colors.Info

    $integrationTestPath = Join-Path $TestsPath "Integration\SqlServerGoldenImage.Tests.ps1"

    if (-not (Test-Path $integrationTestPath)) {
        Write-ColorOutput "ERROR: Integration test file not found at $integrationTestPath" -Color $Colors.Failure
        return $null
    }

    Write-ColorOutput "Executing: $integrationTestPath"
    Write-ColorOutput "NOTE: Requires SQL Server instance on LOCALHOST\SQLEXPRESS" -Color $Colors.Warning
    Write-Host ""

    # Check SQL Server availability
    try {
        $conn = New-Object System.Data.SqlClient.SqlConnection("Server=LOCALHOST\SQLEXPRESS;Connection Timeout=5;Integrated Security=true")
        $conn.Open()
        $conn.Close()
        Write-ColorOutput "✓ SQL Server connection verified" -Color $Colors.Success
    }
    catch {
        Write-ColorOutput "⚠ SQL Server not available - Integration tests will be skipped or marked as incomplete" -Color $Colors.Warning
    }

    Write-Host ""

    $verboseFlag = if ($Verbose) { $true } else { $false }

    $result = Invoke-Pester -Path $integrationTestPath `
        -PassThru `
        -Verbose:$verboseFlag

    return $result
}

function Invoke-PerformanceTests {
    Write-ColorOutput "`n[PERFORMANCE TESTS]" -Color $Colors.Info
    Write-ColorOutput "=" * 60 -Color $Colors.Info

    $perfTestPath = Join-Path $TestsPath "Performance\SqlServerPerf.ps1"

    if (-not (Test-Path $perfTestPath)) {
        Write-ColorOutput "ERROR: Performance test file not found at $perfTestPath" -Color $Colors.Failure
        return $null
    }

    Write-ColorOutput "Executing: $perfTestPath"
    Write-Host ""

    $verboseFlag = if ($Verbose) { $true } else { $false }

    $result = Invoke-Pester -Path $perfTestPath `
        -PassThru `
        -Verbose:$verboseFlag

    return $result
}

#endregion

#region Result Reporting

function Format-TestResults {
    param(
        [object[]]$Results
    )

    Write-Host ""
    Write-ColorOutput "=" * 60 -Color $Colors.Info
    Write-ColorOutput "TEST EXECUTION SUMMARY" -Color $Colors.Info
    Write-ColorOutput "=" * 60 -Color $Colors.Info
    Write-Host ""

    if ($null -eq $Results -or $Results.Count -eq 0) {
        Write-ColorOutput "No test results to report" -Color $Colors.Warning
        return
    }

    $totalTests = 0
    $totalPassed = 0
    $totalFailed = 0
    $totalSkipped = 0

    foreach ($result in $Results) {
        if ($null -ne $result) {
            $totalTests += $result.FailedCount + $result.PassedCount + $result.SkippedCount
            $totalPassed += $result.PassedCount
            $totalFailed += $result.FailedCount
            $totalSkipped += $result.SkippedCount
        }
    }

    Write-Host "Total Tests:    $totalTests"
    Write-ColorOutput "  Passed:     $totalPassed" -Color $Colors.Success
    if ($totalFailed -gt 0) {
        Write-ColorOutput "  Failed:     $totalFailed" -Color $Colors.Failure
    } else {
        Write-Host "  Failed:     $totalFailed"
    }
    if ($totalSkipped -gt 0) {
        Write-ColorOutput "  Skipped:    $totalSkipped" -Color $Colors.Warning
    } else {
        Write-Host "  Skipped:    $totalSkipped"
    }

    Write-Host ""

    # Calculate pass rate
    if ($totalTests -gt 0) {
        $passRate = [Math]::Round(($totalPassed / $totalTests) * 100, 2)
        $passColor = if ($passRate -eq 100) { $Colors.Success } else { $Colors.Warning }
        Write-ColorOutput "Pass Rate:      $passRate%" -Color $passColor
    }

    Write-Host ""

    # Overall status
    if ($totalFailed -eq 0) {
        Write-ColorOutput "OVERALL STATUS: PASSED" -Color $Colors.Success
    } else {
        Write-ColorOutput "OVERALL STATUS: FAILED" -Color $Colors.Failure
    }

    Write-ColorOutput "=" * 60 -Color $Colors.Info
    Write-Host ""
}

function Export-TestResults {
    param(
        [object[]]$Results,
        [string]$OutputFile
    )

    if ($null -eq $Results -or $Results.Count -eq 0) {
        Write-ColorOutput "No results to export" -Color $Colors.Warning
        return
    }

    $outputDir = Split-Path -Parent $OutputFile
    if (-not (Test-Path $outputDir)) {
        New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
    }

    try {
        # Combine all results
        $combinedResults = @{
            TestRuns = @()
            Summary = @{
                TotalTests = 0
                TotalPassed = 0
                TotalFailed = 0
                TotalSkipped = 0
                ExecutedAt = (Get-Date -Format 'o')
            }
        }

        foreach ($result in $Results) {
            if ($null -ne $result) {
                $combinedResults.TestRuns += @{
                    TestName = $result.TestFilePath
                    Passed = $result.PassedCount
                    Failed = $result.FailedCount
                    Skipped = $result.SkippedCount
                }

                $combinedResults.Summary.TotalTests += $result.FailedCount + $result.PassedCount + $result.SkippedCount
                $combinedResults.Summary.TotalPassed += $result.PassedCount
                $combinedResults.Summary.TotalFailed += $result.FailedCount
                $combinedResults.Summary.TotalSkipped += $result.SkippedCount
            }
        }

        $combinedResults | ConvertTo-Json | Set-Content -Path $OutputFile -Force

        Write-ColorOutput "Test results exported to: $OutputFile" -Color $Colors.Success
    }
    catch {
        Write-ColorOutput "Error exporting test results: $_" -Color $Colors.Failure
    }
}

#endregion

#region Main Execution

Write-ColorOutput "`n╔════════════════════════════════════════════════════════════╗" -Color $Colors.Info
Write-ColorOutput "║         FlashDB SQL Server Provider Test Suite              ║" -Color $Colors.Info
Write-ColorOutput "╚════════════════════════════════════════════════════════════╝" -Color $Colors.Info

Write-ColorOutput "Test Type: $TestType" -Color $Colors.Info
Write-ColorOutput "Output Path: $OutputPath" -Color $Colors.Info
Write-Host ""

$allResults = @()
$startTime = Get-Date

try {
    # Execute tests based on type
    if ($TestType -eq 'All' -or $TestType -eq 'Unit') {
        $result = Invoke-UnitTests
        if ($null -ne $result) {
            $allResults += $result
        }
    }

    if ($TestType -eq 'All' -or $TestType -eq 'Integration') {
        $result = Invoke-IntegrationTests
        if ($null -ne $result) {
            $allResults += $result
        }
    }

    if ($TestType -eq 'All' -or $TestType -eq 'Performance') {
        $result = Invoke-PerformanceTests
        if ($null -ne $result) {
            $allResults += $result
        }
    }

    # Format and display results
    Format-TestResults -Results $allResults

    # Export results if requested
    if ($GenerateReport) {
        Export-TestResults -Results $allResults -OutputFile $OutputPath
    }

}
catch {
    Write-ColorOutput "ERROR: $($_.Exception.Message)" -Color $Colors.Failure
    Write-Host $_.ScriptStackTrace
}

$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host ""
Write-ColorOutput "Test Execution Time: $([Math]::Round($duration.TotalSeconds, 2)) seconds" -Color $Colors.Info
Write-Host ""

#endregion
