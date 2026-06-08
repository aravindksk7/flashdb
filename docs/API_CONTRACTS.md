# FlashDB API Contracts (Frozen)

**Status**: Baseline captured on 2026-06-07  
**Purpose**: Protect GUI/API layer during provider refactoring (Phase 1, Step 1)

These contracts represent the current API shape that the GUI and external clients depend on. Provider implementations (SQL/VHD internals) may be refactored, but these response shapes and endpoint behaviors must remain stable.

---

## Golden Images

### POST /api/golden-images
Create a new golden image.

**Request**:
```json
{
  "name": "string (required)",
  "version": "string (required)",
  "method": "BackupRestore | ReplicaBackup | TableByTableCopy (required)",
  "outputPath": "string (required)",
  "backupFile": "string (optional, required for BackupRestore)",
  "sourceConnection": "string (optional, required for ReplicaBackup/TableByTableCopy)",
  "databaseType": "string (optional)",
  "databaseName": "string (optional)",
  "sourceDatabase": "string (optional)",
  "driver": "string (optional)",
  "authenticationMode": "string (optional)",
  "selectedTables": "string[] (optional)"
}
```

**Response** (201):
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "string",
    "version": "string",
    "method": "string",
    "outputPath": "string",
    "status": "string",
    "createdAt": "ISO8601 timestamp"
  },
  "message": "Golden image created successfully"
}
```

**Error** (400):
```json
{
  "success": false,
  "message": "string"
}
```

---

### GET /api/golden-images
List all golden images.

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "name": "string",
      "version": "string",
      "method": "string",
      "outputPath": "string",
      "status": "string",
      "createdAt": "ISO8601 timestamp"
    }
  ]
}
```

---

### GET /api/golden-images/:imageId
Get a specific golden image by ID.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "string",
    "version": "string",
    "method": "string",
    "outputPath": "string",
    "status": "string",
    "createdAt": "ISO8601 timestamp"
  }
}
```

**Error** (404):
```json
{
  "success": false,
  "message": "Golden image not found: {imageId}"
}
```

---

### PUT /api/golden-images/:imageId
Update golden image metadata.

**Request**:
```json
{
  "name": "string (optional)",
  "version": "string (optional)",
  "method": "string (optional)",
  "outputPath": "string (optional)",
  "status": "string (optional)"
}
```

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "string",
    "name": "string",
    "version": "string",
    "method": "string",
    "outputPath": "string",
    "status": "string",
    "updatedAt": "ISO8601 timestamp"
  },
  "message": "Golden image updated successfully"
}
```

---

### DELETE /api/golden-images/:imageId
Delete a golden image.

**Response** (200):
```json
{
  "success": true,
  "message": "Golden image deleted successfully"
}
```

---

## Clones

### POST /api/clones
Create a new clone (queued by default).

**Request**:
```json
{
  "goldenImageId": "string (required)",
  "cloneName": "string (required)",
  "instancePath": "string (required)",
  "storagePath": "string (required)",
  "databaseType": "string (optional)",
  "databaseName": "string (optional)",
  "compressionEnabled": "boolean (optional)",
  "attachAfterCreate": "boolean (optional)",
  "useQueue": "boolean (default: true)"
}
```

**Response** (202 - queued, 201 - synchronous):
```json
{
  "success": true,
  "data": {
    "taskId": "string (if queued)",
    "status": "string",
    "createdAt": "ISO8601 timestamp"
  },
  "message": "Clone creation task queued successfully"
}
```

---

### GET /api/clones
List all clones.

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "cloneName": "string",
      "goldenImageId": "string",
      "status": "Attached | Detached | Failed",
      "instancePath": "string",
      "storagePath": "string",
      "createdAt": "ISO8601 timestamp"
    }
  ],
  "message": "Clones retrieved successfully"
}
```

---

### GET /api/clones/:cloneId
Get a specific clone.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "id": "string",
    "cloneName": "string",
    "goldenImageId": "string",
    "status": "string",
    "instancePath": "string",
    "storagePath": "string",
    "createdAt": "ISO8601 timestamp"
  }
}
```

---

### POST /api/clones/:cloneId/attach
Attach a clone to SQL instance.

**Request**:
```json
{
  "instancePath": "string (required)"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Clone attached successfully"
}
```

---

### POST /api/clones/:cloneId/detach
Detach a clone from SQL instance.

**Response** (200):
```json
{
  "success": true,
  "message": "Clone detached successfully"
}
```

---

### DELETE /api/clones/:cloneId
Delete a clone (queued by default).

**Query Parameters**:
- `deleteVhdx=true|false` (optional)
- `useQueue=true|false` (default: true)

**Response** (202 - queued, 200 - synchronous):
```json
{
  "success": true,
  "data": {
    "taskId": "string (if queued)",
    "status": "string",
    "createdAt": "ISO8601 timestamp"
  },
  "message": "Clone deletion task queued successfully"
}
```

---

## Checkpoints

### POST /api/clones/:cloneId/checkpoints
Create a checkpoint for a clone (queued by default).

