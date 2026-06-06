import axios, { AxiosInstance } from 'axios';

/**
 * Multi-Instance Cluster Tests
 *
 * Tests verify:
 * 1. Instance registration and discovery
 * 2. Cluster state consistency
 * 3. Instance lifecycle management
 * 4. Health monitoring
 * 5. Graceful shutdown
 */

describe('Multi-Instance Cluster Operations', () => {
  const instances = [
    { port: 3001, id: 'api-primary-001', role: 'primary' },
    { port: 3002, id: 'api-replica-001', role: 'replica' },
    { port: 3003, id: 'api-replica-002', role: 'replica' }
  ];

  let clients: Map<number, AxiosInstance> = new Map();
  const baseUrls: Map<number, string> = new Map(
    instances.map(i => [i.port, `http://localhost:${i.port}`])
  );

  beforeAll(async () => {
    // Initialize axios clients for each instance
    instances.forEach(instance => {
      const client = axios.create({
        baseURL: baseUrls.get(instance.port),
        timeout: 5000,
        validateStatus: () => true // Don't throw on any status
      });
      clients.set(instance.port, client);
    });

    // Wait for instances to be healthy
    await waitForInstancesHealthy();
  });

  async function waitForInstancesHealthy(maxRetries = 30): Promise<void> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const results = await Promise.all(
          instances.map(inst =>
            clients.get(inst.port)!.get('/live').then(() => true).catch(() => false)
          )
        );

        if (results.every(r => r)) {
          console.log('All instances are healthy');
          return;
        }
      } catch (e) {
        // Retry
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('Instances failed to become healthy');
  }

  describe('Instance Registration and Discovery', () => {
    test('Primary instance should be registered', async () => {
      const response = await clients.get(3001)!.get('/api/admin/instance');
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.instanceId).toBe('api-primary-001');
      expect(response.data.data.role).toBe('primary');
      expect(response.data.data.isPrimary).toBe(true);
    });

    test('Replica instances should be registered', async () => {
      for (const port of [3002, 3003]) {
        const response = await clients.get(port)!.get('/api/admin/instance');
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.data.role).toBe('replica');
        expect(response.data.data.isPrimary).toBe(false);
      }
    });

    test('Cluster mode should be enabled', async () => {
      for (const port of [3001, 3002, 3003]) {
        const response = await clients.get(port)!.get('/api/admin/instance');
        expect(response.data.data.isClusterMode).toBe(true);
      }
    });
  });

  describe('Cluster Discovery', () => {
    test('/api/admin/instances should list all active instances', async () => {
      const response = await clients.get(3001)!.get('/api/admin/instances');
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.totalInstances).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(response.data.data.instances)).toBe(true);
    });

    test('All instances should discover each other', async () => {
      const promises = instances.map(inst =>
        clients.get(inst.port)!.get('/api/admin/instances')
      );

      const responses = await Promise.all(promises);

      responses.forEach((response, idx) => {
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        // Each instance should be able to discover itself and others
        expect(response.data.data.instances.length).toBeGreaterThan(0);
      });
    });

    test('Instance list should include current instance', async () => {
      for (const inst of instances) {
        const response = await clients.get(inst.port)!.get('/api/admin/instances');
        const instanceIds = response.data.data.instances.map((i: any) => i.instanceId);
        expect(instanceIds).toContain(inst.id);
      }
    });
  });

  describe('Cluster Status Monitoring', () => {
    test('/api/admin/cluster-status should report healthy cluster', async () => {
      const response = await clients.get(3001)!.get('/api/admin/cluster-status');
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.clusterEnabled).toBe(true);
      expect(response.data.data.clusterHealth).toBe('healthy');
      expect(response.data.data.activeInstances).toBeGreaterThan(0);
    });

    test('Cluster status should show all instance details', async () => {
      const response = await clients.get(3001)!.get('/api/admin/cluster-status');
      const status = response.data.data;

      expect(status.currentInstance).toBeDefined();
      expect(status.currentInstance.instanceId).toBeDefined();
      expect(status.currentInstance.role).toBeDefined();
      expect(status.currentInstance.status).toBeDefined();
      expect(status.instances).toBeInstanceOf(Array);
      expect(status.instances.length).toBeGreaterThan(0);
    });

    test('Primary instance should be identifiable in cluster status', async () => {
      const response = await clients.get(3001)!.get('/api/admin/cluster-status');
      const instances = response.data.data.instances;
      const primaryInstances = instances.filter((i: any) => i.role === 'primary');

      expect(primaryInstances.length).toBeGreaterThanOrEqual(1);
      expect(primaryInstances[0].isPrimary).toBe(true);
    });
  });

  describe('Heartbeat Management', () => {
    test('POST /api/admin/heartbeat should update last heartbeat', async () => {
      const response = await clients.get(3001)!.post('/api/admin/heartbeat');
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.lastHeartbeat).toBeDefined();
      expect(new Date(response.data.data.lastHeartbeat)).toBeInstanceOf(Date);
    });

    test('Heartbeat should work on all instances', async () => {
      const promises = instances.map(inst =>
        clients.get(inst.port)!.post('/api/admin/heartbeat')
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
        expect(response.data.data.lastHeartbeat).toBeDefined();
      });
    });

    test('Heartbeat timestamp should be recent', async () => {
      const response = await clients.get(3001)!.post('/api/admin/heartbeat');
      const heartbeatTime = new Date(response.data.data.lastHeartbeat);
      const now = new Date();
      const diffMs = Math.abs(now.getTime() - heartbeatTime.getTime());

      // Heartbeat should be within 5 seconds
      expect(diffMs).toBeLessThan(5000);
    });
  });

  describe('State Consistency Across Instances', () => {
    test('All instances should report consistent cluster size', async () => {
      const promises = instances.map(inst =>
        clients.get(inst.port)!.get('/api/admin/cluster-status')
      );

      const responses = await Promise.all(promises);
      const activeCounts = responses.map(r => r.data.data.activeInstances);

      // All instances should report the same number of active instances
      expect(new Set(activeCounts).size).toBe(1);
    });

    test('All instances should see same primary instance', async () => {
      const promises = instances.map(inst =>
        clients.get(inst.port)!.get('/api/admin/cluster-status')
      );

      const responses = await Promise.all(promises);
      const primaryInstances = responses.map(r =>
        r.data.data.instances.find((i: any) => i.role === 'primary')?.instanceId
      );

      // All should identify the same primary
      expect(new Set(primaryInstances).size).toBe(1);
    });

    test('Instance list should be consistent across cluster', async () => {
      const responses = await Promise.all(
        instances.map(inst =>
          clients.get(inst.port)!.get('/api/admin/instances')
        )
      );

      const instanceLists = responses.map(r =>
        r.data.data.instances
          .map((i: any) => i.instanceId)
          .sort()
          .join(',')
      );

      // All instances should report the same set of instances
      expect(new Set(instanceLists).size).toBe(1);
    });
  });

  describe('Instance Information Consistency', () => {
    test('Instance should report consistent information about itself', async () => {
      for (const inst of instances) {
        const infoResponse = await clients.get(inst.port)!.get('/api/admin/instance');
        const clusterResponse = await clients.get(inst.port)!.get('/api/admin/instances');

        const instanceInfo = infoResponse.data.data;
        const selfInCluster = clusterResponse.data.data.instances.find(
          (i: any) => i.instanceId === inst.id
        );

        expect(instanceInfo.instanceId).toBe(selfInCluster.instanceId);
        expect(instanceInfo.role).toBe(selfInCluster.role);
        expect(instanceInfo.status).toBe(selfInCluster.status);
        expect(instanceInfo.host).toBe(selfInCluster.host);
        expect(instanceInfo.port).toBe(selfInCluster.port);
      }
    });
  });

  describe('Cluster Cleanup Operations', () => {
    test('POST /api/admin/cleanup should execute without error', async () => {
      const response = await clients.get(3001)!.post('/api/admin/cleanup');
      expect(response.status).toBe(200);
      expect(response.data.success).toBe(true);
      expect(response.data.data.staleInstancesRemoved).toBeGreaterThanOrEqual(0);
      expect(response.data.data.timestamp).toBeDefined();
    });

    test('Cleanup should work on any instance', async () => {
      for (const port of [3001, 3002, 3003]) {
        const response = await clients.get(port)!.post('/api/admin/cleanup');
        expect(response.status).toBe(200);
        expect(response.data.success).toBe(true);
      }
    });
  });

  describe('Instance Status Fields', () => {
    test('Instance info should include version', async () => {
      for (const port of [3001, 3002, 3003]) {
        const response = await clients.get(port)!.get('/api/admin/instance');
        expect(response.data.data.version).toBeDefined();
        expect(typeof response.data.data.version).toBe('string');
      }
    });

    test('Instance info should include host and port', async () => {
      for (const port of [3001, 3002, 3003]) {
        const response = await clients.get(port)!.get('/api/admin/instance');
        expect(response.data.data.host).toBeDefined();
        expect(response.data.data.port).toBeDefined();
        expect(typeof response.data.data.port).toBe('number');
      }
    });

    test('Instance status should be active', async () => {
      for (const port of [3001, 3002, 3003]) {
        const response = await clients.get(port)!.get('/api/admin/instance');
        expect(['active', 'healthy']).toContain(response.data.data.status);
      }
    });
  });

  describe('Error Handling', () => {
    test('Non-existent endpoint should return 404', async () => {
      const response = await clients.get(3001)!.get('/api/admin/nonexistent');
      expect(response.status).toBeGreaterThanOrEqual(404);
    });

    test('Admin routes should be accessible from all instances', async () => {
      for (const port of [3001, 3002, 3003]) {
        const response = await clients.get(port)!.get('/api/admin/instance');
        expect(response.status).toBe(200);
      }
    });
  });

  describe('Performance and Response Times', () => {
    test('Instance info endpoint should respond quickly', async () => {
      const start = Date.now();
      await clients.get(3001)!.get('/api/admin/instance');
      const duration = Date.now() - start;

      // Should respond within 500ms
      expect(duration).toBeLessThan(500);
    });

    test('Cluster status endpoint should respond quickly', async () => {
      const start = Date.now();
      await clients.get(3001)!.get('/api/admin/cluster-status');
      const duration = Date.now() - start;

      // Should respond within 1000ms even with multiple instances
      expect(duration).toBeLessThan(1000);
    });
  });
});
