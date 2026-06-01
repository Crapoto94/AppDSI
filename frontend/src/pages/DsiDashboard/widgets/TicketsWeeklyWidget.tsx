import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function TicketsWeeklyWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/tickets/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data?.weeklyActivity || r.data?.weekly_activity || null))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  if (!data && !loading && !error) return <WidgetWrapper title="Activité hebdomadaire" loading={false} error="Données indisponibles"><></></WidgetWrapper>;

  const current = data?.current ?? 0;
  const previous = data?.previous ?? 0;
  const delta = previous > 0 ? Math.round(((current - previous) / previous) * 100) : 0;
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const color = delta > 0 ? '#ef4444' : delta < 0 ? '#22c55e' : '#64748b';

  return (
    <WidgetWrapper title="Activité hebdomadaire" loading={loading} error={error}>
      <div style={{ display: 'flex', gap: 8, height: '100%' }}>
        <div style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: '10px', textAlign: 'center', borderTop: '3px solid #3b82f6' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#1e293b' }}>{current}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Cette semaine</div>
        </div>
        <div style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: '10px', textAlign: 'center', borderTop: '3px solid #94a3b8' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#64748b' }}>{previous}</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Semaine passée</div>
        </div>
        <div style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: '10px', textAlign: 'center', borderTop: `3px solid ${color}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} color={color} />
          <div style={{ fontSize: 16, fontWeight: 700, color }}>{delta > 0 ? '+' : ''}{delta}%</div>
        </div>
      </div>
    </WidgetWrapper>
  );
}
