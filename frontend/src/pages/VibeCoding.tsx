import React, { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, ExternalLink, Download, FileText, LayoutGrid, BookOpen } from 'lucide-react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import ApplicationsCatalog from '../components/vibecoding/ApplicationsCatalog';

interface ResourceLink {
  label: string;
  url: string;
}

const QUICK_LINKS: ResourceLink[] = [
  { label: 'OpenCode — documentation', url: 'https://opencode.ai/docs/' },
  { label: 'Groq — console & clés API', url: 'https://console.groq.com/' },
  { label: 'GitHub — prise en main (fr)', url: 'https://docs.github.com/fr/get-started/quickstart/hello-world' },
  { label: 'Docker — cours OpenClassrooms (fr)', url: 'https://openclassrooms.com/fr/courses/8431896-optimisez-votre-deploiement-en-creant-des-conteneurs-avec-docker' },
  { label: 'SQL — cours OpenClassrooms (fr)', url: 'https://openclassrooms.com/fr/courses/7818671-requetez-une-base-de-donnees-avec-sql' },
  { label: 'Méthode EBIOS Risk Manager (ANSSI)', url: 'https://cyber.gouv.fr/securisation/analyse-des-risques/methode-ebios-rm/' },
];

interface DocMeta {
  id: number;
  title: string;
  sort_order: number;
  created_by: string;
  created_at: string;
}

function tabButtonStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: '6px',
    padding: '10px 16px', background: 'none', border: 'none',
    borderBottom: active ? '2px solid #2563eb' : '2px solid transparent',
    color: active ? '#2563eb' : '#64748b',
    fontWeight: active ? 700 : 600, fontSize: '0.9rem', cursor: 'pointer',
    marginBottom: '-1px'
  };
}

