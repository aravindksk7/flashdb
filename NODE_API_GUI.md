# FlashDB Node.js REST API & React GUI

## Overview

Complete REST API and Web UI for FlashDB database virtualization tool, built with:
- **Backend:** Node.js + Express + TypeScript
- **Frontend:** React + TypeScript + Vite
- **Database Interface:** PowerShell cmdlet orchestration

## Project Structure

```
src/
├── api/                          # REST API Server
│   ├── src/
│   │   ├── index.ts             # Express server entry point
│   │   ├── logger.ts            # Winston logging
│   │   ├── services/
│   │   │   └── powershellService.ts  # PowerShell bridge
│   │   └── routes/
│   │       ├── clones.ts        # Clone CRUD endpoints
│   │       ├── goldenImages.ts  # Golden image endpoints
│   │       └── checkpoints.ts   # Checkpoint endpoints
│   ├── package.json
│   └── tsconfig.json
│
└── gui/                          # React Web UI
    ├── src/
    │   ├── main.tsx             # React entry point
    │   ├── App.tsx              # Main dashboard component
    │   └── App.css              # Styling
    ├── index.html               # HTML template
    ├── vite.config.ts           # Vite configuration
    ├── package.json
    └── tsconfig.json
```

## API Endpoints

### Golden Images
```
POST   /api/golden-images              Create golden image
GET    /api/golden-images              List all golden images
GET    /api/golden-images/:imageId     Get golden image details
DELETE /api/golden-images/:imageId     Delete golden image
```

### Clones
```
POST   /api/clones                     Create clone
GET    /api/clones                     List all clones
GET    /api/clones/:cloneId            Get clone details
POST   /api/clones/:cloneId/attach     Attach clone to instance
POST   /api/clones/:cloneId/detach     Detach clone from instance
DELETE /api/clones/:cloneId            Delete clone
```

### Checkpoints
```
POST   /api/clones/:cloneId/checkpoints              Create checkpoint
GET    /api/clones/:cloneId/checkpoints              List checkpoints
POST   /api/clones/:cloneId/checkpoints/:cpId/restore  Restore checkpoint
PATCH  /api/clones/:cloneId/checkpoints/:cpId       Update checkpoint (labels, favorite)
DELETE /api/clones/:cloneId/checkpoints/:cpId       Delete checkpoint
```

## Quick Start

### Prerequisites

- **Node.js 18+**
- **PowerShell 5.1+** (for Windows) or **PowerShell 7+** (for cross-platform)
- **FlashDB PowerShell module** installed at `C:\flashdb\src\FlashDB\FlashDB.psm1`
- **SQL Server** running and accessible

### Installation

#### API Server

```bash
cd src/api
npm install
npm run build
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

API runs on: `http://localhost:3001`

#### GUI Client

```bash
cd src/gui
npm install
npm run dev
```

GUI runs on: `http://localhost:3000`

Proxy automatically routes `/api/*` requests to `http://localhost:3001/api`

## Configuration

### Environment Variables (API)

Create `.env` in `src/api/`:

```env
NODE_ENV=development
PORT=3001
LOG_LEVEL=info
FLASHDB_MODULE_PATH=C:\flashdb\src\FlashDB\FlashDB.psm1
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
```

### Environment Variables (GUI)

Create `.env` in `src/gui/`:

```env
VITE_API_URL=http://localhost:3001
```

## Running with Docker

### Docker Compose (Full Stack)

```bash
docker-compose -f docker-compose.full-stack.yml up --build
```

Services:
- SQL Server 2022: `localhost:1433`
- FlashDB API: `localhost:3001`
- FlashDB GUI: `localhost:3000`

### Individual Docker Builds

**API Container:**
```bash
docker build -f Dockerfile.api -t flashdb-api .
docker run -p 3001:3001 -e FLASHDB_MODULE_PATH=/app/flashdb/src/FlashDB/FlashDB.psm1 flashdb-api
```

**GUI Container:**
```bash
docker build -f Dockerfile.gui -t flashdb-gui .
docker run -p 3000:3000 flashdb-gui
```

## Features

