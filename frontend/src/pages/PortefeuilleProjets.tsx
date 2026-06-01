import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Plus, Search } from 'lucide-react';
import Header from '../components/Header';
import CreerProjetModal from '../components/projets/CreerProjetModal';
import { useADSearch } from '../utils/useADSearch';
import { useAuth } from '../contexts/AuthContext';
import { isSuperAdmin, isAdminLike } from '../utils/roles';

interface Projet {
  id: number; code: string; titre: string; statut: string;
  niveau_projet: string; service_pilote: string; priorite: number;
  score_total: number; avancement: number; meteo: string; date_modification: string;
  nb_roles: number; nb_documents: number; nb_reunions: number;
  nb_taches_en_retard: number; nb_jalons_en_retard: number;
  commanditaire_username?: string;   chef_projet_username?: string;
  chef_projet_display_name?: string;
  user_est_intervenant?: boolean;
  projet_parent_id?: number; app_names?: string;
  is_mini_projet?: boolean;
}

interface Stats {
  total: number; score_moyen: number; alertes_documentaires: number;
  alertes_retard: number;
  par_statut: { statut: string; count: number }[];
  par_service: { service_pilote: string; count: number }[];
  par_niveau: { niveau_projet: string; count: number }[];
  par_priorite: { priorite: number; count: number }[];
}

const STATUT_LABELS: Record<string, string> = {
  idee: 'Idée', demande_initiale: 'Demande initiale', etude_dsi: 'Étude DSI',
  arbitrage: 'Arbitrage', planification: 'Planification', en_cours: 'En cours',
  en_recette: 'En recette', en_cloture: 'En clôture', cloture: 'Clôturé',
  refuse: 'Refusé', suspendu: 'Suspendu', abandonne: 'Abandonné'
};

const STATUT_COLORS: Record<string, string> = {
  idee: '#94a3b8', demande_initiale: '#f59e0b', etude_dsi: '#3b82f6',
  arbitrage: '#8b5cf6', planification: '#06b6d4', en_cours: '#22c55e',
  en_recette: '#14b8a6', en_cloture: '#f97316', cloture: '#64748b',
  refuse: '#ef4444', suspendu: '#eab308', abandonne: '#6b7280'
};

