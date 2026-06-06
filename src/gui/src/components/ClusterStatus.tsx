import React, { useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/ClusterStatus.css';

interface Instance {
  instance_id: string;
  instanceId?: string;
  role: string;
  status: string;
  host: string;
  port: number;
  version: string;
  last_heartbeat: string;
  lastHeartbeat?: string;
}

interface ClusterStatusData {
  totalInstances: number;
  activeInstances: number;
  inactiveInstances: number;
  unhealthyInstances: number;
  instances: Instance[];
  status: string;
}

export const ClusterStatus: React.FC = () => {
  const [clusterData, setClusterData] = useState<ClusterStatusData | null>(null);
  const [instanceData, setInstanceData] = useState<Instance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadClusterStatus();
    const interval = setInterval(loadClusterStatus, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadClusterStatus = async () => {
    try {
      setError(null);
      const [clusterRes, instanceRes] = await Promise.all([
        axios.get('/api/admin/cluster-status'),
        axios.get('/api/admin/instance')
      ]);

      if (clusterRes.data.success) {
        setClusterData(clusterRes.data.data);
      }
      if (instanceRes.data.success) {
        setInstanceData(instanceRes.data.data);
      }
    } catch (err: any) {
      setError(`Failed to load cluster status: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const normalizeInstance = (instance: any): Instance => ({
    instance_id: instance?.instance_id || instance?.instanceId || 'unknown',
    instanceId: instance?.instanceId || instance?.instance_id || 'unknown',
    role: instance?.role || 'unknown',
    status: instance?.status || 'unknown',
    host: instance?.host || 'unknown',
    port: Number(instance?.port) || 0,
    version: instance?.version || 'unknown',
    last_heartbeat: instance?.last_heartbeat || instance?.lastHeartbeat || new Date(0).toISOString(),
    lastHeartbeat: instance?.lastHeartbeat || instance?.last_heartbeat || new Date(0).toISOString()
  });

  const currentInstance = instanceData ? normalizeInstance(instanceData) : null;
  const clusterInstances = (clusterData?.instances || []).map(normalizeInstance);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#4CAF50';
      case 'inactive': return '#FFC107';
      case 'unhealthy': return '#f44336';
      default: return '#9E9E9E';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return '✓';
      case 'inactive': return '○';
      case 'unhealthy': return '✕';
      default: return '?';
    }
  };

  const getTimeSinceHeartbeat = (timestamp: string) => {
    const now = new Date().getTime();
    const lastHeartbeat = new Date(timestamp).getTime();
    const secondsAgo = Math.floor((now - lastHeartbeat) / 1000);

    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
    return `${Math.floor(secondsAgo / 3600)}h ago`;
  };

  if (loading) return <div className="cluster-loading">Loading cluster status...</div>;
  if (error) return <div className="cluster-error">Error: {error}</div>;

  return (
    <div className="cluster-status">
      <h2>Cluster & Admin Status</h2>

      <div className="cluster-grid">
        {/* Current Instance */}
        {currentInstance && (
          <div className="cluster-card instance-card">
            <h3>Current Instance</h3>
            <div className="instance-details">
              <div className="detail-row">
                <span className="label">Instance ID:</span>
                <span className="value">{currentInstance.instance_id.substring(0, 8)}...</span>
              </div>
              <div className="detail-row">
                <span className="label">Role:</span>
                <span className="value" style={{ textTransform: 'capitalize' }}>
                  {currentInstance.role}
                </span>
              </div>
              <div className="detail-row">
                <span className="label">Status:</span>
                <span className="value" style={{ color: getStatusColor(currentInstance.status) }}>
                  <span className="status-icon">{getStatusIcon(currentInstance.status)}</span>
                  {currentInstance.status}
                </span>
              </div>
              <div className="detail-row">
                <span className="label">Host:</span>
                <span className="value">{currentInstance.host}</span>
              </div>
              <div className="detail-row">
                <span className="label">Port:</span>
                <span className="value">{currentInstance.port}</span>
              </div>
              <div className="detail-row">
                <span className="label">Version:</span>
                <span className="value">{currentInstance.version}</span>
              </div>
            </div>
          </div>
        )}

        {/* Cluster Health */}
        {clusterData && (
          <div className="cluster-card health-card">
            <h3>Cluster Health</h3>
            <div className="health-summary">
              <div className="health-stat">
                <div className="stat-label">Total Instances</div>
                <div className="stat-value">{clusterData.totalInstances}</div>
              </div>
              <div className="health-stat">
                <div className="stat-label">Active</div>
                <div className="stat-value" style={{ color: '#4CAF50' }}>
                  {clusterData.activeInstances}
                </div>
              </div>
              <div className="health-stat">
                <div className="stat-label">Inactive</div>
                <div className="stat-value" style={{ color: '#FFC107' }}>
                  {clusterData.inactiveInstances}
                </div>
              </div>
              <div className="health-stat">
                <div className="stat-label">Unhealthy</div>
                <div className="stat-value" style={{ color: '#f44336' }}>
                  {clusterData.unhealthyInstances}
                </div>
              </div>
            </div>
            <div className="health-gauge">
              <div className="gauge-background">
                <div
                  className="gauge-fill"
                  style={{
                    width: `${(clusterData.activeInstances / Math.max(clusterData.totalInstances, 1)) * 100}%`,
                    backgroundColor: clusterData.activeInstances === clusterData.totalInstances ? '#4CAF50' : '#FF9800'
                  }}
                />
              </div>
              <div className="gauge-label">
                {clusterData.activeInstances}/{clusterData.totalInstances} instances healthy
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Instances List */}
      {clusterData && (
        <div className="instances-section">
          <h3>All Cluster Instances</h3>
          <div className="instances-table">
            <div className="table-header">
              <div className="col-status">Status</div>
              <div className="col-id">Instance ID</div>
              <div className="col-role">Role</div>
              <div className="col-host">Host:Port</div>
              <div className="col-version">Version</div>
              <div className="col-heartbeat">Last Heartbeat</div>
            </div>
            <div className="table-body">
              {clusterInstances.map((instance) => (
                <div key={instance.instance_id} className="table-row">
                  <div className="col-status">
                    <span
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(instance.status), color: 'white' }}
                      title={instance.status}
                    >
                      {getStatusIcon(instance.status)}
                    </span>
                  </div>
                  <div className="col-id">{instance.instance_id.substring(0, 12)}...</div>
                  <div className="col-role" style={{ textTransform: 'capitalize' }}>{instance.role}</div>
                  <div className="col-host">{instance.host}:{instance.port}</div>
                  <div className="col-version">{instance.version}</div>
                  <div className="col-heartbeat">{getTimeSinceHeartbeat(instance.last_heartbeat)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="metrics-footer">
        <button onClick={loadClusterStatus} className="btn-refresh">Refresh</button>
      </div>
    </div>
  );
};

export default ClusterStatus;