### API Features
✅ RESTful endpoints for all CRUD operations  
✅ PowerShell module integration via child process  
✅ JSON request/response with TypeScript validation  
✅ Comprehensive error handling and logging  
✅ CORS support for GUI client  
✅ Docker-ready with multi-stage builds  

### GUI Features
✅ Real-time clone and golden image listing  
✅ Create clones with form validation  
✅ Clone management (delete)  
✅ Responsive design for mobile/desktop  
✅ Error notifications with retry  
✅ Auto-refresh capability  
✅ TypeScript for type safety  

## Development

### API Development

```bash
cd src/api

# Start development server
npm run dev

# Watch mode with auto-reload
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint
```

### GUI Development

```bash
cd src/gui

# Start dev server with hot reload
npm run dev

# Build for production
npm run build

# Preview build
npm run preview

# Lint code
npm run lint
```

## Building for Production

### API

```bash
cd src/api
npm run build
npm start
```

Outputs compiled code to `dist/` directory.

### GUI

```bash
cd src/gui
npm run build
```

Outputs optimized build to `dist/` directory.

### Docker Production

```bash
docker build -f Dockerfile.api --target production -t flashdb-api:latest .
docker build -f Dockerfile.gui --target production -t flashdb-gui:latest .

docker run -d --name flashdb-api -p 3001:3001 flashdb-api:latest
docker run -d --name flashdb-gui -p 3000:3000 flashdb-gui:latest
```

## API Response Format

All API responses follow consistent format:

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed successfully"
}
```

### Error Response
```json
{
  "success": false,
  "message": "Description of error",
  "error": null
}
```

## Logging

### API Logging

Logs are written to:
- Console (development)
- `logs/error.log` (errors only)
- `logs/combined.log` (all logs)

Configure with `LOG_LEVEL` environment variable:
- `error` - Only errors
- `warn` - Warnings and errors
- `info` - General info (default)
- `debug` - Detailed debug info

### GUI Logging

Browser console logs (check DevTools):
- `Console` tab for application logs
- `Network` tab for API requests
- `Application` tab for local storage

## Performance

### API Performance
- Clone creation: ~5 seconds
- Checkpoint operations: < 1 second
- API response time: < 100ms (excluding PowerShell execution)

### GUI Performance
- Page load: < 2 seconds
- API calls: 100-500ms (network dependent)
- Re-renders optimized with React hooks

## Security

### API Security
- Input validation on all endpoints
- CORS configured for known origins
- Error messages don't expose internal details (production)
- Logging for audit trail

### GUI Security
- Input sanitization in forms
- No sensitive data in localStorage
- XSS protection via React's default escaping
- HTTPS recommended for production

## Troubleshooting

### API Won't Start

**Error:** `EADDRINUSE: address already in use :::3001`
```bash
# Kill process on port 3001
lsof -ti:3001 | xargs kill -9  # macOS/Linux
netstat -ano | findstr :3001   # Windows
```

**Error:** `PowerShell not found`
- Ensure PowerShell is installed: `pwsh --version`
- Update `FLASHDB_MODULE_PATH` environment variable

### GUI Can't Connect to API

**Error:** `Failed to connect to localhost:3001`
- Ensure API is running: `http://localhost:3001/health`
- Check CORS configuration in API
- Verify proxy settings in `vite.config.ts`

### PowerShell Module Error

**Error:** `Cannot find path 'C:\flashdb\src\FlashDB\FlashDB.psm1'`
- Verify FlashDB module exists at specified path
- Update `FLASHDB_MODULE_PATH` in `.env`
- Ensure FlashDB PowerShell module is installed: `Import-Module C:\flashdb\src\FlashDB\FlashDB.psm1`

## Testing

### API Tests
```bash
cd src/api
npm test
```

### GUI Tests (Coming Soon)
```bash
cd src/gui
npm test
```

## Contributing

1. Create feature branch: `git checkout -b feature/my-feature`
2. Make changes and test
3. Commit: `git commit -am 'Add feature'`
4. Push: `git push origin feature/my-feature`
5. Submit pull request

## License

MIT

## Support

For issues or questions:
1. Check documentation above
2. Review logs for error details
3. Verify configuration and prerequisites
4. Check GitHub issues

---

**FlashDB v0.1.0** - Database Virtualization Tool  
Built with Node.js + Express + React + TypeScript
