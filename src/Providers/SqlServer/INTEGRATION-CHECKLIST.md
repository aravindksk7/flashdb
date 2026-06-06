# SQL Server Provider - Integration Checklist

**For:** API Development Team (apidev)  
**Provider:** SqlServerProvider v1.0.0  
**Status:** Ready for Integration  
**Date:** 2026-06-06

---

## Pre-Integration Verification

### Code Quality
- [ ] Review `SqlServerProvider.ps1` for code style compliance
- [ ] Verify all SQL operations match specification (BACKUP, RESTORE, CREATE DATABASE FOR ATTACH, sp_detach_db)
- [ ] Check error handling patterns align with project standards
- [ ] Validate logging follows project conventions

### Testing
- [ ] Run full test suite: `Invoke-Pester .\src\Providers\SqlServer\Tests\SqlServerProvider.Tests.ps1`
- [ ] Verify all 50+ tests pass
- [ ] Check test coverage for critical paths
- [ ] Review mock data and test scenarios

### Documentation
- [ ] Read README.md for API understanding
- [ ] Review IMPLEMENTATION.md for technical details
- [ ] Check Examples.ps1 for usage patterns
- [ ] Verify API-REFERENCE.md covers all public methods

---

## Integration Tasks

### 1. Dependency Management

```powershell
# Check required assemblies
[ ] System.Data.SqlClient (built-in)
[ ] System.Security.Cryptography (for SHA256)
[ ] Optional: SQL Server SMO (for advanced features)
```

**Action Items:**
- [ ] Verify .NET Framework/PowerShell version compatibility
- [ ] Add any missing module dependencies to manifest
- [ ] Test assembly loading on target systems

---

### 2. Module Registration

**Integrate provider into FlashDB module:**

```powershell
# In src/FlashDB/FlashDB.psm1, add:
. '.\Providers\SqlServer\SqlServerProvider.ps1'

# Create provider registry
$FlashdbProviderRegistry = @{
    'SqlServer' = [SqlServerProvider]::new()
}
```

**Action Items:**
- [ ] Add provider import to FlashDB.psm1
- [ ] Create provider factory/discovery mechanism
- [ ] Register all database provider types (future: PostgreSQL, MySQL)
- [ ] Update FlashDB.psd1 to export provider classes

---

### 3. Wrapper Cmdlet Creation

**Create user-facing PowerShell cmdlets:**

```powershell
# Golden Image Management
function New-FlashdbGoldenImage {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [ValidateSet('BackupRestore', 'ReplicaBackup', 'TableByTableCopy')]
        [string]$Method,
        
        [Parameter(Mandatory=$true)]
        [string]$TargetPath,
        
        [hashtable]$Options,
        
        [string]$Version = (Get-Date -Format 'yyyyMMdd')
    )
    
    $provider = Get-FlashdbProvider -Type 'SqlServer'
    # ... validation and delegation to provider.CreateGoldenImage()
}

# Clone Management
function New-FlashdbClone {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$GoldenImageId,
        
        [Parameter(Mandatory=$true)]
        [string]$CloneName,
        
        [string]$InstancePath = 'LOCALHOST\SQLEXPRESS',
        
        [string]$StoragePath = 'D:\FlashdbClones'
    )
    # ... delegate to provider.AttachDatabase()
}

function Disconnect-FlashdbClone {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$CloneId
    )
    # ... delegate to provider.DetachDatabase()
}
```

**Action Items:**
- [ ] Create wrapper cmdlets for each provider method
- [ ] Add parameter validation and defaults
- [ ] Implement clone metadata persistence
- [ ] Add progress reporting for long operations
- [ ] Create help documentation (Get-Help)

---

### 4. State Management Integration

**Link provider operations to clone metadata:**

```powershell
# Golden image metadata (from IMPLEMENTATION.md Section 4)
$goldenImageMetadata = @{
    id = 'golden-prod-20260606'
    parentVhdxPath = '\\shared\GoldenImages\prod-main-20260606.vhdx'
    creationMethod = 'ReplicaBackup'  # Provider method used
    sourceConnection = 'Server=prod-replica;...'
    sourceRowCountHash = 'sha256:abc123...'
    verificationStatus = 'verified'
}

# Clone metadata (from IMPLEMENTATION.md Section 4)
$cloneMetadata = @{
    id = 'clone-prod-dev1'
    vhdxPath = 'D:\Clones\clone-prod-dev1.vhdx'
    database = @{
        type = 'SqlServer'
        databaseName = 'Production_Clone'
        instancePath = 'LOCALHOST\SQLEXPRESS'
    }
    attachment = @{
        status = 'attached'
        attachedAt = (Get-Date)
    }
}
```

