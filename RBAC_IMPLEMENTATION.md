# RBAC Implementation - Phase 5b.5

## Overview

This document describes the Role-Based Access Control (RBAC) implementation for FlashDB, featuring JWT authentication and PostgreSQL (SQL Server) role management.

## Architecture

### Components

1. **Authentication Service** (`src/api/src/services/authService.ts`)
   - JWT token generation and validation
   - Password hashing with bcrypt
   - User login/logout
   - Permission and role retrieval
   - Token revocation tracking

2. **Auth Middleware** (`src/api/src/middleware/authMiddleware.ts`)
   - JWT verification
   - Permission enforcement
   - Role-based authorization
   - User context attachment

3. **Database Schema** (`src/api/src/db/rbacSchema.sql`)
   - User management tables
   - Role and permission definitions
   - User-role and role-permission join tables
   - Token tracking for revocation

4. **Routes**
   - **Auth Routes** (`src/api/src/routes/auth.ts`) - Login, logout, user info
   - **RBAC Routes** (`src/api/src/routes/rbac.ts`) - User and role management (admin only)

### Default Roles

- **admin**: Full system access
- **operator**: Can create/manage clones and checkpoints
- **viewer**: Read-only access
- **system**: Internal system operations

### Default Permissions

Organized by category:

#### Golden Images
- `golden_images:create` - Create golden images
- `golden_images:read` - Read golden images
- `golden_images:update` - Update golden images
- `golden_images:delete` - Delete golden images

#### Clones
- `clones:create` - Create clones
- `clones:read` - Read clones
- `clones:update` - Update clones
- `clones:delete` - Delete clones

#### Checkpoints
- `checkpoints:create` - Create checkpoints
- `checkpoints:read` - Read checkpoints
- `checkpoints:delete` - Delete checkpoints

#### RBAC Management
- `rbac:admin` - Manage users, roles, and permissions

#### Authentication
- `auth:login` - Login to system
- `auth:refresh` - Refresh authentication token

## Database Schema

### Tables

#### flashdb_users
```sql
- user_id (UUID, PK)
- username (NVARCHAR, UNIQUE)
- email (NVARCHAR, UNIQUE)
- password_hash (NVARCHAR)
- created_at (DATETIMEOFFSET)
- updated_at (DATETIMEOFFSET)
- is_active (BIT)
- last_login (DATETIMEOFFSET)
- failed_login_attempts (INT)
- locked_until (DATETIMEOFFSET)
```

#### flashdb_roles
```sql
- role_id (UUID, PK)
- role_name (NVARCHAR, UNIQUE)
- description (NVARCHAR)
- is_system (BIT)
- created_at (DATETIMEOFFSET)
- updated_at (DATETIMEOFFSET)
```

#### flashdb_permissions
```sql
- permission_id (UUID, PK)
- permission_name (NVARCHAR, UNIQUE)
- description (NVARCHAR)
- category (NVARCHAR)
- created_at (DATETIMEOFFSET)
```

#### flashdb_user_roles (Join Table)
```sql
- user_id (FK -> flashdb_users)
- role_id (FK -> flashdb_roles)
- assigned_at (DATETIMEOFFSET)
```

#### flashdb_role_permissions (Join Table)
```sql
- role_id (FK -> flashdb_roles)
- permission_id (FK -> flashdb_permissions)
- assigned_at (DATETIMEOFFSET)
```

#### flashdb_tokens
```sql
- token_id (UUID, PK)
- user_id (FK -> flashdb_users)
- token_hash (NVARCHAR, UNIQUE)
- token_type (NVARCHAR)
- issued_at (DATETIMEOFFSET)
- expires_at (DATETIMEOFFSET)
- revoked_at (DATETIMEOFFSET)
- ip_address (NVARCHAR)
- user_agent (NVARCHAR)
```

## API Endpoints

### Authentication Endpoints

#### POST /api/auth/login
Login with username and password

**Request:**
```json
{
  "username": "admin",
  "password": "password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "token": "eyJhbGc...",
  "expiresIn": "24h"
}
```

#### POST /api/auth/logout
Logout and revoke token

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

#### GET /api/auth/me
Get current user information

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "username": "admin",
    "email": "admin@flashdb.local",
    "roles": ["admin"],
    "permissions": ["..."],
    "is_active": true,
    "created_at": "2026-06-06T...",
    "last_login": "2026-06-06T..."
  }
}
```

#### GET /api/auth/permissions
Get current user's permissions and roles

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "username": "admin",
    "roles": ["admin"],
    "permissions": ["golden_images:create", "..."]
  }
}
```

