# FlashDB API Reference

## Overview

This document provides a complete reference for the FlashDB REST API endpoints, including request/response formats, error codes, and usage examples.

**Base URL:** `http://localhost:3001/api`

**API Version:** 1.0.0

## Authentication

Currently, FlashDB API operates without authentication (assumes trusted network). Future versions will support JWT token-based authentication.

```
Authorization: Bearer <token>
```

## Common Response Format

All API responses follow a standard format:

**Success Response (2xx):**
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

**Error Response (4xx, 5xx):**
```json
{
  "success": false,
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

## HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET/PUT request |
| 201 | Created | Successful POST request |
| 204 | No Content | Successful DELETE request |
| 400 | Bad Request | Invalid parameters |
| 404 | Not Found | Resource not found |
| 500 | Server Error | Internal server error |

## Endpoints

### Health Check

#### GET /health

Check if the API server is running and healthy.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-06-06T14:32:00Z"
}
```

**Example:**
```bash
curl http://localhost:3001/health
```

---

## Golden Images API

### List Golden Images

#### GET /golden-images

Retrieve all available golden images.

**Query Parameters:** None

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "golden-prod-20260606",
      "name": "prod-20260606",
      "version": "1.0.0",
      "path": "E:\\FlashDB\\GoldenImages\\prod.vhdx",
      "sizeBytes": 107374182400,
      "createdAt": "2026-06-06T14:32:00Z",
      "createdBy": "admin",
      "method": "BackupRestore",
      "verificationStatus": "verified",
      "metadata": {}
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:3001/api/golden-images
```

---

### Create Golden Image

#### POST /golden-images

Create a new golden image from backup, replica, or table-by-table copy.

**Request Body:**
```json
{
  "name": "prod-20260606",
  "version": "1.0.0",
  "method": "BackupRestore",
  "outputPath": "E:\\FlashDB\\GoldenImages\\prod-20260606.vhdx",
  "backupFile": "C:\\Backups\\production-20260605.bak",
  "sourceConnection": "Server=sql-prod;Database=master;",
  "compress": true,
  "verifyRowCounts": true
}
```

**Required Fields:**
- `name`: Golden image name
- `version`: Version identifier
- `method`: "BackupRestore", "ReplicaBackup", or "TableByTableCopy"
- `outputPath`: VHDX output file path

**Optional Fields:**
- `backupFile`: Backup file path (for BackupRestore method)
- `sourceConnection`: SQL Server connection string (for ReplicaBackup)
- `compress`: Enable VHDX compression (default: false)
- `verifyRowCounts`: Verify data integrity (default: false)

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "golden-prod-20260606",
    "name": "prod-20260606",
    "version": "1.0.0",
    "createdAt": "2026-06-06T14:32:00Z",
    "createdBy": "admin",
    "sizeBytes": 107374182400,
    "method": "BackupRestore",
    "verificationStatus": "pending"
  },
  "message": "Golden image created successfully"
}
```

**Errors:**
- `400 Bad Request`: Missing required fields or invalid method
- `404 Not Found`: Backup file or source connection not available

**Example:**
```bash
curl -X POST http://localhost:3001/api/golden-images \
  -H "Content-Type: application/json" \
  -d '{
    "name": "prod-20260606",
    "version": "1.0.0",
    "method": "BackupRestore",
    "outputPath": "E:\\\\FlashDB\\\\GoldenImages\\\\prod-20260606.vhdx",
    "backupFile": "C:\\\\Backups\\\\prod.bak"
  }'
```

---

### Get Golden Image

#### GET /golden-images/{imageId}

Retrieve details of a specific golden image.

