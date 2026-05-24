import React from 'react';

export default function SLAWidget({ breaches }: { breaches: any[] }) {
  return (
    <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', padding: 20 }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: 14, fontWeight: 600, color: '#374151', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: breaches?.length > 0 ? '#ef4444' : '#22c55e' }} />
        SLA
      </h4>
      {breaches?.length > 0 ? (
        <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
          {breaches.length} ticket(s) en dépassement SLA
        </div>
      ) : (
        <div style={{ fontSize: 13, color: '#22c55e' }}>Aucun dépassement</div>
      )}
    </div>
  );
}