const PortefeuilleProjets: React.FC = () => {
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [projets, setProjets] = useState<Projet[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState('');
  const [filtreService, setFiltreService] = useState('');
  const [filtreNiveau, setFiltreNiveau] = useState('');
  const [filtreChefProjet, setFiltreChefProjet] = useState('');
  const [recherche, setRecherche] = useState('');
  const [sortColumn, setSortColumn] = useState('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [favoris, setFavoris] = useState<number[]>([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [showPmoModal, setShowPmoModal] = useState(false);
  const [pmoView, setPmoView] = useState<'' | 'mine' | 'agents'>('');
  const [groupMode, setGroupMode] = useState<'implication' | 'chef_projet'>('implication');
  const [showAgentsModal, setShowAgentsModal] = useState(false);
  const isPMO = user?.est_pmo || isAdminLike(user);

  const fetchProjets = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtreStatut) params.set('statut', filtreStatut);
      if (filtreService) params.set('service_pilote', filtreService);
      if (filtreNiveau) params.set('niveau', filtreNiveau);
      if (filtreChefProjet) params.set('chef_projet', filtreChefProjet);
      if (recherche) params.set('q', recherche);
      if (sortColumn) params.set('tri', sortColumn);
      if (pmoView) params.set('pmo_view', pmoView);

      const url = `/api/projets?${params.toString()}`;

      const [res, resStats] = await Promise.all([
        fetch(url, { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/projets/stats', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const data = await res.json();
      const dataStats = await resStats.json();
      if (Array.isArray(data)) setProjets(data);
      setStats(dataStats);
    } catch (e) {
      console.error('Erreur chargement projets:', e);
    } finally {
      setLoading(false);
    }
  }, [token, filtreStatut, filtreService, filtreNiveau, filtreChefProjet, recherche, sortColumn, pmoView]);

  const fetchFavoris = useCallback(async () => {
    try {
      const r = await fetch('/api/projets/favoris', { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (Array.isArray(d)) setFavoris(d);
    } catch {}
  }, [token]);

  const toggleFavori = async (projetId: number, estFavori: boolean) => {
    if (estFavori) {
      await fetch(`/api/projets/${projetId}/favoris`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      setFavoris(favoris.filter(id => id !== projetId));
    } else {
      await fetch(`/api/projets/${projetId}/favoris`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      setFavoris([...favoris, projetId]);
    }
  };

  useEffect(() => { fetchProjets(); }, [fetchProjets]);
  useEffect(() => { fetchFavoris(); }, [fetchFavoris]);

  const username = user?.username || '';
  const niveauImplication = (p: Projet) => {
    if (p.commanditaire_username?.toLowerCase() === username.toLowerCase()) return 0;
    if (p.chef_projet_username?.toLowerCase() === username.toLowerCase()) return 1;
    if (p.user_est_intervenant) return 2;
    return 3;
  };

  const projetMap: Record<number, Projet> = {};
  const childrenMap: Record<number, Projet[]> = {};
  for (const p of projets) {
    projetMap[p.id] = p;
    if (p.projet_parent_id) {
      if (!childrenMap[p.projet_parent_id]) childrenMap[p.projet_parent_id] = [];
      childrenMap[p.projet_parent_id].push(p);
    }
  }

  const projetsTries = [...projets].sort((a, b) => {
    const aFav = favoris.includes(a.id) ? -1 : 0;
    const bFav = favoris.includes(b.id) ? -1 : 0;
    if (aFav !== bFav) return aFav - bFav;
    const impA = niveauImplication(a);
    const impB = niveauImplication(b);
    if (impA !== impB) return impA - impB;
    let cmp = 0;
    switch (sortColumn) {
      case 'titre':
        cmp = (a.titre || '').localeCompare(b.titre || '');
        break;
      case 'chef_projet':
        cmp = (a.chef_projet_display_name || a.chef_projet_username || '').localeCompare(b.chef_projet_display_name || b.chef_projet_username || '');
        break;
      case 'meteo': {
        const order: Record<string, number> = { soleil: 0, nuageux: 1, orage: 2 };
        cmp = (order[a.meteo] ?? -1) - (order[b.meteo] ?? -1);
        break;
      }
      case 'statut':
        cmp = Object.keys(STATUT_LABELS).indexOf(a.statut) - Object.keys(STATUT_LABELS).indexOf(b.statut);
        break;
      case 'service_pilote':
        cmp = (a.service_pilote || '').localeCompare(b.service_pilote || '');
        break;
      case 'priorite':
        cmp = (a.priorite || 0) - (b.priorite || 0);
        break;
      case 'score':
        cmp = (a.score_total || 0) - (b.score_total || 0);
        break;
      case 'avancement':
        cmp = (a.avancement || 0) - (b.avancement || 0);
        break;
      case 'alertes':
        cmp = ((a.nb_taches_en_retard || 0) + (a.nb_jalons_en_retard || 0)) - ((b.nb_taches_en_retard || 0) + (b.nb_jalons_en_retard || 0));
        break;
      default:
        cmp = (a.date_modification || '').localeCompare(b.date_modification || '');
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  // Compute parent_title for display (only for orphans whose parent is not in the list)
  const projetParentTitles: Record<number, string> = {};
  for (const p of projets) {
    if (p.projet_parent_id && !projetMap[p.projet_parent_id]) {
      const parent = projets.find(x => x.id === p.projet_parent_id);
      if (parent) projetParentTitles[p.id] = `${parent.code} — ${parent.titre}`;
    }
  }

  const servicesList = projets.length > 0 ? [...new Set(projets.map(p => p.service_pilote))].sort() : [];
  const chefsList = [...new Set(projets.filter(p => p.chef_projet_username).map(p => p.chef_projet_username))].sort() as string[];

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <span style={{ marginLeft: '4px', color: '#cbd5e1' }}>↕</span>;
    return <span style={{ marginLeft: '4px', color: '#2563eb' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  const thStyle = (col: string) => ({
    padding: '10px 16px',
    textAlign: col === 'meteo' || col === 'priorite' || col === 'score' || col === 'avancement' || col === 'alertes' || col === 'favoris' ? 'center' as const : 'left' as const,
    color: sortColumn === col ? '#2563eb' : '#475569',
    fontWeight: '700' as const,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    cursor: 'pointer',
    userSelect: 'none' as const,
    background: sortColumn === col ? '#eff6ff' : 'transparent',
    whiteSpace: 'nowrap' as const,
  });

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header />
      <div className="container" style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#1e293b', flex: 1 }}>
            📁 Portefeuille Projets
          </h1>
          <button onClick={() => setShowCreateModal(true)} style={{ padding: '10px 18px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={18} /> Nouveau projet
          </button>
        </div>

        {stats && typeof stats.total === 'number' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: 'white', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Total projets</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: '#1e293b' }}>{stats.total}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Score moyen</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: (stats.score_moyen || 0) >= 50 ? '#16a34a' : '#d97706' }}>{stats.score_moyen || 0}/100</div>
            </div>
            <div style={{ background: 'white', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Alertes docs</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: (stats.alertes_documentaires || 0) > 0 ? '#dc2626' : '#16a34a' }}>{stats.alertes_documentaires || 0}</div>
            </div>
            <div style={{ background: 'white', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>En retard</div>
              <div style={{ fontSize: '28px', fontWeight: '800', color: (stats.alertes_retard || 0) > 0 ? '#dc2626' : '#16a34a' }}>{stats.alertes_retard || 0}</div>
            </div>
            {(stats.par_statut || []).filter((s: any) => s.statut === 'en_cours').map((s: any) => (
              <div key={s.statut} style={{ background: 'white', borderRadius: '10px', padding: '16px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>En cours</div>
                <div style={{ fontSize: '28px', fontWeight: '800', color: '#22c55e' }}>{s.count}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input value={recherche} onChange={e => setRecherche(e.target.value)} placeholder="Rechercher un projet..." style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', background: 'white', outline: 'none' }} />
          </div>
          <select value={filtreStatut} onChange={e => setFiltreStatut(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', cursor: 'pointer' }}>
            <option value="">Tous statuts</option>
            {Object.entries(STATUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filtreService} onChange={e => setFiltreService(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', cursor: 'pointer' }}>
            <option value="">Tous services</option>
            {servicesList.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filtreNiveau} onChange={e => setFiltreNiveau(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', cursor: 'pointer' }}>
            <option value="">Tous niveaux</option>
            <option value="mineur">Mineur</option>
            <option value="standard">Standard</option>
            <option value="structurant">Structurant</option>
          </select>
          {isPMO && (
            <select value={filtreChefProjet} onChange={e => setFiltreChefProjet(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', cursor: 'pointer' }}>
              <option value="">Tous chefs de projet</option>
              {chefsList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          {isPMO && (
            <button onClick={() => setShowAdminModal(true)} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontWeight: '600', fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ⚙️ Admin générale
            </button>
          )}
          {isPMO && (
            <button onClick={() => navigate('/revue-de-projets')} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontWeight: '600', fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
              📋 Revue de projets
            </button>
          )}
          {isSuperAdmin(user) && (
            <button onClick={() => setShowPmoModal(true)} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontWeight: '600', fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
              👥 Gestion des PMO
            </button>
          )}
          {user?.est_pmo && (
            <button onClick={() => setShowAgentsModal(true)} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontWeight: '600', fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
              🧑‍🤝‍🧑 Mes agents
            </button>
          )}
          {user?.est_pmo && (
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px', gap: '2px' }}>
              {([['', '📁 Tous'], ['mine', '🙋 Mes projets'], ['agents', '👥 Mes agents']] as [string, string][]).map(([val, label]) => (
                <button key={val} onClick={() => setPmoView(val as '' | 'mine' | 'agents')} style={{
                  padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                  background: pmoView === val ? 'white' : 'transparent', color: pmoView === val ? '#2563eb' : '#64748b',
                  boxShadow: pmoView === val ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                }}>{label}</button>
              ))}
            </div>
          )}
          {/* Toggle regroupement */}
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px', gap: '2px' }}>
            {([['implication', '📊 Par implication'], ['chef_projet', '👨‍💼 Par chef de projet']] as [string, string][]).map(([val, label]) => (
              <button key={val} onClick={() => setGroupMode(val as 'implication' | 'chef_projet')} style={{
                padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600',
                background: groupMode === val ? 'white' : 'transparent', color: groupMode === val ? '#2563eb' : '#64748b',
                boxShadow: groupMode === val ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}>{label}</button>
            ))}
          </div>
        </div>

        {loading ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '60px' }}>Chargement...</p>
        ) : projets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <FolderOpen size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
            <p style={{ color: '#94a3b8', fontSize: '16px' }}>Aucun projet trouvé.</p>
          </div>
        ) : groupMode === 'chef_projet' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {(() => {
              const grouped: Record<string, Projet[]> = {};
              for (const p of projetsTries) {
                const key = p.chef_projet_display_name || p.chef_projet_username || '__none__';
                if (!grouped[key]) grouped[key] = [];
                grouped[key].push(p);
              }
              const keys = Object.keys(grouped).sort((a, b) => {
                if (a === '__none__') return 1;
                if (b === '__none__') return -1;
                return a.localeCompare(b);
              });
              return keys.map(key => {
                const projets = grouped[key];
                const items = projets.map(p => ({ projet: p, isChild: false }));
                const chefLabel = key === '__none__' ? '— Non assigné' : key;
                return (
                  <div key={key}>
                    <div style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', borderRadius: '8px 8px 0 0' }}>
                      👨‍💼 {chefLabel} ({items.length})
                    </div>
                    <div style={{ background: 'white', borderRadius: '0 0 8px 8px', overflow: 'hidden', border: '1px solid #e2e8f0', borderTop: 'none' }}>
                      <ProjetTable items={items} favoris={favoris} projetMap={projetMap} projetParentTitles={projetParentTitles} childrenMap={childrenMap} thStyle={thStyle} SortIcon={SortIcon} handleSort={handleSort} navigate={navigate} toggleFavori={toggleFavori} />
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {([[-1, '⭐ Mes projets favoris'], [0, '🏆 En tant que commanditaire'], [1, '👨‍💼 En tant que chef de projet'], [2, '📋 Projets dans lesquels j\'ai un rôle'], [3, '📁 Autres projets']] as [number, string][]).map(([niveau, label]) => {
              const rootItems = projetsTries.filter(p => {
                const imp = niveauImplication(p);
                if (niveau === -1) {
                  if (!favoris.includes(p.id)) return false;
                  if (p.projet_parent_id && favoris.includes(p.projet_parent_id)) return false;
                  return true;
                }
                if (p.projet_parent_id && projetMap[p.projet_parent_id]) return false;
                return imp === niveau;
              });
              if (rootItems.length === 0) return null;
              const items = rootItems.flatMap(p => {
                const children = childrenMap[p.id] || [];
                return [{ projet: p, isChild: false } as const, ...children.map(c => ({ projet: c, isChild: true } as const))];
              });
              return (
                <div key={niveau}>
                  <div style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', borderRadius: '8px 8px 0 0', marginTop: niveau > 0 ? '12px' : 0 }}>
                    {label} ({items.length})
                  </div>
                  <div style={{ background: 'white', borderRadius: niveau > 0 ? '0 0 8px 8px' : '0', overflow: 'hidden', border: '1px solid #e2e8f0', borderTop: 'none' }}>
                    <ProjetTable items={items} favoris={favoris} projetMap={projetMap} projetParentTitles={projetParentTitles} childrenMap={childrenMap} thStyle={thStyle} SortIcon={SortIcon} handleSort={handleSort} navigate={navigate} toggleFavori={toggleFavori} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <CreerProjetModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => { setShowCreateModal(false); navigate(`/projets/${id}`); }}
          token={token}
        />
      </div>

      {/* Modale Admin générale */}
      {showAdminModal && (
        <AdminGeneraleModal token={token} onClose={() => setShowAdminModal(false)} />
      )}

      {/* Modale Gestion des PMO */}
      {showPmoModal && (
        <GestionPmoModal token={token} onClose={() => setShowPmoModal(false)} />
      )}

      {/* Modale Mes Agents (pour PMO) */}
      {showAgentsModal && (
        <MesAgentsModal token={token} onClose={() => setShowAgentsModal(false)} />
      )}
    </div>
  );
};

interface ProjetTableProps {
  items: { projet: Projet; isChild: boolean }[];
  favoris: number[];
  projetMap: Record<number, Projet>;
  projetParentTitles: Record<number, string>;
  childrenMap: Record<number, Projet[]>;
  thStyle: (col: string) => React.CSSProperties;
  SortIcon: React.FC<{ column: string }>;
  handleSort: (column: string) => void;
  navigate: (path: string) => void;
  toggleFavori: (projetId: number, estFavori: boolean) => void;
}
const ProjetTable: React.FC<ProjetTableProps> = ({ items, favoris, navigate, toggleFavori }) => (
  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
    <thead>
      <tr style={{ background: '#f8fafc' }}>
        <th style={{ padding: '10px 16px', textAlign: 'left', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}>Projet</th>
        <th style={{ padding: '10px 16px', textAlign: 'left', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}>Chef de projet</th>
        <th style={{ padding: '10px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Météo</th>
        <th style={{ padding: '10px 16px', textAlign: 'left', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}>Statut</th>
        <th style={{ padding: '10px 16px', textAlign: 'left', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Service</th>
        <th style={{ padding: '10px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Priorité</th>
        <th style={{ padding: '10px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Score</th>
        <th style={{ padding: '10px 16px', textAlign: 'left', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Avancement</th>
        <th style={{ padding: '10px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>⚠️</th>
        <th style={{ padding: '10px 16px', textAlign: 'center', cursor: 'default', width: '40px', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>⭐</th>
      </tr>
    </thead>
    <tbody>
      {items.map(({ projet: p, isChild }) => (
        <tr key={p.id} onClick={() => navigate(`/projets/${p.id}`)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: favoris.includes(p.id) ? '#fffbeb' : 'transparent' }}
          onMouseEnter={e => (e.currentTarget.style.background = favoris.includes(p.id) ? '#fef3c7' : '#f8fafc')}
          onMouseLeave={e => (e.currentTarget.style.background = favoris.includes(p.id) ? '#fffbeb' : 'transparent')}>
          <td style={{ padding: '12px 16px' }}>
            <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '13px', paddingLeft: isChild ? '20px' : '0', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {isChild && <span style={{ marginRight: '6px', color: '#94a3b8' }}>↳</span>}
              {p.titre}
              {p.is_mini_projet && (
                <span style={{ fontSize: '10px', fontWeight: '600', padding: '1px 6px', borderRadius: '4px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>mini</span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>{p.code}</div>
            {p.app_names && <div style={{ fontSize: '10px', color: '#2563eb', marginTop: '2px' }}>📱 {p.app_names}</div>}
          </td>
          <td style={{ padding: '12px 16px', color: '#475569', fontSize: '13px' }}>{p.chef_projet_display_name || p.chef_projet_username || '—'}</td>
          <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '18px' }}>
            {p.meteo === 'soleil' ? '☀️' : p.meteo === 'nuageux' ? '⛅' : p.meteo === 'orage' ? '⛈️' : '➖'}
          </td>
          <td style={{ padding: '12px 16px' }}>
            <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: '600', background: `${STATUT_COLORS[p.statut] || '#94a3b8'}20`, color: STATUT_COLORS[p.statut] || '#94a3b8' }}>
              {STATUT_LABELS[p.statut] || p.statut}
            </span>
          </td>
          <td style={{ padding: '12px 16px', color: '#475569', fontSize: '13px' }}>{p.service_pilote}</td>
          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
            {p.priorite > 0 ? (
              <span style={{ fontWeight: '700', color: p.priorite >= 4 ? '#dc2626' : p.priorite >= 3 ? '#d97706' : '#16a34a', fontSize: '13px' }}>
                {'★'.repeat(Math.max(1, Math.min(p.priorite, 5)))}{'☆'.repeat(Math.max(0, 5 - Math.max(1, Math.min(p.priorite, 5))))}
              </span>
            ) : <span style={{ color: '#cbd5e1' }}>—</span>}
          </td>
          <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '700', color: p.score_total >= 50 ? '#16a34a' : p.score_total >= 30 ? '#d97706' : '#dc2626', fontSize: '13px' }}>{p.score_total}</td>
          <td style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ flex: 1, height: '5px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${p.avancement}%`, height: '100%', background: p.avancement >= 80 ? '#22c55e' : p.avancement >= 40 ? '#3b82f6' : '#f59e0b', borderRadius: '3px' }} />
              </div>
              <span style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', minWidth: '30px' }}>{p.avancement}%</span>
            </div>
          </td>
          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
            {(p.nb_taches_en_retard > 0 || p.nb_jalons_en_retard > 0) ? (
              <span style={{ fontSize: '14px', cursor: 'pointer' }} title={
                (p.nb_taches_en_retard > 0 ? `${p.nb_taches_en_retard} tâche(s)` : '') +
                (p.nb_taches_en_retard > 0 && p.nb_jalons_en_retard > 0 ? ' et ' : '') +
                (p.nb_jalons_en_retard > 0 ? `${p.nb_jalons_en_retard} jalon(s)` : '') +
                ' en retard'
              }>⚠️</span>
            ) : <span style={{ color: '#e2e8f0' }}>—</span>}
          </td>
          <td style={{ padding: '12px 16px', textAlign: 'center' }}>
            <span onClick={e => { e.stopPropagation(); toggleFavori(p.id, favoris.includes(p.id)); }} style={{ cursor: 'pointer', fontSize: '16px' }}>
              {favoris.includes(p.id) ? '⭐' : '☆'}
            </span>
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

interface AdminModalProps { token: string | null; onClose: () => void; }
const AdminGeneraleModal: React.FC<AdminModalProps> = ({ token, onClose }) => {
  const [scoringConfig, setScoringConfig] = useState<any[]>([]);
  const [docTypes, setDocTypes] = useState<any[]>([]);
  const [tab, setTab] = useState('scoring');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/projets/admin/scoring-config', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => { if (Array.isArray(d)) setScoringConfig(d); }).catch(() => {}),
      fetch('/api/projets/admin/types-documentaires', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => { if (Array.isArray(d)) setDocTypes(d); }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [token]);

  const saveScoring = async () => {
    await fetch('/api/projets/admin/scoring-config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ criteres: scoringConfig })
    });
  };
  const saveDocTypes = async () => {
    await fetch('/api/projets/admin/types-documentaires', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ types: docTypes })
    });
  };

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '90%', maxWidth: '700px', maxHeight: '90vh', overflow: 'auto', padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '95%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>⚙️ Administration générale</h2>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ display: 'flex', gap: '2px', borderBottom: '2px solid #e2e8f0', padding: '0 24px' }}>
          {[
            { key: 'scoring', label: '📊 Scoring' },
            { key: 'docTypes', label: '📄 Types docs' }
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '10px 18px', border: 'none', borderBottom: tab === t.key ? '2px solid #2563eb' : '2px solid transparent',
              background: tab === t.key ? '#eff6ff' : 'transparent', cursor: 'pointer', fontWeight: tab === t.key ? '700' : '500',
              color: tab === t.key ? '#2563eb' : '#64748b', fontSize: '13px', marginBottom: '-2px'
            }}>{t.label}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {tab === 'scoring' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                <button onClick={saveScoring} style={{ padding: '7px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>💾 Enregistrer</button>
              </div>
              {scoringConfig.map((c: any, i: number) => (
                <div key={c.critere} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ minWidth: '180px', fontSize: '13px', color: '#1e293b', fontWeight: '500' }}>{c.label}</span>
                  <input value={c.poids} onChange={e => { const n = [...scoringConfig]; n[i] = { ...n[i], poids: parseInt(e.target.value) || 0 }; setScoringConfig(n); }}
                    type="number" min="0" max="100" style={{ width: '60px', padding: '5px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '13px', textAlign: 'center' }} />
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>%</span>
                  <label style={{ marginLeft: 'auto', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}>
                    <input type="checkbox" checked={c.actif} onChange={e => { const n = [...scoringConfig]; n[i] = { ...n[i], actif: e.target.checked ? 1 : 0 }; setScoringConfig(n); }} /> Actif
                  </label>
                </div>
              ))}
              <div style={{ marginTop: '12px', padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', fontSize: '12px', color: '#64748b' }}>
                Total : {scoringConfig.reduce((s: number, c: any) => s + (c.poids || 0), 0)}/100
              </div>
            </div>
          )}
          {tab === 'docTypes' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                <button onClick={saveDocTypes} style={{ padding: '7px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>💾 Enregistrer</button>
              </div>
              {docTypes.map((t: any, i: number) => (
                <div key={t.code} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ minWidth: '120px', fontSize: '12px', color: '#94a3b8' }}>{t.code}</span>
                  <input value={t.label} onChange={e => { const n = [...docTypes]; n[i] = { ...n[i], label: e.target.value }; setDocTypes(n); }} style={{ flex: 1, padding: '5px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                  <label style={{ fontSize: '12px', color: '#64748b', cursor: 'pointer' }}>
                    <input type="checkbox" checked={t.obligatoire} onChange={e => { const n = [...docTypes]; n[i] = { ...n[i], obligatoire: e.target.checked ? 1 : 0 }; setDocTypes(n); }} /> Obligatoire
                  </label>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface GestionPmoModalProps { token: string | null; onClose: () => void; }
const GestionPmoModal: React.FC<GestionPmoModalProps> = ({ token, onClose }) => {
  const [pmoUsers, setPmoUsers] = useState<any[]>([]);
  const ad = useADSearch(token);
  const [loading, setLoading] = useState(true);

  const fetchPmos = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/pmo/list', { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      if (Array.isArray(data)) setPmoUsers(data);
    } catch (e) {
      console.error('Erreur chargement PMO:', e);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    fetchPmos().finally(() => setLoading(false));
  }, [fetchPmos]);

  const togglePmo = async (username: string, isPmo: boolean) => {
    try {
      await fetch('/api/admin/pmo/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username, is_pmo: isPmo })
      });
      await fetchPmos();
    } catch (e) {
      console.error('Erreur toggle PMO:', e);
    }
  };

  if (loading) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '90%', maxWidth: '500px', maxHeight: '90vh', overflow: 'auto', padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>
    </div>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '95%', maxWidth: '500px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>👥 Gestion des PMO</h2>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          <div style={{ marginBottom: '16px', position: 'relative' }}>
            <input value={ad.query} onChange={e => ad.setQuery(e.target.value)} placeholder="Rechercher un utilisateur AD..." style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', background: 'white', outline: 'none', boxSizing: 'border-box' }} />
            {ad.searching && <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#94a3b8' }}>...</span>}
            {ad.results.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', zIndex: 10, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                {ad.results.map((u: any) => (
                  <div key={u.username} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <span style={{ fontSize: '13px', color: '#1e293b' }}>{u.displayName || u.username}</span>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{u.email}{u.service ? ` — ${u.service}` : ''}</div>
                    </div>
                    <button onClick={() => togglePmo(u.username, true)} style={{ padding: '4px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '11px' }}>Désigner PMO</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ fontSize: '13px', fontWeight: '700', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>PMO actuels ({pmoUsers.length})</div>
          {pmoUsers.length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '13px' }}>Aucun PMO désigné.</p>
          ) : (
            pmoUsers.map((u: any) => (
              <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: '13px', color: '#1e293b' }}>{u.username}</span>
                <button onClick={() => togglePmo(u.username, false)} style={{ padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '11px' }}>Retirer</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

interface MesAgentsModalProps { token: string | null; onClose: () => void; }
const MesAgentsModal: React.FC<MesAgentsModalProps> = ({ token, onClose }) => {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [orgUnits, setOrgUnits] = useState<{ directions: any[]; services: any[]; secteurs: any[] }>({ directions: [], services: [], secteurs: [] });
  const [tab, setTab] = useState<'direct' | 'org'>('direct');
  const agentAd = useADSearch(token);
  const [selectedOrgType, setSelectedOrgType] = useState<'service' | 'secteur' | 'direction'>('service');
  const [selectedOrgCode, setSelectedOrgCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetch('/api/projets/pmo/agents', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => { if (Array.isArray(d)) setAssignments(d); }).catch(() => {}),
      fetch('/api/projets/pmo/org-units', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => { if (d?.directions) setOrgUnits(d); }).catch(() => {})
    ]);
    setLoading(false);
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addDirect = async (username: string) => {
    setSaving(true);
    try {
      await fetch('/api/projets/pmo/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agent_username: username })
      });
      agentAd.setQuery(''); agentAd.clearResults();
      await fetchAll();
    } catch {} finally { setSaving(false); }
  };

  const addOrg = async () => {
    if (!selectedOrgCode) return;
    setSaving(true);
    try {
      const body: any = {};
      if (selectedOrgType === 'service') body.service_code = selectedOrgCode;
      else if (selectedOrgType === 'secteur') body.secteur_code = selectedOrgCode;
      else body.direction_code = selectedOrgCode;
      await fetch('/api/projets/pmo/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      setSelectedOrgCode('');
      await fetchAll();
    } catch {} finally { setSaving(false); }
  };

  const remove = async (id: number) => {
    await fetch(`/api/projets/pmo/agents/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    await fetchAll();
  };

  const directAssignments = assignments.filter(a => a.agent_username && !a.service_code && !a.secteur_code && !a.direction_code);
  const orgAssignments = assignments.filter(a => a.service_code || a.secteur_code || a.direction_code);

  const getOrgLabel = (a: any) => {
    if (a.service_code) {
      const s = orgUnits.services.find(x => x.code === a.service_code);
      return `Service : ${s?.label || a.service_code}`;
    }
    if (a.secteur_code) {
      const s = orgUnits.secteurs.find(x => x.code === a.secteur_code);
      return `Secteur : ${s?.label || a.secteur_code}`;
    }
    if (a.direction_code) {
      const d = orgUnits.directions.find(x => x.code === a.direction_code);
      return `Direction : ${d?.label || a.direction_code}`;
    }
    return '—';
  };

  const orgOptions = selectedOrgType === 'service' ? orgUnits.services
    : selectedOrgType === 'secteur' ? orgUnits.secteurs
    : orgUnits.directions;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '95%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>🧑‍🤝‍🧑 Mes agents</h2>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ display: 'flex', gap: '2px', borderBottom: '2px solid #e2e8f0', padding: '0 24px' }}>
          {[['direct', '👤 Agents directs'], ['org', '🏢 Unités org.']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k as 'direct' | 'org')} style={{
              padding: '10px 18px', border: 'none', borderBottom: tab === k ? '2px solid #2563eb' : '2px solid transparent',
              background: tab === k ? '#eff6ff' : 'transparent', cursor: 'pointer', fontWeight: tab === k ? '700' : '500',
              color: tab === k ? '#2563eb' : '#64748b', fontSize: '13px', marginBottom: '-2px'
            }}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {loading ? <p style={{ color: '#94a3b8', textAlign: 'center' }}>Chargement...</p> : (
            <>
              {tab === 'direct' && (
                <>
                  <div style={{ marginBottom: '16px', position: 'relative' }}>
                    <input value={agentAd.query} onChange={e => agentAd.setQuery(e.target.value)} placeholder="Rechercher un agent AD..."
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }} />
                    {agentAd.searching && <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#94a3b8' }}>...</span>}
                    {agentAd.results.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', zIndex: 10, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                        {agentAd.results.map((u: any) => (
                          <div key={u.username} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                            <div>
                              <span style={{ fontSize: '13px', color: '#1e293b' }}>{u.displayName || u.username}</span>
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{u.email}{u.service ? ` — ${u.service}` : ''}</div>
                            </div>
                            <button onClick={() => addDirect(u.username)} disabled={saving}
                              style={{ padding: '4px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '11px' }}>Ajouter</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Agents désignés ({directAssignments.length})</div>
                  {directAssignments.length === 0 ? (
                    <p style={{ color: '#94a3b8', fontSize: '13px' }}>Aucun agent direct.</p>
                  ) : directAssignments.map((a: any) => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: '13px', color: '#1e293b' }}>{a.agent_username}</span>
                      <button onClick={() => remove(a.id)} style={{ padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '11px' }}>Retirer</button>
                    </div>
                  ))}
                </>
              )}
              {tab === 'org' && (
                <>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <select value={selectedOrgType} onChange={e => { setSelectedOrgType(e.target.value as any); setSelectedOrgCode(''); }}
                      style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white' }}>
                      <option value="service">Service</option>
                      <option value="secteur">Secteur</option>
                      <option value="direction">Direction</option>
                    </select>
                    <select value={selectedOrgCode} onChange={e => setSelectedOrgCode(e.target.value)}
                      style={{ flex: 1, padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white' }}>
                      <option value="">-- Choisir --</option>
                      {orgOptions.map((o: any) => <option key={o.code} value={o.code}>{o.label}</option>)}
                    </select>
                    <button onClick={addOrg} disabled={!selectedOrgCode || saving}
                      style={{ padding: '8px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', opacity: !selectedOrgCode ? 0.5 : 1 }}>Ajouter</button>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase' }}>Unités assignées ({orgAssignments.length})</div>
                  {orgAssignments.length === 0 ? (
                    <p style={{ color: '#94a3b8', fontSize: '13px' }}>Aucune unité organisationnelle.</p>
                  ) : orgAssignments.map((a: any) => (
                    <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                      <span style={{ fontSize: '13px', color: '#1e293b' }}>{getOrgLabel(a)}</span>
                      <button onClick={() => remove(a.id)} style={{ padding: '4px 10px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '11px' }}>Retirer</button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortefeuilleProjets;
