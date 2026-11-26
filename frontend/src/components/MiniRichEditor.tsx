import React, { useMemo } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

/**
 * Éditeur WYSIWYG minimal (gras, italique, souligné, listes, lien, nettoyage).
 * Le copier/coller conserve la mise en forme (gras, listes, liens…) ; les styles
 * exotiques (polices, couleurs, tailles) sont filtrés par Quill.
 */
export function MiniRichEditor({ value, onChange, placeholder, minHeight = 110 }: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const modules = useMemo(() => ({
    toolbar: [
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link', 'clean'],
    ],
  }), []);
  return (
    <div className="mini-rich-editor" style={{ border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>
      <style>{`
        .mini-rich-editor .ql-toolbar.ql-snow { border: none; border-bottom: 1px solid #e2e8f0; background: #f8fafc; padding: 4px 8px; }
        .mini-rich-editor .ql-container.ql-snow { border: none; font-family: inherit; font-size: 13px; }
        .mini-rich-editor .ql-editor { min-height: ${minHeight}px; line-height: 1.5; color: #1e293b; }
        .mini-rich-editor .ql-editor.ql-blank::before { font-style: normal; color: #94a3b8; }
      `}</style>
      <ReactQuill theme="snow" value={value || ''} onChange={(html) => onChange(html === '<p><br></p>' ? '' : html)}
        modules={modules} formats={['bold', 'italic', 'underline', 'list', 'link']} placeholder={placeholder} />
    </div>
  );
}

const ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'A', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'SPAN', 'DIV']);

/** Filtre le HTML : balises autorisées, pas d'attributs hors lien / liste, liens http(s)/mailto uniquement. */
export function sanitizeHtml(input: string): string {
  const raw = String(input || '');
  // Anciennes consignes saisies en texte brut : on conserve les retours à la ligne.
  const html = /<[a-z][\s\S]*>/i.test(raw)
    ? raw
    : raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const walk = (node: Element) => {
    Array.from(node.children).forEach(child => {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        // balise inconnue : on garde le texte, on supprime la balise (et tout contenu exécutable)
        if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(child.tagName)) { child.remove(); return; }
        walk(child);
        child.replaceWith(...Array.from(child.childNodes));
        return;
      }
      Array.from(child.attributes).forEach(a => {
        const name = a.name.toLowerCase();
        if (child.tagName === 'A' && name === 'href' && /^(https?:|mailto:)/i.test(a.value.trim())) return;
        if (name === 'data-list' && child.tagName === 'LI') return;
        if (name === 'class' && /^ql-/.test(a.value)) return;
        child.removeAttribute(a.name);
      });
      if (child.tagName === 'A') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer'); }
      walk(child);
    });
  };
  const root = doc.body.firstElementChild as Element;
  // Quill 2 stocke toutes les listes en <ol> + <li data-list="bullet|ordered"> et ajoute un <span class="ql-ui"> décoratif.
  root.querySelectorAll('.ql-ui').forEach(n => n.remove());
  root.querySelectorAll('ol').forEach(ol => {
    const items = Array.from(ol.children).filter(c => c.tagName === 'LI');
    if (items.length && items.every(li => li.getAttribute('data-list') === 'bullet')) {
      const ul = doc.createElement('ul');
      ul.append(...Array.from(ol.childNodes));
      ol.replaceWith(ul);
    }
  });
  walk(root);
  return root.innerHTML;
}

/** Affichage en lecture seule d'un contenu produit par MiniRichEditor (ou d'un ancien texte brut). */
export function RichTextView({ html, style }: { html: string; style?: React.CSSProperties }) {
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  // CSS propre (sans le CSS de l'éditeur Quill, qui provoquait des débordements).
  return (
    <div className="rich-text-view" style={style}>
      <style>{`
        .rich-text-view { line-height: 1.55; overflow-wrap: anywhere; }
        .rich-text-view p { margin: 0 0 .5em; }
        .rich-text-view ul, .rich-text-view ol { margin: 0 0 .5em; padding-left: 1.4em; }
        .rich-text-view ul { list-style: disc; }
        .rich-text-view ol { list-style: decimal; }
        .rich-text-view li { margin: 0; }
        .rich-text-view a { color: #4f46e5; text-decoration: underline; }
        .rich-text-view > :last-child { margin-bottom: 0; }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: clean }} />
    </div>
  );
}
