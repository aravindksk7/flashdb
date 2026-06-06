import jwt, { JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getSqlClient } from './sqlClient';
import logger from '../logger';

export interface UserPayload {
  userId: string;
  username: string;
  email: string;
  roles: string[];
  permissions: string[];
}

export interface TokenPayload extends JwtPayload {
  userId: string;
  username: string;
  roles: string[];
  permissions: string[];
  iat?: number;
  exp?: number;
}

/**
 * Authentication Service
 * Handles JWT creation, validation, and user management
 * Singleton pattern - use getInstance()
 */
export class AuthService {
  private static instance: AuthService;
  private jwtSecret: string;
  private jwtExpiryHours: number;
  private bcryptRounds: number;

  private constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    this.jwtExpiryHours = parseInt(process.env.JWT_EXPIRY_HOURS || '24', 10);
    this.bcryptRounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);

    if (process.env.NODE_ENV === 'production' && this.jwtSecret === 'your-secret-key-change-in-production') {
      logger.warn('JWT_SECRET is using default value in production. Please set JWT_SECRET environment variable.');
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  /**
   * Hash a password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, this.bcryptRounds);
    } catch (error: any) {
      logger.error(`Error hashing password: ${error.message}`);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error: any) {
      logger.error(`Error verifying password: ${error.message}`);
      return false;
    }
  }

  /**
   * Create a new user
   */
  async createUser(username: string, email: string, password: string): Promise<string> {
    try {
      const sqlClient = getSqlClient();
      const userId = uuidv4();
      const passwordHash = await this.hashPassword(password);

      const result = await sqlClient.execute(`
        INSERT INTO dbo.flashdb_users (user_id, username, email, password_hash, is_active)
        VALUES ('${userId}', '${this.escapeSql(username)}', '${this.escapeSql(email)}', '${this.escapeSql(passwordHash)}', 1)
      `);

      logger.info(`User created: ${username} (${userId})`);
      return userId;
    } catch (error: any) {
      logger.error(`Error creating user: ${error.message}`);
      throw error;
    }
  }

  /**
   * Authenticate user and return JWT token
   */
  async login(username: string, password: string, ipAddress?: string, userAgent?: string): Promise<string> {
    try {
      const sqlClient = getSqlClient();

      // Get user
      const userResult = await sqlClient.query(`
        SELECT user_id, username, email, password_hash, is_active, locked_until
        FROM dbo.flashdb_users
        WHERE username = '${this.escapeSql(username)}'
      `);

      if (userResult.recordset.length === 0) {
        logger.warn(`Login attempt for non-existent user: ${username}`);
        throw new Error('Invalid username or password');
      }

      const user = userResult.recordset[0];

      // Check if user is locked
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        logger.warn(`Login attempt for locked user: ${username}`);
        throw new Error('Account is temporarily locked. Please try again later.');
      }

      // Check if user is active
      if (!user.is_active) {
        logger.warn(`Login attempt for inactive user: ${username}`);
        throw new Error('User account is inactive');
      }

      // Verify password
      const passwordValid = await this.verifyPassword(password, user.password_hash);
      if (!passwordValid) {
        // Increment failed login attempts
        await sqlClient.execute(`
          UPDATE dbo.flashdb_users
          SET failed_login_attempts = failed_login_attempts + 1,
              locked_until = CASE WHEN failed_login_attempts >= 5 THEN DATEADD(hour, 1, SYSDATETIMEOFFSET()) ELSE NULL END
          WHERE user_id = '${user.user_id}'
        `);
        logger.warn(`Failed login attempt for user: ${username}`);
        throw new Error('Invalid username or password');
      }

      // Get user roles
      const rolesResult = await sqlClient.query(`
        SELECT r.role_name, r.role_id
        FROM dbo.flashdb_user_roles ur
        JOIN dbo.flashdb_roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = '${user.user_id}' AND r.is_system = 0 OR r.role_name IN ('admin', 'operator', 'viewer', 'system')
      `);

      const roles = rolesResult.recordset.map((r: any) => r.role_name);

      // Get user permissions
      const permissionsResult = await sqlClient.query(`
        SELECT DISTINCT p.permission_name
        FROM dbo.flashdb_user_roles ur
        JOIN dbo.flashdb_role_permissions rp ON ur.role_id = rp.role_id
        JOIN dbo.flashdb_permissions p ON rp.permission_id = p.permission_id
        WHERE ur.user_id = '${user.user_id}'
      `);

      const permissions = permissionsResult.recordset.map((p: any) => p.permission_name);

      // Reset failed login attempts on successful login
      await sqlClient.execute(`
        UPDATE dbo.flashdb_users
        SET failed_login_attempts = 0, locked_until = NULL, last_login = SYSDATETIMEOFFSET()
        WHERE user_id = '${user.user_id}'
      `);

      // Create JWT token
      const token = this.generateToken({
        userId: user.user_id,
        username: user.username,
        email: user.email,
        roles,
        permissions
      });

      // Store token in database for tracking/revocation
      await this.storeToken(user.user_id, token, ipAddress, userAgent);

      logger.info(`User logged in: ${username}`);
      return token;
    } catch (error: any) {
      logger.error(`Login error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate JWT token
   */
  private generateToken(payload: UserPayload): string {
    return jwt.sign(
      {
        userId: payload.userId,
        username: payload.username,
        roles: payload.roles,
        permissions: payload.permissions
      },
      this.jwtSecret,
      {
        expiresIn: `${this.jwtExpiryHours}h`,
        algorithm: 'HS256'
      }
    );
  }

  /**
   * Validate and decode JWT token
   */
  validateToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload;
      return decoded;
    } catch (error: any) {
      logger.debug(`Token validation error: ${error.message}`);
      return null;
    }
  }

  /**
   * Get user's roles
   */
  async getUserRoles(userId: string): Promise<string[]> {
    try {
      const sqlClient = getSqlClient();

      const result = await sqlClient.query(`
        SELECT r.role_name
        FROM dbo.flashdb_user_roles ur
        JOIN dbo.flashdb_roles r ON ur.role_id = r.role_id
        WHERE ur.user_id = '${userId}'
      `);

      return result.recordset.map((r: any) => r.role_name);
    } catch (error: any) {
      logger.error(`Error getting user roles: ${error.message}`);
      return [];
    }
  }

  /**
   * Get user's permissions
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    try {
      const sqlClient = getSqlClient();

      const result = await sqlClient.query(`
        SELECT DISTINCT p.permission_name
        FROM dbo.flashdb_user_roles ur
        JOIN dbo.flashdb_role_permissions rp ON ur.role_id = rp.role_id
        JOIN dbo.flashdb_permissions p ON rp.permission_id = p.permission_id
        WHERE ur.user_id = '${userId}'
      `);

      return result.recordset.map((p: any) => p.permission_name);
    } catch (error: any) {
      logger.error(`Error getting user permissions: ${error.message}`);
      return [];
    }
  }

  /**
   * Revoke a token
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const sqlClient = getSqlClient();
      const decoded = this.validateToken(token);

      if (!decoded) {
        return;
      }

      const tokenHash = this.hashToken(token);

      await sqlClient.execute(`
        UPDATE dbo.flashdb_tokens
        SET revoked_at = SYSDATETIMEOFFSET()
        WHERE token_hash = '${this.escapeSql(tokenHash)}'
      `);

      logger.info(`Token revoked for user: ${decoded.userId}`);
    } catch (error: any) {
      logger.error(`Error revoking token: ${error.message}`);
    }
  }

  /**
   * Check if token is revoked
   */
  async isTokenRevoked(token: string): Promise<boolean> {
    try {
      const sqlClient = getSqlClient();
      const tokenHash = this.hashToken(token);

      const result = await sqlClient.query(`
        SELECT revoked_at FROM dbo.flashdb_tokens
        WHERE token_hash = '${this.escapeSql(tokenHash)}'
      `);

      if (result.recordset.length === 0) {
        return false;
      }

      return result.recordset[0].revoked_at !== null;
    } catch (error: any) {
      logger.error(`Error checking token revocation: ${error.message}`);
      return false;
    }
  }

  /**
   * Store token for tracking and revocation
   */
  private async storeToken(userId: string, token: string, ipAddress?: string, userAgent?: string): Promise<void> {
    try {
      const sqlClient = getSqlClient();
      const tokenHash = this.hashToken(token);
      const expiresAt = new Date(Date.now() + this.jwtExpiryHours * 60 * 60 * 1000);

      await sqlClient.execute(`
        INSERT INTO dbo.flashdb_tokens (user_id, token_hash, expires_at, ip_address, user_agent)
        VALUES ('${userId}', '${this.escapeSql(tokenHash)}', '${expiresAt.toISOString()}', '${this.escapeSql(ipAddress || '')}', '${this.escapeSql(userAgent || '')}')
      `);
    } catch (error: any) {
      logger.error(`Error storing token: ${error.message}`);
    }
  }

  /**
   * Hash token for storage (separate from password hashing)
   */
  private hashToken(token: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Escape SQL special characters
   */
  private escapeSql(value: string): string {
    return value.replace(/'/g, "''");
  }

  /**
   * Get current user info
   */
  async getUserInfo(userId: string): Promise<any> {
    try {
      const sqlClient = getSqlClient();

      const result = await sqlClient.query(`
        SELECT user_id, username, email, is_active, created_at, last_login
        FROM dbo.flashdb_users
        WHERE user_id = '${userId}'
      `);

      if (result.recordset.length === 0) {
        return null;
      }

      const user = result.recordset[0];
      const roles = await this.getUserRoles(userId);
      const permissions = await this.getUserPermissions(userId);

      return {
        ...user,
        roles,
        permissions
      };
    } catch (error: any) {
      logger.error(`Error getting user info: ${error.message}`);
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(userId: string, updates: { email?: string; password?: string }): Promise<void> {
    try {
      const sqlClient = getSqlClient();
      const parts: string[] = [];

      if (updates.email) {
        parts.push(`email = '${this.escapeSql(updates.email)}'`);
      }

      if (updates.password) {
        const hash = await this.hashPassword(updates.password);
        parts.push(`password_hash = '${this.escapeSql(hash)}'`);
      }

      if (parts.length === 0) {
        return;
      }

      parts.push(`updated_at = SYSDATETIMEOFFSET()`);

      await sqlClient.execute(`
        UPDATE dbo.flashdb_users
        SET ${parts.join(', ')}
        WHERE user_id = '${userId}'
      `);

      logger.info(`User profile updated: ${userId}`);
    } catch (error: any) {
      logger.error(`Error updating user profile: ${error.message}`);
      throw error;
    }
  }
}

export default AuthService.getInstance();
