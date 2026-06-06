# FlashDB Security Hardening Guide (Phase 5c)

**Version:** 1.0.0  
**Status:** Production-Ready  
**Last Updated:** 2026-06-06

Comprehensive guide to FlashDB's security hardening implementation and best practices.

---

## Table of Contents

1. [Security Architecture Overview](#security-architecture-overview)
2. [Security Middleware Stack](#security-middleware-stack)
3. [HTTPS & TLS Configuration](#https--tls-configuration)
4. [Security Headers](#security-headers)
5. [Rate Limiting](#rate-limiting)
6. [Request Validation](#request-validation)
7. [Authentication & Authorization](#authentication--authorization)
8. [Sensitive Data Protection](#sensitive-data-protection)
9. [Audit Logging](#audit-logging)
10. [Security Incident Response](#security-incident-response)
11. [Security Checklist](#security-checklist)

---

## Security Architecture Overview

### Defense in Depth Strategy

FlashDB implements multiple layers of security:

```
1. NETWORK LAYER
   - HTTPS/TLS enforcement
   - CORS policy enforcement
   - Firewall rules

2. APPLICATION LAYER
   - Security headers (CSP, X-Frame-Options, etc.)
   - Rate limiting
   - Request validation
   - Input sanitization

3. DATA LAYER
   - Encryption at rest (PostgreSQL)
   - Encryption in transit (TLS)
   - Sensitive data redaction

4. AUDIT LAYER
   - Request logging
   - Error tracking
   - Audit trail
   - Performance metrics
```

### Security Components

| Component | Status | Details |
|-----------|--------|---------|
| HTTPS Enforcement | ✅ Enabled | Production only |
| Security Headers | ✅ Complete | 7 critical headers |
| Rate Limiting | ✅ Active | 100 req/min per IP |
| Request Validation | ✅ Implemented | Size, format, patterns |
| Sensitive Data Redaction | ✅ Enabled | Passwords, tokens, keys |
| JWT Authentication | ✅ Configured | 24-hour expiry |
| RBAC Authorization | ✅ Enabled | 4+ role types |
| Audit Logging | ✅ Structured | JSON format |

---

## Security Middleware Stack

### Middleware Registration Order

All security middleware is registered early in the Express middleware chain (Phase 5c):

```typescript
// src/api/src/index.ts, lines 142-146

app.use(httpsEnforcementMiddleware);      // HTTPS only (production)
app.use(securityHeadersMiddleware);       // Security headers
app.use(rateLimitMiddleware);             // Rate limiting
app.use(requestValidationMiddleware);     // Input validation

app.use(structuredLoggingMiddleware);     // Logging
app.use(performanceMetricsMiddleware);    // Metrics
// ... routes
```

### HTTPS Enforcement Middleware

**Location:** `src/api/src/middleware/security.ts`

```typescript
export const httpsEnforcementMiddleware = (req, res, next) => {
  if (
    process.env.NODE_ENV === 'production' &&
    req.header('x-forwarded-proto') !== 'https' &&
    req.protocol !== 'https'
  ) {
    res.redirect(301, `https://${req.header('host')}${req.url}`);
    return;
  }
  next();
};
```

**Behavior:**
- Development: HTTP allowed
- Production: HTTP → HTTPS redirect (301)
- Proxy support: Checks x-forwarded-proto header

### Security Headers Middleware

**Location:** `src/api/src/middleware/security.ts`

Adds critical security headers to every response:

```typescript
export const securityHeadersMiddleware = (req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
  next();
};
```

### Rate Limiting Middleware

**Location:** `src/api/src/middleware/security.ts`

In-memory rate limiting: 100 requests per minute per IP address

```typescript
export const rateLimitMiddleware = (req, res, next) => {
  const ip = req.ip || 'unknown';
  const limit = 100;
  const windowMs = 60000; // 1 minute
  
  // Track per IP
  if (requestCount[ip] > limit) {
    res.status(429).json({
      message: 'Too many requests',
      retryAfter: resetTime
    });
    return;
  }
  
  next();
};
```

**Response Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 45
```

**Upgrade Path:** For distributed systems, replace with Redis-backed rate limiter

### Request Validation Middleware

**Location:** `src/api/src/middleware/security.ts`

Validates all incoming requests:

```typescript
export const requestValidationMiddleware = (req, res, next) => {
  // 1. Content-Type validation
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'];
    if (!contentType?.includes('application/json')) {
      return res.status(400).json({
        message: 'Content-Type must be application/json'
      });
    }
  }
  
  // 2. SQL injection pattern detection
  const suspiciousPatterns = /('|"|;|--|\/\*|\*\/|xp_|sp_)/gi;
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && suspiciousPatterns.test(value)) {
      return res.status(400).json({
        message: 'Invalid input detected'
      });
    }
  }
  
  next();
};
```

**Validations:**
- Content-Type enforcement (JSON only)
- Payload size limit (100KB, via express.json)
- SQL injection pattern detection
- Suspicious character detection

---

## HTTPS & TLS Configuration

### Production HTTPS Setup

#### Self-Signed Certificate (Development)
```powershell
# Generate self-signed certificate
$cert = New-SelfSignedCertificate `
  -CertStoreLocation 'cert:\LocalMachine\My' `
  -DnsName 'flashdb.local' `
  -NotAfter (Get-Date).AddYears(1)

# Export to PFX
Export-PfxCertificate `
  -Cert "cert:\LocalMachine\My\$cert.Thumbprint" `
  -FilePath 'C:\certs\flashdb.pfx' `
  -Password (ConvertTo-SecureString -String "password" -AsPlainText -Force)
```

#### Let's Encrypt (Production)
```bash
# Install Certbot
brew install certbot

# Generate certificate
sudo certbot certonly \
  --standalone \
  -d flashdb.example.com \
  -d api.flashdb.example.com
```

#### Node.js HTTPS Configuration
```typescript
import https from 'https';
import fs from 'fs';

const options = {
  key: fs.readFileSync('path/to/key.pem'),
  cert: fs.readFileSync('path/to/cert.pem')
};

https.createServer(options, app).listen(443, () => {
  console.log('HTTPS server running on port 443');
});
```

### TLS Configuration

#### Recommended TLS Version
```env
# Use TLS 1.2+ only
NODE_TLS_VERSION=TLSv1.2:TLSv1.3
NODE_OPTIONS=--tls-min-version=TLSv1.2
```

#### SSL/TLS Testing
```bash
# Test SSL configuration
openssl s_client -connect flashdb.example.com:443

# Check certificate
openssl x509 -in cert.pem -text -noout

# Verify certificate chain
openssl verify -CAfile ca-chain.pem cert.pem

# Test TLS version
curl -I --tlsv1.2 https://flashdb.example.com
```

---

## Security Headers

### Header Reference

| Header | Value | Purpose |
|--------|-------|---------|
| **X-Frame-Options** | DENY | Prevent clickjacking |
| **X-Content-Type-Options** | nosniff | Prevent MIME type sniffing |
| **X-XSS-Protection** | 1; mode=block | Enable XSS protection (legacy) |
| **Content-Security-Policy** | [see below] | Control resource loading |
| **Strict-Transport-Security** | max-age=31536000 | Force HTTPS (1 year) |
| **Referrer-Policy** | strict-origin-when-cross-origin | Control referrer sharing |
| **Permissions-Policy** | [see below] | Restrict browser features |

### Content Security Policy (CSP)

```
default-src 'self'              # Default to same origin
script-src 'self' ...           # JavaScript sources
style-src 'self' 'unsafe-inline' # CSS sources
img-src 'self' data: https:     # Image sources
font-src 'self'                 # Font sources
connect-src 'self' https:       # Network connections
frame-ancestors 'none'          # Embedding prevention
base-uri 'self'                 # Base URL restriction
form-action 'self'              # Form submission targets
```

### Permissions Policy

```
geolocation=()      # Disable geolocation
microphone=()       # Disable microphone
camera=()          # Disable camera
usb=()             # Disable USB access
```

### Header Verification

```bash
# Test headers
curl -I https://api.flashdb.example.com

# Check specific header
curl -I https://api.flashdb.example.com | grep "X-Frame-Options"

# Automated scanning
npm install -g snyk
snyk test --file=package.json
```

---

## Rate Limiting

### Current Configuration

**Limit:** 100 requests per minute per IP address  
**Window:** 60-second sliding window  
**Storage:** In-memory (single instance)

### Rate Limit Headers

Every response includes rate limit headers:
```
X-RateLimit-Limit: 100          # Total requests allowed
X-RateLimit-Remaining: 95       # Requests remaining
X-RateLimit-Reset: 45           # Seconds until reset
```

### Rate Limit Response

When exceeded:
```http
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 60

{
  "success": false,
  "message": "Too many requests, please try again later",
  "retryAfter": 60
}
```

### Configuration

```typescript
// src/api/src/middleware/security.ts

const limit = 100;              // Requests
const windowMs = 60000;         // Per 1 minute

// To modify: edit src/api/src/middleware/security.ts
```

### Distributed Rate Limiting

For multi-instance deployments, upgrade to Redis-backed rate limiter:

```typescript
import RedisStore from 'rate-limit-redis';
import redis from 'redis';

const redisClient = redis.createClient();

const rateLimitMiddleware = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'rl:' // rate limit prefix
  }),
  windowMs: 60000,
  max: 100
});
```

---

## Request Validation

### Size Limits

```typescript
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ limit: '100kb', extended: true }));
```

**Default:** 100KB per request  
**Configuration:** Modify in `src/api/src/index.ts`

### Input Validation

#### Pattern Detection
```typescript
const suspiciousPatterns = [
  /'/,              // Single quote
  /"/,              // Double quote
  /;/,              // Semicolon
  /--/,             // SQL comment
  /\/\*/,           // Block comment start
  /\*\//,           // Block comment end
  /xp_/i,           // SQL Server proc
  /sp_/i            // SQL Server proc
];
```

#### Validation Examples

```bash
# Valid request
curl -X POST http://localhost:3001/api/clones \
  -H "Content-Type: application/json" \
  -d '{"name":"my-clone","size":10}'

# Invalid: SQL injection attempt (rejected)
curl -X POST http://localhost:3001/api/clones \
  -H "Content-Type: application/json" \
  -d '{"name":"test\"; DROP TABLE clones; --"}'

# Invalid: Wrong content type (rejected)
curl -X POST http://localhost:3001/api/clones \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d 'name=my-clone'

# Invalid: Oversized payload (rejected)
curl -X POST http://localhost:3001/api/clones \
  -H "Content-Type: application/json" \
  -d '[large 101KB+ payload]'
```

---

## Authentication & Authorization

### JWT Authentication

#### Token Generation
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user@example.com","password":"password"}'

# Response
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 86400,
  "refreshToken": "..."
}
```

#### Token Usage
```bash
curl http://localhost:3001/api/clones \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

#### Token Configuration
```env
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRY_HOURS=24
JWT_REFRESH_ENABLED=true
```

### Role-Based Access Control (RBAC)

#### Built-in Roles
- **admin** - Full access, user management
- **operator** - Operational tasks, monitoring
- **viewer** - Read-only access
- **system** - System-level operations

#### Permission System
```bash
# List permissions
curl http://localhost:3001/api/auth/permissions

# Assign role
curl -X POST http://localhost:3001/api/rbac/assign-role \
  -H "Authorization: Bearer token" \
  -d '{"userId":"user-id","roleId":"operator"}'

# Verify access
curl -H "Authorization: Bearer token" \
  http://localhost:3001/api/admin/instance
```

---

## Sensitive Data Protection

### Data Redaction Strategy

#### Redacted Fields
- password
- token
- secret
- apiKey / api_key
- authorization
- credential
- sql_password
- db_password

#### Logging
```json
{
  "requestId": "uuid",
  "path": "/api/auth/login",
  "body": {
    "username": "user@example.com",
    "password": "[REDACTED]"
  }
}
```

#### Error Messages
```json
{
  "error": "Authentication failed",
  "detail": "[REDACTED]"
}
```

### Environment Variable Protection

Never commit secrets to version control:
```bash
# Good: Use .env file (in .gitignore)
echo "JWT_SECRET=actual-secret" > .env

# Bad: Hardcoded secrets
const secret = "hardcoded-secret";  // ❌ Don't do this

# Bad: Committed to git
# .env (committed) ❌
JWT_SECRET=actual-secret
```

### Encryption at Rest

#### PostgreSQL Encryption
```sql
-- Enable encrypted columns (pgcrypto extension)
CREATE EXTENSION pgcrypto;

-- Store encrypted password
INSERT INTO users (username, password)
VALUES ('user@example.com', pgp_sym_encrypt('password', 'encryption-key'));

-- Decrypt for verification
SELECT pgp_sym_decrypt(password, 'encryption-key') FROM users;
```

---

## Audit Logging

### Request Audit Trail

Every request is logged with:
- Request ID (UUID)
- Timestamp
- Method & path
- Status code
- Duration
- Client IP
- User agent
- Query parameters (redacted)

```json
{
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "timestamp": "2026-06-06T14:30:45.000Z",
  "method": "POST",
  "path": "/api/clones",
  "statusCode": 201,
  "duration": 2150,
  "clientIp": "192.168.1.100",
  "userAgent": "curl/7.68.0",
  "operation": "post-clones"
}
```

### Error Audit Trail

All errors logged with context:
```json
{
  "level": "error",
  "message": "Database connection failed",
  "timestamp": "2026-06-06T14:30:45.000Z",
  "requestId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "statusCode": 500,
  "operation": "get-clones",
  "errorMessage": "ECONNREFUSED 127.0.0.1:5432",
  "stack": "[error stack trace]"
}
```

### Security Event Logging

```json
{
  "level": "warn",
  "message": "Rate limit exceeded",
  "clientIp": "192.168.1.100",
  "endpoint": "/api/clones",
  "limit": 100,
  "timestamp": "2026-06-06T14:30:45.000Z"
}
```

### Log Access Control

```bash
# Restrict log file access
chmod 640 logs/combined.log
chmod 640 logs/error.log
chmod 640 logs/exceptions.log

# Windows ACLs
icacls "C:\flashdb\logs" /grant "%USERNAME%:(OI)(CI)F" /T
icacls "C:\flashdb\logs" /remove "Everyone" /T
```

---

## Security Incident Response

### Incident Classification

| Level | Impact | Response Time |
|-------|--------|----------------|
| CRITICAL | Full compromise, data loss | Immediate (< 1 hour) |
| HIGH | Significant access, data exposure | Fast (< 4 hours) |
| MEDIUM | Limited access, partial exposure | Standard (< 24 hours) |
| LOW | Minor issue, no data impact | Normal (< 1 week) |

### Incident Response Procedures

#### Step 1: Detection
```bash
# Monitor logs for suspicious activity
grep -i "error\|warn\|exception" logs/combined.log

# Check rate limit violations
grep "Rate limit exceeded" logs/combined.log

# Check for SQL injection attempts
grep -i "suspicious pattern" logs/error.log
```

#### Step 2: Containment
```bash
# Stop the affected service
systemctl stop flashdb-api

# Isolate the instance
# Disconnect from network / modify security group rules
```

#### Step 3: Investigation
```bash
# Collect logs
tar -czf incident-logs-$(date +%Y%m%d-%H%M%S).tar.gz logs/

# Check system integrity
find . -type f -newer incident.log -ls > modified-files.log

# Review audit trail
cat logs/combined.log | jq 'select(.statusCode >= 400)' > errors.log
```

#### Step 4: Remediation
```bash
# Reset credentials
UPDATE users SET password = crypt('new_password', gen_salt('bf')) WHERE role = 'admin';

# Restart service
systemctl restart flashdb-api

# Verify
curl http://localhost:3001/health
```

#### Step 5: Post-Incident
- Document findings
- Update security procedures
- Patch vulnerabilities
- Notify affected users
- Plan security improvements

### Reporting Security Issues

```
To: security@flashdb.example.com
Subject: Security Vulnerability Report - [Component]

1. Description of vulnerability
2. Steps to reproduce
3. Potential impact
4. Suggested fix

DO NOT publicly disclose until patched.
```

---

## Security Checklist

### Pre-Deployment

- [ ] HTTPS certificate obtained
- [ ] TLS version 1.2+ configured
- [ ] JWT secret set (min 32 chars)
- [ ] CORS origins configured
- [ ] Rate limiting configured
- [ ] Security headers verified
- [ ] Input validation enabled
- [ ] Database encrypted
- [ ] Logs configured
- [ ] Backup procedures tested

### Production Deployment

- [ ] NODE_ENV=production
- [ ] All environment variables set
- [ ] Security headers present
- [ ] Rate limiting active
- [ ] HTTPS enforced
- [ ] Firewall rules configured
- [ ] SSH key rotated
- [ ] Database password changed
- [ ] Log monitoring enabled
- [ ] Incident response plan ready

### Ongoing Maintenance

- [ ] Security patches applied
- [ ] Dependencies updated
- [ ] Audit logs reviewed
- [ ] Rate limits adjusted
- [ ] SSL certificate renewed
- [ ] Backups verified
- [ ] Security training completed
- [ ] Incident logs cleaned
- [ ] Access control reviewed
- [ ] Penetration testing scheduled

---

## References

- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **CWE/SANS Top 25:** https://cwe.mitre.org/top25/
- **NIST Cybersecurity Framework:** https://www.nist.gov/cyberframework
- **Node.js Security Best Practices:** https://nodejs.org/en/docs/guides/security/

---

**Document Version:** 1.0.0  
**Last Updated:** 2026-06-06  
**Status:** Production-Ready
