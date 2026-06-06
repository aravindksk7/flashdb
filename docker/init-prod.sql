-- FlashDB Production Database Initialization Script
-- Initializes databases and sets up backup maintenance

-- Set master database context
USE master;
GO

-- ============================================================================
-- Database Creation
-- ============================================================================

-- Create FlashDB primary database if not exists
IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = 'FlashDB')
BEGIN
    CREATE DATABASE FlashDB
    ON PRIMARY (
        NAME = FlashDB_Data,
        FILENAME = '/var/opt/mssql/data/FlashDB.mdf',
        SIZE = 100MB,
        FILEGROWTH = 50MB
    )
    LOG ON (
        NAME = FlashDB_Log,
        FILENAME = '/var/opt/mssql/data/FlashDB_log.ldf',
        SIZE = 50MB,
        FILEGROWTH = 25MB
    );
    PRINT 'Database FlashDB created successfully.';
END
ELSE
    PRINT 'Database FlashDB already exists.';
GO

-- ============================================================================
-- Set Recovery Mode to Full for Backup Support
-- ============================================================================

ALTER DATABASE FlashDB SET RECOVERY FULL;
GO

ALTER DATABASE FlashDB SET PAGE_VERIFY CHECKSUM;
GO

-- ============================================================================
-- Create Database Tables for FlashDB Operations
-- ============================================================================

USE FlashDB;
GO

-- FlashDB operations metadata table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'OperationMetadata')
BEGIN
    CREATE TABLE OperationMetadata (
        OperationId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        OperationType NVARCHAR(50) NOT NULL,
        Status NVARCHAR(20) DEFAULT 'Pending',
        StartTime DATETIME DEFAULT GETUTCDATE(),
        EndTime DATETIME NULL,
        Duration INT NULL, -- Duration in seconds
        Success BIT DEFAULT 0,
        ErrorMessage NVARCHAR(MAX) NULL,
        InstanceId NVARCHAR(50) NOT NULL,
        Details NVARCHAR(MAX) NULL
    );
    CREATE INDEX idx_operation_time ON OperationMetadata(StartTime DESC);
    CREATE INDEX idx_operation_status ON OperationMetadata(Status);
    PRINT 'Table OperationMetadata created.';
END
GO

-- VHDX operations tracking table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'VhdxOperations')
BEGIN
    CREATE TABLE VhdxOperations (
        OperationId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        VhdxPath NVARCHAR(MAX) NOT NULL,
        OperationType NVARCHAR(50) NOT NULL, -- Create, Expand, Delete, etc.
        Status NVARCHAR(20) DEFAULT 'Pending',
        StartTime DATETIME DEFAULT GETUTCDATE(),
        EndTime DATETIME NULL,
        SizeBytes BIGINT NULL,
        Success BIT DEFAULT 0,
        ErrorMessage NVARCHAR(MAX) NULL
    );
    CREATE INDEX idx_vhdx_time ON VhdxOperations(StartTime DESC);
    CREATE INDEX idx_vhdx_status ON VhdxOperations(Status);
    PRINT 'Table VhdxOperations created.';
END
GO

-- Service health and metrics table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ServiceMetrics')
BEGIN
    CREATE TABLE ServiceMetrics (
        MetricId BIGINT PRIMARY KEY IDENTITY(1,1),
        InstanceId NVARCHAR(50) NOT NULL,
        MetricType NVARCHAR(50) NOT NULL,
        MetricValue FLOAT NOT NULL,
        Timestamp DATETIME DEFAULT GETUTCDATE(),
        Details NVARCHAR(MAX) NULL
    );
    CREATE INDEX idx_metrics_time ON ServiceMetrics(Timestamp DESC);
    CREATE INDEX idx_metrics_instance ON ServiceMetrics(InstanceId);
    PRINT 'Table ServiceMetrics created.';
END
GO

-- Backup history table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BackupHistory')
BEGIN
    CREATE TABLE BackupHistory (
        BackupId BIGINT PRIMARY KEY IDENTITY(1,1),
        DatabaseName NVARCHAR(128) NOT NULL,
        BackupType NVARCHAR(10), -- FULL, DIFF, LOG
        BackupPath NVARCHAR(MAX) NOT NULL,
        BackupSize BIGINT NOT NULL, -- Size in bytes
        StartTime DATETIME NOT NULL,
        EndTime DATETIME NOT NULL,
        Duration INT NOT NULL, -- Duration in seconds
        Success BIT DEFAULT 1,
        ErrorMessage NVARCHAR(MAX) NULL
    );
    CREATE INDEX idx_backup_time ON BackupHistory(StartTime DESC);
    CREATE INDEX idx_backup_database ON BackupHistory(DatabaseName);
    PRINT 'Table BackupHistory created.';
END
GO

-- ============================================================================
-- Create Stored Procedures for Common Operations
-- ============================================================================

