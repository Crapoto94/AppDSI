import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import axios from 'axios';
import { Bold, Italic, Underline, List, ListOrdered, Link2, Eraser, Undo2, Redo2, Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAuth } from './useAuth';
import { SiContext, conditionOk } from './helpSi';

/** Texte réécrit d'une rubrique d'aide ou d'une étape du tutoriel. */
export interface HelpData {
  title?: string;
  body?: string;
  example?: string;
  emoji?: string;
  quest?: string;
  quiz?: { question: string; options: Array<{ label: string; ok: boolean; why: string }> } | null;
}

export function useHelpContents() {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const [contents, setContents] = useState<Record<string, HelpData>>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    // En cas d'échec, les textes d'origine restent affichés
    axios.get('/api/entretiens/help-contents', { headers }).then(r => { if (alive) setContents(r.data || {}); }).catch(() => {}).finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [headers]);
  const save = useCallback(async (key: string, data: HelpData) => {
    await axios.put(`/api/entretiens/help-contents/${encodeURIComponent(key)}`, { data }, { headers });
    setContents(c => ({ ...c, [key]: data }));
  }, [headers]);
  const reset = useCallback(async (key: string) => {
    await axios.delete(`/api/entretiens/help-contents/${encodeURIComponent(key)}`, { headers });
    setContents(c => { const n = { ...c }; delete n[key]; return n; });
  }, [headers]);
  return { contents, loaded, save, reset };
}

// ───────── Filtrage du HTML : liste blanche (balises, attributs, styles, liens) ─────────
const TAGS = new Set(['div', 'span', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'sup', 'sub', 'code', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'font',
  // icônes (formes seules)
  'svg', 'path', 'circle', 'line', 'rect', 'polyline', 'polygon', 'ellipse', 'g']);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'math', 'foreignobject']);
const ATTRS = new Set(['style', 'title', 'colspan', 'rowspan', 'color', 'viewbox', 'width', 'height', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'points', 'xmlns', 'aria-hidden', 'data-si', 'data-si-label']);
// classes de numérotation automatique, les seules conservées
const CLASSES = /^ep-(num|n|n-dot)$/;

