import { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Link2, Minus, Heading2, Heading3, Pilcrow, Quote } from 'lucide-react';

/* ───────── Markdown → HTML (sous-ensemble : titres, gras, italique, listes, tableaux, citations, liens, séparateurs) ───────── */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s: string): string {
  let t = esc(s);
  t = t.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return t;
}

export function mdToHtml(md: string): string {
  const lines = (md || '').replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m: RegExpMatchArray | null;
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }
    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { const n = Math.min(m[1].length, 4); out.push(`<h${n}>${inline(m[2])}</h${n}>`); i++; continue; }
    if (/^\s*>/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push(`<blockquote>${buf.map(inline).join('<br>')}</blockquote>`); continue;
    }
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(line); i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
      out.push(`<table><thead><tr>${head.map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      out.push(`<ul>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ul>`); continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
      out.push(`<ol>${items.map(x => `<li>${inline(x)}</li>`).join('')}</ol>`); continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*[-*]\s+|\s*\d+[.)]\s+|\s*>|\s*\||\s*---+\s*$)/.test(lines[i])) { buf.push(lines[i]); i++; }
    if (!buf.length) { buf.push(lines[i]); i++; }
    out.push(`<p>${buf.map(inline).join('<br>')}</p>`);
  }
  return out.join('');
}

/* ───────── HTML (contentEditable) → Markdown ───────── */

function nodeInline(n: Node): string {
  if (n.nodeType === Node.TEXT_NODE) return (n.textContent || '').replace(/ /g, ' ');
  if (n.nodeType !== Node.ELEMENT_NODE) return '';
  const el = n as HTMLElement;
  const tag = el.tagName.toLowerCase();
  const inner = Array.from(el.childNodes).map(nodeInline).join('');
  if (tag === 'br') return '  \n';
  if (tag === 'strong' || tag === 'b') return inner.trim() ? `**${inner.trim()}**` : inner;
  if (tag === 'em' || tag === 'i') return inner.trim() ? `*${inner.trim()}*` : inner;
  if (tag === 'a') { const href = el.getAttribute('href') || ''; return href ? `[${inner}](${href})` : inner; }
  if (tag === 'span' || tag === 'font' || tag === 'u') {
    const st = (el.getAttribute('style') || '').toLowerCase();
    if (/font-weight:\s*(bold|[6-9]00)/.test(st)) return inner.trim() ? `**${inner.trim()}**` : inner;
    if (/font-style:\s*italic/.test(st)) return inner.trim() ? `*${inner.trim()}*` : inner;
  }
  return inner;
}

function listMd(el: HTMLElement, ordered: boolean, depth: number): string {
  const pad = '  '.repeat(depth);
  let n = 1;
  return Array.from(el.children).filter(c => c.tagName.toLowerCase() === 'li').map(li => {
    const kids = Array.from(li.childNodes);
    const text = kids.filter(k => !(k.nodeType === 1 && /^(ul|ol)$/i.test((k as HTMLElement).tagName))).map(nodeInline).join('').trim();
    const nested = kids.filter(k => k.nodeType === 1 && /^(ul|ol)$/i.test((k as HTMLElement).tagName))
      .map(k => '\n' + listMd(k as HTMLElement, (k as HTMLElement).tagName.toLowerCase() === 'ol', depth + 1)).join('');
    return `${pad}${ordered ? `${n++}.` : '-'} ${text}${nested}`;
  }).join('\n');
}

function blockMd(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  const text = () => Array.from(el.childNodes).map(nodeInline).join('').trim();
  if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag[1]))} ${text()}`;
  if (tag === 'hr') return '---';
  if (tag === 'ul' || tag === 'ol') return listMd(el, tag === 'ol', 0);
  if (tag === 'blockquote') return text().split('\n').map(l => `> ${l}`).join('\n');
  if (tag === 'table') {
    const rows = Array.from(el.querySelectorAll('tr')).map(tr => Array.from(tr.children).map(c => (c.textContent || '').trim().replace(/\|/g, '/')));
    if (!rows.length) return '';
    const w = Math.max(...rows.map(r => r.length));
    const fmt = (r: string[]) => `| ${Array.from({ length: w }, (_, k) => r[k] || '').join(' | ')} |`;
    return [fmt(rows[0]), `|${Array.from({ length: w }, () => '---').join('|')}|`, ...rows.slice(1).map(fmt)].join('\n');
  }
  return text();
}

