import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { useDashboardFilter, filterToQueryString } from '../DashboardFilterContext';
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

export default function TicketsTrendWidget() {
  const { token } = useAuth();
  const filter = useDashboardFilter();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    axios.get(`/api/tickets/stats${filterToQueryString(filter)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data?.trend?.data || r.data?.incidentVsRequestTrend || []))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token, filter]);

  return (
    <WidgetWrapper title="Tendance tickets" loading={loading} error={error}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 4, right: 48, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          {/* Axe gauche : créés / résolus (volumes) */}
          <YAxis
            yAxisId="vol"
            orientation="left"
            tick={{ fontSize: 10 }}
            width={36}
            label={{ value: 'Tickets', angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 9, fill: '#94a3b8' } }}
          />
          {/* Axe droit : backlog cumulé */}
          <YAxis
            yAxisId="backlog"
            orientation="right"
            tick={{ fontSize: 10 }}
            width={44}
            label={{ value: 'Backlog', angle: 90, position: 'insideRight', offset: 10, style: { fontSize: 9, fill: '#94a3b8' } }}
          />
          <Tooltip
            contentStyle={{ fontSize: 12 }}
            formatter={(value: any, name: string | number | undefined) => [value, String(name ?? '')]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="vol" dataKey="created" name="Créés" fill="#3b82f6" opacity={0.8} />
          <Bar yAxisId="vol" dataKey="resolved" name="Résolus" fill="#22c55e" opacity={0.8} />
          <Line yAxisId="backlog" dataKey="open" name="Backlog" stroke="#f59e0b" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </WidgetWrapper>
  );
}
