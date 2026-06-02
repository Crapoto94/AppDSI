import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FileText, ChevronDown, ChevronUp, BookOpen, Download, ExternalLink, Search, Library } from 'lucide-react';

interface KbDoc {
  id: number;
  name: string;
  description: string | null;
  original_name: string;
  category_name: string | null;
  app_name: string | null;
}

interface MagappDoc {
  id: number;
  title: string;
  description: string | null;
  doc_type: string | null;
  url: string;
  is_favorite: boolean;
  is_technical?: boolean;
}

// Document à joindre au ticket (résolu en fichier côté serveur via /attach-doc)
export interface AttachDoc {
  source: 'kb' | 'magapp';
  id: number;
  name: string;
}

interface Props {
  categoryId: number | null | undefined;
  softwareId: number | null | undefined;   // logiciel métier associé au ticket (= id app magapp)
  softwareName: string | null | undefined;
  onAttach: (doc: AttachDoc) => void;        // ajoute le document aux pièces jointes du commentaire
}

export default function DocumentSuggestions({ categoryId, softwareId, softwareName, onAttach }: Props) {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  // 1) Docs magapp publics du logiciel associé
  const [magappDocs, setMagappDocs] = useState<MagappDoc[]>([]);
  const [openMagapp, setOpenMagapp] = useState(false);

  // 2) Docs base de connaissance filtrés (logiciel ou catégorie)
  const [kbDocs, setKbDocs] = useState<KbDoc[]>([]);
  const [openKb, setOpenKb] = useState(false);
  const bySoftware = !!softwareId;

  // 3) Parcourir toute la base de connaissance
  const [allKbDocs, setAllKbDocs] = useState<KbDoc[] | null>(null);
  const [openAll, setOpenAll] = useState(false);
  const [search, setSearch] = useState('');

  // ── Docs magapp PUBLICS du logiciel ──
  useEffect(() => {
    if (!softwareId) { setMagappDocs([]); return; }
    axios.get(`/api/magapp/apps/${softwareId}/docs`, { headers })
      .then(r => {
        const docs = (r.data || []).filter((d: MagappDoc) => !d.is_technical);
        setMagappDocs(docs);
        if (docs.length > 0) setOpenMagapp(true);
      })
      .catch(() => setMagappDocs([]));
  }, [softwareId]);

  // ── Docs KB filtrés (logiciel prioritaire, sinon catégorie) ──
  useEffect(() => {
    if (!categoryId && !softwareId) { setKbDocs([]); return; }
    const params: Record<string, any> = {};
    if (softwareId) params.app_id = softwareId;
    else if (categoryId) params.category_id = categoryId;
    axios.get('/api/tickets/admin/knowledge-documents', { headers, params })
      .then(r => setKbDocs(r.data || []))
      .catch(() => setKbDocs([]));
  }, [categoryId, softwareId]);

  // ── Toute la base (chargée à la demande) ──
  function toggleAll() {
    const next = !openAll;
    setOpenAll(next);
    if (next && allKbDocs === null) {
      axios.get('/api/tickets/admin/knowledge-documents', { headers })
        .then(r => setAllKbDocs(r.data || []))
        .catch(() => setAllKbDocs([]));
    }
  }

  const attachKb = (d: KbDoc) => onAttach({ source: 'kb', id: d.id, name: d.name });
  const attachMagapp = (d: MagappDoc) => onAttach({ source: 'magapp', id: d.id, name: d.title });

  const allFiltered = (allKbDocs || []).filter(d =>
    !search.trim() ||
    (d.name + ' ' + (d.description || '') + ' ' + (d.app_name || '') + ' ' + (d.category_name || '')).toLowerCase().includes(search.toLowerCase()));

  const sectionHeader = (label: string, count: number, isOpen: boolean, onClick: () => void, color: string, bg: string, Icon: any, border?: string) => (
    <button onClick={onClick}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: bg, border: 'none', borderTop: border, cursor: 'pointer', textAlign: 'left' }}>
      <Icon size={13} color={color} />
      <span style={{ fontSize: 12, fontWeight: 600, color, flex: 1 }}>{label}{count >= 0 ? ` (${count})` : ''}</span>
      {isOpen ? <ChevronUp size={13} color={color} /> : <ChevronDown size={13} color={color} />}
    </button>
  );

  const kbRow = (d: KbDoc) => (
    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: '1px solid #f1f5f9' }}>
      <FileText size={15} color="#059669" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
        <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {[d.app_name, d.category_name, d.description].filter(Boolean).join(' · ') || d.original_name}
        </div>
      </div>
      <button onClick={() => { fetch(`/api/tickets/admin/knowledge-documents/${d.id}/download?mode=inline`, { headers }).then(r => r.blob()).then(b => window.open(URL.createObjectURL(b), '_blank')).catch(() => {}); }}
        title="Prévisualiser" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#0ea5e9', padding: 4, display: 'flex' }}>
        <Download size={14} />
      </button>
      <button onClick={() => attachKb(d)}
        style={{ padding: '4px 10px', border: 'none', borderRadius: 6, background: '#059669', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
        + Joindre
      </button>
    </div>
  );

  return (
    <div style={{ marginBottom: 8, border: '1px solid #d1fae5', borderRadius: 8, overflow: 'hidden' }}>
      {/* ── 1) Documents magapp du logiciel associé ── */}
      {magappDocs.length > 0 && (
        <>
          {sectionHeader(`Documents — ${softwareName || 'logiciel'}`, magappDocs.length, openMagapp, () => setOpenMagapp(o => !o), '#0369a1', '#e0f2fe', Library)}
          {openMagapp && (
            <div style={{ background: 'white' }}>
              {magappDocs.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderTop: '1px solid #f1f5f9' }}>
                  <ExternalLink size={15} color="#0369a1" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {d.is_favorite && '⭐ '}{d.title}
                    </div>
                    {(d.description || d.doc_type) && <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[d.doc_type, d.description].filter(Boolean).join(' · ')}</div>}
                  </div>
                  {d.url && (
                    <a href={d.url} target="_blank" rel="noopener noreferrer" title="Ouvrir" style={{ color: '#0ea5e9', padding: 4, display: 'flex' }}>
                      <ExternalLink size={14} />
                    </a>
                  )}
                  <button onClick={() => attachMagapp(d)}
                    style={{ padding: '4px 10px', border: 'none', borderRadius: 6, background: '#0369a1', color: 'white', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                    + Joindre
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── 2) Base de connaissance — logiciel / catégorie ── */}
      {kbDocs.length > 0 && (
        <>
          {sectionHeader(
            bySoftware ? `Base de connaissance — ${softwareName || 'logiciel'}` : 'Base de connaissance — catégorie',
            kbDocs.length, openKb, () => setOpenKb(o => !o), '#047857', '#ecfdf5', BookOpen,
            magappDocs.length > 0 ? '1px solid #d1fae5' : undefined)}
          {openKb && <div style={{ background: 'white' }}>{kbDocs.map(kbRow)}</div>}
        </>
      )}

      {/* ── 3) Parcourir toute la base de connaissance ── */}
      {sectionHeader('Parcourir toute la base de connaissance', allKbDocs ? allFiltered.length : -1, openAll, toggleAll, '#475569', '#f8fafc', Library,
        (magappDocs.length > 0 || kbDocs.length > 0) ? '1px solid #e2e8f0' : undefined)}
      {openAll && (
        <div style={{ background: 'white' }}>
          <div style={{ padding: '8px 12px 0' }}>
            <div style={{ position: 'relative' }}>
              <Search size={12} color="#9ca3af" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un document…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px 5px 26px', border: '1px solid #e4e4e7', borderRadius: 6, fontSize: 12 }} />
            </div>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {allKbDocs === null
              ? <div style={{ padding: '10px 12px', fontSize: 12, color: '#9ca3af' }}>Chargement…</div>
              : allFiltered.length === 0
                ? <div style={{ padding: '10px 12px', fontSize: 12, color: '#9ca3af' }}>Aucun document</div>
                : allFiltered.map(kbRow)}
          </div>
        </div>
      )}
    </div>
  );
}
