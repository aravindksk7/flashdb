# FlashDB Project Structure & Architecture Overview

**Date:** 2026-06-06  
**Status:** Architecture Phase Complete  
**Module Version:** 0.1.0

---

## Directory Structure

```
C:\flashdb\
│
├── src/                                  # Source code
│   ├── FlashDB/                          # Main PowerShell module
│   │   ├── FlashDB.psd1                  # Module manifest (Name=FlashDB, Version=0.1.0)
│   │   ├── FlashDB.psm1                  # Main module file (core engine)
│   │   ├── Public/                       # Public cmdlets (exported)
│   │   │   ├── GoldenImageCmdlets.ps1
│   │   │   ├── CloneCmdlets.ps1
│   │   │   ├── CheckpointCmdlets.ps1
│   │   │   └── UtilityCmdlets.ps1
│   │   ├── Private/                      # Private functions (internal only)
│   │   │   ├── VhdxOperations.ps1
│   │   │   ├── MetadataOperations.ps1
│   │   │   ├── DatabaseOperations.ps1
│   │   │   └── Helpers.ps1
│   │   └── Classes/                      # PowerShell classes
│   │       ├── FlashdbProvider.ps1       # Provider interface
│   │       ├── FlashdbClone.ps1
│   │       ├── FlashdbCheckpoint.ps1
│   │       └── FlashdbGoldenImage.ps1
│   │
│   ├── Providers/                        # Database provider plugins
│   │   ├── SqlServer/                    # SQL Server provider (Phase 2)
│   │   │   ├── SqlServerProvider.ps1     # Main provider implementation
│   │   │   ├── SqlServerAttach.ps1       # DB attach/detach
│   │   │   ├── SqlServerBackup.ps1       # Backup operations
│   │   │   └── Tests/
│   │   │       └── SqlServerProvider.Tests.ps1
│   │   │
│   │   ├── PostgreSQL/                   # PostgreSQL provider (v0.2.0)
│   │   │   ├── PostgreSqlProvider.ps1
│   │   │   └── Tests/
│   │   │
│   │   └── MySQL/                        # MySQL provider (v0.3.0)
│   │       ├── MySqlProvider.ps1
│   │       └── Tests/
│   │
│   ├── API/                              # REST API (Phase 4)
│   │   ├── API.csproj                    # API project (.NET or Node.js)
│   │   ├── Controllers/
│   │   │   ├── GoldenImagesController.cs
│   │   │   ├── ClonesController.cs
│   │   │   ├── CheckpointsController.cs
│   │   │   └── AdminController.cs
│   │   ├── Middleware/
│   │   │   ├── AuthenticationMiddleware.cs
│   │   │   ├── ErrorHandlingMiddleware.cs
│   │   │   └── LoggingMiddleware.cs
│   │   ├── Models/
│   │   │   ├── GoldenImageDto.cs
│   │   │   ├── CloneDto.cs
│   │   │   ├── CheckpointDto.cs
│   │   │   └── ErrorResponse.cs
│   │   ├── Services/
│   │   │   ├── GoldenImageService.cs
│   │   │   ├── CloneService.cs
│   │   │   ├── CheckpointService.cs
│   │   │   └── OperationTracker.cs
│   │   └── Program.cs                    # API entry point
│   │
│   └── GUI/                              # GUI Client (Phase 5)
│       ├── GUI.csproj                    # GUI project (WPF or Web)
│       ├── Views/
│       │   ├── MainWindow.xaml
│       │   ├── DashboardView.xaml
│       │   ├── CloneManagementView.xaml
│       │   ├── CheckpointView.xaml
│       │   └── SettingsView.xaml
│       ├── ViewModels/
│       │   ├── DashboardViewModel.cs
│       │   ├── CloneViewModel.cs
│       │   ├── CheckpointViewModel.cs
│       │   └── SettingsViewModel.cs
│       ├── Services/
│       │   └── ApiClientService.cs
│       ├── Resources/
│       │   ├── Styles.xaml
│       │   └── Icons/
│       └── App.xaml
│
├── tests/                                # Test suites
│   ├── Unit/                             # Unit tests (Phase 6.1)
│   │   ├── FlashDB.Unit.Tests.ps1
│   │   ├── SqlServerProvider.Unit.Tests.ps1
│   │   ├── MetadataOperations.Unit.Tests.ps1
│   │   └── VhdxOperations.Unit.Tests.ps1
│   │
│   ├── Integration/                      # Integration tests (Phase 6.2)
│   │   ├── CloneLifecycle.Integration.Tests.ps1
│   │   ├── CheckpointWorkflow.Integration.Tests.ps1
│   │   ├── GoldenImageCreation.Integration.Tests.ps1
│   │   ├── MultiCloneOperations.Integration.Tests.ps1
│   │   └── PerformanceTests.ps1          # Performance benchmarks (Phase 6.3)
│   │
│   └── Stress/                           # Stress tests (Phase 6.4)
│       ├── LargeDatabaseTests.ps1
│       ├── ManyCheckpointsTests.ps1
│       ├── ConcurrencyTests.ps1
│       └── NetworkFailureTests.ps1
│
├── config/                               # Configuration files
│   ├── flashdb.config.json               # Default configuration
│   ├── logging.config.json               # Logging configuration
│   └── providers.config.json             # Provider registry
│
├── scripts/                              # Utility scripts
│   ├── Install-FlashDB.ps1               # Installation script
│   ├── Initialize-FlashDB.ps1            # First-run setup
│   ├── Cleanup-Orphans.ps1               # Orphan cleanup utility
│   ├── Health-Check.ps1                  # Health verification
│   └── Migrate-Config.ps1                # Configuration migration
│
├── docs/                                 # Documentation
│   ├── API_SPECIFICATION.md              # REST API specification
│   ├── Architecture/
│   │   ├── PROJECT_STRUCTURE.md          # This file
│   │   ├── DESIGN_DECISIONS.md           # Key architectural decisions
│   │   ├── VHDX_OPERATIONS.md            # VHDX technical details
│   │   └── PROVIDER_INTERFACE.md         # Provider extension guide
│   ├── User_Guide.md                     # User documentation
│   ├── Installation_Guide.md             # Installation instructions
│   ├── Troubleshooting.md                # Troubleshooting guide
│   └── superpowers/specs/
│       └── 2026-06-06-flashdb-database-virtualization-design.md
│
├── IMPLEMENTATION_ROADMAP.md             # Development roadmap (phases 1-7)
├── CLAUDE.md                             # Claude Code project instructions
├── .claude-flow/                         # Agentic-Flow v3.0 configuration
├── .mcp.json                             # MCP server configuration
├── .gitignore
├── LICENSE
└── README.md                             # Project overview

```

