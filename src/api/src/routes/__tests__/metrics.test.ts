import request from 'supertest';
import express, { Express } from 'express';
import metricsRoutes from '../metrics';

describe('Metrics Routes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/metrics', metricsRoutes);
  });

  describe('GET /api/metrics/health', () => {
    it('should return health metrics with required fields', async () => {
      const response = await request(app).get('/api/metrics/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.totalClones).toBeDefined();
      expect(response.body.data.healthyClones).toBeDefined();
      expect(response.body.data.unhealthyClones).toBeDefined();
      expect(response.body.data.healthScore).toBeDefined();
      expect(response.body.data.lastValidationTimestamp).toBeDefined();
      expect(response.body.data.validationsFailed).toBeDefined();
      expect(response.body.data.validationsSuccess).toBeDefined();
      expect(response.body.data.averageValidationTimeSeconds).toBeDefined();
    });

    it('should return valid health score range (0-100)', async () => {
      const response = await request(app).get('/api/metrics/health');

      expect(response.body.data.healthScore).toBeGreaterThanOrEqual(0);
      expect(response.body.data.healthScore).toBeLessThanOrEqual(100);
    });

    it('should have non-negative clone counts', async () => {
      const response = await request(app).get('/api/metrics/health');

      expect(response.body.data.totalClones).toBeGreaterThanOrEqual(0);
      expect(response.body.data.healthyClones).toBeGreaterThanOrEqual(0);
      expect(response.body.data.unhealthyClones).toBeGreaterThanOrEqual(0);
    });

    it('should return valid ISO timestamp for lastValidationTimestamp', async () => {
      const response = await request(app).get('/api/metrics/health');

      const timestamp = response.body.data.lastValidationTimestamp;
      expect(timestamp).toBeDefined();
      expect(new Date(timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('GET /api/metrics/repair', () => {
    it('should return repair metrics with required fields', async () => {
      const response = await request(app).get('/api/metrics/repair');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.totalRepairs).toBeDefined();
      expect(response.body.data.successfulRepairs).toBeDefined();
      expect(response.body.data.failedRepairs).toBeDefined();
      expect(response.body.data.successRate).toBeDefined();
      expect(response.body.data.averageRepairTimeSeconds).toBeDefined();
      expect(response.body.data.repairsByStatus).toBeDefined();
      expect(response.body.data.lastRepairTimestamp).toBeDefined();
    });

    it('should return valid success rate range (0-100)', async () => {
      const response = await request(app).get('/api/metrics/repair');

      expect(response.body.data.successRate).toBeGreaterThanOrEqual(0);
      expect(response.body.data.successRate).toBeLessThanOrEqual(100);
    });

    it('should have non-negative repair counts', async () => {
      const response = await request(app).get('/api/metrics/repair');

      expect(response.body.data.totalRepairs).toBeGreaterThanOrEqual(0);
      expect(response.body.data.successfulRepairs).toBeGreaterThanOrEqual(0);
      expect(response.body.data.failedRepairs).toBeGreaterThanOrEqual(0);
    });

    it('should return repairsByStatus as array', async () => {
      const response = await request(app).get('/api/metrics/repair');

      expect(Array.isArray(response.body.data.repairsByStatus)).toBe(true);
    });

    it('should return valid ISO timestamp for lastRepairTimestamp', async () => {
      const response = await request(app).get('/api/metrics/repair');

      const timestamp = response.body.data.lastRepairTimestamp;
      expect(timestamp).toBeDefined();
      expect(new Date(timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('GET /api/metrics/health-trend', () => {
    it('should return health trend data array', async () => {
      const response = await request(app).get('/api/metrics/health-trend?timeRange=24h');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should return valid trend data with required fields', async () => {
      const response = await request(app).get('/api/metrics/health-trend?timeRange=24h');

      if (response.body.data.length > 0) {
        response.body.data.forEach((point: any) => {
          expect(point.timestamp).toBeDefined();
          expect(point.healthScore).toBeDefined();
          expect(point.healthyClones).toBeDefined();
          expect(point.unhealthyClones).toBeDefined();
        });
      }
    });

    it('should validate health score in trend data (0-100)', async () => {
      const response = await request(app).get('/api/metrics/health-trend?timeRange=24h');

      response.body.data.forEach((point: any) => {
        expect(point.healthScore).toBeGreaterThanOrEqual(0);
        expect(point.healthScore).toBeLessThanOrEqual(100);
      });
    });

    it('should accept 24h timeRange', async () => {
      const response = await request(app).get('/api/metrics/health-trend?timeRange=24h');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should accept 7d timeRange', async () => {
      const response = await request(app).get('/api/metrics/health-trend?timeRange=7d');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should accept 30d timeRange', async () => {
      const response = await request(app).get('/api/metrics/health-trend?timeRange=30d');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject invalid timeRange with 400 status', async () => {
      const response = await request(app).get('/api/metrics/health-trend?timeRange=invalid');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should default to 24h when timeRange not provided', async () => {
      const response = await request(app).get('/api/metrics/health-trend');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return valid ISO timestamps in trend data', async () => {
      const response = await request(app).get('/api/metrics/health-trend?timeRange=24h');

      response.body.data.forEach((point: any) => {
        expect(point.timestamp).toBeDefined();
        expect(new Date(point.timestamp).getTime()).toBeGreaterThan(0);
      });
    });
  });
});
