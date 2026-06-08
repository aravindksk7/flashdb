# Specification Documentation Index

**Project**: FlashDB  
**Feature**: Checkpoint Database Orphan Fix  
**Status**: Complete & Ready for Implementation  
**Date**: 2026-06-08  
**Version**: 1.0  

---

## Document Overview

This specification package contains 6 comprehensive documents defining the solution for orphaned checkpoint databases in FlashDB. Below is the reading guide and document map.

---

## Document Map

### 1. **SPECIFICATION_SUMMARY.md** 
**Length**: ~2 pages  
**Audience**: Managers, Team Leads, Quick Reviewers  
**Purpose**: Executive overview and quick reference  

**Contents**:
- Problem statement
- Root causes (3 items)
- Solution overview (4 phases)
- Key design decisions table
- Success criteria checklist
- Timeline and risk mitigation
- File list to modify

**When to Read**: First - get the big picture in 5 minutes

---

### 2. **SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md**
**Length**: ~40 pages  
**Audience**: Developers, Architects, DBAs, Project Managers  
**Purpose**: Complete technical specification with all details  

**Contents**:
- Executive summary
- Functional requirements (6 FR items)
- Non-functional requirements (5 NFR items)
- Constraints and dependencies
- Acceptance criteria with test cases
- 6-phase implementation plan
- Risk analysis and mitigation
- Success metrics and timeline
- Deployment strategy
- Monitoring and maintenance
- Appendices (property resolution, SQL patterns, example logs)

**When to Read**: Second - dive deep into requirements and acceptance criteria

---

### 3. **SPECIFICATION_CODE_CHANGES.md**
**Length**: ~30 pages  
**Audience**: Backend Developers, Code Reviewers  
**Purpose**: Exact code changes needed with examples and tests  

**Contents**:
- Phase 1: Schema migration SQL
- Phase 2: Database capture logic in taskWorker.ts
- Phase 3: Persistence method in metadataService.ts
- Phase 4: Safe drop helper implementation
- Phase 5: Deletion flow integration
- Unit test examples for each phase
- Integration tests
- Deployment checklist
- Rollback procedure

**When to Read**: During implementation - copy/paste ready code

---

### 4. **SPECIFICATION_VERIFICATION_PLAN.md**
**Length**: ~25 pages  
**Audience**: QA Engineers, Testers, Developers  
**Purpose**: Step-by-step verification procedures and test cases  

**Contents**:
- Pre-implementation baseline queries
- Phase 1-6 verification checklists
- Detailed verification steps with SQL/bash commands
- Post-deployment monitoring (weekly)
- Success metrics and acceptance sign-off
- Troubleshooting guide
- Expected logs and outputs

**When to Read**: During/after implementation - verify each phase is correct

---

### 5. **SPECIFICATION_ARCHITECTURE.md**
**Length**: ~20 pages  
**Audience**: System Architects, Tech Leads, Advanced Developers  
**Purpose**: Visual diagrams and architectural decisions  

**Contents**:
- System architecture overview (ASCII art)
- Data flow diagrams:
  - Checkpoint creation flow
  - Checkpoint deletion flow
- State diagram: Checkpoint lifecycle
- Database schema diagram (before/after)
- Component responsibilities
- Error handling flow
- Complete sequence diagram
- Technology stack & dependencies

**When to Read**: Before implementation - understand system design

---

### 6. **SPECIFICATION_INDEX.md** (This Document)
**Length**: ~5 pages  
**Audience**: Everyone  
**Purpose**: Navigation guide for the specification package  

**Contents**:
- Document map
- Reading guides by role
- Quick reference section
- How to navigate sections
- Glossary of terms

**When to Read**: First - understand what documents exist

---

## Reading Guide by Role

### Project Manager
**Read in this order**:
1. SPECIFICATION_SUMMARY.md (5 min)
2. SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md - Executive Summary only (5 min)
3. Timeline section (2 min)
4. Risk Analysis section (3 min)

**Total**: 15 minutes  
**Outcome**: Understand timeline, risks, and success criteria

---

