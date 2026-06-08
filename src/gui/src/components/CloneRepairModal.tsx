/**
 * CloneRepairModal Component
 *
 * Modal for repair workflow: Planning → Approval → Execution → Results
 * Supports dry-run planning, approval, execution with progress tracking, and cancellation
 */

import React, { useEffect } from 'react';
import { useRepair } from '../hooks/useRepair';
import { RepairPlanReview } from './RepairPlanReview';
import './CloneRepairModal.css';

interface CloneRepairModalProps {
  cloneId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CloneRepairModal: React.FC<CloneRepairModalProps> = ({
  cloneId,
  isOpen,
  onClose,
  onSuccess
}) => {
  const repair = useRepair(cloneId);

  useEffect(() => {
    if (!isOpen) {
      repair.reset();
    }
  }, [isOpen]);

  const handleStartRepair = async () => {
    await repair.startPlanning();
  };

  const handleApprove = async () => {
    repair.setApproved(true);
    await repair.startExecution(true);
  };

  const handleCancel = async () => {
    if (repair.state === 'executing') {
      await repair.cancelExecution();
    }
    repair.reset();
    onClose();
  };

  const handleSuccess = () => {
    onSuccess?.();
    repair.reset();
    onClose();
  };

  if (!isOpen) return null;

  const isPlanning = repair.state === 'planning';
  const isApproval = repair.state === 'approval' && repair.plan !== null;
  const isExecuting = repair.state === 'executing' && repair.execution !== null;
  const isCompleted =
    repair.state === 'completed' &&
    repair.execution &&
    (repair.execution.status === 'Completed' || repair.execution.status === 'Failed');
  const isError = repair.state === 'error';

  const executionSuccess =
    repair.execution?.status === 'Completed' && repair.execution?.result?.success;

  const progressPercentage =
    repair.execution?.progress?.percentage || 0;
  const progressText =
    repair.execution?.progress &&
    `${repair.execution.progress.current} / ${repair.execution.progress.total}`;
  const canExecuteRepair =
    repair.approved || repair.plan?.plan.requiresApproval === false;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Clone Repair</h2>
          <button
            onClick={handleCancel}
            style={styles.closeButton}
            aria-label="Close modal"
            disabled={isExecuting}
          >
            ×
          </button>
        </div>

        {/* Step Indicator */}
        <div style={styles.stepIndicator}>
          <div
            style={{
              ...styles.step,
              ...{
                backgroundColor:
                  repair.state !== 'idle'
                    ? '#1976d2'
                    : '#e0e0e0',
                color: repair.state !== 'idle' ? '#fff' : '#999'
              }
            }}
          >
            1
          </div>
          <div style={styles.stepLine} />
          <div
            style={{
              ...styles.step,
              ...{
                backgroundColor:
                  isApproval || isExecuting || isCompleted
                    ? '#1976d2'
                    : '#e0e0e0',
                color:
                  isApproval || isExecuting || isCompleted
                    ? '#fff'
                    : '#999'
              }
            }}
          >
            2
          </div>
          <div style={styles.stepLine} />
          <div
            style={{
              ...styles.step,
              ...{
                backgroundColor:
                  isExecuting || isCompleted ? '#1976d2' : '#e0e0e0',
                color:
                  isExecuting || isCompleted ? '#fff' : '#999'
              }
            }}
          >
            3
          </div>
          <div style={styles.stepLine} />
          <div
            style={{
              ...styles.step,
              ...{
                backgroundColor: isCompleted ? '#1976d2' : '#e0e0e0',
                color: isCompleted ? '#fff' : '#999'
              }
            }}
          >
            4
          </div>
        </div>

        {/* Step Labels */}
        <div style={styles.stepLabels}>
          <span>Plan</span>
          <span>Approve</span>
          <span>Execute</span>
          <span>Results</span>
        </div>

        {/* Content */}
        <div style={styles.content}>
          {repair.state === 'idle' && (
            <div style={styles.idleState}>
              <div style={styles.idleIcon}>⚙</div>
              <p style={styles.idleText}>
                Start the repair process to fix issues with this clone.
              </p>
              <p style={styles.idleSubtext}>
                The repair plan will be reviewed for approval before execution.
              </p>
            </div>
          )}

          {isPlanning && (
            <div style={styles.planningState}>
              <div style={styles.spinner}></div>
              <p style={styles.loadingText}>Planning repair actions...</p>
            </div>
          )}

          {isApproval && repair.plan && (
            <div style={styles.approvalState}>
              <RepairPlanReview
                plan={repair.plan.plan}
                approved={repair.approved}
                onApproveChange={repair.setApproved}
              />
            </div>
          )}

          {isExecuting && (
            <div style={styles.executingState}>
              <div style={styles.progressSection}>
                <div style={styles.progressLabel}>
                  <span>Repair in progress</span>
                  {progressText && (
                    <span style={styles.progressCount}>{progressText}</span>
                  )}
                </div>
                <div style={styles.progressBar}>
                  <div
                    style={{
                      ...styles.progressFill,
                      width: `${progressPercentage}%`
                    }}
                  ></div>
                </div>
                <div style={styles.progressPercentage}>
                  {progressPercentage}%
                </div>
              </div>

              {repair.execution?.currentAction && (
                <div style={styles.currentAction}>
                  <div style={styles.currentActionLabel}>Current Action</div>
                  <div style={styles.currentActionText}>
                    {repair.execution.currentAction}
                  </div>
                </div>
              )}
            </div>
          )}

          {isCompleted && repair.execution && (
            <div style={styles.completedState}>
              <div
                style={{
                  ...styles.resultBanner,
                  backgroundColor: executionSuccess ? '#e8f5e9' : '#ffebee',
                  borderLeftColor: executionSuccess ? '#2e7d32' : '#d32f2f'
                }}
              >
                <div
                  style={{
                    fontSize: '20px',
                    marginRight: '8px',
                    color: executionSuccess ? '#2e7d32' : '#d32f2f'
                  }}
                >
                  {executionSuccess ? '✓' : '✕'}
                </div>
                <div>
                  <div
                    style={{
                      fontWeight: '600',
                      color: executionSuccess ? '#2e7d32' : '#d32f2f'
                    }}
                  >
                    {executionSuccess ? 'Repair Completed' : 'Repair Failed'}
                  </div>
                  {repair.execution?.result && (
                    <div style={{ fontSize: '13px', color: '#666' }}>
                      Duration: {repair.execution.result.durationSeconds}s
                    </div>
                  )}
                </div>
              </div>

              {repair.execution?.result && (
                <div style={styles.resultDetails}>
                  {repair.execution.result.appliedActions && (
                    <div style={styles.resultSection}>
                      <h4 style={styles.resultSectionTitle}>Actions Applied</h4>
                      <ul style={styles.resultList}>
                        {repair.execution.result.appliedActions.map(
                          (action, idx) => (
                            <li key={idx} style={styles.resultListItem}>
                              {action}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  )}

                  {repair.execution.result.errors &&
                    repair.execution.result.errors.length > 0 && (
                      <div style={styles.resultSection}>
                        <h4
                          style={{
                            ...styles.resultSectionTitle,
                            color: '#d32f2f'
                          }}
                        >
                          Errors
                        </h4>
                        <ul style={styles.resultList}>
                          {repair.execution.result.errors.map((error, idx) => (
                            <li
                              key={idx}
                              style={{
                                ...styles.resultListItem,
                                color: '#d32f2f'
                              }}
                            >
                              {error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              )}
            </div>
          )}

          {isError && (
            <div style={styles.errorState}>
              <div style={styles.errorIcon}>!</div>
              <p style={styles.errorTitle}>Repair Failed</p>
              <p style={styles.errorMessage}>{repair.error}</p>

              {repair.lockInfo && (
                <div style={styles.lockInfoBox}>
                  <div style={styles.lockInfoTitle}>Clone is Locked</div>
                  <div style={styles.lockInfoDetail}>
                    Owner: {repair.lockInfo.ownerId}
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
          {repair.state === 'idle' && (
            <button
              onClick={handleStartRepair}
              style={{ ...styles.button, ...styles.buttonPrimary }}
            >
              Start Repair
            </button>
          )}

          {isApproval && (
            <>
              <button
                onClick={handleCancel}
                style={styles.button}
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={!canExecuteRepair}
                style={{
                  ...styles.button,
                  ...styles.buttonPrimary,
                  ...(canExecuteRepair ? {} : { opacity: 0.5, cursor: 'not-allowed' })
                }}
              >
                Approve & Execute
              </button>
            </>
          )}

          {isExecuting && (
            <button
              onClick={handleCancel}
              style={{ ...styles.button, ...styles.buttonDanger }}
            >
              Cancel Repair
            </button>
          )}

          {isCompleted && (
            <button
              onClick={handleSuccess}
              style={{ ...styles.button, ...styles.buttonPrimary }}
            >
              Done
            </button>
          )}

          {isError && (
            <>
              <button
                onClick={handleCancel}
                style={styles.button}
              >
                Cancel
              </button>
              <button
                onClick={handleStartRepair}
                style={{ ...styles.button, ...styles.buttonPrimary }}
              >
                Retry
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
    maxWidth: '650px',
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
    height: '32px'
  },
  stepIndicator: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: '#fafafa'
  },
  step: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '600',
    fontSize: '13px'
  },
  stepLine: {
    flex: 1,
    height: '1px',
    backgroundColor: '#ddd'
  },
  stepLabels: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
    padding: '0 16px 12px',
    fontSize: '11px',
    color: '#999',
    textAlign: 'center' as const
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
  planningState: {
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
    marginBottom: '0'
  },
  approvalState: {
    padding: '0'
  },
  executingState: {
    padding: '0'
  },
  progressSection: {
    padding: '16px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px'
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
    fontWeight: '500',
    marginBottom: '8px',
    color: '#333'
  },
  progressCount: {
    fontSize: '12px',
    color: '#666'
  },
  progressBar: {
    width: '100%',
    height: '6px',
    backgroundColor: '#e0e0e0',
    borderRadius: '3px',
    overflow: 'hidden',
    marginBottom: '8px'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#1976d2',
    transition: 'width 0.3s ease'
  },
  progressPercentage: {
    textAlign: 'right' as const,
    fontSize: '12px',
    color: '#666'
  },
  currentAction: {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#e3f2fd',
    borderLeft: '3px solid #1976d2',
    borderRadius: '2px'
  },
  currentActionLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#1976d2',
    marginBottom: '4px'
  },
  currentActionText: {
    fontSize: '13px',
    color: '#333'
  },
  completedState: {
    padding: '0'
  },
  resultBanner: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderLeft: '4px solid',
    marginBottom: '16px'
  },
  resultDetails: {
    marginTop: '16px'
  },
  resultSection: {
    marginBottom: '16px'
  },
  resultSectionTitle: {
    margin: '0 0 8px 0',
    fontSize: '13px',
    fontWeight: '600',
    color: '#333'
  },
  resultList: {
    margin: '0',
    paddingLeft: '20px'
  },
  resultListItem: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '4px'
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
    marginBottom: '4px'
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
  },
  buttonDanger: {
    backgroundColor: '#d32f2f',
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
