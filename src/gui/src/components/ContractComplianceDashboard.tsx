import React, { useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/Dashboard.css';
import { ConsoleIcon } from './ConsoleIcon';

interface ContractTest {
  name: string;
  status: 'passing' | 'failing' | 'warning';
  message: string;
  lastChecked: string;
}

interface ComplianceStatus {
  overallCompliance: 'compliant' | 'non-compliant' | 'warning';
  compliancePercentage: number;
  testsPassing: number;
  testsFailing: number;
  testsWarning: number;
  contractTests: ContractTest[];
  contractViolations: string[];
  lastComplianceCheck: string;
  nextScheduledCheck: string;
}

export const ContractComplianceDashboard: React.FC = () => {
  const [compliance, setCompliance] = useState<ComplianceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = '/api';

  useEffect(() => {
    loadComplianceStatus();
    const interval = setInterval(loadComplianceStatus, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  const loadComplianceStatus = async () => {
    try {
      setError(null);
      const response = await axios.get(`${API_BASE}/contracts/compliance`);

      if (response.data.success) {
        setCompliance(response.data.data);
      } else {
        setError(response.data.message || 'Failed to load compliance status');
      }
    } catch (err: any) {
      setError(`Failed to load compliance status: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const getComplianceColor = (status: string): string => {
    switch (status) {
      case 'compliant':
        return 'green';
      case 'non-compliant':
        return 'red';
      case 'warning':
        return 'amber';
      default:
        return 'cyan';
    }
  };

  const getTestStatusColor = (status: string): string => {
    switch (status) {
      case 'passing':
        return 'green';
      case 'failing':
        return 'red';
      case 'warning':
        return 'amber';
      default:
        return 'cyan';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
  };

  if (loading) {
    return (
      <div className="section">
        <div className="panel-header">
          <div>
            <div className="panel-kicker">System Health</div>
            <h2>Contract Compliance</h2>
            <p className="workflow-help">Provider contract compliance and test results.</p>
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

  if (!compliance) {
    return (
      <div className="section">
        <div className="error-alert">
          <p>{error || 'Failed to load compliance status'}</p>
        </div>
      </div>
    );
  }

  const complianceColor = getComplianceColor(compliance.overallCompliance);

  return (
    <div className="section">
      <div className="panel-header">
        <div>
          <div className="panel-kicker">System Health</div>
          <h2>Contract Compliance</h2>
          <p className="workflow-help">Provider contract compliance and test results. Last checked: {formatTimeAgo(compliance.lastComplianceCheck)}</p>
        </div>
        <div className="chip-row">
          <span className={`chip chip-${complianceColor}`}>{compliance.overallCompliance.toUpperCase()}</span>
          <span className="chip chip-violet">{compliance.compliancePercentage.toFixed(1)}%</span>
        </div>
      </div>

      {error && (
        <div className="error-alert">
          <p className="btn-icon"><ConsoleIcon name="warning" className="console-icon" />{error}</p>
        </div>
      )}

      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-label">Tests Passing</div>
          <div className="metric-value">
            <span className="chip chip-green">{compliance.testsPassing}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Tests Failing</div>
          <div className="metric-value">
            <span className="chip chip-red">{compliance.testsFailing}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Tests Warning</div>
          <div className="metric-value">
            <span className="chip chip-amber">{compliance.testsWarning}</span>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Compliance Score</div>
          <div className="metric-value">
            <span className={`chip chip-${complianceColor}`}>{compliance.compliancePercentage.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {compliance.contractViolations.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3>Contract Violations</h3>
          <div className="violation-list">
            {compliance.contractViolations.map((violation, index) => (
              <div key={index} className="violation-item">
                <ConsoleIcon name="warning" className="console-icon" />
                <span>{violation}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        <h3>Contract Tests ({compliance.contractTests.length})</h3>
        <div className="test-list">
          {compliance.contractTests.map((test, index) => (
            <div key={index} className="test-item">
              <div className="test-header">
                <span className={`chip chip-${getTestStatusColor(test.status)}`}>
                  <ConsoleIcon
                    name={test.status === 'passing' ? 'check' : test.status === 'failing' ? 'cross' : 'warning'}
                    className="console-icon"
                  />
                  {test.status.toUpperCase()}
                </span>
                <span className="test-name">{test.name}</span>
              </div>
              <div className="test-details">
                <p>{test.message}</p>
                <small>Last checked: {formatTimeAgo(test.lastChecked)}</small>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', padding: '0.75rem', backgroundColor: 'rgba(100,150,255,0.05)', borderRadius: '0.5rem' }}>
        <small style={{ color: 'rgba(255,255,255,0.6)' }}>
          Next scheduled check: {formatDate(compliance.nextScheduledCheck)}
        </small>
      </div>
    </div>
  );
};
