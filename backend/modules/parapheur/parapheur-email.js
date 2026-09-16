/**
 * Templates email du module Parapheur électronique.
 * Chaque fonction renvoie { subject, html }.
 */

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function wrap({ color, title, intro, bodyHtml, footer }) {
    return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#334155;">
    <div style="background:${color};color:#fff;padding:28px 24px;border-radius:10px 10px 0 0;">
      <h1 style="margin:0;font-size:22px;font-weight:800;">${title}</h1>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;">
      <p style="margin:0 0 16px;font-size:15px;">${intro}</p>
      ${bodyHtml}
      <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px;">
        ${footer || 'Ce message a été généré automatiquement par le Hub DSI. Merci de ne pas y répondre.'}
      </p>
    </div>
  </div>
</body></html>`;
}

function docListHtml(documents) {
    if (!documents || !documents.length) return '';
    const items = documents
        .map(d => `<li style="margin:4px 0;">${esc(d.original_name)}</li>`)
        .join('');
    return `<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin:16px 0;">
      <div style="font-size:11px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Documents à signer</div>
      <ul style="margin:0;padding-left:20px;font-size:14px;color:#1e293b;">${items}</ul>
    </div>`;
}

function button(url, label, color) {
    return `<p style="text-align:center;margin:24px 0;">
      <a href="${url}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:700;padding:14px 32px;border-radius:8px;font-size:15px;">${label}</a>
    </p>`;
}

function signatureRequest({ signataireNom, requesterName, title, reference, documents, link, deadline, mode, frontUrl }) {
    const modeTxt = mode === 'sequentiel'
        ? 'Diffusion séquentielle : vous êtes invité(e) à signer à votre tour.'
        : 'Diffusion parallèle : vous pouvez signer dès maintenant.';
    const deadlineHtml = deadline
        ? `<p style="font-size:13px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;">⏰ Merci de signer avant le <strong>${esc(new Date(deadline).toLocaleDateString('fr-FR'))}</strong>.</p>`
        : '';
    return {
        subject: `✍️ Document à signer — ${title}`,
        html: wrap({
            color: '#2563eb',
            title: '✍️ Signature requise',
            intro: `Bonjour <strong>${esc(signataireNom)}</strong>,<br><br><strong>${esc(requesterName)}</strong> vous invite à signer électroniquement le parapheur <strong>${esc(title)}</strong>${reference ? ` (réf. ${esc(reference)})` : ''}.`,
            bodyHtml: `${docListHtml(documents)}<p style="font-size:13px;color:#64748b;">${esc(modeTxt)}</p>${deadlineHtml}${button(link, 'Consulter et signer', '#2563eb')}`,
            footer: frontUrl ? `Hub DSI — ${esc(frontUrl)}` : undefined,
        }),
    };
}

function signatureProgress({ requesterName, signataireNom, title, reference, signedCount, totalCount, done, link }) {
    return {
        subject: done
            ? `✅ Parapheur signé — ${title}`
            : `✍️ Signature reçue — ${title}`,
        html: wrap({
            color: done ? '#16a34a' : '#0d9488',
            title: done ? '✅ Parapheur entièrement signé' : '✍️ Signature enregistrée',
            intro: `Bonjour <strong>${esc(requesterName)}</strong>,`,
            bodyHtml: `
              <p style="font-size:15px;"><strong>${esc(signataireNom)}</strong> a signé le parapheur <strong>${esc(title)}</strong>${reference ? ` (réf. ${esc(reference)})` : ''}.</p>
              <p style="font-size:15px;">Progression : <strong>${signedCount}/${totalCount}</strong> signataire(s).</p>
              ${done ? '<p style="font-size:15px;color:#16a34a;font-weight:700;">Toutes les signatures ont été recueillies. Le parcours est terminé.</p>' : ''}
              ${button(link, 'Ouvrir le parapheur', done ? '#16a34a' : '#0d9488')}`,
        }),
    };
}

function signatureRejected({ requesterName, signataireNom, title, reference, comment, link }) {
    return {
        subject: `❌ Signature refusée — ${title}`,
        html: wrap({
            color: '#dc2626',
            title: '❌ Signature refusée',
            intro: `Bonjour <strong>${esc(requesterName)}</strong>,`,
            bodyHtml: `
              <p style="font-size:15px;"><strong>${esc(signataireNom)}</strong> a refusé de signer le parapheur <strong>${esc(title)}</strong>${reference ? ` (réf. ${esc(reference)})` : ''}.</p>
              ${comment ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;padding:12px 16px;margin:16px 0;font-style:italic;color:#7f1d1d;">"${esc(comment)}"</div>` : ''}
              <p style="font-size:15px;color:#dc2626;font-weight:700;">Le parcours de signature est interrompu.</p>
              ${button(link, 'Ouvrir le parapheur', '#dc2626')}`,
        }),
    };
}

function signatureReminder({ signataireNom, requesterName, title, reference, documents, link, deadline }) {
    const deadlineHtml = deadline
        ? `<p style="font-size:13px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;">⏰ Échéance : <strong>${esc(new Date(deadline).toLocaleDateString('fr-FR'))}</strong>.</p>`
        : '';
    return {
        subject: `🔔 Rappel — document en attente de votre signature (${title})`,
        html: wrap({
            color: '#d97706',
            title: '🔔 Rappel de signature',
            intro: `Bonjour <strong>${esc(signataireNom)}</strong>,<br><br>Un document transmis par <strong>${esc(requesterName)}</strong> attend toujours votre signature : <strong>${esc(title)}</strong>${reference ? ` (réf. ${esc(reference)})` : ''}.`,
            bodyHtml: `${docListHtml(documents)}${deadlineHtml}${button(link, 'Signer maintenant', '#d97706')}`,
        }),
    };
}

module.exports = {
    signatureRequest,
    signatureProgress,
    signatureRejected,
    signatureReminder,
};
