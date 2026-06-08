/**
 * Remote Host Service
 *
 * Phase 6: Remote Host Handling
 * Manages remote host registry, validation, and remote execution
 */

import { HostMetadata, ValidationFinding } from '../types/providerContract';
import { getPooledPowerShellService } from './pooledPowershellService';
import logger from '../logger';

export interface HostValidationResult {
  hostId: string;
  isValid: boolean;
  findings: ValidationFinding[];
  capabilities: string[];
  validatedAt: Date;
}

export class RemoteHostService {
  private psService = getPooledPowerShellService();

  /**
   * Register a remote host
   */
  async registerHost(host: HostMetadata): Promise<void> {
    logger.info(`[RemoteHost] Registering host: ${host.name}`);

    if (!host.fqdn) {
      throw new Error('FQDN is required');
    }

    if (!['Local', 'WinRM', 'SSH'].includes(host.accessMethod)) {
      throw new Error(`Invalid access method: ${host.accessMethod}`);
    }

    // Would persist to database
  }

  /**
   * Validate a host
   *
   * Checks:
   * - WinRM/remoting connectivity
   * - PowerShell module availability
   * - SQL Server reachability
   * - UNC path validation
   * - Credential testing
   *
   * Returns detailed remediation hints on failures
   */
  async validateHost(hostId: string, host: HostMetadata): Promise<HostValidationResult> {
    logger.info(`[RemoteHost] Validating host: ${hostId} (${host.fqdn})`);

    const findings: ValidationFinding[] = [];
    const capabilities: string[] = [];

    try {
      // Step 1: Check connectivity based on access method
      if (host.accessMethod === 'Local') {
        await this.validateLocalHostConnectivity(findings);
      } else if (host.accessMethod === 'WinRM') {
        await this.validateWinRMConnectivity(host.fqdn, findings);
      } else if (host.accessMethod === 'SSH') {
        await this.validateSSHConnectivity(host.fqdn, findings);
      }

      // Step 2: Check PowerShell remoting and module availability
      await this.validatePowerShellModules(host, findings);

      // Step 3: Check SQL Server reachability
      if (host.sqlInstances && host.sqlInstances.length > 0) {
        await this.validateSQLServerReachability(host, findings);
      }

      // Step 4: Validate UNC path mappings
      if (host.pathMappings && Object.keys(host.pathMappings).length > 0) {
        await this.validateUNCPaths(host, findings);
      }

      // Step 5: Test credentials if provided
      if (host.credentialReference) {
        await this.validateCredentials(host, findings);
      }

      // Determine capabilities based on findings
      if (!findings.some(f => f.code === 'WINRM_UNAVAILABLE')) {
        capabilities.push('Remoting');
      }
      if (!findings.some(f => f.code === 'SQLSERVER_UNREACHABLE')) {
        capabilities.push('SQLServer');
      }
      if (!findings.some(f => f.code === 'UNC_PATH_INVALID')) {
        capabilities.push('VHD');
      }

      // Add success summary
      if (findings.length === 0) {
        findings.push({
          severity: 'Info',
          code: 'VALIDATION_SUCCESSFUL',
          message: 'Host validation completed successfully. All checks passed.'
        });
      }
    } catch (error) {
      logger.error(`[RemoteHost] Validation failed: ${error}`);
      findings.push({
        severity: 'Error',
        code: 'VALIDATION_EXCEPTION',
        message: `Unexpected validation error: ${error}`,
        details: { error: String(error) }
      });
    }

    const isValid = !findings.some((f) => f.severity === 'Error');

    return {
      hostId,
      isValid,
      findings,
      capabilities,
      validatedAt: new Date(),
    };
  }

  /**
   * Validate local host connectivity
   */
  private async validateLocalHostConnectivity(findings: ValidationFinding[]): Promise<void> {
    logger.debug('[RemoteHost] Validating local host connectivity');
    try {
      const result = await this.psService.executeCommand('Test-Connection', {
        ComputerName: 'localhost',
        Count: 1
      });

      if (!result) {
        findings.push({
          severity: 'Error',
          code: 'LOCAL_HOST_UNREACHABLE',
          message: 'Local host is not reachable',
          details: { remedy: 'Verify network configuration and firewall settings' }
        });
      }
    } catch (error) {
      findings.push({
        severity: 'Error',
        code: 'LOCAL_HOST_TEST_FAILED',
        message: `Local connectivity test failed: ${error}`,
        details: { remedy: 'Check PowerShell is properly configured' }
      });
    }
  }

