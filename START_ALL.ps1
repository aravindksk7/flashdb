# FlashDB Complete Startup Script
# Starts SQL Server, API, and GUI in sequence

param(
    [switch]$SkipDbInit = $false
)

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║         FlashDB Complete Startup                          ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# Step 1: Check SQL Server
Write-Host "`n[1/3] Checking SQL Server..." -ForegroundColor Yellow
try {
    $test = Test-NetConnection -ComputerName localhost -Port 1433 -WarningAction SilentlyContinue
    if ($test.TcpTestSucceeded) {
        Write-Host "✅ SQL Server is READY on port 1433" -ForegroundColor Green
    } else {
        Write-Host "⚠️  SQL Server is not responding yet" -ForegroundColor Yellow
        Write-Host "   Run this first: docker run -d --name flashdb-sql -e ACCEPT_EULA=Y -e SA_PASSWORD=FlashDB@Password123 -p 1433:1433 mcr.microsoft.com/mssql/server:2022-latest" -ForegroundColor Cyan
        exit 1
    }
} catch {
    Write-Host "❌ Error checking SQL Server" -ForegroundColor Red
    exit 1
}

# Step 2: Initialize Test Database (optional)
if (-not $SkipDbInit) {
    Write-Host "`n[2/3] Initializing Test Database..." -ForegroundColor Yellow
    try {
        sqlcmd -S localhost -U sa -P FlashDB@Password123 -i ".\docker\init-testdb.sql" 2>&1 | Select-String -Pattern "Test database|Total|successfully" | ForEach-Object { Write-Host "       $_" -ForegroundColor Green }
        Write-Host "✅ Test Database initialized" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Database initialization may have failed or already initialized" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n[2/3] Skipping database initialization" -ForegroundColor Gray
}

# Step 3: Install API dependencies
Write-Host "`n[3/3] Installing dependencies..." -ForegroundColor Yellow
Write-Host "       Installing API packages..." -ForegroundColor Gray
Set-Location "c:\flashdb\src\api"
$apiOutput = npm install 2>&1 | Select-String -Pattern "added|packages" | Select-Object -Last 1
if ($apiOutput) {
    Write-Host "       $apiOutput" -ForegroundColor Green
}

Write-Host "       Installing GUI packages..." -ForegroundColor Gray
Set-Location "c:\flashdb\src\gui"
$guiOutput = npm install 2>&1 | Select-String -Pattern "added|packages" | Select-Object -Last 1
if ($guiOutput) {
    Write-Host "       $guiOutput" -ForegroundColor Green
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  ✅ Setup Complete! Next: Start Services                  ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green

Write-Host "`n📋 NEXT STEPS - Open 2 new PowerShell terminals and run:" -ForegroundColor Cyan

Write-Host ""
Write-Host "┌─ Terminal A: API Server ────────────────────────────────┐" -ForegroundColor Yellow
Write-Host "│  cd c:\flashdb\src\api" -ForegroundColor White
Write-Host "│  npm run dev" -ForegroundColor White
Write-Host "│" -ForegroundColor Yellow
Write-Host "│  Expected: 'FlashDB API running on http://localhost:3001'" -ForegroundColor Gray
Write-Host "└─────────────────────────────────────────────────────────┘" -ForegroundColor Yellow

Write-Host ""
Write-Host "┌─ Terminal B: GUI Dashboard ─────────────────────────────┐" -ForegroundColor Yellow
Write-Host "│  cd c:\flashdb\src\gui" -ForegroundColor White
Write-Host "│  npm run dev" -ForegroundColor White
Write-Host "│" -ForegroundColor Yellow
Write-Host "│  Expected: 'VITE v5.0.8 ready in XXX ms'" -ForegroundColor Gray
Write-Host "└─────────────────────────────────────────────────────────┘" -ForegroundColor Yellow

Write-Host ""
Write-Host "📱 Then: Open browser to http://localhost:3000" -ForegroundColor Green
Write-Host ""
