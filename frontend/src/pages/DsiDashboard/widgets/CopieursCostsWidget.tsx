import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { AreaChart, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function CopieursCostsWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/copieurs/kpi', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data?.yearlyData || r.data?.yearly_data || []))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <WidgetWrapper title="Évolution des coûts" loading={loading} error={error}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="year" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any) => `${Number(v).toLocaleString('fr-FR')} €`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Area type="monotone" dataKey="costNB" name="Coût NB" fill="#94a3b8" stroke="#64748b" stackId="1" fillOpacity={0.7} />
          <Area type="monotone" dataKey="costColor" name="Coût couleur" fill="#93c5fd" stroke="#3b82f6" stackId="1" fillOpacity={0.7} />
        </AreaChart>
      </ResponsiveContainer>
    </WidgetWrapper>
  );
}
