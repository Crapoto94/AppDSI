import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { PenLine, Monitor, Printer, CheckCircle2, ChevronRight, Loader2, Lock, RefreshCw, ArrowRight, Eye, FileText, Unlock, Download, Upload } from 'lucide-react';
import { COLORS, btnGhost, btnPrimary } from './ui';
import type { Entretien } from './types';

type Mode = 'manuscrit' | 'outil' | 'pdf';

/** Étapes du parcours (fil d'Ariane) selon le mode de saisie. */
const STEPS: Record<Mode, string[]> = {
  manuscrit: ['Mode de saisie', 'Imprimer le CREP', 'Entretien et signatures', 'Téléverser le CREP signé', 'Vérifier', 'Clôturer'],
  outil: ['Mode de saisie', 'Saisir le CREP', 'Valider la partie évaluateur', 'Imprimer', 'Signatures', 'Téléverser et vérifier', 'Clôturer'],
  // Deux téléversements : le formulaire rempli après l'entretien (étape 1-2), puis le CREP imprimé, commenté et signé (étape 5)
  pdf: ['Mode de saisie', 'Formulaire PDF hors ligne (1er téléversement)', 'Valider la partie évaluateur', 'Imprimer', 'Commentaires de l’agent·e et signatures', 'Téléverser le CREP signé (2e téléversement)', 'Clôturer'],
};

const stageKey = (id: number) => `ep_parcours_stage_${id}`;

/**
 * Parcours guidé du CREP : choix du mode de saisie (manuscrit ou dans l'outil), fil d'Ariane, et action à faire à l'étape en cours.
 * Le mode peut être changé à tout moment (tant que l'entretien n'est pas clôturé).
 */
