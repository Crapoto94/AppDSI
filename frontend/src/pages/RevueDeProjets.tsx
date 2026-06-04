import { useState, useEffect, useCallback } from 'react';
import { Users } from 'lucide-react';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import AddTaskModal from '../components/AddTaskModal';
import { useADSearch } from '../utils/useADSearch';
import { isAdminLike } from '../utils/roles';

interface Projet {
  id: number; code: string; titre: string; statut: string;
  priorite: number; meteo: string; score_total: number; avancement: number;
}

interface Revue {
  id: number; titre: string; date_revue: string; lieu: string;
  participants: { username: string; displayName: string }[];
  projets: RevueProjet[];
  created_at: string;
  projet_codes?: string;
  projet_count?: number;
}

interface RevueProjet {
  id: number; revue_id: number; projet_id: number;
  projet_code: string; projet_titre: string; projet_priorite: number;
  projet_meteo: string; commentaire_precedent?: string;
  commentaire?: string; taches: RevueTache[];
}

interface RevueTache {
  id: number; revue_projet_id: number; titre: string; statut: string;
  responsable?: string; echeance?: string;
}

const METEO_EMOJI: Record<string, string> = {
  orage: '⛈️', nuageux: '☁️', soleil: '☀️', neutre: '➖'
};

const PRIORITE_STARS = (n: number) => '⭐'.repeat(Math.max(1, Math.min(5, n)));

