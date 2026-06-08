-- FlashDB Test Database Initialization
-- Creates TestDB with sample data for testing

USE master;
GO

PRINT 'Starting TestDB initialization...';
GO

-- Create test database
IF EXISTS (SELECT 1 FROM sys.databases WHERE name = 'TestDB')
BEGIN
    PRINT 'Dropping existing TestDB...';
    ALTER DATABASE TestDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE TestDB;
    PRINT 'TestDB dropped successfully.';
END
GO

DECLARE @DataPath NVARCHAR(4000) = CONVERT(NVARCHAR(4000), SERVERPROPERTY('InstanceDefaultDataPath'));
DECLARE @LogPath NVARCHAR(4000) = CONVERT(NVARCHAR(4000), SERVERPROPERTY('InstanceDefaultLogPath'));

IF @DataPath IS NULL OR @DataPath = N''
BEGIN
    SELECT @DataPath = LEFT(physical_name, LEN(physical_name) - CHARINDEX(
        CASE WHEN CHARINDEX(N'\', REVERSE(physical_name)) > 0 THEN N'\' ELSE N'/' END,
        REVERSE(physical_name)
    ) + 1)
    FROM sys.master_files
    WHERE database_id = DB_ID(N'master') AND file_id = 1;
END

IF @LogPath IS NULL OR @LogPath = N''
BEGIN
    SET @LogPath = @DataPath;
END

IF RIGHT(@DataPath, 1) NOT IN (N'\', N'/')
BEGIN
    SET @DataPath = @DataPath + CASE WHEN CHARINDEX(N'/', @DataPath) > 0 THEN N'/' ELSE N'\' END;
END

IF RIGHT(@LogPath, 1) NOT IN (N'\', N'/')
BEGIN
    SET @LogPath = @LogPath + CASE WHEN CHARINDEX(N'/', @LogPath) > 0 THEN N'/' ELSE N'\' END;
END

DECLARE @FileSuffix NVARCHAR(32) = REPLACE(CONVERT(NVARCHAR(36), NEWID()), N'-', N'');
DECLARE @CreateDatabaseSql NVARCHAR(MAX) = N'
CREATE DATABASE TestDB
ON PRIMARY (
    NAME = N''TestDB'',
    FILENAME = N''' + REPLACE(@DataPath + N'FlashDB_TestDB_' + @FileSuffix + N'.mdf', N'''', N'''''') + N'''
)
LOG ON (
    NAME = N''TestDB_log'',
    FILENAME = N''' + REPLACE(@LogPath + N'FlashDB_TestDB_' + @FileSuffix + N'_log.ldf', N'''', N'''''') + N'''
);';

EXEC sys.sp_executesql @CreateDatabaseSql;
GO

USE TestDB;
GO

SET QUOTED_IDENTIFIER ON;
GO

-- ============================================================================
-- State Management Tables (Phase 5b.1)
-- ============================================================================

-- State key-value store with TTL support
CREATE TABLE dbo.flashdb_state (
    [key] NVARCHAR(255) PRIMARY KEY NOT NULL,
    [value] NVARCHAR(MAX) NOT NULL,
    [expires_at] DATETIME NULL,
    [created_at] DATETIME DEFAULT GETUTCDATE(),
    [updated_at] DATETIME DEFAULT GETUTCDATE()
);
CREATE INDEX idx_flashdb_state_expires ON dbo.flashdb_state(expires_at);
GO

-- Distributed locks for coordinating multiple instances
CREATE TABLE dbo.flashdb_locks (
    [resource_id] NVARCHAR(255) PRIMARY KEY NOT NULL,
    [owner_id] NVARCHAR(255) NOT NULL,
    [acquired_at] DATETIME DEFAULT GETUTCDATE(),
    [expires_at] DATETIME NOT NULL
);
CREATE INDEX idx_flashdb_locks_owner ON dbo.flashdb_locks(owner_id);
CREATE INDEX idx_flashdb_locks_expires ON dbo.flashdb_locks(expires_at);
GO

-- State change operations log for audit trail
CREATE TABLE dbo.flashdb_operations (
    [id] BIGINT PRIMARY KEY IDENTITY(1,1),
    [operation_type] NVARCHAR(50) NOT NULL,
    [resource_id] NVARCHAR(255) NOT NULL,
    [timestamp] DATETIME DEFAULT GETUTCDATE(),
    [details] NVARCHAR(MAX) NULL
);
CREATE INDEX idx_flashdb_operations_type ON dbo.flashdb_operations(operation_type);
CREATE INDEX idx_flashdb_operations_time ON dbo.flashdb_operations(timestamp DESC);
GO

-- ============================================================================
-- Multi-Instance Cluster Table (Phase 5b.4)
-- ============================================================================

-- Instance registry for multi-instance deployment
CREATE TABLE dbo.flashdb_instances (
    [instance_id] NVARCHAR(36) PRIMARY KEY NOT NULL,
    [role] NVARCHAR(20) NOT NULL DEFAULT 'primary',
    [status] NVARCHAR(20) NOT NULL DEFAULT 'active',
    [last_heartbeat] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [host] NVARCHAR(255) NOT NULL,
    [port] INT NOT NULL,
    [version] NVARCHAR(50) NOT NULL DEFAULT '1.0.0',
    [created_at] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [updated_at] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE()
);
CREATE INDEX idx_flashdb_instances_status ON dbo.flashdb_instances([status]);
CREATE INDEX idx_flashdb_instances_heartbeat ON dbo.flashdb_instances([last_heartbeat] DESC);
CREATE INDEX idx_flashdb_instances_role ON dbo.flashdb_instances([role]);
CREATE INDEX idx_flashdb_instances_status_heartbeat ON dbo.flashdb_instances([status], [last_heartbeat] DESC);
GO

-- ============================================================================
-- Task Queue Tables (Phase 5b.3)
-- ============================================================================

-- Active task queue table
CREATE TABLE dbo.flashdb_queue (
    [id] NVARCHAR(36) PRIMARY KEY NOT NULL,
    [type] NVARCHAR(50) NOT NULL,
    [status] NVARCHAR(50) NOT NULL DEFAULT 'pending',
    [payload] NVARCHAR(MAX) NOT NULL,
    [retry_count] INT NOT NULL DEFAULT 0,
    [max_retries] INT NOT NULL DEFAULT 3,
    [created_at] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE(),
    [started_at] DATETIME2(7) NULL,
    [completed_at] DATETIME2(7) NULL,
    [error] NVARCHAR(MAX) NULL,
    [result] NVARCHAR(MAX) NULL,
    [instance_id] NVARCHAR(36) NULL
);
CREATE INDEX idx_flashdb_queue_status ON dbo.flashdb_queue([status]);
CREATE INDEX idx_flashdb_queue_created_at ON dbo.flashdb_queue([created_at] DESC);
CREATE INDEX idx_flashdb_queue_status_created ON dbo.flashdb_queue([status], [created_at] DESC);
CREATE INDEX idx_flashdb_queue_type ON dbo.flashdb_queue([type]);
CREATE INDEX idx_flashdb_queue_instance ON dbo.flashdb_queue([instance_id]) WHERE [instance_id] IS NOT NULL;
GO

-- Archive table for completed/failed tasks
CREATE TABLE dbo.flashdb_queue_archive (
    [id] NVARCHAR(36) PRIMARY KEY NOT NULL,
    [type] NVARCHAR(50) NOT NULL,
    [status] NVARCHAR(50) NOT NULL,
    [payload] NVARCHAR(MAX) NOT NULL,
    [retry_count] INT NOT NULL,
    [created_at] DATETIME2(7) NOT NULL,
    [started_at] DATETIME2(7) NULL,
    [completed_at] DATETIME2(7) NULL,
    [error] NVARCHAR(MAX) NULL,
    [result] NVARCHAR(MAX) NULL,
    [archived_at] DATETIME2(7) NOT NULL DEFAULT GETUTCDATE()
);
CREATE INDEX idx_flashdb_queue_archive_status ON dbo.flashdb_queue_archive([status]);
CREATE INDEX idx_flashdb_queue_archive_created ON dbo.flashdb_queue_archive([created_at] DESC);
CREATE INDEX idx_flashdb_queue_archive_archived ON dbo.flashdb_queue_archive([archived_at] DESC);
CREATE INDEX idx_flashdb_queue_archive_type ON dbo.flashdb_queue_archive([type]);
GO

-- Create Customers table
CREATE TABLE dbo.Customers (
    CustomerID INT PRIMARY KEY IDENTITY(1,1),
    CustomerName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(100),
    City NVARCHAR(50),
    CreatedDate DATETIME DEFAULT GETDATE()
);

-- Create Orders table
CREATE TABLE dbo.Orders (
    OrderID INT PRIMARY KEY IDENTITY(1,1),
    CustomerID INT NOT NULL,
    OrderDate DATETIME DEFAULT GETDATE(),
    TotalAmount DECIMAL(10, 2),
    Status NVARCHAR(20),
    FOREIGN KEY (CustomerID) REFERENCES dbo.Customers(CustomerID)
);

-- Create OrderItems table
CREATE TABLE dbo.OrderItems (
    OrderItemID INT PRIMARY KEY IDENTITY(1,1),
    OrderID INT NOT NULL,
    ProductName NVARCHAR(100),
    Quantity INT,
    UnitPrice DECIMAL(10, 2),
    FOREIGN KEY (OrderID) REFERENCES dbo.Orders(OrderID)
);

-- Create Products table
CREATE TABLE dbo.Products (
    ProductID INT PRIMARY KEY IDENTITY(1,1),
    ProductName NVARCHAR(100) NOT NULL,
    Category NVARCHAR(50),
    Price DECIMAL(10, 2),
    StockQuantity INT
);
GO

-- Insert sample customers
INSERT INTO dbo.Customers (CustomerName, Email, City) VALUES
('John Smith', 'john.smith@example.com', 'New York'),
('Jane Doe', 'jane.doe@example.com', 'Los Angeles'),
('Bob Johnson', 'bob.johnson@example.com', 'Chicago'),
('Alice Williams', 'alice.williams@example.com', 'Houston'),
('Charlie Brown', 'charlie.brown@example.com', 'Phoenix');

-- Insert sample products
INSERT INTO dbo.Products (ProductName, Category, Price, StockQuantity) VALUES
('Laptop', 'Electronics', 999.99, 50),
('Mouse', 'Electronics', 29.99, 200),
('Keyboard', 'Electronics', 79.99, 150),
('Monitor', 'Electronics', 399.99, 75),
('Desk Chair', 'Furniture', 299.99, 40),
('Desk Lamp', 'Furniture', 49.99, 100),
('USB Cable', 'Accessories', 9.99, 500),
('Headphones', 'Electronics', 149.99, 80);

-- Insert sample orders
INSERT INTO dbo.Orders (CustomerID, OrderDate, TotalAmount, Status) VALUES
(1, '2026-06-01 10:30:00', 1299.97, 'Completed'),
(2, '2026-06-02 14:15:00', 449.98, 'Completed'),
(3, '2026-06-03 09:00:00', 749.97, 'Pending'),
(1, '2026-06-04 16:45:00', 189.97, 'Shipped'),
(4, '2026-06-05 11:30:00', 2049.95, 'Pending');

-- Insert sample order items
INSERT INTO dbo.OrderItems (OrderID, ProductName, Quantity, UnitPrice) VALUES
(1, 'Laptop', 1, 999.99),
(1, 'Mouse', 1, 29.99),
(2, 'Keyboard', 1, 79.99),
(2, 'Mouse', 1, 29.99),
(3, 'Monitor', 1, 399.99),
(3, 'Desk Chair', 1, 299.99),
(4, 'USB Cable', 2, 9.99),
(5, 'Laptop', 2, 999.99),
(5, 'Headphones', 1, 149.99);
GO

-- Create a summary view
CREATE VIEW vw_OrderSummary AS
SELECT
    c.CustomerID,
    c.CustomerName,
    COUNT(o.OrderID) AS TotalOrders,
    SUM(o.TotalAmount) AS TotalSpent,
    MAX(o.OrderDate) AS LastOrderDate
FROM dbo.Customers c
LEFT JOIN dbo.Orders o ON c.CustomerID = o.CustomerID
GROUP BY c.CustomerID, c.CustomerName;
GO

-- Print confirmation (while in TestDB context)
DECLARE @TotalCustomers INT = (SELECT COUNT(*) FROM dbo.Customers);
DECLARE @TotalOrders INT = (SELECT COUNT(*) FROM dbo.Orders);
DECLARE @TotalOrderItems INT = (SELECT COUNT(*) FROM dbo.OrderItems);
DECLARE @TotalProducts INT = (SELECT COUNT(*) FROM dbo.Products);
DECLARE @QueueTables INT = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('flashdb_queue', 'flashdb_queue_archive') AND TABLE_SCHEMA = 'dbo');
DECLARE @InstanceTable INT = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'flashdb_instances' AND TABLE_SCHEMA = 'dbo');

PRINT 'Test database created successfully!';
PRINT 'Tables: Customers, Orders, OrderItems, Products, State Management, Task Queue, Multi-Instance Cluster';
PRINT 'Total Customers: ' + CAST(@TotalCustomers AS NVARCHAR(10));
PRINT 'Total Orders: ' + CAST(@TotalOrders AS NVARCHAR(10));
PRINT 'Total Order Items: ' + CAST(@TotalOrderItems AS NVARCHAR(10));
PRINT 'Total Products: ' + CAST(@TotalProducts AS NVARCHAR(10));
PRINT 'Queue tables initialized: ' + CAST(@QueueTables AS NVARCHAR(10));
PRINT 'Instance registry initialized: ' + CAST(@InstanceTable AS NVARCHAR(10));
GO
