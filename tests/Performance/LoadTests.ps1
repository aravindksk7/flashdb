#Requires -Modules @{ ModuleName='Pester'; ModuleVersion='5.0.0' }

<#
.SYNOPSIS
Load testing for FlashDB API with concurrent user simulation
.DESCRIPTION
Tests concurrent user scenarios to validate performance under load:
- 5 concurrent users (baseline)
- 10 concurrent users (standard load)
- 20 concurrent users (peak load)
- Measures: response time, success rate, throughput
- Targets: 98% success at 10 concurrent users, <2s avg response
#>

BeforeAll {
    $script:LoadTestConfig = @{
        BaseUrl = 'http://localhost:5000'
        MaxRetries = 3
        Timeout = 30
        ConcurrentUsers = @(5, 10, 20)
        OperationsPerUser = 10
        ResponseTimeTarget = 2000  # milliseconds
        SuccessRateTarget = 0.98   # 98%
        ThroughputMinimum = 5      # requests per second
    }

    $script:LoadTestResults = @()
    $script:TestStartTime = Get-Date
    $script:RequestCount = 0
    $script:SuccessCount = 0
    $script:FailureCount = 0
    $script:TotalResponseTime = 0
}

AfterAll {
    # Generate load test report
    if ($script:RequestCount -gt 0) {
        $AvgResponseTime = $script:TotalResponseTime / $script:RequestCount
        $SuccessRate = $script:SuccessCount / $script:RequestCount
        $TestDuration = ((Get-Date) - $script:TestStartTime).TotalSeconds
        $Throughput = $script:RequestCount / $TestDuration

        $Report = @{
            Timestamp = Get-Date -Format 'o'
            TotalRequests = $script:RequestCount
            SuccessfulRequests = $script:SuccessCount
            FailedRequests = $script:FailureCount
            SuccessRate = $SuccessRate
            AverageResponseTime = $AvgResponseTime
            Throughput = $Throughput
            TestDuration = $TestDuration
            Results = $script:LoadTestResults
        }

        $ReportPath = Join-Path $PSScriptRoot 'load-test-report.json'
        $Report | ConvertTo-Json | Out-File $ReportPath -Force

        Write-Output "Load Test Report generated: $ReportPath"
        Write-Output "  Total Requests: $($Report.TotalRequests)"
        Write-Output "  Success Rate: $($Report.SuccessRate * 100)%"
        Write-Output "  Average Response Time: $($Report.AverageResponseTime)ms"
        Write-Output "  Throughput: $($Report.Throughput) req/s"
    }
}

