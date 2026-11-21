import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { GraduationCap, Sparkles, Loader2, ChevronDown, ChevronRight, Download, Info, X, CheckCircle2, Eye } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, EmptyState, btnGhost, btnPrimary, card } from './ui';

interface Service { service: string; total: number; types: Record<'obligatoires' | 'metiers' | 'parcours', string[]> }
interface Direction { direction: string; total: number; services: Service[] }
interface SousTheme { theme: string; nb: number; exemples: string[] }
interface Theme { theme: string; description: string; nb: number; types: Record<string, number>; directions: Array<{ direction: string; nb: number }>; exemples: string[]; sous_themes?: SousTheme[] }
interface Analyse { generated_at: string; duration_ms: number; nb_demandes: number; nb_analysees?: number; nb_formulations?: number; themes: Theme[]; synthese: string; model?: string }
interface Data {
  simulation?: boolean;
  campaign: { annee: number; libelle?: string } | null;
  types: Array<{ key: 'obligatoires' | 'metiers' | 'parcours'; label: string }>;
  total: number; directions: Direction[]; analyse: Analyse | null;
  etat: { status: 'en_cours' | 'termine' | 'echec'; error?: string | null; phase?: string; label?: string; done?: number; total?: number; started_at?: number; finished_at?: number | null; model?: string | null; log?: Array<{ phase: string; label: string; ms: number }> } | null;
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
  const [showResult, setShowResult] = useState(false);
  const [now, setNow] = useState(Date.now());
  const wasRunning = useRef(false);

  const load = useCallback(async () => {
    try { const r = await axios.get('/api/entretiens/formations', { headers }); setData(r.data); setError(''); }
    catch (e: any) { setError(e?.response?.data?.message || 'Chargement impossible.'); }
  }, [headers]);
  useEffect(() => { load(); }, [load]);

  const running = data?.etat?.status === 'en_cours';
  useEffect(() => {
    if (poll.current) { clearInterval(poll.current); poll.current = null; }
    if (running) poll.current = setInterval(load, 2000);
    return () => { if (poll.current) clearInterval(poll.current); };
  }, [running, load]);

