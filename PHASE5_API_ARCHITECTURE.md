# Phase 5: Clone Validation & Repair - API Architecture Design

## 1. Overview

This document defines the complete API architecture for integrating CloneValidationService with the REST API and GUI. The design ensures:

- **Separation of Concerns**: Validation logic in service layer, HTTP semantics in routes
- **Task Queue Integration**: Async validation and repair workflows
- **Audit Trail**: Complete operation tracking and metrics
- **Error Handling**: Comprehensive error scenarios with lock management
- **Type Safety**: Full TypeScript contracts throughout

## 2. API Endpoints Design

### 2.1 Validation Endpoints

#### POST /api/clones/:cloneId/validate
Initiate clone validation workflow.

**Request:**
```typescript
interface ValidateRequest {
  // No body required - uses cloneId from URL
  // Query parameters (optional):
  // - queue=true (default) | false - queue async or sync
  // - timeout=30000 - max wait time for sync validation
}
```

**Response (Sync Mode - queue=false, dryRun=true default):**
```typescript
interface ValidateResponse {
  success: boolean;
  data: {
    cloneId: string;
    validationId: string;  // unique validation run ID
    status: 'Healthy' | 'Unhealthy' | 'InProgress';
    findings: ValidationFinding[];  // see types below
    validatedAt: string;  // ISO timestamp
    duration: {
      elapsedMs: number;
      estimatedTotalMs?: number;
    };
    isQueued?: boolean;
  };
  message: string;
}

interface ValidationFinding {
  type: 'Info' | 'Warning' | 'Error';  // renamed from 'severity' for clarity
  code: string;  // CLONE_NOT_FOUND, PARENT_IMAGE_MISSING, etc.
  message: string;
  details?: Record<string, any>;  // field-specific details
}
```

**Response (Async Mode - queue=true):**
```typescript
interface ValidateAsyncResponse {
  success: boolean;
  data: {
    taskId: string;  // task queue ID
    validationId: string;
    status: 'pending' | 'processing';
    message: string;
    pollingUrl: string;  // GET endpoint to check status
    estimatedDurationMs: number;
  };
  message: string;
}
```

**Status Codes:**
- `200` - Validation complete (sync mode)
- `202` - Validation queued (async mode)
- `400` - Invalid request (missing cloneId, invalid queue param)
- `404` - Clone not found
- `409` - Validation already in progress (lock conflict)
- `500` - Server error

**Lock Behavior:**
```typescript
// Lock resource ID: `clone-validation:${cloneId}`
// If validation in progress:
return 409 {
  success: false,
  message: 'Validation already in progress for this clone',
  lockInfo: {
    lockedSince: string;  // ISO timestamp
    holderId: string;  // task ID or thread
    estimatedReleaseMs: number;
  }
}
```

---

#### GET /api/clones/:cloneId/validation-status
Get latest validation result for a clone.

**Query Parameters:**
```typescript
interface StatusQuery {
  validationId?: string;  // specific validation run (default: latest)
  includeHistory?: boolean;  // last 10 validations
  includeDetails?: boolean;  // full findings details
}
```

**Response:**
```typescript
interface ValidationStatusResponse {
  success: boolean;
  data: {
    cloneId: string;
    validationId: string;
    status: 'Healthy' | 'Unhealthy' | 'Unknown';
    findings: ValidationFinding[];
    validatedAt: string;  // ISO timestamp
    expiresAt?: string;  // validation cache expiry
    history?: Array<{
      validationId: string;
      status: string;
      findingsCount: number;
      validatedAt: string;
    }>;
  };
  message: string;
}
```

**Status Codes:**
- `200` - Status found
- `404` - Clone not found or no validation history

---

#### GET /api/clones/:cloneId/validation-history
Get validation history with pagination.

**Query Parameters:**
```typescript
interface HistoryQuery {
  limit?: number;  // default 20, max 100
  offset?: number;  // default 0
  status?: 'Healthy' | 'Unhealthy';  // filter
  fromDate?: string;  // ISO date
  toDate?: string;  // ISO date
}
```

