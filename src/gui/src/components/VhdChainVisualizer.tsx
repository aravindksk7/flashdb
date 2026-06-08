import React, { useEffect, useState } from 'react';
import axios from 'axios';

interface VhdParent {
  path: string;
  size: number;
  hash: string;
}

interface ChainValidationResult {
  vhdPath: string;
  isValid: boolean;
  chainLength: number;
  parentChain: VhdParent[];
  validationTime: string;
}

interface Props {
  cloneId?: string;
  vhdPath?: string;
}

export const VhdChainVisualizer: React.FC<Props> = ({ cloneId, vhdPath }) => {
  const [chainData, setChainData] = useState<ChainValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (vhdPath) {
      loadChainData();
    }
  }, [vhdPath]);

  const loadChainData = async () => {
    if (!vhdPath) return;

    setValidating(true);
    try {
      setError(null);
      const response = await axios.post('/api/health/vhd-operations/validate-chain', {
        vhdPath
      });

      if (response.data.success) {
        setChainData(response.data.data);
      }
    } catch (err: any) {
      setError(`Failed to validate VHD chain: ${err.message}`);
    } finally {
      setValidating(false);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatPath = (path: string): string => {
    const parts = path.split('\\');
    return parts[parts.length - 1];
  };

  const formatHash = (hash: string): string => {
    return hash.substring(0, 8) + '...' + hash.substring(hash.length - 8);
  };

  if (!vhdPath && !cloneId) {
    return (
      <div style={styles.container}>
        <div style={styles.message}>No VHD path provided</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h4 style={styles.title}>VHD Chain Visualization</h4>
        {vhdPath && (
          <button
            onClick={loadChainData}
            disabled={validating}
            style={styles.validateButton}
          >
            {validating ? 'Validating...' : 'Validate Chain'}
          </button>
        )}
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading && <div style={styles.loading}>Loading...</div>}

      {chainData && (
        <>
          <div style={styles.statusBar}>
            <div
              style={{
                ...styles.statusIndicator,
                backgroundColor: chainData.isValid ? '#4CAF50' : '#f44336'
              }}
            >
              {chainData.isValid ? '✓ Valid' : '✕ Invalid'}
            </div>
            <div style={styles.chainInfo}>
              <span>Chain Length: {chainData.chainLength}</span>
              <span style={styles.timestamp}>
                Validated: {new Date(chainData.validationTime).toLocaleString()}
              </span>
            </div>
          </div>

          <div style={styles.chainVisualization}>
            {chainData.parentChain.map((parent, index) => (
              <React.Fragment key={index}>
                <div style={styles.vhdBlock}>
                  <div style={styles.vhdBlockHeader}>
                    <span style={styles.vhdIndex}>Parent {index + 1}</span>
                    <span style={styles.vhdSize}>{formatBytes(parent.size)}</span>
                  </div>
                  <div style={styles.vhdBlockContent}>
                    <div style={styles.vhdPath} title={parent.path}>
                      {formatPath(parent.path)}
                    </div>
                    <div style={styles.vhdHash} title={parent.hash}>
                      Hash: {formatHash(parent.hash)}
                    </div>
                  </div>
                </div>

                {index < chainData.parentChain.length - 1 && (
                  <div style={styles.chainConnector}>
                    <div style={styles.connectorLine} />
                    <div style={styles.connectorArrow}>↓</div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          <div style={styles.vhdCurrentBlock}>
            <div style={styles.vhdBlockHeader}>
              <span style={styles.vhdIndex}>Current VHD</span>
            </div>
            <div style={styles.vhdBlockContent}>
              <div style={styles.vhdPath} title={chainData.vhdPath}>
                {formatPath(chainData.vhdPath)}
              </div>
            </div>
          </div>
        </>
      )}

      {!validating && !chainData && vhdPath && (
        <div style={styles.placeholder}>
          <button onClick={loadChainData} style={styles.loadButton}>
            Load Chain Information
          </button>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    backgroundColor: '#2d2d2d',
    padding: '20px',
    borderRadius: '6px',
    border: '1px solid #404040',
    marginBottom: '15px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px'
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#b0b0b0'
  },
  validateButton: {
    padding: '8px 16px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '12px'
  },
  message: {
    color: '#888',
    textAlign: 'center',
    padding: '20px'
  },
  error: {
    padding: '12px 16px',
    backgroundColor: '#f44336',
    color: 'white',
    borderRadius: '4px',
    marginBottom: '15px'
  },
  loading: {
    color: '#888',
    textAlign: 'center',
    padding: '20px'
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    padding: '12px',
    backgroundColor: '#1e1e1e',
    borderRadius: '4px',
    marginBottom: '15px'
  },
  statusIndicator: {
    padding: '6px 12px',
    borderRadius: '4px',
    color: 'white',
    fontWeight: 'bold',
    fontSize: '12px'
  },
  chainInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    color: '#e0e0e0',
    fontSize: '13px'
  },
  timestamp: {
    color: '#888',
    fontSize: '11px'
  },
  chainVisualization: {
    marginBottom: '15px'
  },
  vhdBlock: {
    backgroundColor: '#1e1e1e',
    border: '1px solid #404040',
    borderRadius: '4px',
    marginBottom: '12px',
    overflow: 'hidden'
  },
  vhdBlockHeader: {
    backgroundColor: '#404040',
    padding: '8px 12px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #404040'
  },
  vhdIndex: {
    fontWeight: 'bold',
    color: '#b0b0b0',
    fontSize: '12px'
  },
  vhdSize: {
    color: '#888',
    fontSize: '12px'
  },
  vhdBlockContent: {
    padding: '12px'
  },
  vhdPath: {
    color: '#e0e0e0',
    fontSize: '13px',
    fontFamily: 'monospace',
    wordBreak: 'break-all',
    marginBottom: '8px'
  },
  vhdHash: {
    color: '#888',
    fontSize: '11px',
    fontFamily: 'monospace'
  },
  chainConnector: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '12px'
  },
  connectorLine: {
    width: '2px',
    height: '20px',
    backgroundColor: '#404040'
  },
  connectorArrow: {
    color: '#404040',
    fontSize: '16px'
  },
  vhdCurrentBlock: {
    backgroundColor: '#1e1e1e',
    border: '2px solid #4CAF50',
    borderRadius: '4px',
    overflow: 'hidden'
  },
  placeholder: {
    textAlign: 'center',
    padding: '20px',
    color: '#888'
  },
  loadButton: {
    padding: '10px 20px',
    backgroundColor: '#2196F3',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold'
  }
};

export default VhdChainVisualizer;
