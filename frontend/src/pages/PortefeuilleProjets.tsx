import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Plus, Search, Star } from 'lucide-react';
import Header from '../components/Header';
import CreerProjetModal from '../components/projets/CreerProjetModal';
import { useAuth } from '../contexts/AuthContext';

interface Projet {
  id: number; code: string; titre: string; statut: string;
  niveau_projet: string; service_pilote: string; priorite: number;
  score_total: number; avancement: number; meteo: string; date_modification: string;
  nb_roles: number; nb_documents: number; nb_reunions: number;
}

interface Stats {
  total: number; score_moyen: number; alertes_documentaires: number;
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
  const { token } = useAuth();
  const [projets, setProjets] = useState<Projet[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtreStatut, setFiltreStatut] = useState('');
  const [filtreService, setFiltreService] = useState('');
  const [filtreNiveau, setFiltreNiveau] = useState('');
  const [recherche, setRecherche] = useState('');
  const [modeMesProjets, setModeMesProjets] = useState(false);
  const [tri, setTri] = useState('date');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [favoris, setFavoris] = useState<number[]>([]);

  const fetchProjets = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filtreStatut) params.set('statut', filtreStatut);
      if (filtreService) params.set('service_pilote', filtreService);
      if (filtreNiveau) params.set('niveau', filtreNiveau);
      if (recherche) params.set('q', recherche);
      if (tri) params.set('tri', tri);

      const url = modeMesProjets
        ? '/api/projets/mes-projets'
        : `/api/projets?${params.toString()}`;

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
  }, [token, filtreStatut, filtreService, filtreNiveau, recherche, tri, modeMesProjets]);

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

  const projetsTries = [...projets].sort((a, b) => {
    const aFav = favoris.includes(a.id) ? 0 : 1;
    const bFav = favoris.includes(b.id) ? 0 : 1;
    return aFav - bFav;
  });

  const servicesList = projets.length > 0 ? [...new Set(projets.map(p => p.service_pilote))].sort() : [];

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
          <select value={tri} onChange={e => setTri(e.target.value)} style={{ padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', cursor: 'pointer' }}>
            <option value="date">Date ▼</option>
            <option value="score">Score ▼</option>
            <option value="priorite">Priorité ▼</option>
            <option value="statut">Statut</option>
          </select>
          <button onClick={() => { setModeMesProjets(!modeMesProjets); }} style={{ padding: '9px 16px', borderRadius: '8px', border: modeMesProjets ? '2px solid #2563eb' : '1px solid #e2e8f0', background: modeMesProjets ? '#eff6ff' : 'white', cursor: 'pointer', fontWeight: '600', fontSize: '13px', color: modeMesProjets ? '#2563eb' : '#64748b' }}>
            📋 Mes projets
          </button>
        </div>

        {loading ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: '60px' }}>Chargement...</p>
        ) : projets.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
            <FolderOpen size={48} color="#cbd5e1" style={{ marginBottom: '16px' }} />
            <p style={{ color: '#94a3b8', fontSize: '16px' }}>Aucun projet trouvé.</p>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: '700', fontSize: '12px', textTransform: 'uppercase' }}>Projet</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '12px', textTransform: 'uppercase', width: '60px' }}>Météo</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: '700', fontSize: '12px', textTransform: 'uppercase' }}>Statut</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', color: '#475569', fontWeight: '700', fontSize: '12px', textTransform: 'uppercase' }}>Service</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '12px', textTransform: 'uppercase' }}>Priorité</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '12px', textTransform: 'uppercase' }}>Score</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '12px', textTransform: 'uppercase' }}>Avancement</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center', color: '#475569', fontWeight: '700', fontSize: '12px', textTransform: 'uppercase', width: '40px' }}>⭐</th>
                </tr>
              </thead>
              <tbody>
                {projetsTries.map(p => (
                  <tr key={p.id} onClick={() => navigate(`/projets/${p.id}`)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: favoris.includes(p.id) ? '#fffbeb' : 'transparent' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ fontWeight: '700', color: '#1e293b' }}>{p.titre}</div>
                      <div style={{ fontSize: '12px', color: '#94a3b8' }}>{p.code}</div>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: '20px' }}>
                      {p.meteo === 'soleil' ? '☀️' : p.meteo === 'nuageux' ? '⛅' : p.meteo === 'orage' ? '⛈️' : '➖'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: `${STATUT_COLORS[p.statut] || '#94a3b8'}20`, color: STATUT_COLORS[p.statut] || '#94a3b8' }}>
                        {STATUT_LABELS[p.statut] || p.statut}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#475569' }}>{p.service_pilote}</td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      {p.priorite > 0 ? (
                        <span style={{ fontWeight: '700', color: p.priorite >= 4 ? '#dc2626' : p.priorite >= 3 ? '#d97706' : '#16a34a' }}>
                          {'★'.repeat(p.priorite)}{'☆'.repeat(5 - p.priorite)}
                        </span>
                      ) : (
                        <span style={{ color: '#cbd5e1' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: '700', color: p.score_total >= 50 ? '#16a34a' : p.score_total >= 30 ? '#d97706' : '#dc2626' }}>{p.score_total}</td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', background: '#e2e8f0', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${p.avancement}%`, height: '100%', background: p.avancement >= 80 ? '#22c55e' : p.avancement >= 40 ? '#3b82f6' : '#f59e0b', borderRadius: '3px', transition: 'width 0.3s' }} />
                        </div>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', minWidth: '35px' }}>{p.avancement}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <span onClick={e => { e.stopPropagation(); toggleFavori(p.id, favoris.includes(p.id)); }} style={{ cursor: 'pointer', fontSize: '18px' }}>
                      {favoris.includes(p.id) ? '⭐' : '☆'}
                    </span>
                  </td>
                </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <CreerProjetModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreated={(id) => { setShowCreateModal(false); navigate(`/projets/${id}`); }}
          token={token}
        />
      </div>
    </div>
  );
};

export default PortefeuilleProjets;