**Action Items:**
- [ ] Create Golden Image metadata schema (JSON)
- [ ] Create Clone metadata schema (JSON)
- [ ] Implement metadata persistence (save/load)
- [ ] Update metadata on provider operations
- [ ] Validate metadata consistency

---

### 5. REST API Endpoints

**Create REST API endpoints wrapping provider methods:**

```
POST /api/golden-images
  Body: { method: 'BackupRestore', backupFile: 'path', outputPath: 'path' }
  → provider.CreateGoldenImage()

GET /api/golden-images/{id}
  → Return golden image metadata

POST /api/clones
  Body: { goldenImageId: 'id', cloneName: 'name', instancePath: '...', storagePath: '...' }
  → provider.AttachDatabase()

DELETE /api/clones/{id}
  → provider.DetachDatabase()

GET /api/clones/{id}/database-info
  → provider.GetDatabaseInfo()
```

**Action Items:**
- [ ] Define API schema (OpenAPI/Swagger)
- [ ] Implement endpoint handlers
- [ ] Add authentication/authorization
- [ ] Implement error response formatting
- [ ] Add request/response validation

---

### 6. GUI Integration

**Add UI for provider configuration and monitoring:**

**Golden Image Creation:**
- [ ] Provider selection dropdown (BackupRestore, ReplicaBackup, TableByTableCopy)
- [ ] Method-specific input fields:
  - BackupRestore: Backup file picker
  - ReplicaBackup: Connection string builder + lag display
  - TableByTableCopy: Read-only account credentials
- [ ] Output path selector
- [ ] Compression checkbox
- [ ] Progress indicator with table count

**Clone Management:**
- [ ] Golden image selector
- [ ] Clone name input
- [ ] Instance path selector
- [ ] Storage location picker
- [ ] Attach/detach buttons
- [ ] Database info display (size, table count, row count hash)

**Monitoring:**
- [ ] Replica lag display (for ReplicaBackup method)
- [ ] Connection validation indicator
- [ ] Operation progress bars
- [ ] Error message display

**Action Items:**
- [ ] Design UI mockups
- [ ] Implement WPF/web components
- [ ] Add real-time status updates
- [ ] Implement error/warning messages
- [ ] Add contextual help/tooltips

---

### 7. Configuration Management

**Update FlashDB configuration schema:**

```json
{
  "sqlServerProvider": {
    "defaultInstance": "LOCALHOST\SQLEXPRESS",
    "authMethod": "Windows",
    "connectionTimeout": 30,
    "commandTimeout": 3600,
    "checkpointTimeout": 600,
    "enableRowCountVerification": true,
    "enableSchemaValidation": true,
    "compressionEnabled": true,
    "maxReplicaLagSeconds": 5
  },
  "goldenImagePath": "\\shared\GoldenImages",
  "defaultCloneStoragePath": "D:\CloneStorage"
}
```

**Action Items:**
- [ ] Add SqlServer provider section to config schema
- [ ] Implement config validation
- [ ] Add config management cmdlets (Get/Set-FlashdbConfig)
- [ ] Set sensible defaults
- [ ] Document all configuration options

---

### 8. Logging & Diagnostics

**Integrate provider logging with FlashDB logging:**

```powershell
# Enable verbose logging
$VerbosePreference = 'Continue'

# Provider outputs:
# VERBOSE: [SqlServerProvider] Initializing...
# VERBOSE: [AttachDatabase] Attaching database...
# VERBOSE: [_CalculateRowCountHash] Calculated hash: sha256:...

# Capture logs to file
$logPath = 'C:\Logs\flashdb-provider.log'
Start-Transcript -Path $logPath -Append
```

**Action Items:**
- [ ] Verify provider logging output format
- [ ] Integrate with project logging framework
- [ ] Add log file rotation
- [ ] Implement debug/trace levels
- [ ] Create diagnostic reporting

---

### 9. Performance & Optimization

**Monitor and optimize provider performance:**

```powershell
# Baseline performance metrics (from IMPLEMENTATION.md)
$metrics = @{
    'BackupRestore (10GB)' = '30-60 min'
    'ReplicaBackup (10GB)' = '15-40 min'
    'TableByTableCopy (10GB)' = '60-180 min'
    'AttachDatabase' = '5-30 sec'
    'DetachDatabase' = '5-10 sec'
    'Row Count Hash' = '10-30 sec'
}
```

