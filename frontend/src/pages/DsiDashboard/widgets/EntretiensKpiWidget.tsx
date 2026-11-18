import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export default function EntretiensKpiWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/entretiens/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const s = data?.stats || {};
  const campaign = data?.campaign;
  const kpis = data ? [
    { label: 'Entretiens', value: num(s.total), sub: campaign ? `Campagne ${campaign.annee}` : '', color: '#0078a4' },
    { label: 'Planifiés', value: num(s.planifies), sub: `${num(s.a_planifier)} à planifier`, color: '#2563eb' },
    { label: 'Préparations', value: num(s.preparations_recues), sub: 'Transmises par les agents', color: '#0891b2' },
    { label: 'Réalisés', value: num(s.realises), sub: `${num(s.taux_realisation)}% de réalisation`, color: '#16a34a' },
    { label: 'À venir 7 j', value: num(s.a_venir_7j), sub: 'Échéances proches', color: '#7c3aed' },
    { label: 'En retard', value: num(s.en_retard), sub: 'Date dépassée', color: num(s.en_retard) ? '#b91c1c' : '#94a3b8' },
  ] : [];

  return (
    <WidgetWrapper title="Entretiens professionnels — indicateurs" loading={loading} error={error}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, alignContent: 'start', height: '100%' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 2, fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{k.sub}</div>
          </div>
        ))}
      </div>
    </WidgetWrapper>
  );
}
