import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './OperationHistory.css';

const API_BASE = '/api';

interface TimelineOperation {
  id: string;
  cloneId: string;
  checkpointId: string;
  checkpointName: string;
  type: 'create' | 'restore' | 'delete' | string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | string;
  timestamp: string;
  completedAt?: string | null;
  message?: string | null;
  source?: string;
}

interface OperationHistoryProps {
  cloneId?: string;
  title?: string;
  searchable?: boolean;
}

export const OperationHistory: React.FC<OperationHistoryProps> = ({
  cloneId,
  title = 'Operation History',
  searchable = true
}) => {
  const [operations, setOperations] = useState<TimelineOperation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadHistory();
    const interval = setInterval(loadHistory, 10000);
    return () => clearInterval(interval);
  }, [cloneId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      setError(null);
      const cacheBust = Date.now();
      const endpoint = cloneId
        ? `${API_BASE}/operations/timeline/${cloneId}?_t=${cacheBust}`
        : `${API_BASE}/operations?limit=250&_t=${cacheBust}`;
      const response = await axios.get(endpoint);
      if (response.data.success) {
        setOperations(response.data.data || []);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load operation history');
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
  };

  const getDuration = (started: string, completed?: string | null) => {
    if (!completed) return 'In progress';
    const start = new Date(started).getTime();
    const end = new Date(completed).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return 'Unknown';
    const seconds = Math.max(0, Math.round((end - start) / 1000));
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'create':
        return '+';
      case 'restore':
        return 'R';
      case 'delete':
        return 'X';
      default:
        return '•';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'create':
        return 'Created';
      case 'restore':
        return 'Restored';
      case 'delete':
        return 'Deleted';
      default:
        return type || 'Unknown';
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'completed':
        return 'status-completed';
      case 'failed':
        return 'status-failed';
      case 'pending':
      case 'processing':
        return 'status-pending';
      default:
        return '';
    }
  };

  const uniqueTypes = Array.from(new Set(operations.map(op => op.type).filter(Boolean))).sort();
  const uniqueStatuses = Array.from(new Set(operations.map(op => op.status).filter(Boolean))).sort();
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOperations = operations.filter((op) => {
    const matchesQuery = !normalizedQuery || [
      op.id,
      op.cloneId,
      op.checkpointId,
      op.checkpointName,
      op.type,
      op.status,
      op.message,
      op.source
    ].some(value => String(value || '').toLowerCase().includes(normalizedQuery));

    return matchesQuery &&
      (typeFilter === 'all' || op.type === typeFilter) &&
      (statusFilter === 'all' || op.status === statusFilter);
  });

  if (loading && operations.length === 0) {
    return <div className="history-loading">Loading history...</div>;
  }

  if (error) {
    return (
      <div className="history-error">
        <p>{error}</p>
        <button onClick={loadHistory}>Retry</button>
      </div>
    );
  }

  if (operations.length === 0) {
    return (
      <div className="history-empty">
        <p>No operations recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="operation-history">
      <div className="history-header">
        <div>
          <h3>{title}</h3>
          <p>{filteredOperations.length} of {operations.length} operations</p>
        </div>
        <button className="refresh-btn" onClick={loadHistory} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {searchable && (
        <div className="history-controls">
          <input
            className="history-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search operation id, clone, checkpoint, status, or message"
          />
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All types</option>
            {uniqueTypes.map(type => (
              <option key={type} value={type}>{getTypeLabel(type)}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All statuses</option>
            {uniqueStatuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      )}

      <div className="timeline">
        {filteredOperations.length === 0 ? (
          <div className="history-empty compact">
            <p>No operations match the current search.</p>
          </div>
        ) : filteredOperations.map((op, index) => (
          <div key={op.id} className="timeline-item">
            <div className={`timeline-marker ${op.type} ${getStatusClass(op.status)}`}>
              <span className="marker-icon">{getTypeIcon(op.type)}</span>
            </div>

            <div className="timeline-content">
              <div className="operation-header">
                <h4>
                  <span className="checkpoint-name">{op.checkpointName || op.checkpointId || 'Clone operation'}</span>
                  <span className="operation-type">{getTypeLabel(op.type)}</span>
                </h4>
                <span className={`operation-status ${getStatusClass(op.status)}`}>
                  {op.status.charAt(0).toUpperCase() + op.status.slice(1)}
                </span>
              </div>

              <div className="operation-details">
                {!cloneId && (
                  <div className="detail-row">
                    <span className="label">Clone:</span>
                    <span className="value">{op.cloneId || 'Unknown'}</span>
                  </div>
                )}
                {op.checkpointId && (
                  <div className="detail-row">
                    <span className="label">Checkpoint:</span>
                    <span className="value">{op.checkpointId}</span>
                  </div>
                )}
                <div className="detail-row">
                  <span className="label">Started:</span>
                  <span className="value">{formatTime(op.timestamp)}</span>
                </div>

                {op.completedAt && (
                  <>
                    <div className="detail-row">
                      <span className="label">Completed:</span>
                      <span className="value">{formatTime(op.completedAt)}</span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Duration:</span>
                      <span className="value">{getDuration(op.timestamp, op.completedAt)}</span>
                    </div>
                  </>
                )}

                {op.message && (
                  <div className="detail-row">
                    <span className="label">Message:</span>
                    <span className="value message">{op.message}</span>
                  </div>
                )}
                {op.source && (
                  <div className="detail-row">
                    <span className="label">Source:</span>
                    <span className="value">{op.source}</span>
                  </div>
                )}
              </div>
            </div>

            {index < filteredOperations.length - 1 && <div className="timeline-connector" />}
          </div>
        ))}
      </div>

      <div className="history-footer">
        <small>Showing {filteredOperations.length} operations - Last updated: {new Date().toLocaleTimeString()}</small>
      </div>
    </div>
  );
};

export default OperationHistory;
