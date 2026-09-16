import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import PdfPageCanvas from './PdfPageCanvas';
import { usePdfDocument } from './pdf';

interface Props {
  file?: File;
  width?: number;
  /** Remonte le nombre de pages une fois le document chargé. */
  onPages?: (n: number) => void;
}

/** Petite prévisualisation (page 1) d'un PDF local, avec comptage des pages. */
export default function PdfThumb({ file, width = 110, onPages }: Props) {
  const { doc, loading, error } = usePdfDocument(file ? { file } : null);

  useEffect(() => {
    if (doc) onPages?.(doc.numPages);
  }, [doc, onPages]);

  const ratio = 1.3;
  if (loading) {
    return (
      <div style={{ width, height: width * ratio, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 6 }}>
        <Loader2 size={16} className="spin" color="#94a3b8" />
      </div>
    );
  }
  if (error || !doc) {
    return (
      <div style={{ width, height: width * ratio, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, color: '#b91c1c', fontSize: 10, textAlign: 'center', padding: 4 }}>
        Aperçu indisponible
      </div>
    );
  }
  return (
    <div style={{ width, border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
      <PdfPageCanvas doc={doc} page={1} />
    </div>
  );
}
