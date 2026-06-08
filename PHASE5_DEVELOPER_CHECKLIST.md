# Phase 5 Developer Implementation Checklist

## Pre-Implementation Review

- [ ] Read PHASE5_API_ARCHITECTURE.md (main design document - 400+ lines)
- [ ] Review PHASE5_IMPLEMENTATION_SUMMARY.md (executive summary)
- [ ] Understand lock management strategy (Section 8 in architecture)
- [ ] Confirm task queue design (Section 5 in architecture)
- [ ] Review error codes and responses (Section 4 in architecture)

## Phase 5A: Backend Endpoints (src/api/src/routes/clones.ts)

### Validation Endpoints

- [ ] **POST /api/clones/:cloneId/validate**
  - [ ] Parse query param: `queue` (default true)
  - [ ] Create unique validationId (`validation-${cloneId}-${Date.now()}`)
  - [ ] Sync mode (queue=false):
    - [ ] Call `validationService.validateClone(cloneId)` directly
    - [ ] Record audit: `recordOperation(type: 'validation-start')`
    - [ ] Return 200 with findings and timestamp
  - [ ] Async mode (queue=true):
    - [ ] Call `taskQueue.enqueue('validate-clone', { cloneId, validationId })`
    - [ ] Record audit: `recordOperation(type: 'validation-start')`
    - [ ] Return 202 with taskId and pollingUrl
  - [ ] Handle errors:
    - [ ] 404 if clone not found
    - [ ] 409 if validation already in progress (lock conflict)
    - [ ] 500 if service error
  - [ ] Lock handling:
    - [ ] Try lock on `clone-validation:${cloneId}` (read from existing lock middleware)
    - [ ] Also check `clone:${cloneId}` lock
    - [ ] Return 409 with lockInfo if conflict

- [ ] **GET /api/clones/:cloneId/validation-status**
  - [ ] Query params: `validationId` (optional), `includeHistory` (default false)
  - [ ] Fetch latest validation result from cache/service
  - [ ] If includeHistory=true, fetch last 10 validations
  - [ ] Return 200 with status and findings
  - [ ] Handle errors:
    - [ ] 404 if clone not found
    - [ ] 404 if no validation history exists

- [ ] **GET /api/clones/:cloneId/validation-history**
  - [ ] Query params: `limit` (default 20, max 100), `offset` (default 0), `status` (filter), `fromDate`, `toDate`
  - [ ] Fetch paginated validation history from audit table
  - [ ] Filter by status if provided
  - [ ] Filter by date range if provided
  - [ ] Return 200 with array of validation records
  - [ ] Include: validationId, status, findingsCount, timestamp, duration

### Repair Endpoints

- [ ] **POST /api/clones/:cloneId/repair**
  - [ ] Parse body: `{ dryRun: boolean, validationId?: string, approvedByOperator?: string }`
  - [ ] Or query param: `?dryRun=true|false`
  - [ ] Create unique repairId (`repair-${cloneId}-${Date.now()}`)
  - [ ] Dry-run mode (dryRun=true):
    - [ ] Call `validationService.repairClone(cloneId, true)` directly
    - [ ] Return 200 with plan (actions, estimated duration, blockers)
    - [ ] No lock held, no audit record (plan only)
  - [ ] Execute mode (dryRun=false):
    - [ ] Record audit: `recordOperation(type: 'repair-execute')`
    - [ ] Lock on `clone-repair:${cloneId}` and `clone:${cloneId}`
    - [ ] Enqueue `'repair-clone'` task with repairId, validationId
    - [ ] Return 202 with taskId and pollingUrl
  - [ ] Handle errors:
    - [ ] 404 if clone not found
    - [ ] 409 if repair already in progress (lock conflict)
    - [ ] 409 if clone locked by other operation
    - [ ] 422 if invalid repair state (parent image missing, etc.)
    - [ ] 422 if validation required but not done

- [ ] **GET /api/clones/:cloneId/repair-status**
  - [ ] Query params: `repairId` (optional), `taskId` (optional)
  - [ ] If taskId: get task status from queue
  - [ ] If repairId: fetch repair execution result from cache/audit
  - [ ] Return 200 with status, progress (if in progress), results (if complete)
  - [ ] Include: currentAction, totalActions, percentage, estimatedRemaining

