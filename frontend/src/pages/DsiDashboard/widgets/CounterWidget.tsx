import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { Package, Shield, FileText, CheckSquare } from 'lucide-react';

type CounterType = 'consommables' | 'certificats' | 'contrats' | 'taches';

const CONFIG: Record<CounterType, {
  title: string; icon: React.ElementType; color: string;
  url: string; extract: (d: any) => { main: number; sub?: string };
}> = {
  consommables: {
    title: 'Consommables', icon: Package, color: '#8b5cf6',
    url: '/api/consumable/pending-count',
    extract: d => ({ main: d.count || 0, sub: 'demandes en attente' }),
  },
  certificats: {
    title: 'Certificats', icon: Shield, color: '#f59e0b',
    url: '/api/certificates/renewal-count',
    extract: d => ({ main: d.count || d.renewal_count || 0, sub: 'à renouveler' }),
  },
  contrats: {
    title: 'Contrats', icon: FileText, color: '#ef4444',
    url: '/api/contrats/expiry-count',
    extract: d => ({
      main: (d.expired || 0) + (d.soon || 0),
      sub: `${d.expired || 0} expirés · ${d.soon || 0} bientôt`,
    }),
  },
  taches: {
    title: 'Tâches', icon: CheckSquare, color: '#22c55e',
    url: '/api/tasks/count',
    extract: d => ({
      main: (d.overdue || 0) + (d.en_cours || 0),
      sub: `${d.overdue || 0} en retard · ${d.en_cours || 0} en cours`,
    }),
  },
};

export function CounterWidget({ type }: { type: CounterType }) {
  const { token } = useAuth();
  const [result, setResult] = useState<{ main: number; sub?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cfg = CONFIG[type];

  useEffect(() => {
    axios.get(cfg.url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => setResult(cfg.extract(r.data)))
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token, type]);

  const Icon = cfg.icon;

  return (
    <WidgetWrapper title={cfg.title} loading={loading} error={error}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 4 }}>
        <Icon size={26} color={result?.main ? cfg.color : '#94a3b8'} />
        <div style={{ fontSize: 34, fontWeight: 700, color: result?.main ? cfg.color : '#94a3b8', lineHeight: 1 }}>
          {result?.main ?? '–'}
        </div>
        {result?.sub && <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center' }}>{result.sub}</div>}
      </div>
    </WidgetWrapper>
  );
}

export function ConsommablesWidget() { return <CounterWidget type="consommables" />; }
export function CertificatsWidget() { return <CounterWidget type="certificats" />; }
export function ContratsWidget() { return <CounterWidget type="contrats" />; }
export function TachesWidget() { return <CounterWidget type="taches" />; }
