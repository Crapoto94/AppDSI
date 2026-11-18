/**
 * E-mails du module Entretiens professionnels — même charte que le parapheur (API Ville + repli mailer local).
 * Chaque gabarit renvoie { subject, html, content } (cf. parapheur-email.js#render).
 * Les liens pointent vers l'URL publique de l'application (app_base_url), jamais une adresse en dur.
 */
const { render, esc, button } = require('../parapheur/parapheur-email');
const { getAppBaseUrl } = require('../../shared/app_url');

const DEFAULT_PUBLIC_URL = 'https://dsihub.ivry.local';

/** Lien vers le module (page « Entretiens professionnels ») : URL publique configurée, à défaut dsihub.ivry.local. */
async function entretiensUrl() {
    let base = '';
    try { base = await getAppBaseUrl(); } catch (e) { /* ignore */ }
    if (!base || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(base)) base = DEFAULT_PUBLIC_URL;
    return `${String(base).replace(/\/+$/, '')}/entretiens`;
}

function infoBlock(title, rows) {
    const lines = rows.filter(r => r && r[1]).map(([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;font-size:13px;color:#64748b;white-space:nowrap;">${esc(k)}</td><td style="padding:4px 0;font-size:14px;color:#1e293b;font-weight:600;">${esc(v)}</td></tr>`).join('');
    return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">${esc(title)}</div>
      <table role="presentation" style="border-collapse:collapse;">${lines}</table>
    </div>`;
}

const FOOTER = 'Entretiens professionnels — Hub DSI. Message automatique, merci de ne pas y répondre.';

/** À l'agent : son entretien est planifié, il doit préparer sa fiche. */
function preparation({ agent, annee, quand, duree, lieu, evaluateur, link }) {
    const intro = `Bonjour <strong>${esc(agent)}</strong>,<br><br>votre entretien professionnel${annee ? ` ${esc(annee)}` : ''} est programmé. Merci de le préparer en complétant votre fiche de préparation dans l’application.`;
    const bodyHtml = `${infoBlock('Votre entretien', [['Date et heure', quand], ['Durée', duree ? `${duree} minutes` : ''], ['Lieu', lieu], ['Évaluateur (N+1)', evaluateur]])}
      <p style="font-size:13px;color:#64748b;">Cette préparation (bilan de l’année écoulée, perspectives, besoins de formation) nourrit l’échange avec votre évaluateur. Vous pouvez la modifier jusqu’à l’entretien.</p>
      ${button(link, 'Préparer mon entretien', '#4f46e5')}`;
    return { subject: `📝 Préparez votre entretien professionnel${annee ? ` ${annee}` : ''}`, ...render('#4f46e5', '📝 Préparez votre entretien', intro, bodyHtml, FOOTER) };
}

/** À l'agent : le compte rendu rédigé par l'évaluateur est disponible. */
function compteRenduEnvoye({ agent, annee, evaluateur, link }) {
    const intro = `Bonjour <strong>${esc(agent)}</strong>,<br><br>${esc(evaluateur || 'votre évaluateur')} vous a transmis le compte rendu de votre entretien professionnel${annee ? ` ${esc(annee)}` : ''}.`;
    const bodyHtml = `<p style="font-size:14px;color:#334155;">Merci de le <strong>relire</strong>, de renseigner vos observations, puis de le <strong>valider</strong> : il sera alors transmis dans le parapheur pour être cosigné par vous et par votre évaluateur.</p>
      ${button(link, 'Relire et valider mon compte rendu', '#4f46e5')}`;
    return { subject: `📄 Votre compte rendu d’entretien professionnel est disponible`, ...render('#4f46e5', '📄 Compte rendu à valider', intro, bodyHtml, FOOTER) };
}

/** À l'évaluateur : un entretien lui est attribué, il doit prendre rendez-vous. */
function aPlanifier({ evaluateur, agent, annee, service, link }) {
    const intro = `Bonjour <strong>${esc(evaluateur)}</strong>,<br><br>vous êtes désigné(e) évaluateur de l’entretien professionnel${annee ? ` ${esc(annee)}` : ''} de <strong>${esc(agent)}</strong>.`;
    const bodyHtml = `${infoBlock('Entretien à planifier', [['Agent', agent], ['Service', service]])}
      <p style="font-size:14px;color:#334155;">Vous pouvez fixer vous-même le rendez-vous : l’application propose les prochains créneaux libres communs à l’agent et à vous, envoie l’invitation Outlook et prévient l’agent pour qu’il prépare son entretien.</p>
      ${button(link, 'Planifier dans « Mes EP »', '#4f46e5')}`;
    return { subject: `📅 Entretien professionnel à planifier — ${agent}`, ...render('#4f46e5', '📅 Entretien à planifier', intro, bodyHtml, FOOTER) };
}

/** À l'évaluateur : l'entretien est planifié (rappel du rendez-vous et du suivi à faire). */
function rdvPlanifie({ evaluateur, agent, annee, service, quand, duree, lieu, link }) {
    const intro = `Bonjour <strong>${esc(evaluateur)}</strong>,<br><br>l’entretien professionnel${annee ? ` ${esc(annee)}` : ''} de <strong>${esc(agent)}</strong> est planifié.`;
    const bodyHtml = `${infoBlock('Rendez-vous', [['Agent', agent], ['Service', service], ['Date et heure', quand], ['Durée', duree ? `${duree} minutes` : ''], ['Lieu', lieu]])}
      <p style="font-size:14px;color:#334155;">L’agent a été invité à préparer son entretien. Après l’entretien, vous rédigez le compte rendu dans « Mes EP », puis vous l’envoyez à l’agent pour validation et signature.</p>
      ${button(link, 'Ouvrir « Mes EP »', '#4f46e5')}`;
    return { subject: `📅 Entretien professionnel planifié — ${agent}`, ...render('#4f46e5', '📅 Entretien planifié', intro, bodyHtml, FOOTER) };
}

module.exports = { entretiensUrl, preparation, compteRenduEnvoye, aPlanifier, rdvPlanifie };