- [ ] **POST /api/clones/:cloneId/repair/cancel**
  - [ ] Query param: `repairId` or `taskId`
  - [ ] Call `taskQueue.cancel(taskId)` if queued
  - [ ] Update repair status to 'Cancelled'
  - [ ] Record audit: `recordOperation(type: 'repair-cancel')`
  - [ ] Return 200 with confirmation
  - [ ] Handle errors:
    - [ ] 404 if repair not found
    - [ ] 400 if repair already completed

### Bulk Endpoints (Optional - Phase 5B)

- [ ] **POST /api/clones/validate-all**
  - [ ] Body: `{ cloneIds?: string[], maxConcurrent?: number }`
  - [ ] Create batchId (`batch-${Date.now()}`)
  - [ ] Enqueue `'validate-all-clones'` task
  - [ ] Return 202 with batchId, taskId, estimatedDuration

- [ ] **GET /api/clones/validation-batch/:batchId**
  - [ ] Fetch batch status from queue
  - [ ] Return 200 with progress (completed, failed, total, percentage)
  - [ ] Include results array: { cloneId, status, findingsCount }

## Phase 5B: Audit Service Enhancements (src/api/src/services/auditMetricsService.ts)

- [ ] **Add validation-specific methods:**
  - [ ] `recordValidationStart(cloneId, validationId, operatorId?): Promise<void>`
  - [ ] `recordValidationComplete(cloneId, validationId, findings: ValidationFinding[]): Promise<void>`
    - Calculate metrics: errorCount, warningCount, infoCount, isHealthy
    - Store duration
  - [ ] `recordValidationError(cloneId, validationId, error: Error): Promise<void>`

- [ ] **Add repair-specific methods:**
  - [ ] `recordRepairStart(cloneId, repairId, validationId?, operatorId?): Promise<void>`
  - [ ] `recordRepairComplete(cloneId, repairId, success, actions: RepairAction[]): Promise<void>`
    - Calculate metrics: actionsPlanned, actionsCompleted, actionsFailed
  - [ ] `recordRepairCancel(cloneId, repairId, operatorId): Promise<void>`

- [ ] **Add audit query methods:**
  - [ ] `getValidationsByClone(cloneId, limit?): Promise<OperationRecord[]>`
  - [ ] `getRepairsByClone(cloneId, limit?): Promise<OperationRecord[]>`
  - [ ] `getOperationsByType(type, cloneId?, limit?): Promise<OperationRecord[]>`

- [ ] **Update existing methods:**
  - [ ] Ensure `recordOperation()` accepts all required fields
  - [ ] Ensure metrics are stored in JSONB/JSON format
  - [ ] Ensure timestamp precision is sufficient

## Phase 5C: Task Queue Extension (src/api/src/services/taskQueue.ts)

- [ ] **Extend TaskType enum:**
  - [ ] Add `'validate-clone'`
  - [ ] Add `'repair-clone'`
  - [ ] Add `'validate-all-clones'`

- [ ] **Add task payloads:**
  - [ ] ValidateClonePayload: { cloneId, validationId, auditRecordId }
  - [ ] RepairClonePayload: { cloneId, repairId, isDryRun, validationId?, operatorId?, auditRecordId }
  - [ ] ValidateAllPayload: { cloneIds?, batchId, maxConcurrent, auditBatchId }

- [ ] **Update task processor:**
  - [ ] Add case for 'validate-clone' → call validationService.validateClone
  - [ ] Add case for 'repair-clone' → call validationService.executeRepair
  - [ ] Add case for 'validate-all-clones' → loop and queue individual validations
  - [ ] Record audit records for start/complete
  - [ ] Update task status as it progresses

- [ ] **Add progress tracking:**
  - [ ] Store current action index
  - [ ] Store estimated remaining time
  - [ ] Update task metrics during processing

## Phase 5D: Frontend Services (src/gui/src/services/api.ts)

Create new file: `src/gui/src/services/api.ts`

- [ ] **CloneValidationApi class:**
  - [ ] `validateClone(cloneId, queue=true)` → POST /validate
  - [ ] `getValidationStatus(cloneId)` → GET /validation-status
  - [ ] `getValidationHistory(cloneId, limit=20)` → GET /validation-history

