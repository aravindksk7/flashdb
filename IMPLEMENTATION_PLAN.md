# FlashDB - Comprehensive Implementation Plan

## 🎯 Overview

**Goal**: Implement complete GUI and API functionality for FlashDB database virtualization tool
**Timeline**: Phase 1 (MVP): 4-6 hours | Phase 2 (Full): 8-12 hours
**Architecture**: 3-tier (React GUI → Node.js API → PowerShell/SQL Server)

---

## 📊 Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        FLASHDB SYSTEM                          │
└────────────────────────────────────────────────────────────────┘

┌─────────────────────┐         ┌──────────────────────┐
│   React GUI         │◄───────►│  Node.js REST API    │
│  (Port 3000)        │  HTTP   │  (Port 3001)         │
│                     │         │                      │
│ - Dashboard         │         │ - Routes             │
│ - Forms             │         │ - PowerShell Service │
│ - State Management  │         │ - Error Handling     │
└─────────────────────┘         └──────────┬───────────┘
                                           │
                                    PowerShell.exe
                                           │
                    ┌──────────────────────┼──────────────────┐
                    │                      │                  │
            ┌───────▼────────┐    ┌────────▼────────┐  ┌──────▼──────┐
            │ VHDX Operations│    │ SQL Server Ops  │  │ Metadata    │
            │                │    │                 │  │ Management  │
            │ - New Disk     │    │ - Backup        │  │             │
            │ - Mount        │    │ - Restore       │  │ - State     │
            │ - Snapshot     │    │ - Clone         │  │ - Config    │
            └────────────────┘    └─────────────────┘  └─────────────┘
                    │                      │                  │
                    └──────────────────────┼──────────────────┘
                                           │
                            ┌──────────────▼──────────┐
                            │   SQL Server 2022       │
                            │   (Docker Container)    │
                            │   Port 1433             │
                            └─────────────────────────┘
```

---

## 📋 Implementation Phases

### **PHASE 1: MVP (Working UI/API with Mocked Backend)**
**Duration**: 4-6 hours
**Goal**: Get full UI working, API responding, ready for real backend

#### Phase 1 Deliverables
✅ Golden Image CRUD forms (create, list, delete)
✅ Clone Management forms (create, list, attach/detach, delete)
✅ Checkpoint Management (create, restore, label, delete)
✅ Real-time status updates
✅ API endpoints returning proper JSON
✅ Error handling and validation
✅ Mock data for testing

---

### **PHASE 2: Real Backend (PowerShell Implementation)**
**Duration**: 6-8 hours
**Goal**: Replace mocks with real SQL Server operations

#### Phase 2 Deliverables
✅ Real golden image creation (BACKUP/RESTORE, ReplicaBackup, TableByTableCopy)
✅ VHDX differencing disk management
✅ Actual SQL Server clone attachment
✅ Real checkpoint/snapshot creation
✅ Metadata persistence (JSON files)
✅ Transaction logging

---

### **PHASE 3: Advanced Features**
**Duration**: 4-6 hours
**Goal**: Polish, testing, deployment readiness

#### Phase 3 Deliverables
✅ Batch operations
✅ Scheduling
✅ Advanced filtering/search
✅ Performance metrics dashboard
✅ Automated testing
✅ Production Docker images

---

## 📝 Phase 1: MVP Implementation Steps

### **Step 1: Update React GUI (src/gui/src/)**

#### 1.1 Create Golden Image Form Component
**File**: `src/gui/src/components/CreateGoldenImageForm.tsx`
```tsx
- Form with fields:
  - Name (text)
  - Version (text)
  - Method dropdown (BACKUP_RESTORE, REPLICA_BACKUP, TABLE_BY_TABLE)
  - Output Path (text)
  - Source Connection (text)
- Submit button
- Success/Error toast notifications
- Clear on submit
```

**Imports from**:
- `axios` for API calls
- `zustand` for state management
- React hooks for form handling

---

#### 1.2 Create Clone Form Component
**File**: `src/gui/src/components/CreateCloneForm.tsx`
```tsx
- Dropdown to select Golden Image
- Clone Name (text)
- SQL Instance Path (text)
- Storage Path (text)
- Submit button
- Error handling
```

---

#### 1.3 Create Checkpoint Form Component
**File**: `src/gui/src/components/CreateCheckpointForm.tsx`
```tsx
- Clone selector dropdown
- Checkpoint Name (text)
- Phase dropdown (pre-etl, post-etl, manual)
- Description (textarea)
- Create button
```

---

#### 1.4 Update App.tsx
**File**: `src/gui/src/App.tsx`

Changes:
- Add form components to render
- Add state management for forms
- Add tabs/sections for:
  - Golden Images (list + create form)
  - Clones (list + create form + actions)
  - Checkpoints (list + create + restore)
- Add polling for status updates (every 2 seconds)
- Error boundary handling

---

### **Step 2: Update API Routes (src/api/src/routes/)**

#### 2.1 Golden Images Route
**File**: `src/api/src/routes/goldenImages.ts`

Routes to implement:
```
POST   /api/golden-images
  - Validate: name, version, method, outputPath
  - Call: New-FlashdbGoldenImage
  - Return: { id, name, version, method, createdAt, status }

