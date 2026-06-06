import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { PgStateManager, getPgStateManager, initializePgStateManager } from '../pgStateManager';
import { getSqlClient, initializeSqlClient } from '../sqlClient';

/**
 * PostgreSQL State Manager Unit Tests
 * Tests state operations, TTL, cleanup, and watch mechanisms
 */
describe('PgStateManager', () => {
  let stateManager: PgStateManager;

  beforeAll(async () => {
    try {
      // Initialize SQL client first
      await initializeSqlClient();
    } catch (error: any) {
      console.log('SQL Server not available for testing');
    }
  });

  beforeEach(() => {
    // Create fresh instance for each test
    stateManager = new PgStateManager();
  });

  afterEach(async () => {
    // Cleanup after each test
    if (stateManager) {
      try {
        await stateManager.shutdown();
      } catch (error) {
        // Ignore shutdown errors
      }
    }
  });

  describe('Initialization', () => {
    it('should create a PgStateManager instance', () => {
      expect(stateManager).toBeDefined();
      expect(stateManager).toBeInstanceOf(PgStateManager);
    });

    it('should initialize successfully', async () => {
      try {
        await stateManager.initialize();
        expect(stateManager).toBeDefined();
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          console.log('Skipping - SQL Server unavailable');
        } else {
          throw error;
        }
      }
    });

    it('should be idempotent (initialize twice)', async () => {
      try {
        await stateManager.initialize();
        await stateManager.initialize();
        expect(stateManager).toBeDefined();
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          console.log('Skipping - SQL Server unavailable');
        }
      }
    });
  });

  describe('State Operations - setState/getState', () => {
    beforeEach(async () => {
      try {
        await stateManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should set and get simple string state', async () => {
      try {
        const key = 'test:string';
        const value = 'hello world';

        await stateManager.setState(key, value);
        const retrieved = await stateManager.getState(key);

        expect(retrieved).toBe(value);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return; // Skip test
        }
        throw error;
      }
    });

    it('should set and get JSON object state', async () => {
      try {
        const key = 'test:json';
        const value = { id: 1, name: 'test', active: true };

        await stateManager.setState(key, value);
        const retrieved = await stateManager.getState(key);

        expect(retrieved).toEqual(value);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should set and get array state', async () => {
      try {
        const key = 'test:array';
        const value = [1, 2, 3, 'four', { five: 5 }];

        await stateManager.setState(key, value);
        const retrieved = await stateManager.getState(key);

        expect(retrieved).toEqual(value);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should return null for non-existent key', async () => {
      try {
        const retrieved = await stateManager.getState('nonexistent:key');
        expect(retrieved).toBeNull();
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should handle UPSERT (update existing state)', async () => {
      try {
        const key = 'test:upsert';
        const value1 = { version: 1 };
        const value2 = { version: 2 };

        await stateManager.setState(key, value1);
        let retrieved = await stateManager.getState(key);
        expect(retrieved).toEqual(value1);

        await stateManager.setState(key, value2);
        retrieved = await stateManager.getState(key);
        expect(retrieved).toEqual(value2);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('State TTL and Expiration', () => {
    beforeEach(async () => {
      try {
        await stateManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should set state with TTL', async () => {
      try {
        const key = 'test:ttl';
        const value = { data: 'temporary' };
        const ttlSeconds = 3600; // 1 hour

        await stateManager.setState(key, value, ttlSeconds);
        const retrieved = await stateManager.getState(key);

        expect(retrieved).toEqual(value);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should return null for expired state', async () => {
      try {
        const key = 'test:expired';
        const value = { data: 'temporary' };
        const ttlSeconds = -1; // Already expired

        await stateManager.setState(key, value, ttlSeconds);
        const retrieved = await stateManager.getState(key);

        expect(retrieved).toBeNull();
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should set state with no expiration (null TTL)', async () => {
      try {
        const key = 'test:no_ttl';
        const value = { data: 'permanent' };

        await stateManager.setState(key, value, undefined);
        const retrieved = await stateManager.getState(key);

        expect(retrieved).toEqual(value);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('State Deletion', () => {
    beforeEach(async () => {
      try {
        await stateManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should delete state', async () => {
      try {
        const key = 'test:delete';
        const value = { data: 'to delete' };

        await stateManager.setState(key, value);
        let retrieved = await stateManager.getState(key);
        expect(retrieved).toBeDefined();

        await stateManager.deleteState(key);
        retrieved = await stateManager.getState(key);
        expect(retrieved).toBeNull();
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should handle deleting non-existent state', async () => {
      try {
        // Should not throw
        await stateManager.deleteState('nonexistent:key');
        expect(true).toBe(true);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('State Statistics', () => {
    beforeEach(async () => {
      try {
        await stateManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should get state statistics', async () => {
      try {
        // Set some test state
        await stateManager.setState('stat:1', { value: 1 });
        await stateManager.setState('stat:2', { value: 2 });

        const stats = await stateManager.getStats();

        expect(stats).toBeDefined();
        expect(stats.totalKeys).toBeGreaterThanOrEqual(2);
        expect(stats.expiredKeys).toBeGreaterThanOrEqual(0);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Get All State', () => {
    beforeEach(async () => {
      try {
        await stateManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should get all state', async () => {
      try {
        const key1 = 'getall:1';
        const key2 = 'getall:2';

        await stateManager.setState(key1, { data: 1 });
        await stateManager.setState(key2, { data: 2 });

        const allState = await stateManager.getAllState();

        expect(allState).toBeDefined();
        expect(typeof allState).toBe('object');
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should filter state by prefix', async () => {
      try {
        const prefix = 'filter:';
        const key1 = prefix + '1';
        const key2 = prefix + '2';

        await stateManager.setState(key1, { value: 1 });
        await stateManager.setState(key2, { value: 2 });

        const filtered = await stateManager.getAllState(prefix);

        expect(filtered).toBeDefined();
        expect(typeof filtered).toBe('object');
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Health Checks', () => {
    beforeEach(async () => {
      try {
        await stateManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should report health status', async () => {
      try {
        const healthy = await stateManager.isHealthy();
        expect(typeof healthy).toBe('boolean');
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Singleton Pattern', () => {
    it('should return singleton instance', () => {
      const instance1 = getPgStateManager();
      const instance2 = getPgStateManager();

      expect(instance1).toBe(instance2);
    });

    it('should initialize singleton', async () => {
      try {
        const instance = await initializePgStateManager();
        expect(instance).toBeDefined();
        expect(instance).toBeInstanceOf(PgStateManager);
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });
  });

  describe('Shutdown', () => {
    it('should shutdown gracefully', async () => {
      try {
        await stateManager.initialize();
        await stateManager.shutdown();
        expect(true).toBe(true);
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });
  });
});
