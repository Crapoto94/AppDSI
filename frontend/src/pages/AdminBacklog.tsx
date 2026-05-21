import React, { useState, useEffect } from 'react';
import { Check, X, Clock, AlertCircle, Trash2, Edit2, Filter } from 'lucide-react';
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
}

const AdminBacklog: React.FC = () => {
  const { token } = useAuth();
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingStatus, setEditingStatus] = useState('');

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

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await axios.put(`/api/backlog/${id}`, { status: newStatus }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setItems(items.map(item => item.id === id ? { ...item, status: newStatus } : item));
      setEditingId(null);
    } catch (error) {
      console.error('Error updating status:', error);
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

                      {editingId === item.id ? (
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
                            onClick={() => setEditingId(null)}
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
                            setEditingId(item.id);
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
