# Database DELETE Operations Guide

**Status:** Implementation guide for persisting deletes to database  
**Phase 3 Extension:** Durable Metadata Model  
**Issue:** Delete operations not persisting to database

---

## Problem Summary

When deleting golden images or clones, the operations don't persist to the database. The test provider used in-memory Maps for testing, but the real MetadataService needs to execute SQL DELETE statements.

## Solution

Implement actual SQL DELETE operations in `metadataService.ts` with cascading deletes to maintain referential integrity.

---

## DELETE Operations to Implement

### 1. Delete Golden Image (with cascading deletes)

**File:** `src/api/src/services/metadataService.ts`  
**Method:** `deleteGoldenImage(imageId: string)`

**Steps:**
1. Delete all checkpoints for all clones of this image
2. Delete all clones for this image
3. Delete the golden image

**SQL Implementation:**

```typescript
async deleteGoldenImage(imageId: string): Promise<void> {
  logger.debug(`[MetadataService] Deleting golden image: ${imageId}`);

  if (!this.sqlClient) {
    throw new Error('SQL client not available');
  }

  try {
    // Step 1: Delete checkpoints (dependent on clones)
    const deleteCheckpointsQuery = `
      DELETE FROM checkpoints
      WHERE clone_id IN (
        SELECT id FROM clones WHERE golden_image_id = @imageId
      )
    `;
    await this.sqlClient.query(deleteCheckpointsQuery, { 
      imageId 
    });
    logger.debug(`[MetadataService] Deleted checkpoints for image: ${imageId}`);

    // Step 2: Delete clones
    const deleteClonesQuery = `
      DELETE FROM clones WHERE golden_image_id = @imageId
    `;
    await this.sqlClient.query(deleteClonesQuery, { 
      imageId 
    });
    logger.debug(`[MetadataService] Deleted clones for image: ${imageId}`);

    // Step 3: Delete golden image
    const deleteImageQuery = `
      DELETE FROM golden_images WHERE id = @imageId
    `;
    await this.sqlClient.query(deleteImageQuery, { 
      imageId 
    });

    logger.info(
      `[MetadataService] Golden image and dependents deleted: ${imageId}`
    );
  } catch (error) {
    logger.error(`[MetadataService] Failed to delete golden image: ${error}`);
    throw error;
  }
}
```

### 2. Delete Clone (with cascading checkpoints)

**File:** `src/api/src/services/metadataService.ts`  
**Method:** `deleteClone(cloneId: string)` — already added

**Implementation:**

```typescript
async deleteClone(cloneId: string): Promise<void> {
  logger.debug(`[MetadataService] Deleting clone: ${cloneId}`);

  if (!this.sqlClient) {
    throw new Error('SQL client not available');
  }

  try {
    // Step 1: Delete all checkpoints for this clone
    const deleteCheckpointsQuery = `
      DELETE FROM checkpoints WHERE clone_id = @cloneId
    `;
    await this.sqlClient.query(deleteCheckpointsQuery, { 
      cloneId 
    });
    logger.debug(`[MetadataService] Deleted checkpoints for clone: ${cloneId}`);

    // Step 2: Delete the clone itself
    const deleteCloneQuery = `
      DELETE FROM clones WHERE id = @cloneId
    `;
    await this.sqlClient.query(deleteCloneQuery, { 
      cloneId 
    });

    logger.info(`[MetadataService] Clone and dependents deleted: ${cloneId}`);
  } catch (error) {
    logger.error(`[MetadataService] Failed to delete clone: ${error}`);
    throw error;
  }
}
```

### 3. Delete Checkpoint

**File:** `src/api/src/services/metadataService.ts`  
**Method:** `deleteCheckpoint(cloneId: string, checkpointId: string)` — already added

**Implementation:**

