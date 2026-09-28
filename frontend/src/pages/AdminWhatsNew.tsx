import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Save, Trash2, Eye, EyeOff } from 'lucide-react';

/**
 * Édition du « What's New ? » des versions (modale du Header) — réservée aux admins.
 * Chaque version correspond à une ligne de hub.changelog_versions :
 *  - version : numéro (ex. 1.3.0)
 *  - release_date : date d'affichage
 *  - release_notes_md : contenu HTML mis en avant (rendu tel quel)
 *  - changes : lignes de changements (une par ligne ; les lignes « ### Catégorie »
 *    sont rendues comme titres de catégorie par la modale du Header).
 */
interface ChangelogVersion {
  id: number;
  version: string;
  release_date: string | null;
  changes: any;
  release_notes_md: string | null;
}

const toLines = (changes: any): string => {
  if (Array.isArray(changes)) return changes.join('\n');
  if (typeof changes === 'string') {
    try { const p = JSON.parse(changes); return Array.isArray(p) ? p.join('\n') : changes; } catch { return changes; }
  }
  return '';
};

const AdminWhatsNew: React.FC = () => {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const [versions, setVersions] = useState<ChangelogVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ChangelogVersion | null>(null);
  const [form, setForm] = useState({ version: '', release_date: '', release_notes_md: '', changes: '' });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get('/api/admin/changelog', { headers });
      setVersions(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur de chargement');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [token]);

  const openEdit = (v: ChangelogVersion | null) => {
    setError('');
    setPreview(false);
    if (v) {
      setEditing(v);
      setForm({ version: v.version || '', release_date: v.release_date || '', release_notes_md: v.release_notes_md || '', changes: toLines(v.changes) });
    } else {
      setEditing({ id: 0, version: '', release_date: new Date().toLocaleDateString('fr-FR'), changes: [], release_notes_md: '' });
      setForm({ version: '', release_date: new Date().toLocaleDateString('fr-FR'), release_notes_md: '', changes: '' });
    }
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      if (editing && editing.id) {
        await axios.put(`/api/admin/changelog/${editing.id}`, form, { headers });
      } else {
        await axios.post('/api/admin/changelog', form, { headers });
      }
      setEditing(null);
      await load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur lors de l\'enregistrement');
    } finally { setSaving(false); }
  };

  const remove = async (v: ChangelogVersion) => {
    if (!window.confirm(`Supprimer la version ${v.version} du What's New ?`)) return;
    try {
      await axios.delete(`/api/admin/changelog/${v.id}`, { headers });
      await load();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur lors de la suppression');
    }
  };

  if (loading) return <div style={{ padding: 24, color: '#64748b' }}>Chargement…</div>;

  return (
    <div>
      {error && <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
          Contenu affiché dans la modale « What's New ? » du Header. Les lignes <code>### Catégorie</code> sont rendues comme titres.
        </p>
        <button onClick={() => openEdit(null)} style={btnPrimary}><Plus size={14} /> Nouvelle version</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {versions.map(v => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: '1px solid #e8edf3', borderRadius: 8, padding: '10px 14px' }}>
            <strong style={{ fontSize: 14, color: '#0f172a', minWidth: 70 }}>v{v.version}</strong>
            <span style={{ fontSize: 12, color: '#94a3b8', flex: 1 }}>{v.release_date || '—'}</span>
            <button onClick={() => openEdit(v)} style={btnGhost}>Modifier</button>
            <button onClick={() => remove(v)} style={{ ...btnGhost, color: '#b91c1c', borderColor: '#fecaca' }} title="Supprimer"><Trash2 size={13} /></button>
          </div>
        ))}
        {versions.length === 0 && <div style={{ color: '#94a3b8', padding: 16 }}>Aucune version.</div>}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 760, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
              {editing.id ? `Modifier la version ${editing.version}` : 'Nouvelle version'}
            </h3>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <label style={lbl}>Version<input value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} placeholder="1.3.0" style={inp} /></label>
              <label style={lbl}>Date<input value={form.release_date} onChange={e => setForm(f => ({ ...f, release_date: e.target.value }))} placeholder="23/09/2026" style={inp} /></label>
            </div>

            <label style={lbl}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                Notes de version (HTML mis en avant)
                <button type="button" onClick={() => setPreview(p => !p)} style={{ ...btnGhost, padding: '2px 8px' }}>{preview ? <><EyeOff size={12} /> Éditer</> : <><Eye size={12} /> Aperçu</>}</button>
              </span>
              {preview
                ? <div dangerouslySetInnerHTML={{ __html: form.release_notes_md || '<em style="color:#94a3b8">(vide)</em>' }} style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, minHeight: 80, background: '#f8fafc', fontSize: 13, color: '#334155' }} />
                : <textarea value={form.release_notes_md} onChange={e => setForm(f => ({ ...f, release_notes_md: e.target.value }))} rows={5}
                    placeholder="<p><strong>Version 1.3.0</strong> — …</p>" style={{ ...inp, fontFamily: 'ui-monospace, monospace', resize: 'vertical' }} />}
            </label>

            <label style={{ ...lbl, marginTop: 12 }}>
              Changements (une ligne par entrée ; « ### Catégorie » pour un titre)
              <textarea value={form.changes} onChange={e => setForm(f => ({ ...f, changes: e.target.value }))} rows={8}
                placeholder={'### Budget\n• Nouvelle colonne nature/fonction\n• Pastille FAC cliquable'}
                style={{ ...inp, fontFamily: 'ui-monospace, monospace', resize: 'vertical' }} />
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button onClick={() => setEditing(null)} style={btnGhost}>Annuler</button>
              <button onClick={save} disabled={saving || !form.version.trim()} style={{ ...btnPrimary, opacity: saving || !form.version.trim() ? 0.6 : 1 }}>
                <Save size={14} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const btnPrimary: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#a16207', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const btnGhost: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 12.5, cursor: 'pointer' };
const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.03em', flex: 1 };
const inp: React.CSSProperties = { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '9px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', fontWeight: 400, textTransform: 'none', letterSpacing: 0 };

export default AdminWhatsNew;
