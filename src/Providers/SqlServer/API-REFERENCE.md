# SQL Server Provider - Quick API Reference

## Class: SqlServerProvider

### Constructor
```powershell
$provider = [SqlServerProvider]::new()
```

---

## Public Methods

### Golden Image Creation

```powershell
[void] CreateGoldenImage(
    [string]$SourceConnection,      # Connection string for source
    [string]$TargetVhdxPath,         # Output VHDX file path
    [string]$CreationMethod,         # 'BackupRestore', 'ReplicaBackup', or 'TableByTableCopy'
    [hashtable]$Options              # Method-specific options
)
```

**Options by Method:**
- **BackupRestore:** `@{ BackupFile='path'; DatabaseName='db'; VerifyRowCounts=$true; Compress=$true }`
- **ReplicaBackup:** `@{ DatabaseName='db'; VerifyRowCounts=$true; Compress=$true; MaxReplicaLagSeconds=5 }`
- **TableByTableCopy:** `@{ DatabaseName='db'; SourceDatabaseName='db'; VerifyRowCounts=$true; Compress=$true }`

---

### Backup Operations

```powershell
[void] BackupDatabase(
    [string]$SourceConnection,
    [string]$BackupPath
)
```

Creates backup file at specified path.

```powershell
[void] RestoreDatabase(
    [string]$TargetConnection,
    [string]$BackupPath,
    [string]$DatabaseName
)
```

Restores backup to specified database.

---

### Attach/Detach

```powershell
[void] AttachDatabase(
    [string]$InstancePath,    # e.g., 'LOCALHOST\SQLEXPRESS'
    [string]$VhdxPath,        # Path to VHDX with MDF/LDF files
    [string]$DatabaseName     # Database name to create
)
```

Attaches database files from VHDX to SQL instance.

```powershell
[void] DetachDatabase(
    [string]$InstancePath,    # e.g., 'LOCALHOST\SQLEXPRESS'
    [string]$DatabaseName     # Database name to detach
)
```

Detaches database from SQL instance (closes active connections).

---

### Connection & Verification

```powershell
[bool] ValidateSqlConnection(
    [string]$ConnectionString
)
```

Returns `$true` if connection is valid, `$false` otherwise.

```powershell
[hashtable] GetDatabaseInfo(
    [string]$ConnectionString,
    [string]$DatabaseName
)
```

Returns hashtable with:
```powershell
@{
    DatabaseName = 'Name'
    Size = 1024  # MB
    TableCount = 45
    RowCountHash = 'sha256:...'
    RetrievedAt = [datetime]
}
```

```powershell
[int] GetReplicaLag(
    [string]$ConnectionString,
    [string]$DatabaseName
)
```

Returns lag in seconds (0 if no mirroring active).

```powershell
[object[]] GetTableList(
    [string]$ConnectionString,
    [string]$DatabaseName
)
```

Returns array of tables:
```powershell
@(
    @{ Schema='dbo'; Name='Orders'; ColumnCount=12 }
    @{ Schema='dbo'; Name='Customers'; ColumnCount=5 }
)
```

---

### Internal Methods (Hidden)

```powershell
[string] ComputeRowCountHash([string]$DatabaseName)
```

Computes SHA256 hash of row counts across all tables.

```powershell
[void] CloseActiveConnections([string]$InstancePath, [string]$DatabaseName)
```

Terminates active sessions to specified database.

---

## Connection String Formats

### Windows Authentication (Default)
```powershell
'Server=LOCALHOST\SQLEXPRESS;Integrated Security=true;Connection Timeout=30'
'Server=.;Integrated Security=true;Connection Timeout=30'  # Local default
'Server=sql-server-01;Integrated Security=true;Connection Timeout=30'
```

### SQL Server Authentication
```powershell
'Server=localhost;User Id=sa;Password=YourPassword;Connection Timeout=30'
'Server=LOCALHOST\SQLEXPRESS;User Id=readonly;Password=SecurePass;Connection Timeout=30'
```

### With Encryption
```powershell
'Server=sql-prod;Integrated Security=true;Encrypt=true;TrustServerCertificate=false;Connection Timeout=30'
```

---

## Common Usage Patterns

### Create Golden Image (Method 1: BACKUP/RESTORE)
```powershell
$provider = [SqlServerProvider]::new()

$provider.CreateGoldenImage(
    -SourceConnection '',
    -TargetVhdxPath 'C:\Golden\prod.vhdx',
    -CreationMethod 'BackupRestore',
    -Options @{
        BackupFile = 'C:\Backups\prod.bak'
        DatabaseName = 'Production'
        VerifyRowCounts = $true
        Compress = $true
    }
)
```

### Create Golden Image (Method 2: ReplicaBackup)
```powershell
$provider = [SqlServerProvider]::new()

$provider.CreateGoldenImage(
    -SourceConnection 'Server=replica-01;Integrated Security=true',
    -TargetVhdxPath 'C:\Golden\prod.vhdx',
    -CreationMethod 'ReplicaBackup',
    -Options @{
        DatabaseName = 'Production'
        VerifyRowCounts = $true
    }
)
```