- [ ] **CloneRepairApi class:**
  - [ ] `repairClone(cloneId, dryRun=true)` → POST /repair
  - [ ] `getRepairStatus(cloneId)` → GET /repair-status
  - [ ] `cancelRepair(cloneId)` → POST /repair/cancel

- [ ] **TaskPollingApi class:**
  - [ ] `getTaskStatus(taskId)` → GET /task/:taskId
  - [ ] `pollTaskUntilComplete(taskId, interval=2000, maxWait=300000)` → Returns Promise

- [ ] **Error handling:**
  - [ ] Parse error responses with code and message
  - [ ] Throw ApiError with type info
  - [ ] Handle network timeouts gracefully

- [ ] **Request/response types:**
  - [ ] Import from types file (or define locally)
  - [ ] Use async/await, not callbacks
  - [ ] Support abort signals for cancellation

## Phase 5E: Frontend Components (src/gui/src/components/)

Create new file: `src/gui/src/components/CloneValidationModal.tsx`

- [ ] **Component structure:**
  - [ ] Props: { cloneId, isOpen, onClose, onRepair }
  - [ ] State: validationStatus, isLoading, findings, error

- [ ] **UI elements:**
  - [ ] Status badge: 'Healthy' (green) or 'Unhealthy' (red)
  - [ ] Findings list with severity icons (Error 🔴, Warning 🟡, Info ℹ️)
  - [ ] "View Details" link for each finding
  - [ ] Last validated timestamp
  - [ ] "Repair" button (enabled only if unhealthy)
  - [ ] "Close" button

- [ ] **Behavior:**
  - [ ] Load validation status on open
  - [ ] Show loading spinner during validation
  - [ ] Display findings grouped by severity
  - [ ] Handle errors with user-friendly messages
  - [ ] On "Repair" click: call onRepair(cloneId) and close modal

Create new file: `src/gui/src/components/CloneRepairModal.tsx`

- [ ] **Component structure:**
  - [ ] Props: { cloneId, validationId, isOpen, onClose, onSuccess }
  - [ ] State: repairStep ('plan'|'review'|'progress'|'results'), plan, result, taskId

- [ ] **Step 1 - Plan (dryRun=true):**
  - [ ] Show repair plan with actions
  - [ ] Display estimated duration
  - [ ] Show risk level per action
  - [ ] "Approve and Execute" button
  - [ ] "Cancel" button

- [ ] **Step 2 - Progress (during execution):**
  - [ ] Poll repair status every 2 seconds
  - [ ] Show progress bar with percentage
  - [ ] Display current action description
  - [ ] Show estimated time remaining
  - [ ] "Cancel Repair" button (if cancellable)

- [ ] **Step 3 - Results (complete):**
  - [ ] Show success/failure status
  - [ ] Display executed actions with results
  - [ ] Show total duration
  - [ ] "Close" button
  - [ ] Link to audit trail

- [ ] **Error handling:**
  - [ ] Display blocker messages (if repair cannot proceed)
  - [ ] Show action-specific failure reasons
  - [ ] Offer "View Details" for troubleshooting

Integrate into clone list/card component:

- [ ] **CloneCard or CloneList component:**
  - [ ] Add "Check Health" button → opens CloneValidationModal
  - [ ] Add "Repair" button → opens CloneRepairModal
  - [ ] Show health status badge (Healthy/Unhealthy/Unknown)
  - [ ] Show last validated timestamp
  - [ ] Show validation warning count

## Phase 5F: Testing (Unit & Integration)

Create unit tests: `src/api/src/routes/__tests__/clones.validation.test.ts`

- [ ] Test sync validation endpoint
- [ ] Test async validation endpoint
- [ ] Test validation status endpoint
- [ ] Test lock conflict handling
- [ ] Test error responses (E001, E002, E003, E004, etc.)
- [ ] Test validation history pagination
- [ ] Target: 80%+ code coverage

Create integration tests: `src/api/src/routes/__tests__/clones.repair.integration.test.ts`

- [ ] Test full validation → repair flow
- [ ] Test dry-run planning
- [ ] Test async execution with polling
- [ ] Test concurrent operation prevention
- [ ] Test audit trail recording
- [ ] Target: 100% of critical paths

Create frontend tests: `src/gui/src/components/__tests__/CloneValidationModal.test.tsx`

- [ ] Test modal opens/closes
- [ ] Test validation result display
- [ ] Test findings rendering by severity
- [ ] Test repair button interaction
- [ ] Test error message display

