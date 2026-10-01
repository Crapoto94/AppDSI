import React, { useEffect, useRef, useState } from 'react';

type U = { username: string; display_name: string; service_code?: string };

const isField = (el: Element | null): el is HTMLInputElement | HTMLTextAreaElement =>
  !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') && !!(el as HTMLElement).closest('[data-mentions]');
const isQuill = (el: Element | null): el is HTMLElement =>
  !!el && (el as HTMLElement).classList?.contains('ql-editor') && !!el.closest('[data-mentions]');

// Texte avant le curseur + longueur de la requête "@xxx" si présente
function currentQuery(el: Element): { q: string; len: number } | null {
  let before = '';
  if (isField(el)) {
    if (el.selectionStart == null) return null;
    before = el.value.slice(0, el.selectionStart);
  } else if (isQuill(el)) {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return null;
    const r = sel.getRangeAt(0);
    if (r.startContainer.nodeType !== Node.TEXT_NODE) return null;
    before = (r.startContainer.textContent || '').slice(0, r.startOffset);
  } else return null;
  const m = /(^|\s)@([^\s@]{0,30}(?: [^\s@]{0,30})?)$/.exec(before);
  if (!m) return null;
  return { q: m[2], len: m[2].length + 1 };
}

function caretRect(el: Element): { left: number; top: number } {
  if (isQuill(el)) {
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      const r = sel.getRangeAt(0).getClientRects()[0];
      if (r) return { left: r.left, top: r.bottom + 4 };
    }
  }
  const b = el.getBoundingClientRect();
  return { left: b.left, top: b.bottom + 4 };
}

// Active la saisie de @mentions sur tout champ situé dans un conteneur [data-mentions].
export const MentionAutocomplete: React.FC = () => {
  const [items, setItems] = useState<U[]>([]);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const [active, setActive] = useState(0);
  const target = useRef<{ el: Element; len: number } | null>(null);
  const itemsRef = useRef<U[]>([]);
  const activeRef = useRef(0);
  const reqId = useRef(0);
  itemsRef.current = items;
  activeRef.current = active;

  const close = () => { setItems([]); target.current = null; };

  const choose = (u: U) => {
    const t = target.current;
    if (!t) return;
    const { el, len } = t;
    const text = '@' + u.display_name + ' ';
    if (isField(el)) {
      const end = el.selectionStart ?? el.value.length;
      const start = end - len;
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
      setter.call(el, el.value.slice(0, start) + text + el.value.slice(end));
      el.setSelectionRange(start + text.length, start + text.length);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
    } else {
      (el as HTMLElement).focus();
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0);
        const node = r.startContainer;
        const range = document.createRange();
        range.setStart(node, Math.max(0, r.startOffset - len));
        range.setEnd(node, r.startOffset);
        sel.removeAllRanges();
        sel.addRange(range);
        document.execCommand('insertText', false, text);
      }
    }
    close();
  };

  useEffect(() => {
    const onInput = async (e: Event) => {
      const el = e.target as Element;
      if (!isField(el) && !isQuill(el)) return;
      const q = currentQuery(el);
      if (!q) { close(); return; }
      const id = ++reqId.current;
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/notifications/users?q=${encodeURIComponent(q.q)}`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined);
        if (!res.ok || id !== reqId.current) return;
        const list: U[] = await res.json();
        if (!list.length) { close(); return; }
        target.current = { el, len: q.len };
        setPos(caretRect(el));
        setActive(0);
        setItems(list);
      } catch { /* pas de suggestion */ }
    };
    const onKey = (e: KeyboardEvent) => {
      const list = itemsRef.current;
      if (!list.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setActive(a => (a + 1) % list.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setActive(a => (a - 1 + list.length) % list.length); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); e.stopPropagation(); choose(list[activeRef.current]); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    };
    const onBlur = () => setTimeout(() => { if (!document.activeElement || !document.activeElement.closest('[data-mention-popup]')) close(); }, 150);
    document.addEventListener('input', onInput, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('focusout', onBlur, true);
    return () => {
      document.removeEventListener('input', onInput, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('focusout', onBlur, true);
    };
  }, []);

  if (!items.length) return null;
  return (
    <div data-mention-popup style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 100000, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', minWidth: 220, maxWidth: 320, overflow: 'hidden' }}>
      {items.map((u, i) => (
        <div key={u.username}
          onMouseDown={e => { e.preventDefault(); choose(u); }}
          onMouseEnter={() => setActive(i)}
          style={{ padding: '7px 12px', fontSize: 13, cursor: 'pointer', background: i === active ? '#eff6ff' : '#fff', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ fontWeight: 600, color: '#0f172a' }}>{u.display_name}</span>
          {u.service_code && <span style={{ fontSize: 11, color: '#64748b' }}>{u.service_code}</span>}
        </div>
      ))}
    </div>
  );
};

export default MentionAutocomplete;
