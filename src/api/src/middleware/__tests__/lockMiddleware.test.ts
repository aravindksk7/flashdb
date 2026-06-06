import { withLock, withLockRetry, acquireOrFail, acquireWithRetry, releaseLock } from '../lockMiddleware';
import { getPgLockManager } from '../../services/pgLockManager';
import logger from '../../logger';

// Mock logger
jest.mock('../../logger');

// Mock uuid
jest.mock('uuid', () => ({
  v4: () => 'test-owner-id'
}));

describe('lockMiddleware', () => {
  let mockLockManager: any;

  beforeEach(() => {
    mockLockManager = {
      acquireLock: jest.fn(),
      releaseLock: jest.fn(),
      getLockInfo: jest.fn()
    };

    jest.mocked(getPgLockManager).mockReturnValue(mockLockManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('acquireOrFail', () => {
    it('should return lock context on successful acquisition', async () => {
      mockLockManager.acquireLock.mockResolvedValue(true);

      const result = await acquireOrFail('test-resource', 30);

      expect(result).toBeDefined();
      expect(result?.resourceId).toBe('test-resource');
      expect(result?.ownerId).toBe('test-owner-id');
      expect(mockLockManager.acquireLock).toHaveBeenCalledWith('test-resource', 'test-owner-id', 30);
    });

    it('should return null if lock cannot be acquired', async () => {
      mockLockManager.acquireLock.mockResolvedValue(false);

      const result = await acquireOrFail('test-resource', 30);

      expect(result).toBeNull();
    });

    it('should log debug message on failed acquisition', async () => {
      mockLockManager.acquireLock.mockResolvedValue(false);

      await acquireOrFail('test-resource', 30);

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Lock acquisition failed'));
    });

    it('should throw error on exception', async () => {
      mockLockManager.acquireLock.mockRejectedValue(new Error('Database error'));

      await expect(acquireOrFail('test-resource')).rejects.toThrow('Database error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('acquireWithRetry', () => {
    it('should acquire lock on first attempt', async () => {
      mockLockManager.acquireLock.mockResolvedValue(true);

      const result = await acquireWithRetry('test-resource');

      expect(result).toBeDefined();
      expect(result?.resourceId).toBe('test-resource');
      expect(mockLockManager.acquireLock).toHaveBeenCalledTimes(1);
    });

    it('should retry if initial acquisition fails', async () => {
      mockLockManager.acquireLock
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const result = await acquireWithRetry('test-resource', 30, 3, 10);

      expect(result).toBeDefined();
      expect(mockLockManager.acquireLock).toHaveBeenCalledTimes(2);
    });

    it('should return null after max attempts', async () => {
      mockLockManager.acquireLock.mockResolvedValue(false);

      const result = await acquireWithRetry('test-resource', 30, 2, 10);

      expect(result).toBeNull();
      expect(mockLockManager.acquireLock).toHaveBeenCalledTimes(2);
    });
  });

  describe('withLock', () => {
    it('should execute operation while holding lock', async () => {
      mockLockManager.acquireLock.mockResolvedValue(true);
      mockLockManager.releaseLock.mockResolvedValue(true);

      const operation = jest.fn().mockResolvedValue('test-result');

      const result = await withLock('test-resource', operation, 30);

      expect(result.result).toBe('test-result');
      expect(operation).toHaveBeenCalled();
      expect(mockLockManager.releaseLock).toHaveBeenCalled();
    });

    it('should release lock even if operation fails', async () => {
      mockLockManager.acquireLock.mockResolvedValue(true);
      mockLockManager.releaseLock.mockResolvedValue(true);

      const operation = jest.fn().mockRejectedValue(new Error('Operation failed'));

      await expect(withLock('test-resource', operation)).rejects.toThrow('Operation failed');
      expect(mockLockManager.releaseLock).toHaveBeenCalled();
    });

    it('should throw error if lock cannot be acquired', async () => {
      mockLockManager.acquireLock.mockResolvedValue(false);

      const operation = jest.fn();

      await expect(withLock('test-resource', operation)).rejects.toThrow('LOCK_CONFLICT');
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('withLockRetry', () => {
    it('should retry lock acquisition', async () => {
      mockLockManager.acquireLock
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);
      mockLockManager.releaseLock.mockResolvedValue(true);

      const operation = jest.fn().mockResolvedValue('test-result');

      const result = await withLockRetry('test-resource', operation, 30, 3, 10);

      expect(result.result).toBe('test-result');
      expect(mockLockManager.acquireLock).toHaveBeenCalledTimes(2);
    });

    it('should throw error on timeout', async () => {
      mockLockManager.acquireLock.mockResolvedValue(false);

      const operation = jest.fn();

      await expect(withLockRetry('test-resource', operation, 30, 2, 10)).rejects.toThrow(
        'LOCK_TIMEOUT'
      );
      expect(operation).not.toHaveBeenCalled();
    });
  });

  describe('releaseLock', () => {
    it('should release lock successfully', async () => {
      mockLockManager.releaseLock.mockResolvedValue(true);

      const lockContext = {
        resourceId: 'test-resource',
        ownerId: 'test-owner',
        acquiredAt: new Date(),
        waitTimeMs: 100
      };

      const result = await releaseLock(lockContext);

      expect(result).toBe(true);
      expect(mockLockManager.releaseLock).toHaveBeenCalledWith('test-resource', 'test-owner');
    });

    it('should handle release failure gracefully', async () => {
      mockLockManager.releaseLock.mockResolvedValue(false);

      const lockContext = {
        resourceId: 'test-resource',
        ownerId: 'test-owner',
        acquiredAt: new Date(),
        waitTimeMs: 100
      };

      const result = await releaseLock(lockContext);

      expect(result).toBe(false);
    });
  });
});
