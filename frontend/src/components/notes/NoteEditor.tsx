import React, { useEffect, useRef, useState } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import axios from 'axios';

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
