#Requires -Version 7.0
<#
.SYNOPSIS
    FlashDB Production Docker Deployment Script

.DESCRIPTION
    Orchestrates building, deploying, and verifying FlashDB production Docker stack

.PARAMETER Action
    Action to perform: build, deploy, stop, restart, logs, status

.PARAMETER Environment
    Environment file path (default: .env.prod)

.PARAMETER Detached
    Run services in detached mode (default: true)

.EXAMPLE
    .\deploy-prod.ps1 -Action build
    .\deploy-prod.ps1 -Action deploy
    .\deploy-prod.ps1 -Action logs -Service api-1
#>

[CmdletBinding()]
param(
    [ValidateSet("build", "deploy", "stop", "restart", "logs", "status", "verify", "cleanup")]
    [string]$Action = "deploy",

    [string]$Environment = ".env.prod",
    [bool]$Detached = $true,
    [string]$Service = "",
    [int]$LogLines = 50
)

$ErrorActionPreference = "Stop"
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptPath

# Colors for output
$Colors = @{
    Success = "Green"
    Error = "Red"
    Warning = "Yellow"
    Info = "Cyan"
}

function Write-FormattedOutput {
    param(
        [string]$Message,
        [ValidateSet("Success", "Error", "Warning", "Info")]
        [string]$Level = "Info"
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] " -ForegroundColor Gray -NoNewline
    Write-Host $Message -ForegroundColor $Colors[$Level]
}

function Invoke-DockerCommand {
    param(
        [string[]]$Arguments,
        [bool]$ShowOutput = $false
    )

    try {
        if ($ShowOutput) {
            & docker @Arguments
        }
        else {
            & docker @Arguments *>$null
        }

        if ($LASTEXITCODE -ne 0) {
            Write-FormattedOutput "Docker command failed with exit code $LASTEXITCODE" -Level "Error"
            return $false
        }
        return $true
    }
    catch {
        Write-FormattedOutput "Error executing docker command: $_" -Level "Error"
        return $false
    }
}

function Check-Prerequisites {
    Write-FormattedOutput "Checking prerequisites..." -Level "Info"

    # Check Docker
    try {
        $dockerVersion = & docker --version
        Write-FormattedOutput "Docker: $dockerVersion" -Level "Success"
    }
    catch {
        Write-FormattedOutput "Docker not found. Please install Docker." -Level "Error"
        return $false
    }

    # Check Docker Compose
    try {
        $composeVersion = & docker compose version
        Write-FormattedOutput "Docker Compose: $composeVersion" -Level "Success"
    }
    catch {
        Write-FormattedOutput "Docker Compose not found. Please install Docker Compose." -Level "Error"
        return $false
    }

    # Check environment file
    if (-not (Test-Path "$projectRoot\$Environment")) {
        Write-FormattedOutput "Environment file not found: $Environment" -Level "Warning"
        Write-FormattedOutput "Creating from template..." -Level "Info"

        if (Test-Path "$projectRoot\.env.prod.example") {
            Copy-Item "$projectRoot\.env.prod.example" "$projectRoot\$Environment"
            Write-FormattedOutput "Environment file created. Please edit: $Environment" -Level "Warning"
        }
        else {
            Write-FormattedOutput "Template file not found" -Level "Error"
            return $false
        }
    }

    # Check required Dockerfiles
    $requiredFiles = @(
        "Dockerfile.api.prod",
        "Dockerfile.gui.prod",
        "Dockerfile.powershell",
        "docker-compose.prod.yml"
    )

    foreach ($file in $requiredFiles) {
        if (-not (Test-Path "$projectRoot\$file")) {
            Write-FormattedOutput "Required file not found: $file" -Level "Error"
            return $false
        }
    }

    Write-FormattedOutput "Prerequisites check passed" -Level "Success"
    return $true
}

function Build-Images {
    Write-FormattedOutput "Building Docker images..." -Level "Info"

    Push-Location $projectRoot

    try {
        Write-FormattedOutput "Building API image (Dockerfile.api.prod)..." -Level "Info"
        if (-not (Invoke-DockerCommand @("build", "-f", "Dockerfile.api.prod", "-t", "flashdb-api:prod", ".") -ShowOutput $true)) {
            return $false
        }
        Write-FormattedOutput "API image built successfully" -Level "Success"

        Write-FormattedOutput "Building GUI image (Dockerfile.gui.prod)..." -Level "Info"
        if (-not (Invoke-DockerCommand @("build", "-f", "Dockerfile.gui.prod", "-t", "flashdb-gui:prod", ".") -ShowOutput $true)) {
            return $false
        }
        Write-FormattedOutput "GUI image built successfully" -Level "Success"

        Write-FormattedOutput "Building PowerShell image (Dockerfile.powershell)..." -Level "Info"
        if (-not (Invoke-DockerCommand @("build", "-f", "Dockerfile.powershell", "-t", "flashdb-powershell:prod", ".") -ShowOutput $true)) {
            return $false
        }
        Write-FormattedOutput "PowerShell image built successfully" -Level "Success"
    }
    finally {
        Pop-Location
    }

    return $true
}

