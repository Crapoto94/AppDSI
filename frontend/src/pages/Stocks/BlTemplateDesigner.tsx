// ─── Éditeur graphique de champs de gabarit ───────────────────────────────────
// Affiche le PDF de fond et permet de glisser-déposer les variables à l'endroit
// voulu. Les coordonnées (x,y en points, origine haut-gauche) correspondent au
// moteur de génération (bl-pdf.service.js).
import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { X, Plus, Trash2, Type, PenLine, Save } from 'lucide-react';
import { stocksApi, type BlTemplate } from './api';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const C = { indigo: '#6366f1', red: '#ef4444', green: '#22c55e', slate: '#64748b', border: '#e2e8f0', text: '#1e293b', bg: '#f8fafc' };
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

interface Field {
  type: 'text' | 'signature_preparer' | 'signature_recipient';
  page: number; x: number; y: number; font_size?: number; bold?: boolean;
  align?: 'left' | 'center' | 'right'; width?: number; height?: number; row_height?: number;
  variable?: string;
}
interface PageImg { url: string; w: number; h: number } // dimensions en points (scale 1)

const VARS: { group: string; items: { v: string; sig?: Field['type'] }[] }[] = [
  { group: 'Fiche', items: [{ v: '{fiche.numero}' }, { v: '{date}' }, { v: '{date.remise}' }, { v: '{date.retour}' }, { v: '{store.name}' }, { v: '{etat}' }, { v: '{etat.retour}' }, { v: '{motif.retour}' }, { v: '{raison}' }] },
  { group: 'Agent', items: [{ v: '{agent.nom}' }, { v: '{agent.service}' }, { v: '{agent.direction}' }, { v: '{agent.email}' }] },
  { group: 'Matériel', items: [{ v: '{designation}' }, { v: '{imei}' }, { v: '{numero_serie}' }, { v: '{numero_ligne}' }, { v: '{chargeur}' }, { v: '{cable}' }, { v: '{tech.nom}' }, { v: '{date.retour.prev}' }] },
  { group: 'Lignes', items: [{ v: '{ligne.designation}' }, { v: '{ligne.modele}' }, { v: '{ligne.imei}' }, { v: '{ligne.serial}' }, { v: '{ligne.numero_ligne}' }, { v: '{ligne.quantite}' }] },
  { group: 'Signatures', items: [{ v: 'Signature préparateur', sig: 'signature_preparer' }, { v: 'Signature destinataire', sig: 'signature_recipient' }] },
];

const DISPLAY_W = 720; // largeur d'affichage cible (px)

