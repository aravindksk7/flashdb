"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PowerShellService = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const logger_1 = __importDefault(require("../logger"));
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
class PowerShellService {
    constructor() {
        this.flashdbModulePath = process.env.FLASHDB_MODULE_PATH ||
            (process.platform === 'win32'
                ? 'C:\\flashdb\\src\\FlashDB\\FlashDB.psm1'
                : '/app/src/FlashDB/FlashDB.psm1');
        this.powerShellCommand = process.env.POWERSHELL_COMMAND ||
            (process.platform === 'win32' ? 'powershell' : 'pwsh');
    }
    async executeCommand(cmdlet, params) {
        try {
            const psCommand = this.buildPowerShellCommand(cmdlet, params);
            logger_1.default.debug(`Executing PowerShell command: ${cmdlet}`);
            const { stdout, stderr } = await execFileAsync(this.powerShellCommand, [
                '-NoLogo',
                '-NoProfile',
                '-Command',
                psCommand
            ], {
                maxBuffer: 10 * 1024 * 1024,
                encoding: 'utf8'
            });
            if (stderr) {
                logger_1.default.warn(`PowerShell stderr: ${stderr}`);
            }
            if (!stdout.trim()) {
                return null;
            }
            return JSON.parse(stdout.trim());
        }
        catch (error) {
            logger_1.default.error(`PowerShell command failed: ${error.message}`);
            throw new Error(`PowerShell execution failed: ${error.stderr || error.message}`);
        }
    }
    async executeCommandRaw(cmdlet, params) {
        try {
            const psCommand = this.buildPowerShellCommand(cmdlet, params);
            logger_1.default.debug(`Executing PowerShell command: ${cmdlet}`);
            const { stdout, stderr } = await execFileAsync(this.powerShellCommand, [
                '-NoLogo',
                '-NoProfile',
                '-Command',
                psCommand
            ], {
                maxBuffer: 10 * 1024 * 1024,
                encoding: 'utf8'
            });
            if (stderr) {
                logger_1.default.warn(`PowerShell stderr: ${stderr}`);
            }
            return stdout.trim();
        }
        catch (error) {
            logger_1.default.error(`PowerShell command failed: ${error.message}`);
            throw new Error(`PowerShell execution failed: ${error.stderr || error.message}`);
        }
    }
    buildPowerShellCommand(cmdlet, params) {
        let cmd = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; `;
        cmd += `Import-Module '${this.escapePowerShellString(this.flashdbModulePath)}' -WarningAction SilentlyContinue -ErrorAction Stop; `;
        let invocation = cmdlet;
        if (params && Object.keys(params).length > 0) {
            const paramStrings = Object.entries(params)
                .map(([key, value]) => this.formatPowerShellParameter(key, value))
                .filter((value) => Boolean(value));
            invocation += ` ${paramStrings.join(' ')}`;
        }
        cmd += `$flashdbResult = ${invocation}; `;
        cmd += 'ConvertTo-Json -InputObject $flashdbResult -Depth 10 -ErrorAction Stop';
        return cmd;
    }
    formatPowerShellParameter(key, value) {
        if (value === undefined || value === null) {
            return null;
        }
        if (typeof value === 'boolean') {
            return `-${key}:$${value ? 'true' : 'false'}`;
        }
        if (typeof value === 'number') {
            return `-${key} ${value}`;
        }
        if (Array.isArray(value)) {
            const values = value
                .filter(item => item !== undefined && item !== null)
                .map(item => `'${this.escapePowerShellString(String(item))}'`);
            return `-${key} @(${values.join(', ')})`;
        }
        const escapedValue = this.escapePowerShellString(String(value));
        return `-${key} '${escapedValue}'`;
    }
    escapePowerShellString(value) {
        return value.replace(/'/g, "''");
    }
}
exports.PowerShellService = PowerShellService;
//# sourceMappingURL=powershellService.js.map