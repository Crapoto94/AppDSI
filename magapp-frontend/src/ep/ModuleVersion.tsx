import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Sparkles, Wrench, Bug, X, Loader2 } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, btnGhost } from './ui';

interface Release { version: string; date: string; commit?: string; groups: { nouveautes: string[]; ameliorations: string[]; corrections: string[] } }
interface VersionInfo { version: string; date: string; admin: boolean; releases: Release[] }

const fmt = (d?: string) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/**
 * Numéro de version du module. Pour les administrateurs, un clic ouvre les « nouveautés » (historique nourri par les
 * descriptions des commits git : voir backend/scripts/gen-module-changelog.js).
 */
export default function ModuleVersion({ url = '/api/entretiens/version', title = 'Entretiens professionnels' }: { url?: string; title?: string }) {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [info, setInfo] = useState<VersionInfo | null>(null);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState(false);

  useEffect(() => { axios.get(url, { headers }).then(r => setInfo(r.data)).catch(() => setInfo(null)); }, [headers, url]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open]);

  if (!info) return null;
  const badge: React.CSSProperties = { fontSize: 11, fontWeight: 800, color: '#64748b', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 999, padding: '2px 9px', marginLeft: 8, verticalAlign: 'middle' };

  return (
    <>
      {info.admin
        ? <button type="button" onClick={() => setOpen(true)} title="Voir les nouveautés de cette version" style={{ ...badge, cursor: 'pointer', color: COLORS.primary, background: '#eef2ff', borderColor: '#c7d2fe' }}>v{info.version}</button>
        : <span title={info.date ? `Version du ${fmt(info.date)}` : undefined} style={badge}>v{info.version}</span>}

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 3050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 'min(680px, 100%)', maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 60px rgba(15,23,42,.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
              <Sparkles size={19} color="#7c3aed" />
              <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.text, flex: 1 }}>Nouveautés — {title} <span style={{ color: COLORS.primary }}>v{info.version}</span></div>
              <button style={{ ...btnGhost, padding: '5px 9px' }} onClick={() => setOpen(false)} aria-label="Fermer"><X size={14} /></button>
            </div>
            <div style={{ overflowY: 'auto', padding: '6px 18px 18px' }}>
              {!info.releases.length && <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}><Loader2 size={18} /> Aucun historique disponible.</div>}
              {(all ? info.releases : info.releases.slice(0, 12)).map((r, i) => (
                <div key={r.version} style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontWeight: 900, fontSize: 15, color: i === 0 ? COLORS.primary : COLORS.text }}>v{r.version}</span>
                    {i === 0 && <span style={{ fontSize: 10.5, fontWeight: 800, color: '#166534', background: '#dcfce7', borderRadius: 999, padding: '1px 8px' }}>Version actuelle</span>}
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{fmt(r.date)}{r.commit ? ` · ${r.commit}` : ''}</span>
                  </div>
                  {([['nouveautes', 'Nouveautés', <Sparkles key="s" size={13} />, '#7c3aed'], ['ameliorations', 'Améliorations', <Wrench key="w" size={13} />, '#0f766e'], ['corrections', 'Corrections', <Bug key="b" size={13} />, '#b45309']] as const).map(([k, label, icon, color]) =>
                    r.groups[k].length ? (
                      <div key={k} style={{ marginTop: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: .3 }}>{icon} {label} ({r.groups[k].length})</div>
                        <ul style={{ margin: '3px 0 0', paddingLeft: 18, fontSize: 12.5, color: '#334155', lineHeight: 1.55 }}>
                          {r.groups[k].map((t, j) => <li key={j}>{t}</li>)}
                        </ul>
                      </div>
                    ) : null)}
                </div>
              ))}
              {!all && info.releases.length > 12 && (
                <div style={{ textAlign: 'center', marginTop: 16 }}><button type="button" style={btnGhost} onClick={() => setAll(true)}>Voir les {info.releases.length - 12} versions précédentes</button></div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