```typescript
async deleteCheckpoint(
  cloneId: string,
  checkpointId: string
): Promise<void> {
  logger.debug(
    `[MetadataService] Deleting checkpoint: ${checkpointId}`
  );

  if (!this.sqlClient) {
    throw new Error('SQL client not available');
  }

  try {
    // Delete checkpoint by ID and validate clone ownership
    const deleteQuery = `
      DELETE FROM checkpoints
      WHERE id = @checkpointId AND clone_id = @cloneId
    `;
    
    const result = await this.sqlClient.query(deleteQuery, {
      checkpointId,
      cloneId,
    });

    logger.info(`[MetadataService] Checkpoint deleted: ${checkpointId}`);
  } catch (error) {
    logger.error(`[MetadataService] Failed to delete checkpoint: ${error}`);
    throw error;
  }
}
```

---

## SqlClient.query() Interface

The `sqlClient.query()` method needs to support parameterized queries:

```typescript
interface SqlClient {
  query(
    sql: string,
    parameters?: Record<string, any>
  ): Promise<any>;
}
```

**Parameters:**
- `sql`: SQL query string with @param placeholders
- `parameters`: Object with key-value pairs for SQL parameters

**Example:**
```typescript
await sqlClient.query(
  'DELETE FROM users WHERE id = @id',
  { id: '123' }
);
```

---

## Testing Deletes

### Unit Test Example

```typescript
describe('MetadataService Delete Operations', () => {
  let metadataService: MetadataService;
  let sqlClient: MockSqlClient;

  beforeEach(() => {
    sqlClient = new MockSqlClient();
    metadataService = new MetadataService(sqlClient);
  });

  it('should delete golden image and cascade to clones/checkpoints', async () => {
    const imageId = 'img-123';

    await metadataService.deleteGoldenImage(imageId);

    // Verify all three delete queries were called
    expect(sqlClient.queryCount).toBe(3);
    expect(sqlClient.lastQueries).toContain('DELETE FROM checkpoints WHERE clone_id IN');
    expect(sqlClient.lastQueries).toContain('DELETE FROM clones WHERE golden_image_id');
    expect(sqlClient.lastQueries).toContain('DELETE FROM golden_images WHERE id');
  });

  it('should delete clone and cascade to checkpoints', async () => {
    const cloneId = 'clone-123';

    await metadataService.deleteClone(cloneId);

    expect(sqlClient.queryCount).toBe(2);
    expect(sqlClient.lastQueries).toContain('DELETE FROM checkpoints WHERE clone_id');
    expect(sqlClient.lastQueries).toContain('DELETE FROM clones WHERE id');
  });

  it('should delete checkpoint only', async () => {
    const checkpointId = 'cp-123';
    const cloneId = 'clone-123';

    await metadataService.deleteCheckpoint(cloneId, checkpointId);

    expect(sqlClient.queryCount).toBe(1);
    expect(sqlClient.lastQuery).toContain('DELETE FROM checkpoints WHERE id = @checkpointId');
  });
});
```

### Integration Test Example

```typescript
describe('Real Database Delete Operations', () => {
  let metadataService: MetadataService;
  let provider: SqlServerProvider;

  beforeAll(async () => {
    // Connect to test database
    const sqlClient = new SqlClient(
      'localhost,1434',
      'SA',
      'FlashDB@Password123'
    );
    metadataService = new MetadataService(sqlClient);
    provider = new SqlServerProvider(sqlClient);
  });

  it('should delete golden image and all dependents from database', async () => {
    // Create test data
    const image = await provider.createGoldenImage({
      name: 'DeleteTestImage',
      version: '1.0.0',
      method: 'BackupRestore',
      outputPath: '/test/images',
    });

    const clone = await provider.createClone({
      goldenImageId: image.id,
      cloneName: 'DeleteTestClone',
      instancePath: 'MSSQLSERVER',
      storagePath: '/test/clones',
    });

    const checkpoint = await provider.createCheckpoint(clone.id, {
      checkpointName: 'DeleteTestCP',
      phase: 'manual',
    });

    // Verify data was created
    let retrieved = await provider.getGoldenImage(image.id);
    expect(retrieved).toBeDefined();

    // Delete golden image (should cascade)
    await metadataService.deleteGoldenImage(image.id);

    // Verify all deleted from database
    retrieved = await provider.getGoldenImage(image.id);
    expect(retrieved).toBeNull();

    const cloneCheck = await provider.getClone(clone.id);
    expect(cloneCheck).toBeNull();

    const checkpointCheck = await provider.getCheckpoint(
      clone.id,
      checkpoint.id
    );
    expect(checkpointCheck).toBeNull();
  });
});
```