**Response:**
```typescript
interface ValidationHistoryResponse {
  success: boolean;
  data: {
    cloneId: string;
    validations: Array<{
      validationId: string;
      status: string;
      findingsCount: number;
      errorCount: number;
      warningCount: number;
      validatedAt: string;
      duration: number;  // milliseconds
    }>;
    total: number;
    limit: number;
    offset: number;
  };
  message: string;
}
```

---

### 2.2 Repair Endpoints

#### POST /api/clones/:cloneId/repair
Plan or execute clone repair.

**Request:**
```typescript
interface RepairRequest {
  dryRun: boolean;  // query param: ?dryRun=true
  // or body:
  // { dryRun: true }
  
  // Optional body for state:
  validationId?: string;  // link to specific validation
  approvedByOperator?: string;  // audit trail
}
```

**Response (Dry-Run Mode):**
```typescript
interface RepairPlanResponse {
  success: boolean;
  data: {
    cloneId: string;
    repairId: string;  // plan identifier
    isDryRun: true;
    status: 'Planned' | 'Executable' | 'CannotRepair';
    plan: {
      actions: RepairAction[];
      estimatedDurationSeconds: number;
      estimatedDowntimeSeconds?: number;  // if clone in use
      requiresApproval: boolean;  // if high-risk
    };
    blockers: Array<{
      severity: 'Error' | 'Warning';
      message: string;
      action?: string;  // "approve", "cancel", "modify"
    }>;
    createdAt: string;
    expiresAt: string;  // 5 minute cache
  };
  message: string;
}

interface RepairAction {
  type: 'RemountVhd' | 'DetachDatabase' | 'AttachDatabase' | 'UpdateMetadata' | string;
  description: string;
  estimatedDurationSeconds: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  details?: Record<string, any>;
}
```

**Response (Execute Mode):**
```typescript
interface RepairExecuteResponse {
  success: boolean;
  data: {
    cloneId: string;
    repairId: string;  // execution identifier
    isDryRun: false;
    taskId?: string;  // if queued
    status: 'Completed' | 'InProgress' | 'Queued';
    result?: {
      success: boolean;
      failureReason?: string;
      actions: Array<{
        type: string;
        status: 'Succeeded' | 'Failed' | 'Skipped';
        message?: string;
        duration: number;  // milliseconds
      }>;
      totalDuration: number;
      cloneHealthAfter: 'Healthy' | 'Unhealthy';
    };
    executedAt?: string;
  };
  message: string;
}
```

**Status Codes:**
- `200` - Plan ready or execution complete (sync mode)
- `202` - Repair execution queued (async mode)
- `400` - Invalid request
- `404` - Clone not found
- `409` - Repair already in progress or clone not suitable for repair
- `422` - Validation required before repair (custom)

**Lock Behavior:**
```typescript
// Lock resource ID: `clone-repair:${cloneId}`
// Prevents concurrent repair attempts
// Also respects `clone:${cloneId}` lock if clone is in use
```

---

#### GET /api/clones/:cloneId/repair-status
Get repair execution status (for async repairs).

**Query Parameters:**
```typescript
interface RepairStatusQuery {
  repairId?: string;  // specific repair execution
  taskId?: string;  // if repair was queued
}
```

**Response:**
```typescript
interface RepairStatusResponse {
  success: boolean;
  data: {
    cloneId: string;
    repairId: string;
    status: 'Queued' | 'InProgress' | 'Completed' | 'Failed' | 'Cancelled';
    taskId?: string;
    progress?: {
      currentAction: number;
      totalActions: number;
      percentage: number;
      estimatedRemainingSeconds: number;
    };
    result?: {
      success: boolean;
      failureReason?: string;
      actions: Array<{
        type: string;
        status: string;
        message?: string;
        duration: number;
      }>;
      totalDuration: number;
    };
    startedAt?: string;
    completedAt?: string;
  };
  message: string;
}
```

---

#### POST /api/clones/:cloneId/repair/cancel
Cancel queued or in-progress repair.

**Response:**
```typescript
interface RepairCancelResponse {
  success: boolean;
  data: {
    cloneId: string;
    repairId: string;
    status: 'CancelPending' | 'Cancelled';
    message: string;
  };
  message: string;
}
```

