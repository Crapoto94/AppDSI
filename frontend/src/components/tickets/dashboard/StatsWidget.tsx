import React from 'react';

export default function StatsWidget({ data }: { data: any }) {
  if (!data) return null;
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
      <h4 style={{ margin: '0 0 16px 0', fontSize: 14, fontWeight: 600, color: '#374151' }}>Statistiques</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[
          { label: 'Total', value: data.total, color: '#6366f1' },
          { label: 'Ouverts', value: data.open, color: '#f59e0b' },
          { label: 'Résolus', value: data.resolved, color: '#22c55e' },
          { label: 'Fermés', value: data.closed, color: '#64748b' },
        ].map(s => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value || 0}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
