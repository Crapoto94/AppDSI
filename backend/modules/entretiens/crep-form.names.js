/**
 * Noms des champs du PDF formulaire du CREP (saisie hors ligne).
 * Partagés par la génération (crep-pdf.service.js) et la relecture (crep-form.service.js) : un seul endroit à tenir à jour.
 * Pas de « . » dans un nom de champ (c'est le séparateur de hiérarchie des formulaires PDF) : on n'emploie que lettres, chiffres et « _ ».
 */
const safeKey = (k) => String(k || '').replace(/[^A-Za-z0-9_]/g, '_');

const N = {
    meta: 'ep_form_meta',
    grade: 'grade',
    date_convocation: 'date_convocation',
    date_entretien: 'date_entretien',
    date_notification: 'date_notification',
    evaluateur_nom: 'evaluateur_nom',
    missions: 'missions',
    oeObjectif: (i) => `oe_${i}_objectif`,
    oeObservations: (i) => `oe_${i}_observations`,
    oeNiveau: (i) => `oe_${i}_niveau`,
    observations_complementaires: 'observations_complementaires',
    valeur: (key) => `val_${safeKey(key)}`,
    appreciation_generale: 'appreciation_generale',
    objectifs_service: 'objectifs_service',
    ofDescriptif: (i) => `of_${i}_descriptif`,
    ofMoyens: (i) => `of_${i}_moyens`,
    formObligatoires: 'formations_obligatoires',
    formMetiers: 'formations_metiers',
    formParcours: 'formations_parcours',
    evolution: 'evolution',
    mobilite: 'mobilite',
    obs_agent_conditions: 'obs_agent_conditions',
    obs_agent_entretien: 'obs_agent_entretien',
};

module.exports = { N, safeKey };
