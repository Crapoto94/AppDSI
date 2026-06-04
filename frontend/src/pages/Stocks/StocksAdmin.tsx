import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../../components/Header';
import { ArrowLeft, Store as StoreIcon, MapPin, Users, Package, Trash2, Plus, Search, FileText, Upload, Star, Code, X } from 'lucide-react';
import { stocksApi, type Store, type StorageLocation, type Member, type MyRole, type BlTemplate } from './api';
import BlTemplateDesigner from './BlTemplateDesigner';

const C = { indigo: '#6366f1', red: '#ef4444', green: '#22c55e', slate: '#64748b', border: '#e2e8f0', text: '#1e293b', bg: '#f8fafc' };

type Tab = 'stores' | 'locations' | 'members' | 'bl';

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
    { key: 'bl', label: 'Modèles BL', icon: <FileText size={16} /> },
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
        {tab === 'bl' && <BlTemplatesTab />}
      </div>
    </div>
  );
}

// Modèles de Bon de Livraison
function BlTemplatesTab() {
  const [list, setList] = useState<BlTemplate[]>([]);
  const [name, setName] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<BlTemplate | null>(null);
  const [designing, setDesigning] = useState<BlTemplate | null>(null);

  const load = useCallback(() => { stocksApi.listBlTemplates().then(setList).catch(e => setErr(e.message)); }, []);
  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    setBusy(true); setErr(null);
    try { await stocksApi.createBlTemplate({ name: name.trim(), is_default: list.length === 0 }); setName(''); load(); }
    catch (e: any) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }
  async function setDefault(t: BlTemplate) {
    try { await stocksApi.updateBlTemplate(t.id, { is_default: true }); load(); }
    catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }
  async function rename(t: BlTemplate) {
    const n = prompt('Nouveau nom du modèle', t.name);
    if (n && n.trim() && n !== t.name) {
      try { await stocksApi.updateBlTemplate(t.id, { name: n.trim() }); load(); }
      catch (e: any) { setErr(e.response?.data?.message || e.message); }
    }
  }
  async function remove(t: BlTemplate) {
    if (!confirm(`Supprimer le modèle « ${t.name} » ?`)) return;
    try { await stocksApi.deleteBlTemplate(t.id); load(); }
    catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }
  async function uploadBase(t: BlTemplate, file: File) {
    setBusy(true); setErr(null);
    try { await stocksApi.uploadBlTemplateBase(t.id, file); load(); }
    catch (e: any) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }
  async function setCategory(t: BlTemplate, category: string) {
    try { await stocksApi.updateBlTemplate(t.id, { category: category as any }); load(); }
    catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }

  const CAT_LABEL: Record<string, string> = { bl: 'Bon de livraison', remise: 'Fiche de remise', retour: 'Fiche de retour' };

  return (
    <div className="sa-card">
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Modèles de documents (partagés)</div>
      <div style={{ fontSize: 12, color: C.slate, marginBottom: 14 }}>
        Chaque modèle s'appuie sur un PDF de fond (en-tête, mentions) sur lequel les champs sont imprimés.
        La <b>catégorie</b> détermine où le modèle est proposé : <i>bon de livraison</i> (sorties stock),
        <i> fiche de remise</i> / <i>fiche de retour</i> (parc mobilité — téléphones &amp; tablettes).
        Le bouton <b>Champs</b> permet de positionner les variables.
      </div>
      {err && <div style={{ color: C.red, marginBottom: 10, fontSize: 13 }}>{err}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input className="sa-input" placeholder="Nom du nouveau modèle…" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1 }} onKeyDown={e => e.key === 'Enter' && create()} />
        <button className="sa-btn" onClick={create} disabled={busy || !name.trim()}><Plus size={15} /> Créer</button>
      </div>

      <div className="sa-scroll">
        <table className="sa-table">
          <thead>
            <tr><th>Nom</th><th>Catégorie</th><th>PDF de fond</th><th>Défaut</th><th style={{ width: 280 }}>Actions</th></tr>
          </thead>
          <tbody>
            {list.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 600 }}>{t.name}</td>
                <td>
                  <select className="sa-input" style={{ padding: '4px 8px', fontSize: 12 }} value={t.category || 'bl'} onChange={e => setCategory(t, e.target.value)}>
                    {Object.entries(CAT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </td>
                <td>{t.base_document_id
                  ? <span style={{ color: C.green, fontSize: 12 }}>✓ chargé</span>
                  : <span style={{ color: C.slate, fontSize: 12 }}>aucun</span>}</td>
                <td>{t.is_default
                  ? <span style={{ color: C.indigo, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}><Star size={13} fill={C.indigo} /> défaut</span>
                  : <button className="sa-btn sa-btn-ghost" style={{ padding: '4px 8px' }} onClick={() => setDefault(t)}>définir</button>}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <label className="sa-btn sa-btn-ghost" style={{ padding: '5px 9px', cursor: 'pointer' }}>
                      <Upload size={14} /> PDF
                      <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) uploadBase(t, f); e.currentTarget.value = ''; }} />
                    </label>
                    <button className="sa-btn sa-btn-ghost" style={{ padding: '5px 9px' }} onClick={() => setDesigning(t)} title="Placer les variables graphiquement"><Code size={14} /> Champs</button>
                    <button className="sa-btn sa-btn-ghost" style={{ padding: '5px 9px' }} onClick={() => setEditing(t)} title="Éditeur JSON avancé">JSON</button>
                    <button className="sa-btn sa-btn-ghost" style={{ padding: '5px 9px' }} onClick={() => rename(t)}>Renommer</button>
                    <button className="sa-iconbtn" onClick={() => remove(t)} title="Supprimer"><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={5} style={{ color: C.slate, textAlign: 'center', padding: 16 }}>Aucun modèle. Créez-en un puis chargez son PDF de fond.</td></tr>}
          </tbody>
        </table>
      </div>

      {editing && <FieldsEditor template={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {designing && <BlTemplateDesigner template={designing} onClose={() => setDesigning(null)} onSaved={() => { setDesigning(null); load(); }} />}
    </div>
  );
}

