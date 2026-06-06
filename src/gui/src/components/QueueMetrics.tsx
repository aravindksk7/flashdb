import React, { useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/QueueMetrics.css';

interface QueueData {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  totalEnqueued: number;
  averageProcessingTimeMs: number;
  maxRetries: number;
  timestamp: string;
}

export const QueueMetrics: React.FC = () => {
  const [queueData, setQueueData] = useState<QueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadQueueMetrics();
    const interval = setInterval(loadQueueMetrics, 10000); // Update every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadQueueMetrics = async () => {
    try {
      setError(null);
      const response = await axios.get('/api/metrics/queue');
      if (response.data.success) {
        setQueueData(response.data.data);
      } else {
        setError(response.data.message || 'Failed to load queue metrics');
      }
    } catch (err: any) {
      setError(`Failed to load queue metrics: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="queue-loading">Loading queue metrics...</div>;
  if (error) return <div className="queue-error">Error: {error}</div>;
  if (!queueData) return <div className="queue-error">No queue data available</div>;

  const successRate = queueData.totalEnqueued > 0
    ? ((queueData.completed / queueData.totalEnqueued) * 100).toFixed(1)
    : '0.0';
  const failureRate = queueData.totalEnqueued > 0
    ? ((queueData.failed / queueData.totalEnqueued) * 100).toFixed(1)
    : '0.0';
  const totalProcessed = queueData.completed + queueData.failed;

  return (
    <div className="queue-metrics">
      <h2>Task Queue Metrics</h2>

      <div className="queue-grid">
        {/* Queue Status */}
        <div className="queue-card">
          <h3>Queue Status</h3>
          <div className="queue-status">
            <div className="status-item pending">
              <div className="status-value">{queueData.pending}</div>
              <div className="status-label">Pending</div>
            </div>
            <div className="status-item processing">
              <div className="status-value">{queueData.processing}</div>
              <div className="status-label">Processing</div>
            </div>
            <div className="status-item completed">
              <div className="status-value">{queueData.completed}</div>
              <div className="status-label">Completed</div>
            </div>
            <div className="status-item failed">
              <div className="status-value">{queueData.failed}</div>
              <div className="status-label">Failed</div>
            </div>
          </div>
        </div>

        {/* Queue Depth & Processing */}
        <div className="queue-card">
          <h3>Queue Depth</h3>
          <div className="depth-chart">
            <div className="depth-bar-container">
              <div className="depth-label">Queue Depth</div>
              <div className="depth-bar-background">
                <div
                  className="depth-bar-fill"
                  style={{
                    width: `${Math.min((queueData.pending / Math.max(queueData.pending + queueData.processing, 5)) * 100, 100)}%`
                  }}
                >
                  <span className="depth-text">{queueData.pending + queueData.processing}</span>
                </div>
              </div>
            </div>
            <div className="queue-stats">
              <div className="stat-row">
                <span>Avg Processing Time:</span>
                <span className="value">{queueData.averageProcessingTimeMs.toFixed(0)}ms</span>
              </div>
              <div className="stat-row">
                <span>Total Processed:</span>
                <span className="value">{totalProcessed}</span>
              </div>
              <div className="stat-row">
                <span>Total Enqueued:</span>
                <span className="value">{queueData.totalEnqueued}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Success Rate */}
        <div className="queue-card">
          <h3>Task Success Rate</h3>
          <div className="success-chart">
            <div className="success-gauge-background">
              <div className="success-gauge-section success" style={{ width: `${successRate}%` }}>
                {parseFloat(successRate) > 10 && <span>{successRate}%</span>}
              </div>
              <div className="success-gauge-section failure" style={{ width: `${failureRate}%` }}>
                {parseFloat(failureRate) > 10 && <span>{failureRate}%</span>}
              </div>
            </div>
            <div className="success-stats">
              <div className="stat-row">
                <span className="success-label">✓ Success Rate:</span>
                <span className="value">{successRate}%</span>
              </div>
              <div className="stat-row">
                <span className="failure-label">✗ Failure Rate:</span>
                <span className="value">{failureRate}%</span>
              </div>
              <div className="stat-row">
                <span>Max Retries:</span>
                <span className="value">{queueData.maxRetries}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="metrics-footer">
        <span className="timestamp">Last updated: {new Date(queueData.timestamp).toLocaleTimeString()}</span>
        <button onClick={loadQueueMetrics} className="btn-refresh">Refresh</button>
      </div>
    </div>
  );
};

export default QueueMetrics;
