import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, FileText, Loader2, Trash2, MousePointer2, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Underline, Sparkles, ChevronLeft, ChevronRight, BoxSelect, Minus, CheckCircle2 } from 'lucide-react';
import PdfToolShell, { btnPrimary, btnDisabled, btnSecondary, errorBox } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob, postFormForJson } from './pdfToolsApi';

interface MailMergeToolProps { onClose: () => void }

interface PageInfo { index: number; dataUrl: string; width: number; height: number; widthPt: number; heightPt: number }

interface Analysis {
  columns: string[];
  sheetNames: string[];
  sheet: string;
  rowCount: number;
  firstRecord: Record<string, unknown>;
  sample: Record<string, unknown>[];
  pageCount: number;
  pages: PageInfo[];
  truncated: boolean;
}

interface PlacedField {
  id: string;
  column: string;
  page: number;      // 1-based
  xPct: number;      // coin haut-gauche, % largeur
  yPct: number;      // coin haut-gauche, % hauteur
  wPt: number;       // largeur (points)
  hPt: number;       // hauteur (points)
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
  wrap: boolean;     // false = une ligne, true = remplir la zone
}

let fieldSeq = 0;
const newId = () => `f${Date.now().toString(36)}${fieldSeq++}`;

export default function MailMergeTool({ onClose }: MailMergeToolProps) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fields, setFields] = useState<PlacedField[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePage, setActivePage] = useState(0);

  const [mode, setMode] = useState<'single' | 'separate'>('single');
  const [baseName, setBaseName] = useState('publipostage');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const [scale, setScale] = useState(0.8); // px écran par point PDF
  const dragRef = useRef<{ id: string; kind: 'move' | 'resize'; startX: number; startY: number; orig: PlacedField; rect: DOMRect } | null>(null);

  const recomputeScale = useCallback(() => {
    const page = analysis?.pages[activePage];
    if (imgRef.current && page) setScale(imgRef.current.clientWidth / page.widthPt);
  }, [analysis, activePage]);

  useEffect(() => {
    recomputeScale();
    window.addEventListener('resize', recomputeScale);
    return () => window.removeEventListener('resize', recomputeScale);
  }, [recomputeScale]);

  const selected = fields.find((f) => f.id === selectedId) || null;
  const activePageInfo = analysis?.pages[activePage];

  // ── Analyse ───────────────────────────────────────────────────────────────
  const analyze = async (pdf: File, excel: File) => {
    setAnalyzing(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('pdf', pdf);
      formData.append('excel', excel);
      const data = await postFormForJson<Analysis>('/mail-merge/analyze', formData, "Échec de l'analyse du publipostage.");
      setAnalysis(data);
      setFields([]);
      setSelectedId(null);
      setActivePage(0);
      setResult(null);
    } catch (e: any) {
      setAnalysis(null);
      setError(e.message || "Échec de l'analyse.");
    } finally {
      setAnalyzing(false);
    }
  };

  const pickPdf = (f: File | null) => { setPdfFile(f); if (f && excelFile) analyze(f, excelFile); };
  const pickExcel = (f: File | null) => { setExcelFile(f); if (f && pdfFile) analyze(pdfFile, f); };

  // ── Placement ─────────────────────────────────────────────────────────────
  const addField = (column: string, xPct: number, yPct: number, page: number) => {
    const f: PlacedField = {
      id: newId(), column, page,
      xPct: Math.max(0, Math.min(96, xPct)), yPct: Math.max(0, Math.min(96, yPct)),
      wPt: 180, hPt: 24, fontSize: 12, bold: false, italic: false, underline: false,
      color: '#111827', align: 'left', wrap: false,
    };
    setFields((prev) => [...prev, f]);
    setSelectedId(f.id);
  };

  const onDropColumn = (e: React.DragEvent) => {
    e.preventDefault();
    const column = e.dataTransfer.getData('text/mm-column');
    if (!column || !activePageInfo) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    addField(column, ((e.clientX - rect.left) / rect.width) * 100, ((e.clientY - rect.top) / rect.height) * 100, activePage + 1);
  };

  const updateField = (id: string, patch: Partial<PlacedField>) => {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const onPointerDown = (e: React.PointerEvent, f: PlacedField, kind: 'move' | 'resize') => {
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    const rect = (target.closest('.mm-page') as HTMLElement)?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = { id: f.id, kind, startX: e.clientX, startY: e.clientY, orig: { ...f }, rect };
    setSelectedId(f.id);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = ((e.clientX - d.startX) / d.rect.width) * 100;
    const dy = ((e.clientY - d.startY) / d.rect.height) * 100;
    if (d.kind === 'move') {
      updateField(d.id, {
        xPct: Math.max(0, Math.min(100 - 1, d.orig.xPct + dx)),
        yPct: Math.max(0, Math.min(100 - 1, d.orig.yPct + dy)),
      });
    } else {
      const dPtX = (e.clientX - d.startX) / scale;
      const dPtY = (e.clientY - d.startY) / scale;
      updateField(d.id, {
        wPt: Math.max(24, Math.round(d.orig.wPt + dPtX)),
        hPt: Math.max(14, Math.round(d.orig.hPt + dPtY)),
      });
    }
  };

  const endPointer = () => { dragRef.current = null; };

  // ── Génération ────────────────────────────────────────────────────────────
  const generate = async () => {
    if (!pdfFile || !excelFile || !analysis) return;
    if (!fields.length) { setError('Placez au moins une variable sur le document.'); return; }
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const plan = {
        sheet: analysis.sheet,
        baseName: baseName.trim() || 'publipostage',
        fields: fields.map(({ id, ...rest }) => rest),
      };
      const formData = new FormData();
      formData.append('pdf', pdfFile);
      formData.append('excel', excelFile);
      formData.append('plan', JSON.stringify(plan));
      formData.append('mode', mode);
      const { blob, filename } = await postFormForBlob('/mail-merge/generate', formData, 'Échec de la génération du publipostage.');
      setResult({ blob, filename });
      setShowSuccess(true);
      // Fait défiler la fenêtre jusqu'à la zone de résultat (téléchargement / PDFothèque).
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 150);
    } catch (e: any) {
      setError(e.message || 'Échec de la génération.');
    } finally {
      setGenerating(false);
    }
  };

  const previewValue = (f: PlacedField) => {
    const v = analysis?.firstRecord?.[f.column];
    return v === undefined || v === null || v === '' ? `{${f.column}}` : String(v);
  };

  const fieldsOnActivePage = fields.filter((f) => f.page === activePage + 1);

  return (
    <PdfToolShell
      icon={<FileSpreadsheet size={26} color="#0e7490" />}
      iconBg="#cffafe"
      title="Publipostage PDF"
      description="Fusionnez un modèle PDF avec un fichier Excel : placez les variables sur le document et générez tous les exemplaires."
      onClose={onClose}
      maxWidth={1120}
    >
      {/* 1. Fichiers */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label style={fileBox(pdfFile)}>
          <FileText size={18} color="#ef4444" />
          <span style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfFile ? pdfFile.name : 'Choisir le PDF modèle'}</span>
          <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => pickPdf(e.target.files?.[0] || null)} />
        </label>
        <label style={fileBox(excelFile)}>
          <FileSpreadsheet size={18} color="#15803d" />
          <span style={{ fontWeight: 700, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{excelFile ? excelFile.name : 'Choisir le fichier Excel'}</span>
          <input type="file" accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" style={{ display: 'none' }} onChange={(e) => pickExcel(e.target.files?.[0] || null)} />
        </label>
      </div>

      {analyzing && (
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: '0.85rem' }}>
          <Loader2 size={16} className="animate-spin" /> Analyse du modèle et du fichier Excel…
        </div>
      )}
      {error && <div style={errorBox}>{error}</div>}

      {analysis && (
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr) 260px', gap: 16, alignItems: 'start' }}>
          {/* Colonnes */}
          <div>
            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>
              Colonnes ({analysis.columns.length})
            </div>
            <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '0 0 8px' }}>Glissez une colonne sur la page, ou cliquez pour l'ajouter.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
              {analysis.columns.map((col) => (
                <div
                  key={col}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/mm-column', col)}
                  onClick={() => addField(col, 12, 12 + fields.length * 4, activePage + 1)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: '0.8rem', fontWeight: 600, color: '#0369a1', cursor: 'grab' }}
                  title="Glisser-déposer sur le document"
                >
                  <Sparkles size={12} /> {col}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontSize: '0.72rem', color: '#64748b' }}>
              {analysis.rowCount} enregistrement(s) · feuille « {analysis.sheet} »
            </div>
          </div>

          {/* Page + placement */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                Page {activePage + 1} / {analysis.pageCount}
              </span>
              {(analysis.pageCount > 1) && (
                <>
                  <button style={miniBtn} disabled={activePage === 0} onClick={() => setActivePage((p) => Math.max(0, p - 1))}><ChevronLeft size={14} /></button>
                  <button style={miniBtn} disabled={activePage >= analysis.pages.length - 1} onClick={() => setActivePage((p) => Math.min(analysis.pages.length - 1, p + 1))}><ChevronRight size={14} /></button>
                </>
              )}
              <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <MousePointer2 size={12} /> glissez les variables, étirez le coin
              </span>
            </div>
            {activePageInfo ? (
              <div className="mm-scroll" style={{ maxHeight: '60vh', overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 10, background: '#e2e8f0', padding: 8 }}>
                <div
                  className="mm-page"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={onDropColumn}
                  onPointerMove={onPointerMove}
                  onPointerUp={endPointer}
                  onPointerLeave={endPointer}
                  style={{ position: 'relative', border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', background: '#f8fafc', userSelect: 'none', touchAction: 'none', width: '100%' }}
                >
                <img ref={imgRef} src={activePageInfo.dataUrl} alt={`Page ${activePage + 1}`} onLoad={recomputeScale} style={{ display: 'block', width: '100%' }} draggable={false} />
                {fieldsOnActivePage.map((f) => {
                  const isSel = f.id === selectedId;
                  return (
                    <div
                      key={f.id}
                      onPointerDown={(e) => onPointerDown(e, f, 'move')}
                      onClick={(e) => { e.stopPropagation(); setSelectedId(f.id); }}
                      style={{
                        position: 'absolute',
                        left: `${f.xPct}%`,
                        top: `${f.yPct}%`,
                        width: Math.max(14, f.wPt * scale),
                        minHeight: Math.max(12, f.fontSize * scale * 1.2),
                        border: `1.5px ${isSel ? 'solid' : 'dashed'} ${isSel ? '#0284c7' : '#38bdf8'}`,
                        background: 'rgba(56,189,248,0.10)',
                        borderRadius: 3,
                        cursor: 'move',
                        padding: '1px 2px',
                        overflow: f.wrap ? 'hidden' : 'visible',
                      }}
                    >
                      <div style={{
                        fontSize: Math.max(6, f.fontSize * scale),
                        fontWeight: f.bold ? 700 : 400,
                        fontStyle: f.italic ? 'italic' : 'normal',
                        textDecoration: f.underline ? 'underline' : 'none',
                        color: f.color,
                        textAlign: f.align,
                        lineHeight: 1.2,
                        whiteSpace: f.wrap ? 'normal' : 'nowrap',
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                        pointerEvents: 'none',
                      }}>
                        {previewValue(f)}
                      </div>
                      {isSel && (
                        <div
                          onPointerDown={(e) => onPointerDown(e, f, 'resize')}
                          title="Redimensionner"
                          style={{ position: 'absolute', right: -5, bottom: -5, width: 11, height: 11, background: '#0284c7', border: '2px solid #fff', borderRadius: 3, cursor: 'nwse-resize' }}
                        />
                      )}
                    </div>
                  );
                })}
                </div>
              </div>
            ) : <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Aperçu indisponible.</div>}
            {analysis.truncated && <div style={{ fontSize: '0.7rem', color: '#b45309', marginTop: 6 }}>Aperçu limité aux 20 premières pages.</div>}
          </div>

          {/* Réglages */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, background: '#f8fafc' }}>
            <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>Variable</div>
            {!selected ? (
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Sélectionnez une variable placée pour la régler.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#0369a1', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{selected.column}</span>
                  <button style={miniBtn} onClick={() => removeField(selected.id)} title="Supprimer"><Trash2 size={14} color="#dc2626" /></button>
                </div>

                <label style={lbl}>Taille de police
                  <input type="range" min={6} max={48} value={selected.fontSize} onChange={(e) => updateField(selected.id, { fontSize: Number(e.target.value) })} style={{ width: '100%' }} />
                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{selected.fontSize} pt</span>
                </label>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={toggleBtn(selected.bold)} onClick={() => updateField(selected.id, { bold: !selected.bold })}><Bold size={14} /></button>
                  <button style={toggleBtn(selected.italic)} onClick={() => updateField(selected.id, { italic: !selected.italic })}><Italic size={14} /></button>
                  <button style={toggleBtn(selected.underline)} onClick={() => updateField(selected.id, { underline: !selected.underline })}><Underline size={14} /></button>
                  <input type="color" value={selected.color} onChange={(e) => updateField(selected.id, { color: e.target.value })} style={{ width: 34, height: 30, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer' }} />
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={toggleBtn(selected.align === 'left')} onClick={() => updateField(selected.id, { align: 'left' })}><AlignLeft size={14} /></button>
                  <button style={toggleBtn(selected.align === 'center')} onClick={() => updateField(selected.id, { align: 'center' })}><AlignCenter size={14} /></button>
                  <button style={toggleBtn(selected.align === 'right')} onClick={() => updateField(selected.id, { align: 'right' })}><AlignRight size={14} /></button>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={{ ...toggleBtn(!selected.wrap), flex: 1, justifyContent: 'center' }} onClick={() => updateField(selected.id, { wrap: false })}><Minus size={13} /> Une ligne</button>
                  <button style={{ ...toggleBtn(selected.wrap), flex: 1, justifyContent: 'center' }} onClick={() => updateField(selected.id, { wrap: true })}><BoxSelect size={13} /> Zone</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <label style={lbl}>Largeur (pt)
                    <input type="number" min={20} value={selected.wPt} onChange={(e) => updateField(selected.id, { wPt: Math.max(20, Number(e.target.value) || 20) })} style={numInput} />
                  </label>
                  <label style={lbl}>Hauteur (pt)
                    <input type="number" min={12} value={selected.hPt} disabled={!selected.wrap} onChange={(e) => updateField(selected.id, { hPt: Math.max(12, Number(e.target.value) || 12) })} style={{ ...numInput, opacity: selected.wrap ? 1 : 0.5 }} />
                  </label>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Page {selected.page} · position {selected.xPct.toFixed(1)}% / {selected.yPct.toFixed(1)}%</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Options de génération */}
      {analysis && (
        <div style={{ marginTop: 20, borderTop: '1px solid #f1f5f9', paddingTop: 16 }}>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <div style={lbl}>Nom de base des fichiers</div>
              <input value={baseName} onChange={(e) => setBaseName(e.target.value)} style={{ ...numInput, width: 200 }} />
            </div>
            <div>
              <div style={lbl}>Sortie</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={toggleBtn(mode === 'single')} onClick={() => setMode('single')}>Un seul PDF (tout)</button>
                <button style={toggleBtn(mode === 'separate')} onClick={() => setMode('separate')}>Un PDF par ligne (.zip)</button>
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
              <button style={btnSecondary} onClick={onClose}>Fermer</button>
              <button style={fields.length ? btnPrimary : btnDisabled} disabled={!fields.length || generating} onClick={generate}>
                {generating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {generating ? 'Génération…' : `Générer ${analysis.rowCount} document(s)`}
              </button>
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 8 }}>
            {mode === 'single'
              ? `Un PDF unique regroupant les ${analysis.rowCount} exemplaires (${analysis.pageCount} page(s) par exemplaire).`
              : `${analysis.rowCount} fichiers PDF regroupés dans une archive ZIP.`}
          </div>
        </div>
      )}

      {result && <div ref={resultRef}><ResultActions blob={result.blob} filename={result.filename} /></div>}

      {showSuccess && result && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setShowSuccess(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)', zIndex: 2300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div style={{ background: '#fff', borderRadius: 18, padding: '26px 28px', maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)' }}>
            <div style={{ width: 58, height: 58, margin: '0 auto 14px', borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CheckCircle2 size={32} color="#16a34a" />
            </div>
            <h3 style={{ margin: '0 0 6px', fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>Publipostage généré</h3>
            <p style={{ margin: '0 0 4px', fontSize: '0.88rem', color: '#475569' }}>
              {analysis ? `${analysis.rowCount} document(s) ` : 'Le document '}
              {mode === 'separate' ? 'générés dans une archive ZIP.' : 'générés dans un PDF unique.'}
            </p>
            <p style={{ margin: '0 0 18px', fontSize: '0.78rem', color: '#94a3b8', wordBreak: 'break-all' }}>{result.filename}</p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button style={btnSecondary} onClick={() => setShowSuccess(false)}>Fermer</button>
              <button style={btnPrimary} onClick={() => { setShowSuccess(false); setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 60); }}>
                Voir les actions
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .mm-scroll { scrollbar-width: thin; scrollbar-color: #94a3b8 #e2e8f0; }
        .mm-scroll::-webkit-scrollbar { width: 12px; height: 12px; }
        .mm-scroll::-webkit-scrollbar-track { background: #eef2f7; border-radius: 10px; }
        .mm-scroll::-webkit-scrollbar-thumb { background: #94a3b8; border-radius: 10px; border: 2px solid #eef2f7; }
        .mm-scroll::-webkit-scrollbar-thumb:hover { background: #64748b; }
      `}</style>
    </PdfToolShell>
  );
}

const fileBox = (set: File | null): React.CSSProperties => ({
  flex: 1, minWidth: 220, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
  border: `2px ${set ? 'solid' : 'dashed'} ${set ? '#0e7490' : '#cbd5e1'}`, borderRadius: 12,
  background: set ? '#f0fdfa' : '#f8fafc', cursor: 'pointer', color: '#334155', overflow: 'hidden',
});
const lbl: React.CSSProperties = { fontSize: '0.72rem', fontWeight: 700, color: '#64748b', display: 'flex', flexDirection: 'column', gap: 4, textTransform: 'uppercase', letterSpacing: '0.02em' };
const numInput: React.CSSProperties = { padding: '7px 9px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.82rem', fontWeight: 600, color: '#334155', background: '#fff', width: '100%', boxSizing: 'border-box' };
const miniBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0', background: '#fff', borderRadius: 7, padding: 4, cursor: 'pointer', color: '#475569' };
const toggleBtn = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
  border: `1px solid ${active ? '#0e7490' : '#e2e8f0'}`, background: active ? '#cffafe' : '#fff',
  color: active ? '#0e7490' : '#475569', fontWeight: 700, fontSize: '0.76rem',
});
