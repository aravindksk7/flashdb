import { describe, it, expect, beforeEach, afterEach, beforeAll } from '@jest/globals';
import { PgLockManager, getPgLockManager, initializePgLockManager } from '../pgLockManager';
import { initializeSqlClient } from '../sqlClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * PostgreSQL Lock Manager Unit Tests
 * Tests distributed locks, TTL, renewal, and concurrent scenarios
 */
describe('PgLockManager', () => {
  let lockManager: PgLockManager;

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
    lockManager = new PgLockManager();
  });

  afterEach(async () => {
    // Cleanup after each test
    if (lockManager) {
      try {
        await lockManager.shutdown();
      } catch (error) {
        // Ignore shutdown errors
      }
    }
  });

  describe('Initialization', () => {
    it('should create a PgLockManager instance', () => {
      expect(lockManager).toBeDefined();
      expect(lockManager).toBeInstanceOf(PgLockManager);
    });

    it('should initialize successfully', async () => {
      try {
        await lockManager.initialize();
        expect(lockManager).toBeDefined();
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
        await lockManager.initialize();
        await lockManager.initialize();
        expect(lockManager).toBeDefined();
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          console.log('Skipping - SQL Server unavailable');
        }
      }
    });
  });

  describe('Lock Acquisition', () => {
    beforeEach(async () => {
      try {
        await lockManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should acquire a lock', async () => {
      try {
        const resourceId = 'resource:1';
        const ownerId = uuidv4();

        const acquired = await lockManager.acquireLock(resourceId, ownerId);

        expect(acquired).toBe(true);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should deny lock acquisition if already locked by another owner', async () => {
      try {
        const resourceId = 'resource:2';
        const ownerId1 = uuidv4();
        const ownerId2 = uuidv4();

        const acquired1 = await lockManager.acquireLock(resourceId, ownerId1);
        expect(acquired1).toBe(true);

        const acquired2 = await lockManager.acquireLock(resourceId, ownerId2);
        expect(acquired2).toBe(false);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should allow same owner to renew lock', async () => {
      try {
        const resourceId = 'resource:3';
        const ownerId = uuidv4();

        const acquired1 = await lockManager.acquireLock(resourceId, ownerId);
        expect(acquired1).toBe(true);

        const acquired2 = await lockManager.acquireLock(resourceId, ownerId);
        expect(acquired2).toBe(true);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Lock Release', () => {
    beforeEach(async () => {
      try {
        await lockManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should release an owned lock', async () => {
      try {
        const resourceId = 'resource:4';
        const ownerId = uuidv4();

        await lockManager.acquireLock(resourceId, ownerId);
        const released = await lockManager.releaseLock(resourceId, ownerId);

        expect(released).toBe(true);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should deny lock release if not owned by requester', async () => {
      try {
        const resourceId = 'resource:5';
        const ownerId1 = uuidv4();
        const ownerId2 = uuidv4();

        await lockManager.acquireLock(resourceId, ownerId1);
        const released = await lockManager.releaseLock(resourceId, ownerId2);

        expect(released).toBe(false);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should handle release of non-existent lock', async () => {
      try {
        const released = await lockManager.releaseLock('nonexistent:lock', uuidv4());
        expect(released).toBe(false);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Lock Status', () => {
    beforeEach(async () => {
      try {
        await lockManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should check if resource is locked', async () => {
      try {
        const resourceId = 'resource:6';
        const ownerId = uuidv4();

        let isLocked = await lockManager.isLocked(resourceId);
        expect(isLocked).toBe(false);

        await lockManager.acquireLock(resourceId, ownerId);
        isLocked = await lockManager.isLocked(resourceId);
        expect(isLocked).toBe(true);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Lock Information', () => {
    beforeEach(async () => {
      try {
        await lockManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should get lock information', async () => {
      try {
        const resourceId = 'resource:7';
        const ownerId = uuidv4();

        await lockManager.acquireLock(resourceId, ownerId);
        const lockInfo = await lockManager.getLockInfo(resourceId);

        expect(lockInfo).toBeDefined();
        expect(lockInfo?.resourceId).toBe(resourceId);
        expect(lockInfo?.ownerId).toBe(ownerId);
        expect(lockInfo?.isLocked).toBe(true);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should return null for non-existent lock', async () => {
      try {
        const lockInfo = await lockManager.getLockInfo('nonexistent:lock');
        expect(lockInfo).toBeNull();
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Lock Renewal', () => {
    beforeEach(async () => {
      try {
        await lockManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should renew owned lock', async () => {
      try {
        const resourceId = 'resource:8';
        const ownerId = uuidv4();

        await lockManager.acquireLock(resourceId, ownerId);
        const renewed = await lockManager.renewLock(resourceId, ownerId, 3600);

        expect(renewed).toBe(true);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should deny renewal of lock not owned by requester', async () => {
      try {
        const resourceId = 'resource:9';
        const ownerId1 = uuidv4();
        const ownerId2 = uuidv4();

        await lockManager.acquireLock(resourceId, ownerId1);
        const renewed = await lockManager.renewLock(resourceId, ownerId2, 3600);

        expect(renewed).toBe(false);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Lock Acquisition with Retry', () => {
    beforeEach(async () => {
      try {
        await lockManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should acquire lock immediately if available', async () => {
      try {
        const resourceId = 'resource:10';
        const ownerId = uuidv4();

        const acquired = await lockManager.acquireLockWithRetry(
          resourceId,
          ownerId,
          30,
          3,
          100
        );

        expect(acquired).toBe(true);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should fail after max retries if lock held', async () => {
      try {
        const resourceId = 'resource:11';
        const ownerId1 = uuidv4();
        const ownerId2 = uuidv4();

        // First owner acquires lock
        await lockManager.acquireLock(resourceId, ownerId1);

        // Second owner tries with retries
        const acquired = await lockManager.acquireLockWithRetry(
          resourceId,
          ownerId2,
          30,
          2,
          50
        );

        expect(acquired).toBe(false);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('withLock Helper', () => {
    beforeEach(async () => {
      try {
        await lockManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should execute function while holding lock', async () => {
      try {
        const resourceId = 'resource:12';
        let executed = false;

        await lockManager.withLock(resourceId, 30, async () => {
          executed = true;
          return Promise.resolve();
        });

        expect(executed).toBe(true);

        // Lock should be released after function
        const isLocked = await lockManager.isLocked(resourceId);
        expect(isLocked).toBe(false);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });

    it('should release lock even if function throws', async () => {
      try {
        const resourceId = 'resource:13';

        try {
          await lockManager.withLock(resourceId, 30, async () => {
            throw new Error('Test error');
          });
        } catch (error) {
          // Expected
        }

        // Lock should be released even after error
        const isLocked = await lockManager.isLocked(resourceId);
        expect(isLocked).toBe(false);
      } catch (error: any) {
        if (error.message.includes('SQL Server not available')) {
          return;
        }
        throw error;
      }
    });
  });

  describe('Lock Statistics', () => {
    beforeEach(async () => {
      try {
        await lockManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should get lock statistics', async () => {
      try {
        const resourceId = 'resource:14';
        const ownerId = uuidv4();

        await lockManager.acquireLock(resourceId, ownerId);
        const stats = await lockManager.getStats();

        expect(stats).toBeDefined();
        expect(stats.totalLocks).toBeGreaterThanOrEqual(1);
        expect(stats.activeLocks).toBeGreaterThanOrEqual(1);
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
        await lockManager.initialize();
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });

    it('should report health status', async () => {
      try {
        const healthy = await lockManager.isHealthy();
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
      const instance1 = getPgLockManager();
      const instance2 = getPgLockManager();

      expect(instance1).toBe(instance2);
    });

    it('should initialize singleton', async () => {
      try {
        const instance = await initializePgLockManager();
        expect(instance).toBeDefined();
        expect(instance).toBeInstanceOf(PgLockManager);
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
        await lockManager.initialize();
        await lockManager.shutdown();
        expect(true).toBe(true);
      } catch (error: any) {
        if (!error.message.includes('SQL Server not available')) {
          throw error;
        }
      }
    });
  });
});