function Deploy-Stack {
    Write-FormattedOutput "Deploying FlashDB production stack..." -Level "Info"

    Push-Location $projectRoot

    try {
        # Load environment
        Write-FormattedOutput "Loading environment from $Environment..." -Level "Info"
        $env:COMPOSE_ENV_FILE = $Environment

        # Build services
        Write-FormattedOutput "Building services..." -Level "Info"
        if (-not (Invoke-DockerCommand @("compose", "-f", "docker-compose.prod.yml", "build") -ShowOutput $true)) {
            Write-FormattedOutput "Build failed" -Level "Error"
            return $false
        }

        # Start services
        Write-FormattedOutput "Starting services..." -Level "Info"
        $composeArgs = @("compose", "-f", "docker-compose.prod.yml", "up", "-d")

        if (-not (Invoke-DockerCommand $composeArgs -ShowOutput $true)) {
            Write-FormattedOutput "Deployment failed" -Level "Error"
            return $false
        }

        Write-FormattedOutput "Services deployed successfully" -Level "Success"

        # Wait for services to stabilize
        Write-FormattedOutput "Waiting for services to become healthy..." -Level "Info"
        Start-Sleep -Seconds 10

        return $true
    }
    finally {
        Pop-Location
    }
}

function Get-StackStatus {
    Write-FormattedOutput "===== FlashDB Production Stack Status =====" -Level "Info"

    Push-Location $projectRoot

    try {
        # Check containers
        Write-FormattedOutput "`nContainer Status:" -Level "Info"
        & docker compose -f docker-compose.prod.yml ps

        # Check images
        Write-FormattedOutput "`nImage Information:" -Level "Info"
        $images = @("flashdb-api:prod", "flashdb-gui:prod", "flashdb-powershell:prod")

        foreach ($image in $images) {
            $inspect = & docker image inspect $image 2>$null
            if ($inspect) {
                $imageData = $inspect | ConvertFrom-Json
                $size = [math]::Round($imageData[0].Size / 1MB, 2)
                Write-FormattedOutput "$image - Size: ${size}MB" -Level "Success"
            }
        }

        # Health checks
        Write-FormattedOutput "`nHealth Check Summary:" -Level "Info"
        $containers = @(
            "flashdb-sql-prod",
            "flashdb-api-1", "flashdb-api-2", "flashdb-api-3", "flashdb-api-4", "flashdb-api-5",
            "flashdb-gui-prod",
            "flashdb-reverse-proxy",
            "flashdb-backup-service"
        )

        foreach ($container in $containers) {
            $health = & docker inspect -f "{{.State.Health.Status}}" $container 2>$null
            if ($health) {
                $color = if ($health -eq "healthy") { "Success" } else { "Warning" }
                Write-FormattedOutput "$container : $health" -Level $color
            }
        }
    }
    finally {
        Pop-Location
    }
}

function Show-Logs {
    param(
        [string]$ServiceName,
        [int]$Lines
    )

    Write-FormattedOutput "Showing logs..." -Level "Info"

    Push-Location $projectRoot

    try {
        if ($ServiceName) {
            Write-FormattedOutput "Logs for service: $ServiceName (last $Lines lines)" -Level "Info"
            & docker compose -f docker-compose.prod.yml logs --tail=$Lines -f $ServiceName
        }
        else {
            Write-FormattedOutput "Logs for all services (last $Lines lines)" -Level "Info"
            & docker compose -f docker-compose.prod.yml logs --tail=$Lines -f
        }
    }
    finally {
        Pop-Location
    }
}

function Stop-Stack {
    Write-FormattedOutput "Stopping FlashDB production stack..." -Level "Warning"

    Push-Location $projectRoot

    try {
        & docker compose -f docker-compose.prod.yml down
        Write-FormattedOutput "Stack stopped successfully" -Level "Success"
        return $true
    }
    finally {
        Pop-Location
    }
}

function Restart-Stack {
    Write-FormattedOutput "Restarting FlashDB production stack..." -Level "Info"

    if (-not (Stop-Stack)) {
        return $false
    }

    Start-Sleep -Seconds 5

    if (-not (Deploy-Stack)) {
        return $false
    }

    Write-FormattedOutput "Stack restarted successfully" -Level "Success"
    return $true
}

