# FlashDB REST API Specification

**Version:** 1.0.0  
**Status:** Design  
**Last Updated:** 2026-06-06

## Overview

The FlashDB REST API provides HTTP access to all core functionality:
- Golden image management
- Clone lifecycle operations
- Checkpoint creation and rollback
- Metadata queries and administration

The API is designed for use by the GUI client, external tools, and cross-machine access to FlashDB operations. All operations are stateless and idempotent where applicable.

## Base URL

```
https://localhost:6060/api/v1
```

Or for network deployments:

```
https://flashdb-server:6060/api/v1
```

## Authentication

- **Local mode:** Windows integrated authentication (Kerberos/NTLM)
- **Server mode:** Bearer tokens (JWT) with API key support
- **Default:** No authentication in v1 (assumes trusted network)

## Request/Response Format

- **Content-Type:** `application/json`
- **Charset:** UTF-8
- **Timestamps:** ISO 8601 format (`2026-06-06T14:32:00Z`)
- **Error responses:** Standard HTTP status codes with JSON error detail

---

## API Endpoints

### Golden Image Management

#### POST /api/v1/golden-images

Create a new golden image using one of three methods.

**Request:**

```json
{
  "outputPath": "\\shared\GoldenImages\prod-20260606.vhdx",
  "version": "20260606",
  "method": "BackupRestore|ReplicaBackup|TableByTableCopy",
  "compress": true,
  "verifyRowCounts": false,
  "options": {
    "backupFile": "C:\Backups\prod-20260601.bak",
    "sourceConnection": "Server=prod-replica;Encrypt=true;TrustServerCertificate=false",
    "databaseName": "AdventureWorks"
  }
}
```

**Response (201 Created):**

```json
{
  "id": "golden-prod-20260606",
  "version": "20260606",
  "createdAt": "2026-06-06T14:32:00Z",
  "createdBy": "developer@company.com",
  "path": "\\shared\GoldenImages\prod-20260606.vhdx",
  "sizeBytes": 1099511627776,
  "creationMethod": "BackupRestore",
  "verificationStatus": "pending",
  "metadata": {
    "sourceConnection": "...",
    "sourceRowCountHash": "sha256:abc123...",
    "sourceVerifiedAt": "2026-06-06T14:45:00Z"
  }
}
```

**Error Responses:**

- `400 Bad Request` - Invalid method or missing required options
- `404 Not Found` - Backup file or source connection not available
- `507 Insufficient Storage` - Not enough disk space

---

#### GET /api/v1/golden-images

List all available golden images.

**Query Parameters:**

- `version` - Filter by version (e.g., `20260606`)
- `method` - Filter by creation method (`BackupRestore`, `ReplicaBackup`, `TableByTableCopy`)
- `limit` - Maximum results (default: 50)
- `offset` - Pagination offset (default: 0)

**Response (200 OK):**

```json
{
  "items": [
    {
      "id": "golden-prod-20260606",
      "version": "20260606",
      "createdAt": "2026-06-06T14:32:00Z",
      "createdBy": "developer@company.com",
      "path": "\\shared\GoldenImages\prod-20260606.vhdx",
      "sizeBytes": 1099511627776,
      "creationMethod": "BackupRestore",
      "verificationStatus": "verified",
      "usedByClones": 3
    },
    {
      "id": "golden-prod-20260601",
      "version": "20260601",
      "createdAt": "2026-06-01T08:00:00Z",
      "createdBy": "admin@company.com",
      "path": "\\shared\GoldenImages\prod-20260601.vhdx",
      "sizeBytes": 1099511627776,
      "creationMethod": "ReplicaBackup",
      "verificationStatus": "verified",
      "usedByClones": 0
    }
  ],
  "total": 2,
  "limit": 50,
  "offset": 0
}
```

---

#### GET /api/v1/golden-images/{id}

Get details of a specific golden image.

**Path Parameters:**

- `id` - Golden image ID (e.g., `golden-prod-20260606`)

**Query Parameters:**

- `includeMetadata` - Include detailed metadata (default: false)