  useEffect(() => { if (!running) return; const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, [running]);
  // Fin d'analyse : le bouton « Voir le résultat » apparaît et clignote jusqu'au premier clic
  const [fresh, setFresh] = useState(false);
  useEffect(() => { if (wasRunning.current && !running && data?.etat?.status === 'termine') setFresh(true); wasRunning.current = running; }, [running, data]);

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

      {running && data.etat && <Progression etat={data.etat} now={now} />}

      {!running && data.analyse && (
        <div style={{ ...card, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderColor: fresh ? '#7c3aed' : undefined }}>
          <CheckCircle2 size={18} color="#16a34a" />
          <div style={{ fontSize: 13, color: COLORS.text, flex: 1, minWidth: 220 }}>
            <b>Analyse IA {fresh ? 'terminée' : 'disponible'}</b>
            <span style={{ color: COLORS.muted }}> — {new Date(data.analyse.generated_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} · {fmt(data.analyse.duration_ms)}{data.analyse.nb_formulations ? ` · ${data.analyse.nb_demandes} demandes, ${data.analyse.nb_formulations} formulations distinctes` : ''}</span>
          </div>
          <button style={{ ...btnPrimary, background: '#7c3aed', animation: fresh ? 'epPulse 1.4s ease-in-out infinite' : undefined }} onClick={() => { setShowResult(true); setFresh(false); }}>
            <Eye size={15} /> Voir le résultat de l’analyse IA
          </button>
        </div>
      )}
      {showResult && data.analyse && <ResultatModal analyse={data.analyse} types={data.types} onClose={() => setShowResult(false)} />}

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

const PHASES: Array<[string, string]> = [['classement', 'Classement des demandes par catégorie'], ['reprise', 'Reprise des demandes non classées'], ['regroupement', 'Regroupement des formulations proches'], ['synthese', 'Synthèse pour la DRH']];

/** Progression en direct : phase en cours, barre d'avancement, temps écoulé, étapes terminées. */
function Progression({ etat, now }: { etat: NonNullable<Data['etat']>; now: number }) {
  const el = Math.max(0, Math.round((now - (etat.started_at || now)) / 1000));
  const pct = etat.total ? Math.min(100, Math.round(((etat.done || 0) / etat.total) * 100)) : 0;
  const doneKeys = new Set((etat.log || []).map(l => l.phase));
  return (
    <div style={{ ...card, padding: 16, marginBottom: 16, borderColor: '#c4b5fd', background: 'linear-gradient(180deg,#faf5ff,#fff)' }}>
      <style>{'@keyframes epPulse{0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,.5)}50%{box-shadow:0 0 0 8px rgba(124,58,237,0)}}@keyframes epBar{0%{background-position:0 0}100%{background-position:40px 0}}'}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 800, fontSize: 14, color: '#5b21b6' }}>
        <Loader2 size={18} className="spin" /> L’IA locale analyse les demandes…
        <span style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 700, color: '#6d28d9' }}>{Math.floor(el / 60)} min {String(el % 60).padStart(2, '0')} s{etat.model ? ` · ${etat.model}` : ''}</span>
      </div>
      <div style={{ fontSize: 13, color: '#334155', margin: '8px 0 6px' }}>{etat.label || 'Préparation des demandes'}{etat.total ? ` — ${etat.done || 0} / ${etat.total}` : ''}</div>
      <div style={{ height: 10, background: '#ede9fe', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${Math.max(pct, 4)}%`, height: '100%', transition: 'width .4s', backgroundImage: 'repeating-linear-gradient(45deg,#7c3aed 0 10px,#8b5cf6 10px 20px)', backgroundSize: '40px 40px', animation: 'epBar .8s linear infinite' }} />
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12 }}>
        {PHASES.filter(([k]) => k !== 'reprise' || doneKeys.has('reprise') || etat.phase === 'reprise').map(([k, l]) => {
          const ok = doneKeys.has(k), cur = etat.phase === k;
          return <span key={k} style={{ display: 'inline-flex', gap: 5, alignItems: 'center', color: ok ? '#15803d' : cur ? '#6d28d9' : '#94a3b8', fontWeight: cur ? 800 : 600 }}>
            {ok ? <CheckCircle2 size={13} /> : cur ? <Loader2 size={13} className="spin" /> : <span style={{ width: 13, height: 13, borderRadius: 999, border: '1.5px solid #cbd5e1', display: 'inline-block' }} />} {l}
          </span>;
        })}
      </div>
      <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 8 }}>Les demandes sont traitées en parallèle sur les serveurs d’IA de la Ville. Vous pouvez quitter cette page : l’analyse continue et le résultat sera disponible ici.</div>
    </div>
  );
}

/** Résultat de l'analyse IA : synthèse puis catégories avec leurs sous-thèmes. */
function ResultatModal({ analyse, types, onClose }: { analyse: Analyse; types: Data['types']; onClose: () => void }) {
  const max = Math.max(1, ...analyse.themes.map(t => t.nb));
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '20px 12px', overflowY: 'auto' }}>
      <div style={{ ...card, width: '100%', maxWidth: 1000, padding: 18 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, fontSize: 15, color: COLORS.text, marginBottom: 6 }}>
          <Sparkles size={17} color="#7c3aed" /> Besoins globaux de formation (analyse IA)
          <button style={{ ...btnGhost, marginLeft: 'auto' }} onClick={onClose}><X size={14} /> Fermer</button>
        </div>
        <div style={{ fontSize: 11.5, color: COLORS.muted, marginBottom: 10 }}>{new Date(analyse.generated_at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} · {fmt(analyse.duration_ms)}{analyse.model ? ` · ${analyse.model}` : ''} · {analyse.nb_demandes} demandes{analyse.nb_formulations ? `, ${analyse.nb_formulations} formulations distinctes` : ''}</div>
        {analyse.synthese && <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.65, color: '#334155', background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '10px 12px' }}>{analyse.synthese}</p>}
        <div style={{ display: 'grid', gap: 10 }}>
          {analyse.themes.map(t => (
            <div key={t.theme} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '10px 12px', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 800, fontSize: 13.5, color: COLORS.text, minWidth: 190 }}>{t.theme}</span>
                <div style={{ flex: 1, height: 8, background: '#f1f5f9', borderRadius: 999 }}><div style={{ width: `${(t.nb / max) * 100}%`, height: '100%', background: '#7c3aed', borderRadius: 999 }} /></div>
                <span style={{ background: '#eef2ff', color: COLORS.primary, borderRadius: 999, padding: '1px 9px', fontSize: 12, fontWeight: 800 }}>{t.nb}</span>
              </div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', margin: '6px 0 4px' }}>
                {types.map(ty => t.types[ty.key] > 0 && <span key={ty.key} style={{ fontSize: 10.5, fontWeight: 700, color: TYPE_COLOR[ty.key], background: '#f8fafc', border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '0 6px' }}>{ty.key === 'obligatoires' ? 'Obligatoires' : ty.key === 'metiers' ? 'Métiers' : 'Parcours'} {t.types[ty.key]}</span>)}
              </div>
              {(t.sous_themes || []).length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0' }}>
                  {t.sous_themes!.slice(0, 10).map(st => <span key={st.theme} title={st.exemples.join(' · ')} style={{ fontSize: 11.5, background: '#f5f3ff', color: '#5b21b6', borderRadius: 7, padding: '2px 8px', border: '1px solid #ddd6fe' }}>{st.theme} <b>{st.nb}</b></span>)}
                </div>
              )}
              {t.directions.length > 0 && <div style={{ fontSize: 11.5, color: '#475569' }}><b>Directions :</b> {t.directions.slice(0, 5).map(d => `${d.direction} (${d.nb})`).join(' · ')}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
