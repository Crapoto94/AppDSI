import { useState } from 'react';
import { Combine, Paperclip, X, Loader2, FileText } from 'lucide-react';
import PdfToolShell, { btnPrimary, btnDisabled, btnSecondary, errorBox } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob, postFormForJson } from './pdfToolsApi';

interface MergeToolProps { onClose: () => void }

interface FileEntry {
  id: string;
  file: File;
  isImage: boolean;
  thumbUrl: string | null;
  thumbLoading: boolean;
}

let nextId = 0;

export default function MergeTool({ onClose }: MergeToolProps) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Blob | null>(null);

  const loadPdfCoverThumb = async (entryId: string, file: File) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('maxPages', '1');
      const data = await postFormForJson<{ pages: { dataUrl: string }[] }>('/thumbnails', formData, 'Aperçu indisponible.');
      const dataUrl = data.pages[0]?.dataUrl || null;
      setFiles((prev) => prev.map((f) => (f.id === entryId ? { ...f, thumbUrl: dataUrl, thumbLoading: false } : f)));
    } catch (e) {
      setFiles((prev) => prev.map((f) => (f.id === entryId ? { ...f, thumbLoading: false } : f)));
    }
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const accepted = Array.from(list).filter((f) => f.type === 'application/pdf' || f.type.startsWith('image/'));
    const entries: FileEntry[] = accepted.map((file) => {
      const isImage = file.type.startsWith('image/');
      return {
        id: `f${nextId++}`,
        file,
        isImage,
        thumbUrl: isImage ? URL.createObjectURL(file) : null,
        thumbLoading: !isImage,
      };
    });
    setFiles((prev) => [...prev, ...entries]);
    setResult(null);
    entries.filter((e) => !e.isImage).forEach((e) => loadPdfCoverThumb(e.id, e.file));
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => {
      const entry = prev[idx];
      if (entry && entry.isImage && entry.thumbUrl) URL.revokeObjectURL(entry.thumbUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

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
      files.forEach((f) => formData.append('files', f.file));
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
      maxWidth={880}
    >
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#f1f5f9', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
        <Paperclip size={16} /> Ajouter des fichiers (PDF ou images)
        <input type="file" multiple accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => addFiles(e.target.files)} />
      </label>

      {files.length > 0 && (
        <div style={{ marginTop: '16px' }}>
          <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 10px' }}>Glissez-déposez les miniatures pour réordonner. Les images seront converties en page A4 (portrait ou paysage selon leur format).</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {files.map((entry, idx) => (
              <div
                key={entry.id}
                draggable
                onDragStart={() => setDragIndex(idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(idx)}
                style={{
                  width: 130, border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px', cursor: 'grab',
                  background: dragIndex === idx ? '#f0f9ff' : '#fff', position: 'relative',
                }}
              >
                <div style={{ position: 'absolute', top: 4, left: 4, background: '#0078a4', color: '#fff', fontSize: '0.7rem', fontWeight: 700, borderRadius: '999px', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                  {idx + 1}
                </div>
                <X
                  size={15}
                  color="#94a3b8"
                  style={{ position: 'absolute', top: 6, right: 6, cursor: 'pointer', background: '#fff', borderRadius: '50%', zIndex: 1 }}
                  onClick={() => removeFile(idx)}
                />
                <div style={{ height: 130, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: '6px', border: '1px solid #f1f5f9', background: '#f8fafc' }}>
                  {entry.thumbLoading ? (
                    <Loader2 size={20} className="animate-spin" color="#94a3b8" />
                  ) : entry.thumbUrl ? (
                    <img src={entry.thumbUrl} alt={entry.file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  ) : (
                    <FileText size={28} color="#cbd5e1" />
                  )}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.file.name}>
                  {entry.file.name}
                </div>
              </div>
            ))}
          </div>
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