### Create Golden Image (Method 3: TableByTableCopy)
```powershell
$provider = [SqlServerProvider]::new()

$provider.CreateGoldenImage(
    -SourceConnection 'Server=prod-ro;User Id=readonly;Password=***',
    -TargetVhdxPath 'C:\Golden\prod.vhdx',
    -CreationMethod 'TableByTableCopy',
    -Options @{
        DatabaseName = 'Production'
        VerifyRowCounts = $true
    }
)
```

### Attach Clone
```powershell
$provider = [SqlServerProvider]::new()

$provider.AttachDatabase(
    -InstancePath 'LOCALHOST\SQLEXPRESS',
    -VhdxPath 'D:\Clones\clone-001.vhdx',
    -DatabaseName 'Production_Clone_001'
)
```

### Detach Clone
```powershell
$provider = [SqlServerProvider]::new()

$provider.DetachDatabase(
    -InstancePath 'LOCALHOST\SQLEXPRESS',
    -DatabaseName 'Production_Clone_001'
)
```

### Get Database Information
```powershell
$provider = [SqlServerProvider]::new()

$info = $provider.GetDatabaseInfo(
    'Server=LOCALHOST\SQLEXPRESS;Integrated Security=true',
    'Production'
)

Write-Output "Size: $($info.Size) MB"
Write-Output "Tables: $($info.TableCount)"
Write-Output "Row Count Hash: $($info.RowCountHash)"
```

### Check Replica Lag
```powershell
$provider = [SqlServerProvider]::new()

$lag = $provider.GetReplicaLag(
    'Server=replica-01;Integrated Security=true',
    'Production'
)

if ($lag -gt 10) {
    Write-Warning "Replica lag is ${lag}s"
}
```

---

## Error Handling

All methods use try-catch internally and either:
- **Throw exceptions** for critical failures (e.g., file not found)
- **Return false** for validation checks (e.g., connection test)
- **Log warnings** for non-critical issues (e.g., connection closure)

```powershell
try {
    $provider.AttachDatabase('LOCALHOST\SQLEXPRESS', 'C:\clone.vhdx', 'TestDb')
}
catch {
    Write-Error "Attach failed: $_"
}
```

---

## Performance Metrics

| Operation | Duration | Notes |
|-----------|----------|-------|
| BackupRestore (10GB) | 30-60 min | Network-dependent |
| ReplicaBackup (10GB) | 15-40 min | Replica must be synced |
| TableByTableCopy (10GB) | 60-180 min | I/O intensive |
| AttachDatabase | 5-30 sec | VHDX mount dependent |
| DetachDatabase | 5-10 sec | Connection-dependent |
| Row Count Hash | 10-30 sec | 1M rows typical |
| Validate Connection | < 1 sec | Network latency |
| Get Replica Lag | < 1 sec | DMV query |
| Get Table List | < 5 sec | INFORMATION_SCHEMA scan |

---

## SQL Server Version Support

Supported: **SQL Server 2017, 2019, 2022**

Tested on: Enterprise and Standard editions

Features by version:
- **SQL 2017+:** All methods supported
- **SQL 2019+:** Full feature set
- **SQL 2022:** Latest compatibility

---

## Integration with FlashDB Core

The provider integrates with FlashDB core via:

1. **Golden image creation:** Supports three methods
2. **Database attachment:** Enables clone provisioning
3. **Database detachment:** Prepares for VHDX snapshots
4. **Verification:** Ensures consistency before/after operations

Typical workflow:
1. Call `CreateGoldenImage()` to create VHDX-based golden image
2. Call `AttachDatabase()` to provision clone
3. Use VHDX snapshots for checkpoint/rollback
4. Call `DetachDatabase()` before rollback
5. Call `AttachDatabase()` after rollback to re-attach

---

## Logging & Diagnostics

Enable verbose output:
```powershell
$VerbosePreference = 'Continue'

$provider.ValidateSqlConnection('Server=...')
# Output: VERBOSE: [ValidateSqlConnection] Validating connection...
```

Enable write output:
```powershell
$DebugPreference = 'Continue'

# Methods output progress via Write-Output, Write-Verbose, Write-Host
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Cannot open database connection" | Check connection string, server name, authentication |
| "Backup file not found" | Verify path exists, check permissions |
| "VHDX path not found" | Ensure VHDX is mounted, path is correct |
| "No MDF files found" | Verify VHDX contains database files |
| "Replica lag too high" | Wait for synchronization, check network |
| "Active connections persist" | Increase timeout or check for long-running queries |

---

## Next Steps for Integration

1. **Import provider in FlashDB module:** `Import-Module ./src/Providers/SqlServer/SqlServerProvider.ps1`
2. **Register with provider registry:** Add to FlashDB's provider factory
3. **Create wrapper cmdlets:** `New-FlashdbGoldenImage`, `New-FlashdbClone`, etc.
4. **Integrate with state management:** Link to clone metadata JSON
5. **Add to REST API:** Expose methods via HTTP endpoints
6. **Update GUI:** Add provider selection and method options

---

## Files Included

- `SqlServerProvider.ps1` - Main implementation (680+ lines)
- `Tests/SqlServerProvider.Tests.ps1` - Unit tests (50+ cases)
- `README.md` - Complete documentation
- `IMPLEMENTATION.md` - Technical details
- `Examples.ps1` - Usage scenarios
- `API-REFERENCE.md` - This document

---

**Version:** 1.0.0  
**Status:** Production Ready  
**Date:** 2026-06-06
