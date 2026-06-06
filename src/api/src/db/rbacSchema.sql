-- RBAC Schema for FlashDB
-- Tables for user management, roles, permissions, and access control

-- Create flashdb_users table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'flashdb_users')
BEGIN
  CREATE TABLE dbo.flashdb_users (
    user_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    username NVARCHAR(255) NOT NULL UNIQUE,
    email NVARCHAR(255) NOT NULL UNIQUE,
    password_hash NVARCHAR(MAX) NOT NULL,
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    is_active BIT DEFAULT 1,
    last_login DATETIMEOFFSET NULL,
    failed_login_attempts INT DEFAULT 0,
    locked_until DATETIMEOFFSET NULL
  );
  CREATE NONCLUSTERED INDEX idx_username ON dbo.flashdb_users(username);
  CREATE NONCLUSTERED INDEX idx_email ON dbo.flashdb_users(email);
  CREATE NONCLUSTERED INDEX idx_active ON dbo.flashdb_users(is_active);
END
GO

-- Create flashdb_roles table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'flashdb_roles')
BEGIN
  CREATE TABLE dbo.flashdb_roles (
    role_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    role_name NVARCHAR(100) NOT NULL UNIQUE,
    description NVARCHAR(MAX),
    is_system BIT DEFAULT 0,
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
  );
  CREATE NONCLUSTERED INDEX idx_role_name ON dbo.flashdb_roles(role_name);
  CREATE NONCLUSTERED INDEX idx_is_system ON dbo.flashdb_roles(is_system);
END
GO

-- Create flashdb_permissions table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'flashdb_permissions')
BEGIN
  CREATE TABLE dbo.flashdb_permissions (
    permission_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    permission_name NVARCHAR(100) NOT NULL UNIQUE,
    description NVARCHAR(MAX),
    category NVARCHAR(50),
    created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
  );
  CREATE NONCLUSTERED INDEX idx_permission_name ON dbo.flashdb_permissions(permission_name);
  CREATE NONCLUSTERED INDEX idx_category ON dbo.flashdb_permissions(category);
END
GO

-- Create flashdb_user_roles table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'flashdb_user_roles')
BEGIN
  CREATE TABLE dbo.flashdb_user_roles (
    user_id UNIQUEIDENTIFIER NOT NULL,
    role_id UNIQUEIDENTIFIER NOT NULL,
    assigned_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES dbo.flashdb_users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES dbo.flashdb_roles(role_id) ON DELETE CASCADE
  );
  CREATE NONCLUSTERED INDEX idx_user_id ON dbo.flashdb_user_roles(user_id);
  CREATE NONCLUSTERED INDEX idx_role_id ON dbo.flashdb_user_roles(role_id);
END
GO

-- Create flashdb_role_permissions table
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'flashdb_role_permissions')
BEGIN
  CREATE TABLE dbo.flashdb_role_permissions (
    role_id UNIQUEIDENTIFIER NOT NULL,
    permission_id UNIQUEIDENTIFIER NOT NULL,
    assigned_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    PRIMARY KEY (role_id, permission_id),
    FOREIGN KEY (role_id) REFERENCES dbo.flashdb_roles(role_id) ON DELETE CASCADE,
    FOREIGN KEY (permission_id) REFERENCES dbo.flashdb_permissions(permission_id) ON DELETE CASCADE
  );
  CREATE NONCLUSTERED INDEX idx_role_id ON dbo.flashdb_role_permissions(role_id);
  CREATE NONCLUSTERED INDEX idx_permission_id ON dbo.flashdb_role_permissions(permission_id);
END
GO

-- Create flashdb_tokens table for token revocation/tracking
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'flashdb_tokens')
BEGIN
  CREATE TABLE dbo.flashdb_tokens (
    token_id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id UNIQUEIDENTIFIER NOT NULL,
    token_hash NVARCHAR(512) NOT NULL UNIQUE,
    token_type NVARCHAR(50) DEFAULT 'access',
    issued_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
    expires_at DATETIMEOFFSET NOT NULL,
    revoked_at DATETIMEOFFSET NULL,
    ip_address NVARCHAR(45),
    user_agent NVARCHAR(MAX),
    FOREIGN KEY (user_id) REFERENCES dbo.flashdb_users(user_id) ON DELETE CASCADE
  );
  CREATE NONCLUSTERED INDEX idx_user_id ON dbo.flashdb_tokens(user_id);
  CREATE NONCLUSTERED INDEX idx_expires_at ON dbo.flashdb_tokens(expires_at);
  CREATE NONCLUSTERED INDEX idx_revoked_at ON dbo.flashdb_tokens(revoked_at);
END
GO

