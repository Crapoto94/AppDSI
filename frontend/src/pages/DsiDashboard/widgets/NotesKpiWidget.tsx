import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

const parseNum = (v: any) => { const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v); return isNaN(n) ? 0 : n; };

export default function NotesKpiWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/notes/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const kpis = data ? [
    { label: 'Notes', value: parseNum(data.total), sub: `${parseNum(data.words)} mots`, color: '#3b82f6' },
    { label: 'Analysées IA', value: parseNum(data.analyzed), sub: `${parseNum(data.processing)} en cours`, color: '#16a34a' },
    { label: 'Carnets', value: parseNum(data.notebooks), sub: `${parseNum(data.sections)} sections`, color: '#7c3aed' },
    { label: 'Tags', value: parseNum(data.tags), sub: `${parseNum(data.failed)} erreur(s)`, color: '#b45309' },
  ] : [];

  return (
    <WidgetWrapper title="Mes Notes — indicateurs" loading={loading} error={error}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, alignContent: 'start', height: '100%' }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: '#f8fafc', borderRadius: 8, padding: '8px 10px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#374151', marginTop: 2, fontWeight: 700 }}>{k.label}</div>
            <div style={{ fontSize: 10, color: '#94a3b8' }}>{k.sub}</div>
          </div>
        ))}
      </div>
    </WidgetWrapper>
  );
}