---

### 2.3 Bulk Validation Endpoints

#### POST /api/clones/validate-all
Validate all clones in background.

**Request:**
```typescript
interface ValidateAllRequest {
  queue?: boolean;  // default true
  cloneIds?: string[];  // specific clones, or all
  maxConcurrent?: number;  // default 3
}
```

**Response:**
```typescript
interface ValidateAllResponse {
  success: boolean;
  data: {
    batchId: string;
    taskId?: string;  // if queued
    cloneCount: number;
    estimatedDurationSeconds: number;
    pollingUrl: string;
  };
  message: string;
}
```

---

#### GET /api/clones/validation-batch/:batchId
Get batch validation progress.

**Response:**
```typescript
interface BatchStatusResponse {
  success: boolean;
  data: {
    batchId: string;
    status: 'InProgress' | 'Completed' | 'Failed';
    progress: {
      completed: number;
      failed: number;
      total: number;
      percentage: number;
    };
    results: Array<{
      cloneId: string;
      status: string;
      findingsCount: number;
    }>;
  };
  message: string;
}
```

---

## 3. Audit Integration Design

### 3.1 Operations to Record

**Validation Operations:**
```typescript
interface ValidationAuditRecord {
  id: string;  // unique audit record ID
  type: 'validation-start' | 'validation-complete' | 'validation-error';
  cloneId: string;
  validationId: string;
  timestamp: Date;
  duration?: number;  // milliseconds
  
  // Validation-specific metrics:
  metrics: {
    findingsCount: number;
    errorCount: number;
    warningCount: number;
    infoCount: number;
    isHealthy: boolean;
  };
  
  operatorId?: string;  // if manual trigger
  trigger: 'manual' | 'scheduled' | 'automatic';  // why validation ran
}
```

**Repair Operations:**
```typescript
interface RepairAuditRecord {
  id: string;
  type: 'repair-plan' | 'repair-execute' | 'repair-complete' | 'repair-error' | 'repair-cancel';
  cloneId: string;
  repairId: string;
  validationId?: string;  // link to triggering validation
  timestamp: Date;
  duration?: number;  // milliseconds
  
  // Repair-specific metrics:
  metrics: {
    actionsPlanned?: number;
    actionsCompleted?: number;
    actionsFailed?: number;
    success?: boolean;
    failureReason?: string;
  };
  
  operatorId: string;  // who initiated repair
  isApproved?: boolean;
  approvalRequired?: boolean;
  approvedBy?: string;
}
```

### 3.2 Audit Recording Flow

```typescript
// In POST /api/clones/:cloneId/validate
await auditService.recordOperation({
  type: 'validation-start',
  cloneId,
  validationId: newValidationId,
  trigger: 'manual',
  operatorId: req.user?.id,
});

// After validation complete
await auditService.recordOperation({
  type: 'validation-complete',
  cloneId,
  validationId,
  duration: endTime - startTime,
  metrics: {
    findingsCount: findings.length,
    errorCount: findings.filter(f => f.type === 'Error').length,
    warningCount: findings.filter(f => f.type === 'Warning').length,
    infoCount: findings.filter(f => f.type === 'Info').length,
    isHealthy: !findings.some(f => f.type === 'Error'),
  },
});

// Similar pattern for repair operations
```

### 3.3 Audit Query Endpoints

#### GET /api/audit/operations
```typescript
interface AuditQueryResponse {
  success: boolean;
  data: {
    operations: Array<{
      id: string;
      type: string;
      cloneId?: string;
      timestamp: string;
      duration?: number;
      metrics?: Record<string, any>;
      operatorId?: string;
      result?: string;
    }>;
    total: number;
    limit: number;
    offset: number;
  };
}

// Query examples:
// GET /api/audit/operations?type=validation-complete&cloneId=xyz
// GET /api/audit/operations?type=repair-execute&status=success
// GET /api/audit/operations?fromDate=2026-06-01&toDate=2026-06-08
```

---

## 4. Error Handling Strategy

### 4.1 Error Codes and Responses

