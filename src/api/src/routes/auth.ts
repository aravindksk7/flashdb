import { Router, Request, Response } from 'express';
import authService from '../services/authService';
import logger from '../logger';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate user with username and password
 * Returns JWT token
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Get client IP
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('user-agent');

    // Authenticate
    const token = await authService.login(username, password, ipAddress, userAgent);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      expiresIn: `${process.env.JWT_EXPIRY_HOURS || 24}h`
    });
  } catch (error: any) {
    logger.warn(`Login error: ${error.message}`);
    res.status(401).json({
      success: false,
      message: error.message || 'Authentication failed'
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout user by revoking token
 * Requires authentication
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const token = req.authToken;

    if (token) {
      await authService.revokeToken(token);
    }

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error: any) {
    logger.error(`Logout error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
});

/**
 * GET /api/auth/me
 * Get current user information
 * Requires authentication
 */
router.get('/me', async (req: Request, res: Response) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const userInfo = await authService.getUserInfo(user.userId);

    res.json({
      success: true,
      data: userInfo
    });
  } catch (error: any) {
    logger.error(`Get user error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to get user information'
    });
  }
});

/**
 * GET /api/auth/permissions
 * Get current user's permissions
 * Requires authentication
 */
router.get('/permissions', async (req: Request, res: Response) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    const permissions = await authService.getUserPermissions(user.userId);
    const roles = await authService.getUserRoles(user.userId);

    res.json({
      success: true,
      data: {
        userId: user.userId,
        username: user.username,
        roles,
        permissions
      }
    });
  } catch (error: any) {
    logger.error(`Get permissions error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to get permissions'
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh JWT token (get a new token using old token)
 * Requires authentication
 * Optional: Returns new token if old token is about to expire
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Get fresh user data
    const userInfo = await authService.getUserInfo(user.userId);

    if (!userInfo) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new token with fresh data
    const newToken = (authService as any).generateToken({
      userId: userInfo.user_id,
      username: userInfo.username,
      email: userInfo.email,
      roles: userInfo.roles,
      permissions: userInfo.permissions
    });

    // Revoke old token (optional - can be kept active too)
    if (req.authToken) {
      await authService.revokeToken(req.authToken);
    }

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      token: newToken,
      expiresIn: `${process.env.JWT_EXPIRY_HOURS || 24}h`
    });
  } catch (error: any) {
    logger.error(`Refresh token error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Failed to refresh token'
    });
  }
});

/**
 * POST /api/auth/validate
 * Validate a token without requiring authentication
 * Used by frontend to check if stored token is still valid
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    const decoded = authService.validateToken(token);

    if (!decoded) {
      return res.json({
        success: false,
        message: 'Token is invalid or expired',
        valid: false
      });
    }

    const isRevoked = await authService.isTokenRevoked(token);

    res.json({
      success: true,
      valid: !isRevoked,
      data: {
        userId: decoded.userId,
        username: decoded.username,
        roles: decoded.roles,
        permissions: decoded.permissions
      }
    });
  } catch (error: any) {
    logger.error(`Validate token error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Token validation failed'
    });
  }
});

export default router;
