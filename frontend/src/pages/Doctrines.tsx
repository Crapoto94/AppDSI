import React, { useState, useEffect, useMemo } from 'react';
import { MessageSquarePlus, Trash2, X, Search, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface SectionMeta {
  key: string;
  title: string;
}

interface Doctrine {
  markdown: string;
  sections: SectionMeta[];
  updated_at?: string;
}

interface Comment {
  id: number;
  section_key: string;
  section_title: string | null;
  content: string;
  created_by: string;
  created_at: string;
}

interface ParsedSection {
  key: string;
  title: string;
  body: string;
}

const DOC_KEY = 'document';

const mdComponents: Components = {
  a({ node, ...props }) {
    void node;
    return <a {...props} target="_blank" rel="noopener noreferrer" />;
  },
};

const slugify = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'section';

const parseDocument = (markdown: string, sections: SectionMeta[]) => {
  const lines = markdown.split(/\r?\n/);
  const intro: string[] = [];
  const raw: { title: string; body: string[] }[] = [];
  let current: { title: string; body: string[] } | null = null;

  for (const line of lines) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      current = { title: m[1].trim(), body: [] };
      raw.push(current);
    } else if (current) {
      current.body.push(line);
    } else {
      intro.push(line);
    }
  }

  const seen: Record<string, number> = {};
  const parsed: ParsedSection[] = raw.map((s, i) => {
    let key = sections[i]?.key;
    if (!key) {
      const base = slugify(s.title);
      seen[base] = (seen[base] ?? -1) + 1;
      key = seen[base] === 0 ? base : `${base}-${seen[base]}`;
    }
    return { key, title: sections[i]?.title || s.title, body: s.body.join('\n').trim() };
  });

  return { intro: intro.join('\n').trim(), sections: parsed };
};

