import { exec } from 'child_process';
import { promisify } from 'util';
import logger from '../logger';

const execAsync = promisify(exec);

export class PowerShellService {
  private flashdbModulePath: string;

  constructor() {
    this.flashdbModulePath = process.env.FLASHDB_MODULE_PATH ||
      'C:\\flashdb\\src\\FlashDB\\FlashDB.psm1';
  }

  async executeCommand<T>(cmdlet: string, params?: Record<string, any>): Promise<T> {
    try {
      const psCommand = this.buildPowerShellCommand(cmdlet, params);
      logger.debug(`Executing PowerShell command: ${cmdlet}`);

      const fullCommand = `powershell -NoProfile -Command "${psCommand.replace(/"/g, '\\"')}"`;
      const { stdout, stderr } = await execAsync(fullCommand, {
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
        shell: 'cmd.exe'
      });

      if (stderr) {
        logger.warn(`PowerShell stderr: ${stderr}`);
      }

      if (!stdout.trim()) {
        return {} as T;
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

      const { stdout, stderr } = await execAsync(`powershell -NoProfile -Command "${psCommand}"`, {
        maxBuffer: 10 * 1024 * 1024,
        shell: 'powershell.exe'
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
    cmd += `Import-Module '${this.flashdbModulePath}' -WarningAction SilentlyContinue -ErrorAction Stop; `;
    cmd += cmdlet;

    if (params && Object.keys(params).length > 0) {
      const paramStrings = Object.entries(params).map(([key, value]) => {
        const escapedValue = String(value).replace(/'/g, "''");
        return `-${key} '${escapedValue}'`;
      });
      cmd += ` ${paramStrings.join(' ')}`;
    }

    cmd += ' 2>&1 | ConvertTo-Json -Depth 10 -ErrorAction Stop';
    return cmd;
  }
}
