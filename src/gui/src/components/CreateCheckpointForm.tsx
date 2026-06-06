import React, { useEffect, useState } from 'react';
import axios from 'axios';

const API_BASE = '/api';

interface Clone {
  id: string;
  name: string;
}

interface CreateCheckpointFormProps {
  cloneId?: string;
  cloneName?: string;
  onSuccess: () => void;
}

export const CreateCheckpointForm: React.FC<CreateCheckpointFormProps> = ({
  cloneId,
  cloneName,
  onSuccess
}) => {
  const [formData, setFormData] = useState({
    cloneId: cloneId || '',
    checkpointName: '',
    phase: 'manual',
    description: '',
    force: false,
  });
  const [clones, setClones] = useState<Clone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (cloneId) {
      setFormData(prev => ({ ...prev, cloneId }));
      return;
    }

    fetchClones();
  }, [cloneId]);

  const fetchClones = async () => {
    try {
      const response = await axios.get(`${API_BASE}/clones`);
      const data = Array.isArray(response.data.data) ? response.data.data : [];
      setClones(data
        .map((clone: any) => ({
          id: clone.id || clone.Id || clone.cloneId || clone.CloneId,
          name: clone.name || clone.Name || clone.cloneName || clone.CloneName
        }))
        .filter((clone: Clone) => clone.id || clone.name));
    } catch (err) {
      console.error('Failed to fetch clones', err);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    const checked = e.target instanceof HTMLInputElement ? e.target.checked : false;
    const type = e.target instanceof HTMLInputElement ? e.target.type : '';

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await axios.post(
        `${API_BASE}/clones/${formData.cloneId}/checkpoints`,
        {
          checkpointName: formData.checkpointName,
          phase: formData.phase,
          description: formData.description,
          force: formData.force,
        }
      );

      if (response.data.success) {
        setSuccess(true);
        setFormData({
          cloneId: cloneId || '',
          checkpointName: '',
          phase: 'manual',
          description: '',
          force: false,
        });
        setTimeout(() => {
          setSuccess(false);
          onSuccess();
        }, 1000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create restore point');
    } finally {
      setLoading(false);
    }
  };

  const noCloneAvailable = cloneId ? false : clones.length === 0;

  return (
    <div style={styles.form}>
      <h3>Create Restore Point</h3>

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>Restore point created successfully.</div>}

      <form onSubmit={handleSubmit}>
        {cloneId ? (
          <div style={styles.formGroup}>
            <label>Clone</label>
            <input type="text" value={cloneName || cloneId} readOnly />
          </div>
        ) : (
          <div style={styles.formGroup}>
            <label>Select Clone *</label>
            <select
              name="cloneId"
              value={formData.cloneId}
              onChange={handleChange}
              required
            >
              <option value="">-- Choose a clone --</option>
              {clones.map(clone => (
                <option key={clone.id || clone.name} value={clone.id}>
                  {clone.name || clone.id}
                </option>
              ))}
            </select>
            {clones.length === 0 && (
              <small style={{ color: '#999' }}>No clones available. Create one first.</small>
            )}
          </div>
        )}

        <div style={styles.formGrid}>
          <div style={styles.formGroup}>
            <label>Restore Point Name *</label>
            <input
              type="text"
              name="checkpointName"
              value={formData.checkpointName}
              onChange={handleChange}
              placeholder="Pre-ETL Baseline"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label>Phase *</label>
            <select name="phase" value={formData.phase} onChange={handleChange}>
              <option value="manual">Manual</option>
              <option value="pre-etl">Pre-ETL</option>
              <option value="post-etl">Post-ETL</option>
              <option value="complete">Complete</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        <div style={styles.formGroup}>
          <label>Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Optional notes about this restore point"
            rows={3}
            style={styles.textarea}
          />
        </div>

        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            name="force"
            checked={formData.force}
            onChange={handleChange}
          />
          Force create
        </label>

        <button
          type="submit"
          disabled={loading || noCloneAvailable}
          style={{...styles.button, opacity: loading || noCloneAvailable ? 0.5 : 1}}
        >
          {loading ? 'Creating...' : 'Create Restore Point'}
        </button>
      </form>
    </div>
  );
};

const styles = {
  form: {
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '20px',
    backgroundColor: '#f9f9f9',
    marginBottom: '20px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '14px',
  },
  formGroup: {
    marginBottom: '15px',
  },
  textarea: {
    width: '100%',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontFamily: 'inherit',
    fontSize: '14px',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  error: {
    backgroundColor: '#fee',
    color: '#c33',
    padding: '10px',
    borderRadius: '4px',
    marginBottom: '15px',
  },
  success: {
    backgroundColor: '#efe',
    color: '#166534',
    padding: '10px',
    borderRadius: '4px',
    marginBottom: '15px',
  },
  button: {
    backgroundColor: '#ffc107',
    color: '#333',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
};
