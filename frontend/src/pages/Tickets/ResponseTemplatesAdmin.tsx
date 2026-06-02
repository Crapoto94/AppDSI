import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import { Plus, Edit2, Trash2, X, Check, ChevronDown, ChevronRight, FileText, Paperclip } from 'lucide-react';

const VARIABLES = [
  { key: '{{prenom_demandeur}}', label: 'Prénom du demandeur' },
  { key: '{{nom_demandeur}}',    label: 'Nom du demandeur' },
  { key: '{{numero_ticket}}',    label: 'N° du ticket' },
  { key: '{{titre_ticket}}',     label: 'Titre du ticket' },
  { key: '{{categorie}}',        label: 'Catégorie' },
  { key: '{{sous_categorie}}',   label: 'Sous-catégorie' },
  { key: '{{technicien}}',       label: 'Technicien assigné' },
  { key: '{{date_creation}}',    label: 'Date de création' },
];

interface Template {
  id: number;
  name: string;
  description: string | null;
  message: string;
  category_id: number | null;
  subcategory_id: number | null;
  category_name: string | null;
  category_path: string | null;
  subcategory_name: string | null;
  created_by: string | null;
  created_at: string;
}
interface Category { id: number; name: string; full_path: string; parent_id: number | null; }
interface KbDoc { id: number; name: string; original_name: string; category_name: string | null; }

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

const PREVIEW: Record<string, string> = {
  '{{prenom_demandeur}}': 'Jean',
  '{{nom_demandeur}}': 'MARTIN',
  '{{numero_ticket}}': '12345',
  '{{titre_ticket}}': 'Problème impression',
  '{{sous_categorie}}': 'Sous-catégorie',
  '{{technicien}}': 'Pierre DUPONT',
};