### System Architect
**Read in this order**:
1. SPECIFICATION_ARCHITECTURE.md (20 min)
2. SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md:
   - Functional Requirements section (5 min)
   - Non-Functional Requirements section (5 min)
   - Constraints section (3 min)
3. SPECIFICATION_CODE_CHANGES.md - Architecture overview (5 min)

**Total**: 38 minutes  
**Outcome**: Understand system design, data flows, and technical constraints

---

### Backend Developer (Implementing)
**Read in this order**:
1. SPECIFICATION_SUMMARY.md (5 min)
2. SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md:
   - Functional Requirements (10 min)
   - Implementation Plan (15 min)
3. SPECIFICATION_CODE_CHANGES.md (30 min)
4. SPECIFICATION_VERIFICATION_PLAN.md - your phase section (10 min)

**Total**: 70 minutes  
**Outcome**: Ready to implement with exact code and test cases

---

### QA/Test Engineer
**Read in this order**:
1. SPECIFICATION_SUMMARY.md (5 min)
2. SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md - Acceptance Criteria section (15 min)
3. SPECIFICATION_VERIFICATION_PLAN.md (entire) (25 min)
4. SPECIFICATION_CODE_CHANGES.md - Unit test examples (10 min)

**Total**: 55 minutes  
**Outcome**: Ready to test each phase with verification procedures

---

### Database Administrator
**Read in this order**:
1. SPECIFICATION_SUMMARY.md (5 min)
2. SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md:
   - Schema requirements (FR-1) (3 min)
   - Constraints (5 min)
3. SPECIFICATION_CODE_CHANGES.md - Phase 1 (5 min)
4. SPECIFICATION_VERIFICATION_PLAN.md - Phase 1 verification (10 min)
5. Deployment strategy in main spec (5 min)

**Total**: 33 minutes  
**Outcome**: Ready to deploy schema changes and monitor

---

### Code Reviewer
**Read in this order**:
1. SPECIFICATION_SUMMARY.md (5 min)
2. SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md - Acceptance Criteria (10 min)
3. SPECIFICATION_CODE_CHANGES.md (30 min)
4. SPECIFICATION_VERIFICATION_PLAN.md - Troubleshooting section (5 min)

**Total**: 50 minutes  
**Outcome**: Ready to review code for correctness and quality

---

## Quick Reference

### Problem Summary
```
Checkpoint databases created by PowerShell (FlashDB_Checkpoint_cp_<timestamp>_<id>)
are never stored in metadata. When checkpoints are deleted, physical SQL Server 
databases remain orphaned and consume storage.
```

### Solution Summary
```
4-phase implementation:
1. Add checkpointDatabaseName column to dbo.Checkpoints
2. Extract database name from PowerShell response
3. Store database name in metadata after creation
4. Drop physical database when deleting checkpoints
```

### Success Criteria
```
✓ Column exists in schema
✓ New checkpoints have database names captured
✓ Checkpoint deletion drops physical databases
✓ Protected databases never dropped
✓ E2E test passes: Create → Store → Delete → Cleanup
✓ All tests pass, no regressions
✓ Backwards compatible with NULL handling
```

### Timeline
```
Phase 1 (Schema):      30 min   (Database Admin)
Phase 2 (Capture):     1 hr     (Developer)
Phase 3 (Storage):     1.5 hrs  (Developer)
Phase 4 (Drop Helper): 1.5 hrs  (Developer)
Phase 5 (Integration): 1 hr     (Developer)
Phase 6 (Testing):     2 hrs    (Dev/QA)
─────────────────────────────────
Total:                 8.5 hrs

With code review/merge: 9.5 hrs
```

### Risk Level
```
Overall Risk: MEDIUM (✓ manageable with guardrails)

Critical Risks:
  • Accidental system database drop → MITIGATED (protected list)
  • Incomplete property capture → MITIGATED (both variants handled)
  • Performance degradation → MITIGATED (async operations)
```

