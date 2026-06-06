# FlashDB Production Docker Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying FlashDB in a production environment using Docker and Docker Compose with multi-instance scaling, load balancing, and automated backups.

**Architecture:**
- **API Tier**: 5 replicas behind Nginx load balancer (least-conn algorithm)
- **Database Tier**: SQL Server 2022 with persistent volumes
- **GUI Tier**: Single instance with caching enabled
- **Proxy Tier**: Nginx reverse proxy with SSL/TLS termination
- **Backup Tier**: PowerShell backup service with 30-day retention

---

## Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- 8GB RAM minimum, 16GB recommended
- 50GB disk space (for data, backups, logs)
- Linux/Mac or Windows with WSL2

---

## Quick Start

### 1. Prepare Deployment Directory

```bash
# Create deployment structure
mkdir -p flashdb-prod/{data/sql,data/backups,logs,docker/ssl,scripts,services}
cd flashdb-prod

# Copy production files
cp ../{Dockerfile.api.prod,Dockerfile.gui.prod,Dockerfile.powershell} .
cp ../docker-compose.prod.yml .
cp ../docker/nginx-prod.conf ./docker/
cp ../docker/init-prod.sql ./docker/
cp ../services/BackupService.ps1 ./services/
```

### 2. Configure Environment

```bash
# Create production environment file
cp .env.prod.example .env.prod

# Edit configuration
nano .env.prod  # Or vim, code, etc.
```

Key configurations to update:
- `DB_PASSWORD`: Strong password for SQL Server SA account
- `DOMAIN`: Your domain or IP address
- `BACKUP_INTERVAL_HOURS`: Backup frequency (default: 4 hours)
- `BACKUP_RETENTION_DAYS`: Retention period (default: 30 days)

### 3. Generate SSL Certificates (Production Only)

For production, use valid SSL certificates. For testing with self-signed:

```bash
# Generate self-signed certificate (valid 365 days)
mkdir -p docker/ssl
openssl req -x509 -newkey rsa:4096 -keyout docker/ssl/key.pem \
  -out docker/ssl/cert.pem -days 365 -nodes \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"
```

**For production:** Use certificates from Let's Encrypt, AWS Certificate Manager, or your CA.

### 4. Start Services

```bash
# Load environment variables
export $(cat .env.prod | grep -v '^#' | xargs)

# Build images
docker-compose -f docker-compose.prod.yml build

# Start all services
docker-compose -f docker-compose.prod.yml up -d

# Check service status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f
```

---

## Service Details

### SQL Server Database

**Container**: `flashdb-sql-prod`
**Port**: 1433 (internal only)
**Resource Limits**: 2 CPUs, 4GB RAM

```bash
# Access SQL Server
docker exec -it flashdb-sql-prod sqlcmd \
  -S localhost -U sa -P "YourPassword"
```

**Backup Locations**:
- Data: `./data/sql`
- Backups: `./data/backups`

**Health Check**: Every 15 seconds via sqlcmd query

### API Instances (5 replicas)

**Containers**: `flashdb-api-1` through `flashdb-api-5`
**Port**: 3001 (internal, proxied at `/api` through reverse proxy)
**Resource Limits**: 0.5 CPU, 512MB RAM per instance

**Endpoints**:
- Health: `http://localhost:8080/api/health`
- Operations: `http://localhost:8080/api/operations`
- VHDX: `http://localhost:8080/api/vhdx`

**Load Balancing**: Least-connection algorithm with 3-second fail timeout

```bash
# View API logs
docker-compose -f docker-compose.prod.yml logs flashdb-api-1

# Scale API instances (manual scaling)
# Edit docker-compose.prod.yml and add api-6, api-7, etc.
docker-compose -f docker-compose.prod.yml up -d api-6
```

### GUI Dashboard

**Container**: `flashdb-gui-prod`
**Port**: 3000 (internal, proxied through reverse proxy)
**Resource Limits**: 0.5 CPU, 256MB RAM

**Access**: `http://localhost` (via reverse proxy)

**Features**:
- Vite-based React application
- API proxy at `/api/`
- Asset caching (1-year cache for versioned files)
- Gzip compression enabled

### Reverse Proxy & Load Balancer

**Container**: `flashdb-reverse-proxy`
**Ports**: 80 (HTTP), 443 (HTTPS), 8080 (Internal API)
**Resource Limits**: 1 CPU, 512MB RAM

**Features**:
- SSL/TLS termination
- Load balancing across 5 API instances
- Rate limiting (100 r/s for API, 50 r/s general)
- Security headers (HSTS, X-Frame-Options, etc.)
- Gzip compression
- Health check endpoint at `/health`