**Action Items:**
- [ ] Benchmark actual performance on target hardware
- [ ] Identify bottlenecks (I/O, network, CPU)
- [ ] Implement connection pooling if needed
- [ ] Consider caching for frequently accessed data
- [ ] Optimize SQL queries if necessary
- [ ] Load test with multiple concurrent operations

---

### 10. Security Review

**Verify security posture:**

```powershell
# Security checklist
[ ] No hardcoded credentials in code
[ ] Connection strings encrypted in configuration
[ ] SQL injection prevention (parameterized queries if needed)
[ ] Principle of least privilege (read-only for table copy)
[ ] Audit logging of all operations (timestamps, user)
[ ] Secure cleanup of sensitive data
[ ] No sensitive data in error messages
[ ] Support for SQL authentication encryption
```

**Action Items:**
- [ ] Perform code security review
- [ ] Check for SQL injection vulnerabilities
- [ ] Verify credential handling
- [ ] Validate access control
- [ ] Review audit logging
- [ ] Test with security scanning tools

---

### 11. Compatibility Testing

**Test on multiple SQL Server versions:**

```powershell
# Test matrix
[ ] SQL Server 2017 Enterprise
[ ] SQL Server 2017 Standard
[ ] SQL Server 2019 Enterprise
[ ] SQL Server 2019 Standard
[ ] SQL Server 2022 Enterprise
[ ] SQL Server 2022 Standard
```

**Test Scenarios:**
- [ ] All three golden image creation methods
- [ ] Attach/detach operations
- [ ] Backup/restore workflow
- [ ] Connection validation
- [ ] Replica lag detection
- [ ] Row count hashing
- [ ] Error handling (file not found, connection timeout, etc.)

**Action Items:**
- [ ] Set up test SQL Server instances
- [ ] Run integration tests on each version
- [ ] Document any version-specific quirks
- [ ] Create version compatibility matrix

---

### 12. Documentation Updates

**Update project documentation:**

- [ ] Add provider to architecture documentation
- [ ] Update README.md with provider information
- [ ] Add provider troubleshooting guide
- [ ] Document configuration options
- [ ] Create operator runbooks
- [ ] Update API documentation
- [ ] Add provider-specific monitoring guide

**Action Items:**
- [ ] Review and update main FlashDB documentation
- [ ] Create provider-specific deployment guide
- [ ] Document supported scenarios and limitations
- [ ] Create troubleshooting playbook
- [ ] Add examples to project wiki

---

## Deployment Checklist

### Pre-Production
- [ ] All code reviewed and approved
- [ ] All tests passing (unit, integration, performance)
- [ ] Security review completed
- [ ] Performance benchmarked and acceptable
- [ ] Documentation complete and reviewed
- [ ] API contract finalized
- [ ] Configuration schema finalized

### Production Deployment
- [ ] Provider module deployed to production environment
- [ ] PowerShell cmdlets available to users
- [ ] REST API endpoints available
- [ ] GUI fully functional
- [ ] Monitoring and alerting configured
- [ ] Backup and disaster recovery procedures documented
- [ ] Support team trained

### Post-Deployment
- [ ] Monitor for issues and performance
- [ ] Gather user feedback
- [ ] Track usage metrics
- [ ] Plan for enhancements

---

## Integration Handoff

**Verification Before Handoff:**
- [ ] Provider code reviewed by SQL Server specialist
- [ ] All integration tests passing
- [ ] Performance validated on production-like systems
- [ ] Documentation complete and accurate
- [ ] Team trained on provider capabilities and limitations
- [ ] Monitoring and alerting configured

**Deliverables to apidev:**
- [ ] `SqlServerProvider.ps1` (implementation)
- [ ] `Tests/SqlServerProvider.Tests.ps1` (unit tests)
- [ ] `README.md` (API reference)
- [ ] `IMPLEMENTATION.md` (technical details)
- [ ] `API-REFERENCE.md` (quick reference)
- [ ] `Examples.ps1` (usage examples)
- [ ] This checklist (integration guide)

---

## Sign-Off

**Developed By:** SqlServerProvider Team  
**Date:** 2026-06-06  
**Version:** 1.0.0  

**For Integration By:** API Development Team (apidev)  
**Target Integration Date:** 2026-06-13  
**Estimated Integration Effort:** 3-5 days  

---

## Questions & Support

For questions or issues during integration:

1. Consult **README.md** for API overview
2. Check **IMPLEMENTATION.md** for technical details
3. Review **Examples.ps1** for usage patterns
4. Search **API-REFERENCE.md** for specific methods

---

**Status: READY FOR HANDOFF**

All deliverables complete and ready for API team integration.
