# FlashDB Search and Filtering - Usage Examples

This document provides practical examples of using the search and filtering API.

## PowerShell Examples

### Basic Operations Search

```powershell
# Find all backup operations
Search-FlashdbOperations -Keyword "backup"

# Find ready operations
Search-FlashdbOperations -Status "ready"

# Find all BackupRestore operations
Search-FlashdbOperations -Method "BackupRestore"

# Find operations by a specific operator
Search-FlashdbOperations -Operator "admin@company.com"
```

### Date Range Searches

```powershell
# Operations from the last 7 days
$from = (Get-Date).AddDays(-7)
$to = (Get-Date)
Search-FlashdbOperations -DateFrom $from -DateTo $to

# Operations created today
$today = (Get-Date).Date
Search-FlashdbOperations -DateFrom $today -DateTo $today.AddDays(1)

# Operations from a specific month
$start = Get-Date "2026-05-01"
$end = Get-Date "2026-05-31"
Search-FlashdbOperations -DateFrom $start -DateTo $end
```

### Combined Filters

```powershell
# Ready backup operations from the last 30 days
$from = (Get-Date).AddDays(-30)
Search-FlashdbOperations -Status "ready" -Method "BackupRestore" -DateFrom $from

# Failed operations by specific operator
Search-FlashdbOperations -Status "failed" -Operator "admin@company.com"

# Recent replica operations
$from = (Get-Date).AddDays(-7)
Search-FlashdbOperations -Method "ReplicaBackup" -DateFrom $from -SortBy "createdAt" -SortOrder "desc"
```

### Clone Filtering Examples

```powershell
# Find all production clones
Filter-FlashdbClones -GoldenImageId "golden-prod-20260606"

# Find ready development clones
Filter-FlashdbClones -Keyword "dev" -Status "ready"

# Find clones created in the last 30 days
$from = (Get-Date).AddDays(-30)
Filter-FlashdbClones -CreatedFrom $from

# Find largest clones
Filter-FlashdbClones -SortBy "size" -SortOrder "desc" -Limit 10

# Find clones tagged as production and backup
Filter-FlashdbClones -Tags @("production", "backup")
```

### Checkpoint Filtering Examples

```powershell
# Find all completed checkpoints for a specific clone
Filter-FlashdbCheckpoints -CloneId "clone-dev-001" -Phase "complete"

# Find recent failed checkpoints
$from = (Get-Date).AddDays(-7)
Filter-FlashdbCheckpoints -Phase "failed" -CreatedFrom $from

# Find checkpoints by keyword
Filter-FlashdbCheckpoints -Keyword "production"

# Get latest 10 checkpoints
Filter-FlashdbCheckpoints -Limit 10 -SortBy "createdAt" -SortOrder "desc"
```

### Pagination Examples

```powershell
# Get first page (20 results per page)
$page1 = Filter-FlashdbClones -Limit 20 -Offset 0

# Get second page
$page2 = Filter-FlashdbClones -Limit 20 -Offset 20

# Get third page
$page3 = Filter-FlashdbClones -Limit 20 -Offset 40

# Get last page (with fewer than 20 results)
$lastPage = Filter-FlashdbClones -Limit 20 -Offset 80
```

### Regex Pattern Examples

```powershell
# Find operations starting with "op-"
Search-FlashdbOperations -Keyword "^op-" -UseRegex $true

# Find operations with timestamp pattern (YYYY-MM-DD)
Search-FlashdbOperations -Keyword "\d{4}-\d{2}-\d{2}" -UseRegex $true

# Find clones with specific naming pattern
Filter-FlashdbClones -Keyword "^clone-(dev|qa|prod)-\d+" -UseRegex $true

# Find checkpoints with "backup" in name (case variations)
Filter-FlashdbCheckpoints -Keyword "[Bb]ackup" -UseRegex $true
```

### Autocomplete Suggestions

```powershell
# Get clone name suggestions
Get-FlashdbSearchSuggestions -Query "dev" -Type "clone"

# Get golden image suggestions
Get-FlashdbSearchSuggestions -Query "prod" -Type "golden-image"

# Get all suggestions
Get-FlashdbSearchSuggestions -Query "backup" -Type "all" -Limit 10
```

---

## REST API Examples

### cURL Examples

#### Search Operations