```typescript
interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
  };
}

// Error codes and scenarios:

// E001: Clone not found
{
  code: 'E001_CLONE_NOT_FOUND',
  status: 404,
  message: 'Clone xyz not found',
  details: {
    cloneId: 'xyz',
    suggestion: 'Check clone ID and list available clones'
  }
}

// E002: Validation in progress
{
  code: 'E002_VALIDATION_IN_PROGRESS',
  status: 409,
  message: 'Validation already in progress for clone xyz',
  details: {
    lockedSince: '2026-06-08T10:15:30Z',
    estimatedReleaseSeconds: 45,
    suggestion: 'Wait for current validation or force release'
  }
}

// E003: Repair in progress
{
  code: 'E003_REPAIR_IN_PROGRESS',
  status: 409,
  message: 'Repair already in progress for clone xyz'
}

// E004: Invalid state for repair
{
  code: 'E004_INVALID_REPAIR_STATE',
  status: 422,
  message: 'Cannot repair clone - parent image missing',
  details: {
    blockers: [
      {
        severity: 'Error',
        message: 'Parent golden image not found',
        action: 'recovery-required'
      }
    ]
  }
}

// E005: Validation required
{
  code: 'E005_VALIDATION_REQUIRED',
  status: 422,
  message: 'Run validation before repair',
  details: {
    validationUrl: '/api/clones/xyz/validate',
    lastValidation: null
  }
}

// E006: Lock conflict (clone in use)
{
  code: 'E006_CLONE_LOCKED',
  status: 409,
  message: 'Clone is currently in use',
  details: {
    lockedByOperation: 'create-checkpoint',
    lockedSince: '2026-06-08T10:10:00Z'
  }
}

// E007: Service error
{
  code: 'E007_SERVICE_ERROR',
  status: 500,
  message: 'Validation service error',
  details: {
    originalError: 'provider error message',
    requestId: 'req-xyz-123',
    suggestion: 'Contact support with this request ID'
  }
}
```

### 4.2 Lock Management

```typescript
// Lock hierarchy:
// 1. clone:${cloneId} - general clone lock (highest priority)
// 2. clone-validation:${cloneId} - specific to validation
// 3. clone-repair:${cloneId} - specific to repair

// Validation should respect both:
// - clone:${cloneId} (don't validate while clone being modified)
// - clone-validation:${cloneId} (prevent concurrent validations)

// Repair should respect all three

interface LockInfo {
  resourceId: string;
  lockedSince: Date;
  estimatedReleaseMs: number;
  holderId: string;  // task ID
  operation: string;
}

// getLockInfo() available for all lock conflicts
GET /api/locks/:resourceId
```

---

## 5. Task Queue Integration

### 5.1 Queue Strategy Decision

**RECOMMENDATION: Hybrid Approach**

1. **Synchronous (Direct Execution):**
   - Single validation runs: `queue=false` 
   - Dry-run repairs (planning): always sync
   - Expected time: < 5 seconds
   - Used by: interactive UI (validation check before form)

2. **Asynchronous (Queued):**
   - Initial validation runs when detailed: default `queue=true`
   - Actual repair execution: `queue=true` (always)
   - Bulk validations: always queued
   - Expected time: 5-300 seconds
   - Used by: batch operations, background checks

3. **Implementation:**
   ```typescript
   // In routes/clones.ts - new validation endpoints

   // POST /api/clones/:cloneId/validate
   const queue = req.query.queue !== 'false';  // default true
   
   if (!queue) {
     // Direct: < 5 second operations
     const result = await validationService.validateClone(cloneId);
     return res.json({ success: true, data: result });
   } else {
     // Queued: create task, return immediately
     const taskQueue = getTaskQueue();
     const task = taskQueue.enqueue('validate-clone', { cloneId });
     return res.status(202).json({
       success: true,
       data: {
         taskId: task.id,
         pollingUrl: `/api/task/${task.id}`
       }
     });
   }
   ```

### 5.2 Task Types to Support

