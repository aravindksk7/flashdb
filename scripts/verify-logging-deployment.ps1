<#
.SYNOPSIS
Verify FlashDB Logging & Monitoring Deployment

.DESCRIPTION
Checks that all required logging and monitoring files are in place
and properly configured.

.EXAMPLE
.\verify-logging-deployment.ps1
#>

$ErrorActionPreference = 'Continue'
$SuccessCount = 0
$WarningCount = 0
$ErrorCount = 0

function Write-Status {
    param(
        [string]$Status,
        [string]$Message,
        [switch]$NoNewline
    )

    $colors = @{
        '✓' = 'Green'
        '⚠' = 'Yellow'
        '✗' = 'Red'
    }

    $color = $colors[$Status]
    if ($NoNewline) {
        Write-Host "$Status " -ForegroundColor $color -NoNewline
        Write-Host $Message
    } else {
        Write-Host "$Status $Message" -ForegroundColor $color
    }
}

function Check-File {
    param(
        [string]$Path,
        [string]$Description
    )

    if (Test-Path $Path) {
        Write-Status '✓' "$Description - $Path"
        $script:SuccessCount++
        return $true
    } else {
        Write-Status '✗' "$Description - NOT FOUND: $Path"
        $script:ErrorCount++
        return $false
    }
}

function Check-FileContent {
    param(
        [string]$Path,
        [string]$Description,
        [string]$RequiredText
    )

    if (-not (Test-Path $Path)) {
        Write-Status '✗' "$Description - FILE NOT FOUND: $Path"
        $script:ErrorCount++
        return $false
    }

    $content = Get-Content $Path -Raw
    if ($content -match $RequiredText) {
        Write-Status '✓' "$Description - Content verified"
        $script:SuccessCount++
        return $true
    } else {
        Write-Status '⚠' "$Description - Content may be incomplete"
        $script:WarningCount++
        return $false
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "FlashDB Logging & Monitoring Deployment" -ForegroundColor Cyan
Write-Host "Verification Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check API Middleware Files
Write-Host "Checking API Middleware..." -ForegroundColor White
Check-File 'c:\flashdb\src\api\src\middleware\logging.ts' 'Logging Middleware' | Out-Null
Check-File 'c:\flashdb\src\api\src\middleware\healthcheck.ts' 'Health Check Middleware' | Out-Null

# Check PowerShell Logging Module
Write-Host "`nChecking PowerShell Logging Module..." -ForegroundColor White
Check-File 'c:\flashdb\src\FlashDB\Core\Logging.ps1' 'Logging Module' | Out-Null

# Check Monitoring Configuration
Write-Host "`nChecking Monitoring Configuration..." -ForegroundColor White
Check-File 'c:\flashdb\monitoring\prometheus-config.yml' 'Prometheus Config' | Out-Null
Check-File 'c:\flashdb\monitoring\alerts.yml' 'Alert Rules' | Out-Null

# Check Documentation
Write-Host "`nChecking Documentation..." -ForegroundColor White
Check-File 'c:\flashdb\docs\OPERATIONS_RUNBOOK.md' 'Operations Runbook' | Out-Null
Check-File 'c:\flashdb\docs\MONITORING_GUIDE.md' 'Monitoring Guide' | Out-Null
Check-File 'c:\flashdb\docs\DEPLOYMENT_GUIDE.md' 'Deployment Guide' | Out-Null
Check-File 'c:\flashdb\docs\LOGGING_MONITORING_README.md' 'Logging & Monitoring README' | Out-Null

# Check API Integration
Write-Host "`nChecking API Integration..." -ForegroundColor White
Check-FileContent 'c:\flashdb\src\api\src\index.ts' 'API includes logging middleware' 'structuredLoggingMiddleware' | Out-Null
Check-FileContent 'c:\flashdb\src\api\src\index.ts' 'API includes health checks' 'healthCheckEndpoint' | Out-Null
Check-FileContent 'c:\flashdb\src\api\src\index.ts' 'API includes /live endpoint' "'/live'" | Out-Null
Check-FileContent 'c:\flashdb\src\api\src\index.ts' 'API includes /ready endpoint' "'/ready'" | Out-Null
Check-FileContent 'c:\flashdb\src\api\src\index.ts' 'API includes /health endpoint' "'/health'" | Out-Null
Check-FileContent 'c:\flashdb\src\api\src\index.ts' 'API includes /metrics endpoint' "'/metrics'" | Out-Null

# Check Package Dependencies
Write-Host "`nChecking Package Dependencies..." -ForegroundColor White
Check-FileContent 'c:\flashdb\src\api\package.json' 'UUID dependency' '"uuid"' | Out-Null

# Check Log Directory
Write-Host "`nChecking Log Directory Setup..." -ForegroundColor White
if (Test-Path 'c:\flashdb\logs') {
    Write-Status '✓' 'Log directory exists - c:\flashdb\logs'
    $script:SuccessCount++
} else {
    Write-Status '⚠' 'Log directory does not exist - will be created on first run'
    $script:WarningCount++
}

# Check Data Directory
Write-Host "`nChecking Data Directory Setup..." -ForegroundColor White
if (Test-Path 'c:\flashdb-data') {
    Write-Status '✓' 'Data directory exists - c:\flashdb-data'
    $script:SuccessCount++
} else {
    Write-Status '⚠' 'Data directory does not exist - create with: New-Item -ItemType Directory -Path c:\flashdb-data -Force'
    $script:WarningCount++
}

# Check TypeScript Configuration
Write-Host "`nChecking TypeScript Configuration..." -ForegroundColor White
Check-FileContent 'c:\flashdb\src\api\tsconfig.json' 'TypeScript strict mode' '"strict": true' | Out-Null

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Verification Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Status '✓' "$SuccessCount checks passed" -NoNewline
Write-Host ""

if ($WarningCount -gt 0) {
    Write-Status '⚠' "$WarningCount warnings" -NoNewline
    Write-Host ""
}

if ($ErrorCount -gt 0) {
    Write-Status '✗' "$ErrorCount checks failed" -NoNewline
    Write-Host ""
}

Write-Host ""

# Next Steps
if ($ErrorCount -eq 0) {
    Write-Host "Next Steps:" -ForegroundColor Green
    Write-Host "1. Install dependencies:"
    Write-Host "   cd c:\flashdb\src\api && npm install"
    Write-Host ""
    Write-Host "2. Build TypeScript:"
    Write-Host "   npm run build"
    Write-Host ""
    Write-Host "3. Initialize logging:"
    Write-Host "   Import-Module 'C:\flashdb\src\FlashDB\Core\Logging.ps1'"
    Write-Host "   Initialize-FlashdbLogging"
    Write-Host ""
    Write-Host "4. Start API:"
    Write-Host "   npm start"
    Write-Host ""
    Write-Host "5. Test health endpoints:"
    Write-Host "   curl http://localhost:3001/live"
    Write-Host "   curl http://localhost:3001/ready"
    Write-Host "   curl http://localhost:3001/health"
    Write-Host ""
    Write-Host "6. View logs:"
    Write-Host "   Get-FlashdbLogs -Count 20"
} else {
    Write-Host "Please resolve the above errors before proceeding." -ForegroundColor Red
}

Write-Host ""

exit $ErrorCount
