import { useState } from 'react';
import { X, BookOpen, UserCheck, ShieldCheck, Sparkles, Printer, Users, CalendarClock, FileSignature, History } from 'lucide-react';
import { COLORS, card, btnGhost, btnPrimary } from './ui';

const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <div style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '12px 14px', marginBottom: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 800, color: COLORS.text, marginBottom: 6 }}>{icon}{title}</div>
    <div style={{ fontSize: 12.5, lineHeight: 1.6, color: '#475569' }}>{children}</div>
  </div>
);

export default function Aide({ onClose, isAdmin }: { onClose: () => void; isAdmin?: boolean }) {
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
          <button style={tab === 'evaluateur' ? btnPrimary : btnGhost} onClick={() => setTab('evaluateur')}><UserCheck size={14} /> Évaluateur / valideur</button>
          {isAdmin && <button style={tab === 'admin' ? btnPrimary : btnGhost} onClick={() => setTab('admin')}><ShieldCheck size={14} /> Administrateur</button>}
        </div>
        {tab === 'evaluateur' ? (
          <>
            <Section icon={<CalendarClock size={15} color={COLORS.primary} />} title="Planifier un entretien">Ouvrez un EP puis « Planifier » : date, durée, lieu. L’agent reçoit l’invitation et le mail de préparation.</Section>
            <Section icon={<Users size={15} color={COLORS.primary} />} title="Ajouter un agent / changer d’évaluateur">« Ajouter un agent » liste les agents sans évaluateur dans votre périmètre. L’icône « Changer l’évaluateur » permet de corriger une erreur ; toutes les actions sont tracées dans le journal.</Section>
            <Section icon={<Printer size={15} color={COLORS.primary} />} title="Imprimer les CREP / EP">Cochez les agents puis « Imprimer CREP vierges » ou « Imprimer CREP renseignés ». L’icône imprimante imprime une seule ligne. Le filtre valideur permet de cibler une équipe.</Section>
            <Section icon={<FileSignature size={15} color={COLORS.primary} />} title="Préparation et compte rendu">L’agent prépare son entretien dans « Mon entretien ». Vous complétez le CREP, la grille et l’appréciation générale, puis vous validez.</Section>
            <Section icon={<Sparkles size={15} color={COLORS.primary} />} title="IA et signature électronique">Les fonctions IA et la signature électronique sont ouvertes par l’administrateur, pour certains évaluateurs ou agents. À défaut, imprimez et téléversez le PDF signé.</Section>
          </>
        ) : (
          <>
            <Section icon={<ShieldCheck size={15} color={COLORS.primary} />} title="Campagnes, valideurs, base agents">L’onglet Paramétrage gère les campagnes, les administrateurs et la base des agents à évaluer. Pilotage donne la vue globale.</Section>
            <Section icon={<Users size={15} color={COLORS.primary} />} title="Droits">Paramétrez séparément « Mon entretien », la signature électronique et les fonctions IA. « Réactiver pour tous » ouvre à tout le monde ; « Activer pour la sélection » réserve aux personnes cochées.</Section>
            <Section icon={<Printer size={15} color={COLORS.primary} />} title="Impression et journal">Les valideurs impriment les CREP vierges ou renseignés. L’onglet Journal liste les ajouts, changements d’évaluateur, préparations et validations.</Section>
            <Section icon={<History size={15} color={COLORS.primary} />} title="En cas d’erreur">Consultez le Journal pour savoir qui a fait quoi et quand.</Section>
          </>
        )}
      </div>
    </div>
  );
}
