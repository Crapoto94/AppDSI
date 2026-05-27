import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

const STATUS_NAMES: Record<number, string> = {
  1: 'Nouveau', 2: 'En cours (Attribué)', 3: 'En cours (Planifié)',
  4: 'En attente', 5: 'Résolu', 6: 'Clos'
};

const STATUS_COLORS: Record<number, string> = {
  1: '#6366f1', 2: '#8b5cf6', 3: '#f59e0b',
  4: '#f97316', 5: '#22c55e', 6: '#64748b'
};

// priority 2=Basse -> 1 dot, 3=Normale -> 2, 4=Haute -> 3, 5=Tres haute -> 4
const PRIORITY_COLORS: Record<number, string> = {
  2: '#22c55e',
  3: '#f59e0b',
  4: '#f97316',
  5: '#ef4444',
};

const IMPACT_LABELS: Record<number, { icon: string; label: string; color: string }> = {
  2: { icon: '👤', label: '1 utilisateur', color: '#64748b' },
  3: { icon: '👥', label: 'Groupe de travail', color: '#3b82f6' },
  4: { icon: '🏢', label: 'Service / Direction', color: '#6366f1' },
  5: { icon: '🌍', label: 'Global', color: '#ef4444' },
};

function PriorityDots({ priorityId }: { priorityId: number }) {
  const activeDots = Math.max(0, Math.min(4, (priorityId || 3) - 1));
  const color = PRIORITY_COLORS[priorityId] || '#64748b';
  return (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
      {[1, 2, 3, 4].map(i => (
        <div key={i} style={{
          width: 8, height: 8, borderRadius: '50%',
          background: i <= activeDots ? color : '#e2e8f0',
          transition: 'background 0.15s'
        }} />
      ))}
    </div>
  );
}

