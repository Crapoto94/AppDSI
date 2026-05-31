import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import { Package, ScanLine, Plus, Trash2, CheckCircle, ArrowLeft, Search, Loader } from 'lucide-react';
import BarcodeScanner from './BarcodeScanner';
import { stocksApi, type Store, type StorageLocation, type Order, type Reception as Rec, type ReceptionLine } from './api';

const C = { indigo: '#6366f1', red: '#ef4444', green: '#22c55e', amber: '#f59e0b', slate: '#64748b', border: '#e2e8f0', text: '#1e293b', bg: '#f8fafc' };

export default function Reception() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [reception, setReception] = useState<(Rec & { lines: ReceptionLine[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Association commande
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderQuery, setOrderQuery] = useState('');
  const [loadingOrders, setLoadingOrders] = useState(false);

  const canOperate = role === 'operator' || role === 'manager';

  useEffect(() => {
    stocksApi.listStores().then(d => { setStores(d); if (d.length) setStoreId(d[0].id); }).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    if (storeId == null) return;
    stocksApi.myRole(storeId).then(r => setRole(r.role)).catch(() => {});
    stocksApi.listLocations(storeId).then(setLocations).catch(() => setLocations([]));
  }, [storeId]);

  async function loadOrders() {
    if (storeId == null) return;
    setLoadingOrders(true);
    try { setOrders(await stocksApi.listOrders(storeId, { fiscalYear, budgetScope: 'Ville' })); }
    catch (e: any) { setError(e.response?.data?.message || e.message); }
    finally { setLoadingOrders(false); }
  }

  async function startReception(order?: Order) {
    if (storeId == null) return;
    setError(null);
    try {
      const rec = await stocksApi.createReception(storeId, {
        order_number: order?.order_number || order?.id,
        supplier: order?.TIERS_TIERS || order?.provider,
      });
      setReception({ ...rec, lines: [] });
    } catch (e: any) { setError(e.response?.data?.message || e.message); }
  }

  const refreshReception = useCallback(async () => {
    if (storeId == null || !reception) return;
    const detail = await stocksApi.getReception(storeId, reception.id);
    setReception(detail);
  }, [storeId, reception]);

  const filteredOrders = orders.filter(o =>
    !orderQuery || `${o.order_number} ${o.COMMANDE_LIBELLE || o.description || ''} ${o.TIERS_TIERS || ''}`.toLowerCase().includes(orderQuery.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <style>{`
        .rc-wrap { max-width: 640px; margin: 0 auto; padding: 16px 12px 80px; }
        .rc-card { background:#fff; border:1px solid ${C.border}; border-radius:14px; padding:16px; margin-bottom:14px; }
        .rc-btn { padding:12px 16px; border:none; border-radius:12px; background:${C.indigo}; color:#fff; font-weight:600; cursor:pointer; font-size:15px; display:inline-flex; align-items:center; justify-content:center; gap:8px; width:100%; }
        .rc-btn-scan { background:#0f172a; }
        .rc-btn-ghost { background:#fff; color:${C.slate}; border:1px solid ${C.border}; }
        .rc-input { width:100%; padding:12px; border:1px solid ${C.border}; border-radius:10px; font-size:15px; box-sizing:border-box; }
        .rc-label { font-size:12px; font-weight:600; color:#374151; display:block; margin:0 0 5px; }
        .rc-row { margin-bottom:12px; }
        .rc-select { width:100%; padding:12px; border:1px solid ${C.border}; border-radius:10px; font-size:15px; box-sizing:border-box; background:#fff; }
        .rc-orderitem { padding:10px 12px; border-bottom:1px solid #f1f5f9; cursor:pointer; font-size:13px; }
        .rc-orderitem:active { background:#eef2ff; }
      `}</style>
      <Header />

      <div className="rc-wrap">
        <button onClick={() => navigate('/stocks')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <ArrowLeft size={16} /> Stocks
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Package size={22} color={C.indigo} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Réception de commande</h1>
        </div>

        {error && <div className="rc-card" style={{ color: C.red, borderColor: '#fecaca', background: '#fef2f2' }}>{error}</div>}

        {/* Sélecteur magasin */}
        <div className="rc-card">
          <label className="rc-label">Magasin</label>
          <select className="rc-select" value={storeId ?? ''} onChange={e => { setStoreId(Number(e.target.value)); setReception(null); }}>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {role && <div style={{ marginTop: 8, fontSize: 12, color: C.slate }}>Rôle : <strong>{role}</strong></div>}
        </div>

        {!canOperate && storeId != null && (
          <div className="rc-card" style={{ color: C.amber }}>Vous devez être <strong>operator</strong> ou <strong>manager</strong> sur ce magasin pour réceptionner.</div>
        )}

        {/* Étape 1 : créer / associer commande */}
        {canOperate && !reception && (
          <div className="rc-card">
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Associer une commande (optionnel)</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <input className="rc-input" type="number" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))} style={{ flex: 1 }} />
              <button className="rc-btn rc-btn-ghost" style={{ width: 'auto', padding: '0 16px' }} onClick={loadOrders}>
                {loadingOrders ? <Loader size={16} /> : <Search size={16} />} Charger
              </button>
            </div>
            {orders.length > 0 && (
              <>
                <input className="rc-input" placeholder="Filtrer (n°, libellé, fournisseur)…" value={orderQuery} onChange={e => setOrderQuery(e.target.value)} style={{ marginBottom: 8 }} />
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 220, overflowY: 'auto', marginBottom: 12 }}>
                  {filteredOrders.slice(0, 50).map(o => (
                    <div key={o.id} className="rc-orderitem" onClick={() => startReception(o)}>
                      <strong>#{o.order_number}</strong> — {o.COMMANDE_LIBELLE || o.description || ''}
                      <div style={{ color: C.slate }}>{o.TIERS_TIERS || o.provider || ''}{o['Nb lignes'] ? ` · ${o['Nb lignes']} ligne(s)` : ''}</div>
                    </div>
                  ))}
                  {filteredOrders.length === 0 && <div style={{ padding: 12, color: C.slate, fontSize: 13 }}>Aucune commande</div>}
                </div>
              </>
            )}
            <button className="rc-btn" onClick={() => startReception()}>
              <Plus size={18} /> Réception sans commande
            </button>
          </div>
        )}

        {/* Étape 2 : lignes */}
        {reception && (
          <ReceptionEditor
            storeId={storeId!}
            reception={reception}
            locations={locations}
            onRefresh={refreshReception}
            onValidated={() => navigate('/stocks')}
            onReset={() => setReception(null)}
          />
        )}
      </div>
    </div>
  );
}