## Phase 5G: Database Schema (Optional - Persistent Audit)

If implementing persistent audit (Phase 8 prerequisite):

- [ ] Create `audit_operations` table
  - Columns: id, type, clone_id, validation_id, repair_id, timestamp, duration_ms, metrics, operator_id, status
  - Indexes: clone_type, timestamp, validation_id

- [ ] Create `validation_results` table (cache)
  - Columns: validation_id, clone_id, status, findings (JSONB), validated_at
  - Index: clone_validated (DESC)

- [ ] Create `repair_executions` table
  - Columns: repair_id, clone_id, validation_id, is_dry_run, status, actions (JSONB), result (JSONB), started_at, completed_at
  - Index: clone_repair

- [ ] Create migration scripts
- [ ] Update data models/types

## Phase 5H: Type Safety

Create types file: `src/api/src/types/validation.ts`

- [ ] Export CloneValidationRequest
- [ ] Export CloneValidationResponse
- [ ] Export CloneRepairRequest
- [ ] Export CloneRepairResponse
- [ ] Export RepairPlan
- [ ] Export RepairResult
- [ ] Export ValidationFinding (ensure consistency with providerContract)

Create types file: `src/gui/src/types/validation.ts`

- [ ] Export ValidationStatus
- [ ] Export ValidationFinding
- [ ] Export RepairPlan
- [ ] Export RepairAction
- [ ] Export AsyncTask
- [ ] Ensure parity with backend types

## Phase 5I: Documentation

- [ ] Update API documentation with new endpoints
- [ ] Add endpoint examples and cURL commands
- [ ] Document error codes and responses
- [ ] Document lock behavior and conflict resolution
- [ ] Document audit trail schema
- [ ] Add screenshots of UI components

## Phase 5J: Integration & Verification

- [ ] Run full test suite: `npm test`
- [ ] Build passes: `npm run build`
- [ ] No TypeScript errors
- [ ] All endpoints return correct status codes
- [ ] Locks prevent concurrent operations
- [ ] Audit trail records all operations
- [ ] Task polling works correctly
- [ ] GUI displays results properly
- [ ] Error messages are helpful
- [ ] Performance meets targets (validation < 5 sec sync, < 30 sec async)

## Phase 5K: Git Commits

- [ ] Commit 1: Add validation/repair endpoints to clones.ts
- [ ] Commit 2: Enhance auditMetricsService with new methods
- [ ] Commit 3: Extend taskQueue with validation/repair task types
- [ ] Commit 4: Create frontend API services
- [ ] Commit 5: Create CloneValidationModal and CloneRepairModal components
- [ ] Commit 6: Integrate validation/repair buttons into clone list
- [ ] Commit 7: Add unit and integration tests
- [ ] Commit 8: Update documentation
- [ ] Commit 9: Create types files for frontend/backend
- [ ] Final commit: Phase 5 complete - Clone Validation & Repair API wiring

## Success Verification

- [ ] All 8 endpoints working (validation, repair, bulk)
- [ ] Lock management prevents race conditions
- [ ] Audit trail complete with metrics
- [ ] GUI displays results and handles async operations
- [ ] Error handling covers all scenarios
- [ ] Type safety throughout codebase
- [ ] Tests pass with >80% coverage
- [ ] No regressions in existing functionality
- [ ] Performance targets met

## Dependencies & Prerequisites

- CloneValidationService: ✓ Implemented (validateClone, repairClone, executeRepair)
- AuditMetricsService: ✓ Exists (needs enhancement)
- TaskQueue: ✓ Exists (needs extension)
- Lock middleware: ✓ Exists (used in other endpoints)
- Express app: ✓ Ready
- React GUI: ✓ Ready

## Estimated Timeline

- Endpoints (Phase 5A): 2-3 hours
- Audit service (Phase 5B): 1 hour
- Task queue (Phase 5C): 1 hour
- Frontend API (Phase 5D): 1 hour
- Components (Phase 5E): 2-3 hours
- Testing (Phase 5F): 2 hours
- Database (Phase 5G): 1 hour (if needed)
- Types (Phase 5H): 30 minutes
- Documentation (Phase 5I): 1 hour
- Integration (Phase 5J): 1-2 hours

**Total: 12-15 hours for complete Phase 5 implementation**

