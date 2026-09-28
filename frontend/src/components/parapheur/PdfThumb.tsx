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

/** Aperçu d'un PDF local (page 1) + comptage des pages. */
export default function PdfThumb(props: Props) {
  return (
    <ThumbBoundary width={props.width || 110}>
      <PdfThumbInner {...props} />
    </ThumbBoundary>
  );
}

function PdfThumbInner({ file, width = 110, onPages }: Props) {
  const { doc, loading, error } = usePdfDocument(file ? { file } : null);

  useEffect(() => {
    if (doc) onPages?.(doc.numPages);
  }, [doc, onPages]);

  if (loading) return <Fallback width={width} loading />;
  if (error || !doc) return <Fallback width={width} />;
  return (
    <div style={{ width, border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', background: '#fff' }}>
      <PdfPageCanvas doc={doc} page={1} />
    </div>
  );
}

function Fallback({ width, loading }: { width: number; loading?: boolean }) {
  return (
    <div style={{ width, height: width * 1.3, display: 'flex', alignItems: 'center', justifyContent: 'center', background: loading ? '#f1f5f9' : '#fef2f2', border: `1px solid ${loading ? '#e2e8f0' : '#fecaca'}`, borderRadius: 6, color: '#b91c1c', fontSize: 10, textAlign: 'center', padding: 4 }}>
      {loading ? <Loader2 size={16} className="spin" color="#94a3b8" /> : 'Aperçu indisponible'}
    </div>
  );
}

/** Empêche une erreur de rendu pdf.js de faire tomber le formulaire parent. */
class ThumbBoundary extends React.Component<{ children: React.ReactNode; width: number }, { failed: boolean }> {
  constructor(props: { children: React.ReactNode; width: number }) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[PdfThumb] aperçu impossible:', error);
  }
  render() {
    if (this.state.failed) return <Fallback width={this.props.width} />;
    return this.props.children;
  }
}
