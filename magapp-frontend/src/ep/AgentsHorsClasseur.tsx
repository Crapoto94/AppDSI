import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Loader2, UserPlus } from 'lucide-react';
import { COLORS, btnGhost, btnPrimary, input } from './ui';

// Administration de la base des agents, hors classeur : ajout depuis la base RH, désactivation et réactivation.

type Headers = Record<string, string>;
type Say = (ok: boolean, text: string) => void;
interface RhAgent { matricule: string; nom: string; prenom: string; poste: string; direction: string; service: string; grade: string; situation: 'absent' | 'present' | 'desactive' }
interface Desactive { matricule: string; nom_prenom: string; direction: string; service: string; poste: string; desactive_motif: string; desactive_par: string; desactive_at: string }
const errMsg = (e: any, fallback: string) => e?.response?.data?.message || fallback;
const box: React.CSSProperties = { border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, marginBottom: 12 };
const row: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', padding: '7px 10px', borderBottom: `1px solid ${COLORS.border}`, fontSize: 12.5 };

/** Désactive un agent (retraite…) après confirmation ; renvoie true si c'est fait. */
export async function desactiverAgent(a: { matricule: string; nom_prenom: string }, headers: Headers, say: Say): Promise<boolean> {
  const motif = window.prompt(`Désactiver ${a.nom_prenom} ?\n\nIl ou elle sort de la liste des agent·e·s à évaluer et son entretien non terminé est retiré. Vous pourrez réactiver.\n\nMotif :`, 'Départ en retraite');
  if (motif === null) return false;
  const url = `/api/ep-base/agents/${encodeURIComponent(a.matricule)}/desactiver`;
  const send = (confirm: boolean) => axios.post(url, { motif, confirm }, { headers });
  try {
    let r;
    try { r = await send(false); }
    catch (e: any) {
      if (!e?.response?.data?.needsConfirm) throw e;
      if (!window.confirm(`${e.response.data.message}\n\nDésactiver quand même ?`)) return false;
      r = await send(true);
    }
    say(true, `${a.nom_prenom} est désactivé·e : ${r.data.retires} entretien(s) retiré(s).${r.data.evalues ? ` Attention : ${r.data.evalues} agent·e·s l’ont encore comme évaluateur·rice, choisissez-en un autre.` : ''}`);
    return true;
  } catch (e) { say(false, errMsg(e, 'Désactivation impossible.')); return false; }
}

