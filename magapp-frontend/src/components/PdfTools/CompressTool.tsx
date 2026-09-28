import { useState } from 'react';
import { Minimize2, Paperclip, Loader2 } from 'lucide-react';
import PdfToolShell, { btnPrimary, btnDisabled, btnSecondary, errorBox } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob } from './pdfToolsApi';

interface CompressToolProps { onClose: () => void }

const LEVELS = [
  { key: 'low', label: 'Faible', desc: "Réduction légère de la résolution des images. Aucune perte visible à l'écran ou à l'impression standard." },
  { key: 'medium', label: 'Moyenne', desc: "Bon compromis. Les images restent nettes à l'écran ; un léger flou peut apparaître en zoomant fortement." },
  { key: 'high', label: 'Forte', desc: "Réduction maximale de la taille. Les images perdent en netteté, à réserver aux documents à archiver ou envoyer par e-mail." },
];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

export default function CompressTool({ onClose }: CompressToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [level, setLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ blob: Blob; original: number; compressed: number; imagesTouched: number } | null>(null);

  const handleCompress = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('level', level);
      const { blob, headers } = await postFormForBlob('/compress', formData, 'Échec de la compression.');
      setResult({
        blob,
        original: parseInt(headers.get('x-original-size') || String(file.size), 10),
        compressed: parseInt(headers.get('x-compressed-size') || String(blob.size), 10),
        imagesTouched: parseInt(headers.get('x-images-touched') || '0', 10),
      });
    } catch (e: any) {
      setError(e.message || 'Échec de la compression.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PdfToolShell
      icon={<Minimize2 size={26} color="#166534" />}
      iconBg="#dcfce7"
      title="Réduire la taille d'un PDF"
      description="Compresse les images intégrées au PDF (JPEG) pour réduire le poids du fichier."
      onClose={onClose}
    >
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#f1f5f9', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
        <Paperclip size={16} /> {file ? file.name : 'Choisir un PDF'}
        <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />
      </label>

      <div style={{ marginTop: '18px', display: 'grid', gap: '10px' }}>
        {LEVELS.map((l) => (
          <label
            key={l.key}
            style={{
              display: 'flex', gap: '10px', padding: '12px 14px', border: `1px solid ${level === l.key ? '#0078a4' : '#e2e8f0'}`,
              borderRadius: '10px', cursor: 'pointer', background: level === l.key ? '#f0f9ff' : '#fff',
            }}
          >
            <input type="radio" name="level" checked={level === l.key} onChange={() => setLevel(l.key as any)} style={{ marginTop: 3 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>{l.label}</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>{l.desc}</div>
            </div>
          </label>
        ))}
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
        <button style={btnSecondary} onClick={onClose}>Annuler</button>
        <button style={file && !loading ? btnPrimary : btnDisabled} disabled={!file || loading} onClick={handleCompress}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Minimize2 size={16} />}
          {loading ? 'Compression en cours...' : 'Compresser'}
        </button>
      </div>

      {result && (
        <ResultActions
          blob={result.blob}
          filename="compresse.pdf"
          info={
            result.imagesTouched > 0
              ? `Taille avant : ${formatSize(result.original)} → après : ${formatSize(result.compressed)} (${Math.round((1 - result.compressed / result.original) * 100)}% de réduction, ${result.imagesTouched} image(s) recompressée(s)).`
              : "Aucune image JPEG compressible n'a été trouvée dans ce PDF : la taille reste quasiment inchangée."
          }
        />
      )}
    </PdfToolShell>
  );
}