**Request**:
```json
{
  "checkpointName": "string (required)",
  "phase": "string (optional, default: 'manual')",
  "description": "string (optional)",
  "force": "boolean (optional, default: false)",
  "useQueue": "boolean (default: true)"
}
```

**Response** (202 - queued, 201 - synchronous):
```json
{
  "success": true,
  "data": {
    "taskId": "string (if queued)",
    "status": "string",
    "createdAt": "ISO8601 timestamp"
  },
  "message": "Checkpoint creation task queued successfully"
}
```

---

### GET /api/clones/:cloneId/checkpoints
List checkpoints for a clone.

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "cloneId": "string",
      "checkpointName": "string",
      "phase": "string",
      "description": "string (optional)",
      "isFavorite": "boolean",
      "labels": "string[]",
      "createdAt": "ISO8601 timestamp"
    }
  ]
}
```

---

### POST /api/clones/:cloneId/checkpoints/:checkpointId/restore
Restore a checkpoint (queued by default).

**Request**:
```json
{
  "reattachAfter": "boolean (optional, default: true)",
  "useQueue": "boolean (default: true)"
}
```

**Response** (202 - queued, 200 - synchronous):
```json
{
  "success": true,
  "data": {
    "taskId": "string (if queued)",
    "status": "string",
    "createdAt": "ISO8601 timestamp"
  },
  "message": "Checkpoint restore task queued successfully"
}
```

---

### PATCH /api/clones/:cloneId/checkpoints/:checkpointId
Update checkpoint metadata (labels, favorite).

**Request**:
```json
{
  "isFavorite": "boolean (optional)",
  "labels": "string[] or string (optional)"
}
```

**Response** (200):
```json
{
  "success": true,
  "message": "Checkpoint updated successfully"
}
```

---

### DELETE /api/clones/:cloneId/checkpoints/:checkpointId
Delete a checkpoint (queued).

**Request**:
```json
{
  "cascadeDelete": "boolean (optional, default: false)",
  "force": "boolean (optional, default: false)"
}
```

**Response** (202):
```json
{
  "success": true,
  "message": "Checkpoint deletion task queued successfully",
  "data": {
    "taskId": "string",
    "status": "string",
    "createdAt": "ISO8601 timestamp",
    "estimatedCompletionMs": 1800000
  },
  "checkpointInfo": {
    "id": "string",
    "name": "string"
  }
}
```

---

## Metrics

### GET /api/metrics/overview
Get comprehensive metrics overview.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "totalClonesCreated": "number",
    "totalStorageSavedGB": "number",
    "avgCloneCreationTimeSeconds": "number",
    "operationSuccessRatePercent": "number",
    "operationsLast24h": "number",
    "activeClonesCount": "number",
    "lastUpdated": "ISO8601 timestamp"
  },
  "message": "Metrics overview retrieved successfully"
}
```

---

### GET /api/metrics/clones
Get clone creation statistics.

**Response** (200):
```json
{
  "success": true,
  "data": {
    "avgCreationTimeSeconds": "number",
    "successRatePercent": "number",
    "totalCreated": "number",
    "byGoldenImage": [
      {
        "goldenImageId": "string",
        "goldenImageName": "string",
        "totalCreated": "number",
        "avgCreationTimeSeconds": "number"
      }
    ]
  }
}
```

---

## Operations (Audit)

### GET /api/operations
Get operation history (audit log).

**Query Parameters**:
- `cloneId=string` (optional)
- `type=create|restore|delete|validate|repair` (optional)
- `status=pending|completed|failed` (optional)
- `limit=number` (optional, default: 50)
- `offset=number` (optional, default: 0)

**Response** (200):
```json
{
  "success": true,
  "data": [
    {
      "id": "string",
      "cloneId": "string",
      "checkpointId": "string (optional)",
      "checkpointName": "string (optional)",
      "type": "create|restore|delete|validate|repair",
      "status": "pending|completed|failed",
      "timestamp": "ISO8601 timestamp",
      "completedAt": "ISO8601 timestamp (optional)",
      "message": "string (optional)",
      "source": "repository|queue"
    }
  ]
}
```

---

## Error Response Format

All errors follow this standard format:

```json
{
  "success": false,
  "message": "string",
  "statusCode": "number (optional)"
}
```

### HTTP Status Codes

- `200`: Successful operation
- `201`: Resource created successfully
- `202`: Operation accepted (queued)
- `400`: Bad request (validation failure)
- `404`: Resource not found
- `408`: Request timeout (lock timeout)
- `409`: Conflict (lock conflict)
- `500`: Internal server error

---

## Response Headers

- `Lock-Wait-Time-Ms`: Time spent waiting for locks (present on clone/checkpoint operations)

---

## Notes

1. **Queue Behavior**: Create, restore, and delete operations use a task queue by default. Set `useQueue=false` for synchronous mode.
2. **Locking**: Clone and checkpoint operations use resource locking to prevent concurrent modifications.
3. **Cache Invalidation**: The API automatically invalidates relevant caches after mutations.
4. **PowerShell Fallback**: All operations delegate to PowerShell cmdlets for execution.

