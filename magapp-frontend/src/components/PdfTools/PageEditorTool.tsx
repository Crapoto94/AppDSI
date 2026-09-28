import React, { useState } from 'react';
import { Scissors, Paperclip, RotateCw, Loader2, Eye, EyeOff } from 'lucide-react';
import PdfToolShell, { btnPrimary, btnDisabled, btnSecondary, errorBox } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob, postFormForJson } from './pdfToolsApi';

interface PageEditorToolProps { onClose: () => void }

interface PageItem {
  originalIndex: number;
  included: boolean;
  rotate: number; // delta cumulé (0/90/180/270)
  dataUrl: string;
}

export default function PageEditorTool({ onClose }: PageEditorToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [cuts, setCuts] = useState<Set<number>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [loadingThumbs, setLoadingThumbs] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);

  const openFile = async (list: FileList | null) => {
    const f = list && list[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    setLoadingThumbs(true);
    try {
      const formData = new FormData();
      formData.append('file', f);
      const data = await postFormForJson<{ pageCount: number; pages: { index: number; dataUrl: string }[] }>('/thumbnails', formData, 'Impossible de générer les aperçus.');
      setPages(data.pages.map((p) => ({ originalIndex: p.index, included: true, rotate: 0, dataUrl: p.dataUrl })));
      setCuts(new Set());
    } catch (e: any) {
      setError(e.message || 'Impossible de générer les aperçus.');
    } finally {
      setLoadingThumbs(false);
    }
  };

  const toggleIncluded = (idx: number) => setPages((prev) => prev.map((p, i) => (i === idx ? { ...p, included: !p.included } : p)));
  const rotatePage = (idx: number) => setPages((prev) => prev.map((p, i) => (i === idx ? { ...p, rotate: (p.rotate + 90) % 360 } : p)));
  const toggleCut = (position: number) => setCuts((prev) => {
    const next = new Set(prev);
    if (next.has(position)) next.delete(position); else next.add(position);
    return next;
  });

  const onDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    setPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  const handleApply = async () => {
    if (!file) return;
    setApplying(true);
    setError(null);
    try {
      const plan = {
        pages: pages.map((p) => ({ originalIndex: p.originalIndex, included: p.included, rotate: p.rotate })),
        cuts: Array.from(cuts),
      };
      const formData = new FormData();
      formData.append('file', file);
      formData.append('plan', JSON.stringify(plan));
      const { blob, filename } = await postFormForBlob('/pages/apply', formData, "Échec de l'application des modifications.");
      setResult({ blob, filename: blob.type === 'application/zip' ? 'documents.zip' : filename });
    } catch (e: any) {
      setError(e.message || "Échec de l'application des modifications.");
    } finally {
      setApplying(false);
    }
  };

  const includedCount = pages.filter((p) => p.included).length;
  const segmentCount = cuts.size + 1;

  return (
    <PdfToolShell
      icon={<Scissors size={26} color="#7c2d12" />}
      iconBg="#ffedd5"
      title="Découper / réorganiser les pages"
      description="Ouvrez un PDF, cochez les pages à garder, glissez-les pour les réordonner, tournez-les, et posez des coupures pour obtenir plusieurs fichiers."
      onClose={onClose}
      maxWidth={880}
    >
      {!file && (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#f1f5f9', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
          <Paperclip size={16} /> Ouvrir un PDF
          <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => openFile(e.target.files)} />
        </label>
      )}

      {loadingThumbs && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', marginTop: 16 }}>
          <Loader2 size={18} className="animate-spin" /> Génération des aperçus de pages...
        </div>
      )}

      {pages.length > 0 && !loadingThumbs && (
        <>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '16px 0 10px' }}>
            {pages.length} page(s) · {includedCount} conservée(s) · {segmentCount} fichier(s) en sortie.
            Cliquez sur les ciseaux entre deux pages pour couper, cochez/décochez pour garder/exclure, glissez pour réordonner.
          </p>
          <div style={{ display: 'flex', overflowX: 'auto', gap: 0, padding: '8px 4px 16px', alignItems: 'flex-start' }}>
            {pages.map((page, idx) => (
              <React.Fragment key={`${page.originalIndex}-${idx}`}>
                {idx > 0 && (
                  <button
                    onClick={() => toggleCut(idx)}
                    title={cuts.has(idx) ? 'Retirer la coupure' : 'Couper ici'}
                    style={{
                      alignSelf: 'center', width: 28, height: 28, minWidth: 28, borderRadius: '50%', border: 'none', cursor: 'pointer',
                      background: cuts.has(idx) ? '#dc2626' : '#e2e8f0', color: cuts.has(idx) ? '#fff' : '#64748b',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 2px',
                    }}
                  >
                    <Scissors size={14} />
                  </button>
                )}
                <div
                  draggable
                  onDragStart={() => setDragIndex(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(idx)}
                  style={{
                    width: 130, minWidth: 130, border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px', cursor: 'grab',
                    background: page.included ? '#fff' : '#f8fafc', opacity: page.included ? 1 : 0.5, position: 'relative',
                  }}
                >
                  <div style={{ position: 'relative', overflow: 'hidden', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                    <img
                      src={page.dataUrl}
                      alt={`Page ${page.originalIndex + 1}`}
                      style={{ width: '100%', display: 'block', transform: `rotate(${page.rotate}deg)`, transition: 'transform 0.15s' }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Page {page.originalIndex + 1}</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button title="Tourner de 90°" onClick={() => rotatePage(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#64748b' }}>
                        <RotateCw size={15} />
                      </button>
                      <button title={page.included ? 'Exclure cette page' : 'Inclure cette page'} onClick={() => toggleIncluded(idx)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: page.included ? '#0078a4' : '#94a3b8' }}>
                        {page.included ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </>
      )}

      {error && <div style={errorBox}>{error}</div>}

      {pages.length > 0 && (
        <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
          <button style={btnSecondary} onClick={onClose}>Fermer</button>
          <button
            style={includedCount > 0 && !applying ? btnPrimary : btnDisabled}
            disabled={includedCount === 0 || applying}
            onClick={handleApply}
          >
            {applying ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} />}
            {applying ? 'Traitement...' : `Valider (${segmentCount} fichier${segmentCount > 1 ? 's' : ''})`}
          </button>
        </div>
      )}

      {result && <ResultActions blob={result.blob} filename={result.filename} />}
    </PdfToolShell>
  );
}
