import { useState, useRef, useEffect } from 'react';

const EMOJIS = [
  '😊', '😂', '🤣', '❤️', '👍', '🎉', '🙏', '🔥', '💯', '✅',
  '😁', '😅', '😇', '🙂', '😉', '😍', '🤗', '🤔', '😢', '😭',
  '🥺', '🤯', '🥳', '✨', '💡', '📱', '💻', '⚡', '❌', '⚠️',
  '👌', '✌️', '🤞', '👏', '💪', '🙄', '😴', '🎊', '⭐', '📝',
];

interface Props {
  onEmojiSelect: (emoji: string) => void;
}

export default function EmojiPicker({ onEmojiSelect }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        title="Émoticônes"
        style={{
          padding: '8px 10px', background: '#f8fafc', color: '#475569',
          border: '1.5px solid #e2e8f0', borderRadius: 10, cursor: 'pointer',
          fontSize: 16, lineHeight: 1, flexShrink: 0,
        }}
      >
        😊
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', bottom: '100%', right: 0, marginBottom: 6,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: 8,
            display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2,
            zIndex: 1000, maxWidth: 240,
          }}
        >
          {EMOJIS.map(e => (
            <button
              key={e}
              type="button"
              onClick={() => { onEmojiSelect(e); setOpen(false); }}
              style={{
                background: 'none', border: 'none', borderRadius: 6,
                cursor: 'pointer', fontSize: 18, padding: 4, lineHeight: 1,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
