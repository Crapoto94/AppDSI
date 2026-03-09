import React, { useState, useEffect } from 'react';
import { 
  Phone, 
  Plus, 
  Edit2,
  Trash2, 
  Search, 
  Building2, 
  Hash, 
  Type, 
  FileSpreadsheet, 
  ChevronDown, 
  ChevronUp, 
  ArrowLeft,
  CreditCard,
  User,
  ShoppingBag,
  List,
  Upload,
  Save,
  X,
  FileText,
  AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';

interface Tier {
  id: number;
  nom: string;
  code: string;
}

interface Operator {
  id: number;
  tier_id: number;
  name: string;
}

interface BillingAccount {
  id: number;
  operator_id: number;
  account_number: string;
  type: string;
  designation: string;
  customer_number: string;
  market_number: string;
  function_code: string;
  commitment_number: string;
  commitment_amount?: number;
  commitment_label?: string;
  invoice_count?: number;
  total_invoiced?: number;
  account_balance?: number;
}

interface Commitment {
  id: number;
  commitment_number: string;
  label: string;
  amount: number;
  invoiced_amount: number;
  year: number;
  operator_name: string;
  function_code: string;
}

interface TelecomInvoice {
  id: number;
  invoice_number: string;
  operator_id: number;
  billing_account_id: number;
  amount_ttc: number;
  invoice_date: string;
  file_path: string;
  uploaded_at: string;
  operator_name?: string;
  account_number?: string;
  general_status?: string;
}

const TelecomManagement: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'invoices' | 'lines' | 'pdfs'>('invoices');
  const [operators, setOperators] = useState<Operator[]>([]);
  const [billingAccounts, setBillingAccounts] = useState<Record<number, BillingAccount[]>>({});
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [telecomInvoices, setTelecomInvoices] = useState<TelecomInvoice[]>([]);
  const [allTiers, setAllTiers] = useState<Tier[]>([]);
  const [showAddOperator, setShowAddOperator] = useState(false);
  const [tierSearch, setTierSearch] = useState('');
  const [expandedOperators, setExpandedOperators] = useState<number[]>([]);
  const [showAddAccount, setShowAddAccount] = useState<number | null>(null);
  const [editingAccount, setEditingAccount] = useState<BillingAccount | null>(null);
  
  // Invoices Filtering & Grouping State
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceAccountFilter, setInvoiceAccountFilter] = useState<number | null>(null);
  const [invoiceOperatorFilter, setInvoiceOperatorFilter] = useState<number | null>(null);
  
  // Validation Modal State
  const [pendingInvoice, setPendingInvoice] = useState<any>(null);
  const [showValidation, setShowValidation] = useState(false);

  const [newAccount, setNewAccount] = useState<Partial<BillingAccount>>({
    type: 'Fixe',
    account_number: '',
    designation: '',
    customer_number: '',
    market_number: '',
    function_code: '',
    commitment_number: ''
  });

  const token = localStorage.getItem('token');

  useEffect(() => {
    fetchData();
  }, [token]);

  const fetchData = async () => {
    try {
      const opRes = await fetch('/api/telecom/operators', { headers: { 'Authorization': `Bearer ${token}` } });
      if (opRes.ok) {
        const ops = await opRes.json();
        setOperators(ops);
        ops.forEach((op: Operator) => fetchAccounts(op.id));
      }

      const tiersRes = await fetch('/api/tiers?all=true', { headers: { 'Authorization': `Bearer ${token}` } });
      if (tiersRes.ok) {
        const data = await tiersRes.json();
        setAllTiers(data.tiers || []);
      }

      const commRes = await fetch('/api/telecom/commitments', { headers: { 'Authorization': `Bearer ${token}` } });
      if (commRes.ok) setCommitments(await commRes.json());

      const invRes = await fetch('/api/telecom/invoices', { headers: { 'Authorization': `Bearer ${token}` } });
      if (invRes.ok) setTelecomInvoices(await invRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAccounts = async (operatorId: number) => {
    try {
      const res = await fetch(`/api/telecom/operators/${operatorId}/accounts`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (res.ok) {
        const accounts = await res.json();
        setBillingAccounts(prev => ({ ...prev, [operatorId]: accounts }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddOperator = async (tier: Tier) => {
    try {
      const res = await fetch('/api/telecom/operators', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tier_id: tier.id, name: tier.nom })
      });
      if (res.ok) {
        setShowAddOperator(false);
        setTierSearch('');
        fetchData();
      } else {
        const err = await res.json();
        alert(err.message || "Erreur lors de l'ajout");
      }
    } catch (e) {
      alert("Erreur de connexion");
    }
  };

  const handleDeleteOperator = async (id: number) => {
    if (!window.confirm("Supprimer cet opérateur et tous ses comptes ?")) return;
    try {
      const res = await fetch(`/api/telecom/operators/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchData();
    } catch (e) {
      alert("Erreur");
    }
  };

  const handleSaveAccount = async (operatorId: number) => {
    const isEditing = !!editingAccount;
    const url = isEditing ? `/api/telecom/billing-accounts/${editingAccount.id}` : '/api/telecom/billing-accounts';
    const method = isEditing ? 'PUT' : 'POST';
    const body = isEditing ? editingAccount : { ...newAccount, operator_id: operatorId };

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        setShowAddAccount(null);
        setEditingAccount(null);
        setNewAccount({ type: 'Fixe', account_number: '', designation: '', customer_number: '', market_number: '', function_code: '', commitment_number: '' });
        fetchAccounts(operatorId);
      }
    } catch (e) {
      alert("Erreur");
    }
  };

  const handleDeleteAccount = async (id: number, operatorId: number) => {
    if (!window.confirm("Supprimer ce compte de facturation ?")) return;
    try {
      const res = await fetch(`/api/telecom/billing-accounts/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchAccounts(operatorId);
    } catch (e) {
      alert("Erreur");
    }
  };

  const startEditAccount = (acc: BillingAccount) => {
    setEditingAccount(acc);
    setShowAddAccount(acc.operator_id);
  };

  const handleImportCommitments = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/telecom/import-commitments', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.message);
        fetchData();
      } else {
        alert("Erreur lors de l'import");
      }
    } catch (e) {
      alert("Erreur de connexion");
    }
  };

  const handleUploadInvoice = async (e: React.ChangeEvent<HTMLInputElement> | null, overwrite = false, existingFile?: File) => {
    const file = e ? e.target.files?.[0] : existingFile;
    if (!file) return;

    const formData = new FormData();
    formData.append('target_type', 'telecom_invoice');
    formData.append('file', file);
    if (overwrite) formData.append('overwrite', 'true');

    try {
      const res = await fetch('/api/telecom/invoices/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (res.status === 409) {
        const data = await res.json();
        if (window.confirm(data.message)) {
          handleUploadInvoice(null, true, file);
        }
        return;
      }

      if (res.ok) {
        const data = await res.json();
        // data now contains { id, file_path, ... } directly from the backend
        if (!data.operator_id || !data.billing_account_id || data.invoice_number === 'Inconnu' || !data.invoice_date || data.amount_ttc === 0) {
          setPendingInvoice(data);
          setShowValidation(true);
        } else {
          alert(`Facture ${data.invoice_number} uploadée et analysée avec succès.`);
          fetchData();
        }
      } else {
        alert("Erreur lors de l'upload");
      }
    } catch (e) {
      alert("Erreur de connexion");
    }
  };

  const handleSaveValidation = async () => {
    if (!pendingInvoice) return;
    try {
      const res = await fetch(`/api/telecom/invoices/${pendingInvoice.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(pendingInvoice)
      });
      if (res.ok) {
        setShowValidation(false);
        setPendingInvoice(null);
        fetchData();
      } else {
        alert("Erreur lors de la mise à jour");
      }
    } catch (e) {
      alert("Erreur de connexion");
    }
  };

  const handleDeleteTelecomInvoice = async (id: number) => {
    if (!window.confirm("Supprimer cette facture ?")) return;
    try {
      const res = await fetch(`/api/telecom/invoices/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) fetchData();
    } catch (e) {
      alert("Erreur");
    }
  };

  const toggleOperator = (id: number) => {
    setExpandedOperators(prev => 
      prev.includes(id) ? prev.filter(oid => oid !== id) : [...prev, id]
    );
  };

  const handleViewInvoices = (accountId: number, operatorId: number) => {
    setInvoiceAccountFilter(accountId);
    setInvoiceOperatorFilter(operatorId);
    setActiveTab('pdfs');
  };

  const filteredTiers = allTiers.filter(t => 
    t.nom.toLowerCase().includes(tierSearch.toLowerCase()) && 
    !operators.some(op => op.tier_id === t.id)
  ).slice(0, 5);

  const filteredInvoices = telecomInvoices.filter(inv => {
    const matchesSearch = !invoiceSearch || 
      inv.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase()) || 
      (inv.account_number || '').toLowerCase().includes(invoiceSearch.toLowerCase());
    const matchesOperator = !invoiceOperatorFilter || inv.operator_id === invoiceOperatorFilter;
    const matchesAccount = !invoiceAccountFilter || inv.billing_account_id === invoiceAccountFilter;
    return matchesSearch && matchesOperator && matchesAccount;
  }).sort((a, b) => new Date(b.invoice_date).getTime() - new Date(a.invoice_date).getTime());

  // Group by month
  const groupedInvoices: Record<string, TelecomInvoice[]> = {};
  filteredInvoices.forEach(inv => {
    const date = inv.invoice_date ? new Date(inv.invoice_date) : null;
    const monthKey = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : 'Inconnue';
    if (!groupedInvoices[monthKey]) groupedInvoices[monthKey] = [];
    groupedInvoices[monthKey].push(inv);
  });

  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
  const formatMonthKey = (key: string) => {
    if (key === 'Inconnue') return 'Date inconnue';
    const [year, month] = key.split('-');
    return `${monthNames[parseInt(month) - 1]} ${year}`;
  };

  return (
    <div className="telecom-container">
      <Header />
      <main className="telecom-main">
        <div className="telecom-page-header">
          <button className="back-button" onClick={() => navigate('/')}>
            <ArrowLeft size={20} />
          </button>
          <div className="title-group">
            <h1>Gestion Télécom</h1>
            <p>Factures, comptes et engagements</p>
          </div>
          <div className="tab-switcher">
            <button className={activeTab === 'invoices' ? 'active' : ''} onClick={() => setActiveTab('invoices')}>
              <Building2 size={18} /> Comptes
            </button>
            <button className={activeTab === 'pdfs' ? 'active' : ''} onClick={() => setActiveTab('pdfs')}>
              <CreditCard size={18} /> Factures PDF
            </button>
            <button className={activeTab === 'lines' ? 'active' : ''} onClick={() => setActiveTab('lines')}>
              <List size={18} /> Engagements
            </button>
          </div>
        </div>

        {activeTab === 'invoices' && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Opérateurs et Comptes de facturation</h2>
              <button className="add-btn" onClick={() => setShowAddOperator(true)}>
                <Plus size={18} /> Ajouter un opérateur
              </button>
            </div>

            {showAddOperator && (
              <div className="operator-search-card">
                <div className="search-input-wrapper">
                  <Search size={18} className="search-icon" />
                  <input 
                    type="text" 
                    placeholder="Rechercher un tiers par nom..." 
                    value={tierSearch}
                    onChange={e => setTierSearch(e.target.value)}
                    autoFocus
                  />
                  <button className="close-search" onClick={() => setShowAddOperator(false)}>Annuler</button>
                </div>
                {tierSearch && (
                  <div className="tier-results">
                    {filteredTiers.map(t => (
                      <div key={t.id} className="tier-result-item" onClick={() => handleAddOperator(t)}>
                        <span className="tier-name">{t.nom}</span>
                        <span className="tier-code">{t.code}</span>
                      </div>
                    ))}
                    {filteredTiers.length === 0 && <div className="no-result">Aucun tiers trouvé</div>}
                  </div>
                )}
              </div>
            )}

            <div className="operators-list">
              {operators.map(op => (
                <div key={op.id} className={`operator-card ${expandedOperators.includes(op.id) ? 'expanded' : ''}`}>
                  <div className="operator-card-header" onClick={() => toggleOperator(op.id)}>
                    <div className="op-info">
                      <div className="op-icon"><Building2 size={24} /></div>
                      <div>
                        <h3>{op.name}</h3>
                        <span className="account-count">{billingAccounts[op.id]?.length || 0} compte(s)</span>
                      </div>
                    </div>
                    <div className="op-actions">
                      <button className="delete-op-btn" onClick={(e) => { e.stopPropagation(); handleDeleteOperator(op.id); }}>
                        <Trash2 size={18} />
                      </button>
                      {expandedOperators.includes(op.id) ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>

                  {expandedOperators.includes(op.id) && (
                    <div className="operator-card-body">
                      <div className="accounts-header">
                        <h4>Comptes de facturation</h4>
                        <button className="add-account-btn" onClick={() => { setEditingAccount(null); setShowAddAccount(op.id); }}>
                          <Plus size={14} /> Nouveau compte
                        </button>
                      </div>

                      {showAddAccount === op.id && (
                        <div className="add-account-form">
                          <div className="form-header-small">
                            {editingAccount ? "Modifier le compte" : "Ajouter un nouveau compte"}
                          </div>
                          <div className="form-grid">
                            <div className="form-group">
                              <label>N° de compte</label>
                              <input type="text" value={editingAccount ? editingAccount.account_number : newAccount.account_number} onChange={e => editingAccount ? setEditingAccount({...editingAccount, account_number: e.target.value}) : setNewAccount({...newAccount, account_number: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>Type</label>
                              <select value={editingAccount ? editingAccount.type : newAccount.type} onChange={e => editingAccount ? setEditingAccount({...editingAccount, type: e.target.value}) : setNewAccount({...newAccount, type: e.target.value})}>
                                <option value="Fixe">Téléphonie fixe</option>
                                <option value="Mobile">Téléphonie mobile</option>
                                <option value="Interco">Liens interco</option>
                                <option value="Internet">Accès internet</option>
                              </select>
                            </div>
                            <div className="form-group">
                              <label>Désignation</label>
                              <input type="text" value={editingAccount ? editingAccount.designation : newAccount.designation} onChange={e => editingAccount ? setEditingAccount({...editingAccount, designation: e.target.value}) : setNewAccount({...newAccount, designation: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>N° Client</label>
                              <input type="text" value={editingAccount ? editingAccount.customer_number : newAccount.customer_number} onChange={e => editingAccount ? setEditingAccount({...editingAccount, customer_number: e.target.value}) : setNewAccount({...newAccount, customer_number: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>N° Marché</label>
                              <input type="text" value={editingAccount ? editingAccount.market_number : newAccount.market_number} onChange={e => editingAccount ? setEditingAccount({...editingAccount, market_number: e.target.value}) : setNewAccount({...newAccount, market_number: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>Code Fonction</label>
                              <input type="text" value={editingAccount ? editingAccount.function_code : newAccount.function_code} onChange={e => editingAccount ? setEditingAccount({...editingAccount, function_code: e.target.value}) : setNewAccount({...newAccount, function_code: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>N° Engagement</label>
                              <input type="text" value={editingAccount ? editingAccount.commitment_number : newAccount.commitment_number} onChange={e => editingAccount ? setEditingAccount({...editingAccount, commitment_number: e.target.value}) : setNewAccount({...newAccount, commitment_number: e.target.value})} />
                            </div>
                          </div>
                          <div className="form-actions">
                            <button className="cancel-btn" onClick={() => { setShowAddAccount(null); setEditingAccount(null); }}>Annuler</button>
                            <button className="save-btn" onClick={() => handleSaveAccount(op.id)}><Save size={16} /> {editingAccount ? "Mettre à jour" : "Enregistrer"}</button>
                          </div>
                        </div>
                      )}

                      <div className="accounts-table-wrapper">
                        {(() => {
                          const accountsByCommitment: Record<string, BillingAccount[]> = {};
                          (billingAccounts[op.id] || []).forEach(acc => {
                            const key = acc.commitment_number || 'Sans engagement';
                            if (!accountsByCommitment[key]) accountsByCommitment[key] = [];
                            accountsByCommitment[key].push(acc);
                          });

                          return Object.entries(accountsByCommitment).map(([commNum, accounts]) => {
                            const totalInvoicedForComm = accounts.reduce((sum, a) => sum + (a.total_invoiced || 0), 0);
                            const commAmount = accounts[0]?.commitment_amount || 0;
                            const commBalance = commAmount - totalInvoicedForComm;
                            const hasMultiple = accounts.length > 1;

                            return (
                              <div key={commNum} className="commitment-group">
                                <div className="commitment-group-header">
                                  <div className="comm-info-tag">
                                    <span className="comm-label">Engagement : </span>
                                    <span className="comm-value">{commNum}</span>
                                    {commNum !== 'Sans engagement' && (
                                      <>
                                        <span className="comm-amount-tag">
                                          ({commAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })})
                                        </span>
                                        <span className={`comm-balance-tag ${commBalance < 0 ? 'negative' : 'positive'}`}>
                                          Solde : {commBalance.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <table className="accounts-table">
                                  <thead>
                                    <tr>
                                      <th style={{ width: '100px' }}>Type</th>
                                      <th style={{ width: '150px' }}>N° Compte</th>
                                      <th>Désignation</th>
                                      <th style={{ width: '80px', textAlign: 'center' }}>Factures</th>
                                      <th style={{ width: '120px', textAlign: 'right' }}>Facturé</th>
                                      <th style={{ width: '100px', textAlign: 'center' }}>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {accounts.map(acc => (
                                      <tr key={acc.id}>
                                        <td><span className={`type-badge ${acc.type.toLowerCase()}`}>{acc.type}</span></td>
                                        <td style={{ fontWeight: 600 }}>{acc.account_number}</td>
                                        <td>{acc.designation}</td>
                                        <td style={{ textAlign: 'center' }}>
                                          <button 
                                            className="invoice-count-btn" 
                                            onClick={() => handleViewInvoices(acc.id, op.id)}
                                            title="Voir les factures de ce compte"
                                          >
                                            <FileText size={14} />
                                            <span>{acc.invoice_count || 0}</span>
                                          </button>
                                        </td>
                                        <td className="amount-col">
                                          {(acc.total_invoiced || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                                        </td>
                                        <td>
                                          <div className="action-btns" style={{ justifyContent: 'center' }}>
                                            <button className="edit-icon-btn" onClick={() => startEditAccount(acc)}>
                                              <Edit2 size={16} />
                                            </button>
                                            <button className="delete-icon-btn" onClick={() => handleDeleteAccount(acc.id, op.id)}>
                                              <Trash2 size={16} />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            );
                          });
                        })()}
                        {(!billingAccounts[op.id] || billingAccounts[op.id].length === 0) && (
                          <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Aucun compte configuré</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {operators.length === 0 && (
                <div className="empty-state">
                  <Building2 size={48} />
                  <p>Aucun opérateur configuré. Commencez par en ajouter un.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'pdfs' && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Historique des factures PDF</h2>
              <div className="action-group">
                <input 
                  type="file" 
                  id="upload-telecom-invoice" 
                  style={{ display: 'none' }} 
                  accept=".pdf"
                  onChange={handleUploadInvoice}
                />
                <button className="add-btn" onClick={() => document.getElementById('upload-telecom-invoice')?.click()}>
                  <Plus size={18} /> Ajouter une facture (PDF)
                </button>
              </div>
            </div>

            <div className="invoice-filters admin-card">
              <div className="filters-grid">
                <div className="filter-group">
                  <label>Rechercher</label>
                  <div className="search-input-wrapper-mini">
                    <Search size={14} />
                    <input 
                      type="text" 
                      placeholder="N° facture, compte..." 
                      value={invoiceSearch}
                      onChange={e => setInvoiceSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="filter-group">
                  <label>Opérateur</label>
                  <select 
                    value={invoiceOperatorFilter || ''} 
                    onChange={e => {
                      const val = e.target.value ? parseInt(e.target.value) : null;
                      setInvoiceOperatorFilter(val);
                      setInvoiceAccountFilter(null);
                    }}
                  >
                    <option value="">Tous les opérateurs</option>
                    {operators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                  </select>
                </div>
                <div className="filter-group">
                  <label>Compte</label>
                  <select 
                    value={invoiceAccountFilter || ''} 
                    onChange={e => setInvoiceAccountFilter(e.target.value ? parseInt(e.target.value) : null)}
                    disabled={!invoiceOperatorFilter}
                  >
                    <option value="">Tous les comptes</option>
                    {invoiceOperatorFilter && billingAccounts[invoiceOperatorFilter]?.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.account_number} ({acc.designation})</option>
                    ))}
                  </select>
                </div>
                <div className="filter-group-actions">
                  <button className="clear-filters" onClick={() => {
                    setInvoiceSearch('');
                    setInvoiceOperatorFilter(null);
                    setInvoiceAccountFilter(null);
                  }}>Réinitialiser</button>
                </div>
              </div>
            </div>

            <div className="invoices-list admin-card">
              <table className="commitments-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>N° Facture</th>
                    <th>Opérateur</th>
                    <th>N° Compte</th>
                    <th>Montant TTC</th>
                    <th>État</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(groupedInvoices).sort((a, b) => b[0].localeCompare(a[0])).map(([monthKey, invoices]) => (
                    <React.Fragment key={monthKey}>
                      <tr className="month-break-row">
                        <td colSpan={7}>{formatMonthKey(monthKey)}</td>
                      </tr>
                      {invoices.map(inv => (
                        <tr key={inv.id}>
                          <td>{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('fr-FR') : 'Inconnue'}</td>
                          <td style={{ fontWeight: 700 }}>{inv.invoice_number}</td>
                          <td>{inv.operator_name || <span style={{ color: '#ef4444' }}>Inconnu</span>}</td>
                          <td>{inv.account_number || <span style={{ color: '#ef4444' }}>Inconnu</span>}</td>
                          <td style={{ fontWeight: 700 }}>{inv.amount_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                          <td>
                            {inv.general_status ? (
                              <span className="status-tag imported" title={`Statut : ${inv.general_status}`}>
                                Importée ({inv.general_status})
                              </span>
                            ) : (
                              <span className="status-tag pending">Non importée</span>
                            )}
                          </td>
                          <td>
                            <div className="action-btns">
                              <a href={`/api/${inv.file_path}`} target="_blank" rel="noopener noreferrer" className="edit-icon-btn" title="Voir le PDF">
                                <FileText size={18} />
                              </a>
                              <button className="delete-icon-btn" onClick={() => handleDeleteTelecomInvoice(inv.id)}>
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                  {filteredInvoices.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Aucune facture trouvée</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'lines' && (
          <div className="tab-content">
            <div className="section-header">
              <h2>Référentiel des engagements Télécom</h2>
              <div className="action-group">
                <input 
                  type="file" 
                  id="import-commitments" 
                  style={{ display: 'none' }} 
                  accept=".xlsx,.xls"
                  onChange={handleImportCommitments}
                />
                <button className="import-btn" onClick={() => document.getElementById('import-commitments')?.click()}>
                  <Upload size={18} /> Importer les engagements
                </button>
              </div>
            </div>

            <div className="commitments-table-wrapper admin-card">
              <table className="commitments-table">
                <thead>
                  <tr>
                    <th>Année</th>
                    <th>N° Engagement</th>
                    <th>Libellé</th>
                    <th>Opérateur</th>
                    <th>Montant Engagé</th>
                    <th>Montant Facturé</th>
                    <th>Solde</th>
                    <th>Référence</th>
                  </tr>
                </thead>
                <tbody>
                  {commitments.map(c => (
                    <tr key={c.id}>
                      <td className="year-cell">{c.year}</td>
                      <td className="num-cell">{c.commitment_number}</td>
                      <td>{c.label}</td>
                      <td>{c.operator_name}</td>
                      <td className="amount-cell">{(c.amount || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                      <td className="amount-cell" style={{ color: '#64748b' }}>{(c.invoiced_amount || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                      <td className="amount-cell" style={{ color: ((c.amount || 0) - (c.invoiced_amount || 0)) < 0 ? '#ef4444' : '#059669', fontWeight: 700 }}>
                        {((c.amount || 0) - (c.invoiced_amount || 0)).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}
                      </td>
                      <td>{c.external_ref}</td>
                    </tr>
                  ))}
                  {commitments.length === 0 && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Aucun engagement importé</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Validation Modal for Missing Info */}
      {showValidation && pendingInvoice && (
        <div className="validation-modal-overlay">
          <div className="validation-modal-content">
            <div className="validation-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertCircle color="#f59e0b" size={24} />
                <h2>Validation de la facture</h2>
              </div>
              <button className="close-btn" onClick={() => setShowValidation(false)}><X size={24} /></button>
            </div>
            <div className="validation-body">
              <div className="pdf-viewer-side">
                <iframe src={`/api/${pendingInvoice.file_path}`} title="PDF Viewer" width="100%" height="100%" />
              </div>
              <div className="form-side">
                <p className="validation-hint">Veuillez désigner ou saisir les informations manquantes en consultant le document à gauche.</p>
                <div className="validation-form">
                  <div className="form-group">
                    <label>Numéro de facture</label>
                    <input type="text" value={pendingInvoice.invoice_number} onChange={e => setPendingInvoice({...pendingInvoice, invoice_number: e.target.value})} />
                  </div>
                  <div className="form-group">
                    <label>Opérateur</label>
                    <select 
                      value={pendingInvoice.operator_id || ''} 
                      onChange={e => {
                        const opId = parseInt(e.target.value);
                        setPendingInvoice({...pendingInvoice, operator_id: opId, billing_account_id: null});
                        if (opId) fetchAccounts(opId);
                      }}
                    >
                      <option value="">-- Sélectionner l'opérateur --</option>
                      {operators.map(op => <option key={op.id} value={op.id}>{op.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Compte de facturation</label>
                    <select 
                      value={pendingInvoice.billing_account_id || ''} 
                      onChange={e => setPendingInvoice({...pendingInvoice, billing_account_id: parseInt(e.target.value)})}
                      disabled={!pendingInvoice.operator_id}
                    >
                      <option value="">-- Sélectionner le compte --</option>
                      {billingAccounts[pendingInvoice.operator_id]?.map(acc => (
                        <option key={acc.id} value={acc.id}>{acc.account_number} ({acc.designation})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Montant TTC (€)</label>
                    <input type="number" step="0.01" value={pendingInvoice.amount_ttc} onChange={e => setPendingInvoice({...pendingInvoice, amount_ttc: parseFloat(e.target.value)})} />
                  </div>
                  <div className="form-group">
                    <label>Date de facture</label>
                    <input type="date" value={pendingInvoice.invoice_date || ''} onChange={e => setPendingInvoice({...pendingInvoice, invoice_date: e.target.value})} />
                  </div>
                  <button className="confirm-btn" onClick={handleSaveValidation}>
                    <Save size={18} /> Valider les informations
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .telecom-container { min-height: 100vh; background: #f8fafc; }
        .telecom-main { max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
        .telecom-page-header { display: flex; align-items: flex-start; gap: 20px; margin-bottom: 40px; }
        .back-button { background: white; border: 1px solid #e2e8f0; padding: 10px; border-radius: 12px; cursor: pointer; color: #64748b; }
        .title-group h1 { margin: 0; font-size: 1.875rem; color: #1e293b; }
        .title-group p { margin: 5px 0 0; color: #64748b; }
        
        .tab-switcher { margin-left: auto; background: #f1f5f9; padding: 4px; border-radius: 12px; display: flex; gap: 4px; }
        .tab-switcher button { border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; color: #64748b; background: none; transition: all 0.2s; }
        .tab-switcher button.active { background: white; color: #0078a4; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .section-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .section-header h2 { font-size: 1.25rem; color: #1e293b; }
        
        .add-btn, .import-btn { background: #0078a4; color: white; border: none; padding: 10px 20px; border-radius: 10px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }
        
        .operator-search-card { background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 24px; position: relative; }
        .search-input-wrapper { display: flex; align-items: center; gap: 10px; }
        .search-input-wrapper input { flex-grow: 1; border: none; padding: 10px; font-size: 1rem; outline: none; }
        .close-search { background: none; border: none; color: #ef4444; font-weight: 600; cursor: pointer; }
        .tier-results { position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #e2e8f0; border-radius: 0 0 12px 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); z-index: 10; max-height: 250px; overflow-y: auto; }
        .tier-result-item { padding: 12px 20px; display: flex; justify-content: space-between; cursor: pointer; border-bottom: 1px solid #f1f5f9; }
        .tier-result-item:hover { background: #f8fafc; }
        .tier-name { font-weight: 600; color: #1e293b; }
        .tier-code { color: #64748b; font-size: 0.875rem; }

        .operators-list { display: flex; flex-direction: column; gap: 16px; }
        .operator-card { background: white; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; }
        .operator-card-header { padding: 20px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
        .operator-card-header:hover { background: #fdfdfd; }
        .op-info { display: flex; align-items: center; gap: 15px; }
        .op-icon { width: 48px; height: 48px; background: #eff6ff; color: #3b82f6; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .op-info h3 { margin: 0; font-size: 1.1rem; color: #1e293b; }
        .account-count { font-size: 0.875rem; color: #64748b; }
        .op-actions { display: flex; align-items: center; gap: 15px; color: #64748b; }
        .delete-op-btn { background: none; border: none; color: #ef4444; padding: 8px; border-radius: 8px; cursor: pointer; opacity: 0; transition: opacity 0.2s; }
        .operator-card:hover .delete-op-btn { opacity: 1; }
        .delete-op-btn:hover { background: #fef2f2; }

        .operator-card-body { padding: 0 20px 20px; border-top: 1px solid #f1f5f9; }
        .accounts-header { display: flex; justify-content: space-between; align-items: center; margin-top: 20px; margin-bottom: 15px; }
        .accounts-header h4 { margin: 0; font-size: 0.95rem; color: #475569; }
        .add-account-btn { background: #f1f5f9; color: #475569; border: none; padding: 4px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; }

        .add-account-form { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
        .form-header-small { font-size: 0.85rem; font-weight: 700; color: #0078a4; margin-bottom: 15px; text-transform: uppercase; }
        .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
        .form-group label { display: block; font-size: 0.8rem; font-weight: 600; color: #64748b; margin-bottom: 5px; }
        .form-group input, .form-group select { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.9rem; }
        .form-actions { display: flex; justify-content: flex-end; gap: 10px; }
        .cancel-btn { background: white; border: 1px solid #e2e8f0; padding: 8px 16px; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
        .save-btn { background: #0078a4; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; }

        .accounts-table { width: 100%; border-collapse: collapse; }
        .accounts-table th { text-align: left; padding: 12px; font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.025em; border-bottom: 1px solid #f1f5f9; }
        .accounts-table td { padding: 12px; font-size: 0.9rem; color: #1e293b; border-bottom: 1px solid #f1f5f9; }
        .type-badge { padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
        .type-badge.fixe { background: #ecfdf5; color: #059669; }
        .type-badge.mobile { background: #eff6ff; color: #2563eb; }
        .type-badge.interco { background: #faf5ff; color: #7c3aed; }
        .type-badge.internet { background: #fff7ed; color: #d97706; }
        .num-badge { font-weight: 700; color: #0078a4; }
        .amount-col { font-weight: 700; color: #1e293b; text-align: right; }
        .action-btns { display: flex; gap: 8px; }
        .edit-icon-btn { color: #0078a4; background: none; border: none; cursor: pointer; transition: color 0.2s; }
        .delete-icon-btn { color: #94a3b8; background: none; border: none; cursor: pointer; transition: color 0.2s; }
        .delete-icon-btn:hover { color: #ef4444; }

        .commitment-group { margin-bottom: 24px; border: 1px solid #f1f5f9; border-radius: 12px; overflow: hidden; }
        .commitment-group-header { background: #f8fafc; padding: 10px 15px; border-bottom: 1px solid #f1f5f9; }
        .comm-info-tag { display: flex; align-items: center; gap: 10px; font-size: 0.85rem; }
        .comm-label { color: #64748b; font-weight: 600; }
        .comm-value { color: #0078a4; font-weight: 800; }
        .comm-amount-tag { color: #64748b; font-weight: 500; }
        .comm-balance-tag { margin-left: auto; padding: 2px 10px; border-radius: 6px; font-weight: 700; }
        .comm-balance-tag.positive { background: #ecfdf5; color: #059669; }
        .comm-balance-tag.negative { background: #fef2f2; color: #ef4444; }

        .invoice-count-btn { 
          display: inline-flex; 
          align-items: center; 
          gap: 6px; 
          background: #eff6ff; 
          color: #2563eb; 
          border: 1px solid #dbeafe; 
          padding: 4px 10px; 
          border-radius: 8px; 
          font-weight: 700; 
          cursor: pointer; 
          transition: all 0.2s;
          font-size: 0.85rem;
        }
        .invoice-count-btn:hover { 
          background: #2563eb; 
          color: white; 
          transform: translateY(-1px);
          box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2);
        }

        .invoice-count-badge.clickable { cursor: pointer; transition: all 0.2s; }
        .invoice-count-badge.clickable:hover { background: #0078a4; color: white; transform: scale(1.1); }

        .invoice-filters { padding: 20px; margin-bottom: 24px; }
        .filters-grid { display: grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 20px; align-items: flex-end; }
        .filter-group label { display: block; font-size: 0.75rem; font-weight: 700; color: #64748b; margin-bottom: 6px; text-transform: uppercase; }
        .filter-group select { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.9rem; background: white; }
        .search-input-wrapper-mini { display: flex; align-items: center; gap: 8px; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0 12px; height: 38px; }
        .search-input-wrapper-mini input { border: none; outline: none; font-size: 0.9rem; width: 100%; }
        .clear-filters { background: #f1f5f9; border: none; padding: 8px 16px; border-radius: 8px; font-size: 0.85rem; font-weight: 600; color: #64748b; cursor: pointer; height: 38px; transition: all 0.2s; }
        .clear-filters:hover { background: #e2e8f0; color: #1e293b; }

        .month-break-row td { background: #f8fafc; font-weight: 700; color: #0078a4; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; padding: 10px 15px; border-bottom: 2px solid #e2e8f0; }

        .status-tag { padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; display: inline-block; }
        .status-tag.imported { background: #ecfdf5; color: #059669; border: 1px solid #d1fae5; }
        .status-tag.pending { background: #fff7ed; color: #d97706; border: 1px solid #ffedd5; }

        .commitments-table { width: 100%; border-collapse: collapse; }
        .commitments-table th { background: #f8fafc; padding: 15px; text-align: left; font-size: 0.8rem; color: #64748b; border-bottom: 1px solid #e2e8f0; }
        .commitments-table td { padding: 15px; font-size: 0.9rem; border-bottom: 1px solid #f1f5f9; }
        .year-cell { font-weight: 700; color: #64748b; }
        .num-cell { font-weight: 700; color: #0078a4; }
        .amount-cell { font-weight: 700; text-align: right; }
        .admin-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .empty-state { text-align: center; padding: 60px; color: #94a3b8; }
        .empty-state p { margin-top: 15px; font-size: 1.1rem; }

        /* Validation Modal Styles */
        .validation-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 40px; }
        .validation-modal-content { background: white; width: 100%; height: 100%; border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; }
        .validation-header { padding: 20px 30px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
        .validation-body { flex-grow: 1; display: flex; overflow: hidden; }
        .pdf-viewer-side { flex: 1; background: #525659; border-right: 1px solid #e2e8f0; }
        .form-side { width: 400px; padding: 30px; overflow-y: auto; background: #f8fafc; }
        .validation-hint { font-size: 0.9rem; color: #64748b; margin-bottom: 20px; padding: 12px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; line-height: 1.4; }
        .validation-form { display: flex; flex-direction: column; gap: 20px; }
        .confirm-btn { margin-top: 10px; background: #059669; color: white; border: none; padding: 14px; border-radius: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: all 0.2s; }
        .confirm-btn:hover { background: #047857; transform: translateY(-1px); }
      `}</style>
    </div>
  );
};

export default TelecomManagement;
