import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Server, RefreshCw, PlugZap, Save, CheckCircle2, XCircle, Network, Globe } from 'lucide-react';

interface InfraApi {
  key: string;
  label?: string | null;
  base_url?: string | null;
  endpoint?: string | null;
  api_key?: string | null;       // masquée côté serveur
  api_key_set?: boolean;
  header_name?: string | null;
  enabled?: boolean;
  last_sync_at?: string | null;
  last_sync_status?: string | null;
  last_sync_count?: number | null;
}

function ApiCard({ api, token, onSaved }: { api: InfraApi; token: string | null; onSaved: (a: InfraApi) => void }) {
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [form, setForm] = useState<InfraApi>({ ...api });
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState<'' | 'save' | 'test' | 'sync'>('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => { setForm({ ...api }); setKeyInput(''); }, [api]);

  async function save() {
    setBusy('save'); setMsg(null);
    try {
      const payload: Record<string, unknown> = {
        label: form.label, base_url: form.base_url, endpoint: form.endpoint,
        header_name: form.header_name, enabled: form.enabled,
      };
      if (keyInput.trim()) payload.api_key = keyInput.trim();
      const res = await axios.put(`/api/infra/apis/${form.key}`, payload, { headers });
      setForm({ ...res.data }); setKeyInput('');
      onSaved(res.data);
      setMsg({ type: 'ok', text: 'Configuration enregistrée.' });
    } catch (e: unknown) {
      setMsg({ type: 'err', text: (e as any)?.response?.data?.message || "Erreur d'enregistrement." });
    } finally { setBusy(''); }
  }

  async function test() {
    setBusy('test'); setMsg(null);
    try {
      const res = await axios.post(`/api/infra/apis/${form.key}/test`, {}, { headers });
      setMsg({ type: 'ok', text: `Connexion OK — ${res.data.count} résultat(s) reçu(s) de l'API.` });
    } catch (e: unknown) {
      setMsg({ type: 'err', text: (e as any)?.response?.data?.message || 'Échec du test de connexion.' });
    } finally { setBusy(''); }
  }

  async function sync() {
    if (!confirm("Synchroniser le réseau ?\n\nCela EFFACE toutes les données réseau actuelles (liens, switchs, VLANs, IRF, liaisons FO) et les remplace par les données de l'API.")) return;
    setBusy('sync'); setMsg(null);
    try {
      const res = await axios.post('/api/infra/sync/reseau', {}, { headers });
      setMsg({ type: 'ok', text: `Synchronisation réussie — ${res.data.switches} switchs, ${res.data.links} liens importés.` });
    } catch (e: unknown) {
      setMsg({ type: 'err', text: (e as any)?.response?.data?.message || 'Échec de la synchronisation.' });
    } finally { setBusy(''); }
  }

  const Icon = form.key === 'reseau_links' ? Network : Globe;

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h3 style={{ ...cardTitle, margin: 0 }}><Icon size={16} /> {form.label || form.key}</h3>
        <label style={chk}>
          <input type="checkbox" checked={!!form.enabled} onChange={e => setForm({ ...form, enabled: e.target.checked })} /> Activée
        </label>
      </div>

      {msg && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 14,
          background: msg.type === 'ok' ? '#f0fdf4' : '#fef2f2',
          color: msg.type === 'ok' ? '#15803d' : '#991b1b',
          border: `1px solid ${msg.type === 'ok' ? '#bbf7d0' : '#fecaca'}`,
        }}>
          {msg.type === 'ok' ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {msg.text}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={lbl}>URL de base</label>
          <input style={inp} value={form.base_url || ''} onChange={e => setForm({ ...form, base_url: e.target.value })} placeholder="https://exemple.ivry.local/api" />
        </div>
        <div>
          <label style={lbl}>Endpoint</label>
          <input style={inp} value={form.endpoint || ''} onChange={e => setForm({ ...form, endpoint: e.target.value })} placeholder="/agents/presence" />
        </div>
        <div>
          <label style={lbl}>Nom du header</label>
          <input style={inp} value={form.header_name || ''} onChange={e => setForm({ ...form, header_name: e.target.value })} placeholder="x-api-key" />
        </div>
        <div>
          <label style={lbl}>Clé API {form.api_key_set && <span style={{ color: '#94a3b8', fontWeight: 400 }}>(définie : {form.api_key})</span>}</label>
          <input style={inp} type="password" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder={form.api_key_set ? 'Laisser vide pour conserver' : 'Saisir la clé'} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={!!busy} style={btnPrimary}>
          <Save size={15} /> {busy === 'save' ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button onClick={test} disabled={!!busy} style={btnSecondary}>
          <PlugZap size={15} /> {busy === 'test' ? 'Test…' : 'Tester'}
        </button>
        {form.key === 'reseau_links' && (
          <button onClick={sync} disabled={!!busy} style={btnDanger}>
            <RefreshCw size={15} className={busy === 'sync' ? 'spin' : ''} /> {busy === 'sync' ? 'Synchronisation…' : 'Synchroniser maintenant'}
          </button>
        )}
      </div>

      {(form.last_sync_at || form.last_sync_status) && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f1f5f9', fontSize: 13, color: '#64748b' }}>
          Dernière synchro : <strong>{form.last_sync_at ? new Date(form.last_sync_at).toLocaleString('fr-FR') : '—'}</strong>
          {form.last_sync_count != null && <> · {form.last_sync_count} liens</>}
          {form.last_sync_status && <> · <span style={{ color: /ERREUR/i.test(form.last_sync_status) ? '#dc2626' : '#16a34a' }}>{form.last_sync_status}</span></>}
        </div>
      )}
    </div>
  );
}

