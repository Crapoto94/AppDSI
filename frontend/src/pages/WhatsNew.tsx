import React, { useState, useEffect } from 'react';
import { Plus, Download, Filter } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';

interface BacklogItem {
  id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  created_by: string;
  created_at: string;
  attachments?: Array<{
    filename: string;
    path: string;
    size: number;
  }>;
}

const WhatsNew: React.FC = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('open');

  const categoryColors: Record<string, { bg: string; text: string; border: string; icon: string }> = {
    'Bug': { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', icon: '🐛' },
    'Amélioration': { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd', icon: '✨' },
    'Nouvelle fonctionnalité': { bg: '#e9d5ff', text: '#5b21b6', border: '#d8b4fe', icon: '🚀' },
    'Graphisme': { bg: '#fed7aa', text: '#92400e', border: '#fdba74', icon: '🎨' }
  };

  const statusColors: Record<string, { color: string; label: string }> = {
    'open': { color: '#f59e0b', label: 'En attente' },
    'in_progress': { color: '#3b82f6', label: 'En cours' },
    'accepted': { color: '#10b981', label: 'Accepté' },
    'rejected': { color: '#ef4444', label: 'Rejeté' },
    'completed': { color: '#8b5cf6', label: 'Complété' }
  };

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

  const filteredItems = items.filter(item => {
    const categoryMatch = filterCategory === 'all' || item.category === filterCategory;
    const statusMatch = filterStatus === 'all' || item.status === filterStatus;
    return categoryMatch && statusMatch;
  });

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
        <Header />
        <main style={{ padding: '60px 20px', textAlign: 'center' }}>
          <div style={{ fontSize: '1.1rem', color: '#64748b' }}>Chargement...</div>
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      <Header />
      <main style={{ padding: '60px 20px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: '32px' }}>
            <h1 style={{
              fontSize: '2rem',
              fontWeight: '900',
              color: '#0f172a',
              marginBottom: '8px'
            }}>
              What's New?
            </h1>
            <p style={{ color: '#64748b', fontSize: '1rem' }}>
              Les demandes et améliorations en cours
            </p>
          </div>

          {/* Filters */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
            display: 'flex',
            gap: '16px',
            flexWrap: 'wrap',
            alignItems: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            <Filter size={18} color='#64748b' />

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>
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
                <option value='all'>Tous les catégories</option>
                {Object.keys(categoryColors).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: '0.85rem', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>
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
                <option value='open'>En attente</option>
                <option value='in_progress'>En cours</option>
                <option value='accepted'>Accepté</option>
                <option value='rejected'>Rejeté</option>
                <option value='completed'>Complété</option>
              </select>
            </div>

            <button
              onClick={() => navigate('/request-feature')}
              style={{
                marginLeft: 'auto',
                padding: '8px 16px',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Plus size={18} />
              Nouvelle demande
            </button>
          </div>

          {/* Items List */}
          <div style={{ display: 'grid', gap: '16px' }}>
            {filteredItems.length === 0 ? (
              <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '40px',
                textAlign: 'center',
                color: '#94a3b8',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                Aucune demande trouvée
              </div>
            ) : (
              filteredItems.map(item => {
                const catColor = categoryColors[item.category];
                const statusColor = statusColors[item.status];

                return (
                  <div
                    key={item.id}
                    style={{
                      background: 'white',
                      borderRadius: '12px',
                      padding: '20px',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      borderLeft: `4px solid ${statusColor?.color || '#94a3b8'}`
                    }}
                  >
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '1.5rem', minWidth: '32px' }}>
                          {catColor?.icon || '📝'}
                        </span>
                        <div style={{ flex: 1 }}>
                          <h3 style={{
                            fontSize: '1.1rem',
                            fontWeight: '700',
                            color: '#1e293b',
                            margin: 0,
                            marginBottom: '4px'
                          }}>
                            {item.title}
                          </h3>
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

                            <span style={{
                              display: 'inline-block',
                              background: '#f0f0f0',
                              color: statusColor?.color,
                              padding: '4px 10px',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: '600'
                            }}>
                              {statusColor?.label}
                            </span>

                            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                              par {item.created_by}
                            </span>
                          </div>
                        </div>
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

                    {item.attachments && item.attachments.length > 0 && (
                      <div style={{
                        padding: '10px',
                        background: '#f8fafc',
                        borderRadius: '8px',
                        marginTop: '12px'
                      }}>
                        <p style={{ fontSize: '0.8rem', fontWeight: '600', color: '#475569', margin: '0 0 8px 0' }}>
                          Fichiers attachés ({item.attachments.length})
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {item.attachments.map((file, idx) => (
                            <a
                              key={idx}
                              href={`/uploads/backlog_attachments/${file.path}`}
                              download={file.filename}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '6px 10px',
                                background: 'white',
                                borderRadius: '6px',
                                border: '1px solid #cbd5e1',
                                textDecoration: 'none',
                                color: '#0284c7',
                                fontSize: '0.85rem',
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
                              <Download size={12} />
                              {file.filename}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{
                      fontSize: '0.8rem',
                      color: '#94a3b8',
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid #e2e8f0'
                    }}>
                      Créé le {new Date(item.created_at).toLocaleDateString('fr-FR')}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default WhatsNew;
