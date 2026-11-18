import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

export default function EntretiensStatutsWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/entretiens/stats', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const slices: Array<{ key: string; label: string; color: string; value: number }> =
    Array.isArray(data?.par_statut) ? data.par_statut : [];
  const total = slices.reduce((acc, s) => acc + Number(s.value || 0), 0);

  return (
    <WidgetWrapper title="Entretiens professionnels — statuts" loading={loading} error={error}>
      {total === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: 12, color: '#94a3b8' }}>
          Aucun entretien enregistré pour la campagne en cours
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100%', gap: 10 }}>
          <div style={{ display: 'flex', height: 14, borderRadius: 999, overflow: 'hidden', background: '#f1f5f9' }}>
            {slices.filter(s => s.value > 0).map(s => (
              <div key={s.key} title={`${s.label} : ${s.value}`} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '4px 12px' }}>
            {slices.map(s => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5 }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: '#475569' }}>{s.label}</span>
                <strong style={{ color: '#334155' }}>{s.value}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </WidgetWrapper>
  );
}
