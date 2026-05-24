import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

interface Props {
  value: string;
  onChange: (email: string, name: string) => void;
  initialEmail?: string;
  initialName?: string;
}

export default function RequesterSearch({ value, onChange, initialEmail, initialName }: Props) {
  const [query, setQuery] = useState(initialName || '');
  const [results, setResults] = useState<any[]>([]);
  const [selected, setSelected] = useState<{ name: string; email: string } | null>(
    initialEmail && initialName ? { name: initialName, email: initialEmail } : null
  );
  const [ticketData, setTicketData] = useState<{ count: number; tickets: any[] } | null>(null);
  const [showTicketList, setShowTicketList] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (selected && selected.email) {
      loadTickets(selected.email);
    }
  }, [selected?.email]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function searchAD(q: string) {
    if (q.length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get(`/api/ad/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setResults(res.data);
        setOpen(true);
      } catch (e) { console.error(e); }
    }, 300);
  }

  async function loadTickets(email: string) {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/tickets/requester/${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTicketData(res.data);
    } catch (e) { console.error(e); }
  }

  function selectUser(u: any) {
    setSelected({ name: u.displayName, email: u.email });
    setQuery(u.displayName);
    onChange(u.email, u.displayName);
    setOpen(false);
  }

  function clearUser() {
    setSelected(null);
    setQuery('');
    setTicketData(null);
    onChange('', '');
  }

  const modalStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); searchAD(e.target.value); if (selected) clearUser(); }}
            onFocus={() => { if (results.length && !selected) setOpen(true); }}
            placeholder="Rechercher un demandeur par nom, email..."
            style={{
              width: '100%', padding: '10px 14px', border: '1px solid #e2e8f0',
              borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box'
            }}
          />
          {open && results.length > 0 && !selected && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0,
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 100, marginTop: 4,
              maxHeight: 250, overflow: 'auto'
            }}>
              {results.map((u: any) => (
                <div key={u.username} onClick={() => selectUser(u)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{u.displayName}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{u.email} · {u.username}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <button onClick={clearUser} title="Effacer"
            style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: 'pointer', fontSize: 12, color: '#ef4444', whiteSpace: 'nowrap' }}>
            ✕
          </button>
        )}
      </div>

      {selected && ticketData && (
        <div style={{ marginTop: 8 }}>
          <div
            onClick={() => setShowTicketList(!showTicketList)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 20,
              background: ticketData.count > 0 ? '#fef2f2' : '#f0fdf4',
              color: ticketData.count > 0 ? '#dc2626' : '#16a34a',
              fontSize: 13, fontWeight: 600, cursor: ticketData.count > 0 ? 'pointer' : 'default'
            }}>
            <span style={{ fontSize: 16 }}>{ticketData.count > 0 ? '🔴' : '🟢'}</span>
            {ticketData.count} ticket(s) ouvert(s)
            {ticketData.count > 0 && <span style={{ fontSize: 10 }}>{showTicketList ? '▲' : '▼'}</span>}
          </div>

          {showTicketList && ticketData.tickets.length > 0 && (
            <div style={{ marginTop: 8, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: '#f8fafc', padding: '8px 12px', fontSize: 12, fontWeight: 600, color: '#475569', borderBottom: '1px solid #e2e8f0' }}>
                Tickets ouverts de {selected.name}
              </div>
              {ticketData.tickets.map((t: any) => (
                <div key={t.id}
                  onClick={() => window.location.href = `/tickets/${t.id}`}
                  style={{
                    padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9',
                    fontSize: 13, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    transition: 'background 0.1s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#6366f1', fontSize: 12 }}>#{t.id}</span>
                    <span style={{ color: '#1e293b' }}>{t.title}</span>
                  </div>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10,
                    background: t.status?.id === 3 ? '#fef3c7' : '#eff6ff',
                    color: t.status?.id === 3 ? '#d97706' : '#3b82f6'
                  }}>
                    {t.status_label || `Statut ${t.status?.id}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
