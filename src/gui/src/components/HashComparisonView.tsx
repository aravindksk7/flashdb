import React, { useState } from 'react';
import { ValidationStatusIndicator } from './ValidationStatusIndicator';

interface HashComparisonViewProps {
  preHash: string;
  postHash: string;
  validationStatus: 'pending' | 'passed' | 'failed' | 'rolled-back';
  validationError?: string | null;
}

export const HashComparisonView: React.FC<HashComparisonViewProps> = ({
  preHash,
  postHash,
  validationStatus,
  validationError
}) => {
  const [showFullHash, setShowFullHash] = useState(false);

  const hashesMatch = preHash === postHash;

  const truncateHash = (hash: string, length = 16) => {
    if (!hash) return 'N/A';
    return hash.length > length ? `${hash.substring(0, length)}...` : hash;
  };

  return (
    <div
      style={{
        border: '1px solid #e8e8e8',
        borderRadius: '8px',
        padding: '16px',
        backgroundColor: '#fafafa'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '16px'
        }}
      >
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
          Hash Validation
        </h3>
        <ValidationStatusIndicator
          validationStatus={validationStatus}
          validationError={validationError}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Pre-Hash */}
        <div
          style={{
            padding: '12px',
            backgroundColor: '#fff',
            borderRadius: '4px',
            border: '1px solid #d9d9d9'
          }}
        >
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px', fontWeight: 500 }}>
            PRE-CHECKPOINT HASH
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              backgroundColor: '#f5f5f5',
              padding: '8px',
              borderRadius: '4px',
              wordBreak: 'break-all',
              color: '#333'
            }}
            title={preHash}
          >
            {showFullHash ? preHash : truncateHash(preHash)}
          </div>
        </div>

        {/* Post-Hash */}
        <div
          style={{
            padding: '12px',
            backgroundColor: '#fff',
            borderRadius: '4px',
            border: `1px solid ${hashesMatch ? '#52c41a' : '#f5222d'}`
          }}
        >
          <div
            style={{
              fontSize: '12px',
              color: '#666',
              marginBottom: '8px',
              fontWeight: 500,
              display: 'flex',
              justifyContent: 'space-between'
            }}
          >
            <span>POST-RESTORE HASH</span>
            <span style={{ color: hashesMatch ? '#52c41a' : '#f5222d', fontWeight: 600 }}>
              {hashesMatch ? 'MATCH' : 'MISMATCH'}
            </span>
          </div>
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: '12px',
              backgroundColor: '#f5f5f5',
              padding: '8px',
              borderRadius: '4px',
              wordBreak: 'break-all',
              color: hashesMatch ? '#52c41a' : '#f5222d'
            }}
            title={postHash}
          >
            {showFullHash ? postHash : truncateHash(postHash)}
          </div>
        </div>
      </div>

      {/* Toggle Full Hash */}
      <div style={{ marginTop: '12px', textAlign: 'center' }}>
        <button
          onClick={() => setShowFullHash(!showFullHash)}
          style={{
            background: 'none',
            border: 'none',
            color: '#1890ff',
            cursor: 'pointer',
            fontSize: '12px',
            textDecoration: 'underline'
          }}
        >
          {showFullHash ? 'Show Truncated' : 'Show Full Hashes'}
        </button>
      </div>

      {/* Match Indicator */}
      <div
        style={{
          marginTop: '16px',
          padding: '12px',
          backgroundColor: hashesMatch ? '#f6ffed' : '#fff1f0',
          border: `1px solid ${hashesMatch ? '#b7eb8f' : '#ffccc7'}`,
          borderRadius: '4px',
          fontSize: '14px',
          color: hashesMatch ? '#52c41a' : '#f5222d'
        }}
      >
        {hashesMatch
          ? '✓ Hashes match - VHDX state is consistent'
          : '✗ Hashes mismatch - VHDX state inconsistency detected. Automatic rollback may have been triggered.'}
      </div>
    </div>
  );
};

export default HashComparisonView;