```typescript
// Extend TaskType in taskQueue.ts:
export type TaskType = 
  | 'create-clone' 
  | 'delete-clone' 
  | 'create-checkpoint' 
  | 'restore-checkpoint' 
  | 'delete-checkpoint'
  | 'validate-clone'       // NEW
  | 'repair-clone'          // NEW
  | 'validate-all-clones'   // NEW
;

// Task payloads:
interface ValidateClonePayload {
  cloneId: string;
  validationId: string;
  auditRecordId: string;  // link to audit
}

interface RepairClonePayload {
  cloneId: string;
  repairId: string;
  isDryRun: boolean;
  validationId?: string;
  operatorId?: string;
  auditRecordId: string;
}

interface ValidateAllPayload {
  cloneIds?: string[];  // if null, all
  batchId: string;
  maxConcurrent: number;
  auditBatchId: string;
}
```

### 5.3 Task Processing & Progress

```typescript
// New endpoint to check task status:
GET /api/task/:taskId
{
  success: boolean;
  data: {
    taskId: string;
    type: 'validate-clone' | 'repair-clone' | ...;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress?: {
      percentage: number;
      currentStep?: string;
      estimatedRemainingSeconds?: number;
    };
    result?: any;  // typed based on task type
    error?: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
  };
}
```

---

## 6. Files to Modify

### 6.1 Backend Changes

#### src/api/src/routes/clones.ts
Add 6 new endpoints:
1. `POST /:cloneId/validate` - validate clone
2. `GET /:cloneId/validation-status` - get validation result
3. `GET /:cloneId/validation-history` - validation history
4. `POST /:cloneId/repair` - plan/execute repair
5. `GET /:cloneId/repair-status` - repair status
6. `POST /:cloneId/repair/cancel` - cancel repair

Also add bulk endpoints if time permits:
7. `POST /validate-all` - bulk validation
8. `GET /validation-batch/:batchId` - batch status

Key imports to add:
```typescript
import { getCloneValidationService } from '../services/cloneValidationService';
import { getAuditMetricsService } from '../services/auditMetricsService';
import { getTaskQueue } from '../services/taskQueue';
```

#### src/api/src/services/cloneValidationService.ts
ALREADY IMPLEMENTED - no changes needed
Just ensure:
- validateClone() returns proper structure
- repairClone() handles dry-run correctly
- executeRepair() returns detailed execution results
- All errors are properly logged

#### src/api/src/services/auditMetricsService.ts
Enhance audit recording:
```typescript
// Add methods to recordOperation:
async recordValidationStart(cloneId: string, validationId: string, operatorId?: string)
async recordValidationComplete(cloneId: string, validationId: string, findings: ValidationFinding[])
async recordRepairStart(cloneId: string, repairId: string, operatorId: string)
async recordRepairComplete(cloneId: string, repairId: string, success: boolean, actions: RepairAction[])

// Add query methods:
async getValidationsByClone(cloneId: string, limit: number): Promise<OperationRecord[]>
async getRepairsByClone(cloneId: string, limit: number): Promise<OperationRecord[]>
```

#### src/api/src/services/taskQueue.ts
Extend task type definitions:
```typescript
// Update TaskType enum:
export type TaskType = ... | 'validate-clone' | 'repair-clone' | 'validate-all-clones';

// Update task processing switch statement to handle new types
```

#### src/api/src/types/providerContract.ts
Add/update interfaces (likely already there):
```typescript
// Already has:
export interface ValidationFinding { }
export interface RepairAttemptMetadata { }
export interface RepairAction { }

// May need to add:
export interface CloneValidationStatus { }
export interface RepairPlan { }
```

### 6.2 Frontend Changes

#### src/gui/src/components/CloneList.tsx (or similar)
Add validation/repair buttons to clone cards:
```typescript
<button onClick={handleValidate}>Check Health</button>
<button onClick={handleRepair} disabled={!canRepair}>Repair</button>
<button onClick={handleViewHistory}>History</button>
```

