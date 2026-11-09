import { useRef, useState } from 'react';
import { Sparkles, FileText, MessageCircleQuestion, Languages, X, Loader2, Copy } from 'lucide-react';

type Mode = 'summary' | 'ask' | 'translate';

const LANGUAGES = ['français', 'anglais', 'espagnol', 'allemand', 'italien', 'portugais', 'arabe'];

/**
 * « Mon assistant IA » : Résumer / Interroger / Traduire un PDF via l'API IA Ville (APM).
 * Remplace l'« Assistant IA » de PdfCraft, dont les commandes sont désactivées dans le build web
 * (voir docs/PDFCRAFT-INTEGRATION.md). Le PDF est envoyé au backend (POST /api/pdf-tools/ai).
 */
export default function PdfAiAssistant({ onClose }: { onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>('summary');
  const [question, setQuestion] = useState('');
  const [language, setLanguage] = useState('français');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const run = async () => {
    if (!file) return;
    setLoading(true); setError(''); setAnswer(''); setNote('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('action', mode);
      if (mode === 'ask') fd.append('question', question);
      if (mode === 'translate') fd.append('language', language);
      const token = localStorage.getItem('token');
      const res = await fetch('/api/pdf-tools/ai', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erreur lors de l'appel à l'assistant IA.");
      setAnswer(data.response || '(réponse vide)');
      if (data.truncated) setNote('Document long : seul le début (environ 60 000 caractères) a été analysé.');
    } catch (e: any) {
      setError(e.message || 'Erreur inconnue.');
    } finally {
      setLoading(false);
    }
  };

  const tab = (m: Mode, icon: React.ReactNode, label: string) => (
    <button
      onClick={() => setMode(m)}
      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 6px', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 700, border: mode === m ? '1px solid #2563eb' : '1px solid #e2e8f0', background: mode === m ? '#dbeafe' : '#fff', color: mode === m ? '#1d4ed8' : '#475569' }}
    >{icon}{label}</button>
  );

  const canRun = !!file && !loading && (mode !== 'ask' || question.trim().length > 0);

  return (
    <div style={{ position: 'absolute', top: 49, right: 0, bottom: 0, width: 'min(460px, 100%)', background: '#fff', borderLeft: '1px solid #e2e8f0', boxShadow: '-8px 0 24px -12px rgba(0,0,0,0.25)', zIndex: 5, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
        <strong style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1e293b' }}><Sparkles size={18} color="#7c3aed" /> Mon assistant IA</strong>
        <button onClick={onClose} title="Fermer" style={{ background: '#f1f5f9', border: 'none', cursor: 'pointer', width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}><X size={16} /></button>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
        <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>Propulsé par l'API IA de la Ville. Le PDF est analysé sur nos serveurs, rien n'est envoyé à l'extérieur.</p>

        <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { setFile(e.target.files?.[0] || null); setAnswer(''); setError(''); }} />
        <button
          onClick={() => inputRef.current?.click()}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px dashed #94a3b8', borderRadius: 10, background: '#f8fafc', cursor: 'pointer', color: '#334155', fontWeight: 600, textAlign: 'left' }}
        >
          <FileText size={18} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file ? file.name : 'Choisir le PDF à analyser…'}</span>
        </button>

        <div style={{ display: 'flex', gap: 8 }}>
          {tab('summary', <Sparkles size={14} />, 'Résumer')}
          {tab('ask', <MessageCircleQuestion size={14} />, 'Interroger')}
          {tab('translate', <Languages size={14} />, 'Traduire')}
        </div>

        {mode === 'ask' && (
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Votre question sur le document…"
            rows={3}
            style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 10, fontFamily: 'inherit', fontSize: '0.9rem', resize: 'vertical' }}
          />
        )}
        {mode === 'translate' && (
          <label style={{ fontSize: '0.85rem', color: '#475569', display: 'flex', alignItems: 'center', gap: 8 }}>
            Traduire en
            <select value={language} onChange={(e) => setLanguage(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1' }}>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        )}

        <button
          onClick={run}
          disabled={!canRun}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '10px 14px', border: 'none', borderRadius: 10, background: canRun ? '#2563eb' : '#94a3b8', color: '#fff', fontWeight: 700, cursor: canRun ? 'pointer' : 'not-allowed' }}
        >
          {loading ? <><Loader2 size={16} className="loading-spinner" /> L'IA travaille…</> : 'Lancer'}
        </button>

        {error && <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', borderRadius: 8, padding: 10, fontSize: '0.85rem' }}>{error}</div>}
        {note && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 10, fontSize: '0.8rem' }}>{note}</div>}
        {answer && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 8px 0' }}>
              <button onClick={() => navigator.clipboard?.writeText(answer)} title="Copier" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', fontSize: '0.75rem' }}><Copy size={13} /> Copier</button>
            </div>
            <div style={{ padding: '4px 12px 12px', whiteSpace: 'pre-wrap', fontSize: '0.9rem', color: '#1e293b', lineHeight: 1.5 }}>{answer}</div>
          </div>
        )}
      </div>
    </div>
  );
}
