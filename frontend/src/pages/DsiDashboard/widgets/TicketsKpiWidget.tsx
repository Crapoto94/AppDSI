import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { useDashboardFilter, filterToQueryString } from '../DashboardFilterContext';

export default function TicketsKpiWidget() {
  const { token } = useAuth();
  const filter = useDashboardFilter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    axios.get(`/api/tickets/stats${filterToQueryString(filter)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const kpis = data ? [
    { label: 'Ouverts', value: data.overview?.open ?? '–', color: '#3b82f6' },
    { label: 'Critiques', value: data.overview?.critical_open ?? '–', color: '#ef4444' },
    { label: 'Résolus/j', value: data.resolvedAvgPerDay ?? '–', color: '#22c55e' },
    { label: 'SLA violés', value: data.overview?.sla_breached ?? '–', color: '#f59e0b' },
  ] : [];

  return (
    <WidgetWrapper title="KPIs Tickets" loading={loading} error={error}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, height: '100%' }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            background: '#f8fafc', borderRadius: 8, padding: '10px 12px',
            borderLeft: `3px solid ${k.color}`,
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>
    </WidgetWrapper>
  );
}
