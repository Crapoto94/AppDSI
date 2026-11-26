import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';

interface DepartedAgent {
  matricule?: string | null;
  nom?: string | null;
  prenom?: string | null;
  date_depart?: string | null;
  date_depart_fr?: string | null;
  direction?: string | null;
  service?: string | null;
  fonction?: string | null;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Agents partis (Studio RH) sur les 30 derniers jours. */
export default function RhDepartsWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<{ count: number; agents: DepartedAgent[]; source?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const to = new Date();
    const since = new Date(Date.now() - 30 * 86400000);
    axios.get('/api/admin/rh/departs', {
      params: { since: iso(since), to: iso(to) },
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  const agents = Array.isArray(data?.agents) ? data!.agents : [];

  return (
    <WidgetWrapper title="Agents partis (30 j)" loading={loading} error={error}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6, minHeight: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 30, fontWeight: 800, color: data?.count ? '#b45309' : '#16a34a', lineHeight: 1 }}>
            {data?.count ?? '—'}
          </span>
          <span style={{ fontSize: 12, color: '#64748b' }}>départ{data?.count === 1 ? '' : 's'} sur 30 jours</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {agents.length === 0 && !loading && (
            <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', padding: 12 }}>Aucun départ sur la période.</div>
          )}
          {agents.slice(0, 8).map((a, i) => (
            <div key={`${a.matricule || i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', background: '#f8fafc', borderRadius: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {`${a.prenom || ''} ${a.nom || ''}`.trim() || a.matricule || '—'}
                </div>
                <div style={{ fontSize: 10, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[a.direction, a.service].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#b45309', whiteSpace: 'nowrap' }}>{a.date_depart_fr || a.date_depart || ''}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 9, color: '#cbd5e1', textAlign: 'right' }}>Source : {data?.source || 'Studio RH'}</div>
      </div>
    </WidgetWrapper>
  );
}
