/**
 * E-mails du module Entretiens professionnels — même charte que le parapheur (API Ville + repli mailer local).
 * Chaque gabarit renvoie { subject, html, content } (cf. parapheur-email.js#render).
 * Les textes sont ceux des modèles du registre `mail-templates.js` (modifiables dans Paramétrage → Modèles d'e-mails).
 * Les liens pointent vers l'URL publique de l'application (app_base_url), jamais une adresse en dur.
 */
const { esc } = require('../parapheur/parapheur-email');
const { getMagappBaseUrl } = require('../../shared/app_url');
const T = require('./mail-templates');

const DEFAULT_MAGAPP_URL = 'https://magapp.ivry.local';

/**
 * Lien vers le module dans MagApp (les agents s'y connectent ; ce n'est plus le DSI Hub).
 * `vue` : « moi » (mon entretien d'agent : préparation, compte rendu à valider), « evaluations » (EP que je réalise),
 * « auto » ou vide (MagApp choisit selon la situation de l'agent). L'ouverture directe évite d'arriver sur la liste des agents évalués.
 */
async function entretiensUrl(vue) {
    let base = '';
    try { base = await getMagappBaseUrl(); } catch (e) { /* ignore */ }
    if (!base || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(base)) base = DEFAULT_MAGAPP_URL;
    return `${String(base).replace(/\/+$/, '')}/ep/${encodeURIComponent(vue || 'auto')}`;
}

