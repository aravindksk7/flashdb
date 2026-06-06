# FlashDB Security Architecture

## Overview

This document outlines the comprehensive security architecture and measures implemented in FlashDB to protect against threats, maintain confidentiality and integrity of data, and ensure compliance with security best practices.

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [API Security](#api-security)
3. [Data Protection](#data-protection)
4. [Secrets Management](#secrets-management)
5. [Audit Logging](#audit-logging)
6. [Security Headers](#security-headers)
7. [CORS Policy](#cors-policy)
8. [Rate Limiting](#rate-limiting)
9. [HTTPS/TLS](#httpstls)
10. [Vulnerability Reporting](#vulnerability-reporting)
11. [Incident Response](#incident-response)
12. [Security Checklist](#security-checklist)

## Authentication & Authorization

### Authentication Methods

FlashDB supports multiple authentication methods for flexibility and security:

#### 1. Bearer Token Authentication
- **Format**: `Authorization: Bearer <token>`
- **Validity**: 24 hours from creation
- **Inactivity Timeout**: 1 hour
- **Use Case**: Long-running sessions, web applications

```bash
curl -H "Authorization: Bearer <token>" https://api.flashdb.com/api/clones
```

#### 2. API Key Authentication
- **Format**: `X-API-Key: <key>`
- **Length**: Minimum 32 characters
- **Rotation**: Recommended every 90 days
- **Use Case**: Service-to-service communication, CLI tools

```bash
curl -H "X-API-Key: <key>" https://api.flashdb.com/api/clones
```

#### 3. Basic Authentication
- **Format**: `Authorization: Basic base64(username:password)`
- **Use Case**: Legacy systems, development environments
- **Note**: Only use over HTTPS in production

```bash
curl -u username:password https://api.flashdb.com/api/clones
```

### Session Management

- **Session Storage**: In-memory (single instance) or Redis (distributed)
- **Session Timeout**: 24 hours absolute
- **Inactivity Timeout**: 1 hour
- **Automatic Cleanup**: Expired sessions cleaned every 10 minutes

### Authorization

Authorization is role-based:

```
Admin
├── Create API keys
├── View audit logs
├── Manage users
└── Configure security settings

User
├── Create/manage own resources
├── View own audit log
└── Cannot access admin functions

Service Account
├── API key authentication
└── Limited to configured permissions
```

## API Security

### Request Validation

All incoming requests are validated for:

1. **Content-Type Validation**
   - POST/PUT/PATCH must be `application/json`
   - Rejected if content-type is missing or incorrect

2. **Payload Size Limits**
   - Default: 100KB per request
   - Configurable via `REQUEST_MAX_SIZE` environment variable
   - Prevents DoS attacks via large payloads

3. **Input Sanitization**
   - SQL injection pattern detection
   - Command injection prevention
   - XSS payload filtering

4. **Schema Validation**
   - Using class-validator library
   - Type checking on all inputs
   - Required field validation

### Response Security

All API responses include:

- **Request ID**: `X-Request-ID` header for tracing
- **Security Headers**: See [Security Headers](#security-headers)
- **Error Handling**: Generic error messages (specific details in logs)
- **No Sensitive Data**: Passwords, keys, tokens never in responses

## Data Protection

### Encryption at Rest

- VHDX files encrypted with BitLocker (Windows)
- Database files encrypted with Transparent Data Encryption (TDE)
- Backup files stored with AES-256 encryption

### Encryption in Transit

- HTTPS/TLS 1.2+ mandatory in production
- Certificate pinning for critical connections
- Perfect Forward Secrecy enabled

### Sensitive Data Handling

Sensitive fields automatically redacted from:
- Log files
- Error messages
- Audit logs
- API responses

**Sensitive fields include**:
- password, token, apiKey, api_key
- secret, credential, authorization
- sql_password, db_password

Example redaction:
```json
{
  "username": "admin",
  "password": "[REDACTED]",
  "api_key": "[REDACTED]"
}
```

## Secrets Management

### Environment Variables

All secrets are stored in `.env` file (NOT in code):

```bash
# Copy example to create .env
cp .env.example .env

# Edit with your values
# NEVER commit .env to git
echo ".env" >> .gitignore
```

### Required Secrets

| Variable | Description | Example |
|----------|-------------|---------|
| API_USERNAME | API admin username | admin |
| API_PASSWORD | API admin password | (32-char strong password) |
| VALID_API_KEYS | Comma-separated API keys | key1,key2,key3 |
| SQL_PASSWORD | Database password | (32-char strong password) |
| CORS_ORIGINS | Allowed origins | http://localhost:3000 |

### Setup Script

Use the automated setup script:

```powershell
# Interactive setup with prompts
.\scripts\setup-secrets.ps1

# Force overwrite existing .env
.\scripts\setup-secrets.ps1 -Force

# Auto-generate all secrets
.\scripts\setup-secrets.ps1 -Generate
```

The script:
- ✓ Prompts for all required values
- ✓ Generates secure passwords automatically
- ✓ Sets restrictive file permissions (owner read/write only)
- ✓ Validates input format
- ✓ Prevents accidental overwrites

### Key Rotation

**API Keys**:
- Generate new key
- Update `VALID_API_KEYS` in .env
- Test with new key
- Remove old key after grace period (7 days)

**Database Password**:
- Update `SQL_PASSWORD` in .env
- Update database password
- Restart API service
- Verify connectivity

**Certificates**:
- Rotate annually (or per certificate policy)
- Update `TLS_CERT_PATH` and `TLS_KEY_PATH`
- Restart API service
- Monitor for certificate expiry (90 days before)

## Audit Logging

### What is Logged

**State-Changing Operations**:
- CREATE: Clone created, checkpoint created, batch started
- UPDATE: Configuration changed, resource modified
- DELETE: Clone deleted, checkpoint deleted, batch cancelled
- LOGIN: User login events
- LOGOUT: User logout events
- ERROR: All HTTP errors (4xx, 5xx)

**Audit Log Entry Structure**:
```json
{
  "id": "20260606144532-abc123",
  "timestamp": "2026-06-06T14:45:32Z",
  "userId": "admin",
  "operation": "CREATE",
  "resource": "clone",
  "resourceId": "clone-001",
  "method": "POST",
  "path": "/api/clones",
  "statusCode": 201,
  "ipAddress": "192.168.1.100",
  "changes": {
    "before": null,
    "after": { "id": "clone-001", "status": "created" }
  },
  "duration": 125
}
```

### Accessing Audit Logs

**From Node.js API**:
```typescript
import { readAuditLogs, getAuditLogStats } from './middleware/audit';

// Get recent logs
const logs = readAuditLogs();

// Get logs with filters
const logs = readAuditLogs({
  userId: 'admin',
  operation: 'DELETE',
  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
});

// Get statistics
const stats = getAuditLogStats();
```

**From PowerShell**:
```powershell
# Import audit module
Import-Module .\src\FlashDB\Core\AuditLog.ps1

# Get recent audit logs
Get-AuditLog -Limit 50

# Filter by resource
Get-AuditLog -Filter @{Resource='Clone'} -Limit 100

# Get statistics
Get-AuditLogStats
```

### Audit Log Storage

- **Location**: `./logs/audit/` directory
- **File Format**: JSON lines (one entry per line)
- **Rotation**: Daily files (date-based)
- **Retention**: 90 days minimum (configure per compliance requirements)
- **Permissions**: Owner read/write only (600)
- **Immutable**: Append-only, no modifications after creation

## Security Headers

All API responses include security headers:

| Header | Value | Purpose |
|--------|-------|---------|
| X-Frame-Options | DENY | Prevent clickjacking |
| X-Content-Type-Options | nosniff | Prevent MIME type sniffing |
| X-XSS-Protection | 1; mode=block | Enable XSS protection (older browsers) |
| Content-Security-Policy | (see below) | Restrict resource loading |
| Referrer-Policy | strict-origin-when-cross-origin | Control referrer information |
| Permissions-Policy | (see below) | Disable dangerous features |
| Strict-Transport-Security | max-age=31536000 | Enforce HTTPS (production only) |

### Content Security Policy

```
default-src 'self'
script-src 'self' 'unsafe-inline' 'unsafe-eval'
style-src 'self' 'unsafe-inline'
img-src 'self' data: https:
font-src 'self'
connect-src 'self' https:
frame-ancestors 'none'
base-uri 'self'
form-action 'self'
```

### Permissions Policy

```
geolocation=(), microphone=(), camera=()
```

## CORS Policy

### Configuration

CORS is configured with origin whitelisting:

```typescript
const corsOptions = {
  origin: ['http://localhost:3000', 'http://localhost:5173', 'https://app.flashdb.com'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  exposedHeaders: ['X-Total-Count', 'X-RateLimit-Remaining'],
  maxAge: 86400
}
```

### Adding Origins

To allow a new origin:

1. Update `CORS_ORIGINS` in `.env`:
   ```
   CORS_ORIGINS=http://localhost:3000,http://localhost:5173,https://newapp.com
   ```

2. Restart API service

3. Verify with preflight request:
   ```bash
   curl -X OPTIONS -H "Origin: https://newapp.com" \
     -H "Access-Control-Request-Method: GET" \
     https://api.flashdb.com/api/clones
   ```

## Rate Limiting

### Configuration

Default: **100 requests per minute per IP**

```
Limit: 100 req/min
Window: 60 seconds
Reset: Automatic
```

### Rate Limit Headers

Every response includes:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 45
```

### Handling Rate Limits

When rate limit exceeded (429 status):

```json
{
  "success": false,
  "message": "Too many requests, please try again later",
  "retryAfter": 45
}
```

Retry after `retryAfter` seconds.

### Customizing Rate Limits

For distributed systems, use Redis:

```typescript
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';

const limiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:'
  }),
  windowMs: 60 * 1000,
  max: 100
});
```

## HTTPS/TLS

### Production Requirements

In production environment (`NODE_ENV=production`):

- ✓ HTTPS mandatory
- ✓ TLS 1.2 or higher
- ✓ Strong cipher suites
- ✓ HSTS enabled (Strict-Transport-Security)
- ✓ Certificate validation

### Certificate Setup

**Self-Signed (Development Only)**:
```bash
# Generate self-signed certificate
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes
```

**Production (Let's Encrypt)**:
```bash
# Use certbot to obtain free certificates
certbot certonly --standalone -d api.flashdb.com
```

### Configuring TLS

Set environment variables:

```bash
TLS_CERT_PATH=/etc/letsencrypt/live/api.flashdb.com/fullchain.pem
TLS_KEY_PATH=/etc/letsencrypt/live/api.flashdb.com/privkey.pem
```

### Certificate Monitoring

Monitor certificate expiry:

```powershell
# Check certificate expiry
$cert = Get-ChildItem -Path Cert:\LocalMachine\My | Where-Object {$_.Subject -match "flashdb"}
$daysUntilExpiry = ($cert.NotAfter - (Get-Date)).Days
if ($daysUntilExpiry -lt 90) {
  Write-Warning "Certificate expires in $daysUntilExpiry days"
}
```

## Vulnerability Reporting

### Security Policy

If you discover a security vulnerability in FlashDB:

1. **Do NOT** open a public GitHub issue
2. **Do NOT** publicly disclose the vulnerability
3. **Email**: security@flashdb.com with:
   - Description of the vulnerability
   - Steps to reproduce
   - Impact assessment
   - Proof of concept (if safe to include)

### Reporting Process

1. **Confirmation**: We will confirm receipt within 24 hours
2. **Investigation**: We investigate and develop a fix (typically 3-5 days)
3. **Patch**: A patch release is prepared and released
4. **Disclosure**: Vulnerability disclosed after patch is available
5. **Credit**: Researcher credited (with permission)

### Responsible Disclosure Timeline

- Day 1: Report submitted
- Day 2: Confirmation of receipt
- Day 7: Target fix date
- Day 8: Patch release
- Day 14: Public disclosure (if applicable)

## Incident Response

### Security Incident Definition

Security incidents include:
- Unauthorized access to systems or data
- Data breach or data loss
- Malware or ransomware infection
- Denial of Service attack
- Exploitation of security vulnerabilities
- Credential compromise

### Incident Response Procedure

#### Phase 1: Detection & Analysis (0-2 hours)
- Detect incident via monitoring/logging
- Assess severity level (Critical/High/Medium/Low)
- Notify incident response team
- Preserve evidence (logs, memory dumps)

#### Phase 2: Containment (2-6 hours)
- Isolate affected systems
- Prevent further compromise
- Revoke compromised credentials
- Block malicious IP addresses

#### Phase 3: Investigation (6-48 hours)
- Determine root cause
- Identify affected data/users
- Timeline of events
- Document findings

#### Phase 4: Recovery (48+ hours)
- Restore systems from clean backups
- Apply security patches
- Reset credentials
- Restore service

#### Phase 5: Post-Incident (ongoing)
- Communicate with affected users
- Complete incident report
- Implement preventive measures
- Update security controls

### Incident Classification

**Critical**: Unauthorized access, data breach, service down
- Response time: Immediate
- Escalation: Executive level

**High**: Potential compromise, vulnerability exploitation
- Response time: 1 hour
- Escalation: Security team lead

**Medium**: Suspicious activity, failed attacks
- Response time: 4 hours
- Escalation: Security team

**Low**: Configuration issues, minor security gaps
- Response time: 1 business day
- Escalation: Development team

## Security Checklist

### Pre-Deployment Checklist

- [ ] All secrets in `.env` file (not in code)
- [ ] `.env` file in `.gitignore`
- [ ] HTTPS/TLS certificate valid and configured
- [ ] Strong API password (32+ characters, mixed case, numbers, special)
- [ ] API keys rotated and documented
- [ ] CORS origins whitelist reviewed
- [ ] Rate limiting configured
- [ ] Audit logging enabled
- [ ] Security headers validated
- [ ] Input validation working
- [ ] Error messages reviewed (no sensitive data)
- [ ] Dependencies scanned for vulnerabilities

### Post-Deployment Checklist

- [ ] HTTPS/TLS working
- [ ] Rate limiting active
- [ ] Audit logs collecting
- [ ] Security headers present (verify with curl)
- [ ] CORS working correctly
- [ ] Authentication working
- [ ] Error handling functioning
- [ ] Monitoring alerts configured
- [ ] Backup strategy verified
- [ ] Incident response plan documented
- [ ] Team security training completed

### Regular Security Tasks

**Weekly**:
- Review audit logs for suspicious activity
- Check certificate expiry
- Monitor failed authentication attempts

**Monthly**:
- Review API key usage
- Rotate inactive keys
- Update dependencies
- Run security scans

**Quarterly**:
- Penetration testing
- Security review
- Incident response drill
- Policy review

**Annually**:
- Full security audit
- Certificate renewal planning
- Team security training
- Compliance review

## Contact & Support

For security questions or concerns:

- **Security Team**: security@flashdb.com
- **Bug Bounty**: bugs@flashdb.com
- **Documentation**: docs@flashdb.com

---

**Last Updated**: June 2026
**Version**: 1.0
**Status**: Production Ready
