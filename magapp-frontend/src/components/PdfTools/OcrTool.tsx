import { useState } from 'react';
import { ScanText, Paperclip, Loader2 } from 'lucide-react';
import PdfToolShell, { btnPrimary, btnDisabled, btnSecondary, errorBox } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob } from './pdfToolsApi';

interface OcrToolProps { onClose: () => void }

export default function OcrTool({ onClose }: OcrToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; info: string } | null>(null);

  const handleRun = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('lang', 'fra');
      const { blob, headers } = await postFormForBlob('/ocr', formData, "Échec de la reconnaissance de texte.");
      const already = headers.get('x-was-already-searchable') === 'true';
      const processed = headers.get('x-pages-processed');
      const total = headers.get('x-total-pages');
      setResult({
        blob,
        info: already
          ? "Ce PDF contenait déjà du texte sélectionnable ; une couche de reconnaissance a tout de même été ajoutée."
          : `Texte reconnu sur ${processed} page(s) sur ${total}. Le document est maintenant cherchable et son texte peut être sélectionné/copié.`,
      });
    } catch (e: any) {
      setError(e.message || "Échec de la reconnaissance de texte.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PdfToolShell
      icon={<ScanText size={26} color="#0e7490" />}
      iconBg="#cffafe"
      title="Rendre un PDF cherchable (OCR)"
      description="Reconnaît le texte d'un PDF scanné et l'ajoute en couche invisible, sans modifier l'apparence des pages."
      onClose={onClose}
    >
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#f1f5f9', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
        <Paperclip size={16} /> {file ? file.name : 'Choisir un PDF scanné'}
        <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />
      </label>

      <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 10 }}>
        Traitement limité à 30 pages par document et peut prendre plusieurs dizaines de secondes selon la longueur du PDF.
      </p>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
        <button style={btnSecondary} onClick={onClose}>Annuler</button>
        <button style={file && !loading ? btnPrimary : btnDisabled} disabled={!file || loading} onClick={handleRun}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <ScanText size={16} />}
          {loading ? 'Reconnaissance en cours...' : 'Lancer la reconnaissance'}
        </button>
      </div>

      {result && <ResultActions blob={result.blob} filename="ocr.pdf" info={result.info} />}
    </PdfToolShell>
  );
}
