import { createContext, useContext, useState, type ReactNode } from 'react';
import { X, ChevronRight, ChevronLeft, BookOpen, CheckCircle2, XCircle, Lightbulb } from 'lucide-react';
import { COLORS, btnGhost, btnPrimary } from './ui';
import { HtmlView, useHelpContents } from './helpContent';

export type TutoRole = 'valideur' | 'agent' | 'admin';

const KEY = (role: TutoRole, user: string) => `ep_tuto_v2_${role}_${user || 'anon'}`;
export const tutoSeen = (role: TutoRole, user: string): boolean => { try { return localStorage.getItem(KEY(role, user)) === '1'; } catch { return true; } };
export const tutoMarkSeen = (role: TutoRole, user: string) => { try { localStorage.setItem(KEY(role, user), '1'); } catch { /* ignore */ } };

interface Quiz { question: string; options: Array<{ label: string; ok: boolean; why: string }> }
export interface Step {
  /** Identifiant stable, utilisé pour les textes réécrits par les administrateurs. */
  id?: string;
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

/** Faux quand l'aide pas à pas est désactivée : on n'y renvoie pas. */
const AideCtx = createContext(true);
const SiAide = ({ children }: { children: ReactNode }) => (useContext(AideCtx) ? <>{children}</> : null);

const STEPS: Record<TutoRole, Step[]> = {
  valideur: [
    { id: 'valideur-0', emoji: '👋', quest: 'Présentation', title: 'Votre parcours en 6 étapes', xp: 50,
      body: <>Vous allez conduire les entretiens professionnels de votre équipe dans MagApp. Ce court parcours de <B>2 minutes</B> présente
        les étapes et les boutons à utiliser, avec des exemples. Il reste consultable à tout moment depuis l'aide.
        <ol style={{ margin: '10px 0 0 18px', padding: 0, lineHeight: 1.8 }}>
          <li>Retrouver vos agent·e·s</li><li>Prendre rendez-vous</li><li>Mener l'entretien et noter</li><li>Téléverser le CREP signé</li><li>Contrôler (selon le réglage)</li><li>Clôturer et transmettre l'original à la DRH</li>
        </ol></> },
    { id: 'valideur-1', emoji: '🧑‍🤝‍🧑', quest: 'Étape 1', title: 'Retrouver vos agent·e·s', xp: 100, shot: '/aide-ep/01-liste.jpg',
      body: <>Ouvrez l'onglet <B>« EP que je réalise »</B> : c'est votre tableau de bord. Chaque ligne est un·e agent·e à évaluer.</>,
      example: <Ex>Exemple : il manque <B>Hélène Garnier</B> dans votre liste ? Cliquez sur <B>« Ajouter un·e agent·e »</B>, cherchez son nom, puis <B>« Ajouter »</B>. Elle apparaît aussitôt.
        Un·e agent·e affecté au mauvais évaluateur·rice ? Utilisez l'icône « Changer l'évaluateur » sur sa ligne.</Ex> },
    { id: 'valideur-2', emoji: '📅', quest: 'Étape 2', title: 'Prendre rendez-vous', xp: 150, shot: '/aide-ep/02-planifier.jpg',
      body: <><B>Cette étape est facultative.</B> Vous pouvez toujours fixer la date « à l'ancienne » (de vive voix, par téléphone ou par courrier). L'outil n'est qu'une <B>aide</B> : recherche de créneaux communs et envoi de la convocation par e-mail.
        <div style={{ marginTop: 8 }}>Pour l'utiliser : sur la ligne de l'agent·e, cliquez sur <B>« Planifier »</B>, puis <B>« Prochains créneaux libres »</B> (l'outil lit vos agendas et propose des créneaux où vous êtes tous les deux libres), choisissez un créneau et validez.</div>
        <div style={{ marginTop: 8 }}><B>Si l'agent·e n'a pas d'adresse e-mail</B>, aucune convocation ne peut partir : vous devez de toute façon le convoquer par un autre moyen (vive voix, téléphone, courrier) et lui remettre le CREP vierge imprimé.</div></>,
      example: <Ex>Exemple : pour <B>Julien Lefèvre</B>, vous choisissez « Mardi 1<sup>er</sup> décembre, 8h–10h ». Julien reçoit une invitation Outlook et un e-mail avec le CREP vierge.</Ex> },
    { id: 'valideur-3', emoji: '📨', quest: 'Étape 2 (cas particulier)', title: 'Cas particulier : l\'agent·e « sans e-mail »', xp: 100, shot: '/aide-ep/05-lier-ad.jpg',
      body: <>Marc Petit apparaît avec <B>« Lier l'AD »</B> au lieu d'une adresse. Souvent, c'est juste que son nom est écrit un peu différemment dans la base RH et dans l'annuaire informatique.
        Si vous savez qu'il a un e-mail : cliquez sur <B>« Lier l'AD »</B>, tapez quelques lettres de son nom, vérifiez l'adresse, puis <B>« Lier »</B>.</>,
      quiz: { question: 'Marc Petit a bien une adresse e-mail (vous lui écrivez tous les jours). Que faites-vous ?', options: [
        { label: 'Je cherche son nom dans « Lier l\'AD » et je le rattache', ok: true, why: 'Correct. Il pourra recevoir la convocation et signer en ligne.' },
        { label: 'Je laisse tel quel et j\'imprime tout', ok: false, why: 'Ça marcherait, mais vous vous privez de l\'invitation et de la signature en ligne. Essayez « Lier l\'AD ».' },
        { label: 'Je recrée l\'agent·e moi-même', ok: false, why: 'Non : on ne crée jamais un·e agent·e. On le rattache à son compte avec « Lier l\'AD ».' },
      ] } },
    { id: 'valideur-4', emoji: '🎤', quest: 'Étape 3', title: 'Mener l\'entretien et noter', xp: 150, shot: '/aide-ep/07-crep.jpg',
      body: <>Le jour J, cliquez sur <B>« Faire l’EP »</B> et remplissez le compte rendu dans l'outil. L'<B>enregistrement est automatique</B> : rien n'est envoyé à l'agent·e tant que vous ne validez pas. La grille d'appréciation se coche comme sur le papier (une ligne par critère, cases <B>S / AS / I</B>) ; la rubrique « Mobilité » est facultative.
        <div style={{ marginTop: 8 }}>Vous préférez écrire à la main ? C'est permis : imprimez le CREP vierge avant, écrivez pendant, puis téléversez le document signé à l'étape suivante.</div></>,
      example: <Ex>Exemple : <B>Nadia Roux</B> a passé son entretien mardi. Vous ouvrez son EP, vous remplissez le bilan, les objectifs, l'appréciation générale, et vous cliquez sur le bouton de <B>vérification</B> (cohérence ou complétude, selon la campagne) : l'outil vous liste ce qui manque.</Ex> },
    { id: 'valideur-5', emoji: '📸', quest: 'Étape 4', title: 'Téléverser le CREP signé : l’IA lit pour vous', xp: 150, shot: '/aide-ep/07-crep.jpg',
      body: <>Le CREP est signé par l'agent·e et par vous ? Dans le cadre du <B>fil d'Ariane</B>, cliquez sur le <B>grand bouton de téléversement</B> et choisissez <B>toutes les pages</B> d'un coup. L'<B>IA locale de la Ville</B> les lit en tâche de fond (environ 30 secondes par page) :
        un bandeau « Analyse en cours » apparaît, <B>vous pouvez fermer la fenêtre</B>, et vous recevez un <B>e-mail</B> quand c'est prêt. Cliquez alors sur <B>« Voir la proposition »</B>.
        <div style={{ marginTop: 8 }}>L'IA lit aussi <B>les cases cochées</B> de la grille. Mais ce n'est qu'une <B>proposition</B> : vous devez <B>vérifier chaque ligne</B> et cocher « J'ai vérifié chaque ligne » pour l'appliquer. Le document produit porte le filigrane <B>« DOCUMENT NON CONTRACTUEL »</B> : <B>l'original papier signé fait foi</B>.</div></>,
      example: <Ex>Exemple : l'IA lit « Sedit France » ; vous corrigez en <B>« Sedit Finances »</B> avant d'appliquer. Si le compte rendu avait déjà été saisi dans l'outil, l'IA ne lit que <B>les 2 commentaires de l'agent·e</B>.</Ex>,
      quiz: { question: 'L\'IA a rempli tout le compte rendu à partir de vos photos. Que faites-vous avant de valider ?', options: [
        { label: 'Je valide directement : l\'IA ne se trompe pas', ok: false, why: 'L\'IA peut mal lire une écriture : c\'est vous qui répondez du contenu.' },
        { label: 'Je vérifie chaque ligne en regardant le papier, puis je valide', ok: true, why: 'Exact. La case « J\'ai vérifié chaque ligne » le rappelle.' },
      ] } },
    { id: 'valideur-6', emoji: '✅', quest: 'Étape 5', title: 'Valider le compte rendu', xp: 100,
      body: <>Après vérification, validez le compte rendu : l'EP passe à <B>« Réalisé »</B>. En mode outil, c'est le bouton <B>« Valider la partie évaluateur »</B> ; en mode manuscrit, la validation se fait avec la <B>clôture</B>. Les rubriques obligatoires sont signalées (« Mobilité » est facultative).</>,
      quiz: { question: 'Vous avez rempli le CREP à la main. Que faut-il faire avant de scanner le papier signé ?', options: [
        { label: 'Rien, je scanne directement', ok: false, why: 'Le bouton d\'archivage reste fermé : l\'EP doit d\'abord être « Réalisé ».' },
        { label: 'Reporter le contenu dans l\'outil puis « Valider le compte rendu »', ok: true, why: 'Exact. L\'import du scan peut faire gagner du temps.' },
        { label: 'Prévenir l\'administrateur', ok: false, why: 'Pas besoin : vous pouvez le faire vous-même.' },
      ] } },
    { id: 'valideur-7', emoji: '✍️', quest: 'Étape 6 (dernière)', title: 'Clôturer et transmettre l’original à la DRH', xp: 200, shot: '/aide-ep/06-statuts.jpg',
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
    { id: 'agent-0', emoji: '👋', quest: 'Présentation', title: 'Votre entretien professionnel', xp: 50,
      body: <>L'entretien professionnel est un moment d'échange annuel avec votre responsable. Cet outil vous aide à le <B>préparer</B>, à <B>relire</B> le compte rendu et à le <B>signer</B>, sans paperasse. Ce parcours dure 1 minute.</> },
    { id: 'agent-1', emoji: '📝', quest: 'Étape 1', title: 'Préparer votre entretien', xp: 150, shot: '/aide-ep/08-agent.jpg',
      body: <>Vous avez reçu un e-mail avec la date. Complétez la fiche : bilan de l'année, réalisations, difficultés, souhaits de formation, perspectives. <B>« Enregistrer le brouillon »</B> à tout moment, <B>« Transmettre ma préparation »</B> quand c'est prêt.</>,
      example: <Ex>Exemple : « J'ai pris en charge le suivi des commandes de 2 services. Je souhaite me former à Excel avancé. » Quelques phrases suffisent : c'est une base de discussion, pas un examen.</Ex> },
    { id: 'agent-2', emoji: '📖', quest: 'Étape 2', title: 'Relire le compte rendu', xp: 150,
      body: <>Après l'entretien, votre responsable vous envoie le compte rendu. Relisez-le, puis remplissez <B>vos deux cases</B> : vos observations sur les conditions de travail, et sur l'entretien. Rien à dire ? Écrivez <B>« Néant »</B>.</>,
      quiz: { question: 'Vous n\'avez aucune remarque à ajouter. Que mettez-vous dans les deux cases ?', options: [
        { label: 'Je les laisse vides', ok: false, why: 'Elles sont obligatoires pour valider.' },
        { label: 'J\'écris « Néant »', ok: true, why: 'Exact.' },
      ] } },
    { id: 'agent-3', emoji: '🖊️', quest: 'Étape 3 (dernière)', title: 'Valider et signer', xp: 150,
      body: <>Cliquez sur <B>« Valider et envoyer pour signature »</B>. Vous recevrez ensuite un e-mail avec votre lien de signature : un clic, et c'est signé. Pas de signature en ligne pour vous ? Votre responsable vous fera signer le papier.</> },
  ],
  admin: [
    { id: 'admin-0', emoji: '👋', quest: 'Présentation', title: 'Préparer le cadre', xp: 50,
      body: <>Votre rôle : préparer le cadre, pas saisir les EP. Parcours de 1 minute.</> },
    { id: 'admin-1', emoji: '⚙️', quest: 'Étape 1', title: 'Paramétrage', xp: 150,
      body: <>Dans <B>« Paramétrage »</B> : désignez les évaluateur·rice·s, déposez le classeur « Outil CREP », créez la campagne, ouvrez ou non la signature électronique.</> },
    { id: 'admin-2', emoji: '📄', quest: 'Étape 2', title: 'La note à la Direction générale', xp: 100, shot: '/aide-ep/09-note-dg.jpg',
      body: <>Le bouton <B>« Ouvrir / modifier la note »</B> ouvre la note stratégique dans un éditeur visuel : titres, gras, listes, comme dans un traitement de texte.</> },
    { id: 'admin-3', emoji: '🎓', quest: 'Étape 3', title: 'Les demandes de formation', xp: 150,
      body: <>L'onglet <B>« Demandes de formation »</B> liste les demandes des comptes rendus selon les <B>3 types</B>, par direction puis par service, <B>sans aucun nom d'agent</B>. Le bouton <B>« Analyser avec l'IA locale »</B> les regroupe en thèmes (management = encadrement ; Word, Excel = bureautique…) et rédige une synthèse des besoins globaux pour la DRH.</>,
      quiz: { question: 'L\'analyse IA des formations montre-t-elle qui a demandé quoi ?', options: [
        { label: 'Oui, avec le nom des agent·e·s', ok: false, why: 'Non : l\'analyse est volontairement non nominative.' },
        { label: 'Non : seulement les textes, les types, les directions et les services', ok: true, why: 'Exact. Aucun nom n\'est affiché ni transmis à l\'IA.' },
      ] } },
    { id: 'admin-4', emoji: '📥', quest: 'Étape 4', title: 'Suivi des retours : numériser et valider les CREP', xp: 150,
      body: <>Le menu <B>« Suivi des retours »</B> montre, par campagne, les EP <B>programmés</B>, <B>réalisés</B>, <B>en retard</B> et les <B>CREP retournés</B>. <B>« Téléverser des CREP »</B> : déposez un PDF scanné de plusieurs CREP, pages dans le désordre si besoin. Le <B>QR code</B> imprimé en haut à gauche de chaque page rattache chaque page au bon agent ; vous vérifiez le regroupement (4 pages par CREP), corrigez si besoin, puis validez : l'EP est <B>clôturé</B>, la lecture IA démarre et l'agent·e et son évaluateur reçoivent un e-mail de remerciement. Les CREP reçus par mail dans la boîte moissonnée arrivent aussi comme lots à vérifier (le <B>canal</B>, mail ou téléversement DRH, est conservé).</>,
      quiz: { question: 'Les pages d\'un lot scanné sont dans le désordre. Que faites-vous ?', options: [
        { label: 'Rien : le QR code de chaque page les rattache au bon agent', ok: true, why: 'Exact. Vous vérifiez le regroupement (4 pages) et corrigez seulement les pages non reconnues.' },
        { label: 'Je remets les pages dans l\'ordre avant de scanner', ok: false, why: 'Inutile : l\'ordre n\'a pas d\'importance.' },
      ] } },
    { id: 'admin-5', emoji: '📊', quest: 'Étape 5 (dernière)', title: 'Piloter', xp: 150,
      body: <><B>« Pilotage »</B> donne l'avancement par direction. Les <B>compteurs</B> du haut sont <B>cliquables : ils filtrent la liste</B>. Le bouton <B>« Aperçu CREP »</B> propose le CREP numérisé ou reconstruit, et le menu <B>« ⋯ »</B> permet de déclarer qu'un CREP est <B>reçu par la DRH</B> (ce qui alimente les compteurs « À transmettre » et « Reçus par la DRH », visibles aussi des évaluateur·rice·s). <B>« Journal »</B> trace chaque action.<SiAide> Le bouton <B>Aide</B>, en haut, détaille tous les cas.</SiAide></> },
  ],
};

/** Dernière étape, commune à tous les profils : l'ampoule (questions, idées, bugs). */
const AmpouleBar = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', padding: '10px 12px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
    <span style={{ fontSize: 12, color: '#64748b', marginRight: 'auto' }}>En haut à droite du module :</span>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fef3c7', color: '#d97706', borderRadius: 10, padding: '8px 11px', boxShadow: '0 0 0 3px #fde68a, 0 0 0 5px #fbbf24' }} title="L'ampoule"><Lightbulb size={18} /></span>
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef2ff', color: '#4f46e5', borderRadius: 10, padding: '8px 12px', fontWeight: 800, fontSize: 13 }}><BookOpen size={15} /> Aide</span>
  </div>
);
const AMPOULE: Step = { id: 'ampoule', emoji: '💡', quest: 'Bonus', title: 'Une question, une demande ou un bug ? L’ampoule', xp: 50,
  example: <AmpouleBar />,
  quiz: { question: 'Vous constatez qu\'un bouton ne fait rien, ou vous avez une idée d\'amélioration. Que faites-vous ?', options: [
    { label: 'Je clique sur l\'ampoule en haut à droite et je décris la situation', ok: true, why: 'Exact : « J\'ai une question », « Je propose une amélioration » ou « Il y a un bug », avec une capture si besoin. Vous êtes prévenu·e par e-mail de la suite.' },
    { label: 'J\'attends que quelqu\'un le remarque', ok: false, why: 'Mieux vaut le signaler : les administrateurs reçoivent la demande et vous répondent.' },
  ] },
  body: <>En haut à droite, l'<B>ampoule</B> vous permet de déposer en quelques lignes <B>« J'ai une question »</B>, <B>« Je propose une amélioration »</B> ou <B>« Il y a un bug »</B>, avec une <B>pièce jointe</B> si besoin.
    Vous suivez vos demandes dans <B>« Mes demandes »</B>, vous lisez et <B>commentez</B> celles des autres dans <B>« Celles des autres »</B>, et vous êtes <B>prévenu·e par e-mail</B> de la suite donnée.</> };

/** Mode simple (option de la campagne) : le CREP signé n'est jamais téléversé par l'évaluateur ; il l'envoie à la DRH et le signale. */
const SIMPLE_INTRO: Step = { id: 'simple-intro', emoji: '👋', quest: 'Présentation', title: 'Votre parcours en 5 étapes', xp: 50,
  body: <>Vous allez conduire les entretiens professionnels de votre équipe dans MagApp. Ce court parcours de <B>2 minutes</B> présente les étapes et les boutons à utiliser. Il reste consultable à tout moment depuis l'aide.
    <ol style={{ margin: '10px 0 0 18px', padding: 0, lineHeight: 1.8 }}>
      <li>Retrouver vos agent·e·s</li><li>Prendre rendez-vous</li><li>Mener l'entretien et noter</li><li>Valider le compte rendu</li><li>Envoyer le CREP signé à la DRH et le signaler</li>
    </ol>
  </> };
const SIMPLE_MENER: Step = { id: 'simple-mener', emoji: '🎤', quest: 'Étape 3', title: 'Mener l\'entretien et noter', xp: 150, shot: '/aide-ep/07-crep.jpg',
  body: <>Le jour J, cliquez sur <B>« Faire l’EP »</B> et remplissez le compte rendu dans l'outil. L'<B>enregistrement est automatique</B> : rien n'est envoyé à l'agent·e tant que vous ne validez pas. La grille d'appréciation se coche comme sur le papier (une ligne par critère, cases <B>S / AS / I</B>) ; la rubrique « Mobilité » est facultative.
    <div style={{ marginTop: 8 }}>Vous préférez écrire à la main ? C'est permis : imprimez le CREP vierge avant et écrivez pendant. Le CREP imprimé porte un <B>QR code</B> en haut à gauche de chaque page : il permet de le rattacher au bon agent à la numérisation, <B>ne le masquez pas</B>.</div></>,
  example: <Ex>Exemple : <B>Nadia Roux</B> a passé son entretien mardi. Vous ouvrez son EP, vous remplissez le bilan, les objectifs, l'appréciation générale, puis vous lancez la <B>vérification</B> : l'outil vous liste ce qui manque.</Ex> };
const SIMPLE_VALIDER: Step = { id: 'simple-valider', emoji: '✅', quest: 'Étape 4', title: 'Valider le compte rendu', xp: 100,
  body: <>Dans l'outil, cliquez sur <B>« Valider la partie évaluateur »</B> : l'EP passe à <B>« Réalisé »</B>, puis <B>« Imprimer / PDF »</B> pour obtenir le CREP à faire signer. Les rubriques obligatoires sont signalées ; les facultatives vides ne font que donner une alerte. Si vous avez tout écrit à la main, il n'y a rien à valider dans l'outil.</>,
  quiz: { question: 'Vous avez saisi le CREP dans l\'outil. Que faites-vous avant de l\'imprimer ?', options: [
    { label: 'Rien, j\'imprime directement', ok: false, why: 'Validez d\'abord votre partie : l\'EP doit passer à « Réalisé ».' },
    { label: 'Je clique sur « Valider la partie évaluateur »', ok: true, why: 'Exact. Ensuite vous imprimez et vous faites signer.' },
  ] } };
const SIMPLE_ENVOI: Step = { id: 'simple-envoi', emoji: '📮', quest: 'Étape 5 (dernière)', title: 'Envoyer le CREP signé à la DRH et le signaler', xp: 200, shot: '/aide-ep/06-statuts.jpg',
  body: <>L'agent·e renseigne ses 2 cadres et signe à la main, puis vous <B>contresignez</B>. <B>Envoyez l'original signé à la DRH</B>, puis cliquez sur <B>« J'ai envoyé le CREP à la DRH »</B> dans l'entretien. <B>Rien à numériser, rien à téléverser.</B>
    <div style={{ marginTop: 8 }}>À réception du CREP papier signé, <B>la DRH vous notifie</B> (l'agent·e aussi) et l'entretien est <B>clôturé</B>. Un envoi signalé par erreur ? <B>« Annuler »</B>, tant que le CREP n'est pas reçu. Il n'y a pas de demande de réouverture en mode simple : en cas d'erreur, contactez un administrateur.</div></> };

/** Option « PDF formulaire hors ligne » (si activée dans le Paramétrage) : le parcours à 2 téléversements. */
const OFFLINE_STEP: Step = { id: 'hors-ligne', emoji: '📴', quest: 'Option', title: 'Sans connexion : le PDF formulaire (2 téléversements)', xp: 100,
  body: <>À l'ouverture du CREP, choisissez le mode <B>« PDF formulaire hors ligne »</B>. <B>Téléchargez</B> le PDF, ouvrez-le avec <B>Adobe Acrobat Reader</B> (ou une application PDF de tablette), remplissez-le pendant l'entretien et enregistrez-le.
    <div style={{ marginTop: 8 }}><B>1er téléversement</B> : de retour en ligne, <B>« Importer le PDF rempli »</B> reprend votre saisie dans l'outil. Relisez, puis <B>« Valider la partie évaluateur »</B>.</div>
    <div style={{ marginTop: 8 }}>Vous <B>imprimez</B> ; l'agent·e <B>écrit à la main ses 2 cadres</B> (laissés vides) et <B>signe</B>, vous contresignez.</div>
    <div style={{ marginTop: 8 }}><B>2ᵉ téléversement</B> : vous <B>numérisez</B> le CREP signé et vous le téléversez ; l'outil récupère les 2 cadres de l'agent·e et contrôle les 2 signatures, comme pour une saisie dans l'outil.</div></>,
  quiz: { question: 'Combien de téléversements dans ce mode ?', options: [
    { label: 'Un seul : le CREP signé', ok: false, why: 'Non : il y en a deux, car la saisie hors ligne doit d’abord être reprise dans l’outil.' },
    { label: 'Deux : le PDF rempli après l’entretien, puis le CREP imprimé et signé', ok: true, why: 'Exact. Le 1er reprend votre saisie, le 2ᵉ récupère les 2 cadres de l’agent·e et les signatures.' },
  ] } };

/** Lecture des entretiens numérisés désactivée : pas d'étape de vérification de la lecture, l’évaluateur·rice consulte le document et confirme les signatures. */
/** Signature électronique (parapheur) non ouverte : le circuit est papier pour tous, on n'en parle pas. */
const PAPIER_VALIDEUR: Step = { id: 'papier-valideur', emoji: '✍️', quest: 'Étape 6 (dernière)', title: 'Clôturer et transmettre l’original à la DRH', xp: 200, shot: '/aide-ep/06-statuts.jpg',
  body: <>Le circuit est <B>papier</B> : « Imprimer / PDF », l'agent·e renseigne ses 2 cadres et signe, vous contresignez, puis vous <B>numérisez</B> le CREP signé et vous le téléversez (<B>« CREP manuscrit (4 pages scannées) »</B>).
    <div style={{ marginTop: 8 }}><B>Transmettez l'ORIGINAL signé à la DRH</B>, puis cliquez sur <B>« Clôturer l'entretien »</B>. Quand la DRH l'a reçu, un administrateur le déclare : vous le voyez dans le compteur <B>« Reçus par la DRH »</B>.</div></>,
  quiz: { question: 'Le CREP est signé par l’agent·e et par vous. Que faites-vous ?', options: [
    { label: 'Je le numérise et je le téléverse, je transmets l’original à la DRH, puis je clôture', ok: true, why: 'Exact. Le résultat numérique est identique ; l’original papier signé fait foi.' },
    { label: 'Je clôture sans rien téléverser ni transmettre', ok: false, why: 'Le document signé doit être téléversé et l’original transmis à la DRH avant la clôture.' },
  ] } };
const PAPIER_AGENT: Step = { id: 'papier-agent', emoji: '🖊️', quest: 'Étape 3 (dernière)', title: 'Signer le compte rendu', xp: 150,
  body: <>Votre responsable vous remet le <B>compte rendu imprimé</B> : relisez-le, renseignez <B>vos deux cases</B> (conditions de travail, entretien ; « Néant » si rien à dire) et <B>signez à la main</B>. Il le contresigne puis l'envoie à la DRH.</> };

function adaptSteps(role: TutoRole, scanReading: boolean, offlineForm = false, simple = false, esign = true): Step[] {
  const base0 = adaptStepsBase(role, scanReading, offlineForm, simple);
  if (esign || simple) return base0;
  return base0.map(st => (role === 'valideur' && st.quest === 'Étape 6 (dernière)') ? PAPIER_VALIDEUR : (role === 'agent' && st.quest === 'Étape 3 (dernière)') ? PAPIER_AGENT : st);
}

function adaptStepsBase(role: TutoRole, scanReading: boolean, offlineForm = false, simple = false): Step[] {
  let base = [...STEPS[role], AMPOULE];
  if (simple && role === 'valideur') {
    // Mode simple : parcours en 5 étapes, sans téléversement ni vérification de lecture
    const early = STEPS.valideur.filter(st => ['Étape 1', 'Étape 2', 'Étape 2 (cas particulier)'].includes(st.quest));
    const offline: Step[] = offlineForm ? [{ ...OFFLINE_STEP, id: 'simple-hors-ligne', title: 'Sans connexion : le PDF formulaire', body: <>À l'ouverture du CREP, choisissez le mode <B>« PDF formulaire hors ligne »</B>. <B>Téléchargez</B> le PDF, ouvrez-le avec <B>Adobe Acrobat Reader</B> (ou une application PDF de tablette), remplissez-le pendant l'entretien et enregistrez-le. De retour en ligne, <B>« Importer le PDF rempli »</B> reprend votre saisie dans l'outil ; relisez, puis <B>« Valider la partie évaluateur »</B>. Vous imprimez, l'agent·e écrit ses 2 cadres à la main et signe, vous contresignez, puis vous envoyez le CREP à la DRH. <B>Rien d'autre à téléverser.</B></>, quiz: undefined }] : [];
    return [SIMPLE_INTRO, ...early, SIMPLE_MENER, ...offline, SIMPLE_VALIDER, SIMPLE_ENVOI, AMPOULE];
  }
  if (offlineForm && role === 'valideur') {
    const k = base.findIndex(st => st.quest === 'Étape 3');
    base = [...base.slice(0, k + 1), OFFLINE_STEP, ...base.slice(k + 1)];
  }
  if (scanReading || role !== 'valideur') return base;
  return base.map(st => st.quest === 'Étape 4'
    ? { id: 'sans-lecture', emoji: '📸', quest: 'Étape 4', title: 'Téléverser le CREP signé', xp: 150, shot: '/aide-ep/07-crep.jpg',
        body: <>Le CREP est signé par l'agent·e et par vous ? Dans le cadre du <B>fil d'Ariane</B>, cliquez sur le <B>grand bouton de téléversement</B> et choisissez <B>toutes les pages</B> d'un coup (photos ou PDF).
          <div style={{ marginTop: 8 }}>Cliquez sur <B>« Consulter le document »</B> : il s'ouvre aussitôt, sans rien télécharger. Cochez qu'il porte <B>la signature de l'agent·e</B> et <B>la vôtre</B>, puis <B>« Valider le document »</B>. Il n'y a rien d'autre à vérifier : le contenu n'est pas relu.</div></>,
        example: <Ex>Exemple : le document de <B>Nadia Roux</B> est lisible et porte les 2 signatures : vous cochez les 2 cases, vous validez, puis vous clôturez.</Ex>,
        quiz: { question: 'Que contrôlez-vous après avoir téléversé le document signé ?', options: [
          { label: 'Chaque ligne du compte rendu, comparée au papier', ok: false, why: 'Pas dans ce mode : le document signé fait foi et vous ne vérifiez que les 2 signatures.' },
          { label: 'Que le document est lisible, complet et porte les 2 signatures', ok: true, why: 'Exact. Vous le validez puis vous clôturez.' },
        ] } }
    : st);
}

/** Toutes les étapes d'un profil, variantes comprises, pour l'éditeur. */
export function tutoCatalog(role: TutoRole): Array<{ step: Step; variant: string }> {
  const out: Array<{ step: Step; variant: string }> = [];
  const add = (steps: Step[], variant: string) => steps.forEach(step => { if (!out.some(x => x.step.id === step.id)) out.push({ step, variant }); });
  add(adaptSteps(role, true), '');
  if (role === 'valideur') {
    add(adaptSteps(role, false), 'lecture des documents désactivée');
    add(adaptSteps(role, true, true), 'PDF hors ligne activé');
    add(adaptSteps(role, true, false, true), 'mode simple');
    add(adaptSteps(role, true, true, true), 'mode simple avec PDF hors ligne');
  }
  if (role !== 'admin') add(adaptSteps(role, true, false, false, false), 'sans signature électronique');
  return out;
}

export default function TutoEp({ role, onClose, onOpenAide, scanReading = false, offlineForm = false, simple = false, esign = true }: { role: TutoRole; onClose: (markSeen?: boolean) => void; onOpenAide?: () => void; scanReading?: boolean; offlineForm?: boolean; simple?: boolean; esign?: boolean }) {
  const { contents } = useHelpContents();
  const steps: Step[] = adaptSteps(role, scanReading, offlineForm, simple, esign).map(st => {
    const c = contents[`tuto:${st.id}`];
    if (!c) return st;
    return {
      ...st,
      emoji: c.emoji || st.emoji,
      quest: c.quest || st.quest,
      title: c.title || st.title,
      body: <HtmlView html={c.body || ''} />,
      example: c.example ? <HtmlView html={c.example} /> : undefined,
      quiz: c.quiz || undefined,
    };
  });
  const [i, setI] = useState(0);
  const [askSkip, setAskSkip] = useState(false);
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
    <AideCtx.Provider value={!!onOpenAide}>
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'linear-gradient(135deg,#312e81 0%,#4f46e5 55%,#7c3aed 100%)', display: 'flex', justifyContent: 'center', padding: 14, overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 760, margin: 'auto', background: '#fff', borderRadius: 18, boxShadow: '0 25px 60px rgba(15,23,42,.45)', overflow: 'hidden' }}>
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
          <button style={{ ...btnGhost, padding: '5px 9px', fontSize: 12 }} onClick={() => setAskSkip(true)} title="Passer le tutoriel"><X size={14} /> Passer</button>
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

      {askSkip && i < steps.length && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3100, background: 'rgba(15,23,42,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 16, padding: '24px 24px 20px', boxShadow: '0 25px 60px rgba(15,23,42,.45)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 900, color: COLORS.text }}>Passer le tutoriel ?</h3>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, lineHeight: 1.6, color: '#475569' }}>Souhaitez-vous le revoir la prochaine fois que vous ouvrirez le module ? Il reste de toute façon consultable à tout moment avec le bouton « Aide ».</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button style={btnPrimary} onClick={() => onClose(false)}>Oui, me le reproposer la prochaine fois</button>
              <button style={btnGhost} onClick={() => onClose(true)}>Non, ne plus me le proposer</button>
              <button style={{ ...btnGhost, border: 'none', color: '#64748b' }} onClick={() => setAskSkip(false)}>Continuer le tutoriel</button>
            </div>
          </div>
        </div>
      )}

      {i >= steps.length && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3100, background: 'linear-gradient(135deg,#312e81 0%,#4f46e5 55%,#7c3aed 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div style={{ width: '100%', maxWidth: 520, background: '#fff', borderRadius: 18, padding: '30px 28px', textAlign: 'center', boxShadow: '0 25px 60px rgba(15,23,42,.45)' }}>
            <CheckCircle2 size={52} color="#16a34a" />
            <h2 style={{ margin: '10px 0 4px', fontSize: 22, fontWeight: 900, color: COLORS.text }}>Tutoriel terminé</h2>
            <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.6, margin: '14px 0 20px' }}>
              Vous avez parcouru les étapes essentielles. Le bouton <strong>« Aide »</strong> (en haut à droite) reste disponible à tout moment{onOpenAide ? ', avec tous les cas détaillés et des captures d’écran.' : ' pour revoir ce tutoriel.'}
              Une question, une demande d'amélioration ou un bug ? Cliquez sur l'<strong>ampoule 💡</strong> en haut à droite, à tout moment.{onOpenAide ? ' Ce tutoriel peut être rouvert depuis l’aide.' : ''}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              {onOpenAide && <button style={btnGhost} onClick={() => { onClose(true); onOpenAide(); }}><BookOpen size={15} /> Ouvrir l'aide complète</button>}
              <button style={btnPrimary} onClick={() => onClose(true)}><CheckCircle2 size={15} /> Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AideCtx.Provider>
  );
}
