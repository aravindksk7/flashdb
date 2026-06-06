-- FlashDB Task Queue Schema
-- Persistent queue backed by SQL Server for durability across restarts
-- Tables: flashdb_queue (active tasks), flashdb_queue_archive (completed/failed tasks)

-- Ensure tables don't exist before creating (for clean recreation if needed)
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[flashdb_queue_archive]') AND type in (N'U'))
    DROP TABLE [dbo].[flashdb_queue_archive];

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[flashdb_queue]') AND type in (N'U'))
    DROP TABLE [dbo].[flashdb_queue];

-- Active task queue table
-- Stores pending and processing tasks with full state tracking
CREATE TABLE [dbo].[flashdb_queue] (
    [id] NVARCHAR(36) PRIMARY KEY NOT NULL,  -- UUID
    [type] NVARCHAR(50) NOT NULL,  -- Task type: create-clone, delete-clone, create-checkpoint, restore-checkpoint
    [status] NVARCHAR(50) NOT NULL DEFAULT 'pending',  -- Status: pending, processing, completed, failed
    [payload] NVARCHAR(MAX) NOT NULL,  -- JSON payload with task parameters
    [retry_count] INT NOT NULL DEFAULT 0,  -- Number of retry attempts
    [max_retries] INT NOT NULL DEFAULT 3,  -- Maximum allowed retries
    [created_at] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),  -- When task was created
    [started_at] DATETIME2(7) NULL,  -- When task started processing
    [completed_at] DATETIME2(7) NULL,  -- When task completed/failed
    [error] NVARCHAR(MAX) NULL,  -- Error message if task failed
    [result] NVARCHAR(MAX) NULL,  -- JSON result if task completed
    [instance_id] NVARCHAR(36) NULL  -- Which API instance is processing this task
);

-- Create indexes for efficient queue operations
CREATE INDEX [IX_flashdb_queue_status] ON [dbo].[flashdb_queue] ([status]);
CREATE INDEX [IX_flashdb_queue_created_at] ON [dbo].[flashdb_queue] ([created_at] DESC);
CREATE INDEX [IX_flashdb_queue_status_created] ON [dbo].[flashdb_queue] ([status], [created_at] DESC);
CREATE INDEX [IX_flashdb_queue_type] ON [dbo].[flashdb_queue] ([type]);
CREATE INDEX [IX_flashdb_queue_instance] ON [dbo].[flashdb_queue] ([instance_id]) WHERE [instance_id] IS NOT NULL;

-- Archive table for completed/failed tasks
-- Stores completed and failed tasks for audit trail and analytics
CREATE TABLE [dbo].[flashdb_queue_archive] (
    [id] NVARCHAR(36) PRIMARY KEY NOT NULL,  -- UUID (copied from queue)
    [type] NVARCHAR(50) NOT NULL,  -- Task type
    [status] NVARCHAR(50) NOT NULL,  -- Final status: completed or failed
    [payload] NVARCHAR(MAX) NOT NULL,  -- JSON payload
    [retry_count] INT NOT NULL,  -- Number of retries performed
    [created_at] DATETIME2(7) NOT NULL,  -- When task was created
    [started_at] DATETIME2(7) NULL,  -- When task started
    [completed_at] DATETIME2(7) NULL,  -- When task completed/failed
    [error] NVARCHAR(MAX) NULL,  -- Error message if failed
    [result] NVARCHAR(MAX) NULL,  -- JSON result if completed
    [archived_at] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE()  -- When task was archived
);

-- Create indexes for archive queries
CREATE INDEX [IX_flashdb_queue_archive_status] ON [dbo].[flashdb_queue_archive] ([status]);
CREATE INDEX [IX_flashdb_queue_archive_created] ON [dbo].[flashdb_queue_archive] ([created_at] DESC);
CREATE INDEX [IX_flashdb_queue_archive_archived] ON [dbo].[flashdb_queue_archive] ([archived_at] DESC);
CREATE INDEX [IX_flashdb_queue_archive_type] ON [dbo].[flashdb_queue_archive] ([type]);
