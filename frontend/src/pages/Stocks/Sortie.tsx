import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../../components/Header';
import { Send, ArrowLeft, Plus, Trash2, Search, CheckCircle, UserCheck } from 'lucide-react';
import SignaturePad from './SignaturePad';
import { stocksApi, type Store, type Item, type StorageLocation } from './api';

const C = { indigo: '#6366f1', red: '#ef4444', green: '#22c55e', amber: '#f59e0b', slate: '#64748b', border: '#e2e8f0', text: '#1e293b', bg: '#f8fafc' };

interface Line { item_id: number; label: string; quantity: number; location_id?: number | null; }

export default function Sortie() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Bénéficiaire (AD)
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [beneficiary, setBeneficiary] = useState<{ name: string; username?: string; email?: string } | null>(null);

  // Lignes
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState({ item_id: '', quantity: '1', location_id: '' });

  // Signature
  const [signature, setSignature] = useState<string | null>(null);

  const canOperate = role === 'operator' || role === 'manager';

  useEffect(() => {
    stocksApi.listStores().then(d => { setStores(d); if (d.length) setStoreId(d[0].id); }).catch(e => setError(e.message));
    stocksApi.listItems().then(setItems).catch(() => {});
  }, []);
  useEffect(() => {
    if (storeId == null) return;
    stocksApi.myRole(storeId).then(r => setRole(r.role)).catch(() => {});
    stocksApi.listLocations(storeId).then(setLocations).catch(() => setLocations([]));
  }, [storeId]);

  async function searchAd() {
    if (q.trim().length < 2) return;
    try {
      const { data } = await axios.get('/api/ad/search', { params: { q: q.trim() }, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setResults(data || []);
    } catch (e: any) { setError(e.response?.data?.message || e.message); }
  }

  function addLine() {
    if (!pick.item_id) return;
    const it = items.find(i => i.id === Number(pick.item_id));
    if (!it) return;
    setLines(ls => [...ls, { item_id: it.id, label: it.label, quantity: Number(pick.quantity) || 1, location_id: pick.location_id ? Number(pick.location_id) : null }]);
    setPick({ item_id: '', quantity: '1', location_id: pick.location_id });
  }

  async function submit() {
    setError(null);
    if (storeId == null) return;
    if (lines.length === 0) { setError('Ajoutez au moins un article'); return; }
    if (!beneficiary) { setError('Sélectionnez un bénéficiaire'); return; }
    setSubmitting(true);
    try {
      await stocksApi.createDelivery(storeId, {
        beneficiary_name: beneficiary.name,
        beneficiary_username: beneficiary.username,
        beneficiary_email: beneficiary.email,
        lines: lines.map(l => ({ item_id: l.item_id, quantity: l.quantity, location_id: l.location_id })),
        signature,
      });
      alert('Sortie enregistrée' + (signature ? ' avec BL signé.' : '.'));
      navigate('/stocks');
    } catch (e: any) { setError(e.response?.data?.message || e.message); }
    finally { setSubmitting(false); }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <style>{`
        .so-wrap { max-width: 640px; margin: 0 auto; padding: 16px 12px 80px; }
        .so-card { background:#fff; border:1px solid ${C.border}; border-radius:14px; padding:16px; margin-bottom:14px; }
        .so-btn { padding:12px 16px; border:none; border-radius:12px; background:${C.indigo}; color:#fff; font-weight:600; cursor:pointer; font-size:15px; display:inline-flex; align-items:center; justify-content:center; gap:8px; width:100%; }
        .so-btn-ghost { background:#fff; color:${C.slate}; border:1px solid ${C.border}; }
        .so-input { width:100%; padding:12px; border:1px solid ${C.border}; border-radius:10px; font-size:15px; box-sizing:border-box; }
        .so-select { width:100%; padding:12px; border:1px solid ${C.border}; border-radius:10px; font-size:15px; box-sizing:border-box; background:#fff; }
        .so-label { font-size:12px; font-weight:600; color:#374151; display:block; margin:0 0 5px; }
      `}</style>
      <Header />
      <div className="so-wrap">
        <button onClick={() => navigate('/stocks')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <ArrowLeft size={16} /> Stocks
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Send size={22} color={C.indigo} />
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Sortie de stock</h1>
        </div>

        {error && <div className="so-card" style={{ color: C.red, borderColor: '#fecaca', background: '#fef2f2' }}>{error}</div>}

        <div className="so-card">
          <label className="so-label">Magasin</label>
          <select className="so-select" value={storeId ?? ''} onChange={e => setStoreId(Number(e.target.value))}>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {!canOperate && storeId != null && (
          <div className="so-card" style={{ color: C.amber }}>Rôle operator/manager requis sur ce magasin.</div>
        )}

        {/* Bénéficiaire */}
        <div className="so-card">
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Bénéficiaire</div>
          {beneficiary ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><UserCheck size={18} color={C.green} /> <strong>{beneficiary.name}</strong> {beneficiary.username ? <span style={{ color: C.slate }}>({beneficiary.username})</span> : null}</span>
              <button className="so-btn-ghost" style={{ padding: '6px 12px', borderRadius: 8, cursor: 'pointer' }} onClick={() => setBeneficiary(null)}>Changer</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input className="so-input" placeholder="Rechercher (AD)…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchAd()} />
                <button className="so-btn so-btn-ghost" style={{ width: 'auto', padding: '0 14px' }} onClick={searchAd}><Search size={16} /></button>
              </div>
              {results.length > 0 && (
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, maxHeight: 180, overflowY: 'auto' }}>
                  {results.map((r, i) => (
                    <div key={i} onClick={() => { setBeneficiary({ name: r.displayName || r.username, username: r.username, email: r.email }); setResults([]); setQ(''); }}
                      style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}>
                      <strong>{r.displayName || r.username}</strong> <span style={{ color: C.slate }}>({r.username})</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Lignes */}
        <div className="so-card">
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Articles à sortir</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <select className="so-select" style={{ flex: 2 }} value={pick.item_id} onChange={e => setPick({ ...pick, item_id: e.target.value })}>
              <option value="">— Article —</option>
              {items.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
            <input className="so-input" style={{ flex: 1, maxWidth: 80 }} type="number" value={pick.quantity} onChange={e => setPick({ ...pick, quantity: e.target.value })} />
            <button className="so-btn" style={{ width: 'auto', padding: '0 14px' }} onClick={addLine}><Plus size={18} /></button>
          </div>
          {locations.length > 0 && (
            <select className="so-select" value={pick.location_id} onChange={e => setPick({ ...pick, location_id: e.target.value })}>
              <option value="">Emplacement : aucun</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <div style={{ marginTop: 10 }}>
            {lines.map((l, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                <span style={{ fontSize: 14 }}><strong>{l.quantity}×</strong> {l.label}</span>
                <button onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red }}><Trash2 size={16} /></button>
              </div>
            ))}
            {lines.length === 0 && <div style={{ color: C.slate, fontSize: 13 }}>Aucun article</div>}
          </div>
        </div>

        {/* Signature */}
        <div className="so-card">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Signature du bénéficiaire</div>
          <div style={{ fontSize: 12, color: C.slate, marginBottom: 10 }}>Faites signer sur l'écran (le bon de livraison signé sera archivé).</div>
          <SignaturePad onChange={setSignature} />
        </div>

        <button className="so-btn" style={{ background: C.green }} onClick={submit} disabled={submitting || lines.length === 0 || !beneficiary}>
          <CheckCircle size={18} /> {submitting ? 'Enregistrement…' : (signature ? 'Valider et signer le BL' : 'Valider la sortie')}
        </button>
      </div>
    </div>
  );
}