```bash
# Find backup operations
curl -X POST http://localhost:3001/api/search/operations \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "backup",
    "limit": 100
  }'

# Find ready operations from last 7 days
curl -X POST http://localhost:3001/api/search/operations \
  -H "Content-Type: application/json" \
  -d '{
    "status": "ready",
    "dateFrom": "'$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)'",
    "dateTo": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "limit": 50
  }'

# Find operations by specific operator
curl -X POST http://localhost:3001/api/search/operations \
  -H "Content-Type: application/json" \
  -d '{
    "operator": "admin@company.com",
    "sortBy": "createdAt",
    "sortOrder": "desc"
  }'
```

#### Search Clones

```bash
# Find production clones
curl -X POST http://localhost:3001/api/search/clones \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "prod",
    "status": "ready"
  }'

# Find clones by golden image
curl -X POST http://localhost:3001/api/search/clones \
  -H "Content-Type: application/json" \
  -d '{
    "goldenImageId": "golden-prod-20260606",
    "status": "ready",
    "limit": 20
  }'

# Paginated clone listing (20 per page)
curl -X POST http://localhost:3001/api/search/clones \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 20,
    "offset": 0,
    "sortBy": "createdAt",
    "sortOrder": "desc"
  }'
```

#### Search Checkpoints

```bash
# Find completed checkpoints for a clone
curl -X POST http://localhost:3001/api/search/checkpoints \
  -H "Content-Type: application/json" \
  -d '{
    "cloneId": "clone-dev-001",
    "phase": "complete"
  }'

# Find failed checkpoints from last 7 days
curl -X POST http://localhost:3001/api/search/checkpoints \
  -H "Content-Type: application/json" \
  -d '{
    "phase": "failed",
    "createdFrom": "'$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)'",
    "createdTo": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"
  }'
```

#### Get Suggestions

```bash
# Get clone suggestions
curl -X GET "http://localhost:3001/api/search/suggestions?q=dev&type=clone&limit=10"

# Get all suggestions
curl -X GET "http://localhost:3001/api/search/suggestions?q=prod&type=all&limit=20"
```

#### Advanced Search

```bash
# Search across all entity types
curl -X POST http://localhost:3001/api/search/advanced \
  -H "Content-Type: application/json" \
  -d '{
    "keyword": "backup",
    "searchIn": ["operations", "clones", "checkpoints"],
    "limit": 50
  }'
```

### JavaScript/Node.js Examples

```javascript
// Search for operations
async function searchOperations() {
  const response = await fetch('http://localhost:3001/api/search/operations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyword: 'backup',
      status: 'ready',
      limit: 100
    })
  });
  const data = await response.json();
  console.log(data.data);
}

// Search for clones with pagination
async function searchClones(page = 0, pageSize = 20) {
  const response = await fetch('http://localhost:3001/api/search/clones', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      limit: pageSize,
      offset: page * pageSize,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    })
  });
  return response.json();
}

// Get autocomplete suggestions
async function getSearchSuggestions(query, type = 'all') {
  const params = new URLSearchParams({
    q: query,
    type: type,
    limit: 10
  });
  const response = await fetch(`http://localhost:3001/api/search/suggestions?${params}`);
  return response.json();
}

// Advanced cross-entity search
async function advancedSearch(keyword, entityTypes = ['operations', 'clones', 'checkpoints']) {
  const response = await fetch('http://localhost:3001/api/search/advanced', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keyword: keyword,
      searchIn: entityTypes,
      limit: 50
    })
  });
  return response.json();
}
```

### Python Examples

```python
import requests
from datetime import datetime, timedelta
import json

BASE_URL = 'http://localhost:3001/api/search'

# Search operations
def search_operations(keyword=None, status=None, method=None, limit=100):
    payload = {
        'keyword': keyword,
        'status': status,
        'method': method,
        'limit': limit
    }
    payload = {k: v for k, v in payload.items() if v is not None}
    
    response = requests.post(f'{BASE_URL}/operations', json=payload)
    return response.json()

# Search clones with date range
def search_clones_by_date(days_ago=30, status='ready'):
    now = datetime.utcnow()
    from_date = (now - timedelta(days=days_ago)).isoformat() + 'Z'
    to_date = now.isoformat() + 'Z'
    
    payload = {
        'createdFrom': from_date,
        'createdTo': to_date,
        'status': status
    }
    
    response = requests.post(f'{BASE_URL}/clones', json=payload)
    return response.json()

