import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { CheckCircle, AlertTriangle, Loader2, RefreshCw, Save, Plug } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

type Cfg = { source: 'internal' | 'api'; api_url: string; api_key: string; api_key_set: boolean; api_key_hint: string; timeout_ms: number };
type Test = { internal: { ok: boolean; message: string } | null; api: { ok: boolean; message: string } | null };
type Compare = { exercice: number; compare_at: string; datasets: Record<string, any> };

const s: Record<string, React.CSSProperties> = {
    card: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 18 },
    label: { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 5 },
    input: { width: '100%', boxSizing: 'border-box', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 7, fontSize: 13, color: '#0f172a', background: '#fff' },
    btn: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' },
    ghost: { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 7, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' },
    th: { textAlign: 'left', padding: '8px 10px', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' },
    td: { padding: '8px 10px', fontSize: 12.5, borderBottom: '1px solid #f1f5f9', color: '#334155' },
};

const fmt = (v: any) => typeof v === 'number' ? v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : (v ?? '—');

export default function SeditSourceConfig() {
    const { token } = useAuth();
    const headers = { Authorization: `Bearer ${token}` };
    const [cfg, setCfg] = useState<Cfg>({ source: 'internal', api_url: '', api_key: '', api_key_set: false, api_key_hint: '', timeout_ms: 30000 });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [comparing, setComparing] = useState(false);
    const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
    const [test, setTest] = useState<Test | null>(null);
    const [compare, setCompare] = useState<Compare | null>(null);
    const [year, setYear] = useState(new Date().getFullYear());

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await axios.get('/api/finance/sedit-source', { headers });
            setCfg(c => ({ ...c, ...r.data, api_key: '' }));
        } catch (e: any) {
            setMsg({ ok: false, text: e.response?.data?.message || 'Chargement impossible.' });
        } finally { setLoading(false); }
    }, [token]);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        setSaving(true); setMsg(null);
        try {
            const payload: any = { source: cfg.source, api_url: cfg.api_url, timeout_ms: cfg.timeout_ms };
            if (cfg.api_key.trim()) payload.api_key = cfg.api_key.trim();
            const r = await axios.put('/api/finance/sedit-source', payload, { headers });
            setCfg(c => ({ ...c, ...r.data, api_key: '' }));
            setMsg({ ok: true, text: 'Paramétrage enregistré.' });
        } catch (e: any) {
            setMsg({ ok: false, text: e.response?.data?.message || 'Enregistrement impossible.' });
        } finally { setSaving(false); }
    };

    const runTest = async () => {
        setTesting(true); setTest(null); setMsg(null);
        try {
            const r = await axios.post('/api/finance/sedit-source/test', {}, { headers });
            setTest(r.data);
        } catch (e: any) {
            setMsg({ ok: false, text: e.response?.data?.message || 'Test impossible.' });
        } finally { setTesting(false); }
    };

    const runCompare = async () => {
        setComparing(true); setCompare(null); setMsg(null);
        try {
            const r = await axios.get('/api/finance/sedit-source/compare', { headers, params: { exercice: year } });
            setCompare(r.data);
        } catch (e: any) {
            setMsg({ ok: false, text: e.response?.data?.message || 'Comparaison impossible.' });
        } finally { setComparing(false); }
    };

    if (loading) return <div style={s.card}><Loader2 size={18} className="spin" /> Chargement…</div>;

    const ok = (v: any) => v?.ok;
    const datasets = compare?.datasets || {};

    return (
        <div>
            <div style={s.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
                    <Plug size={18} color="#2563eb" /> Source de lecture Sedit Finances
                </div>
                <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b' }}>
                    Bascule entre l’accès Oracle direct historique et l’API Sedit. Le réglage est immédiat, sans redémarrage.
                </p>

                <div style={{ display: 'grid', gap: 12 }}>
                    <div>
                        <label style={s.label}>Source utilisée</label>
                        <select style={s.input} value={cfg.source} onChange={e => setCfg(c => ({ ...c, source: e.target.value as Cfg['source'] }))}>
                            <option value="internal">Interne — Oracle direct (historique)</option>
                            <option value="api">API Sedit Finances</option>
                        </select>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                        <div>
                            <label style={s.label}>URL de l’API</label>
                            <input style={s.input} value={cfg.api_url} onChange={e => setCfg(c => ({ ...c, api_url: e.target.value }))} placeholder="http://10.103.130.106:3420" />
                        </div>
                        <div>
                            <label style={s.label}>Timeout (ms)</label>
                            <input style={s.input} type="number" min={1000} max={120000} value={cfg.timeout_ms} onChange={e => setCfg(c => ({ ...c, timeout_ms: Number(e.target.value) }))} />
                        </div>
                    </div>
                    <div>
                        <label style={s.label}>Clé API {cfg.api_key_set ? `(configurée : ${cfg.api_key_hint})` : '(non configurée)'}</label>
                        <input style={s.input} type="password" value={cfg.api_key} onChange={e => setCfg(c => ({ ...c, api_key: e.target.value }))} placeholder={cfg.api_key_set ? 'Laisser vide pour conserver la clé actuelle' : 'sgf_live_...'} autoComplete="new-password" />
                    </div>
                </div>

                {msg && (
                    <div style={{ marginTop: 12, display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5, fontWeight: 600, color: msg.ok ? '#166534' : '#991b1b' }}>
                        {msg.ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />} {msg.text}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                    <button style={s.btn} disabled={saving} onClick={save}>{saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />} Enregistrer</button>
                    <button style={s.ghost} disabled={testing} onClick={runTest}>{testing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Tester les deux sources</button>
                </div>

                {test && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 14 }}>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, fontSize: 12.5 }}>
                            <strong>Oracle direct</strong><div style={{ color: ok(test.internal) ? '#166534' : '#991b1b', marginTop: 4 }}>{test.internal?.message}</div>
                        </div>
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, fontSize: 12.5 }}>
                            <strong>API Sedit</strong><div style={{ color: ok(test.api) ? '#166534' : '#991b1b', marginTop: 4 }}>{test.api?.message}</div>
                        </div>
                    </div>
                )}
            </div>

            <div style={s.card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
                    <RefreshCw size={18} color="#2563eb" /> Comparaison Oracle direct / API
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 13, color: '#64748b' }}>
                    Compare les volumes et les montants pour l’exercice choisi. À lancer hors heures de pointe : les deux sources sont interrogées en entier.
                </p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ width: 140 }}>
                        <label style={s.label}>Exercice</label>
                        <input style={s.input} type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
                    </div>
                    <button style={s.btn} disabled={comparing} onClick={runCompare}>{comparing ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Comparer</button>
                </div>

                {compare && (
                    <div style={{ overflowX: 'auto', marginTop: 14 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr><th style={s.th}>Jeu</th><th style={s.th}>Interne</th><th style={s.th}>API</th><th style={s.th}>Écart</th></tr></thead>
                            <tbody>
                                {Object.entries(datasets).map(([name, d]: any) => {
                                    if (d.error) return <tr key={name}><td style={s.td}>{name}</td><td style={s.td} colSpan={3}><span style={{ color: '#991b1b' }}>{d.error}</span></td></tr>;
                                    const keys = Object.keys(d.internal || {}).filter(k => k !== 'count');
                                    return (
                                        <tr key={name}>
                                            <td style={{ ...s.td, fontWeight: 700 }}>{name}</td>
                                            <td style={s.td}>{d.internal?.count} enregistrement(s){keys.map(k => <div key={k}>{k} : {fmt(d.internal?.[k])}</div>)}</td>
                                            <td style={s.td}>{d.api?.count} enregistrement(s){keys.map(k => <div key={k}>{k} : {fmt(d.api?.[k])}</div>)}</td>
                                            <td style={s.td}>{keys.map(k => <div key={k}>{fmt((d.api?.[k] || 0) - (d.internal?.[k] || 0))}</div>)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {datasets.lignes?.note && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 8 }}>{datasets.lignes.note}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}
