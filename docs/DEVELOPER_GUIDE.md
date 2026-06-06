# FlashDB Developer Guide

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Development Environment Setup](#development-environment-setup)
3. [Code Structure](#code-structure)
4. [API Integration](#api-integration)
5. [PowerShell Module Development](#powershell-module-development)
6. [Testing](#testing)
7. [Contributing Guidelines](#contributing-guidelines)
8. [Deployment](#deployment)

## Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     User Interface Layer                     │
├─────────────────────────────────────────────────────────────┤
│  Dashboard (React/TypeScript)  │  CLI (PowerShell)          │
├─────────────────────────────────────────────────────────────┤
│                      REST API Layer                          │
├─────────────────────────────────────────────────────────────┤
│  Express.js Server  │  Route Handlers  │  Middleware        │
├─────────────────────────────────────────────────────────────┤
│                    Business Logic Layer                      │
├─────────────────────────────────────────────────────────────┤
│  PowerShell Service  │  Storage Manager  │  Metadata Store  │
├─────────────────────────────────────────────────────────────┤
│                   Data Access Layer                          │
├─────────────────────────────────────────────────────────────┤
│  VHDX Operations  │  SQL Server  │  File System            │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Backend:**
- Node.js 16+ (API Server)
- Express.js (Web Framework)
- TypeScript (Type Safety)
- PowerShell 7+ (Core Operations)
- SQLite/SQL Server (Metadata)

**Frontend:**
- React 18+ (UI Framework)
- TypeScript (Type Safety)
- Vite (Build Tool)
- Redux (State Management)

**Containerization:**
- Docker (Container Runtime)
- Docker Compose (Orchestration)

### Component Responsibilities

| Component | Responsibility | Language |
|-----------|-----------------|----------|
| REST API | HTTP endpoints, request/response handling | TypeScript |
| PowerShell Service | VHDX operations, SQL Server interaction | PowerShell |
| Storage Manager | Clone creation, storage optimization | PowerShell |
| Metadata Store | Clone/image registry, operation history | TypeScript |
| Dashboard | User interface, data visualization | React/TypeScript |
| CLI | Command-line interface | PowerShell |

## Development Environment Setup

### Prerequisites

- **Node.js**: 16.x or later
- **npm**: 8.x or later
- **PowerShell**: 7.0 or later
- **Git**: 2.30+
- **Docker**: 20.10+ (optional, for containerized development)
- **VS Code**: Recommended IDE

### Initial Setup

**Clone Repository:**

```bash
git clone https://github.com/flashdb/flashdb.git
cd flashdb
```

**Install Dependencies:**

```bash
# Install root dependencies
npm install

# Install API dependencies
cd src/api
npm install
npm run build

# Install GUI dependencies
cd ../gui
npm install
npm run build

cd ../..
```

**Environment Configuration:**

```bash
# Create .env file for API
cat > src/api/.env << EOF
NODE_ENV=development
PORT=3001
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
FLASHDB_MODULE_PATH=C:\flashdb\src\FlashDB\FlashDB.psm1
LOG_LEVEL=debug
EOF

# Create .env file for GUI
cat > src/gui/.env << EOF
VITE_API_URL=http://localhost:3001
VITE_APP_NAME=FlashDB
EOF
```

**Setup PowerShell Module:**

```powershell
# Update PowerShell execution policy
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Import FlashDB module
Import-Module "C:\flashdb\src\FlashDB\FlashDB.psm1" -Force

# Verify import
Get-Command -Module FlashDB | Measure-Object
```

### Running Development Services

**Start API Server:**

```bash
cd src/api
npm run dev
# Server runs at http://localhost:3001
```

**Start Dashboard:**

```bash
cd src/gui
npm run dev
# Dashboard runs at http://localhost:5173
```

**Start All Services (Docker):**

```bash
docker-compose -f docker-compose.yml up -d
# API: http://localhost:3001
# Dashboard: http://localhost:3000
```

## Code Structure

### Directory Layout

```
flashdb/
├── src/
│   ├── FlashDB/                    # PowerShell Module
│   │   ├── FlashDB.psm1            # Main module file
│   │   ├── Public/                 # Public cmdlets
│   │   │   ├── New-FlashdbClone.ps1
│   │   │   ├── New-FlashdbCheckpoint.ps1
│   │   │   └── Get-FlashdbStatus.ps1
│   │   ├── Private/                # Private functions
│   │   └── Resources/              # Help and constants
│   │
│   ├── api/                        # REST API Server
│   │   ├── src/
│   │   │   ├── index.ts            # Entry point
│   │   │   ├── routes/             # Route handlers
│   │   │   │   ├── clones.ts
│   │   │   │   ├── goldenImages.ts
│   │   │   │   ├── checkpoints.ts
│   │   │   │   ├── search.ts
│   │   │   │   ├── batch.ts
│   │   │   │   └── metrics.ts
│   │   │   ├── services/           # Business logic
│   │   │   │   ├── powershellService.ts
│   │   │   │   ├── storageService.ts
│   │   │   │   └── metricsService.ts
│   │   │   ├── middleware/         # Middlewares
│   │   │   │   ├── errorHandler.ts
│   │   │   │   └── logging.ts
│   │   │   └── logger.ts           # Logging
│   │   ├── dist/                   # Compiled output
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── gui/                        # React Dashboard
│   │   ├── src/
│   │   │   ├── main.tsx            # Entry point
│   │   │   ├── App.tsx             # Main component
│   │   │   ├── components/         # React components
│   │   │   ├── pages/              # Page components
│   │   │   ├── services/           # API client services
│   │   │   ├── store/              # Redux store
│   │   │   ├── types/              # TypeScript types
│   │   │   ├── hooks/              # Custom hooks
│   │   │   └── styles/             # CSS/SCSS files
│   │   ├── public/
│   │   ├── dist/                   # Built output
│   │   └── vite.config.ts
│   │
│   ├── Providers/                  # Storage/Database Providers
│   │   ├── VhdxProvider.cs
│   │   └── SqlServerProvider.cs
│   │
│   └── FlashDB.Api/                # Legacy C# API (if applicable)
│
├── tests/
│   ├── Unit/                       # Unit tests
│   ├── Integration/                # Integration tests
│   ├── Performance/                # Performance tests
│   └── E2E/                        # End-to-end tests
│
├── docs/                           # Documentation
├── docker/                         # Docker files
├── docker-compose.yml
└── README.md
```

### Key Files

**PowerShell Module Entry Point:**
```powershell
# src/FlashDB/FlashDB.psm1
Import-Module "./Public/*"
Import-Module "./Private/*"

# Export public functions
Export-ModuleMember -Function @(
  'New-FlashdbClone',
  'Remove-FlashdbClone',
  'Get-FlashdbClone',
  'New-FlashdbCheckpoint',
  'Restore-FlashdbCheckpoint'
)
```

**API Entry Point:**
```typescript
// src/api/src/index.ts
import express from 'express';
import cloneRoutes from './routes/clones';
import imageRoutes from './routes/goldenImages';

const app = express();
app.use('/api/clones', cloneRoutes);
app.use('/api/golden-images', imageRoutes);
app.listen(3001);
```

## API Integration

### REST Endpoint Development

**Creating a New Endpoint:**

```typescript
// src/api/src/routes/example.ts
import { Router, Request, Response } from 'express';
import { PowerShellService } from '../services/powershellService';

const router = Router();
const psService = new PowerShellService();

// GET /api/example/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validation
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID is required'
      });
    }
    
    // Business logic
    const result = await psService.executeCommand('Get-Example', { Id: id });
    
    // Response
    return res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;
```

### Error Handling

**Standard Error Response:**

```typescript
// Consistent error format
interface ErrorResponse {
  success: false;
  message: string;
  code?: string;
  details?: Record<string, any>;
}

// Error handler middleware
app.use((err: any, req: Request, res: Response) => {
  const statusCode = err.statusCode || 500;
  const errorResponse: ErrorResponse = {
    success: false,
    message: err.message,
    code: err.code,
    details: process.env.NODE_ENV === 'development' ? err : undefined
  };
  
  res.status(statusCode).json(errorResponse);
});
```

### API Client (Frontend)

**Service Example:**

```typescript
// src/gui/src/services/cloneService.ts
import axios from 'axios';

const API_URL = process.env.VITE_API_URL;

export const cloneService = {
  list: () => axios.get(`${API_URL}/api/clones`),
  create: (data) => axios.post(`${API_URL}/api/clones`, data),
  delete: (id) => axios.delete(`${API_URL}/api/clones/${id}`)
};
```

## PowerShell Module Development

### Adding New Cmdlet

**1. Create Cmdlet File:**

```powershell
# src/FlashDB/Public/New-CustomOperation.ps1

<#
.SYNOPSIS
    Create a custom operation.

.DESCRIPTION
    Long description of what the cmdlet does.

.PARAMETER Name
    The name of the operation.

.EXAMPLE
    New-CustomOperation -Name "MyOperation"

.LINK
    https://github.com/flashdb/flashdb
#>

function New-CustomOperation {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        
        [Parameter(Mandatory = $false)]
        [string]$Description
    )
    
    process {
        # Implementation
        Write-Verbose "Creating operation: $Name"
        
        try {
            # Your logic here
            
            return $result
        }
        catch {
            Write-Error "Failed to create operation: $_"
        }
    }
}
```

**2. Export in Module File:**

```powershell
# In FlashDB.psm1, add to Export-ModuleMember
Export-ModuleMember -Function @(
    'New-CustomOperation',
    # ... other functions
)
```

**3. Add Tests:**

```powershell
# tests/Unit/New-CustomOperation.Tests.ps1

Describe "New-CustomOperation" {
    Context "Valid parameters" {
        It "Creates operation successfully" {
            $result = New-CustomOperation -Name "Test"
            $result.Name | Should -Be "Test"
        }
    }
    
    Context "Invalid parameters" {
        It "Throws on missing Name" {
            { New-CustomOperation } | Should -Throw
        }
    }
}
```

### PowerShell Best Practices

**Cmdlet Naming:**
- Use approved verbs: Get, Set, New, Remove, Start, Stop, etc.
- Format: `Verb-Noun` or `Verb-Prefix-Noun`
- Example: `New-FlashdbClone`, `Get-FlashdbCloneStatus`

**Parameter Validation:**

```powershell
function New-FlashdbClone {
    param(
        [Parameter(Mandatory = $true, ValueFromPipeline = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Name,
        
        [Parameter(Mandatory = $true)]
        [ValidateSet("BackupRestore", "ReplicaBackup", "TableByTableCopy")]
        [string]$Method
    )
}
```

**Error Handling:**

```powershell
try {
    $result = Get-Item $path
}
catch [System.IO.FileNotFoundException] {
    Write-Error "File not found: $path"
}
catch {
    Write-Error "Unexpected error: $_"
}
```

## Testing

### Unit Tests

**Testing API Routes:**

```typescript
// src/api/src/routes/clones.test.ts
import request from 'supertest';
import app from '../index';

describe('Clone Routes', () => {
  it('GET /api/clones should return list', async () => {
    const response = await request(app)
      .get('/api/clones')
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });
  
  it('POST /api/clones should create clone', async () => {
    const response = await request(app)
      .post('/api/clones')
      .send({
        name: 'test-clone',
        goldenImageId: 'test-image'
      })
      .expect(201);
    
    expect(response.body.success).toBe(true);
  });
});
```

**Testing PowerShell Cmdlets:**

```powershell
# tests/Unit/CloneOperations.Tests.ps1
Describe "Clone Operations" {
    BeforeAll {
        Import-Module "C:\FlashDB\FlashDB.psm1" -Force
    }
    
    Context "Creating Clones" {
        It "Creates clone with valid parameters" {
            $clone = New-FlashdbClone -Name "test-001" `
              -GoldenImageId "test-image"
            
            $clone | Should -Not -BeNullOrEmpty
            $clone.Name | Should -Be "test-001"
        }
    }
}
```

### Integration Tests

**Test Full Workflow:**

```typescript
// tests/Integration/clone-workflow.test.ts
describe("Clone Workflow Integration", () => {
  it("should complete full clone lifecycle", async () => {
    // 1. Create clone
    const createRes = await request(app)
      .post('/api/clones')
      .send({ name: 'test-wf', goldenImageId: 'test-image' });
    const cloneId = createRes.body.data.id;
    
    // 2. Create checkpoint
    const cpRes = await request(app)
      .post(`/api/clones/${cloneId}/checkpoints`)
      .send({ name: 'baseline' });
    const checkpointId = cpRes.body.data.id;
    
    // 3. Restore checkpoint
    const restoreRes = await request(app)
      .post(`/api/clones/${cloneId}/checkpoints/${checkpointId}/restore`)
      .expect(200);
    
    expect(restoreRes.body.success).toBe(true);
    
    // 4. Delete clone
    await request(app)
      .delete(`/api/clones/${cloneId}`)
      .expect(200);
  });
});
```

### Running Tests

**Run All Tests:**

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Test coverage
npm run test:coverage
```

## Contributing Guidelines

### Git Workflow

```bash
# 1. Create feature branch
git checkout -b feature/awesome-feature

# 2. Make changes and commit
git add .
git commit -m "Add awesome feature"

# 3. Push and create PR
git push origin feature/awesome-feature

# 4. After review and approval, merge to main
git checkout main
git merge feature/awesome-feature
```

### Code Style

**TypeScript:**
- Use strict mode: `"strict": true` in tsconfig.json
- 2-space indentation
- Prefer interfaces over types
- Use async/await over promises

**PowerShell:**
- PascalCase for functions: `New-FlashdbClone`
- camelCase for variables: `$cloneId`
- 4-space indentation
- Comment-based help for all public functions

### Commit Messages

```
feat: add clone creation feature
fix: resolve race condition in checkpoint restore
docs: update API reference
refactor: simplify storage manager
test: add integration tests for batch operations

Format: <type>: <subject>
```

### Pull Request Process

1. **Provide Description**
   - What does the PR do?
   - Why is this change needed?
   - How to test the changes

2. **Tests**
   - All tests must pass
   - Add new tests for new functionality
   - Maintain >80% coverage

3. **Code Review**
   - At least 1 approval required
   - Address feedback and comments
   - Update if requested

4. **Merge**
   - Squash commits for clarity
   - Delete branch after merge

## Deployment

### Building for Production

**Build API:**

```bash
cd src/api
npm run build
npm run test
```

**Build Dashboard:**

```bash
cd src/gui
npm run build
# Output in dist/
```

### Docker Deployment

**Build Image:**

```bash
docker build -f Dockerfile.api.prod -t flashdb-api:1.0.0 .
docker build -f Dockerfile.gui.prod -t flashdb-gui:1.0.0 .
```

**Deploy to Registry:**

```bash
docker tag flashdb-api:1.0.0 myregistry/flashdb-api:1.0.0
docker push myregistry/flashdb-api:1.0.0
```

### Monitoring Production

**Health Checks:**

```bash
# API health
curl http://localhost:3001/health

# View logs
docker logs -f flashdb-api
docker logs -f flashdb-gui
```

## API Reference Integration

For detailed API documentation, see [API_REFERENCE.md](./API_REFERENCE.md)

## Additional Resources

- [Architecture Documentation](./Architecture/)
- [Testing Guide](./TESTING.md)
- [Deployment Guide](./DEPLOYING.md)
- [Troubleshooting](./TROUBLESHOOTING.md)
