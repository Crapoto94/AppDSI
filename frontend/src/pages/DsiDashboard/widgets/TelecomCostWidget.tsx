import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

export default function TelecomCostWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/telecom/billing/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const eur = (v: number) => `${(v ?? 0).toLocaleString('fr-FR')} €`;
  const kpis = data ? [
    { label: 'Coût / mois', value: eur(data.totalHT), color: '#0078a4' },
    { label: 'Estimation / an', value: eur(data.annualEstimate), color: '#1e293b' },
    { label: 'Dont mobile', value: eur(data.totalMobile), color: '#3b82f6' },
    { label: 'Lignes mobiles', value: data.mobileLines ?? 0, color: '#7c3aed' },
    { label: 'Lignes dormantes', value: data.dormant ?? 0, color: '#ef4444' },
  ] : [];

  return (
    <WidgetWrapper title="Télécom — Coûts & Mobile" loading={loading} error={error}>
      <div style={{ display: 'flex', gap: 6, height: '100%', flexWrap: 'wrap' }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            flex: '1 1 80px', background: '#f8fafc', borderRadius: 8, padding: '8px 10px',
            borderTop: `3px solid ${k.color}`, minWidth: 60,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>
    </WidgetWrapper>
  );
}
