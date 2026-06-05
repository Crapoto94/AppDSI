// ─── Parc : Lignes mobiles (forfaits / SIM) ───────────────────────────────────
// Importées depuis lignes.xlsx (export opérateur). L'import REMPLACE toute la
// table et force l'opérateur à « SFR ». Vue branchée dans l'onglet « Lignes mobiles ».
import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { Search, X, RefreshCw, Upload, Signal, Filter, GitCompare, AlertTriangle, Smartphone, ArrowRight } from 'lucide-react';

const C = { blue: '#2563eb', slate: '#64748b', green: '#059669', amber: '#d97706', red: '#dc2626', card: '#fff', border: '#e2e8f0', text: '#0f172a', bg: '#f8fafc' };

interface Ligne {
  id: number;
  numero_ligne: string | null;
  operateur: string | null;
  nom: string | null;
  prenom: string | null;
  email: string | null;
  raison_sociale: string | null;
  numero_contrat: string | null;
  statut_ligne: string | null;
  date_mise_en_service: string | null;
  date_fin_engagement: string | null;
  forfait: string | null;
  terminal: string | null;
  imei: string | null;
  format_sim: string | null;
  type_offre: string | null;
}

const RECO_LABELS: Record<string, string> = {
  ligne_sans_appareil: 'Ligne sans appareil',
  appareil_sans_ligne: 'Appareil sans ligne',
  imei_divergent: 'IMEI divergent',
  numero_divergent: 'N° de ligne divergent',
  ligne_active_appareil_non_attribue: 'Ligne active / appareil non attribué',
  ligne_coupee_appareil_attribue: 'Ligne coupée / appareil attribué',
  titulaire_divergent: 'Titulaire divergent',
  forfait_divergent: 'Forfait divergent',
};

interface RecoItem {
  type: string; severity: 'high' | 'medium' | 'low'; titre: string; action: string;
  numero_ligne: string | null; imei: string | null;
  sfr: any | null; device: any | null;
}
interface RecoData {
  summary: { total_lignes: number; total_appareils: number; appareils_rapproches: number; total_desalignements: number; par_type: Record<string, number>; par_gravite: { high: number; medium: number; low: number } };
  items: RecoItem[];
}

