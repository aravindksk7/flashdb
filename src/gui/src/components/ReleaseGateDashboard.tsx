import React, { useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/Dashboard.css';
import '../styles/InfrastructureDashboards.css';
import { ConsoleIcon } from './ConsoleIcon';

interface ChecklistItem {
  name: string;
  completed: boolean;
  completedAt?: string;
}

interface Timeline {
  planned: string;
  actual?: string;
  status: 'on-track' | 'delayed' | 'completed';
}

interface ReleaseGate {
  id: string;
  name: string;
  status: 'blocked' | 'open' | 'closing' | 'closed';
  blockingFactors: string[];
  checklist: ChecklistItem[];
  checklistProgress: number;
  blockedSince?: string;
  estimatedOpenTime?: string;
  timeline: Timeline;
  dependencies: string[];
  owner: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

interface ReleaseGatesStatus {
  totalGates: number;
  openGates: number;
  blockedGates: number;
  closedGates: number;
  overallStatus: 'on-track' | 'at-risk' | 'blocked';
  gates: ReleaseGate[];
  summary: string;
  lastUpdated: string;
}

export const ReleaseGateDashboard: React.FC = () => {
  const [gatesStatus, setGatesStatus] = useState<ReleaseGatesStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGateId, setExpandedGateId] = useState<string | null>(null);

  const API_BASE = '/api';

  useEffect(() => {
    loadGatesStatus();
    const interval = setInterval(loadGatesStatus, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadGatesStatus = async () => {
    try {
      setError(null);
      const response = await axios.get(`${API_BASE}/release-gates/status`);

      if (response.data.success) {
        setGatesStatus(response.data.data);
      } else {
        setError(response.data.message || 'Failed to load release gates');
      }
    } catch (err: any) {
      setError(`Failed to load release gates: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'closed':
        return 'green';
      case 'open':
        return 'cyan';
      case 'closing':
        return 'amber';
      case 'blocked':
        return 'red';
      default:
        return 'violet';
    }
  };

  const getPriorityColor = (priority: string): string => {
    switch (priority) {
      case 'critical':
        return 'red';
      case 'high':
        return 'amber';
      case 'medium':
        return 'cyan';
      case 'low':
        return 'violet';
      default:
        return 'cyan';
    }
  };

  const getOverallStatusColor = (status: string): string => {
    switch (status) {
      case 'on-track':
        return 'green';
      case 'at-risk':
        return 'amber';
      case 'blocked':
        return 'red';
      default:
        return 'cyan';
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
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  if (loading) {
    return (
      <div className="section">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">Release Management</div>
            <h2>Release Gates</h2>
            <p className="workflow-help">Monitor release gate progress and blocking factors.</p>
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

  if (!gatesStatus) {
    return (
      <div className="section">
        <div className="error-alert">
          <p>{error || 'Failed to load release gates'}</p>
        </div>
      </div>
    );
  }

  const overallColor = getOverallStatusColor(gatesStatus.overallStatus);

  return (
    <div className="section">
      <div className="panel-header">
        <div>
          <div className="panel-kicker">Release Management</div>
          <h2>Release Gates</h2>
          <p className="workflow-help">{gatesStatus.summary}</p>
        </div>
        <div className="chip-row">
          <span className={`chip chip-${overallColor}`}>{gatesStatus.overallStatus.toUpperCase()}</span>
          <span className="chip chip-cyan">{gatesStatus.totalGates} gates</span>
        </div>
      </div>

      {error && (
        <div className="error-alert">
          <p className="btn-icon"><ConsoleIcon name="warning" className="console-icon" />{error}</p>
        </div>
      )}

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Closed Gates</div>
          <div className="metric-value">
            <span className="chip chip-green">{gatesStatus.closedGates}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Open Gates</div>
          <div className="metric-value">
            <span className="chip chip-cyan">{gatesStatus.openGates}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Blocked Gates</div>
          <div className="metric-value">
            <span className="chip chip-red">{gatesStatus.blockedGates}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Overall Status</div>
          <div className="metric-value">
            <span className={`chip chip-${overallColor}`}>{gatesStatus.overallStatus}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <h3>Release Gate Details</h3>
        <div className="gates-list">
          {gatesStatus.gates.map((gate) => (
            <div key={gate.id} className="gate-item">
              <div className="gate-header" onClick={() => setExpandedGateId(expandedGateId === gate.id ? null : gate.id)} style={{ cursor: 'pointer' }}>
                <div className="gate-title-row">
                  <span className={`chip chip-${getStatusColor(gate.status)}`}>
                    {gate.status.toUpperCase()}
                  </span>
                  <h4>{gate.name}</h4>
                  <span className={`chip chip-${getPriorityColor(gate.priority)}`}>
                    {gate.priority.toUpperCase()}
                  </span>
                </div>
                <div className="gate-progress-bar">
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${gate.checklistProgress}%`,
                        backgroundColor: gate.checklistProgress === 100 ? '#00ff41' : gate.checklistProgress >= 70 ? '#4a90e2' : '#ffaa00'
                      }}
                    />
                  </div>
                  <span className="progress-text">{gate.checklistProgress}%</span>
                </div>
              </div>

              <div className="gate-details">
                <div className="gate-meta">
                  <div><strong>Owner:</strong> {gate.owner}</div>
                  <div><strong>Planned:</strong> {formatDate(gate.timeline.planned)}</div>
                  {gate.timeline.actual && <div><strong>Actual:</strong> {formatDate(gate.timeline.actual)}</div>}
                  <div><strong>Status:</strong> {gate.timeline.status}</div>
                </div>

                {expandedGateId === gate.id && (
                  <div className="gate-expanded">
                    {gate.blockingFactors.length > 0 && (
                      <div style={{ marginTop: '1rem' }}>
                        <h5>Blocking Factors</h5>
                        <ul className="blocking-list">
                          {gate.blockingFactors.map((factor, index) => (
                            <li key={index}>
                              <ConsoleIcon name="warning" className="console-icon" />
                              {factor}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div style={{ marginTop: '1rem' }}>
                      <h5>Checklist ({gate.checklist.filter(c => c.completed).length}/{gate.checklist.length})</h5>
                      <ul className="checklist">
                        {gate.checklist.map((item, index) => (
                          <li key={index} className={item.completed ? 'completed' : ''}>
                            <ConsoleIcon
                              name={item.completed ? 'check' : 'cross'}
                              className="console-icon"
                            />
                            {item.name}
                            {item.completedAt && (
                              <small style={{ marginLeft: '0.5rem', opacity: 0.7 }}>
                                ({formatTimeAgo(item.completedAt)})
                              </small>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {gate.dependencies.length > 0 && (
                      <div style={{ marginTop: '1rem' }}>
                        <h5>Dependencies</h5>
                        <div className="dependency-list">
                          {gate.dependencies.map((dep, index) => (
                            <span key={index} className="chip chip-violet">{dep}</span>
                          ))}
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
          Last updated: {new Date(gatesStatus.lastUpdated).toLocaleString()}
        </small>
      </div>
    </div>
  );
};
