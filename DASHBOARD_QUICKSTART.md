# Dashboard Quick Start Guide

## Getting Started with the Metrics Dashboard

### Starting the System

1. **Start the PowerShell Module**
   ```powershell
   # The module is imported automatically when accessed via API
   # Or manually:
   Import-Module C:\flashdb\src\FlashDB\FlashDB.psm1
   ```

2. **Start the API Server**
   ```bash
   cd C:\flashdb\src\api
   npm install  # If not already installed
   npm start    # Starts on port 3001
   ```

3. **Start the GUI Application**
   ```bash
   cd C:\flashdb\src\gui
   npm install  # If not already installed
   npm start    # Starts on port 5173
   ```

4. **Access the Dashboard**
   - Open browser to `http://localhost:5173`
   - Click on "Metrics Dashboard" tab

## Dashboard Features

### Key Metrics Cards

Displays 6 critical metrics:

1. **Total Clones Created** - Total number of clones created
   - Shows active count in subtext
   
2. **Storage Saved** - Total storage savings through compression
   - Compares to original golden image size
   
3. **Avg Clone Creation Time** - Average time to create a clone
   - Based on actual clone metadata
   
4. **Operation Success Rate** - Percentage of successful operations
   - Shows successful/total operations
   
5. **Last 24h Activity** - Total operations in last 24 hours
   - Shows operation count
   
6. **Compression Ratio** - Effective compression percentage
   - Shows actual storage used

### Charts

#### Clone Creation Timeline (24 hours)
- Bar chart showing clones created per hour
- Hover over bars for exact count
- Shows activity patterns throughout the day

#### Storage Breakdown
- Visual representation of used vs saved space
- Compares against original golden image size
- Shows compression effectiveness

#### Operation Methods Distribution
- Bar chart of top 5 operation types
- Shows count and percentage for each method
- Ordered by frequency

#### Operation Success Rates
- Gauge/progress bar showing overall success rate
- Colored indicator (green = good)
- Detailed counts below

#### Clone Statistics
- Summary boxes showing totals
- Successful, failed, and success percentage
- Quick overview of clone health

#### Clone Creation Performance
- Timing breakdown: average, minimum, maximum
- Shows performance distribution
- Formatted for readability

### Storage Breakdown Table

Detailed per-clone information:
- Clone name
- VHDX file size (GB)
- Parent golden image size
- Storage saved (GB)
- Compression percentage

## Using the Dashboard

### Auto-Refresh

Dashboard automatically updates every 30 seconds:
- Change interval: Use "Refresh interval" input (5-300 seconds)
- Faster for real-time monitoring
- Slower for low-traffic systems

### Manual Refresh

Click "Refresh Now" button to fetch latest metrics immediately.

### Switching Views

- **Metrics Dashboard** - Performance analytics and visualizations
- **Management** - Clone creation and checkpoint management

## Accessing Metrics via API

### PowerShell

```powershell
Import-Module C:\flashdb\src\FlashDB\FlashDB.psm1

# Get all metrics
$metrics = Get-FlashdbMetrics
$metrics | ConvertTo-Json -Depth 10

# Get specific metrics
$clones = Get-CloneCreationStats
$storage = Get-StorageStats
$ops = Get-OperationStats
$timeline = Get-TimelineData -HoursBack 24

# Access specific values
$metrics.overview.totalClonesCreated
$storage.compressionRatioPercent
$ops.successRatePercent
```

### REST API via curl

```bash
# Overview metrics
curl http://localhost:3001/api/metrics/overview | jq .

# Clone statistics
curl http://localhost:3001/api/metrics/clones | jq .

# Storage metrics
curl http://localhost:3001/api/metrics/storage | jq .

# Operation metrics
curl http://localhost:3001/api/metrics/operations | jq .

# Timeline data (last 24 hours, hourly grouping)
curl "http://localhost:3001/api/metrics/timeline?hoursBack=24&groupBy=hour" | jq .

# Timeline data (last 7 days, daily grouping)
curl "http://localhost:3001/api/metrics/timeline?hoursBack=168&groupBy=day" | jq .

# All metrics combined
curl http://localhost:3001/api/metrics/all | jq .
```

### REST API via JavaScript/TypeScript

```javascript
// Using fetch
async function getMetrics() {
  const response = await fetch('http://localhost:3001/api/metrics/overview');
  const data = await response.json();
  console.log(data.data);
}

// Using axios
import axios from 'axios';

const metrics = await axios.get('http://localhost:3001/api/metrics/all');
console.log(metrics.data.data);
```

## Understanding the Metrics

### Clone Creation Stats

- **Average Creation Time**: Mean time across all clones
- **Min/Max Times**: Fastest and slowest clone creation
- **Success Rate**: Percentage of successful clone operations
- **Breakdown**: Statistics per golden image

**Example**: If average is 12.3 seconds, most clones take ~12 seconds to create.

### Storage Metrics