**Response (200 OK):**

```json
{
  "id": "golden-prod-20260606",
  "version": "20260606",
  "createdAt": "2026-06-06T14:32:00Z",
  "createdBy": "developer@company.com",
  "path": "\\shared\GoldenImages\prod-20260606.vhdx",
  "sizeBytes": 1099511627776,
  "creationMethod": "BackupRestore",
  "verificationStatus": "verified",
  "metadata": {
    "sourceConnection": "Server=prod-backup;Database=AdventureWorks",
    "sourceRowCountHash": "sha256:abc123...",
    "verificationDetails": {
      "rowCountVerified": true,
      "schemaVerified": true,
      "replicaLagSeconds": 0,
      "verifiedAt": "2026-06-06T14:45:00Z"
    }
  },
  "usedByClones": [
    "clone-prod-dev1",
    "clone-prod-test2"
  ]
}
```

---

#### PATCH /api/v1/golden-images/{id}

Update golden image metadata or version.

**Request:**

```json
{
  "version": "20260606-v2",
  "tags": ["prod", "latest"]
}
```

**Response (200 OK):**

```json
{
  "id": "golden-prod-20260606",
  "version": "20260606-v2",
  "updatedAt": "2026-06-06T15:00:00Z"
}
```

---

#### POST /api/v1/golden-images/{id}/refresh

Refresh golden image from source (re-run original creation method).

**Request:**

```json
{
  "verifyRowCounts": true
}
```

**Response (202 Accepted):**

```json
{
  "operationId": "op-refresh-golden-20260606-001",
  "status": "in-progress",
  "startedAt": "2026-06-06T15:05:00Z"
}
```

---

#### DELETE /api/v1/golden-images/{id}

Delete a golden image (only if no clones depend on it).

**Response (204 No Content)**

Or if clones exist:

**Response (409 Conflict):**

```json
{
  "error": "GOLDEN_IMAGE_IN_USE",
  "message": "Golden image is used by 3 active clones",
  "usedByClones": ["clone-prod-dev1", "clone-prod-test2", "clone-prod-perf"]
}
```

---

### Clone Management

#### POST /api/v1/clones

Create a new clone from a golden image.

**Request:**

```json
{
  "goldenImageId": "golden-prod-20260606",
  "cloneName": "dev-clone-1",
  "instancePath": "LOCALHOST\\SQLEXPRESS",
  "storagePath": "D:\\CloneStorage",
  "autoAttach": true
}
```

**Response (201 Created):**

```json
{
  "id": "clone-prod-dev1",
  "name": "dev-clone-1",
  "goldenImageId": "golden-prod-20260606",
  "createdAt": "2026-06-06T14:32:00Z",
  "createdBy": "developer@company.com",
  "vhdxPath": "D:\\CloneStorage\\clone-prod-dev1.vhdx",
  "status": "attached",
  "database": {
    "type": "SqlServer",
    "databaseName": "AdventureWorks_Clone",
    "instancePath": "LOCALHOST\\SQLEXPRESS"
  },
  "sizeBytes": 2147483648,
  "checkpointCount": 0,
  "attachmentStatus": {
    "status": "attached",
    "attachedAt": "2026-06-06T14:35:00Z"
  }
}
```

---

#### GET /api/v1/clones

List all clones.

**Query Parameters:**

- `goldenImageId` - Filter by golden image
- `status` - Filter by status (`created`, `attached`, `detached`, `expired`)
- `limit` - Maximum results (default: 50)
- `offset` - Pagination offset

**Response (200 OK):**

```json
{
  "items": [
    {
      "id": "clone-prod-dev1",
      "name": "dev-clone-1",
      "goldenImageId": "golden-prod-20260606",
      "createdAt": "2026-06-06T14:32:00Z",
      "createdBy": "developer@company.com",
      "vhdxPath": "D:\\CloneStorage\\clone-prod-dev1.vhdx",
      "status": "attached",
      "sizeBytes": 2147483648,
      "checkpointCount": 2
    }
  ],
  "total": 1,
  "limit": 50,
  "offset": 0
}
```

