import request from 'supertest';
import express from 'express';
import healthRoutes from '../routes/health';

const app = express();
app.use(express.json());
app.use('/api/health', healthRoutes);

describe('Health Endpoints - Phase 2 & 4', () => {
  describe('SQL Adapter Status', () => {
    it('GET /api/health/sql-adapter should return adapter status', async () => {
      const response = await request(app).get('/api/health/sql-adapter');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('enabled');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('type');
      expect(response.body.data).toHaveProperty('connectivity');
      expect(response.body.data).toHaveProperty('featureFlagStatus');
      expect(response.body.data).toHaveProperty('lastHealthCheck');
    });

    it('POST /api/health/sql-adapter/test should test connectivity', async () => {
      const response = await request(app)
        .post('/api/health/sql-adapter/test')
        .send({ serverName: 'localhost', databaseName: 'master' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('serverName');
      expect(response.body.data).toHaveProperty('databaseName');
      expect(response.body.data).toHaveProperty('connectionTime');
      expect(response.body.data).toHaveProperty('dbtoolsVersion');
      expect(response.body.data).toHaveProperty('sqlVersion');
    });

    it('POST /api/health/sql-adapter/test should reject missing serverName', async () => {
      const response = await request(app)
        .post('/api/health/sql-adapter/test')
        .send({ databaseName: 'master' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('PUT /api/health/sql-adapter/toggle should toggle adapter status', async () => {
      const response = await request(app)
        .put('/api/health/sql-adapter/toggle')
        .send({ enabled: false });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('enabled');
      expect(response.body.data.enabled).toBe(false);
    });

    it('PUT /api/health/sql-adapter/toggle should reject non-boolean enabled', async () => {
      const response = await request(app)
        .put('/api/health/sql-adapter/toggle')
        .send({ enabled: 'yes' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('GET /api/health/sql-adapter/feature-flag should return feature flag status', async () => {
      const response = await request(app).get(
        '/api/health/sql-adapter/feature-flag'
      );

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('name');
      expect(response.body.data).toHaveProperty('enabled');
      expect(response.body.data).toHaveProperty('lastUpdated');
      expect(response.body.data).toHaveProperty('rolloutPercentage');
    });
  });

  describe('VHD Operations', () => {
    it('GET /api/health/vhd-operations should return VHD status', async () => {
      const response = await request(app).get('/api/health/vhd-operations');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('enabled');
      expect(response.body.data).toHaveProperty('diskSpaceAvailable');
      expect(response.body.data).toHaveProperty('diskSpaceTotal');
      expect(response.body.data).toHaveProperty('diskSpacePercentUsed');
      expect(response.body.data).toHaveProperty('chainValidationSupported');
      expect(response.body.data).toHaveProperty('capabilities');
      expect(Array.isArray(response.body.data.capabilities)).toBe(true);
    });

    it('POST /api/health/vhd-operations/validate-chain should validate VHD chain', async () => {
      const response = await request(app)
        .post('/api/health/vhd-operations/validate-chain')
        .send({ vhdPath: 'C:\\ClonePool\\clone_001\\disk.vhdx' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('vhdPath');
      expect(response.body.data).toHaveProperty('isValid');
      expect(response.body.data).toHaveProperty('chainLength');
      expect(response.body.data).toHaveProperty('parentChain');
      expect(Array.isArray(response.body.data.parentChain)).toBe(true);
    });

    it('POST /api/health/vhd-operations/validate-chain should reject missing vhdPath', async () => {
      const response = await request(app)
        .post('/api/health/vhd-operations/validate-chain')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('GET /api/clones/:cloneId/vhd-info should return VHD info', async () => {
      const response = await request(app).get('/api/clones/clone-001/vhd-info');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('cloneId');
      expect(response.body.data).toHaveProperty('vhdPath');
      expect(response.body.data).toHaveProperty('size');
      expect(response.body.data).toHaveProperty('parentPath');
      expect(response.body.data).toHaveProperty('mountPoint');
      expect(response.body.data).toHaveProperty('isMounted');
      expect(response.body.data).toHaveProperty('health');
    });

    it('GET /api/health/disk-space should return disk space info', async () => {
      const response = await request(app).get('/api/health/disk-space');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('locations');
      expect(Array.isArray(response.body.data.locations)).toBe(true);
      expect(response.body.data).toHaveProperty('lastCheck');

      // Validate location structure
      response.body.data.locations.forEach((location: any) => {
        expect(location).toHaveProperty('path');
        expect(location).toHaveProperty('total');
        expect(location).toHaveProperty('used');
        expect(location).toHaveProperty('available');
        expect(location).toHaveProperty('percentUsed');
        expect(location).toHaveProperty('warning');
      });
    });
  });

  describe('Error Handling', () => {
    it('should return error for invalid endpoint', async () => {
      const response = await request(app).get('/api/health/invalid-endpoint');
      expect(response.status).toBe(404);
    });

    it('should handle server errors gracefully', async () => {
      const response = await request(app)
        .post('/api/health/sql-adapter/test')
        .send(null);

      // Should either be 400 (bad request) or 500 (server error)
      expect([400, 500]).toContain(response.status);
    });
  });

  describe('Response Format', () => {
    it('all responses should include success flag', async () => {
      const endpoints = [
        { method: 'get', path: '/api/health/sql-adapter' },
        { method: 'get', path: '/api/health/vhd-operations' },
        { method: 'get', path: '/api/health/disk-space' }
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method as any](
          endpoint.path
        );
        expect(response.body).toHaveProperty('success');
      }
    });

    it('all responses should include timestamp', async () => {
      const response = await request(app).get('/api/health/sql-adapter');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
