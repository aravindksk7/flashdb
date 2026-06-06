# FlashDB Security Setup Guide

## Quick Start

This guide walks you through setting up FlashDB's comprehensive security features.

## Prerequisites

- Node.js 16+
- PowerShell 5.1+
- Git

## Setup Steps

### Step 1: Create Environment Configuration

```bash
# Copy the example configuration
cp .env.example .env

# Or use the automated setup script (recommended)
.\scripts\setup-secrets.ps1
```

The setup script will:
- Prompt you for all required values
- Generate secure passwords automatically
- Set restrictive file permissions (owner read/write only)
- Validate all inputs
- Create a production-ready .env file

### Step 2: Configure CORS Origins

Edit `.env` and update `CORS_ORIGINS`:

```bash
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,https://yourdomain.com
```

List all allowed frontend origins (comma-separated).

### Step 3: Generate API Keys

For each service that needs API access:

```powershell
# Generate a new secure API key
$apiKey = [Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 } | ForEach-Object { [byte]$_ }))
Write-Host $apiKey
```

Add to `.env` `VALID_API_KEYS` (comma-separated):

```bash
VALID_API_KEYS=key-1,key-2,key-3
```

### Step 4: Configure Authentication

Three authentication methods are supported:

#### API Key (Recommended for services)
```bash
curl -H "X-API-Key: your-api-key" https://api.flashdb.com/api/clones
```

#### Bearer Token (For web applications)
```bash
curl -H "Authorization: Bearer your-token" https://api.flashdb.com/api/clones
```

#### Basic Auth (Development only)
```bash
curl -u admin:password https://api.flashdb.com/api/clones
```

### Step 5: Enable HTTPS (Production Only)

For production deployments:

1. **Obtain a certificate** (Let's Encrypt):
   ```bash
   certbot certonly --standalone -d api.flashdb.com
   ```

2. **Configure in .env**:
   ```bash
   NODE_ENV=production
   TLS_CERT_PATH=/etc/letsencrypt/live/api.flashdb.com/fullchain.pem
   TLS_KEY_PATH=/etc/letsencrypt/live/api.flashdb.com/privkey.pem
   ```

3. **Update code to use HTTPS**:
   ```typescript
   import https from 'https';
   import fs from 'fs';

   const options = {
     cert: fs.readFileSync(process.env.TLS_CERT_PATH),
     key: fs.readFileSync(process.env.TLS_KEY_PATH)
   };

   https.createServer(options, app).listen(443);
   ```

### Step 6: Start the API

```bash
# Development
npm run dev

# Production build
npm run build
npm start
```

## Verification

### Check Security Headers

```bash
curl -I https://api.flashdb.com/health
```

Expected headers:
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `X-XSS-Protection: 1; mode=block`
- `Content-Security-Policy: ...`

### Test Rate Limiting

```bash
# Make 101 requests quickly
for i in {1..101}; do
  curl https://api.flashdb.com/api/clones
done

# 101st request should return 429 (Too Many Requests)
```

### Test Authentication

```bash
# Without credentials
curl https://api.flashdb.com/api/clones
# Should return 401 (Unauthorized)

# With API key
curl -H "X-API-Key: your-api-key" https://api.flashdb.com/api/clones
# Should return 200
```

### Check Audit Logs

From PowerShell:

```powershell
Import-Module .\src\FlashDB\Core\AuditLog.ps1
Get-AuditLog -Limit 10
```

From Node.js:

```typescript
import { readAuditLogs } from './middleware/audit';
const logs = readAuditLogs({ limit: 10 });
```

## Security Checklist

Before going to production:

- [ ] `.env` configured with strong passwords
- [ ] `.env` added to `.gitignore`
- [ ] API keys generated and distributed securely
- [ ] CORS origins whitelist configured
- [ ] HTTPS/TLS certificate installed
- [ ] Rate limiting tested
- [ ] Audit logging verified
- [ ] Security headers present
- [ ] Authentication working
- [ ] Error messages reviewed (no secrets exposed)
- [ ] Dependencies scanned for vulnerabilities
- [ ] Team trained on security procedures

## Maintenance

### Weekly Tasks
- Review audit logs for suspicious activity
- Check certificate expiry (90 days before)
- Monitor failed authentication attempts

### Monthly Tasks
- Rotate API keys
- Review access patterns
- Update dependencies
- Run security scans

### Quarterly Tasks
- Penetration testing
- Security review
- Incident response drill
- Policy review

## Troubleshooting

### API Key Not Working

1. Check key is in `.env` `VALID_API_KEYS`
2. Verify key format (minimum 32 characters)
3. Check header name is exactly `X-API-Key`
4. Verify no extra spaces in key

### Rate Limit Issues

1. Default: 100 requests/minute per IP
2. Check `X-RateLimit-Remaining` header
3. Wait time in `X-RateLimit-Reset` header (seconds)
4. For distributed systems, use Redis

### CORS Errors

1. Verify origin in `.env` `CORS_ORIGINS`
2. Check that preflight request succeeds
3. Verify frontend sends `Origin` header
4. Check allowed methods include your HTTP verb

### Audit Log Not Writing

1. Check `AUDIT_LOG_DIR` environment variable
2. Verify directory exists and is writable
3. Check file permissions (should be 600)
4. Review error logs for write failures

## Security Best Practices

1. **Never commit .env to git**
   - Use `.gitignore`
   - Never share with untrusted parties

2. **Rotate credentials regularly**
   - API keys every 90 days
   - Passwords every 60 days
   - Certificates before expiry

3. **Use strong passwords**
   - Minimum 32 characters
   - Mix case, numbers, special characters
   - No dictionary words
   - Use `setup-secrets.ps1` to generate

4. **Monitor audit logs**
   - Review suspicious activity
   - Track failed authentication attempts
   - Monitor rate limit violations

5. **Keep dependencies updated**
   - Run `npm audit` regularly
   - Apply security patches immediately
   - Test updates before production

6. **Use HTTPS everywhere**
   - Production only: `NODE_ENV=production`
   - Valid certificate required
   - HSTS enabled automatically

## Further Reading

- [SECURITY.md](./SECURITY.md) - Comprehensive security architecture
- [COMPLIANCE.md](./COMPLIANCE.md) - GDPR, CCPA, HIPAA compliance details
- [API_SPECIFICATION.md](./API_SPECIFICATION.md) - API endpoint documentation

## Support

For security questions:
- Email: security@flashdb.com
- Security hotline: [contact info]
- Bug bounty: bugs@flashdb.com

---

**Version**: 1.0
**Last Updated**: June 2026
**Status**: Production Ready
