/**
 * Tâche planifiée du module Entretiens : relances automatiques, chaque jour ouvré à 08:30.
 */
const cron = require('node-cron');
const { runReminders } = require('./entretiens-reminders');

let task = null;

function start() {
    if (task) return;
    task = cron.schedule('30 8 * * 1-5', () => {
        runReminders().then(r => {
            if (r.agentPreparation + r.agentValidation + r.evaluateurs) console.log(`[ENTRETIENS CRON] relances : ${r.agentPreparation} préparation(s), ${r.agentValidation} validation(s), ${r.evaluateurs} évaluateur(s)`);
        }).catch(e => console.error('[ENTRETIENS CRON] échec relances:', e.message));
    });
    console.log('[ENTRETIENS CRON] Relances automatiques programmées (jours ouvrés, 08:30).');
}

module.exports = { start };
