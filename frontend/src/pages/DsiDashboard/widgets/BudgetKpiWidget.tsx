import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

export default function BudgetKpiWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      axios.get('/api/budget/lines', { headers }).catch(() => ({ data: [] })),
      axios.get('/api/budget/orders', { headers }).catch(() => ({ data: [] })),
      axios.get('/api/budget/invoices', { headers }).catch(() => ({ data: [] })),
    ]).then(([lines, orders, invoices]) => {
      const linesArr: any[] = Array.isArray(lines.data) ? lines.data : lines.data?.lines || [];
      const ordersArr: any[] = Array.isArray(orders.data) ? orders.data : orders.data?.orders || [];
      const invoicesArr: any[] = Array.isArray(invoices.data) ? invoices.data : invoices.data?.invoices || [];

      const totalAlloc = linesArr.reduce((s: number, l: any) => s + (parseFloat(l.montant_alloue || l.allocated || 0)), 0);
      const totalCmd = ordersArr.reduce((s: number, o: any) => s + (parseFloat(o.montant_ttc || o.total || 0)), 0);
      const totalFact = invoicesArr.reduce((s: number, i: any) => s + (parseFloat(i.montant_ttc || i.amount || 0)), 0);
      const pendingInv = invoicesArr.filter((i: any) => !i.validated && i.status !== 'payée').length;

      setData({ totalAlloc, totalCmd, totalFact, pendingInv });
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [token]);

  const fmt = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';

  const kpis = data ? [
    { label: 'Alloué', value: fmt(data.totalAlloc), color: '#3b82f6' },
    { label: 'Commandé', value: fmt(data.totalCmd), color: '#8b5cf6' },
    { label: 'Facturé', value: fmt(data.totalFact), color: '#f59e0b' },
    { label: 'Factures en attente', value: data.pendingInv, color: data.pendingInv > 0 ? '#ef4444' : '#22c55e' },
  ] : [];

  return (
    <WidgetWrapper title="KPIs Budget" loading={loading} error={error}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, height: '100%' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>
    </WidgetWrapper>
  );
}
