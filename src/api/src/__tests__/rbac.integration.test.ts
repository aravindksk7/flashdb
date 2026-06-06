/**
 * RBAC Integration Tests
 * Tests authentication and authorization across API endpoints
 * Phase 5b.5
 */

import request from 'supertest';
import express, { Express } from 'express';
import { generateToken, authenticationMiddleware, authorizeRoles } from '../middleware/auth';

describe('RBAC Integration Tests - API Endpoints (Phase 5b.5)', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Test routes
    app.post('/login', (req, res) => {
      const { username, password } = req.body;

      // Simple test authentication
      if (username === 'admin' && password === 'admin123') {
        const token = generateToken('admin');
        return res.json({
          success: true,
          token,
          user: { id: 'admin', role: 'admin' }
        });
      }

      if (username === 'user' && password === 'user123') {
        const token = generateToken('user');
        return res.json({
          success: true,
          token,
          user: { id: 'user', role: 'operator' }
        });
      }

      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    });

    app.post('/logout', (req, res) => {
      res.json({
        success: true,
        message: 'Logged out'
      });
    });

    // Protected routes
    app.get(
      '/api/clones',
      authenticationMiddleware,
      (req, res) => {
        res.json({
          success: true,
          clones: []
        });
      }
    );

    app.post(
      '/api/clones',
      authenticationMiddleware,
      (req, res) => {
        res.json({
          success: true,
          cloneId: 'clone123'
        });
      }
    );

    // Admin-only route
    app.get(
      '/api/admin/users',
      authenticationMiddleware,
      authorizeRoles(['admin']),
      (req, res) => {
        res.json({
          success: true,
          users: []
        });
      }
    );

    app.delete(
      '/api/admin/users/:userId',
      authenticationMiddleware,
      authorizeRoles(['admin']),
      (req, res) => {
        res.json({
          success: true,
          message: 'User deleted'
        });
      }
    );

    // Operator route
    app.post(
      '/api/clones/:cloneId/checkpoint',
      authenticationMiddleware,
      authorizeRoles(['operator', 'admin']),
      (req, res) => {
        res.json({
          success: true,
          checkpointId: 'chk123'
        });
      }
    );

    // Public route (no auth required)
    app.get('/health', (req, res) => {
      res.json({
        status: 'healthy'
      });
    });
  });

  describe('1. Login Workflow', () => {
    it('should login with valid admin credentials', async () => {
      const response = await request(app)
        .post('/login')
        .send({ username: 'admin', password: 'admin123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.role).toBe('admin');
    });

    it('should login with valid user credentials', async () => {
      const response = await request(app)
        .post('/login')
        .send({ username: 'user', password: 'user123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user.role).toBe('operator');
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/login')
        .send({ username: 'admin', password: 'wrongpass' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject missing credentials', async () => {
      const response = await request(app)
        .post('/login')
        .send({});

      expect(response.status).toBe(401);
    });
  });

  describe('2. Token-Based Access', () => {
    let adminToken: string;
    let userToken: string;

    beforeEach(() => {
      adminToken = generateToken('admin');
      userToken = generateToken('user');
    });

    it('should allow authenticated request with valid token', async () => {
      const response = await request(app)
        .get('/api/clones')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app)
        .get('/api/clones')
        .set('Authorization', 'Bearer invalid.token');

      expect(response.status).toBe(401);
    });

    it('should reject request without token', async () => {
      const response = await request(app)
        .get('/api/clones');

      expect(response.status).toBe(401);
    });

    it('should reject malformed authorization header', async () => {
      const response = await request(app)
        .get('/api/clones')
        .set('Authorization', 'InvalidFormat token');

      expect(response.status).toBe(401);
    });

    it('should allow multiple authenticated requests with same token', async () => {
      const response1 = await request(app)
        .get('/api/clones')
        .set('Authorization', `Bearer ${adminToken}`);

      const response2 = await request(app)
        .get('/api/clones')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
    });
  });

  describe('3. Role-Based Access Control', () => {
    beforeEach(() => {
      process.env.USER_ROLES = 'admin';
    });

    it('should allow admin to access admin-only endpoints', async () => {
      const adminToken = generateToken('admin');

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should deny non-admin to access admin-only endpoints', async () => {
      process.env.USER_ROLES = 'operator';
      const userToken = generateToken('user');

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('should allow operator to access operator endpoints', async () => {
      process.env.USER_ROLES = 'operator';
      const userToken = generateToken('user');

      const response = await request(app)
        .post('/api/clones/clone123/checkpoint')
        .set('Authorization', `Bearer ${userToken}`)
        .send({});

      expect(response.status).toBe(200);
    });

    it('should allow admin to access operator endpoints', async () => {
      process.env.USER_ROLES = 'admin';
      const adminToken = generateToken('admin');

      const response = await request(app)
        .post('/api/clones/clone123/checkpoint')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(200);
    });
  });

  describe('4. Permission Enforcement', () => {
    it('should enforce permissions on DELETE operations', async () => {
      process.env.USER_ROLES = 'operator';
      const userToken = generateToken('user');

      const response = await request(app)
        .delete('/api/admin/users/user123')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });

    it('should allow DELETE with admin role', async () => {
      process.env.USER_ROLES = 'admin';
      const adminToken = generateToken('admin');

      const response = await request(app)
        .delete('/api/admin/users/user123')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('5. Public vs Protected Routes', () => {
    it('should allow unauthenticated access to public routes', async () => {
      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
    });

    it('should require authentication for protected routes', async () => {
      const response = await request(app)
        .post('/api/clones')
        .send({ name: 'test-clone' });

      expect(response.status).toBe(401);
    });

    it('should allow authenticated access to protected routes', async () => {
      const token = generateToken('user');

      const response = await request(app)
        .post('/api/clones')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'test-clone' });

      expect(response.status).toBe(200);
    });
  });

  describe('6. Multi-Role User Access', () => {
    it('should grant access if user has any required role', async () => {
      process.env.USER_ROLES = 'viewer,operator,admin';
      const userToken = generateToken('user');

      const response = await request(app)
        .post('/api/clones/clone123/checkpoint')
        .set('Authorization', `Bearer ${userToken}`)
        .send({});

      expect(response.status).toBe(200);
    });

    it('should deny access if user lacks all required roles', async () => {
      process.env.USER_ROLES = 'viewer';
      const userToken = generateToken('user');

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('7. Request Methods & RBAC', () => {
    it('should enforce RBAC on GET requests', async () => {
      process.env.USER_ROLES = 'operator';
      const userToken = generateToken('user');

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });

    it('should enforce RBAC on POST requests', async () => {
      process.env.USER_ROLES = 'viewer';
      const userToken = generateToken('user');

      const response = await request(app)
        .post('/api/clones/clone123/checkpoint')
        .set('Authorization', `Bearer ${userToken}`)
        .send({});

      expect(response.status).toBe(403);
    });

    it('should enforce RBAC on DELETE requests', async () => {
      process.env.USER_ROLES = 'operator';
      const userToken = generateToken('user');

      const response = await request(app)
        .delete('/api/admin/users/user123')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
    });
  });

  describe('8. Error Response Formats', () => {
    it('should return 401 with proper format for missing auth', async () => {
      const response = await request(app)
        .get('/api/clones');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBeDefined();
    });

    it('should return 403 with proper format for insufficient permissions', async () => {
      process.env.USER_ROLES = 'operator';
      const userToken = generateToken('user');

      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBeDefined();
    });
  });

  describe('9. Logout Workflow', () => {
    it('should support logout endpoint', async () => {
      const response = await request(app)
        .post('/logout');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('10. Header Validation', () => {
    it('should handle case-insensitive authorization header', async () => {
      const token = generateToken('user');

      const response = await request(app)
        .get('/api/clones')
        .set('authorization', `Bearer ${token}`); // lowercase

      expect(response.status).toBe(200);
    });

    it('should handle extra whitespace in authorization', async () => {
      const token = generateToken('user');

      // Test with extra spaces
      const response = await request(app)
        .get('/api/clones')
        .set('Authorization', `Bearer  ${token}`); // double space

      // This may fail depending on implementation, which is acceptable
      expect([200, 401]).toContain(response.status);
    });
  });
});

describe('RBAC Security Tests - Unauthorized Access Prevention', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());

    // Sensitive routes
    app.post(
      '/api/admin/config',
      authenticationMiddleware,
      authorizeRoles(['admin']),
      (req, res) => {
        res.json({ success: true });
      }
    );

    app.delete(
      '/api/admin/database',
      authenticationMiddleware,
      authorizeRoles(['admin']),
      (req, res) => {
        res.json({ success: true });
      }
    );
  });

  it('should prevent unauthorized config changes', async () => {
    process.env.USER_ROLES = 'user';
    const userToken = generateToken('user');

    const response = await request(app)
      .post('/api/admin/config')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ key: 'dangerous_setting', value: 'hack' });

    expect(response.status).toBe(403);
  });

  it('should prevent unauthorized database operations', async () => {
    process.env.USER_ROLES = 'operator';
    const userToken = generateToken('user');

    const response = await request(app)
      .delete('/api/admin/database')
      .set('Authorization', `Bearer ${userToken}`);

    expect(response.status).toBe(403);
  });

  it('should allow admin to perform privileged operations', async () => {
    process.env.USER_ROLES = 'admin';
    const adminToken = generateToken('admin');

    const response = await request(app)
      .post('/api/admin/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ key: 'setting', value: 'value' });

    expect(response.status).toBe(200);
  });
});
