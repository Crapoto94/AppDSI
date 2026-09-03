/**
 * Boîtes mail partagées — alimenté par le formulaire de demande "Demande de
 * boite mail partagée" (hub.request_forms.special_action = 'boite_partagee').
 * Un enregistrement est créé à la soumission (arbitrage_decision NULL = en
 * attente) puis mis à jour quand la tâche d'arbitrage liée au ticket est
 * décidée — cf. request-forms.controller.js#submit et
 * tasks.controller.js#submitArbitrageDecision.
 *
 * Convention de clés fixes attendues dans les réponses du formulaire (comme
 * pour special_action='onboarding_rhstudio') : nom, type, usage, admi
 * (agent, responsable), provisoire, datefin, membres (agent_multi),
 * justification.
 */
const { pgDb } = require('../../shared/database');

async function createRecord(answers, ticketId, formId, user) {
    const admi = (answers.admi && typeof answers.admi === 'object') ? answers.admi : {};
    const membres = Array.isArray(answers.membres) ? answers.membres : [];
    const result = await pgDb.run(
        `INSERT INTO hub.shared_mailboxes
           (nom, type, usage_type, responsable_display, responsable_email, provisoire, date_fin,
            membres, justification, ticket_id, form_id, requested_by_username, requested_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            answers.nom || '',
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

module.exports = { createRecord, syncArbitrageDecision };
