/**
 * ValidationFindings Component
 *
 * Displays validation findings grouped by severity
 * Shows affected components and other metadata
 */

import React from 'react';
import { ValidationFinding } from '../services/api';
import './ValidationFindings.css';

interface ValidationFindingsProps {
  findings: ValidationFinding[];
  validatedAt?: string;
  duration?: {
    elapsedMs: number;
  };
  status?: 'Healthy' | 'Unhealthy' | 'Pending';
}

export const ValidationFindings: React.FC<ValidationFindingsProps> = ({
  findings,
  validatedAt,
  duration,
  status = 'Pending'
}) => {
  const errors = findings.filter(f => f.severity === 'Error');
  const warnings = findings.filter(f => f.severity === 'Warning');
  const infos = findings.filter(f => f.severity === 'Info');

  const formatTime = (timestamp?: string) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleString();
    } catch {
      return timestamp;
    }
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getStatusIcon = (severity: string) => {
    switch (severity) {
      case 'Error':
        return '✕';
      case 'Warning':
        return '⚠';
      case 'Info':
        return 'ℹ';
      default:
        return '•';
    }
  };

  const renderFindingGroup = (
    title: string,
    items: ValidationFinding[],
    color: string
  ) => {
    if (items.length === 0) return null;

    return (
      <div key={title} style={styles.group}>
        <div
          style={{
            ...styles.groupHeader,
            borderLeftColor: color,
            backgroundColor: `${color}08`
          }}
        >
          <span style={{ color, fontSize: '18px', marginRight: '8px' }}>
            {getStatusIcon(title)}
          </span>
          <span style={{ fontWeight: '600', color }}>{title}s</span>
          <span style={{ marginLeft: '8px', color: '#999', fontSize: '12px' }}>
            ({items.length})
          </span>
        </div>
        <div style={styles.findingsList}>
          {items.map((finding, idx) => (
            <div key={`${title}-${idx}`} style={styles.findingItem}>
              <div style={styles.findingCode}>{finding.code}</div>
              <div style={styles.findingMessage}>{finding.message}</div>
              {finding.affectedComponents && finding.affectedComponents.length > 0 && (
                <div style={styles.affectedComponents}>
                  <span style={{ fontSize: '12px', color: '#666', marginRight: '4px' }}>
                    Affected:
                  </span>
                  {finding.affectedComponents.map((comp, i) => (
                    <span
                      key={`${title}-${idx}-${i}`}
                      style={{
                        display: 'inline-block',
                        backgroundColor: '#f0f0f0',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        fontSize: '11px',
                        marginRight: '4px',
                        marginTop: '4px'
                      }}
                    >
                      {comp}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {validatedAt && (
        <div style={styles.metadata}>
          <div style={styles.metadataItem}>
            <span style={styles.metadataLabel}>Validated:</span>
            <span style={styles.metadataValue}>{formatTime(validatedAt)}</span>
          </div>
          {duration && (
            <div style={styles.metadataItem}>
              <span style={styles.metadataLabel}>Duration:</span>
              <span style={styles.metadataValue}>{formatDuration(duration.elapsedMs)}</span>
            </div>
          )}
          {status && (
            <div style={styles.metadataItem}>
              <span style={styles.metadataLabel}>Status:</span>
              <span
                style={{
                  ...styles.metadataValue,
                  color: status === 'Healthy' ? '#2e7d32' : '#d32f2f'
                }}
              >
                {status}
              </span>
            </div>
          )}
        </div>
      )}

      {findings.length === 0 ? (
        <div style={styles.noFindings}>
          <div style={styles.noFindingsIcon}>✓</div>
          <div style={styles.noFindingsText}>No issues found</div>
        </div>
      ) : (
        <>
          {renderFindingGroup('Error', errors, '#d32f2f')}
          {renderFindingGroup('Warning', warnings, '#f57c00')}
          {renderFindingGroup('Info', infos, '#1976d2')}
        </>
      )}
    </div>
  );
};

const styles = {
  container: {
    padding: '12px',
    backgroundColor: '#fff',
    borderRadius: '4px'
  } as React.CSSProperties,
  metadata: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    gap: '16px',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #e0e0e0'
  } as React.CSSProperties,
  metadataItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  } as React.CSSProperties,
  metadataLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#666'
  } as React.CSSProperties,
  metadataValue: {
    fontSize: '13px',
    color: '#333'
  } as React.CSSProperties,
  group: {
    marginBottom: '12px'
  } as React.CSSProperties,
  groupHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    borderLeft: '3px solid',
    borderRadius: '2px'
  } as React.CSSProperties,
  findingsList: {
    paddingLeft: '12px'
  } as React.CSSProperties,
  findingItem: {
    padding: '8px 0',
    borderBottom: '1px solid #f0f0f0'
  } as React.CSSProperties,
  findingCode: {
    fontSize: '12px',
    fontWeight: '600',
    fontFamily: 'monospace',
    color: '#333'
  } as React.CSSProperties,
  findingMessage: {
    fontSize: '13px',
    color: '#666',
    marginTop: '4px'
  } as React.CSSProperties,
  affectedComponents: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center'
  } as React.CSSProperties,
  noFindings: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    color: '#2e7d32',
    textAlign: 'center'
  } as React.CSSProperties,
  noFindingsIcon: {
    fontSize: '32px',
    marginBottom: '8px'
  } as React.CSSProperties,
  noFindingsText: {
    fontSize: '14px',
    fontWeight: '500'
  } as React.CSSProperties
};
