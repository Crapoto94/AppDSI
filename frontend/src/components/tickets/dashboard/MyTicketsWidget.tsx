import React from 'react';

export default function MyTicketsWidget({ stats }: { stats: any }) {
  if (!stats) return null;
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, color: '#374151' }}>Mes tickets</h4>
      <div style={{ display: 'flex', gap: 16 }}>
        <div><span style={{ fontSize: 20, fontWeight: 700, color: '#f59e0b' }}>{stats.active || 0}</span> <span style={{ fontSize: 12, color: '#94a3b8' }}>actifs</span></div>
        <div><span style={{ fontSize: 20, fontWeight: 700, color: '#22c55e' }}>{stats.in_progress || 0}</span> <span style={{ fontSize: 12, color: '#94a3b8' }}>en cours</span></div>
        <div><span style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>{stats.critical || 0}</span> <span style={{ fontSize: 12, color: '#94a3b8' }}>critiques</span></div>
      </div>
    </div>
  );
}