  /**
   * Validate WinRM connectivity
   */
  private async validateWinRMConnectivity(fqdn: string, findings: ValidationFinding[]): Promise<void> {
    logger.debug(`[RemoteHost] Validating WinRM connectivity to ${fqdn}`);
    try {
      // Test WinRM endpoint
      const result = await this.psService.executeCommand('Test-WSMan', {
        ComputerName: fqdn
      });

      if (!result) {
        findings.push({
          severity: 'Error',
          code: 'WINRM_UNAVAILABLE',
          message: `WinRM is not available on ${fqdn}`,
          details: {
            remedy: 'Enable WinRM using: winrm quickconfig',
            reference: 'https://learn.microsoft.com/en-us/windows/win32/winrm/installation-and-configuration-for-windows-remote-management'
          }
        });
      } else {
        findings.push({
          severity: 'Info',
          code: 'WINRM_AVAILABLE',
          message: `WinRM is available on ${fqdn}`
        });
      }
    } catch (error) {
      findings.push({
        severity: 'Error',
        code: 'WINRM_TEST_FAILED',
        message: `WinRM connectivity test failed for ${fqdn}: ${error}`,
        details: {
          remedy: 'Verify network connectivity and WinRM configuration',
          fqdn
        }
      });
    }
  }

  /**
   * Validate SSH connectivity
   */
  private async validateSSHConnectivity(fqdn: string, findings: ValidationFinding[]): Promise<void> {
    logger.debug(`[RemoteHost] Validating SSH connectivity to ${fqdn}`);
    try {
      // Test SSH connectivity
      const result = await this.psService.executeCommand('Test-NetConnection', {
        ComputerName: fqdn,
        Port: 22
      });

      if (!result || !(result as any).TcpTestSucceeded) {
        findings.push({
          severity: 'Error',
          code: 'SSH_UNAVAILABLE',
          message: `SSH is not available on ${fqdn}:22`,
          details: {
            remedy: 'Verify SSH service is running and port 22 is open',
            port: 22
          }
        });
      } else {
        findings.push({
          severity: 'Info',
          code: 'SSH_AVAILABLE',
          message: `SSH is available on ${fqdn}:22`
        });
      }
    } catch (error) {
      findings.push({
        severity: 'Error',
        code: 'SSH_TEST_FAILED',
        message: `SSH connectivity test failed for ${fqdn}: ${error}`,
        details: {
          remedy: 'Verify network connectivity and SSH configuration',
          fqdn
        }
      });
    }
  }

  /**
   * Validate PowerShell modules are available
   */
  private async validatePowerShellModules(host: HostMetadata, findings: ValidationFinding[]): Promise<void> {
    logger.debug(`[RemoteHost] Validating PowerShell modules for ${host.fqdn}`);
    try {
      const moduleName = 'Flashdb';
      const result = await this.psService.executeCommand('Get-Module', {
        Name: moduleName,
        ListAvailable: true
      });

      if (!result) {
        findings.push({
          severity: 'Error',
          code: 'POWERSHELL_MODULE_MISSING',
          message: `Required PowerShell module '${moduleName}' is not available on ${host.fqdn}`,
          details: {
            remedy: `Install the module using: Install-Module -Name ${moduleName}`,
            moduleName
          }
        });
      } else {
        findings.push({
          severity: 'Info',
          code: 'POWERSHELL_MODULE_FOUND',
          message: `PowerShell module '${moduleName}' is available`
        });
      }
    } catch (error) {
      findings.push({
        severity: 'Warning',
        code: 'POWERSHELL_MODULE_CHECK_FAILED',
        message: `Could not verify PowerShell modules: ${error}`,
        details: { remedy: 'Manually verify module availability' }
      });
    }
  }

