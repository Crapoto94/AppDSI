import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, X, Search } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';

interface Doctrine {
  id: number;
  title: string;
  content: string;
  category: string;
  doctrine_date: string;
  created_by: string;
  created_at: string;
}

const Doctrines: React.FC = () => {
  const { token } = useAuth();
  const [doctrines, setDoctrines] = useState<Doctrine[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: '',
    doctrine_date: new Date().toISOString().split('T')[0]
  });

  const filteredDoctrines = doctrines.filter(doc => {
    const query = searchQuery.toLowerCase();
    return (
      doc.title.toLowerCase().includes(query) ||
      doc.content.toLowerCase().includes(query) ||
      doc.category.toLowerCase().includes(query)
    );
  });

  useEffect(() => {
    fetchDoctrines();
  }, [token]);

  const fetchDoctrines = async () => {
    try {
      const response = await axios.get('/api/doctrines', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDoctrines(response.data);
    } catch (error) {
      console.error('Error fetching doctrines:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title || !formData.content || !formData.doctrine_date) {
      alert('Tous les champs sont requis');
      return;
    }

    try {
      if (editingId) {
        await axios.put(`/api/doctrines/${editingId}`, formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } else {
        await axios.post('/api/doctrines', formData, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      setShowModal(false);
      setFormData({ title: '', content: '', category: '', doctrine_date: new Date().toISOString().split('T')[0] });
      setEditingId(null);
      fetchDoctrines();
    } catch (error) {
      console.error('Error saving doctrine:', error);
      alert('Erreur lors de la sauvegarde');
    }
  };

  const handleEdit = (doctrine: Doctrine) => {
    setFormData({
      title: doctrine.title,
      content: doctrine.content,
      category: doctrine.category,
      doctrine_date: doctrine.doctrine_date
    });
    setEditingId(doctrine.id);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette doctrine?')) return;

    try {
      await axios.delete(`/api/doctrines/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchDoctrines();
    } catch (error) {
      console.error('Error deleting doctrine:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingId(null);
    setFormData({ title: '', content: '', category: '', doctrine_date: new Date().toISOString().split('T')[0] });
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
        <Header />
        <main style={{ padding: '60px 20px', textAlign: 'center' }}>
          Chargement...
        </main>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      <Header />
      <main style={{ padding: '60px 20px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ marginBottom: '32px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h1 style={{ fontSize: '2rem', fontWeight: '900', color: '#0f172a', margin: 0, marginBottom: '8px' }}>
                Notes de service et doctrines
              </h1>
              <p style={{ color: '#64748b', fontSize: '1rem', margin: 0 }}>
                Gérez les doctrines et notes de service
              </p>
            </div>
            <button
              onClick={() => setShowModal(true)}
              style={{
                padding: '10px 20px',
                background: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Plus size={18} />
              Nouvelle doctrine
            </button>
          </div>

          <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '10px 16px',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              backgroundColor: 'white'
            }}>
              <Search size={18} color="#94a3b8" />
              <input
                type="text"
                placeholder="Rechercher par titre, catégorie ou contenu..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  fontSize: '1rem',
                  fontFamily: 'inherit'
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    padding: '4px'
                  }}
                >
                  <X size={18} />
                </button>
              )}
            </div>
            {searchQuery && (
              <span style={{ color: '#64748b', fontSize: '0.9rem', whiteSpace: 'nowrap' }}>
                {filteredDoctrines.length} résultat{filteredDoctrines.length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gap: '16px' }}>
            {filteredDoctrines.length === 0 ? (
              <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '40px',
                textAlign: 'center',
                color: '#94a3b8',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                {searchQuery ? 'Aucune doctrine ne correspond à votre recherche' : 'Aucune doctrine pour le moment'}
              </div>
            ) : (
              filteredDoctrines.map(doc => (
                <div
                  key={doc.id}
                  style={{
                    background: 'white',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    borderLeft: '4px solid #2563eb'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#0f172a', margin: 0, marginBottom: '4px' }}>
                        {doc.title}
                      </h3>
                      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {doc.category && (
                          <span style={{
                            display: 'inline-block',
                            background: '#dbeafe',
                            color: '#1e40af',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            fontWeight: '600'
                          }}>
                            {doc.category}
                          </span>
                        )}
                        <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                          {new Date(doc.doctrine_date).toLocaleDateString('fr-FR')}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                          par {doc.created_by}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleEdit(doc)}
                        style={{
                          padding: '6px 12px',
                          background: '#f1f5f9',
                          color: '#0c4a6e',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Edit2 size={14} />
                        Éditer
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        style={{
                          padding: '6px 12px',
                          background: '#fee2e2',
                          color: '#991b1b',
                          border: '1px solid #fca5a5',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                      >
                        <Trash2 size={14} />
                        Supprimer
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      background: '#f8fafc',
                      padding: '12px',
                      borderRadius: '8px',
                      fontSize: '0.95rem',
                      color: '#475569',
                      lineHeight: 1.6
                    }}
                    dangerouslySetInnerHTML={{ __html: doc.content }}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '900px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#0f172a', margin: 0 }}>
                {editingId ? 'Éditer la doctrine' : 'Nouvelle doctrine'}
              </h2>
              <button
                onClick={handleCloseModal}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#64748b',
                  padding: '8px'
                }}
              >
                <X size={24} />
              </button>
            </div>

            <div style={{ padding: '24px', overflow: 'auto', flex: 1 }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                  Titre
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    boxSizing: 'border-box'
                  }}
                  placeholder="Titre de la doctrine"
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                  Contenu
                </label>
                <ReactQuill
                  value={formData.content}
                  onChange={(content: string) => setFormData({ ...formData, content })}
                  style={{ background: 'white', height: '250px', marginBottom: '50px' }}
                  theme="snow"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                    Catégorie
                  </label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      boxSizing: 'border-box'
                    }}
                    placeholder="Catégorie"
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>
                    Date
                  </label>
                  <input
                    type="date"
                    value={formData.doctrine_date}
                    onChange={e => setFormData({ ...formData, doctrine_date: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #f1f5f9',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={handleCloseModal}
                style={{
                  padding: '10px 20px',
                  background: 'white',
                  color: '#64748b',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '10px 20px',
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '600'
                }}
              >
                {editingId ? 'Mettre à jour' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Doctrines;
