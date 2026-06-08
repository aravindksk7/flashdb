import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ConsoleIcon } from './ConsoleIcon';

const API_BASE = '/api';

interface CheckpointBackingValidatorProps {
  checkpointId: string;
  cloneId: string;
  checkpointName: string;
  diskPath?: string;
  isOpen: boolean;
  onClose: () => void;
  onProceed?: () => void;
}

interface ValidationResult {
  isValid: boolean;
  diskPath: string;
  message: string;
  diskExists: boolean;
  isAccessible: boolean;
  hasSpace: boolean;
  lastChecked: string;
}

export const CheckpointBackingValidator: React.FC<CheckpointBackingValidatorProps> = ({
  checkpointId,
  cloneId,
  checkpointName,
  diskPath,
  isOpen,
  onClose,
  onProceed
}) => {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && diskPath) {
      validateBacking();
    }
  }, [isOpen, diskPath, checkpointId, cloneId]);

  const validateBacking = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(
        `${API_BASE}/clones/${cloneId}/checkpoints/${checkpointId}/validate-backing`,
        { params: { diskPath } }
      );

      if (response.data.success) {
        setValidation(response.data.data);
      } else {
        setError(response.data.message || 'Validation failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to validate backing disk');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const statusColor = validation?.isValid ? '#2e7d32' : '#d32f2f';
  const statusText = validation?.isValid ? 'Valid' : 'Invalid';

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Backing Disk Validation</h3>
          <button onClick={onClose} style={styles.closeButton}>×</button>
        </div>

        <div style={styles.content}>
          <p style={styles.subtitle}>{checkpointName}</p>

          {loading ? (
            <div style={styles.loadingState}>
              <div style={styles.spinner} />
              <p>Validating backing disk...</p>
            </div>
          ) : error ? (
            <div style={styles.errorBox}>
              <ConsoleIcon name="alert" className="console-icon" />
              <p>{error}</p>
            </div>
          ) : validation ? (
            <div>
              <div style={styles.statusBox}>
                <div style={{ ...styles.statusCircle, backgroundColor: statusColor }} />
                <div>
                  <div style={{ ...styles.statusLabel, color: statusColor }}>
                    {statusText}
                  </div>
                  <div style={styles.statusMessage}>{validation.message}</div>
                </div>
              </div>

              <div style={styles.detailsSection}>
                <h4 style={styles.detailsTitle}>Validation Details</h4>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Disk Path:</span>
                  <span style={styles.detailValue}>{validation.diskPath}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Exists:</span>
                  <span style={{
                    ...styles.detailValue,
                    color: validation.diskExists ? '#2e7d32' : '#d32f2f'
                  }}>
                    {validation.diskExists ? '✓ Yes' : '✕ No'}
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Accessible:</span>
                  <span style={{
                    ...styles.detailValue,
                    color: validation.isAccessible ? '#2e7d32' : '#d32f2f'
                  }}>
                    {validation.isAccessible ? '✓ Yes' : '✕ No'}
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Space Available:</span>
                  <span style={{
                    ...styles.detailValue,
                    color: validation.hasSpace ? '#2e7d32' : '#d32f2f'
                  }}>
                    {validation.hasSpace ? '✓ Yes' : '✕ No'}
                  </span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>Last Checked:</span>
                  <span style={styles.detailValue}>
                    {new Date(validation.lastChecked).toLocaleString()}
                  </span>
                </div>
              </div>

              {!validation.isValid && (
                <div style={styles.warningBox}>
                  <span style={styles.warningIcon}>⚠</span>
                  <div>
                    <p style={styles.warningTitle}>Backing disk validation failed</p>
                    <p style={styles.warningText}>
                      This checkpoint may not be restorable. Please check the disk path and ensure it is accessible.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div style={styles.actions}>
          <button onClick={onClose} style={styles.secondaryButton}>
            Close
          </button>
          {validation?.isValid && (
            <button onClick={() => { onProceed?.(); onClose(); }} style={styles.primaryButton}>
              Proceed
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
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
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'rgba(15, 23, 34, 0.96)',
    border: '1px solid rgba(148, 163, 184, 0.16)',
    borderRadius: '16px',
    maxWidth: '480px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
  },
  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text)',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: 'var(--text-soft)',
    fontSize: '24px',
    cursor: 'pointer',
    padding: 0,
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: '20px 24px',
  },
  subtitle: {
    margin: '0 0 20px 0',
    fontSize: '13px',
    color: 'var(--text-soft)',
    fontWeight: 500,
  },
  loadingState: {
    display: 'grid',
    placeItems: 'center',
    gap: '12px',
    minHeight: '120px',
    color: 'var(--text-soft)',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid rgba(148, 163, 184, 0.2)',
    borderTop: '3px solid #22d3ee',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
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
  statusBox: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '20px',
  },
  statusCircle: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  statusLabel: {
    fontSize: '14px',
    fontWeight: 600,
  },
  statusMessage: {
    fontSize: '12px',
    color: 'var(--text-soft)',
    marginTop: '2px',
  },
  detailsSection: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: '10px',
    padding: '12px',
    marginBottom: '16px',
  },
  detailsTitle: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--text)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: '6px',
    fontSize: '12px',
  },
  detailLabel: {
    color: 'var(--text-soft)',
  },
  detailValue: {
    color: 'var(--text)',
    fontWeight: 500,
    wordBreak: 'break-word',
    maxWidth: '60%',
    textAlign: 'right',
  },
  warningBox: {
    display: 'flex',
    gap: '12px',
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    border: '1px solid rgba(251, 191, 36, 0.2)',
    borderRadius: '10px',
    padding: '12px',
  },
  warningIcon: {
    fontSize: '16px',
    minWidth: '20px',
  },
  warningTitle: {
    margin: '0 0 4px 0',
    fontSize: '12px',
    fontWeight: 600,
    color: '#fbbf24',
  },
  warningText: {
    margin: 0,
    fontSize: '12px',
    color: 'var(--text-soft)',
    lineHeight: 1.4,
  },
  actions: {
    display: 'flex',
    gap: '8px',
    padding: '16px 24px',
    borderTop: '1px solid rgba(148, 163, 184, 0.16)',
    justifyContent: 'flex-end',
  },
  primaryButton: {
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    color: '#cffafe',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
  },
  secondaryButton: {
    backgroundColor: 'rgba(30, 41, 59, 0.92)',
    color: '#fff',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
  },
} satisfies Record<string, React.CSSProperties>;
