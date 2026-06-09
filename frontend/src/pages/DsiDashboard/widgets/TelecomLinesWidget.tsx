import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

export default function TelecomLinesWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/telecom/lines/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const kpis = data ? [
    { label: 'Lignes totales', value: data.total ?? 0, color: '#0078a4' },
    { label: 'Téléphonie fixe', value: data.fixe ?? 0, color: '#059669' },
    { label: 'Accès internet', value: data.internet ?? 0, color: '#d97706' },
    { label: 'À migrer (cuivre)', value: data.toMigrate ?? 0, color: '#7c3aed' },
    { label: 'Résiliations', value: data.resiliation ?? 0, color: '#ef4444' },
  ] : [];

  return (
    <WidgetWrapper title="Télécom — Lignes & Internet" loading={loading} error={error}>
      <div style={{ display: 'flex', gap: 6, height: '100%', flexWrap: 'wrap' }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            flex: '1 1 80px', background: '#f8fafc', borderRadius: 8, padding: '8px 10px',
            borderTop: `3px solid ${k.color}`, minWidth: 60,
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: k.color }}>{k.value}</div>
            <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>
    </WidgetWrapper>
  );
}
