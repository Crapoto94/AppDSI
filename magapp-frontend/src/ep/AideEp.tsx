import { useState } from 'react';
import {
  X, BookOpen, UserCheck, ShieldCheck, Sparkles, Users, CalendarClock,
  FileSignature, History, MousePointerClick, CheckCircle2, AlertTriangle,
  Send, Lock, Database, RotateCcw, HelpCircle, Printer, Mail, MailX, PenLine, Route,
} from 'lucide-react';
import { COLORS, card, btnGhost, btnPrimary } from './ui';

const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
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
function Cas({ code, title, color = '#4f46e5', icon, children }: { code: string; title: string; color?: string; icon?: React.ReactNode; children: React.ReactNode }) {
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
function Shot({ src, caption }: { src: string; caption: string }) {
  return (
    <figure style={{ margin: '8px 0 10px', padding: 0 }}>
      <a href={src} target="_blank" rel="noopener noreferrer" title="Cliquer pour agrandir">
        <img src={src} alt={caption} loading="lazy" style={{ display: 'block', width: '100%', maxWidth: 760, borderRadius: 9, border: `1px solid ${COLORS.border}`, boxShadow: '0 2px 8px rgba(15,23,42,.08)' }} />
      </a>
      <figcaption style={{ fontSize: 11.5, color: '#64748b', marginTop: 4 }}>📷 {caption} <span style={{ color: '#94a3b8' }}>(exemple avec des données fictives)</span></figcaption>
    </figure>
  );
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

/** Schéma du processus complet, avec qui fait quoi. */
function ProcessSchema() {
  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, background: '#f8fafc', marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: COLORS.text, marginBottom: 8 }}>Le chemin d'un EP, de la désignation à l'archive</div>
      <Step n={1} title="L'administrateur désigne les valideurs" who="Administrateur">
        Il indique qui valide qui. Vous n'avez rien à faire : vous retrouvez simplement vos agents dans MagApp.
      </Step>
      <Step n={2} title="Vous prenez rendez-vous avec l'agent" who="Valideur">
        Bouton « Planifier ». L'outil envoie l'invitation Outlook et un e-mail à l'agent (s'il a une adresse e-mail), avec le CREP vierge en pièce jointe.
      </Step>
      <Step n={3} title="L'agent prépare son entretien" who="Agent">
        En ligne dans « Mon entretien » (s'il a un e-mail et l'accès), sinon sur le formulaire papier. Cette étape est facultative pour vous : l'entretien peut avoir lieu sans.
      </Step>
      <Step n={4} title="L'entretien (EP) a lieu" who="Valideur + Agent">
        Vous échangez avec l'agent. Vous notez ensuite le compte rendu (CREP) <strong>soit dans l'outil</strong>, <strong>soit à la main sur le papier</strong>.
      </Step>
      <Step n={5} title="Vous validez le CREP dans l'outil" who="Valideur">
        « Vérifier la cohérence », puis « Valider le compte rendu ». L'entretien passe à « Réalisé ».
      </Step>
      <Step n={6} title="Signature : électronique ou papier" who="Agent + Valideur">
        Si l'agent et vous avez un e-mail et que la signature électronique est ouverte : « Envoyer à l'agent », il valide, vous signez tous les deux dans le parapheur.
        Sinon : vous imprimez, l'agent et vous signez, vous scannez les 4 pages.
      </Step>
      <Step n={7} title="Le CREP signé est archivé" who="Automatique / Valideur">
        Le PDF signé reste consultable dans l'EP (bouton « CREP signé »). Rien à classer dans un classeur.
      </Step>
    </div>
  );
}

/** Repères visuels à l'écran, sans capture d'écran. */
function ScreenMap() {
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
        {box('Onglet « Mon entretien »', 'Votre propre EP, en tant qu\'agent', '#fde68a')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 6 }}>
        {box('Bouton « Planifier »', 'Fixer le rendez-vous')}
        {box('Bouton « Saisir l’EP »', 'Ouvrir et remplir le CREP')}
        {box('Icône imprimante', 'Imprimer le CREP (vierge ou rempli)')}
        {box('« Valider le compte rendu »', 'Passe l\'EP à « Réalisé »')}
        {box('« Envoyer à l’agent »', 'Circuit électronique')}
        {box('« CREP manuscrit (4 pages scannées) »', 'Circuit papier')}
      </div>
    </div>
  );
}

