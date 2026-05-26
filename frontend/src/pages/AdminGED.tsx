import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import {
  Folder, FolderOpen, File, FileText, FileImage, FileVideo, FileArchive,
  Upload, Download, Trash2, Plus, ChevronRight, Home, Settings,
  CheckCircle, XCircle, Loader, RefreshCw, Eye, EyeOff, FolderPlus,
  HardDrive, AlertTriangle, Info
} from 'lucide-react';

interface AlfrescoNode {
  id: string;
  name: string;
  isFolder: boolean;
  nodeType: string;
  modifiedAt: string;
  modifiedByUser?: { displayName: string };
  content?: { sizeInBytes: number; mimeType: string };
}

interface BreadcrumbItem {
  id: string;
  name: string;
}

type ConnectionStatus = 'unknown' | 'ok' | 'error' | 'testing';

const ROOT_NODE = '-root-';

function formatSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fileIcon(node: AlfrescoNode) {
  if (node.isFolder) return <Folder size={18} style={{ color: '#f59e0b', flexShrink: 0 }} />;
  const mime = node.content?.mimeType || '';
  if (mime.startsWith('image/')) return <FileImage size={18} style={{ color: '#8b5cf6', flexShrink: 0 }} />;
  if (mime.startsWith('video/')) return <FileVideo size={18} style={{ color: '#ec4899', flexShrink: 0 }} />;
  if (mime === 'application/pdf') return <FileText size={18} style={{ color: '#ef4444', flexShrink: 0 }} />;
  if (mime.includes('zip') || mime.includes('tar') || mime.includes('gz') || mime.includes('rar')) return <FileArchive size={18} style={{ color: '#6b7280', flexShrink: 0 }} />;
  return <File size={18} style={{ color: '#3b82f6', flexShrink: 0 }} />;
}

