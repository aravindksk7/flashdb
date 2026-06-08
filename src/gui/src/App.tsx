import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import './App.css';
import { CreateGoldenImageForm } from './components/CreateGoldenImageForm';
import { CreateCloneForm } from './components/CreateCloneForm';
import { CheckpointManager } from './components/CheckpointManager';
import { OperationHistory, type OperationHistoryRef } from './components/OperationHistory';
import Dashboard from './components/Dashboard';
import { PoolMetrics } from './components/PoolMetrics';
import { QueueMetrics } from './components/QueueMetrics';
import { ClusterStatus } from './components/ClusterStatus';
import DeploymentGuide from './components/DeploymentGuide';
import { ConsoleIcon } from './components/ConsoleIcon';
import { CloneCard } from './components/CloneCard';

interface Clone {
  id: string;
  name: string;
  goldenImageId: string;
  instancePath: string;
  databaseName: string;
  databaseType: string;
  status: string;
  createdAt: string;
  tableCount?: number;
  rowCount?: number;
  sizeBytes?: number;
}

interface GoldenImage {
  id: string;
  name: string;
  version: string;
  method: string;
  databaseType: string;
  createdAt: string;
  sizeBytes: number;
  databaseName?: string;
  sourceDatabase?: string;
  driver?: string;
  authenticationMode?: string;
  outputPath?: string;
  backupFile?: string;
  sourceConnection?: string;
  destinationConnection?: string;
  status?: string;
  selectedTables?: string[];
  copiedTables?: string[];
  tableCount?: number;
  rowCount?: number;
}

type AppTab = 'dashboard' | 'management' | 'audit' | 'deployment';

const getInitialTab = (): AppTab => {
  const tab = new URLSearchParams(window.location.search).get('tab');
  if (tab === 'management') return 'management';
  if (tab === 'audit') return 'audit';
  if (tab === 'deployment') return 'deployment';
  return 'dashboard';
};

const asArray = (value: any): any[] => {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
};

const firstValue = <T,>(value: any, keys: string[]): T | undefined => {
  for (const key of keys) {
    if (value?.[key] !== undefined && value?.[key] !== null) {
      return value[key] as T;
    }
  }
  return undefined;
};

