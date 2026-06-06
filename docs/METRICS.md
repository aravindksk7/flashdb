# FlashDB Metrics and Analytics

Comprehensive performance metrics collection, aggregation, and visualization system for FlashDB.

## Overview

The metrics system provides real-time insights into:
- Clone creation performance and efficiency
- Storage utilization and compression effectiveness
- Operation success rates and trends
- Historical timeline data for trend analysis

## Components

### 1. PowerShell Metrics Collector (`src/FlashDB/Core/MetricsCollector.ps1`)

Core metrics collection module providing functions to analyze FlashDB operations.

#### Functions

##### Get-FlashdbMetrics
Retrieves comprehensive metrics overview combining all metric types.

```powershell
$metrics = Get-FlashdbMetrics

# Returns object with:
# - overview: Key summary statistics
# - cloneStatistics: Clone creation metrics
# - storageMetrics: Storage analysis
# - operationMetrics: Operation success rates
# - lastUpdated: Timestamp
```

##### Get-CloneCreationStats
Analyzes clone creation performance and success rates.

```powershell
$stats = Get-CloneCreationStats

# Returns:
# - totalClones: Total number of clones
# - successfulClones: Successfully created clones
# - failedClones: Failed clone operations
# - averageCreationTimeSeconds: Mean creation time
# - minCreationTimeSeconds: Fastest clone creation
# - maxCreationTimeSeconds: Slowest clone creation
# - successRatePercent: Percentage of successful operations
# - creationTimesByGoldenImage: Breakdown by golden image
```

##### Get-StorageStats
Analyzes storage efficiency and VHDX compression.

```powershell
$storage = Get-StorageStats

# Returns:
# - totalUsedGB: Total storage consumed by all clones
# - totalSavingsGB: Storage saved through compression/deduplication
# - compressionRatioPercent: Effective compression ratio
# - avgCloneSizeGB: Average clone size
# - totalParentSizeGB: Total size of parent golden images
# - cloneStorageBreakdown: Per-clone storage details
```

##### Get-OperationStats
Analyzes operation success rates and method distribution.

```powershell
$operations = Get-OperationStats

# Returns:
# - totalOperations: Total operations performed
# - successfulOperations: Successful operations count
# - failedOperations: Failed operations count
# - successRatePercent: Overall success rate
# - operationsByType: Breakdown by operation type
```

##### Get-TimelineData
Generates historical timeline data for trend charts.

```powershell
$timeline = Get-TimelineData -HoursBack 24 -GroupBy 'hour'

# Parameters:
# - HoursBack: Number of hours to analyze (1-8760)
# - GroupBy: Time grouping ('hour' or 'day')

# Returns:
# - cloneCreations: Array of {timestamp, clones}
# - operations: Array of {timestamp, operations}
# - timelineStart: Start of analysis period
# - timelineEnd: End of analysis period
```

### 2. Metrics REST API (`src/api/src/routes/metrics.ts`)

Express.js REST API endpoints for accessing metrics data.

#### Endpoints

##### GET /api/metrics/overview
Summary statistics for dashboard.

**Response:**
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

##### GET /api/metrics/clones
Clone creation statistics and performance metrics.

**Response:**
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
    "successRatePercent": 97.6,
    "creationTimesByGoldenImage": [
      {
        "goldenImageId": "golden-prod-20260606",
        "cloneCount": 35,
        "avgCreationTimeSeconds": 11.8
      }
    ]
  }
}
```

##### GET /api/metrics/storage
Storage analysis and compression effectiveness.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalUsedGB": 156.2,
    "totalSavingsGB": 256.5,
    "compressionRatioPercent": 62.1,
    "avgCloneSizeGB": 3.7,
    "totalParentSizeGB": 412.7,
    "storageEfficiency": {
      "compressionRatioPercent": 62.1,
      "estimatedBackupVsCloneSize": 412.7,
      "storageSavedGB": 256.5
    },
    "cloneStorageBreakdown": [
      {
        "cloneId": "clone-dev-1",
        "cloneName": "dev-1",
        "vhdxSizeGB": 3.5,
        "parentSizeGB": 10.2,
        "savingsGB": 6.7,
        "compressionPercent": 65.7
      }
    ]
  }
}
```