**Path Parameters:**
- `imageId` (string): Golden image ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "golden-prod-20260606",
    "name": "prod-20260606",
    "version": "1.0.0",
    "path": "E:\\FlashDB\\GoldenImages\\prod.vhdx",
    "sizeBytes": 107374182400,
    "createdAt": "2026-06-06T14:32:00Z",
    "createdBy": "admin",
    "method": "BackupRestore",
    "verificationStatus": "verified",
    "metadata": {}
  }
}
```

**Errors:**
- `404 Not Found`: Golden image not found

**Example:**
```bash
curl http://localhost:3001/api/golden-images/golden-prod-20260606
```

---

### Delete Golden Image

#### DELETE /golden-images/{imageId}

Delete a golden image (only if no clones exist).

**Path Parameters:**
- `imageId` (string): Golden image ID

**Response (200):**
```json
{
  "success": true,
  "message": "Golden image deleted successfully"
}
```

**Errors:**
- `400 Bad Request`: Clones exist for this golden image
- `404 Not Found`: Golden image not found

**Example:**
```bash
curl -X DELETE http://localhost:3001/api/golden-images/golden-prod-20260606
```

---

## Clones API

### List Clones

#### GET /clones

Retrieve all database clones.

**Query Parameters:**
- `limit` (integer, optional): Max results (default: 50)
- `offset` (integer, optional): Pagination offset (default: 0)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "clone-test-001",
      "name": "test-clone-001",
      "goldenImageId": "golden-prod-20260606",
      "status": "ready",
      "sizeBytes": 5368709120,
      "createdAt": "2026-06-06T14:32:00Z",
      "createdBy": "developer",
      "lastModified": "2026-06-06T14:35:00Z",
      "checkpointCount": 3,
      "metadata": {}
    }
  ]
}
```

**Example:**
```bash
curl "http://localhost:3001/api/clones?limit=20&offset=0"
```

---

### Create Clone

#### POST /clones

Create a new clone from a golden image.

**Request Body:**
```json
{
  "name": "test-clone-001",
  "goldenImageId": "golden-prod-20260606",
  "compress": false
}
```

**Required Fields:**
- `name`: Clone name
- `goldenImageId`: Source golden image ID

**Optional Fields:**
- `compress`: Enable compression (default: false)

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "clone-test-001",
    "name": "test-clone-001",
    "goldenImageId": "golden-prod-20260606",
    "status": "ready",
    "sizeBytes": 5368709120,
    "createdAt": "2026-06-06T14:32:00Z",
    "createdBy": "developer",
    "checkpointCount": 0,
    "metadata": {}
  },
  "message": "Clone created successfully"
}
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/clones \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-clone-001",
    "goldenImageId": "golden-prod-20260606"
  }'
```

---

### Get Clone

#### GET /clones/{cloneId}

Retrieve details of a specific clone.

**Path Parameters:**
- `cloneId` (string): Clone ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "clone-test-001",
    "name": "test-clone-001",
    "goldenImageId": "golden-prod-20260606",
    "status": "ready",
    "sizeBytes": 5368709120,
    "createdAt": "2026-06-06T14:32:00Z",
    "createdBy": "developer",
    "lastModified": "2026-06-06T14:35:00Z",
    "checkpointCount": 3,
    "metadata": {}
  }
}
```

**Example:**
```bash
curl http://localhost:3001/api/clones/clone-test-001
```

---

### Delete Clone

#### DELETE /clones/{cloneId}

Delete a clone and free its storage.

**Path Parameters:**
- `cloneId` (string): Clone ID

**Response (200):**
```json
{
  "success": true,
  "message": "Clone deleted successfully"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:3001/api/clones/clone-test-001
```

---

## Checkpoints API

### List Checkpoints

#### GET /clones/{cloneId}/checkpoints

List all checkpoints for a clone.

**Path Parameters:**
- `cloneId` (string): Clone ID

**Query Parameters:**
- `limit` (integer, optional): Max results (default: 50)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "checkpoint-001",
      "cloneId": "clone-test-001",
      "name": "baseline",
      "description": "Initial state before testing",
      "createdAt": "2026-06-06T14:32:00Z",
      "createdBy": "developer",
      "sizeBytes": 2147483648,
      "metadata": {}
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:3001/api/clones/clone-test-001/checkpoints
```

---

### Create Checkpoint

#### POST /clones/{cloneId}/checkpoints

Create a checkpoint of clone's current state.

**Path Parameters:**
- `cloneId` (string): Clone ID

**Request Body:**
```json
{
  "name": "before-migration",
  "description": "State before schema migration"
}
```

**Required Fields:**
- `name`: Checkpoint name

**Optional Fields:**
- `description`: Checkpoint description

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "checkpoint-002",
    "cloneId": "clone-test-001",
    "name": "before-migration",
    "description": "State before schema migration",
    "createdAt": "2026-06-06T14:35:00Z",
    "createdBy": "developer",
    "sizeBytes": 2147483648,
    "metadata": {}
  },
  "message": "Checkpoint created successfully"
}
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/clones/clone-test-001/checkpoints \
  -H "Content-Type: application/json" \
  -d '{
    "name": "before-migration",
    "description": "State before schema migration"
  }'
```

---

