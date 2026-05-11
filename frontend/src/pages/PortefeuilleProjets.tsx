import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Plus, Search } from 'lucide-react';
import Header from '../components/Header';
import CreerProjetModal from '../components/projets/CreerProjetModal';
import { useAuth } from '../contexts/AuthContext';

interface Projet {
  id: number; code: string; titre: string; statut: string;
  niveau_projet: string; service_pilote: string; priorite: number;
  score_total: number; avancement: number; meteo: string; date_modification: string;
  nb_roles: number; nb_documents: number; nb_reunions: number;
  nb_taches_en_retard: number; nb_jalons_en_retard: number;
  commanditaire_username?: string; chef_projet_username?: string;
  user_est_intervenant?: boolean;
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
  const [tri, setTri] = useState('date');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [favoris, setFavoris] = useState<number[]>([]);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const isPMO = user?.est_pmo || user?.role === 'admin';

  const fetchProjets = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtreStatut) params.set('statut', filtreStatut);
      if (filtreService) params.set('service_pilote', filtreService);
      if (filtreNiveau) params.set('niveau', filtreNiveau);
      if (filtreChefProjet) params.set('chef_projet', filtreChefProjet);
      if (recherche) params.set('q', recherche);
      if (tri) params.set('tri', tri);

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
  }, [token, filtreStatut, filtreService, filtreNiveau, filtreChefProjet, recherche, tri]);

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

  const projetsTries = [...projets].sort((a, b) => {
    const aFav = favoris.includes(a.id) ? -1 : 0;
    const bFav = favoris.includes(b.id) ? -1 : 0;
    if (aFav !== bFav) return aFav - bFav;
    const impA = niveauImplication(a);
    const impB = niveauImplication(b);
    if (impA !== impB) return impA - impB;
    return 0;
  });

  const servicesList = projets.length > 0 ? [...new Set(projets.map(p => p.service_pilote))].sort() : [];
  const chefsList = [...new Set(projets.filter(p => p.chef_projet_username).map(p => p.chef_projet_username))].sort() as string[];

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
          <select value={tri} onChange={e => setTri(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', cursor: 'pointer' }}>
            <option value="date">Date ▼</option>
            <option value="score">Score ▼</option>
            <option value="priorite">Priorité ▼</option>
            <option value="statut">Statut</option>
          </select>
          {isPMO && (
            <button onClick={() => setShowAdminModal(true)} style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontWeight: '600', fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
              ⚙️ Admin générale
            </button>
          )}
        </div>

        {loading ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '60px' }}>Chargement...</p>
        ) : projets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <FolderOpen size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
            <p style={{ color: '#94a3b8', fontSize: '16px' }}>Aucun projet trouvé.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {([[-1, '⭐ Mes projets favoris'], [0, '🏆 En tant que commanditaire'], [1, '👨‍💼 En tant que chef de projet'], [2, '📋 Projets dans lesquels j\'ai un rôle'], [3, '📁 Autres projets']] as [number, string][]).map(([niveau, label]) => {
              const filtered = projetsTries.filter(p => {
                const imp = niveauImplication(p);
                if (niveau === -1) return favoris.includes(p.id);
                return imp === niveau;
              });
              if (filtered.length === 0) return null;
              const items = filtered;
              if (items.length === 0) return null;
              return (
                <div key={niveau}>
                  <div style={{ padding: '10px 16px', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', borderRadius: '8px 8px 0 0', marginTop: niveau > 0 ? '12px' : 0 }}>
                    {label} ({items.length})
                  </div>
                  <div style={{ background: 'white', borderRadius: niveau > 0 ? '0 0 8px 8px' : '0', overflow: 'hidden', border: '1px solid #e2e8f0', borderTop: 'none' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc' }}>
                          <th style={{ padding: '10px 16px', textAlign: 'left', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Projet</th>
                          <th style={{ padding: '10px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', width: '60px' }}>Météo</th>
                          <th style={{ padding: '10px 16px', textAlign: 'left', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Statut</th>
                          <th style={{ padding: '10px 16px', textAlign: 'left', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Service</th>
                          <th style={{ padding: '10px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Priorité</th>
                          <th style={{ padding: '10px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Score</th>
                          <th style={{ padding: '10px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase' }}>Avancement</th>
                          <th style={{ padding: '10px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', width: '40px' }}>⚠️</th>
                          <th style={{ padding: '10px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', width: '40px' }}>⭐</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(p => (
                          <tr key={p.id} onClick={() => navigate(`/projets/${p.id}`)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: favoris.includes(p.id) ? '#fffbeb' : 'transparent' }}
                            onMouseEnter={e => (e.currentTarget.style.background = favoris.includes(p.id) ? '#fef3c7' : '#f8fafc')}
                            onMouseLeave={e => (e.currentTarget.style.background = favoris.includes(p.id) ? '#fffbeb' : 'transparent')}>
                            <td style={{ padding: '12px 16px' }}>
                              <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '13px' }}>{p.titre}</div>
                              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{p.code}</div>
                            </td>
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
                                  {'★'.repeat(p.priorite)}{'☆'.repeat(5 - p.priorite)}
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
    </div>
  );
};

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

export default PortefeuilleProjets;
