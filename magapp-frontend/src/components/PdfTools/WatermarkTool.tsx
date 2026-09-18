import { useState } from 'react';
import { Stamp, Paperclip, Loader2 } from 'lucide-react';
import PdfToolShell, { btnPrimary, btnDisabled, btnSecondary, errorBox } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob } from './pdfToolsApi';

interface WatermarkToolProps { onClose: () => void }

export default function WatermarkTool({ onClose }: WatermarkToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('CONFIDENTIEL');
  const [image, setImage] = useState<File | null>(null);
  const [opacity, setOpacity] = useState(0.3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Blob | null>(null);

  const canSubmit = !!file && (mode === 'text' ? text.trim().length > 0 : !!image);

  const handleApply = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('opacity', String(opacity));
      if (mode === 'text') {
        formData.append('text', text);
      } else if (image) {
        formData.append('image', image);
      }
      const { blob } = await postFormForBlob('/watermark', formData, "Échec de l'ajout du filigrane.");
      setResult(blob);
    } catch (e: any) {
      setError(e.message || "Échec de l'ajout du filigrane.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PdfToolShell
      icon={<Stamp size={26} color="#6d28d9" />}
      iconBg="#ede9fe"
      title="Ajouter un filigrane"
      description="Superpose un texte ou un logo sur toutes les pages (ex : Brouillon, Confidentiel)."
      onClose={onClose}
    >
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#f1f5f9', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
        <Paperclip size={16} /> {file ? file.name : 'Choisir un PDF'}
        <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />
      </label>

      <div style={{ marginTop: '16px', display: 'flex', gap: '16px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem', cursor: 'pointer' }}>
          <input type="radio" checked={mode === 'text'} onChange={() => setMode('text')} /> Texte
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem', cursor: 'pointer' }}>
          <input type="radio" checked={mode === 'image'} onChange={() => setMode('image')} /> Image / logo
        </label>
      </div>

      {mode === 'text' ? (
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Texte du filigrane"
          style={{ marginTop: '10px', width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: '8px', fontSize: '0.9rem' }}
        />
      ) : (
        <label style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: '#f1f5f9', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
          <Paperclip size={14} /> {image ? image.name : 'Choisir une image'}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => setImage(e.target.files?.[0] || null)} />
        </label>
      )}

      <div style={{ marginTop: '16px' }}>
        <label style={{ fontSize: '0.82rem', color: '#475569' }}>Opacité : {Math.round(opacity * 100)}%</label>
        <input type="range" min={0.05} max={0.8} step={0.05} value={opacity} onChange={(e) => setOpacity(parseFloat(e.target.value))} style={{ width: '100%' }} />
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
        <button style={btnSecondary} onClick={onClose}>Annuler</button>
        <button style={canSubmit && !loading ? btnPrimary : btnDisabled} disabled={!canSubmit || loading} onClick={handleApply}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Stamp size={16} />}
          {loading ? 'Application en cours...' : 'Appliquer le filigrane'}
        </button>
      </div>

      {result && <ResultActions blob={result} filename="filigrane.pdf" />}
    </PdfToolShell>
  );
}
