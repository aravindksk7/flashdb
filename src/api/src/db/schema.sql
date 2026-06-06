-- FlashDB Database Schema
-- Direct MSSQL implementation for optimized query performance

-- Drop tables if they exist (for fresh initialization)
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[OperationMetrics]') AND type in (N'U'))
    DROP TABLE [dbo].[OperationMetrics];

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Checkpoints]') AND type in (N'U'))
    DROP TABLE [dbo].[Checkpoints];

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[Clones]') AND type in (N'U'))
    DROP TABLE [dbo].[Clones];

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[GoldenImages]') AND type in (N'U'))
    DROP TABLE [dbo].[GoldenImages];

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

-- Clones Table
CREATE TABLE [dbo].[Clones] (
    [id] NVARCHAR(36) PRIMARY KEY NOT NULL,
    [goldenImageId] NVARCHAR(36) NOT NULL,
    [cloneName] NVARCHAR(255) NOT NULL,
    [instancePath] NVARCHAR(MAX) NOT NULL,
    [storagePath] NVARCHAR(MAX) NOT NULL,
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
    FOREIGN KEY ([cloneId]) REFERENCES [dbo].[Clones] ([id]) ON DELETE CASCADE
);

CREATE INDEX [IX_Checkpoints_CloneId] ON [dbo].[Checkpoints] ([cloneId]);
CREATE INDEX [IX_Checkpoints_CheckpointName] ON [dbo].[Checkpoints] ([checkpointName]);
CREATE INDEX [IX_Checkpoints_CreatedAt] ON [dbo].[Checkpoints] ([createdAt] DESC);
CREATE INDEX [IX_Checkpoints_IsFavorite] ON [dbo].[Checkpoints] ([isFavorite]);

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
