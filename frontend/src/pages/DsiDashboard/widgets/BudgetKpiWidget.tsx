import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

const fmt = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';

const parseNum = (v: any): number => {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return isNaN(n) ? 0 : n;
};

export default function BudgetKpiWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      axios.get('/api/budget/orders', { headers }).catch(() => ({ data: [] })),
      axios.get('/api/budget/invoices', { headers }).catch(() => ({ data: [] })),
    ]).then(([orders, invoices]) => {
      const ordersArr: any[] = Array.isArray(orders.data) ? orders.data : [];
      const invoicesArr: any[] = Array.isArray(invoices.data) ? invoices.data : [];

      // Orders use Oracle column names
      const totalCmd = ordersArr.reduce((s: number, o: any) =>
        s + parseNum(o['COMMANDE_MONTANT_TTC'] ?? o.montant_ttc ?? o.total), 0);

      // Invoices use Oracle column names
      const totalFact = invoicesArr.reduce((s: number, inv: any) =>
        s + parseNum(inv['FACTURE_MONTANTTC_E'] ?? inv['MONTANTTC_E'] ?? inv.montant_ttc ?? inv.amount), 0);

      const pendingInv = invoicesArr.filter((inv: any) => {
        const paid = inv['FACTURE_DATPAIEFF'];
        return !paid || paid === '' || paid === null;
      }).length;

      setData({ totalCmd, totalFact, pendingInv, ordersCount: ordersArr.length, invoicesCount: invoicesArr.length });
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [token]);

  const kpis = data ? [
    { label: 'Commandes', value: fmt(data.totalCmd), sub: `${data.ordersCount} commande(s)`, color: '#8b5cf6' },
    { label: 'Facturé', value: fmt(data.totalFact), sub: `${data.invoicesCount} facture(s)`, color: '#f59e0b' },
    { label: 'Factures non payées', value: data.pendingInv, sub: 'en attente de paiement', color: data.pendingInv > 0 ? '#ef4444' : '#22c55e' },
    { label: 'Taux d\'engagement', value: data.totalCmd > 0 ? `${Math.round((data.totalFact / data.totalCmd) * 100)}%` : '–', sub: 'facturé / commandé', color: '#3b82f6' },
  ] : [];

  return (
    <WidgetWrapper title="KPIs Budget" loading={loading} error={error}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, height: '100%' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 2, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{k.sub}</div>
          </div>
        ))}
      </div>
    </WidgetWrapper>
  );
}
