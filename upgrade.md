# FlashDB SQL/VHD Hardening Upgrade Plan

Goal: keep FlashDB's GUI, REST API, audit, task queue, and checkpoint layer while
hardening the underlying SQL Server and VHD/VHDX operations using proven
patterns from `dataplat/dbaclone`, especially `dbatools`, repair workflows,
metadata, and remote host handling.

Status legend:

- `Not Started` - no implementation work has begun.
- `In Progress` - implementation exists but is incomplete or not fully verified.
- `Done` - implemented, tested, documented, and wired into the GUI/API where
  applicable.
- `Blocked` - cannot proceed without a dependency or decision.

## Phase 1: Provider Boundary And Contract Tests

Status: `Not Started`

Purpose: isolate low-level provider behavior so SQL/VHD internals can be
replaced without breaking the GUI/API/audit/checkpoint layer.

| Step | Status | Notes |
| --- | --- | --- |
| Freeze external GUI/API contracts for golden images, clones, checkpoints, metrics, audit, and queue operations. | `Not Started` | Capture current endpoint response shapes and GUI expectations. |
| Define a provider interface for golden image, clone, checkpoint, validation, and repair operations. | `Not Started` | Target operations: create image, create clone, attach, detach, create checkpoint, restore checkpoint, delete checkpoint, validate clone, repair clone. |
| Move provider-specific SQL/VHD logic behind the interface. | `Not Started` | Keep current provider as the first implementation. |
| Add API contract tests for current GUI-facing endpoints. | `Not Started` | Tests must protect existing GUI behavior during provider refactors. |
| Add provider contract tests with mock provider implementations. | `Not Started` | Verify API/task queue behavior independently of SQL Server. |

## Phase 2: dbatools SQL Operations Adapter

Status: `Not Started`

Purpose: replace fragile ad hoc SQL Server operations with a dedicated adapter
that prefers `dbatools` and keeps raw SQL as a controlled fallback.

| Step | Status | Notes |
| --- | --- | --- |
| Add `FlashDB.SqlOperations` PowerShell adapter module. | `Not Started` | Keep adapter independent from GUI/API code. |
| Add dependency detection for `dbatools` version and availability. | `Not Started` | Fail early with clear diagnostics. |
| Wrap SQL connection validation with `Connect-DbaInstance`. | `Not Started` | Fallback to existing connection logic only when explicitly configured. |
| Wrap database restore with `Restore-DbaDatabase`. | `Not Started` | Used by golden image creation and checkpoint restore paths. |
| Wrap attach/mount with `Mount-DbaDatabase`. | `Not Started` | Normalize file-structure handling. |
| Wrap detach/dismount with `Dismount-DbaDatabase` or `Detach-DbaDatabase`. | `Not Started` | Force-close connections when requested by API/task payload. |
| Add startup validation for SQL connectivity, permissions, and required tooling. | `Not Started` | Expose results through health/readiness endpoints. |
| Add Pester tests for adapter success and failure behavior. | `Not Started` | Mock `dbatools` calls to keep tests deterministic. |

## Phase 3: Durable Metadata Model

Status: `Not Started`

Purpose: normalize operational metadata so GUI statistics, validation, repair,
and audit can rely on durable facts instead of inferred state.

| Step | Status | Notes |
| --- | --- | --- |
| Define `GoldenImage` metadata schema. | `Not Started` | Include source DB, image path, creation method, SQL file size, row/table counts, verification state. |
| Define `Clone` metadata schema. | `Not Started` | Include parent image, clone disk path, mounted path, SQL instance, DB name, host, attach state, validation state. |
| Define `Checkpoint` metadata schema. | `Not Started` | Include checkpoint DB/disk backing, source clone, pin flag, labels, last restore state. |
| Define `Host` metadata schema. | `Not Started` | Include host name, FQDN, access method, SQL instances, path mappings, credential reference. |
| Define `RepairAttempt` metadata schema. | `Not Started` | Include validation findings, attempted actions, result, timestamps, operator/task id. |
| Add migration path from current metadata/state files or tables. | `Not Started` | Preserve existing clones/checkpoints. |
| Make GUI metrics use metadata plus live validation. | `Not Started` | Healthy clone count must reflect validated attach state. |
| Document metadata schema and ownership rules. | `Not Started` | Make clear which fields are durable facts vs live observations. |

## Phase 4: VHD/VHDX Lifecycle Module

Status: `Not Started`

Purpose: centralize VHD/VHDX handling so clone, checkpoint, repair, and cleanup
operations share the same safe disk behavior.

