import React, { useState, useEffect } from 'react';
import { Check, X, Clock, AlertCircle, Trash2, Edit2, Filter, User, Download, Zap, ChevronUp } from 'lucide-react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useADSearch } from '../utils/useADSearch';

interface BacklogItem {
  id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  tile_id?: number | null;
  attachments?: Array<{
    filename: string;
    path: string;
    size: number;
    mimetype: string;
    uploadedAt: string;
  }>;
}

interface Tile {
  id: number;
  title: string;
  icon: string;
}

const AdminBacklog: React.FC = () => {
  const { token } = useAuth();
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [editingBasicsId, setEditingBasicsId] = useState<number | null>(null);
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState('');
  const [editingTileId, setEditingTileId] = useState<number | null>(null);
  const [editingComment, setEditingComment] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [editingCreatedBy, setEditingCreatedBy] = useState('');
  const backlogAd = useADSearch(token);
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [showVersionModal, setShowVersionModal] = useState(false);
  const [versionData, setVersionData] = useState<any>(null);
  const [versionLoading, setVersionLoading] = useState(false);
const [versionDescription, setVersionDescription] = useState('');
const [versionHtmlSource, setVersionHtmlSource] = useState(false);
const [releaseProposedVersion, setReleaseProposedVersion] = useState('');
const [isReleasing, setIsReleasing] = useState(false);
const [versionMdFile, setVersionMdFile] = useState<File | null>(null);

  const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
    'Bug': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
    'Amélioration': { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    'Nouvelle fonctionnalité': { bg: '#e9d5ff', text: '#5b21b6', border: '#d8b4fe' },
    'Graphisme': { bg: '#fed7aa', text: '#92400e', border: '#fdba74' }
  };

  const statusOptions = [
    { value: 'open', label: 'En attente', icon: Clock, color: '#f59e0b' },
    { value: 'in_progress', label: 'En cours', icon: AlertCircle, color: '#3b82f6' },
    { value: 'discussion', label: 'En discussion', icon: AlertCircle, color: '#8b5cf6' },
    { value: 'accepted', label: 'Accepté', icon: Check, color: '#10b981' },
    { value: 'rejected', label: 'Rejeté', icon: X, color: '#ef4444' },
    { value: 'completed', label: 'Complété', icon: Check, color: '#64748b' }
  ];

  useEffect(() => {
    fetchBacklog();
    fetchTiles();
  }, [token]);

  const fetchBacklog = async () => {
    try {
      const response = await axios.get('/api/backlog', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(response.data);
    } catch (error) {
      console.error('Error fetching backlog:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTiles = async () => {
    try {
      const response = await axios.get('/api/tiles', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTiles(response.data);
    } catch (error) {
      console.error('Error fetching tiles:', error);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (editingComment) updateData.admin_comment = editingComment;
      if (editingTileId) updateData.tile_id = editingTileId;

      await axios.put(`/api/backlog/${id}`, updateData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setItems(items.map(item =>
        item.id === id ? { ...item, status: newStatus, tile_id: editingTileId || item.tile_id } : item
      ));
      setEditingStatusId(null);
      setEditingComment('');
      setEditingTileId(null);
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleEditItem = (item: BacklogItem) => {
    setEditingBasicsId(item.id);
    setEditingTitle(item.title);
    setEditingCreatedBy(item.created_by);
    setShowUserSearch(false);
    backlogAd.setQuery('');
    backlogAd.clearResults();
  };

  const handleSaveEdit = async (id: number) => {
    try {
      await axios.put(`/api/backlog/${id}`, {
        title: editingTitle,
        created_by: editingCreatedBy
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(items.map(item => item.id === id ? { ...item, title: editingTitle, created_by: editingCreatedBy } : item));
      setEditingBasicsId(null);
      setShowUserSearch(false);
    } catch (error) {
      console.error('Error updating item:', error);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette demande ?')) return;
    try {
      await axios.delete(`/api/backlog/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(items.filter(item => item.id !== id));
    } catch (error) {
      console.error('Error deleting item:', error);
    }
  };

  const openVersionModal = async () => {
    setVersionLoading(true);
    try {
      const response = await axios.get('/api/backlog/ready-for-release', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVersionData(response.data);
      setReleaseProposedVersion(response.data.nextVersion);
      setVersionDescription('');
      setShowVersionModal(true);
    } catch (error) {
      console.error('Error loading version data:', error);
      alert('Erreur lors du chargement des données de montée de version');
    } finally {
      setVersionLoading(false);
    }
  };

  const handleVersionRelease = async () => {
    if (!versionData || versionData.completedItems.length === 0) {
      alert('Aucun backlog complété à inclure dans cette version');
      return;
    }

    if (!window.confirm(`Créer la version ${releaseProposedVersion} avec ${versionData.completedItems.length} backlog complété(s) ?`)) return;

    setIsReleasing(true);
    try {
      const formData = new FormData();
      formData.append('version', releaseProposedVersion);
      formData.append('description', versionDescription);
      if (versionMdFile) formData.append('mdFile', versionMdFile);

      const response = await axios.post('/api/release-from-backlog', formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      alert(`Version ${response.data.version} créée avec succès !`);
      setShowVersionModal(false);
      setVersionDescription('');
      setVersionMdFile(null);
    } catch (error: any) {
      console.error('Error releasing version:', error);
      alert('Erreur : ' + (error.response?.data?.message || error.message));
    } finally {
      setIsReleasing(false);
    }
  };

  const filteredItems = items.filter(item => {
    const statusMatch = filterStatus === 'all' || item.status === filterStatus;
    const categoryMatch = filterCategory === 'all' || item.category === filterCategory;
    const archivedMatch = showArchived || (item.status !== 'completed' && item.status !== 'rejected');
    return statusMatch && categoryMatch && archivedMatch;
  });

  const getStatusInfo = (status: string) => {
    return statusOptions.find(opt => opt.value === status);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '400px' }}>
        <div style={{ fontSize: '1.1rem', color: '#64748b' }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
            <div>
              <h1 style={{ fontSize: '2rem', fontWeight: '900', color: '#0f172a', marginBottom: '8px' }}>
                Gestion du Backlog
              </h1>
              <p style={{ color: '#64748b', fontSize: '1rem', margin: 0 }}>
                {items.length} demande{items.length !== 1 ? 's' : ''} au total
              </p>
            </div>
            <button
              onClick={openVersionModal}
              style={{
                padding: '12px 20px',
                background: 'linear-gradient(135deg, #7c3aed, #5b21b6)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '700',
                fontSize: '0.95rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.4)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
            >
              <ChevronUp size={18} />
              Montée de version
            </button>
          </div>

          {/* Filtres */}
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '24px',
            display: 'flex',
            gap: '20px',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            border: '1px solid #e2e8f0'
          }}>
            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '8px' }}>
                <Filter size={16} style={{ display: 'inline', marginRight: '6px' }} />
                Statut
              </label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                <option value='all'>Tous les statuts</option>
                {statusOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '8px' }}>
                Catégorie
              </label>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                style={{
                  padding: '8px 12px',
                  border: '2px solid #e2e8f0',
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                <option value='all'>Toutes les catégories</option>
                {Object.keys(categoryColors).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <button
              onClick={() => setShowArchived(!showArchived)}
              style={{
                padding: '8px 16px',
                background: showArchived ? '#8b5cf6' : '#f1f5f9',
                color: showArchived ? 'white' : '#475569',
                border: showArchived ? 'none' : '2px solid #e2e8f0',
                borderRadius: '8px',
                fontSize: '0.9rem',
                cursor: 'pointer',
                fontWeight: '600',
                transition: 'all 0.2s'
              }}
            >
              {showArchived ? '📦 Archive (actif)' : '📦 Archive'}
            </button>
          </div>

          {/* Liste des demandes */}
          <div style={{ display: 'grid', gap: '16px' }}>
            {filteredItems.length === 0 ? (
              <div style={{
                background: 'white',
                borderRadius: '8px',
                padding: '40px',
                textAlign: 'center',
                color: '#94a3b8',
                border: '1px solid #e2e8f0'
              }}>
                Aucune demande trouvée
              </div>
            ) : (
              filteredItems.map(item => {
                const catColor = categoryColors[item.category];
                const statusInfo = getStatusInfo(item.status);
                const StatusIcon = statusInfo?.icon || AlertCircle;

                return (
                  <div
                    key={item.id}
                    style={{
                      background: 'white',
                      borderRadius: '8px',
                      padding: '20px',
                      border: '1px solid #e2e8f0',
                      borderLeft: `4px solid ${statusInfo?.color || '#94a3b8'}`
                    }}
                  >
                    {editingBasicsId === item.id ? (
                      <div style={{ marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>
                            Titre
                          </label>
                          <input
                            type='text'
                            value={editingTitle}
                            onChange={e => setEditingTitle(e.target.value)}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              border: '2px solid #3b82f6',
                              borderRadius: '6px',
                              fontSize: '0.95rem',
                              boxSizing: 'border-box',
                              outline: 'none'
                            }}
                          />
                        </div>

                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ fontSize: '0.8rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>
                            Demandeur
                          </label>
                          <div style={{ position: 'relative' }}>
                            <input
                              type='text'
                              value={showUserSearch ? backlogAd.query : editingCreatedBy}
                              onChange={e => {
                                if (showUserSearch) {
                                  backlogAd.setQuery(e.target.value);
                                } else {
                                  setEditingCreatedBy(e.target.value);
                                }
                              }}
                              onFocus={() => setShowUserSearch(true)}
                              placeholder="Chercher dans l'AD..."
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                border: '2px solid #3b82f6',
                                borderRadius: '6px',
                                fontSize: '0.95rem',
                                boxSizing: 'border-box',
                                outline: 'none'
                              }}
                            />
                            {showUserSearch && backlogAd.results.length > 0 && (
                              <div style={{
                                position: 'absolute',
                                top: '100%',
                                left: 0,
                                right: 0,
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: '6px',
                                boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                                zIndex: 10,
                                marginTop: '4px',
                                maxHeight: '200px',
                                overflowY: 'auto'
                              }}>
                                {backlogAd.results.map((user, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => {
                                      setEditingCreatedBy(user.displayName || user.username);
                                      setShowUserSearch(false);
                                      backlogAd.setQuery('');
                                      backlogAd.clearResults();
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '10px 12px',
                                      border: 'none',
                                      background: 'white',
                                      textAlign: 'left',
                                      cursor: 'pointer',
                                      fontSize: '0.9rem',
                                      color: '#1e293b',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '8px'
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'white'}
                                  >
                                    <User size={14} color='#3b82f6' />
                                    <div>
                                      <div style={{ fontWeight: '600' }}>{user.displayName || user.username}</div>
                                      {user.email && <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{user.email}{user.service ? ` · ${user.service}` : ''}</div>}
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleSaveEdit(item.id)}
                            style={{
                              padding: '8px 16px',
                              background: '#10b981',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: '600',
                              fontSize: '0.9rem'
                            }}
                          >
                            Enregistrer
                          </button>
                          <button
                            onClick={() => setEditingBasicsId(null)}
                            style={{
                              padding: '8px 16px',
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontWeight: '600',
                              fontSize: '0.9rem'
                            }}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <h3 style={{
                            fontSize: '1.1rem',
                            fontWeight: '700',
                            color: '#1e293b',
                            margin: 0,
                            flex: 1
                          }}>
                            {item.title}
                          </h3>
                          <button
                            onClick={() => handleEditItem(item)}
                            style={{
                              background: '#f1f5f9',
                              border: '1px solid #cbd5e1',
                              borderRadius: '6px',
                              padding: '6px 10px',
                              cursor: 'pointer',
                              color: '#0c4a6e',
                              fontSize: '0.9rem',
                              marginRight: '8px'
                            }}
                            title='Éditer le titre et le demandeur'
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            style={{
                              background: 'white',
                              border: '1px solid #fca5a5',
                              borderRadius: '6px',
                              padding: '6px 10px',
                              cursor: 'pointer',
                              color: '#dc2626',
                              fontSize: '0.9rem'
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <span style={{
                            display: 'inline-block',
                            background: catColor?.bg,
                            color: catColor?.text,
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '600',
                            border: `1px solid ${catColor?.border}`
                          }}>
                            {item.category}
                          </span>

                          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                            par {item.created_by}
                          </span>

                          <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                            {new Date(item.created_at).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                      </div>
                    )}

                    {item.description && (
                      <p style={{
                        color: '#475569',
                        fontSize: '0.95rem',
                        marginBottom: '12px',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word'
                      }}>
                        {item.description}
                      </p>
                    )}

                    {item.attachments && item.attachments.length > 0 && (
                      <div style={{
                        marginBottom: '12px',
                        padding: '12px',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0'
                      }}>
                        <p style={{ fontSize: '0.85rem', fontWeight: '600', color: '#475569', marginBottom: '8px' }}>
                          Fichiers attachés ({item.attachments.length})
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {item.attachments.map((file, idx) => (
                            <a
                              key={idx}
                              href={`/uploads/backlog_attachments/${file.path}`}
                              download={file.filename}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 10px',
                                background: 'white',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                textDecoration: 'none',
                                color: '#0c4a6e',
                                fontSize: '0.9rem',
                                transition: 'all 0.2s'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = '#f1f5f9';
                                e.currentTarget.style.borderColor = '#7dd3fc';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'white';
                                e.currentTarget.style.borderColor = '#cbd5e1';
                              }}
                            >
                              <Download size={14} color='#0284c7' />
                              <span style={{ flex: 1 }}>{file.filename}</span>
                              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                {(file.size / 1024 / 1024).toFixed(1)} MB
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: '12px',
                      borderTop: '1px solid #e2e8f0'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <StatusIcon size={18} color={statusInfo?.color} />
                        <span style={{ fontSize: '0.9rem', fontWeight: '600', color: statusInfo?.color }}>
                          {statusInfo?.label}
                        </span>
                      </div>

                      {editingStatusId === item.id ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: '#475569' }}>
                            <span style={{ fontWeight: '600' }}>Catégorie :</span>
                            <span style={{
                              display: 'inline-block',
                              background: catColor?.bg,
                              color: catColor?.text,
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                              fontWeight: '600',
                              border: `1px solid ${catColor?.border}`
                            }}>{item.category}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <select
                              value={editingStatus}
                              onChange={e => setEditingStatus(e.target.value)}
                              style={{
                                padding: '6px 10px',
                                border: '2px solid #3b82f6',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                flex: 1
                              }}
                            >
                              {statusOptions.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                              ))}
                            </select>
                            <select
                              value={editingTileId || ''}
                              onChange={e => setEditingTileId(e.target.value ? parseInt(e.target.value) : null)}
                              style={{
                                padding: '6px 10px',
                                border: '2px solid #3b82f6',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                flex: 1
                              }}
                            >
                              <option value=''>Aucune tuile</option>
                              {tiles.map(tile => (
                                <option key={tile.id} value={tile.id}>{tile.icon} {tile.title}</option>
                              ))}
                            </select>
                          </div>

                          <textarea
                            value={editingComment}
                            onChange={e => setEditingComment(e.target.value)}
                            placeholder='Commentaire (optionnel) - sera envoyé au demandeur'
                            style={{
                              padding: '8px 10px',
                              border: '2px solid #3b82f6',
                              borderRadius: '6px',
                              fontSize: '0.85rem',
                              fontFamily: 'inherit',
                              resize: 'vertical',
                              minHeight: '60px',
                              width: '100%',
                              boxSizing: 'border-box'
                            }}
                          />

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                              onClick={() => handleStatusChange(item.id, editingStatus)}
                              style={{
                                padding: '6px 12px',
                                background: '#10b981',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600'
                              }}
                            >
                              Confirmer
                            </button>
                            <button
                              onClick={() => {
                                setEditingStatusId(null);
                                setEditingComment('');
                                setEditingTileId(null);
                              }}
                              style={{
                                padding: '6px 12px',
                                background: '#ef4444',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600'
                              }}
                            >
                              Annuler
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingStatusId(item.id);
                            setEditingStatus(item.status);
                          }}
                          style={{
                            padding: '6px 12px',
                            background: '#f1f5f9',
                            color: '#0c4a6e',
                            border: '1px solid #cbd5e1',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          <Edit2 size={14} />
                          Changer le statut
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Version Modal */}
          {showVersionModal && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000
            }} onClick={() => setShowVersionModal(false)}>
              <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '32px',
                maxWidth: '600px',
                maxHeight: '90vh',
                overflow: 'auto',
                width: '90%'
              }} onClick={e => e.stopPropagation()}>
                <div style={{ marginBottom: '24px' }}>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0f172a', margin: '0 0 8px' }}>
                    📦 Montée de version
                  </h2>
                  <p style={{ color: '#64748b', margin: 0 }}>Créer une nouvelle version avec les backlog complétés</p>
                </div>

                {versionLoading ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    Chargement...
                  </div>
                ) : versionData ? (
                  <>
                    {/* Version Info */}
                    <div style={{
                      background: '#f8fafc',
                      border: '2px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '16px',
                      marginBottom: '24px'
                    }}>
                      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                            Version actuelle
                          </div>
                          <div style={{ fontSize: '1.5rem', fontWeight: '900', color: '#0f172a' }}>
                            v{versionData.currentVersion}
                          </div>
                        </div>
                        <div style={{ fontSize: '2rem', color: '#cbd5e1' }}>→</div>
                        <div>
                          <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                            Nouvelle version
                          </div>
                          <input
                            type="text"
                            value={releaseProposedVersion}
                            onChange={e => setReleaseProposedVersion(e.target.value)}
                            style={{
                              fontSize: '1.5rem',
                              fontWeight: '900',
                              color: '#7c3aed',
                              border: '2px solid #7c3aed',
                              borderRadius: '6px',
                              padding: '6px 10px',
                              fontFamily: 'monospace',
                              width: '120px'
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                        {versionData.count} backlog complété{versionData.count !== 1 ? 's' : ''} à inclure
                      </div>
                    </div>

                    {/* Backlog Items List - Grouped by Module */}
                    {versionData.completedItems.length > 0 && versionData.groupedByModule && (
                      <div style={{ marginBottom: '24px' }}>
                        <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#1e293b', marginBottom: '12px' }}>
                          ✅ Backlog complétés (par module)
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflow: 'auto' }}>
                          {Object.entries(versionData.groupedByModule).map(([moduleName, items]: [string, any]) => {
                            if (!items || items.length === 0) return null;

                            return (
                              <div key={moduleName}>
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  fontSize: '0.85rem',
                                  fontWeight: '700',
                                  color: '#1e293b',
                                  marginBottom: '8px'
                                }}>
                                  <span>📦</span>
                                  <span>{moduleName}</span>
                                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>({items.length})</span>
                                </div>
                                <div style={{
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  borderRadius: '8px',
                                  padding: '10px',
                                  marginBottom: '8px'
                                }}>
                                  {items.map((item: any) => (
                                    <div key={item.id} style={{
                                      padding: '6px 0',
                                      borderBottom: '1px solid #e2e8f0',
                                      color: '#334155',
                                      fontSize: '0.9rem',
                                      lineHeight: 1.4
                                    }}>
                                      • <span style={{ fontWeight: '600', fontSize: '0.75rem', color: '#64748b' }}>[{item.category}]</span> {item.title}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Description Field */}
                    <div style={{ marginBottom: '24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569' }}>
                          📝 Ajouter une note (optionnel)
                        </label>
                        <button
                          type="button"
                          onClick={() => setVersionHtmlSource(v => !v)}
                          title={versionHtmlSource ? "Revenir à l'éditeur visuel" : 'Afficher / éditer le HTML brut'}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
                            border: `1px solid ${versionHtmlSource ? '#7c3aed' : '#cbd5e1'}`,
                            background: versionHtmlSource ? '#7c3aed' : '#fff',
                            color: versionHtmlSource ? '#fff' : '#475569',
                          }}
                        >
                          {'</>'} {versionHtmlSource ? 'Éditeur visuel' : 'HTML brut'}
                        </button>
                      </div>
                      {versionHtmlSource ? (
                        <textarea
                          value={versionDescription}
                          onChange={e => setVersionDescription(e.target.value)}
                          placeholder="<p>Code HTML…</p>"
                          spellCheck={false}
                          style={{
                            width: '100%', minHeight: '180px', padding: '12px', boxSizing: 'border-box',
                            border: '2px solid #e2e8f0', borderRadius: '8px', resize: 'vertical', outline: 'none',
                            fontFamily: 'Consolas, "Liberation Mono", Menlo, monospace', fontSize: '0.82rem',
                            lineHeight: 1.5, color: '#1e293b', background: '#f8fafc',
                          }}
                        />
                      ) : (
                        <div style={{ border: '2px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
                          <ReactQuill
                            value={versionDescription}
                            onChange={setVersionDescription}
                            placeholder="Ex: Améliorations majeures de performance et stabilité"
                            modules={{ toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link'], ['clean']] }}
                            style={{ fontFamily: 'inherit', fontSize: '0.9rem' }}
                          />
                        </div>
                      )}
                    </div>

                    {/* MD File Upload for Major Versions */}
                    <div style={{ marginBottom: '24px', padding: '16px', background: '#f8fafc', border: '2px dashed #cbd5e1', borderRadius: '8px' }}>
                      <label style={{
                        display: 'block',
                        fontSize: '0.85rem',
                        fontWeight: '700',
                        color: '#475569',
                        marginBottom: '8px'
                      }}>
                        📄 Fichier Markdown pour version majeure (optionnel)
                      </label>
                      <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 10px' }}>
                        Importez un fichier .md qui sera affiché aux utilisateurs (utilisé pour les versions majeures)
                      </p>
                      <input
                        type="file"
                        accept=".md,text/markdown"
                        onChange={e => setVersionMdFile(e.target.files?.[0] || null)}
                        style={{ fontSize: '0.85rem' }}
                      />
                      {versionMdFile && (
                        <div style={{ marginTop: '8px', fontSize: '0.85rem', color: '#16a34a', fontWeight: '600' }}>
                          ✓ {versionMdFile.name} ({(versionMdFile.size / 1024).toFixed(1)} Ko)
                        </div>
                      )}
                    </div>

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button
                        onClick={handleVersionRelease}
                        disabled={isReleasing || versionData.completedItems.length === 0}
                        style={{
                          flex: 1,
                          padding: '12px 16px',
                          background: versionData.completedItems.length === 0 ? '#cbd5e1' : '#7c3aed',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: versionData.completedItems.length === 0 ? 'not-allowed' : 'pointer',
                          fontWeight: '700',
                          fontSize: '0.95rem',
                          transition: 'all 0.2s'
                        }}
                      >
                        {isReleasing ? 'Création en cours...' : `Créer v${releaseProposedVersion}`}
                      </button>
                      <button
                        onClick={() => setShowVersionModal(false)}
                        style={{
                          flex: 1,
                          padding: '12px 16px',
                          background: '#f1f5f9',
                          color: '#475569',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: '700',
                          fontSize: '0.95rem'
                        }}
                      >
                        Annuler
                      </button>
                    </div>
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '40px', color: '#ef4444' }}>
                    Erreur lors du chargement
                  </div>
                )}
              </div>
            </div>
          )}
    </div>
  );
};

export default AdminBacklog;