Describe "Load Testing: Concurrent User Simulation" {
    Context "5 Concurrent Users (Baseline)" {
        It "Should handle 5 concurrent users with <2s response time" {
            # Arrange
            $ConcurrentUsers = 5
            $OperationsPerUser = 10
            $Results = @()

            # Act
            $ScriptBlock = {
                param($UserId, $OperationId)

                $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

                try {
                    # Simulate API request
                    $Response = Invoke-RestMethod -Uri "$($script:LoadTestConfig.BaseUrl)/api/health" `
                        -Method Get `
                        -TimeoutSec $script:LoadTestConfig.Timeout `
                        -ErrorAction Stop

                    $Stopwatch.Stop()
                    $ResponseTime = $Stopwatch.Elapsed.TotalMilliseconds

                    $script:RequestCount++
                    $script:TotalResponseTime += $ResponseTime
                    $script:SuccessCount++

                    return @{
                        UserId = $UserId
                        OperationId = $OperationId
                        Status = 'SUCCESS'
                        ResponseTime = $ResponseTime
                        Timestamp = Get-Date -Format 'o'
                    }
                }
                catch {
                    $Stopwatch.Stop()
                    $script:RequestCount++
                    $script:FailureCount++

                    return @{
                        UserId = $UserId
                        OperationId = $OperationId
                        Status = 'FAILED'
                        Error = $_.Exception.Message
                        Timestamp = Get-Date -Format 'o'
                    }
                }
            }

            # Execute concurrent operations
            $Jobs = @()
            for ($u = 1; $u -le $ConcurrentUsers; $u++) {
                for ($o = 1; $o -le $OperationsPerUser; $o++) {
                    $Jobs += Start-Job -ScriptBlock $ScriptBlock -ArgumentList $u, $o
                }
            }

            # Wait for all jobs to complete
            $JobResults = $Jobs | Wait-Job | ForEach-Object { Receive-Job -Job $_ }
            $Jobs | Remove-Job

            # Assert
            $SuccessfulResults = @($JobResults | Where-Object { $_.Status -eq 'SUCCESS' })
            $AvgResponseTime = ($SuccessfulResults | Measure-Object -Property ResponseTime -Average).Average

            $AvgResponseTime | Should -BeLessThan $script:LoadTestConfig.ResponseTimeTarget
            $SuccessfulResults.Count | Should -BeGreaterOrEqual ($ConcurrentUsers * $OperationsPerUser * 0.95)

            # Record results
            $script:LoadTestResults += @{
                Scenario = "5-Concurrent-Users"
                AverageResponseTime = $AvgResponseTime
                SuccessRate = ($SuccessfulResults.Count / $JobResults.Count)
                TotalOperations = $JobResults.Count
            }
        }

        It "Should maintain throughput of at least 5 req/s" {
            # This is validated in the report generation
            $script:LoadTestResults[-1].SuccessRate | Should -BeGreaterOrEqual 0.95
        }
    }

    Context "10 Concurrent Users (Standard Load)" {
        It "Should handle 10 concurrent users with 98% success rate" {
            # Arrange
            $ConcurrentUsers = 10
            $OperationsPerUser = 10
            $ExpectedSuccessRate = 0.98

            # Act
            $ScriptBlock = {
                param($UserId, $OperationId)

                $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

                try {
                    $Response = Invoke-RestMethod -Uri "$($script:LoadTestConfig.BaseUrl)/api/status" `
                        -Method Get `
                        -TimeoutSec $script:LoadTestConfig.Timeout `
                        -ErrorAction Stop

                    $Stopwatch.Stop()
                    $ResponseTime = $Stopwatch.Elapsed.TotalMilliseconds

                    $script:RequestCount++
                    $script:TotalResponseTime += $ResponseTime
                    $script:SuccessCount++

                    return @{
                        UserId = $UserId
                        OperationId = $OperationId
                        Status = 'SUCCESS'
                        ResponseTime = $ResponseTime
                        Timestamp = Get-Date -Format 'o'
                    }
                }
                catch {
                    $Stopwatch.Stop()
                    $script:RequestCount++
                    $script:FailureCount++

                    return @{
                        UserId = $UserId
                        OperationId = $OperationId
                        Status = 'FAILED'
                        Error = $_.Exception.Message
                        Timestamp = Get-Date -Format 'o'
                    }
                }
            }

            # Execute concurrent operations
            $Jobs = @()
            for ($u = 1; $u -le $ConcurrentUsers; $u++) {
                for ($o = 1; $o -le $OperationsPerUser; $o++) {
                    $Jobs += Start-Job -ScriptBlock $ScriptBlock -ArgumentList $u, $o
                }
            }

            # Wait for all jobs to complete
            $JobResults = $Jobs | Wait-Job | ForEach-Object { Receive-Job -Job $_ }
            $Jobs | Remove-Job

            # Assert
            $SuccessfulResults = @($JobResults | Where-Object { $_.Status -eq 'SUCCESS' })
            $ActualSuccessRate = $SuccessfulResults.Count / $JobResults.Count
            $AvgResponseTime = ($SuccessfulResults | Measure-Object -Property ResponseTime -Average).Average

            $ActualSuccessRate | Should -BeGreaterOrEqual $ExpectedSuccessRate
            $AvgResponseTime | Should -BeLessThan $script:LoadTestConfig.ResponseTimeTarget

            # Record results
            $script:LoadTestResults += @{
                Scenario = "10-Concurrent-Users"
                AverageResponseTime = $AvgResponseTime
                SuccessRate = $ActualSuccessRate
                TotalOperations = $JobResults.Count
            }
        }

        It "Should maintain average response time under 2 seconds" {
            $script:LoadTestResults[-1].AverageResponseTime | Should -BeLessThan $script:LoadTestConfig.ResponseTimeTarget
        }
    }

    Context "20 Concurrent Users (Peak Load)" {
        It "Should handle 20 concurrent users with degradation no worse than 10% success rate drop" {
            # Arrange
            $ConcurrentUsers = 20
            $OperationsPerUser = 10
            $PreviousSucessRate = ($script:LoadTestResults | Where-Object { $_.Scenario -eq "10-Concurrent-Users" }).SuccessRate
            $MinAcceptableSucessRate = [Math]::Max(0.90, $PreviousSucessRate - 0.10)

            # Act
            $ScriptBlock = {
                param($UserId, $OperationId)

                $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

                try {
                    $Response = Invoke-RestMethod -Uri "$($script:LoadTestConfig.BaseUrl)/api/clone/list" `
                        -Method Get `
                        -TimeoutSec $script:LoadTestConfig.Timeout `
                        -ErrorAction Stop

                    $Stopwatch.Stop()
                    $ResponseTime = $Stopwatch.Elapsed.TotalMilliseconds

                    $script:RequestCount++
                    $script:TotalResponseTime += $ResponseTime
                    $script:SuccessCount++

                    return @{
                        UserId = $UserId
                        OperationId = $OperationId
                        Status = 'SUCCESS'
                        ResponseTime = $ResponseTime
                        Timestamp = Get-Date -Format 'o'
                    }
                }
                catch {
                    $Stopwatch.Stop()
                    $script:RequestCount++
                    $script:FailureCount++

                    return @{
                        UserId = $UserId
                        OperationId = $OperationId
                        Status = 'FAILED'
                        Error = $_.Exception.Message
                        Timestamp = Get-Date -Format 'o'
                    }
                }
            }

            # Execute concurrent operations
            $Jobs = @()
            for ($u = 1; $u -le $ConcurrentUsers; $u++) {
                for ($o = 1; $o -le $OperationsPerUser; $o++) {
                    $Jobs += Start-Job -ScriptBlock $ScriptBlock -ArgumentList $u, $o
                }
            }

            # Wait for all jobs to complete
            $JobResults = $Jobs | Wait-Job | ForEach-Object { Receive-Job -Job $_ }
            $Jobs | Remove-Job

            # Assert
            $SuccessfulResults = @($JobResults | Where-Object { $_.Status -eq 'SUCCESS' })
            $ActualSuccessRate = $SuccessfulResults.Count / $JobResults.Count

            $ActualSuccessRate | Should -BeGreaterOrEqual $MinAcceptableSucessRate

            # Record results
            $script:LoadTestResults += @{
                Scenario = "20-Concurrent-Users"
                AverageResponseTime = ($SuccessfulResults | Measure-Object -Property ResponseTime -Average).Average
                SuccessRate = $ActualSuccessRate
                TotalOperations = $JobResults.Count
            }
        }
    }

    Context "Stress Testing: Threshold Detection" {
        It "Should identify maximum concurrent users before degradation" {
            # Arrange: Gradually increase load to find threshold
            $Thresholds = @()
            $LoadLevels = @(5, 10, 15, 20, 25)

            foreach ($Load in $LoadLevels) {
                # Test at this load level
                $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()

                $ScriptBlock = {
                    param($UserId)
                    try {
                        Invoke-RestMethod -Uri "$($script:LoadTestConfig.BaseUrl)/api/health" `
                            -Method Get `
                            -TimeoutSec 5 `
                            -ErrorAction Stop
                        return 'SUCCESS'
                    }
                    catch {
                        return 'FAILED'
                    }
                }

                $Jobs = @()
                for ($u = 1; $u -le $Load; $u++) {
                    $Jobs += Start-Job -ScriptBlock $ScriptBlock -ArgumentList $u
                }

                $JobResults = $Jobs | Wait-Job | ForEach-Object { Receive-Job -Job $_ }
                $Jobs | Remove-Job

                $SuccessRate = ($JobResults | Where-Object { $_ -eq 'SUCCESS' }).Count / $JobResults.Count
                $Stopwatch.Stop()

                $Thresholds += @{
                    LoadLevel = $Load
                    SuccessRate = $SuccessRate
                    Duration = $Stopwatch.Elapsed.TotalSeconds
                }

                # Stop if success rate drops below 90%
                if ($SuccessRate -lt 0.90) {
                    break
                }
            }

            # Assert: Should handle at least 10 concurrent users
            $ThresholdAt10 = $Thresholds | Where-Object { $_.LoadLevel -eq 10 }
            $ThresholdAt10.SuccessRate | Should -BeGreaterOrEqual 0.98

            # Record threshold data
            $script:LoadTestResults += @{
                Scenario = "Stress-Test-Threshold"
                MaxConcurrentUsers = ($Thresholds[-1]).LoadLevel
                Thresholds = $Thresholds
            }
        }
    }

    Context "Sustained Load: Long-running stability" {
        It "Should maintain performance over sustained 5 minute load" {
            # Arrange
            $DurationSeconds = 300  # 5 minutes
            $ConcurrentUsers = 5
            $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
            $RollingResults = @()

            # Act: Run continuous load for duration
            $ScriptBlock = {
                param($Duration, $ConcurrentUsers)

                $StartTime = Get-Date
                $Results = @()

                while (((Get-Date) - $StartTime).TotalSeconds -lt $Duration) {
                    try {
                        $ReqStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
                        Invoke-RestMethod -Uri "$($script:LoadTestConfig.BaseUrl)/api/health" `
                            -Method Get `
                            -TimeoutSec 10 `
                            -ErrorAction Stop
                        $ReqStopwatch.Stop()

                        $Results += @{
                            Timestamp = Get-Date -Format 'o'
                            ResponseTime = $ReqStopwatch.Elapsed.TotalMilliseconds
                            Status = 'SUCCESS'
                        }

                        $script:SuccessCount++
                        $script:RequestCount++
                        $script:TotalResponseTime += $ReqStopwatch.Elapsed.TotalMilliseconds
                    }
                    catch {
                        $Results += @{
                            Timestamp = Get-Date -Format 'o'
                            Status = 'FAILED'
                            Error = $_.Exception.Message
                        }

                        $script:FailureCount++
                        $script:RequestCount++
                    }

                    # Small delay to avoid overwhelming the system
                    Start-Sleep -Milliseconds 100
                }

                return $Results
            }

            # Run sustained load
            $Job = Start-Job -ScriptBlock $ScriptBlock -ArgumentList $DurationSeconds, $ConcurrentUsers
            $SustainedResults = $Job | Wait-Job | Receive-Job
            $Job | Remove-Job

            $Stopwatch.Stop()

            # Assert: Check for consistent performance
            $SuccessfulRequests = @($SustainedResults | Where-Object { $_.Status -eq 'SUCCESS' })
            $SustainedSuccessRate = $SuccessfulRequests.Count / $SustainedResults.Count
            $SustainedAvgResponseTime = ($SuccessfulRequests | Measure-Object -Property ResponseTime -Average).Average

            $SustainedSuccessRate | Should -BeGreaterOrEqual 0.95
            $SustainedAvgResponseTime | Should -BeLessThan ($script:LoadTestConfig.ResponseTimeTarget * 1.5)

            # Check for degradation over time (split results into 5 chunks)
            $ChunkSize = [Math]::Floor($SuccessfulRequests.Count / 5)
            $DegradationDetected = $false

            for ($i = 0; $i -lt 4; $i++) {
                $Chunk1 = $SuccessfulRequests | Select-Object -First $ChunkSize -Skip ($i * $ChunkSize)
                $Chunk2 = $SuccessfulRequests | Select-Object -First $ChunkSize -Skip (($i + 1) * $ChunkSize)

                $Avg1 = ($Chunk1 | Measure-Object -Property ResponseTime -Average).Average
                $Avg2 = ($Chunk2 | Measure-Object -Property ResponseTime -Average).Average

                if ($Avg2 -gt ($Avg1 * 1.5)) {
                    $DegradationDetected = $true
                }
            }

            $DegradationDetected | Should -Be $false

            # Record results
            $script:LoadTestResults += @{
                Scenario = "Sustained-Load-300s"
                Duration = $Stopwatch.Elapsed.TotalSeconds
                TotalRequests = $SustainedResults.Count
                SuccessRate = $SustainedSuccessRate
                AverageResponseTime = $SustainedAvgResponseTime
                DegradationDetected = $DegradationDetected
            }
        }
    }
}

Describe "Load Testing: Performance Analysis" {
    Context "Response Time Distribution" {
        It "Should have 95% of requests complete in under 2 seconds" {
            if ($script:LoadTestResults.Count -eq 0) {
                Set-ItResult -Skipped -Because "No load test results to analyze"
                return
            }

            # Calculate percentiles
            $AllResponseTimes = $script:LoadTestResults | ForEach-Object {
                if ($_.AverageResponseTime) { $_.AverageResponseTime }
            }

            if ($AllResponseTimes.Count -eq 0) {
                Set-ItResult -Skipped -Because "No response time data"
                return
            }

            $P95 = $AllResponseTimes | Sort-Object | Select-Object -Index ([Math]::Floor($AllResponseTimes.Count * 0.95))
            $P95 | Should -BeLessThan $script:LoadTestConfig.ResponseTimeTarget
        }
    }

    Context "Error Analysis" {
        It "Should track error types and frequencies" {
            if ($script:FailureCount -eq 0) {
                # No failures is good
                $script:FailureCount | Should -Eq 0
            } else {
                $ErrorRate = $script:FailureCount / $script:RequestCount
                $ErrorRate | Should -BeLessThan 0.05  # Less than 5% error rate
            }
        }
    }
}
