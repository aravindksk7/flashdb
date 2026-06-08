import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ConsoleIcon } from './ConsoleIcon';

const API_BASE = '/api';

interface HealthMetrics {
  totalClones: number;
  healthyClones: number;
  unhealthyClones: number;
  healthScore: number;
  lastValidationTimestamp: string;
  validationsFailed: number;
  validationsSuccess: number;
  averageValidationTimeSeconds: number;
}

export const CloneHealthMetrics: React.FC = () => {
  const [metrics, setMetrics] = useState<HealthMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadHealthMetrics();
    const interval = setInterval(loadHealthMetrics, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const loadHealthMetrics = async () => {
    try {
      setError(null);
      const response = await axios.get(`${API_BASE}/metrics/health`);

      if (response.data.success && response.data.data) {
        setMetrics(response.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load health metrics');
    } finally {
      setLoading(false);
    }
  };

  const getHealthColor = (score: number) => {
    if (score >= 80) return { color: '#2e7d32', label: 'Excellent' };
    if (score >= 60) return { color: '#f59e0b', label: 'Good' };
    if (score >= 40) return { color: '#ea580c', label: 'Fair' };
    return { color: '#d32f2f', label: 'Poor' };
  };

  const healthColor = metrics ? getHealthColor(metrics.healthScore) : { color: '#999', label: 'Unknown' };

  const successRate = metrics && metrics.validationsSuccess + metrics.validationsFailed > 0
    ? (metrics.validationsSuccess / (metrics.validationsSuccess + metrics.validationsFailed)) * 100
    : 0;

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.skeletonTitle} />
        <div style={styles.skeletonMetric} />
        <div style={styles.skeletonMetric} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Clone Health Metrics</h3>
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
        <h3 style={styles.title}>Clone Health Metrics</h3>
        <p style={styles.emptyState}>No health metrics available</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>Clone Health Metrics</h3>

      <div style={styles.metricsGrid}>
        {/* Health Score */}
        <div style={styles.metricCard}>
          <div style={styles.cardContent}>
            <div style={styles.label}>Health Score</div>
            <div style={{ ...styles.largeValue, color: healthColor.color }}>
              {metrics.healthScore.toFixed(1)}%
            </div>
            <div style={styles.status}>{healthColor.label}</div>
          </div>
          <div style={{
            ...styles.healthGauge,
            background: `conic-gradient(${healthColor.color} 0% ${metrics.healthScore}%, rgba(148, 163, 184, 0.1) ${metrics.healthScore}% 100%)`
          }} />
        </div>

        {/* Clone Status */}
        <div style={styles.metricCard}>
          <div style={styles.cardContent}>
            <div style={styles.label}>Total Clones</div>
            <div style={styles.largeValue}>{metrics.totalClones}</div>
            <div style={styles.statusRows}>
              <div style={styles.statusRow}>
                <span style={{ ...styles.statusDot, backgroundColor: '#2e7d32' }} />
                <span>{metrics.healthyClones} healthy</span>
              </div>
              <div style={styles.statusRow}>
                <span style={{ ...styles.statusDot, backgroundColor: '#d32f2f' }} />
                <span>{metrics.unhealthyClones} unhealthy</span>
              </div>
            </div>
          </div>
        </div>

        {/* Validation Performance */}
        <div style={styles.metricCard}>
          <div style={styles.cardContent}>
            <div style={styles.label}>Validation Success Rate</div>
            <div style={{ ...styles.largeValue, color: '#2e7d32' }}>
              {successRate.toFixed(1)}%
            </div>
            <div style={styles.statusRows}>
              <div style={styles.statusRow}>
                <span style={styles.countSmall}>{metrics.validationsSuccess}</span>
                <span style={styles.text}>passed</span>
              </div>
              <div style={styles.statusRow}>
                <span style={styles.countSmall}>{metrics.validationsFailed}</span>
                <span style={styles.text}>failed</span>
              </div>
            </div>
          </div>
        </div>

        {/* Avg Validation Time */}
        <div style={styles.metricCard}>
          <div style={styles.cardContent}>
            <div style={styles.label}>Avg Validation Time</div>
            <div style={styles.largeValue}>
              {metrics.averageValidationTimeSeconds < 60
                ? `${metrics.averageValidationTimeSeconds.toFixed(1)}s`
                : `${(metrics.averageValidationTimeSeconds / 60).toFixed(1)}m`
              }
            </div>
            <div style={styles.status}>Per validation</div>
          </div>
        </div>
      </div>

      {/* Health Indicator */}
      <div style={styles.indicatorBar}>
        <div style={{ ...styles.indicatorSegment, width: '25%', backgroundColor: '#2e7d32', opacity: metrics.healthScore >= 80 ? 1 : 0.3 }} />
        <div style={{ ...styles.indicatorSegment, width: '25%', backgroundColor: '#f59e0b', opacity: metrics.healthScore >= 60 ? 1 : 0.3 }} />
        <div style={{ ...styles.indicatorSegment, width: '25%', backgroundColor: '#ea580c', opacity: metrics.healthScore >= 40 ? 1 : 0.3 }} />
        <div style={{ ...styles.indicatorSegment, width: '25%', backgroundColor: '#d32f2f', opacity: 1 }} />
      </div>
      <div style={styles.indicatorLabels}>
        <span>Excellent (80%+)</span>
        <span>Good (60%+)</span>
        <span>Fair (40%+)</span>
        <span>Poor (&lt;40%)</span>
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
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
    marginBottom: '16px',
  },
  metricCard: {
    position: 'relative',
    display: 'flex',
    gap: '12px',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    borderRadius: '12px',
    padding: '12px',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: '11px',
    color: 'var(--text-soft)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  largeValue: {
    fontSize: '20px',
    fontWeight: 700,
    margin: '4px 0',
    color: 'var(--text)',
  },
  status: {
    fontSize: '12px',
    color: 'var(--text-soft)',
  },
  statusRows: {
    display: 'grid',
    gap: '4px',
    marginTop: '6px',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    color: 'var(--text-soft)',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
  },
  countSmall: {
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--text)',
    minWidth: '20px',
  },
  text: {
    fontSize: '11px',
    color: 'var(--text-soft)',
  },
  healthGauge: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  indicatorBar: {
    display: 'flex',
    height: '8px',
    borderRadius: '4px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  indicatorSegment: {
    transition: 'opacity 0.3s ease',
  },
  indicatorLabels: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
    fontSize: '11px',
    color: 'var(--text-soft)',
    textAlign: 'center',
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
    fontSize: '13px',
    margin: 0,
  },
  skeletonTitle: {
    height: '20px',
    width: '150px',
    borderRadius: '4px',
    background: 'linear-gradient(90deg, rgba(30,41,59,0.85), rgba(51,65,85,0.95), rgba(30,41,59,0.85))',
    marginBottom: '16px',
  },
  skeletonMetric: {
    height: '80px',
    borderRadius: '12px',
    background: 'linear-gradient(90deg, rgba(30,41,59,0.85), rgba(51,65,85,0.95), rgba(30,41,59,0.85))',
    marginBottom: '12px',
  },
} satisfies Record<string, React.CSSProperties>;
