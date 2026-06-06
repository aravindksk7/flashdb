# FlashDB Batch Operations API - Usage Examples

This document demonstrates how to use the FlashDB Batch Operations API endpoints.

## Overview

The batch operations API allows you to:
- Create batch jobs with multiple operations (clone, checkpoint, delete, restore)
- Execute operations in parallel with configurable concurrency
- Monitor batch progress in real-time
- Cancel running batches
- Retrieve results after completion

## Base URL

```
http://localhost:3001/api/batches
```

## API Endpoints

### 1. Create a Batch Operation

**Endpoint:** `POST /api/batches`

**Request Body:**

```json
{
  "operationType": "clone-batch",
  "storagePath": "D:\\CloneStorage",
  "concurrencyLimit": 3,
  "operations": [
    {
      "GoldenImageId": "golden-prod-20260606",
      "CloneName": "dev-clone-1",
      "InstancePath": "LOCALHOST\\SQLEXPRESS",
      "StoragePath": "D:\\CloneStorage"
    },
    {
      "GoldenImageId": "golden-prod-20260606",
      "CloneName": "dev-clone-2",
      "InstancePath": "LOCALHOST\\SQLEXPRESS",
      "StoragePath": "D:\\CloneStorage"
    },
    {
      "GoldenImageId": "golden-prod-20260606",
      "CloneName": "dev-clone-3",
      "InstancePath": "LOCALHOST\\SQLEXPRESS",
      "StoragePath": "D:\\CloneStorage"
    }
  ]
}
```

**Response:**

```json
{
  "success": true,
  "message": "Batch operation created successfully",
  "data": {
    "id": "batch-clone-batch-20260606-140530-5432",
    "type": "clone-batch",
    "state": "pending",
    "totalOperations": 3,
    "completedOperations": 0,
    "failedOperations": 0,
    "cancelledOperations": 0,
    "concurrencyLimit": 3,
    "createdAt": "2026-06-06T14:05:30.123Z",
    "startedAt": null,
    "completedAt": null,
    "operations": [
      {
        "index": 0,
        "operationId": "op-batch-clone-batch-20260606-140530-5432-0",
        "status": "pending",
        "params": { ... },
        "result": null,
        "error": null,
        "startTime": null,
        "endTime": null,
        "jobId": null
      },
      ...
    ]
  }
}
```

**Operation Types:**
- `clone-batch` - Create multiple clones from a golden image
- `checkpoint-batch` - Create checkpoints for multiple clones
- `delete-batch` - Delete multiple clones
- `restore-batch` - Restore multiple clones to a checkpoint

---

### 2. List All Batches

**Endpoint:** `GET /api/batches?storagePath=D:\\CloneStorage&state=pending`

**Query Parameters:**
- `storagePath` (required): Path where batch metadata is stored
- `state` (optional): Filter by state - `pending`, `running`, `completed`, `failed`, `cancelled`

**Response:**

```json
{
  "success": true,
  "message": "Batches retrieved successfully",
  "data": [
    {
      "id": "batch-clone-batch-20260606-140530-5432",
      "type": "clone-batch",
      "state": "pending",
      "totalOperations": 3,
      "completedOperations": 0,
      "failedOperations": 0,
      "cancelledOperations": 0,
      "createdAt": "2026-06-06T14:05:30.123Z",
      ...
    }
  ]
}
```

---

### 3. Get Batch Status

**Endpoint:** `GET /api/batches/:batchId?storagePath=D:\\CloneStorage`

**Path Parameters:**
- `batchId`: The batch operation ID

**Query Parameters:**
- `storagePath` (required): Path where batch metadata is stored

**Response:**

```json
{
  "success": true,
  "message": "Batch retrieved successfully",
  "data": {
    "id": "batch-clone-batch-20260606-140530-5432",
    "type": "clone-batch",
    "state": "running",
    "totalOperations": 3,
    "completedOperations": 1,
    "failedOperations": 0,
    "cancelledOperations": 0,
    "concurrencyLimit": 3,
    "createdAt": "2026-06-06T14:05:30.123Z",
    "startedAt": "2026-06-06T14:05:45.456Z",
    "completedAt": null,
    "operations": [
      {
        "index": 0,
        "operationId": "op-batch-clone-batch-20260606-140530-5432-0",
        "status": "completed",
        "result": {
          "id": "clone-dev-clone-1-20260606-140545",
          "name": "dev-clone-1",
          "vhdxPath": "D:\\CloneStorage\\clone-dev-clone-1-20260606-140545.vhdx"
        },
        "error": null,
        "startTime": "2026-06-06T14:05:45.500Z",
        "endTime": "2026-06-06T14:05:52.100Z",
        "jobId": 1234
      },
      {
        "index": 1,
        "operationId": "op-batch-clone-batch-20260606-140530-5432-1",
        "status": "running",
        "result": null,
        "error": null,
        "startTime": "2026-06-06T14:05:53.200Z",
        "endTime": null,
        "jobId": 1235
      },
      {
        "index": 2,
        "operationId": "op-batch-clone-batch-20260606-140530-5432-2",
        "status": "pending",
        ...
      }
    ]
  }
}
```

