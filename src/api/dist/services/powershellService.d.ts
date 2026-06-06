export declare class PowerShellService {
    private flashdbModulePath;
    constructor();
    executeCommand<T>(cmdlet: string, params?: Record<string, any>): Promise<T>;
    executeCommandRaw(cmdlet: string, params?: Record<string, any>): Promise<string>;
    private buildPowerShellCommand;
}
//# sourceMappingURL=powershellService.d.ts.map