---

## Component Architecture

### Layer 1: User Interfaces

**Entry Points:** Public APIs for end users

- **PowerShell Module** (`src/FlashDB/`)
  - 30+ public cmdlets
  - Supports Get-Help documentation
  - Aliased for quick access (e.g., `nfgi` = `New-FlashdbGoldenImage`)
  - Used by: Developers, testers, automation

- **REST API** (`src/API/`)
  - HTTP server on port 6060
  - 30+ endpoints (golden images, clones, checkpoints, admin)
  - Used by: GUI, external tools, cross-machine access
  - Async operations with progress tracking

- **GUI Client** (`src/GUI/`)
  - Dashboard, clone management, checkpoint timeline
  - Side-by-side checkpoint comparison
  - Storage analytics
  - Used by: Visual users, administrators

### Layer 2: Core Module

**The Engine:** Database-agnostic functionality

- **Module Core** (`src/FlashDB/FlashDB.psm1`)
  - VHDX differencing disk management
  - Checkpoint/rollback logic
  - Metadata serialization (JSON)
  - State machine for clone lifecycle

- **VHDX Operations** (`src/FlashDB/Private/VhdxOperations.ps1`)
  - Create differencing disks
  - Mount/unmount VHDX
  - Create snapshots
  - Revert to snapshots

- **Metadata Management** (`src/FlashDB/Private/MetadataOperations.ps1`)
  - Clone metadata schema (JSON)
  - Checkpoint metadata tracking
  - Operation audit log
  - Persistence and loading

- **Provider Interface** (`src/FlashDB/Classes/FlashdbProvider.ps1`)
  - Abstract base class
  - Define contract for database providers
  - Support multiple creation methods
  - Enable future provider extensions

### Layer 3: Database Providers

**Plugin Architecture:** Database-specific implementations

- **SQL Server Provider** (`src/Providers/SqlServer/`)
  - Golden image creation (3 methods)
  - Database backup/restore
  - Database attach/detach
  - Connection management
  - Row count/schema hashing

- **PostgreSQL Provider** (Future: v0.2.0)
  - Similar contract to SQL Server
  - pg_dump/pg_restore support
  - Connection handling

- **MySQL Provider** (Future: v0.3.0)
  - mysqldump support
  - Multi-database support

### Layer 4: Storage

**Persistence Layer:** VHDX files and metadata

- **Golden Images** (Read-only parent VHDX)
  - Stored in: `Config.GoldenImagePath`
  - Naming: `golden-{dbtype}-{version}.vhdx`
  - Compressed, versioned, immutable

