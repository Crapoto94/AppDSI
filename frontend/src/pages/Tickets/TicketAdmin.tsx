import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

type Tab = 'categories' | 'sla' | 'rules' | 'templates' | 'triggers' | 'technicians' | 'roles' | 'escalade' | 'params';

const btn = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer',
  fontSize: 13, fontWeight: 500,
  background: active ? '#6366f1' : '#f1f5f9',
  color: active ? '#fff' : '#475569',
});

export default function TicketAdmin() {
  const [tab, setTab] = useState<Tab>('categories');
  const [categories, setCategories] = useState<any[]>([]);
  const [slas, setSlas] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);

  useEffect(() => {
    switch (tab) {
      case 'categories': loadData('/api/tickets/admin/categories', setCategories); break;
      case 'sla':        loadData('/api/tickets/admin/sla', setSlas); break;
      case 'rules':      loadData('/api/tickets/admin/assignment-rules', setRules); break;
      case 'templates':  loadData('/api/tickets/admin/notification-templates', setTemplates); break;
      case 'triggers':   loadData('/api/tickets/admin/notification-triggers', setTriggers); break;
      case 'technicians':loadData('/api/tickets/admin/technicians', setTechnicians); break;
    }
  }, [tab]);

  async function loadData(url: string, setter: Function) {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
      setter(res.data);
    } catch (e) { console.error(e); }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'categories',  label: 'Catégories' },
    { key: 'sla',         label: 'SLA' },
    { key: 'rules',       label: 'Règles' },
    { key: 'templates',   label: 'Templates' },
    { key: 'triggers',    label: 'Déclencheurs' },
    { key: 'technicians', label: 'Équipe' },
    { key: 'escalade',    label: '⬆️ Escalade' },
    { key: 'roles',       label: '🔐 Rôles' },
    { key: 'params',      label: '⚙️ Paramètres' },
  ];

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>Administration des tickets</h1>
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={btn(tab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
        {tab === 'categories'  && <CategoryManager data={categories} onUpdate={() => loadData('/api/tickets/admin/categories', setCategories)} />}
        {tab === 'sla'         && <SLAManager data={slas} onUpdate={() => loadData('/api/tickets/admin/sla', setSlas)} />}
        {tab === 'rules'       && <RuleManager data={rules} onUpdate={() => loadData('/api/tickets/admin/assignment-rules', setRules)} />}
        {tab === 'templates'   && <TemplateManager data={templates} onUpdate={() => loadData('/api/tickets/admin/notification-templates', setTemplates)} />}
        {tab === 'triggers'    && <TriggerManager data={triggers} />}
        {tab === 'technicians' && <TeamManager data={technicians} onUpdate={() => loadData('/api/tickets/admin/technicians', setTechnicians)} />}
        {tab === 'escalade'    && <EscaladeManager />}
        {tab === 'roles'       && <RolePermissionsManager />}
        {tab === 'params'      && <TicketParamsManager />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY MANAGER
// ─────────────────────────────────────────────────────────────────────────────
const SUGGESTED_CATEGORIES = [
  { name: '🖥️ Matériel', subs: ['Ordinateurs de bureau', 'Portables', 'Imprimantes', 'Serveurs', 'Écrans', 'Autres équipements'] },
  { name: '📱 Logiciels', subs: ['Systèmes d\'exploitation', 'Bureautique', 'Métier', 'Sécurité', 'Utilitaires', 'Antivirus/Protection'] },
  { name: '🌐 Réseau et Connectivité', subs: ['Connexion Internet', 'WiFi', 'VPN', 'Accès à distance', 'Proxy'] },
  { name: '👤 Utilisateurs et Permissions', subs: ['Création/Suppression de compte', 'Permissions/Droits d\'accès', 'Mot de passe', '2FA/Authentification'] },
  { name: '⚙️ Services IT', subs: ['Email', 'Partage de fichiers', 'Backup/Sauvegarde', 'Serveur d\'impression', 'Services web'] },
  { name: '⚡ Performance', subs: ['Lenteur système', 'Application lente', 'Problème de disque', 'RAM insuffisante', 'Processeur'] },
  { name: '📚 Support et Documentation', subs: ['Formation utilisateur', 'Documentation technique', 'FAQ'] },
];

function CategoryManager({ data, onUpdate }: { data: any[], onUpdate: () => void }) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [showSuggest, setShowSuggest] = useState(false);
  const [apps, setApps] = useState<any[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [expandedParent, setExpandedParent] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  useEffect(() => {
    if (showSuggest && apps.length === 0) {
      loadApps();
    }
  }, [showSuggest]);

  async function loadApps() {
    setLoadingApps(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/magapp/apps', { headers: { Authorization: `Bearer ${token}` } });
      setApps((res.data || []).filter((a: any) => a.present_magapp === 'oui'));
    } catch (e) {
      console.error('Failed to load apps:', e);
    } finally {
      setLoadingApps(false);
    }
  }

  async function add() {
    if (!name.trim()) return;
    const token = localStorage.getItem('token');
    try {
      const res = await axios.post('/api/tickets/admin/categories', { name, parent_id: parentId ? parseInt(parentId) : null }, { headers: { Authorization: `Bearer ${token}` } });
      setName('');
      setParentId('');
      onUpdate();
    } catch (e: any) {
      console.error('Error adding category:', e.response?.data || e.message);
      alert(e.response?.data?.message || 'Erreur lors de l\'ajout');
    }
  }

  async function addSuggested(catName: string, subNames: string[]) {
    const token = localStorage.getItem('token');
    try {
      const catRes = await axios.post('/api/tickets/admin/categories', { name: catName, parent_id: null }, { headers: { Authorization: `Bearer ${token}` } });
      for (const subName of subNames) {
        await axios.post('/api/tickets/admin/categories', { name: subName, parent_id: catRes.data.id }, { headers: { Authorization: `Bearer ${token}` } });
      }
      setShowSuggest(false);
      onUpdate();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de l\'ajout');
    }
  }

  async function addAppAsCategory(app: any, parentId: number) {
    const token = localStorage.getItem('token');
    try {
      await axios.post('/api/tickets/admin/categories', { name: app.name, parent_id: parentId }, { headers: { Authorization: `Bearer ${token}` } });
      setShowSuggest(false);
      onUpdate();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de l\'ajout');
    }
  }

  async function updateCategory(id: number, newName: string) {
    if (!newName.trim()) return;
    const token = localStorage.getItem('token');
    try {
      await axios.put(`/api/tickets/admin/categories/${id}`, { name: newName }, { headers: { Authorization: `Bearer ${token}` } });
      setEditingId(null);
      setEditName('');
      onUpdate();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la modification');
    }
  }

  async function deleteCategory(id: number) {
    if (!confirm('Supprimer cette catégorie ?')) return;
    const token = localStorage.getItem('token');
    try {
      await axios.delete(`/api/tickets/admin/categories/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      onUpdate();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la suppression');
    }
  }

  const rootCategories = data.filter(c => !c.parent_id);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Catégories et sous-catégories</h3>
        <button onClick={() => setShowSuggest(true)} style={{ padding: '8px 16px', background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          💡 Ajouter depuis suggestions
        </button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={name} onChange={e => setName(e.target.value)} onKeyPress={e => e.key === 'Enter' && add()} placeholder="Nom de la catégorie"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
        <select value={parentId} onChange={e => setParentId(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, background: '#fff', minWidth: 150 }}>
          <option value="">— Catégorie principale —</option>
          {rootCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={add} style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Ajouter</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rootCategories.map(c => {
          const subs = data.filter(sub => sub.parent_id === c.id);
          return (
            <div key={c.id} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ padding: 12, background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => setExpandedParent(expandedParent === c.id ? null : c.id)}>
                <div style={{ flex: 1 }}>
                  {editingId === c.id ? (
                    <input value={editName} onChange={e => setEditName(e.target.value)} onClick={e => e.stopPropagation()}
                      style={{ padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13, width: '100%' }}
                      onKeyPress={e => { if (e.key === 'Enter') updateCategory(c.id, editName); if (e.key === 'Escape') setEditingId(null); }} />
                  ) : (
                    <strong style={{ fontSize: 14 }}>{c.name}</strong>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                  {editingId === c.id ? (
                    <>
                      <button onClick={() => updateCategory(c.id, editName)} style={{ padding: '4px 8px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>✓</button>
                      <button onClick={() => setEditingId(null)} style={{ padding: '4px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>✕</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { setEditingId(c.id); setEditName(c.name); }} style={{ padding: '4px 8px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>✎</button>
                      <button onClick={() => deleteCategory(c.id)} style={{ padding: '4px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>🗑</button>
                      <span style={{ fontSize: 18, marginLeft: 8 }}>{expandedParent === c.id ? '▼' : '▶'}</span>
                    </>
                  )}
                </div>
              </div>
              {expandedParent === c.id && (
                <div style={{ padding: 12, background: '#fff', borderTop: '1px solid #e2e8f0' }}>
                  {subs.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {subs.map(sub => (
                        <div key={sub.id} style={{ padding: 8, background: '#f1f5f9', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 13 }}>↳ {sub.name}</span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={() => deleteCategory(sub.id)} style={{ padding: '2px 6px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}>🗑</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic' }}>Aucune sous-catégorie</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showSuggest && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 600, maxHeight: '80vh', overflow: 'auto', width: '90%' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18 }}>Catégories prédéfinies pour le support IT</h3>
            <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
              {SUGGESTED_CATEGORIES.map(cat => (
                <div key={cat.name} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <button onClick={() => addSuggested(cat.name, cat.subs)} style={{ width: '100%', textAlign: 'left', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, cursor: 'pointer', fontWeight: 600, fontSize: 13, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{cat.name}</span> <span>+ Ajouter</span>
                  </button>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 6, marginLeft: 8 }}>
                    {cat.subs.map(sub => <div key={sub} style={{ fontSize: 12, color: '#64748b', padding: '4px 0' }}>↳ {sub}</div>)}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, marginBottom: 16 }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: 14 }}>Ou ajouter les logiciels comme sous-catégories</h4>
              {loadingApps && <div style={{ fontSize: 13, color: '#94a3b8' }}>Chargement des logiciels...</div>}
              {!loadingApps && apps.length > 0 && (
                <div style={{ display: 'grid', gap: 6, maxHeight: 300, overflow: 'auto' }}>
                  {apps.map(app => (
                    <div key={app.id} style={{ padding: 8, background: '#f1f5f9', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                      <span>{app.name}</span>
                      <select onChange={e => { if (e.target.value) addAppAsCategory(app, parseInt(e.target.value)); }} style={{ padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid #cbd5e1' }}>
                        <option value="">Ajouter à...</option>
                        {data.filter(c => !c.parent_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSuggest(false)} style={{ padding: '8px 16px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA MANAGER (complet)
// ─────────────────────────────────────────────────────────────────────────────
type SlaTab = 'definitions' | 'calendars' | 'breaches';

function SLAManager({ data: initialData }: { data: any[], onUpdate: () => void }) {
  const [subTab, setSubTab] = useState<SlaTab>('definitions');
  const [definitions, setDefinitions] = useState<any[]>(initialData);
  const [calendars, setCalendars] = useState<any[]>([]);
  const [breaches, setBreaches] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setDefinitions(initialData); }, [initialData]);

  useEffect(() => {
    if (subTab === 'calendars') loadCalendars();
    if (subTab === 'breaches') loadBreaches();
  }, [subTab]);

  async function loadCalendars() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/tickets/admin/sla/calendars', { headers: { Authorization: `Bearer ${token}` } });
      setCalendars(res.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function loadBreaches() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/tickets/dashboard/sla-breaches', { headers: { Authorization: `Bearer ${token}` } });
      setBreaches(res.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function refreshDefinitions() {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/tickets/admin/sla', { headers: { Authorization: `Bearer ${token}` } });
      setDefinitions(res.data);
    } catch (e) { console.error(e); }
  }

  const subTabs: { key: SlaTab; label: string }[] = [
    { key: 'definitions', label: 'Définitions' },
    { key: 'calendars', label: 'Calendriers' },
    { key: 'breaches', label: 'Dépassements' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        {subTabs.map(t => (
          <button key={t.key} onClick={() => setSubTab(t.key)} style={btn(subTab === t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {subTab === 'definitions' && <SLADefinitions data={definitions} onUpdate={refreshDefinitions} />}
      {subTab === 'calendars' && <SLACalendars data={calendars} onUpdate={loadCalendars} loading={loading} />}
      {subTab === 'breaches' && <SLABreaches data={breaches} loading={loading} />}
    </div>
  );
}

// ── SLA Definitions CRUD ──────────────────────────────────────────
function SLADefinitions({ data, onUpdate }: { data: any[], onUpdate: () => void }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', priority: '', first_response_min: '', resolution_min: '', type: '', is_active: true });

  const token = localStorage.getItem('token');
  const h = { Authorization: `Bearer ${token}` };

  function resetForm() { setForm({ name: '', description: '', priority: '', first_response_min: '', resolution_min: '', type: '', is_active: true }); }

  async function create() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await axios.post('/api/tickets/admin/sla', {
        name: form.name, description: form.description,
        priority: form.priority ? parseInt(form.priority) : null,
        first_response_min: form.first_response_min ? parseInt(form.first_response_min) : null,
        resolution_min: form.resolution_min ? parseInt(form.resolution_min) : null,
        type: form.type || null,
      }, { headers: h });
      setShowCreate(false);
      resetForm();
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  function startEdit(s: any) {
    setEditingId(s.id);
    setForm({
      name: s.name || '', description: s.description || '',
      priority: s.priority?.toString() || '',
      first_response_min: s.first_response_min?.toString() || '',
      resolution_min: s.resolution_min?.toString() || '',
      type: s.type || '',
      is_active: s.is_active !== false,
    });
  }

  async function saveEdit() {
    if (!editingId || !form.name.trim()) return;
    setSaving(true);
    try {
      await axios.put(`/api/tickets/admin/sla/${editingId}`, {
        name: form.name, description: form.description,
        priority: form.priority ? parseInt(form.priority) : null,
        first_response_min: form.first_response_min ? parseInt(form.first_response_min) : null,
        resolution_min: form.resolution_min ? parseInt(form.resolution_min) : null,
        type: form.type || null,
        is_active: form.is_active,
      }, { headers: h });
      setEditingId(null);
      resetForm();
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  async function toggleActive(s: any) {
    try {
      await axios.put(`/api/tickets/admin/sla/${s.id}`, { is_active: !s.is_active }, { headers: h });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function remove(s: any) {
    if (!confirm(`Désactiver « ${s.name} » ?`)) return;
    try {
      await axios.delete(`/api/tickets/admin/sla/${s.id}`, { headers: h });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  const inputStyle: React.CSSProperties = { padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, width: '100%', boxSizing: 'border-box' };

  const input = (val: string, set: (v: string) => void, extra?: any) => {
    const { style, ...rest } = extra || {};
    return <input value={val} onChange={e => set(e.target.value)} style={{ ...inputStyle, ...(style || {}) }} {...rest} />;
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Définitions SLA</h3>
        <button onClick={() => setShowCreate(true)}
          style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          + Nouveau SLA
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
            <th style={{ padding: 10, textAlign: 'left', minWidth: 160 }}>Nom</th>
            <th style={{ padding: 10, textAlign: 'center', width: 60 }}>Priorité</th>
            <th style={{ padding: 10, textAlign: 'center', width: 110 }}>1ère réponse</th>
            <th style={{ padding: 10, textAlign: 'center', width: 110 }}>Résolution</th>
            <th style={{ padding: 10, textAlign: 'center', width: 80 }}>Type</th>
            <th style={{ padding: 10, textAlign: 'center', width: 60 }}>Actif</th>
            <th style={{ padding: 10, textAlign: 'center', width: 90 }}></th>
          </tr>
        </thead>
        <tbody>
          {showCreate && (
            <tr style={{ borderBottom: '1px solid #dbeafe', background: '#eff6ff' }}>
              <td style={{ padding: 8 }}>{input(form.name, v => setForm(f => ({ ...f, name: v })), { placeholder: 'Nom du SLA' })}</td>
              <td style={{ padding: 8 }}>{input(form.priority, v => setForm(f => ({ ...f, priority: v })), { placeholder: '1-5', style: { textAlign:'center' } })}</td>
              <td style={{ padding: 8 }}>{input(form.first_response_min, v => setForm(f => ({ ...f, first_response_min: v })), { placeholder: 'min', style: { textAlign:'center' } })}</td>
              <td style={{ padding: 8 }}>{input(form.resolution_min, v => setForm(f => ({ ...f, resolution_min: v })), { placeholder: 'min', style: { textAlign:'center' } })}</td>
              <td style={{ padding: 8 }}>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  style={{ padding: '6px 6px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, width: '100%', background: '#fff' }}>
                  <option value="">—</option>
                  <option value="1">Incident</option>
                  <option value="2">Demande</option>
                </select>
              </td>
              <td style={{ padding: 8, textAlign: 'center' }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
              </td>
              <td style={{ padding: 8, textAlign: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={create} disabled={saving}
                    style={{ padding: '5px 10px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✓</button>
                  <button onClick={() => { setShowCreate(false); resetForm(); }}
                    style={{ padding: '5px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✕</button>
                </div>
              </td>
            </tr>
          )}
          {data.map(s => {
            const isEditing = editingId === s.id;
            return (
              <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9', background: isEditing ? '#fffbeb' : undefined }}>
                {isEditing ? (
                  <>
                    <td style={{ padding: 8 }}>{input(form.name, v => setForm(f => ({ ...f, name: v })))}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{input(form.priority, v => setForm(f => ({ ...f, priority: v })), { style: { textAlign:'center', width:50 } })}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{input(form.first_response_min, v => setForm(f => ({ ...f, first_response_min: v })), { style: { textAlign:'center', width:70 } })}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>{input(form.resolution_min, v => setForm(f => ({ ...f, resolution_min: v })), { style: { textAlign:'center', width:70 } })}</td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                        style={{ padding: '4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, background: '#fff' }}>
                        <option value="">—</option>
                        <option value="1">Incident</option>
                        <option value="2">Demande</option>
                      </select>
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                    </td>
                    <td style={{ padding: 8, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={saveEdit} disabled={saving}
                          style={{ padding: '4px 8px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>✓</button>
                        <button onClick={() => setEditingId(null)}
                          style={{ padding: '4px 8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>✕</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: 10, fontWeight: 500 }}>{s.name}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>{s.priority || '—'}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>{s.first_response_min ? `${s.first_response_min} min` : '—'}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>{s.resolution_min ? `${(s.resolution_min / 60).toFixed(1)}h` : '—'}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>{s.type === '1' ? 'Incident' : s.type === '2' ? 'Demande' : '—'}</td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      <span onClick={() => toggleActive(s)} style={{ cursor: 'pointer', color: s.is_active ? '#22c55e' : '#ef4444', fontWeight: 600, userSelect: 'none' }}>
                        {s.is_active ? '✓ Oui' : '✕ Non'}
                      </span>
                    </td>
                    <td style={{ padding: 10, textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button onClick={() => startEdit(s)}
                          style={{ padding: '4px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>✎</button>
                        <button onClick={() => remove(s)}
                          style={{ padding: '4px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>🗑</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
          {data.length === 0 && !showCreate && (
            <tr><td colSpan={7} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Aucune définition SLA</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── SLA Calendars ──────────────────────────────────────────────────
function SLACalendars({ data, onUpdate, loading }: { data: any[], onUpdate: () => void, loading: boolean }) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTz, setEditTz] = useState('');
  const [addingHour, setAddingHour] = useState<number | null>(null);
  const [hourDay, setHourDay] = useState('1');
  const [hourStart, setHourStart] = useState('08:00');
  const [hourEnd, setHourEnd] = useState('12:00');

  const token = localStorage.getItem('token');
  const h = { Authorization: `Bearer ${token}` };

  const DAY_LABELS = ['', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await axios.post('/api/tickets/admin/sla/calendars', { name }, { headers: h });
      setName('');
      setShowCreate(false);
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  function startEdit(c: any) {
    setEditingId(c.id);
    setEditName(c.name || '');
    setEditDesc(c.description || '');
    setEditTz(c.timezone || 'Europe/Paris');
  }

  async function saveEdit() {
    if (!editingId || !editName.trim()) return;
    setSaving(true);
    try {
      await axios.put(`/api/tickets/admin/sla/calendars/${editingId}`, { name: editName, description: editDesc, timezone: editTz }, { headers: h });
      setEditingId(null);
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  async function addHour(calendarId: number) {
    setSaving(true);
    try {
      await axios.post(`/api/tickets/admin/sla/calendars/${calendarId}/hours`, { day_of_week: parseInt(hourDay), start_time: hourStart, end_time: hourEnd }, { headers: h });
      setAddingHour(null);
      setHourDay('1'); setHourStart('08:00'); setHourEnd('12:00');
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  async function deleteHour(calendarId: number, hourId: number) {
    if (!confirm('Supprimer cette plage horaire ?')) return;
    try {
      await axios.delete(`/api/tickets/admin/sla/calendars/${calendarId}/hours/${hourId}`, { headers: h });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Calendriers SLA</h3>
        <button onClick={() => setShowCreate(true)}
          style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          + Nouveau calendrier
        </button>
      </div>

      {showCreate && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, padding: 12, background: '#eff6ff', borderRadius: 8, border: '1px solid #dbeafe' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du calendrier"
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
          <button onClick={create} disabled={saving}
            style={{ padding: '8px 16px', background: saving ? '#94a3b8' : '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            {saving ? '...' : 'Créer'}
          </button>
          <button onClick={() => { setShowCreate(false); setName(''); }}
            style={{ padding: '8px 16px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Annuler</button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {data.map(c => (
            <div key={c.id} style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
              {editingId === c.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nom"
                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
                  <input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description"
                    style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Fuseau:</span>
                    <input value={editTz} onChange={e => setEditTz(e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setEditingId(null)}
                      style={{ padding: '6px 14px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12 }}>Annuler</button>
                    <button onClick={saveEdit} disabled={saving}
                      style={{ padding: '6px 14px', border: 'none', borderRadius: 6, background: saving ? '#94a3b8' : '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
                      {saving ? '...' : 'Enregistrer'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                        {c.description || '—'} · {c.timezone || 'Europe/Paris'}
                        {c.is_default && <span style={{ marginLeft: 8, color: '#6366f1', fontWeight: 600 }}>Défaut</span>}
                      </div>
                    </div>
                    <button onClick={() => startEdit(c)} style={{ padding: '4px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>✎ Modifier</button>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {(c.hours || []).map((hSlot: any) => (
                      <span key={hSlot.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#eef2ff', color: '#6366f1', borderRadius: 6, fontSize: 12 }}>
                        {DAY_LABELS[hSlot.day_of_week] || `J${hSlot.day_of_week}`} {hSlot.start_time?.substring(0, 5)}-{hSlot.end_time?.substring(0, 5)}
                        <button onClick={() => deleteHour(c.id, hSlot.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14, padding: 0, marginLeft: 2, lineHeight: 1 }}>×</button>
                      </span>
                    ))}
                  </div>

                  {addingHour === c.id ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: 8, background: '#fff', borderRadius: 6, border: '1px solid #e2e8f0' }}>
                      <select value={hourDay} onChange={e => setHourDay(e.target.value)}
                        style={{ padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12, background: '#fff' }}>
                        {[1, 2, 3, 4, 5, 6, 7].map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                      </select>
                      <input type="time" value={hourStart} onChange={e => setHourStart(e.target.value)}
                        style={{ padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12 }} />
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>-</span>
                      <input type="time" value={hourEnd} onChange={e => setHourEnd(e.target.value)}
                        style={{ padding: '4px 6px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 12 }} />
                      <button onClick={() => addHour(c.id)} disabled={saving}
                        style={{ padding: '4px 10px', background: '#22c55e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>+</button>
                      <button onClick={() => setAddingHour(null)}
                        style={{ padding: '4px 8px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11 }}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setAddingHour(c.id)} style={{ padding: '4px 10px', background: 'none', border: '1px dashed #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 12, color: '#64748b' }}>
                      + Ajouter une plage horaire
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
          {data.length === 0 && !loading && (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucun calendrier</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── SLA Breaches ────────────────────────────────────────────────────
function SLABreaches({ data, loading }: { data: any[], loading: boolean }) {
  const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
    warning: { label: 'Alerte', color: '#f59e0b', bg: '#fffbeb' },
    breached: { label: 'Dépassé', color: '#ef4444', bg: '#fef2f2' },
  };

  return (
    <div>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Dépassements SLA actifs</h3>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {data.map(s => {
            const st = STATUS_LABELS[s.sla_status] || { label: s.sla_status, color: '#64748b', bg: '#f1f5f9' };
            return (
              <div key={s.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: st.bg, color: st.color, whiteSpace: 'nowrap' }}>
                  {st.label}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    <a href={`/tickets/${s.glpi_id}`} style={{ color: '#6366f1', textDecoration: 'none' }}>#{s.glpi_id}</a>
                    {' — '}{s.title}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Statut: {s.status_label || `#${s.status}`}
                    {s.first_response_target && <> · 1ère réponse: {new Date(s.first_response_target).toLocaleString('fr-FR')}</>}
                    {s.resolution_target && <> · Résolution: {new Date(s.resolution_target).toLocaleString('fr-FR')}</>}
                  </div>
                </div>
              </div>
            );
          })}
          {data.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>
              ✅ Aucun dépassement SLA en cours
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RULE MANAGER
// ─────────────────────────────────────────────────────────────────────────────
function RuleManager({ data }: { data: any[], onUpdate: () => void }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Règles d'assignation</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {data.map(r => (
          <div key={r.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Si {r.match_type === 'any' ? 'tous les tickets' : `${r.match_type} = ${r.match_value}`}
                {' → '} Assigner au {r.assign_type === 'technician' ? 'technicien' : 'groupe'} #{r.assign_to_id}
              </div>
            </div>
            <span style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, background: r.is_active ? '#dcfce7' : '#fef2f2', color: r.is_active ? '#16a34a' : '#dc2626' }}>
              {r.is_active ? 'Actif' : 'Inactif'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE / TRIGGER MANAGERS
// ─────────────────────────────────────────────────────────────────────────────
function TemplateManager({ data, onUpdate }: { data: any[], onUpdate: () => void }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);

  function startEdit(t: any) {
    setEditingId(t.id);
    setEditLabel(t.label || '');
    setEditSubject(t.subject || '');
    setEditBody(t.body_html || '');
  }

  async function save() {
    if (!editingId) return;
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/tickets/admin/notification-templates/${editingId}`, {
        label: editLabel, subject: editSubject, body_html: editBody,
      }, { headers: { Authorization: `Bearer ${token}` } });
      setEditingId(null);
      onUpdate();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la sauvegarde');
    }
    setSaving(false);
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 8px 0', fontSize: 16 }}>Templates de notification</h3>
      <p style={{ margin: '0 0 16px', fontSize: 12, color: '#64748b' }}>
        Variables disponibles : {'{{ticket_id}}, {{ticket_title}}, {{ticket_content}}, {{priority_label}}, {{type_label}}, {{status_label}}, {{requester_name}}, {{recipient_name}}, {{assignee_name}}, {{technician_name}}, {{author_name}}, {{old_status}}, {{new_status}}, {{solution_text}}, {{comment_content}}, {{app_name}}, {{app_url}}'}
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {data.map(t => (
          <div key={t.id} style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 8 }}>
            {editingId === t.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', minWidth: 140 }}>{t.slug}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ fontSize: 13, fontWeight: 600, minWidth: 60 }}>Libellé</label>
                  <input value={editLabel} onChange={e => setEditLabel(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ fontSize: 13, fontWeight: 600, minWidth: 60 }}>Sujet</label>
                  <input value={editSubject} onChange={e => setEditSubject(e.target.value)}
                    style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Corps HTML</label>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
                    <ReactQuill value={editBody} onChange={setEditBody} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditingId(null)} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
                  <button onClick={save} disabled={saving}
                    style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: saving ? '#94a3b8' : '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
                    {saving ? 'Enregistrement...' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{t.label}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8', fontFamily: 'monospace', marginLeft: 8 }}>{t.slug}</span>
                  </div>
                  <button onClick={() => startEdit(t)} style={{ padding: '4px 12px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 4, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>✎ Modifier</button>
                </div>
                <div style={{ fontSize: 13, color: '#475569', marginBottom: 4 }}>{t.subject}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.body_html?.replace(/<[^>]*>/g, ' ').substring(0, 150)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TriggerManager({ data }: { data: any[] }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Déclencheurs de notifications</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {data.map(t => (
          <div key={t.id} style={{ padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
            <div>
              <span style={{ fontWeight: 600 }}>{t.event}</span>
              <span style={{ color: '#64748b', margin: '0 8px' }}>→</span>
              <span>{t.recipient_type}</span>
            </div>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>{t.template_label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEAM MANAGER (ex-Techniciens)
// ─────────────────────────────────────────────────────────────────────────────
const TECH_STATUS_COLORS: Record<string, string> = {
  active: '#22c55e', paused: '#f59e0b', inactive: '#ef4444'
};
const TECH_STATUS_LABELS: Record<string, string> = {
  active: 'Actif', paused: 'En pause', inactive: 'Inactif'
};
const MODULE_ROLE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  technician: { label: 'Technicien',  color: '#6366f1', bg: '#eef2ff' },
  supervisor: { label: 'Superviseur', color: '#f59e0b', bg: '#fffbeb' },
  admin:      { label: 'Admin',       color: '#ef4444', bg: '#fef2f2' },
};

function TeamManager({ data, onUpdate }: { data: any[], onUpdate: () => void }) {
  const [filter, setFilter] = useState<string>('all');
  const [showAdSearch, setShowAdSearch] = useState(false);
  const [adQuery, setAdQuery] = useState('');
  const [adResults, setAdResults] = useState<any[]>([]);
  const [selectedAdUser, setSelectedAdUser] = useState<any>(null);
  const [pauseModal, setPauseModal] = useState<any>(null);

  const filtered = filter === 'all' ? data : data.filter(t => t.status === filter);

  async function searchAD(q: string) {
    if (q.length < 2) { setAdResults([]); return; }
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/tickets/admin/technicians/ad-search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${token}` } });
      setAdResults(res.data);
    } catch (e) { console.error(e); }
  }

  async function addFromAD(user: any) {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/tickets/admin/technicians', {
        username: user.username, displayName: user.displayName, email: user.email
      }, { headers: { Authorization: `Bearer ${token}` } });
      setShowAdSearch(false); setAdQuery(''); setAdResults([]); setSelectedAdUser(null);
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function updateStatus(tech: any, status: string) {
    if (status === 'paused') { setPauseModal(tech); return; }
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/tickets/admin/technicians/${tech.user_id}/status`, { status }, { headers: { Authorization: `Bearer ${token}` } });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function updateRole(userId: number, role: string) {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/tickets/admin/technicians/${userId}/role`, { role }, { headers: { Authorization: `Bearer ${token}` } });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function confirmPause(techId: number, pausedUntil: string, mode: string, targetId?: number) {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`/api/tickets/admin/technicians/${techId}/status`, { status: 'paused', paused_until: pausedUntil || null }, { headers: { Authorization: `Bearer ${token}` } });
      if (mode) {
        await axios.post(`/api/tickets/admin/technicians/${techId}/reassign`, { mode, target_id: targetId }, { headers: { Authorization: `Bearer ${token}` } });
      }
      setPauseModal(null); onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function deleteTechnician(tech: any) {
    if (!confirm(`Retirer ${tech.displayname || tech.displayName} de l'équipe ?`)) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/tickets/admin/technicians/${tech.user_id}`, { headers: { Authorization: `Bearer ${token}` } });
      onUpdate();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <button onClick={() => setShowAdSearch(true)}
          style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
          + Ajouter depuis l'AD
        </button>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {['all', 'active', 'paused', 'inactive'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, background: filter === f ? '#6366f1' : '#fff', color: filter === f ? '#fff' : '#475569', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
              {f === 'all' ? 'Tous' : TECH_STATUS_LABELS[f] || f}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {filtered.map((t: any) => {
          const memberRole = t.module_role || t.role || 'technician';
          const roleConf = MODULE_ROLE_CONFIG[memberRole] || MODULE_ROLE_CONFIG.technician;
          return (
            <div key={t.user_id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12, background: '#f8fafc' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: TECH_STATUS_COLORS[t.status] || '#94a3b8', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.displayname || t.displayName || `User #${t.user_id}`}</div>
                <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>{t.email}</span>
                  <span style={{ color: '#94a3b8' }}>@{t.username}</span>
                  {(t.service_complement || t.service_code) && (
                    <span style={{ color: '#6366f1', fontWeight: 500 }}>
                      🏢 {t.service_complement || t.service_code}
                    </span>
                  )}
                </div>
              </div>

              {/* Role selector */}
              <select
                value={memberRole}
                onChange={e => updateRole(t.user_id, e.target.value)}
                style={{
                  padding: '4px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${roleConf.color}40`,
                  background: roleConf.bg, color: roleConf.color,
                  outline: 'none', minWidth: 110,
                }}>
                <option value="technician">🔧 Technicien</option>
                <option value="supervisor">🎯 Superviseur</option>
                <option value="admin">⚙️ Admin</option>
              </select>

              <div style={{ textAlign: 'center', minWidth: 50 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>{t.active_tickets || 0}</div>
                <div style={{ fontSize: 11, color: '#64748b' }}>tickets</div>
              </div>

              <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, background: (TECH_STATUS_COLORS[t.status] || '#94a3b8') + '20', color: TECH_STATUS_COLORS[t.status] || '#64748b' }}>
                {TECH_STATUS_LABELS[t.status] || t.status}
              </span>

              <div style={{ display: 'flex', gap: 4 }}>
                {t.status !== 'active' && (
                  <button onClick={() => updateStatus(t, 'active')} style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#22c55e' }}>▶ Activer</button>
                )}
                {t.status === 'active' && (
                  <button onClick={() => updateStatus(t, 'paused')} style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#f59e0b' }}>⏸ Pause</button>
                )}
                {t.status !== 'inactive' && (
                  <button onClick={() => deleteTechnician(t)} style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#ef4444' }}>🗑</button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 14 }}>
            Aucun membre {filter !== 'all' ? TECH_STATUS_LABELS[filter]?.toLowerCase() : ''}
          </div>
        )}
      </div>

      {showAdSearch && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={() => { setShowAdSearch(false); setAdResults([]); setSelectedAdUser(null); setAdQuery(''); }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 500, maxHeight: '80vh', overflow: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600 }}>Ajouter un membre depuis l'AD</h3>
            <input value={adQuery} onChange={e => { setAdQuery(e.target.value); searchAD(e.target.value); }}
              placeholder="Rechercher un utilisateur (nom, email, login)..."
              style={{ width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, boxSizing: 'border-box', marginBottom: 12 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {adResults.map((u: any) => (
                <div key={u.username} onClick={() => setSelectedAdUser(u)}
                  style={{ padding: '10px 14px', border: `2px solid ${selectedAdUser?.username === u.username ? '#6366f1' : '#e2e8f0'}`, borderRadius: 8, cursor: 'pointer', background: selectedAdUser?.username === u.username ? '#eef2ff' : '#fff' }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{u.displayName}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{u.email} · {u.username}</div>
                </div>
              ))}
              {adQuery.length > 1 && adResults.length === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>Aucun résultat</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setShowAdSearch(false); setAdResults([]); setSelectedAdUser(null); setAdQuery(''); }}
                style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
              <button onClick={() => selectedAdUser && addFromAD(selectedAdUser)} disabled={!selectedAdUser}
                style={{ padding: '8px 16px', border: 'none', borderRadius: 6, cursor: selectedAdUser ? 'pointer' : 'default', background: selectedAdUser ? '#6366f1' : '#e2e8f0', color: selectedAdUser ? '#fff' : '#94a3b8', fontWeight: 600, fontSize: 13 }}>
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {pauseModal && <PauseModal tech={pauseModal} onConfirm={confirmPause} onClose={() => setPauseModal(null)} />}
    </div>
  );
}

function PauseModal({ tech, onConfirm, onClose }: { tech: any, onConfirm: (id: number, until: string, mode: string, target?: number) => void, onClose: () => void }) {
  const [untilDate, setUntilDate] = useState('');
  const [mode, setMode] = useState<string>('');
  const [targetId, setTargetId] = useState<number | undefined>(undefined);
  const [availableTechs, setAvailableTechs] = useState<any[]>([]);

  useEffect(() => {
    if (tech.active_tickets > 0) {
      const token = localStorage.getItem('token');
      axios.get('/api/tickets/admin/technicians/available', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => setAvailableTechs(r.data.filter((t: any) => t.user_id !== tech.user_id)))
        .catch(() => {});
    }
  }, [tech.active_tickets]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 450 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600 }}>Mettre en pause : {tech.displayname || tech.displayName}</h3>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Date de reprise (optionnelle)</label>
          <input type="date" value={untilDate} onChange={e => setUntilDate(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        {tech.active_tickets > 0 && (
          <div style={{ background: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#dc2626', marginBottom: 8 }}>
              ⚠️ {tech.active_tickets} ticket(s) en cours assigné(s)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="reassign" onChange={() => setMode('single')} />
                <span>Réassigner à :</span>
                <select disabled={mode !== 'single'} value={targetId || ''} onChange={e => setTargetId(Number(e.target.value))}
                  style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, background: '#fff' }}>
                  <option value="">Choisir...</option>
                  {availableTechs.map((t: any) => (
                    <option key={t.user_id} value={t.user_id}>{t.displayName} ({t.active_tickets} tickets)</option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="reassign" onChange={() => { setMode('dispatch'); setTargetId(undefined); }} />
                Dispatcher équitablement
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="reassign" onChange={() => { setMode('unassign'); setTargetId(undefined); }} />
                Désassigner ses tickets
              </label>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 13 }}>Annuler</button>
          <button onClick={() => onConfirm(tech.user_id, untilDate, mode, targetId)}
            style={{ padding: '8px 16px', border: 'none', borderRadius: 6, background: '#f59e0b', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>
            Confirmer la pause
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLE PERMISSIONS MANAGER
// ─────────────────────────────────────────────────────────────────────────────
const ALL_ROLES = ['readonly', 'user', 'technician', 'supervisor', 'admin', 'superadmin'];

const ROLE_DISPLAY: Record<string, { label: string; icon: string; color: string }> = {
  readonly:   { label: 'Lecture',     icon: '👁',  color: '#94a3b8' },
  user:       { label: 'Utilisateur', icon: '👤',  color: '#64748b' },
  technician: { label: 'Technicien',  icon: '🔧',  color: '#6366f1' },
  supervisor: { label: 'Superviseur', icon: '🎯',  color: '#f59e0b' },
  admin:      { label: 'Admin',       icon: '⚙️',  color: '#ef4444' },
  superadmin: { label: 'Superadmin',  icon: '🔑',  color: '#7c3aed' },
};

const PERMISSION_GROUPS = [
  {
    label: '🎫 Tickets',
    perms: [
      { key: 'ticket:read',        label: 'Voir les tickets' },
      { key: 'ticket:create',      label: 'Créer un ticket' },
      { key: 'ticket:update',      label: 'Modifier un ticket' },
      { key: 'ticket:delete',      label: 'Supprimer un ticket' },
      { key: 'ticket:view_all',    label: 'Voir tous les tickets' },
      { key: 'ticket:assign',      label: 'Assigner un ticket' },
      { key: 'ticket:assign_self', label: "S'auto-assigner" },
      { key: 'ticket:escalate',    label: 'Escalader' },
      { key: 'ticket:close',       label: 'Fermer' },
      { key: 'ticket:reopen',      label: 'Réouvrir' },
    ]
  },
  {
    label: '💬 Commentaires',
    perms: [
      { key: 'comment:write_public',   label: 'Écrire un commentaire' },
      { key: 'comment:write_internal', label: 'Commentaire interne' },
      { key: 'comment:read_private',   label: 'Voir les internes' },
    ]
  },
  {
    label: '📎 Fichiers & Stats',
    perms: [
      { key: 'attachment:upload',    label: 'Joindre des fichiers' },
      { key: 'dashboard:view_stats', label: 'Voir les statistiques' },
      { key: 'ticket:view_rejected', label: 'Voir les tickets rejetés' },
    ]
  },
  {
    label: '⚙️ Administration',
    perms: [
      { key: 'sla:configure',  label: 'Configurer les SLA' },
      { key: 'category:manage', label: 'Gérer les catégories' },
      { key: 'group:manage',    label: 'Gérer les groupes' },
      { key: 'rules:manage',    label: "Géles règles d'assignation" },
      { key: 'admin:access',    label: 'Accès administration' },
    ]
  },
];

function RolePermissionsManager() {
  const [permissions, setPermissions] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get('/api/tickets/admin/role-permissions', { headers: { Authorization: `Bearer ${token}` } });
      setPermissions(res.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  function toggle(permKey: string, role: string) {
    setPermissions(prev => {
      const current = prev[permKey] || [];
      const has = current.includes(role);
      return { ...prev, [permKey]: has ? current.filter(r => r !== role) : [...current, role] };
    });
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put('/api/tickets/admin/role-permissions', { permissions }, { headers: { Authorization: `Bearer ${token}` } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Permissions par rôle</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Définissez ce que chaque rôle peut faire dans le module tickets</p>
        </div>
        <button onClick={save} disabled={saving}
          style={{ padding: '10px 24px', background: saved ? '#22c55e' : '#6366f1', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
          {saving ? 'Enregistrement...' : saved ? '✓ Sauvegardé' : 'Enregistrer'}
        </button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: '#64748b', fontWeight: 600, background: '#f8fafc', borderBottom: '2px solid #e2e8f0', minWidth: 200 }}>
                Action
              </th>
              {ALL_ROLES.map(role => {
                const rd = ROLE_DISPLAY[role];
                return (
                  <th key={role} style={{ padding: '10px 8px', textAlign: 'center', background: '#f8fafc', borderBottom: '2px solid #e2e8f0', minWidth: 90 }}>
                    <div style={{ fontSize: 16 }}>{rd.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: rd.color, marginTop: 2 }}>{rd.label}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map(group => (
              <React.Fragment key={group.label}>
                <tr>
                  <td colSpan={ALL_ROLES.length + 1} style={{ padding: '10px 12px 6px', fontWeight: 700, fontSize: 12, color: '#374151', background: '#f1f5f9', borderTop: '1px solid #e2e8f0' }}>
                    {group.label}
                  </td>
                </tr>
                {group.perms.map(({ key, label }, idx) => (
                  <tr key={key} style={{ background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                    <td style={{ padding: '10px 12px', color: '#374151', borderBottom: '1px solid #f1f5f9' }}>
                      {label}
                    </td>
                    {ALL_ROLES.map(role => {
                      const allowed = (permissions[key] || []).includes(role);
                      return (
                        <td key={role} style={{ padding: '10px 8px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', width: 20, height: 20 }}>
                            <input
                              type="checkbox"
                              checked={allowed}
                              onChange={() => toggle(key, role)}
                              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: ROLE_DISPLAY[role].color }}
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ESCALADE MANAGER
// ─────────────────────────────────────────────────────────────────────────────
function EscaladeManager() {
  const [supportAgents, setSupportAgents] = useState<any[]>([]);
  const [escaladeTargets, setEscaladeTargets] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [targetType, setTargetType] = useState<'agent' | 'service'>('agent');
  const [selectedTargetService, setSelectedTargetService] = useState('');
  const [adServices, setAdServices] = useState<Record<string, string | null>>({});
  const [verifying, setVerifying] = useState(false);
  const [verifyingAgent, setVerifyingAgent] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const h = { Authorization: `Bearer ${token}` };
      const [cfgRes, techRes, svcRes] = await Promise.all([
        axios.get('/api/tickets/admin/escalade', { headers: h }),
        axios.get('/api/tickets/admin/technicians', { headers: h }),
        axios.get('/api/tickets/admin/escalade/services', { headers: h }),
      ]);
      setSupportAgents(cfgRes.data.support_agents || []);
      setEscaladeTargets(cfgRes.data.escalade_targets || []);
      setTechnicians(techRes.data || []);
      setServices(svcRes.data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function verifyServices(techs: any[]) {
    if (verifying || techs.length === 0) return;
    setVerifying(true);
    setAdServices({});
    const token = localStorage.getItem('token');
    for (const tech of techs) {
      const username = tech.username;
      if (!username) continue;
      setVerifyingAgent(username);
      try {
        const res = await axios.get(
          `/api/tickets/admin/escalade/agent-service?username=${encodeURIComponent(username)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setAdServices(prev => ({ ...prev, [username]: res.data.service || null }));
      } catch {
        setAdServices(prev => ({ ...prev, [username]: null }));
      }
    }
    setVerifyingAgent(null);
    setVerifying(false);
  }

  async function toggleSupportAgent(tech: any) {
    const token = localStorage.getItem('token');
    const existing = supportAgents.find(a => a.user_id === tech.user_id);
    try {
      if (existing) {
        await axios.delete(`/api/tickets/admin/escalade/support-agent/${existing.id}`, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post('/api/tickets/admin/escalade/support-agent', {
          user_id: tech.user_id, username: tech.username,
          display_name: tech.displayname || tech.displayName, email: tech.email
        }, { headers: { Authorization: `Bearer ${token}` } });
      }
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function toggleTargetAgent(tech: any) {
    const token = localStorage.getItem('token');
    const existing = escaladeTargets.find(t => t.target_type === 'agent' && t.user_id === tech.user_id);
    try {
      if (existing) {
        await axios.delete(`/api/tickets/admin/escalade/target/${existing.id}`, { headers: { Authorization: `Bearer ${token}` } });
      } else {
        await axios.post('/api/tickets/admin/escalade/target', {
          target_type: 'agent', user_id: tech.user_id, username: tech.username,
          display_name: tech.displayname || tech.displayName, email: tech.email
        }, { headers: { Authorization: `Bearer ${token}` } });
      }
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function addTargetService() {
    const svc = services.find(s => s.service_code === selectedTargetService);
    if (!svc) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/tickets/admin/escalade/target', {
        target_type: 'service', service_code: svc.service_code, service_label: svc.service_complement || svc.service_code
      }, { headers: { Authorization: `Bearer ${token}` } });
      setSelectedTargetService('');
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  async function removeTarget(id: number) {
    if (!confirm('Retirer cette cible ?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/tickets/admin/escalade/target/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      loadAll();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  const activeTechs = technicians.filter(t => t.status === 'active');

  const techRow = (tech: any, isIn: boolean, onToggle: () => void, activeColor: string) => {
    const username = tech.username || '';
    const isChecked = username in adServices;
    const adService = adServices[username];
    const isCurrentlyVerifying = verifyingAgent === username;
    return (
      <div key={tech.user_id} style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
        border: `1px solid ${isIn ? activeColor + '40' : '#e4e4e7'}`,
        borderRadius: 8, background: isIn ? activeColor + '08' : '#fff',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b', display: 'flex', alignItems: 'center', gap: 6 }}>
            {tech.displayname || tech.displayName}
            {isCurrentlyVerifying && <span style={{ fontSize: 10, color: '#6366f1', fontWeight: 400 }}>⟳ vérification…</span>}
          </div>
          <div style={{ fontSize: 11, color: '#71717a', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 1 }}>
            <span>{tech.service_complement || tech.service_code || tech.email}</span>
            {isChecked && !isCurrentlyVerifying && (
              adService
                ? <span style={{ color: '#6366f1', fontWeight: 600 }}>🏢 {adService}</span>
                : <span style={{ color: '#f59e0b', fontStyle: 'italic' }}>⚠️ non trouvé dans l'AD</span>
            )}
          </div>
        </div>
        <button onClick={onToggle} style={{
          padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 600,
          background: isIn ? '#fef2f2' : '#f0fdf4',
          color: isIn ? '#dc2626' : '#16a34a',
          whiteSpace: 'nowrap',
        }}>
          {isIn ? '✕ Retirer' : '+ Ajouter'}
        </button>
      </div>
    );
  };

  return (
    <div>
      {/* ── Header avec bouton vérifier ── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => verifyServices(activeTechs)} disabled={verifying || activeTechs.length === 0}
          style={{
            padding: '7px 16px', borderRadius: 7, border: '1px solid #e4e4e7', cursor: verifying ? 'default' : 'pointer',
            fontSize: 12, fontWeight: 600, background: verifying ? '#f1f5f9' : '#fff',
            color: verifying ? '#94a3b8' : '#6366f1', display: 'flex', alignItems: 'center', gap: 6,
          }}>
          {verifying
            ? <>⟳ Vérification… ({Object.keys(adServices).length}/{activeTechs.length})</>
            : <>🔍 Vérifier services (AD)</>}
        </button>
      </div>

    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>

      {/* ── Équipe support ── */}
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Équipe support</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#71717a' }}>Agents disponibles pour recevoir des escalades.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {activeTechs.length === 0 && <div style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic' }}>Aucun technicien actif</div>}
          {activeTechs.map(tech => {
            const isIn = supportAgents.some(a => a.user_id === tech.user_id);
            return techRow(tech, isIn, () => toggleSupportAgent(tech), '#6366f1');
          })}
        </div>
      </div>

      {/* ── Cibles d'escalade ── */}
      <div>
        <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Cibles d'escalade</h3>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#71717a' }}>Agents ou services vers lesquels escalader un ticket.</p>

        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          <button onClick={() => setTargetType('agent')}
            style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: targetType === 'agent' ? '#6366f1' : '#f1f5f9', color: targetType === 'agent' ? '#fff' : '#475569' }}>
            👤 Agent
          </button>
          <button onClick={() => setTargetType('service')}
            style={{ padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 12, background: targetType === 'service' ? '#6366f1' : '#f1f5f9', color: targetType === 'service' ? '#fff' : '#475569' }}>
            🏢 Service
          </button>
        </div>

        {targetType === 'agent' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {activeTechs.length === 0 && <div style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic' }}>Aucun technicien actif</div>}
            {activeTechs.map(tech => {
              const isIn = escaladeTargets.some(t => t.target_type === 'agent' && t.user_id === tech.user_id);
              return techRow(tech, isIn, () => toggleTargetAgent(tech), '#8b5cf6');
            })}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <select value={selectedTargetService} onChange={e => setSelectedTargetService(e.target.value)}
                style={{ flex: 1, padding: '8px 10px', border: '1px solid #e4e4e7', borderRadius: 8, fontSize: 13, background: '#fff' }}>
                <option value="">— Choisir un service —</option>
                {services.filter(s => !escaladeTargets.some(t => t.target_type === 'service' && t.service_code === s.service_code)).map(s => (
                  <option key={s.service_code} value={s.service_code}>{s.service_complement || s.service_code}</option>
                ))}
              </select>
              <button onClick={addTargetService} disabled={!selectedTargetService}
                style={{ padding: '8px 16px', background: selectedTargetService ? '#6366f1' : '#e4e4e7', color: selectedTargetService ? '#fff' : '#94a3b8', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: selectedTargetService ? 'pointer' : 'default' }}>
                + Ajouter
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {escaladeTargets.filter(t => t.target_type === 'service').length === 0 && (
                <div style={{ fontSize: 12, color: '#a1a1aa', fontStyle: 'italic' }}>Aucun service configuré</div>
              )}
              {escaladeTargets.filter(t => t.target_type === 'service').map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: '1px solid #f59e0b40', borderRadius: 8, background: '#f59e0b08' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#18181b' }}>🏢 {t.service_label || t.service_code}</div>
                    <div style={{ fontSize: 11, color: '#71717a' }}>{t.service_code}</div>
                  </div>
                  <button onClick={() => removeTarget(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a1a1aa', fontSize: 16, padding: 0 }}>×</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TICKET PARAMS MANAGER
// ─────────────────────────────────────────────────────────────────────────────
function TicketParamsManager() {
  const [aiReformulation, setAiReformulation] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    axios.get('/api/tickets/config/public', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setAiReformulation(r.data.ai_reformulation_enabled !== false))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save(val: boolean) {
    setSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put('/api/tickets/admin/config/ai_reformulation_enabled', { value: String(val) }, { headers: { Authorization: `Bearer ${token}` } });
      setAiReformulation(val);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur'); }
    setSaving(false);
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  const toggle = (checked: boolean) => save(checked);

  return (
    <div>
      <h3 style={{ margin: '0 0 20px', fontSize: 16, fontWeight: 700 }}>Paramètres du module tickets</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#18181b', marginBottom: 2 }}>✨ Reformulation IA</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Affiche le bouton de reformulation IA dans la zone de commentaire</div>
          </div>
          <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: saving ? 'default' : 'pointer', flexShrink: 0 }}>
            <input type="checkbox" checked={aiReformulation} onChange={e => toggle(e.target.checked)} disabled={saving}
              style={{ opacity: 0, width: 0, height: 0 }} />
            <span style={{
              position: 'absolute', inset: 0, borderRadius: 24, transition: 'background 0.2s',
              background: aiReformulation ? '#6366f1' : '#cbd5e1',
            }}>
              <span style={{
                position: 'absolute', top: 3, left: aiReformulation ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
              }} />
            </span>
          </label>
        </div>

        {saved && <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600 }}>✓ Paramètre enregistré</div>}
      </div>
    </div>
  );
}
