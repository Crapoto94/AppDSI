import { useState } from 'react';
import {
  X, BookOpen, UserCheck, ShieldCheck, Sparkles, Users, CalendarClock,
  FileSignature, History, MousePointerClick, CheckCircle2, AlertTriangle, ScanLine,
  Send, Lock, Database, RotateCcw, HelpCircle,
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
        Il indique qui valide qui : directeur, DGA, DG ou sous-valideur. C'est la base de tout le module.
      </Step>
      <Step n={2} title="Le valideur retrouve ses agents" who="Valideur">
        Dans « EP de mon équipe » ou « Mes agents », il vérifie que la liste correspond à son service. Si un agent manque, il contacte l'administrateur.
      </Step>
      <Step n={3} title="Le valideur convoque l'agent" who="Valideur">
        Il choisit la date, l'heure, la durée et le lieu. L'outil envoie l'invitation Outlook et un e-mail avec le CREP vierge en pièce jointe.
      </Step>
      <Step n={4} title="Le jour J, le valideur saisit l'EP" who="Valideur">
        Bouton « Saisir l'EP » : préparation de l'agent, compte rendu, objectifs, formations, appréciation générale.
      </Step>
      <Step n={5} title="Le valideur valide et transmet" who="Valideur">
        Il vérifie la cohérence, valide, puis envoie le CREP à l'agent (signature électronique) ou l'imprime pour signature papier.
      </Step>
      <Step n={6} title="Le CREP signé est archivé" who="Valideur / Agent">
        Au retour du papier, le valideur scanne les 4 pages et les téléverse. Le CREP signé reste consultable dans l'EP.
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
        {box('Onglet « EP que je réalise »', 'Vos entretiens à faire', '#bfdbfe')}
        {box('Onglet « EP de mon équipe »', 'Les agents que vous validez', '#bbf7d0')}
        {box('Onglet « Mes agents »', 'La liste de vos agents', '#fde68a')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 }}>
        {box('Bouton « Planifier »', 'Fixer le rendez-vous')}
        {box('Bouton « Saisir l’EP »', 'Remplir le compte rendu')}
        {box('Bouton « Imprimer »', 'Sortir le CREP papier')}
        {box('Bouton « CREP manuscrit »', 'Archiver les 4 pages scannées')}
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
        <Chip label="Réalisé" color="#166534" bg="#dcfce7" /><Arrow />
        <Chip label="CREP envoyé" color="#6b21a8" bg="#f3e8ff" /><Arrow />
        <Chip label="Signé / archivé" color="#065f46" bg="#d1fae5" />
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 6 }}>
        « À planifier » ne veut pas dire « en retard ». Tant que la date n'est pas fixée, l'EP attend simplement votre action.
      </div>
    </div>
  );
}

export interface AideFeatures { prep?: boolean; aiDraft?: boolean; aiReview?: boolean; esign?: boolean }

