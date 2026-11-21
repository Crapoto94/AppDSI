import { useState } from 'react';
import {
  X, BookOpen, UserCheck, ShieldCheck, Sparkles, Users, CalendarClock,
  FileSignature, History, MousePointerClick, CheckCircle2, AlertTriangle,
  Send, Lock, Database, RotateCcw, HelpCircle, Printer, Mail, MailX, PenLine, Route, GraduationCap, ScanLine, FlaskConical,
} from 'lucide-react';
import { COLORS, card, btnGhost, btnPrimary } from './ui';

const Section = ({ icon, title, children }: { icon: React.ReactNode; title: React.ReactNode; children: React.ReactNode }) => (
  <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>{icon}{title}</div>
    <div style={{ fontSize: 12.5, lineHeight: 1.6, color: '#475569' }}>{children}</div>
  </div>
);

/** Encadré très visible : à faire, attention, rassurant. */
function Callout({ tone = 'info', title, children }: { tone?: 'info' | 'ok' | 'warn'; title?: string; children: React.ReactNode }) {
  const map = {
    info: { bg: '#eff6ff', border: '#bfdbfe', color: '#1e40af', icon: <HelpCircle size={16} /> },
    ok: { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534', icon: <CheckCircle2 size={16} /> },
    warn: { bg: '#fff7ed', border: '#fed7aa', color: '#9a3412', icon: <AlertTriangle size={16} /> },
  }[tone];
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', background: map.bg, border: `1px solid ${map.border}`, color: map.color, borderRadius: 9, padding: '10px 12px', marginBottom: 10, fontSize: 12.5, lineHeight: 1.55 }}>
      <span style={{ flexShrink: 0, marginTop: 1 }}>{map.icon}</span>
      <div>{title && <div style={{ fontWeight: 800, marginBottom: 2 }}>{title}</div>}{children}</div>
    </div>
  );
}

/** Une étape verticale avec un gros numéro : la lecture la plus simple pour un débutant. */
function Step({ n, title, who, children }: { n: number; title: string; who?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', borderBottom: `1px dashed ${COLORS.border}` }}>
      <div style={{ width: 30, height: 30, borderRadius: 999, background: COLORS.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14, flexShrink: 0 }}>{n}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 800, fontSize: 13, color: COLORS.text }}>
          {title} {who && <span style={{ fontWeight: 600, fontSize: 10.5, color: '#64748b', background: '#f1f5f9', borderRadius: 5, padding: '1px 6px', marginLeft: 6 }}>{who}</span>}
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: '#475569', marginTop: 3 }}>{children}</div>
      </div>
    </div>
  );
}

