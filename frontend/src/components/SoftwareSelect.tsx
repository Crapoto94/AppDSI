import React, { useState, useEffect, useRef, useMemo } from 'react';

// Sélecteur de logiciel : trié alphabétiquement + zone de recherche filtrante.
export default function SoftwareSelect({ apps, value, onChange, maxWidth = 180, compact = false }: { apps: any[]; value: string; onChange: (v: string) => void; maxWidth?: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const sorted = useMemo(
    () => [...(apps || [])].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr', { sensitivity: 'base' })),
    [apps]
  );
  const needle = q.trim().toLowerCase();
  const filtered = needle ? sorted.filter(a => (a.name || '').toLowerCase().includes(needle)) : sorted;
  const selected = (apps || []).find(a => a.id.toString() === value);

  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const itemStyle: React.CSSProperties = { padding: '6px 9px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%', maxWidth }}>
      <button type="button" onClick={() => { setOpen(o => !o); setQ(''); }}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, width: '100%', ...(compact ? { height: 22, boxSizing: 'border-box' as const, padding: '0 6px', fontSize: 11, fontWeight: 600 } : { padding: '5px 7px', fontSize: 12 }), border: compact ? '1px solid #bae6fd' : '1px solid #e4e4e7', borderRadius: 6, background: '#fff', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? '#3f3f46' : '#a1a1aa' }}>{selected ? selected.name : '— Non défini —'}</span>
        <span style={{ fontSize: 9, color: '#a1a1aa', flexShrink: 0 }}>▾</span>
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60, background: '#fff', border: '1px solid #e4e4e7', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher un logiciel…"
            style={{ width: '100%', boxSizing: 'border-box', padding: '7px 9px', border: 'none', borderBottom: '1px solid #f1f5f9', fontSize: 12, outline: 'none' }} />
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            <div onClick={() => { onChange(''); setOpen(false); }} style={{ ...itemStyle, color: '#a1a1aa' }}>— Non défini —</div>
            {filtered.map(a => (
              <div key={a.id} onClick={() => { onChange(a.id.toString()); setOpen(false); }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f4f4f5'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = a.id.toString() === value ? '#eef2ff' : '#fff'; }}
                style={{ ...itemStyle, color: '#3f3f46', background: a.id.toString() === value ? '#eef2ff' : '#fff' }}>{a.name}</div>
            ))}
            {filtered.length === 0 && <div style={{ padding: 9, fontSize: 12, color: '#a1a1aa' }}>Aucun résultat</div>}
          </div>
        </div>
      )}
    </div>
  );
}
