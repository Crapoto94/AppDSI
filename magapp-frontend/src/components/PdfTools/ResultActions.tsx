import React, { useEffect, useRef, useState } from 'react';
import { Download, Eye, Save, CheckCircle2, Loader2 } from 'lucide-react';
import { btnPrimary, btnSecondary, errorBox } from './PdfToolShell';
import { downloadBlob, saveResultToGed } from './pdfToolsApi';
import PdfViewerModal from './PdfViewerModal';

interface ResultActionsProps {
  blob: Blob;
  filename: string;
  /** Message contextuel optionnel affiché au-dessus des actions (ex: taille avant/après). */
  info?: React.ReactNode;
}

/**
 * Bloc d'actions affiché une fois un résultat produit : télécharger, aperçu,
 * et sauvegarde dans la PDFothèque. Fait défiler automatiquement la page vers
 * le bas pour rendre ces actions immédiatement visibles.
 */
export default function ResultActions({ blob, filename, info }: ResultActionsProps) {
  const [saveState, setSaveState] = useState<'idle' | 'asking' | 'saving' | 'saved' | 'error' | 'duplicate'>('idle');
  const [saveName, setSaveName] = useState(filename);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const isPreviewable = blob.type === 'application/pdf';
  const rootRef = useRef<HTMLDivElement>(null);

  // Amène la zone de résultat (télécharger / aperçu / PDFothèque) sous les yeux.
  useEffect(() => {
    const t = setTimeout(() => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 150);
    return () => clearTimeout(t);
  }, [blob]);

  const handleSave = async (overwrite = false) => {
    setSaveState('saving');
    setError(null);
    try {
      await saveResultToGed(blob, saveName.trim() || filename, { overwrite });
      setSaveState('saved');
    } catch (e: any) {
      if (e?.code === 'DUPLICATE') { setSaveState('duplicate'); return; }
      setError(e.message || 'Échec de la sauvegarde.');
      setSaveState('error');
    }
  };

  return (
    <div ref={rootRef} style={{ marginTop: '20px', padding: '18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 700, fontSize: '0.9rem', marginBottom: info ? 6 : 12 }}>
        <CheckCircle2 size={18} /> Traitement terminé
      </div>
      {info && <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: 12 }}>{info}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        <button style={btnPrimary} onClick={() => downloadBlob(blob, filename)}>
          <Download size={16} /> Télécharger
        </button>
        {isPreviewable && (
          <button style={btnSecondary} onClick={() => setShowPreview(true)}>
            <Eye size={16} /> Aperçu
          </button>
        )}
        {saveState === 'idle' && (
          <button style={btnSecondary} onClick={() => setSaveState('asking')}>
            <Save size={16} /> Enregistrer dans la PDFothèque
          </button>
        )}
      </div>

      {saveState === 'asking' && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ fontSize: '0.78rem', color: '#475569', marginBottom: 6 }}>
            Nom du document — il sera <strong>conservé 6 mois</strong> puis <strong>supprimé automatiquement</strong> de la PDFothèque.
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="Nom du document"
              style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem' }}
            />
            <button style={btnPrimary} onClick={() => handleSave(false)}>Confirmer</button>
            <button style={btnSecondary} onClick={() => setSaveState('idle')}>Annuler</button>
          </div>
        </div>
      )}

      {saveState === 'duplicate' && (
        <div style={{ marginTop: '14px', padding: '14px', border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: 10 }}>
          <div style={{ fontSize: '0.85rem', color: '#92400e', fontWeight: 700, marginBottom: 4 }}>
            Un document nommé « {saveName.trim() || filename} » existe déjà dans votre PDFothèque.
          </div>
          <div style={{ fontSize: '0.78rem', color: '#a16207', marginBottom: 10 }}>
            Écrasez-le (il sera remplacé par une nouvelle version) ou enregistrez sous un autre nom.
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={btnPrimary} onClick={() => handleSave(true)}>Écraser</button>
            <button style={btnSecondary} onClick={() => setSaveState('asking')}>Changer le nom</button>
          </div>
        </div>
      )}
      {saveState === 'saving' && (
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: '0.85rem' }}>
          <Loader2 size={16} className="animate-spin" /> Sauvegarde en cours...
        </div>
      )}
      {saveState === 'saved' && (
        <div style={{ marginTop: '12px', color: '#166534', fontSize: '0.85rem', fontWeight: 600 }}>
          Enregistré dans votre PDFothèque (conservé 6 mois).
        </div>
      )}
      {saveState === 'error' && error && <div style={errorBox}>{error}</div>}

      {showPreview && <PdfViewerModal blob={blob} title={filename} onClose={() => setShowPreview(false)} />}
    </div>
  );
}
