import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Search, Users, ClipboardCheck, CalendarClock, TrendingUp, Eye, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Campaign, Entretien, Stats } from './types';
import { PREP_STATUTS, STATUTS, formatDateCourte, nomComplet, preparationProgress } from './types';
import EntretienDetailModal from './EntretienDetailModal';
import PlanningModal from './PlanningModal';
import { Avatar, Badge, COLORS, EmptyState, KpiCard, ProgressBar, Td, Th, btnGhost, btnPrimary, card, input } from './ui';

export default function Evaluations({ onChanged }: { onChanged?: () => void }) {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Entretien[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('');
  const [onlyTodo, setOnlyTodo] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [planning, setPlanning] = useState<Entretien | null>(null);

  const load = useCallback(() => {
    setLoading(true); setError(null);
    axios.get('/api/entretiens/evaluateur', { headers })
      .then(r => {
        setCampaign(r.data.campaign || null);
        setStats(r.data.stats || null);
        setItems(Array.isArray(r.data.items) ? r.data.items : []);
      })
      .catch(e => setError(e.response?.data?.message || 'Impossible de charger vos entretiens'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(load, [load]);

  const todoCount = useMemo(() => items.filter(e => !['realise', 'cloture'].includes(e.statut)).length, [items]);

  const filtered = useMemo(() => items.filter(e => {
    if (onlyTodo && ['realise', 'cloture'].includes(e.statut)) return false;
    if (statut && e.statut !== statut) return false;
    if (q) {
      const hay = `${nomComplet(e)} ${e.agent_email || ''} ${e.service || ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [items, q, statut, onlyTodo]);
  const preparationMode = campaign?.statut === 'preparation';

  return (
    <div>
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
          <KpiCard label="Mes EP" value={stats.total} color={COLORS.primary} sub={campaign ? `Campagne ${campaign.annee}` : undefined} />
          <KpiCard label="Planifiés" value={stats.planifies || 0} color="#2563eb" sub={`${stats.total ? Math.round(((stats.planifies || 0) / stats.total) * 100) : 0}% des entretiens`} />
          <KpiCard label="Préparations reçues" value={stats.preparations_recues} color="#0891b2" sub="Agents prêts" />
          <KpiCard label="À venir sous 7 jours" value={stats.a_venir_7j} color="#7c3aed" sub="Prochaines échéances" />
          <KpiCard label="Réalisés" value={stats.realises} color={COLORS.success} sub={`${stats.taux_realisation}% de réalisation`} />
          <KpiCard label="En retard" value={stats.en_retard} color={stats.en_retard > 0 ? COLORS.danger : '#94a3b8'} sub="Date dépassée" />
          {preparationMode && <KpiCard label="Sans préparateur" value={stats.total - stats.preparations_recues} color={COLORS.warning} sub="Préparation non transmise" />}
        </div>
      )}

      <div style={{ ...card, padding: 14, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
          <input style={{ ...input, paddingLeft: 32 }} placeholder="Rechercher un agent, un service…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select style={{ ...input, width: 'auto', minWidth: 170 }} value={statut} onChange={e => setStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div style={{ display: 'inline-flex', border: `1px solid ${COLORS.border}`, borderRadius: 8, overflow: 'hidden' }}>
          {[{ k: true, l: `À faire (${todoCount})` }, { k: false, l: `Tous (${items.length})` }].map(o => (
            <button key={String(o.k)} type="button" onClick={() => setOnlyTodo(o.k)}
              style={{ padding: '8px 13px', border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                background: onlyTodo === o.k ? COLORS.primary : '#fff', color: onlyTodo === o.k ? '#fff' : '#475569' }}>{o.l}</button>
          ))}
        </div>
        <button style={btnGhost} onClick={load} disabled={loading}>Actualiser</button>
      </div>

      {loading ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
      ) : error ? (
        <div style={{ ...card, padding: 20, color: COLORS.danger, fontSize: 13 }}>{error}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<Users size={40} />} title={onlyTodo && items.length > 0 ? 'Aucun EP à faire' : 'Aucun entretien à évaluer'}
          text={items.length === 0 ? "Aucun entretien professionnel ne vous est encore attribué pour cette campagne." : onlyTodo ? "Tous vos entretiens sont réalisés. Basculez sur « Tous » pour les consulter." : "Aucun entretien ne correspond à vos filtres."} />
      ) : (
        <div style={{ ...card, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
            <thead>
              <tr>
                <Th>Agent</Th>
                <Th>Date de l’entretien</Th>
                <Th>Statut</Th>
                <Th>Préparation</Th>
                <Th>Compte rendu</Th>
                <Th style={{ textAlign: 'right' }}>Action</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const st = STATUTS[e.statut] || STATUTS.a_planifier;
                const prep = PREP_STATUTS[e.preparation_statut] || PREP_STATUTS.non_commencee;
                const progress = preparationProgress(e);
                return (
                  <tr key={e.id} style={{ background: e.statut === 'realise' || e.statut === 'cloture' ? '#fafdfb' : '#fff' }}>
                    <Td>
                      <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                        <Avatar name={nomComplet(e)} size={30} />
                        <div>
                          <div style={{ fontWeight: 700, color: COLORS.text }}>{nomComplet(e)}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{[e.service, e.direction].filter(Boolean).join(' · ') || e.agent_email}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: e.date_entretien ? '#334155' : '#94a3b8' }}>
                        <CalendarClock size={13} /> {formatDateCourte(e.date_entretien)}
                      </div>
                    </Td>
                    <Td><Badge {...st} /></Td>
                    <Td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 130 }}>
                        <Badge {...prep} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ flex: 1, minWidth: 60 }}><ProgressBar value={progress} color={progress === 100 ? COLORS.success : COLORS.primary} /></div>
                          <span style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 700 }}>{progress}%</span>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {e.evaluation_statut === 'soumis'
                        ? <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11.5, color: COLORS.success, fontWeight: 700 }}><ClipboardCheck size={13} /> Validé</span>
                        : e.evaluation_statut === 'brouillon'
                          ? <span style={{ fontSize: 11.5, color: COLORS.warning, fontWeight: 700 }}>Brouillon</span>
                          : <span style={{ fontSize: 11.5, color: '#94a3b8' }}>À faire</span>}
                    </Td>
                    <Td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {!['realise', 'cloture'].includes(e.statut) && (
                          <button style={e.date_entretien ? btnGhost : btnPrimary} onClick={() => setPlanning(e)}>
                            <CalendarClock size={13} /> {e.date_entretien ? 'Modifier le RDV' : 'Planifier'}
                          </button>
                        )}
                        <button style={btnGhost} onClick={() => setOpenId(e.id)}>
                          <Eye size={13} /> Ouvrir
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {stats && stats.total > 0 && stats.total === stats.realises && (
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 14, color: COLORS.success, fontSize: 12.5, fontWeight: 700 }}>
          <TrendingUp size={15} /> Tous les entretiens de votre périmètre sont réalisés.
        </div>
      )}
      {stats && stats.en_retard > 0 && (
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 14, color: COLORS.warning, fontSize: 12.5, fontWeight: 600 }}>
          <AlertTriangle size={15} /> {stats.en_retard} entretien(s) ont dépassé leur date prévue.
        </div>
      )}

      {planning && (
        <PlanningModal entretien={planning} onClose={() => setPlanning(null)} onSaved={() => { load(); onChanged?.(); }} />
      )}

      {openId && (
        <EntretienDetailModal entretienId={openId} onClose={() => setOpenId(null)} onSaved={() => { load(); onChanged?.(); }} />
      )}
    </div>
  );
}
