import React, { useState, useEffect } from 'react';
import axios from 'axios';
import RequesterSearch from '../RequesterSearch';
import { X, Ticket, HelpCircle, AlertCircle, PlusCircle, Search, MapPin, Star } from 'lucide-react';

interface Props {
  onClose: () => void;
}

const TYPES = [
  { value: 1, label: 'Incident', icon: <AlertCircle size={20} /> },
  { value: 2, label: 'Demande', icon: <PlusCircle size={20} /> },
];

export default function CreateTicketModal({ onClose }: Props) {
  const [form, setForm] = useState({
    title: '', content: '', type: 1, priority: 3, impact: 2,
    category_id: '', subcategory_id: '', software_id: '', requester_name: '', requester_email: '',
    location: '', is_vip: false
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [observerSearch, setObserverSearch] = useState('');
  const [observerResults, setObserverResults] = useState<any[]>([]);
  const [observers, setObservers] = useState<any[]>([]);
  const [observerSearching, setObserverSearching] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [apps, setApps] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [softwareSearch, setSoftwareSearch] = useState('');
  const [softwareResults, setSoftwareResults] = useState<any[]>([]);
  const [selectedSoftware, setSelectedSoftware] = useState<any>(null);
  const [sites, setSites] = useState<any[]>([]);
  const [locationSearch, setLocationSearch] = useState('');
  const [locationOpen, setLocationOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<any>(null);
  const [vipMap, setVipMap] = useState<Record<string, boolean>>({});
  const [requesterVip, setRequesterVip] = useState<{ vip: boolean; elu: boolean }>({ vip: false, elu: false });

  useEffect(() => {
    loadCategoriesAndApps();
    loadSites();
    loadVips();
  }, []);

  async function loadVips() {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/tickets/admin/vip-users', { headers: { Authorization: `Bearer ${token}` } });
      const map: Record<string, boolean> = {};
      (res.data || []).forEach((v: any) => { if (v.email) map[String(v.email).toLowerCase()] = !!v.is_elu; });
      setVipMap(map);
    } catch (e) { /* silencieux */ }
  }

  // Détecte un demandeur VIP/élu et adapte le visuel + coche VIP automatiquement.
  function handleRequesterChange(email: string, name: string) {
    const key = (email || '').toLowerCase();
    const isVip = key in vipMap;
    const isElu = !!vipMap[key];
    setRequesterVip({ vip: isVip, elu: isElu });
    setForm(f => ({ ...f, requester_email: email, requester_name: name, is_vip: isVip ? true : f.is_vip }));
  }

  async function loadSites() {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/ville/sites/list', { headers: { Authorization: `Bearer ${token}` } });
      setSites(res.data || []);
    } catch (e) {
      console.error('Failed to load sites:', e);
    }
  }

  async function loadCategoriesAndApps() {
    setLoadingData(true);
    try {
      const token = localStorage.getItem('token');
      const [catRes, appRes] = await Promise.all([
        axios.get('/api/tickets/admin/categories', { headers: { Authorization: `Bearer ${token}` } }),
        axios.get('/api/magapp/apps', { headers: { Authorization: `Bearer ${token}` } })
      ]);
      setCategories(catRes.data || []);
      setApps((appRes.data || []).filter((a: any) => a.present_magapp === 'oui'));
    } catch (e) {
      console.error('Failed to load categories/apps:', e);
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    const normalize = (str: string) => str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const searchNorm = normalize(softwareSearch);
    if (searchNorm.trim()) {
      const filtered = apps.filter(app => normalize(app.name).includes(searchNorm));
      setSoftwareResults(filtered);
    } else {
      setSoftwareResults(apps);
    }
  }, [softwareSearch, apps]);

  useEffect(() => {
    if (!observerSearch || observerSearch.length < 2) { setObserverResults([]); return; }
    const timer = setTimeout(async () => {
      setObserverSearching(true);
      try {
        const token = localStorage.getItem('token');
        const [hubRes, adRes] = await Promise.all([
          axios.get(`/api/tickets/users/search?q=${encodeURIComponent(observerSearch)}`, {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => ({ data: [] })),
          axios.get(`/api/ad/search?q=${encodeURIComponent(observerSearch)}`, {
            headers: { Authorization: `Bearer ${token}` }
          }).catch(() => ({ data: [] })),
        ]);
        const hubUsers: any[] = (hubRes.data || []).map((u: any) => ({ id: u.id, name: u.name, email: u.email, username: u.username }));
        const adUsers: any[] = (adRes.data || []).map((u: any) => ({ id: u.id || null, name: u.displayName, email: u.email, username: u.username }));
        const seen = new Set(hubUsers.map(u => u.username?.toLowerCase()));
        const merged = [...hubUsers, ...adUsers.filter(u => !seen.has(u.username?.toLowerCase()))];
        setObserverResults(merged);
      } catch { setObserverResults([]); }
      finally { setObserverSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [observerSearch]);

  function addObserver(user: any) {
    if (!observers.some(o => o.username && o.username.toLowerCase() === (user.username || '').toLowerCase())) {
      setObservers(prev => [...prev, user]);
    }
    setObserverSearch('');
    setObserverResults([]);
  }

  function removeObserver(username: string) {
    setObservers(prev => prev.filter(o => o.username !== username));
  }

  function selectSoftware(app: any) {
    setSelectedSoftware(app);
    setSoftwareSearch(app.name);
    setSoftwareResults([]);
    setForm(f => ({ ...f, software_id: app.id.toString() }));
  }

  function clearSoftware() {
    setSelectedSoftware(null);
    setSoftwareSearch('');
    setSoftwareResults([]);
    setForm(f => ({ ...f, software_id: '' }));
  }

  function selectSite(site: any) {
    setSelectedSite(site);
    const label = site.code_bien ? `${site.code_bien} — ${site.nom}` : site.nom;
    setLocationSearch(label);
    setLocationOpen(false);
    setForm(f => ({ ...f, location: label }));
  }

  function clearSite() {
    setSelectedSite(null);
    setLocationSearch('');
    setLocationOpen(false);
    setForm(f => ({ ...f, location: '' }));
  }

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const filteredSites = locationSearch.trim()
    ? sites.filter(s => normalize(`${s.code_bien || ''} ${s.nom}`).includes(normalize(locationSearch)))
    : sites;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Le titre est requis'); return; }
    setSubmitting(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const submitData = {
        title: form.title,
        content: form.content,
        type: form.type,
        priority: form.priority,
        impact: form.impact,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        subcategory_id: form.subcategory_id ? parseInt(form.subcategory_id) : null,
        software_id: form.software_id ? parseInt(form.software_id) : null,
        requester_name: form.requester_name,
        requester_email: form.requester_email,
        location: form.location,
        is_vip: form.is_vip,
        observer_ids: observers.map(o => ({ user_id: o.id, name: o.name, email: o.email, username: o.username }))
      };
      const res = await axios.post('/api/tickets', submitData, { headers: { Authorization: `Bearer ${token}` } });
      window.location.href = `/tickets/${res.data.id}`;
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erreur lors de la création');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
    }} onClick={onClose}>
      <div style={{
        background: requesterVip.vip ? (requesterVip.elu ? '#f0fdf4' : '#fefce8') : '#f8fafc',
        borderRadius: 16, width: 700, maxHeight: '95vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        border: requesterVip.vip ? `2px solid ${requesterVip.elu ? '#86efac' : '#fde68a'}` : 'none',
        transition: 'background 0.2s, border-color 0.2s'
      }} onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: '#eef2ff', color: '#6366f1', padding: 8, borderRadius: 10 }}>
              <Ticket size={24} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1e293b' }}>Nouveau ticket</h3>
              <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Créez un nouveau ticket d'incident ou de demande</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', color: '#64748b', padding: 8, borderRadius: '50%', display: 'flex' }}><X size={20} /></button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 20, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}><AlertCircle size={18} /> {error}</div>}

          <form id="create-ticket-form" onSubmit={handleSubmit} style={{ display: 'grid', gap: 20 }}>
            
            {/* Type */}
            <div>
              <label style={labelStyle}>Type de demande *</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {TYPES.map(t => (
                  <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, type: t.value }))}
                    style={{
                      padding: '12px', borderRadius: 10, border: form.type === t.value ? '2px solid #6366f1' : '1px solid #e2e8f0',
                      background: form.type === t.value ? '#fff' : '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.2s',
                      boxShadow: form.type === t.value ? '0 4px 6px -1px rgba(99, 102, 241, 0.1)' : 'none'
                    }}>
                    <div style={{ color: form.type === t.value ? '#6366f1' : '#94a3b8' }}>{t.icon}</div>
                    <span style={{ fontSize: 14, fontWeight: form.type === t.value ? 700 : 500, color: form.type === t.value ? '#1e1b4b' : '#64748b' }}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Titre */}
            <div>
              <label style={labelStyle}>Titre *</label>
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Ex: Problème d'accès au réseau ou demande de matériel..."
                style={inputStyle} />
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle}>Description</label>
              <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Détaillez votre demande ici..."
                rows={4}
                style={{ ...inputStyle, resize: 'vertical', minHeight: 100, fontFamily: 'inherit' }} />
            </div>

            {/* Priority & Impact */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Priorité</label>
                <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) }))}
                  style={inputStyle}>
                  <option value={2}>Basse</option>
                  <option value={3}>Normale</option>
                  <option value={4}>Haute</option>
                  <option value={5}>Très haute</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Impact</label>
                <select value={form.impact} onChange={e => setForm(f => ({ ...f, impact: parseInt(e.target.value) }))}
                  style={inputStyle}>
                  <option value={2}>1 utilisateur</option>
                  <option value={3}>Groupe de travail</option>
                  <option value={4}>Service / Direction</option>
                  <option value={5}>Global</option>
                </select>
              </div>
            </div>

            {/* Categories */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <label style={labelStyle}>Catégorie</label>
                <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value, subcategory_id: '' }))}
                  disabled={loadingData}
                  style={inputStyle}>
                  <option value="">— Choisir —</option>
                  {categories.filter(c => !c.parent_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Sous-catégorie</label>
                <select value={form.subcategory_id} onChange={e => setForm(f => ({ ...f, subcategory_id: e.target.value }))}
                  disabled={!form.category_id || loadingData}
                  style={{ ...inputStyle, opacity: !form.category_id ? 0.6 : 1 }}>
                  <option value="">— Choisir —</option>
                  {categories.filter(c => c.parent_id === parseInt(form.category_id || '0')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>

            {/* Software Search */}
            {form.category_id && categories.find(c => c.id === parseInt(form.category_id))?.name.toLowerCase().includes('logiciel') && (
              <div style={{ background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <label style={labelStyle}>Logiciel / Application</label>
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                      <input value={softwareSearch} onChange={e => setSoftwareSearch(e.target.value)}
                        placeholder="Rechercher..."
                        style={{ ...inputStyle, paddingLeft: 36 }} />
                    </div>
                    {selectedSoftware && (
                      <button onClick={clearSoftware} type="button" style={{ padding: '0 12px', background: '#fee2e2', color: '#ef4444', border: 'none', borderRadius: 8, cursor: 'pointer' }}><X size={18} /></button>
                    )}
                  </div>
                  {!selectedSoftware && softwareResults.length > 0 && softwareSearch.trim() && (
                    <div style={dropdownStyle}>
                      {softwareResults.map(app => (
                        <div key={app.id} onClick={() => selectSoftware(app)} style={dropdownItemStyle}>
                          <span style={{ fontWeight: 600 }}>{app.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedSoftware && (
                  <div style={{ marginTop: 10, padding: '8px 12px', background: '#f0f9ff', color: '#0369a1', borderRadius: 8, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #bae6fd' }}>
                    <div style={{ background: '#0369a1', color: '#fff', borderRadius: 4, padding: 2 }}><HelpCircle size={14} /></div>
                    Logiciel sélectionné : <strong>{selectedSoftware.name}</strong>
                  </div>
                )}
              </div>
            )}

            {/* VIP & Requester */}
            <div style={{ background: '#fff', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16, userSelect: 'none' }}>
                <div style={{ position: 'relative', display: 'flex' }}>
                  <input type="checkbox" checked={form.is_vip} onChange={e => setForm(f => ({ ...f, is_vip: e.target.checked }))} 
                    style={{ width: 20, height: 20, cursor: 'pointer' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>⭐ Marquer comme VIP</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>(Priorité critique)</span>
                </div>
              </label>

              <label style={labelStyle}>Demandeur</label>
              <RequesterSearch
                value={form.requester_email}
                onChange={handleRequesterChange}
              />
              {requesterVip.vip && (
                <div style={{
                  marginTop: 8, padding: '8px 12px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: requesterVip.elu ? '#dcfce7' : '#fef9c3',
                  border: `1.5px solid ${requesterVip.elu ? '#86efac' : '#fde68a'}`,
                  color: requesterVip.elu ? '#15803d' : '#92400e',
                }}>
                  {requesterVip.elu ? '🏛️ Demandeur ÉLU — traitement prioritaire' : '⭐ Demandeur VIP — traitement prioritaire'}
                </div>
              )}
            </div>

            {/* Observers */}
            <div>
              <label style={labelStyle}>Observateurs</label>
              {observers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                  {observers.map(o => (
                    <span key={o.username || o.email} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
                      background: '#f1f5f9', color: '#475569', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1px solid #e2e8f0'
                    }}>
                      {o.name || o.email}
                      <X size={14} onClick={() => removeObserver(o.username)} style={{ cursor: 'pointer' }} />
                    </span>
                  ))}
                </div>
              )}
              <div style={{ position: 'relative' }}>
                <input value={observerSearch} onChange={e => setObserverSearch(e.target.value)}
                  placeholder="Ajouter un observateur (nom ou email)..."
                  style={inputStyle} />
                {observerSearching && <div style={{ position: 'absolute', right: 12, top: 12, fontSize: 12, color: '#94a3b8' }}>Recherche...</div>}
                {observerResults.length > 0 && (
                  <div style={dropdownStyle}>
                    {observerResults.map(u => (
                      <div key={u.username || u.email} onClick={() => addObserver(u)} style={dropdownItemStyle}>
                        <div style={{ fontWeight: 600 }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{u.email}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            <div>
              <label style={labelStyle}>Lieu / Localisation</label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  <MapPin size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#94a3b8' }} />
                  <input value={locationSearch}
                    onChange={e => { setLocationSearch(e.target.value); setSelectedSite(null); setLocationOpen(true); setForm(f => ({ ...f, location: e.target.value })); }}
                    onFocus={() => setLocationOpen(true)}
                    onBlur={() => setTimeout(() => setLocationOpen(false), 200)}
                    placeholder="Chercher un site (ex: Ecole, Bureau...)"
                    style={{ ...inputStyle, paddingLeft: 36 }} />
                </div>
                {locationOpen && filteredSites.length > 0 && (
                  <div style={dropdownStyle}>
                    {filteredSites.slice(0, 30).map(s => (
                      <div key={s.id} onMouseDown={() => selectSite(s)} style={dropdownItemStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600 }}>{s.nom}</span>
                          <span style={{ fontSize: 10, color: '#94a3b8', fontFamily: 'monospace' }}>{s.code_bien}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selectedSite && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#ecfdf5', color: '#047857', borderRadius: 8, fontSize: 13, border: '1px solid #a7f3d0' }}>
                  ✓ Site : <strong>{selectedSite.nom}</strong> ({selectedSite.code_bien})
                </div>
              )}
            </div>

          </form>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #e2e8f0', background: '#fff', display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', color: '#475569', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
          <button type="submit" form="create-ticket-form" disabled={submitting}
            style={{
              padding: '10px 24px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10,
              fontSize: 14, fontWeight: 700, cursor: submitting ? 'default' : 'pointer',
              opacity: submitting ? 0.7 : 1, transition: 'all 0.2s',
              boxShadow: '0 4px 6px -1px rgba(99, 102, 241, 0.2)'
            }}>
            {submitting ? 'Création...' : '🚀 Créer le ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 6
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10,
  fontSize: 14, background: '#fff', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s'
};

const dropdownStyle: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, marginTop: 4,
  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
  maxHeight: 250, overflow: 'auto'
};

const dropdownItemStyle: React.CSSProperties = {
  padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13,
  transition: 'background 0.1s'
};
