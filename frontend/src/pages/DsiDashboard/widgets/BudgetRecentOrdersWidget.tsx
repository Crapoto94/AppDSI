import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

const FY = new Date().getFullYear();

const parseNum = (v: any): number => {
  if (v == null) return 0;
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.').replace(/[^\d.\-]/g, '')) : Number(v);
  return isNaN(n) ? 0 : n;
};
const eur = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fdate = (d?: string) => { if (!d) return ''; const x = new Date(d); return isNaN(x.getTime()) ? String(d) : x.toLocaleDateString('fr-FR'); };

export default function BudgetRecentOrdersWidget() {
  const { token } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`/api/budget/orders?fiscalYear=${FY}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const arr: any[] = Array.isArray(r.data) ? r.data : [];
        const dt = (o: any) => String(o['Date de la commande'] || o.COMMANDE_CMD_DATECOMMANDE || o.date || '');
        arr.sort((a, b) => new Date(dt(b)).getTime() - new Date(dt(a)).getTime());
        setRows(arr.slice(0, 10));
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <WidgetWrapper title={`10 dernières commandes · ${FY}`} loading={loading} error={error}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%', overflowY: 'auto' }}>
        {rows.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 12 }}>Aucune commande</div>}
        {rows.map((o, i) => {
          const affectee = !!o.operation_id || !!o.operation_label;
          const badge = affectee
            ? { label: o.operation_label ? `→ ${o.operation_label}` : 'Affectée', bg: '#dcfce7', color: '#166534' }
            : { label: 'Non affectée', bg: '#fef9c3', color: '#854d0e' };
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: '#f8fafc', borderRadius: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o['Libellé'] || o.COMMANDE_LIBELLE || o['N° Commande'] || '—'}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{fdate(o['Date de la commande'] || o.COMMANDE_CMD_DATECOMMANDE)}{o['Service émetteur'] ? ` · ${o['Service émetteur']}` : ''}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>{eur(parseNum(o['Montant TTC'] ?? o.COMMANDE_MONTANT_TTC ?? o._total_ttc))}</div>
              <span title={badge.label} style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: badge.bg, color: badge.color, whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{badge.label}</span>
            </div>
          );
        })}
      </div>
    </WidgetWrapper>
  );
}
