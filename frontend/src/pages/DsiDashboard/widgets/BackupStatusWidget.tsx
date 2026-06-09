import { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { ShieldCheck, ShieldAlert, ShieldOff, Play, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface HealthSummary {
  enabled: boolean;
  frequency: string;
  lastRun: { at: string; ok: boolean; message: string; file: string | null } | null;
  ageDays: number | null;
  thresholdDays: number;
  healthy: boolean | null;
}

export default function BackupStatusWidget() {
  const { token, user } = useAuth();
  const [data, setData] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<{ ok: boolean; message: string } | null>(null);

  const isAdmin = user?.role === 'superadmin' || user?.role === 'admin';

  const fetchData = () => {
    axios.get('/api/backup/health-summary', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [token]);

  const runNow = async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await axios.post('/api/backup/auto/run-now', {}, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 600000, // 10 min
      });
      setRunResult({ ok: true, message: res.data.file ? `${res.data.file}` : 'Sauvegarde réussie' });
      fetchData();
    } catch (e: any) {
      setRunResult({ ok: false, message: e.response?.data?.error || e.message || 'Erreur inconnue' });
    } finally {
      setRunning(false);
    }
  };

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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, padding: 4 }}>
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

        {/* Résultat du dernier déclenchement manuel */}
        {runResult && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: 6, marginTop: 4,
            background: runResult.ok ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${runResult.ok ? '#bbf7d0' : '#fecaca'}`,
            borderRadius: 6, padding: '6px 10px', maxWidth: '100%',
          }}>
            {runResult.ok
              ? <CheckCircle size={14} color="#16a34a" style={{ flexShrink: 0, marginTop: 1 }} />
              : <XCircle size={14} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />}
            <span style={{ fontSize: 10, color: runResult.ok ? '#15803d' : '#dc2626', wordBreak: 'break-all', lineHeight: 1.4 }}>
              {runResult.message}
            </span>
          </div>
        )}

        {/* Bouton Lancer maintenant (admins uniquement) */}
        {isAdmin && (
          <button
            onClick={runNow}
            disabled={running}
            style={{
              marginTop: 4, display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 6, border: 'none', cursor: running ? 'not-allowed' : 'pointer',
              background: running ? '#e2e8f0' : '#1e293b', color: running ? '#94a3b8' : '#fff',
              fontSize: 11, fontWeight: 600, transition: 'background 0.15s',
            }}
          >
            {running
              ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Sauvegarde en cours…</>
              : <><Play size={13} /> Lancer maintenant</>
            }
          </button>
        )}
      </div>
    </WidgetWrapper>
  );
}
