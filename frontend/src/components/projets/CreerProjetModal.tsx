import React, { useState, useCallback, useRef } from 'react';
import { X, Search, Plus, User } from 'lucide-react';

interface ADUser {
  username: string; displayName: string; email: string;
  service?: string; direction?: string;
}

interface CreerProjetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
  token: string | null;
}

const CreerProjetModal: React.FC<CreerProjetModalProps> = ({ isOpen, onClose, onCreated, token }) => {
  const [form, setForm] = useState({
    titre: '', description: '', niveau_projet: 'standard',
    service_pilote: '', commanditaire_username: '', chef_projet_username: '',
    date_debut_prevue: '', date_fin_prevue: '', priorite: 0
  });
  const [servicesAssocies, setServicesAssocies] = useState<string[]>([]);
  const [nouveauService, setNouveauService] = useState('');
  const [equipe, setEquipe] = useState<{username: string; displayName: string}[]>([]);
  const [adQuery, setAdQuery] = useState('');
  const [adResults, setAdResults] = useState<ADUser[]>([]);
  const [adSearching, setAdSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [manuelUsername, setManuelUsername] = useState('');
  const [manuelDisplayName, setManuelDisplayName] = useState('');
  const [projetParentId, setProjetParentId] = useState('');
  const [projetParentInfo, setProjetParentInfo] = useState<any>(null);
  const [projetSearch, setProjetSearch] = useState('');
  const [projetResults, setProjetResults] = useState<any[]>([]);
  const [selectedApps, setSelectedApps] = useState<{id: number; name: string}[]>([]);
  const [appSearch, setAppSearch] = useState('');
  const [appResults, setAppResults] = useState<any[]>([]);
  const [appSearching, setAppSearching] = useState(false);
  const adTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchAD = useCallback((q: string) => {
    setAdQuery(q);
    if (adTimerRef.current) clearTimeout(adTimerRef.current);
    if (q.length < 2) { setAdResults([]); return; }
    setAdSearching(true);
    adTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/ad/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setAdResults(Array.isArray(data) ? data : []);
      } catch { setAdResults([]); }
      finally { setAdSearching(false); }
    }, 400);
  }, [token]);

  const ajouterEquipe = (user: ADUser) => {
    if (!equipe.find(e => e.username === user.username)) {
      setEquipe([...equipe, { username: user.username, displayName: user.displayName }]);
    }
    setAdQuery(''); setAdResults([]);
  };

  const ajouterEquipeManuel = () => {
    if (manuelUsername && !equipe.find(e => e.username === manuelUsername)) {
      setEquipe([...equipe, { username: manuelUsername, displayName: manuelDisplayName || manuelUsername }]);
      setManuelUsername(''); setManuelDisplayName('');
    }
  };

  const retirerEquipe = (u: string) => setEquipe(equipe.filter(e => e.username !== u));

  const ajouterService = () => {
    if (nouveauService && !servicesAssocies.includes(nouveauService)) {
      setServicesAssocies([...servicesAssocies, nouveauService]);
      setNouveauService('');
    }
  };

  const creerProjet = async () => {
    if (!form.titre || !form.service_pilote) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/projets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...form,
          services_associes: servicesAssocies,
          equipe: equipe.map(e => e.username),
          projet_parent_id: projetParentId ? parseInt(projetParentId) : null,
          app_ids: selectedApps.map(a => a.id)
        })
      });
      const data = await res.json();
      if (data.id) { onCreated(data.id); onClose(); }
    } catch (e) { console.error(e); }
    finally { setIsCreating(false); }
  };

  const searchProjets = (q: string) => {
    setProjetSearch(q);
    if (q.length < 2) { setProjetResults([]); return; }
    fetch(`/api/projets?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setProjetResults(d.slice(0, 10)); }).catch(() => {});
  };

  const searchApps = (q: string) => {
    setAppSearch(q);
    if (q.length < 2) { setAppResults([]); return; }
    setAppSearching(true);
    fetch(`/api/projets/admin/apps/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (Array.isArray(d)) setAppResults(d); }).catch(() => {}).finally(() => setAppSearching(false));
  };

  const ajouterApp = (app: any) => {
    if (!selectedApps.find(a => a.id === app.id)) setSelectedApps([...selectedApps, { id: app.id, name: app.name }]);
    setAppSearch(''); setAppResults([]);
  };

  const retirerApp = (appId: number) => setSelectedApps(selectedApps.filter(a => a.id !== appId));

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '700px', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: '#1e293b' }}>Nouveau projet</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}><X size={20} /></button>
        </div>
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px', display: 'block' }}>Titre *</label>
            <input value={form.titre} onChange={e => setForm({ ...form, titre: e.target.value })} placeholder="Nom du projet" style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px', display: 'block' }}>Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', resize: 'vertical' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px', display: 'block' }}>Niveau</label>
              <select value={form.niveau_projet} onChange={e => setForm({ ...form, niveau_projet: e.target.value })} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px', background: 'white' }}>
                <option value="mineur">Mineur</option>
                <option value="standard">Standard</option>
                <option value="structurant">Structurant</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px', display: 'block' }}>Service pilote *</label>
              <input value={form.service_pilote} onChange={e => setForm({ ...form, service_pilote: e.target.value })} placeholder="Ex: DSI" style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
            </div>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px', display: 'block' }}>Services associés</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
              {servicesAssocies.map(s => (
                <span key={s} style={{ padding: '3px 10px', background: '#eff6ff', color: '#2563eb', borderRadius: '6px', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {s} <button onClick={() => setServicesAssocies(servicesAssocies.filter(x => x !== s))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2563eb', padding: 0, fontSize: '14px' }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input value={nouveauService} onChange={e => setNouveauService(e.target.value)} placeholder="Ajouter un service" style={{ flex: 1, padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
              <button onClick={ajouterService} style={{ padding: '7px 14px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>Ajouter</button>
            </div>
          </div>
          <div>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px', display: 'block' }}>Équipe projet</label>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '15px', color: '#94a3b8' }} />
              <input value={adQuery} onChange={e => searchAD(e.target.value)} placeholder="Rechercher un agent dans l'annuaire..." style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
              {adSearching && <div style={{ fontSize: '12px', color: '#94a3b8', padding: '4px 0' }}>Recherche en cours...</div>}
              {adResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', marginTop: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '200px', overflow: 'auto' }}>
                  {adResults.map(u => (
                    <div key={u.username} onClick={() => ajouterEquipe(u)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                      <div><div style={{ fontWeight: '600', fontSize: '13px', color: '#1e293b' }}>{u.displayName}</div><div style={{ fontSize: '11px', color: '#94a3b8' }}>{u.email} · {u.service || ''}</div></div>
                      <button style={{ padding: '4px 8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600' }}>+</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <details style={{ marginTop: '8px', cursor: 'pointer' }}>
              <summary style={{ fontSize: '12px', color: '#64748b', fontWeight: '600' }}>Ajout manuel</summary>
              <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                <input value={manuelUsername} onChange={e => setManuelUsername(e.target.value)} placeholder="Identifiant (login)" style={{ flex: 1, padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                <input value={manuelDisplayName} onChange={e => setManuelDisplayName(e.target.value)} placeholder="Nom d'affichage" style={{ flex: 1, padding: '7px 12px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                <button onClick={ajouterEquipeManuel} style={{ padding: '7px 14px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}><Plus size={14} /></button>
              </div>
            </details>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
              {equipe.map(m => (
                <span key={m.username} style={{ padding: '3px 10px', background: '#f1f5f9', borderRadius: '6px', fontSize: '12px', fontWeight: '600', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <User size={12} /> {m.displayName || m.username} <button onClick={() => retirerEquipe(m.username)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0, fontSize: '14px' }}>×</button>
                </span>
              ))}
            </div>
          </div>

          {/* Projet parent */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px', display: 'block' }}>Projet parent</label>
            {projetParentId ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', background: '#f8fafc' }}>
                <span style={{ flex: 1 }}>{projetParentInfo ? `${projetParentInfo.code} — ${projetParentInfo.titre}` : `#${projetParentId}`}</span>
                <button onClick={() => { setProjetParentId(''); setProjetParentInfo(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '2px', fontSize: '14px' }}>✕</button>
              </div>
            ) : (
              <div style={{ position: 'relative' }}>
                <input value={projetSearch} onChange={e => searchProjets(e.target.value)} placeholder="Rechercher un projet parent..." style={{ width: '100%', padding: '7px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
                {projetResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '2px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '180px', overflow: 'auto' }}>
                    {projetResults.map((p: any) => (
                      <div key={p.id} onClick={() => { setProjetParentId(String(p.id)); setProjetParentInfo(p); setProjetSearch(''); setProjetResults([]); }}
                        style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                        <div style={{ fontWeight: '600' }}>{p.titre}</div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>{p.code} · {p.service_pilote}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Applications */}
          <div>
            <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px', display: 'block' }}>Applications associées</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
              {selectedApps.map(app => (
                <span key={app.id} style={{ padding: '3px 10px', background: '#f0fdf4', color: '#16a34a', borderRadius: '6px', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {app.name} <button onClick={() => retirerApp(app.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#16a34a', padding: 0, fontSize: '14px' }}>×</button>
                </span>
              ))}
            </div>
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '11px', color: '#94a3b8' }} />
              <input value={appSearch} onChange={e => searchApps(e.target.value)} placeholder="Rechercher une application (magapp)..." style={{ width: '100%', padding: '7px 10px 7px 32px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }} />
              {appSearching && <div style={{ fontSize: '12px', color: '#94a3b8', padding: '4px 0' }}>Recherche...</div>}
              {appResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: '6px', marginTop: '2px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '180px', overflow: 'auto' }}>
                  {appResults.map(a => (
                    <div key={a.id} onClick={() => ajouterApp(a)}
                      style={{ padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')} onMouseLeave={e => (e.currentTarget.style.background = 'white')}>
                      <span style={{ fontWeight: '600' }}>{a.name}</span>
                      <button style={{ padding: '2px 8px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>+</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px', display: 'block' }}>Début prévu</label>
              <input type="date" value={form.date_debut_prevue} onChange={e => setForm({ ...form, date_debut_prevue: e.target.value })} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: '700', color: '#475569', marginBottom: '4px', display: 'block' }}>Fin prévue</label>
              <input type="date" value={form.date_fin_prevue} onChange={e => setForm({ ...form, date_fin_prevue: e.target.value })} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '14px' }} />
            </div>
          </div>
        </div>
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{ padding: '9px 18px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', color: '#64748b' }}>Annuler</button>
          <button onClick={creerProjet} disabled={isCreating || !form.titre || !form.service_pilote} style={{ padding: '9px 18px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '700', opacity: isCreating || !form.titre || !form.service_pilote ? 0.5 : 1 }}>
            {isCreating ? 'Création...' : 'Créer le projet'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreerProjetModal;
