import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface VhdOperationsStatusData {
  enabled: boolean;
  diskSpaceAvailable: number;
  diskSpaceTotal: number;
  diskSpacePercentUsed: number;
  lastHealthCheck: string;
  chainValidationSupported: boolean;
  capabilities: string[];
}

export const VhdOperationsStatus: React.FC = () => {
  const [status, setStatus] = useState<VhdOperationsStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      setError(null);
      const response = await axios.get('/api/health/vhd-operations');
      if (response.data.success) {
        setStatus(response.data.data);
      }
    } catch (err: any) {
      setError(`Failed to load VHD operations status: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getTimeSinceCheck = (timestamp: string): string => {
    const now = new Date().getTime();
    const lastCheck = new Date(timestamp).getTime();
    const secondsAgo = Math.floor((now - lastCheck) / 1000);

    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
    return `${Math.floor(secondsAgo / 3600)}h ago`;
  };

  const getDiskSpaceColor = (percentUsed: number): string => {
    if (percentUsed >= 90) return '#f44336'; // Critical
    if (percentUsed >= 75) return '#FF9800'; // Warning
    return '#4CAF50'; // Healthy
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>VHD Operations Status</h3>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>VHD Operations Status</h3>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>VHD Operations Status</h3>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {status && (
        <>
          <div style={styles.statusCard}>
            <div style={styles.statusHeader}>
              <div style={styles.statusInfo}>
                <div style={styles.statusRow}>
                  <span style={styles.label}>Status:</span>
                  <span
                    style={{
                      ...styles.value,
                      color: status.enabled ? '#4CAF50' : '#FFC107'
                    }}
                  >
                    {status.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div style={styles.statusRow}>
                  <span style={styles.label}>Chain Validation:</span>
                  <span
                    style={{
                      ...styles.value,
                      color: status.chainValidationSupported ? '#4CAF50' : '#f44336'
                    }}
                  >
                    {status.chainValidationSupported ? 'Supported' : 'Not Supported'}
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
                  {status.enabled ? 'ACTIVE' : 'INACTIVE'}
                </div>
              </div>
            </div>
          </div>

          <div style={styles.diskSpaceCard}>
            <h4 style={styles.sectionTitle}>Disk Space Monitoring</h4>

            <div style={styles.diskSpaceContent}>
              <div style={styles.diskSpaceInfo}>
                <div style={styles.diskSpaceRow}>
                  <span style={styles.label}>Total Capacity:</span>
                  <span style={styles.value}>{formatBytes(status.diskSpaceTotal)}</span>
                </div>
                <div style={styles.diskSpaceRow}>
                  <span style={styles.label}>Used Space:</span>
                  <span style={styles.value}>
                    {formatBytes(status.diskSpaceTotal - status.diskSpaceAvailable)}
                  </span>
                </div>
                <div style={styles.diskSpaceRow}>
                  <span style={styles.label}>Available Space:</span>
                  <span style={styles.value}>{formatBytes(status.diskSpaceAvailable)}</span>
                </div>
              </div>

              <div style={styles.gaugeContainer}>
                <div
                  style={{
                    ...styles.gauge,
                    backgroundColor: getDiskSpaceColor(status.diskSpacePercentUsed)
                  }}
                >
                  <div style={styles.gaugeLabel}>
                    {status.diskSpacePercentUsed.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>

            <div style={styles.progressBar}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${status.diskSpacePercentUsed}%`,
                  backgroundColor: getDiskSpaceColor(status.diskSpacePercentUsed)
                }}
              />
            </div>

            {status.diskSpacePercentUsed >= 75 && (
              <div
                style={{
                  ...styles.warningBanner,
                  backgroundColor: status.diskSpacePercentUsed >= 90 ? '#f44336' : '#FF9800'
                }}
              >
                {status.diskSpacePercentUsed >= 90
                  ? '⚠️ Critical: Disk space running low!'
                  : '⚠️ Warning: Disk space usage is high'}
              </div>
            )}
          </div>

          {status.capabilities && status.capabilities.length > 0 && (
            <div style={styles.capabilitiesCard}>
              <h4 style={styles.sectionTitle}>Capabilities</h4>
              <div style={styles.capabilitiesList}>
                {status.capabilities.map((capability, index) => (
                  <div key={index} style={styles.capabilityItem}>
                    <span style={styles.capabilityIcon}>✓</span>
                    <span style={styles.capabilityName}>{capability}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={styles.refreshFooter}>
            <button onClick={loadStatus} style={styles.refreshButton}>
              Refresh
            </button>
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
  diskSpaceCard: {
    backgroundColor: '#2d2d2d',
    padding: '20px',
    borderRadius: '6px',
    marginBottom: '15px',
    border: '1px solid #404040'
  },
  sectionTitle: {
    margin: '0 0 15px 0',
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#b0b0b0'
  },
  diskSpaceContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px'
  },
  diskSpaceInfo: {
    flex: 1
  },
  diskSpaceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #404040'
  },
  gaugeContainer: {
    marginLeft: '30px',
    textAlign: 'center'
  },
  gauge: {
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  gaugeLabel: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: 'white'
  },
  progressBar: {
    width: '100%',
    height: '20px',
    backgroundColor: '#404040',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '15px'
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease'
  },
  warningBanner: {
    padding: '12px 16px',
    borderRadius: '4px',
    color: 'white',
    fontWeight: 'bold'
  },
  capabilitiesCard: {
    backgroundColor: '#2d2d2d',
    padding: '20px',
    borderRadius: '6px',
    marginBottom: '15px',
    border: '1px solid #404040'
  },
  capabilitiesList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '10px'
  },
  capabilityItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px',
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    border: '1px solid #404040'
  },
  capabilityIcon: {
    color: '#4CAF50',
    marginRight: '10px',
    fontWeight: 'bold'
  },
  capabilityName: {
    color: '#e0e0e0',
    fontSize: '13px'
  },
  refreshFooter: {
    marginTop: '20px',
    textAlign: 'right'
  },
  refreshButton: {
    padding: '10px 20px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px'
  }
};

export default VhdOperationsStatus;
