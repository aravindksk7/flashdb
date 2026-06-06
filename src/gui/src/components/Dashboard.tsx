import React, { useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/Dashboard.css';

interface MetricsData {
  overview: {
    totalClonesCreated: number;
    totalStorageSavedGB: number;
    avgCloneCreationTimeSeconds: number;
    operationSuccessRatePercent: number;
    operationsLast24h: number;
    activeClonesCount: number;
  };
  cloneStatistics: {
    totalClones: number;
    successfulClones: number;
    failedClones: number;
    averageCreationTimeSeconds: number;
    minCreationTimeSeconds: number;
    maxCreationTimeSeconds: number;
    successRatePercent: number;
  };
  storageMetrics: {
    totalUsedGB: number;
    totalSavingsGB: number;
    compressionRatioPercent: number;
    totalParentSizeGB: number;
    cloneStorageBreakdown: Array<{
      cloneId: string;
      cloneName: string;
      vhdxSizeGB: number;
      savingsGB: number;
    }>;
  };
  operationMetrics: {
    totalOperations: number;
    successfulOperations: number;
    successRatePercent: number;
    operationsByType: Array<{
      type: string;
      count: number;
      successRatePercent: number;
    }>;
  };
  timeline: {
    cloneCreations: Array<{
      timestamp: string;
      clones: number;
    }>;
    operations: Array<{
      timestamp: string;
      operations: number;
    }>;
  };
}

export const Dashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshInterval, setRefreshInterval] = useState(30); // seconds

  const API_BASE = '/api';

  // Load metrics on mount and set up auto-refresh
  useEffect(() => {
    loadMetrics();

    const interval = setInterval(loadMetrics, refreshInterval * 1000);
    return () => clearInterval(interval);
  }, [refreshInterval]);

  const loadMetrics = async () => {
    try {
      setError(null);
      const response = await axios.get(`${API_BASE}/metrics/all`);

      if (response.data.success) {
        setMetrics(response.data.data);
      } else {
        setError(response.data.message || 'Failed to load metrics');
      }
    } catch (err: any) {
      setError(`Failed to load metrics: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  const formatSeconds = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs.toFixed(0)}s`;
  };

  if (loading) {
    return <div className="dashboard-loading">Loading metrics...</div>;
  }

  if (error) {
    return <div className="dashboard-error">Error: {error}</div>;
  }

  if (!metrics) {
    return <div className="dashboard-error">No metrics data available</div>;
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Performance Metrics Dashboard</h1>
        <div className="dashboard-controls">
          <label>
            Refresh interval (seconds):
            <input
              type="number"
              min="5"
              max="300"
              value={refreshInterval}
              onChange={(e) => setRefreshInterval(parseInt(e.target.value) || 30)}
            />
          </label>
          <button onClick={loadMetrics} className="btn-refresh">
            Refresh Now
          </button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Total Clones Created</div>
          <div className="metric-value">{metrics.overview.totalClonesCreated}</div>
          <div className="metric-subtext">
            {metrics.overview.activeClonesCount} active
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Storage Saved</div>
          <div className="metric-value">{metrics.storageMetrics.totalSavingsGB.toFixed(2)} GB</div>
          <div className="metric-subtext">
            vs {metrics.storageMetrics.totalParentSizeGB.toFixed(2)} GB original
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Avg Clone Creation Time</div>
          <div className="metric-value">
            {formatSeconds(metrics.overview.avgCloneCreationTimeSeconds)}
          </div>
          <div className="metric-subtext">
            Based on {metrics.cloneStatistics.totalClones} clones
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Operation Success Rate</div>
          <div className="metric-value">
            {metrics.overview.operationSuccessRatePercent.toFixed(1)}%
          </div>
          <div className="metric-subtext">
            {metrics.operationMetrics.successfulOperations}/{metrics.operationMetrics.totalOperations}
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Last 24h Activity</div>
          <div className="metric-value">{metrics.overview.operationsLast24h}</div>
          <div className="metric-subtext">operations performed</div>
        </div>

        <div className="metric-card">
          <div className="metric-label">Compression Ratio</div>
          <div className="metric-value">
            {metrics.storageMetrics.compressionRatioPercent.toFixed(1)}%
          </div>
          <div className="metric-subtext">
            {metrics.storageMetrics.totalUsedGB.toFixed(2)} GB used
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="charts-grid">
        {/* Clone Creation Timeline */}
        <div className="chart-container">
          <h3>Clone Creation Timeline (24h)</h3>
          <div className="chart-area">
            {metrics.timeline.cloneCreations.length === 0 ? (
              <p className="no-data">No data available</p>
            ) : (
              <div className="timeline-chart">
                {metrics.timeline.cloneCreations.map((item, idx) => {
                  const maxClones = Math.max(...metrics.timeline.cloneCreations.map(c => c.clones));
                  const height = maxClones > 0 ? (item.clones / maxClones) * 100 : 0;
                  return (
                    <div
                      key={idx}
                      className="timeline-bar"
                      style={{ height: `${height}%` }}
                      title={`${item.timestamp}: ${item.clones} clones`}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Storage Breakdown */}
        <div className="chart-container">
          <h3>Storage Breakdown</h3>
          <div className="storage-breakdown">
            <div className="storage-stat">
              <div className="storage-label">Used</div>
              <div className="storage-value">
                {metrics.storageMetrics.totalUsedGB.toFixed(2)} GB
              </div>
              <div className="storage-bar">
                <div
                  className="storage-bar-used"
                  style={{
                    width: `${
                      metrics.storageMetrics.totalParentSizeGB > 0
                        ? (metrics.storageMetrics.totalUsedGB /
                            metrics.storageMetrics.totalParentSizeGB) *
                          100
                        : 0
                    }%`
                  }}
                />
              </div>
            </div>
            <div className="storage-stat">
              <div className="storage-label">Saved</div>
              <div className="storage-value">
                {metrics.storageMetrics.totalSavingsGB.toFixed(2)} GB
              </div>
              <div className="storage-bar">
                <div
                  className="storage-bar-saved"
                  style={{
                    width: `${
                      metrics.storageMetrics.totalParentSizeGB > 0
                        ? (metrics.storageMetrics.totalSavingsGB /
                            metrics.storageMetrics.totalParentSizeGB) *
                          100
                        : 0
                    }%`
                  }}
                />
              </div>
            </div>
            <div className="storage-stat">
              <div className="storage-label">Original</div>
              <div className="storage-value">
                {metrics.storageMetrics.totalParentSizeGB.toFixed(2)} GB
              </div>
            </div>
          </div>
        </div>

        {/* Method Usage Distribution */}
        <div className="chart-container">
          <h3>Operation Methods Distribution</h3>
          <div className="method-distribution">
            {metrics.operationMetrics.operationsByType.length === 0 ? (
              <p className="no-data">No operations recorded</p>
            ) : (
              metrics.operationMetrics.operationsByType.slice(0, 5).map((op) => {
                const totalOps = metrics.operationMetrics.totalOperations;
                const percentage = totalOps > 0 ? (op.count / totalOps) * 100 : 0;
                return (
                  <div key={op.type} className="method-item">
                    <div className="method-name">{op.type}</div>
                    <div className="method-bar">
                      <div
                        className="method-bar-fill"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="method-stats">
                      <span>{op.count} ops</span>
                      <span>{percentage.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Operation Success Rates */}
        <div className="chart-container">
          <h3>Operation Success Rates</h3>
          <div className="success-gauge">
            <div className="gauge-background">
              <div
                className="gauge-fill"
                style={{
                  width: `${metrics.overview.operationSuccessRatePercent}%`
                }}
              />
            </div>
            <div className="gauge-text">
              <div className="gauge-value">
                {metrics.overview.operationSuccessRatePercent.toFixed(1)}%
              </div>
              <div className="gauge-label">Success Rate</div>
            </div>
            <div className="success-stats">
              <div className="stat-row">
                <span className="stat-label">Successful:</span>
                <span className="stat-value">
                  {metrics.operationMetrics.successfulOperations}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Failed:</span>
                <span className="stat-value">
                  {metrics.operationMetrics.totalOperations -
                    metrics.operationMetrics.successfulOperations}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">Total:</span>
                <span className="stat-value">
                  {metrics.operationMetrics.totalOperations}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Clone Statistics */}
        <div className="chart-container">
          <h3>Clone Statistics</h3>
          <div className="clone-stats">
            <div className="stat-box">
              <div className="stat-title">Total Clones</div>
              <div className="stat-number">
                {metrics.cloneStatistics.totalClones}
              </div>
              <div className="stat-detail">clones created</div>
            </div>
            <div className="stat-box">
              <div className="stat-title">Successful</div>
              <div className="stat-number">
                {metrics.cloneStatistics.successfulClones}
              </div>
              <div className="stat-detail">
                {metrics.cloneStatistics.totalClones > 0
                  ? (
                      (metrics.cloneStatistics.successfulClones /
                        metrics.cloneStatistics.totalClones) *
                      100
                    ).toFixed(1) + '%'
                  : '0%'}
              </div>
            </div>
            <div className="stat-box">
              <div className="stat-title">Failed</div>
              <div className="stat-number">
                {metrics.cloneStatistics.failedClones}
              </div>
              <div className="stat-detail">
                {metrics.cloneStatistics.totalClones > 0
                  ? (
                      (metrics.cloneStatistics.failedClones /
                        metrics.cloneStatistics.totalClones) *
                      100
                    ).toFixed(1) + '%'
                  : '0%'}
              </div>
            </div>
          </div>
        </div>

        {/* Avg Creation Time */}
        <div className="chart-container">
          <h3>Clone Creation Performance</h3>
          <div className="performance-stats">
            <div className="perf-stat">
              <div className="perf-label">Average</div>
              <div className="perf-value">
                {formatSeconds(
                  metrics.cloneStatistics.averageCreationTimeSeconds
                )}
              </div>
            </div>
            <div className="perf-stat">
              <div className="perf-label">Minimum</div>
              <div className="perf-value">
                {formatSeconds(metrics.cloneStatistics.minCreationTimeSeconds)}
              </div>
            </div>
            <div className="perf-stat">
              <div className="perf-label">Maximum</div>
              <div className="perf-value">
                {formatSeconds(metrics.cloneStatistics.maxCreationTimeSeconds)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Storage Breakdown Table */}
      <div className="table-section">
        <h3>Storage Breakdown by Clone</h3>
        {metrics.storageMetrics.cloneStorageBreakdown.length === 0 ? (
          <p className="no-data">No clone storage data available</p>
        ) : (
          <div className="table-wrapper">
            <table className="storage-table">
              <thead>
                <tr>
                  <th>Clone Name</th>
                  <th>VHDX Size</th>
                  <th>Parent Size</th>
                  <th>Storage Saved</th>
                  <th>Compression</th>
                </tr>
              </thead>
              <tbody>
                {metrics.storageMetrics.cloneStorageBreakdown.map((clone) => (
                  <tr key={clone.cloneId}>
                    <td>{clone.cloneName}</td>
                    <td>{clone.vhdxSizeGB.toFixed(2)} GB</td>
                    <td>
                      {metrics.storageMetrics.cloneStorageBreakdown.find(
                        (c) => c.cloneId === clone.cloneId
                      )?.savingsGB || 0} GB
                    </td>
                    <td>{clone.savingsGB.toFixed(2)} GB</td>
                    <td>
                      {(
                        (clone.savingsGB /
                          (clone.vhdxSizeGB + clone.savingsGB || 1)) *
                        100
                      ).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
