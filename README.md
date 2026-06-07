# FlashDB v1.0.0

**Enterprise-Grade Database Cloning & Management System**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version 1.0.0](https://img.shields.io/badge/Version-1.0.0-blue.svg)](https://github.com/aravindksk7/flashdb)
[![Status: Production Ready](https://img.shields.io/badge/Status-Production%20Ready-green.svg)](https://github.com/aravindksk7/flashdb)

FlashDB is a production-ready database cloning and management system designed for rapid development, testing, and multi-instance deployment. Create golden image snapshots, generate instant database clones, and manage checkpoints with an intuitive web interface.

## ✨ Key Features

### 🚀 Core Functionality
- **Golden Images** - Create and manage database snapshots for instant cloning
- **Database Clones** - Spin up full database copies in seconds with minimal storage overhead
- **Checkpoint Management** - Create, restore, and manage restore points for clones
- **Real-Time Metrics** - Monitor connection pools, task queues, and cluster health
- **Multi-Instance Support** - Deploy and manage multiple instances in a cluster

### 🔒 Enterprise Security
- **Role-Based Access Control (RBAC)** - Fine-grained permission management
- **JWT Authentication** - Secure token-based authentication
- **Encrypted Passwords** - bcryptjs password hashing
- **Security Headers** - OWASP-compliant security configurations
- **Production Hardening** - Enterprise-grade security practices

### ⚡ Performance & Scalability
- **Connection Pooling** - Efficient database connection management
- **Task Queue Management** - PostgreSQL-backed task processing
- **Distributed Locks** - Ensure consistency across instances
- **Caching System** - In-memory caching for fast operations
- **Multi-Instance Cluster** - Scale horizontally with distributed state

### 📊 Observability
- **Comprehensive Logging** - File-based logging with rotation
- **Health Checks** - Liveness and readiness probes
- **Metrics Collection** - Pool, queue, and operational metrics
- **Real-Time Dashboard** - Monitor system status and performance
- **Admin Interface** - Cluster management and instance monitoring

---

## 📋 Table of Contents

1. [System Requirements](#system-requirements)
2. [Quick Start (Docker)](#quick-start-docker)
3. [Local Installation](#local-installation)
4. [Configuration](#configuration)
5. [Running the Application](#running-the-application)
6. [Usage Guide](#usage-guide)
7. [API Documentation](#api-documentation)
8. [Troubleshooting](#troubleshooting)
9. [Contributing](#contributing)
10. [License](#license)

---

## 🖥️ System Requirements

### Minimum Requirements
- **OS:** Windows 10+, macOS, or Linux
- **RAM:** 4GB minimum (8GB recommended for production)
- **Storage:** 10GB free disk space minimum
- **CPU:** 2 cores minimum (4+ cores recommended)

### Docker Deployment (Recommended)
- **Docker:** v20.10 or later
- **Docker Compose:** v1.29 or later
- **Available Ports:** 3000, 3001, 1434

### Local Deployment
- **Node.js:** v16.0.0 or later
- **npm:** v8.0.0 or later
- **SQL Server:** 2019 or later (or SQL Server Express)
- **PowerShell:** v5.1 or later (Windows)

---

## 🚀 Quick Start (Docker)

The fastest way to get FlashDB running is with Docker Compose.

### Prerequisites
1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop)
2. Clone the FlashDB repository

### Step 1: Start All Services

```bash
cd flashdb
docker-compose -f docker-compose.full-stack.yml up -d
```

This command will:
- Start the API server (port 3001)
- Start the web frontend (port 3000)
- Start SQL Server database (port 1434)
- Initialize the database schema

### Step 2: Wait for Initialization

```bash
# Check service status (wait until all are healthy)
docker ps

# Expected output:
# flashdb-gui          Up X minutes (healthy)
# flashdb-api          Up X minutes (healthy)
# flashdb-sql-server   Up X minutes (healthy)
```

Allow 30-60 seconds for all services to start and initialize.

### Step 3: Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

### Step 4: Verify Installation

1. **Check Dashboard Tab** - Should display real-time metrics
2. **Check Management Tab** - Should show forms for creating resources
3. **Test API Health** - Open in browser or terminal:
   ```bash
   curl http://localhost:3001/health
   ```

**That's it!** FlashDB is now running. 🎉

---

## 💻 Local Installation

### Step 1: Install Dependencies

#### 1.1 Install SQL Server 2019 or Express
- Download from: https://www.microsoft.com/en-us/sql-server/sql-server-downloads
- Install with default settings
- Note the SA password (default: `Password123`)

#### 1.2 Install Node.js & npm
- Download from: https://nodejs.org/ (v16.0.0 or later)
- Verify installation:
  ```bash
  node --version
  npm --version
  ```

### Step 2: Clone Repository

```bash
git clone https://github.com/aravindksk7/flashdb.git
cd flashdb
```

### Step 3: Install API Dependencies

```bash
cd src/api
npm install
npm run build
```

### Step 4: Install GUI Dependencies

```bash
cd ../gui
npm install
npm run build
```

### Step 5: Install PowerShell Module

```powershell
Copy-Item -Path .\src\FlashDB -Destination "C:\Program Files\PowerShell\Modules\" -Recurse -Force
```

### Step 6: Start Services

Open three separate terminal windows:

**Terminal 1: Start API Server**
```bash
cd src/api
npm start
# API will start on http://localhost:3001
```

**Terminal 2: Start Frontend**
```bash
cd src/gui
npm run preview
# Frontend will start on http://localhost:3000
```

**Terminal 3: Optional - Start PowerShell Service**
```powershell
pwsh
Import-Module FlashDB
# PowerShell service is now available for direct commands
```

### Step 7: Verify Installation

1. Open browser: `http://localhost:3000`
2. Check API health: `http://localhost:3001/health`
3. All services should be responsive

---

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the project root:

```env
# API Configuration
API_PORT=3001
NODE_ENV=production
LOG_LEVEL=info

# Security
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRY_HOURS=24
BCRYPT_ROUNDS=10

# Database Configuration
DB_HOST=localhost
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=Password123
DB_NAME=TestDB

# Instance Configuration
INSTANCE_ID=api-primary-001
INSTANCE_ROLE=primary

# Logging
LOG_DIRECTORY=./logs
LOG_RETENTION_DAYS=14

# CORS
CORS_ORIGINS=http://localhost:3000,http://localhost:5173
```

### Docker Configuration

Edit `docker-compose.full-stack.yml` to customize:

```yaml
services:
  sql-server:
    environment:
      SA_PASSWORD: YourPassword123  # Change default password
      MSSQL_PID: Express           # SQL Server edition
    ports:
      - "1434:1433"               # Custom port mapping

  api:
    environment:
      NODE_ENV: production
      JWT_SECRET: your-secret-key
      DB_PASSWORD: YourPassword123
    ports:
      - "3001:3001"

  gui:
    ports:
      - "3000:3000"
```

### Generate Secure JWT Secret

```bash
# macOS/Linux
openssl rand -base64 32

# PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object {[byte](Get-Random -Maximum 256)}))
```

### Database Configuration

#### Create Limited Database User (Not SA)

```sql
-- Connect to SQL Server as SA first
CREATE LOGIN flashdb_user WITH PASSWORD = 'StrongPassword123!';
CREATE USER flashdb_user FOR LOGIN flashdb_user;
ALTER ROLE db_owner ADD MEMBER flashdb_user;

-- Update .env to use new user
DB_USER=flashdb_user
DB_PASSWORD=StrongPassword123!
```

---

## ▶️ Running the Application

### Docker Compose

```bash
# Start all services
docker-compose -f docker-compose.full-stack.yml up -d

# Stop all services
docker-compose -f docker-compose.full-stack.yml down

# View logs
docker-compose -f docker-compose.full-stack.yml logs -f

# Restart specific service
docker-compose -f docker-compose.full-stack.yml restart flashdb-api
```

### Local Installation

```bash
# Terminal 1: API
cd src/api && npm start

# Terminal 2: GUI
cd src/gui && npm run preview

# Terminal 3: PowerShell (optional)
pwsh
Import-Module FlashDB
```

### Access Points

| Component | URL | Purpose |
|-----------|-----|---------|
| **Web UI** | http://localhost:3000 | Management interface |
| **API** | http://localhost:3001 | REST API endpoints |
| **Database** | localhost:1434 | SQL Server connection |

---

## 📖 Usage Guide

### Step 1: Create a Golden Image

A golden image is a snapshot of your database.

1. Open http://localhost:3000
2. Click **Management** tab
3. Click **Create Golden Image**
4. Fill in the form:
   - **Name:** `MyDatabase-v1`
   - **Version:** `1.0.0`
   - **Method:** `TableByTableCopy`
   - **Database Type:** `sql-server`
   - **Database Name:** `TestDB`
5. Click **Create**

Golden images are stored in `/app/data/golden-images/`

### Step 2: Create Database Clones

Clones are instant copies of your golden image with minimal storage.

1. Click **Management** tab
2. Click **Create Clone**
3. Fill in the form:
   - **Golden Image:** Select from dropdown
   - **Clone Name:** `TestClone-01`
   - **Database Name:** `TestDB_Clone_01`
   - **Instance Path:** `sql-server`
4. Click **Create**

Clones are stored in `/app/data/clones/`

### Step 3: Manage Checkpoints (Restore Points)

Create snapshots of your clones to restore later.

1. Click **Management** tab
2. Select a clone from the list
3. In **Restore Points** section, click **Create Restore Point**
4. Fill in:
   - **Name:** `Before-Testing`
   - **Description:** `Checkpoint before test suite`
5. Click **Create**

To restore a checkpoint:
1. Click the **Restore** button on any checkpoint
2. Confirm the restoration
3. Clone will be restored to that checkpoint state

### Step 4: Monitor Metrics

View real-time system metrics and health status.

1. Click **Metrics Dashboard** tab
2. View:
   - **Overview:** Total clones, healthy attached/ready clones, storage saved, success rates
   - **Pool Metrics:** Connection pool status and utilization
   - **Queue Metrics:** Task queue depth, completed/failed tasks, and success rates
   - **Cluster Status:** Instance health and heartbeat status

Dashboard statistics are backed by live provider state and durable queue history:
- Clone counts treat `Ready`, `Attached`, `Active`, and `Healthy` states as healthy.
- Golden image and clone sizes use SQL Server database file size when available.
- Operation counts and success rates come from queued create/restore/delete checkpoint tasks.
- Clone cards show real table count, row count, and size values returned by the API.

### Step 5: Review Audit History

View and search the complete operation trail.

1. Click **Audit** tab
2. Search by operation ID, clone ID, checkpoint ID/name, status, or error message
3. Filter by operation type (`create`, `restore`, `delete`) and status (`completed`, `failed`, etc.)

The Audit tab is backed by the durable task queue and includes completed and failed restore-point operations even when the SQL operation table is empty.

### Step 6: Access Deployment Guide

Learn how to deploy FlashDB to production.

1. Click **📚 Deployment Guide** tab
2. Choose from:
   - Quick Start
   - System Requirements
   - Installation
   - Configuration
   - Verification
   - Troubleshooting
   - Monitoring
   - Security
   - FAQ

---

## 🔌 API Documentation

### Base URL
```
http://localhost:3001/api
```

### Golden Images

#### List Golden Images
```bash
GET /api/golden-images

Response:
{
  "success": true,
  "data": [
    {
      "id": "golden-1",
      "name": "MyDatabase-v1",
      "version": "1.0.0",
      "method": "TableByTableCopy",
      "databaseType": "sql-server",
      "createdAt": "2026-06-06T10:00:00Z",
      "sizeBytes": 1073741824
    }
  ]
}
```

#### Create Golden Image
```bash
POST /api/golden-images

Request:
{
  "name": "MyDatabase-v1",
  "version": "1.0.0",
  "method": "TableByTableCopy",
  "databaseType": "sql-server",
  "databaseName": "TestDB",
  "sourceConnection": "Server=localhost;Database=TestDB;User Id=sa;Password=..."
}

Response:
{
  "success": true,
  "data": {
    "id": "golden-1",
    "name": "MyDatabase-v1",
    ...
  }
}
```

### Clones

#### List Clones
```bash
GET /api/clones

Response:
{
  "success": true,
  "data": [
    {
      "id": "clone-1",
      "name": "TestClone-01",
      "goldenImageId": "golden-1",
      "status": "Attached",
      "databaseName": "TestDB_Clone_01",
      "tableCount": 2,
      "rowCount": 13,
      "sizeBytes": 16777216,
      "createdAt": "2026-06-06T10:05:00Z"
    }
  ]
}
```

#### Create Clone
```bash
POST /api/clones

Request:
{
  "goldenImageId": "golden-1",
  "cloneName": "TestClone-01",
  "databaseType": "sql-server",
  "databaseName": "TestDB_Clone_01",
  "instancePath": "sql-server"
}

Response:
{
  "success": true,
  "data": {
    "id": "clone-1",
    ...
  }
}
```

#### Delete Clone
```bash
DELETE /api/clones/:id?deleteVhdx=true

Response:
{
  "success": true,
  "message": "Clone deleted successfully"
}
```

### Checkpoints

#### List Checkpoints
```bash
GET /api/clones/:cloneId/checkpoints

Response:
{
  "success": true,
  "data": [
    {
      "id": "checkpoint-1",
      "cloneId": "clone-1",
      "name": "Before-Testing",
      "description": "Checkpoint before test suite",
      "createdAt": "2026-06-06T10:10:00Z",
      "isFavorite": false,
      "labels": ["testing", "qa"]
    }
  ]
}
```

#### Create Checkpoint
```bash
POST /api/clones/:cloneId/checkpoints

Request:
{
  "name": "Before-Testing",
  "description": "Checkpoint before test suite",
  "labels": ["testing", "qa"]
}

Response:
{
  "success": true,
  "data": {
    "id": "checkpoint-1",
    ...
  }
}
```

#### Restore Checkpoint
```bash
POST /api/clones/:cloneId/checkpoints/:checkpointId/restore

Request:
{
  "reattachAfter": true
}

Response:
{
  "success": true,
  "message": "Restore initiated"
}
```

### Metrics

#### Overview Metrics
```bash
GET /api/metrics/overview

Response:
{
  "success": true,
  "data": {
    "totalClonesCreated": 5,
    "activeClonesCount": 3,
    "totalStorageSavedGB": 45.2,
    "operationsLast24h": 12,
    "operationSuccessRatePercent": 95.8
  }
}
```

#### Connection Pool Metrics
```bash
GET /api/metrics/pool

Response:
{
  "success": true,
  "data": {
    "totalConnections": 20,
    "activeConnections": 5,
    "idleConnections": 15,
    "utilization": 25,
    "cacheHitRate": 87.5
  }
}
```

#### Task Queue Metrics
```bash
GET /api/metrics/queue

Response:
{
  "success": true,
  "data": {
    "queueDepth": 3,
    "pendingTasks": 2,
    "processingTasks": 1,
    "completedTasks": 150,
    "failedTasks": 2,
    "successRate": 98.7
  }
}
```

### Operation History

#### Global Operation History
```bash
GET /api/operations?limit=250

Response:
{
  "success": true,
  "data": [
    {
      "id": "36166055-4b93-4729-a7af-6ca9a22d2beb",
      "cloneId": "clone-20260607033049-3949",
      "checkpointId": "cp-20260607043537-2642",
      "checkpointName": "cp-20260607043537-2642",
      "type": "restore",
      "status": "completed",
      "timestamp": "2026-06-07T04:37:51.782Z",
      "completedAt": "2026-06-07T04:37:57.042Z",
      "message": "Operation completed successfully",
      "source": "queue"
    }
  ],
  "count": 1
}
```

#### Clone Operation Timeline
```bash
GET /api/operations/timeline/:cloneId
```

Operation history responses merge SQL audit rows with durable queue tasks. Queue-backed entries use `source: "queue"` and are the source used by the GUI Audit tab.

### Health Checks

#### Liveness Probe
```bash
GET /api/live

Response:
{
  "status": "ok"
}
```

#### Readiness Probe
```bash
GET /api/ready

Response:
{
  "status": "ready",
  "database": "connected"
}
```

#### Full Health Check
```bash
GET /api/health

Response:
{
  "status": "healthy",
  "uptime": 3600,
  "checks": {
    "database": "healthy",
    "queue": "healthy",
    "cache": "healthy"
  }
}
```

---

## 🔧 Troubleshooting

### Port Already in Use

```bash
# Windows - Find process using port 3001
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# macOS/Linux
lsof -i :3001
kill -9 <PID>
```

### Database Connection Failed

```bash
# Check SQL Server status
docker ps | grep sql-server

# Check SQL Server logs
docker logs flashdb-sql-server

# Test connection manually
docker exec -it flashdb-sql-server /opt/mssql-tools/bin/sqlcmd \
  -S localhost -U sa -P "Password123"
```

### API Not Responding

```bash
# Check API logs
docker logs flashdb-api

# Restart API service
docker restart flashdb-api

# Test API health
curl http://localhost:3001/health
```

### GUI Not Loading

1. Clear browser cache (Ctrl+Shift+Delete)
2. Hard refresh (Ctrl+Shift+R)
3. Check browser console for errors (F12)
4. Verify frontend is running: `curl http://localhost:3000`

### High Memory Usage

```bash
# Check Docker stats
docker stats flashdb-api

# Increase container memory limit
docker update -m 2g flashdb-api
docker restart flashdb-api
```

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Setup

```bash
# Install dev dependencies
npm install --save-dev

# Run tests
npm test

# Run linting
npm run lint

# Build for production
npm run build
```

---

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### MIT License Summary

✅ **You can:**
- Use commercially
- Distribute the software
- Modify the source code
- Sublicense the software

❌ **You cannot:**
- Hold the authors liable for any issues
- Use the authors' names to promote your work

---

## 📞 Support

- **Documentation:** See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment guide
- **Issues:** Report bugs on [GitHub Issues](https://github.com/aravindksk7/flashdb/issues)
- **Discussions:** Join our [GitHub Discussions](https://github.com/aravindksk7/flashdb/discussions)

---

## 🎯 Roadmap

- [x] v1.0.0 - Core functionality (Golden Images, Clones, Checkpoints)
- [x] RBAC and security implementation
- [x] Multi-instance cluster support
- [x] Real-time metrics and monitoring
- [ ] v1.1.0 - REST API enhancements
- [ ] v1.2.0 - Performance optimizations
- [ ] v2.0.0 - Cloud provider integrations

---

## 🏆 Acknowledgments

Built with modern technologies:
- **Node.js & Express** - Backend framework
- **React & TypeScript** - Frontend framework
- **SQL Server** - Database engine
- **Docker & Docker Compose** - Containerization
- **PostgreSQL** - Task queue and state management

---

## 📝 Version History

### v1.0.0 (2026-06-06)
- ✨ Initial release
- 🚀 Core CRUD operations for Golden Images, Clones, Checkpoints
- 🔒 RBAC and JWT authentication
- 📊 Real-time metrics dashboard
- 🌐 Web-based management interface
- 📱 REST API with 50+ endpoints
- 🏪 Connection pooling and caching
- 🔄 Task queue management
- 📈 Multi-instance cluster support

---

## 👤 Project Credits

**Designed and Built by:** AK (Aravind K)

FlashDB is a complete enterprise-grade database management system designed from the ground up with modern architecture principles, comprehensive security features, and production-ready implementation.

---

**Happy Cloning! 🎉**

For updates and more information, visit: https://github.com/aravindksk7/flashdb
