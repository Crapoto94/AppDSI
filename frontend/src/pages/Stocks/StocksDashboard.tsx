import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { Package, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Plus, Settings, RefreshCw, Truck, Barcode, Send, Repeat, TrendingDown } from 'lucide-react';
import { stocksApi, type Store, type StockLevel, type ParcItem, type StorageLocation, type Movement, type ForecastRow } from './api';

const C = {
  indigo: '#6366f1', red: '#ef4444', green: '#22c55e', amber: '#f59e0b',
  slate: '#64748b', bg: '#f8fafc', border: '#e2e8f0', text: '#1e293b',
};

const MOVE_LABELS: Record<string, string> = {
  in: 'Entrée', out: 'Sortie', transfer: 'Transfert', adjust: 'Ajustement',
  loan_out: 'Prêt', loan_return: 'Retour prêt',
};

export default function StocksDashboard() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [stockType, setStockType] = useState<'normal' | 'loan'>('normal');
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [forecast, setForecast] = useState<ForecastRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMove, setShowMove] = useState(false);

  const canOperate = role === 'operator' || role === 'manager';

  const loadStores = useCallback(async () => {
    try {
      const data = await stocksApi.listStores();
      setStores(data);
      if (data.length && storeId == null) setStoreId(data[0].id);
      if (!data.length) setLoading(false);
    } catch (e: any) {
      setError(e.response?.data?.message || e.message);
      setLoading(false);
    }
  }, [storeId]);

  const loadStore = useCallback(async (sid: number) => {
    setLoading(true);
    setError(null);
    try {
      const [mr, lv, mv, fc] = await Promise.all([
        stocksApi.myRole(sid),
        stocksApi.getStockLevels(sid, stockType),
        stocksApi.listMovements(sid, { limit: 20 }),
        stocksApi.getForecast(sid).catch(() => []),
      ]);
      setRole(mr.role);
      setLevels(lv);
      setMovements(mv);
      setForecast(fc);
    } catch (e: any) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }, [stockType]);

  useEffect(() => { loadStores(); }, [loadStores]);
  useEffect(() => { if (storeId != null) loadStore(storeId); }, [storeId, loadStore]);

  const lowStock = useMemo(
    () => levels.filter(l => (l.min_threshold || 0) > 0 && l.quantity <= (l.min_threshold || 0)),
    [levels]
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <style>{`
        .stk-wrap { max-width: 1200px; margin: 0 auto; padding: 20px 16px; }
        .stk-card { background:#fff; border:1px solid ${C.border}; border-radius:14px; padding:18px; margin-bottom:16px; }
        .stk-table { width:100%; border-collapse:collapse; font-size:13px; }
        .stk-table th { text-align:left; padding:8px 10px; color:${C.slate}; font-size:11px; font-weight:600; border-bottom:2px solid ${C.border}; text-transform:uppercase; }
        .stk-table td { padding:8px 10px; border-bottom:1px solid #f1f5f9; }
        .stk-btn { padding:10px 16px; border:none; border-radius:10px; background:${C.indigo}; color:#fff; font-weight:600; cursor:pointer; font-size:14px; display:inline-flex; align-items:center; gap:6px; }
        .stk-btn-ghost { background:#fff; color:${C.slate}; border:1px solid ${C.border}; }
        .stk-toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; margin-bottom:16px; }
        .stk-select { padding:10px 12px; border:1px solid ${C.border}; border-radius:10px; font-size:14px; background:#fff; }
        .stk-tabs { display:inline-flex; background:#eef2ff; border-radius:10px; padding:3px; }
        .stk-tab { padding:7px 14px; border:none; background:transparent; border-radius:8px; cursor:pointer; font-size:13px; font-weight:600; color:${C.slate}; }
        .stk-tab.active { background:#fff; color:${C.indigo}; box-shadow:0 1px 3px rgba(0,0,0,.08); }
        .stk-table-scroll { overflow-x:auto; }
        @media (max-width: 600px) {
          .stk-wrap { padding:12px 10px; }
          .stk-card { padding:14px; border-radius:12px; }
          .stk-toolbar { gap:8px; }
          .stk-select { flex:1; min-width:0; }
          .stk-table th, .stk-table td { padding:7px 6px; font-size:12px; }
        }
      `}</style>
      <Header />

      <div className="stk-wrap">
        <div className="stk-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Package size={22} color={C.indigo} />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Gestion des stocks</h1>
            {stores.length > 0 && (
              <select className="stk-select" value={storeId ?? ''} onChange={e => setStoreId(Number(e.target.value))}>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            {role && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, background: '#eef2ff', color: C.indigo }}>
                {role}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="stk-btn stk-btn-ghost" onClick={() => storeId && loadStore(storeId)} title="Actualiser"><RefreshCw size={16} /></button>
            <button className="stk-btn stk-btn-ghost" onClick={() => navigate('/stocks/series')}><Barcode size={16} /> N° série</button>
            <button className="stk-btn stk-btn-ghost" onClick={() => navigate('/stocks/reception')}><Truck size={16} /> Réception</button>
            <button className="stk-btn stk-btn-ghost" onClick={() => navigate('/stocks/sortie')}><Send size={16} /> Sortie</button>
            <button className="stk-btn stk-btn-ghost" onClick={() => navigate('/stocks/prets')}><Repeat size={16} /> Prêts</button>
            <button className="stk-btn stk-btn-ghost" onClick={() => navigate('/stocks/admin')}><Settings size={16} /> Admin</button>
            {canOperate && (
              <button className="stk-btn" onClick={() => setShowMove(true)}><Plus size={16} /> Mouvement</button>
            )}
          </div>
        </div>

        {error && <div className="stk-card" style={{ color: C.red, borderColor: '#fecaca', background: '#fef2f2' }}>{error}</div>}

        {!loading && stores.length === 0 && (
          <div className="stk-card" style={{ textAlign: 'center', color: C.slate }}>
            Aucun magasin accessible. Un administrateur doit créer un magasin et vous y affecter un rôle.
          </div>
        )}

        {lowStock.length > 0 && (
          <div className="stk-card" style={{ borderColor: '#fde68a', background: '#fffbeb' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.amber, fontWeight: 600, marginBottom: 8 }}>
              <AlertTriangle size={18} /> {lowStock.length} article(s) sous le seuil d'alerte
            </div>
            <div style={{ fontSize: 13, color: C.slate }}>
              {lowStock.slice(0, 6).map(l => `${l.label} (${l.quantity}/${l.min_threshold})`).join(' · ')}
            </div>
          </div>
        )}

        {forecast.filter(f => f.severity !== 'ok').length > 0 && (
          <div className="stk-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: C.text, marginBottom: 12 }}>
              <TrendingDown size={18} color={C.amber} /> Prévision de rupture
            </div>
            <div className="stk-table-scroll">
              <table className="stk-table">
                <thead>
                  <tr><th>Article</th><th style={{ textAlign: 'right' }}>Stock</th><th style={{ textAlign: 'right' }}>Conso./j</th><th style={{ textAlign: 'right' }}>Rupture dans</th><th>État</th></tr>
                </thead>
                <tbody>
                  {forecast.filter(f => f.severity !== 'ok').slice(0, 10).map(f => {
                    const col = f.severity === 'rupture' ? C.red : f.severity === 'critical' ? C.red : C.amber;
                    const txt = f.severity === 'rupture' ? 'Rupture' : f.severity === 'critical' ? 'Sous seuil' : 'À surveiller';
                    return (
                      <tr key={f.item_id}>
                        <td style={{ fontWeight: 500 }}>{f.label}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: col }}>{f.quantity} {f.unit || ''}</td>
                        <td style={{ textAlign: 'right', color: C.slate }}>{f.avg_per_day || '—'}</td>
                        <td style={{ textAlign: 'right', color: C.slate }}>{f.days_to_rupture != null ? `${f.days_to_rupture} j` : '—'}</td>
                        <td><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: `${col}1a`, color: col }}>{txt}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="stk-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 600, color: C.text }}>Niveaux de stock</div>
            <div className="stk-tabs">
              <button className={`stk-tab ${stockType === 'normal' ? 'active' : ''}`} onClick={() => setStockType('normal')}>Normal</button>
              <button className={`stk-tab ${stockType === 'loan' ? 'active' : ''}`} onClick={() => setStockType('loan')}>Prêt</button>
            </div>
          </div>
          <div className="stk-table-scroll">
            <table className="stk-table">
              <thead>
                <tr>
                  <th>Équipement</th><th>N° série</th><th>Emplacement</th>
                  <th style={{ textAlign: 'right' }}>Qté</th><th style={{ textAlign: 'right' }}>Seuil</th>
                </tr>
              </thead>
              <tbody>
                {levels.map(l => {
                  const low = (l.min_threshold || 0) > 0 && l.quantity <= (l.min_threshold || 0);
                  return (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 500 }}>{l.label}{l.brand ? <span style={{ color: C.slate }}> — {l.brand}</span> : null}</td>
                      <td style={{ color: C.slate }}>{l.serial_number || '—'}</td>
                      <td style={{ color: C.slate }}>{l.location_name || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: low ? C.red : C.text }}>{l.quantity} {l.unit || ''}</td>
                      <td style={{ textAlign: 'right', color: C.slate }}>{l.min_threshold || '—'}</td>
                    </tr>
                  );
                })}
                {levels.length === 0 && !loading && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', color: C.slate, padding: 20 }}>Aucun stock {stockType === 'loan' ? 'de prêt' : ''} pour ce magasin</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="stk-card">
          <div style={{ fontWeight: 600, color: C.text, marginBottom: 12 }}>Derniers mouvements</div>
          <div className="stk-table-scroll">
            <table className="stk-table">
              <thead>
                <tr><th>Date</th><th>Type</th><th>Article</th><th style={{ textAlign: 'right' }}>Qté</th><th>Réf.</th><th>Par</th></tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id}>
                    <td style={{ color: C.slate, whiteSpace: 'nowrap' }}>{new Date(m.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, color: ['in', 'loan_return'].includes(m.type) ? C.green : C.red }}>
                        {['in', 'loan_return'].includes(m.type) ? <ArrowDownCircle size={14} /> : <ArrowUpCircle size={14} />}
                        {MOVE_LABELS[m.type] || m.type}
                      </span>
                    </td>
                    <td>{m.item_label}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{m.quantity}</td>
                    <td style={{ color: C.slate }}>{m.reference || '—'}</td>
                    <td style={{ color: C.slate }}>{m.created_by || '—'}</td>
                  </tr>
                ))}
                {movements.length === 0 && !loading && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: C.slate, padding: 20 }}>Aucun mouvement</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showMove && storeId != null && (
        <MovementModal
          storeId={storeId}
          onClose={() => setShowMove(false)}
          onDone={() => { setShowMove(false); loadStore(storeId); }}
        />
      )}
    </div>
  );
}

