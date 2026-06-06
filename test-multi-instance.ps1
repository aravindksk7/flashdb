#!/usr/bin/env pwsh

<#
.SYNOPSIS
Multi-Instance Cluster Test Script

.DESCRIPTION
Starts 3 instances (1 primary, 2 replicas) and runs comprehensive tests
#>

# Colors
$colors = @{
    'Red'     = "`e[0;31m"
    'Green'   = "`e[0;32m"
    'Yellow'  = "`e[1;33m"
    'Reset'   = "`e[0m"
}

function Write-Colored {
    param([string]$Color, [string]$Message)
    Write-Host "$($colors[$Color])$Message$($colors['Reset'])"
}

function Test-Port {
    param([int]$Port)
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port/live" -ErrorAction SilentlyContinue
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Wait-ForInstances {
    param(
        [int[]]$Ports = @(3001, 3002, 3003),
        [int]$MaxRetries = 60,
        [int]$DelaySeconds = 2
    )

    for ($i = 0; $i -lt $MaxRetries; $i++) {
        $allHealthy = $true
        foreach ($port in $Ports) {
            if (-not (Test-Port $port)) {
                $allHealthy = $false
                break
            }
        }

        if ($allHealthy) {
            Write-Colored 'Green' "All instances are healthy"
            return $true
        }

        Write-Host "Waiting for instances... ($($i + 1)/$MaxRetries)"
        Start-Sleep -Seconds $DelaySeconds
    }

    return $false
}

# Main script
Write-Host "=========================================="
Write-Host "FlashDB Multi-Instance Cluster Tests"
Write-Host "=========================================="

try {
    # Check if Docker is running
    $dockerStatus = docker ps 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Colored 'Red' "Error: Docker is not running"
        exit 1
    }

    Write-Colored 'Yellow' "Step 1: Building API Docker image..."
    docker build -f Dockerfile.api -t flashdb-api:latest .
    if ($LASTEXITCODE -ne 0) {
        Write-Colored 'Red' "Failed to build Docker image"
        exit 1
    }

    Write-Colored 'Yellow' "Step 2: Starting multi-instance cluster..."
    docker-compose -f docker-compose-multi.yml down 2>$null | Out-Null
    docker-compose -f docker-compose-multi.yml up -d
    if ($LASTEXITCODE -ne 0) {
        Write-Colored 'Red' "Failed to start containers"
        exit 1
    }

    Write-Colored 'Yellow' "Step 3: Waiting for instances to be healthy..."
    if (-not (Wait-ForInstances)) {
        Write-Colored 'Red' "Timeout: Instances failed to become healthy"
        docker-compose -f docker-compose-multi.yml logs
        docker-compose -f docker-compose-multi.yml down
        exit 1
    }

    Write-Colored 'Yellow' "Step 4: Testing instance registration..."

    # Test primary instance
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/api/admin/instance" -ErrorAction Stop
        $data = $response.Content | ConvertFrom-Json
        if ($data.success) {
            Write-Colored 'Green' "✓ Primary instance registered"
        } else {
            Write-Colored 'Red' "✗ Primary instance failed"
            exit 1
        }
    } catch {
        Write-Colored 'Red' "✗ Failed to connect to primary instance"
        exit 1
    }

    # Test replica instances
    foreach ($port in @(3002, 3003)) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$port/api/admin/instance" -ErrorAction Stop
            $data = $response.Content | ConvertFrom-Json
            if ($data.success) {
                Write-Colored 'Green' "✓ Replica instance on port $port registered"
            } else {
                Write-Colored 'Red' "✗ Replica instance on port $port failed"
                docker-compose -f docker-compose-multi.yml down
                exit 1
            }
        } catch {
            Write-Colored 'Red' "✗ Failed to connect to replica on port $port"
            docker-compose -f docker-compose-multi.yml down
            exit 1
        }
    }

    Write-Colored 'Yellow' "Step 5: Testing cluster discovery..."

    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/api/admin/instances" -ErrorAction Stop
        $data = $response.Content | ConvertFrom-Json
        $instanceCount = $data.data.instances.Count
        if ($instanceCount -ge 1) {
            Write-Colored 'Green' "✓ Cluster discovery working (found $instanceCount instances)"
        } else {
            Write-Colored 'Red' "✗ Cluster discovery failed"
            exit 1
        }
    } catch {
        Write-Colored 'Red' "✗ Cluster discovery test failed"
        exit 1
    }

    Write-Colored 'Yellow' "Step 6: Testing cluster status endpoint..."

    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001/api/admin/cluster-status" -ErrorAction Stop
        $data = $response.Content | ConvertFrom-Json
        if ($data.data.clusterHealth -eq "healthy") {
            Write-Colored 'Green' "✓ Cluster status is healthy"
        } else {
            Write-Host "⚠ Cluster health status: $($data.data.clusterHealth)"
        }
    } catch {
        Write-Colored 'Red' "✗ Cluster status test failed"
    }

    Write-Colored 'Yellow' "Step 7: Testing state consistency..."

    try {
        $response1 = Invoke-WebRequest -Uri "http://localhost:3001/api/admin/cluster-status" -ErrorAction Stop
        $data1 = $response1.Content | ConvertFrom-Json
        $count1 = $data1.data.activeInstances

        $response2 = Invoke-WebRequest -Uri "http://localhost:3002/api/admin/cluster-status" -ErrorAction Stop
        $data2 = $response2.Content | ConvertFrom-Json
        $count2 = $data2.data.activeInstances

        $response3 = Invoke-WebRequest -Uri "http://localhost:3003/api/admin/cluster-status" -ErrorAction Stop
        $data3 = $response3.Content | ConvertFrom-Json
        $count3 = $data3.data.activeInstances

        if ($count1 -eq $count2 -and $count2 -eq $count3) {
            Write-Colored 'Green' "✓ State consistency verified (all report $count1 active instances)"
        } else {
            Write-Colored 'Red' "✗ State inconsistency detected (counts: $count1, $count2, $count3)"
        }
    } catch {
        Write-Colored 'Red' "✗ State consistency test failed"
    }

    Write-Colored 'Yellow' "Step 8: Testing heartbeat functionality..."

    foreach ($port in @(3001, 3002, 3003)) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:$port/api/admin/heartbeat" -Method POST -ErrorAction Stop
            $data = $response.Content | ConvertFrom-Json
            if ($data.success) {
                Write-Colored 'Green' "✓ Heartbeat successful on port $port"
            } else {
                Write-Colored 'Red' "✗ Heartbeat failed on port $port"
            }
        } catch {
            Write-Colored 'Red' "✗ Heartbeat test failed on port $port"
        }
    }

    Write-Colored 'Yellow' "Step 9: Running Jest tests..."

    Push-Location src/api
    npm test -- --testPathPattern=multiInstance --maxWorkers=1 --no-coverage
    $testResult = $LASTEXITCODE
    Pop-Location

    Write-Colored 'Yellow' "Step 10: Cleanup and shutdown..."

    docker-compose -f docker-compose-multi.yml down

    Write-Host "=========================================="
    if ($testResult -eq 0) {
        Write-Colored 'Green' "✓ All multi-instance tests passed!"
        Write-Host "=========================================="
    } else {
        Write-Colored 'Red' "✗ Some tests failed"
        Write-Host "=========================================="
    }

    exit $testResult

} catch {
    Write-Colored 'Red' "Error: $_"
    exit 1
}
