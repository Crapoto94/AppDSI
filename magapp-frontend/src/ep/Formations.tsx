import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { GraduationCap, Sparkles, Loader2, ChevronDown, ChevronRight, Download, Info } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, EmptyState, btnGhost, btnPrimary, card } from './ui';

interface Service { service: string; total: number; types: Record<'obligatoires' | 'metiers' | 'parcours', string[]> }
interface Direction { direction: string; total: number; services: Service[] }
interface Theme { theme: string; description: string; nb: number; types: Record<string, number>; directions: Array<{ direction: string; nb: number }>; exemples: string[] }
interface Analyse { generated_at: string; duration_ms: number; nb_demandes: number; nb_analysees?: number; themes: Theme[]; synthese: string; model?: string }
interface Data {
  simulation?: boolean;
  campaign: { annee: number; libelle?: string } | null;
  types: Array<{ key: 'obligatoires' | 'metiers' | 'parcours'; label: string }>;
  total: number; directions: Direction[]; analyse: Analyse | null;
  etat: { status: 'en_cours' | 'termine' | 'echec'; error?: string | null } | null;
}

const TYPE_COLOR: Record<string, string> = { obligatoires: '#b45309', metiers: '#4f46e5', parcours: '#0f766e' };
const fmt = (ms?: number) => { const s = Math.round((ms || 0) / 1000); return s < 90 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`; };

/** Demandes de formation issues des comptes rendus : par direction puis service, selon les 3 types, et analyse globale non nominative par l'IA locale. */
export default function Formations() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try { const r = await axios.get('/api/entretiens/formations', { headers }); setData(r.data); setError(''); }
    catch (e: any) { setError(e?.response?.data?.message || 'Chargement impossible.'); }
  }, [headers]);
  useEffect(() => { load(); }, [load]);

  const running = data?.etat?.status === 'en_cours';
  useEffect(() => {
    if (poll.current) { clearInterval(poll.current); poll.current = null; }
    if (running) poll.current = setInterval(load, 5000);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [running, load]);

  const analyser = async () => {
    setBusy(true);
    try { await axios.post('/api/entretiens/formations/analyse', {}, { headers }); await load(); }
    catch (e: any) { setError(e?.response?.data?.message || 'Analyse impossible.'); } finally { setBusy(false); }
  };
  const toggle = (k: string) => setOpen(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const exportCsv = () => {
    if (!data) return;
    const rows = [['Direction', 'Service', 'Type', 'Demande']];
    for (const d of data.directions) for (const s of d.services) for (const t of data.types) for (const x of s.types[t.key]) rows.push([d.direction, s.service, t.label, x]);
    const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'demandes-formation.csv'; a.click();
  };

  if (error && !data) return <div style={{ color: COLORS.danger, fontSize: 13 }}>{error}</div>;
  if (!data) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={22} className="spin" /></div>;
  if (!data.campaign || data.total === 0) return <EmptyState icon={<GraduationCap size={40} />} title="Aucune demande de formation" text="Les demandes apparaîtront ici dès que des comptes rendus renseigneront leurs « Actions de formation à envisager »." />;

  return (
    <div>
      {data.simulation && <div style={{ background: '#fef3c7', border: '1px solid #fcd34d', color: '#92400e', borderRadius: 9, padding: '8px 12px', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>🧪 Mode simulation : ces demandes sont FICTIVES (la moitié des agents, selon leur métier). Elles ne sont pas enregistrées.</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 15, fontWeight: 800, color: COLORS.text }}>
          <GraduationCap size={18} color={COLORS.primary} /> Demandes de formation — campagne {data.campaign.annee} <span style={{ fontWeight: 600, color: COLORS.muted, fontSize: 12.5 }}>({data.total} demande{data.total > 1 ? 's' : ''})</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button style={btnGhost} onClick={exportCsv}><Download size={14} /> Exporter (CSV)</button>
          <button style={btnPrimary} disabled={busy || running} onClick={analyser}>
            {running || busy ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} {running ? 'Analyse en cours…' : data.analyse ? 'Relancer l’analyse IA' : 'Analyser avec l’IA locale'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 9, padding: '8px 12px', fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
        <Info size={14} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Vue <b>non nominative</b> : aucun nom d’agent n’est affiché ni transmis à l’IA, seulement le texte de la demande, son type, la direction et le service. L’IA locale regroupe les demandes par thème (par exemple « Word » et « Excel » dans « Bureautique » ; « management » et « encadrement » ensemble) ; les chiffres sont recalculés par l’application.</span>
      </div>
      {error && <div style={{ color: COLORS.danger, fontSize: 12.5, marginBottom: 8 }}>{error}</div>}
      {data.etat?.status === 'echec' && <div style={{ color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 9, padding: '8px 12px', fontSize: 12.5, marginBottom: 10 }}>La dernière analyse a échoué : {data.etat.error}</div>}

      {data.analyse && (
        <div style={{ ...card, padding: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, fontSize: 14, color: COLORS.text, marginBottom: 6 }}>
            <Sparkles size={16} color="#7c3aed" /> Besoins globaux (analyse IA)
            <span style={{ marginLeft: 'auto', fontWeight: 500, fontSize: 11.5, color: COLORS.muted }}>{new Date(data.analyse.generated_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} · {fmt(data.analyse.duration_ms)}{data.analyse.model ? ` · ${data.analyse.model}` : ''}</span>
          </div>
          {data.analyse.synthese && <p style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.65, color: '#334155' }}>{data.analyse.synthese}</p>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 10 }}>
            {data.analyse.themes.map(t => (
              <div key={t.theme} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '10px 12px', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: COLORS.text, flex: 1 }}>{t.theme}</span>
                  <span style={{ background: '#eef2ff', color: COLORS.primary, borderRadius: 999, padding: '1px 9px', fontSize: 12, fontWeight: 800 }}>{t.nb}</span>
                </div>
                {t.description && <div style={{ fontSize: 11.5, color: COLORS.muted, margin: '2px 0 5px' }}>{t.description}</div>}
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 5 }}>
                  {data.types.map(ty => t.types[ty.key] > 0 && <span key={ty.key} style={{ fontSize: 10.5, fontWeight: 700, color: TYPE_COLOR[ty.key], background: '#f8fafc', border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '0 6px' }}>{ty.key === 'obligatoires' ? 'Obligatoires' : ty.key === 'metiers' ? 'Métiers' : 'Parcours'} {t.types[ty.key]}</span>)}
                </div>
                {t.directions.length > 0 && <div style={{ fontSize: 11.5, color: '#475569' }}><b>Directions :</b> {t.directions.slice(0, 4).map(d => `${d.direction} (${d.nb})`).join(' · ')}</div>}
                <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 3 }}>{t.exemples.slice(0, 4).join(' · ')}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', fontWeight: 800, fontSize: 13.5, color: COLORS.text, borderBottom: `1px solid ${COLORS.border}` }}>Par direction et par service</div>
        {data.directions.map(d => {
          const dk = 'd:' + d.direction;
          return (
            <div key={dk}>
              <div onClick={() => toggle(dk)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: '#f1f5f9', cursor: 'pointer', borderBottom: `1px solid ${COLORS.border}`, fontWeight: 800, fontSize: 13 }}>
                {open.has(dk) ? <ChevronDown size={15} /> : <ChevronRight size={15} />} {d.direction}
                <span style={{ marginLeft: 'auto', fontSize: 11.5, color: COLORS.primary, background: '#eef2ff', borderRadius: 999, padding: '1px 9px' }}>{d.total}</span>
              </div>
              {open.has(dk) && d.services.map(s => (
                <div key={dk + s.service} style={{ padding: '8px 14px 10px 36px', borderBottom: `1px solid ${COLORS.border}` }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, color: '#334155', marginBottom: 4 }}>{s.service} <span style={{ color: COLORS.muted, fontWeight: 500 }}>({s.total})</span></div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
                    {data.types.map(ty => (
                      <div key={ty.key} style={{ borderLeft: `3px solid ${TYPE_COLOR[ty.key]}`, paddingLeft: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 800, color: TYPE_COLOR[ty.key] }}>{ty.label} ({s.types[ty.key].length})</div>
                        {s.types[ty.key].length === 0 ? <div style={{ fontSize: 11.5, color: '#94a3b8' }}>—</div> : (
                          <ul style={{ margin: '2px 0 0', paddingLeft: 16, fontSize: 12, color: '#475569', lineHeight: 1.5 }}>{s.types[ty.key].map((x, i) => <li key={i}>{x}</li>)}</ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
