import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FileText, ChevronDown, ChevronUp, BookOpen, Download } from 'lucide-react';

interface KbDoc {
  id: number;
  name: string;
  description: string | null;
  original_name: string;
  category_name: string | null;
  app_name: string | null;
}

interface Props {
  categoryId: number | null | undefined;
  softwareId: number | null | undefined;   // logiciel métier associé au ticket
  softwareName: string | null | undefined;
  onInsert: (html: string) => void;          // insère un lien doc dans le commentaire
}

export default function DocumentSuggestions({ categoryId, softwareId, softwareName, onInsert }: Props) {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Mode : par logiciel si un logiciel est associé, sinon par catégorie
  const bySoftware = !!softwareId;

  useEffect(() => {
    if (!categoryId && !softwareId) { setDocs([]); return; }
    setLoading(true);
    const params: Record<string, any> = {};
    if (softwareId) params.app_id = softwareId;
    else if (categoryId) params.category_id = categoryId;
    axios.get('/api/tickets/admin/knowledge-documents', { headers, params })
      .then(r => setDocs(r.data || []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [categoryId, softwareId]);

  if ((!categoryId && !softwareId) || (docs.length === 0 && !loading)) return null;

  async function insert(doc: KbDoc) {
    try {
      const r = await axios.get(`/api/tickets/admin/knowledge-documents/${doc.id}/public-link`, { headers });
      const url = r.data.url;
      onInsert(`<a href="${url}" target="_blank" rel="noopener">📄 ${doc.name}</a>`);
      setOpen(false);
    } catch {
      alert('Impossible de générer le lien du document');
    }
  }

  const label = bySoftware
    ? `Documents — ${softwareName || 'logiciel'}`
    : 'Documents de la base (catégorie)';

  return (
    <div style={{ marginBottom: 8, border: '1px solid #d1fae5', borderRadius: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: '#ecfdf5', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <BookOpen size={13} color="#059669" />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#047857', flex: 1 }}>
          {docs.length} document{docs.length > 1 ? 's' : ''} — {label}
        </span>
        {open ? <ChevronUp size={13} color="#059669" /> : <ChevronDown size={13} color="#059669" />}
      </button>

      {open && (
        <div style={{ background: 'white' }}>
          {docs.map(d => (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              borderTop: '1px solid #f1f5f9',
            }}>
              <FileText size={15} color="#059669" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                {d.description && <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.description}</div>}
              </div>
              {/* Prévisualiser */}
              <button
                onClick={() => {
                  fetch(`/api/tickets/admin/knowledge-documents/${d.id}/download?mode=inline`, { headers })
                    .then(r => r.blob()).then(b => window.open(URL.createObjectURL(b), '_blank')).catch(() => {});
                }}
                title="Prévisualiser"
                style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0ea5e9', padding: 4, display: 'flex' }}>
                <Download size={14} />
              </button>
              {/* Insérer le lien dans la réponse */}
              <button
                onClick={() => insert(d)}
                style={{ padding: '4px 10px', border: 'none', borderRadius: 6, background: '#059669', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                + Insérer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