#### POST /api/auth/refresh
Refresh JWT token

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "token": "eyJhbGc...",
  "expiresIn": "24h"
}
```

#### POST /api/auth/validate
Validate token without authentication

**Request:**
```json
{
  "token": "eyJhbGc..."
}
```

**Response:**
```json
{
  "success": true,
  "valid": true,
  "data": {
    "userId": "uuid",
    "username": "admin",
    "roles": ["admin"],
    "permissions": ["..."]
  }
}
```

### User Management (Admin Only)

#### POST /api/rbac/users
Create new user

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Request:**
```json
{
  "username": "john.doe",
  "email": "john@flashdb.local",
  "password": "SecurePass123!",
  "roleIds": ["operator-role-uuid"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "userId": "uuid",
    "username": "john.doe",
    "email": "john@flashdb.local"
  }
}
```

#### GET /api/rbac/users
List all users

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Query Parameters:**
- `limit` - Number of users per page (default: 50)
- `offset` - Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "user_id": "uuid",
      "username": "admin",
      "email": "admin@flashdb.local",
      "is_active": true,
      "created_at": "2026-06-06T...",
      "last_login": "2026-06-06T..."
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 5
  }
}
```

#### GET /api/rbac/users/:userId
Get user details

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user_id": "uuid",
    "username": "john.doe",
    "email": "john@flashdb.local",
    "roles": ["operator"],
    "permissions": ["clones:create", "..."],
    "is_active": true,
    "created_at": "2026-06-06T...",
    "last_login": null
  }
}
```

#### PUT /api/rbac/users/:userId
Update user profile

**Headers:**
```
Authorization: Bearer <token>
```

**Request:**
```json
{
  "email": "newemail@flashdb.local",
  "password": "NewPassword123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User updated successfully"
}
```

#### DELETE /api/rbac/users/:userId
Deactivate user (admin only)

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "message": "User deactivated successfully"
}
```

### Role Management

#### POST /api/rbac/roles
Create new role (admin only)

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Request:**
```json
{
  "roleName": "viewer_pro",
  "description": "Advanced viewer with export permissions"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Role created successfully",
  "data": {
    "roleId": "uuid",
    "roleName": "viewer_pro",
    "description": "Advanced viewer with export permissions"
  }
}
```

#### GET /api/rbac/roles
List all roles

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "role_id": "uuid",
      "role_name": "admin",
      "description": "Administrator - Full system access",
      "is_system": true,
      "created_at": "2026-06-06T...",
      "permission_count": 20
    }
  ]
}
```

#### GET /api/rbac/roles/:roleId
Get role details with permissions

**Response:**
```json
{
  "success": true,
  "data": {
    "role_id": "uuid",
    "role_name": "operator",
    "description": "Operator - Can create and manage clones and checkpoints",
    "is_system": true,
    "created_at": "2026-06-06T...",
    "permissions": [
      {
        "permission_id": "uuid",
        "permission_name": "clones:create",
        "description": "Create clones",
        "category": "clones"
      }
    ]
  }
}
```

### User-Role Assignment

#### POST /api/rbac/assign-role
Assign role to user (admin only)

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Request:**
```json
{
  "userId": "uuid",
  "roleId": "operator-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Role assigned successfully"
}
```

#### POST /api/rbac/revoke-role
Revoke role from user (admin only)

**Request:**
```json
{
  "userId": "uuid",
  "roleId": "operator-uuid"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Role revoked successfully"
}
```

### Permission Management

#### GET /api/rbac/permissions
Get all permissions grouped by category

**Response:**
```json
{
  "success": true,
  "data": {
    "golden_images": [
      {
        "permission_id": "uuid",
        "permission_name": "golden_images:create",
        "description": "Create golden images",
        "category": "golden_images",
        "created_at": "2026-06-06T..."
      }
    ],
    "clones": [...],
    "checkpoints": [...],
    "rbac": [...],
    "auth": [...]
  }
}
```

## Configuration

### Environment Variables

```bash
# JWT Configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRY_HOURS=24

# Password Hashing
BCRYPT_ROUNDS=10

# Default Admin User
DEFAULT_ADMIN_PASSWORD=admin@FlashDB123!
DEFAULT_ADMIN_EMAIL=admin@flashdb.local

# Optional: Create default operator user
CREATE_DEFAULT_OPERATOR=false
DEFAULT_OPERATOR_PASSWORD=operator@FlashDB123!
DEFAULT_OPERATOR_EMAIL=operator@flashdb.local

# Database
SQL_SERVER_HOST=localhost
SQL_SERVER_PORT=1433
SQL_SERVER_USER=sa
SQL_SERVER_PASSWORD=
SQL_DATABASE=FlashDB
```

## Security Features

### Authentication
- **JWT Tokens**: Secure token-based authentication with 24-hour expiry
- **Bcrypt Hashing**: Industry-standard password hashing with salt
- **Token Revocation**: Logout invalidates tokens immediately

### Authorization
- **Role-Based Access Control**: Fine-grained permission model
- **Permission Checking**: Every sensitive operation validates permissions
- **Admin-Only Operations**: User/role management restricted to admins

### Account Security
- **Failed Login Tracking**: Lock account after 5 failed attempts (1 hour)
- **Activity Logging**: Login/logout events logged
- **Inactive User Support**: Deactivate accounts without deletion

## Bootstrap Process

On first startup, the system automatically:

1. Creates RBAC schema tables (if not exist)
2. Inserts default roles (admin, operator, viewer, system)
3. Inserts default permissions
4. Assigns permissions to roles
5. Creates default admin user (if not exists)
   - Username: `admin`
   - Password: `admin@FlashDB123!` (from `DEFAULT_ADMIN_PASSWORD` env var)
   - Email: `admin@flashdb.local` (from `DEFAULT_ADMIN_EMAIL` env var)

**IMPORTANT**: Change the default admin password immediately in production!

## Integration with Existing Routes

All existing API routes should be updated to use the new authentication middleware:

```typescript
import { jwtAuthenticate, authorize } from './middleware/authMiddleware';

