import { execFile } from 'child_process';
import { promisify } from 'util';
import logger from '../logger';

const execFileAsync = promisify(execFile);

export class PowerShellService {
  private flashdbModulePath: string;
  private powerShellCommand: string;

  constructor() {
    this.flashdbModulePath = process.env.FLASHDB_MODULE_PATH ||
      (process.platform === 'win32'
        ? 'C:\\flashdb\\src\\FlashDB\\FlashDB.psm1'
        : '/app/src/FlashDB/FlashDB.psm1');
    this.powerShellCommand = process.env.POWERSHELL_COMMAND ||
      (process.platform === 'win32' ? 'powershell' : 'pwsh');
  }

  async executeCommand<T = any>(cmdlet: string, params?: Record<string, any>): Promise<T> {
    try {
      const psCommand = this.buildPowerShellCommand(cmdlet, params);
      logger.debug(`Executing PowerShell command: ${cmdlet}`);

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
        logger.warn(`PowerShell stderr: ${stderr}`);
      }

      if (!stdout.trim()) {
        return null as T;
      }

      return JSON.parse(stdout.trim()) as T;
    } catch (error: any) {
      logger.error(`PowerShell command failed: ${error.message}`);
      throw new Error(`PowerShell execution failed: ${error.stderr || error.message}`);
    }
  }

  async executeCommandRaw(cmdlet: string, params?: Record<string, any>): Promise<string> {
    try {
      const psCommand = this.buildPowerShellCommand(cmdlet, params);
      logger.debug(`Executing PowerShell command: ${cmdlet}`);

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
        logger.warn(`PowerShell stderr: ${stderr}`);
      }

      return stdout.trim();
    } catch (error: any) {
      logger.error(`PowerShell command failed: ${error.message}`);
      throw new Error(`PowerShell execution failed: ${error.stderr || error.message}`);
    }
  }

  private buildPowerShellCommand(cmdlet: string, params?: Record<string, any>): string {
    let cmd = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; `;
    cmd += `Import-Module '${this.escapePowerShellString(this.flashdbModulePath)}' -WarningAction SilentlyContinue -ErrorAction Stop; `;
    let invocation = cmdlet;

    if (params && Object.keys(params).length > 0) {
      const paramStrings = Object.entries(params)
        .map(([key, value]) => this.formatPowerShellParameter(key, value))
        .filter((value): value is string => Boolean(value));
      invocation += ` ${paramStrings.join(' ')}`;
    }

    cmd += `$flashdbResult = ${invocation}; `;
    cmd += 'ConvertTo-Json -InputObject $flashdbResult -Depth 10 -ErrorAction Stop';
    return cmd;
  }

  private formatPowerShellParameter(key: string, value: any): string | null {
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

  private escapePowerShellString(value: string): string {
    return value.replace(/'/g, "''");
  }
}
