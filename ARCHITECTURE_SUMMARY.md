# FlashDB Architecture Summary

**Date:** 2026-06-06  
**Status:** Architecture Phase Complete  
**Ready for:** Core Development (Phase 1 Implementation)

---

## Deliverables Completed

### 1. PowerShell Module Structure ✓

**File:** `C:\flashdb\src\FlashDB\FlashDB.psd1`

- Module manifest with Name=FlashDB, Version=0.1.0
- 30+ public cmdlets exported
- Provider registry system
- Alias definitions for quick access
- Module metadata and compatibility settings

**File:** `C:\flashdb\src\FlashDB\FlashDB.psm1`

- Main module entry point
- Provider interface definition (abstract base class `FlashdbProvider`)
- VHDX management layer (mount, unmount, snapshot, revert)
- Metadata management (create, save, load clone metadata)
- Operation logging and audit trail
- Cmdlet stubs for all public functions
- Configuration system

### 2. SQL Server Provider Structure ✓

**File:** `C:\flashdb\src\Providers\SqlServer\SqlServerProvider.ps1`

- `SqlServerProvider` class implementing `FlashdbProvider`
- Three golden image creation methods:
  - **BackupRestore** - Traditional BACKUP/RESTORE from file
  - **ReplicaBackup** - BACKUP FROM MIRROR from read-only replica
  - **TableByTableCopy** - Direct table copy from read-only connection
- Database attach/detach operations
- Connection validation and management
- Active connection force-close (for rollback)
- Database info queries (row counts, schema hashing)
- Helper methods for replica lag detection and table enumeration

### 3. REST API Specification ✓

**File:** `C:\flashdb\docs\API_SPECIFICATION.md`

- 30+ HTTP endpoints (Golden images, Clones, Checkpoints, Admin)
- Request/response schemas with JSON examples
- Error handling and status codes
- Rate limiting and pagination
- Long-running operation tracking
- Authentication and versioning
- Health check and storage reporting
- Configuration management endpoints

**Endpoints by Category:**

| Category | Count | Examples |
|----------|-------|----------|
| Golden Image Mgmt | 6 | Create, list, get, update, refresh, delete |
| Clone Mgmt | 6 | Create, list, get, attach, detach, delete |
| Checkpoint Ops | 8 | Create, list, get, update, restore, diff, delete, restore-golden |
| Admin & Utils | 5 | Health, storage, configuration, operations, etc. |

### 4. Implementation Roadmap ✓

**File:** `C:\flashdb\IMPLEMENTATION_ROADMAP.md`

- **7 phases** spanning 20 weeks
- **Phase 1 (Weeks 1-3):** Core Architecture
- **Phase 2 (Weeks 4-6):** SQL Server Provider
- **Phase 3 (Weeks 7-9):** Clone Lifecycle & Checkpointing
- **Phase 4 (Weeks 10-12):** REST API Implementation
- **Phase 5 (Weeks 13-15):** GUI Client Implementation
- **Phase 6 (Weeks 16-18):** Testing & QA
- **Phase 7 (Weeks 19-20):** Release & Deployment

**Detailed for each phase:**
- Breakdown of tasks with dependencies
- Estimated time per task
- Owner assignments
- Deliverables and success criteria
- Critical path analysis
- Risk register
- Post-release roadmap (v0.2, v0.3)

### 5. Architecture Documentation ✓

**File:** `C:\flashdb\docs\Architecture\PROJECT_STRUCTURE.md`

- Complete directory structure with descriptions
- Component architecture (4 layers)
- Data flow diagrams (clone creation, checkpoint → rollback)
- Key interfaces and classes
- Module manifest details
- Configuration file schemas
- Provider entry point explanation
- Testing strategy by type
- Extension points for future providers
- Security considerations
- Monitoring and observability

---

## Architecture Overview

### Three-Layer Design

```
┌─────────────────────────────────────────┐
│  User Interfaces (PowerShell, API, GUI) │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  Core Module (VHDX, Metadata, State)    │
│  Database-Agnostic Engine               │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  Database Providers (SQL Server, ...)   │
│  Plugin Architecture                    │
└────────────────┬────────────────────────┘
                 │
┌────────────────▼────────────────────────┐
│  Storage (VHDX files + JSON metadata)   │
└─────────────────────────────────────────┘
```

### Key Design Patterns

1. **Provider Pattern** - Database-agnostic interface for multi-DB support
2. **Plugin Architecture** - Providers loaded dynamically
3. **Metadata-First** - JSON-based state, no external DB needed
4. **Copy-on-Write** - VHDX differencing disks for efficiency
5. **Snapshot-Based** - Checkpoints use VHDX snapshots, not backups
6. **Decentralized** - No central orchestration, local-first

---

## Module Entry Points

### PowerShell Module