- **Total Used**: Sum of all VHDX file sizes
- **Total Savings**: Space saved through compression
- **Compression Ratio**: (Savings / Original) * 100
- **Average Clone Size**: Total used / number of clones

**Example**: If compression ratio is 62%, each clone uses ~38% of original size.

### Operation Metrics

- **Success Rate**: Percentage of operations completed successfully
- **By Type**: Success rate broken down by operation method
- **Top Operation**: Most frequently used operation type

**Example**: If "create-clone" has 42 operations with 97.6% success, 41 succeeded and 1 failed.

### Timeline Data

- **Clone Creations**: Number of clones created per time period
- **Operations**: Total operations per time period
- **Time Period**: Grouped by hour or day

**Example**: Timeline shows 3 clones created at 10:00 and 2 at 11:00.

## Troubleshooting

### Dashboard Not Loading

1. Check API server is running
   ```bash
   curl http://localhost:3001/api/health
   ```

2. Check browser console for errors (F12)

3. Verify CORS is enabled in API server

### No Metrics Displayed

1. Ensure clones exist in the system
   ```powershell
   Get-FlashdbClone
   ```

2. Check API error messages
   ```bash
   curl http://localhost:3001/api/metrics/overview
   ```

3. Verify API can reach PowerShell module

### Slow Dashboard Loading

1. Reduce auto-refresh interval temporarily
2. Check system resources (CPU, memory)
3. Verify network latency to API server

## API Response Examples

### Overview Response
```json
{
  "success": true,
  "data": {
    "totalClonesCreated": 42,
    "totalStorageSavedGB": 256.5,
    "avgCloneCreationTimeSeconds": 12.3,
    "operationSuccessRatePercent": 98.5,
    "operationsLast24h": 156,
    "activeClonesCount": 12,
    "lastUpdated": "2026-06-06T10:30:00Z"
  }
}
```

### Clone Statistics Response
```json
{
  "success": true,
  "data": {
    "totalClones": 42,
    "successfulClones": 41,
    "failedClones": 1,
    "averageCreationTimeSeconds": 12.3,
    "minCreationTimeSeconds": 8.5,
    "maxCreationTimeSeconds": 25.1,
    "successRatePercent": 97.6
  }
}
```

### Storage Response
```json
{
  "success": true,
  "data": {
    "totalUsedGB": 156.2,
    "totalSavingsGB": 256.5,
    "compressionRatioPercent": 62.1,
    "avgCloneSizeGB": 3.7,
    "totalParentSizeGB": 412.7
  }
}
```

## Integration with Other Features

### With Clone Management
- Metrics automatically update when clones are created/deleted
- Dashboard reflects current system state
- Storage metrics account for all active clones

### With Search/Filtering
- Metrics can be filtered (future enhancement)
- Timeline can show specific operation types
- Breakdown by golden image available

### With Batch Operations
- Timeline shows batch operation effects
- Success rates reflect batch results
- Per-operation-type breakdown available

## Performance Tips

1. **For Real-Time Monitoring**: Set refresh to 15-30 seconds
2. **For Dashboard Overview**: Set refresh to 60+ seconds
3. **For Reports**: Use `/api/metrics/timeline` endpoint directly
4. **Export Data**: Use API endpoints with curl/script to export

## Common Tasks

### Check System Health
```powershell
$metrics = Get-FlashdbMetrics
if ($metrics.overview.operationSuccessRatePercent -lt 95) {
  Write-Warning "Success rate below 95%"
}
```

### Calculate ROI
```powershell
$storage = Get-StorageStats
$roi = ($storage.totalSavingsGB / $storage.totalParentSizeGB) * 100
Write-Host "Storage efficiency: $roi%"
```

### Monitor Clone Performance
```powershell
$clones = Get-CloneCreationStats
Write-Host "Average creation time: $($clones.averageCreationTimeSeconds) seconds"
```

### Track Operations
```powershell
$ops = Get-OperationStats
$ops.operationsByType | Sort-Object count -Descending | Select-Object -First 5
```

## Next Steps

1. **Explore the dashboard** - Navigate all tabs and charts
2. **Monitor activity** - Watch metrics update in real-time
3. **Check the logs** - Review operation details in Management tab
4. **Create clones** - Operations will appear in metrics
5. **Analyze trends** - Use timeline data for insights

## Support

For more information:
- See [METRICS.md](docs/METRICS.md) for detailed documentation
- See [DASHBOARD_IMPLEMENTATION.md](DASHBOARD_IMPLEMENTATION.md) for technical details
- Check [METRICS_VERIFICATION.md](METRICS_VERIFICATION.md) for implementation checklist

## System Requirements

- PowerShell 5.1+
- Node.js 14+
- Modern web browser (Chrome, Firefox, Edge, Safari)
- Sufficient disk space for VHDX files
- Windows VHDX support enabled

---

**Dashboard Version**: 0.1.0  
**Last Updated**: 2026-06-06
