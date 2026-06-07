import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

const FY = new Date().getFullYear();

const fmt = (n: number) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €';

const parseNum = (v: any): number => {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.').replace(/[^\d.\-]/g, '')) : Number(v);
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
      axios.get(`/api/budget/orders?fiscalYear=${FY}`, { headers }).catch(() => ({ data: [] })),
      axios.get(`/api/budget/invoices?fiscalYear=${FY}`, { headers }).catch(() => ({ data: [] })),
      axios.get(`/api/budget/operations?fiscalYear=${FY}`, { headers }).catch(() => ({ data: [] })),
    ]).then(([orders, invoices, operations]) => {
      const ordersArr: any[] = Array.isArray(orders.data) ? orders.data : [];
      const invoicesArr: any[] = Array.isArray(invoices.data) ? invoices.data : [];
      const opsArr: any[] = Array.isArray(operations.data) ? operations.data : [];

      const totalCmd = ordersArr.reduce((s, o) => s + parseNum(o['COMMANDE_MONTANT_TTC'] ?? o['Montant TTC'] ?? o.montant_ttc), 0);
      const totalFact = invoicesArr.reduce((s, inv) => s + parseNum(inv['FACTURE_MONTANTTC_E'] ?? inv['Montant TTC'] ?? inv.montant_ttc), 0);
      const pendingInv = invoicesArr.filter((inv) => !/mandat|pay/i.test(String(inv['Etat'] ?? inv.FACETAT_LIBELLE ?? ''))).length;

      const prevu = opsArr.reduce((s, op) => s + parseNum(op['Montant prévu'] ?? op.montant_prevu), 0);
      const realise = opsArr.reduce((s, op) => s + parseNum(op.used_amount), 0);

      setData({
        totalCmd, totalFact, pendingInv,
        ordersCount: ordersArr.length, invoicesCount: invoicesArr.length,
        prevu, realise, opsCount: opsArr.length,
      });
    }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [token]);

  const kpis = data ? [
    { label: 'Commandes', value: fmt(data.totalCmd), sub: `${data.ordersCount} commande(s)`, color: '#8b5cf6' },
    { label: 'Facturé', value: fmt(data.totalFact), sub: `${data.invoicesCount} facture(s)`, color: '#f59e0b' },
    { label: 'Factures à traiter', value: data.pendingInv, sub: 'non mandatées', color: data.pendingInv > 0 ? '#ef4444' : '#22c55e' },
    { label: "Taux d'engagement", value: data.totalCmd > 0 ? `${Math.round((data.totalFact / data.totalCmd) * 100)}%` : '–', sub: 'facturé / commandé', color: '#3b82f6' },
    { label: 'Prévu opérations', value: fmt(data.prevu), sub: `${data.opsCount} opération(s)`, color: '#0ea5e9' },
    { label: 'Réalisé opérations', value: fmt(data.realise), sub: 'commandes affectées', color: '#6366f1' },
    { label: 'Taux de réalisation', value: data.prevu > 0 ? `${Math.round((data.realise / data.prevu) * 100)}%` : '–', sub: 'réalisé / prévu', color: '#14b8a6' },
    { label: 'Reste à engager', value: fmt(Math.max(data.prevu - data.realise, 0)), sub: 'prévu − réalisé', color: '#64748b' },
  ] : [];

  return (
    <WidgetWrapper title={`KPIs Budget · ${FY}`} loading={loading} error={error}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 8, height: '100%', alignContent: 'start' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 2, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>{k.sub}</div>
          </div>
        ))}
      </div>
    </WidgetWrapper>
  );
}
