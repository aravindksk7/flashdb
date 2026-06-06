# FlashDB - Complete Docker Setup

## 🐳 Full Stack in Docker

This setup runs **everything in containers**:
- SQL Server 2022
- FlashDB REST API (Node.js with PowerShell)
- React GUI Dashboard

---

## 🚀 Quick Start (One Command)

```bash
docker-compose up --build
```

**Wait for all services to be healthy (~60 seconds)**

Then open: **http://localhost:3000**

---

## 📋 Prerequisites

- Docker Desktop installed and running
- 4GB+ RAM available
- Ports 1433, 3000, 3001 available

---

## 🎯 What Happens

1. **SQL Server starts** (~30 seconds to initialize)
   - Container: `flashdb-sql`
   - Port: 1433
   - SA Password: `FlashDB@Password123`

2. **API Server builds and starts** (~10-15 seconds)
   - Container: `flashdb-api`
   - Port: 3001
   - Includes: Node.js + PowerShell support

3. **GUI Server builds and starts** (~5-10 seconds)
   - Container: `flashdb-gui`
   - Port: 3000

4. **Test database initializes** (after SQL Server ready)
   - Creates TestDB with sample data
   - 5 customers, 5 orders, 8 products

---

## 📊 Monitoring

### View all containers
```bash
docker-compose ps
```

### View logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f gui
docker-compose logs -f sql-server
```

### Check service health
```bash
# API health
curl http://localhost:3001/health

# SQL Server connection
docker exec flashdb-sql /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P FlashDB@Password123 -Q "SELECT @@VERSION"
```

---

## 🛑 Stopping

```bash
docker-compose down
```

To also remove volumes (clean slate):
```bash
docker-compose down -v
```

---

## 🔧 Troubleshooting

### SQL Server won't start
- Check Docker has 4GB+ RAM allocated
- Check ports 1433 isn't already in use
- View logs: `docker-compose logs sql-server`

### API shows 500 errors
- Wait for SQL Server health check to pass
- Check API logs: `docker-compose logs api`
- Verify PowerShell is available: `docker exec flashdb-api pwsh --version`

### GUI can't connect to API
- Check API container is running: `docker-compose ps`
- Check API health: `curl http://localhost:3001/health`
- Verify network: `docker network ls | grep flashdb`

### Services taking too long
- First build takes longer (downloads base images)
- SQL Server initialization takes 30-60 seconds
- Be patient - monitor with `docker-compose ps`

---

## 📝 Configuration

### Change SA password
Edit `docker-compose.yml`:
```yaml
SA_PASSWORD: "YourPassword123"
```

### Change port mappings
```yaml
ports:
  - "5432:1433"  # SQL Server on custom port
  - "8080:3000"  # GUI on custom port
  - "8081:3001"  # API on custom port
```

### Persistent data
Data is stored in Docker volume `flashdb_sql-data`
- Survives container restart
- Removed with `docker-compose down -v`

---

## 🌐 Network

- **Service-to-service**: Use container names (api, sql-server, gui)
- **Host-to-container**: Use localhost:port
- **Internal network**: `flashdb_flashdb-network`

---

## 📚 Usage After Startup

Once services are running:

1. **Open GUI**: http://localhost:3000
2. **Create Golden Image**: From sample TestDB
3. **Clone Database**: Instant lightweight copies
4. **Create Checkpoints**: Save database state
5. **Restore**: Rollback to any checkpoint

---

## ✅ Full Startup Checklist

- [ ] Docker Desktop running
- [ ] Ports 1433, 3000, 3001 available
- [ ] Run: `docker-compose up --build`
- [ ] Wait for "All services healthy" message
- [ ] Open: http://localhost:3000
- [ ] Dashboard loads
- [ ] Create first golden image

---

## 🔗 Service URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **GUI** | http://localhost:3000 | Dashboard |
| **API** | http://localhost:3001/api | REST endpoints |
| **Health** | http://localhost:3001/health | API status |
| **SQL Server** | localhost:1433 | Database (internal only) |

---

## 💾 Data Persistence

- SQL Server data: `flashdb_sql-data` volume
- API logs: `flashdb_api-logs` volume
- Both persist across container restarts
- Reset with: `docker-compose down -v`

---

**Ready to run the complete stack?** ✅

```bash
docker-compose up --build
```

Open http://localhost:3000 when ready!
