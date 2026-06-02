import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts';

// Couleur par tranche d'âge : vert (neuf) → rouge (à renouveler)
const AGE_COLORS: Record<string, string> = {
  '< 1 an':  '#059669',
  '1–3 ans': '#10b981',
  '3–5 ans': '#f59e0b',
  '5–7 ans': '#f97316',
  '> 7 ans': '#dc2626',
  'Inconnu': '#94a3b8',
};

export default function ParcAgesWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    axios.get('/api/parc/hub/kpis', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const tranches: { label: string; count: number }[] = data?.ordinateurs?.age?.tranches || [];
  const total = tranches.reduce((s, t) => s + t.count, 0);

  return (
    <WidgetWrapper title="Pyramide des âges — Ordinateurs" loading={loading} error={error}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {data?.ordinateurs?.age?.moyen != null && (
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8, textAlign: 'center' }}>
            Âge moyen : <b style={{ color: '#1e293b' }}>{data.ordinateurs.age.moyen} ans</b>
            {' · '}À renouveler (≥ 5 ans) : <b style={{ color: '#dc2626' }}>{data.ordinateurs.age.aRenouveler}</b>
            {' '}({data.ordinateurs.age.tauxRenouveler}%)
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tranches} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="label" width={62} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: any) => [`${v} PC (${total ? Math.round(v / total * 100) : 0}%)`, 'Ordinateurs']}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="count" radius={[0, 5, 5, 0]} barSize={18} label={{ position: 'right', fontSize: 11, fill: '#64748b', formatter: (v: any) => v > 0 ? v : '' }}>
                {tranches.map((t) => (
                  <Cell key={t.label} fill={AGE_COLORS[t.label] || '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </WidgetWrapper>
  );
}