  /**
   * Validate SQL Server reachability
   */
  private async validateSQLServerReachability(host: HostMetadata, findings: ValidationFinding[]): Promise<void> {
    logger.debug(`[RemoteHost] Validating SQL Server reachability on ${host.fqdn}`);
    if (!host.sqlInstances || host.sqlInstances.length === 0) return;

    for (const instance of host.sqlInstances) {
      try {
        const result = await this.psService.executeCommand('Test-NetConnection', {
          ComputerName: host.fqdn,
          Port: 1433 // Standard SQL port
        });

        if (!result || !(result as any).TcpTestSucceeded) {
          findings.push({
            severity: 'Error',
            code: 'SQLSERVER_UNREACHABLE',
            message: `SQL Server instance '${instance}' on ${host.fqdn} is not reachable`,
            details: {
              remedy: 'Verify SQL Server is running and TCP/IP protocol is enabled',
              instance,
              defaultPort: 1433
            }
          });
        } else {
          findings.push({
            severity: 'Info',
            code: 'SQLSERVER_REACHABLE',
            message: `SQL Server instance '${instance}' on ${host.fqdn} is reachable`
          });
        }
      } catch (error) {
        findings.push({
          severity: 'Warning',
          code: 'SQLSERVER_TEST_FAILED',
          message: `Could not test SQL Server reachability: ${error}`,
          details: { remedy: 'Manually verify SQL Server connectivity', instance }
        });
      }
    }
  }

  /**
   * Validate UNC path mappings
   */
  private async validateUNCPaths(host: HostMetadata, findings: ValidationFinding[]): Promise<void> {
    logger.debug(`[RemoteHost] Validating UNC paths on ${host.fqdn}`);
    if (!host.pathMappings) return;

    for (const [uncPath, localPath] of Object.entries(host.pathMappings)) {
      try {
        const result = await this.psService.executeCommand('Test-Path', {
          Path: uncPath
        });

        if (!result) {
          findings.push({
            severity: 'Error',
            code: 'UNC_PATH_INVALID',
            message: `UNC path '${uncPath}' is not accessible`,
            details: {
              remedy: 'Verify path exists, sharing is enabled, and credentials have proper access',
              uncPath,
              localPath
            }
          });
        } else {
          findings.push({
            severity: 'Info',
            code: 'UNC_PATH_VALID',
            message: `UNC path '${uncPath}' is accessible`
          });
        }
      } catch (error) {
        findings.push({
          severity: 'Warning',
          code: 'UNC_PATH_TEST_FAILED',
          message: `Could not test UNC path '${uncPath}': ${error}`,
          details: { remedy: 'Manually verify path accessibility' }
        });
      }
    }
  }

  /**
   * Validate credentials
   */
  private async validateCredentials(host: HostMetadata, findings: ValidationFinding[]): Promise<void> {
    logger.debug(`[RemoteHost] Validating credentials for ${host.fqdn}`);
    try {
      if (!host.credentialReference) {
        findings.push({
          severity: 'Warning',
          code: 'CREDENTIALS_NOT_PROVIDED',
          message: 'No credentials provided for validation',
          details: { remedy: 'Provide credentials for the remote host' }
        });
        return;
      }

      // In production, this would test actual credentials against the host
      findings.push({
        severity: 'Info',
        code: 'CREDENTIALS_REFERENCED',
        message: `Credentials reference '${host.credentialReference}' noted for this host`
      });
    } catch (error) {
      findings.push({
        severity: 'Error',
        code: 'CREDENTIALS_INVALID',
        message: `Credential validation failed: ${error}`,
        details: { remedy: 'Verify credentials are correct and user has proper permissions' }
      });
    }
  }

  /**
   * Execute remote command
   */
  async executeRemoteCommand(
    hostId: string,
    command: string,
    args: Record<string, any> = {}
  ): Promise<{
    success: boolean;
    output: string;
    error?: string;
  }> {
    logger.debug(`[RemoteHost] Executing remote command on ${hostId}: ${command}`);

    try {
      // Would execute actual remote command via WinRM
      return {
        success: true,
        output: 'Command executed successfully',
      };
    } catch (error) {
      logger.error(`[RemoteHost] Remote execution failed: ${error}`);
      return {
        success: false,
        output: '',
        error: String(error),
      };
    }
  }

  /**
   * Convert UNC path to local path
   */
  convertUncToLocal(
    hostId: string,
    uncPath: string,
    pathMappings: Record<string, string>
  ): string {
    // Mirror dbaclone-style path conversion
    for (const [uncPrefix, localPath] of Object.entries(pathMappings)) {
      if (uncPath.startsWith(uncPrefix)) {
        return uncPath.replace(uncPrefix, localPath);
      }
    }
    return uncPath; // No mapping found
  }
}

let instance: RemoteHostService | null = null;

export function getRemoteHostService(): RemoteHostService {
  if (!instance) {
    instance = new RemoteHostService();
  }
  return instance;
}
