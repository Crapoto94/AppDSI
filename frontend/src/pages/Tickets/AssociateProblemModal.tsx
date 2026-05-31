import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { X, Search } from 'lucide-react';

interface Props {
  ticketId: number;
  onClose: () => void;
  onAssociated: () => void;
}

export default function AssociateProblemModal({ ticketId, onClose, onAssociated }: Props) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/tickets/search?q=${encodeURIComponent(search)}&type=3`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setResults(res.data.filter((t: any) => t.id !== ticketId));
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  async function associate(problemTicketId: number) {
    try {
      const token = localStorage.getItem('token');
      // Link the ticket's group to the problem
      await axios.post(`/api/tickets/${ticketId}/link-to-problem`, { problem_ticket_id: problemTicketId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onAssociated();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur lors de l\'association');
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, width: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 17, fontWeight: 700 }}>Associer à un problème existant</h3>
        {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 10, color: '#94a3b8' }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un ticket problème..."
            style={{ width: '100%', padding: '8px 10px 8px 34px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} autoFocus />
        </div>
        <div style={{ maxHeight: 300, overflow: 'auto' }}>
          {results.map(t => (
            <div key={t.id} onClick={() => associate(t.id)} style={{ padding: '10px', borderBottom: '1px solid #f4f4f5', cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600 }}>#{t.id}</span>
              <span style={{ color: '#475569' }}>{t.title}</span>
            </div>
          ))}
          {loading && <div style={{ textAlign: 'center', padding: 10 }}>Recherche...</div>}
        </div>
        <button onClick={onClose} style={{ marginTop: 16, width: '100%', padding: '10px', background: '#f1f5f9', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Annuler</button>
      </div>
    </div>
  );
}
