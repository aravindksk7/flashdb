# FlashDB Restore Debug Script
# This script tests the restore workflow step by step

param(
    [string]$CloneId = "TestDB_Clone_1",
    [string]$Instance = "LOCALHOST\SQLEXPRESS"
)

$ErrorActionPreference = 'Continue'

Write-Host "========== FlashDB Restore Debug Test ==========" -ForegroundColor Cyan
Write-Host "Clone: $CloneId" -ForegroundColor Yellow
Write-Host "Instance: $Instance" -ForegroundColor Yellow
Write-Host ""

# Load the FlashDB module
Write-Host "[1/6] Loading FlashDB module..." -ForegroundColor Green
try {
    . "C:\flashdb\src\FlashDB\FlashDB.psm1" -ErrorAction SilentlyContinue
    Write-Host "✓ Module loaded" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to load module: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "[2/6] Getting clone metadata..." -ForegroundColor Green
try {
    $clone = Get-FlashdbClone -CloneId $CloneId -IncludeMetadata
    if ($clone) {
        Write-Host "✓ Clone found" -ForegroundColor Green
        Write-Host "  - Name: $($clone.Name)" -ForegroundColor Cyan
        Write-Host "  - Status: $($clone.Status)" -ForegroundColor Cyan
        Write-Host "  - Database: $($clone.Metadata.database.name)" -ForegroundColor Cyan
        Write-Host "  - Instance: $($clone.Metadata.database.instanceName)" -ForegroundColor Cyan
        Write-Host "  - VHDX: $($clone.Metadata.clone.vhdxPath)" -ForegroundColor Cyan
        Write-Host "  - Checkpoints: $($clone.Metadata.checkpoints.Count)" -ForegroundColor Cyan
    } else {
        Write-Host "✗ Clone not found" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "✗ Error: $_" -ForegroundColor Red
}

Write-Host ""
Write-Host "[3/6] Checking checkpoints..." -ForegroundColor Green
if ($clone.Metadata.checkpoints.Count -gt 0) {
    Write-Host "✓ Found $($clone.Metadata.checkpoints.Count) checkpoint(s)" -ForegroundColor Green
    $clone.Metadata.checkpoints | ForEach-Object {
        Write-Host "  - $($_.checkpointId): $($_.name) (created: $($_.createdAt))" -ForegroundColor Cyan
    }
} else {
    Write-Host "✗ No checkpoints found - create one first!" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[4/6] Checking VHDX files..." -ForegroundColor Green
$vhdxPath = $clone.Metadata.clone.vhdxPath
if (Test-Path $vhdxPath) {
    $vhdxInfo = Get-VHD -Path $vhdxPath -ErrorAction SilentlyContinue
    if ($vhdxInfo) {
        Write-Host "✓ Main VHDX exists" -ForegroundColor Green
        Write-Host "  - Path: $vhdxPath" -ForegroundColor Cyan
        Write-Host "  - Type: $($vhdxInfo.VhdType)" -ForegroundColor Cyan
        Write-Host "  - Size: $([Math]::Round($vhdxInfo.Size / 1GB, 2)) GB" -ForegroundColor Cyan
        if ($vhdxInfo.ParentPath) {
            Write-Host "  - Parent: $($vhdxInfo.ParentPath)" -ForegroundColor Cyan
            Write-Host "  - WARNING: Main VHDX is a differencing disk! Should be standalone." -ForegroundColor Yellow
        }
    } else {
        Write-Host "✗ Cannot read VHDX info" -ForegroundColor Red
    }
} else {
    Write-Host "✗ VHDX file not found: $vhdxPath" -ForegroundColor Red
}

Write-Host ""
Write-Host "[5/6] Checking checkpoint VHDX files..." -ForegroundColor Green
$clone.Metadata.checkpoints | ForEach-Object {
    $cpVhdx = $_.vhdxSnapshotPath
    if (Test-Path $cpVhdx) {
        $cpInfo = Get-VHD -Path $cpVhdx -ErrorAction SilentlyContinue
        Write-Host "✓ Checkpoint $($_.checkpointId) VHDX exists" -ForegroundColor Green
        Write-Host "  - Type: $($cpInfo.VhdType)" -ForegroundColor Cyan
        if ($cpInfo.ParentPath) {
            Write-Host "  - Parent: $($cpInfo.ParentPath)" -ForegroundColor Cyan
        }
    } else {
        Write-Host "✗ Checkpoint VHDX not found: $cpVhdx" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "[6/6] Database attachment status..." -ForegroundColor Green
Write-Host "  - Metadata says: $($clone.Metadata.attachment.status)" -ForegroundColor Cyan
Write-Host "  - To manually check in SQL Server Management Studio:" -ForegroundColor Cyan
Write-Host "    1. Connect to $Instance" -ForegroundColor Gray
Write-Host "    2. Look for database: $($clone.Metadata.database.name)" -ForegroundColor Gray
Write-Host "    3. If 'Suspect' - try: ALTER DATABASE [name] SET ONLINE" -ForegroundColor Gray
Write-Host "    4. If not found - database attachment failed" -ForegroundColor Gray

Write-Host ""
Write-Host "========== Next Steps ==========" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Check the database in SQL Server:" -ForegroundColor Yellow
Write-Host "   - Is it ONLINE?" -ForegroundColor Gray
Write-Host "   - Can you query it?" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Try restore via GUI:" -ForegroundColor Yellow
Write-Host "   - Go to clone detail page" -ForegroundColor Gray
Write-Host "   - Click Restore on a checkpoint" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Check results:" -ForegroundColor Yellow
Write-Host "   - Did database go offline?" -ForegroundColor Gray
Write-Host "   - Error in browser console?" -ForegroundColor Gray
Write-Host "   - Any error in SQL Server?" -ForegroundColor Gray
Write-Host ""
Write-Host "Please collect and share:" -ForegroundColor Yellow
Write-Host "- Output from this script ✓" -ForegroundColor Gray
Write-Host "- Browser console errors (F12)" -ForegroundColor Gray
Write-Host "- SQL Server error log entries" -ForegroundColor Gray
Write-Host "- Application log files (if available)" -ForegroundColor Gray
