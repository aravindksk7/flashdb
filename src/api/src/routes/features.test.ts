import request from 'supertest';
import express, { Express } from 'express';
import featuresRoutes from './features';

describe('Features Routes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/features', featuresRoutes);
  });

  describe('GET /api/features', () => {
    it('should return all feature flags', async () => {
      const response = await request(app).get('/api/features');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.totalFlags).toBeDefined();
      expect(response.body.data.enabledCount).toBeDefined();
      expect(response.body.data.betaCount).toBeDefined();
      expect(response.body.data.disabledCount).toBeDefined();
      expect(response.body.data.flags).toBeDefined();
      expect(Array.isArray(response.body.data.flags)).toBe(true);
    });

    it('should have valid feature flag entries', async () => {
      const response = await request(app).get('/api/features');

      response.body.data.flags.forEach((flag: any) => {
        expect(flag.name).toBeDefined();
        expect(flag.displayName).toBeDefined();
        expect(flag.description).toBeDefined();
        expect(['enabled', 'disabled', 'beta', 'deprecated']).toContain(flag.status);
        expect(flag.rolloutPercentage).toBeGreaterThanOrEqual(0);
        expect(flag.rolloutPercentage).toBeLessThanOrEqual(100);
        expect(flag.phase).toBeDefined();
        expect(typeof flag.enabled).toBe('boolean');
      });
    });

    it('should have valid rollout percentages', async () => {
      const response = await request(app).get('/api/features');

      response.body.data.flags.forEach((flag: any) => {
        if (flag.status === 'disabled') {
          expect(flag.rolloutPercentage).toBe(0);
        } else if (flag.status === 'enabled') {
          expect(flag.rolloutPercentage).toBe(100);
        }
      });
    });
  });

  describe('GET /api/features/:flagName', () => {
    it('should return specific feature flag details', async () => {
      const response = await request(app).get('/api/features/TEST_FLAG');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.name).toBe('TEST_FLAG');
      expect(response.body.data.displayName).toBeDefined();
    });

    it('should have valid feature flag structure', async () => {
      const response = await request(app).get('/api/features/TEST_FLAG');

      const { data } = response.body;
      expect(data.description).toBeDefined();
      expect(['enabled', 'disabled', 'beta', 'deprecated']).toContain(data.status);
      expect(data.rolloutPercentage).toBeGreaterThanOrEqual(0);
      expect(data.rolloutPercentage).toBeLessThanOrEqual(100);
    });
  });

  describe('GET /api/features/:flagName/rollout', () => {
    it('should return rollout progress', async () => {
      const response = await request(app).get('/api/features/TEST_FLAG/rollout');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.flagName).toBe('TEST_FLAG');
      expect(response.body.data.currentPercentage).toBeDefined();
      expect(response.body.data.targetPercentage).toBeDefined();
      expect(response.body.data.hourlyProgress).toBeDefined();
      expect(Array.isArray(response.body.data.hourlyProgress)).toBe(true);
    });

    it('should have valid rollout progress structure', async () => {
      const response = await request(app).get('/api/features/TEST_FLAG/rollout');

      const { data } = response.body;
      expect(data.usersOnNewVersion).toBeGreaterThanOrEqual(0);
      expect(data.usersOnOldVersion).toBeGreaterThanOrEqual(0);
      expect(data.totalUsers).toBe(data.usersOnNewVersion + data.usersOnOldVersion);
      expect(data.errorRate).toBeDefined();
      expect(data.performanceMetrics).toBeDefined();
    });
  });

  describe('PUT /api/features/:flagName', () => {
    it('should update feature flag rollout percentage', async () => {
      const response = await request(app)
        .put('/api/features/TEST_FLAG')
        .send({ rolloutPercentage: 75 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.rolloutPercentage).toBe(75);
    });

    it('should reject invalid rollout percentage', async () => {
      const response = await request(app)
        .put('/api/features/TEST_FLAG')
        .send({ rolloutPercentage: 150 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should reject negative rollout percentage', async () => {
      const response = await request(app)
        .put('/api/features/TEST_FLAG')
        .send({ rolloutPercentage: -10 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('should update feature flag status', async () => {
      const response = await request(app)
        .put('/api/features/TEST_FLAG')
        .send({ status: 'beta' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject invalid status', async () => {
      const response = await request(app)
        .put('/api/features/TEST_FLAG')
        .send({ status: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/features/:flagName/history', () => {
    it('should return feature flag history', async () => {
      const response = await request(app).get('/api/features/TEST_FLAG/history');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.flagName).toBe('TEST_FLAG');
      expect(response.body.data.history).toBeDefined();
      expect(Array.isArray(response.body.data.history)).toBe(true);
    });

    it('should have valid history entries', async () => {
      const response = await request(app).get('/api/features/TEST_FLAG/history');

      response.body.data.history.forEach((entry: any) => {
        expect(entry.timestamp).toBeDefined();
        expect(['enabled', 'disabled', 'rollout_updated']).toContain(entry.action);
        expect(entry.previousValue).toBeDefined();
        expect(entry.newValue).toBeDefined();
        expect(entry.changedBy).toBeDefined();
      });
    });
  });
});