# Paginated search
def search_clones_paginated(page=0, page_size=20):
    offset = page * page_size
    payload = {
        'limit': page_size,
        'offset': offset,
        'sortBy': 'createdAt',
        'sortOrder': 'desc'
    }
    
    response = requests.post(f'{BASE_URL}/clones', json=payload)
    return response.json()

# Get autocomplete suggestions
def get_suggestions(query, entity_type='all'):
    response = requests.get(
        f'{BASE_URL}/suggestions',
        params={'q': query, 'type': entity_type, 'limit': 10}
    )
    return response.json()

# Usage
if __name__ == '__main__':
    # Search for failed operations
    failed_ops = search_operations(status='failed')
    print(json.dumps(failed_ops, indent=2))
    
    # Search clones from last 7 days
    recent_clones = search_clones_by_date(days_ago=7)
    print(f"Found {len(recent_clones['data'])} clones")
    
    # Get suggestions for autocomplete
    suggestions = get_suggestions('prod', 'clone')
    print(f"Suggestions: {suggestions['data']}")
```

---

## Real-World Scenarios

### Dashboard Use Cases

#### Clone Overview Dashboard
```powershell
# Get clone statistics for dashboard
$allClones = Filter-FlashdbClones -Limit 1000
$readyClones = Filter-FlashdbClones -Status "ready"
$attachedClones = Filter-FlashdbClones -Status "attached"
$failedClones = Filter-FlashdbClones -Status "failed"

@{
    Total = $allClones.Count
    Ready = $readyClones.Count
    Attached = $attachedClones.Count
    Failed = $failedClones.Count
} | ConvertTo-Json
```

#### Operation History
```powershell
# Get last 30 days of operations
$from = (Get-Date).AddDays(-30)
$to = (Get-Date)
$operations = Search-FlashdbOperations -DateFrom $from -DateTo $to -Limit 1000

# Group by method
$byMethod = $operations | Group-Object -Property method | Select-Object Name, Count
$byMethod | ConvertTo-Json
```

#### Audit Log Search
```powershell
# Find operations by specific users in date range
$operators = @("admin@company.com", "backup@company.com")
$from = (Get-Date).AddDays(-90)

foreach ($op in $operators) {
    $results = Search-FlashdbOperations -Operator $op -DateFrom $from
    Write-Host "$op: $($results.Count) operations"
}
```

### Troubleshooting Use Cases

#### Find Failed Operations
```powershell
# Find recent failures
$from = (Get-Date).AddHours(-24)
$failed = Search-FlashdbOperations -Status "failed" -DateFrom $from
$failed | Select-Object id, name, createdAt | Format-Table
```

#### Checkpoint Recovery
```powershell
# Find completed checkpoints for rollback
$checkpoints = Filter-FlashdbCheckpoints -CloneId "clone-dev-001" -Phase "complete"
$checkpoints | Select-Object name, createdAt | Format-Table

# Get latest checkpoint
$latest = $checkpoints | Sort-Object createdAt -Descending | Select-Object -First 1
```

#### Clone Cleanup
```powershell
# Find orphaned clones older than 60 days
$oldDate = (Get-Date).AddDays(-60)
$orphaned = Filter-FlashdbClones -Status "orphaned" -CreatedTo $oldDate
$orphaned | Select-Object name, createdAt, size
```

---

## Performance Tips

1. **Use Specific Filters**: Narrower queries are faster
   - `Filter-FlashdbClones -Status "ready"` (faster)
   - `Filter-FlashdbClones -Keyword "prod"` (slower, searches multiple fields)

2. **Limit Results**: Always use reasonable limit values
   ```powershell
   # Good
   Filter-FlashdbClones -Limit 100 -Offset 0
   
   # Less efficient
   Filter-FlashdbClones -Limit 10000
   ```

3. **Date Ranges**: Narrow date ranges improve performance
   ```powershell
   # Efficient
   $from = (Get-Date).AddDays(-7)
   Search-FlashdbOperations -DateFrom $from -DateTo (Get-Date)
   
   # Less efficient (searches full history)
   Search-FlashdbOperations -Keyword "backup"
   ```

4. **Pagination**: For large result sets, paginate instead of loading all
   ```powershell
   # First page
   $p1 = Filter-FlashdbClones -Limit 50 -Offset 0
   
   # Second page
   $p2 = Filter-FlashdbClones -Limit 50 -Offset 50
   ```
