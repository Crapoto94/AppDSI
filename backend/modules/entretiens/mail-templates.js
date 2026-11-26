'use strict';
/**
 * Modèles d'e-mails du module « Entretiens professionnels » : registre de tous les e-mails envoyés par l'application,
 * avec leur texte par défaut, leurs variables et la possibilité de les modifier (Paramétrage → Modèles d'e-mails).
 *
 * Un modèle comprend 5 éléments modifiables : objet, titre, introduction (HTML), corps (HTML) et libellé du bouton.
 * Les `{{variables}}` sont remplacées à l'envoi ; les variables « html » (blocs d'information, phrases conditionnelles)
 * sont fabriquées par l'application selon la situation (ex. l'agent·e a-t-il·elle accès à « Mon entretien » ?).
 * Les textes modifiés sont conservés dans hub_entretiens.settings (clé `mail:<id>`) ; « Rétablir » supprime la surcharge.
 */
const { render, esc, button } = require('../parapheur/parapheur-email');

const FOOTER = 'Entretiens professionnels — MagApp. Message automatique, merci de ne pas y répondre.';
const P = (t, small) => `<p style="font-size:${small ? 13 : 14}px;color:${small ? '#64748b' : '#334155'};">${t}</p>`;

const V = {
    agent: { key: 'agent', label: 'Nom de l’agent·e', example: 'Isabelle Abbas' },
    evaluateur: { key: 'evaluateur', label: 'Nom de l’évaluateur·rice', example: 'Marc Chevalier' },
    annee: { key: 'annee', label: 'Année de la campagne', example: '2026' },
    service: { key: 'service', label: 'Service de l’agent·e', example: 'Direction des systèmes d’information' },
    quand: { key: 'quand', label: 'Date et heure de l’entretien', example: '07/12/2026 à 13:30' },
    duree: { key: 'duree', label: 'Durée (minutes)', example: '120' },
    lieu: { key: 'lieu', label: 'Lieu', example: 'Salle de réunion 2' },
    demandeur: { key: 'demandeur', label: 'Nom du·de la demandeur·euse', example: 'Marc Chevalier' },
};
const H = (key, label, example) => ({ key, label, example, html: true });
const EX_INFO = '<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:16px 0;"><div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;margin-bottom:6px;">Bloc d’informations</div><table role="presentation"><tr><td style="padding:4px 12px 4px 0;font-size:13px;color:#64748b;">Date et heure</td><td style="padding:4px 0;font-size:14px;color:#1e293b;">07/12/2026 à 13:30</td></tr></table></div>';

