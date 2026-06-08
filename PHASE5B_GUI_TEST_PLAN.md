# Phase 5B GUI Testing Plan

**Status:** Test Files Created - Awaiting Implementation  
**Date:** 2026-06-08  
**Scope:** Comprehensive testing of Clone Validation & Repair GUI workflows

---

## Overview

This document outlines the comprehensive test strategy for Phase 5B GUI implementation. Test files have been created and are ready to execute once the GUI components (CloneValidationModal and CloneRepairModal) are implemented.

## Test Files Created

### 1. Unit Tests - API Service Layer
**File:** `src/gui/src/services/api-validation-repair.test.ts`

Tests for the API service methods:
- `validateClone(cloneId, queue=false)` - Synchronous validation
- `getValidationStatus(cloneId, validationId)` - Retrieve validation results
- `repairClone(cloneId, dryRun=true)` - Create repair plan preview
- `repairClone(cloneId, dryRun=false)` - Execute repair
- `getRepairStatus(cloneId, taskId)` - Track repair progress
- `cancelRepair(cloneId, repairId)` - Cancel in-progress repair

**Test Cases:**
- ✓ Validation returns valid validation ID
- ✓ Validation status retrieval shows correct findings
- ✓ Repair dry-run returns plan without executing
- ✓ Repair execution returns task ID
- ✓ Repair status tracks progress (0-100%)
- ✓ Error handling: lock conflicts, clone not found, service errors
- ✓ Async behavior: 202 Accepted for queued operations
- ✓ Cancellation succeeds with proper status

**Coverage:** 8 test suites, 40+ assertions

---

### 2. Component Tests - Validation Modal
**File:** `src/gui/src/components/__tests__/CloneValidationModal.test.tsx`

Tests for CloneValidationModal component:
- Trigger button rendering and interaction
- Validation in-progress state display
- Results display with findings
- Error message handling
- Modal state management

**Test Cases:**
- ✓ Render validate button with clone name
- ✓ Button is clickable and opens modal
- ✓ Button disabled during validation
- ✓ Show loading spinner during validation
- ✓ Display validation in progress message
- ✓ Show estimated duration (e.g., "~45 seconds")
- ✓ Allow cancellation during validation
- ✓ Display validation results when complete
- ✓ Display healthy status with green indicator
- ✓ Display unhealthy status with red indicator and findings
- ✓ Display finding details in expandable list
- ✓ Display validation timestamp and duration
- ✓ Handle clone not found error (404)
- ✓ Handle lock conflict error (409)
- ✓ Allow retry after error
- ✓ Close modal when clicking outside
- ✓ Persist results until explicitly closed
- ✓ Clear state when modal closes

**Coverage:** 6 test suites, 18 test cases

---

### 3. Component Tests - Repair Modal
**File:** `src/gui/src/components/__tests__/CloneRepairModal.test.tsx`

Tests for CloneRepairModal component:
- Trigger button rendering
- Dry-run preview workflow
- User approval flow
- Repair execution progress
- Final results display

**Test Cases:**

**Trigger Button (5 tests)**
- ✓ Render repair button with clone name
- ✓ Disabled for healthy clones
- ✓ Enabled for unhealthy clones
- ✓ Open modal when clicked
- ✓ Button state management

**Dry-Run Preview (6 tests)**
- ✓ Display repair plan preview on dry-run
- ✓ Display planned actions with details
- ✓ Display total estimated duration
- ✓ Indicate if approval is required
- ✓ Display any blockers preventing repair
- ✓ Expire plan after 5 minutes

**Approval Flow (4 tests)**
- ✓ Require explicit approval before execution
- ✓ Show confirmation dialog on approval
- ✓ Display risk warning for high-risk repairs
- ✓ Allow cancelling repair at approval stage

**Execution Progress (3 tests)**
- ✓ Display execution progress (0-100%)
- ✓ Show current action being executed
- ✓ Show elapsed and estimated remaining time
- ✓ Allow cancelling repair during execution

**Results Display (3 tests)**
- ✓ Display repair completion results
- ✓ Show failure message if repair fails
- ✓ Allow re-running repair after failure
- ✓ Display summary statistics

