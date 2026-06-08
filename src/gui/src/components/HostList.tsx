/**
 * Host List Component
 *
 * Table view of registered hosts with status badges and action buttons
 */

import React from 'react';
import { Host } from './HostManagement';
import './HostList.css';

interface HostListProps {
  hosts: Host[];
  onValidate: (host: Host) => void;
  onTest: (host: Host) => void;
  onConfigurePaths: (host: Host) => void;
  onEdit: (host: Host) => void;
  onDelete: (hostId: string) => void;
}

export const HostList: React.FC<HostListProps> = ({
  hosts,
  onValidate,
  onTest,
  onConfigurePaths,
  onEdit,
  onDelete
}) => {
  const getStatusBadgeStyle = (state?: string) => {
    const baseStyle: React.CSSProperties = {
      display: 'inline-block',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '500'
    };

    switch (state) {
      case 'Valid':
        return { ...baseStyle, backgroundColor: '#e8f5e9', color: '#2e7d32' };
      case 'Invalid':
        return { ...baseStyle, backgroundColor: '#ffebee', color: '#c62828' };
      case 'Pending':
        return { ...baseStyle, backgroundColor: '#fff3e0', color: '#e65100' };
      default:
        return { ...baseStyle, backgroundColor: '#f0f0f0', color: '#666' };
    }
  };

  if (hosts.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIcon}>🏢</div>
        <h3 style={styles.emptyTitle}>No Hosts Registered</h3>
        <p style={styles.emptyText}>
          Register your first remote host to manage infrastructure and enable distributed operations.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <table style={styles.table}>
        <thead>
          <tr style={styles.headerRow}>
            <th style={styles.th}>Host Name</th>
            <th style={styles.th}>FQDN</th>
            <th style={styles.th}>Access Method</th>
            <th style={styles.th}>Validation Status</th>
            <th style={styles.th}>Last Validated</th>
            <th style={styles.th}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {hosts.map((host) => (
            <tr key={host.id} style={styles.row}>
              <td style={styles.td}>
                <div style={styles.hostName}>{host.name}</div>
              </td>
              <td style={styles.td}>{host.fqdn}</td>
              <td style={styles.td}>
                <span style={styles.badge}>{host.accessMethod}</span>
              </td>
              <td style={styles.td}>
                <span style={getStatusBadgeStyle(host.validationState)}>
                  {host.validationState || 'Unknown'}
                </span>
              </td>
              <td style={styles.td}>
                <span style={styles.timestamp}>
                  {host.lastValidatedAt
                    ? new Date(host.lastValidatedAt).toLocaleDateString()
                    : 'Never'}
                </span>
              </td>
              <td style={styles.td}>
                <div style={styles.actionButtons}>
                  <button
                    onClick={() => onValidate(host)}
                    style={styles.actionButton}
                    title="Run validation checks"
                  >
                    ✓
                  </button>
                  <button
                    onClick={() => onTest(host)}
                    style={styles.actionButton}
                    title="Test connection"
                  >
                    ⚡
                  </button>
                  <button
                    onClick={() => onConfigurePaths(host)}
                    style={styles.actionButton}
                    title="Configure path mappings"
                  >
                    ⇄
                  </button>
                  <button
                    onClick={() => onEdit(host)}
                    style={styles.actionButton}
                    title="Edit host"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => onDelete(host.id)}
                    style={{ ...styles.actionButton, color: '#d32f2f' }}
                    title="Delete host"
                  >
                    ✕
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    overflowX: 'auto',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '14px'
  },
  headerRow: {
    backgroundColor: '#f5f5f5',
    borderBottom: '2px solid #e0e0e0'
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left',
    fontWeight: '600',
    color: '#333'
  },
  row: {
    borderBottom: '1px solid #f0f0f0',
    transition: 'background-color 0.2s'
  },
  td: {
    padding: '12px 16px',
    verticalAlign: 'middle'
  },
  hostName: {
    fontWeight: '500',
    color: '#222'
  },
  badge: {
    display: 'inline-block',
    padding: '4px 8px',
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500'
  },
  timestamp: {
    color: '#999',
    fontSize: '12px'
  },
  actionButtons: {
    display: 'flex',
    gap: '4px'
  },
  actionButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 8px',
    color: '#666',
    transition: 'color 0.2s',
    borderRadius: '4px'
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 20px',
    backgroundColor: 'white',
    borderRadius: '8px',
    textAlign: 'center'
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  emptyTitle: {
    margin: '0 0 8px 0',
    fontSize: '18px',
    fontWeight: '600',
    color: '#333'
  },
  emptyText: {
    margin: '0',
    color: '#666',
    fontSize: '14px',
    maxWidth: '400px'
  }
};

export default HostList;