const DEFS = [
    {
        id: 'preparation', label: 'Convocation : préparer son entretien', to: 'Agent·e', color: '#4f46e5',
        description: 'Envoyé à l’agent·e quand son entretien est planifié (le CREP vierge est joint). Le texte s’adapte : si l’agent·e n’a pas accès à « Mon entretien », il est invité·e à préparer l’entretien sur papier et le bouton n’apparaît pas.',
        variables: [V.agent, V.annee, V.evaluateur, V.quand, V.duree, V.lieu, H('info_rdv', 'Bloc « Votre entretien » (date, durée, lieu, évaluateur·rice)', EX_INFO),
            H('phrase_preparation', 'Phrase de préparation (selon l’accès à « Mon entretien »)', 'Merci de le préparer en complétant votre fiche de préparation dans l’application.'),
            H('paragraphe_preparation', 'Paragraphe explicatif (selon l’accès à « Mon entretien »)', '<p style="font-size:13px;color:#64748b;">Cette préparation nourrit l’échange avec votre évaluateur·rice.</p>')],
        defaults: {
            subject: '📝 Préparez votre entretien professionnel {{annee}}',
            title: '📝 Préparez votre entretien',
            intro: 'Bonjour <strong>{{agent}}</strong>,<br><br>votre entretien professionnel {{annee}} est programmé. {{phrase_preparation}}',
            body: '{{info_rdv}}{{paragraphe_preparation}}',
            button: 'Préparer mon entretien',
        },
    },
    {
        id: 'compteRenduEnvoye', label: 'Compte rendu transmis à valider', to: 'Agent·e', color: '#4f46e5',
        description: 'Envoyé à l’agent·e quand son évaluateur·rice lui transmet le compte rendu (circuit de signature électronique).',
        variables: [V.agent, V.annee, V.evaluateur, { key: 'date_limite', label: 'Date limite de retour du papier', example: '15/12/2026' },
            H('phrase_papier', 'Phrase sur le retour papier (si une date limite est fixée)', '<p style="font-size:13px;color:#64748b;">Si vous devez imprimer et signer le compte rendu sur papier, merci de le retourner <strong>au plus tard le 15/12/2026</strong>.</p>')],
        defaults: {
            subject: '📄 Votre compte rendu d’entretien professionnel est disponible',
            title: '📄 Compte rendu à valider',
            intro: 'Bonjour <strong>{{agent}}</strong>,<br><br>{{evaluateur}} vous a transmis le compte rendu de votre entretien professionnel {{annee}}.',
            body: '<p style="font-size:14px;color:#334155;">Merci de le <strong>relire</strong>, puis de faire les deux étapes suivantes :</p>'
                + '<ol style="font-size:14px;color:#334155;line-height:1.7;padding-left:20px;"><li><strong>Renseigner les deux cases qui vous sont réservées</strong>, en bas du compte rendu (indiquer « Néant » s’il n’y a rien à signaler) : vos observations sur les conditions de travail et le fonctionnement du service, puis vos observations sur l’entretien.</li>'
                + '<li><strong>Valider</strong> avec le bouton « Valider et envoyer pour signature » : le compte rendu est alors transmis dans le parapheur pour être cosigné par vous et par votre évaluateur·rice. Vous recevrez ensuite votre lien de signature par e-mail.</li></ol>{{phrase_papier}}',
            button: 'Relire et valider mon compte rendu',
        },
    },
    {
        id: 'compteRenduRappele', label: 'Compte rendu rappelé (en correction)', to: 'Agent·e', color: '#64748b',
        description: 'Envoyé à l’agent·e quand son évaluateur·rice rappelle le compte rendu qui lui avait été transmis.',
        variables: [V.agent, V.annee, V.evaluateur],
        defaults: {
            subject: 'Votre compte rendu d’entretien professionnel est en cours de correction',
            title: 'Compte rendu rappelé',
            intro: 'Bonjour <strong>{{agent}}</strong>,<br><br>{{evaluateur}} a rappelé le compte rendu de votre entretien professionnel {{annee}} qui vous avait été transmis.',
            body: '<p style="font-size:14px;color:#334155;">Il est en cours de correction : vous n’avez rien à faire pour l’instant. Vous serez prévenu·e par e-mail dès qu’une version corrigée vous sera envoyée.</p>',
            button: '',
        },
    },
    {
        id: 'crepRecu', label: 'CREP reçu et vérifié (remerciements)', to: 'Agent·e et évaluateur·rice', color: '#16a34a',
        description: 'Envoyé à l’agent·e et à son évaluateur·rice quand les administrateurs ont numérisé et vérifié le CREP signé : l’entretien est clos.',
        variables: [{ key: 'destinataire', label: 'Nom du destinataire', example: 'Isabelle Abbas' }, V.agent, V.evaluateur, V.annee],
        defaults: {
            subject: 'Entretien professionnel {{annee}} : CREP reçu, tout est en ordre',
            title: 'CREP reçu et vérifié',
            intro: 'Bonjour <strong>{{destinataire}}</strong>,<br><br>le compte rendu de l’entretien professionnel {{annee}} de <strong>{{agent}}</strong> (évaluateur·rice : {{evaluateur}}) a bien été reçu et vérifié.',
            body: '<p style="font-size:14px;color:#334155;"><strong>Merci à vous</strong> pour le temps consacré à cet entretien. Tout est en ordre pour la DRH : le CREP signé est conservé et l’entretien est clos, vous n’avez plus aucune démarche à effectuer.</p><p style="font-size:13px;color:#64748b;">Le CREP est désormais consultable dans le dossier de l’agent·e.</p>',
            button: '',
        },
    },
    {
        id: 'aPlanifier', label: 'Entretien à planifier', to: 'Évaluateur·rice', color: '#4f46e5',
        description: 'Envoyé à l’évaluateur·rice quand un entretien lui est attribué et qu’aucune date n’est fixée.',
        variables: [V.evaluateur, V.agent, V.annee, V.service, H('info_agent', 'Bloc « Entretien à planifier » (agent·e, service)', EX_INFO),
            H('phrase_prevenir', 'Fin de phrase « et prévient l’agent·e… » (seulement si l’agent·e a accès à « Mon entretien »)', ' et prévient l’agent·e pour qu’il·elle prépare son entretien')],
        defaults: {
            subject: '📅 Entretien professionnel à planifier — {{agent}}',
            title: '📅 Entretien à planifier',
            intro: 'Bonjour <strong>{{evaluateur}}</strong>,<br><br>vous êtes désigné·e évaluateur·rice de l’entretien professionnel {{annee}} de <strong>{{agent}}</strong>.',
            body: '{{info_agent}}<p style="font-size:14px;color:#334155;">Vous pouvez fixer vous-même le rendez-vous : l’application propose les prochains créneaux libres communs à l’agent·e et à vous, envoie l’invitation Outlook{{phrase_prevenir}}.</p>',
            button: 'Planifier dans « EP que je réalise »',
        },
    },
    {
        id: 'rdvPlanifie', label: 'Entretien planifié', to: 'Évaluateur·rice', color: '#4f46e5',
        description: 'Envoyé à l’évaluateur·rice quand un rendez-vous est fixé. La phrase sur la préparation dépend de l’accès de l’agent·e à « Mon entretien ».',
        variables: [V.evaluateur, V.agent, V.annee, V.service, V.quand, V.duree, V.lieu, H('info_rdv', 'Bloc « Rendez-vous » (agent·e, service, date, durée, lieu)', EX_INFO),
            H('phrase_preparation_agent', 'Phrase sur la préparation de l’agent·e (selon son accès à « Mon entretien »)', 'L’agent·e a été invité·e à préparer son entretien dans « Mon entretien ».')],
        defaults: {
            subject: '📅 Entretien professionnel planifié — {{agent}}',
            title: '📅 Entretien planifié',
            intro: 'Bonjour <strong>{{evaluateur}}</strong>,<br><br>l’entretien professionnel {{annee}} de <strong>{{agent}}</strong> est planifié.',
            body: '{{info_rdv}}<p style="font-size:14px;color:#334155;">{{phrase_preparation_agent}} Après l’entretien, vous rédigez le compte rendu dans « EP que je réalise », puis vous suivez le circuit de signature indiqué dans l’application.</p>',
            button: 'Ouvrir « EP que je réalise »',
        },
    },
    {
        id: 'relancePreparation', label: 'Relance : préparation à transmettre', to: 'Agent·e', color: '#d97706',
        description: 'Relance automatique de l’agent·e (ayant accès à « Mon entretien ») dont l’entretien approche sans préparation transmise.',
        variables: [V.agent, V.annee, V.quand, H('phrase_quand', 'Date entre parenthèses (si connue)', ' (<strong>07/12/2026 à 13:30</strong>)')],
        defaults: {
            subject: '⏰ Rappel : préparez votre entretien professionnel',
            title: '⏰ Préparation à transmettre',
            intro: 'Bonjour <strong>{{agent}}</strong>,<br><br>votre entretien professionnel {{annee}} approche{{phrase_quand}} et votre fiche de préparation n’a pas encore été transmise à votre évaluateur·rice.',
            body: '<p style="font-size:14px;color:#334155;">Merci de la compléter dès que possible : elle permet un échange constructif et factuel le jour de l’entretien.</p>',
            button: 'Compléter ma préparation',
        },
    },
    {
        id: 'relanceValidation', label: 'Relance : compte rendu à valider', to: 'Agent·e', color: '#d97706',
        description: 'Relance automatique de l’agent·e qui n’a pas validé le compte rendu transmis.',
        variables: [V.agent, V.annee, V.evaluateur],
        defaults: {
            subject: '⏰ Rappel : compte rendu d’entretien à valider',
            title: '⏰ Compte rendu à valider',
            intro: 'Bonjour <strong>{{agent}}</strong>,<br><br>le compte rendu de votre entretien professionnel {{annee}} transmis par {{evaluateur}} attend votre validation.',
            body: '<p style="font-size:14px;color:#334155;">Merci de le relire, de renseigner vos observations puis de le valider : il sera alors transmis au parapheur pour signature.</p>',
            button: 'Relire et valider',
        },
    },
    {
        id: 'relanceEvaluateur', label: 'Relance : entretiens en attente', to: 'Évaluateur·rice', color: '#d97706',
        description: 'Synthèse hebdomadaire envoyée à l’évaluateur·rice : entretiens à planifier, à finaliser ou à envoyer.',
        variables: [V.evaluateur, V.annee, H('sections', 'Listes des entretiens en attente (générées)', EX_INFO)],
        defaults: {
            subject: '⏰ Rappel : entretiens professionnels en attente',
            title: '⏰ Entretiens en attente',
            intro: 'Bonjour <strong>{{evaluateur}}</strong>,<br><br>voici vos entretiens professionnels {{annee}} en attente d’une action de votre part.',
            body: '{{sections}}',
            button: 'Ouvrir « EP que je réalise »',
        },
    },
    {
        id: 'analyseCrepOk', label: 'Lecture du CREP manuscrit terminée', to: 'Évaluateur·rice', color: '#16a34a',
        description: 'Envoyé quand la lecture automatique du document téléversé est terminée (réglage « Lecture des entretiens numérisés » activé).',
        variables: [V.evaluateur, V.agent, V.annee, H('phrase_duree', 'Durée de la lecture', ' (durée : 3 min)')],
        defaults: {
            subject: '✅ Lecture du compte rendu manuscrit terminée — {{agent}}',
            title: '✅ Proposition prête à relire',
            intro: 'Bonjour <strong>{{evaluateur}}</strong>,<br><br>la lecture du compte rendu manuscrit de <strong>{{agent}}</strong> (entretien {{annee}}) est terminée{{phrase_duree}}.',
            body: '<p style="font-size:14px;color:#334155;">Les pages, les cases cochées et le manuscrit ont été lus. <strong>Ce n’est qu’une proposition</strong> : ouvrez l’entretien, cliquez sur « Voir la proposition », relisez et corrigez chaque rubrique (les lectures incertaines et les corrections automatiques sont signalées), puis appliquez-la et <strong>validez le compte rendu</strong>.</p>',
            button: 'Relire la proposition',
        },
    },
    {
        id: 'analyseCrepKo', label: 'Lecture du CREP manuscrit impossible', to: 'Évaluateur·rice', color: '#d97706',
        description: 'Envoyé quand la lecture automatique du document téléversé a échoué.',
        variables: [V.evaluateur, V.agent, V.annee, { key: 'erreur', label: 'Message d’erreur', example: 'Document illisible' }],
        defaults: {
            subject: '⚠️ Lecture du compte rendu manuscrit impossible — {{agent}}',
            title: '⚠️ Lecture impossible',
            intro: 'Bonjour <strong>{{evaluateur}}</strong>,<br><br>la lecture du compte rendu manuscrit de <strong>{{agent}}</strong> n’a pas pu aboutir.',
            body: '<p style="font-size:14px;color:#334155;">{{erreur}}</p><p style="font-size:13px;color:#64748b;">Vous pouvez renvoyer les photos depuis l’entretien, ou saisir le compte rendu à la main dans l’outil.</p>',
            button: 'Ouvrir « EP que je réalise »',
        },
    },
    {
        id: 'reouvertureDemande', label: 'Demande de réouverture', to: 'Administrateur·rice', color: '#d97706',
        description: 'Envoyé aux administrateur·rice·s quand un·e évaluateur·rice demande la réouverture d’un entretien clôturé.',
        variables: [V.demandeur, V.agent, V.annee, { key: 'motif', label: 'Justification de la demande', example: 'Erreur sur l’appréciation générale' },
            H('info_motif', 'Bloc « Justification de la demande »', EX_INFO)],
        defaults: {
            subject: '🔓 Demande de réouverture d’un entretien — {{agent}}',
            title: '🔓 Demande de réouverture',
            intro: 'Bonjour,<br><br><strong>{{demandeur}}</strong> demande la <strong>réouverture</strong> de l’entretien professionnel {{annee}} de <strong>{{agent}}</strong>, aujourd’hui clôturé.',
            body: '{{info_motif}}<p style="font-size:13px;color:#64748b;">Vous pouvez accepter (l’entretien redevient modifiable) ou refuser, depuis le menu « Demandes de réouverture ».</p>',
            button: 'Traiter la demande',
        },
    },
    {
        id: 'reouvertureDecision', label: 'Décision sur une demande de réouverture', to: 'Évaluateur·rice', color: '#16a34a',
        description: 'Envoyé au·à la demandeur·euse quand un·e administrateur·rice accepte ou refuse la réouverture.',
        variables: [V.demandeur, V.agent, V.annee, { key: 'decision', label: 'Décision (acceptée / refusée)', example: 'acceptée' }, { key: 'icone', label: 'Icône (✅ / ⛔)', example: '✅' },
            H('info_note', 'Bloc « Message de l’administrateur·rice » (si une note est saisie)', EX_INFO), H('phrase_suite', 'Conséquence de la décision', 'L’entretien est de nouveau modifiable : vous pouvez le compléter puis le clôturer à nouveau.')],
        defaults: {
            subject: '{{icone}} Demande de réouverture {{decision}} — {{agent}}',
            title: 'Réouverture {{decision}}',
            intro: 'Bonjour <strong>{{demandeur}}</strong>,<br><br>votre demande de réouverture de l’entretien professionnel {{annee}} de <strong>{{agent}}</strong> a été <strong>{{decision}}</strong>.',
            body: '{{info_note}}<p style="font-size:14px;color:#334155;">{{phrase_suite}}</p>',
            button: 'Ouvrir MagApp',
        },
    },
    {
        id: 'backlogNouvelle', label: 'Backlog : nouvelle demande', to: 'Administrateur·rice', color: '#4f46e5',
        description: 'Envoyé aux administrateur·rice·s quand quelqu’un dépose une question, une amélioration ou un bug avec l’ampoule.',
        variables: [V.demandeur, { key: 'type', label: 'Type (Question, Amélioration, Bug)', example: 'Bug' }, { key: 'titre', label: 'Titre de la demande', example: 'La page reste bloquée' },
            { key: 'description', label: 'Description', example: 'Après avoir cliqué sur Clôturer…' }, H('info_demande', 'Bloc « Demande » (type, titre, description)', EX_INFO)],
        defaults: {
            subject: '💡 Backlog Entretiens — {{type}} : {{titre}}',
            title: '💡 Nouvelle demande',
            intro: 'Bonjour,<br><br><strong>{{demandeur}}</strong> a déposé une demande au backlog du module Entretiens professionnels.',
            body: '{{info_demande}}',
            button: 'Ouvrir le backlog',
        },
    },
    {
        id: 'backlogCommentaire', label: 'Backlog : nouveau commentaire', to: 'Demandeur·euse', color: '#4f46e5',
        description: 'Envoyé au·à la demandeur·euse quand quelqu’un d’autre commente sa demande.',
        variables: [V.demandeur, { key: 'id', label: 'Numéro de la demande', example: '12' }, { key: 'titre', label: 'Titre de la demande', example: 'La page reste bloquée' },
            { key: 'auteur', label: 'Auteur·e du commentaire', example: 'Marc Chevalier' }, { key: 'texte', label: 'Commentaire', example: 'Merci, nous regardons.' }, H('info_commentaire', 'Bloc « Commentaire »', EX_INFO)],
        defaults: {
            subject: '💬 Backlog Entretiens n° {{id}} — nouveau commentaire',
            title: '💬 Nouveau commentaire',
            intro: 'Bonjour <strong>{{demandeur}}</strong>,<br><br><strong>{{auteur}}</strong> a commenté votre demande n° {{id}} « {{titre}} ».',
            body: '{{info_commentaire}}',
            button: 'Ouvrir MagApp',
        },
    },
    {
        id: 'backlogDecision', label: 'Backlog : suite donnée à une demande', to: 'Demandeur·euse', color: '#16a34a',
        description: 'Envoyé au·à la demandeur·euse quand sa demande est acceptée, refusée, réalisée ou qu’une réponse lui est apportée.',
        variables: [V.demandeur, { key: 'id', label: 'Numéro de la demande', example: '12' }, { key: 'type', label: 'Type (question, amélioration, bug)', example: 'bug' }, { key: 'titre', label: 'Titre de la demande', example: 'La page reste bloquée' },
            { key: 'resultat', label: 'Résultat (acceptée, refusée, réalisée…)', example: 'acceptée : elle est inscrite au backlog' }, { key: 'resultat_court', label: 'Résultat court', example: 'acceptée' }, { key: 'icone', label: 'Icône (✅ / ⛔)', example: '✅' },
            { key: 'par', label: 'Traité·e par', example: 'Marc Chevalier' }, H('info_motif', 'Bloc « Motif / Réponse » (si saisi)', EX_INFO)],
        defaults: {
            subject: '{{icone}} Backlog Entretiens n° {{id}} — {{resultat_court}}',
            title: 'Suite donnée à votre demande',
            intro: 'Bonjour <strong>{{demandeur}}</strong>,<br><br>votre demande n° {{id}} ({{type}}) « {{titre}} » a été <strong>{{resultat}}</strong>.',
            body: '{{info_motif}}<p style="font-size:14px;color:#334155;">Traitée par {{par}}.</p>',
            button: 'Ouvrir MagApp',
        },
    },
];

