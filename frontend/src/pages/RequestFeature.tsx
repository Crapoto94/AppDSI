import React, { useState } from 'react';
import { Plus, Send, CheckCircle, AlertCircle } from 'lucide-react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';

const RequestFeature: React.FC = () => {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Amélioration'
  });

  const categories = [
    { value: 'Bug', label: '🐛 Bug', color: '#dc2626' },
    { value: 'Amélioration', label: '✨ Amélioration', color: '#2563eb' },
    { value: 'Nouvelle fonctionnalité', label: '🚀 Nouvelle fonctionnalité', color: '#7c3aed' },
    { value: 'Graphisme', label: '🎨 Graphisme', color: '#ea580c' }
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!formData.title.trim()) {
        setError('Le titre est obligatoire');
        setLoading(false);
        return;
      }

      const response = await axios.post('/api/backlog', formData, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.status === 200) {
        setSubmitted(true);
        setFormData({ title: '', description: '', category: 'Amélioration' });
        setTimeout(() => {
          navigate('/');
        }, 3000);
      }
    } catch (err) {
      setError('Erreur lors de la soumission. Veuillez réessayer.');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      <Header />
      <main style={{ padding: '60px 20px' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          {submitted ? (
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '60px 40px',
              textAlign: 'center',
              boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
            }}>
              <div style={{
                width: '80px',
                height: '80px',
                background: 'linear-gradient(135deg, #d4fc79, #96e6a1)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 24px',
                boxShadow: '0 8px 24px rgba(100, 200, 100, 0.3)'
              }}>
                <CheckCircle size={40} color="#15803d" />
              </div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: '900', color: '#0f172a', marginBottom: '12px' }}>
                Demande soumise !
              </h2>
              <p style={{ color: '#64748b', fontSize: '1rem', marginBottom: '24px', lineHeight: 1.6 }}>
                Merci pour votre suggestion. Votre demande a été enregistrée et sera examinée par l'équipe.
              </p>
              <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>
                Redirection vers l'accueil dans 3 secondes...
              </p>
            </div>
          ) : (
            <div style={{
              background: 'white',
              borderRadius: '16px',
              padding: '40px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.1)'
            }}>
              <div style={{ marginBottom: '32px' }}>
                <h1 style={{
                  fontSize: '2rem',
                  fontWeight: '900',
                  color: '#0f172a',
                  marginBottom: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <Plus size={32} color='#2563eb' />
                  Nouvelle demande
                </h1>
                <p style={{ color: '#64748b', fontSize: '1rem' }}>
                  Proposez une amélioration, signalez un bug ou suggérez une nouvelle fonctionnalité.
                </p>
              </div>

              <form onSubmit={handleSubmit}>
                {error && (
                  <div style={{
                    background: '#fee2e2',
                    border: '1px solid #fca5a5',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    marginBottom: '20px',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center'
                  }}>
                    <AlertCircle size={20} color='#dc2626' />
                    <span style={{ color: '#991b1b' }}>{error}</span>
                  </div>
                )}

                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    color: '#0c4a6e',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Catégorie
                  </label>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: '12px'
                  }}>
                    {categories.map(cat => (
                      <button
                        key={cat.value}
                        type='button'
                        onClick={() => setFormData(prev => ({ ...prev, category: cat.value }))}
                        style={{
                          padding: '12px 16px',
                          border: formData.category === cat.value
                            ? `2px solid ${cat.color}`
                            : '2px solid #e2e8f0',
                          borderRadius: '10px',
                          background: formData.category === cat.value
                            ? `${cat.color}15`
                            : 'white',
                          color: formData.category === cat.value ? cat.color : '#64748b',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={e => {
                          if (formData.category !== cat.value) {
                            e.currentTarget.style.background = '#f8fafc';
                            e.currentTarget.style.borderColor = cat.color;
                          }
                        }}
                        onMouseLeave={e => {
                          if (formData.category !== cat.value) {
                            e.currentTarget.style.background = 'white';
                            e.currentTarget.style.borderColor = '#e2e8f0';
                          }
                        }}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    color: '#0c4a6e',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Titre <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <input
                    type='text'
                    name='title'
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder='Décrivez brièvement votre demande...'
                    maxLength={255}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      border: '2px solid #7dd3fc',
                      borderRadius: '10px',
                      fontSize: '1rem',
                      boxSizing: 'border-box',
                      outline: 'none',
                      transition: 'border-color 0.2s'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#0284c7'}
                    onBlur={e => e.currentTarget.style.borderColor = '#7dd3fc'}
                  />
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '6px' }}>
                    {formData.title.length}/255
                  </p>
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '0.85rem',
                    fontWeight: '700',
                    color: '#0c4a6e',
                    marginBottom: '8px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em'
                  }}>
                    Description
                  </label>
                  <textarea
                    name='description'
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder='Donnez plus de détails... (contexte, objectif, etc.)'
                    rows={6}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      border: '2px solid #7dd3fc',
                      borderRadius: '10px',
                      fontSize: '1rem',
                      boxSizing: 'border-box',
                      outline: 'none',
                      fontFamily: 'inherit',
                      transition: 'border-color 0.2s',
                      resize: 'vertical'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = '#0284c7'}
                    onBlur={e => e.currentTarget.style.borderColor = '#7dd3fc'}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <button
                    type='submit'
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: '14px 24px',
                      background: loading ? '#cbd5e1' : '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '10px',
                      fontWeight: '700',
                      fontSize: '1rem',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => {
                      if (!loading) {
                        e.currentTarget.style.background = '#1d4ed8';
                        e.currentTarget.style.boxShadow = '0 8px 24px rgba(37, 99, 235, 0.3)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!loading) {
                        e.currentTarget.style.background = '#2563eb';
                        e.currentTarget.style.boxShadow = 'none';
                      }
                    }}
                  >
                    <Send size={18} />
                    {loading ? 'Envoi...' : 'Soumettre'}
                  </button>
                  <button
                    type='button'
                    onClick={() => navigate('/')}
                    style={{
                      padding: '14px 24px',
                      background: 'white',
                      color: '#64748b',
                      border: '2px solid #e2e8f0',
                      borderRadius: '10px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = '#f8fafc';
                      e.currentTarget.style.borderColor = '#cbd5e1';
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'white';
                      e.currentTarget.style.borderColor = '#e2e8f0';
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default RequestFeature;
