import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../../components/Header';
import { ArrowLeft, Store as StoreIcon, MapPin, Users, Package, Trash2, Plus, Search } from 'lucide-react';
import { stocksApi, type Store, type StorageLocation, type Member, type Item, type MyRole } from './api';

const C = { indigo: '#6366f1', red: '#ef4444', slate: '#64748b', border: '#e2e8f0', text: '#1e293b', bg: '#f8fafc' };

type Tab = 'stores' | 'locations' | 'members' | 'items';

export default function StocksAdmin() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('stores');
  const [me, setMe] = useState<MyRole | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const loadStores = useCallback(async () => {
    const [mr, st] = await Promise.all([stocksApi.myRole(), stocksApi.listStores()]);
    setMe(mr);
    setStores(st);
    if (st.length && storeId == null) setStoreId(st[0].id);
  }, [storeId]);

  useEffect(() => { loadStores().catch(e => setMsg(e.message)); }, [loadStores]);

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'stores', label: 'Magasins', icon: <StoreIcon size={16} /> },
    { key: 'locations', label: 'Lieux', icon: <MapPin size={16} /> },
    { key: 'members', label: 'Membres', icon: <Users size={16} /> },
    { key: 'items', label: 'Catalogue', icon: <Package size={16} /> },
  ];

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <style>{`
        .sa-wrap { max-width: 1100px; margin: 0 auto; padding: 20px 16px; }
        .sa-card { background:#fff; border:1px solid ${C.border}; border-radius:14px; padding:18px; margin-bottom:16px; }
        .sa-table { width:100%; border-collapse:collapse; font-size:13px; }
        .sa-table th { text-align:left; padding:8px 10px; color:${C.slate}; font-size:11px; font-weight:600; border-bottom:2px solid ${C.border}; text-transform:uppercase; }
        .sa-table td { padding:8px 10px; border-bottom:1px solid #f1f5f9; }
        .sa-btn { padding:9px 14px; border:none; border-radius:10px; background:${C.indigo}; color:#fff; font-weight:600; cursor:pointer; font-size:13px; display:inline-flex; align-items:center; gap:6px; }
        .sa-btn-ghost { background:#fff; color:${C.slate}; border:1px solid ${C.border}; }
        .sa-input { padding:9px 11px; border:1px solid ${C.border}; border-radius:9px; font-size:13px; box-sizing:border-box; }
        .sa-tabs { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; }
        .sa-tab { padding:9px 14px; border:1px solid ${C.border}; background:#fff; border-radius:10px; cursor:pointer; font-size:13px; font-weight:600; color:${C.slate}; display:inline-flex; align-items:center; gap:6px; }
        .sa-tab.active { background:${C.indigo}; color:#fff; border-color:${C.indigo}; }
        .sa-iconbtn { background:none; border:none; cursor:pointer; color:${C.red}; }
        .sa-scroll { overflow-x:auto; }
        @media (max-width:600px){ .sa-wrap{padding:12px 10px;} .sa-card{padding:14px;} }
      `}</style>
      <Header />

      <div className="sa-wrap">
        <button onClick={() => navigate('/stocks')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <ArrowLeft size={16} /> Retour aux stocks
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: '0 0 16px' }}>Administration des stocks</h1>

        {msg && <div className="sa-card" style={{ color: C.red }}>{msg}</div>}

        <div className="sa-tabs">
          {TABS.map(t => (
            <button key={t.key} className={`sa-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.icon}{t.label}</button>
          ))}
        </div>

        {(tab === 'locations' || tab === 'members') && stores.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <select className="sa-input" value={storeId ?? ''} onChange={e => setStoreId(Number(e.target.value))}>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}

        {tab === 'stores' && <StoresTab isAdmin={!!me?.is_admin} stores={stores} reload={loadStores} />}
        {tab === 'locations' && storeId != null && <LocationsTab storeId={storeId} />}
        {tab === 'members' && storeId != null && <MembersTab storeId={storeId} />}
        {tab === 'items' && <ItemsTab />}
      </div>
    </div>
  );
}

// ─── Magasins ───────────────────────────────────────────────
function StoresTab({ isAdmin, stores, reload }: { isAdmin: boolean; stores: Store[]; reload: () => Promise<void> }) {
  const [form, setForm] = useState({ name: '', code: '', address: '' });
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    setErr(null);
    if (!form.name) { setErr('Nom requis'); return; }
    try { await stocksApi.createStore(form); setForm({ name: '', code: '', address: '' }); await reload(); }
    catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }
  async function remove(id: number) {
    if (!confirm('Supprimer ce magasin et tout son contenu ?')) return;
    try { await stocksApi.deleteStore(id); await reload(); } catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }

  return (
    <div className="sa-card">
      {err && <div style={{ color: C.red, marginBottom: 10, fontSize: 13 }}>{err}</div>}
      {isAdmin && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <input className="sa-input" placeholder="Nom du magasin *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
          <input className="sa-input" placeholder="Code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} style={{ flex: 1, minWidth: 90 }} />
          <input className="sa-input" placeholder="Adresse" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
          <button className="sa-btn" onClick={create}><Plus size={16} /> Ajouter</button>
        </div>
      )}
      {!isAdmin && <div style={{ fontSize: 12, color: C.slate, marginBottom: 12 }}>Seul un administrateur global peut créer/supprimer des magasins.</div>}
      <div className="sa-scroll">
        <table className="sa-table">
          <thead><tr><th>Nom</th><th>Code</th><th>Adresse</th><th>Mon rôle</th>{isAdmin && <th></th>}</tr></thead>
          <tbody>
            {stores.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td style={{ color: C.slate }}>{s.code || '—'}</td>
                <td style={{ color: C.slate }}>{s.address || '—'}</td>
                <td>{s.my_role || '—'}</td>
                {isAdmin && <td><button className="sa-iconbtn" onClick={() => remove(s.id)}><Trash2 size={16} /></button></td>}
              </tr>
            ))}
            {stores.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: C.slate, padding: 16 }}>Aucun magasin</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Lieux de stockage ──────────────────────────────────────
function LocationsTab({ storeId }: { storeId: number }) {
  const [list, setList] = useState<StorageLocation[]>([]);
  const [form, setForm] = useState({ name: '', code: '', description: '' });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => { stocksApi.listLocations(storeId).then(setList).catch(e => setErr(e.message)); }, [storeId]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setErr(null);
    if (!form.name) { setErr('Nom requis'); return; }
    try { await stocksApi.createLocation(storeId, form); setForm({ name: '', code: '', description: '' }); load(); }
    catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }
  async function remove(id: number) {
    if (!confirm('Supprimer cet emplacement ?')) return;
    try { await stocksApi.deleteLocation(storeId, id); load(); } catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }

  return (
    <div className="sa-card">
      {err && <div style={{ color: C.red, marginBottom: 10, fontSize: 13 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <input className="sa-input" placeholder="Nom de l'emplacement *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
        <input className="sa-input" placeholder="Code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} style={{ flex: 1, minWidth: 90 }} />
        <input className="sa-input" placeholder="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
        <button className="sa-btn" onClick={create}><Plus size={16} /> Ajouter</button>
      </div>
      <div className="sa-scroll">
        <table className="sa-table">
          <thead><tr><th>Nom</th><th>Code</th><th>Description</th><th></th></tr></thead>
          <tbody>
            {list.map(l => (
              <tr key={l.id}>
                <td style={{ fontWeight: 500 }}>{l.name}</td>
                <td style={{ color: C.slate }}>{l.code || '—'}</td>
                <td style={{ color: C.slate }}>{l.description || '—'}</td>
                <td><button className="sa-iconbtn" onClick={() => remove(l.id)}><Trash2 size={16} /></button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: C.slate, padding: 16 }}>Aucun emplacement</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Membres (recherche AD) ─────────────────────────────────
function MembersTab({ storeId }: { storeId: number }) {
  const [list, setList] = useState<Member[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [picked, setPicked] = useState<{ username: string; displayName?: string } | null>(null);
  const [role, setRole] = useState('viewer');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => { stocksApi.listMembers(storeId).then(setList).catch(e => setErr(e.message)); }, [storeId]);
  useEffect(() => { load(); }, [load]);

  async function search() {
    if (q.trim().length < 2) return;
    try {
      const { data } = await axios.get('/api/ad/search', { params: { q: q.trim() }, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setResults(data || []);
    } catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }
  async function add() {
    if (!picked) { setErr('Sélectionnez un utilisateur'); return; }
    setErr(null);
    try { await stocksApi.upsertMember(storeId, picked.username, role); setPicked(null); setQ(''); setResults([]); load(); }
    catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }
  async function remove(id: number) {
    try { await stocksApi.removeMember(storeId, id); load(); } catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }

  return (
    <div className="sa-card">
      {err && <div style={{ color: C.red, marginBottom: 10, fontSize: 13 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input className="sa-input" placeholder="Rechercher un agent (AD)…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} style={{ flex: 2, minWidth: 180 }} />
        <button className="sa-btn sa-btn-ghost" onClick={search}><Search size={16} /> Rechercher</button>
      </div>
      {results.length > 0 && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 180, overflowY: 'auto', marginBottom: 10 }}>
          {results.map((r, i) => (
            <div key={i} onClick={() => setPicked({ username: r.username, displayName: r.displayName })}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, background: picked?.username === r.username ? '#eef2ff' : '#fff', borderBottom: '1px solid #f1f5f9' }}>
              <strong>{r.displayName || r.username}</strong> <span style={{ color: C.slate }}>({r.username}){r.service ? ` — ${r.service}` : ''}</span>
            </div>
          ))}
        </div>
      )}
      {picked && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontSize: 13 }}>Ajouter <strong>{picked.displayName || picked.username}</strong> en :</span>
          <select className="sa-input" value={role} onChange={e => setRole(e.target.value)}>
            <option value="viewer">Viewer (lecture)</option>
            <option value="operator">Operator (mouvements)</option>
            <option value="manager">Manager (gestion)</option>
          </select>
          <button className="sa-btn" onClick={add}><Plus size={16} /> Affecter</button>
        </div>
      )}
      <div className="sa-scroll">
        <table className="sa-table">
          <thead><tr><th>Utilisateur</th><th>Rôle</th><th></th></tr></thead>
          <tbody>
            {list.map(m => (
              <tr key={m.id}>
                <td style={{ fontWeight: 500 }}>{m.username}</td>
                <td>{m.role}</td>
                <td><button className="sa-iconbtn" onClick={() => remove(m.id)}><Trash2 size={16} /></button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: C.slate, padding: 16 }}>Aucun membre</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Catalogue articles ─────────────────────────────────────
function ItemsTab() {
  const [list, setList] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ label: '', reference: '', category: '', brand: '', model: '', ean: '', tracking_mode: 'batch', unit: 'unité', min_threshold: '0' });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => { stocksApi.listItems({ search: search || undefined }).then(setList).catch(e => setErr(e.message)); }, [search]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setErr(null);
    if (!form.label) { setErr('Libellé requis'); return; }
    try {
      await stocksApi.createItem({ ...form, tracking_mode: form.tracking_mode as 'batch' | 'serial', min_threshold: Number(form.min_threshold) || 0 });
      setForm({ label: '', reference: '', category: '', brand: '', model: '', ean: '', tracking_mode: 'batch', unit: 'unité', min_threshold: '0' });
      load();
    } catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }
  async function remove(id: number) {
    if (!confirm('Supprimer cet article du catalogue ?')) return;
    try { await stocksApi.deleteItem(id); load(); } catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }

  return (
    <div className="sa-card">
      {err && <div style={{ color: C.red, marginBottom: 10, fontSize: 13 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 8, marginBottom: 10 }}>
        <input className="sa-input" placeholder="Libellé *" value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} />
        <input className="sa-input" placeholder="Référence" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} />
        <input className="sa-input" placeholder="Catégorie" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
        <input className="sa-input" placeholder="Marque" value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} />
        <input className="sa-input" placeholder="Modèle" value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
        <input className="sa-input" placeholder="EAN" value={form.ean} onChange={e => setForm({ ...form, ean: e.target.value })} />
        <select className="sa-input" value={form.tracking_mode} onChange={e => setForm({ ...form, tracking_mode: e.target.value })}>
          <option value="batch">Lot (batch)</option>
          <option value="serial">Unitaire (n° série)</option>
        </select>
        <input className="sa-input" placeholder="Unité" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} />
        <input className="sa-input" type="number" placeholder="Seuil min" value={form.min_threshold} onChange={e => setForm({ ...form, min_threshold: e.target.value })} />
      </div>
      <button className="sa-btn" onClick={create} style={{ marginBottom: 16 }}><Plus size={16} /> Ajouter l'article</button>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input className="sa-input" placeholder="Rechercher dans le catalogue…" value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 1 }} />
      </div>
      <div className="sa-scroll">
        <table className="sa-table">
          <thead><tr><th>Libellé</th><th>Réf.</th><th>Catégorie</th><th>Marque/Modèle</th><th>Suivi</th><th></th></tr></thead>
          <tbody>
            {list.map(i => (
              <tr key={i.id}>
                <td style={{ fontWeight: 500 }}>{i.label}</td>
                <td style={{ color: C.slate }}>{i.reference || '—'}</td>
                <td style={{ color: C.slate }}>{i.category || '—'}</td>
                <td style={{ color: C.slate }}>{[i.brand, i.model].filter(Boolean).join(' ') || '—'}</td>
                <td>{i.tracking_mode === 'serial' ? 'Unitaire' : 'Lot'}</td>
                <td><button className="sa-iconbtn" onClick={() => remove(i.id)}><Trash2 size={16} /></button></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: C.slate, padding: 16 }}>Aucun article</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
