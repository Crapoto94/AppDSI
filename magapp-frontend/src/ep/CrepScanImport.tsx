import { useRef, useState } from 'react';
import axios from 'axios';
import { Loader2, ScanLine, X } from 'lucide-react';
import { COLORS, btnGhost, btnPrimary, input, textarea } from './ui';
import type { Crep } from './crep';

interface Proposal {
  raw: string;
  fields: Partial<Crep> & Record<string, any>;
  engine: { lecture: string; structuration: string };
  warnings: string[];
}

const TEXT_FIELDS: Array<[string, string]> = [
  ['missions', 'Rappel des missions de l’agent'],
  ['observations_complementaires', 'Observations complémentaires'],
  ['appreciation_generale', 'Appréciation générale'],
  ['objectifs_service', 'Rappel des objectifs du service / de la direction'],
  ['evolution', 'Évolution des missions et/ou de carrière'],
  ['mobilite', 'Mobilité'],
  ['obs_agent_conditions', 'Observations de l’agent sur les conditions de travail'],
  ['obs_agent_entretien', 'Observations de l’agent sur l’entretien'],
  ['visa_autorite', 'Observations et visa de l’autorité territoriale'],
];

/**
 * Import d'un compte rendu papier : le document est numérisé et lu par l'IA interne (écriture manuscrite), qui PROPOSE un contenu.
 * L'évaluateur relit et corrige chaque rubrique, puis l'applique au formulaire (rien n'est enregistré avant son propre « Enregistrer »).
 */