export function cleanHtml(input: string): string {
  const doc = new DOMParser().parseFromString(`<body>${String(input || '')}</body>`, 'text/html');
  const walk = (node: Element) => {
    Array.from(node.childNodes).forEach(n => { if (n.nodeType === Node.COMMENT_NODE) n.remove(); });
    Array.from(node.children).forEach(child => {
      const tag = child.tagName.toLowerCase();
      if (DROP.has(tag)) { child.remove(); return; }
      walk(child);
      if (!TAGS.has(tag)) { child.replaceWith(...Array.from(child.childNodes)); return; }
      Array.from(child.attributes).forEach(a => {
        const name = a.name.toLowerCase();
        if (tag === 'a' && name === 'href' && /^(https?:|mailto:)/i.test(a.value.trim())) return;
        if (name === 'class' && CLASSES.test(a.value)) return;
        // pas de ressource externe ni de bloc posé par-dessus la page
        if (name === 'style' && !/url\s*\(|expression|@import|\\|position\s*:\s*(fixed|absolute|sticky)/i.test(a.value)) return;
        if (name !== 'style' && ATTRS.has(name) && !/url\s*\(/i.test(a.value)) return;
        child.removeAttribute(a.name);
      });
      if (tag === 'a') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer'); }
    });
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

/** Styles des listes et liens dans les textes réécrits (même rendu en lecture et en édition). */
export const HELP_CSS = `
  .ep-rich ul { padding-left: 20px; list-style: disc; margin: 4px 0; }
  .ep-rich ol { padding-left: 20px; list-style: decimal; margin: 4px 0; }
  .ep-rich p { margin: 0 0 .5em; }
  .ep-rich a { color: #4f46e5; text-decoration: underline; }
  .ep-num { counter-reset: ep; }
  .ep-n::before { counter-increment: ep; content: counter(ep); }
  .ep-n-dot::before { counter-increment: ep; content: counter(ep) "."; }
  .ep-edit [data-si] { background-color: rgba(245,158,11,.08); outline: 1px dashed #f59e0b; outline-offset: 1px; }
  .ep-edit span[data-si]:has(> div, > ul, > table) { display: block; }
  .ep-edit [data-si]::before { content: "⟨" attr(data-si-label) "⟩ "; font-size: 10px; font-weight: 800; color: #b45309; }
`;

export function HtmlView({ html, style, inline }: { html: string; style?: CSSProperties; inline?: boolean }) {
  const { features, showAll } = useContext(SiContext);
  let clean = cleanHtml(html);
  if (!showAll) {
    // Lecture : les zones dont la condition n'est pas remplie sont retirées
    const doc = new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html');
    doc.body.querySelectorAll('[data-si]').forEach(el => { if (!conditionOk(features, el.getAttribute('data-si') || '')) el.remove(); });
    clean = doc.body.innerHTML;
  }
  const Tag = inline ? 'span' : 'div';
  return <><style>{HELP_CSS}</style><Tag className="ep-rich" style={style} dangerouslySetInnerHTML={{ __html: clean }} /></>;
}

// ───────── Éditeur WYSIWYG : on modifie le texte tel qu'il est affiché ─────────
const BOX = {
  info: ['#eff6ff', '#bfdbfe', '#1e40af'],
  ok: ['#f0fdf4', '#bbf7d0', '#166534'],
  warn: ['#fff7ed', '#fed7aa', '#9a3412'],
} as const;

export function Toolbar() {
  const exec = (cmd: string, arg?: string) => { try { document.execCommand(cmd, false, arg); } catch { /* ignore */ } };
  const link = () => {
    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const url = window.prompt('Adresse du lien (https://…)', 'https://');
    if (!url || !/^(https?:\/\/|mailto:)/i.test(url)) return;
    if (range && sel) { sel.removeAllRanges(); sel.addRange(range); }
    exec('createLink', url);
  };
  const box = (tone: keyof typeof BOX) => {
    const [bg, border, color] = BOX[tone];
    exec('insertHTML', `<div style="background:${bg};border:1px solid ${border};color:${color};border-radius:9px;padding:10px 12px;margin:8px 0">Texte de l’encadré</div><div><br></div>`);
  };
  const items: Array<[string, ReactNode, () => void]> = [
    ['Gras', <Bold size={14} />, () => exec('bold')],
    ['Italique', <Italic size={14} />, () => exec('italic')],
    ['Souligné', <Underline size={14} />, () => exec('underline')],
    ['Liste à puces', <List size={14} />, () => exec('insertUnorderedList')],
    ['Liste numérotée', <ListOrdered size={14} />, () => exec('insertOrderedList')],
    ['Lien', <Link2 size={14} />, link],
    ['Encadré « information »', <Info size={14} color="#1e40af" />, () => box('info')],
    ['Encadré « à faire »', <CheckCircle2 size={14} color="#166534" />, () => box('ok')],
    ['Encadré « attention »', <AlertTriangle size={14} color="#9a3412" />, () => box('warn')],
    ['Effacer la mise en forme', <Eraser size={14} />, () => exec('removeFormat')],
    ['Annuler la frappe', <Undo2 size={14} />, () => exec('undo')],
    ['Rétablir la frappe', <Redo2 size={14} />, () => exec('redo')],
  ];
  return (
    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', padding: '4px 6px', background: '#f8fafc', border: '1px solid #c7d2fe', borderRadius: 8, marginBottom: 6, position: 'sticky', top: 0, zIndex: 5 }}>
      {items.map(([title, icon, run]) => (
        // preventDefault : la sélection reste dans la zone en cours d'édition
        <button key={title} type="button" title={title} aria-label={title} onMouseDown={e => e.preventDefault()} onClick={run}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#475569', padding: '4px 6px', borderRadius: 4, display: 'inline-flex' }}>
          {icon}
        </button>
      ))}
    </div>
  );
}

/**
 * Zone modifiable. Elle part du texte déjà enregistré (`html`), sinon du texte d'origine (`children`),
 * rendu à part puis recopié. `target` donne accès au contenu au moment d'enregistrer.
 */
export function Editable({ html, children, target, label, style }: {
  html?: string;
  children?: ReactNode;
  target: MutableRefObject<HTMLDivElement | null>;
  label: string;
  style?: CSSProperties;
}) {
  const source = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (target.current) target.current.innerHTML = cleanHtml(html ?? source.current?.innerHTML ?? '');
    // Rempli une seule fois : un nouveau rendu ne doit pas écraser la saisie
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <style>{HELP_CSS}</style>
      {html === undefined && <div ref={source} style={{ display: 'none' }}>{children}</div>}
      <div ref={target} className="ep-rich" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label={label}
        style={{ outline: '2px dashed #a5b4fc', outlineOffset: 2, borderRadius: 6, padding: 6, minHeight: 28, background: '#fff', ...style }} />
    </>
  );
}
