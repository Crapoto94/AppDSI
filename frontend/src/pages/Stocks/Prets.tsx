import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../../components/Header';
import { Repeat, ArrowLeft, Plus, Search, RotateCcw, AlertTriangle } from 'lucide-react';
import SignaturePad from './SignaturePad';
import { stocksApi, type Store, type Item, type Loan } from './api';

const C = { indigo: '#6366f1', red: '#ef4444', green: '#22c55e', amber: '#f59e0b', slate: '#64748b', border: '#e2e8f0', text: '#1e293b', bg: '#f8fafc' };

export default function Prets() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<number | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const canOperate = role === 'operator' || role === 'manager';

  useEffect(() => {
    stocksApi.listStores().then(d => { setStores(d); if (d.length) setStoreId(d[0].id); }).catch(e => setError(e.message));
    stocksApi.listItems().then(setItems).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (storeId == null) return;
    stocksApi.myRole(storeId).then(r => setRole(r.role)).catch(() => {});
    stocksApi.listLoans(storeId).then(setLoans).catch(e => setError(e.response?.data?.message || e.message));
  }, [storeId]);
  useEffect(() => { load(); }, [load]);

  async function doReturn(id: number) {
    if (storeId == null) return;
    try { await stocksApi.returnLoan(storeId, id); load(); }
    catch (e: any) { setError(e.response?.data?.message || e.message); }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <style>{`
        .pr-wrap { max-width: 700px; margin: 0 auto; padding: 16px 12px 80px; }
        .pr-card { background:#fff; border:1px solid ${C.border}; border-radius:14px; padding:16px; margin-bottom:14px; }
        .pr-btn { padding:11px 16px; border:none; border-radius:12px; background:${C.indigo}; color:#fff; font-weight:600; cursor:pointer; font-size:14px; display:inline-flex; align-items:center; gap:8px; }
        .pr-btn-ghost { background:#fff; color:${C.slate}; border:1px solid ${C.border}; }
      `}</style>
      <Header />
      <div className="pr-wrap">
        <button onClick={() => navigate('/stocks')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.slate, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
          <ArrowLeft size={16} /> Stocks
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Repeat size={22} color={C.indigo} />
            <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Prêts</h1>
          </div>
          {canOperate && <button className="pr-btn" onClick={() => setShowForm(true)}><Plus size={18} /> Nouveau prêt</button>}
        </div>

        {error && <div className="pr-card" style={{ color: C.red, borderColor: '#fecaca', background: '#fef2f2' }}>{error}</div>}

        <div className="pr-card">
          <select style={{ width: '100%', padding: 12, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 15, background: '#fff' }} value={storeId ?? ''} onChange={e => setStoreId(Number(e.target.value))}>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <div style={{ fontSize: 12, color: C.slate, marginTop: 8 }}>Les prêts puisent dans le <strong>stock de prêt</strong> dédié (onglet « Prêt » du tableau de bord).</div>
        </div>

        {loans.map(l => (
          <div key={l.id} className="pr-card" style={{ borderLeft: `4px solid ${l.status === 'returned' ? C.green : l.overdue ? C.red : C.indigo}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600, color: C.text }}>{l.item_label} {l.serial_number ? <span style={{ color: C.slate, fontWeight: 400 }}>· {l.serial_number}</span> : null}</div>
                <div style={{ fontSize: 13, color: C.slate, marginTop: 2 }}>
                  {l.quantity}× · {l.borrower_name || '—'} · prêté le {new Date(l.loaned_at).toLocaleDateString('fr-FR')}
                  {l.due_date ? ` · retour prévu ${new Date(l.due_date).toLocaleDateString('fr-FR')}` : ''}
                </div>
                {l.overdue && <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: C.red, fontSize: 12, fontWeight: 600, marginTop: 4 }}><AlertTriangle size={14} /> En retard</div>}
              </div>
              {l.status === 'active' ? (
                canOperate && <button className="pr-btn pr-btn-ghost" onClick={() => doReturn(l.id)}><RotateCcw size={15} /> Retour</button>
              ) : (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8, background: '#dcfce7', color: C.green }}>Rendu</span>
              )}
            </div>
          </div>
        ))}
        {loans.length === 0 && <div className="pr-card" style={{ textAlign: 'center', color: C.slate }}>Aucun prêt</div>}
      </div>

      {showForm && storeId != null && (
        <LoanModal storeId={storeId} items={items} onClose={() => setShowForm(false)} onDone={() => { setShowForm(false); load(); }} />
      )}
    </div>
  );
}

function LoanModal({ storeId, items, onClose, onDone }: { storeId: number; items: Item[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ item_id: '', quantity: '1', due_date: '' });
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [borrower, setBorrower] = useState<{ name: string; username?: string; email?: string } | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function searchAd() {
    if (q.trim().length < 2) return;
    try {
      const { data } = await axios.get('/api/ad/search', { params: { q: q.trim() }, headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
      setResults(data || []);
    } catch (e: any) { setErr(e.response?.data?.message || e.message); }
  }
  async function submit() {
    setErr(null);
    if (!form.item_id) { setErr('Sélectionnez un article'); return; }
    if (!borrower) { setErr('Sélectionnez un emprunteur'); return; }
    setSaving(true);
    try {
      await stocksApi.createLoan(storeId, {
        item_id: Number(form.item_id), quantity: Number(form.quantity) || 1, due_date: form.due_date || null,
        borrower_name: borrower.name, borrower_username: borrower.username, borrower_email: borrower.email, signature,
      });
      onDone();
    } catch (e: any) { setErr(e.response?.data?.message || e.message); }
    finally { setSaving(false); }
  }

  const field: React.CSSProperties = { width: '100%', padding: '11px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 15, boxSizing: 'border-box', marginBottom: 12 };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: '16px 16px 0 0', padding: 22, width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 16px' }}>Nouveau prêt</h2>
        {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 13 }}>{err}</div>}

        <label style={label}>Article (stock de prêt) *</label>
        <select style={field} value={form.item_id} onChange={e => setForm({ ...form, item_id: e.target.value })}>
          <option value="">— Choisir —</option>
          {items.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
        </select>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><label style={label}>Quantité</label><input style={field} type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
          <div style={{ flex: 1 }}><label style={label}>Retour prévu</label><input style={field} type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
        </div>

        <label style={label}>Emprunteur *</label>
        {borrower ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <strong>{borrower.name}</strong>
            <button onClick={() => setBorrower(null)} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#64748b' }}>Changer</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input style={{ ...field, marginBottom: 0 }} placeholder="Rechercher (AD)…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchAd()} />
              <button onClick={searchAd} style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', padding: '0 14px', cursor: 'pointer' }}><Search size={16} /></button>
            </div>
            {results.length > 0 && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, maxHeight: 160, overflowY: 'auto', marginBottom: 12 }}>
                {results.map((r, i) => (
                  <div key={i} onClick={() => { setBorrower({ name: r.displayName || r.username, username: r.username, email: r.email }); setResults([]); setQ(''); }}
                    style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}>
                    <strong>{r.displayName || r.username}</strong> <span style={{ color: '#64748b' }}>({r.username})</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <label style={label}>Signature de l'emprunteur (optionnel)</label>
        <div style={{ marginBottom: 14 }}><SignaturePad onChange={setSignature} height={140} /></div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff', cursor: 'pointer', fontWeight: 600 }}>Annuler</button>
          <button onClick={submit} disabled={saving} style={{ flex: 2, padding: 12, border: 'none', borderRadius: 10, background: saving ? '#a5b4fc' : '#6366f1', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            {saving ? 'Enregistrement…' : 'Enregistrer le prêt'}
          </button>
        </div>
      </div>
    </div>
  );
}