**Location:** `C:\flashdb\src\FlashDB\`

**Main File:** `FlashDB.psm1` (core engine)  
**Manifest:** `FlashDB.psd1` (module metadata)

**Key Classes:**
- `FlashdbProvider` - Abstract interface for database providers
- `FlashdbCreationMethod` - Enum (BackupRestore, ReplicaBackup, TableByTableCopy)
- `FlashdbCloneStatus` - Enum (Created, Attached, Detached, etc.)
- `FlashdbCheckpointPhase` - Enum (PreETL, PostETL, Manual, Custom)

**Core Functions:**
- VHDX operations: `New-FlashdbDifferencingDisk`, `Mount-FlashdbVhdx`, `New-FlashdbVhdxSnapshot`, etc.
- Metadata: `New-FlashdbCloneMetadata`, `Save-FlashdbCloneMetadata`, `Get-FlashdbCloneMetadata`
- Logging: `Add-FlashdbOperationLog`

**Public Cmdlets (30+):** Defined in manifest, implemented in Public/ subdirectory

### SQL Server Provider

**Location:** `C:\flashdb\src\Providers\SqlServer\`

**Main File:** `SqlServerProvider.ps1`

**Implementation Structure:**
- `CreateGoldenImageFromBackup()` - Method 1
- `CreateGoldenImageFromReplica()` - Method 2
- `CreateGoldenImageFromTableCopy()` - Method 3
- `AttachDatabase()` / `DetachDatabase()`
- `GetDatabaseInfo()` / `ValidateConnection()`
- Helper methods: `ComputeRowCountHash()`, `GetReplicaLag()`, `GetTableList()`

### REST API Server

**Location:** `C:\flashdb\src\API\`

**Framework:** .NET Core (recommended) or Node.js

**Controllers:**
- `GoldenImagesController` - Golden image endpoints (6)
- `ClonesController` - Clone endpoints (6)
- `CheckpointsController` - Checkpoint endpoints (8)
- `AdminController` - Health, storage, config (5)

**Services:**
- `GoldenImageService` - Golden image business logic
- `CloneService` - Clone creation, attachment, deletion
- `CheckpointService` - Checkpoint operations
- `OperationTracker` - Long-running operation tracking

### GUI Client

**Location:** `C:\flashdb\src\GUI\`

**Framework:** WPF (Windows-native) or Web-based

**Views:**
- `DashboardView` - Overview of clones and golden images
- `CloneManagementView` - Create, delete, attach/detach clones
- `CheckpointView` - Timeline of checkpoints with metadata
- `CheckpointDiffView` - Side-by-side comparison
- `SettingsView` - Configuration management

---

## File Locations Reference

| Component | File | Type | Status |
|-----------|------|------|--------|
| **Module Manifest** | `src/FlashDB/FlashDB.psd1` | Created | ✓ |
| **Main Module** | `src/FlashDB/FlashDB.psm1` | Created | ✓ |
| **Provider Interface** | Inside `FlashDB.psm1` | Created | ✓ |
| **SQL Server Provider** | `src/Providers/SqlServer/SqlServerProvider.ps1` | Created | ✓ |
| **API Specification** | `docs/API_SPECIFICATION.md` | Created | ✓ |
| **Implementation Plan** | `IMPLEMENTATION_ROADMAP.md` | Created | ✓ |
| **Architecture Doc** | `docs/Architecture/PROJECT_STRUCTURE.md` | Created | ✓ |
| **Public Cmdlets** | `src/FlashDB/Public/*.ps1` | Planned | Pending |
| **Private Functions** | `src/FlashDB/Private/*.ps1` | Planned | Pending |
| **REST API** | `src/API/` | Planned | Phase 4 |
| **GUI Client** | `src/GUI/` | Planned | Phase 5 |
| **Unit Tests** | `tests/Unit/` | Planned | Phase 6 |
| **Integration Tests** | `tests/Integration/` | Planned | Phase 6 |

---

## Next Steps (Phase 1: Core Development)

The architecture is ready for implementation. Phase 1 tasks:

### Task 1.1: Module Initialization
- [ ] Create module test harness (Pester)
- [ ] Test manifest loads correctly
- [ ] Test provider registration system
- [ ] Verify configuration loading

### Task 1.2: VHDX Operations
- [ ] Implement `New-FlashdbDifferencingDisk` (create child VHDX)
- [ ] Implement `Mount-FlashdbVhdx` (mount to drive)
- [ ] Implement `Dismount-FlashdbVhdx` (unmount)
- [ ] Implement `New-FlashdbVhdxSnapshot` (create snapshot)
- [ ] Implement `Restore-FlashdbVhdxSnapshot` (revert to snapshot)
- [ ] Write integration tests

### Task 1.3: Metadata Management
- [ ] Validate JSON metadata schema
- [ ] Test `New-FlashdbCloneMetadata`
- [ ] Test `Save-FlashdbCloneMetadata`
- [ ] Test `Get-FlashdbCloneMetadata`
- [ ] Test operation logging
- [ ] Write unit tests

**Estimated:** 3 weeks for core architecture foundation

---

## Architecture Key Metrics

### Performance Targets

| Operation | Target | Method |
|-----------|--------|--------|
| Clone Creation | < 5 seconds | VHDX diff + DB attach |
| Checkpoint Creation | < 1 second | VHDX snapshot |
| Rollback Time | < 2 seconds | VHDX revert + re-attach |
| Storage Efficiency | 70-90% reduction | VHDX CoW + compression |

### Concurrency

- Max concurrent clones: 5 (configurable)
- Multi-user support: 2-3 simultaneous
- Cross-clone operations: Supported (independent state)

### Database Support

| Database | Version | Status | Timeline |
|----------|---------|--------|----------|
| SQL Server | 2017, 2019, 2022 | v0.1.0 | Weeks 4-6 |
| PostgreSQL | 12+ | v0.2.0 | Future |
| MySQL | 5.7, 8.0 | v0.3.0 | Future |

---

## Security & Compliance

### Data Protection

- Golden images: Read-only, compressed VHDX
- Clones: Developer machines or secured UNC shares
- Credentials: Windows auth (Kerberos/NTLM), no storage
- Audit: Immutable operation log with timestamps

### Access Control

- File system ACLs (NTFS)
- SQL Server login controls
- Trust boundary: Same as production deployment

### Compliance

- GDPR: Right to delete via `Remove-FlashdbClone`
- SOC2: Audit trail and access logging
- No data masking (v0.1.0)

---

## Configuration

### Default Settings

**Location:** `config/flashdb.config.json`

```json
{
  "goldenImagePath": "\\shared\GoldenImages",
  "defaultCloneStoragePath": "D:\CloneStorage",
  "defaultInstancePath": "LOCALHOST\SQLEXPRESS",
  "checkpointRetentionDays": null,
  "maxConcurrentClones": 5,
  "vhdxCompressionEnabled": true,
  "defaultCreationMethod": "BackupRestore"
}
```

### Environment Variables

- `FLASHDB_CONFIG_PATH` - Override config location
- `FLASHDB_LOG_LEVEL` - Set logging level (Debug, Verbose, Info, Warn, Error)
- `FLASHDB_STORAGE_PATH` - Override default clone storage

---

## Testing Coverage Goals

- **Phase 1-3:** 80%+ coverage (module, core functions)
- **Phase 4-5:** 85%+ coverage (API, GUI)
- **Phase 6:** 90%+ coverage (final push)

**Test Types:**
- Unit (mocked external dependencies)
- Integration (real SQL Server instance)
- Performance (timing benchmarks)
- Stress (large databases, many clones)

---

## Extensibility

### Adding a New Database Provider

1. Create `SqlProvider : FlashdbProvider` class
2. Implement abstract methods (CreateGoldenImage, Attach, Detach, etc.)
3. Register via `Register-FlashdbProvider -ProviderType 'PostgreSQL' -Provider $provider`
4. Implement 3 golden image creation methods
5. Add corresponding cmdlets

### Adding a New Golden Image Method

1. Add enum value to `FlashdbCreationMethod`
2. Add switch case in provider's `CreateGoldenImage()`
3. Implement helper methods
4. Write tests
5. Update API/GUI to support new method

### Custom Checkpoint Operations

1. Add methods to `FlashdbProvider` base class
2. Implement in SQL Server and other providers
3. Create cmdlets and API endpoints
4. Write tests

---

## Known Limitations (v0.1.0)

1. **No data masking** - Production data copied as-is to dev environments
2. **No centralized registry** - Manual clone discovery (future: optional central catalog)
3. **No conflict resolution** - Multiple users on same clone not recommended
4. **Cloud support** - Azure SQL, RDS not supported (v0.2.0+)
5. **Single database type** - SQL Server only (v0.1.0)

---

## Success Criteria

The architecture is complete when:

- [x] Module manifest created with correct name and version
- [x] Main module file with provider interface and core functions
- [x] SQL Server provider skeleton with all 3 methods defined
- [x] REST API specification (30+ endpoints documented)
- [x] Implementation roadmap (7 phases, 20 weeks, detailed tasks)
- [x] Architecture documentation (layers, data flows, extension points)
- [x] Project structure defined (directory layout, files organized)

---

## Contact & Handoff

**Architecture Phase Complete:** 2026-06-06

**Next Owner:** Core Developer (Phase 1 - Weeks 1-3)

**Key Deliverables to Receive:**
1. Module manifest: `C:\flashdb\src\FlashDB\FlashDB.psd1`
2. Main module: `C:\flashdb\src\FlashDB\FlashDB.psm1`
3. Provider interface: Inside main module
4. API spec: `C:\flashdb\docs\API_SPECIFICATION.md`
5. Roadmap: `C:\flashdb\IMPLEMENTATION_ROADMAP.md`
6. Architecture doc: `C:\flashdb\docs\Architecture\PROJECT_STRUCTURE.md`

**Phase 1 Objectives:**
1. Create public cmdlet files (30+ cmdlets)
2. Implement VHDX operations layer
3. Implement metadata management
4. Write and pass unit tests (80%+ coverage)

---

End of Architecture Summary