---

#### GET /api/v1/clones/{id}

Get details of a specific clone.

**Response (200 OK):**

```json
{
  "id": "clone-prod-dev1",
  "name": "dev-clone-1",
  "goldenImageId": "golden-prod-20260606",
  "createdAt": "2026-06-06T14:32:00Z",
  "createdBy": "developer@company.com",
  "vhdxPath": "D:\\CloneStorage\\clone-prod-dev1.vhdx",
  "status": "attached",
  "database": {
    "type": "SqlServer",
    "databaseName": "AdventureWorks_Clone",
    "instancePath": "LOCALHOST\\SQLEXPRESS"
  },
  "sizeBytes": 2147483648,
  "checkpointCount": 2,
  "attachmentStatus": {
    "status": "attached",
    "attachedAt": "2026-06-06T14:35:00Z",
    "lastVerifiedAt": "2026-06-06T14:35:30Z"
  },
  "lifecycle": {
    "status": "active",
    "expirationPolicy": "manual",
    "expiresAt": null,
    "tags": ["dev", "testing"]
  },
  "recentOperations": [
    {
      "operation": "clone-created",
      "timestamp": "2026-06-06T14:32:00Z",
      "status": "success"
    },
    {
      "operation": "database-attached",
      "timestamp": "2026-06-06T14:35:00Z",
      "status": "success"
    }
  ]
}
```

---

#### POST /api/v1/clones/{id}/attach

Attach clone to SQL Server instance.

**Request:**

```json
{
  "instancePath": "LOCALHOST\\SQLEXPRESS"
}
```

**Response (200 OK):**

```json
{
  "id": "clone-prod-dev1",
  "status": "attached",
  "database": {
    "databaseName": "AdventureWorks_Clone",
    "instancePath": "LOCALHOST\\SQLEXPRESS"
  },
  "attachedAt": "2026-06-06T14:35:00Z"
}
```

---

#### POST /api/v1/clones/{id}/detach

Detach clone from SQL Server instance.

**Request:**

```json
{
  "force": false
}
```

**Response (200 OK):**

```json
{
  "id": "clone-prod-dev1",
  "status": "detached",
  "detachedAt": "2026-06-06T14:45:00Z"
}
```

---

#### DELETE /api/v1/clones/{id}

Delete a clone and optionally remove VHDX files.

**Query Parameters:**

- `deleteVhdx` - Also delete VHDX files (default: false)

**Response (204 No Content)**

---

### Checkpoint Operations

#### POST /api/v1/clones/{id}/checkpoints

Create a new checkpoint for a clone.

**Request:**

```json
{
  "name": "Post-ETL Results",
  "phase": "post-etl",
  "description": "Results after DailyTransform_v2",
  "labels": ["etl-v2", "production-test"],
  "force": false
}
```

**Response (201 Created):**

```json
{
  "checkpointId": "cp-002",
  "cloneId": "clone-prod-dev1",
  "name": "Post-ETL Results",
  "phase": "post-etl",
  "createdAt": "2026-06-06T15:15:00Z",
  "createdBy": "tester@company.com",
  "vhdxSnapshotPath": "D:\\CloneStorage\\checkpoints\\clone-prod-dev1_cp-002.vhdx",
  "description": "Results after DailyTransform_v2",
  "isActive": true,
  "labels": ["etl-v2", "production-test"],
  "databaseMetadata": {
    "totalRowCount": 18500000,
    "totalDataSizeMB": 625,
    "schemaHash": "sha256:xyz789...",
    "tableCount": 45,
    "lastTableModified": "2026-06-06T14:40:00Z"
  }
}
```

---

#### GET /api/v1/clones/{id}/checkpoints

List all checkpoints for a clone.

**Query Parameters:**

- `includeMetadata` - Include detailed metadata (default: false)
- `phase` - Filter by phase (`pre-etl`, `post-etl`, `manual`)
- `favorite` - Filter by favorite flag (true/false)
- `limit` - Maximum results (default: 50)

**Response (200 OK):**

