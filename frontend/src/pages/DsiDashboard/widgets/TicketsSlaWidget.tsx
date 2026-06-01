import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { useDashboardFilter, filterToQueryString } from '../DashboardFilterContext';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function TicketsSlaWidget() {
  const { token } = useAuth();
  const filter = useDashboardFilter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    axios.get(`/api/tickets/stats${filterToQueryString(filter)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const slaArr: any[] = r.data?.slaOverview || [];
        const COLOR_MAP: Record<string, string> = { 'OK': '#22c55e', 'Violé': '#ef4444', 'Avertissement': '#f59e0b' };
        setData(slaArr.filter(d => d.value > 0).map(d => ({ ...d, color: COLOR_MAP[d.name] || '#94a3b8' })));
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token, filter]);

  return (
    <WidgetWrapper title="Statut SLA" loading={loading} error={error}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius="65%" paddingAngle={2}>
            {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          </Pie>
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
      </ResponsiveContainer>
    </WidgetWrapper>
  );
}