GET    /api/golden-images
  - Call: Get-FlashdbGoldenImage
  - Return: Array of golden images

GET    /api/golden-images/:id
  - Call: Get-FlashdbGoldenImage -Id
  - Return: Single golden image details

DELETE /api/golden-images/:id
  - Call: Remove-FlashdbGoldenImage -GoldenImageId
  - Return: { success, message }
```

---

#### 2.2 Clones Route
**File**: `src/api/src/routes/clones.ts`

Routes to implement:
```
POST   /api/clones
  - Validate: goldenImageId, cloneName, instancePath, storagePath
  - Call: New-FlashdbClone
  - Return: { id, name, goldenImageId, status, createdAt }

GET    /api/clones
  - Call: Get-FlashdbClone
  - Return: Array of clones

GET    /api/clones/:id
  - Call: Get-FlashdbClone -CloneId
  - Return: Single clone with details

POST   /api/clones/:id/attach
  - Call: Connect-FlashdbClone
  - Return: { success, message }

POST   /api/clones/:id/detach
  - Call: Disconnect-FlashdbClone
  - Return: { success, message }

DELETE /api/clones/:id?deleteVhdx=true
  - Call: Remove-FlashdbClone
  - Return: { success, message }
```

---

#### 2.3 Checkpoints Route
**File**: `src/api/src/routes/checkpoints.ts`

Routes to implement:
```
POST   /api/clones/:cloneId/checkpoints
  - Validate: checkpointName, phase
  - Call: New-FlashdbCheckpoint
  - Return: { id, name, phase, createdAt }

GET    /api/clones/:cloneId/checkpoints
  - Call: Get-FlashdbCheckpoint -CloneId
  - Return: Array of checkpoints

POST   /api/clones/:cloneId/checkpoints/:cpId/restore
  - Call: Restore-FlashdbCheckpoint
  - Return: { success, message }

PATCH  /api/clones/:cloneId/checkpoints/:cpId
  - Update: isFavorite, labels
  - Call: Set-FlashdbCheckpoint
  - Return: { success, message }

DELETE /api/clones/:cloneId/checkpoints/:cpId
  - Call: Remove-FlashdbCheckpoint
  - Return: { success, message }
```

---

### **Step 3: Update PowerShell Provider**

**File**: `src/FlashDB/Providers/GoldenImageProvider.ps1`

Replace stub functions with working implementations:

#### 3.1 Golden Image Functions
```powershell
function New-FlashdbGoldenImage {
  # Phase 1 (MVP): Return mock golden image object
  # Phase 2 (Real): Implement actual backup logic
  
  $imageId = "golden-$(Get-Date -Format yyyyMMddHHmmss)"
  
  return @{
    Id = $imageId
    Name = $Name
    Version = $Version
    Method = $Method
    OutputPath = $OutputPath
    Size = 0
    CreatedAt = (Get-Date).ToIso8601String()
    Status = 'Ready'
  } | ConvertTo-Json
}
```

---

### **Step 4: State Management (Zustand)**

**File**: `src/gui/src/store/flashdbStore.ts`

```tsx
interface FlashDBStore {
  // Golden Images
  goldenImages: GoldenImage[]
  fetchGoldenImages: () => Promise<void>
  createGoldenImage: (params) => Promise<void>
  deleteGoldenImage: (id: string) => Promise<void>

  // Clones
  clones: Clone[]
  fetchClones: () => Promise<void>
  createClone: (params) => Promise<void>
  attachClone: (id: string) => Promise<void>
  detachClone: (id: string) => Promise<void>
  deleteClone: (id: string) => Promise<void>

  // Checkpoints
  checkpoints: Checkpoint[]
  fetchCheckpoints: (cloneId: string) => Promise<void>
  createCheckpoint: (cloneId, params) => Promise<void>
  restoreCheckpoint: (cloneId, cpId) => Promise<void>