export default function LignesMobilesView({ token }: { token: string }) {
  const [view, setView] = useState<'lignes' | 'reco'>('lignes');
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<{ total: number; par_statut: { statut: string; n: number }[]; last_import: string | null } | null>(null);
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const h = { Authorization: `Bearer ${token}` };

  // ── Rapprochement (réconciliation lignes SFR ↔ appareils) ──
  const [reco, setReco] = useState<RecoData | null>(null);
  const [recoLoading, setRecoLoading] = useState(false);
  const [recoType, setRecoType] = useState('');
  const [recoSeverity, setRecoSeverity] = useState('');

  const loadReco = useCallback(async () => {
    setRecoLoading(true);
    try {
      const r = await axios.get('/api/lignes-mobiles/reconciliation', { headers: h });
      setReco(r.data);
    } catch { setReco(null); }
    finally { setRecoLoading(false); }
  }, [token]);

  useEffect(() => { if (view === 'reco' && !reco) loadReco(); }, [view, reco, loadReco]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (q.trim()) params.q = q.trim();
      if (statut) params.statut = statut;
      const [lst, kp] = await Promise.all([
        axios.get('/api/lignes-mobiles', { headers: h, params }),
        axios.get('/api/lignes-mobiles/kpis', { headers: h }),
      ]);
      setLignes(Array.isArray(lst.data) ? lst.data : []);
      setKpis(kp.data);
    } catch { setLignes([]); }
    finally { setLoading(false); }
  }, [q, statut, token]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const onImport = async (file: File) => {
    if (!window.confirm(`Importer « ${file.name} » ? Cela remplacera l'intégralité des lignes mobiles (opérateur forcé à SFR).`)) return;
    setImporting(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await axios.post('/api/lignes-mobiles/import', fd, { headers: { ...h, 'Content-Type': 'multipart/form-data' } });
      alert(`Import réussi : ${r.data.imported} ligne(s) (opérateur ${r.data.operateur}).`);
      load();
    } catch (e: any) {
      alert(e.response?.data?.message || "Erreur lors de l'import");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString('fr-FR') : '—';
  const statutColor = (s: string | null) => {
    const v = (s || '').toLowerCase();
    if (v.includes('actif')) return { bg: '#dcfce7', c: '#15803d' };
    if (v.includes('cours')) return { bg: '#fef9c3', c: '#92400e' };
    if (v.includes('résili') || v.includes('resili') || v.includes('suspend')) return { bg: '#fee2e2', c: '#b91c1c' };
    return { bg: '#f1f5f9', c: '#475569' };
  };

  const th: React.CSSProperties = { padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', borderBottom: '1px solid ' + C.border, whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '8px 12px', fontSize: 13, color: C.text, borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' };

  return (
    <div>
      {/* Sélecteur de vue */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {([['lignes', 'Lignes mobiles', Signal], ['reco', 'Rapprochement appareils', GitCompare]] as [typeof view, string, any][]).map(([k, label, Ic]) => (
          <button key={k} onClick={() => setView(k)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13,
              border: `1px solid ${view === k ? C.blue : C.border}`, background: view === k ? C.blue : '#fff', color: view === k ? '#fff' : '#475569' }}>
            <Ic size={15} /> {label}
            {k === 'reco' && reco && reco.summary.total_desalignements > 0 && (
              <span style={{ background: view === k ? 'rgba(255,255,255,.25)' : '#fee2e2', color: view === k ? '#fff' : '#b91c1c', borderRadius: 10, padding: '0 7px', fontSize: 11, fontWeight: 800 }}>{reco.summary.total_desalignements}</span>
            )}
          </button>
        ))}
      </div>

      {view === 'reco' ? renderReco() : (<>
      {/* KPIs + actions */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 18px', minWidth: 130 }}>
          <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Signal size={14} /> Lignes mobiles</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: C.text }}>{kpis?.total ?? 0}</div>
        </div>
        {(kpis?.par_statut || []).slice(0, 4).map(s => (
          <div key={s.statut} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: C.slate, fontWeight: 600 }}>{s.statut}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.text }}>{s.n}</div>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {kpis?.last_import && <span style={{ fontSize: 11, color: '#94a3b8' }}>Dernier import : {new Date(kpis.last_import).toLocaleString('fr-FR')}</span>}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); }} />
          <button onClick={() => fileRef.current?.click()} disabled={importing}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13, border: 'none', background: importing ? '#94a3b8' : C.blue, color: '#fff' }}>
            <Upload size={15} /> {importing ? 'Import en cours…' : 'Importer lignes.xlsx'}
          </button>
          <button onClick={load} title="Rafraîchir" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13, border: `1px solid ${C.border}`, background: '#fff', color: '#475569' }}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 9, color: '#94a3b8' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="N° ligne, nom, forfait, IMEI, contrat…"
            style={{ padding: '8px 30px 8px 32px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, width: 320, outline: 'none' }} />
          {q && <X size={14} onClick={() => setQ('')} style={{ position: 'absolute', right: 10, top: 9, color: '#94a3b8', cursor: 'pointer' }} />}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Filter size={14} color="#94a3b8" />
          <select value={statut} onChange={e => setStatut(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: '#fff', cursor: 'pointer' }}>
            <option value="">Tous les statuts</option>
            {(kpis?.par_statut || []).map(s => <option key={s.statut} value={s.statut}>{s.statut} ({s.n})</option>)}
          </select>
        </div>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{lignes.length} ligne{lignes.length > 1 ? 's' : ''}</span>
      </div>

      {/* Tableau */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'auto' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
        ) : lignes.length === 0 ? (
          <div style={{ padding: 50, textAlign: 'center', color: '#94a3b8' }}>
            Aucune ligne mobile. Importez le fichier <strong>lignes.xlsx</strong> pour démarrer.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th}>N° Ligne</th>
                <th style={th}>Opérateur</th>
                <th style={th}>Titulaire</th>
                <th style={th}>Statut</th>
                <th style={th}>Forfait</th>
                <th style={th}>Terminal</th>
                <th style={th}>IMEI</th>
                <th style={th}>SIM</th>
                <th style={th}>Mise en service</th>
                <th style={th}>Fin engagement</th>
                <th style={th}>Contrat</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(l => {
                const sc = statutColor(l.statut_ligne);
                return (
                  <tr key={l.id}>
                    <td style={{ ...td, fontWeight: 700 }}>{l.numero_ligne || '—'}</td>
                    <td style={td}><span style={{ background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{l.operateur || 'SFR'}</span></td>
                    <td style={td}>{[l.nom, l.prenom].filter(Boolean).join(' ') || l.raison_sociale || '—'}</td>
                    <td style={td}>{l.statut_ligne ? <span style={{ background: sc.bg, color: sc.c, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{l.statut_ligne}</span> : '—'}</td>
                    <td style={{ ...td, whiteSpace: 'normal', maxWidth: 220 }}>{l.forfait || '—'}</td>
                    <td style={td}>{l.terminal || '—'}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{l.imei || '—'}</td>
                    <td style={td}>{l.format_sim || '—'}</td>
                    <td style={td}>{fmtDate(l.date_mise_en_service)}</td>
                    <td style={td}>{fmtDate(l.date_fin_engagement)}</td>
                    <td style={td}>{l.numero_contrat || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </>)}
    </div>
  );

  // ── Rendu de la vue rapprochement ──
  function renderReco() {
    const sevColor = (s: string) => s === 'high' ? { bg: '#fee2e2', c: '#b91c1c', label: 'Critique' }
      : s === 'medium' ? { bg: '#ffedd5', c: '#9a3412', label: 'À surveiller' }
      : { bg: '#f1f5f9', c: '#475569', label: 'Info' };
    const filtered = (reco?.items || []).filter(it =>
      (!recoType || it.type === recoType) && (!recoSeverity || it.severity === recoSeverity));

    const tdS: React.CSSProperties = { padding: '8px 12px', fontSize: 12.5, color: C.text, borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
    const thS: React.CSSProperties = { padding: '9px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', borderBottom: '1px solid ' + C.border };

    return (
      <div>
        {/* Résumé */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          {[
            { l: 'Lignes SFR', v: reco?.summary.total_lignes ?? 0, ic: <Signal size={14} /> },
            { l: 'Appareils', v: reco?.summary.total_appareils ?? 0, ic: <Smartphone size={14} /> },
            { l: 'Rapprochés', v: reco?.summary.appareils_rapproches ?? 0, ic: <GitCompare size={14} /> },
            { l: 'Désalignements', v: reco?.summary.total_desalignements ?? 0, ic: <AlertTriangle size={14} />, hot: true },
          ].map(c => (
            <div key={c.l} style={{ background: C.card, border: `1px solid ${c.hot ? '#fca5a5' : C.border}`, borderRadius: 12, padding: '12px 18px', minWidth: 120 }}>
              <div style={{ fontSize: 12, color: C.slate, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{c.ic} {c.l}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: c.hot ? '#b91c1c' : C.text }}>{c.v}</div>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
            {(['high', 'medium', 'low'] as const).map(s => {
              const sc = sevColor(s); const n = reco?.summary.par_gravite[s] ?? 0;
              return <span key={s} onClick={() => setRecoSeverity(recoSeverity === s ? '' : s)}
                style={{ cursor: 'pointer', background: recoSeverity === s ? sc.c : sc.bg, color: recoSeverity === s ? '#fff' : sc.c, padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700 }}>
                {sc.label} · {n}</span>;
            })}
          </div>
          <button onClick={loadReco} title="Recalculer" style={{ display: 'inline-flex', alignItems: 'center', padding: '9px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${C.border}`, background: '#fff', color: '#475569' }}><RefreshCw size={15} /></button>
        </div>

        {/* Filtres par type (cartes cliquables) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <button onClick={() => setRecoType('')} style={{ padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: `1px solid ${!recoType ? C.blue : C.border}`, background: !recoType ? C.blue : '#fff', color: !recoType ? '#fff' : '#475569' }}>Tout ({reco?.items.length ?? 0})</button>
          {Object.entries(reco?.summary.par_type || {}).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
            <button key={t} onClick={() => setRecoType(recoType === t ? '' : t)}
              style={{ padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 12, fontWeight: 700, border: `1px solid ${recoType === t ? C.blue : C.border}`, background: recoType === t ? C.blue : '#fff', color: recoType === t ? '#fff' : '#475569' }}>
              {RECO_LABELS[t] || t} ({n})
            </button>
          ))}
        </div>

        {/* Tableau des désalignements */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'auto' }}>
          {recoLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Analyse en cours…</div>
          ) : !reco ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucune donnée. Importez les lignes et synchronisez la mobilité.</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 50, textAlign: 'center', color: '#15803d', fontWeight: 600 }}>✓ Aucun désalignement pour ce filtre.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thS}>Gravité</th>
                  <th style={thS}>Désalignement</th>
                  <th style={thS}>Côté SFR</th>
                  <th style={thS}>Côté parc mobilité</th>
                  <th style={thS}>Action conseillée</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((it, i) => {
                  const sc = sevColor(it.severity);
                  return (
                    <tr key={i}>
                      <td style={tdS}><span style={{ background: sc.bg, color: sc.c, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{sc.label}</span></td>
                      <td style={{ ...tdS, fontWeight: 600, maxWidth: 200 }}>
                        {it.titre}
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{RECO_LABELS[it.type] || it.type}</div>
                      </td>
                      <td style={tdS}>
                        {it.sfr ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ fontWeight: 700 }}>{it.sfr.numero_ligne || '—'}</span>
                            <span style={{ color: C.slate }}>{it.sfr.titulaire || '—'}</span>
                            {it.sfr.forfait && <span style={{ color: '#94a3b8', fontSize: 11 }}>{it.sfr.forfait}</span>}
                            {it.sfr.statut_ligne && <span style={{ fontSize: 11 }}>Statut : {it.sfr.statut_ligne}</span>}
                            {it.sfr.imei && <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>IMEI {it.sfr.imei}</span>}
                          </div>
                        ) : <span style={{ color: '#cbd5e1' }}>— absent —</span>}
                      </td>
                      <td style={tdS}>
                        {it.device ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <span style={{ fontWeight: 700 }}>{it.device.modele || it.device.famille || '—'}</span>
                            <span style={{ color: C.slate }}>{it.device.agent || '—'}{it.device.service ? ` · ${it.device.service}` : ''}</span>
                            {it.device.statut && <span style={{ fontSize: 11 }}>État : {it.device.statut}</span>}
                            {it.device.numero_ligne && <span style={{ fontSize: 11 }}>N° {it.device.numero_ligne}</span>}
                            {it.device.imei && <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>IMEI {it.device.imei}</span>}
                          </div>
                        ) : <span style={{ color: '#cbd5e1' }}>— absent —</span>}
                      </td>
                      <td style={{ ...tdS, maxWidth: 260, whiteSpace: 'normal' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 5, color: '#475569' }}>
                          <ArrowRight size={13} style={{ marginTop: 2, flexShrink: 0, color: C.blue }} /> {it.action}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }
}
