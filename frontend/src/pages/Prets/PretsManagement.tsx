import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import Header from '../../components/Header';
import { useAuth } from '../../contexts/AuthContext';
import {
  Plus, Edit2, Trash2, X, Package, Tag, Calendar, CalendarRange, ChevronLeft, ChevronRight,
  Truck, RotateCcw, Ban, Settings, AlertTriangle, ScanLine, Image as ImageIcon, FileText, Clock,
} from 'lucide-react';
import SignaturePad from '../Stocks/SignaturePad';
import BarcodeScanner from '../Stocks/BarcodeScanner';
import { resolveDesignationImageUrl } from '../../utils/designationImages';

// ═══════════════════ Types ═══════════════════

interface Category { id: number; name: string; display_name: string; icon?: string; display_order: number; }
interface Equipment {
  id: number; category_id: number | null; category_name?: string; category_display_name?: string;
  name: string; description: string; total_quantity: number; image_path?: string | null;
  active: boolean; units_registered?: number;
  available_now?: number; next_arrival_date?: string | null; next_arrival_quantity?: number | null;
  available?: number; // annoté seulement quand start_date/end_date sont passés à l'API
}
type EquipDraft = Partial<Equipment> & { arrival_date?: string };
interface EquipmentUnit { id: number; equipment_id: number; inventory_number: string; status: 'available' | 'loaned' | 'maintenance' | 'lost'; }
interface ArrivalLot { id: number; equipment_id: number; quantity: number; arrival_date: string; note?: string | null; }
interface Loan {
  id: number; equipment_id: number; equipment_name: string; quantity: number;
  username?: string; email?: string; nom_demandeur?: string; direction?: string; service?: string; motif?: string;
  start_date: string; end_date: string; status: 'confirmed' | 'delivered' | 'returned' | 'cancelled';
  fiche_remise_document_id?: number | null; fiche_retour_document_id?: number | null;
  delivered_by?: string; delivered_at?: string; returned_by?: string; returned_at?: string;
  is_overdue?: boolean; batch_id?: number | null; is_internal?: boolean;
}
interface DayAvail { date: string; reserved: number; total: number; remaining: number; }
interface GridCell { total: number; reserved: number; remaining: number; }
interface GridEquipment { id: number; name: string; category_id: number | null; category_name: string; cells: Record<string, GridCell>; }
interface CartItem { equipment_id: number; name: string; quantity: number; available: number; image_path?: string | null; forced?: boolean; }

const STATUS_LABEL: Record<string, string> = { confirmed: 'Réservé', delivered: 'En cours', returned: 'Retourné', cancelled: 'Annulé' };
const STATUS_COLOR: Record<string, string> = { confirmed: '#0891b2', delivered: '#f59e0b', returned: '#16a34a', cancelled: '#94a3b8' };

const fmt = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR') : '');
const todayStr = () => new Date().toISOString().slice(0, 10);