```bash
# Test reverse proxy
curl http://localhost/health
curl https://localhost/health  # (requires valid cert)

# API direct access
curl http://localhost:8080/api/health
```

### Backup Service

**Container**: `flashdb-backup-service`
**Interval**: Every 4 hours (configurable)
**Retention**: 30 days (configurable)

**Operations**:
- Full database backups with compression
- Metadata backup (logs, config)
- Automated retention cleanup
- Backup manifest generation

```bash
# View backup logs
docker logs flashdb-backup-service

# Check backup status
cat ./logs/backup/backup-status.json

# List backups
ls -lah ./data/backups/
```

---

## Monitoring & Maintenance

### Health Checks

All services include health checks with automatic restart on failure:

```bash
# Check container health status
docker-compose -f docker-compose.prod.yml ps

# View health check output
docker inspect flashdb-api-1 | grep -A 5 '"Health"'
```

### Viewing Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs --tail=100 -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f flashdb-api-1

# Follow backup service
docker logs -f flashdb-backup-service

# Nginx/proxy logs
tail -f ./logs/proxy/access.log
tail -f ./logs/proxy/error.log
```

### Performance Monitoring

```bash
# Container resource usage
docker stats

# Database connections
docker exec flashdb-sql-prod sqlcmd -S localhost -U sa -P "Password" \
  -Q "SELECT count(*) FROM sys.dm_exec_sessions"

# Backup history
docker exec flashdb-sql-prod sqlcmd -S localhost -U sa -P "Password" \
  -Q "USE FlashDB; SELECT TOP 10 * FROM BackupHistory ORDER BY StartTime DESC"
```

---

## Scaling & Load Testing

### Horizontal Scaling (Add More API Instances)

Edit `docker-compose.prod.yml` and add new API services (api-6, api-7, etc.):

```yaml
api-6:
  build:
    context: .
    dockerfile: Dockerfile.api.prod
  container_name: flashdb-api-6
  # ... (copy configuration from api-5, change INSTANCE_ID)
  depends_on:
    sql-server:
      condition: service_healthy
  # ...
```

Then restart:

```bash
docker-compose -f docker-compose.prod.yml up -d api-6
```

**Nginx automatically detects and load balances across new instances.**

### Vertical Scaling (Increase Resources)

Update resource limits in `docker-compose.prod.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '1'        # Increase from 0.5
      memory: 1G       # Increase from 512M
```

Then restart:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Load Testing

```bash
# Install load testing tools
apt-get install apache2-utils  # or similar

# Test API endpoints (100 concurrent requests, 1000 total)
ab -n 1000 -c 100 http://localhost:8080/api/health

# Test GUI
ab -n 1000 -c 100 http://localhost/

# Test with keepalive
ab -k -n 1000 -c 100 http://localhost:8080/api/health
```

---

## Backup & Recovery

### Backup Strategy

**Automatic (via Backup Service)**:
- Every 4 hours: Full database backup
- Metadata backup with operation logs
- Automatic retention cleanup (30-day rotation)

**Manual Backup**:

```bash
# Create manual backup
docker exec flashdb-sql-prod sqlcmd -S localhost -U sa -P "Password" \
  -Q "BACKUP DATABASE FlashDB TO DISK = '/var/opt/mssql/backup/FlashDB_manual.bak' WITH INIT, COMPRESSION"

# Verify backup file
docker exec flashdb-backup-service ls -lah /app/backups/
```

### Recovery Procedure

**Restore from backup**:

```bash
# 1. Stop API instances (prevent DB access during restore)
docker-compose -f docker-compose.prod.yml stop api-1 api-2 api-3 api-4 api-5

# 2. Restore database
docker exec flashdb-sql-prod sqlcmd -S localhost -U sa -P "Password" \
  -Q "RESTORE DATABASE FlashDB FROM DISK = '/var/opt/mssql/backup/FlashDB_20240101_120000.bak' WITH REPLACE"

# 3. Verify restore
docker exec flashdb-sql-prod sqlcmd -S localhost -U sa -P "Password" \
  -Q "SELECT name, state_desc FROM sys.databases WHERE name = 'FlashDB'"

# 4. Restart API instances
docker-compose -f docker-compose.prod.yml up -d api-1 api-2 api-3 api-4 api-5

# 5. Wait for health checks to pass
docker-compose -f docker-compose.prod.yml ps
```

**RTO (Recovery Time Objective)**: < 1 hour for full database recovery
**RPO (Recovery Point Objective)**: 4 hours (backup interval)

---

## Troubleshooting

### API Instances Not Healthy

```bash
# Check logs
docker logs flashdb-api-1

# Check database connectivity
docker exec flashdb-api-1 curl -v http://sql-server:1433

