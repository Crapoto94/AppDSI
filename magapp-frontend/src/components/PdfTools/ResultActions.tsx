import React, { useState } from 'react';
import { Download, Eye, Save, CheckCircle2, Loader2 } from 'lucide-react';
import { btnPrimary, btnSecondary, errorBox } from './PdfToolShell';
import { downloadBlob, openBlob, saveResultToGed } from './pdfToolsApi';

interface ResultActionsProps {
  blob: Blob;
  filename: string;
  /** Message contextuel optionnel affiché au-dessus des actions (ex: taille avant/après). */
  info?: React.ReactNode;
}

/**
 * Bloc d'actions affiché une fois un résultat produit : télécharger, aperçu,
 * et sauvegarde dans le dossier GED personnel de l'agent (storage/pdf-tools/<username>/).
 */
export default function ResultActions({ blob, filename, info }: ResultActionsProps) {
  const [saveState, setSaveState] = useState<'idle' | 'asking' | 'saving' | 'saved' | 'error'>('idle');
  const [saveName, setSaveName] = useState(filename);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaveState('saving');
    setError(null);
    try {
      await saveResultToGed(blob, saveName.trim() || filename);
      setSaveState('saved');
    } catch (e: any) {
      setError(e.message || 'Échec de la sauvegarde.');
      setSaveState('error');
    }
  };

  return (
    <div style={{ marginTop: '20px', padding: '18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534', fontWeight: 700, fontSize: '0.9rem', marginBottom: info ? 6 : 12 }}>
        <CheckCircle2 size={18} /> Traitement terminé
      </div>
      {info && <div style={{ fontSize: '0.82rem', color: '#475569', marginBottom: 12 }}>{info}</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
        <button style={btnPrimary} onClick={() => downloadBlob(blob, filename)}>
          <Download size={16} /> Télécharger
        </button>
        <button style={btnSecondary} onClick={() => openBlob(blob)}>
          <Eye size={16} /> Aperçu
        </button>
        {saveState === 'idle' && (
          <button style={btnSecondary} onClick={() => setSaveState('asking')}>
            <Save size={16} /> Enregistrer dans la GED
          </button>
        )}
      </div>

      {saveState === 'asking' && (
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            style={{ flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.85rem' }}
          />
          <button style={btnPrimary} onClick={handleSave}>Confirmer</button>
          <button style={btnSecondary} onClick={() => setSaveState('idle')}>Annuler</button>
        </div>
      )}
      {saveState === 'saving' && (
        <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: 8, color: '#64748b', fontSize: '0.85rem' }}>
          <Loader2 size={16} className="animate-spin" /> Sauvegarde en cours...
        </div>
      )}
      {saveState === 'saved' && (
        <div style={{ marginTop: '12px', color: '#166534', fontSize: '0.85rem', fontWeight: 600 }}>
          Enregistré dans votre dossier GED personnel (Outils PDF).
        </div>
      )}
      {saveState === 'error' && error && <div style={errorBox}>{error}</div>}
    </div>
  );
}