##### GET /api/metrics/operations
Operation success rates and method distribution.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalOperations": 156,
    "successfulOperations": 153,
    "failedOperations": 3,
    "successRatePercent": 98.1,
    "operationsByType": [
      {
        "type": "create-clone",
        "count": 42,
        "successCount": 41,
        "failureCount": 1,
        "successRatePercent": 97.6
      },
      {
        "type": "attach-clone",
        "count": 35,
        "successCount": 35,
        "failureCount": 0,
        "successRatePercent": 100.0
      }
    ],
    "summary": {
      "totalOperations": 156,
      "successRate": 98.1,
      "topOperation": "create-clone",
      "topOperationCount": 42
    }
  }
}
```

##### GET /api/metrics/timeline
Historical timeline data for charts.

**Query Parameters:**
- `hoursBack` (optional, default: 24): Hours to look back (1-8760)
- `groupBy` (optional, default: 'hour'): Group by 'hour' or 'day'

**Response:**
```json
{
  "success": true,
  "data": {
    "cloneCreations": [
      {
        "timestamp": "2026-06-06 10:00",
        "clones": 3
      },
      {
        "timestamp": "2026-06-06 11:00",
        "clones": 2
      }
    ],
    "operations": [
      {
        "timestamp": "2026-06-06 10:00",
        "operations": 7
      }
    ],
    "timelineStart": "2026-06-05T10:30:00Z",
    "timelineEnd": "2026-06-06T10:30:00Z",
    "groupBy": "hour",
    "hoursBack": 24
  }
}
```

##### GET /api/metrics/all
All metrics combined in single request.

Combines data from all endpoints into comprehensive response.

### 3. React Dashboard Component (`src/gui/src/components/Dashboard.tsx`)

Interactive metrics dashboard with visualizations.

#### Features

**Key Metrics Cards**
- Total clones created
- Storage saved (vs original size)
- Average clone creation time
- Operation success rate
- Last 24h activity
- Compression ratio

**Charts**
- Clone Creation Timeline (line/bar chart)
- Storage Breakdown (stacked visualization)
- Method Usage Distribution (bar chart)
- Operation Success Rates (gauge/progress)
- Clone Statistics (summary cards)
- Performance Metrics (timing breakdown)

**Data Table**
- Clone-by-clone storage breakdown
- VHDX sizes and compression ratios

#### Usage

```tsx
import Dashboard from './components/Dashboard';

// In your app
<Dashboard />

// Auto-refreshes every 30 seconds (configurable)
```

#### Configuration

Dashboard refresh interval can be adjusted in-app via the control panel.

## Metrics Collection Strategy

### Data Sources

1. **Clone Metadata**
   - CreatedAt timestamp
   - CompletedAt timestamp
   - Status and state transitions
   - Golden image reference

2. **VHDX File System**
   - VHDX file sizes on disk
   - Parent file size (from metadata)
   - Compression information

3. **Operation Logs**
   - Operation type and timestamp
   - Success/failure status
   - Duration measurements
   - State transitions

### Aggregation Logic

**Creation Time Calculation:**
```
creationTime = completedAt - createdAt
avgTime = sum(creationTimes) / count(creations)
```

**Storage Savings:**
```
savings = parentSize - vhdxActualSize
compressionRatio = savings / parentSize * 100
```

**Success Rate:**
```
successRate = successfulOps / totalOps * 100
```

**Timeline Data:**
Clones and operations grouped by hour or day based on timestamps.

## Testing

### Unit Tests
```powershell
# Run metrics tests
cd C:\flashdb
Invoke-Pester tests/Metrics/Metrics.Tests.ps1
```

### Integration Tests
```powershell
# Requires running API server
Invoke-Pester tests/Integration/Metrics.Integration.Tests.ps1
```

### Manual Testing

**PowerShell:**
```powershell
Import-Module C:\flashdb\src\FlashDB\FlashDB.psm1

# Get all metrics
$metrics = Get-FlashdbMetrics
$metrics | ConvertTo-Json -Depth 10 | Write-Host

# Get specific metrics
$storage = Get-StorageStats
$storage.compressionRatioPercent | Write-Host
```

**API:**
```bash
# Via curl
curl http://localhost:3001/api/metrics/overview
curl http://localhost:3001/api/metrics/clones
curl http://localhost:3001/api/metrics/storage
curl http://localhost:3001/api/metrics/operations
curl "http://localhost:3001/api/metrics/timeline?hoursBack=24&groupBy=hour"
curl http://localhost:3001/api/metrics/all
```

## Performance Considerations

### Optimization

1. **Lazy Loading**: Metrics computed on-demand, not cached
2. **Efficient Queries**: Direct file system access for VHDX sizes
3. **Batch Operations**: Timeline data grouped efficiently
4. **Frontend Caching**: Dashboard caches metrics temporarily

### Expected Response Times

- Overview: < 500ms
- Clone Stats: < 1s
- Storage Stats: < 2s (scales with clone count)
- Operations: < 1s
- Timeline: < 2s
- All Metrics: < 5s

## Future Enhancements

- [ ] Metrics persistence to database
- [ ] Alerting on threshold violations
- [ ] Custom metric calculations
- [ ] Performance trend analysis
- [ ] Cost analysis and reporting
- [ ] Comparative analysis across time periods
- [ ] Export to CSV/Excel
- [ ] Real-time metric streaming

## Error Handling

All endpoints return appropriate HTTP status codes:
- 200: Successful retrieval
- 400: Invalid parameters
- 500: Server error
- Errors include descriptive messages

## See Also

- [Clone Management Guide](CLONES.md)
- [Storage Management Guide](STORAGE.md)
- [API Documentation](API.md)
