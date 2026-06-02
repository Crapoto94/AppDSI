import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  Plus, Trash2, Edit2, X, Check, Upload, FileText, Download,
  ChevronDown, ChevronRight, File, FileImage, FileSpreadsheet,
} from 'lucide-react';

interface Doc {
  id: number;
  name: string;
  description: string | null;
  category_id: number | null;
  category_name: string | null;
  app_id: number | null;
  app_name: string | null;
  original_name: string;
  mimetype: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}
interface Category { id: number; name: string; full_path: string; parent_id: number | null; }
interface App { id: number; name: string; }

const s = {
  card: { background: 'white', borderRadius: 10, border: '1px solid #e2e8f0', padding: 16 } as React.CSSProperties,
  btn: (v: 'primary'|'ghost'|'danger' = 'ghost'): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
    borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    background: v === 'primary' ? '#6366f1' : v === 'danger' ? '#ef4444' : '#f1f5f9',
    color: v === 'ghost' ? '#374151' : 'white',
  }),
  input: { width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box' } as React.CSSProperties,
  label: { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 } as React.CSSProperties,
};

function fileIcon(mime: string | null, name: string) {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (mime?.startsWith('image/') || ['png','jpg','jpeg','gif','webp'].includes(ext)) return <FileImage size={18} color="#8b5cf6" />;
  if (['xls','xlsx','csv'].includes(ext)) return <FileSpreadsheet size={18} color="#22c55e" />;
  if (ext === 'pdf') return <FileText size={18} color="#ef4444" />;
  if (['doc','docx'].includes(ext)) return <FileText size={18} color="#3b82f6" />;
  return <File size={18} color="#94a3b8" />;
}

function fmtSize(bytes: number | null) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
}

