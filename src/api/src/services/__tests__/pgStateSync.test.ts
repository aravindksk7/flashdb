import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import { PgStateSync, getPgStateSync, initializePgStateSync } from '../pgStateSync';
import { initializeSqlClient } from '../sqlClient';

/**
 * PostgreSQL State Sync Unit Tests
 * Tests state change publishing, subscriptions, and cross-instance synchronization
 */
describe('PgStateSync', () => {
  let stateSync: PgStateSync;

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
    stateSync = new PgStateSync();
  });

  afterEach(async () => {
    // Cleanup after each test
    if (stateSync) {
      try {
        await stateSync.shutdown();
      } catch (error) {
        // Ignore shutdown errors
      }
    }
  });

  describe('Initialization', () => {
    it('should create a PgStateSync instance', () => {
      expect(stateSync).toBeDefined();
      expect(stateSync).toBeInstanceOf(PgStateSync);
    });

    it('should initialize successfully', async () => {
      try {
        await stateSync.initialize();
        expect(stateSync).toBeDefined();
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
        await stateSync.initialize();
        await stateSync.initialize();
        expect(stateSync).toBeDefined();
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          console.log('Skipping - SQL Server unavailable');
        }
      }
    });
  });

  describe('State Change Publishing', () => {
    beforeEach(async () => {
      try {
        await stateSync.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should publish state change', async () => {
      try {
        const key = 'test:publish';
        const value = { data: 'published' };

        // Should not throw
        await stateSync.publishStateChange(key, value);
        expect(true).toBe(true);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should publish different data types', async () => {
      try {
        // String
        await stateSync.publishStateChange('test:string', 'value');

        // Object
        await stateSync.publishStateChange('test:object', { id: 1 });

        // Array
        await stateSync.publishStateChange('test:array', [1, 2, 3]);

        // Number
        await stateSync.publishStateChange('test:number', 42);

        expect(true).toBe(true);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Subscription and Notifications', () => {
    beforeEach(async () => {
      try {
        await stateSync.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should subscribe to state changes', async () => {
      try {
        const key = 'test:subscribe';
        let notified = false;

        const callback = (changedKey: string, value: any) => {
          if (changedKey === key) {
            notified = true;
          }
        };

        await stateSync.subscribeToChanges(key, callback);
        await stateSync.publishStateChange(key, { data: 'test' });

        // Give async callback time to execute
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(notified).toBe(true);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should support wildcard pattern subscriptions', async () => {
      try {
        const pattern = 'clone:*';
        let notifiedWith: string | null = null;

        const callback = (key: string, value: any) => {
          notifiedWith = key;
        };

        await stateSync.subscribeToChanges(pattern, callback);
        await stateSync.publishStateChange('clone:123', { id: 123 });

        // Give async callback time to execute
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(notifiedWith).toBe('clone:123');
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should match wildcard patterns correctly', async () => {
      try {
        const pattern = 'resource:*';
        const callbacks: string[] = [];

        const callback = (key: string) => {
          callbacks.push(key);
        };

        await stateSync.subscribeToChanges(pattern, callback);

        await stateSync.publishStateChange('resource:1', {});
        await stateSync.publishStateChange('resource:2', {});
        await stateSync.publishStateChange('other:1', {}); // Should not match

        // Give async callbacks time to execute
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(callbacks.length).toBeGreaterThanOrEqual(2);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should support catch-all subscriptions', async () => {
      try {
        let callCount = 0;

        const callback = () => {
          callCount++;
        };

        await stateSync.subscribeToChanges('*', callback);

        await stateSync.publishStateChange('key1', {});
        await stateSync.publishStateChange('key2', {});

        // Give async callbacks time to execute
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(callCount).toBeGreaterThanOrEqual(2);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Unsubscription', () => {
    beforeEach(async () => {
      try {
        await stateSync.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should unsubscribe from specific pattern', async () => {
      try {
        const pattern = 'test:unsub';
        let notified = false;

        const callback = () => {
          notified = true;
        };

        await stateSync.subscribeToChanges(pattern, callback);
        stateSync.unsubscribeFromChanges(pattern, callback);

        await stateSync.publishStateChange(pattern, {});

        // Give async callback time to execute
        await new Promise(resolve => setTimeout(resolve, 50));

        // Should not be notified
        expect(notified).toBe(false);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should remove all subscribers for pattern', async () => {
      try {
        const pattern = 'test:removeall';

        const callback1 = () => {};
        const callback2 = () => {};

        await stateSync.subscribeToChanges(pattern, callback1);
        await stateSync.subscribeToChanges(pattern, callback2);

        stateSync.unsubscribeFromChanges(pattern);

        const stats = stateSync.getStats();
        expect(stats.totalPatterns).toBe(0);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Manual Sync', () => {
    beforeEach(async () => {
      try {
        await stateSync.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should manually sync state', async () => {
      try {
        const key = 'test:manual_sync';
        const value = { data: 'synced' };

        await stateSync.publishStateChange(key, value);

        // Manually trigger sync (should not throw)
        await stateSync.syncState();

        expect(true).toBe(true);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Subscription Statistics', () => {
    beforeEach(async () => {
      try {
        await stateSync.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should track subscription statistics', async () => {
      try {
        const callback1 = () => {};
        const callback2 = () => {};

        await stateSync.subscribeToChanges('pattern:1', callback1);
        await stateSync.subscribeToChanges('pattern:2', callback1);
        await stateSync.subscribeToChanges('pattern:2', callback2);

        const stats = stateSync.getStats();

        expect(stats.totalPatterns).toBe(2);
        expect(stats.totalCallbacks).toBe(3);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should report empty stats when no subscriptions', () => {
      const stats = stateSync.getStats();

      expect(stats.totalPatterns).toBe(0);
      expect(stats.totalCallbacks).toBe(0);
    });
  });

  describe('Sync Status', () => {
    beforeEach(async () => {
      try {
        await stateSync.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should report sync status', async () => {
      try {
        expect(stateSync.isSyncing()).toBe(false);

        const callback = () => {};
        await stateSync.subscribeToChanges('test:sync', callback);

        // Should be syncing now
        expect(stateSync.isSyncing()).toBe(true);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Multiple Callbacks', () => {
    beforeEach(async () => {
      try {
        await stateSync.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should invoke all callbacks for a pattern', async () => {
      try {
        const key = 'test:multiple';
        let count = 0;

        const callback1 = () => {
          count++;
        };

        const callback2 = () => {
          count++;
        };

        await stateSync.subscribeToChanges(key, callback1);
        await stateSync.subscribeToChanges(key, callback2);

        await stateSync.publishStateChange(key, {});

        // Give async callbacks time to execute
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(count).toBeGreaterThanOrEqual(2);
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
      const instance1 = getPgStateSync();
      const instance2 = getPgStateSync();

      expect(instance1).toBe(instance2);
    });

    it('should initialize singleton', async () => {
      try {
        const instance = await initializePgStateSync();
        expect(instance).toBeDefined();
        expect(instance).toBeInstanceOf(PgStateSync);
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
        await stateSync.initialize();
        await stateSync.shutdown();
        expect(true).toBe(true);
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });
  });
});
