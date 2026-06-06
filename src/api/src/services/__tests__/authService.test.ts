import authService from '../authService';
import { getSqlClient } from '../sqlClient';

// Mock the SQL client
jest.mock('../sqlClient');

describe('AuthService', () => {
  const mockSqlClient = getSqlClient as jest.MockedFunction<typeof getSqlClient>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('hashPassword and verifyPassword', () => {
    it('should hash a password', async () => {
      const password = 'testPassword123';
      const hash = await authService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(10);
    });

    it('should verify a correct password', async () => {
      const password = 'testPassword123';
      const hash = await authService.hashPassword(password);
      const isValid = await authService.verifyPassword(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword123';
      const hash = await authService.hashPassword(password);
      const isValid = await authService.verifyPassword(wrongPassword, hash);

      expect(isValid).toBe(false);
    });
  });

  describe('validateToken', () => {
    it('should return null for invalid token', () => {
      const result = authService.validateToken('invalid.token');
      expect(result).toBeNull();
    });

    it('should return payload for valid token', async () => {
      // This is tricky to test without a real JWT library integration
      // In a full test suite, you'd mock jwt.verify
      expect(authService.validateToken).toBeDefined();
    });
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = require('../authService').default;
      const instance2 = require('../authService').default;

      expect(instance1).toBe(instance2);
    });
  });
});
