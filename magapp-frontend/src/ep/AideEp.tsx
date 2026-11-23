import { useState } from 'react';
import {
  X, BookOpen, UserCheck, ShieldCheck, Sparkles, Users, CalendarClock,
  FileSignature, History, MousePointerClick, CheckCircle2, AlertTriangle,
  Send, Lock, Database, RotateCcw, HelpCircle, Printer, Mail, MailX, PenLine, Route, GraduationCap, ScanLine, FileDown, FlaskConical, Inbox, Lightbulb,
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

export interface AideFeatures { prep?: boolean; aiDraft?: boolean; aiReview?: boolean; esign?: boolean; scanReading?: boolean; offlineForm?: boolean; simple?: boolean; coherence?: boolean }

/** Étapes du chemin d'un EP : seules les fonctions activées apparaissent, la numérotation s'adapte. */
function ProcessSchema({ f }: { f: AideFeatures }) {
  const steps: Array<{ title: string; who: string; body: React.ReactNode }> = [
    { title: "Vous prenez rendez-vous avec l'agent·e", who: 'Évaluateur·rice', body: <>
      Cette étape est <strong>facultative</strong> : vous pouvez toujours fixer la date « à l'ancienne ». L'outil n'est qu'une <strong>aide</strong> (recherche de créneaux, envoi de la convocation par e-mail). <strong>Si l'agent·e n'a pas d'e-mail, vous devez de toute façon le convoquer autrement</strong> (vive voix, téléphone, courrier).
    </> },
  ];
  if (f.prep) steps.push({ title: "L'agent·e prépare son entretien", who: 'Agent·e', body: <>Dans « Mon entretien » (il a une adresse e-mail et l'accès a été ouvert pour lui). Vous retrouvez sa préparation dans l'EP. Cette étape est facultative : l'entretien peut avoir lieu sans.</> });
  steps.push(
    { title: 'Vous choisissez le mode de saisie du CREP', who: 'Évaluateur·rice', body: <>Dès l'ouverture du CREP, l'outil vous demande si vous le tenez <strong>à la main</strong> ou <strong>dans l'outil</strong> ; vous pouvez changer à tout moment. Un <strong>fil d'Ariane</strong> indique où vous en êtes. Si vous souhaitez un CREP <strong>totalement manuscrit</strong>, vous l'<strong>imprimez</strong>. Si vous saisissez dans l'outil, vous saisissez la grille et les rubriques, puis vous validez votre partie avant d'imprimer.{f.offlineForm && <> Un 3ᵉ choix existe : le <strong>PDF formulaire hors ligne</strong> (voir « Méthode 3 »), qui demande <strong>2 téléversements</strong>.</>}</> },
    { title: "L'entretien a lieu", who: 'Évaluateur·rice + Agent·e', body: <>Vous échangez avec l'agent·e et vous prenez vos notes : à la main sur le CREP imprimé, ou directement dans l'outil (« Faire l’EP »).</> },
    { title: "Si vous avez saisi dans l'outil, vous imprimez", who: 'Évaluateur·rice', body: <>Cliquez sur <strong>« Imprimer / PDF »</strong> pour obtenir le CREP à faire signer. (Écrit à la main : vous avez déjà le papier.)</> },
    { title: "Vous transmettez le CREP à l'agent·e", who: 'Évaluateur·rice + Agent·e', body: <>L'agent·e <strong>renseigne les 2 cadres qui le concernent</strong> (ses observations sur les conditions de travail, puis sur l'entretien) et <strong>signe à la main</strong>.</> },
    { title: 'Vous contresignez', who: 'Évaluateur·rice', body: <>Quand l'agent·e vous rend le CREP signé, vous le <strong>contresignez</strong>.</> },
    ...(f.offlineForm ? [{ title: '(PDF hors ligne) Vous importez le formulaire rempli : 1er téléversement', who: 'Évaluateur·rice', body: <>Si vous avez choisi le mode <strong>PDF formulaire hors ligne</strong> : après l'entretien, de retour en ligne, vous <strong>importez le PDF rempli</strong>. Votre saisie est reprise dans l'outil ; vous la relisez, puis vous <strong>validez votre partie</strong> avant d'imprimer.</> }] : []),
    { title: 'Vous numérisez et vous téléversez', who: 'Évaluateur·rice', body: <>Vous <strong>numérisez</strong> le CREP signé (scan ou photos des pages) et vous le <strong>téléversez dans l'outil</strong>. C'est nécessaire <strong>dans tous les cas où il y a du papier</strong> : CREP écrit à la main, mais aussi CREP saisi dans l'outil puis imprimé et signé. <strong>L'original signé part à la DRH.</strong>{f.offlineForm && <> En mode PDF hors ligne, c'est le <strong>2ᵉ téléversement</strong>.</>}</> },
    ...(f.scanReading
      ? [{ title: "Vous vérifiez ce que l'outil a lu", who: 'Évaluateur·rice', body: <>L'outil lit le document et contrôle les <strong>2 signatures</strong> (agent·e et évaluateur). Vous <strong>relisez la proposition</strong> (en mode outil : seulement les 2 cadres de l'agent·e ; en mode manuscrit : tout le CREP, avec la grille d'appréciation), vous la corrigez si besoin et vous confirmez les signatures. <strong>C'est l'étape de vérification, propre à ce mode.</strong></> }]
      : [{ title: 'Vous consultez le document et confirmez les signatures', who: 'Évaluateur·rice', body: <>Vous <strong>consultez le document téléversé</strong> dans la visionneuse, vous confirmez qu'il porte les <strong>2 signatures</strong> (agent·e et évaluateur) et vous le validez. Il n'y a rien d'autre à vérifier.</> }]),
    { title: "Vous clôturez l'entretien", who: 'Évaluateur·rice', body: <>Cliquez sur <strong>« Clôturer l'entretien »</strong> : le CREP signé est archivé, tout est terminé. <strong>Transmettez l'original signé à la DRH.</strong></> },
    { title: 'La DRH reçoit le CREP signé', who: 'Administrateur', body: <>Quand l'original est arrivé, un administrateur le déclare <strong>« reçu par la DRH »</strong> au Pilotage. Les compteurs « À transmettre à la DRH » et « Reçus par la DRH » se mettent à jour, pour le Pilotage comme pour vous.</> },
  );
  if (f.simple) {
    // Mode simple : l'évaluateur ne téléverse jamais le CREP signé ; il l'envoie à la DRH et le signale
    const drop = ['Vous numérisez et vous téléversez', "Vous vérifiez ce que l'outil a lu", 'Vous consultez le document et confirmez les signatures', "Vous clôturez l'entretien", 'La DRH reçoit le CREP signé'];
    const kept = steps.filter(x => !drop.includes(x.title)).map(x => x.title.startsWith('Vous choisissez le mode')
      ? { ...x, body: <>Dès l'ouverture du CREP, l'outil vous demande si vous le tenez <strong>à la main</strong> ou <strong>dans l'outil</strong> ; vous pouvez changer à tout moment. Un <strong>fil d'Ariane</strong> indique où vous en êtes. Si vous saisissez dans l'outil, vous validez votre partie avant d'imprimer.{f.offlineForm && <> Un 3ᵉ choix existe : le <strong>PDF formulaire hors ligne</strong>, à importer une fois rempli.</>}</> }
      : x.title.startsWith('(PDF hors ligne)') ? { ...x, title: '(PDF hors ligne) Vous importez le formulaire rempli' } : x);
    steps.length = 0;
    steps.push(...kept,
      { title: 'Vous envoyez le CREP signé à la DRH et vous le signalez', who: 'Évaluateur·rice', body: <>Le CREP est signé par l'agent·e et par vous : <strong>envoyez l'original à la DRH</strong>, puis cliquez sur <strong>« J'ai envoyé le CREP à la DRH »</strong> dans l'entretien. <strong>Il n'y a rien à numériser ni à téléverser.</strong> L'entretien affiche « Envoyé à la DRH » (vous pouvez annuler tant que le CREP n'est pas reçu).</> },
      { title: 'La DRH vous notifie à réception du CREP papier signé', who: 'DRH', body: <>À réception du <strong>CREP papier signé</strong>, la DRH <strong>vous notifie</strong> (l'agent·e aussi) par e-mail : tout est en ordre et l'entretien est clôturé. Vous n'avez rien d'autre à faire.</> },
    );
  }
  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, background: '#f8fafc', marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: COLORS.text, marginBottom: 8 }}>Le chemin d'un EP, de la prise de rendez-vous à la clôture</div>
      {steps.map((s, i) => <Step key={i} n={i + 1} title={s.title} who={s.who}>{s.body}</Step>)}
      {f.esign && (
        <div style={{ marginTop: 6, border: '1px solid #bbf7d0', background: '#f0fdf4', color: '#166534', borderRadius: 8, padding: '8px 11px', fontSize: 12 }}>
          <strong>Signature électronique ouverte pour cet·te agent·e</strong> (il a une adresse e-mail, vous aussi) : au lieu de faire imprimer, signer, {f.simple ? 'envoyer à la DRH' : 'numériser et téléverser'}, vous cliquez sur <strong>« Envoyer à l'agent·e »</strong> ; il relit, remplit ses 2 cadres et valide, puis vous signez tous les deux dans le parapheur. Le document signé est archivé automatiquement.
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
        {box('Onglet « EP de mon équipe »', 'Contrôle de vos agent·e·s (lecture)', '#bbf7d0')}
        {f.prep && box('Onglet « Mon entretien »', 'Votre propre EP, quand vous êtes évalué(e)', '#fde68a')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 6 }}>
        {box('Bouton « Planifier »', 'Fixer le rendez-vous (facultatif)')}
        {box('Bouton « Faire l’EP »', 'Ouvrir et remplir le CREP')}
        {box('Icône imprimante', 'Imprimer le CREP (vierge ou rempli)')}
        {f.simple ? box('« J’ai envoyé le CREP à la DRH »', 'Signaler l’envoi du CREP signé (rien à téléverser)') : box('« Importer un compte rendu papier »', 'Téléverser le CREP signé (scan ou photos)')}
        {box('« Valider le compte rendu »', 'Passe l\'EP à « Réalisé »')}
        {box('« CREP papier » / « CREP saisi »', 'Documents d\'un EP clôturé : le scan signé et la saisie dans l\'outil')}
        {f.esign && box('« Envoyer à l’agent·e »', 'Signature électronique (si ouverte pour l\'agent·e)')}
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
        {f.esign && <><Chip label="Envoyé à l'agent·e" color="#6b21a8" bg="#f3e8ff" /><Arrow /><Chip label="En signature" color="#9a3412" bg="#ffedd5" /><Arrow /></>}
        {f.simple && <><Chip label="Envoyé à la DRH" color="#9a3412" bg="#ffedd5" /><Arrow /></>}
        <Chip label={f.simple ? 'Clôturé (reçu par la DRH)' : 'Signé / archivé'} color="#065f46" bg="#d1fae5" />
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
          <tr><th style={th}>Situation</th><th style={th}>Rendez-vous</th>{f.prep && <th style={th}>Préparation de l'agent·e</th>}<th style={th}>Compte rendu et signature</th></tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}><strong>L'agent·e a une adresse e-mail</strong></td>
            <td style={td}>Invitation Outlook + e-mail avec le CREP vierge (si vous utilisez l'assistant de planification)</td>
            {f.prep && <td style={td}>En ligne dans « Mon entretien », ou sur papier</td>}
            <td style={td}>
              {f.simple
                ? <>CREP signé à la main par l'agent·e et par vous : vous l'envoyez à la DRH puis vous le signalez dans l'outil (rien à téléverser).</>
                : <>CREP signé à la main : vous le numérisez et vous le téléversez, puis vous validez.</>}
              {f.esign && <> Si la signature électronique est ouverte pour lui : « Envoyer à l'agent·e » → il valide → signatures dans le parapheur → archivage automatique.</>}
            </td>
          </tr>
          <tr>
            <td style={td}><strong>L'agent·e n'a pas d'e-mail</strong></td>
            <td style={td}>Aucun envoi possible : vous le convoquez vous-même (vive voix, téléphone, courrier) et vous lui remettez le CREP vierge imprimé</td>
            {f.prep && <td style={td}>Sur papier uniquement</td>}
            <td style={td}>{f.simple ? 'Toujours sur papier : impression, signatures, envoi à la DRH' : 'Toujours sur papier : impression, signatures, numérisation, téléversement, validation'}</td>
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
            <UserCheck size={14} /> Je suis évaluateur·rice
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
                Le déroulé change surtout selon une question : <strong>l'agent·e a-t-il une adresse e-mail ?</strong>
                {' '}Vous n'avez pas à le deviner : l'outil le sait et ne vous propose que les boutons qui marchent.
              </div>
              <Matrice f={f} />
              <Callout tone="info" title="Comment savoir si l'agent·e a un e-mail ?">
                Dans la liste « EP que je réalise », la colonne de l'agent·e indique son adresse. Si elle est vide, l'agent·e suit le circuit papier, <strong>sauf si vous savez qu'il en a une</strong> : l'orthographe de son nom diffère peut-être entre la base RH et l'annuaire informatique, et vous pouvez faire le lien vous-même (étape 1, « Lier l'AD »).
              </Callout>
            </Section>

            <Section icon={<Users size={15} color={COLORS.primary} />} title="Où cliquer dans MagApp ?">
              <ScreenMap f={f} />
              <Callout tone="warn" title="Ne pas confondre les espaces">
                <strong>« EP que je réalise »</strong> = les entretiens dont vous êtes l'évaluateur (vous les remplissez).
                <strong> « EP de mon équipe »</strong> = la vue de contrôle de vos agent·e·s (souvent en lecture seule).
                {f.prep && <><strong> « Mon entretien »</strong> = votre propre entretien, quand vous êtes évalué(e).</>}
              </Callout>
            </Section>

            <Section icon={<CheckCircle2 size={15} color={COLORS.primary} />} title="Avant de commencer : 3 vérifications">
              <div style={{ display: 'grid', gap: 6 }}>
                <div><strong>1.</strong> Je suis bien connecté avec <strong>mon compte personnel</strong>, pas celui d'un collègue.</div>
                <div><strong>2.</strong> Je vois le bon nombre d'agent·e·s dans « EP que je réalise » (ou « EP de mon équipe »).</div>
                <div><strong>3.</strong> Je repère les agent·e·s <strong>sans adresse e-mail</strong> : je devrai les convoquer moi-même, et ils suivent le circuit papier.</div>
              </div>
            </Section>

            <Section icon={<CalendarClock size={15} color={COLORS.primary} />} title="Étape 1 — Ouvrir le module et vérifier ses agent·e·s">
              <Gestes items={[
                <>Ouvrir MagApp et se connecter avec son identifiant habituel.</>,
                <>Cliquer sur la tuile <strong>« Entretiens professionnels »</strong>.</>,
                <>Cliquer sur l'onglet <strong>« EP que je réalise »</strong>.</>,
                <>Vérifier que chaque agent·e de votre équipe apparaît <strong>une seule fois</strong>.</>,
              ]} />
              <Callout tone="warn" title="Un·e agent·e manque ou l’évaluateur·rice affiché est faux ?">
                Vous pouvez le corriger <strong>vous-même</strong>, sans attendre l'administrateur : voir les modes opératoires ci-dessous.
                Règle à garder en tête : <strong>un·e agent·e = un seul évaluateur·rice</strong>.
              </Callout>

              <Cas code="Il manque un·e agent·e" title="M'ajouter un·e agent·e qui n'a pas encore d’évaluateur·rice" color="#16a34a" icon={<Users size={14} color="#16a34a" />}>
                <Gestes items={[
                  <>Aller dans l'onglet <strong>« EP que je réalise »</strong>.</>,
                  <>Cliquer sur le bouton bleu <strong>« Ajouter un·e agent·e »</strong> (au-dessus du tableau).</>,
                  <>Une fenêtre liste les agent·e·s <strong>de votre direction qui n'ont encore aucun évaluateur</strong>. Taper un nom dans la zone de recherche puis <strong>« Rechercher »</strong> si besoin.</>,
                  <>Cliquer sur <strong>« Ajouter »</strong> en face de l'agent·e : il apparaît aussitôt dans votre liste, prêt à être planifié.</>,
                ]} />
                <Callout tone="info" title="L'agent·e n'est pas dans la liste ?">
                  Soit il a <strong>déjà un·e évaluateur·rice</strong> (voir « changer l’évaluateur·rice »), soit il n'est pas dans votre direction ou pas dans la base des agent·e·s : prévenez l'administrateur.
                </Callout>
              </Cas>

              <Cas code="Mauvais évaluateur·rice" title="Changer l’évaluateur·rice d'un·e agent·e" color="#4f46e5" icon={<UserCheck size={14} color="#4f46e5" />}>
                <Gestes items={[
                  <>Dans la liste, repérer la ligne de l'agent·e concerné.</>,
                  <>Cliquer sur l'icône <strong>« personne avec un engrenage »</strong> (info-bulle « Changer l'évaluateur ») à droite de la ligne.</>,
                  <>La fenêtre affiche l'évaluateur actuel et la liste des évaluateurs possibles. Chercher le bon nom (nom, matricule ou e-mail).</>,
                  <>Cliquer sur <strong>« Choisir »</strong> en face du bon évaluateur·rice. L'agent·e quitte votre liste (ou rejoint la vôtre) immédiatement.</>,
                ]} />
                <div style={{ marginTop: 4 }}>
                  <strong>Pour récupérer un·e agent·e d'un collègue</strong> (ou donner un de vos agent·e·s à un collègue), c'est le même geste. Le droit est réservé à l'évaluateur actuel de l'agent·e, à son supérieur et aux administrateurs.
                </div>
                <Callout tone="warn" title="Si l'EP est déjà commencé">
                  Changer d’évaluateur·rice ne supprime rien de ce qui a été saisi, mais le nouvel·l’évaluateur·rice reprend la main à partir de là. Prévenez l'ancien évaluateur·rice et l'agent·e. Toutes les modifications sont inscrites dans le <strong>Journal</strong>.
                </Callout>
              </Cas>

              <Cas code="Vue équipe" title="Si vous êtes directeur ou DGA : depuis « EP de mon équipe »" color="#64748b" icon={<Users size={14} color="#64748b" />}>
                Dans l'onglet <strong>« EP de mon équipe »</strong>, les agent·e·s sont rangés par évaluateur·rice (cliquer sur « Tout déplier »). Le bouton « Ajouter un·e agent·e » devient
                <strong> « Choisir l'évaluateur »</strong> : vous choisissez d'abord l'agent·e sans évaluateur, puis l’évaluateur·rice à lui affecter, parmi les évaluateur·rice·s de votre périmètre.
                <div style={{ marginTop: 6 }}><strong>Vous n'y figurez pas vous-même</strong> : seuls les évaluateur·rice·s placés sous vous sont listés (vos propres agent·e·s sont dans « EP que je réalise »). Sur la ligne de chaque évaluateur·rice, <strong>« Imprimer ses N CREP »</strong> imprime d'un coup les CREP vierges de ses agent·e·s, sans rien sélectionner. « Tout sélectionner » ne concerne que les EP affichés (évaluateur·rice·s dépliés).</div>
              </Cas>

              <Cas code="Pas d'e-mail" title="Un·e agent·e est affiché sans adresse e-mail : le rapprochement RH ↔ annuaire informatique" color="#d97706" icon={<MailX size={14} color="#d97706" />}>
                <div style={{ marginBottom: 6 }}>
                  <strong>Pourquoi ça arrive ?</strong> Les agent·e·s viennent de la <strong>base RH</strong>, mais les adresses e-mail sont dans l'<strong>annuaire informatique</strong> (l'AD).
                  L'outil relie les deux en comparant matricule, puis nom et prénom. Quand l'orthographe diffère (accent, tiret, nom d'usage, prénom composé, faute de frappe), <strong>le lien ne se fait pas tout seul</strong> et l'agent·e apparaît « sans e-mail », <strong>alors qu'il en a bien un</strong>.
                </div>
                <div style={{ marginBottom: 6 }}>
                  <strong>Ce que vous pouvez faire :</strong> si vous savez que l'agent·e a une adresse e-mail, <strong>retrouvez-le vous-même dans l'annuaire informatique et faites le lien</strong> :
                </div>
                <Gestes items={[
                  <>Sur la ligne de l'agent·e, cliquer sur <strong>« Lier l'AD »</strong>.</>,
                  <>Taper <strong>quelques lettres de son nom</strong> (2 minimum). Essayez une orthographe plus courte ou son prénom seul si rien ne sort.</>,
                  <>Dans les résultats (nom affiché + adresse e-mail), repérer <strong>la bonne personne</strong> : vérifier l'adresse.</>,
                  <>Cliquer sur <strong>« Lier »</strong>. L'adresse e-mail est rattachée à l'agent·e.</>,
                ]} />
                <Callout tone="ok" title="Ce que cela change">
                  L'agent·e peut désormais recevoir la convocation et le CREP vierge par e-mail
                  {f.prep && <>, et accéder à « Mon entretien »</>}
                  {f.esign && <>, et signer en ligne si la signature électronique lui est ouverte</>}.
                  Si vous aviez déjà planifié, modifiez le rendez-vous pour que l'invitation lui parte.
                </Callout>
                <Callout tone="warn" title="Attention à l'homonymie">
                  Ne liez que si vous êtes <strong>certain</strong> de la personne (même service, bonne adresse). Un mauvais lien enverrait les documents confidentiels de l'entretien à quelqu'un d'autre.
                </Callout>
                <div><strong>Si l'agent·e n'a vraiment pas d'adresse</strong> : ne liez rien. Vous le convoquez vous-même et il suit le circuit papier.</div>
              </Cas>
            </Section>

            <Section icon={<CalendarClock size={15} color={COLORS.primary} />} title="Étape 2 — Prendre rendez-vous (facultatif)">
              <Callout tone="info" title="Cette étape est facultative">
                Vous pouvez toujours fixer la date <strong>« à l'ancienne »</strong> (de vive voix, par téléphone, par courrier ou dans votre agenda) sans passer par l'outil.
                L'assistant de planification n'est qu'une <strong>aide</strong> : <strong>recherche de créneaux</strong> communs et <strong>envoi de la convocation par e-mail</strong> (invitation Outlook et CREP vierge).
              </Callout>
              <Gestes items={[
                <>Dans « EP que je réalise », repérer la ligne de l'agent·e.</>,
                <>Cliquer sur <strong>« Planifier »</strong> (ou « Modifier le RDV » si une date existe déjà).</>,
                <>Choisir la <strong>date et l'heure</strong>, la <strong>durée</strong> (2 heures par défaut ; seulement <strong>1 h, 1 h 30, 2 h ou 2 h 30</strong>) et le <strong>lieu</strong>.</>,
                <>Pour être aidé : cliquer sur <strong>« Prochains créneaux libres »</strong>. L'outil lit votre agenda et celui de l'agent·e, puis propose des créneaux communs. Cliquer sur un créneau.</>,
                <>Cliquer sur le bouton de validation. Un message vert confirme l'envoi.</>,
              ]} />
              <Cas code="Avec e-mail" title="L'agent·e a une adresse e-mail" color="#16a34a" icon={<Mail size={14} color="#16a34a" />}>
                <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>
                  <li>L'agent·e reçoit une <strong>invitation Outlook</strong> dans son agenda, comme vous.</li>
                  <li>L'agent·e reçoit un <strong>e-mail</strong> avec le <strong>CREP vierge en PDF</strong> en pièce jointe{f.prep && <>, et un bouton qui ouvre MagApp pour préparer son entretien</>}.</li>
                  <li>Vous recevez aussi un e-mail de confirmation du rendez-vous.</li>
                  {f.prep && <li>Si l'agent·e n'a toujours pas transmis sa préparation quand l'entretien approche, <strong>l'outil le relance tout seul</strong>.</li>}
                </ul>
              </Cas>
              <Cas code="Sans e-mail" title="L'agent·e n'a PAS d'adresse e-mail" color="#d97706" icon={<MailX size={14} color="#d97706" />}>
                <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>
                  <li><strong>Aucun e-mail ni invitation ne part à l'agent·e.</strong> Le rendez-vous est quand même enregistré, et il apparaît dans votre agenda.</li>
                  <li>C'est à <strong>vous de convoquer l'agent·e par un autre moyen</strong> (de vive voix, par téléphone ou par courrier) : date, heure, lieu. Cette convocation est <strong>obligatoire</strong>, l'outil ne peut pas la faire à votre place.</li>
                  <li>Remettez-lui le <strong>CREP vierge imprimé</strong> : icône imprimante de sa ligne (ou cocher plusieurs agent·e·s et imprimer en une fois).</li>
                  <li>Si vous savez que l'agent·e a en réalité une adresse e-mail, faites le lien avec « Lier l'AD » (étape 1).</li>
                </ul>
              </Cas>
              <Callout tone="info" title="Changer la date ou l'heure">
                Rouvrir « Modifier le RDV ». L'invitation Outlook et l'e-mail sont mis à jour : <strong>ne recréez jamais un EP</strong>. Un avertissement s'affiche si le rendez-vous est à moins de 8 jours.
              </Callout>
            </Section>

            {f.prep && (
              <Section icon={<FileSignature size={15} color={COLORS.primary} />} title={`Étape ${nPrep} — Avant l'entretien : la préparation de l'agent·e, avec l'accès à « Mon entretien »`}>
                <Cas code="En ligne" title="L'agent·e a un e-mail et l'accès à « Mon entretien »" color="#4f46e5">
                  Il remplit une fiche (bilan, difficultés, souhaits de formation, perspectives) <strong>dans MagApp</strong>. Vous la retrouvez dans « Faire l’EP ». Elle sert à <strong>nourrir l'échange</strong> : vous n'avez pas à la recopier.
                </Cas>
                <Cas code="Papier" title="L'agent·e n'a pas d'e-mail, ou préfère le papier" color="#64748b" icon={<Printer size={14} color="#64748b" />}>
                  Il prépare sur le <strong>CREP vierge papier</strong> et vous le remet (ou le garde pour l'entretien). Dans ce cas, il n'y a rien dans l'outil : c'est normal.
                </Cas>
                <Callout tone="ok">La préparation n'est <strong>pas obligatoire</strong> pour tenir l'entretien. Un·e agent·e qui n'a rien préparé peut être évalué normalement.</Callout>
              </Section>
            )}

            <Section icon={<PenLine size={15} color={COLORS.primary} />} title={`Étape ${nCrep} — Le CREP : avant, pendant et après l'entretien`}>
              {f.simple
                ? <div style={{ marginBottom: 8 }}>Deux façons de tenir le compte rendu. <strong>Dans les deux cas, le CREP est signé à la main sur papier par l'agent·e et par vous, puis envoyé à la DRH : vous n'avez rien à téléverser</strong> (mode simple).</div>
                : <div style={{ marginBottom: 8 }}>Deux façons de tenir le compte rendu. <strong>Dans les deux cas, le CREP est signé à la main sur papier, puis téléversé dans l'outil</strong>{f.esign && <> (sauf signature électronique, voir plus bas)</>}.</div>}

              <Cas code="Méthode 1" title="Je saisis dans l'outil" color="#16a34a">
                <Gestes items={[
                  <>Cliquer sur <strong>« Faire l’EP »</strong> sur la ligne de l'agent·e{f.prep && <> et lire sa préparation si elle existe</>}.</>,
                  <>Remplir le <strong>compte rendu</strong> : bilan, objectifs, compétences, formations, perspectives, <strong>appréciation générale</strong>. L'<strong>enregistrement est automatique</strong> (un message « enregistré à … » le confirme) : rien n'est envoyé. La grille d'appréciation se coche comme sur le papier : une ligne par critère, trois cases <strong>S / AS / I</strong>.</>,
                  <>{f.coherence ? <>Cliquer sur <strong>« Vérifier la cohérence »</strong> : l'outil liste les rubriques oubliées et les incohérences entre vos commentaires et la grille. Les corriger.</> : <>Cliquer sur <strong>« Vérifier la complétude »</strong> : l'outil liste les rubriques obligatoires oubliées (elles bloquent la validation) et signale les rubriques facultatives non renseignées. Les corriger.</>}</>,
                  <>{f.simple ? <>Cliquer sur <strong>« Valider la partie évaluateur »</strong>, puis sur <strong>« Imprimer / PDF »</strong></> : <>Cliquer sur <strong>« Imprimer / PDF »</strong></>} : le CREP sort sur 4 pages, <strong>à faire signer</strong> (un <strong>QR code</strong> en haut à gauche de chaque page sert à le reconnaître : ne le masquez pas).</>,
                  <>Remettre le CREP à l'agent·e : il <strong>renseigne les 2 cadres qui le concernent</strong> et <strong>signe à la main</strong>. Quand il vous le rend, <strong>vous le contresignez</strong>.</>,
                  ...(f.simple ? [<>Envoyer le CREP signé à la DRH, puis cliquer sur <strong>« J'ai envoyé le CREP à la DRH »</strong>. <strong>Rien à téléverser.</strong></>] : [<><strong>Numériser</strong> les pages signées et les <strong>téléverser dans l'outil</strong> (voir « Téléverser le CREP signé »).</>]),
                  ...(f.simple ? [] : [<>Vérifier le contenu puis cliquer sur <strong>« Valider le compte rendu »</strong>.</>]),
                ]} />
              </Cas>

              <Cas code="Méthode 2" title="Je préfère écrire à la main" color="#d97706" icon={<PenLine size={14} color="#d97706" />}>
                <Gestes items={[
                  <>Avant l'entretien : <strong>imprimer le CREP vierge</strong> (icône imprimante de la ligne de l'agent·e, ou <strong>« Imprimer ses N CREP »</strong> sur la ligne d'un·e évaluateur·rice pour tous ses agent·e·s d'un coup).</>,
                  <>Pendant l'entretien : écrire à la main, comme avant.</>,
                  <>Remettre le CREP à l'agent·e : il <strong>renseigne les 2 cadres qui le concernent</strong> et <strong>signe à la main</strong>. Quand il vous le rend, <strong>vous le contresignez</strong>.</>,
                  ...(f.simple ? [<>Envoyer le CREP signé à la DRH, puis cliquer sur <strong>« J'ai envoyé le CREP à la DRH »</strong>. <strong>Rien à téléverser.</strong></>] : [<><strong>Numériser</strong> les pages signées et les <strong>téléverser dans l'outil</strong> (voir « Téléverser le CREP signé »).</>]),
                  ...(f.simple ? [] : [<>Vérifier le contenu lu sur le papier puis cliquer sur <strong>« Valider le compte rendu »</strong>.</>]),
                ]} />
              </Cas>

              {f.offlineForm && (
                <Cas code="Méthode 3" title={f.simple ? 'Je remplis un PDF sans connexion (1 import)' : 'Je remplis un PDF sans connexion (2 téléversements)'} color="#7c3aed" icon={<FileDown size={14} color="#7c3aed" />}>
                  <Gestes items={[
                    <>Choisir le mode <strong>« PDF formulaire hors ligne »</strong> à l'ouverture du CREP, puis <strong>« Télécharger le PDF formulaire »</strong> : le PDF est au modèle de l'agent·e (grille, rubriques) et prérempli avec ce qui est déjà saisi.</>,
                    <>Pendant l'entretien, <strong>sans connexion</strong> : l'ouvrir avec <strong>Adobe Acrobat Reader</strong> (PC) ou une application PDF de tablette, remplir les champs et <strong>enregistrer</strong>. L'aperçu d'un navigateur n'enregistre pas toujours les champs.</>,
                    <><strong>1er téléversement</strong> : de retour en ligne, cliquer sur <strong>« Importer le PDF rempli »</strong>. Le contenu remplace la saisie ; un formulaire généré pour un autre entretien, ou un document scanné, est refusé. Relire, puis <strong>« Valider la partie évaluateur »</strong>.</>,
                    <><strong>Imprimer</strong> le CREP. Les 2 cadres de l'agent·e sont vides : il les <strong>écrit à la main</strong> et <strong>signe</strong> ; vous contresignez.</>,
                    ...(f.simple
                      ? [<>Envoyer le CREP signé à la DRH, puis cliquer sur <strong>« J'ai envoyé le CREP à la DRH »</strong> : <strong>rien d'autre à téléverser</strong>.</>]
                      : [<><strong>2ᵉ téléversement</strong> : <strong>numériser</strong> le CREP signé et le téléverser à l'étape « Téléverser le CREP signé ». Seuls les <strong>2 cadres de l'agent·e</strong> et les <strong>2 signatures</strong> sont repris ; le reste du compte rendu n'est pas modifié.</>,
                        <>Vérifier puis <strong>« Clôturer l'entretien »</strong>. <strong>L'original signé part à la DRH.</strong></>]),
                  ]} />
                </Cas>
              )}

              {f.simple ? (<>
              <Callout tone="ok" title="Mode simple : vous n'avez rien à téléverser">
                Une fois le CREP <strong>signé par l'agent·e et par vous</strong> (sur papier), <strong>envoyez l'original à la DRH</strong>, puis cliquez sur <strong>« J'ai envoyé le CREP à la DRH »</strong> à la dernière étape du fil d'Ariane. L'entretien affiche alors <strong>« Envoyé à la DRH »</strong> ; si vous vous êtes trompé, <strong>« Annuler »</strong> est possible tant que le CREP n'est pas reçu. Aucun e-mail n'est envoyé à ce moment-là.
              </Callout>
              <Gestes items={[
                <>Le <strong>QR code</strong> imprimé en haut à gauche de chaque page permet de rattacher le CREP au bon agent à la réception : <strong>ne le masquez pas</strong> (une photocopie est possible).</>,
                <>À réception du CREP papier signé, <strong>la DRH vous notifie</strong> (l'agent·e aussi) par e-mail et l'entretien est clôturé : le CREP est consultable dans le dossier de l'agent·e.</>,
                <>En mode simple, le bouton « Demander la réouverture » n'existe pas : en cas d'erreur, <strong>contactez un administrateur du module</strong>.</>,
              ]} />
              </>) : (<>
              <Callout tone="warn" title="Téléverser le CREP signé : dans tous les cas où il y a du papier">
                Que le CREP ait été <strong>écrit à la main</strong> ou <strong>saisi dans l'outil puis imprimé</strong>, la signature est manuscrite : le document signé doit être <strong>numérisé</strong> (scan ou photos des pages) et <strong>téléversé dans l'outil</strong>. <strong>L'original signé part à la DRH.</strong> Le document numérique conservé dans l'outil est « non contractuel » : seul l'original signé fait foi.
              </Callout>

              {f.scanReading ? (<>
              <div style={{ fontWeight: 800, color: COLORS.text, margin: '10px 0 6px' }}>Téléverser le CREP signé</div>
              <Gestes items={[
                <>Ouvrir l'EP (« Faire l’EP »). À l'étape « Téléverser », le <strong>grand bouton de téléversement</strong> se trouve <strong>dans le cadre du fil d'Ariane</strong>, en haut : cliquer dessus et choisir <strong>toutes les pages d'un coup</strong> (photos JPG/PNG prises au téléphone, ou PDF ; 8 pages au maximum, 25 Mo par fichier). Pour archiver le document signé, le bouton <strong>« CREP manuscrit (4 pages scannées) »</strong> est aussi disponible une fois le compte rendu validé.</>,
                <>Les textes manuscrits et <strong>les cases cochées de la grille d'appréciation</strong> sont lus et rangés dans les bonnes rubriques. La lecture prend quelques minutes (environ 30 secondes par page) et se fait <strong>en tâche de fond</strong> : un bandeau « Lecture des textes en cours » s'affiche, vous pouvez fermer la fenêtre, et vous recevez un <strong>e-mail</strong> quand c'est prêt. Revenez alors sur l'entretien et cliquez sur <strong>« Voir la proposition »</strong>.</>,
                <><strong>Relisez et corrigez la proposition, rubrique par rubrique, dans l'ordre des pages du CREP.</strong> Les lectures incertaines et les corrections automatiques sont signalées. Cochez « J'ai vérifié chaque ligne par rapport au document papier », puis « Appliquer au formulaire ». Rien n'est enregistré tant que vous n'avez pas validé.</>,
              ]} />
              <div style={{ marginTop: 6, color: '#64748b' }}>Pour un meilleur résultat : une photo par page, à plat, bien éclairée, la page entière visible, écriture lisible. Le sens de la photo (page couchée ou à l'envers) n'est pas un problème.</div>
              <div style={{ marginTop: 6 }}><strong>Si le CREP avait été saisi dans l'outil</strong> avant d'être imprimé et signé, seuls <strong>les 2 commentaires manuscrits de l'agent·e</strong> (page 4) sont lus : le reste du compte rendu n'est ni relu ni modifié.</div>
              <div style={{ marginTop: 6 }}><strong>Ce qui est conservé :</strong> la <strong>version scannée</strong> (vos photos assemblées en un PDF, consultable via « CREP papier ») et la <strong>version numérique</strong> (« Imprimer / PDF »), qui porte le filigrane <strong>« DOCUMENT NON CONTRACTUEL »</strong> et la mention <strong>« Document original manuscrit signé »</strong> à la place des signatures.</div>
              <div style={{ marginTop: 6 }}><strong>Si le papier n'est pas le formulaire de cet·te agent·e</strong> (par exemple un CREP d'une autre catégorie), l'outil le signale : les cases ne sont reprises que lorsqu'elles correspondent clairement à un critère du modèle de l'agent·e, et chacune est à vérifier.</div>

              </>) : (<>
              <div style={{ fontWeight: 800, color: COLORS.text, margin: '10px 0 6px' }}>Téléverser le CREP signé</div>
              <Gestes items={[
                <>À l'étape « Téléverser », cliquer sur le <strong>grand bouton « Téléverser le CREP signé »</strong> (dans le cadre du fil d'Ariane) et choisir <strong>toutes les pages d'un coup</strong> (photos JPG/PNG prises au téléphone, ou PDF ; 8 pages au maximum, 25 Mo par fichier).</>,
                <>Cliquer sur <strong>« Consulter le document »</strong> : il s'ouvre aussitôt dans une visionneuse, sans rien télécharger.</>,
                <>Cocher que le document porte la <strong>signature de l'agent·e</strong> et <strong>la vôtre</strong>, puis cliquer sur <strong>« Valider le document »</strong>.</>,
                <>Cliquer sur <strong>« Clôturer l'entretien »</strong> (ou « Revenir à l'étape précédente »). <strong>Aucune lecture du contenu ne vous est proposée</strong> : vous n'avez pas d'étape de vérification en plus.</>,
              ]} />
              <div style={{ marginTop: 6, color: '#64748b' }}>Pour un meilleur résultat : une photo par page, à plat, bien éclairée, la page entière visible. <strong>L'original signé part à la DRH.</strong></div>

              </>)}

              </>)}
              {f.simple ? (
              <Callout tone="ok" title="Après la clôture : consultation">
                À réception du <strong>CREP papier signé</strong>, la DRH vous notifie et l'entretien est <strong>clôturé</strong> : tous les champs passent en <strong>lecture seule</strong>. Dans la liste « EP que je réalise », un EP clôturé n'a plus ni impression ni changement d'évaluateur : vous retrouvez <strong>« CREP papier »</strong> (le document scanné) et <strong>« CREP saisi »</strong> (si vous aviez saisi dans l'outil). Une fois le CREP reçu par la DRH, « Ouvrir » disparaît et la fenêtre de l'entretien indique la date de réception. Les documents restent consultables jusqu'à la clôture de la campagne ; ensuite, le CREP est dans le <strong>dossier de l'agent·e</strong>. <strong>Pas de demande de réouverture en mode simple</strong> : en cas d'erreur, contactez un administrateur.
              </Callout>
              ) : (
              <Callout tone="ok" title="Après la clôture : lecture seule, original à la DRH, consultation">
                Dès que le CREP est <strong>validé</strong>, tous les champs passent en <strong>lecture seule</strong> et les boutons de saisie disparaissent. L'outil rappelle que <strong>l'original signé doit être transmis à la DRH</strong>.
                Vous pouvez <strong>consulter les documents</strong> (scan du CREP signé, PDF) <strong>jusqu'à la clôture de la campagne</strong> ; une fois la campagne close, le CREP est consultable dans le <strong>dossier de l'agent·e</strong>.
                Dans la fenêtre d'un entretien clôturé, vous ne pouvez plus qu'<strong>afficher le CREP papier</strong>, <strong>afficher la version numérique</strong> et <strong>demander la réouverture</strong>.
                La demande de réouverture doit être <strong>justifiée</strong> : elle prévient les administrateurs par e-mail, qui l'acceptent (l'entretien redevient modifiable) ou la refusent, et vous répondent par e-mail. Dans la liste, sur un EP clôturé, il n'y a plus ni impression ni changement d'évaluateur : <strong>« CREP papier »</strong> (le document scanné) et <strong>« CREP saisi »</strong> (si vous aviez saisi dans l'outil) suffisent ; « Ouvrir » disparaît dès que la DRH a reçu le CREP, et la fenêtre de l'entretien indique la date de réception.
              </Callout>

              )}
              <Callout tone="warn" title="Valider : une étape obligatoire">
                Cliquez sur <strong>« Valider le compte rendu »</strong> après avoir tout vérifié (toutes les rubriques obligatoires doivent être remplies ; la rubrique « Mobilité » est facultative). L'EP passe à « Réalisé ». Tant que le compte rendu n'est pas validé, l'EP n'est pas « Réalisé » et il apparaît « en retard » dans les statistiques de la Direction.{f.simple && <> Si vous tenez le CREP uniquement sur papier, cette validation n'est pas nécessaire : « J'ai envoyé le CREP à la DRH » marque l'EP comme réalisé.</>}
              </Callout>

              {f.esign && (
                <Cas code="Signature électronique" title="Variante : l'agent·e et vous avez une adresse e-mail et la signature électronique est ouverte pour lui" color="#16a34a" icon={<Send size={14} color="#16a34a" />}>
                  <Gestes items={[
                    <>Saisir le compte rendu dans l'outil, le vérifier et le valider.</>,
                    <>Cliquer sur <strong>« Envoyer à l'agent·e »</strong>.</>,
                    <>L'agent·e reçoit un e-mail : il <strong>relit</strong>, remplit <strong>ses deux cases</strong> (« Néant » si rien) puis clique sur <strong>« Valider et envoyer pour signature »</strong>.</>,
                    <>Le document part au <strong>parapheur</strong> : vous recevez, comme l'agent·e, un lien de signature par e-mail. Cliquez, signez.</>,
                    <>Quand les deux signatures sont faites, le PDF signé est <strong>archivé automatiquement</strong> (bouton « CREP papier »). Il n'y a ni impression ni téléversement.</>,
                  ]} />
                  <Callout tone="info" title="Envoyé trop vite ?">
                    Tant que l'agent·e n'a pas validé, cliquez sur <strong>« Rappeler le compte rendu »</strong> : il revient chez vous, vous corrigez, puis vous le renvoyez. L'outil envoie aussi des <strong>rappels automatiques</strong> à l'agent·e qui tarde.
                  </Callout>
                  <Callout tone="warn" title="Blocages normaux à connaître">
                    <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>
                      <li>« Envoyé à l'agent·e » : impossible de téléverser un papier tant que vous n'avez pas <strong>rappelé</strong> le compte rendu.</li>
                      <li>« En signature » : il faut attendre la fin du parapheur (ou son annulation/refus) pour passer en papier.</li>
                      <li>Si le bouton « Envoyer à l'agent·e » n'apparaît pas pour un·e agent·e : la signature électronique n'est pas ouverte pour lui, ou il n'a pas d'e-mail. Ce n'est pas une panne : utilisez le circuit papier.</li>
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

            <Section icon={<Users size={15} color={COLORS.primary} />} title="Cas particulier — vous êtes le N+1 d'un·e évaluateur·rice qui n'a pas d'e-mail">
              <div style={{ marginBottom: 8 }}>
                Certains évaluateur·rice·s n'ont <strong>pas d'adresse e-mail</strong> : ils ne se connectent pas à MagApp. <strong>Leur N+1 (l’évaluateur·rice placé au-dessus d'eux) fait le travail à leur place</strong>, pour les agent·e·s qu'ils évaluent.
              </div>
              <Gestes items={[
                <>Ouvrir l'onglet <strong>« EP de mon équipe »</strong> et cliquer sur <strong>« Tout déplier »</strong>.</>,
                <>Repérer l’évaluateur·rice marqué <strong>« Évaluateur·rice sans e-mail : vous gérez ses EP »</strong>. Ses agent·e·s portent la mention « Sans e-mail · géré par son N+1 ».</>,
                <>Sur la ligne d'un·e agent·e, vous avez les boutons <strong>« Planifier »</strong> et <strong>« Faire l’EP »</strong>, exactement comme pour vos propres agent·e·s.</>,
                f.simple ? <>Après l'entretien (mené par l’évaluateur·rice, sur le CREP papier signé), <strong>envoyez l'original à la DRH</strong> puis cliquez sur <strong>« J'ai envoyé le CREP à la DRH »</strong> : rien à téléverser.</> : <>Après l'entretien (mené par l’évaluateur·rice, sur le CREP papier signé), <strong>téléversez le compte rendu papier</strong> (scan ou photos), vérifiez-le, puis <strong>« Valider le compte rendu »</strong>.</>,
              ]} />
              <Callout tone="info" title="Toujours le circuit papier">
                Sans e-mail de l’évaluateur·rice, il n'y a ni invitation Outlook pour lui{f.esign && <>, ni signature électronique</>} : c'est normal. Chaque action est tracée à <strong>votre</strong> nom dans le Journal.
              </Callout>
              <Callout tone="warn" title="Pas de relance automatique pour ces EP">
                Les e-mails de rappel partent aux évaluateur·rice·s qui ont une adresse. Pour les EP gérés par délégation, <strong>c'est vous qui les suivez</strong> : la colonne « Compte rendu » de « EP de mon équipe » vous dit où ils en sont.
              </Callout>
            </Section>

            <Section icon={<History size={15} color={COLORS.primary} />} title="Les statuts : que veulent-ils dire ?">
              <StatusSchema f={f} />
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>À planifier</strong> : aucune date fixée. Action : fixer la date (avec l'assistant ou « à l'ancienne »).</div>
                <div><strong>Planifié</strong> : date fixée. Action : mener l'entretien, puis traiter le compte rendu.</div>
                <div><strong>Réalisé</strong> : compte rendu validé. Action : suivre le circuit de signature{f.esign ? ' (envoi à l\'agent·e ou papier)' : ''}.</div>
                {f.esign && <div><strong>Envoyé à l'agent·e</strong> : l'agent·e doit relire et valider. Action : attendre (ou rappeler).</div>}
                {f.esign && <div><strong>En signature</strong> : le parapheur attend les signatures. Action : signer de votre côté.</div>}
                {f.simple && <div><strong>Envoyé à la DRH</strong> : vous avez signalé l'envoi du CREP signé. Action : aucune ; la DRH vous notifie à réception et l'entretien est clôturé.</div>}
                <div><strong>Signé / Signé papier</strong> : terminé et archivé. Aucune action.</div>
                <div><strong>Reçu DRH</strong> (pastille turquoise) : un administrateur a déclaré avoir reçu l'original signé. Plus rien à transmettre.</div>
              </div>
              <div style={{ fontWeight: 800, color: COLORS.text, margin: '10px 0 4px' }}>La colonne « Compte rendu » de la liste</div>
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>Validé</strong> + <span style={{ background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '0 6px', fontWeight: 800 }}>À imprimer et signer</span> : circuit papier.</div>
                {f.esign && <div><strong>Validé</strong> + <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 6, padding: '0 6px', fontWeight: 800 }}>À envoyer</span> : à vous d'envoyer à l'agent·e (circuit électronique) ou d'imprimer.</div>}
                {f.esign && <div><strong>Validé</strong> + <span style={{ background: '#f3e8ff', color: '#6b21a8', borderRadius: 6, padding: '0 6px', fontWeight: 800 }}>Chez l'agent·e</span> : l'agent·e doit relire et valider. Vous pouvez rappeler tant qu'il n'a pas validé.</div>}
                {f.esign && <div><strong>Validé</strong> + <span style={{ background: '#ffedd5', color: '#9a3412', borderRadius: 6, padding: '0 6px', fontWeight: 800 }}>En signature</span> : le parapheur attend les signatures.</div>}
                {f.esign && <div><strong>Validé</strong> + <span style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '0 6px', fontWeight: 800 }}>Signature refusée / annulée</span> : reprendre en renvoyant, ou passer au papier.</div>}
                {f.simple && <div><strong>Envoyé à la DRH</strong> : vous avez signalé l'envoi du CREP signé ; la DRH vous notifie à réception.</div>}
                <div><strong>Validé</strong> + <span style={{ background: '#d1fae5', color: '#065f46', borderRadius: 6, padding: '0 6px', fontWeight: 800 }}>Signé (papier){f.esign ? ' / Signé' : ''}</span> : terminé.</div>
              </div>
            </Section>

            <Section icon={<CheckCircle2 size={15} color={COLORS.primary} />} title="Suivre l'avancement : les compteurs sont des filtres">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Les compteurs du haut de la liste (<strong>Planifiés, À venir sous 7 jours, Réalisés, En retard, À transmettre à la DRH, Reçus par la DRH</strong>) sont <strong>cliquables</strong> : un clic filtre la liste, un second clic retire le filtre. Le compteur actif est entouré.</div>
                <div><strong>À transmettre à la DRH</strong> : vos entretiens <strong>clôturés</strong> dont l'original signé n'a pas encore été déclaré reçu. <strong>Reçus par la DRH</strong> : ceux dont un administrateur a confirmé la réception.</div>
                <div>Le bouton <strong>« À faire / Tous »</strong> s'ouvre sur <strong>« Tous »</strong>.</div>
              </div>
            </Section>

            <Section icon={<CheckCircle2 size={15} color={COLORS.primary} />} title="Vos gestes, dans l'ordre">
              <div style={{ display: 'grid', gap: 3 }}>
                {[
                  <>Ouvrir MagApp → « Entretiens professionnels » → « EP que je réalise », et vérifier mes agent·e·s.</>,
                  <>Prendre rendez-vous (avec l'assistant, ou « à l'ancienne »). Si l'agent·e n'a pas d'e-mail : le convoquer moi-même.</>,
                  ...(f.prep ? [<>L'agent prépare son entretien dans « Mon entretien » (facultatif).</>] : []),
                  <>Préparer le CREP : imprimer le CREP vierge si je veux le remplir à la main.</>,
                  <>Mener l'entretien.</>,
                  ...(f.offlineForm ? [<>Mode PDF hors ligne : après l'entretien, importer le PDF rempli (1er téléversement) puis valider ma partie.</>] : []),
                  <>Si j'ai saisi dans l'outil : « Imprimer / PDF ».</>,
                  <>Transmettre le CREP à l'agent·e : il remplit ses 2 cadres et signe à la main.</>,
                  <>Contresigner.</>,
                  ...(f.simple
                    ? [<>Envoyer le CREP signé à la DRH, puis cliquer sur « J'ai envoyé le CREP à la DRH » (rien à téléverser).</>,
                       <>À réception du CREP papier signé, la DRH me notifie (l'agent·e aussi) et l'entretien est clôturé.</>]
                    : [
                  <>Numériser et téléverser le CREP signé{f.offlineForm ? ' (2ᵉ téléversement en mode PDF hors ligne)' : ''} ; l'original part à la DRH.</>,
                  ...(f.scanReading
                    ? [<>Vérifier ce que l'outil a lu (2 cadres de l'agent, ou tout le CREP en mode manuscrit) et confirmer les 2 signatures.</>]
                    : [<>Consulter le document téléversé et confirmer les 2 signatures.</>]),
                  <>Cliquer sur « Clôturer l'entretien », puis transmettre l'original à la DRH.</>,
                    ]),
                ].map((it, i) => <div key={i}>{i + 1}. {it}</div>)}
              </div>
            </Section>

            <Section icon={<Lightbulb size={15} color="#d97706" />} title="L'ampoule : une question, une idée, un bug">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Le bouton <strong>ampoule</strong> (en haut à droite, à côté de « Aide ») permet de déposer une demande en quelques lignes : <strong>« J'ai une question »</strong>, <strong>« Je propose une amélioration »</strong> ou <strong>« Il y a un bug »</strong>. Donnez un titre, décrivez la situation (pour un bug : l'agent·e concerné·e et ce que vous avez fait) et, si besoin, <strong>joignez un fichier</strong> (capture d'écran, PDF, Word, Excel… : 5 fichiers au plus, 10 Mo chacun).</div>
                <div><strong>« Mes demandes »</strong> montre l'état de chacune (en attente, acceptée, refusée, réalisée, répondue) et la réponse des administrateur·rice·s. Vous êtes <strong>prévenu·e par e-mail</strong> à chaque étape.</div>
                <div><strong>« Celles des autres »</strong> liste les demandes de tous les utilisateur·rice·s du module : vous pouvez les lire, les <strong>commenter</strong> et joindre un fichier à votre commentaire. Une question déjà posée a peut-être déjà sa réponse.</div>
              </div>
            </Section>

            <Section icon={<AlertTriangle size={15} color={COLORS.primary} />} title="Si quelque chose ne va pas">
              <div style={{ display: 'grid', gap: 6 }}>
                <div><strong>L'agent·e n'apparaît pas.</strong> Il n'est pas rattaché à vous : utilisez « Ajouter un·e agent·e » ou « Changer l'évaluateur » (étape 1). Si l'agent·e reste introuvable, prévenir l'administrateur.</div>
                <div><strong>L'agent·e dit n'avoir rien reçu.</strong> Vérifier son adresse e-mail. Si elle est vide, vous devez le convoquer vous-même (étape 2). Vérifier aussi ses courriers indésirables.</div>
                <div><strong>Je me suis trompé de date.</strong> « Modifier le RDV ». Ne pas recréer un EP.</div>
                {f.esign && <div><strong>Je n'ai pas le bouton « Envoyer à l'agent·e ».</strong> L'agent·e ou vous n'avez pas d'e-mail, ou la signature électronique n'est pas ouverte pour lui, ou le compte rendu n'est pas encore validé. Utiliser le circuit papier.</div>}
                <div><strong>« Valider le compte rendu » est refusé.</strong> Il manque des rubriques : la liste s'affiche en orange. Les remplir.</div>
                {f.esign && <div><strong>J'ai envoyé à l'agent·e par erreur.</strong> « Rappeler le compte rendu », tant que l'agent·e n'a pas validé.</div>}
                <div><strong>J'ai validé trop vite ou sur le mauvais agent·e.</strong> Ne rien modifier ailleurs et prévenir l'administrateur du module.</div>
                <div><strong>Le CREP papier est perdu {f.simple ? 'avant son envoi à la DRH' : 'avant la numérisation'}.</strong> Réimprimer le CREP rempli depuis l'EP, refaire signer, puis {f.simple ? 'l\'envoyer à la DRH' : 'numériser'}.</div>
                {!f.simple && <div><strong>La lecture du papier est mauvaise ou incomplète.</strong> Refaire les photos (une par page, à plat, bien éclairées) ou recopier les rubriques à la main dans l'outil. Vous restez maître du contenu validé.</div>}
                <div><strong>Je ne vois pas « Faire l’EP ».</strong> Vérifier que vous êtes sur « EP que je réalise ». Si l'EP est déjà réalisé, le bouton devient « Ouvrir » ; il disparaît quand la DRH a reçu le CREP (restent « CREP papier » et « CREP saisi »).</div>
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
                <div><strong>Évaluateur·rice / évaluateur</strong> : la personne qui conduit l'entretien (vous). Les deux mots désignent la même chose dans l'outil.</div>
                <div><strong>MagApp</strong> : le « magasin d'applications » de la Ville, où se trouve la tuile « Entretiens professionnels ».</div>
                {f.esign && <div><strong>Parapheur</strong> : l'outil de signature électronique. Chaque signataire reçoit un lien par e-mail.</div>}
                <div><strong>AD</strong> : Active Directory, l'annuaire des comptes et des e-mails.</div>
              </div>
            </Section>
          </>
        ) : (
          <>
            <Callout tone="info" title="Votre rôle : préparer le cadre, pas saisir les EP">
              Vous désignez les évaluateur·rice·s, vous ouvrez la campagne, vous vérifiez la base agent·e·s et vous surveillez l'avancement.
              Vous n'avez pas à remplir les CREP à la place des évaluateur·rice·s.
            </Callout>

            <Section icon={<ShieldCheck size={15} color={COLORS.primary} />} title="Désigner un·e évaluateur·rice, pas à pas">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>1.</strong> Ouvrir « Paramétrage » puis la zone de désignation des évaluateur·rice·s.</div>
                <div><strong>2.</strong> Rechercher la personne dans l'Active Directory (nom, prénom, identifiant).</div>
                <div><strong>3.</strong> L'outil cherche son matricule RH. Si le lien échoue, rechercher l'agent·e dans la base RH et le sélectionner.</div>
                <div><strong>4.</strong> Choisir le niveau : directeur, DGA, DG ou sous-évaluateur·rice.</div>
                <div><strong>5.</strong> Pour un DGA/DG, cocher les directions couvertes.</div>
                <div><strong>6.</strong> Valider. L’évaluateur·rice apparaît alors dans la liste et peut choisir ses agent·e·s.</div>
              </div>
              <Callout tone="warn" title="Un·e agent·e = un seul évaluateur·rice">
                C'est la règle qui garantit la clarté. Si un·e agent·e change de service, commencer par le retirer de l'ancien évaluateur·rice, puis le rattacher au nouveau.
              </Callout>
            </Section>

            <Section icon={<Users size={15} color={COLORS.primary} />} title="Campagne et base des agent·e·s">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Créer la campagne de l'année : dates d'ouverture, de clôture et date limite des EP.</div>
                <div>Importer le classeur « Outil CREP DSI » : onglet <strong>Base_agents</strong> pour les agent·e·s, onglets <strong>Template_*</strong> pour les modèles.</div>
                <div>Vérifier le rapprochement AD : e-mail par matricule, puis par nom/prénom.</div>
                <div><strong>Surveiller les agent·e·s sans e-mail</strong> (filtre « statut e-mail ») : ils recevront ni invitation ni circuit électronique, leur évaluateur·rice suivra le circuit papier. Si l'agent·e a un compte AD, le rattacher avec « Lier l'AD ».</div>
                <div>En cas de doublon d'adresse e-mail : ouvrir <strong>« Changer (AD) »</strong>, cliquer <strong>« Enlever l'adresse e-mail »</strong>, puis rattacher le bon compte.</div>
                <div>Les filtres permettent de cibler par catégorie, direction, service, grade, modèle, statut e-mail ou évaluateur·rice.</div>
              </div>
            </Section>

            <Section icon={<Mail size={15} color={COLORS.primary} />} title="Ce que le module envoie tout seul (e-mails)">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>À l’évaluateur·rice :</strong> « entretien à planifier » à sa désignation ; confirmation de rendez-vous ; récapitulatif de relance (EP à planifier, à finaliser, à envoyer).</div>
                <div><strong>À l'agent·e (s'il a une adresse) :</strong> « Préparez votre entretien » avec le CREP vierge en pièce jointe ; relance de préparation ; « Votre compte rendu est disponible » ; relance de validation ; avis de rappel si l’évaluateur·rice reprend son compte rendu.</div>
                <div><strong>Du parapheur</strong> (si la signature électronique est activée) : liens de signature à l'agent·e et à l’évaluateur·rice, puis résultat.</div>
                <div><strong>À l'agent·e et à son évaluateur·rice :</strong> « CREP reçu et vérifié » (remerciements) quand le CREP signé est validé dans « Suivi des retours » ; l'entretien est alors clôturé.</div>
              </div>
              <Callout tone="warn" title="Mode BETA : qui reçoit vraiment les mails ?">
                Tant que la fonctionnalité n'est pas <strong>publiée</strong> (réglage dans /admin/magapp), <strong>aucun mail ni invitation ne part aux agent·e·s de la Ville, sauf ceux inscrits à la BETA « Entretiens professionnels »</strong>.
                C'est volontaire : cela permet de tester sans prévenir les vrais agent·e·s. Si un·e agent·e « ne reçoit rien », vérifiez d'abord ce réglage.
              </Callout>
            </Section>

            <Section icon={<Sparkles size={15} color={COLORS.primary} />} title={<>Fonctions activables<Activable /></>}>
              <div style={{ marginBottom: 8 }}>
                Ces fonctions sont <strong>désactivées par défaut</strong> : elles s'ouvrent dans <strong>Paramétrage → Options</strong>, pour tous les agent·e·s ou évaluateur·rice·s, ou pour une sélection de personnes.
                <strong> Tant qu'une fonction n'est pas activée, l'aide des évaluateur·rice·s n'en parle pas</strong> : elle apparaît dans leur aide dès qu'elle est activée pour eux.
              </div>
              <Cas code="Lecture des entretiens numérisés" title={<>Lecture des entretiens numérisés<Activable /></>} color="#0f766e" icon={<ScanLine size={14} color="#0f766e" />}>
                <strong>Si la lecture est activée</strong> : après le téléversement du CREP signé, le contenu et les cases cochées sont lus et proposés à l’évaluateur·rice, qui les relit, les corrige et valide.
                <br /><strong>Si elle est désactivée (par défaut)</strong> : l’évaluateur·rice consulte le document téléversé dans une visionneuse, confirme les 2 signatures, le valide puis clôture, sans qu'on lui parle de lecture. Le document est quand même lu en arrière-plan : la <strong>version numérique est visible des seuls administrateurs</strong>, avec une pastille « Lue en arrière-plan » et un filtre dans le Pilotage pour les sélectionner ou les écarter. Pour un CREP saisi dans l'outil, cette version se limite aux <strong>« éléments relevés »</strong> : les 2 observations de l'agent·e et la présence des 2 signatures, avec un avertissement (lecture automatique, erreurs possibles). Le reste du CREP est celui de l'outil : il n'y a rien d'autre à contrôler.
              </Cas>
              <Cas code="Signature électronique" title={<>Signature par parapheur électronique<Activable /></>} color="#16a34a" icon={<Send size={14} color="#16a34a" />}>
                <strong>Si la signature électronique est activée</strong> pour un·e agent·e (et qu'il a une adresse e-mail, comme son évaluateur·rice) : l’évaluateur·rice dispose du bouton « Envoyer à l'agent·e » ; l'agent·e relit le CREP, remplit ses 2 cadres, valide, puis l'agent·e et l’évaluateur·rice signent par lien e-mail dans le parapheur ; le PDF signé est archivé automatiquement. Il n'y a ni impression, ni signature manuscrite, ni téléversement.
                <br /><strong>Si elle n'est pas activée</strong> : le circuit est papier pour tous (impression, signature manuscrite, numérisation, téléversement). Les boutons et statuts du parapheur n'apparaissent pas.
              </Cas>
              <Cas code="Préparation de l'agent·e" title={<>Préparation de l'entretien par l'agent·e, dans « Mon entretien »<Activable /></>} color="#4f46e5" icon={<FileSignature size={14} color="#4f46e5" />}>
                <strong>Si la préparation par l'agent·e est activée</strong> : l'agent·e (avec une adresse e-mail) voit l'onglet « Mon entretien », prépare sa fiche en ligne et la transmet ; son évaluateur·rice la retrouve dans l'EP avant l'entretien (vue N+1) ; l'agent·e est relancé automatiquement s'il ne l'a pas transmise. Le mail de convocation contient alors un bouton vers MagApp.
                <br /><strong>Sinon</strong> : l'agent·e prépare sur le CREP vierge papier, l'onglet « Mon entretien » n'existe pas et rien n'est relancé.
              </Cas>
              <Cas code="Aide à la rédaction" title={<>Aide à la rédaction par l'IA<Activable /></>} color="#7c3aed" icon={<Sparkles size={14} color="#7c3aed" />}>
                <strong>Si l'aide à la rédaction est activée</strong> pour un·e évaluateur·rice : le bouton « Rédiger avec l'IA » apparaît dans le compte rendu ; il propose un texte à partir des notes de l’évaluateur·rice, qui doit le relire et le corriger.
                <br /><strong>Sinon</strong> : le bouton n'existe pas, l’évaluateur·rice rédige seul.
              </Cas>
              <Cas code="Relecture de cohérence" title={<>Relecture de cohérence par l'IA<Activable /></>} color="#7c3aed" icon={<Sparkles size={14} color="#7c3aed" />}>
                <strong>Si la relecture est activée</strong> pour un·e évaluateur·rice : en plus des contrôles automatiques (rubriques oubliées), « Vérifier la cohérence » signale les incohérences entre rubriques (appréciation générale contredisant la grille, par exemple). Elle ne s'exécute que si l'<strong>Analyse de cohérence</strong> est cochée pour la campagne ; sinon le bouton est « Vérifier la complétude », sans IA.
                <br /><strong>Sinon</strong> : seuls les contrôles automatiques sont faits.
              </Cas>
              <Cas code="Mode simulation" title={<>Mode simulation<Activable /></>} color="#d97706" icon={<FlaskConical size={14} color="#d97706" />}>
                <strong>Si le mode simulation est activé</strong> : on peut tester le parcours sans polluer les données réelles ; aucun mail ne part aux agent·e·s hors BETA et des demandes de formation fictives apparaissent. Les évaluateur·rice·s, « qui valide qui » et le lien Active Directory restent réels.
                <br /><strong>Sinon</strong> : l'application fonctionne sur les données réelles, sans demandes fictives.
              </Cas>
              <Cas code="Publication" title={<>Publication de la fonctionnalité (mode BETA)<Activable /></>} color="#64748b" icon={<Mail size={14} color="#64748b" />}>
                <strong>Tant qu'elle n'est pas publiée</strong> (réglage dans /admin/magapp), seuls les agent·e·s inscrits à la BETA reçoivent des mails.
                <br /><strong>Une fois publiée</strong> : tous les agent·e·s concernés sont prévenus normalement.
              </Cas>
            </Section>

            <Section icon={<Send size={15} color={COLORS.primary} />} title={<>Signature électronique : qui y a droit ?<Activable /></>}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>Si la signature électronique n'est pas activée</strong> (réglage par défaut) : tous les agent·e·s passent par le circuit papier (impression, signature manuscrite, numérisation, téléversement).</div>
                <div><strong>Si elle est activée pour tous</strong> (« Réactiver pour tous ») : tout agent·e <em>avec e-mail</em> peut signer en ligne.</div>
                <div><strong>Si elle est activée pour une sélection</strong> : seuls les agent·e·s cochés. Pour les autres, l’évaluateur·rice voit « signature non activée pour cet·te agent·e » et suit le circuit papier.</div>
                <div>Dans tous les cas, <strong>un·e agent·e sans e-mail reste au circuit papier</strong>, même si la signature est ouverte.</div>
              </div>
              <Callout tone="info">Le document final est identique dans les deux circuits : ce choix ne crée aucune différence de traitement entre agent·e·s.</Callout>
            </Section>

            <Section icon={<Sparkles size={15} color={COLORS.primary} />} title="Version du module et nouveautés ; affichage plein écran">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Le <strong>numéro de version</strong> du module (par exemple <strong>v0.42.0</strong>) s'affiche à côté du titre « Entretiens professionnels ». Pour les administrateur·rice·s, un <strong>clic dessus</strong> ouvre les <strong>nouveautés</strong> : l'historique des versions, avec pour chacune les nouveautés, les améliorations et les corrections. <strong>Chaque modification livrée est une version</strong> : une nouveauté fait passer de 0.x à 0.(x+1), une correction ou une amélioration de 0.x.y à 0.x.(y+1). Cet historique est <strong>généré automatiquement à partir des descriptions des modifications</strong> apportées au module.</div>
                <div><strong>Plein écran, mode sombre et adresse dédiée</strong> : en haut du module, deux boutons permettent à <strong>chaque utilisateur·rice</strong> de choisir son affichage : <strong>plein écran</strong> (ou retour « dans MagApp », en fenêtre au-dessus du magasin d'applications) et <strong>mode sombre</strong> (ou mode clair). Ces choix sont mémorisés sur le poste ; sans choix, le mode sombre suit le thème de MagApp. En plein écran, l'en-tête et les onglets restent <strong>fixes</strong> quand on fait défiler la page. Le module s'ouvre aussi directement, toujours en plein écran, à l'adresse <strong>/ep</strong> (par exemple magapp.ivry.local/ep, ou /ep/evaluations pour « EP que je réalise ») : c'est le lien utilisé dans les e-mails.</div>
                <div><strong>Administrateur·rice : Paramétrage → Options → Affichage du module</strong> fixe le réglage <strong>de départ</strong> du plein écran (décoché par défaut : « dans MagApp »), pour les utilisateur·rice·s qui n'ont pas encore fait leur choix.</div>
              </div>
            </Section>

            <Section icon={<Mail size={15} color={COLORS.primary} />} title="Modèles d'e-mails (Paramétrage → Modèles d'e-mails)">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Cet onglet liste <strong>tous les e-mails envoyés par l'application</strong> (convocation, compte rendu à valider, relances, demandes de réouverture, lecture du CREP, CREP reçu et vérifié, backlog…), classés par <strong>destinataire</strong>. Un point orange signale un modèle personnalisé.</div>
                <div>Chaque modèle a cinq éléments modifiables : <strong>objet</strong>, <strong>titre</strong>, <strong>introduction</strong> et <strong>corps</strong> (dans un <strong>éditeur visuel</strong> : gras, italique, listes, liens) et <strong>libellé du bouton</strong>. La liste des <strong>variables</strong> disponibles est affichée sous l'éditeur : un clic insère la variable à l'endroit du curseur (par exemple <code>{'{{agent}}'}</code>, <code>{'{{evaluateur}}'}</code>, <code>{'{{quand}}'}</code>). Les variables « bloc » (en violet) sont générées par l'application et s'insèrent telles quelles.</div>
                <div><strong>Aperçu</strong> montre l'e-mail avec des valeurs d'exemple avant enregistrement ; <strong>Enregistrer</strong> s'applique dès le prochain envoi ; <strong>Rétablir l'original</strong> revient au texte d'origine.</div>
                <div>Les e-mails <strong>s'adaptent à la situation</strong> : par exemple, si l'agent·e n'a pas accès à « Mon entretien » (option non activée pour lui·elle), la convocation l'invite à préparer l'entretien sur papier (CREP vierge joint), sans bouton ni lien vers l'application, la relance de préparation n'est pas envoyée, et l'évaluateur·rice n'est pas informé·e d'une préparation en ligne.</div>
              </div>
            </Section>

            <Section icon={<Lightbulb size={15} color="#d97706" />} title="Backlog de traitement (onglet « Backlog »)">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>L'onglet <strong>« Backlog »</strong> (compteur des demandes en attente) rassemble toutes les demandes déposées avec l'<strong>ampoule</strong> : questions, améliorations et bugs, avec leurs pièces jointes et leurs commentaires. Filtres par <strong>état</strong> et par <strong>type</strong>.</div>
                <div><strong>Question</strong> : « Répondre » (la réponse est obligatoire). <strong>Amélioration ou bug</strong> : « Accepter », « Marquer réalisée » ou « Refuser » (<strong>motif obligatoire</strong>) ; « Remettre en attente » annule une décision.</div>
                <div>À chaque nouvelle demande, les administrateur·rice·s reçoivent un <strong>e-mail</strong> ; à chaque décision, le demandeur est <strong>prévenu par e-mail</strong> (avec le motif ou la réponse). Chacun·e peut commenter les demandes, y compris les administrateur·rice·s (leurs commentaires sont signalés).</div>
              </div>
            </Section>

            <Section icon={<ShieldCheck size={15} color={COLORS.primary} />} title={<>Options de campagne : analyse de cohérence, mode simple et QR code<Activable /></>}>
              <div style={{ marginBottom: 8 }}>Dans <strong>Paramétrage → Campagnes</strong>, trois cases propres à chaque campagne (la cohérence et le mode simple sont décochés par défaut, le QR code est coché par défaut) :</div>
              <Cas code="Cohérence" title="Analyse de cohérence" color="#0f766e">
                <strong>Cochée</strong> : le bouton de l'évaluateur s'appelle « Vérifier la cohérence » ; il contrôle le fond (adéquation entre les commentaires et la grille d'appréciation, relecture automatique si elle est ouverte à l'évaluateur).
                <br /><strong>Décochée</strong> : le bouton devient « Vérifier la <strong>complétude</strong> » ; il contrôle seulement que les rubriques <strong>obligatoires</strong> sont renseignées (elles bloquent la validation) et <strong>alerte</strong> sur les rubriques facultatives vides, sans appel à l'IA.
              </Cas>
              <Cas code="QR code" title="QR code sur les CREP imprimés" color="#0369a1">
                <strong>Coché</strong> : un QR code est imprimé en haut à gauche de chaque page du CREP ; à la numérisation, il rattache chaque page au bon agent et au bon numéro de page, même dans le désordre.
                <br /><strong>Décoché</strong> : aucun QR code n'est imprimé. À la numérisation (téléversement ou boîte mail), l'outil <strong>lit le nom de l'agent</strong> imprimé sur la première page et le <strong>titre de chaque page</strong> : il regroupe les pages en CREP dans l'ordre du fichier, <strong>remet les pages dans l'ordre</strong> grâce aux titres du modèle et <strong>propose l'agent avec un taux de certitude</strong> (plus bas quand deux agents ont des noms proches ou que la lecture est incertaine). Vous pouvez affecter le CREP à un autre agent (candidats probables en tête de liste) avant de valider ; un rapprochement sous 80 % n'est pas coché d'office. Cette lecture prend environ 3 secondes par page.
              </Cas>
              <Cas code="Mode simple" title="Mode simple" color="#7c3aed">
                <strong>Cochée</strong> : les évaluateurs <strong>ne téléversent jamais le CREP signé</strong>. Ils le réalisent (dans l'outil ou sur papier ; le PDF formulaire hors ligne ne leur est pas proposé), le font signer par l'agent·e et par eux, l'envoient à la DRH puis cliquent sur <strong>« J'ai envoyé le CREP à la DRH »</strong> (aucune notification). Le CREP signé est ensuite numérisé par les administrateurs (menu « Suivi des retours ») ; à la validation, l'agent·e et l'évaluateur sont notifiés et l'entretien est clôturé. <strong>Pas de demande de réouverture</strong> en mode simple ; un administrateur peut toujours dévalider un CREP.
              </Cas>
            </Section>

            <Section icon={<ScanLine size={15} color={COLORS.primary} />} title="Suivi des retours : avancement, numérisation en lot et boîte mail">
              <div style={{ display: 'grid', gap: 6 }}>
                <div><strong>Menu « Suivi des retours »</strong> (marqué ADMIN) : choisir la campagne ; les compteurs donnent le nombre d'EP <strong>programmés</strong>, <strong>réalisés</strong>, <strong>en retard</strong> (date dépassée sans compte rendu validé) et <strong>CREP retournés</strong> (et, en mode simple, « Transmis, à numériser »). Ils sont cliquables ; des filtres existent par direction, service, évaluateur et état. Chaque ligne indique le <strong>canal d'entrée</strong> du CREP (<strong>Mail</strong> ou <strong>Téléversement DRH</strong>) et la lecture IA, que l'on peut consulter.</div>
                <div><strong>« Téléverser des CREP »</strong> : déposer <strong>un PDF scanné contenant plusieurs CREP</strong>, pages dans le désordre si besoin. Chaque page imprimée porte un <strong>QR code</strong> (en haut à gauche, si l'option est cochée) : l'outil reconnaît l'agent et le numéro de page, remet les pages à l'endroit, reconstitue chaque CREP et <strong>vérifie qu'il compte 4 pages</strong>. Sans QR code, l'outil lit le nom de l'agent et le titre des pages, propose l'agent avec un taux de certitude et remet les pages dans l'ordre (voir l'option « QR code »). Pour chaque CREP, vous voyez les miniatures ; une page non reconnue, en double ou manquante est signalée et se corrige à la main (choisir l'agent et la page, pivoter, écarter). Seuls les CREP complets se valident.</div>
                <div><strong>À la validation</strong> : le CREP signé est rattaché à l'agent·e, la réception par la DRH est déclarée, <strong>l'entretien est clôturé</strong>, la <strong>lecture IA</strong> (la plus précise) démarre en tâche de fond (résultat réservé aux administrateurs) et l'agent·e et son évaluateur reçoivent un <strong>e-mail de remerciement</strong> (modèle « CREP reçu et vérifié », modifiable dans Paramétrage → Modèles d'e-mails). Si un CREP signé existe déjà, son remplacement est confirmé.</div>
                <div><strong>Colonnes « CREP papier » et « CREP numérique »</strong> : le bouton <strong>« Signé »</strong> ouvre le CREP scanné ; il est <strong>vert</strong> si la lecture voit les 2 signatures (agent·e et évaluateur), <strong>orange</strong> s'il en manque au moins une (l'info-bulle dit laquelle), gris tant que c'est inconnu. Le bouton <strong>« Formulaire »</strong> ouvre le <strong>CREP numérique</strong> : le formulaire de saisie en lecture seule, renseigné par la lecture IA, avec un badge <strong>« Lu par l'IA »</strong> (ou « Saisi » pour ce qui vient de l'outil) et un badge orange <strong>« Lecture incertaine »</strong> quand l'IA a lu deux versions différentes. <strong>« Saisi »</strong> ouvre le PDF de la saisie dans l'outil. La <strong>corbeille</strong> supprime le retour d'un agent (erreur d'affectation, mauvais document) : le CREP scanné est effacé, l'EP clôturé repasse à « réalisé » et le CREP redevient validable dans son lot. La détection des signatures est automatique : à vérifier sur le document.</div>
                <div><strong>Boîte mail à moissonner</strong> : dans l'administration du DSI Hub (<strong>Collecteurs de mails</strong>), créer un collecteur de module <strong>« Entretiens »</strong> avec l'adresse de la boîte et la fréquence. Chaque PDF reçu en pièce jointe devient un lot « à vérifier » (canal <strong>Mail</strong>, avec expéditeur et objet) et passe par la même vérification. Un PDF sans QR code de CREP est classé « Aucun CREP reconnu » et n'est pas proposé.</div>
              </div>
            </Section>

            <Section icon={<Inbox size={15} color={COLORS.primary} />} title="Pilotage : filtrer, aperçu du CREP et réception par la DRH">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>Compteurs-filtres</strong> : comme pour les évaluateur·rice·s, les compteurs du haut sont cliquables et filtrent la liste (un second clic retire le filtre). Ils se combinent avec les filtres par direction, service, secteur, catégorie et lecture.</div>
                <div><strong>Aperçu CREP</strong> : ouvre une visionneuse avec <strong>deux onglets</strong>, « CREP numérisé » (le document téléversé) et « CREP reconstruit » (la version numérique). En saisie dans l'outil, avec la lecture désactivée, le second onglet s'intitule « Éléments relevés » (2 observations de l'agent·e + signatures, avec un avertissement de lecture automatique). Le bouton n'existe pas sur un EP clôturé : l'évaluateur y trouve « CREP papier » et « CREP saisi », et vous le « Suivi des retours ».</div>
                <div><strong>Menu « ⋯ »</strong> de chaque ligne : « CREP reçu par la DRH » (ou « Annuler la réception DRH »), « Dévalider le CREP » et « Remettre l'EP à zéro ».</div>
                <div><strong>Déclarer la réception par la DRH</strong> : pour un CREP validé, via le menu « ⋯ » ou, pour plusieurs entretiens, en cochant les lignes puis « Reçus par la DRH ». La date et l'auteur sont tracés au Journal. Cela alimente les compteurs « À transmettre à la DRH » et « Reçus par la DRH », visibles aussi des évaluateur·rice·s pour leurs agent·e·s. La validation d'une numérisation dans « Suivi des retours » la déclare automatiquement. La réception est effacée par une RAZ, une dévalidation, une réouverture acceptée ou la suppression d'un retour.</div>
              </div>
            </Section>

            <Section icon={<Lock size={15} color={COLORS.primary} />} title="Demandes de réouverture">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Un évaluateur dont l'entretien est <strong>clôturé</strong> peut <strong>demander la réouverture</strong>, en <strong>justifiant</strong> sa demande. Les administrateurs reçoivent un e-mail et la demande apparaît dans le menu <strong>« Demandes de réouverture »</strong> (avec un compteur).</div>
                <div>L'administrateur <strong>accepte</strong> (l'entretien redevient modifiable, le CREP signé archivé est retiré) ou <strong>refuse</strong> (motif obligatoire) ; le demandeur est prévenu par e-mail. Impossible une fois la campagne close. <strong>Cette fonction n'existe pas en mode simple.</strong></div>
              </div>
            </Section>

            <Section icon={<Lock size={15} color={COLORS.primary} />} title="Clore la campagne et dévalider un CREP">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>Clore la campagne</strong> (Paramétrage → Campagnes, bouton « Clore la campagne », action définitive) : les évaluateur·rice·s ne consultent plus les documents des entretiens dans ce module ; les CREP clôturés sont consultés dans le <strong>dossier de l'agent·e</strong>. Les administrateurs gardent l'accès. L'outil indique combien d'entretiens n'étaient pas encore clôturés.</div>
                <div><strong>Dévalider un CREP</strong> (Pilotage, menu « ⋯ » → « Dévalider le CREP », <strong>réservé aux administrateurs</strong>) : à n'utiliser qu'en cas d'<strong>erreur manifeste</strong>, avec un motif obligatoire tracé au Journal. Le CREP redevient modifiable par son évaluateur·rice et repart au choix du mode de saisie. Impossible pendant un circuit de signature en cours ou une fois la campagne close.</div>
                <div>Une <strong>remise à zéro (RAZ)</strong> ramène l'entretien à l'étape zéro, <strong>y compris le choix du mode de saisie</strong>, et supprime aussi les scans conservés et le dossier des PDF de l'entretien, les demandes de réouverture, la réception DRH et le signalement « envoyé à la DRH » du mode simple.</div>
              </div>
            </Section>

            <Section icon={<RotateCcw size={15} color={COLORS.primary} />} title="RAZ : remettre un EP à zéro">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>1.</strong> Ouvrir « Pilotage » et repérer l'EP concerné.</div>
                <div><strong>2.</strong> Ouvrir le menu <strong>« ⋯ »</strong> de la ligne puis cliquer sur <strong>« Remettre l'EP à zéro »</strong> (en rouge).</div>
                <div><strong>3.</strong> Lire la confirmation, puis confirmer.</div>
                <div><strong>4.</strong> L'EP revient à « À planifier » : rendez-vous, préparation, compte rendu, commentaires, objectifs, formations et pièces jointes sont supprimés.</div>
              </div>
              <Callout tone="warn" title="Action irréversible, réservée aux administrateurs">
                L'agent·e et son évaluateur·rice sont conservés. Un parapheur en cours est annulé ; un parapheur déjà signé est conservé dans les archives, seul le lien avec l'EP est supprimé.
                Utiliser la RAZ uniquement pour corriger une erreur de test ou une saisie faite sur le mauvais agent·e.
              </Callout>
            </Section>

            <Section icon={<Users size={15} color={COLORS.primary} />} title="Droits : qui peut voir quoi ?">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>Mon entretien</strong><Activable /> : accès de l'agent·e à sa préparation et à son CREP, s'il est activé pour lui.</div>
                <div><strong>Signature électronique</strong><Activable /> : ouverte agent·e par agent·e, si elle est activée.</div>
                <div><strong>IA</strong><Activable /> : rédaction et relecture, ouvertes à certains évaluateur·rice·s, si elles sont activées.</div>
                <div><strong>Réactiver pour tous</strong> ouvre à tout le monde ; <strong>Activer pour la sélection</strong> réserve aux personnes cochées.</div>
              </div>
            </Section>

            <Section icon={<GraduationCap size={15} color={COLORS.primary} />} title="Demandes de formation (onglet « Demandes de formation »)">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Cet onglet rassemble les <strong>« Actions de formation à envisager »</strong> de tous les comptes rendus de la campagne, selon les <strong>3 types</strong> (formations obligatoires, autres formations métiers, formations liées au parcours), <strong>classées par direction puis par service</strong>. Cliquer sur une direction pour la déplier.</div>
                <div><strong>La vue est non nominative</strong> : ni nom ni identifiant d'agent·e n'est affiché ou transmis à l'IA.</div>
                <div>Le bouton <strong>« Analyser avec l'IA locale »</strong> confie l'ensemble à l'IA de la Ville (en tâche de fond, quelques dizaines de secondes) : elle <strong>regroupe les demandes en thèmes</strong> (ex. management et encadrement ensemble ; Word et Excel dans « Bureautique »), indique pour chaque thème le nombre de demandes, leur répartition par type et par direction, et rédige une synthèse des <strong>besoins globaux</strong> pour la DRH. Les chiffres sont recalculés par l'application, pas par l'IA.</div>
                <div>Pendant l'analyse, une <strong>barre de progression</strong> montre la phase en cours (classement, regroupement, synthèse) et le temps écoulé. À la fin, le bouton <strong>« Voir le résultat de l'analyse IA »</strong> ouvre les besoins par catégorie (préparation aux concours, bureautique, logiciels métier, formations obligatoires, certifiantes, managériales…) avec leurs sous-thèmes. Les catégories et toutes les consignes de l'IA se modifient dans <strong>Paramétrage → IA (prompts)</strong>.</div>
                <div>« Exporter (CSV) » extrait toutes les demandes pour la DRH. L'analyse est conservée : relancez-la quand de nouveaux comptes rendus arrivent.</div>
              </div>
              <Callout tone="info">Un regroupement par l'IA est une aide à la décision : relisez les thèmes (une demande peut être mal classée) avant de bâtir le plan de formation.</Callout>
            </Section>

            <Section icon={<FlaskConical size={15} color={COLORS.primary} />} title={<>Mode simulation (Paramétrage)<Activable /></>}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Dans <strong>Paramétrage → Options → Mode simulation</strong>, un administrateur peut tester l'application sans polluer les données réelles. Les <strong>évaluateur·rice·s, « qui valide qui » et le lien Active Directory</strong> restent <strong>réels</strong> et ne sont jamais effacés ; les <strong>rendez-vous</strong> et les <strong>entretiens (avec leur contenu)</strong> sont <strong>provisoires</strong>.</div>
                <div>Le bouton <strong>« Supprimer la base de simulation »</strong> remet à zéro tous les rendez-vous et entretiens (saisies, comptes rendus, scans). Il n'apparaît que lorsque la simulation est active.</div>
                <div><strong>Si la simulation est activée</strong>, aucun mail ne part aux agent·e·s hors BETA et l'onglet « Demandes de formation » affiche des demandes <strong>fictives</strong> (la moitié des agent·e·s, selon leur métier), jamais enregistrées.</div>
              </div>
            </Section>

            <Section icon={<ScanLine size={15} color={COLORS.primary} />} title="Documents conservés pour les comptes rendus manuscrits">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Quand un·e évaluateur·rice importe un CREP papier, <strong>deux versions sont conservées</strong> sur l'entretien : le <strong>scan original</strong> (PDF assemblé à partir des photos, dans le stockage GED) et la <strong>version numérique lue par l'IA</strong> (PDF généré à la demande).</div>
                <div>La version numérique porte le filigrane <strong>« DOCUMENT NON CONTRACTUEL »</strong> et « Document original manuscrit signé » à la place des signatures. <strong>L'original papier signé est envoyé à la DRH</strong> par l’évaluateur·rice.</div>
                <div>L'analyse IA est réalisée par l'<strong>IA locale</strong> de la Ville (aucune donnée ne sort du réseau). Les analyses sont tracées dans le Journal.</div>
              </div>
            </Section>

            <Section icon={<Database size={15} color={COLORS.primary} />} title="Statistiques, journal et données personnelles">
              <div style={{ display: 'grid', gap: 4 }}>
                <div>Le <strong>Journal</strong> trace les ajouts, changements d’évaluateur·rice, préparations, validations, impressions, RAZ, envois signalés à la DRH, CREP numérisés et retours supprimés.</div>
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
