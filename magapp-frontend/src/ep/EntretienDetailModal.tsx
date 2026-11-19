import { useEffect, useState } from 'react';
import axios from 'axios';
import { X, Loader2, CalendarDays, UserCheck, ExternalLink, ClipboardList, FileSignature, AlertCircle } from 'lucide-react';
import { useAuth } from './useAuth';
import type { Entretien } from './types';
import { EVAL_STATUTS, PREP_STATUTS, STATUTS, formatDateHeure, nomComplet } from './types';
import PreparationView from './PreparationView';
import CrepForm from './CrepForm';
import { Avatar, Badge, COLORS, card } from './ui';

export default function EntretienDetailModal({ entretienId, onClose, onSaved }: {
  entretienId: number;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [entretien, setEntretien] = useState<Entretien | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'preparation' | 'crep'>('preparation');

  useEffect(() => {
    if (!entretienId) return;
    setLoading(true); setError(null);
    axios.get(`/api/entretiens/${entretienId}`, { headers })
      .then(r => setEntretien(r.data))
      .catch(e => setError(e.response?.data?.message || 'Impossible de charger l’entretien'))
      .finally(() => setLoading(false));
  }, [entretienId, token]);

  const statut = entretien ? (STATUTS[entretien.statut] || STATUTS.a_planifier) : null;
  const prep = entretien ? (PREP_STATUTS[entretien.preparation_statut] || PREP_STATUTS.non_commencee) : null;
  const evaluation = entretien ? (EVAL_STATUTS[entretien.evaluation_statut] || EVAL_STATUTS.non_commencee) : null;
  const canEdit = entretien?.access?.canEditEvaluation ?? false;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2000,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '28px 16px', overflowY: 'auto',
    }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...card, width: '100%', maxWidth: 1000, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: `1px solid ${COLORS.border}`, gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
            <Avatar name={entretien ? nomComplet(entretien) : '?'} size={36} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: COLORS.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {entretien ? nomComplet(entretien) : 'Chargement…'}
              </div>
              <div style={{ fontSize: 11.5, color: COLORS.muted }}>
                {entretien ? [entretien.agent_grade, entretien.service, entretien.direction].filter(Boolean).join(' · ') : ''}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: '#f1f5f9', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={17} />
          </button>
        </div>

        <div style={{ padding: '14px 18px', maxHeight: 'calc(100vh - 150px)', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40, color: '#94a3b8' }}><Loader2 size={22} /></div>
          ) : error && !entretien ? (
            <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: 12, fontSize: 13 }}>{error}</div>
          ) : entretien ? (
            <>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {statut && <Badge {...statut} />}
                {prep && <Badge {...prep} />}
                {evaluation && <Badge {...evaluation} />}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#475569' }}>
                  <CalendarDays size={15} color={COLORS.primary} />
                  {entretien.date_entretien ? formatDateHeure(entretien.date_entretien) : 'Date à définir'}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: '#475569' }}>
                  <UserCheck size={15} color={COLORS.primary} />
                  Évaluateur : {entretien.evaluator_nom || entretien.evaluator_email || 'à définir'}
                </div>
                {entretien.outlook_web_link && (
                  <a href={entretien.outlook_web_link} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: COLORS.primary, fontWeight: 600, textDecoration: 'none' }}>
                    <ExternalLink size={14} /> Invitation Outlook
                  </a>
                )}
              </div>

              {entretien.outlook_status === 'erreur' && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: '8px 11px', fontSize: 12, marginBottom: 12 }}>
                  <AlertCircle size={13} style={{ verticalAlign: -2, marginRight: 5 }} /> {entretien.outlook_error}
                </div>
              )}

              <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 16 }}>
                {[
                  { key: 'preparation', label: 'Préparation de l’agent', icon: <ClipboardList size={14} /> },
                  { key: 'crep', label: 'Compte rendu d’entretien (CREP)', icon: <FileSignature size={14} /> },
                ].map(t => (
                  <button key={t.key} onClick={() => setTab(t.key as any)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 13px',
                      border: 'none', borderBottom: `2px solid ${tab === t.key ? COLORS.primary : 'transparent'}`,
                      background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                      color: tab === t.key ? COLORS.primary : '#64748b',
                    }}>{t.icon}{t.label}</button>
                ))}
              </div>

              {tab === 'preparation' ? (
                <PreparationView entretien={entretien} />
              ) : (
                <CrepForm entretien={entretien} canEdit={canEdit}
                  onSaved={(e) => { setEntretien(prev => ({ ...(prev as Entretien), ...e, access: (e as any).access || prev?.access })); onSaved?.(); }} />
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