---

### 4. Start Batch Execution

**Endpoint:** `POST /api/batches/:batchId/start`

**Request Body:**

```json
{
  "storagePath": "D:\\CloneStorage"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Batch execution started successfully",
  "data": {
    "id": "batch-clone-batch-20260606-140530-5432",
    "state": "running",
    "startedAt": "2026-06-06T14:05:45.456Z",
    ...
  }
}
```

---

### 5. Get Batch Progress

**Endpoint:** `GET /api/batches/:batchId/progress?storagePath=D:\\CloneStorage`

**Query Parameters:**
- `storagePath` (required): Path where batch metadata is stored

**Response:**

```json
{
  "success": true,
  "message": "Batch progress retrieved successfully",
  "data": {
    "batchId": "batch-clone-batch-20260606-140530-5432",
    "state": "running",
    "totalOperations": 3,
    "completedOperations": 1,
    "failedOperations": 0,
    "cancelledOperations": 0,
    "percentComplete": 33,
    "createdAt": "2026-06-06T14:05:30.123Z",
    "startedAt": "2026-06-06T14:05:45.456Z",
    "completedAt": null,
    "operationStatuses": [
      {
        "index": 0,
        "status": "completed",
        "startTime": "2026-06-06T14:05:45.500Z",
        "endTime": "2026-06-06T14:05:52.100Z"
      },
      {
        "index": 1,
        "status": "running",
        "startTime": "2026-06-06T14:05:53.200Z",
        "endTime": null
      },
      {
        "index": 2,
        "status": "pending"
      }
    ]
  }
}
```

---

### 6. Cancel Batch

**Endpoint:** `POST /api/batches/:batchId/cancel`

**Request Body:**

```json
{
  "storagePath": "D:\\CloneStorage"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Batch cancelled successfully",
  "data": {
    "id": "batch-clone-batch-20260606-140530-5432",
    "state": "cancelled",
    "completedOperations": 1,
    "failedOperations": 0,
    "cancelledOperations": 2,
    "completedAt": "2026-06-06T14:06:15.789Z"
  }
}
```

---

### 7. Get Batch Results

**Endpoint:** `GET /api/batches/:batchId/results?storagePath=D:\\CloneStorage&includeErrors=true`

**Query Parameters:**
- `storagePath` (required): Path where batch metadata is stored
- `includeErrors` (optional): Include error details (default: true)

**Response:**

```json
{
  "success": true,
  "message": "Batch results retrieved successfully",
  "data": {
    "batchId": "batch-clone-batch-20260606-140530-5432",
    "type": "clone-batch",
    "state": "completed",
    "totalOperations": 3,
    "completedOperations": 3,
    "failedOperations": 0,
    "cancelledOperations": 0,
    "createdAt": "2026-06-06T14:05:30.123Z",
    "startedAt": "2026-06-06T14:05:45.456Z",
    "completedAt": "2026-06-06T14:06:30.200Z",
    "operations": [
      {
        "index": 0,
        "operationId": "op-batch-clone-batch-20260606-140530-5432-0",
        "status": "completed",
        "result": {
          "id": "clone-dev-clone-1-20260606-140545",
          "name": "dev-clone-1",
          "vhdxPath": "D:\\CloneStorage\\clone-dev-clone-1-20260606-140545.vhdx",
          "createdAt": "2026-06-06T14:05:52.100Z"
        },
        "startTime": "2026-06-06T14:05:45.500Z",
        "endTime": "2026-06-06T14:05:52.100Z"
      },
      {
        "index": 1,
        "operationId": "op-batch-clone-batch-20260606-140530-5432-1",
        "status": "completed",
        "result": { ... },
        "startTime": "2026-06-06T14:05:53.200Z",
        "endTime": "2026-06-06T14:06:00.250Z"
      },
      {
        "index": 2,
        "operationId": "op-batch-clone-batch-20260606-140530-5432-2",
        "status": "completed",
        "result": { ... },
        "startTime": "2026-06-06T14:06:01.300Z",
        "endTime": "2026-06-06T14:06:08.750Z"
      }
    ]
  }
}
```

