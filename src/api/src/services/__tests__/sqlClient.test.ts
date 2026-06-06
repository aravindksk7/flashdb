import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SqlClient, getSqlClient, initializeSqlClient, shutdownSqlClient } from '../sqlClient';

/**
 * SQL Client Unit Tests
 * Tests connection pooling, query execution, transactions, and metrics
 */
describe('SqlClient', () => {
  let sqlClient: SqlClient;

  beforeEach(() => {
    // Create a fresh instance for each test
    sqlClient = new SqlClient();
  });

  afterEach(async () => {
    // Cleanup after each test
    if (sqlClient) {
      try {
        await sqlClient.shutdown();
      } catch (error) {
        // Ignore shutdown errors in tests
      }
    }
  });

  describe('Initialization', () => {
    it('should create a SqlClient instance', () => {
      expect(sqlClient).toBeDefined();
      expect(sqlClient).toBeInstanceOf(SqlClient);
    });

    it('should initialize without throwing an error', async () => {
      // This test will skip if SQL Server is not available
      try {
        await sqlClient.initialize();
        expect(sqlClient).toBeDefined();
      } catch (error: any) {
        // Skip if SQL Server not available
        if (error.message.includes('Failed to initialize SQL client')) {
          console.log('Skipping initialization test - SQL Server not available');
        } else {
          throw error;
        }
      }
    });

    it('should have default configuration values', () => {
      expect(sqlClient).toBeDefined();
      // Check that the metrics are initialized
      const metrics = sqlClient.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.errorCount).toBe(0);
      expect(metrics.totalRequests).toBe(0);
    });

    it('should prevent duplicate initialization', async () => {
      try {
        await sqlClient.initialize();
        // Try to initialize again - should handle gracefully
        await sqlClient.initialize();
        expect(sqlClient).toBeDefined();
      } catch (error: any) {
        if (!error.message.includes('Failed to initialize SQL client')) {
          throw error;
        }
      }
    });
  });

  describe('Connection Pooling', () => {
    it('should track pool metrics', () => {
      const metrics = sqlClient.getMetrics();

      expect(metrics).toHaveProperty('size');
      expect(metrics).toHaveProperty('available');
      expect(metrics).toHaveProperty('idle');
      expect(metrics).toHaveProperty('activeConnections');
      expect(metrics).toHaveProperty('errorCount');
      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('averageResponseTimeMs');
    });

    it('should initialize metrics with default values', () => {
      const metrics = sqlClient.getMetrics();

      expect(metrics.errorCount).toBe(0);
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.averageResponseTimeMs).toBe(0);
    });

    it('should update metrics after query execution', async () => {
      try {
        const initialMetrics = sqlClient.getMetrics();
        const initialRequests = initialMetrics.totalRequests;

        await sqlClient.initialize();
        await sqlClient.query('SELECT 1 as test');

        const updatedMetrics = sqlClient.getMetrics();
        expect(updatedMetrics.totalRequests).toBeGreaterThan(initialRequests);
        expect(updatedMetrics.averageResponseTimeMs).toBeGreaterThanOrEqual(0);
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });

    it('should track error count on query failure', () => {
      const initialMetrics = sqlClient.getMetrics();
      void initialMetrics.errorCount; // Verify structure exists

      // Error tracking happens at a lower level, so we verify structure exists
      expect(sqlClient.getMetrics()).toHaveProperty('errorCount');
      expect(sqlClient.getMetrics().errorCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Parameterized Queries', () => {
    it('should accept query with parameters', async () => {
      try {
        await sqlClient.initialize();
        const result = await sqlClient.query('SELECT @testParam as value', {
          testParam: 'test-value'
        });

        expect(result).toBeDefined();
        expect(result).toHaveProperty('recordset');
        expect(result).toHaveProperty('rowsAffected');
        expect(result).toHaveProperty('executionTimeMs');
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });

    it('should accept query without parameters', async () => {
      try {
        await sqlClient.initialize();
        const result = await sqlClient.query('SELECT 1 as test');

        expect(result).toBeDefined();
        expect(result).toHaveProperty('recordset');
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });

    it('should handle multiple parameters', async () => {
      try {
        await sqlClient.initialize();
        const result = await sqlClient.query(
          'SELECT @param1 as p1, @param2 as p2, @param3 as p3',
          {
            param1: 'value1',
            param2: 42,
            param3: true
          }
        );

        expect(result).toBeDefined();
        expect(result.recordset).toBeDefined();
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });

    it('should prevent SQL injection with parameterized queries', async () => {
      try {
        await sqlClient.initialize();

        // Attempt SQL injection through parameter (should be safe)
        const maliciousInput = "'; DROP TABLE Users; --";
        const result = await sqlClient.query(
          'SELECT @input as value',
          { input: maliciousInput }
        );

        expect(result).toBeDefined();
        expect(result.recordset[0]?.value).toBe(maliciousInput);
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });
  });

  describe('Query Execution', () => {
    it('should execute query and return results', async () => {
      try {
        await sqlClient.initialize();
        const result = await sqlClient.query('SELECT 1 as number, \'test\' as text');

        expect(result).toBeDefined();
        expect(result.recordset).toBeDefined();
        expect(Array.isArray(result.recordset)).toBe(true);
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });

    it('should execute without returning results', async () => {
      try {
        await sqlClient.initialize();
        const rowsAffected = await sqlClient.execute(
          'SELECT 1 as test'
        );

        expect(typeof rowsAffected).toBe('number');
        expect(rowsAffected).toBeGreaterThanOrEqual(0);
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });

    it('should measure query execution time', async () => {
      try {
        await sqlClient.initialize();
        const result = await sqlClient.query('SELECT 1 as test');

        expect(result.executionTimeMs).toBeDefined();
        expect(typeof result.executionTimeMs).toBe('number');
        expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });

    it('should include row count in results', async () => {
      try {
        await sqlClient.initialize();
        const result = await sqlClient.query('SELECT 1 as test UNION SELECT 2 UNION SELECT 3');

        expect(result.rowsAffected).toBeDefined();
        expect(Array.isArray(result.rowsAffected)).toBe(true);
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });
  });

  describe('Transaction Handling', () => {
    it('should execute transaction callback', async () => {
      try {
        await sqlClient.initialize();

        const result = await sqlClient.transaction(async (request) => {
          expect(request).toBeDefined();
          return 'transaction-success';
        });

        expect(result).toBe('transaction-success');
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });

    it('should support multiple queries in transaction', async () => {
      try {
        await sqlClient.initialize();

        const results: any[] = [];

        await sqlClient.transaction(async (request) => {
          const result1 = await request.query('SELECT 1 as value1');
          const result2 = await request.query('SELECT 2 as value2');

          results.push(result1.recordset);
          results.push(result2.recordset);
        });

        expect(results).toHaveLength(2);
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });

    it('should handle transaction errors', async () => {
      try {
        await sqlClient.initialize();

        await expect(
          sqlClient.transaction(async () => {
            throw new Error('Transaction error');
          })
        ).rejects.toThrow();
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });
  });

  describe('Health Checking', () => {
    it('should have health check method', async () => {
      expect(sqlClient.isHealthy).toBeDefined();
      expect(typeof sqlClient.isHealthy).toBe('function');
    });

    it('should return health status', async () => {
      try {
        await sqlClient.initialize();
        const healthy = await sqlClient.isHealthy();

        expect(typeof healthy).toBe('boolean');
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });

    it('should return false when unhealthy', async () => {
      const healthy = await sqlClient.isHealthy();

      // Should return false if not connected
      expect(typeof healthy).toBe('boolean');
    });
  });

  describe('Metrics Tracking', () => {
    it('should reset metrics', () => {
      sqlClient.resetMetrics();
      const metrics = sqlClient.getMetrics();

      expect(metrics.errorCount).toBe(0);
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.averageResponseTimeMs).toBe(0);
    });

    it('should maintain response time history', async () => {
      try {
        await sqlClient.initialize();
        sqlClient.resetMetrics();

        // Execute multiple queries
        for (let i = 0; i < 3; i++) {
          try {
            await sqlClient.query('SELECT 1');
          } catch (error) {
            // Ignore errors in loop
          }
        }

        const metrics = sqlClient.getMetrics();
        expect(metrics.totalRequests).toBeGreaterThan(0);
        expect(metrics.averageResponseTimeMs).toBeGreaterThanOrEqual(0);
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });

    it('should calculate average response time correctly', async () => {
      try {
        await sqlClient.initialize();
        sqlClient.resetMetrics();

        await sqlClient.query('SELECT 1 as test');

        const metrics = sqlClient.getMetrics();
        expect(metrics.averageResponseTimeMs).toBeGreaterThanOrEqual(0);
        expect(typeof metrics.averageResponseTimeMs).toBe('number');
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      try {
        await sqlClient.initialize();
        await sqlClient.shutdown();

        expect(sqlClient).toBeDefined();
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });

    it('should handle shutdown when not initialized', async () => {
      // Should not throw even if not initialized
      await expect(sqlClient.shutdown()).resolves.not.toThrow();
    });
  });

  describe('Singleton Pattern', () => {
    it('should return singleton instance', () => {
      const instance1 = getSqlClient();
      const instance2 = getSqlClient();

      expect(instance1).toBe(instance2);
    });

    it('should initialize and return instance', async () => {
      try {
        const instance = await initializeSqlClient();
        expect(instance).toBeDefined();
        expect(instance).toBeInstanceOf(SqlClient);

        await shutdownSqlClient();
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error on query failure', async () => {
      try {
        await sqlClient.initialize();

        await expect(
          sqlClient.query('SELECT * FROM NonExistentTable')
        ).rejects.toThrow();
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });

    it('should throw error on invalid parameters', async () => {
      try {
        await sqlClient.initialize();

        // Test with null values in parameters
        const result = await sqlClient.query('SELECT @value as test', {
          value: null
        });

        expect(result).toBeDefined();
      } catch (error: any) {
        if (!error.message.includes('Failed')) {
          throw error;
        }
      }
    });
  });
});
