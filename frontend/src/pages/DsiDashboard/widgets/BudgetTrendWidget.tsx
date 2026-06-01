import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function BudgetTrendWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/budget/lines', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data?.weeklyTrend || r.data?.weekly_trend || r.data?.trend || []))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <WidgetWrapper title="Dépenses cumulées" loading={loading} error={error}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="week" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: any) => `${Number(v).toLocaleString('fr-FR')} €`} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="fonctionnement" name="Fonctionnement" stroke="#3b82f6" strokeWidth={2} dot={false} />
          <Line dataKey="investissement" name="Investissement" stroke="#8b5cf6" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </WidgetWrapper>
  );
}
