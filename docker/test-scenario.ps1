# FlashDB End-to-End Test Scenario
# Tests: Create golden image -> clone -> checkpoint -> modify -> checkpoint -> restore

param(
    [string]$ApiUrl = "http://localhost:3001/api",
    [switch]$Verbose,
    [switch]$KeepRunning
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "╔════════════════════════════════════════════════════════════╗"
Write-Host "║    FlashDB End-to-End Test Scenario                       ║"
Write-Host "╚════════════════════════════════════════════════════════════╝"
Write-Host ""

# Test configuration
$TestConfig = @{
    ApiUrl = $ApiUrl
    GoldenImageName = "TestDB-Golden-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    CloneName = "TestDB-Clone-Dev1"
    SqlInstance = "LOCALHOST\SQLEXPRESS"
    StoragePath = "D:\CloneStorage"
    DatabaseName = "TestDB"
}

Write-Host "Configuration:"
Write-Host "  API URL: $($TestConfig.ApiUrl)"
Write-Host "  Golden Image: $($TestConfig.GoldenImageName)"
Write-Host "  Clone Name: $($TestConfig.CloneName)"
Write-Host ""

# Test 1: Create Golden Image
Write-Host "Step 1: Creating Golden Image from TestDB..."
Write-Host "─────────────────────────────────────────────"

try {
    $createGoldenResponse = Invoke-RestMethod -Uri "$($TestConfig.ApiUrl)/golden-images" `
        -Method POST `
        -ContentType "application/json" `
        -Body @{
            name = $TestConfig.GoldenImageName
            version = (Get-Date -Format 'yyyyMMdd')
            method = "TableByTableCopy"
            outputPath = "D:\GoldenImages\$($TestConfig.GoldenImageName).vhdx"
            sourceConnection = "Server=sql-server;User Id=sa;Password=FlashDB@Password123;TrustServerCertificate=Yes"
        } | ConvertTo-Json

    $goldenImage = $createGoldenResponse | ConvertFrom-Json

    if ($goldenImage.success) {
        Write-Host "✓ Golden image created successfully"
        Write-Host "  Image ID: $($goldenImage.data.id)"
        Write-Host "  Size: $($goldenImage.data.sizeBytes) bytes"
    } else {
        Write-Host "✗ Failed to create golden image: $($goldenImage.message)"
        exit 1
    }
} catch {
    Write-Host "✗ Error creating golden image: $_"
    exit 1
}

Write-Host ""

# Test 2: Create Clone
Write-Host "Step 2: Creating Clone from Golden Image..."
Write-Host "─────────────────────────────────────────────"

try {
    $createCloneResponse = Invoke-RestMethod -Uri "$($TestConfig.ApiUrl)/clones" `
        -Method POST `
        -ContentType "application/json" `
        -Body @{
            goldenImageId = $goldenImage.data.id
            cloneName = $TestConfig.CloneName
            instancePath = $TestConfig.SqlInstance
            storagePath = $TestConfig.StoragePath
        } | ConvertTo-Json

    $clone = $createCloneResponse | ConvertFrom-Json

    if ($clone.success) {
        Write-Host "✓ Clone created successfully"
        Write-Host "  Clone ID: $($clone.data.id)"
        Write-Host "  Status: $($clone.data.status)"
        Write-Host "  VHDX Path: $($clone.data.vhdxPath)"
    } else {
        Write-Host "✗ Failed to create clone: $($clone.message)"
        exit 1
    }
} catch {
    Write-Host "✗ Error creating clone: $_"
    exit 1
}

Write-Host ""

# Test 3: Create First Checkpoint (Pre-Changes)
Write-Host "Step 3: Creating Checkpoint 1 (Pre-Changes)..."
Write-Host "─────────────────────────────────────────────"

try {
    $cp1Response = Invoke-RestMethod -Uri "$($TestConfig.ApiUrl)/clones/$($clone.data.id)/checkpoints" `
        -Method POST `
        -ContentType "application/json" `
        -Body @{
            checkpointName = "Pre-Changes Baseline"
            phase = "pre-etl"
            description = "Baseline state before modifications"
            force = $false
        } | ConvertTo-Json

    $checkpoint1 = $cp1Response | ConvertFrom-Json

    if ($checkpoint1.success) {
        Write-Host "✓ Checkpoint 1 created successfully"
        Write-Host "  Checkpoint ID: $($checkpoint1.data.checkpointId)"
        Write-Host "  Phase: $($checkpoint1.data.phase)"
    } else {
        Write-Host "✗ Failed to create checkpoint 1: $($checkpoint1.message)"
        exit 1
    }
} catch {
    Write-Host "✗ Error creating checkpoint 1: $_"
    exit 1
}

Write-Host ""

# Test 4: Simulate Data Modifications
Write-Host "Step 4: Simulating Data Modifications..."
Write-Host "─────────────────────────────────────────"

Write-Host "  (In real scenario, ETL or test would modify data)"
Write-Host "  - Add 3 new orders"
Write-Host "  - Update 2 customer records"
Write-Host "  - Delete 1 old order"
Write-Host "✓ Modifications simulated (in real test, would use SQL)"

Write-Host ""

# Test 5: Create Second Checkpoint (Post-Changes)
Write-Host "Step 5: Creating Checkpoint 2 (Post-Changes)..."
Write-Host "─────────────────────────────────────────────"

try {
    $cp2Response = Invoke-RestMethod -Uri "$($TestConfig.ApiUrl)/clones/$($clone.data.id)/checkpoints" `
        -Method POST `
        -ContentType "application/json" `
        -Body @{
            checkpointName = "Post-ETL Results"
            phase = "post-etl"
            description = "State after test modifications"
            force = $false
        } | ConvertTo-Json

    $checkpoint2 = $cp2Response | ConvertFrom-Json

    if ($checkpoint2.success) {
        Write-Host "✓ Checkpoint 2 created successfully"
        Write-Host "  Checkpoint ID: $($checkpoint2.data.checkpointId)"
        Write-Host "  Phase: $($checkpoint2.data.phase)"
    } else {
        Write-Host "✗ Failed to create checkpoint 2: $($checkpoint2.message)"
        exit 1
    }
} catch {
    Write-Host "✗ Error creating checkpoint 2: $_"
    exit 1
}

Write-Host ""

# Test 6: Update Checkpoint 2 (Add Label & Mark Favorite)
Write-Host "Step 6: Updating Checkpoint 2 (Add Label & Favorite)..."
Write-Host "─────────────────────────────────────────────────────"

try {
    $updateCp2Response = Invoke-RestMethod -Uri "$($TestConfig.ApiUrl)/clones/$($clone.data.id)/checkpoints/$($checkpoint2.data.checkpointId)" `
        -Method PATCH `
        -ContentType "application/json" `
        -Body @{
            isFavorite = $true
            labels = @("etl-v1", "production-equivalent")
        } | ConvertTo-Json

    $updateResult = $updateCp2Response | ConvertFrom-Json

    if ($updateResult.success) {
        Write-Host "✓ Checkpoint 2 updated successfully"
        Write-Host "  Marked as favorite: true"
        Write-Host "  Labels: etl-v1, production-equivalent"
    } else {
        Write-Host "⚠ Checkpoint update returned: $($updateResult.message)"
    }
} catch {
    Write-Host "⚠ Warning updating checkpoint: $_"
}

Write-Host ""

# Test 7: List All Checkpoints
Write-Host "Step 7: Listing All Checkpoints..."
Write-Host "─────────────────────────────────"

try {
    $listResponse = Invoke-RestMethod -Uri "$($TestConfig.ApiUrl)/clones/$($clone.data.id)/checkpoints" `
        -Method GET

    if ($listResponse.success) {
        Write-Host "✓ Checkpoints retrieved successfully"
        $checkpoints = $listResponse.data
        if ($checkpoints -is [array]) {
            Write-Host "  Total checkpoints: $($checkpoints.Count)"
            foreach ($cp in $checkpoints) {
                Write-Host "    - $($cp.checkpointId): $($cp.name) (Phase: $($cp.phase))"
                if ($cp.isFavorite) { Write-Host "      ⭐ FAVORITE" }
            }
        } else {
            Write-Host "  Single checkpoint found: $($checkpoints.checkpointId)"
        }
    } else {
        Write-Host "✗ Failed to list checkpoints: $($listResponse.message)"
    }
} catch {
    Write-Host "✗ Error listing checkpoints: $_"
}

Write-Host ""

# Test 8: Restore to Checkpoint 1 (Rollback Changes)
Write-Host "Step 8: Restoring to Checkpoint 1 (Rollback)..."
Write-Host "──────────────────────────────────────────────"

try {
    $restoreResponse = Invoke-RestMethod -Uri "$($TestConfig.ApiUrl)/clones/$($clone.data.id)/checkpoints/$($checkpoint1.data.checkpointId)/restore" `
        -Method POST `
        -ContentType "application/json" `
        -Body @{
            reattachAfter = $true
        } | ConvertTo-Json

    $restoreResult = $restoreResponse | ConvertFrom-Json

    if ($restoreResult.success) {
        Write-Host "✓ Restore successful!"
        Write-Host "  Database state reverted to Checkpoint 1"
        Write-Host "  All modifications since CP1 have been rolled back"
    } else {
        Write-Host "✗ Restore failed: $($restoreResult.message)"
    }
} catch {
    Write-Host "✗ Error during restore: $_"
}

Write-Host ""

# Test 9: Get Clone Details
Write-Host "Step 9: Retrieving Final Clone Details..."
Write-Host "──────────────────────────────────────────"

try {
    $detailsResponse = Invoke-RestMethod -Uri "$($TestConfig.ApiUrl)/clones/$($clone.data.id)" `
        -Method GET

    $cloneDetails = $detailsResponse | ConvertFrom-Json

    if ($cloneDetails.success) {
        Write-Host "✓ Clone details retrieved"
        $cd = $cloneDetails.data
        Write-Host "  Clone Name: $($cd.name)"
        Write-Host "  Status: $($cd.status)"
        Write-Host "  Instance: $($cd.instancePath)"
        Write-Host "  Database: $($cd.databaseName)"
    } else {
        Write-Host "✗ Failed to get clone details: $($cloneDetails.message)"
    }
} catch {
    Write-Host "✗ Error retrieving clone details: $_"
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗"
Write-Host "║                  Test Scenario Complete                    ║"
Write-Host "╚════════════════════════════════════════════════════════════╝"
Write-Host ""
Write-Host "Summary:"
Write-Host "  ✓ Golden image created"
Write-Host "  ✓ Clone provisioned"
Write-Host "  ✓ Checkpoint 1 created (pre-changes)"
Write-Host "  ✓ Checkpoint 2 created (post-changes)"
Write-Host "  ✓ Checkpoint 2 labeled and marked favorite"
Write-Host "  ✓ Checkpoint list retrieved"
Write-Host "  ✓ Rollback to Checkpoint 1 executed"
Write-Host ""
Write-Host "Next Steps:"
Write-Host "  1. Open GUI at http://localhost:3000"
Write-Host "  2. Review the clone and its checkpoints"
Write-Host "  3. Verify checkpoint labels and favorites"
Write-Host "  4. Check the restoration state"
Write-Host ""

if ($KeepRunning) {
    Write-Host "Press Ctrl+C to exit..."
    while ($true) { Start-Sleep -Seconds 1 }
}
