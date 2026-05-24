import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Plus, Send, Upload, Trash2, FileText, Users } from 'lucide-react';
import TranscriptUploadModal from './TranscriptUploadModal';
import TranscriptViewModal from './TranscriptViewModal';
import AddTaskModal from './AddTaskModal';

interface Reunion {
  id: number; titre: string; date_reunion: string; annee: number; lieu?: string;
  description?: string; releve_decision?: string; liste_taches?: string;
  statut: string; created_by?: string; participants?: any[]; demandes?: any[];
  transcript_id?: number | null;
}

interface ADUser {
  username: string; displayName: string; email: string; service?: string; direction?: string;
}

interface Attachment {
  id: number; reunion_id: number; filename: string; original_name: string;
  mimetype: string; size: number; uploaded_by: string; created_at: string;
}

interface Props {
  isOpen: boolean;
  reunionId: number | null;
  token: string | null;
  userRole?: string;
  currentUsername?: string;
  onClose: () => void;
  onUpdated?: () => void;
  onDemandeCreated?: () => void;
  onDeleted?: () => void;
  onTranscriptSuccess?: () => void;
}

const ReunionDetailModal: React.FC<Props> = ({ isOpen, reunionId, token, userRole, currentUsername, onClose, onUpdated, onDemandeCreated, onDeleted, onTranscriptSuccess }) => {
  const [selectedReunion, setSelectedReunion] = useState<Reunion | null>(null);
  const [detailReunionData, setDetailReunionData] = useState({ description: '', releve_decision: '', liste_taches: '' });
  const [reunionAttachments, setReunionAttachments] = useState<Attachment[]>([]);
  const [newDecision, setNewDecision] = useState('');
  const [showAddParticipantDetail, setShowAddParticipantDetail] = useState(false);
  const [detailAdQuery, setDetailAdQuery] = useState('');
  const [detailAdResults, setDetailAdResults] = useState<ADUser[]>([]);
  const [detailAdSearching, setDetailAdSearching] = useState(false);
  const [detailNewParticipant, setDetailNewParticipant] = useState({ nom: '', prenom: '', email: '', service: '', direction: '', type_presence: 'metier' as 'metier' | 'dsi', statut_presence: 'present' as 'present' | 'excuse' | 'info', commentaire: '' });
  const [isAddingDetailParticipant, setIsAddingDetailParticipant] = useState(false);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [isSavingReunion, setIsSavingReunion] = useState(false);
  const [sendingCompteRendu, setSendingCompteRendu] = useState(false);
  const [showCreateDemandeModal, setShowCreateDemandeModal] = useState(false);
  const [showTranscriptUpload, setShowTranscriptUpload] = useState(false);
  const [showTranscriptView, setShowTranscriptView] = useState(false);
  const [newDemande, setNewDemande] = useState({ titre: '', direction: '', service: '', type: '', description: '' });
  const derouleRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const detailAdSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);
  const [editTaskData, setEditTaskData] = useState({ tache: '', responsable: '', responsable_username: '', echeance: '', statut: 'a_faire' });

  const [taskAdResults, setTaskAdResults] = useState<ADUser[]>([]);
  const [taskAdSearching, setTaskAdSearching] = useState(false);
  const taskAdSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hub tasks (via API unifiée + tâches d'équipe)
  const [hubTasks, setHubTasks] = useState<any[]>([]);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);


  const types = ['incident', 'demande', 'projet', 'autre'];

  const fetchReunion = useCallback(async () => {
    if (!reunionId) return;
    try {
      const [res, hubRes] = await Promise.all([
        fetch(`/api/rencontres-reunions/${reunionId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`/api/tasks/by-context?source=reunion&id=${reunionId}`, { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      const data = await res.json();
      setSelectedReunion(data);
      setDetailReunionData({ description: data.description || '', releve_decision: data.releve_decision || '', liste_taches: data.liste_taches || '' });
      fetchAttachments(reunionId);
      if (hubRes.ok) setHubTasks(await hubRes.json());
    } catch (e) { console.error(e); }
  }, [reunionId, token]);

  const searchADDetail = useCallback((q: string) => {
    setDetailAdQuery(q);
    if (detailAdSearchTimerRef.current) clearTimeout(detailAdSearchTimerRef.current);
    if (q.length < 2) { setDetailAdResults([]); return; }
    setDetailAdSearching(true);
    detailAdSearchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ad/search?q=${encodeURIComponent(q)}`, { headers: { 'Authorization': `Bearer ${token}` } });
        setDetailAdResults((await res.json()) || []);
      } catch (e) { setDetailAdResults([]); }
      finally { setDetailAdSearching(false); }
    }, 400);
  }, [token]);

  const searchADForTask = useCallback((q: string) => {
    if (taskAdSearchTimerRef.current) clearTimeout(taskAdSearchTimerRef.current);
    if (q.length < 2) { setTaskAdResults([]); return; }
    setTaskAdSearching(true);
    taskAdSearchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ad/search?q=${encodeURIComponent(q)}`, { headers: { 'Authorization': `Bearer ${token}` } });
        setTaskAdResults((await res.json()) || []);
      } catch (e) { setTaskAdResults([]); }
      finally { setTaskAdSearching(false); }
    }, 400);
  }, [token]);


  const startEditTask = (index: number) => {
    const items = JSON.parse(detailReunionData.liste_taches || '[]') as any[];
    setEditingTaskIndex(index);
    setEditTaskData({ ...items[index] });
    setTaskAdResults([]);
  };

  const saveEditTask = () => {
    if (editingTaskIndex === null) return;
    const items = JSON.parse(detailReunionData.liste_taches || '[]') as any[];
    items[editingTaskIndex] = { ...editTaskData };
    setDetailReunionData(v => ({...v, liste_taches: JSON.stringify(items)}));
    setEditingTaskIndex(null);
    setTaskAdResults([]);
    setTimeout(autoSave, 0);
  };

  const cancelEditTask = () => {
    setEditingTaskIndex(null);
    setTaskAdResults([]);
  };

  const fetchAttachments = async (id: number) => {
    try {
      const res = await fetch(`/api/rencontres-reunions/${id}/attachments`, { headers: { 'Authorization': `Bearer ${token}` } });
      setReunionAttachments((await res.json()) || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { if (isOpen && reunionId) fetchReunion(); }, [isOpen, reunionId, fetchReunion]);

  if (!isOpen || !selectedReunion) return null;

  const autoSave = async () => {
    if (!selectedReunion) return;
    const desc = derouleRef.current ? derouleRef.current.innerHTML : detailReunionData.description;
    try {
      await fetch(`/api/rencontres-reunions/${selectedReunion.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titre: selectedReunion.titre, date_reunion: selectedReunion.date_reunion,
          annee: selectedReunion.annee, lieu: selectedReunion.lieu, statut: selectedReunion.statut,
          description: desc, releve_decision: detailReunionData.releve_decision, liste_taches: detailReunionData.liste_taches
        })
      });
    } catch (e) {}
  };

  const handleUpdateReunion = async () => {
    if (!selectedReunion) return;
    try {
      setIsSavingReunion(true);
      const desc = derouleRef.current ? derouleRef.current.innerHTML : detailReunionData.description;
      const res = await fetch(`/api/rencontres-reunions/${selectedReunion.id}`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titre: selectedReunion.titre, date_reunion: selectedReunion.date_reunion,
          annee: selectedReunion.annee, lieu: selectedReunion.lieu, statut: selectedReunion.statut,
          description: desc, releve_decision: detailReunionData.releve_decision, liste_taches: detailReunionData.liste_taches
        })
      });
      if (res.ok) { fetchReunion(); onUpdated?.(); }
      else { const err = await res.json(); alert(`Erreur : ${err.error}`); }
    } catch (e) { alert('Erreur lors de la sauvegarde'); }
    finally { setIsSavingReunion(false); }
  };

  const handleDeleteReunion = async () => {
    if (!selectedReunion || !window.confirm('Supprimer cette réunion ?')) return;
    await fetch(`/api/rencontres-reunions/${selectedReunion.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    onDeleted?.();
    onClose();
  };

  const handleSendCompteRendu = async () => {
    if (!selectedReunion) return;
    setSendingCompteRendu(true);
    try {
      const res = await fetch(`/api/rencontres-reunions/${selectedReunion.id}/compte-rendu`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) alert(`✅ ${data.message}`);
      else alert(`❌ Erreur : ${data.error}`);
    } catch { alert('❌ Erreur réseau'); }
    finally { setSendingCompteRendu(false); }
  };

  const handleDeleteParticipant = async (pid: number) => {
    await fetch(`/api/reunion-participants/${pid}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
    fetchReunion();
  };

  const addParticipantFromADDetail = async (user: ADUser) => {
    if (!selectedReunion) return;
    try {
      setIsAddingDetailParticipant(true);
      const res = await fetch(`/api/rencontres-reunions/${selectedReunion.id}/participants`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nom: user.displayName.split(' ').slice(1).join(' ') || user.displayName,
          prenom: user.displayName.split(' ')[0], email: user.email,
          service: user.service || '', direction: user.direction || '',
          type_presence: 'dsi', statut_presence: detailNewParticipant.statut_presence, ad_username: user.username,
          commentaire: detailNewParticipant.commentaire
        })
      });
      if (res.ok) { setDetailAdQuery(''); setDetailAdResults([]); fetchReunion(); }
      else { const err = await res.json(); alert(`Erreur : ${err.error}`); }
    } catch (e) { alert('Erreur ajout participant'); }
    finally { setIsAddingDetailParticipant(false); }
  };

  const addParticipantManuelDetail = async () => {
    if (!detailNewParticipant.nom) { alert('Le nom est obligatoire'); return; }
    if (!selectedReunion) return;
    try {
      setIsAddingDetailParticipant(true);
      const res = await fetch(`/api/rencontres-reunions/${selectedReunion.id}/participants`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(detailNewParticipant)
      });
      if (res.ok) {
        setDetailNewParticipant({ nom: '', prenom: '', email: '', service: '', direction: '', type_presence: 'metier', statut_presence: 'present', commentaire: '' });
        setShowAddParticipantDetail(false);
        fetchReunion();
      } else { const err = await res.json(); alert(`Erreur : ${err.error}`); }
    } catch (e) { alert('Erreur ajout participant'); }
    finally { setIsAddingDetailParticipant(false); }
  };

  const handleUploadAttachment = async (files: FileList | null) => {
    if (!files || files.length === 0 || !selectedReunion) return;
    try {
      setIsUploadingAttachment(true);
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) formData.append('files', files[i]);
      const res = await fetch(`/api/rencontres-reunions/${selectedReunion.id}/attachments`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: formData
      });
      if (res.ok) fetchAttachments(selectedReunion.id);
      else { const err = await res.json(); alert(`Erreur upload: ${err.error}`); }
    } catch (e) { alert('Erreur upload'); }
    finally { setIsUploadingAttachment(false); if (attachmentInputRef.current) attachmentInputRef.current.value = ''; }
  };

  const handleDeleteAttachment = async (attId: number) => {
    if (!window.confirm('Supprimer cette pièce jointe ?')) return;
    try {
      const res = await fetch(`/api/rencontres-reunions/attachments/${attId}`, {
        method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok && selectedReunion) fetchAttachments(selectedReunion.id);
    } catch (e) { console.error(e); }
  };

  const handleCreateDemande = async () => {
    if (!newDemande.titre) { alert('Le titre de la demande est obligatoire'); return; }
    if (!newDemande.direction) { alert('La direction est obligatoire'); return; }
    if (!selectedReunion) return;
    try {
      const annee = selectedReunion.annee || new Date(selectedReunion.date_reunion).getFullYear();
      const res = await fetch('/api/rencontres-budgetaires/from-reunion', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newDemande, annee, date_reunion: selectedReunion.date_reunion, reunion_id: selectedReunion.id })
      });
      if (res.ok) {
        alert('Demande créée avec succès');
        setShowCreateDemandeModal(false);
        setNewDemande({ titre: '', direction: '', service: '', type: '', description: '' });
        fetchReunion();
        onDemandeCreated?.();
      } else { const err = await res.json(); alert(`Erreur : ${err.error || 'Erreur'}`); }
    } catch (e) { alert('Erreur création demande'); }
  };

  return (
    <div style={{position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
      <div style={{background: 'white', borderRadius: '16px', width: '100%', maxWidth: '860px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.25)'}}>
        <div style={{padding: '20px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
          <div style={{flex: 1}}>
            <input type="text" style={{width: '100%', margin: '0 0 4px', fontSize: '17px', fontWeight: '800', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '2px 4px'}} value={selectedReunion.titre} onChange={e => setSelectedReunion(v => ({...v!, titre: e.target.value}))} />
            <input type="date" style={{width: 'auto', fontSize: '13px', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '2px 4px'}} value={selectedReunion.date_reunion.split('T')[0]} onChange={e => setSelectedReunion(v => ({...v!, date_reunion: e.target.value}))} />
            <input type="text" style={{marginLeft: '10px', fontSize: '13px', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '2px 4px'}} value={selectedReunion.lieu || ''} onChange={e => setSelectedReunion(v => ({...v!, lieu: e.target.value}))} placeholder="Lieu" />
          </div>
          <div style={{display: 'flex', gap: '8px'}}>
            {selectedReunion.transcript_id ? (
                <button 
                    onClick={() => setShowTranscriptView(true)} 
                    style={{padding: '8px 14px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px'}}
                >
                    <FileText size={14} /> Transcript
                </button>
            ) : (
                <button 
                    onClick={() => setShowTranscriptUpload(true)} 
                    style={{padding: '8px 14px', background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px'}}
                >
                    <Plus size={14} /> Transcript
                </button>
            )}
            <button onClick={() => setShowCreateDemandeModal(true)} style={{padding: '8px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px'}}><Plus size={14} /> Demande</button>
            <button onClick={handleSendCompteRendu} disabled={sendingCompteRendu} style={{padding: '8px 14px', background: '#ecfdf5', color: '#059669', border: '1px solid #6ee7b7', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', opacity: sendingCompteRendu ? 0.6 : 1}} title="Envoyer le compte rendu par email à tous les participants">
              <Send size={14} /> {sendingCompteRendu ? 'Envoi...' : 'Compte rendu'}
            </button>
            {(userRole === 'admin' || (currentUsername && selectedReunion.created_by === currentUsername)) && (
              <button onClick={handleDeleteReunion} style={{padding: '8px 14px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px'}}><Trash2 size={14} /></button>
            )}
            <button onClick={onClose} style={{background: '#f1f5f9', border: 'none', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><X size={16} /></button>
          </div>
        </div>
        <div style={{flex: 1, overflowY: 'auto', padding: '20px 24px'}}>
          {/* Participants */}
          <div style={{marginBottom: '20px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px'}}>
              <h4 style={{margin: 0, fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em'}}>Participants ({selectedReunion.participants?.length || 0})</h4>
              <button onClick={() => setShowAddParticipantDetail(!showAddParticipantDetail)} style={{padding: '4px 10px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px'}}><Plus size={13} /> Ajouter</button>
            </div>
            {showAddParticipantDetail && (
              <div style={{background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px', marginBottom: '12px'}}>
                <div style={{marginBottom: '12px'}}>
                  <div style={{fontSize: '11px', fontWeight: '700', color: '#1d4ed8', marginBottom: '6px'}}>🔍 Ajouter agent DSI</div>
                  <div style={{position: 'relative'}}>
                    <input type="text" placeholder="Rechercher par nom..." style={{width: '100%', padding: '8px 10px', border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '13px'}} value={detailAdQuery} onChange={e => searchADDetail(e.target.value)} />
                    {detailAdSearching && <span style={{position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '11px', color: '#64748b'}}>...</span>}
                  </div>
                  {detailAdResults.length > 0 && (
                    <div style={{marginTop: '6px', border: '1px solid #bfdbfe', borderRadius: '6px', background: 'white', maxHeight: '120px', overflowY: 'auto'}}>
                      {detailAdResults.map(u => (
                        <div key={u.username} style={{padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}} onClick={() => addParticipantFromADDetail(u)} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#eff6ff'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>
                          <div>
                            <div style={{fontWeight: '600'}}>{u.displayName}</div>
                            <div style={{fontSize: '10px', color: '#64748b'}}>{u.email}{u.service ? ` — ${u.service}` : ''}</div>
                          </div>
                          <Plus size={12} color="#2563eb" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{fontSize: '11px', fontWeight: '700', color: '#16a34a', marginBottom: '6px'}}>✏️ Ajouter une personne (hors AD)</div>
                <div style={{display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px'}}>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px'}}>
                    <div><input type="text" placeholder="Nom *" style={{width: '100%', padding: '6px 8px', border: '1px solid #bbf7d0', borderRadius: '4px', fontSize: '12px'}} value={detailNewParticipant.nom} onChange={e => setDetailNewParticipant(v => ({...v, nom: e.target.value}))} /></div>
                    <div><input type="text" placeholder="Email" style={{width: '100%', padding: '6px 8px', border: '1px solid #bbf7d0', borderRadius: '4px', fontSize: '12px'}} value={detailNewParticipant.email} onChange={e => setDetailNewParticipant(v => ({...v, email: e.target.value}))} /></div>
                  </div>
                  <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px'}}>
                    <div><input type="text" placeholder="Service" style={{width: '100%', padding: '6px 8px', border: '1px solid #bbf7d0', borderRadius: '4px', fontSize: '12px'}} value={detailNewParticipant.service} onChange={e => setDetailNewParticipant(v => ({...v, service: e.target.value}))} /></div>
                    <div><input type="text" placeholder="Commentaire" style={{width: '100%', padding: '6px 8px', border: '1px solid #bbf7d0', borderRadius: '4px', fontSize: '12px'}} value={detailNewParticipant.commentaire || ''} onChange={e => setDetailNewParticipant(v => ({...v, commentaire: e.target.value}))} /></div>
                  </div>
                  <div style={{display: 'flex', gap: '6px', alignItems: 'center'}}>
                    <select style={{padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px'}} value={detailNewParticipant.type_presence} onChange={e => setDetailNewParticipant(v => ({...v, type_presence: e.target.value as 'metier' | 'dsi'}))}>
                      <option value="metier">Métier</option>
                      <option value="dsi">DSI</option>
                    </select>
                    <select style={{padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px'}} value={detailNewParticipant.statut_presence} onChange={e => setDetailNewParticipant(v => ({...v, statut_presence: e.target.value as 'present' | 'excuse' | 'info'}))}>
                      <option value="present">Présent</option>
                      <option value="excuse">Excusé</option>
                      <option value="info">Pour information</option>
                    </select>
                    <button onClick={addParticipantManuelDetail} disabled={isAddingDetailParticipant} style={{padding: '6px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '12px', whiteSpace: 'nowrap'}}>+ Ajouter</button>
                  </div>
                </div>
              </div>
            )}
            {(selectedReunion.participants || []).length === 0 ? <p style={{color: '#94a3b8', fontSize: '13px'}}>Aucun participant</p> : (
              <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px'}}>
                {(selectedReunion.participants || []).map(p => (
                  <div key={p.id} style={{display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', background: p.type_presence === 'dsi' ? '#eff6ff' : '#f0fdf4', borderRadius: '20px', border: `1px solid ${p.type_presence === 'dsi' ? '#bfdbfe' : '#bbf7d0'}`, fontSize: '13px'}} title={p.commentaire || ''}>
                    <span style={{fontWeight: '600'}}>{p.prenom ? `${p.prenom} ` : ''}{p.nom}</span>
                    {p.service && <span style={{color: '#64748b', fontSize: '11px'}}>— {p.service}</span>}
                    {p.commentaire && <span style={{fontSize: '10px', color: '#64748b', fontStyle: 'italic', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>💬 {p.commentaire}</span>}
                    <span style={{fontSize: '10px', fontWeight: '600', padding: '1px 6px', borderRadius: '10px', background: p.statut_presence === 'present' ? '#dcfce7' : p.statut_presence === 'excuse' ? '#fef3c7' : '#e0e7ff', color: p.statut_presence === 'present' ? '#16a34a' : p.statut_presence === 'excuse' ? '#92400e' : '#4338ca'}}>{p.statut_presence === 'present' ? 'Présent' : p.statut_presence === 'excuse' ? 'Excusé' : 'Info'}</span>
                    <button onClick={() => handleDeleteParticipant(p.id)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '0 2px', lineHeight: 1}}><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Déroulé */}
          <div style={{marginBottom: '20px'}}>
            <h4 style={{margin: '0 0 8px', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em'}}>📋 Déroulé</h4>
            <div style={{border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden'}}>
              <div style={{display: 'flex', gap: '4px', padding: '6px 8px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0'}}>
                <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand('bold'); }} style={{padding: '4px 8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '13px', lineHeight: 1}}>B</button>
                <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand('italic'); }} style={{padding: '4px 8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontStyle: 'italic', fontSize: '13px', lineHeight: 1}}>I</button>
                <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand('underline'); }} style={{padding: '4px 8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', textDecoration: 'underline', fontSize: '13px', lineHeight: 1}}>U</button>
                <span style={{width: '1px', background: '#e2e8f0', margin: '0 4px'}} />
                <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand('insertUnorderedList'); }} style={{padding: '4px 8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', lineHeight: 1}}>• Liste</button>
                <button type="button" onMouseDown={e => { e.preventDefault(); document.execCommand('insertOrderedList'); }} style={{padding: '4px 8px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', lineHeight: 1}}>1. Liste</button>
              </div>
              <div ref={derouleRef} contentEditable suppressContentEditableWarning dir="ltr" style={{minHeight: '250px', padding: '12px 14px', fontSize: '14px', outline: 'none', lineHeight: 1.7, direction: 'ltr', textAlign: 'left'}} dangerouslySetInnerHTML={{__html: detailReunionData.description}} onBlur={() => { if (derouleRef.current) { setDetailReunionData(v => ({...v, description: derouleRef.current!.innerHTML})); setTimeout(autoSave, 0); } }} />
            </div>
          </div>

          {/* Relevé de décision */}
          <div style={{marginBottom: '20px'}}>
            <h4 style={{margin: '0 0 8px', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em'}}>📝 Relevé de décision</h4>
            <div style={{display: 'flex', gap: '8px', marginBottom: '8px'}}>
              <input type="text" placeholder="Saisir une décision..." style={{flex: 1, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px'}} value={newDecision} onChange={e => setNewDecision(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const items = JSON.parse(detailReunionData.releve_decision || '[]'); items.push({ texte: newDecision }); setDetailReunionData(v => ({...v, releve_decision: JSON.stringify(items)})); setNewDecision(''); setTimeout(autoSave, 0); } }} />
              <button onClick={() => { if (!newDecision.trim()) return; const items = JSON.parse(detailReunionData.releve_decision || '[]'); items.push({ texte: newDecision }); setDetailReunionData(v => ({...v, releve_decision: JSON.stringify(items)})); setNewDecision(''); setTimeout(autoSave, 0); }} style={{padding: '8px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap'}}>+ Ajouter</button>
            </div>
            {(JSON.parse(detailReunionData.releve_decision || '[]') as {texte: string}[]).length === 0 ? <p style={{color: '#94a3b8', fontSize: '12px', fontStyle: 'italic', margin: '4px 0'}}>Aucune décision ajoutée</p> : (
              <div style={{border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden'}}>
                {(JSON.parse(detailReunionData.releve_decision || '[]') as {texte: string}[]).map((d, i) => (
                  <div key={i} style={{display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', borderBottom: i < (JSON.parse(detailReunionData.releve_decision || '[]') as {texte: string}[]).length - 1 ? '1px solid #f1f5f9' : 'none'}}>
                    <span style={{fontSize: '12px', color: '#475569', fontWeight: '600', minWidth: '20px'}}>{i + 1}.</span>
                    <span style={{flex: 1, fontSize: '13px', color: '#1e293b'}}>{d.texte}</span>
                    <button onClick={() => { const items = JSON.parse(detailReunionData.releve_decision || '[]') as {texte: string}[]; items.splice(i, 1); setDetailReunionData(v => ({...v, releve_decision: JSON.stringify(items)})); }} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px'}}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Liste de tâches */}
          <div style={{marginBottom: '20px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
              <h4 style={{margin: 0, fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em'}}>✅ Tâches</h4>
              <button onClick={() => setShowAddTaskModal(true)} style={{padding: '5px 12px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '700', fontSize: '12px', display: 'flex', alignItems: 'center', gap: 4}}>
                <Plus size={13} /> Ajouter une tâche
              </button>
            </div>
            {(JSON.parse(detailReunionData.liste_taches || '[]') as any[]).length === 0 && hubTasks.length === 0 && (
              <p style={{color: '#94a3b8', fontSize: '12px', fontStyle: 'italic', margin: '4px 0'}}>Aucune tâche — cliquez sur "Ajouter une tâche" pour en créer une</p>
            )}
            {(JSON.parse(detailReunionData.liste_taches || '[]') as any[]).length > 0 && (
              <div style={{border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden'}}>
                {(JSON.parse(detailReunionData.liste_taches || '[]') as any[]).map((t, i) => (
                  editingTaskIndex === i ? (
                    <div key={i} style={{padding: '10px 12px', borderBottom: i < (JSON.parse(detailReunionData.liste_taches || '[]') as any[]).length - 1 ? '1px solid #f1f5f9' : 'none', background: '#fff7ed'}}>
                      <div style={{display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px'}}>
                        <input type="text" placeholder="Tâche..." style={{flex: '2', minWidth: '120px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px'}} value={editTaskData.tache} onChange={e => setEditTaskData(v => ({...v, tache: e.target.value}))} />
                        <div style={{flex: '1', minWidth: '120px', position: 'relative'}}>
                          <input type="text" placeholder="Responsable (recherche AD)..." style={{width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px'}} value={editTaskData.responsable} onChange={e => { setEditTaskData(v => ({...v, responsable: e.target.value})); searchADForTask(e.target.value); }} />
                          {taskAdSearching && <span style={{position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: '#64748b'}}>...</span>}
                          {taskAdResults.length > 0 && (
                            <div style={{position: 'absolute', top: '100%', left: 0, right: 0, border: '1px solid #bfdbfe', borderRadius: '4px', background: 'white', maxHeight: '100px', overflowY: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}}>
                              {taskAdResults.map(u => (
                                <div key={u.username} style={{padding: '4px 8px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '12px'}} onClick={() => { setEditTaskData(v => ({...v, responsable: u.displayName, responsable_username: u.username})); setTaskAdResults([]); }} onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#eff6ff'} onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>
                                  <div style={{fontWeight: '600'}}>{u.displayName}</div>
                                  <div style={{fontSize: '10px', color: '#64748b'}}>{u.email}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <input type="date" style={{flex: '1', minWidth: '100px', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px'}} value={editTaskData.echeance} onChange={e => setEditTaskData(v => ({...v, echeance: e.target.value}))} />
                        <select style={{padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '4px', fontSize: '12px'}} value={editTaskData.statut || 'a_faire'} onChange={e => setEditTaskData(v => ({...v, statut: e.target.value}))}>
                          <option value="a_faire">À faire</option>
                          <option value="en_cours">En cours</option>
                          <option value="terminee">Terminée</option>
                          <option value="en_erreur">En erreur</option>
                        </select>
                      </div>
                      <div style={{display: 'flex', gap: '6px', justifyContent: 'flex-end'}}>
                        <button onClick={cancelEditTask} style={{padding: '4px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '11px', color: '#475569'}}>Annuler</button>
                        <button onClick={saveEditTask} style={{padding: '4px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '11px'}}>Enregistrer</button>
                      </div>
                    </div>
                  ) : (
                    <div key={i} style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: i < (JSON.parse(detailReunionData.liste_taches || '[]') as any[]).length - 1 ? '1px solid #f1f5f9' : 'none'}}>
                      <span style={{fontSize: '12px', color: '#475569', fontWeight: '600', minWidth: '20px'}}>{i + 1}.</span>
                      <span style={{flex: 1, fontSize: '13px', color: '#1e293b'}}><strong>{t.tache}</strong>{t.responsable ? ` — ${t.responsable}` : ''}</span>
                      <span style={{fontSize: '10px', fontWeight: '600', padding: '2px 8px', borderRadius: '10px', background: (t.statut || 'a_faire') === 'a_faire' ? '#f1f5f9' : (t.statut || 'a_faire') === 'en_cours' ? '#dbeafe' : (t.statut || 'a_faire') === 'terminee' ? '#dcfce7' : '#fee2e2', color: (t.statut || 'a_faire') === 'a_faire' ? '#64748b' : (t.statut || 'a_faire') === 'en_cours' ? '#1d4ed8' : (t.statut || 'a_faire') === 'terminee' ? '#16a34a' : '#dc2626'}}>
                        {(t.statut || 'a_faire') === 'a_faire' ? 'À faire' : (t.statut || 'a_faire') === 'en_cours' ? 'En cours' : (t.statut || 'a_faire') === 'terminee' ? 'Terminée' : 'En erreur'}
                      </span>
                      {t.echeance && <span style={{fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '2px 8px', borderRadius: '4px', whiteSpace: 'nowrap'}}>{new Date(t.echeance).toLocaleDateString('fr-FR')}</span>}
                      <button onClick={() => startEditTask(i)} style={{padding: '3px 8px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: '4px', cursor: 'pointer', fontWeight: '600', fontSize: '11px'}}>Modifier</button>
                      <button onClick={() => { const items = JSON.parse(detailReunionData.liste_taches || '[]') as any[]; items.splice(i, 1); setDetailReunionData(v => ({...v, liste_taches: JSON.stringify(items)})); if (editingTaskIndex === i) cancelEditTask(); }} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px'}}><X size={14} /></button>
                    </div>
                  )
                ))}
              </div>
            )}
            {hubTasks.length > 0 && (
              <div style={{marginTop: '8px', border: '1px solid #dbeafe', borderRadius: '8px', overflow: 'hidden'}}>
                {hubTasks.map((t: any) => (
                  <div key={t.id} style={{display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid #f1f5f9', fontSize: '12px', background: 'white', borderLeft: '3px solid #3b82f6'}}>
                    {t.is_team_task && <span title="Tâche d'équipe"><Users size={12} style={{color: '#2563eb', flexShrink: 0}} /></span>}
                    <span style={{flex: 1, fontWeight: 600, color: '#1e293b'}}>{t.description}</span>
                    <span style={{fontSize: 11, color: '#64748b'}}>{t.username}</span>
                    {t.echeance && <span style={{fontSize: 10, color: '#94a3b8'}}>{new Date(t.echeance).toLocaleDateString('fr-FR')}</span>}
                    <span style={{padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: t.statut === 'terminé' || t.statut === 'terminee' ? '#dcfce7' : t.statut === 'en_cours' ? '#dbeafe' : '#f1f5f9', color: t.statut === 'terminé' || t.statut === 'terminee' ? '#16a34a' : t.statut === 'en_cours' ? '#1d4ed8' : '#64748b'}}>
                      {t.statut === 'terminé' || t.statut === 'terminee' ? 'Terminée' : t.statut === 'en_cours' ? 'En cours' : 'À faire'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {showAddTaskModal && selectedReunion && (
            <AddTaskModal
              token={token}
              contextSource="reunion"
              contextId={selectedReunion.id}
              contextTitle={selectedReunion.titre}
              onCreated={(created) => {
                const toAdd = Array.isArray(created) ? created : [created];
                setHubTasks(prev => [...prev, ...toAdd]);
                setShowAddTaskModal(false);
              }}
              onClose={() => setShowAddTaskModal(false)}
              title="Ajouter une tâche à la réunion"
            />
          )}

          {/* Demandes */}
          <h4 style={{margin: '0 0 10px', fontSize: '13px', fontWeight: '700', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', borderTop: '1px solid #e2e8f0', paddingTop: '16px'}}>Demandes ({selectedReunion.demandes?.length || 0})</h4>
          {(selectedReunion.demandes || []).length === 0 ? <p style={{color: '#94a3b8', fontSize: '13px'}}>Aucune demande — <span style={{color: '#2563eb', cursor: 'pointer'}} onClick={() => setShowCreateDemandeModal(true)}>en ajouter une</span></p> : (
            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '13px'}}>
              <thead><tr style={{borderBottom: '1px solid #e2e8f0', background: '#f8fafc'}}>
                <th style={{padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Demande</th>
                <th style={{padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Direction / Service</th>
                <th style={{padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Type</th>
                <th style={{padding: '8px 12px', textAlign: 'left', fontWeight: '600', color: '#475569'}}>Statut</th>
              </tr></thead>
              <tbody>
                {(selectedReunion.demandes || []).map(d => (
                  <tr key={d.id} style={{borderBottom: '1px solid #f1f5f9'}}>
                    <td style={{padding: '8px 12px', fontWeight: '600', color: '#1e293b'}}>{d.titre}</td>
                    <td style={{padding: '8px 12px', color: '#475569'}}>{d.direction}{d.service ? ` / ${d.service}` : ''}</td>
                    <td style={{padding: '8px 12px', color: '#475569'}}>{d.type || '-'}</td>
                    <td style={{padding: '8px 12px'}}><span style={{padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', background: '#fef3c7', color: '#92400e'}}>{d.statut}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Section Pièces Jointes */}
          <div style={{marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e5e7eb'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px'}}>
              <h4 style={{margin: 0, fontSize: '14px', fontWeight: '700', color: '#374151'}}>📎 Pièces jointes ({reunionAttachments.length})</h4>
              <button onClick={() => attachmentInputRef.current?.click()} disabled={isUploadingAttachment} style={{display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'}}>
                <Upload size={14} /> {isUploadingAttachment ? 'Upload...' : 'Ajouter'}
              </button>
              <input ref={attachmentInputRef} type="file" multiple style={{display: 'none'}} onChange={(e) => handleUploadAttachment(e.target.files)} />
            </div>
            {reunionAttachments.length === 0 ? (
              <p style={{fontSize: '13px', color: '#9ca3af', margin: 0, fontStyle: 'italic'}}>Aucune pièce jointe</p>
            ) : (
              <div style={{display: 'flex', flexDirection: 'column', gap: '6px'}}>
                {reunionAttachments.map(att => (
                  <div key={att.id} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '6px'}}>
                    <div style={{display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0}}>
                      <span style={{fontSize: '18px'}}>{att.mimetype?.includes('pdf') ? '📄' : att.mimetype?.includes('image') ? '🖼️' : att.mimetype?.includes('sheet') || att.original_name.endsWith('.xlsx') ? '📊' : '📎'}</span>
                      <div style={{minWidth: 0}}>
                        <a href={`/file_reunions/${att.filename}`} target="_blank" rel="noopener noreferrer" style={{fontSize: '13px', color: '#2563eb', textDecoration: 'none', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}} title={att.original_name}>{att.original_name}</a>
                        <span style={{fontSize: '11px', color: '#9ca3af'}}>{att.size ? `${(att.size / 1024).toFixed(0)} Ko` : ''} · {att.uploaded_by}</span>
                      </div>
                    </div>
                    <button onClick={() => handleDeleteAttachment(att.id)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', flexShrink: 0}} title="Supprimer"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Footer */}
        <div style={{padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', justifyContent: 'flex-end', background: '#fafafa'}}>
          <button onClick={handleUpdateReunion} disabled={isSavingReunion} style={{padding: '9px 22px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px'}}>
            {isSavingReunion ? '...' : '💾 Enregistrer'}
          </button>
        </div>
      </div>

      {/* Modale création demande */}
      {showCreateDemandeModal && (
        <div style={{position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', zIndex: 4000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
          <div style={{background: 'white', borderRadius: '14px', width: '100%', maxWidth: '600px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.3)'}}>
            <div style={{padding: '20px 24px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <h3 style={{margin: 0, fontSize: '16px', fontWeight: '800', color: '#1e293b'}}>Nouvelle demande — {selectedReunion.titre}</h3>
              <button onClick={() => setShowCreateDemandeModal(false)} style={{background: '#f1f5f9', border: 'none', cursor: 'pointer', width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><X size={15} /></button>
            </div>
            <div style={{flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr', gap: '14px'}}>
              <div>
                <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '5px'}}>TITRE DE LA DEMANDE *</label>
                <input type="text" style={{width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px'}} value={newDemande.titre} onChange={e => setNewDemande(v => ({...v, titre: e.target.value}))} />
              </div>
              <div>
                <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '5px'}}>DIRECTION *</label>
                <select style={{width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: 'white'}} value={newDemande.direction} onChange={e => setNewDemande(v => ({...v, direction: e.target.value}))}>
                  <option value="">-- Sélectionner --</option>
                  {[...new Set((selectedReunion?.participants || []).map(p => p.direction).filter(Boolean))].map(d => <option key={d} value={d as string}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '5px'}}>SERVICE (depuis les participants)</label>
                <select style={{width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: 'white'}} value={newDemande.service} onChange={e => setNewDemande(v => ({...v, service: e.target.value}))}>
                  <option value="">-- Sélectionner --</option>
                  {[...new Set((selectedReunion?.participants || []).map(p => p.service).filter(Boolean))].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '5px'}}>TYPE</label>
                <select style={{width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: 'white'}} value={newDemande.type} onChange={e => setNewDemande(v => ({...v, type: e.target.value}))}>
                  <option value="">-- Sélectionner --</option>
                  {types.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '5px'}}>DESCRIPTION</label>
                <textarea rows={4} style={{width: '100%', padding: '9px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', resize: 'vertical'}} value={newDemande.description} onChange={e => setNewDemande(v => ({...v, description: e.target.value}))} />
              </div>
            </div>
            <div style={{padding: '14px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px', justifyContent: 'flex-end'}}>
              <button onClick={() => setShowCreateDemandeModal(false)} style={{padding: '9px 18px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#475569'}}>Annuler</button>
              <button onClick={handleCreateDemande} style={{padding: '9px 20px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700'}}>✓ Créer la demande</button>
            </div>
          </div>
        </div>
      )}

      <TranscriptUploadModal
        isOpen={showTranscriptUpload}
        onClose={() => setShowTranscriptUpload(false)}
        reunionId={reunionId || undefined}
        token={token}
        onSuccess={() => {
            setShowTranscriptUpload(false);
            fetchReunion();
            onTranscriptSuccess?.();
        }}
      />

      <TranscriptViewModal
        isOpen={showTranscriptView}
        transcriptId={selectedReunion.transcript_id || null}
        token={token}
        onClose={() => setShowTranscriptView(false)}
      />
    </div>
  );
};

export default ReunionDetailModal;
