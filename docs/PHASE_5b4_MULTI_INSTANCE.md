# Phase 5b.4: Multi-Instance Setup (Simplified)

## Overview

Phase 5b.4 enables FlashDB to run multiple stateless API instances sharing a single PostgreSQL database. This allows horizontal scaling without a load balancer using simple round-robin client-side routing.

**Key Features:**
- Stateless API instances with shared PostgreSQL state
- Instance registration and heartbeat monitoring
- Cluster discovery and health status
- No load balancer required (clients can round-robin)
- Primary/replica role support (simplified, no consensus)
- Eventual consistency model

## Architecture

```
┌─────────────────────────────────────┐
│  FlashDB Multi-Instance Cluster    │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────┐  ┌──────────┐       │
│  │ API-1    │  │ API-2    │  ... │
│  │ Primary  │  │ Replica  │       │
│  └────┬─────┘  └────┬─────┘       │
│       │             │              │
│       └─────────┬───┘              │
│               (TCP)                │
│                 │                  │
│        ┌────────▼─────────┐        │
│        │   PostgreSQL     │        │
│        │   (Shared State) │        │
│        │                  │        │
│        │  flashdb_*       │        │
│        │  instances       │        │
│        │  state           │        │
│        │  locks           │        │
│        │  queue           │        │
│        └──────────────────┘        │
│                                     │
└─────────────────────────────────────┘

Clients: Round-robin to any instance
         or use health checks for smart routing
```

## Environment Variables

```bash
# Instance configuration
INSTANCE_ID=api-primary-001          # UUID per instance (auto-generated if not provided)
INSTANCE_ROLE=primary                # "primary" or "replica" (default: "primary")
INSTANCE_HOST=localhost              # Hostname/IP for discovery
PORT=3001                            # API port (can vary per instance)
CLUSTER_ENABLED=true                 # Enable cluster mode (default: true)

# Database (shared across all instances)
SQL_SERVER_HOST=localhost
SQL_SERVER_PORT=1433
SQL_SERVER_USER=sa
SQL_SERVER_PASSWORD=...
SQL_DATABASE=FlashDB

# Other settings
QUEUE_PERSIST_MODE=db                # Use PostgreSQL for durability
API_VERSION=1.0.0
```

## Database Schema

### `flashdb_instances` Table

```sql
CREATE TABLE dbo.flashdb_instances (
    instance_id NVARCHAR(36) PRIMARY KEY,    -- UUID
    role NVARCHAR(20) NOT NULL,              -- "primary" or "replica"
    status NVARCHAR(20) NOT NULL,            -- "active", "inactive", "unhealthy"
    last_heartbeat DATETIME2(7) NOT NULL,    -- Liveness detection (30s TTL)
    host NVARCHAR(255) NOT NULL,             -- Hostname for discovery
    port INT NOT NULL,                       -- API port
    version NVARCHAR(50) NOT NULL,           -- API version
    created_at DATETIME2(7) NOT NULL,
    updated_at DATETIME2(7) NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX IX_flashdb_instances_status ON flashdb_instances(status);
CREATE INDEX IX_flashdb_instances_heartbeat ON flashdb_instances(last_heartbeat DESC);
CREATE INDEX IX_flashdb_instances_role ON flashdb_instances(role);
CREATE INDEX IX_flashdb_instances_status_heartbeat ON flashdb_instances(status, last_heartbeat DESC);
```

**Key Columns:**
- `instance_id`: Unique identifier (UUID). Set via `INSTANCE_ID` env var.
- `role`: "primary" (handles writes) or "replica" (read-only)
- `status`: "active" (healthy), "inactive" (graceful shutdown), or "unhealthy" (stale)
- `last_heartbeat`: Timestamp for liveness. Instances > 30s old are considered dead.
- `host` + `port`: Used by clients for direct instance communication

## API Endpoints

### Cluster Management

**GET /api/admin/instance**
- Get current instance information
- Response:
  ```json
  {
    "success": true,
    "data": {
      "instanceId": "api-primary-001",
      "role": "primary",
      "status": "active",
      "host": "localhost",
      "port": 3001,
      "version": "1.0.0",
      "lastHeartbeat": "2026-06-06T12:34:56Z",
      "isPrimary": true,
      "isClusterMode": true
    }
  }
  ```

**GET /api/admin/instances**
- List all active instances in the cluster
- Response:
  ```json
  {
    "success": true,
    "data": {
      "totalInstances": 3,
      "instances": [
        {
          "instanceId": "api-primary-001",
          "role": "primary",
          "status": "active",
          "host": "api-primary",
          "port": 3001,
          "version": "1.0.0",
          "lastHeartbeat": "2026-06-06T12:34:56Z",
          "isPrimary": true
        },
        ...
      ]
    }
  }
  ```

