import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_NAMES: Record<number, string> = {
  1: 'Nouveau', 2: 'En cours (Attribué)', 3: 'En cours (Planifié)',
  4: 'En attente', 5: 'Résolus', 6: 'Clos'
};

const STATUS_COLORS: Record<number, string> = {
  1: '#6366f1', 2: '#8b5cf6', 3: '#f59e0b',
  4: '#f97316', 5: '#22c55e', 6: '#64748b'
};

const PRIORITY_COLORS: Record<number, string> = {
  2: '#22c55e', 3: '#f59e0b', 4: '#f97316', 5: '#ef4444',
};

// One consistent hue per bundle ID (cycles through palette)
const BUNDLE_PALETTE = [
  { bg: '#eef2ff', border: '#c7d2fe', header: '#6366f1' },
  { bg: '#fdf4ff', border: '#e9d5ff', header: '#9333ea' },
  { bg: '#fff7ed', border: '#fed7aa', header: '#ea580c' },
  { bg: '#ecfdf5', border: '#a7f3d0', header: '#059669' },
  { bg: '#fef9c3', border: '#fde68a', header: '#d97706' },
  { bg: '#fff1f2', border: '#fecdd3', header: '#e11d48' },
];

function bundleColors(bundleId: number) {
  return BUNDLE_PALETTE[bundleId % BUNDLE_PALETTE.length];
}

const COLUMNS = [1, 2, 3, 4, 5];

interface KanbanProps {
  tickets: any[];
  loading: boolean;
  total: number;
  totalPages: number;
  page: number;
  onPageChange: (p: number) => void;
  onRefresh: () => void;
}

