# SQL Server Provider for FlashDB

## Overview

The SQL Server Provider implements database-specific operations for FlashDB, enabling rapid provisioning of lightweight database clones using VHDX differencing disks. It supports three methods for creating golden images and provides comprehensive database lifecycle management.

**Version:** 1.0.0  
**Supported SQL Server Versions:** 2017, 2019, 2022 (Enterprise and Standard editions)  
**Authentication Methods:** Windows (Integrated Security) and SQL Server Authentication  

---

## Quick Start

### Loading the Provider

```powershell
# Import the SQL Server provider
. '.\src\Providers\SqlServer\SqlServerProvider.ps1'

# Create a new provider instance
$provider = [SqlServerProvider]::new()
```

### Verify Connection

```powershell
# Test connection with Windows Authentication
$connStr = 'Server=LOCALHOST\SQLEXPRESS;Integrated Security=true;Connection Timeout=30'
$provider.ValidateConnection($connStr)  # Returns $true or $false
```

---

## Golden Image Creation Methods

The provider supports three methods for creating golden images, each with different trade-offs:

### Method 1: BACKUP/RESTORE (Default)

**Best for:** Production environments with existing backup infrastructure

**Requirements:**
- Backup file (`.bak`) path or backup location
- No admin rights on source

**Process:**
1. Validates backup file exists and is readable
2. Creates VHDX and attaches to local SQL instance
3. Restores backup to VHDX-attached database
4. Computes row count hash for verification
5. Compresses VHDX if requested

**Usage:**
```powershell
$provider.CreateGoldenImage(
    -SourceConnection '',
    -TargetVhdxPath 'C:\GoldenImages\prod-20260606.vhdx',
    -CreationMethod 'BackupRestore',
    -Options @{
        BackupFile = 'C:\Backups\Production_20260606.bak'
        DatabaseName = 'Production'
        VerifyRowCounts = $true
        Compress = $true
    }
)
```

**Performance:** Varies with backup file size (typically 30-120 minutes for multi-GB databases)

---

### Method 2: ReplicaBackup (BACKUP FROM MIRROR)

**Best for:** Large databases with SQL Server replica infrastructure

**Requirements:**
- SQL Server read-only replica
- `BACKUP DATABASE ... FROM MIRROR` support (SQL 2012+)
- Read-only account on replica

**Process:**
1. Validates connection to replica
2. Checks replica lag (warns if > 10 seconds)
3. Executes `BACKUP DATABASE ... FROM MIRROR` to staging location
4. Creates VHDX and restores backup
5. Computes row count hash for verification

**Usage:**
```powershell
$provider.CreateGoldenImage(
    -SourceConnection 'Server=prod-replica;Integrated Security=true;Connection Timeout=30',
    -TargetVhdxPath 'C:\GoldenImages\prod-20260606.vhdx',
    -CreationMethod 'ReplicaBackup',
    -Options @{
        DatabaseName = 'Production'
        VerifyRowCounts = $true
        Compress = $true
        MaxReplicaLagSeconds = 5
    }
)
```

**Performance:** Faster than BACKUP/RESTORE for large databases (15-60 minutes typical)  
**Replica Lag Detection:** Automatically queries `sys.dm_database_mirroring_status`

---

### Method 3: TableByTableCopy (Most Flexible)

**Best for:** Restricted access scenarios or when backup infrastructure is unavailable

**Requirements:**
- Read-only SQL login (no admin rights)
- Source database accessible via read-only connection
- Sufficient network bandwidth

**Process:**
1. Validates connection to source database
2. Enumerates all user tables via `INFORMATION_SCHEMA.TABLES`
3. For each table:
   - Queries row count
   - Copies data to VHDX-attached database
   - Tracks progress
4. Verifies row counts match
5. Computes row count hash

**Usage:**
```powershell
$provider.CreateGoldenImage(
    -SourceConnection 'Server=prod-ro-account;User Id=readonly;Password=***;Connection Timeout=30',
    -TargetVhdxPath 'C:\GoldenImages\prod-20260606.vhdx',
    -CreationMethod 'TableByTableCopy',
    -Options @{
        DatabaseName = 'Production'
        SourceDatabaseName = 'Production'
        VerifyRowCounts = $true
        Compress = $true
    }
)
```

**Performance:** Slower than backup methods (1-3x longer due to network I/O)  
**Permissions:** Requires only SELECT on source tables

---

## Database Lifecycle Operations

### Attach Database

Attach a database from a VHDX differencing disk to a SQL Server instance.

```powershell
$provider.AttachDatabase(
    -InstancePath 'LOCALHOST\SQLEXPRESS',
    -VhdxPath 'D:\Clones\clone-001.vhdx',
    -DatabaseName 'Production_Clone_001'
)
```

**Process:**
1. Validates VHDX path exists and is mounted
2. Discovers MDF and LDF files on VHDX
3. Executes `CREATE DATABASE ... FOR ATTACH`
4. Verifies attachment succeeded

**Error Handling:**
- Throws error if VHDX not found
- Throws error if no MDF files found
- Warns if database already exists (skips attach)