**GET /api/admin/cluster-status**
- Get overall cluster health
- Response:
  ```json
  {
    "success": true,
    "data": {
      "clusterEnabled": true,
      "clusterHealth": "healthy",
      "totalInstances": 3,
      "activeInstances": 3,
      "unhealthyInstances": 0,
      "currentInstance": { ... },
      "instances": [ ... ],
      "timestamp": "2026-06-06T12:34:56Z"
    }
  }
  ```

**POST /api/admin/heartbeat**
- Manually trigger heartbeat (for monitoring)
- Response:
  ```json
  {
    "success": true,
    "data": {
      "instanceId": "api-primary-001",
      "lastHeartbeat": "2026-06-06T12:34:56Z",
      "status": "active",
      "timestamp": "2026-06-06T12:34:56Z"
    }
  }
  ```

**POST /api/admin/cleanup**
- Remove stale instance registrations (instances > 30s without heartbeat)
- Response:
  ```json
  {
    "success": true,
    "data": {
      "staleInstancesRemoved": 2,
      "timestamp": "2026-06-06T12:34:56Z"
    }
  }
  ```

### Health Checks

**GET /health**
- Deep health check including instance info
- Response includes `instance` field with instanceId, role, status, isPrimary

## Deployment Examples

### Docker Compose (3 Instances)

```bash
docker-compose -f docker-compose-multi.yml up -d
```

This starts:
- 1 SQL Server (shared database)
- 1 Primary API instance (port 3001)
- 2 Replica API instances (ports 3002, 3003)

**Configuration:**
- Each instance has unique `INSTANCE_ID` and `INSTANCE_HOST`
- All share `SQL_SERVER_HOST`, `SQL_DATABASE`, and credentials
- Instances register themselves on startup
- Heartbeat every 5 seconds (keep registration fresh)
- Instances removed if heartbeat > 30 seconds old

### Manual Setup

**Terminal 1 - Primary:**
```bash
INSTANCE_ID=api-primary-001 \
INSTANCE_ROLE=primary \
INSTANCE_HOST=localhost \
PORT=3001 \
npm start
```

**Terminal 2 - Replica 1:**
```bash
INSTANCE_ID=api-replica-001 \
INSTANCE_ROLE=replica \
INSTANCE_HOST=localhost \
PORT=3002 \
npm start
```

**Terminal 3 - Replica 2:**
```bash
INSTANCE_ID=api-replica-002 \
INSTANCE_ROLE=replica \
INSTANCE_HOST=localhost \
PORT=3003 \
npm start
```

**Check Cluster:**
```bash
curl http://localhost:3001/api/admin/cluster-status
```

### Disable Cluster Mode

Set `CLUSTER_ENABLED=false` to run in standalone mode (no registration, no heartbeat).

```bash
CLUSTER_ENABLED=false npm start
```

## Client Routing Strategies

### 1. Simple Round-Robin
```javascript
const instances = ['localhost:3001', 'localhost:3002', 'localhost:3003'];
let current = 0;

function getNextInstance() {
  return instances[current++ % instances.length];
}
```

### 2. Smart Routing (Health-Based)
```javascript
// Query cluster status periodically
async function getHealthyInstances() {
  const response = await fetch('http://localhost:3001/api/admin/instances');
  const data = await response.json();
  return data.data.instances
    .filter(i => i.status === 'active')
    .map(i => `${i.host}:${i.port}`);
}

// Use healthy instances for routing
const instances = await getHealthyInstances();
const instance = instances[Math.random() * instances.length | 0];
```

