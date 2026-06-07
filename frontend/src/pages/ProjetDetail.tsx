import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useADSearch } from '../utils/useADSearch';
import type { ADUser } from '../utils/useADSearch';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, MessageSquare, Calendar, BarChart3, Settings, Activity, Upload, UserPlus, ArrowRight, Plus, Trash2, CheckCircle2, ListChecks, X, Users } from 'lucide-react';
import Header from '../components/Header';
import CreateReunionModal from '../components/CreateReunionModal';
import ReunionDetailModal from '../components/ReunionDetailModal';
import AddTaskModal from '../components/AddTaskModal';
import { useAuth } from '../contexts/AuthContext';
import { isSuperAdmin, isAdminLike } from '../utils/roles';

interface Projet {
  id: number; code: string; titre: string; description: string;
  niveau_projet: string; statut: string; statut_precedent: string;
  service_pilote: string; commanditaire_username: string;
  chef_projet_username: string; responsable_dsi_username: string;
  representant_metier_username: string; dpo_username: string;
  date_debut_prevue: string; date_fin_prevue: string;
  date_debut_reelle: string; date_fin_reelle: string;
  priorite: number; score_total: number; avancement: number;
  risque_global: string; satisfaction_metier: number;
  benefices_attendus: string; benefices_realises: string;
  notes_internes: string; date_creation: string;
  created_by_username: string; meteo: string;
  services: { service_code: string }[];
  roles: { id: number; username: string; role: string; display_name: string; email: string }[];
  visibilite: { id: number; username: string; display_name: string }[];
  documents: any[];
  chef_projet_metier_username?: string;
  dpd_requis?: boolean | number;
  rssi_requis?: boolean | number;
  chef_projet_display_name?: string;
  chef_projet_metier_display_name?: string;
  commanditaire_display_name?: string;
  projet_parent_id?: number;
  projet_parent?: { id: number; code: string; titre: string };
  applications?: { id: number; projet_id: number; app_id: number; app_name: string; app_url: string; app_icon: string }[];
  is_mini_projet?: boolean;
}

const STATUT_LABELS: Record<string, string> = {
  idee: 'Idée', demande_initiale: 'Demande initiale', etude_dsi: 'Étude DSI',
  arbitrage: 'Arbitrage', planification: 'Planification', en_cours: 'En cours',
  en_recette: 'En recette', en_cloture: 'En clôture', cloture: 'Clôturé',
  refuse: 'Refusé', suspendu: 'Suspendu', abandonne: 'Abandonné', en_pause: 'En pause'
};

const STATUT_COLORS: Record<string, string> = {
  idee: '#94a3b8', demande_initiale: '#f59e0b', etude_dsi: '#3b82f6',
  arbitrage: '#8b5cf6', planification: '#06b6d4', en_cours: '#22c55e',
  en_recette: '#14b8a6', en_cloture: '#f97316', cloture: '#64748b',
  refuse: '#ef4444', suspendu: '#eab308', abandonne: '#6b7280', en_pause: '#a855f7'
};

const COMPTEUR_MAP: Record<string, string> = {
  taches: 'taches_actives',
  documents: 'documents',
  reunions: 'reunions',
  journal: 'journal',
  indicateurs: 'indicateurs'
};

const ALL_TABS = [
  { key: 'infos', label: 'Informations', icon: FileText },
  { key: 'planning', label: 'Planning', icon: Calendar },
  { key: 'journal', label: 'Journal', icon: MessageSquare },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'reunions', label: 'Réunions', icon: Calendar },
  { key: 'taches', label: 'Tâches', icon: ListChecks },
  { key: 'score', label: 'Score', icon: BarChart3 },
  { key: 'indicateurs', label: 'Indicateurs', icon: Activity },
  { key: 'admin', label: 'Admin projet', icon: Settings },
];

const ProjetDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token, user } = useAuth();
  const [projet, setProjet] = useState<Projet | null>(null);
  const [loading, setLoading] = useState(true);
  const [ongletActif, setOngletActif] = useState('infos');
  const [transitions, setTransitions] = useState<any[]>([]);
  const [etapesActives, setEtapesActives] = useState<string[]>([]);
  const [showTransitionPicker, setShowTransitionPicker] = useState(false);
  const [transitionStatutCible, setTransitionStatutCible] = useState('');
  const [transitionMsg, setTransitionMsg] = useState('');
  // const [showDocUpload, setShowDocUpload] = useState(false);
  // const [showAddMember, setShowAddMember] = useState(false);
  const [showCreateReunion, setShowCreateReunion] = useState(false);
  const [reunionDetailId, setReunionDetailId] = useState<number | null>(null);
  // const [editingGov, setEditingGov] = useState(false);
  const [govForm, setGovForm] = useState({ commanditaire_username: '', commanditaire_display: '', chef_projet_username: '', chef_projet_display: '', chef_projet_metier_username: '', chef_projet_metier_display: '', dpd_requis: false, rssi_requis: false });
  const [editingInfos, setEditingInfos] = useState(false);

  const isAdmin = isSuperAdmin(user);
  const isPMO = user?.est_pmo || isAdminLike(user);
  const isChefProjet = projet?.chef_projet_username === user?.username || projet?.responsable_dsi_username === user?.username || (projet?.roles || []).some(r => r.username === user?.username && r.role === 'chef_projet');
  const peutVoirAdmin = isAdmin || isPMO || isChefProjet;
  const TABS = ALL_TABS.filter(t => {
    if (t.key === 'admin') return peutVoirAdmin;
    if (projet?.is_mini_projet && ['planning', 'score', 'indicateurs'].includes(t.key)) return false;
    return true;
  });
  const [infosForm, setInfosForm] = useState({ titre: '', description: '', niveau_projet: '', service_pilote: '', priorite: 0, avancement: 0, risque_global: '', satisfaction_metier: 0, date_debut_prevue: '', date_fin_prevue: '', benefices_attendus: '', benefices_realises: '', notes_internes: '' });
  const [viewerDoc, setViewerDoc] = useState<{ url: string; nom: string } | null>(null);
  const [compteurs, setCompteurs] = useState<Record<string, number>>({});
  const [comites, setComites] = useState<any[]>([]);
  const [editProjetParentId, setEditProjetParentId] = useState<number | null>(null);
  const [editAppIds, setEditAppIds] = useState<number[]>([]);
  const [appSearch, setAppSearch] = useState('');
  const [appResults, setAppResults] = useState<any[]>([]);
  const [projetSearch, setProjetSearch] = useState('');
  const [projetResults, setProjetResults] = useState<any[]>([]);
  const [equipeSearch, setEquipeSearch] = useState('');
  const [equipeResults, setEquipeResults] = useState<any[]>([]);
  const [equipeSearching, setEquipeSearching] = useState(false);
  const equipeSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (projet?.id) {
      fetch(`/api/projets/${projet.id}/comites`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(d => { if (Array.isArray(d)) setComites(d); }).catch(() => {});
    }
  }, [projet?.id, token]);

  const fetchProjet = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/projets/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.error) { console.error(data.error); return; }
      setProjet(data);
    } catch (e) { console.error('Erreur chargement projet:', e); }
    finally { setLoading(false); }
  }, [id, token]);

  const fetchCompteurs = useCallback(async (projetId: number) => {
    try {
      const res = await fetch(`/api/projets/${projetId}/compteurs`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setCompteurs(data || {});
      }
    } catch {}
  }, [token]);

  useEffect(() => { fetchProjet(); }, [fetchProjet]);

  useEffect(() => {
    if (projet?.id) fetchCompteurs(projet.id);
  }, [projet?.id, fetchCompteurs]);

  useEffect(() => {
    if (projet) {
      setGovForm({
        commanditaire_username: projet.commanditaire_username || '',
        commanditaire_display: projet.commanditaire_username || '',
        chef_projet_username: projet.chef_projet_username || '',
        chef_projet_display: projet.chef_projet_username || '',
        chef_projet_metier_username: projet.chef_projet_metier_username || '',
        chef_projet_metier_display: projet.chef_projet_metier_username || '',
        dpd_requis: !!projet.dpd_requis,
        rssi_requis: !!projet.rssi_requis
      });
      setInfosForm({
        titre: projet.titre || '',
        description: projet.description || '',
        niveau_projet: projet.niveau_projet || 'standard',
        service_pilote: projet.service_pilote || '',
        priorite: projet.priorite || 0,
        avancement: projet.avancement || 0,
        risque_global: projet.risque_global || '',
        satisfaction_metier: projet.satisfaction_metier || 0,
        date_debut_prevue: projet.date_debut_prevue || '',
        date_fin_prevue: projet.date_fin_prevue || '',
        benefices_attendus: projet.benefices_attendus || '',
        benefices_realises: projet.benefices_realises || '',
        notes_internes: projet.notes_internes || ''
      });
      setEditProjetParentId(projet.projet_parent_id || null);
      if (Array.isArray(projet.applications)) {
        setEditAppIds(projet.applications.map((a: any) => a.app_id));
      }
    }
  }, [projet]);

  const fetchTransitions = useCallback(async () => {
    try {
      const [res, resEtapes] = await Promise.all([
        fetch(`/api/projets/${id}/transitions`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/projets/${id}/etapes`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const data = await res.json();
      if (data.transitions) setTransitions(data.transitions);
      const etapesData = await resEtapes.json();
      if (Array.isArray(etapesData)) {
        setEtapesActives(etapesData.filter((e: any) => e.actif).sort((a: any, b: any) => a.ordre - b.ordre).map((e: any) => e.etape));
      }
    } catch (e) { console.error(e); }
  }, [id, token]);

  const refreshAll = useCallback(() => { fetchProjet(); fetchTransitions(); }, [fetchProjet, fetchTransitions]);

  const effectuerTransition = async (statutCible: string) => {
    try {
      const res = await fetch(`/api/projets/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ statut_cible: statutCible, commentaire: transitionMsg || null })
      });
      const data = await res.json();
      if (!data.error) { setShowTransitionPicker(false); setTransitionMsg(''); fetchProjet(); }
      else alert(data.error);
    } catch (e) { console.error(e); }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header />
      <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>
    </div>
  );

  if (!projet) return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header />
      <div style={{ padding: '40px', textAlign: 'center', color: '#dc2626' }}>Projet non trouvé</div>
    </div>
  );

  const saveInfos = async () => {
    // Save apps
    if (Array.isArray(projet.applications)) {
      const existingAppIds = projet.applications.map((a: any) => a.app_id);
      for (const id of editAppIds) {
        if (!existingAppIds.includes(id)) {
          await fetch(`/api/projets/${projet.id}/applications`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ app_id: id })
          });
        }
      }
      for (const app of projet.applications) {
        if (!editAppIds.includes(app.app_id)) {
          await fetch(`/api/projets/${projet.id}/applications/${app.app_id}`, {
            method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
          });
        }
      }
    }
    await fetch(`/api/projets/${projet.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...infosForm,
        projet_parent_id: editProjetParentId,
        commanditaire_username: govForm.commanditaire_username || null,
        chef_projet_username: govForm.chef_projet_username || null,
        chef_projet_metier_username: govForm.chef_projet_metier_username || null,
        commanditaire_display_name: govForm.commanditaire_display || null,
        chef_projet_display_name: govForm.chef_projet_display || null,
        chef_projet_metier_display_name: govForm.chef_projet_metier_display || null,
        dpd_requis: govForm.dpd_requis ? 1 : 0,
        rssi_requis: govForm.rssi_requis ? 1 : 0
      })
    });
    setEditingInfos(false);
    fetchProjet();
  };
  const searchProjetsEdit = (q: string) => {
    setProjetSearch(q);
    if (q.length < 2) { setProjetResults([]); return; }
    fetch(`/api/projets?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setProjetResults(d.slice(0, 10)); }).catch(() => {});
  };
  const searchAppsEdit = (q: string) => {
    setAppSearch(q);
    if (q.length < 2) { setAppResults([]); return; }
    fetch(`/api/projets/admin/apps/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setAppResults(d); }).catch(() => {});
  };

  const searchEquipeMembers = (q: string) => {
    setEquipeSearch(q);
    if (equipeSearchTimer.current) clearTimeout(equipeSearchTimer.current);
    if (q.length < 2) { setEquipeResults([]); return; }
    setEquipeSearching(true);
    equipeSearchTimer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/ad/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        setEquipeResults(Array.isArray(d) ? d : []);
      } catch { setEquipeResults([]); }
      finally { setEquipeSearching(false); }
    }, 400);
  };

  const addEquipeMember = async (username: string, displayName: string) => {
    if (!projet?.id) return;
    // Éviter les doublons
    if ((projet.roles || []).some(r => r.username === username && r.role === 'equipe_projet')) return;
    await fetch(`/api/projets/${projet.id}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username, role: 'equipe_projet', display_name: displayName })
    });
    setEquipeSearch(''); setEquipeResults([]);
    fetchProjet();
  };

  const removeEquipeMember = async (roleId: number) => {
    if (!projet?.id) return;
    await fetch(`/api/projets/${projet.id}/roles/${roleId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    fetchProjet();
  };

  const renderInfos = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Fil d'Ariane des étapes — masqué pour les mini-projets */}
      {!projet.is_mini_projet && (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', overflowX: 'auto' }}>
          {[
            { key: 'idee', label: 'Idée' },
            { key: 'demande_initiale', label: 'Demande' },
            { key: 'etude_dsi', label: 'Étude' },
            { key: 'arbitrage', label: 'Arbitrage' },
            { key: 'planification', label: 'Plan' },
            { key: 'en_cours', label: 'Réalisation' },
            { key: 'en_recette', label: 'Recette' },
            { key: 'en_cloture', label: 'Clôture' },
            { key: 'cloture', label: 'Terminé' },
          ].map((phase, idx) => {
            const ordre = ['idee','demande_initiale','etude_dsi','arbitrage','planification','en_cours','en_recette','en_cloture','cloture'];
            const currentIdx = ordre.indexOf(projet.statut);
            const phaseIdx = ordre.indexOf(phase.key);
            const estPassee = phaseIdx < currentIdx;
            const estCourante = phase.key === projet.statut;
            return (
              <div key={phase.key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{
                  padding: '4px 12px', borderRadius: '14px', fontSize: '12px', fontWeight: '700', whiteSpace: 'nowrap',
                  background: estCourante ? '#2563eb' : estPassee ? '#16a34a' : '#f1f5f9',
                  color: estCourante ? 'white' : estPassee ? 'white' : '#94a3b8',
                }}>
                  {estCourante ? '📍 ' : estPassee ? '✅ ' : ''}{phase.label}
                </div>
                {idx < 8 && <span style={{ color: estPassee || estCourante ? '#94a3b8' : '#d1d5db', fontSize: '12px' }}>›</span>}
              </div>
            );
          })}
          {['refuse','suspendu','abandonne'].includes(projet.statut) && (
            <span style={{ padding: '4px 12px', borderRadius: '14px', fontSize: '12px', fontWeight: '700', background: '#fee2e2', color: '#dc2626' }}>
              {projet.statut === 'refuse' ? '🚫 Refusé' : projet.statut === 'suspendu' ? '⏸️ Suspendu' : '🗑️ Abandonné'}
            </span>
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        {editingInfos ? (
          <>
            <button onClick={saveInfos} style={{ padding: '7px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>💾 Enregistrer</button>
            <button onClick={() => setEditingInfos(false)} style={{ padding: '7px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', color: '#64748b' }}>Annuler</button>
          </>
        ) : (
          <button onClick={() => setEditingInfos(true)} style={{ padding: '7px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', color: '#475569' }}>✏️ Modifier</button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Général</h3>
          {editingInfos ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <EditField label="Titre" value={infosForm.titre} onChange={v => setInfosForm({...infosForm, titre: v})} required />
              <EditField label="Niveau" value={infosForm.niveau_projet} onChange={v => setInfosForm({...infosForm, niveau_projet: v})} type="select" options={[{v:'mineur',l:'Mineur'},{v:'standard',l:'Standard'},{v:'structurant',l:'Structurant'}]} />
              <EditField label="Service pilote" value={infosForm.service_pilote} onChange={v => setInfosForm({...infosForm, service_pilote: v})} type="select" options={[{v:'',l:'Sélectionner...'},{v:'BF1',l:'BF1 — DSI'},{v:'BF6',l:'BF6 — Infrastructure'},{v:'BF8',l:'BF8 — Bureau des Projets'},{v:'BF9',l:'BF9 — Support & Déploiement'}]} required />
              <EditField label="Priorité (1-5)" value={String(infosForm.priorite)} onChange={v => setInfosForm({...infosForm, priorite: parseInt(v) || 0})} type="number" />
              <EditField label="Avancement %" value={String(infosForm.avancement)} onChange={v => setInfosForm({...infosForm, avancement: parseInt(v) || 0})} type="number" />
              <EditField label="Début prévu" value={infosForm.date_debut_prevue} onChange={v => setInfosForm({...infosForm, date_debut_prevue: v})} type="date" />
              <EditField label="Fin prévue" value={infosForm.date_fin_prevue} onChange={v => setInfosForm({...infosForm, date_fin_prevue: v})} type="date" />
              <EditField label="Risque global" value={infosForm.risque_global} onChange={v => setInfosForm({...infosForm, risque_global: v})} type="select" options={[{v:'',l:'Non défini'},{v:'faible',l:'Faible'},{v:'moyen',l:'Moyen'},{v:'élevé',l:'Élevé'},{v:'critique',l:'Critique'}]} />
              <EditField label="Météo" value={projet.meteo || 'neutre'} onChange={v => { fetch(`/api/projets/${projet.id}`, { method: 'PUT', headers: {'Content-Type':'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify({meteo: v}) }).then(() => fetchProjet()); }} type="select" options={[{v:'soleil',l:'☀️ Soleil'},{v:'nuageux',l:'⛅ Nuageux'},{v:'orage',l:'⛈️ Orage'},{v:'neutre',l:'➖ Neutre'}]} />
            </div>
          ) : (
            <>
              <InfoRow label="Code" value={projet.code} />
              <InfoRow label="Statut" value={<span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '12px', fontWeight: '600', background: `${STATUT_COLORS[projet.statut] || '#94a3b8'}20`, color: STATUT_COLORS[projet.statut] || '#94a3b8' }}>{STATUT_LABELS[projet.statut] || projet.statut}</span>} />
              <InfoRow label="Niveau" value={projet.niveau_projet} />
              <InfoRow label="Service pilote" value={projet.service_pilote} />
              <InfoRow label="Services associés" value={projet.services?.map(s => s.service_code).join(', ') || '—'} />
              <InfoRow label="Priorité" value={projet.priorite > 0 ? '★'.repeat(Math.min(projet.priorite, 5)) + '☆'.repeat(Math.max(0, 5 - Math.min(projet.priorite, 5))) : '—'} />
              <InfoRow label="Avancement" value={`${projet.avancement}%`} />
              <InfoRow label="Début prévu" value={projet.date_debut_prevue ? new Date(projet.date_debut_prevue).toLocaleDateString('fr-FR') : '—'} />
              <InfoRow label="Fin prévue" value={projet.date_fin_prevue ? new Date(projet.date_fin_prevue).toLocaleDateString('fr-FR') : '—'} />
              <InfoRow label="Risque global" value={projet.risque_global || '—'} />
              <InfoRow label="Météo" value={
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span>{projet.meteo === 'soleil' ? '☀️' : projet.meteo === 'nuageux' ? '⛅' : projet.meteo === 'orage' ? '⛈️' : '➖'}</span>
                  <select value={projet.meteo || 'neutre'} onChange={async (e) => { await fetch(`/api/projets/${projet.id}`, { method: 'PUT', headers: {'Content-Type':'application/json', Authorization: `Bearer ${token}`}, body: JSON.stringify({meteo: e.target.value}) }); fetchProjet(); }} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
                    <option value="soleil">☀️ Soleil</option><option value="nuageux">⛅ Nuageux</option><option value="orage">⛈️ Orage</option><option value="neutre">➖ Neutre</option>
                  </select>
                </span>
              } />
              <InfoRow label="Score" value={`${projet.score_total}/100`} />
              {projet.projet_parent && <InfoRow label="Projet parent" value={`${projet.projet_parent.code} — ${projet.projet_parent.titre}`} />}
              {Array.isArray(projet.applications) && projet.applications.length > 0 && (
                <InfoRow label="Applications" value={projet.applications.map((a: any) => a.app_name || `App #${a.app_id}`).join(', ')} />
              )}
            </>
          )}
        </div>
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Gouvernance</h3>
          </div>
          {editingInfos ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <ADSearchField label="Commanditaire" username={govForm.commanditaire_username} display={govForm.commanditaire_display} token={token} onSelect={(u, d) => setGovForm({...govForm, commanditaire_username: u, commanditaire_display: d})} onClear={() => setGovForm({...govForm, commanditaire_username: '', commanditaire_display: ''})} />
              <ADSearchField label="Chef de projet" username={govForm.chef_projet_username} display={govForm.chef_projet_display} token={token} onSelect={(u, d) => setGovForm({...govForm, chef_projet_username: u, chef_projet_display: d})} onClear={() => setGovForm({...govForm, chef_projet_username: '', chef_projet_display: ''})} />
              <ADSearchField label="Chef de projet métier" username={govForm.chef_projet_metier_username} display={govForm.chef_projet_metier_display} token={token} onSelect={(u, d) => setGovForm({...govForm, chef_projet_metier_username: u, chef_projet_metier_display: d})} onClear={() => setGovForm({...govForm, chef_projet_metier_username: '', chef_projet_metier_display: ''})} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer' }}>
                <input type="checkbox" checked={govForm.dpd_requis} onChange={e => setGovForm({...govForm, dpd_requis: e.target.checked})} /> DPD requis
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', cursor: 'pointer' }}>
                <input type="checkbox" checked={govForm.rssi_requis} onChange={e => setGovForm({...govForm, rssi_requis: e.target.checked})} /> RSSI requis
              </label>
            </div>
          ) : (
            <>
              <InfoRow label="Commanditaire" value={projet.commanditaire_display_name || projet.commanditaire_username || '—'} />
              <InfoRow label="Chef de projet" value={projet.chef_projet_display_name || projet.chef_projet_username || '—'} />
              <InfoRow label="Chef de projet métier" value={projet.chef_projet_metier_display_name || projet.chef_projet_metier_username || '—'} />
              <InfoRow label="DPD requis" value={projet.dpd_requis ? '✅ Oui' : '❌ Non'} />
              <InfoRow label="RSSI requis" value={projet.rssi_requis ? '✅ Oui' : '❌ Non'} />
              <InfoRow label="Créé par" value={projet.created_by_username} />
              <InfoRow label="Créé le" value={projet.date_creation ? new Date(projet.date_creation).toLocaleDateString('fr-FR') : '—'} />
            </>
          )}
          <div style={{ marginTop: '12px' }}>
            {!projet.is_mini_projet && <ComitesSection projetId={projet.id} token={token} />}
            {!editingInfos && <PartiesPrenantesSection roles={projet.roles || []} comites={projet.is_mini_projet ? [] : comites} />}
          </div>
        </div>
      </div>
      {editingInfos && (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>👥 Équipe projet</h3>
          {(projet.roles || []).filter(r => r.role === 'equipe_projet').length === 0 && (
            <p style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic', margin: '0 0 8px' }}>Aucun membre</p>
          )}
          {(projet.roles || []).filter(r => r.role === 'equipe_projet').map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
              <span style={{ color: '#1e293b', fontWeight: '600' }}>{r.display_name || r.username}</span>
              <button onClick={() => removeEquipeMember(r.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px 8px', borderRadius: '4px', fontSize: '13px' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>✕</button>
            </div>
          ))}
          <div style={{ marginTop: '10px', position: 'relative' }}>
            <input
              value={equipeSearch}
              onChange={e => searchEquipeMembers(e.target.value)}
              placeholder="Ajouter un membre (recherche annuaire)..."
              style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }}
            />
            {equipeSearching && <div style={{ fontSize: '11px', color: '#94a3b8', padding: '2px 0' }}>Recherche...</div>}
            {equipeResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 100, maxHeight: '200px', overflowY: 'auto' }}>
                {equipeResults.map((u: any) => (
                  <div key={u.username} onClick={() => addEquipeMember(u.username, u.displayName || u.username)}
                    style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '13px', borderBottom: '1px solid #f1f5f9' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                    <span style={{ fontWeight: '600' }}>{u.displayName || u.username}</span>
                    {u.displayName && <span style={{ color: '#94a3b8', marginLeft: '6px', fontSize: '12px' }}>({u.username})</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {!editingInfos && (projet.description || projet.benefices_attendus || projet.benefices_realises || projet.notes_internes) && (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>📝 Description & notes</h3>
          {projet.description && <div style={{ marginBottom: '12px' }}><div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Description</div><p style={{ margin: 0, color: '#1e293b', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{projet.description}</p></div>}
          {projet.benefices_attendus && <div style={{ marginBottom: '12px' }}><div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Bénéfices attendus</div><p style={{ margin: 0, color: '#1e293b', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{projet.benefices_attendus}</p></div>}
          {projet.benefices_realises && <div style={{ marginBottom: '12px' }}><div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Bénéfices réalisés</div><p style={{ margin: 0, color: '#1e293b', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{projet.benefices_realises}</p></div>}
          {projet.notes_internes && <div><div style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>Notes internes</div><p style={{ margin: 0, color: '#1e293b', fontSize: '13px', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{projet.notes_internes}</p></div>}
        </div>
      )}
      {editingInfos && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>📎 Rattachements</h3>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Projet parent</label>
              {editProjetParentId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#f8fafc' }}>
                  <span style={{ flex: 1 }}>{projet.projet_parent ? `${projet.projet_parent.code} — ${projet.projet_parent.titre}` : `#${editProjetParentId}`}</span>
                  <button onClick={() => setEditProjetParentId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px' }}>✕</button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input value={projetSearch} onChange={e => searchProjetsEdit(e.target.value)} placeholder="Rechercher..." style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                  {projetResults.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '2px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: '180px', overflow: 'auto' }}>
                      {projetResults.map((p: any) => (
                        <div key={p.id} onClick={() => { setEditProjetParentId(p.id); setProjetSearch(''); setProjetResults([]); }}
                          style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                          <div style={{ fontWeight: '600' }}>{p.titre}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>{p.code}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Applications ({editAppIds.length})</label>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '6px' }}>
                {editAppIds.map(aid => (
                  <span key={aid} style={{ padding: '2px 8px', background: '#f0fdf4', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                    {projet.applications?.find((x: any) => x.app_id === aid)?.app_name || `App #${aid}`} <button onClick={() => setEditAppIds(editAppIds.filter(x => x !== aid))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', padding: 0, fontSize: '12px' }}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <input value={appSearch} onChange={e => searchAppsEdit(e.target.value)} placeholder="Rechercher une app..." style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                {appResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '2px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: '180px', overflow: 'auto' }}>
                    {appResults.map(a => (
                      <div key={a.id} onClick={() => { if (!editAppIds.includes(a.id)) setEditAppIds([...editAppIds, a.id]); setAppSearch(''); setAppResults([]); }}
                        style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                        <span style={{ fontWeight: '600' }}>{a.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>📝 Description & notes</h3>
            <EditField label="Description" value={infosForm.description} onChange={v => setInfosForm({...infosForm, description: v})} type="textarea" />
            <div style={{ marginTop: '8px' }}><EditField label="Bénéfices attendus" value={infosForm.benefices_attendus} onChange={v => setInfosForm({...infosForm, benefices_attendus: v})} type="textarea" /></div>
            <div style={{ marginTop: '8px' }}><EditField label="Bénéfices réalisés" value={infosForm.benefices_realises} onChange={v => setInfosForm({...infosForm, benefices_realises: v})} type="textarea" /></div>
            <div style={{ marginTop: '8px' }}><EditField label="Notes internes" value={infosForm.notes_internes} onChange={v => setInfosForm({...infosForm, notes_internes: v})} type="textarea" /></div>
          </div>
        </div>
      )}
    </div>
  );

  const renderPlanning = () => <PlanningTab projetId={projet.id} token={token} />;
  const renderJournal = () => <JournalTab projetId={projet.id} token={token} onOuvrirDocument={(details) => ouvrirDocument(details, projet.id)} />;
  const renderDocuments = () => <DocumentsTab projetId={projet.id} token={token} documents={projet.documents} onVoirDocument={(url, nom) => setViewerDoc({ url, nom })} />;
  const renderReunions = () => <ReunionsTab projetId={projet.id} token={token} onAjouterReunion={() => setShowCreateReunion(true)} onVoirReunion={(id) => setReunionDetailId(id)} />;
  const renderTaches = () => <TachesTab projetId={projet.id} projetTitre={projet.titre} token={token} />;
  const renderScore = () => <ScoreTab projetId={projet.id} token={token} />;
  const renderIndicateurs = () => <IndicateursTab projetId={projet.id} token={token} />;
  const lierReunionApresCreation = async (reunion: any) => {
  if (reunion?.id) {
    const comite_id = reunion._comite_id;
    await fetch(`/api/projets/${projet.id}/reunions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reunion_id: reunion.id, type_gouvernance: comite_id ? 'comite' : null, comite_id: comite_id || null })
    });
    setReunionDetailId(reunion.id);
    fetchProjet();
  }
  setShowCreateReunion(false);
};

const ouvrirDocument = async (detailsJson: string, projetId: number) => {
  try {
    const details = JSON.parse(detailsJson);
    if (!details.document_id) return;
    const r = await fetch(`/api/projets/${projetId}/documents/${details.document_id}`, { headers: { Authorization: `Bearer ${token}` } });
    const doc = await r.json();
    const versionActive = doc.versions?.find((v: any) => v.est_version_courante);
    if (versionActive) {
      setViewerDoc({ url: `/api/projets/${projetId}/documents/${details.document_id}/versions/${versionActive.id}/view?mode=inline&token=${token}`, nom: `${details.type || 'Document'} ${versionActive.version}` });
    }
  } catch {}
};

  const renderAdmin = () => <AdminTab projetId={projet.id} token={token} projet={projet} onRefresh={refreshAll} />;
  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header />
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', position: 'relative' }}>
          <button onClick={() => navigate('/portefeuille-projets')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', color: '#64748b' }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#1e293b' }}>{projet.titre}</h1>
              {projet.is_mini_projet && (
                <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' }}>mini-projet</span>
              )}
              {peutVoirAdmin && !projet.is_mini_projet && (
                <button onClick={async () => {
                  try {
                    const r = await fetch(`/api/projets/${projet.id}/toggle-mini`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
                    if (r.ok) fetchProjet();
                  } catch {}
                }} title="Convertir en mini-projet"
                  style={{ padding: '2px 8px', fontSize: '11px', border: '1px solid #e2e8f0', borderRadius: '4px', background: 'white', cursor: 'pointer', color: '#64748b', fontWeight: '600' }}>
                  ↔ Mini
                </button>
              )}
            </div>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{projet.code}</span>
              <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: '600', background: `${STATUT_COLORS[projet.statut] || '#94a3b8'}20`, color: STATUT_COLORS[projet.statut] || '#94a3b8' }}>{STATUT_LABELS[projet.statut] || projet.statut}</span>
              <span>{projet.service_pilote}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {projet.is_mini_projet ? (
              peutVoirAdmin && (
                <button onClick={async () => {
                  if (window.confirm('Transformer ce mini-projet en projet standard ? Le planning, les étapes de workflow et les comités seront activés.')) {
                    try {
                      const r = await fetch(`/api/projets/${projet.id}/toggle-mini`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
                      if (r.ok) fetchProjet();
                    } catch {}
                  }
                }}
                  style={{ padding: '9px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ArrowRight size={16} /> Transformer en projet
                </button>
              )
            ) : (
              <>
                <button onClick={() => {
                  fetchTransitions();
                  setShowTransitionPicker(!showTransitionPicker);
                  if (!showTransitionPicker) setTransitionStatutCible('');
                }}
                  style={{ padding: '9px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ArrowRight size={16} /> Changer le statut
                </button>
                {projet?.statut !== 'refuse' && (
                  <button onClick={async () => {
                    if (window.confirm('Êtes-vous sûr de vouloir refuser ce projet ?')) {
                      try {
                        const res = await fetch(`/api/projets/${id}/transition`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ statut_cible: 'refuse', commentaire: null })
                        });
                        if (res.ok) { fetchProjet(); fetchTransitions(); }
                      } catch (e) { console.error(e); }
                    }
                  }}
                    style={{ padding: '9px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ✕ Refuser
                  </button>
                )}
                {projet?.statut !== 'en_pause' && !['refuse', 'abandonne', 'cloture'].includes(projet?.statut || '') && (
                  <button onClick={async () => {
                    if (window.confirm('Êtes-vous sûr de vouloir mettre ce projet en pause ?')) {
                      try {
                        const res = await fetch(`/api/projets/${id}/transition`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ statut_cible: 'en_pause', commentaire: null })
                        });
                        if (res.ok) { fetchProjet(); fetchTransitions(); }
                      } catch (e) { console.error(e); }
                    }
                  }}
                    style={{ padding: '9px 16px', background: '#a855f7', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⏸ Mettre en pause
                  </button>
                )}
              </>
            )}
          </div>
          {showTransitionPicker && (
            <div style={{ position: 'absolute', top: '100%', right: '0', marginTop: '4px', background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 50, minWidth: '320px', padding: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>🔄 Changer le statut</div>
              {/* Statut actuel */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#eff6ff', borderRadius: '6px', marginBottom: '10px', fontSize: '13px' }}>
                <span style={{ color: '#2563eb', fontWeight: '700' }}>📍 Actuel :</span>
                <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', background: `${STATUT_COLORS[projet.statut] || '#2563eb'}20`, color: STATUT_COLORS[projet.statut] || '#2563eb' }}>{STATUT_LABELS[projet.statut] || projet.statut}</span>
              </div>
              {/* Liste déroulante des statuts disponibles */}
              <label style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', display: 'block', marginBottom: '4px' }}>Nouveau statut :</label>
              <select value={transitionStatutCible} onChange={e => setTransitionStatutCible(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', background: 'white', marginBottom: '10px' }}>
                <option value="">Sélectionner...</option>
                {(() => {
                  const etapesOrdre = ['idee', 'demande_initiale', 'etude_dsi', 'arbitrage', 'planification', 'en_cours', 'en_recette', 'en_cloture', 'cloture'];
                  const currentIdx = etapesOrdre.indexOf(projet.statut);
                  const result: { statut: string; label: string; alerte?: boolean }[] = [];

                  // Ajouter toutes les transitions du backend
                  transitions.forEach(t => {
                    const tIdx = etapesOrdre.indexOf(t.statut);
                    let prefix = '';
                    // Ajouter des flèches pour indiquer avant/après
                    if (currentIdx >= 0 && tIdx >= 0) {
                      if (tIdx < currentIdx) prefix = '← '; // Retour en arrière
                      else if (tIdx > currentIdx) prefix = '→ '; // En avant
                    }
                    result.push({
                      statut: t.statut,
                      label: `${prefix}${STATUT_LABELS[t.statut] || t.statut}`,
                      alerte: t.alertes?.length > 0
                    });
                  });

                  // Retirer les doublons
                  const seen = new Set<string>();
                  return result.filter(r => {
                    if (r.statut === projet.statut) return false;
                    if (seen.has(r.statut)) return false;
                    seen.add(r.statut);
                    return true;
                  }).map(r => (
                    <option key={r.statut} value={r.statut}>
                      {r.label}{r.alerte ? ' ⚠️' : ''}
                    </option>
                  ));
                })()}
              </select>
              {/* Commentaire */}
              <input value={transitionMsg} onChange={e => setTransitionMsg(e.target.value)} placeholder="Commentaire (optionnel)" style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', marginBottom: '10px' }} />
              {/* Alertes */}
              {transitionStatutCible && transitions.find((t: any) => t.statut === transitionStatutCible)?.alertes?.length > 0 && (
                <div style={{ padding: '8px 12px', background: '#fef3c7', borderRadius: '6px', marginBottom: '10px', fontSize: '12px', color: '#92400e' }}>
                  ⚠️ Documents manquants :
                  {transitions.find((t: any) => t.statut === transitionStatutCible).alertes.map((a: any) => (
                    <div key={a.type}>· {a.label}</div>
                  ))}
                  <div style={{ marginTop: '4px', fontStyle: 'italic' }}>Vous pouvez tout de même effectuer la transition.</div>
                </div>
              )}
              {/* Boutons */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button onClick={() => setShowTransitionPicker(false)} style={{ padding: '8px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', color: '#64748b' }}>Annuler</button>
                <button onClick={async () => {
                  if (!transitionStatutCible) return;
                  await effectuerTransition(transitionStatutCible);
                }} disabled={!transitionStatutCible}
                  style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', opacity: transitionStatutCible ? 1 : 0.5 }}>
                  Enregistrer
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '2px solid #e2e8f0', paddingBottom: '0', overflowX: 'auto' }}>
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} onClick={() => setOngletActif(tab.key)} style={{
                padding: '10px 16px', border: 'none', borderBottom: ongletActif === tab.key ? '2px solid #2563eb' : '2px solid transparent',
                background: 'transparent', cursor: 'pointer', fontWeight: ongletActif === tab.key ? '700' : '500',
                color: ongletActif === tab.key ? '#2563eb' : '#64748b', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
                marginBottom: '-2px'
              }}>
                <Icon size={16} /> {tab.label}
                {(() => {
                  const ck = COMPTEUR_MAP[tab.key];
                  const cnt = ck ? compteurs[ck] : undefined;
                  return cnt !== undefined && cnt > 0 ? (
                    <span style={{ background: '#dc2626', color: 'white', borderRadius: '10px', padding: '1px 7px', fontSize: '11px', fontWeight: '700', lineHeight: '18px', marginTop: '-4px', alignSelf: 'flex-start' }}>
                      {cnt}
                    </span>
                  ) : null;
                })()}
              </button>
            );
          })}
        </div>

        {ongletActif === 'infos' && renderInfos()}
        {ongletActif === 'planning' && renderPlanning()}
        {ongletActif === 'journal' && renderJournal()}
        {ongletActif === 'documents' && renderDocuments()}
        {ongletActif === 'reunions' && renderReunions()}
        {ongletActif === 'taches' && renderTaches()}
        {ongletActif === 'score' && renderScore()}
        {ongletActif === 'indicateurs' && renderIndicateurs()}
        {ongletActif === 'admin' && renderAdmin()}
      </div>
      <CreateReunionModal
        isOpen={showCreateReunion}
        onClose={() => setShowCreateReunion(false)}
        onCreated={lierReunionApresCreation}
        token={token}
        source="projets"
        comites={comites}
      />
      <ReunionDetailModal
        isOpen={reunionDetailId !== null}
        reunionId={reunionDetailId}
        token={token}
        onClose={() => { setReunionDetailId(null); fetchProjet(); }}
        onUpdated={() => fetchProjet()}
      />
      {viewerDoc && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
          onClick={e => { if (e.target === e.currentTarget) setViewerDoc(null); }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '95vw', height: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>📄 {viewerDoc.nom}</h3>
              <button onClick={() => setViewerDoc(null)} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
              </button>
            </div>
            <div style={{ flex: 1, background: '#f1f5f9' }}>
              <iframe src={viewerDoc.url} style={{ width: '100%', height: '100%', border: 'none' }} title={viewerDoc.nom} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
    <span style={{ color: '#64748b', fontWeight: '500' }}>{label}</span>
    <span style={{ color: '#1e293b', fontWeight: '600', textAlign: 'right' }}>{value}</span>
  </div>
);

// @ts-ignore - EditGovField kept for future use
const _EditGovField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span style={{ color: '#64748b', fontWeight: '500', fontSize: '13px', minWidth: '120px' }}>{label}</span>
    <input value={value} onChange={e => onChange(e.target.value)} style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
  </div>
);

const EditField: React.FC<{ label: string; value: string; onChange: (v: string) => void; type?: string; options?: {v: string; l: string}[]; required?: boolean }> = ({ label, value, onChange, type, options, required }) => (
  <div style={{ marginBottom: '8px' }}>
    <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>{label}{required ? <span style={{ color: '#ef4444' }}> *</span> : ''}</label>
    {type === 'select' && options ? (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white' }}>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    ) : type === 'textarea' ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={3} style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', resize: 'vertical' }} />
    ) : (
      <input type={type || 'text'} value={value} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
    )}
  </div>
);

const ADSearchField: React.FC<{ label: string; username: string; display: string; token: string | null; onSelect: (username: string, displayName: string) => void; onClear: () => void }> = ({ label, username, display, token, onSelect, onClear }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = (query: string) => {
    setQ(query);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.length < 2) { setResults([]); return; }
    setSearching(true);
    timerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/ad/search?q=${encodeURIComponent(query)}`, { headers: { Authorization: `Bearer ${token}` } });
        const d = await r.json();
        setResults(Array.isArray(d) ? d : []);
        if (!r.ok) { setError('AD indisponible'); }
        else setError('');
      } catch { setResults([]); setError('Erreur'); }
      finally { setSearching(false); }
    }, 400);
  };

  return (
    <div>
      <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '3px' }}>{label}</label>
      {username ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#f8fafc' }}>
          <span style={{ flex: 1 }}>{display || username}</span>
          <button onClick={onClear} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', fontSize: '14px' }}>✕</button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <input value={q} onChange={e => search(e.target.value)} placeholder="Rechercher dans l'annuaire..." style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
          {searching && <div style={{ fontSize: '11px', color: '#94a3b8', padding: '2px 0' }}>Recherche...</div>}
          {error && <div style={{ fontSize: '11px', color: '#d97706', padding: '2px 0' }}>{error}</div>}
          {results.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '2px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: '150px', overflow: 'auto' }}>
              {results.map(u => (
                <div key={u.username} onClick={() => { onSelect(u.username, u.displayName); setQ(''); setResults([]); }}
                  style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '12px' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                  <div style={{ fontWeight: '600', color: '#1e293b' }}>{u.displayName}</div>
                  <div style={{ color: '#94a3b8', fontSize: '11px' }}>{u.email} {u.service ? `· ${u.service}` : ''}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface Comite { id: number; nom: string; role: string; frequence: string; responsable_username: string; membres: any[]; reunions?: any[]; }

const ComitesSection: React.FC<{ projetId: number; token: string | null }> = ({ projetId, token }) => {
  const [comites, setComites] = useState<Comite[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newComite, setNewComite] = useState({ nom: '', role: '', frequence: '', responsable_username: '' });
  const [showMembreForm, setShowMembreForm] = useState<number | null>(null);
  const [newMembre, setNewMembre] = useState({ prenom: '', nom: '', email: '', societe: '', fonction: '', role: '', telephone: '', ad_username: '' });
  const comiteAd = useADSearch(token);
  const [comiteEditing, setComiteEditing] = useState<number | null>(null);
  const [comiteEditNom, setComiteEditNom] = useState('');

  const load = useCallback(async () => {
    try { const r = await fetch(`/api/projets/${projetId}/comites`, { headers: { Authorization: `Bearer ${token}` } }); const d = await r.json(); if (Array.isArray(d)) setComites(d); } catch {}
  }, [projetId, token]);
  useEffect(() => { load(); }, [load]);

  const addComite = async () => {
    if (!newComite.nom) return;
    await fetch(`/api/projets/${projetId}/comites`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(newComite) });
    setNewComite({ nom: '', role: '', frequence: '', responsable_username: '' }); setShowForm(false); load();
  };
  const supprimerComite = async (comiteId: number) => { await fetch(`/api/projets/${projetId}/comites/${comiteId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); load(); };
  const editComite = async (comiteId: number) => {
    if (!comiteEditNom) return;
    await fetch(`/api/projets/${projetId}/comites/${comiteId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ nom: comiteEditNom }) });
    setComiteEditing(null); setComiteEditNom(''); load();
  };
  const startEditComite = (c: Comite) => { setComiteEditing(c.id); setComiteEditNom(c.nom); };
  const addMembre = async (comiteId: number) => {
    if (!newMembre.nom) return;
    await fetch(`/api/projets/${projetId}/comites/${comiteId}/membres`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(newMembre) });
    setNewMembre({ prenom: '', nom: '', email: '', societe: '', fonction: '', role: '', telephone: '', ad_username: '' }); setShowMembreForm(null); load();
  };
  const supprimerMembre = async (comiteId: number, membreId: number) => { await fetch(`/api/projets/${projetId}/comites/${comiteId}/membres/${membreId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); load(); };




  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>📋 Comités ({comites.length})</h4>
        <button onClick={() => setShowForm(!showForm)} style={{ padding: '6px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>+ Ajouter un comité</button>
      </div>
      {showForm && (
        <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <input value={newComite.nom} onChange={e => setNewComite({...newComite, nom: e.target.value})} placeholder="Nom (ex: COPIL)" style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', flex: 1, minWidth: '100px' }} />
          <input value={newComite.role} onChange={e => setNewComite({...newComite, role: e.target.value})} placeholder="Rôle" style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', flex: 1, minWidth: '100px' }} />
          <input value={newComite.frequence} onChange={e => setNewComite({...newComite, frequence: e.target.value})} placeholder="Fréquence" style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', flex: 1, minWidth: '100px' }} />
          <input value={newComite.responsable_username} onChange={e => setNewComite({...newComite, responsable_username: e.target.value})} placeholder="Responsable" style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', flex: 1, minWidth: '100px' }} />
          <button onClick={addComite} disabled={!newComite.nom} style={{ padding: '6px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', opacity: newComite.nom ? 1 : 0.5 }}>Ajouter</button>
        </div>
      )}
      {comites.length === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>Aucun comité défini</p>
      ) : comites.map(c => (
        <div key={c.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              {comiteEditing === c.id ? (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input value={comiteEditNom} onChange={e => setComiteEditNom(e.target.value)}
                    style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #2563eb', fontSize: '14px', fontWeight: '700', flex: 1, minWidth: '100px' }}
                    autoFocus onKeyDown={e => { if (e.key === 'Enter') editComite(c.id); if (e.key === 'Escape') setComiteEditing(null); }} />
                  <button onClick={() => editComite(c.id)} disabled={!comiteEditNom} style={{ padding: '4px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '11px' }}>OK</button>
                  <button onClick={() => setComiteEditing(null)} style={{ padding: '4px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '11px', color: '#475569' }}>Annuler</button>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: '700', fontSize: '14px', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {c.nom}
                    <button onClick={() => startEditComite(c)} title="Renommer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '1px 4px', fontSize: '12px' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#2563eb')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>✏️</button>
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    {c.role && <span>{c.role}</span>}
                    {c.frequence && <span> · {c.frequence}</span>}
                    {c.responsable_username && <span> · Resp: {c.responsable_username}</span>}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => supprimerComite(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px', fontSize: '13px', flexShrink: 0 }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>✕</button>
          </div>
          {/* Membres */}
          <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {(c.membres || []).map(m => (
              <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: '#f8fafc', borderRadius: '4px', fontSize: '12px' }}>
                <span style={{ color: '#1e293b', fontWeight: '500' }}>{m.prenom ? `${m.prenom} ${m.nom}` : m.nom}{m.role ? ` (${m.role})` : m.fonction ? ` (${m.fonction})` : ''}{m.societe ? ` - ${m.societe}` : ''}</span>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {m.email && <span style={{ color: '#2563eb', fontSize: '11px' }}>{m.email}</span>}
                  {m.telephone && <span style={{ color: '#64748b', fontSize: '11px' }}>{m.telephone}</span>}
                  <button onClick={() => supprimerMembre(c.id, m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '0', fontSize: '12px' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>✕</button>
                </div>
              </div>
            ))}
          </div>
          {c.reunions && c.reunions.length > 0 && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '2px' }}>📅 Réunions ({c.reunions.length})</div>
              {c.reunions.map((r: any) => (
                <div key={r.id} style={{ padding: '3px 8px', background: '#f0fdf4', borderRadius: '4px', fontSize: '11px', color: '#166534', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{r.titre}</span>
                  <span style={{ color: '#64748b' }}>{r.date_reunion ? new Date(r.date_reunion).toLocaleDateString('fr-FR') : ''}</span>
                </div>
              ))}
            </div>
          )}
          <button onClick={() => setShowMembreForm(showMembreForm === c.id ? null : c.id)} style={{ marginTop: '6px', padding: '4px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#475569', fontWeight: '600' }}>+ Membre</button>
          {showMembreForm === c.id && (
            <div style={{ marginTop: '8px', padding: '10px', background: '#f8fafc', borderRadius: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <input value={newMembre.prenom} onChange={e => setNewMembre({...newMembre, prenom: e.target.value})} placeholder="Prénom" style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', flex: 1, minWidth: '80px' }} />
                <input value={newMembre.nom} onChange={e => setNewMembre({...newMembre, nom: e.target.value})} placeholder="Nom *" style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', flex: 1, minWidth: '80px' }} />
                <input value={newMembre.email} onChange={e => setNewMembre({...newMembre, email: e.target.value})} placeholder="Email" style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', flex: 1, minWidth: '120px' }} />
                <input value={newMembre.role} onChange={e => setNewMembre({...newMembre, role: e.target.value})} placeholder="Rôle" style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', flex: 1, minWidth: '80px' }} />
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <input value={newMembre.societe} onChange={e => setNewMembre({...newMembre, societe: e.target.value})} placeholder="Société" style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', flex: 1 }} />
                <input value={newMembre.fonction} onChange={e => setNewMembre({...newMembre, fonction: e.target.value})} placeholder="Fonction" style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', flex: 1 }} />
                <input value={newMembre.telephone} onChange={e => setNewMembre({...newMembre, telephone: e.target.value})} placeholder="Téléphone" style={{ padding: '5px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px', flex: 1 }} />
              </div>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input value={comiteAd.query} onChange={e => comiteAd.setQuery(e.target.value)} placeholder="Rechercher dans l'annuaire..." style={{ width: '100%', padding: '5px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                  {comiteAd.results.length > 0 && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', marginTop: '2px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, maxHeight: '120px', overflow: 'auto' }}>
                      {comiteAd.results.map(u => (
                        <div key={u.username} onClick={() => { setNewMembre({...newMembre, nom: u.displayName, email: u.email, ad_username: u.username }); comiteAd.setQuery(''); comiteAd.clearResults(); }}
                          style={{ padding: '5px 8px', cursor: 'pointer', fontSize: '11px', borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                          <div style={{ fontWeight: '600' }}>{u.displayName}</div>
                          <div style={{ color: '#94a3b8' }}>{u.email}{u.service ? ` — ${u.service}` : ''}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <button onClick={() => addMembre(c.id)} disabled={!newMembre.nom} style={{ padding: '5px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '11px', opacity: newMembre.nom ? 1 : 0.5 }}>Ajouter</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// ===== PARTIES PRENANTES =====
interface StakeholderProps { roles: any[]; comites: any[]; }
const PartiesPrenantesSection: React.FC<StakeholderProps> = ({ roles, comites }) => {
  const equipeProjet = roles.filter(r => r.role === 'equipe_projet');
  const autresRoles = roles.filter(r => r.role !== 'equipe_projet');
  const total = roles.length + comites.reduce((sum, c) => sum + (c.membres || []).length, 0);

  if (total === 0) return null;

  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
      <h4 style={{ margin: '0 0 12px', fontSize: '13px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
        👥 Parties prenantes ({total})
      </h4>
      {equipeProjet.length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
            📋 Comité initial — Équipe projet ({equipeProjet.length})
          </div>
          {equipeProjet.map(r => (
            <div key={r.id} style={{ padding: '3px 8px', fontSize: '12px', color: '#1e293b' }}>
              {r.display_name || r.username}
            </div>
          ))}
        </div>
      )}
      {autresRoles.length > 0 && (
        <div style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
            📋 Autres rôles ({autresRoles.length})
          </div>
          {autresRoles.map(r => (
            <div key={r.id} style={{ padding: '3px 8px', fontSize: '12px', color: '#1e293b' }}>
              {r.display_name || r.username} <span style={{ color: '#94a3b8' }}>({r.role === 'partie_prenante' ? 'Partie prenante' : 'Pour info'})</span>
            </div>
          ))}
        </div>
      )}
      {comites.filter(c => (c.membres || []).length > 0).map(c => (
        <div key={c.id} style={{ marginBottom: '10px' }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>
            📋 {c.nom} ({(c.membres || []).length})
          </div>
          {(c.membres || []).map((m: any) => (
            <div key={m.id} style={{ padding: '3px 8px', fontSize: '12px', color: '#1e293b' }}>
              {m.prenom ? `${m.prenom} ${m.nom}` : m.nom}{m.role ? ` (${m.role})` : m.fonction ? ` (${m.fonction})` : ''}{m.societe ? ` — ${m.societe}` : ''}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

// ===== ONGLET PLANNING =====
interface GroupeTache { id: number; titre: string; couleur: string; ordre: number; }
interface Tache { id: number; titre: string; description?: string; date_debut?: string; date_fin?: string; statut: string; responsable_username?: string; couleur: string; ordre: number; groupe_id?: number; }
interface Jalon { id: number; titre: string; description?: string; date_jalon: string; type: string; atteint: number; groupe_id?: number; }
interface Dependance { id: number; source_type: string; source_id: number; depend_type: string; depend_id: number; source_label: string; depend_label: string; }
interface AlerteDep { message: string; source: string; severity: string; }

const PlanningTab: React.FC<{ projetId: number; token: string | null }> = ({ projetId, token }) => {
  const [taches, setTaches] = useState<Tache[]>([]);
  const [jalons, setJalons] = useState<Jalon[]>([]);
  const [groupes, setGroupes] = useState<GroupeTache[]>([]);
  const [dependances, setDependances] = useState<Dependance[]>([]);
  const [alertesDep, setAlertesDep] = useState<AlerteDep[]>([]);
  const [showAddTache, setShowAddTache] = useState(false);
  const [newTache, setNewTache] = useState({ titre: '', date_debut: '', date_fin: '', couleur: '#3b82f6', statut: 'a_faire', groupe_id: '', depend_id: '', depend_type: 'tache' });
  const [showAddJalon, setShowAddJalon] = useState(false);
  const [newJalon, setNewJalon] = useState({ titre: '', date_jalon: '', type: 'jalon', groupe_id: '', depend_id: '', depend_type: 'tache' });
  const [showAddGroupe, setShowAddGroupe] = useState(false);
  const [newGroupe, setNewGroupe] = useState({ titre: '', couleur: '#e2e8f0' });
  const [editTache, setEditTache] = useState<{ id: number; titre: string; date_debut: string; date_fin: string; duree: number; statut: string; groupe_id: number | null } | null>(null);
  const [editJalon, setEditJalon] = useState<{ id: number; titre: string; date_jalon: string; atteint: number; groupe_id: number | null } | null>(null);
  const [showAddDep, setShowAddDep] = useState(false);
  const [newDep, setNewDep] = useState({ source_type: 'tache', source_id: '', depend_type: 'tache', depend_id: '' });
  const [withSub, setWithSub] = useState(false);
  const [hasSub, setHasSub] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const sub = withSub ? '?include_children=1' : '';
      const [rt, rj, rg, rd, rv] = await Promise.all([
        fetch(`/api/projets/${projetId}/taches${sub}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/projets/${projetId}/jalons${sub}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/projets/${projetId}/groupes-taches`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/projets/${projetId}/dependances`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/projets/${projetId}/verifier-dependances`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const tag = (arr: any[]) => arr.map((x: any) => x.est_sous_projet && x.projet_titre ? { ...x, titre: `[${x.projet_titre}] ${x.titre}` } : x);
      const dt = await rt.json(); if (Array.isArray(dt)) setTaches(tag(dt));
      const dj = await rj.json(); if (Array.isArray(dj)) setJalons(tag(dj));
      const dg = await rg.json(); if (Array.isArray(dg)) setGroupes(dg);
      const dd = await rd.json(); if (Array.isArray(dd)) setDependances(dd);
      const dv = await rv.json(); if (dv.alertes) setAlertesDep(dv.alertes);
      if (withSub && (Array.isArray(dt) || Array.isArray(dj))) {
        setHasSub([...(Array.isArray(dt) ? dt : []), ...(Array.isArray(dj) ? dj : [])].some((x: any) => x.est_sous_projet));
      }
    } catch {}
  }, [projetId, token, withSub]);
  useEffect(() => { loadData(); }, [loadData]);

  // Détecte la présence de sous-projets (pour proposer le toggle)
  useEffect(() => {
    fetch(`/api/projets/${projetId}/taches?include_children=1`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d) && d.some((x: any) => x.est_sous_projet)) setHasSub(true); })
      .catch(() => {});
    fetch(`/api/projets/${projetId}/jalons?include_children=1`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (Array.isArray(d) && d.some((x: any) => x.est_sous_projet)) setHasSub(true); })
      .catch(() => {});
  }, [projetId, token]);

  const addTache = async () => {
    if (!newTache.titre) return;
    const r = await fetch(`/api/projets/${projetId}/taches`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ titre: newTache.titre, date_debut: newTache.date_debut || null, date_fin: newTache.date_fin || null, couleur: newTache.couleur, statut: newTache.statut, groupe_id: newTache.groupe_id ? parseInt(newTache.groupe_id) : null })
    });
    const data = await r.json();
    if (data.id && newTache.depend_id) {
      await fetch(`/api/projets/${projetId}/dependances`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ source_type: 'tache', source_id: data.id, depend_type: newTache.depend_type, depend_id: parseInt(newTache.depend_id) })
      });
    }
    setNewTache({ titre: '', date_debut: '', date_fin: '', couleur: '#3b82f6', statut: 'a_faire', groupe_id: '', depend_id: '', depend_type: 'tache' });
    setShowAddTache(false); loadData();
  };

  const saveEditTache = async () => {
    if (!editTache) return;
    await fetch(`/api/projets/${projetId}/taches/${editTache.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ titre: editTache.titre, date_debut: editTache.date_debut || null, date_fin: editTache.date_fin || null, groupe_id: editTache.groupe_id })
    });
    setEditTache(null); loadData();
  };

  const saveEditJalon = async () => {
    if (!editJalon) return;
    await fetch(`/api/projets/${projetId}/jalons/${editJalon.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ titre: editJalon.titre, date_jalon: editJalon.date_jalon, groupe_id: editJalon.groupe_id })
    });
    setEditJalon(null); loadData();
  };

  const changerStatut = async (tacheId: number, statut: string) => {
    await fetch(`/api/projets/${projetId}/taches/${tacheId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ statut })
    });
    loadData();
  };

  const addJalon = async () => {
    if (!newJalon.titre || !newJalon.date_jalon) return;
    const r = await fetch(`/api/projets/${projetId}/jalons`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ titre: newJalon.titre, date_jalon: newJalon.date_jalon, groupe_id: newJalon.groupe_id ? parseInt(newJalon.groupe_id) : null })
    });
    const data = await r.json();
    if (data.id && newJalon.depend_id) {
      await fetch(`/api/projets/${projetId}/dependances`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ source_type: 'jalon', source_id: data.id, depend_type: newJalon.depend_type, depend_id: parseInt(newJalon.depend_id) })
      });
    }
    setNewJalon({ titre: '', date_jalon: '', type: 'jalon', groupe_id: '', depend_id: '', depend_type: 'tache' });
    setShowAddJalon(false); loadData();
  };

  const addGroupe = async () => {
    if (!newGroupe.titre) return;
    await fetch(`/api/projets/${projetId}/groupes-taches`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(newGroupe)
    });
    setNewGroupe({ titre: '', couleur: '#e2e8f0' });
    setShowAddGroupe(false); loadData();
  };

  const addDep = async () => {
    if (!newDep.source_id || !newDep.depend_id) return;
    await fetch(`/api/projets/${projetId}/dependances`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...newDep, source_id: parseInt(newDep.source_id), depend_id: parseInt(newDep.depend_id) })
    });
    setNewDep({ source_type: 'tache', source_id: '', depend_type: 'tache', depend_id: '' });
    setShowAddDep(false); loadData();
  };

  const toggleJalon = async (j: Jalon) => {
    await fetch(`/api/projets/${projetId}/jalons/${j.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ atteint: j.atteint ? 0 : 1 })
    });
    loadData();
  };

  const supprimerTache = async (tacheId: number) => {
    await fetch(`/api/projets/${projetId}/taches/${tacheId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    loadData();
  };
  const supprimerJalon = async (jalonId: number) => {
    await fetch(`/api/projets/${projetId}/jalons/${jalonId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    loadData();
  };
  const supprimerGroupe = async (groupeId: number) => {
    await fetch(`/api/projets/${projetId}/groupes-taches/${groupeId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    loadData();
  };
  const supprimerDep = async (depId: number) => {
    await fetch(`/api/projets/${projetId}/dependances/${depId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    loadData();
  };

  // Late alerts
  const today = new Date();
  const tachesEnRetard = taches.filter(t => {
    if (t.statut === 'terminee') return false;
    if (t.date_fin && new Date(t.date_fin) < today) return true;
    if (t.statut === 'a_faire' && t.date_debut && new Date(t.date_debut) < today) return true;
    return false;
  });

  // Gantt
  const allDates = [
    ...taches.flatMap(t => t.date_debut ? [new Date(t.date_debut)] : []),
    ...taches.flatMap(t => t.date_fin ? [new Date(t.date_fin)] : []),
    ...jalons.map(j => new Date(j.date_jalon))
  ].filter(d => !isNaN(d.getTime()));
  const minDate = allDates.length > 0 ? new Date(Math.min(...allDates.map(d => d.getTime()))) : new Date();
  const maxDate = allDates.length > 0 ? new Date(Math.max(...allDates.map(d => d.getTime()))) : new Date();
  const rangeMs = Math.max(maxDate.getTime() - minDate.getTime(), 1);
  const ganttW = 600;
  const toX = (d: string) => ((new Date(d).getTime() - minDate.getTime()) / rangeMs) * ganttW;
  const toW = (d1: string, d2: string) => Math.max(((new Date(d2).getTime() - new Date(d1).getTime()) / rangeMs) * ganttW, 8);
  // barTop and getIdx removed (unused)

  // const STATUT_LABELS_TACHE: Record<string, string> = { a_faire: 'À faire', en_cours: 'En cours', terminee: 'Terminée', bloquee: 'Bloquée' };
  const STATUT_COLORS_TACHE: Record<string, string> = { a_faire: '#94a3b8', en_cours: '#3b82f6', terminee: '#22c55e', bloquee: '#ef4444' };

  const tachesParGroupe = (groupeId: number | null) => {
    if (groupeId === null) return taches.filter(t => !t.groupe_id);
    return taches.filter(t => t.groupe_id === groupeId);
  };
  const groupesAvecTaches = [...groupes, { id: 0, titre: 'Sans groupe', couleur: '#f1f5f9', ordre: 999 } as GroupeTache].filter(g => g.id === 0 ? tachesParGroupe(null).length > 0 : tachesParGroupe(g.id).length > 0);

  // const allItems = [...taches.map(t => ({ type: 'tache' as const, id: t.id, titre: t.titre, date_debut: t.date_debut, date_fin: t.date_fin })), ...jalons.map(j => ({ type: 'jalon' as const, id: j.id, titre: j.titre, date_debut: j.date_jalon, date_fin: j.date_jalon }))];

  return (
    <div>
      {hasSub && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
          <button
            onClick={() => setWithSub(v => !v)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 14px', borderRadius: '8px', border: '1px solid', borderColor: withSub ? '#2563eb' : '#e2e8f0', background: withSub ? '#eff6ff' : 'white', color: withSub ? '#2563eb' : '#475569', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
          >
            {withSub ? '☑' : '☐'} Inclure les sous-projets
          </button>
        </div>
      )}
      {tachesEnRetard.length > 0 && (
        <div style={{ background: '#fef2f2', borderRadius: '10px', border: '1px solid #fecaca', padding: '12px 16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#dc2626' }}>⚠️ {tachesEnRetard.length} tâche(s) en retard</div>
          {tachesEnRetard.slice(0, 5).map(t => (
            <div key={t.id} style={{ fontSize: '12px', color: '#991b1b' }}>• {t.titre} {t.date_fin ? `(fin: ${new Date(t.date_fin).toLocaleDateString('fr-FR')})` : t.date_debut ? `(début: ${new Date(t.date_debut).toLocaleDateString('fr-FR')})` : ''}</div>
          ))}
        </div>
      )}
      {jalons.filter(j => !j.atteint && new Date(j.date_jalon) < today).length > 0 && (
        <div style={{ background: '#fef2f2', borderRadius: '10px', border: '1px solid #fecaca', padding: '12px 16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#dc2626' }}>⚠️ {jalons.filter(j => !j.atteint && new Date(j.date_jalon) < today).length} jalon(s) en retard</div>
          {jalons.filter(j => !j.atteint && new Date(j.date_jalon) < today).slice(0, 5).map(j => (
            <div key={j.id} style={{ fontSize: '12px', color: '#991b1b' }}>📍 {j.titre} (date: {new Date(j.date_jalon).toLocaleDateString('fr-FR')})</div>
          ))}
        </div>
      )}
      {alertesDep.length > 0 && (
        <div style={{ background: '#fffbeb', borderRadius: '10px', border: '1px solid #fde68a', padding: '12px 16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '700', color: '#92400e' }}>🔗 {alertesDep.length} alerte(s) de dépendance</div>
          {alertesDep.slice(0, 5).map((a, i) => (
            <div key={i} style={{ fontSize: '12px', color: a.severity === 'error' ? '#991b1b' : '#92400e' }}>{a.severity === 'error' ? '🔴' : '🟡'} {a.message}</div>
          ))}
        </div>
      )}

      {/* Boutons */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <button onClick={() => setShowAddTache(!showAddTache)} style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}><Plus size={16} /> Tâche</button>
        <button onClick={() => setShowAddJalon(!showAddJalon)} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: '#475569' }}><Plus size={16} /> Jalon</button>
        <button onClick={() => setShowAddGroupe(!showAddGroupe)} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: '#475569' }}><Plus size={16} /> Groupe</button>
        <button onClick={() => setShowAddDep(!showAddDep)} style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', color: '#475569' }}><Plus size={16} /> Dépendance</button>
      </div>

      {/* Formulaires */}
      {showAddTache && (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <input value={newTache.titre} onChange={e => setNewTache({...newTache, titre: e.target.value})} placeholder="Titre *" style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', flex: 1, minWidth: '150px' }} />
          <input type="date" value={newTache.date_debut} onChange={e => setNewTache({...newTache, date_debut: e.target.value})} style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
          <input type="date" value={newTache.date_fin} onChange={e => setNewTache({...newTache, date_fin: e.target.value})} style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
          <select value={newTache.groupe_id} onChange={e => setNewTache({...newTache, groupe_id: e.target.value})} style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white' }}>
            <option value="">Sans groupe</option>
            {groupes.map(g => <option key={g.id} value={String(g.id)}>{g.titre}</option>)}
          </select>
          <select value={newTache.depend_id} onChange={e => setNewTache({...newTache, depend_id: e.target.value})} style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', maxWidth: '160px' }}>
            <option value="">Sans dépendance</option>
            {taches.map(t => <option key={t.id} value={String(t.id)}>↳ {t.titre}</option>)}
          </select>
          <input type="color" value={newTache.couleur} onChange={e => setNewTache({...newTache, couleur: e.target.value})} style={{ width: '36px', height: '36px', padding: '2px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer' }} />
          <button onClick={addTache} disabled={!newTache.titre} style={{ padding: '7px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', opacity: newTache.titre ? 1 : 0.5 }}>Ajouter</button>
        </div>
      )}
      {showAddJalon && (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <input value={newJalon.titre} onChange={e => setNewJalon({...newJalon, titre: e.target.value})} placeholder="Titre *" style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', flex: 1, minWidth: '150px' }} />
          <input type="date" value={newJalon.date_jalon} onChange={e => setNewJalon({...newJalon, date_jalon: e.target.value})} style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
          <select value={newJalon.groupe_id} onChange={e => setNewJalon({...newJalon, groupe_id: e.target.value})} style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white' }}>
            <option value="">Sans groupe</option>
            {groupes.map(g => <option key={g.id} value={String(g.id)}>{g.titre}</option>)}
          </select>
          <select value={newJalon.depend_id} onChange={e => setNewJalon({...newJalon, depend_id: e.target.value, depend_type: 'tache'})} style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', maxWidth: '160px' }}>
            <option value="">Sans dépendance</option>
            {taches.map(t => <option key={t.id} value={String(t.id)}>← {t.titre}</option>)}
          </select>
          <button onClick={addJalon} disabled={!newJalon.titre || !newJalon.date_jalon} style={{ padding: '7px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', opacity: (newJalon.titre && newJalon.date_jalon) ? 1 : 0.5 }}>Ajouter</button>
        </div>
      )}
      {showAddGroupe && (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <input value={newGroupe.titre} onChange={e => setNewGroupe({...newGroupe, titre: e.target.value})} placeholder="Nom *" style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', flex: 1, minWidth: '150px' }} />
          <input type="color" value={newGroupe.couleur} onChange={e => setNewGroupe({...newGroupe, couleur: e.target.value})} style={{ width: '36px', height: '36px', padding: '2px', borderRadius: '6px', border: '1px solid #e2e8f0', cursor: 'pointer' }} />
          <button onClick={addGroupe} disabled={!newGroupe.titre} style={{ padding: '7px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', opacity: newGroupe.titre ? 1 : 0.5 }}>Ajouter</button>
        </div>
      )}
      {showAddDep && (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px', marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <select value={newDep.source_type} onChange={e => setNewDep({...newDep, source_type: e.target.value, source_id: ''})} style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white' }}>
            <option value="tache">Tâche</option><option value="jalon">Jalon</option>
          </select>
          <select value={newDep.source_id} onChange={e => setNewDep({...newDep, source_id: e.target.value})} style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', flex: 1 }}>
            <option value="">Qui dépend ?</option>
            {(newDep.source_type === 'tache' ? taches : jalons).map((item: any) => (
              <option key={item.id} value={String(item.id)}>{item.titre}</option>
            ))}
          </select>
          <span style={{ fontSize: '13px', color: '#64748b' }}>dépend de</span>
          <select value={newDep.depend_type} onChange={e => setNewDep({...newDep, depend_type: e.target.value, depend_id: ''})} style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white' }}>
            <option value="tache">Tâche</option><option value="jalon">Jalon</option>
          </select>
          <select value={newDep.depend_id} onChange={e => setNewDep({...newDep, depend_id: e.target.value})} style={{ padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', flex: 1 }}>
            <option value="">De quoi ?</option>
            {(newDep.depend_type === 'tache' ? taches : jalons).map((item: any) => (
              <option key={item.id} value={String(item.id)}>{item.titre}</option>
            ))}
          </select>
          <button onClick={addDep} disabled={!newDep.source_id || !newDep.depend_id} style={{ padding: '7px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', opacity: (newDep.source_id && newDep.depend_id) ? 1 : 0.5 }}>Lier</button>
        </div>
      )}

      {/* Gantt */}
      {(taches.length > 0 || jalons.length > 0) && (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', marginBottom: '16px', overflowX: 'auto' }}>
          <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>📊 Diagramme de Gantt</h3>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', marginBottom: '8px', marginLeft: '200px' }}>
              <div style={{ width: `${ganttW}px`, position: 'relative', height: '20px' }}>
                {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                  const d = new Date(minDate.getTime() + pct * rangeMs);
                  return <div key={pct} style={{ position: 'absolute', left: `${pct * 100}%`, top: 0, fontSize: '10px', color: '#94a3b8', transform: 'translateX(-50%)' }}>{d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}</div>;
                })}
              </div>
            </div>
            {/* Jalons */}
            {(() => {
              const jalonSections: { label: string; couleur: string; items: typeof jalons }[] = [];
              const jSansGroupe = jalons.filter(j => !j.groupe_id);
              if (jSansGroupe.length > 0) jalonSections.push({ label: 'Sans groupe', couleur: '#faf5ff', items: jSansGroupe });
              for (const g of groupes) {
                const gj = jalons.filter(j => j.groupe_id === g.id);
                if (gj.length > 0) jalonSections.push({ label: g.titre, couleur: g.couleur || '#faf5ff', items: gj });
              }
              return jalonSections.map(s => (
                <div key={s.label} style={{ marginLeft: '200px', marginBottom: '8px' }}>
                  {s.label !== 'Sans groupe' && (
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#475569', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: s.couleur, border: '1px solid rgba(0,0,0,0.1)' }} />
                      {s.label} ({s.items.length})
                    </div>
                  )}
                  <div style={{ width: `${ganttW}px`, position: 'relative', height: '26px', background: `${s.couleur}18`, borderRadius: '6px', padding: '2px 0' }}>
                    {s.items.map(j => {
                      const estEnRetard = !j.atteint && new Date(j.date_jalon) < today;
                      const depTache = dependances.filter(d => d.depend_type === 'jalon' && d.depend_id === j.id);
                      const depVersTache = depTache.map(d => taches.find(tc => tc.id === d.source_id)).filter(Boolean);
                      const depDeTache = dependances.filter(d => d.source_type === 'jalon' && d.source_id === j.id);
                      return (
                        <div key={j.id} style={{ position: 'absolute', left: `${toX(j.date_jalon)}px`, top: '3px', transform: 'translateX(-50%)', fontSize: '14px', zIndex: 2, display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }}
                          title={`${j.titre} (${new Date(j.date_jalon).toLocaleDateString('fr-FR')})${estEnRetard ? ' - EN RETARD!' : ''}${depVersTache.length ? ' - Lié à: ' + depVersTache.map(t => t!.titre).join(', ') : ''}${depDeTache.length ? ' - Dépend de tâche' : ''}`}>
                          {j.atteint ? '✅' : estEnRetard ? '🔴' : '📍'}
                          <span style={{ fontSize: '9px', color: estEnRetard ? '#dc2626' : '#6d28d9', fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.titre}</span>
                          {estEnRetard && <span style={{ fontSize: '8px', color: '#dc2626', fontWeight: '800' }}>⚠️</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
            {/* Barres du Gantt */}
            {groupesAvecTaches.map(groupe => {
              const tachesDuGroupe = groupe.id === 0 ? tachesParGroupe(null) : tachesParGroupe(groupe.id);
              return (
                <div key={groupe.id}>
                  {groupe.id !== 0 && (
                    <div style={{ marginLeft: '200px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '12px', height: '12px', borderRadius: '3px', background: (groupes.find(g => g.id === groupe.id)?.couleur) || '#e2e8f0', flexShrink: 0 }} />
                      <span style={{ fontSize: '12px', fontWeight: '700', color: '#1e293b' }}>{groupe.titre}</span>
                      <button onClick={() => supprimerGroupe(groupe.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px', fontSize: '11px' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>✕</button>
                    </div>
                  )}
                  {tachesDuGroupe.map(t => {
                    // Trouver les dépendances de cette tâche
                    const deps = dependances.filter(d => d.source_type === 'tache' && d.source_id === t.id);
                    const depNonTerminees = deps.filter(d => {
                      const depT = taches.find(tc => tc.id === d.depend_id);
                      return depT && depT.statut !== 'terminee';
                    });
                    const aDependancesNonTerminees = depNonTerminees.length > 0;
                    return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', height: '28px', marginBottom: '2px' }}>
                      <div style={{ width: '195px', paddingRight: '5px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '500', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{t.titre}</span>
                        {aDependancesNonTerminees && <span style={{ fontSize: '10px' }} title={`Dépend de: ${depNonTerminees.map(d => d.depend_label).join(', ')}`}>🔗</span>}
                      </div>
                      <div style={{ width: `${ganttW}px`, position: 'relative', height: '20px', background: '#f8fafc', borderRadius: '4px', border: aDependancesNonTerminees ? '1px dashed #ef4444' : 'none' }}>
                        {t.date_debut && t.date_fin && (
                          <div style={{
                            position: 'absolute', left: `${toX(t.date_debut)}px`, width: `${toW(t.date_debut, t.date_fin)}px`,
                            height: '16px', top: '2px', borderRadius: '4px',
                            background: t.statut === 'terminee' ? '#22c55e' : t.statut === 'en_cours' ? '#3b82f6' : t.statut === 'bloquee' ? '#ef4444' : (t.couleur || '#3b82f6'),
                            opacity: t.statut === 'terminee' ? 0.6 : 0.9,
                            display: 'flex', alignItems: 'center', padding: '0 6px',
                            boxShadow: t.statut === 'en_cours' ? '0 0 0 2px #93c5fd' : 'none'
                          }}>
                            <span style={{ fontSize: '9px', color: 'white', fontWeight: '600', overflow: 'hidden', whiteSpace: 'nowrap' }}>{t.titre}</span>
                          </div>
                        )}
                        {t.date_debut && !t.date_fin && (
                          <div style={{
                            position: 'absolute', left: `${toX(t.date_debut)}px`,
                            width: '12px', height: '12px', top: '4px', borderRadius: '50%',
                            background: t.statut === 'terminee' ? '#22c55e' : (t.couleur || '#3b82f6')
                          }} />
                        )}
                        {t.statut === 'bloquee' && t.date_debut && t.date_fin && (
                          <div style={{ position: 'absolute', left: `${toX(t.date_debut) + toW(t.date_debut, t.date_fin)/2 - 8}px`, top: '2px', fontSize: '14px', zIndex: 3 }}>🚫</div>
                        )}
                        {t.statut === 'terminee' && t.date_debut && t.date_fin && (
                          <div style={{ position: 'absolute', right: '2px', top: '2px', fontSize: '10px', zIndex: 3, color: 'white' }}>✓</div>
                        )}
                        {/* Jalons liés à cette tâche */}
                        {dependances.filter(d => {
                          // Cas 1: tâche dépend d'un jalon (source=tache, depend=jalon)
                          if (d.source_type === 'tache' && d.source_id === t.id && d.depend_type === 'jalon') return true;
                          // Cas 2: jalon dépend de cette tâche (source=jalon, depend=tache)
                          if (d.source_type === 'jalon' && d.depend_type === 'tache' && d.depend_id === t.id) return true;
                          return false;
                        }).map(d => {
                          const jalonId = d.depend_type === 'jalon' ? d.depend_id : d.source_id;
                          const j = jalons.find(jj => jj.id === jalonId);
                          if (!j) return null;
                          return (
                            <div key={d.id} style={{ position: 'absolute', left: `${toX(j.date_jalon)}px`, top: '0px', transform: 'translateX(-50%)', fontSize: '16px', zIndex: 3, cursor: 'pointer' }}
                              title={`📍 ${j.titre} (lié à cette tâche)`}>{j.atteint ? '✅' : '📍'}</div>
                          );
                        })}
                        {/* Flèches de dépendance */}
                        {dependances.filter(d => d.source_type === 'tache' && d.source_id === t.id).map(d => {
                          const depT = taches.find(tc => tc.id === d.depend_id);
                          if (!depT || !depT.date_fin || !t.date_debut) return null;
                          const xFinDep = toX(depT.date_fin);
                          const xDebSrc = toX(t.date_debut);
                          if (xFinDep >= xDebSrc) return null;
                          const arrowWidth = xDebSrc - xFinDep;
                          const couleur = depT.statut === 'terminee' ? '#22c55e' : '#ef4444';
                          return (
                            <div key={d.id} style={{ position: 'absolute', left: `${xFinDep}px`, top: '8px', width: `${arrowWidth + 4}px`, height: '4px', zIndex: 3, pointerEvents: 'none' }}>
                              <svg width={arrowWidth + 4} height="4" style={{ display: 'block' }}>
                                <line x1="0" y1="2" x2={arrowWidth} y2="2" stroke={couleur} strokeWidth="1.5" strokeDasharray="3,2" />
                                <polygon points={`${arrowWidth - 1},0 ${arrowWidth - 1},4 ${arrowWidth + 4},2`} fill={couleur} />
                              </svg>
                            </div>
                          );
                        })}
                      </div>
                    </div>);
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Liste tâches avec édition, dépendances et groupes */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', fontWeight: '700', fontSize: '14px', color: '#64748b', textTransform: 'uppercase' }}>📋 Tâches ({taches.length})</div>
        {taches.length === 0 ? (<p style={{ padding: '20px', color: '#94a3b8', fontSize: '13px', textAlign: 'center', margin: 0 }}>Aucune tâche</p>)
        : (() => {
          const sections: { label: string; couleur: string; tasks: typeof taches }[] = [];
          const sansGroupe = taches.filter(t => !t.groupe_id);
          if (sansGroupe.length > 0) sections.push({ label: 'Sans groupe', couleur: '#f8fafc', tasks: sansGroupe });
          for (const g of groupes) {
            const gt = taches.filter(t => t.groupe_id === g.id);
            if (gt.length > 0) sections.push({ label: g.titre, couleur: g.couleur || '#e2e8f0', tasks: gt });
          }
          return sections.map(s => (
            <div key={s.label}>
              {s.label !== 'Sans groupe' && (
                <div style={{ padding: '6px 18px', background: s.couleur, fontWeight: '700', fontSize: '12px', color: '#475569', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: s.couleur, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
                  {s.label} ({s.tasks.length})
                </div>
              )}
              {s.tasks.map(t => {
                const bgColor = s.label === 'Sans groupe' ? 'transparent' : `${s.couleur}22`;
                return (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', borderBottom: '1px solid #f1f5f9', background: bgColor }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: t.couleur || '#3b82f6', flexShrink: 0 }} />
                      {editTache?.id === t.id ? (
                    <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
                      <input value={editTache.titre} onChange={e => setEditTache({...editTache, titre: e.target.value})} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '13px', flex: 1 }} />
                      <input type="date" value={editTache.date_debut} onChange={e => {
                        const newDebut = e.target.value;
                        if (newDebut && editTache.duree > 0) {
                          const fin = new Date(newDebut);
                          fin.setDate(fin.getDate() + editTache.duree);
                          setEditTache({...editTache, date_debut: newDebut, date_fin: fin.toISOString().split('T')[0]});
                        } else {
                          setEditTache({...editTache, date_debut: newDebut});
                        }
                      }} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                      <input type="date" value={editTache.date_fin} onChange={e => {
                        const newFin = e.target.value;
                        const duree = editTache.date_debut && newFin ? Math.round((new Date(newFin).getTime() - new Date(editTache.date_debut).getTime()) / 86400000) : 0;
                        setEditTache({...editTache, date_fin: newFin, duree: Math.max(duree, 0)});
                      }} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                      <select value={editTache.groupe_id ?? ''} onChange={e => setEditTache({...editTache, groupe_id: e.target.value ? parseInt(e.target.value) : null })}
                        style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '11px', background: 'white' }}>
                        <option value="">Sans groupe</option>
                        {groupes.map(g => <option key={g.id} value={String(g.id)}>{g.titre}</option>)}
                      </select>
                      <span style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap' }}>{editTache.duree > 0 ? `${editTache.duree}j` : ''}</span>
                      <button onClick={saveEditTache} style={{ padding: '4px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>OK</button>
                      <button onClick={() => setEditTache(null)} style={{ padding: '4px 10px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#64748b' }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: t.statut === 'terminee' ? '#94a3b8' : '#1e293b', textDecoration: t.statut === 'terminee' ? 'line-through' : 'none', cursor: 'pointer' }}
                        onClick={() => {
                          const duree = t.date_debut && t.date_fin ? Math.round((new Date(t.date_fin).getTime() - new Date(t.date_debut).getTime()) / 86400000) : 0;
                          setEditTache({ id: t.id, titre: t.titre, date_debut: t.date_debut || '', date_fin: t.date_fin || '', duree: Math.max(duree, 0), statut: t.statut, groupe_id: t.groupe_id ?? null });
                        }}>{t.titre}</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>{t.date_debut ? new Date(t.date_debut).toLocaleDateString('fr-FR') : '—'} → {t.date_fin ? new Date(t.date_fin).toLocaleDateString('fr-FR') : '—'}</span>
                      <select value={t.statut} onChange={e => changerStatut(t.id, e.target.value)}
                        style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '11px', fontWeight: '600', background: 'white', cursor: 'pointer', color: STATUT_COLORS_TACHE[t.statut] || '#94a3b8' }}>
                        <option value="a_faire">À faire</option><option value="en_cours">En cours</option><option value="terminee">Terminée</option><option value="bloquee">Bloquée</option>
                      </select>
                      {/* Dépendances */}
                      {dependances.filter(d => d.source_type === 'tache' && d.source_id === t.id).length > 0 && (
                        <span style={{ fontSize: '10px', color: '#64748b', display: 'flex', gap: '3px', alignItems: 'center' }}>
                          🔗 {dependances.filter(d => d.source_type === 'tache' && d.source_id === t.id).map(d => (
                            <span key={d.id} style={{ padding: '1px 5px', background: '#f1f5f9', borderRadius: '3px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                              {d.depend_label} <button onClick={() => supprimerDep(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, fontSize: '10px' }}>✕</button>
                            </span>
                          ))}
                        </span>
                      )}
                    </>
                  )}
                  <button onClick={() => supprimerTache(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px', flexShrink: 0 }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}><Trash2 size={12} /></button>
                </div>
              );})}
            </div>
          ));
        })()}
      </div>

      {/* Jalons avec édition et groupes */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', fontWeight: '700', fontSize: '14px', color: '#64748b', textTransform: 'uppercase' }}>📍 Jalons ({jalons.length})</div>
        {jalons.length === 0 ? (<p style={{ padding: '20px', color: '#94a3b8', fontSize: '13px', textAlign: 'center', margin: 0 }}>Aucun jalon</p>)
        : (() => {
          const sections: { label: string; couleur: string; items: typeof jalons }[] = [];
          const sansGroupe = jalons.filter(j => !j.groupe_id);
          if (sansGroupe.length > 0) sections.push({ label: 'Sans groupe', couleur: '#f8fafc', items: sansGroupe });
          for (const g of groupes) {
            const gj = jalons.filter(j => j.groupe_id === g.id);
            if (gj.length > 0) sections.push({ label: g.titre, couleur: g.couleur || '#e2e8f0', items: gj });
          }
          return sections.map(s => (
            <div key={s.label}>
              {s.label !== 'Sans groupe' && (
                <div style={{ padding: '6px 18px', background: s.couleur, fontWeight: '700', fontSize: '12px', color: '#475569', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: s.couleur, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 }} />
                  {s.label} ({s.items.length})
                </div>
              )}
              {s.items.map(j => {
                const bgColor = s.label === 'Sans groupe' ? 'transparent' : `${s.couleur}22`;
                return (
                <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 18px', borderBottom: '1px solid #f1f5f9', background: bgColor }}>
                  <input type="checkbox" checked={!!j.atteint} onChange={() => toggleJalon(j)} style={{ cursor: 'pointer' }} />
                  {editJalon?.id === j.id ? (
                    <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
                      <input value={editJalon.titre} onChange={e => setEditJalon({...editJalon, titre: e.target.value})} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '13px', flex: 1 }} />
                      <input type="date" value={editJalon.date_jalon} onChange={e => setEditJalon({...editJalon, date_jalon: e.target.value})} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                      <select value={editJalon.groupe_id ?? ''} onChange={e => setEditJalon({...editJalon, groupe_id: e.target.value ? parseInt(e.target.value) : null })}
                        style={{ padding: '4px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '11px', background: 'white' }}>
                        <option value="">Sans groupe</option>
                        {groupes.map(g => <option key={g.id} value={String(g.id)}>{g.titre}</option>)}
                      </select>
                      <button onClick={saveEditJalon} style={{ padding: '4px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>OK</button>
                      <button onClick={() => setEditJalon(null)} style={{ padding: '4px 10px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#64748b' }}>✕</button>
                    </div>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: j.atteint ? '#16a34a' : '#1e293b', textDecoration: j.atteint ? 'line-through' : 'none', cursor: 'pointer' }}
                        onClick={() => setEditJalon({ id: j.id, titre: j.titre, date_jalon: j.date_jalon, atteint: j.atteint, groupe_id: j.groupe_id ?? null })}>{j.titre}</span>
                      <span style={{ fontSize: '11px', color: '#64748b' }}>📅 {new Date(j.date_jalon).toLocaleDateString('fr-FR')}</span>
                      {dependances.filter(d => d.source_type === 'jalon' && d.source_id === j.id).map(d => (
                        <span key={d.id} style={{ fontSize: '10px', padding: '1px 5px', background: '#f1f5f9', borderRadius: '3px' }}>🔗 {d.depend_label} <button onClick={() => supprimerDep(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, fontSize: '10px' }}>✕</button></span>
                      ))}
                    </>
                  )}
                  <button onClick={() => supprimerJalon(j.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}><Trash2 size={12} /></button>
                </div>
              );})}
            </div>
          ));
        })()}
      </div>

      {/* Liste des dépendances */}
      {dependances.length > 0 && (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginTop: '16px' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', fontWeight: '700', fontSize: '14px', color: '#64748b', textTransform: 'uppercase' }}>🔗 Dépendances ({dependances.length})</div>
          {dependances.map(d => (
            <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 18px', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
              <span style={{ fontWeight: '600', color: '#1e293b' }}>{d.source_label}</span>
              <span style={{ color: '#64748b', fontSize: '11px' }}>({d.source_type})</span>
              <span style={{ color: '#94a3b8' }}>→</span>
              <span style={{ fontWeight: '600', color: '#1e293b' }}>{d.depend_label}</span>
              <span style={{ color: '#64748b', fontSize: '11px' }}>({d.depend_type})</span>
              <button onClick={() => supprimerDep(d.id)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px' }}
                onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
const JOURNAL_ICONES: Record<string, string> = {
  creation: '🆕', changement_statut: '🔄', document_depose: '📄',
  version_change: '📄', reunion_liee: '📅', decision: '⚖️',
  action: '✅', partie_prenante_ajoutee: '👤',
  partie_prenante_retiree: '➖', score_modifie: '📊',
  note: '📝', alerte: '⚠️', evenement: '📌'
};

// ===== ONGLET JOURNAL =====
const JournalTab: React.FC<{ projetId: number; token: string | null; onOuvrirDocument: (details: string) => void }> = ({ projetId, token, onOuvrirDocument }) => {
  const { user } = useAuth();
  const [entries, setEntries] = useState<any[]>([]);
  const [newEntryMsg, setNewEntryMsg] = useState('');
  const [newEntryType, setNewEntryType] = useState('note');
  const [newEntryDate, setNewEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [newEntryFile, setNewEntryFile] = useState<File | null>(null);
  const [adding, setAdding] = useState(false);
  const isAdmin = user?.role === 'admin';
  const isPMO = user?.est_pmo;

  const loadJournal = useCallback(async () => {
    try {
      const r = await fetch(`/api/projets/${projetId}/journal`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (Array.isArray(d)) setEntries(d);
    } catch {}
  }, [projetId, token]);

  useEffect(() => { loadJournal(); }, [loadJournal]);

  const addEntry = async () => {
    if (!newEntryMsg.trim()) return;
    setAdding(true);
    try {
      if (newEntryFile) {
        const formData = new FormData();
        formData.append('type_entree', newEntryType);
        formData.append('message', newEntryMsg);
        formData.append('date_entree', newEntryDate);
        formData.append('file', newEntryFile);

        await fetch(`/api/projets/${projetId}/journal`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
      } else {
        await fetch(`/api/projets/${projetId}/journal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ type_entree: newEntryType, message: newEntryMsg, date_entree: newEntryDate })
        });
      }
      setNewEntryMsg('');
      setNewEntryDate(new Date().toISOString().split('T')[0]);
      setNewEntryFile(null);
      loadJournal();
    } catch (e) { console.error(e); }
    finally { setAdding(false); }
  };

  const deleteEntry = async (entryId: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette entrée ?')) return;
    try {
      await fetch(`/api/projets/${projetId}/journal/${entryId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      loadJournal();
    } catch (e) { console.error(e); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '12px' }}>
          <select value={newEntryType} onChange={e => setNewEntryType(e.target.value)} style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white', fontWeight: '600' }}>
            <option value="note">📝 Note</option>
            <option value="decision">⚖️ Décision</option>
            <option value="action">✅ Action</option>
            <option value="alerte">⚠️ Alerte</option>
            <option value="evenement">📌 Événement</option>
          </select>
          <input
            type="date"
            value={newEntryDate}
            onChange={e => setNewEntryDate(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white' }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569' }}>
            📎
            <input
              type="file"
              onChange={e => setNewEntryFile(e.target.files?.[0] || null)}
              style={{ display: 'none' }}
            />
            {newEntryFile ? newEntryFile.name : 'Joindre'}
          </label>
          <button onClick={addEntry} disabled={adding || !newEntryMsg.trim()} style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', opacity: (adding || !newEntryMsg.trim()) ? 0.5 : 1, whiteSpace: 'nowrap', fontSize: '13px' }}>
            {adding ? 'Ajout...' : 'Ajouter'}
          </button>
        </div>
        <textarea
          value={newEntryMsg}
          onChange={e => setNewEntryMsg(e.target.value)}
          placeholder="Ajouter un événement au journal..."
          style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontFamily: 'inherit', minHeight: '60px', boxSizing: 'border-box' }}
          onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) addEntry(); }}
        />
      </div>
      {entries.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '40px' }}>Aucune entrée dans le journal</p>
      ) : entries.map(e => (
        <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', padding: '8px 14px' }}>
          <span style={{ minWidth: '120px', fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>{new Date(e.date_entree).toLocaleString('fr-FR')}</span>
          <span style={{ fontSize: '15px', flexShrink: 0, width: '22px', textAlign: 'center' }}>{JOURNAL_ICONES[e.type_entree] || '📋'}</span>
          <span style={{ flex: 1, fontSize: '13px', color: '#1e293b', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {(e.type_entree === 'document_depose' || e.type_entree === 'version_change') && e.details ? (
              <a onClick={() => onOuvrirDocument(e.details)} style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}>{e.message}</a>
            ) : e.message}
          </span>
          <span style={{ fontSize: '11px', color: '#94a3b8', flexShrink: 0 }}>{e.username}</span>
          {(isAdmin || isPMO) && (
            <button
              onClick={() => deleteEntry(e.id)}
              style={{ padding: '4px 8px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

// ===== ONGLET DOCUMENTS =====
const DocumentsTab: React.FC<{ projetId: number; token: string | null; documents: any[]; onVoirDocument: (url: string, nom: string) => void }> = ({ projetId, token, documents, onVoirDocument }) => {
  const [docs, setDocs] = useState(documents);
  const [sousOnglet, setSousOnglet] = useState('documents');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadType, setUploadType] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadUrl, setUploadUrl] = useState('');
  const [uploadContractuel, setUploadContractuel] = useState(false);
  const [uploadToJournal, setUploadToJournal] = useState(false);
  const [uploadAutreLabel, setUploadAutreLabel] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [editDocType, setEditDocType] = useState<{ id: number; currentType: string; customLabel?: string } | null>(null);

  useEffect(() => { setDocs(documents); }, [documents]);

  const handleUpload = async () => {
    if (!uploadType || (!uploadFile && !uploadUrl)) return;
    setUploading(true);
    const docRes = await fetch(`/api/projets/${projetId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        type_documentaire: uploadType === 'autre' && uploadAutreLabel.trim() ? uploadAutreLabel.trim() : uploadType,
        est_contractuel: uploadContractuel, url: uploadUrl || null
      })
    });
    const docData = await docRes.json();
    if (!docData.id) { setUploading(false); return; }

    if (uploadFile) {
      const form = new FormData();
      form.append('file', uploadFile);
      form.append('commentaire', '');
      form.append('journal', uploadToJournal ? 'true' : 'false');
      await fetch(`/api/projets/${projetId}/documents/${docData.id}/versions`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form
      });
    }

    setShowUpload(false); setUploadFile(null); setUploadUrl(''); setUploadType(''); setUploadContractuel(false); setUploadAutreLabel('');
    const r = await fetch(`/api/projets/${projetId}/documents`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    if (Array.isArray(d)) setDocs(d);
    setUploading(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    setUploadedFiles(files.map(f => f.name));
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    setUploadProgress(30);
    await fetch(`/api/projets/${projetId}/documents/versions/vrac`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form
    });
    setUploadProgress(80);
    const r = await fetch(`/api/projets/${projetId}/documents`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    if (Array.isArray(d)) setDocs(d);
    setUploadProgress(100);
    setTimeout(() => { setUploading(false); setUploadProgress(0); setUploadedFiles([]); }, 2500);
  };

  const docsFiltres = sousOnglet === 'contractuels' ? docs.filter(d => d.est_contractuel)
    : sousOnglet === 'vrac' ? docs.filter(d => d.type_vrac)
    : docs.filter(d => !d.type_vrac);

  return (
    <div>
      {/* Sous-onglets */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '14px', borderBottom: '2px solid #e2e8f0' }}>
        {[
          { key: 'documents', label: `Documents (${docs.filter(d => !d.type_vrac).length})` },
          { key: 'contractuels', label: `📝 Contractuels (${docs.filter(d => d.est_contractuel).length})` },
          { key: 'vrac', label: `📦 Vrac (${docs.filter(d => d.type_vrac).length})` }
        ].map(t => (
          <button key={t.key} onClick={() => setSousOnglet(t.key)} style={{
            padding: '7px 14px', border: 'none', borderBottom: sousOnglet === t.key ? '2px solid #2563eb' : '2px solid transparent',
            background: 'transparent', cursor: 'pointer', fontWeight: sousOnglet === t.key ? '700' : '500',
            color: sousOnglet === t.key ? '#2563eb' : '#64748b', fontSize: '13px', marginBottom: '-2px'
          }}>{t.label}</button>
        ))}
      </div>

      {/* Zone upload */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', flexWrap: 'wrap' }}>
        <button onClick={() => setShowUpload(!showUpload)} style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Upload size={16} /> Déposer un document
        </button>
      </div>

      {showUpload && (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Type</label>
              <select value={uploadType} onChange={e => setUploadType(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white' }}>
                <option value="">Sélectionner...</option>
                {['fiche_idee','fiche_demande','charte_projet','note_arbitrage','plan_projet','plan_communication','compte_rendu','va','vsr','doc_fonctionnelle','doc_technique','bilan_cloture','autre'].map(t => (
                  <option key={t} value={t}>{t.replace(/_/g,' ')}</option>
                ))}
              </select>
              {uploadType === 'autre' && (
                <input value={uploadAutreLabel} onChange={e => setUploadAutreLabel(e.target.value)} placeholder="Précisez le type..." style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', marginTop: '6px' }} />
              )}
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Fichier (ou lien)</label>
              <input type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)} style={{ width: '100%', padding: '6px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '4px' }}>Ou lien URL</label>
              <input value={uploadUrl} onChange={e => setUploadUrl(e.target.value)} placeholder="https://sharepoint/..." style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
            </div>
            <button onClick={handleUpload} disabled={uploading || !uploadType || (!uploadFile && !uploadUrl)}
              style={{ padding: '8px 18px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', opacity: (uploading || !uploadType || (!uploadFile && !uploadUrl)) ? 0.5 : 1, whiteSpace: 'nowrap' }}>{uploading ? '...' : 'Ajouter'}</button>
          </div>
          <div style={{ marginTop: '10px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}>
              <input type="checkbox" checked={uploadContractuel} onChange={e => setUploadContractuel(e.target.checked)} style={{ cursor: 'pointer' }} />
              Document contractuel
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b', cursor: 'pointer' }}>
              <input type="checkbox" checked={uploadToJournal} onChange={e => setUploadToJournal(e.target.checked)} style={{ cursor: 'pointer' }} />
              Ajouter au journal
            </label>
          </div>
        </div>
      )}

      {/* Zone glisser-déposer vrac */}
      {!uploading ? (
        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
          style={{ background: dragOver ? '#eff6ff' : '#f8fafc', borderRadius: '12px', border: `2px dashed ${dragOver ? '#2563eb' : '#e2e8f0'}`, padding: '30px', marginBottom: '16px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
          <div style={{ fontSize: '13px', color: dragOver ? '#2563eb' : '#94a3b8', fontWeight: '600' }}>
            📦 Glissez-déposez des fichiers ici<br />
            <span style={{ fontSize: '11px', fontWeight: '400' }}>Ils seront classés comme "documentation en vrac"</span>
          </div>
        </div>
      ) : (
        <div style={{ background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '10px' }}>📤 Upload en cours... ({uploadProgress}%)</div>
          <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' }}>
            <div style={{ width: `${uploadProgress}%`, height: '100%', background: 'linear-gradient(90deg, #2563eb, #3b82f6)', borderRadius: '4px', transition: 'width 0.3s ease' }} />
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {uploadedFiles.map((name, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '2px 0' }}>
                <span style={{ color: uploadProgress >= 100 ? '#16a34a' : '#94a3b8' }}>{uploadProgress >= 100 ? '✅' : '⏳'}</span>
                {name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Liste documents */}
      {docsFiltres.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '30px', fontSize: '13px' }}>Aucun document</p>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead><tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Type</th>
              <th style={{ padding: '10px 14px', textAlign: 'center', color: '#475569', fontWeight: '700' }}>Version</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Fichier / Lien</th>
              <th style={{ padding: '10px 14px', textAlign: 'left', color: '#475569', fontWeight: '700' }}>Date</th>
              <th style={{ padding: '10px 14px', textAlign: 'center', color: '#475569', fontWeight: '700' }}></th>
            </tr></thead>
            <tbody>
              {docsFiltres.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid #f1f5f9', background: d.est_contractuel ? '#fffbeb' : 'white' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: '600', color: '#1e293b', textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {d.type_documentaire.replace(/_/g, ' ')}
                      {d.est_contractuel ? <span style={{ fontSize: '10px', padding: '1px 5px', background: '#fef3c7', borderRadius: '3px', color: '#92400e', fontWeight: '700' }}>C</span> : null}
                    </div>
                    {d.phase_concernee && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{d.phase_concernee}</div>}
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: '700', color: d.version_courante ? '#2563eb' : '#94a3b8' }}>{d.version_courante || '—'}</td>
                  <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '12px' }}>
                    {d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '3px' }}
                        onClick={e => e.stopPropagation()}>
                        🔗 {d.url.substring(0, 40)}...
                      </a>
                    ) : (d.fichier_nom_original || '—')}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '12px' }}>{new Date(d.date_creation).toLocaleDateString('fr-FR')}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    {d.version_courante_id ? (
                      <a onClick={async (e) => {
                        e.preventDefault();
                        const r = await fetch(`/api/projets/${projetId}/documents/${d.id}`, { headers: { Authorization: `Bearer ${token}` } });
                        const detail = await r.json();
                        const versionActive = detail.versions?.find((v: any) => v.est_version_courante);
                        if (versionActive) {
                          const viewerUrl = `/api/projets/${projetId}/documents/${d.id}/versions/${versionActive.id}/view?mode=inline&token=${token}`;
                          onVoirDocument(viewerUrl, `${d.type_documentaire.replace(/_/g, ' ')} ${versionActive.version}`);
                        }
                      }} style={{ padding: '5px 12px', background: d.est_contractuel ? '#fef3c7' : '#eff6ff', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        👁️ Voir
                      </a>
                    ) : d.url ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer" style={{ padding: '5px 12px', background: '#fef3c7', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        🔗 Ouvrir
                      </a>
                    ) : null}
                    <button onClick={async () => {
                      if (!window.confirm(`Supprimer le document "${d.type_documentaire.replace(/_/g, ' ')}" ?`)) return;
                      await fetch(`/api/projets/${projetId}/documents/${d.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                      const r = await fetch(`/api/projets/${projetId}/documents`, { headers: { Authorization: `Bearer ${token}` } });
                      const rd = await r.json();
                      if (Array.isArray(rd)) setDocs(rd);
                    }} style={{ padding: '5px 8px', background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', fontSize: '14px', marginLeft: '4px' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}>🗑️</button>
                    {d.type_vrac && (
                      <>
                        {editDocType?.id === d.id ? (
                          <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexDirection: 'column' }}>
                            <select value={editDocType!.currentType} onChange={e => setEditDocType({...editDocType!, currentType: e.target.value})}
                              style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '11px', background: 'white', width: '120px' }}>
                              {['fiche_idee','fiche_demande','charte_projet','note_arbitrage','plan_projet','plan_communication','compte_rendu','va','vsr','doc_fonctionnelle','doc_technique','bilan_cloture','autre'].map(t => (
                                <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                              ))}
                            </select>
                            {editDocType!.currentType === 'autre' && (
                              <input value={editDocType!.customLabel || ''} onChange={e => setEditDocType({...editDocType!, customLabel: e.target.value})}
                                placeholder="Précisez le type..." style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '11px', width: '160px' }} />
                            )}
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <button onClick={async () => {
                                const typeFinal = editDocType!.currentType === 'autre' && editDocType!.customLabel?.trim()
                                  ? editDocType!.customLabel.trim() : editDocType!.currentType;
                                await fetch(`/api/projets/${projetId}/documents/${d.id}/type`, {
                                  method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                  body: JSON.stringify({ type_documentaire: typeFinal, type_vrac: 0 })
                                });
                                setEditDocType(null);
                                const r = await fetch(`/api/projets/${projetId}/documents`, { headers: { Authorization: `Bearer ${token}` } });
                                const rd = await r.json();
                                if (Array.isArray(rd)) setDocs(rd);
                              }} style={{ padding: '3px 8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px', fontWeight: '600' }}>OK</button>
                              <button onClick={() => setEditDocType(null)} style={{ padding: '3px 8px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }}>✕</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setEditDocType({ id: d.id, currentType: d.type_documentaire })}
                            style={{ padding: '3px 8px', background: '#f1f5f9', borderRadius: '4px', fontSize: '10px', color: '#475569', border: 'none', cursor: 'pointer', fontWeight: '600', display: 'block', marginTop: '4px' }}>
                            ✏️ Classer
                          </button>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ===== ONGLET RÉUNIONS =====
const ReunionsTab: React.FC<{ projetId: number; token: string | null; onAjouterReunion: () => void; onVoirReunion: (id: number) => void }> = ({ projetId, token, onAjouterReunion, onVoirReunion }) => {
  const { user } = useAuth();
  const [reunions, setReunions] = useState<any[]>([]);
  const isPMOOrAdmin = user?.role === 'admin' || user?.est_pmo;

  const loadReunions = useCallback(async () => {
    try {
      const r = await fetch(`/api/projets/${projetId}/reunions`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (Array.isArray(d)) setReunions(d);
    } catch {}
  }, [projetId, token]);

  const handleDelete = async (reunionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette réunion du projet ?')) return;

    try {
      const response = await fetch(`/api/projets/${projetId}/reunions/${reunionId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        setReunions(reunions.filter(r => r.id !== reunionId));
      }
    } catch (error) {
      console.error('Erreur lors de la suppression:', error);
    }
  };

  useEffect(() => { loadReunions(); }, [loadReunions]);
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button onClick={onAjouterReunion} style={{ padding: '8px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Ajouter une réunion
        </button>
      </div>
      {reunions.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '40px' }}>Aucune réunion liée</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {reunions.map(r => (
            <div key={r.id} style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div onClick={() => onVoirReunion(r.id)} style={{ cursor: 'pointer', flex: 1 }}>
              <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '14px' }}>{r.titre}</div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                <span>📅 {r.date_reunion ? new Date(r.date_reunion).toLocaleDateString('fr-FR') : '—'}</span>
                {r.comite_nom && <span style={{ padding: '1px 6px', background: '#f0fdf4', borderRadius: '4px', fontSize: '11px', fontWeight: '600', color: '#16a34a' }}>�️ {r.comite_nom}</span>}
                {r.type_gouvernance && !r.comite_nom && <span style={{ padding: '1px 6px', background: '#f1f5f9', borderRadius: '4px' }}>{r.type_gouvernance}</span>}
                <span>👥 {r.participant_count} participants</span>
              </div>
              </div>
              {isPMOOrAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(r.id, e); }}
                  style={{
                    padding: '6px 10px',
                    background: '#fee2e2',
                    color: '#991b1b',
                    border: '1px solid #fca5a5',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: '600',
                    marginLeft: '12px',
                    flexShrink: 0
                  }}
                  title="Supprimer cette réunion du projet"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ===== ONGLET TÂCHES =====
const STATUT_CYCLE = ['a_faire', 'en_cours', 'terminee', 'refuse'];

const TachesTab: React.FC<{ projetId: number; projetTitre?: string; token: string | null; onVoirReunion?: (id: number) => void }> = ({ projetId, projetTitre, token, onVoirReunion }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [hubTasks, setHubTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('tache');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showAddModal, setShowAddModal] = useState(false);
  const taskAd = useADSearch(token);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ tache: '', responsable: '', echeance: '', statut: 'a_faire' });
  const [expandedNotesId, setExpandedNotesId] = useState<string | null>(null);
  const [noteInput, setNoteInput] = useState('');
  const [uploadingNote, setUploadingNote] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [noteTaskRef, setNoteTaskRef] = useState<any>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        fetch(`/api/projets/${projetId}/taches-agregees`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/tasks/by-context?source=projet&id=${projetId}`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const d1 = await r1.json();
      const d2 = await r2.json();
      if (Array.isArray(d1)) setTasks(d1);
      if (Array.isArray(d2)) setHubTasks(d2);
    } catch {}
    finally { setLoading(false); }
  }, [projetId, token]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sortedTasks = [...tasks].sort((a, b) => {
    const aVal = (a[sortField] || '').toString().toLowerCase();
    const bVal = (b[sortField] || '').toString().toLowerCase();
    const cmp = aVal.localeCompare(bVal);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const acquitter = async (task: any) => {
    const idx = STATUT_CYCLE.indexOf(task.statut || 'a_faire');
    const nouveauStatut = STATUT_CYCLE[(idx + 1) % STATUT_CYCLE.length];
    try {
      const r = await fetch(`/api/projets/${projetId}/taches-agregees/${task.id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ statut: nouveauStatut })
      });
      if (r.ok) loadTasks();
    } catch {}
  };

  const supprimerTache = async (task: any) => {
    if (!window.confirm(`Supprimer la tâche "${task.tache}" ?`)) return;
    try {
      const r = await fetch(`/api/projets/${projetId}/taches-agregees/${task.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (r.ok) loadTasks();
      else { const err = await r.json(); alert(`Erreur : ${err.error}`); }
    } catch {}
  };

  const ajouterNote = async (task: any) => {
    if (!noteInput.trim()) return;
    try {
      const r = await fetch(`/api/projets/${projetId}/taches-agregees/${task.id}/notes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: noteInput, type: 'comment' })
      });
      if (r.ok) { setNoteInput(''); loadTasks(); }
      else { const err = await r.json(); alert(`Erreur : ${err.error}`); }
    } catch (e) { alert('Erreur réseau'); }
  };

  const triggerFileUpload = (task: any) => {
    setNoteTaskRef(task);
    fileInputRef.current?.click();
  };

  const uploadNoteFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !noteTaskRef) return;
    setUploadingNote(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const r = await fetch(`/api/projets/${projetId}/taches-agregees/${noteTaskRef.id}/notes/file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      if (r.ok) loadTasks();
      else { const err = await r.json(); alert(`Erreur : ${err.error}`); }
    } catch (e) { alert('Erreur réseau'); }
    finally { setUploadingNote(false); if (fileInputRef.current) fileInputRef.current.value = ''; }
  };

  const supprimerNote = async (task: any, noteIdx: number) => {
    if (!window.confirm('Supprimer cette note ?')) return;
    try {
      const r = await fetch(`/api/projets/${projetId}/taches-agregees/${task.id}/notes/${noteIdx}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (r.ok) loadTasks();
    } catch {}
  };

  const startEdit = (task: any) => {
    setEditingTaskId(task.id);
    setEditForm({ tache: task.tache || '', responsable: task.responsable || '', echeance: task.echeance || '', statut: task.statut || 'a_faire' });
  };

  const saveEdit = async () => {
    if (!editingTaskId) return;
    const tache = (editForm.tache || '').trim();
    if (!tache) { alert('Le texte de la tâche est obligatoire'); return; }
    try {
      const body: Record<string, any> = { ...editForm, tache, echeance: editForm.echeance || null };
      const r = await fetch(`/api/projets/${projetId}/taches-agregees/${editingTaskId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (r.ok) { setEditingTaskId(null); loadTasks(); }
      else { const err = await r.json(); alert(`Erreur : ${err.error}`); }
    } catch (e) { console.error(e); alert('Erreur réseau'); }
  };

  const handleTaskCreated = (created: any) => {
    // Hub tasks created via unified API
    const toAdd = Array.isArray(created) ? created : [created];
    setHubTasks(prev => [...prev, ...toAdd]);
    setShowAddModal(false);
  };

  const sortIndicator = (field: string) => {
    if (sortField !== field) return null;
    return <span style={{ marginLeft: '4px' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>;
  };

  const colBtn = (field: string, label: string) => (
    <th onClick={() => handleSort(field)} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none', borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
      {label} {sortIndicator(field)}
    </th>
  );

  const statusBadge = (statut: string) => {
    const cfg: Record<string, { bg: string; color: string; label: string }> = {
      a_faire: { bg: '#f1f5f9', color: '#64748b', label: 'À faire' },
      en_cours: { bg: '#dbeafe', color: '#1d4ed8', label: 'En cours' },
      terminee: { bg: '#dcfce7', color: '#16a34a', label: 'Terminée' },
      refuse: { bg: '#fee2e2', color: '#dc2626', label: 'Refusé' },
      en_erreur: { bg: '#fef3c7', color: '#92400e', label: 'En erreur' },
    };
    const c = cfg[statut] || cfg.a_faire;
    return <span style={{ padding: '3px 10px', borderRadius: '10px', background: c.bg, color: c.color, fontWeight: '600', fontSize: '11px' }}>{c.label}</span>;
  };

  const actionColor = (statut: string) => {
    switch (statut) {
      case 'a_faire': return '#64748b';
      case 'en_cours': return '#1d4ed8';
      case 'terminee': return '#16a34a';
      case 'refuse': return '#dc2626';
      default: return '#64748b';
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '14px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => setShowAddModal(true)} style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={16} /> Ajouter une tâche
        </button>
      </div>

      {loading ? <p style={{ color: '#94a3b8', textAlign: 'center', padding: '40px' }}>Chargement...</p> : tasks.length === 0 && hubTasks.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '40px' }}>Aucune tâche pour ce projet</p>
      ) : (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                {colBtn('tache', 'Tâche')}
                {colBtn('responsable', 'Responsable')}
                {colBtn('echeance', 'Échéance')}
                {colBtn('statut', 'Statut')}
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: '700', color: '#475569', fontSize: '12px', textTransform: 'uppercase', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', width: '120px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedTasks.flatMap(t => {
                const rows = [];
                if (editingTaskId === t.id) {
                  rows.push(
                    <tr key={t.id} style={{ borderBottom: '1px solid #f1f5f9', background: '#fff7ed' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="text" style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} value={editForm.tache} onChange={e => setEditForm(v => ({...v, tache: e.target.value}))} onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingTaskId(null); }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="text" style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} value={editForm.responsable} onChange={e => setEditForm(v => ({...v, responsable: e.target.value}))} onKeyDown={e => { if (e.key === 'Escape') setEditingTaskId(null); }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="date" style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} value={editForm.echeance} onChange={e => setEditForm(v => ({...v, echeance: e.target.value}))} onKeyDown={e => { if (e.key === 'Escape') setEditingTaskId(null); }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <select style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px' }} value={editForm.statut} onChange={e => setEditForm(v => ({...v, statut: e.target.value}))}>
                          <option value="a_faire">À faire</option>
                          <option value="en_cours">En cours</option>
                          <option value="terminee">Terminée</option>
                          <option value="refuse">Refusé</option>
                          <option value="en_erreur">En erreur</option>
                        </select>
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button onClick={saveEdit} style={{ padding: '4px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '11px', marginRight: '4px' }}>OK</button>
                        <button onClick={() => setEditingTaskId(null)} style={{ padding: '4px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '11px' }}>Annuler</button>
                      </td>
                    </tr>
                  );
                } else {
                  rows.push(
                    <tr key={t.id} onDoubleClick={() => startEdit(t)} style={{ borderBottom: expandedNotesId !== t.id ? '1px solid #f1f5f9' : 'none', background: t.statut === 'terminee' ? '#f0fdf4' : t.statut === 'refuse' ? '#fef2f2' : 'white', cursor: 'pointer' }}>
                      <td style={{ padding: '10px 12px', fontWeight: '600', color: '#1e293b', textDecoration: t.statut === 'terminee' ? 'line-through' : 'none' }}>
                        {t.source === 'reunion' && t.reunion_titre ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '14px', cursor: 'pointer' }} title={t.reunion_titre} onClick={() => onVoirReunion?.(t.reunion_id)}>📅</span>
                            <span>{t.tache}</span>
                          </span>
                        ) : t.tache}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#475569' }}>{t.responsable || '—'}</td>
                      <td style={{ padding: '10px 12px', color: '#64748b' }}>{t.echeance ? new Date(t.echeance).toLocaleDateString('fr-FR') : '—'}</td>
                      <td style={{ padding: '10px 12px' }}>{statusBadge(t.statut || 'a_faire')}</td>
                      <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button onClick={() => acquitter(t)} title={`Passer à ${STATUT_CYCLE[(STATUT_CYCLE.indexOf(t.statut || 'a_faire') + 1) % STATUT_CYCLE.length]}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: actionColor(t.statut || 'a_faire'), padding: '4px' }}>
                          <CheckCircle2 size={20} />
                        </button>
                        <button onClick={() => setExpandedNotesId(expandedNotesId === t.id ? null : t.id)} title={`${(t.notes || []).length} note(s)`} style={{ background: (t.notes || []).length > 0 ? '#eff6ff' : 'transparent', border: (t.notes || []).length > 0 ? '1px solid #bfdbfe' : 'none', borderRadius: '4px', cursor: 'pointer', color: expandedNotesId === t.id ? '#2563eb' : (t.notes || []).length > 0 ? '#1d4ed8' : '#94a3b8', padding: '2px 6px', marginLeft: '2px', fontWeight: (t.notes || []).length > 0 ? '700' : '400', fontSize: '11px', lineHeight: '18px' }}>
                          💬 {(t.notes || []).length || '+'}
                        </button>
                        <button onClick={() => supprimerTache(t)} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', marginLeft: '2px' }}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                  if (expandedNotesId === t.id) {
                    rows.push(
                      <tr key={`${t.id}-notes`}>
                        <td colSpan={5} style={{ padding: '4px 12px', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {(t.notes || []).map((n: any, ni: number) => (
                              <div key={n.id || ni} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 0', fontSize: '11px', borderBottom: ni < t.notes.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                {n.type === 'file' ? (
                                  <a href={`/api/projets/${projetId}/taches-agregees/${t.id}/notes/${ni}/file?mode=inline&token=${token}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, color: '#2563eb', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Upload size={10} /> {n.filename || n.content}
                                  </a>
                                ) : (
                                  <span style={{ flex: 1, color: '#1e293b' }}>{n.content}</span>
                                )}
                                <span style={{ fontSize: '9px', color: '#94a3b8', whiteSpace: 'nowrap' }}>{n.created_at ? new Date(n.created_at).toLocaleDateString('fr-FR') : ''}</span>
                                <button onClick={() => supprimerNote(t, ni)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '1px', lineHeight: 1 }} title="Supprimer">
                                  <X size={10} />
                                </button>
                              </div>
                            ))}
                            <div style={{ display: 'flex', gap: '4px' }}>
                              <input type="text" placeholder="Note..." style={{ flex: 1, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '11px' }} value={noteInput} onChange={e => setNoteInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') ajouterNote(t); }} />
                              <button onClick={() => ajouterNote(t)} style={{ padding: '4px 8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '10px', whiteSpace: 'nowrap' }}>Ajouter</button>
                              <button onClick={() => triggerFileUpload(t)} disabled={uploadingNote} style={{ padding: '4px 8px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '10px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                <Upload size={11} /> {uploadingNote ? '...' : 'Fichier'}
                              </button>
                            </div>
                          </div>
                          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={uploadNoteFile} />
                        </td>
                      </tr>
                    );
                  }
                }
                return rows;
              })}
              {hubTasks.map((t: any) => (
                <tr key={`hub_${t.id}`} style={{ borderBottom: '1px solid #f1f5f9', background: '#f0f9ff', borderLeft: '3px solid #3b82f6' }}>
                  <td style={{ padding: '10px 12px', fontWeight: '600', color: '#1e293b' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {t.is_team_task && <span title="Tâche d'équipe"><Users size={13} style={{ color: '#2563eb', flexShrink: 0 }} /></span>}
                      {t.description}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#475569' }}>{t.username || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{t.echeance ? new Date(t.echeance).toLocaleDateString('fr-FR') : '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{statusBadge(t.statut || 'a_faire')}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: '8px', fontSize: '12px', color: '#94a3b8' }}>
        {tasks.filter(t => t.source === 'reunion').length > 0 && <span style={{ marginRight: '16px' }}>📅 {tasks.filter(t => t.source === 'reunion').length} tâche(s) issue(s) des réunions</span>}
        {tasks.filter(t => t.source === 'standalone').length > 0 && <span style={{ marginRight: '16px' }}>📝 {tasks.filter(t => t.source === 'standalone').length} tâche(s) ajoutée(s) manuellement</span>}
        {tasks.filter(t => t.source === 'revue').length > 0 && <span style={{ marginRight: '16px' }}>📋 {tasks.filter(t => t.source === 'revue').length} tâche(s) issue(s) des revues</span>}
        {hubTasks.length > 0 && <span><Users size={11} style={{ verticalAlign: 'middle', marginRight: 3 }} />{hubTasks.length} tâche(s) hub / équipe</span>}
      </div>

      {/* AddTaskModal */}
      {showAddModal && (
        <AddTaskModal
          token={token}
          contextSource="projet"
          contextId={projetId}
          contextTitle={projetTitre || `Projet #${projetId}`}
          onCreated={handleTaskCreated}
          onClose={() => setShowAddModal(false)}
          title="Ajouter une tâche au projet"
        />
      )}
    </div>
  );
};

// ===== ONGLET SCORE =====
const ScoreTab: React.FC<{ projetId: number; token: string | null }> = ({ projetId, token }) => {
  const [config, setConfig] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/projets/${projetId}/scores`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.config) setConfig(d.config); }).catch(() => {});
  }, [projetId, token]);

  const setNote = async (critere: string, note: number) => {
    setSaving(true);
    try {
      await fetch(`/api/projets/${projetId}/scores`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ critere, note })
      });
      const r = await fetch(`/api/projets/${projetId}/scores`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (d.config) setConfig(d.config);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const scoreCalcule = config.reduce((acc, c) => acc + ((c.note || 0) / 5) * c.poids, 0);

  return (
    <div>
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', marginBottom: '16px', textAlign: 'center' }}>
        <div style={{ fontSize: '12px', color: '#64748b', fontWeight: '600', textTransform: 'uppercase' }}>Score total</div>
        <div style={{ fontSize: '42px', fontWeight: '900', color: scoreCalcule >= 50 ? '#16a34a' : scoreCalcule >= 30 ? '#d97706' : '#dc2626' }}>{Math.round(scoreCalcule)}/100</div>
      </div>
      <div style={{ display: 'grid', gap: '8px' }}>
        {config.map(c => (
          <div key={c.critere} style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '13px' }}>{c.label}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>Poids: {c.poids}%</div>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setNote(c.critere, n)} disabled={saving} style={{
                  width: '32px', height: '32px', borderRadius: '8px', border: (c.note || 0) >= n ? '2px solid #2563eb' : '1px solid #e2e8f0',
                  background: (c.note || 0) >= n ? '#eff6ff' : 'white', cursor: 'pointer', fontWeight: '700',
                  color: (c.note || 0) >= n ? '#2563eb' : '#94a3b8', fontSize: '13px'
                }}>{n}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ===== ONGLET INDICATEURS =====
const IndicateursTab: React.FC<{ projetId: number; token: string | null }> = ({ projetId, token }) => {
  const [indicateurs, setIndicateurs] = useState<any[]>([]);
  const [controles, setControles] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/projets/${projetId}/indicateurs`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setIndicateurs(d); }).catch(() => {});
    fetch(`/api/projets/${projetId}/controles`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.controles) setControles(d.controles); }).catch(() => {});
  }, [projetId, token]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Checklist documentaire</h3>
        {controles.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '13px' }}>Aucun document attendu pour la phase actuelle.</p>
        ) : (
          controles.map(c => (
            <div key={c.type} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
              <span style={{ fontSize: '16px' }}>{c.present ? '✅' : '⚠️'}</span>
              <span style={{ flex: 1, color: '#1e293b', fontWeight: '500' }}>{c.label}</span>
              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', fontWeight: '600', background: c.present ? '#dcfce7' : '#fef3c7', color: c.present ? '#16a34a' : '#d97706' }}>
                {c.present ? 'Présent' : 'Manquant'}
              </span>
            </div>
          ))
        )}
      </div>
      {indicateurs.length > 0 && (
        <div style={{ display: 'grid', gap: '8px' }}>
          {indicateurs.map(ind => (
            <div key={ind.id} style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: '700', color: '#1e293b', fontSize: '13px', textTransform: 'capitalize' }}>{ind.type_indicateur}</span>
                {ind.commentaire && <span style={{ color: '#64748b', marginLeft: '8px', fontSize: '12px' }}>— {ind.commentaire}</span>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontWeight: '700', color: '#2563eb' }}>{ind.valeur}</span>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>{new Date(ind.date_saisie).toLocaleDateString('fr-FR')}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {indicateurs.length === 0 && <p style={{ color: '#94a3b8', textAlign: 'center', padding: '20px', fontSize: '13px' }}>Aucun indicateur saisi.</p>}
    </div>
  );
};