export default function RevueDeProjets() {
  const { token, user } = useAuth();
  const isPMO = user?.est_pmo || isAdminLike(user);

  const [revues, setRevues] = useState<Revue[]>([]);
  const [selectedRevue, setSelectedRevue] = useState<Revue | null>(null);
  const [projets, setProjets] = useState<Projet[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creationStep, setCreationStep] = useState(1);
  const [dateRevue, setDateRevue] = useState('');
  const [lieu, setLieu] = useState('');
  const ad = useADSearch(token);
  const [selectedProjets, setSelectedProjets] = useState<Set<number>>(new Set());
  const [participants, setParticipants] = useState<{ username: string; displayName: string }[]>([]);
  const [commentaires, setCommentaires] = useState<Record<number, string>>({});
  const [tacheInput, setTacheInput] = useState<Record<number, { titre: string; responsable: string; echeance: string }>>({});
  const [showAddProjets, setShowAddProjets] = useState(false);
  const [addProjetSelection, setAddProjetSelection] = useState<Set<number>>(new Set());
  const [step2Commentaires, setStep2Commentaires] = useState<Record<number, string>>({});
  const [step2Taches, setStep2Taches] = useState<Record<number, { titre: string; responsable: string; echeance: string }[]>>({});
  const [step2TacheInput, setStep2TacheInput] = useState<Record<number, { titre: string; responsable: string; echeance: string }>>({});
  const [step2PrevCommentaires, setStep2PrevCommentaires] = useState<Record<number, { commentaire: string; date_revue: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error] = useState('');
  // Team task modal for revue
  const [teamTaskContext, setTeamTaskContext] = useState<{ revueId: number; revueTitre: string; projetTitre?: string } | null>(null);
  const [hubTasks, setHubTasks] = useState<any[]>([]);

  const fetchRevues = useCallback(async () => {
    try {
      const res = await fetch('/api/revues', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setRevues(Array.isArray(data) ? data : []);
      }
    } catch { /* ignore */ }
  }, [token]);

  const fetchProjets = useCallback(async () => {
    try {
      const res = await fetch('/api/projets?tri=priorite', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setProjets(data);
      }
    } catch { /* ignore */ }
  }, [token]);

  const fetchRevueDetail = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/revues/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setSelectedRevue(data);
      }
    } catch { /* ignore */ }
  }, [token]);

  const fetchHubTasks = useCallback(async (revueId: number) => {
    try {
      const res = await fetch(`/api/tasks/by-context?source=revue&id=${revueId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setHubTasks(await res.json());
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    Promise.all([fetchRevues(), fetchProjets()]).finally(() => setLoading(false));
  }, [fetchRevues, fetchProjets]);

  const addParticipant = (u: { username: string; displayName: string }) => {
    if (participants.some(p => p.username === u.username)) return;
    setParticipants(prev => [...prev, { username: u.username, displayName: u.displayName }]);
    ad.setQuery('');
    ad.clearResults();
  };

  const removeParticipant = (username: string) => {
    setParticipants(prev => prev.filter(p => p.username !== username));
  };

  const toggleProjet = (id: number) => {
    setSelectedProjets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleNextStep = async () => {
    if (!dateRevue) { alert('La date est obligatoire'); return; }
    if (selectedProjets.size === 0) { alert('Sélectionnez au moins un projet'); return; }
    setCreationStep(2);
    try {
      const res = await fetch('/api/revues/previous-commentaires', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projet_ids: Array.from(selectedProjets) })
      });
      if (res.ok) {
        const data = await res.json();
        setStep2PrevCommentaires(data || {});
      }
    } catch { /* ignore */ }
  };

  const resetCreateForm = () => {
    setShowCreate(false);
    setCreationStep(1);
    setDateRevue('');
    setLieu('');
    setSelectedProjets(new Set());
    setParticipants([]);
    setStep2Commentaires({});
    setStep2Taches({});
    setStep2TacheInput({});
    setStep2PrevCommentaires({});
  };

  const addStep2Tache = (projetId: number) => {
    const input = step2TacheInput[projetId];
    if (!input?.titre?.trim()) return;
    setStep2Taches(prev => ({ ...prev, [projetId]: [...(prev[projetId] || []), { titre: input.titre.trim(), responsable: input.responsable || '', echeance: input.echeance || '' }] }));
    setStep2TacheInput(prev => ({ ...prev, [projetId]: { titre: '', responsable: '', echeance: '' } }));
  };

  const removeStep2Tache = (projetId: number, index: number) => {
    setStep2Taches(prev => ({ ...prev, [projetId]: prev[projetId].filter((_, i) => i !== index) }));
  };

  const handleCreate = async () => {
    if (!dateRevue) { alert('La date est obligatoire'); return; }
    if (selectedProjets.size === 0) { alert('Sélectionnez au moins un projet'); return; }
    try {
      const body = {
        date_revue: dateRevue,
        lieu,
        participants,
        projet_ids: Array.from(selectedProjets),
        commentaires: step2Commentaires,
        taches: step2Taches
      };
      const res = await fetch('/api/revues', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const created = await res.json();
        setRevues(prev => [created, ...prev]);
        resetCreateForm();
      } else {
        const err = await res.json();
        alert(`Erreur : ${err.error}`);
      }
    } catch { alert('Erreur création revue'); }
  };

  const handleSelectRevue = async (revue: Revue) => {
    await fetchRevueDetail(revue.id);
    fetchHubTasks(revue.id);
  };

  const handleAddTache = async (projetId: number) => {
    if (!selectedRevue) return;
    const input = tacheInput[projetId];
    if (!input?.titre?.trim()) return;
    try {
      const res = await fetch(`/api/revues/${selectedRevue.id}/taches`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ revue_projet_id: projetId, titre: input.titre.trim(), responsable: input.responsable || '', echeance: input.echeance || null })
      });
      if (res.ok) {
        const created = await res.json();
        if (selectedRevue) {
          setSelectedRevue({
            ...selectedRevue,
            projets: selectedRevue.projets.map(rp =>
              rp.id === projetId ? { ...rp, taches: [...(rp.taches || []), created] } : rp
            )
          });
        }
        setTacheInput(prev => ({ ...prev, [projetId]: { titre: '', responsable: '', echeance: '' } }));
      }
    } catch { alert('Erreur ajout tâche'); }
  };

  const handleDeleteTache = async (tacheId: number, revueProjetId: number) => {
    if (!selectedRevue) return;
    try {
      const res = await fetch(`/api/revues/${selectedRevue.id}/taches/${tacheId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok && selectedRevue) {
        setSelectedRevue({
          ...selectedRevue,
          projets: selectedRevue.projets.map(rp =>
            rp.id === revueProjetId
              ? { ...rp, taches: rp.taches.filter(t => t.id !== tacheId) }
              : rp
          )
        });
      }
    } catch { alert('Erreur suppression tâche'); }
  };

  const handleDeleteRevue = async (revueId: number) => {
    if (!confirm('Supprimer cette revue de projets ?')) return;
    try {
      const res = await fetch(`/api/revues/${revueId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setRevues(prev => prev.filter(r => r.id !== revueId));
        setSelectedRevue(null);
      } else {
        const err = await res.json();
        alert(`Erreur : ${err.error}`);
      }
    } catch { alert('Erreur suppression revue'); }
  };

  const handleAddProjets = async () => {
    if (!selectedRevue || addProjetSelection.size === 0) return;
    try {
      const res = await fetch(`/api/revues/${selectedRevue.id}/projets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ projet_ids: Array.from(addProjetSelection) })
      });
      if (res.ok) {
        setShowAddProjets(false);
        setAddProjetSelection(new Set());
        await fetchRevueDetail(selectedRevue.id);
      } else {
        const err = await res.json();
        alert(`Erreur : ${err.error}`);
      }
    } catch { alert('Erreur ajout projets'); }
  };

  const handleSaveCommentaireAuto = async (projetId: number, texte: string) => {
    if (!selectedRevue || !texte?.trim()) return;
    try {
      await fetch(`/api/revues/${selectedRevue.id}/projets/${projetId}/commentaire`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentaire: texte })
      });
    } catch { /* ignore */ }
  };

  const projetsActifs = projets.filter(p => p.statut !== 'suspendu' && p.statut !== 'refuse');
  const mauvaisMeteo = projetsActifs
    .filter(p => p.meteo === 'orage' || p.meteo === 'nuageux')
    .sort((a, b) => b.priorite - a.priorite);
  const autresActifs = projetsActifs
    .filter(p => p.meteo !== 'orage' && p.meteo !== 'nuageux')
    .sort((a, b) => b.priorite - a.priorite);

  return (
    <div style={{ background: '#f1f5f9', minHeight: '100vh' }}>
      <Header />
      {!isPMO ? (
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '60px 20px', textAlign: 'center' }}>
          <p style={{ color: '#94a3b8', fontSize: '16px' }}>Accès réservé aux PMO.</p>
        </div>
      ) : (
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: '#1e293b' }}>📋 Revues de projets</h1>
              {selectedRevue && (
                <button onClick={() => { setSelectedRevue(null); setCommentaires({}); setHubTasks([]); }} style={{ marginTop: '8px', background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', fontWeight: '600', padding: 0 }}>
                  ← Retour à la liste
                </button>
              )}
            </div>
            {!selectedRevue && (
              <button onClick={() => setShowCreate(v => !v)} style={{ padding: '10px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>
                {showCreate ? '✕ Annuler' : '➕ Nouvelle revue'}
              </button>
            )}
          </div>

          {error && <div style={{ padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

          {showCreate && !selectedRevue && creationStep === 1 && (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', marginBottom: '24px' }}>
              <h2 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>Nouvelle revue — Étape 1/2</h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>DATE & HEURE *</label>
                  <input type="datetime-local" value={dateRevue} onChange={e => setDateRevue(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px' }}>LIEU</label>
                  <input type="text" placeholder="Ex: Salle Ivry" value={lieu} onChange={e => setLieu(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px' }} />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>Participants ({participants.length})</h3>
                <div style={{ background: '#eff6ff', borderRadius: '10px', padding: '14px', marginBottom: '10px' }}>
                  <div style={{ position: 'relative' }}>
                    <input type="text" placeholder="Rechercher par nom (AD)..." value={ad.query} onChange={e => ad.setQuery(e.target.value)} style={{ width: '100%', padding: '9px 12px', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '14px' }} />
                    {ad.searching && <span style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#64748b' }}>...</span>}
                  </div>
                  {ad.results.length > 0 && (
                    <div style={{ marginTop: '8px', border: '1px solid #bfdbfe', borderRadius: '8px', background: 'white', maxHeight: '160px', overflowY: 'auto' }}>
                      {ad.results.map(u => (
                        <div key={u.username} onClick={() => addParticipant(u)}
                          style={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#eff6ff'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: '600' }}>{u.displayName}</div>
                            <div style={{ fontSize: '11px', color: '#64748b' }}>{u.email}{u.service ? ` — ${u.service}` : ''}</div>
                          </div>
                          <span style={{ fontSize: '11px', color: '#2563eb' }}>+ Ajouter</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {participants.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {participants.map(p => (
                      <span key={p.username} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: '600', color: '#1e293b' }}>
                        {p.displayName}
                        <span onClick={() => removeParticipant(p.username)} style={{ cursor: 'pointer', color: '#94a3b8', marginLeft: '2px' }}>✕</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>Projets à inclure</h3>
                {mauvaisMeteo.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '700', color: '#dc2626' }}>⚠️ Projets actifs avec mauvaise météo</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {mauvaisMeteo.map(p => (
                        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: selectedProjets.has(p.id) ? '#fef2f2' : 'white', border: selectedProjets.has(p.id) ? '1px solid #fecaca' : '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                          <input type="checkbox" checked={selectedProjets.has(p.id)} onChange={() => toggleProjet(p.id)} />
                          <span>{METEO_EMOJI[p.meteo] || '❓'}</span>
                          <span style={{ color: '#1e293b', fontWeight: '600' }}>{p.code}</span>
                          <span style={{ color: '#475569' }}>- {p.titre}</span>
                          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8' }}>{PRIORITE_STARS(p.priorite)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {autresActifs.length > 0 && (
                  <div>
                    <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '700', color: '#475569' }}>📊 Autres projets actifs</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {autresActifs.map(p => (
                        <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: selectedProjets.has(p.id) ? '#f0f9ff' : 'white', border: selectedProjets.has(p.id) ? '1px solid #bfdbfe' : '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' }}>
                          <input type="checkbox" checked={selectedProjets.has(p.id)} onChange={() => toggleProjet(p.id)} />
                          <span>{METEO_EMOJI[p.meteo] || '➖'}</span>
                          <span style={{ color: '#1e293b', fontWeight: '600' }}>{p.code}</span>
                          <span style={{ color: '#475569' }}>- {p.titre}</span>
                          <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8' }}>{PRIORITE_STARS(p.priorite)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {projetsActifs.length === 0 && (
                  <p style={{ color: '#94a3b8', fontSize: '13px' }}>Aucun projet actif disponible.</p>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button onClick={() => { setShowCreate(false); setCreationStep(1); }} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#475569' }}>Annuler</button>
                <button onClick={handleNextStep} style={{ padding: '10px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}>
                  Suivant →
                </button>
              </div>
            </div>
          )}

          {showCreate && !selectedRevue && creationStep === 2 && (
            <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', marginBottom: '24px' }}>
              <h2 style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: '700', color: '#1e293b' }}>Nouvelle revue — Étape 2/2</h2>
              <p style={{ margin: '0 0 20px', fontSize: '13px', color: '#64748b' }}>
                Notes et tâches pour les {selectedProjets.size} projet(s) sélectionné(s)
              </p>

              {projets.filter(p => selectedProjets.has(p.id)).map(projet => (
                <div key={projet.id} style={{ marginBottom: '20px', padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontWeight: '700', fontSize: '14px', color: '#1e293b' }}>
                      {METEO_EMOJI[projet.meteo] || '➖'} {projet.code} - {projet.titre}
                    </span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{PRIORITE_STARS(projet.priorite)}</span>
                  </div>

                  {step2PrevCommentaires[projet.id] && (
                    <div style={{ marginBottom: '12px', padding: '10px', background: '#f1f5f9', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Commentaire précédent{step2PrevCommentaires[projet.id].date_revue ? ' du ' + new Date(step2PrevCommentaires[projet.id].date_revue).toLocaleDateString('fr-FR') : ''}
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#475569', fontStyle: 'italic' }}>{step2PrevCommentaires[projet.id].commentaire}</p>
                    </div>
                  )}

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Note / Commentaire</label>
                    <textarea rows={2} placeholder="Commentaire pour ce projet..." value={step2Commentaires[projet.id] ?? ''} onChange={e => setStep2Commentaires(prev => ({ ...prev, [projet.id]: e.target.value }))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Tâches à ajouter</label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <input type="text" placeholder="Tâche *" value={step2TacheInput[projet.id]?.titre ?? ''} onChange={e => setStep2TacheInput(prev => ({ ...prev, [projet.id]: { ...(prev[projet.id] || { titre: '', responsable: '', echeance: '' }), titre: e.target.value } }))} onKeyDown={e => { if (e.key === 'Enter') addStep2Tache(projet.id); }} style={{ flex: '2', minWidth: '140px', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px' }} />
                      <input type="text" placeholder="Responsable" value={step2TacheInput[projet.id]?.responsable ?? ''} onChange={e => setStep2TacheInput(prev => ({ ...prev, [projet.id]: { ...(prev[projet.id] || { titre: '', responsable: '', echeance: '' }), responsable: e.target.value } }))} style={{ flex: '1', minWidth: '100px', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px' }} />
                      <input type="date" value={step2TacheInput[projet.id]?.echeance ?? ''} onChange={e => setStep2TacheInput(prev => ({ ...prev, [projet.id]: { ...(prev[projet.id] || { titre: '', responsable: '', echeance: '' }), echeance: e.target.value } }))} style={{ flex: '1', minWidth: '120px', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px' }} />
                      <button onClick={() => addStep2Tache(projet.id)} style={{ padding: '8px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap' }}>+ Ajouter</button>
                    </div>
                    {step2Taches[projet.id] && step2Taches[projet.id].length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {step2Taches[projet.id].map((t, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#94a3b8', flexShrink: 0 }} />
                            <span style={{ color: '#1e293b', fontWeight: '500' }}>{t.titre}</span>
                            <span style={{ color: '#64748b', marginLeft: '4px' }}>
                              {t.responsable && <span style={{ marginRight: '8px' }}>👤 {t.responsable}</span>}
                              {t.echeance && <span>📅 {new Date(t.echeance + 'T00:00:00').toLocaleDateString('fr-FR')}</span>}
                            </span>
                            <span onClick={() => removeStep2Tache(projet.id, i)} style={{ marginLeft: 'auto', cursor: 'pointer', color: '#94a3b8', fontSize: '11px' }}>✕</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <button onClick={() => setCreationStep(1)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#475569' }}>
                  ← Retour
                </button>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button onClick={resetCreateForm} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#475569' }}>Annuler</button>
                  <button onClick={handleCreate} style={{ padding: '10px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700' }}>
                    Créer la revue
                  </button>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <p style={{ color: '#94a3b8', textAlign: 'center', padding: '60px' }}>Chargement...</p>
          ) : selectedRevue ? (
            <div>
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '24px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#1e293b' }}>{selectedRevue.titre || 'Revue du ' + new Date(selectedRevue.date_revue).toLocaleDateString('fr-FR')}</h2>
                  <button onClick={() => handleDeleteRevue(selectedRevue.id)} style={{ padding: '8px 14px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>
                    🗑️ Supprimer
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: '#475569' }}>
                  <span>📅 {new Date(selectedRevue.date_revue).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  {selectedRevue.lieu && <span>📍 {selectedRevue.lieu}</span>}
                  <span>👥 {selectedRevue.participants?.length || 0} participant(s)</span>
                  <span>📊 {selectedRevue.projets?.length || 0} projet(s)</span>
                </div>
                {selectedRevue.participants && selectedRevue.participants.length > 0 && (
                  <div style={{ marginTop: '12px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedRevue.participants.map(p => (
                      <span key={p.username} style={{ background: '#f1f5f9', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', fontWeight: '500', color: '#475569' }}>{p.displayName}</span>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowAddProjets(v => !v); setAddProjetSelection(new Set()); }} style={{ padding: '8px 14px', background: '#f0f9ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '12px' }}>
                  {showAddProjets ? '✕ Annuler' : '➕ Ajouter des projets'}
                </button>
              </div>

              {showAddProjets && (
                <div style={{ marginBottom: '20px', padding: '16px', background: 'white', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#1e293b' }}>Ajouter des projets à cette revue</h3>
                  {projets.filter(p => p.statut !== 'suspendu' && p.statut !== 'refuse' && !selectedRevue.projets.some(rp => rp.projet_id === p.id)).map(p => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: addProjetSelection.has(p.id) ? '#eff6ff' : 'white', border: addProjetSelection.has(p.id) ? '1px solid #bfdbfe' : '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', marginBottom: '4px' }}>
                      <input type="checkbox" checked={addProjetSelection.has(p.id)} onChange={() => setAddProjetSelection(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} />
                      <span>{METEO_EMOJI[p.meteo] || '➖'}</span>
                      <span style={{ color: '#1e293b', fontWeight: '600' }}>{p.code}</span>
                      <span style={{ color: '#475569' }}>- {p.titre}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#94a3b8' }}>{PRIORITE_STARS(p.priorite)}</span>
                    </label>
                  ))}
                  {projets.filter(p => p.statut !== 'suspendu' && p.statut !== 'refuse' && !selectedRevue.projets.some(rp => rp.projet_id === p.id)).length === 0 && (
                    <p style={{ color: '#94a3b8', fontSize: '13px' }}>Tous les projets sont déjà dans cette revue.</p>
                  )}
                  {addProjetSelection.size > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                      <button onClick={handleAddProjets} style={{ padding: '8px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}>
                        Ajouter ({addProjetSelection.size})
                      </button>
                    </div>
                  )}
                </div>
              )}

              {selectedRevue.projets?.map(rp => (
                <div key={rp.id} style={{ marginBottom: '20px', padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <a href={`/projets/${rp.projet_id}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: '700', fontSize: '14px', color: '#2563eb', textDecoration: 'none' }}>
                      {METEO_EMOJI[rp.projet_meteo] || '➖'} {rp.projet_code} - {rp.projet_titre}
                    </a>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{PRIORITE_STARS(rp.projet_priorite)}</span>
                  </div>

                  {rp.commentaire_precedent && (
                    <div style={{ marginBottom: '12px', padding: '10px', background: '#f1f5f9', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                      <p style={{ margin: '0 0 4px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Commentaire précédent</p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#475569', fontStyle: 'italic' }}>{rp.commentaire_precedent}</p>
                    </div>
                  )}

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Note / Commentaire</label>
                    <textarea rows={2} placeholder="Commentaire pour ce projet..." value={commentaires[rp.projet_id] ?? rp.commentaire ?? ''}
                      onChange={e => { setCommentaires(prev => ({ ...prev, [rp.projet_id]: e.target.value })); }}
                      onBlur={e => handleSaveCommentaireAuto(rp.projet_id, e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px', resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#475569', marginBottom: '4px' }}>Tâches</label>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <input type="text" placeholder="Tâche *" value={tacheInput[rp.id]?.titre ?? ''} onChange={e => setTacheInput(prev => ({ ...prev, [rp.id]: { ...(prev[rp.id] || { titre: '', responsable: '', echeance: '' }), titre: e.target.value } }))} onKeyDown={e => { if (e.key === 'Enter') handleAddTache(rp.id); }} style={{ flex: '2', minWidth: '140px', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px' }} />
                      <input type="text" placeholder="Responsable" value={tacheInput[rp.id]?.responsable ?? ''} onChange={e => setTacheInput(prev => ({ ...prev, [rp.id]: { ...(prev[rp.id] || { titre: '', responsable: '', echeance: '' }), responsable: e.target.value } }))} style={{ flex: '1', minWidth: '100px', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px' }} />
                      <input type="date" value={tacheInput[rp.id]?.echeance ?? ''} onChange={e => setTacheInput(prev => ({ ...prev, [rp.id]: { ...(prev[rp.id] || { titre: '', responsable: '', echeance: '' }), echeance: e.target.value } }))} style={{ flex: '1', minWidth: '120px', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '13px' }} />
                      <button onClick={() => handleAddTache(rp.id)} style={{ padding: '8px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap' }}>+ Ajouter</button>
                      <button onClick={() => setTeamTaskContext({ revueId: selectedRevue.id, revueTitre: selectedRevue.titre || '', projetTitre: rp.projet_titre })} style={{ padding: '8px 14px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '4px' }}><Users size={13} /> Équipe</button>
                    </div>
                    {rp.taches && rp.taches.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {rp.taches.map(t => (
                          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: 'white', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.statut === 'faite' ? '#22c55e' : '#94a3b8', flexShrink: 0 }} />
                            <span style={{ color: '#1e293b', fontWeight: t.statut === 'faite' ? '400' : '500', textDecoration: t.statut === 'faite' ? 'line-through' : 'none' }}>{t.titre}</span>
                            <span style={{ color: '#64748b', marginLeft: '8px', fontSize: '11px' }}>
                              {t.responsable && <span style={{ marginRight: '8px' }}>👤 {t.responsable}</span>}
                              {t.echeance && <span>📅 {new Date(t.echeance + 'T00:00:00').toLocaleDateString('fr-FR')}</span>}
                            </span>
                            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '10px', color: '#94a3b8' }}>{t.statut === 'faite' ? 'Faite' : 'À faire'}</span>
                              <span onClick={() => handleDeleteTache(t.id, rp.id)} style={{ cursor: 'pointer', color: '#94a3b8', fontSize: '12px' }} title="Supprimer">✕</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {hubTasks.length > 0 && (
                <div style={{ marginTop: '20px', padding: '16px', background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                  <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '700', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Users size={16} style={{ color: '#2563eb' }} /> Tâches d'équipe
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {hubTasks.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}>
                        <Users size={13} style={{ color: '#2563eb', flexShrink: 0 }} />
                        <span style={{ color: '#1e293b', fontWeight: '500' }}>{t.description}</span>
                        {t.context_title && t.context_title.includes('/') && (
                          <span style={{ color: '#64748b', fontSize: '11px' }}>— {t.context_title.split('/').slice(1).join('/').trim()}</span>
                        )}
                        <span style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
                          {t.echeance && <span style={{ color: '#94a3b8', fontSize: '11px' }}>📅 {new Date(t.echeance + 'T00:00:00').toLocaleDateString('fr-FR')}</span>}
                          <span style={{ color: '#64748b', fontSize: '11px' }}>👤 {t.username}</span>
                          <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: t.statut === 'terminee' || t.statut === 'terminé' ? '#dcfce7' : '#f1f5f9', color: t.statut === 'terminee' || t.statut === 'terminé' ? '#16a34a' : '#64748b' }}>
                            {t.statut === 'terminee' || t.statut === 'terminé' ? 'Terminée' : t.statut === 'en_cours' ? 'En cours' : 'À faire'}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : revues.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '80px 20px', background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '16px' }}>Aucune revue de projets créée.</p>
              <p style={{ color: '#94a3b8', fontSize: '13px', marginTop: '8px' }}>Cliquez sur "Nouvelle revue" pour en créer une.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {revues.map(revue => (
                <div key={revue.id} style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px 20px', marginBottom: 0, cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = '#93c5fd'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = '#e2e8f0'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => handleSelectRevue(revue)}>
                    <div>
                      <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: '700', color: '#1e293b' }}>{revue.titre || 'Revue du ' + new Date(revue.date_revue).toLocaleDateString('fr-FR')}</h3>
                      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#64748b' }}>
                        <span>📅 {new Date(revue.date_revue).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        {revue.lieu && <span>📍 {revue.lieu}</span>}
                        <span>👥 {revue.participants?.length || 0}</span>
                        <span>📊 {revue.projets?.length || 0}</span>
                      </div>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: '13px' }}>→</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
                    <span style={{ fontSize: '11px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85%' }} title={(revue as any).projet_codes || ''}>
                      📋 {revue.projet_codes || (revue.projet_count ? `${revue.projet_count} projet(s)` : '')}
                    </span>
                    <span onClick={e => { e.stopPropagation(); handleDeleteRevue(revue.id); }} style={{ color: '#94a3b8', fontSize: '12px', cursor: 'pointer', padding: '2px 6px', flexShrink: 0 }} title="Supprimer">🗑️</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {teamTaskContext && (
        <AddTaskModal
          token={token || ''}
          contextSource="revue"
          contextId={teamTaskContext.revueId}
          contextTitle={(teamTaskContext.revueTitre || '') + (teamTaskContext.projetTitre ? ' / ' + teamTaskContext.projetTitre : '')}
          onCreated={(created) => {
            const arr = Array.isArray(created) ? created : [created];
            setHubTasks(prev => [...prev, ...arr]);
            setTeamTaskContext(null);
          }}
          onClose={() => setTeamTaskContext(null)}
          title="Ajouter une tâche d'équipe"
        />
      )}
    </div>
  );
}
