import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, FileText, Loader2, X } from 'lucide-react';
import PdfPageCanvas from './PdfPageCanvas';
import { usePdfDocument } from './pdf';

interface Props {
  open: boolean;
  /** URL complète de l'API (protégée par JWT). */
  url: string;
  authToken?: string | null;
  title?: string;
  onClose: () => void;
}

/** Visionneuse PDF intégrée (modale) — remplace l'ouverture dans un nouvel onglet. */
export default function DocumentPdfViewer({ open, url, authToken, title, onClose }: Props) {
  const { doc, loading, error } = usePdfDocument(open ? { url } : null, authToken);
  const [page, setPage] = useState(1);

  if (!open) return null;

  const total = doc?.numPages || 1;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 900, maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={18} color="#ef4444" />
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || 'Document'}</span>
          {doc && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={navBtn(page <= 1)}><ChevronLeft size={16} /></button>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#475569', minWidth: 50, textAlign: 'center' }}>{page} / {total}</span>
              <button onClick={() => setPage(p => Math.min(total, p + 1))} disabled={page >= total} style={navBtn(page >= total)}><ChevronRight size={16} /></button>
            </div>
          )}
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={20} /></button>
        </div>
        <div style={{ padding: 16, overflowY: 'auto', background: '#f1f5f9' }}>
          {loading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: '#64748b' }}><Loader2 className="spin" size={30} /></div>}
          {error && <div style={{ padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>{error}</div>}
          {doc && <PdfPageCanvas doc={doc} page={page} />}
        </div>
      </div>
    </div>
  );
}

function navBtn(disabled: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1 };
}