function infoBlock(title, rows) {
    const lines = rows.filter(r => r && r[1]).map(([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;font-size:13px;color:#64748b;white-space:nowrap;">${esc(k)}</td><td style="padding:4px 0;font-size:14px;color:#1e293b;font-weight:600;">${esc(v)}</td></tr>`).join('');
    return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">${esc(title)}</div>
      <table role="presentation" style="border-collapse:collapse;">${lines}</table>
    </div>`;
}

const fmtDate = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('fr-FR');
};
const annee = (a) => (a == null ? '' : String(a));

/** À l'agent·e : son entretien est planifié, il·elle doit le préparer. `avecAcces` : a-t-il·elle accès à « Mon entretien » ? */
function preparation({ agent, annee: an, quand, duree, lieu, evaluateur, link, avecAcces = true }) {
    const html = {
        info_rdv: infoBlock('Votre entretien', [['Date et heure', quand], ['Durée', duree ? `${duree} minutes` : ''], ['Lieu', lieu], ['Évaluateur·rice (N+1)', evaluateur]]),
        phrase_preparation: avecAcces
            ? 'Merci de le préparer en complétant votre fiche de préparation dans l’application.'
            : 'Le formulaire CREP vierge est joint à ce message : vous pouvez l’imprimer et le préparer sur papier.',
        paragraphe_preparation: avecAcces
            ? '<p style="font-size:13px;color:#64748b;">Cette préparation (bilan de l’année écoulée, perspectives, besoins de formation) nourrit l’échange avec votre évaluateur·rice. Vous pouvez la modifier jusqu’à l’entretien. Le formulaire CREP vierge est joint à ce message.</p>'
            : '<p style="font-size:13px;color:#64748b;">Cette préparation facultative (bilan de l’année écoulée, perspectives, besoins de formation) nourrit l’échange avec votre évaluateur·rice : notez-la sur le formulaire CREP vierge joint et apportez-le le jour de l’entretien.</p>',
    };
    return T.build('preparation', { agent, annee: annee(an), quand, duree, lieu, evaluateur }, html, { link, noButton: !avecAcces });
}

/** À l'agent·e : le compte rendu rédigé par l'évaluateur·rice est disponible. */
function compteRenduEnvoye({ agent, annee: an, evaluateur, dateLimite, link }) {
    const html = {
        phrase_papier: dateLimite
            ? `<p style="font-size:13px;color:#64748b;">Si vous devez imprimer et signer le compte rendu sur papier, merci de le retourner à votre évaluateur·rice <strong>au plus tard le ${esc(fmtDate(dateLimite))}</strong>.</p>` : '',
    };
    return T.build('compteRenduEnvoye', { agent, annee: annee(an), evaluateur: evaluateur || 'votre évaluateur·rice', date_limite: fmtDate(dateLimite) }, html, { link });
}

/** À l'évaluateur·rice : un entretien lui est attribué, il·elle doit prendre rendez-vous. `agentAcces` : l'agent·e a-t-il·elle accès à « Mon entretien » ? */
function aPlanifier({ evaluateur, agent, annee: an, service, link, agentAcces = true }) {
    const html = {
        info_agent: infoBlock('Entretien à planifier', [['Agent·e', agent], ['Service', service]]),
        phrase_prevenir: agentAcces ? ' et prévient l’agent·e pour qu’il·elle prépare son entretien' : '',
    };
    return T.build('aPlanifier', { evaluateur, agent, annee: annee(an), service }, html, { link });
}

/** À l'évaluateur·rice : l'entretien est planifié (rappel du rendez-vous et du suivi à faire). */
function rdvPlanifie({ evaluateur, agent, annee: an, service, quand, duree, lieu, link, agentAcces = true }) {
    const html = {
        info_rdv: infoBlock('Rendez-vous', [['Agent·e', agent], ['Service', service], ['Date et heure', quand], ['Durée', duree ? `${duree} minutes` : ''], ['Lieu', lieu]]),
        phrase_preparation_agent: agentAcces
            ? 'L’agent·e a été invité·e à préparer son entretien dans « Mon entretien ».'
            : 'L’agent·e n’a pas accès à « Mon entretien » : le CREP vierge a été joint à sa convocation (ou est à lui remettre imprimé).',
    };
    return T.build('rdvPlanifie', { evaluateur, agent, annee: annee(an), service, quand, duree, lieu }, html, { link });
}

/** À l'agent·e : le compte rendu envoyé est rappelé par l'évaluateur·rice (en cours de correction). */
function compteRenduRappele({ agent, annee: an, evaluateur }) {
    return T.build('compteRenduRappele', { agent, annee: annee(an), evaluateur: evaluateur || 'votre évaluateur·rice' });
}

/** À l'agent·e et à son évaluateur·rice : le CREP signé a été reçu, vérifié et l'entretien est clos. */
function crepRecu({ destinataire, agent, annee: an, evaluateur }) {
    return T.build('crepRecu', { destinataire: nice(destinataire || ''), agent, annee: annee(an), evaluateur: evaluateur || 'son évaluateur·rice' });
}

/** Aux administrateur·rice·s : un·e évaluateur·rice demande la réouverture d'un entretien clôturé. */
function reouvertureDemande({ demandeur, agent, annee: an, motif, link }) {
    return T.build('reouvertureDemande', { demandeur, agent, annee: annee(an), motif }, { info_motif: infoBlock('Justification de la demande', [['Motif', motif]]) }, { link });
}

/** Au·à la demandeur·euse : décision de l'administrateur·rice. */
function reouvertureDecision({ demandeur, agent, annee: an, accepte, note, link }) {
    const html = {
        info_note: note ? infoBlock('Message de l’administrateur·rice', [['Note', note]]) : '',
        phrase_suite: accepte ? 'L’entretien est de nouveau modifiable : vous pouvez le compléter puis le clôturer à nouveau.' : 'L’entretien reste clôturé.',
    };
    return T.build('reouvertureDecision', { demandeur, agent, annee: annee(an), decision: accepte ? 'acceptée' : 'refusée', icone: accepte ? '✅' : '⛔' }, html,
        { link, color: accepte ? '#16a34a' : '#64748b' });
}

/** Aux administrateur·rice·s : nouvelle demande au backlog (question, amélioration, bug). */
function backlogNouvelle({ type, titre, description, demandeur, link }) {
    return T.build('backlogNouvelle', { type, titre, description, demandeur }, { info_demande: infoBlock('Demande', [['Type', type], ['Titre', titre], ['Description', description]]) }, { link });
}

/** Au·à la demandeur·euse : quelqu'un a commenté sa demande. */
function backlogCommentaire({ demandeur, id, titre, auteur, texte, link }) {
    return T.build('backlogCommentaire', { demandeur, id, titre, auteur, texte }, { info_commentaire: infoBlock('Commentaire', [['Message', texte]]) }, { link });
}

/** Au·à la demandeur·euse : suite donnée à sa demande. */
function backlogDecision({ demandeur, id, type, titre, statut, motif, par, link }) {
    const LIB = { acceptee: 'acceptée : elle est inscrite au backlog', refusee: 'refusée', realisee: 'réalisée : elle est disponible', repondue: 'traitée : une réponse vous est apportée' };
    const ok = statut !== 'refusee';
    const resultat = LIB[statut] || String(statut);
    return T.build('backlogDecision', { demandeur, id, type: String(type || '').toLowerCase(), titre, resultat, resultat_court: resultat.split(' :')[0], icone: ok ? '✅' : '⛔', par },
        { info_motif: motif ? infoBlock(statut === 'refusee' ? 'Motif' : 'Réponse', [['Message', motif]]) : '' }, { link, color: ok ? '#16a34a' : '#64748b' });
}

/** Relance à l'agent·e : préparation non transmise alors que l'entretien approche. */
function relancePreparation({ agent, annee: an, quand, link }) {
    return T.build('relancePreparation', { agent, annee: annee(an), quand }, { phrase_quand: quand ? ` (<strong>${esc(quand)}</strong>)` : '' }, { link });
}

/** Relance à l'agent·e : compte rendu reçu, en attente de sa validation. */
function relanceValidation({ agent, annee: an, evaluateur, link }) {
    return T.build('relanceValidation', { agent, annee: annee(an), evaluateur: evaluateur || 'votre évaluateur·rice' }, {}, { link });
}

/** Relance à l'évaluateur·rice : synthèse de ses entretiens en attente (à planifier, à finaliser, à envoyer). */
function relanceEvaluateur({ evaluateur, annee: an, sections, link }) {
    const html = { sections: sections.filter(s => s.items.length).map(s => infoBlock(`${s.title} (${s.items.length})`, s.items.map(i => [i.agent, i.detail || '—']))).join('') };
    return T.build('relanceEvaluateur', { evaluateur, annee: annee(an) }, html, { link });
}

/** À l'évaluateur·rice : l'analyse du CREP manuscrit (IA locale) est terminée, ou a échoué. */
function analyseCrep({ evaluateur, agent, annee: an, ok, error, dureeMs, link }) {
    const mins = dureeMs ? Math.max(1, Math.round(dureeMs / 60000)) : null;
    return ok
        ? T.build('analyseCrepOk', { evaluateur, agent, annee: annee(an) }, { phrase_duree: mins ? ` (durée : ${mins} min)` : '' }, { link })
        : T.build('analyseCrepKo', { evaluateur, agent, annee: annee(an), erreur: error || 'Erreur inconnue.' }, {}, { link });
}

/**
 * Nom d'affichage : « Prénom Nom » avec la casse correcte. Les mots ENTIÈREMENT en majuscules sont le nom de famille
 * (« CHEVALIER Marc », « Marc CHEVALIER ») ; si tout est en majuscules, le premier mot est le nom (convention RH « NOM PRÉNOM »).
 */
function nice(name) {
    const raw = String(name || '').trim().replace(/\s+/g, ' ');
    if (!raw || !/\s/.test(raw)) return raw;
    const cap = (w) => w.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (m, sep, c) => sep + c.toUpperCase());
    const tokens = raw.split(' ');
    const isUp = (t) => t.length > 1 && t === t.toUpperCase() && t !== t.toLowerCase();
    let sur = tokens.filter(isUp), given = tokens.filter(t => !isUp(t));
    if (!given.length) { sur = [tokens[0]]; given = tokens.slice(1); }
    if (!sur.length) return tokens.map(cap).join(' ');
    return [...given.map(cap), ...sur.map(cap)].join(' ');
}

// Tous les modèles reçoivent des noms propres (évaluateur·rice, agent·e) : normalisés ici, une fois pour toutes
const wrap = (fn) => (p = {}) => fn({ ...p, ...(p.agent ? { agent: nice(p.agent) } : {}), ...(p.evaluateur ? { evaluateur: nice(p.evaluateur) } : {}) });

module.exports = {
    analyseCrep: wrap(analyseCrep), entretiensUrl, nice,
    crepRecu: wrap(crepRecu), preparation: wrap(preparation), compteRenduEnvoye: wrap(compteRenduEnvoye), aPlanifier: wrap(aPlanifier), rdvPlanifie: wrap(rdvPlanifie),
    backlogCommentaire: wrap(backlogCommentaire), backlogNouvelle: wrap(backlogNouvelle), backlogDecision: wrap(backlogDecision),
    reouvertureDemande: wrap(reouvertureDemande), reouvertureDecision: wrap(reouvertureDecision),
    relancePreparation: wrap(relancePreparation), relanceValidation: wrap(relanceValidation), relanceEvaluateur: wrap(relanceEvaluateur), compteRenduRappele: wrap(compteRenduRappele),
};