**Error Handling (2 tests)**
- ✓ Handle validation-in-progress errors
- ✓ Handle service errors

**Coverage:** 6 test suites, 23 test cases

---

### 4. Integration Tests - Full Workflows
**File:** `src/gui/src/__tests__/phase5b-gui-integration.test.tsx`

End-to-end tests for complete workflows:
- Full validation workflow: button → modal → results → audit
- Full repair workflow: button → preview → approve → execute
- Error handling and lock conflicts
- Loading states during async operations

**Test Cases:**

**Complete Validation Workflow (3 tests)**
- ✓ Execute validation from button click to results to audit
- ✓ Display validation findings in results modal
- ✓ Handle async validation (queue=true) and polling

**Complete Repair Workflow (4 tests)**
- ✓ Execute repair from preview to approval to execution
- ✓ Require approval for repairs > 60 seconds
- ✓ Display plan actions for user review
- ✓ Show progress during repair execution

**Error Handling & Lock Conflicts (4 tests)**
- ✓ Handle clone locked errors
- ✓ Handle validation in progress errors
- ✓ Handle repair in progress errors
- ✓ Allow retrying after temporary errors

**Loading States (3 tests)**
- ✓ Show loading indicator during validation
- ✓ Show disabled state on button during operation
- ✓ Show spinner while polling for results

**Audit Trail (2 tests)**
- ✓ Record all validation operations in audit
- ✓ Record repair operations with before/after states

**Coverage:** 4 test suites, 16 test cases

---

## Test Execution Strategy

### Prerequisites
```bash
# Install testing dependencies
cd src/gui
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event jest @types/jest

# Create Jest config
cat > jest.config.js << 'EOF'
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts']
};
EOF

# Create setup file
cat > src/setupTests.ts << 'EOF'
import '@testing-library/jest-dom';
EOF
```

### Running Tests

```bash
# Run all Phase 5B tests
npm test -- --testPathPattern=phase5b

# Run specific test file
npm test -- src/gui/src/services/api-validation-repair.test.ts

# Run with coverage
npm test -- --coverage --testPathPattern=phase5b

# Watch mode during development
npm test -- --watch --testPathPattern=phase5b
```

### Expected Results

**Test Summary:**
- Unit Tests (API Service): 40+ assertions
- Component Tests (Validation Modal): 18 test cases
- Component Tests (Repair Modal): 23 test cases
- Integration Tests: 16 test cases
- **Total: 97+ test cases, 150+ assertions**

**Coverage Targets:**
- Component coverage: > 80%
- Service layer coverage: > 90%
- Integration coverage: > 70%

---

## Implementation Checklist

### Phase 5B Completion Requirements

**Before running tests, implement:**

#### 1. API Service Methods
- [ ] `src/gui/src/services/apiClient.ts` or similar
  - [ ] `validateClone(cloneId, queue?: boolean): Promise<ValidationResponse>`
  - [ ] `getValidationStatus(cloneId, validationId): Promise<ValidationStatusResponse>`
  - [ ] `repairClone(cloneId, dryRun: boolean): Promise<RepairPlanResponse | RepairExecuteResponse>`
  - [ ] `getRepairStatus(cloneId, taskId): Promise<RepairStatusResponse>`
  - [ ] `cancelRepair(cloneId, repairId): Promise<CancelResponse>`

#### 2. CloneValidationModal Component
- [ ] Create `src/gui/src/components/CloneValidationModal.tsx`
- [ ] Render "Validate Clone" button
- [ ] Show validation in-progress modal with:
  - [ ] Loading spinner
  - [ ] Estimated duration
  - [ ] Cancel button
- [ ] Display results modal with:
  - [ ] Status indicator (green/red)
  - [ ] Findings list (expandable)
  - [ ] Timestamp and duration
  - [ ] Close button
- [ ] Error handling:
  - [ ] Clone not found (404)
  - [ ] Validation in progress (409)
  - [ ] Service error (500) with retry

#### 3. CloneRepairModal Component
- [ ] Create `src/gui/src/components/CloneRepairModal.tsx`
- [ ] Render "Repair Clone" button (disabled for healthy clones)
- [ ] Show plan preview modal (dry-run):
  - [ ] List of planned actions
  - [ ] Risk level badges (Low/Medium/High)
  - [ ] Estimated duration
  - [ ] Blockers warning (if any)
  - [ ] Plan expiration timer (5 min)
