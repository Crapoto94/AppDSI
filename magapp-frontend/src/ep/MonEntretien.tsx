import React, { useEffect, useState } from 'react';
import {
  CalendarDays, Clock, MapPin, UserCheck, ExternalLink, ClipboardList,
  CheckCircle2, AlertCircle, Sparkles, Target, TrendingUp, FileSignature,
} from 'lucide-react';
import type { Entretien, MeData } from './types';
import { PREP_STATUTS, STATUTS, formatDateFr, formatDateHeure, nomComplet, preparationProgress } from './types';
import PreparationForm from './PreparationForm';
import PreparationView from './PreparationView';
import { Avatar, Badge, COLORS, EmptyState, ProgressBar, card } from './ui';
import { RichTextView } from './RichTextView';
import CrepForm from './CrepForm';

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
      <div style={{ color: COLORS.primary, marginTop: 1 }}>{icon}</div>
      <div>
        <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.04em', color: '#94a3b8', fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 13, color: '#334155', fontWeight: 600, marginTop: 1 }}>{value}</div>
      </div>
    </div>
  );
}

export default function MonEntretien({ data, onChanged }: { data: MeData; onChanged: () => void }) {
  const [entretien, setEntretien] = useState<Entretien | null>(data.entretien);

  useEffect(() => { setEntretien(data.entretien); }, [data.entretien]);

  if (!data.campaign?.['id']) {
    return (
      <EmptyState
        icon={<CalendarDays size={42} />}
        title="Aucune campagne d'entretiens professionnels en cours"
        text="La campagne annuelle n’a pas encore été ouverte. Vous serez informé dès que votre entretien sera programmé."
      />
    );
  }

  if (!entretien) {
    return (
      <div>
        <div style={{ ...card, padding: 22, marginBottom: 16, background: '#ffffff' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, background: '#eef2ff', color: COLORS.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarDays size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COLORS.text }}>Votre entretien n’est pas encore programmé</h2>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: COLORS.muted }}>
                Campagne {data.campaign.annee}{data.campaign.libelle && data.campaign.libelle !== `Campagne ${data.campaign.annee}` ? ` — ${data.campaign.libelle}` : ''}
              </p>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
            Votre responsable ou l’administration du module doit renseigner la date, l’heure et l’évaluateur de votre entretien.
            Dès que l’entretien sera planifié, vous recevrez une invitation dans votre calendrier Outlook et cette page
            affichera votre fiche de préparation.
          </p>
        </div>

        <div style={{ ...card, padding: 18 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, fontSize: 14, color: COLORS.text, marginBottom: 8 }}>
            <Sparkles size={16} color={COLORS.primary} /> En quoi consiste la préparation ?
          </div>
          <p style={{ margin: 0, fontSize: 13, color: '#475569', lineHeight: 1.65 }}>
            Avant votre entretien, vous compléterez une fiche de préparation : bilan de réalisation des objectifs,
            réalisations marquantes, difficultés et pistes d’amélioration, développement des compétences et besoins
            de formation, puis perspectives professionnelles. Cet exercice n’est pas une auto-évaluation définitive :
            il sert à préparer un échange constructif et factuel avec votre responsable.
          </p>
          {data.campaign.instructions && (
            <div style={{ marginTop: 12, background: '#f8fafc', border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: '10px 12px', fontSize: 12.5, color: '#475569' }}>
              <RichTextView html={data.campaign.instructions} style={{ maxHeight: 160, overflowY: 'auto', paddingRight: 6 }} />
            </div>
          )}
        </div>
      </div>
    );
  }

  const statut = STATUTS[entretien.statut] || STATUTS.a_planifier;
  const prep = PREP_STATUTS[entretien.preparation_statut] || PREP_STATUTS.non_commencee;
  const progress = preparationProgress(entretien);
  const editable = entretien.access?.canEditPreparation ?? false;
  const crepActive = entretien.crep_statut === 'envoye_agent' || entretien.crep_statut === 'en_signature';
  const hasCompteRendu = !!(entretien.synthese || entretien.appreciation_generale || entretien.objectifs_suivants);

  return (
    <div>
      {/* Synthèse */}
      <div style={{ ...card, padding: 20, marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Avatar name={nomComplet(entretien)} size={46} />
            <div>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: COLORS.text }}>{nomComplet(entretien)}</h2>
              <div style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 2 }}>
                {[entretien.poste, entretien.service, entretien.direction].filter(Boolean).join(' · ') || 'Service non renseigné'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Badge {...statut} />
            <Badge {...prep} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginTop: 18 }}>
          <Info icon={<CalendarDays size={16} />} label="Date de l'entretien"
            value={entretien.date_entretien ? formatDateHeure(entretien.date_entretien) : 'À définir'} />
          <Info icon={<Clock size={16} />} label="Durée" value={`${entretien.duree_minutes || 120} minutes`} />
          <Info icon={<MapPin size={16} />} label="Lieu" value={entretien.lieu || 'À préciser'} />
          <Info icon={<UserCheck size={16} />} label="Évaluateur"
            value={entretien.evaluator_nom || entretien.evaluator_email || 'À définir'} />
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 280px', minWidth: 200 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, fontWeight: 700, color: '#64748b', marginBottom: 5 }}>
              <span>Avancement de ma préparation</span><span>{progress}%</span>
            </div>
            <ProgressBar value={progress} color={progress === 100 ? COLORS.success : COLORS.primary} />
          </div>
          {entretien.outlook_web_link && (
            <a href={entretien.outlook_web_link} target="_blank" rel="noopener noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: COLORS.primary, textDecoration: 'none' }}>
              <ExternalLink size={14} /> Ouvrir l’invitation Outlook
            </a>
          )}
        </div>

        {entretien.outlook_status === 'erreur' && entretien.access?.isAdmin && (
          <div style={{ marginTop: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 9, padding: '9px 11px', fontSize: 12 }}>
            <AlertCircle size={13} style={{ verticalAlign: -2, marginRight: 5 }} />
            L’invitation Outlook n’a pas pu être créée : {entretien.outlook_error}
          </div>
        )}
      </div>

      {/* Compte rendu transmis par l'évaluateur : relecture, observations de l'agent, validation → parapheur */}
      {crepActive && (
        <div style={{ ...card, padding: 18, marginBottom: 18, borderLeft: `4px solid ${COLORS.primary}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, fontSize: 15, color: COLORS.text, marginBottom: 10 }}>
            <FileSignature size={17} color={COLORS.primary} /> Compte rendu de mon entretien professionnel
          </div>
          <CrepForm mode="agent" entretien={entretien} canEdit={false} eSignEnabled={!!data.esignAccess?.allowed}
            onSaved={(updated) => { setEntretien(prev => (prev ? { ...prev, ...updated, access: (updated as any).access || prev.access } : updated)); onChanged(); }} />
        </div>
      )}

      {data.campaign.instructions && editable && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 10, padding: '11px 13px', fontSize: 12.5, lineHeight: 1.5, marginBottom: 16 }}>
          <strong>Consignes de campagne :</strong>
          <RichTextView html={data.campaign.instructions} style={{ marginTop: 4, maxHeight: 160, overflowY: 'auto', paddingRight: 6 }} />
        </div>
      )}

      {/* Fiche de préparation */}
      {editable ? (
        <PreparationForm entretien={entretien} onSaved={(updated) => {
          setEntretien(updated);
          onChanged();
        }} />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#f1f5f9', border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: '10px 13px', fontSize: 12.5, color: '#475569', marginBottom: 16 }}>
            <ClipboardList size={15} color={COLORS.primary} />
            {entretien.preparation_statut === 'soumis'
              ? 'Votre préparation a bien été transmise à votre responsable.'
              : 'La saisie de la préparation est fermée (entretien réalisé ou délai dépassé).'}
          </div>
          <PreparationView entretien={entretien} />
        </>
      )}

      {/* Compte rendu du responsable */}
      {hasCompteRendu && !crepActive && (
        <div style={{ ...card, padding: 18, marginTop: 18, borderLeft: `4px solid ${COLORS.success}` }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 800, fontSize: 14, color: COLORS.text, marginBottom: 12 }}>
            <TrendingUp size={16} color={COLORS.success} /> Compte rendu de l’entretien
          </div>
          {entretien.appreciation_generale && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>Appréciation générale</div>
              <div style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{entretien.appreciation_generale}</div>
            </div>
          )}
          {entretien.synthese && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>Synthèse de l’entretien</div>
              <div style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{entretien.synthese}</div>
            </div>
          )}
          {entretien.objectifs_suivants && (
            <div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 11.5, fontWeight: 700, color: '#64748b', marginBottom: 3 }}>
                <Target size={13} /> Objectifs pour l’année suivante
              </div>
              <div style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{entretien.objectifs_suivants}</div>
            </div>
          )}
          {entretien.avis_agent && (
            <div style={{ marginTop: 12, background: '#f8fafc', border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: '9px 11px', fontSize: 12.5, color: '#475569' }}>
              <strong>Vos observations :</strong> {entretien.avis_agent}
            </div>
          )}
          {entretien.evaluation_statut === 'soumis' && (
            <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 10, fontSize: 11.5, color: COLORS.success, fontWeight: 700 }}>
              <CheckCircle2 size={13} /> Compte rendu validé par le responsable
            </div>
          )}
        </div>
      )}

      {!hasCompteRendu && entretien.statut === 'realise' && (
        <div style={{ ...card, padding: 16, marginTop: 18, fontSize: 12.5, color: COLORS.muted }}>
          <ClipboardList size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
          L’entretien est marqué comme réalisé. Le compte rendu du responsable apparaîtra ici dès sa validation.
        </div>
      )}

      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 14 }}>
        Campagne {data.campaign.annee}
        {data.campaign.date_cloture ? ` · clôture le ${formatDateFr(data.campaign.date_cloture)}` : ''}
        {data.campaign.date_limite_ep ? ` · date limite des entretiens : ${formatDateFr(data.campaign.date_limite_ep)}` : ''}
      </div>
    </div>
  );
}
