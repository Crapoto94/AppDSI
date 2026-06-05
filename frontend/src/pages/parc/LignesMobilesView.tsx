// ─── Parc : Lignes mobiles (forfaits / SIM) ───────────────────────────────────
// Importées depuis lignes.xlsx (export opérateur). L'import REMPLACE toute la
// table et force l'opérateur à « SFR ». Vue branchée dans l'onglet « Lignes mobiles ».
import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { Search, X, RefreshCw, Upload, Signal, Filter } from 'lucide-react';

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

export default function LignesMobilesView({ token }: { token: string }) {
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<{ total: number; par_statut: { statut: string; n: number }[]; last_import: string | null } | null>(null);
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const h = { Authorization: `Bearer ${token}` };

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
    </div>
  );
}
