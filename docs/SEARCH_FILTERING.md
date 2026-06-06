# FlashDB Search and Filtering

## Overview

The FlashDB Search and Filtering system provides powerful query capabilities for operations, clones, and checkpoints. It supports full-text search, date range filtering, status filtering, regex patterns, pagination, and advanced multi-criteria searches.

## PowerShell API

### Search-FlashdbOperations

Searches through operation logs with advanced filtering.

**Parameters:**
- `Keyword` - Search keyword (full-text, case-insensitive)
- `DateFrom` - Start date for date range filtering
- `DateTo` - End date for date range filtering
- `Status` - Operation status: ready, attached, detached, failed, in-progress
- `Method` - Operation method: BackupRestore, ReplicaBackup, TableByTableCopy
- `Operator` - Filter by operator/user email
- `Limit` - Results per page (default: 100, max: 1000)
- `Offset` - Skip N results for pagination (default: 0)
- `SortBy` - Sort field: createdAt, updatedAt, name, status (default: createdAt)
- `SortOrder` - Sort direction: asc, desc (default: desc)
- `UseRegex` - Use regex pattern matching instead of literal match (default: false)

**Examples:**

```powershell
# Search by keyword
Search-FlashdbOperations -Keyword "backup"

# Filter by date range
$from = (Get-Date).AddDays(-7)
$to = (Get-Date)
Search-FlashdbOperations -DateFrom $from -DateTo $to -Status "ready"

# Search with regex
Search-FlashdbOperations -Keyword "^op-[a-z]+" -UseRegex $true

# Complex filter
Search-FlashdbOperations -Status "ready" -Method "BackupRestore" -Operator "admin@company.com" -Limit 50
```

**Output:**
Returns array of operation objects with:
- id, name, description
- status, method, operator
- createdAt, updatedAt
- Additional operation-specific fields

---

### Filter-FlashdbClones

Searches and filters clone metadata with advanced options.

**Parameters:**
- `Keyword` - Search clone name, description, or ID
- `GoldenImageId` - Filter clones from specific golden image
- `Status` - Clone status: ready, attached, detached, failed, orphaned
- `CreatedFrom` - Start date for creation date filtering
- `CreatedTo` - End date for creation date filtering
- `Tags` - Array of tags (all must be present)
- `Limit` - Results per page (default: 100, max: 1000)
- `Offset` - Skip N results for pagination (default: 0)
- `SortBy` - Sort field: createdAt, updatedAt, name, size (default: createdAt)
- `SortOrder` - Sort direction: asc, desc (default: desc)
- `UseRegex` - Use regex pattern matching (default: false)

**Examples:**

```powershell
# Find all production clones
Filter-FlashdbClones -GoldenImageId "golden-prod-20260606" -Status "ready"

# Search by tags
Filter-FlashdbClones -Tags @("production", "backup")

# Date range + keyword
$from = (Get-Date).AddDays(-30)
Filter-FlashdbClones -Keyword "prod" -CreatedFrom $from -SortBy "size" -SortOrder "desc"

# Paginated results
Filter-FlashdbClones -Limit 20 -Offset 40
```

**Output:**
Returns array of clone objects with:
- id, name, description, goldenImageId
- status, createdAt, updatedAt
- size, vhdxPath
- tags

---

### Filter-FlashdbCheckpoints

Searches checkpoint metadata with filtering and pagination.

**Parameters:**
- `Keyword` - Search checkpoint name, description, or ID
- `CloneId` - Filter checkpoints for specific clone
- `Phase` - Checkpoint phase: initial, in-progress, complete, reverted, failed
- `CreatedFrom` - Start date for creation date filtering
- `CreatedTo` - End date for creation date filtering
- `Limit` - Results per page (default: 100, max: 1000)
- `Offset` - Skip N results for pagination (default: 0)
- `SortBy` - Sort field: createdAt, name, cloneId, phase (default: createdAt)
- `SortOrder` - Sort direction: asc, desc (default: desc)
- `UseRegex` - Use regex pattern matching (default: false)

**Examples:**