const BY_ID = new Map(DEFS.map(d => [d.id, d]));
const KEY = (id) => `mail:${id}`;
const FIELDS = ['subject', 'title', 'intro', 'body', 'button'];

let cache = { at: 0, over: new Map() };

/** Recharge les textes modifiés (au plus toutes les 8 s sauf force). */
async function refresh(force) {
    if (!force && Date.now() - cache.at < 8000) return;
    const over = new Map();
    try {
        const rows = await require('../../shared/database').pgDb.all("SELECT key, value FROM hub_entretiens.settings WHERE key LIKE 'mail:%'");
        for (const r of rows) {
            try { const o = JSON.parse(r.value || '{}'); if (o && typeof o === 'object' && Object.keys(o).length) over.set(r.key.slice(5), o); } catch (e) { /* surcharge illisible : ignorée */ }
        }
    } catch (e) { /* aucune surcharge */ }
    cache = { at: Date.now(), over };
}

/** Champs courants d'un modèle (modifiés ou par défaut). */
function fieldsOf(id) {
    const def = BY_ID.get(id);
    if (!def) return null;
    const ov = cache.over.get(id) || {};
    const out = {};
    for (const f of FIELDS) out[f] = typeof ov[f] === 'string' ? ov[f] : def.defaults[f];
    return out;
}