// Liste des variables disponibles pour les gabarits (aide à la saisie des champs).
const TEMPLATE_VARIABLES: { group: string; vars: string[] }[] = [
  { group: 'Fiche', vars: ['{fiche.numero}', '{date}', '{date.remise}', '{date.retour}', '{store.name}', '{etat}', '{etat.retour}', '{motif.retour}'] },
  { group: 'Agent', vars: ['{agent.nom}', '{agent.service}', '{agent.direction}', '{agent.email}'] },
  { group: 'Matériel', vars: ['{designation}', '{imei}', '{numero_serie}', '{numero_ligne}', '{chargeur}', '{cable}'] },
  { group: 'BL', vars: ['{bl.numero}', '{beneficiary.name}', '{beneficiary.email}', '{preparer.name}', '{delivered_by}'] },
  { group: 'Lignes (répétées)', vars: ['{ligne.designation}', '{ligne.modele}', '{ligne.imei}', '{ligne.serial}', '{ligne.numero_ligne}', '{ligne.quantite}'] },
  { group: 'Signatures (type)', vars: ['signature_preparer', 'signature_recipient'] },
];

function FieldsEditor({ template, onClose, onSaved }: { template: BlTemplate; onClose: () => void; onSaved: () => void }) {
  const [json, setJson] = useState(() => JSON.stringify(template.fields || [], null, 2));
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch (e: any) { setErr('JSON invalide : ' + e.message); return; }
    if (!Array.isArray(parsed)) { setErr('La racine doit être un tableau de champs.'); return; }
    setBusy(true); setErr(null);
    try { await stocksApi.updateBlTemplate(template.id, { fields: parsed as any }); onSaved(); }
    catch (e: any) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(900px,96vw)', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: '#fff' }}>
          <div style={{ fontWeight: 700 }}>Champs du modèle — {template.name}</div>
          <button className="sa-iconbtn" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: 18, display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>
              Tableau JSON de champs. Chaque champ : <code>{'{ type, page, x, y, font_size, bold, align, width, row_height, variable }'}</code>.
              Origine (0,0) en haut-gauche, en points (A4 ≈ 595×842). <code>type</code> : <code>text</code>, <code>signature_preparer</code> ou <code>signature_recipient</code>.
            </div>
            <textarea value={json} onChange={e => setJson(e.target.value)} spellCheck={false}
              style={{ width: '100%', minHeight: 360, fontFamily: 'monospace', fontSize: 12, padding: 10, border: `1px solid ${C.border}`, borderRadius: 8, boxSizing: 'border-box' }} />
            {err && <div style={{ color: C.red, fontSize: 13, marginTop: 8 }}>{err}</div>}
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button className="sa-btn" onClick={save} disabled={busy}>Enregistrer les champs</button>
              <button className="sa-btn sa-btn-ghost" onClick={onClose}>Annuler</button>
            </div>
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Variables disponibles</div>
            {TEMPLATE_VARIABLES.map(g => (
              <div key={g.group} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: C.slate, textTransform: 'uppercase', marginBottom: 3 }}>{g.group}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {g.vars.map(v => (
                    <code key={v} title="Cliquer pour copier" onClick={() => navigator.clipboard?.writeText(v)}
                      style={{ fontSize: 11, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '2px 5px', cursor: 'pointer' }}>{v}</code>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Magasins
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

// Lieux de stockage
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

// Membres
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