const Doctrines: React.FC = () => {
  const { token, user } = useAuth();
  const [doc, setDoc] = useState<Doctrine | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [openForm, setOpenForm] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [docRes, comRes] = await Promise.all([
        axios.get('/api/doctrines/markdown', { headers: authHeaders }),
        axios.get('/api/doctrines/comments', { headers: authHeaders }),
      ]);
      setDoc(docRes.data);
      setComments(comRes.data);
    } catch (err) {
      console.error('Error fetching doctrine:', err);
      setError('Impossible de charger le document de doctrine.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const parsed = useMemo(
    () => (doc ? parseDocument(doc.markdown, doc.sections || []) : { intro: '', sections: [] }),
    [doc]
  );

  const commentsBySection = useMemo(() => {
    const map: Record<string, Comment[]> = {};
    for (const c of comments) {
      const key = c.section_key || DOC_KEY;
      (map[key] = map[key] || []).push(c);
    }
    return map;
  }, [comments]);

  const canDelete = (c: Comment) =>
    user?.username === c.created_by || ['admin', 'superadmin'].includes(user?.role || '');

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return parsed.sections;
    return parsed.sections.filter(
      (s) => s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q)
    );
  }, [parsed.sections, searchQuery]);

  const handleSubmit = async (sectionKey: string, sectionTitle: string | null) => {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      const res = await axios.post(
        '/api/doctrines/comments',
        { section_key: sectionKey, section_title: sectionTitle, content: draft },
        { headers: authHeaders }
      );
      setComments((prev) => [...prev, res.data]);
      setDraft('');
      setOpenForm(null);
    } catch (err) {
      console.error('Error saving comment:', err);
      alert("Erreur lors de l'enregistrement du commentaire");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Supprimer ce commentaire ?')) return;
    try {
      await axios.delete(`/api/doctrines/comments/${id}`, { headers: authHeaders });
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error('Error deleting comment:', err);
      alert('Erreur lors de la suppression');
    }
  };

  const renderComments = (sectionKey: string, sectionTitle: string | null) => (
    <div style={{ marginTop: '12px', borderTop: '1px dashed #e2e8f0', paddingTop: '12px' }}>
      {(commentsBySection[sectionKey] || []).map((c) => (
        <div
          key={c.id}
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '8px',
            padding: '10px 12px',
            marginBottom: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.78rem', color: '#92400e', fontWeight: 600 }}>
              {c.created_by} · {new Date(c.created_at).toLocaleString('fr-FR')}
            </span>
            {canDelete(c) && (
              <button
                onClick={() => handleDelete(c.id)}
                title="Supprimer"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b45309', padding: 0 }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
          <div style={{ color: '#78350f', fontSize: '0.9rem', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>
            {c.content}
          </div>
        </div>
      ))}

      {openForm === sectionKey ? (
        <div>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`Votre commentaire sur « ${sectionTitle || 'ce document'} »…`}
            rows={3}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              fontSize: '0.95rem',
              fontFamily: 'inherit',
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button
              onClick={() => {
                setOpenForm(null);
                setDraft('');
              }}
              style={{
                padding: '7px 14px',
                background: 'white',
                color: '#64748b',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              Annuler
            </button>
            <button
              onClick={() => handleSubmit(sectionKey, sectionTitle)}
              disabled={saving || !draft.trim()}
              style={{
                padding: '7px 14px',
                background: saving || !draft.trim() ? '#93c5fd' : '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: saving || !draft.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 600,
              }}
            >
              {saving ? 'Envoi…' : 'Publier le commentaire'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setOpenForm(sectionKey);
            setDraft('');
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            background: '#f1f5f9',
            color: '#0c4a6e',
            border: '1px solid #cbd5e1',
            borderRadius: '999px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600,
          }}
        >
          <MessageSquarePlus size={15} />
          Commenter cette section
        </button>
      )}
    </div>
  );

  const countFor = (key: string) => (commentsBySection[key] || []).length;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      <Header />
      <main style={{ padding: '60px 20px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: '2rem', fontWeight: 900, color: '#0f172a', margin: 0, marginBottom: '8px' }}>
                Notes de service et doctrines
              </h1>
              <p style={{ color: '#64748b', fontSize: '1rem', margin: 0 }}>
                Document de doctrine DSI — <code>docs/DOCTRINE-DSI.md</code>
                {doc?.updated_at && (
                  <> · mis à jour le {new Date(doc.updated_at).toLocaleDateString('fr-FR')}</>
                )}
              </p>
            </div>
            <button
              onClick={fetchAll}
              style={{
                padding: '8px 14px',
                background: 'white',
                color: '#334155',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <RefreshCw size={16} />
              Rafraîchir
            </button>
          </div>

          <div
            style={{
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
              borderRadius: '10px',
              padding: '12px 16px',
              color: '#1e40af',
              fontSize: '0.9rem',
              marginBottom: '20px',
            }}
          >
            Chaque section peut recevoir des commentaires. Cliquez sur <strong>« Commenter cette section »</strong> pour
            signaler un point à analyser ultérieurement : l'emplacement de la remarque est conservé.
          </div>

          <div
            style={{
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 16px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              backgroundColor: 'white',
            }}
          >
            <Search size={18} color="#94a3b8" />
            <input
              type="text"
              placeholder="Rechercher dans le document…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: '1rem', fontFamily: 'inherit' }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: '4px' }}
              >
                <X size={18} />
              </button>
            )}
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>Chargement…</div>
          ) : error ? (
            <div
              style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '12px',
                padding: '24px',
                color: '#991b1b',
              }}
            >
              {error}
            </div>
          ) : doc ? (
            <div style={{ display: 'grid', gap: '16px' }}>
              {parsed.intro && (
                <div
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    color: '#475569',
                  }}
                  className="doctrine-content"
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={mdComponents}>
                    {parsed.intro}
                  </ReactMarkdown>
                </div>
              )}

              {filteredSections.map((section) => (
                <div
                  key={section.key}
                  id={`doctrine-${section.key}`}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    borderLeft: countFor(section.key) > 0 ? '4px solid #f59e0b' : '4px solid #2563eb',
                    overflow: 'hidden',
                    minWidth: 0,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                      {section.title}
                    </h2>
                    {countFor(section.key) > 0 && (
                      <span
                        style={{
                          flexShrink: 0,
                          background: '#fef3c7',
                          color: '#92400e',
                          borderRadius: '999px',
                          padding: '3px 10px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                        }}
                      >
                        {countFor(section.key)} commentaire{countFor(section.key) > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <div className="doctrine-content" style={{ color: '#475569', fontSize: '0.95rem', lineHeight: 1.6, minWidth: 0 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={mdComponents}>
                      {section.body}
                    </ReactMarkdown>
                  </div>

                  {renderComments(section.key, section.title)}
                </div>
              ))}

              {filteredSections.length === 0 && (
                <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  Aucune section ne correspond à votre recherche.
                </div>
              )}

              <div
                style={{
                  background: 'white',
                  borderRadius: '12px',
                  padding: '20px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  borderLeft: '4px solid #64748b',
                }}
              >
                <h2 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0, marginBottom: '4px' }}>
                  Commentaires généraux (hors section)
                </h2>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 8px' }}>
                  Remarques transverses au document.
                </p>
                {renderComments(DOC_KEY, 'Document (général)')}
              </div>
            </div>
          ) : null}
        </div>
      </main>

      <style>{`
        .doctrine-content { white-space: normal; overflow-wrap: break-word; word-break: normal; }
        .doctrine-content p,
        .doctrine-content span,
        .doctrine-content strong,
        .doctrine-content em,
        .doctrine-content li,
        .doctrine-content a { white-space: normal; overflow-wrap: break-word; word-break: normal; }
        .doctrine-content ul,
        .doctrine-content ol { padding-left: 1.6em; margin: 0.4em 0; }
        .doctrine-content ul { list-style-type: disc; }
        .doctrine-content ol { list-style-type: decimal; }
        .doctrine-content li { margin-bottom: 0.35em; }
        .doctrine-content h2, .doctrine-content h3 { margin: 0.6em 0 0.3em; }
        .doctrine-content blockquote {
          margin: 0.4em 0;
          padding: 4px 12px;
          border-left: 3px solid #cbd5e1;
          color: #64748b;
          background: #f8fafc;
        }
        .doctrine-content a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
        .doctrine-content a:hover { color: #1d4ed8; }
        .doctrine-content p { margin: 0.3em 0; }
        .doctrine-content p:first-child { margin-top: 0; }
        .doctrine-content p:last-child { margin-bottom: 0; }
        .doctrine-content code {
          background: #f1f5f9;
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 0.85em;
        }
      `}</style>
    </div>
  );
};

export default Doctrines;
