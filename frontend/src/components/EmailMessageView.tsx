import { Mail, Paperclip } from 'lucide-react';

/**
 * Rendu unifié d'un message e-mail (.msg Outlook ou .eml MIME) à partir de la
 * structure normalisée renvoyée par le backend (shared/msg_parser.js).
 *
 * Utilisé par DocumentViewer (GED), ProjetDocumentExplorer et AttachmentViewer :
 * une seule implémentation pour tous les modules.
 */

export interface EmailAttachmentPreview {
  index: number;
  fileName: string;
  contentLength: number;
}

export interface EmailPreviewData {
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  date: string | null;
  bodyText: string;
  bodyHtml: string;
  attachments: EmailAttachmentPreview[];
}

interface Props {
  data: EmailPreviewData;
  /** URL de téléchargement d'une pièce jointe (rendu <a>). */
  attachmentHref?: (index: number) => string;
  /** Alternative à attachmentHref : callback (rendu <button>), pour les e-mails non stockés. */
  onAttachmentClick?: (index: number) => void;
  accent?: string;
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Met en forme le corps TEXTE BRUT (pas de HTML dans le message) : nettoie le
 * bandeau de sécurité de la passerelle mail (ex. Sophos), linkifie URLs/emails et
 * restitue paragraphes/listes. Tout est échappé avant insertion de nos balises
 * (contenu potentiellement externe). */
export function formatEmailPlainText(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/Attention\s*!\s*Ce message a été envoyé depuis l'extérieur[\s\S]*?sophospsmartbannerend\s*/i, '');
  text = escapeHtml(text.trim());
  text = text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  text = text.replace(/([\w.+-]+@[\w-]+\.[\w.-]+)/g, m => `<a href="mailto:${m}">${m}</a>`);
  const blocks = text.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  return blocks.map(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length && lines.every(l => /^[*\-]\s+/.test(l))) {
      return `<ul style="margin:6px 0;padding-left:20px;">${lines.map(l => `<li style="margin-bottom:2px;">${l.replace(/^[*\-]\s+/, '')}</li>`).join('')}</ul>`;
    }
    return `<p style="margin:0 0 12px;">${lines.join('<br/>')}</p>`;
  }).join('');
}

export default function EmailMessageView({ data, attachmentHref, onAttachmentClick, accent = '#4a6cf7' }: Props) {
  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div style={S.subject}><Mail size={16} color={accent} /> {data.subject || '(sans objet)'}</div>
        <div style={S.meta}><strong>De :</strong> {data.from || '—'}</div>
        {data.to.length > 0 && <div style={S.meta}><strong>À :</strong> {data.to.join(', ')}</div>}
        {data.cc.length > 0 && <div style={S.meta}><strong>Cc :</strong> {data.cc.join(', ')}</div>}
        <div style={S.meta}><strong>Date :</strong> {data.date ? formatDate(data.date) : '—'}</div>
      </div>
      {data.attachments.length > 0 && (
        <div style={S.attachments}>
          {data.attachments.map(a => onAttachmentClick ? (
            <button key={a.index} type="button" onClick={() => onAttachmentClick(a.index)} style={{ ...S.attachmentChip, cursor: 'pointer' }}>
              <Paperclip size={12} /> {a.fileName} <span style={{ color: '#9ca3af' }}>({formatSize(a.contentLength)})</span>
            </button>
          ) : (
            <a key={a.index} href={attachmentHref ? attachmentHref(a.index) : '#'} style={S.attachmentChip}>
              <Paperclip size={12} /> {a.fileName} <span style={{ color: '#9ca3af' }}>({formatSize(a.contentLength)})</span>
            </a>
          ))}
        </div>
      )}
      <div style={S.body}>
        {data.bodyHtml
          ? <iframe srcDoc={data.bodyHtml} style={S.frame} sandbox="" title={data.subject} />
          : <div style={S.bodyText} dangerouslySetInnerHTML={{ __html: formatEmailPlainText(data.bodyText) }} />}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' },
  header: { padding: '14px 18px', borderBottom: '1px solid #e5e7eb' },
  subject: { fontSize: 16, fontWeight: 700, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 },
  meta: { fontSize: 13, color: '#4b5563', marginTop: 2 },
  attachments: { padding: '10px 18px', borderBottom: '1px solid #e5e7eb', display: 'flex', flexWrap: 'wrap', gap: 8, background: '#f9fafb' },
  attachmentChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151',
    background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: '4px 10px', textDecoration: 'none',
  },
  body: { flex: 1, minHeight: 0, display: 'flex' },
  frame: { width: '100%', height: '100%', border: 'none', background: '#fff' },
  bodyText: { padding: 18, whiteSpace: 'normal', fontSize: 13, color: '#1f2937', overflowY: 'auto', flex: 1, lineHeight: 1.6 },
};
