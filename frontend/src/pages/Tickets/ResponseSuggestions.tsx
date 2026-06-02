import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { MessageSquare, ChevronDown, ChevronUp, Zap } from 'lucide-react';

interface Template {
  id: number;
  name: string;
  description: string | null;
  message: string;
  subcategory_name: string | null;
}

interface Props {
  categoryId: number | null | undefined;
  subcategoryId: number | null | undefined;
  ticket: any;          // pour résoudre les variables
  onApply: (html: string) => void;
}

// Le nom du demandeur est au format "Prénom NOM" → 1er mot = prénom, le reste = nom
const fullName = (t: any): string => t.requester?.name || t.requester_name || '';
const VARS: Record<string, (t: any) => string> = {
  '{{prenom_demandeur}}': t => fullName(t).trim().split(/\s+/)[0] || '',
  '{{nom_demandeur}}':    t => fullName(t).trim().split(/\s+/).slice(1).join(' ') || '',
  '{{numero_ticket}}':    t => String(t.id || ''),
  '{{titre_ticket}}':     t => t.title || '',
  '{{categorie}}':        t => t.category_name || '',
  '{{sous_categorie}}':   t => t.subcategory_name || '',
  '{{technicien}}':       t => t.technician_name || '',
  '{{date_creation}}':    t => t.date_creation ? new Date(t.date_creation).toLocaleDateString('fr-FR') : '',
};

function resolve(message: string, ticket: any): string {
  let result = message;
  for (const [key, fn] of Object.entries(VARS)) {
    result = result.replaceAll(key, fn(ticket));
  }
  return result;
}

export default function ResponseSuggestions({ categoryId, subcategoryId, ticket, onApply }: Props) {
  const token = localStorage.getItem('token');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Template | null>(null);
  const prevCatRef = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (!categoryId) { setTemplates([]); return; }
    if (prevCatRef.current === categoryId) return;
    prevCatRef.current = categoryId;

    const params: Record<string, any> = { category_id: categoryId };
    if (subcategoryId) params.subcategory_id = subcategoryId;

    axios.get('/api/tickets/admin/response-templates', {
      headers: { Authorization: `Bearer ${token}` },
      params,
    })
      .then(r => {
        setTemplates(r.data || []);
        if (r.data?.length > 0) setOpen(true); // auto-ouvrir quand des templates existent
      })
      .catch(() => setTemplates([]));
  }, [categoryId, subcategoryId]);

  if (!categoryId || templates.length === 0) return null;

  function apply(t: Template) {
    const resolved = resolve(t.message, ticket);
    onApply(resolved);
    setPreview(null);
    setOpen(false);
  }

  return (
    <div style={{ marginBottom: 8, border: '1px solid #e0e7ff', borderRadius: 8, overflow: 'hidden' }}>
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', background: '#f0f1fe', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <Zap size={13} color="#6366f1" />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#4338ca', flex: 1 }}>
          {templates.length} réponse{templates.length > 1 ? 's' : ''} auto disponible{templates.length > 1 ? 's' : ''}
        </span>
        {open ? <ChevronUp size={13} color="#6366f1" /> : <ChevronDown size={13} color="#6366f1" />}
      </button>

      {open && (
        <div style={{ background: 'white' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px', borderBottom: templates.length > 1 ? '1px solid #f1f5f9' : 'none' }}>
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setPreview(preview?.id === t.id ? null : t)}
                title={t.description || t.name}
                style={{
                  padding: '4px 10px', borderRadius: 6, border: '1px solid',
                  fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  borderColor: preview?.id === t.id ? '#6366f1' : '#e0e7ff',
                  background: preview?.id === t.id ? '#eef2ff' : '#f8faff',
                  color: preview?.id === t.id ? '#4338ca' : '#4338ca',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                <MessageSquare size={11} />
                {t.name}
                {t.subcategory_name && (
                  <span style={{ fontSize: 10, opacity: 0.7 }}>· {t.subcategory_name}</span>
                )}
              </button>
            ))}
          </div>

          {/* Preview panel */}
          {preview && (
            <div style={{ padding: '10px 12px', background: '#fafbff', borderTop: '1px solid #e0e7ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Aperçu — {preview.name}</span>
                <button
                  onClick={() => apply(preview)}
                  style={{
                    padding: '5px 14px', border: 'none', borderRadius: 6,
                    background: '#6366f1', color: 'white', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <Zap size={12} /> Utiliser ce template
                </button>
              </div>
              <div
                style={{
                  fontSize: 13, color: '#374151', lineHeight: 1.6,
                  background: 'white', border: '1px solid #e2e8f0', borderRadius: 6,
                  padding: '10px 14px', maxHeight: 200, overflowY: 'auto',
                }}
                dangerouslySetInnerHTML={{ __html: resolve(preview.message, ticket).replace(/\n/g, '<br/>') }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
