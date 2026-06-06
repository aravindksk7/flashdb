# RBAC Test Data & API Contracts

## API Contracts

### 1. Login Endpoint

**Endpoint**: `POST /login`

**Request**:
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "admin-user-id",
    "username": "admin",
    "email": "admin@flashdb.local",
    "roles": ["admin"],
    "permissions": [
      "users:create",
      "users:read",
      "users:update",
      "users:delete",
      "roles:manage",
      "system:configure"
    ]
  },
  "expiresIn": "24h"
}
```

**Response (401 Unauthorized)**:
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

### 2. Logout Endpoint

**Endpoint**: `POST /logout`

**Request**:
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Successfully logged out"
}
```

**Response (401 Unauthorized)**:
```json
{
  "success": false,
  "message": "Authentication required"
}
```

### 3. Protected Endpoints

**Example**: `GET /api/clones`

**Request**:
```
Authorization: Bearer <token>
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": [...]
}
```

**Response (401 Unauthorized)**:
```json
{
  "success": false,
  "message": "Authentication required. Provide API key or Bearer token"
}
```

**Response (403 Forbidden)**:
```json
{
  "success": false,
  "message": "Insufficient permissions"
}
```

### 4. Admin Endpoints

**Example**: `GET /api/admin/users`

**Request**:
```
Authorization: Bearer <admin-token>
```

**Response (200 OK)**:
```json
{
  "success": true,
  "users": [
    {
      "id": "user-1",
      "username": "admin",
      "email": "admin@flashdb.local",
      "roles": ["admin"],
      "isActive": true,
      "createdAt": "2026-01-01T00:00:00Z"
    },
    {
      "id": "user-2",
      "username": "operator",
      "email": "operator@flashdb.local",
      "roles": ["operator"],
      "isActive": true,
      "createdAt": "2026-01-02T00:00:00Z"
    }
  ]
}
```

**Response (403 Forbidden)** (non-admin token):
```json
{
  "success": false,
  "message": "Insufficient permissions"
}
```

### 5. Role Management Endpoint

**Example**: `POST /api/admin/users/{userId}/roles`

**Request**:
```json
{
  "roles": ["operator", "viewer"]
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "user": {
    "id": "user-id",
    "username": "john",
    "roles": ["operator", "viewer"],
    "permissions": [...]
  }
}
```

## Test Data

### Users

```javascript
{
  users: [
    {
      id: 'admin-001',
      username: 'admin',
      email: 'admin@flashdb.local',
      password: '<hashed>', // bcryptjs hash of "admin123"
      roles: ['admin'],
      isActive: true,
      createdAt: new Date()
    },
    {
      id: 'operator-001',
      username: 'operator',
      email: 'operator@flashdb.local',
      password: '<hashed>', // bcryptjs hash of "operator123"
      roles: ['operator'],
      isActive: true,
      createdAt: new Date()
    },
    {
      id: 'viewer-001',
      username: 'viewer',
      email: 'viewer@flashdb.local',
      password: '<hashed>', // bcryptjs hash of "viewer123"
      roles: ['viewer'],
      isActive: true,
      createdAt: new Date()
    },
    {
      id: 'multi-001',
      username: 'multi_role',
      email: 'multi@flashdb.local',
      password: '<hashed>',
      roles: ['operator', 'viewer'],
      isActive: true,
      createdAt: new Date()
    },
    {
      id: 'inactive-001',
      username: 'inactive_user',
      email: 'inactive@flashdb.local',
      password: '<hashed>',
      roles: ['viewer'],
      isActive: false,
      createdAt: new Date()
    }
  ]
}
```

### Roles

