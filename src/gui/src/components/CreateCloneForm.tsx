import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface GoldenImage {
  Id: string;
  Name: string;
  Version: string;
}

interface CreateCloneFormProps {
  onSuccess: () => void;
}

export const CreateCloneForm: React.FC<CreateCloneFormProps> = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    goldenImageId: '',
    cloneName: '',
    instancePath: 'LOCALHOST\\SQLEXPRESS',
    storagePath: 'C:\\FlashDB\\CloneStorage',
  });
  const [goldenImages, setGoldenImages] = useState<GoldenImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchGoldenImages();
  }, []);

  const fetchGoldenImages = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/golden-images');
      setGoldenImages(response.data.data || []);
    } catch (err) {
      console.error('Failed to fetch golden images', err);
    }
  };

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
      const response = await axios.post('http://localhost:3001/api/clones', formData);

      if (response.data.success) {
        setSuccess(true);
        setFormData({
          goldenImageId: '',
          cloneName: '',
          instancePath: 'LOCALHOST\\SQLEXPRESS',
          storagePath: 'C:\\FlashDB\\CloneStorage',
        });
        setTimeout(() => {
          setSuccess(false);
          onSuccess();
        }, 2000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create clone');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.form}>
      <h3>Create Clone</h3>

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.success}>✓ Clone created successfully!</div>}

      <form onSubmit={handleSubmit}>
        <div style={styles.formGroup}>
          <label>Select Golden Image *</label>
          <select
            name="goldenImageId"
            value={formData.goldenImageId}
            onChange={handleChange}
            required
          >
            <option value="">-- Choose a golden image --</option>
            {goldenImages.map(img => (
              <option key={img.Id} value={img.Id}>
                {img.Name} (v{img.Version})
              </option>
            ))}
          </select>
          {goldenImages.length === 0 && (
            <small style={{ color: '#999' }}>No golden images available. Create one first.</small>
          )}
        </div>

        <div style={styles.formGroup}>
          <label>Clone Name *</label>
          <input
            type="text"
            name="cloneName"
            value={formData.cloneName}
            onChange={handleChange}
            placeholder="e.g., TestDB-Clone-Dev1"
            required
          />
        </div>

        <div style={styles.formGroup}>
          <label>SQL Instance Path *</label>
          <input
            type="text"
            name="instancePath"
            value={formData.instancePath}
            onChange={handleChange}
            placeholder="LOCALHOST\\SQLEXPRESS"
            required
          />
        </div>

        <div style={styles.formGroup}>
          <label>Storage Path *</label>
          <input
            type="text"
            name="storagePath"
            value={formData.storagePath}
            onChange={handleChange}
            placeholder="C:\\FlashDB\\CloneStorage"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading || goldenImages.length === 0}
          style={{...styles.button, opacity: loading || goldenImages.length === 0 ? 0.5 : 1}}
        >
          {loading ? 'Creating...' : 'Create Clone'}
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
    backgroundColor: '#28a745',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
};
