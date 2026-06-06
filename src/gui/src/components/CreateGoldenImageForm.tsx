import React, { useState } from 'react';
import axios from 'axios';

interface CreateGoldenImageFormProps {
  onSuccess: () => void;
}

export const CreateGoldenImageForm: React.FC<CreateGoldenImageFormProps> = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    version: '',
    method: 'TABLE_BY_TABLE',
    outputPath: 'C:\\FlashDB\\GoldenImages',
    sourceConnection: 'localhost',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
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
      const response = await axios.post('http://localhost:3001/api/golden-images', formData);

      if (response.data.success) {
        setSuccess(true);
        setFormData({
          name: '',
          version: '',
          method: 'TABLE_BY_TABLE',
          outputPath: 'C:\\FlashDB\\GoldenImages',
          sourceConnection: 'localhost',
        });
        setTimeout(() => {
          setSuccess(false);
          onSuccess();
        }, 2000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create golden image');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.form}>
      <h3>Create Golden Image</h3>

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>✓ Golden image created successfully!</div>}

      <form onSubmit={handleSubmit}>
        <div style={styles.formGroup}>
          <label>Image Name *</label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., TestDB-Golden"
            required
          />
        </div>

        <div style={styles.formGroup}>
          <label>Version *</label>
          <input
            type="text"
            name="version"
            value={formData.version}
            onChange={handleChange}
            placeholder="e.g., 1.0.0"
            required
          />
        </div>

        <div style={styles.formGroup}>
          <label>Method *</label>
          <select name="method" value={formData.method} onChange={handleChange}>
            <option value="BACKUP_RESTORE">BACKUP/RESTORE (Fast, Full Copy)</option>
            <option value="REPLICA_BACKUP">Replica Backup (Mirror)</option>
            <option value="TABLE_BY_TABLE">Table by Table (Read-Only)</option>
          </select>
        </div>

        <div style={styles.formGroup}>
          <label>Output Path *</label>
          <input
            type="text"
            name="outputPath"
            value={formData.outputPath}
            onChange={handleChange}
            placeholder="C:\\FlashDB\\GoldenImages"
            required
          />
        </div>

        <div style={styles.formGroup}>
          <label>Source Connection</label>
          <input
            type="text"
            name="sourceConnection"
            value={formData.sourceConnection}
            onChange={handleChange}
            placeholder="localhost or connection string"
          />
        </div>

        <button type="submit" disabled={loading} style={styles.button}>
          {loading ? 'Creating...' : 'Create Golden Image'}
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
    backgroundColor: '#007bff',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
};