#### src/gui/src/services/api.ts (create if not exists)
Add API client methods:
```typescript
export class CloneApi {
  static async validateClone(cloneId: string, queue: boolean = true) {
    return axios.post(`/api/clones/${cloneId}/validate`, {}, { 
      params: { queue } 
    });
  }
  
  static async getValidationStatus(cloneId: string) {
    return axios.get(`/api/clones/${cloneId}/validation-status`);
  }
  
  static async getValidationHistory(cloneId: string, limit: number = 20) {
    return axios.get(`/api/clones/${cloneId}/validation-history`, { 
      params: { limit } 
    });
  }
  
  static async repairClone(cloneId: string, dryRun: boolean = true) {
    return axios.post(`/api/clones/${cloneId}/repair`, { dryRun });
  }
  
  static async getRepairStatus(cloneId: string) {
    return axios.get(`/api/clones/${cloneId}/repair-status`);
  }
  
  static async cancelRepair(cloneId: string) {
    return axios.post(`/api/clones/${cloneId}/repair/cancel`);
  }
  
  static async getTaskStatus(taskId: string) {
    return axios.get(`/api/task/${taskId}`);
  }
}
```

#### src/gui/src/components/CloneValidationModal.tsx (new)
Create modal for:
- Validation results display
- Finding severity indicators
- Repair plan review
- Dry-run action preview
- Execution confirmation

#### src/gui/src/components/CloneRepairModal.tsx (new)
Create modal for:
- Repair plan display
- Action list with estimated durations
- Progress tracking (during execution)
- Results display
- Audit trail link

### 6.3 Database Schema (if using persistent audit)

```sql
-- Audit table (if implemented)
CREATE TABLE audit_operations (
  id UUID PRIMARY KEY,
  type VARCHAR(50) NOT NULL,  -- validation-start, repair-execute, etc.
  clone_id UUID REFERENCES clones(id),
  validation_id UUID,
  repair_id UUID,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  duration_ms INT,
  metrics JSONB,  -- findings count, actions, etc.
  operator_id VARCHAR(255),
  status VARCHAR(50),
  
  INDEX idx_clone_type (clone_id, type),
  INDEX idx_timestamp (timestamp),
  INDEX idx_validation_id (validation_id)
);

-- Validation history table (optional - for caching)
CREATE TABLE validation_results (
  validation_id UUID PRIMARY KEY,
  clone_id UUID NOT NULL REFERENCES clones(id),
  status VARCHAR(50),  -- Healthy, Unhealthy
  findings JSONB,
  validated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_clone_validated (clone_id, validated_at DESC)
);

-- Repair tracking table (optional)
CREATE TABLE repair_executions (
  repair_id UUID PRIMARY KEY,
  clone_id UUID NOT NULL REFERENCES clones(id),
  validation_id UUID REFERENCES validation_results(validation_id),
  is_dry_run BOOLEAN,
  status VARCHAR(50),  -- Planned, InProgress, Completed
  actions JSONB,
  result JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  
  INDEX idx_clone_repair (clone_id, started_at DESC)
);
```

---

## 7. Request/Response Flow Examples

### 7.1 Quick Validation Flow (Synchronous)

```
USER clicks "Check Health" on Clone Card
  ↓
POST /api/clones/abc-123/validate?queue=false
  ↓
CloneValidationService.validateClone('abc-123')
  - Check clone exists
  - Validate VHD path
  - Check parent image
  - Check mount state
  - Check database attachment
  ↓
return 200 {
  findings: [
    { type: 'Warning', code: 'ATTACHED_BUT_NO_DB', message: '...' }
  ],
  isHealthy: true
}
  ↓
GUI displays green "Healthy" badge with 1 warning
```

### 7.2 Background Validation Flow (Async)

```
USER clicks "Full Validation" on Clone
  ↓
POST /api/clones/abc-123/validate?queue=true
  ↓
TaskQueue.enqueue('validate-clone', { cloneId: 'abc-123' })
  ↓
return 202 {
  taskId: 'task-456',
  pollingUrl: '/api/task/task-456'
}
  ↓
GUI shows "Validation in progress..." spinner
  ↓
Poll GET /api/task/task-456 every 2 seconds
  - Shows progress percentage
  - When done: display full results
```

### 7.3 Repair Plan Flow (Dry-Run)