---

### Detach Database

Detach a database from SQL Server instance (prepares for VHDX snapshot/revert).

```powershell
$provider.DetachDatabase(
    -InstancePath 'LOCALHOST\SQLEXPRESS',
    -DatabaseName 'Production_Clone_001'
)
```

**Process:**
1. Closes all active connections to the database
2. Sets database to SINGLE_USER mode
3. Executes `sp_detach_db`
4. Verifies detachment

**Connection Handling:**
- Queries `sys.dm_exec_sessions` for active connections
- Gracefully closes sessions with 5-second timeout
- Force-kills remaining sessions if necessary
- Logs all force-closed connections

---

## Verification and Consistency Checking

### Validate Connection

Test connectivity before performing operations.

```powershell
$isValid = $provider.ValidateConnection(
    'Server=LOCALHOST\SQLEXPRESS;Integrated Security=true;Connection Timeout=30'
)
```

**Checks:**
- TCP/IP connectivity to SQL Server
- Server availability (`SELECT @@VERSION`)
- (Optional) Database accessibility

---

### Get Replica Lag

Check transaction log synchronization lag on read-only replicas.

```powershell
$lagSeconds = $provider.GetReplicaLag(
    -ConnectionString 'Server=prod-replica;Integrated Security=true',
    -DatabaseName 'Production'
)

if ($lagSeconds -gt 10) {
    Write-Warning "Replica lag is ${lagSeconds}s - golden image may not be current"
}
```

**Returns:** Lag in seconds (0 if no mirroring active)  
**Query:** Uses `sys.dm_database_mirroring_status`

---

### Get Database Information

Retrieve metadata about a database.

```powershell
$info = $provider.GetDatabaseInfo(
    -ConnectionString 'Server=LOCALHOST\SQLEXPRESS;Integrated Security=true',
    -DatabaseName 'Production'
)

Write-Output "Tables: $($info.TableCount)"
Write-Output "Size: $($info.Size) MB"
Write-Output "Row Count Hash: $($info.RowCountHash)"
```

**Returns:**
```powershell
@{
    DatabaseName = 'Production'
    Size = 5120  # in MB
    TableCount = 45
    RowCountHash = 'sha256:abc123...'
    RetrievedAt = [datetime]
}
```

---

### Compute Row Count Hash

Generate SHA256 hash of row counts across all tables (for integrity verification).

```powershell
# Public method (via GetDatabaseInfo)
$hash = $provider.ComputeRowCountHash('Production')

# Returns format: 'sha256:hex_string'
# Example: 'sha256:a1b2c3d4...'
```

**Use Cases:**
- Verify golden image consistency before/after creation
- Detect accidental data modifications
- Audit trail for compliance

---

### Get Table List

Enumerate all tables in a database.

```powershell
$tables = $provider.GetTableList(
    -ConnectionString 'Server=LOCALHOST\SQLEXPRESS;Integrated Security=true',
    -DatabaseName 'Production'
)

foreach ($table in $tables) {
    Write-Output "$($table.Schema).$($table.Name) ($($table.ColumnCount) columns)"
}
```

**Returns:**
```powershell
@(
    @{ Schema = 'dbo'; Name = 'Orders'; ColumnCount = 12 }
    @{ Schema = 'dbo'; Name = 'OrderDetails'; ColumnCount = 8 }
    # ...
)
```

---

## Connection String Formats

### Windows Authentication (Recommended)

```powershell
# Local instance (Express, default)
'Server=.;Integrated Security=true;Connection Timeout=30'

# Named instance
'Server=LOCALHOST\SQLEXPRESS;Integrated Security=true;Connection Timeout=30'

# Remote server
'Server=sql-prod-01;Integrated Security=true;Connection Timeout=30'

# Remote named instance
'Server=sql-prod-01\SQLINSTANCE;Integrated Security=true;Connection Timeout=30'
```

### SQL Server Authentication

```powershell
# Local instance
'Server=.;User Id=sa;Password=YourPassword;Connection Timeout=30'

# Named instance
'Server=LOCALHOST\SQLEXPRESS;User Id=readonly;Password=***;Connection Timeout=30'

# With encryption
'Server=sql-prod-01;User Id=readonly;Password=***;Encrypt=true;TrustServerCertificate=false;Connection Timeout=30'
```

---

## Error Handling

All provider methods include comprehensive error handling:

### Backup File Not Found
```powershell
try {
    $provider.CreateGoldenImage(-SourceConnection '', -TargetVhdxPath 'C:\Golden\test.vhdx', -CreationMethod 'BackupRestore', -Options @{ BackupFile = 'C:\Backups\missing.bak' })
}
catch {
    # Caught: "Backup file not found: C:\Backups\missing.bak"
}
```

### Connection Failure
```powershell
$isValid = $provider.ValidateConnection('Server=invalid-server;Connection Timeout=1')
# Returns $false (warning logged internally)
```