```powershell
# Find all completed checkpoints for a clone
Filter-FlashdbCheckpoints -CloneId "clone-dev-001" -Phase "complete"

# Recent failed checkpoints
$from = (Get-Date).AddDays(-7)
Filter-FlashdbCheckpoints -Phase "failed" -CreatedFrom $from

# Sort by creation with pagination
Filter-FlashdbCheckpoints -SortBy "createdAt" -SortOrder "desc" -Limit 10
```

**Output:**
Returns array of checkpoint objects with:
- id, name, description, cloneId
- phase, createdAt
- vhdxPath, sizeGB
- Additional checkpoint metadata

---

### Get-FlashdbSearchSuggestions

Returns autocomplete suggestions for clone and golden image names.

**Parameters:**
- `Query` - Partial name to search for (required)
- `Type` - Search type: clone, golden-image, all (default: all)
- `Limit` - Maximum suggestions (default: 20, max: 100)

**Examples:**

```powershell
# Get clone suggestions
Get-FlashdbSearchSuggestions -Query "dev" -Type "clone"

# Get suggestions from all types
Get-FlashdbSearchSuggestions -Query "prod" -Limit 10
```

**Output:**
Returns array of suggestion strings (unique, sorted alphabetically)

---

## REST API Endpoints

### POST /api/search/operations

Search operation logs.

**Request Body:**
```json
{
  "keyword": "backup",
  "dateFrom": "2026-05-30T00:00:00Z",
  "dateTo": "2026-06-06T23:59:59Z",
  "status": "ready",
  "method": "BackupRestore",
  "operator": "admin@company.com",
  "limit": 100,
  "offset": 0,
  "sortBy": "createdAt",
  "sortOrder": "desc",
  "useRegex": false
}
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 42,
    "limit": 100,
    "offset": 0
  },
  "filters": {...}
}
```

---

### POST /api/search/clones

Search clones.

**Request Body:**
```json
{
  "keyword": "prod",
  "goldenImageId": "golden-prod-20260606",
  "status": "ready",
  "createdFrom": "2026-05-01T00:00:00Z",
  "createdTo": "2026-06-06T23:59:59Z",
  "tags": ["production", "backup"],
  "limit": 100,
  "offset": 0,
  "sortBy": "createdAt",
  "sortOrder": "desc",
  "useRegex": false
}
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 15,
    "limit": 100,
    "offset": 0
  },
  "filters": {...}
}
```

---

### POST /api/search/checkpoints

Search checkpoints.

**Request Body:**
```json
{
  "keyword": "complete",
  "cloneId": "clone-dev-001",
  "phase": "complete",
  "createdFrom": "2026-05-01T00:00:00Z",
  "createdTo": "2026-06-06T23:59:59Z",
  "limit": 100,
  "offset": 0,
  "sortBy": "createdAt",
  "sortOrder": "desc",
  "useRegex": false
}
```

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 8,
    "limit": 100,
    "offset": 0
  },
  "filters": {...}
}
```

---

### GET /api/search/suggestions

Get autocomplete suggestions.

**Query Parameters:**
- `q` - Search query (required)
- `type` - Type to search: clone, golden-image, all (default: all)
- `limit` - Maximum suggestions (default: 20, max: 100)

**Example:** `GET /api/search/suggestions?q=prod&type=clone&limit=10`

**Response:**
```json
{
  "success": true,
  "data": ["prod-backup-1", "prod-clone-2", "prod-database-1"],
  "query": "prod",
  "type": "clone",
  "count": 3
}
```

---

### POST /api/search/advanced

Advanced combined search across operations, clones, and checkpoints.

**Request Body:**
```json
{
  "keyword": "backup",
  "searchIn": ["operations", "clones", "checkpoints"],
  "dateFrom": "2026-05-01T00:00:00Z",
  "dateTo": "2026-06-06T23:59:59Z",
  "limit": 50,
  "offset": 0
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "operations": [...],
    "clones": [...],
    "checkpoints": [...]
  },
  "summary": {
    "operationCount": 5,
    "cloneCount": 8,
    "checkpointCount": 3,
    "totalResults": 16
  },
  "keyword": "backup",
  "searchIn": ["operations", "clones", "checkpoints"]
}
```

---

## Search Features

### Full-Text Search
- Searches across multiple fields (name, description, id, details)
- Case-insensitive matching
- Supports wildcard patterns with `*`

### Date Range Filtering
- Supports ISO 8601 format timestamps
- Both `from` and `to` are optional
- Inclusive boundaries (greater-than-or-equal, less-than-or-equal)

### Status Filtering
Operations: ready, attached, detached, failed, in-progress
Clones: ready, attached, detached, failed, orphaned
Checkpoints: initial, in-progress, complete, reverted, failed

### Method Filtering
- BackupRestore: SQL Server backup/restore approach
- ReplicaBackup: AlwaysOn replica-based approach
- TableByTableCopy: Table-by-table copy approach

### Regex Patterns
Enable with `useRegex: true` to use regex patterns:
```powershell
# Find operations starting with "op-"
Search-FlashdbOperations -Keyword "^op-" -UseRegex $true

