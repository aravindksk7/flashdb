import { Request, Response, NextFunction } from 'express';
import authService from '../services/authService';
import logger from '../logger';

/**
 * Extended Express Request with user context
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        username: string;
        roles: string[];
        permissions: string[];
        token?: string;
      };
      authToken?: string;
    }
  }
}

/**
 * JWT Authentication Middleware
 * Verifies JWT token in Authorization header
 * Extracts user context and attaches to request
 */
export const jwtAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Missing or invalid Authorization header'
      });
      return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix
    req.authToken = token;

    // Validate token
    const decoded = authService.validateToken(token);
    if (!decoded) {
      res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
      return;
    }

    // Check if token is revoked
    const isRevoked = await authService.isTokenRevoked(token);
    if (isRevoked) {
      res.status(401).json({
        success: false,
        message: 'Token has been revoked'
      });
      return;
    }

    // Attach user to request
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      roles: decoded.roles || [],
      permissions: decoded.permissions || [],
      token
    };

    logger.debug(`Authenticated user: ${decoded.username} (${decoded.userId})`);
    next();
  } catch (error: any) {
    logger.error(`Authentication error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * Optional JWT Authentication Middleware
 * Authenticates if token is provided, but doesn't require it
 */
export const jwtAuthenticateOptional = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.slice(7);
    req.authToken = token;

    const decoded = authService.validateToken(token);
    if (!decoded) {
      next();
      return;
    }

    const isRevoked = await authService.isTokenRevoked(token);
    if (isRevoked) {
      next();
      return;
    }

    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      roles: decoded.roles || [],
      permissions: decoded.permissions || [],
      token
    };

    logger.debug(`Optional authenticated user: ${decoded.username}`);
    next();
  } catch (error: any) {
    logger.debug(`Optional authentication skipped: ${error.message}`);
    next();
  }
};

/**
 * Authorization Middleware - Check for required permissions
 */
export const authorize = (requiredPermissions: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const permissions = Array.isArray(requiredPermissions)
      ? requiredPermissions
      : [requiredPermissions];

    const hasPermission = permissions.some(perm =>
      req.user!.permissions.includes(perm)
    );

    if (!hasPermission) {
      logger.warn(
        `Authorization failed for user ${req.user.userId}: missing permissions ${permissions.join(', ')}`
      );
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        required: permissions,
        userPermissions: req.user.permissions
      });
      return;
    }

    logger.debug(`Authorization passed for user ${req.user.userId}`);
    next();
  };
};

/**
 * Authorization Middleware - Check for required roles
 */
export const authorizeRoles = (requiredRoles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const roles = Array.isArray(requiredRoles)
      ? requiredRoles
      : [requiredRoles];

    const hasRole = roles.some(role =>
      req.user!.roles.includes(role)
    );

    if (!hasRole) {
      logger.warn(
        `Role authorization failed for user ${req.user.userId}: missing roles ${roles.join(', ')}`
      );
      res.status(403).json({
        success: false,
        message: 'Insufficient role',
        required: roles,
        userRoles: req.user.roles
      });
      return;
    }

    logger.debug(`Role authorization passed for user ${req.user.userId}`);
    next();
  };
};

/**
 * Admin-only Middleware
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
    return;
  }

  if (!req.user.roles.includes('admin')) {
    logger.warn(`Admin access denied for user ${req.user.userId}`);
    res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
    return;
  }

  next();
};

/**
 * Attach user context middleware (for endpoints that accept both auth and non-auth)
 */
export const attachUserContext = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const decoded = authService.validateToken(token);

      if (decoded) {
        const isRevoked = await authService.isTokenRevoked(token);
        if (!isRevoked) {
          req.user = {
            userId: decoded.userId,
            username: decoded.username,
            roles: decoded.roles || [],
            permissions: decoded.permissions || [],
            token
          };
        }
      }
    }

    next();
  } catch (error: any) {
    logger.debug(`User context attachment warning: ${error.message}`);
    next();
  }
};

export default {
  jwtAuthenticate,
  jwtAuthenticateOptional,
  authorize,
  authorizeRoles,
  requireAdmin,
  attachUserContext
};
