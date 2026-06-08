/**
 * CloneCard Component
 *
 * Displays clone information with validation status and Phase 5 validate/repair
 * actions. The Management tab mounts this component directly.
 */

import React, { useState } from 'react';
import { CloneValidationModal } from './CloneValidationModal';
import { CloneRepairModal } from './CloneRepairModal';
import type { ValidationResult } from '../services/api';
import './CloneCard.css';

interface CloneCardProps {
  cloneId: string;
  cloneName: string;
  databaseName?: string;
  instancePath?: string;
  status?: string;
  createdAt?: string;
  tableCount?: number;
  rowCount?: number;
  sizeBytes?: number;
  onAction?: (action: string) => void | Promise<void>;
  onOpenCheckpoints?: () => void;
  onDelete?: () => void;
  onOperationCompleted?: () => void;
}

type ValidationStatus = 'healthy' | 'unhealthy' | 'pending' | 'unknown';

const validationStatusFromResult = (result: ValidationResult): ValidationStatus => {
  if (result.status === 'Healthy') return 'healthy';
  if (result.status === 'Unhealthy') return 'unhealthy';
  if (result.status === 'Pending') return 'pending';
  return 'unknown';
};

export const CloneCard: React.FC<CloneCardProps> = ({
  cloneId,
  cloneName,
  databaseName = 'Unknown',
  instancePath = 'Unknown',
  status = 'Unknown',
  createdAt,
  tableCount,
  rowCount,
  sizeBytes,
  onAction,
  onOpenCheckpoints,
  onDelete,
  onOperationCompleted
}) => {
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>('unknown');

  const formatBytes = (bytes?: number) => {
    if (!bytes) return 'Unknown';
    const gb = bytes / (1024 * 1024 * 1024);
    return `${gb.toFixed(2)} GB`;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
  };

  const getValidationBadge = () => {
    switch (validationStatus) {
      case 'healthy':
        return { label: 'Healthy', color: '#2e7d32' };
      case 'unhealthy':
        return { label: 'Unhealthy', color: '#d32f2f' };
      case 'pending':
        return { label: 'Pending', color: '#f57c00' };
      default:
        return { label: 'Unknown', color: '#999' };
    }
  };

  const handleValidationSuccess = (result: ValidationResult) => {
    setValidationStatus(validationStatusFromResult(result));
    setValidationModalOpen(false);
    void onAction?.('validation-completed');
  };

  const handleRepairSuccess = () => {
    setValidationStatus('unknown');
    setRepairModalOpen(false);
    void onAction?.('repair-completed');
  };

  const badge = getValidationBadge();
  const canRepair = validationStatus !== 'healthy' && validationStatus !== 'pending';

  return (
    <>
      <div style={styles.card} onClick={onOpenCheckpoints}>
        <div style={styles.cardHeader}>
          <div style={styles.titleSection}>
            <h3 style={styles.cloneName}>{cloneName}</h3>
            <span
              style={{
                ...styles.validationBadge,
                backgroundColor: `${badge.color}15`,
                color: badge.color,
                borderColor: badge.color
              }}
            >
              {badge.label}
            </span>
          </div>
          <div style={styles.statusChip}>{status}</div>
        </div>

        <div style={styles.cardBody}>
          <div style={styles.infoGrid}>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Clone ID</span>
              <span style={styles.infoValue}>{cloneId}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Database</span>
              <span style={styles.infoValue}>{databaseName}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Instance</span>
              <span style={styles.infoValue}>{instancePath}</span>
            </div>
            <div style={styles.infoItem}>
              <span style={styles.infoLabel}>Created</span>
              <span style={styles.infoValue}>{formatDate(createdAt)}</span>
            </div>
            {tableCount !== undefined && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Tables</span>
                <span style={styles.infoValue}>{tableCount}</span>
              </div>
            )}
            {rowCount !== undefined && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Rows</span>
                <span style={styles.infoValue}>{rowCount.toLocaleString()}</span>
              </div>
            )}
            {sizeBytes !== undefined && (
              <div style={styles.infoItem}>
                <span style={styles.infoLabel}>Size</span>
                <span style={styles.infoValue}>{formatBytes(sizeBytes)}</span>
              </div>
            )}
          </div>
        </div>

        <div style={styles.cardFooter}>
          <button
            onClick={(event) => {
              event.stopPropagation();
              setValidationModalOpen(true);
            }}
            style={styles.button}
            title="Validate clone health status"
          >
            Validate
          </button>
          <button
            onClick={(event) => {
              event.stopPropagation();
              setRepairModalOpen(true);
            }}
            disabled={!canRepair}
            style={{
              ...styles.button,
              ...(canRepair ? styles.buttonDanger : styles.buttonDisabled)
            }}
            title={canRepair ? 'Plan and run clone repair' : 'Clone is healthy or validation is pending'}
          >
            Repair
          </button>
          {onOpenCheckpoints && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onOpenCheckpoints();
              }}
              style={styles.button}
              title="Open restore points"
            >
              Restore Points
            </button>
          )}
          {onDelete && (
            <button
              onClick={(event) => {
                event.stopPropagation();
                onDelete();
              }}
              style={{ ...styles.button, ...styles.buttonDanger }}
              title="Delete clone"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <CloneValidationModal
        cloneId={cloneId}
        isOpen={validationModalOpen}
        onClose={() => setValidationModalOpen(false)}
        onSuccess={handleValidationSuccess}
        onValidationComplete={onOperationCompleted}
      />

      <CloneRepairModal
        cloneId={cloneId}
        isOpen={repairModalOpen}
        onClose={() => setRepairModalOpen(false)}
        onSuccess={handleRepairSuccess}
      />
    </>
  );
};

const styles = {
  card: {
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
    display: 'flex',
    flexDirection: 'column' as const,
    cursor: 'pointer'
  },
  cardHeader: {
    padding: '16px',
    borderBottom: '1px solid #f0f0f0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px'
  },
  titleSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
    minWidth: 0
  },
  cloneName: {
    margin: 0,
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
    overflowWrap: 'anywhere' as const
  },
  validationBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '500',
    border: '1px solid',
    whiteSpace: 'nowrap' as const
  },
  statusChip: {
    padding: '4px 12px',
    backgroundColor: '#f0f0f0',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    color: '#666',
    whiteSpace: 'nowrap' as const
  },
  cardBody: {
    padding: '16px',
    flex: 1
  },
  infoGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '12px'
  },
  infoItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px'
  },
  infoLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: '#999',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px'
  },
  infoValue: {
    fontSize: '13px',
    color: '#333',
    wordBreak: 'break-word' as const
  },
  cardFooter: {
    padding: '12px 16px',
    borderTop: '1px solid #f0f0f0',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
    gap: '8px'
  },
  button: {
    padding: '8px 12px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    backgroundColor: '#fff',
    color: '#333',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '500',
    transition: 'all 0.2s'
  },
  buttonDanger: {
    backgroundColor: '#d32f2f',
    color: '#fff',
    border: 'none'
  },
  buttonDisabled: {
    backgroundColor: '#f0f0f0',
    color: '#999',
    cursor: 'not-allowed',
    border: '1px solid #e0e0e0'
  }
};
