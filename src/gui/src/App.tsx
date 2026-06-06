import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';
import { CreateGoldenImageForm } from './components/CreateGoldenImageForm';
import { CreateCloneForm } from './components/CreateCloneForm';
import { CheckpointManager } from './components/CheckpointManager';
import Dashboard from './components/Dashboard';

interface Clone {
  id: string;
  name: string;
  goldenImageId: string;
  instancePath: string;
  databaseName: string;
  databaseType: string;
  status: string;
  createdAt: string;
}

interface GoldenImage {
  id: string;
  name: string;
  version: string;
  method: string;
  databaseType: string;
  createdAt: string;
  sizeBytes: number;
}

type AppTab = 'dashboard' | 'management';

const getInitialTab = (): AppTab => {
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tab === 'management' ? 'management' : 'dashboard';
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
    createdAt: firstValue<string>(value, ['createdAt', 'CreatedAt']) || ''
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
    sizeBytes: toNumber(firstValue<number>(value, ['sizeBytes', 'SizeBytes', 'size', 'Size']))
  };
};

const normalizeList = <T,>(value: any, normalizer: (item: any) => T | null): T[] => {
  return asArray(value)
    .map(normalizer)
    .filter((item): item is T => item !== null);
};

function App() {
  const [clones, setClones] = useState<Clone[]>([]);
  const [goldenImages, setGoldenImages] = useState<GoldenImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClone, setSelectedClone] = useState<Clone | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>(getInitialTab);

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

  const handleCreateClone = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      const response = await axios.post(`${API_BASE}/clones`, {
        goldenImageId: formData.get('goldenImageId'),
        cloneName: formData.get('cloneName'),
        instancePath: formData.get('instancePath'),
        storagePath: formData.get('storagePath')
      });

      const createdClone = normalizeClone(response.data.data);
      if (createdClone) {
        setClones([...clones, createdClone]);
      }
      (e.target as HTMLFormElement).reset();
      setError(null);
    } catch (err: any) {
      setError(`Failed to create clone: ${err.response?.data?.message || err.message}`);
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

  return (
    <div className="app">
      <header className="app-header">
        <h1>FlashDB Management</h1>
        <p>Database Virtualization Management</p>
      </header>

      {error && (
        <div className="error-alert">
          <p>⚠️ {error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <nav className="app-tabs">
        <button
          className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => selectTab('dashboard')}
        >
          Metrics Dashboard
        </button>
        <button
          className={`tab ${activeTab === 'management' ? 'active' : ''}`}
          onClick={() => selectTab('management')}
        >
          Management
        </button>
      </nav>

      {activeTab === 'dashboard' && <Dashboard />}

      {activeTab === 'management' && <div className="container">
        <div className="section">
          <h2>Golden Images</h2>
          {loading ? (
            <p>Loading...</p>
          ) : goldenImages.length === 0 ? (
            <p>No golden images found</p>
          ) : (
            <div className="grid">
              {goldenImages.map(image => (
                <div key={image.id} className="card">
                  <h3>{image.name}</h3>
                  <p><strong>Version:</strong> {image.version}</p>
                  <p><strong>Method:</strong> {image.method}</p>
                  <p><strong>Database:</strong> {image.databaseType}</p>
                  <p><strong>Size:</strong> {formatBytes(image.sizeBytes)}</p>
                  <p><strong>Created:</strong> {formatDate(image.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <h2>Create Golden Image</h2>
          <CreateGoldenImageForm onSuccess={loadData} />
        </div>

        <div className="section">
          <h2>Clones</h2>
          <CreateCloneForm onSuccess={loadData} />

          <h3>Active Clones</h3>
          {clones.length === 0 ? (
            <p>No clones found</p>
          ) : (
            <div className="grid">
              {clones.map(clone => (
                <div key={clone.id} className="card" onClick={() => setSelectedClone(clone)}>
                  <h4>{clone.name}</h4>
                  <p><strong>Status:</strong> {clone.status}</p>
                  <p><strong>Database:</strong> {clone.databaseName}</p>
                  <p><strong>Type:</strong> {clone.databaseType}</p>
                  <p><strong>Instance:</strong> {clone.instancePath}</p>
                  <p><strong>Created:</strong> {formatDate(clone.createdAt)}</p>
                  <div className="card-actions">
                    <button
                      className="btn-secondary"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedClone(clone);
                      }}
                    >
                      Restore Points
                    </button>
                    <button
                      className="btn-danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteClone(clone.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedClone && (
          <div className="section">
            <h2>Restore Points for: {selectedClone.name}</h2>
            <CheckpointManager clone={selectedClone} onChanged={loadData} />
            <button className="btn-secondary" onClick={() => setSelectedClone(null)}>Back</button>
          </div>
        )}
      </div>}

      <footer className="app-footer">
        <p>FlashDB v0.1.0 - Database Virtualization Tool</p>
        <button onClick={loadData} className="btn-refresh">Refresh</button>
      </footer>
    </div>
  );
}

export default App;
