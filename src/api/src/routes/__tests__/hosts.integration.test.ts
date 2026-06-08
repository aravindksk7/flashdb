/**
 * Host Management API Integration Tests
 *
 * Tests for Phase 6: Remote Host Handling
 * - Host registration, retrieval, update, deletion
 * - Host validation workflow
 * - Connection testing
 * - Path mapping configuration
 */

import request from 'supertest';
import express, { Express } from 'express';
import hostsRouter from '../hosts';
import { getAuditMetricsService } from '../../services/auditMetricsService';
import logger from '../../logger';

// Mock audit service
jest.mock('../../services/auditMetricsService');
jest.mock('../../logger');

describe('Hosts API Integration Tests', () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      // Mock lock middleware
      req.lock = jest.fn(() => Promise.resolve({ result: {}, lockContext: { waitTimeMs: 0 } }));
      next();
    });
    app.use('/api/hosts', hostsRouter);
  });

  describe('POST /api/hosts - Register Host', () => {
    it('should register a new host successfully', async () => {
      const hostData = {
        name: 'test-host-01',
        fqdn: 'test-host.example.com',
        accessMethod: 'WinRM' as const
      };

      const res = await request(app)
        .post('/api/hosts')
        .send(hostData)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.name).toBe(hostData.name);
      expect(res.body.data.fqdn).toBe(hostData.fqdn);
      expect(res.body.data.accessMethod).toBe(hostData.accessMethod);
    });

    it('should reject missing required fields', async () => {
      const res = await request(app)
        .post('/api/hosts')
        .send({ name: 'test-host' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Missing required fields');
    });

    it('should reject invalid access method', async () => {
      const res = await request(app)
        .post('/api/hosts')
        .send({
          name: 'test-host',
          fqdn: 'test.example.com',
          accessMethod: 'INVALID'
        })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid access method');
    });

    it('should accept all valid access methods', async () => {
      const methods = ['Local', 'WinRM', 'SSH'];

      for (const method of methods) {
        const res = await request(app)
          .post('/api/hosts')
          .send({
            name: `test-${method.toLowerCase()}`,
            fqdn: `${method.toLowerCase()}.example.com`,
            accessMethod: method
          })
          .expect(201);

        expect(res.body.data.accessMethod).toBe(method);
      }
    });
  });

  describe('GET /api/hosts - List All Hosts', () => {
    beforeEach(async () => {
      // Register some test hosts
      const hosts = [
        {
          name: 'host-1',
          fqdn: 'host1.example.com',
          accessMethod: 'WinRM' as const
        },
        {
          name: 'host-2',
          fqdn: 'host2.example.com',
          accessMethod: 'SSH' as const
        }
      ];

      for (const host of hosts) {
        await request(app)
          .post('/api/hosts')
          .send(host);
      }
    });

    it('should return list of all registered hosts', async () => {
      const res = await request(app)
        .get('/api/hosts')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should include host details in response', async () => {
      const res = await request(app)
        .get('/api/hosts')
        .expect(200);

      const host = res.body.data[0];
      expect(host).toHaveProperty('id');
      expect(host).toHaveProperty('name');
      expect(host).toHaveProperty('fqdn');
      expect(host).toHaveProperty('accessMethod');
    });
  });

  describe('GET /api/hosts/:id - Get Host Details', () => {
    let hostId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/hosts')
        .send({
          name: 'test-host',
          fqdn: 'test.example.com',
          accessMethod: 'WinRM'
        });
      hostId = res.body.data.id;
    });

    it('should retrieve host by ID', async () => {
      const res = await request(app)
        .get(`/api/hosts/${hostId}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(hostId);
    });

    it('should return 404 for non-existent host', async () => {
      const res = await request(app)
        .get('/api/hosts/non-existent-id')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Host not found');
    });
  });

  describe('PUT /api/hosts/:id - Update Host', () => {
    let hostId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/hosts')
        .send({
          name: 'original-name',
          fqdn: 'original.example.com',
          accessMethod: 'WinRM'
        });
      hostId = res.body.data.id;
    });

    it('should update host configuration', async () => {
      const res = await request(app)
        .put(`/api/hosts/${hostId}`)
        .send({
          name: 'updated-name',
          fqdn: 'updated.example.com'
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('updated-name');
      expect(res.body.data.fqdn).toBe('updated.example.com');
    });

    it('should validate access method on update', async () => {
      const res = await request(app)
        .put(`/api/hosts/${hostId}`)
        .send({ accessMethod: 'INVALID' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should return 404 for non-existent host', async () => {
      const res = await request(app)
        .put('/api/hosts/non-existent')
        .send({ name: 'updated' })
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('should clear validation cache on update', async () => {
      const res = await request(app)
        .put(`/api/hosts/${hostId}`)
        .send({ name: 'new-name' })
        .expect(200);

      expect(res.body.data.validationState).toBe('Pending');
    });
  });

  describe('DELETE /api/hosts/:id - Delete Host', () => {
    let hostId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/hosts')
        .send({
          name: 'deleteme',
          fqdn: 'deleteme.example.com',
          accessMethod: 'WinRM'
        });
      hostId = res.body.data.id;
    });

    it('should delete host successfully', async () => {
      const deleteRes = await request(app)
        .delete(`/api/hosts/${hostId}`)
        .expect(200);

      expect(deleteRes.body.success).toBe(true);

      // Verify it's deleted
      const getRes = await request(app)
        .get(`/api/hosts/${hostId}`)
        .expect(404);

      expect(getRes.body.success).toBe(false);
    });

    it('should return 404 when deleting non-existent host', async () => {
      const res = await request(app)
        .delete('/api/hosts/non-existent')
        .expect(404);

      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /api/hosts/:id/validate - Validate Host', () => {
    let hostId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/hosts')
        .send({
          name: 'validate-test',
          fqdn: 'validate.example.com',
          accessMethod: 'WinRM'
        });
      hostId = res.body.data.id;
    });

    it('should return validation result', async () => {
      const res = await request(app)
        .post(`/api/hosts/${hostId}/validate`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('hostId');
      expect(res.body.data).toHaveProperty('isValid');
      expect(res.body.data).toHaveProperty('findings');
      expect(res.body.data).toHaveProperty('capabilities');
      expect(Array.isArray(res.body.data.findings)).toBe(true);
      expect(Array.isArray(res.body.data.capabilities)).toBe(true);
    });

    it('should update host validation state', async () => {
      const res = await request(app)
        .post(`/api/hosts/${hostId}/validate`)
        .expect(200);

      const hostRes = await request(app)
        .get(`/api/hosts/${hostId}`)
        .expect(200);

      expect(hostRes.body.data.lastValidatedAt).toBeDefined();
      expect(['Valid', 'Invalid']).toContain(hostRes.body.data.validationState);
    });

    it('should return 404 for non-existent host', async () => {
      const res = await request(app)
        .post('/api/hosts/non-existent/validate')
        .expect(404);

      expect(res.body.success).toBe(false);
    });

    it('should cache validation results', async () => {
      // First validation
      const res1 = await request(app)
        .post(`/api/hosts/${hostId}/validate`)
        .expect(200);

      // Second validation should use cache
      const res2 = await request(app)
        .post(`/api/hosts/${hostId}/validate`)
        .expect(200);

      expect(res1.body.data).toEqual(res2.body.data);
    });
  });

  describe('POST /api/hosts/test - Test Connection', () => {
    it('should test host connection', async () => {
      const res = await request(app)
        .post('/api/hosts/test')
        .send({
          fqdn: 'test.example.com',
          accessMethod: 'WinRM'
        })
        .expect(200);

      expect(res.body).toHaveProperty('success');
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('isValid');
      expect(res.body.data).toHaveProperty('findings');
    });

    it('should reject missing FQDN', async () => {
      const res = await request(app)
        .post('/api/hosts/test')
        .send({ accessMethod: 'WinRM' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('should reject missing access method', async () => {
      const res = await request(app)
        .post('/api/hosts/test')
        .send({ fqdn: 'test.example.com' })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/hosts/:id/status - Get Validation Status', () => {
    let hostId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/hosts')
        .send({
          name: 'status-test',
          fqdn: 'status.example.com',
          accessMethod: 'WinRM'
        });
      hostId = res.body.data.id;
    });

    it('should return validation status', async () => {
      const res = await request(app)
        .get(`/api/hosts/${hostId}/status`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('hostId');
      expect(res.body.data).toHaveProperty('validationState');
      expect(res.body.data).toHaveProperty('lastValidatedAt');
      expect(res.body.data).toHaveProperty('isCached');
    });

    it('should return Pending state for unvalidated host', async () => {
      const res = await request(app)
        .get(`/api/hosts/${hostId}/status`)
        .expect(200);

      expect(res.body.data.validationState).toBe('Pending');
    });

    it('should show cached result info', async () => {
      // Validate first
      await request(app)
        .post(`/api/hosts/${hostId}/validate`)
        .expect(200);

      // Get status
      const res = await request(app)
        .get(`/api/hosts/${hostId}/status`)
        .expect(200);

      expect(res.body.data.isCached).toBe(true);
      expect(res.body.data.cacheAge).toBeGreaterThanOrEqual(0);
      expect(res.body.data.cachedResult).toBeDefined();
    });
  });

  describe('Audit Logging', () => {
    it('should log host registration', async () => {
      const auditMock = getAuditMetricsService as jest.Mock;

      await request(app)
        .post('/api/hosts')
        .send({
          name: 'audit-test',
          fqdn: 'audit.example.com',
          accessMethod: 'WinRM'
        })
        .expect(201);

      expect(auditMock).toBeCalled();
    });

    it('should log host deletion', async () => {
      const createRes = await request(app)
        .post('/api/hosts')
        .send({
          name: 'audit-delete-test',
          fqdn: 'audit-delete.example.com',
          accessMethod: 'WinRM'
        });

      const hostId = createRes.body.data.id;

      const auditMock = getAuditMetricsService as jest.Mock;

      await request(app)
        .delete(`/api/hosts/${hostId}`)
        .expect(200);

      expect(auditMock).toBeCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const res = await request(app)
        .post('/api/hosts')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(res.body).toBeDefined();
    });

    it('should handle concurrent validation requests', async () => {
      const createRes = await request(app)
        .post('/api/hosts')
        .send({
          name: 'concurrent-test',
          fqdn: 'concurrent.example.com',
          accessMethod: 'WinRM'
        });

      const hostId = createRes.body.data.id;

      // Make concurrent requests
      const promises = [
        request(app).post(`/api/hosts/${hostId}/validate`),
        request(app).post(`/api/hosts/${hostId}/validate`)
      ];

      const results = await Promise.all(promises);

      // One should succeed, one should get lock conflict or also succeed
      const successCount = results.filter(r => r.status === 200).length;
      expect(successCount).toBeGreaterThan(0);
    });
  });
});
