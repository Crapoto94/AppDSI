import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

export default function MagappClicksWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/magapp/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const stats: any[] = Array.isArray(r.data) ? r.data : r.data?.stats || [];
        setData(stats.sort((a, b) => (b.total_clicks || b.clicks || 0) - (a.total_clicks || a.clicks || 0)).slice(0, 8));
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const max = Math.max(...data.map((d: any) => d.total_clicks || d.clicks || 0), 1);

  return (
    <WidgetWrapper title="Top applis — clics" loading={loading} error={error}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.map((app: any, i: number) => {
          const name = app.app_name || app.name || `App ${i+1}`;
          const clicks = app.total_clicks || app.clicks || 0;
          const today = app.today_clicks || app.today || 0;
          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: '#374151', fontWeight: 500 }}>{name}</span>
                <span style={{ color: '#64748b', fontSize: 11 }}>{clicks.toLocaleString('fr-FR')} clics {today > 0 && <span style={{ color: '#3b82f6' }}>· {today} auj.</span>}</span>
              </div>
              <div style={{ background: '#e2e8f0', borderRadius: 4, height: 5 }}>
                <div style={{ background: `hsl(${210 - i * 20}, 70%, 55%)`, borderRadius: 4, height: 5, width: `${(clicks / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </WidgetWrapper>
  );
}