### Files to Modify
```
1. src/api/src/db/schema.sql          (Phase 1: +1 line)
2. src/api/src/services/taskWorker.ts (Phase 2,4,5: +100 lines)
3. src/api/src/services/metadataService.ts (Phase 3: +30 lines)
```

---

## Section Navigation

### In Main Specification (SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md)

| Section | Pages | Key Content |
|---------|-------|-------------|
| Executive Summary | 1-2 | Problem, impact, overview |
| Functional Requirements | 3-8 | FR-1 to FR-6 detailed specs |
| Non-Functional Requirements | 8-10 | Performance, safety, logging |
| Constraints | 10-11 | Technical, business, data |
| Acceptance Criteria | 12-20 | Test cases for each phase |
| Implementation Plan | 20-28 | 6-phase breakdown with code |
| Risk Analysis | 28-32 | 4 key risks + mitigation |
| Timeline | 32-33 | Phase breakdown |
| Deployment Strategy | 33-35 | Pre/during/post deployment |
| Monitoring | 35-36 | Daily checks, metrics |
| Appendices | 37-40 | SQL patterns, logs |

---

## Glossary of Terms

**Checkpoint**: A point-in-time copy of a clone database state (includes VHDX file and metadata)

**Orphaned Database**: A physical SQL Server database that exists but has no metadata record pointing to it

**Checkpoint Database**: The physical SQL Server database created by `New-FlashdbCheckpoint` PowerShell cmdlet (e.g., `FlashDB_Checkpoint_cp_20260608_xyz`)

**Metadata**: Database records in `dbo.Checkpoints` table that track checkpoints

**Phase N**: Implementation phases (1=Schema, 2=Capture, 3=Storage, 4=Drop Helper, 5=Integration, 6=Testing)

**Acceptance Criteria**: Specific test cases that must pass to verify implementation is correct

**Non-fatal Error**: An error that's logged but doesn't fail the operation (e.g., database drop fails but checkpoint deletion continues)

**SINGLE_USER Mode**: SQL Server database mode that disconnects all other users before allowing operations

**Protected Database**: System databases that must never be dropped (master, model, msdb, tempdb, SQL_DATABASE)

**Cascade Delete**: Foreign key constraint that deletes child records when parent is deleted (e.g., Checkpoints deleted when Clone deleted)

---

## How to Use This Package

### For New Team Members
1. Start with SPECIFICATION_SUMMARY.md
2. Then read SPECIFICATION_ARCHITECTURE.md for visual understanding
3. Then read the main specification for your role
4. Refer to SPECIFICATION_CODE_CHANGES.md when coding

### For Implementation
1. Use SPECIFICATION_CODE_CHANGES.md as your development guide
2. Follow SPECIFICATION_VERIFICATION_PLAN.md to verify your work
3. Reference main spec for acceptance criteria
4. Check SPECIFICATION_ARCHITECTURE.md if you get confused on design

### For Testing
1. Use SPECIFICATION_VERIFICATION_PLAN.md as your test script
2. Reference SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md for acceptance criteria
3. Run the exact SQL/bash commands from verification plan
4. Document results in sign-off section

### For Troubleshooting
1. Check "Troubleshooting" section in SPECIFICATION_VERIFICATION_PLAN.md
2. Look for your error scenario
3. Follow diagnostic steps to find root cause
4. Refer to error handling diagrams in SPECIFICATION_ARCHITECTURE.md

---

## Document Version History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-06-08 | Spec Agent | Initial draft - 6 documents, 120 pages |
| | | | Complete spec ready for development |

---

## Approval & Sign-Off

### Required Approvals

- [ ] **Architecture Approval** - System Architect
  - Date: _____________
  - Comments: _____________________________________________________

- [ ] **Technical Feasibility** - Lead Developer
  - Date: _____________
  - Comments: _____________________________________________________

- [ ] **Database Review** - DBA
  - Date: _____________
  - Comments: _____________________________________________________

- [ ] **QA Sign-Off** - QA Lead
  - Date: _____________
  - Comments: _____________________________________________________

- [ ] **Project Manager Approval** - PM
  - Date: _____________
  - Comments: _____________________________________________________

---

## Next Steps

