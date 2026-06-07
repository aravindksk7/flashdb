# FlashDB Restore Functionality Test

This manual test validates that restoring a checkpoint really rolls back data in
`[TestDB_Clone_1].[dbo].[Orders]`.

## Prerequisites

- FlashDB API and GUI are running.
- SQL Server is reachable on the configured instance.
- `TestDB_Clone_1` exists and is online.
- The clone has a `dbo.Orders` table with the standard FlashDB sample schema.

## Quick Checks

```sql
SELECT name, state_desc
FROM sys.databases
WHERE name = N'TestDB_Clone_1';

SELECT COUNT(*) AS OrderCount
FROM [TestDB_Clone_1].[dbo].[Orders];
```

`state_desc` should be `ONLINE`.

## Test Procedure

### 1. Record The Baseline

```sql
SELECT COUNT(*) AS InitialOrderCount
FROM [TestDB_Clone_1].[dbo].[Orders];

SELECT COUNT(*) AS ExistingProbeRows
FROM [TestDB_Clone_1].[dbo].[Orders]
WHERE [Status] = N'FBRT_MANUAL';
```

`ExistingProbeRows` should be `0`. If it is not, remove old probe rows before
continuing:

```sql
DELETE FROM [TestDB_Clone_1].[dbo].[Orders]
WHERE [Status] = N'FBRT_MANUAL';
```

### 2. Create A Checkpoint

1. Open the FlashDB GUI.
2. Go to the Management tab.
3. Select `TestDB_Clone_1`.
4. Create a checkpoint named `pre-restore-test`.
5. Wait until the checkpoint appears in the restore point list.

### 3. Add A Probe Row

```sql
INSERT INTO [TestDB_Clone_1].[dbo].[Orders]
    ([CustomerID], [OrderDate], [TotalAmount], [Status])
VALUES
    (1, GETDATE(), 123.45, N'FBRT_MANUAL');

SELECT COUNT(*) AS ProbeRowsAfterInsert
FROM [TestDB_Clone_1].[dbo].[Orders]
WHERE [Status] = N'FBRT_MANUAL';
```

`ProbeRowsAfterInsert` should be `1`.

### 4. Restore The Checkpoint

1. In the GUI, open the clone restore points for `TestDB_Clone_1`.
2. Restore the `pre-restore-test` checkpoint.
3. Wait for the restore operation to complete.

### 5. Verify The Rollback

```sql
SELECT COUNT(*) AS AfterRestoreOrderCount
FROM [TestDB_Clone_1].[dbo].[Orders];

SELECT COUNT(*) AS ProbeRowsAfterRestore
FROM [TestDB_Clone_1].[dbo].[Orders]
WHERE [Status] = N'FBRT_MANUAL';
```

## Expected Results

| Check | Expected |
| --- | --- |
| `ProbeRowsAfterInsert` | `1` |
| `AfterRestoreOrderCount` | Matches `InitialOrderCount` |
| `ProbeRowsAfterRestore` | `0` |

Restore is working when the probe row inserted after checkpoint creation is gone
after restore.

## Automated Regression

The same behavior is covered by:

```powershell
Invoke-Pester -Path tests/Integration/RestoreOrders.Tests.ps1
```

The automated test creates a checkpoint, inserts an `FBRT%` probe row into
`[TestDB_Clone_1].[dbo].[Orders]`, restores the checkpoint, and verifies that the
row is removed.

## Troubleshooting

If restore does not roll back the probe row:

- Check the Audit tab in the GUI for the restore operation status and error.
- Call `GET /api/operations?limit=250` to inspect durable operation history.
- Check that `TestDB_Clone_1` is online after restore.
- Confirm checkpoint databases named `FlashDB_Checkpoint_*` exist only for active
  restore points.
- Review API container logs for PowerShell or SQL Server restore errors.