export default function Aide({ onClose, isAdmin, features }: { onClose: () => void; isAdmin?: boolean; features?: AideFeatures }) {
  const [tab, setTab] = useState<'evaluateur' | 'admin'>(isAdmin ? 'admin' : 'evaluateur');
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
        </div>

        {tab === 'evaluateur' ? (
          <>
            <Callout tone="ok" title="Pas besoin d'être à l'aise avec l'informatique">
              Cette page vous tient la main. Faites les étapes dans l'ordre, sans en sauter. Si un écran ne ressemble pas à ce qui est décrit,
              ne cherchez pas au hasard : appelez l'administrateur du module ou la DSI.
            </Callout>

            <Section icon={<MousePointerClick size={15} color={COLORS.primary} />} title="Le processus en un coup d'œil">
              <ProcessSchema />
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Retenez surtout ceci : <strong>vous convoquez</strong>, <strong>vous saisissez</strong>, <strong>vous validez</strong>, puis <strong>vous archivez le retour signé</strong>.
              </div>
            </Section>

            <Section icon={<Users size={15} color={COLORS.primary} />} title="Où cliquer dans MagApp ?">
              <ScreenMap />
              <Callout tone="warn" title="Ne pas confondre les deux espaces">
                <strong>« EP que je réalise »</strong> = les entretiens dont vous êtes l'évaluateur (vous les remplissez).
                <strong> « EP de mon équipe »</strong> = la vue de contrôle de vos agents (souvent en lecture seule).
              </Callout>
            </Section>

            <Section icon={<CheckCircle2 size={15} color={COLORS.primary} />} title="Avant de commencer : 3 vérifications">
              <div style={{ display: 'grid', gap: 6 }}>
                <div><strong>1.</strong> Je suis bien connecté avec <strong>mon compte personnel</strong>, pas celui d'un collègue.</div>
                <div><strong>2.</strong> Je vois le bon nombre d'agents dans « EP de mon équipe » ou « Mes agents ».</div>
                <div><strong>3.</strong> Les agents que je dois évaluer ont bien une adresse e-mail. Sinon, je le signale à l'administrateur.</div>
              </div>
            </Section>

            <Section icon={<CalendarClock size={15} color={COLORS.primary} />} title="Étape 1 — Se connecter et ouvrir le module">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>1.</strong> Ouvrir MagApp et se connecter avec son identifiant habituel.</div>
                <div><strong>2.</strong> Cliquer sur la tuile <strong>« Entretiens professionnels »</strong>.</div>
                <div><strong>3.</strong> Cliquer sur l'onglet <strong>« EP que je réalise »</strong>.</div>
                <div><strong>4.</strong> Si la liste est vide alors que vous avez des agents, passer à l'étape 2.</div>
              </div>
            </Section>

            <Section icon={<Users size={15} color={COLORS.primary} />} title="Étape 2 — Vérifier ses agents (à faire une fois au début)">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>1.</strong> Ouvrir <strong>« EP de mon équipe »</strong> ou <strong>« Mes agents »</strong>.</div>
                <div><strong>2.</strong> Vérifier que chaque agent de votre service apparaît une seule fois.</div>
                <div><strong>3.</strong> Vérifier que le nom du valideur affiché est bien le vôtre.</div>
                <div><strong>4.</strong> Si un agent manque, ou si le valideur est faux : <strong>ne rien saisir vous-même</strong>, prévenir l'administrateur du module.</div>
              </div>
              <Callout tone="info">
                Un agent = un seul valideur. C'est cette règle qui permet ensuite d'automatiser les relances, les statistiques et les demandes de formation.
              </Callout>
            </Section>

            <Section icon={<CalendarClock size={15} color={COLORS.primary} />} title="Étape 3 — Convoquer l'agent (planifier le rendez-vous)">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>1.</strong> Dans « EP que je réalise », repérer la ligne de l'agent.</div>
                <div><strong>2.</strong> Cliquer sur <strong>« Planifier »</strong> (ou « Modifier le RDV » si une date existe déjà).</div>
                <div><strong>3.</strong> Choisir la <strong>date</strong>, l'<strong>heure</strong>, la <strong>durée</strong> (1 h 30 par défaut) et le <strong>lieu</strong>.</div>
                <div><strong>4.</strong> Pour être aidé : cliquer sur <strong>« Prochains créneaux libres »</strong>. L'outil regarde les agendas de l'agent et le vôtre, puis propose des créneaux communs.</div>
                <div><strong>5.</strong> Cliquer sur un créneau proposé, puis <strong>valider</strong>.</div>
                <div><strong>6.</strong> L'outil envoie l'invitation Outlook et un e-mail à l'agent, avec le <strong>CREP vierge en pièce jointe</strong>.</div>
              </div>
              <Callout tone="warn" title="Si l'agent n'a pas d'e-mail">
                L'invitation et le mail ne partiront pas. Prévenez l'administrateur pour rattacher le compte AD, ou remettez le CREP vierge en main propre.
              </Callout>
              <div style={{ fontSize: 12, color: '#64748b' }}>
                Pour déplacer un rendez-vous : rouvrir « Modifier le RDV ». L'invitation Outlook et l'e-mail sont mis à jour. Un avertissement s'affiche si le rendez-vous est à moins de 8 jours.
              </div>
            </Section>

            <Section icon={<FileSignature size={15} color={COLORS.primary} />} title="Étape 4 — Le jour J : saisir l'EP">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>1.</strong> Ouvrir « EP que je réalise » et cliquer sur <strong>« Saisir l'EP »</strong> sur la ligne de l'agent.</div>
                <div><strong>2.</strong> Lire la <strong>préparation de l'agent</strong> (ce qu'il a écrit avant l'entretien). Elle est là pour nourrir l'échange, pas pour être recopiée.</div>
                <div><strong>3.</strong> Remplir le <strong>compte rendu</strong> : bilan, difficultés, compétences, perspectives.</div>
                <div><strong>4.</strong> Renseigner les <strong>objectifs</strong> et les <strong>formations</strong> demandées.</div>
                <div><strong>5.</strong> Rédiger l'<strong>appréciation générale</strong>.</div>
                <div><strong>6.</strong> Cliquer sur <strong>« Vérifier la cohérence »</strong> : l'outil signale les oublis. Corriger, puis valider.</div>
              </div>
              <Callout tone="ok">
                Vous pouvez enregistrer en brouillon et reprendre plus tard. Rien n'est envoyé à l'agent tant que vous n'avez pas validé.
              </Callout>
            </Section>

            <Section icon={<Send size={15} color={COLORS.primary} />} title="Étape 5 — Valider, imprimer ou envoyer">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>1.</strong> Vérifier une dernière fois le nom de l'agent, la date et l'appréciation générale.</div>
                <div><strong>2.</strong> Cliquer sur <strong>« Valider »</strong>.</div>
                <div><strong>3.</strong> Deux possibilités :
                  <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                    <li><strong>Signature électronique activée</strong> : cliquer sur « Envoyer à l'agent ». Il valide, puis signe dans le parapheur.</li>
                    <li><strong>Signature papier</strong> : cliquer sur « Imprimer », faire signer l'agent, puis archiver le scan (étape 6).</li>
                  </ul>
                </div>
                <div><strong>4.</strong> Noter la <strong>date limite de retour</strong> indiquée dans le mail ou sur la campagne.</div>
              </div>
              <Callout tone="warn" title="Si la signature électronique n'est pas activée">
                Ce n'est pas une erreur. Imprimez le CREP, faites-le signer, puis téléversez les 4 pages avec « CREP manuscrit ». Le document produit est le même.
              </Callout>
            </Section>

            <Section icon={<ScanLine size={15} color={COLORS.primary} />} title="Étape 6 — Retour du CREP papier et archivage">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>1.</strong> Au retour du CREP signé, scanner les <strong>4 pages</strong> (ou faire un PDF unique).</div>
                <div><strong>2.</strong> Rouvrir l'EP et aller dans le CREP.</div>
                <div><strong>3.</strong> Cliquer sur <strong>« CREP manuscrit (4 pages scannées) »</strong>.</div>
                <div><strong>4.</strong> Sélectionner les 4 images (JPG/PNG) ou le PDF, puis confirmer. L'outil fusionne et archive le document.</div>
                <div><strong>5.</strong> Si le contenu manuscrit doit être recopié dans l'outil, utiliser d'abord <strong>« Importer un compte rendu papier (scan) »</strong>, corriger les champs proposés, valider, puis archiver le scan.</div>
              </div>
              <Callout tone="ok">
                Une fois archivé, le CREP signé est consultable par le valideur et les administrateurs. Il ne disparaît pas.
              </Callout>
            </Section>

            <Section icon={<History size={15} color={COLORS.primary} />} title="Les statuts : que veulent-ils dire ?">
              <StatusSchema />
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>À planifier</strong> : aucune date fixée. Action : planifier.</div>
                <div><strong>Planifié</strong> : la date est fixée, l'agent a reçu l'invitation. Action : préparer l'entretien.</div>
                <div><strong>Réalisé</strong> : l'entretien a eu lieu et le CREP est validé. Action : faire signer / archiver.</div>
                <div><strong>CREP envoyé</strong> : l'agent doit valider et signer. Action : suivre le retour.</div>
                <div><strong>Signé / archivé</strong> : le CREP signé est disponible. Action : aucune, sauf correction demandée.</div>
              </div>
            </Section>

            <Section icon={<CheckCircle2 size={15} color={COLORS.primary} />} title="Vos 10 gestes, dans l'ordre">
              <div style={{ display: 'grid', gap: 3 }}>
                <div>1. Me connecter à MagApp.</div>
                <div>2. Ouvrir « Entretiens professionnels ».</div>
                <div>3. Vérifier mes agents.</div>
                <div>4. Planifier chaque entretien.</div>
                <div>5. Vérifier que l'agent a reçu le mail.</div>
                <div>6. Le jour J, cliquer sur « Saisir l'EP ».</div>
                <div>7. Remplir et vérifier la cohérence.</div>
                <div>8. Valider et envoyer (ou imprimer).</div>
                <div>9. Au retour, scanner les 4 pages.</div>
                <div>10. Téléverser le CREP manuscrit.</div>
              </div>
            </Section>

            <Section icon={<AlertTriangle size={15} color={COLORS.primary} />} title="Si quelque chose ne va pas">
              <div style={{ display: 'grid', gap: 6 }}>
                <div><strong>L'agent n'apparaît pas.</strong> Vérifier qu'il est bien rattaché à vous. Sinon, prévenir l'administrateur.</div>
                <div><strong>L'agent n'a pas reçu le mail.</strong> Vérifier son adresse e-mail dans la fiche. Si elle est vide ou en doublon, l'administrateur peut l'enlever et la rattacher.</div>
                <div><strong>Je me suis trompé de date.</strong> Rouvrir « Modifier le RDV ». Ne pas recréer un EP.</div>
                <div><strong>J'ai validé trop vite.</strong> Ne pas modifier à la main dans la base. Demander à l'administrateur d'utiliser la RAZ, puis ressaisir.</div>
                <div><strong>Le CREP papier est perdu.</strong> Réimprimer un CREP renseigné depuis l'EP, faire resigner, puis archiver.</div>
                <div><strong>Je ne vois pas le bouton « Saisir l'EP ».</strong> Vérifier que vous êtes sur « EP que je réalise » et que l'EP n'est pas déjà réalisé.</div>
              </div>
            </Section>

            <Section icon={<Lock size={15} color={COLORS.primary} />} title="Ce que vous ne faites pas">
              <div style={{ display: 'grid', gap: 3 }}>
                <div>Ne pas utiliser le compte d'un collègue.</div>
                <div>Ne pas créer un agent vous-même : c'est le rôle de l'administrateur.</div>
                <div>Ne pas supprimer un EP : utiliser la RAZ uniquement si l'administrateur vous le demande.</div>
                <div>Ne pas envoyer de document confidentiel par un autre canal que l'outil.</div>
              </div>
            </Section>

            <Section icon={<BookOpen size={15} color={COLORS.primary} />} title="Lexique simple">
              <div style={{ display: 'grid', gap: 4 }}>
                <div><strong>EP</strong> : entretien professionnel.</div>
                <div><strong>CREP</strong> : compte rendu d'entretien professionnel, le document officiel.</div>
                <div><strong>Valideur</strong> : la personne qui conduit et valide l'EP (vous).</div>
                <div><strong>Évaluateur</strong> : synonyme de valideur dans l'outil.</div>
                <div><strong>AD</strong> : Active Directory, l'annuaire des comptes et des e-mails.</div>
                <div><strong>Parapheur</strong> : l'outil de signature électronique.</div>
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
                {features.esign && <>La signature électronique est ouverte agent par agent. Si elle n'est pas active, imprimez et archivez le CREP manuscrit : le résultat est le même.</>}
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
                <div>En cas de doublon d'adresse e-mail : ouvrir <strong>« Changer (AD) »</strong>, cliquer <strong>« Enlever l'adresse e-mail »</strong>, puis rattacher le bon compte.</div>
                <div>Les filtres permettent de cibler par catégorie, direction, service, grade, modèle, statut e-mail ou valideur.</div>
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
          </>
        )}
      </div>
    </div>
  );
}
