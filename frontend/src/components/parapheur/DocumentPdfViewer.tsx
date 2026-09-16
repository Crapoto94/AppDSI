import React, { useEffect, useState } from 'react';
import { ExternalLink, FileText, Loader2, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react';

interface Props {
  open: boolean;
  /** URL complète de l'API (protégée par JWT). */
  url: string;
  authToken?: string | null;
  title?: string;
  onClose: () => void;
}

/**
 * Visionneuse PDF intégrée (modale) avec zoom.
 *
 * On récupère le binaire avec le JWT puis on l'affiche via le lecteur PDF natif
 * du navigateur dans une iframe : contrairement au rendu canvas de pdf.js, cela
 * gère tous les types de PDF (notamment les scans image — CCITT/JBIG2) sans
 * risque de page blanche. Le zoom est piloté par les paramètres d'ouverture PDF
 * (`#zoom=`) supportés par les lecteurs Chrome/Edge/Firefox.
 */
export default function DocumentPdfViewer({ open, url, authToken, title, onClose }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string>('page-width');

  useEffect(() => {
    let cancelled = false;
    let created: string | null = null;

    const run = async () => {
      if (!open || !url) { setBlobUrl(null); return; }
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(url, { headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} });
        if (!r.ok) throw new Error(r.status === 403 ? 'Accès refusé' : `Erreur ${r.status}`);
        const b = await r.blob();
        if (cancelled) return;
        created = URL.createObjectURL(new Blob([b], { type: 'application/pdf' }));
        setBlobUrl(created);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Document introuvable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [open, url, authToken]);

  useEffect(() => { if (open) setZoom('page-width'); }, [open, url]);

  const level = zoom === 'page-width' ? 100 : parseInt(zoom, 10) || 100;
  const setPct = (n: number) => setZoom(String(Math.min(400, Math.max(50, n))));
  const zoomOut = () => setPct(level - 25);
  const zoomIn = () => setPct(level + 25);
  const openInTab = () => { if (blobUrl) window.open(blobUrl, '_blank', 'noopener'); };

  if (!open) return null;

  const src = blobUrl ? `${blobUrl}#zoom=${zoom === 'page-width' ? 'page-width' : level}&toolbar=1&navpanes=0` : '';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 960, maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={18} color="#ef4444" />
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || 'Document'}</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid #e2e8f0', borderRadius: 8, padding: 2 }}>
            <button onClick={zoomOut} disabled={level <= 50} title="Réduire" style={zoomBtn(level <= 50)}><ZoomOut size={15} /></button>
            <span style={{ minWidth: 44, textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#475569' }}>{zoom === 'page-width' ? 'Largeur' : `${level}%`}</span>
            <button onClick={zoomIn} disabled={level >= 400} title="Agrandir" style={zoomBtn(level >= 400)}><ZoomIn size={15} /></button>
          </div>
          <button onClick={() => setZoom('page-width')} title="Ajuster à la largeur" style={{ ...zoomTextBtn, background: zoom === 'page-width' ? '#ede9fe' : '#fff', color: zoom === 'page-width' ? '#6d28d9' : '#475569' }}>
            <Maximize2 size={14} /> Largeur
          </button>
          <button onClick={openInTab} disabled={!blobUrl} title="Ouvrir dans un onglet" style={zoomTextBtn}>
            <ExternalLink size={14} />
          </button>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={20} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
          {loading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 320, color: '#64748b' }}><Loader2 className="spin" size={30} /></div>}
          {error && <div style={{ margin: 16, padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>{error}</div>}
          {!loading && !error && blobUrl && (
            <iframe key={`${blobUrl}-${zoom}`} src={src} title={title || 'Document PDF'} style={{ width: '100%', height: '80vh', border: 'none', display: 'block' }} />
          )}
        </div>
      </div>
    </div>
  );
}

const zoomBtn = (disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26,
  border: 'none', background: 'transparent', borderRadius: 6, cursor: disabled ? 'not-allowed' : 'pointer',
  color: disabled ? '#cbd5e1' : '#475569',
});

const zoomTextBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', border: '1px solid #e2e8f0',
  borderRadius: 8, background: '#fff', color: '#475569', fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