const VibeCoding: React.FC = () => {
  const { token } = useAuth();
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [content, setContent] = useState<string>('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingContent, setLoadingContent] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<'documents' | 'applications'>('documents');

  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  useEffect(() => {
    fetchDocs();
  }, [token]);

  const fetchDocs = async (selectAfter?: number) => {
    setLoadingList(true);
    try {
      const res = await axios.get<DocMeta[]>('/api/vibecoding-docs', authHeaders);
      setDocs(res.data);
      const idToSelect = selectAfter ?? (res.data.length > 0 ? res.data[0].id : null);
      if (idToSelect) {
        setSelectedId(idToSelect);
        fetchContent(idToSelect);
      } else {
        setSelectedId(null);
        setContent('');
      }
    } catch (error) {
      console.error('Error fetching vibecoding docs list:', error);
    } finally {
      setLoadingList(false);
    }
  };

  const fetchContent = async (id: number) => {
    setLoadingContent(true);
    try {
      const res = await axios.get(`/api/vibecoding-docs/${id}`, authHeaders);
      setContent(res.data.content || '');
    } catch (error) {
      console.error('Error fetching vibecoding doc content:', error);
      setContent('');
    } finally {
      setLoadingContent(false);
    }
  };

  const handleSelect = (id: number) => {
    setSelectedId(id);
    fetchContent(id);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setUploadFile(file);
    if (file && !uploadTitle) {
      setUploadTitle(file.name.replace(/\.md$/i, ''));
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      alert('Choisissez un fichier .md');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      if (uploadTitle) formData.append('title', uploadTitle);

      const res = await axios.post('/api/vibecoding-docs', formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });

      setShowUpload(false);
      setUploadTitle('');
      setUploadFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchDocs(res.data.id);
    } catch (error) {
      console.error('Error uploading vibecoding doc:', error);
      alert('Erreur lors de l\'envoi du document');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`Supprimer le document "${title}" ?`)) return;
    try {
      await axios.delete(`/api/vibecoding-docs/${id}`, authHeaders);
      const remaining = docs.filter(d => d.id !== id);
      if (selectedId === id) {
        await fetchDocs(remaining.length > 0 ? remaining[0].id : undefined);
      } else {
        setDocs(remaining);
      }
    } catch (error) {
      console.error('Error deleting vibecoding doc:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const handleDownload = () => {
    const doc = docs.find(d => d.id === selectedId);
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc?.title || 'document'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectedDoc = docs.find(d => d.id === selectedId);

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      <Header />
      <main style={{ padding: '60px 20px' }}>
        <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: '900', color: '#0f172a', margin: 0, marginBottom: '8px' }}>
              VibeCoding
            </h1>
            <p style={{ color: '#64748b', fontSize: '1rem', margin: 0 }}>
              Ressources et documents de la formation au développement assisté par IA (OpenCode)
            </p>
          </div>

          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a', margin: 0, marginBottom: '14px' }}>
              Ressources rapides
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              {QUICK_LINKS.map(link => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    background: '#f1f5f9',
                    color: '#0c4a6e',
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                    fontWeight: '600'
                  }}
                >
                  {link.label}
                  <ExternalLink size={13} />
                </a>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid #e2e8f0' }}>
            <button
              onClick={() => setActiveTab('documents')}
              style={tabButtonStyle(activeTab === 'documents')}
            >
              <BookOpen size={16} />
              Documents
            </button>
            <button
              onClick={() => setActiveTab('applications')}
              style={tabButtonStyle(activeTab === 'applications')}
            >
              <LayoutGrid size={16} />
              Catalogue des applications
            </button>
          </div>

          {activeTab === 'applications' && <ApplicationsCatalog />}

          {activeTab === 'documents' && (
          <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '20px', alignItems: 'start' }}>
            {/* Sidebar : liste des documents */}
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0f172a', margin: 0 }}>Documents</h2>
                <button
                  onClick={() => setShowUpload(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '6px 10px', background: '#2563eb', color: 'white',
                    border: 'none', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '0.8rem', fontWeight: '600'
                  }}
                >
                  <Upload size={14} />
                  Ajouter
                </button>
              </div>

              {showUpload && (
                <div style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px',
                  padding: '12px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '8px'
                }}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md"
                    onChange={handleFileChange}
                    style={{ fontSize: '0.8rem' }}
                  />
                  <input
                    type="text"
                    placeholder="Titre du menu (optionnel)"
                    value={uploadTitle}
                    onChange={e => setUploadTitle(e.target.value)}
                    style={{
                      padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: '6px',
                      fontSize: '0.85rem', boxSizing: 'border-box'
                    }}
                  />
                  <button
                    onClick={handleUpload}
                    disabled={uploading || !uploadFile}
                    style={{
                      padding: '8px', background: uploading || !uploadFile ? '#cbd5e1' : '#16a34a',
                      color: 'white', border: 'none', borderRadius: '6px',
                      cursor: uploading || !uploadFile ? 'not-allowed' : 'pointer',
                      fontSize: '0.85rem', fontWeight: '600'
                    }}
                  >
                    {uploading ? 'Envoi...' : 'Envoyer le .md'}
                  </button>
                </div>
              )}

              {loadingList ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '10px 0' }}>Chargement...</div>
              ) : docs.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '10px 0' }}>
                  Aucun document pour l'instant. Ajoutez le premier avec le bouton "Ajouter".
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {docs.map(doc => (
                    <div
                      key={doc.id}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
                        background: doc.id === selectedId ? '#dbeafe' : 'transparent',
                        color: doc.id === selectedId ? '#1e40af' : '#334155'
                      }}
                    >
                      <div
                        onClick={() => handleSelect(doc.id)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, fontSize: '0.85rem', fontWeight: doc.id === selectedId ? 700 : 500 }}
                      >
                        <FileText size={14} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.title}</span>
                      </div>
                      <button
                        onClick={() => handleDelete(doc.id, doc.title)}
                        title="Supprimer ce document"
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#94a3b8', padding: '4px', flexShrink: 0
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contenu du document sélectionné */}
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '32px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              minHeight: '300px'
            }}>
              {selectedDoc && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
                  <button
                    onClick={handleDownload}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '8px 14px', background: '#f1f5f9', color: '#0c4a6e',
                      border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer',
                      fontSize: '0.85rem', fontWeight: '600'
                    }}
                  >
                    <Download size={14} />
                    Télécharger (.md)
                  </button>
                </div>
              )}
              {loadingContent ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>Chargement du document...</div>
              ) : !selectedDoc ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '40px' }}>
                  Sélectionnez un document dans la liste, ou ajoutez-en un nouveau.
                </div>
              ) : (
                <div className="vibecoding-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </div>
              )}
            </div>
          </div>
          )}
        </div>
      </main>

      <style>{`
        .vibecoding-md { color: #334155; line-height: 1.7; overflow-wrap: break-word; }
        .vibecoding-md h1 { font-size: 1.8rem; font-weight: 800; color: #0f172a; margin: 0 0 16px; }
        .vibecoding-md h2 { font-size: 1.4rem; font-weight: 800; color: #0f172a; margin: 32px 0 14px; padding-top: 16px; border-top: 1px solid #f1f5f9; }
        .vibecoding-md h3 { font-size: 1.15rem; font-weight: 700; color: #0f172a; margin: 22px 0 10px; }
        .vibecoding-md p { margin: 0.6em 0; }
        .vibecoding-md ul, .vibecoding-md ol { padding-left: 1.6em; margin: 0.6em 0; }
        .vibecoding-md li { margin-bottom: 0.3em; }
        .vibecoding-md a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
        .vibecoding-md a:hover { color: #1d4ed8; }
        .vibecoding-md code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
        .vibecoding-md pre { background: #0f172a; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; }
        .vibecoding-md pre code { background: none; padding: 0; color: inherit; }
        .vibecoding-md blockquote { border-left: 3px solid #cbd5e1; margin: 0.8em 0; padding: 4px 16px; color: #64748b; background: #f8fafc; border-radius: 0 6px 6px 0; }
        .vibecoding-md table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 0.9rem; }
        .vibecoding-md th, .vibecoding-md td { border: 1px solid #e2e8f0; padding: 8px 12px; text-align: left; }
        .vibecoding-md th { background: #f8fafc; font-weight: 700; }
        .vibecoding-md hr { border: none; border-top: 1px solid #e2e8f0; margin: 28px 0; }
      `}</style>
    </div>
  );
};

export default VibeCoding;
