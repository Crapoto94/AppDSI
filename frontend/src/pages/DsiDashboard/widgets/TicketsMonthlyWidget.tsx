import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { useDashboardFilter, filterToQueryString } from '../DashboardFilterContext';
import { AreaChart, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

const STATUS_COLORS: Record<string, string> = {
  Nouveau: '#3b82f6', Affecté: '#8b5cf6', 'En cours': '#f59e0b',
  'En attente': '#94a3b8', Résolu: '#22c55e', Fermé: '#64748b',
};

export default function TicketsMonthlyWidget() {
  const { token } = useAuth();
  const filter = useDashboardFilter();
  const [data, setData] = useState<any[]>([]);
  const [keys, setKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    axios.get(`/api/tickets/stats${filterToQueryString(filter)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const monthly = r.data?.statusTrend || [];
        setData(monthly);
        if (monthly.length > 0) {
          setKeys(Object.keys(monthly[0]).filter(k => !['month', 'label'].includes(k)));
        }
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token, filter]);

  return (
    <WidgetWrapper title="Statuts sur 12 mois" loading={loading} error={error}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {keys.map((k, i) => (
            <Area key={k} type="monotone" dataKey={k} stackId="1"
              fill={STATUS_COLORS[k] || `hsl(${i * 50}, 60%, 60%)`}
              stroke={STATUS_COLORS[k] || `hsl(${i * 50}, 60%, 50%)`}
              fillOpacity={0.8} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </WidgetWrapper>
  );
}