- **Clones** (Differencing VHDX children)
  - Stored in: `Config.DefaultCloneStoragePath` or custom path
  - Naming: `clone-{name}.vhdx`
  - Copy-on-write from parent
  - Minimal initial size

- **Checkpoints** (Snapshots)
  - Stored in: `CloneStoragePath/checkpoints/`
  - Naming: `clone-{name}_cp-{id}.vhdx`
  - Differential (stores only changes)

- **Metadata** (JSON files)
  - Stored alongside VHDX files
  - Naming: `clone-{name}.json`
  - Contains: lifecycle, checkpoints, audit log

---

## Key Interfaces & Classes

### Provider Interface

```powershell
# Abstract base class in src/FlashDB/Classes/FlashdbProvider.ps1

class FlashdbProvider {
    # Golden image creation (supports 3 methods)
    CreateGoldenImage($sourceConn, $targetVhdx, $method, $options)
    
    # Database attach/detach
    AttachDatabase($instancePath, $vhdxPath, $databaseName)
    DetachDatabase($instancePath, $databaseName)
    CloseActiveConnections($instancePath, $databaseName)
    
    # Connection & query operations
    ValidateConnection($connectionString)
    GetDatabaseInfo($connectionString, $databaseName)
    BackupDatabase($sourceConn, $backupPath)
    RestoreDatabase($targetConn, $backupPath, $databaseName)
}
```

### Clone Metadata Schema

```json
{
  "clone": { /* Clone identity */ },
  "golden": { /* Parent image reference */ },
  "database": { /* Database type & connection */ },
  "attachment": { /* Current attachment state */ },
  "checkpoints": [ /* Array of snapshots */ ],
  "lifecycle": { /* Status, expiration, tags */ },
  "operations": { /* Audit trail */ }
}
```

---

## Data Flows

### Clone Creation Flow

```
User: New-FlashdbClone -GoldenImageId "golden-prod-20260606" -CloneName "test-clone"
  ↓
Module Core:
  1. Validate golden image exists
  2. Create VHDX differencing disk (parent → child)
  3. Create metadata JSON file
  ↓
Provider (SQL Server):
  1. Restore database from VHDX
  2. Attach to SQL instance
  3. Verify connectivity
  ↓
Result: Clone ready in ~2-5 seconds
```

### Checkpoint → Rollback Flow

```
User: New-FlashdbCheckpoint -CloneId "clone-test" -Phase "pre-etl"
  ↓
Module Core:
  1. Close active connections
  2. Create VHDX snapshot (from clone)
  3. Capture database metadata
  4. Log operation in metadata JSON
  ↓
Result: Checkpoint created in ~0.5 seconds

User: Restore-FlashdbCheckpoint -CloneId "clone-test" -CheckpointId "cp-001"
  ↓
Module Core:
  1. Close active connections (force if needed)
  2. Detach database from SQL instance
  3. Revert VHDX to snapshot state
  4. Re-attach database
  5. Log operation
  ↓
Result: Rollback complete in ~1-2 seconds
```

---

## Module Manifest Details

**File:** `src/FlashDB/FlashDB.psd1`

```powershell
@{
    RootModule = 'FlashDB.psm1'
    ModuleVersion = '0.1.0'
    Author = 'FlashDB Team'
    Description = 'Database virtualization using VHDX differencing disks'
    PowerShellVersion = '5.1'
    CompatiblePSEditions = @('Desktop', 'Core')
    
    # 30+ public cmdlets
    FunctionsToExport = @(
        'New-FlashdbGoldenImage',
        'Get-FlashdbClone',
        'New-FlashdbCheckpoint',
        'Restore-FlashdbCheckpoint',
        # ... more cmdlets
    )
    
    # Quick aliases
    AliasesToExport = @(
        'nfgi'    # New-FlashdbGoldenImage
        'nfc'     # New-FlashdbClone
        'nfcp'    # New-FlashdbCheckpoint
        # ... more aliases
    )
}
```

---

## Provider Entry Point

**File:** `src/FlashDB/FlashDB.psm1`

When the module loads, it:

1. Initializes configuration from `config/flashdb.config.json`
2. Loads provider DLLs/modules from `src/Providers/`
3. Registers each provider via `Register-FlashdbProvider`
4. Makes providers available to cmdlets via `Get-FlashdbProvider`

### SQL Server Provider Registration

```powershell
# In src/Providers/SqlServer/SqlServerProvider.ps1
$provider = [SqlServerProvider]::new()
Register-FlashdbProvider -ProviderType 'SqlServer' -Provider $provider
```

