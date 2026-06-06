import React from 'react';

interface ValidationStatusIndicatorProps {
  validationStatus: 'pending' | 'passed' | 'failed' | 'rolled-back';
  validationError?: string | null;
}

const getStatusConfig = (status: string) => {
  const configs: { [key: string]: { icon: string; color: string; label: string } } = {
    pending: {
      icon: '⏳',
      color: '#f3a461',
      label: 'Validation Pending'
    },
    passed: {
      icon: '✓',
      color: '#52c41a',
      label: 'Hash Valid'
    },
    failed: {
      icon: '✗',
      color: '#f5222d',
      label: 'Hash Mismatch'
    },
    'rolled-back': {
      icon: '↩',
      color: '#ff7a45',
      label: 'Auto-Rollback'
    }
  };

  return configs[status] || configs.pending;
};

export const ValidationStatusIndicator: React.FC<ValidationStatusIndicatorProps> = ({
  validationStatus,
  validationError
}) => {
  const config = getStatusConfig(validationStatus);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        borderRadius: '4px',
        backgroundColor: `${config.color}20`,
        border: `1px solid ${config.color}`
      }}
      title={validationError || config.label}
    >
      <span style={{ fontSize: '16px' }}>{config.icon}</span>
      <span style={{ color: config.color, fontWeight: 500, fontSize: '14px' }}>
        {config.label}
      </span>
      {validationError && (
        <div
          style={{
            position: 'absolute',
            backgroundColor: '#333',
            color: '#fff',
            padding: '8px',
            borderRadius: '4px',
            fontSize: '12px',
            maxWidth: '300px',
            whiteSpace: 'normal',
            zIndex: 1000,
            marginTop: '30px'
          }}
        >
          {validationError}
        </div>
      )}
    </div>
  );
};

export default ValidationStatusIndicator;
