import { useState } from 'react';
import { GitCompare, Paperclip, Loader2 } from 'lucide-react';
import PdfToolShell, { btnPrimary, btnDisabled, btnSecondary, errorBox } from './PdfToolShell';
import { postFormForJson } from './pdfToolsApi';

interface CompareToolProps { onClose: () => void }

interface ComparePage {
  index: number;
  existsInA: boolean;
  existsInB: boolean;
  diffPercent: number;
  thumbA: string | null;
  thumbB: string | null;
  diffImage: string | null;
}

export default function CompareTool({ onClose }: CompareToolProps) {
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ pages: ComparePage[]; truncated: boolean } | null>(null);

  const handleCompare = async () => {
    if (!fileA || !fileB) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('fileA', fileA);
      formData.append('fileB', fileB);
      const data = await postFormForJson<{ pages: ComparePage[]; truncated: boolean }>('/compare', formData, 'Échec de la comparaison.');
      setResult(data);
    } catch (e: any) {
      setError(e.message || 'Échec de la comparaison.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PdfToolShell
      icon={<GitCompare size={26} color="#be185d" />}
      iconBg="#fce7f3"
      title="Comparer deux PDF"
      description="Affiche visuellement les différences page par page entre deux versions d'un document."
      onClose={onClose}
      maxWidth={880}
    >
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#f1f5f9', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
          <Paperclip size={16} /> {fileA ? fileA.name : 'Version A'}
          <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { setFileA(e.target.files?.[0] || null); setResult(null); }} />
        </label>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#f1f5f9', borderRadius: '10px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
          <Paperclip size={16} /> {fileB ? fileB.name : 'Version B'}
          <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { setFileB(e.target.files?.[0] || null); setResult(null); }} />
        </label>
      </div>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
        <button style={btnSecondary} onClick={onClose}>Fermer</button>
        <button style={fileA && fileB && !loading ? btnPrimary : btnDisabled} disabled={!fileA || !fileB || loading} onClick={handleCompare}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <GitCompare size={16} />}
          {loading ? 'Comparaison en cours...' : 'Comparer'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: '20px' }}>
          {result.truncated && <p style={{ fontSize: '0.78rem', color: '#b45309' }}>Comparaison limitée aux 40 premières pages.</p>}
          {result.pages.map((p) => (
            <div key={p.index} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ width: 90, fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>Page {p.index + 1}</div>
              {!p.existsInA || !p.existsInB ? (
                <div style={{ fontSize: '0.82rem', color: '#dc2626' }}>
                  {!p.existsInA ? 'Absente de la version A' : 'Absente de la version B'}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: p.diffPercent > 1 ? '#dc2626' : '#16a34a', minWidth: 90 }}>
                    {p.diffPercent > 1 ? `${p.diffPercent}% différent` : 'Identique'}
                  </div>
                  {p.diffImage && p.diffPercent > 1 && (
                    <img src={p.diffImage} alt={`Différences page ${p.index + 1}`} style={{ maxWidth: 200, border: '1px solid #e2e8f0', borderRadius: 6 }} />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </PdfToolShell>
  );
}