```json
{
  "cloneId": "clone-prod-dev1",
  "items": [
    {
      "checkpointId": "cp-001",
      "name": "Before Performance Test",
      "phase": "pre-etl",
      "createdAt": "2026-06-06T15:00:00Z",
      "createdBy": "tester@company.com",
      "isActive": false,
      "isFavorite": true,
      "labels": ["baseline", "golden-state"]
    },
    {
      "checkpointId": "cp-002",
      "name": "After First Test Run",
      "phase": "post-etl",
      "createdAt": "2026-06-06T15:15:00Z",
      "createdBy": "tester@company.com",
      "isActive": true,
      "isFavorite": false,
      "labels": ["etl-v2-results"]
    }
  ],
  "total": 2,
  "limit": 50,
  "offset": 0
}
```

---

#### GET /api/v1/clones/{id}/checkpoints/{cpid}

Get detailed checkpoint information.

**Response (200 OK):**

```json
{
  "checkpointId": "cp-001",
  "cloneId": "clone-prod-dev1",
  "name": "Before Performance Test",
  "phase": "pre-etl",
  "createdAt": "2026-06-06T15:00:00Z",
  "createdBy": "tester@company.com",
  "vhdxSnapshotPath": "D:\\CloneStorage\\checkpoints\\clone-prod-dev1_cp-001.vhdx",
  "description": "Baseline state before load testing",
  "isActive": false,
  "isFavorite": true,
  "labels": ["perf-baseline", "golden-state"],
  "databaseMetadata": {
    "totalRowCount": 15000000,
    "totalDataSizeMB": 512,
    "schemaHash": "sha256:xyz789...",
    "tableCount": 45,
    "lastTableModified": null,
    "estimatedChanges": 0
  },
  "etlMetadata": {
    "etlJobName": null,
    "startedAt": null,
    "completedAt": null
  },
  "databaseConnections": {
    "activeCount": 0,
    "forceClosed": false
  }
}
```

---

#### PATCH /api/v1/clones/{id}/checkpoints/{cpid}

Update checkpoint metadata (labels, favorite flag, etc.).

**Request:**

```json
{
  "isFavorite": true,
  "labels": ["baseline", "golden", "production-ready"],
  "name": "Updated Checkpoint Name"
}
```

**Response (200 OK):**

```json
{
  "checkpointId": "cp-001",
  "updated": true,
  "updatedAt": "2026-06-06T15:20:00Z"
}
```

---

#### POST /api/v1/clones/{id}/checkpoints/{cpid}/restore

Restore a clone to a specific checkpoint state.

**Request:**

```json
{
  "reattachAfter": true,
  "closeConnections": true
}
```

**Response (202 Accepted):**

```json
{
  "operationId": "op-restore-cp-001-001",
  "cloneId": "clone-prod-dev1",
  "checkpointId": "cp-001",
  "status": "in-progress",
  "startedAt": "2026-06-06T15:25:00Z"
}
```

Wait for operation to complete:

```
GET /api/v1/operations/{operationId}
```

---

#### POST /api/v1/clones/{id}/checkpoints/{cpid}/diff

Compare two checkpoints to see what changed.

**Request:**

```json
{
  "targetCheckpointId": "cp-002"
}
```

**Response (200 OK):**

