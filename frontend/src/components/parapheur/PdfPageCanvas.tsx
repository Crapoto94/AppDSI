import React, { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { PageSize } from './pdf';

interface Props {
  doc: PDFDocumentProxy;
  page: number;
  onSize?: (size: PageSize) => void;
  children?: React.ReactNode;
}

/** Rend une page PDF dans un <canvas> à la largeur du conteneur, avec overlay enfant. */
export default function PdfPageCanvas({ doc, page, onSize, children }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const onSizeRef = useRef(onSize);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => { onSizeRef.current = onSize; }, [onSize]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!doc || !canvas) return;

    const run = async () => {
      // pdf.js interdit deux render() concurrents sur le même canvas, ce qui se
      // produit avec le StrictMode de React (double exécution des effets) : on
      // attend donc la fin/annulation du rendu précédent avant de démarrer.
      const prev = renderTaskRef.current;
      if (prev) {
        try { prev.cancel(); } catch { /* ignore */ }
        try { await prev.promise; } catch { /* annulé */ }
      }
      if (cancelled) return;

      try {
        setRenderError(null);
        const safePage = Math.max(1, Math.min(page || 1, doc.numPages || 1));
        const p = await doc.getPage(safePage);
        if (cancelled) return;
        const containerWidth = wrapRef.current?.clientWidth || 700;
        const base = p.getViewport({ scale: 1 });
        const scale = containerWidth / base.width;
        const vp = p.getViewport({ scale });
        canvas.width = Math.round(vp.width);
        canvas.height = Math.round(vp.height);
        const task = p.render({ canvas, viewport: vp });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) onSizeRef.current?.({ width: canvas.width, height: canvas.height, baseWidth: base.width, baseHeight: base.height });
      } catch (e: unknown) {
        const name = e && typeof e === 'object' && 'name' in e ? (e as { name?: string }).name : '';
        if (name !== 'RenderingCancelledException') {
          console.error('[PDF render]', e);
          if (!cancelled) setRenderError("Impossible d'afficher le document.");
        }
      }
    };
    run();

    return () => {
      cancelled = true;
      const t = renderTaskRef.current;
      if (t) { try { t.cancel(); } catch { /* ignore */ } }
    };
  }, [doc, page]);

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <canvas ref={canvasRef} style={{ width: '100%', display: 'block', borderRadius: 4, background: '#fff' }} />
      {renderError && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', color: '#b91c1c', fontSize: 12, fontWeight: 600, borderRadius: 4 }}>
          {renderError}
        </div>
      )}
      {children}
    </div>
  );
}
