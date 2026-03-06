import React, { useState } from 'react';
import Header from '../components/Header';
import { Upload, Database, AlertCircle, CheckCircle2 } from 'lucide-react';

const Compta: React.FC = () => {
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryResult, setQueryResult] = useState<any[] | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{type: string, message: string, isError: boolean} | null>(null);

  const handleFileUpload = async (endpoint: string, file: File, type: string) => {
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      setImportStatus({ type, message: 'Importation en cours...', isError: false });
      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });
      
      const data = await response.json();
      if (response.ok) {
        setImportStatus({ type, message: data.message || 'Importation réussie', isError: false });
      } else {
        setImportStatus({ type, message: data.message || 'Erreur lors de l\'importation', isError: true });
      }
    } catch (error: any) {
      setImportStatus({ type, message: error.message || 'Erreur réseau', isError: true });
    }
  };

  const executeQuery = async () => {
    if (!sqlQuery.trim()) return;
    
    setQueryError(null);
    setQueryResult(null);
    
    try {
      const response = await fetch('http://localhost:3001/api/sql-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ query: sqlQuery })
      });
      
      const data = await response.json();
      if (response.ok) {
        setQueryResult(data.data);
      } else {
        setQueryError(data.message || 'Erreur lors de l\'exécution');
      }
    } catch (error: any) {
      setQueryError(error.message || 'Erreur réseau');
    }
  };

  return (
    <div className="page-container">
      <Header />
      <main className="container main-content" style={{ marginTop: '20px' }}>
        <h1 style={{ color: 'var(--secondary-color)', marginBottom: '30px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Database size={28} /> Suivi Comptable
        </h1>

        <div className="compta-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Section Import */}
          <section className="compta-card" style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
            <h2 style={{ borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Upload size={20} /> Import Excel
            </h2>

            <div className="import-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Lignes Budgétaires */}
              <div className="import-item">
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Lignes Budgétaires</label>
                <input type="file" accept=".xlsx,.xls" onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload('/api/budget/import-lines', e.target.files[0], 'lignes');
                    e.target.value = '';
                  }
                }} />
                {importStatus?.type === 'lignes' && (
                  <div style={{ marginTop: '8px', color: importStatus.isError ? '#d32f2f' : '#2e7d32', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {importStatus.isError ? <AlertCircle size={16}/> : <CheckCircle2 size={16}/>} {importStatus.message}
                  </div>
                )}
              </div>

              {/* Commandes */}
              <div className="import-item">
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Commandes</label>
                <input type="file" accept=".xlsx,.xls" onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload('/api/orders/import', e.target.files[0], 'commandes');
                    e.target.value = '';
                  }
                }} />
                {importStatus?.type === 'commandes' && (
                  <div style={{ marginTop: '8px', color: importStatus.isError ? '#d32f2f' : '#2e7d32', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {importStatus.isError ? <AlertCircle size={16}/> : <CheckCircle2 size={16}/>} {importStatus.message}
                  </div>
                )}
              </div>

              {/* Factures */}
              <div className="import-item">
                <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Factures</label>
                <input type="file" accept=".xlsx,.xls" onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload('/api/budget/import-invoices', e.target.files[0], 'factures');
                    e.target.value = '';
                  }
                }} />
                {importStatus?.type === 'factures' && (
                  <div style={{ marginTop: '8px', color: importStatus.isError ? '#d32f2f' : '#2e7d32', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {importStatus.isError ? <AlertCircle size={16}/> : <CheckCircle2 size={16}/>} {importStatus.message}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Section SQL Query */}
          <section className="compta-card" style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={20} /> Requête SQL Libre
            </h2>
            <textarea 
              value={sqlQuery} 
              onChange={e => setSqlQuery(e.target.value)}
              placeholder="SELECT * FROM budget_lines LIMIT 10;"
              style={{ width: '100%', minHeight: '120px', padding: '10px', fontFamily: 'monospace', borderRadius: '4px', border: '1px solid #ccc', marginBottom: '10px', resize: 'vertical' }}
            />
            <button 
              onClick={executeQuery}
              className="btn btn-primary"
              style={{ alignSelf: 'flex-start' }}
            >
              Exécuter la requête
            </button>

            {queryError && (
              <div style={{ marginTop: '15px', padding: '10px', background: '#ffebee', color: '#c62828', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <AlertCircle size={18} /> {queryError}
              </div>
            )}
          </section>
        </div>

        {/* Query Results */}
        {queryResult && (
          <section className="compta-card" style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', marginTop: '20px', overflowX: 'auto' }}>
            <h2 style={{ borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px' }}>Résultats ({queryResult.length} lignes)</h2>
            
            {queryResult.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                    {Object.keys(queryResult[0]).map(key => (
                      <th key={key} style={{ padding: '10px', textAlign: 'left', fontWeight: 'bold' }}>{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {queryResult.map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                      {Object.values(row).map((val: any, vIdx) => (
                        <td key={vIdx} style={{ padding: '8px 10px' }}>{val?.toString() || ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>Aucun résultat trouvé.</p>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default Compta;
