import { useState } from 'react';
import { Images, Paperclip, Loader2 } from 'lucide-react';
import PdfToolShell, { btnPrimary, btnDisabled, btnSecondary, errorBox } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob } from './pdfToolsApi';

interface ToImagesToolProps { onClose: () => void }

export default function ToImagesTool({ onClose }: ToImagesToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'png' | 'jpeg'>('png');
  const [dpi, setDpi] = useState(300);
  const [transparent, setTransparent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; filename: string } | null>(null);

  const handleConvert = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('format', format);
      formData.append('dpi', String(dpi));
      formData.append('transparent', transparent ? 'true' : 'false');
      const { blob, filename } = await postFormForBlob('/to-images', formData, "Échec de l'export en images.");
      setResult({ blob, filename: blob.type === 'application/zip' ? 'pages.zip' : filename });
    } catch (e: any) {
      setError(e.message || "Échec de l'export en images.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PdfToolShell
      icon={<Images size={26} color="#a16207" />}
      iconBg="#fef9c3"
      title="Convertir en images"
      description="Exporte chaque page du PDF en image PNG ou JPEG."
      onClose={onClose}
    >
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#f1f5f9', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
        <Paperclip size={16} /> {file ? file.name : 'Choisir un PDF'}
        <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />
      </label>

      <div style={{ marginTop: '16px', display: 'flex', gap: '16px' }}>
        {(['png', 'jpeg'] as const).map((f) => (
          <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.88rem', color: '#334155', cursor: 'pointer' }}>
            <input type="radio" name="format" checked={format === f} onChange={() => setFormat(f)} />
            {f.toUpperCase()}
          </label>
        ))}
      </div>
      <div style={{ marginTop: '16px', display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: '0.86rem', color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
          Qualité / résolution
          <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', background: '#fff' }}>
            <option value={150}>Web — 150 dpi (léger)</option>
            <option value={300}>Standard — 300 dpi (recommandé)</option>
            <option value={450}>Haute — 450 dpi</option>
            <option value={600}>Impression — 600 dpi (lourd)</option>
          </select>
        </label>
        {format === 'png' && (
          <label style={{ fontSize: '0.86rem', color: '#334155', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)} />
            Rendre le blanc transparent
          </label>
        )}
      </div>
      <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 8 }}>PNG : qualité (fichiers plus lourds), transparence possible. JPEG : plus compact, fond blanc.</p>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
        <button style={btnSecondary} onClick={onClose}>Annuler</button>
        <button style={file && !loading ? btnPrimary : btnDisabled} disabled={!file || loading} onClick={handleConvert}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Images size={16} />}
          {loading ? 'Conversion en cours...' : 'Convertir'}
        </button>
      </div>

      {result && <ResultActions blob={result.blob} filename={result.filename} />}
    </PdfToolShell>
  );
}
