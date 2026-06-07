import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { CreateCheckpointForm } from './CreateCheckpointForm';
import { ConsoleIcon } from './ConsoleIcon';
import { waitForTaskCompletion } from '../utils/taskPolling';

const API_BASE = '/api';

interface CloneSummary {
  id: string;
  name: string;
}

interface Checkpoint {
  id: string;
  cloneId: string;
  name: string;
  phase: string;
  description: string;
  createdAt: string;
  isFavorite: boolean;
  labels: string[];
  lastRestoredAt?: string;
}

interface CheckpointManagerProps {
  clone: CloneSummary;
  onChanged: () => void;
}

const firstValue = <T,>(value: any, keys: string[]): T | undefined => {
  for (const key of keys) {
    if (value?.[key] !== undefined && value?.[key] !== null) {
      return value[key] as T;
    }
  }
  return undefined;
};

const normalizeCheckpoint = (value: any): Checkpoint | null => {
  const id = firstValue<string>(value, ['id', 'Id', 'checkpointId', 'CheckpointId']);
  const name = firstValue<string>(value, ['name', 'Name', 'checkpointName', 'CheckpointName']);

  if (!id && !name) return null;

  const rawLabels = firstValue<any>(value, ['labels', 'Labels']);
  const labels = Array.isArray(rawLabels)
    ? rawLabels.map(label => String(label))
    : typeof rawLabels === 'string' && rawLabels.length > 0
      ? rawLabels.split(',').map(label => label.trim()).filter(Boolean)
      : [];

  return {
    id: id || name || 'unknown-restore-point',
    cloneId: firstValue<string>(value, ['cloneId', 'CloneId']) || '',
    name: name || id || 'Unnamed restore point',
    phase: firstValue<string>(value, ['phase', 'Phase']) || 'manual',
    description: firstValue<string>(value, ['description', 'Description']) || '',
    createdAt: firstValue<string>(value, ['createdAt', 'CreatedAt']) || '',
    isFavorite: Boolean(firstValue<boolean>(value, ['isFavorite', 'IsFavorite'])),
    labels,
    lastRestoredAt: firstValue<string>(value, ['lastRestoredAt', 'LastRestoredAt'])
  };
};

const formatDate = (dateString?: string | null) => {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
};

