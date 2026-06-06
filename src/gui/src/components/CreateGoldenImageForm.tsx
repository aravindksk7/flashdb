import React, { useState } from 'react';
import axios from 'axios';

const API_BASE = '/api';
const DEFAULT_SOURCE_CONNECTION = 'Server=sql-server;Database=TestDB;User Id=sa;Password=FlashDB@Password123;TrustServerCertificate=Yes';

interface CreateGoldenImageFormProps {
  onSuccess: () => void;
}

export const CreateGoldenImageForm: React.FC<CreateGoldenImageFormProps> = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    version: '',
    method: 'TableByTableCopy',
    databaseType: 'sql-server',
    databaseName: 'TestDB',
    sourceDatabase: 'TestDB',
    driver: 'System.Data.SqlClient',
    authenticationMode: 'SqlPassword',
    outputPath: '/app/data/golden-images',
    backupFile: '',
    sourceConnection: DEFAULT_SOURCE_CONNECTION,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      version: '',
      method: 'TableByTableCopy',
      databaseType: 'sql-server',
      databaseName: 'TestDB',
      sourceDatabase: 'TestDB',
      driver: 'System.Data.SqlClient',
      authenticationMode: 'SqlPassword',
      outputPath: '/app/data/golden-images',
      backupFile: '',
      sourceConnection: DEFAULT_SOURCE_CONNECTION,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await axios.post(`${API_BASE}/golden-images`, formData);

      if (response.data.success) {
        setSuccess(true);
        resetForm();
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
      {success && <div style={styles.success}>Golden image created successfully.</div>}

      <form onSubmit={handleSubmit}>
        <div style={styles.formGrid}>
          <div style={styles.formGroup}>
            <label>Image Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="TestDB-Golden"
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
              placeholder="1.0.0"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label>Method *</label>
            <select name="method" value={formData.method} onChange={handleChange}>
              <option value="TableByTableCopy">Table by Table Copy</option>
              <option value="BackupRestore">Backup Restore</option>
              <option value="ReplicaBackup">Replica Backup</option>
            </select>
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
            <label>Driver *</label>
            <select name="driver" value={formData.driver} onChange={handleChange}>
              <option value="System.Data.SqlClient">System.Data.SqlClient</option>
              <option value="Microsoft.Data.SqlClient">Microsoft.Data.SqlClient</option>
              <option value="ODBC Driver 18 for SQL Server">ODBC Driver 18 for SQL Server</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label>Authentication *</label>
            <select
              name="authenticationMode"
              value={formData.authenticationMode}
              onChange={handleChange}
            >
              <option value="SqlPassword">SQL Password</option>
              <option value="Integrated">Integrated</option>
              <option value="ManagedIdentity">Managed Identity</option>
            </select>
          </div>

          <div style={styles.formGroup}>
            <label>Output Path *</label>
            <input
              type="text"
              name="outputPath"
              value={formData.outputPath}
              onChange={handleChange}
              placeholder="/app/data/golden-images"
              required
            />
          </div>

          {formData.method === 'BackupRestore' && (
            <div style={styles.formGroup}>
              <label>Backup File *</label>
              <input
                type="text"
                name="backupFile"
                value={formData.backupFile}
                onChange={handleChange}
                placeholder="/app/backups/TestDB.bak"
                required
              />
            </div>
          )}

          <div style={styles.formGroup}>
            <label>Database Name</label>
            <input
              type="text"
              name="databaseName"
              value={formData.databaseName}
              onChange={handleChange}
              placeholder="TestDB"
            />
          </div>

          <div style={styles.formGroup}>
            <label>Source Database</label>
            <input
              type="text"
              name="sourceDatabase"
              value={formData.sourceDatabase}
              onChange={handleChange}
              placeholder="TestDB"
            />
          </div>
        </div>

        <div style={styles.formGroup}>
          <label>Source Connection{formData.method !== 'BackupRestore' ? ' *' : ''}</label>
          <textarea
            name="sourceConnection"
            value={formData.sourceConnection}
            onChange={handleChange}
            placeholder={DEFAULT_SOURCE_CONNECTION}
            rows={3}
            required={formData.method !== 'BackupRestore'}
            style={styles.textarea}
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
  formGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
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
    backgroundColor: '#007bff',
    color: 'white',
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
  },
};
