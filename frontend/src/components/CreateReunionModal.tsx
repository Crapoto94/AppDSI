import React, { useState, useEffect } from 'react';
import { X, Plus, Paperclip, Calendar as CalendarIcon, CalendarSearch, AlertTriangle, Video } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { useADSearch } from '../utils/useADSearch';
import { useAuth } from '../contexts/AuthContext';

interface Participant {
  id: number;
  reunion_id: number;
  nom: string;
  prenom?: string;
  email?: string;
  service?: string;
  direction?: string;
  type_presence: 'metier' | 'dsi' | 'externe';
  statut_presence: 'present' | 'excuse' | 'info';
  ad_username?: string;
}

interface CreateReunionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (reunion: any) => void;
  token: string | null;
  directions?: string[];
  services?: string[];
  source?: string;
  comites?: { id: number; nom: string; membres?: { nom: string; prenom?: string; email?: string; ad_username?: string; service?: string; direction?: string }[] }[];
}

const CreateReunionModal: React.FC<CreateReunionModalProps> = ({ isOpen, onClose, onCreated, token: _token, directions = [], services = [], source = 'rencontres_budgetaires', comites = [] }) => {
  const token = _token || '';
  const { user } = useAuth();
  const [newReunion, setNewReunion] = useState({ titre: '', date_reunion: '', lieu: '' });
  const [dureeMinutes, setDureeMinutes] = useState(60);
  const [ordreDuJour, setOrdreDuJour] = useState('');
  const [createOutlook, setCreateOutlook] = useState(false);
  const [isTeams, setIsTeams] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [comiteId, setComiteId] = useState('');
  const [slots, setSlots] = useState<{ start: string; end: string; label: string; available?: number; total?: number; unavailable?: string[] }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [afterHours, setAfterHours] = useState(false);
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);

  // À l'ouverture, ajoute automatiquement l'utilisateur connecté comme participant (depuis son profil)
  useEffect(() => {
    if (!isOpen || !user?.username) return;
    setParticipants(prev => {
      if (prev.some(p => p.ad_username && p.ad_username.toLowerCase() === user.username.toLowerCase())) return prev;
      const parts = (user.displayName || user.username).trim().split(' ');
      const prenom = parts.length > 1 ? parts[0] : '';
      const nom = parts.length > 1 ? parts.slice(1).join(' ') : (user.displayName || user.username);
      return [{
        id: Date.now(),
        reunion_id: 0,
        nom,
        prenom,
        email: user.email || '',
        service: user.service_complement || user.service_code || '',
        direction: '',
        type_presence: 'dsi',
        statut_presence: 'present',
        ad_username: user.username
      }, ...prev];
    });
  }, [isOpen, user]);
  const [newParticipant, setNewParticipant] = useState({ nom: '', prenom: '', email: '', service: '', direction: '', type_presence: 'externe' as 'metier' | 'dsi' | 'externe', statut_presence: 'present' as 'present' | 'excuse' | 'info' });
  const ad = useADSearch(token);
  const [isCreating, setIsCreating] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);

  const handleComiteChange = async (id: string) => {
    setComiteId(id);
    if (!id) return;
    setLoadingMembers(true);
    const comite = comites.find(c => String(c.id) === id);
    if (comite && (comite as any).membres) {
      const existingAdUsers = new Set(participants.filter(p => p.ad_username).map(p => p.ad_username));
      const newParticipants: Participant[] = (comite as any).membres
        .filter((m: any) => !existingAdUsers.has(m.ad_username))
        .map((m: any) => ({
          id: Date.now() + Math.random(),
          reunion_id: 0,
          nom: m.nom || m.ad_username || '',
          prenom: m.prenom || '',
          email: m.email || '',
          service: m.service || '',
          direction: m.direction || '',
          type_presence: (m.ad_username ? 'metier' : 'externe') as 'metier' | 'dsi' | 'externe',
          statut_presence: 'present' as 'present' | 'excuse' | 'info',
          ad_username: m.ad_username || ''
        }));
      setParticipants(prev => [...prev, ...newParticipants]);
    }
    setLoadingMembers(false);
  };

  const addParticipantFromAD = (user: { username: string; displayName: string; email: string; service?: string; direction?: string }) => {
    setParticipants(prev => [...prev, {
      id: Date.now(), reunion_id: 0,
      nom: user.displayName.split(' ').slice(1).join(' ') || user.displayName,
      prenom: user.displayName.split(' ')[0],
      email: user.email,
      service: user.service || '',
      direction: user.direction || '',
      type_presence: 'dsi',
      statut_presence: 'present',
      ad_username: user.username
    }]);
    ad.setQuery('');
    ad.clearResults();
  };

  const addParticipantManuel = () => {
    if (!newParticipant.nom) return;
    setParticipants(prev => [...prev, { ...newParticipant, id: Date.now(), reunion_id: 0 }]);
    setNewParticipant({ nom: '', prenom: '', email: '', service: '', direction: '', type_presence: 'externe', statut_presence: 'present' });
  };

  const fetchSlots = async (withAfterHours: boolean) => {
    setLoadingSlots(true);
    setSlotsError('');
    setSlotsOpen(true);
    try {
      const parts = participants
        .filter(p => p.email && p.email.includes('@'))
        .map(p => ({ email: p.email, name: `${p.prenom ? p.prenom + ' ' : ''}${p.nom || ''}`.trim() || p.email }));
      const res = await fetch('/api/rencontres-reunions/free-slots', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants: parts, duree_minutes: dureeMinutes, after_hours: withAfterHours })
      });
      const data = await res.json();
      if (res.ok) {
        setSlots(data.slots || []);
        if (!data.slots || data.slots.length === 0) setSlotsError('Aucun créneau commun trouvé sur les 30 prochains jours.');
      } else {
        setSlotsError(data.error || 'Erreur lors de la recherche des créneaux.');
        setSlots([]);
      }
    } catch (e) {
      setSlotsError('Erreur réseau lors de la recherche des créneaux.');
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleCreate = async () => {
    if (!newReunion.titre || !newReunion.date_reunion) {
      alert('Titre et date sont obligatoires');
      return;
    }
    try {
      setIsCreating(true);
      const res = await fetch('/api/rencontres-reunions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newReunion,
          participants,
          source,
          duree_minutes: dureeMinutes,
          ordre_du_jour: ordreDuJour,
          // L'évènement Outlook est créé après l'upload des PJ (pour les joindre)
          create_outlook: false,
          is_teams: createOutlook && isTeams
        })
      });
      if (res.ok) {
        const created = await res.json();

        // Upload des pièces jointes (nécessite l'id de la réunion créée)
        if (files.length > 0 && created?.id) {
          try {
            const fd = new FormData();
            files.forEach(f => fd.append('files', f));
            await fetch(`/api/rencontres-reunions/${created.id}/attachments`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}` },
              body: fd
            });
          } catch (e) { console.error('Erreur upload PJ:', e); }
        }

        // Création de l'évènement Outlook/Teams APRÈS l'upload (les PJ sont jointes à l'invitation)
        if (createOutlook && created?.id) {
          try {
            const oRes = await fetch(`/api/rencontres-reunions/${created.id}/outlook`, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ is_teams: isTeams })
            });
            const o = await oRes.json();
            if (oRes.ok && o.created) {
              alert(`Réunion créée et ajoutée au calendrier Outlook ✔${o.mailbox ? `\nBoîte : ${o.mailbox}` : ''}${o.attachments ? `\n${o.attachments} pièce(s) jointe(s) à l'invitation` : ''}${o.teamsJoinUrl ? '\nLien Teams généré ✔' : ''}`);
            } else {
              alert(`Réunion créée, mais l'évènement Outlook n'a pas pu être créé : ${o.error || 'erreur inconnue'}`);
            }
          } catch (e) { alert("Réunion créée, mais erreur lors de la création de l'évènement Outlook."); }
        }

        setNewReunion({ titre: '', date_reunion: '', lieu: '' });
        setDureeMinutes(60);
        setOrdreDuJour('');
        setCreateOutlook(false);
        setIsTeams(false);
        setFiles([]);
        setSlots([]);
        setSlotsOpen(false);
        setSlotsError('');
        setParticipants([]);
        created._comite_id = comiteId ? parseInt(comiteId) : null;
        onCreated(created);
      } else {
        const err = await res.json();
        alert(`Erreur : ${err.error}`);
      }
    } catch (e) { alert('Erreur création réunion'); }
    finally { setIsCreating(false); }
  };

  if (!isOpen) return null;

  return (
    <div style={{position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'}}>
      <div style={{background: 'white', borderRadius: '16px', width: '100%', maxWidth: '780px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px rgba(0,0,0,0.25)'}}>
        <div style={{padding: '24px 28px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <h2 style={{margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b'}}>📅 Nouvelle Réunion</h2>
          <button onClick={onClose} style={{background: '#f1f5f9', border: 'none', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><X size={16} /></button>
        </div>
        <div style={{flex: 1, overflowY: 'auto', padding: '24px 28px'}}>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px'}}>
            <div style={{gridColumn: '1/-1'}}>
              <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px'}}>TITRE *</label>
              <input type="text" placeholder="Ex: Rencontre DIRCOM 2025" style={{width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px'}} value={newReunion.titre} onChange={e => setNewReunion(v => ({...v, titre: e.target.value}))} />
            </div>
            <div>
              <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px'}}>DATE & HEURE *</label>
              <input type="datetime-local" style={{width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px'}} value={newReunion.date_reunion} onChange={e => setNewReunion(v => ({...v, date_reunion: e.target.value}))} />
            </div>
            <div>
              <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px'}}>LIEU</label>
              <input type="text" placeholder="Ex: Salle Ivry" style={{width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px'}} value={newReunion.lieu} onChange={e => setNewReunion(v => ({...v, lieu: e.target.value}))} />
            </div>
            <div style={{gridColumn: '1/-1'}}>
              <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px'}}>DURÉE</label>
              <select style={{width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: 'white'}} value={dureeMinutes} onChange={e => setDureeMinutes(parseInt(e.target.value, 10))}>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={45}>45 minutes</option>
                <option value={60}>1 heure</option>
                <option value={90}>1 h 30</option>
                <option value={120}>2 heures</option>
                <option value={180}>3 heures</option>
                <option value={240}>4 heures</option>
                <option value={480}>Journée (8 h)</option>
              </select>
            </div>
          </div>

          {/* Ordre du jour (WYSIWYG) */}
          <div style={{marginBottom: '20px'}}>
            <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px'}}>ORDRE DU JOUR</label>
            <ReactQuill
              theme="snow"
              value={ordreDuJour}
              onChange={setOrdreDuJour}
              modules={{ toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link'], ['clean']] }}
              placeholder="Points à aborder lors de la réunion..."
            />
          </div>

          {/* Pièces jointes */}
          <div style={{marginBottom: '20px'}}>
            <label style={{display: 'block', fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '6px'}}>PIÈCES JOINTES</label>
            <label style={{display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 14px', border: '1px dashed #cbd5e1', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#475569', fontWeight: 600, background: '#f8fafc'}}>
              <Paperclip size={16} /> Ajouter des fichiers
              <input type="file" multiple style={{display: 'none'}} onChange={e => setFiles(prev => [...prev, ...Array.from(e.target.files || [])])} />
            </label>
            {files.length > 0 && (
              <div style={{marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px'}}>
                {files.map((f, i) => (
                  <div key={i} style={{display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: '#f1f5f9', borderRadius: '6px', fontSize: '13px', color: '#1e293b'}}>
                    <Paperclip size={13} color="#64748b" />
                    <span style={{flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{f.name}</span>
                    <span style={{fontSize: '11px', color: '#94a3b8'}}>{(f.size / 1024).toFixed(0)} Ko</span>
                    <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', display: 'flex'}}><X size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Prochains créneaux communs */}
          <div style={{marginBottom: '20px', padding: '14px 16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px'}}>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap'}}>
              <button type="button" onClick={() => fetchSlots(afterHours)} disabled={loadingSlots} style={{display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '9px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: loadingSlots ? 'wait' : 'pointer', fontWeight: 700, fontSize: '13px'}}>
                <CalendarSearch size={16} /> {loadingSlots ? 'Recherche…' : 'Prochains créneaux communs'}
              </button>
              <label style={{display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: '#475569', fontWeight: 600, cursor: 'pointer'}}>
                <input type="checkbox" checked={afterHours} onChange={e => { const v = e.target.checked; setAfterHours(v); if (slotsOpen) fetchSlots(v); }} />
                Hors heures ouvrées (8h–19h)
              </label>
            </div>
            {!loadingSlots && !slotsError && slots.length === 0 && !slotsOpen && (
              <div style={{marginTop: '8px', fontSize: '12px', color: '#94a3b8'}}>Cherche les 5 prochains créneaux libres pour tous les participants ({afterHours ? '8h–19h' : '8h30–12h / 13h30–17h30 (ven. 17h)'}, lun–ven), selon la durée choisie.</div>
            )}
            {slotsError && <div style={{marginTop: '10px', fontSize: '13px', color: '#dc2626'}}>{slotsError}</div>}
            {slots.length > 0 && (
              <div style={{marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px'}}>
                {slots.map((s, i) => {
                  const total = s.total ?? 0;
                  const avail = s.available ?? 0;
                  const allFree = total > 0 && avail === total;
                  return (
                    <button key={i} type="button" onClick={() => { setNewReunion(v => ({...v, date_reunion: s.start})); }} style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '9px 12px', background: newReunion.date_reunion === s.start ? '#eff6ff' : 'white', border: `1px solid ${newReunion.date_reunion === s.start ? '#2563eb' : (allFree ? '#e2e8f0' : '#fde68a')}`, borderRadius: '8px', cursor: 'pointer', fontSize: '13px', textAlign: 'left'}}>
                      <div style={{display: 'flex', flexDirection: 'column', gap: '3px', flex: 1}}>
                        <span style={{fontWeight: 600, color: '#1e293b', textTransform: 'capitalize'}}>{s.label}</span>
                        {total > 0 && (
                          <span style={{display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 600, color: allFree ? '#16a34a' : '#b45309'}}>
                            {allFree
                              ? <>👥 {avail}/{total} disponibles</>
                              : <><AlertTriangle size={12} /> {avail}/{total} disponibles{s.unavailable && s.unavailable.length > 0 ? ` — absent(s) : ${s.unavailable.join(', ')}` : ''}</>}
                          </span>
                        )}
                      </div>
                      {newReunion.date_reunion === s.start
                        ? <span style={{fontSize: '11px', fontWeight: 700, color: '#2563eb', whiteSpace: 'nowrap'}}>Sélectionné ✓</span>
                        : <span style={{fontSize: '11px', color: '#2563eb', fontWeight: 600, whiteSpace: 'nowrap'}}>Choisir</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Toggle Outlook + Teams */}
          <div style={{marginBottom: '20px', padding: '12px 16px', background: createOutlook ? '#eff6ff' : '#f8fafc', border: `1px solid ${createOutlook ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: '10px'}}>
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'}}>
              <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                <CalendarIcon size={18} color={createOutlook ? '#2563eb' : '#94a3b8'} />
                <div>
                  <div style={{fontSize: '14px', fontWeight: 700, color: '#1e293b'}}>Créer dans Outlook</div>
                  <div style={{fontSize: '12px', color: '#64748b'}}>Ajoute l'évènement à votre calendrier O365 et invite les participants.</div>
                </div>
              </div>
              <button type="button" onClick={() => setCreateOutlook(v => !v)} aria-pressed={createOutlook} style={{position: 'relative', width: '46px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', background: createOutlook ? '#2563eb' : '#cbd5e1', transition: 'background 0.2s', flexShrink: 0}}>
                <span style={{position: 'absolute', top: '3px', left: createOutlook ? '23px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'}} />
              </button>
            </div>
            {createOutlook && (
              <div style={{marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px'}}>
                <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                  <Video size={18} color={isTeams ? '#5b5fc7' : '#94a3b8'} />
                  <div>
                    <div style={{fontSize: '14px', fontWeight: 700, color: '#1e293b'}}>Réunion Teams (lien visio)</div>
                    <div style={{fontSize: '12px', color: '#64748b'}}>Génère automatiquement un lien de réunion Microsoft Teams.</div>
                  </div>
                </div>
                <button type="button" onClick={() => setIsTeams(v => !v)} aria-pressed={isTeams} style={{position: 'relative', width: '46px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', background: isTeams ? '#5b5fc7' : '#cbd5e1', transition: 'background 0.2s', flexShrink: 0}}>
                  <span style={{position: 'absolute', top: '3px', left: isTeams ? '23px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: 'white', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'}} />
                </button>
              </div>
            )}
          </div>

          {source === 'projets' && comites.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#64748b', marginBottom: '6px' }}>
                🗓️ COMITÉ DE RATTACHEMENT {loadingMembers && <span style={{ color: '#94a3b8', fontWeight: '400', fontSize: '12px' }}>(membres ajoutés aux participants...)</span>}
              </label>
              <select value={comiteId} onChange={e => handleComiteChange(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '14px', background: 'white' }}>
                <option value="">Sans comité</option>
                {comites.map(c => <option key={c.id} value={String(c.id)}>{c.nom}</option>)}
              </select>
            </div>
          )}

          <h3 style={{margin: '0 0 14px', fontSize: '14px', fontWeight: '700', color: '#1e293b', borderTop: '1px solid #e2e8f0', paddingTop: '16px'}}>Participants ({participants.length})</h3>

          <div style={{background: '#eff6ff', borderRadius: '10px', padding: '14px', marginBottom: '14px'}}>
            <div style={{fontSize: '12px', fontWeight: '700', color: '#1d4ed8', marginBottom: '8px'}}>🔍 Ajouter un agent DSI (Active Directory)</div>
            <div style={{position: 'relative'}}>
              <input type="text" placeholder="Rechercher par nom..." style={{width: '100%', padding: '9px 12px', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '14px'}} value={ad.query} onChange={e => ad.setQuery(e.target.value)} />
              {ad.searching && <span style={{position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#64748b'}}>...</span>}
            </div>
            {ad.results.length > 0 && (
              <div style={{marginTop: '8px', border: '1px solid #bfdbfe', borderRadius: '8px', background: 'white', maxHeight: '160px', overflowY: 'auto'}}>
                {ad.results.map(u => (
                  <div key={u.username} style={{padding: '8px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9'}} onClick={() => addParticipantFromAD(u)}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#eff6ff'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'white'}>
                    <div>
                      <div style={{fontWeight: '600', fontSize: '13px'}}>{u.displayName}</div>
                      <div style={{fontSize: '11px', color: '#64748b'}}>{u.email}{u.service ? ` — ${u.service}` : ''}{u.direction ? ` / ${u.direction}` : ''}</div>
                    </div>
                    <Plus size={14} color="#2563eb" />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{background: '#f0fdf4', borderRadius: '10px', padding: '14px', marginBottom: '14px'}}>
            <div style={{fontSize: '12px', fontWeight: '700', color: '#16a34a', marginBottom: '8px'}}>➕ Ajouter un participant</div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr 1fr 1fr auto', gap: '8px', alignItems: 'end'}}>
              <div><label style={{display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px'}}>NOM *</label><input type="text" placeholder="Nom" style={{width: '100%', padding: '8px 10px', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '13px'}} value={newParticipant.nom} onChange={e => setNewParticipant(v => ({...v, nom: e.target.value}))} /></div>
              <div><label style={{display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px'}}>PRÉNOM</label><input type="text" placeholder="Prénom" style={{width: '100%', padding: '8px 10px', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '13px'}} value={newParticipant.prenom} onChange={e => setNewParticipant(v => ({...v, prenom: e.target.value}))} /></div>
              <div><label style={{display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px'}}>EMAIL</label><input type="email" placeholder="Email" style={{width: '100%', padding: '8px 10px', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '13px'}} value={newParticipant.email} onChange={e => setNewParticipant(v => ({...v, email: e.target.value}))} /></div>
              <div>
                <label style={{display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px'}}>DIRECTION</label>
                <input type="text" placeholder='Direction' list="suggest-dir" style={{width: '100%', padding: '8px 10px', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '13px'}} value={newParticipant.direction} onChange={e => setNewParticipant(v => ({...v, direction: e.target.value}))} />
                <datalist id="suggest-dir">{directions.map(d => <option key={d} value={d} />)}</datalist>
            </div>
            <div>
                <label style={{display: 'block', fontSize: '11px', fontWeight: '600', color: '#64748b', marginBottom: '4px'}}>SERVICE</label>
                <input type="text" placeholder='Service' list="suggest-svc" style={{width: '100%', padding: '8px 10px', border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '13px'}} value={newParticipant.service} onChange={e => setNewParticipant(v => ({...v, service: e.target.value}))} />
                <datalist id="suggest-svc">{services.map(s => <option key={s} value={s} />)}</datalist>
              </div>
              <button onClick={addParticipantManuel} style={{padding: '8px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px', whiteSpace: 'nowrap'}}>+ Ajouter</button>
            </div>
          </div>

          {participants.length > 0 && (() => {
            const dsi = participants.filter(p => p.type_presence === 'dsi');
            const metiers = participants.filter(p => p.type_presence !== 'dsi');
            return (
              <div style={{display: 'flex', flexDirection: 'column', gap: '16px'}}>
                {dsi.length > 0 && (
                  <div>
                    <h4 style={{margin: '0 0 10px', fontSize: '12px', fontWeight: '700', color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.05em'}}>👨‍💼 DSI ({dsi.length})</h4>
                    <div style={{border: '1px solid #dbeafe', borderRadius: '8px', overflow: 'hidden', background: '#f0f9ff'}}>
                      {dsi.map((p, i) => (
                        <div key={p.id} style={{display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: i < dsi.length - 1 ? '1px solid #bfdbfe' : 'none'}}>
                          <select value={p.statut_presence} onChange={e => setParticipants(prev => prev.map(x => x.id === p.id ? {...x, statut_presence: e.target.value as 'present' | 'excuse' | 'info'} : x))} style={{fontSize: '11px', padding: '4px 6px', border: '1px solid #bfdbfe', borderRadius: '4px', background: 'white'}}>
                            <option value="present">Présent</option>
                            <option value="excuse">Excusé</option>
                            <option value="info">Pour information</option>
                          </select>
                          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: '2px'}}>
                            <span style={{fontSize: '13px', fontWeight: '700', color: '#1e293b'}}>{p.prenom ? `${p.prenom} ` : ''}{p.nom}</span>
                            <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                              {p.service && <span style={{fontSize: '11px', fontWeight: '500', background: 'rgba(0,0,0,0.05)', padding: '2px 7px', borderRadius: '3px', color: '#475569'}}>{p.service}</span>}
                            </div>
                          </div>
                          <button onClick={() => setParticipants(prev => prev.filter(x => x.id !== p.id))} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', flexShrink: 0}}><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {metiers.length > 0 && (
                  <div>
                    <h4 style={{margin: '0 0 10px', fontSize: '12px', fontWeight: '700', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em'}}>👥 Autres ({metiers.length})</h4>
                    <div style={{border: '1px solid #bbf7d0', borderRadius: '8px', overflow: 'hidden', background: '#f0fdf4'}}>
                      {metiers.map((p, i) => (
                        <div key={p.id} style={{display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', borderBottom: i < metiers.length - 1 ? '1px solid #86efac' : 'none'}}>
                          <select value={p.statut_presence} onChange={e => setParticipants(prev => prev.map(x => x.id === p.id ? {...x, statut_presence: e.target.value as 'present' | 'excuse' | 'info'} : x))} style={{fontSize: '11px', padding: '4px 6px', border: '1px solid #86efac', borderRadius: '4px', background: 'white'}}>
                            <option value="present">Présent</option>
                            <option value="excuse">Excusé</option>
                            <option value="info">Pour information</option>
                          </select>
                          <div style={{flex: 1, display: 'flex', flexDirection: 'column', gap: '2px'}}>
                            <span style={{fontSize: '13px', fontWeight: '700', color: '#1e293b'}}>{p.prenom ? `${p.prenom} ` : ''}{p.nom}</span>
                            <div style={{display: 'flex', gap: '6px', flexWrap: 'wrap'}}>
                              {p.service && <span style={{fontSize: '11px', fontWeight: '500', background: 'rgba(0,0,0,0.05)', padding: '2px 7px', borderRadius: '3px', color: '#475569'}}>{p.service}</span>}
                            </div>
                          </div>
                          <button onClick={() => setParticipants(prev => prev.filter(x => x.id !== p.id))} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', flexShrink: 0}}><X size={14} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        <div style={{padding: '16px 28px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '12px', justifyContent: 'flex-end'}}>
          <button onClick={onClose} style={{padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#475569'}}>Annuler</button>
          <button onClick={handleCreate} disabled={isCreating} style={{padding: '10px 24px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700'}}>
            {isCreating ? '...' : '✓ Créer la réunion'}
          </button>
            </div>
          </div>
    </div>
  );
};

export default CreateReunionModal;
