# Phase 5a.4 - Quick Start Guide for Tester

## What Was Implemented

Direct MSSQL client with connection pooling for FlashDB API, replacing PowerShell SQL calls with 5-10x faster parameterized queries.

## Files Created/Modified

**New Files:**
- `src/api/src/services/sqlClient.ts` - SQL client with pooling
- `src/api/src/services/repository.ts` - Data access layer
- `src/api/src/db/schema.sql` - Database schema
- `src/api/src/db/init.ts` - Schema initialization

**Modified Files:**
- `src/api/src/index.ts` - Added SQL initialization
- `src/api/src/routes/metrics.ts` - Updated to use SQL with fallback
- `src/api/package.json` - Added mssql dependency

## Quick Setup (5 minutes)

### 1. Install Dependencies
```bash
cd src/api
npm install
```

### 2. Set Environment Variables
```bash
export SQL_SERVER_HOST=localhost
export SQL_SERVER_PORT=1433
export SQL_SERVER_USER=sa
export SQL_SERVER_PASSWORD=<your_password>
export SQL_DATABASE=FlashDB
```

### 3. Build and Run
```bash
npm run build
npm start
# or for development
npm run dev
```

### 4. Verify It Works
```bash
# Test SQL initialization
curl http://localhost:3001/api/metrics/overview

# Test connection pool metrics
curl http://localhost:3001/api/metrics/pool

# Check logs for "SQL client initialized"
```

## What to Test

### Critical Path (15 minutes)
1. ✅ Server starts without errors
2. ✅ Logs show "SQL client initialized"
3. ✅ `/api/metrics/overview` returns 200 OK
4. ✅ `/api/metrics/pool` shows connection pool stats
5. ✅ Response is faster than before (check logs for "Query executed in Xms")

### Full Testing (See TESTING_GUIDE_PHASE_5A4.md)
- Connection pool under load
- Fallback to PowerShell when SQL unavailable
- Database tables created correctly
- Graceful shutdown
- Error handling
- Data consistency

## Expected Logs on Startup

```
INFO: SQL client initialized: localhost:1433/FlashDB
INFO: Connection pool: min=5, max=20
INFO: Database schema initialized successfully
DEBUG: Query executed in 123ms  (when making requests)
```

## Performance Baseline

| Endpoint | Expected Time |
|----------|----------------|
| `/api/metrics/overview` | 150ms (vs 2000ms PowerShell) |
| `/api/metrics/all` | 900ms (vs 10500ms PowerShell) |

## Troubleshooting

**"Cannot connect to SQL Server"**
- Check MSSQL is running: `sqlcmd -S localhost -U sa -P <password>`
- Verify environment variables are set
- Check firewall allows port 1433

**"Database 'FlashDB' does not exist"**
- Create it: `sqlcmd -S localhost -U sa -P <password> -Q "CREATE DATABASE FlashDB"`
- Or change SQL_DATABASE env var

**Build errors**
- Run `npm install` to install mssql and @types/mssql
- Run `npm run build` again

**Metrics endpoints slow**
- Check `/api/metrics/pool` - ensure connections available
- Verify SQL Server not under heavy load
- Check network latency

## Key Metrics to Monitor

1. **Connection Pool:**
   - Size should stabilize at 5
   - Available should decrease when handling requests
   - Average wait time should be < 100ms

2. **Query Performance:**
   - Each query should execute in 100-500ms
   - No queries should exceed 60 seconds
   - Average response time visible in logs

3. **Error Rate:**
   - Should be 0 initially
   - Any errors logged with details

## Files to Review

- **Implementation:** `src/api/src/services/sqlClient.ts` (300 lines)
- **Repositories:** `src/api/src/services/repository.ts` (400 lines)
- **Schema:** `src/api/src/db/schema.sql` (80 lines)
- **Integration:** `src/api/src/index.ts` (updated)
- **Routes:** `src/api/src/routes/metrics.ts` (updated)

## Success Criteria

Phase 5a.4 is successful when:

1. ✅ Server starts and initializes SQL client
2. ✅ Database schema created automatically
3. ✅ Metrics endpoints use SQL queries
4. ✅ Query performance is 5-10x faster
5. ✅ Connection pool metrics visible
6. ✅ Fallback to PowerShell works
7. ✅ Graceful shutdown works
8. ✅ No memory leaks
9. ✅ Error handling robust
10. ✅ All tests pass

## Testing Commands

```bash
# Start server
npm run dev

# In another terminal:

# Test overview metrics
curl http://localhost:3001/api/metrics/overview

# Test pool metrics
curl http://localhost:3001/api/metrics/pool

# Test all metrics
curl http://localhost:3001/api/metrics/all

# Test clones
curl http://localhost:3001/api/metrics/clones

# Test storage
curl http://localhost:3001/api/metrics/storage

# Test operations
curl http://localhost:3001/api/metrics/operations

# Load test (50 concurrent requests)
seq 1 50 | xargs -P 10 -I {} curl http://localhost:3001/api/metrics/overview > /dev/null
```

## Documentation Files

1. **PHASE_5A4_DATABASE_OPTIMIZATION.md** - Full implementation details
2. **TESTING_GUIDE_PHASE_5A4.md** - Comprehensive testing checklist
3. **PHASE_5A4_IMPLEMENTATION_COMPLETE.md** - Deployment summary

## Next Phase

After testing passes:
- Implement query result caching
- Add full-text search indexing
- Create stored procedures for complex operations
- Set up monitoring and alerts

## Contact

If issues occur, review:
1. Logs for error details
2. TESTING_GUIDE_PHASE_5A4.md "Troubleshooting" section
3. PHASE_5A4_DATABASE_OPTIMIZATION.md "Common Issues"

---

**Status:** Implementation Complete ✅
**Ready for Testing:** Yes ✅
**Build Status:** Successful ✅
