import { Router, Request, Response } from 'express';
import { getSqlClient } from '../services/sqlClient';
import authService from '../services/authService';
import { jwtAuthenticate, requireAdmin } from '../middleware/authMiddleware';
import logger from '../logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// All RBAC endpoints require authentication
router.use(jwtAuthenticate);

/**
 * Helper: Escape SQL special characters
 */
function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

// ============ USER MANAGEMENT ============

/**
 * POST /api/rbac/users
 * Create a new user (admin only)
 */
router.post('/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { username, email, password, roleIds } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username, email, and password are required'
      });
    }

    const userId = await authService.createUser(username, email, password);

    // Assign roles if provided
    if (Array.isArray(roleIds) && roleIds.length > 0) {
      const sqlClient = getSqlClient();
      for (const roleId of roleIds) {
        await sqlClient.execute(`
          INSERT INTO dbo.flashdb_user_roles (user_id, role_id)
          VALUES ('${userId}', '${roleId}')
        `);
      }
    }

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        userId,
        username,
        email
      }
    });
  } catch (error: any) {
    logger.error(`Error creating user: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create user'
    });
  }
});

/**
 * GET /api/rbac/users
 * List all users (admin only)
 */
router.get('/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const sqlClient = getSqlClient();
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await sqlClient.query(`
      SELECT TOP ${limit} user_id, username, email, is_active, created_at, last_login
      FROM dbo.flashdb_users
      ORDER BY created_at DESC
      OFFSET ${offset} ROWS
    `);

    const countResult = await sqlClient.query(
      'SELECT COUNT(*) as total FROM dbo.flashdb_users'
    );

    res.json({
      success: true,
      data: result.recordset,
      pagination: {
        limit,
        offset,
        total: countResult.recordset[0].total
      }
    });
  } catch (error: any) {
    logger.error(`Error listing users: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to list users'
    });
  }
});

/**
 * GET /api/rbac/users/:userId
 * Get user details (admin or self)
 */
router.get('/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user;

    // User can view their own info or admin can view any user
    if (userId !== requestingUser?.userId && !requestingUser?.roles.includes('admin')) {
      return res.status(403).json({
        success: false,
        message: 'You can only view your own information'
      });
    }

    const userInfo = await authService.getUserInfo(userId);

    if (!userInfo) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: userInfo
    });
  } catch (error: any) {
    logger.error(`Error getting user: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to get user'
    });
  }
});

/**
 * PUT /api/rbac/users/:userId
 * Update user (admin or self - limited fields)
 */
router.put('/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const requestingUser = req.user;
    const updates = req.body;

    // User can update their own info (limited) or admin can update any user
    if (userId !== requestingUser?.userId && !requestingUser?.roles.includes('admin')) {
      return res.status(403).json({
        success: false,
        message: 'You can only update your own information'
      });
    }

    // Non-admin users can only update email and password
    if (!requestingUser?.roles.includes('admin')) {
      const allowedFields = ['email', 'password'];
      for (const key in updates) {
        if (!allowedFields.includes(key)) {
          return res.status(403).json({
            success: false,
            message: `You cannot update ${key}`
          });
        }
      }
    }

    await authService.updateUserProfile(userId, updates);

    res.json({
      success: true,
      message: 'User updated successfully'
    });
  } catch (error: any) {
    logger.error(`Error updating user: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

/**
 * DELETE /api/rbac/users/:userId
 * Deactivate user (admin only)
 */
router.delete('/users/:userId', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const sqlClient = getSqlClient();

    // Check if user exists
    const userResult = await sqlClient.query(`
      SELECT user_id FROM dbo.flashdb_users WHERE user_id = '${userId}'
    `);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Deactivate user instead of deleting
    await sqlClient.execute(`
      UPDATE dbo.flashdb_users
      SET is_active = 0, updated_at = SYSDATETIMEOFFSET()
      WHERE user_id = '${userId}'
    `);

    logger.info(`User deactivated: ${userId}`);

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });
  } catch (error: any) {
    logger.error(`Error deleting user: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate user'
    });
  }
});

// ============ ROLE MANAGEMENT ============

/**
 * POST /api/rbac/roles
 * Create a new role (admin only)
 */
router.post('/roles', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { roleName, description } = req.body;

    if (!roleName) {
      return res.status(400).json({
        success: false,
        message: 'Role name is required'
      });
    }

    const sqlClient = getSqlClient();
    const roleId = uuidv4();

    await sqlClient.execute(`
      INSERT INTO dbo.flashdb_roles (role_id, role_name, description, is_system)
      VALUES ('${roleId}', '${escapeSql(roleName)}', '${escapeSql(description || '')}', 0)
    `);

    logger.info(`Role created: ${roleName}`);

    res.status(201).json({
      success: true,
      message: 'Role created successfully',
      data: {
        roleId,
        roleName,
        description
      }
    });
  } catch (error: any) {
    logger.error(`Error creating role: ${error.message}`);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create role'
    });
  }
});

/**
 * GET /api/rbac/roles
 * List all roles
 */
router.get('/roles', async (req: Request, res: Response) => {
  try {
    const sqlClient = getSqlClient();

    const result = await sqlClient.query(`
      SELECT r.role_id, r.role_name, r.description, r.is_system, r.created_at,
             COUNT(rp.permission_id) as permission_count
      FROM dbo.flashdb_roles r
      LEFT JOIN dbo.flashdb_role_permissions rp ON r.role_id = rp.role_id
      GROUP BY r.role_id, r.role_name, r.description, r.is_system, r.created_at
      ORDER BY r.created_at DESC
    `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (error: any) {
    logger.error(`Error listing roles: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to list roles'
    });
  }
});

