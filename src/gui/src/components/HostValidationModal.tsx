/**
 * Host Validation Modal Component
 *
 * Modal for validating host connectivity and capabilities
 * States: idle → validating → completed/error
 */

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ValidationFindings } from './ValidationFindings';
import './HostValidationModal.css';

const API_BASE = '/api';

interface ValidationResult {
  hostId: string;
  isValid: boolean;
  findings: Array<{
    severity: 'Info' | 'Warning' | 'Error';
    code: string;
    message: string;
    details?: Record<string, any>;
  }>;
  capabilities: string[];
  validatedAt: string;
}

interface HostValidationModalProps {
  hostId: string;
  hostName: string;
  isOpen: boolean;
  onClose: () => void;
  onValidationComplete?: () => void;
}

export const HostValidationModal: React.FC<HostValidationModalProps> = ({
  hostId,
  hostName,
  isOpen,
  onClose,
  onValidationComplete
}) => {
  const [state, setState] = useState<'idle' | 'loading' | 'completed' | 'error'>('idle');
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setState('idle');
      setResult(null);
      setError(null);
    }
  }, [isOpen]);

  const handleValidate = async () => {
    setState('loading');
    setError(null);
    setResult(null);

    try {
      const response = await axios.post(`${API_BASE}/hosts/${hostId}/validate`);
      if (response.data.success) {
        setResult(response.data.data);
        setState('completed');
        onValidationComplete?.();
      } else {
        setError(response.data.message || 'Validation failed');
        setState('error');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Validation request failed');
      setState('error');
    }
  };

  if (!isOpen) return null;

  const isHealthy = result?.isValid === true;
  const hasFindings = result?.findings && result.findings.length > 0;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Validate Host: {hostName}</h2>
          <button
            onClick={onClose}
            style={styles.closeButton}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {state === 'idle' && (
            <div style={styles.idleState}>
              <div style={styles.idleIcon}>✓</div>
              <p style={styles.idleText}>
                Click "Validate" to perform connectivity and capability checks on {hostName}.
              </p>
              <p style={styles.idleSubtext}>
                Validation will test WinRM/SSH connectivity, PowerShell module availability, SQL Server reachability, and UNC path accessibility.
              </p>
            </div>
          )}

          {state === 'loading' && (
            <div style={styles.loadingState}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Validating host...</p>
              <p style={styles.loadingSubtext}>This may take a minute</p>
            </div>
          )}

          {state === 'completed' && result && (
            <div style={styles.completedState}>
              <div
                style={{
                  ...styles.statusBanner,
                  backgroundColor: isHealthy ? '#e8f5e9' : '#ffebee',
                  borderLeftColor: isHealthy ? '#2e7d32' : '#d32f2f'
                }}
              >
                <div
                  style={{
                    fontSize: '24px',
                    marginRight: '12px',
                    color: isHealthy ? '#2e7d32' : '#d32f2f'
                  }}
                >
                  {isHealthy ? '✓' : '✕'}
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: '600',
                      fontSize: '16px',
                      color: isHealthy ? '#2e7d32' : '#d32f2f'
                    }}
                  >
                    {isHealthy ? 'Host is Healthy' : 'Host Validation Failed'}
                  </div>
                  {result.capabilities.length > 0 && (
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                      Capabilities: {result.capabilities.join(', ')}
                    </div>
                  )}
                </div>
              </div>

              {hasFindings && (
                <div style={styles.findingsContainer}>
                  <h3 style={styles.findingsTitle}>
                    Findings ({result.findings.length})
                  </h3>
                  <ValidationFindings findings={result.findings} />
                </div>
              )}

              <div style={styles.timestamp}>
                Validated: {new Date(result.validatedAt).toLocaleString()}
              </div>
            </div>
          )}

          {state === 'error' && (
            <div style={styles.errorState}>
              <div style={styles.errorIcon}>✕</div>
              <p style={styles.errorText}>{error}</p>
              <p style={styles.errorSubtext}>
                Please verify the host is accessible and try again.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          {(state === 'idle' || state === 'error') && (
            <button
              onClick={handleValidate}
              style={styles.primaryButton}
            >
              Validate Host
            </button>
          )}
          {state === 'completed' && (
            <button
              onClick={handleValidate}
              style={styles.secondaryButton}
            >
              Re-validate
            </button>
          )}
          <button
            onClick={onClose}
            style={styles.closeModalButton}
          >
            Close
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
    cursor: 'pointer',
    padding: '0',
    width: '30px',
    height: '30px'
  },
  content: {
    flex: 1,
    padding: '20px',
    overflowY: 'auto'
  },
  idleState: {
    textAlign: 'center',
    padding: '20px'
  },
  idleIcon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  idleText: {
    margin: '0 0 8px 0',
    fontSize: '16px',
    fontWeight: '500',
    color: '#333'
  },
  idleSubtext: {
    margin: '0',
    fontSize: '13px',
    color: '#666',
    lineHeight: '1.5'
  },
  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #f0f0f0',
    borderTop: '4px solid #2196F3',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px'
  },
  loadingText: {
    margin: '0 0 4px 0',
    fontSize: '16px',
    fontWeight: '500',
    color: '#333'
  },
  loadingSubtext: {
    margin: '0',
    fontSize: '12px',
    color: '#666'
  },
  completedState: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  statusBanner: {
    display: 'flex',
    padding: '16px',
    borderRadius: '4px',
    borderLeft: '4px solid'
  },
  findingsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  findingsTitle: {
    margin: '0 0 8px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333'
  },
  timestamp: {
    fontSize: '12px',
    color: '#999',
    textAlign: 'center'
  },
  errorState: {
    textAlign: 'center',
    padding: '20px'
  },
  errorIcon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  errorText: {
    margin: '0 0 8px 0',
    fontSize: '16px',
    fontWeight: '500',
    color: '#d32f2f'
  },
  errorSubtext: {
    margin: '0',
    fontSize: '13px',
    color: '#666'
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
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  secondaryButton: {
    padding: '10px 16px',
    backgroundColor: '#f5f5f5',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer'
  },
  closeModalButton: {
    padding: '10px 16px',
    backgroundColor: 'white',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer'
  }
};

export default HostValidationModal;
