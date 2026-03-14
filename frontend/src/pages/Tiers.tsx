import React, { useState, useEffect, useMemo, useRef } from 'react';
import Header from '../components/Header';
import { Users, Search, X, Columns, Eye, EyeOff, Info, Phone, Mail, MapPin, Plus, Edit2, Trash2, FileText, CheckCircle, ChevronRight, ArrowUp, ArrowDown, Upload, ShoppingCart, ExternalLink } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface Tier {
  id: number;
  code: string;
  nom: string;
  activite: string;
  siret: string;
  adresse: string;
  telephone: string;
  email: string;
  order_count?: number;
  invoice_count?: number;
  has_order_recipient?: number;
}

interface Contact {
  id: number;
  tier_id: number;
  nom: string;
  prenom: string;
  role: string;
  telephone: string;
  email: string;
  commentaire: string;
  is_order_recipient: number;
}

interface Order {
  id: number;
  "N° Commande": string;
  "Libellé": string;
  "Montant TTC": string;
  "Date de la commande": string;
  matchedInvoices: any[];
  COMMANDE_ROO_IMA_REF?: string;
}

interface GroupedInvoice {
  number: string;
  total_ttc: number;
  lines: any[];
  hasFile: boolean;
  filePath: string | null;
}

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

const Tiers: React.FC = () => {
  const [view, setView] = useState<'list' | 'details'>('list');
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [stats, setStats] = useState({
    total_orders: 0,
    total_invoices: 0,
    total_tiers_all: 0,
    total_tiers_dsi: 0
  });
  const [showAll, setShowAll] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);
  const [columnSettings, setColumnSettings] = useState<ColumnSetting[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
  const [showColumnConfig, setShowColumnConfig] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [limit, setLimit] = useState(100);
  const [expandedTiers, setExpandedTiers] = useState<Record<string, boolean>>({});
  
  // Detail view state
  const [activeDetailTab, setActiveDetailTab] = useState<'info' | 'contacts' | 'orders'>('info');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [groupedInvoices, setGroupedInvoices] = useState<GroupedInvoice[]>([]);
  const [previewFile, setPreviewFile] = useState<{ url: string, name: string } | null>(null);
  
  // Contact Modal state
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [newContact, setNewContact] = useState({
    nom: '', prenom: '', role: '', telephone: '', email: '', commentaire: '', is_order_recipient: 0
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { token, user } = useAuth();
  const currentUser = user || { role: 'user', username: '', service_code: undefined, service_complement: undefined, id: 0 };
  const [urlSedit, setUrlSedit] = useState<string>('https://seditgfprod.ivry.local/SeditGfSMProd');

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      await Promise.all([fetchTiers(), fetchColumnSettings(), fetchSettings()]);
      setIsLoading(false);
    };
    init();
  }, [showAll]);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings/public');
      if (res.ok) {
        const data = await res.json();
        const seditSetting = data.find((s: any) => s.setting_key === 'url_sedit_fi');
        if (seditSetting) setUrlSedit(seditSetting.setting_value);
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsImporting(true);
      const res = await fetch('/api/tiers/import', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const result = await res.json();
      if (res.ok) {
        alert(`Import réussi : ${result.created} créés, ${result.updated} mis à jour.`);
        fetchTiers();
      } else {
        alert(`Erreur : ${result.message}`);
      }
    } catch (err) {
      console.error('Import error:', err);
      alert('Erreur lors de l\'import');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const fetchTiers = async () => {
    try {
      console.log('Fetching tiers, showAll:', showAll);
      const res = await fetch(`/api/tiers?all=${showAll}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      console.log('Tiers data received:', data);
      setTiers(data.tiers || []);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      console.error('Error fetching tiers:', err);
    }
  };

  const fetchColumnSettings = async () => {
    try {
      const res = await fetch('/api/column-settings/tiers', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const cols = await res.json();
      setColumnSettings(cols.sort((a: any, b: any) => (a.display_order || 0) - (b.display_order || 0)));
    } catch (err) {
      console.error('Error fetching column settings:', err);
    }
  };

  const fetchTierDetails = async (tier: Tier) => {
    setSelectedTier(tier);
    setView('details');
    setActiveDetailTab('info');
    try {
      const timestamp = Date.now();
      const [contactsRes, ordersRes] = await Promise.all([
        fetch(`/api/tiers/${tier.id}/contacts?t=${timestamp}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`/api/tiers/${tier.id}/history?t=${timestamp}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);
      if (contactsRes.ok) setContacts(await contactsRes.json());
      if (ordersRes.ok) {
        const data = await ordersRes.json();
        setOrders(data.orders || []);
        setGroupedInvoices(data.invoices || []);
      }
    } catch (err) {
      console.error('Error fetching tier details:', err);
    }
  };

  const handleSaveContact = async () => {
    if (!selectedTier) return;
    const url = editingContact 
      ? `/api/contacts/${editingContact.id}`
      : `/api/tiers/${selectedTier.id}/contacts`;
    
    const method = editingContact ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        },
        body: JSON.stringify(newContact)
      });
      if (res.ok) {
        setIsContactModalOpen(false);
        setEditingContact(null);
        setNewContact({ nom: '', prenom: '', role: '', telephone: '', email: '', commentaire: '', is_order_recipient: 0 });
        fetchTierDetails(selectedTier);
      }
    } catch (err) {
      console.error('Error saving contact:', err);
    }
  };

  const handleDeleteContact = async (id: number) => {
    if (!window.confirm('Supprimer ce contact ?')) return;
    try {
      await fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (selectedTier) fetchTierDetails(selectedTier);
    } catch (err) {
      console.error('Error deleting contact:', err);
    }
  };

  const filteredTiers = useMemo(() => {
    let data = [...tiers];
    
    // Global search
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      data = data.filter(t => 
        t.nom?.toLowerCase().includes(s) || 
        t.code?.toLowerCase().includes(s) ||
        t.siret?.toLowerCase().includes(s) ||
        t.activite?.toLowerCase().includes(s)
      );
    }

    // Column filters
    for (const [key, val] of Object.entries(columnFilters)) {
      if (val) {
        data = data.filter(t => (t[key as keyof Tier]?.toString() || '').toLowerCase().includes(val.toLowerCase()));
      }
    }

    // Sort
    if (sortConfig) {
      data.sort((a, b) => {
        const aVal = a[sortConfig.key as keyof Tier] || '';
        const bVal = b[sortConfig.key as keyof Tier] || '';
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return data;
  }, [tiers, searchTerm, columnFilters, sortConfig]);

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

  const updateColumnSettingsBulk = async (newSettings: ColumnSetting[]) => {
    setColumnSettings(newSettings);
    await fetch(`/api/column-settings/tiers/bulk`, {
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

  const moveColumn = (index: number, direction: 'up' | 'down') => {
    const newSettings = [...columnSettings];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSettings.length) return;

    const temp = newSettings[index];
    newSettings[index] = newSettings[targetIndex];
    newSettings[targetIndex] = temp;

    // Redéfinir display_order explicitement
    const updated = newSettings.map((col, idx) => ({
      ...col,
      display_order: idx
    }));

    updateColumnSettingsBulk(updated);
  };

  const groupedTiers = useMemo(() => {
    const groups: Record<string, Tier[]> = {};
    filteredTiers.forEach(tier => {
      const name = tier.nom || 'Sans nom';
      if (!groups[name]) groups[name] = [];
      groups[name].push(tier);
    });
    return groups;
  }, [filteredTiers]);

  const sortedGroupNames = useMemo(() => {
    return Object.keys(groupedTiers).sort((a, b) => a.localeCompare(b));
  }, [groupedTiers]);

  return (
    <div className="tiers-page">
      <Header />
      <main className="main-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Gestion des Tiers</h1>
            <p className="page-subtitle">Consultez et gérez vos fournisseurs, contacts et historique.</p>
          </div>
          <div className="view-tabs">
            <button 
              className={`tab-btn ${view === 'list' ? 'active' : ''}`} 
              onClick={() => setView('list')}
            >
              Liste des tiers
            </button>
            <button 
              className={`tab-btn ${view === 'details' ? 'active' : ''}`} 
              onClick={() => selectedTier && setView('details')}
              disabled={!selectedTier}
            >
              Détails {selectedTier ? `: ${selectedTier.nom}` : ''}
            </button>
          </div>
        </div>

        {view === 'list' && (
          <div className="list-container">
            <div className="dashboard-grid" style={{ marginBottom: '2rem' }}>
              <div className="dashboard-card secondary">
                <div className="card-icon"><ShoppingCart size={24} /></div>
                <div className="card-content">
                  <h3 className="card-title">Total Commandes</h3>
                  <p className="card-value">{stats.total_orders}</p>
                </div>
              </div>
              <div className="dashboard-card warning">
                <div className="card-icon"><FileText size={24} /></div>
                <div className="card-content">
                  <h3 className="card-title">Total Factures</h3>
                  <p className="card-value">{stats.total_invoices}</p>
                </div>
              </div>
              <div className="dashboard-card primary">
                <div className="card-icon"><Users size={24} /></div>
                <div className="card-content">
                  <h3 className="card-title">Tiers DSI / Total</h3>
                  <p className="card-value">{stats.total_tiers_dsi} / {stats.total_tiers_all}</p>
                </div>
              </div>
            </div>

            <div className="toolbar">
              <div className="toolbar-actions">
                <button 
                  className={`toolbar-btn ${showAll ? 'active' : ''}`}
                  onClick={() => setShowAll(!showAll)}
                  style={{ 
                    background: showAll ? 'var(--color-navy)' : 'white', 
                    color: showAll ? 'white' : 'var(--color-slate-700)',
                    borderColor: showAll ? 'var(--color-navy)' : 'var(--color-slate-200)'
                  }}
                >
                  <Users size={16} /> {showAll ? 'Tiers DSI uniquement' : 'Tous les tiers'}
                </button>
                <button className="toolbar-btn" onClick={() => setShowColumnConfig(true)}>
                  <Columns size={16} /> Colonnes
                </button>
                {(currentUser?.role === 'admin' || currentUser?.role === 'finances' || currentUser?.role === 'compta') && (
                  <>
                    <button className="toolbar-btn" onClick={handleImportClick}>
                      <Upload size={16} /> Import Excel
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      style={{ display: 'none' }} 
                      accept=".xls,.xlsx" 
                      onChange={handleFileChange} 
                    />
                  </>
                )}
              </div>
              <div className="toolbar-filters">
                <div className="search-input-wrapper">
                  <Search size={16} className="search-icon" />
                  <input 
                    type="text" 
                    placeholder="Rechercher un tiers..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                </div>
              </div>
            </div>

            <div className="table-card">
              <div className="table-responsive">
                {isLoading || isImporting ? (
                  <div style={{ padding: '6rem 4rem', textAlign: 'center', color: 'var(--color-navy)' }}>
                    <div className="loading-spinner-container">
                      <div className="loading-spinner-modern"></div>
                    </div>
                    {isImporting ? (
                      <div style={{ marginTop: '1.5rem' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Importation en cours...</h3>
                        <p style={{ color: 'var(--color-slate-500)', fontSize: '0.95rem' }}>
                          Cette opération peut prendre quelques minutes selon la taille du fichier.<br />
                          Merci de patienter.
                        </p>
                      </div>
                    ) : (
                      <div style={{ marginTop: '1.5rem' }}>
                        Chargement des {tiers.length || ''} tiers...
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <table className="modern-table table-bordered">
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}></th>
                          {columnSettings.filter(c => c.is_visible).map(col => (
                            <th key={col.column_key}>
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
                                  className="col-filter-input"
                                />
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedGroupNames.slice(0, limit).length > 0 ? sortedGroupNames.slice(0, limit).map((name) => {
                          const group = groupedTiers[name];
                          const isExpanded = expandedTiers[name];
                          const hasMulti = group.length > 1;
                          
                          return (
                            <React.Fragment key={name}>
                              <tr 
                                onClick={() => {
                                  if (hasMulti) {
                                    setExpandedTiers(prev => ({ ...prev, [name]: !prev[name] }));
                                  } else {
                                    fetchTierDetails(group[0]);
                                  }
                                }} 
                                style={{ cursor: 'pointer', background: hasMulti ? 'var(--color-slate-50)' : 'inherit' }}
                              >
                                <td style={{ textAlign: 'center', color: 'var(--color-navy)' }}>
                                  {hasMulti ? (
                                    isExpanded ? <ChevronRight size={16} style={{ transform: 'rotate(90deg)', transition: 'transform 0.2s' }} /> : <ChevronRight size={16} style={{ transition: 'transform 0.2s' }} />
                                  ) : (
                                    <ChevronRight size={16} />
                                  )}
                                </td>
                                {columnSettings.filter(c => c.is_visible).map(col => {
                                  // For grouped row, we only show the name and aggregate counts if it's a multi-group
                                  if (hasMulti && col.column_key !== 'nom' && col.column_key !== 'order_count' && col.column_key !== 'invoice_count') {
                                    return <td key={col.column_key} style={{ color: 'var(--color-slate-400)', fontSize: '0.8rem', fontStyle: 'italic' }}>- Multiples ({group.length}) -</td>;
                                  }

                                  let val: any;
                                  const hasRecipientInGroup = group.some(t => t.has_order_recipient && t.has_order_recipient > 0);
                                  
                                  if (hasMulti) {
                                    if (col.column_key === 'nom') val = name;
                                    else if (col.column_key === 'order_count') val = group[0].order_count;
                                    else if (col.column_key === 'invoice_count') val = group[0].invoice_count;
                                  } else {
                                    val = group[0][col.column_key as keyof Tier];
                                  }
                                  
                                  if (col.column_key === 'order_count' || col.column_key === 'invoice_count') {
                                    return (
                                      <td key={col.column_key} style={{ textAlign: 'center' }}>
                                        <span className={`badge-count ${col.column_key === 'order_count' ? 'order-badge' : 'invoice-badge'}`}>
                                          {val || 0}
                                        </span>
                                      </td>
                                    );
                                  }

                                  return (
                                    <td 
                                      key={col.column_key}
                                      style={{
                                        color: col.color || 'inherit',
                                        fontWeight: (col.is_bold || (hasMulti && col.column_key === 'nom')) ? 'bold' : 'normal',
                                        fontStyle: col.is_italic ? 'italic' : 'normal'
                                      }}
                                    >
                                      {col.column_key === 'nom' && hasRecipientInGroup && (
                                        <span title="Destinataire des commandes">
                                          <ShoppingCart size={14} style={{ color: 'var(--color-ivry)', marginRight: '8px', verticalAlign: 'middle' }} />
                                        </span>
                                      )}
                                      {val}
                                    </td>
                                  );
                                })}
                              </tr>
                              {hasMulti && isExpanded && group.map((tier, idx) => (
                                <tr key={tier.id} onClick={() => fetchTierDetails(tier)} style={{ cursor: 'pointer', background: '#fff' }}>
                                  <td style={{ textAlign: 'center', color: 'var(--color-slate-300)', paddingLeft: '1.5rem' }}>
                                    <div style={{ width: '2px', height: '100%', background: 'var(--color-slate-200)', margin: '0 auto' }}></div>
                                  </td>
                                  {columnSettings.filter(c => c.is_visible).map(col => {
                                    const val = tier[col.column_key as keyof Tier];
                                    
                                    if (col.column_key === 'order_count' || col.column_key === 'invoice_count') {
                                      return (
                                        <td key={col.column_key} style={{ textAlign: 'center', paddingLeft: '2rem' }}>
                                          {/* On ne réaffiche pas les compteurs sur les doublons car ils sont globaux au nom */}
                                          <span style={{ color: 'var(--color-slate-300)' }}>-</span>
                                        </td>
                                      );
                                    }

                                    return (
                                      <td 
                                        key={col.column_key}
                                        style={{
                                          paddingLeft: col.column_key === 'nom' ? '2rem' : '1rem',
                                          color: col.color || 'inherit',
                                          fontWeight: col.is_bold ? 'bold' : 'normal',
                                          fontStyle: col.is_italic ? 'italic' : 'normal',
                                          fontSize: '0.85rem'
                                        }}
                                      >
                                        {col.column_key === 'nom' ? (
                                          <>
                                            {tier.has_order_recipient && tier.has_order_recipient > 0 && (
                                              <ShoppingCart size={12} style={{ color: 'var(--color-ivry)', marginRight: '6px', verticalAlign: 'middle' }} />
                                            )}
                                            <span style={{ color: 'var(--color-slate-400)' }}>↳ {val} (v{idx+1})</span>
                                          </>
                                        ) : val}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        }) : (
                          <tr>
                            <td colSpan={columnSettings.filter(c => c.is_visible).length + 1} className="empty-state">
                              Aucun tiers trouvé.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    {sortedGroupNames.length > limit && (
                      <div style={{ padding: '1.5rem', textAlign: 'center', borderTop: '1px solid var(--color-slate-100)' }}>
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-slate-500)', marginBottom: '1rem' }}>
                          Affichage de {limit} groupes sur {sortedGroupNames.length}
                        </p>
                        <button 
                          className="toolbar-btn"
                          onClick={() => setLimit(prev => prev + 200)}
                        >
                          Charger plus de tiers
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {view === 'details' && selectedTier && (
          <div className="details-container">
            <div className="dashboard-grid">
              <div className="dashboard-card secondary">
                <div className="card-icon"><Users size={24} /></div>
                <div className="card-content">
                  <h3 className="card-title">Nom du Tiers</h3>
                  <p className="card-value">{selectedTier.nom}</p>
                </div>
              </div>
              <div className="dashboard-card primary">
                <div className="card-icon"><FileText size={24} /></div>
                <div className="card-content">
                  <h3 className="card-title">Code Tiers</h3>
                  <p className="card-value">{selectedTier.code}</p>
                </div>
              </div>
              <div className="dashboard-card warning">
                <div className="card-icon"><Info size={24} /></div>
                <div className="card-content">
                  <h3 className="card-title">SIRET</h3>
                  <p className="card-value">{selectedTier.siret || 'N/A'}</p>
                </div>
              </div>
            </div>

            <div className="table-card">
              <div style={{ display: 'flex', borderBottom: '1px solid var(--color-slate-200)', background: 'var(--color-slate-50)' }}>
                <button 
                  className={`tab-btn ${activeDetailTab === 'info' ? 'active' : ''}`}
                  onClick={() => setActiveDetailTab('info')}
                  style={{ borderRadius: 0, padding: '1rem 1.5rem' }}
                >
                  <Info size={16} style={{ marginRight: '8px' }} /> Informations
                </button>
                <button 
                  className={`tab-btn ${activeDetailTab === 'contacts' ? 'active' : ''}`}
                  onClick={() => setActiveDetailTab('contacts')}
                  style={{ borderRadius: 0, padding: '1rem 1.5rem' }}
                >
                  <Users size={16} style={{ marginRight: '8px' }} /> Contacts ({contacts.length})
                </button>
                <button 
                  className={`tab-btn ${activeDetailTab === 'orders' ? 'active' : ''}`}
                  onClick={() => setActiveDetailTab('orders')}
                  style={{ borderRadius: 0, padding: '1rem 1.5rem' }}
                >
                  <FileText size={16} style={{ marginRight: '8px' }} /> Commandes & Factures ({orders.length})
                </button>
              </div>

              <div style={{ padding: '2rem' }}>
                {activeDetailTab === 'info' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem' }}>
                    <div className="info-section">
                      <h4 style={{ textTransform: 'uppercase', fontSize: '0.75rem', color: 'var(--color-slate-400)', letterSpacing: '0.1em', marginBottom: '1.5rem', fontWeight: 800 }}>Coordonnées</h4>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                          <MapPin size={20} style={{ color: 'var(--color-slate-300)', marginTop: '2px' }} />
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--color-slate-700)', fontSize: '0.9rem' }}>Adresse</div>
                            <div style={{ color: 'var(--color-slate-500)', fontSize: '0.95rem' }}>{selectedTier.adresse || 'N/A'}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                          <Phone size={20} style={{ color: 'var(--color-slate-300)', marginTop: '2px' }} />
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--color-slate-700)', fontSize: '0.9rem' }}>Téléphone</div>
                            <div style={{ color: 'var(--color-slate-500)', fontSize: '0.95rem' }}>{selectedTier.telephone || 'N/A'}</div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                          <Mail size={20} style={{ color: 'var(--color-slate-300)', marginTop: '2px' }} />
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--color-slate-700)', fontSize: '0.9rem' }}>Email</div>
                            <div style={{ color: 'var(--color-slate-500)', fontSize: '0.95rem' }}>{selectedTier.email || 'N/A'}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="info-section">
                      <h4 style={{ textTransform: 'uppercase', fontSize: '0.75rem', color: 'var(--color-slate-400)', letterSpacing: '0.1em', marginBottom: '1.5rem', fontWeight: 800 }}>Détails Activité</h4>
                      <div style={{ background: 'var(--color-slate-50)', padding: '1.5rem', borderRadius: '0.75rem', border: '1px solid var(--color-slate-200)', color: 'var(--color-slate-600)', fontStyle: 'italic', lineHeight: 1.6 }}>
                        {selectedTier.activite || 'Aucune description d\'activité enregistrée.'}
                      </div>
                    </div>
                  </div>
                )}

                {activeDetailTab === 'contacts' && (
                  <div className="contacts-view">
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
                      <button 
                        className="toolbar-btn" 
                        style={{ background: 'var(--color-navy)', color: 'white', border: 'none' }}
                        onClick={() => {
                          setEditingContact(null);
                          setNewContact({ nom: '', prenom: '', role: '', telephone: '', email: '', commentaire: '', is_order_recipient: 0 });
                          setIsContactModalOpen(true);
                        }}
                      >
                        <Plus size={16} /> Nouveau Contact
                      </button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
                      {contacts.map(contact => (
                        <div key={contact.id} className="contact-card" style={{ background: 'white', border: contact.is_order_recipient ? '1px solid var(--color-ivry)' : '1px solid var(--color-slate-200)', borderRadius: '1rem', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', position: 'relative' }}>
                          {contact.is_order_recipient === 1 && (
                            <div style={{ position: 'absolute', top: '-10px', right: '40px', background: 'var(--color-ivry)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px', boxShadow: '0 2px 4px rgba(227, 6, 19, 0.2)' }}>
                              <ShoppingCart size={10} /> DESTINATAIRE COMMANDES
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ width: '3rem', height: '3rem', borderRadius: '50%', background: 'var(--color-blue-50)', color: 'var(--color-navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem', flexShrink: 0 }}>
                              {contact.prenom?.[0] || ''}{contact.nom?.[0] || ''}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--color-navy)', fontSize: '1rem' }}>{contact.prenom} {contact.nom}</div>
                              <div style={{ color: 'var(--color-ivry)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>{contact.role}</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.85rem', color: 'var(--color-slate-600)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Phone size={14} /> {contact.telephone || 'N/A'}</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Mail size={14} /> {contact.email || 'N/A'}</div>
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: '0.25rem' }}>
                            <button onClick={() => { setEditingContact(contact); setNewContact(contact); setIsContactModalOpen(true); }} className="icon-btn"><Edit2 size={16} /></button>
                            <button onClick={() => handleDeleteContact(contact.id)} className="icon-btn" style={{ color: 'var(--color-ivry)' }}><Trash2 size={16} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {contacts.length === 0 && (
                      <div className="empty-state">Aucun contact enregistré.</div>
                    )}
                  </div>
                )}

                {activeDetailTab === 'orders' && (
                  <div className="orders-history">
                    <div style={{ marginBottom: '2.5rem' }}>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-navy)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <ShoppingCart size={20} /> Historique des Commandes
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        {orders.map(order => (
                          <div key={order.id} className="order-history-card" style={{ border: '1px solid var(--color-slate-200)', borderRadius: '1rem', overflow: 'hidden' }}>
                            <div style={{ background: 'var(--color-slate-50)', padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-slate-200)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                  <span style={{ fontWeight: 800, color: 'var(--color-navy)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {order["N° Commande"]}
                                    {order.COMMANDE_ROO_IMA_REF && (
                                      <button 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          window.open(`${urlSedit}/FicheCommande.html?commandeId=${order.COMMANDE_ROO_IMA_REF}`, '_blank');
                                        }}
                                        className="sedit-btn-mini"
                                        title="Ouvrir dans Sedit"
                                        style={{ 
                                          padding: '2px 6px', 
                                          fontSize: '0.65rem', 
                                          background: 'var(--color-ivry)', 
                                          color: 'white', 
                                          border: 'none', 
                                          borderRadius: '4px',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          cursor: 'pointer'
                                        }}
                                      >
                                        <ExternalLink size={10} /> Sedit
                                      </button>
                                    )}
                                  </span>
                                  <span style={{ color: 'var(--color-slate-600)', fontSize: '0.9rem' }}>{order["Libellé"]}</span>
                                  <span style={{ fontSize: '0.8rem', color: 'var(--color-slate-400)' }}>{order["Date de la commande"]}</span>
                                </div>
                                <div style={{ fontWeight: 800, color: 'var(--color-ivry)', fontSize: '1.1rem' }}>{order["Montant TTC"]} €</div>
                            </div>
                            <div style={{ padding: '1.5rem' }}>
                              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--color-slate-400)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                <span>Rapprochement Factures</span>
                                <div style={{ flex: 1, height: '1px', background: 'var(--color-slate-100)' }}></div>
                              </div>
                              {order.matchedInvoices.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                  {order.matchedInvoices.map((inv, idx) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--color-green-50)', border: '1px solid #bbf7d0', borderRadius: '0.5rem', color: 'var(--color-green-600)' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                        <CheckCircle size={16} />
                                        <span style={{ fontWeight: 700 }}>{inv["N° Facture interne"] || inv["N° Facture fournisseur"]}</span>
                                        <span className="badge success">{inv["Etat"]}</span>
                                      </div>
                                      <div style={{ fontWeight: 800 }}>{inv["Montant TTC"]} €</div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-slate-400)', fontStyle: 'italic', fontSize: '0.85rem' }}>
                                  Aucun rapprochement automatique trouvé.
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        {orders.length === 0 && <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-slate-400)', fontStyle: 'italic' }}>Aucune commande enregistrée.</div>}
                      </div>
                    </div>

                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-navy)', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <FileText size={20} /> Liste des Factures
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {groupedInvoices.map((group, idx) => (
                          <div key={idx} className="invoice-group-card" style={{ background: 'white', border: '1px solid var(--color-slate-200)', borderRadius: '1rem', overflow: 'hidden' }}>
                            <div style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--color-slate-50)', borderBottom: '1px solid var(--color-slate-200)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--color-slate-400)', textTransform: 'uppercase' }}>N° Facture</span>
                                  <span style={{ fontWeight: 800, color: 'var(--color-navy)', fontSize: '1.1rem' }}>{group.number}</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--color-slate-400)', textTransform: 'uppercase' }}>Lignes</span>
                                  <span style={{ fontWeight: 700, color: 'var(--color-slate-600)' }}>{group.lines.length} ligne(s)</span>
                                </div>
                                {group.hasFile && (
                                  <div className="badge success" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <FileText size={12} /> PDF Disponible
                                  </div>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                                <div style={{ textAlign: 'right' }}>
                                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--color-slate-400)', textTransform: 'uppercase', display: 'block' }}>Total TTC</span>
                                  <span style={{ fontWeight: 800, color: 'var(--color-ivry)', fontSize: '1.2rem' }}>{group.total_ttc.toFixed(2)} €</span>
                                </div>
                                {group.hasFile && (
                                  <button 
                                    className="toolbar-btn"
                                    onClick={() => setPreviewFile({ url: `/${group.filePath}`, name: group.number })}
                                    style={{ background: 'var(--color-navy)', color: 'white', border: 'none' }}
                                  >
                                    <Eye size={16} /> Preview
                                  </button>
                                )}
                              </div>
                            </div>
                            <div style={{ padding: '1.25rem 1.5rem', overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                                <thead>
                                  <tr style={{ textAlign: 'left', borderBottom: '2px solid var(--color-slate-100)' }}>
                                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--color-slate-400)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 800 }}>Libellé</th>
                                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--color-slate-400)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 800 }}>Date</th>
                                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--color-slate-400)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 800 }}>HT</th>
                                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--color-slate-400)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 800 }}>TTC</th>
                                    <th style={{ padding: '0.75rem 0.5rem', color: 'var(--color-slate-400)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 800 }}>État</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.lines.map((line, lidx) => (
                                    <tr key={lidx} style={{ borderBottom: lidx === group.lines.length - 1 ? 'none' : '1px solid var(--color-slate-50)' }}>
                                      <td style={{ padding: '1rem 0.5rem', color: 'var(--color-navy)', fontWeight: 600 }}>{line["Libellé"]}</td>
                                      <td style={{ padding: '1rem 0.5rem', color: 'var(--color-slate-500)', fontSize: '0.85rem' }}>{line["Emission"]}</td>
                                      <td style={{ padding: '1rem 0.5rem', color: 'var(--color-slate-600)', fontWeight: 600 }}>{line["Montant HT"]} €</td>
                                      <td style={{ padding: '1rem 0.5rem', color: 'var(--color-ivry)', fontWeight: 800 }}>{line["Montant TTC"]} €</td>
                                      <td style={{ padding: '1rem 0.5rem' }}>
                                        <span className={`badge ${line["Etat"] === 'Vise' || line["Etat"] === 'Payer' ? 'success' : 'warning'}`}>
                                          {line["Etat"]}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                        {groupedInvoices.length === 0 && <div className="empty-state" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-slate-400)', fontStyle: 'italic' }}>Aucune facture enregistrée.</div>}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {previewFile && (
          <div className="modal-backdrop" onClick={() => setPreviewFile(null)}>
            <div className="modal-window" style={{ maxWidth: '90%', width: '1200px', height: '90vh' }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Prévisualisation Facture : {previewFile.name}</h2>
                <button className="icon-btn" onClick={() => setPreviewFile(null)}><X size={20} /></button>
              </div>
              <div className="modal-body" style={{ flex: 1, padding: 0, overflow: 'hidden' }}>
                <iframe 
                  src={previewFile.url} 
                  style={{ width: '100%', height: '100%', border: 'none' }} 
                  title="PDF Preview"
                />
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
                <p className="modal-desc" style={{ color: 'var(--color-slate-500)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                  Modifiez la visibilité, la couleur, et le style (Gras/Italique) des colonnes.
                </p>
                <div className="column-toggles">
                  {columnSettings.map((col, index) => (
                    <div key={col.id} className="toggle-item" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {currentUser?.role === 'admin' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <button 
                              className="icon-btn" 
                              style={{ padding: '2px' }} 
                              disabled={index === 0}
                              onClick={() => moveColumn(index, 'up')}
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button 
                              className="icon-btn" 
                              style={{ padding: '2px' }} 
                              disabled={index === columnSettings.length - 1}
                              onClick={() => moveColumn(index, 'down')}
                            >
                              <ArrowDown size={14} />
                            </button>
                          </div>
                        )}
                        <span className="toggle-label">{col.label}</span>
                      </div>
                      
                      <div className="toggle-controls" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {currentUser?.role === 'admin' && (
                          <>
                            <input 
                              type="color" 
                              value={col.color || '#334155'} 
                              onChange={(e) => updateColumnStyle(col.column_key, 'color', e.target.value)}
                              title="Couleur"
                              style={{ width: '28px', height: '28px', padding: '0', border: '1px solid var(--color-slate-200)', borderRadius: '4px', cursor: 'pointer' }}
                            />
                            <button 
                              onClick={() => updateColumnStyle(col.column_key, 'is_bold', !col.is_bold)}
                              title="Gras"
                              style={{ 
                                background: col.is_bold ? 'var(--color-navy)' : 'transparent', 
                                color: col.is_bold ? 'white' : 'inherit'
                              }}
                              className="icon-btn"
                            >
                              <span style={{ fontWeight: 800 }}>B</span>
                            </button>
                            <button 
                              onClick={() => updateColumnStyle(col.column_key, 'is_italic', !col.is_italic)}
                              title="Italique"
                              style={{ 
                                background: col.is_italic ? 'var(--color-navy)' : 'transparent', 
                                color: col.is_italic ? 'white' : 'inherit'
                              }}
                              className="icon-btn"
                            >
                              <span style={{ fontStyle: 'italic', fontWeight: 800 }}>I</span>
                            </button>
                          </>
                        )}
                        <button 
                          className={`toggle-btn ${col.is_visible ? 'on' : 'off'}`}
                          onClick={() => toggleColumnVisibility(col.column_key, col.is_visible)}
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

        {isContactModalOpen && (
          <div className="modal-backdrop" onClick={() => setIsContactModalOpen(false)}>
            <div className="modal-window modal-sm" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">{editingContact ? 'Modifier' : 'Nouveau'} Contact</h2>
                <button className="icon-btn" onClick={() => setIsContactModalOpen(false)}><X size={20} /></button>
              </div>
              <div className="modal-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="form-group">
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--color-slate-400)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Prénom</label>
                      <input type="text" className="search-input" style={{ width: '100%', minWidth: 'auto', paddingLeft: '1rem' }} value={newContact.prenom} onChange={(e) => setNewContact({...newContact, prenom: e.target.value})} />
                    </div>
                    <div className="form-group">
                      <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--color-slate-400)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Nom</label>
                      <input type="text" className="search-input" style={{ width: '100%', minWidth: 'auto', paddingLeft: '1rem' }} value={newContact.nom} onChange={(e) => setNewContact({...newContact, nom: e.target.value})} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--color-slate-400)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Poste / Rôle</label>
                    <input type="text" className="search-input" style={{ width: '100%', minWidth: 'auto', paddingLeft: '1rem' }} value={newContact.role} onChange={(e) => setNewContact({...newContact, role: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--color-slate-400)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Téléphone</label>
                    <input type="text" className="search-input" style={{ width: '100%', minWidth: 'auto', paddingLeft: '1rem' }} value={newContact.telephone} onChange={(e) => setNewContact({...newContact, telephone: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--color-slate-400)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Email</label>
                    <input type="email" className="search-input" style={{ width: '100%', minWidth: 'auto', paddingLeft: '1rem' }} value={newContact.email} onChange={(e) => setNewContact({...newContact, email: e.target.value})} />
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--color-slate-50)', padding: '10px', borderRadius: '8px', border: '1px solid var(--color-slate-200)' }}>
                   <input 
                     type="checkbox" 
                     id="is_order_recipient"
                     checked={newContact.is_order_recipient === 1} 
                     onChange={e => setNewContact({...newContact, is_order_recipient: e.target.checked ? 1 : 0})}
                     style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                   />
                   <label htmlFor="is_order_recipient" style={{ marginBottom: 0, cursor: 'pointer', fontWeight: 700, color: 'var(--color-navy)', fontSize: '0.85rem' }}>
                     Destinataire des commandes (envoi auto mail avec PJ)
                   </label>
                  </div>
                  <div className="form-group">                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 800, color: 'var(--color-slate-400)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Note</label>
                    <textarea 
                      className="search-input" 
                      style={{ width: '100%', minWidth: 'auto', paddingLeft: '1rem', height: '80px', paddingTop: '0.5rem' }} 
                      value={newContact.commentaire} 
                      onChange={(e) => setNewContact({...newContact, commentaire: e.target.value})} 
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
                    <button className="tab-btn" onClick={() => setIsContactModalOpen(false)}>Annuler</button>
                    <button className="toolbar-btn" style={{ background: 'var(--color-navy)', color: 'white' }} onClick={handleSaveContact}>Enregistrer</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        .tiers-page {
          min-height: 100vh;
          background-color: #f8fafc;
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
        }
        .main-content {
          max-width: 1400px;
          margin: 0 auto;
          padding: 2rem;
        }

        :root {
          --color-ivry: #e30613;
          --color-navy: #003366;
          --color-slate-50: #f8fafc;
          --color-slate-100: #f1f5f9;
          --color-slate-200: #e2e8f0;
          --color-slate-300: #cbd5e1;
          --color-slate-400: #94a3b8;
          --color-slate-500: #64748b;
          --color-slate-600: #475569;
          --color-slate-700: #334155;
          --color-slate-800: #1e293b;
          --color-green-500: #22c55e;
          --color-green-50: #f0fdf4;
          --color-blue-500: #3b82f6;
          --color-blue-50: #eff6ff;
        }

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
          cursor: pointer;
        }
        .tab-btn:hover:not(:disabled) { background: var(--color-slate-50); color: var(--color-navy); }
        .tab-btn.active {
          background: var(--color-navy);
          color: white;
          box-shadow: 0 1px 2px rgba(0,0,0,0.1);
        }
        .tab-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

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
          cursor: pointer;
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
        }
        .modern-table tbody tr:hover { background-color: var(--color-slate-50); }

        .th-wrapper { display: flex; flex-direction: column; gap: 0.5rem; }
        .th-content {
          display: flex;
          align-items: center;
          cursor: pointer;
          user-select: none;
        }
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
        }

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
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
          border-top: 4px solid transparent;
        }
        .dashboard-card.primary { border-top-color: var(--color-ivry); }
        .dashboard-card.secondary { border-top-color: var(--color-navy); }
        .dashboard-card.warning { border-top-color: #f59e0b; }
        .card-icon {
          width: 3rem;
          height: 3rem;
          border-radius: 0.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--color-slate-100);
        }
        .primary .card-icon { background: #fee2e2; color: var(--color-ivry); }
        .secondary .card-icon { background: var(--color-blue-50); color: var(--color-navy); }
        .warning .card-icon { background: #fef3c7; color: #d97706; }
        .card-title {
          font-size: 0.75rem;
          color: var(--color-slate-500);
          margin: 0 0 0.25rem 0;
          font-weight: 700;
          text-transform: uppercase;
        }
        .card-value {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--color-slate-800);
          margin: 0;
        }

        .badge {
          padding: 0.25rem 0.5rem;
          border-radius: 9999px;
          font-size: 0.7rem;
          font-weight: 700;
          display: inline-block;
          text-transform: uppercase;
        }
        .badge.success { background: var(--color-green-50); color: var(--color-green-600); border: 1px solid #bbf7d0; }

        .badge-count {
          padding: 0.25rem 0.75rem;
          border-radius: 6px;
          font-size: 0.85rem;
          font-weight: 800;
          display: inline-block;
          min-width: 2.5rem;
          text-align: center;
        }
        .order-badge {
          background: var(--color-blue-50);
          color: var(--color-navy);
          border: 1px solid #bfdbfe;
        }
        .invoice-badge {
          background: #fff5f5;
          color: var(--color-ivry);
          border: 1px solid #fecaca;
        }

        .empty-state {
          text-align: center;
          padding: 4rem !important;
          color: var(--color-slate-400);
          font-style: italic;
        }

        .modal-backdrop {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(15, 23, 42, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 50;
        }
        .modal-window {
          background: white;
          border-radius: 1rem;
          width: 100%;
          max-width: 600px;
          display: flex;
          flex-direction: column;
        }
        .modal-window.modal-sm { max-width: 450px; }
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
        }
        .icon-btn:hover { background: var(--color-slate-100); color: var(--color-slate-600); }
        .modal-body { padding: 1.5rem; }

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
          background: var(--color-slate-50);
          color: var(--color-navy);
        }
        .dashboard-card.primary .card-icon { background: #fff5f5; color: var(--color-ivry); }
        .dashboard-card.secondary .card-icon { background: #f0f7ff; color: var(--color-navy); }
        .dashboard-card.warning .card-icon { background: #fffbeb; color: #f59e0b; }

        .card-content { flex: 1; }
        .card-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--color-slate-500);
          margin: 0 0 0.25rem 0;
        }
        .card-value {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--color-navy);
          margin: 0;
        }

        .column-toggles { 
          display: flex; 
          flex-direction: column; 
          gap: 0.75rem; 
          max-height: 400px; 
          overflow-y: auto; 
          padding-right: 0.5rem;
        }
        .column-toggles::-webkit-scrollbar { width: 6px; }
        .column-toggles::-webkit-scrollbar-track { background: var(--color-slate-50); }
        .column-toggles::-webkit-scrollbar-thumb { background: var(--color-slate-200); border-radius: 3px; }
        .column-toggles::-webkit-scrollbar-thumb:hover { background: var(--color-slate-300); }
        .toggle-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          background: var(--color-slate-50);
          border: 1px solid var(--color-slate-200);
          border-radius: 0.5rem;
        }
        .toggle-label { font-weight: 600; color: var(--color-slate-700); font-size: 0.875rem; }
        .toggle-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.375rem 0.75rem;
          border-radius: 0.375rem;
          font-size: 0.75rem;
          font-weight: 700;
          cursor: pointer;
        }
        .toggle-btn.on { background: var(--color-navy); color: white; border: 1px solid var(--color-navy); }
        .toggle-btn.off { background: white; color: var(--color-slate-500); border: 1px solid var(--color-slate-300); }

        .loading-spinner-container {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-bottom: 1rem;
        }
        .loading-spinner-modern {
          width: 50px;
          height: 50px;
          border: 3px solid var(--color-slate-200);
          border-radius: 50%;
          border-top-color: var(--color-navy);
          animation: spin 1s ease-in-out infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default Tiers;
