import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Users, RefreshCw, Search,
  Link2Off, Monitor as MonitorIcon, CheckCircle2,
  AlertCircle, X, Loader2, UserPlus, Download, 
  MoreVertical, Filter, ChevronLeft, ChevronRight, Settings, Columns
} from 'lucide-react';
import Header from '../components/Header';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, MessageSquare, 
  Settings as SettingsIcon, LayoutGrid, Activity, Smartphone,
  Database, Shield, Bell, Lock, Sliders
} from 'lucide-react';

interface Stats {
  total: number;
  actif: number;
  parti: number;
  arriveeFuture: number;
  adLie: number;
  adNonLie: number;
}

interface Agent {
  matricule: string;
  nom: string;
  prenom: string;
  SERVICE_L?: string;
  DIRECTION_L?: string;
  DATE_ARRIVEE?: string;
  DATE_DEPART: string | null;
  ad_username?: string | null;
  date_plusvu?: string | null;
  [key: string]: any; // Allow all other Oracle fields dynamically
}

interface ADUser {
  sAMAccountName: string;
  displayName: string;
  mail?: string;
}

const StatCard: React.FC<{
  label: string;
  value: number | undefined;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  onClick?: () => void;
  clickable?: boolean;
  tooltip?: string;
}> = ({ label, value, color, bg, border, icon, onClick, clickable, tooltip }) => (
  <div
    className={`stat-card ${clickable ? 'clickable' : ''}`}
    style={{ background: bg, borderTop: `4px solid ${border}` }}
    onClick={onClick}
    title={tooltip}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div className="stat-value" style={{ color }}>{(value ?? 0).toLocaleString()}</div>
        <div className="stat-label">{label}</div>
      </div>
      <div className="stat-icon" style={{ background: border + '22', color: border }}>{icon}</div>
    </div>
    {clickable && <div className="stat-click-hint">Cliquer pour filtrer →</div>}
  </div>
);
const StudioRH: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [unlinkedAD, setUnlinkedAD] = useState<ADUser[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showUnlinkedModal, setShowUnlinkedModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [adSearchTerm, setAdSearchTerm] = useState('');
  const [associatingAgent, setAssociatingAgent] = useState<Agent | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [totalAgents, setTotalAgents] = useState(0);
  const [page, setPage] = useState(1);
  const [syncingAD, setSyncingAD] = useState(false);
  const [adSyncStatus, setAdSyncStatus] = useState({ current: 0, total: 0, status: 'idle' });
  const [proposals, setProposals] = useState<any[]>([]);
  const [showProposalsModal, setShowProposalsModal] = useState(false);

  const [limit, setLimit] = useState(50);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'users' | 'settings' | 'logs'>('users');

  const token = localStorage.getItem('token');
  const headers = React.useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const formatDateFr = (dateStr: string | null | undefined) => {
    if (!dateStr) return '-';
    try {
      // Fix: Handle long date strings from Oracle more gracefully
      const cleanDate = String(dateStr).split(' (')[0]; 
      const d = new Date(cleanDate);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('fr-FR');
    } catch (e) {
      return dateStr;
    }
  };

  const fetchStats = async () => {
    if (!token) return;
    setLoadingStats(true);
    try {
      const res = await axios.get('/api/admin/rh/stats', { headers });
      setStats(res.data);
    } catch (err) {
      console.error('Erreur stats', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const fetchAgents = useCallback(async (q?: string, filter?: string | null, p = 1, l = 50) => {
    if (!token) return;
    setLoadingAgents(true);
    setHasSearched(true);
    try {
      const res = await axios.get('/api/admin/rh/agents', { 
        headers, 
        params: { q, filter, page: p, limit: l } 
      });
      const data = res.data || {};
      const agentsList = Array.isArray(data.agents) ? data.agents : (Array.isArray(data) ? data : []);
      const agentsTotal = typeof data.total === 'number' ? data.total : agentsList.length;
      
      setAgents(agentsList);
      setTotalAgents(agentsTotal);
    } catch (err) {
      console.error('Erreur agents', err);
      setAgents([]);
    } finally {
      setLoadingAgents(false);
    }
  }, [token, headers]);

  const fetchUnlinkedAD = async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/admin/rh/unlinked-ad', { headers });
      setUnlinkedAD(res.data);
    } catch (err) {
      console.error('Erreur AD', err);
    }
  };

  const fetchProposals = async () => {
    if (!token) return;
    try {
      const res = await axios.get('/api/admin/rh/ad-proposals', { headers });
      setProposals(res.data);
    } catch (err) {
      console.error('Erreur propositions', err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchStats();
      fetchProposals();
    }
  }, [token]);

  // Debounced search / filter / page
  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => fetchAgents(searchTerm || undefined, activeFilter, page, limit), 300);
    return () => clearTimeout(t);
  }, [searchTerm, activeFilter, page, limit, fetchAgents, token]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await axios.post('/api/admin/rh/sync', {}, { headers });
      setSyncMessage({
        type: 'success',
        text: `Synchro terminée : ${res.data.stats.new} nouveaux, ${res.data.stats.matched} AD associés, ${res.data.stats.left} départs.`,
      });
      fetchStats();
      if (hasSearched) fetchAgents(searchTerm || undefined, activeFilter, page);
    } catch (err: any) {
      setSyncMessage({
        type: 'error',
        text: err.response?.data?.message || 'Erreur lors de la synchronisation',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleAssociate = async (matricule: string, adUsername: string | null) => {
    try {
      await axios.post('/api/admin/rh/associate', { matricule, ad_username: adUsername }, { headers });
      setShowUnlinkedModal(false);
      setAssociatingAgent(null);
      fetchStats();
      if (hasSearched) fetchAgents(searchTerm || undefined, activeFilter, page);
    } catch (err: any) {
      alert("Erreur lors de l'association: " + (err.response?.data?.message || err.message));
    }
  };

  const filteredAD = (unlinkedAD || []).filter(
    (u) =>
      u.displayName?.toLowerCase().includes(adSearchTerm.toLowerCase()) ||
      u.sAMAccountName?.toLowerCase().includes(adSearchTerm.toLowerCase())
  );

  const startADSync = async () => {
    if (!token) return;
    setSyncingAD(true);
    try {
      await axios.post('/api/admin/rh/sync-ad', {}, { headers });
      // Start polling
      const interval = setInterval(async () => {
        try {
          const res = await axios.get('/api/admin/rh/sync-ad/progress', { headers });
          setAdSyncStatus(res.data);
          if (res.data.status !== 'running') {
            clearInterval(interval);
            setSyncingAD(false);
            fetchStats();
            fetchProposals();
            if (res.data.status === 'done') setShowProposalsModal(true);
          }
        } catch (e) {
          clearInterval(interval);
          setSyncingAD(false);
        }
      }, 1000);
    } catch (err) {
      setSyncingAD(false);
      alert('Erreur lors du lancement de la synchro AD');
    }
  };

  const handleProposal = async (id: number, action: 'accept' | 'refuse') => {
    try {
      await axios.post('/api/admin/rh/ad-proposals/action', { id, action }, { headers });
      fetchProposals();
      fetchStats();
      if (hasSearched) fetchAgents(searchTerm || undefined, activeFilter, page, limit);
    } catch (err) {
      alert('Erreur lors du traitement de la proposition');
    }
  };

  const handleDownload = () => {
    // Basic CSV export
    if (agents.length === 0) return;
    const headers = ["Matricule", "Nom", "Prénom", "Fonction", "Service", "Direction"];
    const rows = agents.map(a => [a.matricule, a.nom, a.prenom, a.POSTE_L || a.FONCTION || '', a.SERVICE_L || '', a.DIRECTION_L || '']);
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "liste_rh.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const menuItems = [
    { id: 'dashboard', title: "Dashboard", icon: LayoutDashboard },
    { id: 'users', title: "Utilisateurs", icon: Users },
    { id: 'settings', title: "Paramètres", icon: SettingsIcon },
    { id: 'logs', title: "Logs", icon: Activity },
  ];

  return (
    <div className="admin-root">
      <Header />
      
      <div className="admin-container">
        <aside className="admin-sidebar" style={{ backgroundColor: '#0f172a' }}>
          <div className="sidebar-brand" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Users size={24} className="brand-icon" style={{ color: '#059669' }} />
            <span>Studio RH</span>
          </div>
          
          <nav className="sidebar-nav">
            {menuItems.map((item) => (
              <div
                key={item.id}
                onClick={() => setCurrentView(item.id as any)}
                className={`nav-link ${currentView === item.id ? 'active' : ''}`}
                style={{ cursor: 'pointer', backgroundColor: currentView === item.id ? '#059669' : 'transparent' }}
              >
                <item.icon size={18} />
                <span>{item.title}</span>
                {currentView === item.id && <div className="active-marker" style={{ backgroundColor: 'white' }} />}
              </div>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div className="system-status">
              <div className="status-dot online"></div>
              <span>Studio Opérationnel</span>
            </div>
          </div>
        </aside>

        <main className="admin-main">
          <header className="admin-content-header">
            <div className="breadcrumb">
              <span className="crumb-root">Studio RH</span>
              <ChevronRight size={14} />
              <span className="crumb-active">
                {currentView === 'users' ? 'Liste des utilisateurs' : 
                 currentView === 'dashboard' ? 'Tableau de bord' :
                 currentView === 'settings' ? 'Paramètres' : 'Logs de synchronisation'}
              </span>
            </div>
            <div className="header-actions">
              <button className="icon-btn" title="Notifications"><Bell size={18} /></button>
              <button className="icon-btn" title="Sécurité"><Lock size={18} /></button>
            </div>
          </header>

          <div className="admin-content-body" style={{ padding: '24px' }}>
            {currentView === 'dashboard' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Tableau de bord RH</h1>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
                  <StatCard label="Total Agents" value={stats?.total} color="#1e293b" bg="white" border="#1e293b" icon={<Users size={20} />} />
                  <StatCard label="Agents Actifs" value={stats?.actif} color="#059669" bg="white" border="#059669" icon={<CheckCircle2 size={20} />} />
                  <StatCard label="Départs" value={stats?.parti} color="#dc2626" bg="white" border="#dc2626" icon={<Link2Off size={20} />} />
                  <StatCard label="AD Liés" value={stats?.adLie} color="#3b82f6" bg="white" border="#3b82f6" icon={<MonitorIcon size={20} />} />
                </div>
              </div>
            )}

            {currentView === 'users' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="content-top-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <h1 className="content-title" style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Liste des utilisateurs</h1>
                    {proposals.length > 0 && (
                      <div className="header-badge warning" onClick={() => setShowProposalsModal(true)} style={{ backgroundColor: '#fff7ed', color: '#ea580c', border: '1px solid #ffedd5', padding: '6px 14px', borderRadius: '99px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <AlertCircle size={14} />
                        <span>{proposals.length} suggestions AD</span>
                      </div>
                    )}
                  </div>
                </div>

                {syncingAD && adSyncStatus.total > 0 && (
                  <div className="ad-sync-progress-container" style={{ background: 'white', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                    <div className="progress-info" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 700, color: '#3b82f6', marginBottom: '10px' }}>
                      <span>Synchronisation AD en cours...</span>
                      <span>{adSyncStatus.current} / {adSyncStatus.total}</span>
                    </div>
                    <div className="progress-bar-bg" style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div className="progress-bar-fill" style={{ height: '100%', background: '#3b82f6', width: `${(adSyncStatus.current / adSyncStatus.total) * 100}%` }}></div>
                    </div>
                  </div>
                )}

                <div className="filter-bar" style={{ display: 'flex', alignItems: 'center', gap: '16px', background: 'white', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <div className="search-box" style={{ position: 'relative', flex: 1, maxWidth: '400px', display: 'flex', alignItems: 'center' }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', color: '#94a3b8' }} />
                    <input 
                      type="text" 
                      placeholder="Recherche par nom, prénom, matricule..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{ width: '100%', padding: '10px 12px 10px 40px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f1f5f9', fontSize: '14px', outline: 'none' }}
                    />
                  </div>
                  <div className="status-select">
                    <select value={activeFilter || ''} onChange={(e) => { setActiveFilter(e.target.value || null); setPage(1); }} style={{ padding: '10px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f1f5f9', fontSize: '14px', outline: 'none', cursor: 'pointer' }}>
                      <option value="">Tous les utilisateurs</option>
                      <option value="actif">Agents actifs</option>
                      <option value="parti">Agents partis</option>
                      <option value="future">Arrivées futures</option>
                      <option value="ad_linked">Compte AD lié</option>
                      <option value="ad_unlinked">Compte AD non lié</option>
                    </select>
                  </div>
                  <div className="action-buttons" style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                    <button className="btn-icon" onClick={handleSync} title="Synchroniser Oracle"><RefreshCw size={18} className={syncing ? 'spin' : ''} /></button>
                    <button className="btn-icon" onClick={startADSync} title="Synchroniser AD"><MonitorIcon size={18} className={syncingAD ? 'spin' : ''} /></button>
                    <button className="btn-icon" onClick={handleDownload} title="Télécharger CSV"><Download size={18} /></button>
                    <button className="btn-icon" onClick={() => setShowColumnSettings(true)} title="Gérer les colonnes"><Columns size={18} /></button>
                    <button onClick={() => setAssociatingAgent(null)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: '#059669', color: 'white', borderRadius: '8px', fontWeight: 600, fontSize: '14px', border: 'none', cursor: 'pointer' }}>
                      <UserPlus size={18} />
                      <span>Ajouter</span>
                    </button>
                  </div>
                </div>

                {syncMessage && (
                  <div className={`message-banner ${syncMessage.type}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderRadius: '8px', fontSize: '14px', fontWeight: 500, backgroundColor: syncMessage.type === 'success' ? '#f0fdf4' : '#fef2f2', color: syncMessage.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${syncMessage.type === 'success' ? '#dcfce7' : '#fee2e2'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {syncMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                      <span>{syncMessage.text}</span>
                    </div>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }} onClick={() => setSyncMessage(null)}><X size={16} /></button>
                  </div>
                )}

                <div className="user-table-container" style={{ backgroundColor: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'auto' }}>
                  <table className="user-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}><input type="checkbox" /></th>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Utilisateur</th>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Matricule</th>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Service</th>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Direction</th>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Connexion AD</th>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Départ</th>
                        <th style={{ textAlign: 'left', padding: '16px', backgroundColor: '#f8fafc', color: '#64748b', fontSize: '11px', fontWeight: 700, borderBottom: '1px solid #e2e8f0', textTransform: 'uppercase' }}>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingAgents && agents.length === 0 ? (
                        <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="spin" size={32} style={{ margin: '0 auto' }} /></td></tr>
                      ) : agents.length === 0 ? (
                        <tr><td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Aucun utilisateur trouvé</td></tr>
                      ) : (
                        agents.map((agent) => (
                          <tr key={agent.matricule} style={{ opacity: loadingAgents ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                            <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}><input type="checkbox" /></td>
                            <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '40px', height: '40px', background: '#f1f5f9', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#64748b', fontSize: '14px' }}>
                                  {agent.prenom?.[0]}{agent.nom?.[0]}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '13.5px' }}>{agent.nom} {agent.prenom}</div>
                                  <div style={{ fontSize: '12px', color: '#64748b' }}>{agent.POSTE_L || agent.FONCTION || '-'}</div>
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', color: '#64748b', fontSize: '13px' }}>{agent.matricule}</td>
                            <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>{agent.SERVICE_L}</td>
                            <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>{agent.DIRECTION_L}</td>
                            <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>{formatDateFr(agent.last_logon_timestamp || agent.date_derniere_connexion_ad)}</td>
                            <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>{formatDateFr(agent.DATE_DEPART)}</td>
                            <td style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9' }}>
                              <div style={{ display: 'flex', gap: '8px' }}>
                                {!agent.ad_username && <Link2Off size={16} style={{ color: '#f97316' }} />}
                                {agent.date_plusvu && <AlertCircle size={16} style={{ color: '#ef4444' }} />}
                                {agent.ad_username && <CheckCircle2 size={16} style={{ color: '#22c55e' }} />}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px' }}>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>Affiche <b>{agents.length}</b> sur <b>{totalAgents}</b></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                      <span>Par page</span>
                      <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                        <option value={10}>10</option><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
                      </select>
                    </div>
                    <div className="pagination" style={{ display: 'flex', gap: '4px' }}>
                      <button className="page-btn" disabled={page === 1} onClick={() => setPage(page - 1)} style={{ padding: '6px', minWidth: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white' }}><ChevronLeft size={16} /></button>
                      <button className="page-btn active" style={{ minWidth: '32px', height: '32px', borderRadius: '6px', border: '1px solid #059669', background: '#059669', color: 'white', fontWeight: 600 }}>{page}</button>
                      <button className="page-btn" disabled={page >= Math.ceil(totalAgents / limit)} onClick={() => setPage(page + 1)} style={{ padding: '6px', minWidth: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', border: '1px solid #e2e8f0', background: 'white' }}><ChevronRight size={16} /></button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentView === 'settings' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Paramètres du Studio</h1>
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <p style={{ color: '#64748b' }}>Configuration des synchronisations et des seuils de correspondance.</p>
                </div>
              </div>
            )}

            {currentView === 'logs' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Logs du Studio</h1>
                <div style={{ background: 'white', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                  <p style={{ color: '#64748b' }}>Historique des synchronisations Oracle et AD.</p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      <style>{`
        .admin-root { height: 100vh; display: flex; flex-direction: column; background-color: #f0f2f5; overflow: hidden; font-family: 'Inter', sans-serif; }
        .admin-container { display: flex; flex: 1; overflow: hidden; }
        .admin-sidebar { width: 260px; background-color: #1a2234; color: #a3b1cc; display: flex; flex-direction: column; border-right: 1px solid #0f172a; }
        .sidebar-brand { padding: 25px; display: flex; align-items: center; gap: 12px; color: white; font-weight: 800; font-size: 1.1rem; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .brand-icon { color: #3b82f6; }
        .sidebar-nav { padding: 20px 12px; flex: 1; overflow-y: auto; }
        .nav-link { display: flex; align-items: center; gap: 12px; padding: 12px 16px; color: #94a3b8; text-decoration: none; font-size: 0.9rem; font-weight: 600; border-radius: 8px; margin-bottom: 4px; transition: all 0.2s; position: relative; }
        .nav-link:hover { background-color: rgba(255,255,255,0.05); color: white; }
        .nav-link.active { background-color: #3b82f6; color: white; }
        .active-marker { position: absolute; right: 0; width: 4px; height: 20px; background-color: white; border-radius: 4px 0 0 4px; }
        .sidebar-footer { padding: 20px; border-top: 1px solid rgba(255,255,255,0.05); }
        .system-status { display: flex; align-items: center; gap: 8px; font-size: 0.75rem; color: #64748b; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; }
        .status-dot.online { background-color: #22c55e; box-shadow: 0 0 8px rgba(34, 197, 94, 0.5); }
        .admin-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .admin-content-header { height: 64px; background-color: white; border-bottom: 1px solid #e2e8f0; padding: 0 30px; display: flex; align-items: center; justify-content: space-between; }
        .breadcrumb { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; font-weight: 600; }
        .crumb-root { color: #94a3b8; }
        .crumb-active { color: #1e293b; }
        .header-actions { display: flex; gap: 10px; }
        .icon-btn { width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b; cursor: pointer; transition: all 0.2s; }
        .icon-btn:hover { background: #f1f5f9; color: #1e293b; border-color: #cbd5e1; }
        .admin-content-body { flex: 1; overflow-y: auto; background-color: #f8fafc; }
        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content { background: white; border-radius: 16px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; }
        .modal-header { padding: 20px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
        .close-btn { background: none; border: none; color: #94a3b8; cursor: pointer; }
        .modal-body { padding: 20px; }
        .associate-btn { background: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-weight: 600; cursor: pointer; }
        .stats-table { width: 100%; border-collapse: collapse; }
        .stats-table th { text-align: left; padding: 12px; background: #f8fafc; font-size: 11px; font-weight: 700; color: #64748b; border-bottom: 2px solid #e2e8f0; text-transform: uppercase; }
        .stats-table td { padding: 12px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>

      {showProposalsModal && (
        <div className="modal-overlay" onClick={() => setShowProposalsModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>Propositions de correspondance AD</h2>
              <button className="close-btn" onClick={() => setShowProposalsModal(false)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
                Le système a trouvé des comptes AD dont le nom est proche de l'agent RH.
              </p>
              <table className="stats-table">
                <thead>
                  <tr><th>Agent RH</th><th>Compte AD</th><th>Score</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {proposals.map((p: any) => (
                    <tr key={p.id}>
                      <td>{p.NOM} {p.PRENOM}</td>
                      <td style={{ color: '#3b82f6', fontWeight: 700 }}>{p.ad_username}</td>
                      <td>{p.score}%</td>
                      <td>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button className="associate-btn" onClick={() => {
                              handleProposal(p.id, 'accept');
                              if (proposals.length === 1) setShowProposalsModal(false);
                          }}>Valider</button>
                          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => handleProposal(p.id, 'refuse')}><X size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudioRH;

