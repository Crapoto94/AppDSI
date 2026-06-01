import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

export default function CopieursKpiWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/copieurs/kpi', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const kpis = data ? [
    { label: 'Copies NB', value: (data.totalNB ?? 0).toLocaleString('fr-FR'), color: '#1e293b' },
    { label: 'Copies couleur', value: (data.totalColor ?? 0).toLocaleString('fr-FR'), color: '#3b82f6' },
    { label: 'Ratio NB', value: `${data.ratioNB ?? '–'}%`, color: '#8b5cf6' },
    { label: 'Coût total', value: `${(data.totalCost ?? 0).toLocaleString('fr-FR')} €`, color: '#f59e0b' },
    { label: 'Copieurs actifs', value: data.activeCount ?? '–', color: '#22c55e' },
  ] : [];

  return (
    <WidgetWrapper title="KPIs Copieurs" loading={loading} error={error}>
      <div style={{ display: 'flex', gap: 6, height: '100%', flexWrap: 'wrap' }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            flex: '1 1 80px', background: '#f8fafc', borderRadius: 8, padding: '8px 10px',
            borderTop: `3px solid ${k.color}`, minWidth: 60,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>
    </WidgetWrapper>
  );
}