---

## Usage Workflow Examples

### Example 1: Create and Execute a Clone Batch

```bash
# Step 1: Create batch
curl -X POST http://localhost:3001/api/batches \
  -H "Content-Type: application/json" \
  -d '{
    "operationType": "clone-batch",
    "storagePath": "D:\\CloneStorage",
    "concurrencyLimit": 3,
    "operations": [...]
  }'

# Response contains batchId: "batch-clone-batch-20260606-140530-5432"

# Step 2: Start execution
curl -X POST http://localhost:3001/api/batches/batch-clone-batch-20260606-140530-5432/start \
  -H "Content-Type: application/json" \
  -d '{"storagePath": "D:\\CloneStorage"}'

# Step 3: Monitor progress
curl http://localhost:3001/api/batches/batch-clone-batch-20260606-140530-5432/progress?storagePath=D:\\CloneStorage

# Step 4: Get results when complete
curl http://localhost:3001/api/batches/batch-clone-batch-20260606-140530-5432/results?storagePath=D:\\CloneStorage
```

### Example 2: Batch Checkpoint Creation with Cancellation

```bash
# Create batch with 10 checkpoint operations
curl -X POST http://localhost:3001/api/batches \
  -H "Content-Type: application/json" \
  -d '{
    "operationType": "checkpoint-batch",
    "storagePath": "D:\\CloneStorage",
    "concurrencyLimit": 4,
    "operations": [
      {"CloneId": "clone-1", "CheckpointName": "pre-deployment"},
      {"CloneId": "clone-2", "CheckpointName": "pre-deployment"},
      ...
    ]
  }'

# Start batch
curl -X POST http://localhost:3001/api/batches/batch-checkpoint-batch-20260606-140530-5432/start \
  -H "Content-Type: application/json" \
  -d '{"storagePath": "D:\\CloneStorage"}'

# If needed, cancel it
curl -X POST http://localhost:3001/api/batches/batch-checkpoint-batch-20260606-140530-5432/cancel \
  -H "Content-Type: application/json" \
  -d '{"storagePath": "D:\\CloneStorage"}'
```

---

## Error Handling

All API endpoints return error responses in the following format:

```json
{
  "success": false,
  "message": "Error description"
}
```

**Common HTTP Status Codes:**
- `201` - Batch created successfully
- `200` - Successful operation
- `400` - Bad request (missing/invalid parameters)
- `404` - Batch not found
- `500` - Server error

---

## PowerShell Module Usage (Direct)

If using the PowerShell module directly instead of the API:

```powershell
# Import module
Import-Module "C:\flashdb\src\FlashDB\FlashDB.psm1"

# Create batch
$operations = @(
    @{ GoldenImageId = "golden-1"; CloneName = "clone-1"; InstancePath = "SQL"; StoragePath = "D:\CloneStorage" },
    @{ GoldenImageId = "golden-1"; CloneName = "clone-2"; InstancePath = "SQL"; StoragePath = "D:\CloneStorage" }
)

$batch = New-FlashdbBatchOperation `
    -OperationType 'clone-batch' `
    -Operations $operations `
    -ConcurrencyLimit 2 `
    -StoragePath "D:\CloneStorage"

# Execute batch
$result = Start-FlashdbBatchQueue `
    -BatchId $batch.id `
    -StoragePath "D:\CloneStorage"

# Get results
$results = Get-FlashdbBatchResults `
    -BatchId $batch.id `
    -StoragePath "D:\CloneStorage"

$results.operations | Format-Table
```

---

## Performance Considerations

- **Concurrency Limit**: Adjust based on system resources. Higher values = more parallel jobs, but may impact system performance.
- **Operation Size**: Batch sizes of 5-20 operations are typical. Larger batches may require more memory.
- **Monitoring**: Use `/progress` endpoint for real-time status instead of polling `/status` repeatedly.
- **Cancellation**: Cancelling is immediate but may not stop in-flight operations (depends on Windows job scheduler).

---

## Next Steps

Once batch operations are working reliably, the next phase (Phase 4) will add:
- **Scheduling**: Recurring batch jobs on cron-like schedules
- **Metrics Dashboard**: Performance visualization and analytics
