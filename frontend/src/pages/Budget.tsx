import React, { useState, useEffect, useMemo } from 'react';
import Header from '../components/Header';
import { Upload, CheckCircle, Search, Filter, BookOpen, X, Columns, Eye, EyeOff, Euro, FileText, ShoppingCart, Activity, Database, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ColumnSetting {
  id: number;
  column_key: string;
  label: string;
  is_visible: number;
  display_order: number;
  color: string | null;
  is_bold: number;
  is_italic: number;
}

const Budget: React.FC = () => {
  const [view, setView] = useState<'summary' | 'lines' | 'invoices' | 'orders' | 'gestion'>('summary');
  const [isRaw, setIsRaw] = useState(false);
  const [rawData, setRawData] = useState<any[]>([]);
  const [budgetLines, setBudgetLines] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [m57Plan, setM57Plan] = useState<any[]>([]);
  const [columnSettings, setColumnSettings] = useState<ColumnSetting[]>([]);
  
  const [showM57, setShowM57] = useState(false);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  
  // Gestion state
  const [sqlQuery, setSqlQuery] = useState('');
  const [queryResult, setQueryResult] = useState<any[] | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [importStatus, setImportStatus] = useState<{type: string, message: string, isError: boolean} | null>(null);

  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [rawSql, setRawSql] = useState('');

  const executeQuery = async () => {
    if (!sqlQuery.trim()) return;
    setQueryError(null);
    setQueryResult(null);
    try {
      const response = await fetch('http://localhost:3001/api/sql-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ query: sqlQuery })
      });
      const data = await response.json();
      if (response.ok) {
        setQueryResult(data.data);
      } else {
        setQueryError(data.error ? `${data.message} : ${data.error}` : data.message || 'Erreur lors de l\'exécution');
      }
    } catch (error: any) {
      setQueryError(error.message || 'Erreur réseau');
    }
  };

  const handleComptaUpload = async (endpoint: string, file: File, type: string) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      setImportStatus({ type, message: 'Importation en cours...', isError: false });
      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      // Handle HTML error responses explicitly (e.g. from Express error handler)
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await response.json();
        if (response.ok) {
          setImportStatus({ type, message: data.message || 'Importation réussie', isError: false });
          fetchData(); // Refresh data after successful import
        } else {
          setImportStatus({ type, message: data.error ? `${data.message} : ${data.error}` : data.message || 'Erreur lors de l\'importation', isError: true });
        }
      } else {
         const text = await response.text();
         setImportStatus({ type, message: 'Erreur du serveur (HTML retourné) : ' + response.status, isError: true });
         console.error('Non-JSON response:', text);
      }
    } catch (error: any) {
      setImportStatus({ type, message: error.message || 'Erreur réseau', isError: true });
    }
  };

  const fetchRawData = async (table: string) => {
    const response = await fetch(`http://localhost:3001/api/raw-data/${table}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      const result = await response.json();
      setRawData(result.data);
      setRawSql(result.query);
    }
  };

  const fetchData = async () => {
    const headers = { 'Authorization': `Bearer ${token}` };
    const [linesRes, invoicesRes, ordersRes, m57Res, colRes] = await Promise.all([
      fetch('http://localhost:3001/api/budget/lines', { headers }),
      fetch('http://localhost:3001/api/budget/invoices', { headers }),
      fetch('http://localhost:3001/api/orders', { headers }),
      fetch('http://localhost:3001/api/m57-plan', { headers }),
      fetch('http://localhost:3001/api/column-settings/orders', { headers })
    ]);
    
    if (linesRes.ok) setBudgetLines(await linesRes.json());
    if (invoicesRes.ok) setInvoices(await invoicesRes.json());
    if (ordersRes.ok) setOrders(await ordersRes.json());
    if (m57Res.ok) setM57Plan(await m57Res.json());
    if (colRes.ok) {
      const cols: ColumnSetting[] = await colRes.json();
      const sortedCols = [...cols].sort((a, b) => {
        if (a.display_order !== 0 || b.display_order !== 0) {
          return (a.display_order || 0) - (b.display_order || 0);
        }
        if (a.column_key === 'N° Commande') return -1;
        if (b.column_key === 'N° Commande') return 1;
        if (a.column_key === 'Libellé') return -1;
        if (b.column_key === 'Libellé') return 1;
        return 0;
      });
      setColumnSettings(sortedCols);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (isRaw) {
      const tableMap: any = { 'lines': 'budget_lines', 'invoices': 'invoices', 'orders': 'orders' };
      if (tableMap[view]) fetchRawData(tableMap[view]);
    }
  }, [isRaw, view]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'lines' | 'invoices' | 'orders') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    let endpoint = '';
    if (type === 'lines') endpoint = 'api/budget/import-lines';
    else if (type === 'invoices') endpoint = 'api/budget/import-invoices';
    else if (type === 'orders') endpoint = 'api/orders/import';

    const response = await fetch(`http://localhost:3001/${endpoint}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (response.ok) {
      const result = await response.json();
      setMessage(result.message);
      fetchData();
      setTimeout(() => setMessage(''), 3000);
    } else {
      setMessage('Erreur lors de l\'import');
    }
  };

  const updateColumnSettingsBulk = async (newSettings: ColumnSetting[]) => {
    setColumnSettings(newSettings);
    await fetch('http://localhost:3001/api/column-settings/orders/bulk', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(newSettings)
    });
  };

  const toggleColumnVisibility = (columnKey: string, currentVisible: number) => {
    const updated = columnSettings.map(c => 
      c.column_key === columnKey ? { ...c, is_visible: currentVisible ? 0 : 1 } : c
    );
    updateColumnSettingsBulk(updated);
  };

  const updateColumnStyle = (columnKey: string, field: 'color' | 'is_bold' | 'is_italic', value: any) => {
    const updated = columnSettings.map(c => 
      c.column_key === columnKey ? { ...c, [field]: value } : c
    );
    updateColumnSettingsBulk(updated);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (sourceIndex === targetIndex || isNaN(sourceIndex)) return;

    const newSettings = [...columnSettings];
    const [movedItem] = newSettings.splice(sourceIndex, 1);
    newSettings.splice(targetIndex, 0, movedItem);

    const updatedWithOrder = newSettings.map((col, idx) => ({ ...col, display_order: idx + 1 }));
    updateColumnSettingsBulk(updatedWithOrder);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleColumnFilterChange = (key: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [key]: value }));
  };

  const groupedOrders = useMemo(() => {
    const groups: Record<string, any> = {};
    orders.forEach(order => {
      const nr = (order['N° Commande'] || order.order_number || 'SANS_NUMERO').toString();
      if (!groups[nr]) {
        groups[nr] = { 
          ...order, 
          _total_ht: 0,
          _total_ttc: 0, 
          _lines: [] 
        };
      }
      const amtHt = parseFloat(order['Montant HT'] || order.amount_ht || 0);
      const amtTtc = parseFloat(order['Montant TTC'] || 0);
      groups[nr]._total_ht += amtHt;
      groups[nr]._total_ttc += amtTtc;
      groups[nr]._lines.push({
        nr: order['N° ligne'],
        desc: order['Désignation'] || order.description,
        amtHt: amtHt,
        amtTtc: amtTtc
      });
    });
    Object.values(groups).forEach((g: any) => {
      g._lines.sort((a: any, b: any) => parseInt(a.nr) - parseInt(b.nr));
    });
    return Object.values(groups);
  }, [orders]);

  const filteredOrders = groupedOrders.filter(order => {
    const orderNumber = (order.order_number || order['N° Commande'] || '').toString().toLowerCase();
    const globalLabel = (order['Libellé'] || '').toString().toLowerCase();
    const provider = (order.provider || order['Fournisseur'] || '').toString().toLowerCase();
    const sTerm = searchTerm.toLowerCase();

    const linesMatch = order._lines.some((l: any) => l.desc?.toLowerCase().includes(sTerm));

    const matchesGlobalSearch = 
      orderNumber.includes(sTerm) ||
      globalLabel.includes(sTerm) ||
      provider.includes(sTerm) ||
      linesMatch;
    
    if (!matchesGlobalSearch) return false;

    const sectionValue = order.section || order.Section || order['Section'];
    const matchesSection = 
      sectionFilter === 'all' || 
      (sectionFilter === 'F' && (sectionValue === 'Fonctionnement' || sectionValue === 'F')) ||
      (sectionFilter === 'I' && (sectionValue === 'Investissement' || sectionValue === 'I'));

    if (!matchesSection) return false;

    for (const [key, filterValue] of Object.entries(columnFilters)) {
      if (filterValue) {
        if (key === 'Désignation' || key === 'description') {
           if (!order._lines.some((l: any) => l.desc?.toLowerCase().includes(filterValue.toLowerCase()))) return false;
        } else {
          const val = (order[key] || '').toString().toLowerCase();
          if (!val.includes(filterValue.toLowerCase())) return false;
        }
      }
    }

    return true;
  }).sort((a, b) => {
    if (!sortConfig) return 0;
    
    const key = sortConfig.key;
    let aVal = a[key];
    let bVal = b[key];

    if (key === 'Montant HT' || key === 'amount_ht') {
      aVal = a._total_ht;
      bVal = b._total_ht;
    } else if (key === 'Montant TTC') {
      aVal = a._total_ttc;
      bVal = b._total_ttc;
    }
    
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const getRowClass = (section: string) => {
    if (section === 'Fonctionnement') return 'row-operating';
    if (section === 'Investissement') return 'row-investment';
    return '';
  };

  return (
    <div className="budget-page">
      <Header />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Suivi Budgétaire & Commandes</h1>
            <p className="page-subtitle">Gérez vos lignes budgétaires, factures et commandes centralisées.</p>
          </div>
          <div className="view-tabs">
            {['summary', 'lines', 'invoices', 'orders', 'gestion'].map(tab => {
              // Only admin/finances/compta can see 'gestion'
              if (tab === 'gestion' && !['admin', 'finances', 'compta'].includes(user.role)) return null;
              return (
              <button 
                key={tab}
                className={`tab-btn ${view === tab ? 'active' : ''}`} 
                onClick={() => {setView(tab as any); setIsRaw(false);}}
              >
                {tab === 'summary' && 'Résumé'}
                {tab === 'lines' && 'Lignes'}
                {tab === 'invoices' && 'Factures'}
                {tab === 'orders' && 'Commandes'}
                {tab === 'gestion' && 'Gestion'}
              </button>
            )})}
            {view !== 'summary' && view !== 'gestion' && ['admin', 'finances'].includes(user.role) && (
              <button className={`tab-btn raw-toggle ${isRaw ? 'active' : ''}`} onClick={() => setIsRaw(!isRaw)}>
                {isRaw ? 'Vue Normale' : '{ SQL }'}
              </button>
            )}
          </div>
        </div>

        {message && (
          <div className="alert alert-success">
            <CheckCircle size={20} className="alert-icon" /> 
            <span>{message}</span>
          </div>
        )}

        {isRaw ? (
          <div className="raw-view-container">
            <div className="sql-box">
              <div className="sql-box-header">Requête SQL Exécutée</div>
              <code>{rawSql}</code>
            </div>
            <div className="table-card">
              <div className="table-responsive">
                <table className="modern-table">
                  <thead>
                    <tr>
                      {rawData.length > 0 && Object.keys(rawData[0]).map(key => <th key={key}>{key}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {rawData.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((val: any, j) => <td key={j}>{val}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="view-content-wrapper">
            {['admin', 'finances'].includes(user.role) && view !== 'summary' && (
              <div className="import-toolbar">
                <span className="import-label">Importer des données :</span>
                {view === 'lines' && (
                  <label className="import-btn">
                    <Upload size={16} /> Fichier Lignes (.xls)
                    <input type="file" hidden onChange={(e) => handleFileUpload(e, 'lines')} accept=".xlsx, .xls" />
                  </label>
                )}
                {view === 'invoices' && (
                  <label className="import-btn">
                    <Upload size={16} /> Fichier Factures (.xls)
                    <input type="file" hidden onChange={(e) => handleFileUpload(e, 'invoices')} accept=".xlsx, .xls" />
                  </label>
                )}
                {view === 'orders' && (
                  <label className="import-btn">
                    <Upload size={16} /> Fichier M57 Commandes (.xls)
                    <input type="file" hidden onChange={(e) => handleFileUpload(e, 'orders')} accept=".xlsx, .xls" />
                  </label>
                )}
              </div>
            )}

            {view === 'summary' && (
              <div className="dashboard-grid">
                <div className="dashboard-card primary">
                  <div className="card-icon"><Euro size={24} /></div>
                  <div className="card-content">
                    <h3 className="card-title">Budget Alloué Total</h3>
                    <p className="card-value">{budgetLines.reduce((acc, curr) => acc + (curr.allocated_amount || 0), 0).toLocaleString()} €</p>
                  </div>
                </div>
                <div className="dashboard-card secondary">
                  <div className="card-icon"><ShoppingCart size={24} /></div>
                  <div className="card-content">
                    <h3 className="card-title">Total Commandé (TTC)</h3>
                    <p className="card-value">{orders.reduce((acc, curr) => acc + (parseFloat(curr['Montant TTC']) || 0), 0).toLocaleString()} €</p>
                  </div>
                </div>
                <div className="dashboard-card warning">
                  <div className="card-icon"><FileText size={24} /></div>
                  <div className="card-content">
                    <h3 className="card-title">Total Facturé</h3>
                    <p className="card-value">{invoices.reduce((acc, curr) => acc + (curr.amount_ht || 0), 0).toLocaleString()} €</p>
                  </div>
                </div>
                <div className="dashboard-card neutral">
                  <div className="card-icon"><Activity size={24} /></div>
                  <div className="card-content">
                    <h3 className="card-title">Volume de Commandes</h3>
                    <p className="card-value">{groupedOrders.length} <span className="card-subvalue">dossiers</span></p>
                  </div>
                </div>
              </div>
            )}

            {view === 'lines' && (
              <div className="table-card">
                <div className="table-responsive">
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Libellé</th>
                        <th>Année</th>
                        <th className="text-right">Montant Alloué</th>
                      </tr>
                    </thead>
                    <tbody>
                      {budgetLines.map(line => (
                        <tr key={line.id}>
                          <td className="font-medium text-secondary">{line.code}</td>
                          <td>{line.label}</td>
                          <td><span className="badge year">{line.year}</span></td>
                          <td className="text-right font-bold text-primary">{line.allocated_amount.toLocaleString()} €</td>
                        </tr>
                      ))}
                      {budgetLines.length === 0 && (
                        <tr><td colSpan={4} className="text-center py-8 text-gray">Aucune ligne budgétaire disponible.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {view === 'invoices' && (
              <div className="table-card">
                <div className="table-responsive">
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>N° Facture</th>
                        <th>Fournisseur</th>
                        <th>Code Budget</th>
                        <th>Date</th>
                        <th className="text-right">Montant HT</th>
                        <th className="text-center">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map(inv => (
                        <tr key={inv.id}>
                          <td className="font-medium">{inv.invoice_number}</td>
                          <td>{inv.provider}</td>
                          <td><span className="badge neutral">{inv.budget_line_code}</span></td>
                          <td className="text-gray">{inv.date}</td>
                          <td className="text-right font-bold">{inv.amount_ht.toLocaleString()} €</td>
                          <td className="text-center"><span className="badge status">{inv.status}</span></td>
                        </tr>
                      ))}
                      {invoices.length === 0 && (
                        <tr><td colSpan={6} className="text-center py-8 text-gray">Aucune facture disponible.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {view === 'orders' && (
              <div className="orders-container">
                <div className="toolbar">
                  <div className="toolbar-actions">
                    <button className="toolbar-btn" onClick={() => setShowM57(true)}>
                      <BookOpen size={16} /> Plan M57
                    </button>
                    <button className="toolbar-btn" onClick={() => setShowColumnConfig(true)}>
                      <Columns size={16} /> Colonnes
                    </button>
                  </div>
                  <div className="toolbar-filters">
                    <div className="search-input-wrapper">
                      <Search size={16} className="search-icon" />
                      <input 
                        type="text" 
                        placeholder="Rechercher une commande, fournisseur..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                      />
                    </div>
                    <div className="select-wrapper">
                      <Filter size={14} className="select-icon" />
                      <select 
                        value={sectionFilter} 
                        onChange={(e) => setSectionFilter(e.target.value)}
                        className="filter-select"
                      >
                        <option value="all">Toutes les sections</option>
                        <option value="F">Fonctionnement (F)</option>
                        <option value="I">Investissement (I)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="table-card">
                  <div className="table-responsive">
                    <table className="modern-table table-bordered">
                      <thead>
                        <tr>
                          {columnSettings.filter(c => c.is_visible).map(col => (
                            <th 
                              key={col.column_key}
                              style={{
                                color: col.color || 'inherit',
                                fontWeight: col.is_bold ? 'bold' : '600',
                                fontStyle: col.is_italic ? 'italic' : 'normal'
                              }}
                            >
                              <div className="th-wrapper">
                                <div className="th-content" onClick={() => requestSort(col.column_key)}>
                                  {col.label}
                                  {sortConfig?.key === col.column_key && (
                                    <span className="sort-indicator">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                                  )}
                                </div>
                                <input 
                                  type="text" 
                                  placeholder="Filtrer..."
                                  value={columnFilters[col.column_key] || ''}
                                  onChange={(e) => handleColumnFilterChange(col.column_key, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="col-filter-input"
                                />
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.length > 0 ? filteredOrders.map(order => (
                          <tr key={order.id} className={getRowClass(order.Section || order.section)}>
                            {columnSettings.filter(c => c.is_visible).map(col => (
                              <td 
                                key={col.column_key}
                                style={{
                                  color: col.color || 'inherit',
                                  fontWeight: col.is_bold ? 'bold' : 'normal',
                                  fontStyle: col.is_italic ? 'italic' : 'normal'
                                }}
                              >
                                {col.column_key === 'Section' || col.column_key === 'section' ? (
                                  <span className={`section-badge ${(order[col.column_key] === 'Fonctionnement' || order[col.column_key] === 'F') ? 'f' : 'i'}`}>
                                    {(order[col.column_key] === 'Fonctionnement' || order[col.column_key] === 'F') ? 'F' : 'I'}
                                  </span>
                                ) : col.column_key === 'status' || col.column_key === 'Etat' ? (
                                  <span className="badge status">{order[col.column_key]}</span>
                                ) : col.column_key === 'Montant HT' || col.column_key === 'amount_ht' ? (
                                  <span className="amount-ht">
                                    {order._total_ht.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                  </span>
                                ) : col.column_key === 'Montant TTC' ? (
                                  <span className="amount-ttc">
                                    {order._total_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                  </span>
                                ) : col.column_key === 'Libellé' ? (
                                  <span className="order-label">
                                    {order[col.column_key]}
                                  </span>
                                ) : col.column_key === 'Désignation' || col.column_key === 'description' ? (
                                  <div className="order-lines-list">
                                    {order._lines.map((line: any, idx: number) => (
                                      <div key={idx} className="order-line-item">
                                        <span className="line-num">{line.nr}</span>
                                        <span className="line-desc">{line.desc}</span>
                                        <span className="line-amt">{line.amtHt.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })} HT</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  order[col.column_key]
                                )}
                              </td>
                            ))}
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={columnSettings.filter(c => c.is_visible).length || 1} className="empty-state">
                              Aucune commande ne correspond à vos critères.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
            {view === 'gestion' && (
              <div className="gestion-container" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <section className="compta-card" style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                  <h2 style={{ borderBottom: '2px solid #eee', paddingBottom: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Upload size={20} /> Import Excel
                  </h2>

                  <div className="import-list" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div className="import-item">
                      <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Lignes Budgétaires</label>
                      <input type="file" accept=".xlsx,.xls" onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleComptaUpload('/api/budget/import-lines', e.target.files[0], 'lignes');
                          e.target.value = '';
                        }
                      }} />
                      {importStatus?.type === 'lignes' && (
                        <div style={{ marginTop: '8px', color: importStatus.isError ? '#d32f2f' : '#2e7d32', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {importStatus.isError ? <AlertCircle size={16}/> : <CheckCircle2 size={16}/>} {importStatus.message}
                        </div>
                      )}
                    </div>

                    <div className="import-item">
                      <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Commandes</label>
                      <input type="file" accept=".xlsx,.xls" onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleComptaUpload('/api/orders/import', e.target.files[0], 'commandes');
                          e.target.value = '';
                        }
                      }} />
                      {importStatus?.type === 'commandes' && (
                        <div style={{ marginTop: '8px', color: importStatus.isError ? '#d32f2f' : '#2e7d32', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {importStatus.isError ? <AlertCircle size={16}/> : <CheckCircle2 size={16}/>} {importStatus.message}
                        </div>
                      )}
                    </div>

                    <div className="import-item">
                      <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Factures</label>
                      <input type="file" accept=".xlsx,.xls" onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleComptaUpload('/api/budget/import-invoices', e.target.files[0], 'factures');
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
                    style={{ alignSelf: 'flex-start', padding: '10px 15px', background: 'var(--color-navy)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    Exécuter la requête
                  </button>

                  {queryError && (
                    <div style={{ marginTop: '15px', padding: '10px', background: '#ffebee', color: '#c62828', borderRadius: '4px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <AlertCircle size={18} /> {queryError}
                    </div>
                  )}

                  {/* Results inside or below, let's put it below if queryResult */}
                  {queryResult && (
                    <div style={{ marginTop: '20px', overflowX: 'auto' }}>
                      <h3 style={{ marginBottom: '10px' }}>Résultats ({queryResult.length} lignes)</h3>
                      {queryResult.length > 0 ? (
                        <table className="modern-table">
                          <thead>
                            <tr>
                              {Object.keys(queryResult[0]).map(key => (
                                <th key={key}>{key}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {queryResult.map((row, idx) => (
                              <tr key={idx}>
                                {Object.values(row).map((val: any, vIdx) => (
                                  <td key={vIdx}>{val?.toString() || ''}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <p>Aucun résultat trouvé.</p>
                      )}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
        {showM57 && (
          <div className="modal-backdrop" onClick={() => setShowM57(false)}>
            <div className="modal-window" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Natures Comptables M57</h2>
                <button className="icon-btn" onClick={() => setShowM57(false)}><X size={20} /></button>
              </div>
              <div className="modal-body p-0">
                <div className="table-responsive max-h-[60vh]">
                  <table className="modern-table">
                    <thead>
                      <tr>
                        <th>Code</th>
                        <th>Libellé</th>
                        <th className="text-center">Section</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m57Plan.map(item => (
                        <tr key={item.id}>
                          <td className="font-bold text-secondary">{item.code}</td>
                          <td>{item.label}</td>
                          <td className="text-center">
                             <span className={`section-badge ${item.section === 'F' ? 'f' : 'i'}`}>
                              {item.section}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {showColumnConfig && (
          <div className="modal-backdrop" onClick={() => setShowColumnConfig(false)}>
            <div className="modal-window" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Configuration des Colonnes</h2>
                <button className="icon-btn" onClick={() => setShowColumnConfig(false)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <p className="modal-desc">
                  Glissez-déposez pour réorganiser. Modifiez la visibilité, la couleur, et le style (Gras/Italique).
                </p>
                <div className="column-toggles">
                  {columnSettings.map((col, index) => (
                    <div 
                      key={col.id} 
                      className="toggle-item"
                      draggable={['admin', 'finances'].includes(user.role)}
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      style={{ cursor: ['admin', 'finances'].includes(user.role) ? 'grab' : 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div className="toggle-info" style={{ display: 'flex', alignItems: 'center' }}>
                        {['admin', 'finances'].includes(user.role) && <span className="drag-handle" style={{ marginRight: '10px', color: '#94a3b8', cursor: 'grab' }}>☰</span>}
                        <span className="toggle-label">{col.label}</span>
                      </div>
                      
                      <div className="toggle-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {user.role === 'admin' && (
                          <>
                            <input 
                              type="color" 
                              value={col.color || '#334155'} 
                              onChange={(e) => updateColumnStyle(col.column_key, 'color', e.target.value)}
                              title="Couleur de la colonne"
                              style={{ width: '28px', height: '28px', padding: '0', border: '1px solid #cbd5e1', borderRadius: '4px', cursor: 'pointer' }}
                            />
                            <button 
                              onClick={() => updateColumnStyle(col.column_key, 'is_bold', !col.is_bold)}
                              title="Gras"
                              style={{ 
                                fontWeight: 'bold', width: '28px', height: '28px', borderRadius: '4px', 
                                border: '1px solid #cbd5e1', cursor: 'pointer',
                                background: col.is_bold ? '#e2e8f0' : 'white'
                              }}
                            >
                              B
                            </button>
                            <button 
                              onClick={() => updateColumnStyle(col.column_key, 'is_italic', !col.is_italic)}
                              title="Italique"
                              style={{ 
                                fontStyle: 'italic', fontFamily: 'serif', width: '28px', height: '28px', borderRadius: '4px', 
                                border: '1px solid #cbd5e1', cursor: 'pointer',
                                background: col.is_italic ? '#e2e8f0' : 'white'
                              }}
                            >
                              I
                            </button>
                          </>
                        )}
                        <button 
                          className={`toggle-btn ${col.is_visible ? 'on' : 'off'}`}
                          onClick={() => toggleColumnVisibility(col.column_key, col.is_visible)}
                          disabled={!['admin', 'finances'].includes(user.role)}
                          style={{ minWidth: '90px', justifyContent: 'center' }}
                        >
                          {col.is_visible ? <Eye size={16} /> : <EyeOff size={16} />}
                          {col.is_visible ? 'Visible' : 'Masqué'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        /* Page Layout */
        .budget-page {
          min-height: 100vh;
          background-color: #f8fafc;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        .main-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }

        /* Typography & Colors */
        :root {
          --color-ivry: #e30613;
          --color-navy: #003366;
          --color-navy-light: #1a4c80;
          --color-slate-50: #f8fafc;
          --color-slate-100: #f1f5f9;
          --color-slate-200: #e2e8f0;
          --color-slate-300: #cbd5e1;
          --color-slate-600: #475569;
          --color-slate-700: #334155;
          --color-slate-800: #1e293b;
          --color-green-500: #22c55e;
          --color-green-50: #f0fdf4;
          --color-blue-500: #3b82f6;
          --color-blue-50: #eff6ff;
        }

        .text-primary { color: var(--color-ivry); }
        .text-secondary { color: var(--color-navy); }
        .text-gray { color: var(--color-slate-600); }
        .font-medium { font-weight: 500; }
        .font-bold { font-weight: 700; }
        .text-center { text-align: center; }
        .text-right { text-align: right; }
        .py-8 { padding-top: 2rem; padding-bottom: 2rem; }
        .p-0 { padding: 0 !important; }

        /* Header & Tabs */
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-bottom: 2rem;
          padding-bottom: 1.5rem;
          border-bottom: 1px solid var(--color-slate-200);
        }
        .page-title {
          font-size: 1.875rem;
          font-weight: 700;
          color: var(--color-navy);
          margin: 0 0 0.5rem 0;
        }
        .page-subtitle {
          color: var(--color-slate-600);
          margin: 0;
          font-size: 0.95rem;
        }
        .view-tabs {
          display: flex;
          gap: 0.5rem;
          background: white;
          padding: 0.25rem;
          border-radius: 0.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .tab-btn {
          padding: 0.5rem 1rem;
          border-radius: 0.375rem;
          font-weight: 600;
          font-size: 0.875rem;
          color: var(--color-slate-600);
          background: transparent;
          border: none;
          transition: all 0.2s;
        }
        .tab-btn:hover { background: var(--color-slate-50); color: var(--color-navy); }
        .tab-btn.active {
          background: var(--color-navy);
          color: white;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        .tab-btn.raw-toggle {
          color: var(--color-slate-500);
          font-family: monospace;
          border: 1px dashed var(--color-slate-300);
        }
        .tab-btn.raw-toggle.active {
          background: var(--color-slate-800);
          color: white;
          border-color: var(--color-slate-800);
        }

        /* Alerts */
        .alert {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem;
          border-radius: 0.5rem;
          margin-bottom: 1.5rem;
          font-weight: 500;
          animation: slideIn 0.3s ease-out;
        }
        .alert-success {
          background-color: var(--color-green-50);
          color: var(--color-green-500);
          border: 1px solid #bbf7d0;
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Dashboard Grid */
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }
        .dashboard-card {
          background: white;
          border-radius: 1rem;
          padding: 1.5rem;
          display: flex;
          align-items: center;
          gap: 1.25rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          border-top: 4px solid transparent;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .dashboard-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
        }
        .dashboard-card.primary { border-top-color: var(--color-ivry); }
        .dashboard-card.secondary { border-top-color: var(--color-navy); }
        .dashboard-card.warning { border-top-color: #f59e0b; }
        .dashboard-card.neutral { border-top-color: var(--color-slate-400); }
        
        .card-icon {
          width: 3rem;
          height: 3rem;
          border-radius: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .primary .card-icon { background: #fee2e2; color: var(--color-ivry); }
        .secondary .card-icon { background: var(--color-blue-50); color: var(--color-navy); }
        .warning .card-icon { background: #fef3c7; color: #d97706; }
        .neutral .card-icon { background: var(--color-slate-100); color: var(--color-slate-600); }

        .card-content { flex: 1; }
        .card-title {
          font-size: 0.875rem;
          color: var(--color-slate-500);
          margin: 0 0 0.25rem 0;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }
        .card-value {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--color-slate-800);
          margin: 0;
        }
        .card-subvalue { font-size: 0.875rem; font-weight: 500; color: var(--color-slate-400); }

        /* Toolbar & Imports */
        .import-toolbar {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
          background: white;
          padding: 1rem 1.5rem;
          border-radius: 0.75rem;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .import-label { font-weight: 600; color: var(--color-slate-700); font-size: 0.9rem; }
        .import-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--color-slate-50);
          color: var(--color-slate-700);
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          border: 1px solid var(--color-slate-200);
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .import-btn:hover { background: var(--color-slate-100); border-color: var(--color-slate-300); }

        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          flex-wrap: wrap;
          gap: 1rem;
        }
        .toolbar-actions { display: flex; gap: 0.5rem; }
        .toolbar-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: white;
          border: 1px solid var(--color-slate-200);
          border-radius: 0.5rem;
          color: var(--color-slate-700);
          font-weight: 600;
          font-size: 0.875rem;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .toolbar-btn:hover { background: var(--color-slate-50); }
        
        .toolbar-filters { display: flex; gap: 0.75rem; }
        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
        }
        .search-icon { position: absolute; left: 0.75rem; color: var(--color-slate-400); }
        .search-input {
          padding: 0.5rem 1rem 0.5rem 2.25rem;
          border: 1px solid var(--color-slate-200);
          border-radius: 0.5rem;
          font-size: 0.875rem;
          min-width: 250px;
          outline: none;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .search-input:focus { border-color: var(--color-navy); box-shadow: 0 0 0 3px rgba(0, 51, 102, 0.1); }
        
        .select-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          background: white;
          border: 1px solid var(--color-slate-200);
          border-radius: 0.5rem;
          padding: 0 0.75rem;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .select-icon { color: var(--color-slate-400); margin-right: 0.25rem; }
        .filter-select {
          border: none;
          background: transparent;
          padding: 0.5rem 0;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--color-slate-700);
          outline: none;
          cursor: pointer;
        }

        /* Modern Tables */
        .table-card {
          background: white;
          border-radius: 1rem;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);
          overflow: hidden;
          border: 1px solid var(--color-slate-200);
        }
        .table-responsive {
          max-height: calc(100vh - 300px);
          overflow: auto;
        }
        .table-responsive::-webkit-scrollbar { width: 8px; height: 8px; }
        .table-responsive::-webkit-scrollbar-track { background: var(--color-slate-50); }
        .table-responsive::-webkit-scrollbar-thumb { background: var(--color-slate-300); border-radius: 4px; }
        .table-responsive::-webkit-scrollbar-thumb:hover { background: var(--color-slate-400); }

        .modern-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          text-align: left;
        }
        .modern-table th {
          background: var(--color-slate-50);
          padding: 1rem;
          font-weight: 600;
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--color-slate-500);
          position: sticky;
          top: 0;
          z-index: 10;
          border-bottom: 1px solid var(--color-slate-200);
        }
        .modern-table td {
          padding: 1rem;
          font-size: 0.875rem;
          border-bottom: 1px solid var(--color-slate-100);
          color: var(--color-slate-800);
          vertical-align: top;
        }
        .modern-table tbody tr:last-child td { border-bottom: none; }
        .modern-table tbody tr:hover { background-color: var(--color-slate-50); }

        .th-wrapper { display: flex; flex-direction: column; gap: 0.5rem; }
        .th-content {
          display: flex;
          align-items: center;
          cursor: pointer;
          user-select: none;
          transition: color 0.2s;
        }
        .th-content:hover { color: var(--color-navy); }
        .sort-indicator { color: var(--color-navy); margin-left: 0.25rem; font-weight: bold; }
        
        .col-filter-input {
          width: 100%;
          padding: 0.25rem 0.5rem;
          border: 1px solid var(--color-slate-200);
          border-radius: 0.25rem;
          font-size: 0.75rem;
          outline: none;
          background: white;
          font-weight: normal;
          text-transform: none;
          letter-spacing: normal;
        }
        .col-filter-input:focus { border-color: var(--color-blue-500); }

        /* Table Specific Content */
        .row-operating td { background-color: rgba(34, 197, 94, 0.03); }
        .row-investment td { background-color: rgba(59, 130, 246, 0.03); }
        
        .section-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.75rem;
          height: 1.75rem;
          border-radius: 0.375rem;
          font-weight: 800;
          font-size: 0.75rem;
        }
        .section-badge.f { background: var(--color-green-50); color: var(--color-green-500); border: 1px solid #bbf7d0; }
        .section-badge.i { background: var(--color-blue-50); color: var(--color-blue-500); border: 1px solid #bfdbfe; }

        .badge {
          padding: 0.25rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.75rem;
          font-weight: 600;
          display: inline-block;
        }
        .badge.year { background: var(--color-slate-100); color: var(--color-slate-600); }
        .badge.status { background: var(--color-slate-100); color: var(--color-slate-700); }
        .badge.neutral { background: white; border: 1px solid var(--color-slate-200); color: var(--color-slate-600); }

        .amount-ht { font-weight: 800; color: var(--color-navy); }
        .amount-ttc { font-weight: 800; color: var(--color-ivry); }
        
        .order-label {
          font-weight: 600;
          color: var(--color-slate-800);
          display: inline-block;
          min-width: 250px;
        }
        
        .order-lines-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-width: 300px;
          max-width: 450px;
        }
        .order-line-item {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          font-size: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px dashed var(--color-slate-200);
        }
        .order-line-item:last-child { border-bottom: none; padding-bottom: 0; }
        .line-num {
          background: var(--color-slate-100);
          color: var(--color-slate-600);
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-weight: 700;
          min-width: 1.5rem;
          text-align: center;
        }
        .line-desc { flex: 1; color: var(--color-slate-700); line-height: 1.4; }
        .line-amt { font-style: italic; color: var(--color-slate-500); white-space: nowrap; font-weight: 500; }

        .empty-state {
          text-align: center;
          padding: 3rem !important;
          color: var(--color-slate-500);
          font-style: italic;
        }

        /* Raw SQL View */
        .raw-view-container { display: flex; flex-direction: column; gap: 1rem; }
        .sql-box {
          background: #1e1e1e;
          border-radius: 0.75rem;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .sql-box-header {
          background: #2d2d2d;
          padding: 0.75rem 1rem;
          color: #a0a0a0;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .sql-box code {
          display: block;
          padding: 1.5rem;
          color: #d4d4d4;
          font-family: 'Consolas', 'Monaco', monospace;
          font-size: 0.875rem;
          line-height: 1.5;
          overflow-x: auto;
        }

        /* Modals */
        .modal-backdrop {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 50;
          padding: 1rem;
        }
        .modal-window {
          background: white;
          border-radius: 1rem;
          width: 100%;
          max-width: 800px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
          display: flex;
          flex-direction: column;
          max-height: 90vh;
        }
        .modal-window.modal-sm { max-width: 500px; }
        .modal-header {
          padding: 1.25rem 1.5rem;
          border-bottom: 1px solid var(--color-slate-200);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .modal-title { font-size: 1.25rem; font-weight: 700; color: var(--color-navy); margin: 0; }
        .icon-btn {
          background: transparent;
          border: none;
          color: var(--color-slate-400);
          cursor: pointer;
          padding: 0.5rem;
          border-radius: 0.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .icon-btn:hover { background: var(--color-slate-100); color: var(--color-slate-600); }
        .modal-body { padding: 1.5rem; overflow-y: auto; }
        .modal-desc { color: var(--color-slate-500); font-size: 0.875rem; margin: 0 0 1.5rem 0; line-height: 1.5; }
        
        .column-toggles { display: flex; flex-direction: column; gap: 0.75rem; }
        .toggle-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: var(--color-slate-50);
          border: 1px solid var(--color-slate-200);
          border-radius: 0.5rem;
        }
        .toggle-label { font-weight: 500; color: var(--color-slate-700); font-size: 0.875rem; }
        .toggle-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          border-radius: 0.375rem;
          font-size: 0.75rem;
          font-weight: 600;
          transition: all 0.2s;
        }
        .toggle-btn.on { background: var(--color-navy); color: white; border: 1px solid var(--color-navy); }
        .toggle-btn.off { background: white; color: var(--color-slate-500); border: 1px solid var(--color-slate-300); }
      `}</style>
    </div>
  );
};

export default Budget;
