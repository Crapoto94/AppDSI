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

// Normalise l'état d'une facture en libellé + couleur
const etatBadge = (raw: string): { label: string; bg: string; color: string } => {
  const e = String(raw || '').trim();
  if (/mandat/i.test(e)) return { label: 'Mandatée', bg: '#dcfce7', color: '#166534' };
  if (/pay/i.test(e)) return { label: 'Payée', bg: '#dbeafe', color: '#1e40af' };
  if (!e || e === 'XXXXX') return { label: 'À traiter', bg: '#fef9c3', color: '#854d0e' };
  return { label: e, bg: '#f1f5f9', color: '#475569' };
};

export default function BudgetRecentInvoicesWidget() {
  const { token } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`/api/budget/invoices?fiscalYear=${FY}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const arr: any[] = Array.isArray(r.data) ? r.data : [];
        arr.sort((a, b) => String(b['Arrivée'] || b.FACTURE_DATENTREE || '').localeCompare(String(a['Arrivée'] || a.FACTURE_DATENTREE || '')));
        setRows(arr.slice(0, 10));
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <WidgetWrapper title={`10 dernières factures · ${FY}`} loading={loading} error={error}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, height: '100%', overflowY: 'auto' }}>
        {rows.length === 0 && <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', padding: 12 }}>Aucune facture</div>}
        {rows.map((inv, i) => {
          const b = etatBadge(inv['Etat'] ?? inv.FACETAT_LIBELLE);
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: '#f8fafc', borderRadius: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{inv['Libellé'] || inv['Fournisseur'] || inv['N° Facture interne'] || '—'}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{fdate(inv['Arrivée'] || inv.FACTURE_DATENTREE)}{inv['Fournisseur'] ? ` · ${inv['Fournisseur']}` : ''}</div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', whiteSpace: 'nowrap' }}>{eur(parseNum(inv['Montant TTC'] ?? inv.FACTURE_MONTANTTC_E))}</div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: b.bg, color: b.color, whiteSpace: 'nowrap' }}>{b.label}</span>
            </div>
          );
        })}
      </div>
    </WidgetWrapper>
  );
}
