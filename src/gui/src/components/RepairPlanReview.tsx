/**
 * RepairPlanReview Component
 *
 * Displays repair plan in approval step
 * Shows action list with risk levels, estimated duration, and approval checkbox
 */

import React from 'react';
import { RepairPlan } from '../services/api';
import './RepairPlanReview.css';

interface RepairPlanReviewProps {
  plan: RepairPlan;
  approved: boolean;
  onApproveChange: (approved: boolean) => void;
}

export const RepairPlanReview: React.FC<RepairPlanReviewProps> = ({
  plan,
  approved,
  onApproveChange
}) => {
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'Low':
        return '#2e7d32';
      case 'Medium':
        return '#f57c00';
      case 'High':
        return '#d32f2f';
      default:
        return '#666';
    }
  };

  const getRiskBgColor = (risk: string) => {
    switch (risk) {
      case 'Low':
        return '#e8f5e9';
      case 'Medium':
        return '#fff3e0';
      case 'High':
        return '#ffebee';
      default:
        return '#f5f5f5';
    }
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) return `${minutes}m`;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const totalErrors = plan.actions.filter(a => a.riskLevel === 'High').length;
  const totalWarnings = plan.actions.filter(a => a.riskLevel === 'Medium').length;

  return (
    <div style={styles.container}>
      {/* Summary */}
      <div style={styles.summary}>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Estimated Duration:</span>
          <span style={styles.summaryValue}>
            {formatDuration(plan.estimatedDurationSeconds)}
          </span>
        </div>
        <div style={styles.summaryItem}>
          <span style={styles.summaryLabel}>Total Actions:</span>
          <span style={styles.summaryValue}>{plan.actions.length}</span>
        </div>
        {totalErrors > 0 && (
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>High Risk:</span>
            <span style={{ ...styles.summaryValue, color: '#d32f2f' }}>
              {totalErrors}
            </span>
          </div>
        )}
        {totalWarnings > 0 && (
          <div style={styles.summaryItem}>
            <span style={styles.summaryLabel}>Medium Risk:</span>
            <span style={{ ...styles.summaryValue, color: '#f57c00' }}>
              {totalWarnings}
            </span>
          </div>
        )}
      </div>

      {/* Actions Table */}
      <div style={styles.actionsContainer}>
        <h4 style={styles.actionsTitle}>Repair Actions</h4>
        <div style={styles.actionsList}>
          {plan.actions.map((action, index) => (
            <div key={index} style={styles.actionItem}>
              <div style={styles.actionHeader}>
                <span style={styles.actionIndex}>{index + 1}</span>
                <span style={styles.actionType}>{action.type}</span>
                <span
                  style={{
                    ...styles.riskBadge,
                    backgroundColor: getRiskBgColor(action.riskLevel),
                    color: getRiskColor(action.riskLevel)
                  }}
                >
                  {action.riskLevel}
                </span>
              </div>
              <div style={styles.actionDescription}>{action.description}</div>
              <div style={styles.actionDuration}>
                ~{formatDuration(action.estimatedDurationSeconds)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Approval Section */}
      <div style={styles.approvalSection}>
        {plan.requiresApproval && (
          <label style={styles.approvalLabel}>
            <input
              type="checkbox"
              checked={approved}
              onChange={e => onApproveChange(e.target.checked)}
              style={styles.approvalCheckbox}
            />
            <span>
              I understand the repair plan and approve execution on this clone
            </span>
          </label>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '16px',
    backgroundColor: '#fff',
    borderRadius: '4px'
  } as React.CSSProperties,
  summary: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '12px',
    marginBottom: '20px',
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px'
  } as React.CSSProperties,
  summaryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  } as React.CSSProperties,
  summaryLabel: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#666'
  } as React.CSSProperties,
  summaryValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#333'
  } as React.CSSProperties,
  actionsContainer: {
    marginBottom: '20px'
  } as React.CSSProperties,
  actionsTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: '600',
    color: '#333'
  } as React.CSSProperties,
  actionsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  } as React.CSSProperties,
  actionItem: {
    padding: '12px',
    border: '1px solid #e0e0e0',
    borderRadius: '4px',
    backgroundColor: '#fafafa'
  } as React.CSSProperties,
  actionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px'
  } as React.CSSProperties,
  actionIndex: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#e0e0e0',
    fontSize: '12px',
    fontWeight: '600',
    color: '#333'
  } as React.CSSProperties,
  actionType: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#333',
    flex: 1
  } as React.CSSProperties,
  riskBadge: {
    padding: '2px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: '600'
  } as React.CSSProperties,
  actionDescription: {
    fontSize: '13px',
    color: '#666',
    marginBottom: '6px'
  } as React.CSSProperties,
  actionDuration: {
    fontSize: '12px',
    color: '#999',
    fontStyle: 'italic'
  } as React.CSSProperties,
  approvalSection: {
    padding: '12px',
    backgroundColor: '#f5f5f5',
    borderRadius: '4px',
    borderLeft: '3px solid #f57c00'
  } as React.CSSProperties,
  approvalLabel: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#333'
  } as React.CSSProperties,
  approvalCheckbox: {
    marginRight: '8px',
    cursor: 'pointer'
  } as React.CSSProperties
};
