import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Loader2, Save, CheckCircle2, FileDown, ClipboardList, Info, Send, AlertTriangle, PenLine, ShieldCheck, Undo2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Entretien } from './types';
import { formatDateHeure } from './types';
import type { Crep } from './crep';
import { CRITERIA_GROUPS, LEVELS, NIVEAUX_REALISATION, initialCrep, missingFields } from './crep';
import CrepAiAssist from './CrepAiAssist';
import { COLORS, Field, btnGhost, btnPrimary, input, textarea } from './ui';

function H({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ margin: '26px 0 12px', paddingBottom: 6, borderBottom: `2px solid ${COLORS.border}` }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: COLORS.text }}>{children}</div>
      {sub && <div style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Area({ label, value, onChange, rows = 3, disabled, hint, ai }: {
  label?: string; value: string; onChange: (v: string) => void; rows?: number; disabled?: boolean; hint?: string;
  ai?: { entretienId: number; rubrique: string; contexte?: string; crep?: unknown };
}) {
  const ta = <textarea style={textarea} rows={rows} disabled={disabled} value={value} onChange={e => onChange(e.target.value)} />;
  const assist = ai ? (
    <CrepAiAssist entretienId={ai.entretienId} rubrique={ai.rubrique} contexte={ai.contexte} crep={ai.crep} value={value} disabled={disabled} onApply={onChange} />
  ) : null;
  if (!label) return <div>{ta}<div style={{ marginTop: 4 }}>{assist}</div></div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>{label}</label>
      {ta}
      {hint && <span style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>{hint}</span>}
      {assist}
    </div>
  );
}

/**
 * Saisie du compte-rendu officiel de l'entretien par l'évaluateur (tous les champs du document DRH)
 * et génération du PDF de 4 pages.
 */
