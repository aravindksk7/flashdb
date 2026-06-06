export declare class PowerShellService {
    private flashdbModulePath;
    private powerShellCommand;
    constructor();
    executeCommand<T = any>(cmdlet: string, params?: Record<string, any>): Promise<T>;
    executeCommandRaw(cmdlet: string, params?: Record<string, any>): Promise<string>;
    private buildPowerShellCommand;
    private formatPowerShellParameter;
    private escapePowerShellString;
}
//# sourceMappingURL=powershellService.d.ts.map