const PretsManagement: React.FC = () => {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [activeTab, setActiveTab] = useState<'reservations' | 'retours' | 'catalogue' | 'calendrier' | 'general' | 'reglages'>('reservations');
  const [categories, setCategories] = useState<Category[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [upcomingReturns, setUpcomingReturns] = useState<Loan[]>([]);
  const [loanFilter, setLoanFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showNewLoan, setShowNewLoan] = useState(false);

  const loadCategories = useCallback(() => {
    axios.get('/api/prets/categories', { headers }).then(r => setCategories(r.data)).catch(() => {});
  }, [token]);
  const loadEquipment = useCallback(() => {
    axios.get('/api/prets/equipment', { headers, params: { include_inactive: 1 } }).then(r => setEquipment(r.data)).catch(() => {});
  }, [token]);
  const loadLoans = useCallback(() => {
    setLoading(true);
    const params: any = {};
    if (loanFilter) params.status = loanFilter;
    axios.get('/api/prets/admin/loans', { headers, params }).then(r => setLoans(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [token, loanFilter]);
  const loadUpcomingReturns = useCallback(() => {
    axios.get('/api/prets/admin/loans/upcoming-returns', { headers }).then(r => setUpcomingReturns(r.data)).catch(() => {});
  }, [token]);

  useEffect(() => { loadCategories(); loadEquipment(); }, [loadCategories, loadEquipment]);
  useEffect(() => { if (activeTab === 'reservations') loadLoans(); }, [activeTab, loadLoans]);
  useEffect(() => { if (activeTab === 'retours') loadUpcomingReturns(); }, [activeTab, loadUpcomingReturns]);

  const [deliverLoan, setDeliverLoan] = useState<Loan | null>(null);
  const [returnLoan, setReturnLoan] = useState<Loan | null>(null);
  const [deliverGroup, setDeliverGroup] = useState<Loan[] | null>(null);
  const [returnGroup, setReturnGroup] = useState<Loan[] | null>(null);

  const cancelLoan = async (loan: Loan) => {
    if (!window.confirm(`Annuler la réservation #${loan.id} (${loan.equipment_name}) ?`)) return;
    try {
      await axios.post(`/api/prets/admin/loans/${loan.id}/cancel`, {}, { headers });
      loadLoans();
    } catch (e: any) { alert(e.response?.data?.error || 'Erreur lors de l\'annulation'); }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc' }}>
      <Header />
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 20px 60px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#0078a4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
            <Truck size={24} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#1e293b' }}>Prêts de matériel</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.9rem' }}>Stock, calendrier de disponibilité et suivi des prêts en cours</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 20, borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap' }}>
          {([
            ['reservations', 'Réservations', Package],
            ['retours', 'Retours attendus', Clock],
            ['catalogue', 'Catalogue', Tag],
            ['calendrier', 'Calendrier', Calendar],
            ['general', 'Vue générale', CalendarRange],
            ['reglages', 'Réglages', Settings],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              style={{
                padding: '10px 16px', background: 'none', border: 'none', borderBottom: activeTab === key ? '3px solid #0078a4' : '3px solid transparent',
                color: activeTab === key ? '#0078a4' : '#64748b', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
              }}>
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {activeTab === 'reservations' && (
          <ReservationsTab
            loans={loans} loading={loading} filter={loanFilter} setFilter={setLoanFilter}
            onDeliver={setDeliverLoan} onReturn={setReturnLoan} onCancel={cancelLoan}
            onDeliverGroup={setDeliverGroup} onReturnGroup={setReturnGroup}
            onNewLoan={() => setShowNewLoan(true)}
          />
        )}
        {activeTab === 'retours' && <RetoursTab loans={upcomingReturns} onReturn={setReturnLoan} />}
        {activeTab === 'catalogue' && (
          <CatalogueTab
            categories={categories} equipment={equipment} headers={headers}
            reload={() => { loadCategories(); loadEquipment(); }}
          />
        )}
        {activeTab === 'calendrier' && <CalendrierTab equipment={equipment} headers={headers} />}
        {activeTab === 'general' && <VueGeneraleTab categories={categories} headers={headers} />}
        {activeTab === 'reglages' && <ReglagesTab headers={headers} />}
      </div>

      {deliverLoan && (
        <DeliverModal loan={deliverLoan} headers={headers} onClose={() => setDeliverLoan(null)}
          onDone={() => { setDeliverLoan(null); loadLoans(); loadUpcomingReturns(); }} />
      )}
      {returnLoan && (
        <ReturnModal loan={returnLoan} headers={headers} onClose={() => setReturnLoan(null)}
          onDone={() => { setReturnLoan(null); loadLoans(); loadUpcomingReturns(); }} />
      )}
      {showNewLoan && (
        <AdminNewLoanModal categories={categories} headers={headers} onClose={() => setShowNewLoan(false)}
          onDone={() => { setShowNewLoan(false); loadLoans(); }} />
      )}
      {deliverGroup && (
        <DeliverGroupModal group={deliverGroup} headers={headers} onClose={() => setDeliverGroup(null)}
          onDone={() => { setDeliverGroup(null); loadLoans(); loadUpcomingReturns(); }} />
      )}
      {returnGroup && (
        <ReturnGroupModal group={returnGroup} headers={headers} onClose={() => setReturnGroup(null)}
          onDone={() => { setReturnGroup(null); loadLoans(); loadUpcomingReturns(); }} />
      )}
    </div>
  );
};

// ═══════════════════ Réservations ═══════════════════

const btnStyle: React.CSSProperties = { padding: '6px 10px', borderRadius: 7, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 };
const errorBoxStyle: React.CSSProperties = { marginBottom: 12, padding: 10, background: '#fef2f2', color: '#b91c1c', borderRadius: 8, fontSize: '0.85rem' };

const ReservationsTab: React.FC<{
  loans: Loan[]; loading: boolean; filter: string; setFilter: (f: string) => void;
  onDeliver: (l: Loan) => void; onReturn: (l: Loan) => void; onCancel: (l: Loan) => void;
  onDeliverGroup: (g: Loan[]) => void; onReturnGroup: (g: Loan[]) => void; onNewLoan: () => void;
}> = ({ loans, loading, filter, setFilter, onDeliver, onReturn, onCancel, onDeliverGroup, onReturnGroup, onNewLoan }) => {
  // Regroupe les lignes d'une même réservation (panier multi-matériel partageant
  // un batch_id) — une réservation à un seul article n'a pas de batch_id, elle
  // forme alors son propre groupe (clé = son propre id).
  const groups = useMemo(() => {
    const map = new Map<string, Loan[]>();
    for (const l of loans) {
      const key = l.batch_id ? `b${l.batch_id}` : `l${l.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    }
    return Array.from(map.values());
  }, [loans]);

  return (
    <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['', 'confirmed', 'delivered', 'returned', 'cancelled'].map(s => (
            <button key={s || 'all'} onClick={() => setFilter(s)}
              style={{ ...btnStyle, background: filter === s ? '#0078a4' : 'white', color: filter === s ? 'white' : '#475569', borderColor: filter === s ? '#0078a4' : '#e2e8f0' }}>
              {s ? STATUS_LABEL[s] : 'Tous'}
            </button>
          ))}
        </div>
        <button onClick={onNewLoan} style={{ ...btnStyle, background: '#0078a4', color: 'white', borderColor: '#0078a4' }}><Plus size={14} /> Nouvelle réservation (DSI)</button>
      </div>

      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading && <p style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Chargement…</p>}
        {!loading && groups.length === 0 && <p style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Aucune réservation</p>}
        {!loading && groups.map(group => {
          const first = group[0];
          const groupId = first.batch_id || first.id;
          const anyOverdue = group.some(l => l.is_overdue);
          return (
            <div key={groupId} style={{ border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', background: anyOverdue ? '#fef2f2' : '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                    Réservation #{groupId}
                    {group.length > 1 && <span style={{ padding: '1px 6px', borderRadius: 8, fontSize: '0.65rem', fontWeight: 700, background: '#e0f2fe', color: '#0369a1', fontFamily: 'inherit' }}>{group.length} articles</span>}
                  </div>
                  <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '1rem' }}>
                    {first.nom_demandeur || first.username || 'Demandeur inconnu'}
                    {first.service && <span style={{ fontWeight: 600, color: '#475569' }}> — {first.service}</span>}
                    {first.is_internal && <span style={{ marginLeft: 8, padding: '1px 6px', borderRadius: 8, fontSize: '0.62rem', fontWeight: 700, background: '#ede9fe', color: '#6d28d9' }}>DSI</span>}
                  </div>
                  {first.motif && <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 2 }}>{first.motif}</div>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                    Du <strong>{fmt(first.start_date)}</strong> au <strong>{fmt(first.end_date)}</strong>
                  </div>
                  {anyOverdue && <div style={{ color: '#dc2626', fontWeight: 700, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end', marginTop: 2 }}><AlertTriangle size={12} /> En retard</div>}
                  {group.length > 1 && group.some(l => l.status === 'confirmed') && (
                    <button style={{ ...btnStyle, marginTop: 6 }} onClick={() => onDeliverGroup(group)}><Truck size={13} /> Remise globale</button>
                  )}
                  {group.length > 1 && group.some(l => l.status === 'delivered') && (
                    <button style={{ ...btnStyle, marginTop: 6, marginLeft: 6 }} onClick={() => onReturnGroup(group)}><RotateCcw size={13} /> Retour global</button>
                  )}
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <tbody>
                  {group.map(l => (
                    <tr key={l.id} style={{ borderTop: '1px solid #f1f5f9', background: l.is_overdue ? '#fef2f2' : 'white' }}>
                      <td style={{ padding: '8px 14px', width: 1, whiteSpace: 'nowrap', fontFamily: 'monospace', color: '#cbd5e1', fontSize: '0.72rem' }}>#{l.id}</td>
                      <td style={{ padding: '8px 14px', fontWeight: 700, color: '#1e293b' }}>{l.equipment_name}</td>
                      <td style={{ padding: '8px 14px', width: 1, whiteSpace: 'nowrap' }}>× {l.quantity}</td>
                      <td style={{ padding: '8px 14px', width: 1, whiteSpace: 'nowrap' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: '0.72rem', fontWeight: 700, background: `${STATUS_COLOR[l.status]}20`, color: STATUS_COLOR[l.status] }}>{STATUS_LABEL[l.status]}</span>
                      </td>
                      <td style={{ padding: '8px 14px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {l.status === 'confirmed' && <button style={btnStyle} onClick={() => onDeliver(l)}><Truck size={13} /> Remettre</button>}
                        {l.status === 'delivered' && <button style={btnStyle} onClick={() => onReturn(l)}><RotateCcw size={13} /> Retourner</button>}
                        {l.status === 'confirmed' && <button style={{ ...btnStyle, color: '#dc2626' }} onClick={() => onCancel(l)}><Ban size={13} /> Annuler</button>}
                        {l.fiche_remise_document_id && <a href={`/api/prets/admin/fiche/${l.fiche_remise_document_id}`} target="_blank" rel="noreferrer" style={btnStyle}><FileText size={13} /> Remise</a>}
                        {l.fiche_retour_document_id && <a href={`/api/prets/admin/fiche/${l.fiche_retour_document_id}`} target="_blank" rel="noreferrer" style={btnStyle}><FileText size={13} /> Retour</a>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const RetoursTab: React.FC<{ loans: Loan[]; onReturn: (l: Loan) => void }> = ({ loans, onReturn }) => (
  <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead>
          <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            {['#', 'Matériel', 'Qté', 'Emprunteur', 'Remis le', 'Retour prévu', 'Actions'].map(h => (
              <th key={h} style={{ padding: '10px 14px', color: '#64748b', fontWeight: 700, fontSize: '0.75rem', textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loans.length === 0 && <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>Aucun retour attendu</td></tr>}
          {loans.map(l => (
            <tr key={l.id} style={{ borderTop: '1px solid #f1f5f9', background: l.is_overdue ? '#fef2f2' : 'white' }}>
              <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#64748b' }}>#{l.id}</td>
              <td style={{ padding: '10px 14px', fontWeight: 700 }}>{l.equipment_name}</td>
              <td style={{ padding: '10px 14px' }}>{l.quantity}</td>
              <td style={{ padding: '10px 14px' }}>{l.nom_demandeur || l.username}</td>
              <td style={{ padding: '10px 14px' }}>{fmt(l.delivered_at)}</td>
              <td style={{ padding: '10px 14px', fontWeight: l.is_overdue ? 800 : 400, color: l.is_overdue ? '#dc2626' : '#1e293b' }}>
                {fmt(l.end_date)}{l.is_overdue && <span> — en retard</span>}
              </td>
              <td style={{ padding: '10px 14px' }}><button style={btnStyle} onClick={() => onReturn(l)}><RotateCcw size={13} /> Retourner</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ═══════════════════ Nouvelle réservation (DSI / usage interne, panier multi-matériel) ═══════════════════

const AdminNewLoanModal: React.FC<{ categories: Category[]; headers: any; onClose: () => void; onDone: () => void }> = ({ categories, headers, onClose, onDone }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('');
  const [available, setAvailable] = useState<Equipment[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [motif, setMotif] = useState('');
  const [nomDemandeur, setNomDemandeur] = useState('DSI - usage interne');
  const [isInternal, setIsInternal] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (step !== 2) return;
    axios.get('/api/prets/equipment', {
      headers, params: { start_date: startDate, end_date: endDate, only_available: 1, category_id: categoryFilter || undefined },
    }).then(r => setAvailable(r.data)).catch(() => setAvailable([]));
  }, [step, categoryFilter, startDate, endDate]);

  // Contrairement au MagApp, un admin peut forcer une quantité au-delà de la
  // disponibilité (matériel prêté "en dur" en cas d'urgence) — le dépassement
  // est alors marqué `forced` pour afficher un avertissement et l'envoyer au
  // backend (`force: true`), qui reste seul juge (matériel introuvable/
  // désactivé ou dates invalides restent bloquants même en forçant).
  const addToCart = (eq: Equipment, qty: number) => {
    if (qty <= 0) return;
    const max = eq.available ?? 0;
    setCart(prev => {
      const existing = prev.find(i => i.equipment_id === eq.id);
      if (existing) {
        const nextQty = existing.quantity + qty;
        return prev.map(i => i.equipment_id === eq.id ? { ...i, quantity: nextQty, forced: nextQty > max } : i);
      }
      return [...prev, { equipment_id: eq.id, name: eq.name, quantity: qty, available: max, image_path: eq.image_path, forced: qty > max }];
    });
  };
  const removeFromCart = (equipmentId: number) => setCart(prev => prev.filter(i => i.equipment_id !== equipmentId));
  const updateCartQty = (equipmentId: number, nextQty: number) => {
    setCart(prev => {
      if (nextQty <= 0) return prev.filter(i => i.equipment_id !== equipmentId);
      return prev.map(i => i.equipment_id === equipmentId ? { ...i, quantity: nextQty, forced: nextQty > i.available } : i);
    });
  };
  const hasForcedItems = cart.some(i => i.forced);

  const submit = async () => {
    if (!motif.trim() || !nomDemandeur.trim() || cart.length === 0) { setError('Demandeur, motif et au moins un article sont requis'); return; }
    setSaving(true); setError('');
    try {
      await axios.post('/api/prets/admin/loans', {
        items: cart.map(i => ({ equipment_id: i.equipment_id, quantity: i.quantity })),
        start_date: startDate, end_date: endDate, motif, nom_demandeur: nomDemandeur, is_internal: isInternal,
        direction: isInternal ? 'DSI' : undefined, service: isInternal ? 'DSI' : undefined,
        force: hasForcedItems,
      }, { headers });
      onDone();
    } catch (e: any) { setError(e.response?.data?.error || 'Erreur lors de la réservation'); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title="Nouvelle réservation" onClose={onClose} wide>
      {error && <div style={errorBoxStyle}>{error}</div>}

      {step === 1 && (
        <div>
          <Field label="Date de début"><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} /></Field>
          <Field label="Date de retour"><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} /></Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={() => setStep(2)} style={{ ...btnStyle, background: '#0078a4', color: 'white', borderColor: '#0078a4' }}>Voir le matériel disponible <ChevronRight size={14} /></button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setStep(1)} style={btnStyle}><ChevronLeft size={14} /> Dates ({fmt(startDate)} → {fmt(endDate)})</button>
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value ? Number(e.target.value) : '')} style={{ ...inputStyle, width: 200 }}>
              <option value="">Toutes catégories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
            </select>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {available.map(eq => <CartPickRow key={eq.id} equipment={eq} onAdd={(q) => addToCart(eq, q)} />)}
            {available.length === 0 && <p style={{ color: '#94a3b8' }}>Aucun matériel disponible sur ces dates.</p>}
          </div>
          {cart.length > 0 && (
            <div style={{ marginTop: 16, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 12, padding: 14 }}>
              <h5 style={{ margin: '0 0 10px', fontSize: '0.88rem', fontWeight: 800, color: '#0369a1' }}>Panier — {cart.reduce((s, i) => s + i.quantity, 0)} article(s)</h5>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cart.map(i => (
                  <div key={i.equipment_id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', background: 'white', borderRadius: 8, border: `1px solid ${i.forced ? '#fbbf24' : '#e2e8f0'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 7, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {i.image_path ? <img src={resolveDesignationImageUrl(i.image_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Package size={16} color="#94a3b8" />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b' }}>{i.name}</div>
                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{i.available} disponible(s)</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => updateCartQty(i.equipment_id, i.quantity - 1)} style={stepperBtnStyle}>−</button>
                        <span style={{ minWidth: 22, textAlign: 'center', fontWeight: 700, fontSize: '0.9rem' }}>{i.quantity}</span>
                        <button onClick={() => updateCartQty(i.equipment_id, i.quantity + 1)} style={stepperBtnStyle}>+</button>
                      </div>
                      <button onClick={() => removeFromCart(i.equipment_id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', display: 'flex', flexShrink: 0 }}><X size={16} /></button>
                    </div>
                    {i.forced && (
                      <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertTriangle size={12} /> Dépasse la disponibilité — sera forcé avec avertissement
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button onClick={() => setStep(3)} style={{ ...btnStyle, background: '#0078a4', color: 'white', borderColor: '#0078a4' }}>Continuer <ChevronRight size={14} /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div>
          <button onClick={() => setStep(2)} style={{ ...btnStyle, marginBottom: 12 }}><ChevronLeft size={14} /> Panier</button>
          {hasForcedItems && (
            <div style={{ marginBottom: 12, padding: 10, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: '0.82rem', color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>Cette réservation dépasse la disponibilité pour {cart.filter(i => i.forced).map(i => `${i.name} (${i.quantity}/${i.available})`).join(', ')}. Elle sera tout de même créée (forçage DSI).</span>
            </div>
          )}
          <Field label="Demandeur *"><input value={nomDemandeur} onChange={e => setNomDemandeur(e.target.value)} style={inputStyle} /></Field>
          <Field label="Motif *"><textarea value={motif} onChange={e => setMotif(e.target.value)} style={{ ...inputStyle, minHeight: 70 }} /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: '#475569', marginBottom: 12 }}>
            <input type="checkbox" checked={isInternal} onChange={e => setIsInternal(e.target.checked)} /> Usage interne DSI
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={onClose} style={btnStyle}>Annuler</button>
            <button onClick={submit} disabled={saving} style={{ ...btnStyle, background: hasForcedItems ? '#d97706' : '#0078a4', color: 'white', borderColor: hasForcedItems ? '#d97706' : '#0078a4', opacity: saving ? 0.6 : 1 }}>
              {saving ? '…' : hasForcedItems ? 'Confirmer malgré le dépassement' : 'Confirmer la réservation'}
            </button>
          </div>
        </div>
      )}
    </ModalShell>
  );
};

const CartPickRow: React.FC<{ equipment: Equipment; onAdd: (qty: number) => void }> = ({ equipment, onAdd }) => {
  const [qty, setQty] = useState<number | ''>(1);
  const max = equipment.available ?? 0;
  const numQty = qty === '' ? 0 : qty;
  const exceeds = numQty > max;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>{equipment.name}</div>
          <div style={{ fontSize: '0.72rem', color: '#0891b2' }}>{max} disponible(s) sur la période</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="number" min={1} value={qty} onChange={e => setQty(e.target.value === '' ? '' : Number(e.target.value))}
            style={{ ...inputStyle, width: 60, ...(exceeds ? { borderColor: '#f59e0b' } : {}) }} />
          <button style={btnStyle} disabled={numQty <= 0} onClick={() => { if (numQty > 0) { onAdd(numQty); setQty(1); } }}>Ajouter</button>
        </div>
      </div>
      {exceeds && (
        <div style={{ fontSize: '0.72rem', color: '#b45309', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
          <AlertTriangle size={12} /> Dépasse la disponibilité — pourra être forcé avec avertissement
        </div>
      )}
    </div>
  );
};

// ═══════════════════ Catalogue ═══════════════════

const CatalogueTab: React.FC<{ categories: Category[]; equipment: Equipment[]; headers: any; reload: () => void }> = ({ categories, equipment, headers, reload }) => {
  const [newCat, setNewCat] = useState('');
  const [editEquip, setEditEquip] = useState<EquipDraft | null>(null);
  const [unitsFor, setUnitsFor] = useState<Equipment | null>(null);
  const [arrivalsFor, setArrivalsFor] = useState<Equipment | null>(null);

  const addCategory = async () => {
    if (!newCat.trim()) return;
    await axios.post('/api/prets/admin/categories', { name: newCat.trim(), display_name: newCat.trim() }, { headers });
    setNewCat(''); reload();
  };
  const deleteCategory = async (id: number) => {
    if (!window.confirm('Supprimer cette catégorie ?')) return;
    try { await axios.delete(`/api/prets/admin/categories/${id}`, { headers }); reload(); }
    catch (e: any) { alert(e.response?.data?.error || 'Erreur'); }
  };

  const saveEquipment = async () => {
    if (!editEquip?.name) { alert('Nom requis'); return; }
    if (editEquip.id) {
      await axios.put(`/api/prets/admin/equipment/${editEquip.id}`, editEquip, { headers });
    } else {
      if (!editEquip.total_quantity || editEquip.total_quantity <= 0) { alert('Quantité initiale requise'); return; }
      await axios.post('/api/prets/admin/equipment', editEquip, { headers });
    }
    setEditEquip(null); reload();
  };
  const deleteEquipment = async (id: number) => {
    if (!window.confirm('Supprimer ce matériel ?')) return;
    try { await axios.delete(`/api/prets/admin/equipment/${id}`, { headers }); reload(); }
    catch (e: any) { alert(e.response?.data?.error || 'Erreur'); }
  };
  const uploadImage = async (id: number, file: File) => {
    const fd = new FormData(); fd.append('image', file);
    await axios.post(`/api/prets/admin/equipment/${id}/image`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
    reload();
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20, alignItems: 'start' }}>
      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
        <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>Catégories</h4>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <input value={newCat} onChange={e => setNewCat(e.target.value)} placeholder="Nouvelle catégorie" style={{ flex: 1, padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem' }} />
          <button onClick={addCategory} style={{ ...btnStyle, background: '#0078a4', color: 'white', borderColor: '#0078a4' }}><Plus size={14} /></button>
        </div>
        {categories.map(c => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid #f1f5f9' }}>
            <span style={{ fontSize: '0.85rem', color: '#334155' }}>{c.display_name || c.name}</span>
            <button onClick={() => deleteCategory(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>Matériel disponible pour prêt</h4>
          <button onClick={() => setEditEquip({ total_quantity: 1, active: true, arrival_date: todayStr() })} style={{ ...btnStyle, background: '#0078a4', color: 'white', borderColor: '#0078a4' }}><Plus size={14} /> Ajouter</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
          {equipment.map(eq => (
            <div key={eq.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12, opacity: eq.active ? 1 : 0.5 }}>
              <div style={{ width: '100%', height: 100, borderRadius: 8, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 8, position: 'relative' }}>
                {eq.image_path ? (
                  <img src={resolveDesignationImageUrl(eq.image_path)} alt={eq.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : <Package size={32} color="#cbd5e1" />}
                <label style={{ position: 'absolute', bottom: 4, right: 4, background: 'white', border: '1px solid #e2e8f0', borderRadius: 6, padding: 4, cursor: 'pointer' }}>
                  <ImageIcon size={13} />
                  <input type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && uploadImage(eq.id, e.target.files[0])} />
                </label>
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#1e293b' }}>{eq.name}</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: 4 }}>{eq.category_display_name || 'Sans catégorie'}</div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 8 }}>{eq.description}</div>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0078a4' }}>{eq.available_now ?? eq.total_quantity} disponible(s) maintenant</div>
              {eq.next_arrival_date && (
                <div style={{ fontSize: '0.72rem', color: '#d97706', marginBottom: 4 }}>+{eq.next_arrival_quantity} le {new Date(eq.next_arrival_date).toLocaleDateString('fr-FR')}</div>
              )}
              <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginBottom: 8 }}>{eq.units_registered || 0} unité(s) référencée(s)</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button style={btnStyle} onClick={() => setEditEquip(eq)}><Edit2 size={12} /> Éditer</button>
                <button style={btnStyle} onClick={() => setArrivalsFor(eq)}><Calendar size={12} /> Lots</button>
                <button style={btnStyle} onClick={() => setUnitsFor(eq)}><ScanLine size={12} /> Unités</button>
                <button style={{ ...btnStyle, color: '#dc2626' }} onClick={() => deleteEquipment(eq.id)}><Trash2 size={12} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editEquip && (
        <ModalShell title={editEquip.id ? 'Modifier le matériel' : 'Nouveau matériel'} onClose={() => setEditEquip(null)}>
          <Field label="Nom *"><input value={editEquip.name || ''} onChange={e => setEditEquip({ ...editEquip, name: e.target.value })} style={inputStyle} /></Field>
          <Field label="Catégorie">
            <select value={editEquip.category_id || ''} onChange={e => setEditEquip({ ...editEquip, category_id: e.target.value ? Number(e.target.value) : null })} style={inputStyle}>
              <option value="">Sans catégorie</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
            </select>
          </Field>
          <Field label="Description"><textarea value={editEquip.description || ''} onChange={e => setEditEquip({ ...editEquip, description: e.target.value })} style={{ ...inputStyle, minHeight: 70 }} /></Field>

          {!editEquip.id && (
            <>
              <Field label="Quantité initiale *">
                <input type="number" min={1} value={editEquip.total_quantity ?? ''}
                  onChange={e => setEditEquip({ ...editEquip, total_quantity: e.target.value === '' ? undefined : Number(e.target.value) })} style={inputStyle} />
              </Field>
              <Field label="Date de disponibilité">
                <input type="date" value={editEquip.arrival_date || todayStr()} onChange={e => setEditEquip({ ...editEquip, arrival_date: e.target.value })} style={inputStyle} />
                <p style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 4 }}>Laissez la date du jour si le matériel est déjà en stock, ou choisissez une date future s'il est commandé mais pas encore livré.</p>
              </Field>
            </>
          )}
          {editEquip.id !== undefined && (
            <div style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: 8, fontSize: '0.82rem', color: '#475569', marginBottom: 12 }}>
              Quantité totale : <strong>{editEquip.total_quantity}</strong> — se gère désormais via le bouton « Lots » (dates d'arrivée du stock).
            </div>
          )}
          {editEquip.id !== undefined && (
            <Field label="Actif"><input type="checkbox" checked={editEquip.active !== false} onChange={e => setEditEquip({ ...editEquip, active: e.target.checked })} /></Field>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={() => setEditEquip(null)} style={btnStyle}>Annuler</button>
            <button onClick={saveEquipment} style={{ ...btnStyle, background: '#0078a4', color: 'white', borderColor: '#0078a4' }}>Enregistrer</button>
          </div>
        </ModalShell>
      )}

      {unitsFor && <UnitsModal equipment={unitsFor} headers={headers} onClose={() => { setUnitsFor(null); reload(); }} />}
      {arrivalsFor && <ArrivalsModal equipment={arrivalsFor} headers={headers} onClose={() => { setArrivalsFor(null); reload(); }} />}
    </div>
  );
};

const UnitsModal: React.FC<{ equipment: Equipment; headers: any; onClose: () => void }> = ({ equipment, headers, onClose }) => {
  const [units, setUnits] = useState<EquipmentUnit[]>([]);
  const [newNum, setNewNum] = useState('');

  const load = () => axios.get(`/api/prets/admin/equipment/${equipment.id}/units`, { headers }).then(r => setUnits(r.data));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!newNum.trim()) return;
    try { await axios.post(`/api/prets/admin/equipment/${equipment.id}/units`, { inventory_number: newNum.trim() }, { headers }); setNewNum(''); load(); }
    catch (e: any) { alert(e.response?.data?.error || 'Erreur'); }
  };
  const setStatus = async (unitId: number, status: string) => {
    await axios.put(`/api/prets/admin/units/${unitId}`, { status }, { headers }); load();
  };
  const remove = async (unitId: number) => {
    if (!window.confirm('Supprimer cette unité ?')) return;
    await axios.delete(`/api/prets/admin/units/${unitId}`, { headers }); load();
  };

  return (
    <ModalShell title={`Unités — ${equipment.name}`} onClose={onClose}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input value={newNum} onChange={e => setNewNum(e.target.value)} placeholder="N° d'inventaire" style={inputStyle} />
        <button onClick={add} style={{ ...btnStyle, background: '#0078a4', color: 'white', borderColor: '#0078a4' }}><Plus size={14} /></button>
      </div>
      <div style={{ maxHeight: 320, overflowY: 'auto' }}>
        {units.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Aucune unité enregistrée. Les unités sont aussi créées automatiquement lors de la remise (scan du n° d'inventaire).</p>}
        {units.map(u => (
          <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
            <span style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{u.inventory_number}</span>
            <select value={u.status} onChange={e => setStatus(u.id, e.target.value)} style={{ ...inputStyle, width: 150, padding: '4px 8px' }}>
              <option value="available">Disponible</option>
              <option value="loaned">Prêté</option>
              <option value="maintenance">Maintenance</option>
              <option value="lost">Perdu</option>
            </select>
            <button onClick={() => remove(u.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </ModalShell>
  );
};

// Lots d'arrivée : chaque lot ne compte dans la disponibilité qu'à partir de sa
// date (matériel commandé mais pas encore livré) — cf. hub_prets.equipment_arrivals.
const ArrivalsModal: React.FC<{ equipment: Equipment; headers: any; onClose: () => void }> = ({ equipment, headers, onClose }) => {
  const [lots, setLots] = useState<ArrivalLot[]>([]);
  const [qty, setQty] = useState<number | ''>('');
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');

  const load = () => axios.get(`/api/prets/admin/equipment/${equipment.id}/arrivals`, { headers }).then(r => setLots(r.data));
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!qty || Number(qty) <= 0) return;
    await axios.post(`/api/prets/admin/equipment/${equipment.id}/arrivals`, { quantity: qty, arrival_date: date, note: note || undefined }, { headers });
    setQty(''); setNote(''); load();
  };
  const remove = async (id: number) => {
    if (!window.confirm('Supprimer ce lot ?')) return;
    await axios.delete(`/api/prets/admin/arrivals/${id}`, { headers }); load();
  };

  const totalOwned = lots.reduce((s, l) => s + l.quantity, 0);
  const today = todayStr();

  return (
    <ModalShell title={`Lots de stock — ${equipment.name}`} onClose={onClose}>
      <p style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 12 }}>
        Chaque lot ne compte dans la disponibilité qu'à partir de sa date. Un lot daté dans le futur représente du matériel commandé mais pas encore livré.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '80px 150px 1fr auto', gap: 6, marginBottom: 12 }}>
        <input type="number" min={1} placeholder="Qté" value={qty} onChange={e => setQty(e.target.value === '' ? '' : Number(e.target.value))} style={inputStyle} />
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
        <input placeholder="Note (facultatif)" value={note} onChange={e => setNote(e.target.value)} style={inputStyle} />
        <button onClick={add} style={{ ...btnStyle, background: '#0078a4', color: 'white', borderColor: '#0078a4' }}><Plus size={14} /></button>
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {lots.length === 0 && <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Aucun lot enregistré.</p>}
        {lots.map(l => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderTop: '1px solid #f1f5f9' }}>
            <div>
              <span style={{ fontWeight: 700 }}>{l.quantity}</span>
              <span style={{ marginLeft: 8, fontSize: '0.82rem', color: l.arrival_date > today ? '#0891b2' : '#334155' }}>
                {l.arrival_date > today ? 'arrivée le' : 'en stock depuis le'} {new Date(l.arrival_date).toLocaleDateString('fr-FR')}
              </span>
              {l.note && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{l.note}</div>}
            </div>
            <button onClick={() => remove(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12, fontWeight: 700, fontSize: '0.85rem', color: '#0078a4' }}>Total tous lots : {totalOwned}</div>
    </ModalShell>
  );
};

// ═══════════════════ Calendrier (matériel unique) ═══════════════════

const CalendrierTab: React.FC<{ equipment: Equipment[]; headers: any }> = ({ equipment, headers }) => {
  const [selected, setSelected] = useState<number | ''>('');
  const [month, setMonth] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [days, setDays] = useState<DayAvail[]>([]);

  useEffect(() => {
    if (!selected) { setDays([]); return; }
    const from = new Date(month.y, month.m, 1).toISOString().slice(0, 10);
    const to = new Date(month.y, month.m + 1, 0).toISOString().slice(0, 10);
    axios.get(`/api/prets/equipment/${selected}/availability`, { headers, params: { from, to } }).then(r => setDays(r.data)).catch(() => setDays([]));
  }, [selected, month]);

  const monthLabel = new Date(month.y, month.m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const firstDow = (new Date(month.y, month.m, 1).getDay() + 6) % 7; // lundi=0

  return (
    <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={selected} onChange={e => setSelected(e.target.value ? Number(e.target.value) : '')} style={inputStyle}>
          <option value="">Choisir un matériel…</option>
          {equipment.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name} ({e.available_now ?? e.total_quantity})</option>)}
        </select>
        {selected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setMonth(m => m.m === 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 })} style={btnStyle}><ChevronLeft size={14} /></button>
            <span style={{ fontWeight: 700, textTransform: 'capitalize', minWidth: 140, textAlign: 'center' }}>{monthLabel}</span>
            <button onClick={() => setMonth(m => m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 })} style={btnStyle}><ChevronRight size={14} /></button>
          </div>
        )}
      </div>

      {selected && days.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
            {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(d => <div key={d} style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 700, color: '#94a3b8' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {days.map(d => {
              const full = d.remaining <= 0;
              const partial = d.remaining > 0 && d.remaining < d.total;
              return (
                <div key={d.date} title={`${d.remaining} / ${d.total} disponible(s)`} style={{
                  padding: 8, borderRadius: 8, textAlign: 'center', fontSize: '0.78rem',
                  background: full ? '#fee2e2' : partial ? '#fef3c7' : '#dcfce7',
                  color: full ? '#991b1b' : partial ? '#92400e' : '#166534',
                }}>
                  <div style={{ fontWeight: 700 }}>{new Date(d.date).getDate()}</div>
                  <div style={{ fontSize: '0.68rem' }}>{d.remaining}/{d.total}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: '0.75rem', color: '#64748b' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#dcfce7', marginRight: 4 }} />Disponible</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#fef3c7', marginRight: 4 }} />Partiel</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#fee2e2', marginRight: 4 }} />Complet</span>
          </div>
        </>
      )}
      {!selected && <p style={{ color: '#94a3b8' }}>Sélectionnez un matériel pour voir son calendrier de disponibilité.</p>}
    </div>
  );
};

// ═══════════════════ Vue générale (tous matériels, semaine/mois) ═══════════════════

const VueGeneraleTab: React.FC<{ categories: Category[]; headers: any }> = ({ categories, headers }) => {
  const [view, setView] = useState<'semaine' | 'mois'>('semaine');
  const [anchor, setAnchor] = useState(() => new Date());
  const [categoryFilter, setCategoryFilter] = useState<number | ''>('');
  const [grid, setGrid] = useState<{ days: string[]; equipment: GridEquipment[] } | null>(null);

  const range = useMemo(() => {
    if (view === 'semaine') {
      const d = new Date(anchor);
      const dow = (d.getDay() + 6) % 7; // lundi=0
      const from = new Date(d); from.setDate(d.getDate() - dow);
      const to = new Date(from); to.setDate(from.getDate() + 6);
      return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
    }
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
  }, [view, anchor]);

  useEffect(() => {
    axios.get('/api/prets/equipment/availability-grid', { headers, params: { from: range.from, to: range.to, category_id: categoryFilter || undefined } })
      .then(r => setGrid(r.data)).catch(() => setGrid(null));
  }, [range.from, range.to, categoryFilter]);

  const shiftAnchor = (dir: 1 | -1) => {
    setAnchor(prev => {
      const d = new Date(prev);
      if (view === 'semaine') d.setDate(d.getDate() + 7 * dir);
      else d.setMonth(d.getMonth() + dir);
      return d;
    });
  };

  const label = view === 'semaine'
    ? `${new Date(range.from).toLocaleDateString('fr-FR')} — ${new Date(range.to).toLocaleDateString('fr-FR')}`
    : anchor.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  const grouped: { category: string; items: GridEquipment[] }[] = [];
  if (grid) {
    const byCat = new Map<string, GridEquipment[]>();
    for (const eq of grid.equipment) {
      const key = eq.category_name || 'Sans catégorie';
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key)!.push(eq);
    }
    for (const [category, items] of byCat) grouped.push({ category, items });
  }

  const cellColor = (cell?: GridCell) => {
    if (!cell || cell.total === 0) return { bg: '#f1f5f9', color: '#94a3b8' };
    if (cell.remaining <= 0) return { bg: '#fee2e2', color: '#991b1b' };
    if (cell.remaining < cell.total) return { bg: '#fef3c7', color: '#92400e' };
    return { bg: '#dcfce7', color: '#166534' };
  };

  return (
    <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 18 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => setView('semaine')} style={{ ...btnStyle, background: view === 'semaine' ? '#0078a4' : 'white', color: view === 'semaine' ? 'white' : '#475569' }}>Semaine</button>
          <button onClick={() => setView('mois')} style={{ ...btnStyle, background: view === 'mois' ? '#0078a4' : 'white', color: view === 'mois' ? 'white' : '#475569' }}>Mois</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => shiftAnchor(-1)} style={btnStyle}><ChevronLeft size={14} /></button>
          <span style={{ fontWeight: 700, textTransform: 'capitalize', minWidth: 180, textAlign: 'center' }}>{label}</span>
          <button onClick={() => shiftAnchor(1)} style={btnStyle}><ChevronRight size={14} /></button>
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value ? Number(e.target.value) : '')} style={{ ...inputStyle, width: 200 }}>
          <option value="">Toutes catégories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.display_name || c.name}</option>)}
        </select>
      </div>

      {!grid && <p style={{ color: '#94a3b8' }}>Chargement…</p>}
      {grid && grid.equipment.length === 0 && <p style={{ color: '#94a3b8' }}>Aucun matériel actif.</p>}
      {grid && grid.equipment.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '0.75rem', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, background: 'white', textAlign: 'left', padding: '6px 10px', minWidth: 180 }}>Matériel</th>
                {grid.days.map(d => (
                  <th key={d} style={{ padding: '4px 6px', fontWeight: 700, color: '#64748b', minWidth: 44 }}>
                    {new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.map(group => (
                <React.Fragment key={group.category}>
                  <tr><td colSpan={grid.days.length + 1} style={{ padding: '8px 10px', background: '#f8fafc', fontWeight: 800, color: '#334155' }}>{group.category}</td></tr>
                  {group.items.map(eq => (
                    <tr key={eq.id}>
                      <td style={{ position: 'sticky', left: 0, background: 'white', padding: '4px 10px', fontWeight: 600, borderBottom: '1px solid #f1f5f9' }}>{eq.name}</td>
                      {grid.days.map(d => {
                        const cell = eq.cells[d];
                        const c = cellColor(cell);
                        return (
                          <td key={d} title={cell ? `${cell.remaining} / ${cell.total} disponible(s)` : ''} style={{ padding: '4px 2px', textAlign: 'center', borderBottom: '1px solid #f1f5f9' }}>
                            <div style={{ background: c.bg, color: c.color, borderRadius: 5, padding: '3px 0', fontWeight: 700 }}>
                              {cell ? `${cell.remaining}/${cell.total}` : '–'}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: '0.75rem', color: '#64748b', flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#dcfce7', marginRight: 4 }} />Disponible</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#fef3c7', marginRight: 4 }} />Partiel</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#fee2e2', marginRight: 4 }} />Complet</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#f1f5f9', marginRight: 4 }} />Pas encore en stock</span>
      </div>
    </div>
  );
};

// ═══════════════════ Réglages ═══════════════════

const ReglagesTab: React.FC<{ headers: any }> = ({ headers }) => {
  const [bufferHours, setBufferHours] = useState<number | ''>(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => { axios.get('/api/prets/admin/settings', { headers }).then(r => setBufferHours(r.data.buffer_hours ?? 0)); }, []);

  const save = async () => {
    await axios.put('/api/prets/admin/settings', { buffer_hours: bufferHours === '' ? 0 : bufferHours }, { headers });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', padding: 20, maxWidth: 480 }}>
      <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', fontWeight: 800, color: '#1e293b' }}>Délai de battement</h4>
      <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 12 }}>
        Délai (en heures) bloqué automatiquement après le retour prévu d'un prêt avant qu'une nouvelle réservation du même matériel puisse démarrer (nettoyage/préparation).
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="number" min={0} value={bufferHours} onChange={e => setBufferHours(e.target.value === '' ? '' : Number(e.target.value))} style={{ ...inputStyle, width: 100 }} />
        <span style={{ color: '#64748b', fontSize: '0.85rem' }}>heures</span>
        <button onClick={save} style={{ ...btnStyle, background: '#0078a4', color: 'white', borderColor: '#0078a4' }}>Enregistrer</button>
        {saved && <span style={{ color: '#16a34a', fontSize: '0.8rem', fontWeight: 700 }}>Enregistré ✓</span>}
      </div>
      <p style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 16 }}>
        La génération des fiches de remise/retour PDF signées nécessite un gabarit configuré dans <strong>/stocks</strong> (administration des gabarits), catégories <code>pret_remise</code> et <code>pret_retour</code>. Sans gabarit, la remise/le retour reste possible (signature enregistrée) mais aucun PDF n'est généré.
      </p>
    </div>
  );
};

// ═══════════════════ Modales Remise / Retour ═══════════════════

const DeliverModal: React.FC<{ loan: Loan; headers: any; onClose: () => void; onDone: () => void }> = ({ loan, headers, onClose, onDone }) => {
  const [codes, setCodes] = useState<string[]>(Array(loan.quantity).fill(''));
  const [scanning, setScanning] = useState<number | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const filled = codes.map(c => c.trim()).filter(Boolean);
    if (filled.length !== loan.quantity) { setError(`Renseignez les ${loan.quantity} numéro(s) d'inventaire`); return; }
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      fd.append('unit_codes', JSON.stringify(filled));
      if (signature) fd.append('recipient_signature', signature);
      await axios.post(`/api/prets/admin/loans/${loan.id}/deliver`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      onDone();
    } catch (e: any) { setError(e.response?.data?.error || 'Erreur lors de la remise'); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={`Remise — ${loan.equipment_name} (x${loan.quantity})`} onClose={onClose} wide>
      {error && <div style={errorBoxStyle}>{error}</div>}
      <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Scannez ou saisissez le n° d'inventaire de chaque unité remise :</p>
      {codes.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input value={c} onChange={e => setCodes(codes.map((x, j) => j === i ? e.target.value : x))} placeholder={`Unité ${i + 1}`} style={inputStyle} />
          <button style={btnStyle} onClick={() => setScanning(i)}><ScanLine size={14} /></button>
        </div>
      ))}
      <div style={{ marginTop: 16 }}>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 6 }}>Signature de l'emprunteur (facultatif si fiche gabarit non configurée) :</p>
        <SignaturePad onChange={setSignature} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={btnStyle}>Annuler</button>
        <button onClick={submit} disabled={saving} style={{ ...btnStyle, background: '#0078a4', color: 'white', borderColor: '#0078a4', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : 'Confirmer la remise'}</button>
      </div>
      {scanning !== null && (
        <BarcodeScanner onClose={() => setScanning(null)} onResult={(code) => { setCodes(codes.map((x, j) => j === scanning ? code : x)); setScanning(null); }} />
      )}
    </ModalShell>
  );
};

const ReturnModal: React.FC<{ loan: Loan; headers: any; onClose: () => void; onDone: () => void }> = ({ loan, headers, onClose, onDone }) => {
  const [etat, setEtat] = useState('Fonctionnel');
  const [motif, setMotif] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      fd.append('etat_retour', etat);
      fd.append('motif', motif);
      if (signature) fd.append('recipient_signature', signature);
      await axios.post(`/api/prets/admin/loans/${loan.id}/return`, fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      onDone();
    } catch (e: any) { setError(e.response?.data?.error || 'Erreur lors du retour'); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={`Retour — ${loan.equipment_name} (x${loan.quantity})`} onClose={onClose} wide>
      {error && <div style={errorBoxStyle}>{error}</div>}
      <Field label="État du matériel au retour">
        <select value={etat} onChange={e => setEtat(e.target.value)} style={inputStyle}>
          <option value="Fonctionnel">Fonctionnel</option>
          <option value="Défectueux">Défectueux</option>
          <option value="Endommagé">Endommagé</option>
        </select>
      </Field>
      <Field label="Observations"><textarea value={motif} onChange={e => setMotif(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} /></Field>
      <div style={{ marginTop: 8 }}>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 6 }}>Signature de l'emprunteur (facultatif) :</p>
        <SignaturePad onChange={setSignature} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={btnStyle}>Annuler</button>
        <button onClick={submit} disabled={saving} style={{ ...btnStyle, background: '#0078a4', color: 'white', borderColor: '#0078a4', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : 'Confirmer le retour'}</button>
      </div>
    </ModalShell>
  );
};

// Remise globale d'une réservation (panier multi-matériel) : une seule signature,
// une seule fiche PDF listant chaque matériel fourni — cf. controller.deliverBatch.
const DeliverGroupModal: React.FC<{ group: Loan[]; headers: any; onClose: () => void; onDone: () => void }> = ({ group, headers, onClose, onDone }) => {
  const pending = group.filter(l => l.status === 'confirmed');
  const [codesByLoan, setCodesByLoan] = useState<Record<number, string[]>>(
    () => Object.fromEntries(pending.map(l => [l.id, Array(l.quantity).fill('')]))
  );
  const [scanning, setScanning] = useState<{ loanId: number; idx: number } | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const setCode = (loanId: number, idx: number, value: string) => {
    setCodesByLoan(prev => ({ ...prev, [loanId]: prev[loanId].map((c, i) => i === idx ? value : c) }));
  };

  const reservationLabel = pending[0]?.batch_id || pending[0]?.id;

  const submit = async () => {
    for (const l of pending) {
      const filled = codesByLoan[l.id].map(c => c.trim()).filter(Boolean);
      if (filled.length !== l.quantity) { setError(`${l.equipment_name} : renseignez les ${l.quantity} numéro(s) d'inventaire`); return; }
    }
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      const first = pending[0];
      if (first.batch_id) fd.append('batch_id', String(first.batch_id));
      else fd.append('loan_id', String(first.id));
      const unitCodesByLoan: Record<number, string[]> = {};
      for (const l of pending) unitCodesByLoan[l.id] = codesByLoan[l.id].map(c => c.trim());
      fd.append('unit_codes_by_loan', JSON.stringify(unitCodesByLoan));
      if (signature) fd.append('recipient_signature', signature);
      await axios.post('/api/prets/admin/loans/deliver-batch', fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      onDone();
    } catch (e: any) { setError(e.response?.data?.error || 'Erreur lors de la remise'); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={`Remise globale — Réservation #${reservationLabel}`} onClose={onClose} wide>
      {error && <div style={errorBoxStyle}>{error}</div>}
      <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Scannez ou saisissez le n° d'inventaire de chaque unité remise, pour chaque matériel :</p>
      {pending.map(l => (
        <div key={l.id} style={{ marginBottom: 14, padding: 10, background: '#f8fafc', borderRadius: 8 }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 6 }}>{l.equipment_name} <span style={{ color: '#94a3b8', fontWeight: 400 }}>(× {l.quantity})</span></div>
          {codesByLoan[l.id].map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={c} onChange={e => setCode(l.id, i, e.target.value)} placeholder={`Unité ${i + 1}`} style={inputStyle} />
              <button style={btnStyle} onClick={() => setScanning({ loanId: l.id, idx: i })}><ScanLine size={14} /></button>
            </div>
          ))}
        </div>
      ))}
      <div style={{ marginTop: 16 }}>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 6 }}>Signature de l'emprunteur (facultatif si fiche gabarit non configurée) :</p>
        <SignaturePad onChange={setSignature} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={btnStyle}>Annuler</button>
        <button onClick={submit} disabled={saving} style={{ ...btnStyle, background: '#0078a4', color: 'white', borderColor: '#0078a4', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : 'Confirmer la remise globale'}</button>
      </div>
      {scanning !== null && (
        <BarcodeScanner onClose={() => setScanning(null)} onResult={(code) => { setCode(scanning.loanId, scanning.idx, code); setScanning(null); }} />
      )}
    </ModalShell>
  );
};

// Retour global d'une réservation — symétrique de DeliverGroupModal.
const ReturnGroupModal: React.FC<{ group: Loan[]; headers: any; onClose: () => void; onDone: () => void }> = ({ group, headers, onClose, onDone }) => {
  const pending = group.filter(l => l.status === 'delivered');
  const [etat, setEtat] = useState('Fonctionnel');
  const [motif, setMotif] = useState('');
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const reservationLabel = pending[0]?.batch_id || pending[0]?.id;

  const submit = async () => {
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      const first = pending[0];
      if (first.batch_id) fd.append('batch_id', String(first.batch_id));
      else fd.append('loan_id', String(first.id));
      fd.append('etat_retour', etat);
      fd.append('motif', motif);
      if (signature) fd.append('recipient_signature', signature);
      await axios.post('/api/prets/admin/loans/return-batch', fd, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
      onDone();
    } catch (e: any) { setError(e.response?.data?.error || 'Erreur lors du retour'); }
    finally { setSaving(false); }
  };

  return (
    <ModalShell title={`Retour global — Réservation #${reservationLabel}`} onClose={onClose} wide>
      {error && <div style={errorBoxStyle}>{error}</div>}
      <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 10 }}>Matériel concerné : {pending.map(l => `${l.equipment_name} (×${l.quantity})`).join(', ')}</p>
      <Field label="État du matériel au retour">
        <select value={etat} onChange={e => setEtat(e.target.value)} style={inputStyle}>
          <option value="Fonctionnel">Fonctionnel</option>
          <option value="Défectueux">Défectueux</option>
          <option value="Endommagé">Endommagé</option>
        </select>
      </Field>
      <Field label="Observations"><textarea value={motif} onChange={e => setMotif(e.target.value)} style={{ ...inputStyle, minHeight: 60 }} /></Field>
      <div style={{ marginTop: 8 }}>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: 6 }}>Signature de l'emprunteur (facultatif) :</p>
        <SignaturePad onChange={setSignature} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={btnStyle}>Annuler</button>
        <button onClick={submit} disabled={saving} style={{ ...btnStyle, background: '#0078a4', color: 'white', borderColor: '#0078a4', opacity: saving ? 0.6 : 1 }}>{saving ? '…' : 'Confirmer le retour global'}</button>
      </div>
    </ModalShell>
  );
};

// ═══════════════════ Helpers UI ═══════════════════

const inputStyle: React.CSSProperties = { width: '100%', padding: '9px 11px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: '0.85rem', boxSizing: 'border-box' };
const stepperBtnStyle: React.CSSProperties = { width: 24, height: 24, borderRadius: 6, border: '1px solid #e2e8f0', background: 'white', color: '#334155', fontWeight: 800, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', lineHeight: 1, padding: 0 };

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <label style={{ display: 'block', marginBottom: 5, fontWeight: 700, color: '#475569', fontSize: '0.82rem' }}>{label}</label>
    {children}
  </div>
);

const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 3000, padding: 20 }} onClick={onClose}>
    <div style={{ background: 'white', borderRadius: 14, padding: 22, width: '100%', maxWidth: wide ? 560 : 420, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#1e293b' }}>{title}</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#64748b" /></button>
      </div>
      {children}
    </div>
  </div>
);

export default PretsManagement;