export default function KnowledgeBaseAdmin() {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [docs, setDocs] = useState<Doc[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Doc | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['none']));
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ name: '', description: '', category_id: '', app_id: '' });
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    load();
    axios.get('/api/tickets/admin/categories', { headers })
      .then(r => setCategories(r.data || []))
      .catch(() => {});
    axios.get('/api/magapp/apps', { headers })
      .then(r => setApps((r.data || []).filter((a: any) => a.present_magapp === 'oui' || a.is_active).map((a: any) => ({ id: a.id, name: a.name }))))
      .catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await axios.get('/api/tickets/admin/knowledge-documents', { headers });
      setDocs(r.data || []);
    } finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', description: '', category_id: '', app_id: '' });
    setFile(null);
    setShowForm(true);
  }
  function openEdit(d: Doc) {
    setEditing(d);
    setForm({ name: d.name, description: d.description || '', category_id: d.category_id?.toString() || '', app_id: d.app_id?.toString() || '' });
    setFile(null);
    setShowForm(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    if (!editing && !file) { alert('Veuillez sélectionner un fichier'); return; }
    setSaving(true);
    try {
      if (editing) {
        // métadonnées seulement
        await axios.put(`/api/tickets/admin/knowledge-documents/${editing.id}`, {
          name: form.name.trim(),
          description: form.description.trim() || null,
          category_id: form.category_id ? parseInt(form.category_id) : null,
          app_id: form.app_id ? parseInt(form.app_id) : null,
        }, { headers });
      } else {
        const fd = new FormData();
        fd.append('file', file!);
        fd.append('name', form.name.trim());
        fd.append('description', form.description.trim());
        if (form.category_id) fd.append('category_id', form.category_id);
        if (form.app_id) fd.append('app_id', form.app_id);
        await axios.post('/api/tickets/admin/knowledge-documents', fd, {
          headers: { ...headers, 'Content-Type': 'multipart/form-data' },
        });
      }
      setShowForm(false);
      load();
    } catch (e: unknown) {
      const msg = axios.isAxiosError(e) ? (e.response?.data?.message || e.message) : 'Erreur';
      alert(msg);
    } finally { setSaving(false); }
  }

  async function del(d: Doc) {
    if (!confirm(`Supprimer le document "${d.name}" ?`)) return;
    await axios.delete(`/api/tickets/admin/knowledge-documents/${d.id}`, { headers });
    load();
  }

  function download(d: Doc, mode: 'inline' | 'attachment') {
    // Le download utilise le header Authorization → on passe par fetch + blob
    fetch(`/api/tickets/admin/knowledge-documents/${d.id}/download?mode=${mode}`, { headers })
      .then(r => r.blob())
      .then(blob => {
        const u = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = u;
        if (mode === 'attachment') a.download = d.original_name;
        else window.open(u, '_blank');
        if (mode === 'attachment') { a.click(); }
        setTimeout(() => URL.revokeObjectURL(u), 10000);
      })
      .catch(() => alert('Erreur de téléchargement'));
  }

  function onFilePick(f: File | null) {
    setFile(f);
    if (f && !form.name.trim()) {
      setForm(p => ({ ...p, name: f.name.replace(/\.[^.]+$/, '') }));
    }
  }

  const rootCats = categories.filter(c => !c.parent_id);
  const allCats = categories; // catégories peuvent être sous-catégories aussi
  const grouped: Record<string, Doc[]> = {};
  for (const d of docs) {
    const key = d.category_id ? String(d.category_id) : 'none';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(d);
  }
  const usedCatIds = Object.keys(grouped).filter(k => k !== 'none');

  const toggle = (k: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#1e293b' }}>📚 Base documentaire</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Procédures, guides et documents techniques. Stockés dans le dépôt configuré (Admin → GED).
            Une catégorie de ticket peut être associée pour faciliter le classement.
          </p>
        </div>
        <button onClick={openCreate} style={s.btn('primary')}>
          <Plus size={15} /> Ajouter un document
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ ...s.card, border: '2px solid #6366f1' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
              {editing ? 'Modifier le document' : 'Nouveau document'}
            </h3>
            <button onClick={() => setShowForm(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* File picker (upload only) */}
            {!editing && (
              <div style={{ gridColumn: '1/-1' }}>
                <label style={s.label}>Fichier *</label>
                <input ref={fileRef} type="file" hidden onChange={e => onFilePick(e.target.files?.[0] || null)} />
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: '2px dashed #c7d2fe', borderRadius: 10, padding: '20px',
                    textAlign: 'center', cursor: 'pointer', background: '#f8faff',
                  }}
                >
                  {file ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      {fileIcon(file.type, file.name)}
                      <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}>{file.name}</span>
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>({fmtSize(file.size)})</span>
                    </div>
                  ) : (
                    <div style={{ color: '#6366f1' }}>
                      <Upload size={22} style={{ marginBottom: 4 }} />
                      <div style={{ fontSize: 13, fontWeight: 500 }}>Cliquer pour choisir un fichier</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>PDF, Word, Excel, image… (max 50 Mo)</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ gridColumn: '1/-1' }}>
              <label style={s.label}>Nom du document *</label>
              <input style={s.input} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex : Procédure réinitialisation mot de passe" />
            </div>

            <div>
              <label style={s.label}>Catégorie ticket (optionnelle)</label>
              <select style={s.input} value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}>
                <option value="">— Aucune —</option>
                {rootCats.map(c => (
                  <optgroup key={c.id} label={c.name}>
                    <option value={c.id}>{c.name} (général)</option>
                    {allCats.filter(sc => sc.parent_id === c.id).map(sc => (
                      <option key={sc.id} value={sc.id}>&nbsp;&nbsp;{sc.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label style={s.label}>Logiciel métier (optionnel)</label>
              <select style={s.input} value={form.app_id} onChange={e => setForm(p => ({ ...p, app_id: e.target.value }))}>
                <option value="">— Aucun —</option>
                {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <div style={{ gridColumn: '1/-1' }}>
              <label style={s.label}>Description (optionnelle)</label>
              <input style={s.input} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="À quoi sert ce document ?" />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button onClick={() => setShowForm(false)} style={s.btn()}>Annuler</button>
            <button onClick={save} disabled={saving || !form.name.trim() || (!editing && !file)}
              style={{ ...s.btn('primary'), opacity: (!form.name.trim() || (!editing && !file)) ? 0.5 : 1 }}>
              <Check size={15} /> {saving ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Téléverser'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chargement...</div>
      ) : docs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aucun document</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Ajoutez votre premier document à la base</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {grouped['none']?.length > 0 && (
            <DocGroup label="Sans catégorie" icon="📄" items={grouped['none']}
              expanded={expanded.has('none')} onToggle={() => toggle('none')}
              onEdit={openEdit} onDelete={del} onDownload={download} />
          )}
          {allCats.filter(c => usedCatIds.includes(String(c.id))).map(cat => (
            <DocGroup key={cat.id} label={cat.full_path || cat.name} icon="🏷️" items={grouped[String(cat.id)]}
              expanded={expanded.has(String(cat.id))} onToggle={() => toggle(String(cat.id))}
              onEdit={openEdit} onDelete={del} onDownload={download} />
          ))}
        </div>
      )}
    </div>
  );
}

function DocGroup({ label, icon, items, expanded, onToggle, onEdit, onDelete, onDownload }: {
  label: string; icon: string; items: Doc[]; expanded: boolean;
  onToggle: () => void; onEdit: (d: Doc) => void; onDelete: (d: Doc) => void;
  onDownload: (d: Doc, mode: 'inline' | 'attachment') => void;
}) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        background: '#f8fafc', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        {expanded ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{icon} {label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', background: '#e2e8f0', borderRadius: 10, padding: '1px 8px' }}>
          {items.length}
        </span>
      </button>
      {expanded && (
        <div>
          {items.map((d, i) => (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa',
            }}>
              {fileIcon(d.mimetype, d.original_name)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {d.name}
                  {d.app_name && <span style={{ fontSize: 11, background: '#dcfce7', color: '#15803d', padding: '1px 6px', borderRadius: 4, fontWeight: 500 }}>💾 {d.app_name}</span>}
                </div>
                {d.description && <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{d.description}</div>}
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                  {d.original_name} · {fmtSize(d.size_bytes)}
                  {d.uploaded_by && ` · ${d.uploaded_by}`}
                  {d.created_at && ` · ${new Date(d.created_at).toLocaleDateString('fr-FR')}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => onDownload(d, 'inline')} title="Ouvrir" style={iconBtn('#0ea5e9')}>
                  <FileText size={14} />
                </button>
                <button onClick={() => onDownload(d, 'attachment')} title="Télécharger" style={iconBtn('#22c55e')}>
                  <Download size={14} />
                </button>
                <button onClick={() => onEdit(d)} title="Modifier" style={iconBtn('#6366f1')}>
                  <Edit2 size={14} />
                </button>
                <button onClick={() => onDelete(d)} title="Supprimer" style={iconBtn('#ef4444')}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const iconBtn = (color: string): React.CSSProperties => ({
  border: 'none', background: 'none', cursor: 'pointer', color, padding: 4,
  display: 'flex', alignItems: 'center',
});
