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

export default function BudgetDgpWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`/api/finance/dgp/stats?fiscal_year=${FY}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data || null))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const dgp = data?.dgp_moyen != null ? parseNum(data.dgp_moyen) : null;
  const dgpColor = dgp == null ? '#64748b' : dgp > 30 ? '#dc2626' : '#16a34a';
  const horsDelai = parseNum(data?.nb_hors_delai);
  const provHorsDelai = parseNum(data?.nb_prov_hors_delai);
  const taux = data?.taux_dans_delai != null ? parseNum(data.taux_dans_delai) : null;

  const kpis = data ? [
    { label: 'DGP moyen', value: dgp == null ? '—' : `${dgp} j`, sub: `factures payées · ${FY}`, color: dgpColor },
    { label: 'Payées hors délai', value: `${horsDelai}`, sub: '> 30 jours', color: horsDelai > 0 ? '#dc2626' : '#16a34a' },
    { label: 'Non payées > 30j', value: `${provHorsDelai}`, sub: 'délai provisoire', color: provHorsDelai > 0 ? '#d97706' : '#16a34a' },
    { label: 'Payées dans les délais', value: taux == null ? '—' : `${taux}%`, sub: `sur ${parseNum(data.nb_payees)} payées`, color: taux != null && taux >= 90 ? '#16a34a' : '#d97706' },
  ] : [];

  return (
    <WidgetWrapper title={`DGP factures · ${FY}`} loading={loading} error={error}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, alignContent: 'start', height: '100%' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 2, fontWeight: 600 }}>{k.label}</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{k.sub}</div>
          </div>
        ))}
        {data && (
          <div style={{ gridColumn: '1 / -1', fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
            {parseNum(data.nb_factures)} facture(s) reçue(s) en {FY} · {parseNum(data.nb_non_payees)} non payée(s)
          </div>
        )}
      </div>
    </WidgetWrapper>
  );
}
