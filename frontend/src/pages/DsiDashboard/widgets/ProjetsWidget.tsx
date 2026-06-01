import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

export default function ProjetsWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/projets/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const stats = r.data?.byStatus || r.data?.by_status || r.data?.statusCounts || {};
        setData(stats);
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const STATUS_COLORS: Record<string, string> = {
    'En cours': '#3b82f6', 'Planifié': '#8b5cf6', 'En pause': '#f59e0b',
    'Terminé': '#22c55e', 'Annulé': '#ef4444', 'Archivé': '#94a3b8',
  };

  const entries = Object.entries(data).filter(([, v]) => v > 0);

  return (
    <WidgetWrapper title="Projets par statut" loading={loading} error={error}>
      {entries.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '16px', fontSize: 12 }}>Aucun projet</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignContent: 'flex-start' }}>
          {entries.map(([status, count]) => {
            const color = STATUS_COLORS[status] || '#64748b';
            return (
              <div key={status} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                background: '#f8fafc', borderRadius: 20, border: `1px solid ${color}20`,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: '#374151' }}>{status}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color }}>{count}</span>
              </div>
            );
          })}
        </div>
      )}
    </WidgetWrapper>
  );
}
