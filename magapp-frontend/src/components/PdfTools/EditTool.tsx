import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText, Loader2, Trash2, MousePointer2, Type, Square, Minus, Highlighter, Eraser, Image as ImageIcon, PenLine,
  ChevronLeft, ChevronRight, Move, Check, Bold, Italic, Underline,
} from 'lucide-react';
import PdfToolShell, { btnPrimary, btnSecondary, errorBox, dropzone } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob, postFormForJson } from './pdfToolsApi';

interface EditToolProps { onClose: () => void }

interface EditObject { id: string; kind: 'text' | 'path'; bbox: [number, number, number, number]; text?: string; }
interface PageData { index: number; widthPt: number; heightPt: number; objects: EditObject[]; }
interface Thumb { index: number; dataUrl: string; width: number; height: number }
interface Addition {
  id: string; type: 'text' | 'rect' | 'line' | 'highlight' | 'whiteout' | 'image' | 'freehand';
  page: number; xPct: number; yPct: number; wPct: number; hPct: number;
  text?: string; fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean;
  color?: string; borderColor?: string; borderWidth?: number; thickness?: number; dataUrl?: string;
  points?: { xPct: number; yPct: number }[];
}

type Tool = 'select' | 'text' | 'rect' | 'line' | 'highlight' | 'whiteout' | 'image' | 'eraser';

let seq = 0;
const uid = () => `a${Date.now().toString(36)}${seq++}`;