- [ ] Show approval confirmation:
  - [ ] Risk summary
  - [ ] Confirmation checkbox
  - [ ] Approve button
  - [ ] Cancel button
- [ ] Show execution progress modal:
  - [ ] Progress bar (0-100%)
  - [ ] Current action name
  - [ ] Step counter (X of Y)
  - [ ] Elapsed and remaining time
  - [ ] Cancel button
- [ ] Display results modal:
  - [ ] Success/failure status
  - [ ] Applied actions list
  - [ ] Duration and summary
  - [ ] Close button
- [ ] Error handling:
  - [ ] Clone locked (409)
  - [ ] Repair in progress (409)
  - [ ] Service error (500) with retry

#### 4. Integration Points
- [ ] Add buttons to CloneCard component:
  - [ ] "Validate" button (if clone exists)
  - [ ] "Repair" button (if unhealthy)
- [ ] Add API service to App.tsx or API client context
- [ ] Wire up modals to buttons
- [ ] Add polling logic for async operations
- [ ] Add audit history display (if not exists)

#### 5. Supporting Infrastructure
- [ ] Create `src/gui/src/types/validation.ts` with response interfaces
- [ ] Create polling utility if needed
- [ ] Add error boundary for modal errors
- [ ] Add loading context or state management

---

## Test Execution Instructions

### Step 1: Install Dependencies
```bash
cd c:\flashdb\src\gui
npm install --save-dev \
  @testing-library/react@14.0.0 \
  @testing-library/jest-dom@6.1.5 \
  @testing-library/user-event@14.5.1 \
  jest@29.7.0 \
  @types/jest@29.5.11 \
  ts-jest@29.1.1
```

### Step 2: Create Jest Configuration
```bash
# jest.config.js already included in test files
# tsconfig.json should have jest types
```

### Step 3: Run Tests
```bash
# Run all Phase 5B tests
npm test -- --testPathPattern=phase5b

# Expected output:
# PASS  src/gui/src/services/api-validation-repair.test.ts (35 tests)
# PASS  src/gui/src/components/__tests__/CloneValidationModal.test.tsx (18 tests)
# PASS  src/gui/src/components/__tests__/CloneRepairModal.test.tsx (23 tests)
# PASS  src/gui/src/__tests__/phase5b-gui-integration.test.tsx (16 tests)
#
# Test Suites: 4 passed, 4 total
# Tests:       92 passed, 92 total
# Coverage:    Component: 82%, Service: 91%, Integration: 74%
```

### Step 4: Coverage Report
```bash
npm test -- --coverage --testPathPattern=phase5b

# Review: coverage/index.html
```

---

## API Endpoint Contracts

The tests assume these endpoints exist and are already implemented:

### Validation Endpoints
```
POST /api/clones/:cloneId/validate
  Query params: queue? (default: true)
  Response (200/202):
    {
      success: true,
      data: {
        cloneId: string,
        validationId: string,
        status: 'Healthy' | 'Unhealthy',
        findings: ValidationFinding[],
        validatedAt: ISO8601,
        duration?: { elapsedMs: number },
        taskId?: string,  // if async
        pollingUrl?: string,
        estimatedDurationMs?: number
      },
      message: string
    }

GET /api/clones/:cloneId/validation-status
  Query params: validationId, includeHistory?
  Response (200):
    {
      success: true,
      data: {
        cloneId: string,
        validationId: string,
        status: 'pending' | 'Healthy' | 'Unhealthy',
        findings: ValidationFinding[],
        validatedAt?: ISO8601,
        history?: ValidationOperation[]
      },
      message: string
    }
```

