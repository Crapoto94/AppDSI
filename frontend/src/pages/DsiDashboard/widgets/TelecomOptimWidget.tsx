import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

export default function TelecomOptimWidget() {
  const { token } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [rec, setRec] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = { headers: { Authorization: `Bearer ${token}` } };
    Promise.all([
      axios.get('/api/telecom/billing/stats', h),
      axios.get('/api/telecom/billing/reconciliation', h),
    ])
      .then(([s, r]) => { setStats(s.data); setRec(r.data); })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const savings = (stats?.dormantCost || 0) + (rec?.resilieesFactureesCost || 0);
  const eur = (v: number) => `${(v ?? 0).toLocaleString('fr-FR')} €`;

  return (
    <WidgetWrapper title="Télécom — Économies potentielles" loading={loading} error={error}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8 }}>
        <div style={{ background: '#ecfdf5', borderRadius: 8, padding: '10px 12px', borderLeft: '4px solid #059669' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#059669' }}>{eur(savings)}<span style={{ fontSize: 12, color: '#047857' }}> / mois</span></div>
          <div style={{ fontSize: 11, color: '#047857' }}>≈ {eur(Math.round(savings * 12))} / an</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: '6px 10px', borderTop: '3px solid #ef4444' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ef4444' }}>{stats?.dormant ?? 0}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Mobiles dormantes</div>
          </div>
          <div style={{ flex: 1, background: '#f8fafc', borderRadius: 8, padding: '6px 10px', borderTop: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b' }}>{rec?.resilieesFacturees?.length ?? 0}</div>
            <div style={{ fontSize: 10, color: '#64748b' }}>Résiliées facturées</div>
          </div>
        </div>
      </div>
    </WidgetWrapper>
  );
}