```json
{
  "sourceCheckpointId": "cp-001",
  "targetCheckpointId": "cp-002",
  "cloneId": "clone-prod-dev1",
  "comparison": {
    "sourceRowCountHash": "sha256:abc123...",
    "targetRowCountHash": "sha256:def456...",
    "tables": [
      {
        "schema": "dbo",
        "table": "Orders",
        "sourceRowCount": 1000000,
        "targetRowCount": 1250000,
        "rowCountDelta": 250000,
        "sourceDataSizeMB": 150,
        "targetDataSizeMB": 175,
        "dataSizeDeltaMB": 25,
        "schemaModified": false
      },
      {
        "schema": "dbo",
        "table": "OrderDetails",
        "sourceRowCount": 5000000,
        "targetRowCount": 5000000,
        "rowCountDelta": 0,
        "sourceDataSizeMB": 300,
        "targetDataSizeMB": 300,
        "dataSizeDeltaMB": 0,
        "schemaModified": false
      },
      {
        "schema": "dbo",
        "table": "Customers",
        "sourceRowCount": 100000,
        "targetRowCount": 100000,
        "rowCountDelta": 0,
        "sourceDataSizeMB": 10,
        "targetDataSizeMB": 10,
        "dataSizeDeltaMB": 0,
        "schemaModified": true,
        "schemaChangeDescription": "New column 'LastModified' added"
      }
    ],
    "summary": {
      "totalRowChanges": 250000,
      "totalSizeChangeMB": 25,
      "tablesModified": 2,
      "tablesUnchanged": 43,
      "schemaChanges": 1
    }
  }
}
```

---

#### DELETE /api/v1/clones/{id}/checkpoints/{cpid}

Delete a checkpoint.

**Query Parameters:**

- `force` - Force delete even if active (default: false)

**Response (204 No Content)**

---

#### POST /api/v1/clones/{id}/restore-golden

Restore clone to golden image state (discard all changes).

**Request:**

```json
{
  "reattachAfter": true,
  "closeConnections": true
}
```

**Response (202 Accepted):**

```json
{
  "operationId": "op-restore-golden-clone-prod-dev1-001",
  "cloneId": "clone-prod-dev1",
  "status": "in-progress",
  "startedAt": "2026-06-06T15:30:00Z"
}
```

---

### Admin & Utilities

#### GET /api/v1/health

Health check endpoint.

**Response (200 OK):**

```json
{
  "status": "healthy",
  "version": "0.1.0",
  "timestamp": "2026-06-06T15:35:00Z",
  "services": {
    "database": "connected",
    "storage": "available",
    "vhdx": "operational"
  }
}
```

---

#### GET /api/v1/storage

Get storage usage report.

**Response (200 OK):**

```json
{
  "timestamp": "2026-06-06T15:35:00Z",
  "goldenImages": {
    "totalCount": 2,
    "totalSizeBytes": 2199023255552,
    "compressionRatio": 0.65
  },
  "clones": {
    "totalCount": 3,
    "totalAllocatedBytes": 6442450944,
    "totalUsedBytes": 1073741824,
    "utilizationPercent": 16.7
  },
  "checkpoints": {
    "totalCount": 5,
    "totalSizeBytes": 536870912
  },
  "filesystem": {
    "path": "D:\\CloneStorage",
    "totalBytes": 10995116277760,
    "usedBytes": 2684354560,
    "availableBytes": 8310761717200,
    "utilizationPercent": 24.4
  }
}
```

---

#### GET /api/v1/configuration

Get current FlashDB configuration.

**Response (200 OK):**

```json
{
  "goldenImagePath": "\\shared\\GoldenImages",
  "defaultCloneStoragePath": "D:\\CloneStorage",
  "defaultInstancePath": "LOCALHOST\\SQLEXPRESS",
  "checkpointRetentionDays": null,
  "maxConcurrentClones": 5,
  "vhdxCompressionEnabled": true,
  "defaultCreationMethod": "BackupRestore"
}
```

---

#### PATCH /api/v1/configuration

Update configuration.

**Request:**

```json
{
  "defaultCloneStoragePath": "E:\\FlashDB-Storage",
  "maxConcurrentClones": 8
}
```

**Response (200 OK):**

```json
{
  "updated": true,
  "changedSettings": [
    "defaultCloneStoragePath",
    "maxConcurrentClones"
  ]
}
```

---

#### GET /api/v1/operations/{operationId}

Get status of a long-running operation.

**Response (200 OK):**

```json
{
  "operationId": "op-restore-cp-001-001",
  "type": "restore-checkpoint",
  "status": "completed",
  "progress": 100,
  "startedAt": "2026-06-06T15:25:00Z",
  "completedAt": "2026-06-06T15:26:30Z",
  "result": {
    "cloneId": "clone-prod-dev1",
    "checkpointId": "cp-001",
    "success": true
  }
}
```

