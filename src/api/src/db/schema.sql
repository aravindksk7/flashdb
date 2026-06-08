-- FlashDB Database Schema
-- Direct MSSQL implementation for optimized query performance

-- Drop tables if they exist (for fresh initialization)
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[CheckpointOperations]') AND type in (N'U'))
    DROP TABLE [dbo].[CheckpointOperations];
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[OperationMetrics]') AND type in (N'U'))
    DROP TABLE [dbo].[OperationMetrics];
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Checkpoints]') AND type in (N'U'))
    DROP TABLE [dbo].[Checkpoints];
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Clones]') AND type in (N'U'))
    DROP TABLE [dbo].[Clones];
GO

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GoldenImages]') AND type in (N'U'))
    DROP TABLE [dbo].[GoldenImages];
GO

-- Golden Images Table
CREATE TABLE [dbo].[GoldenImages] (
    [id] NVARCHAR(36) PRIMARY KEY NOT NULL,
    [imageName] NVARCHAR(255) NOT NULL,
    [imagePath] NVARCHAR(MAX) NOT NULL,
    [imageSize] BIGINT,
    [checksumSHA256] NVARCHAR(64),
    [isCompressed] BIT DEFAULT 0,
    [compressionType] NVARCHAR(50),
    [createdAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX [IX_GoldenImages_ImageName] ON [dbo].[GoldenImages] ([imageName]);
CREATE INDEX [IX_GoldenImages_CreatedAt] ON [dbo].[GoldenImages] ([createdAt]);
GO

-- Clones Table
CREATE TABLE [dbo].[Clones] (
    [id] NVARCHAR(36) PRIMARY KEY NOT NULL,
    [goldenImageId] NVARCHAR(36) NOT NULL,
    [cloneName] NVARCHAR(255) NOT NULL,
    [instancePath] NVARCHAR(MAX) NOT NULL,
    [storagePath] NVARCHAR(MAX) NOT NULL,
    [vhdxPath] NVARCHAR(MAX),
    [status] NVARCHAR(50) DEFAULT 'Pending',
    [databaseType] NVARCHAR(50),
    [databaseName] NVARCHAR(255),
    [compressionEnabled] BIT DEFAULT 0,
    [size] BIGINT,
    [lastModified] DATETIME2(7),
    [createdAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [updatedAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([goldenImageId]) REFERENCES [dbo].[GoldenImages] ([id])
);

CREATE INDEX [IX_Clones_CloneName] ON [dbo].[Clones] ([cloneName]);
CREATE INDEX [IX_Clones_Status] ON [dbo].[Clones] ([status]);
CREATE INDEX [IX_Clones_GoldenImageId] ON [dbo].[Clones] ([goldenImageId]);
CREATE INDEX [IX_Clones_CreatedAt] ON [dbo].[Clones] ([createdAt] DESC);
CREATE INDEX [IX_Clones_VhdxPath] ON [dbo].[Clones] ([vhdxPath]);
GO

-- Checkpoints Table
CREATE TABLE [dbo].[Checkpoints] (
    [id] NVARCHAR(36) PRIMARY KEY NOT NULL,
    [cloneId] NVARCHAR(36) NOT NULL,
    [checkpointName] NVARCHAR(255) NOT NULL,
    [phase] NVARCHAR(50) DEFAULT 'manual',
    [description] NVARCHAR(MAX),
    [isFavorite] BIT DEFAULT 0,
    [labels] NVARCHAR(MAX),
    [size] BIGINT,
    [restoredAt] DATETIME2(7),
    [createdAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [lastOperationId] NVARCHAR(36),
    [vhdxPath] NVARCHAR(MAX),
    [parentCheckpointId] NVARCHAR(36),
    [stateHash] NVARCHAR(64),
    [transactionLsn] NVARCHAR(50),
    [isOrphaned] BIT DEFAULT 0,
    FOREIGN KEY ([cloneId]) REFERENCES [dbo].[Clones] ([id]) ON DELETE CASCADE,
    FOREIGN KEY ([parentCheckpointId]) REFERENCES [dbo].[Checkpoints] ([id])
);

CREATE INDEX [IX_Checkpoints_CloneId] ON [dbo].[Checkpoints] ([cloneId]);
CREATE INDEX [IX_Checkpoints_CheckpointName] ON [dbo].[Checkpoints] ([checkpointName]);
CREATE INDEX [IX_Checkpoints_CreatedAt] ON [dbo].[Checkpoints] ([createdAt] DESC);
CREATE INDEX [IX_Checkpoints_IsFavorite] ON [dbo].[Checkpoints] ([isFavorite]);
CREATE INDEX [IX_Checkpoints_ParentCheckpointId] ON [dbo].[Checkpoints] ([parentCheckpointId]);
CREATE INDEX [IX_Checkpoints_IsOrphaned] ON [dbo].[Checkpoints] ([isOrphaned]);
GO

-- Checkpoint Operations Table for atomic transaction tracking
CREATE TABLE [dbo].[CheckpointOperations] (
    [id] NVARCHAR(36) PRIMARY KEY NOT NULL,
    [checkpointId] NVARCHAR(36) NOT NULL,
    [cloneId] NVARCHAR(36) NOT NULL,
    [operationType] NVARCHAR(50) NOT NULL,
    [status] NVARCHAR(50) NOT NULL DEFAULT 'pending',
    [vhdxPath] NVARCHAR(MAX),
    [backupVhdxPath] NVARCHAR(MAX),
    [databaseCheckpointLsn] NVARCHAR(50),
    [preVhdxStateHash] NVARCHAR(64),
    [postVhdxStateHash] NVARCHAR(64),
    [validationStatus] NVARCHAR(50),
    [validationError] NVARCHAR(MAX),
    [startedAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [completedAt] DATETIME2(7),
    [errorMessage] NVARCHAR(MAX),
    [rollbackPath] NVARCHAR(MAX),
    FOREIGN KEY ([cloneId]) REFERENCES [dbo].[Clones] ([id]),
    FOREIGN KEY ([checkpointId]) REFERENCES [dbo].[Checkpoints] ([id]) ON DELETE CASCADE
);

CREATE INDEX [IX_CheckpointOperations_CheckpointId] ON [dbo].[CheckpointOperations] ([checkpointId]);
CREATE INDEX [IX_CheckpointOperations_Status] ON [dbo].[CheckpointOperations] ([status]);
CREATE INDEX [IX_CheckpointOperations_CloneId] ON [dbo].[CheckpointOperations] ([cloneId]);
CREATE INDEX [IX_CheckpointOperations_ValidationStatus] ON [dbo].[CheckpointOperations] ([validationStatus]);
GO

-- Operation Metrics Table
CREATE TABLE [dbo].[OperationMetrics] (
    [id] NVARCHAR(36) PRIMARY KEY NOT NULL,
    [operationType] NVARCHAR(50) NOT NULL,
    [targetId] NVARCHAR(36),
    [status] NVARCHAR(50) DEFAULT 'Pending',
    [durationMs] INT,
    [errorMessage] NVARCHAR(MAX),
    [startedAt] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [completedAt] DATETIME2(7)
);

CREATE INDEX [IX_OperationMetrics_OperationType] ON [dbo].[OperationMetrics] ([operationType]);
CREATE INDEX [IX_OperationMetrics_Status] ON [dbo].[OperationMetrics] ([status]);
CREATE INDEX [IX_OperationMetrics_StartedAt] ON [dbo].[OperationMetrics] ([startedAt] DESC);
CREATE INDEX [IX_OperationMetrics_TargetId] ON [dbo].[OperationMetrics] ([targetId]);
GO

-- Orphaned Operation Recovery Procedure
-- Cleans up incomplete checkpoint operations that are >1 hour old
-- Useful on API startup to recover from crashes
IF OBJECT_ID('[dbo].[sp_CleanupOrphanedCheckpointOperations]', 'P') IS NOT NULL
    DROP PROCEDURE [dbo].[sp_CleanupOrphanedCheckpointOperations];

GO

CREATE PROCEDURE [dbo].[sp_CleanupOrphanedCheckpointOperations]
    @HoursBack INT = 1,  -- Operations older than this are considered abandoned
    @CleanupMode BIT = 0  -- 0 = Report only, 1 = Clean (delete records)
AS
BEGIN
    SET NOCOUNT ON;

    -- Find abandoned in-progress operations
    SELECT
        [id],
        [checkpointId],
        [cloneId],
        [operationType],
        [vhdxPath],
        [rollbackPath],
        DATEDIFF(HOUR, [startedAt], GETUTCDATE()) as HoursAgo
    INTO #OrphanedOps
    FROM [dbo].[CheckpointOperations]
    WHERE [status] = 'in-progress'
        AND [startedAt] < DATEADD(HOUR, -@HoursBack, GETUTCDATE());

    -- Report findings
    SELECT * FROM #OrphanedOps;

    -- Clean if requested
    IF @CleanupMode = 1
    BEGIN
        UPDATE [dbo].[CheckpointOperations]
        SET [status] = 'rolled-back',
            [errorMessage] = 'Auto-cleanup: Operation abandoned after ' + CAST(@HoursBack AS VARCHAR(10)) + ' hour(s)',
            [completedAt] = GETUTCDATE()
        WHERE [id] IN (SELECT [id] FROM #OrphanedOps);

        -- Also mark associated checkpoints as orphaned if in progress
        UPDATE [dbo].[Checkpoints]
        SET [isOrphaned] = 1
        WHERE [id] IN (SELECT [checkpointId] FROM #OrphanedOps);
    END

    DROP TABLE #OrphanedOps;
END;
GO
