import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, ShieldCheck, ShieldAlert, Globe, Monitor, KeyRound } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import AgentPresenceBadge from '../../../components/AgentPresenceBadge';
import WidgetWrapper from './WidgetWrapper';
import { WINDOW_OPTIONS, DEFAULT_WINDOW_MINUTES, windowLabel } from './analyseMailWindows';

/**
 * Widget « dernières connexions en erreur » alimenté par l'application Analyse-mail
 * (relais serveur /api/analyse-mail/signins/failed — la clé d'API reste côté serveur).
 * Liste les échecs de connexion les plus récents du tenant avec le maximum de détail :
 * utilisateur (nom + UPN), IP et localisation, application, code et motif d'échec,
 * résultat MFA, réputation de l'IP et score de confiance.
 */

interface IpReputation {
  level?: string | null;
  level_label?: string | null;
  isp?: string | null;
  org?: string | null;
  usage_type?: string | null;
  is_vpn?: boolean;
  is_datacenter?: boolean;
  is_trusted?: boolean;
  abuse_score?: number | null;
  country?: string | null;
  city?: string | null;
}

interface FailedSignin {
  date_utc: string;
  user_upn: string;
  user_display_name: string;
  ip_address: string;
  location: string;
  city: string;
  country: string;
  is_foreign: boolean;
  status: string;
  error_code: string;
  failure_reason: string;
  application: string;
  client_app: string;
  mfa_result: string;
  flagged: string;
  trust_score: number;
  ip_reputation?: IpReputation | null;
}

interface Payload {
  signins_window_minutes?: number;
  home_country_code?: string;
  count?: number;
  failed_signins?: FailedSignin[];
}

interface Config {
  window_minutes?: number;
  limit?: number;
}

interface Props {
  config?: Config | null;
  onConfigChange?: (patch: Record<string, unknown>) => void;
}

const REFRESH_MS = 5 * 60 * 1000;
const DEFAULT_LIMIT = 50;
const LIMIT_OPTIONS = [25, 50, 100, 200];

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value || '';
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function trustColor(score: number): string {
  return score > 65 ? '#fd9e02' : '#39ff88';
}

const badge = (bg: string, color: string): React.CSSProperties => ({
  background: bg, color, fontSize: 10, fontWeight: 600, padding: '1px 6px',
  borderRadius: 10, whiteSpace: 'nowrap',
});

function ReputationBadges({ rep }: { rep: IpReputation }) {
  const items: React.ReactNode[] = [];
  if (rep.is_trusted) items.push(<span key="trusted" style={badge('rgba(34,197,94,.15)', '#16a34a')}>IP de confiance</span>);
  if (rep.is_vpn) items.push(<span key="vpn" style={badge('rgba(239,68,68,.15)', '#dc2626')}>VPN/Proxy</span>);
  if (rep.is_datacenter) items.push(<span key="dc" style={badge('rgba(245,158,11,.15)', '#b45309')}>Datacenter</span>);
  if (rep.usage_type) items.push(<span key="usage" style={badge('#f1f5f9', '#475569')}>{rep.usage_type}</span>);
  if (rep.abuse_score !== null && rep.abuse_score !== undefined) {
    items.push(<span key="abuse" style={badge('rgba(239,68,68,.12)', '#dc2626')}>Abus {rep.abuse_score}%</span>);
  }
  if (rep.isp) items.push(<span key="isp" style={badge('#f1f5f9', '#64748b')}>{rep.isp}</span>);
  return items.length ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>{items}</div> : null;
}

