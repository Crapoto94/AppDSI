import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, Bug, Check, CircleCheckBig, Lightbulb, RefreshCw, Search, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

// Demandes et bugs déclarés dans l'ensemble des applications de la DSI (table centrale hub.demandes_apps). Chaque application reste autonome : l'état affiché est celui de
// l'application d'origine, ramené à un vocabulaire commun. Les applications qui ont adopté le contrat « décision » (VibeLocatif) se traitent aussi depuis ici.
interface Item {
  app: string; app_label: string; id: string; cle: string; type: 'bug' | 'evolution'; type_brut: string; titre: string; description: string;
  statut: 'demandee' | 'acceptee' | 'refusee' | 'realisee'; statut_brut: string; motif: string | null; demandeur: string | null;
  created_at: string; traite_par: string | null; traite_le: string | null; extra: string | null;
  db_id: number; source: string; traitable: boolean;
  decision: { statut: string; motif: string | null; par: string; le: string; appliquee_le: string | null; erreur: string | null } | null;
}
interface Source { code: string; label: string; ok: boolean; nb: number; erreur?: string }

const ETATS: Record<Item['statut'], { label: string; bg: string; fg: string }> = {
  demandee: { label: 'Demandée', bg: '#fef3c7', fg: '#92400e' }, acceptee: { label: 'Acceptée / en cours', bg: '#dbeafe', fg: '#1e40af' },
  refusee: { label: 'Refusée', bg: '#fee2e2', fg: '#991b1b' }, realisee: { label: 'Réalisée', bg: '#dcfce7', fg: '#166534' },
};
const dt = (s?: string | null) => (s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const pill = (bg: string, fg: string): React.CSSProperties => ({ background: bg, color: fg, borderRadius: 999, padding: '2px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' });

const BacklogApps: React.FC = () => {
  const { token } = useAuth();
  const [items, setItems] = useState<Item[] | null>(null); const [sources, setSources] = useState<Source[]>([]); const [erreur, setErreur] = useState<string | null>(null);
  const [app, setApp] = useState(''); const [statut, setStatut] = useState(''); const [type, setType] = useState(''); const [q, setQ] = useState(''); const [ouvert, setOuvert] = useState<string | null>(null);
  const [synchroLe, setSynchroLe] = useState<string | null>(null); const [sync, setSync] = useState(false); const [info, setInfo] = useState<string | null>(null);

  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const charger = () => axios.get('/api/backlog-apps', auth)
    .then((r) => { setItems(r.data.items); setSources(r.data.sources); setSynchroLe(r.data.synchro_le); })
    .catch((e) => setErreur(e?.response?.data?.message || e.message));
  useEffect(() => { charger(); }, [token]);
  const synchroniser = async () => {
    setSync(true); setInfo(null);
    try { await axios.post('/api/backlog-apps/sync', {}, auth); await charger(); } catch (e: any) { setInfo(e?.response?.data?.message || e.message); } finally { setSync(false); }
  };
  // Décision prise depuis le hub : inscrite dans la table centrale, puis appliquée par l'application d'origine (en général en moins d'une minute)
  const decider = async (x: Item, statut: 'acceptee' | 'refusee' | 'realisee') => {
    let motif = '';
    if (statut === 'refusee') { motif = (window.prompt(`Motif du refus de « ${x.titre} » (transmis au demandeur) :`) || '').trim(); if (motif.length < 3) return; }
    setInfo(null);
    try { await axios.put(`/api/backlog-apps/${x.db_id}/decision`, { statut, motif }, auth); setInfo(`Décision enregistrée pour « ${x.titre} » : ${x.app_label} l'applique sous une minute.`); await charger(); }
    catch (e: any) { setInfo(e?.response?.data?.message || e.message); }
  };

  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (items || []).filter((x) => (!app || x.app === app) && (!statut || x.statut === statut) && (!type || x.type === type)
      && (!t || `${x.titre} ${x.description} ${x.demandeur || ''}`.toLowerCase().includes(t)));
  }, [items, app, statut, type, q]);

  if (erreur) return <div style={{ color: '#991b1b' }}>{erreur}</div>;
  if (!items) return <div style={{ color: '#64748b' }}>Chargement…</div>;
  const enPanne = sources.filter((s) => !s.ok);
  const chip = (actif: boolean): React.CSSProperties => ({ padding: '4px 10px', borderRadius: 6, border: '1px solid #e2e8f0', background: actif ? '#a16207' : '#fff', color: actif ? '#fff' : '#475569', fontSize: 12, cursor: 'pointer' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
        Demandes et bugs déclarés dans l'ensemble des applications. Lecture seule : le traitement (accepter, refuser, réaliser) se fait dans l'application d'origine, qui reste autonome.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', fontSize: 12, color: '#64748b' }}>
        <button onClick={synchroniser} disabled={sync} style={{ ...chip(false), display: 'inline-flex', alignItems: 'center', gap: 5 }}><RefreshCw size={12} />{sync ? 'Synchronisation…' : 'Synchroniser maintenant'}</button>
        {synchroLe && <span>Dernière synchronisation : {new Date(synchroLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} (automatique toutes les 10 min)</span>}
        {info && <span style={{ color: '#a16207', fontWeight: 600 }}>{info}</span>}
      </div>
      {enPanne.length > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#92400e', display: 'flex', gap: 8 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>Source(s) non lue(s) : {enPanne.map((s) => <span key={s.code}><strong>{s.label}</strong> ({s.erreur}) </span>)}</div>
        </div>)}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <button style={chip(!app)} onClick={() => setApp('')}>Toutes ({items.length})</button>
        {sources.map((s) => <button key={s.code} style={{ ...chip(app === s.code), opacity: s.ok ? 1 : 0.5 }} onClick={() => setApp(s.code)}>{s.label} ({s.nb})</button>)}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: 8, top: 9, color: '#94a3b8' }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" style={{ padding: '6px 8px 6px 26px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, minWidth: 220 }} />
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}>
          <option value="">Bugs et évolutions</option><option value="bug">Bugs</option><option value="evolution">Évolutions / idées</option>
        </select>
        <select value={statut} onChange={(e) => setStatut(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}>
          <option value="">Tous les états</option>{Object.entries(ETATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>{lignes.length} demande(s)</span>
      </div>

      {!lignes.length ? <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24 }}>Aucune demande.</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f8fafc', color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', textAlign: 'left' }}>
              <th style={{ padding: '8px 10px' }}>Application</th><th style={{ padding: '8px 10px' }}>Type</th><th style={{ padding: '8px 10px' }}>Demande</th><th style={{ padding: '8px 10px' }}>Demandeur</th><th style={{ padding: '8px 10px' }}>État</th><th style={{ padding: '8px 10px' }} /></tr></thead>
            <tbody>
              {lignes.map((x) => {
                const e = ETATS[x.statut]; const o = ouvert === x.cle;
                return (
                  <tr key={x.cle} onClick={() => setOuvert(o ? null : x.cle)} style={{ borderBottom: '1px solid #f1f5f9', verticalAlign: 'top', cursor: 'pointer' }}>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}><span style={pill('#f1f5f9', '#334155')}>{x.app_label}</span><div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>n° {x.id}</div></td>
                    <td style={{ padding: '8px 10px' }}>{x.type === 'bug'
                      ? <span style={{ ...pill('#fee2e2', '#991b1b'), display: 'inline-flex', alignItems: 'center', gap: 3 }}><Bug size={11} />Bug</span>
                      : <span style={{ ...pill('#dbeafe', '#1e40af'), display: 'inline-flex', alignItems: 'center', gap: 3 }}><Lightbulb size={11} />Évolution</span>}</td>
                    <td style={{ padding: '8px 10px', maxWidth: 520 }}>
                      <div style={{ fontWeight: 600 }}>{x.titre}</div>
                      <div style={{ color: '#64748b', whiteSpace: o ? 'pre-wrap' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 520 }}>{x.description}</div>
                      {o && x.motif && <div style={{ marginTop: 4 }}><strong>Réponse / motif :</strong> {x.motif}</div>}
                      {o && x.extra && <div style={{ marginTop: 2, fontSize: 11, color: '#94a3b8' }}>{x.extra}</div>}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{x.demandeur || '—'}<div style={{ fontSize: 11, color: '#94a3b8' }}>{dt(x.created_at)}</div></td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                      <span style={pill(e.bg, e.fg)} title={`État dans l'application : ${x.statut_brut}`}>{e.label}</span>
                      {x.traite_le && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{x.traite_par ? `${x.traite_par}, ` : ''}{dt(x.traite_le)}</div>}
                      {x.decision && !x.decision.appliquee_le && !x.decision.erreur && <div style={{ fontSize: 11, color: '#a16207', marginTop: 2 }}>Décision « {ETATS[x.decision.statut as Item['statut']]?.label || x.decision.statut} » en attente d'application</div>}
                      {x.decision?.erreur && <div style={{ fontSize: 11, color: '#991b1b', marginTop: 2 }} title={x.decision.erreur}>Décision non appliquée : {x.decision.erreur}</div>}
                    </td>
                    <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', textAlign: 'right' }} onClick={(ev) => ev.stopPropagation()}>
                      {x.traitable && !(x.decision && !x.decision.appliquee_le && !x.decision.erreur) && (<>
                        {(x.statut === 'demandee' || x.statut === 'refusee') && <button title="Accepter" aria-label="Accepter" onClick={() => decider(x, 'acceptee')} style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 6 }}><Check size={16} color="#10b981" /></button>}
                        {(x.statut === 'demandee' || x.statut === 'acceptee') && <button title="Refuser" aria-label="Refuser" onClick={() => decider(x, 'refusee')} style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 6 }}><X size={16} color="#ef4444" /></button>}
                        {x.statut === 'acceptee' && <button title="Déclarer réalisée" aria-label="Déclarer réalisée" onClick={() => decider(x, 'realisee')} style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 6 }}><CircleCheckBig size={16} color="#64748b" /></button>}
                      </>)}
                    </td>
                  </tr>);
              })}
            </tbody>
          </table>
        </div>)}
    </div>
  );
};

export default BacklogApps;
