import { useState } from 'react';
import { Hash, Paperclip, Loader2 } from 'lucide-react';
import PdfToolShell, { btnPrimary, btnDisabled, btnSecondary, errorBox } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob } from './pdfToolsApi';

interface PageNumbersToolProps { onClose: () => void }

const POSITIONS = [
  { key: 'bottom-left', label: 'Bas gauche' },
  { key: 'bottom-center', label: 'Bas centre' },
  { key: 'bottom-right', label: 'Bas droite' },
  { key: 'top-left', label: 'Haut gauche' },
  { key: 'top-center', label: 'Haut centre' },
  { key: 'top-right', label: 'Haut droite' },
];

export default function PageNumbersTool({ onClose }: PageNumbersToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [position, setPosition] = useState('bottom-center');
  const [startAt, setStartAt] = useState(1);
  const [format, setFormat] = useState('{page}');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Blob | null>(null);

  const handleApply = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('position', position);
      formData.append('startAt', String(startAt));
      formData.append('format', format);
      const { blob } = await postFormForBlob('/page-numbers', formData, 'Échec de la numérotation.');
      setResult(blob);
    } catch (e: any) {
      setError(e.message || 'Échec de la numérotation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PdfToolShell
      icon={<Hash size={26} color="#1d4ed8" />}
      iconBg="#dbeafe"
      title="Numéroter les pages"
      description="Insère automatiquement un numéro de page sur chaque page du document."
      onClose={onClose}
    >
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#f1f5f9', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
        <Paperclip size={16} /> {file ? file.name : 'Choisir un PDF'}
        <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />
      </label>

      <div style={{ marginTop: '16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
        {POSITIONS.map((p) => (
          <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', cursor: 'pointer', padding: '6px 8px', border: `1px solid ${position === p.key ? '#0078a4' : '#e2e8f0'}`, borderRadius: 8 }}>
            <input type="radio" checked={position === p.key} onChange={() => setPosition(p.key)} /> {p.label}
          </label>
        ))}
      </div>

      <div style={{ marginTop: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#475569', display: 'block', marginBottom: 4 }}>Commencer à</label>
          <input type="number" min={1} value={startAt} onChange={(e) => setStartAt(parseInt(e.target.value, 10) || 1)} style={{ width: 90, padding: '8px', border: '1px solid #cbd5e1', borderRadius: 8 }} />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', color: '#475569', display: 'block', marginBottom: 4 }}>Format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ padding: '8px', border: '1px solid #cbd5e1', borderRadius: 8 }}>
            <option value="{page}">1, 2, 3...</option>
            <option value="Page {page}">Page 1, Page 2...</option>
            <option value="{page} / {total}">1 / N, 2 / N...</option>
          </select>
        </div>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
        <button style={btnSecondary} onClick={onClose}>Annuler</button>
        <button style={file && !loading ? btnPrimary : btnDisabled} disabled={!file || loading} onClick={handleApply}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Hash size={16} />}
          {loading ? 'Application en cours...' : 'Numéroter'}
        </button>
      </div>

      {result && <ResultActions blob={result} filename="numerote.pdf" />}
    </PdfToolShell>
  );
}
