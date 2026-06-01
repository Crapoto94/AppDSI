import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const SLA_COLORS: Record<string, string> = { ok: '#22c55e', violated: '#ef4444', warning: '#f59e0b' };

export default function TicketsSlaWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/tickets/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const sla = r.data?.slaStatus || r.data?.sla_status || {};
        setData([
          { name: 'OK', value: sla.ok || 0, color: SLA_COLORS.ok },
          { name: 'Violé', value: sla.violated || sla.breached || 0, color: SLA_COLORS.violated },
          { name: 'Avertissement', value: sla.warning || 0, color: SLA_COLORS.warning },
        ].filter(d => d.value > 0));
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

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
