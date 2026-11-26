import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, card, btnGhost, btnPrimary, input } from './ui';

interface AuditRow {
  id: number;
  created_at: string;
  actor_username?: string;
  actor_email?: string;
  actor_name?: string;
  action: string;
  entretien_id?: number | null;
  agent_nom?: string;
  details?: Record<string, unknown> | null;
}

const ACTION_LABELS: Record<string, string> = {
  agent_ajoute: 'Agent·e ajouté à un·e évaluateur·rice',
  evaluateur_change: 'Changement d’évaluateur',
  preparation_enregistree: 'Préparation enregistrée',
  preparation_transmise: 'Préparation transmise',
  crep_observations_brouillon: 'Observations agent·e (brouillon)',
  crep_valide_agent: 'CREP validé par l’agent·e',
  crep_envoye_agent: 'CREP envoyé à l’agent·e',
  impression_crep: 'Impression CREP renseigné',
  impression_crep_vierge: 'Impression CREP vierge',
  crep_manuscrit: 'CREP manuscrit archivé',
  en_tant_que_debut: 'Afficher en tant que : début',
  en_tant_que_fin: 'Afficher en tant que : fin',
  en_tant_que_action: 'Action faite « en tant que »',
  agent_desactive: 'Agent·e désactivé·e',
  agent_reactive: 'Agent·e réactivé·e',
  agent_ajoute_rh: 'Agent·e ajouté·e depuis la RH',
  raz_ep: 'RAZ – remise à zéro',
};

const fmtDate = (v?: string) => {
  if (!v) return '';
  try { return new Date(v).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }); }
  catch { return v; }
};

const EMPTY_FILTERS = { action: '', dateFrom: '', dateTo: '', user: '', q: '' };

export default function Journal() {
  const { token } = useAuth();
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  const load = useCallback(() => {
    setLoading(true); setError(null);
    axios.get('/api/entretiens/audit-logs', {
      headers: { Authorization: `Bearer ${token}` },
      params: { ...filters, page, pageSize },
    })
      .then(r => {
        setItems(Array.isArray(r.data?.items) ? r.data.items : []);
        setTotal(Number(r.data?.total) || 0);
        if (r.data?.page && r.data.page !== page) setPage(r.data.page);
      })
      .catch(e => setError(e.response?.data?.message || 'Impossible de charger le journal.'))
      .finally(() => setLoading(false));
  }, [token, filters, page, pageSize]);

  useEffect(load, [load]);

  const apply = () => { setPage(1); setFilters({ ...draft }); };
  const reset = () => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setPage(1); };

  return (
    <div>
      <div style={{ ...card, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 220px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, marginBottom: 4 }}>Type d’opération</div>
            <select style={{ ...input }} value={draft.action} onChange={e => setDraft(d => ({ ...d, action: e.target.value }))}>
              <option value="">Toutes les opérations</option>
              {Object.entries(ACTION_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div style={{ flex: '0 1 150px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, marginBottom: 4 }}>Du</div>
            <input type="date" style={input} value={draft.dateFrom} onChange={e => setDraft(d => ({ ...d, dateFrom: e.target.value }))} />
          </div>
          <div style={{ flex: '0 1 150px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, marginBottom: 4 }}>Au</div>
            <input type="date" style={input} value={draft.dateTo} onChange={e => setDraft(d => ({ ...d, dateTo: e.target.value }))} />
          </div>
          <div style={{ flex: '1 1 220px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, marginBottom: 4 }}>Utilisateur</div>
            <input style={input} placeholder="Nom, login ou e-mail…" value={draft.user} onChange={e => setDraft(d => ({ ...d, user: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') apply(); }} />
          </div>
          <div style={{ flex: '1 1 220px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.muted, marginBottom: 4 }}>Agent·e / détail</div>
            <input style={input} placeholder="Nom de l’agent·e ou contenu…" value={draft.q} onChange={e => setDraft(d => ({ ...d, q: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') apply(); }} />
          </div>
          <button style={btnPrimary} onClick={apply} disabled={loading}><Search size={14} /> Filtrer</button>
          <button style={btnGhost} onClick={reset} disabled={loading}>Réinitialiser</button>
          <button style={btnGhost} onClick={load} disabled={loading} title="Actualiser">{loading ? <Loader2 size={14} /> : <RefreshCw size={14} />}</button>
        </div>
      </div>

      {error ? <div style={{ ...card, padding: 18, color: COLORS.danger, fontSize: 13 }}>{error}</div> : loading ? (
        <div style={{ ...card, padding: 28, textAlign: 'center', color: '#94a3b8' }}><Loader2 size={20} /></div>
      ) : items.length === 0 ? (
        <div style={{ ...card, padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Aucune opération ne correspond à ces filtres.</div>
      ) : (
        <>
          <div style={{ ...card, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  {['Date', 'Auteur', 'Action', 'Agent·e', 'Détails'].map(h => (
                    <th key={h} style={{ padding: '9px 12px', fontSize: 11.5, color: '#64748b', borderBottom: `1px solid ${COLORS.border}` }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(r => (
                  <tr key={r.id}>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: '#475569', borderBottom: `1px solid ${COLORS.border}`, whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: '#334155', borderBottom: `1px solid ${COLORS.border}` }}>
                      <div style={{ fontWeight: 700 }}>{r.actor_name || r.actor_username || '—'}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.actor_email || r.actor_username || ''}</div>
                    </td>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: '#334155', borderBottom: `1px solid ${COLORS.border}`, fontWeight: 600 }}>{ACTION_LABELS[r.action] || r.action}</td>
                    <td style={{ padding: '9px 12px', fontSize: 12, color: '#334155', borderBottom: `1px solid ${COLORS.border}` }}>{r.agent_nom || (r.entretien_id ? `EP #${r.entretien_id}` : '—')}</td>
                    <td style={{ padding: '9px 12px', fontSize: 11.5, color: '#64748b', borderBottom: `1px solid ${COLORS.border}`, maxWidth: 340 }}>
                      {r.details && Object.keys(r.details).length ? Object.entries(r.details).map(([k, v]) => `${k} : ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 12, color: COLORS.muted }}>{total} opération(s) · page {page} / {pages}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select style={{ ...input, width: 'auto' }} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n} / page</option>)}
              </select>
              <button style={btnGhost} disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={14} /> Précédent</button>
              <button style={btnGhost} disabled={page >= pages || loading} onClick={() => setPage(p => Math.min(pages, p + 1))}>Suivant <ChevronRight size={14} /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