export const CheckpointManager: React.FC<CheckpointManagerProps> = ({ clone, onChanged }) => {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCheckpoints = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${API_BASE}/clones/${clone.id}/checkpoints`, {
        params: { _t: Date.now() }
      });
      const data = Array.isArray(response.data.data) ? response.data.data : [];
      const normalized = data
        .map(normalizeCheckpoint)
        .filter((item): item is Checkpoint => item !== null);
      setCheckpoints(normalized);
      setLabelDrafts(Object.fromEntries(
        normalized.map(checkpoint => [checkpoint.id, checkpoint.labels.join(', ')])
      ));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load restore points');
    } finally {
      setLoading(false);
    }
  }, [clone.id]);

  useEffect(() => {
    loadCheckpoints();
  }, [loadCheckpoints]);

  const refreshAll = async () => {
    await loadCheckpoints();
    onChanged();
  };

  const showMessage = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(null), 1800);
  };

  const toggleFavorite = async (checkpoint: Checkpoint) => {
    try {
      await axios.patch(`${API_BASE}/clones/${clone.id}/checkpoints/${checkpoint.id}`, {
        isFavorite: !checkpoint.isFavorite
      });
      await refreshAll();
      showMessage(checkpoint.isFavorite ? 'Restore point unpinned.' : 'Restore point pinned.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update pin');
    }
  };

  const saveLabels = async (checkpoint: Checkpoint) => {
    const labels = (labelDrafts[checkpoint.id] || '')
      .split(',')
      .map(label => label.trim())
      .filter(Boolean);

    try {
      await axios.patch(`${API_BASE}/clones/${clone.id}/checkpoints/${checkpoint.id}`, {
        labels
      });
      await refreshAll();
      showMessage('Labels saved.');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to save labels');
    }
  };

  const restoreCheckpoint = async (checkpoint: Checkpoint) => {
    if (!window.confirm(`Restore clone "${clone.name}" to "${checkpoint.name}"?`)) return;

    try {
      setMessage('Restore queued. Waiting for completion...');
      const response = await axios.post(`${API_BASE}/clones/${clone.id}/checkpoints/${checkpoint.id}/restore`, {
        reattachAfter: true
      });
      const taskId = response.data?.data?.taskId;
      if (response.status === 202 && taskId) {
        await waitForTaskCompletion(taskId);
      }
      await refreshAll();
      showMessage('Restore completed.');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to restore point');
    }
  };

  const deleteCheckpoint = async (checkpoint: Checkpoint) => {
    if (!window.confirm(`Delete restore point "${checkpoint.name}"?`)) return;

    try {
      setMessage('Delete queued. Waiting for completion...');
      const response = await axios.delete(`${API_BASE}/clones/${clone.id}/checkpoints/${checkpoint.id}`);
      const taskId = response.data?.data?.taskId;
      if (response.status === 202 && taskId) {
        await waitForTaskCompletion(taskId);
      }
      await refreshAll();
      showMessage('Restore point deleted.');
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to delete restore point');
    }
  };

  return (
    <div>
      <CreateCheckpointForm cloneId={clone.id} cloneName={clone.name} onSuccess={refreshAll} />

      {error && <div style={styles.error}>{error}</div>}
      {message && <div style={styles.success}>{message}</div>}

      <div style={styles.headerRow}>
        <div>
          <h3>Restore Points</h3>
          <p style={styles.meta}>Pin, relabel, restore, or delete checkpoints from the selected clone.</p>
        </div>
        <button type="button" onClick={loadCheckpoints} style={styles.secondaryButton}>
          <ConsoleIcon name="refresh" className="console-icon" />
          Refresh
        </button>
      </div>

      {loading ? (
        <div style={styles.loadingState}>
          <div style={styles.skeletonRow} />
          <div style={styles.skeletonRow} />
          <div style={styles.skeletonRow} />
        </div>
      ) : checkpoints.length === 0 ? (
        <div style={styles.emptyState}>
          <ConsoleIcon name="restore" className="console-icon" />
          <p>No restore points found</p>
        </div>
      ) : (
        <div style={styles.list}>
          {checkpoints.map(checkpoint => (
            <div key={checkpoint.id} style={styles.item}>
              <div style={styles.itemMain}>
                <div style={styles.itemTitleRow}>
                  <h4 style={styles.itemTitle}>
                    {checkpoint.isFavorite ? 'Pinned - ' : ''}{checkpoint.name}
                  </h4>
                  <span style={styles.phase}>{checkpoint.phase}</span>
                </div>
                <p style={styles.meta}>Created: {formatDate(checkpoint.createdAt)}</p>
                {checkpoint.lastRestoredAt && (
                  <p style={styles.meta}>Last restored: {formatDate(checkpoint.lastRestoredAt)}</p>
                )}
                {checkpoint.description && <p style={styles.description}>{checkpoint.description}</p>}
                <div style={styles.labelsRow}>
                  <input
                    type="text"
                    value={labelDrafts[checkpoint.id] || ''}
                    onChange={(event) => setLabelDrafts(prev => ({
                      ...prev,
                      [checkpoint.id]: event.target.value
                    }))}
                    placeholder="Labels, comma separated"
                    style={styles.labelInput}
                  />
                  <button type="button" onClick={() => saveLabels(checkpoint)} style={styles.secondaryButton}>
                    <ConsoleIcon name="edit" className="console-icon" />
                    Save Labels
                  </button>
                </div>
              </div>
              <div style={styles.actions}>
                <button type="button" onClick={() => toggleFavorite(checkpoint)} style={styles.secondaryButton}>
                  {checkpoint.isFavorite ? 'Unpin' : 'Pin'}
                </button>
                <button type="button" onClick={() => restoreCheckpoint(checkpoint)} style={styles.restoreButton}>
                  <ConsoleIcon name="restore" className="console-icon" />
                  Restore
                </button>
                <button type="button" onClick={() => deleteCheckpoint(checkpoint)} style={styles.dangerButton}>
                  <ConsoleIcon name="delete" className="console-icon" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const styles = {
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    marginBottom: '12px',
  },
  meta: {
    color: 'var(--text-soft)',
    marginTop: '4px',
    fontSize: '13px',
  },
  list: {
    display: 'grid',
    gap: '12px',
  },
  item: {
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '16px',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    borderRadius: '18px',
    padding: '16px',
    backgroundColor: 'rgba(15, 23, 34, 0.88)',
  },
  itemMain: {
    minWidth: 0,
  },
  itemTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  itemTitle: {
    margin: 0,
    color: 'var(--text)',
  },
  phase: {
    fontSize: '12px',
    padding: '2px 8px',
    borderRadius: '999px',
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    color: '#cffafe',
  },
  description: {
    margin: '8px 0',
  },
  labelsRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '10px',
  },
  labelInput: {
    flex: 1,
    minWidth: '180px',
    padding: '8px',
    border: '1px solid rgba(148, 163, 184, 0.18)',
    borderRadius: '10px',
    backgroundColor: 'rgba(8, 12, 18, 0.85)',
    color: 'var(--text)',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: '110px',
  },
  secondaryButton: {
    backgroundColor: 'rgba(30, 41, 59, 0.92)',
    color: '#fff',
    padding: '8px 12px',
    fontSize: '14px',
    borderRadius: '10px',
  },
  restoreButton: {
    background: 'linear-gradient(135deg, #67e8f9, #22d3ee)',
    color: '#fff',
    padding: '8px 12px',
    fontSize: '14px',
    borderRadius: '10px',
  },
  dangerButton: {
    background: 'linear-gradient(135deg, #f97316, #ef4444)',
    color: '#fff',
    padding: '8px 12px',
    fontSize: '14px',
    borderRadius: '10px',
  },
  error: {
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    color: '#fecaca',
    padding: '10px',
    borderRadius: '10px',
    marginBottom: '15px',
  },
  success: {
    backgroundColor: 'rgba(52, 211, 153, 0.12)',
    color: '#bbf7d0',
    padding: '10px',
    borderRadius: '10px',
    marginBottom: '15px',
  },
  loadingState: {
    display: 'grid',
    gap: '10px',
  },
  skeletonRow: {
    height: '56px',
    borderRadius: '14px',
    background: 'linear-gradient(90deg, rgba(30,41,59,0.85), rgba(51,65,85,0.95), rgba(30,41,59,0.85))',
  },
  emptyState: {
    display: 'grid',
    placeItems: 'center',
    gap: '10px',
    minHeight: '120px',
    border: '1px dashed rgba(148, 163, 184, 0.2)',
    borderRadius: '16px',
    backgroundColor: 'rgba(8, 12, 18, 0.55)',
    color: 'var(--text-soft)',
  },
};