### Get Checkpoint

#### GET /clones/{cloneId}/checkpoints/{checkpointId}

Retrieve details of a specific checkpoint.

**Path Parameters:**
- `cloneId` (string): Clone ID
- `checkpointId` (string): Checkpoint ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "checkpoint-001",
    "cloneId": "clone-test-001",
    "name": "baseline",
    "description": "Initial state",
    "createdAt": "2026-06-06T14:32:00Z",
    "createdBy": "developer",
    "sizeBytes": 2147483648,
    "metadata": {}
  }
}
```

**Example:**
```bash
curl http://localhost:3001/api/clones/clone-test-001/checkpoints/checkpoint-001
```

---

### Restore Checkpoint

#### POST /clones/{cloneId}/checkpoints/{checkpointId}

Restore clone to a checkpoint state.

**Path Parameters:**
- `cloneId` (string): Clone ID
- `checkpointId` (string): Checkpoint ID

**Response (200):**
```json
{
  "success": true,
  "message": "Checkpoint restored successfully"
}
```

**Example:**
```bash
curl -X POST http://localhost:3001/api/clones/clone-test-001/checkpoints/checkpoint-001
```

---

### Delete Checkpoint

#### DELETE /clones/{cloneId}/checkpoints/{checkpointId}

Delete a checkpoint.

**Path Parameters:**
- `cloneId` (string): Clone ID
- `checkpointId` (string): Checkpoint ID

**Response (200):**
```json
{
  "success": true,
  "message": "Checkpoint deleted successfully"
}
```

**Example:**
```bash
curl -X DELETE http://localhost:3001/api/clones/clone-test-001/checkpoints/checkpoint-001
```

---

## Search API

### Search Operations

#### GET /search/operations

Search recent operations with filters.

**Query Parameters:**
- `query` (string, optional): Search query
- `status` (string, optional): Filter by status (pending, running, completed, failed)
- `limit` (integer, optional): Max results (default: 50)
- `offset` (integer, optional): Pagination offset (default: 0)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "op-001",
      "type": "create-clone",
      "target": "test-clone-001",
      "status": "completed",
      "startedAt": "2026-06-06T14:32:00Z",
      "completedAt": "2026-06-06T14:32:05Z",
      "duration": 5000
    }
  ],
  "total": 1
}
```

**Example:**
```bash
curl "http://localhost:3001/api/search/operations?status=completed&limit=20"
```

---

### Search Clones

#### GET /search/clones

Search for clones.

**Query Parameters:**
- `query` (string, optional): Clone name or ID
- `status` (string, optional): Clone status
- `limit` (integer, optional): Max results

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "clone-test-001",
      "name": "test-clone-001",
      "goldenImageId": "golden-prod-20260606",
      "status": "ready",
      "sizeBytes": 5368709120,
      "createdAt": "2026-06-06T14:32:00Z"
    }
  ]
}
```

**Example:**
```bash
curl "http://localhost:3001/api/search/clones?query=test&status=ready"
```

---

### Advanced Search

#### POST /search/advanced

Execute advanced search with complex filters.

**Request Body:**
```json
{
  "filters": [
    {
      "field": "name",
      "operator": "contains",
      "value": "test"
    },
    {
      "field": "status",
      "operator": "equals",
      "value": "ready"
    }
  ],
  "sort": [
    {
      "field": "createdAt",
      "direction": "desc"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

**Response (200):**
```json
{
  "success": true,
  "data": [ ... ],
  "facets": {
    "status": {"ready": 10, "creating": 2},
    "goldenImage": {"prod": 8, "qa": 4}
  }
}
```

---

## Batch Operations API

### List Batch Operations

#### GET /batches

List all batch operations.

**Query Parameters:**
- `status` (string, optional): Filter by status
- `limit` (integer, optional): Max results

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "batch-001",
      "name": "Create QA Clones",
      "type": "create-clones",
      "status": "completed",
      "itemCount": 10,
      "completedCount": 10,
      "failedCount": 0,
      "createdAt": "2026-06-06T14:32:00Z",
      "completedAt": "2026-06-06T14:32:30Z"
    }
  ]
}
```

---

### Create Batch Operation

#### POST /batches

Create a new batch operation.

**Request Body:**
```json
{
  "name": "Create QA Clones",
  "type": "create-clones",
  "items": [
    {"name": "qa-clone-001", "goldenImageId": "golden-prod"},
    {"name": "qa-clone-002", "goldenImageId": "golden-prod"}
  ],
  "options": {
    "compress": false
  }
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "batch-001",
    "name": "Create QA Clones",
    "type": "create-clones",
    "status": "pending",
    "itemCount": 2,
    "completedCount": 0,
    "failedCount": 0,
    "createdAt": "2026-06-06T14:32:00Z"
  }
}
```

---

### Get Batch Status

#### GET /batches/{batchId}

Get batch operation status.

**Path Parameters:**
- `batchId` (string): Batch ID

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "batch-001",
    "name": "Create QA Clones",
    "type": "create-clones",
    "status": "running",
    "itemCount": 10,
    "completedCount": 5,
    "failedCount": 0,
    "createdAt": "2026-06-06T14:32:00Z"
  }
}
```