function Verify-Deployment {
    Write-FormattedOutput "Verifying deployment..." -Level "Info"

    Push-Location $projectRoot

    try {
        $allHealthy = $true

        # Check SQL Server
        Write-FormattedOutput "Checking SQL Server..." -Level "Info"
        $sqlHealth = & docker exec flashdb-sql-prod sqlcmd -S localhost -U sa -P (Get-Content $Environment | Select-String "DB_PASSWORD" | ForEach-Object { $_.Line.Split("=")[1] }) -Q "SELECT 1" 2>&1
        if ($sqlHealth -match "1") {
            Write-FormattedOutput "SQL Server: OK" -Level "Success"
        }
        else {
            Write-FormattedOutput "SQL Server: FAILED" -Level "Error"
            $allHealthy = $false
        }

        # Check API health
        Write-FormattedOutput "Checking API health..." -Level "Info"
        for ($i = 1; $i -le 5; $i++) {
            $health = & curl -s "http://localhost:8080/api/health" 2>&1
            if ($health) {
                Write-FormattedOutput "API-$i: OK" -Level "Success"
            }
            else {
                Write-FormattedOutput "API-$i: FAILED" -Level "Error"
                $allHealthy = $false
            }
        }

        # Check GUI
        Write-FormattedOutput "Checking GUI..." -Level "Info"
        $gui = & curl -s http://localhost/ 2>&1
        if ($gui.Length -gt 0) {
            Write-FormattedOutput "GUI: OK" -Level "Success"
        }
        else {
            Write-FormattedOutput "GUI: FAILED" -Level "Error"
            $allHealthy = $false
        }

        # Check reverse proxy
        Write-FormattedOutput "Checking reverse proxy..." -Level "Info"
        $proxy = & curl -s http://localhost/health 2>&1
        if ($proxy.Length -gt 0) {
            Write-FormattedOutput "Reverse Proxy: OK" -Level "Success"
        }
        else {
            Write-FormattedOutput "Reverse Proxy: FAILED" -Level "Error"
            $allHealthy = $false
        }

        if ($allHealthy) {
            Write-FormattedOutput "Deployment verification: PASSED" -Level "Success"
            return $true
        }
        else {
            Write-FormattedOutput "Deployment verification: FAILED" -Level "Error"
            return $false
        }
    }
    finally {
        Pop-Location
    }
}

function Cleanup {
    Write-FormattedOutput "Cleaning up resources..." -Level "Warning"

    Push-Location $projectRoot

    try {
        Write-FormattedOutput "Removing containers, networks, and volumes..." -Level "Info"
        & docker compose -f docker-compose.prod.yml down -v

        Write-FormattedOutput "Cleanup complete" -Level "Success"
        return $true
    }
    finally {
        Pop-Location
    }
}

# Main execution
Write-FormattedOutput "FlashDB Production Deployment Script" -Level "Info"
Write-FormattedOutput "Action: $Action" -Level "Info"

if (-not (Check-Prerequisites)) {
    Write-FormattedOutput "Prerequisites check failed. Exiting." -Level "Error"
    exit 1
}

switch ($Action) {
    "build" {
        if (Build-Images) {
            Write-FormattedOutput "Build completed successfully" -Level "Success"
        }
        else {
            Write-FormattedOutput "Build failed" -Level "Error"
            exit 1
        }
    }

    "deploy" {
        if (Deploy-Stack) {
            Start-Sleep -Seconds 5
            Get-StackStatus
            Write-FormattedOutput "Deployment completed successfully" -Level "Success"
        }
        else {
            Write-FormattedOutput "Deployment failed" -Level "Error"
            exit 1
        }
    }

    "stop" {
        if (Stop-Stack) {
            Write-FormattedOutput "Stack stopped" -Level "Success"
        }
        else {
            Write-FormattedOutput "Failed to stop stack" -Level "Error"
            exit 1
        }
    }

    "restart" {
        if (Restart-Stack) {
            Start-Sleep -Seconds 5
            Get-StackStatus
            Write-FormattedOutput "Stack restarted" -Level "Success"
        }
        else {
            Write-FormattedOutput "Failed to restart stack" -Level "Error"
            exit 1
        }
    }

    "logs" {
        Show-Logs -ServiceName $Service -Lines $LogLines
    }

    "status" {
        Get-StackStatus
    }

    "verify" {
        if (Verify-Deployment) {
            Write-FormattedOutput "Verification passed" -Level "Success"
        }
        else {
            Write-FormattedOutput "Verification failed" -Level "Error"
            exit 1
        }
    }

    "cleanup" {
        if (Cleanup) {
            Write-FormattedOutput "Cleanup completed" -Level "Success"
        }
        else {
            Write-FormattedOutput "Cleanup failed" -Level "Error"
            exit 1
        }
    }

    default {
        Write-FormattedOutput "Unknown action: $Action" -Level "Error"
        exit 1
    }
}

Write-FormattedOutput "Script completed successfully" -Level "Success"
