import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ConsoleIcon } from './ConsoleIcon';

const API_BASE = '/api';

interface RepairMetrics {
  totalRepairs: number;
  successfulRepairs: number;
  failedRepairs: number;
  successRate: number;
  averageRepairTimeSeconds: number;
  repairsByStatus: Array<{
    status: string;
    count: number;
  }>;
  lastRepairTimestamp?: string;
}

export const RepairSuccessMetrics: React.FC = () => {
  const [metrics, setMetrics] = useState<RepairMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRepairMetrics();
    const interval = setInterval(loadRepairMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadRepairMetrics = async () => {
    try {
      setError(null);
      const response = await axios.get(`${API_BASE}/metrics/repair`);

      if (response.data.success && response.data.data) {
        setMetrics(response.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load repair metrics');
    } finally {
      setLoading(false);
    }
  };

  const successStatusColor = metrics && metrics.successRate >= 80
    ? '#2e7d32'
    : metrics && metrics.successRate >= 60
      ? '#f59e0b'
      : '#d32f2f';

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.skeletonTitle} />
        <div style={styles.skeletonChart} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Repair Success Rate</h3>
        <div style={styles.errorBox}>
          <ConsoleIcon name="alert" className="console-icon" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Repair Success Rate</h3>
        <p style={styles.emptyState}>No repair metrics available</p>
      </div>
    );
  }

  const totalOps = metrics.totalRepairs || 1;

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Repair Success Rate</h3>

      <div style={styles.mainMetrics}>
        {/* Success Rate Gauge */}
        <div style={styles.gaugeContainer}>
          <div style={styles.gaugeBackground}>
            <div
              style={{
                ...styles.gaugeFill,
                width: `${metrics.successRate}%`,
                backgroundColor: successStatusColor,
              }}
            />
          </div>
          <div style={styles.gaugeText}>
            <div style={{ ...styles.gaugeValue, color: successStatusColor }}>
              {metrics.successRate.toFixed(1)}%
            </div>
            <div style={styles.gaugeLabel}>Success Rate</div>
          </div>
        </div>

        {/* Stats Grid */}
        <div style={styles.statsGrid}>
          <div style={styles.statBox}>
            <div style={styles.statValue}>{metrics.totalRepairs}</div>
            <div style={styles.statLabel}>Total Repairs</div>
          </div>
          <div style={styles.statBox}>
            <div style={{ ...styles.statValue, color: '#2e7d32' }}>
              {metrics.successfulRepairs}
            </div>
            <div style={styles.statLabel}>Successful</div>
          </div>
          <div style={styles.statBox}>
            <div style={{ ...styles.statValue, color: '#d32f2f' }}>
              {metrics.failedRepairs}
            </div>
            <div style={styles.statLabel}>Failed</div>
          </div>
        </div>
      </div>

      {/* Status Distribution */}
      <div style={styles.distributionSection}>
        <h4 style={styles.sectionTitle}>Repair Status Distribution</h4>
        <div style={styles.distributionBars}>
          {metrics.repairsByStatus.length > 0 ? (
            metrics.repairsByStatus.map((status) => {
              const percentage = totalOps > 0 ? (status.count / totalOps) * 100 : 0;
              const color = status.status.toLowerCase() === 'completed'
                ? '#2e7d32'
                : status.status.toLowerCase() === 'failed'
                  ? '#d32f2f'
                  : status.status.toLowerCase() === 'executing'
                    ? '#f59e0b'
                    : '#999';

              return (
                <div key={status.status} style={styles.barContainer}>
                  <div style={styles.barLabel}>{status.status}</div>
                  <div style={styles.bar}>
                    <div
                      style={{
                        ...styles.barFill,
                        width: `${percentage}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <div style={styles.barStats}>
                    <span>{status.count}</span>
                    <span>{percentage.toFixed(1)}%</span>
                  </div>
                </div>
              );
            })
          ) : (
            <p style={styles.emptyState}>No repair status data</p>
          )}
        </div>
      </div>

      {/* Performance */}
      <div style={styles.performanceSection}>
        <div style={styles.perfCard}>
          <div style={styles.perfLabel}>Average Repair Time</div>
          <div style={styles.perfValue}>
            {metrics.averageRepairTimeSeconds < 60
              ? `${metrics.averageRepairTimeSeconds.toFixed(1)}s`
              : `${(metrics.averageRepairTimeSeconds / 60).toFixed(1)}m`
            }
          </div>
        </div>
        {metrics.lastRepairTimestamp && (
          <div style={styles.perfCard}>
            <div style={styles.perfLabel}>Last Repair</div>
            <div style={styles.perfValue}>
              {new Date(metrics.lastRepairTimestamp).toLocaleString()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '20px',
    backgroundColor: 'rgba(15, 23, 34, 0.88)',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    borderRadius: '16px',
  },
  title: {
    margin: '0 0 16px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text)',
  },
  mainMetrics: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '16px',
    marginBottom: '20px',
  },
  gaugeContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  gaugeBackground: {
    height: '12px',
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  gaugeFill: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  gaugeText: {
    textAlign: 'center',
  },
  gaugeValue: {
    fontSize: '24px',
    fontWeight: 700,
    marginBottom: '2px',
  },
  gaugeLabel: {
    fontSize: '12px',
    color: 'var(--text-soft)',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
  },
  statBox: {
    border: '1px solid rgba(148, 163, 184, 0.12)',
    borderRadius: '10px',
    padding: '10px',
    textAlign: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
  },
  statValue: {
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: '4px',
  },
  statLabel: {
    fontSize: '11px',
    color: 'var(--text-soft)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  distributionSection: {
    marginBottom: '16px',
  },
  distributionBars: {
    display: 'grid',
    gap: '8px',
  },
  barContainer: {
    display: 'grid',
    gap: '4px',
  },
  barLabel: {
    fontSize: '12px',
    color: 'var(--text)',
    fontWeight: 500,
  },
  bar: {
    height: '8px',
    backgroundColor: 'rgba(30, 41, 59, 0.85)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  barStats: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: 'var(--text-soft)',
  },
  performanceSection: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '10px',
    paddingTop: '12px',
    borderTop: '1px solid rgba(148, 163, 184, 0.12)',
  },
  perfCard: {
    padding: '10px',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: '10px',
  },
  perfLabel: {
    fontSize: '11px',
    color: 'var(--text-soft)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  perfValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: 'var(--text)',
  },
  errorBox: {
    display: 'flex',
    gap: '12px',
    backgroundColor: 'rgba(248, 113, 113, 0.12)',
    border: '1px solid rgba(248, 113, 113, 0.25)',
    borderRadius: '10px',
    padding: '12px',
    color: '#fecaca',
  },
  emptyState: {
    color: 'var(--text-soft)',
    fontSize: '12px',
    margin: 0,
    textAlign: 'center',
  },
  skeletonTitle: {
    height: '20px',
    width: '150px',
    borderRadius: '4px',
    background: 'linear-gradient(90deg, rgba(30,41,59,0.85), rgba(51,65,85,0.95), rgba(30,41,59,0.85))',
    marginBottom: '16px',
  },
  skeletonChart: {
    height: '120px',
    borderRadius: '12px',
    background: 'linear-gradient(90deg, rgba(30,41,59,0.85), rgba(51,65,85,0.95), rgba(30,41,59,0.85))',
  },
} satisfies Record<string, React.CSSProperties>;
