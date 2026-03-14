import React, { useState, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { 
  Play, RefreshCw, Terminal, AlertCircle, CheckCircle2,
  Trash2, Maximize2, Minimize2,
  Download, Database
} from 'lucide-react';

interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: any;
  pk: number;
}

interface QueryResult {
  records: any[];
  columns?: ColumnInfo[];
  total?: number;
  count?: number;
  executionTime?: number;
}

const AdminSQL: React.FC = () => {
  const { token } = useAuth();
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isConsoleExpanded, setIsConsoleExpanded] = useState(false);
  const [tables, setTables] = useState<{name: string, type: string}[]>([]);
  const [databases, setDatabases] = useState<{seq: number, name: string, file: string}[]>([]);
  const [selectedDb, setSelectedDb] = useState<string>('main');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  
  const resultsRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    fetchTables(selectedDb);
  }, [selectedDb]);

  const fetchTables = async (dbName: string = 'main') => {
    try {
      setLoading(true);
      const dbRes = await axios.get('/api/admin/sql/databases', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDatabases(dbRes.data);

      const res = await axios.get(`/api/admin/sql/tables?db=${dbName}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTables(res.data);
    } catch (err) {
      console.error('Erreur lecture données:', err);
    } finally {
      setLoading(false);
    }
  };

  const runQuery = async (customQuery?: string) => {
    const finalQuery = customQuery || query;
    if (!finalQuery.trim()) return;
    
    setQueryError(null);
    setLoading(true);
    try {
      const res = await axios.post('/api/admin/sql/query', 
        { sql: finalQuery },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setQueryResult(res.data);
      if (customQuery) setQuery(customQuery);
      
      // Scroll to results
      setTimeout(() => {
        resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      setQueryError(err.response?.data?.message || err.message);
      setQueryResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleTableClick = (tableName: string) => {
    setSelectedTable(tableName);
    const q = `SELECT * FROM "${selectedDb}"."${tableName}" LIMIT 25`;
    runQuery(q);
  };

  const exportCSV = (data: any[]) => {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = row[h];
        return typeof val === 'string' ? `"${val.replace(/"/g, '""')}"` : val;
      }).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `query_export_${new Date().getTime()}.csv`);
    link.click();
  };

  const renderTableContent = (records: any[]) => {
    if (!records || records.length === 0) {
      return (
        <div className="empty-state">
          <AlertCircle size={40} />
          <p>Aucune donnée trouvée</p>
        </div>
      );
    }
    
    const cols = Object.keys(records[0]);
    
    return (
      <div className="sql-table-wrapper">
        <table className="sql-data-table">
          <thead>
            <tr>
              {cols.map((col: string) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.map((row, idx) => (
              <tr key={idx}>
                {cols.map((col: string) => {
                  const val = row[col];
                  return (
                    <td key={col} title={val !== null ? String(val) : 'NULL'}>
                      {val === null ? <span className="null-val">NULL</span> : String(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="sql-explorer-container">
      <div className="sql-layout">
        <aside className="sql-sidebar">
          <div className="sidebar-header">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} onClick={() => fetchTables(selectedDb)} />
            <span>Explorateur SQL</span>
          </div>
          <div className="sidebar-content">
            <div className="section-title">Bases de données</div>
            {databases.map(d => (
              <div 
                key={d.name} 
                className={`table-item db-item ${selectedDb === d.name ? 'active' : ''}`}
                title={d.file}
                onClick={() => { setSelectedDb(d.name); setSelectedTable(null); setQuery(''); setQueryResult(null); }}
              >
                <Database size={12} className="text-gray" />
                <span className="table-name">{d.name} <span className="text-muted" style={{fontSize: '0.7rem', opacity: 0.7}}>({d.file ? 'Attachée' : 'Mémoire'})</span></span>
              </div>
            ))}
            
            <div className="section-title mt-4">Tables & Vues ({selectedDb})</div>
            {tables.map(t => (
              <div 
                key={t.name} 
                className={`table-item ${selectedTable === t.name ? 'active' : ''}`}
                onClick={() => handleTableClick(t.name)}
              >
                <Terminal size={12} className={t.type === 'view' ? 'text-purple' : 'text-blue'} />
                <span className="table-name">{t.name}</span>
              </div>
            ))}
          </div>
        </aside>

        <main className="sql-main">
          <div className="query-container">
            <div className={`editor-panel ${isConsoleExpanded ? 'expanded' : ''}`}>
              <div className="editor-header">
                <div className="header-info">
                  <Terminal size={14} />
                  <span>Console SQL (SELECT uniquement)</span>
                </div>
                <div className="header-actions">
                  <button onClick={() => setIsConsoleExpanded(!isConsoleExpanded)} className="icon-btn">
                    {isConsoleExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                  </button>
                  <button onClick={() => {setQuery(''); setSelectedTable(null);}} className="icon-btn text-red" title="Effacer">
                    <Trash2 size={14} />
                  </button>
                  <button onClick={() => runQuery()} disabled={loading || !query.trim()} className="run-btn">
                    <Play size={14} /> {loading ? 'Exécution...' : 'Exécuter'}
                  </button>
                </div>
              </div>
              
              <textarea
                className="sql-editor"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: SELECT * FROM v_tickets LIMIT 50"
                spellCheck={false}
              />
            </div>

            <div className="query-results-panel" ref={resultsRef}>
              {queryError && (
                <div className="error-banner">
                  <AlertCircle size={18} />
                  <div className="error-text">
                    <strong>Erreur d'exécution</strong>
                    <p>{queryError}</p>
                  </div>
                </div>
              )}

              {queryResult && (
                <div className="results-view">
                  <div className="results-header">
                    <div className="stats">
                      <CheckCircle2 size={16} className="text-green" />
                      <span><strong>{queryResult.count}</strong> ligne(s) retournée(s)</span>
                      <span className="divider">|</span>
                      <span>Temps : <strong>{queryResult.executionTime}ms</strong></span>
                      {selectedTable && <span className="divider">|</span>}
                      {selectedTable && <span className="text-blue">Aperçu : <strong>{selectedTable}</strong></span>}
                    </div>
                    <button onClick={() => exportCSV(queryResult.records)} className="action-btn-sm">
                      <Download size={12} /> Export CSV
                    </button>
                  </div>
                  
                  <div className="results-data">
                    {renderTableContent(queryResult.records)}
                  </div>
                </div>
              )}

              {!queryResult && !queryError && !loading && (
                <div className="results-placeholder">
                  <Terminal size={32} className="icon-muted" />
                  <p>Choisissez une table à gauche ou saisissez une requête SELECT et cliquez sur Exécuter.</p>
                </div>
              )}
              
              {loading && !queryResult && (
                <div className="results-loading">
                  <RefreshCw className="animate-spin" />
                  <span>Exécution de la requête en cours...</span>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      <style>{`
        .sql-explorer-container {
          height: calc(100vh - 120px);
          display: flex;
          flex-direction: column;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        .sql-layout {
          display: flex;
          height: 100%;
          background-color: #e2e8f0;
          overflow: hidden;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
        }
        .sql-sidebar {
          width: 250px;
          background-color: #f8fafc;
          border-right: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .sidebar-header {
          padding: 15px;
          background: #f1f5f9;
          font-size: 0.75rem;
          font-weight: 800;
          color: #475569;
          display: flex;
          align-items: center;
          gap: 10px;
          text-transform: uppercase;
          border-bottom: 1px solid #e2e8f0;
        }
        .sidebar-header .animate-spin { cursor: pointer; }
        .sidebar-content {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
        }
        .table-item {
          padding: 8px 12px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.85rem;
          color: #475569;
          margin-bottom: 2px;
        }
        .table-item:hover { background-color: #eff6ff; color: #1d4ed8; }
        .table-item.active { background-color: #dbeafe; color: #1d4ed8; font-weight: 700; }
        .table-item.db-item { background-color: #f1f5f9; cursor: pointer; }
        .table-item.db-item:hover { background-color: #e2e8f0; color: #1e293b; }
        .table-item.db-item.active { background-color: #cbd5e1; color: #0f172a; border-left: 3px solid #3b82f6; }
        .table-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .section-title { font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 8px; padding-left: 4px; }
        .mt-4 { margin-top: 16px; }
        .text-purple { color: #8b5cf6; }
        .text-blue { color: #3b82f6; }
        .text-gray { color: #64748b; }
        
        .sql-main {
          flex: 1;
          background-color: white;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .query-container {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        .editor-panel {
          padding: 20px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
        }
        .editor-panel.expanded { height: 100%; }
        .editor-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
        }
        .header-info {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          font-weight: 700;
          color: #64748b;
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .run-btn {
          background-color: #3b82f6;
          color: white;
          border: none;
          padding: 8px 20px;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        .run-btn:hover { background-color: #2563eb; }
        .run-btn:disabled { background-color: #94a3b8; cursor: not-allowed; }
        .icon-btn {
          background: none;
          border: 1px solid #e2e8f0;
          padding: 8px;
          border-radius: 8px;
          color: #64748b;
          cursor: pointer;
        }
        .sql-editor {
          width: 100%;
          min-height: 150px;
          padding: 15px;
          background-color: #1e293b;
          color: #f8fafc;
          border-radius: 12px;
          font-family: monospace;
          font-size: 0.95rem;
          outline: none;
        }
        .query-results-panel {
          flex: 1;
          overflow-y: auto;
          background-color: #f8fafc;
          padding: 20px;
        }
        .results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 15px;
          background: white;
          padding: 10px 15px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
        }
        .stats {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 0.85rem;
          color: #475569;
        }
        .action-btn-sm {
          background: #f1f5f9;
          border: none;
          padding: 5px 12px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 700;
          color: #475569;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .sql-table-wrapper {
          overflow: auto;
          max-height: 100%;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: white;
        }
        .sql-data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.85rem;
        }
        .sql-data-table th {
          position: sticky;
          top: 0;
          background-color: #f8fafc;
          padding: 12px 15px;
          text-align: left;
          border-bottom: 2px solid #e2e8f0;
        }
        .sql-data-table td {
          padding: 10px 15px;
          border-bottom: 1px solid #f1f5f9;
          white-space: nowrap;
        }
        .null-val { color: #cbd5e1; font-style: italic; }
        .error-banner {
          background-color: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 15px;
          display: flex;
          gap: 12px;
          color: #dc2626;
        }
        .animate-spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default AdminSQL;
