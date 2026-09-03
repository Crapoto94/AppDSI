import React, { useState, useEffect, useMemo } from 'react';
import { Mail, Search, ExternalLink, Users } from 'lucide-react';
import Header from '../components/Header';
import { useAuth } from '../contexts/AuthContext';

interface Membre { displayName: string; email: string; }

interface SharedMailbox {
  id: number;
  nom: string;
  type: string | null;
  usage_type: string | null;
  responsable_display: string | null;
  responsable_email: string | null;
  provisoire: boolean;
  date_fin: string | null;
  membres: Membre[];
  justification: string | null;
  ticket_id: number | null;
  ticket_title: string | null;
  requested_by_username: string;
  requested_by_name: string;
  arbitrage_decision: 'positif' | 'negatif' | null;
  arbitrage_comment: string | null;
  created_at: string;
}

function ArbitrageBadge({ decision }: { decision: 'positif' | 'negatif' | null }) {
  if (decision === 'positif') {
    return <span style={{ padding: '3px 10px', borderRadius: 999, background: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>✅ Favorable</span>;
  }
  if (decision === 'negatif') {
    return <span style={{ padding: '3px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>❌ Défavorable</span>;
  }
  return <span style={{ padding: '3px 10px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>⏳ En attente</span>;
}

export default function BoitesPartagees() {
  const { token } = useAuth();
  const [boxes, setBoxes] = useState<SharedMailbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'positif' | 'negatif'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch('/api/mailboxes', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setBoxes(Array.isArray(d) ? d : []))
      .catch(() => setBoxes([]))
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return boxes.filter((b) => {
      if (statusFilter === 'pending' && b.arbitrage_decision) return false;
      if (statusFilter === 'positif' && b.arbitrage_decision !== 'positif') return false;
      if (statusFilter === 'negatif' && b.arbitrage_decision !== 'negatif') return false;
      if (!q) return true;
      return [b.nom, b.responsable_display, b.responsable_email, b.requested_by_name, ...(b.membres || []).map((m) => m.displayName)]
        .filter(Boolean).some((s) => String(s).toLowerCase().includes(q));
    });
  }, [boxes, search, statusFilter]);

  const counts = useMemo(() => ({
    total: boxes.length,
    pending: boxes.filter((b) => !b.arbitrage_decision).length,
    positif: boxes.filter((b) => b.arbitrage_decision === 'positif').length,
    negatif: boxes.filter((b) => b.arbitrage_decision === 'negatif').length,
  }), [boxes]);

  return (
    <div>
      <Header />
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '24px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
            <Mail size={22} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#1e293b' }}>Boîtes mail partagées</h1>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#64748b' }}>
              {counts.total} demande{counts.total > 1 ? 's' : ''} — {counts.pending} en attente, {counts.positif} favorable{counts.positif > 1 ? 's' : ''}, {counts.negatif} défavorable{counts.negatif > 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une boîte, un responsable, un agent…"
              style={{ width: '100%', padding: '8px 10px 8px 30px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }}
            />
          </div>
          {[
            { v: 'all', label: 'Toutes' },
            { v: 'pending', label: '⏳ En attente' },
            { v: 'positif', label: '✅ Favorables' },
            { v: 'negatif', label: '❌ Défavorables' },
          ].map((opt) => (
            <button
              key={opt.v}
              onClick={() => setStatusFilter(opt.v as typeof statusFilter)}
              style={{
                padding: '7px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                border: statusFilter === opt.v ? '1px solid #93c5fd' : '1px solid #e2e8f0',
                background: statusFilter === opt.v ? '#eff6ff' : 'white',
                color: statusFilter === opt.v ? '#1d4ed8' : '#475569',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Chargement…</div>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'white', border: '1.5px dashed #e2e8f0', borderRadius: 12, padding: 50, textAlign: 'center', color: '#94a3b8' }}>
            <Mail size={36} style={{ margin: '0 auto 10px', opacity: 0.4 }} />
            <p style={{ margin: 0, fontWeight: 600 }}>Aucune boîte mail partagée trouvée.</p>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Boîte</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Responsable</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Agents</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Demandée par</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Ticket</th>
                  <th style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Arbitrage</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => {
                  const expanded = expandedId === b.id;
                  return (
                    <React.Fragment key={b.id}>
                      <tr
                        onClick={() => setExpandedId(expanded ? null : b.id)}
                        style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#fafbfc')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                      >
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ fontWeight: 700, color: '#1e293b' }}>{b.nom}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            {b.type || '—'}{b.usage_type ? ` · ${b.usage_type}` : ''}{b.provisoire ? ' · Provisoire' : ''}
                            {b.provisoire && b.date_fin ? ` (jusqu'au ${new Date(b.date_fin).toLocaleDateString('fr-FR')})` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ color: '#1e293b' }}>{b.responsable_display || '—'}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{b.responsable_email || ''}</div>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#475569' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Users size={12} /> {(b.membres || []).length}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#475569' }}>
                          {b.requested_by_name}
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{new Date(b.created_at).toLocaleDateString('fr-FR')}</div>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {b.ticket_id ? (
                            <a
                              href={`/tickets/${b.ticket_id}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#2563eb', textDecoration: 'none', fontWeight: 600 }}
                            >
                              #{b.ticket_id} <ExternalLink size={11} />
                            </a>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <ArbitrageBadge decision={b.arbitrage_decision} />
                        </td>
                      </tr>
                      {expanded && (
                        <tr style={{ background: '#fafbfc' }}>
                          <td colSpan={6} style={{ padding: '10px 14px 16px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>Agents ayant accès</div>
                                {(b.membres || []).length === 0 ? (
                                  <div style={{ fontSize: 12, color: '#94a3b8' }}>Aucun</div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    {b.membres.map((m, i) => (
                                      <div key={i} style={{ fontSize: 12, color: '#1e293b' }}>
                                        {m.displayName} <span style={{ color: '#94a3b8' }}>({m.email})</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>Justification</div>
                                <div style={{ fontSize: 12, color: '#1e293b', whiteSpace: 'pre-wrap', marginBottom: 10 }}>{b.justification || '—'}</div>
                                {b.arbitrage_comment && (
                                  <>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', marginBottom: 6 }}>
                                      Commentaire d'arbitrage
                                    </div>
                                    <div style={{
                                      fontSize: 12, padding: '6px 10px', borderRadius: 6,
                                      color: b.arbitrage_decision === 'positif' ? '#166534' : '#991b1b',
                                      background: b.arbitrage_decision === 'positif' ? '#f0fdf4' : '#fef2f2',
                                      border: `1px solid ${b.arbitrage_decision === 'positif' ? '#bbf7d0' : '#fecaca'}`,
                                    }}>
                                      {b.arbitrage_comment}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