export default function CrepParcours({ entretien, headers, busy, onChanged, onPrint, onValidate, onClose, formVisible, setFormVisible, incomplete, onStep, scanReading, isAdminUser, uploadSlot, onViewOriginal, onViewDigital, onOfflineDownload, onOfflineImport, offlineForm }: {
  /** Option « PDF formulaire hors ligne » activée dans le Paramétrage. */
  offlineForm?: boolean;
  /** PDF formulaire à remplir hors ligne (télécharger / réimporter). */
  onOfflineDownload?: () => void;
  onOfflineImport?: (f: File) => void;
  /** « Lecture des entretiens numérisés » activée : sinon on n'en parle jamais au valideur. */
  scanReading: boolean;
  isAdminUser: boolean;
  /** Bouton de téléversement du CREP signé : affiché dans ce cadre, à l'étape de téléversement. */
  uploadSlot?: React.ReactNode;
  /** Entretien clôturé : afficher le CREP original / la version numérique. */
  onViewOriginal: () => void;
  onViewDigital: () => void;
  /** Rubriques encore à compléter (mode manuscrit) après la lecture du document. */
  incomplete: string[];
  /** Étape en cours (pour que le formulaire n'affiche que ce qui est utile à cette étape). */
  onStep: (n: number) => void;
  entretien: Entretien;
  headers: Record<string, string>;
  busy: boolean;
  onChanged: (e: Entretien) => void;
  onPrint: () => void;
  onValidate: () => void;
  onClose: () => void;
  formVisible: boolean;
  setFormVisible: (v: boolean) => void;
}) {
  const mode = (entretien.crep_mode as Mode | null | undefined) || null;
  const closed = entretien.statut === 'cloture';
  const validated = entretien.evaluation_statut === 'soumis';
  const scans = entretien.crep_scans || [];
  // Identité du dernier document conservé : les choix « revenir / passer » ne valent que pour CE document (pas pour le suivant, ni après une remise à zéro)
  const scanSig = scans.length ? `${scans.length}:${(scans[scans.length - 1] as any).at || ''}` : '0';
  const verified = scans.some(s => (s as any).signatures_ok === true) || !!entretien.crep_signed_at;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  // Demande de réouverture (entretien clôturé) : motif obligatoire
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenBusy, setReopenBusy] = useState(false);
  const sendReopen = async () => {
    setReopenBusy(true); setErr('');
    try {
      await axios.post(`/api/entretiens/${entretien.id}/reopen-request`, { reason: reopenReason }, { headers });
      const r = await axios.get(`/api/entretiens/${entretien.id}`, { headers });
      onChanged(r.data); setReopenOpen(false); setReopenReason('');
    } catch (e: any) { setErr(e?.response?.data?.message || 'Envoi impossible.'); } finally { setReopenBusy(false); }
  };
  // Étapes « hors outil » (impression, entretien, signatures) : l'évaluateur avance à la main, la progression est mémorisée sur ce poste
  const [stage, setStage] = useState<number>(() => { try { return Number(localStorage.getItem(stageKey(entretien.id))) || 0; } catch { return 0; } });
  useEffect(() => { try { setStage(Number(localStorage.getItem(stageKey(entretien.id))) || 0); } catch { setStage(0); } }, [entretien.id]);
  const advance = (n: number) => { setStage(n); try { localStorage.setItem(stageKey(entretien.id), String(n)); } catch { /* ignore */ } };
  // « Revenir à l'étape précédente » : actif tant qu'aucun nouveau document n'a été appliqué (le nombre de scans conservés change à l'application)
  const redoKey = `ep_parcours_redo_${entretien.id}`;
  const [redoAt, setRedoAt] = useState<string | null>(() => { try { return localStorage.getItem(redoKey); } catch { return null; } });
  const redo = redoAt !== null && scanSig === redoAt;
  const goBack = () => { setRedoAt(scanSig); try { localStorage.setItem(redoKey, scanSig); } catch { /* ignore */ } };
  // Mode manuscrit : « revenir à l'étape précédente » depuis la clôture = revenir à la VÉRIFICATION (formulaire modifiable), pas au téléversement
  const recheckKey = `ep_parcours_recheck_${entretien.id}`;
  const [recheckAt, setRecheckAt] = useState<string | null>(() => { try { return localStorage.getItem(recheckKey); } catch { return null; } });
  const recheck = recheckAt !== null && scanSig === recheckAt;
  const setRecheck = (on: boolean) => { setRecheckAt(on ? scanSig : null); try { if (on) localStorage.setItem(recheckKey, scanSig); else localStorage.removeItem(recheckKey); } catch { /* ignore */ } };
  // « Passer à la clôture » malgré des rubriques non renseignées
  const proceedKey = `ep_parcours_proceed_${entretien.id}`;
  const [proceedAt, setProceedAt] = useState<string | null>(() => { try { return localStorage.getItem(proceedKey); } catch { return null; } });
  const proceed = proceedAt !== null && scanSig === proceedAt;
  const doProceed = () => { setRecheck(false); setProceedAt(scanSig); try { localStorage.setItem(proceedKey, scanSig); } catch { /* ignore */ } };

  const offlineRef = useRef<HTMLInputElement>(null);
  const chooseMode = async (m: Mode) => {
    if (m === mode) return;
    setSaving(true); setErr('');
    try {
      const r = await axios.put(`/api/entretiens/${entretien.id}/crep/mode`, { mode: m }, { headers });
      onChanged(r.data.entretien);
      advance(0);
      setFormVisible(m !== 'manuscrit');
    } catch (e: any) { setErr(e?.response?.data?.message || 'Changement de mode impossible.'); } finally { setSaving(false); }
  };

  // Des rubriques manquaient après la lecture : on reste à l'étape de vérification, même quand la dernière vient d'être saisie
  // (sinon la page passe à la clôture dès la première lettre tapée). On n'en sort que par le bouton « Vérification terminée ».
  const [sawIncomplete, setSawIncomplete] = useState<string | null>(null);
  useEffect(() => { if (incomplete.length > 0) setSawIncomplete(scanSig); }, [incomplete.length, scanSig]);
  const hadIncomplete = incomplete.length > 0 || sawIncomplete === scanSig;

  // Étape en cours (index dans STEPS[mode])
  let current = 0;
  if (mode === 'manuscrit') current = closed ? 6 : redo ? 3 : recheck ? 4 : verified ? ((hadIncomplete && !proceed) ? 4 : 5) : Math.min(3, 1 + stage);
  const om = mode === 'outil' || mode === 'pdf';   // même déroulé que la saisie dans l’outil
  if (om) current = closed ? 7 : redo ? 5 : verified ? 6 : validated ? Math.min(5, 3 + stage) : 1;
  const steps = mode ? STEPS[mode] : [];
  useEffect(() => { onStep(mode ? current : 0); }, [mode, current]);

  // Reste visible en haut de la fenêtre pendant le défilement : le bouton « Clôturer » ne disparaît jamais
  const card: React.CSSProperties = { border: '1px solid #c7d2fe', background: '#f8faff', borderRadius: 12, padding: '14px 16px', marginTop: 12, position: 'sticky', top: 0, zIndex: 20, boxShadow: '0 6px 14px -8px rgba(30,41,59,.35)' };
  const big = (m: Mode, icon: React.ReactNode, title: string, text: string) => (
    <button type="button" disabled={saving || busy} onClick={() => chooseMode(m)}
      style={{ flex: '1 1 260px', textAlign: 'left', cursor: 'pointer', border: `2px solid ${mode === m ? COLORS.primary : '#e2e8f0'}`, background: mode === m ? '#eef2ff' : '#fff', borderRadius: 12, padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 14, color: COLORS.text }}>{icon}{title}</div>
      <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.55, marginTop: 4 }}>{text}</div>
    </button>
  );

  // ─── Choix du mode (au début, puis modifiable)
  if (!mode) {
    return (
      <div style={card}>
        <div style={{ fontWeight: 800, fontSize: 14.5, color: COLORS.text, marginBottom: 4 }}>Comment allez-vous tenir le compte rendu (CREP) ?</div>
        <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 10 }}>Vous pourrez changer d’avis à tout moment, sans rien perdre.</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {big('manuscrit', <PenLine size={17} color="#d97706" />, 'À la main (manuscrit)', 'Vous imprimez le CREP, vous le remplissez avec l’agent·e et vous le faites signer. Vous le téléversez ensuite (scan ou photos) : l’outil lit le document et vérifie les 2 signatures. Vous vérifiez, puis vous clôturez.')}
          {offlineForm && big('pdf', <Download size={17} color="#7c3aed" />, 'PDF formulaire hors ligne', 'Vous téléchargez un PDF à remplir sans connexion (PC ou tablette) pendant l’entretien, puis vous l’importez (1er téléversement). Vous validez, imprimez ; l’agent·e écrit ses 2 cadres à la main et signe, vous signez, puis vous téléversez le CREP signé (2e téléversement).')}
          {big('outil', <Monitor size={17} color="#16a34a" />, 'Dans l’outil (saisie informatisée)', 'Vous saisissez les rubriques et la grille dans l’outil, vous validez votre partie, puis vous imprimez. L’agent·e complète ses 2 cadres et signe, vous signez, puis vous téléversez le CREP signé. Vous vérifiez et vous clôturez.')}
        </div>
        {err && <div style={{ color: COLORS.danger, fontSize: 12.5, marginTop: 8 }}>{err}</div>}
      </div>
    );
  }

  // ─── Fil d'Ariane + action de l'étape en cours
  const label = steps[Math.min(current, steps.length - 1)];
  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {steps.map((s, i) => {
          const done = i < current || closed;
          const cur = i === current && !closed;
          return (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 999, fontSize: 11.5, fontWeight: 800,
                background: cur ? COLORS.primary : done ? '#dcfce7' : '#f1f5f9', color: cur ? '#fff' : done ? '#166534' : '#64748b' }}>
                {done ? <CheckCircle2 size={12} /> : <span>{i + 1}</span>} {s}
              </span>
              {i < steps.length - 1 && <ChevronRight size={13} color="#94a3b8" />}
            </span>
          );
        })}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#64748b' }}>
          Mode : <strong>{mode === 'manuscrit' ? 'à la main' : mode === 'pdf' ? 'PDF hors ligne' : 'dans l’outil'}</strong>
          {!closed && (['manuscrit', 'outil', ...(offlineForm || mode === 'pdf' ? ['pdf'] : [])] as Mode[]).filter(m => m !== mode).map(m => (
            <button key={m} type="button" style={{ ...btnGhost, padding: '2px 8px', fontSize: 11.5 }} disabled={saving || busy} onClick={() => chooseMode(m)}
              title="Passer à un autre mode de saisie, sans rien perdre">
              <RefreshCw size={11} /> Passer en mode {m === 'manuscrit' ? 'manuscrit' : m === 'pdf' ? 'PDF hors ligne' : 'outil'}
            </button>
          ))}
        </span>
      </div>

      {closed ? (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 10 }}>
            <Lock size={15} /> Entretien clôturé : le CREP signé est archivé. Tout est terminé.
          </div>
          {/* Un entretien clôturé n'offre que trois choses */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button style={btnGhost} onClick={onViewOriginal}><Eye size={14} /> Afficher le CREP original</button>
            {(scanReading || isAdminUser) && <button style={btnGhost} onClick={onViewDigital}><FileText size={14} /> Afficher la version numérique</button>}
            {entretien.reopen_request?.status === 'en_attente'
              ? <span style={{ fontSize: 12.5, color: '#92400e', fontWeight: 700, alignSelf: 'center' }}>Demande de réouverture en attente de traitement</span>
              : <button style={btnGhost} onClick={() => setReopenOpen(true)}><Unlock size={14} /> Demander la réouverture</button>}
          </div>
          {entretien.reopen_request?.status === 'refusee' && (
            <div style={{ marginTop: 8, fontSize: 12.5, color: '#991b1b' }}>Dernière demande de réouverture refusée{entretien.reopen_request.decision_note ? ` : ${entretien.reopen_request.decision_note}` : '.'}</div>
          )}
          {reopenOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 3100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div style={{ background: '#fff', borderRadius: 14, width: 'min(520px, 100%)', padding: '20px 22px' }}>
                <div style={{ fontWeight: 800, fontSize: 16, color: COLORS.text, marginBottom: 6 }}>Demander la réouverture de l’entretien</div>
                <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 8 }}>Les administrateurs sont prévenus par e-mail. <strong>Justifiez votre demande</strong> (obligatoire).</div>
                <textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} rows={4} placeholder="Ex. : erreur sur l’appréciation générale, signature manquante…"
                  style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 8, fontSize: 13 }} />
                {err && <div style={{ color: COLORS.danger, fontSize: 12.5, marginTop: 6 }}>{err}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button style={btnGhost} onClick={() => { setReopenOpen(false); setErr(''); }}>Annuler</button>
                  <button style={{ ...btnPrimary, opacity: reopenReason.trim().length >= 10 ? 1 : .5 }} disabled={reopenBusy || reopenReason.trim().length < 10} onClick={sendReopen}>
                    {reopenBusy ? <Loader2 size={14} /> : <Unlock size={14} />} Envoyer la demande
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.65 }}>
          <div style={{ fontWeight: 800, color: COLORS.text, marginBottom: 3 }}>Étape en cours : {label}</div>

          {mode === 'manuscrit' && current <= 1 && <>
            <div>Imprimez le CREP vierge. Vous le remplirez à la main avec l’agent·e pendant l’entretien.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button style={btnPrimary} disabled={busy} onClick={onPrint}><Printer size={14} /> Imprimer le CREP</button>
              <button style={btnGhost} onClick={() => advance(1)}>Imprimé, passer à l’entretien <ArrowRight size={13} /></button>
            </div>
          </>}
          {mode === 'manuscrit' && current === 2 && <>
            <div><strong>Remplissez le CREP à la main</strong>, puis <strong>signez-le</strong> et <strong>transmettez-le à l’agent·e</strong> : il <strong>renseigne ses 2 cadres</strong> (conditions de travail, entretien) et <strong>signe à son tour</strong>. Quand il vous le rend, vous le contresignez.</div>
            <div style={{ marginTop: 8 }}><button style={btnPrimary} onClick={() => advance(2)}>Le CREP est signé par les deux, passer au téléversement <ArrowRight size={13} /></button></div>
          </>}
          {mode === 'manuscrit' && current === 3 && <>
            {scanReading
              ? <div><strong>Téléversez le CREP signé</strong> (scan ou photos des pages) avec le grand bouton ci-dessous. L’outil lit le document, contrôle la présence des <strong>2 signatures</strong> et vérifie que tout est complété ; il vous demandera de tout vérifier.</div>
              : <div><strong>Téléversez le CREP signé</strong> (scan ou photos des pages) avec le grand bouton ci-dessous. Vous pourrez ensuite le consulter, le valider, puis clore l’entretien.</div>}
          </>}
          {mode === 'manuscrit' && current === 3 && uploadSlot && <div style={{ marginTop: 10 }}>{uploadSlot}</div>}
          {mode === 'manuscrit' && current === 4 && <>
            <div>Vérifiez le contenu du CREP et corrigez-le si besoin dans le formulaire ci-dessous.</div>
            {incomplete.length > 0 && <>
              <div style={{ color: '#92400e', fontWeight: 700, marginTop: 6 }}>Rubriques non renseignées ({incomplete.length}) : vous pouvez les compléter, ou passer à la clôture sans les renseigner.</div>
              <ul style={{ margin: '4px 0 0 18px', padding: 0, fontSize: 12.5 }}>{incomplete.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </>}
            <div style={{ marginTop: 8 }}><button style={btnPrimary} onClick={doProceed}>Vérification terminée, passer à la clôture <ArrowRight size={13} /></button></div>
          </>}
          {mode === 'manuscrit' && current === 5 && <>
            <div>Le contenu et les 2 signatures ont été vérifiés. Cliquez sur <strong>Clôturer l’entretien</strong> : le compte rendu est validé et le CREP signé est archivé.</div>
            {incomplete.length > 0 && <div style={{ marginTop: 4, fontSize: 12, color: '#92400e' }}>{incomplete.length} rubrique(s) non renseignée(s) : une confirmation vous sera demandée.</div>}
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={{ ...btnPrimary, background: COLORS.success }} disabled={busy} onClick={onClose}><Lock size={14} /> Clôturer l’entretien</button>
              <button style={btnGhost} disabled={busy} onClick={() => setRecheck(true)}>Revenir à l’étape précédente (vérification)</button>
            </div>
          </>}

          {mode === 'pdf' && current === 1 && <>
            <div><strong>Avant ou pendant l’entretien, sans connexion :</strong> téléchargez le <strong>PDF formulaire</strong> (au modèle de l’agent·e), ouvrez-le avec Adobe Acrobat Reader (ou une application PDF de tablette), renseignez-le et enregistrez-le. De retour en ligne, <strong>importez-le</strong> : c’est le <strong>1er téléversement</strong>. Les 2 cadres de l’agent·e restent vides : il les écrira à la main sur le papier.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button style={btnPrimary} disabled={busy || !onOfflineDownload} onClick={onOfflineDownload}><Download size={14} /> Télécharger le PDF formulaire</button>
              <button style={btnPrimary} disabled={busy || !onOfflineImport} onClick={() => offlineRef.current?.click()}><Upload size={14} /> Importer le PDF rempli</button>
              <input ref={offlineRef} type="file" accept="application/pdf,.pdf" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f && onOfflineImport) onOfflineImport(f); }} />
            </div>
            <div style={{ marginTop: 8 }}>Vérifiez ensuite le contenu repris dans le formulaire ci-dessous, puis validez votre partie. Vous pouvez aussi saisir directement en ligne.</div>
            <div style={{ marginTop: 8 }}><button style={{ ...btnPrimary, background: COLORS.success }} disabled={busy} onClick={onValidate}><CheckCircle2 size={14} /> Valider la partie évaluateur</button></div>
          </>}
          {mode === 'outil' && current === 1 && <>
            <div>Saisissez les rubriques et <strong>la grille d’appréciation</strong>, puis cliquez sur <strong>Valider la partie évaluateur</strong>. Rien n’est envoyé à l’agent·e.</div>
            <div style={{ marginTop: 8 }}><button style={{ ...btnPrimary, background: COLORS.success }} disabled={busy} onClick={onValidate}><CheckCircle2 size={14} /> Valider la partie évaluateur</button></div>
          </>}
          {om && current === 3 && <>
            <div>Imprimez le CREP : l’agent·e y renseignera ses 2 cadres et le signera, puis vous le signerez.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button style={btnPrimary} disabled={busy} onClick={onPrint}><Printer size={14} /> Imprimer le CREP</button>
              <button style={btnGhost} onClick={() => advance(1)}>Imprimé, passer aux signatures <ArrowRight size={13} /></button>
            </div>
          </>}
          {om && current === 4 && <>
            <div>L’<strong>agent·e renseigne ses 2 cadres</strong> (observations sur les conditions de travail et sur l’entretien) <strong>et signe à la main</strong> ; <strong>vous contresignez</strong>.{mode === 'pdf' && <> Ces 2 cadres sont imprimés vides : l’agent·e les <strong>écrit à la main</strong>, c’est ce que le 2e téléversement récupère.</>}</div>
            <div style={{ marginTop: 8 }}><button style={btnPrimary} onClick={() => advance(2)}>Le CREP est signé par les deux, passer au téléversement <ArrowRight size={13} /></button></div>
          </>}
          {om && current === 5 && <>
{scanReading
              ? <div><strong>Téléversez le CREP signé</strong> (scan ou photos) avec le grand bouton ci-dessous. L’outil lit <strong>les 2 cadres de l’agent·e</strong> et contrôle les <strong>2 signatures</strong> ; vous vérifiez ces éléments.</div>
              : <div><strong>Téléversez le CREP signé</strong> (scan ou photos) avec le grand bouton ci-dessous. Vous pourrez ensuite le consulter, le valider, puis clore l’entretien.</div>}
          </>}
          {om && current === 5 && uploadSlot && <div style={{ marginTop: 10 }}>{uploadSlot}</div>}
          {om && current === 6 && <>
            <div>Les 2 cadres de l’agent·e et les 2 signatures ont été vérifiés. Cliquez sur <strong>Clôturer l’entretien</strong> : le CREP signé est archivé.</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button style={{ ...btnPrimary, background: COLORS.success }} disabled={busy} onClick={onClose}><Lock size={14} /> Clôturer l’entretien</button>
              <button style={btnGhost} disabled={busy} onClick={goBack}>Revenir à l’étape précédente</button>
            </div>
          </>}

          {((mode === 'manuscrit' && current >= 4 && scanReading) || (om && current >= 6)) && (
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <button type="button" style={{ ...btnGhost, padding: '2px 8px', fontSize: 11.5 }} onClick={() => setFormVisible(!formVisible)}>
                {formVisible ? 'Masquer le CREP saisi' : 'Visualiser le CREP saisi'}
              </button>
              <span style={{ color: '#64748b', marginLeft: 8 }}>{current >= (om ? 6 : 5) ? 'En lecture seule à cette étape.' : 'Le formulaire sert à vérifier et corriger.'}</span>
            </div>
          )}
        </div>
      )}
      {(saving || busy) && <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}><Loader2 size={12} /> …</div>}
      {err && <div style={{ color: COLORS.danger, fontSize: 12.5, marginTop: 8 }}>{err}</div>}
    </div>
  );
}
