import { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Link2, Eraser } from 'lucide-react';

/**
 * Éditeur HTML simple (WYSIWYG) sans dépendance externe : gras, italique, souligné,
 * listes, lien et nettoyage de la mise en forme. La valeur échangée est du HTML.
 */
export default function MiniRichEditor({ value, onChange, placeholder, minHeight = 110 }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    const next = value || '';
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [value]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    try { document.execCommand(cmd, false, arg); } catch { /* ignore */ }
    onChange(ref.current?.innerHTML || '');
  };

  const link = () => {
    const url = window.prompt('Adresse du lien (https://…)', 'https://');
    if (url && /^https?:\/\//i.test(url)) exec('createLink', url);
  };

  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={onClick}
      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#475569', padding: '3px 5px', borderRadius: 4, display: 'inline-flex', alignItems: 'center' }}>
      {children}
    </button>
  );

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', padding: '3px 6px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <Btn title="Gras" onClick={() => exec('bold')}><Bold size={13} /></Btn>
        <Btn title="Italique" onClick={() => exec('italic')}><Italic size={13} /></Btn>
        <Btn title="Souligné" onClick={() => exec('underline')}><Underline size={13} /></Btn>
        <Btn title="Liste à puces" onClick={() => exec('insertUnorderedList')}><List size={13} /></Btn>
        <Btn title="Liste numérotée" onClick={() => exec('insertOrderedList')}><ListOrdered size={13} /></Btn>
        <Btn title="Lien" onClick={link}><Link2 size={13} /></Btn>
        <Btn title="Nettoyer la mise en forme" onClick={() => exec('removeFormat')}><Eraser size={13} /></Btn>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder || 'Saisir le texte…'}
        onInput={e => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
        onBlur={e => onChange((e.currentTarget as HTMLDivElement).innerHTML)}
        style={{ minHeight, padding: '9px 11px', fontSize: 13, lineHeight: 1.5, color: '#1e293b', outline: 'none' }}
      />
      <style>{`
        [data-placeholder]:empty::before { content: attr(data-placeholder); color: #94a3b8; pointer-events: none; }
        [contenteditable] ul { padding-left: 20px; list-style: disc; }
        [contenteditable] ol { padding-left: 20px; list-style: decimal; }
        [contenteditable] a { color: #4f46e5; text-decoration: underline; }
      `}</style>
    </div>
  );
}
