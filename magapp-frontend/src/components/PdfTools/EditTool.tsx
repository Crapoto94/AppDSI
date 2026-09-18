import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText, Loader2, Trash2, MousePointer2, Type, Minus, Square, Eraser, Image as ImageIcon, PenLine,
  ChevronLeft, ChevronRight, Check, Bold, Italic, Underline, Move, BoxSelect, Layers,
} from 'lucide-react';
import PdfToolShell, { btnPrimary, btnSecondary, errorBox, dropzone } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob, postFormForJson } from './pdfToolsApi';

interface EditToolProps { onClose: () => void }

interface Addition {
  id: string; type: 'text' | 'rect' | 'line' | 'whiteout' | 'freehand' | 'image' | 'polygon';
  page: number; xPct: number; yPct: number; wPct: number; hPct: number;
  text?: string; fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean;
  color?: string; thickness?: number; dataUrl?: string;
  points?: { xPct: number; yPct: number }[];
}
type Tool = 'select' | 'text' | 'rect' | 'line' | 'whiteout' | 'polygon' | 'eraser' | 'image';

let seq = 0;
const uid = () => `a${Date.now().toString(36)}${seq++}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Éditeur NON destructif : on ne touche jamais au contenu d'origine — on
 *  superpose des masques (rectangles/polygones), la gomme, du texte, des lignes
 *  et des images. Les données initiales restent intactes. */
export default function EditTool({ onClose }: EditToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(0);
  const [tool, setTool] = useState<Tool>('select');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [color, setColor] = useState('#dc2626');
  const [fontSize, setFontSize] = useState(14);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);

  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [polyDraft, setPolyDraft] = useState<{ xPct: number; yPct: number }[]>([]);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const dragRef = useRef<any>(null);

  const recompute = useCallback(() => {
    const el = canvasRef.current;
    if (el) setScale(el.clientWidth / 595.28); // largeur de référence (les additions sont en %)
  }, []);
  useEffect(() => { recompute(); window.addEventListener('resize', recompute); return () => window.removeEventListener('resize', recompute); }, [recompute, thumbs, activePage]);

  const loadThumb = useCallback(async (f: File, idx: number) => {
    setThumbLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f); fd.append('scale', '2'); fd.append('page', String(idx + 1));
      const data = await postFormForJson<{ pageCount: number; pages: { dataUrl: string }[] }>('/thumbnails', fd, 'Aperçu indisponible.');
      setPageCount(data.pageCount || 1);
      const url = data.pages[0]?.dataUrl;
      if (url) setThumbs((prev) => ({ ...prev, [idx]: url }));
    } catch { /* ignore */ } finally { setThumbLoading(false); }
  }, []);

  const load = async (f: File) => {
    setLoading(true); setError(null); setResult(null);
    try {
      const fd = new FormData(); fd.append('file', f); fd.append('scale', '2'); fd.append('page', '1');
      const data = await postFormForJson<{ pageCount: number; pages: { dataUrl: string }[] }>('/thumbnails', fd, 'Aperçu indisponible.');
      setPageCount(data.pageCount || 1);
      setThumbs({ 0: data.pages[0]?.dataUrl || '' });
      setActivePage(0); setAdditions([]); setSelected(new Set()); setPolyDraft([]);
    } catch (e: any) { setError(e.message || "Échec du chargement."); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (file && !thumbs[activePage]) loadThumb(file, activePage); /* eslint-disable-next-line */ }, [file, activePage]);

  const pctFromEvent = (e: React.PointerEvent | React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      xPct: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100),
      yPct: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100),
      rect,
    };
  };

  // ── Ajout d'objets ────────────────────────────────────────────────────────
  const onCanvasDown = (e: React.PointerEvent) => {
    const { xPct, yPct, rect } = pctFromEvent(e);
    if (e.button === 2) {
      dragRef.current = { kind: 'marquee', rect, x0: e.clientX, y0: e.clientY };
      setSelected(new Set()); setMarquee(null);
      e.preventDefault();
      return;
    }
    if (tool === 'select') { setSelected(new Set()); return; }
    if (tool === 'text') {
      const a: Addition = { id: uid(), type: 'text', page: activePage + 1, xPct, yPct, wPct: 25, hPct: 4, text: 'Texte', fontSize, bold, italic, underline, color };
      setAdditions((prev) => [...prev, a]); setTool('select'); setSelected(new Set([a.id]));
      return;
    }
    if (tool === 'polygon') {
      // Clic près du 1er point et ≥ 3 points → ferme le polygone.
      if (polyDraft.length >= 3) {
        const first = polyDraft[0];
        const dx = Math.abs(first.xPct - xPct) * rect.width / 100;
        const dy = Math.abs(first.yPct - yPct) * rect.height / 100;
        if (dx < 10 && dy < 10) { finalizePolygon(); return; }
      }
      setPolyDraft((prev) => [...prev, { xPct, yPct }]);
      return;
    }
    dragRef.current = { kind: 'draw', tool, rect, startX: e.clientX, startY: e.clientY, startPctX: xPct, startPctY: yPct, points: [{ xPct, yPct }] };
  };

  const onCanvasMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === 'marquee') {
      const left = Math.min(d.x0, e.clientX) - d.rect.left;
      const top = Math.min(d.y0, e.clientY) - d.rect.top;
      const width = Math.abs(e.clientX - d.x0), height = Math.abs(e.clientY - d.y0);
      setMarquee({ left, top, width, height });
      const sel = new Set<string>();
      for (const a of additions.filter((x) => x.page === activePage + 1)) {
        const l = (a.xPct / 100) * d.rect.width, t = (a.yPct / 100) * d.rect.height;
        const w = a.type === 'text' ? 60 : (a.wPct / 100) * d.rect.width, h = (a.hPct / 100) * d.rect.height || 16;
        if (l < left + width && l + w > left && t < top + height && t + h > top) sel.add(a.id);
      }
      setSelected(sel);
      return;
    }
    if (d.kind === 'move') {
      setAdditions((prev) => prev.map((a) => {
        const o = d.objs.find((x: any) => x.id === a.id);
        if (!o) return a;
        return { ...a, xPct: clamp(o.xPct + ((e.clientX - d.startClientX) / d.rect.width) * 100, 0, 100), yPct: clamp(o.yPct + ((e.clientY - d.startClientY) / d.rect.height) * 100, 0, 100) };
      }));
      return;
    }
    if (d.kind === 'draw') {
      const { xPct, yPct, rect } = pctFromEvent(e);
      if (d.tool === 'eraser') d.points.push({ xPct, yPct });
      else { d.endX = e.clientX; d.endY = e.clientY; }
      void rect;
      setDraft({ ...d });
    }
  };

  const onCanvasUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setMarquee(null); setDraft(null);
    if (!d || d.kind !== 'draw') return;
    const rect = d.rect as DOMRect;
    if (d.tool === 'eraser') {
      if (d.points.length > 1) setAdditions((prev) => [...prev, { id: uid(), type: 'freehand', page: activePage + 1, xPct: 0, yPct: 0, wPct: 0, hPct: 0, points: d.points, thickness: 10 }]);
      setTool('select'); return;
    }
    const x1 = (Math.min(d.startX, d.endX ?? d.startX) - rect.left) / rect.width * 100;
    const y1 = (Math.min(d.startY, d.endY ?? d.startY) - rect.top) / rect.height * 100;
    const w = Math.abs((d.endX ?? d.startX) - d.startX) / rect.width * 100;
    const h = Math.abs((d.endY ?? d.startY) - d.startY) / rect.height * 100;
    if (w > 0.4 || h > 0.4) {
      const type = d.tool as Addition['type'];
      const fill = type === 'whiteout' ? '#ffffff' : color;
      setAdditions((prev) => [...prev, { id: uid(), type, page: activePage + 1, xPct: x1, yPct: y1, wPct: w, hPct: h, color: fill, thickness: 2 }]);
    }
    setTool('select');
  };

  const finalizePolygon = () => {
    if (polyDraft.length < 3) { setPolyDraft([]); return; }
    const xs = polyDraft.map((p) => p.xPct), ys = polyDraft.map((p) => p.yPct);
    setAdditions((prev) => [...prev, {
      id: uid(), type: 'polygon', page: activePage + 1,
      xPct: Math.min(...xs), yPct: Math.min(...ys), wPct: Math.max(...xs) - Math.min(...xs), hPct: Math.max(...ys) - Math.min(...ys),
      points: polyDraft.map((p) => ({ ...p })), color: '#ffffff',
    }]);
    setPolyDraft([]); setTool('select');
  };

  const startMove = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const rect = canvasRef.current!.getBoundingClientRect();
    if (!selected.has(id)) setSelected(new Set([id]));
    const ids = selected.has(id) ? selected : new Set([id]);
    const objs: any[] = [];
    additions.forEach((a) => { if (ids.has(a.id)) objs.push({ id: a.id, xPct: a.xPct, yPct: a.yPct }); });
    dragRef.current = { kind: 'move', rect, startClientX: e.clientX, startClientY: e.clientY, objs };
  };

  const deleteSelected = () => { setAdditions((prev) => prev.filter((a) => !selected.has(a.id))); setSelected(new Set()); };

  const addImage = (f: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setAdditions((prev) => [...prev, { id: uid(), type: 'image', page: activePage + 1, xPct: 20, yPct: 20, wPct: 30, hPct: 20, dataUrl: String(reader.result) }]);
    reader.readAsDataURL(f);
    setTool('select');
  };

  const apply = async () => {
    if (!file) return;
    if (!additions.length) { setError('Ajoutez au moins un masque ou une annotation.'); return; }
    setApplying(true); setError(null); setResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      fd.append('plan', JSON.stringify({ pages: [], additions: additions.map(({ id, ...rest }) => rest) }));
      const { blob, filename } = await postFormForBlob('/edit/apply', fd, "Échec de la génération du PDF.");
      setResult({ blob, filename });
    } catch (e: any) { setError(e.message || "Échec de la génération."); } finally { setApplying(false); }
  };

  const tools: { key: Tool; icon: React.ReactNode; label: string; hint?: string }[] = [
    { key: 'whiteout', icon: <Square size={15} />, label: 'Masque (rectangle)' },
    { key: 'polygon', icon: <Layers size={15} />, label: 'Masque (polygone)' },
    { key: 'eraser', icon: <Eraser size={15} />, label: 'Gomme' },
    { key: 'text', icon: <Type size={15} />, label: 'Texte' },
    { key: 'line', icon: <Minus size={15} />, label: 'Ligne' },
    { key: 'rect', icon: <Square size={15} />, label: 'Rectangle couleur' },
    { key: 'select', icon: <MousePointer2 size={15} />, label: 'Sélection' },
  ];

  return (
    <PdfToolShell
      icon={<PenLine size={26} color="#0369a1" />}
      iconBg="#dbeafe"
      title="Annoter / masquer un PDF"
      description="Masquez des zones (rectangle ou polygone), gommez, ajoutez texte, lignes, images — sans jamais modifier le contenu d'origine."
      onClose={onClose}
      maxWidth={1200}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, color: '#1e3a8a', fontSize: '0.78rem', marginBottom: 12 }}>
        <Check size={14} style={{ flexShrink: 0 }} /> Éditeur non destructif : le document d'origine n'est pas modifié, vos masques et annotations sont ajoutés par-dessus.
      </div>

      <label style={{ ...dropzone, padding: '14px' }}>
        <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f) load(f); }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700, color: '#334155' }}>
          <FileText size={18} color="#ef4444" /> {file ? file.name : 'Choisir un PDF'}
        </div>
      </label>

      {loading && <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: '0.85rem' }}><Loader2 size={16} className="animate-spin" /> Chargement…</div>}
      {error && <div style={errorBox}>{error}</div>}

      {file && pageCount > 0 && (
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '176px minmax(0,1fr) 220px', gap: 14, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Outils</div>
            {tools.map((t) => <button key={t.key} onClick={() => { setTool(t.key); setPolyDraft([]); }} style={toolBtn(tool === t.key)}>{t.icon} {t.label}</button>)}
            <label style={{ ...toolBtn(false), cursor: 'pointer' }}><ImageIcon size={15} /> Image / photo<input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => addImage(e.target.files?.[0] || null)} /></label>
            {tool === 'polygon' && (
              <button style={{ ...toolBtn(false), justifyContent: 'center' }} onClick={finalizePolygon} disabled={polyDraft.length < 3}>
                <Check size={14} /> Terminer le polygone ({polyDraft.length})
              </button>
            )}
            <button style={{ ...toolBtn(false), justifyContent: 'center' }} onClick={deleteSelected} disabled={!selected.size}><Trash2 size={14} /> Supprimer</button>
            <div style={{ marginTop: 6, fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.5 }}>
              <Move size={12} style={{ verticalAlign: -2 }} /> Clic gauche : dessiner/sélectionner<br />
              <BoxSelect size={12} style={{ verticalAlign: -2 }} /> Clic droit : sélection par fenêtre
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Page {activePage + 1} / {pageCount}</span>
              {pageCount > 1 && (<>
                <button style={miniBtn} disabled={activePage === 0} onClick={() => { setActivePage((p) => p - 1); setSelected(new Set()); setPolyDraft([]); }}><ChevronLeft size={14} /></button>
                <button style={miniBtn} disabled={activePage >= pageCount - 1} onClick={() => { setActivePage((p) => p + 1); setSelected(new Set()); setPolyDraft([]); }}><ChevronRight size={14} /></button>
              </>)}
              {thumbLoading && <Loader2 size={14} className="animate-spin" color="#94a3b8" />}
              {tool === 'polygon' && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#0369a1', fontWeight: 700 }}>Cliquez pour poser les sommets, puis « Terminer ».</span>}
            </div>
            <div className="edit-scroll" style={{ maxHeight: '64vh', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#e2e8f0', padding: 8 }}>
              <div ref={canvasRef}
                onPointerDown={onCanvasDown}
                onPointerMove={onCanvasMove}
                onPointerUp={onCanvasUp}
                onPointerLeave={onCanvasUp}
                onDoubleClick={() => { if (tool === 'polygon') finalizePolygon(); }}
                onContextMenu={(e) => e.preventDefault()}
                style={{ position: 'relative', width: '100%', userSelect: 'none', touchAction: 'none', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.15)' }}>
                {thumbs[activePage]
                  ? <img src={thumbs[activePage]} alt={`Page ${activePage + 1}`} draggable={false} style={{ display: 'block', width: '100%' }} />
                  : <div style={{ height: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Aperçu…</div>}

                {/* Ajouts (masques + annotations) */}
                {additions.filter((a) => a.page === activePage + 1 && a.type !== 'polygon').map((a) => {
                  const on = selected.has(a.id);
                  return (
                    <div key={a.id}
                      onPointerDown={(e) => startMove(e, a.id)}
                      style={{
                        position: 'absolute', left: `${a.xPct}%`, top: `${a.yPct}%`,
                        ...(a.type === 'text' ? {} : { width: `${a.wPct}%`, height: `${a.hPct}%` }),
                        outline: on ? '2px solid #0369a1' : 'none',
                        background: a.type === 'rect' ? a.color : a.type === 'whiteout' ? '#fff' : 'transparent',
                        cursor: 'move',
                      }}>
                      {a.type === 'text' && <div style={{ fontSize: (a.fontSize || 14) * scale, fontWeight: a.bold ? 700 : 400, fontStyle: a.italic ? 'italic' : 'normal', textDecoration: a.underline ? 'underline' : 'none', color: a.color, whiteSpace: 'nowrap', pointerEvents: 'none', lineHeight: 1 }}>{a.text}</div>}
                      {a.type === 'image' && a.dataUrl && <img src={a.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />}
                    </div>
                  );
                })}

                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {additions.filter((a) => a.page === activePage + 1 && (a.type === 'line' || a.type === 'freehand')).map((a) => (
                    a.type === 'line'
                      ? <line key={a.id} x1={`${a.xPct}%`} y1={`${a.yPct}%`} x2={`${a.xPct + a.wPct}%`} y2={`${a.yPct + a.hPct}%`} stroke={a.color} strokeWidth={a.thickness || 2} />
                      : <polyline key={a.id} points={(a.points || []).map((p) => `${p.xPct}%,${p.yPct}%`).join(' ')} fill="none" stroke="#ffffff" strokeWidth={a.thickness || 10} strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                  {additions.filter((a) => a.page === activePage + 1 && a.type === 'polygon').map((a) => (
                    <polygon key={a.id} points={(a.points || []).map((p) => `${p.xPct}%,${p.yPct}%`).join(' ')} fill="#ffffff" stroke={selected.has(a.id) ? '#0369a1' : 'none'} strokeWidth={2} />
                  ))}
                  {polyDraft.length > 0 && (
                    <>
                      <polyline points={polyDraft.map((p) => `${p.xPct}%,${p.yPct}%`).join(' ')} fill="rgba(3,105,161,.12)" stroke="#0369a1" strokeWidth={1.5} strokeDasharray="4 3" />
                      {polyDraft.map((p, i) => <circle key={i} cx={`${p.xPct}%`} cy={`${p.yPct}%`} r={3} fill="#0369a1" />)}
                    </>
                  )}
                </svg>

                {marquee && <div style={{ position: 'absolute', left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height, border: '1px dashed #0369a1', background: 'rgba(3,105,161,.12)', pointerEvents: 'none' }} />}
                {draft && draft.kind === 'draw' && draft.tool !== 'eraser' && (() => {
                  const r = draft.rect as DOMRect;
                  const l = Math.min(draft.startX, draft.endX ?? draft.startX) - r.left;
                  const t = Math.min(draft.startY, draft.endY ?? draft.startY) - r.top;
                  return <div style={{ position: 'absolute', left: l, top: t, width: Math.abs((draft.endX ?? draft.startX) - draft.startX), height: Math.abs((draft.endY ?? draft.startY) - draft.startY), border: '1px dashed #0369a1', background: 'rgba(3,105,161,.1)', pointerEvents: 'none' }} />;
                })()}
              </div>
            </div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Options</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={lbl}>Couleur (texte / ligne / rectangle)<input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 40, height: 28, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff' }} /></label>
              <label style={lbl}>Taille texte<input type="number" min={6} max={72} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value) || 14)} style={numInput} /></label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={toggle(bold)} onClick={() => setBold((v) => !v)}><Bold size={14} /></button>
                <button style={toggle(italic)} onClick={() => setItalic((v) => !v)}><Italic size={14} /></button>
                <button style={toggle(underline)} onClick={() => setUnderline((v) => !v)}><Underline size={14} /></button>
              </div>
              <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Le masque (rectangle/polygone) est posé en blanc. Cliquez un objet ajouté puis glissez-le pour le déplacer.</div>
            </div>
          </div>
        </div>
      )}

      {file && pageCount > 0 && (
        <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{additions.length} masque(s) / annotation(s)</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button style={btnSecondary} onClick={onClose}>Fermer</button>
            <button style={btnPrimary} disabled={applying} onClick={apply}>{applying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {applying ? 'Génération…' : 'Générer le PDF'}</button>
          </div>
        </div>
      )}

      {result && <ResultActions blob={result.blob} filename={result.filename} />}

      <style>{`
        .edit-scroll { scrollbar-width: thin; scrollbar-color: #94a3b8 #e2e8f0; }
        .edit-scroll::-webkit-scrollbar { width: 12px; }
        .edit-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 10px; border: 2px solid #eef2f7; }
      `}</style>
    </PdfToolShell>
  );
}

const toolBtn = (active: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${active ? '#0369a1' : '#e2e8f0'}`, background: active ? '#dbeafe' : '#fff', color: active ? '#0369a1' : '#475569', fontWeight: 700, fontSize: '0.78rem' });
const miniBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 7, padding: 4, cursor: 'pointer', color: '#475569' };
const lbl: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 };
const numInput: React.CSSProperties = { width: 70, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.82rem' };
const toggle = (active: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, cursor: 'pointer', border: `1px solid ${active ? '#0369a1' : '#e2e8f0'}`, background: active ? '#dbeafe' : '#fff', color: active ? '#0369a1' : '#475569', fontWeight: 700 });