```javascript
{
  roles: [
    {
      id: 'role-admin',
      name: 'admin',
      description: 'Administrator with full system access',
      permissions: [
        'users:create',
        'users:read',
        'users:update',
        'users:delete',
        'roles:read',
        'roles:create',
        'roles:update',
        'roles:delete',
        'permissions:manage',
        'system:configure',
        'system:logs',
        'clones:read',
        'clones:create',
        'clones:update',
        'clones:delete',
        'checkpoints:read',
        'checkpoints:create',
        'checkpoints:delete'
      ]
    },
    {
      id: 'role-operator',
      name: 'operator',
      description: 'Operator with creation and management permissions',
      permissions: [
        'users:read',
        'roles:read',
        'clones:read',
        'clones:create',
        'clones:update',
        'checkpoints:read',
        'checkpoints:create',
        'checkpoints:delete',
        'metrics:read'
      ]
    },
    {
      id: 'role-viewer',
      name: 'viewer',
      description: 'Read-only access to resources',
      permissions: [
        'users:read',
        'clones:read',
        'checkpoints:read',
        'metrics:read'
      ]
    }
  ]
}
```

### Permissions

```javascript
{
  permissions: [
    // User Management
    { id: 'perm-users-create', name: 'users:create', description: 'Create new users' },
    { id: 'perm-users-read', name: 'users:read', description: 'Read user information' },
    { id: 'perm-users-update', name: 'users:update', description: 'Update user information' },
    { id: 'perm-users-delete', name: 'users:delete', description: 'Delete users' },
    
    // Role Management
    { id: 'perm-roles-read', name: 'roles:read', description: 'Read role information' },
    { id: 'perm-roles-create', name: 'roles:create', description: 'Create new roles' },
    { id: 'perm-roles-update', name: 'roles:update', description: 'Update role information' },
    { id: 'perm-roles-delete', name: 'roles:delete', description: 'Delete roles' },
    
    // Permission Management
    { id: 'perm-perms-manage', name: 'permissions:manage', description: 'Manage permissions' },
    
    // System Configuration
    { id: 'perm-sys-config', name: 'system:configure', description: 'Configure system settings' },
    { id: 'perm-sys-logs', name: 'system:logs', description: 'View system logs' },
    
    // Clone Management
    { id: 'perm-clones-read', name: 'clones:read', description: 'Read clone information' },
    { id: 'perm-clones-create', name: 'clones:create', description: 'Create new clones' },
    { id: 'perm-clones-update', name: 'clones:update', description: 'Update clones' },
    { id: 'perm-clones-delete', name: 'clones:delete', description: 'Delete clones' },
    
    // Checkpoint Management
    { id: 'perm-chk-read', name: 'checkpoints:read', description: 'Read checkpoint information' },
    { id: 'perm-chk-create', name: 'checkpoints:create', description: 'Create checkpoints' },
    { id: 'perm-chk-delete', name: 'checkpoints:delete', description: 'Delete checkpoints' },
    
    // Metrics
    { id: 'perm-metrics-read', name: 'metrics:read', description: 'Read metrics' }
  ]
}
```

### API Keys

```javascript
{
  apiKeys: [
    {
      id: 'key-001',
      key: 'fk_test_key_123456789abcdefgh',
      name: 'Test Integration',
      userId: 'admin-001',
      roles: ['admin'],
      isActive: true,
      createdAt: new Date(),
      lastUsed: new Date()
    },
    {
      id: 'key-002',
      key: 'fk_prod_key_987654321zyxwvuts',
      name: 'Production Service',
      userId: 'system',
      roles: ['operator'],
      isActive: true,
      createdAt: new Date(),
      lastUsed: new Date()
    }
  ]
}
```

## Test Scenarios

### Scenario 1: Admin User Login & Access

**Setup**:
```javascript
POST /login
{
  "username": "admin",
  "password": "admin123"
}
```

**Expected**: 200 OK, token returned

**Then**:
```javascript
GET /api/admin/users
Authorization: Bearer <token>
```

**Expected**: 200 OK, user list returned

### Scenario 2: Operator User Limited Access

**Setup**:
```javascript
POST /login
{
  "username": "operator",
  "password": "operator123"
}
```

**Expected**: 200 OK, token returned

**Then Try**:
```javascript
GET /api/admin/users
Authorization: Bearer <token>
```

**Expected**: 403 Forbidden

**But Allow**:
```javascript
POST /api/clones
Authorization: Bearer <token>
{
  "name": "test-clone",
  "sourceImageId": "img-123"
}
```

**Expected**: 200 OK, clone created

### Scenario 3: Multi-Role User

**Setup**:
```javascript
User: multi_role
Roles: [operator, viewer]
```