/** Liste repliable des agents désactivés, avec réactivation. */
export function AgentsDesactives({ headers, reloadKey, say, onChanged }: { headers: Headers; reloadKey: number; say: Say; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Desactive[]>([]);
  const load = useCallback(() => { axios.get('/api/ep-base/desactives', { headers }).then(r => setList(r.data.agents || [])).catch(() => setList([])); }, [headers]);
  useEffect(load, [load, reloadKey]);
  const reactiver = async (a: Desactive) => {
    try {
      const r = await axios.post(`/api/ep-base/agents/${encodeURIComponent(a.matricule)}/reactiver`, {}, { headers });
      say(true, `${a.nom_prenom} est réactivé·e${r.data.restaures ? ` : ${r.data.restaures} entretien(s) restauré(s)` : ''}.`);
      load(); onChanged();
    } catch (e) { say(false, errMsg(e, 'Réactivation impossible.')); }
  };
  if (!list.length) return null;
  return (
    <div style={{ marginTop: 16, border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', background: '#f8fafc', borderRadius: 10, cursor: 'pointer', fontSize: 13.5, fontWeight: 800, color: COLORS.text }}>
        {open ? '▾' : '▸'} Agent·e·s désactivé·e·s ({list.length})
      </button>
      {open && list.map(a => (
        <div key={a.matricule} style={row}>
          <div style={{ flex: 1 }}>
            <b>{a.nom_prenom}</b> <span style={{ color: COLORS.muted }}>· {a.matricule}{a.service ? ` · ${a.service}` : ''}</span>
            <div style={{ fontSize: 11.5, color: COLORS.muted }}>{a.desactive_motif}{a.desactive_at ? ` · le ${new Date(a.desactive_at).toLocaleDateString('fr-FR')}` : ''}{a.desactive_par ? ` par ${a.desactive_par}` : ''}</div>
          </div>
          <button style={{ ...btnGhost, padding: '3px 10px', fontSize: 11.5 }} onClick={() => reactiver(a)}>Réactiver</button>
        </div>
      ))}
    </div>
  );
}

/** Ajout d'un agent absent du classeur : recherche dans la base RH, puis modèle de CREP et évaluateur. */
export function AjouterAgentRh({ headers, templates, say, onAdded }: { headers: Headers; templates: string[]; say: Say; onAdded: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<RhAgent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [agent, setAgent] = useState<RhAgent | null>(null);
  const [modele, setModele] = useState('');
  const [categorie, setCategorie] = useState('');
  const [evalQ, setEvalQ] = useState('');
  const [evals, setEvals] = useState<Array<{ matricule: string; nom: string; poste?: string }>>([]);
  const [boss, setBoss] = useState<{ matricule: string; nom: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (agent || q.trim().length < 2) { setHits([]); setError(''); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try { const r = await axios.get('/api/ep-base/rh/recherche', { headers, params: { q } }); if (alive) { setHits(r.data.agents || []); setError(''); } }
      catch (e) { if (alive) { setHits([]); setError(errMsg(e, 'Recherche RH impossible pour le moment.')); } }
      finally { if (alive) setLoading(false); }
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [q, agent, headers]);

  useEffect(() => {
    if (evalQ.trim().length < 2) { setEvals([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      try { const r = await axios.get('/api/ep-base/valideurs/search', { headers, params: { q: evalQ } }); if (alive) setEvals(r.data.valideurs || []); }
      catch { if (alive) setEvals([]); }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [evalQ, headers]);

  const reset = () => { setAgent(null); setQ(''); setModele(''); setCategorie(''); setBoss(null); setEvalQ(''); setError(''); };

  const add = async () => {
    if (!agent || !modele) return;
    setBusy(true);
    try {
      const r = await axios.post('/api/ep-base/agents', { matricule: agent.matricule, modele, categorie, valideur_matricule: boss?.matricule || '' }, { headers });
      const d = r.data;
      say(!d.erreurs?.length, `${d.nom_prenom} est ajouté·e.${d.entretien_cree ? ' Son entretien est créé.' : d.sans_valideur ? ' Choisissez son évaluateur·rice dans la liste pour créer l’entretien.' : ''}${d.email ? '' : ' Aucune adresse trouvée dans l’AD.'}${d.erreurs?.length ? ' ' + d.erreurs.join(' · ') : ''}`);
      reset(); onAdded();
    } catch (e) { setError(errMsg(e, 'Ajout impossible.')); } finally { setBusy(false); }
  };

  return (
    <div style={box}>
      <div style={{ fontWeight: 800, fontSize: 13.5, color: COLORS.text, marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}><UserPlus size={15} color={COLORS.primary} /> Ajouter un·e agent·e depuis la base RH</div>
      {error && <div style={{ fontSize: 12.5, color: '#b91c1c', marginBottom: 8 }}>{error}</div>}
      {!agent ? (
        <>
          <input autoFocus style={{ ...input, maxWidth: 520 }} placeholder="Nom, prénom, matricule, service… (base RH)" value={q} onChange={e => setQ(e.target.value)} />
          {loading && <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 6 }}><Loader2 size={12} className="spin" /> Recherche dans la base RH…</div>}
          {q.trim().length >= 2 && !loading && !error && (
            <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 8, border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
              {hits.map(h => (
                <div key={h.matricule} style={row}>
                  <div style={{ flex: 1 }}><b>{h.nom} {h.prenom}</b> <span style={{ color: COLORS.muted }}>· {[h.matricule, h.poste, h.service || h.direction].filter(Boolean).join(' · ')}</span></div>
                  {h.situation === 'absent'
                    ? <button style={{ ...btnGhost, padding: '3px 10px', fontSize: 11.5 }} onClick={() => setAgent(h)}>Choisir</button>
                    : <span style={{ fontSize: 11.5, color: COLORS.muted }}>{h.situation === 'present' ? 'Déjà dans la liste' : 'Désactivé·e : à réactiver'}</span>}
                </div>
              ))}
              {!hits.length && <div style={{ padding: 12, fontSize: 12.5, color: COLORS.muted }}>Aucun agent·e trouvé dans la base RH.</div>}
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, marginBottom: 8 }}><b>{agent.nom} {agent.prenom}</b> <span style={{ color: COLORS.muted }}>· {[agent.matricule, agent.grade, agent.poste, agent.service || agent.direction].filter(Boolean).join(' · ')}</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <select aria-label="Modèle de compte rendu" style={{ ...input, maxWidth: 280 }} value={modele} onChange={e => setModele(e.target.value)}>
              <option value="">— Modèle de compte rendu —</option>
              {templates.map(t => <option key={t} value={t}>{t.replace(/^Template_/i, '')}</option>)}
            </select>
            <select aria-label="Catégorie" style={{ ...input, maxWidth: 190 }} value={categorie} onChange={e => setCategorie(e.target.value)}>
              <option value="">Catégorie (facultatif)</option>
              {['A', 'B', 'C'].map(c => <option key={c} value={c}>Catégorie {c}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 8, maxWidth: 420 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: COLORS.muted, marginBottom: 3 }}>Évaluateur·rice{boss ? ` : ${boss.nom}` : ' (peut être choisi ensuite)'}</div>
            <input style={{ ...input, padding: '6px 9px', fontSize: 12.5 }} placeholder="Nom ou matricule…" value={evalQ} onChange={e => setEvalQ(e.target.value)} />
            {evals.map(h => (
              <button key={h.matricule} onClick={() => { setBoss({ matricule: h.matricule, nom: h.nom }); setEvalQ(''); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}>
                <b>{h.nom}</b> <span style={{ color: COLORS.muted }}>· {h.poste || h.matricule}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btnPrimary} disabled={!modele || busy} onClick={add}>{busy ? <Loader2 size={14} className="spin" /> : <UserPlus size={14} />} Ajouter à la liste</button>
            <button style={btnGhost} onClick={reset}>Annuler</button>
          </div>
        </>
      )}
    </div>
  );
}