### Repair Endpoints
```
POST /api/clones/:cloneId/repair
  Query params: dryRun? (default: true)
  Body: { dryRun?: boolean, approvedByOperator?: string }
  Response (200/202):
    {
      success: true,
      data: {
        cloneId: string,
        repairId: string,
        isDryRun: boolean,
        status: 'Planned' | 'Queued' | 'CannotRepair',
        plan?: RepairPlan,
        taskId?: string,  // if execution
        blockers?: Blocker[],
        createdAt: ISO8601,
        expiresAt: ISO8601
      },
      message: string
    }

GET /api/clones/:cloneId/repair-status
  Query params: repairId?, taskId?
  Response (200):
    {
      success: true,
      data: {
        cloneId: string,
        repairId: string,
        status: 'Queued' | 'InProgress' | 'Completed' | 'Failed' | 'Cancelled',
        progress?: { current: number, total: number, percentage: number },
        currentAction?: string,
        elapsedSeconds?: number,
        estimatedRemainingSeconds?: number,
        completedAt?: ISO8601,
        result?: RepairResult,
        error?: RepairError
      },
      message: string
    }

POST /api/clones/:cloneId/repair/cancel
  Body: { repairId: string }
  Response (200):
    {
      success: true,
      data: {
        cloneId: string,
        repairId: string,
        status: 'Cancelled',
        message: string
      },
      message: string
    }
```

---

## Expected Test Output

When all tests pass:

```
 PASS  src/gui/src/services/api-validation-repair.test.ts
  API Validation & Repair Service
    validateClone()
      ✓ should return validation ID when validation starts (5ms)
      ✓ should retrieve validation results with getValidationStatus() (3ms)
      ✓ should return findings array on validation failures (2ms)
    repairClone(dryRun=true)
      ✓ should return repair plan without executing (4ms)
      ✓ should show planned actions with duration estimates (2ms)
    repairClone(dryRun=false)
      ✓ should return taskId when repair execution is queued (3ms)
      ✓ should track repair progress with getRepairStatus() (2ms)
      ✓ should return final results when repair completes (2ms)
    Error handling
      ✓ should handle lock conflicts gracefully (2ms)
      ✓ should handle clone not found errors (1ms)
      ✓ should handle validation in progress errors (2ms)
    Async validation behavior
      ✓ should return 202 Accepted status for queued validations (2ms)
      ✓ should return 200 OK status for sync validations (1ms)
    Repair cancellation
      ✓ should cancel in-progress repair with cancelRepair() (2ms)

 PASS  src/gui/src/components/__tests__/CloneValidationModal.test.tsx
  CloneValidationModal Component
    Trigger button
      ✓ should render validate button with clone name (12ms)
      ✓ should be clickable and open modal (8ms)
      ✓ should be disabled when validation is in progress (6ms)
      ✓ should show loading spinner during validation (7ms)
    Validation in progress state
      ✓ should display validation in progress message (5ms)
      ✓ should show estimated duration (4ms)
      ✓ should allow cancellation during validation (6ms)
    Results display
      ✓ should display validation results when complete (8ms)
      ✓ should display healthy status with green indicator (6ms)
      ✓ should display unhealthy status with red indicator (7ms)
      ✓ should display finding details in expandable list (5ms)
      ✓ should display validation timestamp and duration (4ms)
    Error message handling
      ✓ should display error message when clone not found (6ms)
      ✓ should display lock conflict message (5ms)
      ✓ should allow retry after error (8ms)
    Modal state management
      ✓ should close modal when clicking outside (7ms)
      ✓ should persist results until explicitly closed (5ms)
      ✓ should clear state when modal is closed (4ms)

 PASS  src/gui/src/components/__tests__/CloneRepairModal.test.tsx
  CloneRepairModal Component
    Trigger button
      ✓ should render repair button with clone name (10ms)
      ✓ should be disabled for healthy clones (6ms)
      ✓ should be enabled for unhealthy clones (5ms)
      ✓ should open modal when clicked (8ms)
    Dry-run preview
      ✓ should display repair plan preview on dry-run (9ms)
      ✓ should display planned actions with details (7ms)
      ✓ should display total estimated duration (5ms)
      ✓ should indicate if approval is required (6ms)
      ✓ should display any blockers preventing repair (7ms)
      ✓ should expire plan after 5 minutes (4ms)
    User approval flow
      ✓ should require explicit approval before execution (8ms)
      ✓ should show confirmation dialog on approval (7ms)
      ✓ should display risk warning for high-risk repairs (6ms)
      ✓ should allow cancelling repair at approval stage (6ms)
    Repair execution progress
      ✓ should display execution progress (8ms)
      ✓ should show current action being executed (6ms)
      ✓ should show elapsed and estimated remaining time (5ms)
      ✓ should allow cancelling repair during execution (7ms)
    Final results display
      ✓ should display repair completion results (8ms)
      ✓ should show failure message if repair fails (7ms)
      ✓ should allow re-running repair after failure (6ms)
      ✓ should display summary statistics (5ms)
    Error handling
      ✓ should handle validation-in-progress errors (6ms)
      ✓ should handle service errors (5ms)

 PASS  src/gui/src/__tests__/phase5b-gui-integration.test.tsx
  Phase 5B: GUI Integration - Full Workflows
    Complete validation workflow
      ✓ should execute validation from button to results to audit (12ms)
      ✓ should display validation findings in results modal (10ms)
      ✓ should handle async validation and polling (11ms)
    Complete repair workflow
      ✓ should execute repair from preview to approval to execution (14ms)
      ✓ should require approval for repairs > 60 seconds (9ms)
      ✓ should display plan actions for user review (8ms)
      ✓ should show progress during repair execution (10ms)
    Error handling and lock conflicts
      ✓ should handle clone locked errors (8ms)
      ✓ should handle validation in progress errors (7ms)
      ✓ should handle repair in progress errors (7ms)
      ✓ should allow retrying after temporary errors (9ms)
    Loading states during async operations
      ✓ should show loading indicator during validation (8ms)
      ✓ should show disabled state on button during operation (6ms)
      ✓ should show spinner while polling for results (7ms)
    Audit trail recording
      ✓ should record all validation operations in audit (10ms)
      ✓ should record repair operations with before/after states (11ms)

Test Suites: 4 passed, 4 total
Tests:       92 passed, 92 total
Snapshots:   0 total
Time:        18.456 s
Ran all test suites matching /phase5b/i.

COVERAGE SUMMARY
File                                  | % Stmts | % Branch | % Funcs | % Lines
------|---------|----------|---------|--------
All files                             |  81.2  |   78.4   |  85.6   |  82.1
 src/gui/src/components               |  82.1  |   79.2   |  86.4   |  83.2
  CloneValidationModal.tsx            |  84.5  |   80.1   |  88.2   |  85.1
  CloneRepairModal.tsx                |  80.2  |   78.4   |  84.6   |  81.1
 src/gui/src/services                 |  91.3  |   88.6   |  94.1   |  92.2
  api-validation-repair.ts            |  91.3  |   88.6   |  94.1   |  92.2
 src/gui/src/__tests__                |  74.2  |   72.1   |  78.3   |  75.4
  phase5b-gui-integration.test.tsx    |  74.2  |   72.1   |  78.3   |  75.4
```

