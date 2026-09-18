import { useRef, useState } from 'react';
import { Combine, Paperclip, X, GripVertical, Loader2 } from 'lucide-react';
import PdfToolShell, { btnPrimary, btnDisabled, btnSecondary, errorBox } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob } from './pdfToolsApi';

interface MergeToolProps { onClose: () => void }

export default function MergeTool({ onClose }: MergeToolProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Blob | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const accepted = Array.from(list).filter((f) => f.type === 'application/pdf' || f.type.startsWith('image/'));
    setFiles((prev) => [...prev, ...accepted]);
    setResult(null);
  };

  const removeFile = (idx: number) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const onDrop = (idx: number) => {
    if (dragIndex === null || dragIndex === idx) return;
    setFiles((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(idx, 0, moved);
      return next;
    });
    setDragIndex(null);
  };

  const handleMerge = async () => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));
      const { blob } = await postFormForBlob('/merge', formData, 'Échec de la fusion.');
      setResult(blob);
    } catch (e: any) {
      setError(e.message || 'Échec de la fusion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PdfToolShell
      icon={<Combine size={26} color="#0369a1" />}
      iconBg="#dbeafe"
      title="Fusionner des PDF"
      description="Combinez plusieurs PDF et images en un seul document, dans l'ordre de votre choix."
      onClose={onClose}
    >
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#f1f5f9', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
        <Paperclip size={16} /> Ajouter des fichiers (PDF ou images)
        <input ref={inputRef} type="file" multiple accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => addFiles(e.target.files)} />
      </label>

      {files.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 8px' }}>Glissez-déposez pour réordonner. Les images seront converties en page A4 (portrait ou paysage selon leur format).</p>
          {files.map((file, idx) => (
            <div
              key={`${file.name}-${idx}`}
              draggable
              onDragStart={() => setDragIndex(idx)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(idx)}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '8px', background: dragIndex === idx ? '#f0f9ff' : '#fff', cursor: 'grab' }}
            >
              <GripVertical size={16} color="#94a3b8" />
              <span style={{ fontSize: '0.85rem', color: '#334155', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {idx + 1}. {file.name}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{file.type.startsWith('image/') ? 'Image' : 'PDF'}</span>
              <X size={16} color="#94a3b8" style={{ cursor: 'pointer' }} onClick={() => removeFile(idx)} />
            </div>
          ))}
        </div>
      )}

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
        <button style={btnSecondary} onClick={onClose}>Annuler</button>
        <button
          style={files.length >= 2 && !loading ? btnPrimary : btnDisabled}
          disabled={files.length < 2 || loading}
          onClick={handleMerge}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Combine size={16} />}
          {loading ? 'Fusion en cours...' : 'Fusionner'}
        </button>
      </div>

      {result && <ResultActions blob={result} filename="fusion.pdf" />}
    </PdfToolShell>
  );
}
