import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

export default function ParcKpiWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    axios.get('/api/parc/hub/kpis', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const o = data?.ordinateurs;
  const kpis = data ? [
    { label: 'Total équipements', value: data.totalAll, color: '#2563eb' },
    { label: 'Ordinateurs',       value: o?.total ?? '–', color: '#7c3aed' },
    { label: 'Affectés',          value: o ? `${o.affectes} (${o.tauxAffectation}%)` : '–', color: '#059669' },
    { label: 'À renouveler',      value: o ? `${o.age?.aRenouveler} (${o.age?.tauxRenouveler}%)` : '–', color: '#dc2626' },
    { label: 'Mise en service connue', value: o ? `${o.miseEnService?.connue} (${o.miseEnService?.tauxConnue}%)` : '–', color: '#0891b2' },
    { label: 'Âge moyen PC',      value: o?.age?.moyen != null ? `${o.age.moyen} ans` : '–', color: '#d97706' },
  ] : [];

  return (
    <WidgetWrapper title="Parc informatique — KPIs" loading={loading} error={error}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, height: '100%' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>
    </WidgetWrapper>
  );
}