-- Log operation metadata
CREATE OR ALTER PROCEDURE sp_LogOperation
    @OperationId UNIQUEIDENTIFIER,
    @OperationType NVARCHAR(50),
    @Status NVARCHAR(20),
    @InstanceId NVARCHAR(50),
    @Details NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO OperationMetadata (OperationId, OperationType, Status, InstanceId, Details)
    VALUES (@OperationId, @OperationType, @Status, @InstanceId, @Details);
END
GO

-- Log VHDX operation
CREATE OR ALTER PROCEDURE sp_LogVhdxOperation
    @OperationId UNIQUEIDENTIFIER,
    @VhdxPath NVARCHAR(MAX),
    @OperationType NVARCHAR(50),
    @Status NVARCHAR(20),
    @SizeBytes BIGINT = NULL,
    @ErrorMessage NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO VhdxOperations (OperationId, VhdxPath, OperationType, Status, SizeBytes, ErrorMessage)
    VALUES (@OperationId, @VhdxPath, @OperationType, @Status, @SizeBytes, @ErrorMessage);
END
GO

-- Log service metrics
CREATE OR ALTER PROCEDURE sp_LogMetric
    @InstanceId NVARCHAR(50),
    @MetricType NVARCHAR(50),
    @MetricValue FLOAT,
    @Details NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO ServiceMetrics (InstanceId, MetricType, MetricValue, Details)
    VALUES (@InstanceId, @MetricType, @MetricValue, @Details);
END
GO

-- ============================================================================
-- Set Database Properties for Production
-- ============================================================================

-- Enable auto-grow for logs
ALTER DATABASE FlashDB MODIFY FILE (
    NAME = FlashDB_Log,
    MAXSIZE = UNLIMITED,
    FILEGROWTH = 25MB
);
GO

-- Enable auto-grow for data
ALTER DATABASE FlashDB MODIFY FILE (
    NAME = FlashDB_Data,
    MAXSIZE = UNLIMITED,
    FILEGROWTH = 50MB
);
GO

-- ============================================================================
-- Create Maintenance Jobs (SQL Agent)
-- ============================================================================

-- Enable SQL Server Agent
EXEC xp_instance_regwrite N'HKEY_LOCAL_MACHINE',
    N'Software\Microsoft\MSSQLServer\MSSQLServer',
    N'AutoStart', REG_DWORD, 1;
GO

-- Create job for index maintenance (daily at 2 AM UTC)
IF NOT EXISTS (SELECT * FROM msdb.dbo.sysjobs WHERE name = 'FlashDB_Maintenance')
BEGIN
    EXEC msdb.dbo.sp_add_job
        @job_name = N'FlashDB_Maintenance',
        @enabled = 1,
        @description = N'Daily maintenance job for FlashDB';

    EXEC msdb.dbo.sp_add_jobstep
        @job_name = N'FlashDB_Maintenance',
        @step_name = N'Integrity Check',
        @subsystem = N'TSQL',
        @database_name = N'FlashDB',
        @command = N'DBCC CHECKDB (FlashDB, REPAIR_REBUILD);';

    EXEC msdb.dbo.sp_add_jobstep
        @job_name = N'FlashDB_Maintenance',
        @step_name = N'Index Maintenance',
        @subsystem = N'TSQL',
        @database_name = N'FlashDB',
        @command = N'ALTER INDEX ALL ON OperationMetadata REBUILD;
                     ALTER INDEX ALL ON VhdxOperations REBUILD;
                     ALTER INDEX ALL ON ServiceMetrics REBUILD;';

    EXEC msdb.dbo.sp_add_schedule
        @schedule_name = N'Daily_2AM_UTC',
        @freq_type = 4,  -- Daily
        @freq_interval = 1,
        @active_start_time = '020000';  -- 2 AM UTC

    EXEC msdb.dbo.sp_attach_schedule
        @job_name = N'FlashDB_Maintenance',
        @schedule_name = N'Daily_2AM_UTC';

    PRINT 'FlashDB_Maintenance job created.';
END
GO

-- ============================================================================
-- Create Database User for Application
-- ============================================================================

-- Create application user
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'flashdb_app')
BEGIN
    CREATE LOGIN flashdb_app WITH PASSWORD = 'FlashDB@App123!Secure';
    PRINT 'Login flashdb_app created.';
END

-- Create database user
USE FlashDB;
IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = 'flashdb_app')
BEGIN
    CREATE USER flashdb_app FOR LOGIN flashdb_app;
    PRINT 'User flashdb_app created in FlashDB.';
END

-- Grant permissions
ALTER ROLE db_owner ADD MEMBER flashdb_app;
GO

-- ============================================================================
-- Initialization Complete
-- ============================================================================

PRINT 'FlashDB production database initialization completed successfully.';
PRINT 'Ready for application deployment.';
GO
