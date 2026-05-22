import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, ShoppingCart, ChevronLeft, ChevronRight, Package, Printer, AlertCircle, Building2, User } from 'lucide-react';

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
  ref_commande?: string;
}

interface CartItem {
  catalogId: number;
  designation: string;
  article: string;
  codeFabricant: string;
  refCommande: string;
  quantite: number;
}

interface ConsumableRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  displayName: string;
  username: string;
}

const ConsumableRequestModal: React.FC<ConsumableRequestModalProps> = ({ isOpen, onClose, token, displayName, username }) => {
  const [step, setStep] = useState(1);
  const [consumableTypes, setConsumableTypes] = useState<ConsumableType[]>([]);
  const [designations, setDesignations] = useState<string[]>([]);
  const [consumableArticles, setConsumableArticles] = useState<ConsumableArticle[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<number>(0);
  const [selectedDesignation, setSelectedDesignation] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [designationImages, setDesignationImages] = useState<Record<string, { image_path: string }>>({});
  
  const [formData, setFormData] = useState({
    date_commande: new Date().toISOString().split('T')[0],
    direction: '',
    service: '',
    nom_referent: displayName || username || '',
    tel_complet: '',
    user_comment: '',
    printer_model: ''
  });

  const [isPrinterModelRequired, setIsPrinterModelRequired] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadTypes();
      loadDesignationImages();
      loadADUserInfo();
    } else {
      setStep(1);
      setCart([]);
      setSelectedTypeId(0);
      setSelectedDesignation('');
      setError('');
      setFormData(prev => ({ ...prev, user_comment: '', printer_model: '' }));
    }
  }, [isOpen]);

  const loadTypes = async () => {
    try {
      const response = await axios.get('/api/consumable/types', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConsumableTypes(response.data);
    } catch (error) {
      console.error('Error loading types:', error);
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

  const loadDesignations = async (typeId: number) => {
    try {
      const response = await axios.get(`/api/consumable/designations/${typeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDesignations(response.data);
    } catch (error) {
      console.error('Error loading designations:', error);
    }
  };

  const loadConsumableArticles = async (typeId: number, designation?: string) => {
    try {
      const url = designation
        ? `/api/consumable/articles/${typeId}?designation=${encodeURIComponent(designation)}`
        : `/api/consumable/articles/${typeId}`;
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setConsumableArticles(response.data);
    } catch (error) {
      console.error('Error loading articles:', error);
    }
  };

  const isSkipPrinterType = (typeName: string) => {
    const upper = typeName.toUpperCase();
    return upper.includes('DIVERS') || upper.includes('MONO');
  };

  const handleTypeSelect = async (type: ConsumableType) => {
    setSelectedTypeId(type.id);
    const skip = isSkipPrinterType(type.display_name || type.name);
    setIsPrinterModelRequired(skip);
    if (skip) {
      await loadConsumableArticles(type.id);
      setStep(4);
    } else {
      await loadDesignations(type.id);
      setStep(3);
    }
  };

  const handleDesignationSelect = async (designation: string) => {
    setSelectedDesignation(designation);
    await loadConsumableArticles(selectedTypeId, designation);
    setStep(4);
  };

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

  const handleSubmit = async () => {
    if (cart.length === 0) {
      setError('Votre panier est vide');
      return;
    }

    if (!formData.direction || !formData.service || !formData.nom_referent) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    if (isPrinterModelRequired && !formData.printer_model) {
      setError('Veuillez préciser le modèle de l\'imprimante');
      return;
    }

    setLoading(true);
    const articles = cart.map(item => ({
      id: item.catalogId,
      quantite: item.quantite,
    }));

    const finalComment = isPrinterModelRequired 
      ? `Modèle: ${formData.printer_model}. ${formData.user_comment}` 
      : formData.user_comment;

    try {
      setError('');
      await axios.post('/api/consumable/requests', {
        date_commande: formData.date_commande,
        direction: formData.direction,
        service: formData.service,
        nom_referent: formData.nom_referent,
        tel_complet: formData.tel_complet,
        type_id: selectedTypeId,
        user_comment: finalComment,
        articles,
      }, {
        headers: { Authorization: `Bearer ${token}` },
      });

      alert('Votre demande a été envoyée avec succès');
      onClose();
    } catch (error: any) {
      setError(error.response?.data?.error || 'Erreur lors de la création de la demande');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#0078a4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}><ShoppingCart size={22} /></div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Commander des consommables</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Étape {step} sur 5</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}><X size={24} color="#64748b" /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {error && <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={18} />{error}</div>}

          {step === 1 && (
            <div>
              <h4 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Sélectionnez le type de consommable</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                {consumableTypes.map(type => (
                  <button key={type.id} onClick={() => handleTypeSelect(type)} style={{ padding: '24px 16px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', transition: 'all 0.2s' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0078a4' }}><Package size={24} /></div>
                    <span style={{ fontWeight: 700, color: '#334155' }}>{type.display_name || type.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0078a4', display: 'flex', alignItems: 'center', fontSize: '0.9rem', fontWeight: 600 }}><ChevronLeft size={18} /> Retour</button>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Modèle de l'imprimante</h4>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '12px' }}>
                {designations.map(des => (
                  <button key={des} onClick={() => handleDesignationSelect(des)} style={{ padding: '16px', background: 'white', border: '1.5px solid #e2e8f0', borderRadius: '12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', transition: 'all 0.2s' }}>
                    <div style={{ width: '100%', height: '100px', borderRadius: '8px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {designationImages[des] ? (
                        <img 
                          src={`/api/consumable/images/${encodeURIComponent(des)}`} 
                          alt={des} 
                          style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '8px' }} 
                          onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            img.style.display = 'none';
                            const parent = img.parentElement;
                            if (parent) parent.querySelector<HTMLElement>('.fallback-icon')!.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div className="fallback-icon" style={{ display: designationImages[des] ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Printer size={40} color="#cbd5e1" />
                      </div>
                    </div>

                    <span style={{ fontWeight: 600, fontSize: '0.85rem', textAlign: 'center', color: '#334155' }}>{des}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              {isPrinterModelRequired && (
                <div style={{ marginBottom: '16px', padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <p style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#475569' }}>Désignation : <span style={{ color: '#1e293b' }}>{selectedDesignation || 'Non spécifié'}</span></p>
                </div>
              )}
              {isPrinterModelRequired && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>Modèle de l'imprimante *</label>
                  <input
                    type="text"
                    value={formData.printer_model}
                    onChange={(e) => setFormData({ ...formData, printer_model: e.target.value })}
                    style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box' }}
                    placeholder="Ex: HP LaserJet Pro..."
                  />
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => isSkipPrinterType(consumableTypes.find(t => t.id === selectedTypeId)?.name || '') ? setStep(1) : setStep(3)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0078a4', display: 'flex', alignItems: 'center', fontSize: '0.9rem', fontWeight: 600 }}><ChevronLeft size={18} /> Retour</button>
                  <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Articles disponibles</h4>
                </div>
                {cart.length > 0 && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f0f9ff', padding: '6px 12px', borderRadius: '20px', color: '#0078a4', fontSize: '0.85rem', fontWeight: 700 }}><ShoppingCart size={16} /> {cart.reduce((s, i) => s + i.quantite, 0)} articles</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {consumableArticles.map(article => <ArticleRow key={article.id} article={article} inCartQty={cart.find(i => i.catalogId === article.id)?.quantite || 0} onAdd={(q) => addToCart(article, q)} />)}
              </div>
              {cart.length > 0 && (
                <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setStep(5)} style={{ padding: '12px 24px', background: '#0078a4', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}>Suivant <ChevronRight size={18} /></button>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}><button onClick={() => setStep(4)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0078a4', display: 'flex', alignItems: 'center', fontSize: '0.9rem', fontWeight: 600 }}><ChevronLeft size={18} /> Retour au panier</button></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>Direction</label>
                  <div style={{ position: 'relative' }}><Building2 size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} /><input type="text" value={formData.direction} disabled style={{ width: '100%', padding: '12px 12px 12px 40px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box', background: '#f8fafc', color: '#64748b' }} /></div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>Service</label>
                  <div style={{ position: 'relative' }}><Package size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} /><input type="text" value={formData.service} disabled style={{ width: '100%', padding: '12px 12px 12px 40px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box', background: '#f8fafc', color: '#64748b' }} /></div>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>Demandeur</label>
                  <div style={{ position: 'relative' }}><User size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} /><input type="text" value={formData.nom_referent} disabled style={{ width: '100%', padding: '12px 12px 12px 40px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box', background: '#f8fafc', color: '#64748b' }} /></div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, color: '#475569', fontSize: '0.9rem' }}>Annotation</label>
                  <textarea value={formData.user_comment} onChange={(e) => setFormData({ ...formData, user_comment: e.target.value })} style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box', minHeight: '80px' }} placeholder="Précisions sur la commande..." />
                </div>
              </div>
              <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button onClick={() => setStep(1)} style={{ padding: '12px 24px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}>Ajouter un autre article</button>
                <button onClick={handleSubmit} disabled={loading} style={{ padding: '12px 32px', background: '#059669', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: loading ? 0.7 : 1 }}>{loading ? '...' : 'Confirmer'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ArticleRow: React.FC<{ article: ConsumableArticle, inCartQty: number, onAdd: (q: number) => void }> = ({ article, inCartQty, onAdd }) => {
  const [qty, setQty] = useState(1);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: '1.5px solid #e2e8f0', borderRadius: '10px', background: inCartQty > 0 ? '#f0fdf4' : 'white', borderColor: inCartQty > 0 ? '#86efac' : '#e2e8f0', gap: '12px' }}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#1e293b' }}>
          {article.designation || article.article}
        </p>
        {article.designation && (
          <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: '#64748b' }}>
            {article.article}
          </p>
        )}
      </div>
      {inCartQty > 0 && <div style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700 }}>{inCartQty} au panier</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><input type="number" min="1" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: '50px', padding: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', textAlign: 'center', fontSize: '0.9rem' }} /><button onClick={() => { onAdd(qty); setQty(1); }} style={{ padding: '8px 12px', border: 'none', borderRadius: '8px', background: '#0078a4', color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}>Ajouter</button></div>
    </div>
  );
};

export default ConsumableRequestModal;
