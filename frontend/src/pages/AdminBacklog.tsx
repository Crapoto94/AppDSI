import React, { useState, useEffect } from 'react';
import { Check, X, Clock, AlertCircle, Trash2, Edit2, Filter, User, Download } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

interface BacklogItem {
  id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  attachments?: Array<{
    filename: string;
    path: string;
    size: number;
    mimetype: string;
    uploadedAt: string;
  }>;
}

interface ADUser {
  username: string;
  displayName: string;
  email: string;
  service?: string;
}

const AdminBacklog: React.FC = () => {
  const { token } = useAuth();
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [editingBasicsId, setEditingBasicsId] = useState<number | null>(null);
  const [editingStatusId, setEditingStatusId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState('');
  const [editingTitle, setEditingTitle] = useState('');
  const [editingCreatedBy, setEditingCreatedBy] = useState('');
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ADUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);

  const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
    'Bug': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5' },
    'Amélioration': { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
    'Nouvelle fonctionnalité': { bg: '#e9d5ff', text: '#5b21b6', border: '#d8b4fe' },
    'Graphisme': { bg: '#fed7aa', text: '#92400e', border: '#fdba74' }
  };

  const statusOptions = [
    { value: 'open', label: 'En attente', icon: Clock, color: '#f59e0b' },
    { value: 'in_progress', label: 'En cours', icon: AlertCircle, color: '#3b82f6' },
    { value: 'accepted', label: 'Accepté', icon: Check, color: '#10b981' },
    { value: 'rejected', label: 'Rejeté', icon: X, color: '#ef4444' },
    { value: 'completed', label: 'Complété', icon: Check, color: '#8b5cf6' }
  ];

  useEffect(() => {
    fetchBacklog();
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

  const searchADUsers = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchingUsers(true);
    try {
      const response = await axios.get('/api/ad/search', {
        params: { q: query },
        headers: { Authorization: `Bearer ${token}` }
      });
      setSearchResults(response.data || []);
    } catch (error) {
      console.error('Error searching AD users:', error);
      setSearchResults([]);
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await axios.put(`/api/backlog/${id}`, { status: newStatus }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(items.map(item => item.id === id ? { ...item, status: newStatus } : item));
      setEditingStatusId(null);
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleEditItem = (item: BacklogItem) => {
    setEditingBasicsId(item.id);
    setEditingTitle(item.title);
    setEditingCreatedBy(item.created_by);
    setShowUserSearch(false);
    setUserSearchQuery('');
    setSearchResults([]);
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

  const filteredItems = items.filter(item => {
    const statusMatch = filterStatus === 'all' || item.status === filterStatus;
    const categoryMatch = filterCategory === 'all' || item.category === filterCategory;
    return statusMatch && categoryMatch;
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
          <h1 style={{ fontSize: '2rem', fontWeight: '900', color: '#0f172a', marginBottom: '8px' }}>
            Gestion du Backlog
          </h1>
          <p style={{ color: '#64748b', fontSize: '1rem', marginBottom: '32px' }}>
            {items.length} demande{items.length !== 1 ? 's' : ''} au total
          </p>

          {/* Filtres */}
          <div style={{
            background: 'white',
            borderRadius: '8px',
            padding: '20px',
            marginBottom: '24px',
            display: 'flex',
            gap: '20px',
            flexWrap: 'wrap',
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
                              value={showUserSearch ? userSearchQuery : editingCreatedBy}
                              onChange={e => {
                                if (showUserSearch) {
                                  setUserSearchQuery(e.target.value);
                                  searchADUsers(e.target.value);
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
                            {showUserSearch && searchResults.length > 0 && (
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
                                {searchResults.map((user, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => {
                                      setEditingCreatedBy(user.displayName || user.username);
                                      setShowUserSearch(false);
                                      setUserSearchQuery('');
                                      setSearchResults([]);
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
                                      {user.email && <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{user.email}</div>}
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

                      {editingBasicsId === item.id ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <select
                            value={editingStatus}
                            onChange={e => setEditingStatus(e.target.value)}
                            style={{
                              padding: '6px 10px',
                              border: '2px solid #3b82f6',
                              borderRadius: '6px',
                              fontSize: '0.85rem',
                              cursor: 'pointer'
                            }}
                          >
                            {statusOptions.map(opt => (
                              <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                          </select>
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
                            onClick={() => setEditingStatusId(null)}
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
    </div>
  );
};

export default AdminBacklog;
