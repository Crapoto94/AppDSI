import React, { useEffect, useState } from 'react';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';
import {
  ChevronRight, Download, X, Plus, Edit2, Trash2, Search, Package,
  AlertCircle, CheckCircle, Clock, BookOpen, ArrowRight, ListChecks, Tag, Image,
  ShoppingCart, Printer, ChevronLeft, ShoppingBag, Trash, User, Calendar, Building2, Phone, Archive
} from 'lucide-react';
import axios from 'axios';
import DesignationImagesManager from './DesignationImagesManager';

interface ConsumableType {
  id: number;
  name: string;
  display_name: string;
}

interface ConsumableArticle {
  id: number;
  designation?: string;
  article: string;
  code_fabricant?: string;
  ref_commande: string;
  type_id?: number;
  type_name?: string;
  type_display_name?: string;
}

interface ConsumableRequest {
  id: number;
  user_id: number;
  username: string;
  email: string;
  date_commande: string;
  direction: string;
  service: string;
  nom_referent: string;
  tel_complet: string;
  type_consommable: string;
  articles: { id: number; catalog_id?: number; article: string; quantite: number; ref_commande: string }[];
  created_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'ordered';
  order_number?: string;
  tier?: string;
  total_amount_ttc?: number;
  is_school?: boolean;
  user_comment?: string;
  archived: boolean;
}

interface CartItem {
  catalogId: number;
  designation: string;
  article: string;
  codeFabricant: string;
  refCommande: string;
  quantite: number;
}

const CART_STORAGE_KEY = 'consommables_cart';