/**
 * GET /api/rbac/roles/:roleId
 * Get role details with permissions
 */
router.get('/roles/:roleId', async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;
    const sqlClient = getSqlClient();

    const roleResult = await sqlClient.query(`
      SELECT role_id, role_name, description, is_system, created_at
      FROM dbo.flashdb_roles
      WHERE role_id = '${roleId}'
    `);

    if (roleResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    const permResult = await sqlClient.query(`
      SELECT p.permission_id, p.permission_name, p.description, p.category
      FROM dbo.flashdb_role_permissions rp
      JOIN dbo.flashdb_permissions p ON rp.permission_id = p.permission_id
      WHERE rp.role_id = '${roleId}'
      ORDER BY p.category, p.permission_name
    `);

    const role = roleResult.recordset[0];

    res.json({
      success: true,
      data: {
        ...role,
        permissions: permResult.recordset
      }
    });
  } catch (error: any) {
    logger.error(`Error getting role: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to get role'
    });
  }
});

// ============ USER-ROLE ASSIGNMENT ============

/**
 * POST /api/rbac/assign-role
 * Assign role to user (admin only)
 */
router.post('/assign-role', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, roleId } = req.body;

    if (!userId || !roleId) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Role ID are required'
      });
    }

    const sqlClient = getSqlClient();

    // Check if user exists
    const userResult = await sqlClient.query(`
      SELECT user_id FROM dbo.flashdb_users WHERE user_id = '${userId}'
    `);

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if role exists
    const roleResult = await sqlClient.query(`
      SELECT role_id FROM dbo.flashdb_roles WHERE role_id = '${roleId}'
    `);

    if (roleResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Role not found'
      });
    }

    // Check if assignment already exists
    const assignResult = await sqlClient.query(`
      SELECT user_id FROM dbo.flashdb_user_roles
      WHERE user_id = '${userId}' AND role_id = '${roleId}'
    `);

    if (assignResult.recordset.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User already has this role'
      });
    }

    // Assign role
    await sqlClient.execute(`
      INSERT INTO dbo.flashdb_user_roles (user_id, role_id)
      VALUES ('${userId}', '${roleId}')
    `);

    logger.info(`Role ${roleId} assigned to user ${userId}`);

    res.json({
      success: true,
      message: 'Role assigned successfully'
    });
  } catch (error: any) {
    logger.error(`Error assigning role: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to assign role'
    });
  }
});

/**
 * POST /api/rbac/revoke-role
 * Revoke role from user (admin only)
 */
router.post('/revoke-role', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, roleId } = req.body;

    if (!userId || !roleId) {
      return res.status(400).json({
        success: false,
        message: 'User ID and Role ID are required'
      });
    }

    const sqlClient = getSqlClient();

    await sqlClient.execute(`
      DELETE FROM dbo.flashdb_user_roles
      WHERE user_id = '${userId}' AND role_id = '${roleId}'
    `);

    logger.info(`Role ${roleId} revoked from user ${userId}`);

    res.json({
      success: true,
      message: 'Role revoked successfully'
    });
  } catch (error: any) {
    logger.error(`Error revoking role: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke role'
    });
  }
});

// ============ PERMISSION MANAGEMENT ============

/**
 * GET /api/rbac/permissions
 * List all permissions
 */
router.get('/permissions', async (req: Request, res: Response) => {
  try {
    const sqlClient = getSqlClient();

    const result = await sqlClient.query(`
      SELECT permission_id, permission_name, description, category, created_at
      FROM dbo.flashdb_permissions
      ORDER BY category, permission_name
    `);

    // Group by category
    const grouped: any = {};
    for (const perm of result.recordset) {
      if (!grouped[perm.category]) {
        grouped[perm.category] = [];
      }
      grouped[perm.category].push(perm);
    }

    res.json({
      success: true,
      data: grouped
    });
  } catch (error: any) {
    logger.error(`Error listing permissions: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to list permissions'
    });
  }
});

export default router;
