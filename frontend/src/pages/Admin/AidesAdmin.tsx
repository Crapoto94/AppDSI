// ─── Aide contextuelle : vue d'ensemble par module (/admin/aides) ─────────────
// Liste les entrées de hub.page_help regroupées par module applicatif (registre
// backend/shared/modules-registry.js), avec aperçu, édition et URL d'accès direct.
// Remplace l'ancien onglet « Aide » de /admin/hub (composant PageHelpAdmin retiré).
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import * as LucideIcons from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  HelpCircle, Plus, Save, Trash2, Upload, FileText, Eye, X,
  ExternalLink, Copy, Check, Search, Layers,
} from 'lucide-react';

interface ModuleDef {
  key: string;
  title: string;
  icon: string;
  description: string;
  url: string;
  is_visible: boolean;
}

interface HelpEntry {
  id: number;
  page_path: string;
  content: string;
  content_html?: string;
  updated_at?: string;
  created_by?: string;
}

const getModuleIcon = (name: string, size = 18) => {
  // @ts-expect-error résolution dynamique d'une icône lucide par son nom
  const Icon = LucideIcons[name] || LucideIcons.Box;
  return <Icon size={size} />;
};

const AidesAdmin: React.FC = () => {
  const { token } = useAuth();
  const h = { Authorization: `Bearer ${token}` };

  const [modules, setModules] = useState<ModuleDef[]>([]);
  const [entries, setEntries] = useState<HelpEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const [previewEntry, setPreviewEntry] = useState<HelpEntry | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorIsNew, setEditorIsNew] = useState(false);
  const [editorPath, setEditorPath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [modRes, helpRes] = await Promise.all([
        axios.get('/api/admin/modules', { headers: h }),
        axios.get('/api/page-help', { headers: h }),
      ]);
      setModules(Array.isArray(modRes.data) ? modRes.data : []);
      setEntries(Array.isArray(helpRes.data) ? helpRes.data : []);
    } catch {
      setModules([]);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Regroupe les entrées d'aide par module (correspondance sur le préfixe de route).
  const { grouped, others } = useMemo(() => {
    const sortedModules = [...modules].sort((a, b) => b.url.length - a.url.length);
    const matched = new Set<number>();
    const grouped = modules.map(mod => {
      const modEntries = entries.filter(e => {
        const isPrefixMatch = e.page_path === mod.url || e.page_path.startsWith(mod.url + '/');
        if (!isPrefixMatch) return false;
        // Évite qu'une page très générique « vole » une entrée à un module plus spécifique.
        const best = sortedModules.find(m => e.page_path === m.url || e.page_path.startsWith(m.url + '/'));
        return best?.key === mod.key;
      });
      modEntries.forEach(e => matched.add(e.id));
      return { module: mod, entries: modEntries };
    });
    const others = entries.filter(e => !matched.has(e.id));
    return { grouped, others };
  }, [modules, entries]);

  const term = search.trim().toLowerCase();
  const visibleGrouped = term
    ? grouped.filter(g => g.module.title.toLowerCase().includes(term) || g.entries.some(e => e.page_path.toLowerCase().includes(term)))
    : grouped;
  const visibleOthers = term ? others.filter(e => e.page_path.toLowerCase().includes(term)) : others;

  const directUrl = (path: string) => `${window.location.origin}${path}`;

  const copyUrl = async (path: string) => {
    try {
      await navigator.clipboard.writeText(directUrl(path));
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1500);
    } catch { /* presse-papiers indisponible */ }
  };

  const openNewEntry = (prefillPath = '') => {
    setEditorIsNew(true);
    setEditorPath(prefillPath);
    setEditorContent('');
    setEditorOpen(true);
  };

  const openEditEntry = (entry: HelpEntry) => {
    setEditorIsNew(false);
    setEditorPath(entry.page_path);
    setEditorContent(entry.content || '');
    setEditorOpen(true);
  };

  const saveEditor = async () => {
    if (!editorPath.trim()) { alert('Indiquez le chemin de la page (ex : /budget).'); return; }
    if (!editorContent.trim()) { alert("Le contenu de l'aide est vide."); return; }
    setSaving(true);
    try {
      await axios.put(`/api/page-help/${encodeURIComponent(editorPath.trim())}`, { content: editorContent }, { headers: h });
      setEditorOpen(false);
      await load();
    } catch (e: any) {
      alert(e.response?.data?.message || "Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  const onUpload = async (file: File) => {
    const text = await file.text();
    setEditorContent(text);
  };

  const removeEntry = async (path: string) => {
    if (!window.confirm(`Supprimer l'aide de « ${path} » ?`)) return;
    try {
      await axios.delete(`/api/page-help/${encodeURIComponent(path)}`, { headers: h });
      await load();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la suppression');
    }
  };

  const totalEntries = entries.length;
  const inputS: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  const renderEntryRow = (entry: HelpEntry) => (
    <div key={entry.id} className="aide-row">
      <div className="aide-row-main">
        <code className="aide-path">{entry.page_path}</code>
        <span className="aide-meta">
          {entry.updated_at ? `Mis à jour le ${new Date(entry.updated_at).toLocaleDateString('fr-FR')}` : ''}
          {entry.created_by ? ` par ${entry.created_by}` : ''}
        </span>
      </div>
      <div className="aide-row-actions">
        <button className="aide-icon-btn" title="Aperçu" onClick={() => setPreviewEntry(entry)}><Eye size={15} /></button>
        <button className="aide-icon-btn" title="Modifier" onClick={() => openEditEntry(entry)}><FileText size={15} /></button>
        <button className="aide-icon-btn" title="Copier l'URL d'accès direct" onClick={() => copyUrl(entry.page_path)}>
          {copiedPath === entry.page_path ? <Check size={15} color="#16a34a" /> : <Copy size={15} />}
        </button>
        <a className="aide-icon-btn" title="Ouvrir la page" href={directUrl(entry.page_path)} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={15} />
        </a>
        <button className="aide-icon-btn danger" title="Supprimer" onClick={() => removeEntry(entry.page_path)}><Trash2 size={15} /></button>
      </div>
    </div>
  );

  return (
    <div className="aides-admin">
      <div className="aides-head">
        <div>
          <h1 className="aides-title"><HelpCircle size={24} /> Aides</h1>
          <p className="aides-subtitle">
            Contenu d'aide contextuelle affiché aux agents (bouton « Aide » du DSI Hub et du Magasin d'applications) — {totalEntries} page{totalEntries !== 1 ? 's' : ''} documentée{totalEntries !== 1 ? 's' : ''}.
          </p>
        </div>
        <button className="aide-btn-primary" onClick={() => openNewEntry()}><Plus size={15} /> Nouvelle aide</button>
      </div>

      <div className="aides-search">
        <Search size={16} color="#94a3b8" />
        <input placeholder="Filtrer par module ou par chemin..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="aides-empty">Chargement…</div>
      ) : (
        <div className="aides-list">
          {visibleGrouped.map(({ module, entries: modEntries }) => (
            <div key={module.key} className="aide-module-card">
              <div className="aide-module-head">
                <div className="aide-module-title">
                  {getModuleIcon(module.icon)}
                  <span>{module.title}</span>
                  {!module.is_visible && <span className="aide-module-hidden">module masqué</span>}
                </div>
                <button className="aide-add-link" onClick={() => openNewEntry(module.url)}><Plus size={13} /> Ajouter</button>
              </div>
              {modEntries.length === 0 ? (
                <div className="aide-empty-row">Aucune aide pour ce module — <button onClick={() => openNewEntry(module.url)}>en créer une</button></div>
              ) : (
                <div className="aide-rows">{modEntries.map(renderEntryRow)}</div>
              )}
            </div>
          ))}

          {visibleOthers.length > 0 && (
            <div className="aide-module-card">
              <div className="aide-module-head">
                <div className="aide-module-title"><Layers size={18} /><span>Autres pages</span></div>
              </div>
              <div className="aide-rows">{visibleOthers.map(renderEntryRow)}</div>
            </div>
          )}

          {visibleGrouped.every(g => g.entries.length === 0) && visibleOthers.length === 0 && term && (
            <div className="aides-empty">Aucun résultat pour « {search} ».</div>
          )}
        </div>
      )}

      {/* Modale édition / création */}
      {editorOpen && (
        <div className="aide-modal-overlay" onClick={() => !saving && setEditorOpen(false)}>
          <div className="aide-modal" onClick={e => e.stopPropagation()}>
            <div className="aide-modal-head">
              <h3>{editorIsNew ? 'Nouvelle aide' : `Modifier l'aide — ${editorPath}`}</h3>
              <button className="aide-icon-btn" onClick={() => setEditorOpen(false)}><X size={18} /></button>
            </div>
            <div className="aide-modal-body">
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Chemin de la page</label>
                <input
                  list="aide-known-paths"
                  style={inputS}
                  value={editorPath}
                  onChange={e => setEditorPath(e.target.value)}
                  placeholder="Ex : /budget"
                  disabled={!editorIsNew}
                />
                <datalist id="aide-known-paths">{modules.map(m => <option key={m.key} value={m.url} />)}</datalist>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  Le chemin tel qu'il apparaît dans l'URL de l'application (ex : <code>/tickets</code>, <code>/budget</code>). Une aide par page.
                </div>
              </div>
              <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <label style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Contenu de l'aide (Markdown)</label>
                  <button onClick={() => fileRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}><Upload size={13} /> Importer un .md</button>
                  <input ref={fileRef} type="file" accept=".md,.markdown,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); if (fileRef.current) fileRef.current.value = ''; }} />
                </div>
                <textarea
                  value={editorContent}
                  onChange={e => setEditorContent(e.target.value)}
                  rows={16}
                  spellCheck={false}
                  placeholder={"# Aide de la page\n\nExpliquez ici à quoi sert la page et comment l'utiliser.\n\n- point 1\n- point 2"}
                  style={{ ...inputS, fontFamily: 'Consolas, Menlo, monospace', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }}
                />
              </div>
            </div>
            <div className="aide-modal-foot">
              <button className="aide-btn-secondary" onClick={() => setEditorOpen(false)}>Annuler</button>
              <button className="aide-btn-primary" onClick={saveEditor} disabled={saving}>
                <Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale aperçu */}
      {previewEntry && (
        <div className="aide-modal-overlay" onClick={() => setPreviewEntry(null)}>
          <div className="aide-modal" style={{ maxWidth: 760 }} onClick={e => e.stopPropagation()}>
            <div className="aide-modal-head">
              <h3><code>{previewEntry.page_path}</code></h3>
              <button className="aide-icon-btn" onClick={() => setPreviewEntry(null)}><X size={18} /></button>
            </div>
            <div className="aide-modal-body">
              <div className="help-md" dangerouslySetInnerHTML={{ __html: previewEntry.content_html || '' }} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        .aides-admin { display: flex; flex-direction: column; gap: 18px; }
        .aides-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .aides-title { display: flex; align-items: center; gap: 10px; margin: 0; font-size: 1.4rem; font-weight: 800; color: #0f172a; }
        .aides-subtitle { margin: 6px 0 0; color: #64748b; font-size: 0.9rem; max-width: 62ch; }
        .aides-search { display: flex; align-items: center; gap: 8px; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 9px 14px; max-width: 420px; }
        .aides-search input { border: none; outline: none; flex: 1; font-size: 13.5px; }
        .aides-empty { color: #94a3b8; font-size: 13.5px; padding: 30px 0; text-align: center; }
        .aides-list { display: flex; flex-direction: column; gap: 14px; }

        .aide-module-card { background: #fff; border: 1px solid #e9eef5; border-radius: 14px; padding: 16px 18px; }
        .aide-module-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
        .aide-module-title { display: flex; align-items: center; gap: 9px; font-weight: 800; font-size: 0.98rem; color: #0f172a; }
        .aide-module-hidden { font-size: 10.5px; font-weight: 700; color: #b45309; background: #fef3c7; border: 1px solid #fcd34d; padding: 1px 7px; border-radius: 20px; }
        .aide-add-link { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; color: #2563eb; font-weight: 700; font-size: 12.5px; cursor: pointer; padding: 4px 6px; border-radius: 6px; }
        .aide-add-link:hover { background: #eff6ff; }

        .aide-empty-row { padding: 10px 2px 4px; font-size: 13px; color: #94a3b8; }
        .aide-empty-row button { background: none; border: none; color: #2563eb; font-weight: 700; cursor: pointer; padding: 0; font-size: 13px; }

        .aide-rows { display: flex; flex-direction: column; margin-top: 6px; }
        .aide-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 4px; border-top: 1px solid #f1f5f9; }
        .aide-row-main { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .aide-path { font-family: Consolas, Menlo, monospace; font-size: 12.5px; color: #0f172a; background: #f1f5f9; padding: 2px 8px; border-radius: 6px; width: fit-content; }
        .aide-meta { font-size: 11.5px; color: #94a3b8; }
        .aide-row-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

        .aide-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; color: #475569; cursor: pointer; text-decoration: none; }
        .aide-icon-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
        .aide-icon-btn.danger:hover { background: #fef2f2; border-color: #fecaca; color: #ef4444; }

        .aide-btn-primary { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; border-radius: 9px; border: none; background: #2563eb; color: #fff; font-weight: 700; font-size: 13px; cursor: pointer; }
        .aide-btn-primary:disabled { background: #94a3b8; cursor: default; }
        .aide-btn-secondary { padding: 9px 16px; border-radius: 9px; border: 1px solid #e2e8f0; background: #fff; color: #475569; font-weight: 700; font-size: 13px; cursor: pointer; }

        .aide-modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.55); backdrop-filter: blur(3px); z-index: 3000; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .aide-modal { background: #fff; width: 100%; max-width: 640px; max-height: 85vh; border-radius: 16px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.3); display: flex; flex-direction: column; overflow: hidden; }
        .aide-modal-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid #f1f5f9; }
        .aide-modal-head h3 { margin: 0; font-size: 1rem; font-weight: 800; color: #0f172a; }
        .aide-modal-body { padding: 18px 20px; overflow-y: auto; }
        .aide-modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px; border-top: 1px solid #f1f5f9; }
      `}</style>
    </div>
  );
};

export default AidesAdmin;