const stripTags = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/**
 * Fabrique l'e-mail { subject, html, content } à partir du modèle courant.
 * vars : valeurs simples (échappées) ; htmlVars : blocs HTML prêts à insérer ; opts : { link, color, noButton, fields }.
 */
function build(id, vars = {}, htmlVars = {}, opts = {}) {
    const def = BY_ID.get(id);
    if (!def) throw new Error(`Modèle d'e-mail inconnu : ${id}`);
    const f = opts.fields || fieldsOf(id);
    const sub = (s, mode) => String(s || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => {
        if (Object.prototype.hasOwnProperty.call(htmlVars, k)) return mode === 'html' ? String(htmlVars[k] ?? '') : stripTags(htmlVars[k]);
        const v = vars[k] == null ? '' : String(vars[k]);
        return mode === 'html' ? esc(v) : v;
    });
    const tidy = (s) => s.replace(/\s{2,}/g, ' ').trim();
    const subject = tidy(sub(f.subject, 'text'));
    const title = tidy(sub(f.title, 'text'));
    const intro = sub(f.intro, 'html');
    const label = tidy(sub(f.button, 'text'));
    const btn = label && opts.link && !opts.noButton ? button(opts.link, esc(label), opts.color || def.color) : '';
    const bodyHtml = `${sub(f.body, 'html')}${btn}`;
    return { subject, ...render(opts.color || def.color, esc(title), intro, bodyHtml, FOOTER) };
}

