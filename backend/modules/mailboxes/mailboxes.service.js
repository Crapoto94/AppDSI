/**
 * Boîtes mail partagées — module d'inventaire (/boites-partagees), accessible
 * en lecture à tous. Deux façons d'alimenter hub.shared_mailboxes :
 *  1. Automatiquement à la soumission du formulaire de demande "Demande de
 *     boite mail partagée" (hub.request_forms.special_action =
 *     'boite_partagee') — createRecord, arbitrage_decision NULL (en attente)
 *     jusqu'à la décision d'arbitrage liée au ticket (syncArbitrageDecision,
 *     appelée depuis tasks.controller.js#submitArbitrageDecision).
 *  2. Manuellement via le module (créer/modifier une fiche directement,
 *     sans ticket) — createManual / updateRecord.
 *
 * Convention de clés fixes attendues dans les réponses du formulaire (comme
 * pour special_action='onboarding_rhstudio') : nom, type, usage, admi
 * (agent, responsable), provisoire, datefin, membres (agent_multi),
 * justification.
 */
const { pgDb } = require('../../shared/database');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function createRecord(answers, ticketId, formId, user) {
    const admi = (answers.admi && typeof answers.admi === 'object') ? answers.admi : {};
    const membres = Array.isArray(answers.membres) ? answers.membres : [];
    const nom = answers.nom || '';
    const result = await pgDb.run(
        `INSERT INTO hub.shared_mailboxes
           (nom, email, type, usage_type, responsable_display, responsable_email, provisoire, date_fin,
            membres, justification, ticket_id, form_id, requested_by_username, requested_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            nom,
            EMAIL_RE.test(nom) ? nom : null, // pré-remplissage si le nom saisi est déjà une adresse mail
            answers.type || null,
            answers.usage || null,
            admi.displayName || null,
            admi.email || null,
            answers.provisoire === true || answers.provisoire === 'true',
            answers.datefin || null,
            JSON.stringify(membres),
            answers.justification || null,
            ticketId,
            formId,
            user.username,
            user.displayName || user.username,
        ]
    );
    return result.lastID;
}

/** Best-effort : ne fait rien si aucune boîte n'est liée à ce ticket. */
async function syncArbitrageDecision(ticketId, decision, comment) {
    await pgDb.run(
        `UPDATE hub.shared_mailboxes SET arbitrage_decision = ?, arbitrage_comment = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?`,
        [decision, comment || null, ticketId]
    );
}

/** Ajout manuel depuis le module (pas de ticket/formulaire associé). */
async function createManual(data, user) {
    const result = await pgDb.run(
        `INSERT INTO hub.shared_mailboxes
           (nom, email, type, usage_type, responsable_display, responsable_email, provisoire, date_fin,
            membres, justification, requested_by_username, requested_by_name, arbitrage_decision, arbitrage_comment,
            date_creation, ad_sync_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            data.nom || '',
            data.email || null,
            data.type || null,
            data.usage_type || null,
            data.responsable_display || null,
            data.responsable_email || null,
            !!data.provisoire,
            data.date_fin || null,
            JSON.stringify(Array.isArray(data.membres) ? data.membres : []),
            data.justification || null,
            user.username,
            user.displayName || user.username,
            ['positif', 'negatif'].includes(data.arbitrage_decision) ? data.arbitrage_decision : null,
            data.arbitrage_comment || null,
            data.date_creation || null,
            data.ad_sync_error || null,
        ]
    );
    return result.lastID;
}

const EDITABLE_FIELDS = [
    'nom', 'email', 'type', 'usage_type', 'responsable_display', 'responsable_email',
    'provisoire', 'date_fin', 'membres', 'justification', 'arbitrage_decision', 'arbitrage_comment',
    'date_creation', 'ad_sync_error',
];

async function updateRecord(id, data) {
    const fields = [];
    const values = [];
    for (const key of EDITABLE_FIELDS) {
        if (data[key] === undefined) continue;
        fields.push(`${key} = ?`);
        if (key === 'membres') {
            values.push(JSON.stringify(Array.isArray(data.membres) ? data.membres : []));
        } else if (key === 'arbitrage_decision') {
            values.push(['positif', 'negatif'].includes(data.arbitrage_decision) ? data.arbitrage_decision : null);
        } else if (key === 'provisoire') {
            values.push(!!data.provisoire);
        } else {
            values.push(data[key] === '' ? null : data[key]);
        }
    }
    if (fields.length === 0) return;
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    await pgDb.run(`UPDATE hub.shared_mailboxes SET ${fields.join(', ')} WHERE id = ?`, values);
}

async function deleteRecord(id) {
    await pgDb.run('DELETE FROM hub.shared_mailboxes WHERE id = ?', [id]);
}

module.exports = { createRecord, syncArbitrageDecision, createManual, updateRecord, deleteRecord };
