# FlashDB User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Core Concepts](#core-concepts)
3. [Creating Golden Images](#creating-golden-images)
4. [Managing Clones](#managing-clones)
5. [Working with Checkpoints](#working-with-checkpoints)
6. [Search and Discovery](#search-and-discovery)
7. [Batch Operations](#batch-operations)
8. [Monitoring and Metrics](#monitoring-and-metrics)
9. [Common Tasks](#common-tasks)
10. [Best Practices](#best-practices)
11. [Troubleshooting](#troubleshooting)

## Getting Started

### What is FlashDB?

FlashDB is a database virtualization tool that enables rapid deployment of database clones using golden images and VHDX (Virtual Hard Disk) technology. It dramatically reduces the time and storage required for database provisioning in development, testing, and QA environments.

### Key Benefits

- **Fast Cloning**: Create full database clones in seconds instead of hours
- **Storage Efficiency**: Multiple clones share a single golden image
- **Easy Rollback**: Restore clones to previous states using checkpoints
- **Batch Operations**: Manage multiple clones simultaneously
- **Comprehensive Monitoring**: Track usage, performance, and operations

### System Requirements

- **OS**: Windows Server 2019 or later
- **CPU**: Intel/AMD with virtualization support
- **RAM**: Minimum 16 GB (32 GB recommended)
- **Storage**: Dedicated SSD for VHDX files (500 GB+ recommended)
- **.NET Framework**: 4.7.2 or later
- **SQL Server**: 2016 or later (for database hosting)

### First-Time Setup

1. **Install FlashDB**
   ```bash
   # Download and extract FlashDB
   # Run the installer or follow manual setup
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```

2. **Configure Storage Location**
   ```powershell
   # Set the base storage path for images and clones
   Set-FlashdbStoragePath -Path "E:\FlashDB" -Confirm:$false
   ```

3. **Verify Installation**
   ```powershell
   # Test FlashDB connectivity
   Test-FlashdbConnection
   Get-FlashdbStatus
   ```

4. **Access the Dashboard**
   - Open your browser to `http://localhost:3000`
   - You should see the FlashDB dashboard

## Core Concepts

### Golden Image

A golden image is a reference copy of a database saved as a VHDX file. It serves as the base template from which all clones are created.

**Characteristics:**
- Read-only template
- Typically 50 GB - 2 TB in size
- Created once, used many times
- Stored in a central location

**Creation Methods:**
- **Backup Restore**: Restore from SQL Server backup (.bak)
- **Replica Backup**: Copy from a live replica database
- **Table-by-Table Copy**: Manual selection of tables to include

### Clone

A clone is a temporary, writable copy of a golden image used for development, testing, or QA.

**Characteristics:**
- Fully isolated from other clones
- Writable (changes don't affect the golden image)
- Created instantly from a golden image
- Automatically cleaned up after use

**Typical Lifespan:**
- Created at test start
- Checkpoints created during testing
- Deleted after test completion

### Checkpoint

A checkpoint (snapshot) captures the state of a clone at a specific point in time.

**Characteristics:**
- Allows rollback to a known good state
- Minimal storage overhead
- Can be created during test execution
- Useful for test isolation

**Use Cases:**
- "Before" state before applying changes
- "After" state to verify results
- Recovery from test failures

## Creating Golden Images

### Method 1: From SQL Server Backup

This is the most common method for creating golden images.

**Prerequisites:**
- SQL Server backup file (.bak)
- Sufficient storage space (1.5x backup size recommended)

**Steps:**

1. **Navigate to Golden Images**
   - Open the FlashDB Dashboard
   - Click "Golden Images" in the sidebar
   - Click "Create New Golden Image"

2. **Configure Image**
   - **Name**: `prod-20260606` (use date or version)
   - **Version**: `1.0.0` or `20260606`
   - **Method**: Select "Backup Restore"
   - **Output Path**: `E:\FlashDB\GoldenImages\prod-20260606.vhdx`

3. **Select Backup File**
   - Click "Browse" to locate your backup file
   - Select the .bak file (e.g., `AdventureWorks.bak`)

4. **Optional Settings**
   - **Compress**: Enable to reduce VHDX size (slower creation)
   - **Verify Row Counts**: Verify data integrity after creation

5. **Create Image**
   - Click "Create Golden Image"
   - Monitor progress in the Operations panel
   - Creation typically takes 10-30 minutes for 100 GB database

6. **Verify Creation**
   - Wait for status to show "Ready"
   - View image details including size and creation time

### Method 2: From Live Replica

For environments with a replica database.

**Prerequisites:**
- Access to the replica SQL Server
- Network connectivity between servers

**Steps:**

1. **Navigate to Create Golden Image**
2. **Configuration**
   - **Name**: `replica-prod-20260606`
   - **Method**: Select "Replica Backup"
   - **Source Connection**: Enter connection string
     ```
     Server=replica-server;Database=AdventureWorks;Encrypt=true;
     ```

3. **Advanced Options**
   - **Database Name**: Name of database to replicate
   - **Include System Databases**: Yes/No

4. **Create Image**
   - System will backup from replica and create VHDX
   - No downtime on production systems

### Method 3: Table-by-Table Copy

For selective database copying.

**Steps:**

1. **Select Method**: "Table-by-Table Copy"
2. **Choose Tables**
   - Check "Select All" or choose individual tables
   - Common pattern: Select core tables, exclude logs/temp tables
3. **Configure**
   - Source connection string
   - Destination VHDX path
4. **Create**
   - System copies selected tables to new database
   - Creates VHDX from result

### Golden Image Management

**View Details:**
```
Golden Images → Click image name → View Properties
```

**Export Metadata:**
```
Golden Images → Click image → Export
```

**Delete Golden Image:**
```
Golden Images → Select image → Delete
(Warning: Cannot delete if clones exist)
```

## Managing Clones

### Creating Clones

**Quick Clone Creation:**

1. **Open Clone Creation**
   - Dashboard → "Quick Actions" → "Create Clone"
   - Or: Clones → "New Clone"

2. **Select Golden Image**
   - Choose from available golden images
   - View image details (size, version, creation date)

3. **Configure Clone**
   - **Clone Name**: `test-001`, `perf-test-20260606`
   - **Database Name**: Leave default or customize
   - **Attach to SQL Server**: (Optional) Server name for attachment

4. **Create**
   - Click "Create Clone"
   - Clone created in seconds (typically 2-5 seconds)
   - Status changes to "Ready"

**Batch Clone Creation:**

To create multiple clones simultaneously:

1. **Batch Operations** → "Create Clones"
2. **Add Items**
   - Click "Add Clone"
   - Enter name and select golden image
   - Repeat for each clone (up to 100)
3. **Execute**
   - Review items
   - Click "Start Batch"
   - Monitor progress in progress bar

### Viewing Clones

**Clone List:**
```
Clones → View all clones with status, size, creation date
```

**Clone Details:**
```
Clones → Click clone name → View:
  - Size and storage usage
  - Checkpoints
  - Creation/modification dates
  - Metadata
```

**Clone Status:**
- **Creating**: Being provisioned from golden image
- **Ready**: Available for use
- **In-Use**: Currently mounted or accessed
- **Deleted**: Marked for deletion

### Deleting Clones

**Manual Deletion:**

1. **Select Clone**
   - Clones → Click clone name
   - Click "Delete Clone"

2. **Confirm**
   - Review deletion warning
   - Confirm deletion (irreversible)

3. **Cleanup**
   - Storage is freed automatically
   - Clone removed from system

**Batch Deletion:**

1. **Batch Operations** → "Delete Clones"
2. **Select Clones**
   - Check boxes for clones to delete
   - Or use "Select All"
3. **Confirm and Delete**
   - Review items to delete
   - Click "Start Batch"

**Automatic Cleanup:**
```powershell
# Configure automatic deletion after X hours
Set-FlashdbCloneExpiration -Hours 24 -Enabled $true
```

### Clone Lifecycle Example

```
1. Create Clone from golden-prod-20260606
   ↓
2. Run initial setup and configuration
3. Create "baseline" checkpoint
   ↓
4. Run first test suite
5. Create "after-test-1" checkpoint
   ↓
6. Run second test suite
7. Create "after-test-2" checkpoint
   ↓
8. Restore to "baseline" checkpoint for retry
   ↓
9. Delete clone when testing complete
```

## Working with Checkpoints

### Creating Checkpoints

**Before Starting Tests:**

1. **Clone Details** → "Checkpoints" tab
2. **Create Checkpoint**
   - Click "New Checkpoint"
   - Name: `baseline` or `before-migration`
   - Description: "Initial state before migration"
3. **Confirm**
   - Checkpoint created instantly
   - Takes minimal storage

**During Testing:**

```powershell
# Via PowerShell
New-FlashdbCheckpoint -CloneId "test-clone-001" `
  -Name "after-schema-changes" `
  -Description "After running migration script"
```

### Viewing Checkpoints

**List Checkpoints:**
```
Clones → Select Clone → Checkpoints tab
(Shows name, creation date, size, storage used)
```

**Checkpoint Details:**
```
Checkpoints → Click checkpoint → View:
  - Clone associated
  - Exact creation timestamp
  - Description/notes
  - Storage consumption
```

### Restoring from Checkpoints

**Restore via Dashboard:**

1. **Clone Details** → "Checkpoints" tab
2. **Select Checkpoint**
   - Click the checkpoint to restore
   - Review name and description
3. **Restore**
   - Click "Restore from Checkpoint"
   - Confirm restoration
   - Clone reverts to checkpoint state (seconds)
4. **Resume Testing**
   - All changes after checkpoint are lost
   - Clone is now back in the checkpoint state

**Restore via PowerShell:**

```powershell
# Restore clone to previous checkpoint
Restore-FlashdbCheckpoint -CloneId "test-clone-001" `
  -CheckpointId "after-schema-changes" `
  -Confirm:$false
```

### Managing Checkpoints

**Delete Old Checkpoints:**

```
Clones → Select Clone → Checkpoints
Select checkpoint → "Delete Checkpoint"
```

**Export Checkpoint Data:**

```
Checkpoint → Click "..." → "Export Data"
(Exports data as SQL scripts or backup)
```

**Best Practices:**

- Create checkpoints before risky operations
- Name checkpoints descriptively
- Delete old checkpoints to save storage
- Keep "baseline" checkpoint for quick resets

## Search and Discovery

### Simple Search

**Search for Clones:**

1. **Dashboard** → Search box at top
2. Enter clone name (e.g., `test-001`)
3. View matching clones
4. Click result to open clone details

**Search Filters:**

```
Clones → "Filters" button
- Filter by status (Ready, Creating, etc.)
- Filter by golden image
- Filter by date range
- Filter by size
```

### Advanced Search

**Complex Queries:**

1. **Clones** → "Advanced Search"
2. **Build Query:**
   - Field: "Name" Operator: "Contains" Value: "test"
   - AND
   - Field: "Status" Operator: "Equals" Value: "Ready"
   - AND
   - Field: "Size" Operator: "Greater Than" Value: "100 GB"
3. **Execute**
   - View results
   - Sort by any column
   - Export results

### Search Examples

**Find large test clones:**
```
Name contains: "test" AND Size > 500 GB AND Status = Ready
```

**Find clones by date:**
```
Created Date between: 2026-06-01 and 2026-06-06
```

**Find clones from specific golden image:**
```
Golden Image = "prod-20260606" AND Checkpoints > 5
```

### Search Suggestions

The search system provides suggestions:
- Recent searches
- Popular searches
- Trending clone names
- Common filters

## Batch Operations

### Batch Create Clones

**Scenario**: Create 20 clones for QA team.

1. **Batch Operations** → "Create Clones"
2. **Add Items**
   ```
   qa-clone-001 from golden-prod
   qa-clone-002 from golden-prod
   ...
   qa-clone-020 from golden-prod
   ```
3. **Options**
   - Compress: Yes/No
   - Attach to SQL Server: Optional
4. **Execute**
   - Click "Start Batch"
   - Monitor progress (99% complete in ~30 seconds)
   - Download results CSV

### Batch Create Checkpoints

**Scenario**: Create checkpoints on 50 active test clones.

1. **Batch Operations** → "Create Checkpoints"
2. **Select Clones**
   - Check "Select all Ready clones"
   - Or manually select specific clones
3. **Configure**
   - Checkpoint Name: `daily-baseline-20260606`
   - Description: `Daily backup before test runs`
4. **Execute**
   - Confirm operation
   - Checkpoints created on all selected clones
   - Review completion status

### Batch Delete Clones

**Scenario**: Clean up old test clones.

1. **Batch Operations** → "Delete Clones"
2. **Select Clones**
   - Use filters: Status = "Ready", Created Before = "2026-05-06"
   - Review selected clones (with size and storage savings)
3. **Confirm**
   - Acknowledge data loss warning
   - Click "Delete All"
4. **Cleanup**
   - Clones deleted
   - Storage freed
   - View space savings report

### Batch Restore Checkpoints

**Scenario**: Revert 100 clones to baseline for retry.

1. **Batch Operations** → "Restore Checkpoints"
2. **Select Source Checkpoint**
   - Choose checkpoint to restore (e.g., "baseline")
   - Applies to all clones with this checkpoint
3. **Select Clones**
   - Clones automatically filtered to those with checkpoint
   - Review count
4. **Execute**
   - Confirm operation
   - All clones restored simultaneously
   - Status updates in real-time

### Batch Operation Monitoring

**Real-Time Progress:**
```
Batch Operations → Select running batch
- Total items
- Completed items
- Failed items
- Current item being processed
- Estimated time remaining
```

**Batch Results:**
```
After completion:
- View success/failure count
- Download detailed CSV results
- Review error logs for failures
```

## Monitoring and Metrics

### Dashboard Overview

The main dashboard shows:

1. **Quick Stats**
   - Total clones: XX active
   - Golden images: XX available
   - Storage used: XX% of capacity
   - Operations in progress: XX

2. **Recent Activity**
   - Latest clone creations
   - Recent checkpoints
   - Failed operations
   - User actions

3. **Storage Breakdown**
   - By golden image
   - By clone
   - By checkpoint
   - Unallocated space

### Storage Metrics

**View Storage Dashboard:**
```
Metrics → Storage
Shows:
- Total storage capacity
- Used space by category
- Available space
- Growth trend
- Largest clones/images
```

**Storage Alerts:**
- Warning at 80% capacity
- Critical at 95% capacity
- Set custom thresholds

**Example Storage Calculation:**
```
Golden Image: 100 GB
Clone 1: 5 GB (delta from golden)
Clone 2: 8 GB (delta from golden)
Checkpoint 1: 2 GB (delta snapshot)

Total: 115 GB for 1 golden + 2 clones + 1 checkpoint
(vs. 213 GB if all independent)

Storage savings: 46%
```

### Performance Metrics

**Operation Performance:**
```
Metrics → Operations
Shows:
- Average clone creation time
- P50, P95, P99 latencies
- Success rate
- Most used golden images
```

**Clone Metrics:**
```
Metrics → Clones
Shows per clone:
- Total size
- Number of checkpoints
- Access count
- Last accessed date
```

### Activity Reports

**Generate Reports:**

1. **Metrics** → "Reports"
2. **Select Report Type:**
   - Daily activity summary
   - Weekly clone utilization
   - Monthly storage trends
   - Operational efficiency
3. **Configure**
   - Date range
   - Email recipients
4. **Generate/Export**
   - View as dashboard
   - Export as PDF/CSV

**Example Report:**
```
Weekly Summary:
- 150 clones created
- 89 clones deleted
- 12.5 TB storage freed
- 99.8% operation success rate
- Average clone creation: 3.2 seconds
```

## Common Tasks

### Task 1: Setup a Test Environment

**Goal**: Prepare database for QA testing.

**Steps:**

1. Create golden image from production backup
   - `New-FlashdbGoldenImage` from latest prod backup
   - Wait for verification (10-30 min)

2. Create 10 clones for QA team
   - Batch create: qa-test-001 through qa-test-010
   - Wait for completion (30 seconds)

3. Create baseline checkpoint
   - On each clone: checkpoint named "before-testing"

4. Provide clone details to QA
   - Share clone names and SQL connection strings
   - QA can begin testing immediately

### Task 2: Recover from Test Failure

**Goal**: Reset a failed test clone.

**Steps:**

1. Identify failed clone
   - Dashboard shows clone status
   - QA team reports issue

2. Review available checkpoints
   - Clone details → Checkpoints tab
   - Choose "baseline" checkpoint

3. Restore from checkpoint
   - Click checkpoint → "Restore"
   - Confirm operation
   - Clone reverts to baseline (instant)

4. Resume testing
   - QA team resumes testing from known state
   - No re-setup required

### Task 3: Clean Up Old Clones

**Goal**: Free storage space.

**Steps:**

1. Identify old clones
   - Metrics → Storage dashboard
   - Clones tab → Filter by "Created before 2026-05-01"

2. Verify no longer needed
   - Check with team leads
   - Review last access date

3. Delete in batch
   - Batch Operations → "Delete Clones"
   - Select old clones (total size shown)
   - Confirm deletion

4. Verify space freed
   - Metrics → Storage dashboard
   - Available capacity increased

### Task 4: Monitor System Health

**Goal**: Ensure system stability.

**Daily Checks:**

1. **Dashboard Health**
   - All operational metrics green
   - No failed operations
   - Storage usage normal

2. **Recent Errors**
   - Check for operation failures
   - Investigate errors if present

3. **Storage Trending**
   - Growth rate acceptable
   - No unexpected increases

4. **Performance**
   - Clone creation times normal
   - No slowdowns

## Best Practices

### Golden Image Management

1. **Naming Convention**
   ```
   <environment>-<date>
   Examples: prod-20260606, qa-20260604, dev-20260601
   ```

2. **Version Control**
   - Keep last 3-5 versions of each golden image
   - Document changes between versions
   - Delete old versions when storage is needed

3. **Verification**
   - Always run "Verify Row Counts" during creation
   - Test clone creation from new golden image
   - Ensure application compatibility

4. **Backup Golden Images**
   ```powershell
   Backup-FlashdbGoldenImage -ImageId "prod-20260606" `
     -BackupPath "\\backup-server\flashdb-backups"
   ```

### Clone Management

1. **Naming Convention**
   ```
   <purpose>-<identifier>
   Examples: test-001, perf-test-06, migration-v2
   ```

2. **Lifecycle**
   - Set expiration times: development (24h), testing (7d)
   - Automatic cleanup prevents storage waste
   - Manual deletion for special cases

3. **Checkpoint Strategy**
   ```
   Checkpoint Timeline:
   1. Create "baseline" immediately after clone
   - Before any modifications
   - One per clone
   
   2. Create operational checkpoints
   - Before major schema changes
   - Before data migrations
   - After successful test passes
   
   3. Delete when done
   - Reduces storage
   - Improves performance
   ```

4. **Access Control**
   - Share clone names via secure channels
   - Restrict administrative access
   - Track who accessed which clones

### Monitoring Best Practices

1. **Regular Audits**
   - Weekly: Storage usage review
   - Daily: Failed operations check
   - Monthly: Performance trending

2. **Alerting**
   ```powershell
   # Enable alerts for critical conditions
   Set-FlashdbAlert -Threshold "StorageUsage:90%" `
     -Action "SendEmail" -Recipient "admin@company.com"
   ```

3. **Retention Policies**
   - Clones: 7 days for testing, 24 hours for development
   - Checkpoints: 7 days unless specifically retained
   - Operations logs: 30 days retention

4. **Reporting**
   - Weekly storage usage reports
   - Monthly operation summaries
   - Quarterly cost analysis

## Troubleshooting

### Clone Creation Failures

**Issue**: Clone creation fails or hangs.

**Troubleshooting Steps:**

1. **Check Golden Image**
   ```powershell
   Get-FlashdbGoldenImage -Id "prod-20260606"
   # Verify Status = "Ready"
   ```

2. **Verify Storage Space**
   ```powershell
   Get-FlashdbStorageMetrics
   # Ensure available space > 2 * golden image size
   ```

3. **Check Recent Errors**
   ```powershell
   Get-FlashdbOperationLog -Status "Failed" -Last 10
   # Look for error patterns
   ```

4. **Restart Service**
   ```powershell
   Restart-FlashdbService -Force
   # Wait 30 seconds, retry
   ```

### Checkpoint Restore Hangs

**Issue**: Restoring from checkpoint is very slow.

**Troubleshooting:**

1. **Check System Resources**
   ```
   Task Manager → Performance tab
   - CPU usage should be high
   - Memory usage should be normal
   ```

2. **Monitor Disk I/O**
   ```
   Performance Monitor → Disk object
   - Look for disk queue depth > 10
   - Check for other processes using disk
   ```

3. **Cancel and Retry**
   ```powershell
   Stop-FlashdbOperation -OperationId "..." -Force
   # Wait for cancellation (1-2 min)
   # Retry restore
   ```

### High Storage Usage

**Issue**: Storage usage growing unexpectedly.

**Analysis:**

1. **Identify Culprits**
   ```
   Metrics → Storage dashboard
   - Sort by size
   - Identify largest clones/checkpoints
   ```

2. **Verify Age**
   ```
   Clones → Filter by "Created before date"
   - Find old unused clones
   - Review creation reason
   ```

3. **Cleanup Strategy**
   - Delete clones no longer needed
   - Delete old checkpoints
   - Remove old golden images

4. **Monitoring**
   ```powershell
   # Automatic cleanup old clones
   Set-FlashdbCloneExpirationPolicy `
     -ExpirationDays 7 `
     -AutoCleanup $true
   ```

### API Connection Issues

**Issue**: Cannot connect to FlashDB API via REST.

**Troubleshooting:**

1. **Verify API is Running**
   ```powershell
   Get-FlashdbService -ServiceName "FlashDbApi"
   # Should show Status = "Running"
   ```

2. **Check Port**
   ```powershell
   Test-NetConnection -ComputerName localhost -Port 3001
   # Should show TcpTestSucceeded = True
   ```

3. **Verify CORS Settings**
   ```
   Call: GET http://localhost:3001/health
   Should return: { "status": "healthy", ... }
   ```

4. **Check Firewall**
   ```powershell
   Get-NetFirewallRule -DisplayName "*FlashDB*" | 
     Select-Object DisplayName, Enabled, Direction
   ```

5. **Restart API Service**
   ```powershell
   Stop-Service "FlashDbApi"
   Start-Service "FlashDbApi"
   # Wait 10 seconds
   ```

### Backup and Recovery

**If Storage is Corrupted:**

1. **Stop All Operations**
   ```powershell
   Stop-FlashdbService -Force
   ```

2. **Restore from Backup**
   ```powershell
   Restore-FlashdbBackup -BackupPath "\\backup\flashdb-20260605.bak"
   ```

3. **Verify Integrity**
   ```powershell
   Test-FlashdbIntegrity -Verbose
   ```

4. **Resume Services**
   ```powershell
   Start-FlashdbService
   Get-FlashdbStatus
   ```

## Support and Documentation

- **Online Help**: `Get-Help <cmdlet-name>` in PowerShell
- **API Documentation**: See API_REFERENCE.md
- **Administrator Guide**: See ADMINISTRATOR_GUIDE.md
- **Developer Guide**: See DEVELOPER_GUIDE.md
- **Issue Tracking**: GitHub Issues

## Next Steps

- Review the Administrator Guide for advanced configuration
- Explore the API Reference for programmatic access
- Check the DEVELOPER_GUIDE for integration options
