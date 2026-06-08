/**
 * Connection Test Panel Component
 *
 * Pre-save testing of host connectivity before registration
 */

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Host } from './HostManagement';
import { ValidationFindings } from './ValidationFindings';
import './ConnectionTestPanel.css';

const API_BASE = '/api';

interface ConnectionTestResult {
  success: boolean;
  data?: {
    hostId: string;
    isValid: boolean;
    findings: Array<{
      severity: 'Info' | 'Warning' | 'Error';
      code: string;
      message: string;
      details?: Record<string, any>;
    }>;
    capabilities: string[];
  };
  message?: string;
}

interface ConnectionTestPanelProps {
  isOpen: boolean;
  initialHost?: Host | null;
  onClose: () => void;
  onTestResult: () => void;
}

export const ConnectionTestPanel: React.FC<ConnectionTestPanelProps> = ({
  isOpen,
  initialHost,
  onClose,
  onTestResult
}) => {
  const [testData, setTestData] = useState({
    fqdn: '',
    accessMethod: 'WinRM' as 'Local' | 'WinRM' | 'SSH',
  });
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ConnectionTestResult | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setTestData({
      fqdn: initialHost?.fqdn || '',
      accessMethod: initialHost?.accessMethod || 'WinRM'
    });
    setResult(null);
  }, [isOpen, initialHost]);

  const handleTestConnection = async () => {
    if (!testData.fqdn.trim()) {
      alert('Please enter FQDN');
      return;
    }

    setTesting(true);
    try {
      const response = await axios.post(`${API_BASE}/hosts/test`, {
        fqdn: testData.fqdn,
        accessMethod: testData.accessMethod,
        credentialReference: undefined
      });
      setResult(response.data);
    } catch (err: any) {
      setResult({
        success: false,
        message: err.response?.data?.message || 'Connection test failed'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleClose = () => {
    setTestData({ fqdn: '', accessMethod: 'WinRM' });
    setResult(null);
    onClose();
  };

  if (!isOpen) return null;

  const isHealthy = result?.success === true && result.data?.isValid;

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <h2 style={styles.title}>Test Host Connection</h2>
          <button onClick={handleClose} style={styles.closeButton}>
            ×
          </button>
        </div>

        <div style={styles.content}>
          {!result ? (
            <div style={styles.testForm}>
              <div style={styles.formGroup}>
                <label style={styles.label}>FQDN or IP Address</label>
                <input
                  type="text"
                  value={testData.fqdn}
                  onChange={(e) =>
                    setTestData({ ...testData, fqdn: e.target.value })
                  }
                  placeholder="e.g., server.example.com"
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Access Method</label>
                <select
                  value={testData.accessMethod}
                  onChange={(e) =>
                    setTestData({
                      ...testData,
                      accessMethod: e.target.value as 'Local' | 'WinRM' | 'SSH'
                    })
                  }
                  style={styles.select}
                >
                  <option value="Local">Local</option>
                  <option value="WinRM">WinRM</option>
                  <option value="SSH">SSH</option>
                </select>
              </div>

              <button
                onClick={handleTestConnection}
                disabled={testing}
                style={styles.testButton}
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
            </div>
          ) : (
            <div style={styles.resultContainer}>
              <div
                style={{
                  ...styles.resultBanner,
                  backgroundColor: isHealthy ? '#e8f5e9' : '#ffebee',
                  borderLeftColor: isHealthy ? '#2e7d32' : '#d32f2f'
                }}
              >
                <div style={{ fontSize: '24px', marginRight: '12px' }}>
                  {isHealthy ? '✓' : '✕'}
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: '600',
                      color: isHealthy ? '#2e7d32' : '#d32f2f'
                    }}
                  >
                    {result.success && result.data?.isValid
                      ? 'Connection Successful'
                      : 'Connection Failed'}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    {result.message}
                  </div>
                </div>
              </div>

              {result.data?.findings && result.data.findings.length > 0 && (
                <div style={styles.findingsSection}>
                  <h3 style={styles.findingsTitle}>Details</h3>
                  <ValidationFindings findings={result.data.findings} />
                </div>
              )}
            </div>
          )}
        </div>

        <div style={styles.footer}>
          {result && (
            <button
              onClick={() => setResult(null)}
              style={styles.secondaryButton}
            >
              Test Another
            </button>
          )}
          <button onClick={handleClose} style={styles.closeButton}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  panel: {
    backgroundColor: 'white',
    borderRadius: '8px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #f0f0f0'
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: '#222'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: '#999',
    cursor: 'pointer'
  },
  content: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto'
  },
  testForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column'
  },
  label: {
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '500'
  },
  input: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px'
  },
  select: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    backgroundColor: 'white'
  },
  testButton: {
    padding: '10px 16px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  resultContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  resultBanner: {
    display: 'flex',
    padding: '12px',
    borderRadius: '4px',
    borderLeft: '4px solid'
  },
  findingsSection: {
    marginTop: '12px'
  },
  findingsTitle: {
    margin: '0 0 8px 0',
    fontSize: '14px',
    fontWeight: '600'
  },
  footer: {
    display: 'flex',
    gap: '12px',
    padding: '20px',
    borderTop: '1px solid #f0f0f0',
    justifyContent: 'flex-end'
  },
  secondaryButton: {
    padding: '10px 16px',
    backgroundColor: '#f5f5f5',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  }
};

export default ConnectionTestPanel;
