import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { ConsoleIcon } from './ConsoleIcon';

const API_BASE = '/api';
const DEFAULT_SOURCE_CONNECTION = 'Server=sql-server;Database=TestDB;User Id=sa;Password=FlashDB@Password123;TrustServerCertificate=Yes';
const DEFAULT_DESTINATION_CONNECTION = 'Server=sql-server;Database=master;User Id=sa;Password=FlashDB@Password123;TrustServerCertificate=Yes';

interface CreateGoldenImageFormProps {
  onSuccess: () => void;
}

interface SchemaColumn {
  Name?: string;
  name?: string;
  DataType?: string;
  dataType?: string;
  IsNullable?: boolean;
  isNullable?: boolean;
}

interface SchemaTable {
  SchemaName?: string;
  schemaName?: string;
  TableName?: string;
  tableName?: string;
  FullName?: string;
  fullName?: string;
  RowCount?: number;
  rowCount?: number;
  ColumnCount?: number;
  columnCount?: number;
  Columns?: SchemaColumn[];
  columns?: SchemaColumn[];
}

export const CreateGoldenImageForm: React.FC<CreateGoldenImageFormProps> = ({ onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    version: '',
    method: 'TableByTableCopy',
    databaseType: 'sql-server',
    databaseName: 'TestDB',
    sourceDatabase: 'TestDB',
    driver: 'System.Data.SqlClient',
    authenticationMode: 'SqlPassword',
    outputPath: '/app/data/golden-images',
    backupFile: '',
    sourceConnection: DEFAULT_SOURCE_CONNECTION,
    destinationConnection: DEFAULT_DESTINATION_CONNECTION,
  });
  const [loading, setLoading] = useState(false);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaLoaded, setSchemaLoaded] = useState(false);
  const [schemaTables, setSchemaTables] = useState<SchemaTable[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [selectedTableName, setSelectedTableName] = useState<string | null>(null);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const getTableFullName = (table: SchemaTable) => {
    return table.FullName || table.fullName || `${table.SchemaName || table.schemaName}.${table.TableName || table.tableName}`;
  };

  const getColumns = (table: SchemaTable) => table.Columns || table.columns || [];

  const selectedTable = useMemo(() => {
    if (!selectedTableName) return schemaTables[0] || null;
    return schemaTables.find((table) => getTableFullName(table) === selectedTableName) || schemaTables[0] || null;
  }, [schemaTables, selectedTableName]);

  const selectedTableFullName = selectedTable ? getTableFullName(selectedTable) : null;

  const totalRows = schemaTables.reduce((sum, table) => {
    return sum + (table.RowCount ?? table.rowCount ?? 0);
  }, 0);

  const totalColumns = schemaTables.reduce((sum, table) => {
    const columns = getColumns(table);
    return sum + (table.ColumnCount ?? table.columnCount ?? columns.length);
  }, 0);

  const getTableStatus = (table: SchemaTable) => {
    const rowCount = table.RowCount ?? table.rowCount ?? 0;
    const columnCount = table.ColumnCount ?? table.columnCount ?? getColumns(table).length;

    if (rowCount > 0 && columnCount > 0) return 'Actualized';
    if (columnCount === 0) return 'Queued';
    return 'Ready';
  };

  const resetSchema = () => {
    setSchemaLoaded(false);
    setSchemaTables([]);
    setSelectedTables([]);
    setSelectedTableName(null);
    setSchemaError(null);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));

    if (['method', 'databaseType', 'databaseName', 'sourceDatabase', 'sourceConnection'].includes(name)) {
      resetSchema();
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      version: '',
      method: 'TableByTableCopy',
      databaseType: 'sql-server',
      databaseName: 'TestDB',
      sourceDatabase: 'TestDB',
      driver: 'System.Data.SqlClient',
      authenticationMode: 'SqlPassword',
      outputPath: '/app/data/golden-images',
      backupFile: '',
      sourceConnection: DEFAULT_SOURCE_CONNECTION,
      destinationConnection: DEFAULT_DESTINATION_CONNECTION,
    });
    resetSchema();
  };

  const exploreSchema = async () => {
    setSchemaLoading(true);
    setSchemaError(null);
    setError(null);

    try {
      const response = await axios.post(`${API_BASE}/golden-images/schema`, {
        sourceConnection: formData.sourceConnection,
        databaseName: formData.databaseName,
        sourceDatabase: formData.sourceDatabase,
        databaseType: formData.databaseType
      });

      const tables = response.data?.data?.Tables || response.data?.data?.tables || [];
      const normalizedTables = Array.isArray(tables) ? tables : [tables].filter(Boolean);
      const tableNames = normalizedTables.map(getTableFullName).filter(Boolean);

      setSchemaTables(normalizedTables);
      setSelectedTables(tableNames);
      setSelectedTableName(tableNames[0] || null);
      setSchemaLoaded(true);
    } catch (err: any) {
      setSchemaError(err.response?.data?.message || 'Failed to explore database schema');
      resetSchema();
    } finally {
      setSchemaLoading(false);
    }
  };

  const toggleTableSelection = (tableName: string) => {
    setSelectedTables((prev) => (
      prev.includes(tableName)
        ? prev.filter((item) => item !== tableName)
        : [...prev, tableName]
    ));
    setSelectedTableName(tableName);
  };

  const selectAllTables = () => {
    const tableNames = schemaTables.map(getTableFullName).filter(Boolean);
    setSelectedTables(tableNames);
    setSelectedTableName(tableNames[0] || null);
  };

  const clearTableSelection = () => {
    setSelectedTables([]);
    setSelectedTableName(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      if (formData.method === 'TableByTableCopy' && schemaLoaded && selectedTables.length === 0) {
        throw new Error('Select at least one table for the golden image');
      }

      const payload = {
        ...formData,
        selectedTables: formData.method === 'TableByTableCopy' && selectedTables.length > 0
          ? selectedTables
          : undefined
      };

      const response = await axios.post(`${API_BASE}/golden-images`, payload);

      if (response.data.success) {
        setSuccess(true);
        resetForm();
        onSuccess();
        window.setTimeout(() => {
          setSuccess(false);
        }, 2000);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to create golden image');
    } finally {
      setLoading(false);
    }
  };

  const methodTone = formData.method === 'BackupRestore' ? 'violet' : formData.method === 'ReplicaBackup' ? 'cyan' : 'green';
  const statusTone = schemaLoaded ? 'green' : schemaLoading ? 'amber' : 'cyan';

  return (
    <div className="workflow-panel console-form-shell">
      <div className="panel-header">
        <div>
          <div className="panel-kicker">Golden image wizard</div>
          <h3>Create Golden Image</h3>
          <p className="workflow-help">Select a source, inspect schema, and capture a golden image with a table-aware manifest.</p>
        </div>
        <div className="chip-row">
          <span className={`chip chip-${methodTone}`}>{formData.method}</span>
          <span className={`chip chip-cyan`}>{formData.databaseType}</span>
          <span className={`chip chip-green`}>{schemaTables.length} tables</span>
          <span className="chip chip-violet">{totalColumns} columns</span>
          <span className={`chip chip-amber`}>{totalRows} rows</span>
          <span className={`chip chip-${statusTone}`}>{schemaLoaded ? 'Actualized' : schemaLoading ? 'Scanning' : 'Ready'}</span>
        </div>
      </div>

      {error && <div className="console-banner banner-red">{error}</div>}
      {success && <div className="console-banner banner-green">Golden image created successfully.</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-grid split-two-up">
          <div className="field-group">
            <label>Image Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="TestDB-Golden"
              required
            />
          </div>

          <div className="field-group">
            <label>Version *</label>
            <input
              type="text"
              name="version"
              value={formData.version}
              onChange={handleChange}
              placeholder="1.0.0"
              required
            />
          </div>

          <div className="field-group">
            <label>Method *</label>
            <select name="method" value={formData.method} onChange={handleChange}>
              <option value="TableByTableCopy">Table by Table Copy</option>
              <option value="BackupRestore">Backup Restore</option>
              <option value="ReplicaBackup">Replica Backup</option>
            </select>
          </div>

          <div className="field-group">
            <label>Database Type *</label>
            <select name="databaseType" value={formData.databaseType} onChange={handleChange}>
              <option value="sql-server">SQL Server</option>
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL</option>
            </select>
          </div>

          <div className="field-group">
            <label>Driver *</label>
            <select name="driver" value={formData.driver} onChange={handleChange}>
              <option value="System.Data.SqlClient">System.Data.SqlClient</option>
              <option value="Microsoft.Data.SqlClient">Microsoft.Data.SqlClient</option>
              <option value="ODBC Driver 18 for SQL Server">ODBC Driver 18 for SQL Server</option>
            </select>
          </div>

          <div className="field-group">
            <label>Authentication *</label>
            <select
              name="authenticationMode"
              value={formData.authenticationMode}
              onChange={handleChange}
            >
              <option value="SqlPassword">SQL Password</option>
              <option value="Integrated">Integrated</option>
              <option value="ManagedIdentity">Managed Identity</option>
            </select>
          </div>

          <div className="field-group">
            <label>Output Path *</label>
            <input
              type="text"
              name="outputPath"
              value={formData.outputPath}
              onChange={handleChange}
              placeholder="/app/data/golden-images"
              required
            />
          </div>

          {formData.method === 'BackupRestore' && (
            <div className="field-group">
              <label>Backup File *</label>
              <input
                type="text"
                name="backupFile"
                value={formData.backupFile}
                onChange={handleChange}
                placeholder="/app/backups/TestDB.bak"
                required
              />
            </div>
          )}

          <div className="field-group">
            <label>Database Name</label>
            <input
              type="text"
              name="databaseName"
              value={formData.databaseName}
              onChange={handleChange}
              placeholder="TestDB"
            />
          </div>

          <div className="field-group">
            <label>Source Database</label>
            <input
              type="text"
              name="sourceDatabase"
              value={formData.sourceDatabase}
              onChange={handleChange}
              placeholder="TestDB"
            />
          </div>
        </div>

        <div className="field-group">
          <label>Source Connection{formData.method !== 'BackupRestore' ? ' *' : ''}</label>
          <textarea
            name="sourceConnection"
            value={formData.sourceConnection}
            onChange={handleChange}
            placeholder={DEFAULT_SOURCE_CONNECTION}
            rows={3}
            required={formData.method !== 'BackupRestore'}
          />
        </div>

        <div className="field-group">
          <label>Destination Connection</label>
          <textarea
            name="destinationConnection"
            value={formData.destinationConnection}
            onChange={handleChange}
            placeholder={DEFAULT_DESTINATION_CONNECTION}
            rows={3}
          />
        </div>

        {formData.method === 'TableByTableCopy' && formData.databaseType === 'sql-server' && (
          <div className="schema-explorer">
            <div className="schema-header">
              <div>
                <div className="panel-kicker">Schema explorer</div>
                <h4>Table selector</h4>
                <p className="workflow-help">
                  {schemaLoaded
                    ? `${selectedTables.length}/${schemaTables.length} tables selected`
                    : 'Load tables from the source database and inspect column metadata in the detail pane.'}
                </p>
              </div>
              <div className="schema-actions">
                <button type="button" className="button-secondary btn-icon" onClick={exploreSchema} disabled={schemaLoading}>
                  <ConsoleIcon name="explore" className="console-icon" />
                  {schemaLoading ? 'Scanning schema...' : 'Explore Schema'}
                </button>
                {schemaLoaded && (
                  <>
                    <button type="button" className="button-secondary" onClick={selectAllTables}>Select All</button>
                    <button type="button" className="button-secondary" onClick={clearTableSelection}>Clear</button>
                  </>
                )}
              </div>
            </div>

            {schemaError && <div className="console-banner banner-red">{schemaError}</div>}

            {schemaLoading && (
              <div className="schema-split">
                <div className="schema-list-panel">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="schema-table-skeleton">
                      <div className="skeleton skeleton-line" style={{ width: '68%' }} />
                      <div className="skeleton skeleton-line" style={{ width: '46%' }} />
                    </div>
                  ))}
                </div>
                <div className="schema-detail-panel">
                  <div className="skeleton skeleton-card" />
                </div>
              </div>
            )}

            {!schemaLoading && schemaLoaded && (
              <div className="schema-split">
                <aside className="schema-list-panel">
                  {schemaTables.length === 0 ? (
                    <div className="empty-state">
                      <ConsoleIcon name="schema" className="console-icon" />
                      <h4>No user tables found</h4>
                      <p>Load a source database that contains tables to populate the selector.</p>
                    </div>
                  ) : (
                    schemaTables.map((table) => {
                      const fullName = getTableFullName(table);
                      const columns = getColumns(table);
                      const rowCount = table.RowCount ?? table.rowCount ?? 0;
                      const columnCount = table.ColumnCount ?? table.columnCount ?? columns.length;
                      const isSelected = selectedTables.includes(fullName);

                      return (
                        <button
                          key={fullName}
                          type="button"
                          className={`schema-table-row ${selectedTableFullName === fullName ? 'is-active' : ''}`}
                          onClick={() => setSelectedTableName(fullName)}
                        >
                          <div className="schema-table-row-main">
                            <label className="schema-table-check" onClick={(event) => event.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleTableSelection(fullName)}
                              />
                              <span>{fullName}</span>
                            </label>
                            <div className="chip-row">
                              <span className="chip chip-cyan">{rowCount} rows</span>
                              <span className="chip chip-violet">{columnCount} columns</span>
                              <span className={`chip chip-${rowCount > 0 ? 'green' : 'amber'}`}>{getTableStatus(table)}</span>
                            </div>
                          </div>
                          <ConsoleIcon name="database" className="console-icon schema-row-icon" />
                        </button>
                      );
                    })
                  )}
                </aside>

                <section className="schema-detail-panel">
                  {selectedTable ? (
                    <>
                      <div className="schema-detail-header">
                        <div>
                          <div className="panel-kicker">Selected table</div>
                          <h4>{selectedTableFullName}</h4>
                          <p className="workflow-help">Column metadata, counts, and selection state for the current table.</p>
                        </div>
                        <div className="chip-row">
                          <span className="chip chip-cyan">{selectedTable.RowCount ?? selectedTable.rowCount ?? 0} rows</span>
                          <span className="chip chip-violet">{selectedTable.ColumnCount ?? selectedTable.columnCount ?? getColumns(selectedTable).length} columns</span>
                          <span className={`chip chip-${getTableStatus(selectedTable) === 'Actualized' ? 'green' : 'amber'}`}>{getTableStatus(selectedTable)}</span>
                        </div>
                      </div>

                      <div className="schema-detail-grid">
                        <div className="schema-detail-stat">
                          <span>Schema</span>
                          <strong>{selectedTable.SchemaName || selectedTable.schemaName || 'dbo'}</strong>
                        </div>
                        <div className="schema-detail-stat">
                          <span>Included</span>
                          <strong>{selectedTables.includes(selectedTableFullName || '') ? 'Yes' : 'No'}</strong>
                        </div>
                        <div className="schema-detail-stat">
                          <span>Rows</span>
                          <strong>{selectedTable.RowCount ?? selectedTable.rowCount ?? 0}</strong>
                        </div>
                        <div className="schema-detail-stat">
                          <span>Columns</span>
                          <strong>{selectedTable.ColumnCount ?? selectedTable.columnCount ?? getColumns(selectedTable).length}</strong>
                        </div>
                      </div>

                      <div className="schema-column-list">
                        {getColumns(selectedTable).length === 0 ? (
                          <div className="empty-state compact">
                            <ConsoleIcon name="warning" className="console-icon" />
                            <p>No column metadata returned for this table.</p>
                          </div>
                        ) : (
                          getColumns(selectedTable).map((column, index) => {
                            const columnName = column.Name || column.name || `column-${index + 1}`;
                            const dataType = column.DataType || column.dataType || 'unknown';
                            const nullable = column.IsNullable ?? column.isNullable;

                            return (
                              <div key={`${selectedTableFullName}-${columnName}-${index}`} className="column-pill">
                                <span>{columnName}</span>
                                <em>{dataType}{nullable ? ' null' : ''}</em>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="empty-state">
                      <ConsoleIcon name="schema" className="console-icon" />
                      <h4>No table selected</h4>
                      <p>Choose a table from the left panel to inspect its columns and selection state.</p>
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}

        <div className="button-row" style={{ marginTop: '1rem' }}>
          <button type="submit" className="button-primary btn-icon" disabled={loading}>
            <ConsoleIcon name="create" className="console-icon" />
            {loading ? 'Creating...' : 'Create Golden Image'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CreateGoldenImageForm;