-- Insert default roles
IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_roles WHERE role_name = 'admin')
BEGIN
  INSERT INTO dbo.flashdb_roles (role_name, description, is_system)
  VALUES ('admin', 'Administrator - Full system access', 1);
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_roles WHERE role_name = 'operator')
BEGIN
  INSERT INTO dbo.flashdb_roles (role_name, description, is_system)
  VALUES ('operator', 'Operator - Can create and manage clones and checkpoints', 1);
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_roles WHERE role_name = 'viewer')
BEGIN
  INSERT INTO dbo.flashdb_roles (role_name, description, is_system)
  VALUES ('viewer', 'Viewer - Read-only access to resources', 1);
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_roles WHERE role_name = 'system')
BEGIN
  INSERT INTO dbo.flashdb_roles (role_name, description, is_system)
  VALUES ('system', 'System - Internal system operations', 1);
END
GO

-- Insert default permissions
IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'golden_images:create')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('golden_images:create', 'Create golden images', 'golden_images');
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'golden_images:read')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('golden_images:read', 'Read golden images', 'golden_images');
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'golden_images:update')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('golden_images:update', 'Update golden images', 'golden_images');
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'golden_images:delete')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('golden_images:delete', 'Delete golden images', 'golden_images');
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'clones:create')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('clones:create', 'Create clones', 'clones');
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'clones:read')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('clones:read', 'Read clones', 'clones');
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'clones:update')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('clones:update', 'Update clones', 'clones');
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'clones:delete')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('clones:delete', 'Delete clones', 'clones');
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'checkpoints:create')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('checkpoints:create', 'Create checkpoints', 'checkpoints');
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'checkpoints:read')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('checkpoints:read', 'Read checkpoints', 'checkpoints');
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'checkpoints:delete')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('checkpoints:delete', 'Delete checkpoints', 'checkpoints');
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'rbac:admin')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('rbac:admin', 'Manage users, roles, and permissions', 'rbac');
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'auth:login')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('auth:login', 'Login to system', 'auth');
END

IF NOT EXISTS (SELECT 1 FROM dbo.flashdb_permissions WHERE permission_name = 'auth:refresh')
BEGIN
  INSERT INTO dbo.flashdb_permissions (permission_name, description, category)
  VALUES ('auth:refresh', 'Refresh authentication token', 'auth');
END
GO

-- Assign permissions to admin role
DECLARE @admin_role_id UNIQUEIDENTIFIER, @perm_id UNIQUEIDENTIFIER;
SELECT @admin_role_id = role_id FROM dbo.flashdb_roles WHERE role_name = 'admin';

-- Admin gets all permissions
INSERT INTO dbo.flashdb_role_permissions (role_id, permission_id)
SELECT @admin_role_id, permission_id FROM dbo.flashdb_permissions
WHERE NOT EXISTS (
  SELECT 1 FROM dbo.flashdb_role_permissions
  WHERE role_id = @admin_role_id AND permission_id = dbo.flashdb_permissions.permission_id
)
GO

-- Assign permissions to operator role
DECLARE @operator_role_id UNIQUEIDENTIFIER;
SELECT @operator_role_id = role_id FROM dbo.flashdb_roles WHERE role_name = 'operator';

INSERT INTO dbo.flashdb_role_permissions (role_id, permission_id)
SELECT @operator_role_id, permission_id FROM dbo.flashdb_permissions
WHERE permission_name IN ('clones:create', 'clones:read', 'clones:update', 'clones:delete',
                          'checkpoints:create', 'checkpoints:read', 'checkpoints:delete',
                          'golden_images:read', 'auth:login', 'auth:refresh')
AND NOT EXISTS (
  SELECT 1 FROM dbo.flashdb_role_permissions
  WHERE role_id = @operator_role_id AND permission_id = dbo.flashdb_permissions.permission_id
)
GO

-- Assign permissions to viewer role
DECLARE @viewer_role_id UNIQUEIDENTIFIER;
SELECT @viewer_role_id = role_id FROM dbo.flashdb_roles WHERE role_name = 'viewer';

INSERT INTO dbo.flashdb_role_permissions (role_id, permission_id)
SELECT @viewer_role_id, permission_id FROM dbo.flashdb_permissions
WHERE permission_name IN ('clones:read', 'checkpoints:read', 'golden_images:read', 'auth:login', 'auth:refresh')
AND NOT EXISTS (
  SELECT 1 FROM dbo.flashdb_role_permissions
  WHERE role_id = @viewer_role_id AND permission_id = dbo.flashdb_permissions.permission_id
)
GO

-- Assign permissions to system role
DECLARE @system_role_id UNIQUEIDENTIFIER;
SELECT @system_role_id = role_id FROM dbo.flashdb_roles WHERE role_name = 'system';

INSERT INTO dbo.flashdb_role_permissions (role_id, permission_id)
SELECT @system_role_id, permission_id FROM dbo.flashdb_permissions
WHERE permission_name IN ('auth:login', 'auth:refresh')
AND NOT EXISTS (
  SELECT 1 FROM dbo.flashdb_role_permissions
  WHERE role_id = @system_role_id AND permission_id = dbo.flashdb_permissions.permission_id
)
GO
