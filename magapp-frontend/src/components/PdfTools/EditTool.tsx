import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FileText, Loader2, Trash2, MousePointer2, Type, Square, Minus, Highlighter, Eraser, Image as ImageIcon, PenLine,
  ChevronLeft, ChevronRight, Check, Bold, Italic, Underline, Move, BoxSelect,
} from 'lucide-react';
import PdfToolShell, { btnPrimary, btnSecondary, errorBox, dropzone } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob, postFormForJson } from './pdfToolsApi';

interface EditToolProps { onClose: () => void }

interface EditObject { id: string; kind: 'text' | 'path'; bbox: [number, number, number, number]; text?: string; fontSize?: number; }
interface PageData { index: number; widthPt: number; heightPt: number; objects: EditObject[] }
interface Addition {
  id: string; type: 'text' | 'rect' | 'line' | 'highlight' | 'whiteout' | 'image' | 'freehand';
  page: number; xPct: number; yPct: number; wPct: number; hPct: number;
  text?: string; fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean;
  color?: string; thickness?: number; dataUrl?: string;
  points?: { xPct: number; yPct: number }[];
}
type Tool = 'select' | 'text' | 'rect' | 'line' | 'highlight' | 'whiteout' | 'image' | 'eraser';

let seq = 0;
const uid = () => `a${Date.now().toString(36)}${seq++}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export default function EditTool({ onClose }: EditToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageData[]>([]);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [thumbLoading, setThumbLoading] = useState(false);
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

  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [viewMode, setViewMode] = useState<'objets' | 'document'>('objets');
  const dragRef = useRef<any>(null);

  const page = pages[activePage];
  const pageThumb = thumbs[activePage];

  const recompute = useCallback(() => {
    const el = canvasRef.current;
    if (el && page && page.widthPt) setScale(el.clientWidth / page.widthPt);
  }, [page]);
  useEffect(() => {
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, [recompute, pageThumb, viewMode, activePage]);

  const loadThumb = useCallback(async (f: File, idx: number) => {
    setThumbLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', f); fd.append('scale', '2'); fd.append('page', String(idx + 1));
      const data = await postFormForJson<{ pages: { dataUrl: string }[] }>('/thumbnails', fd, 'Aperçu indisponible.');
      const url = data.pages[0]?.dataUrl;
      if (url) setThumbs((prev) => ({ ...prev, [idx]: url }));
    } catch { /* ignore */ } finally { setThumbLoading(false); }
  }, []);

  useEffect(() => { if (file && !thumbs[activePage]) loadThumb(file, activePage); /* eslint-disable-next-line */ }, [file, activePage]);

  const load = async (f: File) => {
    setLoading(true); setError(null); setResult(null);
    try {
      const fd = new FormData(); fd.append('file', f);
      const objs = await postFormForJson<{ pages: PageData[] }>('/edit/objects', fd, "Échec de l'analyse du PDF.");
      setPages(objs.pages || []);
      setThumbs({}); setActivePage(0);
      setSelected(new Set()); setDeletions(new Map()); setMoves(new Map()); setTextEdits(new Map()); setAdditions([]);
    } catch (e: any) { setError(e.message || "Échec de l'analyse."); }
    finally { setLoading(false); }
  };

  // ── Conversions ───────────────────────────────────────────────────────────
  const bboxToPx = (o: EditObject) => {
    const mv = moves.get(o.id) || { dx: 0, dy: 0 };
    const [x0, y0, x1, y1] = o.bbox;
    return {
      left: (x0 + mv.dx) * scale,
      top: (page.heightPt - (y1 + mv.dy)) * scale,
      width: Math.max(6, (x1 - x0) * scale),
      height: Math.max(6, (y1 - y0) * scale),
    };
  };
  const isDeleted = (id: string) => deletions.get(activePage)?.has(id) || false;

  // ── Sélection ─────────────────────────────────────────────────────────────
  const selectOnly = (id: string | null) => setSelected(id ? new Set([id]) : new Set());
  const toggleSelect = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const onCanvasDown = (e: React.PointerEvent) => {
    if (!page) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    if (e.button === 2) {
      // Bouton DROIT : sélection par fenêtre (marquee).
      dragRef.current = { kind: 'marquee', rect, x0: e.clientX, y0: e.clientY };
      setSelected(new Set()); setMarquee(null);
      e.preventDefault();
      return;
    }
    if (tool === 'select') { setSelected(new Set()); return; }
    const xPct = clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100);
    const yPct = clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100);
    if (tool === 'text') {
      const a: Addition = { id: uid(), type: 'text', page: activePage + 1, xPct, yPct, wPct: 25, hPct: 4, text: 'Texte', fontSize, bold, italic, underline, color };
      setAdditions((prev) => [...prev, a]); setTool('select'); selectOnly(a.id);
      return;
    }
    dragRef.current = { kind: 'draw', tool, rect, startX: e.clientX, startY: e.clientY, startPctX: xPct, startPctY: yPct, points: [{ xPct, yPct }] };
  };

  const onCanvasMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !page) return;
    if (d.kind === 'marquee') {
      const left = Math.min(d.x0, e.clientX) - d.rect.left;
      const top = Math.min(d.y0, e.clientY) - d.rect.top;
      const width = Math.abs(e.clientX - d.x0);
      const height = Math.abs(e.clientY - d.y0);
      setMarquee({ left, top, width, height });
      const sel = new Set<string>();
      for (const o of page.objects) {
        if (isDeleted(o.id)) continue;
        const b = bboxToPx(o);
        if (b.left < left + width && b.left + b.width > left && b.top < top + height && b.top + b.height > top) sel.add(o.id);
      }
      for (const a of additions.filter((x) => x.page === activePage + 1)) {
        const l = (a.xPct / 100) * d.rect.width, t = (a.yPct / 100) * d.rect.height;
        const w = (a.wPct / 100) * d.rect.width, h = (a.hPct / 100) * d.rect.height;
        if (l < left + width && l + w > left && t < top + height && t + h > top) sel.add(a.id);
      }
      setSelected(sel);
      return;
    }
    if (d.kind === 'move') {
      const dx = (e.clientX - d.startClientX) / scale;
      const dy = -(e.clientY - d.startClientY) / scale;
      setMoves((prev) => { const n = new Map(prev); d.objs.forEach((o: any) => { if (o.isExisting) n.set(o.id, { dx: o.dx + dx, dy: o.dy + dy }); }); return n; });
      setAdditions((prev) => prev.map((a) => {
        const o = d.objs.find((x: any) => x.id === a.id);
        if (!o || o.isExisting) return a;
        return { ...a, xPct: clamp(o.xPct + ((e.clientX - d.startClientX) / d.rect.width) * 100, 0, 99), yPct: clamp(o.yPct + ((e.clientY - d.startClientY) / d.rect.height) * 100, 0, 99) };
      }));
      return;
    }
    if (d.kind === 'draw') {
      const rect = d.rect as DOMRect;
      if (d.tool === 'eraser') {
        d.points.push({ xPct: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100), yPct: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100) });
      } else {
        d.endX = e.clientX; d.endY = e.clientY;
      }
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
      if (d.points.length > 1) setAdditions((prev) => [...prev, { id: uid(), type: 'freehand', page: activePage + 1, xPct: 0, yPct: 0, wPct: 0, hPct: 0, points: d.points, thickness: 8 }]);
      setTool('select');
      return;
    }
    const x1 = (Math.min(d.startX, d.endX ?? d.startX) - rect.left) / rect.width * 100;
    const y1 = (Math.min(d.startY, d.endY ?? d.startY) - rect.top) / rect.height * 100;
    const w = Math.abs((d.endX ?? d.startX) - d.startX) / rect.width * 100;
    const h = Math.abs((d.endY ?? d.startY) - d.startY) / rect.height * 100;
    if (w > 0.4 || h > 0.4) {
      const type = d.tool as Addition['type'];
      setAdditions((prev) => [...prev, { id: uid(), type, page: activePage + 1, xPct: x1, yPct: y1, wPct: w, hPct: h, color: type === 'highlight' ? '#fde047' : type === 'whiteout' ? '#ffffff' : color, thickness: 2 }]);
    }
    setTool('select');
  };

  const startMove = (e: React.PointerEvent) => {
    if (!page) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    const objs: any[] = [];
    page.objects.forEach((o) => { if (selected.has(o.id) && !isDeleted(o.id)) { const m = moves.get(o.id) || { dx: 0, dy: 0 }; objs.push({ id: o.id, isExisting: true, dx: m.dx, dy: m.dy }); } });
    additions.forEach((a) => { if (selected.has(a.id)) objs.push({ id: a.id, isExisting: false, xPct: a.xPct, yPct: a.yPct }); });
    dragRef.current = { kind: 'move', rect, startClientX: e.clientX, startClientY: e.clientY, objs };
  };

  const onObjectDown = (e: React.PointerEvent, id: string) => {
    if (tool !== 'select' || e.button !== 0) return; // clic droit → laisse passer au canvas (marquee)
    e.stopPropagation();
    if (!selected.has(id)) selectOnly(id);
    startMove(e);
  };

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
    touched.forEach((idx) => pagesPlan.push({
      index: idx,
      deletions: [...(deletions.get(idx) || [])],
      moves: [...moves.entries()].filter(([id]) => id.startsWith(`p${idx}:`)).map(([id, m]) => ({ id, ...m })),
      textEdits: [...textEdits.entries()].filter(([id]) => id.startsWith(`p${idx}:`)).map(([id, text]) => ({ id, text })),
    }));
    if (!pagesPlan.length && !additions.length) { setError('Aucune modification à appliquer.'); return; }
    setApplying(true); setError(null); setResult(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      fd.append('plan', JSON.stringify({ pages: pagesPlan, additions: additions.map(({ id, ...rest }) => rest) }));
      const { blob, filename } = await postFormForBlob('/edit/apply', fd, "Échec de l'application des modifications.");
      setResult({ blob, filename });
    } catch (e: any) { setError(e.message || "Échec de l'application."); } finally { setApplying(false); }
  };

  const tools: { key: Tool; icon: React.ReactNode; label: string }[] = [
    { key: 'select', icon: <MousePointer2 size={15} />, label: 'Sélection' },
    { key: 'text', icon: <Type size={15} />, label: 'Texte' },
    { key: 'rect', icon: <Square size={15} />, label: 'Rectangle' },
    { key: 'line', icon: <Minus size={15} />, label: 'Ligne' },
    { key: 'highlight', icon: <Highlighter size={15} />, label: 'Surligner' },
    { key: 'whiteout', icon: <Square size={15} />, label: 'Zone blanche' },
    { key: 'eraser', icon: <Eraser size={15} />, label: 'Gomme' },
  ];

  const grips = (box: { left: number; top: number; width: number; height: number }) => {
    const pts = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0], [0.5, 1], [0, 0.5], [1, 0.5]];
    return pts.map(([fx, fy], i) => ({ left: box.left + box.width * fx - 3, top: box.top + box.height * fy - 3, key: i }));
  };

  return (
    <PdfToolShell
      icon={<PenLine size={26} color="#0369a1" />}
      iconBg="#dbeafe"
      title="Modifier un PDF"
      description="Sélectionnez les objets réels (clic gauche = sélection/déplacement, clic droit = sélection par fenêtre) et agissez dessus."
      onClose={onClose}
      maxWidth={1200}
    >
      <label style={{ ...dropzone, padding: '14px' }}>
        <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f) load(f); }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700, color: '#334155' }}>
          <FileText size={18} color="#ef4444" /> {file ? file.name : 'Choisir un PDF à modifier'}
        </div>
      </label>

      {loading && <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: '0.85rem' }}><Loader2 size={16} className="animate-spin" /> Analyse des objets…</div>}
      {error && <div style={errorBox}>{error}</div>}

      {page && (
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '150px minmax(0,1fr) 230px', gap: 14, alignItems: 'start' }}>
          {/* Outils */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Outils</div>
            {tools.map((t) => <button key={t.key} onClick={() => setTool(t.key)} style={toolBtn(tool === t.key)}>{t.icon} {t.label}</button>)}
            <label style={{ ...toolBtn(false), cursor: 'pointer' }}><ImageIcon size={15} /> Image<input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => addImage(e.target.files?.[0] || null)} /></label>
            <button style={{ ...toolBtn(false), justifyContent: 'center' }} onClick={deleteSelected} disabled={!selected.size}><Trash2 size={14} /> Supprimer</button>
            <div style={{ marginTop: 8, fontSize: '0.68rem', color: '#94a3b8', lineHeight: 1.5 }}>
              <BoxSelect size={12} style={{ verticalAlign: -2 }} /> Clic droit = sélection par fenêtre<br />
              <Move size={12} style={{ verticalAlign: -2 }} /> Clic gauche = sélectionner / déplacer
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
              {viewMode === 'document' && thumbLoading && <Loader2 size={14} className="animate-spin" color="#94a3b8" />}
              <div style={{ display: 'inline-flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                <button onClick={() => setViewMode('objets')} style={segBtn(viewMode === 'objets')}>Objets</button>
                <button onClick={() => setViewMode('document')} style={segBtn(viewMode === 'document')}>Document</button>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#94a3b8' }}>{page.objects.length} objet(s) · {selected.size} sélectionné(s)</span>
            </div>
            <div className="edit-scroll" style={{ maxHeight: '64vh', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#e2e8f0', padding: 8 }}>
              <div ref={canvasRef}
                onPointerDown={onCanvasDown}
                onPointerMove={onCanvasMove}
                onPointerUp={onCanvasUp}
                onPointerLeave={onCanvasUp}
                onContextMenu={(e) => e.preventDefault()}
                style={{ position: 'relative', width: '100%', userSelect: 'none', touchAction: 'none', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.15)' }}>
                {viewMode === 'document' ? (
                  pageThumb ? (
                    <img ref={imgRef} src={pageThumb} alt={`Page ${activePage + 1}`} onLoad={recompute} draggable={false} style={{ display: 'block', width: '100%' }} />
                  ) : (
                    <div style={{ aspectRatio: `${page.widthPt} / ${page.heightPt}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                      {thumbLoading ? <Loader2 size={24} className="animate-spin" /> : 'Aperçu indisponible'}
                    </div>
                  )
                ) : (
                  <div style={{ width: '100%', aspectRatio: `${page.widthPt} / ${page.heightPt}`, background: '#fff' }} />
                )}

                {/* Objets réels — rendus concrètement (texte réel / tracé) en vue « Objets » */}
                {page.objects.map((o) => {
                  if (isDeleted(o.id)) return null;
                  const b = bboxToPx(o);
                  const on = selected.has(o.id);
                  const common = {
                    position: 'absolute' as const, left: b.left, top: b.top, cursor: 'move' as const,
                    onPointerDown: (e: React.PointerEvent) => onObjectDown(e, o.id),
                    onClick: (e: React.MouseEvent) => { if (tool === 'select' && e.button === 0) { e.stopPropagation(); if (e.shiftKey) toggleSelect(o.id); } },
                    title: o.kind === 'text' ? (o.text || 'texte') : 'graphique',
                  };
                  if (viewMode === 'objets' && o.kind === 'text') {
                    const fs = Math.max(6, (o.fontSize || 11) * scale);
                    return (
                      <div key={o.id} {...common} style={{
                        ...common, width: Math.max(b.width, 8), height: Math.max(b.height, 8),
                        background: on ? 'rgba(3,105,161,.16)' : 'transparent',
                        outline: on ? '2px solid #0369a1' : '1px dotted rgba(37,99,235,.35)',
                        color: '#111827', fontWeight: 500, lineHeight: 1, whiteSpace: 'nowrap', fontFamily: 'Helvetica, Arial, sans-serif',
                        fontSize: fs,
                      }}>
                        <span style={{ pointerEvents: 'none' }}>{o.text || ' '}</span>
                        {on && grips(b).map((g) => (<span key={g.key} style={{ position: 'absolute', left: g.left - b.left, top: g.top - b.top, width: 6, height: 6, background: '#fff', border: '1.5px solid #0369a1', borderRadius: 1 }} />))}
                      </div>
                    );
                  }
                  if (viewMode === 'objets' && o.kind === 'path') {
                    return (
                      <div key={o.id} {...common} style={{
                        ...common, width: Math.max(b.width, 4), height: Math.max(b.height, 4),
                        background: on ? 'rgba(3,105,161,.18)' : 'rgba(148,163,184,.18)',
                        outline: on ? '2px solid #0369a1' : '1px solid rgba(100,116,139,.4)',
                      }}>
                        {on && grips(b).map((g) => (<span key={g.key} style={{ position: 'absolute', left: g.left - b.left, top: g.top - b.top, width: 6, height: 6, background: '#fff', border: '1.5px solid #0369a1', borderRadius: 1 }} />))}
                      </div>
                    );
                  }
                  // Vue « Document » : contour discret des objets sélectionnables.
                  return (
                    <div key={o.id} {...common} style={{
                      ...common, width: b.width, height: b.height,
                      border: `${on ? 2 : 1}px ${on ? 'solid' : 'dashed'} ${on ? '#0369a1' : 'rgba(37,99,235,.5)'}`,
                      background: on ? 'rgba(3,105,161,.10)' : 'transparent', boxSizing: 'border-box',
                    }}>
                      {on && grips(b).map((g) => (<span key={g.key} style={{ position: 'absolute', left: g.left - b.left, top: g.top - b.top, width: 6, height: 6, background: '#fff', border: '1.5px solid #0369a1', borderRadius: 1 }} />))}
                    </div>
                  );
                })}

                {/* Ajouts */}
                {additions.filter((a) => a.page === activePage + 1).map((a) => {
                  const on = selected.has(a.id);
                  return (
                    <div key={a.id}
                      onPointerDown={(e) => onObjectDown(e, a.id)}
                      style={{
                        position: 'absolute', left: `${a.xPct}%`, top: `${a.yPct}%`,
                        ...(a.type === 'text' ? {} : { width: `${a.wPct}%`, height: `${a.hPct}%` }),
                        outline: `${on ? 2 : 1}px ${on ? 'solid' : 'dashed'} ${on ? '#0369a1' : 'rgba(3,105,161,.4)'}`,
                        background: a.type === 'rect' ? a.color : a.type === 'highlight' ? 'rgba(253,224,71,.4)' : a.type === 'whiteout' ? '#fff' : 'transparent',
                        cursor: 'move',
                      }}>
                      {a.type === 'text' && <div style={{ fontSize: (a.fontSize || 12) * scale, fontWeight: a.bold ? 700 : 400, fontStyle: a.italic ? 'italic' : 'normal', textDecoration: a.underline ? 'underline' : 'none', color: a.color, whiteSpace: 'nowrap', pointerEvents: 'none' }}>{a.text}</div>}
                      {a.type === 'image' && a.dataUrl && <img src={a.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }} />}
                    </div>
                  );
                })}

                <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                  {additions.filter((a) => a.page === activePage + 1 && (a.type === 'line' || a.type === 'freehand')).map((a) => (
                    a.type === 'line'
                      ? <line key={a.id} x1={`${a.xPct}%`} y1={`${a.yPct}%`} x2={`${a.xPct + a.wPct}%`} y2={`${a.yPct + a.hPct}%`} stroke={a.color} strokeWidth={a.thickness || 2} />
                      : <polyline key={a.id} points={(a.points || []).map((p) => `${p.xPct}%,${p.yPct}%`).join(' ')} fill="none" stroke="#ffffff" strokeWidth={a.thickness || 8} strokeLinecap="round" strokeLinejoin="round" />
                  ))}
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

          {/* Propriétés */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Propriétés</div>
            {selectedTextObj ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Texte sélectionné :</div>
                <textarea rows={3} value={textEdits.get(selectedTextObj.id) ?? selectedTextObj.text ?? ''}
                  onChange={(e) => setTextEdits((prev) => new Map(prev).set(selectedTextObj.id, e.target.value))}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Fonctionne surtout avec les polices standard.</div>
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
                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Clic gauche : sélectionner/déplacer · Clic droit : sélection par fenêtre.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {page && (
        <div style={{ marginTop: 16, borderTop: '1px solid #f1f5f9', paddingTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>
            {[...deletions.values()].reduce((s, x) => s + x.size, 0)} suppression(s) · {moves.size} déplacement(s) · {textEdits.size} texte(s) · {additions.length} ajout(s)
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button style={btnSecondary} onClick={onClose}>Fermer</button>
            <button style={btnPrimary} disabled={applying} onClick={apply}>{applying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {applying ? 'Application…' : 'Appliquer et générer le PDF'}</button>
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
const segBtn = (active: boolean): React.CSSProperties => ({ border: 'none', cursor: 'pointer', padding: '5px 10px', fontSize: '0.74rem', fontWeight: 700, background: active ? '#0369a1' : '#f8fafc', color: active ? '#fff' : '#475569' });
const miniBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 7, padding: 4, cursor: 'pointer', color: '#475569' };
const lbl: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 };
const numInput: React.CSSProperties = { width: 70, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.82rem' };
const toggle = (active: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, cursor: 'pointer', border: `1px solid ${active ? '#0369a1' : '#e2e8f0'}`, background: active ? '#dbeafe' : '#fff', color: active ? '#0369a1' : '#475569', fontWeight: 700 });
