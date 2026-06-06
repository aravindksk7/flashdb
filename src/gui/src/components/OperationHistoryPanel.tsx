import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = '/api';

interface Operation {
  operationId: string;
  type: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed' | 'rolled-back';
  createdAt: string;
  completedAt?: string;
  duration?: number;
}

interface OperationHistoryPanelProps {
  checkpointId: string;
  limit?: number;
}

const getStatusColor = (status: string) => {
  const colors: { [key: string]: string } = {
    pending: '#f3a461',
    'in-progress': '#1890ff',
    completed: '#52c41a',
    failed: '#f5222d',
    'rolled-back': '#ff7a45'
  };
  return colors[status] || '#666';
};

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
};

export const OperationHistoryPanel: React.FC<OperationHistoryPanelProps> = ({
  checkpointId,
  limit = 10
}) => {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOperationHistory();
  }, [checkpointId]);

  const fetchOperationHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(
        `${API_BASE}/operations?checkpointId=${checkpointId}&limit=${limit}`
      );

      if (response.data.success) {
        const ops = (response.data.data || []).map((op: any) => ({
          operationId: op.operationId || op.operation_id,
          type: op.operationType || op.operation_type || 'unknown',
          status: op.status || 'pending',
          createdAt: op.createdAt || op.created_at,
          completedAt: op.completedAt || op.completed_at,
          duration: op.duration
        }));

        setOperations(ops);
      }
    } catch (err: any) {
      console.error('Failed to fetch operation history:', err);
      setError(err.message || 'Failed to load operation history');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#999' }}>
        Loading operation history...
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '16px',
          backgroundColor: '#fff1f0',
          border: '1px solid #ffccc7',
          borderRadius: '4px',
          color: '#f5222d'
        }}
      >
        Error: {error}
      </div>
    );
  }

  if (operations.length === 0) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#999' }}>
        No operations found for this checkpoint
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid #e8e8e8',
        borderRadius: '8px',
        overflow: 'hidden'
      }}
    >
      <div style={{ backgroundColor: '#fafafa', padding: '12px 16px', borderBottom: '1px solid #e8e8e8' }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
          Operation History
        </h3>
      </div>

      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '14px'
        }}
      >
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #e8e8e8' }}>
            <th
              style={{
                padding: '12px',
                textAlign: 'left',
                fontWeight: 600,
                color: '#666',
                borderRight: '1px solid #e8e8e8'
              }}
            >
              Operation ID
            </th>
            <th
              style={{
                padding: '12px',
                textAlign: 'left',
                fontWeight: 600,
                color: '#666',
                borderRight: '1px solid #e8e8e8'
              }}
            >
              Type
            </th>
            <th
              style={{
                padding: '12px',
                textAlign: 'left',
                fontWeight: 600,
                color: '#666',
                borderRight: '1px solid #e8e8e8'
              }}
            >
              Status
            </th>
            <th
              style={{
                padding: '12px',
                textAlign: 'left',
                fontWeight: 600,
                color: '#666',
                borderRight: '1px solid #e8e8e8'
              }}
            >
              Created
            </th>
            <th
              style={{
                padding: '12px',
                textAlign: 'left',
                fontWeight: 600,
                color: '#666',
                borderRight: '1px solid #e8e8e8'
              }}
            >
              Completed
            </th>
            <th
              style={{
                padding: '12px',
                textAlign: 'left',
                fontWeight: 600,
                color: '#666'
              }}
            >
              Duration
            </th>
          </tr>
        </thead>
        <tbody>
          {operations.map((op, idx) => (
            <tr
              key={op.operationId}
              style={{
                borderBottom: idx < operations.length - 1 ? '1px solid #e8e8e8' : 'none',
                backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa'
              }}
            >
              <td
                style={{
                  padding: '12px',
                  borderRight: '1px solid #e8e8e8',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  maxWidth: '180px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
                title={op.operationId}
              >
                {op.operationId.substring(0, 8)}...
              </td>
              <td style={{ padding: '12px', borderRight: '1px solid #e8e8e8', textTransform: 'capitalize' }}>
                {op.type}
              </td>
              <td style={{ padding: '12px', borderRight: '1px solid #e8e8e8' }}>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '4px 8px',
                    backgroundColor: `${getStatusColor(op.status)}20`,
                    color: getStatusColor(op.status),
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 500,
                    textTransform: 'capitalize'
                  }}
                >
                  {op.status}
                </span>
              </td>
              <td
                style={{
                  padding: '12px',
                  borderRight: '1px solid #e8e8e8',
                  fontSize: '12px',
                  color: '#666'
                }}
              >
                {op.createdAt ? new Date(op.createdAt).toLocaleString() : 'N/A'}
              </td>
              <td
                style={{
                  padding: '12px',
                  borderRight: '1px solid #e8e8e8',
                  fontSize: '12px',
                  color: '#666'
                }}
              >
                {op.completedAt ? new Date(op.completedAt).toLocaleString() : '-'}
              </td>
              <td style={{ padding: '12px', fontSize: '12px', color: '#666' }}>
                {op.duration ? formatDuration(op.duration) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          padding: '12px 16px',
          backgroundColor: '#fafafa',
          borderTop: '1px solid #e8e8e8',
          fontSize: '12px',
          color: '#666'
        }}
      >
        Showing {operations.length} of {limit} recent operations
      </div>
    </div>
  );
};

export default OperationHistoryPanel;