---

### Get Batch Results

#### GET /batches/{batchId}/results

Get results of completed batch operation.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "itemId": "qa-clone-001",
      "status": "success",
      "message": "Clone created",
      "duration": 3000
    },
    {
      "itemId": "qa-clone-002",
      "status": "success",
      "message": "Clone created",
      "duration": 2800
    }
  ]
}
```

---

## Metrics API

### Get Metrics Overview

#### GET /metrics/overview

Get high-level system metrics.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalClones": 45,
    "totalGoldenImages": 3,
    "totalCheckpoints": 128,
    "totalStorageBytes": 539622400,
    "usedStorageBytes": 425984000,
    "operationsInProgress": 2,
    "averageCloneCreationTime": 3200
  }
}
```

---

### Get Clone Metrics

#### GET /metrics/clones

Get metrics for all clones.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "cloneId": "clone-test-001",
      "cloneName": "test-clone-001",
      "sizeBytes": 5368709120,
      "checkpointCount": 3,
      "lastModified": "2026-06-06T14:35:00Z",
      "accessCount": 45
    }
  ]
}
```

---

### Get Storage Metrics

#### GET /metrics/storage

Get storage usage metrics.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalCapacity": 1099511627776,
    "usedCapacity": 539622400,
    "availableCapacity": 1098972005376,
    "usagePercent": 49.08,
    "byCategory": {
      "goldenImages": 300000000000,
      "clones": 200000000000,
      "checkpoints": 39622400
    }
  }
}
```

---

### Get Operation Metrics

#### GET /metrics/operations

Get operation performance metrics.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalOperations": 1234,
    "successfulOperations": 1210,
    "failedOperations": 24,
    "averageOperationTime": 3500,
    "byType": {
      "create-clone": {"count": 500, "avgTime": 3200},
      "delete-clone": {"count": 300, "avgTime": 2500},
      "restore-checkpoint": {"count": 434, "avgTime": 4100}
    }
  }
}
```

---

## Error Codes

| Code | Status | Description |
|------|--------|-------------|
| INVALID_REQUEST | 400 | Request validation failed |
| RESOURCE_NOT_FOUND | 404 | Requested resource not found |
| OPERATION_TIMEOUT | 408 | Operation exceeded timeout |
| INSUFFICIENT_STORAGE | 507 | Not enough storage available |
| INTERNAL_ERROR | 500 | Server error |

## Rate Limiting

Currently no rate limiting is implemented. Future versions will include rate limiting with the following headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1234567890
```

## Pagination

List endpoints support pagination via `limit` and `offset`:

```
GET /clones?limit=20&offset=40
```

Returns items 40-60 (second page of 20 items each).

## Timestamps

All timestamps are in ISO 8601 format with timezone:

```
2026-06-06T14:32:00Z
```

## Response Sizes

- Default limit: 50 items
- Maximum limit: 1000 items
- Minimum limit: 1 item

## Examples in cURL

**Create a Clone:**
```bash
curl -X POST http://localhost:3001/api/clones \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-clone",
    "goldenImageId": "golden-prod-20260606"
  }' | jq .
```

**List Clones with Pagination:**
```bash
curl "http://localhost:3001/api/clones?limit=10&offset=20" | jq .
```

**Delete a Checkpoint:**
```bash
curl -X DELETE http://localhost:3001/api/clones/my-clone/checkpoints/cp-001
```

## Testing Endpoints

Use Swagger UI for interactive testing:

```
http://localhost:3001/api/docs
```

## Further Information

For implementation details, see DEVELOPER_GUIDE.md
For architecture, see Architecture/ directory
For troubleshooting, see TROUBLESHOOTING.md
