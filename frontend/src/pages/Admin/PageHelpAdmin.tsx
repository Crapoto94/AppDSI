// ─── Paramétrage de l'aide contextuelle par page (/admin/hub > Aide) ──────────
// Gère les entrées hub.page_help : un contenu d'aide (Markdown) par chemin de page.
// API : GET /api/page-help, GET /api/page-help/:page, PUT /api/page-help/:page, DELETE.
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { HelpCircle, Plus, Save, Trash2, Upload, FileText, Eye } from 'lucide-react';

interface HelpEntry { id: number; page_path: string; content: string; content_html?: string; updated_at?: string; created_by?: string; }

// Suggestions de pages fréquentes (le champ reste libre).
const COMMON_PAGES = [
  '/tickets', '/tickets/stats', '/budget', '/parc', '/projets', '/copieurs',
  '/consommables', '/contrats', '/calendrier-dsi', '/rencontres-budgetaires', '/admin',
];

const PageHelpAdmin: React.FC = () => {
  const { token } = useAuth();
  const h = { Authorization: `Bearer ${token}` };

  const [entries, setEntries] = useState<HelpEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [path, setPath] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get('/api/page-help', { headers: h });
      setEntries(Array.isArray(r.data) ? r.data : []);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const selectEntry = (e: HelpEntry) => { setPath(e.page_path); setContent(e.content || ''); setPreview(null); setSaved(false); };
  const newEntry = () => { setPath(''); setContent(''); setPreview(null); setSaved(false); };

  const save = async () => {
    if (!path.trim()) { alert('Indiquez le chemin de la page (ex : /tickets).'); return; }
    if (!content.trim()) { alert("Le contenu de l'aide est vide."); return; }
    setSaving(true);
    try {
      await axios.put(`/api/page-help/${encodeURIComponent(path.trim())}`, { content }, { headers: h });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
      load();
    } catch (e: any) { alert(e.response?.data?.message || "Erreur lors de l'enregistrement"); }
    finally { setSaving(false); }
  };

  const onUpload = async (file: File) => {
    const text = await file.text();
    setContent(text);
  };

  const remove = async (p: string) => {
    if (!window.confirm(`Supprimer l'aide de « ${p} » ?`)) return;
    try {
      await axios.delete(`/api/page-help/${encodeURIComponent(p)}`, { headers: h });
      if (p === path) newEntry();
      load();
    } catch (e: any) { alert(e.response?.data?.message || 'Erreur lors de la suppression'); }
  };

  const showPreview = async () => {
    if (!path.trim()) return;
    try {
      // Le backend renvoie le HTML rendu (Markdown → HTML) ; on enregistre d'abord pour le voir à jour.
      await axios.put(`/api/page-help/${encodeURIComponent(path.trim())}`, { content }, { headers: h });
      const r = await axios.get(`/api/page-help/${encodeURIComponent(path.trim())}`, { headers: h });
      setPreview(r.data?.content_html || '');
      load();
    } catch { setPreview('<em>Aperçu indisponible</em>'); }
  };

  const inputS: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
      {/* Liste des pages avec aide */}
      <div style={{ width: 280, flexShrink: 0, background: '#fff', border: '1px solid #e9eef5', borderRadius: 14, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontWeight: 800, color: '#0f172a', display: 'inline-flex', alignItems: 'center', gap: 6 }}><HelpCircle size={16} /> Pages</span>
          <button onClick={newEntry} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}><Plus size={13} /> Nouvelle</button>
        </div>
        {loading ? (
          <div style={{ color: '#94a3b8', fontSize: 13, padding: 10 }}>Chargement…</div>
        ) : entries.length === 0 ? (
          <div style={{ color: '#94a3b8', fontSize: 13, padding: 10 }}>Aucune aide définie. Créez-en une.</div>
        ) : entries.map(e => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', background: e.page_path === path ? '#eff6ff' : 'transparent', marginBottom: 2 }}
            onClick={() => selectEntry(e)}>
            <FileText size={14} color="#64748b" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: 13, color: '#334155', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.page_path}</span>
            <button onClick={ev => { ev.stopPropagation(); remove(e.page_path); }} title="Supprimer" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2 }}><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      {/* Éditeur */}
      <div style={{ flex: 1, background: '#fff', border: '1px solid #e9eef5', borderRadius: 14, padding: 18 }}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Chemin de la page</label>
          <input list="help-pages" style={inputS} value={path} onChange={e => setPath(e.target.value)} placeholder="Ex : /tickets" />
          <datalist id="help-pages">{COMMON_PAGES.map(p => <option key={p} value={p} />)}</datalist>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Le chemin tel qu'il apparaît dans l'URL (ex : <code>/tickets</code>, <code>/budget</code>). Une aide par page.</div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Contenu de l'aide (Markdown)</label>
            <button onClick={() => fileRef.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}><Upload size={13} /> Importer un .md</button>
            <input ref={fileRef} type="file" accept=".md,.markdown,.txt" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (f) onUpload(f); if (fileRef.current) fileRef.current.value = ''; }} />
          </div>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={16} spellCheck={false}
            placeholder={"# Aide de la page\n\nExpliquez ici à quoi sert la page et comment l'utiliser.\n\n- point 1\n- point 2"}
            style={{ ...inputS, fontFamily: 'Consolas, Menlo, monospace', fontSize: 13, lineHeight: 1.5, resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={save} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none', background: saving ? '#94a3b8' : '#2563eb', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Save size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button onClick={showPreview} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
            <Eye size={15} /> Aperçu
          </button>
          {saved && <span style={{ color: '#16a34a', fontWeight: 700, fontSize: 13 }}>✓ Enregistré</span>}
        </div>

        {preview !== null && (
          <div style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, background: '#f8fafc' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>Aperçu</div>
            <div style={{ fontSize: 14, color: '#1e293b', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default PageHelpAdmin;
