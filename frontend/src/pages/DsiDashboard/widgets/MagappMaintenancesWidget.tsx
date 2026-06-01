import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { Wrench } from 'lucide-react';

export default function MagappMaintenancesWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/admin/magapp/maintenances', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const all: any[] = Array.isArray(r.data) ? r.data : r.data?.maintenances || [];
        const now = new Date();
        const relevant = all
          .filter((m: any) => !m.end_date || new Date(m.end_date) >= now)
          .sort((a: any, b: any) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
          .slice(0, 6);
        setData(relevant);
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const severityColor = (s: string) => s === 'majeure' ? '#ef4444' : '#f59e0b';
  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) : '–';

  return (
    <WidgetWrapper title="Maintenances applicatifs" loading={loading} error={error}>
      {data.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#22c55e', padding: '16px 0' }}>
          <Wrench size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
          <div style={{ fontSize: 12 }}>Aucune maintenance prévue</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {data.map((m: any, i: number) => {
            const isOngoing = new Date(m.start_date) <= new Date() && (!m.end_date || new Date(m.end_date) >= new Date());
            return (
              <div key={i} style={{ padding: '6px 8px', borderRadius: 6, background: '#f8fafc', borderLeft: `3px solid ${severityColor(m.severity)}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{m.app_name || m.title}</span>
                  {isOngoing && <span style={{ fontSize: 10, background: '#fee2e2', color: '#dc2626', padding: '1px 5px', borderRadius: 8 }}>En cours</span>}
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  {fmtDate(m.start_date)} → {m.end_date ? fmtDate(m.end_date) : '?'}
                  {m.severity && <span style={{ marginLeft: 6, color: severityColor(m.severity) }}>• {m.severity}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </WidgetWrapper>
  );
}