function Row({ s }: { s: FailedSignin }) {
  const place = [s.city, s.country].filter(Boolean).join(', ') || s.location || 'Localisation inconnue';
  const hasReason = !!(s.error_code || s.failure_reason);
  return (
    <div style={{
      border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 10px', marginBottom: 6,
      borderLeft: `3px solid ${s.is_foreign ? '#ef4444' : '#f59e0b'}`, background: 'white',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 12, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.user_display_name || s.user_upn || 'Utilisateur inconnu'}
          </span>
          <AgentPresenceBadge email={s.user_upn} name={s.user_display_name} />
          {s.user_display_name && s.user_upn && (
            <span style={{ fontSize: 10, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.user_upn}</span>
          )}
        </div>
        <span style={{ fontSize: 10, color: '#94a3b8', flexShrink: 0 }}>{formatDateTime(s.date_utc)}</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 3, fontSize: 11, color: '#475569' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}><Globe size={11} /> {place}</span>
        {s.is_foreign && <span style={badge('rgba(239,68,68,.15)', '#dc2626')}>hors pays</span>}
        {s.ip_address && <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#64748b' }}>{s.ip_address}</span>}
        {s.status && s.status !== 'Failure' && <span style={badge('#fef3c7', '#92400e')}>{s.status}</span>}
      </div>

      {(s.application || s.client_app) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 11, color: '#475569' }}>
          <Monitor size={11} /> {s.application || '—'}{s.client_app ? ` · ${s.client_app}` : ''}
        </div>
      )}

      {hasReason && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 4, fontSize: 12, color: '#b91c1c' }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {s.error_code ? <strong>{s.error_code}</strong> : null}
            {s.error_code && s.failure_reason ? ' — ' : ''}
            {s.failure_reason || (s.error_code ? '' : 'Échec de connexion')}
          </span>
        </div>
      )}

      {s.mfa_result && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3, fontSize: 11, color: '#475569' }}>
          <KeyRound size={11} /> MFA : {s.mfa_result}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: trustColor(s.trust_score) }}>
          {s.trust_score > 65 ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />} Confiance {s.trust_score}%
        </span>
      </div>

      {s.ip_reputation && <ReputationBadges rep={s.ip_reputation} />}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  fontSize: 11, padding: '2px 6px', borderRadius: 6, border: '1px solid #cbd5e1',
  background: 'white', color: '#334155', cursor: 'pointer', outline: 'none',
};

export default function MailAnalyseFailedSigninsWidget({ config, onConfigChange }: Props) {
  const { token } = useAuth();
  const minutes = Number(config?.window_minutes) || DEFAULT_WINDOW_MINUTES;
  const limit = Number(config?.limit) || DEFAULT_LIMIT;
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef<Payload | null>(null);

  const load = useCallback(() => {
    return axios.get('/api/analyse-mail/signins/failed', {
      params: { minutes, limit },
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        dataRef.current = r.data || {};
        setData(r.data || {});
        setError(null);
      })
      .catch((e: unknown) => {
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        if (!dataRef.current) setError(msg || 'Analyse-mail injoignable');
      })
      .finally(() => setLoading(false));
  }, [token, minutes, limit]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const rows = data?.failed_signins || [];

  const actions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <select
        value={minutes}
        onChange={e => onConfigChange?.({ window_minutes: Number(e.target.value) })}
        style={selectStyle}
        title="Fenêtre analysée"
      >
        {WINDOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select
        value={limit}
        onChange={e => onConfigChange?.({ limit: Number(e.target.value) })}
        style={selectStyle}
        title="Nombre de lignes"
      >
        {LIMIT_OPTIONS.map(v => <option key={v} value={v}>{v} lignes</option>)}
      </select>
    </div>
  );

  return (
    <WidgetWrapper
      title={`Connexions en erreur — ${windowLabel(minutes)}`}
      loading={loading}
      error={error}
      actions={actions}
    >
      {rows.length === 0 ? (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>
          Aucune connexion en échec sur la fenêtre en cours.
        </div>
      ) : (
        <div style={{ height: '100%', overflowY: 'auto' }}>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>
            {data?.count ?? rows.length} échec(s) — les plus récents d'abord
          </div>
          {rows.map((s, i) => <Row key={`${s.date_utc}|${s.user_upn}|${i}`} s={s} />)}
        </div>
      )}
    </WidgetWrapper>
  );
}
