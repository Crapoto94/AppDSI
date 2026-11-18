import React from 'react';
import { Target, Sparkles, AlertTriangle, GraduationCap, Compass, MessageSquare, CheckCircle2 } from 'lucide-react';
import type { Entretien } from './types';
import { FORMATION_STATUTS, NIVEAUX } from './types';
import { Badge, COLORS, Section, card } from './ui';

function Bloc({ titre, texte, icon }: { titre: string; texte?: string | null; icon?: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
        {icon}{titre}
      </div>
      <div style={{
        fontSize: 13, color: texte ? '#334155' : '#94a3b8', lineHeight: 1.55,
        whiteSpace: 'pre-wrap', background: '#f8fafc', borderRadius: 8, padding: '9px 11px',
      }}>{texte?.trim() || 'Non renseigné'}</div>
    </div>
  );
}

/** Affichage en lecture seule de la préparation de l'agent. */
export default function PreparationView({ entretien }: { entretien: Entretien }) {
  const objectifs = entretien.objectifs || [];
  const formations = entretien.formations || [];

  return (
    <div>
      <Section number={1} title="Bilan de réalisation des objectifs" description="Niveau d'atteinte et éléments factuels renseignés par l'agent.">
        {objectifs.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>Aucun objectif renseigné.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {objectifs.map((o, i) => {
              const niv = o.niveau ? NIVEAUX[o.niveau] : null;
              return (
                <div key={o.id || i} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>
                      <Target size={13} style={{ verticalAlign: -2, marginRight: 6, color: COLORS.primary }} />
                      {o.libelle || `Objectif ${i + 1}`}
                    </div>
                    {niv ? <Badge label={`${niv.short} — ${niv.label}`} color={niv.color} bg={niv.bg} /> : <span style={{ fontSize: 11, color: '#94a3b8' }}>Non évalué</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
                    <Bloc titre="Principaux résultats" texte={o.resultats} />
                    <Bloc titre="Difficultés / contraintes" texte={o.difficultes} />
                    <Bloc titre="Éléments de contexte" texte={o.contexte} />
                  </div>
                  {(o.niveau_evaluateur || o.commentaire_evaluateur) && (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 9, marginTop: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4ed8', marginBottom: 3 }}>Appréciation du responsable</div>
                      <div style={{ fontSize: 12.5, color: '#1e3a8a', whiteSpace: 'pre-wrap' }}>
                        {o.niveau_evaluateur ? `Niveau : ${NIVEAUX[o.niveau_evaluateur]?.label || o.niveau_evaluateur}. ` : ''}
                        {o.commentaire_evaluateur || ''}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section number={2} title="Réalisations marquantes de l'année">
        <Bloc titre="Réalisations, contributions et projets" texte={entretien.realisations} icon={<Sparkles size={13} />} />
      </Section>

      <Section number={3} title="Difficultés rencontrées et pistes d'amélioration">
        <Bloc titre="Difficultés organisationnelles, techniques ou fonctionnelles" texte={entretien.difficultes} icon={<AlertTriangle size={13} />} />
        <Bloc titre="Pistes d'amélioration proposées" texte={entretien.pistes_amelioration} />
      </Section>

      <Section number={4} title="Développement des compétences et besoins de formation">
        <Bloc titre="Compétences à développer ou renforcer" texte={entretien.competences_a_developper} icon={<GraduationCap size={13} />} />
        {formations.length === 0 ? (
          <div style={{ fontSize: 12.5, color: '#94a3b8', background: '#f8fafc', borderRadius: 8, padding: '9px 11px' }}>
            Aucune demande de formation formulée.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {formations.map((f, i) => {
              const meta = FORMATION_STATUTS[f.statut] || FORMATION_STATUTS.soumise;
              return (
                <div key={f.id || i} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 11 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>{f.formation || 'Formation à préciser'}</div>
                    <Badge {...meta} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
                    <Bloc titre="Compétence visée" texte={f.competence} />
                    <Bloc titre="Bénéfices attendus" texte={f.benefices} />
                    <Bloc titre="Référence CNFPT" texte={f.reference_cnfpt} />
                  </div>
                  {f.avis_evaluateur && (
                    <div style={{ marginTop: 4, fontSize: 12.5, color: '#1e3a8a', background: '#eff6ff', borderRadius: 7, padding: '7px 9px' }}>
                      <strong>Avis du responsable :</strong> {f.avis_evaluateur}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section number={5} title="Perspectives professionnelles">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          <Bloc titre="Missions" texte={entretien.perspectives_missions} icon={<Compass size={13} />} />
          <Bloc titre="Niveau de responsabilité" texte={entretien.perspectives_responsabilite} />
          <Bloc titre="Développement de l'expertise" texte={entretien.perspectives_expertise} />
          <Bloc titre="Projet professionnel" texte={entretien.perspectives_projet} />
          <Bloc titre="Concours, examens ou certifications" texte={entretien.perspectives_concours} />
        </div>
      </Section>

      {entretien.commentaire_agent && (
        <div style={{ ...card, padding: 14, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 4 }}>
            <MessageSquare size={13} /> Commentaire libre de l'agent
          </div>
          <div style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{entretien.commentaire_agent}</div>
        </div>
      )}

      {entretien.preparation_statut === 'soumis' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: COLORS.success, fontWeight: 600 }}>
          <CheckCircle2 size={14} /> Préparation transmise par l'agent
        </div>
      )}
    </div>
  );
}