export default function BlTemplateDesigner({ template, onClose, onSaved }: { template: BlTemplate; onClose: () => void; onSaved: () => void }) {
  const [pages, setPages] = useState<PageImg[]>([]);
  const [scale, setScale] = useState(1);
  const [fields, setFields] = useState<Field[]>(() => JSON.parse(JSON.stringify(template.fields || [])));
  const [sel, setSel] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const drag = useRef<{ idx: number; offX: number; offY: number; page: number } | null>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Charge et rend le PDF de fond
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const resp = await axios.get(`/api/stocks/bl-templates/${template.id}/base`, { headers: authHeaders(), responseType: 'arraybuffer' });
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(resp.data) }).promise;
        const first = await pdf.getPage(1);
        const baseVp = first.getViewport({ scale: 1 });
        const s = DISPLAY_W / baseVp.width;
        const imgs: PageImg[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const vp = page.getViewport({ scale: s });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width; canvas.height = vp.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport: vp, canvas } as any).promise;
          const vp1 = page.getViewport({ scale: 1 });
          imgs.push({ url: canvas.toDataURL('image/png'), w: vp1.width, h: vp1.height });
        }
        if (!cancelled) { setScale(s); setPages(imgs); }
      } catch (e: any) {
        if (!cancelled) setErr(e?.response?.status === 404 ? 'Ce modèle n\'a pas de PDF de fond. Chargez-en un d\'abord.' : (e.message || 'Erreur de rendu PDF'));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [template.id]);

  const update = (idx: number, patch: Partial<Field>) => setFields(f => f.map((x, i) => i === idx ? { ...x, ...patch } : x));

  const addField = (v: string, sig?: Field['type']) => {
    const nf: Field = sig
      ? { type: sig, page: 0, x: 60, y: 60, width: 150, height: 55 }
      : { type: 'text', page: 0, x: 60, y: 60, font_size: 10, variable: v };
    setFields(f => [...f, nf]); setSel(fields.length);
  };

  // Drag d'un champ
  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = drag.current; if (!d) return;
    const cont = pageRefs.current[d.page]; if (!cont) return;
    const r = cont.getBoundingClientRect();
    const xPx = e.clientX - r.left - d.offX;
    const yPx = e.clientY - r.top - d.offY;
    update(d.idx, { x: Math.max(0, Math.round(xPx / scale)), y: Math.max(0, Math.round(yPx / scale)) });
  }, [scale]);
  const onPointerUp = useCallback(() => { drag.current = null; window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); }, [onPointerMove]);
  const startDrag = (e: React.PointerEvent, idx: number) => {
    e.preventDefault(); setSel(idx);
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    drag.current = { idx, page: fields[idx].page || 0, offX: e.clientX - box.left, offY: e.clientY - box.top };
    window.addEventListener('pointermove', onPointerMove); window.addEventListener('pointerup', onPointerUp);
  };

  async function save() {
    setBusy(true); setErr(null);
    try { await stocksApi.updateBlTemplate(template.id, { fields: fields as any }); onSaved(); }
    catch (e: any) { setErr(e.response?.data?.message || e.message); }
    finally { setBusy(false); }
  }

  const f = sel != null ? fields[sel] : null;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, width: 'min(1180px,98vw)', height: '94vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,.3)' }}>
        <div style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800 }}>Éditeur graphique — {template.name}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: C.indigo, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontWeight: 700, cursor: 'pointer' }}><Save size={15} /> Enregistrer</button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate }}><X size={20} /></button>
          </div>
        </div>
        {err && <div style={{ color: C.red, fontSize: 13, padding: '8px 18px' }}>{err}</div>}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '230px 1fr 250px', overflow: 'hidden' }}>
          {/* Palette */}
          <div style={{ borderRight: `1px solid ${C.border}`, overflow: 'auto', padding: 12 }}>
            <div style={{ fontSize: 12, color: C.slate, marginBottom: 8 }}>Cliquez une variable pour l'ajouter, puis glissez-la sur le document.</div>
            {VARS.map(g => (
              <div key={g.group} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: C.slate, textTransform: 'uppercase', marginBottom: 4 }}>{g.group}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {g.items.map(it => (
                    <button key={it.v} onClick={() => addField(it.v, it.sig)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, padding: '3px 7px', cursor: 'pointer' }}>
                      {it.sig ? <PenLine size={11} /> : <Plus size={11} />} {it.v}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Aperçu du document */}
          <div style={{ overflow: 'auto', background: '#e9edf3', padding: 20 }}>
            {loading && <div style={{ textAlign: 'center', color: C.slate, padding: 40 }}>Chargement du PDF…</div>}
            {pages.map((pg, pi) => (
              <div key={pi} ref={el => { pageRefs.current[pi] = el; }} style={{ position: 'relative', width: pg.w * scale, height: pg.h * scale, margin: '0 auto 18px', boxShadow: '0 2px 12px rgba(0,0,0,.18)', background: '#fff' }}>
                <img src={pg.url} alt={`page ${pi + 1}`} draggable={false} style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }} />
                {fields.map((fd, idx) => (fd.page || 0) === pi && (
                  <div key={idx} onPointerDown={e => startDrag(e, idx)} title={fd.variable || fd.type}
                    style={{
                      position: 'absolute', left: (fd.x || 0) * scale, top: (fd.y || 0) * scale,
                      width: fd.type === 'text' ? (fd.width ? fd.width * scale : undefined) : (fd.width || 150) * scale,
                      minWidth: fd.type === 'text' ? 40 : undefined,
                      height: fd.type === 'text' ? Math.max(14, (fd.font_size || 10) * scale * 1.3) : (fd.height || 55) * scale,
                      border: `1.5px solid ${sel === idx ? C.indigo : 'rgba(99,102,241,.6)'}`,
                      background: sel === idx ? 'rgba(99,102,241,.18)' : 'rgba(99,102,241,.08)',
                      color: C.indigo, fontSize: Math.max(8, (fd.font_size || 10) * scale * 0.9), fontWeight: fd.bold ? 700 : 500,
                      borderRadius: 3, cursor: 'move', whiteSpace: 'nowrap', overflow: 'hidden', padding: '0 2px',
                      display: 'flex', alignItems: 'center', justifyContent: fd.align === 'center' ? 'center' : fd.align === 'right' ? 'flex-end' : 'flex-start',
                    }}>
                    {fd.type === 'text' ? (fd.variable || '—') : (fd.type === 'signature_preparer' ? '✍ préparateur' : '✍ destinataire')}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Propriétés du champ sélectionné */}
          <div style={{ borderLeft: `1px solid ${C.border}`, overflow: 'auto', padding: 14 }}>
            {!f && <div style={{ fontSize: 13, color: C.slate }}>Sélectionnez un champ pour modifier ses propriétés, ou ajoutez-en un depuis la palette.</div>}
            {f && (
              <div style={{ display: 'grid', gap: 10, fontSize: 13 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}>{f.type === 'text' ? <Type size={15} /> : <PenLine size={15} />} Champ #{sel}</div>
                {f.type === 'text' && (
                  <label>Variable / texte
                    <input value={f.variable || ''} onChange={e => update(sel!, { variable: e.target.value })} style={inp} list="dz-vars" />
                    <datalist id="dz-vars">{VARS.flatMap(g => g.items).filter(it => !it.sig).map(it => <option key={it.v} value={it.v} />)}</datalist>
                  </label>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label>X (pt)<input type="number" value={Math.round(f.x)} onChange={e => update(sel!, { x: +e.target.value })} style={inp} /></label>
                  <label>Y (pt)<input type="number" value={Math.round(f.y)} onChange={e => update(sel!, { y: +e.target.value })} style={inp} /></label>
                </div>
                {f.type === 'text' ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      <label>Taille<input type="number" value={f.font_size || 10} onChange={e => update(sel!, { font_size: +e.target.value })} style={inp} /></label>
                      <label>Largeur<input type="number" value={f.width || 0} onChange={e => update(sel!, { width: +e.target.value || undefined })} style={inp} /></label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignItems: 'end' }}>
                      <label>Alignement
                        <select value={f.align || 'left'} onChange={e => update(sel!, { align: e.target.value as any })} style={inp}>
                          <option value="left">Gauche</option><option value="center">Centré</option><option value="right">Droite</option>
                        </select>
                      </label>
                      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingBottom: 6 }}>
                        <input type="checkbox" checked={!!f.bold} onChange={e => update(sel!, { bold: e.target.checked })} /> Gras
                      </label>
                    </div>
                    {(f.variable || '').includes('{ligne.') && (
                      <label>Hauteur de ligne (répétition)<input type="number" value={f.row_height || 18} onChange={e => update(sel!, { row_height: +e.target.value })} style={inp} /></label>
                    )}
                  </>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label>Largeur<input type="number" value={f.width || 150} onChange={e => update(sel!, { width: +e.target.value })} style={inp} /></label>
                    <label>Hauteur<input type="number" value={f.height || 55} onChange={e => update(sel!, { height: +e.target.value })} style={inp} /></label>
                  </div>
                )}
                {pages.length > 1 && <label>Page<input type="number" min={0} max={pages.length - 1} value={f.page || 0} onChange={e => update(sel!, { page: +e.target.value })} style={inp} /></label>}
                <button onClick={() => { setFields(arr => arr.filter((_, i) => i !== sel)); setSel(null); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: C.red, background: '#fef2f2', border: `1px solid #fecaca`, borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 700, marginTop: 4 }}>
                  <Trash2 size={14} /> Supprimer le champ
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '5px 8px', borderRadius: 6, border: `1px solid ${C.border}`, fontSize: 13, marginTop: 3 };
