import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from './useAuth';
import { COLORS, card, btnGhost } from './ui';

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
  agent_ajoute: 'Agent ajouté à un valideur',
  evaluateur_change: 'Changement d’évaluateur',
  preparation_enregistree: 'Préparation enregistrée',
  preparation_transmise: 'Préparation transmise',
  crep_observations_brouillon: 'Observations agent (brouillon)',
  crep_valide_agent: 'CREP validé par l’agent',
  crep_envoye_agent: 'CREP envoyé à l’agent',
  impression_crep: 'Impression CREP renseigné',
  impression_crep_vierge: 'Impression CREP vierge',
};

const fmtDate = (v?: string) => {
  if (!v) return '';
  try { return new Date(v).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'short', timeStyle: 'short' }); }
  catch { return v; }
};

export default function Journal() {
  const { token } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    axios.get('/api/entretiens/audit-logs', { params: { limit: 500 }, headers: { Authorization: `Bearer ${token}` } })
      .then(r => setRows(Array.isArray(r.data) ? r.data : []))
      .catch(e => setError(e.response?.data?.message || 'Impossible de charger le journal.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(load, [load]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12.5, color: COLORS.muted, maxWidth: 720 }}>
          Journal des changements du module : ajout d’agents, changements d’évaluateur, préparation et compte rendu. Les 500 dernières opérations sont conservées ici.
        </div>
        <button style={btnGhost} onClick={load} disabled={loading}>
          {loading ? <Loader2 size={14} /> : <RefreshCw size={14} />} Actualiser
        </button>
      </div>

      {error ? <div style={{ ...card, padding: 18, color: COLORS.danger, fontSize: 13 }}>{error}</div> : loading ? (
        <div style={{ ...card, padding: 28, textAlign: 'center', color: '#94a3b8' }}><Loader2 size={20} /></div>
      ) : rows.length === 0 ? (
        <div style={{ ...card, padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>Aucune opération enregistrée pour le moment.</div>
      ) : (
        <div style={{ ...card, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                <th style={{ padding: '9px 12px', fontSize: 11.5, color: '#64748b', borderBottom: `1px solid ${COLORS.border}` }}>Date</th>
                <th style={{ padding: '9px 12px', fontSize: 11.5, color: '#64748b', borderBottom: `1px solid ${COLORS.border}` }}>Auteur</th>
                <th style={{ padding: '9px 12px', fontSize: 11.5, color: '#64748b', borderBottom: `1px solid ${COLORS.border}` }}>Action</th>
                <th style={{ padding: '9px 12px', fontSize: 11.5, color: '#64748b', borderBottom: `1px solid ${COLORS.border}` }}>Agent</th>
                <th style={{ padding: '9px 12px', fontSize: 11.5, color: '#64748b', borderBottom: `1px solid ${COLORS.border}` }}>Détails</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
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
      )}
    </div>
  );
}
