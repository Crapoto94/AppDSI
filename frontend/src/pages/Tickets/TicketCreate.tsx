import React, { useState, useEffect } from 'react';
import axios from 'axios';
import Header from '../../components/Header';
import RequesterSearch from '../../components/RequesterSearch';

const TYPES = [
  { value: 1, label: 'Incident', icon: '!' },
  { value: 2, label: 'Demande', icon: '+' },
];

export default function TicketCreate() {
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

  useEffect(() => {
    loadCategoriesAndApps();
  }, []);

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
    // Fonction pour normaliser (supprimer accents et minuscules)
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
        const res = await axios.get(`/api/tickets/users/search?q=${encodeURIComponent(observerSearch)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setObserverResults(res.data);
      } catch { setObserverResults([]); }
      finally { setObserverSearching(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [observerSearch]);

  function addObserver(user: any) {
    if (!observers.some(o => o.id === user.id)) {
      setObservers(prev => [...prev, user]);
    }
    setObserverSearch('');
    setObserverResults([]);
  }

  function removeObserver(userId: number) {
    setObservers(prev => prev.filter(o => o.id !== userId));
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
    <>
      <Header />
      <div style={{ maxWidth: 800, margin: '32px auto', padding: '0 24px', fontFamily: 'system-ui, sans-serif' }}>
      <a href="/tickets" style={{ color: '#6366f1', textDecoration: 'none', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 24 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
        Retour aux tickets
      </a>

      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 24px 0' }}>Nouveau ticket</h1>

      {error && <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 }}>{error}</div>}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gap: 16, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Type de demande *</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {TYPES.map(t => (
                <button key={t.value} type="button" onClick={() => setForm(f => ({ ...f, type: t.value }))}
                  style={{
                    padding: '12px', borderRadius: 8, border: form.type === t.value ? '2px solid #6366f1' : '1px solid #e2e8f0',
                    background: form.type === t.value ? '#eef2ff' : '#fff', cursor: 'pointer', textAlign: 'center',
                    fontSize: 13, fontWeight: form.type === t.value ? 600 : 400, color: '#1e293b'
                  }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Titre *</label>
            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Ex: Impossible d'accéder à l'application CRM"
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Description</label>
            <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Décrivez votre problème ou demande en détail..."
              rows={6}
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Priorité</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) }))}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff' }}>
                <option value={2}>Basse</option>
                <option value={3}>Normale</option>
                <option value={4}>Haute</option>
                <option value={5}>Tres haute</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Impact</label>
              <select value={form.impact} onChange={e => setForm(f => ({ ...f, impact: parseInt(e.target.value) }))}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff' }}>
                <option value={2}>1 utilisateur</option>
                <option value={3}>Groupe de travail</option>
                <option value={4}>Service / Direction</option>
                <option value={5}>Global</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Catégorie</label>
              <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value, subcategory_id: '' }))}
                disabled={loadingData}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff', cursor: loadingData ? 'not-allowed' : 'pointer' }}>
                <option value="">— Sélectionnez une catégorie —</option>
                {categories.filter(c => !c.parent_id).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Sous-catégorie</label>
              <select value={form.subcategory_id} onChange={e => setForm(f => ({ ...f, subcategory_id: e.target.value }))}
                disabled={!form.category_id || loadingData}
                style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff', cursor: !form.category_id || loadingData ? 'not-allowed' : 'pointer', opacity: !form.category_id ? 0.6 : 1 }}>
                <option value="">— Sélectionnez une sous-catégorie —</option>
                {categories.filter(c => c.parent_id === parseInt(form.category_id || '0')).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Logiciel / Métier</label>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={softwareSearch} onChange={e => setSoftwareSearch(e.target.value)}
                  placeholder="Rechercher un logiciel..."
                  disabled={loadingData}
                  style={{ flex: 1, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box', cursor: loadingData ? 'not-allowed' : 'text' }} />
                {selectedSoftware && (
                  <button onClick={clearSoftware} style={{ padding: '6px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>✕</button>
                )}
              </div>
              {!selectedSoftware && softwareResults.length > 0 && (
                <div style={{ marginTop: 4, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', position: 'absolute', width: '100%', background: '#fff', zIndex: 10, maxHeight: 300, overflowY: 'auto', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
                  {softwareResults.map(app => (
                    <div key={app.id} onClick={() => selectSoftware(app)}
                      style={{
                        padding: '10px 12px', cursor: 'pointer', fontSize: 13,
                        borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        transition: 'background 0.1s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                      <span style={{ fontWeight: 500, color: '#1e293b' }}>{app.name}</span>
                      <span style={{ color: '#6366f1', fontSize: 12 }}>+</span>
                    </div>
                  ))}
                </div>
              )}
              {!selectedSoftware && softwareSearch.trim().length > 0 && softwareResults.length === 0 && (
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Aucun logiciel trouvé</div>
              )}
              {selectedSoftware && (
                <div style={{ marginTop: 8, padding: '8px 12px', background: '#e0e7ff', border: '1px solid #c7d2fe', borderRadius: 6, fontSize: 13, color: '#4f46e5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>✓ {selectedSoftware.name}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}>
              <input type="checkbox" checked={form.is_vip} onChange={e => setForm(f => ({ ...f, is_vip: e.target.checked }))} />
              <span>⭐ Ticket VIP</span>
              <span style={{ fontWeight: 400, color: '#64748b', fontSize: 12 }}>(Priorité élevée, suivi spécial)</span>
            </label>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Demandeur</label>
            <RequesterSearch
              value={form.requester_email}
              onChange={(email, name) => setForm(f => ({ ...f, requester_email: email, requester_name: name }))}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Observateurs</label>
            {observers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {observers.map(o => (
                  <span key={o.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
                    background: '#ede9fe', color: '#7c3aed', borderRadius: 12, fontSize: 12, fontWeight: 500
                  }}>
                    {o.name || o.email}
                    <span onClick={() => removeObserver(o.id)} style={{ cursor: 'pointer', fontWeight: 700, marginLeft: 2 }}>×</span>
                  </span>
                ))}
              </div>
            )}
            <input value={observerSearch} onChange={e => setObserverSearch(e.target.value)}
              placeholder="Rechercher un utilisateur par nom ou email..."
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
            {observerSearching && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Recherche...</div>}
            {observerResults.length > 0 && (
              <div style={{ marginTop: 4, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                {observerResults.map(u => (
                  <div key={u.id} onClick={() => addObserver(u)}
                    style={{
                      padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                      borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                    <span style={{ fontWeight: 500, color: '#1e293b' }}>{u.name}</span>
                    <span style={{ color: '#6366f1', fontSize: 12 }}>{u.email}</span>
                  </div>
                ))}
              </div>
            )}
            {observerSearch.length >= 2 && observerResults.length === 0 && !observerSearching && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Aucun utilisateur trouvé</div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Lieu / Localisation</label>
            <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
              placeholder="Ex: Bâtiment A, bureau 302"
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: 20, marginTop: 8 }}>
            <a href="/tickets" style={{ padding: '10px 24px', border: '1px solid #e2e8f0', borderRadius: 8, textDecoration: 'none', color: '#475569', fontWeight: 500, fontSize: 14 }}>Annuler</a>
            <button type="submit" disabled={submitting}
              style={{
                padding: '10px 24px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 8,
                fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: submitting ? 0.6 : 1
              }}>
              {submitting ? 'Création...' : 'Créer le ticket'}
            </button>
          </div>
        </div>
      </form>
    </div>
    </>
  );
}