import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Truck, ChevronLeft, ChevronRight, Package, AlertCircle, Building2, User, Calendar, ShoppingCart, Trash2 } from 'lucide-react';
import { resolveDesignationImageUrl } from '../utils/designationImages';

interface Category { id: number; name: string; display_name: string; }
interface Equipment {
  id: number; category_id: number | null; name: string; description: string;
  total_quantity: number; image_path?: string | null; available?: number;
}
interface CartItem { equipment_id: number; name: string; quantity: number; available: number; image_path?: string | null; }

interface PretRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  displayName: string;
  username: string;
}

const PretRequestModal: React.FC<PretRequestModalProps> = ({ isOpen, onClose, token, displayName }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [categories, setCategories] = useState<Category[]>([]);
  const [available, setAvailable] = useState<Equipment[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [motif, setMotif] = useState('');
  const [direction, setDirection] = useState('');
  const [service, setService] = useState('');
  // Lecture seule (affiché mais non modifiable) : pas besoin d'état local, la
  // valeur suit directement le prop displayName.
  const nomDemandeur = displayName;

  useEffect(() => {
    if (isOpen) {
      loadCategories();
      loadADUserInfo();
    } else {
      setStep(1);
      setCategoryFilter('');
      setAvailable([]);
      setCart([]);
      setError('');
      setMotif('');
    }
  }, [isOpen]);

  const loadCategories = async () => {
    try {
      const res = await axios.get('/api/prets/categories', { headers: { Authorization: `Bearer ${token}` } });
      setCategories(res.data);
    } catch (e) { console.error('Erreur chargement catégories:', e); }
  };

  const loadADUserInfo = async () => {
    try {
      const res = await axios.get('/api/ad/my-info', { headers: { Authorization: `Bearer ${token}` } });
      const { service: s, direction: d } = res.data;
      setService(prev => s || prev);
      setDirection(prev => d || prev);
    } catch (e) { console.error('Erreur chargement infos AD:', e); }
  };

  const loadAvailableEquipment = async () => {
    try {
      const res = await axios.get('/api/prets/equipment', {
        headers: { Authorization: `Bearer ${token}` },
        params: { start_date: startDate, end_date: endDate, only_available: 1, category_id: categoryFilter || undefined },
      });
      setAvailable(res.data);
    } catch (e) { console.error('Erreur chargement matériel disponible:', e); setAvailable([]); }
  };

  const goToStep2 = () => {
    if (new Date(endDate) <= new Date(startDate)) { setError('La date de retour doit être postérieure à la date de début'); return; }
    setError('');
    setStep(2);
  };

  useEffect(() => {
    if (step === 2) loadAvailableEquipment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, categoryFilter]);

  const addToCart = (eq: Equipment, qty: number) => {
    const max = eq.available ?? 0;
    if (qty <= 0 || qty > max) return; // blocage strict : jamais plus que la dispo
    setCart(prev => {
      const existing = prev.find(i => i.equipment_id === eq.id);
      if (existing) return prev.map(i => i.equipment_id === eq.id ? { ...i, quantity: Math.min(i.quantity + qty, max) } : i);
      return [...prev, { equipment_id: eq.id, name: eq.name, quantity: qty, available: max, image_path: eq.image_path }];
    });
  };
  const removeFromCart = (equipmentId: number) => setCart(prev => prev.filter(i => i.equipment_id !== equipmentId));
  // Ajuste la quantité directement depuis le panier (+/-), toujours plafonnée
  // à la disponibilité — jamais de dépassement possible côté MagApp.
  const updateCartQty = (equipmentId: number, nextQty: number) => {
    setCart(prev => {
      if (nextQty <= 0) return prev.filter(i => i.equipment_id !== equipmentId);
      return prev.map(i => i.equipment_id === equipmentId ? { ...i, quantity: Math.min(nextQty, i.available) } : i);
    });
  };

  const handleSubmit = async () => {
    if (cart.length === 0) { setError('Votre panier est vide'); return; }
    if (!motif.trim()) { setError('Veuillez préciser le motif du prêt'); return; }

    setLoading(true);
    try {
      setError('');
      await axios.post('/api/prets/loans', {
        items: cart.map(i => ({ equipment_id: i.equipment_id, quantity: i.quantity })),
        start_date: startDate, end_date: endDate, motif, direction, service, nom_demandeur: nomDemandeur,
      }, { headers: { Authorization: `Bearer ${token}` } });

      alert('Votre demande de prêt a été confirmée. Le retrait se fait auprès de la DSI.');
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur lors de la création de la demande');
    } finally { setLoading(false); }
  };

  if (!isOpen) return null;

  const cartTotalQty = cart.reduce((s, i) => s + i.quantity, 0);

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '20px' }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '100%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#0891b2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}><Truck size={22} /></div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#1e293b' }}>Demander un prêt de matériel</h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>Étape {step} sur 3</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '50%' }}><X size={24} color="#64748b" /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {error && <div style={{ marginBottom: '20px', padding: '12px 16px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#b91c1c', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}><AlertCircle size={18} />{error}</div>}

          {step === 1 && (
            <div>
              <h4 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Pour quelle période avez-vous besoin de matériel ?</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: 20 }}>
                <div>
                  <label style={labelStyle}><Calendar size={14} style={{ marginRight: 4 }} />Date de début</label>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}><Calendar size={14} style={{ marginRight: 4 }} />Date de retour</label>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={goToStep2} style={{ padding: '12px 24px', background: '#0891b2', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  Voir le matériel disponible <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: '16px', flexWrap: 'wrap' }}>
                <button onClick={() => setStep(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', display: 'flex', alignItems: 'center', fontSize: '0.9rem', fontWeight: 600 }}>
                  <ChevronLeft size={18} /> {startDate} → {endDate}
                </button>
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value ? Number(e.target.value) : '')} style={{ ...inputStyle, width: 200 }}>
                  <option value="">Toutes catégories</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '14px' }}>
                {available.map(eq => (
                  <EquipmentPickCard key={eq.id} equipment={eq} inCartQty={cart.find(i => i.equipment_id === eq.id)?.quantity || 0} onAdd={(q) => addToCart(eq, q)} />
                ))}
                {available.length === 0 && <p style={{ color: '#94a3b8' }}>Aucun matériel disponible sur ces dates.</p>}
              </div>

              {cart.length > 0 && (
                <div style={{ marginTop: 20, background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 14, padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: '#0e7490', fontWeight: 800, fontSize: '0.95rem' }}>
                    <ShoppingCart size={17} /> Votre panier — {cartTotalQty} article{cartTotalQty > 1 ? 's' : ''}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {cart.map(i => (
                      <div key={i.equipment_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'white', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        <div style={{ width: 38, height: 38, borderRadius: 8, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                          {i.image_path ? <img src={resolveDesignationImageUrl(i.image_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Package size={18} color="#94a3b8" />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{i.available} disponible(s)</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                          <button onClick={() => updateCartQty(i.equipment_id, i.quantity - 1)} style={stepperBtnStyle}>−</button>
                          <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 700, fontSize: '0.9rem' }}>{i.quantity}</span>
                          <button onClick={() => updateCartQty(i.equipment_id, i.quantity + 1)} disabled={i.quantity >= i.available} style={{ ...stepperBtnStyle, opacity: i.quantity >= i.available ? 0.4 : 1, cursor: i.quantity >= i.available ? 'not-allowed' : 'pointer' }}>+</button>
                        </div>
                        <button onClick={() => removeFromCart(i.equipment_id)} title="Retirer du panier" style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', flexShrink: 0 }}><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
                    <button onClick={() => setStep(3)} style={{ padding: '12px 24px', background: '#0891b2', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      Continuer <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <button onClick={() => setStep(2)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0891b2', display: 'flex', alignItems: 'center', fontSize: '0.9rem', fontWeight: 600 }}><ChevronLeft size={18} /> Retour au panier</button>
              </div>

              <div style={{ marginBottom: 16, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
                {cart.map(i => (
                  <div key={i.equipment_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: '0.88rem' }}>
                    <span style={{ fontWeight: 600, color: '#1e293b' }}>{i.name}</span><span style={{ color: '#0891b2', fontWeight: 700 }}>× {i.quantity}</span>
                  </div>
                ))}
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: '0.82rem', color: '#64748b' }}>Du <strong>{startDate}</strong> au <strong>{endDate}</strong></div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Motif *</label>
                  <textarea value={motif} onChange={e => setMotif(e.target.value)} style={{ ...inputStyle, minHeight: 70 }} placeholder="Ex: déplacement, réunion externe, remplacement matériel..." />
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}><Building2 size={14} style={{ marginRight: 4 }} />Direction</label>
                  <input type="text" value={direction} disabled style={{ ...inputStyle, background: '#f8fafc', color: '#64748b' }} />
                </div>
                <div>
                  <label style={labelStyle}><Building2 size={14} style={{ marginRight: 4 }} />Service</label>
                  <input type="text" value={service} disabled style={{ ...inputStyle, background: '#f8fafc', color: '#64748b' }} />
                </div>
                <div>
                  <label style={labelStyle}><User size={14} style={{ marginRight: 4 }} />Demandeur</label>
                  <input type="text" value={nomDemandeur} disabled style={{ ...inputStyle, background: '#f8fafc', color: '#64748b' }} />
                </div>
              </div>

              <div style={{ padding: '10px 14px', background: '#f0f9ff', borderRadius: 8, fontSize: '0.8rem', color: '#0369a1', marginBottom: 16 }}>
                Le retrait et le retour du matériel se font auprès de la DSI. Votre réservation est confirmée immédiatement.
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleSubmit} disabled={loading} style={{ padding: '12px 32px', background: '#0891b2', color: 'white', border: 'none', borderRadius: '8px', fontSize: '1rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: loading ? 0.7 : 1 }}>
                  {loading ? '...' : 'Confirmer la réservation'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const EquipmentPickCard: React.FC<{ equipment: Equipment; inCartQty: number; onAdd: (qty: number) => void }> = ({ equipment, inCartQty, onAdd }) => {
  const [qty, setQty] = useState<number | ''>(1);
  const max = equipment.available ?? 0;
  const numQty = qty === '' ? 0 : qty;
  // Blocage strict : impossible de demander plus que la disponibilité sur la
  // période choisie — pas de clamp silencieux, un avertissement s'affiche et
  // le bouton "Ajouter" reste désactivé tant que la quantité dépasse.
  const exceeds = numQty > max;
  return (
    <div style={{ padding: '14px', background: inCartQty > 0 ? '#f0fdf4' : 'white', border: `1.5px solid ${inCartQty > 0 ? '#86efac' : '#e2e8f0'}`, borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ width: '100%', height: '90px', borderRadius: '8px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {equipment.image_path ? <img src={resolveDesignationImageUrl(equipment.image_path)} alt={equipment.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Package size={32} color="#cbd5e1" />}
      </div>
      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e293b' }}>{equipment.name}</span>
      {equipment.description && <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{equipment.description}</span>}
      <span style={{ fontSize: '0.75rem', color: '#0891b2', fontWeight: 700 }}>{max} disponible(s) sur la période</span>
      {inCartQty > 0 && <div style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700, alignSelf: 'flex-start' }}>{inCartQty} au panier</div>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <input type="number" min={1} max={max} value={qty} onChange={e => setQty(e.target.value === '' ? '' : Number(e.target.value))}
          style={{ width: '56px', padding: '8px', border: `1px solid ${exceeds ? '#dc2626' : '#e2e8f0'}`, borderRadius: '8px', textAlign: 'center', fontSize: '0.9rem' }} />
        <button
          disabled={max <= 0 || numQty <= 0 || exceeds}
          onClick={() => { if (numQty > 0 && numQty <= max) { onAdd(numQty); setQty(1); } }}
          style={{ flex: 1, padding: '8px 12px', border: 'none', borderRadius: '8px', background: (max <= 0 || numQty <= 0 || exceeds) ? '#cbd5e1' : '#0891b2', color: 'white', cursor: (max <= 0 || numQty <= 0 || exceeds) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
        >
          Ajouter
        </button>
      </div>
      {exceeds && (
        <div style={{ fontSize: '0.72rem', color: '#dc2626', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertCircle size={12} /> Quantité supérieure à la disponibilité ({max} max)
        </div>
      )}
    </div>
  );
};

const inputStyle: React.CSSProperties = { width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box', fontSize: '0.9rem' };
const labelStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', marginBottom: '6px', fontWeight: 600, color: '#475569', fontSize: '0.85rem' };
const stepperBtnStyle: React.CSSProperties = { width: 24, height: 24, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#334155', fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', lineHeight: 1, padding: 0 };

export default PretRequestModal;
