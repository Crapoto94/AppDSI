import { useEffect, useState } from 'react';
import { X, Loader2 } from 'lucide-react';

interface PdfViewerModalProps {
  /** Document déjà en mémoire (aperçu depuis un résultat généré). */
  blob?: Blob;
  /** Chargeur paresseux : la visionneuse s'ouvre immédiatement, le fichier est
   *  chargé derrière (évite l'impression de « plantage » sur les gros PDF). */
  loader?: () => Promise<Blob>;
  title?: string;
  onClose: () => void;
}

/**
 * Visionneuse PDF interne (iframe dans une modale de l'app, jamais un nouvel
 * onglet). L'ouverture est IMMÉDIATE : un indicateur s'affiche pendant le
 * téléchargement/chargement du document, puis le rendu.
 */
export default function PdfViewerModal({ blob, loader, title, onClose }: PdfViewerModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setBlobUrl(null);
    setRendered(false);
    setError(null);

    (async () => {
      try {
        const b = blob || (loader ? await loader() : null);
        if (!b) throw new Error('Document indisponible.');
        if (cancelled) return;
        objectUrl = URL.createObjectURL(b);
        setBlobUrl(objectUrl);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Échec du chargement du document.');
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blob, loader]);

  const loading = !error && !rendered;

  return (
    <div className="modal-overlay" style={{ zIndex: 2200 }}>
      <div className="modal-content" style={{ width: '95vw', height: '90vh', maxWidth: '1200px' }}>
        <div className="modal-header" style={{ padding: '16px 24px' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title || 'Aperçu du document'}</h2>
          <button className="close-button" onClick={onClose}><X size={20} /></button>
        </div>
        <div style={{ flex: 1, background: '#f1f5f9', position: 'relative', minHeight: 0 }}>
          {error ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#b91c1c', padding: 24, textAlign: 'center' }}>
              {error}
            </div>
          ) : (
            <>
              {blobUrl && (
                <iframe
                  src={blobUrl}
                  onLoad={() => setRendered(true)}
                  style={{ width: '100%', height: '100%', border: 'none', opacity: rendered ? 1 : 0, transition: 'opacity .2s' }}
                  title={title || 'Aperçu du document'}
                />
              )}
              {loading && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: '#f8fafc', color: '#64748b' }}>
                  <Loader2 size={28} className="animate-spin" color="#0e7490" />
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>Chargement du document…</div>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Les fichiers volumineux peuvent prendre un instant avant leur affichage.</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
