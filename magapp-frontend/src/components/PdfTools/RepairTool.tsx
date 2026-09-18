import { useState } from 'react';
import { Wrench, Paperclip, Loader2 } from 'lucide-react';
import PdfToolShell, { btnPrimary, btnDisabled, btnSecondary, errorBox } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob } from './pdfToolsApi';

interface RepairToolProps { onClose: () => void }

export default function RepairTool({ onClose }: RepairToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Blob | null>(null);

  const handleRepair = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { blob } = await postFormForBlob('/repair', formData, 'Échec de la réparation.');
      setResult(blob);
    } catch (e: any) {
      setError(e.message || 'Échec de la réparation. Le fichier est peut-être trop endommagé.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PdfToolShell
      icon={<Wrench size={26} color="#b45309" />}
      iconBg="#fef3c7"
      title="Réparer un PDF corrompu"
      description="Tente de recharger et de ré-enregistrer proprement un PDF illisible ou endommagé."
      onClose={onClose}
    >
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#f1f5f9', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
        <Paperclip size={16} /> {file ? file.name : 'Choisir un PDF'}
        <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />
      </label>

      <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 10 }}>
        Réparation « au mieux » : les objets illisibles sont ignorés plutôt que de bloquer l'ouverture du fichier. N'est pas garanti de fonctionner sur tous les fichiers.
      </p>

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ marginTop: '18px', display: 'flex', gap: '10px' }}>
        <button style={btnSecondary} onClick={onClose}>Annuler</button>
        <button style={file && !loading ? btnPrimary : btnDisabled} disabled={!file || loading} onClick={handleRepair}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Wrench size={16} />}
          {loading ? 'Réparation en cours...' : 'Réparer'}
        </button>
      </div>

      {result && <ResultActions blob={result} filename="repare.pdf" />}
    </PdfToolShell>
  );
}
