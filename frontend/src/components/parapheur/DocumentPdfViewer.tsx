import React, { useEffect, useState } from 'react';
import { FileText, Loader2, X } from 'lucide-react';

interface Props {
  open: boolean;
  /** URL complète de l'API (protégée par JWT). */
  url: string;
  authToken?: string | null;
  title?: string;
  onClose: () => void;
}

/**
 * Visionneuse PDF intégrée (modale).
 *
 * On récupère le binaire avec le JWT puis on l'affiche via le lecteur PDF natif
 * du navigateur dans une iframe : contrairement au rendu canvas de pdf.js, cela
 * gère tous les types de PDF (notamment les scans image — CCITT/JBIG2) sans
 * risque de page blanche. Le document reste affiché dans la visionneuse (pas de
 * nouvel onglet).
 */
export default function DocumentPdfViewer({ open, url, authToken, title, onClose }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 960, maxHeight: '95vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10 }}>
          <FileText size={18} color="#ef4444" />
          <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || 'Document'}</span>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}><X size={20} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
          {loading && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, minHeight: 320, color: '#64748b' }}><Loader2 className="spin" size={30} /></div>}
          {error && <div style={{ margin: 16, padding: 16, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: 13 }}>{error}</div>}
          {!loading && !error && blobUrl && (
            <iframe src={blobUrl} title={title || 'Document PDF'} style={{ width: '100%', height: '80vh', border: 'none', display: 'block' }} />
          )}
        </div>
      </div>
    </div>
  );
}
