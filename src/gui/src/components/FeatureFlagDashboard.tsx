import React, { useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/Dashboard.css';
import { ConsoleIcon } from './ConsoleIcon';

interface FeatureFlag {
  name: string;
  displayName: string;
  description: string;
  status: 'enabled' | 'disabled' | 'beta' | 'deprecated';
  rolloutPercentage: number;
  phase: string;
  enabled: boolean;
  createdAt: string;
  enabledAt?: string;
  disabledAt?: string;
  rolloutStartedAt?: string;
  expectedCompletionDate?: string;
  usersAffected: number;
  recentlyChanged: boolean;
  badges: ('NEW' | 'BETA' | 'DEPRECATED')[];
}

interface FeatureFlagsResponse {
  totalFlags: number;
  enabledCount: number;
  betaCount: number;
  disabledCount: number;
  flags: FeatureFlag[];
  lastUpdated: string;
}

export const FeatureFlagDashboard: React.FC = () => {
  const [flagsData, setFlagsData] = useState<FeatureFlagsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFlagName, setExpandedFlagName] = useState<string | null>(null);
  const [updatingFlag, setUpdatingFlag] = useState<string | null>(null);

  const API_BASE = '/api';

  useEffect(() => {
    loadFeatureFlags();
    const interval = setInterval(loadFeatureFlags, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const loadFeatureFlags = async () => {
    try {
      setError(null);
      const response = await axios.get(`${API_BASE}/features`);

      if (response.data.success) {
        setFlagsData(response.data.data);
      } else {
        setError(response.data.message || 'Failed to load feature flags');
      }
    } catch (err: any) {
      setError(`Failed to load feature flags: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'enabled':
        return 'green';
      case 'beta':
        return 'amber';
      case 'disabled':
        return 'red';
      case 'deprecated':
        return 'red';
      default:
        return 'cyan';
    }
  };

  const updateFlagRollout = async (flagName: string, newPercentage: number) => {
    try {
      setUpdatingFlag(flagName);
      const response = await axios.put(`${API_BASE}/features/${flagName}`, {
        rolloutPercentage: newPercentage
      });

      if (response.data.success) {
        // Update local state
        setFlagsData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            flags: prev.flags.map(flag =>
              flag.name === flagName
                ? { ...flag, rolloutPercentage: newPercentage, recentlyChanged: true }
                : flag
            )
          };
        });
      } else {
        setError(`Failed to update flag: ${response.data.message}`);
      }
    } catch (err: any) {
      setError(`Failed to update flag: ${err.message}`);
    } finally {
      setUpdatingFlag(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    const diffHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

    if (diffDays === 0 && diffHours < 1) return 'Just now';
    if (diffDays === 0) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div className="section">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">Feature Management</div>
            <h2>Feature Flags</h2>
            <p className="workflow-help">Monitor and control feature flag rollout across all phases.</p>
          </div>
        </div>
        <div className="metrics-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="metric-card skeleton-card" />
          ))}
        </div>
      </div>
    );
  }

  if (!flagsData) {
    return (
      <div className="section">
        <div className="error-alert">
          <p>{error || 'Failed to load feature flags'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="panel-header">
        <div>
          <div className="panel-kicker">Feature Management</div>
          <h2>Feature Flags</h2>
          <p className="workflow-help">Monitor and control feature flag rollout across all phases.</p>
        </div>
        <div className="chip-row">
          <span className="chip chip-green">{flagsData.enabledCount} Enabled</span>
          <span className="chip chip-amber">{flagsData.betaCount} Beta</span>
          <span className="chip chip-red">{flagsData.disabledCount} Disabled</span>
        </div>
      </div>

      {error && (
        <div className="error-alert">
          <p className="btn-icon"><ConsoleIcon name="warning" className="console-icon" />{error}</p>
        </div>
      )}

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Total Flags</div>
          <div className="metric-value">
            <span className="chip chip-cyan">{flagsData.totalFlags}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Enabled</div>
          <div className="metric-value">
            <span className="chip chip-green">{flagsData.enabledCount}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Rolling Out (Beta)</div>
          <div className="metric-value">
            <span className="chip chip-amber">{flagsData.betaCount}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Disabled</div>
          <div className="metric-value">
            <span className="chip chip-red">{flagsData.disabledCount}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3>Feature Flags ({flagsData.flags.length})</h3>
        <div className="flags-list">
          {flagsData.flags.map((flag) => (
            <div key={flag.name} className="flag-item">
              <div className="flag-header" onClick={() => setExpandedFlagName(expandedFlagName === flag.name ? null : flag.name)} style={{ cursor: 'pointer' }}>
                <div className="flag-title-row">
                  <span className={`chip chip-${getStatusColor(flag.status)}`}>
                    {flag.status.toUpperCase()}
                  </span>
                  <h4>{flag.displayName}</h4>
                  <div className="badge-row">
                    {flag.badges.map((badge) => (
                      <span key={badge} className={`badge badge-${badge.toLowerCase()}`}>
                        [{badge}]
                      </span>
                    ))}
                    {flag.recentlyChanged && (
                      <span className="badge badge-changed" title="Recently changed">
                        <ConsoleIcon name="refresh" className="console-icon" style={{ fontSize: '0.75rem' }} />
                      </span>
                    )}
                  </div>
                  <span className="chip chip-violet">{flag.phase}</span>
                </div>

                <div className="flag-rollout">
                  <div className="progress-bar" style={{ minWidth: '150px' }}>
                    <div
                      className="progress-fill"
                      style={{
                        width: `${flag.rolloutPercentage}%`,
                        backgroundColor:
                          flag.rolloutPercentage === 100
                            ? '#00ff41'
                            : flag.rolloutPercentage >= 50
                            ? '#4a90e2'
                            : '#ffaa00'
                      }}
                    />
                  </div>
                  <span className="progress-text">{flag.rolloutPercentage}%</span>
                </div>
              </div>

              <div className="flag-details">
                <p className="flag-description">{flag.description}</p>

                {expandedFlagName === flag.name && (
                  <div className="flag-expanded">
                    <div className="flag-info-grid">
                      <div>
                        <strong>Created:</strong>
                        <div>{formatDate(flag.createdAt)}</div>
                      </div>
                      {flag.enabledAt && (
                        <div>
                          <strong>Enabled:</strong>
                          <div>{formatDate(flag.enabledAt)}</div>
                        </div>
                      )}
                      {flag.rolloutStartedAt && (
                        <div>
                          <strong>Rollout Started:</strong>
                          <div>{formatDate(flag.rolloutStartedAt)}</div>
                        </div>
                      )}
                      {flag.expectedCompletionDate && (
                        <div>
                          <strong>Expected Completion:</strong>
                          <div>{formatDate(flag.expectedCompletionDate)}</div>
                        </div>
                      )}
                      <div>
                        <strong>Users Affected:</strong>
                        <div>{flag.usersAffected}</div>
                      </div>
                    </div>

                    {flag.status === 'beta' && flag.rolloutPercentage < 100 && (
                      <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <h5>Adjust Rollout Percentage</h5>
                        <div className="rollout-slider-container">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={flag.rolloutPercentage}
                            onChange={(e) => updateFlagRollout(flag.name, parseInt(e.target.value))}
                            disabled={updatingFlag === flag.name}
                            className="rollout-slider"
                          />
                          <div className="slider-buttons">
                            {[10, 25, 50, 75, 100].map((percent) => (
                              <button
                                key={percent}
                                onClick={() => updateFlagRollout(flag.name, percent)}
                                disabled={updatingFlag === flag.name}
                                className="btn-slider"
                              >
                                {percent}%
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', padding: '0.75rem', backgroundColor: 'rgba(100,150,255,0.05)', borderRadius: '0.5rem' }}>
        <small style={{ color: 'rgba(255,255,255,0.6)' }}>
          Last updated: {new Date(flagsData.lastUpdated).toLocaleString()}
        </small>
      </div>
    </div>
  );
};