export default function EditTool({ onClose }: EditToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  const [activePage, setActivePage] = useState(0);
  const [tool, setTool] = useState<Tool>('select');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletions, setDeletions] = useState<Map<number, Set<string>>>(new Map());
  const [moves, setMoves] = useState<Map<string, { dx: number; dy: number }>>(new Map());
  const [textEdits, setTextEdits] = useState<Map<string, string>>(new Map());
  const [additions, setAdditions] = useState<Addition[]>([]);
  const [color, setColor] = useState('#111827');
  const [fontSize, setFontSize] = useState(14);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);

  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(1);
  const dragRef = useRef<any>(null);

  const page = pages[activePage];
  const thumb = thumbs[activePage];

  const recompute = useCallback(() => {
    if (imgRef.current && page && page.widthPt) setScale(imgRef.current.clientWidth / page.widthPt);
  }, [page]);
  useEffect(() => { recompute(); window.addEventListener('resize', recompute); return () => window.removeEventListener('resize', recompute); }, [recompute, activePage, thumbs]);

  const load = async (f: File) => {
    setLoading(true); setError(null); setResult(null);
    try {
      const fd1 = new FormData(); fd1.append('file', f);
      const fd2 = new FormData(); fd2.append('file', f); fd2.append('maxPages', '40');
      const [objs, th] = await Promise.all([
        postFormForJson<{ pages: PageData[] }>('/edit/objects', fd1, "Échec de l'analyse du PDF."),
        postFormForJson<{ pages: Thumb[] }>('/thumbnails', fd2, 'Aperçu indisponible.'),
      ]);
      setPages(objs.pages || []);
      setThumbs(th.pages || []);
      setActivePage(0);
      setSelected(new Set()); setDeletions(new Map()); setMoves(new Map()); setTextEdits(new Map()); setAdditions([]);
    } catch (e: any) { setError(e.message || "Échec de l'analyse."); }
    finally { setLoading(false); }
  };

  // ── Conversions PDF <-> écran ────────────────────────────────────────────
  const ptToPx = (v: number) => v * scale;
  const bboxToStyle = (o: EditObject): React.CSSProperties => {
    const mv = moves.get(o.id) || { dx: 0, dy: 0 };
    const [x0, y0, x1, y1] = o.bbox;
    return {
      left: ptToPx(x0 + mv.dx),
      top: ptToPx(page.heightPt - (y1 + mv.dy)),
      width: Math.max(6, ptToPx(x1 - x0)),
      height: Math.max(6, ptToPx(y1 - y0)),
    };
  };

  const isDeleted = (id: string) => deletions.get(activePage)?.has(id);

  // ── Sélection ────────────────────────────────────────────────────────────
  const selectOnly = (id: string | null) => setSelected(id ? new Set([id]) : new Set());
  const toggleSelect = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const onPagePointerDown = (e: React.PointerEvent) => {
    if (!page) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const xPt = (e.clientX - rect.left) / scale;
    const yPt = page.heightPt - (e.clientY - rect.top) / scale;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;

    if (tool === 'select') {
      dragRef.current = { kind: 'marquee', rect, x0: e.clientX, y0: e.clientY };
      setSelected(new Set());
      return;
    }
    if (tool === 'text') {
      const a: Addition = { id: uid(), type: 'text', page: activePage + 1, xPct, yPct, wPct: 30, hPct: 4, text: 'Texte', fontSize, bold, italic, underline, color };
      setAdditions((prev) => [...prev, a]); setTool('select'); selectOnly(a.id);
      return;
    }
    if (tool === 'image') { /* géré par input dédié */ return; }
    // formes à tracer (rect/line/highlight/whiteout/eraser)
    dragRef.current = { kind: 'draw', tool, rect, startX: xPct, startY: yPct, startClientX: e.clientX, startClientY: e.clientY, points: [{ xPct, yPct }] };
    void xPt; void yPt;
  };

  const onPagePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === 'marquee') {
      const x0 = Math.min(d.x0, e.clientX), y0 = Math.min(d.y0, e.clientY);
      const x1 = Math.max(d.x0, e.clientX), y1 = Math.max(d.y0, e.clientY);
      const ls = x0 - d.rect.left, ts = y0 - d.rect.top, ws = x1 - x0, hs = y1 - y0;
      d.preview = { left: ls, top: ts, width: ws, height: hs };
      // sélection live
      const sel = new Set<string>();
      for (const o of page.objects) {
        if (isDeleted(o.id)) continue;
        const st = bboxToStyle(o);
        const l = parseFloat(String(st.left)), t = parseFloat(String(st.top));
        const w = parseFloat(String(st.width)), h = parseFloat(String(st.height));
        if (l < ls + ws && l + w > ls && t < ts + hs && t + h > ts) sel.add(o.id);
      }
      setSelected(sel);
      setMarquee(d.preview);
      return;
    }
    if (d.kind === 'moveObjects') {
      const rect = d.rect as DOMRect;
      const dx = (e.clientX - d.startClientX) / scale;
      const dy = -(e.clientY - d.startClientY) / scale;
      const next = new Map(moves);
      d.ids.forEach((id: string) => { const o = d.orig.get(id); next.set(id, { dx: o.dx + dx, dy: o.dy + dy }); });
      setMoves(next);
      // déplace aussi les ajouts sélectionnés
      setAdditions((prev) => prev.map((a) => selected.has(a.id) ? { ...a, xPct: (d.addOrig.get(a.id)?.xPct ?? a.xPct) + (e.clientX - d.startClientX) / rect.width * 100, yPct: (d.addOrig.get(a.id)?.yPct ?? a.yPct) + (e.clientY - d.startClientY) / rect.height * 100 } : a));
      return;
    }
    if (d.kind === 'draw') {
      if (d.tool === 'eraser') {
        const rect = d.rect as DOMRect;
        d.points.push({ xPct: ((e.clientX - rect.left) / rect.width) * 100, yPct: ((e.clientY - rect.top) / rect.height) * 100 });
        setDrawing({ ...d });
      } else {
        const rect = d.rect as DOMRect;
        d.endX = ((e.clientX - rect.left) / rect.width) * 100;
        d.endY = ((e.clientY - rect.top) / rect.height) * 100;
        setDrawing({ ...d });
      }
    }
  };

  const onPagePointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setMarquee(null); setDrawing(null);
    if (!d) return;
    if (d.kind === 'draw') {
      if (d.tool === 'eraser') {
        if (d.points.length > 1) setAdditions((prev) => [...prev, { id: uid(), type: 'freehand', page: activePage + 1, xPct: 0, yPct: 0, wPct: 0, hPct: 0, points: d.points, thickness: 8 }]);
      } else {
        const x = Math.min(d.startX, d.endX ?? d.startX), y = Math.min(d.startY, d.endY ?? d.startY);
        const w = Math.abs((d.endX ?? d.startX) - d.startX), h = Math.abs((d.endY ?? d.startY) - d.startY);
        if (w > 0.5 || h > 0.5) {
          const type = d.tool as Addition['type'];
          setAdditions((prev) => [...prev, { id: uid(), type, page: activePage + 1, xPct: x, yPct: y, wPct: w, hPct: h, color: type === 'highlight' ? '#fde047' : type === 'whiteout' ? '#ffffff' : color, thickness: 2, fontSize }]);
        }
      }
      setTool('select');
    }
  };

  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [drawing, setDrawing] = useState<any>(null);

  const startMoveObjects = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (!selected.size) return;
    const rect = (imgRef.current as HTMLElement).getBoundingClientRect();
    const orig = new Map<string, { dx: number; dy: number }>();
    const addOrig = new Map<string, Addition>();
    selected.forEach((id) => { const m = moves.get(id) || { dx: 0, dy: 0 }; orig.set(id, m); });
    additions.forEach((a) => { if (selected.has(a.id)) addOrig.set(a.id, a); });
    dragRef.current = { kind: 'moveObjects', rect, startClientX: e.clientX, startClientY: e.clientY, ids: [...selected], orig, addOrig };
  };

  // ── Suppression / édition texte ─────────────────────────────────────────
  const deleteSelected = () => {
    setDeletions((prev) => {
      const n = new Map(prev); const set = new Set(n.get(activePage) || []);
      page.objects.forEach((o) => { if (selected.has(o.id)) set.add(o.id); });
      n.set(activePage, set); return n;
    });
    setAdditions((prev) => prev.filter((a) => !selected.has(a.id)));
    setSelected(new Set());
  };

  const selectedTextObj = page ? page.objects.find((o) => o.kind === 'text' && selected.has(o.id)) : undefined;

  const addImage = (f: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setAdditions((prev) => [...prev, { id: uid(), type: 'image', page: activePage + 1, xPct: 20, yPct: 20, wPct: 30, hPct: 20, dataUrl: String(reader.result) }]);
    reader.readAsDataURL(f);
    setTool('select');
  };

  const apply = async () => {
    if (!file) return;
    const pagesPlan: any[] = [];
    const touched = new Set<number>();
    deletions.forEach((set, idx) => { if (set.size) touched.add(idx); });
    moves.forEach((_, id) => { if (id.startsWith('p')) touched.add(parseInt(id.split(':')[0].slice(1), 10)); });
    textEdits.forEach((_, id) => { if (id.startsWith('p')) touched.add(parseInt(id.split(':')[0].slice(1), 10)); });
    touched.forEach((idx) => {
      pagesPlan.push({
        index: idx,
        deletions: [...(deletions.get(idx) || [])],
        moves: [...moves.entries()].filter(([id]) => id.startsWith(`p${idx}:`)).map(([id, m]) => ({ id, ...m })),
        textEdits: [...textEdits.entries()].filter(([id]) => id.startsWith(`p${idx}:`)).map(([id, text]) => ({ id, text })),
      });
    });
    if (!pagesPlan.length && !additions.length) { setError('Aucune modification à appliquer.'); return; }
    setApplying(true); setError(null); setResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      fd.append('plan', JSON.stringify({ pages: pagesPlan, additions: additions.map(({ id, ...rest }) => rest) }));
      const { blob, filename } = await postFormForBlob('/edit/apply', fd, "Échec de l'application des modifications.");
      setResult({ blob, filename });
    } catch (e: any) { setError(e.message || "Échec de l'application."); }
    finally { setApplying(false); }
  };

  const tools: { key: Tool; icon: React.ReactNode; label: string }[] = [
    { key: 'select', icon: <MousePointer2 size={15} />, label: 'Sélection' },
    { key: 'text', icon: <Type size={15} />, label: 'Texte' },
    { key: 'rect', icon: <Square size={15} />, label: 'Rectangle' },
    { key: 'line', icon: <Minus size={15} />, label: 'Ligne' },
    { key: 'highlight', icon: <Highlighter size={15} />, label: 'Surligner' },
    { key: 'whiteout', icon: <Square size={15} />, label: 'Blanc' },
    { key: 'eraser', icon: <Eraser size={15} />, label: 'Gomme' },
  ];

  return (
    <PdfToolShell
      icon={<PenLine size={26} color="#0369a1" />}
      iconBg="#dbeafe"
      title="Modifier un PDF"
      description="Sélectionnez et supprimez/déplacez les textes et objets existants, éditez le texte, ajoutez formes et annotations."
      onClose={onClose}
      maxWidth={1180}
    >
      <label style={{ ...dropzone, padding: '16px' }}>
        <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f) load(f); }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700, color: '#334155' }}>
          <FileText size={18} color="#ef4444" /> {file ? file.name : 'Choisir un PDF à modifier'}
        </div>
      </label>

      {loading && <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: '0.85rem' }}><Loader2 size={16} className="animate-spin" /> Analyse des objets du PDF…</div>}
      {error && <div style={errorBox}>{error}</div>}

      {page && thumb && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '150px minmax(0,1fr) 220px', gap: 14, alignItems: 'start' }}>
          {/* Barre d'outils */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Outils</div>
            {tools.map((t) => (
              <button key={t.key} onClick={() => setTool(t.key)} style={toolBtn(tool === t.key)}>{t.icon} {t.label}</button>
            ))}
            <label style={{ ...toolBtn(false), cursor: 'pointer' }}><ImageIcon size={15} /> Image<input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => addImage(e.target.files?.[0] || null)} /></label>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button style={{ ...toolBtn(false), flex: 1, justifyContent: 'center' }} onClick={deleteSelected} disabled={!selected.size}><Trash2 size={14} /> Suppr.</button>
            </div>
          </div>

          {/* Page */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Page {activePage + 1} / {pages.length}</span>
              {pages.length > 1 && (<>
                <button style={miniBtn} disabled={activePage === 0} onClick={() => { setActivePage((p) => p - 1); setSelected(new Set()); }}><ChevronLeft size={14} /></button>
                <button style={miniBtn} disabled={activePage >= pages.length - 1} onClick={() => { setActivePage((p) => p + 1); setSelected(new Set()); }}><ChevronRight size={14} /></button>
              </>)}
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#94a3b8' }}>{page.objects.length} objet(s) · {selected.size} sélectionné(s)</span>
            </div>
            <div className="edit-scroll" style={{ maxHeight: '62vh', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#e2e8f0', padding: 8 }}>
              <div
                style={{ position: 'relative', width: '100%', userSelect: 'none', touchAction: 'none' }}
                onPointerMove={onPagePointerMove}
                onPointerUp={onPagePointerUp}
                onPointerLeave={onPagePointerUp}
              >
                <img ref={imgRef} src={thumb.dataUrl} alt={`Page ${activePage + 1}`} onLoad={recompute} draggable={false} style={{ display: 'block', width: '100%', background: '#fff', borderRadius: 4 }} />
                <div style={{ position: 'absolute', inset: 0 }} onPointerDown={onPagePointerDown} />

                {/* Objets existants */}
                {page.objects.map((o) => {
                  if (isDeleted(o.id)) return null;
                  const st = bboxToStyle(o);
                  const on = selected.has(o.id);
                  return (
                    <div key={o.id}
                      onPointerDown={(e) => { if (tool !== 'select') return; e.stopPropagation(); if (!selected.has(o.id)) selectOnly(o.id); startMoveObjects(e); }}
                      onClick={(e) => { if (tool === 'select') { e.stopPropagation(); toggleSelect(o.id); } }}
                      title={o.kind === 'text' ? o.text : 'objet vectoriel'}
                      style={{ position: 'absolute', ...st, border: `1.5px ${on ? 'solid' : 'dashed'} ${on ? '#0284c7' : 'rgba(56,189,248,.55)'}`, background: on ? 'rgba(2,132,199,.10)' : 'transparent', cursor: 'move', borderRadius: 2 }} />
                  );
                })}

                {/* Ajouts */}
                {additions.filter((a) => a.page === activePage + 1).map((a) => (
                  <div key={a.id}
                    onPointerDown={(e) => { e.stopPropagation(); if (tool !== 'select') return; selectOnly(a.id); startMoveObjects(e); }}
                    style={{
                      position: 'absolute', left: `${a.xPct}%`, top: `${a.yPct}%`,
                      ...(a.type === 'text' ? {} : { width: `${a.wPct}%`, height: `${a.hPct}%` }),
                      outline: selected.has(a.id) ? '1.5px solid #0284c7' : '1px dashed rgba(2,132,199,.5)', cursor: 'move',
                      background: a.type === 'rect' ? a.color : a.type === 'highlight' ? 'rgba(253,224,71,.4)' : a.type === 'whiteout' ? '#fff' : 'transparent',
                    }}>
                    {a.type === 'text' && (
                      <div style={{ fontSize: (a.fontSize || 12) * scale, fontWeight: a.bold ? 700 : 400, fontStyle: a.italic ? 'italic' : 'normal', textDecoration: a.underline ? 'underline' : 'none', color: a.color, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{a.text}</div>
                    )}
                    {a.type === 'image' && a.dataUrl && <img src={a.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />}
                  </div>
                ))}

                {/* Tracés (lignes / gomme) */}
                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {additions.filter((a) => a.page === activePage + 1 && (a.type === 'line' || a.type === 'freehand')).map((a) => (
                    a.type === 'line'
                      ? <line key={a.id} x1={`${a.xPct}%`} y1={`${a.yPct}%`} x2={`${a.xPct + a.wPct}%`} y2={`${a.yPct + a.hPct}%`} stroke={a.color} strokeWidth={a.thickness || 2} />
                      : <polyline key={a.id} points={(a.points || []).map((p) => `${p.xPct}%,${p.yPct}%`).join(' ')} fill="none" stroke="#ffffff" strokeWidth={a.thickness || 8} strokeLinecap="round" strokeLinejoin="round" />
                  ))}
                </svg>

                {marquee && <div style={{ position: 'absolute', left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height, border: '1px solid #0284c7', background: 'rgba(2,132,199,.15)', pointerEvents: 'none' }} />}
                {drawing && drawing.kind === 'draw' && drawing.tool !== 'eraser' && (
                  <div style={{ position: 'absolute', left: `${Math.min(drawing.startX, drawing.endX ?? drawing.startX)}%`, top: `${Math.min(drawing.startY, drawing.endY ?? drawing.startY)}%`, width: `${Math.abs((drawing.endX ?? drawing.startX) - drawing.startX)}%`, height: `${Math.abs((drawing.endY ?? drawing.startY) - drawing.startY)}%`, border: '1px dashed #0284c7', background: 'rgba(2,132,199,.1)', pointerEvents: 'none' }} />
                )}
              </div>
            </div>
          </div>

          {/* Propriétés */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Propriétés</div>
            {selectedTextObj ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Texte sélectionné :</div>
                <textarea rows={3} value={textEdits.get(selectedTextObj.id) ?? selectedTextObj.text ?? ''}
                  onChange={(e) => setTextEdits((prev) => new Map(prev).set(selectedTextObj.id, e.target.value))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>L'édition du texte fonctionne surtout avec les polices standard.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={lbl}>Couleur<input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 40, height: 28, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff' }} /></label>
                <label style={lbl}>Taille texte<input type="number" min={6} max={72} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value) || 12)} style={numInput} /></label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={toggle(bold)} onClick={() => setBold((v) => !v)}><Bold size={14} /></button>
                  <button style={toggle(italic)} onClick={() => setItalic((v) => !v)}><Italic size={14} /></button>
                  <button style={toggle(underline)} onClick={() => setUnderline((v) => !v)}><Underline size={14} /></button>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Move size={12} /> Glissez un objet sélectionné pour le déplacer.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {page && (
        <div style={{ marginTop: 18, borderTop: '1px solid #f1f5f9', paddingTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            {[...deletions.values()].reduce((s, x) => s + x.size, 0)} suppression(s) · {moves.size} déplacement(s) · {textEdits.size} texte(s) · {additions.length} ajout(s)
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button style={btnSecondary} onClick={onClose}>Fermer</button>
            <button style={btnPrimary} disabled={applying} onClick={apply}>
              {applying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {applying ? 'Application…' : 'Appliquer et générer le PDF'}
            </button>
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
