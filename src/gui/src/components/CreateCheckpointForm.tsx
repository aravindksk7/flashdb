import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface Clone {
  Id: string;
  Name: string;
}

interface CreateCheckpointFormProps {
  onSuccess: () => void;
}

export const CreateCheckpointForm: React.FC<CreateCheckpointFormProps> = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    cloneId: '',
    checkpointName: '',
    phase: 'manual',
    description: '',
  });
  const [clones, setClones] = useState<Clone[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchClones();
  }, []);

  const fetchClones = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/clones');
      setClones(response.data.data || []);
    } catch (err) {
      console.error('Failed to fetch clones', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await axios.post(
        `http://localhost:3001/api/clones/${formData.cloneId}/checkpoints`,
        {
          checkpointName: formData.checkpointName,
          phase: formData.phase,
          description: formData.description,
        }
      );

      if (response.data.success) {
        setSuccess(true);
        setFormData({
          cloneId: '',
          checkpointName: '',
          phase: 'manual',
          description: '',
        });
        setTimeout(() => {
          setSuccess(false);
          onSuccess();
        }, 2000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create checkpoint');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.form}>
      <h3>Create Checkpoint</h3>

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>✓ Checkpoint created successfully!</div>}

      <form onSubmit={handleSubmit}>
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
              <option key={clone.Id} value={clone.Id}>
                {clone.Name}
              </option>
            ))}
          </select>
          {clones.length === 0 && (
            <small style={{ color: '#999' }}>No clones available. Create one first.</small>
          )}
        </div>

        <div style={styles.formGroup}>
          <label>Checkpoint Name *</label>
          <input
            type="text"
            name="checkpointName"
            value={formData.checkpointName}
            onChange={handleChange}
            placeholder="e.g., Pre-ETL Baseline"
            required
          />
        </div>

        <div style={styles.formGroup}>
          <label>Phase *</label>
          <select name="phase" value={formData.phase} onChange={handleChange}>
            <option value="manual">Manual (User-triggered)</option>
            <option value="pre-etl">Pre-ETL (Before data load)</option>
            <option value="post-etl">Post-ETL (After data load)</option>
          </select>
        </div>

        <div style={styles.formGroup}>
          <label>Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Optional notes about this checkpoint..."
            rows={3}
          />
        </div>

        <button
          type="submit"
          disabled={loading || clones.length === 0}
          style={{...styles.button, opacity: loading || clones.length === 0 ? 0.5 : 1}}
        >
          {loading ? 'Creating...' : 'Create Checkpoint'}
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
  formGroup: {
    marginBottom: '15px',
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
    color: '#3c3',
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
