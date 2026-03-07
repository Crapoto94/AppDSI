import React, { useState, useEffect } from 'react';
import Header from '../components/Header';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Eye, Trash2, Calendar, Edit2, Check, X as CloseIcon, Hourglass } from 'lucide-react';

interface Certificate {
  id: number;
  order_number: string;
  request_date: string;
  beneficiary_name: string;
  beneficiary_email: string;
  product_code: string;
  product_label: string;
  file_path: string;
  expiry_date: string | null;
  is_provisional: number;
  uploaded_at: string;
}

const Certif: React.FC = () => {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editExpiry, setEditExpiry] = useState<string>('');
  
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const fetchCertificates = async () => {
    try {
      const response = await fetch('/api/certificates', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setCertificates(data);
      }
    } catch (err) {
      console.error('Failed to fetch certificates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCertificates();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('target_type', 'certif');
    formData.append('target_id', `cert_${Date.now()}`);
    formData.append('file', file);

    try {
      const response = await fetch('/api/certificates/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Certificat importé et analysé avec succès !' });
        fetchCertificates();
      } else {
        const err = await response.json();
        setMessage({ type: 'error', text: err.message || 'Erreur lors de l\'import' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Impossible de contacter le serveur' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (id: number, orderNum: string) => {
    if (!window.confirm(`ÃŠtes-vous sÃ»r de vouloir supprimer le certificat de la commande ${orderNum} ?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/certificates/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Certificat supprimé avec succès.' });
        fetchCertificates();
      } else {
        const err = await response.json();
        setMessage({ type: 'error', text: err.message || 'Erreur lors de la suppression' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Impossible de contacter le serveur' });
    }
  };

  const handleUpdateExpiry = async (id: number) => {
    try {
      const response = await fetch(`/api/certificates/${id}/expiry`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ expiry_date: editExpiry })
      });

      if (response.ok) {
        setEditingId(null);
        fetchCertificates();
      } else {
        alert('Erreur lors de la mise à jour de la date');
      }
    } catch (err) {
      console.error('Failed to update expiry:', err);
    }
  };

  const formatDate = (isoStr: string | null) => {
    if (!isoStr) return '-';
    if (!isoStr.includes('-')) return isoStr;
    return isoStr.split('-').reverse().join('/');
  };

  const isExpired = (expiryStr: string | null) => {
    if (!expiryStr) return false;
    const expiry = new Date(expiryStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expiry < today;
  };

  return (
    <div className="certif-page">
      <Header />
      
      <main className="container">
        <header className="page-header">
          <div>
            <h1>Gestion des Certificats</h1>
            <p>Importez et suivez les demandes de certificats Certinomis.</p>
          </div>
          
          <div className="upload-container">
            <label className={`upload-button ${uploading ? 'disabled' : ''}`}>
              {uploading ? <Loader2 className="icon animate-spin" /> : <Upload className="icon" />}
              {uploading ? 'Traitement IA...' : 'Importer un PDF'}
              <input 
                type="file" 
                onChange={handleFileUpload} 
                disabled={uploading} 
                style={{ display: 'none' }}
                accept=".pdf"
              />
            </label>
          </div>
        </header>

        {message && (
          <div className={`status-message ${message.type}`}>
            {message.type === 'success' ? <CheckCircle className="icon" /> : <AlertCircle className="icon" />}
            {message.text}
          </div>
        )}

        <section className="cert-list">
          <h2>Demandes récentes</h2>
          
          {loading ? (
            <div className="loading">Chargement...</div>
          ) : certificates.length === 0 ? (
            <div className="empty-state">
              <FileText size={48} />
              <p>Aucun certificat enregistré. Importez un fichier pour commencer.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="cert-table">
                <thead>
                  <tr>
                    <th>NÂ° Commande</th>
                    <th>Date Demande</th>
                    <th>Bénéficiaire</th>
                    <th>Produit</th>
                    <th>Fin Validité</th>
                    <th>Date Import</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {certificates.map((cert) => (
                    <tr key={cert.id} className={isExpired(cert.expiry_date) ? 'expired-row' : ''}>
                      <td className="bold">{cert.order_number}</td>
                      <td>{formatDate(cert.request_date)}</td>
                      <td>
                        <div className="beneficiary">
                          <span className="name">{cert.beneficiary_name}</span>
                          <span className="email">{cert.beneficiary_email}</span>
                        </div>
                      </td>
                      <td>
                        <div className="product">
                          <span className="label">{cert.product_label}</span>
                          <span className="code">{cert.product_code}</span>
                        </div>
                      </td>
                      <td>
                        {editingId === cert.id ? (
                          <div className="expiry-edit">
                            <input 
                              type="date" 
                              value={editExpiry} 
                              onChange={(e) => setEditExpiry(e.target.value)}
                              autoFocus
                            />
                            <div className="edit-actions">
                              <button onClick={() => handleUpdateExpiry(cert.id)} className="confirm-mini" title="Enregistrer">
                                <Check size={14} />
                              </button>
                              <button onClick={() => setEditingId(null)} className="cancel-mini" title="Annuler">
                                <CloseIcon size={14} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div 
                            className={`expiry-display ${isExpired(cert.expiry_date) ? 'expired' : ''} ${cert.is_provisional ? 'provisional' : ''}`} 
                            onClick={() => {
                              setEditingId(cert.id);
                              setEditExpiry(cert.expiry_date || '');
                            }}
                            title={cert.is_provisional ? "Date provisoire (calculée automatiquement)" : "Date validée"}
                          >
                            {cert.is_provisional ? <Hourglass size={14} className="icon-provisional" /> : <Calendar size={14} className="icon" />}
                            <span>{formatDate(cert.expiry_date)}</span>
                            <Edit2 size={12} className="edit-icon" />
                          </div>
                        )}
                      </td>
                      <td className="date">{new Date(cert.uploaded_at).toLocaleString('fr-FR')}</td>
                      <td>
                        <div className="actions">
                          <a 
                            href={`/${cert.file_path}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="view-btn"
                            title="Voir le PDF"
                          >
                            <Eye size={16} />
                            <span>Voir</span>
                          </a>
                          {user.role === 'admin' && (
                            <button 
                              onClick={() => handleDelete(cert.id, cert.order_number)}
                              className="delete-btn"
                              title="Supprimer ce certificat"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <style>{`
        .certif-page {
          min-height: 100vh;
          background: #f8fafc;
        }
        .container {
          max-width: 1300px;
          margin: 0 auto;
          padding: 40px 20px;
        }
        .page-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 40px;
          background: white;
          padding: 30px;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .page-header h1 {
          font-size: 28px;
          color: #1e293b;
          margin-bottom: 5px;
        }
        .page-header p {
          color: #64748b;
        }
        .upload-button {
          background: var(--primary-color, #e11d48);
          color: white;
          padding: 12px 24px;
          border-radius: 8px;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .upload-button:hover:not(.disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 6px -1px rgba(225, 29, 72, 0.3);
          opacity: 0.9;
        }
        .upload-button.disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .status-message {
          padding: 15px 20px;
          border-radius: 8px;
          margin-bottom: 25px;
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 500;
        }
        .status-message.success {
          background: #f0fdf4;
          color: #166534;
          border: 1px solid #bbf7d0;
        }
        .status-message.error {
          background: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }
        .cert-list h2 {
          font-size: 20px;
          color: #334155;
          margin-bottom: 20px;
        }
        .table-container {
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .cert-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .cert-table th {
          background: #f1f5f9;
          padding: 15px 20px;
          font-weight: 600;
          color: #475569;
          font-size: 14px;
        }
        .cert-table td {
          padding: 18px 20px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: middle;
        }
        .expired-row {
          background: #fff1f2;
        }
        .bold { font-weight: 700; color: #1e293b; }
        .beneficiary {
          display: flex;
          flex-direction: column;
        }
        .beneficiary .name {
          font-weight: 600;
          color: #1e293b;
        }
        .beneficiary .email {
          font-size: 13px;
          color: #64748b;
        }
        .product {
          display: flex;
          flex-direction: column;
        }
        .product .label {
          font-weight: 500;
          color: #1e293b;
        }
        .product .code {
          font-size: 12px;
          background: #f1f5f9;
          padding: 2px 6px;
          border-radius: 4px;
          width: fit-content;
          margin-top: 4px;
          color: #475569;
        }
        .expiry-display {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid transparent;
          width: fit-content;
          font-weight: 500;
          color: #475569;
        }
        .expiry-display:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .expiry-display .icon {
          color: #94a3b8;
        }
        .expiry-display.provisional {
          color: #d97706;
          background: #fffbeb;
          border-color: #fcd34d;
        }
        .expiry-display.provisional .icon-provisional {
          color: #f59e0b;
        }
        .expiry-display.expired {
          color: #e11d48;
          background: #ffe4e6;
          border-color: #fecaca;
        }
        .expiry-display .edit-icon {
          opacity: 0;
          transition: opacity 0.2s;
          color: #94a3b8;
        }
        .expiry-display:hover .edit-icon {
          opacity: 1;
        }
        .expiry-edit {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .expiry-edit input {
          padding: 5px 8px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          font-size: 13px;
          outline: none;
        }
        .expiry-edit input:focus {
          border-color: var(--primary-color, #e11d48);
        }
        .edit-actions {
          display: flex;
          gap: 5px;
        }
        .confirm-mini, .cancel-mini {
          padding: 2px 8px;
          border-radius: 4px;
          border: 1px solid transparent;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .confirm-mini {
          background: #22c55e;
          color: white;
        }
        .cancel-mini {
          background: #f1f5f9;
          color: #64748b;
          border-color: #cbd5e1;
        }
        .date {
          color: #94a3b8;
          font-size: 13px;
        }
        .view-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #f1f5f9;
          color: #475569;
          padding: 6px 12px;
          border-radius: 6px;
          text-decoration: none;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.2s;
          width: fit-content;
        }
        .view-btn:hover {
          background: #e2e8f0;
          color: #1e293b;
        }
        .actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .delete-btn {
          background: #fef2f2;
          color: #ef4444;
          border: 1px solid #fee2e2;
          padding: 6px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s;
        }
        .delete-btn:hover {
          background: #fee2e2;
          color: #dc2626;
        }
        .empty-state {
          background: white;
          padding: 60px;
          text-align: center;
          border-radius: 12px;
          color: #94a3b8;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 15px;
        }
        .loading {
          text-align: center;
          padding: 40px;
          color: #64748b;
        }
      `}</style>
    </div>
  );
};

export default Certif;

