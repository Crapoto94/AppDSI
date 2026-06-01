import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { useDashboardFilter, filterToQueryString } from '../DashboardFilterContext';

export default function TicketsTechWidget() {
  const { token } = useAuth();
  const filter = useDashboardFilter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get(`/api/tickets/stats${filterToQueryString(filter)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data?.technicianAssignments || []))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token, filter]);

  const max = Math.max(...data.map((d: any) => d.count || d.open || 0), 1);

  return (
    <WidgetWrapper title="Charge par technicien" loading={loading} error={error}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data.slice(0, 8).map((t: any, i: number) => {
          const name = t.name || t.technician || `Tech ${i+1}`;
          const count = t.count || t.open || 0;
          return (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                <span style={{ color: '#374151' }}>{name}</span>
                <span style={{ fontWeight: 600, color: '#1e293b' }}>{count}</span>
              </div>
              <div style={{ background: '#e2e8f0', borderRadius: 4, height: 6 }}>
                <div style={{ background: '#3b82f6', borderRadius: 4, height: 6, width: `${(count / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </WidgetWrapper>
  );
}




