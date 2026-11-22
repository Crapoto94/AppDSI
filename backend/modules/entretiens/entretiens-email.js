/**
 * E-mails du module Entretiens professionnels — même charte que le parapheur (API Ville + repli mailer local).
 * Chaque gabarit renvoie { subject, html, content } (cf. parapheur-email.js#render).
 * Les liens pointent vers l'URL publique de l'application (app_base_url), jamais une adresse en dur.
 */
const { render, esc, button } = require('../parapheur/parapheur-email');
const { getMagappBaseUrl } = require('../../shared/app_url');

const DEFAULT_MAGAPP_URL = 'https://magapp.ivry.local';

/**
 * Lien vers le module dans MagApp (les agents s'y connectent ; ce n'est plus le DSI Hub).
 * `vue` : « moi » (mon entretien d'agent : préparation, compte rendu à valider), « evaluations » (mes EP d'évaluateur / valideur),
 * « auto » ou vide (MagApp choisit selon la situation de l'agent). L'ouverture directe évite d'arriver sur la liste des agents évalués.
 */
async function entretiensUrl(vue) {
    let base = '';
    try { base = await getMagappBaseUrl(); } catch (e) { /* ignore */ }
    if (!base || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(base)) base = DEFAULT_MAGAPP_URL;
    return `${String(base).replace(/\/+$/, '')}/?ep=${encodeURIComponent(vue || 'auto')}`;
}