function MovementModal({ storeId, onClose, onDone }: { storeId: number; onClose: () => void; onDone: () => void }) {
  const [parcItems, setParcItems] = useState<ParcItem[]>([]);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [form, setForm] = useState({ parc_itemtype: '', parc_glpi_id: '', type: 'in', quantity: '1', location_id: '', counterpart_store_id: '', reason: '', reference: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    stocksApi.listParcItems().then(setParcItems).catch(() => {});
    stocksApi.listLocations(storeId).then(setLocations).catch(() => {});
    stocksApi.listStores().then(setStores).catch(() => {});
  }, [storeId]);

  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function submit() {
    setErr(null);
    if (!form.parc_itemtype) { setErr('Sélectionnez un équipement'); return; }
    setSaving(true);
    try {
      await stocksApi.createMovement(storeId, {
        parc_itemtype: form.parc_itemtype,
        parc_glpi_id: Number(form.parc_glpi_id),
        type: form.type,
        quantity: Number(form.quantity),
        location_id: form.location_id ? Number(form.location_id) : null,
        counterpart_store_id: form.type === 'transfer' && form.counterpart_store_id ? Number(form.counterpart_store_id) : null,
        reason: form.reason || null,
        reference: form.reference || null,
      });
      onDone();
    } catch (e: any) {
      setErr(e.response?.data?.message || e.message);
    } finally {
      setSaving(false);
    }
  }

  const field: React.CSSProperties = { width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, boxSizing: 'border-box', marginBottom: 12 };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 22, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>Nouveau mouvement</h2>
        {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>{err}</div>}

        <label style={label}>Équipement (parc) *</label>
        <select style={field} value={form.parc_itemtype ? `${form.parc_itemtype}::${form.parc_glpi_id}` : ''} onChange={e => {
          const val = e.target.value;
          if (!val) { setForm(f => ({ ...f, parc_itemtype: '', parc_glpi_id: '' })); return; }
          const [itemtype, glpi_id] = val.split('::');
          setForm(f => ({ ...f, parc_itemtype: itemtype, parc_glpi_id: glpi_id }));
        }}>
          <option value="">— Choisir —</option>
          {parcItems.map(i => (
            <option key={`${i.parc_itemtype}::${i.parc_glpi_id}`} value={`${i.parc_itemtype}::${i.parc_glpi_id}`}>
              {i.label}{i.serial ? ` (${i.serial})` : ''} {i.brand ? `— ${i.brand}` : ''}
            </option>
          ))}
        </select>

        <label style={label}>Type de mouvement *</label>
        <select style={field} value={form.type} onChange={e => upd('type', e.target.value)}>
          <option value="in">Entrée</option>
          <option value="out">Sortie</option>
          <option value="adjust">Ajustement (qté +/-)</option>
          <option value="transfer">Transfert vers un autre magasin</option>
          <option value="loan_out">Prêt (stock de prêt)</option>
          <option value="loan_return">Retour de prêt</option>
        </select>

        <label style={label}>Quantité *</label>
        <input style={field} type="number" value={form.quantity} onChange={e => upd('quantity', e.target.value)} />

        {form.type !== 'transfer' && form.type !== 'loan_out' && form.type !== 'loan_return' && (
          <>
            <label style={label}>Emplacement</label>
            <select style={field} value={form.location_id} onChange={e => upd('location_id', e.target.value)}>
              <option value="">— Aucun —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </>
        )}

        {form.type === 'transfer' && (
          <>
            <label style={label}>Magasin destination *</label>
            <select style={field} value={form.counterpart_store_id} onChange={e => upd('counterpart_store_id', e.target.value)}>
              <option value="">— Choisir —</option>
              {stores.filter(s => s.id !== storeId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </>
        )}

        <label style={label}>Référence (BL, commande…)</label>
        <input style={field} value={form.reference} onChange={e => upd('reference', e.target.value)} />

        <label style={label}>Motif / note</label>
        <input style={field} value={form.reason} onChange={e => upd('reason', e.target.value)} />

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '12px', border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Annuler</button>
          <button onClick={submit} disabled={saving} style={{ flex: 2, padding: '12px', border: 'none', borderRadius: 10, background: saving ? '#a5b4fc' : '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            {saving ? 'Enregistrement…' : 'Valider le mouvement'}
          </button>
        </div>
      </div>
    </div>
  );
}
