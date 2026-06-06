import logger from '../logger';
import { PowerShellService } from './powershellService';
import { getConnectionPool } from './connectionPool';

/**
 * Pooled PowerShell Service
 * Wraps PowerShellService with connection pool management
 * Acquires connection from pool, executes command, releases connection
 */
export class PooledPowerShellService {
  /**
   * Execute a command with automatic connection pooling
   * @param cmdlet PowerShell cmdlet name
   * @param params Command parameters
   * @returns Command result
   */
  async executeCommand<T = any>(cmdlet: string, params?: Record<string, any>): Promise<T> {
    const pool = getConnectionPool();
    let connection: PowerShellService | null = null;

    try {
      // Acquire connection from pool
      connection = await pool.acquire();
      logger.debug(`Using pooled connection for cmdlet: ${cmdlet}`);

      // Execute command
      const result = await connection.executeCommand<T>(cmdlet, params);

      // Return result
      return result;
    } catch (error: any) {
      logger.error(`Pooled PowerShell command failed for ${cmdlet}: ${error.message}`);
      throw new Error(`PowerShell command execution failed: ${error.message}`);
    } finally {
      // Release connection back to pool
      if (connection) {
        try {
          await pool.release(connection);
          logger.debug(`Released connection for cmdlet: ${cmdlet}`);
        } catch (releaseError: any) {
          logger.error(`Failed to release connection: ${releaseError.message}`);
        }
      }
    }
  }

  /**
   * Execute a command and return raw output
   * @param cmdlet PowerShell cmdlet name
   * @param params Command parameters
   * @returns Raw command output as string
   */
  async executeCommandRaw(cmdlet: string, params?: Record<string, any>): Promise<string> {
    const pool = getConnectionPool();
    let connection: PowerShellService | null = null;

    try {
      // Acquire connection from pool
      connection = await pool.acquire();
      logger.debug(`Using pooled connection for raw command: ${cmdlet}`);

      // Execute command
      const result = await connection.executeCommandRaw(cmdlet, params);

      // Return result
      return result;
    } catch (error: any) {
      logger.error(
        `Pooled PowerShell raw command failed for ${cmdlet}: ${error.message}`
      );
      throw new Error(`PowerShell command execution failed: ${error.message}`);
    } finally {
      // Release connection back to pool
      if (connection) {
        try {
          await pool.release(connection);
          logger.debug(`Released connection for raw command: ${cmdlet}`);
        } catch (releaseError: any) {
          logger.error(`Failed to release connection: ${releaseError.message}`);
        }
      }
    }
  }

  /**
   * Execute multiple commands in sequence using the same connection
   * Useful for commands that depend on state
   */
  async executeCommandBatch<T = any>(
    commands: Array<{ cmdlet: string; params?: Record<string, any> }>
  ): Promise<T[]> {
    const pool = getConnectionPool();
    let connection: PowerShellService | null = null;

    try {
      // Acquire single connection for batch
      connection = await pool.acquire();
      logger.debug(`Using pooled connection for batch of ${commands.length} commands`);

      const results: T[] = [];

      // Execute all commands with same connection
      for (const cmd of commands) {
        const result = await connection.executeCommand<T>(cmd.cmdlet, cmd.params);
        results.push(result);
      }

      return results;
    } catch (error: any) {
      logger.error(`Pooled PowerShell batch command failed: ${error.message}`);
      throw new Error(`PowerShell batch execution failed: ${error.message}`);
    } finally {
      // Release connection back to pool
      if (connection) {
        try {
          await pool.release(connection);
          logger.debug(`Released connection for batch command`);
        } catch (releaseError: any) {
          logger.error(`Failed to release connection: ${releaseError.message}`);
        }
      }
    }
  }
}

// Singleton instance
let serviceInstance: PooledPowerShellService;

/**
 * Get or create the global pooled PowerShell service instance
 */
export function getPooledPowerShellService(): PooledPowerShellService {
  if (!serviceInstance) {
    serviceInstance = new PooledPowerShellService();
  }
  return serviceInstance;
}
