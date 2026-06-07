import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { ShieldCheck, ShieldAlert, ShieldOff } from 'lucide-react';

interface HealthSummary {
  enabled: boolean;
  frequency: string;
  lastRun: { at: string; ok: boolean; message: string; file: string | null } | null;
  ageDays: number | null;
  thresholdDays: number;
  healthy: boolean | null;
}

export default function BackupStatusWidget() {
  const { token } = useAuth();
  const [data, setData] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    axios.get('/api/backup/health-summary', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token]);

  // Détermination de l'état visuel
  let color = '#94a3b8', Icon = ShieldOff, label = 'Désactivée';
  if (data) {
    if (!data.enabled) { color = '#94a3b8'; Icon = ShieldOff; label = 'Désactivée'; }
    else if (data.healthy) { color = '#16a34a'; Icon = ShieldCheck; label = 'À jour'; }
    else { color = '#dc2626'; Icon = ShieldAlert; label = 'En retard'; }
  }

  const lastDate = data?.lastRun?.at ? new Date(data.lastRun.at) : null;
  const fmtDate = (d: Date) => d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <WidgetWrapper title="Sauvegarde automatique" loading={loading} error={error}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 6, padding: 4 }}>
        <Icon size={28} color={color} />
        <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{label}</div>
        {data && data.enabled && (
          <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', lineHeight: 1.4 }}>
            {lastDate ? (
              <>
                Dernière : {fmtDate(lastDate)}
                {data.ageDays != null && <> &middot; il y a {data.ageDays} j</>}
                {data.lastRun && !data.lastRun.ok && <div style={{ color: '#dc2626' }}>Dernier essai en échec</div>}
              </>
            ) : (
              <span style={{ color: '#dc2626' }}>Aucune sauvegarde réussie</span>
            )}
            <div style={{ color: '#94a3b8', marginTop: 2 }}>Fréquence : {data.frequency} &middot; seuil {data.thresholdDays} j</div>
          </div>
        )}
        {data && !data.enabled && (
          <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>Sauvegarde automatique désactivée</div>
        )}
      </div>
    </WidgetWrapper>
  );
}
