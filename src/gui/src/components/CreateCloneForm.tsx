import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ConsoleIcon } from './ConsoleIcon';
import { waitForTaskCompletion } from '../utils/taskPolling';

const API_BASE = '/api';

interface GoldenImage {
  id: string;
  name: string;
  version: string;
  method?: string;
}

interface CreateCloneFormProps {
  onSuccess: () => void;
}

export const CreateCloneForm: React.FC<CreateCloneFormProps> = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    goldenImageId: '',
    cloneName: '',
    databaseType: 'sql-server',
    databaseName: 'TestDB_Clone',
    instancePath: 'sql-server',
    storagePath: '/app/data/clones',
    compressionEnabled: true,
    attachAfterCreate: false,
  });
  const [goldenImages, setGoldenImages] = useState<GoldenImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingImages, setLoadingImages] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchGoldenImages();
  }, []);

  const fetchGoldenImages = async () => {
    setLoadingImages(true);
    setError(null);
    try {
      const response = await axios.get(`${API_BASE}/golden-images`);
      const data = Array.isArray(response.data.data) ? response.data.data : [];
      const mapped = data
        .map((image: any) => ({
          id: image.id || image.Id || image.imageId || image.ImageId,
          name: image.name || image.Name,
          version: image.version || image.Version || 'Unknown',
          method: image.method || image.Method
        }))
        .filter((image: GoldenImage) => image.id && image.name);

      setGoldenImages(mapped);
      if (mapped.length === 0 && data.length > 0) {
        setError('Golden images found but failed to parse. Check browser console.');
      }
    } catch (err: any) {
      console.error('Failed to fetch golden images', err);
      setError(err.response?.data?.message || 'Failed to load golden images. Check server is running.');
    } finally {
      setLoadingImages(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    const checked = e.target instanceof HTMLInputElement ? e.target.checked : false;
    const type = e.target instanceof HTMLInputElement ? e.target.type : '';

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const resetForm = () => {
    setFormData({
      goldenImageId: '',
      cloneName: '',
      databaseType: 'sql-server',
      databaseName: 'TestDB_Clone',
      instancePath: 'sql-server',
      storagePath: '/app/data/clones',
      compressionEnabled: true,
      attachAfterCreate: false,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await axios.post(`${API_BASE}/clones`, formData);

      if (response.data.success) {
        setSuccess(true);
        setError(null);

        // Wait for queued task to complete if task ID is returned
        const taskId = response.data?.data?.taskId;
        if (response.status === 202 && taskId) {
          try {
            await waitForTaskCompletion(taskId);
          } catch (waitErr: any) {
            console.error('Clone creation task failed:', waitErr);
            setError(waitErr.message || 'Clone creation task failed');
            setSuccess(false);
            setLoading(false);
            return;
          }
        }

        resetForm();
        setTimeout(() => {
          setSuccess(false);
          onSuccess();
        }, 500);
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
      {success && <div style={styles.success}>Clone created successfully.</div>}

      <form onSubmit={handleSubmit}>
        <div style={styles.formGrid}>
          <div style={styles.formGroup}>
            <label>Select Golden Image *</label>
            {loadingImages ? (
              <div style={{ color: '#999', padding: '8px' }}>Loading golden images...</div>
            ) : (
              <>
                <select
                  name="goldenImageId"
                  value={formData.goldenImageId}
                  onChange={handleChange}
                  required
                  disabled={goldenImages.length === 0}
                >
                  <option value="">{goldenImages.length === 0 ? '-- No images available --' : '-- Choose a golden image --'}</option>
                  {goldenImages.map(img => (
                    <option key={img.id} value={img.id}>
                      {img.name} (v{img.version}{img.method ? `, ${img.method}` : ''})
                    </option>
                  ))}
                </select>
                {goldenImages.length === 0 && !error && (
                  <small style={{ color: '#999' }}>No golden images available. Create one first.</small>
                )}
              </>
            )}
          </div>

          <div style={styles.formGroup}>
            <label>Clone Name *</label>
            <input
              type="text"
              name="cloneName"
              value={formData.cloneName}
              onChange={handleChange}
              placeholder="TestDB-Clone-Dev1"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label>Database Type *</label>
            <select name="databaseType" value={formData.databaseType} onChange={handleChange}>
              <option value="sql-server">SQL Server</option>
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label>Clone Database Name</label>
            <input
              type="text"
              name="databaseName"
              value={formData.databaseName}
              onChange={handleChange}
              placeholder="TestDB_Clone"
            />
          </div>

          <div style={styles.formGroup}>
            <label>SQL Instance Path *</label>
            <input
              type="text"
              name="instancePath"
              value={formData.instancePath}
              onChange={handleChange}
              placeholder="sql-server"
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
              placeholder="/app/data/clones"
              required
            />
          </div>
        </div>

        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            name="compressionEnabled"
            checked={formData.compressionEnabled}
            onChange={handleChange}
          />
          Compression enabled
        </label>

        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            name="attachAfterCreate"
            checked={formData.attachAfterCreate}
            onChange={handleChange}
          />
          Attach after create
        </label>

        <button
          type="submit"
          disabled={loading || goldenImages.length === 0}
          style={{...styles.button, opacity: loading || goldenImages.length === 0 ? 0.5 : 1}}
        >
          {loading ? 'Creating...' : <><ConsoleIcon name="create" className="console-icon" /> Create Clone</>}
        </button>
      </form>
    </div>
  );
};

const styles = {
  form: {
    border: '1px solid rgba(148, 163, 184, 0.16)',
    borderRadius: '18px',
    padding: '20px',
    backgroundColor: 'rgba(16, 23, 32, 0.9)',
    marginBottom: '20px',
  },
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: '14px',
  },
  formGroup: {
    marginBottom: '15px',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
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
  button: {
    background: 'linear-gradient(135deg, #67e8f9, #22d3ee 55%, #14b8a6)',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '14px',
  },
};
