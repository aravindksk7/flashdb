import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface DiskLocation {
  path: string;
  total: number;
  used: number;
  available: number;
  percentUsed: number;
  warning: boolean;
}

interface DiskSpaceData {
  locations: DiskLocation[];
  lastCheck: string;
}

export const DiskSpaceMonitor: React.FC = () => {
  const [diskData, setDiskData] = useState<DiskSpaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDiskSpace();
    const interval = setInterval(loadDiskSpace, 60000); // Update every 60 seconds
    return () => clearInterval(interval);
  }, []);

  const loadDiskSpace = async () => {
    try {
      setError(null);
      const response = await axios.get('/api/health/disk-space');
      if (response.data.success) {
        setDiskData(response.data.data);
      }
    } catch (err: any) {
      setError(`Failed to load disk space info: ${err.message}`);
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

  const getDiskColor = (percentUsed: number): string => {
    if (percentUsed >= 90) return '#f44336'; // Critical
    if (percentUsed >= 75) return '#FF9800'; // Warning
    if (percentUsed >= 50) return '#FFC107'; // Caution
    return '#4CAF50'; // Healthy
  };

  const getHealthStatus = (percentUsed: number): string => {
    if (percentUsed >= 90) return 'Critical';
    if (percentUsed >= 75) return 'Warning';
    if (percentUsed >= 50) return 'Caution';
    return 'Healthy';
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
        <h3 style={styles.title}>Disk Space Monitor</h3>
        <div style={styles.loading}>Loading...</div>
      </div>
    );
  }

  if (error && !diskData) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Disk Space Monitor</h3>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Disk Space Monitor</h3>
        <button onClick={loadDiskSpace} style={styles.refreshButton}>
          Refresh
        </button>
      </div>

      {error && <div style={styles.errorBanner}>{error}</div>}

      {diskData && (
        <>
          <div style={styles.timestampInfo}>
            Last checked: {getTimeSinceCheck(diskData.lastCheck)}
          </div>

          <div style={styles.locationsList}>
            {diskData.locations.map((location, index) => (
              <div key={index} style={styles.locationCard}>
                <div style={styles.locationHeader}>
                  <div style={styles.locationPath}>{location.path}</div>
                  <div
                    style={{
                      ...styles.healthBadge,
                      backgroundColor: getDiskColor(location.percentUsed)
                    }}
                  >
                    {getHealthStatus(location.percentUsed)}
                  </div>
                </div>

                <div style={styles.locationStats}>
                  <div style={styles.stat}>
                    <span style={styles.statLabel}>Total:</span>
                    <span style={styles.statValue}>{formatBytes(location.total)}</span>
                  </div>
                  <div style={styles.stat}>
                    <span style={styles.statLabel}>Used:</span>
                    <span style={styles.statValue}>{formatBytes(location.used)}</span>
                  </div>
                  <div style={styles.stat}>
                    <span style={styles.statLabel}>Available:</span>
                    <span style={styles.statValue}>{formatBytes(location.available)}</span>
                  </div>
                </div>

                <div
                  style={{
                    ...styles.progressBar,
                    borderColor: getDiskColor(location.percentUsed)
                  }}
                >
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${location.percentUsed}%`,
                      backgroundColor: getDiskColor(location.percentUsed)
                    }}
                  />
                </div>

                <div style={styles.percentageDisplay}>
                  {location.percentUsed.toFixed(1)}% used
                </div>

                {location.warning && (
                  <div
                    style={{
                      ...styles.warningMessage,
                      backgroundColor:
                        location.percentUsed >= 90
                          ? 'rgba(244, 67, 54, 0.2)'
                          : 'rgba(255, 152, 0, 0.2)',
                      borderColor:
                        location.percentUsed >= 90 ? '#f44336' : '#FF9800'
                    }}
                  >
                    {location.percentUsed >= 90
                      ? '⚠️ Critical: Disk space is critically low!'
                      : '⚠️ Warning: Consider freeing disk space'}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={styles.summarySection}>
            <h4 style={styles.summaryTitle}>Summary</h4>
            <div style={styles.summaryGrid}>
              {diskData.locations.map((location, index) => {
                const criticalLocations = diskData.locations.filter(
                  (l) => l.percentUsed >= 90
                ).length;
                const warningLocations = diskData.locations.filter(
                  (l) => l.percentUsed >= 75 && l.percentUsed < 90
                ).length;
                const healthyLocations = diskData.locations.filter(
                  (l) => l.percentUsed < 75
                ).length;

                return (
                  index === 0 && (
                    <div key="summary" style={styles.summaryContent}>
                      <div style={styles.summaryRow}>
                        <span style={styles.summaryLabel}>Total Locations:</span>
                        <span style={styles.summaryValue}>{diskData.locations.length}</span>
                      </div>
                      <div style={styles.summaryRow}>
                        <span style={styles.summaryLabel}>Healthy:</span>
                        <span style={{ ...styles.summaryValue, color: '#4CAF50' }}>
                          {healthyLocations}
                        </span>
                      </div>
                      <div style={styles.summaryRow}>
                        <span style={styles.summaryLabel}>Warning:</span>
                        <span style={{ ...styles.summaryValue, color: '#FF9800' }}>
                          {warningLocations}
                        </span>
                      </div>
                      <div style={styles.summaryRow}>
                        <span style={styles.summaryLabel}>Critical:</span>
                        <span style={{ ...styles.summaryValue, color: '#f44336' }}>
                          {criticalLocations}
                        </span>
                      </div>
                    </div>
                  )
                );
              })}
            </div>
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
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px'
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 'bold'
  },
  refreshButton: {
    padding: '8px 16px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '13px'
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
  timestampInfo: {
    fontSize: '12px',
    color: '#888',
    marginBottom: '15px'
  },
  locationsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    gap: '15px',
    marginBottom: '20px'
  },
  locationCard: {
    backgroundColor: '#2d2d2d',
    padding: '15px',
    borderRadius: '6px',
    border: '1px solid #404040'
  },
  locationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px'
  },
  locationPath: {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: '#b0b0b0',
    flex: 1
  },
  healthBadge: {
    padding: '4px 12px',
    borderRadius: '4px',
    color: 'white',
    fontWeight: 'bold',
    fontSize: '11px',
    marginLeft: '10px'
  },
  locationStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
    marginBottom: '12px'
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  statLabel: {
    fontSize: '11px',
    color: '#888',
    marginBottom: '4px'
  },
  statValue: {
    fontSize: '12px',
    color: '#e0e0e0',
    fontWeight: 'bold'
  },
  progressBar: {
    width: '100%',
    height: '24px',
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    overflow: 'hidden',
    border: '1px solid #404040',
    marginBottom: '8px'
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease'
  },
  percentageDisplay: {
    textAlign: 'right',
    fontSize: '12px',
    color: '#b0b0b0'
  },
  warningMessage: {
    marginTop: '10px',
    padding: '10px',
    borderRadius: '4px',
    border: '1px solid',
    fontSize: '12px',
    color: '#e0e0e0'
  },
  summarySection: {
    backgroundColor: '#2d2d2d',
    padding: '15px',
    borderRadius: '6px',
    border: '1px solid #404040'
  },
  summaryTitle: {
    margin: '0 0 12px 0',
    fontSize: '13px',
    fontWeight: 'bold',
    color: '#b0b0b0'
  },
  summaryGrid: {
    display: 'grid',
    gap: '10px'
  },
  summaryContent: {},
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid #404040'
  },
  summaryLabel: {
    color: '#b0b0b0',
    fontSize: '12px'
  },
  summaryValue: {
    color: '#e0e0e0',
    fontWeight: 'bold',
    fontSize: '12px'
  }
};

export default DiskSpaceMonitor;
