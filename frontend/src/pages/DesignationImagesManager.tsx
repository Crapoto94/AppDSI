import React, { useState, useEffect } from 'react';
import { Upload, Search, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import axios from 'axios';

interface DesignationImage {
  id: number;
  designation: string;
  image_path: string;
  image_url?: string;
  created_at: string;
}

interface DesignationImagesManagerProps {
  token: string;
  designations: string[];
}

const DesignationImagesManager: React.FC<DesignationImagesManagerProps> = ({ token, designations }) => {
  const [images, setImages] = useState<DesignationImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedDesignation, setSelectedDesignation] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/consumable/admin/images/all', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImages(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du chargement des images');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedDesignation || !e.target.files || !e.target.files[0]) {
      setError('Sélectionnez une désignation et un fichier');
      return;
    }

    try {
      setUploading(true);
      setError('');
      const formData = new FormData();
      formData.append('image', e.target.files[0]);
      formData.append('designation', selectedDesignation);

      const response = await axios.post('/api/consumable/admin/images/upload', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      setImages([...images.filter(img => img.designation !== selectedDesignation), response.data.data]);
      setSelectedDesignation('');
      (e.target as HTMLInputElement).value = '';
      alert('Image téléchargée avec succès');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors du téléchargement');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (imageId: number, designation: string) => {
    if (!window.confirm(`Supprimer l'image de "${designation}" ?`)) return;

    try {
      setError('');
      await axios.delete(`/api/consumable/admin/images/${imageId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setImages(images.filter(img => img.id !== imageId));
      alert('Image supprimée');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  const searchImages = async () => {
    if (!searchQuery.trim()) return;

    try {
      setLoading(true);
      setError('');

      // Utiliser Unsplash API (gratuit, pas de clé requise pour les requêtes simples)
      const response = await axios.get(`https://api.unsplash.com/search/photos`, {
        params: {
          query: `${searchQuery} printer transparent`,
          per_page: 5,
          client_id: 'YOUR_UNSPLASH_ACCESS_KEY' // À remplacer ou utiliser un endpoint proxy
        }
      });

      // Afficher les résultats (à implémenter avec un modal)
      console.log('Résultats:', response.data);
    } catch (err) {
      setError('Erreur lors de la recherche d\'images');
    } finally {
      setLoading(false);
    }
  };

  const filteredImages = images.filter(img =>
    img.designation.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const unmappedDesignations = designations.filter(d =>
    !images.some(img => img.designation === d)
  );

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--secondary-color)', margin: '0 0 6px' }}>
        Gestion des Images des Désignations
      </h2>
      <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 24px' }}>
        Téléchargez des images illustratives pour les imprimantes
      </p>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: '#fff5f5', border: '1px solid #fecaca',
          borderRadius: 10, padding: '12px 16px', marginBottom: 24,
          color: '#991b1b', fontSize: 14
        }}>
          <AlertCircle size={18} style={{ flexShrink: 0, color: '#dc2626' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Section Upload */}
      <div style={{
        background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
        padding: 24, marginBottom: 24
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#1e293b' }}>
          Télécharger une Image
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 200px', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Désignation
            </label>
            <select
              value={selectedDesignation}
              onChange={e => setSelectedDesignation(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0',
                borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box'
              }}
            >
              <option value="">-- Sélectionner --</option>
              {unmappedDesignations.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              Image (PNG, JPEG, WebP)
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileUpload}
              disabled={!selectedDesignation || uploading}
              style={{
                width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0',
                borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ fontSize: 12, color: '#64748b' }}>
            Max 10 MB
          </div>
        </div>

        {uploading && <p style={{ marginTop: 12, color: '#3b82f6' }}>Téléchargement en cours...</p>}
      </div>

      {/* Section Recherche */}
      <div style={{
        background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
        padding: 24, marginBottom: 24
      }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px', color: '#1e293b' }}>
          Rechercher des Images
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 12 }}>
          <input
            type="text"
            placeholder="Exemple: Brother DCP, Canon, HP..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              padding: '10px 12px', border: '1.5px solid #e2e8f0',
              borderRadius: 8, fontSize: 14, outline: 'none'
            }}
            onKeyPress={e => e.key === 'Enter' && searchImages()}
          />
          <button
            onClick={searchImages}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: '#3b82f6', color: 'white', border: 'none', borderRadius: 8,
              padding: '10px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 14
            }}
          >
            <Search size={16} /> Chercher
          </button>
        </div>

        <p style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
          💡 Vous pouvez également télécharger manuellement les images depuis Google Images, Unsplash, Pixabay, etc.
        </p>
      </div>

      {/* Liste des Images */}
      <div style={{
        background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--secondary-color)' }}>
              <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, color: 'white' }}>Image</th>
              <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, color: 'white' }}>Désignation</th>
              <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, color: 'white' }}>Date</th>
              <th style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, color: 'white' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredImages.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ padding: '50px 20px', textAlign: 'center', color: '#94a3b8' }}>
                  Aucune image trouvée
                </td>
              </tr>
            ) : (
              filteredImages.map((img, idx) => (
                <tr key={img.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                  <td style={{ padding: '12px 20px' }}>
                    <img
                      src={img.image_path}
                      alt={img.designation}
                      style={{ width: 60, height: 60, objectFit: 'contain', borderRadius: 6 }}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="60" height="60"%3E%3Crect fill="%23e2e8f0" width="60" height="60"/%3E%3C/svg%3E';
                      }}
                    />
                  </td>
                  <td style={{ padding: '12px 20px', fontWeight: 600, color: '#1e293b' }}>{img.designation}</td>
                  <td style={{ padding: '12px 20px', color: '#64748b' }}>
                    {new Date(img.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleDelete(img.id, img.designation)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', background: '#fff5f5', color: '#dc2626',
                        border: '1px solid #fecaca', borderRadius: 6, fontSize: 13,
                        fontWeight: 600, cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={14} /> Supprimer
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: 13, color: '#64748b', fontWeight: 500 }}>
          {filteredImages.length} image(s) / {designations.length} désignation(s) mappées
        </div>
      </div>
    </div>
  );
};

export default DesignationImagesManager;
