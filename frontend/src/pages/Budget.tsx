import React, { useState, useEffect, useMemo } from 'react';
import Header from '../components/Header';
import { Upload, CheckCircle, Search, Filter, BookOpen, X, Columns, Eye, EyeOff } from 'lucide-react';

interface ColumnSetting {
  id: number;
  column_key: string;
  label: string;
  is_visible: number;
}

const Budget: React.FC = () => {
  const [view, setView] = useState<'summary' | 'lines' | 'invoices' | 'orders'>('summary');
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
  
  const token = localStorage.getItem('token');
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const [rawSql, setRawSql] = useState('');

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
      // Ensure "N° Commande" is first, "Libellé" is second
      const sortedCols = [...cols].sort((a, b) => {
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

  const toggleColumnVisibility = async (columnKey: string, currentVisible: number) => {
    const response = await fetch('http://localhost:3001/api/column-settings/orders', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ column_key: columnKey, is_visible: !currentVisible })
    });

    if (response.ok) {
      const colRes = await fetch('http://localhost:3001/api/column-settings/orders', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (colRes.ok) {
        const cols: ColumnSetting[] = await colRes.json();
        const sortedCols = [...cols].sort((a, b) => {
          if (a.column_key === 'N° Commande') return -1;
          if (b.column_key === 'N° Commande') return 1;
          if (a.column_key === 'Libellé') return -1;
          if (b.column_key === 'Libellé') return 1;
          return 0;
        });
        setColumnSettings(sortedCols);
      }
    }
  };

  const isColumnVisible = (key: string) => {
    const setting = columnSettings.find(s => s.column_key === key);
    return setting ? setting.is_visible === 1 : true;
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
    // Sort lines within each order by line number
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

    // Check if any line designation matches search
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
      <main className="container-fluid" style={{ padding: '0 20px' }}>
        <div className="budget-header">
          <h1>Suivi Budgétaire & Commandes</h1>
          <div className="budget-nav">
            <button className={`btn ${view === 'summary' ? 'btn-primary' : 'btn-outline'}`} onClick={() => {setView('summary'); setIsRaw(false)}}>Résumé</button>
            <button className={`btn ${view === 'lines' ? 'btn-primary' : 'btn-outline'}`} onClick={() => {setView('lines'); setIsRaw(false)}}>Lignes</button>
            <button className={`btn ${view === 'invoices' ? 'btn-primary' : 'btn-outline'}`} onClick={() => {setView('invoices'); setIsRaw(false)}}>Factures</button>
            <button className={`btn ${view === 'orders' ? 'btn-primary' : 'btn-outline'}`} onClick={() => {setView('orders'); setIsRaw(false)}}>Commandes</button>
            {view !== 'summary' && user.role === 'admin' && (
              <button className={`btn ${isRaw ? 'btn-secondary' : 'btn-outline'}`} onClick={() => setIsRaw(!isRaw)}>
                {isRaw ? 'Vue Normale' : 'Données Brutes (SQL)'}
              </button>
            )}
          </div>
        </div>

        {message && <div className="alert-success"><CheckCircle size={18} /> {message}</div>}

        {isRaw ? (
          <div className="raw-data-wrapper">
            <div className="sql-display">
              <code>{rawSql}</code>
            </div>
            <div className="data-table-container raw-view">
              <table className="data-table">
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
        ) : (
          <>
            {user.role === 'admin' && (
          <div className="import-controls">
            <label className="btn btn-secondary">
              <Upload size={16} /> Lignes
              <input type="file" hidden onChange={(e) => handleFileUpload(e, 'lines')} accept=".xlsx, .xls" />
            </label>
            <label className="btn btn-secondary">
              <Upload size={16} /> Factures
              <input type="file" hidden onChange={(e) => handleFileUpload(e, 'invoices')} accept=".xlsx, .xls" />
            </label>
            <label className="btn btn-secondary">
              <Upload size={16} /> Commandes (M57)
              <input type="file" hidden onChange={(e) => handleFileUpload(e, 'orders')} accept=".xlsx, .xls" />
            </label>
          </div>
        )}

        {view === 'summary' && (
          <div className="budget-summary">
            <div className="summary-card">
              <h3>Budget Total</h3>
              <p className="amount">{budgetLines.reduce((acc, curr) => acc + (curr.allocated_amount || 0), 0).toLocaleString()} €</p>
            </div>
            <div className="summary-card">
              <h3>Total Commandé (TTC)</h3>
              <p className="amount">{orders.reduce((acc, curr) => acc + (parseFloat(curr['Montant TTC']) || 0), 0).toLocaleString()} €</p>
            </div>
            <div className="summary-card">
              <h3>Total Facturé</h3>
              <p className="amount">{invoices.reduce((acc, curr) => acc + (curr.amount_ht || 0), 0).toLocaleString()} €</p>
            </div>
            <div className="summary-card info">
              <h3>Nombre de Commandes</h3>
              <p className="amount">{groupedOrders.length}</p>
            </div>
            <div className="summary-card info">
              <h3>Total Lignes de Commande</h3>
              <p className="amount">{orders.length}</p>
            </div>
          </div>
        )}

        {view === 'lines' && (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Libellé</th>
                  <th>Année</th>
                  <th>Montant Alloué</th>
                </tr>
              </thead>
              <tbody>
                {budgetLines.map(line => (
                  <tr key={line.id}>
                    <td>{line.code}</td>
                    <td>{line.label}</td>
                    <td>{line.year}</td>
                    <td>{line.allocated_amount.toLocaleString()} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'invoices' && (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>N° Facture</th>
                  <th>Fournisseur</th>
                  <th>Code Budget</th>
                  <th>Date</th>
                  <th>Montant HT</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.id}>
                    <td>{inv.invoice_number}</td>
                    <td>{inv.provider}</td>
                    <td>{inv.budget_line_code}</td>
                    <td>{inv.date}</td>
                    <td>{inv.amount_ht.toLocaleString()} €</td>
                    <td><span className="status-badge">{inv.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {view === 'orders' && (
          <>
            <div className="orders-sub-header">
              <div className="header-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setShowM57(true)}>
                  <BookOpen size={16} /> Plan M57
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowColumnConfig(true)}>
                  <Columns size={16} /> Colonnes
                </button>
                <div className="filter-group">
                  <Filter size={16} />
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
                <div className="search-bar">
                  <Search size={16} />
                  <input 
                    type="text" 
                    placeholder="Recherche globale..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    {columnSettings.filter(c => c.is_visible).map(col => (
                      <th key={col.column_key}>
                        <div className="th-content" onClick={() => requestSort(col.column_key)}>
                          {col.label}
                          {sortConfig?.key === col.column_key && (
                            <span className="sort-indicator">{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}</span>
                          )}
                        </div>
                        <div className="column-filter">
                          <input 
                            type="text" 
                            placeholder="Filtrer..."
                            value={columnFilters[col.column_key] || ''}
                            onChange={(e) => handleColumnFilterChange(col.column_key, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
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
                        <td key={col.column_key}>
                          {col.column_key === 'Section' || col.column_key === 'section' ? (
                            <span className={`section-indicator ${(order[col.column_key] === 'Fonctionnement' || order[col.column_key] === 'F') ? 'f' : 'i'}`}>
                              {(order[col.column_key] === 'Fonctionnement' || order[col.column_key] === 'F') ? 'F' : 'I'}
                            </span>
                          ) : col.column_key === 'status' || col.column_key === 'Etat' ? (
                            <span className="status-badge">{order[col.column_key]}</span>
                          ) : col.column_key === 'Montant HT' || col.column_key === 'amount_ht' ? (
                            <span className="total-amount-highlight">
                              {order._total_ht.toLocaleString()} €
                            </span>
                          ) : col.column_key === 'Montant TTC' ? (
                            <span className="total-amount-highlight ttc">
                              {order._total_ttc.toLocaleString()} €
                            </span>
                          ) : col.column_key === 'Libellé' ? (
                            <span className="label-bold-wider">
                              {order[col.column_key]}
                            </span>
                          ) : col.column_key === 'Désignation' || col.column_key === 'description' ? (
                            <div className="order-lines-container wider">
                              {order._lines.map((line: any, idx: number) => (
                                <div key={idx} className="order-line-detail">
                                  <span className="line-number-badge">{line.nr}</span>
                                  <span className="line-desc">{line.desc}</span>
                                  <span className="line-amt">{line.amtHt.toLocaleString()} € HT</span>
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
                      <td colSpan={columnSettings.filter(c => c.is_visible).length || 1} style={{ textAlign: 'center', padding: '30px' }}>Aucune commande trouvée</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* M57 Modal */}
        {showM57 && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h2>Natures Comptables M57</h2>
                <button className="close-btn" onClick={() => setShowM57(false)}><X size={24} /></button>
              </div>
              <div className="modal-body">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Libellé</th>
                      <th>Section</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m57Plan.map(item => (
                      <tr key={item.id}>
                        <td><strong>{item.code}</strong></td>
                        <td>{item.label}</td>
                        <td>
                           <span className={`section-indicator ${item.section === 'F' ? 'f' : 'i'}`}>
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
        )}

        {/* Column Config Modal */}
        {showColumnConfig && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h2>Affichage des Colonnes (Global)</h2>
                <button className="close-btn" onClick={() => setShowColumnConfig(false)}><X size={24} /></button>
              </div>
              <div className="modal-body">
                <p style={{ marginBottom: '20px', fontSize: '14px', color: '#666' }}>
                  Ces réglages s'appliquent à tous les utilisateurs du Hub.
                </p>
                <div className="column-config-list">
                  {columnSettings.map(col => (
                    <div key={col.id} className="column-config-item">
                      <span>{col.label}</span>
                      <button 
                        className={`btn-toggle-col ${col.is_visible ? 'visible' : ''}`}
                        onClick={() => toggleColumnVisibility(col.column_key, col.is_visible)}
                        disabled={user.role !== 'admin'}
                      >
                        {col.is_visible ? <Eye size={18} /> : <EyeOff size={18} />}
                        {col.is_visible ? 'Visible' : 'Masqué'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
          </>
        )}
      </main>

      <style>{`
        .order-lines-container { display: flex; flex-direction: column; gap: 4px; }
        .order-lines-container.wider { min-width: 300px; max-width: 500px; }
        .order-line-detail { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; color: #555; border-bottom: 1px dashed #eee; padding-bottom: 2px; }
        .order-line-detail:last-child { border-bottom: none; }
        .line-number-badge { background: #f0f0f0; color: #888; padding: 0 4px; border-radius: 3px; font-weight: bold; min-width: 18px; text-align: center; }
        .line-desc { flex-grow: 1; }
        .line-amt { font-style: italic; color: #888; white-space: nowrap; }
        .total-amount-highlight { font-weight: 800; color: var(--secondary-color); }
        .total-amount-highlight.ttc { color: var(--primary-color); }
        .label-bold-wider { font-weight: 700; color: var(--secondary-color); display: inline-block; min-width: 200px; }

        .data-table-container { 
          background: var(--white); 
          border-radius: 8px; 
          overflow: auto; 
          box-shadow: 0 4px 6px rgba(0,0,0,0.05); 
          max-width: 100%;
          max-height: 70vh; /* Limite la hauteur pour garder le scroll HT visible */
          margin-bottom: 20px;
          border: 1px solid #eee;
          position: relative;
        }
        
        /* Force scrollbar visibility */
        .data-table-container::-webkit-scrollbar { height: 10px; width: 10px; }
        .data-table-container::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 10px; }
        .data-table-container::-webkit-scrollbar-thumb { background: #ccc; border-radius: 10px; }
        .data-table-container::-webkit-scrollbar-thumb:hover { background: #999; }

        .data-table { width: 100%; border-collapse: separate; border-spacing: 0; }
        .data-table th, .data-table td { 
          padding: 12px 15px; 
          text-align: left; 
          border-bottom: 1px solid #eee; 
          font-size: 13px; 
          white-space: nowrap; 
        }
        .data-table td .order-lines-container, 
        .data-table td .label-bold-wider { 
          white-space: normal; 
        }
        .data-table th { 
          background: #f8f9fa; 
          color: var(--secondary-color); 
          font-weight: 700; 
          vertical-align: top;
          position: sticky;
          top: 0;
          z-index: 10;
          border-bottom: 2px solid #eee;
        }
        
        .th-content { display: flex; align-items: center; cursor: pointer; user-select: none; margin-bottom: 8px; }
        .th-content:hover { color: var(--primary-color); }
        .sort-indicator { color: var(--primary-color); font-weight: 800; }
        
        .column-filter input {
          width: 100%;
          padding: 4px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 11px;
          font-weight: normal;
          outline: none;
        }
        .column-filter input:focus { border-color: var(--primary-color); }

        .orders-sub-header { margin-bottom: 20px; }
        .header-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        
        .filter-group { display: flex; align-items: center; background: var(--white); padding: 5px 12px; border-radius: 50px; border: 1px solid #ddd; }
        .filter-select { border: none; outline: none; background: none; margin-left: 5px; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }

        .search-bar { display: flex; align-items: center; background: var(--white); padding: 5px 12px; border-radius: 50px; border: 1px solid #ddd; min-width: 200px; }
        .search-bar input { border: none; outline: none; padding-left: 8px; width: 100%; font-family: inherit; font-size: 13px; }

        .status-badge { background: #e9ecef; padding: 3px 8px; border-radius: 4px; font-size: 11px; color: #495057; font-weight: 600; }
        
        .row-operating { background-color: rgba(232, 245, 233, 0.3); }
        .row-investment { background-color: rgba(227, 242, 253, 0.3); }

        .section-indicator {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          border-radius: 4px;
          font-weight: 800;
          font-size: 10px;
        }
        .section-indicator.f { background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; }
        .section-indicator.i { background: #e3f2fd; color: #1565c0; border: 1px solid #bbdefb; }

        .btn-sm { padding: 6px 12px; font-size: 13px; }

        /* Modal Styles */
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.5);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 2000;
        }
        .modal-content {
          background: white;
          width: 90%;
          max-width: 700px;
          border-radius: 12px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
        }
        .modal-header { padding: 20px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .modal-header h2 { margin: 0; font-size: 20px; color: var(--secondary-color); }
        .close-btn { background: none; border: none; cursor: pointer; color: #666; }
        .modal-body { padding: 20px; overflow-y: auto; }

        .column-config-list { display: grid; gap: 10px; }
        .column-config-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 6px;
        }
        .btn-toggle-col {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 5px 10px;
          border-radius: 4px;
          border: 1px solid #ddd;
          background: white;
          cursor: pointer;
          font-size: 12px;
          font-weight: 600;
        }
        .btn-toggle-col.visible { background: var(--secondary-color); color: white; border-color: var(--secondary-color); }
      `}</style>
    </div>
  );
};

export default Budget;