/** Schéma des statuts : rassure sur l'état de l'EP. */
function StatusSchema() {
  return (
    <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, marginBottom: 10 }}>
      <div style={{ fontSize: 12.5, fontWeight: 800, color: COLORS.text, marginBottom: 8 }}>Les statuts, dans l'ordre</div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', lineHeight: 2 }}>
        <Chip label="À planifier" color="#92400e" bg="#fef3c7" /><Arrow />
        <Chip label="Planifié" color="#1e40af" bg="#dbeafe" /><Arrow />
        <Chip label="Réalisé (CREP validé)" color="#166534" bg="#dcfce7" /><Arrow />
        <Chip label="Envoyé à l'agent" color="#6b21a8" bg="#f3e8ff" /><Arrow />
        <Chip label="En signature" color="#9a3412" bg="#ffedd5" /><Arrow />
        <Chip label="Signé / archivé" color="#065f46" bg="#d1fae5" />
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
        Circuit papier : « Réalisé » <strong>→</strong> « Signé papier / archivé » (les deux étapes du milieu sont sautées).
        « À planifier » ne veut pas dire « en retard » : l'EP attend simplement votre action.
      </div>
    </div>
  );
}

/** Tableau de synthèse « quelle situation, que se passe-t-il ». */
function Matrice() {
  const th: React.CSSProperties = { textAlign: 'left', padding: '6px 8px', background: '#f1f5f9', fontSize: 11.5, color: COLORS.text, borderBottom: `1px solid ${COLORS.border}` };
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: 12, borderBottom: `1px solid ${COLORS.border}`, verticalAlign: 'top' };
  return (
    <div style={{ overflowX: 'auto', marginBottom: 10 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>
        <thead>
          <tr><th style={th}>Situation</th><th style={th}>Prise de RDV</th><th style={th}>Préparation de l'agent</th><th style={th}>Compte rendu et signature</th></tr>
        </thead>
        <tbody>
          <tr>
            <td style={td}><strong>A.</strong> L'agent et vous avez un e-mail, signature électronique ouverte</td>
            <td style={td}>Invitation Outlook + e-mail à l'agent avec CREP vierge</td>
            <td style={td}>En ligne, dans « Mon entretien »</td>
            <td style={td}>Vous saisissez dans l'outil → « Envoyer à l'agent » → l'agent valide → signature dans le parapheur → archivage automatique</td>
          </tr>
          <tr>
            <td style={td}><strong>B.</strong> L'agent a un e-mail mais la signature électronique n'est pas ouverte</td>
            <td style={td}>Identique au cas A</td>
            <td style={td}>En ligne ou sur papier</td>
            <td style={td}>Vous saisissez dans l'outil et validez → vous imprimez → signatures papier → vous téléversez le scan</td>
          </tr>
          <tr>
            <td style={td}><strong>C.</strong> L'agent n'a pas d'e-mail</td>
            <td style={td}>Aucun mail ni invitation ne part à l'agent : vous le prévenez de vive voix et lui remettez le CREP vierge imprimé</td>
            <td style={td}>Sur papier uniquement</td>
            <td style={td}>Circuit papier (comme B)</td>
          </tr>
          <tr>
            <td style={td}><strong>D.</strong> Vous décidez de remplir le CREP à la main</td>
            <td style={td}>Identique à A, B ou C</td>
            <td style={td}>Comme A, B ou C</td>
            <td style={td}>Vous écrivez sur le papier pendant l'entretien. Ensuite : soit vous recopiez dans l'outil (ou « Importer un compte rendu papier »), validez, puis scannez le papier signé</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export interface AideFeatures { prep?: boolean; aiDraft?: boolean; aiReview?: boolean; esign?: boolean }

export default function AideEp({ onClose, isAdmin, features, onTuto }: { onClose: () => void; isAdmin?: boolean; features?: AideFeatures; onTuto?: () => void }) {
  const [tab, setTab] = useState<'evaluateur' | 'admin'>(isAdmin ? 'admin' : 'evaluateur');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
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
              Cette page vous tient la main. Lisez d'abord « Quelle est ma situation ? », puis suivez uniquement les étapes qui vous concernent.
              Si un écran ne ressemble pas à ce qui est décrit, ne cherchez pas au hasard : appelez l'administrateur du module ou la DSI.
            </Callout>

            <Section icon={<MousePointerClick size={15} color={COLORS.primary} />} title="Le processus en un coup d'œil">
              <ProcessSchema />
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Retenez surtout ceci : <strong>vous planifiez</strong>, <strong>vous menez l'entretien</strong>, <strong>vous validez le CREP dans l'outil</strong>,
                puis <strong>la signature se fait en ligne ou sur papier</strong> selon la situation de l'agent.
              </div>
            </Section>

            <Section icon={<Route size={15} color={COLORS.primary} />} title="Quelle est ma situation ?">
              <div style={{ marginBottom: 8 }}>
                Le déroulé change selon deux questions : <strong>l'agent a-t-il une adresse e-mail ?</strong> et <strong>la signature électronique est-elle ouverte pour lui ?</strong>
                {' '}Vous n'avez pas à le deviner : l'outil le sait et ne vous propose que les boutons qui marchent.
              </div>
              <Matrice />
              <Callout tone="info" title="Comment savoir si l'agent a un e-mail ?">
                Dans la liste « EP que je réalise », la colonne de l'agent indique son adresse. Si elle est vide, vous êtes dans le cas C, <strong>sauf si vous savez qu'il en a une</strong> : l'orthographe de son nom diffère peut-être entre la base RH et l'annuaire informatique, et vous pouvez faire le lien vous-même (étape 1, « Lier l'AD »).
                Le bouton « Envoyer à l'agent » n'apparaît alors pas : c'est normal, passez par l'impression.
              </Callout>
            </Section>

            <Section icon={<Users size={15} color={COLORS.primary} />} title="Où cliquer dans MagApp ?">
              <ScreenMap />
              <Shot src="/aide-ep/01-liste.jpg" caption="Onglet « EP que je réalise » : une ligne par agent, avec les boutons Planifier, imprimer, changer l'évaluateur et Saisir l'EP" />
              <Callout tone="warn" title="Ne pas confondre les espaces">
                <strong>« EP que je réalise »</strong> = les entretiens dont vous êtes l'évaluateur (vous les remplissez).
                <strong> « EP de mon équipe »</strong> = la vue de contrôle de vos agents (souvent en lecture seule).
                <strong> « Mon entretien »</strong> = votre propre entretien, quand vous êtes évalué(e).
              </Callout>
            </Section>

            <Section icon={<CheckCircle2 size={15} color={COLORS.primary} />} title="Avant de commencer : 3 vérifications">
              <div style={{ display: 'grid', gap: 6 }}>
                <div><strong>1.</strong> Je suis bien connecté avec <strong>mon compte personnel</strong>, pas celui d'un collègue.</div>
                <div><strong>2.</strong> Je vois le bon nombre d'agents dans « EP que je réalise » (ou « EP de mon équipe »).</div>
                <div><strong>3.</strong> Je repère les agents <strong>sans adresse e-mail</strong> : ils suivent le circuit papier (cas C).</div>
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
                Vous pouvez le corriger <strong>vous-même</strong>, sans attendre l'administrateur : voir les deux modes opératoires ci-dessous.
                Règle à garder en tête : <strong>un agent = un seul valideur</strong>.
              </Callout>

              <Cas code="Il manque un agent" title="M'ajouter un agent qui n'a pas encore de valideur" color="#16a34a" icon={<Users size={14} color="#16a34a" />}>
                <Shot src="/aide-ep/03-ajouter-agent.jpg" caption="Fenêtre « Ajouter un agent » : les agents de votre direction sans évaluateur" />
                <Gestes items={[
                  <>Aller dans l'onglet <strong>« EP que je réalise »</strong>.</>,
                  <>Cliquer sur le bouton bleu <strong>« Ajouter un agent »</strong> (au-dessus du tableau).</>,
                  <>Une fenêtre liste les agents <strong>de votre direction qui n'ont encore aucun évaluateur</strong>. Taper un nom dans la zone de recherche puis <strong>« Rechercher »</strong> si besoin.</>,
                  <>Cliquer sur <strong>« Ajouter »</strong> en face de l'agent : il apparaît aussitôt dans votre liste, prêt à être planifié.</>,
                ]} />
                <Callout tone="info" title="L'agent n'est pas dans la liste ?">
                  Soit il a <strong>déjà un valideur</strong> (voir le mode opératoire suivant : changer de valideur), soit il n'est pas dans votre direction ou pas dans la base des agents :
                  prévenez l'administrateur.
                </Callout>
              </Cas>

              <Cas code="Mauvais valideur" title="Changer le valideur d'un agent" color="#4f46e5" icon={<UserCheck size={14} color="#4f46e5" />}>
                <Shot src="/aide-ep/04-changer-valideur.jpg" caption="Fenêtre « Changer l'évaluateur » : l'évaluateur actuel, une recherche et un bouton Choisir" />
                <Gestes items={[
                  <>Dans la liste, repérer la ligne de l'agent concerné.</>,
                  <>Cliquer sur l'icône <strong>« personne avec un engrenage »</strong> (info-bulle « Changer l'évaluateur ») à droite de la ligne.</>,
                  <>La fenêtre affiche l'évaluateur actuel et la liste des évaluateurs possibles. Chercher le bon nom (nom, matricule ou e-mail).</>,
                  <>Cliquer sur <strong>« Choisir »</strong> en face du bon valideur. L'agent quitte votre liste (ou rejoint la vôtre) immédiatement.</>,
                ]} />
                <div style={{ marginTop: 4 }}>
                  <strong>Pour récupérer un agent d'un collègue</strong> (ou donner un de vos agents à un collègue), c'est le même geste : ouvrir la fenêtre « Changer l'évaluateur » de cet agent et choisir le nouveau valideur.
                  Le droit est réservé à l'évaluateur actuel de l'agent, à son supérieur et aux administrateurs.
                </div>
                <Callout tone="warn" title="Si l'EP est déjà commencé">
                  Changer de valideur ne supprime rien de ce qui a été saisi, mais le nouveau valideur reprend la main à partir de là.
                  Prévenez l'ancien valideur et l'agent. Toutes les modifications sont inscrites dans le <strong>Journal</strong>.
                </Callout>
              </Cas>

              <Cas code="Vue équipe" title="Si vous êtes directeur ou DGA : depuis « EP de mon équipe »" color="#64748b" icon={<Users size={14} color="#64748b" />}>
                Dans l'onglet <strong>« EP de mon équipe »</strong>, les agents sont rangés par valideur (cliquer sur « Tout déplier »). Le bouton « Ajouter un agent » devient
                <strong> « Choisir l'évaluateur »</strong> : vous choisissez d'abord l'agent sans évaluateur, puis le valideur à lui affecter, parmi les valideurs de votre périmètre.
                Pour un agent déjà affecté, utilisez aussi l'icône « Changer l'évaluateur ».
              </Cas>

              <Cas code="Pas d'e-mail" title="Un agent est affiché sans adresse e-mail : le rapprochement RH ↔ annuaire informatique" color="#d97706" icon={<MailX size={14} color="#d97706" />}>
                <div style={{ marginBottom: 6 }}>
                  <strong>Pourquoi ça arrive ?</strong> Les agents viennent de la <strong>base RH</strong>, mais les adresses e-mail sont dans l'<strong>annuaire informatique</strong> (l'AD, qui sert à vous connecter).
                  L'outil relie les deux en comparant matricule, puis nom et prénom. Quand l'orthographe diffère entre les deux bases
                  (accent, tiret, nom d'usage ou nom de naissance, prénom composé, faute de frappe), <strong>le lien ne se fait pas tout seul</strong> et l'agent apparaît « sans e-mail »,
                  <strong> alors qu'il en a bien un</strong>.
                </div>
                <div style={{ marginBottom: 6 }}>
                  <strong>Ce que vous pouvez faire :</strong> si vous savez que l'agent que vous évaluez a une adresse e-mail (il utilise Outlook, vous lui écrivez déjà…),
                  <strong> retrouvez-le vous-même dans l'annuaire informatique et faites le lien</strong> :
                </div>
                <Shot src="/aide-ep/05-lier-ad.jpg" caption="Fenêtre « Lier un compte AD » : on tape quelques lettres, on vérifie le nom et l'adresse, puis « Lier »" />
                <Gestes items={[
                  <>Sur la ligne de l'agent, cliquer sur <strong>« Lier l'AD »</strong>.</>,
                  <>Taper <strong>quelques lettres de son nom</strong> (2 minimum) dans la zone de recherche. Essayez une orthographe plus courte ou son prénom seul si rien ne sort (ex. « mar » plutôt que « Marié-Dupont »).</>,
                  <>Dans les résultats (nom affiché + adresse e-mail), repérer <strong>la bonne personne</strong> : vérifier l'adresse.</>,
                  <>Cliquer sur <strong>« Lier »</strong>. L'adresse e-mail est rattachée à l'agent.</>,
                ]} />
                <Callout tone="ok" title="Ce que cela change">
                  L'agent passe du <strong>cas C au cas A ou B</strong> : il reçoit l'invitation Outlook et l'e-mail de préparation, et peut signer en ligne si la signature électronique lui est ouverte.
                  Si vous aviez déjà planifié, modifiez le rendez-vous pour que l'invitation lui parte.
                </Callout>
                <Callout tone="warn" title="Attention à l'homonymie">
                  Ne liez que si vous êtes <strong>certain</strong> de la personne (même service, bonne adresse). Un mauvais lien enverrait les documents confidentiels de l'entretien à quelqu'un d'autre.
                  Une adresse déjà utilisée par un autre agent (doublon) doit être traitée par l'administrateur.
                </Callout>
                <div>
                  <strong>Si l'agent n'a vraiment pas d'adresse</strong> (agent sans poste informatique, par exemple) : ne liez rien. Il suit le circuit papier (cas C).
                </div>
              </Cas>
              <Callout tone="ok">
                Rien de tout cela ne casse l'historique : chaque ajout et chaque changement de valideur est tracé. En cas de doute, contactez l'administrateur plutôt que de bricoler.
              </Callout>
            </Section>

            <Section icon={<CalendarClock size={15} color={COLORS.primary} />} title="Étape 2 — Prendre rendez-vous (planifier)">
              <Shot src="/aide-ep/02-planifier.jpg" caption="Fenêtre « Planifier » : « Prochains créneaux libres » propose des horaires où l'agent et vous êtes disponibles" />
              <Gestes items={[
                <>Dans « EP que je réalise », repérer la ligne de l'agent.</>,
                <>Cliquer sur <strong>« Planifier »</strong> (ou « Modifier le RDV » si une date existe déjà).</>,
                <>Choisir la <strong>date et l'heure</strong>, la <strong>durée</strong> (2 heures par défaut) et le <strong>lieu</strong>.</>,
                <>Pour être aidé : cliquer sur <strong>« Prochains créneaux libres »</strong>. L'outil lit votre agenda et celui de l'agent, puis propose des créneaux communs. Cliquer sur un créneau.</>,
                <>Cliquer sur le bouton de validation. Un message vert confirme l'envoi.</>,
              ]} />

              <div style={{ fontWeight: 800, color: COLORS.text, margin: '10px 0 6px' }}>Ce qui se passe ensuite, selon le cas</div>
              <Cas code="Cas A / B" title="L'agent a une adresse e-mail" color="#16a34a" icon={<Mail size={14} color="#16a34a" />}>
                <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>
                  <li>L'agent reçoit une <strong>invitation Outlook</strong> dans son agenda, comme vous.</li>
                  <li>L'agent reçoit un <strong>e-mail « Préparez votre entretien »</strong> avec un bouton qui ouvre MagApp et le <strong>CREP vierge en PDF</strong> en pièce jointe.</li>
                  <li>Vous recevez aussi un e-mail de confirmation du rendez-vous.</li>
                  <li>Si l'agent n'a toujours pas transmis sa préparation quand l'entretien approche, <strong>l'outil le relance tout seul</strong>. Vous n'avez rien à faire.</li>
                </ul>
              </Cas>
              <Cas code="Cas C" title="L'agent n'a PAS d'adresse e-mail" color="#d97706" icon={<MailX size={14} color="#d97706" />}>
                <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>
                  <li><strong>Aucun e-mail ni invitation ne part à l'agent.</strong> Le rendez-vous est quand même enregistré, et il apparaît dans votre agenda.</li>
                  <li>C'est à <strong>vous de prévenir l'agent</strong> (de vive voix, par téléphone ou par courrier) : date, heure, lieu.</li>
                  <li>Remettez-lui le <strong>CREP vierge imprimé</strong> : cliquer sur l'icône imprimante de sa ligne, puis choisir le CREP vierge (ou cocher plusieurs agents et imprimer en une fois).</li>
                  <li>Si vous savez que l'agent a en réalité une adresse e-mail, faites le lien vous-même avec « Lier l'AD » (étape 1) : le cas A ou B s'appliquera alors.</li>
                </ul>
              </Cas>
              <Cas code="Rare" title="Vous n'avez pas d'e-mail vous-même" color="#d97706">
                L'outil ne peut pas envoyer l'invitation ni le circuit électronique. Utilisez le circuit papier (étape 5, cas B) et signalez-le à l'administrateur.
              </Cas>
              <Callout tone="info" title="Changer la date ou l'heure">
                Rouvrir « Modifier le RDV ». L'invitation Outlook et l'e-mail sont mis à jour : <strong>ne recréez jamais un EP</strong>.
                Un avertissement s'affiche si le rendez-vous est à moins de 8 jours.
              </Callout>
            </Section>

            <Section icon={<FileSignature size={15} color={COLORS.primary} />} title="Étape 3 — Avant l'entretien : la préparation de l'agent">
              <Shot src="/aide-ep/08-agent.jpg" caption="Ce que voit l'agent dans « Mon entretien » : la fiche de préparation à compléter" />
              <Cas code="En ligne" title="L'agent a un e-mail et l'accès à « Mon entretien »" color="#4f46e5">
                Il remplit une fiche (bilan, difficultés, souhaits de formation, perspectives) <strong>dans MagApp</strong>. Vous la retrouvez dans « Saisir l'EP ».
                Elle sert à <strong>nourrir l'échange</strong> : vous n'avez pas à la recopier.
              </Cas>
              <Cas code="Papier" title="L'agent n'a pas d'e-mail, ou préfère le papier" color="#64748b" icon={<Printer size={14} color="#64748b" />}>
                Il prépare sur le <strong>CREP vierge papier</strong> et vous le remet (ou le garde pour l'entretien). Dans ce cas, il n'y a rien dans l'outil : c'est normal.
              </Cas>
              <Callout tone="ok">
                La préparation n'est <strong>pas obligatoire</strong> pour tenir l'entretien. Un agent qui n'a rien préparé peut être évalué normalement.
              </Callout>
            </Section>

            <Section icon={<PenLine size={15} color={COLORS.primary} />} title="Étape 4 — Le jour de l'entretien : comment noter le compte rendu ?">
              <div style={{ marginBottom: 8 }}>Vous avez le choix. <strong>Les deux méthodes mènent au même document officiel.</strong></div>
              <Shot src="/aide-ep/07-crep.jpg" caption="Le compte rendu : en bas, les boutons Enregistrer le brouillon, Valider, Vérifier la cohérence, Envoyer à l'agent, CREP manuscrit et Imprimer / PDF" />

              <Cas code="Méthode 1" title="Je saisis directement dans l'outil (recommandé)" color="#16a34a">
                <Gestes items={[
                  <>Cliquer sur <strong>« Saisir l'EP »</strong> sur la ligne de l'agent.</>,
                  <>Lire la préparation de l'agent si elle existe.</>,
                  <>Remplir le <strong>compte rendu</strong> : bilan, objectifs, compétences, formations, perspectives, <strong>appréciation générale</strong>.</>,
                  <>Cliquer régulièrement sur <strong>« Enregistrer le brouillon »</strong> : vous pouvez fermer la page et reprendre plus tard, rien n'est envoyé.</>,
                  <>Cliquer sur <strong>« Vérifier la cohérence »</strong> : l'outil liste les rubriques oubliées. Les corriger.</>,
                  <>Cliquer sur <strong>« Valider le compte rendu »</strong>. L'EP passe à « Réalisé ». Passer à l'étape 5.</>,
                ]} />
              </Cas>

              <Cas code="Méthode 2" title="Je préfère écrire à la main sur le CREP papier" color="#d97706" icon={<PenLine size={14} color="#d97706" />}>
                C'est autorisé : le papier reste un document officiel. <strong>Mais l'outil doit quand même savoir que l'entretien est réalisé.</strong> Déroulé :
                <Gestes items={[
                  <>Avant l'entretien : <strong>imprimer le CREP vierge</strong> (icône imprimante). L'agent en a aussi reçu un par e-mail s'il a une adresse.</>,
                  <>Pendant l'entretien : écrire à la main, comme avant.</>,
                  <>Après : ouvrir « Saisir l'EP » et, au choix :
                    <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                      <li><strong>Option rapide :</strong> cliquer sur <strong>« Importer un compte rendu papier (scan) »</strong>, choisir le scan. L'outil lit l'écriture et <strong>propose</strong> un texte. <strong>Relisez et corrigez</strong> : il peut se tromper. Puis « Appliquer au formulaire ».</li>
                      <li><strong>Option sûre :</strong> recopier vous-même les rubriques dans l'outil.</li>
                    </ul>
                  </>,
                  <>Cliquer sur <strong>« Valider le compte rendu »</strong> (toutes les rubriques obligatoires doivent être remplies).</>,
                  <>Passer à l'étape 5, <strong>circuit papier</strong> : le scan de votre CREP signé sera archivé comme document officiel.</>,
                ]} />
              </Cas>
              <Callout tone="warn" title="Pourquoi doit-on valider dans l'outil même si on écrit à la main ?">
                Tant que le compte rendu n'est pas validé, l'EP n'est pas « Réalisé » : les boutons d'archivage restent fermés, et l'EP apparaît « en retard » dans les statistiques de la Direction.
              </Callout>
            </Section>

            <Section icon={<Send size={15} color={COLORS.primary} />} title="Étape 5 — Signature : électronique ou papier">
              <div style={{ marginBottom: 8 }}>L'outil ne vous propose le circuit électronique <strong>que si</strong> l'agent et vous avez une adresse e-mail <strong>et</strong> que la signature électronique est ouverte pour cet agent. Sinon, seul le circuit papier est proposé.</div>

              <Cas code="Circuit électronique" title="Cas A — tout le monde a un e-mail et la signature électronique est ouverte" color="#16a34a" icon={<Send size={14} color="#16a34a" />}>
                <Gestes items={[
                  <>Cliquer sur <strong>« Envoyer à l'agent »</strong>.</>,
                  <>L'agent reçoit un e-mail : il <strong>relit</strong> le compte rendu, remplit <strong>ses deux cases</strong> (observations sur les conditions de travail, observations sur l'entretien, « Néant » si rien) puis clique sur <strong>« Valider et envoyer pour signature »</strong>.</>,
                  <>Le document part au <strong>parapheur</strong> : vous recevez, comme l'agent, un lien de signature par e-mail. Cliquez, signez.</>,
                  <>Quand les deux signatures sont faites, le PDF signé est <strong>archivé automatiquement</strong> (bouton « CREP signé »).</>,
                ]} />
                <Callout tone="info" title="Envoyé trop vite ?">
                  Tant que l'agent n'a pas validé, cliquez sur <strong>« Rappeler le compte rendu »</strong> : il revient chez vous, vous corrigez, puis vous le renvoyez.
                  Une fois l'agent ayant validé, il n'est plus possible de le rappeler.
                </Callout>
                <Callout tone="ok" title="L'agent tarde ?">
                  L'outil envoie des <strong>rappels automatiques</strong> à l'agent, et un récapitulatif à vous. Vous pouvez aussi le prévenir directement.
                </Callout>
              </Cas>

              <Cas code="Circuit papier" title="Cas B / C / D — pas d'e-mail, pas de signature électronique, ou CREP écrit à la main" color="#d97706" icon={<Printer size={14} color="#d97706" />}>
                <Gestes items={[
                  <>Si ce n'est pas déjà fait, cliquer sur <strong>« Valider le compte rendu »</strong> (étape 4).</>,
                  <>Cliquer sur <strong>« Imprimer / PDF (4 pages) »</strong> : le CREP rempli sort sur 4 pages.</>,
                  <>Faire <strong>signer l'agent et signer vous-même</strong> sur la page 4, puis garder l'original au dossier de l'agent selon vos règles internes.</>,
                  <>Scanner les <strong>4 pages</strong> (JPG, PNG, ou un seul PDF — 8 pages maximum).</>,
                  <>Cliquer sur <strong>« CREP manuscrit (4 pages scannées) »</strong>, sélectionner les fichiers, valider. L'outil fusionne et archive.</>,
                ]} />
                <Callout tone="ok">
                  Le statut passe à « Signé papier ». Le bouton « PDF signé » apparaît : le document est consultable par vous et les administrateurs. Pour remplacer un mauvais scan, utiliser « Remplacer le CREP manuscrit ».
                </Callout>
              </Cas>
              <Callout tone="warn" title="Blocages normaux à connaître">
                <ul style={{ margin: '2px 0 0 18px', padding: 0 }}>
                  <li>« Envoyé à l'agent » : impossible de téléverser un papier tant que vous n'avez pas <strong>rappelé</strong> le compte rendu.</li>
                  <li>« En signature » : il faut attendre la fin du parapheur (ou son annulation/refus) pour passer en papier.</li>
                  <li>« La signature électronique n'est pas activée pour cet agent » : ce n'est pas une panne, utilisez le circuit papier.</li>
                </ul>
              </Callout>
            </Section>

            <Section icon={<History size={15} color={COLORS.primary} />} title="Les statuts : que veulent-ils dire ?">
              <StatusSchema />
              <Shot src="/aide-ep/06-statuts.jpg" caption="Dans « Tous », les EP réalisés : statut « Réalisé », compte rendu « Validé », et le bouton « CREP signé » quand le papier est archivé" />
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>À planifier</strong> : aucune date fixée. Action : planifier.</div>
                <div><strong>Planifié</strong> : date fixée. Action : mener l'entretien, puis saisir le compte rendu.</div>
                <div><strong>Réalisé</strong> : compte rendu validé. Action : envoyer à l'agent, ou imprimer.</div>
                <div><strong>Envoyé à l'agent</strong> : l'agent doit relire et valider. Action : attendre (ou rappeler).</div>
                <div><strong>En signature</strong> : le parapheur attend les signatures. Action : signer de votre côté.</div>
                <div><strong>Signé / Signé papier</strong> : terminé et archivé. Aucune action.</div>
              </div>
            </Section>

            <Section icon={<CheckCircle2 size={15} color={COLORS.primary} />} title="Vos gestes, dans l'ordre">
              <div style={{ display: 'grid', gap: 3 }}>
                <div>1. Ouvrir MagApp → « Entretiens professionnels » → « EP que je réalise ».</div>
                <div>2. Vérifier mes agents (et repérer ceux sans e-mail).</div>
                <div>3. « Planifier » chaque entretien.</div>
                <div>4. Si l'agent n'a pas d'e-mail : le prévenir moi-même et lui remettre le CREP vierge imprimé.</div>
                <div>5. Le jour J : mener l'entretien.</div>
                <div>6. « Saisir l'EP » (ou importer mon papier), « Vérifier la cohérence ».</div>
                <div>7. « Valider le compte rendu ».</div>
                <div>8. « Envoyer à l'agent » (circuit électronique) <strong>ou</strong> « Imprimer » (circuit papier).</div>
                <div>9. Signer dans le parapheur <strong>ou</strong> scanner les 4 pages signées et cliquer « CREP manuscrit ».</div>
                <div>10. Vérifier que le bouton « CREP signé » / « PDF signé » apparaît : c'est terminé.</div>
              </div>
            </Section>

            <Section icon={<AlertTriangle size={15} color={COLORS.primary} />} title="Si quelque chose ne va pas">
              <div style={{ display: 'grid', gap: 6 }}>
                <div><strong>L'agent n'apparaît pas.</strong> Il n'est pas rattaché à vous : utilisez « Ajouter un agent » ou « Changer l'évaluateur » (étape 1). Si l'agent reste introuvable, prévenir l'administrateur.</div>
                <div><strong>L'agent dit n'avoir rien reçu.</strong> Vérifier son adresse e-mail. Si elle est vide : cas C (voir étape 2). Vérifier aussi ses courriers indésirables.</div>
                <div><strong>Je me suis trompé de date.</strong> « Modifier le RDV ». Ne pas recréer un EP.</div>
                <div><strong>Je n'ai pas le bouton « Envoyer à l'agent ».</strong> L'agent ou vous n'avez pas d'e-mail, ou la signature électronique n'est pas ouverte pour lui, ou le compte rendu n'est pas encore validé. Utiliser le circuit papier.</div>
                <div><strong>« Valider le compte rendu » est refusé.</strong> Il manque des rubriques : la liste s'affiche en orange. Les remplir.</div>
                <div><strong>J'ai envoyé à l'agent par erreur.</strong> « Rappeler le compte rendu », tant que l'agent n'a pas validé.</div>
                <div><strong>J'ai validé trop vite.</strong> Ne rien modifier ailleurs. Demander à l'administrateur la remise à zéro (RAZ), puis ressaisir.</div>
                <div><strong>Le CREP papier est perdu avant le scan.</strong> Réimprimer le CREP rempli depuis l'EP, refaire signer, puis scanner.</div>
                <div><strong>Je ne vois pas « Saisir l'EP ».</strong> Vérifier que vous êtes sur « EP que je réalise ». Si l'EP est déjà réalisé, le bouton devient « Ouvrir ».</div>
              </div>
            </Section>

            <Section icon={<Lock size={15} color={COLORS.primary} />} title="Ce que vous ne faites pas">
              <div style={{ display: 'grid', gap: 3 }}>
                <div>Ne pas utiliser le compte d'un collègue.</div>
                <div>Ne pas créer un agent vous-même : c'est le rôle de l'administrateur.</div>
                <div>Ne pas supprimer un EP : la RAZ est réservée aux administrateurs.</div>
                <div>Ne pas envoyer le CREP par un autre canal que l'outil (mail personnel, clé USB…).</div>
              </div>
            </Section>

            <Section icon={<BookOpen size={15} color={COLORS.primary} />} title="Lexique simple">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>EP</strong> : entretien professionnel.</div>
                <div><strong>CREP</strong> : compte rendu d'entretien professionnel, le document officiel de 4 pages.</div>
                <div><strong>Valideur / évaluateur</strong> : la personne qui conduit l'entretien (vous). Les deux mots désignent la même chose dans l'outil.</div>
                <div><strong>MagApp</strong> : le « magasin d'applications » de la Ville, où se trouve la tuile « Entretiens professionnels ».</div>
                <div><strong>Parapheur</strong> : l'outil de signature électronique. Chaque signataire reçoit un lien par e-mail.</div>
                <div><strong>Circuit électronique / circuit papier</strong> : les deux manières de signer. Le document final est le même.</div>
                <div><strong>AD</strong> : Active Directory, l'annuaire des comptes et des e-mails.</div>
                <div><strong>RAZ</strong> : remise à zéro d'un EP par un administrateur.</div>
              </div>
            </Section>

            {features?.prep && (
              <Section icon={<FileSignature size={15} color={COLORS.primary} />} title="Préparation de l'agent">
                L'agent peut préparer son entretien dans « Mon entretien » si l'administrateur a ouvert cet accès. Vous lisez sa préparation dans l'EP.
                Vous pouvez aussi lui remettre le CREP vierge papier : le document final sera identique.
              </Section>
            )}
            {(features?.aiDraft || features?.aiReview || features?.esign) && (
              <Section icon={<Sparkles size={15} color={COLORS.primary} />} title="Aide IA et signature électronique">
                {features.aiDraft && <>Le bouton « Rédiger avec l'IA » est ouvert par l'administrateur à certains valideurs. Il propose un texte, que vous devez toujours relire. </>}
                {features.aiReview && <>La relecture IA des compétences est ouverte à certains valideurs. Elle signale des formulations, elle ne décide pas à votre place. </>}
                {features.esign && <>La signature électronique est ouverte agent par agent. Si elle n'est pas active pour un agent, passez par le circuit papier : le résultat est le même.</>}
              </Section>
            )}
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

            <Section icon={<Send size={15} color={COLORS.primary} />} title="Signature électronique : qui y a droit ?">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>Désactivée</strong> : tous les agents passent par le circuit papier (impression, signature, scan).</div>
                <div><strong>Activée pour tous</strong> (« Réactiver pour tous ») : tout agent <em>avec e-mail</em> peut signer en ligne.</div>
                <div><strong>Activée pour une sélection</strong> : seuls les agents cochés. Pour les autres, le valideur voit « signature non activée pour cet agent » et suit le circuit papier.</div>
                <div>Dans tous les cas, <strong>un agent sans e-mail reste au circuit papier</strong>, même si la signature est ouverte.</div>
              </div>
              <Callout tone="info">Le document final est identique dans les deux circuits : ce choix ne crée aucune différence de traitement entre agents.</Callout>
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
                <div><strong>Mon entretien</strong> : accès de l'agent à sa préparation et à son CREP.</div>
                <div><strong>Signature électronique</strong> : ouverte agent par agent.</div>
                <div><strong>IA</strong> : rédaction et relecture, ouvertes à certains valideurs.</div>
                <div><strong>Réactiver pour tous</strong> ouvre à tout le monde ; <strong>Activer pour la sélection</strong> réserve aux personnes cochées.</div>
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
