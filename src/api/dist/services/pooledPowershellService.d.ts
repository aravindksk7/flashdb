/**
 * Pooled PowerShell Service
 * Wraps PowerShellService with connection pool management
 * Acquires connection from pool, executes command, releases connection
 */
export declare class PooledPowerShellService {
    /**
     * Execute a command with automatic connection pooling
     * @param cmdlet PowerShell cmdlet name
     * @param params Command parameters
     * @returns Command result
     */
    executeCommand<T = any>(cmdlet: string, params?: Record<string, any>): Promise<T>;
    /**
     * Execute a command and return raw output
     * @param cmdlet PowerShell cmdlet name
     * @param params Command parameters
     * @returns Raw command output as string
     */
    executeCommandRaw(cmdlet: string, params?: Record<string, any>): Promise<string>;
    /**
     * Execute multiple commands in sequence using the same connection
     * Useful for commands that depend on state
     */
    executeCommandBatch<T = any>(commands: Array<{
        cmdlet: string;
        params?: Record<string, any>;
    }>): Promise<T[]>;
}
/**
 * Get or create the global pooled PowerShell service instance
 */
export declare function getPooledPowerShellService(): PooledPowerShellService;
//# sourceMappingURL=pooledPowershellService.d.ts.map