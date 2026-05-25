import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_NAMES: Record<number, string> = {
  1: 'Nouveau', 2: 'En cours', 3: 'Planifié',
  4: 'En attente', 5: 'Résolu', 6: 'Clos'
};
const STATUS_COLORS: Record<number, string> = {
  1: '#6366f1', 2: '#8b5cf6', 3: '#f59e0b',
  4: '#f97316', 5: '#22c55e', 6: '#64748b'
};
const PRIORITY_COLORS: Record<number, string> = {
  2: '#22c55e', 3: '#f59e0b', 4: '#f97316', 5: '#ef4444',
};

const MIN_LEFT = 260;
const MAX_LEFT = 600;

interface InboxProps {
  tickets: any[];
  loading: boolean;
  total: number;
  totalPages: number;
  page: number;
  onPageChange: (p: number) => void;
  onRefresh: () => void;
  onTicketClick?: (id: number) => void;
  selectedId?: number | null;
}

export default function TicketInbox({ tickets, loading, total, totalPages, page, onPageChange, onRefresh, onTicketClick, selectedId }: InboxProps) {
  const { user } = useAuth();
  const [leftWidth, setLeftWidth] = useState(380);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const next = Math.min(MAX_LEFT, Math.max(MIN_LEFT, startWidth.current + delta));
      setLeftWidth(next);
    }
    function onMouseUp() {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  function handleDragStart(e: React.MouseEvent) {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = leftWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function handleClick(id: number) {
    if (onTicketClick) onTicketClick(id);
  }

  function formatTimeAgo(dateStr: string) {
    const d = new Date(dateStr);
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}j`;
    const months = Math.floor(days / 30);
    return `${months}m`;
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 260px)', minHeight: 400, background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
      {/* Left panel - ticket list */}
      <div style={{ width: leftWidth, minWidth: MIN_LEFT, borderRight: 'none', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 600, fontSize: 13, color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{total} ticket{total !== 1 ? 's' : ''}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && tickets.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Chargement...</div>
          )}
          {!loading && tickets.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: '#94a3b8', fontSize: 13 }}>Aucun ticket</div>
          )}
          {tickets.map((t: any) => {
            const isSelected = selectedId === t.id;
            const statusColor = STATUS_COLORS[t.status?.id] || '#64748b';
            const priorityId = t.priority?.id || t.priority;
            return (
              <div
                key={t.id}
                onClick={() => handleClick(t.id)}
                style={{
                  padding: '10px 14px',
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  background: isSelected ? '#eef2ff' : t.is_vip ? '#fffbeb' : undefined,
                  transition: 'background 0.1s',
                  borderLeft: isSelected ? '3px solid #6366f1' : '3px solid transparent',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'; }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = t.is_vip ? '#fffbeb' : ''; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: '#6366f1' }}>#{t.id}</span>
                  <span style={{
                    display: 'inline-block', padding: '2px 8px', borderRadius: 10,
                    fontSize: 11, fontWeight: 600,
                    background: statusColor + '20', color: statusColor,
                  }}>{STATUS_NAMES[t.status?.id] || t.status?.label || '?'}</span>
                  {t.is_vip && <span style={{ fontSize: 11 }}>⭐</span>}
                  {t.sla_status === 'breached' && <span style={{ fontSize: 11, color: '#ef4444' }}>⚠️</span>}
                  {priorityId >= 4 && (
                    <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLORS[priorityId] || '#94a3b8' }} title={priorityId === 4 ? 'Haute' : 'Très haute'} />
                  )}
                  {t.assignee_group_name && (
                    <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 500 }}>👥 {t.assignee_group_name}</span>
                  )}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                  {t.title}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#64748b' }}>
                  <span>{t.requester_name || 'Anonyme'}</span>
                  {t.category_name && <span>· {t.category_name}</span>}
                  <span style={{ marginLeft: 'auto' }}>{t.date_creation ? formatTimeAgo(t.date_creation) : ''}</span>
                </div>
              </div>
            );
          })}
          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 6, padding: '10px 16px', borderTop: '1px solid #e2e8f0' }}>
              <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.5 : 1, fontSize: 12 }}>←</button>
              <span style={{ fontSize: 12, color: '#64748b', lineHeight: '28px' }}>{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff', cursor: page >= totalPages ? 'default' : 'pointer', opacity: page >= totalPages ? 0.5 : 1, fontSize: 12 }}>→</button>
            </div>
          )}
        </div>
      </div>

      {/* Draggable splitter */}
      <div
        onMouseDown={handleDragStart}
        style={{
          width: 6,
          cursor: 'col-resize',
          background: dragging.current ? '#6366f1' : '#e2e8f0',
          position: 'relative',
          zIndex: 10,
          transition: dragging.current ? 'none' : 'background 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={e => { if (!dragging.current) (e.currentTarget as HTMLDivElement).style.background = '#c7d2fe'; }}
        onMouseLeave={e => { if (!dragging.current) (e.currentTarget as HTMLDivElement).style.background = '#e2e8f0'; }}
      >
        <div style={{
          position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
          width: 4, height: 32, borderRadius: 2,
          background: dragging.current ? '#6366f1' : '#cbd5e1',
          transition: 'background 0.15s',
        }} />
      </div>

      {/* Right panel - ticket detail */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {selectedId ? (
          <iframe
            key={selectedId}
            src={`/tickets/${selectedId}?embedded=1`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            title={`Ticket #${selectedId}`}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 15 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div>Sélectionnez un ticket pour voir les détails</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}