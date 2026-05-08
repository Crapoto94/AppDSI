import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, MessageSquare, Calendar, BarChart3, Settings, Activity, Upload, UserPlus, ArrowRight, Plus, Trash2 } from 'lucide-react';
import Header from '../components/Header';
import CreateReunionModal from '../components/CreateReunionModal';
import ReunionDetailModal from '../components/ReunionDetailModal';
import { useAuth } from '../contexts/AuthContext';

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

const TABS = [
  { key: 'infos', label: 'Informations', icon: FileText },
  { key: 'planning', label: 'Planning', icon: Calendar },
  { key: 'journal', label: 'Journal', icon: MessageSquare },
  { key: 'documents', label: 'Documents', icon: FileText },
  { key: 'reunions', label: 'Réunions', icon: Calendar },
  { key: 'score', label: 'Score', icon: BarChart3 },
  { key: 'indicateurs', label: 'Indicateurs', icon: Activity },
  { key: 'admin', label: 'Admin projet', icon: Settings },
];

const ProjetDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const [projet, setProjet] = useState<Projet | null>(null);
  const [loading, setLoading] = useState(true);
  const [ongletActif, setOngletActif] = useState('infos');
  const [transitions, setTransitions] = useState<any[]>([]);
  const [showTransitionPicker, setShowTransitionPicker] = useState(false);
  const [transitionMsg, setTransitionMsg] = useState('');
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [showCreateReunion, setShowCreateReunion] = useState(false);
  const [reunionDetailId, setReunionDetailId] = useState<number | null>(null);
  const [editingGov, setEditingGov] = useState(false);
  const [govForm, setGovForm] = useState({ commanditaire_username: '', chef_projet_username: '', responsable_dsi_username: '', representant_metier_username: '', dpo_username: '', service_pilote: '' });
  const [viewerDoc, setViewerDoc] = useState<{ url: string; nom: string } | null>(null);

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

  useEffect(() => { fetchProjet(); }, [fetchProjet]);

  useEffect(() => {
    if (projet) {
      setGovForm({
        commanditaire_username: projet.commanditaire_username || '',
        chef_projet_username: projet.chef_projet_username || '',
        responsable_dsi_username: projet.responsable_dsi_username || '',
        representant_metier_username: projet.representant_metier_username || '',
        dpo_username: projet.dpo_username || '',
        service_pilote: projet.service_pilote || ''
      });
    }
  }, [projet]);

  const fetchTransitions = useCallback(async () => {
    try {
      const res = await fetch(`/api/projets/${id}/transitions`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.transitions) setTransitions(data.transitions);
    } catch (e) { console.error(e); }
  }, [id, token]);

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

  const renderInfos = () => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Général</h3>
        <InfoRow label="Code" value={projet.code} />
        <InfoRow label="Statut" value={<span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '12px', fontWeight: '600', background: `${STATUT_COLORS[projet.statut] || '#94a3b8'}20`, color: STATUT_COLORS[projet.statut] || '#94a3b8' }}>{STATUT_LABELS[projet.statut] || projet.statut}</span>} />
        <InfoRow label="Niveau" value={projet.niveau_projet} />
        <InfoRow label="Service pilote" value={projet.service_pilote} />
        <InfoRow label="Services associés" value={projet.services?.map(s => s.service_code).join(', ') || '—'} />
        <InfoRow label="Priorité" value={projet.priorite > 0 ? '★'.repeat(projet.priorite) + '☆'.repeat(5 - projet.priorite) : '—'} />
        <InfoRow label="Avancement" value={`${projet.avancement}%`} />
        <InfoRow label="Météo" value={
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <select value={projet.meteo || 'neutre'} onChange={async (e) => {
              await fetch(`/api/projets/${projet.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ meteo: e.target.value })
              });
              fetchProjet();
            }} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', background: 'white', cursor: 'pointer' }}>
              <option value="soleil">☀️ Soleil</option>
              <option value="nuageux">⛅ Nuageux</option>
              <option value="orage">⛈️ Orage</option>
              <option value="neutre">➖ Neutre</option>
            </select>
          </span>
        } />
        <InfoRow label="Score" value={`${projet.score_total}/100`} />
      </div>
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Gouvernance</h3>
          <button onClick={() => setEditingGov(true)} style={{ padding: '5px 12px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', color: '#475569' }}>✏️ Modifier</button>
        </div>
        {editingGov ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <EditGovField label="Commanditaire" value={govForm.commanditaire_username} onChange={v => setGovForm({...govForm, commanditaire_username: v})} />
            <EditGovField label="Chef de projet" value={govForm.chef_projet_username} onChange={v => setGovForm({...govForm, chef_projet_username: v})} />
            <EditGovField label="Responsable DSI" value={govForm.responsable_dsi_username} onChange={v => setGovForm({...govForm, responsable_dsi_username: v})} />
            <EditGovField label="Rep. métier" value={govForm.representant_metier_username} onChange={v => setGovForm({...govForm, representant_metier_username: v})} />
            <EditGovField label="DPO" value={govForm.dpo_username} onChange={v => setGovForm({...govForm, dpo_username: v})} />
            <EditGovField label="Service pilote" value={govForm.service_pilote} onChange={v => setGovForm({...govForm, service_pilote: v})} />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button onClick={async () => {
                await fetch(`/api/projets/${projet.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                  body: JSON.stringify(govForm)
                });
                setEditingGov(false);
                fetchProjet();
              }} style={{ padding: '7px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>
                Enregistrer
              </button>
              <button onClick={() => setEditingGov(false)} style={{ padding: '7px 16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', color: '#64748b' }}>
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <>
            <InfoRow label="Commanditaire" value={projet.commanditaire_username || '—'} />
            <InfoRow label="Chef de projet" value={projet.chef_projet_username || '—'} />
            <InfoRow label="Responsable DSI" value={projet.responsable_dsi_username || '—'} />
            <InfoRow label="Rep. métier" value={projet.representant_metier_username || '—'} />
            <InfoRow label="DPO" value={projet.dpo_username || '—'} />
            <InfoRow label="Créé par" value={projet.created_by_username} />
            <InfoRow label="Créé le" value={projet.date_creation ? new Date(projet.date_creation).toLocaleDateString('fr-FR') : '—'} />
          </>
        )}
      </div>
      {projet.description && (
        <div style={{ gridColumn: '1 / -1', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Description</h3>
          <p style={{ margin: 0, color: '#475569', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>{projet.description}</p>
        </div>
      )}
      <div style={{ gridColumn: '1 / -1', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '14px', fontWeight: '700', color: '#64748b', textTransform: 'uppercase' }}>Équipe & Parties prenantes</h3>
        {projet.roles?.length === 0 ? (
          <p style={{ color: '#94a3b8', fontStyle: 'italic' }}>Aucune personne assignée</p>
        ) : (
          ['equipe_projet', 'partie_prenante', 'pour_info'].map(role => {
            const membres = projet.roles?.filter(r => r.role === role) || [];
            if (membres.length === 0) return null;
            return (
              <div key={role} style={{ marginBottom: '8px' }}>
                <strong style={{ fontSize: '13px', color: '#64748b', textTransform: 'capitalize' }}>
                  {role === 'equipe_projet' ? 'Équipe projet' : role === 'partie_prenante' ? 'Parties prenantes' : 'Pour information'} :
                </strong>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                  {membres.map(m => (
                    <span key={m.id} style={{ padding: '3px 10px', background: '#f1f5f9', borderRadius: '6px', fontSize: '12px', color: '#475569' }}>{m.display_name || m.username}</span>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  const renderPlanning = () => <PlanningTab projetId={projet.id} token={token} />;
  const renderJournal = () => <JournalTab projetId={projet.id} token={token} onOuvrirDocument={(details) => ouvrirDocument(details, projet.id)} />;
  const renderDocuments = () => <DocumentsTab projetId={projet.id} token={token} documents={projet.documents} onVoirDocument={(url, nom) => setViewerDoc({ url, nom })} />;
  const renderReunions = () => <ReunionsTab projetId={projet.id} token={token} onAjouterReunion={() => setShowCreateReunion(true)} onVoirReunion={(id) => setReunionDetailId(id)} />;
  const renderScore = () => <ScoreTab projetId={projet.id} token={token} />;
  const renderIndicateurs = () => <IndicateursTab projetId={projet.id} token={token} />;
  const lierReunionApresCreation = async (reunion: any) => {
  if (reunion?.id) {
    await fetch(`/api/projets/${projet.id}/reunions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reunion_id: reunion.id, type_gouvernance: 'coproj' })
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

const renderAdmin = () => <AdminTab projetId={projet.id} token={token} projet={projet} onRefresh={fetchProjet} />;

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header />
      <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', position: 'relative' }}>
          <button onClick={() => navigate('/portefeuille-projets')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px', display: 'flex', color: '#64748b' }}>
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: '800', color: '#1e293b' }}>{projet.titre}</h1>
            <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>{projet.code}</span>
              <span style={{ padding: '2px 8px', borderRadius: '5px', fontSize: '11px', fontWeight: '600', background: `${STATUT_COLORS[projet.statut] || '#94a3b8'}20`, color: STATUT_COLORS[projet.statut] || '#94a3b8' }}>{STATUT_LABELS[projet.statut] || projet.statut}</span>
              <span>{projet.service_pilote}</span>
            </div>
          </div>
          <button onClick={() => { setShowTransitionPicker(!showTransitionPicker); if (!transitions.length) fetchTransitions(); }}
            style={{ padding: '9px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ArrowRight size={16} /> Changer le statut
          </button>
          {showTransitionPicker && (
            <div style={{ position: 'absolute', top: '100%', right: '0', marginTop: '4px', background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', zIndex: 50, minWidth: '280px', padding: '14px' }}>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>Nouveau statut</div>
              {transitions.length === 0 ? (
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Aucune transition disponible</p>
              ) : transitions.map((t: any) => (
                <div key={t.statut} style={{ marginBottom: '4px' }}>
                  <button onClick={() => effectuerTransition(t.statut)}
                    style={{ width: '100%', padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '600', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t.label}</span>
                    {t.alertes?.length > 0 && <span style={{ fontSize: '11px', padding: '2px 6px', background: '#fef3c7', color: '#d97706', borderRadius: '4px', fontWeight: '700' }}>{t.alertes.length} alerte(s)</span>}
                  </button>
                </div>
              ))}
              <input value={transitionMsg} onChange={e => setTransitionMsg(e.target.value)} placeholder="Commentaire (optionnel)" style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', marginTop: '8px' }} />
              <button onClick={() => setShowTransitionPicker(false)} style={{ width: '100%', padding: '6px', background: 'white', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#64748b', marginTop: '4px' }}>Fermer</button>
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
              </button>
            );
          })}
        </div>

        {ongletActif === 'infos' && renderInfos()}
        {ongletActif === 'planning' && renderPlanning()}
        {ongletActif === 'journal' && renderJournal()}
        {ongletActif === 'documents' && renderDocuments()}
        {ongletActif === 'reunions' && renderReunions()}
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

const EditGovField: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <span style={{ color: '#64748b', fontWeight: '500', fontSize: '13px', minWidth: '120px' }}>{label}</span>
    <input value={value} onChange={e => onChange(e.target.value)} style={{ flex: 1, padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
  </div>
);

// ===== ONGLET PLANNING =====
interface GroupeTache { id: number; titre: string; couleur: string; ordre: number; }
interface Tache { id: number; titre: string; description?: string; date_debut?: string; date_fin?: string; statut: string; responsable_username?: string; couleur: string; ordre: number; groupe_id?: number; }
interface Jalon { id: number; titre: string; description?: string; date_jalon: string; type: string; atteint: number; }
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
  const [newJalon, setNewJalon] = useState({ titre: '', date_jalon: '', type: 'jalon', depend_id: '', depend_type: 'tache' });
  const [showAddGroupe, setShowAddGroupe] = useState(false);
  const [newGroupe, setNewGroupe] = useState({ titre: '', couleur: '#e2e8f0' });
  const [editTache, setEditTache] = useState<{ id: number; titre: string; date_debut: string; date_fin: string; duree: number; statut: string } | null>(null);
  const [editJalon, setEditJalon] = useState<{ id: number; titre: string; date_jalon: string; atteint: number } | null>(null);
  const [showAddDep, setShowAddDep] = useState(false);
  const [newDep, setNewDep] = useState({ source_type: 'tache', source_id: '', depend_type: 'tache', depend_id: '' });

  const loadData = useCallback(async () => {
    try {
      const [rt, rj, rg, rd, rv] = await Promise.all([
        fetch(`/api/projets/${projetId}/taches`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/projets/${projetId}/jalons`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/projets/${projetId}/groupes-taches`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/projets/${projetId}/dependances`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/projets/${projetId}/verifier-dependances`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const dt = await rt.json(); if (Array.isArray(dt)) setTaches(dt);
      const dj = await rj.json(); if (Array.isArray(dj)) setJalons(dj);
      const dg = await rg.json(); if (Array.isArray(dg)) setGroupes(dg);
      const dd = await rd.json(); if (Array.isArray(dd)) setDependances(dd);
      const dv = await rv.json(); if (dv.alertes) setAlertesDep(dv.alertes);
    } catch {}
  }, [projetId, token]);
  useEffect(() => { loadData(); }, [loadData]);

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
      body: JSON.stringify({ titre: editTache.titre, date_debut: editTache.date_debut || null, date_fin: editTache.date_fin || null })
    });
    setEditTache(null); loadData();
  };

  const saveEditJalon = async () => {
    if (!editJalon) return;
    await fetch(`/api/projets/${projetId}/jalons/${editJalon.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(editJalon)
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
      body: JSON.stringify({ titre: newJalon.titre, date_jalon: newJalon.date_jalon })
    });
    const data = await r.json();
    if (data.id && newJalon.depend_id) {
      await fetch(`/api/projets/${projetId}/dependances`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ source_type: 'jalon', source_id: data.id, depend_type: newJalon.depend_type, depend_id: parseInt(newJalon.depend_id) })
      });
    }
    setNewJalon({ titre: '', date_jalon: '', type: 'jalon', depend_id: '', depend_type: 'tache' });
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
  const barTop = (idx: number) => 2 + idx * 30;
  const getIdx = (tid: number) => taches.findIndex(t => t.id === tid);

  const STATUT_LABELS_TACHE: Record<string, string> = { a_faire: 'À faire', en_cours: 'En cours', terminee: 'Terminée', bloquee: 'Bloquée' };
  const STATUT_COLORS_TACHE: Record<string, string> = { a_faire: '#94a3b8', en_cours: '#3b82f6', terminee: '#22c55e', bloquee: '#ef4444' };

  const tachesParGroupe = (groupeId: number | null) => {
    if (groupeId === null) return taches.filter(t => !t.groupe_id);
    return taches.filter(t => t.groupe_id === groupeId);
  };
  const groupesAvecTaches = [...groupes, { id: 0, titre: 'Sans groupe', couleur: '#f1f5f9', ordre: 999 } as GroupeTache].filter(g => g.id === 0 ? tachesParGroupe(null).length > 0 : tachesParGroupe(g.id).length > 0);

  const allItems = [...taches.map(t => ({ type: 'tache' as const, id: t.id, titre: t.titre, date_debut: t.date_debut, date_fin: t.date_fin })), ...jalons.map(j => ({ type: 'jalon' as const, id: j.id, titre: j.titre, date_debut: j.date_jalon, date_fin: j.date_jalon }))];

  return (
    <div>
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
            {/* Jalons en 1ère ligne */}
            {jalons.length > 0 && (
              <div style={{ marginLeft: '200px', marginBottom: '12px' }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px' }}>📍 Jalons ({jalons.length})</div>
                <div style={{ width: `${ganttW}px`, position: 'relative', height: '26px', background: '#faf5ff', borderRadius: '6px', padding: '2px 0' }}>
                  {jalons.map(j => {
                    const estEnRetard = !j.atteint && new Date(j.date_jalon) < today;
                    const depTache = dependances.filter(d => d.depend_type === 'jalon' && d.depend_id === j.id);
                    const depVersTache = depTache.map(d => taches.find(tc => tc.id === d.source_id)).filter(Boolean);
                    const depDeTache = dependances.filter(d => d.source_type === 'jalon' && d.source_id === j.id);
                    return (
                      <div key={j.id} style={{ position: 'absolute', left: `${toX(j.date_jalon)}px`, top: '3px', transform: 'translateX(-50%)', fontSize: '14px', zIndex: 2, display: 'flex', alignItems: 'center', gap: '2px', cursor: 'pointer' }}
                        title={`${j.titre} (${new Date(j.date_jalon).toLocaleDateString('fr-FR')})${estEnRetard ? ' - EN RETARD!' : ''}${depVersTache.length ? ' - Lié à: ' + depVersTache.map(t => t.titre).join(', ') : ''}${depDeTache.length ? ' - Dépend de tâche' : ''}`}>
                        {j.atteint ? '✅' : estEnRetard ? '🔴' : '📍'}
                        <span style={{ fontSize: '9px', color: estEnRetard ? '#dc2626' : '#6d28d9', fontWeight: '600', whiteSpace: 'nowrap', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.titre}</span>
                        {estEnRetard && <span style={{ fontSize: '8px', color: '#dc2626', fontWeight: '800' }}>⚠️</span>}
                      </div>
                    );
                  })}
                  {/* Flèches de dépendance tâche → jalon */}
                  {dependances.filter(d => d.depend_type === 'jalon').map(d => {
                    const tache = taches.find(tc => tc.id === d.source_id);
                    const jalon = jalons.find(jj => jj.id === d.depend_id);
                    if (!tache || !tache.date_fin || !jalon) return null;
                    const xFin = toX(tache.date_fin);
                    const xJal = toX(jalon.date_jalon);
                    if (xFin >= xJal) return null;
                    return (
                      <div key={d.id} style={{ position: 'absolute', left: `${xFin}px`, top: '12px', width: `${xJal - xFin}px`, height: '2px', zIndex: 1, pointerEvents: 'none' }}>
                        <svg width={xJal - xFin + 2} height="2" style={{ display: 'block' }}>
                          <line x1="0" y1="1" x2={xJal - xFin} y2="1" stroke="#8b5cf6" strokeWidth="1.5" strokeDasharray="3,2" />
                        </svg>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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

      {/* Liste tâches avec édition et dépendances */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', fontWeight: '700', fontSize: '14px', color: '#64748b', textTransform: 'uppercase' }}>📋 Tâches ({taches.length})</div>
        {taches.length === 0 ? (<p style={{ padding: '20px', color: '#94a3b8', fontSize: '13px', textAlign: 'center', margin: 0 }}>Aucune tâche</p>)
        : taches.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 18px', borderBottom: '1px solid #f1f5f9' }}>
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
                <span style={{ fontSize: '10px', color: '#64748b', whiteSpace: 'nowrap' }}>{editTache.duree > 0 ? `${editTache.duree}j` : ''}</span>
                <button onClick={saveEditTache} style={{ padding: '4px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>OK</button>
                <button onClick={() => setEditTache(null)} style={{ padding: '4px 10px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#64748b' }}>✕</button>
              </div>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: t.statut === 'terminee' ? '#94a3b8' : '#1e293b', textDecoration: t.statut === 'terminee' ? 'line-through' : 'none', cursor: 'pointer' }}
                  onClick={() => {
                    const duree = t.date_debut && t.date_fin ? Math.round((new Date(t.date_fin).getTime() - new Date(t.date_debut).getTime()) / 86400000) : 0;
                    setEditTache({ id: t.id, titre: t.titre, date_debut: t.date_debut || '', date_fin: t.date_fin || '', duree: Math.max(duree, 0), statut: t.statut });
                  }}>{t.titre}</span>
                {t.groupe_id && <span style={{ fontSize: '11px', color: '#94a3b8' }}>{groupes.find(g => g.id === t.groupe_id)?.titre || ''}</span>}
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
        ))}
      </div>

      {/* Jalons avec édition */}
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', fontWeight: '700', fontSize: '14px', color: '#64748b', textTransform: 'uppercase' }}>📍 Jalons ({jalons.length})</div>
        {jalons.length === 0 ? (<p style={{ padding: '20px', color: '#94a3b8', fontSize: '13px', textAlign: 'center', margin: 0 }}>Aucun jalon</p>)
        : jalons.map(j => (
          <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 18px', borderBottom: '1px solid #f1f5f9' }}>
            <input type="checkbox" checked={!!j.atteint} onChange={() => toggleJalon(j)} style={{ cursor: 'pointer' }} />
            {editJalon?.id === j.id ? (
              <div style={{ display: 'flex', gap: '6px', flex: 1, alignItems: 'center' }}>
                <input value={editJalon.titre} onChange={e => setEditJalon({...editJalon, titre: e.target.value})} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '13px', flex: 1 }} />
                <input type="date" value={editJalon.date_jalon} onChange={e => setEditJalon({...editJalon, date_jalon: e.target.value})} style={{ padding: '4px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', fontSize: '12px' }} />
                <button onClick={saveEditJalon} style={{ padding: '4px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>OK</button>
                <button onClick={() => setEditJalon(null)} style={{ padding: '4px 10px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', color: '#64748b' }}>✕</button>
              </div>
            ) : (
              <>
                <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: j.atteint ? '#16a34a' : '#1e293b', textDecoration: j.atteint ? 'line-through' : 'none', cursor: 'pointer' }}
                  onClick={() => setEditJalon({ id: j.id, titre: j.titre, date_jalon: j.date_jalon, atteint: j.atteint })}>{j.titre}</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>📅 {new Date(j.date_jalon).toLocaleDateString('fr-FR')}</span>
                {dependances.filter(d => d.source_type === 'jalon' && d.source_id === j.id).map(d => (
                  <span key={d.id} style={{ fontSize: '10px', padding: '1px 5px', background: '#f1f5f9', borderRadius: '3px' }}>🔗 {d.depend_label} <button onClick={() => supprimerDep(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, fontSize: '10px' }}>✕</button></span>
                ))}
              </>
            )}
            <button onClick={() => supprimerJalon(j.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cbd5e1', padding: '2px' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')} onMouseLeave={e => (e.currentTarget.style.color = '#cbd5e1')}><Trash2 size={12} /></button>
          </div>
        ))}
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
  const [entries, setEntries] = useState<any[]>([]);
  const [newEntryMsg, setNewEntryMsg] = useState('');
  const [newEntryType, setNewEntryType] = useState('note');
  const [adding, setAdding] = useState(false);

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
      await fetch(`/api/projets/${projetId}/journal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type_entree: newEntryType, message: newEntryMsg })
      });
      setNewEntryMsg('');
      loadJournal();
    } catch (e) { console.error(e); }
    finally { setAdding(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <select value={newEntryType} onChange={e => setNewEntryType(e.target.value)} style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px', background: 'white' }}>
            <option value="note">📝 Note</option>
            <option value="decision">⚖️ Décision</option>
            <option value="action">✅ Action</option>
            <option value="alerte">⚠️ Alerte</option>
            <option value="evenement">📌 Événement</option>
          </select>
          <input value={newEntryMsg} onChange={e => setNewEntryMsg(e.target.value)} placeholder="Ajouter un événement au journal..." style={{ flex: 1, padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}
            onKeyDown={e => { if (e.key === 'Enter') addEntry(); }} />
          <button onClick={addEntry} disabled={adding || !newEntryMsg.trim()} style={{ padding: '7px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', opacity: (adding || !newEntryMsg.trim()) ? 0.5 : 1, whiteSpace: 'nowrap', fontSize: '13px' }}>
            Ajouter
          </button>
        </div>
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
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { setDocs(documents); }, [documents]);

  const handleUpload = async () => {
    if (!uploadType || (!uploadFile && !uploadUrl)) return;
    setUploading(true);
    const docRes = await fetch(`/api/projets/${projetId}/documents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type_documentaire: uploadType, est_contractuel: uploadContractuel, url: uploadUrl || null })
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

    setShowUpload(false); setUploadFile(null); setUploadUrl(''); setUploadType(''); setUploadContractuel(false);
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
    const form = new FormData();
    files.forEach(f => form.append('files', f));
    await fetch(`/api/projets/${projetId}/documents/versions/vrac`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form
    });
    const r = await fetch(`/api/projets/${projetId}/documents`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    if (Array.isArray(d)) setDocs(d);
    setUploading(false);
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
      <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
        style={{ background: dragOver ? '#eff6ff' : '#f8fafc', borderRadius: '12px', border: `2px dashed ${dragOver ? '#2563eb' : '#e2e8f0'}`, padding: '30px', marginBottom: '16px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s' }}>
        <div style={{ fontSize: '13px', color: dragOver ? '#2563eb' : '#94a3b8', fontWeight: '600' }}>
          📦 Glissez-déposez des fichiers ici<br />
          <span style={{ fontSize: '11px', fontWeight: '400' }}>Ils seront classés comme "documentation en vrac"</span>
        </div>
      </div>

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
                    ) : <span style={{ color: '#cbd5e1', fontSize: '12px' }}>—</span>}
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
  const [reunions, setReunions] = useState<any[]>([]);
  const loadReunions = useCallback(async () => {
    try {
      const r = await fetch(`/api/projets/${projetId}/reunions`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      if (Array.isArray(d)) setReunions(d);
    } catch {}
  }, [projetId, token]);
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
            <div key={r.id} onClick={() => onVoirReunion(r.id)} style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '14px 18px', cursor: 'pointer' }}>
              <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '14px' }}>{r.titre}</div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                <span>📅 {r.date_reunion ? new Date(r.date_reunion).toLocaleDateString('fr-FR') : '—'}</span>
                {r.type_gouvernance && <span style={{ padding: '1px 6px', background: '#f1f5f9', borderRadius: '4px', fontSize: '11px', fontWeight: '600', color: '#2563eb' }}>{r.type_gouvernance}</span>}
                <span>👥 {r.participant_count} participants</span>
              </div>
            </div>
          ))}
        </div>
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
  useEffect(() => {
    fetch(`/api/projets/${projetId}/indicateurs`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setIndicateurs(d); }).catch(() => {});
  }, [projetId, token]);
  if (indicateurs.length === 0) return <p style={{ color: '#94a3b8', textAlign: 'center', padding: '40px' }}>Aucun indicateur saisi</p>;
  return (
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
  );
};

// ===== ONGLET ADMIN =====
const AdminTab: React.FC<{ projetId: number; token: string | null; projet: Projet; onRefresh: () => void }> = ({ projetId, token, projet, onRefresh }) => {
  const [controles, setControles] = useState<any[]>([]);
  const [showAddRole, setShowAddRole] = useState(false);
  const [newRoleUsername, setNewRoleUsername] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleRole, setNewRoleRole] = useState('equipe_projet');

  useEffect(() => {
    fetch(`/api/projets/${projetId}/controles`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.controles) setControles(d.controles); }).catch(() => {});
  }, [projetId, token]);

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
    </div>
  );
};
export default ProjetDetail;
