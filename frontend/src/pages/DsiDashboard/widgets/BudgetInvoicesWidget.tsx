import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

export default function BudgetInvoicesWidget() {
  const { token } = useAuth();
  const [buckets, setBuckets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/budget/invoices', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const invoices: any[] = Array.isArray(r.data) ? r.data : r.data?.invoices || [];
        const pending = invoices.filter((i: any) => i.status !== 'payée' && !i.validated);
        const now = Date.now();
        const counts = { '+30j': 0, '+20j': 0, '+10j': 0, 'Récentes': 0 };
        for (const inv of pending) {
          const arrivee = new Date(inv.date_arrivee || inv.created_at).getTime();
          const days = Math.floor((now - arrivee) / 86400000);
          if (days >= 30) counts['+30j']++;
          else if (days >= 20) counts['+20j']++;
          else if (days >= 10) counts['+10j']++;
          else counts['Récentes']++;
        }
        setBuckets(Object.entries(counts).map(([label, count]) => ({ label, count })));
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const colors: Record<string, string> = { '+30j': '#ef4444', '+20j': '#f97316', '+10j': '#f59e0b', 'Récentes': '#22c55e' };
  const total = buckets.reduce((s, b) => s + b.count, 0);

  return (
    <WidgetWrapper title="Factures à traiter" loading={loading} error={error}>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 28, fontWeight: 700, color: total > 0 ? '#ef4444' : '#22c55e' }}>{total}</span>
        <span style={{ fontSize: 12, color: '#64748b', marginLeft: 6 }}>en attente</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {buckets.map(b => (
          <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', background: b.count > 0 ? '#fef9c3' : '#f8fafc', borderRadius: 6, borderLeft: `3px solid ${colors[b.label]}` }}>
            <span style={{ fontSize: 12, color: '#374151' }}>{b.label}</span>
            <span style={{ fontWeight: 700, color: colors[b.label] }}>{b.count}</span>
          </div>
        ))}
      </div>
    </WidgetWrapper>
  );
}
