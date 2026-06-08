import request from 'supertest';
import express, { Express } from 'express';
import complianceRoutes from './compliance';

describe('Compliance Routes', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/contracts', complianceRoutes);
  });

  describe('GET /api/contracts/compliance', () => {
    it('should return compliance status with all required fields', async () => {
      const response = await request(app).get('/api/contracts/compliance');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.overallCompliance).toBeDefined();
      expect(response.body.data.compliancePercentage).toBeDefined();
      expect(response.body.data.testsPassing).toBeDefined();
      expect(response.body.data.testsFailing).toBeDefined();
      expect(response.body.data.contractTests).toBeDefined();
      expect(Array.isArray(response.body.data.contractTests)).toBe(true);
    });

    it('should have valid compliance percentage', async () => {
      const response = await request(app).get('/api/contracts/compliance');

      expect(response.body.data.compliancePercentage).toBeGreaterThanOrEqual(0);
      expect(response.body.data.compliancePercentage).toBeLessThanOrEqual(100);
    });

    it('should have matching test counts', async () => {
      const response = await request(app).get('/api/contracts/compliance');

      const { testsPassing, testsFailing, testsWarning } = response.body.data;
      const total = testsPassing + testsFailing + testsWarning;

      expect(total).toBe(response.body.data.contractTests.length);
    });

    it('should have valid contract test entries', async () => {
      const response = await request(app).get('/api/contracts/compliance');

      response.body.data.contractTests.forEach((test: any) => {
        expect(test.name).toBeDefined();
        expect(['passing', 'failing', 'warning']).toContain(test.status);
        expect(test.message).toBeDefined();
        expect(test.lastChecked).toBeDefined();
      });
    });
  });

  describe('GET /api/contracts/compliance/detailed', () => {
    it('should return detailed compliance report', async () => {
      const response = await request(app).get('/api/contracts/compliance/detailed');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.period).toBeDefined();
      expect(response.body.data.summaryMetrics).toBeDefined();
      expect(response.body.data.categoryBreakdown).toBeDefined();
      expect(Array.isArray(response.body.data.categoryBreakdown)).toBe(true);
    });

    it('should have valid category breakdown', async () => {
      const response = await request(app).get('/api/contracts/compliance/detailed');

      response.body.data.categoryBreakdown.forEach((category: any) => {
        expect(category.category).toBeDefined();
        expect(category.tests).toBeDefined();
        expect(category.passing).toBeDefined();
        expect(category.failing).toBeDefined();
        expect(category.warning).toBeDefined();
        expect(category.complianceScore).toBeGreaterThanOrEqual(0);
        expect(category.complianceScore).toBeLessThanOrEqual(100);
      });
    });

    it('should have valid trends', async () => {
      const response = await request(app).get('/api/contracts/compliance/detailed');

      const { trends } = response.body.data;
      expect(trends.last7Days).toBeGreaterThanOrEqual(0);
      expect(trends.last30Days).toBeGreaterThanOrEqual(0);
      expect(trends.last90Days).toBeGreaterThanOrEqual(0);
    });
  });
});