# Verify environment variables
docker exec flashdb-api-1 env | grep DB_
```

### Database Connection Errors

```bash
# Check SQL Server health
docker exec flashdb-sql-prod sqlcmd -S localhost -U sa -P "Password" -Q "SELECT @@VERSION"

# Verify password
docker exec flashdb-sql-prod sqlcmd -S localhost -U sa -P "YourPassword" -Q "SELECT 1"

# Check network connectivity
docker exec flashdb-api-1 ping sql-server
docker network ls
docker network inspect flashdb-internal
```

### Backup Service Not Running

```bash
# Check container status
docker ps | grep backup
docker logs flashdb-backup-service

# Verify backup directory exists
docker exec flashdb-backup-service ls -la /app/backups/

# Test backup manually
docker exec flashdb-backup-service pwsh -Command ". /app/services/BackupService.ps1; Invoke-BackupCycle"
```

### High Memory Usage

```bash
# Check memory usage
docker stats

# Adjust limits in docker-compose.prod.yml
# Increase memory for specific service
# Restart: docker-compose -f docker-compose.prod.yml up -d

# Enable Node.js garbage collection logging
# Add environment variable: NODE_OPTIONS=--trace-gc
```

### SSL Certificate Issues

```bash
# Verify certificate validity
openssl x509 -in docker/ssl/cert.pem -text -noout

# Check certificate expiration
openssl x509 -enddate -noout -in docker/ssl/cert.pem

# Renew certificate (Let's Encrypt example)
certbot renew --dry-run
```

---

## Production Checklist

- [ ] Environment variables configured (`.env.prod`)
- [ ] SSL certificates installed (`docker/ssl/`)
- [ ] Backup directory mounted to external storage
- [ ] Logs directory mounted to external storage
- [ ] Database password changed from default
- [ ] Firewall rules configured (80, 443 for external; 1433 for internal only)
- [ ] Monitoring/alerting set up (optional)
- [ ] Backup retention policy reviewed
- [ ] Disaster recovery plan documented
- [ ] Load testing completed
- [ ] Security audit performed

---

## Performance Tuning

### Database Optimization

```sql
-- Update statistics
UPDATE STATISTICS OperationMetadata;
UPDATE STATISTICS VhdxOperations;
UPDATE STATISTICS ServiceMetrics;

-- Rebuild fragmented indexes
ALTER INDEX idx_operation_time ON OperationMetadata REBUILD;
```

### API Optimization

```bash
# Increase Node.js heap size
# In docker-compose.prod.yml, update CMD:
# CMD ["node", "--max-old-space-size=512", "dist/index.js"]
```

### Nginx Optimization

```nginx
# In docker/nginx-prod.conf:
- Increase worker connections: worker_connections 2048
- Enable caching: proxy_cache_path /var/cache/nginx
- Tune buffer sizes based on payload
```

---

## Cleanup & Shutdown

### Graceful Shutdown

```bash
# Stop all services gracefully (allows containers to clean up)
docker-compose -f docker-compose.prod.yml down

# Remove volumes (WARNING: deletes data)
docker-compose -f docker-compose.prod.yml down -v

# Remove images
docker-compose -f docker-compose.prod.yml down --rmi all
```

### Clean Up Old Backups Manually

```bash
# Remove backups older than 30 days
find ./data/backups -name "*.bak" -mtime +30 -delete

# View backup size
du -sh ./data/backups/
du -sh ./data/sql/
```

---

## Success Criteria

✓ **API images**: <300MB each
✓ **GUI image**: <80MB
✓ **5 API instances**: Running and healthy
✓ **Load balancing**: Requests distributed across instances
✓ **Backup service**: Running, backups created on schedule
✓ **Health checks**: All services passing
✓ **Persistent storage**: Data persists across container restarts
✓ **Reverse proxy**: SSL/TLS termination working
✓ **Recovery**: Full database restore in <1 hour

---

## Next Steps

1. **Logging & Operations**: Configure centralized logging (ELK, Splunk, etc.)
2. **Monitoring**: Set up Prometheus/Grafana for metrics
3. **Alerting**: Configure alerts for service failures
4. **CI/CD**: Automate deployments with GitHub Actions or GitLab CI
5. **Blue-Green Deployment**: Implement for zero-downtime updates

---

## Support & References

- Docker Documentation: https://docs.docker.com/
- Docker Compose: https://docs.docker.com/compose/
- SQL Server in Docker: https://mcr.microsoft.com/en-us/product/mssql/server
- Nginx Documentation: https://nginx.org/en/docs/
- PowerShell SQL Module: https://learn.microsoft.com/en-us/powershell/module/sqlserver/