const clean = (h) => String(h || '').replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\s*\/\s*\1\s*>/gi, '').replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, '').replace(/javascript:/gi, '');

function list() {
    return DEFS.map(d => {
        const cur = fieldsOf(d.id);
        return { id: d.id, label: d.label, to: d.to, description: d.description, variables: d.variables, fields: cur, defaults: d.defaults, modified: cache.over.has(d.id) };
    });
}

/** Enregistre un modèle ; des champs identiques aux textes d'origine (ou vides) ne sont pas conservés. */
async function save(id, fields) {
    const def = BY_ID.get(id);
    if (!def) { const e = new Error('Modèle inconnu.'); e.status = 404; throw e; }
    const over = {};
    for (const f of FIELDS) {
        if (typeof fields?.[f] !== 'string') continue;
        const v = f === 'intro' || f === 'body' ? clean(fields[f]) : String(fields[f]).replace(/<[^>]*>/g, '');
        if (v.length > 20000) { const e = new Error('Texte trop long.'); e.status = 400; throw e; }
        if (v !== def.defaults[f]) over[f] = v;
    }
    const svc = require('./entretiens.service');
    await svc.setSetting(KEY(id), Object.keys(over).length ? JSON.stringify(over) : '');
    await refresh(true);
}

/** Aperçu avec des valeurs d'exemple (champs éventuellement non enregistrés). */
function preview(id, fields) {
    const def = BY_ID.get(id);
    if (!def) { const e = new Error('Modèle inconnu.'); e.status = 404; throw e; }
    const vars = {}, html = {};
    for (const v of def.variables) (v.html ? html : vars)[v.key] = v.example;
    const f = {};
    const cur = fieldsOf(id);
    for (const k of FIELDS) f[k] = typeof fields?.[k] === 'string' ? (k === 'intro' || k === 'body' ? clean(fields[k]) : fields[k]) : cur[k];
    return build(id, vars, html, { link: 'https://magapp.ivry.local//ep/auto', fields: f });
}

refresh(true).catch(() => {});
setInterval(() => { refresh(true).catch(() => {}); }, 30000).unref();

module.exports = { build, refresh, list, save, preview, fieldsOf, DEFS };
