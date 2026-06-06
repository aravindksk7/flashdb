# Phase 5b.3 - Quick Reference for Tester

## Role
**Tester for Phase 5b.3: Queue Persistence with Database Backing**

## Current Status
🔄 **WAITING FOR MESSAGE FROM queue-persistence AGENT**

## What I'm Ready To Do

### 1. Test File Created
- Location: `/src/api/src/services/__tests__/queue-persistence.test.ts`
- Tests: 44 comprehensive test cases
- Framework: Jest
- Format: TypeScript

### 2. Test Scenarios (11 Categories)

| # | Scenario | Tests | Status |
|---|----------|-------|--------|
| 1 | Enqueue → Verify in DB | 3 | ✅ Ready |
| 2 | Process Task → Status Update | 3 | ✅ Ready |
| 3 | Restart Worker → Recovery | 3 | ✅ Ready |
| 4 | Task Completion → Archive | 3 | ✅ Ready |
| 5 | DB Failure → Fallback | 3 | ✅ Ready |
| 6 | Concurrent Operations → Safety | 3 | ✅ Ready |
| 7 | Performance Latency | 3 | ✅ Ready |
| 8 | No Task Loss | 3 | ✅ Ready |
| 9 | Retry Tracking | 2 | ✅ Ready |
| 10 | Archive Cleanup | 3 | ✅ Ready |
| 11 | Status Transitions | 3 | ✅ Ready |

## When queue-persistence Implementation Arrives

### Immediate Actions
1. **Read the message** from queue-persistence agent
2. **Review database schema** and implementation details
3. **Understand integration points:**
   - TaskQueue service modifications
   - Database connection method
   - Fallback mechanism
   - Error handling strategy

### Run Tests
```bash
cd c:\flashdb\src\api

# Build the project
npm run build

# Run all queue persistence tests
npm test -- queue-persistence

# Run all taskQueue tests
npm test -- taskQueue

# Run with coverage
npm test -- --coverage
```

### Validate Each Scenario

#### Scenario 1-3: Core Operations
```bash
npm test -- queue-persistence --testNamePattern="Enqueue|Process Task|Restart"
```
✓ Verify: Tasks save to DB, status updates, restart recovery works

#### Scenario 4-6: Safety & Resilience
```bash
npm test -- queue-persistence --testNamePattern="Completion|Failure|Concurrent"
```
✓ Verify: Archives working, fallback active, no race conditions

#### Scenario 7-11: Performance & Durability
```bash
npm test -- queue-persistence --testNamePattern="Performance|Task Loss|Retry|Archive|Transitions"
```
✓ Verify: Latency <10ms, no data loss, retry tracking, cleanup works

## Key Files to Reference

### Documentation
- `/PHASE_5B3_TESTER_STATUS.md` - Current test status
- `/PHASE_5B3_TESTING_GUIDE.md` - Detailed testing guide
- `/PHASE_5B3_QUICK_REFERENCE.md` - This file

### Code
- `/src/api/src/services/__tests__/queue-persistence.test.ts` - New tests
- `/src/api/src/services/__tests__/taskQueue.test.ts` - Existing tests
- `/src/api/src/services/taskQueue.ts` - Service implementation
- `/src/api/src/routes/queue.ts` - API routes

## Success Criteria Checklist

When tests pass:
- [ ] 44/44 queue-persistence tests pass
- [ ] All existing taskQueue tests pass
- [ ] Enqueue latency < 10ms
- [ ] Status update latency < 10ms
- [ ] Bulk operations efficient (100 in <100ms)
- [ ] No task loss on restart
- [ ] Concurrent operations safe
- [ ] Database failure gracefully handled
- [ ] Archive functionality complete
- [ ] All metrics accurate

## Report Template

When testing is complete, report should state:

```
Queue persistence implementation verified.

✅ All 44 tests pass
✅ No task loss on restart
✅ Performance SLAs met (<10ms)
✅ Concurrent operations safe
✅ Database failure resilience confirmed
✅ Archive functionality verified
✅ Retry tracking working
✅ Status transitions correct

Database-backed queue ready for production.
Ready for Phase 5b.4: Advanced Distributed Features.
```

## Agent Communication

When ready to report:
- **Send message to**: developer (or coordinator)
- **Include**: Test results, performance metrics, any issues found
- **Format**: Structured report with pass/fail status for each scenario

## Phase Handoff

After Phase 5b.3 Complete:
→ Phase 5b.4: Advanced Distributed Features
- Multi-worker coordination
- Distributed queue consistency
- Load balancing
- Priority handling
- Advanced scheduling

---

**Tester**: Claude Haiku 4.5 (AI Agent)
**Role**: Phase 5b.3 Validation
**Status**: Ready and waiting for implementation message
**Created**: 2026-06-06
