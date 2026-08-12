import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer } from 'recharts';

const PALETTE: Record<string, string> = { 'Windows 11': '#2563eb', 'Windows 10': '#0891b2' };
const FALLBACK = ['#7c3aed', '#d97706', '#059669', '#dc2626', '#64748b'];
const colorFor = (family: string, i: number) => PALETTE[family] || FALLBACK[i % FALLBACK.length];

export default function ParcOsFamilyWidget() {
  const { token } = useAuth();
  const [families, setFamilies] = useState<{ family: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/parc/ad/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setFamilies(Array.isArray(r.data.by_os_family) ? r.data.by_os_family : []))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const total = families.reduce((s, f) => s + f.total, 0);

  return (
    <WidgetWrapper title="Parc — Répartition par OS" loading={loading} error={error}>
      {families.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 12 }}>
          Aucune donnée AD synchronisée
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={families} layout="vertical" margin={{ left: 8, right: 32, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="family" width={92} tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(v: any) => [`${v} PC (${total ? Math.round(v / total * 100) : 0}%)`, 'Ordinateurs']}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Bar dataKey="total" radius={[0, 5, 5, 0]} barSize={18} label={{ position: 'right', fontSize: 11, fill: '#64748b' }}>
              {families.map((f, i) => (
                <Cell key={f.family} fill={colorFor(f.family, i)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </WidgetWrapper>
  );
}