// ===== ONGLET ADMIN =====
const AdminTab: React.FC<{ projetId: number; token: string | null; projet: Projet; onRefresh: () => void }> = ({ projetId, token, projet, onRefresh }) => {
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleUsername, setNewRoleUsername] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleRole, setNewRoleRole] = useState('equipe_projet');
  const [attendus, setAttendus] = useState<any[]>([]);
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeCode, setNewTypeCode] = useState('');
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [newTypePhase, setNewTypePhase] = useState('');
  const [newTypeObligatoire, setNewTypeObligatoire] = useState(false);
  const [savingAttendus, setSavingAttendus] = useState(false);
  const [etapes, setEtapes] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/projets/${projetId}/attendus`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setAttendus(d); }).catch(() => {});
    fetch(`/api/projets/${projetId}/etapes`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setEtapes(d); }).catch(() => {});
  }, [projetId, token]);

  const [savingEtapes, setSavingEtapes] = useState(false);

  const toggleEtape = (etape: string, actif: boolean) => {
    setEtapes(etapes.map(e => e.etape === etape ? { ...e, actif: actif ? 1 : 0 } : e));
  };

  const saveEtapes = async () => {
    setSavingEtapes(true);
    try {
      for (const e of etapes) {
        await fetch(`/api/projets/${projetId}/etapes`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ etape: e.etape, actif: !!e.actif })
        });
      }
      onRefresh();
    } catch {}
    finally { setSavingEtapes(false); }
  };

  const addRole = async () => {
    if (!newRoleUsername) return;
    await fetch(`/api/projets/${projetId}/roles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username: newRoleUsername, role: newRoleRole, display_name: newRoleName || newRoleUsername })
    });
    setNewRoleUsername(''); setNewRoleName(''); setShowAddRole(false);
    onRefresh();
  };

  const removeRole = async (roleId: number) => {
    await fetch(`/api/projets/${projetId}/roles/${roleId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    onRefresh();
  };

  const toggleAttendu = (code: string) => {
    setAttendus(attendus.map((a: any) => a.code === code ? { ...a, attendu_pour_ce_projet: a.attendu_pour_ce_projet ? 0 : 1 } : a));
  };
  const setPhase = (code: string, phase: string) => {
    setAttendus(attendus.map((a: any) => a.code === code ? { ...a, phase_projet: phase } : a));
  };
  const saveAttendus = async () => {
    setSavingAttendus(true);
    await fetch(`/api/projets/${projetId}/attendus`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ attendus: attendus.filter((a: any) => a.attendu_pour_ce_projet).map((a: any) => ({ code: a.code, obligatoire: a.obligatoire_projet || a.obligatoire, phase_concernee: a.phase_projet || a.phase_concernee })) })
    });
    setSavingAttendus(false);
  };
  const addNewType = async () => {
    if (!newTypeCode || !newTypeLabel) return;
    const existing = await fetch(`/api/projets/admin/types-documentaires`, { headers: { Authorization: `Bearer ${token}` } });
    const types = await existing.json();
    if (Array.isArray(types)) {
      types.push({ code: newTypeCode, label: newTypeLabel, phase_concernee: newTypePhase || null, obligatoire: newTypeObligatoire ? 1 : 0, ordre: types.length, actif: 1 });
      await fetch(`/api/projets/admin/types-documentaires`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ types })
      });
    }
    setShowNewType(false); setNewTypeCode(''); setNewTypeLabel(''); setNewTypePhase('');
    const r = await fetch(`/api/projets/${projetId}/attendus`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json(); if (Array.isArray(d)) setAttendus(d);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {projet.is_mini_projet && (
        <div style={{ padding: '10px 16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', fontSize: '13px', color: '#16a34a', fontWeight: '600' }}>
          🌱 Ce projet est un <strong>mini-projet</strong> — les étapes de workflow et les comités ne s'appliquent pas.
        </div>
      )}
      {!projet.is_mini_projet && (
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
        <h3 style={{ margin: '0 0 14px', fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>📌 Étapes du projet</h3>
        {etapes.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: '13px' }}>Aucune étape définie</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {etapes.sort((a: any, b: any) => a.ordre - b.ordre).map((e: any) => {
              const label = STATUT_LABELS[e.etape] || e.etape;
              const color = STATUT_COLORS[e.etape] || '#94a3b8';
              return (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <input type="checkbox" checked={!!e.actif} onChange={() => toggleEtape(e.etape, !e.actif)} style={{ cursor: 'pointer' }} />
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                  <span style={{ flex: 1, fontSize: '13px', fontWeight: e.actif ? '600' : '400', color: e.actif ? '#1e293b' : '#94a3b8' }}>{label}</span>
                  {e.etape === projet.statut && <span style={{ fontSize: '11px', padding: '1px 6px', background: '#eff6ff', borderRadius: '4px', color: '#2563eb', fontWeight: '600' }}>Actuel</span>}
                </div>
              );
            })}
          </div>
        )}
        <button onClick={saveEtapes} disabled={savingEtapes} style={{ marginTop: '12px', padding: '8px 18px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>
          {savingEtapes ? 'Enregistrement...' : '💾 Enregistrer les étapes'}
        </button>
      </div>
      )}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Parties prenantes ({projet.roles?.length || 0})</h3>
          <button onClick={() => setShowAddRole(!showAddRole)}
            style={{ padding: '6px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <UserPlus size={14} /> Ajouter
          </button>
        </div>
        {showAddRole && (
          <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input value={newRoleUsername} onChange={e => setNewRoleUsername(e.target.value)} placeholder="Login" style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
              <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="Nom d'affichage" style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
              <select value={newRoleRole} onChange={e => setNewRoleRole(e.target.value)} style={{ padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px', background: 'white' }}>
                <option value="equipe_projet">Équipe</option>
                <option value="partie_prenante">Partie prenante</option>
                <option value="pour_info">Pour info</option>
              </select>
              <button onClick={addRole} style={{ padding: '7px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>+</button>
            </div>
          </div>
        )}
        {(!projet.roles || projet.roles.length === 0) ? (
          <p style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>Aucune personne assignée</p>
        ) : projet.roles.map(r => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
            <div>
              <span style={{ color: '#1e293b', fontWeight: '600' }}>{r.display_name || r.username}</span>
              <span style={{ color: '#64748b', marginLeft: '8px', textTransform: 'capitalize' }}>({r.role === 'equipe_projet' ? 'Équipe' : r.role === 'partie_prenante' ? 'Partie prenante' : 'Pour info'})</span>
            </div>
            <button onClick={() => removeRole(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: '13px', padding: '2px 6px', borderRadius: '4px' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>✕</button>
          </div>
        ))}
      </div>
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>
          📋 Types documentaires attendus ({attendus.filter((a: any) => a.attendu_pour_ce_projet).length}/{attendus.length})
        </h3>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
          <button onClick={() => setShowNewType(!showNewType)} style={{ padding: '5px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', color: '#475569' }}>+ Nouveau type</button>
          <button onClick={saveAttendus} disabled={savingAttendus} style={{ padding: '5px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', opacity: savingAttendus ? 0.5 : 1 }}>
            {savingAttendus ? '...' : '💾 Enregistrer'}
          </button>
        </div>
        {showNewType && (
          <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <input value={newTypeCode} onChange={e => setNewTypeCode(e.target.value)} placeholder="Code (ex: doc_technique)" style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', flex: 1, minWidth: '120px' }} />
            <input value={newTypeLabel} onChange={e => setNewTypeLabel(e.target.value)} placeholder="Libellé" style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', flex: 1, minWidth: '120px' }} />
            <select value={newTypePhase} onChange={e => setNewTypePhase(e.target.value)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', background: 'white' }}>
              <option value="">Toutes phases</option>
              {[ { value: 'idee', label: 'Idée' }, { value: 'demande_initiale', label: 'Demande initiale' }, { value: 'etude_dsi', label: 'Étude DSI' }, { value: 'arbitrage', label: 'Arbitrage' }, { value: 'planification', label: 'Planification' }, { value: 'en_cours', label: 'En cours' }, { value: 'en_recette', label: 'En recette' }, { value: 'en_cloture', label: 'En clôture' }, { value: 'cloture', label: 'Clôturé' } ].map((p: any) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#64748b', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={newTypeObligatoire} onChange={e => setNewTypeObligatoire(e.target.checked)} /> Obligatoire
            </label>
            <button onClick={addNewType} style={{ padding: '6px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>Ajouter</button>
          </div>
        )}
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {attendus.map((a: any) => (
            <div key={a.code} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}>
              <input type="checkbox" checked={!!a.attendu_pour_ce_projet} onChange={() => toggleAttendu(a.code)} style={{ cursor: 'pointer' }} />
              <span style={{ flex: 1, color: '#1e293b', fontWeight: a.attendu_pour_ce_projet ? '600' : '400' }}>{a.label}</span>
              <select value={a.phase_projet || a.phase_concernee || ''} onChange={e => setPhase(a.code, e.target.value)}
                style={{ padding: '3px 6px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '11px', background: 'white', opacity: a.attendu_pour_ce_projet ? 1 : 0.5, maxWidth: '130px' }}>
                {[ { value: '', label: 'Toutes phases' }, { value: 'idee', label: 'Idée' }, { value: 'demande_initiale', label: 'Demande initiale' }, { value: 'etude_dsi', label: 'Étude DSI' }, { value: 'arbitrage', label: 'Arbitrage' }, { value: 'planification', label: 'Planification' }, { value: 'en_cours', label: 'En cours' }, { value: 'en_recette', label: 'En recette' }, { value: 'en_cloture', label: 'En clôture' }, { value: 'cloture', label: 'Clôturé' } ].map((p: any) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <span style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>({a.obligatoire ? 'obligatoire' : 'optionnel'})</span>
            </div>
          ))}
        </div>
      </div>
      {/* Suppression du projet (admin/PMO only) */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px', borderLeft: '4px solid #ef4444' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: '700', color: '#dc2626', textTransform: 'uppercase' }}>🗑️ Zone dangereuse</h3>
        <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 12px' }}>
          Supprimer définitivement ce projet et toutes ses dépendances (tâches, jalons, documents, comités, etc.).<br />
          <strong>Cette action est irréversible.</strong>
        </p>
        <button onClick={async () => {
          const confirm1 = window.prompt(`Tapez le code du projet pour confirmer la suppression :\n\nCode : ${projet.code}`);
          if (!confirm1) return;
          if (confirm1.trim().toLowerCase() !== (projet.code || '').trim().toLowerCase()) {
            alert(`Code incorrect. La suppression a été annulée.`);
            return;
          }
          const confirm2 = window.confirm(`Êtes-vous absolument sûr de vouloir supprimer "${projet.titre}" (${projet.code}) ? Cette action supprimera également tous les sous-projets, documents, tâches et comités associés.`);
          if (!confirm2) return;
          try {
            const res = await fetch(`/api/projets/${projetId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
            const data = await res.json();
            if (data.message) {
              window.location.href = '/portefeuille-projets';
            } else {
              alert(data.error || 'Erreur lors de la suppression');
            }
          } catch (e) {
            alert('Erreur lors de la suppression');
          }
        }} style={{ padding: '8px 18px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>
          🗑️ Supprimer le projet
        </button>
      </div>
    </div>
  );
};



export default ProjetDetail;
