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
  const [view, setView] = useState<'summary' | 'lines' | 'invoices' | 'orders' | 'operations' | 'gestion'>('summary');
  const [isRaw, setIsRaw] = useState(false);
  const [rawData, setRawData] = useState<any[]>([]);
  const [budgetLines, setBudgetLines] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [operations, setOperations] = useState<any[]>([]);
  const [m57Plan, setM57Plan] = useState<any[]>([]);
  const [columnSettings, setColumnSettings] = useState<ColumnSetting[]>([]);
  const [importLogs, setImportLogs] = useState<any[]>([]);
  
  const [showM57, setShowM57] = useState(false);
  const [showZeroBudget, setShowZeroBudget] = useState(false);
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

  const [expandedOrders, setExpandedOrders] = useState<string[]>([]);
  const toggleExpand = (id: string) => setExpandedOrders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const getM57Label = (code: string, type: 'nature' | 'fonction') => {
    if (!code) return '';
    const cleanCode = code.toString().trim();
    const plan = m57Plan.find(p => p.code === cleanCode && (p.type === type || !p.type));
    return plan ? plan.label : 'Inconnu dans le référentiel';
  };

  const getSectionFromM57 = (natureCode: string) => {
    if (!natureCode) return '';
    const cleanCode = natureCode.toString().trim();
    // In M57, nature codes starting with 2 are Investment, others are usually Operating
    // But we check the plan first if available
    const plan = m57Plan.find(p => p.code === cleanCode);
    if (plan && plan.section) return plan.section;
    
    // Fallback: nature starting with 2 or 1 (some 1) is Investment? 
    // Usually: Nature 2xxx = Investissement, 6xxx/7xxx = Fonctionnement
    if (cleanCode.startsWith('2')) return 'I';
    if (cleanCode.startsWith('6') || cleanCode.startsWith('7') || cleanCode.startsWith('0')) return 'F';
    return '';
  };

  const [m57View, setM57View] = useState<'nature' | 'fonction'>('nature');

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
    const [linesRes, invoicesRes, ordersRes, operationsRes, m57Res, logsRes] = await Promise.all([
      fetch('http://localhost:3001/api/budget/lines', { headers }),
      fetch('http://localhost:3001/api/budget/invoices', { headers }),
      fetch('http://localhost:3001/api/orders', { headers }),
      fetch('http://localhost:3001/api/budget/operations', { headers }),
      fetch('http://localhost:3001/api/m57-plan', { headers }),
      fetch('http://localhost:3001/api/import-logs', { headers })
    ]);
    
    if (linesRes.ok) setBudgetLines(await linesRes.json());
    if (invoicesRes.ok) setInvoices(await invoicesRes.json());
    if (ordersRes.ok) setOrders(await ordersRes.json());
    if (operationsRes.ok) setOperations(await operationsRes.json());
    if (m57Res.ok) setM57Plan(await m57Res.json());
    if (logsRes.ok) setImportLogs(await logsRes.json());
  };

  const getLastImport = (type: string) => {
    const log = importLogs.find(l => l.type === type);
    if (!log) return null;
    const date = new Date(log.imported_at);
    return `Le ${date.toLocaleDateString('fr-FR')} à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} par ${log.username}`;
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (['lines', 'invoices', 'orders', 'operations'].includes(view)) {
      fetch(`http://localhost:3001/api/column-settings/${view}`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(res => res.json())
        .then(cols => {
          const sortedCols = [...cols].sort((a, b) => {
            if (a.display_order !== 0 || b.display_order !== 0) {
              return (a.display_order || 0) - (b.display_order || 0);
            }
            if (a.column_key === 'num' || a.column_key === 'Service') return -1;
            if (b.column_key === 'num' || b.column_key === 'Service') return 1;
            if (a.column_key === 'Libellé' || a.column_key === 'label' || a.column_key === 'libelle') return -1;
            if (b.column_key === 'Libellé' || b.column_key === 'label' || b.column_key === 'libelle') return 1;
            if (a.column_key === 'Nature' || a.column_key === 'nature') return -1;
            if (b.column_key === 'Nature' || b.column_key === 'nature') return 1;
            return 0;
          });
          setColumnSettings(sortedCols);
        });
    }
  }, [view]);

  useEffect(() => {
    if (isRaw) {
      const tableMap: any = { 'lines': 'budget_lines', 'invoices': 'invoices', 'orders': 'orders', 'operations': 'operations' };
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
    await fetch(`http://localhost:3001/api/column-settings/${view}/bulk`, {
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
      
      const nature = order['Article par nature'] || order.nature || '';
      const sectionFromNature = getSectionFromM57(nature);
      // If the group doesn't have a valid section yet, or this line has one, use it
      if (!groups[nr].section || groups[nr].section === '') {
          groups[nr].section = sectionFromNature;
      }

      groups[nr]._lines.push({
        nr: order['N° ligne'],
        desc: order['Désignation'] || order.description,
        amtHt: amtHt,
        amtTtc: amtTtc,
        nature: nature,
        fonction: order['Article par fonction'] || order.fonction || '',
        section: sectionFromNature
      });
    });
    Object.values(groups).forEach((g: any) => {
      g._lines.sort((a: any, b: any) => parseInt(a.nr) - parseInt(b.nr));
    });
    return Object.values(groups);
  }, [orders, m57Plan]);

  const [expandedLines, setExpandedLines] = useState<string[]>([]);
  const toggleExpandLine = (id: string) => setExpandedLines(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const groupedBudgetLines = useMemo(() => {
    const chapters: Record<string, any> = {};
    const financialCols = ['Budget voté', 'Disponible', 'Mt. prévision', 'Mt. pré-engagé', 'Mt. engagé', 'Mt. facturé', 'Mt. pré-mandaté', 'Mt. mandaté', 'Mt. payé', 'allocated_amount'];
    
    budgetLines.forEach(line => {
      const chapter = (line['Chapitre par nature'] || line.chapter || 'SANS_CHAPITRE').toString().trim();
      const label = (line['Libellé'] || line.label || 'SANS_LIBELLE').toString().trim();
      
      if (!chapters[chapter]) {
        chapters[chapter] = {
          _isChapter: true,
          chapter: chapter,
          "Chapitre par nature": chapter,
          _labels: {},
          _total: {}
        };
        financialCols.forEach(col => chapters[chapter]._total[col] = 0);
      }
      
      if (!chapters[chapter]._labels[label]) {
        chapters[chapter]._labels[label] = {
          ...line,
          "Libellé": label,
          label: label,
          _isGroup: true,
          _lines: []
        };
        financialCols.forEach(col => chapters[chapter]._labels[label][col] = 0);
      }
      
      financialCols.forEach(col => {
        const val = parseFloat(line[col] || 0);
        chapters[chapter]._labels[label][col] += val;
        chapters[chapter]._total[col] += val;
      });
      
      chapters[chapter]._labels[label]._lines.push(line);
    });
    
    // Convert to flat list for rendering (Chapter Header then its Grouped Labels)
    const result: any[] = [];
    Object.keys(chapters).sort().forEach(chKey => {
      const chapter = chapters[chKey];
      result.push({
        ...chapter,
        "Libellé": `CHAPITRE ${chKey}`,
        _isChapter: true,
        // Map totals for rendering
        ...chapter._total
      });
      
      const labels = Object.values(chapter._labels);
      // Sort labels by name or amount? Let's sort by name for now
      labels.sort((a: any, b: any) => a.label.localeCompare(b.label));
      result.push(...labels);
    });
    
    return result;
  }, [budgetLines]);

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

  const filteredData = useMemo(() => {
    let data = view === 'lines' ? groupedBudgetLines : view === 'invoices' ? invoices : view === 'operations' ? operations : filteredOrders;
    
    if (view === 'lines') {
      if (!showZeroBudget) {
        data = data.filter((row: any) => parseFloat(row['Budget voté'] || 0) !== 0);
      }
    }

    if (view !== 'orders') {
      const sTerm = searchTerm.toLowerCase();
      if (sTerm) {
        data = data.filter((row: any) => Object.values(row).some(v => v?.toString().toLowerCase().includes(sTerm)));
      }
      for (const [key, filterValue] of Object.entries(columnFilters)) {
        if (filterValue) {
          data = data.filter((row: any) => (row[key] || '').toString().toLowerCase().includes(filterValue.toLowerCase()));
        }
      }
      if (sortConfig) {
        data = [...data].sort((a: any, b: any) => {
          const aVal = a[sortConfig.key];
          const bVal = b[sortConfig.key];
          if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
          return 0;
        });
      }
    }
    return data;
  }, [view, budgetLines, groupedBudgetLines, invoices, operations, filteredOrders, searchTerm, columnFilters, sortConfig, showZeroBudget]);

  const getRowClass = (section: string) => {
    if (section === 'Fonctionnement' || section === 'F') return 'row-operating';
    if (section === 'Investissement' || section === 'I') return 'row-investment';
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
            {['summary', 'lines', 'invoices', 'orders', 'operations', 'gestion'].map(tab => {
              // Only admin/finances/compta can see 'gestion'
              if (tab === 'gestion' && !['admin', 'finances', 'compta'].includes(user.role)) return null;
              return (
              <button 
                key={tab}
                className={`tab-btn ${view === tab ? 'active' : ''}`} 
                onClick={() => {
                  setView(tab as any); 
                  setIsRaw(false);
                  setColumnFilters({});
                  setSearchTerm('');
                  setSortConfig(null);
                }}
              >
                {tab === 'summary' && 'Résumé'}
                {tab === 'lines' && 'Lignes'}
                {tab === 'invoices' && 'Factures'}
                {tab === 'orders' && 'Commandes'}
                {tab === 'operations' && 'Opérations'}
                {tab === 'gestion' && 'Gestion'}
              </button>
            )})}
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
                    <Upload size={16} /> Commandes (.xls)
                    <input type="file" hidden onChange={(e) => handleFileUpload(e, 'orders')} accept=".xlsx, .xls" />
                  </label>
                )}
              </div>
            )}

            {view === 'summary' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <div className="dashboard-grid">
                  <div className="dashboard-card primary" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div className="card-icon"><Euro size={24} /></div>
                      <div>
                        <h3 className="card-title">Budget Alloué Total</h3>
                        <p className="card-value">{budgetLines.reduce((acc, curr) => acc + (curr.allocated_amount || 0), 0).toLocaleString()} €</p>
                      </div>
                    </div>
                    <div style={{ width: '100%', fontSize: '0.85rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                      <span>Fonc: {budgetLines.filter(l => l.section === 'F').reduce((acc, curr) => acc + (curr.allocated_amount || 0), 0).toLocaleString()} €</span>
                      <span>Inv: {budgetLines.filter(l => l.section === 'I').reduce((acc, curr) => acc + (curr.allocated_amount || 0), 0).toLocaleString()} €</span>
                    </div>
                  </div>
                  <div className="dashboard-card secondary" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div className="card-icon"><ShoppingCart size={24} /></div>
                      <div>
                        <h3 className="card-title">Total Commandé (TTC)</h3>
                        <p className="card-value">{groupedOrders.reduce((acc, curr) => acc + (curr._total_ttc || 0), 0).toLocaleString()} €</p>
                      </div>
                    </div>
                    <div style={{ width: '100%', fontSize: '0.85rem', color: '#64748b', display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', borderTop: '1px solid #f1f5f9', paddingTop: '0.5rem' }}>
                      <span>Fonc: {groupedOrders.filter(o => o.section === 'F').reduce((acc, curr) => acc + (curr._total_ttc || 0), 0).toLocaleString()} €</span>
                      <span>Inv: {groupedOrders.filter(o => o.section === 'I').reduce((acc, curr) => acc + (curr._total_ttc || 0), 0).toLocaleString()} €</span>
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

                <div className="table-card">
                  <div style={{ padding: '1.25rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, color: 'var(--color-navy)', fontSize: '1.1rem', fontWeight: 700 }}>Montants Votés (Inclus reports)</h3>
                    <span style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic' }}>* Ces montants incluent les reports de l'exercice précédent</span>
                  </div>
                  <div className="table-responsive" style={{ maxHeight: '400px' }}>
                    <table className="modern-table">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Libellé</th>
                          <th style={{ textAlign: 'center' }}>Sect.</th>
                          <th style={{ textAlign: 'right' }}>Budget Voté</th>
                        </tr>
                      </thead>
                      <tbody>
                        {budgetLines.filter(l => (l.allocated_amount || 0) > 0).sort((a,b) => b.allocated_amount - a.allocated_amount).map(line => (
                          <tr key={line.id}>
                            <td style={{ fontWeight: 600, color: 'var(--color-navy)' }}>{line.code}</td>
                            <td>{line.label}</td>
                            <td style={{ textAlign: 'center' }}>
                              <span className={`section-badge ${line.section === 'F' ? 'f' : 'i'}`}>{line.section}</span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 800 }}>{(line.allocated_amount || 0).toLocaleString()} €</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {['lines', 'invoices', 'orders', 'operations'].includes(view) && (
              <div className="orders-container">
                <div className="toolbar">
                  <div className="toolbar-actions">
                    <button className="toolbar-btn" onClick={() => setShowM57(true)}>
                      <BookOpen size={16} /> Plan M57
                    </button>
                    <button className="toolbar-btn" onClick={() => setShowColumnConfig(true)}>
                      <Columns size={16} /> Colonnes
                    </button>
                    {view === 'lines' && (
                      <button 
                        className={`toolbar-btn ${showZeroBudget ? 'active' : ''}`}
                        onClick={() => setShowZeroBudget(!showZeroBudget)}
                        style={{ background: showZeroBudget ? 'var(--color-navy)' : 'white', color: showZeroBudget ? 'white' : 'var(--color-slate-700)' }}
                      >
                        <Eye size={16} /> {showZeroBudget ? 'Masquer nuls' : 'Afficher tout'}
                      </button>
                    )}
                  </div>
                  <div className="toolbar-filters">
                    <div className="search-input-wrapper">
                      <Search size={16} className="search-icon" />
                      <input 
                        type="text" 
                        placeholder="Rechercher..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                      />
                    </div>
                    {view === 'orders' && (
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
                    )}
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
                        {filteredData.length > 0 ? filteredData.map((row: any, index: number) => {
                          const hasLines = (view === 'orders' || (view === 'lines' && row._isGroup)) && row._lines && row._lines.length > 0;
                          const linesCount = hasLines ? row._lines.length : 0;
                          
                          let isExpandable = false;
                          let isExpanded = false;

                          if (view === 'orders') {
                            const firstLineDesc = hasLines ? row._lines[0].desc?.trim() : '';
                            const globalLabel = (row['Libellé'] || row.label || '').trim();
                            isExpandable = hasLines && (linesCount > 1 || (linesCount === 1 && firstLineDesc !== globalLabel));
                            isExpanded = expandedOrders.includes(row.id || index.toString());
                          } else if (view === 'lines') {
                            isExpandable = hasLines && linesCount > 1;
                            isExpanded = expandedLines.includes(row['Libellé'] || index.toString());
                          }
                          
                          return (
                            <React.Fragment key={row.id || index}>
                              <tr 
                                className={`${getRowClass(row.Section || row.section)} ${row._isChapter ? 'chapter-header-row' : ''}`}
                                onClick={() => {
                                  if (isExpandable) {
                                    if (view === 'orders') toggleExpand(row.id || index.toString());
                                    else toggleExpandLine(row['Libellé'] || index.toString());
                                  }
                                }}
                                style={{ 
                                  cursor: isExpandable ? 'pointer' : 'default',
                                  backgroundColor: row._isChapter ? '#f1f5f9' : undefined,
                                  fontWeight: row._isChapter ? 'bold' : 'normal'
                                }}
                              >
                                {columnSettings.filter(c => c.is_visible).map(col => {
                                  let content: React.ReactNode = row[col.column_key];
                                  let tooltip = '';
                                  let cellClass = '';
                                  let cellStyle: React.CSSProperties = {
                                    color: col.color || 'inherit',
                                    fontWeight: col.is_bold ? 'bold' : 'normal',
                                    fontStyle: col.is_italic ? 'italic' : 'normal'
                                  };

                                  if (col.column_key === 'Section' || col.column_key === 'section') {
                                    const sec = row[col.column_key];
                                    content = (
                                      <span className={`section-badge ${(sec === 'Fonctionnement' || sec === 'F') ? 'f' : 'i'}`}>
                                        {(sec === 'Fonctionnement' || sec === 'F') ? 'F' : 'I'}
                                      </span>
                                    );
                                  } else if (col.column_key === 'status' || col.column_key === 'Etat' || col.column_key === 'termine') {
                                    const val = row[col.column_key];
                                    const isDone = val === 1 || val === 'OUI' || val === 'Payée';
                                    content = <span className={`badge ${isDone ? 'success' : 'status'}`}>{isDone ? 'Terminé' : (val === 0 || val === 'NON') ? 'En cours' : val}</span>;
                                  } else if (
                                    col.column_key === 'Montant HT' || col.column_key === 'amount_ht' || 
                                    col.column_key === 'montant_prevu' || col.column_key === 'allocated_amount' ||
                                    col.column_key === 'Budget voté' || col.column_key === 'Disponible' ||
                                    col.column_key === 'Mt. prévision' || col.column_key === 'Mt. pré-engagé' ||
                                    col.column_key === 'Mt. engagé' || col.column_key === 'Mt. facturé' ||
                                    col.column_key === 'Mt. pré-mandaté' || col.column_key === 'Mt. mandaté' ||
                                    col.column_key === 'Mt. payé'
                                  ) {
                                    const val = view === 'orders' ? row._total_ht : row[col.column_key];
                                    content = <span className="amount-ht">{(parseFloat(val) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>;
                                  } else if (col.column_key === 'Montant TTC' || col.column_key === 'amount_ttc' || col.column_key === 'solde') {
                                    const val = view === 'orders' ? row._total_ttc : row[col.column_key];
                                    content = <span className="amount-ttc">{(val || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</span>;
                                  } else if (col.column_key === 'date' || col.column_key === 'Date de la commande') {
                                    if (row[col.column_key]) {
                                      const d = new Date(row[col.column_key]);
                                      if (!isNaN(d.getTime())) {
                                        content = d.toLocaleDateString('fr-FR', { year: '2-digit', month: '2-digit', day: '2-digit' });
                                      }
                                    }
                                  } else if (col.column_key === 'Libellé' || col.column_key === 'label' || col.column_key === 'libelle') {
                                    tooltip = row[col.column_key];
                                    content = (
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {isExpandable && view === 'lines' && (
                                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                                            {isExpanded ? '▼' : '▶'} ({linesCount})
                                          </span>
                                        )}
                                        <span style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {row[col.column_key]}
                                        </span>
                                      </div>
                                    );
                                    cellStyle = { ...cellStyle, maxWidth: '250px' };
                                  }
 else if (col.column_key === 'Désignation' || col.column_key === 'description') {
                                    if (view === 'orders') {
                                      const firstLineDesc = hasLines ? row._lines[0].desc?.trim() : '';
                                      content = (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          {isExpandable && (
                                            <span style={{ fontSize: '12px', color: '#64748b' }}>
                                              {isExpanded ? '▼' : '▶'} {linesCount > 1 ? `(${linesCount} lignes)` : ''}
                                            </span>
                                          )}
                                          <span style={{ maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={firstLineDesc || row.description}>
                                            {firstLineDesc || row.description}
                                          </span>
                                        </div>
                                      );
                                    }
                                  } else if (col.column_key === 'nature' || col.column_key === 'Article par nature') {
                                    tooltip = getM57Label(row[col.column_key], 'nature');
                                    cellStyle = { ...cellStyle, textDecoration: 'underline dotted', cursor: 'help' };
                                  } else if (col.column_key === 'fonction' || col.column_key === 'Article par fonction') {
                                    tooltip = getM57Label(row[col.column_key], 'fonction');
                                    cellStyle = { ...cellStyle, textDecoration: 'underline dotted', cursor: 'help' };
                                  }

                                  return (
                                    <td key={col.column_key} style={cellStyle} title={tooltip || undefined} className={cellClass}>
                                      {content}
                                    </td>
                                  );
                                })}
                              </tr>
                              {isExpandable && isExpanded && view === 'orders' && (
                                <tr className="expanded-row-bg" style={{ backgroundColor: '#f1f5f9' }}>
                                  <td colSpan={columnSettings.filter(c => c.is_visible).length} style={{ padding: '10px 20px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                      <thead>
                                        <tr style={{ color: '#64748b', borderBottom: '1px solid #cbd5e1' }}>
                                          <th style={{ padding: '4px', textAlign: 'center' }}>N° Ligne</th>
                                          <th style={{ padding: '4px' }}>Description</th>
                                          <th style={{ padding: '4px' }}>Nature</th>
                                          <th style={{ padding: '4px' }}>Fonction</th>
                                          <th style={{ padding: '4px', textAlign: 'right' }}>Montant TTC</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row._lines.map((line: any, idx: number) => (
                                          <tr key={idx} style={{ borderBottom: '1px dashed #e2e8f0' }}>
                                            <td style={{ padding: '4px', textAlign: 'center', fontWeight: 'bold' }}>{line.nr}</td>
                                            <td style={{ padding: '4px' }}>{line.desc}</td>
                                            <td style={{ padding: '4px' }} title={getM57Label(line.nature, 'nature')}>{line.nature}</td>
                                            <td style={{ padding: '4px' }} title={getM57Label(line.fonction, 'fonction')}>{line.fonction}</td>
                                            <td style={{ padding: '4px', textAlign: 'right', fontWeight: 'bold', color: 'var(--color-ivry)' }}>
                                              {line.amtTtc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                              {isExpandable && isExpanded && view === 'lines' && (
                                <tr className="expanded-row-bg" style={{ backgroundColor: '#f8fafc' }}>
                                  <td colSpan={columnSettings.filter(c => c.is_visible).length} style={{ padding: '10px 20px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                      <thead>
                                        <tr style={{ color: '#64748b', borderBottom: '1px solid #cbd5e1' }}>
                                          <th style={{ padding: '4px' }}>Code</th>
                                          <th style={{ padding: '4px' }}>Masque</th>
                                          <th style={{ padding: '4px', textAlign: 'right' }}>Budget Voté</th>
                                          <th style={{ padding: '4px', textAlign: 'right' }}>Disponible</th>
                                          <th style={{ padding: '4px', textAlign: 'right' }}>Mt. Engagé</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row._lines.map((line: any, idx: number) => (
                                          <tr key={idx} style={{ borderBottom: '1px dashed #e2e8f0' }}>
                                            <td style={{ padding: '4px', fontWeight: 'bold' }}>{line['Code']}</td>
                                            <td style={{ padding: '4px' }}>{line['Masque']}</td>
                                            <td style={{ padding: '4px', textAlign: 'right' }}>{(parseFloat(line['Budget voté']) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                                            <td style={{ padding: '4px', textAlign: 'right' }}>{(parseFloat(line['Disponible']) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                                            <td style={{ padding: '4px', textAlign: 'right' }}>{(parseFloat(line['Mt. engagé']) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        }) : (
                          <tr>
                            <td colSpan={columnSettings.filter(c => c.is_visible).length || 1} className="empty-state">
                              Aucune donnée ne correspond à vos critères.
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <input type="file" accept=".xlsx,.xls" onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleComptaUpload('/api/budget/import-lines', e.target.files[0], 'lignes');
                            e.target.value = '';
                          }
                        }} />
                        {getLastImport('lines') && <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>Dernier import : {getLastImport('lines')}</span>}
                      </div>
                      {importStatus?.type === 'lignes' && (
                        <div style={{ marginTop: '8px', color: importStatus.isError ? '#d32f2f' : '#2e7d32', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {importStatus.isError ? <AlertCircle size={16}/> : <CheckCircle2 size={16}/>} {importStatus.message}
                        </div>
                      )}
                    </div>

                    <div className="import-item">
                      <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Commandes</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <input type="file" accept=".xlsx,.xls" onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleComptaUpload('/api/orders/import', e.target.files[0], 'commandes');
                            e.target.value = '';
                          }
                        }} />
                        {getLastImport('orders') && <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>Dernier import : {getLastImport('orders')}</span>}
                      </div>
                      {importStatus?.type === 'commandes' && (
                        <div style={{ marginTop: '8px', color: importStatus.isError ? '#d32f2f' : '#2e7d32', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {importStatus.isError ? <AlertCircle size={16}/> : <CheckCircle2 size={16}/>} {importStatus.message}
                        </div>
                      )}
                    </div>

                    <div className="import-item">
                      <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>Factures</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <input type="file" accept=".xlsx,.xls" onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            handleComptaUpload('/api/budget/import-invoices', e.target.files[0], 'factures');
                            e.target.value = '';
                          }
                        }} />
                        {getLastImport('invoices') && <span style={{ fontSize: '12px', color: '#64748b', fontStyle: 'italic' }}>Dernier import : {getLastImport('invoices')}</span>}
                      </div>
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
                <h2 className="modal-title">Référentiel M57</h2>
                <button className="icon-btn" onClick={() => setShowM57(false)}><X size={20} /></button>
              </div>
              <div className="modal-body p-0">
                <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
                  <button 
                    style={{ flex: 1, padding: '10px', background: m57View === 'nature' ? '#f1f5f9' : 'white', border: 'none', borderBottom: m57View === 'nature' ? '2px solid var(--color-navy)' : '2px solid transparent', fontWeight: m57View === 'nature' ? 'bold' : 'normal', cursor: 'pointer' }}
                    onClick={() => setM57View('nature')}
                  >
                    Natures
                  </button>
                  <button 
                    style={{ flex: 1, padding: '10px', background: m57View === 'fonction' ? '#f1f5f9' : 'white', border: 'none', borderBottom: m57View === 'fonction' ? '2px solid var(--color-navy)' : '2px solid transparent', fontWeight: m57View === 'fonction' ? 'bold' : 'normal', cursor: 'pointer' }}
                    onClick={() => setM57View('fonction')}
                  >
                    Fonctions
                  </button>
                </div>
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
                      {m57Plan.filter(item => item.type === m57View || (!item.type && m57View === 'nature')).map(item => (
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
                      {m57Plan.filter(item => item.type === m57View || (!item.type && m57View === 'nature')).length === 0 && (
                        <tr><td colSpan={3} className="text-center py-8 text-gray">Aucun code trouvé.</td></tr>
                      )}
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
        .badge.success { background: var(--color-green-50); color: var(--color-green-500); border: 1px solid #bbf7d0; }
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
