import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css';

interface Clone {
  id: string;
  name: string;
  goldenImageId: string;
  status: string;
  createdAt: string;
}

interface GoldenImage {
  id: string;
  name: string;
  version: string;
  createdAt: string;
  sizeBytes: number;
}

function App() {
  const [clones, setClones] = useState<Clone[]>([]);
  const [goldenImages, setGoldenImages] = useState<GoldenImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClone, setSelectedClone] = useState<Clone | null>(null);

  const API_BASE = 'http://localhost:3001/api';

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

      setClones(clonesRes.data.data || []);
      setGoldenImages(imagesRes.data.data || []);
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

      setClones([...clones, response.data.data]);
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

  const formatBytes = (bytes: number) => {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>🎯 FlashDB Dashboard</h1>
        <p>Database Virtualization Management</p>
      </header>

      {error && (
        <div className="error-alert">
          <p>⚠️ {error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="container">
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
                  <p><strong>Size:</strong> {formatBytes(image.sizeBytes)}</p>
                  <p><strong>Created:</strong> {formatDate(image.createdAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="section">
          <h2>Clones</h2>

          <form className="form" onSubmit={handleCreateClone}>
            <h3>Create New Clone</h3>
            <div className="form-group">
              <label>Golden Image:</label>
              <select name="goldenImageId" required>
                <option value="">Select a golden image</option>
                {goldenImages.map(image => (
                  <option key={image.id} value={image.id}>{image.name} ({image.version})</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Clone Name:</label>
              <input type="text" name="cloneName" placeholder="e.g., dev-test-1" required />
            </div>

            <div className="form-group">
              <label>SQL Instance:</label>
              <input type="text" name="instancePath" placeholder="e.g., LOCALHOST\SQLEXPRESS" required />
            </div>

            <div className="form-group">
              <label>Storage Path:</label>
              <input type="text" name="storagePath" placeholder="e.g., D:\CloneStorage" required />
            </div>

            <button type="submit" className="btn-primary">Create Clone</button>
          </form>

          <h3>Active Clones</h3>
          {clones.length === 0 ? (
            <p>No clones found</p>
          ) : (
            <div className="grid">
              {clones.map(clone => (
                <div key={clone.id} className="card" onClick={() => setSelectedClone(clone)}>
                  <h4>{clone.name}</h4>
                  <p><strong>Status:</strong> {clone.status}</p>
                  <p><strong>Instance:</strong> {clone.instancePath}</p>
                  <p><strong>Created:</strong> {formatDate(clone.createdAt)}</p>
                  <div className="card-actions">
                    <button className="btn-danger" onClick={() => handleDeleteClone(clone.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedClone && (
          <div className="section">
            <h2>Clone Details: {selectedClone.name}</h2>
            <div className="details">
              <p><strong>Clone ID:</strong> {selectedClone.id}</p>
              <p><strong>Golden Image ID:</strong> {selectedClone.goldenImageId}</p>
              <p><strong>Status:</strong> {selectedClone.status}</p>
              <p><strong>Created:</strong> {formatDate(selectedClone.createdAt)}</p>
            </div>

            <h3>Checkpoints</h3>
            <p>Checkpoint management coming soon...</p>

            <button className="btn-secondary" onClick={() => setSelectedClone(null)}>Close</button>
          </div>
        )}
      </div>

      <footer className="app-footer">
        <p>FlashDB v0.1.0 - Database Virtualization Tool</p>
        <button onClick={loadData} className="btn-refresh">🔄 Refresh</button>
      </footer>
    </div>
  );
}

export default App;