// ── Modal de création de groupe ────────────────────────────────────
function GroupModal({ selectedIds, onClose, onCreated }: {
  selectedIds: number[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/tickets/groups', {
        ticket_ids: selectedIds,
        name: name.trim() || undefined,
      }, { headers: { Authorization: `Bearer ${token}` } });
      onCreated();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Erreur lors de la création du groupe');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
    }} onClick={onClose}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 28, width: 440,
        boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <span style={{ fontSize: 22 }}>🔗</span>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
            Grouper {selectedIds.length} tickets
          </h3>
        </div>

        <div style={{
          background: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 16,
          display: 'flex', flexWrap: 'wrap', gap: 6
        }}>
          {selectedIds.map(id => (
            <span key={id} style={{
              padding: '3px 10px', borderRadius: 20, background: '#e0e7ff',
              color: '#4f46e5', fontSize: 12, fontWeight: 600
            }}>#{id}</span>
          ))}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Nom du groupe <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnel)</span>
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={`Groupe du ${new Date().toLocaleDateString('fr-FR')}`}
            autoFocus
            style={{
              width: '100%', padding: '9px 12px', border: '1.5px solid #e2e8f0',
              borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
              outline: 'none'
            }}
            onKeyDown={e => e.key === 'Enter' && create()}
          />
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
            padding: '10px 14px', marginBottom: 16, color: '#dc2626', fontSize: 13
          }}>{error}</div>
        )}

        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 20px' }}>
          ℹ️ Les actions (commentaires, changements de statut, assignations) seront propagées à tous les tickets du groupe.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose}
            style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>
            Annuler
          </button>
          <button onClick={create} disabled={loading}
            style={{
              padding: '9px 22px', border: 'none', borderRadius: 8, cursor: loading ? 'default' : 'pointer',
              background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 14,
              opacity: loading ? 0.7 : 1
            }}>
            {loading ? 'Création...' : '🔗 Grouper'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ────────────────────────────────────────────
type SortDir = 'asc' | 'desc';

const SORT_FIELDS: Record<string, (t: any) => any> = {
  id:         t => t.id ?? 0,
  title:      t => (t.title || '').toLowerCase(),
  status:     t => t.status?.id ?? 99,
  priority:   t => t.priority?.id ?? 0,
  impact:     t => t.impact?.id ?? 0,
  type:       t => String(t.type || ''),
  comments:   t => t.followups_count ?? 0,
  tasks:      t => t.tasks_count ?? 0,
  observers:  t => t.observer_count ?? 0,
  active:     t => t.active_days ?? -1,
  requester:  t => (t.requester_name || '').toLowerCase(),
  technician: t => (t.assignee_group_name || t.technician_name || 'zzz').toLowerCase(),
  date:       t => t.date_creation || '',
};

export default function TicketList({
  tickets,
  loading,
  onRefresh,
  sortKey,
  sortDir,
  onSort,
  categories = [],
  activeCategory,
  activeSubcategory,
  onCategoryFilter,
}: {
  tickets: any[];
  loading: boolean;
  onRefresh?: () => void;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string, dir: 'asc' | 'desc') => void;
  categories?: any[];
  activeCategory?: number | null;
  activeSubcategory?: number | null;
  onCategoryFilter?: (categoryId: number | null, subcategoryId: number | null) => void;
}) {
  const { user } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const localSortKey = sortKey ?? null;
  const localSortDir = sortDir ?? 'asc' as SortDir;

  const isSupervisor = ['superviseur', 'supervisor', 'admin', 'superadmin'].includes(user?.role?.toLowerCase() || '');

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Chargement...</div>;

  function toggleSelect(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    const s = new Set(selectedIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedIds(s);
  }

  function toggleAll() {
    if (selectedIds.size === tickets.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(tickets.map(t => t.id)));
    }
  }

  function afterGroupCreated() {
    setShowGroupModal(false);
    setSelectedIds(new Set());
    if (onRefresh) onRefresh();
    else window.location.reload();
  }

  async function handleBulkDelete() {
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.delete('/api/tickets/bulk', {
        data: { ticket_ids: Array.from(selectedIds) },
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedIds(new Set());
      setShowDeleteConfirm(false);
      if (onRefresh) onRefresh();
      else window.location.reload();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erreur lors de la suppression');
    } finally {
      setDeleting(false);
    }
  }

  function handleSort(key: string) {
    if (onSort) {
      // Si onSort est fourni, l'utiliser pour le tri serveur
      if (localSortKey === key) {
        onSort(key, localSortDir === 'asc' ? 'desc' : 'asc');
      } else {
        onSort(key, 'asc');
      }
    }
  }

  // Utiliser les tickets reçus (supposément déjà triés par le serveur)
  const sortedTickets = tickets;

  const allSelected = tickets.length > 0 && selectedIds.size === tickets.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  return (
    <>
      <style>{`@keyframes livePulseRow { 0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(34,197,94,0.4)} 50%{opacity:0.85;box-shadow:0 0 0 3px rgba(34,197,94,0)} }`}</style>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, minWidth: 1200 }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e2e8f0', background: '#f8fafc' }}>
              <th style={thStyle}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={el => { if (el) el.indeterminate = someSelected; }}
                  onChange={toggleAll}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              {([
                { key: 'id',         label: '#',          align: 'center' },
                { key: 'title',      label: 'Titre',      align: 'left'   },
                { key: 'status',     label: 'Statut',     align: 'center' },
                { key: 'priority',   label: 'Priorité',   align: 'center' },
                { key: 'impact',     label: 'Impact',     align: 'center' },
                { key: 'software',   label: 'Logiciel',   align: 'center' },
                { key: 'type',       label: 'Type',       align: 'center' },
                { key: 'indicators', label: 'Comm  Tâches  Obs  Actif', align: 'center' },
                { key: 'requester',  label: 'Demandeur',  align: 'left'   },
                { key: 'source',     label: 'Source',     align: 'center' },
                { key: 'technician', label: 'Technicien', align: 'left'   },
                { key: 'date',       label: 'Date',       align: 'center' },
              ] as const).map(col => {
                const active = localSortKey === col.key;
                const icon = active ? (localSortDir === 'asc' ? ' ↑' : ' ↓') : '';
                return (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{
                      ...thStyle,
                      textAlign: col.align,
                      cursor: 'pointer',
                      userSelect: 'none',
                      color: active ? '#6366f1' : '#64748b',
                      background: active ? '#f0f0ff' : undefined,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label}{icon}
                    {!active && <span style={{ color: '#cbd5e1', marginLeft: 2, fontSize: 10 }}>⇅</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr><td colSpan={15} style={{ textAlign: 'center', padding: 40, color: '#94a3b8' }}>Aucun ticket trouvé</td></tr>
            )}
            {sortedTickets.map((t: any) => {
              const isSelected = selectedIds.has(t.id);
              const inBundle = !!t.bundle;
              return (
                <tr key={t.id}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    cursor: 'pointer',
                    background: isSelected ? '#eef2ff' : t.is_live ? '#f0fdf4' : t.is_vip ? '#fffbeb' : undefined,
                    transition: 'background 0.1s'
                  }}
                  onClick={() => window.location.href = `/tickets/${t.id}`}>

                  {/* Checkbox */}
                  <td style={tdStyle} onClick={e => toggleSelect(t.id, e)}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      style={{ cursor: 'pointer' }}
                    />
                  </td>

                  {/* ID + VIP + Groupe + SLA */}
                  <td style={{ ...tdStyle, fontFamily: 'monospace', fontWeight: 600, color: '#6366f1' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      {t.is_vip && <span title="Ticket VIP" style={{ fontSize: 11 }}>⭐</span>}
                      {inBundle && (
                        <span
                          title={`Groupe : ${t.bundle.name}`}
                          style={{
                            fontSize: 11, cursor: 'default',
                            background: '#e0e7ff', color: '#4f46e5',
                            borderRadius: 4, padding: '1px 4px', fontFamily: 'sans-serif'
                          }}>
                          🔗
                        </span>
                      )}
                      {t.sla_status === 'breached' && <span title="SLA dépassé" style={{ fontSize: 13, color: '#ef4444' }}>⚠️</span>}
                      {t.sla_status === 'warning' && <span title="SLA en alerte" style={{ fontSize: 13, color: '#f59e0b' }}>⚠️</span>}
                      {(() => {
                        const created = t.date_creation ? new Date(t.date_creation) : null;
                        const isNew = created && (Date.now() - created.getTime()) < 15 * 60 * 1000;
                        return isNew ? <span title="Nouveau ticket" style={{ fontSize: 9, fontWeight: 700, color: '#fff', background: '#22c55e', borderRadius: 8, padding: '1px 5px', marginRight: 2 }}>NEW</span> : null;
                      })()}
                      {t.id}
                    </div>
                  </td>

                  {/* Titre + Catégorie */}
                  <td style={{ ...tdStyle, textAlign: 'left', maxWidth: 300 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {t.is_live && (
                        <span style={{
                          flexShrink: 0, fontSize: 10, fontWeight: 800,
                          background: '#22c55e', color: '#fff',
                          borderRadius: 6, padding: '1px 6px', letterSpacing: '0.05em',
                          animation: 'livePulseRow 2s infinite',
                        }}>LIVE</span>
                      )}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    </div>
                    {(t.category_name || t.subcategory_name) && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.category_name && <span>{t.category_name}</span>}
                        {t.category_name && t.subcategory_name && <span> / </span>}
                        {t.subcategory_name && <span>{t.subcategory_name}</span>}
                      </div>
                    )}
                  </td>

                  {/* Statut */}
                  <td style={tdStyle}>
                    <span
                      title={t.status?.id === 4 && t.waiting_reason ? `Motif : ${t.waiting_reason}` : undefined}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '3px 10px', borderRadius: 20,
                        fontSize: 12, fontWeight: 600,
                        background: (STATUS_COLORS[t.status?.id] || '#64748b') + '20',
                        color: STATUS_COLORS[t.status?.id] || '#64748b',
                        cursor: t.status?.id === 4 && t.waiting_reason ? 'help' : 'default',
                      }}>
                      {STATUS_NAMES[t.status?.id] || t.status?.label || 'Inconnu'}
                      {t.status?.id === 4 && t.waiting_reason && (
                        <span style={{ fontSize: 11, opacity: 0.75 }}>💬</span>
                      )}
                    </span>
                  </td>

                  {/* Priorité */}
                  <td style={tdStyle}>
                    <PriorityDots priorityId={t.priority?.id} />
                  </td>

                  {/* Impact */}
                  <td style={tdStyle}>
                    {t.impact?.id ? (
                      <span title={IMPACT_LABELS[t.impact.id]?.label} style={{ fontSize: 15 }}>
                        {IMPACT_LABELS[t.impact.id]?.icon || '—'}
                      </span>
                    ) : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                  </td>

                  {/* Logiciel */}
                  <td style={tdStyle}>
                    {t.software_name ? (
                      <span style={{
                        display: 'inline-block', padding: '3px 10px', borderRadius: 20,
                        fontSize: 12, fontWeight: 500,
                        background: '#e0e7ff',
                        color: '#4f46e5',
                        maxWidth: 150,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }} title={t.software_name}>
                        💾 {t.software_name}
                      </span>
                    ) : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                  </td>

                  {/* Type */}
                  <td style={tdStyle}>
                    <span style={{
                      fontSize: 12,
                      color: String(t.type) === '3' ? '#7c3aed' : '#64748b',
                      fontWeight: String(t.type) === '3' ? 700 : 400,
                    }}>
                      {t.type_label || (String(t.type) === '2' ? 'Demande' : String(t.type) === '3' ? 'Problème' : 'Incident')}
                    </span>
                  </td>

                  {/* Indicateurs compacts */}
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'center' }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 20, height: 20, borderRadius: 10, padding: '0 5px',
                        fontSize: 10, fontWeight: 600,
                        background: (t.followups_count || 0) > 0 ? '#e0f2fe' : '#f1f5f9',
                        color: (t.followups_count || 0) > 0 ? '#0284c7' : '#94a3b8'
                      }} title="Commentaires">
                        💬{t.followups_count || 0}
                      </span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 20, height: 20, borderRadius: 10, padding: '0 5px',
                        fontSize: 10, fontWeight: 600,
                        background: (t.tasks_count || 0) > 0 ? '#fef3c7' : '#f1f5f9',
                        color: (t.tasks_count || 0) > 0 ? '#d97706' : '#94a3b8'
                      }} title="Tâches">
                        ✓{t.tasks_count || 0}
                      </span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 20, height: 20, borderRadius: 10, padding: '0 5px',
                        fontSize: 10, fontWeight: 600,
                        background: (t.observer_count || 0) > 0 ? '#ede9fe' : '#f1f5f9',
                        color: (t.observer_count || 0) > 0 ? '#7c3aed' : '#94a3b8'
                      }} title="Observateurs">
                        👁{t.observer_count || 0}
                      </span>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 20, height: 20, borderRadius: 10, padding: '0 5px',
                        fontSize: 10, fontWeight: 600,
                        background: t.active_days != null && t.active_days > 0 ? '#f0fdf4' : '#f1f5f9',
                        color: t.active_days != null && t.active_days > 0 ? '#16a34a' : '#94a3b8'
                      }} title="Jours actifs">
                        {t.active_days != null
                          ? t.active_days < 1 ? '<1j' : `${Math.round(t.active_days)}j`
                          : '?'}
                      </span>
                    </div>
                  </td>

                  {/* Demandeur */}
                  <td style={{ ...tdStyle, textAlign: 'left', maxWidth: 200 }}>
                    <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.requester_name || 'Anonyme'}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.requester_service || t.requester_email || ''}
                    </div>
                  </td>

                  {/* Source */}
                  <td style={{ ...tdStyle, fontSize: 12, color: '#64748b' }}>
                    {(() => {
                      const src = t.source || '';
                      if (src === 'glpi') return <span style={{ color: '#6366f1', fontWeight: 600 }}>GLPI</span>;
                      if (src === 'email' || src === 'mail') return <span style={{ color: '#16a34a', fontWeight: 600 }}>Email</span>;
                      if (src === 'magapp') return <span style={{ color: '#d946ef', fontWeight: 600 }}>Magapp</span>;
                      if (src === 'hub') return <span style={{ color: '#64748b', fontWeight: 600 }}>Hub</span>;
                      if (src) return <span>{src}</span>;
                      return <span style={{ color: '#94a3b8' }}>—</span>;
                    })()}
                  </td>

                  {/* Technicien */}
                  <td style={{ ...tdStyle, textAlign: 'left', maxWidth: 160 }}>
                    {t.assignee_group_name ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#6366f1', fontWeight: 500 }}>
                        <span style={{ fontSize: 12 }}>👥</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{t.assignee_group_name}</span>
                      </span>
                    ) : t.technician_name ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#0284c7', fontWeight: 500 }}>
                        <span style={{ fontSize: 12 }}>🔧</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{t.technician_name}</span>
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, color: '#94a3b8' }}>—</span>
                    )}
                  </td>

                  {/* Date */}
                  <td style={{ ...tdStyle, fontSize: 12, color: '#64748b' }}>
                    {t.date_creation ? new Date(t.date_creation).toLocaleDateString('fr-FR') : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Barre d'action flottante (sélection) ─────────────────── */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: '#1e293b', color: '#fff', borderRadius: 16,
          padding: '14px 24px', display: 'flex', alignItems: 'center', gap: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)', zIndex: 1000,
          fontSize: 14, fontWeight: 500, userSelect: 'none',
        }}>
          <span style={{ color: '#cbd5e1' }}>
            {selectedIds.size} ticket{selectedIds.size > 1 ? 's' : ''} sélectionné{selectedIds.size > 1 ? 's' : ''}
          </span>
          <div style={{ width: 1, height: 22, background: '#475569' }} />
          {selectedIds.size >= 2 && (
            <button
              onClick={() => setShowGroupModal(true)}
              style={{
                padding: '7px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 6
              }}>
              🔗 Grouper ces {selectedIds.size} tickets
            </button>
          )}
          {isSupervisor && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                padding: '7px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: '#ef4444', color: '#fff', fontWeight: 600, fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 6
              }}>
              🗑️ Supprimer {selectedIds.size > 1 ? `ces ${selectedIds.size} tickets` : 'ce ticket'}
            </button>
          )}
          <button
            onClick={() => setSelectedIds(new Set())}
            style={{
              padding: '7px 14px', borderRadius: 10, border: '1px solid #475569',
              cursor: 'pointer', background: 'transparent', color: '#94a3b8',
              fontSize: 13
            }}>
            Annuler
          </button>
        </div>
      )}

      {/* ── Modal de groupe ───────────────────────────────────────── */}
      {showGroupModal && (
        <GroupModal
          selectedIds={Array.from(selectedIds)}
          onClose={() => setShowGroupModal(false)}
          onCreated={afterGroupCreated}
        />
      )}

      {/* ── Modal de confirmation de suppression ──────────────────── */}
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
        }} onClick={() => !deleting && setShowDeleteConfirm(false)}>
          <div style={{
            background: '#fff', borderRadius: 16, padding: 28, width: 440,
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🗑️</div>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1e293b' }}>
                  Confirmer la suppression
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
                  Cette action est irréversible
                </p>
              </div>
            </div>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', marginBottom: 20 }}>
              <p style={{ margin: 0, fontSize: 14, color: '#dc2626' }}>
                Vous êtes sur le point de supprimer <strong>{selectedIds.size} ticket{selectedIds.size > 1 ? 's' : ''}</strong>.
                Les tickets seront marqués comme <strong>Rejeté</strong>.
              </p>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Array.from(selectedIds).map(id => (
                  <span key={id} style={{ padding: '2px 10px', borderRadius: 20, background: '#fee2e2', color: '#dc2626', fontSize: 12, fontWeight: 600 }}>#{id}</span>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                style={{ padding: '9px 20px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 14 }}>
                Annuler
              </button>
              <button onClick={handleBulkDelete} disabled={deleting}
                style={{
                  padding: '9px 22px', border: 'none', borderRadius: 8,
                  background: deleting ? '#fca5a5' : '#ef4444', color: '#fff',
                  fontWeight: 700, fontSize: 14, cursor: deleting ? 'default' : 'pointer'
                }}>
                {deleting ? 'Suppression...' : `🗑️ Supprimer ${selectedIds.size} ticket${selectedIds.size > 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const thStyle: React.CSSProperties = {
  padding: '12px 16px', textAlign: 'center', fontWeight: 600, fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px'
};
const tdStyle: React.CSSProperties = {
  padding: '12px 16px', textAlign: 'center', verticalAlign: 'middle'
};
