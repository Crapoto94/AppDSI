import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../contexts/AuthContext';
import WidgetWrapper from './WidgetWrapper';
import { useDashboardFilter, filterToQueryString } from '../DashboardFilterContext';

const PRIO_COLOR: Record<string, string> = {
  '5': '#ef4444', '4': '#f97316', '3': '#f59e0b', '2': '#3b82f6', '1': '#94a3b8',
};
const STATUS_COLOR: Record<string, string> = {
  '1': '#3b82f6', '2': '#8b5cf6', '3': '#f59e0b', '4': '#94a3b8',
  '5': '#22c55e', '6': '#64748b', '8': '#ef4444',
};
const TYPE_COLOR: Record<string, string> = { '1': '#ef4444', '2': '#3b82f6', '3': '#8b5cf6' };
// Fallback si type_label n'est pas renseigné (bug DTO clés int vs string)
const TYPE_LABEL_FB: Record<string, string> = { '1': 'Incident', '2': 'Demande', '3': 'Problème' };

function fmtAge(dt: string) {
  if (!dt) return '–';
  const diff = (Date.now() - new Date(dt).getTime()) / 1000;
  if (diff < 60) return "À l'instant";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)} j`;
  return new Date(dt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function fmtHour(dt: string) {
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function initials(name: string) {
  return name.trim().split(/\s+/).map(p => p[0] || '').join('').toUpperCase().substring(0, 3);
}

// Column definitions
const COLS = [
  { key: 'num',       label: 'N°',        w: '72px'  },
  { key: 'type',      label: 'Type',      w: '64px'  },
  { key: 'title',     label: 'Titre',     w: '1fr'   },
  { key: 'status',    label: 'Statut',    w: '120px' },
  { key: 'priority',  label: 'Priorité',  w: '110px' },
  { key: 'requester', label: 'Demandeur', w: '160px' },
  { key: 'assignee',  label: 'Assigné',   w: '180px' },
  { key: 'opened',    label: 'Ouvert',    w: '80px'  },
];

const GRID = COLS.map(c => c.w).join(' ');

const cellBase: React.CSSProperties = {
  display: 'flex', alignItems: 'center',
  overflow: 'hidden', padding: '0 6px',
};

export default function TicketsRecentWidget() {
  const { token } = useAuth();
  const filter = useDashboardFilter();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    const qs = filterToQueryString(filter);
    const sep = qs ? '&' : '?';
    axios.get(`/api/tickets${qs}${sep}limit=30&sort=date_creation&order=desc`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => {
        const raw: any[] = r.data?.data || [];
        const seen = new Set<number>();
        const deduped = raw.filter(t => {
          if (seen.has(t.id)) return false;
          seen.add(t.id);
          return true;
        }).slice(0, 15);
        setTickets(deduped);
      })
      .catch(e => setError(e.response?.data?.message || 'Erreur'))
      .finally(() => setLoading(false));
  }, [token, filter]);

  return (
    <WidgetWrapper title="Derniers tickets" loading={loading} error={error}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* ── Header ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: GRID,
          background: '#1e293b', borderRadius: '6px 6px 0 0',
          padding: '0 4px', flexShrink: 0,
        }}>
          {COLS.map(col => (
            <div key={col.key} style={{
              ...cellBase, height: 38,
              fontSize: 14, fontWeight: 700, color: '#94a3b8',
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>
              {col.label}
            </div>
          ))}
        </div>

        {/* ── Rows ── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tickets.length === 0 && !loading && (
            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 20, padding: 48 }}>
              Aucun ticket
            </div>
          )}

          {tickets.map((t: any, idx: number) => {
            const statusId   = String(t.status?.id   ?? '1').trim();
            const statusLbl  = t.status?.label  || `S${statusId}`;
            const prioId     = String(t.priority?.id ?? '3').trim();
            const prioLbl    = t.priority?.label || `P${prioId}`;
            const typeId     = String(t.type ?? '1').trim();
            const typeLbl    = (t.type_label && t.type_label !== typeId) ? t.type_label : (TYPE_LABEL_FB[typeId] ?? typeId);
            const isVip      = t.is_vip || t.is_elu;
            const vipCode    = t.requester_service_code || '';
            const requester  = t.requester_name || t.requester_email || '–';
            const statusColor = STATUS_COLOR[statusId] ?? '#94a3b8';
            const prioColor   = PRIO_COLOR[prioId]    ?? '#94a3b8';
            const typeColor   = TYPE_COLOR[typeId]    ?? '#94a3b8';

            return (
              <div
                key={t.id ?? idx}
                style={{
                  display: 'grid', gridTemplateColumns: GRID,
                  height: 64,
                  padding: '0 4px',
                  borderBottom: `1px solid ${isVip ? '#fde68a' : '#f1f5f9'}`,
                  background: isVip
                    ? (idx % 2 === 0 ? '#fffbeb' : '#fef9c3')
                    : idx % 2 === 0 ? 'white' : '#f8fafc',
                  borderLeft: `5px solid ${isVip ? '#f59e0b' : prioColor}`,
                  alignItems: 'center',
                }}
              >
                {/* N° */}
                <div style={{ ...cellBase }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#334155' }}>
                    {t.id}
                  </span>
                </div>

                {/* Type */}
                <div style={{ ...cellBase }}>
                  <span style={{
                    fontSize: 16, fontWeight: 800, padding: '4px 8px', borderRadius: 6,
                    background: typeColor + '22', color: typeColor,
                  }}>
                    {typeLbl}
                  </span>
                </div>

                {/* Titre */}
                <div style={{ ...cellBase, gap: 8 }}>
                  {isVip && (
                    <span style={{
                      fontSize: 13, fontWeight: 700, background: '#f59e0b', color: 'white',
                      borderRadius: 4, padding: '3px 8px', flexShrink: 0,
                    }}>
                      VIP{vipCode ? ` · ${vipCode}` : ''}
                    </span>
                  )}
                  <span style={{
                    fontSize: 20, fontWeight: 600, color: '#0f172a',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {t.title || '(sans titre)'}
                  </span>
                </div>

                {/* Statut */}
                <div style={{ ...cellBase }}>
                  <span style={{
                    fontSize: 15, fontWeight: 700, padding: '5px 12px', borderRadius: 20,
                    background: statusColor + '20', color: statusColor,
                    border: `1px solid ${statusColor}50`,
                    whiteSpace: 'nowrap',
                  }}>
                    {statusLbl}
                  </span>
                </div>

                {/* Priorité */}
                <div style={{ ...cellBase, gap: 7 }}>
                  <span style={{
                    width: 14, height: 14, borderRadius: '50%',
                    background: prioColor, flexShrink: 0, display: 'inline-block',
                  }} />
                  <span style={{ fontSize: 15, color: '#374151', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {prioLbl}
                  </span>
                </div>

                {/* Demandeur */}
                <div style={{ ...cellBase }}>
                  <span style={{
                    fontSize: 16, color: '#1e293b', fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {requester}
                  </span>
                </div>

                {/* Assigné — groupe + technicien (peuvent coexister) */}
                <div style={{ ...cellBase, flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
                  {t.assignee_group_name && (
                    <span style={{
                      fontSize: 13, fontWeight: 600, color: '#8b5cf6',
                      background: '#f5f3ff', borderRadius: 4, padding: '2px 6px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }} title={t.assignee_group_name}>
                      {t.assignee_group_name}
                    </span>
                  )}
                  {t.technician_name && (
                    <span style={{
                      fontSize: 14, fontWeight: 600, color: '#1e293b',
                      background: '#f1f5f9', borderRadius: 4, padding: '2px 6px',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      maxWidth: '100%',
                    }} title={t.technician_name}>
                      {t.technician_name}
                    </span>
                  )}
                  {!t.technician_name && !t.assignee_group_name && (
                    <span style={{ color: '#cbd5e1', fontSize: 16 }}>–</span>
                  )}
                </div>

                {/* Ouvert */}
                <div style={{ ...cellBase, flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center', gap: 2 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: '#374151' }}>
                    {fmtAge(t.date_creation)}
                  </span>
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>
                    {fmtHour(t.date_creation)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </WidgetWrapper>
  );
}
