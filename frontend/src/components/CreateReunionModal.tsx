import React, { useState, useCallback, useRef } from 'react';
import { X, Plus } from 'lucide-react';

interface Participant {
  id: number;
  reunion_id: number;
  nom: string;
  prenom?: string;
  email?: string;
  service?: string;
  direction?: string;
  type_presence: 'metier' | 'dsi';
  statut_presence: 'present' | 'excuse' | 'info';
  ad_username?: string;
}

interface ADUser {
  username: string;
  displayName: string;
  email: string;
  service?: string;
  direction?: string;
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
  const [newReunion, setNewReunion] = useState({ titre: '', date_reunion: '', lieu: '' });
  const [comiteId, setComiteId] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [newParticipant, setNewParticipant] = useState({ nom: '', prenom: '', email: '', service: '', direction: '', type_presence: 'metier' as 'metier' | 'dsi', statut_presence: 'present' as 'present' | 'excuse' | 'info' });
  const [adQuery, setAdQuery] = useState('');
  const [adResults, setAdResults] = useState<ADUser[]>([]);
  const [adSearching, setAdSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const adSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          type_presence: 'metier' as 'metier' | 'dsi',
          statut_presence: 'present' as 'present' | 'excuse' | 'info',
          ad_username: m.ad_username || ''
        }));
      setParticipants(prev => [...prev, ...newParticipants]);
    }
    setLoadingMembers(false);
  };

  const searchAD = useCallback((q: string) => {
    setAdQuery(q);
    if (adSearchTimerRef.current !== null) clearTimeout(adSearchTimerRef.current);
    if (q.length < 2) { setAdResults([]); return; }
    setAdSearching(true);
    adSearchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ad/search?q=${encodeURIComponent(q)}`, { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await res.json();
        setAdResults(Array.isArray(data) ? data : []);
      } catch (e) { setAdResults([]); }
      finally { setAdSearching(false); }
    }, 400);
  }, [token]);

  const addParticipantFromAD = (user: ADUser) => {
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
    setAdQuery('');
    setAdResults([]);
  };

  const addParticipantManuel = () => {
    if (!newParticipant.nom) return;
    setParticipants(prev => [...prev, { ...newParticipant, id: Date.now(), reunion_id: 0 }]);
    setNewParticipant({ nom: '', prenom: '', email: '', service: '', direction: '', type_presence: 'metier', statut_presence: 'present' });
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
        body: JSON.stringify({ ...newReunion, participants, source })
      });
      if (res.ok) {
        const created = await res.json();
        setNewReunion({ titre: '', date_reunion: '', lieu: '' });
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
              <input type="text" placeholder="Rechercher par nom..." style={{width: '100%', padding: '9px 12px', border: '1px solid #bfdbfe', borderRadius: '8px', fontSize: '14px'}} value={adQuery} onChange={e => searchAD(e.target.value)} />
              {adSearching && <span style={{position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', color: '#64748b'}}>...</span>}
            </div>
            {adResults.length > 0 && (
              <div style={{marginTop: '8px', border: '1px solid #bfdbfe', borderRadius: '8px', background: 'white', maxHeight: '160px', overflowY: 'auto'}}>
                {adResults.map(u => (
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
                    <h4 style={{margin: '0 0 10px', fontSize: '12px', fontWeight: '700', color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.05em'}}>👥 Métiers ({metiers.length})</h4>
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