export default function CrepScanImport({ entretienId, headers, disabled, onApply, definition }: {
  entretienId: number;
  definition?: { criteria_groups?: Array<{ key: string; title: string | null; items: Array<{ key: string; label: string; lead?: string }> }> } | null;
  headers: Record<string, string>;
  disabled?: boolean;
  onApply: (fields: Record<string, any>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prop, setProp] = useState<Proposal | null>(null);
  const [edit, setEdit] = useState<Record<string, any>>({});

  const upload = async (list: File[]) => {
    setBusy(true); setError('');
    try {
      const fd = new FormData(); list.slice(0, 8).forEach(f => fd.append('files', f));
      const r = await axios.post(`/api/entretiens/${entretienId}/crep/scan`, fd, { headers, timeout: 600000 });
      const p = r.data as Proposal;
      setProp(p);
      setEdit({ ...(p.fields || {}) });
    } catch (e: any) { setError(e?.response?.data?.message || e?.message || 'Lecture impossible.'); }
    finally { setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const apply = () => {
    // Seules les rubriques non vides sont reprises : le contenu déjà saisi n'est pas effacé par une rubrique que la lecture n'a pas trouvée.
    const out: Record<string, any> = {};
    for (const [k] of TEXT_FIELDS) if (String(edit[k] || '').trim()) out[k] = edit[k];
    for (const k of ['date_convocation', 'date_entretien', 'date_notification']) if (/^\d{4}-\d{2}-\d{2}$/.test(String(edit[k] || ''))) out[k] = edit[k];
    const objE = (edit.objectifs_ecoules || []).filter((o: any) => String(o.objectif || '').trim());
    if (objE.length) out.objectifs_ecoules = objE;
    const objF = (edit.objectifs_futurs || []).filter((o: any) => String(o.descriptif || '').trim());
    if (objF.length) out.objectifs_futurs = objF;
    const val = Object.fromEntries(Object.entries(edit.valeur || {}).filter(([, v]) => v === 'S' || v === 'AS' || v === 'I'));
    if (Object.keys(val).length) out.valeur = val;
    const f = edit.formations || {};
    if (['obligatoires', 'metiers', 'parcours'].some(k => String(f[k] || '').trim())) out.formations = f;
    onApply(out);
    setProp(null);
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg,image/webp" multiple style={{ display: 'none' }} onChange={e => { const l = Array.from(e.target.files || []); if (l.length) upload(l); }} />
      <button type="button" style={btnGhost} disabled={disabled || busy} onClick={() => fileRef.current?.click()}
        title="Photographiez ou scannez les pages du compte rendu papier (plusieurs fichiers possibles, dans l’ordre) : l’IA lit l’écriture et les cases cochées et propose son contenu, que vous relisez avant de l’appliquer">
        {busy ? <Loader2 size={14} className="spin" /> : <ScanLine size={14} />} {busy ? 'Lecture en cours (peut durer quelques minutes)…' : 'Importer un compte rendu papier (scan)'}
      </button>
      {error && <div style={{ marginTop: 6, fontSize: 12.5, color: '#b91c1c' }}>{error}</div>}

      {prop && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 14, width: 'min(920px, 100%)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Proposition issue du document numérisé</div>
                <div style={{ fontSize: 12, color: COLORS.muted }}>Lecture : {prop.engine.lecture}{prop.engine.structuration ? ` · mise en forme : ${prop.engine.structuration}` : ''}</div>
              </div>
              <button style={btnGhost} onClick={() => setProp(null)} aria-label="Fermer"><X size={15} /></button>
            </div>
            <div style={{ padding: 18, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {prop.warnings.map((w, i) => <div key={i} style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 11px', fontSize: 12.5 }}>⚠ {w}</div>)}
              <div style={{ fontSize: 12.5, color: '#475569' }}>Relisez et corrigez chaque rubrique : <b>c’est vous qui validez</b>. Les rubriques vides ne modifient pas le formulaire.</div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                {[['date_convocation', 'Date de convocation'], ['date_entretien', 'Date de l’entretien'], ['date_notification', 'Date de notification']].map(([k, l]) => (
                  <label key={k} style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}>{l}
                    <input type="date" style={input} value={edit[k] || ''} onChange={e => setEdit(v => ({ ...v, [k]: e.target.value }))} />
                  </label>
                ))}
              </div>

              {(definition?.criteria_groups || []).length > 0 && (
                <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: '#334155', marginBottom: 6 }}>
                    Grille d’appréciation (cases cochées lues) — {Object.keys(edit.valeur || {}).length} / {(definition?.criteria_groups || []).flatMap(g => g.items).length} reconnues
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '4px 14px' }}>
                    {(definition?.criteria_groups || []).flatMap(g => g.items).map(it => {
                      const v = (edit.valeur || {})[it.key] || '';
                      const col = v === 'S' ? '#16a34a' : v === 'AS' ? '#b45309' : v === 'I' ? '#b91c1c' : '#94a3b8';
                      return (
                        <div key={it.key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: '#334155' }}>
                          <span style={{ flex: 1, minWidth: 0 }}>{it.lead || it.label}</span>
                          <select value={v} style={{ ...input, width: 74, padding: '3px 6px', fontWeight: 800, color: col }}
                            onChange={e => setEdit(x => ({ ...x, valeur: { ...(x.valeur || {}), [it.key]: e.target.value } }))}>
                            <option value="">—</option><option value="S">S</option><option value="AS">AS</option><option value="I">I</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>S = satisfaisant · AS = assez satisfaisant · I = insuffisant</div>
                </div>
              )}

              {(edit.objectifs_ecoules || []).map((o: any, i: number) => (
                <div key={'oe' + i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) 90px', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}>Objectif {i + 1} (année écoulée)
                    <textarea style={textarea} rows={2} value={o.objectif || ''} onChange={e => setEdit(v => ({ ...v, objectifs_ecoules: v.objectifs_ecoules.map((x: any, k: number) => k === i ? { ...x, objectif: e.target.value } : x) }))} /></label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}>Observations
                    <textarea style={textarea} rows={2} value={o.observations || ''} onChange={e => setEdit(v => ({ ...v, objectifs_ecoules: v.objectifs_ecoules.map((x: any, k: number) => k === i ? { ...x, observations: e.target.value } : x) }))} /></label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}>Niveau
                    <select style={input} value={o.niveau || ''} onChange={e => setEdit(v => ({ ...v, objectifs_ecoules: v.objectifs_ecoules.map((x: any, k: number) => k === i ? { ...x, niveau: e.target.value } : x) }))}>
                      <option value="">—</option><option value="A">A</option><option value="PA">PA</option><option value="NA">NA</option></select></label>
                </div>
              ))}

              {TEXT_FIELDS.map(([k, l]) => (
                <label key={k} style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}>{l}
                  <textarea style={textarea} rows={3} value={edit[k] || ''} onChange={e => setEdit(v => ({ ...v, [k]: e.target.value }))} /></label>
              ))}

              {(edit.objectifs_futurs || []).map((o: any, i: number) => (
                <div key={'of' + i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 8 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}>Objectif {i + 1} (année à venir)
                    <textarea style={textarea} rows={2} value={o.descriptif || ''} onChange={e => setEdit(v => ({ ...v, objectifs_futurs: v.objectifs_futurs.map((x: any, k: number) => k === i ? { ...x, descriptif: e.target.value } : x) }))} /></label>
                  <label style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}>Moyens et échéances
                    <textarea style={textarea} rows={2} value={o.moyens || ''} onChange={e => setEdit(v => ({ ...v, objectifs_futurs: v.objectifs_futurs.map((x: any, k: number) => k === i ? { ...x, moyens: e.target.value } : x) }))} /></label>
                </div>
              ))}

              {(['obligatoires', 'metiers', 'parcours'] as const).map(k => (
                <label key={k} style={{ fontSize: 12, fontWeight: 600, color: '#475569', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {k === 'obligatoires' ? 'Formations obligatoires' : k === 'metiers' ? 'Autres formations métiers' : 'Formations liées au parcours / projet professionnel'}
                  <textarea style={textarea} rows={2} value={(edit.formations || {})[k] || ''} onChange={e => setEdit(v => ({ ...v, formations: { ...(v.formations || {}), [k]: e.target.value } }))} /></label>
              ))}

              <details>
                <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: '#475569' }}>Texte brut lu sur le document</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11.5, background: '#f8fafc', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 10, maxHeight: 240, overflowY: 'auto' }}>{prop.raw}</pre>
              </details>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '12px 18px', borderTop: `1px solid ${COLORS.border}` }}>
              <button style={btnGhost} onClick={() => setProp(null)}>Annuler</button>
              <button style={btnPrimary} onClick={apply}>Appliquer au formulaire</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