/** Un cas de figure (« Cas A », « Cas B »…) : bandeau coloré + déroulé. */
function Cas({ code, title, color = '#4f46e5', icon, children }: { code: string; title: React.ReactNode; color?: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${color}55`, borderLeft: `5px solid ${color}`, borderRadius: 9, padding: '10px 12px', marginBottom: 10, background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, fontSize: 13, color: COLORS.text, marginBottom: 5 }}>
        <span style={{ background: color, color: '#fff', borderRadius: 6, padding: '1px 8px', fontSize: 11.5 }}>{code}</span>
        {icon}{title}
      </div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: '#475569' }}>{children}</div>
    </div>
  );
}

/** Vraie capture d'écran de l'outil (données fictives), cliquable pour l'agrandir. */
// Les captures d'écran ont été retirées de l'aide (les textes décrivent chaque geste).
function Shot(_: { src: string; caption: string }) {
  return null;
}

/** Liste de gestes numérotés. */
function Gestes({ items }: { items: React.ReactNode[] }) {
  return (
    <div style={{ display: 'grid', gap: 4, margin: '4px 0' }}>
      {items.map((it, i) => <div key={i}><strong>{i + 1}.</strong> {it}</div>)}
    </div>
  );
}

const Chip = ({ label, color, bg }: { label: string; color: string; bg: string }) => (
  <span style={{ display: 'inline-block', padding: '4px 9px', borderRadius: 7, background: bg, color, fontWeight: 800, fontSize: 11.5, whiteSpace: 'nowrap' }}>{label}</span>
);
const Arrow = () => <span style={{ color: '#94a3b8', fontWeight: 900, fontSize: 16 }}>→</span>;

/** Pastille « activable » : fonction non active par défaut, ouverte par un administrateur. */
const Activable = () => (
  <span title="Fonction non active par défaut : elle s'active dans Paramétrage" style={{ display: 'inline-block', marginLeft: 8, verticalAlign: 'middle', background: '#ede9fe', color: '#5b21b6', border: '1px solid #ddd6fe', borderRadius: 999, padding: '0 8px', fontSize: 10.5, fontWeight: 800, letterSpacing: .2 }}>activable</span>
);

export interface AideFeatures { prep?: boolean; aiDraft?: boolean; aiReview?: boolean; esign?: boolean }

/** Étapes du chemin d'un EP : seules les fonctions activées apparaissent, la numérotation s'adapte. */
function ProcessSchema({ f }: { f: AideFeatures }) {
  const steps: Array<{ title: string; who: string; body: React.ReactNode }> = [
    { title: "L'administrateur désigne les valideurs", who: 'Administrateur', body: <>Il indique qui valide qui. Vous retrouvez simplement vos agents dans MagApp.</> },
    { title: "Vous prenez rendez-vous avec l'agent", who: 'Valideur', body: <>
      Cette étape est <strong>facultative</strong> : vous pouvez toujours fixer la date « à l'ancienne ». L'outil n'est qu'une <strong>aide</strong> (recherche de créneaux, envoi de la convocation par e-mail). <strong>Si l'agent n'a pas d'e-mail, vous devez de toute façon le convoquer autrement</strong> (vive voix, téléphone, courrier).
    </> },
  ];
  if (f.prep) steps.push({ title: "L'agent prépare son entretien", who: 'Agent', body: <>Dans « Mon entretien » (il a une adresse e-mail et l'accès a été ouvert pour lui). Vous retrouvez sa préparation dans l'EP. Cette étape est facultative : l'entretien peut avoir lieu sans.</> });
  steps.push(
    { title: 'Vous choisissez le mode de saisie du CREP', who: 'Valideur', body: <>Dès l'ouverture du CREP, l'outil vous demande si vous le tenez <strong>à la main</strong> ou <strong>dans l'outil</strong> ; vous pouvez changer à tout moment. Un <strong>fil d'Ariane</strong> indique où vous en êtes. Si vous souhaitez un CREP <strong>totalement manuscrit</strong>, vous l'<strong>imprimez</strong>. Si vous saisissez dans l'outil, vous saisissez la grille et les rubriques, puis vous validez votre partie avant d'imprimer.</> },
    { title: "L'entretien a lieu", who: 'Valideur + Agent', body: <>Vous échangez avec l'agent et vous prenez vos notes : à la main sur le CREP imprimé, ou directement dans l'outil (« Saisir l'EP »).</> },
    { title: "Si vous avez saisi dans l'outil, vous imprimez", who: 'Valideur', body: <>Cliquez sur <strong>« Imprimer / PDF »</strong> pour obtenir le CREP à faire signer. (Écrit à la main : vous avez déjà le papier.)</> },
    { title: "Vous transmettez le CREP à l'agent", who: 'Valideur + Agent', body: <>L'agent <strong>renseigne les 2 cadres qui le concernent</strong> (ses observations sur les conditions de travail, puis sur l'entretien) et <strong>signe à la main</strong>.</> },
    { title: 'Vous contresignez', who: 'Valideur', body: <>Quand l'agent vous rend le CREP signé, vous le <strong>contresignez</strong>.</> },
    { title: 'Vous numérisez et vous téléversez', who: 'Valideur', body: <>Vous <strong>numérisez</strong> le CREP signé (scan ou photos des pages) et vous le <strong>téléversez dans l'outil</strong>. C'est nécessaire <strong>dans tous les cas où il y a du papier</strong> : CREP écrit à la main, mais aussi CREP saisi dans l'outil puis imprimé et signé. <strong>L'original signé part à la RH.</strong></> },
    { title: "Vous vérifiez tout, puis vous clôturez l'entretien", who: 'Valideur', body: <>L'outil lit le document et contrôle les <strong>2 signatures</strong> (agent et évaluateur) ; vous vérifiez ce qui a été lu (en mode outil : seulement les 2 cadres de l'agent et les signatures ; en mode manuscrit : tout le CREP) et vous confirmez les signatures. Vous cliquez ensuite sur <strong>« Clôturer l'entretien »</strong> : le CREP signé est archivé, tout est terminé.</> },
  );
  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, background: '#f8fafc', marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: COLORS.text, marginBottom: 8 }}>Le chemin d'un EP, de la désignation à la validation</div>
      {steps.map((s, i) => <Step key={i} n={i + 1} title={s.title} who={s.who}>{s.body}</Step>)}
      {f.esign && (
        <div style={{ marginTop: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: 8, padding: '8px 11px', fontSize: 12 }}>
          <strong>Signature électronique ouverte pour cet agent</strong> (il a une adresse e-mail, vous aussi) : au lieu de faire imprimer, signer, numériser et téléverser, vous cliquez sur <strong>« Envoyer à l'agent »</strong> ; il relit, remplit ses 2 cadres et valide, puis vous signez tous les deux dans le parapheur. Le document signé est archivé automatiquement.
        </div>
      )}
    </div>
  );
}

/** Repères visuels à l'écran : uniquement les éléments disponibles. */
function ScreenMap({ f }: { f: AideFeatures }) {
  const box = (label: string, hint: string, color = '#e2e8f0') => (
    <div style={{ border: `1px solid ${color}`, background: '#fff', borderRadius: 7, padding: '7px 9px' }}>
      <div style={{ fontWeight: 800, fontSize: 11.5, color: COLORS.text }}>{label}</div>
      <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>{hint}</div>
    </div>
  );
  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, marginBottom: 10, background: '#f8fafc' }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: COLORS.text, marginBottom: 8 }}>Où cliquer dans MagApp ?</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
        {box('Onglet « EP que je réalise »', 'Vos entretiens : c\'est ici que vous travaillez', '#bfdbfe')}
        {box('Onglet « EP de mon équipe »', 'Contrôle de vos agents (lecture)', '#bbf7d0')}
        {f.prep && box('Onglet « Mon entretien »', 'Votre propre EP, quand vous êtes évalué(e)', '#fde68a')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 6 }}>
        {box('Bouton « Planifier »', 'Fixer le rendez-vous (facultatif)')}
        {box('Bouton « Saisir l’EP »', 'Ouvrir et remplir le CREP')}
        {box('Icône imprimante', 'Imprimer le CREP (vierge ou rempli)')}
        {box('« Importer un compte rendu papier »', 'Téléverser le CREP signé (scan ou photos)')}
        {box('« Valider le compte rendu »', 'Passe l\'EP à « Réalisé »')}
        {f.esign && box('« Envoyer à l’agent »', 'Signature électronique (si ouverte pour l\'agent)')}
        {f.aiDraft && box('« Rédiger avec l’IA »', 'Propose un texte à partir de vos notes')}
        {f.aiReview && box('Relecture de cohérence', 'Signale les incohérences du compte rendu')}
      </div>
    </div>
  );
}

/** Statuts : seuls ceux qui existent avec les fonctions activées. */
function StatusSchema({ f }: { f: AideFeatures }) {
  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: COLORS.text, marginBottom: 8 }}>Les statuts, dans l'ordre</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', lineHeight: 2 }}>
        <Chip label="À planifier" color="#92400e" bg="#fef3c7" /><Arrow />
        <Chip label="Planifié" color="#1e40af" bg="#dbeafe" /><Arrow />
        <Chip label="Réalisé (CREP validé)" color="#166534" bg="#dcfce7" /><Arrow />
        {f.esign && <><Chip label="Envoyé à l'agent" color="#6b21a8" bg="#f3e8ff" /><Arrow /><Chip label="En signature" color="#9a3412" bg="#ffedd5" /><Arrow /></>}
        <Chip label="Signé / archivé" color="#065f46" bg="#d1fae5" />
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
        « À planifier » ne veut pas dire « en retard » : l'EP attend simplement votre action.
      </div>
    </div>
  );
}

/** Tableau de synthèse « quelle situation, que se passe-t-il ». */
function Matrice({ f }: { f: AideFeatures }) {
  const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', background: '#f1f5f9', fontSize: 11.5, color: COLORS.text, borderBottom: `1px solid ${COLORS.border}` };
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: 12, borderBottom: `1px solid ${COLORS.border}`, verticalAlign: 'top' };
  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
        <thead>
          <tr><th style={th}>Situation</th><th style={th}>Rendez-vous</th>{f.prep && <th style={th}>Préparation de l'agent</th>}<th style={th}>Compte rendu et signature</th></tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}><strong>L'agent a une adresse e-mail</strong></td>
            <td style={td}>Invitation Outlook + e-mail avec le CREP vierge (si vous utilisez l'assistant de planification)</td>
            {f.prep && <td style={td}>En ligne dans « Mon entretien », ou sur papier</td>}
            <td style={td}>
              CREP signé à la main : vous le numérisez et vous le téléversez, puis vous validez.
              {f.esign && <> Si la signature électronique est ouverte pour lui : « Envoyer à l'agent » → il valide → signatures dans le parapheur → archivage automatique.</>}
            </td>
          </tr>
          <tr>
            <td style={td}><strong>L'agent n'a pas d'e-mail</strong></td>
            <td style={td}>Aucun envoi possible : vous le convoquez vous-même (vive voix, téléphone, courrier) et vous lui remettez le CREP vierge imprimé</td>
            {f.prep && <td style={td}>Sur papier uniquement</td>}
            <td style={td}>Toujours sur papier : impression, signatures, numérisation, téléversement, validation</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function AideEp({ onClose, isAdmin, features, onTuto }: { onClose: () => void; isAdmin?: boolean; features?: AideFeatures; onTuto?: () => void }) {
  const f: AideFeatures = features || {};
  const [tab, setTab] = useState<'evaluateur' | 'admin'>(isAdmin ? 'admin' : 'evaluateur');
  // Numérotation des étapes détaillées : s'adapte aux fonctions activées
  const nPrep = 3;
  const nCrep = f.prep ? 4 : 3;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto' }}>
      <div style={{ ...card, width: '100%', maxWidth: 900, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 800, color: COLORS.text }}>
            <BookOpen size={20} color={COLORS.primary} /> Aide pas à pas — Entretiens professionnels
          </div>
          <button style={btnGhost} onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <button style={tab === 'evaluateur' ? btnPrimary : btnGhost} onClick={() => setTab('evaluateur')}>
            <UserCheck size={14} /> Je suis valideur
          </button>
          {isAdmin && (
            <button style={tab === 'admin' ? btnPrimary : btnGhost} onClick={() => setTab('admin')}>
              <ShieldCheck size={14} /> Je suis administrateur
            </button>
          )}
          {onTuto && (
            <button style={{ ...btnGhost, marginLeft: 'auto', color: '#6d28d9', borderColor: '#ddd6fe', background: '#f5f3ff' }} onClick={onTuto}>
              <Sparkles size={14} /> Revoir le tutoriel interactif
            </button>
          )}
        </div>

        {tab === 'evaluateur' ? (
          <>
            <Callout tone="ok" title="Pas besoin d'être à l'aise avec l'informatique">
              Cette page vous tient la main. Lisez d'abord « Le processus en un coup d'œil », puis suivez uniquement les étapes qui vous concernent.
              Si un écran ne ressemble pas à ce qui est décrit, ne cherchez pas au hasard : appelez l'administrateur du module ou la DSI.
            </Callout>

            <Section icon={<MousePointerClick size={15} color={COLORS.primary} />} title="Le processus en un coup d'œil">
              <ProcessSchema f={f} />
            </Section>

            <Section icon={<Route size={15} color={COLORS.primary} />} title="Quelle est ma situation ?">
              <div style={{ marginBottom: 8 }}>
                Le déroulé change surtout selon une question : <strong>l'agent a-t-il une adresse e-mail ?</strong>
                {' '}Vous n'avez pas à le deviner : l'outil le sait et ne vous propose que les boutons qui marchent.
              </div>
              <Matrice f={f} />
              <Callout tone="info" title="Comment savoir si l'agent a un e-mail ?">
                Dans la liste « EP que je réalise », la colonne de l'agent indique son adresse. Si elle est vide, l'agent suit le circuit papier, <strong>sauf si vous savez qu'il en a une</strong> : l'orthographe de son nom diffère peut-être entre la base RH et l'annuaire informatique, et vous pouvez faire le lien vous-même (étape 1, « Lier l'AD »).
              </Callout>
            </Section>

            <Section icon={<Users size={15} color={COLORS.primary} />} title="Où cliquer dans MagApp ?">
              <ScreenMap f={f} />
              <Callout tone="warn" title="Ne pas confondre les espaces">
                <strong>« EP que je réalise »</strong> = les entretiens dont vous êtes l'évaluateur (vous les remplissez).
                <strong> « EP de mon équipe »</strong> = la vue de contrôle de vos agents (souvent en lecture seule).
                {f.prep && <><strong> « Mon entretien »</strong> = votre propre entretien, quand vous êtes évalué(e).</>}
              </Callout>
            </Section>

            <Section icon={<CheckCircle2 size={15} color={COLORS.primary} />} title="Avant de commencer : 3 vérifications">
              <div style={{ display: 'grid', gap: 6 }}>
                <div><strong>1.</strong> Je suis bien connecté avec <strong>mon compte personnel</strong>, pas celui d'un collègue.</div>
                <div><strong>2.</strong> Je vois le bon nombre d'agents dans « EP que je réalise » (ou « EP de mon équipe »).</div>
                <div><strong>3.</strong> Je repère les agents <strong>sans adresse e-mail</strong> : je devrai les convoquer moi-même, et ils suivent le circuit papier.</div>
              </div>
            </Section>

            <Section icon={<CalendarClock size={15} color={COLORS.primary} />} title="Étape 1 — Ouvrir le module et vérifier ses agents">
              <Gestes items={[
                <>Ouvrir MagApp et se connecter avec son identifiant habituel.</>,
                <>Cliquer sur la tuile <strong>« Entretiens professionnels »</strong>.</>,
                <>Cliquer sur l'onglet <strong>« EP que je réalise »</strong>.</>,
                <>Vérifier que chaque agent de votre équipe apparaît <strong>une seule fois</strong>.</>,
              ]} />
              <Callout tone="warn" title="Un agent manque ou le valideur affiché est faux ?">
                Vous pouvez le corriger <strong>vous-même</strong>, sans attendre l'administrateur : voir les modes opératoires ci-dessous.
                Règle à garder en tête : <strong>un agent = un seul valideur</strong>.
              </Callout>

              <Cas code="Il manque un agent" title="M'ajouter un agent qui n'a pas encore de valideur" color="#16a34a" icon={<Users size={14} color="#16a34a" />}>
                <Gestes items={[
                  <>Aller dans l'onglet <strong>« EP que je réalise »</strong>.</>,
                  <>Cliquer sur le bouton bleu <strong>« Ajouter un agent »</strong> (au-dessus du tableau).</>,
                  <>Une fenêtre liste les agents <strong>de votre direction qui n'ont encore aucun évaluateur</strong>. Taper un nom dans la zone de recherche puis <strong>« Rechercher »</strong> si besoin.</>,
                  <>Cliquer sur <strong>« Ajouter »</strong> en face de l'agent : il apparaît aussitôt dans votre liste, prêt à être planifié.</>,
                ]} />
                <Callout tone="info" title="L'agent n'est pas dans la liste ?">
                  Soit il a <strong>déjà un valideur</strong> (voir « changer le valideur »), soit il n'est pas dans votre direction ou pas dans la base des agents : prévenez l'administrateur.
                </Callout>
              </Cas>

              <Cas code="Mauvais valideur" title="Changer le valideur d'un agent" color="#4f46e5" icon={<UserCheck size={14} color="#4f46e5" />}>
                <Gestes items={[
                  <>Dans la liste, repérer la ligne de l'agent concerné.</>,
                  <>Cliquer sur l'icône <strong>« personne avec un engrenage »</strong> (info-bulle « Changer l'évaluateur ») à droite de la ligne.</>,
                  <>La fenêtre affiche l'évaluateur actuel et la liste des évaluateurs possibles. Chercher le bon nom (nom, matricule ou e-mail).</>,
                  <>Cliquer sur <strong>« Choisir »</strong> en face du bon valideur. L'agent quitte votre liste (ou rejoint la vôtre) immédiatement.</>,
                ]} />
                <div style={{ marginTop: 4 }}>
                  <strong>Pour récupérer un agent d'un collègue</strong> (ou donner un de vos agents à un collègue), c'est le même geste. Le droit est réservé à l'évaluateur actuel de l'agent, à son supérieur et aux administrateurs.
                </div>
                <Callout tone="warn" title="Si l'EP est déjà commencé">
                  Changer de valideur ne supprime rien de ce qui a été saisi, mais le nouveau valideur reprend la main à partir de là. Prévenez l'ancien valideur et l'agent. Toutes les modifications sont inscrites dans le <strong>Journal</strong>.
                </Callout>
              </Cas>

              <Cas code="Vue équipe" title="Si vous êtes directeur ou DGA : depuis « EP de mon équipe »" color="#64748b" icon={<Users size={14} color="#64748b" />}>
                Dans l'onglet <strong>« EP de mon équipe »</strong>, les agents sont rangés par valideur (cliquer sur « Tout déplier »). Le bouton « Ajouter un agent » devient
                <strong> « Choisir l'évaluateur »</strong> : vous choisissez d'abord l'agent sans évaluateur, puis le valideur à lui affecter, parmi les valideurs de votre périmètre.
              </Cas>

              <Cas code="Pas d'e-mail" title="Un agent est affiché sans adresse e-mail : le rapprochement RH ↔ annuaire informatique" color="#d97706" icon={<MailX size={14} color="#d97706" />}>
                <div style={{ marginBottom: 6 }}>
                  <strong>Pourquoi ça arrive ?</strong> Les agents viennent de la <strong>base RH</strong>, mais les adresses e-mail sont dans l'<strong>annuaire informatique</strong> (l'AD).
                  L'outil relie les deux en comparant matricule, puis nom et prénom. Quand l'orthographe diffère (accent, tiret, nom d'usage, prénom composé, faute de frappe), <strong>le lien ne se fait pas tout seul</strong> et l'agent apparaît « sans e-mail », <strong>alors qu'il en a bien un</strong>.
                </div>
                <div style={{ marginBottom: 6 }}>
                  <strong>Ce que vous pouvez faire :</strong> si vous savez que l'agent a une adresse e-mail, <strong>retrouvez-le vous-même dans l'annuaire informatique et faites le lien</strong> :
                </div>
                <Gestes items={[
                  <>Sur la ligne de l'agent, cliquer sur <strong>« Lier l'AD »</strong>.</>,
                  <>Taper <strong>quelques lettres de son nom</strong> (2 minimum). Essayez une orthographe plus courte ou son prénom seul si rien ne sort.</>,
                  <>Dans les résultats (nom affiché + adresse e-mail), repérer <strong>la bonne personne</strong> : vérifier l'adresse.</>,
                  <>Cliquer sur <strong>« Lier »</strong>. L'adresse e-mail est rattachée à l'agent.</>,
                ]} />
                <Callout tone="ok" title="Ce que cela change">
                  L'agent peut désormais recevoir la convocation et le CREP vierge par e-mail
                  {f.prep && <>, et accéder à « Mon entretien »</>}
                  {f.esign && <>, et signer en ligne si la signature électronique lui est ouverte</>}.
                  Si vous aviez déjà planifié, modifiez le rendez-vous pour que l'invitation lui parte.
                </Callout>
                <Callout tone="warn" title="Attention à l'homonymie">
                  Ne liez que si vous êtes <strong>certain</strong> de la personne (même service, bonne adresse). Un mauvais lien enverrait les documents confidentiels de l'entretien à quelqu'un d'autre.
                </Callout>
                <div><strong>Si l'agent n'a vraiment pas d'adresse</strong> : ne liez rien. Vous le convoquez vous-même et il suit le circuit papier.</div>
              </Cas>
            </Section>

            <Section icon={<CalendarClock size={15} color={COLORS.primary} />} title="Étape 2 — Prendre rendez-vous (facultatif)">
              <Callout tone="info" title="Cette étape est facultative">
                Vous pouvez toujours fixer la date <strong>« à l'ancienne »</strong> (de vive voix, par téléphone, par courrier ou dans votre agenda) sans passer par l'outil.
                L'assistant de planification n'est qu'une <strong>aide</strong> : <strong>recherche de créneaux</strong> communs et <strong>envoi de la convocation par e-mail</strong> (invitation Outlook et CREP vierge).
              </Callout>
              <Gestes items={[
                <>Dans « EP que je réalise », repérer la ligne de l'agent.</>,
                <>Cliquer sur <strong>« Planifier »</strong> (ou « Modifier le RDV » si une date existe déjà).</>,
                <>Choisir la <strong>date et l'heure</strong>, la <strong>durée</strong> (2 heures par défaut) et le <strong>lieu</strong>.</>,
                <>Pour être aidé : cliquer sur <strong>« Prochains créneaux libres »</strong>. L'outil lit votre agenda et celui de l'agent, puis propose des créneaux communs. Cliquer sur un créneau.</>,
                <>Cliquer sur le bouton de validation. Un message vert confirme l'envoi.</>,
              ]} />
              <Cas code="Avec e-mail" title="L'agent a une adresse e-mail" color="#16a34a" icon={<Mail size={14} color="#16a34a" />}>
                <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>
                  <li>L'agent reçoit une <strong>invitation Outlook</strong> dans son agenda, comme vous.</li>
                  <li>L'agent reçoit un <strong>e-mail</strong> avec le <strong>CREP vierge en PDF</strong> en pièce jointe{f.prep && <>, et un bouton qui ouvre MagApp pour préparer son entretien</>}.</li>
                  <li>Vous recevez aussi un e-mail de confirmation du rendez-vous.</li>
                  {f.prep && <li>Si l'agent n'a toujours pas transmis sa préparation quand l'entretien approche, <strong>l'outil le relance tout seul</strong>.</li>}
                </ul>
              </Cas>
              <Cas code="Sans e-mail" title="L'agent n'a PAS d'adresse e-mail" color="#d97706" icon={<MailX size={14} color="#d97706" />}>
                <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>
                  <li><strong>Aucun e-mail ni invitation ne part à l'agent.</strong> Le rendez-vous est quand même enregistré, et il apparaît dans votre agenda.</li>
                  <li>C'est à <strong>vous de convoquer l'agent par un autre moyen</strong> (de vive voix, par téléphone ou par courrier) : date, heure, lieu. Cette convocation est <strong>obligatoire</strong>, l'outil ne peut pas la faire à votre place.</li>
                  <li>Remettez-lui le <strong>CREP vierge imprimé</strong> : icône imprimante de sa ligne (ou cocher plusieurs agents et imprimer en une fois).</li>
                  <li>Si vous savez que l'agent a en réalité une adresse e-mail, faites le lien avec « Lier l'AD » (étape 1).</li>
                </ul>
              </Cas>
              <Callout tone="info" title="Changer la date ou l'heure">
                Rouvrir « Modifier le RDV ». L'invitation Outlook et l'e-mail sont mis à jour : <strong>ne recréez jamais un EP</strong>. Un avertissement s'affiche si le rendez-vous est à moins de 8 jours.
              </Callout>
            </Section>

            {f.prep && (
              <Section icon={<FileSignature size={15} color={COLORS.primary} />} title={`Étape ${nPrep} — Avant l'entretien : la préparation de l'agent, avec l'accès à « Mon entretien »`}>
                <Cas code="En ligne" title="L'agent a un e-mail et l'accès à « Mon entretien »" color="#4f46e5">
                  Il remplit une fiche (bilan, difficultés, souhaits de formation, perspectives) <strong>dans MagApp</strong>. Vous la retrouvez dans « Saisir l'EP ». Elle sert à <strong>nourrir l'échange</strong> : vous n'avez pas à la recopier.
                </Cas>
                <Cas code="Papier" title="L'agent n'a pas d'e-mail, ou préfère le papier" color="#64748b" icon={<Printer size={14} color="#64748b" />}>
                  Il prépare sur le <strong>CREP vierge papier</strong> et vous le remet (ou le garde pour l'entretien). Dans ce cas, il n'y a rien dans l'outil : c'est normal.
                </Cas>
                <Callout tone="ok">La préparation n'est <strong>pas obligatoire</strong> pour tenir l'entretien. Un agent qui n'a rien préparé peut être évalué normalement.</Callout>
              </Section>
            )}

            <Section icon={<PenLine size={15} color={COLORS.primary} />} title={`Étape ${nCrep} — Le CREP : avant, pendant et après l'entretien`}>
              <div style={{ marginBottom: 8 }}>Deux façons de tenir le compte rendu. <strong>Dans les deux cas, le CREP est signé à la main sur papier, puis téléversé dans l'outil</strong>{f.esign && <> (sauf signature électronique, voir plus bas)</>}.</div>

              <Cas code="Méthode 1" title="Je saisis dans l'outil" color="#16a34a">
                <Gestes items={[
                  <>Cliquer sur <strong>« Saisir l'EP »</strong> sur la ligne de l'agent{f.prep && <> et lire sa préparation si elle existe</>}.</>,
                  <>Remplir le <strong>compte rendu</strong> : bilan, objectifs, compétences, formations, perspectives, <strong>appréciation générale</strong>. Cliquer régulièrement sur <strong>« Enregistrer le brouillon »</strong> : rien n'est envoyé.</>,
                  <>Cliquer sur <strong>« Vérifier la cohérence »</strong> : l'outil liste les rubriques oubliées. Les corriger.</>,
                  <>Cliquer sur <strong>« Imprimer / PDF »</strong> : le CREP sort sur 4 pages, <strong>à faire signer</strong>.</>,
                  <>Remettre le CREP à l'agent : il <strong>renseigne les 2 cadres qui le concernent</strong> et <strong>signe à la main</strong>. Quand il vous le rend, <strong>vous le contresignez</strong>.</>,
                  <><strong>Numériser</strong> les pages signées et les <strong>téléverser dans l'outil</strong> (voir « Téléverser le CREP signé »).</>,
                  <>Vérifier le contenu puis cliquer sur <strong>« Valider le compte rendu »</strong>.</>,
                ]} />
              </Cas>

              <Cas code="Méthode 2" title="Je préfère écrire à la main" color="#d97706" icon={<PenLine size={14} color="#d97706" />}>
                <Gestes items={[
                  <>Avant l'entretien : <strong>imprimer le CREP vierge</strong> (icône imprimante de la ligne de l'agent).</>,
                  <>Pendant l'entretien : écrire à la main, comme avant.</>,
                  <>Remettre le CREP à l'agent : il <strong>renseigne les 2 cadres qui le concernent</strong> et <strong>signe à la main</strong>. Quand il vous le rend, <strong>vous le contresignez</strong>.</>,
                  <><strong>Numériser</strong> les pages signées et les <strong>téléverser dans l'outil</strong> (voir « Téléverser le CREP signé »).</>,
                  <>Vérifier le contenu lu sur le papier puis cliquer sur <strong>« Valider le compte rendu »</strong>.</>,
                ]} />
              </Cas>

              <Callout tone="warn" title="Téléverser le CREP signé : dans tous les cas où il y a du papier">
                Que le CREP ait été <strong>écrit à la main</strong> ou <strong>saisi dans l'outil puis imprimé</strong>, la signature est manuscrite : le document signé doit être <strong>numérisé</strong> (scan ou photos des pages) et <strong>téléversé dans l'outil</strong>. <strong>L'original signé part à la RH.</strong> Le document numérique conservé dans l'outil est « non contractuel » : seul l'original signé fait foi.
              </Callout>

              <div style={{ fontWeight: 800, color: COLORS.text, margin: '10px 0 6px' }}>Téléverser le CREP signé</div>
              <Gestes items={[
                <>Ouvrir l'EP (« Saisir l'EP ») puis cliquer sur <strong>« Importer un compte rendu papier (scan ou photos) »</strong> et choisir <strong>toutes les pages d'un coup</strong> (photos JPG/PNG prises au téléphone, ou PDF ; 8 pages au maximum, 25 Mo par fichier). Pour archiver le document signé, le bouton <strong>« CREP manuscrit (4 pages scannées) »</strong> est aussi disponible une fois le compte rendu validé.</>,
                <>Les textes manuscrits et <strong>les cases cochées de la grille d'appréciation</strong> sont lus et rangés dans les bonnes rubriques. La lecture prend quelques minutes (environ 30 secondes par page) et se fait <strong>en tâche de fond</strong> : un bandeau « Lecture des textes en cours » s'affiche, vous pouvez fermer la fenêtre, et vous recevez un <strong>e-mail</strong> quand c'est prêt. Revenez alors sur l'entretien et cliquez sur <strong>« Voir la proposition »</strong>.</>,
                <><strong>Relisez et corrigez la proposition, rubrique par rubrique, dans l'ordre des pages du CREP.</strong> Les lectures incertaines et les corrections automatiques sont signalées. Cochez « J'ai vérifié chaque ligne par rapport au document papier », puis « Appliquer au formulaire ». Rien n'est enregistré tant que vous n'avez pas validé.</>,
              ]} />
              <div style={{ marginTop: 6, color: '#64748b' }}>Pour un meilleur résultat : une photo par page, à plat, bien éclairée, la page entière visible, écriture lisible. Le sens de la photo (page couchée ou à l'envers) n'est pas un problème.</div>
              <div style={{ marginTop: 6 }}><strong>Si le CREP avait été saisi dans l'outil</strong> avant d'être imprimé et signé, seuls <strong>les 2 commentaires manuscrits de l'agent</strong> (page 4) sont lus : le reste du compte rendu n'est ni relu ni modifié.</div>
              <div style={{ marginTop: 6 }}><strong>Ce qui est conservé :</strong> la <strong>version scannée</strong> (vos photos assemblées en un PDF, consultable via « CREP original ») et la <strong>version numérique</strong> (« Imprimer / PDF »), qui porte le filigrane <strong>« DOCUMENT NON CONTRACTUEL »</strong> et la mention <strong>« Document original manuscrit signé »</strong> à la place des signatures.</div>
              <div style={{ marginTop: 6 }}><strong>Si le papier n'est pas le formulaire de cet agent</strong> (par exemple un CREP d'une autre catégorie), l'outil le signale : les cases ne sont reprises que lorsqu'elles correspondent clairement à un critère du modèle de l'agent, et chacune est à vérifier.</div>

              <Callout tone="ok" title="Après la clôture : lecture seule, original à la RH, consultation">
                Dès que le CREP est <strong>validé</strong>, tous les champs passent en <strong>lecture seule</strong> et les boutons de saisie disparaissent. L'outil rappelle que <strong>l'original signé doit être transmis à la RH</strong>.
                Vous pouvez <strong>consulter les documents</strong> (scan du CREP signé, PDF) <strong>jusqu'à la clôture de la campagne</strong> ; une fois la campagne close, le CREP est consultable dans le <strong>dossier de l'agent</strong>.
                Seul un administrateur peut dévalider un CREP, en cas d'erreur manifeste : prévenez-le dans ce cas.
              </Callout>

              <Callout tone="warn" title="Valider : une étape obligatoire">
                Cliquez sur <strong>« Valider le compte rendu »</strong> après avoir tout vérifié (toutes les rubriques obligatoires doivent être remplies). L'EP passe à « Réalisé ». Tant que le compte rendu n'est pas validé, l'EP n'est pas « Réalisé » et il apparaît « en retard » dans les statistiques de la Direction.
              </Callout>

              {f.esign && (
                <Cas code="Signature électronique" title="Variante : l'agent et vous avez une adresse e-mail et la signature électronique est ouverte pour lui" color="#16a34a" icon={<Send size={14} color="#16a34a" />}>
                  <Gestes items={[
                    <>Saisir le compte rendu dans l'outil, le vérifier et le valider.</>,
                    <>Cliquer sur <strong>« Envoyer à l'agent »</strong>.</>,
                    <>L'agent reçoit un e-mail : il <strong>relit</strong>, remplit <strong>ses deux cases</strong> (« Néant » si rien) puis clique sur <strong>« Valider et envoyer pour signature »</strong>.</>,
                    <>Le document part au <strong>parapheur</strong> : vous recevez, comme l'agent, un lien de signature par e-mail. Cliquez, signez.</>,
                    <>Quand les deux signatures sont faites, le PDF signé est <strong>archivé automatiquement</strong> (bouton « CREP signé »). Il n'y a ni impression ni téléversement.</>,
                  ]} />
                  <Callout tone="info" title="Envoyé trop vite ?">
                    Tant que l'agent n'a pas validé, cliquez sur <strong>« Rappeler le compte rendu »</strong> : il revient chez vous, vous corrigez, puis vous le renvoyez. L'outil envoie aussi des <strong>rappels automatiques</strong> à l'agent qui tarde.
                  </Callout>
                  <Callout tone="warn" title="Blocages normaux à connaître">
                    <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>
                      <li>« Envoyé à l'agent » : impossible de téléverser un papier tant que vous n'avez pas <strong>rappelé</strong> le compte rendu.</li>
                      <li>« En signature » : il faut attendre la fin du parapheur (ou son annulation/refus) pour passer en papier.</li>
                      <li>Si le bouton « Envoyer à l'agent » n'apparaît pas pour un agent : la signature électronique n'est pas ouverte pour lui, ou il n'a pas d'e-mail. Ce n'est pas une panne : utilisez le circuit papier.</li>
                    </ul>
                  </Callout>
                </Cas>
              )}

              {(f.aiDraft || f.aiReview) && (
                <Cas code="Aides à la rédaction" title="Aides activées pour vous" color="#7c3aed" icon={<Sparkles size={14} color="#7c3aed" />}>
                  <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>
                    {f.aiDraft && <li>Le bouton <strong>« Rédiger avec l'IA »</strong> propose un texte à partir de vos notes. Vous devez toujours le relire et le corriger.</li>}
                    {f.aiReview && <li>La <strong>relecture de cohérence</strong> signale les incohérences entre les rubriques. Elle signale, elle ne décide pas à votre place.</li>}
                  </ul>
                </Cas>
              )}
            </Section>

            <Section icon={<Users size={15} color={COLORS.primary} />} title="Cas particulier — vous êtes le N+1 d'un valideur qui n'a pas d'e-mail">
              <div style={{ marginBottom: 8 }}>
                Certains valideurs n'ont <strong>pas d'adresse e-mail</strong> : ils ne se connectent pas à MagApp. <strong>Leur N+1 (le valideur placé au-dessus d'eux) fait le travail à leur place</strong>, pour les agents qu'ils évaluent.
              </div>
              <Gestes items={[
                <>Ouvrir l'onglet <strong>« EP de mon équipe »</strong> et cliquer sur <strong>« Tout déplier »</strong>.</>,
                <>Repérer le valideur marqué <strong>« Valideur sans e-mail : vous gérez ses EP »</strong>. Ses agents portent la mention « Sans e-mail · géré par son N+1 ».</>,
                <>Sur la ligne d'un agent, vous avez les boutons <strong>« Planifier »</strong> et <strong>« Saisir l'EP »</strong>, exactement comme pour vos propres agents.</>,
                <>Après l'entretien (mené par le valideur, sur le CREP papier signé), <strong>téléversez le compte rendu papier</strong> (scan ou photos), vérifiez-le, puis <strong>« Valider le compte rendu »</strong>.</>,
              ]} />
              <Callout tone="info" title="Toujours le circuit papier">
                Sans e-mail du valideur, il n'y a ni invitation Outlook pour lui{f.esign && <>, ni signature électronique</>} : c'est normal. Chaque action est tracée à <strong>votre</strong> nom dans le Journal.
              </Callout>
              <Callout tone="warn" title="Pas de relance automatique pour ces EP">
                Les e-mails de rappel partent aux valideurs qui ont une adresse. Pour les EP gérés par délégation, <strong>c'est vous qui les suivez</strong> : la colonne « Compte rendu » de « EP de mon équipe » vous dit où ils en sont.
              </Callout>
            </Section>

            <Section icon={<History size={15} color={COLORS.primary} />} title="Les statuts : que veulent-ils dire ?">
              <StatusSchema f={f} />
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>À planifier</strong> : aucune date fixée. Action : fixer la date (avec l'assistant ou « à l'ancienne »).</div>
                <div><strong>Planifié</strong> : date fixée. Action : mener l'entretien, puis traiter le compte rendu.</div>
                <div><strong>Réalisé</strong> : compte rendu validé. Action : suivre le circuit de signature{f.esign ? ' (envoi à l\'agent ou papier)' : ''}.</div>
                {f.esign && <div><strong>Envoyé à l'agent</strong> : l'agent doit relire et valider. Action : attendre (ou rappeler).</div>}
                {f.esign && <div><strong>En signature</strong> : le parapheur attend les signatures. Action : signer de votre côté.</div>}
                <div><strong>Signé / Signé papier</strong> : terminé et archivé. Aucune action.</div>
              </div>
              <div style={{ fontWeight: 800, color: COLORS.text, margin: '10px 0 4px' }}>La colonne « Compte rendu » de la liste</div>
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>Validé</strong> + <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '0 6px', fontWeight: 800 }}>À imprimer et signer</span> : circuit papier.</div>
                {f.esign && <div><strong>Validé</strong> + <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 6, padding: '0 6px', fontWeight: 800 }}>À envoyer</span> : à vous d'envoyer à l'agent (circuit électronique) ou d'imprimer.</div>}
                {f.esign && <div><strong>Validé</strong> + <span style={{ background: '#f3e8ff', color: '#6b21a8', borderRadius: 6, padding: '0 6px', fontWeight: 800 }}>Chez l'agent</span> : l'agent doit relire et valider. Vous pouvez rappeler tant qu'il n'a pas validé.</div>}
                {f.esign && <div><strong>Validé</strong> + <span style={{ background: '#ffedd5', color: '#9a3412', borderRadius: 6, padding: '0 6px', fontWeight: 800 }}>En signature</span> : le parapheur attend les signatures.</div>}
                {f.esign && <div><strong>Validé</strong> + <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '0 6px', fontWeight: 800 }}>Signature refusée / annulée</span> : reprendre en renvoyant, ou passer au papier.</div>}
                <div><strong>Validé</strong> + <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 6, padding: '0 6px', fontWeight: 800 }}>Signé (papier){f.esign ? ' / Signé' : ''}</span> : terminé.</div>
              </div>
            </Section>

            <Section icon={<CheckCircle2 size={15} color={COLORS.primary} />} title="Vos gestes, dans l'ordre">
              <div style={{ display: 'grid', gap: 3 }}>
                {[
                  <>Ouvrir MagApp → « Entretiens professionnels » → « EP que je réalise », et vérifier mes agents.</>,
                  <>Prendre rendez-vous (avec l'assistant, ou « à l'ancienne »). Si l'agent n'a pas d'e-mail : le convoquer moi-même.</>,
                  ...(f.prep ? [<>L'agent prépare son entretien dans « Mon entretien » (facultatif).</>] : []),
                  <>Préparer le CREP : imprimer le CREP vierge si je veux le remplir à la main.</>,
                  <>Mener l'entretien.</>,
                  <>Si j'ai saisi dans l'outil : « Imprimer / PDF ».</>,
                  <>Transmettre le CREP à l'agent : il remplit ses 2 cadres et signe à la main.</>,
                  <>Contresigner.</>,
                  <>Numériser et téléverser le CREP signé ; l'original part à la RH.</>,
                  <>Vérifier tout, puis « Valider le compte rendu ».</>,
                ].map((it, i) => <div key={i}>{i + 1}. {it}</div>)}
              </div>
            </Section>

            <Section icon={<AlertTriangle size={15} color={COLORS.primary} />} title="Si quelque chose ne va pas">
              <div style={{ display: 'grid', gap: 6 }}>
                <div><strong>L'agent n'apparaît pas.</strong> Il n'est pas rattaché à vous : utilisez « Ajouter un agent » ou « Changer l'évaluateur » (étape 1). Si l'agent reste introuvable, prévenir l'administrateur.</div>
                <div><strong>L'agent dit n'avoir rien reçu.</strong> Vérifier son adresse e-mail. Si elle est vide, vous devez le convoquer vous-même (étape 2). Vérifier aussi ses courriers indésirables.</div>
                <div><strong>Je me suis trompé de date.</strong> « Modifier le RDV ». Ne pas recréer un EP.</div>
                {f.esign && <div><strong>Je n'ai pas le bouton « Envoyer à l'agent ».</strong> L'agent ou vous n'avez pas d'e-mail, ou la signature électronique n'est pas ouverte pour lui, ou le compte rendu n'est pas encore validé. Utiliser le circuit papier.</div>}
                <div><strong>« Valider le compte rendu » est refusé.</strong> Il manque des rubriques : la liste s'affiche en orange. Les remplir.</div>
                {f.esign && <div><strong>J'ai envoyé à l'agent par erreur.</strong> « Rappeler le compte rendu », tant que l'agent n'a pas validé.</div>}
                <div><strong>J'ai validé trop vite ou sur le mauvais agent.</strong> Ne rien modifier ailleurs et prévenir l'administrateur du module.</div>
                <div><strong>Le CREP papier est perdu avant la numérisation.</strong> Réimprimer le CREP rempli depuis l'EP, refaire signer, puis numériser.</div>
                <div><strong>La lecture du papier est mauvaise ou incomplète.</strong> Refaire les photos (une par page, à plat, bien éclairées) ou recopier les rubriques à la main dans l'outil. Vous restez maître du contenu validé.</div>
                <div><strong>Je ne vois pas « Saisir l'EP ».</strong> Vérifier que vous êtes sur « EP que je réalise ». Si l'EP est déjà réalisé, le bouton devient « Ouvrir ».</div>
              </div>
            </Section>

            <Section icon={<Lock size={15} color={COLORS.primary} />} title="Ce que vous ne faites pas">
              <div style={{ display: 'grid', gap: 3 }}>
                <div>Ne pas utiliser le compte d'un collègue.</div>
                <div>Ne pas envoyer le CREP par un autre canal que l'outil et la RH (mail personnel, clé USB…).</div>
              </div>
            </Section>

            <Section icon={<BookOpen size={15} color={COLORS.primary} />} title="Lexique simple">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>EP</strong> : entretien professionnel.</div>
                <div><strong>CREP</strong> : compte rendu d'entretien professionnel, le document officiel de 4 pages.</div>
                <div><strong>Valideur / évaluateur</strong> : la personne qui conduit l'entretien (vous). Les deux mots désignent la même chose dans l'outil.</div>
                <div><strong>MagApp</strong> : le « magasin d'applications » de la Ville, où se trouve la tuile « Entretiens professionnels ».</div>
                {f.esign && <div><strong>Parapheur</strong> : l'outil de signature électronique. Chaque signataire reçoit un lien par e-mail.</div>}
                <div><strong>AD</strong> : Active Directory, l'annuaire des comptes et des e-mails.</div>
              </div>
            </Section>
          </>
        ) : (
          <>
            <Callout tone="info" title="Votre rôle : préparer le cadre, pas saisir les EP">
              Vous désignez les valideurs, vous ouvrez la campagne, vous vérifiez la base agents et vous surveillez l'avancement.
              Vous n'avez pas à remplir les CREP à la place des valideurs.
            </Callout>

            <Section icon={<ShieldCheck size={15} color={COLORS.primary} />} title="Désigner un valideur, pas à pas">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>1.</strong> Ouvrir « Paramétrage » puis la zone de désignation des valideurs.</div>
                <div><strong>2.</strong> Rechercher la personne dans l'Active Directory (nom, prénom, identifiant).</div>
                <div><strong>3.</strong> L'outil cherche son matricule RH. Si le lien échoue, rechercher l'agent dans la base RH et le sélectionner.</div>
                <div><strong>4.</strong> Choisir le niveau : directeur, DGA, DG ou sous-valideur.</div>
                <div><strong>5.</strong> Pour un DGA/DG, cocher les directions couvertes.</div>
                <div><strong>6.</strong> Valider. Le valideur apparaît alors dans la liste et peut choisir ses agents.</div>
              </div>
              <Callout tone="warn" title="Un agent = un seul valideur">
                C'est la règle qui garantit la clarté. Si un agent change de service, commencer par le retirer de l'ancien valideur, puis le rattacher au nouveau.
              </Callout>
            </Section>

            <Section icon={<Users size={15} color={COLORS.primary} />} title="Campagne et base des agents">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Créer la campagne de l'année : dates d'ouverture, de clôture et date limite des EP.</div>
                <div>Importer le classeur « Outil CREP DSI » : onglet <strong>Base_agents</strong> pour les agents, onglets <strong>Template_*</strong> pour les modèles.</div>
                <div>Vérifier le rapprochement AD : e-mail par matricule, puis par nom/prénom.</div>
                <div><strong>Surveiller les agents sans e-mail</strong> (filtre « statut e-mail ») : ils recevront ni invitation ni circuit électronique, leur valideur suivra le circuit papier. Si l'agent a un compte AD, le rattacher avec « Lier l'AD ».</div>
                <div>En cas de doublon d'adresse e-mail : ouvrir <strong>« Changer (AD) »</strong>, cliquer <strong>« Enlever l'adresse e-mail »</strong>, puis rattacher le bon compte.</div>
                <div>Les filtres permettent de cibler par catégorie, direction, service, grade, modèle, statut e-mail ou valideur.</div>
              </div>
            </Section>

            <Section icon={<Mail size={15} color={COLORS.primary} />} title="Ce que le module envoie tout seul (e-mails)">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>Au valideur :</strong> « entretien à planifier » à sa désignation ; confirmation de rendez-vous ; récapitulatif de relance (EP à planifier, à finaliser, à envoyer).</div>
                <div><strong>À l'agent (s'il a une adresse) :</strong> « Préparez votre entretien » avec le CREP vierge en pièce jointe ; relance de préparation ; « Votre compte rendu est disponible » ; relance de validation ; avis de rappel si le valideur reprend son compte rendu.</div>
                <div><strong>Du parapheur :</strong> liens de signature à l'agent et au valideur, puis résultat.</div>
              </div>
              <Callout tone="warn" title="Mode BETA : qui reçoit vraiment les mails ?">
                Tant que la fonctionnalité n'est pas <strong>publiée</strong> (réglage dans /admin/magapp), <strong>aucun mail ni invitation ne part aux agents de la Ville, sauf ceux inscrits à la BETA « Entretiens professionnels »</strong>.
                C'est volontaire : cela permet de tester sans prévenir les vrais agents. Si un agent « ne reçoit rien », vérifiez d'abord ce réglage.
              </Callout>
            </Section>

            <Section icon={<Sparkles size={15} color={COLORS.primary} />} title={<>Fonctions activables<Activable /></>}>
              <div style={{ marginBottom: 8 }}>
                Ces fonctions sont <strong>désactivées par défaut</strong> : elles s'ouvrent dans <strong>Paramétrage</strong>, pour tous les agents ou valideurs, ou pour une sélection de personnes.
                <strong> Tant qu'une fonction n'est pas activée, l'aide des valideurs n'en parle pas</strong> : elle apparaît dans leur aide dès qu'elle est activée pour eux.
              </div>
              <Cas code="Signature électronique" title={<>Signature par parapheur électronique<Activable /></>} color="#16a34a" icon={<Send size={14} color="#16a34a" />}>
                <strong>Si la signature électronique est activée</strong> pour un agent (et qu'il a une adresse e-mail, comme son valideur) : le valideur dispose du bouton « Envoyer à l'agent » ; l'agent relit le CREP, remplit ses 2 cadres, valide, puis l'agent et le valideur signent par lien e-mail dans le parapheur ; le PDF signé est archivé automatiquement. Il n'y a ni impression, ni signature manuscrite, ni téléversement.
                <br /><strong>Si elle n'est pas activée</strong> : le circuit est papier pour tous (impression, signature manuscrite, numérisation, téléversement). Les boutons et statuts du parapheur n'apparaissent pas.
              </Cas>
              <Cas code="Préparation de l'agent" title={<>Préparation de l'entretien par l'agent, dans « Mon entretien »<Activable /></>} color="#4f46e5" icon={<FileSignature size={14} color="#4f46e5" />}>
                <strong>Si la préparation par l'agent est activée</strong> : l'agent (avec une adresse e-mail) voit l'onglet « Mon entretien », prépare sa fiche en ligne et la transmet ; son valideur la retrouve dans l'EP avant l'entretien (vue N+1) ; l'agent est relancé automatiquement s'il ne l'a pas transmise. Le mail de convocation contient alors un bouton vers MagApp.
                <br /><strong>Sinon</strong> : l'agent prépare sur le CREP vierge papier, l'onglet « Mon entretien » n'existe pas et rien n'est relancé.
              </Cas>
              <Cas code="Aide à la rédaction" title={<>Aide à la rédaction par l'IA<Activable /></>} color="#7c3aed" icon={<Sparkles size={14} color="#7c3aed" />}>
                <strong>Si l'aide à la rédaction est activée</strong> pour un valideur : le bouton « Rédiger avec l'IA » apparaît dans le compte rendu ; il propose un texte à partir des notes du valideur, qui doit le relire et le corriger.
                <br /><strong>Sinon</strong> : le bouton n'existe pas, le valideur rédige seul.
              </Cas>
              <Cas code="Relecture de cohérence" title={<>Relecture de cohérence par l'IA<Activable /></>} color="#7c3aed" icon={<Sparkles size={14} color="#7c3aed" />}>
                <strong>Si la relecture est activée</strong> pour un valideur : en plus des contrôles automatiques (rubriques oubliées), « Vérifier la cohérence » signale les incohérences entre rubriques (appréciation générale contredisant la grille, par exemple).
                <br /><strong>Sinon</strong> : seuls les contrôles automatiques sont faits.
              </Cas>
              <Cas code="Mode simulation" title={<>Mode simulation<Activable /></>} color="#d97706" icon={<FlaskConical size={14} color="#d97706" />}>
                <strong>Si le mode simulation est activé</strong> : on peut tester le parcours sans polluer les données réelles ; aucun mail ne part aux agents hors BETA et des demandes de formation fictives apparaissent. Les valideurs, « qui valide qui » et le lien Active Directory restent réels.
                <br /><strong>Sinon</strong> : l'application fonctionne sur les données réelles, sans demandes fictives.
              </Cas>
              <Cas code="Publication" title={<>Publication de la fonctionnalité (mode BETA)<Activable /></>} color="#64748b" icon={<Mail size={14} color="#64748b" />}>
                <strong>Tant qu'elle n'est pas publiée</strong> (réglage dans /admin/magapp), seuls les agents inscrits à la BETA reçoivent des mails.
                <br /><strong>Une fois publiée</strong> : tous les agents concernés sont prévenus normalement.
              </Cas>
            </Section>

            <Section icon={<Send size={15} color={COLORS.primary} />} title={<>Signature électronique : qui y a droit ?<Activable /></>}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>Si la signature électronique n'est pas activée</strong> (réglage par défaut) : tous les agents passent par le circuit papier (impression, signature manuscrite, numérisation, téléversement).</div>
                <div><strong>Si elle est activée pour tous</strong> (« Réactiver pour tous ») : tout agent <em>avec e-mail</em> peut signer en ligne.</div>
                <div><strong>Si elle est activée pour une sélection</strong> : seuls les agents cochés. Pour les autres, le valideur voit « signature non activée pour cet agent » et suit le circuit papier.</div>
                <div>Dans tous les cas, <strong>un agent sans e-mail reste au circuit papier</strong>, même si la signature est ouverte.</div>
              </div>
              <Callout tone="info">Le document final est identique dans les deux circuits : ce choix ne crée aucune différence de traitement entre agents.</Callout>
            </Section>

            <Section icon={<Lock size={15} color={COLORS.primary} />} title="Clore la campagne et dévalider un CREP">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>Clore la campagne</strong> (Paramétrage → Campagnes, bouton « Clore la campagne », action définitive) : les valideurs ne consultent plus les documents des entretiens dans ce module ; les CREP clôturés sont consultés dans le <strong>dossier de l'agent</strong>. Les administrateurs gardent l'accès. L'outil indique combien d'entretiens n'étaient pas encore clôturés.</div>
                <div><strong>Dévalider un CREP</strong> (Pilotage, bouton « Dévalider », <strong>réservé aux administrateurs</strong>) : à n'utiliser qu'en cas d'<strong>erreur manifeste</strong>, avec un motif obligatoire tracé au Journal. Le CREP redevient modifiable par son valideur et repart au choix du mode de saisie. Impossible pendant un circuit de signature en cours ou une fois la campagne close.</div>
                <div>Une <strong>remise à zéro (RAZ)</strong> ramène l'entretien à l'étape zéro, <strong>y compris le choix du mode de saisie</strong>, et supprime aussi les scans conservés.</div>
              </div>
            </Section>

            <Section icon={<RotateCcw size={15} color={COLORS.primary} />} title="RAZ : remettre un EP à zéro">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>1.</strong> Ouvrir « Pilotage » et repérer l'EP concerné.</div>
                <div><strong>2.</strong> Cliquer sur le bouton rouge <strong>« RAZ »</strong>.</div>
                <div><strong>3.</strong> Lire la confirmation, puis confirmer.</div>
                <div><strong>4.</strong> L'EP revient à « À planifier » : rendez-vous, préparation, compte rendu, commentaires, objectifs, formations et pièces jointes sont supprimés.</div>
              </div>
              <Callout tone="warn" title="Action irréversible, réservée aux administrateurs">
                L'agent et son valideur sont conservés. Un parapheur en cours est annulé ; un parapheur déjà signé est conservé dans les archives, seul le lien avec l'EP est supprimé.
                Utiliser la RAZ uniquement pour corriger une erreur de test ou une saisie faite sur le mauvais agent.
              </Callout>
            </Section>

            <Section icon={<Users size={15} color={COLORS.primary} />} title="Droits : qui peut voir quoi ?">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>Mon entretien</strong><Activable /> : accès de l'agent à sa préparation et à son CREP, s'il est activé pour lui.</div>
                <div><strong>Signature électronique</strong><Activable /> : ouverte agent par agent, si elle est activée.</div>
                <div><strong>IA</strong><Activable /> : rédaction et relecture, ouvertes à certains valideurs, si elles sont activées.</div>
                <div><strong>Réactiver pour tous</strong> ouvre à tout le monde ; <strong>Activer pour la sélection</strong> réserve aux personnes cochées.</div>
              </div>
            </Section>

            <Section icon={<GraduationCap size={15} color={COLORS.primary} />} title="Demandes de formation (onglet « Demandes de formation »)">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Cet onglet rassemble les <strong>« Actions de formation à envisager »</strong> de tous les comptes rendus de la campagne, selon les <strong>3 types</strong> (formations obligatoires, autres formations métiers, formations liées au parcours), <strong>classées par direction puis par service</strong>. Cliquer sur une direction pour la déplier.</div>
                <div><strong>La vue est non nominative</strong> : ni nom ni identifiant d'agent n'est affiché ou transmis à l'IA.</div>
                <div>Le bouton <strong>« Analyser avec l'IA locale »</strong> confie l'ensemble à l'IA de la Ville (en tâche de fond, quelques dizaines de secondes) : elle <strong>regroupe les demandes en thèmes</strong> (ex. management et encadrement ensemble ; Word et Excel dans « Bureautique »), indique pour chaque thème le nombre de demandes, leur répartition par type et par direction, et rédige une synthèse des <strong>besoins globaux</strong> pour la DRH. Les chiffres sont recalculés par l'application, pas par l'IA.</div>
                <div>Pendant l'analyse, une <strong>barre de progression</strong> montre la phase en cours (classement, regroupement, synthèse) et le temps écoulé. À la fin, le bouton <strong>« Voir le résultat de l'analyse IA »</strong> ouvre les besoins par catégorie (préparation aux concours, bureautique, logiciels métier, formations obligatoires, certifiantes, managériales…) avec leurs sous-thèmes. Les catégories et toutes les consignes de l'IA se modifient dans <strong>Paramétrage → IA (prompts)</strong>.</div>
                <div>« Exporter (CSV) » extrait toutes les demandes pour la DRH. L'analyse est conservée : relancez-la quand de nouveaux comptes rendus arrivent.</div>
              </div>
              <Callout tone="info">Un regroupement par l'IA est une aide à la décision : relisez les thèmes (une demande peut être mal classée) avant de bâtir le plan de formation.</Callout>
            </Section>

            <Section icon={<FlaskConical size={15} color={COLORS.primary} />} title={<>Mode simulation (Paramétrage)<Activable /></>}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Dans <strong>Paramétrage → Mode simulation</strong>, un administrateur peut tester l'application sans polluer les données réelles. Les <strong>valideurs, « qui valide qui » et le lien Active Directory</strong> restent <strong>réels</strong> et ne sont jamais effacés ; les <strong>rendez-vous</strong> et les <strong>entretiens (avec leur contenu)</strong> sont <strong>provisoires</strong>.</div>
                <div>Le bouton <strong>« Supprimer la base de simulation »</strong> remet à zéro tous les rendez-vous et entretiens (saisies, comptes rendus, scans). Il n'apparaît que lorsque la simulation est active.</div>
                <div><strong>Si la simulation est activée</strong>, aucun mail ne part aux agents hors BETA et l'onglet « Demandes de formation » affiche des demandes <strong>fictives</strong> (la moitié des agents, selon leur métier), jamais enregistrées.</div>
              </div>
            </Section>

            <Section icon={<ScanLine size={15} color={COLORS.primary} />} title="Documents conservés pour les comptes rendus manuscrits">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Quand un valideur importe un CREP papier, <strong>deux versions sont conservées</strong> sur l'entretien : le <strong>scan original</strong> (PDF assemblé à partir des photos, dans le stockage GED) et la <strong>version numérique lue par l'IA</strong> (PDF généré à la demande).</div>
                <div>La version numérique porte le filigrane <strong>« DOCUMENT NON CONTRACTUEL »</strong> et « Document original manuscrit signé » à la place des signatures. <strong>L'original papier signé est envoyé à la RH</strong> par le valideur.</div>
                <div>L'analyse IA est réalisée par l'<strong>IA locale</strong> de la Ville (aucune donnée ne sort du réseau). Les analyses sont tracées dans le Journal.</div>
              </div>
            </Section>

            <Section icon={<Database size={15} color={COLORS.primary} />} title="Statistiques, journal et données personnelles">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Le <strong>Journal</strong> trace les ajouts, changements de valideur, préparations, validations, impressions et RAZ.</div>
                <div>Les <strong>statistiques</strong> donnent l'avancement par direction, service et secteur, et le taux de réalisation.</div>
                <div>Les <strong>formations</strong> demandées sont centralisées : elles peuvent être extraites pour la DRH.</div>
                <div>En fin de campagne, les données sont anonymisées avec l'appui de la <strong>DPD</strong>.</div>
              </div>
            </Section>

            <Section icon={<FileSignature size={15} color={COLORS.primary} />} title="La note à la Direction générale">
              <Shot src="/aide-ep/09-note-dg.jpg" caption="L'éditeur visuel de la note : titres, gras, listes et liens, sans connaître le Markdown" />
              Dans « Paramétrage », le bouton <strong>« Ouvrir / modifier la note »</strong> ouvre la note stratégique dans un éditeur visuel : vous écrivez comme dans un traitement de texte
              (titres, gras, listes, liens), sans connaître le Markdown. « Enregistrer » la conserve ; « Télécharger .md » en fait un fichier ;
              « Revenir au modèle proposé » recharge la version d'origine livrée avec l'outil.
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
