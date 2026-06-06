"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PowerShellService = void 0;
const child_process_1 = require("child_process");
const util_1 = require("util");
const logger_1 = __importDefault(require("../logger"));
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class PowerShellService {
    constructor() {
        this.flashdbModulePath = process.env.FLASHDB_MODULE_PATH ||
            'C:\\flashdb\\src\\FlashDB\\FlashDB.psm1';
    }
    async executeCommand(cmdlet, params) {
        try {
            const psCommand = this.buildPowerShellCommand(cmdlet, params);
            logger_1.default.debug(`Executing PowerShell command: ${cmdlet}`);
            const { stdout, stderr } = await execAsync(`powershell -NoProfile -Command "${psCommand}"`, {
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                shell: 'powershell.exe'
            });
            if (stderr) {
                logger_1.default.warn(`PowerShell stderr: ${stderr}`);
            }
            if (!stdout.trim()) {
                return {};
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
            const { stdout, stderr } = await execAsync(`powershell -NoProfile -Command "${psCommand}"`, {
                maxBuffer: 10 * 1024 * 1024,
                shell: 'powershell.exe'
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
        let cmd = `Import-Module '${this.flashdbModulePath}'; `;
        cmd += cmdlet;
        if (params && Object.keys(params).length > 0) {
            const paramStrings = Object.entries(params).map(([key, value]) => {
                const escapedValue = String(value).replace(/'/g, "''").replace(/"/g, '\\"');
                return `-${key} '${escapedValue}'`;
            });
            cmd += ` ${paramStrings.join(' ')}`;
        }
        cmd += ' | ConvertTo-Json -Depth 10';
        return cmd;
    }
}
exports.PowerShellService = PowerShellService;
//# sourceMappingURL=powershellService.js.map