| Step | Status | Notes |
| --- | --- | --- |
| Add `FlashDB.VhdOperations` PowerShell module. | `Not Started` | Keep disk operations separate from SQL operations. |
| Implement create base disk operation. | `Not Started` | Support VHDX by default. |
| Implement create differencing disk operation. | `Not Started` | Validate parent before creating child disk. |
| Implement mount disk operation. | `Not Started` | Return disk number, volume info, mount/access path. |
| Implement dismount disk operation. | `Not Started` | Must handle remote and local hosts. |
| Implement disk chain validation. | `Not Started` | Detect missing/broken parent VHD/VHDX. |
| Implement owned-file cleanup rules. | `Not Started` | Delete only files FlashDB created and recorded. |
| Add rollback cleanup for partial failures. | `Not Started` | Failed clone/checkpoint creation must leave no unknown mounted disks. |
| Add Pester tests for path validation and failure cleanup. | `Not Started` | Mock disk cmdlets where needed. |

## Phase 5: Clone Validation And Repair

Status: `Not Started`

Purpose: add a first-class repair workflow similar to `dbaclone`'s repair
concept while exposing it through FlashDB's API, GUI, and audit trail.

| Step | Status | Notes |
| --- | --- | --- |
| Add `Test-FlashdbCloneHealth`. | `Not Started` | Validate metadata, VHD path, parent image, mount state, SQL file presence, DB attach state. |
| Add `Repair-FlashdbClone` with dry-run mode. | `Not Started` | Dry run reports actions without changing state. |
| Implement repair action: remount missing VHD. | `Not Started` | Use VHD module. |
| Implement repair action: detach stale SQL database. | `Not Started` | Use SQL adapter. |
| Implement repair action: attach database from clone files. | `Not Started` | Use SQL adapter and metadata file structure. |
| Implement repair action: update clone metadata and status. | `Not Started` | Record validation and repair result. |
| Add API endpoint `POST /api/clones/:id/validate`. | `Not Started` | Return structured findings. |
| Add API endpoint `POST /api/clones/:id/repair`. | `Not Started` | Queue-backed by default. |
| Add GUI validate/repair actions on clone cards/details. | `Not Started` | Show actionable errors, not raw PowerShell output. |
| Record validation and repair operations in Audit tab. | `Not Started` | Searchable by clone id, status, and message. |
| Add integration tests for broken clone detection and repair dry run. | `Not Started` | Real repair tests can be gated behind environment variables. |

## Phase 6: Remote Host Handling

Status: `Not Started`

Purpose: support dbaclone-style remote execution patterns with explicit host
validation, path mapping, and clear failure modes.

| Step | Status | Notes |
| --- | --- | --- |
| Add host registry API and metadata. | `Not Started` | Hosts are explicit resources, not inferred strings. |
| Add `Test-FlashdbHost`. | `Not Started` | Validate WinRM/remoting, permissions, module availability, disk support, SQL reachability. |
| Add UNC-to-local path conversion helper. | `Not Started` | Mirror dbaclone-style local/UNC awareness. |
| Add remote command execution wrapper. | `Not Started` | Centralize credentials, error handling, and transcript logging. |
| Add host path mapping validation. | `Not Started` | Reject invalid source/destination path combinations early. |
| Add API endpoint `GET /api/hosts`. | `Not Started` | List registered hosts and last validation status. |
| Add API endpoint `POST /api/hosts/test`. | `Not Started` | Validate a proposed host before saving. |
| Add API endpoint `POST /api/hosts/:id/validate`. | `Not Started` | Revalidate an existing host. |
| Add GUI host validation surface. | `Not Started` | Keep it operational and concise. |
| Add remote-host integration tests. | `Not Started` | Environment-gated because WinRM availability varies. |

## Phase 7: Checkpoint Reliability And Pin Semantics

Status: `In Progress`

Purpose: keep FlashDB's checkpoint/restore-point UX but make restore, delete,
pinning, and validation more reliable.

| Step | Status | Notes |
| --- | --- | --- |
| Keep checkpoint create/restore/delete API and GUI behavior stable. | `Done` | Current GUI/API layer supports restore points. |
| Ensure checkpoint restore rolls back actual SQL data. | `Done` | Covered by `tests/Integration/RestoreOrders.Tests.ps1`. |
| Record checkpoint create/restore/delete in searchable audit history. | `Done` | Current Audit tab reads queue-backed operation history. |
| Add checkpoint backing validation. | `Not Started` | Validate checkpoint DB/disk exists before restore. |
| Add pinned checkpoint delete protection. | `Not Started` | Pinned checkpoints should require explicit `force=true` to delete. |
| Add GUI warning for deleting pinned restore points. | `Not Started` | Make the protection visible to users. |
| Add checkpoint compatibility checks before restore. | `Not Started` | Ensure checkpoint belongs to clone and backing state is compatible. |
| Add tests for pinned checkpoint delete protection. | `Not Started` | API and GUI behavior should be covered. |

## Phase 8: Audit, Metrics, And Observability

Status: `In Progress`