function infoBlock(title, rows) {
    const lines = rows.filter(r => r && r[1]).map(([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;font-size:13px;color:#64748b;white-space:nowrap;">${esc(k)}</td><td style="padding:4px 0;font-size:14px;color:#1e293b;font-weight:600;">${esc(v)}</td></tr>`).join('');
    return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">${esc(title)}</div>
      <table role="presentation" style="border-collapse:collapse;">${lines}</table>
    </div>`;
}

const FOOTER = 'Entretiens professionnels — MagApp. Message automatique, merci de ne pas y répondre.';

const fmtDate = (v) => {
    if (!v) return '';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('fr-FR');
};

/** À l'agent : son entretien est planifié, il doit préparer sa fiche. */
function preparation({ agent, annee, quand, duree, lieu, evaluateur, link }) {
    const intro = `Bonjour <strong>${esc(agent)}</strong>,<br><br>votre entretien professionnel${annee ? ` ${esc(annee)}` : ''} est programmé. Merci de le préparer en complétant votre fiche de préparation dans l’application.`;
    const bodyHtml = `${infoBlock('Votre entretien', [['Date et heure', quand], ['Durée', duree ? `${duree} minutes` : ''], ['Lieu', lieu], ['Évaluateur (N+1)', evaluateur]])}
      <p style="font-size:13px;color:#64748b;">Cette préparation (bilan de l’année écoulée, perspectives, besoins de formation) nourrit l’échange avec votre évaluateur. Vous pouvez la modifier jusqu’à l’entretien. Le formulaire CREP vierge est joint à ce message.</p>
      ${button(link, 'Préparer mon entretien', '#4f46e5')}`;
    return { subject: `📝 Préparez votre entretien professionnel${annee ? ` ${annee}` : ''}`, ...render('#4f46e5', '📝 Préparez votre entretien', intro, bodyHtml, FOOTER) };
}

/** À l'agent : le compte rendu rédigé par l'évaluateur est disponible. */
function compteRenduEnvoye({ agent, annee, evaluateur, dateLimite, link }) {
    const intro = `Bonjour <strong>${esc(agent)}</strong>,<br><br>${esc(evaluateur || 'votre évaluateur')} vous a transmis le compte rendu de votre entretien professionnel${annee ? ` ${esc(annee)}` : ''}.`;
    const bodyHtml = `<p style="font-size:14px;color:#334155;">Merci de le <strong>relire</strong>, puis de faire les deux étapes suivantes :</p>
      <ol style="font-size:14px;color:#334155;line-height:1.7;padding-left:20px;">
        <li><strong>Renseigner les deux cases qui vous sont réservées</strong>, en bas du compte rendu (indiquer « Néant » s’il n’y a rien à signaler) :
          <ul style="margin:4px 0;padding-left:18px;"><li>vos observations sur les conditions de travail et le fonctionnement du service ;</li><li>vos observations sur l’entretien.</li></ul></li>
        <li><strong>Valider</strong> avec le bouton « Valider et envoyer pour signature » : le compte rendu est alors transmis dans le parapheur pour être cosigné par vous et par votre évaluateur. Vous recevrez ensuite votre lien de signature par e-mail.</li>
      </ol>
      ${dateLimite ? `<p style="font-size:13px;color:#64748b;">Si vous devez imprimer et signer le compte rendu sur papier, merci de le retourner à votre évaluateur <strong>au plus tard le ${esc(fmtDate(dateLimite))}</strong>.</p>` : ''}
      ${button(link, 'Relire et valider mon compte rendu', '#4f46e5')}`;
    return { subject: `📄 Votre compte rendu d’entretien professionnel est disponible`, ...render('#4f46e5', '📄 Compte rendu à valider', intro, bodyHtml, FOOTER) };
}

/** À l'évaluateur : un entretien lui est attribué, il doit prendre rendez-vous. */
function aPlanifier({ evaluateur, agent, annee, service, link }) {
    const intro = `Bonjour <strong>${esc(evaluateur)}</strong>,<br><br>vous êtes désigné(e) évaluateur de l’entretien professionnel${annee ? ` ${esc(annee)}` : ''} de <strong>${esc(agent)}</strong>.`;
    const bodyHtml = `${infoBlock('Entretien à planifier', [['Agent', agent], ['Service', service]])}
      <p style="font-size:14px;color:#334155;">Vous pouvez fixer vous-même le rendez-vous : l’application propose les prochains créneaux libres communs à l’agent·e et à vous, envoie l’invitation Outlook et prévient l’agent·e pour qu’il prépare son entretien.</p>
      ${button(link, 'Planifier dans « Mes EP »', '#4f46e5')}`;
    return { subject: `📅 Entretien professionnel à planifier — ${agent}`, ...render('#4f46e5', '📅 Entretien à planifier', intro, bodyHtml, FOOTER) };
}

/** À l'évaluateur : l'entretien est planifié (rappel du rendez-vous et du suivi à faire). */
function rdvPlanifie({ evaluateur, agent, annee, service, quand, duree, lieu, link }) {
    const intro = `Bonjour <strong>${esc(evaluateur)}</strong>,<br><br>l’entretien professionnel${annee ? ` ${esc(annee)}` : ''} de <strong>${esc(agent)}</strong> est planifié.`;
    const bodyHtml = `${infoBlock('Rendez-vous', [['Agent', agent], ['Service', service], ['Date et heure', quand], ['Durée', duree ? `${duree} minutes` : ''], ['Lieu', lieu]])}
      <p style="font-size:14px;color:#334155;">L’agent·e a été invité à préparer son entretien. Après l’entretien, vous rédigez le compte rendu dans « Mes EP », puis vous l’envoyez à l’agent·e pour validation et signature.</p>
      ${button(link, 'Ouvrir « Mes EP »', '#4f46e5')}`;
    return { subject: `📅 Entretien professionnel planifié — ${agent}`, ...render('#4f46e5', '📅 Entretien planifié', intro, bodyHtml, FOOTER) };
}

/** À l'agent : le compte rendu envoyé est rappelé par l'évaluateur (en cours de correction). */
function compteRenduRappele({ agent, annee, evaluateur }) {
    const intro = `Bonjour <strong>${esc(agent)}</strong>,<br><br>${esc(evaluateur || 'votre évaluateur')} a rappelé le compte rendu de votre entretien professionnel${annee ? ` ${esc(annee)}` : ''} qui vous avait été transmis.`;
    const bodyHtml = `<p style="font-size:14px;color:#334155;">Il est en cours de correction : vous n’avez rien à faire pour l’instant. Vous serez prévenu(e) par e-mail dès qu’une version corrigée vous sera envoyée.</p>`;
    return { subject: 'Votre compte rendu d’entretien professionnel est en cours de correction', ...render('#64748b', 'Compte rendu rappelé', intro, bodyHtml, FOOTER) };
}

/** Aux administrateurs : un évaluateur demande la réouverture d'un entretien clôturé. */
function reouvertureDemande({ demandeur, agent, annee, motif, link }) {
    const intro = `Bonjour,<br><br><strong>${esc(demandeur)}</strong> demande la <strong>réouverture</strong> de l’entretien professionnel${annee ? ` ${esc(annee)}` : ''} de <strong>${esc(agent)}</strong>, aujourd’hui clôturé.`;
    const bodyHtml = `${infoBlock('Justification de la demande', [['Motif', motif]])}
      <p style="font-size:13px;color:#64748b;">Vous pouvez accepter (l’entretien redevient modifiable) ou refuser, depuis le menu « Demandes de réouverture ».</p>
      ${button(link, 'Traiter la demande', '#d97706')}`;
    return { subject: `🔓 Demande de réouverture d’un entretien — ${agent}`, ...render('#d97706', '🔓 Demande de réouverture', intro, bodyHtml, FOOTER) };
}

/** Au demandeur : décision de l'administrateur. */
function reouvertureDecision({ demandeur, agent, annee, accepte, note, link }) {
    const intro = `Bonjour <strong>${esc(demandeur)}</strong>,<br><br>votre demande de réouverture de l’entretien professionnel${annee ? ` ${esc(annee)}` : ''} de <strong>${esc(agent)}</strong> a été <strong>${accepte ? 'acceptée' : 'refusée'}</strong>.`;
    const bodyHtml = `${note ? infoBlock('Message de l’administrateur', [['Note', note]]) : ''}
      <p style="font-size:14px;color:#334155;">${accepte ? 'L’entretien est de nouveau modifiable : vous pouvez le compléter puis le clôturer à nouveau.' : 'L’entretien reste clôturé.'}</p>
      ${button(link, 'Ouvrir MagApp', accepte ? '#16a34a' : '#64748b')}`;
    return { subject: `${accepte ? '✅' : '⛔'} Demande de réouverture ${accepte ? 'acceptée' : 'refusée'} — ${agent}`, ...render(accepte ? '#16a34a' : '#64748b', accepte ? 'Réouverture acceptée' : 'Réouverture refusée', intro, bodyHtml, FOOTER) };
}

/** Aux administrateurs : nouvelle demande au backlog (question, amélioration, bug). */
function backlogNouvelle({ type, titre, description, demandeur, link }) {
    const intro = `Bonjour,<br><br><strong>${esc(demandeur)}</strong> a déposé une demande au backlog du module Entretiens professionnels.`;
    const bodyHtml = `${infoBlock('Demande', [['Type', type], ['Titre', titre], ['Description', description]])}
      ${button(link, 'Ouvrir le backlog', '#4f46e5')}`;
    return { subject: `💡 Backlog Entretiens — ${type} : ${titre}`, ...render('#4f46e5', '💡 Nouvelle demande', intro, bodyHtml, FOOTER) };
}

/** Au demandeur : suite donnée à sa demande. */
function backlogDecision({ demandeur, id, type, titre, statut, motif, par, link }) {
    const LIB = { acceptee: 'acceptée : elle est inscrite au backlog', refusee: 'refusée', realisee: 'réalisée : elle est disponible', repondue: 'traitée : une réponse vous est apportée' };
    const ok = statut !== 'refusee';
    const intro = `Bonjour <strong>${esc(demandeur)}</strong>,<br><br>votre demande n° ${esc(id)} (${esc(String(type).toLowerCase())}) « ${esc(titre)} » a été <strong>${LIB[statut] || esc(statut)}</strong>.`;
    const bodyHtml = `${motif ? infoBlock(statut === 'refusee' ? 'Motif' : 'Réponse', [['Message', motif]]) : ''}
      <p style="font-size:14px;color:#334155;">Traitée par ${esc(par)}.</p>
      ${button(link, 'Ouvrir MagApp', ok ? '#16a34a' : '#64748b')}`;
    return { subject: `${ok ? '✅' : '⛔'} Backlog Entretiens n° ${id} — ${LIB[statut] ? LIB[statut].split(' :')[0] : statut}`, ...render(ok ? '#16a34a' : '#64748b', 'Suite donnée à votre demande', intro, bodyHtml, FOOTER) };
}

/** Relance à l'agent : préparation non transmise alors que l'entretien approche. */
function relancePreparation({ agent, annee, quand, link }) {
    const intro = `Bonjour <strong>${esc(agent)}</strong>,<br><br>votre entretien professionnel${annee ? ` ${esc(annee)}` : ''} approche${quand ? ` (<strong>${esc(quand)}</strong>)` : ''} et votre fiche de préparation n’a pas encore été transmise à votre évaluateur.`;
    const bodyHtml = `<p style="font-size:14px;color:#334155;">Merci de la compléter dès que possible : elle permet un échange constructif et factuel le jour de l’entretien.</p>
      ${button(link, 'Compléter ma préparation', '#4f46e5')}`;
    return { subject: '⏰ Rappel : préparez votre entretien professionnel', ...render('#d97706', '⏰ Préparation à transmettre', intro, bodyHtml, FOOTER) };
}

/** Relance à l'agent : compte rendu reçu, en attente de sa validation. */
function relanceValidation({ agent, annee, evaluateur, link }) {
    const intro = `Bonjour <strong>${esc(agent)}</strong>,<br><br>le compte rendu de votre entretien professionnel${annee ? ` ${esc(annee)}` : ''} transmis par ${esc(evaluateur || 'votre évaluateur')} attend votre validation.`;
    const bodyHtml = `<p style="font-size:14px;color:#334155;">Merci de le relire, de renseigner vos observations puis de le valider : il sera alors transmis au parapheur pour signature.</p>
      ${button(link, 'Relire et valider', '#4f46e5')}`;
    return { subject: '⏰ Rappel : compte rendu d’entretien à valider', ...render('#d97706', '⏰ Compte rendu à valider', intro, bodyHtml, FOOTER) };
}

/** Relance à l'évaluateur : synthèse de ses entretiens en attente (à planifier, à finaliser, à envoyer). */
function relanceEvaluateur({ evaluateur, annee, sections, link }) {
    const intro = `Bonjour <strong>${esc(evaluateur)}</strong>,<br><br>voici vos entretiens professionnels${annee ? ` ${esc(annee)}` : ''} en attente d’une action de votre part.`;
    const bodyHtml = sections.filter(s => s.items.length).map(s => infoBlock(`${s.title} (${s.items.length})`, s.items.map(i => [i.agent, i.detail || '—']))).join('')
        + button(link, 'Ouvrir « Mes EP »', '#4f46e5');
    return { subject: '⏰ Rappel : entretiens professionnels en attente', ...render('#d97706', '⏰ Entretiens en attente', intro, bodyHtml, FOOTER) };
}

/** À l'évaluateur : l'analyse du CREP manuscrit (IA locale) est terminée, ou a échoué. */
function analyseCrep({ evaluateur, agent, annee, ok, error, dureeMs, link }) {
    const mins = dureeMs ? Math.max(1, Math.round(dureeMs / 60000)) : null;
    const intro = `Bonjour <strong>${esc(evaluateur)}</strong>,<br><br>`
        + (ok
            ? `la lecture du compte rendu manuscrit de <strong>${esc(agent)}</strong>${annee ? ` (entretien ${esc(annee)})` : ''} est terminée${mins ? ` (durée : ${mins} min)` : ''}.`
            : `la lecture du compte rendu manuscrit de <strong>${esc(agent)}</strong> n’a pas pu aboutir.`);
    const bodyHtml = ok
        ? `<p style="font-size:14px;color:#334155;">Les pages, les cases cochées et le manuscrit ont été lus. <strong>Ce n’est qu’une proposition</strong> : ouvrez l’entretien, cliquez sur « Voir la proposition », relisez et corrigez chaque rubrique (les lectures incertaines et les corrections automatiques sont signalées), puis appliquez-la et <strong>validez le compte rendu</strong>.</p>
           ${button(link, 'Relire la proposition', '#4f46e5')}`
        : `<p style="font-size:14px;color:#334155;">${esc(error || 'Erreur inconnue.')}</p><p style="font-size:13px;color:#64748b;">Vous pouvez renvoyer les photos depuis l’entretien, ou saisir le compte rendu à la main dans l’outil.</p>
           ${button(link, 'Ouvrir « Mes EP »', '#4f46e5')}`;
    return { subject: ok ? `✅ Lecture du compte rendu manuscrit terminée — ${agent}` : `⚠️ Lecture du compte rendu manuscrit impossible — ${agent}`, ...render(ok ? '#16a34a' : '#d97706', ok ? '✅ Proposition prête à relire' : '⚠️ Lecture impossible', intro, bodyHtml, FOOTER) };
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

// Tous les modèles reçoivent des noms propres (évaluateur, agent) : normalisés ici, une fois pour toutes
const wrap = (fn) => (p = {}) => fn({ ...p, ...(p.agent ? { agent: nice(p.agent) } : {}), ...(p.evaluateur ? { evaluateur: nice(p.evaluateur) } : {}) });

module.exports = {
    analyseCrep: wrap(analyseCrep), entretiensUrl, nice,
    preparation: wrap(preparation), compteRenduEnvoye: wrap(compteRenduEnvoye), aPlanifier: wrap(aPlanifier), rdvPlanifie: wrap(rdvPlanifie),
    backlogNouvelle: wrap(backlogNouvelle), backlogDecision: wrap(backlogDecision),
    reouvertureDemande: wrap(reouvertureDemande), reouvertureDecision: wrap(reouvertureDecision),
    relancePreparation: wrap(relancePreparation), relanceValidation: wrap(relanceValidation), relanceEvaluateur: wrap(relanceEvaluateur), compteRenduRappele: wrap(compteRenduRappele),
};
