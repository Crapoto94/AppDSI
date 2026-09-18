import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Loader2, Trash2, Type, Minus, Square, Eraser, Image as ImageIcon, PenLine, Layers,
  ChevronLeft, ChevronRight, Check, Bold, Italic, Underline, Save, Download, FolderOpen, Plus, RotateCw, AlertTriangle,
} from 'lucide-react';
import PdfToolShell, { btnPrimary, btnSecondary, errorBox, dropzone } from './PdfToolShell';
import ResultActions from './ResultActions';
import {
  createEditProject, listEditProjects, getEditProject, saveEditProject, deleteEditProject,
  renderEditProjectPage, flattenEditProject, type EditProject,
} from './pdfToolsApi';

interface EditToolProps { onClose: () => void }

interface Addition {
  id: string; type: 'text' | 'rect' | 'line' | 'whiteout' | 'highlight' | 'freehand' | 'image' | 'polygon';
  page: number; xPct: number; yPct: number; wPct: number; hPct: number; rotation?: number;
  text?: string; fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean;
  color?: string; thickness?: number; dataUrl?: string;
  points?: { xPct: number; yPct: number }[];
}
type Tool = 'select' | 'text' | 'rect' | 'line' | 'whiteout' | 'polygon' | 'eraser';

let seq = 0;
const uid = () => `a${Date.now().toString(36)}${seq++}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const HANDLES = [
  { k: 'nw', x: 0, y: 0 }, { k: 'n', x: 0.5, y: 0 }, { k: 'ne', x: 1, y: 0 },
  { k: 'e', x: 1, y: 0.5 }, { k: 'se', x: 1, y: 1 }, { k: 's', x: 0.5, y: 1 },
  { k: 'sw', x: 0, y: 1 }, { k: 'w', x: 0, y: 0.5 },
];
const isBox = (t: Addition['type']) => t !== 'polygon' && t !== 'freehand';

export default function EditTool({ onClose }: EditToolProps) {
  const [projects, setProjects] = useState<EditProject[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [pageCount, setPageCount] = useState(0);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [activePage, setActivePage] = useState(0);
  const [pageWpt, setPageWpt] = useState(595.28);
  const [tool, setTool] = useState<Tool>('select');

  const [additions, setAdditions] = useState<Addition[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [color, setColor] = useState('#dc2626');
  const [fontSize, setFontSize] = useState(14);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [underline, setUnderline] = useState(false);

  const [loading, setLoading] = useState(false);
  const [thumbLoading, setThumbLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);

  const [marquee, setMarquee] = useState<any>(null);
  const [draft, setDraft] = useState<any>(null);
  const [polyDraft, setPolyDraft] = useState<{ xPct: number; yPct: number }[]>([]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ w: 1, h: 1 });
  const dragRef = useRef<any>(null);

  const scale = canvasSize.w / pageWpt;

  const measure = useCallback(() => {
    const el = canvasRef.current;
    if (el) setCanvasSize({ w: el.clientWidth || 1, h: el.clientHeight || 1 });
  }, []);
  useEffect(() => { measure(); window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }, [measure, thumbs, activePage]);

  // ── Projets ───────────────────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    try { setProjects(await listEditProjects()); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  const renderPage = useCallback(async (id: number, idx: number) => {
    setThumbLoading(true);
    try {
      const data = await renderEditProjectPage(id, idx + 1, 2);
      setPageCount(data.pageCount || 1);
      const p = data.pages[0];
      if (p) { setThumbs((prev) => ({ ...prev, [idx]: p.dataUrl })); setPageWpt((p.width / 2) || 595.28); }
    } catch (e: any) { setError(e.message || 'Rendu impossible.'); }
    finally { setThumbLoading(false); }
  }, []);

  const openProject = useCallback(async (id: number) => {
    setLoading(true); setError(null); setResult(null);
    try {
      const p = await getEditProject(id);
      setProjectId(id); setTitle(p.title || 'Document'); setPageCount(p.pageCount || 1);
      setAdditions(Array.isArray(p.plan?.additions) ? p.plan.additions : []);
      setSelected(new Set()); setThumbs({}); setActivePage(0); setDirty(false); setSavedAt(null);
      await renderPage(id, 0);
    } catch (e: any) { setError(e.message || 'Ouverture impossible.'); }
    finally { setLoading(false); }
  }, [renderPage]);

  const startFromFile = async (f: File) => {
    setLoading(true); setError(null); setResult(null);
    try {
      const created = await createEditProject(f, f.name.replace(/\.pdf$/i, ''));
      setProjectId(created.id); setTitle(created.title); setPageCount(created.pageCount || 1);
      setAdditions([]); setSelected(new Set()); setThumbs({}); setActivePage(0); setDirty(false); setSavedAt(null);
      await renderPage(created.id, 0);
      loadProjects();
    } catch (e: any) { setError(e.message || 'Création impossible.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (projectId && !thumbs[activePage]) renderPage(projectId, activePage); /* eslint-disable-next-line */ }, [projectId, activePage]);

  const markDirty = () => { setDirty(true); setSavedAt(null); };
  const setAdds = (updater: any) => { setAdditions(updater); markDirty(); };

  const openProjectById = (id: number) => { openProject(id); };
  const removeProject = async (id: number) => {
    if (!window.confirm('Supprimer ce fichier de travail ? (le PDF d\'origine associé sera supprimé)')) return;
    try { await deleteEditProject(id); if (projectId === id) { setProjectId(null); setAdditions([]); } loadProjects(); } catch (e: any) { setError(e.message); }
  };

  // ── Interactions ──────────────────────────────────────────────────────────
  const pctFromEvent = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { xPct: clamp(((e.clientX - rect.left) / rect.width) * 100, 0, 100), yPct: clamp(((e.clientY - rect.top) / rect.height) * 100, 0, 100), rect };
  };

  const onCanvasDown = (e: React.PointerEvent) => {
    if (!projectId) return;
    const { xPct, yPct, rect } = pctFromEvent(e);
    if (e.button === 2) { dragRef.current = { kind: 'marquee', rect, x0: e.clientX, y0: e.clientY }; setSelected(new Set()); setMarquee(null); e.preventDefault(); return; }
    if (tool === 'select') { setSelected(new Set()); return; }
    if (tool === 'text') {
      const a: Addition = { id: uid(), type: 'text', page: activePage + 1, xPct, yPct, wPct: 25, hPct: 5, rotation: 0, text: 'Texte', fontSize, bold, italic, underline, color };
      setAdds((prev: Addition[]) => [...prev, a]); setTool('select'); setSelected(new Set([a.id])); return;
    }
    if (tool === 'polygon') {
      if (polyDraft.length >= 3) {
        const first = polyDraft[0];
        const dx = Math.abs(first.xPct - xPct) * rect.width / 100, dy = Math.abs(first.yPct - yPct) * rect.height / 100;
        if (dx < 10 && dy < 10) { finalizePolygon(); return; }
      }
      setPolyDraft((prev) => [...prev, { xPct, yPct }]); return;
    }
    dragRef.current = { kind: 'draw', tool, rect, startX: e.clientX, startY: e.clientY, points: [{ xPct, yPct }] };
  };

  const onCanvasMove = (e: React.PointerEvent) => {
    const d = dragRef.current; if (!d) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    if (d.kind === 'marquee') {
      const left = Math.min(d.x0, e.clientX) - rect.left, top = Math.min(d.y0, e.clientY) - rect.top;
      const width = Math.abs(e.clientX - d.x0), height = Math.abs(e.clientY - d.y0);
      setMarquee({ left, top, width, height });
      const sel = new Set<string>();
      additions.filter((a) => a.page === activePage + 1).forEach((a) => {
        const l = (a.xPct / 100) * rect.width, t = (a.yPct / 100) * rect.height, w = (a.wPct / 100) * rect.width, h = (a.hPct / 100) * rect.height;
        if (l < left + width && l + w > left && t < top + height && t + h > top) sel.add(a.id);
      });
      setSelected(sel); return;
    }
    if (d.kind === 'draw') {
      const { xPct, yPct } = pctFromEvent(e);
      if (d.tool === 'eraser') d.points.push({ xPct, yPct }); else { d.endX = e.clientX; d.endY = e.clientY; }
      setDraft({ ...d }); return;
    }
    if (d.kind === 'move') {
      const dx = ((e.clientX - d.startClientX) / rect.width) * 100, dy = ((e.clientY - d.startClientY) / rect.height) * 100;
      setAdds((prev: Addition[]) => prev.map((a) => {
        const o = d.objs.find((x: any) => x.id === a.id); if (!o) return a;
        if (isBox(a.type)) return { ...a, xPct: clamp(o.xPct + dx, 0, 100 - (o.wPct || 0)), yPct: clamp(o.yPct + dy, 0, 100 - (o.hPct || 0)) };
        return { ...a, xPct: o.xPct + dx, yPct: o.yPct + dy, points: o.points.map((p: any) => ({ xPct: p.xPct + dx, yPct: p.yPct + dy })) };
      }));
      return;
    }
    if (d.kind === 'resize') {
      const dx = ((e.clientX - d.startClientX) / rect.width) * 100, dy = ((e.clientY - d.startClientY) / rect.height) * 100;
      setAdds((prev: Addition[]) => prev.map((a) => {
        if (a.id !== d.id) return a;
        let { xPct, yPct, wPct, hPct } = d.orig;
        if (d.handle.includes('w')) { xPct = d.orig.xPct + dx; wPct = d.orig.wPct - dx; }
        if (d.handle.includes('e')) { wPct = d.orig.wPct + dx; }
        if (d.handle.includes('n')) { yPct = d.orig.yPct + dy; hPct = d.orig.hPct - dy; }
        if (d.handle.includes('s')) { hPct = d.orig.hPct + dy; }
        if (wPct < 1) { wPct = 1; } if (hPct < 0.5) { hPct = 0.5; }
        return { ...a, xPct, yPct, wPct, hPct };
      }));
      return;
    }
    if (d.kind === 'rotate') {
      const p = pctFromEvent(e);
      const ang = Math.atan2(p.yPct - d.cy, p.xPct - d.cx) * 180 / Math.PI;
      let rot = d.origRotation + (ang - d.startAngle);
      if (e.shiftKey) rot = Math.round(rot / 15) * 15;
      setAdds((prev: Addition[]) => prev.map((a) => (a.id === d.id ? { ...a, rotation: Math.round(rot) } : a)));
      return;
    }
  };

  const onCanvasUp = () => {
    const d = dragRef.current; dragRef.current = null; setMarquee(null); setDraft(null);
    if (!d || d.kind !== 'draw') return;
    const rect = canvasRef.current!.getBoundingClientRect();
    if (d.tool === 'eraser') {
      if (d.points.length > 1) setAdds((prev: Addition[]) => [...prev, { id: uid(), type: 'freehand', page: activePage + 1, xPct: 0, yPct: 0, wPct: 0, hPct: 0, rotation: 0, points: d.points, thickness: 10 }]);
      setTool('select'); return;
    }
    const x1 = (Math.min(d.startX, d.endX ?? d.startX) - rect.left) / rect.width * 100;
    const y1 = (Math.min(d.startY, d.endY ?? d.startY) - rect.top) / rect.height * 100;
    const w = Math.abs((d.endX ?? d.startX) - d.startX) / rect.width * 100;
    const h = Math.abs((d.endY ?? d.startY) - d.startY) / rect.height * 100;
    if (w > 0.4 || h > 0.4) {
      const type = d.tool as Addition['type'];
      setAdds((prev: Addition[]) => [...prev, { id: uid(), type, page: activePage + 1, xPct: x1, yPct: y1, wPct: w, hPct: h, rotation: 0, color: type === 'whiteout' ? '#ffffff' : color, thickness: 2 }]);
    }
    setTool('select');
  };

  const finalizePolygon = () => {
    if (polyDraft.length < 3) { setPolyDraft([]); return; }
    const xs = polyDraft.map((p) => p.xPct), ys = polyDraft.map((p) => p.yPct);
    setAdds((prev: Addition[]) => [...prev, {
      id: uid(), type: 'polygon', page: activePage + 1, xPct: Math.min(...xs), yPct: Math.min(...ys),
      wPct: Math.max(...xs) - Math.min(...xs), hPct: Math.max(...ys) - Math.min(...ys), rotation: 0,
      points: polyDraft.map((p) => ({ ...p })), color: '#ffffff',
    }]);
    setPolyDraft([]); setTool('select');
  };

  const onElementDown = (e: React.PointerEvent, a: Addition) => {
    if (tool !== 'select' || e.button !== 0) return;
    e.stopPropagation();
    const sel = selected.has(a.id) ? selected : new Set([a.id]);
    setSelected(sel);
    const rect = canvasRef.current!.getBoundingClientRect();
    const objs = additions.filter((x) => sel.has(x.id)).map((x) => ({ id: x.id, xPct: x.xPct, yPct: x.yPct, wPct: x.wPct, hPct: x.hPct, points: x.points || [] }));
    dragRef.current = { kind: 'move', rect, startClientX: e.clientX, startClientY: e.clientY, objs };
  };

  const startResize = (e: React.PointerEvent, a: Addition, handle: string) => {
    e.stopPropagation();
    const rect = canvasRef.current!.getBoundingClientRect();
    dragRef.current = { kind: 'resize', id: a.id, handle, rect, startClientX: e.clientX, startClientY: e.clientY, orig: { xPct: a.xPct, yPct: a.yPct, wPct: a.wPct, hPct: a.hPct } };
  };

  const startRotate = (e: React.PointerEvent, a: Addition) => {
    e.stopPropagation();
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = a.xPct + a.wPct / 2, cy = a.yPct + a.hPct / 2;
    const p = pctFromEvent(e);
    dragRef.current = { kind: 'rotate', id: a.id, rect, cx, cy, startAngle: Math.atan2(p.yPct - cy, p.xPct - cx) * 180 / Math.PI, origRotation: a.rotation || 0 };
  };

  const deleteSelected = () => { setAdds((prev: Addition[]) => prev.filter((a) => !selected.has(a.id))); setSelected(new Set()); };

  const addImage = (f: File | null) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { const a: Addition = { id: uid(), type: 'image', page: activePage + 1, xPct: 20, yPct: 20, wPct: 35, hPct: 25, rotation: 0, dataUrl: String(reader.result) }; setAdds((prev: Addition[]) => [...prev, a]); setTool('select'); setSelected(new Set([a.id])); };
    reader.readAsDataURL(f);
  };

  // ── Enregistrer / Générer ─────────────────────────────────────────────────
  const onSave = async () => {
    if (!projectId) return;
    setSaving(true); setError(null);
    try {
      await saveEditProject(projectId, { additions }, title);
      setDirty(false); setSavedAt(new Date().toLocaleTimeString('fr-FR'));
      loadProjects();
    } catch (e: any) { setError(e.message || "Échec de l'enregistrement."); }
    finally { setSaving(false); }
  };

  const onGenerate = async () => {
    if (!projectId) return;
    if (!window.confirm("Générer un nouveau PDF va « aplatir » vos masques et annotations : ils seront définitivement intégrés et NE POURRONT PLUS être modifiés.\n\nPour garder la possibilité de modifier, utilisez « Enregistrer » (fichier de travail).\n\nContinuer ?")) return;
    setGenerating(true); setError(null); setResult(null);
    try {
      if (dirty) await saveEditProject(projectId, { additions }, title);
      const { blob, filename } = await flattenEditProject(projectId);
      setResult({ blob, filename });
    } catch (e: any) { setError(e.message || 'Échec de la génération.'); }
    finally { setGenerating(false); }
  };

  const pageAdds = additions.filter((a) => a.page === activePage + 1);
  const selectedOne = selected.size === 1 ? additions.find((a) => selected.has(a.id)) : undefined;
  const selectedText = selectedOne && selectedOne.type === 'text' ? selectedOne : undefined;

  const tools: { key: Tool; icon: React.ReactNode; label: string }[] = [
    { key: 'select', icon: <PenLine size={15} />, label: 'Sélection' },
    { key: 'whiteout', icon: <Square size={15} />, label: 'Masque zone (rect.)' },
    { key: 'polygon', icon: <Layers size={15} />, label: 'Masque zone (polyg.)' },
    { key: 'eraser', icon: <Eraser size={15} />, label: 'Gomme (raster)' },
    { key: 'text', icon: <Type size={15} />, label: 'Texte' },
    { key: 'line', icon: <Minus size={15} />, label: 'Ligne' },
    { key: 'rect', icon: <Square size={15} />, label: 'Rectangle couleur' },
  ];

  return (
    <PdfToolShell
      icon={<PenLine size={26} color="#0369a1" />}
      iconBg="#dbeafe"
      title="Annoter / masquer un PDF"
      description="Masquez des zones, ajoutez texte, lignes, photos. Le document d'origine n'est jamais modifié."
      onClose={onClose}
      maxWidth={1240}
    >
      {/* Fichiers de travail */}
      {!projectId && (
        <div>
          <label style={{ ...dropzone, padding: '16px' }}>
            <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) startFromFile(f); }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontWeight: 700, color: '#334155' }}><Plus size={18} /> Nouveau fichier de travail (choisir un PDF)</div>
          </label>
          {projects.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Mes fichiers de travail</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {projects.map((p) => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }}>
                    <FolderOpen size={17} color="#0369a1" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || `Document #${p.id}`}</div>
                      <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{p.page_count ?? p.pageCount ?? '?'} page(s) · modifié le {p.updated_at ? new Date(p.updated_at).toLocaleString('fr-FR') : '—'}</div>
                    </div>
                    <button style={iconBtn} title="Ouvrir" onClick={() => openProjectById(p.id)}><FolderOpen size={15} /></button>
                    <button style={{ ...iconBtn, color: '#dc2626' }} title="Supprimer" onClick={() => removeProject(p.id)}><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {loading && <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: '0.85rem' }}><Loader2 size={16} className="animate-spin" /> Ouverture…</div>}
          {error && <div style={errorBox}>{error}</div>}
        </div>
      )}

      {projectId && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <input value={title} onChange={(e) => { setTitle(e.target.value); markDirty(); }} style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.95rem', fontWeight: 700 }} />
            <span style={{ fontSize: '0.75rem', color: dirty ? '#b45309' : '#16a34a', fontWeight: 700 }}>{saving ? 'Enregistrement…' : dirty ? '● Modifications non enregistrées' : savedAt ? `Enregistré à ${savedAt}` : 'À jour'}</span>
            <button style={btnSecondary} onClick={() => { setProjectId(null); setAdditions([]); }}>Fermer le fichier</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '180px minmax(0,1fr) 230px', gap: 14, alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Outils</div>
              {tools.map((t) => <button key={t.key} onClick={() => { setTool(t.key); setPolyDraft([]); }} style={toolBtn(tool === t.key)}>{t.icon} {t.label}</button>)}
              <label style={{ ...toolBtn(false), cursor: 'pointer' }}><ImageIcon size={15} /> Photo / image<input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => addImage(e.target.files?.[0] || null)} /></label>
              {tool === 'polygon' && <button style={{ ...toolBtn(false), justifyContent: 'center' }} onClick={finalizePolygon} disabled={polyDraft.length < 3}><Check size={14} /> Terminer ({polyDraft.length})</button>}
              <button style={{ ...toolBtn(false), justifyContent: 'center' }} onClick={deleteSelected} disabled={!selected.size}><Trash2 size={14} /> Supprimer</button>
              <button style={{ ...toolBtn(false), justifyContent: 'center' }} onClick={() => setAdds((prev: Addition[]) => prev.map((a) => a.id === selectedOne?.id ? { ...a, rotation: ((a.rotation || 0) + 90) % 360 } : a))} disabled={!selectedOne}><RotateCw size={14} /> Pivoter 90°</button>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Page {activePage + 1} / {pageCount}</span>
                {pageCount > 1 && (<>
                  <button style={miniBtn} disabled={activePage === 0} onClick={() => { setActivePage((p) => p - 1); setSelected(new Set()); setPolyDraft([]); }}><ChevronLeft size={14} /></button>
                  <button style={miniBtn} disabled={activePage >= pageCount - 1} onClick={() => { setActivePage((p) => p + 1); setSelected(new Set()); setPolyDraft([]); }}><ChevronRight size={14} /></button>
                </>)}
                {thumbLoading && <Loader2 size={14} className="animate-spin" color="#94a3b8" />}
                <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#94a3b8' }}>Clic droit = sélection par fenêtre</span>
              </div>
              <div className="edit-scroll" style={{ maxHeight: '64vh', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#e2e8f0', padding: 8 }}>
                <div ref={canvasRef}
                  onPointerDown={onCanvasDown} onPointerMove={onCanvasMove} onPointerUp={onCanvasUp} onPointerLeave={onCanvasUp}
                  onDoubleClick={() => { if (tool === 'polygon') finalizePolygon(); }}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{ position: 'relative', width: '100%', userSelect: 'none', touchAction: 'none', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.15)' }}>
                  {thumbs[activePage]
                    ? <img src={thumbs[activePage]} alt={`Page ${activePage + 1}`} draggable={false} style={{ display: 'block', width: '100%' }} />
                    : <div style={{ height: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>Aperçu…</div>}

                  {/* Polygones / tracés libres (SVG) */}
                  <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    {pageAdds.filter((a) => a.type === 'polygon' || a.type === 'freehand').map((a) => {
                      const xs = (a.points || []).map((p) => p.xPct), ys = (a.points || []).map((p) => p.yPct);
                      if (!xs.length) return null;
                      const minX = Math.min(...xs), minY = Math.min(...ys), bw = (Math.max(...xs) - minX) || 1, bh = (Math.max(...ys) - minY) || 1;
                      const left = (minX / 100) * canvasSize.w, top = (minY / 100) * canvasSize.h, wp = (bw / 100) * canvasSize.w, hp = (bh / 100) * canvasSize.h;
                      const cx = left + wp / 2, cy = top + hp / 2;
                      const sel = selected.has(a.id);
                      return (
                        <g key={a.id} transform={`rotate(${a.rotation || 0} ${cx} ${cy})`}>
                          {a.type === 'polygon'
                            ? <polygon points={(a.points || []).map((p) => `${left + ((p.xPct - minX) / bw) * wp},${top + ((p.yPct - minY) / bh) * hp}`).join(' ')} fill="rgba(255,255,255,.92)" stroke={sel ? '#0369a1' : '#94a3b8'} strokeWidth={sel ? 2 : 1} strokeDasharray="4 3" />
                            : <polyline points={(a.points || []).map((p) => `${(p.xPct / 100) * canvasSize.w},${(p.yPct / 100) * canvasSize.h}`).join(' ')} fill="none" stroke={sel ? '#0369a1' : '#cbd5e1'} strokeWidth={a.thickness || 10} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />}
                        </g>
                      );
                    })}
                  </svg>

                  {/* Boîtes éditables (texte, formes, images, lignes) */}
                  {pageAdds.filter((a) => isBox(a.type)).map((a) => {
                    const on = selected.has(a.id);
                    const base: React.CSSProperties = {
                      position: 'absolute', left: `${a.xPct}%`, top: `${a.yPct}%`, width: `${a.wPct}%`, height: `${a.hPct}%`,
                      transform: `rotate(${a.rotation || 0}deg)`, transformOrigin: 'center',
                      outline: on ? '2px solid #0369a1' : 'none', cursor: 'move', boxSizing: 'border-box',
                      background: a.type === 'rect' ? a.color : a.type === 'whiteout' ? 'rgba(255,255,255,.92)' : a.type === 'highlight' ? 'rgba(253,224,71,.45)' : 'transparent',
                      border: (a.type === 'whiteout' && !on) ? '1px dashed #94a3b8' : undefined,
                    };
                    return (
                      <div key={a.id} onPointerDown={(e) => onElementDown(e, a)} style={base}>
                        {a.type === 'text' && <div style={{ width: '100%', height: '100%', fontSize: (a.fontSize || 14) * scale, fontWeight: a.bold ? 700 : 400, fontStyle: a.italic ? 'italic' : 'normal', textDecoration: a.underline ? 'underline' : 'none', color: a.color, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.2, pointerEvents: 'none' }}>{a.text}</div>}
                        {a.type === 'image' && a.dataUrl && <img src={a.dataUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none' }} />}
                        {a.type === 'line' && <svg width="100%" height="100%" preserveAspectRatio="none" style={{ display: 'block', pointerEvents: 'none' }}><line x1="0" y1="0" x2="100%" y2="100%" stroke={a.color} strokeWidth={2} vectorEffect="non-scaling-stroke" /></svg>}
                        {on && HANDLES.map((h) => (
                          <span key={h.k} onPointerDown={(e) => startResize(e, a, h.k)} style={{ position: 'absolute', left: `calc(${h.x * 100}% - 4px)`, top: `calc(${h.y * 100}% - 4px)`, width: 8, height: 8, background: '#fff', border: '1.5px solid #0369a1', borderRadius: 1, cursor: 'nwse-resize' }} />
                        ))}
                        {on && <span onPointerDown={(e) => startRotate(e, a)} title="Pivoter" style={{ position: 'absolute', left: 'calc(50% - 8px)', top: -26, width: 16, height: 16, background: '#0369a1', borderRadius: '50%', cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><RotateCw size={11} /></span>}
                      </div>
                    );
                  })}

                  {/* Sélection par fenêtre + brouillons */}
                  {polyDraft.length > 0 && (
                    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                      <polyline points={polyDraft.map((p) => `${p.xPct}%,${p.yPct}%`).join(' ')} fill="rgba(3,105,161,.12)" stroke="#0369a1" strokeWidth={1.5} strokeDasharray="4 3" />
                      {polyDraft.map((p, i) => <circle key={i} cx={`${p.xPct}%`} cy={`${p.yPct}%`} r={3} fill="#0369a1" />)}
                    </svg>
                  )}
                  {marquee && <div style={{ position: 'absolute', left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height, border: '1px dashed #0369a1', background: 'rgba(3,105,161,.12)', pointerEvents: 'none' }} />}
                  {draft && draft.kind === 'draw' && draft.tool !== 'eraser' && (() => {
                    const r = draft.rect as DOMRect;
                    const l = Math.min(draft.startX, draft.endX ?? draft.startX) - r.left, t = Math.min(draft.startY, draft.endY ?? draft.startY) - r.top;
                    return <div style={{ position: 'absolute', left: l, top: t, width: Math.abs((draft.endX ?? draft.startX) - draft.startX), height: Math.abs((draft.endY ?? draft.startY) - draft.startY), border: '1px dashed #0369a1', background: 'rgba(3,105,161,.1)', pointerEvents: 'none' }} />;
                  })()}
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, background: '#f8fafc' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>Options</div>
              {selectedText ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Texte :</div>
                  <textarea rows={3} value={selectedText.text || ''} onChange={(e) => setAdds((prev: Addition[]) => prev.map((x) => x.id === selectedText.id ? { ...x, text: e.target.value } : x))} style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  <label style={lbl}>Taille<input type="number" min={6} max={72} value={selectedText.fontSize || 14} onChange={(e) => setAdds((prev: Addition[]) => prev.map((x) => x.id === selectedText.id ? { ...x, fontSize: Number(e.target.value) || 14 } : x))} style={numInput} /></label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={toggle(!!selectedText.bold)} onClick={() => setAdds((prev: Addition[]) => prev.map((x) => x.id === selectedText.id ? { ...x, bold: !x.bold } : x))}><Bold size={14} /></button>
                    <button style={toggle(!!selectedText.italic)} onClick={() => setAdds((prev: Addition[]) => prev.map((x) => x.id === selectedText.id ? { ...x, italic: !x.italic } : x))}><Italic size={14} /></button>
                    <button style={toggle(!!selectedText.underline)} onClick={() => setAdds((prev: Addition[]) => prev.map((x) => x.id === selectedText.id ? { ...x, underline: !x.underline } : x))}><Underline size={14} /></button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <label style={lbl}>Couleur<input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 40, height: 28, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff' }} /></label>
                  <label style={lbl}>Taille texte<input type="number" min={6} max={72} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value) || 14)} style={numInput} /></label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button style={toggle(bold)} onClick={() => setBold((v) => !v)}><Bold size={14} /></button>
                    <button style={toggle(italic)} onClick={() => setItalic((v) => !v)}><Italic size={14} /></button>
                    <button style={toggle(underline)} onClick={() => setUnderline((v) => !v)}><Underline size={14} /></button>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>Sélectionnez un élément pour afficher ses poignées (redimensionner) et sa poignée de rotation.</div>
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 16, padding: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, color: '#92400e', fontSize: '0.78rem', display: 'flex', gap: 8 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0 }} />
            <span>
              <strong>Enregistrer</strong> conserve votre <em>fichier de travail</em> (masques et annotations restent modifiables plus tard).
              <strong> Générer le PDF</strong> « aplatit » ces éléments dans un nouveau PDF : ils ne seront alors <strong>plus modifiables</strong>.
            </span>
          </div>

          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{additions.length} élément(s)</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button style={btnSecondary} onClick={onSave} disabled={saving}>{saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Enregistrer le fichier de travail</button>
              <button style={btnPrimary} onClick={onGenerate} disabled={generating}>{generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={15} />} Générer le PDF (aplatir)</button>
            </div>
          </div>

          {error && <div style={errorBox}>{error}</div>}
          {result && <ResultActions blob={result.blob} filename={result.filename} />}
        </>
      )}

      <style>{`
        .edit-scroll { scrollbar-width: thin; scrollbar-color: #94a3b8 #e2e8f0; }
        .edit-scroll::-webkit-scrollbar { width: 12px; }
        .edit-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 10px; border: 2px solid #eef2f7; }
      `}</style>
    </PdfToolShell>
  );
}

const iconBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, border: '1px solid #e2e8f0', background: '#fff', borderRadius: 8, cursor: 'pointer', color: '#475569', flexShrink: 0 };
const toolBtn = (active: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${active ? '#0369a1' : '#e2e8f0'}`, background: active ? '#dbeafe' : '#fff', color: active ? '#0369a1' : '#475569', fontWeight: 700, fontSize: '0.78rem' });
const miniBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 7, padding: 4, cursor: 'pointer', color: '#475569' };
const lbl: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 };
const numInput: React.CSSProperties = { width: 70, padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: '0.82rem' };
const toggle = (active: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, cursor: 'pointer', border: `1px solid ${active ? '#0369a1' : '#e2e8f0'}`, background: active ? '#dbeafe' : '#fff', color: active ? '#0369a1' : '#475569', fontWeight: 700 });
