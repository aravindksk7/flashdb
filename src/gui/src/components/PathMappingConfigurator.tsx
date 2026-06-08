/**
 * Path Mapping Configurator Component
 *
 * Configure UNC to local path mappings for remote host file access
 */

import React, { useState, useEffect } from 'react';
import { Host } from './HostManagement';
import './PathMappingConfigurator.css';

interface PathMappingConfiguratorProps {
  isOpen: boolean;
  host: Host;
  onClose: () => void;
  onSave: (pathMappings: Record<string, string>) => void;
}

interface PathMapping {
  id: string;
  uncPath: string;
  localPath: string;
}

export const PathMappingConfigurator: React.FC<PathMappingConfiguratorProps> = ({
  isOpen,
  host,
  onClose,
  onSave
}) => {
  const [mappings, setMappings] = useState<PathMapping[]>([]);
  const [newMapping, setNewMapping] = useState({ uncPath: '', localPath: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && host.pathMappings) {
      const mappingsArray = Object.entries(host.pathMappings).map(
        ([uncPath, localPath], idx) => ({
          id: `existing-${idx}`,
          uncPath,
          localPath
        })
      );
      setMappings(mappingsArray);
      setNewMapping({ uncPath: '', localPath: '' });
      setError(null);
    }
  }, [isOpen, host]);

  const handleAddMapping = () => {
    if (!newMapping.uncPath.trim() || !newMapping.localPath.trim()) {
      setError('Both UNC path and local path are required');
      return;
    }

    if (!newMapping.uncPath.startsWith('\\\\')) {
      setError('UNC path must start with \\\\');
      return;
    }

    const duplicate = mappings.some(m => m.uncPath === newMapping.uncPath);
    if (duplicate) {
      setError('This UNC path is already mapped');
      return;
    }

    setMappings([
      ...mappings,
      {
        id: `new-${Date.now()}`,
        ...newMapping
      }
    ]);
    setNewMapping({ uncPath: '', localPath: '' });
    setError(null);
  };

  const handleRemoveMapping = (id: string) => {
    setMappings(mappings.filter(m => m.id !== id));
  };

  const handleSave = () => {
    const pathMappingsObj: Record<string, string> = {};
    mappings.forEach(m => {
      pathMappingsObj[m.uncPath] = m.localPath;
    });
    onSave(pathMappingsObj);
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <h2 style={styles.title}>
            Path Mappings - {host.name}
          </h2>
          <button onClick={onClose} style={styles.closeButton}>
            ×
          </button>
        </div>

        <div style={styles.content}>
          <p style={styles.description}>
            Configure UNC path to local path mappings for accessing remote storage.
            Example: \\server\share → D:\data
          </p>

          {/* Add New Mapping */}
          <div style={styles.addMappingSection}>
            <h3 style={styles.sectionTitle}>Add New Mapping</h3>

            {error && (
              <div style={styles.errorBox}>{error}</div>
            )}

            <div style={styles.mappingInputs}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>UNC Path</label>
                <input
                  type="text"
                  value={newMapping.uncPath}
                  onChange={(e) =>
                    setNewMapping({ ...newMapping, uncPath: e.target.value })
                  }
                  placeholder="e.g., \\\\server\\share"
                  style={styles.input}
                />
                <p style={styles.hint}>Network path in UNC format</p>
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Local Path</label>
                <input
                  type="text"
                  value={newMapping.localPath}
                  onChange={(e) =>
                    setNewMapping({ ...newMapping, localPath: e.target.value })
                  }
                  placeholder="e.g., D:\\data"
                  style={styles.input}
                />
                <p style={styles.hint}>Local directory path on remote host</p>
              </div>

              <button
                onClick={handleAddMapping}
                style={styles.addButton}
              >
                Add Mapping
              </button>
            </div>
          </div>

          {/* Current Mappings */}
          {mappings.length > 0 && (
            <div style={styles.mappingsListSection}>
              <h3 style={styles.sectionTitle}>
                Current Mappings ({mappings.length})
              </h3>
              <div style={styles.mappingsList}>
                {mappings.map((mapping) => (
                  <div key={mapping.id} style={styles.mappingItem}>
                    <div style={styles.mappingContent}>
                      <div style={styles.mappingPaths}>
                        <code style={styles.uncPath}>
                          {mapping.uncPath}
                        </code>
                        <span style={styles.arrow}>→</span>
                        <code style={styles.localPath}>
                          {mapping.localPath}
                        </code>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveMapping(mapping.id)}
                      style={styles.removeButton}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mappings.length === 0 && (
            <div style={styles.emptyState}>
              <p style={styles.emptyText}>
                No path mappings configured yet
              </p>
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button
            onClick={handleSave}
            style={styles.primaryButton}
          >
            Save Mappings
          </button>
          <button
            onClick={onClose}
            style={styles.secondaryButton}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '8px',
    maxWidth: '600px',
    width: '90%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    borderBottom: '1px solid #f0f0f0'
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: '#222'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: '#999',
    cursor: 'pointer'
  },
  content: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto'
  },
  description: {
    margin: '0 0 20px 0',
    fontSize: '13px',
    color: '#666',
    lineHeight: '1.5'
  },
  addMappingSection: {
    marginBottom: '24px'
  },
  sectionTitle: {
    margin: '0 0 16px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333'
  },
  errorBox: {
    padding: '12px',
    backgroundColor: '#ffebee',
    border: '1px solid #ef5350',
    borderRadius: '4px',
    color: '#c62828',
    fontSize: '12px',
    marginBottom: '16px'
  },
  mappingInputs: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column'
  },
  label: {
    marginBottom: '4px',
    fontSize: '12px',
    fontWeight: '600',
    color: '#333'
  },
  input: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '13px',
    fontFamily: 'monospace'
  },
  hint: {
    margin: '4px 0 0 0',
    fontSize: '11px',
    color: '#999'
  },
  addButton: {
    padding: '8px 16px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    marginTop: '4px'
  },
  mappingsListSection: {
    marginTop: '24px'
  },
  mappingsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  mappingItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    backgroundColor: '#f9f9f9',
    border: '1px solid #eee',
    borderRadius: '4px'
  },
  mappingContent: {
    flex: 1
  },
  mappingPaths: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px'
  },
  uncPath: {
    padding: '2px 6px',
    backgroundColor: '#f0f0f0',
    borderRadius: '3px',
    fontFamily: 'monospace'
  },
  arrow: {
    color: '#999'
  },
  localPath: {
    padding: '2px 6px',
    backgroundColor: '#f0f0f0',
    borderRadius: '3px',
    fontFamily: 'monospace'
  },
  removeButton: {
    background: 'none',
    border: 'none',
    color: '#d32f2f',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 8px'
  },
  emptyState: {
    textAlign: 'center',
    padding: '20px'
  },
  emptyText: {
    margin: 0,
    color: '#999',
    fontSize: '13px'
  },
  footer: {
    display: 'flex',
    gap: '12px',
    padding: '20px',
    borderTop: '1px solid #f0f0f0',
    justifyContent: 'flex-end'
  },
  primaryButton: {
    padding: '10px 16px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500'
  },
  secondaryButton: {
    padding: '10px 16px',
    backgroundColor: '#f5f5f5',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '14px'
  }
};

export default PathMappingConfigurator;
