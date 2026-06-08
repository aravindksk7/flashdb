import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface SqlAdapterStatusData {
  enabled: boolean;
  version: string;
  type: 'dbatools' | 'legacy';
  lastHealthCheck: string;
  connectivity: 'connected' | 'disconnected' | 'unknown';
  featureFlagStatus: 'enabled' | 'disabled' | 'unknown';
}

interface ConnectivityTestResult {
  success: boolean;
  serverName: string;
  databaseName: string;
  connectionTime: number;
  dbtoolsVersion: string;
  sqlVersion: string;
  testTime: string;
}

export const SqlAdapterStatus: React.FC = () => {
  const [status, setStatus] = useState<SqlAdapterStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testServerName, setTestServerName] = useState('');
  const [testDatabaseName, setTestDatabaseName] = useState('master');
  const [testingConnectivity, setTestingConnectivity] = useState(false);
  const [testResult, setTestResult] = useState<ConnectivityTestResult | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      setError(null);
      const response = await axios.get('/api/health/sql-adapter');
      if (response.data.success) {
        setStatus(response.data.data);
      }
    } catch (err: any) {
      setError(`Failed to load SQL adapter status: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleTestConnectivity = async () => {
    if (!testServerName.trim()) {
      setError('Please enter a server name');
      return;
    }

    setTestingConnectivity(true);
    try {
      const response = await axios.post('/api/health/sql-adapter/test', {
        serverName: testServerName,
        databaseName: testDatabaseName || 'master'
      });

      if (response.data.success) {
        setTestResult(response.data.data);
      }
    } catch (err: any) {
      setError(`Connectivity test failed: ${err.message}`);
    } finally {
      setTestingConnectivity(false);
    }
  };

  const handleToggleAdapter = async () => {
    if (!status) return;

    setToggling(true);
    try {
      const response = await axios.put('/api/health/sql-adapter/toggle', {
        enabled: !status.enabled
      });

      if (response.data.success) {
        setStatus(response.data.data);
      }
    } catch (err: any) {
      setError(`Failed to toggle adapter: ${err.message}`);
    } finally {
      setToggling(false);
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'connected':
        return '#4CAF50';
      case 'disconnected':
        return '#f44336';
      default:
        return '#FFC107';
    }
  };

  const getStatusIcon = (status: string): string => {
    switch (status) {
      case 'connected':
        return '✓';
      case 'disconnected':
        return '✕';
      default:
        return '?';
    }
  };

  const getTimeSinceCheck = (timestamp: string): string => {
    const now = new Date().getTime();
    const lastCheck = new Date(timestamp).getTime();
    const secondsAgo = Math.floor((now - lastCheck) / 1000);

    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
    return `${Math.floor(secondsAgo / 3600)}h ago`;
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>SQL Adapter Status</h3>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>SQL Adapter Status</h3>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>SQL Adapter Status</h3>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {status && (
        <>
          <div style={styles.statusCard}>
            <div style={styles.statusHeader}>
              <div style={styles.statusInfo}>
                <div style={styles.statusRow}>
                  <span style={styles.label}>Type:</span>
                  <span style={styles.value}>{status.type === 'dbatools' ? 'dbatools' : 'Legacy'}</span>
                </div>
                <div style={styles.statusRow}>
                  <span style={styles.label}>Version:</span>
                  <span style={styles.value}>{status.version}</span>
                </div>
                <div style={styles.statusRow}>
                  <span style={styles.label}>Status:</span>
                  <span
                    style={{
                      ...styles.value,
                      color: getStatusColor(status.connectivity)
                    }}
                  >
                    <span style={styles.statusIcon}>{getStatusIcon(status.connectivity)}</span>
                    {status.connectivity}
                  </span>
                </div>
                <div style={styles.statusRow}>
                  <span style={styles.label}>Feature Flag:</span>
                  <span
                    style={{
                      ...styles.value,
                      color: status.featureFlagStatus === 'enabled' ? '#4CAF50' : '#f44336'
                    }}
                  >
                    {status.featureFlagStatus}
                  </span>
                </div>
                <div style={styles.statusRow}>
                  <span style={styles.label}>Last Health Check:</span>
                  <span style={styles.value}>{getTimeSinceCheck(status.lastHealthCheck)}</span>
                </div>
              </div>

              <div style={styles.statusBadge}>
                <div
                  style={{
                    ...styles.enabledBadge,
                    backgroundColor: status.enabled ? '#4CAF50' : '#FFC107'
                  }}
                >
                  {status.enabled ? 'ENABLED' : 'DISABLED'}
                </div>
              </div>
            </div>

            <div style={styles.buttonGroup}>
              <button
                onClick={handleToggleAdapter}
                disabled={toggling}
                style={{
                  ...styles.button,
                  backgroundColor: status.enabled ? '#f44336' : '#4CAF50'
                }}
              >
                {toggling ? 'Toggling...' : status.enabled ? 'Disable Adapter' : 'Enable Adapter'}
              </button>
            </div>
          </div>

          <div style={styles.testCard}>
            <h4 style={styles.sectionTitle}>Test SQL Connectivity</h4>
            <div style={styles.testForm}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Server Name:</label>
                <input
                  type="text"
                  value={testServerName}
                  onChange={(e) => setTestServerName(e.target.value)}
                  placeholder="e.g., localhost, SERVERNAME\\INSTANCE"
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>Database Name:</label>
                <input
                  type="text"
                  value={testDatabaseName}
                  onChange={(e) => setTestDatabaseName(e.target.value)}
                  placeholder="master"
                  style={styles.input}
                />
              </div>
              <button
                onClick={handleTestConnectivity}
                disabled={testingConnectivity || !testServerName.trim()}
                style={{
                  ...styles.button,
                  backgroundColor: '#2196F3'
                }}
              >
                {testingConnectivity ? 'Testing...' : 'Test Connection'}
              </button>
            </div>

            {testResult && (
              <div style={styles.testResultCard}>
                <h5 style={styles.resultTitle}>Test Results</h5>
                <div style={styles.resultContent}>
                  <div style={styles.resultRow}>
                    <span style={styles.label}>Server:</span>
                    <span style={styles.value}>{testResult.serverName}</span>
                  </div>
                  <div style={styles.resultRow}>
                    <span style={styles.label}>Database:</span>
                    <span style={styles.value}>{testResult.databaseName}</span>
                  </div>
                  <div style={styles.resultRow}>
                    <span style={styles.label}>Connection Time:</span>
                    <span style={styles.value}>{testResult.connectionTime.toFixed(2)}ms</span>
                  </div>
                  <div style={styles.resultRow}>
                    <span style={styles.label}>dbatools Version:</span>
                    <span style={styles.value}>{testResult.dbtoolsVersion}</span>
                  </div>
                  <div style={styles.resultRow}>
                    <span style={styles.label}>SQL Version:</span>
                    <span style={styles.value}>{testResult.sqlVersion}</span>
                  </div>
                  <div style={styles.resultRow}>
                    <span style={styles.label}>Test Time:</span>
                    <span style={styles.value}>{new Date(testResult.testTime).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    padding: '20px',
    backgroundColor: '#1e1e1e',
    color: '#e0e0e0',
    borderRadius: '8px',
    marginBottom: '20px'
  },
  title: {
    margin: '0 0 20px 0',
    fontSize: '18px',
    fontWeight: 'bold'
  },
  loading: {
    padding: '20px',
    textAlign: 'center',
    color: '#888'
  },
  error: {
    padding: '12px 16px',
    backgroundColor: '#f44336',
    color: 'white',
    borderRadius: '4px'
  },
  errorBanner: {
    padding: '12px 16px',
    backgroundColor: '#f44336',
    color: 'white',
    borderRadius: '4px',
    marginBottom: '15px'
  },
  statusCard: {
    backgroundColor: '#2d2d2d',
    padding: '20px',
    borderRadius: '6px',
    marginBottom: '15px',
    border: '1px solid #404040'
  },
  statusHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  statusInfo: {
    flex: 1
  },
  statusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #404040'
  },
  label: {
    fontWeight: 'bold',
    color: '#b0b0b0',
    minWidth: '150px'
  },
  value: {
    color: '#e0e0e0'
  },
  statusIcon: {
    marginRight: '8px',
    fontWeight: 'bold'
  },
  statusBadge: {
    marginLeft: '20px',
    textAlign: 'center'
  },
  enabledBadge: {
    padding: '12px 20px',
    borderRadius: '4px',
    color: 'white',
    fontWeight: 'bold',
    fontSize: '12px'
  },
  buttonGroup: {
    marginTop: '20px',
    display: 'flex',
    gap: '10px'
  },
  button: {
    padding: '10px 20px',
    border: 'none',
    borderRadius: '4px',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px'
  },
  testCard: {
    backgroundColor: '#2d2d2d',
    padding: '20px',
    borderRadius: '6px',
    border: '1px solid #404040'
  },
  sectionTitle: {
    margin: '0 0 15px 0',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#b0b0b0'
  },
  testForm: {
    marginBottom: '15px'
  },
  formGroup: {
    marginBottom: '15px'
  },
  formLabel: {
    display: 'block',
    marginBottom: '5px',
    color: '#b0b0b0',
    fontSize: '13px',
    fontWeight: '500'
  },
  input: {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: '#1e1e1e',
    color: '#e0e0e0',
    border: '1px solid #404040',
    borderRadius: '4px',
    fontSize: '13px'
  },
  testResultCard: {
    backgroundColor: '#1e1e1e',
    padding: '15px',
    borderRadius: '4px',
    marginTop: '15px',
    border: '1px solid #4CAF50'
  },
  resultTitle: {
    margin: '0 0 10px 0',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#4CAF50'
  },
  resultContent: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '10px'
  },
  resultRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: '12px'
  }
};

export default SqlAdapterStatus;