Or in-progress:

```json
{
  "operationId": "op-restore-cp-001-001",
  "type": "restore-checkpoint",
  "status": "in-progress",
  "progress": 45,
  "startedAt": "2026-06-06T15:25:00Z",
  "completedAt": null,
  "message": "Closing active connections..."
}
```

---

#### GET /api/operations

Get global operation history. This endpoint powers the GUI Audit tab and returns both SQL audit rows and durable queue-backed checkpoint tasks.

**Query Parameters:**

- `cloneId` (optional): filter to a clone
- `checkpointId` (optional): filter to a checkpoint
- `operationType` (optional): `create`, `restore`, or `delete`
- `status` (optional): `pending`, `processing`, `completed`, or `failed`
- `limit` (optional): maximum rows; default `100`

**Response (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": "36166055-4b93-4729-a7af-6ca9a22d2beb",
      "cloneId": "clone-20260607033049-3949",
      "checkpointId": "cp-20260607043537-2642",
      "checkpointName": "cp-20260607043537-2642",
      "type": "restore",
      "status": "completed",
      "timestamp": "2026-06-07T04:37:51.782Z",
      "completedAt": "2026-06-07T04:37:57.042Z",
      "message": "Operation completed successfully",
      "source": "queue"
    }
  ],
  "count": 1
}
```

---

#### GET /api/operations/timeline/{cloneId}

Get the complete operation timeline for one clone. The timeline is sorted newest-first and merges SQL operation rows with durable queue task history.

**Response (200 OK):**

```json
{
  "success": true,
  "data": [
    {
      "id": "301fafcf-d2f3-4cd8-a505-8c11eb3a3ac7",
      "cloneId": "clone-20260607033049-3949",
      "checkpointId": "",
      "checkpointName": "Before ETL",
      "type": "create",
      "status": "completed",
      "timestamp": "2026-06-07T04:35:36.780Z",
      "completedAt": "2026-06-07T04:35:38.833Z",
      "message": "Operation completed successfully",
      "source": "queue"
    }
  ],
  "count": 1,
  "cloneId": "clone-20260607033049-3949"
}
```

---

### GUI Statistics and Audit Data Sources

The GUI dashboard displays values from live API/provider state:

- Healthy clones include `Ready`, `Attached`, `Active`, and `Healthy` statuses.
- Golden image and clone size values are SQL Server database file sizes when available.
- Clone cards display table count, row count, and size returned by `/api/clones`.
- Dashboard operation counts, last-24h activity, success rate, and operation type distribution are derived from durable queue history.
- The Audit tab uses `/api/operations` and supports client-side search and type/status filters.

---

## Error Handling

### Standard Error Response

All errors return JSON with HTTP status code and error detail:

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {
    "field": "additional context"
  },
  "timestamp": "2026-06-06T15:35:00Z",
  "traceId": "trace-uuid-for-logging"
}
```

### Common Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `INVALID_REQUEST` | 400 | Malformed JSON or missing required fields |
| `VALIDATION_ERROR` | 400 | Validation failed (e.g., invalid path) |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Operation conflicts with existing state |
| `OPERATION_IN_PROGRESS` | 409 | Another operation is already running |
| `INSUFFICIENT_STORAGE` | 507 | Not enough disk space |
| `INTERNAL_ERROR` | 500 | Server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily down |

---

## Rate Limiting

- **Tier 1 (Local):** Unlimited
- **Tier 2 (Network):** 100 requests/minute per client
- **Tier 3 (Public):** 10 requests/minute per API key

Rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1686138940
```

---

## Pagination

List endpoints support pagination:

- `limit` - Number of results (default: 50, max: 200)
- `offset` - Starting position (default: 0)

Response includes:

```json
{
  "items": [...],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

---

## Versioning

The API is versioned via the URL path:

- `/api/v1/` - Current stable version
- `/api/v2/` - Future version (if breaking changes needed)

All clients should target `/api/v1/` for v0.1.0 release.

---

End of API Specification
