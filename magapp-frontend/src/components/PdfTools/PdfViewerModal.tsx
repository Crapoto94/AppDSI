import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface PdfViewerModalProps {
  blob: Blob;
  title?: string;
  onClose: () => void;
}

/**
 * Visionneuse PDF interne (même schéma que la modale « Doc Viewer » de la
 * bibliothèque MagApp : iframe dans une modale de l'app, jamais un nouvel
 * onglet du navigateur).
 */
export default function PdfViewerModal({ blob, title, onClose }: PdfViewerModalProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  return (
    <div className="modal-overlay" style={{ zIndex: 2200 }}>
      <div className="modal-content" style={{ width: '95vw', height: '90vh', maxWidth: '1200px' }}>
        <div className="modal-header" style={{ padding: '16px 24px' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{title || 'Aperçu du document'}</h2>
          <button className="close-button" onClick={onClose}><X size={20} /></button>
        </div>
        <div style={{ flex: 1, background: '#f1f5f9', position: 'relative' }}>
          {blobUrl && (
            <iframe
              src={blobUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
              title={title || 'Aperçu du document'}
            />
          )}
        </div>
      </div>
    </div>
  );
}