export default function AdminInfra() {
  const token = localStorage.getItem('token');
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [apis, setApis] = useState<InfraApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  async function load() {
    setLoading(true);
    try {
      const res = await axios.get('/api/infra/apis', { headers });
      setApis(res.data || []);
    } catch {
      setLoadErr("Impossible de charger les définitions d'API.");
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line

  function handleSaved(updated: InfraApi) {
    setApis(prev => prev.map(a => a.key === updated.key ? updated : a));
  }

  if (loading) return <div style={{ color: '#94a3b8', padding: 20 }}>Chargement…</div>;

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Server size={24} color="#3b82f6" />
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0f172a' }}>API externes</h1>
      </div>
      <p style={{ margin: '0 0 20px', color: '#64748b', fontSize: 14 }}>
        Définitions des API externes (URL, clé, header) et synchronisations d'infrastructure.
      </p>

      {loadErr && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, marginBottom: 16,
          background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca',
        }}>
          <XCircle size={16} /> {loadErr}
        </div>
      )}

      {apis.length === 0 && !loadErr && (
        <div style={{ color: '#94a3b8' }}>Aucune définition d'API trouvée.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {apis.map(api => (
          <ApiCard key={api.key} api={api} token={token} onSaved={handleSaved} />
        ))}
      </div>

      <p style={{ marginTop: 14, fontSize: 12, color: '#94a3b8' }}>
        Une synchronisation automatique du réseau est aussi exécutée chaque jour à 04h30.
      </p>

      <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} } .spin { animation: spin 1s linear infinite; }`}</style>
    </div>
  );
}

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e9eef5', borderRadius: 14, padding: 20, boxShadow: '0 1px 3px rgba(15,23,42,.04)' };
const cardTitle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: '#0f172a' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em', margin: '0 0 4px' };
const inp: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1.5px solid #e2e8f0', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', outline: 'none', background: '#f8fafc' };
const chk: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#475569', cursor: 'pointer' };
const btnBase: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer' };
const btnPrimary: React.CSSProperties = { ...btnBase, background: 'linear-gradient(135deg, #2563eb, #4f46e5)', color: '#fff' };
const btnSecondary: React.CSSProperties = { ...btnBase, background: '#fff', color: '#334155', border: '1.5px solid #e2e8f0' };
const btnDanger: React.CSSProperties = { ...btnBase, background: '#fff', color: '#b91c1c', border: '1.5px solid #fecaca' };
