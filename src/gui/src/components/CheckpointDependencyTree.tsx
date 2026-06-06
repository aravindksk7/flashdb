import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = '/api';

interface Checkpoint {
  id: string;
  name: string;
  createdAt: string;
}

interface CheckpointDependencyTreeProps {
  checkpointId: string;
  cloneId?: string;
}

export const CheckpointDependencyTree: React.FC<CheckpointDependencyTreeProps> = ({
  checkpointId,
  cloneId
}) => {
  const [parentCheckpoint, setParentCheckpoint] = useState<Checkpoint | null>(null);
  const [childCheckpoints, setChildCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDependencies();
  }, [checkpointId, cloneId]);

  const fetchDependencies = async () => {
    setLoading(true);
    setError(null);

    try {
      // Try to fetch checkpoint details and related info
      if (cloneId) {
        // Fetch checkpoints for the clone
        const response = await axios.get(`${API_BASE}/clones/${cloneId}/checkpoints`);

        if (response.data.success && Array.isArray(response.data.data)) {
          const checkpoints = response.data.data;
          const current = checkpoints.find((cp: any) => cp.id === checkpointId || cp.checkpointId === checkpointId);

          // Find parent (if this is a differencing checkpoint)
          const idx = checkpoints.findIndex((cp: any) => cp.id === checkpointId || cp.checkpointId === checkpointId);
          if (idx > 0) {
            const parent = checkpoints[idx - 1];
            setParentCheckpoint({
              id: parent.id || parent.checkpointId,
              name: parent.name || parent.Name,
              createdAt: parent.createdAt || parent.CreatedAt
            });
          }

          // Find children (checkpoints created after this one)
          if (idx >= 0) {
            const children = checkpoints.slice(idx + 1).map((cp: any) => ({
              id: cp.id || cp.checkpointId,
              name: cp.name || cp.Name,
              createdAt: cp.createdAt || cp.CreatedAt
            }));
            setChildCheckpoints(children);
          }
        }
      }
    } catch (err: any) {
      console.error('Failed to fetch dependencies:', err);
      setError(err.message || 'Failed to load dependency information');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: '#999' }}>
        Loading checkpoint dependencies...
      </div>
    );
  }

  return (
    <div
      style={{
        border: '1px solid #e8e8e8',
        borderRadius: '8px',
        padding: '16px',
        backgroundColor: '#fafafa'
      }}
    >
      <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600 }}>
        Checkpoint Dependency Tree
      </h3>

      {error && (
        <div
          style={{
            padding: '12px',
            backgroundColor: '#fff1f0',
            border: '1px solid #ffccc7',
            borderRadius: '4px',
            color: '#f5222d',
            marginBottom: '16px'
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Parent Checkpoint */}
        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#666', marginBottom: '8px' }}>
            PARENT CHECKPOINT
          </div>
          {parentCheckpoint ? (
            <div
              style={{
                padding: '12px',
                backgroundColor: '#e6f7ff',
                border: '2px solid #1890ff',
                borderRadius: '4px'
              }}
            >
              <div style={{ fontWeight: 500, color: '#0050b3' }}>{parentCheckpoint.name}</div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                ID: {parentCheckpoint.id}
              </div>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                Created: {new Date(parentCheckpoint.createdAt).toLocaleString()}
              </div>
            </div>
          ) : (
            <div style={{ padding: '12px', backgroundColor: '#fff', borderRadius: '4px', color: '#999' }}>
              This is the root checkpoint (no parent)
            </div>
          )}
        </div>

        {/* Current Checkpoint */}
        <div
          style={{
            textAlign: 'center',
            fontSize: '20px',
            color: '#1890ff',
            fontWeight: 'bold'
          }}
        >
          ↓
        </div>

        <div>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#666', marginBottom: '8px' }}>
            CURRENT CHECKPOINT
          </div>
          <div
            style={{
              padding: '12px',
              backgroundColor: '#f0f5ff',
              border: '2px solid #1890ff',
              borderRadius: '4px'
            }}
          >
            <div style={{ fontWeight: 500, color: '#1890ff' }}>{checkpointId}</div>
          </div>
        </div>

        {/* Child Checkpoints */}
        {childCheckpoints.length > 0 && (
          <>
            <div
              style={{
                textAlign: 'center',
                fontSize: '20px',
                color: '#fa8c16',
                fontWeight: 'bold'
              }}
            >
              ↓
            </div>

            <div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#666',
                  marginBottom: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>CHILD CHECKPOINTS</span>
                <span
                  style={{
                    backgroundColor: '#fa8c16',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '11px'
                  }}
                >
                  {childCheckpoints.length}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {childCheckpoints.map((cp, idx) => (
                  <div
                    key={cp.id}
                    style={{
                      padding: '12px',
                      backgroundColor: '#fffbe6',
                      border: '1px solid #ffe58f',
                      borderRadius: '4px',
                      marginLeft: '16px',
                      borderLeft: '3px solid #fa8c16'
                    }}
                  >
                    <div style={{ fontWeight: 500 }}>{cp.name}</div>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      ID: {cp.id}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                      Created: {new Date(cp.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  marginTop: '12px',
                  padding: '12px',
                  backgroundColor: '#fff7e6',
                  border: '1px solid #ffe58f',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#fa8c16'
                }}
              >
                <strong>Warning:</strong> {childCheckpoints.length} child checkpoint(s) depend on this checkpoint. Deleting this checkpoint may affect child checkpoints.
              </div>
            </div>
          </>
        )}

        {childCheckpoints.length === 0 && (
          <div style={{ padding: '12px', backgroundColor: '#fff', borderRadius: '4px', color: '#999' }}>
            No child checkpoints. This checkpoint has no dependents.
          </div>
        )}
      </div>
    </div>
  );
};

export default CheckpointDependencyTree;
