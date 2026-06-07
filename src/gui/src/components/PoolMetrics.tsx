import React, { useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/PoolMetrics.css';

interface PoolData {
  pool: {
    size: number;
    available: number;
    idle: number;
    activeConnections: number;
    pending: number;
    totalCreated: number;
    totalDestroyed: number;
    errorCount: number;
    averageWaitTimeMs: number;
  };
  cache: {
    keys: number;
    hits: number;
    misses: number;
    ksize: number;
    vsize: number;
  };
  timestamp: string;
}

export const PoolMetrics: React.FC = () => {
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPoolMetrics();
    const interval = setInterval(loadPoolMetrics, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadPoolMetrics = async () => {
    try {
      setError(null);
      const response = await axios.get('/api/metrics/pool');
      if (response.data.success) {
        setPoolData(response.data.data);
      } else {
        setError(response.data.message || 'Failed to load pool metrics');
      }
    } catch (err: any) {
      setError(`Failed to load pool metrics: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="pool-loading">Loading pool metrics...</div>;
  if (error) return <div className="pool-error">Error: {error}</div>;
  if (!poolData) return <div className="pool-error">No pool data available</div>;

  const { pool, cache } = poolData;
  const utilization = pool.size > 0 ? ((pool.size - pool.available) / pool.size) * 100 : 0;
  const cacheHitRate = (cache.hits || 0) + (cache.misses || 0) > 0
    ? ((cache.hits || 0) / ((cache.hits || 0) + (cache.misses || 0))) * 100
    : 0;

  return (
    <div className="pool-metrics">
      <h2>Connection Pool Metrics</h2>

      <div className="pool-grid">
        {/* Pool Status */}
        <div className="pool-card">
          <h3>Pool Status</h3>
          <div className="pool-stat">
            <div className="stat-label">Total Connections</div>
            <div className="stat-value">{pool.size}</div>
          </div>
          <div className="pool-stat">
            <div className="stat-label">Available</div>
            <div className="stat-value" style={{ color: '#4CAF50' }}>{pool.available}</div>
          </div>
          <div className="pool-stat">
            <div className="stat-label">Active</div>
            <div className="stat-value" style={{ color: '#2196F3' }}>{pool.activeConnections}</div>
          </div>
          <div className="pool-stat">
            <div className="stat-label">Pending</div>
            <div className="stat-value" style={{ color: pool.pending > 0 ? '#FF9800' : '#4CAF50' }}>
              {pool.pending}
            </div>
          </div>
        </div>

        {/* Utilization */}
        <div className="pool-card">
          <h3>Pool Utilization</h3>
          <div className="utilization-gauge">
            <div className="gauge-circle">
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none" stroke="#e0e0e0" strokeWidth="8" />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke={utilization > 80 ? '#f44336' : utilization > 50 ? '#ff9800' : '#4caf50'}
                  strokeWidth="8"
                  strokeDasharray={`${(utilization / 100) * 314} 314`}
                  transform="rotate(-90 60 60)"
                />
                <text x="60" y="65" textAnchor="middle" fontSize="24" fontWeight="bold">
                  {utilization.toFixed(1)}%
                </text>
              </svg>
            </div>
            <div className="utilization-stats">
              <div className="stat-row">
                <span>Avg Wait Time:</span>
                <span className="value">{pool.averageWaitTimeMs.toFixed(2)}ms</span>
              </div>
              <div className="stat-row">
                <span>Total Created:</span>
                <span className="value">{pool.totalCreated}</span>
              </div>
              <div className="stat-row">
                <span>Total Destroyed:</span>
                <span className="value">{pool.totalDestroyed}</span>
              </div>
              <div className="stat-row">
                <span>Errors:</span>
                <span className="value" style={{ color: pool.errorCount > 0 ? '#f44336' : '#4caf50' }}>
                  {pool.errorCount}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Cache Performance */}
        <div className="pool-card cache-card">
          <h3>Cache Performance</h3>
          <div className="cache-gauge">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" fill="none" stroke="#e0e0e0" strokeWidth="8" />
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="#4CAF50"
                strokeWidth="8"
                strokeDasharray={`${(cacheHitRate / 100) * 314} 314`}
                transform="rotate(-90 60 60)"
              />
              <text x="60" y="65" textAnchor="middle" fontSize="24" fontWeight="bold">
                {cacheHitRate.toFixed(1)}%
              </text>
            </svg>
          </div>
          <div className="cache-stats">
            <div className="stat-row">
              <span>Cache Keys:</span>
              <span className="value">{cache.keys}</span>
            </div>
            <div className="stat-row">
              <span>Hits:</span>
              <span className="value" style={{ color: '#4CAF50' }}>{cache.hits}</span>
            </div>
            <div className="stat-row">
              <span>Misses:</span>
              <span className="value" style={{ color: '#f44336' }}>{cache.misses}</span>
            </div>
            <div className="stat-row">
              <span>Hit Rate:</span>
              <span className="value">{cacheHitRate.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="metrics-footer">
        <span className="timestamp">Last updated: {new Date(poolData.timestamp).toLocaleTimeString()}</span>
        <button onClick={loadPoolMetrics} className="btn-refresh">Refresh</button>
      </div>
    </div>
  );
};

export default PoolMetrics;
