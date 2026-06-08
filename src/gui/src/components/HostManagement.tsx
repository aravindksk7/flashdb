/**
 * Host Management Component
 *
 * Main container for remote host infrastructure management
 * Manages host registration, validation, testing, and lifecycle
 */

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { HostList } from './HostList';
import { AddHostForm } from './AddHostForm';
import { HostValidationModal } from './HostValidationModal';
import { ConnectionTestPanel } from './ConnectionTestPanel';
import { PathMappingConfigurator } from './PathMappingConfigurator';
import './HostManagement.css';

const API_BASE = '/api';

export interface Host {
  id: string;
  name: string;
  fqdn: string;
  accessMethod: 'Local' | 'WinRM' | 'SSH';
  sqlInstances?: string[];
  pathMappings?: Record<string, string>;
  credentialReference?: string;
  lastValidatedAt?: string;
  validationState?: 'Pending' | 'Valid' | 'Invalid' | 'Unknown';
}

interface HostManagementProps {
  onHostsUpdated?: () => void;
}

type View = 'list' | 'add' | 'edit' | 'test';

export const HostManagement: React.FC<HostManagementProps> = ({ onHostsUpdated }) => {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [testPanelOpen, setTestPanelOpen] = useState(false);
  const [pathMappingOpen, setPathMappingOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchHosts();
  }, [refreshKey]);

  const fetchHosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get(`${API_BASE}/hosts`);
      const data = Array.isArray(response.data.data) ? response.data.data : [];
      setHosts(data);
    } catch (err: any) {
      console.error('Failed to fetch hosts', err);
      setError(err.response?.data?.message || 'Failed to load hosts');
    } finally {
      setLoading(false);
    }
  };

  const handleAddHost = async (hostData: Omit<Host, 'id' | 'lastValidatedAt' | 'validationState'>) => {
    try {
      const response = await axios.post(`${API_BASE}/hosts`, hostData);
      if (response.data.success) {
        setView('list');
        setRefreshKey(prev => prev + 1);
        onHostsUpdated?.();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to add host');
    }
  };

  const handleUpdateHost = async (hostId: string, updates: Partial<Host>) => {
    try {
      const response = await axios.put(`${API_BASE}/hosts/${hostId}`, updates);
      if (response.data.success) {
        setView('list');
        setSelectedHost(null);
        setRefreshKey(prev => prev + 1);
        onHostsUpdated?.();
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update host');
    }
  };

  const handleDeleteHost = async (hostId: string) => {
    if (window.confirm('Are you sure you want to delete this host?')) {
      try {
        await axios.delete(`${API_BASE}/hosts/${hostId}`);
        setRefreshKey(prev => prev + 1);
        onHostsUpdated?.();
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to delete host');
      }
    }
  };

  const handleValidateHost = (host: Host) => {
    setSelectedHost(host);
    setValidationModalOpen(true);
  };

  const handleTestConnection = (host: Host) => {
    setSelectedHost(host);
    setTestPanelOpen(true);
  };

  const handleConfigurePathMapping = (host: Host) => {
    setSelectedHost(host);
    setPathMappingOpen(true);
  };

  const handleValidationComplete = () => {
    setValidationModalOpen(false);
    setRefreshKey(prev => prev + 1);
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingState}>
          <div style={styles.spinner}></div>
          <p>Loading hosts...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Infrastructure - Remote Hosts</h2>
          <p style={styles.subtitle}>
            Register and manage remote hosts for distributed database operations
          </p>
        </div>
        <button
          onClick={() => setView(view === 'list' ? 'add' : 'list')}
          style={styles.primaryButton}
        >
          {view === 'list' ? '+ Register Host' : 'View Hosts'}
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div style={styles.errorBanner}>
          <span>⚠ {error}</span>
          <button
            onClick={() => setError(null)}
            style={styles.closeErrorButton}
          >
            ×
          </button>
        </div>
      )}

      {/* View Content */}
      {view === 'list' ? (
        <HostList
          hosts={hosts}
          onValidate={handleValidateHost}
          onTest={handleTestConnection}
          onConfigurePaths={handleConfigurePathMapping}
          onEdit={(host) => {
            setSelectedHost(host);
            setView('edit');
          }}
          onDelete={handleDeleteHost}
        />
      ) : view === 'add' ? (
        <AddHostForm
          onSubmit={handleAddHost}
          onCancel={() => setView('list')}
        />
      ) : view === 'edit' && selectedHost ? (
        <AddHostForm
          initialData={selectedHost}
          onSubmit={(data) => handleUpdateHost(selectedHost.id, data)}
          onCancel={() => {
            setView('list');
            setSelectedHost(null);
          }}
          isEditing={true}
        />
      ) : null}

      {/* Validation Modal */}
      {selectedHost && (
        <HostValidationModal
          hostId={selectedHost.id}
          hostName={selectedHost.name}
          isOpen={validationModalOpen}
          onClose={() => setValidationModalOpen(false)}
          onValidationComplete={handleValidationComplete}
        />
      )}

      {/* Connection Test Panel */}
      {selectedHost && (
        <ConnectionTestPanel
          isOpen={testPanelOpen}
          initialHost={selectedHost}
          onClose={() => setTestPanelOpen(false)}
          onTestResult={() => {
            setTestPanelOpen(false);
            setRefreshKey(prev => prev + 1);
          }}
        />
      )}

      {/* Path Mapping Configurator */}
      {selectedHost && (
        <PathMappingConfigurator
          isOpen={pathMappingOpen}
          host={selectedHost}
          onClose={() => setPathMappingOpen(false)}
          onSave={(pathMappings) => {
            handleUpdateHost(selectedHost.id, { pathMappings });
            setPathMappingOpen(false);
          }}
        />
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    padding: '20px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px',
    marginTop: '10px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px'
  },
  title: {
    margin: '0 0 5px 0',
    fontSize: '24px',
    fontWeight: '600',
    color: '#222'
  },
  subtitle: {
    margin: '0',
    fontSize: '13px',
    color: '#666'
  },
  primaryButton: {
    padding: '10px 16px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s'
  },
  errorBanner: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#ffebee',
    border: '1px solid #ef5350',
    borderRadius: '4px',
    marginBottom: '20px',
    color: '#c62828',
    fontSize: '14px'
  },
  closeErrorButton: {
    background: 'none',
    border: 'none',
    color: '#c62828',
    cursor: 'pointer',
    fontSize: '20px',
    padding: '0 4px'
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    color: '#666'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f0f0f0',
    borderTop: '4px solid #2196F3',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '20px'
  }
};

export default HostManagement;