export default function TicketKanban({ tickets, loading, total, totalPages, page, onPageChange, onRefresh }: KanbanProps) {
  const { user } = useAuth();
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);

  // Assign modal
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [pendingAssignTicket, setPendingAssignTicket] = useState<number | null>(null);
  const [technicians, setTechnicians] = useState<any[]>([]);

  // Waiting reason modal
  const [showWaitingModal, setShowWaitingModal] = useState(false);
  const [pendingWaitingTicket, setPendingWaitingTicket] = useState<number | null>(null);
  const [waitingComment, setWaitingComment] = useState('');

  // Solution modal
  const [showSolutionModal, setShowSolutionModal] = useState(false);
  const [pendingSolutionTicket, setPendingSolutionTicket] = useState<number | null>(null);
  const [solutionText, setSolutionText] = useState('');

  // Distribute tickets per column
  const grouped: Record<number, any[]> = {};
  COLUMNS.forEach(c => grouped[c] = []);
  tickets.forEach((t: any) => {
    const s = t.status?.id || 1;
    if (grouped[s]) grouped[s].push(t);
    else if (grouped[1]) grouped[1].push(t);
  });

  async function doChangeStatus(ticketId: number, newStatus: number) {
    const token = localStorage.getItem('token');
    await axios.post(`/api/tickets/${ticketId}/status`, { status: newStatus }, {
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  async function handleDrop(ticketId: number, newStatus: number) {
    if (moving) return;
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;
    const currentStatus = ticket.status?.id || 1;

    if (currentStatus === 1 && newStatus === 2) {
      setMoving(true);
      try {
        const token = localStorage.getItem('token');
        const res = await axios.get('/api/tickets/admin/technicians/available', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setTechnicians(res.data || []);
        setPendingAssignTicket(ticketId);
        setShowAssignModal(true);
      } catch (e) {
        console.error('Failed to load technicians:', e);
      } finally {
        setMoving(false);
      }
      return;
    }

    if (newStatus === 3) {
      setMoving(true);
      try {
        const token = localStorage.getItem('token');
        if (user?.id) {
          await axios.post(`/api/tickets/${ticketId}/assign`, { technician_id: user.id }, {
            headers: { Authorization: `Bearer ${token}` }
          });
        }
        await doChangeStatus(ticketId, 3);
        onRefresh();
      } catch (e: any) {
        console.error('Failed to move ticket:', e);
        if (e.response?.data?.message) alert(e.response.data.message);
      } finally {
        setMoving(false);
      }
      return;
    }

    if (newStatus === 4) {
      setPendingWaitingTicket(ticketId);
      setWaitingComment('');
      setShowWaitingModal(true);
      return;
    }

    if (newStatus === 6) {
      setPendingSolutionTicket(ticketId);
      setSolutionText('');
      setShowSolutionModal(true);
      return;
    }

    setMoving(true);
    try {
      await doChangeStatus(ticketId, newStatus);
      onRefresh();
    } catch (e: any) {
      console.error('Failed to move ticket:', e);
      if (e.response?.data?.message) alert(e.response.data.message);
    } finally {
      setMoving(false);
    }
  }

  async function handleAssignTechnician(userId: number) {
    if (!pendingAssignTicket) return;
    setMoving(true);
    setShowAssignModal(false);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/tickets/${pendingAssignTicket}/assign`, { technician_id: userId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onRefresh();
    } catch (e: any) {
      console.error('Failed to assign:', e);
      if (e.response?.data?.message) alert(e.response.data.message);
    } finally {
      setPendingAssignTicket(null);
      setMoving(false);
    }
  }

  async function handleWaitingSubmit() {
    if (!pendingWaitingTicket) return;
    setMoving(true);
    setShowWaitingModal(false);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/tickets/${pendingWaitingTicket}/status`, { status: 4, comment: waitingComment }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onRefresh();
    } catch (e: any) {
      console.error('Failed to set waiting:', e);
      if (e.response?.data?.message) alert(e.response.data.message);
    } finally {
      setPendingWaitingTicket(null);
      setMoving(false);
    }
  }

  async function handleSolutionSubmit() {
    if (!pendingSolutionTicket) return;
    setMoving(true);
    setShowSolutionModal(false);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`/api/tickets/${pendingSolutionTicket}/solution`, { solution: solutionText }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      onRefresh();
    } catch (e: any) {
      console.error('Failed to set solution:', e);
      if (e.response?.data?.message) alert(e.response.data.message);
    } finally {
      setPendingSolutionTicket(null);
      setMoving(false);
    }
  }

// ─── Card renderer ───────────────────────────────────────────────
  function renderCard(t: any) {
    const isProblem = t.type?.id === 3 || t.type === 3;
    const hasBundleProblem = t.bundle?.problem_ticket_id;

    return (
      <div
        key={t.id}
        draggable
        onDragStart={e => {
          setDraggedId(t.id);
          e.dataTransfer.setData('ticketId', String(t.id));
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => setDraggedId(null)}
        style={{
          background: draggedId === t.id ? '#e0e7ff' : '#fff',
          borderRadius: 10, overflow: 'hidden',
          border: `1px solid ${draggedId === t.id ? '#6366f1' : isProblem ? '#d8b4fe' : '#e2e8f0'}`,
          boxShadow: draggedId === t.id
            ? '0 8px 16px rgba(99,102,241,0.15)'
            : '0 1px 2px rgba(0,0,0,0.04)',
          transition: 'box-shadow 0.15s, border-color 0.15s',
          opacity: moving ? 0.7 : 1,
        }}>
        {/* Grip bar */}
        <div style={{
            cursor: 'grab', padding: '5px 12px 3px',
            background: isProblem ? '#f3e8ff' : '#f1f5f9',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
          <span style={{ fontSize: 11, fontFamily: 'monospace', color: isProblem ? '#9333ea' : '#6366f1', fontWeight: 600, flex: 1 }}>
            ⠿ #{t.id}
          </span>
          {isProblem && (
            <span style={{ fontSize: 10, fontWeight: 700, background: '#e9d5ff', color: '#9333ea', padding: '1px 6px', borderRadius: 4, letterSpacing: 0.3 }}>PROBLÈME</span>
          )}
          {hasBundleProblem && (
            <span onClick={e => { e.stopPropagation(); window.location.href = `/tickets/${t.bundle.problem_ticket_id}`; }}
              style={{ fontSize: 10, fontWeight: 600, background: '#e9d5ff', color: '#9333ea', padding: '1px 6px', borderRadius: 4, cursor: 'pointer', letterSpacing: 0.3 }}>
              ↗ #{t.bundle.problem_ticket_id}
            </span>
          )}
          {t.is_vip && <span style={{ fontSize: 10 }}>⭐</span>}
          {t.sla_status === 'breached' && <span title="SLA dépassé" style={{ fontSize: 12 }}>⚠️</span>}
          {t.sla_status === 'warning' && <span title="SLA en alerte" style={{ fontSize: 12 }}>⚠️</span>}
        </div>

        {/* Clickable body */}
        <div
          onClick={() => window.location.href = `/tickets/${t.id}`}
          style={{ padding: '8px 12px 12px', cursor: 'pointer' }}>

          {/* Title */}
          <div style={{
            fontSize: 13, fontWeight: isProblem ? 600 : 500,
            color: isProblem ? '#6b21a8' : '#1e293b',
            marginBottom: 6, lineHeight: 1.3,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}>{t.title}</div>

          {/* Priority dots + Requester */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              {[1, 2, 3, 4].map(i => {
                const activeDots = Math.max(0, Math.min(4, (t.priority?.id || 3) - 1));
                const color = PRIORITY_COLORS[t.priority?.id] || '#64748b';
                return <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: i <= activeDots ? color : '#e2e8f0' }} />;
              })}
            </div>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              {t.requester_name || 'Anonyme'}
            </span>
          </div>

          {/* Technician/Group */}
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <div>
              {t.assignee_group_name ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, background: '#eff6ff', color: '#6366f1', padding: '2px 8px', borderRadius: 4 }}>
                  👥 {t.assignee_group_name}
                </span>
              ) : t.technician_name ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, background: '#e0f2fe', color: '#0284c7', padding: '2px 8px', borderRadius: 4 }}>
                  🔧 {t.technician_name}
                </span>
              ) : (
                <span style={{ fontSize: 11, color: '#94a3b8' }}>Non assigné</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Column content: cluster bundled tickets ─────────────────────
  function renderColumnContent(columnTickets: any[]) {
    // Separate bundled from ungrouped
    const bundleMap: Record<number, { bundle: any; tickets: any[] }> = {};
    const ungrouped: any[] = [];

    for (const t of columnTickets) {
      if (t.bundle) {
        if (!bundleMap[t.bundle.id]) {
          bundleMap[t.bundle.id] = { bundle: t.bundle, tickets: [] };
        }
        bundleMap[t.bundle.id].tickets.push(t);
      } else {
        ungrouped.push(t);
      }
    }

    const bundleEntries = Object.values(bundleMap);

    return (
      <>
        {bundleEntries.map(({ bundle, tickets: bTickets }) => {
          const colors = bundleColors(bundle.id);
          return (
            <div key={bundle.id} style={{
              background: colors.bg,
              border: `1.5px solid ${colors.border}`,
              borderRadius: 10,
              padding: '6px 6px 8px',
              marginBottom: 4
            }}>
              {/* Group header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '2px 4px 6px', marginBottom: 4,
                borderBottom: `1px solid ${colors.border}`
              }}>
                <span style={{ fontSize: 12 }}>🔗</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: colors.header,
                  flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                }}>
                  {bundle.name}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  background: colors.border, color: colors.header,
                  padding: '1px 6px', borderRadius: 8
                }}>
                  {bTickets.length}
                </span>
                {bundle.problem_ticket_id && (
                  <span
                    title={`Voir problème #${bundle.problem_ticket_id}`}
                    onClick={e => { e.stopPropagation(); window.location.href = `/tickets/${bundle.problem_ticket_id}`; }}
                    style={{
                      fontSize: 10, fontWeight: 600, color: '#9333ea',
                      background: '#f3e8ff', padding: '1px 6px', borderRadius: 8,
                      cursor: 'pointer'
                    }}>
                    ↗ #{bundle.problem_ticket_id}
                  </span>
                )}
              </div>
              {/* Cards inside the bundle */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {bTickets.map(t => renderCard(t))}
              </div>
            </div>
          );
        })}

        {/* Ungrouped tickets */}
        {ungrouped.map(t => renderCard(t))}
      </>
    );
  }

  // ─── Shared modal styles ─────────────────────────────────────────
  const modalOverlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
  };
  const modalBox: React.CSSProperties = {
    background: '#fff', borderRadius: 16, padding: 24, width: 460, maxHeight: '70vh', overflow: 'auto'
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
    fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical', minHeight: 80
  };
  const btnPrimary: React.CSSProperties = {
    padding: '10px 20px', background: '#6366f1', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer'
  };
  const btnSecondary: React.CSSProperties = {
    padding: '10px 20px', background: '#fff', color: '#475569', border: '1px solid #e2e8f0',
    borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer'
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, overflow: 'auto', minHeight: 500, paddingBottom: 16 }}>
        {COLUMNS.map(colId => (
          <div
            key={colId}
            onDragOver={e => { e.preventDefault(); setDropTarget(colId); }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={e => {
              e.preventDefault();
              setDropTarget(null);
              const ticketId = parseInt(e.dataTransfer.getData('ticketId'));
              if (ticketId) handleDrop(ticketId, colId);
            }}
            style={{
              minWidth: 260, flex: 1,
              background: dropTarget === colId ? '#eef2ff' : '#f8fafc',
              borderRadius: 12, padding: 12,
              transition: 'background 0.15s',
              border: dropTarget === colId ? '2px dashed #6366f1' : '2px solid transparent'
            }}>
            {/* Column header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '0 4px' }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[colId] }} />
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{STATUS_NAMES[colId]}</span>
              <span style={{
                marginLeft: 'auto', background: '#e2e8f0', color: '#64748b',
                fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 10
              }}>
                {(grouped[colId] || []).length}
              </span>
            </div>

            {/* Cards — bundled then ungrouped */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {renderColumnContent(grouped[colId] || [])}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0' }}>
        <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}
          style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: page > 1 ? 'pointer' : 'default', fontSize: 13, fontWeight: 500, color: page > 1 ? '#475569' : '#cbd5e1' }}>
          ←
        </button>
        {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
          let p: number;
          if (totalPages <= 7) { p = i + 1; }
          else if (page <= 4) { p = i + 1; }
          else if (page >= totalPages - 3) { p = totalPages - 6 + i; }
          else { p = page - 3 + i; }
          return (
            <button key={p} onClick={() => onPageChange(p)}
              style={{
                padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8,
                background: page === p ? '#6366f1' : '#fff',
                color: page === p ? '#fff' : '#475569',
                cursor: 'pointer', fontSize: 13, fontWeight: page === p ? 600 : 500
              }}>
              {p}
            </button>
          );
        })}
        <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}
          style={{ padding: '8px 14px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: page < totalPages ? 'pointer' : 'default', fontSize: 13, fontWeight: 500, color: page < totalPages ? '#475569' : '#cbd5e1' }}>
          →
        </button>
        <span style={{ fontSize: 13, color: '#64748b' }}>{total} tickets · page {page}/{totalPages}</span>
      </div>

      {/* ── Assign Modal ─────────────────────────────────────────────────── */}
      {showAssignModal && (
        <div style={modalOverlay} onClick={() => { setShowAssignModal(false); setPendingAssignTicket(null); }}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 600 }}>Assigner un technicien</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {technicians.map((t: any) => (
                <div key={t.user_id} onClick={() => handleAssignTechnician(t.user_id)}
                  style={{
                    padding: '10px 14px', border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer',
                    background: '#fff', transition: 'background 0.1s', display: 'flex', alignItems: 'center', gap: 12
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.status === 'active' ? '#22c55e' : t.status === 'paused' ? '#f59e0b' : '#ef4444', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.displayname || t.displayName}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{t.email}</div>
                  </div>
                  <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>{t.active_tickets || 0} ticket(s)</span>
                </div>
              ))}
              {technicians.length === 0 && (
                <div style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>Aucun technicien disponible</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Waiting Reason Modal ─────────────────────────────────────────── */}
      {showWaitingModal && (
        <div style={modalOverlay} onClick={() => { setShowWaitingModal(false); setPendingWaitingTicket(null); }}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 600 }}>Mettre en attente</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#64748b' }}>
              Indiquez le motif de la mise en attente
            </p>
            <textarea style={inputStyle} placeholder="Motif..." value={waitingComment}
              onChange={e => setWaitingComment(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={btnSecondary} onClick={() => { setShowWaitingModal(false); setPendingWaitingTicket(null); }}>Annuler</button>
              <button style={btnPrimary} onClick={handleWaitingSubmit} disabled={!waitingComment.trim()}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Solution Modal ──────────────────────────────────────────────── */}
      {showSolutionModal && (
        <div style={modalOverlay} onClick={() => { setShowSolutionModal(false); setPendingSolutionTicket(null); }}>
          <div style={modalBox} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontWeight: 600 }}>Résoudre le ticket</h3>
            <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#64748b' }}>
              Décrivez la solution apportée
            </p>
            <textarea style={inputStyle} placeholder="Solution..." value={solutionText}
              onChange={e => setSolutionText(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button style={btnSecondary} onClick={() => { setShowSolutionModal(false); setPendingSolutionTicket(null); }}>Annuler</button>
              <button style={btnPrimary} onClick={handleSolutionSubmit} disabled={!solutionText.trim()}>Résoudre</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
