# FlashDB - Docker Services Startup
# Runs API and GUI in Docker, connects to local SQL Server

param(
    [switch]$Build = $false,
    [switch]$Down = $false
)

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     FlashDB - Docker API & GUI Services                   ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host ""

if ($Down) {
    Write-Host "🛑 Stopping Docker services..." -ForegroundColor Yellow
    docker-compose -f docker-compose.services.yml down
    Write-Host "✅ Services stopped" -ForegroundColor Green
    exit
}

if ($Build) {
    Write-Host "🔨 Building Docker images..." -ForegroundColor Yellow
    docker-compose -f docker-compose.services.yml build --no-cache
    Write-Host "✅ Build complete" -ForegroundColor Green
    Write-Host ""
}

Write-Host "🚀 Starting Docker services..." -ForegroundColor Green
docker-compose -f docker-compose.services.yml up -d

Write-Host ""
Write-Host "⏳ Waiting 15 seconds for services to start..." -ForegroundColor Yellow

for ($i = 0; $i -lt 15; $i++) {
    Write-Host "." -NoNewline -ForegroundColor Green
    Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host ""

Write-Host "📊 Service Status:" -ForegroundColor Cyan
docker-compose -f docker-compose.services.yml ps

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "✅ Services Running!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green

Write-Host ""
Write-Host "📱 Open in browser:" -ForegroundColor Green
Write-Host "   http://localhost:3000" -ForegroundColor Cyan -BackgroundColor Black
Write-Host ""

Write-Host "📊 API Status:" -ForegroundColor Green
Write-Host "   http://localhost:3001/health" -ForegroundColor Cyan

Write-Host ""
Write-Host "🧹 To stop services:" -ForegroundColor Yellow
Write-Host "   .\START_DOCKER_SERVICES.ps1 -Down" -ForegroundColor White

Write-Host ""
Write-Host "📝 View logs:" -ForegroundColor Yellow
Write-Host "   docker logs flashdb-api" -ForegroundColor White
Write-Host "   docker logs flashdb-gui" -ForegroundColor White

Write-Host ""
