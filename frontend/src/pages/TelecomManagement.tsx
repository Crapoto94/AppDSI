import React, { useState, useEffect } from 'react';
import { 
  Phone, 
  Plus, 
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
  Upload
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
}

interface Commitment {
  id: number;
  commitment_number: string;
  label: string;
  amount: number;
  year: number;
  operator_name: string;
  external_ref: string;
}

const TelecomManagement: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'invoices' | 'lines'>('invoices');
  const [operators, setOperators] = useState<Operator[]>([]);
  const [billingAccounts, setBillingAccounts] = useState<Record<number, BillingAccount[]>>({});
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [allTiers, setAllTiers] = useState<Tier[]>([]);
  const [showAddOperator, setShowAddOperator] = useState(false);
  const [tierSearch, setTierSearch] = useState('');
  const [expandedOperators, setExpandedOperators] = useState<number[]>([]);
  const [showAddAccount, setShowAddAccount] = useState<number | null>(null);
  
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
        // Fetch accounts for each operator
        ops.forEach((op: Operator) => fetchAccounts(op.id));
      }

      const tiersRes = await fetch('/api/tiers?all=true', { headers: { 'Authorization': `Bearer ${token}` } });
      if (tiersRes.ok) {
        const data = await tiersRes.json();
        setAllTiers(data.tiers || []);
      }

      const commRes = await fetch('/api/telecom/commitments', { headers: { 'Authorization': `Bearer ${token}` } });
      if (commRes.ok) setCommitments(await commRes.json());
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

  const handleAddAccount = async (operatorId: number) => {
    try {
      const res = await fetch('/api/telecom/billing-accounts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...newAccount, operator_id: operatorId })
      });
      if (res.ok) {
        setShowAddAccount(null);
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

  const toggleOperator = (id: number) => {
    setExpandedOperators(prev => 
      prev.includes(id) ? prev.filter(oid => oid !== id) : [...prev, id]
    );
  };

  const filteredTiers = allTiers.filter(t => 
    t.nom.toLowerCase().includes(tierSearch.toLowerCase()) && 
    !operators.some(op => op.tier_id === t.id)
  ).slice(0, 5);

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
              <CreditCard size={18} /> Gestion des factures
            </button>
            <button className={activeTab === 'lines' ? 'active' : ''} onClick={() => setActiveTab('lines')}>
              <List size={18} /> Gestion des engagements
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
                        <button className="add-account-btn" onClick={() => setShowAddAccount(op.id)}>
                          <Plus size={14} /> Nouveau compte
                        </button>
                      </div>

                      {showAddAccount === op.id && (
                        <div className="add-account-form">
                          <div className="form-grid">
                            <div className="form-group">
                              <label>N° de compte</label>
                              <input type="text" value={newAccount.account_number} onChange={e => setNewAccount({...newAccount, account_number: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>Type</label>
                              <select value={newAccount.type} onChange={e => setNewAccount({...newAccount, type: e.target.value})}>
                                <option value="Fixe">Téléphonie fixe</option>
                                <option value="Mobile">Téléphonie mobile</option>
                                <option value="Interco">Liens interco</option>
                                <option value="Internet">Accès internet</option>
                              </select>
                            </div>
                            <div className="form-group">
                              <label>Désignation</label>
                              <input type="text" value={newAccount.designation} onChange={e => setNewAccount({...newAccount, designation: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>N° Client</label>
                              <input type="text" value={newAccount.customer_number} onChange={e => setNewAccount({...newAccount, customer_number: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>N° Marché</label>
                              <input type="text" value={newAccount.market_number} onChange={e => setNewAccount({...newAccount, market_number: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>Code Fonction</label>
                              <input type="text" value={newAccount.function_code} onChange={e => setNewAccount({...newAccount, function_code: e.target.value})} />
                            </div>
                            <div className="form-group">
                              <label>N° Engagement</label>
                              <input type="text" value={newAccount.commitment_number} onChange={e => setNewAccount({...newAccount, commitment_number: e.target.value})} />
                            </div>
                          </div>
                          <div className="form-actions">
                            <button className="cancel-btn" onClick={() => setShowAddAccount(null)}>Annuler</button>
                            <button className="save-btn" onClick={() => handleAddAccount(op.id)}>Enregistrer</button>
                          </div>
                        </div>
                      )}

                      <div className="accounts-table-wrapper">
                        <table className="accounts-table">
                          <thead>
                            <tr>
                              <th>Type</th>
                              <th>N° Compte</th>
                              <th>Désignation</th>
                              <th>N° Marché</th>
                              <th>N° Engagement</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {billingAccounts[op.id]?.map(acc => (
                              <tr key={acc.id}>
                                <td><span className={`type-badge ${acc.type.toLowerCase()}`}>{acc.type}</span></td>
                                <td>{acc.account_number}</td>
                                <td>{acc.designation}</td>
                                <td>{acc.market_number}</td>
                                <td>{acc.commitment_number}</td>
                                <td>
                                  <button className="delete-icon-btn" onClick={() => handleDeleteAccount(acc.id, op.id)}>
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {(!billingAccounts[op.id] || billingAccounts[op.id].length === 0) && (
                              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '20px', color: '#64748b' }}>Aucun compte configuré</td></tr>
                            )}
                          </tbody>
                        </table>
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
                    <th>Montant</th>
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
                      <td className="amount-cell">{c.amount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}</td>
                      <td>{c.external_ref}</td>
                    </tr>
                  ))}
                  {commitments.length === 0 && (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>Aucun engagement importé</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

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
        .form-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 20px; }
        .form-group label { display: block; font-size: 0.8rem; font-weight: 600; color: #64748b; margin-bottom: 5px; }
        .form-group input, .form-group select { width: 100%; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.9rem; }
        .form-actions { display: flex; justify-content: flex-end; gap: 10px; }
        .cancel-btn { background: white; border: 1px solid #e2e8f0; padding: 8px 16px; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
        .save-btn { background: #0078a4; color: white; border: none; padding: 8px 16px; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }

        .accounts-table { width: 100%; border-collapse: collapse; }
        .accounts-table th { text-align: left; padding: 12px; font-size: 0.8rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.025em; border-bottom: 1px solid #f1f5f9; }
        .accounts-table td { padding: 12px; font-size: 0.9rem; color: #1e293b; border-bottom: 1px solid #f1f5f9; }
        .type-badge { padding: 2px 8px; border-radius: 9999px; font-size: 0.75rem; font-weight: 600; }
        .type-badge.fixe { background: #ecfdf5; color: #059669; }
        .type-badge.mobile { background: #eff6ff; color: #2563eb; }
        .type-badge.interco { background: #faf5ff; color: #7c3aed; }
        .type-badge.internet { background: #fff7ed; color: #d97706; }
        .delete-icon-btn { color: #94a3b8; background: none; border: none; cursor: pointer; transition: color 0.2s; }
        .delete-icon-btn:hover { color: #ef4444; }

        .commitments-table { width: 100%; border-collapse: collapse; }
        .commitments-table th { background: #f8fafc; padding: 15px; text-align: left; font-size: 0.8rem; color: #64748b; border-bottom: 1px solid #e2e8f0; }
        .commitments-table td { padding: 15px; font-size: 0.9rem; border-bottom: 1px solid #f1f5f9; }
        .year-cell { font-weight: 700; color: #64748b; }
        .num-cell { font-weight: 700; color: #0078a4; }
        .amount-cell { font-weight: 700; text-align: right; }
        .admin-card { background: white; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }

        .empty-state { text-align: center; padding: 60px; color: #94a3b8; }
        .empty-state p { margin-top: 15px; font-size: 1.1rem; }
      `}</style>
    </div>
  );
};

export default TelecomManagement;