```
USER clicks "Repair" and confirms modal
  ↓
POST /api/clones/abc-123/repair?dryRun=true
  ↓
CloneValidationService.validateClone() first
  ↓
CloneValidationService.repairClone(true)
  - Analyze findings
  - Create action plan
  - Estimate duration
  ↓
return 200 {
  plan: {
    actions: [
      { type: 'RemountVhd', description: '...', estimatedDurationSeconds: 60 }
    ],
    estimatedDurationSeconds: 60
  }
}
  ↓
GUI shows plan with "Execute Repair?" button
```

### 7.4 Repair Execution Flow (Async)

```
USER clicks "Execute Repair"
  ↓
POST /api/clones/abc-123/repair?dryRun=false
  ↓
TaskQueue.enqueue('repair-clone', { ... })
  ↓
AuditService.recordRepairStart()
  ↓
return 202 {
  taskId: 'task-789',
  repairId: 'repair-xyz'
}
  ↓
GUI polls GET /api/clones/abc-123/repair-status?repairId=repair-xyz
  ↓
Show progress: "Remounting VHD... 30 of 60 seconds"
  ↓
When complete:
  AuditService.recordRepairComplete()
  ↓
return {
  status: 'Completed',
  result: {
    success: true,
    actions: [
      { type: 'RemountVhd', status: 'Succeeded', duration: 58000 }
    ],
    totalDuration: 58000
  }
}
  ↓
GUI shows "Repair successful!" with results
```

---

## 8. Lock Management Examples

### 8.1 Validation Lock Conflict

```typescript
// Scenario: User starts validation while one is already running

POST /api/clones/abc-123/validate
  ↓
Lock resource: 'clone-validation:abc-123'
  ↓
Lock already held by task-456 since 10:15:30
  ↓
return 409 {
  code: 'E002_VALIDATION_IN_PROGRESS',
  message: 'Validation already in progress',
  lockInfo: {
    lockedSince: '2026-06-08T10:15:30Z',
    holderId: 'task-456',
    estimatedReleaseMs: 45000
  }
}
  ↓
GUI shows: "Validation in progress. Estimated 45 seconds remaining."
GUI shows "Force Cancel" button if admin
```

### 8.2 Clone Locked by Other Operation

```typescript
// Scenario: Validation starts while checkpoint creation happening

POST /api/clones/abc-123/validate
  ↓
Check lock: 'clone:abc-123' (general clone lock)
  ↓
Lock held by 'create-checkpoint' operation
  ↓
return 409 {
  code: 'E006_CLONE_LOCKED',
  message: 'Clone is currently in use',
  lockInfo: {
    lockedByOperation: 'create-checkpoint',
    lockedSince: '2026-06-08T10:10:00Z',
    estimatedReleaseMs: 120000
  }
}
  ↓
GUI shows: "Clone is busy with another operation. Try again in 2 minutes."
```

---

## 9. Type Safety & Contracts

### 9.1 Backend Types

```typescript
// src/api/src/types/validation.ts (new file)
export interface CloneValidationRequest {
  cloneId: string;
  queue?: boolean;
  timeout?: number;
  validationId?: string;
}

export interface CloneValidationResponse {
  cloneId: string;
  validationId: string;
  status: 'Healthy' | 'Unhealthy' | 'InProgress';
  findings: ValidationFinding[];
  validatedAt: Date;
  duration: { elapsedMs: number; estimatedTotalMs?: number };
  isQueued?: boolean;
}

export interface CloneRepairRequest {
  cloneId: string;
  dryRun: boolean;
  validationId?: string;
  approvedByOperator?: string;
}

export interface CloneRepairResponse {
  cloneId: string;
  repairId: string;
  isDryRun: boolean;
  status: 'Planned' | 'InProgress' | 'Completed' | 'Failed';
  plan?: RepairPlan;
  result?: RepairResult;
}

export interface RepairPlan {
  actions: RepairAction[];
  estimatedDurationSeconds: number;
  estimatedDowntimeSeconds?: number;
  requiresApproval: boolean;
  blockers: Array<{ severity: string; message: string }>;
}

export interface RepairResult {
  success: boolean;
  failureReason?: string;
  actions: Array<{
    type: string;
    status: 'Succeeded' | 'Failed' | 'Skipped';
    message?: string;
    duration: number;
  }>;
  totalDuration: number;
}
```

### 9.2 Frontend Types

