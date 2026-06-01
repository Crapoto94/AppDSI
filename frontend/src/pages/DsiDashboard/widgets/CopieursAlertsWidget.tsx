import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { AlertTriangle } from 'lucide-react';

export default function CopieursAlertsWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/copieurs/kpi', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data?.alerts || r.data?.noReleve || []))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <WidgetWrapper title="Alertes copieurs" loading={loading} error={error}>
      {data.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#22c55e', padding: '20px 0' }}>
          <div style={{ fontSize: 28 }}>✓</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Tous les relevés sont à jour</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.slice(0, 6).map((a: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#fef9c3', borderRadius: 6, borderLeft: '3px solid #f59e0b' }}>
              <AlertTriangle size={14} color="#d97706" />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>{a.serial || a.serialNumber || `Copieur ${i+1}`}</div>
                <div style={{ fontSize: 11, color: '#78350f' }}>{a.direction || ''} — {a.lastDate ? `Dernier relevé : ${a.lastDate}` : 'Aucun relevé'}</div>
              </div>
            </div>
          ))}
          {data.length > 6 && (
            <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', paddingTop: 4 }}>+{data.length - 6} autres</div>
          )}
        </div>
      )}
    </WidgetWrapper>
  );
}