# Find clones with timestamp pattern
Filter-FlashdbClones -Keyword "clone-\d{4}-\d{2}-\d{2}" -UseRegex $true
```

### Tag-Based Filtering
Filter clones by tags (all specified tags must be present):
```powershell
# Find clones tagged as both production AND backup
Filter-FlashdbClones -Tags @("production", "backup")
```

### Sorting
Available sort fields vary by entity:
- **Ascending**: oldest first, A-Z
- **Descending**: newest first, Z-A

### Pagination
- Results are sorted before pagination is applied
- Maximum 1000 results per page
- Use `offset` to skip results for next page

---

## Performance Considerations

1. **Memory-Based Filtering**: Current implementation loads metadata files into memory
2. **Large Datasets**: For very large numbers of operations, consider:
   - Using narrower date ranges
   - Filtering by status or method first
   - Using pagination with reasonable limits
3. **Regex Performance**: Complex regex patterns may be slower on large datasets

---

## Implementation Files

- **PowerShell Module**: `src/FlashDB/Core/SearchEngine.ps1` (~350 lines)
  - Search-FlashdbOperations
  - Filter-FlashdbClones
  - Filter-FlashdbCheckpoints
  - Get-FlashdbSearchSuggestions

- **API Routes**: `src/api/src/routes/search.ts` (~400 lines)
  - POST /api/search/operations
  - POST /api/search/clones
  - POST /api/search/checkpoints
  - GET /api/search/suggestions
  - POST /api/search/advanced

- **Tests**: `tests/Unit/SearchEngine.Tests.ps1` (~400 lines)
  - Comprehensive unit tests for all search functions
  - Tests for filtering, sorting, pagination, regex
  - Edge case and performance tests

---

## Future Enhancements

1. **Indexing**: Add HNSW or similar indexing for faster searches
2. **Query Caching**: Cache frequently used searches
3. **Advanced Filtering**: Support for complex boolean queries (AND, OR, NOT)
4. **Search Analytics**: Track popular searches and optimize accordingly
5. **Fuzzy Matching**: Handle typos in search terms
6. **Field-Specific Search**: Allow searching specific fields only
7. **Search History**: Track and suggest previous searches

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "message": "Error description"
}
```

Common errors:
- 400: Invalid parameters (limit out of range, invalid status, etc.)
- 500: Search execution failed
- 404: No results found (returns empty array, not an error)

---

## Examples

### Find all failed operations from last week
```powershell
$from = (Get-Date).AddDays(-7)
Search-FlashdbOperations -Status "failed" -DateFrom $from
```

### Get paginated clone list sorted by size
```powershell
Filter-FlashdbClones -Limit 20 -Offset 0 -SortBy "size" -SortOrder "desc"
```

### Advanced search across all entities
```
POST /api/search/advanced
{
  "keyword": "backup",
  "searchIn": ["operations", "clones", "checkpoints"],
  "limit": 50
}
```

### Get suggestions for UI autocomplete
```
GET /api/search/suggestions?q=prod&type=clone&limit=10
```
