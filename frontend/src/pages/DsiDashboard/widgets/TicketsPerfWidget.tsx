import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

export default function TicketsPerfWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/tickets/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data?.technicianPerf || r.data?.technician_perf || r.data?.techPerformance || []))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <WidgetWrapper title="Performance techniciens" loading={loading} error={error}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {['Technicien','Total','Résolus','Délai moy.','Taux'].map(h => (
              <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 8).map((t: any, i: number) => (
            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
              <td style={{ padding: '5px 8px', color: '#1e293b', fontWeight: 500 }}>{t.name || t.technician}</td>
              <td style={{ padding: '5px 8px', color: '#374151' }}>{t.total ?? t.count ?? '–'}</td>
              <td style={{ padding: '5px 8px', color: '#22c55e', fontWeight: 600 }}>{t.resolved ?? '–'}</td>
              <td style={{ padding: '5px 8px', color: '#64748b' }}>{t.avgTime ?? t.avg_time ? `${t.avgTime ?? t.avg_time}h` : '–'}</td>
              <td style={{ padding: '5px 8px' }}>
                <span style={{
                  background: (t.rate ?? t.resolution_rate ?? 0) >= 80 ? '#dcfce7' : '#fef9c3',
                  color: (t.rate ?? t.resolution_rate ?? 0) >= 80 ? '#15803d' : '#92400e',
                  padding: '1px 6px', borderRadius: 10, fontSize: 11, fontWeight: 600
                }}>
                  {t.rate ?? t.resolution_rate ?? '–'}{typeof (t.rate ?? t.resolution_rate) === 'number' ? '%' : ''}
                </span>
              </td>
            </tr>
          ))}
          {data.length === 0 && (
            <tr><td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>Aucune donnée</td></tr>
          )}
        </tbody>
      </table>
    </WidgetWrapper>
  );
}
