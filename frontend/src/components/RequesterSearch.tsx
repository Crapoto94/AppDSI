import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AgentSearch from './AgentSearch';

interface Props {
  value: string;
  onChange: (email: string, name: string) => void;
  initialEmail?: string;
  initialName?: string;
}

export default function RequesterSearch({ value, onChange, initialEmail, initialName }: Props) {
  const [selected, setSelected] = useState<{ name: string; email: string } | null>(
    initialEmail && initialName ? { name: initialName, email: initialEmail } : null
  );
  const [ticketData, setTicketData] = useState<{ count: number; tickets: any[] } | null>(null);
  const [showTicketList, setShowTicketList] = useState(false);

  useEffect(() => {
    if (selected && selected.email) {
      loadTickets(selected.email);
    }
  }, [selected?.email]);

  async function loadTickets(email: string) {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`/api/tickets/requester/${encodeURIComponent(email)}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTicketData(res.data);
    } catch (e) { console.error(e); }
  }

  return (
    <div style={{ position: 'relative' }}>
      <AgentSearch
        initialName={initialName}
        initialEmail={initialEmail}
        placeholder="Rechercher un demandeur par nom, email..."
        onSelect={(u) => { setSelected({ name: u.displayName, email: u.email }); onChange(u.email, u.displayName); }}
        onClear={() => { setSelected(null); setTicketData(null); onChange('', ''); }}
      />

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