const toNumber = (value: any, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const normalizeClone = (value: any): Clone | null => {
  const id = firstValue<string>(value, ['id', 'Id', 'cloneId', 'CloneId']);
  const name = firstValue<string>(value, ['name', 'Name', 'cloneName', 'CloneName']);

  if (!id && !name) return null;

  return {
    id: id || name || 'unknown-clone',
    name: name || id || 'Unnamed clone',
    goldenImageId: firstValue<string>(value, ['goldenImageId', 'GoldenImageId']) || '',
    instancePath: firstValue<string>(value, ['instancePath', 'InstancePath']) || 'Unknown',
    databaseName: firstValue<string>(value, ['databaseName', 'DatabaseName']) || 'Unknown',
    databaseType: firstValue<string>(value, ['databaseType', 'DatabaseType']) || 'sql-server',
    status: firstValue<string>(value, ['status', 'Status']) || 'Unknown',
    createdAt: firstValue<string>(value, ['createdAt', 'CreatedAt']) || '',
    tableCount: toNumber(firstValue<number>(value, ['tableCount', 'TableCount'])),
    rowCount: toNumber(firstValue<number>(value, ['rowCount', 'RowCount'])),
    sizeBytes: toNumber(firstValue<number>(value, ['sizeBytes', 'SizeBytes', 'size', 'Size']))
  };
};

const normalizeGoldenImage = (value: any): GoldenImage | null => {
  const id = firstValue<string>(value, ['id', 'Id', 'imageId', 'ImageId']);
  const name = firstValue<string>(value, ['name', 'Name']);

  if (!id && !name) return null;

  return {
    id: id || name || 'unknown-golden-image',
    name: name || id || 'Unnamed golden image',
    version: firstValue<string>(value, ['version', 'Version']) || 'Unknown',
    method: firstValue<string>(value, ['method', 'Method']) || 'Unknown',
    databaseType: firstValue<string>(value, ['databaseType', 'DatabaseType']) || 'sql-server',
    createdAt: firstValue<string>(value, ['createdAt', 'CreatedAt']) || '',
    sizeBytes: toNumber(firstValue<number>(value, ['sizeBytes', 'SizeBytes', 'size', 'Size'])),
    databaseName: firstValue<string>(value, ['databaseName', 'DatabaseName']),
    sourceDatabase: firstValue<string>(value, ['sourceDatabase', 'SourceDatabase']),
    driver: firstValue<string>(value, ['driver', 'Driver']),
    authenticationMode: firstValue<string>(value, ['authenticationMode', 'AuthenticationMode']),
    outputPath: firstValue<string>(value, ['outputPath', 'OutputPath']),
    backupFile: firstValue<string>(value, ['backupFile', 'BackupFile']),
    sourceConnection: firstValue<string>(value, ['sourceConnection', 'SourceConnection']),
    destinationConnection: firstValue<string>(value, ['destinationConnection', 'DestinationConnection']),
    status: firstValue<string>(value, ['status', 'Status']),
    selectedTables: asArray(firstValue<any>(value, ['selectedTables', 'SelectedTables'])).map(String),
    copiedTables: asArray(firstValue<any>(value, ['copiedTables', 'CopiedTables'])).map(String),
    tableCount: toNumber(firstValue<number>(value, ['tableCount', 'TableCount'])),
    rowCount: toNumber(firstValue<number>(value, ['rowCount', 'RowCount']))
  };
};

const normalizeList = <T,>(value: any, normalizer: (item: any) => T | null): T[] => {
  return asArray(value)
    .map(normalizer)
    .filter((item): item is T => item !== null);
};

const compactNumber = (value: number) => {
  if (!Number.isFinite(value)) return '0';

  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
};

const toneForStatus = (value?: string) => {
  const normalized = (value || '').toLowerCase();

  if (
    normalized.includes('ready') ||
    normalized.includes('actual') ||
    normalized.includes('healthy') ||
    normalized.includes('attached') ||
    normalized.includes('active')
  ) {
    return 'green';
  }

  if (normalized.includes('warn') || normalized.includes('queue') || normalized.includes('pending')) {
    return 'amber';
  }

  if (normalized.includes('fail') || normalized.includes('error') || normalized.includes('delete')) {
    return 'red';
  }

  return 'cyan';
};

const toneForMethod = (value?: string) => {
  const normalized = (value || '').toLowerCase();

  if (normalized.includes('backup')) return 'violet';
  if (normalized.includes('replica')) return 'cyan';
  return 'green';
};

function App() {
  const [clones, setClones] = useState<Clone[]>([]);
  const [goldenImages, setGoldenImages] = useState<GoldenImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClone, setSelectedClone] = useState<Clone | null>(null);
  const [editingGoldenImageId, setEditingGoldenImageId] = useState<string | null>(null);
  const [editingGoldenImage, setEditingGoldenImage] = useState<Partial<GoldenImage>>({});
  const [activeTab, setActiveTab] = useState<AppTab>(getInitialTab);
  const operationHistoryRef = useRef<OperationHistoryRef>(null);

  const API_BASE = '/api';

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [clonesRes, imagesRes] = await Promise.all([
        axios.get(`${API_BASE}/clones`),
        axios.get(`${API_BASE}/golden-images`)
      ]);

      setClones(normalizeList(clonesRes.data.data, normalizeClone));
      setGoldenImages(normalizeList(imagesRes.data.data, normalizeGoldenImage));
    } catch (err: any) {
      setError(`Failed to load data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClone = async (cloneId: string) => {
    if (!window.confirm('Are you sure you want to delete this clone?')) return;

    try {
      await axios.delete(`${API_BASE}/clones/${cloneId}?deleteVhdx=true`);
      setClones(clones.filter(c => c.id !== cloneId));
      if (selectedClone?.id === cloneId) setSelectedClone(null);
    } catch (err: any) {
      setError(`Failed to delete clone: ${err.response?.data?.message || err.message}`);
    }
  };

  const startEditGoldenImage = (image: GoldenImage) => {
    setEditingGoldenImageId(image.id);
    setEditingGoldenImage({
      name: image.name,
      version: image.version,
      method: image.method,
      databaseType: image.databaseType,
      databaseName: image.databaseName || '',
      sourceDatabase: image.sourceDatabase || '',
      driver: image.driver || 'System.Data.SqlClient',
      authenticationMode: image.authenticationMode || 'SqlPassword',
      outputPath: image.outputPath || '/app/data/golden-images',
      backupFile: image.backupFile || '',
      sourceConnection: image.sourceConnection || '',
      destinationConnection: image.destinationConnection || '',
      status: image.status || 'Ready'
    });
  };

  const cancelEditGoldenImage = () => {
    setEditingGoldenImageId(null);
    setEditingGoldenImage({});
  };

  const updateEditingGoldenImage = (
    field: keyof GoldenImage,
    value: string
  ) => {
    setEditingGoldenImage(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleUpdateGoldenImage = async (imageId: string) => {
    try {
      await axios.put(`${API_BASE}/golden-images/${imageId}`, editingGoldenImage);
      cancelEditGoldenImage();
      setError(null);
      await loadData();
    } catch (err: any) {
      setError(`Failed to update golden image: ${err.response?.data?.message || err.message}`);
    }
  };

  const handleDeleteGoldenImage = async (imageId: string) => {
    if (!window.confirm('Are you sure you want to delete this golden image? Existing clones are not deleted.')) return;

    try {
      await axios.delete(`${API_BASE}/golden-images/${imageId}`);
      if (editingGoldenImageId === imageId) cancelEditGoldenImage();
      setError(null);
      await loadData();
    } catch (err: any) {
      setError(`Failed to delete golden image: ${err.response?.data?.message || err.message}`);
    }
  };

  const formatBytes = (bytes?: number | null) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = toNumber(bytes);
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return Number.isNaN(date.getTime()) ? 'Unknown' : date.toLocaleString();
  };

  const selectTab = (tab: AppTab) => {
    setActiveTab(tab);

    const url = new URL(window.location.href);
    if (tab === 'dashboard') {
      url.searchParams.delete('tab');
    } else {
      url.searchParams.set('tab', tab);
    }
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  };

  const totalGoldenRows = goldenImages.reduce((sum, image) => sum + (image.rowCount || 0), 0);
  const totalGoldenTables = goldenImages.reduce((sum, image) => sum + (image.tableCount || 0), 0);
  const totalCloneRows = clones.reduce((sum, clone) => sum + (clone.rowCount || 0), 0);
  const totalCloneTables = clones.reduce((sum, clone) => sum + (clone.tableCount || 0), 0);
  const activeCloneCount = clones.filter((clone) => toneForStatus(clone.status) === 'green').length;
  const readyImageCount = goldenImages.filter((image) => toneForStatus(image.status || 'Ready') === 'green').length;
  const selectedCloneStatus = selectedClone ? toneForStatus(selectedClone.status) : 'cyan';

  return (
    <div className="app console-shell">
      <header className="app-header">
        <div className="hero-copy">
          <div className="panel-kicker">Futuristic operations console</div>
          <h1>FlashDB Management</h1>
          <p>Database virtualization control plane for golden images, clones, and restore points.</p>
        </div>
        <div className="hero-stats">
          <span className="chip chip-cyan">{compactNumber(goldenImages.length)} golden images</span>
          <span className="chip chip-green">{compactNumber(activeCloneCount)} healthy clones</span>
          <span className="chip chip-amber">{compactNumber(totalGoldenTables + totalCloneTables)} tables</span>
          <span className="chip chip-violet">{compactNumber(totalGoldenRows + totalCloneRows)} rows</span>
          <span className="chip chip-green">{compactNumber(readyImageCount)} ready images</span>
        </div>
      </header>

      {error && (
        <div className="error-alert">
          <p className="btn-icon"><ConsoleIcon name="warning" className="console-icon" />{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <nav className="app-tabs">
        <button
          className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => selectTab('dashboard')}
        >
          <ConsoleIcon name="status" className="console-icon" />
          Metrics Dashboard
        </button>
        <button
          className={`tab ${activeTab === 'management' ? 'active' : ''}`}
          onClick={() => selectTab('management')}
        >
          <ConsoleIcon name="schema" className="console-icon" />
          Management
        </button>
        <button
          className={`tab ${activeTab === 'audit' ? 'active' : ''}`}
          onClick={() => selectTab('audit')}
        >
          <ConsoleIcon name="explore" className="console-icon" />
          Audit
        </button>
        <button
          className={`tab ${activeTab === 'deployment' ? 'active' : ''}`}
          onClick={() => selectTab('deployment')}
        >
          <ConsoleIcon name="status" className="console-icon" />
          Deployment
        </button>
      </nav>

      {activeTab === 'dashboard' && (
        <div className="app-body">
          <Dashboard />
          <div className="container">
            <PoolMetrics />
            <div style={{ marginTop: '1rem' }}>
              <QueueMetrics />
            </div>
            <div style={{ marginTop: '1rem' }}>
              <ClusterStatus />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'management' && (
        <div className="container">
          <div className="workflow-panel">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">Operational flow</div>
                <h2>Golden images to restore points</h2>
                <p className="workflow-help">Inventory first, then create, inspect schema, clone, and restore within one console flow.</p>
              </div>
              <div className="chip-row">
                <span className="chip chip-cyan">Inventory</span>
                <span className="chip chip-green">Wizard</span>
                <span className="chip chip-amber">Schema</span>
                <span className="chip chip-violet">Clones</span>
                <span className="chip chip-red">Restore points</span>
              </div>
            </div>

            <div className="workflow-rail">
              {[
                { title: 'Golden Images', desc: 'Inventory and edit current snapshots.', tone: 'cyan', icon: 'database' as const },
                { title: 'Create Wizard', desc: 'Build a new image from a source database.', tone: 'green', icon: 'create' as const },
                { title: 'Schema Explorer', desc: 'Inspect tables and select capture targets.', tone: 'amber', icon: 'explore' as const },
                { title: 'Clone Actions', desc: 'Spin up clones from a chosen image.', tone: 'violet', icon: 'refresh' as const },
                { title: 'Restore Points', desc: 'Inspect, pin, and restore checkpoints.', tone: 'red', icon: 'restore' as const },
              ].map((step, index) => (
                <article key={step.title} className={`workflow-step ${index === 0 ? 'is-active' : ''}`}>
                  <div className="step-index">0{index + 1}</div>
                  <ConsoleIcon name={step.icon} className="console-icon" />
                  <div className={`chip chip-${step.tone}`}>{step.title}</div>
                  <p>{step.desc}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="section">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">Golden Images inventory</div>
                <h2>Golden Images</h2>
                <p className="workflow-help">Review method, database type, table count, row count, and actualized status at a glance.</p>
              </div>
              <div className="chip-row">
                <span className="chip chip-cyan">{compactNumber(goldenImages.length)} records</span>
                <span className="chip chip-green">{compactNumber(readyImageCount)} ready</span>
              </div>
            </div>
            {loading ? (
              <div className="grid">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="skeleton skeleton-card" />
                ))}
              </div>
            ) : goldenImages.length === 0 ? (
              <div className="empty-state">
                <ConsoleIcon name="database" className="console-icon" />
                <h4>No golden images found</h4>
                <p>Create your first image with the wizard below.</p>
              </div>
            ) : (
              <div className="grid">
                {goldenImages.map((image) => (
                  <div key={image.id} className="card image-card">
                    {editingGoldenImageId === image.id ? (
                      <div className="edit-form">
                        <div className="chip-row" style={{ marginBottom: '0.75rem' }}>
                          <span className={`chip chip-${toneForMethod(image.method)}`}>{image.method}</span>
                          <span className="chip chip-cyan">{image.databaseType}</span>
                          <span className={`chip chip-${toneForStatus(image.status || 'Ready')}`}>{image.status || 'Ready'}</span>
                        </div>
                        <div className="form-group">
                          <label>Name</label>
                          <input
                            value={editingGoldenImage.name || ''}
                            onChange={(event) => updateEditingGoldenImage('name', event.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Version</label>
                          <input
                            value={editingGoldenImage.version || ''}
                            onChange={(event) => updateEditingGoldenImage('version', event.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Method</label>
                          <select
                            value={editingGoldenImage.method || 'TableByTableCopy'}
                            onChange={(event) => updateEditingGoldenImage('method', event.target.value)}
                          >
                            <option value="TableByTableCopy">Table by Table Copy</option>
                            <option value="BackupRestore">Backup Restore</option>
                            <option value="ReplicaBackup">Replica Backup</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Database Type</label>
                          <select
                            value={editingGoldenImage.databaseType || 'sql-server'}
                            onChange={(event) => updateEditingGoldenImage('databaseType', event.target.value)}
                          >
                            <option value="sql-server">SQL Server</option>
                            <option value="postgresql">PostgreSQL</option>
                            <option value="mysql">MySQL</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Database Name</label>
                          <input
                            value={editingGoldenImage.databaseName || ''}
                            onChange={(event) => updateEditingGoldenImage('databaseName', event.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Source Database</label>
                          <input
                            value={editingGoldenImage.sourceDatabase || ''}
                            onChange={(event) => updateEditingGoldenImage('sourceDatabase', event.target.value)}
                          />
                        </div>
                        <div className="form-group">
                          <label>Driver</label>
                          <select
                            value={editingGoldenImage.driver || 'System.Data.SqlClient'}
                            onChange={(event) => updateEditingGoldenImage('driver', event.target.value)}
                          >
                            <option value="System.Data.SqlClient">System.Data.SqlClient</option>
                            <option value="Microsoft.Data.SqlClient">Microsoft.Data.SqlClient</option>
                            <option value="ODBC Driver 18 for SQL Server">ODBC Driver 18 for SQL Server</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Authentication</label>
                          <select
                            value={editingGoldenImage.authenticationMode || 'SqlPassword'}
                            onChange={(event) => updateEditingGoldenImage('authenticationMode', event.target.value)}
                          >
                            <option value="SqlPassword">SQL Password</option>
                            <option value="Integrated">Integrated</option>
                            <option value="ManagedIdentity">Managed Identity</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Output Path</label>
                          <input
                            value={editingGoldenImage.outputPath || ''}
                            onChange={(event) => updateEditingGoldenImage('outputPath', event.target.value)}
                          />
                        </div>
                        {editingGoldenImage.method === 'BackupRestore' && (
                          <div className="form-group">
                            <label>Backup File</label>
                            <input
                              value={editingGoldenImage.backupFile || ''}
                              onChange={(event) => updateEditingGoldenImage('backupFile', event.target.value)}
                            />
                          </div>
                        )}
                        <div className="form-group">
                          <label>Source Connection</label>
                          <textarea
                            value={editingGoldenImage.sourceConnection || ''}
                            onChange={(event) => updateEditingGoldenImage('sourceConnection', event.target.value)}
                            rows={3}
                          />
                        </div>
                        <div className="form-group">
                          <label>Destination Connection</label>
                          <textarea
                            value={editingGoldenImage.destinationConnection || ''}
                            onChange={(event) => updateEditingGoldenImage('destinationConnection', event.target.value)}
                            rows={3}
                          />
                        </div>
                        <div className="card-actions">
                          <button className="btn-secondary btn-icon" onClick={() => handleUpdateGoldenImage(image.id)}>
                            <ConsoleIcon name="edit" className="console-icon" />
                            Save
                          </button>
                          <button className="btn-secondary" onClick={cancelEditGoldenImage}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="card-header-row">
                          <h3>{image.name}</h3>
                          <span className={`chip chip-${toneForStatus(image.status || 'Ready')}`}>{image.status || 'Ready'}</span>
                        </div>
                        <div className="chip-row">
                          <span className={`chip chip-${toneForMethod(image.method)}`}>{image.method}</span>
                          <span className="chip chip-cyan">{image.databaseType}</span>
                          <span className="chip chip-green">{image.tableCount || 0} tables</span>
                          <span className="chip chip-violet">{compactNumber(image.rowCount || 0)} rows</span>
                        </div>
                        <div className="stat-grid">
                          <div className="stat-mini"><span>Version</span><strong>{image.version}</strong></div>
                          <div className="stat-mini"><span>Database</span><strong>{image.databaseName || 'Unknown'}</strong></div>
                          <div className="stat-mini"><span>Size</span><strong>{formatBytes(image.sizeBytes)}</strong></div>
                          <div className="stat-mini"><span>Created</span><strong>{formatDate(image.createdAt)}</strong></div>
                        </div>
                        {image.copiedTables && image.copiedTables.length > 0 && (
                          <p className="helper-text">Copied tables: {image.copiedTables.join(', ')}</p>
                        )}
                        <div className="card-actions">
                          <button className="btn-secondary btn-icon" onClick={() => startEditGoldenImage(image)}>
                            <ConsoleIcon name="edit" className="console-icon" />
                            Edit
                          </button>
                          <button className="btn-danger btn-icon" onClick={() => handleDeleteGoldenImage(image.id)}>
                            <ConsoleIcon name="delete" className="console-icon" />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="section">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">Create Golden Image wizard</div>
                <h2>Create Golden Image</h2>
                <p className="workflow-help">The wizard below includes schema exploration and table selection before submission.</p>
              </div>
            </div>
            <CreateGoldenImageForm onSuccess={loadData} />
          </div>

          <div className="section">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">Clone actions</div>
                <h2>Clones</h2>
                <p className="workflow-help">Create clones from an image, then open restore points or delete the clone when it is no longer needed.</p>
              </div>
            </div>

            <CreateCloneForm
              onSuccess={loadData}
              goldenImages={goldenImages.map((image) => ({
                id: image.id,
                name: image.name,
                version: image.version,
                method: image.method
              }))}
            />

            <h3>Active Clones</h3>
            {clones.length === 0 ? (
              <div className="empty-state">
                <ConsoleIcon name="refresh" className="console-icon" />
                <h4>No clones found</h4>
                <p>Create a clone to unlock restore-point actions.</p>
              </div>
            ) : (
              <div className="grid">
                {clones.map((clone) => (
                  <CloneCard
                    key={clone.id}
                    cloneId={clone.id}
                    cloneName={clone.name}
                    databaseName={clone.databaseName}
                    instancePath={clone.instancePath}
                    status={clone.status}
                    createdAt={clone.createdAt}
                    tableCount={clone.tableCount}
                    rowCount={clone.rowCount}
                    sizeBytes={clone.sizeBytes}
                    onOpenCheckpoints={() => setSelectedClone(clone)}
                    onDelete={() => handleDeleteClone(clone.id)}
                    onAction={loadData}
                    onOperationCompleted={() => operationHistoryRef.current?.refresh()}
                  />
                ))}
              </div>
            )}
          </div>

          {selectedClone && (
            <div className="section">
              <div className="panel-header">
                <div>
                  <div className="panel-kicker">Restore points</div>
                  <h2>Restore Points for: {selectedClone.name}</h2>
                  <p className="workflow-help">Manage checkpoints, pin important restore points, and launch restores from the selected clone.</p>
                </div>
                <span className={`chip chip-${selectedCloneStatus}`}>{selectedClone.status}</span>
              </div>
              <CheckpointManager clone={selectedClone} onChanged={loadData} />

              <button className="btn-secondary btn-icon" onClick={() => setSelectedClone(null)}>
                <ConsoleIcon name="restore" className="console-icon" />
                Back
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div className="container">
          <div className="section">
            <div className="panel-header">
              <div>
                <div className="panel-kicker">Audit trail</div>
                <h2>Operation History</h2>
                <p className="workflow-help">Search the complete queue-backed timeline for checkpoint creation, restore, delete, and failed operations.</p>
              </div>
              <div className="chip-row">
                <span className="chip chip-cyan">Searchable</span>
                <span className="chip chip-green">All clones</span>
              </div>
            </div>
            <OperationHistory ref={operationHistoryRef} title="All Operations" />
          </div>
        </div>
      )}

      {activeTab === 'deployment' && (
        <div className="container">
          <DeploymentGuide />
        </div>
      )}

      <footer className="app-footer">
        <p>FlashDB v0.1.0 - Database Virtualization Tool</p>
        <button onClick={loadData} className="btn-refresh btn-icon">
          <ConsoleIcon name="refresh" className="console-icon" />
          Refresh
        </button>
      </footer>
    </div>
  );
}

export default App;
