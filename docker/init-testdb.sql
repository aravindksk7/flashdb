-- FlashDB Test Database Initialization
-- Creates TestDB with sample data for testing

USE master;
GO

-- Create test database
IF EXISTS (SELECT 1 FROM sys.databases WHERE name = 'TestDB')
BEGIN
    ALTER DATABASE TestDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE TestDB;
END
GO

CREATE DATABASE TestDB;
GO

USE TestDB;
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

-- Print confirmation
PRINT 'Test database created successfully!';
PRINT 'Tables: Customers, Orders, OrderItems, Products';
PRINT 'Total Customers: ' + CAST((SELECT COUNT(*) FROM dbo.Customers) AS NVARCHAR(10));
PRINT 'Total Orders: ' + CAST((SELECT COUNT(*) FROM dbo.Orders) AS NVARCHAR(10));
PRINT 'Total Order Items: ' + CAST((SELECT COUNT(*) FROM dbo.OrderItems) AS NVARCHAR(10));
PRINT 'Total Products: ' + CAST((SELECT COUNT(*) FROM dbo.Products) AS NVARCHAR(10));
GO
