import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function TicketsCategoriesWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/tickets/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => {
        const cats = r.data?.topCategories || r.data?.top_categories || [];
        setData(cats.slice(0, 10));
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <WidgetWrapper title="Top 10 catégories" loading={loading} error={error}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 4 }}>
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Bar dataKey="count" name="Tickets" fill="#3b82f6" radius={[0, 3, 3, 0]}>
            {data.map((_, i) => <Cell key={i} fill={`hsl(${210 + i * 8}, 70%, ${55 - i * 2}%)`} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </WidgetWrapper>
  );
}
