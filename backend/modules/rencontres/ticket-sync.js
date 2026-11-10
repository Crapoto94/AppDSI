/**
 * Synchronisation ticket DSIHUB → demande des rencontres budgétaires.
 *
 * Quand un ticket lié à une demande (rencontres_budgetaires.ticket_glpi) est résolu/clos
 * (statut 5 ou 6), la demande passe en « terminé » et le commentaire de clôture du ticket
 * (champ solution) est ajouté à son suivi.
 */
const { pgDb } = require('../../shared/database');

const STATUT_TERMINE = 'terminé';

const htmlToText = (html) => String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

async function syncDemandeFromTicket(ticketId) {
    try {
        const ticket = await pgDb.get('SELECT glpi_id, status, solution FROM hub_tickets.tickets WHERE glpi_id = $1', [ticketId]);
        if (!ticket || ![5, 6].includes(Number(ticket.status))) return;

        const demandes = await pgDb.all(
            'SELECT id, statut, suivi FROM hub_rencontres.rencontres_budgetaires WHERE ticket_glpi = $1',
            [String(ticketId)]
        );
        if (!demandes || demandes.length === 0) return;

        const solution = htmlToText(ticket.solution);
        const date = new Date().toLocaleDateString('fr-FR');

        for (const d of demandes) {
            let suivi = d.suivi || '';
            // Évite d'ajouter deux fois le même commentaire de clôture (ticket résolu puis clos)
            if (solution && !suivi.includes(solution)) {
                const ligne = `[${date} - Ticket #${ticketId} clos] ${solution}`;
                suivi = suivi ? `${suivi}\n${ligne}` : ligne;
            }
            if (d.statut === STATUT_TERMINE && suivi === (d.suivi || '')) continue;
            await pgDb.run(
                'UPDATE hub_rencontres.rencontres_budgetaires SET statut = $1, suivi = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
                [STATUT_TERMINE, suivi, d.id]
            );
        }
    } catch (e) {
        // Ne doit jamais empêcher la résolution/clôture du ticket
        console.error('[RENCONTRES] sync ticket → demande échouée:', e.message);
    }
}

// Tâche de projet issue d'une demande budgétaire : sa validation termine la demande.
async function syncDemandeFromTask(taskId) {
    try {
        const t = await pgDb.get('SELECT id, statut, rencontre_id, tache FROM projets.projet_taches_standalone WHERE id = $1', [taskId]);
        if (!t || !t.rencontre_id) return;
        if (!['terminé', 'terminee', 'terminée', 'termine'].includes(String(t.statut || '').toLowerCase())) return;
        const d = await pgDb.get('SELECT id, statut, suivi FROM hub_rencontres.rencontres_budgetaires WHERE id = $1', [t.rencontre_id]);
        if (!d || d.statut === STATUT_TERMINE) return;
        const ligne = `[${new Date().toLocaleDateString('fr-FR')} - Tâche du projet terminée]`;
        const suivi = d.suivi ? `${d.suivi}\n${ligne}` : ligne;
        await pgDb.run(
            'UPDATE hub_rencontres.rencontres_budgetaires SET statut = $1, suivi = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [STATUT_TERMINE, suivi, d.id]
        );
    } catch (e) {
        console.error('[RENCONTRES] sync tâche → demande échouée:', e.message);
    }
}

module.exports = { syncDemandeFromTicket, syncDemandeFromTask, STATUT_TERMINE };