1. **Immediate** (Day 1):
   - [ ] Distribute this specification package to team
   - [ ] Schedule specification review meeting (30 min)
   - [ ] Get architecture approval

2. **Pre-Implementation** (Days 2-3):
   - [ ] Schedule implementation kickoff meeting
   - [ ] Assign developers to phases
   - [ ] Set up testing environment
   - [ ] Prepare rollback procedure

3. **Implementation** (Days 4-8):
   - [ ] Implement phases 1-6 per timeline
   - [ ] Run verification tests after each phase
   - [ ] Conduct code reviews
   - [ ] Document any deviations from spec

4. **Pre-Deployment** (Day 9):
   - [ ] Run full integration test suite
   - [ ] Backup production database
   - [ ] Schedule deployment window
   - [ ] Brief operations team

5. **Post-Deployment** (Week 1-2):
   - [ ] Monitor daily metrics
   - [ ] Watch error logs
   - [ ] Run weekly validation queries
   - [ ] Debrief and document lessons learned

---

## Contact & Questions

For questions about this specification:

1. **Architecture/Design Questions** → System Architect
2. **Implementation Questions** → Lead Developer
3. **Database Questions** → Database Administrator
4. **Testing Questions** → QA Lead
5. **General Questions** → Project Manager

---

## References

Related Documentation:
- FlashDB API Documentation (RAML/Swagger)
- PowerShell Provider Documentation
- SQL Server Best Practices Guide
- Project Memory: feedback_api-implementation-checklist.md
- Project Memory: feedback_gui-implementation-checklist.md

---

**End of Index**

---

## Quick Links to Document Sections

### Main Specification Sections
- [Executive Summary](SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md#1-executive-summary)
- [Functional Requirements](SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md#2-functional-requirements)
- [Acceptance Criteria](SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md#5-acceptance-criteria)
- [Implementation Plan](SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md#6-implementation-plan)
- [Risk Analysis](SPECIFICATION_CHECKPOINT_DATABASE_ORPHAN_FIX.md#7-risk-analysis)

### Code Changes by Phase
- [Phase 1: Schema](SPECIFICATION_CODE_CHANGES.md#phase-1-schema-extension)
- [Phase 2: Capture](SPECIFICATION_CODE_CHANGES.md#phase-2-capture-database-name-from-powershell)
- [Phase 3: Storage](SPECIFICATION_CODE_CHANGES.md#phase-3-persist-database-name-to-metadata)
- [Phase 4: Drop Helper](SPECIFICATION_CODE_CHANGES.md#phase-4-safe-database-drop-helper)
- [Phase 5: Integration](SPECIFICATION_CODE_CHANGES.md#phase-5-checkpoint-deletion-with-database-drop)

### Verification Steps
- [Phase 1 Verification](SPECIFICATION_VERIFICATION_PLAN.md#phase-1-verification-schema-extension)
- [Phase 2 Verification](SPECIFICATION_VERIFICATION_PLAN.md#phase-2-verification-database-capture)
- [Phase 3 Verification](SPECIFICATION_VERIFICATION_PLAN.md#phase-3-verification-database-storage)
- [Phase 4 Verification](SPECIFICATION_VERIFICATION_PLAN.md#phase-4-verification-safe-database-drop)
- [Phase 5 Verification](SPECIFICATION_VERIFICATION_PLAN.md#phase-5-verification-deletion-integration)
- [Post-Deployment Monitoring](SPECIFICATION_VERIFICATION_PLAN.md#post-deployment-verification-week-1)

### Architecture
- [System Architecture](SPECIFICATION_ARCHITECTURE.md#system-architecture-overview)
- [Data Flow Diagrams](SPECIFICATION_ARCHITECTURE.md#data-flow-diagrams)
- [Database Schema](SPECIFICATION_ARCHITECTURE.md#database-schema-diagram)
- [Component Responsibilities](SPECIFICATION_ARCHITECTURE.md#component-responsibilities)

---

**Document Package Complete** ✓
- 6 documents
- 120+ pages
- 100+ test cases
- Ready for development