### 3. Instance Discovery (Dynamic)
```javascript
// Cache instances, refresh periodically
class InstanceDiscovery {
  constructor(primaryUrl = 'localhost:3001', refreshMs = 5000) {
    this.primaryUrl = primaryUrl;
    this.instances = [];
    this.refresh();
    setInterval(() => this.refresh(), refreshMs);
  }

  async refresh() {
    try {
      const response = await fetch(`http://${this.primaryUrl}/api/admin/instances`);
      const data = await response.json();
      this.instances = data.data.instances;
    } catch (error) {
      console.error('Failed to refresh instances:', error);
    }
  }

  getRandomInstance() {
    if (this.instances.length === 0) return this.primaryUrl;
    const instance = this.instances[Math.random() * this.instances.length | 0];
    return `${instance.host}:${instance.port}`;
  }
}
```

## Lifecycle

### Startup
1. Instance ID generated or loaded from `INSTANCE_ID` env var
2. Instance registers in `flashdb_instances` table with `status='active'`
3. Heartbeat timer started (every 5 seconds)
4. API server starts listening
5. Instance logs: "Instance registered: api-primary-001 (primary) at localhost:3001"

### Running
1. Heartbeat updates `last_heartbeat` every 5 seconds
2. Other instances see this instance via `/api/admin/instances`
3. Stale instances (> 30s without heartbeat) are not returned as active

### Shutdown
1. Receives SIGTERM or SIGINT
2. Stops heartbeat timer
3. Updates `status='inactive'` in database
4. Closes connections gracefully
5. Instance logs: "Instance deregistered from cluster"

### Cleanup
1. Automatic: Instances with `last_heartbeat > 30s` are stale
2. Manual: `POST /api/admin/cleanup` removes stale entries

## Constraints & Limitations

### Simplified Design (No Consensus)
- **No Raft/PBFT**: No distributed consensus protocol
- **Single Primary**: Only `role='primary'` instance exists (not enforced)
- **Eventual Consistency**: Changes propagate via PostgreSQL eventually
- **No Auto-Failover**: If primary dies, replicas don't auto-promote

### Role Support
- **Primary**: Intended for write operations
- **Replica**: Intended for read-only operations
- **Enforcement**: Not enforced by API (role is informational only)

### Heartbeat-Based Liveness
- **TTL**: 30 seconds (instances with `last_heartbeat > 30s` are dead)
- **No Health Checks**: Heartbeat only updates timestamp, no health validation
- **Network Partitions**: If network fails, instances won't update heartbeat

### Database Dependency
- **Single Point of Failure**: All instances depend on one PostgreSQL
- **No Replication**: PostgreSQL state is not replicated
- **Failover**: Requires external tools (PostgreSQL replication, backup)

## Monitoring

### Key Metrics
1. **Active Instances**: `GET /api/admin/instances` → count of active entries
2. **Cluster Health**: `GET /api/admin/cluster-status` → "healthy" if instances > 0
3. **Heartbeat Status**: Check `last_heartbeat` vs. current time
4. **Version Mismatch**: Compare `version` across instances

### Health Check Integration
The `/health` endpoint includes instance info:
```json
{
  "status": "healthy",
  "instance": {
    "instanceId": "api-primary-001",
    "role": "primary",
    "status": "active",
    "isPrimary": true
  },
  ...
}
```

### Logging
- Instance registration: `Instance registered: {id} ({role}) at {host}:{port}`
- Heartbeat: `Heartbeat sent for instance {id}` (debug level)
- Shutdown: `Instance deregistered: {id}`
- Errors: `Failed to register instance: {error}` (non-fatal)

## Testing

### Single Instance
```bash
npm start
curl http://localhost:3001/api/admin/instance
```

### Multiple Instances (Docker Compose)
```bash
docker-compose -f docker-compose-multi.yml up -d
docker-compose -f docker-compose-multi.yml logs -f api-primary
curl http://localhost:3001/api/admin/cluster-status
```

### Kill an Instance
```bash
docker-compose -f docker-compose-multi.yml kill api-replica-1
sleep 35  # Wait for heartbeat timeout (30s)
curl http://localhost:3001/api/admin/instances
```

## Integration with Phase 5b.1-5b.3

- **Phase 5b.1 (State Management)**: Instances share state via `flashdb_state`, `flashdb_locks`, `flashdb_operations`
- **Phase 5b.2 (Connection Pooling)**: Each instance has its own connection pool
- **Phase 5b.3 (Task Queue)**: Tasks are durable in `flashdb_queue` (shared across instances)
- **Phase 5b.4 (Multi-Instance)**: Coordinates instances via `flashdb_instances` registry

## Files Created/Modified

### New Files
- `src/api/src/config/instanceConfig.ts` - Instance configuration manager
- `src/api/src/routes/admin.ts` - Admin API endpoints
- `src/api/src/db/instanceSchema.sql` - Database schema for instances
- `docker-compose-multi.yml` - Multi-instance Docker Compose setup
- `docs/PHASE_5b4_MULTI_INSTANCE.md` - This documentation

### Modified Files
- `src/api/src/index.ts` - Register instance on startup, heartbeat, deregister on shutdown
- `src/api/src/db/init.ts` - Initialize instance schema during database setup
- `docker/init-testdb.sql` - Add instance table to test database
- `src/api/src/middleware/healthcheck.ts` - Include instance info in health check

## Next Steps

**Phase 5b.5 (Planned):**
- Load balancer integration (Nginx/HAProxy)
- Advanced routing (sticky sessions, weighted)
- Graceful drain on shutdown
- Instance metrics (CPU, memory, request count)
- Dashboard for cluster visualization

## References

- Phase 5b.1: PostgreSQL State Management
- Phase 5b.2: Connection Pooling
- Phase 5b.3: Task Queue with DB Persistence
- FlashDB Architecture: `/docs/ARCHITECTURE.md`
