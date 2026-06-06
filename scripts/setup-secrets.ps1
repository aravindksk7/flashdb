################################################################################
# setup-secrets.ps1
# Secure Secrets Configuration Script for FlashDB
#
# Prompts user for sensitive configuration values and creates a secure .env file
# Features:
# - Interactive prompts for all required secrets
# - Password generation helper
# - Input validation
# - Secure file permissions (owner read/write only)
# - Prevents overwriting existing .env files without confirmation
################################################################################

[CmdletBinding()]
param(
  [Parameter()]
  [string]$EnvFilePath = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) ".env"),

  [Parameter()]
  [switch]$Force,

  [Parameter()]
  [switch]$Generate
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  FlashDB Secrets Configuration Setup                       ║" -ForegroundColor Cyan
Write-Host "║  This script configures sensitive values for the API       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check if .env already exists
if (Test-Path $EnvFilePath) {
  if (-not $Force) {
    Write-Host "⚠️  .env file already exists at: $EnvFilePath" -ForegroundColor Yellow
    $response = Read-Host "Do you want to overwrite it? (y/n)"
    if ($response -ne 'y') {
      Write-Host "Setup cancelled." -ForegroundColor Yellow
      exit 0
    }
  }
}

<#
.SYNOPSIS
  Generates a random secure password
.OUTPUTS
  [string] A secure random password (32 chars, mixed case, numbers, special chars)
#>
function New-SecurePassword {
  [CmdletBinding()]
  param(
    [Parameter()]
    [int]$Length = 32
  )

  $characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  $password = ""

  for ($i = 0; $i -lt $Length; $i++) {
    $password += $characters[$(Get-Random -Minimum 0 -Maximum $characters.Length)]
  }

  return $password
}

<#
.SYNOPSIS
  Validates an API key format
.PARAMETER ApiKey
  The API key to validate
.OUTPUTS
  [bool] True if valid, false otherwise
#>
function Test-ApiKeyFormat {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory = $true)]
    [string]$ApiKey
  )

  # API keys should be at least 32 characters
  return $ApiKey.Length -ge 32
}

<#
.SYNOPSIS
  Generates a secure API key
.OUTPUTS
  [string] A secure random API key
#>
function New-ApiKey {
  return [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 } | ForEach-Object { [byte]$_ }))
}

Write-Host ""
Write-Host "STEP 1: Environment Configuration" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

$environment = Read-Host "Environment (development/staging/production) [development]"
if ([string]::IsNullOrWhiteSpace($environment)) { $environment = "development" }

$port = Read-Host "API Port [3001]"
if ([string]::IsNullOrWhiteSpace($port)) { $port = "3001" }

Write-Host ""
Write-Host "STEP 2: API Authentication Credentials" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

$apiUsername = Read-Host "API Username [admin]"
if ([string]::IsNullOrWhiteSpace($apiUsername)) { $apiUsername = "admin" }

# Get password securely
Write-Host "Enter API Password (or press Enter to generate a secure password)"
$apiPassword = Read-Host -AsSecureString "API Password"
$apiPasswordPlain = [System.Net.NetworkCredential]::new("", $apiPassword).Password

if ([string]::IsNullOrWhiteSpace($apiPasswordPlain)) {
  $apiPasswordPlain = New-SecurePassword
  Write-Host "Generated secure password: $apiPasswordPlain" -ForegroundColor Green
}

Write-Host ""
Write-Host "STEP 3: API Keys" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

Write-Host "Generate API keys for external clients (comma-separated list)"
Write-Host "Press Enter to generate 2 default API keys automatically"

$apiKeysInput = Read-Host "API Keys"

if ([string]::IsNullOrWhiteSpace($apiKeysInput)) {
  $apiKey1 = New-ApiKey
  $apiKey2 = New-ApiKey
  $validApiKeys = "$apiKey1,$apiKey2"
  Write-Host "Generated API Key 1: $apiKey1" -ForegroundColor Green
  Write-Host "Generated API Key 2: $apiKey2" -ForegroundColor Green
}
else {
  $validApiKeys = $apiKeysInput
}

Write-Host ""
Write-Host "STEP 4: CORS Configuration" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

$corsOrigins = Read-Host "CORS Origins (comma-separated) [http://localhost:3000,http://localhost:5173]"
if ([string]::IsNullOrWhiteSpace($corsOrigins)) {
  $corsOrigins = "http://localhost:3000,http://localhost:5173"
}

Write-Host ""
Write-Host "STEP 5: Database Configuration" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

$flashdbPath = Read-Host "FlashDB Module Path [C:\flashdb\src\FlashDB\FlashDB.psm1]"
if ([string]::IsNullOrWhiteSpace($flashdbPath)) {
  $flashdbPath = "C:\flashdb\src\FlashDB\FlashDB.psm1"
}

