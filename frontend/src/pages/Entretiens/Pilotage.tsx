import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Plus, Search, RefreshCw, Pencil, Trash2, Send, AlertTriangle,
  LayoutDashboard, CalendarClock, Download, BellRing, CheckCircle2, Users, MailWarning, Eye,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Campaign, Entretien, Stats } from './types';
import { PREP_STATUTS, STATUTS, crepMeta, formatDateCourte, nomComplet } from './types';
import AdminEntretienModal from './AdminEntretienModal';
import EntretienDetailModal from './EntretienDetailModal';
import AgentSearch from '../../components/AgentSearch';
import type { AgentOption } from '../../components/AgentSearch';
import { Avatar, Badge, COLORS, EmptyState, KpiCard, Td, Th, btnDanger, btnGhost, btnPrimary, card, input } from './ui';

interface AgentAProgrammer {
  username: string; email: string; matricule: string; nom: string; prenom: string;
  direction: string; service: string; poste: string;
}
interface StatutSlice { key: string; label: string; color: string; value: number }
interface ServiceSlice { label: string; value: number }

const STATUT_ORDER = ['a_planifier', 'planifie', 'preparation_recue', 'realise', 'cloture'];

export default function Pilotage({ onChanged }: { onChanged?: () => void }) {
  const { token } = useAuth();
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState<number | ''>('');
  const [items, setItems] = useState<Entretien[]>([]);
  const [aProgrammer, setAProgrammer] = useState<AgentAProgrammer[]>([]);
  const [prefill, setPrefill] = useState<AgentAProgrammer | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [parStatut, setParStatut] = useState<StatutSlice[]>([]);
  const [parService, setParService] = useState<ServiceSlice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('');
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Entretien | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [dsiOptions, setDsiOptions] = useState<Array<AgentOption & { raw: AgentAProgrammer }>>([]);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [relancing, setRelancing] = useState(false);
  const [page, setPage] = useState(1);

  const currentCampaign = campaigns.find(c => c.id === campaignId) || null;

  const loadCampaigns = useCallback(async () => {
    try {
      const r = await axios.get('/api/entretiens/campaigns', { headers });
      const list: Campaign[] = Array.isArray(r.data) ? r.data : [];
      setCampaigns(list);
      setCampaignId(prev => prev || list[0]?.id || '');
    } catch { /* ignore */ }
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [listRes, statsRes] = await Promise.all([
        axios.get('/api/entretiens', { headers, params: { campaign_id: campaignId || undefined } }),
        axios.get('/api/entretiens/stats', { headers, params: { campaign_id: campaignId || undefined } }),
      ]);
      setItems(Array.isArray(listRes.data.items) ? listRes.data.items : []);
      setAProgrammer(Array.isArray(listRes.data.a_programmer) ? listRes.data.a_programmer : []);
      setStats(listRes.data.stats || statsRes.data.stats || null);
      setParStatut(Array.isArray(statsRes.data.par_statut) ? statsRes.data.par_statut : []);
      setParService(Array.isArray(statsRes.data.par_service) ? statsRes.data.par_service : []);
    } catch (e: any) {
      setError(e.response?.data?.message || 'Impossible de charger les entretiens');
    } finally {
      setLoading(false);
    }
  }, [token, campaignId]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  // Évaluateurs possibles : agents du calendrier DSI (même liste que la modale).
  useEffect(() => {
    axios.get('/api/entretiens/directory', { headers })
      .then(r => {
        const list: AgentAProgrammer[] = Array.isArray(r.data?.agents) ? r.data.agents : [];
        setDsiOptions(list.map(a => ({ username: a.username, displayName: `${a.prenom} ${a.nom}`.trim(), email: a.email, service: a.service, raw: a })));
      })
      .catch(() => setDsiOptions([]));
  }, [token]);

  /** Désigne l'évaluateur d'un agent (crée l'entretien s'il n'existe pas encore) : l'évaluateur prendra lui-même son rendez-vous. */
  const assignEvaluator = async (target: { entretien?: Entretien; agent?: AgentAProgrammer }, ev: AgentOption & { raw: AgentAProgrammer }) => {
    const key = target.entretien ? `e${target.entretien.id}` : `a${target.agent?.username}`;
    setAssigning(key);
    const evaluator = { evaluator_username: ev.raw.username, evaluator_email: ev.raw.email, evaluator_nom: `${ev.raw.prenom} ${ev.raw.nom}`.trim() };
    try {
      if (target.entretien) {
        await axios.put(`/api/entretiens/${target.entretien.id}`, evaluator, { headers });
      } else if (target.agent) {
        const a = target.agent;
        await axios.post('/api/entretiens', {
          campaign_id: campaignId || undefined,
          agent_username: a.username, agent_email: a.email, agent_nom: a.nom, agent_prenom: a.prenom,
          direction: a.direction, service: a.service, poste: a.poste, ...evaluator,
        }, { headers });
      }
      setToast({ ok: true, text: `Évaluateur désigné : ${evaluator.evaluator_nom}. Il peut maintenant planifier l’entretien depuis « Mes EP ».` });
      load(); onChanged?.();
    } catch (err: any) {
      setToast({ ok: false, text: err.response?.data?.message || 'Désignation impossible' });
    } finally { setAssigning(null); }
  };
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => items.filter(e => {
    if (statut && e.statut !== statut) return false;
    if (q) {
      const hay = `${nomComplet(e)} ${e.agent_email || ''} ${e.evaluator_nom || ''} ${e.evaluator_email || ''} ${e.service || ''} ${e.direction || ''}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [items, q, statut]);
  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => { setPage(1); }, [q, statut, campaignId]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const programmerFiltered = useMemo(() => aProgrammer.filter(a => {
    if (statut && statut !== 'a_planifier') return false;
    if (q) {
      const hay = `${a.nom} ${a.prenom} ${a.email} ${a.service} ${a.direction}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }), [aProgrammer, q, statut]);

  const remove = async (e: Entretien) => {
    if (!window.confirm(`Supprimer l’entretien de ${nomComplet(e)} ? L’invitation Outlook sera annulée.`)) return;
    setBusyId(e.id);
    try {
      await axios.delete(`/api/entretiens/${e.id}`, { headers });
      setToast({ ok: true, text: 'Entretien supprimé.' });
      load(); onChanged?.();
    } catch (err: any) {
      setToast({ ok: false, text: err.response?.data?.message || 'Suppression impossible' });
    } finally { setBusyId(null); }
  };

  const resync = async (e: Entretien) => {
    setBusyId(e.id);
    try {
      const r = await axios.post(`/api/entretiens/${e.id}/outlook`, {}, { headers });
      const o = r.data.outlook;
      setToast(o?.ok
        ? { ok: true, text: o.updated ? 'Invitation Outlook mise à jour.' : 'Invitation Outlook envoyée.' }
        : { ok: false, text: o?.error || 'Envoi Outlook impossible' });
      load();
    } catch (err: any) {
      setToast({ ok: false, text: err.response?.data?.message || 'Envoi Outlook impossible' });
    } finally { setBusyId(null); }
  };

  const exportXlsx = async () => {
    try {
      const r = await axios.get('/api/entretiens/export.xlsx', { headers, params: { campaign_id: campaignId || undefined }, responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a');
      a.href = url; a.download = `Entretiens-professionnels-${currentCampaign?.annee || ''}.xlsx`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch { setToast({ ok: false, text: 'Export impossible' }); }
  };

  const sendRelances = async () => {
    setRelancing(true);
    try {
      const dry = await axios.post('/api/entretiens/relances/run', { dry_run: true }, { headers });
      const n = (dry.data.agentPreparation || 0) + (dry.data.agentValidation || 0) + (dry.data.evaluateurs || 0);
      if (n === 0) { setToast({ ok: true, text: 'Aucune relance à envoyer pour le moment (chaque personne n’est relancée qu’à intervalle régulier).' }); return; }
      const lines = (dry.data.details || []).slice(0, 15).join('\n');
      const more = (dry.data.details || []).length > 15 ? '\n…' : '';
      if (!window.confirm(`${n} relance(s) à envoyer :\n\n${lines}${more}\n\nEnvoyer maintenant ?`)) return;
      const r = await axios.post('/api/entretiens/relances/run', {}, { headers });
      setToast({ ok: !r.data.erreurs, text: `${(r.data.agentPreparation || 0) + (r.data.agentValidation || 0) + (r.data.evaluateurs || 0)} relance(s) envoyée(s)${r.data.erreurs ? `, ${r.data.erreurs} en erreur` : ''}.` });
    } catch (e: any) {
      setToast({ ok: false, text: e.response?.data?.message || 'Relances impossibles' });
    } finally { setRelancing(false); }
  };

  const total = stats?.total || 0;

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700, color: COLORS.text }}>
          <LayoutDashboard size={17} color={COLORS.primary} /> Pilotage de la campagne
        </div>
        <div style={{ flex: 1 }} />
        <select style={{ ...input, width: 'auto', minWidth: 190 }} value={campaignId} onChange={e => setCampaignId(e.target.value ? Number(e.target.value) : '')}>
          {campaigns.length === 0 && <option value="">Aucune campagne</option>}
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.libelle || `Campagne ${c.annee}`}</option>)}
        </select>
        <button style={btnGhost} onClick={exportXlsx} disabled={!currentCampaign} title="Exporter le suivi de la campagne au format Excel"><Download size={14} /> Export Excel</button>
        <button style={btnGhost} onClick={sendRelances} disabled={relancing} title="Relancer les agents et évaluateurs en retard"><BellRing size={14} /> {relancing ? 'Relances…' : 'Relances'}</button>
        <button style={btnPrimary} onClick={() => { setEditing(null); setPrefill(null); setModalOpen(true); }} disabled={!currentCampaign}>
          <Plus size={15} /> Programmer un entretien
        </button>
      </div>

      {toast && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between',
          background: toast.ok ? '#f0fdf4' : '#fffbeb',
          border: `1px solid ${toast.ok ? '#bbf7d0' : '#fde68a'}`,
          color: toast.ok ? '#166534' : '#92400e',
          borderRadius: 9, padding: '9px 12px', fontSize: 12.5, marginBottom: 14,
        }}>
          <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}>
            {toast.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {toast.text}
          </span>
          <button onClick={() => setToast(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', fontSize: 12, fontWeight: 700 }}>Fermer</button>
        </div>
      )}

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 10, marginBottom: 18 }}>
          <KpiCard label="Entretiens de la campagne" value={total} color={COLORS.primary} sub={currentCampaign?.libelle || undefined} />
          <KpiCard label="Planifiés" value={stats.planifies} color="#2563eb" sub={`${total ? Math.round((stats.planifies / total) * 100) : 0}% · ${stats.a_planifier} à planifier`} />
          <KpiCard label="Préparations reçues" value={stats.preparations_recues} color="#0891b2" sub={total ? `${Math.round((stats.preparations_recues / total) * 100)}% des agents` : undefined} />
          <KpiCard label="Réalisés" value={stats.realises} color={COLORS.success} sub={`${stats.taux_realisation}% de réalisation`} />
          <KpiCard label="À venir sous 7 jours" value={stats.a_venir_7j} color="#7c3aed" sub="Échéances proches" />
          <KpiCard label="En retard" value={stats.en_retard} color={stats.en_retard ? COLORS.danger : '#94a3b8'} sub="Date dépassée" />
          <KpiCard label="Sans évaluateur" value={stats.sans_evaluateur} color={stats.sans_evaluateur ? COLORS.warning : '#94a3b8'} sub="À compléter" />
          <KpiCard label="Invitations en erreur" value={stats.outlook_erreurs} color={stats.outlook_erreurs ? COLORS.danger : '#94a3b8'} sub="Outlook" />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: COLORS.text, marginBottom: 12 }}>Répartition par statut</div>
          {total === 0 ? (
            <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Aucun entretien enregistré pour cette campagne.</div>
          ) : (
            <>
              <div style={{ display: 'flex', height: 16, borderRadius: 999, overflow: 'hidden', background: '#f1f5f9', marginBottom: 12 }}>
                {STATUT_ORDER.map(key => {
                  const slice = parStatut.find(s => s.key === key);
                  const v = slice?.value || 0;
                  if (!v) return null;
                  return (
                    <div key={key} title={`${slice?.label || key} : ${v}`}
                      style={{ width: `${(v / total) * 100}%`, background: slice?.color || '#94a3b8' }} />
                  );
                })}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {STATUT_ORDER.map(key => {
                  const slice = parStatut.find(s => s.key === key);
                  const meta = STATUTS[key] || { label: key, color: '#94a3b8', bg: '#f1f5f9' };
                  const v = slice?.value || 0;
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: meta.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, color: '#475569' }}>{meta.label}</span>
                      <span style={{ fontWeight: 700, color: '#334155' }}>{v}</span>
                      <span style={{ color: '#94a3b8', width: 42, textAlign: 'right' }}>{total ? Math.round((v / total) * 100) : 0}%</span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div style={{ ...card, padding: 16 }}>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13, fontWeight: 800, color: COLORS.text, marginBottom: 12 }}>
            <Users size={15} color={COLORS.primary} /> Entretiens par service
          </div>
          {parService.length === 0 ? (
            <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Aucune donnée.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {parService.map(s => (
                <div key={s.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#475569', marginBottom: 3 }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80%' }}>{s.label}</span>
                    <strong>{s.value}</strong>
                  </div>
                  <div style={{ height: 6, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{ width: `${(s.value / (parService[0]?.value || 1)) * 100}%`, height: '100%', background: '#6366f1', borderRadius: 999 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {currentCampaign?.date_limite_ep && (
        <div style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12, color: '#475569', background: '#f8fafc', border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: '9px 12px', marginBottom: 14 }}>
          <CalendarClock size={14} color={COLORS.primary} />
          Date limite des entretiens : <strong>{currentCampaign.date_limite_ep.split('-').reverse().join('/')}</strong>
          {currentCampaign.date_ouverture && <span style={{ color: '#94a3b8' }}>· ouverture le {currentCampaign.date_ouverture.split('-').reverse().join('/')}</span>}
        </div>
      )}

      <div style={{ ...card, padding: 14, marginBottom: 12, display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
          <input style={{ ...input, paddingLeft: 32 }} placeholder="Rechercher un agent, un évaluateur, un service…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select style={{ ...input, width: 'auto', minWidth: 165 }} value={statut} onChange={e => setStatut(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button style={btnGhost} onClick={load} disabled={loading}><RefreshCw size={14} /> Actualiser</button>
        <span style={{ fontSize: 11.5, color: '#94a3b8' }}>{filtered.length + programmerFiltered.length} / {items.length + aProgrammer.length}</span>
      </div>

      {loading ? (
        <div style={{ ...card, padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
      ) : error ? (
        <div style={{ ...card, padding: 20, color: COLORS.danger, fontSize: 13 }}>{error}</div>
      ) : filtered.length === 0 && programmerFiltered.length === 0 ? (
        <EmptyState
          icon={<LayoutDashboard size={40} />}
          title={items.length + aProgrammer.length === 0 ? 'Aucun entretien dans cette campagne' : 'Aucun résultat'}
          text={items.length + aProgrammer.length === 0
            ? 'Programmez le premier entretien : l’agent et son encadrant recevront automatiquement une invitation dans leur calendrier Outlook.'
            : 'Aucun entretien ne correspond à vos critères de recherche.'}
          action={items.length + aProgrammer.length === 0 && currentCampaign
            ? <button style={btnPrimary} onClick={() => { setEditing(null); setModalOpen(true); }}><Plus size={15} /> Programmer un entretien</button>
            : undefined}
        />
      ) : (
        <>
        <div style={{ ...card, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1060 }}>
            <thead>
              <tr>
                <Th>Agent</Th>
                <Th>Évaluateur</Th>
                <Th>Date / heure</Th>
                <Th>Statut</Th>
                <Th>Préparation</Th>
                <Th>Compte rendu</Th>
                <Th>Outlook</Th>
                <Th style={{ textAlign: 'right' }}>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {paged.map(e => {
                const st = STATUTS[e.statut] || STATUTS.a_planifier;
                const prep = PREP_STATUTS[e.preparation_statut] || PREP_STATUTS.non_commencee;
                return (
                  <tr key={e.id}>
                    <Td>
                      <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                        <Avatar name={nomComplet(e)} size={30} />
                        <div>
                          <div style={{ fontWeight: 700, color: COLORS.text }}>{nomComplet(e)}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{[e.service, e.direction].filter(Boolean).join(' · ') || e.agent_email || '—'}</div>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      {e.evaluator_nom || e.evaluator_email ? (
                        <>
                          <div style={{ fontWeight: 600, color: '#334155' }}>{e.evaluator_nom || e.evaluator_email}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>{e.evaluator_email || ''}</div>
                        </>
                      ) : (
                        <div style={{ minWidth: 190 }}>
                          <AgentSearch key={`ev-${e.id}-${dsiOptions.length}`} compact hidePresence agents={dsiOptions} loading={assigning === `e${e.id}`}
                            placeholder="Choisir l’évaluateur…" onSelect={u => assignEvaluator({ entretien: e }, u as any)} />
                        </div>
                      )}
                    </Td>
                    <Td>{formatDateCourte(e.date_entretien)}</Td>
                    <Td><Badge {...st} /></Td>
                    <Td><Badge {...prep} /></Td>
                    <Td>{(() => { const m = crepMeta(e); return m ? <Badge {...m} /> : <span style={{ fontSize: 11.5, color: '#94a3b8' }}>—</span>; })()}</Td>
                    <Td>
                      {e.outlook_status === 'envoye'
                        ? <span title={e.outlook_web_link || ''} style={{ fontSize: 11.5, color: COLORS.success, fontWeight: 700 }}>Envoyée</span>
                        : e.outlook_status === 'erreur'
                          ? <span title={e.outlook_error || ''} style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontSize: 11.5, color: COLORS.danger, fontWeight: 700 }}><MailWarning size={13} /> Erreur</span>
                          : <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Non planifiée</span>}
                    </Td>
                    <Td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button style={btnGhost} title="Ouvrir la fiche" onClick={() => setDetailId(e.id)}><Eye size={13} /></button>
                        <button style={btnGhost} title="Modifier" onClick={() => { setEditing(e); setPrefill(null); setModalOpen(true); }}><Pencil size={13} /></button>
                        <button style={btnGhost} title="Renvoyer l’invitation Outlook" disabled={busyId === e.id} onClick={() => resync(e)}><Send size={13} /></button>
                        <button style={btnDanger} title="Supprimer" disabled={busyId === e.id} onClick={() => remove(e)}><Trash2 size={13} /></button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {programmerFiltered.map(a => (
                <tr key={`todo-${a.username}`} style={{ background: '#fafafa' }}>
                  <Td>
                    <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
                      <Avatar name={`${a.prenom} ${a.nom}`} size={30} />
                      <div>
                        <div style={{ fontWeight: 700, color: COLORS.text }}>{a.prenom} {a.nom}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>{[a.service, a.direction].filter(Boolean).join(' · ') || a.email || '—'}</div>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div style={{ minWidth: 190 }}>
                      <AgentSearch key={`ev-a-${a.username}-${dsiOptions.length}`} compact hidePresence agents={dsiOptions} loading={assigning === `a${a.username}`}
                        placeholder="Choisir l’évaluateur…" onSelect={u => assignEvaluator({ agent: a }, u as any)} />
                    </div>
                  </Td>
                  <Td><span style={{ fontSize: 11.5, color: '#94a3b8' }}>—</span></Td>
                  <Td><Badge {...STATUTS.a_planifier} /></Td>
                  <Td><span style={{ fontSize: 11.5, color: '#94a3b8' }}>—</span></Td>
                  <Td><span style={{ fontSize: 11.5, color: '#94a3b8' }}>—</span></Td>
                  <Td><span style={{ fontSize: 11.5, color: '#94a3b8' }}>Non planifiée</span></Td>
                  <Td style={{ textAlign: 'right' }}>
                    <button style={btnPrimary} onClick={() => { setEditing(null); setPrefill(a); setModalOpen(true); }} disabled={!currentCampaign}>
                      <Plus size={13} /> Programmer
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 12, color: COLORS.muted }}>
            {filtered.length} entretien(s) · page {page} / {pageCount}{programmerFiltered.length ? ` · ${programmerFiltered.length} agent(s) à programmer` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnGhost} disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Précédent</button>
            <button style={btnGhost} disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>Suivant</button>
          </div>
        </div>
        </>
      )}

      {modalOpen && (
        <AdminEntretienModal
          entretien={editing}
          prefillAgent={prefill}
          campaigns={campaigns}
          defaultCampaignId={typeof campaignId === 'number' ? campaignId : undefined}
          onClose={() => setModalOpen(false)}
          onSaved={(res) => {
            if (res.outlook && res.outlook.ok === false) {
              setToast({ ok: false, text: `Entretien enregistré, invitation Outlook en échec : ${res.outlook.error}` });
            }
            load(); onChanged?.();
          }}
        />
      )}

      {detailId && (
        <EntretienDetailModal entretienId={detailId} onClose={() => setDetailId(null)} onSaved={() => { load(); onChanged?.(); }} />
      )}
    </div>
  );
}