function ReceptionEditor({ storeId, reception, locations, onRefresh, onValidated, onReset }: {
  storeId: number; reception: Rec & { lines: ReceptionLine[] }; locations: StorageLocation[];
  onRefresh: () => Promise<void>; onValidated: () => void; onReset: () => void;
}) {
  const [scanning, setScanning] = useState(false);
  const [looking, setLooking] = useState(false);
  const [line, setLine] = useState({ ean: '', reference: '', label: '', brand: '', model: '', quantity_received: '1', tracking_mode: 'batch', location_id: '', specs: {} as Record<string, string> });
  const [err, setErr] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const upd = (k: string, v: any) => setLine(l => ({ ...l, [k]: v }));

  async function onScan(code: string) {
    setScanning(false);
    upd('ean', code);
    await doLookup(code);
  }

  async function doLookup(code: string) {
    if (!code) return;
    setLooking(true); setErr(null);
    try {
      const r = await stocksApi.eanLookup(code);
      if (r.found) {
        setLine(l => ({
          ...l, ean: code,
          label: r.label || l.label, brand: r.brand || l.brand, model: r.model || l.model,
          reference: l.reference || (r.specs?.model as string) || '',
          specs: { ...(r.specs || {}), category: r.category || '' },
        }));
      }
    } catch (e: any) { setErr(e.response?.data?.message || e.message); }
    finally { setLooking(false); }
  }

  async function addLine() {
    setErr(null);
    if (!line.label && !line.reference && !line.ean) { setErr('Renseignez au moins une référence/EAN/libellé'); return; }
    try {
      await stocksApi.addReceptionLine(storeId, reception.id, {
        ean: line.ean || undefined,
        reference: line.reference || undefined,
        label: line.label || line.reference || line.ean,
        quantity_received: Number(line.quantity_received) || 1,
        tracking_mode: line.tracking_mode as 'batch' | 'serial',
        location_id: line.location_id ? Number(line.location_id) : null,
        specs: { ...line.specs, brand: line.brand, model: line.model },
      });
      setLine({ ean: '', reference: '', label: '', brand: '', model: '', quantity_received: '1', tracking_mode: line.tracking_mode, location_id: line.location_id, specs: {} });
      await onRefresh();
    } catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }

  async function removeLine(id: number) {
    try { await stocksApi.deleteReceptionLine(storeId, reception.id, id); await onRefresh(); }
    catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }

  async function validate() {
    setValidating(true); setErr(null);
    try {
      const res = await stocksApi.validateReception(storeId, reception.id);
      const n = res.serials_created || 0;
      alert(`Réception validée.${n ? ` ${n} article(s) sérialisé(s) créé(s) — pensez à saisir les n° de série.` : ''}`);
      onValidated();
    } catch (e: any) { setErr(e.response?.data?.message || e.message); }
    finally { setValidating(false); }
  }

  const isReceived = reception.status === 'received';

  return (
    <>
      <div className="rc-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, color: C.text }}>Réception #{reception.id}</div>
            <div style={{ fontSize: 13, color: C.slate }}>
              {reception.order_number ? `Commande #${reception.order_number}` : 'Sans commande'}
              {reception.supplier ? ` · ${reception.supplier}` : ''}
            </div>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: isReceived ? '#dcfce7' : '#eef2ff', color: isReceived ? C.green : C.indigo }}>
            {isReceived ? 'Réceptionnée' : 'Brouillon'}
          </span>
        </div>
      </div>

      {!isReceived && (
        <div className="rc-card">
          <button className="rc-btn rc-btn-scan" onClick={() => setScanning(true)} style={{ marginBottom: 14 }}>
            <ScanLine size={20} /> Scanner un code-barres / QR
          </button>

          <div className="rc-row">
            <label className="rc-label">EAN / code-barres</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="rc-input" value={line.ean} onChange={e => upd('ean', e.target.value)} />
              <button className="rc-btn rc-btn-ghost" style={{ width: 'auto', padding: '0 14px' }} onClick={() => doLookup(line.ean)} disabled={looking}>
                {looking ? <Loader size={16} /> : <Search size={16} />}
              </button>
            </div>
          </div>
          <div className="rc-row"><label className="rc-label">Libellé</label><input className="rc-input" value={line.label} onChange={e => upd('label', e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 8 }} className="rc-row">
            <div style={{ flex: 1 }}><label className="rc-label">Marque</label><input className="rc-input" value={line.brand} onChange={e => upd('brand', e.target.value)} /></div>
            <div style={{ flex: 1 }}><label className="rc-label">Modèle</label><input className="rc-input" value={line.model} onChange={e => upd('model', e.target.value)} /></div>
          </div>
          <div className="rc-row"><label className="rc-label">Référence</label><input className="rc-input" value={line.reference} onChange={e => upd('reference', e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 8 }} className="rc-row">
            <div style={{ flex: 1 }}>
              <label className="rc-label">Quantité</label>
              <input className="rc-input" type="number" value={line.quantity_received} onChange={e => upd('quantity_received', e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="rc-label">Suivi</label>
              <select className="rc-select" value={line.tracking_mode} onChange={e => upd('tracking_mode', e.target.value)}>
                <option value="batch">Lot</option>
                <option value="serial">Unitaire (n° série)</option>
              </select>
            </div>
          </div>
          <div className="rc-row">
            <label className="rc-label">Emplacement</label>
            <select className="rc-select" value={line.location_id} onChange={e => upd('location_id', e.target.value)}>
              <option value="">— Aucun —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{err}</div>}
          <button className="rc-btn" onClick={addLine}><Plus size={18} /> Ajouter la ligne</button>
        </div>
      )}

      <div className="rc-card">
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Lignes ({reception.lines.length})</div>
        {reception.lines.map(l => (
          <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div>
              <div style={{ fontWeight: 500, fontSize: 14 }}>{l.label || l.reference || l.ean}</div>
              <div style={{ fontSize: 12, color: C.slate }}>
                Qté {l.quantity_received} · {l.tracking_mode === 'serial' ? 'Unitaire' : 'Lot'}{l.reference ? ` · ${l.reference}` : ''}
              </div>
            </div>
            {!isReceived && <button onClick={() => removeLine(l.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red }}><Trash2 size={18} /></button>}
          </div>
        ))}
        {reception.lines.length === 0 && <div style={{ color: C.slate, fontSize: 13, padding: 8 }}>Aucune ligne</div>}
      </div>

      {!isReceived && (
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="rc-btn rc-btn-ghost" style={{ flex: 1 }} onClick={onReset}>Annuler</button>
          <button className="rc-btn" style={{ flex: 2, background: reception.lines.length ? C.green : '#86efac' }} onClick={validate} disabled={validating || reception.lines.length === 0}>
            <CheckCircle size={18} /> {validating ? 'Validation…' : 'Valider la réception'}
          </button>
        </div>
      )}

      {scanning && <BarcodeScanner onResult={onScan} onClose={() => setScanning(false)} />}
    </>
  );
}
