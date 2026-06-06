-- FlashDB Multi-Instance Cluster Schema
-- Enables stateless API instances with shared PostgreSQL state
-- Table: flashdb_instances (instance registry and heartbeat tracking)

SET QUOTED_IDENTIFIER ON;

-- Drop table if exists for clean recreation
IF EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[flashdb_instances]') AND type in (N'U'))
    DROP TABLE [dbo].[flashdb_instances];

-- Instance registry table
-- Tracks all active API instances in the cluster
-- Supports multi-instance deployment without load balancer
CREATE TABLE [dbo].[flashdb_instances] (
    [instance_id] NVARCHAR(36) PRIMARY KEY NOT NULL,  -- UUID: unique instance identifier
    [role] NVARCHAR(20) NOT NULL DEFAULT 'primary',  -- Role: primary or replica
    [status] NVARCHAR(20) NOT NULL DEFAULT 'active',  -- Status: active, inactive, unhealthy
    [last_heartbeat] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),  -- Heartbeat timestamp for liveness detection
    [host] NVARCHAR(255) NOT NULL,  -- Hostname or IP address
    [port] INT NOT NULL,  -- API port number
    [version] NVARCHAR(50) NOT NULL DEFAULT '1.0.0',  -- API version
    [created_at] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),  -- When instance registered
    [updated_at] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE()  -- Last update timestamp
);

-- Create indexes for efficient queries
-- Index on status for filtering active instances
CREATE INDEX [IX_flashdb_instances_status] ON [dbo].[flashdb_instances] ([status]);

-- Index on last_heartbeat for liveness detection (30-second TTL)
CREATE INDEX [IX_flashdb_instances_heartbeat] ON [dbo].[flashdb_instances] ([last_heartbeat] DESC);

-- Index on role for primary/replica queries
CREATE INDEX [IX_flashdb_instances_role] ON [dbo].[flashdb_instances] ([role]);

-- Composite index for common queries: status + heartbeat
CREATE INDEX [IX_flashdb_instances_status_heartbeat] ON [dbo].[flashdb_instances] ([status], [last_heartbeat] DESC);

-- Composite index for filtering by status and role
CREATE INDEX [IX_flashdb_instances_status_role] ON [dbo].[flashdb_instances] ([status], [role]);

-- Add comments for documentation
EXEC sys.sp_addextendedproperty @name = N'MS_Description',
    @value = N'Multi-instance cluster registry. Stores heartbeats and instance metadata. Instances are considered active if last_heartbeat is within 30 seconds.',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'flashdb_instances';

EXEC sys.sp_addextendedproperty @name = N'MS_Description',
    @value = N'Unique instance identifier (UUID). Set via INSTANCE_ID env var.',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'flashdb_instances',
    @level2type = N'COLUMN', @level2name = N'instance_id';

EXEC sys.sp_addextendedproperty @name = N'MS_Description',
    @value = N'Instance role: "primary" (handles writes) or "replica" (read-only). Simplified - no consensus protocol.',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'flashdb_instances',
    @level2type = N'COLUMN', @level2name = N'role';

EXEC sys.sp_addextendedproperty @name = N'MS_Description',
    @value = N'Instance status: "active" (healthy), "inactive" (gracefully shut down), or "unhealthy" (crashed/stale).',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'flashdb_instances',
    @level2type = N'COLUMN', @level2name = N'status';

EXEC sys.sp_addextendedproperty @name = N'MS_Description',
    @value = N'Last heartbeat timestamp. Used for liveness detection. If > 30 seconds old, instance is considered dead.',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'flashdb_instances',
    @level2type = N'COLUMN', @level2name = N'last_heartbeat';

EXEC sys.sp_addextendedproperty @name = N'MS_Description',
    @value = N'Instance hostname or IP. Used by clients for direct instance communication.',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'flashdb_instances',
    @level2type = N'COLUMN', @level2name = N'host';

EXEC sys.sp_addextendedproperty @name = N'MS_Description',
    @value = N'Instance API port. Used by clients to connect directly. Can vary per instance.',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'flashdb_instances',
    @level2type = N'COLUMN', @level2name = N'port';

EXEC sys.sp_addextendedproperty @name = N'MS_Description',
    @value = N'API version. Helps detect version mismatches in mixed-version clusters.',
    @level0type = N'SCHEMA', @level0name = N'dbo',
    @level1type = N'TABLE', @level1name = N'flashdb_instances',
    @level2type = N'COLUMN', @level2name = N'version';
