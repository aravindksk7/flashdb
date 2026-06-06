#Requires -Version 7.0
<#
.SYNOPSIS
    Verify Docker image sizes meet production targets

.DESCRIPTION
    Builds and inspects Docker images to verify they meet size requirements
    - API image: < 300MB
    - GUI image: < 80MB
    - PowerShell image: < 500MB (baseline for operational tools)

.EXAMPLE
    .\verify-images.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = "Continue"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath

function Format-Size {
    param([long]$Size)

    if ($Size -gt 1GB) {
        return "{0:F2} GB" -f ($Size / 1GB)
    }
    elseif ($Size -gt 1MB) {
        return "{0:F2} MB" -f ($Size / 1MB)
    }
    else {
        return "{0:F2} KB" -f ($Size / 1KB)
    }
}

function Verify-ImageSize {
    param(
        [string]$ImageName,
        [string]$Dockerfile,
        [long]$MaxSize,
        [string]$Tag = "test"
    )

    Write-Host "`n================================================" -ForegroundColor Cyan
    Write-Host "Verifying: $ImageName" -ForegroundColor Cyan
    Write-Host "================================================" -ForegroundColor Cyan

    # Build image
    Write-Host "Building image... " -NoNewline
    Push-Location $projectRoot

    try {
        $buildOutput = & docker build -f $Dockerfile -t "${ImageName}:${Tag}" . 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "FAILED" -ForegroundColor Red
            Write-Host $buildOutput
            return $false
        }
        Write-Host "OK" -ForegroundColor Green
    }
    catch {
        Write-Host "ERROR: $_" -ForegroundColor Red
        return $false
    }
    finally {
        Pop-Location
    }

    # Inspect image
    Write-Host "Inspecting image... " -NoNewline

    try {
        $inspect = & docker image inspect "${ImageName}:${Tag}" 2>&1 | ConvertFrom-Json
        $imageSize = $inspect[0].Size
        $imageId = $inspect[0].Id.Substring(0, 12)

        Write-Host "OK" -ForegroundColor Green
    }
    catch {
        Write-Host "ERROR: $_" -ForegroundColor Red
        return $false
    }

    # Display results
    $formattedSize = Format-Size -Size $imageSize
    $formattedMax = Format-Size -Size $MaxSize
    $sizePercentage = [math]::Round(($imageSize / $MaxSize) * 100, 1)

    Write-Host "Image ID: $imageId"
    Write-Host "Image Size: $formattedSize (Target: < $formattedMax)"
    Write-Host "Size % of Target: $sizePercentage%"

    # Verify against target
    if ($imageSize -le $MaxSize) {
        Write-Host "Status: PASS" -ForegroundColor Green
        Write-Host "✓ Image is within size requirements"

        # Show layers
        Write-Host "`nImage Layers:"
        $config = $inspect[0].Config

        if ($config.Cmd) {
            Write-Host "  CMD: $($config.Cmd -join ' ')"
        }
        if ($config.Entrypoint) {
            Write-Host "  ENTRYPOINT: $($config.Entrypoint -join ' ')"
        }
        if ($config.Env) {
            Write-Host "  Environment Variables: $($config.Env.Count)"
        }

        return $true
    }
    else {
        Write-Host "Status: FAIL" -ForegroundColor Red
        Write-Host "✗ Image exceeds size limit by $(Format-Size -Size ($imageSize - $MaxSize))"
        Write-Host "`nOptimization suggestions:"
        Write-Host "  1. Use alpine base image"
        Write-Host "  2. Remove unnecessary build dependencies"
        Write-Host "  3. Use multi-stage builds (already implemented)"
        Write-Host "  4. Minimize layer count"
        Write-Host "  5. Remove npm cache: npm ci --omit=dev"

        return $false
    }
}

function Get-BuildDetails {
    param(
        [string]$ImageName,
        [string]$Tag = "test"
    )

    Write-Host "`nImage Details for: ${ImageName}:${Tag}" -ForegroundColor Cyan

    try {
        $history = & docker history "${ImageName}:${Tag}" --no-trunc --quiet
        Write-Host "Layer History:"
        $lines = @($history)
        for ($i = 0; $i -lt [Math]::Min($lines.Count, 10); $i++) {
            Write-Host "  Layer $($i + 1): $($lines[$i].Substring(0, 12))"
        }
    }
    catch {
        Write-Host "Could not retrieve layer history" -ForegroundColor Yellow
    }
}

# Main verification
Write-Host "
╔════════════════════════════════════════════════════════════╗
║       FlashDB Docker Image Size Verification               ║
╚════════════════════════════════════════════════════════════╝
" -ForegroundColor Cyan

$results = @()

# Verify API image (target: < 300MB)
$results += @{
    Name = "API"
    Result = (Verify-ImageSize -ImageName "flashdb-api" -Dockerfile "Dockerfile.api.prod" -MaxSize (300MB))
}
Get-BuildDetails -ImageName "flashdb-api"

# Verify GUI image (target: < 80MB)
$results += @{
    Name = "GUI"
    Result = (Verify-ImageSize -ImageName "flashdb-gui" -Dockerfile "Dockerfile.gui.prod" -MaxSize (80MB))
}
Get-BuildDetails -ImageName "flashdb-gui"

# Verify PowerShell image (target: < 500MB)
$results += @{
    Name = "PowerShell"
    Result = (Verify-ImageSize -ImageName "flashdb-powershell" -Dockerfile "Dockerfile.powershell" -MaxSize (500MB))
}
Get-BuildDetails -ImageName "flashdb-powershell"

# Summary
Write-Host "`
╔════════════════════════════════════════════════════════════╗
║                    Verification Summary                    ║
╚════════════════════════════════════════════════════════════╝
" -ForegroundColor Cyan

$allPassed = $true
foreach ($result in $results) {
    $status = if ($result.Result) { "PASS" } else { "FAIL" }
    $color = if ($result.Result) { "Green" } else { "Red" }
    Write-Host "$($result.Name): $status" -ForegroundColor $color
    if (-not $result.Result) {
        $allPassed = $false
    }
}

Write-Host "`nOverall Result: " -NoNewline
if ($allPassed) {
    Write-Host "ALL TESTS PASSED ✓" -ForegroundColor Green
    Write-Host "`nImages are ready for production deployment."

    # Show cleanup commands
    Write-Host "`nCleanup test images (optional):"
    Write-Host "  docker rmi flashdb-api:test"
    Write-Host "  docker rmi flashdb-gui:test"
    Write-Host "  docker rmi flashdb-powershell:test"

    exit 0
}
else {
    Write-Host "SOME TESTS FAILED ✗" -ForegroundColor Red
    Write-Host "`nPlease address the above issues before production deployment."
    exit 1
}
