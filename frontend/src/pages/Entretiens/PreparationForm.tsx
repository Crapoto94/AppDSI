import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, Send, Target, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { Entretien, Formation, Objectif } from './types';
import { NIVEAUX } from './types';
import { COLORS, Field, Section, btnGhost, btnPrimary, input, textarea } from './ui';

type RowObjectif = Objectif & { _key: string };
type RowFormation = Formation & { _key: string };

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function initObjectifs(e: Entretien): RowObjectif[] {
  const saved = (e.objectifs || []).map(o => ({ ...o, _key: `o-${o.id}` }));
  if (saved.length === 0 && e.reprise?.objectifs?.length) {
    // Aucun objectif saisi : on propose ceux fixés lors de l'entretien de l'année précédente (à ajuster par l'agent).
    return e.reprise.objectifs.map((o, i) => ({
      _key: `r-${i}`, id: 0, ordre: i + 1, libelle: o.descriptif, niveau: '', resultats: '', difficultes: '', contexte: '',
    }));
  }
  return saved;
}

function initFormations(e: Entretien): RowFormation[] {
  return (e.formations || []).map(f => ({ ...f, _key: `f-${f.id}` }));
}

export default function PreparationForm({ entretien, onSaved }: {
  entretien: Entretien;
  onSaved: (e: Entretien) => void;
}) {
  const { token } = useAuth();
  const headers = { Authorization: `Bearer ${token}` };

  const [objectifs, setObjectifs] = useState<RowObjectif[]>(() => initObjectifs(entretien));
  const [formations, setFormations] = useState<RowFormation[]>(() => initFormations(entretien));
  const [form, setForm] = useState({
    realisations: entretien.realisations || '',
    difficultes: entretien.difficultes || '',
    pistes_amelioration: entretien.pistes_amelioration || '',
    competences_a_developper: entretien.competences_a_developper || '',
    perspectives_missions: entretien.perspectives_missions || '',
    perspectives_responsabilite: entretien.perspectives_responsabilite || '',
    perspectives_expertise: entretien.perspectives_expertise || '',
    perspectives_projet: entretien.perspectives_projet || '',
    perspectives_concours: entretien.perspectives_concours || '',
    commentaire_agent: entretien.commentaire_agent || '',
  });
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const setField = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }));
  const readOnly = !(entretien.access?.canEditPreparation ?? false);

  const payload = useMemo(() => ({
    ...form,
    objectifs: objectifs.map(({ _key, entretien_id, ...o }) => o),
    formations: formations.map(({ _key, entretien_id, ...f }) => f),
  }), [form, objectifs, formations]);

  const save = async (submit: boolean) => {
    setError(null);
    if (submit && !window.confirm('Transmettre votre préparation à votre responsable ? Vous pourrez encore la corriger tant que l’entretien n’a pas eu lieu.')) return;
    submit ? setSubmitting(true) : setSaving(true);
    try {
      const r = await axios.put(`/api/entretiens/${entretien.id}/preparation`, payload, { headers });
      let updated = r.data.entretien as Entretien;
      if (submit) {
        const r2 = await axios.post(`/api/entretiens/${entretien.id}/submit`, {}, { headers });
        updated = r2.data.entretien as Entretien;
      }
      // Resynchronise l'état local sur ce qui a réellement été enregistré :
      // indispensable pour récupérer les identifiants des objectifs/formations
      // créés, sinon un second enregistrement les insérerait en double.
      setObjectifs(initObjectifs(updated));
      setFormations(initFormations(updated));
      setSavedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      onSaved(updated);
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Erreur lors de l’enregistrement');
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  };

  const addObjectif = () => setObjectifs(list => [...list, {
    _key: uid(), id: 0, ordre: list.length + 1, libelle: '', niveau: '', resultats: '', difficultes: '', contexte: '',
  }]);

  const addFormation = () => setFormations(list => [...list, {
    _key: uid(), id: 0, competence: '', formation: '', benefices: '', reference_cnfpt: '', statut: 'soumise', avis_evaluateur: '',
  }]);

  const updateObjectif = (key: string, patch: Partial<RowObjectif>) =>
    setObjectifs(list => list.map(o => o._key === key ? { ...o, ...patch } : o));
  const updateFormation = (key: string, patch: Partial<RowFormation>) =>
    setFormations(list => list.map(f => f._key === key ? { ...f, ...patch } : f));

  return (
    <div>
      {readOnly && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', borderRadius: 10, padding: '10px 13px', fontSize: 12.5, marginBottom: 14 }}>
          Votre préparation n’est plus modifiable (entretien réalisé ou délai dépassé). Contactez un administrateur du module si une correction est nécessaire.
        </div>
      )}

      <Section number={1} title="Bilan de réalisation des objectifs"
        description="Pour chaque objectif fixé lors du précédent entretien, indiquez son niveau d'atteinte, les résultats obtenus et les éventuelles difficultés. Il ne s'agit pas d'une auto-évaluation définitive mais d'une base de dialogue.">
        {entretien.reprise && (entretien.objectifs || []).length === 0 && objectifs.length > 0 && (
          <div style={{ margin: '0 0 12px', padding: '9px 12px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 9, fontSize: 12.5, color: '#3730a3', lineHeight: 1.5 }}>
            Ces objectifs sont <strong>repris de votre entretien {entretien.reprise.annee}</strong> : ajustez-les si besoin, puis indiquez pour chacun
            le niveau d’atteinte, les résultats obtenus et les difficultés rencontrées.
          </div>
        )}
        {objectifs.length === 0 && (
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#94a3b8' }}>
            Aucun objectif n’a encore été renseigné. Ajoutez ci-dessous les objectifs qui vous avaient été fixés.
          </p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {objectifs.map((o, index) => (
            <div key={o._key} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 11, padding: 13, background: '#fcfdff' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 9 }}>
                <Target size={15} color={COLORS.primary} />
                <textarea
                  style={{ ...textarea, fontWeight: 600, minHeight: 38 }}
                  rows={Math.min(6, Math.max(1, String(o.libelle || '').split('\n').length))}
                  placeholder={`Libellé de l'objectif ${index + 1}`}
                  value={o.libelle}
                  disabled={readOnly}
                  onChange={ev => updateObjectif(o._key, { libelle: ev.target.value })}
                />
                {!readOnly && (
                  <button type="button" title="Supprimer cet objectif"
                    onClick={() => setObjectifs(list => list.filter(x => x._key !== o._key))}
                    style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#64748b', marginRight: 4 }}>Niveau d'atteinte :</span>
                {Object.entries(NIVEAUX).map(([key, meta]) => {
                  const active = o.niveau === key;
                  return (
                    <button key={key} type="button" disabled={readOnly}
                      onClick={() => updateObjectif(o._key, { niveau: active ? '' : key })}
                      style={{
                        padding: '5px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: readOnly ? 'default' : 'pointer',
                        border: `1px solid ${active ? meta.color : COLORS.border}`,
                        background: active ? meta.bg : '#fff', color: active ? meta.color : '#64748b',
                      }} title={meta.label}>{meta.short} — {meta.label}</button>
                  );
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 9 }}>
                <Field label="Principaux résultats obtenus">
                  <textarea style={textarea} rows={3} disabled={readOnly} value={o.resultats || ''}
                    onChange={ev => updateObjectif(o._key, { resultats: ev.target.value })} />
                </Field>
                <Field label="Difficultés / contraintes rencontrées">
                  <textarea style={textarea} rows={3} disabled={readOnly} value={o.difficultes || ''}
                    onChange={ev => updateObjectif(o._key, { difficultes: ev.target.value })} />
                </Field>
                <Field label="Éléments de contexte">
                  <textarea style={textarea} rows={3} disabled={readOnly} value={o.contexte || ''}
                    onChange={ev => updateObjectif(o._key, { contexte: ev.target.value })} />
                </Field>
              </div>
            </div>
          ))}
        </div>
        {!readOnly && (
          <button type="button" style={{ ...btnGhost, marginTop: 10 }} onClick={addObjectif}>
            <Plus size={14} /> Ajouter un objectif
          </button>
        )}
      </Section>

      <Section number={2} title="Réalisations marquantes de l'année"
        description="Principales réalisations, contributions ou projets ayant marqué votre activité, qu'ils aient ou non été prévus dans les objectifs initiaux.">
        <textarea style={textarea} rows={6} disabled={readOnly}
          placeholder="Décrivez les projets, dossiers, contributions ou améliorations dont vous êtes particulièrement fier…"
          value={form.realisations} onChange={e => setField('realisations', e.target.value)} />
      </Section>

      <Section number={3} title="Difficultés rencontrées et pistes d'amélioration"
        description="Signalez les difficultés organisationnelles, techniques ou fonctionnelles ainsi que les améliorations que vous souhaitez porter à la connaissance de votre hiérarchie.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
          <Field label="Difficultés rencontrées">
            <textarea style={textarea} rows={5} disabled={readOnly} value={form.difficultes}
              onChange={e => setField('difficultes', e.target.value)} />
          </Field>
          <Field label="Pistes d'amélioration proposées">
            <textarea style={textarea} rows={5} disabled={readOnly} value={form.pistes_amelioration}
              onChange={e => setField('pistes_amelioration', e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section number={4} title="Développement des compétences et besoins de formation"
        description="Identifiez les compétences à développer au regard de vos missions, des évolutions du service, des projets de la direction et de votre parcours. Privilégiez les formations du CNFPT lorsqu'une offre adaptée existe.">
        <Field label="Compétences que vous souhaitez développer ou renforcer">
          <textarea style={textarea} rows={3} disabled={readOnly} value={form.competences_a_developper}
            onChange={e => setField('competences_a_developper', e.target.value)} />
        </Field>

        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {formations.map((f, index) => (
            <div key={f._key} style={{ border: `1px solid ${COLORS.border}`, borderRadius: 11, padding: 13, background: '#fcfdff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569' }}>Demande de formation {index + 1}</div>
                {!readOnly && (
                  <button type="button" title="Supprimer cette demande"
                    onClick={() => setFormations(list => list.filter(x => x._key !== f._key))}
                    style={{ border: 'none', background: 'transparent', color: '#dc2626', cursor: 'pointer', padding: 4 }}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 9 }}>
                <Field label="Compétence visée">
                  <input style={input} disabled={readOnly} value={f.competence || ''}
                    onChange={e => updateFormation(f._key, { competence: e.target.value })} />
                </Field>
                <Field label="Formation souhaitée">
                  <input style={input} disabled={readOnly} value={f.formation || ''}
                    onChange={e => updateFormation(f._key, { formation: e.target.value })} />
                </Field>
                <Field label="Référence CNFPT (facultatif)">
                  <input style={input} disabled={readOnly} value={f.reference_cnfpt || ''}
                    onChange={e => updateFormation(f._key, { reference_cnfpt: e.target.value })} />
                </Field>
              </div>
              <div style={{ marginTop: 9 }}>
                <Field label="Bénéfices attendus pour l'exercice de vos missions">
                  <textarea style={textarea} rows={2} disabled={readOnly} value={f.benefices || ''}
                    onChange={e => updateFormation(f._key, { benefices: e.target.value })} />
                </Field>
              </div>
            </div>
          ))}
        </div>
        {!readOnly && (
          <button type="button" style={{ ...btnGhost, marginTop: 10 }} onClick={addFormation}>
            <Plus size={14} /> Ajouter une demande de formation
          </button>
        )}
      </Section>

      <Section number={5} title="Perspectives professionnelles"
        description="Vos souhaits d'évolution concernant vos missions, votre niveau de responsabilité, votre expertise, votre projet professionnel et les concours ou certifications envisagés.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <Field label="Missions">
            <textarea style={textarea} rows={3} disabled={readOnly} value={form.perspectives_missions}
              onChange={e => setField('perspectives_missions', e.target.value)} />
          </Field>
          <Field label="Niveau de responsabilité">
            <textarea style={textarea} rows={3} disabled={readOnly} value={form.perspectives_responsabilite}
              onChange={e => setField('perspectives_responsabilite', e.target.value)} />
          </Field>
          <Field label="Développement de l'expertise">
            <textarea style={textarea} rows={3} disabled={readOnly} value={form.perspectives_expertise}
              onChange={e => setField('perspectives_expertise', e.target.value)} />
          </Field>
          <Field label="Projet professionnel">
            <textarea style={textarea} rows={3} disabled={readOnly} value={form.perspectives_projet}
              onChange={e => setField('perspectives_projet', e.target.value)} />
          </Field>
          <Field label="Concours, examens professionnels ou certifications envisagés">
            <textarea style={textarea} rows={3} disabled={readOnly} value={form.perspectives_concours}
              onChange={e => setField('perspectives_concours', e.target.value)} />
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Field label="Commentaire libre (facultatif)">
            <textarea style={textarea} rows={3} disabled={readOnly} value={form.commentaire_agent}
              onChange={e => setField('commentaire_agent', e.target.value)} />
          </Field>
        </div>
      </Section>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 9, padding: '9px 12px', fontSize: 12.5, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {!readOnly && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', position: 'sticky', bottom: 12, background: '#fff', padding: 12, borderRadius: 12, border: `1px solid ${COLORS.border}`, boxShadow: '0 8px 24px rgba(15,23,42,.08)' }}>
          <button type="button" style={btnPrimary} disabled={saving || submitting} onClick={() => save(false)}>
            {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Enregistrer le brouillon
          </button>
          <button type="button" style={{ ...btnPrimary, background: COLORS.success }} disabled={saving || submitting} onClick={() => save(true)}>
            {submitting ? <Loader2 size={15} className="spin" /> : <Send size={15} />} Transmettre ma préparation
          </button>
          {entretien.preparation_statut === 'soumis' && (
            <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12, color: COLORS.success, fontWeight: 600 }}>
              <CheckCircle2 size={14} /> Déjà transmise
            </span>
          )}
          {savedAt && <span style={{ fontSize: 11.5, color: '#94a3b8' }}>Enregistré à {savedAt}</span>}
        </div>
      )}
    </div>
  );
}