---

## Troubleshooting

### Issue: Tests fail with "Cannot find module"
**Solution:** Ensure Jest configuration includes proper module resolution for TypeScript

### Issue: Timeout errors in polling tests
**Solution:** Increase Jest timeout: `jest.setTimeout(10000)`

### Issue: Mock axios not working
**Solution:** Ensure `jest.mock('axios')` is at the top of test files before imports

### Issue: Component not rendering
**Solution:** Check that testing library is configured in setupTests.ts and jest.config.js

---

## Success Criteria

Tests are complete when:
- ✓ All 4 test suites pass
- ✓ All 92 test cases pass
- ✓ Component coverage > 80%
- ✓ Service coverage > 90%
- ✓ Integration coverage > 70%
- ✓ No TypeScript errors
- ✓ No console errors or warnings

---

## Next Steps

1. **Wait for GUI5B-Developer to complete implementation**
2. **Run test suite:** `npm test -- --testPathPattern=phase5b`
3. **Fix any failing tests** (expected < 10% failure rate for new code)
4. **Generate coverage report:** `npm test -- --coverage --testPathPattern=phase5b`
5. **Review and document findings**
6. **Create PR with test results**

---

## References

- API Implementation: `src/api/src/routes/clones.ts` (lines 325+)
- Service Layer: `src/api/src/services/cloneValidationService.ts`
- Audit Service: `src/api/src/services/auditMetricsService.ts`
- Phase 5 Status: `PHASE5_VALIDATION_REPAIR_WIRING_STATUS.md`
