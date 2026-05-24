import React, { useState, useEffect } from 'react';
import axios from 'axios';

type Tab = 'categories' | 'tags' | 'groups' | 'sla' | 'rules' | 'templates' | 'triggers' | 'technicians' | 'roles';

const btn = (active: boolean): React.CSSProperties => ({
  padding: '8px 16px', border: 'none', borderRadius: 8, cursor: 'pointer',
  fontSize: 13, fontWeight: 500,
  background: active ? '#6366f1' : '#f1f5f9',
  color: active ? '#fff' : '#475569',
});

export default function TicketAdmin() {
  const [tab, setTab] = useState<Tab>('categories');
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [slas, setSlas] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [triggers, setTriggers] = useState<any[]>([]);
  const [technicians, setTechnicians] = useState<any[]>([]);

  useEffect(() => {
    switch (tab) {
      case 'categories': loadData('/api/tickets/admin/categories', setCategories); break;
      case 'tags':       loadData('/api/tickets/admin/tags', setTags); break;
      case 'groups':     loadData('/api/tickets/admin/groups', setGroups); break;
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
    { key: 'tags',        label: 'Tags' },
    { key: 'groups',      label: 'Groupes' },
    { key: 'sla',         label: 'SLA' },
    { key: 'rules',       label: 'Règles' },
    { key: 'templates',   label: 'Templates' },
    { key: 'triggers',    label: 'Déclencheurs' },
    { key: 'technicians', label: 'Équipe' },
    { key: 'roles',       label: '🔐 Rôles' },
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
        {tab === 'tags'        && <TagManager data={tags} onUpdate={() => loadData('/api/tickets/admin/tags', setTags)} />}
        {tab === 'groups'      && <GroupManager data={groups} onUpdate={() => loadData('/api/tickets/admin/groups', setGroups)} />}
        {tab === 'sla'         && <SLAManager data={slas} onUpdate={() => loadData('/api/tickets/admin/sla', setSlas)} />}
        {tab === 'rules'       && <RuleManager data={rules} onUpdate={() => loadData('/api/tickets/admin/assignment-rules', setRules)} />}
        {tab === 'templates'   && <TemplateManager data={templates} />}
        {tab === 'triggers'    && <TriggerManager data={triggers} />}
        {tab === 'technicians' && <TeamManager data={technicians} onUpdate={() => loadData('/api/tickets/admin/technicians', setTechnicians)} />}
        {tab === 'roles'       && <RolePermissionsManager />}
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
// TAG MANAGER
// ─────────────────────────────────────────────────────────────────────────────
function TagManager({ data, onUpdate }: { data: any[], onUpdate: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#6366f1');

  async function add() {
    if (!name.trim()) return;
    const token = localStorage.getItem('token');
    await axios.post('/api/tickets/admin/tags', { name, color }, { headers: { Authorization: `Bearer ${token}` } });
    setName('');
    onUpdate();
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Tags</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du tag"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
        <input type="color" value={color} onChange={e => setColor(e.target.value)}
          style={{ width: 40, padding: 4, border: '1px solid #e2e8f0', borderRadius: 6 }} />
        <button onClick={add} style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Ajouter</button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {data.map(t => (
          <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: t.color + '20', color: t.color, fontSize: 13, fontWeight: 500 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.color }} />
            {t.name}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP MANAGER
// ─────────────────────────────────────────────────────────────────────────────
function GroupManager({ data, onUpdate }: { data: any[], onUpdate: () => void }) {
  const [name, setName] = useState('');

  async function add() {
    if (!name.trim()) return;
    const token = localStorage.getItem('token');
    await axios.post('/api/tickets/admin/groups', { name }, { headers: { Authorization: `Bearer ${token}` } });
    setName('');
    onUpdate();
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Groupes de l'équipe</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nom du groupe"
          style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }} />
        <button onClick={add} style={{ padding: '8px 16px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Créer</button>
      </div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
        {data.map(g => (
          <div key={g.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>{g.name}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>
              {(g.members || []).map((m: any) => (
                <div key={m.id} style={{ padding: '2px 0' }}>• {m.displayName || `User #${m.user_id}`}</div>
              ))}
              {(!g.members || g.members.length === 0) && <span style={{ fontStyle: 'italic' }}>Aucun membre</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA MANAGER
// ─────────────────────────────────────────────────────────────────────────────
function SLAManager({ data }: { data: any[], onUpdate: () => void }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Définitions SLA</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
            <th style={{ padding: 10, textAlign: 'left' }}>Nom</th>
            <th style={{ padding: 10, textAlign: 'center' }}>Priorité</th>
            <th style={{ padding: 10, textAlign: 'center' }}>1ère réponse</th>
            <th style={{ padding: 10, textAlign: 'center' }}>Résolution</th>
            <th style={{ padding: 10, textAlign: 'center' }}>Actif</th>
          </tr>
        </thead>
        <tbody>
          {data.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: 10, fontWeight: 500 }}>{s.name}</td>
              <td style={{ padding: 10, textAlign: 'center' }}>{s.priority || '—'}</td>
              <td style={{ padding: 10, textAlign: 'center' }}>{s.first_response_min ? `${s.first_response_min} min` : '—'}</td>
              <td style={{ padding: 10, textAlign: 'center' }}>{s.resolution_min ? `${(s.resolution_min / 60).toFixed(1)}h` : '—'}</td>
              <td style={{ padding: 10, textAlign: 'center' }}>
                <span style={{ color: s.is_active ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{s.is_active ? 'Oui' : 'Non'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
function TemplateManager({ data }: { data: any[] }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 16px 0', fontSize: 16 }}>Templates de notification</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        {data.map(t => (
          <div key={t.id} style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{t.label}</div>
            <div style={{ fontSize: 12, color: '#64748b', fontFamily: 'monospace' }}>{t.slug}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{t.subject}</div>
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