**When Accessing Operator Endpoint**:
```javascript
POST /api/clones/create
Authorization: Bearer <token>
```

**Expected**: 200 OK (has operator role)

**When Accessing Admin Endpoint**:
```javascript
GET /api/admin/users
Authorization: Bearer <token>
```

**Expected**: 403 Forbidden (doesn't have admin role)

### Scenario 4: Role Assignment

**Setup**: Admin user

**Action**:
```javascript
POST /api/admin/users/{userId}/roles
Authorization: Bearer <admin-token>
{
  "roles": ["viewer", "operator"]
}
```

**Expected**: 200 OK

**Then**: Old token still has old roles (until user logs back in)

### Scenario 5: Inactive User

**Setup**: Inactive user tries to login

**Action**:
```javascript
POST /login
{
  "username": "inactive_user",
  "password": "correct_password"
}
```

**Expected**: 401 Unauthorized or 403 Forbidden with message "User account is inactive"

### Scenario 6: Token Expiry

**Setup**: Valid token from login

**After Token Expiry**:
```javascript
GET /api/clones
Authorization: Bearer <expired-token>
```

**Expected**: 401 Unauthorized with message "Invalid or expired token"

### Scenario 7: SQL Injection Prevention

**Attempt**:
```javascript
POST /login
{
  "username": "admin' OR '1'='1",
  "password": "anything"
}
```

**Expected**: 401 Unauthorized (injection blocked)

### Scenario 8: CSRF Protection

**Attempt** (from browser):
```javascript
POST /api/clones
Content-Type: application/json
Origin: http://localhost:3000
{
  "name": "test"
}
// Missing X-CSRF-Token header
```

**Expected**: 403 Forbidden with message "CSRF token required"

**Then With Token**:
```javascript
POST /api/clones
Content-Type: application/json
Origin: http://localhost:3000
X-CSRF-Token: <valid-csrf-token>
{
  "name": "test"
}
```

**Expected**: 200 OK

## Success Criteria

### All Criteria Must Be Met

1. **Authentication**
   - [x] Login with valid credentials succeeds
   - [x] Login with invalid credentials fails (401)
   - [x] Tokens are valid and can be verified
   - [x] Token expiry is enforced

2. **Authorization**
   - [x] Admin users can access admin endpoints
   - [x] Non-admin users are denied (403)
   - [x] Role-based access control works
   - [x] Permission checking is enforced

3. **Security**
   - [x] Passwords are hashed with bcryptjs
   - [x] SQL injection is prevented
   - [x] CSRF tokens are required
   - [x] JWT signatures are validated
   - [x] Token tampering is detected

4. **Performance**
   - [x] Login < 500ms
   - [x] Auth check < 10ms
   - [x] No memory leaks

5. **Logging**
   - [x] Auth events are logged
   - [x] Security events are tracked
   - [x] Failed attempts are recorded

## Test Data Setup SQL

```sql
-- Users
INSERT INTO users (id, username, email, password, is_active, created_at)
VALUES 
  ('admin-001', 'admin', 'admin@flashdb.local', '$2b$10$...', true, NOW()),
  ('operator-001', 'operator', 'operator@flashdb.local', '$2b$10$...', true, NOW()),
  ('viewer-001', 'viewer', 'viewer@flashdb.local', '$2b$10$...', true, NOW()),
  ('multi-001', 'multi_role', 'multi@flashdb.local', '$2b$10$...', true, NOW()),
  ('inactive-001', 'inactive_user', 'inactive@flashdb.local', '$2b$10$...', false, NOW());

-- Roles
INSERT INTO roles (id, name, description)
VALUES 
  ('role-admin', 'admin', 'Administrator with full system access'),
  ('role-operator', 'operator', 'Operator with creation and management permissions'),
  ('role-viewer', 'viewer', 'Read-only access to resources');

-- User Roles
INSERT INTO user_roles (user_id, role_id)
VALUES 
  ('admin-001', 'role-admin'),
  ('operator-001', 'role-operator'),
  ('viewer-001', 'role-viewer'),
  ('multi-001', 'role-operator'),
  ('multi-001', 'role-viewer'),
  ('inactive-001', 'role-viewer');
```
