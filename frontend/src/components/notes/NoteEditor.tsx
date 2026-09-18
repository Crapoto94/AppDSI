import React, { useEffect, useRef, useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import axios from 'axios';
import { Mic, MicOff, Loader2 } from 'lucide-react';

export interface Mention {
  name: string;
  email: string;
}

interface AgentResult {
  username?: string;
  displayName?: string;
  email?: string;
  service?: string;
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  mentions: Mention[];
  onMentionsChange: (mentions: Mention[]) => void;
  token: string | null;
  placeholder?: string;
}

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ indent: '-1' }, { indent: '+1' }],
  ['blockquote', 'link'],
  ['clean'],
];

// Objets hoistés au niveau module : recréés à chaque rendu, ils provoquaient la
// perte du curseur/point d'insertion dans l'éditeur (ré-initialisation Quill).
const MODULES = { toolbar: TOOLBAR };
const EDITOR_STYLE: React.CSSProperties = { background: 'white', minHeight: 280, cursor: 'text' };

/**
 * Éditeur Quill avec mentions d'agents : la frappe de « @ » déclenche une
 * recherche d'agents (AD + hub.users via /api/notes/agents). La sélection
 * insère « @Prénom Nom » et mémorise l'agent dans la liste `mentions`.
 */
function NoteEditor({ value, onChange, mentions, onMentionsChange, token, placeholder }: Props) {
  const quillRef = useRef<ReactQuill>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<AgentResult[]>([]);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Dictée vocale (Web Speech API) ───────────────────────────────────────
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [interim, setInterim] = useState('');
  const [dictError, setDictError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const listeningRef = useRef(false);
  useEffect(() => { listeningRef.current = listening; }, [listening]);
  const speechSupported = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const tokenRef = useRef(token);
  const mentionsRef = useRef(mentions);
  const openRef = useRef(false);
  const anchorRef = useRef<{ left: number; top: number } | null>(null);
  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { mentionsRef.current = mentions; }, [mentions]);
  useEffect(() => { openRef.current = open; }, [open]);

  useEffect(() => {
    const quill = quillRef.current?.getEditor() as any;
    if (!quill) return;

    const closeMenu = () => {
      if (openRef.current) { openRef.current = false; setOpen(false); }
    };

    const handleTextChange = () => {
      const selection = quill.getSelection();
      if (!selection) { closeMenu(); return; }
      const before = quill.getText(0, selection.index);
      const atIndex = before.lastIndexOf('@');
      if (atIndex < 0) { closeMenu(); return; }
      const query = before.slice(atIndex + 1);
      if (/[\s\n]/.test(query) || query.length > 30) { closeMenu(); return; }

      const bounds = quill.getBounds(selection.index) as { left: number; top: number; height: number };
      const next = { left: bounds.left, top: bounds.top + bounds.height };
      if (!anchorRef.current || anchorRef.current.left !== next.left || anchorRef.current.top !== next.top) {
        anchorRef.current = next;
        setAnchor(next);
      }

      if (query.length < 1) { setResults([]); openRef.current = true; setOpen(true); return; }
      if (searchTimer.current) clearTimeout(searchTimer.current);
      searchTimer.current = setTimeout(async () => {
        try {
          const res = await axios.get(`/api/notes/agents?q=${encodeURIComponent(query)}`, {
            headers: { Authorization: `Bearer ${tokenRef.current}` },
          });
          setResults(Array.isArray(res.data) ? res.data : []);
          openRef.current = true;
          setOpen(true);
        } catch {
          setResults([]);
        }
      }, 250);
    };

    quill.on('text-change', handleTextChange);
    return () => {
      quill.off('text-change', handleTextChange);
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const insertDictatedText = (text: string) => {
    const quill = quillRef.current?.getEditor() as any;
    if (!quill || !text) return;
    const selection = quill.getSelection(true);
    const index = selection ? selection.index : quill.getLength();
    quill.insertText(index, text, 'user');
    quill.setSelection(index + text.length, 0);
  };

  const startDictation = () => {
    if (!speechSupported) {
      setDictError("La dictée vocale n'est pas supportée par ce navigateur (utilisez Chrome ou Edge).");
      return;
    }
    setDictError(null);
    setStarting(true);
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (event: any) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = (result[0]?.transcript || '').trim();
        if (!transcript) continue;
        if (result.isFinal) {
          insertDictatedText(transcript + ' ');
        } else {
          interimText += (interimText ? ' ' : '') + transcript;
        }
      }
      setInterim(interimText);
    };
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        setDictError('Accès au microphone refusé. Autorisez le micro dans votre navigateur.');
        listeningRef.current = false;
        setListening(false);
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        setDictError(`Erreur dictée : ${e.error}`);
      }
    };
    rec.onend = () => {
      setInterim('');
      // Chrome/Edge coupent la reconnaissance après un silence : on relance
      // automatiquement tant que l'utilisateur n'a pas arrêté la dictée.
      if (listeningRef.current) {
        try { rec.start(); return; } catch { /* ignore */ }
      }
      setStarting(false);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      listeningRef.current = true;
      setListening(true);
    } catch (e: any) {
      setDictError(e?.message || 'Impossible de démarrer le microphone.');
    } finally {
      setStarting(false);
    }
  };

  const stopDictation = () => {
    listeningRef.current = false;
    setListening(false);
    setInterim('');
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) { try { rec.stop(); } catch { /* ignore */ } }
  };

  useEffect(() => () => {
    listeningRef.current = false;
    const rec = recognitionRef.current;
    if (rec) { try { rec.stop(); } catch { /* ignore */ } }
  }, []);

  const selectAgent = (agent: AgentResult) => {
    const quill = quillRef.current?.getEditor() as any;
    if (!quill) return;
    const selection = quill.getSelection(true);
    const index = selection ? selection.index : quill.getLength();
    const before = quill.getText(0, index);
    const atIndex = before.lastIndexOf('@');
    const deleteLen = atIndex >= 0 ? index - atIndex : 0;
    if (deleteLen > 0) quill.deleteText(atIndex, deleteLen, 'user');
    const insertAt = atIndex >= 0 ? atIndex : index;
    const name = agent.displayName || agent.email || agent.username || 'Agent';
    const insertion = `@${name} `;
    quill.insertText(insertAt, insertion, 'user');
    quill.setSelection(insertAt + insertion.length, 0);

    const email = (agent.email || '').toLowerCase();
    const exists = mentionsRef.current.some(m => (email && m.email === email) || (!email && m.name === name));
    if (!exists) onMentionsChange([...mentionsRef.current, { name, email }]);
    setOpen(false);
    setResults([]);
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={listening ? stopDictation : startDictation}
          disabled={starting}
          title={speechSupported ? 'Dicter la note à la voix (micro)' : 'Dictée vocale non supportée par ce navigateur'}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 20,
            border: 'none', cursor: starting ? 'wait' : 'pointer', fontWeight: 700, fontSize: 12.5,
            background: listening ? '#dc2626' : '#eef2ff', color: listening ? 'white' : '#4338ca',
            boxShadow: listening ? '0 0 0 4px rgba(220,38,38,.15)' : 'none', transition: 'all .15s',
          }}
        >
          {listening ? <MicOff size={15} /> : <Mic size={15} />}
          {listening ? 'Arrêter la dictée' : 'Dicter à la voix'}
        </button>
        {listening && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#b91c1c', fontWeight: 600 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#dc2626', display: 'inline-block', animation: 'noteRecPulse 1s infinite' }} />
            Écoute… parlez
            {interim && <em style={{ color: '#64748b', fontStyle: 'italic', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>« {interim} »</em>}
          </span>
        )}
        {starting && !listening && <Loader2 size={15} color="#6366f1" style={{ animation: 'spin 1s linear infinite' }} />}
        {dictError && <span style={{ fontSize: 12, color: '#b91c1c' }}>{dictError}</span>}
        <span style={{ fontSize: 11.5, color: '#94a3b8', marginLeft: 'auto' }}>Le texte est inséré à l'endroit du curseur.</span>
      </div>
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value}
        onChange={onChange}
        placeholder={placeholder || 'Écrivez votre note… tapez @ pour mentionner un agent'}
        modules={MODULES}
        style={EDITOR_STYLE}
      />
      {open && (results.length > 0 || anchor) && (
        <div
          onMouseDown={e => e.preventDefault()}
          style={{
            position: 'absolute',
            left: anchor ? Math.min(anchor.left, 420) : 12,
            top: (anchor?.top ?? 40) + 44,
            zIndex: 4000,
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: 8,
            boxShadow: '0 10px 30px rgba(15,23,42,.18)',
            minWidth: 260,
            maxHeight: 240,
            overflow: 'auto',
          }}
        >
          {results.length === 0 ? (
            <div style={{ padding: '10px 14px', fontSize: 12, color: '#94a3b8' }}>Aucun agent trouvé</div>
          ) : results.map((a, i) => (
            <div
              key={`${a.email || a.username || i}`}
              onClick={() => selectAgent(a)}
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{a.displayName || a.email}</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>{a.email}{a.service ? ` · ${a.service}` : ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default React.memo(NoteEditor);