const ConsommablesManagement: React.FC = () => {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<'requests' | 'catalog' | 'images' | 'recap'>('requests');
  const [requests, setRequests] = useState<ConsumableRequest[]>([]);
  const [catalogArticles, setCatalogArticles] = useState<ConsumableArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(1);
  const [consumableTypes, setConsumableTypes] = useState<ConsumableType[]>([]);
  const [consumableArticles, setConsumableArticles] = useState<ConsumableArticle[]>([]);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<number | null>(null);
  const [editingArticle, setEditingArticle] = useState<ConsumableArticle | null>(null);
  const [showCatalogForm, setShowCatalogForm] = useState(false);
  const [allCatalogDesignations, setAllCatalogDesignations] = useState<string[]>([]);
  const [designations, setDesignations] = useState<string[]>([]);
  const [designationImages, setDesignationImages] = useState<Record<string, { image_path: string }>>({});
  const [showArchived, setShowArchived] = useState(false);
const [adminTab, setAdminTab] = useState<'demandes' | 'commander'>('demandes');
const [selectedDesignation, setSelectedDesignation] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        return data.selectedDesignation || '';
      }
      return '';
    } catch { return ''; }
  });
  const [selectedTypeId, setSelectedTypeId] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        return data.selectedTypeId || 0;
      }
      return 0;
    } catch { return 0; }
  });
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(CART_STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        return Array.isArray(data) ? data : (data.cart || []);
      }
      return [];
    } catch { return []; }
  });

  const [formData, setFormData] = useState({
    date_commande: new Date().toISOString().split('T')[0],
    direction: '',
    service: '',
    nom_referent: user?.username || '',
    tel_complet: '',
  });

  const [catalogFormData, setCatalogFormData] = useState({
    type_id: 0,
    designation: '',
    article: '',
    code_fabricant: '',
    ref_commande: ''
  });

  useEffect(() => {
    const data = { cart, selectedTypeId, selectedDesignation };
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(data));
  }, [cart, selectedTypeId, selectedDesignation]);

  useEffect(() => {
    if (token) {
      loadTypes();
      loadRequests();
    }
  }, [token]);

  useEffect(() => {
    if (activeTab === 'catalog' && token) {
      loadCatalogArticles();
    }
  }, [activeTab, token]);

  useEffect(() => {
    if (token) {
      loadDesignationImages();
    }
  }, [token]);

  const loadRequests = async () => {
    try {
      const response = await axios.get('/api/consumable/requests/all', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRequests(response.data);
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTypes = async () => {
    try {
      setError('');
      const response = await axios.get('/api/consumable/types', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConsumableTypes(response.data);
    } catch (error: any) {
      const errorMsg = error.response?.data?.message || 'Erreur lors du chargement des types';
      setError(errorMsg);
    }
  };

  const loadCatalogArticles = async () => {
    try {
      setError('');
      const response = await axios.get('/api/consumable/admin/catalog/all', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCatalogArticles(response.data);
      const uniqueDesignations = Array.from(new Set(response.data.map((article: ConsumableArticle) => article.designation).filter(Boolean)));
      setAllCatalogDesignations(uniqueDesignations as string[]);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erreur lors du chargement du catalogue';
      setError(errorMsg);
    }
  };

  const loadDesignations = async (typeId: number) => {
    try {
      setError('');
      const response = await axios.get(`/api/consumable/designations/${typeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDesignations(response.data);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Erreur lors du chargement des désignations';
      setError(errorMsg);
    }
  };

  const loadConsumableArticles = async (typeId: number, designation?: string) => {
    try {
      setError('');
      const url = designation
        ? `/api/consumable/articles/${typeId}?designation=${encodeURIComponent(designation)}`
        : `/api/consumable/articles/${typeId}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConsumableArticles(response.data);
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Erreur lors du chargement des articles';
      setError(errorMsg);
    }
  };

  const loadADUserInfo = async () => {
    try {
      const response = await axios.get('/api/ad/my-info', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const { service, direction } = response.data;
      if (service || direction) {
        setFormData(prev => ({
          ...prev,
          service: service || prev.service,
          direction: direction || prev.direction,
        }));
      }
    } catch (error) {
      console.error('Error loading AD info:', error);
    }
  };

  const loadDesignationImages = async () => {
    try {
      const response = await axios.get('/api/consumable/admin/images/all', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const imagesMap: Record<string, { image_path: string }> = {};
      response.data.forEach((img: any) => {
        imagesMap[img.designation] = { image_path: img.image_path };
      });
      setDesignationImages(imagesMap);
    } catch (error) {
      console.error('Error loading images:', error);
    }
  };

  const handleValidateRequest = async (requestId: number) => {
    try {
      await axios.put(`/api/consumable/admin/${requestId}/status`, { status: 'approved' }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      loadRequests();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Erreur lors de la validation');
    }
  };

  const handleDeleteRequest = async (requestId: number) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette demande ?')) return;
    try {
      await axios.delete(`/api/consumable/admin/${requestId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      loadRequests();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Erreur lors de la suppression');
    }
  };

  const handleArchiveRequest = async (requestId: number) => {
    if (!window.confirm('Archiver cette demande ?')) return;
    try {
      await axios.post(`/api/consumable/admin/${requestId}/archive`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      loadRequests();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Erreur lors de l\'archivage');
    }
  };

  const isSkipPrinterType = (typeName: string) => {
    const upper = typeName.toUpperCase();
    return upper.includes('DIVERS') || upper.includes('MONO');
  };

  const handleTypeSelect = async (type: ConsumableType) => {
    setSelectedTypeId(type.id);
    const skip = isSkipPrinterType(type.display_name || type.name);
    if (skip) {
      setSelectedDesignation('');
      await loadConsumableArticles(type.id);
      setStep(4);
    } else {
      await loadDesignations(type.id);
      setSelectedDesignation('');
      setStep(3);
    }
  };

  const handleDesignationSelect = async (designation: string) => {
    setSelectedDesignation(designation);
    await loadConsumableArticles(selectedTypeId, designation);
    setStep(4);
  };

  const selectedTypeName = consumableTypes.find(t => t.id === selectedTypeId)?.display_name || '';
  const currentTypeSkipsPrinter = isSkipPrinterType(selectedTypeName);

  const addToCart = (article: ConsumableArticle, quantite: number) => {
    if (quantite <= 0) return;
    setCart(prev => {
      const existing = prev.find(item => item.catalogId === article.id);
      if (existing) {
        return prev.map(item =>
          item.catalogId === article.id ? { ...item, quantite: item.quantite + quantite } : item
        );
      }
      return [...prev, {
        catalogId: article.id,
        designation: article.designation || '',
        article: article.article,
        codeFabricant: article.code_fabricant || '',
        refCommande: article.ref_commande || '',
        quantite,
      }];
    });
  };

  const removeFromCart = (catalogId: number) => {
    setCart(prev => prev.filter(item => item.catalogId !== catalogId));
  };

  const updateCartQuantity = (catalogId: number, quantite: number) => {
    if (quantite <= 0) {
      removeFromCart(catalogId);
      return;
    }
    setCart(prev => prev.map(item =>
      item.catalogId === catalogId ? { ...item, quantite } : item
    ));
  };

  const clearCart = () => {
    setCart([]);
  };

  const cartTotalItems = cart.reduce((sum, item) => sum + item.quantite, 0);

  const handleSubmit = async () => {
    if (cart.length === 0) {
      setError('Votre panier est vide');
      return;
    }

    const articles = cart.map(item => ({
      id: item.catalogId,
      quantite: item.quantite,
    }));

    try {
      setError('');
      await axios.post('/api/consumable/requests', {
        date_commande: formData.date_commande,
        direction: formData.direction,
        service: formData.service,
        nom_referent: formData.nom_referent,
        tel_complet: formData.tel_complet,
        type_id: selectedTypeId,
        articles,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      alert('Demande créée avec succès');
      setShowForm(false);
      setStep(1);
      clearCart();
      setSelectedTypeId(0);
      setSelectedDesignation('');
      setFormData({
        date_commande: new Date().toISOString().split('T')[0],
        direction: '',
        service: '',
        nom_referent: user?.username || '',
        tel_complet: '',
      });
      loadRequests();
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Erreur lors de la création de la demande';
      setError(errorMsg);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setStep(1);
    clearCart();
    setSelectedTypeId(0);
    setSelectedDesignation('');
    setFormData({
      date_commande: new Date().toISOString().split('T')[0],
      direction: '',
      service: '',
      nom_referent: user?.username || '',
      tel_complet: '',
    });
  };

  const filteredCatalogArticles = catalogArticles.filter(article => {
    const matchesSearch = article.article.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         article.code_fabricant?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !selectedType || article.type_id === selectedType;
    return matchesSearch && matchesType;
  });

  const handleAddCatalogArticle = () => {
    setEditingArticle(null);
    setCatalogFormData({ type_id: selectedType || 0, designation: '', article: '', code_fabricant: '', ref_commande: '' });
    setShowCatalogForm(true);
  };

  const handleEditCatalogArticle = (article: ConsumableArticle) => {
    setEditingArticle(article);
    setCatalogFormData({
      type_id: article.type_id || 0,
      designation: article.designation || '',
      article: article.article,
      code_fabricant: article.code_fabricant || '',
      ref_commande: article.ref_commande || ''
    });
    setShowCatalogForm(true);
  };

  const handleSaveCatalogArticle = async () => {
    if (!catalogFormData.type_id || !catalogFormData.article) {
      setError('Type et article sont requis');
      return;
    }
    try {
      setError('');
      if (editingArticle) {
        await axios.put(`/api/consumable/admin/catalog/${editingArticle.id}`, catalogFormData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Article mis à jour');
      } else {
        await axios.post('/api/consumable/admin/catalog/add', catalogFormData, {
          headers: { Authorization: `Bearer ${token}` }
        });
        alert('Article ajouté');
      }
      setShowCatalogForm(false);
      setEditingArticle(null);
      setCatalogFormData({ type_id: 0, designation: '', article: '', code_fabricant: '', ref_commande: '' });
      loadCatalogArticles();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erreur lors de la sauvegarde';
      setError(errorMsg);
    }
  };

  const handleDeleteCatalogArticle = async (articleId: number, articleName: string) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer "${articleName}" ?`)) return;
    try {
      setError('');
      await axios.delete(`/api/consumable/admin/catalog/${articleId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert('Article supprimé');
      loadCatalogArticles();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erreur lors de la suppression';
      setError(errorMsg);
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'approved': return <CheckCircle size={16} style={{ color: '#16a34a' }} />;
      case 'ordered': return <ShoppingBag size={16} style={{ color: '#2563eb' }} />;
      case 'rejected': return <X size={16} style={{ color: '#dc2626' }} />;
      default: return <Clock size={16} style={{ color: '#d97706' }} />;
    }
  };

  const getStatusStyle = (status: string): React.CSSProperties => {
    switch(status) {
      case 'approved': return { background: '#dcfce7', color: '#15803d', border: '1px solid #86efac' };
      case 'ordered': return { background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' };
      case 'rejected': return { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' };
      default: return { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' };
    }
  };

  const getStatusText = (status: string) => {
    switch(status) {
      case 'approved': return 'Approuvé';
      case 'ordered': return 'Commandé';
      case 'rejected': return 'Rejeté';
      default: return 'En attente';
    }
  };

  const stepLabels = ['Infos', 'Type', 'Imprimante', 'Articles', 'Récapitulatif'];

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-color)' }}>
      <Header />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px' }}>

        {/* Page Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 36 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'linear-gradient(135deg, #003366, #0055a4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(0,51,102,0.25)'
          }}>
            <Package size={28} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>
              Gestion des Consommables
            </h1>
            <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 15 }}>
              Commandez et gérez vos consommables informatiques
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#fff5f5', border: '1px solid #fecaca',
            borderRadius: 10, padding: '12px 16px', marginBottom: 24,
            color: '#991b1b', fontSize: 14
          }}>
            <AlertCircle size={18} style={{ flexShrink: 0, color: '#dc2626' }} />
            <span>{error}</span>
            <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626' }}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Tabs (admin only) */}
        {user?.role === 'admin' && (
          <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: 'white', borderRadius: 12, padding: 4, width: 'fit-content', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}>
            <button
              onClick={() => { setActiveTab('requests'); setStep(1); setShowForm(false); setAdminTab('demandes'); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                background: activeTab === 'requests' ? 'var(--secondary-color)' : 'transparent',
                color: activeTab === 'requests' ? 'white' : '#64748b',
              }}
            >
              <Package size={16} /> Demandes
            </button>
            <button
              onClick={() => { setActiveTab('requests'); setShowForm(false); setAdminTab('commander'); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                background: activeTab === 'requests' && adminTab === 'commander' ? 'var(--secondary-color)' : 'transparent',
                color: activeTab === 'requests' && adminTab === 'commander' ? 'white' : '#64748b',
              }}
            >
              <ShoppingBag size={16} /> À commander
            </button>
            <button
              onClick={() => { setActiveTab('catalog'); setSelectedType(null); setSearchTerm(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                background: activeTab === 'catalog' ? 'var(--secondary-color)' : 'transparent',
                color: activeTab === 'catalog' ? 'white' : '#64748b',
              }}
            >
              <BookOpen size={16} /> Catalogue
            </button>
            <button
              onClick={() => { setActiveTab('images'); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                background: activeTab === 'images' ? 'var(--secondary-color)' : 'transparent',
                color: activeTab === 'images' ? 'white' : '#64748b',
              }}
            >
              <Image size={16} /> Images
            </button>
            <button
              onClick={() => { setActiveTab('recap'); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                border: 'none', cursor: 'pointer', transition: 'all 0.2s',
                background: activeTab === 'recap' ? 'var(--secondary-color)' : 'transparent',
                color: activeTab === 'recap' ? 'white' : '#64748b',
              }}
            >
              <ListChecks size={16} /> Récap
            </button>
          </div>
        )}

        {/* =================== REQUESTS TAB =================== */}
        {activeTab === 'requests' && (
          <>
            {/* New request button & Cart floating button */}
            {!showForm && (
              <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                <button
                  onClick={() => { loadTypes(); loadDesignationImages(); loadADUserInfo(); setShowForm(true); setStep(1); setSelectedTypeId(0); setSelectedDesignation(''); setFormData({ date_commande: new Date().toISOString().split('T')[0], direction: '', service: '', nom_referent: user?.username || '', tel_complet: '' }); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    background: 'var(--primary-color)', color: 'white',
                    border: 'none', borderRadius: 10, padding: '12px 24px',
                    fontSize: 15, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(227,6,19,0.3)',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#c40510')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--primary-color)')}
                >
                  <Plus size={20} />
                  Nouvelle demande
                </button>
                {cart.length > 0 && (
                  <button
                    onClick={() => { setShowForm(true); setStep(5); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: 'var(--secondary-color)', color: 'white',
                      border: 'none', borderRadius: 10, padding: '12px 24px',
                      fontSize: 15, fontWeight: 700, cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(0,51,102,0.3)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#002244')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'var(--secondary-color)')}
                  >
                    <ShoppingCart size={20} />
                    Panier ({cartTotalItems})
                  </button>
                )}
              </div>
            )}

            {/* ---- FORM ---- */}
            {showForm && (
              <div style={{
                background: 'white', borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
                border: '1px solid #e2e8f0', padding: 32, marginBottom: 28
              }}>
                {/* Step indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 28 }}>
                  {stepLabels.map((label, idx) => {
                    const n = idx + 1;
                    return (
                      <React.Fragment key={n}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: n <= step && n < 5 ? 'pointer' : 'default' }}
                          onClick={() => { if (n <= step && n < 5) setStep(n); }}
                        >
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: 14,
                            background: step >= n ? (n === 5 ? '#16a34a' : 'var(--secondary-color)') : '#e2e8f0',
                            color: step >= n ? 'white' : '#94a3b8',
                          }}>
                            {n === 5 ? <CheckCircle size={16} /> : n}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, color: step >= n ? 'var(--secondary-color)' : '#94a3b8', display: 'none' }}>
                            {label}
                          </span>
                        </div>
                        {n < 5 && <div style={{ flex: 1, height: 2, background: step > n ? 'var(--secondary-color)' : '#e2e8f0', borderRadius: 2, minWidth: 20 }} />}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* STEP 1 — Informations Personnelles */}
                {step === 1 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                      <User size={22} style={{ color: 'var(--secondary-color)' }} />
                      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>
                        Informations Personnelles
                      </h2>
                    </div>
                    <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 24px' }}>
                      Renseignez vos informations pour la commande
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                          <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                          Date de Commande
                        </label>
                        <input
                          type="date"
                          value={formData.date_commande}
                          onChange={e => setFormData({ ...formData, date_commande: e.target.value })}
                          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                          onFocus={e => (e.target.style.borderColor = 'var(--secondary-color)')}
                          onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                          <Building2 size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                          Direction
                        </label>
                        <input
                          type="text"
                          placeholder="ex: DSI"
                          value={formData.direction}
                          onChange={e => setFormData({ ...formData, direction: e.target.value })}
                          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                          onFocus={e => (e.target.style.borderColor = 'var(--secondary-color)')}
                          onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                          Service
                        </label>
                        <input
                          type="text"
                          placeholder="ex: Infrastructure"
                          value={formData.service}
                          onChange={e => setFormData({ ...formData, service: e.target.value })}
                          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                          onFocus={e => (e.target.style.borderColor = 'var(--secondary-color)')}
                          onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                          Nom du Référent
                        </label>
                        <input
                          type="text"
                          value={formData.nom_referent}
                          onChange={e => setFormData({ ...formData, nom_referent: e.target.value })}
                          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                          onFocus={e => (e.target.style.borderColor = 'var(--secondary-color)')}
                          onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                        />
                      </div>
                      <div style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                          <Phone size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                          Téléphone
                        </label>
                        <input
                          type="tel"
                          placeholder="ex: 01 23 45 67 89"
                          value={formData.tel_complet}
                          onChange={e => setFormData({ ...formData, tel_complet: e.target.value })}
                          style={{ width: '100%', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                          onFocus={e => (e.target.style.borderColor = 'var(--secondary-color)')}
                          onBlur={e => (e.target.style.borderColor = '#e2e8f0')}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => { setShowForm(false); setStep(1); }}
                        style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                      >
                        Annuler
                      </button>
                      <button
                        onClick={() => setStep(2)}
                        style={{
                          padding: '10px 24px', border: 'none', borderRadius: 8,
                          background: 'var(--secondary-color)', color: 'white',
                          cursor: 'pointer', fontWeight: 700, fontSize: 14,
                          display: 'flex', alignItems: 'center', gap: 8
                        }}
                      >
                        Suivant <ArrowRight size={16} />
                      </button>
                    </div>
                  </>
                )}

                {/* STEP 2 — Type de Consommable */}
                {step === 2 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                      <Tag size={22} style={{ color: 'var(--secondary-color)' }} />
                      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>
                        Type de Consommable
                      </h2>
                    </div>
                    <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 24px' }}>Choisissez la catégorie de consommable</p>

                    {consumableTypes.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                        <Tag size={40} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.4 }} />
                        <p style={{ margin: 0, fontWeight: 600 }}>Aucun type disponible</p>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 24 }}>
                        {consumableTypes.map(type => (
                          <button
                            key={type.id}
                            onClick={() => handleTypeSelect(type)}
                            style={{
                              padding: '18px 20px', border: '2px solid #e2e8f0', borderRadius: 12,
                              background: 'white', textAlign: 'left', cursor: 'pointer',
                              transition: 'all 0.2s', fontFamily: 'inherit'
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--secondary-color)'; e.currentTarget.style.background = '#f0f5ff'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white'; }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Package size={18} style={{ color: 'var(--secondary-color)' }} />
                              </div>
                              <div>
                                <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{type.display_name}</p>
                                <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>Sélectionner →</p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 12 }}>
                      <button
                        onClick={() => setStep(1)}
                        style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <ChevronLeft size={16} /> Précédent
                      </button>
                    </div>
                  </>
                )}

                {/* STEP 3 — Choix de l'imprimante / désignation */}
                {step === 3 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                      <Printer size={22} style={{ color: 'var(--secondary-color)' }} />
                      <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>
                        Choisir l'Imprimante
                      </h2>
                    </div>
                    <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 24px' }}>
                      Sélectionnez le modèle d'imprimante pour voir ses consommables
                    </p>

                    {designations.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                        <Printer size={40} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.4 }} />
                        <p style={{ margin: 0, fontWeight: 600 }}>Aucune imprimante trouvée pour ce type</p>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, marginBottom: 24 }}>
                        {designations.map(designation => {
                          const image = designationImages[designation];
                          return (
                            <button
                              key={designation}
                              onClick={() => handleDesignationSelect(designation)}
                              style={{
                                padding: '16px', border: '2px solid #e2e8f0', borderRadius: 12,
                                background: 'white', textAlign: 'left', cursor: 'pointer',
                                transition: 'all 0.2s', fontFamily: 'inherit'
                              }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--secondary-color)'; e.currentTarget.style.background = '#f0f5ff'; }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.background = 'white'; }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                {image ? (
                                  <img src={image.image_path} alt={designation}
                                    style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }}
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                  />
                                ) : (
                                  <div style={{ width: 48, height: 48, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Printer size={24} style={{ color: '#94a3b8' }} />
                                  </div>
                                )}
                                <div>
                                  <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#1e293b', lineHeight: '1.3' }}>{designation}</p>
                                  <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--secondary-color)', fontWeight: 600 }}>Voir les consommables →</p>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
                      <button
                        onClick={() => setStep(2)}
                        style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <ChevronLeft size={16} /> Précédent
                      </button>
                      {cart.length > 0 && (
                        <button
                          onClick={() => setStep(5)}
                          style={{
                            padding: '10px 20px', border: 'none', borderRadius: 8,
                            background: '#16a34a', color: 'white', cursor: 'pointer',
                            fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8
                          }}
                        >
                          <ShoppingBag size={16} /> Voir le panier ({cartTotalItems})
                        </button>
                      )}
                    </div>
                  </>
                )}

                {/* STEP 4 — Articles */}
                {step === 4 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                          <Package size={22} style={{ color: 'var(--secondary-color)' }} />
                          <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>
                            Consommables
                          </h2>
                        </div>
                        <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>
                          {currentTypeSkipsPrinter ? (
                            <>Type : <strong style={{ color: 'var(--secondary-color)' }}>{selectedTypeName}</strong></>
                          ) : (
                            <>Pour : <strong style={{ color: 'var(--secondary-color)' }}>{selectedDesignation}</strong></>
                          )}
                        </p>
                      </div>
                      {!currentTypeSkipsPrinter && (
                        <button
                          onClick={() => setStep(3)}
                          style={{
                            padding: '8px 16px', border: '1px solid #e2e8f0', borderRadius: 8,
                            background: 'white', color: '#64748b', cursor: 'pointer',
                            fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6
                          }}
                        >
                          <Printer size={14} /> Changer d'imprimante
                        </button>
                      )}
                    </div>

                    {consumableArticles.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                        <Package size={40} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.4 }} />
                        <p style={{ margin: 0, fontWeight: 600 }}>Aucun article trouvé</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
                        {consumableArticles.map(article => {
                          const inCartQty = cart.find(item => item.catalogId === article.id)?.quantite || 0;
                          return (
                            <ArticleRow
                              key={article.id}
                              article={article}
                              inCartQty={inCartQty}
                              onAdd={(quantity) => addToCart(article, quantity)}
                              showDesignation={currentTypeSkipsPrinter}
                            />
                          );
                        })}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center' }}>
                      {currentTypeSkipsPrinter ? (
                        <button
                          onClick={() => setStep(2)}
                          style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <ChevronLeft size={16} /> Autres types
                        </button>
                      ) : (
                        <button
                          onClick={() => setStep(3)}
                          style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}
                        >
                          <ChevronLeft size={16} /> Autres imprimantes
                        </button>
                      )}
                      <div style={{ display: 'flex', gap: 12 }}>
                        <button
                          onClick={() => setStep(2)}
                          style={{
                            padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8,
                            background: 'white', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 14
                          }}
                        >
                          Ajouter un consommable
                        </button>
                        <button
                          onClick={() => setStep(5)}
                          style={{
                            padding: '10px 24px', border: 'none', borderRadius: 8,
                            background: '#16a34a', color: 'white', cursor: 'pointer',
                            fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8
                          }}
                        >
                          <ShoppingBag size={16} /> Voir le panier ({cartTotalItems})
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {/* STEP 5 — Récapitulatif du panier */}
                {step === 5 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                      <ShoppingCart size={22} style={{ color: '#16a34a' }} />
                      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#16a34a', margin: 0 }}>
                        Récapitulatif du Panier
                      </h2>
                    </div>
                    <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 24px' }}>
                      Vérifiez votre commande avant de la valider
                    </p>

                    {/* Order summary card */}
                    <div style={{
                      background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
                      padding: 20, marginBottom: 20
                    }}>
                      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#374151' }}>
                        Informations de commande
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                        <div><span style={{ color: '#94a3b8' }}>Date :</span> <strong>{formData.date_commande}</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>Direction :</span> <strong>{formData.direction}</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>Service :</span> <strong>{formData.service}</strong></div>
                        <div><span style={{ color: '#94a3b8' }}>Référent :</span> <strong>{formData.nom_referent}</strong></div>
                        <div style={{ gridColumn: '1 / -1' }}><span style={{ color: '#94a3b8' }}>Téléphone :</span> <strong>{formData.tel_complet}</strong></div>
                      </div>
                    </div>

                    {cart.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                        <ShoppingCart size={48} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3 }} />
                        <p style={{ margin: 0, fontWeight: 600 }}>Votre panier est vide</p>
                        <button
                          onClick={() => setStep(2)}
                          style={{ marginTop: 16, padding: '10px 20px', border: 'none', borderRadius: 8, background: 'var(--secondary-color)', color: 'white', cursor: 'pointer', fontWeight: 600, fontSize: 14 }}
                        >
                          Commencer mes achats
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20, maxHeight: 400, overflowY: 'auto' }}>
                          {cart.map((item, idx) => (
                            <div key={item.catalogId} style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '12px 16px', background: 'white', border: '1px solid #e2e8f0',
                              borderRadius: 10
                            }}>
                              <div style={{
                                width: 36, height: 36, borderRadius: 8, background: '#f1f5f9',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0
                              }}>
                                <Package size={18} style={{ color: '#64748b' }} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{item.article}</p>
                                {item.designation && (
                                  <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>
                                    <Printer size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                                    {item.designation}
                                  </p>
                                )}
                                {item.codeFabricant && (
                                  <p style={{ margin: '1px 0 0', fontSize: 11, color: '#94a3b8' }}>Réf: {item.codeFabricant}</p>
                                )}
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                                <button
                                  onClick={() => updateCartQuantity(item.catalogId, item.quantite - 1)}
                                  style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#64748b' }}
                                >
                                  −
                                </button>
                                <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', minWidth: 24, textAlign: 'center' }}>{item.quantite}</span>
                                <button
                                  onClick={() => updateCartQuantity(item.catalogId, item.quantite + 1)}
                                  style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, color: '#64748b' }}
                                >
                                  +
                                </button>
                                <button
                                  onClick={() => removeFromCart(item.catalogId)}
                                  style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#fee2e2', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}
                                  title="Retirer"
                                >
                                  <Trash size={14} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Totals */}
                        <div style={{
                          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12,
                          padding: '16px 20px', marginBottom: 24, display: 'flex',
                          alignItems: 'center', justifyContent: 'space-between'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <ShoppingBag size={20} style={{ color: '#16a34a' }} />
                            <span style={{ fontWeight: 600, fontSize: 15, color: '#166534' }}>
                              Total : <strong style={{ fontSize: 18 }}>{cartTotalItems}</strong> article{cartTotalItems > 1 ? 's' : ''}
                            </span>
                          </div>
                          <button
                            onClick={clearCart}
                            style={{
                              padding: '6px 14px', border: '1px solid #fca5a5', borderRadius: 8,
                              background: 'white', color: '#dc2626', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                              display: 'flex', alignItems: 'center', gap: 6
                            }}
                          >
                            <Trash size={14} /> Vider
                          </button>
                        </div>
                      </>
                    )}

                    <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
                      <button
                        onClick={() => setStep(4)}
                        style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', color: '#64748b', cursor: 'pointer', fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}
                      >
                        <ChevronLeft size={16} /> Retour
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={cart.length === 0}
                        style={{
                          padding: '12px 32px', border: 'none', borderRadius: 8,
                          background: cart.length === 0 ? '#94a3b8' : 'var(--primary-color)',
                          color: 'white', cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
                          fontWeight: 700, fontSize: 15,
                          display: 'flex', alignItems: 'center', gap: 8,
                          boxShadow: cart.length > 0 ? '0 4px 12px rgba(227,6,19,0.3)' : 'none'
                        }}
                      >
                        <CheckCircle size={18} /> Valider la Commande
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Requests list */}
            {!loading && adminTab === 'commander' && user?.role === 'admin' ? (
              <ConsommablesACommander token={token!} />
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--secondary-color)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ListChecks size={20} /> Demandes
                  </h3>
                  {user?.role === 'admin' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#64748b', cursor: 'pointer' }}>
                      <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)}
                        style={{ width: 16, height: 16, cursor: 'pointer' }} />
                      Afficher archivées
                    </label>
                  )}
                </div>

                {requests.length === 0 ? (
                  <div style={{
                    textAlign: 'center', padding: '60px 20px',
                    background: 'white', borderRadius: 16, border: '2px dashed #e2e8f0'
                  }}>
                    <Package size={48} style={{ display: 'block', margin: '0 auto 12px', color: '#cbd5e1' }} />
                    <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#64748b' }}>Aucune demande pour le moment</p>
                    <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Créez votre première demande en cliquant sur le bouton ci-dessus</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {requests
                      .filter(r => showArchived || !r.archived)
                      .map(request => (
                      <div key={request.id} style={{
                        background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
                        padding: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                        transition: 'box-shadow 0.2s', opacity: request.archived ? 0.6 : 1
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 42, height: 42, borderRadius: 10, background: '#f0f5ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {getStatusIcon(request.status)}
                            </div>
                            <div>
                              <h4 style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{request.type_consommable}</h4>
                              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>
                                {new Date(request.created_at).toLocaleDateString('fr-FR')}
                                {request.email && <span style={{ marginLeft: 8 }}>— {request.email}</span>}
                              </p>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {request.archived && (
                              <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: '#f1f5f9', color: '#64748b', border: '1px solid #e2e8f0' }}>
                                Archivé
                              </span>
                            )}
                            <span style={{ padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, ...getStatusStyle(request.status) }}>
                              {getStatusText(request.status)}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '12px 14px', background: '#f8fafc', borderRadius: 10, marginBottom: 14 }}>
                          <div>
                            <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }}>Direction</p>
                            <p style={{ margin: 0, fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{request.direction}</p>
                          </div>
                          <div>
                            <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#94a3b8', letterSpacing: '0.05em' }}>Service</p>
                            <p style={{ margin: 0, fontWeight: 600, color: '#1e293b', fontSize: 14 }}>{request.service}</p>
                          </div>
                        </div>

                        {request.status === 'ordered' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '12px 14px', background: '#eff6ff', borderRadius: 10, marginBottom: 14, border: '1px solid #bfdbfe' }}>
                            <div>
                              <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#3b82f6', letterSpacing: '0.05em' }}>N° Commande</p>
                              <p style={{ margin: 0, fontWeight: 700, color: '#1e40af', fontSize: 13 }}>{request.order_number}</p>
                            </div>
                            <div>
                              <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#3b82f6', letterSpacing: '0.05em' }}>Tiers</p>
                              <p style={{ margin: 0, fontWeight: 700, color: '#1e40af', fontSize: 13 }}>{request.tier}</p>
                            </div>
                            <div>
                              <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#3b82f6', letterSpacing: '0.05em' }}>Montant TTC</p>
                              <p style={{ margin: 0, fontWeight: 700, color: '#1e40af', fontSize: 13 }}>{request.total_amount_ttc} €</p>
                            </div>
                            {request.is_school && (
                              <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: '#fef3c7', color: '#92400e', borderRadius: 8, fontSize: 12, fontWeight: 700, border: '1px solid #fde68a' }}>
                                  <Building2 size={14} /> Commande École
                                </span>
                              </div>
                            )}
                            {request.user_comment && (
                              <div style={{ gridColumn: '1 / -1', marginTop: 12, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, borderLeft: '4px solid #cbd5e1' }}>
                                <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Annotation demandeur</p>
                                <p style={{ margin: 0, fontSize: 13, color: '#475569', fontStyle: 'italic' }}>"{request.user_comment}"</p>
                              </div>
                            )}
                          </div>
                        )}

                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 14 }}>
                          <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: '#475569' }}>Articles :</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {request.articles.map((article, idx) => (
                              <span key={idx} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                background: '#eff6ff', color: 'var(--secondary-color)',
                                padding: '4px 10px', borderRadius: 20, fontSize: 13, fontWeight: 600
                              }}>
                                {article.article} <span style={{ color: 'var(--primary-color)' }}>×{article.quantite}</span>
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Admin Actions */}
                        {user?.role === 'admin' && !request.archived && (
                          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12, marginTop: 12, display: 'flex', gap: 8 }}>
                            {request.status === 'pending' && (
                              <button onClick={() => handleValidateRequest(request.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                <CheckCircle size={14} /> Valider la demande
                              </button>
                            )}
                            {request.status === 'approved' && (
                              <button onClick={() => setAdminTab('commander')}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                <ShoppingCart size={14} /> Finaliser la commande
                              </button>
                            )}
                            <button onClick={() => handleArchiveRequest(request.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                              <Archive size={14} /> Archiver
                            </button>
                            <button onClick={() => handleDeleteRequest(request.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: '#fff5f5', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                              <Trash2 size={14} /> Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* =================== CATALOG TAB =================== */}
        {activeTab === 'catalog' && user?.role === 'admin' && (
          <>
            {/* Controls */}
            <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Rechercher article ou code..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ width: '100%', paddingLeft: 40, paddingRight: 12, paddingTop: 10, paddingBottom: 10, border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                  />
                </div>
                <select
                  value={selectedType || ''}
                  onChange={e => setSelectedType(e.target.value ? parseInt(e.target.value) : null)}
                  style={{ padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none', color: '#374151', background: 'white' }}
                >
                  <option value="">Tous les types</option>
                  {consumableTypes.map(type => (
                    <option key={type.id} value={type.id}>{type.display_name}</option>
                  ))}
                </select>
                <button
                  onClick={handleAddCatalogArticle}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'var(--secondary-color)', color: 'white',
                    border: 'none', borderRadius: 8, padding: '10px 18px',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  <Plus size={16} /> Ajouter
                </button>
              </div>
            </div>

            {/* Catalog Form */}
            {showCatalogForm && (
              <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 24, marginBottom: 20, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}>
                <h3 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 700, color: 'var(--secondary-color)' }}>
                  {editingArticle ? 'Modifier un Article' : 'Ajouter un Article'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <select
                    value={catalogFormData.type_id}
                    onChange={e => setCatalogFormData({ ...catalogFormData, type_id: parseInt(e.target.value) })}
                    style={{ gridColumn: '1 / -1', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                  >
                    <option value={0}>Sélectionner un type</option>
                    {consumableTypes.map(t => <option key={t.id} value={t.id}>{t.display_name}</option>)}
                  </select>
                  <input type="text" placeholder="Désignation (imprimante)" value={catalogFormData.designation}
                    onChange={e => setCatalogFormData({ ...catalogFormData, designation: e.target.value })}
                    style={{ padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                  />
                  <input type="text" placeholder="Article (consommable)" value={catalogFormData.article}
                    onChange={e => setCatalogFormData({ ...catalogFormData, article: e.target.value })}
                    style={{ padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                  />
                  <input type="text" placeholder="Code Fabricant" value={catalogFormData.code_fabricant}
                    onChange={e => setCatalogFormData({ ...catalogFormData, code_fabricant: e.target.value })}
                    style={{ padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                  />
                  <input type="text" placeholder="Réf. Commande" value={catalogFormData.ref_commande}
                    onChange={e => setCatalogFormData({ ...catalogFormData, ref_commande: e.target.value })}
                    style={{ gridColumn: '1 / -1', padding: '10px 12px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', outline: 'none' }}
                  />
                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 10 }}>
                    <button onClick={() => { setShowCatalogForm(false); setEditingArticle(null); setCatalogFormData({ type_id: 0, designation: '', article: '', code_fabricant: '', ref_commande: '' }); }}
                      style={{ flex: 1, padding: '10px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>
                      Annuler
                    </button>
                    <button onClick={handleSaveCatalogArticle}
                      style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 8, background: 'var(--secondary-color)', color: 'white', cursor: 'pointer', fontWeight: 700 }}>
                      Enregistrer
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Catalog Table */}
            <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                <thead>
                  <tr style={{ background: 'var(--secondary-color)' }}>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, color: 'white', fontSize: 13 }}>Type</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, color: 'white', fontSize: 13 }}>Désignation</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, color: 'white', fontSize: 13 }}>Article</th>
                    <th style={{ padding: '14px 20px', textAlign: 'left', fontWeight: 700, color: 'white', fontSize: 13 }}>Code Fabricant</th>
                    <th style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 700, color: 'white', fontSize: 13 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCatalogArticles.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '50px 20px', textAlign: 'center', color: '#94a3b8' }}>
                        <Package size={40} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.3 }} />
                        <p style={{ margin: 0, fontWeight: 600 }}>Aucun article trouvé</p>
                      </td>
                    </tr>
                  ) : (
                    filteredCatalogArticles.map((article, idx) => (
                      <tr key={article.id} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                        <td style={{ padding: '12px 20px', fontWeight: 600, color: '#475569' }}>{article.type_display_name}</td>
                        <td style={{ padding: '12px 20px', color: '#64748b', fontSize: 13 }}>{article.designation || '—'}</td>
                        <td style={{ padding: '12px 20px', fontWeight: 700, color: '#1e293b' }}>{article.article}</td>
                        <td style={{ padding: '12px 20px', color: '#64748b' }}>{article.code_fabricant || '—'}</td>
                        <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button onClick={() => handleEditCatalogArticle(article)}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#eff6ff', color: 'var(--secondary-color)', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                              <Edit2 size={14} /> Modifier
                            </button>
                            <button onClick={() => handleDeleteCatalogArticle(article.id, article.article)}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#fff5f5', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                              <Trash2 size={14} /> Supprimer
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                {filteredCatalogArticles.length} article(s) affiché(s) sur {catalogArticles.length}
              </div>
            </div>
          </>
        )}

        {/* =================== IMAGES TAB =================== */}
        {activeTab === 'images' && user?.role === 'admin' && (
          <DesignationImagesManager token={token!} designations={allCatalogDesignations} />
        )}

        {/* =================== RECAP TAB =================== */}
        {activeTab === 'recap' && user?.role === 'admin' && (
          <ConsommablesRecap token={token!} />
        )}
      </div>
    </div>
  );
};

interface ToOrderItem {
  request_id: number;
  direction: string;
  service: string;
  nom_referent: string;
  email: string;
  date_commande: string;
  created_at: string;
  type_consommable: string;
  articles: { catalog_id: number; article: string; designation: string; code_fabricant: string; ref_commande: string; quantite: number }[];
}

const ConsommablesACommander: React.FC<{ token: string }> = ({ token }) => {
  const [items, setItems] = useState<ToOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderingItem, setOrderingItem] = useState<ToOrderItem | null>(null);
  const [orderData, setOrderData] = useState({
    order_number: '',
    tier: 'UGAP',
    total_amount_ttc: '',
    is_school: false
  });
  const [modifiedArticles, setModifiedArticles] = useState<{ catalog_id: number; quantite: number }[]>([]);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/consumable/requests/to-order', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setItems(response.data);
    } catch (error) {
      console.error('Error loading items to order:', error);
    } finally {
      setLoading(false);
    }
  };

  const startOrdering = (item: ToOrderItem) => {
    setOrderingItem(item);
    setOrderData({ order_number: '', tier: 'UGAP', total_amount_ttc: '', is_school: false });
    setModifiedArticles(item.articles.map(a => ({ catalog_id: a.catalog_id, quantite: a.quantite })));
  };

  const handleUpdateQty = (catalog_id: number, newQty: number) => {
    setModifiedArticles(prev => prev.map(a => 
      a.catalog_id === catalog_id ? { ...a, quantite: Math.max(0, newQty) } : a
    ));
  };

  const handleOrderSubmit = async () => {
    if (!orderingItem) return;
    if (!orderData.order_number) {
      alert('Veuillez saisir un numéro de commande');
      return;
    }

    try {
      await axios.put(`/api/consumable/admin/${orderingItem.request_id}/status`, {
        status: 'ordered',
        order_number: orderData.order_number,
        tier: orderData.tier,
        total_amount_ttc: parseFloat(orderData.total_amount_ttc) || 0,
        is_school: orderData.is_school,
        articles: modifiedArticles
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      alert('Commande validée avec succès');
      setOrderingItem(null);
      loadItems();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Erreur lors de la validation de la commande');
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chargement...</div>;
  }

  if (items.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '60px 20px',
        background: 'white', borderRadius: 16, border: '2px dashed #e2e8f0',
        marginTop: 20
      }}>
        <ShoppingBag size={48} style={{ display: 'block', margin: '0 auto 12px', color: '#cbd5e1' }} />
        <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#64748b' }}>Aucun consommable à commander</p>
        <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Validez des demandes pour voir apparaître les articles ici</p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <ShoppingBag size={22} style={{ color: '#16a34a' }} />
        <h3 style={{ fontSize: 18, fontWeight: 700, color: '#16a34a', margin: 0 }}>
          Consommables à commander ({items.length} demande{items.length > 1 ? 's' : ''})
        </h3>
      </div>

      {orderingItem && (
        <div style={{ 
          background: 'white', borderRadius: 16, border: '2px solid var(--secondary-color)', 
          padding: 24, marginBottom: 24, boxShadow: '0 8px 30px rgba(0,51,102,0.15)' 
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h4 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--secondary-color)' }}>
              Validation de la Commande n°{orderingItem.request_id}
            </h4>
            <button onClick={() => setOrderingItem(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b' }}>
              <X size={20} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>
                Numéro de Commande <span style={{ color: '#dc2626' }}>*</span>
              </label>
              <input 
                type="text" 
                value={orderData.order_number}
                onChange={e => setOrderData({ ...orderData, order_number: e.target.value })}
                placeholder="ex: CMD-2024-001"
                style={{ width: '100%', padding: '10px', border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Tiers</label>
              <input 
                type="text" 
                value={orderData.tier}
                onChange={e => setOrderData({ ...orderData, tier: e.target.value })}
                placeholder="ex: UGAP"
                style={{ width: '100%', padding: '10px', border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>Montant TTC (€)</label>
              <input 
                type="number" 
                step="0.01"
                value={orderData.total_amount_ttc}
                onChange={e => setOrderData({ ...orderData, total_amount_ttc: e.target.value })}
                placeholder="ex: 150.50"
                style={{ width: '100%', padding: '10px', border: '1.5px solid #e2e8f0', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', background: '#f8fafc', padding: '10px 16px', borderRadius: 10, border: '1.5px solid #e2e8f0' }}>
                <input 
                  type="checkbox" 
                  checked={orderData.is_school}
                  onChange={e => setOrderData({ ...orderData, is_school: e.target.checked })}
                  style={{ width: 18, height: 18, cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Building2 size={16} style={{ color: '#3b82f6' }} />
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>Commande pour une école ?</span>
                </div>
              </label>
            </div>
          </div>

          <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Articles et quantités à commander :</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {orderingItem.articles.map(article => {
              const modified = modifiedArticles.find(a => a.catalog_id === article.catalog_id);
              return (
                <div key={article.catalog_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#1e293b' }}>{article.article}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>{article.designation} — Réf: {article.code_fabricant || article.ref_commande}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, color: '#64748b' }}>Demandé: {article.quantite}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button onClick={() => handleUpdateQty(article.catalog_id, (modified?.quantite || 0) - 1)} 
                        style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: 700 }}>-</button>
                      <input 
                        type="number" 
                        value={modified?.quantite || 0}
                        onChange={e => handleUpdateQty(article.catalog_id, parseInt(e.target.value) || 0)}
                        style={{ width: 50, padding: '5px', textAlign: 'center', border: '1.5px solid var(--secondary-color)', borderRadius: 6, fontWeight: 700 }}
                      />
                      <button onClick={() => handleUpdateQty(article.catalog_id, (modified?.quantite || 0) + 1)}
                        style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #cbd5e1', background: 'white', cursor: 'pointer', fontWeight: 700 }}>+</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button onClick={() => setOrderingItem(null)}
              style={{ padding: '10px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: 'white', color: '#64748b', cursor: 'pointer', fontWeight: 600 }}>
              Annuler
            </button>
            <button onClick={handleOrderSubmit}
              style={{ padding: '10px 24px', border: 'none', borderRadius: 8, background: '#16a34a', color: 'white', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={18} /> Confirmer la commande
            </button>
          </div>
        </div>
      )}

      {items.map((item) => (
        <div key={item.request_id} style={{
          background: 'white', borderRadius: 14, border: '1px solid #e2e8f0',
          padding: 20, marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
          display: orderingItem?.request_id === item.request_id ? 'none' : 'block'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                Demande n°{item.request_id} — {item.type_consommable}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
                {item.direction} / {item.service} — {item.nom_referent}
              </p>
              {item.email && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>{item.email}</p>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {new Date(item.created_at).toLocaleDateString('fr-FR')}
              </span>
              <div style={{ marginTop: 8 }}>
                <button 
                  onClick={() => startOrdering(item)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--secondary-color)', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                  <ShoppingCart size={14} /> Passer la commande
                </button>
              </div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Article</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Désignation</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Réf.</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#475569', borderBottom: '2px solid #e2e8f0' }}>Qté</th>
              </tr>
            </thead>
            <tbody>
              {item.articles && item.articles.map((a, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: '#1e293b' }}>{a.article}</td>
                  <td style={{ padding: '8px 12px', color: '#64748b' }}>{a.designation || '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#64748b' }}>{a.code_fabricant || a.ref_commande || '—'}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: 'var(--primary-color)' }}>{a.quantite}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

interface ArticleRowProps {
  article: ConsumableArticle;
  inCartQty: number;
  onAdd: (quantity: number) => void;
  showDesignation?: boolean;
}

const ArticleRow: React.FC<ArticleRowProps> = ({ article, inCartQty, onAdd, showDesignation }) => {
  const [qty, setQty] = useState(1);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', border: '1.5px solid #e2e8f0', borderRadius: 10,
      background: inCartQty > 0 ? '#f0fdf4' : 'white',
      borderColor: inCartQty > 0 ? '#86efac' : '#e2e8f0',
      transition: 'all 0.2s', gap: 12
    }}>
      <div style={{ flex: 1 }}>
        {showDesignation && article.designation ? (
          <>
            <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: '#1e293b' }}>
              {article.designation}{article.code_fabricant ? <span style={{ color: '#64748b', fontWeight: 500 }}> ({article.code_fabricant})</span> : ''}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>{article.article}</p>
          </>
        ) : (
          <>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{article.article}</p>
            {article.code_fabricant && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#94a3b8' }}>Réf: {article.code_fabricant}</p>
            )}
          </>
        )}
      </div>
      {inCartQty > 0 && (
        <span style={{
          background: '#dcfce7', color: '#166534', padding: '2px 8px',
          borderRadius: 12, fontSize: 11, fontWeight: 700
        }}>
          {inCartQty} au panier
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <input
          type="number"
          min="1"
          value={qty}
          onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
          style={{ width: 60, padding: '8px', border: '1.5px solid #e2e8f0', borderRadius: 8, textAlign: 'center', fontSize: 14, fontWeight: 600, fontFamily: 'inherit' }}
        />
        <button
          onClick={() => { onAdd(qty); setQty(1); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', border: 'none', borderRadius: 8,
            background: 'var(--secondary-color)', color: 'white',
            cursor: 'pointer', fontWeight: 700, fontSize: 13,
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#002244')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--secondary-color)')}
        >
          <ShoppingCart size={16} /> Ajouter
        </button>
      </div>
    </div>
  );
};

const ConsommablesRecap: React.FC<{ token: string }> = ({ token }) => {
  const [requests, setRequests] = useState<ConsumableRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [expandedRequests, setExpandedRequests] = useState<number[]>([]);
  const [expandedDirections, setExpandedDirections] = useState<string[]>([]);
  const [recapMode, setRecapMode] = useState<'details' | 'global'>('details');
  const [amountMode, setAmountMode] = useState<'month' | 'annual'>('month');

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/consumable/admin/all', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ordered = response.data.filter((r: any) => r.status === 'ordered');
      setRequests(ordered);
      
      if (ordered.length > 0) {
        const monthsInOrder = Array.from(new Set(ordered.map((r: any) => getMonthStr(r.date_commande))))
          .filter(m => !!m)
          .sort((a: any, b: string) => b.localeCompare(a));
        if (!monthsInOrder.includes(selectedMonth)) {
          setSelectedMonth(monthsInOrder[0]);
        }
      }
    } catch (error) {
      console.error('Error loading requests for recap:', error);
    } finally {
      setLoading(false);
    }
  };

  const getMonthStr = (dateVal: any) => {
    if (!dateVal) return "";
    const str = typeof dateVal === 'string' ? dateVal : new Date(dateVal).toISOString();
    const parts = str.split('T')[0].split('-');
    return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : "";
  };

  const selectedYear = selectedMonth.split('-')[0];

  const filteredRequests = requests.filter(r => {
    const m = getMonthStr(r.date_commande);
    return amountMode === 'month' ? m === selectedMonth : m.startsWith(selectedYear);
  });

  const monthlyTotal = requests.filter(r => getMonthStr(r.date_commande) === selectedMonth)
    .reduce((sum, r) => sum + (Number(r.total_amount_ttc) || 0), 0);
  
  const annualTotal = requests
    .filter(r => getMonthStr(r.date_commande).startsWith(selectedYear))
    .reduce((sum, r) => sum + (Number(r.total_amount_ttc) || 0), 0);

  const availableMonths = Array.from(new Set(requests.map(r => getMonthStr(r.date_commande))))
    .filter(m => !!m)
    .sort((a, b) => b.localeCompare(a));

  const toggleRequest = (id: number) => {
    setExpandedRequests(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleDirection = (dir: string) => {
    setExpandedDirections(prev => prev.includes(dir) ? prev.filter(x => x !== dir) : [...prev, dir]);
  };

  // Grouping logic for global view
  const globalData = filteredRequests.reduce((acc: any, r) => {
    const dir = r.direction || "Inconnu";
    const svc = r.service || "Sans service";
    const amt = Number(r.total_amount_ttc) || 0;

    if (!acc[dir]) acc[dir] = { total: 0, services: {} };
    acc[dir].total += amt;
    if (!acc[dir].services[svc]) acc[dir].services[svc] = 0;
    acc[dir].services[svc] += amt;
    return acc;
  }, {});

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Chargement du récapitulatif...</div>;

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 24, marginBottom: 24, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
        
        {/* HEADER CONTROLS */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f0f5ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ListChecks size={22} style={{ color: 'var(--secondary-color)' }} />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: 'var(--secondary-color)', margin: 0 }}>Récapitulatif des Commandes</h3>
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <button onClick={() => setRecapMode('details')} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: recapMode === 'details' ? 'var(--primary-color)' : '#94a3b8', cursor: 'pointer', textDecoration: recapMode === 'details' ? 'underline' : 'none' }}>Vue Détails</button>
                <button onClick={() => setRecapMode('global')} style={{ background: 'none', border: 'none', padding: 0, fontSize: 12, fontWeight: 700, color: recapMode === 'global' ? 'var(--primary-color)' : '#94a3b8', cursor: 'pointer', textDecoration: recapMode === 'global' ? 'underline' : 'none' }}>Vue Globale</button>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 8 }}>
              <button onClick={() => setAmountMode('month')} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: amountMode === 'month' ? 'white' : 'transparent', color: amountMode === 'month' ? '#1e293b' : '#64748b', boxShadow: amountMode === 'month' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}>Mois</button>
              <button onClick={() => setAmountMode('annual')} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: amountMode === 'annual' ? 'white' : 'transparent', color: amountMode === 'annual' ? '#1e293b' : '#64748b', boxShadow: amountMode === 'annual' ? '0 2px 4px rgba(0,0,0,0.05)' : 'none' }}>Cumulé An</button>
            </div>
            <select 
              value={selectedMonth} 
              onChange={e => setSelectedMonth(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', outline: 'none', fontWeight: 600, color: '#1e293b' }}
            >
              {availableMonths.map(m => (
                <option key={m} value={m}>
                  {new Date(m + '-01').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* TOP STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 32 }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, padding: 20 }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Total du mois ({new Date(selectedMonth + '-01').toLocaleDateString('fr-FR', { month: 'long' })})</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#15803d' }}>{monthlyTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</p>
          </div>
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: 20 }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: '#1e40af', textTransform: 'uppercase' }}>Total cumulé de l'année ({selectedYear})</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 900, color: '#1d4ed8' }}>{annualTotal.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</p>
          </div>
        </div>

        {/* MAIN DATA TABLE / LIST */}
        <div style={{ border: '1px solid #f1f5f9', borderRadius: 12, overflow: 'hidden' }}>
          {recapMode === 'details' ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ width: 40 }}></th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', color: '#475569', fontWeight: 700 }}>Date</th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', color: '#475569', fontWeight: 700 }}>Direction / Service</th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', color: '#475569', fontWeight: 700 }}>N° Commande</th>
                  <th style={{ padding: '14px 16px', textAlign: 'left', color: '#475569', fontWeight: 700 }}>Type</th>
                  <th style={{ padding: '14px 16px', textAlign: 'right', color: '#475569', fontWeight: 700 }}>Montant TTC</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length === 0 ? (
                  <tr><td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8' }}>Aucune commande</td></tr>
                ) : (
                  filteredRequests.map(r => (
                    <React.Fragment key={r.id}>
                      <tr 
                        onClick={() => toggleRequest(r.id)}
                        style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                      >
                        <td style={{ textAlign: 'center', color: '#94a3b8' }}>
                          {expandedRequests.includes(r.id) ? <ChevronRight size={16} style={{ transform: 'rotate(90deg)', transition: '0.2s' }} /> : <ChevronRight size={16} style={{ transition: '0.2s' }} />}
                        </td>
                        <td style={{ padding: '12px 16px', color: '#1e293b', fontWeight: 500 }}>{new Date(r.date_commande).toLocaleDateString('fr-FR')}</td>
                        <td style={{ padding: '12px 16px' }}>
                          <p style={{ margin: 0, fontWeight: 700, color: '#1e293b' }}>{r.direction}</p>
                          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>{r.service}</p>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ fontWeight: 600, color: '#3b82f6' }}>{r.order_number}</span>
                          <p style={{ margin: 0, fontSize: 11, color: '#94a3b8' }}>{r.tier}</p>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {r.is_school ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 700 }}>
                              <Building2 size={12} /> École
                            </span>
                          ) : <span style={{ fontSize: 11, color: '#94a3b8' }}>Standard</span>}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 800, color: '#1e293b' }}>
                          {Number(r.total_amount_ttc).toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </td>
                      </tr>
                      {expandedRequests.includes(r.id) && (
                        <tr style={{ background: '#f1f5f9' }}>
                          <td colSpan={6} style={{ padding: '12px 24px' }}>
                            <div style={{ background: 'white', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' }}>
                              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#64748b' }}>Contenu de la commande :</p>
                              <table style={{ width: '100%', fontSize: 13 }}>
                                <tbody>
                                  {r.articles.map((art, idx) => (
                                    <tr key={idx}>
                                      <td style={{ padding: '4px 0', color: '#1e293b', fontWeight: 600 }}>{art.article}</td>
                                      <td style={{ padding: '4px 0', textAlign: 'right', color: 'var(--primary-color)', fontWeight: 700 }}>×{art.quantite}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 14 }}>
              <div style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', display: 'grid', gridTemplateColumns: '1fr 180px', padding: '14px 16px', fontWeight: 700, color: '#475569' }}>
                <div>Direction / Service</div>
                <div style={{ textAlign: 'right' }}>Montant {amountMode === 'month' ? 'du mois' : 'cumulé'}</div>
              </div>
              {Object.keys(globalData).length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Aucune donnée à afficher</div>
              ) : (
                Object.keys(globalData).sort().map(dir => (
                  <div key={dir}>
                    <div 
                      onClick={() => toggleDirection(dir)}
                      style={{ display: 'grid', gridTemplateColumns: '1fr 180px', padding: '14px 16px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', background: expandedDirections.includes(dir) ? '#f8fafc' : 'white' }}
                      onMouseEnter={e => !expandedDirections.includes(dir) && (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => !expandedDirections.includes(dir) && (e.currentTarget.style.background = 'white')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        {expandedDirections.includes(dir) ? <ChevronRight size={16} style={{ transform: 'rotate(90deg)' }} /> : <ChevronRight size={16} />}
                        <span style={{ fontWeight: 700, color: '#1e293b' }}>{dir}</span>
                      </div>
                      <div style={{ textAlign: 'right', fontWeight: 800, color: 'var(--secondary-color)' }}>
                        {globalData[dir].total.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                      </div>
                    </div>
                    {expandedDirections.includes(dir) && Object.keys(globalData[dir].services).sort().map(svc => (
                      <div key={svc} style={{ display: 'grid', gridTemplateColumns: '1fr 180px', padding: '10px 16px 10px 42px', borderBottom: '1px solid #f1f5f9', background: '#fcfdfe' }}>
                        <div style={{ color: '#64748b', fontSize: 13 }}>{svc}</div>
                        <div style={{ textAlign: 'right', fontWeight: 600, color: '#1e293b', fontSize: 13 }}>
                          {globalData[dir].services[svc].toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ConsommablesManagement;