export function htmlToMd(root: HTMLElement): string {
  const blocks: string[] = [];
  let loose = '';
  const flush = () => { if (loose.trim()) blocks.push(loose.trim()); loose = ''; };
  Array.from(root.childNodes).forEach(n => {
    if (n.nodeType === Node.ELEMENT_NODE && /^(h[1-6]|p|div|ul|ol|hr|blockquote|table)$/i.test((n as HTMLElement).tagName)) {
      flush();
      const el = n as HTMLElement;
      if (el.tagName.toLowerCase() === 'div' && !el.querySelector('h1,h2,h3,h4,ul,ol,hr,table')) { const t = blockMd(el); if (t) blocks.push(t); }
      else if (el.tagName.toLowerCase() === 'div') { const sub = htmlToMd(el); if (sub) blocks.push(sub); }
      else { const t = blockMd(el); if (t) blocks.push(t); }
    } else loose += nodeInline(n);
  });
  flush();
  return blocks.join('\n\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/**
 * Éditeur Markdown visuel (WYSIWYG) sans dépendance : l'utilisateur voit et édite le rendu final
 * (titres, gras, listes, tableaux, liens). La valeur échangée est du Markdown.
 */
export default function MarkdownEditor({ value, onChange, minHeight = 420 }: { value: string; onChange: (md: string) => void; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || value === last.current) return;
    el.innerHTML = mdToHtml(value || '');
    last.current = value;
  }, [value]);

  const emit = () => {
    if (!ref.current) return;
    const md = htmlToMd(ref.current);
    last.current = md;
    onChange(md);
  };

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    try { document.execCommand(cmd, false, arg); } catch { /* ignore */ }
    emit();
  };
  const block = (tag: string) => exec('formatBlock', tag);
  const link = () => {
    const url = window.prompt('Adresse du lien (https://…)', 'https://');
    if (url && /^https?:\/\//i.test(url)) exec('createLink', url);
  };

  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" title={title} onMouseDown={e => e.preventDefault()} onClick={onClick}
      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#475569', padding: '5px 7px', borderRadius: 5, display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
      {children}
    </button>
  );

  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', padding: '4px 8px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
        <Btn title="Titre de section" onClick={() => block('h3')}><Heading2 size={15} /> Titre</Btn>
        <Btn title="Sous-titre" onClick={() => block('h4')}><Heading3 size={15} /> Sous-titre</Btn>
        <Btn title="Texte normal" onClick={() => block('p')}><Pilcrow size={15} /></Btn>
        <span style={{ width: 1, height: 18, background: '#e2e8f0', margin: '0 4px' }} />
        <Btn title="Gras" onClick={() => exec('bold')}><Bold size={15} /></Btn>
        <Btn title="Italique" onClick={() => exec('italic')}><Italic size={15} /></Btn>
        <Btn title="Liste à puces" onClick={() => exec('insertUnorderedList')}><List size={15} /></Btn>
        <Btn title="Liste numérotée" onClick={() => exec('insertOrderedList')}><ListOrdered size={15} /></Btn>
        <Btn title="Citation" onClick={() => block('blockquote')}><Quote size={15} /></Btn>
        <Btn title="Lien" onClick={link}><Link2 size={15} /></Btn>
        <Btn title="Ligne de séparation" onClick={() => exec('insertHorizontalRule')}><Minus size={15} /></Btn>
      </div>
      <div
        ref={ref}
        className="md-wysiwyg"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        onInput={emit}
        onBlur={emit}
        style={{ minHeight, maxHeight: '62vh', overflowY: 'auto', padding: '14px 20px', fontSize: 13.5, lineHeight: 1.65, color: '#1e293b', outline: 'none' }}
      />
      <style>{`
        .md-wysiwyg h1 { font-size: 21px; margin: 4px 0 10px; font-weight: 800; }
        .md-wysiwyg h2 { font-size: 18px; margin: 18px 0 8px; font-weight: 800; color: #3730a3; }
        .md-wysiwyg h3 { font-size: 15.5px; margin: 16px 0 6px; font-weight: 800; color: #3730a3; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
        .md-wysiwyg h4 { font-size: 13.5px; margin: 12px 0 4px; font-weight: 800; }
        .md-wysiwyg p { margin: 6px 0; }
        .md-wysiwyg ul { padding-left: 22px; list-style: disc; margin: 6px 0; }
        .md-wysiwyg ol { padding-left: 22px; list-style: decimal; margin: 6px 0; }
        .md-wysiwyg hr { border: none; border-top: 1px solid #cbd5e1; margin: 14px 0; }
        .md-wysiwyg blockquote { border-left: 3px solid #a5b4fc; margin: 8px 0; padding: 2px 12px; color: #475569; background: #f8fafc; }
        .md-wysiwyg a { color: #4f46e5; text-decoration: underline; }
        .md-wysiwyg table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12.5px; }
        .md-wysiwyg th, .md-wysiwyg td { border: 1px solid #e2e8f0; padding: 6px 9px; text-align: left; vertical-align: top; }
        .md-wysiwyg th { background: #f1f5f9; }
      `}</style>
    </div>
  );
}
