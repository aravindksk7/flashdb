"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PooledPowerShellService = void 0;
exports.getPooledPowerShellService = getPooledPowerShellService;
const logger_1 = __importDefault(require("../logger"));
const connectionPool_1 = require("./connectionPool");
/**
 * Pooled PowerShell Service
 * Wraps PowerShellService with connection pool management
 * Acquires connection from pool, executes command, releases connection
 */
class PooledPowerShellService {
    /**
     * Execute a command with automatic connection pooling
     * @param cmdlet PowerShell cmdlet name
     * @param params Command parameters
     * @returns Command result
     */
    async executeCommand(cmdlet, params) {
        const pool = (0, connectionPool_1.getConnectionPool)();
        let connection = null;
        try {
            // Acquire connection from pool
            connection = await pool.acquire();
            logger_1.default.debug(`Using pooled connection for cmdlet: ${cmdlet}`);
            // Execute command
            const result = await connection.executeCommand(cmdlet, params);
            // Return result
            return result;
        }
        catch (error) {
            logger_1.default.error(`Pooled PowerShell command failed for ${cmdlet}: ${error.message}`);
            throw new Error(`PowerShell command execution failed: ${error.message}`);
        }
        finally {
            // Release connection back to pool
            if (connection) {
                try {
                    await pool.release(connection);
                    logger_1.default.debug(`Released connection for cmdlet: ${cmdlet}`);
                }
                catch (releaseError) {
                    logger_1.default.error(`Failed to release connection: ${releaseError.message}`);
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
    async executeCommandRaw(cmdlet, params) {
        const pool = (0, connectionPool_1.getConnectionPool)();
        let connection = null;
        try {
            // Acquire connection from pool
            connection = await pool.acquire();
            logger_1.default.debug(`Using pooled connection for raw command: ${cmdlet}`);
            // Execute command
            const result = await connection.executeCommandRaw(cmdlet, params);
            // Return result
            return result;
        }
        catch (error) {
            logger_1.default.error(`Pooled PowerShell raw command failed for ${cmdlet}: ${error.message}`);
            throw new Error(`PowerShell command execution failed: ${error.message}`);
        }
        finally {
            // Release connection back to pool
            if (connection) {
                try {
                    await pool.release(connection);
                    logger_1.default.debug(`Released connection for raw command: ${cmdlet}`);
                }
                catch (releaseError) {
                    logger_1.default.error(`Failed to release connection: ${releaseError.message}`);
                }
            }
        }
    }
    /**
     * Execute multiple commands in sequence using the same connection
     * Useful for commands that depend on state
     */
    async executeCommandBatch(commands) {
        const pool = (0, connectionPool_1.getConnectionPool)();
        let connection = null;
        try {
            // Acquire single connection for batch
            connection = await pool.acquire();
            logger_1.default.debug(`Using pooled connection for batch of ${commands.length} commands`);
            const results = [];
            // Execute all commands with same connection
            for (const cmd of commands) {
                const result = await connection.executeCommand(cmd.cmdlet, cmd.params);
                results.push(result);
            }
            return results;
        }
        catch (error) {
            logger_1.default.error(`Pooled PowerShell batch command failed: ${error.message}`);
            throw new Error(`PowerShell batch execution failed: ${error.message}`);
        }
        finally {
            // Release connection back to pool
            if (connection) {
                try {
                    await pool.release(connection);
                    logger_1.default.debug(`Released connection for batch command`);
                }
                catch (releaseError) {
                    logger_1.default.error(`Failed to release connection: ${releaseError.message}`);
                }
            }
        }
    }
}
exports.PooledPowerShellService = PooledPowerShellService;
// Singleton instance
let serviceInstance;
/**
 * Get or create the global pooled PowerShell service instance
 */
function getPooledPowerShellService() {
    if (!serviceInstance) {
        serviceInstance = new PooledPowerShellService();
    }
    return serviceInstance;
}
//# sourceMappingURL=pooledPowershellService.js.map