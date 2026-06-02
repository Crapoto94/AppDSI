import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { MessageSquare, ChevronDown, ChevronUp, Zap, Search } from 'lucide-react';

interface Template {
  id: number;
  name: string;
  description: string | null;
  message: string;
  category_id: number | null;   // null = réponse commune (sans catégorie)
  subcategory_id: number | null;
  category_name: string | null;
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
  const [allTemplates, setAllTemplates] = useState<Template[]>([]);
  const [open, setOpen] = useState(false);
  const [openAll, setOpenAll] = useState(false);
  const [preview, setPreview] = useState<Template | null>(null);
  const [search, setSearch] = useState('');
  const loadedRef = useRef(false);

  // Charge TOUS les templates une seule fois (catégorie + toutes catégories)
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    axios.get('/api/tickets/admin/response-templates', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setAllTemplates(r.data || []))
      .catch(() => setAllTemplates([]));
  }, [token]);

  // Templates de la catégorie du ticket (incluant sous-catégorie ou templates sans sous-catégorie)
  const catTemplates = categoryId
    ? allTemplates.filter(t =>
        t.category_id === categoryId &&
        (!subcategoryId || !t.subcategory_id || t.subcategory_id === subcategoryId))
    : [];
  const catIds = new Set(catTemplates.map(t => t.id));
  // "Réponses communes" = templates sans catégorie (category_id null)
  const otherTemplates = allTemplates.filter(t =>
    !catIds.has(t.id) && t.category_id === null
  );
  const otherFiltered = search.trim()
    ? otherTemplates.filter(t =>
        (t.name + ' ' + (t.category_name || '') + ' ' + (t.description || '')).toLowerCase().includes(search.toLowerCase()))
    : otherTemplates;

  // Auto-ouvrir le groupe catégorie quand il y a des templates
  useEffect(() => { if (catTemplates.length > 0) setOpen(true); }, [catTemplates.length]);

  if (allTemplates.length === 0) return null;

  function apply(t: Template) {
    onApply(resolve(t.message, ticket));
    setPreview(null);
    setOpen(false);
    setOpenAll(false);
  }

  const chip = (t: Template, withCat?: boolean) => (
    <button
      key={t.id}
      onClick={() => setPreview(preview?.id === t.id ? null : t)}
      title={t.description || t.name}
      style={{
        padding: '4px 10px', borderRadius: 6, border: '1px solid',
        fontSize: 12, fontWeight: 500, cursor: 'pointer',
        borderColor: preview?.id === t.id ? '#6366f1' : '#e0e7ff',
        background: preview?.id === t.id ? '#eef2ff' : '#f8faff',
        color: '#4338ca', display: 'flex', alignItems: 'center', gap: 5,
      }}
    >
      <MessageSquare size={11} />
      {t.name}
      {withCat && t.category_name && (
        <span style={{ fontSize: 10, opacity: 0.7 }}>· {t.category_name}</span>
      )}
      {!withCat && t.subcategory_name && (
        <span style={{ fontSize: 10, opacity: 0.7 }}>· {t.subcategory_name}</span>
      )}
    </button>
  );

  const previewPanel = preview && (
    <div style={{ padding: '10px 12px', background: '#fafbff', borderTop: '1px solid #e0e7ff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
          Aperçu — {preview.name}
          {preview.category_name && <span style={{ fontWeight: 400, color: '#9ca3af' }}> · {preview.category_name}</span>}
        </span>
        <button
          onClick={() => apply(preview)}
          style={{ padding: '5px 14px', border: 'none', borderRadius: 6, background: '#6366f1', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
        >
          <Zap size={12} /> Utiliser ce template
        </button>
      </div>
      <div
        style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, padding: '10px 14px', maxHeight: 200, overflowY: 'auto' }}
        dangerouslySetInnerHTML={{ __html: resolve(preview.message, ticket).replace(/\n/g, '<br/>') }}
      />
    </div>
  );

  return (
    <div style={{ marginBottom: 8, border: '1px solid #e0e7ff', borderRadius: 8, overflow: 'hidden' }}>
      {/* ── Groupe : réponses de la catégorie ── */}
      {catTemplates.length > 0 && (
        <>
          <button
            onClick={() => setOpen(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f0f1fe', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <Zap size={13} color="#6366f1" />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4338ca', flex: 1 }}>
              {catTemplates.length} réponse{catTemplates.length > 1 ? 's' : ''} auto — catégorie
            </span>
            {open ? <ChevronUp size={13} color="#6366f1" /> : <ChevronDown size={13} color="#6366f1" />}
          </button>
          {open && (
            <div style={{ background: 'white' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px' }}>
                {catTemplates.map(t => chip(t))}
              </div>
              {preview && catIds.has(preview.id) && previewPanel}
            </div>
          )}
        </>
      )}

      {/* ── Groupe : toutes catégories ── */}
      {otherTemplates.length > 0 && (
        <>
          <button
            onClick={() => setOpenAll(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#f8faff', border: 'none', borderTop: catTemplates.length > 0 ? '1px solid #e0e7ff' : 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <MessageSquare size={13} color="#818cf8" />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#6366f1', flex: 1 }}>
              {otherTemplates.length} réponse{otherTemplates.length > 1 ? 's' : ''} — 🌐 Réponses communes
            </span>
            {openAll ? <ChevronUp size={13} color="#818cf8" /> : <ChevronDown size={13} color="#818cf8" />}
          </button>
          {openAll && (
            <div style={{ background: 'white' }}>
              <div style={{ padding: '8px 12px 0' }}>
                <div style={{ position: 'relative' }}>
                  <Search size={12} color="#9ca3af" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Filtrer les réponses…"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px 5px 26px', border: '1px solid #e4e4e7', borderRadius: 6, fontSize: 12 }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px', maxHeight: 160, overflowY: 'auto' }}>
                {otherFiltered.length === 0
                  ? <span style={{ fontSize: 12, color: '#9ca3af' }}>Aucune réponse</span>
                  : otherFiltered.map(t => chip(t, true))}
              </div>
              {preview && !catIds.has(preview.id) && previewPanel}
            </div>
          )}
        </>
      )}
    </div>
  );
}