---

## Cascade Delete Strategy

### Database Constraints (Alternative Approach)

Instead of application-level cascades, use SQL foreign key constraints:

**Schema Definition:**

```sql
-- Golden Images table
CREATE TABLE golden_images (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ...
);

-- Clones table with FK to golden_images
CREATE TABLE clones (
  id TEXT PRIMARY KEY,
  golden_image_id TEXT NOT NULL,
  ...
  FOREIGN KEY (golden_image_id) REFERENCES golden_images(id) 
    ON DELETE CASCADE
);

-- Checkpoints table with FK to clones
CREATE TABLE checkpoints (
  id TEXT PRIMARY KEY,
  clone_id TEXT NOT NULL,
  ...
  FOREIGN KEY (clone_id) REFERENCES clones(id) 
    ON DELETE CASCADE
);
```

**Benefit:** Single DELETE statement cascades automatically:

```typescript
async deleteGoldenImage(imageId: string): Promise<void> {
  const query = `DELETE FROM golden_images WHERE id = @imageId`;
  await this.sqlClient.query(query, { imageId });
  logger.info(`[MetadataService] Golden image deleted: ${imageId}`);
}
```

---

## Validation & Safety

### Pre-Delete Validation

```typescript
async deleteGoldenImage(imageId: string): Promise<void> {
  // Validate image exists
  const image = await this.getGoldenImage(imageId);
  if (!image) {
    logger.warn(`[MetadataService] Image not found: ${imageId}`);
    return; // Idempotent: no-op if already deleted
  }

  // Log action for audit
  logger.info(`[MetadataService] User deleting golden image: ${imageId}`);

  // Execute delete
  const query = `DELETE FROM golden_images WHERE id = @imageId`;
  await this.sqlClient.query(query, { imageId });

  logger.info(
    `[MetadataService] Golden image deleted and cascaded: ${imageId}`
  );
}
```

### Pinned Checkpoint Protection

When deleting a clone with pinned checkpoints, require explicit force:

```typescript
async deleteClone(
  cloneId: string,
  force: boolean = false
): Promise<void> {
  // Check for pinned checkpoints
  const checkpoints = await this.getCheckpointsForClone(cloneId);
  const pinnedCount = checkpoints.filter((cp) => cp.isPinned).length;

  if (pinnedCount > 0 && !force) {
    throw new Error(
      `Cannot delete clone with ${pinnedCount} pinned checkpoints. Use force=true to delete.`
    );
  }

  // Delete clone (cascades to all checkpoints)
  const query = `DELETE FROM clones WHERE id = @cloneId`;
  await this.sqlClient.query(query, { cloneId });

  if (force && pinnedCount > 0) {
    logger.warn(
      `[MetadataService] Deleted ${pinnedCount} pinned checkpoints as part of clone deletion`
    );
  }
}
```

---

## Implementation Checklist

- [ ] Add `deleteGoldenImage()` implementation
- [ ] Add `deleteClone()` with cascade to checkpoints
- [ ] Add `deleteCheckpoint()` implementation
- [ ] Add pinned checkpoint protection to delete operations
- [ ] Add pre-delete validation (exists check, audit logging)
- [ ] Add error handling and rollback logic
- [ ] Create unit tests with MockSqlClient
- [ ] Create integration tests against real database
- [ ] Add provider delete methods that call metadataService
- [ ] Verify cascade deletes in database schema (or add ON DELETE CASCADE)
- [ ] Test cleanup in e2e-verification.js

---

## Next Steps

1. **Implement SQL client integration** in `metadataService.ts`
2. **Add CASCADE constraints** to database schema if not present
3. **Create comprehensive tests** for delete operations
4. **Verify data persistence** in real database
5. **Update e2e tests** to verify deletes are persisted

---

## Related Files

- `src/api/src/services/metadataService.ts` — Main implementation
- `src/api/src/db/migrations/001_create_metadata_tables.sql` — Schema definition
- `tests/e2e-verification.js` — End-to-end tests

---

**Implementation Priority:** HIGH  
**Impact:** All delete operations must persist to prevent orphaned data