  // UI State
  loading: boolean
  error: string | null
  selectedCloneId: string | null
}
```

---

## 📅 Implementation Schedule

### **Day 1: MVP Frontend (2-3 hours)**
1. Create form components (GoldenImageForm, CloneForm, CheckpointForm)
2. Update App.tsx with forms and tabs
3. Add Zustand store
4. Wire up API calls to forms
5. Add error handling and validation

### **Day 2: MVP Backend (2-3 hours)**
1. Implement API route handlers
2. Update PowerShell provider with proper response objects
3. Add request validation middleware
4. Test all endpoints with Postman

### **Day 3: Polish & Testing (2 hours)**
1. Real-time status updates
2. Loading states in GUI
3. Error messages
4. Basic E2E testing
5. Documentation

---

## ✅ Success Criteria for Phase 1

- [ ] Golden image form visible in GUI
- [ ] Can create golden image via form
- [ ] Golden images list shows on dashboard
- [ ] Clone form shows golden image dropdown
- [ ] Can create clone from golden image
- [ ] Clone appears in clones list
- [ ] Can attach/detach clone
- [ ] Checkpoint form appears for selected clone
- [ ] Can create and restore checkpoints
- [ ] All API calls return proper JSON
- [ ] Errors display in GUI toasts
- [ ] No 500 errors in API logs

---

## 🔧 Phase 2: Real Implementation

Once Phase 1 is working:

### **2.1 Golden Image Creation**
- Implement `New-FlashdbGoldenImage` with real BACKUP/RESTORE
- Add metadata persistence (JSON files)
- Handle connection failures gracefully

### **2.2 Clone Management**
- Implement VHDX differencing disk creation
- Actual SQL Server attachment/detachment
- Database initialization on clone

### **2.3 Checkpoint/Snapshot**
- Real VHDX snapshot creation
- State tracking via metadata
- Instant rollback functionality

### **2.4 Data Persistence**
- Store all metadata in JSON files
- Maintain operation logs
- Recovery from crashes

---

## 🧪 Testing Strategy

### Phase 1 Testing
```
Manual Testing:
1. Create golden image → Verify appears in list
2. Create clone → Verify attached to SQL Server
3. Create checkpoint → Verify snapshots created
4. Restore checkpoint → Verify data reverted
5. Test error cases (duplicate names, invalid paths, etc.)

API Testing (curl/Postman):
- GET /api/golden-images
- POST /api/golden-images
- DELETE /api/golden-images/:id
- Same for clones and checkpoints
```

### Phase 2 Testing
```
Integration Tests:
- Golden image → Clone → Checkpoint flow
- VHDX disk creation and cleanup
- SQL Server connection/disconnection
- Concurrent operations (multiple users)

Performance Tests:
- Clone creation speed (target: <5s)
- Checkpoint creation speed (target: <1s)
- List operations with 100+ items
```

---

## 📦 Deployment Checklist

### Phase 1 Deployment
- [ ] All tests passing
- [ ] No console errors in browser
- [ ] API responds to all endpoints
- [ ] Error handling working
- [ ] Documentation updated
- [ ] Code reviewed

### Phase 2 Deployment
- [ ] Real backend tested with actual SQL Server
- [ ] VHDX disk operations validated
- [ ] Metadata persistence verified
- [ ] Performance benchmarks met
- [ ] Load testing (concurrent users)
- [ ] Disaster recovery tested

---

## 📚 File Checklist

### **GUI Files to Create/Modify**
```
src/gui/src/
├── components/
│   ├── CreateGoldenImageForm.tsx (NEW)
│   ├── CreateCloneForm.tsx (NEW)
│   ├── CreateCheckpointForm.tsx (NEW)
│   ├── GoldenImageList.tsx (NEW)
│   ├── CloneList.tsx (NEW)
│   └── CheckpointList.tsx (NEW)
├── store/
│   └── flashdbStore.ts (NEW)
├── App.tsx (MODIFY)
├── App.css (MODIFY)
└── types/
    └── index.ts (NEW - Interfaces)
```

### **API Files to Create/Modify**
```
src/api/src/
├── routes/
│   ├── goldenImages.ts (MODIFY)
│   ├── clones.ts (MODIFY)
│   └── checkpoints.ts (MODIFY)
├── services/
│   └── powershellService.ts (MODIFY - fix escaping)
└── middleware/
    └── validation.ts (NEW)
```

### **PowerShell Files to Create/Modify**
```
src/FlashDB/
├── Providers/
│   └── GoldenImageProvider.ps1 (MODIFY - implement functions)
├── Core/
│   ├── MetadataManager.ps1 (MODIFY - implement persistence)
│   ├── VhdxOperations.ps1 (MODIFY - real implementations)
│   └── CloneManagement.ps1 (MODIFY - real implementations)
└── FlashDB.psm1 (MODIFY - verify all exports)
```

---

## 🎓 Next Steps

1. **Confirm this plan** with you
2. **Start Phase 1**: Implement forms and API routes
3. **Get forms working** with mock data
4. **Wire up API endpoints** 
5. **Test end-to-end**
6. **Move to Phase 2**: Real implementations

---

**Ready to start Phase 1?** Let me know if you want me to begin implementation!