$sqlPassword = Read-Host -AsSecureString "SQL Server Password (or press Enter to generate)"
$sqlPasswordPlain = [System.Net.NetworkCredential]::new("", $sqlPassword).Password

if ([string]::IsNullOrWhiteSpace($sqlPasswordPlain)) {
  $sqlPasswordPlain = New-SecurePassword
  Write-Host "Generated secure SQL password: $sqlPasswordPlain" -ForegroundColor Green
}

Write-Host ""
Write-Host "STEP 6: Logging Configuration" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray

$logLevel = Read-Host "Log Level (debug/info/warn/error) [info]"
if ([string]::IsNullOrWhiteSpace($logLevel)) { $logLevel = "info" }

$auditLogDir = Read-Host "Audit Log Directory [./logs/audit]"
if ([string]::IsNullOrWhiteSpace($auditLogDir)) { $auditLogDir = "./logs/audit" }

Write-Host ""
Write-Host "Summary of Configuration" -ForegroundColor Yellow
Write-Host "─────────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host "Environment:     $environment"
Write-Host "Port:            $port"
Write-Host "API Username:    $apiUsername"
Write-Host "API Password:    [REDACTED]"
Write-Host "CORS Origins:    $corsOrigins"
Write-Host "Log Level:       $logLevel"
Write-Host "Audit Log Dir:   $auditLogDir"
Write-Host ""

$confirm = Read-Host "Create .env file with these settings? (y/n)"
if ($confirm -ne 'y') {
  Write-Host "Setup cancelled." -ForegroundColor Yellow
  exit 0
}

Write-Host ""
Write-Host "Creating .env file..." -ForegroundColor Cyan

# Create .env content
$envContent = @"
# FlashDB Configuration
# Generated by setup-secrets.ps1
# Created: $(Get-Date -Format 'o')

# Environment
NODE_ENV=$environment
PORT=$port

# Security - API Authentication
API_USERNAME=$apiUsername
API_PASSWORD=$apiPasswordPlain
VALID_API_KEYS=$validApiKeys

# Security - CORS
CORS_ORIGINS=$corsOrigins

# Security - Session
SESSION_TIMEOUT_MINUTES=1440
INACTIVITY_TIMEOUT_MINUTES=60

# Database
FLASHDB_MODULE_PATH=$flashdbPath
SQL_PASSWORD=$sqlPasswordPlain

# Logging
LOG_LEVEL=$logLevel
AUDIT_LOG_DIR=$auditLogDir

# Optional: TLS/HTTPS
# TLS_CERT_PATH=/path/to/cert.pem
# TLS_KEY_PATH=/path/to/key.pem

# Optional: Redis for distributed rate limiting
# REDIS_URL=redis://localhost:6379
"@

# Write .env file
try {
  Set-Content -Path $EnvFilePath -Value $envContent -Encoding UTF8
  Write-Host "✓ .env file created successfully" -ForegroundColor Green

  # Set secure permissions (owner read/write only)
  $filePath = (Resolve-Path $EnvFilePath).Path

  # Remove existing ACL
  $Acl = Get-Acl $filePath
  $Acl.SetAccessRuleProtection($true, $false)
  $Acl.Access | ForEach-Object {
    $Acl.RemoveAccessRule($_) | Out-Null
  }

  # Add owner-only access
  $AccessRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
    [System.Security.Principal.WindowsIdentity]::GetCurrent().User,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  $Acl.AddAccessRule($AccessRule)
  Set-Acl $filePath $Acl

  # Also use icacls for Windows-specific permissions
  $userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  icacls $filePath /inheritance:r /grant:r "$([System.Security.Principal.WindowsIdentity]::GetCurrent().Name):(F)" | Out-Null

  Write-Host "✓ File permissions set to owner read/write only" -ForegroundColor Green
}
catch {
  Write-Host "✗ Failed to create .env file: $_" -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  Setup Complete!                                          ║" -ForegroundColor Green
Write-Host "║  File: $($EnvFilePath)" -ForegroundColor Green
Write-Host "║                                                           ║" -ForegroundColor Green
Write-Host "║  Next steps:                                              ║" -ForegroundColor Green
Write-Host "║  1. Review the .env file for any custom settings         ║" -ForegroundColor Green
Write-Host "║  2. NEVER commit .env to version control                 ║" -ForegroundColor Green
Write-Host "║  3. Add .env to .gitignore                               ║" -ForegroundColor Green
Write-Host "║  4. Start the API: npm run dev                           ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Green

Write-Host ""
Write-Host "⚠️  IMPORTANT: Keep your .env file secure and never commit it to version control!"
