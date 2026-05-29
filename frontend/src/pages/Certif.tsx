import React, { useState, useEffect, useRef } from 'react';
import Header from '../components/Header';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Eye, Trash2, Calendar, Edit2, Check, X as CloseIcon, Hourglass, Search, RefreshCw, ChevronDown } from 'lucide-react';

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
  sedit_number: string;
  is_provisional: number;
  observations: string;
  uploaded_at: string;
  renewal_status: string | null;
  renewal_comment: string;
}

const authHeaders = (): HeadersInit => ({
  'Authorization': `Bearer ${localStorage.getItem('token')}`
});

const Certif: React.FC = () => {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [batchUploading, setBatchUploading] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ total: 0, processed: 0, success: 0, error: 0 });
  const [batchDetails, setBatchDetails] = useState<Array<{file: string; status: string; message?: string}>>([]);
  const [showManualForm, setShowManualForm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [newCertificate, setNewCertificate] = useState<Partial<Certificate>>({
    order_number: '',
    request_date: new Date().toISOString().split('T')[0],
    beneficiary_name: '',
    beneficiary_email: '',
    product_code: '',
    product_label: '',
    expiry_date: '',
    sedit_number: '',
    is_provisional: 1,
    observations: ''
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingCertificate, setEditingCertificate] = useState<Partial<Certificate> | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showArchives, setShowArchives] = useState<boolean>(false);
  const [sortKey, setSortKey] = useState<keyof Certificate>('request_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [alertFilter, setAlertFilter] = useState<'expired' | 'soon' | null>(null);
  const [newCertFile, setNewCertFile] = useState<File | null>(null);
  const [editFile, setEditFile] = useState<File | null>(null);
  const [openActionMenu, setOpenActionMenu] = useState<number | null>(null);
  const [nonRenewalModal, setNonRenewalModal] = useState<{ id: number; orderNum: string } | null>(null);
  const [nonRenewalComment, setNonRenewalComment] = useState<string>('');
  const [viewer, setViewer] = useState<{ url: string; title: string } | null>(null);
  const actionMenuRef = useRef<HTMLDivElement>(null);

  const isExpiringSoon = (expiryStr: string | null, renewal_status: string | null) => {
    if (!expiryStr || renewal_status === 'en_cours' || renewal_status === 'renouvelé' || renewal_status === 'non_renouvelé') return false;
    const now = new Date(); now.setHours(0,0,0,0);
    const in3Months = new Date(now); in3Months.setMonth(now.getMonth() + 3);
    const expiry = new Date(expiryStr);
    return expiry >= now && expiry <= in3Months;
  };

  const isAlertExpired = (expiryStr: string | null, renewal_status: string | null) => {
    if (!expiryStr || renewal_status === 'en_cours' || renewal_status === 'renouvelé' || renewal_status === 'non_renouvelé') return false;
    const expiry = new Date(expiryStr);
    const today = new Date(); today.setHours(0,0,0,0);
    return expiry < today;
  };

  const expiredCount = certificates.filter(c => isAlertExpired(c.expiry_date, c.renewal_status)).length;
  const soonCount = certificates.filter(c => isExpiringSoon(c.expiry_date, c.renewal_status)).length;

  const handleRenewalStatus = async (id: number, status: string, comment?: string) => {
    try {
      await fetch(`/api/certificates/${id}/renewal`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ renewal_status: status, renewal_comment: comment || '' })
      });
      await fetchCertificates();
      setOpenActionMenu(null);
    } catch {
      setMessage({ type: 'error', text: 'Impossible de mettre à jour le statut' });
    }
  };

  const formatSortDate = (value: string | null) => {
    if (!value) return -Infinity;
    const d = new Date(value);
    return isNaN(d.getTime()) ? -Infinity : d.getTime();
  };

  const sortCertificates = (certs: Certificate[]) => {
    const sorted = [...certs];
    sorted.sort((a, b) => {
      let aValue: any = a[sortKey];
      let bValue: any = b[sortKey];

      if (['request_date', 'expiry_date', 'uploaded_at'].includes(sortKey)) {
        aValue = formatSortDate(a[sortKey] as string | null);
        bValue = formatSortDate(b[sortKey] as string | null);
      } else {
        aValue = (aValue || '').toString().toLowerCase();
        bValue = (bValue || '').toString().toLowerCase();
      }

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  };

  const handleSort = (key: keyof Certificate) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const filterAndSortCertificates = () => {
    const q = searchQuery.trim().toLowerCase();
    let result = certificates.filter((cert) => {
      const matchSearch =
        !q ||
        cert.beneficiary_name?.toLowerCase().includes(q) ||
        cert.beneficiary_email?.toLowerCase().includes(q) ||
        cert.order_number?.toLowerCase().includes(q) ||
        cert.product_label?.toLowerCase().includes(q) ||
        cert.observations?.toLowerCase().includes(q);

      if (!matchSearch) return false;

      if (alertFilter === 'expired') return isAlertExpired(cert.expiry_date, cert.renewal_status);
      if (alertFilter === 'soon') return isExpiringSoon(cert.expiry_date, cert.renewal_status);

      if (!showArchives && cert.renewal_status) return false;

      return true;
    });
    return sortCertificates(result);
  };

  const filteredCertificates = filterAndSortCertificates();

  const startEdit = (cert: Certificate) => {
    setEditingId(cert.id);
    setEditingCertificate({
      order_number: cert.order_number,
      request_date: cert.request_date,
      beneficiary_name: cert.beneficiary_name,
      beneficiary_email: cert.beneficiary_email,
      product_code: cert.product_code,
      product_label: cert.product_label,
      expiry_date: cert.expiry_date,
      sedit_number: cert.sedit_number,
      is_provisional: cert.is_provisional,
      observations: cert.observations
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingCertificate(null);
  };

  const handleEditChange = (field: keyof Certificate, value: string) => {
    setEditingCertificate((prev) => prev ? { ...prev, [field]: value } : prev);
  };

  const saveEdit = async () => {
    if (!editingId || !editingCertificate) return;

    setUploading(true);
    try {
      const payload = {
        ...editingCertificate,
        is_provisional: editingCertificate.expiry_date ? 0 : editingCertificate.is_provisional
      };
      const response = await fetch(`/api/certificates/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        if (editFile) {
          const fd = new FormData();
          fd.append('file', editFile);
          await fetch(`/api/certificates/${editingId}/file`, { method: 'POST', headers: authHeaders(), body: fd });
          setEditFile(null);
        }
        setMessage({ type: 'success', text: 'Certificat mis à jour avec succès.' });
        await fetchCertificates();
        cancelEdit();
      } else {
        const err = await response.json();
        setMessage({ type: 'error', text: err.message || 'Erreur lors de la mise à jour du certificat' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Impossible de contacter le serveur pour la mise à jour' });
    } finally {
      setUploading(false);
    }
  };

  const fetchCertificates = async () => {
    try {
      const response = await fetch('/api/certificates', { headers: authHeaders() });
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

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (openActionMenu !== null && actionMenuRef.current && !actionMenuRef.current.contains(e.target as Node)) {
        setOpenActionMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openActionMenu]);

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
        headers: authHeaders(),
        body: formData
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Certificat importé et analysé avec succès !' });
        fetchCertificates();
      } else {
        const err = await response.json();
        setMessage({ type: 'error', text: err.message || "Erreur lors de l'import" });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Impossible de contacter le serveur' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setBatchUploading(true);
    setMessage(null);
    setBatchDetails([]);
    setBatchProgress({ total: files.length, processed: 0, success: 0, error: 0 });

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const response = await fetch('/api/certificates/upload-multiple', {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        const total = files.length;
        const successCount = data.results.filter((r: any) => r.status === 'ok').length;
        const errorCount = data.results.filter((r: any) => r.status !== 'ok').length;

        setBatchProgress({ total, processed: total, success: successCount, error: errorCount });
        setBatchDetails(data.results);
        setMessage({ type: 'success', text: `${successCount} PDF importés, ${errorCount} erreurs.` });
        await fetchCertificates();
      } else {
        const err = await response.json();
        setBatchProgress((prev) => ({ ...prev, processed: files.length, error: files.length }));
        setMessage({ type: 'error', text: err.message || 'Erreur lors de l\'import en lot' });
      }
    } catch (err: any) {
      setBatchProgress((prev) => ({ ...prev, processed: files.length, error: files.length }));
      const errorMsg = err?.message || String(err);
      setMessage({ type: 'error', text: `Impossible de contacter le serveur (import en lot) : ${errorMsg}` });
    } finally {
      setBatchUploading(false);
      e.target.value = '';
    }
  };

  const handleManualChange = (field: keyof Certificate, value: string | number) => {
    setNewCertificate((prev) => ({ ...prev, [field]: value }));
  };

  const handleManualAdd = async () => {
    if (!newCertificate.beneficiary_name?.trim() && !newCertificate.order_number?.trim()) {
      setMessage({ type: 'error', text: 'Veuillez renseigner au minimum un nom de bénéficiaire ou un numéro de commande.' });
      return;
    }
    setUploading(true);
    setMessage(null);

    try {
      const payload = {
        order_number: newCertificate.order_number || '',
        request_date: newCertificate.request_date || new Date().toISOString().split('T')[0],
        beneficiary_name: newCertificate.beneficiary_name || '',
        beneficiary_email: newCertificate.beneficiary_email || '',
        product_code: newCertificate.product_code || '',
        product_label: newCertificate.product_label || '',
        expiry_date: newCertificate.expiry_date || null,
        sedit_number: newCertificate.sedit_number || '',
        is_provisional: Number(newCertificate.is_provisional ?? 1),
        observations: newCertificate.observations || ''
      };

      const response = await fetch('/api/certificates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const created = await response.json();
        if (newCertFile) {
          const fd = new FormData();
          fd.append('file', newCertFile);
          await fetch(`/api/certificates/${created.id}/file`, { method: 'POST', headers: authHeaders(), body: fd });
          setNewCertFile(null);
        }
        setMessage({ type: 'success', text: 'Certificat ajouté manuellement avec succès.' });
        setShowManualForm(false);
        setNewCertificate({
          order_number: '',
          request_date: new Date().toISOString().split('T')[0],
          beneficiary_name: '',
          beneficiary_email: '',
          product_code: '',
          product_label: '',
          expiry_date: '',
          sedit_number: '',
          is_provisional: 1,
          observations: ''
        });
        fetchCertificates();
      } else {
        const err = await response.json();
        setMessage({ type: 'error', text: err.message || 'Erreur ajout manuel' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Impossible de contacter le serveur (ajout manuel)' });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number, orderNum: string) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer le certificat de la commande ${orderNum} ?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/certificates/${id}`, {
        method: 'DELETE',
        headers: authHeaders()
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

  const formatDate = (dateValue: string | Date | null) => {
    if (!dateValue) return '-';

    // Handle Date objects from PostgreSQL
    if (dateValue instanceof Date) {
      const year = dateValue.getFullYear();
      const month = String(dateValue.getMonth() + 1).padStart(2, '0');
      const day = String(dateValue.getDate()).padStart(2, '0');
      return `${day}/${month}/${year}`;
    }

    // Handle ISO strings (YYYY-MM-DD or full ISO with timestamp)
    if (typeof dateValue === 'string') {
      if (!dateValue.includes('-')) return dateValue;
      // Extract only the date part (YYYY-MM-DD) from full ISO strings
      const dateOnly = dateValue.split('T')[0];
      return dateOnly.split('-').reverse().join('/');
    }

    return '-';
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

      <main className="certif-container">
        <header className="page-header">
          <div>
            <h1>Gestion des Certificats</h1>
            <p>Importez et suivez les demandes de certificats Certinomis.</p>
          </div>

          <div className="upload-container">
            <button
              className={`edit-mode-btn ${editMode ? 'active' : ''}`}
              onClick={() => { setEditMode(prev => !prev); if (editMode) { setShowManualForm(false); cancelEdit(); } }}
            >
              <Edit2 size={15} />
              {editMode ? 'Lecture seule' : 'Modifier'}
            </button>
            {editMode && (
              <>
                <label className={`upload-button ${uploading ? 'disabled' : ''}`}>
                  {uploading ? <Loader2 className="icon animate-spin" /> : <Upload className="icon" />}
                  {uploading ? 'Traitement en cours...' : 'Importer un PDF'}
                  <input type="file" onChange={handleFileUpload} disabled={uploading} style={{ display: 'none' }} accept=".pdf" />
                </label>
                <label className={`upload-button ${batchUploading ? 'disabled' : ''}`}>
                  {batchUploading ? <Loader2 className="icon animate-spin" /> : <Upload className="icon" />}
                  {batchUploading ? 'Traitement en cours...' : 'Import en lot'}
                  <input type="file" onChange={handleBatchUpload} disabled={batchUploading} style={{ display: 'none' }} accept=".pdf" multiple />
                </label>
                <button className="upload-button" onClick={() => setShowManualForm((prev) => !prev)}>
                  <Edit2 className="icon" />
                  {showManualForm ? 'Fermer formulaire' : 'Ajouter un certificat'}
                </button>
              </>
            )}
          </div>
        </header>

        {message && (
          <div className={`status-message ${message.type}`}>
            {message.type === 'success' ? <CheckCircle className="icon" /> : <AlertCircle className="icon" />}
            {message.text}
          </div>
        )}

        {(expiredCount > 0 || soonCount > 0) && (
          <div className="alert-zone">
            {expiredCount > 0 && (
              <button
                className={`alert-card alert-expired ${alertFilter === 'expired' ? 'active' : ''}`}
                onClick={() => setAlertFilter(alertFilter === 'expired' ? null : 'expired')}
              >
                <AlertCircle size={20} />
                <div>
                  <div className="alert-count">{expiredCount}</div>
                  <div className="alert-label">certificat{expiredCount > 1 ? 's' : ''} expiré{expiredCount > 1 ? 's' : ''}</div>
                </div>
              </button>
            )}
            {soonCount > 0 && (
              <button
                className={`alert-card alert-soon ${alertFilter === 'soon' ? 'active' : ''}`}
                onClick={() => setAlertFilter(alertFilter === 'soon' ? null : 'soon')}
              >
                <Hourglass size={20} />
                <div>
                  <div className="alert-count">{soonCount}</div>
                  <div className="alert-label">à renouveler dans 3 mois</div>
                </div>
              </button>
            )}
            {alertFilter && (
              <button className="alert-reset" onClick={() => setAlertFilter(null)}>
                <CloseIcon size={14} /> Voir tous
              </button>
            )}
          </div>
        )}

        {nonRenewalModal && (
          <div className="modal-overlay">
            <div className="modal-box">
              <h3>Non renouvelé — motif</h3>
              <p>Commande : <strong>{nonRenewalModal.orderNum}</strong></p>
              <textarea
                className="modal-textarea"
                placeholder="Raison du non-renouvellement…"
                value={nonRenewalComment}
                onChange={(e) => setNonRenewalComment(e.target.value)}
                rows={4}
                autoFocus
              />
              <div className="modal-actions">
                <button className="modal-confirm" onClick={async () => {
                  await handleRenewalStatus(nonRenewalModal.id, 'non_renouvelé', nonRenewalComment);
                  setNonRenewalModal(null);
                  setNonRenewalComment('');
                }}>Confirmer</button>
                <button className="modal-cancel" onClick={() => { setNonRenewalModal(null); setNonRenewalComment(''); }}>Annuler</button>
              </div>
            </div>
          </div>
        )}

        {viewer && (
          <div className="viewer-overlay" onClick={() => setViewer(null)}>
            <div className="viewer-box" onClick={(e) => e.stopPropagation()}>
              <div className="viewer-header">
                <span className="viewer-title"><FileText size={16} /> {viewer.title}</span>
                <div className="viewer-actions">
                  <a href={viewer.url} target="_blank" rel="noopener noreferrer" className="viewer-link" title="Ouvrir dans un nouvel onglet">
                    <Eye size={15} /> Onglet
                  </a>
                  <a href={viewer.url} download className="viewer-link" title="Télécharger">
                    <Upload size={15} style={{ transform: 'rotate(180deg)' }} /> Télécharger
                  </a>
                  <button className="viewer-close" onClick={() => setViewer(null)} title="Fermer">
                    <CloseIcon size={18} />
                  </button>
                </div>
              </div>
              <iframe className="viewer-frame" src={viewer.url} title={viewer.title} />
            </div>
          </div>
        )}

        {editMode && showManualForm && (
          <div className="manual-form">
            <h3>Ajouter un certificat manuellement</h3>
            <div className="manual-grid">
              <input type="text" placeholder="N° Commande" value={newCertificate.order_number || ''} onChange={(e) => handleManualChange('order_number', e.target.value)} />
              <input type="text" placeholder="N° Sedit" value={newCertificate.sedit_number || ''} onChange={(e) => handleManualChange('sedit_number', e.target.value)} />
              <input type="date" placeholder="Date demande" value={newCertificate.request_date || ''} onChange={(e) => handleManualChange('request_date', e.target.value)} />
              <input type="text" placeholder="Nom bénéficiaire" value={newCertificate.beneficiary_name || ''} onChange={(e) => handleManualChange('beneficiary_name', e.target.value)} />
              <input type="email" placeholder="Email bénéficiaire" value={newCertificate.beneficiary_email || ''} onChange={(e) => handleManualChange('beneficiary_email', e.target.value)} />
              <input type="text" placeholder="Code produit" value={newCertificate.product_code || ''} onChange={(e) => handleManualChange('product_code', e.target.value)} />
              <input type="text" placeholder="Libellé produit" value={newCertificate.product_label || ''} onChange={(e) => handleManualChange('product_label', e.target.value)} />
              <input type="date" placeholder="Date fin validité" value={newCertificate.expiry_date || ''} onChange={(e) => handleManualChange('expiry_date', e.target.value)} />
              <textarea placeholder="Observations" value={newCertificate.observations || ''} onChange={(e) => handleManualChange('observations', e.target.value)} rows={2} style={{ gridColumn: '1 / -1' }} />
            </div>
            <div className="form-file-row">
              <label className="form-file-label">
                <Upload size={14} />
                {newCertFile ? newCertFile.name : 'Joindre un PDF (optionnel)'}
                <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={(e) => setNewCertFile(e.target.files?.[0] || null)} />
              </label>
              {newCertFile && <button className="form-file-clear" onClick={() => setNewCertFile(null)}><CloseIcon size={13} /></button>}
            </div>
            <button className="upload-button" onClick={handleManualAdd} disabled={uploading}>
              {uploading ? 'Enregistrement...' : 'Enregistrer le certificat'}
            </button>
          </div>
        )}

        {batchProgress.total > 0 && (
          <div className="batch-progress-block">
            <h3>Import en lot : {batchProgress.processed}/{batchProgress.total}</h3>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${Math.round((batchProgress.processed / batchProgress.total) * 100)}%` }}
              />
            </div>
            <div className="batch-metrics">
              <span>{batchProgress.success} réussis</span>
              <span>{batchProgress.error} erreurs</span>
            </div>
            {batchDetails.length > 0 && (
              <div className="batch-details">
                {batchDetails.map((item) => (
                  <div key={item.file} className={`batch-detail ${item.status}`}>
                    <strong>{item.file}</strong> - {item.status} {item.message ? `: ${item.message}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <section className="cert-list">
          <div className="search-bar-row">
            <div className="search-input-wrapper">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                className="search-input"
                placeholder="Rechercher par nom, email, commande…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="search-clear" onClick={() => setSearchQuery('')} title="Effacer">
                  <CloseIcon size={14} />
                </button>
              )}
            </div>
            <button
              className={`renewal-filter-toggle ${showArchives ? 'active' : ''}`}
              onClick={() => setShowArchives((prev) => !prev)}
              title="Afficher aussi les certificats archivés (renouvellement renseigné)"
            >
              {showArchives ? 'Masquer les archives' : 'Voir les archives'}
            </button>
            {certificates.length > 0 && (
              <span className="search-count">
                {filteredCertificates.length} / {certificates.length} certificat{certificates.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
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
              <div className="table-scroll">
              <table className="cert-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('order_number')}>
                      N° Commande / Sédit {sortKey === 'order_number' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className="sortable" onClick={() => handleSort('request_date')}>
                      Date Demande {sortKey === 'request_date' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className="sortable" onClick={() => handleSort('beneficiary_name')}>
                      Bénéficiaire {sortKey === 'beneficiary_name' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className="sortable" onClick={() => handleSort('product_label')}>
                      Produit {sortKey === 'product_label' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className="sortable" onClick={() => handleSort('expiry_date')}>
                      Fin Validité {sortKey === 'expiry_date' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th>Actions</th>
                    <th className="sortable" onClick={() => handleSort('observations')}>
                      Observations {sortKey === 'observations' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCertificates.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Aucun certificat ne correspond à votre recherche.</td></tr>
                  ) : filteredCertificates.map((cert) => (
                    <tr key={cert.id} className={isExpired(cert.expiry_date) ? 'expired-row' : ''}>
                      <td>
                        {editingId === cert.id ? (
                          <>
                            <input
                              type="text"
                              value={editingCertificate?.order_number || ''}
                              onChange={(e) => handleEditChange('order_number', e.target.value)}
                              className="inline-input"
                              placeholder="N° Commande"
                            />
                            <input
                              type="text"
                              value={editingCertificate?.sedit_number || ''}
                              onChange={(e) => handleEditChange('sedit_number', e.target.value)}
                              className="inline-input sedit-input"
                              placeholder="N° Sedit"
                            />
                          </>
                        ) : (
                          <div className="order-cell">
                            <span className="order-number">{cert.order_number}</span>
                            {cert.sedit_number && <span className="sedit-number">{cert.sedit_number}</span>}
                          </div>
                        )}
                      </td>
                      <td>
                        {editingId === cert.id ? (
                          <input
                            type="date"
                            value={editingCertificate?.request_date || ''}
                            onChange={(e) => handleEditChange('request_date', e.target.value)}
                            className="inline-input"
                          />
                        ) : (
                          formatDate(cert.request_date)
                        )}
                      </td>
                      <td>
                        {editingId === cert.id ? (
                          <>
                            <input
                              type="text"
                              value={editingCertificate?.beneficiary_name || ''}
                              onChange={(e) => handleEditChange('beneficiary_name', e.target.value)}
                              className="inline-input"
                              placeholder="Nom"
                            />
                            <input
                              type="email"
                              value={editingCertificate?.beneficiary_email || ''}
                              onChange={(e) => handleEditChange('beneficiary_email', e.target.value)}
                              className="inline-input"
                              placeholder="Email"
                            />
                          </>
                        ) : (
                          <div className="beneficiary">
                            <span className="name">{cert.beneficiary_name}</span>
                            <span className="email">{cert.beneficiary_email}</span>
                          </div>
                        )}
                      </td>
                      <td>
                        {editingId === cert.id ? (
                          <>
                            <input
                              type="text"
                              value={editingCertificate?.product_label || ''}
                              onChange={(e) => handleEditChange('product_label', e.target.value)}
                              className="inline-input"
                              placeholder="Libellé"
                            />
                            <input
                              type="text"
                              value={editingCertificate?.product_code || ''}
                              onChange={(e) => handleEditChange('product_code', e.target.value)}
                              className="inline-input"
                              placeholder="Code"
                            />
                          </>
                        ) : (
                          <div className="product">
                            <span className="label">{cert.product_label}</span>
                            <span className="code">{cert.product_code}</span>
                          </div>
                        )}
                      </td>
                      <td>
                        {editingId === cert.id ? (
                          <input
                            type="date"
                            value={editingCertificate?.expiry_date || ''}
                            onChange={(e) => handleEditChange('expiry_date', e.target.value)}
                            className="inline-input"
                          />
                        ) : (
                          <div
                            className={`expiry-display ${isExpired(cert.expiry_date) ? 'expired' : ''} ${cert.is_provisional ? 'provisional' : ''} ${!editMode ? 'readonly' : ''}`}
                            onClick={() => {
                              if (!editMode) return;
                              setEditingId(cert.id);
                              setEditingCertificate({
                                order_number: cert.order_number,
                                request_date: cert.request_date,
                                beneficiary_name: cert.beneficiary_name,
                                beneficiary_email: cert.beneficiary_email,
                                product_code: cert.product_code,
                                product_label: cert.product_label,
                                expiry_date: cert.expiry_date,
                                sedit_number: cert.sedit_number,
                                is_provisional: cert.is_provisional,
                                observations: cert.observations
                              });
                            }}
                            title={cert.is_provisional ? 'Date provisoire (calculée automatiquement)' : 'Date validée'}
                          >
                            {cert.is_provisional ? <Hourglass size={14} className="icon-provisional" /> : <Calendar size={14} className="icon" />}
                            <span>{formatDate(cert.expiry_date)}</span>
                            {editMode && <Edit2 size={12} className="edit-icon" />}
                          </div>
                        )}
                      </td>
                      <td>
                        <div className="actions">
                          {editingId === cert.id ? (
                            <>
                              <label className="inline-file-label" title="Joindre un PDF">
                                <Upload size={14} />
                                {editFile ? <span className="inline-file-name">{editFile.name}</span> : null}
                                <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={(e) => setEditFile(e.target.files?.[0] || null)} />
                              </label>
                              {editFile && <button className="cancel-btn" title="Retirer le fichier" onClick={() => setEditFile(null)}><CloseIcon size={14} /></button>}
                              <button onClick={saveEdit} className="confirm-btn" title="Enregistrer" disabled={uploading}>
                                <Check size={16} />
                              </button>
                              <button onClick={() => { cancelEdit(); setEditFile(null); }} className="cancel-btn" title="Annuler" disabled={uploading}>
                                <CloseIcon size={16} />
                              </button>
                            </>
                          ) : (
                            <>
                              {cert.file_path && (
                                <button
                                  type="button"
                                  onClick={() => setViewer({ url: `/api/${cert.file_path}`, title: `Certificat — ${cert.order_number}` })}
                                  className="view-btn"
                                  title="Voir le PDF"
                                >
                                  <Eye size={16} />
                                  <span>Voir</span>
                                </button>
                              )}
                              {editMode && (
                                <>
                                  <button onClick={() => startEdit(cert)} className="edit-btn" title="Modifier le certificat">
                                    <Edit2 size={16} />
                                  </button>
                                  <div className="action-menu-wrapper" ref={openActionMenu === cert.id ? actionMenuRef : null}>
                                    <button className="action-menu-btn" title="Actions renouvellement" onClick={() => setOpenActionMenu(openActionMenu === cert.id ? null : cert.id)}>
                                      <RefreshCw size={14} />
                                      <ChevronDown size={12} />
                                    </button>
                                    {openActionMenu === cert.id && (
                                      <div className="action-dropdown">
                                        <button onClick={() => handleRenewalStatus(cert.id, 'en_cours')}>Renouvellement en cours</button>
                                        <button onClick={() => handleRenewalStatus(cert.id, 'renouvelé')}>Renouvelé</button>
                                        <button onClick={() => { setOpenActionMenu(null); setNonRenewalModal({ id: cert.id, orderNum: cert.order_number }); }}>Non renouvelé</button>
                                        {cert.renewal_status && (
                                          <button className="action-reset" onClick={() => handleRenewalStatus(cert.id, '')}>Réinitialiser statut</button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <button onClick={() => handleDelete(cert.id, cert.order_number)} className="delete-btn" title="Supprimer ce certificat">
                                    <Trash2 size={16} />
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td>
                        {editingId === cert.id ? (
                          <textarea
                            value={editingCertificate?.observations || ''}
                            onChange={(e) => handleEditChange('observations', e.target.value)}
                            className="inline-input"
                            rows={2}
                            placeholder="Observations"
                          />
                        ) : (
                          <div>
                            {cert.renewal_status && (
                              <span className={`renewal-badge renewal-${cert.renewal_status.replace('_', '-')}`}>
                                {cert.renewal_status === 'en_cours' ? 'Renouvellement en cours' : cert.renewal_status === 'renouvelé' ? 'Renouvelé' : 'Non renouvelé'}
                              </span>
                            )}
                            {cert.renewal_status === 'non_renouvelé' && cert.renewal_comment && (
                              <div className="renewal-comment">{cert.renewal_comment}</div>
                            )}
                            {cert.observations || (!cert.renewal_status ? '-' : '')}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </section>
      </main>

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .certif-page {
          min-height: 100vh;
          background: #f8fafc;
        }
        .certif-container {
          width: 100%;
          margin: 0;
          padding: 30px 16px;
        }
        .page-header {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 30px;
          background: white;
          padding: 24px;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          box-sizing: border-box;
        }
        .page-header h1 {
          font-size: 28px;
          color: #1e293b;
          margin-bottom: 5px;
        }
        .page-header p {
          color: #64748b;
        }
        .upload-container {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .upload-container > label,
        .upload-container > button {
          margin: 0;
        }
        .edit-mode-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          border: 2px solid var(--primary-color, #e11d48);
          background: white;
          color: var(--primary-color, #e11d48);
          transition: all 0.2s;
        }
        .edit-mode-btn:hover { background: #fff1f2; }
        .edit-mode-btn.active {
          background: var(--primary-color, #e11d48);
          color: white;
        }
        .edit-mode-btn.active:hover { background: #be123c; }
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
          border: none;
          font-size: 14px;
          font-family: inherit;
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
        .search-bar-row {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }
        .search-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          flex: 1;
          max-width: 420px;
        }
        .search-icon {
          position: absolute;
          left: 12px;
          color: #94a3b8;
          pointer-events: none;
        }
        .search-input {
          width: 100%;
          padding: 9px 36px 9px 36px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 14px;
          outline: none;
          background: white;
          color: #1e293b;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .search-input:focus {
          border-color: var(--primary-color, #e11d48);
          box-shadow: 0 0 0 3px rgba(225, 29, 72, 0.1);
        }
        .inline-input {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px;
          font-size: 13px;
          margin: 2px 0;
          color: #0f172a;
          background: white;
        }
        .inline-input:focus {
          outline: 2px solid var(--primary-color, #e11d48);
          border-color: var(--primary-color, #e11d48);
        }
        .confirm-btn,
        .cancel-btn,
        .edit-btn,
        .delete-btn,
        .view-btn {
          background: transparent;
          border: none;
          cursor: pointer;
          color: #475569;
          margin-left: 4px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 6px;
          border-radius: 6px;
        }
        .confirm-btn:hover,
        .edit-btn:hover,
        .view-btn:hover {
          background: #dcfdfd;
          color: #0f766e;
        }
        .cancel-btn:hover {
          background: #fff1f2;
          color: #991b1b;
        }
        .search-clear {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          cursor: pointer;
          color: #94a3b8;
          display: flex;
          align-items: center;
          padding: 2px;
          border-radius: 4px;
          transition: color 0.15s;
        }
        .search-clear:hover { color: #475569; }
        .search-count {
          font-size: 13px;
          color: #94a3b8;
          white-space: nowrap;
        }
        .renewal-filter-toggle {
          background: #e2e8f0;
          color: #1e293b;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 13px;
          margin-left: 8px;
          font-family: inherit;
        }
        .renewal-filter-toggle.active {
          background: #fde68a;
          border-color: #facc15;
          color: #78350f;
          font-weight: 600;
        }
        .sortable {
          cursor: pointer;
          user-select: none;
          white-space: nowrap;
        }
        .sortable:hover {
          text-decoration: underline;
        }
        .sedit-input {
          min-width: 160px;
        }
        .manual-form {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 18px;
          margin-bottom: 18px;
        }
        .manual-form h3 {
          margin-bottom: 12px;
          color: #0f172a;
        }
        .manual-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }
        .manual-grid input {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
        }
        .manual-grid textarea {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
          font-family: inherit;
        }
        .manual-form button {
          padding: 10px 16px;
          border: none;
          border-radius: 8px;
          background: #0f766e;
          color: white;
          cursor: pointer;
        }
        .form-file-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        .form-file-label {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 14px;
          border: 1px dashed #cbd5e1;
          border-radius: 8px;
          cursor: pointer;
          font-size: 13px;
          color: #475569;
          background: #f8fafc;
          transition: all 0.2s;
        }
        .form-file-label:hover { border-color: #94a3b8; background: #f1f5f9; }
        .form-file-clear {
          background: none;
          border: none;
          cursor: pointer;
          color: #94a3b8;
          padding: 4px;
          display: flex;
          align-items: center;
        }
        .form-file-clear:hover { color: #ef4444; }
        .inline-file-label {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 5px 8px;
          border: 1px dashed #cbd5e1;
          border-radius: 6px;
          cursor: pointer;
          color: #64748b;
          font-size: 12px;
          background: #f8fafc;
          white-space: nowrap;
          transition: all 0.15s;
        }
        .inline-file-label:hover { border-color: #94a3b8; background: #f1f5f9; }
        .inline-file-name {
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-size: 11px;
          color: #0f766e;
        }
        .manual-form button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .batch-progress-block {
          margin: 18px 0;
          padding: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          background: #f8fafc;
        }
        .batch-progress-block h3 {
          margin-bottom: 8px;
          font-size: 14px;
          color: #334155;
        }
        .progress-bar {
          width: 100%;
          height: 10px;
          border-radius: 6px;
          background: #e2e8f0;
          overflow: hidden;
          margin-bottom: 8px;
        }
        .progress-fill {
          height: 100%;
          background: #22c55e;
          transition: width 0.25s ease;
        }
        .batch-metrics {
          display: flex;
          gap: 16px;
          color: #475569;
          margin-bottom: 8px;
        }
        .batch-details {
          max-height: 120px;
          overflow-y: auto;
          border-top: 1px solid #cbd5e1;
          padding-top: 8px;
        }
        .batch-detail {
          font-size: 12px;
          color: #334155;
          line-height: 1.4;
        }
        .batch-detail.error {
          color: #b91c1c;
        }
        .cert-list h2 {
          font-size: 20px;
          color: #334155;
          margin-bottom: 20px;
        }
        .table-container {
          width: 100%;
          background: white;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          overflow: hidden;
          box-sizing: border-box;
        }
        .table-scroll {
          overflow-x: auto;
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
        .order-cell { display: flex; flex-direction: column; gap: 2px; }
        .order-number { font-weight: 700; color: #1e293b; }
        .sedit-number { font-size: 11px; color: #94a3b8; background: #f1f5f9; padding: 1px 6px; border-radius: 4px; width: fit-content; }
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
        .expiry-display.readonly { cursor: default; }
        .expiry-display.readonly:hover { background: transparent !important; border-color: transparent !important; }
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

        /* Alert zone */
        .alert-zone {
          display: flex;
          gap: 12px;
          align-items: center;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .alert-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px 20px;
          border-radius: 10px;
          cursor: pointer;
          border: 2px solid transparent;
          font-family: inherit;
          transition: all 0.2s;
        }
        .alert-expired {
          background: #fff1f2;
          color: #be123c;
          border-color: #fecdd3;
        }
        .alert-expired:hover, .alert-expired.active {
          background: #ffe4e6;
          border-color: #e11d48;
        }
        .alert-soon {
          background: #fffbeb;
          color: #92400e;
          border-color: #fde68a;
        }
        .alert-soon:hover, .alert-soon.active {
          background: #fef3c7;
          border-color: #f59e0b;
        }
        .alert-count {
          font-size: 22px;
          font-weight: 800;
          line-height: 1;
        }
        .alert-label {
          font-size: 12px;
          font-weight: 500;
          margin-top: 2px;
        }
        .alert-reset {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 8px 14px;
          cursor: pointer;
          font-size: 13px;
          color: #475569;
          font-family: inherit;
        }
        .alert-reset:hover { background: #e2e8f0; }
        /* Renewal badges */
        .renewal-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .renewal-en-cours {
          background: #dbeafe;
          color: #1d4ed8;
        }
        .renewal-renouvelé {
          background: #dcfce7;
          color: #15803d;
        }
        .renewal-non-renouvelé {
          background: #f1f5f9;
          color: #475569;
        }
        .renewal-comment {
          font-size: 11px;
          color: #64748b;
          font-style: italic;
          margin-bottom: 4px;
        }
        /* Action dropdown */
        .action-menu-wrapper {
          position: relative;
        }
        .action-menu-btn {
          display: flex;
          align-items: center;
          gap: 3px;
          background: #eff6ff;
          border: 1px solid #bfdbfe;
          color: #1d4ed8;
          padding: 6px 8px;
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .action-menu-btn:hover {
          background: #dbeafe;
        }
        .action-dropdown {
          position: absolute;
          right: 0;
          top: calc(100% + 4px);
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.12);
          z-index: 100;
          min-width: 190px;
          overflow: hidden;
        }
        .action-dropdown button {
          display: block;
          width: 100%;
          text-align: left;
          padding: 10px 14px;
          background: none;
          border: none;
          cursor: pointer;
          font-size: 13px;
          color: #1e293b;
          transition: background 0.15s;
          font-family: inherit;
        }
        .action-dropdown button:hover { background: #f8fafc; }
        .action-dropdown button.action-reset {
          color: #94a3b8;
          border-top: 1px solid #f1f5f9;
          font-size: 12px;
        }
        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.4);
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        /* Visionneuse PDF intégrée */
        .viewer-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15,23,42,0.65);
          z-index: 1100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .viewer-box {
          background: #fff;
          border-radius: 12px;
          width: 980px;
          max-width: 95vw;
          height: 90vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 24px 70px rgba(0,0,0,0.35);
        }
        .viewer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid #e2e8f0;
          background: #f8fafc;
        }
        .viewer-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
          font-weight: 600;
          color: #0f172a;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
        }
        .viewer-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .viewer-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 8px;
          background: #fff;
          border: 1px solid #cbd5e1;
          color: #1e293b;
          font-size: 13px;
          text-decoration: none;
          cursor: pointer;
          transition: background 0.15s;
        }
        .viewer-link:hover { background: #f1f5f9; }
        .viewer-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: #fff;
          color: #64748b;
          cursor: pointer;
          transition: background 0.15s, color 0.15s;
        }
        .viewer-close:hover { background: #fee2e2; color: #b91c1c; }
        .viewer-frame {
          flex: 1;
          width: 100%;
          border: 0;
          background: #525659;
        }
        .modal-box {
          background: white;
          border-radius: 12px;
          padding: 28px;
          width: 420px;
          max-width: 90vw;
          box-shadow: 0 20px 60px rgba(0,0,0,0.2);
        }
        .modal-box h3 { font-size: 18px; color: #0f172a; margin-bottom: 8px; }
        .modal-box p { color: #64748b; font-size: 14px; margin-bottom: 16px; }
        .modal-textarea {
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px;
          font-size: 14px;
          font-family: inherit;
          resize: vertical;
          outline: none;
          margin-bottom: 16px;
        }
        .modal-textarea:focus { border-color: var(--primary-color, #e11d48); box-shadow: 0 0 0 3px rgba(225,29,72,0.1); }
        .modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
        .modal-confirm {
          background: #1e293b;
          color: white;
          border: none;
          padding: 9px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
        }
        .modal-confirm:hover { background: #0f172a; }
        .modal-cancel {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #cbd5e1;
          padding: 9px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
        }
        .modal-cancel:hover { background: #e2e8f0; }

        @media (max-height: 800px) {
          .container { padding: 16px 0; }
          .page-header { padding: 14px 18px; margin-bottom: 14px; }
          .page-header h1 { font-size: 18px; margin-bottom: 2px; }
          .page-header p { font-size: 12px; }
          .upload-button { padding: 8px 14px; font-size: 12px; gap: 6px; }
          .cert-list h2 { font-size: 15px; margin-bottom: 10px; }
          .cert-table th { padding: 8px 10px; font-size: 12px; }
          .cert-table td { padding: 8px 10px; font-size: 12px; }
          .beneficiary .name { font-size: 12px; }
          .beneficiary .email { font-size: 11px; }
          .product .label { font-size: 12px; }
          .product .code { font-size: 10px; }
          .order-number { font-size: 12px; }
          .sedit-number { font-size: 10px; }
          .expiry-display { padding: 3px 6px; font-size: 12px; }
          .alert-zone { gap: 8px; margin-bottom: 12px; }
          .alert-card { padding: 8px 14px; gap: 8px; }
          .alert-count { font-size: 16px; }
          .alert-label { font-size: 11px; }
          .search-bar-row { gap: 8px; margin-bottom: 10px; }
          .search-input { padding: 6px 32px; font-size: 13px; }
          .manual-form { padding: 12px; margin-bottom: 12px; }
          .status-message { padding: 10px 14px; font-size: 13px; margin-bottom: 14px; }
          .renewal-badge { font-size: 10px; padding: 1px 6px; }
          .date { font-size: 11px; }
        }

        @media (max-height: 650px) {
          .container { padding: 8px 0; }
          .page-header { padding: 10px 14px; margin-bottom: 10px; }
          .page-header h1 { font-size: 15px; }
          .page-header p { display: none; }
          .cert-list h2 { display: none; }
          .cert-table th { padding: 5px 8px; font-size: 11px; }
          .cert-table td { padding: 5px 8px; font-size: 11px; }
          .upload-button { padding: 6px 10px; font-size: 11px; }
          .alert-card { padding: 6px 10px; }
          .alert-count { font-size: 14px; }
          .search-input { padding: 5px 28px; font-size: 12px; }
          .expiry-display { padding: 2px 4px; font-size: 11px; }
          .beneficiary .email { display: none; }
          .date { display: none; }
        }
      `}</style>
    </div>
  );
};

export default Certif;
