import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Barcode, ArrowLeft, Check, ScanLine } from 'lucide-react';
import BarcodeScanner from './BarcodeScanner';
import { stocksApi, type Store, type SerialItem } from './api';

const C = { indigo: '#6366f1', red: '#ef4444', green: '#22c55e', slate: '#64748b', border: '#e2e8f0', text: '#1e293b', bg: '#f8fafc' };

export default function SerialEntry() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<SerialItem[]>([]);
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [scanFor, setScanFor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canOperate = role === 'operator' || role === 'manager';

  useEffect(() => {
    stocksApi.listStores().then(d => { setStores(d); if (d.length) setStoreId(d[0].id); }).catch(e => setError(e.message));
  }, []);

  const load = useCallback(() => {
    if (storeId == null) return;
    stocksApi.myRole(storeId).then(r => setRole(r.role)).catch(() => {});
    stocksApi.listSerialItems(storeId, onlyMissing ? { missing_serial: '1' } : undefined)
      .then(setItems).catch(e => setError(e.response?.data?.message || e.message));
  }, [storeId, onlyMissing]);

  useEffect(() => { load(); }, [load]);

  async function save(id: number) {
    if (storeId == null) return;
    const val = (drafts[id] || '').trim();
    if (!val) return;
    try {
      await stocksApi.setSerialNumber(storeId, id, val);
      setDrafts(d => { const c = { ...d }; delete c[id]; return c; });
      load();
    } catch (e: any) { setError(e.response?.data?.message || e.message); }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <style>{`
        .se-wrap { max-width: 640px; margin: 0 auto; padding: 16px 12px 80px; }
        .se-card { background:#fff; border:1px solid ${C.border}; border-radius:14px; padding:16px; margin-bottom:14px; }
        .se-input { width:100%; padding:11px; border:1px solid ${C.border}; border-radius:10px; font-size:15px; box-sizing:border-box; }
        .se-select { width:100%; padding:12px; border:1px solid ${C.border}; border-radius:10px; font-size:15px; box-sizing:border-box; background:#fff; }
        .se-btn { padding:11px 14px; border:none; border-radius:10px; background:${C.indigo}; color:#fff; font-weight:600; cursor:pointer; font-size:14px; display:inline-flex; align-items:center; gap:6px; }
        .se-btn-ghost { background:#fff; color:${C.slate}; border:1px solid ${C.border}; }
      `}</style>
      <div className="se-wrap">
        <button onClick={() => navigate('/stocks')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <ArrowLeft size={16} /> Stocks
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Barcode size={22} color={C.indigo} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Saisie des numéros de série</h1>
        </div>

        {error && <div className="se-card" style={{ color: C.red, borderColor: '#fecaca', background: '#fef2f2' }}>{error}</div>}

        <div className="se-card">
          <select className="se-select" value={storeId ?? ''} onChange={e => setStoreId(Number(e.target.value))}>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14, color: C.slate }}>
            <input type="checkbox" checked={onlyMissing} onChange={e => setOnlyMissing(e.target.checked)} />
            Afficher uniquement les articles sans n° de série
          </label>
        </div>

        {!canOperate && storeId != null && (
          <div className="se-card" style={{ color: C.red }}>Rôle operator/manager requis pour saisir les numéros.</div>
        )}

        {items.map(it => (
          <div key={it.id} className="se-card">
            <div style={{ fontWeight: 600, color: C.text }}>{it.item_label}</div>
            <div style={{ fontSize: 12, color: C.slate, marginBottom: 10 }}>
              {[it.brand, it.model].filter(Boolean).join(' ')}{it.order_number ? ` · Cmd #${it.order_number}` : ''} · #{it.id}
            </div>
            {it.serial_number ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: C.green, fontSize: 14, fontWeight: 600 }}>
                <Check size={16} /> {it.serial_number}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="se-input" placeholder="N° de série" value={drafts[it.id] || ''} onChange={e => setDrafts(d => ({ ...d, [it.id]: e.target.value }))} disabled={!canOperate} />
                <button className="se-btn se-btn-ghost" style={{ padding: '0 12px' }} onClick={() => setScanFor(it.id)} disabled={!canOperate}><ScanLine size={18} /></button>
                <button className="se-btn" onClick={() => save(it.id)} disabled={!canOperate || !(drafts[it.id] || '').trim()}><Check size={16} /></button>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <div className="se-card" style={{ textAlign: 'center', color: C.slate }}>Aucun article {onlyMissing ? 'en attente de n° de série' : 'sérialisé'}</div>}
      </div>

      {scanFor != null && (
        <BarcodeScanner
          onResult={(code) => { setDrafts(d => ({ ...d, [scanFor]: code })); setScanFor(null); }}
          onClose={() => setScanFor(null)}
        />
      )}
    </div>
  );
}
