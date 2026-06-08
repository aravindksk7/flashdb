/**
 * Add Host Form Component
 *
 * Form for registering new remote hosts or editing existing ones
 */

import React, { useState, useEffect } from 'react';
import { Host } from './HostManagement';
import './AddHostForm.css';

interface AddHostFormProps {
  initialData?: Host;
  onSubmit: (data: Omit<Host, 'id' | 'lastValidatedAt' | 'validationState'>) => Promise<void>;
  onCancel: () => void;
  isEditing?: boolean;
}

export const AddHostForm: React.FC<AddHostFormProps> = ({
  initialData,
  onSubmit,
  onCancel,
  isEditing = false
}) => {
  const [formData, setFormData] = useState({
    name: initialData?.name || '',
    fqdn: initialData?.fqdn || '',
    accessMethod: (initialData?.accessMethod || 'WinRM') as 'Local' | 'WinRM' | 'SSH',
    credentialReference: initialData?.credentialReference || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError('Host name is required');
      return false;
    }
    if (!formData.fqdn.trim()) {
      setError('FQDN is required');
      return false;
    }
    if (!formData.accessMethod) {
      setError('Access method is required');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await onSubmit({
        name: formData.name,
        fqdn: formData.fqdn,
        accessMethod: formData.accessMethod,
        credentialReference: formData.credentialReference || undefined,
        pathMappings: {},
        sqlInstances: []
      });
      setSuccess(true);
      setTimeout(() => onCancel(), 800);
    } catch (err: any) {
      setError(err.message || 'Failed to save host');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.formWrapper}>
        <h2 style={styles.title}>
          {isEditing ? 'Edit Host' : 'Register New Host'}
        </h2>

        {error && (
          <div style={styles.errorBox}>
            {error}
          </div>
        )}

        {success && (
          <div style={styles.successBox}>
            Host {isEditing ? 'updated' : 'registered'} successfully!
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Host Name */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Host Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., production-db-01"
              style={styles.input}
            />
            <p style={styles.hint}>Friendly name for this host</p>
          </div>

          {/* FQDN */}
          <div style={styles.formGroup}>
            <label style={styles.label}>FQDN (Fully Qualified Domain Name) *</label>
            <input
              type="text"
              name="fqdn"
              value={formData.fqdn}
              onChange={handleChange}
              placeholder="e.g., prod-db.company.com"
              style={styles.input}
            />
            <p style={styles.hint}>
              Fully qualified domain name or IP address of the remote host
            </p>
          </div>

          {/* Access Method */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Access Method *</label>
            <select
              name="accessMethod"
              value={formData.accessMethod}
              onChange={handleChange}
              style={styles.select}
            >
              <option value="Local">Local</option>
              <option value="WinRM">WinRM (Windows Remote Management)</option>
              <option value="SSH">SSH (Secure Shell)</option>
            </select>
            <p style={styles.hint}>
              {formData.accessMethod === 'WinRM'
                ? 'Uses PowerShell Remoting (Windows only)'
                : formData.accessMethod === 'SSH'
                ? 'Uses SSH protocol (cross-platform)'
                : 'Local machine access'}
            </p>
          </div>

          {/* Credential Reference */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Credential Reference (Optional)</label>
            <input
              type="text"
              name="credentialReference"
              value={formData.credentialReference}
              onChange={handleChange}
              placeholder="e.g., prod-db-admin-creds"
              style={styles.input}
            />
            <p style={styles.hint}>
              Reference to stored credentials in your credential vault
            </p>
          </div>

          {/* Form Actions */}
          <div style={styles.formActions}>
            <button
              type="submit"
              disabled={loading}
              style={{
                ...styles.submitButton,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? 'Saving...' : isEditing ? 'Update Host' : 'Register Host'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                ...styles.cancelButton,
                opacity: loading ? 0.7 : 1,
                cursor: loading ? 'not-allowed' : 'pointer'
              }}
            >
              Cancel
            </button>
          </div>

          {/* Info Box */}
          <div style={styles.infoBox}>
            <strong>Next Steps:</strong>
            <ul style={styles.infoList}>
              <li>After registration, validate the host connection</li>
              <li>Configure UNC path mappings if needed</li>
              <li>Test the connection before using in operations</li>
            </ul>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    padding: '20px 0'
  },
  formWrapper: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '30px',
    maxWidth: '500px',
    width: '100%',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  title: {
    margin: '0 0 20px 0',
    fontSize: '20px',
    fontWeight: '600',
    color: '#222'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column'
  },
  label: {
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: '#333'
  },
  input: {
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s'
  },
  select: {
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'inherit',
    backgroundColor: 'white',
    cursor: 'pointer'
  },
  hint: {
    margin: '6px 0 0 0',
    fontSize: '12px',
    color: '#666'
  },
  errorBox: {
    padding: '12px',
    backgroundColor: '#ffebee',
    border: '1px solid #ef5350',
    borderRadius: '4px',
    color: '#c62828',
    fontSize: '14px',
    marginBottom: '16px'
  },
  successBox: {
    padding: '12px',
    backgroundColor: '#e8f5e9',
    border: '1px solid #81c784',
    borderRadius: '4px',
    color: '#2e7d32',
    fontSize: '14px',
    marginBottom: '16px'
  },
  formActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '20px'
  },
  submitButton: {
    flex: 1,
    padding: '12px 16px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s'
  },
  cancelButton: {
    flex: 1,
    padding: '12px 16px',
    backgroundColor: '#f5f5f5',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  infoBox: {
    padding: '12px',
    backgroundColor: '#e3f2fd',
    border: '1px solid #90caf9',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#1565c0',
    marginTop: '16px'
  },
  infoList: {
    margin: '8px 0 0 0',
    paddingLeft: '20px'
  }
};

export default AddHostForm;