---

## Configuration Files

### Default Configuration

**File:** `config/flashdb.config.json`

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

---

## Testing Strategy

### Unit Tests

**Location:** `tests/Unit/`

- Test individual functions/cmdlets in isolation
- Mock external dependencies (VHDX, SQL Server)
- Target: 90%+ code coverage
- Framework: Pester (PowerShell native)

### Integration Tests

**Location:** `tests/Integration/`

- Test end-to-end workflows (create clone → checkpoint → rollback)
- Use real SQL Server instance
- Test all three golden image creation methods
- Test multi-clone concurrent operations

### Performance Tests

**Location:** `tests/PerformanceTests.ps1`

- Measure clone creation time (< 5 sec target)
- Measure checkpoint time (< 1 sec target)
- Measure rollback time (< 2 sec target)
- Measure storage efficiency (70-90% target)

### Stress Tests

**Location:** `tests/Stress/`

- Large database support (1-2 TB)
- Many clones (10+)
- Many checkpoints per clone (50+)
- Rapid checkpoint/rollback cycles

---

## Implementation Phases

| Phase | Name | Files/Components | Timeline | Owner |
|-------|------|------------------|----------|-------|
| 1 | Core Architecture | Module structure, VHDX ops, metadata | Weeks 1-3 | Core Dev |
| 2 | SQL Server Provider | Provider class, 3 creation methods, attach/detach | Weeks 4-6 | DB Dev |
| 3 | Clone Lifecycle | All cmdlets, checkpoint, rollback | Weeks 7-9 | Core Dev |
| 4 | REST API | Controllers, endpoints, auth, long-ops | Weeks 10-12 | API Dev |
| 5 | GUI Client | Dashboard, clone UI, checkpoint UI, diff | Weeks 13-15 | UI Dev |
| 6 | QA & Testing | Unit/integration/performance/stress tests | Weeks 16-18 | QA Dev |
| 7 | Release | Packaging, release notes, deployment | Weeks 19-20 | Release Eng |

---

## Dependencies

### PowerShell Module Dependencies

- **PowerShell 5.1+** (Desktop or Core)
- **Hyper-V cmdlets** (for VHDX operations)
- **SQL Server Management Objects (SMO)** (for SQL Server operations)
- **Pester** (for testing)

### API Dependencies

- **.NET Core 6.0+** (if using .NET) OR **Node.js 16+** (if using Node.js)
- **OpenAPI/Swagger** (for API documentation)
- **JWT libraries** (for authentication)

### GUI Dependencies

- **WPF** (if using WPF) OR **Electron/React** (if using web-based)
- **API Client** (to communicate with REST API)

---

## Extension Points

### Adding a New Provider

1. Create `src/Providers/{DatabaseType}/{DatabaseType}Provider.ps1`
2. Implement `class {DatabaseType}Provider : FlashdbProvider`
3. Implement all abstract methods
4. Register provider in module initialization
5. Write tests in `src/Providers/{DatabaseType}/Tests/`
6. Add cmdlet to support new provider type

### Adding a New Golden Image Creation Method

1. Add new `FlashdbCreationMethod` enum value
2. Implement method in provider's `CreateGoldenImage` switch statement
3. Write tests
4. Update API documentation

### Adding a New Checkpoint Operation

1. Add new method to `FlashdbProvider` interface
2. Implement in SQL Server (and other) providers
3. Create corresponding cmdlet
4. Write tests
5. Update REST API endpoints

---

## Security Considerations

### Data Protection

- Golden images stored as read-only VHDX
- Clones stored on developer machines or secured UNC shares
- Credentials: Use Windows auth (Kerberos/NTLM), no credential storage in tool
- Audit trail: Operation log in JSON metadata with timestamps and user info

### Access Control

- Local clones: File system permissions (NTFS ACLs)
- Shared clones: UNC share permissions
- SQL Server: SQL login controls (same as production or dedicated read-only account)

### Compliance

- No data masking (production data as-is)
- Audit trail immutable
- GDPR support: Right to delete via `Remove-FlashdbClone`

---

## Monitoring & Observability

### Logging

- **Module logs:** `$PROFILE` or `PSModulePath`
- **API logs:** Structured JSON to file or ELK Stack
- **GUI logs:** Application event log

### Metrics

- Clone creation time
- Checkpoint creation time
- Rollback time
- Storage utilization
- Concurrent operations

### Health Checks

- `GET /api/v1/health` endpoint
- `Get-FlashdbStorageReport` cmdlet
- `Test-FlashdbGoldenImage` cmdlet

---

End of Project Structure Documentation