```typescript
// src/gui/src/types/validation.ts (new file)
export interface ValidationStatus {
  cloneId: string;
  validationId: string;
  status: 'Healthy' | 'Unhealthy' | 'Unknown' | 'InProgress';
  findings: ValidationFinding[];
  validatedAt: Date;
}

export interface ValidationFinding {
  type: 'Info' | 'Warning' | 'Error';
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface RepairPlan {
  actions: RepairAction[];
  estimatedDurationSeconds: number;
  blockers: Array<{ severity: string; message: string }>;
}

export interface RepairAction {
  type: string;
  description: string;
  estimatedDurationSeconds: number;
  riskLevel: 'Low' | 'Medium' | 'High';
}

// Async task tracking
export interface AsyncTask {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error?: string;
}
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

```typescript
// src/api/src/routes/__tests__/clones.validation.test.ts
describe('Clone Validation Endpoints', () => {
  it('POST /validate should validate clone (sync)', async () => {
    const res = await request(app)
      .post('/api/clones/abc-123/validate')
      .query({ queue: false });
    
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('validationId');
    expect(res.body.data).toHaveProperty('findings');
  });
  
  it('POST /validate should queue validation (async)', async () => {
    const res = await request(app)
      .post('/api/clones/abc-123/validate')
      .query({ queue: true });
    
    expect(res.status).toBe(202);
    expect(res.body.data).toHaveProperty('taskId');
  });
  
  it('POST /validate should return 409 if already validating', async () => {
    // Start first validation
    await request(app).post('/api/clones/abc-123/validate');
    
    // Second should conflict
    const res = await request(app)
      .post('/api/clones/abc-123/validate');
    
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('E002_VALIDATION_IN_PROGRESS');
  });
});
```

### 10.2 Integration Tests

```typescript
// src/api/src/routes/__tests__/clones.repair.integration.test.ts
describe('Clone Repair Flow', () => {
  it('should plan repair and execute', async () => {
    // 1. Validate
    const validateRes = await request(app)
      .post('/api/clones/abc-123/validate')
      .query({ queue: false });
    expect(validateRes.status).toBe(200);
    
    // 2. Get plan
    const planRes = await request(app)
      .post('/api/clones/abc-123/repair')
      .send({ dryRun: true });
    expect(planRes.status).toBe(200);
    expect(planRes.body.data.plan).toBeDefined();
    
    // 3. Execute
    const execRes = await request(app)
      .post('/api/clones/abc-123/repair')
      .send({ dryRun: false });
    expect(execRes.status).toBe(202);
    
    // 4. Check status
    const taskId = execRes.body.data.taskId;
    await new Promise(r => setTimeout(r, 500));  // wait for processing
    
    const statusRes = await request(app)
      .get(`/api/task/${taskId}`);
    expect(statusRes.status).toBe(200);
  });
});
```

---

## 11. Deployment Checklist

- [ ] Add validation/repair endpoints to clones.ts
- [ ] Enhance auditMetricsService with new record methods
- [ ] Extend taskQueue.ts with validate-clone and repair-clone types
- [ ] Create validation types file
- [ ] Create API client service (api.ts)
- [ ] Create CloneValidationModal component
- [ ] Create CloneRepairModal component
- [ ] Add buttons to clone list/card component
- [ ] Wire up polling for async operations
- [ ] Add error boundary and error display
- [ ] Create audit query endpoints (optional Phase 8)
- [ ] Write unit tests for endpoints
- [ ] Write integration tests for workflows
- [ ] Update API documentation
- [ ] Create database schema (if persistent audit)
- [ ] Migrate existing data (if applicable)

---

## 12. Success Criteria

1. **Validation endpoint** works synchronously and asynchronously
2. **Repair endpoint** creates accurate plans and executes them
3. **Lock management** prevents concurrent operations
4. **Audit trail** records all operations with metrics
5. **GUI** displays validation results and repair actions
6. **Polling** correctly tracks async task progress
7. **Error handling** provides actionable error messages
8. **Type safety** throughout backend and frontend
9. **All tests** pass with >80% coverage
10. **Performance** validation completes in < 5 seconds (sync)

