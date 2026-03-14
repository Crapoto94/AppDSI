import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Users, RefreshCw, UserCheck, UserMinus, Search,
  Link as LinkIcon, Link2Off, Monitor, CheckCircle2,
  AlertCircle, X, Loader2, UserPlus, ChevronDown, ChevronUp
} from 'lucide-react';

interface Stats {
  total: number;
  actif: number;
  parti: number;
  adLie: number;
  adNonLie: number;
}

interface Agent {
  matricule: string;
  nom: string;
  prenom: string;
  civilite: string;
  service: string;
  ad_username: string | null;
  last_sync_date: string;
  date_plusvu: string | null;
}

interface ADUser {
  sAMAccountName: string;
  displayName: string;
  mail?: string;
}

const StatCard: React.FC<{
  label: string;
  value: number;
  color: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  onClick?: () => void;
  clickable?: boolean;
}> = ({ label, value, color, bg, border, icon, onClick, clickable }) => (
  <div
    className={`stat-card ${clickable ? 'clickable' : ''}`}
    style={{ background: bg, borderTop: `4px solid ${border}` }}
    onClick={onClick}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div>
        <div className="stat-value" style={{ color }}>{value.toLocaleString()}</div>
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
  const [showTable, setShowTable] = useState(false);
  const [showUnlinkedModal, setShowUnlinkedModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [adSearchTerm, setAdSearchTerm] = useState('');
  const [associatingAgent, setAssociatingAgent] = useState<Agent | null>(null);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const fetchStats = async () => {
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

  const fetchAgents = useCallback(async (q?: string) => {
    setLoadingAgents(true);
    try {
      const res = await axios.get('/api/admin/rh/agents', { headers, params: q ? { q } : {} });
      setAgents(res.data);
    } catch (err) {
      console.error('Erreur agents', err);
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  const fetchUnlinkedAD = async () => {
    try {
      const res = await axios.get('/api/admin/rh/unlinked-ad', { headers });
      setUnlinkedAD(res.data);
    } catch (err) {
      console.error('Erreur AD', err);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  // Debounced search
  useEffect(() => {
    if (!showTable) return;
    const t = setTimeout(() => fetchAgents(searchTerm || undefined), 300);
    return () => clearTimeout(t);
  }, [searchTerm, showTable, fetchAgents]);

  const handleShowAll = () => {
    setShowTable(true);
    fetchAgents();
  };

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
      if (showTable) fetchAgents(searchTerm || undefined);
    } catch (err: any) {
      setSyncMessage({
        type: 'error',
        text: err.response?.data?.message || 'Erreur lors de la synchronisation',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleAssociate = async (matricule: string, adUsername: string) => {
    try {
      await axios.post('/api/admin/rh/associate', { matricule, ad_username: adUsername }, { headers });
      setShowUnlinkedModal(false);
      setAssociatingAgent(null);
      fetchStats();
      if (showTable) fetchAgents(searchTerm || undefined);
    } catch {
      alert("Erreur lors de l'association");
    }
  };

  const filteredAD = unlinkedAD.filter(
    (u) =>
      u.displayName.toLowerCase().includes(adSearchTerm.toLowerCase()) ||
      u.sAMAccountName.toLowerCase().includes(adSearchTerm.toLowerCase())
  );

  return (
    <div className="studio-rh">
      {/* Header */}
      <div className="rh-header">
        <div>
          <h2 className="rh-title">
            <span className="rh-title-icon"><Users size={26} /></span>
            Studio RH
          </h2>
          <p className="rh-subtitle">Référentiel consolidé des agents — Oracle RH × Active Directory</p>
        </div>
        <div className="rh-header-actions">
          <button
            className="rh-btn rh-btn-ghost"
            onClick={() => { setShowUnlinkedModal(true); fetchUnlinkedAD(); }}
          >
            <Monitor size={16} /> Comptes AD orphelins
          </button>
          <button
            className={`rh-btn rh-btn-primary ${syncing ? 'loading' : ''}`}
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw size={16} className={syncing ? 'spin' : ''} />
            {syncing ? 'Synchronisation…' : 'Synchroniser RH'}
          </button>
        </div>
      </div>

      {/* Sync Banner */}
      {syncMessage && (
        <div className={`rh-banner ${syncMessage.type}`}>
          {syncMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{syncMessage.text}</span>
          <button onClick={() => setSyncMessage(null)}><X size={14} /></button>
        </div>
      )}

      {/* Stats Dashboard */}
      <div className="rh-stats-grid">
        {loadingStats ? (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40 }}>
            <Loader2 className="spin" size={32} color="#64748b" style={{ margin: '0 auto' }} />
          </div>
        ) : stats ? (
          <>
            <StatCard label="Total dans le référentiel" value={stats.total} color="#1e40af" bg="linear-gradient(135deg,#eff6ff,#dbeafe)" border="#3b82f6" icon={<Users size={22} />} onClick={handleShowAll} clickable={!showTable} />
            <StatCard label="Agents actifs" value={stats.actif} color="#065f46" bg="linear-gradient(135deg,#f0fdf4,#dcfce7)" border="#22c55e" icon={<UserCheck size={22} />} onClick={handleShowAll} clickable={!showTable} />
            <StatCard label="Agents partis" value={stats.parti} color="#713f12" bg="linear-gradient(135deg,#fefce8,#fef9c3)" border="#eab308" icon={<UserMinus size={22} />} />
            <StatCard label="Liés à l'AD" value={stats.adLie} color="#1e3a5f" bg="linear-gradient(135deg,#f0f9ff,#e0f2fe)" border="#0ea5e9" icon={<Monitor size={22} />} />
            <StatCard label="Non liés à l'AD" value={stats.adNonLie} color="#7c2d12" bg="linear-gradient(135deg,#fff7ed,#ffedd5)" border="#f97316" icon={<Link2Off size={22} />}
              onClick={() => { setShowUnlinkedModal(true); fetchUnlinkedAD(); }} clickable />
          </>
        ) : null}
      </div>

      {/* Search + Toggle */}
      <div className="rh-search-row">
        <div className="rh-search">
          <Search size={17} className="rh-search-icon" />
          <input
            type="text"
            placeholder="Rechercher un agent par nom, prénom, matricule…"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (!showTable && e.target.value) {
                setShowTable(true);
              }
            }}
          />
          {searchTerm && <button className="rh-clear" onClick={() => setSearchTerm('')}><X size={14} /></button>}
        </div>
        <button className="rh-btn rh-btn-ghost" onClick={() => {
          if (!showTable) { handleShowAll(); } else { setShowTable(false); }
        }}>
          {showTable ? <><ChevronUp size={15} /> Masquer la liste</> : <><ChevronDown size={15} /> Voir tous les agents</>}
        </button>
      </div>

      {/* Agents Table */}
      {showTable && (
        <div className="admin-card" style={{ marginTop: 0 }}>
          {loadingAgents ? (
            <div style={{ textAlign: 'center', padding: 40 }}><Loader2 className="spin" style={{ margin: '0 auto' }} /></div>
          ) : (
            <div className="stats-table-wrapper">
              <table className="stats-table">
                <thead>
                  <tr>
                    <th>Statut</th>
                    <th>Matricule</th>
                    <th>Nom Prénom</th>
                    <th>Service</th>
                    <th>Compte AD</th>
                    <th>Dernière synchro</th>
                    <th style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr key={agent.matricule} className={agent.date_plusvu ? 'agent-left' : ''}>
                      <td>
                        {agent.date_plusvu ? (
                          <span className="rh-badge rh-badge-parti" title={`Dernière fois vu le ${new Date(agent.date_plusvu).toLocaleString()}`}>
                            <UserMinus size={11} />
                            Parti le {new Date(agent.date_plusvu).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="rh-badge rh-badge-actif"><UserCheck size={11} />Actif</span>
                        )}
                      </td>
                      <td className="font-mono text-xs">{agent.matricule}</td>
                      <td><strong>{agent.nom}</strong> {agent.prenom}</td>
                      <td><span className="service-tag">{agent.service}</span></td>
                      <td>
                        {agent.ad_username
                          ? <div className="ad-linked"><Monitor size={14} color="#22c55e" />{agent.ad_username}</div>
                          : <div className="ad-unlinked"><Monitor size={14} color="#cbd5e1" /><span>Non lié</span></div>}
                      </td>
                      <td className="text-xs text-gray-400">{new Date(agent.last_sync_date).toLocaleDateString()}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          className="action-icon-btn"
                          title="Associer manuellement AD"
                          onClick={() => { setAssociatingAgent(agent); setShowUnlinkedModal(true); fetchUnlinkedAD(); }}
                        >
                          <LinkIcon size={15} />
                        </button>
                        {agent.ad_username && (
                          <button
                            className="action-icon-btn delete"
                            title="Délier compte AD"
                            onClick={async () => {
                              if (window.confirm('Délier ce compte AD ?')) {
                                await axios.post('/api/admin/rh/associate', { matricule: agent.matricule, ad_username: null }, { headers });
                                fetchStats();
                                fetchAgents(searchTerm || undefined);
                              }
                            }}
                          >
                            <Link2Off size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {agents.length === 0 && (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Aucun agent trouvé</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* AD Modal */}
      {showUnlinkedModal && (
        <div className="modal-overlay" onClick={() => { setShowUnlinkedModal(false); setAssociatingAgent(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 760 }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Monitor size={20} />
                {associatingAgent
                  ? `Associer un compte AD à ${associatingAgent.nom} ${associatingAgent.prenom}`
                  : 'Comptes AD non associés'}
              </h2>
              <button className="close-btn" onClick={() => { setShowUnlinkedModal(false); setAssociatingAgent(null); }}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <div style={{ position: 'relative', marginBottom: 14 }}>
                <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Filtrer les comptes AD…"
                  value={adSearchTerm}
                  onChange={(e) => setAdSearchTerm(e.target.value)}
                  style={{ width: '100%', padding: '8px 8px 8px 34px', borderRadius: 8, border: '1px solid #e2e8f0', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table className="stats-table">
                  <thead><tr><th>Nom</th><th>Compte (sAMAccount)</th><th>Email</th><th style={{ textAlign: 'center' }}>Action</th></tr></thead>
                  <tbody>
                    {filteredAD.map((u) => (
                      <tr key={u.sAMAccountName}>
                        <td className="font-bold">{u.displayName}</td>
                        <td className="font-mono text-xs">{u.sAMAccountName}</td>
                        <td className="text-xs">{u.mail || '-'}</td>
                        <td style={{ textAlign: 'center' }}>
                          {associatingAgent ? (
                            <button className="associate-btn" onClick={() => handleAssociate(associatingAgent.matricule, u.sAMAccountName)}>
                              <UserPlus size={13} /> Associer
                            </button>
                          ) : '—'}
                        </td>
                      </tr>
                    ))}
                    {filteredAD.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Aucun compte orphelin trouvé</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .studio-rh { animation: fadeIn .3s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

        .rh-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          flex-wrap: wrap; gap: 16px; margin-bottom: 28px;
        }
        .rh-title {
          font-size: 26px; font-weight: 900; color: #0f172a;
          display: flex; align-items: center; gap: 12px; margin: 0 0 4px;
        }
        .rh-title-icon {
          width: 44px; height: 44px; background: linear-gradient(135deg,#3b82f6,#6366f1);
          border-radius: 12px; display: flex; align-items: center; justify-content: center; color: white;
        }
        .rh-subtitle { color: #64748b; font-size: 14px; margin: 0; }
        .rh-header-actions { display: flex; gap: 10px; flex-wrap: wrap; }

        .rh-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 18px; border-radius: 10px; font-size: 13px;
          font-weight: 700; border: none; cursor: pointer; transition: all .2s;
          white-space: nowrap;
        }
        .rh-btn-ghost {
          background: #f1f5f9; color: #475569;
        }
        .rh-btn-ghost:hover { background: #e2e8f0; color: #1e293b; }
        .rh-btn-primary {
          background: linear-gradient(135deg,#3b82f6,#6366f1); color: white;
          box-shadow: 0 4px 12px #3b82f640;
        }
        .rh-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 16px #3b82f650; }
        .rh-btn-primary:disabled { opacity: .7; cursor: not-allowed; transform: none; }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .rh-banner {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 18px; border-radius: 12px; margin-bottom: 20px; font-weight: 600; font-size: 13px;
        }
        .rh-banner.success { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
        .rh-banner.error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
        .rh-banner button { margin-left: auto; background: none; border: none; cursor: pointer; color: inherit; opacity: .6; }

        .rh-stats-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px; margin-bottom: 24px;
        }
        .stat-card {
          background: white; border-radius: 14px; padding: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,.06);
          transition: all .2s; position: relative; overflow: hidden;
        }
        .stat-card.clickable { cursor: pointer; }
        .stat-card.clickable:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,.12); }
        .stat-value { font-size: 34px; font-weight: 900; line-height: 1; margin-bottom: 6px; }
        .stat-label { font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
        .stat-icon {
          width: 42px; height: 42px; border-radius: 10px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .stat-click-hint { margin-top: 10px; font-size: 11px; opacity: .6; font-weight: 600; }

        .rh-search-row {
          display: flex; gap: 12px; align-items: center; margin-bottom: 16px; flex-wrap: wrap;
        }
        .rh-search {
          flex: 1; min-width: 260px; position: relative;
        }
        .rh-search-icon {
          position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none;
        }
        .rh-search input {
          width: 100%; padding: 10px 36px 10px 38px; border-radius: 10px;
          border: 1.5px solid #e2e8f0; outline: none; font-size: 13px;
          background: white; box-sizing: border-box;
          transition: border-color .2s;
        }
        .rh-search input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px #3b82f620; }
        .rh-clear {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: #e2e8f0; border: none; border-radius: 50%; width: 20px; height: 20px;
          display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b;
        }

        .rh-badge {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 800;
        }
        .rh-badge-actif { background: #f0fdf4; color: #16a34a; }
        .rh-badge-parti { background: #fefce8; color: #854d0e; }

        .agent-left { opacity: .65; }
        .ad-linked { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; }
        .ad-unlinked { display: flex; align-items: center; gap: 6px; color: #94a3b8; font-size: 12px; font-style: italic; }
        .service-tag { background: #f1f5f9; padding: 2px 8px; border-radius: 4px; font-size: 11px; color: #475569; }

        .action-icon-btn {
          background: #f1f5f9; border: none; color: #64748b;
          padding: 6px; border-radius: 6px; cursor: pointer; transition: all .2s; margin: 0 2px;
        }
        .action-icon-btn:hover { background: #e2e8f0; color: #0f172a; }
        .action-icon-btn.delete:hover { background: #fee2e2; color: #ef4444; }

        .associate-btn {
          background: #3b82f6; color: white; border: none;
          padding: 5px 12px; border-radius: 6px; font-size: 11px; font-weight: 700;
          cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
          transition: background .2s;
        }
        .associate-btn:hover { background: #2563eb; }
      `}</style>
    </div>
  );
};

export default StudioRH;
