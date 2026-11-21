import { useState } from 'react';
import { X, ChevronRight, ChevronLeft, BookOpen, CheckCircle2, XCircle } from 'lucide-react';
import { COLORS, btnGhost, btnPrimary } from './ui';

export type TutoRole = 'valideur' | 'agent' | 'admin';

const KEY = (role: TutoRole, user: string) => `ep_tuto_v2_${role}_${user || 'anon'}`;
export const tutoSeen = (role: TutoRole, user: string): boolean => { try { return localStorage.getItem(KEY(role, user)) === '1'; } catch { return true; } };
export const tutoMarkSeen = (role: TutoRole, user: string) => { try { localStorage.setItem(KEY(role, user), '1'); } catch { /* ignore */ } };

interface Quiz { question: string; options: Array<{ label: string; ok: boolean; why: string }> }
interface Step {
  emoji: string;
  quest: string;
  title: string;
  body: React.ReactNode;
  example?: React.ReactNode;
  shot?: string;
  quiz?: Quiz;
  xp: number;
}

const Ex = ({ children }: { children: React.ReactNode }) => <>{children}</>;
const B = ({ children }: { children: React.ReactNode }) => <strong>{children}</strong>;

const STEPS: Record<TutoRole, Step[]> = {
  valideur: [
    { emoji: '👋', quest: 'Présentation', title: 'Votre parcours en 6 étapes', xp: 50,
      body: <>Vous allez conduire les entretiens professionnels de votre équipe dans MagApp. Ce court parcours de <B>2 minutes</B> présente
        les étapes et les boutons à utiliser, avec des exemples. Il reste consultable à tout moment depuis l'aide.
        <ol style={{ margin: '10px 0 0 18px', padding: 0, lineHeight: 1.8 }}>
          <li>Retrouver vos agent·e·s</li><li>Prendre rendez-vous</li><li>Mener l'entretien et noter</li><li>Téléverser le CREP signé</li><li>Contrôler (selon le réglage)</li><li>Clôturer et transmettre l'original à la DRH</li>
        </ol></> },
    { emoji: '🧑‍🤝‍🧑', quest: 'Étape 1', title: 'Retrouver vos agent·e·s', xp: 100, shot: '/aide-ep/01-liste.jpg',
      body: <>Ouvrez l'onglet <B>« EP que je réalise »</B> : c'est votre tableau de bord. Chaque ligne est un·e agent·e à évaluer.</>,
      example: <Ex>Exemple : il manque <B>Hélène Garnier</B> dans votre liste ? Cliquez sur <B>« Ajouter un·e agent·e »</B>, cherchez son nom, puis <B>« Ajouter »</B>. Elle apparaît aussitôt.
        Un·e agent·e affecté au mauvais évaluateur·rice ? Utilisez l'icône « Changer l'évaluateur » sur sa ligne.</Ex> },
    { emoji: '📅', quest: 'Étape 2', title: 'Prendre rendez-vous', xp: 150, shot: '/aide-ep/02-planifier.jpg',
      body: <><B>Cette étape est facultative.</B> Vous pouvez toujours fixer la date « à l'ancienne » (de vive voix, par téléphone ou par courrier). L'outil n'est qu'une <B>aide</B> : recherche de créneaux communs et envoi de la convocation par e-mail.
        <div style={{ marginTop: 8 }}>Pour l'utiliser : sur la ligne de l'agent·e, cliquez sur <B>« Planifier »</B>, puis <B>« Prochains créneaux libres »</B> (l'outil lit vos agendas et propose des créneaux où vous êtes tous les deux libres), choisissez un créneau et validez.</div>
        <div style={{ marginTop: 8 }}><B>Si l'agent·e n'a pas d'adresse e-mail</B>, aucune convocation ne peut partir : vous devez de toute façon le convoquer par un autre moyen (vive voix, téléphone, courrier) et lui remettre le CREP vierge imprimé.</div></>,
      example: <Ex>Exemple : pour <B>Julien Lefèvre</B>, vous choisissez « Mardi 1<sup>er</sup> décembre, 8h–10h ». Julien reçoit une invitation Outlook et un e-mail avec le CREP vierge.</Ex> },
    { emoji: '📨', quest: 'Étape 2 (cas particulier)', title: 'Cas particulier : l\'agent·e « sans e-mail »', xp: 100, shot: '/aide-ep/05-lier-ad.jpg',
      body: <>Marc Petit apparaît avec <B>« Lier l'AD »</B> au lieu d'une adresse. Souvent, c'est juste que son nom est écrit un peu différemment dans la base RH et dans l'annuaire informatique.
        Si vous savez qu'il a un e-mail : cliquez sur <B>« Lier l'AD »</B>, tapez quelques lettres de son nom, vérifiez l'adresse, puis <B>« Lier »</B>.</>,
      quiz: { question: 'Marc Petit a bien une adresse e-mail (vous lui écrivez tous les jours). Que faites-vous ?', options: [
        { label: 'Je cherche son nom dans « Lier l\'AD » et je le rattache', ok: true, why: 'Correct. Il pourra recevoir la convocation et signer en ligne.' },
        { label: 'Je laisse tel quel et j\'imprime tout', ok: false, why: 'Ça marcherait, mais vous vous privez de l\'invitation et de la signature en ligne. Essayez « Lier l\'AD ».' },
        { label: 'Je recrée l\'agent·e moi-même', ok: false, why: 'Non : on ne crée jamais un·e agent·e. On le rattache à son compte avec « Lier l\'AD ».' },
      ] } },
    { emoji: '🎤', quest: 'Étape 3', title: 'Mener l\'entretien et noter', xp: 150, shot: '/aide-ep/07-crep.jpg',
      body: <>Le jour J, cliquez sur <B>« Saisir l'EP »</B> et remplissez le compte rendu dans l'outil. L'<B>enregistrement est automatique</B> : rien n'est envoyé à l'agent·e tant que vous ne validez pas. La grille d'appréciation se coche comme sur le papier (une ligne par critère, cases <B>S / AS / I</B>) ; la rubrique « Mobilité » est facultative.
        <div style={{ marginTop: 8 }}>Vous préférez écrire à la main ? C'est permis : imprimez le CREP vierge avant, écrivez pendant, puis téléversez le document signé à l'étape suivante.</div></>,
      example: <Ex>Exemple : <B>Nadia Roux</B> a passé son entretien mardi. Vous ouvrez son EP, vous remplissez le bilan, les objectifs, l'appréciation générale, et vous cliquez sur <B>« Vérifier la cohérence »</B> : l'outil vous liste ce qui manque.</Ex> },
    { emoji: '📸', quest: 'Étape 4', title: 'Téléverser le CREP signé : l’IA lit pour vous', xp: 150, shot: '/aide-ep/07-crep.jpg',
      body: <>Le CREP est signé par l'agent·e et par vous ? Dans le cadre du <B>fil d'Ariane</B>, cliquez sur le <B>grand bouton de téléversement</B> et choisissez <B>toutes les pages</B> d'un coup. L'<B>IA locale de la Ville</B> les lit en tâche de fond (environ 30 secondes par page) :
        un bandeau « Analyse en cours » apparaît, <B>vous pouvez fermer la fenêtre</B>, et vous recevez un <B>e-mail</B> quand c'est prêt. Cliquez alors sur <B>« Voir la proposition »</B>.
        <div style={{ marginTop: 8 }}>L'IA lit aussi <B>les cases cochées</B> de la grille. Mais ce n'est qu'une <B>proposition</B> : vous devez <B>vérifier chaque ligne</B> et cocher « J'ai vérifié chaque ligne » pour l'appliquer. Le document produit porte le filigrane <B>« DOCUMENT NON CONTRACTUEL »</B> : <B>l'original papier signé fait foi</B>.</div></>,
      example: <Ex>Exemple : l'IA lit « Sedit France » ; vous corrigez en <B>« Sedit Finances »</B> avant d'appliquer. Si le compte rendu avait déjà été saisi dans l'outil, l'IA ne lit que <B>les 2 commentaires de l'agent·e</B>.</Ex>,
      quiz: { question: 'L\'IA a rempli tout le compte rendu à partir de vos photos. Que faites-vous avant de valider ?', options: [
        { label: 'Je valide directement : l\'IA ne se trompe pas', ok: false, why: 'L\'IA peut mal lire une écriture : c\'est vous qui répondez du contenu.' },
        { label: 'Je vérifie chaque ligne en regardant le papier, puis je valide', ok: true, why: 'Exact. La case « J\'ai vérifié chaque ligne » le rappelle.' },
      ] } },
    { emoji: '✅', quest: 'Étape 5', title: 'Valider le compte rendu', xp: 100,
      body: <>Après vérification, validez le compte rendu : l'EP passe à <B>« Réalisé »</B>. En mode outil, c'est le bouton <B>« Valider la partie évaluateur »</B> ; en mode manuscrit, la validation se fait avec la <B>clôture</B>. Les rubriques obligatoires sont signalées (« Mobilité » est facultative).</>,
      quiz: { question: 'Vous avez rempli le CREP à la main. Que faut-il faire avant de scanner le papier signé ?', options: [
        { label: 'Rien, je scanne directement', ok: false, why: 'Le bouton d\'archivage reste fermé : l\'EP doit d\'abord être « Réalisé ».' },
        { label: 'Reporter le contenu dans l\'outil puis « Valider le compte rendu »', ok: true, why: 'Exact. L\'import du scan peut faire gagner du temps.' },
        { label: 'Prévenir l\'administrateur', ok: false, why: 'Pas besoin : vous pouvez le faire vous-même.' },
      ] } },
    { emoji: '✍️', quest: 'Étape 6 (dernière)', title: 'Clôturer et transmettre l’original à la DRH', xp: 200, shot: '/aide-ep/06-statuts.jpg',
      body: <>Deux circuits, <B>un seul document</B> : <br />
        <B>Électronique</B> (agent·e et vous avec e-mail, signature ouverte) : « Envoyer à l'agent·e » → il valide → vous signez dans le parapheur → archivé tout seul.<br />
        <B>Papier</B> (pas d'e-mail, ou signature non ouverte) : « Imprimer / PDF », signatures, scan, puis <B>« CREP manuscrit (4 pages scannées) »</B>.<br />
        <B>Dans tous les cas où il y a du papier : transmettez l'ORIGINAL signé à la DRH</B>, puis cliquez sur <B>« Clôturer l'entretien »</B>. Quand la DRH l'a reçu, un administrateur le déclare : vous le voyez dans le compteur <B>« Reçus par la DRH »</B>.</>,
      quiz: { question: 'Éric Moulin n\'a pas d\'adresse e-mail. Quel circuit ?', options: [
        { label: 'Circuit électronique : « Envoyer à l\'agent·e »', ok: false, why: 'Le bouton n\'apparaîtra pas : il faut une adresse e-mail.' },
        { label: 'Circuit papier : imprimer, signer, scanner, « CREP manuscrit » — et l\'original signé part à la DRH', ok: true, why: 'Exact. Le résultat numérique est identique ; l\'original papier signé fait foi.' },
      ] } },
  ],
  agent: [
    { emoji: '👋', quest: 'Présentation', title: 'Votre entretien professionnel', xp: 50,
      body: <>L'entretien professionnel est un moment d'échange annuel avec votre responsable. Cet outil vous aide à le <B>préparer</B>, à <B>relire</B> le compte rendu et à le <B>signer</B>, sans paperasse. Ce parcours dure 1 minute.</> },
    { emoji: '📝', quest: 'Étape 1', title: 'Préparer votre entretien', xp: 150, shot: '/aide-ep/08-agent.jpg',
      body: <>Vous avez reçu un e-mail avec la date. Complétez la fiche : bilan de l'année, réalisations, difficultés, souhaits de formation, perspectives. <B>« Enregistrer le brouillon »</B> à tout moment, <B>« Transmettre ma préparation »</B> quand c'est prêt.</>,
      example: <Ex>Exemple : « J'ai pris en charge le suivi des commandes de 2 services. Je souhaite me former à Excel avancé. » Quelques phrases suffisent : c'est une base de discussion, pas un examen.</Ex> },
    { emoji: '📖', quest: 'Étape 2', title: 'Relire le compte rendu', xp: 150,
      body: <>Après l'entretien, votre responsable vous envoie le compte rendu. Relisez-le, puis remplissez <B>vos deux cases</B> : vos observations sur les conditions de travail, et sur l'entretien. Rien à dire ? Écrivez <B>« Néant »</B>.</>,
      quiz: { question: 'Vous n\'avez aucune remarque à ajouter. Que mettez-vous dans les deux cases ?', options: [
        { label: 'Je les laisse vides', ok: false, why: 'Elles sont obligatoires pour valider.' },
        { label: 'J\'écris « Néant »', ok: true, why: 'Exact.' },
      ] } },
    { emoji: '🖊️', quest: 'Étape 3 (dernière)', title: 'Valider et signer', xp: 150,
      body: <>Cliquez sur <B>« Valider et envoyer pour signature »</B>. Vous recevrez ensuite un e-mail avec votre lien de signature : un clic, et c'est signé. Pas de signature en ligne pour vous ? Votre responsable vous fera signer le papier.</> },
  ],
  admin: [
    { emoji: '👋', quest: 'Présentation', title: 'Préparer le cadre', xp: 50,
      body: <>Votre rôle : préparer le cadre, pas saisir les EP. Parcours de 1 minute.</> },
    { emoji: '⚙️', quest: 'Étape 1', title: 'Paramétrage', xp: 150,
      body: <>Dans <B>« Paramétrage »</B> : désignez les évaluateur·rice·s, déposez le classeur « Outil CREP », créez la campagne, ouvrez ou non la signature électronique.</> },
    { emoji: '📄', quest: 'Étape 2', title: 'La note à la Direction générale', xp: 100, shot: '/aide-ep/09-note-dg.jpg',
      body: <>Le bouton <B>« Ouvrir / modifier la note »</B> ouvre la note stratégique dans un éditeur visuel : titres, gras, listes, comme dans un traitement de texte.</> },
    { emoji: '🎓', quest: 'Étape 3', title: 'Les demandes de formation', xp: 150,
      body: <>L'onglet <B>« Demandes de formation »</B> liste les demandes des comptes rendus selon les <B>3 types</B>, par direction puis par service, <B>sans aucun nom d'agent</B>. Le bouton <B>« Analyser avec l'IA locale »</B> les regroupe en thèmes (management = encadrement ; Word, Excel = bureautique…) et rédige une synthèse des besoins globaux pour la DRH.</>,
      quiz: { question: 'L\'analyse IA des formations montre-t-elle qui a demandé quoi ?', options: [
        { label: 'Oui, avec le nom des agent·e·s', ok: false, why: 'Non : l\'analyse est volontairement non nominative.' },
        { label: 'Non : seulement les textes, les types, les directions et les services', ok: true, why: 'Exact. Aucun nom n\'est affiché ni transmis à l\'IA.' },
      ] } },
    { emoji: '📊', quest: 'Étape 4 (dernière)', title: 'Piloter', xp: 150,
      body: <><B>« Pilotage »</B> donne l'avancement par direction. Les <B>compteurs</B> du haut sont <B>cliquables : ils filtrent la liste</B>. Le bouton <B>« Aperçu CREP »</B> propose le CREP numérisé ou reconstruit, et le menu <B>« ⋯ »</B> permet de déclarer qu'un CREP est <B>reçu par la DRH</B> (ce qui alimente les compteurs « À transmettre » et « Reçus par la DRH », visibles aussi des évaluateur·rice·s). <B>« Journal »</B> trace chaque action. Le bouton <B>Aide</B>, en haut, détaille tous les cas.</> },
  ],
};

/** Lecture des entretiens numérisés désactivée : pas d'étape de vérification de la lecture, l’évaluateur·rice consulte le document et confirme les signatures. */
function adaptSteps(role: TutoRole, scanReading: boolean): Step[] {
  const base = STEPS[role];
  if (scanReading || role !== 'valideur') return base;
  return base.map(st => st.quest === 'Étape 4'
    ? { emoji: '📸', quest: 'Étape 4', title: 'Téléverser le CREP signé', xp: 150, shot: '/aide-ep/07-crep.jpg',
        body: <>Le CREP est signé par l'agent·e et par vous ? Dans le cadre du <B>fil d'Ariane</B>, cliquez sur le <B>grand bouton de téléversement</B> et choisissez <B>toutes les pages</B> d'un coup (photos ou PDF).
          <div style={{ marginTop: 8 }}>Cliquez sur <B>« Consulter le document »</B> : il s'ouvre aussitôt, sans rien télécharger. Cochez qu'il porte <B>la signature de l'agent·e</B> et <B>la vôtre</B>, puis <B>« Valider le document »</B>. Il n'y a rien d'autre à vérifier : le contenu n'est pas relu.</div></>,
        example: <Ex>Exemple : le document de <B>Nadia Roux</B> est lisible et porte les 2 signatures : vous cochez les 2 cases, vous validez, puis vous clôturez.</Ex>,
        quiz: { question: 'Que contrôlez-vous après avoir téléversé le document signé ?', options: [
          { label: 'Chaque ligne du compte rendu, comparée au papier', ok: false, why: 'Pas dans ce mode : le document signé fait foi et vous ne vérifiez que les 2 signatures.' },
          { label: 'Que le document est lisible, complet et porte les 2 signatures', ok: true, why: 'Exact. Vous le validez puis vous clôturez.' },
        ] } }
    : st);
}

export default function TutoEp({ role, onClose, onOpenAide, scanReading = false }: { role: TutoRole; onClose: () => void; onOpenAide: () => void; scanReading?: boolean }) {
  const steps = adaptSteps(role, scanReading);
  const [i, setI] = useState(0);
  const [answered, setAnswered] = useState<Record<number, number>>({});
  const [earned, setEarned] = useState<Record<number, boolean>>({});
  const step = steps[Math.min(i, steps.length - 1)]; // à l'écran de fin (i = steps.length) on garde la dernière étape en arrière-plan
  const last = i === steps.length - 1;
  const quiz = step.quiz;
  const picked = answered[i];
  const quizDone = !quiz || (picked !== undefined && !!quiz.options[picked]?.ok);

  const pick = (k: number) => {
    setAnswered(a => ({ ...a, [i]: k }));
    if (quiz && quiz.options[k].ok) setEarned(e => ({ ...e, [i]: true }));
  };
  const next = () => { if (!quiz) setEarned(e => ({ ...e, [i]: true })); setI(x => x + 1); };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'linear-gradient(135deg,#312e81 0%,#4f46e5 55%,#7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 760, background: '#fff', borderRadius: 18, boxShadow: '0 25px 60px rgba(15,23,42,.45)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', background: '#eef2ff', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 800, color: COLORS.primary, marginBottom: 4 }}>
              <span>{i < steps.length ? `Étape ${i + 1} / ${steps.length}` : ''}</span>
              <span>{Math.min(i + 1, steps.length)} sur {steps.length}</span>
            </div>
            <div style={{ height: 9, background: '#c7d2fe', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${((i + (earned[i] ? 1 : 0)) / steps.length) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#4f46e5,#a855f7)', transition: 'width .35s' }} />
            </div>
          </div>
          <button style={{ ...btnGhost, padding: '5px 9px', fontSize: 12 }} onClick={onClose} title="Passer le tutoriel"><X size={14} /> Passer</button>
        </div>

        <div style={{ padding: '22px 26px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: '#eef2ff', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 900, flexShrink: 0 }}>{Math.min(i + 1, steps.length)}</div>
            <div>
              <div style={{ display: 'inline-block', background: '#4f46e5', color: '#fff', borderRadius: 999, padding: '2px 11px', fontSize: 11.5, fontWeight: 800 }}>{step.quest}</div>
              <h2 style={{ margin: '5px 0 0', fontSize: 21, fontWeight: 900, color: COLORS.text }}>{step.title}</h2>
            </div>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.65, color: '#334155' }}>{step.body}</div>
          {step.example && (
            <div style={{ marginTop: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 11, padding: '10px 13px', fontSize: 13, lineHeight: 1.6, color: '#78350f' }}>
              {step.example}
            </div>
          )}
          {step.shot && (
            <a href={step.shot} target="_blank" rel="noopener noreferrer">
              <img src={step.shot} alt="" style={{ display: 'block', width: '100%', marginTop: 12, borderRadius: 10, border: '1px solid #e2e8f0' }} />
            </a>
          )}
          {quiz && (
            <div style={{ marginTop: 14, background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontWeight: 800, color: '#5b21b6', marginBottom: 8, fontSize: 13.5 }}>Vérification : {quiz.question}</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {quiz.options.map((o, k) => {
                  const sel = picked === k;
                  return (
                    <button key={k} onClick={() => pick(k)} style={{ textAlign: 'left', cursor: 'pointer', padding: '8px 11px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                      border: `2px solid ${sel ? (o.ok ? '#16a34a' : '#dc2626') : '#e2e8f0'}`, background: sel ? (o.ok ? '#f0fdf4' : '#fef2f2') : '#fff', color: COLORS.text }}>
                      {sel && (o.ok ? <CheckCircle2 size={14} color="#16a34a" style={{ verticalAlign: -2, marginRight: 6 }} /> : <XCircle size={14} color="#dc2626" style={{ verticalAlign: -2, marginRight: 6 }} />)}
                      {o.label}
                      {sel && <div style={{ fontWeight: 500, fontSize: 12.5, marginTop: 3, color: o.ok ? '#166534' : '#991b1b' }}>{o.why}</div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '14px 26px 20px', display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <button style={{ ...btnGhost, visibility: i === 0 ? 'hidden' : 'visible' }} onClick={() => setI(x => Math.max(0, x - 1))}><ChevronLeft size={15} /> Précédent</button>
          <div style={{ display: 'flex', gap: 5 }}>
            {steps.map((_, k) => <span key={k} style={{ width: 9, height: 9, borderRadius: 999, background: k === i ? '#4f46e5' : earned[k] ? '#a5b4fc' : '#e2e8f0' }} />)}
          </div>
          {!last ? (
            <button style={{ ...btnPrimary, opacity: quizDone ? 1 : .5 }} disabled={!quizDone} onClick={next}>
              {quiz && !quizDone ? 'Répondez pour continuer' : 'Suivant'} <ChevronRight size={15} />
            </button>
          ) : !quizDone ? (
            <button style={{ ...btnPrimary, opacity: .5 }} disabled>Répondez pour terminer</button>
          ) : (
            <button style={btnPrimary} onClick={() => { setEarned(e => ({ ...e, [i]: true })); setI(steps.length); }}><CheckCircle2 size={15} /> Terminer</button>
          )}
        </div>
      </div>

      {i >= steps.length && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3100, background: 'linear-gradient(135deg,#312e81 0%,#4f46e5 55%,#7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 18, padding: '30px 28px', textAlign: 'center', boxShadow: '0 25px 60px rgba(15,23,42,.45)' }}>
            <CheckCircle2 size={52} color="#16a34a" />
            <h2 style={{ margin: '10px 0 4px', fontSize: 22, fontWeight: 900, color: COLORS.text }}>Tutoriel terminé</h2>
            <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.6, margin: '14px 0 20px' }}>
              Vous avez parcouru les étapes essentielles. Le bouton <strong>« Aide »</strong> (en haut à droite) reste disponible à tout moment, avec tous les cas détaillés et des captures d'écran.
              Ce tutoriel peut être rouvert depuis l'aide.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button style={btnGhost} onClick={() => { onClose(); onOpenAide(); }}><BookOpen size={15} /> Ouvrir l'aide complète</button>
              <button style={btnPrimary} onClick={onClose}><CheckCircle2 size={15} /> Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