### VHDX Not Found
```powershell
try {
    $provider.AttachDatabase('LOCALHOST\SQLEXPRESS', 'C:\Missing\clone.vhdx', 'TestDb')
}
catch {
    # Caught: "VHDX path not found or not mounted: C:\Missing\clone.vhdx"
}
```

### Active Connections During Detach
```powershell
$provider.DetachDatabase('LOCALHOST\SQLEXPRESS', 'TestDb')
# Logs: "Closed 3 active connections to database: TestDb"
# Gracefully kills remaining sessions if needed
```

---

## Performance Characteristics

| Operation | Typical Duration | Constraints |
|-----------|------------------|-------------|
| BackupRestore (10 GB) | 30-60 minutes | Network I/O to backup location |
| ReplicaBackup (10 GB) | 15-40 minutes | Replica must be healthy |
| TableByTableCopy (10 GB) | 60-180 minutes | Network bandwidth limited |
| AttachDatabase | 5-30 seconds | VHDX mount must complete |
| DetachDatabase | 5-10 seconds | Depends on connection count |
| Row Count Hash (1M rows) | 10-30 seconds | I/O bound |
| Replica Lag Check | < 1 second | Network latency |

---

## Limitations & Constraints

### Known Limitations

1. **Backup Compression:** Uses SQL Server's native BACKUP COMPRESSION (requires Enterprise edition for some versions)
2. **Large Databases:** TableByTableCopy method may be slow for databases > 500 GB
3. **Transaction Log:** Active transaction logs not included in table-by-table copy (data-only)
4. **Special Tables:** System tables (sys.*, tempdb) excluded from enumeration
5. **Encryption:** Transparent Data Encryption (TDE) databases require special handling

### Unsupported Scenarios

- **Cloud Databases:** Azure SQL Managed Instance, Azure SQL Database (requires different approach)
- **Read-Only Databases:** Source database must allow read operations
- **Cross-Version Restore:** Cannot restore SQL 2022 backup to SQL 2017 instance
- **Replication-Subscribed Databases:** Subscriber databases may require special handling

---

## SQL Server Version Support

| Version | Status | Tested | Notes |
|---------|--------|--------|-------|
| SQL 2017 Enterprise | Supported | Yes | Full feature set |
| SQL 2017 Standard | Supported | Partial | No BACKUP COMPRESSION |
| SQL 2019 Enterprise | Supported | Yes | Full feature set |
| SQL 2019 Standard | Supported | Partial | Limited features |
| SQL 2022 Enterprise | Supported | Yes | Full feature set |
| SQL 2022 Standard | Supported | Partial | Some limitations |

---

## Logging and Diagnostics

All operations produce verbose logs. Enable verbose output:

```powershell
$VerbosePreference = 'Continue'

$provider.ValidateConnection('Server=localhost;...')
# Outputs:
# VERBOSE: [SqlServerProvider] Initializing SQL Server Provider v1.0.0
# VERBOSE: [ValidateSqlConnection] Validating connection
# VERBOSE: [ValidateSqlConnection] Connected. SQL Version: Microsoft SQL Server 2019...
```

---

## Testing

Run unit tests with Pester:

```powershell
# Run all tests
Invoke-Pester '.\src\Providers\SqlServer\Tests\SqlServerProvider.Tests.ps1' -Verbose

# Run specific test group
Invoke-Pester '.\src\Providers\SqlServer\Tests\SqlServerProvider.Tests.ps1' -Tag 'GoldenImage'

# Generate coverage report
Invoke-Pester '.\src\Providers\SqlServer\Tests\SqlServerProvider.Tests.ps1' -CodeCoverage '.\src\Providers\SqlServer\SqlServerProvider.ps1'
```

---

## API Reference

### Public Methods

```powershell
# Constructor
$provider = [SqlServerProvider]::new()

# Golden Image Creation
[void] CreateGoldenImage(
    [string]$SourceConnection,
    [string]$TargetVhdxPath,
    [string]$CreationMethod,      # 'BackupRestore', 'ReplicaBackup', 'TableByTableCopy'
    [hashtable]$Options            # Method-specific options
)

# Backup/Restore (Legacy)
[void] BackupDatabase([string]$SourceConnection, [string]$BackupPath)
[void] RestoreDatabase([string]$TargetConnection, [string]$BackupPath, [string]$DatabaseName)

# Attach/Detach
[void] AttachDatabase([string]$InstancePath, [string]$VhdxPath, [string]$DatabaseName)
[void] DetachDatabase([string]$InstancePath, [string]$DatabaseName)

# Connection Validation
[bool] ValidateConnection([string]$ConnectionString)

# Database Information
[hashtable] GetDatabaseInfo([string]$ConnectionString, [string]$DatabaseName)
[int] GetReplicaLag([string]$ConnectionString, [string]$DatabaseName)

# Connection Management (Internal)
[void] CloseActiveConnections([string]$InstancePath, [string]$DatabaseName)
```

---

## Support & Contributing

For issues, feature requests, or contributions, please refer to the main FlashDB repository.

**Latest Version:** 1.0.0  
**Last Updated:** 2026-06-06