export default function CrepForm({ entretien, canEdit, onSaved, mode = 'evaluateur', aiEnabled = true }: {
  entretien: Entretien;
  canEdit: boolean;
  onSaved: (e: Entretien) => void;
  /** « agent » : relecture du compte rendu envoyé par l'évaluateur, saisie des 2 champs réservés, validation → parapheur. */
  mode?: 'evaluateur' | 'agent';
  /** La rédaction assistée par IA est ouverte par le paramétrage du module (évaluateurs choisis). */
  aiEnabled?: boolean;
}) {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };
  const isAgent = mode === 'agent';
  const [crep, setCrep] = useState<Crep>(() => initialCrep(entretien));
  const [busy, setBusy] = useState<'save' | 'submit' | 'pdf' | 'send' | 'agent' | 'draft' | 'recall' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const checkRef = useRef<HTMLDivElement>(null);
  const [check, setCheck] = useState<{ loading: boolean; missing: string[]; issues: string[]; ai: string[] | null; aiError: string | null } | null>(null);

  useEffect(() => { setCrep(initialCrep(entretien)); }, [entretien.id]);

  const set = <K extends keyof Crep>(key: K, value: Crep[K]) => setCrep(c => ({ ...c, [key]: value }));
  const dis = !canEdit || isAgent;
  const crepStatut = entretien.crep_statut || 'non_envoye';
  const canSend = !isAgent && canEdit && entretien.statut === 'realise' && entretien.evaluation_statut === 'soumis' && crepStatut === 'non_envoye';
  const agentCanValidate = isAgent && crepStatut === 'envoye_agent';

  const save = async (submit: boolean) => {
    setMsg(null); setMissing([]);
    if (submit) {
      const m = missingFields(crep);
      if (m.length) { setMissing(m); return; }
      // Contrôles de cohérence fiables (sans IA) avant validation : l'évaluateur peut passer outre après les avoir lus.
      try {
        const chk = await axios.post(`/api/entretiens/${entretien.id}/crep/check`, { crep, ai: false }, { headers });
        const found: string[] = chk.data?.issues || [];
        if (found.length && !window.confirm(`Des incohérences ont été détectées :\n\n- ${found.join('\n- ')}\n\nValider quand même le compte rendu ?`)) {
          setCheck({ loading: false, missing: [], issues: found, ai: null, aiError: null });
          return;
        }
      } catch (e) { /* contrôle indisponible : on ne bloque pas la validation */ }
      if (!window.confirm('Valider le compte rendu ? L’entretien sera marqué comme réalisé.')) return;
    }
    setBusy(submit ? 'submit' : 'save');
    try {
      const r = await axios.put(`/api/entretiens/${entretien.id}/crep`, { crep, submit }, { headers });
      onSaved(r.data.entretien);
      setMsg({ ok: true, text: submit ? 'Compte rendu validé. Vous pouvez maintenant l’envoyer à l’agent.' : 'Brouillon enregistré.' });
    } catch (e: any) {
      if (Array.isArray(e.response?.data?.missing)) setMissing(e.response.data.missing);
      setMsg({ ok: false, text: e.response?.data?.message || e.message || 'Enregistrement impossible' });
    } finally { setBusy(null); }
  };

  const agentDraft = async () => {
    setBusy('draft'); setMsg(null);
    try {
      await axios.put(`/api/entretiens/${entretien.id}/crep/agent-draft`, { obs_agent_conditions: crep.obs_agent_conditions, obs_agent_entretien: crep.obs_agent_entretien }, { headers });
      setMsg({ ok: true, text: 'Brouillon de vos observations enregistré.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e.response?.data?.message || 'Enregistrement impossible' });
    } finally { setBusy(null); }
  };

  const recall = async () => {
    if (!window.confirm('Rappeler le compte rendu ? Il ne sera plus visible par l’agent (qui en sera informé) et vous pourrez le corriger avant de le renvoyer.')) return;
    setBusy('recall'); setMsg(null);
    try {
      const r = await axios.post(`/api/entretiens/${entretien.id}/crep/recall`, {}, { headers });
      onSaved(r.data.entretien);
      setMsg({ ok: true, text: 'Compte rendu rappelé : vous pouvez le modifier puis le renvoyer à l’agent.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e.response?.data?.message || 'Rappel impossible' });
    } finally { setBusy(null); }
  };

  // Le panneau de résultat est en bas du formulaire : on le ramène à l'écran dès que la vérification démarre ou aboutit.
  useEffect(() => {
    if (check) window.setTimeout(() => checkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
  }, [check?.loading]);

  /** Vérification globale : champs manquants, incohérences fiables, puis relecture par l'IA locale. */
  const runCheck = async () => {
    setMsg(null); setMissing([]);
    setCheck({ loading: true, missing: missingFields(crep), issues: [], ai: null, aiError: null });
    try {
      const r = await axios.post(`/api/entretiens/${entretien.id}/crep/check`, { crep, ai: aiEnabled }, { headers });
      setCheck({ loading: false, missing: r.data.missing || [], issues: r.data.issues || [], ai: r.data.ai ?? null, aiError: r.data.ai_error || null });
    } catch (e: any) {
      setCheck({ loading: false, missing: missingFields(crep), issues: [], ai: null, aiError: e.response?.data?.message || 'Vérification impossible' });
    }
  };

  const sendToAgent = async () => {
    if (!window.confirm('Envoyer le compte rendu à l’agent ? Il pourra le relire, renseigner ses observations puis le valider pour signature. Vous ne pourrez plus le modifier.')) return;
    setBusy('send'); setMsg(null);
    try {
      const r = await axios.post(`/api/entretiens/${entretien.id}/crep/send-to-agent`, {}, { headers });
      onSaved(r.data.entretien);
      setMsg({ ok: true, text: r.data.mail?.ok === false ? `Compte rendu envoyé à l’agent (e-mail de notification en échec : ${r.data.mail.error}).` : 'Compte rendu envoyé à l’agent, qui en a été informé par e-mail.' });
    } catch (e: any) {
      setMsg({ ok: false, text: e.response?.data?.message || 'Envoi impossible' });
    } finally { setBusy(null); }
  };

  const agentValidate = async () => {
    // Les deux observations de l'agent sont obligatoires (« Néant » si rien à signaler).
    const obsMissing: string[] = [];
    if (!crep.obs_agent_conditions.trim()) obsMissing.push('Observations de l’agent sur les conditions de travail et le fonctionnement du service (« Néant » si rien à signaler)');
    if (!crep.obs_agent_entretien.trim()) obsMissing.push('Observations de l’agent sur l’entretien (« Néant » si rien à signaler)');
    if (obsMissing.length) { setMissing(obsMissing); setMsg(null); return; }
    setMissing([]);
    if (!window.confirm('Validez-vous toutes ces informations ?\n\nSi vous validez, le compte rendu est envoyé au parapheur pour être cosigné par vous et par votre évaluateur (signature simple). Vous ne pourrez plus le modifier.')) return;
    setBusy('agent'); setMsg(null);
    try {
      const r = await axios.post(`/api/entretiens/${entretien.id}/crep/agent-validate`, {
        validate: true, obs_agent_conditions: crep.obs_agent_conditions, obs_agent_entretien: crep.obs_agent_entretien,
      }, { headers });
      onSaved(r.data.entretien);
      setMsg({ ok: true, text: `Compte rendu validé et transmis en signature (${r.data.parapheur?.reference || 'parapheur'}). Vous allez recevoir la demande de signature.` });
    } catch (e: any) {
      setMsg({ ok: false, text: e.response?.data?.message || 'Validation impossible' });
    } finally { setBusy(null); }
  };

  const openPdf = async () => {
    setBusy('pdf'); setMsg(null);
    try {
      // On enregistre d'abord la saisie en cours, pour que le PDF reflète l'écran.
      if (canEdit) await axios.put(`/api/entretiens/${entretien.id}/crep`, { crep, submit: false, keep_status: true }, { headers }).then(r => onSaved(r.data.entretien));
      const r = await axios.get(`/api/entretiens/${entretien.id}/crep.pdf`, { headers, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      setMsg({ ok: false, text: 'Génération du PDF impossible.' });
    } finally { setBusy(null); }
  };

  const agent = `${entretien.agent_prenom || ''} ${entretien.agent_nom}`.trim();

  // Éléments factuels transmis à l'IA locale pour chaque rubrique (saisie de l'agent dans sa préparation).
  const lines = (...p: Array<string | null | undefined | false>) => p.filter(x => x && String(x).trim()).join('\n');
  const generalCtx = lines(
    `Fonction : ${entretien.poste || 'non précisée'} — ${entretien.service || entretien.direction || ''}`,
    entretien.realisations && `Réalisations marquantes (agent) : ${entretien.realisations}`,
    entretien.difficultes && `Difficultés rencontrées (agent) : ${entretien.difficultes}`,
    entretien.pistes_amelioration && `Pistes d’amélioration (agent) : ${entretien.pistes_amelioration}`,
    entretien.competences_a_developper && `Compétences à développer (agent) : ${entretien.competences_a_developper}`,
    entretien.perspectives_missions && `Perspectives — missions (agent) : ${entretien.perspectives_missions}`,
    entretien.perspectives_projet && `Projet professionnel (agent) : ${entretien.perspectives_projet}`,
  );
  const objCtx = (i: number) => {
    const o = (entretien.objectifs || [])[i];
    return lines(
      `Objectif : ${crep.objectifs_ecoules[i].objectif || '(non renseigné)'}`,
      o?.niveau && `Niveau d’atteinte déclaré par l’agent : ${o.niveau}`,
      o?.resultats && `Résultats (agent) : ${o.resultats}`,
      o?.difficultes && `Difficultés (agent) : ${o.difficultes}`,
      o?.contexte && `Contexte (agent) : ${o.contexte}`,
      crep.objectifs_ecoules[i].niveau && `Niveau retenu par l’évaluateur : ${crep.objectifs_ecoules[i].niveau}`,
    );
  };
  const ai = (rubrique: string, contexte?: string, withCrep = false) => (
    aiEnabled ? { entretienId: entretien.id, rubrique, contexte: contexte ?? generalCtx, crep: withCrep ? crep : undefined } : undefined
  );

  return (
    <div>
      {/* En-tête du document */}
      <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.7 }}>
        <div><strong>Agent :</strong> {agent}</div>
        <div><strong>Direction / Service :</strong> {entretien.service || entretien.direction || '—'}</div>
        <div><strong>Fonctions exercées :</strong> {entretien.poste || '—'}</div>
        <div><strong>Date de l’entretien :</strong> {entretien.date_entretien ? formatDateHeure(entretien.date_entretien) : '—'}</div>
      </div>
      {isAgent && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 12, padding: '10px 12px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 9, fontSize: 12.5, color: '#3730a3', lineHeight: 1.5 }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {agentCanValidate
              ? <>Votre évaluateur vous a transmis le compte rendu de votre entretien. <strong>Relisez-le</strong>, renseignez vos observations en bas de page, puis <strong>validez-le</strong> : il sera alors envoyé au parapheur pour être cosigné par vous et par votre évaluateur.</>
              : crepStatut === 'en_signature'
                ? <>Vous avez validé ce compte rendu : il a été transmis en signature{entretien.crep_parapheur_ref ? ` (${entretien.crep_parapheur_ref})` : ''}. Retrouvez-le dans votre parapheur (« À signer »).</>
                : <>Ce compte rendu est en lecture seule.</>}
          </span>
        </div>
      )}
      {!isAgent && crepStatut !== 'non_envoye' && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 12, padding: '10px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9, fontSize: 12.5, color: '#166534', lineHeight: 1.5 }}>
          <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            {crepStatut === 'envoye_agent'
              ? <>Compte rendu envoyé à l’agent{entretien.crep_sent_at ? ` le ${new Date(entretien.crep_sent_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}` : ''} : en attente de sa relecture et de sa validation.</>
              : <>Validé par l’agent{entretien.crep_agent_validated_at ? ` le ${new Date(entretien.crep_agent_validated_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' })}` : ''} et transmis en signature{entretien.crep_parapheur_ref ? ` (${entretien.crep_parapheur_ref})` : ''}{entretien.crep_parapheur_status ? ` — statut : ${entretien.crep_parapheur_status}` : ''}. Pensez à le signer dans votre parapheur.</>}
          </span>
        </div>
      )}
      {canEdit && !isAgent && (
        <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 12, padding: '10px 12px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 9, fontSize: 12.5, color: '#3730a3', lineHeight: 1.5 }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Ce compte rendu est <strong>pré-rempli avec la saisie de l’agent</strong> dans sa préparation. L’évaluation, elle,
            est <strong>à rédiger par vous</strong> : relisez, corrigez et complétez chaque rubrique, renseignez la grille
            d’appréciation et l’appréciation générale.{aiEnabled ? ' Le bouton « Rédiger avec l’IA » peut vous proposer un texte à partir de quelques mots.' : ''}
          </span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginTop: 12 }}>
        <Field label="Grade actuel"><input style={input} disabled={dis} value={crep.grade} onChange={e => set('grade', e.target.value)} /></Field>
        <Field label="Date de convocation" hint="Automatique : date de création de l’EP.">
          <input style={{ ...input, background: '#f8fafc' }} disabled readOnly value={entretien.created_at ? new Date(entretien.created_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '—'} />
        </Field>
        <Field label="Date de notification à l’agent" hint="Automatique : date d’envoi du compte rendu à l’agent.">
          <input style={{ ...input, background: '#f8fafc' }} disabled readOnly value={entretien.crep_sent_at ? new Date(entretien.crep_sent_at).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : 'À l’envoi à l’agent'} />
        </Field>
        <Field label="Nom de l’évaluateur (N+1)"><input style={input} disabled={dis} value={crep.evaluateur_nom} onChange={e => set('evaluateur_nom', e.target.value)} /></Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Area label="Rappel des missions de l’agent" rows={3} disabled={dis} value={crep.missions} onChange={v => set('missions', v)} />
      </div>

      {/* Volet 1 */}
      <H sub="Objectifs de travail de l’année écoulée">VOLET 1 – Bilan de l’année écoulée</H>
      {crep.objectifs_ecoules.map((o, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto', gap: 10, alignItems: 'start', marginBottom: 10 }}>
          <Area label={`Objectif ${i + 1}`} rows={3} disabled={dis} value={o.objectif}
            onChange={v => set('objectifs_ecoules', crep.objectifs_ecoules.map((x, k) => k === i ? { ...x, objectif: v } : x))} />
          <Area label="Observations" rows={3} disabled={dis} value={o.observations}
            onChange={v => set('objectifs_ecoules', crep.objectifs_ecoules.map((x, k) => k === i ? { ...x, observations: v } : x))} />
          <Field label="Niveau de réalisation">
            <div style={{ display: 'flex', gap: 5 }}>
              {NIVEAUX_REALISATION.map(n => {
                const active = o.niveau === n.key;
                return (
                  <button key={n.key} type="button" disabled={dis} title={n.label}
                    onClick={() => set('objectifs_ecoules', crep.objectifs_ecoules.map((x, k) => k === i ? { ...x, niveau: active ? '' : n.key } : x))}
                    style={{ padding: '7px 10px', borderRadius: 8, fontSize: 12, fontWeight: 800, cursor: dis ? 'default' : 'pointer',
                      border: `1px solid ${active ? COLORS.primary : COLORS.border}`, background: active ? COLORS.primary : '#fff', color: active ? '#fff' : '#64748b' }}>
                    {n.key}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      ))}
      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>A = Atteint · PA = Partiellement atteint · NA = Non atteint</div>
      <Area label="Observations complémentaires (contexte, faits marquants, acquis professionnels)" rows={4} disabled={dis} ai={ai('Observations complémentaires (contexte, faits marquants, acquis professionnels)')}
        value={crep.observations_complementaires} onChange={v => set('observations_complementaires', v)} />

      {/* Appréciation */}
      <H sub="Une seule réponse par critère">Appréciation de la valeur professionnelle</H>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr>
              <th />
              {LEVELS.map(l => (
                <th key={l.key} style={{ fontSize: 10.5, fontWeight: 700, color: '#64748b', textAlign: 'center', padding: '4px 6px', width: 120, lineHeight: 1.25 }}>{l.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CRITERIA_GROUPS.map(g => (
              <React.Fragment key={g.key}>
                {g.title && (
                  <tr><td colSpan={4} style={{ padding: '12px 0 4px', fontSize: 12.5, fontWeight: 800, color: COLORS.text }}>{g.title}</td></tr>
                )}
                {g.items.map(it => (
                  <tr key={it.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '7px 8px 7px 0', fontSize: 12.5, color: '#334155' }}>{it.label}</td>
                    {LEVELS.map(l => (
                      <td key={l.key} style={{ textAlign: 'center' }}>
                        <input type="radio" name={`crep-${it.key}`} disabled={dis} checked={crep.valeur[it.key] === l.key}
                          onChange={() => set('valeur', { ...crep.valeur, [it.key]: l.key })}
                          onClick={() => { if (crep.valeur[it.key] === l.key && !dis) { const v = { ...crep.valeur }; delete v[it.key]; set('valeur', v); } }}
                          style={{ width: 16, height: 16, accentColor: COLORS.primary, cursor: dis ? 'default' : 'pointer' }} />
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 14 }}>
        <Area label="Appréciation générale sur l’exercice des missions" rows={5} disabled={dis} ai={ai('Appréciation générale sur l’exercice des missions', undefined, true)}
          value={crep.appreciation_generale} onChange={v => set('appreciation_generale', v)}
          hint={aiEnabled
            ? 'L’appréciation de la valeur professionnelle sera prise en compte pour l’avancement de grade et la promotion interne. L’IA s’appuie sur l’ensemble du compte rendu (grille, objectifs, observations).'
            : 'L’appréciation de la valeur professionnelle sera prise en compte pour l’avancement de grade et la promotion interne.'} />
      </div>

      {/* Volet 2 */}
      <H sub="Échanges sur les perspectives de l’année à venir">VOLET 2 – Perspectives</H>
      <Area label="Rappel des objectifs du service / de la direction" rows={4} disabled={dis} value={crep.objectifs_service} onChange={v => set('objectifs_service', v)} />
      <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.text, margin: '16px 0 8px' }}>Objectifs individuels de travail de l’année à venir</div>
      {crep.objectifs_futurs.map((o, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginBottom: 10 }}>
          <Area label={`${i + 1}. Descriptif`} rows={3} disabled={dis} value={o.descriptif}
            onChange={v => set('objectifs_futurs', crep.objectifs_futurs.map((x, k) => k === i ? { ...x, descriptif: v } : x))} />
          <Area label="Moyens et échéances" rows={3} disabled={dis} value={o.moyens}
            onChange={v => set('objectifs_futurs', crep.objectifs_futurs.map((x, k) => k === i ? { ...x, moyens: v } : x))} />
        </div>
      ))}
      <div style={{ fontSize: 12.5, fontWeight: 700, color: COLORS.text, margin: '16px 0 8px' }}>Actions de formation à envisager <span style={{ fontWeight: 400, color: COLORS.muted }}>(inscriptions à faire ultérieurement)</span></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Area label="Formations obligatoires (statutaires et réglementaires)" rows={2} disabled={dis} value={crep.formations.obligatoires} onChange={v => set('formations', { ...crep.formations, obligatoires: v })} />
        <Area label="Autres formations métiers" rows={2} disabled={dis} value={crep.formations.metiers} onChange={v => set('formations', { ...crep.formations, metiers: v })} />
        <Area label="Formations liées à l’accompagnement des parcours et/ou à un projet professionnel" rows={2} disabled={dis} value={crep.formations.parcours} onChange={v => set('formations', { ...crep.formations, parcours: v })} />
      </div>

      <H sub="Missions, carrière et mobilité">Perspectives d’évolution</H>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Area label="1. Évolution des missions et/ou de carrière (facultatif)" rows={3} disabled={dis} value={crep.evolution} onChange={v => set('evolution', v)} />
        <Area label="2. Mobilité" rows={3} disabled={dis} value={crep.mobilite} onChange={v => set('mobilite', v)} />
      </div>

      {/* Champs réservés à l'agent : renseignés par lui, après réception du compte rendu */}
      {(isAgent && (agentCanValidate || crep.obs_agent_conditions || crep.obs_agent_entretien)) || (!isAgent && (crep.obs_agent_conditions || crep.obs_agent_entretien)) ? (
        <>
          <H sub={isAgent ? 'Champs réservés à l’agent : à renseigner avant de valider' : 'Renseignées par l’agent'}>Observations de l’agent</H>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Area label="Observations de l’agent sur les conditions de travail et le fonctionnement du service" rows={4} disabled={!agentCanValidate}
              value={crep.obs_agent_conditions} onChange={v => set('obs_agent_conditions', v)} />
            <Area label="Observations de l’agent sur l’entretien" rows={4} disabled={!agentCanValidate}
              value={crep.obs_agent_entretien} onChange={v => set('obs_agent_entretien', v)} />
          </div>
        </>
      ) : null}

      {check && (
        <div ref={checkRef} style={{ marginTop: 14, padding: '12px 14px', background: '#f8fafc', border: `1px solid ${COLORS.border}`, borderRadius: 10, fontSize: 12.5, color: '#334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, marginBottom: 6 }}>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><ShieldCheck size={15} color={COLORS.primary} /> Vérification globale du compte rendu</span>
            <button type="button" onClick={() => setCheck(null)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12 }}>Fermer</button>
          </div>
          {check.loading && <div style={{ color: COLORS.muted, display: 'flex', gap: 6, alignItems: 'center' }}><Loader2 size={13} /> Analyse en cours{aiEnabled ? ' (relecture par l’IA interne, quelques secondes)' : ''}…</div>}
          {!check.loading && check.missing.length === 0 && check.issues.length === 0 && (check.ai?.length ?? 0) === 0 && !check.aiError && (
            <div style={{ color: COLORS.success, fontWeight: 700, display: 'flex', gap: 6, alignItems: 'center' }}><CheckCircle2 size={14} /> Aucune incohérence détectée : le compte rendu est complet et cohérent.</div>
          )}
          {check.missing.length > 0 && (
            <div style={{ marginTop: 6 }}><strong style={{ color: '#92400e' }}>Rubriques à compléter ({check.missing.length})</strong>
              <ul style={{ margin: '3px 0 0', paddingLeft: 20, lineHeight: 1.5 }}>{check.missing.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
          )}
          {check.issues.length > 0 && (
            <div style={{ marginTop: 6 }}><strong style={{ color: '#b91c1c' }}>Incohérences détectées ({check.issues.length})</strong>
              <ul style={{ margin: '3px 0 0', paddingLeft: 20, lineHeight: 1.5 }}>{check.issues.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
          )}
          {!check.loading && check.ai && check.ai.length > 0 && (
            <div style={{ marginTop: 6 }}><strong style={{ color: '#6d28d9' }}>Points à vérifier signalés par l’IA ({check.ai.length})</strong>
              <ul style={{ margin: '3px 0 0', paddingLeft: 20, lineHeight: 1.5 }}>{check.ai.map((m, i) => <li key={i}>{m}</li>)}</ul>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Relecture automatique, donnée à titre indicatif : à vous d’apprécier.</div></div>
          )}
          {check.aiError && <div style={{ marginTop: 6, fontSize: 11.5, color: '#94a3b8' }}>Relecture par l’IA indisponible : {check.aiError}</div>}
        </div>
      )}

      {missing.length > 0 && (
        <div style={{ marginTop: 14, padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, fontSize: 12.5, color: '#92400e' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 800, marginBottom: 4 }}>
            <AlertTriangle size={14} /> Le compte rendu est incomplet : il ne peut être validé qu’une fois tout renseigné.
          </div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 20, lineHeight: 1.5 }}>
            {missing.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}

      {msg && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 14, fontSize: 12.5, fontWeight: 600, color: msg.ok ? COLORS.success : COLORS.danger }}>
          {msg.ok ? <CheckCircle2 size={14} /> : null} {msg.text}
        </div>
      )}

      <div style={{ position: 'sticky', bottom: -14, background: '#fff', borderTop: `1px solid ${COLORS.border}`, margin: '18px -18px -14px', padding: '12px 18px', display: 'flex', gap: 9, flexWrap: 'wrap', alignItems: 'center' }}>
        {isAgent ? (
          agentCanValidate ? (
            <>
              <button style={btnGhost} disabled={!!busy} onClick={agentDraft}>
                {busy === 'draft' ? <Loader2 size={14} /> : <Save size={14} />} Enregistrer mon brouillon
              </button>
              <button style={{ ...btnPrimary, background: COLORS.success }} disabled={!!busy} onClick={agentValidate}>
                {busy === 'agent' ? <Loader2 size={14} /> : <PenLine size={14} />} Valider et envoyer pour signature
              </button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: COLORS.muted, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              <ClipboardList size={13} /> Compte rendu en lecture seule.
            </span>
          )
        ) : canEdit ? (
          <>
            <button style={btnGhost} disabled={!!busy} onClick={() => save(false)}>
              {busy === 'save' ? <Loader2 size={14} /> : <Save size={14} />} Enregistrer le brouillon
            </button>
            <button style={{ ...btnPrimary, background: COLORS.success }} disabled={!!busy} onClick={() => save(true)}>
              {busy === 'submit' ? <Loader2 size={14} /> : <CheckCircle2 size={14} />} Valider le compte rendu
            </button>
            <button style={btnGhost} disabled={!!busy || !!check?.loading} onClick={runCheck}>
              {check?.loading ? <Loader2 size={14} /> : <ShieldCheck size={14} />} {check?.loading ? 'Analyse en cours…' : 'Vérifier la cohérence'}
            </button>
            {canSend && (
              <button style={{ ...btnPrimary }} disabled={!!busy} onClick={sendToAgent}>
                {busy === 'send' ? <Loader2 size={14} /> : <Send size={14} />} Envoyer à l’agent
              </button>
            )}
          </>
        ) : (
          <>
            <span style={{ fontSize: 12, color: COLORS.muted, display: 'inline-flex', gap: 5, alignItems: 'center' }}>
              <ClipboardList size={13} /> Compte rendu en lecture seule.
            </span>
            {crepStatut === 'envoye_agent' && (
              <button style={btnGhost} disabled={!!busy} onClick={recall} title="Annuler l’envoi tant que l’agent n’a pas validé">
                {busy === 'recall' ? <Loader2 size={14} /> : <Undo2 size={14} />} Rappeler le compte rendu
              </button>
            )}
          </>
        )}
        <button style={{ ...btnGhost, marginLeft: 'auto' }} disabled={!!busy} onClick={openPdf}>
          {busy === 'pdf' ? <Loader2 size={14} /> : <FileDown size={14} />} Imprimer / PDF (4 pages)
        </button>
      </div>
    </div>
  );
}
