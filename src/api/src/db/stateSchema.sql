-- FlashDB State Management Schema
-- PostgreSQL-backed centralized state management to replace Redis
-- Tables: flashdb_state (key-value store), flashdb_locks (distributed locks), flashdb_operations (in-flight operations)

-- Ensure tables don't exist before creating
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[flashdb_operations]') AND type in (N'U'))
    DROP TABLE [dbo].[flashdb_operations];

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[flashdb_locks]') AND type in (N'U'))
    DROP TABLE [dbo].[flashdb_locks];

IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[flashdb_state]') AND type in (N'U'))
    DROP TABLE [dbo].[flashdb_state];

-- State key-value store
-- Stores application state as JSON, replaces Redis in-memory store
CREATE TABLE [dbo].[flashdb_state] (
    [key] NVARCHAR(255) PRIMARY KEY NOT NULL,
    [value] NVARCHAR(MAX) NOT NULL,  -- JSON value
    [updated_at] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [created_at] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [expires_at] DATETIME2(7) NULL  -- Optional TTL support
);

CREATE INDEX [IX_flashdb_state_updated_at] ON [dbo].[flashdb_state] ([updated_at] DESC);
CREATE INDEX [IX_flashdb_state_expires_at] ON [dbo].[flashdb_state] ([expires_at]) WHERE [expires_at] IS NOT NULL;

-- Distributed locks via PostgreSQL
-- Ensures only one instance can perform critical operations at a time
CREATE TABLE [dbo].[flashdb_locks] (
    [resource_id] NVARCHAR(255) PRIMARY KEY NOT NULL,
    [owner_id] NVARCHAR(36) NOT NULL,
    [acquired_at] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [expires_at] DATETIME2(7) NOT NULL,
    [lock_info] NVARCHAR(MAX) NULL  -- Optional metadata about lock
);

CREATE INDEX [IX_flashdb_locks_owner_id] ON [dbo].[flashdb_locks] ([owner_id]);
CREATE INDEX [IX_flashdb_locks_expires_at] ON [dbo].[flashdb_locks] ([expires_at]);

-- In-flight operations tracking
-- Monitors operations across API instances for consistency
CREATE TABLE [dbo].[flashdb_operations] (
    [operation_id] NVARCHAR(36) PRIMARY KEY NOT NULL,
    [operation_type] NVARCHAR(100) NOT NULL,
    [resource_id] NVARCHAR(255) NOT NULL,
    [status] NVARCHAR(50) DEFAULT 'pending',  -- pending, in-progress, completed, failed
    [started_at] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [completed_at] DATETIME2(7) NULL,
    [result] NVARCHAR(MAX) NULL,  -- JSON result
    [error] NVARCHAR(MAX) NULL,
    [instance_id] NVARCHAR(36) NOT NULL  -- Which API instance owns this operation
);

CREATE INDEX [IX_flashdb_operations_operation_type] ON [dbo].[flashdb_operations] ([operation_type]);
CREATE INDEX [IX_flashdb_operations_resource_id] ON [dbo].[flashdb_operations] ([resource_id]);
CREATE INDEX [IX_flashdb_operations_status] ON [dbo].[flashdb_operations] ([status]);
CREATE INDEX [IX_flashdb_operations_started_at] ON [dbo].[flashdb_operations] ([started_at] DESC);
CREATE INDEX [IX_flashdb_operations_instance_id] ON [dbo].[flashdb_operations] ([instance_id]);