Purpose: keep the GUI useful by making every low-level validation, repair, and
provider action visible through metrics and operation history.

| Step | Status | Notes |
| --- | --- | --- |
| Keep queue-backed operation history endpoint. | `Done` | `GET /api/operations` powers the Audit tab. |
| Keep searchable Audit tab. | `Done` | Search/filter support exists in the GUI. |
| Add validation operation records. | `Not Started` | Include dry-run validation findings. |
| Add repair operation records. | `Not Started` | Include attempted actions and final result. |
| Add host validation operation records. | `Not Started` | Useful for remote setup troubleshooting. |
| Add metrics for unhealthy clones. | `Not Started` | Count validation failures separately from detached clones. |
| Add metrics for repair success rate. | `Not Started` | Track repair attempts and outcomes. |
| Add health/readiness checks for provider dependencies. | `Not Started` | Include `dbatools`, SQL, remoting, and disk support. |

## Phase 9: Tests And Release Gates

Status: `In Progress`

Purpose: prevent regressions while replacing the provider internals.

| Step | Status | Notes |
| --- | --- | --- |
| Preserve restore regression for `[TestDB_Clone_1].[dbo].[Orders]`. | `Done` | Pester regression exists and has passed locally. |
| Add provider contract test suite. | `Not Started` | Protect API/task behavior. |
| Add SQL adapter unit tests. | `Not Started` | Mock `dbatools`. |
| Add VHD lifecycle unit tests. | `Not Started` | Mock disk cmdlets. |
| Add clone validation tests. | `Not Started` | Cover missing VHD, missing parent, stale SQL DB, detached DB. |
| Add repair dry-run tests. | `Not Started` | No destructive changes. |
| Add remote host validation tests. | `Not Started` | Environment-gated. |
| Add API integration tests for validate/repair endpoints. | `Not Started` | Queue-backed and synchronous modes. |
| Add GUI smoke tests for validate/repair/audit flows. | `Not Started` | Prefer Playwright when available. |

## Phase 10: Feature Flags And Rollout

Status: `Not Started`

Purpose: migrate safely without breaking the current FlashDB demo/runtime.

| Step | Status | Notes |
| --- | --- | --- |
| Add `FLASHDB_USE_DBATOOLS` feature flag. | `Not Started` | Default off until adapter is verified. |
| Add `FLASHDB_ENABLE_REPAIR` feature flag. | `Not Started` | Default off until API and GUI are ready. |
| Add `FLASHDB_ENABLE_REMOTE_HOSTS` feature flag. | `Not Started` | Default off until host validation is stable. |
| Migrate attach/detach path first. | `Not Started` | Smallest useful low-level migration. |
| Migrate golden image creation path. | `Not Started` | Higher risk because backup/restore behavior varies. |
| Migrate clone creation path. | `Not Started` | Depends on VHD and SQL adapters. |
| Migrate checkpoint restore path. | `Not Started` | Must keep `Orders` restore regression passing. |
| Enable repair workflow. | `Not Started` | After validation and metadata are reliable. |
| Enable remote host workflow. | `Not Started` | Last, because it adds credential/remoting complexity. |

## Modular Implementation Order

1. `FlashDB.ProviderContracts`
2. `FlashDB.SqlOperations`
3. `FlashDB.VhdOperations`
4. `FlashDB.Metadata`
5. `FlashDB.CloneValidation`
6. `FlashDB.CloneRepair`
7. `FlashDB.RemoteHosts`
8. API validate/repair/host endpoints
9. GUI validate/repair/host screens
10. Metrics and audit extensions

## Current Known Baseline

| Capability | Status | Notes |
| --- | --- | --- |
| GUI/API golden images and clones | `In Progress` | Functional but provider internals need hardening. |
| GUI checkpoint restore points | `Done` | Current workflow exists. |
| SQL data rollback on checkpoint restore | `Done` | Verified by restore regression. |
| Searchable Audit tab | `Done` | Queue-backed history is displayed. |
| Real clone size/statistics in GUI | `Done` | Current metrics use live provider data and queue history. |
| dbatools-backed SQL adapter | `Not Started` | Primary hardening target. |
| Clone repair workflow | `Not Started` | Primary missing operational feature. |
| Remote host registry and validation | `Not Started` | Planned after local repair hardening. |

## Acceptance Criteria

- Existing GUI/API workflows continue to work.
- `Invoke-Pester -Path tests/Integration/RestoreOrders.Tests.ps1 -PassThru`
  passes after each provider migration.
- Clone health reflects validated attach/mount/database state.
- Audit tab records create, restore, delete, validate, repair, and host-test
  operations.
- Repair dry run reports exact planned actions.
- Repair execution can recover a clone with a valid VHD and missing SQL attach.
- Remote host operations fail early with structured diagnostics.
- Pinned checkpoints require explicit force to delete.
