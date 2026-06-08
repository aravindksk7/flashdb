import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ConsoleIcon } from './ConsoleIcon';

const API_BASE = '/api';

interface HealthTrendPoint {
  timestamp: string;
  healthScore: number;
  healthyClones: number;
  unhealthyClones: number;
}

export const HealthTrendChart: React.FC = () => {
  const [trendData, setTrendData] = useState<HealthTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('24h');

  useEffect(() => {
    loadTrendData();
    const interval = setInterval(loadTrendData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [timeRange]);

  const loadTrendData = async () => {
    try {
      setError(null);
      const response = await axios.get(`${API_BASE}/metrics/health-trend`, {
        params: { timeRange }
      });

      if (response.data.success && Array.isArray(response.data.data)) {
        setTrendData(response.data.data);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load trend data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.skeletonHeader} />
        <div style={styles.skeletonChart} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Clone Health Trend</h3>
        <div style={styles.errorBox}>
          <ConsoleIcon name="alert" className="console-icon" />
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!trendData || trendData.length === 0) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>Clone Health Trend</h3>
        <p style={styles.emptyState}>No trend data available</p>
      </div>
    );
  }

  const maxHealth = 100;
  const maxClones = Math.max(...trendData.map(d => d.healthyClones + d.unhealthyClones), 1);
  const chartHeight = 200;
  const chartPadding = 40;
  const chartWidth = Math.max(400, trendData.length * 30);

  // Generate SVG path for trend line
  const points = trendData.map((point, index) => {
    const x = (index / (trendData.length - 1 || 1)) * (chartWidth - chartPadding * 2) + chartPadding;
    const y = chartHeight - ((point.healthScore / maxHealth) * (chartHeight - chartPadding * 2)) - chartPadding;
    return [x, y];
  });

  const pathData = points.length > 0
    ? points.reduce((path, point, index) => {
        const cmd = index === 0 ? 'M' : 'L';
        return `${path} ${cmd} ${point[0]} ${point[1]}`;
      }, '')
    : '';

  // Format time labels
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (timeRange === '24h') {
      return date.getHours() + 'h';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // Get current trend
  const currentTrend = trendData.length > 1
    ? trendData[trendData.length - 1].healthScore - trendData[0].healthScore
    : 0;

  const trendColor = currentTrend > 0 ? '#2e7d32' : currentTrend < 0 ? '#d32f2f' : '#999';
  const trendLabel = currentTrend > 0 ? '📈 Improving' : currentTrend < 0 ? '📉 Declining' : '→ Stable';

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Clone Health Trend</h3>
        <div style={styles.controls}>
          {(['24h', '7d', '30d'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              style={{
                ...styles.rangeButton,
                backgroundColor: timeRange === range ? 'rgba(34, 211, 238, 0.2)' : 'transparent',
                color: timeRange === range ? '#cffafe' : 'var(--text-soft)',
              }}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Trend Indicator */}
      <div style={{ ...styles.trendIndicator, color: trendColor }}>
        {trendLabel}
        {Math.abs(currentTrend) > 0 && <span> ({Math.abs(currentTrend).toFixed(1)}%)</span>}
      </div>

      {/* Chart Container */}
      <div style={styles.chartWrapper}>
        <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} style={styles.svg}>
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((val) => {
            const y = chartHeight - ((val / maxHealth) * (chartHeight - chartPadding * 2)) - chartPadding;
            return (
              <g key={`grid-${val}`}>
                <line
                  x1={chartPadding}
                  y1={y}
                  x2={chartWidth - chartPadding}
                  y2={y}
                  stroke="rgba(148, 163, 184, 0.1)"
                  strokeWidth="1"
                />
                <text x={chartPadding - 5} y={y} textAnchor="end" dy="0.3em" fontSize="10" fill="var(--text-soft)">
                  {val}%
                </text>
              </g>
            );
          })}

          {/* Trend line */}
          {pathData && (
            <path
              d={pathData}
              fill="none"
              stroke="#22d3ee"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Data points */}
          {points.map((point, index) => (
            <circle
              key={`point-${index}`}
              cx={point[0]}
              cy={point[1]}
              r="3"
              fill="#22d3ee"
              opacity="0.7"
            />
          ))}

          {/* X-axis labels */}
          {trendData.map((point, index) => {
            // Show every nth label to avoid crowding
            const step = Math.ceil(trendData.length / 6);
            if (index % step === 0 || index === trendData.length - 1) {
              const x = points[index]?.[0] || 0;
              return (
                <text
                  key={`label-${index}`}
                  x={x}
                  y={chartHeight - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fill="var(--text-soft)"
                >
                  {formatTime(point.timestamp)}
                </text>
              );
            }
            return null;
          })}
        </svg>
      </div>

      {/* Stats */}
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Current Health</div>
          <div style={styles.statValue}>
            {trendData.length > 0 ? trendData[trendData.length - 1].healthScore.toFixed(1) : 'N/A'}%
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Lowest Health</div>
          <div style={styles.statValue}>
            {Math.min(...trendData.map(d => d.healthScore)).toFixed(1)}%
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Highest Health</div>
          <div style={styles.statValue}>
            {Math.max(...trendData.map(d => d.healthScore)).toFixed(1)}%
          </div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>Avg Health</div>
          <div style={styles.statValue}>
            {(trendData.reduce((sum, d) => sum + d.healthScore, 0) / trendData.length).toFixed(1)}%
          </div>
        </div>
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
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text)',
  },
  controls: {
    display: 'flex',
    gap: '4px',
  },
  rangeButton: {
    padding: '4px 12px',
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '6px',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  trendIndicator: {
    fontSize: '13px',
    fontWeight: 500,
    marginBottom: '12px',
    padding: '8px 12px',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: '8px',
    display: 'inline-block',
  },
  chartWrapper: {
    marginBottom: '16px',
    backgroundColor: 'rgba(30, 41, 59, 0.3)',
    borderRadius: '10px',
    padding: '12px',
    overflowX: 'auto',
  },
  svg: {
    minWidth: '100%',
    height: 'auto',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '10px',
  },
  statCard: {
    padding: '12px',
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    border: '1px solid rgba(148, 163, 184, 0.12)',
    borderRadius: '10px',
  },
  statLabel: {
    fontSize: '11px',
    color: 'var(--text-soft)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '4px',
  },
  statValue: {
    fontSize: '18px',
    fontWeight: 700,
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
    fontSize: '13px',
    margin: 0,
  },
  skeletonHeader: {
    height: '20px',
    width: '200px',
    borderRadius: '4px',
    background: 'linear-gradient(90deg, rgba(30,41,59,0.85), rgba(51,65,85,0.95), rgba(30,41,59,0.85))',
    marginBottom: '16px',
  },
  skeletonChart: {
    height: '200px',
    borderRadius: '10px',
    background: 'linear-gradient(90deg, rgba(30,41,59,0.85), rgba(51,65,85,0.95), rgba(30,41,59,0.85))',
    marginBottom: '16px',
  },
} satisfies Record<string, React.CSSProperties>;