// Require authentication and specific permission
router.post('/api/clones', 
  jwtAuthenticate,
  authorize('clones:create'),
  handler
);

// Require authentication but allow all authenticated users
router.get('/api/clones',
  jwtAuthenticate,
  handler
);

// Allow both authenticated and unauthenticated access
router.get('/api/clones/:id',
  handler
);
```

## User Workflow

### Initial Setup
1. Admin logs in with default credentials
2. Admin changes password: `PUT /api/rbac/users/{userId}`
3. Admin creates operator users: `POST /api/rbac/users`
4. Admin assigns roles to operators: `POST /api/rbac/assign-role`

### Regular User
1. User logs in: `POST /api/auth/login`
2. User gets JWT token valid for 24 hours
3. User includes token in requests: `Authorization: Bearer <token>`
4. Token automatically expires after 24 hours (user must re-login)
5. User can refresh token: `POST /api/auth/refresh` (before expiry)

### Admin Operations
1. List users: `GET /api/rbac/users`
2. Create user: `POST /api/rbac/users`
3. Assign role: `POST /api/rbac/assign-role`
4. Revoke role: `POST /api/rbac/revoke-role`
5. Deactivate user: `DELETE /api/rbac/users/{userId}`

## Testing

### Manual Testing

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin@FlashDB123!"}'

# Get user info (use token from login response)
curl http://localhost:3001/api/auth/me \
  -H "Authorization: Bearer <token>"

# List users
curl http://localhost:3001/api/rbac/users \
  -H "Authorization: Bearer <admin-token>"

# List roles
curl http://localhost:3001/api/rbac/roles \
  -H "Authorization: Bearer <token>"

# Get permissions
curl http://localhost:3001/api/rbac/permissions \
  -H "Authorization: Bearer <token>"
```

### Automated Tests
Run with: `npm test -- authService.test.ts`

## Troubleshooting

### "Missing or invalid Authorization header"
- Ensure token is included: `Authorization: Bearer <token>`
- Check token format - should start with `Bearer ` (note space)

### "Invalid or expired token"
- Token may have expired (24 hour default)
- Refresh token: `POST /api/auth/refresh`
- Or login again: `POST /api/auth/login`

### "Token has been revoked"
- User logged out from another session
- Login again to get new token

### "Insufficient permissions"
- User role doesn't have required permission
- Contact admin to assign appropriate role

### "Account is temporarily locked"
- Too many failed login attempts
- Wait 1 hour and try again
- Admin can unlock: `PUT /api/rbac/users/{userId}` (set `locked_until` to null)

## Performance Considerations

- **Permission Caching**: Permissions are cached in JWT token (24hr cache)
- **Token Revocation**: Checked on every request (minimal DB query)
- **User Info Queries**: Lazy-loaded on demand
- **Role Assignments**: Indexed for fast lookups

## Migration from Existing Auth

If migrating from the old session-based auth:

1. Keep old auth middleware alongside new JWT auth
2. Update routes incrementally to use new middleware
3. Existing tokens remain valid until they expire
4. New authentication uses JWT endpoints

## Future Enhancements

- OAuth2/OIDC support
- API key management for service-to-service auth
- Two-factor authentication (2FA)
- Custom roles UI in GUI
- Permission audit logging
- Token refresh token rotation
- Single sign-on (SSO)

## Files Changed

### New Files
- `src/api/src/db/rbacSchema.sql` - Database schema
- `src/api/src/services/authService.ts` - Authentication logic
- `src/api/src/middleware/authMiddleware.ts` - Auth middleware
- `src/api/src/routes/auth.ts` - Auth endpoints
- `src/api/src/routes/rbac.ts` - RBAC endpoints
- `src/api/src/services/rbacBootstrap.ts` - Bootstrap logic
- `src/api/src/services/__tests__/authService.test.ts` - Tests

### Modified Files
- `src/api/package.json` - Added jsonwebtoken, bcryptjs
- `src/api/src/db/init.ts` - Added RBAC schema initialization
- `src/api/src/index.ts` - Registered auth/RBAC routes, added middleware

## Status

✅ Phase 5b.5 RBAC Implementation Complete

- [x] JWT authentication service
- [x] Bcrypt password hashing
- [x] Role-based access control
- [x] Permission management
- [x] User management endpoints
- [x] Role management endpoints
- [x] PostgreSQL schema
- [x] Authentication middleware
- [x] Authorization middleware
- [x] Bootstrap with default users
- [x] Token revocation tracking
- [x] Account lockout on failed attempts
- [x] Comprehensive testing

Ready for integration with existing routes and authentication testing.