export default function ResponseTemplatesAdmin() {
  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}` };

  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kbDocs, setKbDocs] = useState<KbDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['none']));
  const [showDocPicker, setShowDocPicker] = useState(false);

  const [form, setForm] = useState({ name: '', description: '', message: '', category_id: '', subcategory_id: '' });
  const [saving, setSaving] = useState(false);
  const quillRef = useRef<ReactQuill>(null);

  useEffect(() => {
    load();
    axios.get('/api/tickets/admin/categories', { headers }).then(r => setCategories(r.data || [])).catch(() => {});
    axios.get('/api/tickets/admin/knowledge-documents', { headers }).then(r => setKbDocs(r.data || [])).catch(() => {});
  }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await axios.get('/api/tickets/admin/response-templates', { headers });
      setTemplates(r.data || []);
    } finally { setLoading(false); }
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: '', description: '', message: '', category_id: '', subcategory_id: '' });
    setShowModal(true);
  }
  function openEdit(t: Template) {
    setEditing(t);
    setForm({
      name: t.name, description: t.description || '', message: t.message,
      category_id: t.category_id?.toString() || '', subcategory_id: t.subcategory_id?.toString() || '',
    });
    setShowModal(true);
  }

  const messageEmpty = !form.message || form.message.replace(/<[^>]*>/g, '').trim() === '';

  async function save() {
    if (!form.name.trim() || messageEmpty) return;
    setSaving(true);
    try {
      const body = {
        name: form.name.trim(), description: form.description.trim() || null, message: form.message,
        category_id: form.category_id ? parseInt(form.category_id) : null,
        subcategory_id: form.subcategory_id ? parseInt(form.subcategory_id) : null,
      };
      if (editing) await axios.put(`/api/tickets/admin/response-templates/${editing.id}`, body, { headers });
      else await axios.post('/api/tickets/admin/response-templates', body, { headers });
      setShowModal(false);
      load();
    } catch (e: unknown) {
      alert(axios.isAxiosError(e) ? (e.response?.data?.message || e.message) : 'Erreur');
    } finally { setSaving(false); }
  }

  async function del(t: Template) {
    if (!confirm(`Supprimer "${t.name}" ?`)) return;
    await axios.delete(`/api/tickets/admin/response-templates/${t.id}`, { headers });
    load();
  }

  // Insère du texte brut (variable) à la position du curseur dans l'éditeur
  function insertVariable(text: string) {
    const q = quillRef.current?.getEditor();
    if (!q) { setForm(p => ({ ...p, message: p.message + text })); return; }
    const range = q.getSelection(true);
    const index = range ? range.index : q.getLength();
    q.insertText(index, text, 'user');
    q.setSelection(index + text.length, 0);
  }

  // Insère un lien vers un document de la base de connaissance (HTML)
  async function insertDocument(doc: KbDoc) {
    try {
      const r = await axios.get(`/api/tickets/admin/knowledge-documents/${doc.id}/public-link`, { headers });
      const url = r.data.url;
      const q = quillRef.current?.getEditor();
      if (q) {
        const range = q.getSelection(true);
        const index = range ? range.index : q.getLength();
        // Insère un lien cliquable « 📄 Nom du document »
        q.insertText(index, `📄 ${doc.name}`, { link: url }, 'user');
        q.insertText(index + `📄 ${doc.name}`.length, ' ', 'user');
        q.setSelection(index + `📄 ${doc.name}`.length + 1, 0);
      }
      setShowDocPicker(false);
    } catch {
      alert('Impossible de générer le lien du document');
    }
  }

  function previewHtml(msg: string): string {
    let out = msg;
    for (const [k, v] of Object.entries(PREVIEW)) out = out.split(k).join(v);
    out = out.replace(/{{categorie}}/g, form.category_id ? (categories.find(c => c.id.toString() === form.category_id)?.name || 'Catégorie') : 'Catégorie');
    out = out.replace(/{{date_creation}}/g, new Date().toLocaleDateString('fr-FR'));
    return out.replace(/\n/g, '<br/>');
  }

  const rootCats = categories.filter(c => !c.parent_id);
  const subCats = categories.filter(c => c.parent_id?.toString() === form.category_id);
  const grouped: Record<string, Template[]> = {};
  for (const t of templates) {
    const key = t.category_id ? String(t.category_id) : 'none';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  }
  const toggleCat = (key: string) => setExpandedCats(prev => {
    const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: '#1e293b' }}>💬 Réponses auto</h2>
          <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0' }}>
            Templates de réponse réutilisables avec variables dynamiques et liens vers la base documentaire.
          </p>
        </div>
        <button onClick={openCreate} style={s.btn('primary')}>
          <Plus size={15} /> Nouveau template
        </button>
      </div>

      {/* Variables reference */}
      <div style={{ ...s.card, background: '#f8fafc' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>VARIABLES DISPONIBLES</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {VARIABLES.map(v => (
            <span key={v.key} title={v.label} style={{ fontFamily: 'monospace', fontSize: 12, background: '#e0e7ff', color: '#4338ca', padding: '2px 8px', borderRadius: 4 }}>
              {v.key}
            </span>
          ))}
        </div>
      </div>

      {/* Templates list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chargement...</div>
      ) : templates.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Aucun template</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {grouped['none']?.length > 0 && (
            <CatGroup label="Toutes catégories" icon="🌐" items={grouped['none']}
              expanded={expandedCats.has('none')} onToggle={() => toggleCat('none')} onEdit={openEdit} onDelete={del} />
          )}
          {rootCats.filter(c => grouped[String(c.id)]?.length > 0).map(cat => (
            <CatGroup key={cat.id} label={cat.name} icon="🏷️" items={grouped[String(cat.id)]}
              expanded={expandedCats.has(String(cat.id))} onToggle={() => toggleCat(String(cat.id))} onEdit={openEdit} onDelete={del} />
          ))}
        </div>
      )}

      {/* ─── MODALE ─── */}
      {showModal && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 20px' }}
        >
          <div style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 720, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 22px', borderBottom: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                {editing ? 'Modifier le template' : 'Nouveau template'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', display: 'flex' }}>
                <X size={20} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: 22, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={s.label}>Nom du template *</label>
                <input style={s.input} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex : Problème réseau Wi-Fi" autoFocus />
              </div>

              <div>
                <label style={s.label}>Catégorie</label>
                <select style={s.input} value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value, subcategory_id: '' }))}>
                  <option value="">— Toutes catégories —</option>
                  {rootCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label style={s.label}>Sous-catégorie</label>
                <select style={s.input} value={form.subcategory_id} onChange={e => setForm(p => ({ ...p, subcategory_id: e.target.value }))} disabled={!form.category_id}>
                  <option value="">— Toutes sous-catégories —</option>
                  {subCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label style={s.label}>Description (optionnelle)</label>
                <input style={s.input} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Contexte d'utilisation..." />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
                  <label style={{ ...s.label, marginBottom: 0 }}>Message *</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                    {VARIABLES.map(v => (
                      <button key={v.key} onClick={() => insertVariable(v.key)} title={v.label} style={{
                        fontSize: 11, padding: '2px 7px', borderRadius: 4, border: 'none',
                        background: '#e0e7ff', color: '#4338ca', cursor: 'pointer', fontFamily: 'monospace',
                      }}>{v.key}</button>
                    ))}
                    {/* Bouton insertion document */}
                    <div style={{ position: 'relative' }}>
                      <button onClick={() => setShowDocPicker(v => !v)} title="Insérer un lien vers un document"
                        style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: 'none', background: '#dcfce7', color: '#15803d', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Paperclip size={11} /> Document
                      </button>
                      {showDocPicker && (
                        <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 10, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.15)', minWidth: 260, maxHeight: 300, overflowY: 'auto' }}>
                          {kbDocs.length === 0 ? (
                            <div style={{ padding: 14, fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                              Aucun document.<br/>Ajoutez-en dans « Base documentaire ».
                            </div>
                          ) : kbDocs.map(d => (
                            <button key={d.id} onClick={() => insertDocument(d)} style={{
                              width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none',
                              borderBottom: '1px solid #f1f5f9', background: 'white', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#374151',
                            }}>
                              <FileText size={14} color="#6366f1" style={{ flexShrink: 0 }} />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {d.name}
                                {d.category_name && <span style={{ color: '#94a3b8', marginLeft: 4 }}>· {d.category_name}</span>}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  <ReactQuill
                    ref={quillRef}
                    theme="snow"
                    value={form.message}
                    onChange={(html) => setForm(p => ({ ...p, message: html }))}
                    placeholder="Bonjour {{prenom_demandeur}}, ..."
                    modules={{ toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link'], ['clean']] }}
                    style={{ fontSize: 13 }}
                  />
                </div>
                {form.message && form.message !== '<p><br></p>' && (
                  <div style={{ marginTop: 8, padding: 12, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 6 }}>APERÇU (exemple)</div>
                    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: previewHtml(form.message) }} />
                  </div>
                )}
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '16px 22px', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => setShowModal(false)} style={s.btn()}>Annuler</button>
              <button onClick={save} disabled={saving || !form.name.trim() || messageEmpty}
                style={{ ...s.btn('primary'), opacity: (!form.name.trim() || messageEmpty) ? 0.5 : 1 }}>
                <Check size={15} /> {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CatGroup({ label, icon, items, expanded, onToggle, onEdit, onDelete }: {
  label: string; icon: string; items: Template[]; expanded: boolean;
  onToggle: () => void; onEdit: (t: Template) => void; onDelete: (t: Template) => void;
}) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#f8fafc', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        {expanded ? <ChevronDown size={14} color="#94a3b8" /> : <ChevronRight size={14} color="#94a3b8" />}
        <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{icon} {label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#94a3b8', background: '#e2e8f0', borderRadius: 10, padding: '1px 8px' }}>{items.length}</span>
      </button>
      {expanded && (
        <div>
          {items.map((t, i) => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 16px', borderTop: '1px solid #f1f5f9', background: i % 2 === 0 ? 'white' : '#fafafa' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{t.name}</span>
                  {t.subcategory_name && <span style={{ fontSize: 11, background: '#e0e7ff', color: '#4338ca', padding: '1px 6px', borderRadius: 4 }}>{t.subcategory_name}</span>}
                </div>
                {t.description && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{t.description}</div>}
                <div style={{ fontSize: 12, color: '#475569', background: '#f8fafc', borderRadius: 6, padding: '6px 10px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', maxHeight: 60, overflow: 'hidden' }}>
                  {t.message.replace(/<[^>]*>/g, ' ').substring(0, 150)}{t.message.length > 150 ? '...' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button onClick={() => onEdit(t)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6366f1', padding: 4 }} title="Modifier"><Edit2 size={14} /></button>
                <button onClick={() => onDelete(t)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }} title="Supprimer"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
