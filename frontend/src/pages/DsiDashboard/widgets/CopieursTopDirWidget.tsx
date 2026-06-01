import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function CopieursTopDirWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/copieurs/kpi', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData((r.data?.topDirections || r.data?.top_directions || []).slice(0, 8)))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <WidgetWrapper title="Top directions — copies" loading={loading} error={error}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 4 }}>
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={{ fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="nb" name="NB" fill="#1e293b" stackId="a" />
          <Bar dataKey="color" name="Couleur" fill="#3b82f6" stackId="a" />
        </BarChart>
      </ResponsiveContainer>
    </WidgetWrapper>
  );
}
