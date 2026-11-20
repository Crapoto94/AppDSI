import { useState } from 'react';
import { X, BookOpen, UserCheck, ShieldCheck, Sparkles, Printer, Users, CalendarClock, FileSignature, History } from 'lucide-react';
import { COLORS, card, btnGhost, btnPrimary } from './ui';

const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>{icon}{title}</div>
    <div style={{ fontSize: 12.5, lineHeight: 1.6, color: '#475569' }}>{children}</div>
  </div>
);

export interface AideFeatures { prep?: boolean; aiDraft?: boolean; aiReview?: boolean; esign?: boolean }

export default function AideEp({ onClose, isAdmin, features }: { onClose: () => void; isAdmin?: boolean; features?: AideFeatures }) {
  const [tab, setTab] = useState<'evaluateur' | 'admin'>(isAdmin ? 'admin' : 'evaluateur');
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 2100, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...card, width: '100%', maxWidth: 860, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 18, fontWeight: 800, color: COLORS.text }}>
            <BookOpen size={20} color={COLORS.primary} /> Aide — Entretiens professionnels
          </div>
          <button style={btnGhost} onClick={onClose}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          <button style={tab === 'evaluateur' ? btnPrimary : btnGhost} onClick={() => setTab('evaluateur')}>
            <UserCheck size={14} /> Évaluateur / valideur
          </button>
          {isAdmin && (
            <button style={tab === 'admin' ? btnPrimary : btnGhost} onClick={() => setTab('admin')}>
              <ShieldCheck size={14} /> Administrateur
            </button>
          )}
        </div>

        {tab === 'evaluateur' ? (
          <>
            <Section icon={<CalendarClock size={15} color={COLORS.primary} />} title="Planifier un entretien">
              Ouvrez un EP puis « Planifier » : choisissez la date, la durée et le lieu. L’agent reçoit une invitation et un e-mail de préparation.
              Vous pouvez aussi utiliser « Modifier le RDV » pour déplacer l’entretien. Un avertissement s’affiche si le rendez-vous est à moins de 8 jours.
            </Section>
            <Section icon={<CalendarClock size={15} color={COLORS.primary} />} title="Rechercher un créneau libre">
              Dans la fenêtre de planification, cliquez sur <strong>« Prochains créneaux libres »</strong> : l’outil interroge les agendas de l’agent et de l’évaluateur et propose les 5 prochains créneaux communs.
              Options disponibles : <strong>Hors heures ouvrées</strong> (8h–19h), <strong>Les deux libres uniquement</strong> (sinon les créneaux partiellement libres sont signalés),
              et l’horizon de recherche (1 mois, 2, 3, 6 mois ou 1 an). Le bouton <strong>« + 5 créneaux suivants »</strong> poursuit la recherche.
              Chaque créneau indique le nombre de disponibles (x/y) et les indisponibles ; cliquez sur un créneau pour remplir la date, puis validez pour envoyer l’invitation Outlook et l’e-mail de préparation.
            </Section>
            <Section icon={<Users size={15} color={COLORS.primary} />} title="Ajouter un agent / changer d’évaluateur">
              Dans « EP que je réalise », le bouton « Ajouter un agent » liste les agents sans évaluateur dans votre périmètre.
              Pour corriger une erreur, utilisez l’icône <strong>Changer l’évaluateur</strong> sur la ligne de l’agent : les évaluateurs proposés sont ceux de sa direction.
              Toutes ces actions sont enregistrées dans le journal visible par les administrateurs.
            </Section>
            <Section icon={<Printer size={15} color={COLORS.primary} />} title="Imprimer les CREP / EP">
              Cochez un ou plusieurs agents puis utilisez « Imprimer CREP vierges » (formulaire à remplir à la main) ou « Imprimer CREP renseignés ».
              L’icône imprimante sur une ligne imprime ce seul CREP. En mode « EP de mon équipe », le filtre « valideur » permet de cibler un valideur puis d’imprimer sa sélection en une fois.
            </Section>
            {features?.prep && (
              <Section icon={<FileSignature size={15} color={COLORS.primary} />} title="Préparation et compte rendu">
                L’agent prépare son entretien dans « Mon entretien » (si l’accès est ouvert par un administrateur). Vous complétez ensuite le CREP :
                grille d’appréciation, objectifs, formations, appréciation générale. « Vérifier la cohérence » signale les oublis avant validation.
              </Section>
            )}
            {(features?.aiDraft || features?.aiReview || features?.esign) && (
              <Section icon={<Sparkles size={15} color={COLORS.primary} />} title="Aide IA et signature électronique">
                {features.aiDraft && <>Le bouton « Rédiger avec l’IA » est ouvert par l’administrateur à certains évaluateurs. </>}
                {features.aiReview && <>La relecture IA des compétences est ouverte par l’administrateur à certains évaluateurs. </>}
                {features.esign && <>La signature électronique est ouverte agent par agent ; à défaut, imprimez le CREP, faites-le signer et téléversez le PDF signé.</>}
              </Section>
            )}
          </>
        ) : (
          <>
            <Section icon={<ShieldCheck size={15} color={COLORS.primary} />} title="Campagnes, valideurs et base agents">
              L’onglet « Paramétrage » permet de créer les campagnes, de désigner les administrateurs et d’importer la base des agents à évaluer.
              L’onglet « Mes agents » / « Valideurs » gère les rattachements ; « Pilotage » donne la vue globale paginée.
            </Section>
            <Section icon={<Users size={15} color={COLORS.primary} />} title="Base des agents à évaluer">
              Importez le classeur « Outil CREP DSI » : l’onglet <strong>Base_agents</strong> fournit les agents à évaluer, les onglets <strong>Template_*</strong> les modèles de CREP.
              Le rapprochement AD recherche l’adresse e-mail par matricule puis par nom/prénom ; une association manuelle est possible en cas d’échec.
              Les filtres permettent de cibler par catégorie A/B/C, direction, service, grade, modèle, statut e-mail ou valideur. La vue hiérarchie affiche chaque agent sous son valideur et permet de changer ce valideur.
            </Section>
            <Section icon={<Users size={15} color={COLORS.primary} />} title="Droits des évaluateurs et des agents">
              Paramétrez séparément l’accès à « Mon entretien », la signature électronique du CREP et les deux fonctions IA.
              « Réactiver pour tous » ouvre la fonction à tout le monde ; « Activer pour la sélection » la réserve aux personnes cochées.
            </Section>
            <Section icon={<Printer size={15} color={COLORS.primary} />} title="Impression et journal">
              Les valideurs peuvent imprimer les CREP vierges ou renseignés de leurs agents, individuellement ou en masse (sélection puis « Imprimer CREP… », ou icône imprimante sur une ligne).
              Le menu <strong>Journal</strong> liste toutes les opérations : ajouts d’agents, changements d’évaluateur, préparations, validations de CREP et impressions.
              Filtrez par <strong>type d’opération</strong>, <strong>date</strong>, <strong>utilisateur</strong> ou <strong>agent/détail</strong>, puis paginez les résultats (25, 50, 100 ou 200 par page).
              Toutes les opérations sont conservées.
            </Section>
            <Section icon={<History size={15} color={COLORS.primary} />} title="Bon réflexe en cas d’erreur">
              Consultez le Journal pour identifier qui a fait quoi et quand. Le changement d’évaluateur est lui aussi tracé avec l’ancien et le nouveau nom.
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
