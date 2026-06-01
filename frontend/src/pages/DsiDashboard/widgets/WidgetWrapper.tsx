import React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';

interface Props {
  title: string;
  loading?: boolean;
  error?: string | null;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

const s: Record<string, React.CSSProperties> = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 14px 8px', borderBottom: '1px solid #e2e8f0', flexShrink: 0,
  },
  title: { fontWeight: 600, fontSize: 13, color: '#1e293b', margin: 0 },
  body: { flex: 1, overflow: 'auto', padding: '10px 14px 12px', minHeight: 0 },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 8 },
};

export default function WidgetWrapper({ title, loading, error, children, actions }: Props) {
  return (
    <div style={s.root}>
      <div style={s.header}>
        <p style={s.title}>{title}</p>
        {actions}
      </div>
      <div style={s.body}>
        {loading ? (
          <div style={s.center}>
            <Loader2 size={22} color="#94a3b8" style={{ animation: 'spin 1s linear infinite' }} />
            <span style={{ fontSize: 12, color: '#94a3b8' }}>Chargement…</span>
          </div>
        ) : error ? (
          <div style={s.center}>
            <AlertCircle size={20} color="#f87171" />
            <span style={{ fontSize: 12, color: '#f87171', textAlign: 'center' }}>{error}</span>
          </div>
        ) : children}
      </div>
    </div>
  );
}
