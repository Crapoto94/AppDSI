import { useState } from 'react';
import { Lock, Loader2, FileText, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import PdfToolShell, { btnPrimary, btnDisabled, btnSecondary, errorBox, dropzone } from './PdfToolShell';
import ResultActions from './ResultActions';
import { postFormForBlob } from './pdfToolsApi';

interface ProtectToolProps { onClose: () => void }

export default function ProtectTool({ onClose }: ProtectToolProps) {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Blob | null>(null);

  const canSubmit = !!file && password.length >= 4 && password === confirm && !loading;

  const handleProtect = async () => {
    if (!file) return;
    if (password.length < 4) { setError('Le mot de passe doit contenir au moins 4 caractères.'); return; }
    if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userPassword', password);
      const { blob } = await postFormForBlob('/protect', formData, 'Échec de la protection du PDF.');
      setResult(blob);
    } catch (e: any) {
      setError(e.message || 'Échec de la protection du PDF.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PdfToolShell
      icon={<Lock size={26} color="#b45309" />}
      iconBg="#fef3c7"
      title="Protéger par mot de passe"
      description="Chiffrez le PDF (AES-256) : le mot de passe est obligatoire pour l'ouvrir et le lire."
      onClose={onClose}
      maxWidth={640}
    >
      <label style={dropzone}>
        <input type="file" accept="application/pdf,.pdf" style={{ display: 'none' }} onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} />
        {file ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#334155', fontWeight: 600 }}>
            <FileText size={18} color="#ef4444" /> {file.name}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Lock size={22} />
            <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Cliquez pour choisir un PDF</span>
          </div>
        )}
      </label>

      {file && (
        <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
          <label style={lbl}>
            Mot de passe (obligatoire pour ouvrir le PDF)
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type={showPwd ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                style={{ ...input, paddingRight: 38 }}
              />
              <button type="button" onClick={() => setShowPwd((v) => !v)} style={eyeBtn} title={showPwd ? 'Masquer' : 'Afficher'}>
                {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>
          <label style={lbl}>
            Confirmation
            <input type={showPwd ? 'text' : 'password'} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Ressaisir le mot de passe" style={input} />
          </label>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, color: '#92400e', fontSize: '0.8rem' }}>
            <ShieldCheck size={16} style={{ flexShrink: 0 }} />
            Le fichier est chiffré en AES-256 : sans le mot de passe, son contenu est illisible. Conservez-le précieusement.
          </div>
        </div>
      )}

      {error && <div style={errorBox}>{error}</div>}

      <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
        <button style={btnSecondary} onClick={onClose}>Annuler</button>
        <button style={canSubmit ? btnPrimary : btnDisabled} disabled={!canSubmit} onClick={handleProtect}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
          {loading ? 'Chiffrement…' : 'Protéger le PDF'}
        </button>
      </div>

      {result && <ResultActions blob={result} filename="protege.pdf" info="Le PDF est chiffré : le mot de passe est requis pour l'ouvrir." />}
    </PdfToolShell>
  );
}

const lbl: React.CSSProperties = { fontSize: '0.78rem', fontWeight: 700, color: '#475569', display: 'flex', flexDirection: 'column', gap: 5 };
const input: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 9, fontSize: '0.86rem', boxSizing: 'border-box', outline: 'none' };
const eyeBtn: React.CSSProperties = { position: 'absolute', right: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex', padding: 4 };