const AdminGED: React.FC = () => {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [tab, setTab] = useState<'config' | 'explorer'>('config');

  // Config state
  const [cfgUrl, setCfgUrl] = useState('');
  const [cfgUser, setCfgUser] = useState('');
  const [cfgPass, setCfgPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('unknown');
  const [connectionMsg, setConnectionMsg] = useState('');

  // Explorer state
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbItem[]>([{ id: ROOT_NODE, name: 'Company Home' }]);
  const [nodes, setNodes] = useState<AlfrescoNode[]>([]);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentNodeId = breadcrumb[breadcrumb.length - 1].id;

  useEffect(() => {
    axios.get('/api/ged/config', { headers }).then(r => {
      setCfgUrl(r.data.url || '');
      setCfgUser(r.data.username || '');
      if (r.data.hasPassword) setCfgPass('••••••••');
    }).finally(() => setConfigLoading(false));
  }, []);

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigSaving(true);
    try {
      const payload: Record<string, string> = { url: cfgUrl, username: cfgUser };
      if (cfgPass && cfgPass !== '••••••••') payload.password = cfgPass;
      await axios.post('/api/ged/config', payload, { headers });
      setConnectionStatus('unknown');
      setConnectionMsg('');
    } catch {
      alert('Erreur lors de la sauvegarde');
    } finally {
      setConfigSaving(false);
    }
  };

  const testConnection = async () => {
    setConnectionStatus('testing');
    setConnectionMsg('');
    try {
      const r = await axios.post('/api/ged/test-connection', {}, { headers });
      if (r.data.success) {
        setConnectionStatus('ok');
        setConnectionMsg(`Connecté — nœud racine : "${r.data.rootName}"`);
      } else {
        setConnectionStatus('error');
        setConnectionMsg(r.data.error || 'Erreur inconnue');
      }
    } catch {
      setConnectionStatus('error');
      setConnectionMsg('Erreur réseau lors du test');
    }
  };

  const loadFolder = useCallback(async (nodeId: string) => {
    setExplorerLoading(true);
    setExplorerError('');
    setNodes([]);
    try {
      const r = await axios.get(`/api/ged/nodes/${nodeId}/children`, { headers });
      setNodes(r.data?.list?.entries?.map((e: { entry: AlfrescoNode }) => e.entry) || []);
    } catch (err) {
      const msg = axios.isAxiosError(err) ? (err.response?.data?.error || err.message) : 'Erreur inconnue';
      setExplorerError(typeof msg === 'string' ? msg : 'Erreur de connexion à Alfresco');
    } finally {
      setExplorerLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (tab === 'explorer') loadFolder(currentNodeId);
  }, [tab, currentNodeId]);

  const navigateTo = (node: AlfrescoNode) => {
    if (!node.isFolder) return;
    setBreadcrumb(prev => [...prev, { id: node.id, name: node.name }]);
  };

  const navigateToBreadcrumb = (idx: number) => {
    setBreadcrumb(prev => prev.slice(0, idx + 1));
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await axios.post(`/api/ged/nodes/${currentNodeId}/folder`, { name: newFolderName.trim() }, { headers });
      setNewFolderName('');
      setShowNewFolder(false);
      loadFolder(currentNodeId);
    } catch (err) {
      const msg = axios.isAxiosError(err) ? err.response?.data?.error : 'Erreur';
      alert(`Impossible de créer le dossier : ${msg}`);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let successCount = 0;
    for (const file of Array.from(files)) {
      setUploadProgress(`Envoi de "${file.name}"…`);
      const form = new FormData();
      form.append('file', file);
      try {
        await axios.post(`/api/ged/nodes/${currentNodeId}/upload`, form, {
          headers: { ...headers, 'Content-Type': 'multipart/form-data' }
        });
        successCount++;
      } catch (err) {
        const msg = axios.isAxiosError(err) ? err.response?.data?.error : 'Erreur';
        alert(`Échec pour "${file.name}" : ${msg}`);
      }
    }
    setUploading(false);
    setUploadProgress('');
    if (successCount > 0) loadFolder(currentNodeId);
  };

  const deleteNode = async (node: AlfrescoNode) => {
    const label = node.isFolder ? `le dossier "${node.name}" et tout son contenu` : `le fichier "${node.name}"`;
    if (!window.confirm(`Supprimer ${label} ?`)) return;
    setDeletingId(node.id);
    try {
      await axios.delete(`/api/ged/nodes/${node.id}`, { headers });
      setNodes(prev => prev.filter(n => n.id !== node.id));
    } catch {
      alert('Erreur lors de la suppression');
    } finally {
      setDeletingId(null);
    }
  };

  const downloadFile = (node: AlfrescoNode) => {
    const link = document.createElement('a');
    link.href = `/api/ged/nodes/${node.id}/content`;
    link.setAttribute('download', node.name);
    // Pass the token via a temporary anchor click — not ideal but simple
    // For production, use short-lived signed URLs or a proxy that accepts the JWT as query param
    link.click();
  };

  const folders = nodes.filter(n => n.isFolder);
  const files = nodes.filter(n => !n.isFolder);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <HardDrive size={24} style={{ color: '#3b82f6' }} />
          <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#1e293b' }}>GED — Alfresco</h2>
        </div>
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>
          Gestion Électronique de Documents connectée à votre serveur Alfresco Community Edition.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e2e8f0', paddingBottom: 0 }}>
        {([['config', <Settings size={15} />, 'Configuration'], ['explorer', <FolderOpen size={15} />, 'Explorateur']] as const).map(([key, icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: '0.875rem',
              color: tab === key ? '#3b82f6' : '#64748b',
              borderBottom: tab === key ? '2px solid #3b82f6' : '2px solid transparent',
              marginBottom: -2, transition: 'all 0.15s'
            }}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── CONFIG TAB ── */}
      {tab === 'config' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Form */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 28 }}>
            <h3 style={{ margin: '0 0 20px', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
              Paramètres de connexion
            </h3>
            {configLoading ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>
                <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : (
              <form onSubmit={saveConfig} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <label style={labelStyle}>
                  <span>URL du serveur Alfresco</span>
                  <input
                    type="url"
                    value={cfgUrl}
                    onChange={e => setCfgUrl(e.target.value)}
                    placeholder="http://10.x.x.x:8080"
                    required
                    style={inputStyle}
                  />
                  <small style={{ color: '#94a3b8' }}>Inclure le protocole et le port. Pas de slash final.</small>
                </label>
                <label style={labelStyle}>
                  <span>Utilisateur de service</span>
                  <input
                    type="text"
                    value={cfgUser}
                    onChange={e => setCfgUser(e.target.value)}
                    placeholder="admin"
                    required
                    style={inputStyle}
                  />
                  <small style={{ color: '#94a3b8' }}>Compte dédié avec droits de lecture/écriture.</small>
                </label>
                <label style={labelStyle}>
                  <span>Mot de passe</span>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={cfgPass}
                      onChange={e => setCfgPass(e.target.value)}
                      placeholder="Laisser vide pour conserver l'actuel"
                      style={{ ...inputStyle, paddingRight: 40 }}
                    />
                    <button type="button" onClick={() => setShowPass(p => !p)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                      {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </label>
                <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                  <button type="submit" disabled={configSaving} style={btnPrimary}>
                    {configSaving ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
                    Enregistrer
                  </button>
                  <button type="button" onClick={testConnection} disabled={connectionStatus === 'testing'} style={btnSecondary}>
                    {connectionStatus === 'testing' ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
                    Tester la connexion
                  </button>
                </div>
                {connectionStatus !== 'unknown' && connectionStatus !== 'testing' && (
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 8,
                    background: connectionStatus === 'ok' ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${connectionStatus === 'ok' ? '#86efac' : '#fca5a5'}`
                  }}>
                    {connectionStatus === 'ok'
                      ? <CheckCircle size={16} style={{ color: '#16a34a', flexShrink: 0, marginTop: 1 }} />
                      : <XCircle size={16} style={{ color: '#dc2626', flexShrink: 0, marginTop: 1 }} />}
                    <span style={{ fontSize: '0.85rem', color: connectionStatus === 'ok' ? '#15803d' : '#b91c1c' }}>
                      {connectionMsg}
                    </span>
                  </div>
                )}
              </form>
            )}
          </div>

          {/* Guide */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 24 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                <Info size={18} style={{ color: '#2563eb', flexShrink: 0, marginTop: 1 }} />
                <h4 style={{ margin: 0, fontWeight: 700, color: '#1d4ed8', fontSize: '0.95rem' }}>Guide de démarrage rapide</h4>
              </div>
              <ol style={{ margin: 0, paddingLeft: 20, color: '#1e40af', fontSize: '0.85rem', lineHeight: 1.8 }}>
                <li>Déployez Alfresco Community via <code style={codeStyle}>docker-compose</code> (voir guide ci-dessous)</li>
                <li>Alfresco démarre sur le port <strong>8080</strong> par défaut</li>
                <li>L'URL sera : <code style={codeStyle}>http://&lt;ip-serveur&gt;:8080</code></li>
                <li>Le compte admin par défaut est <code style={codeStyle}>admin / admin</code></li>
                <li>Créez un compte de service dédié dans Alfresco Admin Console</li>
                <li>Renseignez ces paramètres dans le formulaire et testez la connexion</li>
              </ol>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
              <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                <AlertTriangle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: 1 }} />
                <h4 style={{ margin: 0, fontWeight: 700, color: '#92400e', fontSize: '0.95rem' }}>docker-compose minimal</h4>
              </div>
              <pre style={{
                background: '#0f172a', color: '#e2e8f0', padding: 16, borderRadius: 8,
                fontSize: '0.75rem', overflow: 'auto', margin: 0, lineHeight: 1.6,
                fontFamily: 'Consolas, monospace'
              }}>{`version: "3"
services:
  alfresco:
    image: alfresco/alfresco-content-repository-community:23.2
    environment:
      JAVA_OPTS: >-
        -Ddb.driver=org.postgresql.Driver
        -Ddb.url=jdbc:postgresql://postgres:5432/alfresco
        -Ddb.username=alfresco
        -Ddb.password=alfresco
        -Dsolr.host=solr6
        -Dsolr.port=8983
        -Dalfresco.host=localhost
        -Dalfresco.port=8080
        -Daos.baseUrlOverwrite=http://localhost:8080/alfresco/aos
    ports:
      - "8080:8080"
    depends_on:
      - postgres

  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: alfresco
      POSTGRES_USER: alfresco
      POSTGRES_PASSWORD: alfresco

  solr6:
    image: alfresco/alfresco-search-services:2.0.10
    environment:
      SOLR_ALFRESCO_HOST: alfresco
      SOLR_ALFRESCO_PORT: 8080
      SOLR_SOLR_HOST: solr6
      SOLR_SOLR_PORT: 8983
      SOLR_CREATE_ALFRESCO_DEFAULTS: alfresco,archive`}</pre>
              <p style={{ margin: '12px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                Lancez avec <code style={codeStyle}>docker-compose up -d</code>. Premier démarrage ≈ 2-3 min.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── EXPLORER TAB ── */}
      {tab === 'explorer' && (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/* Breadcrumb */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem', fontWeight: 600, flexWrap: 'wrap' }}>
              {breadcrumb.map((crumb, idx) => (
                <React.Fragment key={crumb.id}>
                  {idx > 0 && <ChevronRight size={14} style={{ color: '#cbd5e1' }} />}
                  <button
                    onClick={() => navigateToBreadcrumb(idx)}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: idx === breadcrumb.length - 1 ? '#1e293b' : '#3b82f6',
                      fontWeight: 700, padding: '2px 4px', borderRadius: 4,
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: '0.85rem'
                    }}
                  >
                    {idx === 0 && <Home size={13} />}
                    {crumb.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => loadFolder(currentNodeId)} style={btnIcon} title="Actualiser">
                <RefreshCw size={15} />
              </button>
              <button onClick={() => setShowNewFolder(v => !v)} style={btnIcon} title="Nouveau dossier">
                <FolderPlus size={15} />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                style={{ ...btnPrimary, fontSize: '0.8rem', padding: '7px 14px' }}
              >
                {uploading ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={13} />}
                {uploading ? uploadProgress || 'Envoi…' : 'Déposer des fichiers'}
              </button>
              <input ref={fileInputRef} type="file" multiple hidden onChange={e => handleUpload(e.target.files)} />
            </div>
          </div>

          {/* New folder form */}
          {showNewFolder && (
            <div style={{ padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 8, alignItems: 'center' }}>
              <Folder size={16} style={{ color: '#f59e0b' }} />
              <input
                autoFocus
                type="text"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); } }}
                placeholder="Nom du nouveau dossier"
                style={{ ...inputStyle, width: 220, marginBottom: 0 }}
              />
              <button onClick={createFolder} style={btnPrimary}>Créer</button>
              <button onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} style={btnSecondary}>Annuler</button>
            </div>
          )}

          {/* Content */}
          {explorerLoading ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
              <Loader size={32} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
              <div style={{ fontWeight: 600 }}>Chargement…</div>
            </div>
          ) : explorerError ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <XCircle size={32} style={{ color: '#ef4444', marginBottom: 12 }} />
              <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: 8 }}>Impossible de charger ce dossier</div>
              <div style={{ color: '#64748b', fontSize: '0.85rem', marginBottom: 16 }}>{explorerError}</div>
              <button onClick={() => loadFolder(currentNodeId)} style={btnSecondary}>
                <RefreshCw size={14} /> Réessayer
              </button>
            </div>
          ) : nodes.length === 0 ? (
            <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
              <Folder size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontWeight: 600 }}>Dossier vide</div>
              <div style={{ fontSize: '0.85rem', marginTop: 4 }}>Déposez des fichiers ou créez un sous-dossier</div>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Nom', 'Type', 'Taille', 'Modifié le', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: '0.78rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...folders, ...files].map(node => (
                  <tr key={node.id}
                    onClick={() => node.isFolder && navigateTo(node)}
                    style={{
                      cursor: node.isFolder ? 'pointer' : 'default',
                      borderTop: '1px solid #f1f5f9',
                      transition: 'background 0.1s'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}
                  >
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {fileIcon(node)}
                        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: '#1e293b' }}>{node.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: '#94a3b8' }}>
                      {node.isFolder ? 'Dossier' : (node.content?.mimeType?.split('/')[1]?.toUpperCase() || 'Fichier')}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {node.isFolder ? '—' : formatSize(node.content?.sizeInBytes)}
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: '0.8rem', color: '#64748b', whiteSpace: 'nowrap' }}>
                      {formatDate(node.modifiedAt)}
                    </td>
                    <td style={{ padding: '10px 16px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {!node.isFolder && (
                          <button onClick={() => downloadFile(node)} style={btnIconSmall} title="Télécharger">
                            <Download size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => deleteNode(node)}
                          disabled={deletingId === node.id}
                          style={{ ...btnIconSmall, color: '#ef4444' }}
                          title="Supprimer"
                        >
                          {deletingId === node.id ? <Loader size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Summary */}
          {!explorerLoading && !explorerError && nodes.length > 0 && (
            <div style={{ padding: '10px 20px', borderTop: '1px solid #f1f5f9', fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600 }}>
              {folders.length} dossier{folders.length !== 1 ? 's' : ''} · {files.length} fichier{files.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

// Shared style objects
const labelStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5,
  fontSize: '0.85rem', fontWeight: 700, color: '#374151'
};

const inputStyle: React.CSSProperties = {
  padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db',
  fontSize: '0.875rem', outline: 'none', width: '100%', boxSizing: 'border-box',
  fontFamily: 'inherit'
};

const btnPrimary: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: '0.875rem',
  transition: 'background 0.15s'
};

const btnSecondary: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '9px 14px', borderRadius: 8, border: '1px solid #d1d5db', cursor: 'pointer',
  background: '#fff', color: '#374151', fontWeight: 700, fontSize: '0.875rem'
};

const btnIcon: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 34, height: 34, borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer',
  background: '#fff', color: '#64748b'
};

const btnIconSmall: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', cursor: 'pointer',
  background: '#fff', color: '#64748b'
};

const codeStyle: React.CSSProperties = {
  background: '#dbeafe', color: '#1e40af', padding: '1px 5px', borderRadius: 4,
  fontSize: '0.8rem', fontFamily: 'Consolas, monospace'
};

export default AdminGED;
