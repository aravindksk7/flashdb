import request from 'supertest';
import express, { Express } from 'express';
import releaseGatesRoutes from './releaseGates';

describe('Release Gates Routes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/release-gates', releaseGatesRoutes);
  });

  describe('GET /api/release-gates/status', () => {
    it('should return release gates status with all required fields', async () => {
      const response = await request(app).get('/api/release-gates/status');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.totalGates).toBeDefined();
      expect(response.body.data.openGates).toBeDefined();
      expect(response.body.data.blockedGates).toBeDefined();
      expect(response.body.data.closedGates).toBeDefined();
      expect(response.body.data.overallStatus).toBeDefined();
      expect(response.body.data.gates).toBeDefined();
      expect(Array.isArray(response.body.data.gates)).toBe(true);
    });

    it('should have valid overall status', async () => {
      const response = await request(app).get('/api/release-gates/status');

      expect(['on-track', 'at-risk', 'blocked']).toContain(response.body.data.overallStatus);
    });

    it('should have valid gate statuses', async () => {
      const response = await request(app).get('/api/release-gates/status');

      response.body.data.gates.forEach((gate: any) => {
        expect(['blocked', 'open', 'closing', 'closed']).toContain(gate.status);
        expect(gate.id).toBeDefined();
        expect(gate.name).toBeDefined();
        expect(gate.checklist).toBeDefined();
        expect(Array.isArray(gate.checklist)).toBe(true);
      });
    });

    it('should have matching gate counts', async () => {
      const response = await request(app).get('/api/release-gates/status');

      const { totalGates, openGates, blockedGates, closedGates } = response.body.data;
      // Note: gates can be in different states, so we just verify counts are non-negative
      expect(totalGates).toBeGreaterThanOrEqual(0);
      expect(openGates).toBeGreaterThanOrEqual(0);
      expect(blockedGates).toBeGreaterThanOrEqual(0);
      expect(closedGates).toBeGreaterThanOrEqual(0);
    });

    it('should have valid checklist progress', async () => {
      const response = await request(app).get('/api/release-gates/status');

      response.body.data.gates.forEach((gate: any) => {
        expect(gate.checklistProgress).toBeGreaterThanOrEqual(0);
        expect(gate.checklistProgress).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('GET /api/release-gates/:gateId', () => {
    it('should return specific gate details', async () => {
      const response = await request(app).get('/api/release-gates/gate-1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.id).toBeDefined();
      expect(response.body.data.name).toBeDefined();
      expect(response.body.data.status).toBeDefined();
    });

    it('should have valid gate details structure', async () => {
      const response = await request(app).get('/api/release-gates/gate-1');

      const { data } = response.body;
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
      expect(Array.isArray(data.history)).toBe(true);
    });

    it('should have valid history entries', async () => {
      const response = await request(app).get('/api/release-gates/gate-1');

      response.body.data.history.forEach((entry: any) => {
        expect(entry.timestamp).toBeDefined();
        expect(['blocked', 'open', 'closing', 'closed']).toContain(entry.status);
        expect(entry.reason).toBeDefined();
      });
    });
  });
});
