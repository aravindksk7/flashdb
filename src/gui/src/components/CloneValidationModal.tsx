/**
 * CloneValidationModal Component
 *
 * Modal for validation trigger and results display
 * States: idle → validating → completed/error
 */

import React, { useEffect } from 'react';
import { useValidation } from '../hooks/useValidation';
import type { ValidationResult } from '../services/api';
import { ValidationFindings } from './ValidationFindings';
import './CloneValidationModal.css';

interface CloneValidationModalProps {
  cloneId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (result: ValidationResult) => void;
  onValidationComplete?: () => void;
}

export const CloneValidationModal: React.FC<CloneValidationModalProps> = ({
  cloneId,
  isOpen,
  onClose,
  onSuccess,
  onValidationComplete
}) => {
  const validation = useValidation(cloneId);

  useEffect(() => {
    if (!isOpen) {
      validation.reset();
    }
  }, [isOpen]);

  // Notify parent when validation completes
  useEffect(() => {
    if (validation.state === 'completed' && onValidationComplete) {
      onValidationComplete();
    }
  }, [validation.state, onValidationComplete]);

  const handleValidate = async () => {
    await validation.startValidation();
  };

  const handleRetry = async () => {
    await validation.startValidation();
  };

  const handleClose = () => {
    validation.reset();
    onClose();
  };

  const handleSuccess = () => {
    if (validation.result) {
      onSuccess?.(validation.result);
    }
    handleClose();
  };

  if (!isOpen) return null;

  const isLoading = validation.state === 'loading';
  const isCompleted = validation.state === 'completed' && validation.result;
  const isError = validation.state === 'error';

  const isHealthy = validation.result?.status === 'Healthy';
  const hasFindings = validation.result?.findings && validation.result.findings.length > 0;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Clone Validation</h2>
          <button
            onClick={handleClose}
            style={styles.closeButton}
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {validation.state === 'idle' && (
            <div style={styles.idleState}>
              <div style={styles.idleIcon}>✓</div>
              <p style={styles.idleText}>
                Click "Validate" to check the health status of this clone.
              </p>
              <p style={styles.idleSubtext}>
                Validation will check for missing files, metadata issues, and database connectivity.
              </p>
            </div>
          )}

          {isLoading && (
            <div style={styles.loadingState}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Validating clone...</p>
              {validation.validationId && (
                <p style={styles.validationId}>ID: {validation.validationId}</p>
              )}
            </div>
          )}

          {isCompleted && validation.result && (
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
                    fontSize: '20px',
                    marginRight: '8px',
                    color: isHealthy ? '#2e7d32' : '#d32f2f'
                  }}
                >
                  {isHealthy ? '✓' : '✕'}
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: '600',
                      color: isHealthy ? '#2e7d32' : '#d32f2f'
                    }}
                  >
                    {isHealthy ? 'Healthy' : 'Unhealthy'}
                  </div>
                  {hasFindings && (
                    <div style={{ fontSize: '13px', color: '#666' }}>
                      {validation.result.findings.length} issue
                      {validation.result.findings.length !== 1 ? 's' : ''} found
                    </div>
                  )}
                </div>
              </div>

              <div style={styles.findingsContainer}>
                <ValidationFindings
                  findings={validation.result.findings}
                  validatedAt={validation.result.validatedAt}
                  duration={validation.result.duration}
                  status={validation.result.status}
                />
              </div>

              {validation.validationId && (
                <p style={styles.validationId}>ID: {validation.validationId}</p>
              )}
            </div>
          )}

          {isError && (
            <div style={styles.errorState}>
              <div style={styles.errorIcon}>!</div>
              <p style={styles.errorTitle}>Validation Failed</p>
              <p style={styles.errorMessage}>{validation.error}</p>

              {validation.lockInfo && (
                <div style={styles.lockInfoBox}>
                  <div style={styles.lockInfoTitle}>Clone is Locked</div>
                  <div style={styles.lockInfoDetail}>
                    Owner: {validation.lockInfo.ownerId}
                  </div>
                  <div style={styles.lockInfoDetail}>
                    Since: {new Date(validation.lockInfo.acquiredAt).toLocaleString()}
                  </div>
                  <p style={styles.lockInfoNote}>
                    Please wait for the current operation to complete.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={styles.footer}>
          {validation.state === 'idle' && (
            <button
              onClick={handleValidate}
              disabled={isLoading}
              style={{ ...styles.button, ...styles.buttonPrimary }}
            >
              Start Validation
            </button>
          )}

          {isLoading && (
            <p style={styles.footerNote}>
              Validation is in progress. This typically takes 30-60 seconds.
            </p>
          )}

          {isCompleted && (
            <>
              <button
                onClick={handleRetry}
                style={styles.button}
              >
                Validate Again
              </button>
              <button
                onClick={handleSuccess}
                style={{ ...styles.button, ...styles.buttonPrimary }}
              >
                Done
              </button>
            </>
          )}

          {isError && (
            <>
              <button
                onClick={handleRetry}
                style={{ ...styles.button, ...styles.buttonPrimary }}
              >
                Retry
              </button>
              <button
                onClick={handleClose}
                style={styles.button}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed' as const,
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
    backgroundColor: '#fff',
    borderRadius: '8px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
    width: '90%',
    maxWidth: '600px',
    maxHeight: '90vh',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: '600',
    color: '#333'
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '28px',
    cursor: 'pointer',
    color: '#666',
    padding: '0',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '20px'
  },
  idleState: {
    textAlign: 'center' as const,
    padding: '40px 20px'
  },
  idleIcon: {
    fontSize: '48px',
    marginBottom: '16px'
  },
  idleText: {
    fontSize: '14px',
    color: '#333',
    marginBottom: '8px'
  },
  idleSubtext: {
    fontSize: '13px',
    color: '#666'
  },
  loadingState: {
    textAlign: 'center' as const,
    padding: '40px 20px'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #f0f0f0',
    borderTop: '3px solid #1976d2',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 16px'
  },
  loadingText: {
    fontSize: '14px',
    color: '#333',
    marginBottom: '8px'
  },
  validationId: {
    fontSize: '12px',
    color: '#999',
    marginTop: '16px',
    fontFamily: 'monospace'
  },
  completedState: {
    padding: '0'
  },
  statusBanner: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderLeft: '4px solid',
    marginBottom: '16px'
  },
  findingsContainer: {
    marginTop: '0'
  },
  errorState: {
    textAlign: 'center' as const,
    padding: '30px 20px'
  },
  errorIcon: {
    fontSize: '40px',
    color: '#d32f2f',
    marginBottom: '12px'
  },
  errorTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
    marginBottom: '8px'
  },
  errorMessage: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '16px'
  },
  lockInfoBox: {
    backgroundColor: '#fff3e0',
    border: '1px solid #f57c00',
    borderRadius: '4px',
    padding: '12px',
    marginTop: '12px',
    textAlign: 'left' as const
  },
  lockInfoTitle: {
    fontWeight: '600',
    color: '#f57c00',
    marginBottom: '8px'
  },
  lockInfoDetail: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '4px',
    fontFamily: 'monospace'
  },
  lockInfoNote: {
    fontSize: '12px',
    color: '#666',
    marginTop: '8px',
    marginBottom: 0
  },
  footer: {
    padding: '16px',
    borderTop: '1px solid #e0e0e0',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px'
  },
  footerNote: {
    fontSize: '13px',
    color: '#666',
    margin: 0,
    flex: 1
  },
  button: {
    padding: '8px 16px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    backgroundColor: '#fff',
    color: '#333',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'all 0.2s'
  },
  buttonPrimary: {
    backgroundColor: '#1976d2',
    color: '#fff',
    border: 'none'
  }
};

// Add animation
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;
if (document.head) {
  document.head.appendChild(styleSheet);
}
