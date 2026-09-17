/**
 * Relances automatiques du Parapheur électronique.
 *
 * Tous les jours à 08:00, relance par email les signataires dont c'est le tour
 * et qui n'ont pas signé depuis REMINDER_INTERVAL_DAYS jours (max 3 relances).
 */
const cron = require('node-cron');
const service = require('./parapheur.service');

let task = null;

function start() {
    if (task) return;
    task = cron.schedule('0 8 * * *', () => {
        service.runReminders().catch((e) => {
            console.error('[PARAPHEUR CRON] échec relances:', e.message);
        });
    });
    console.log('[PARAPHEUR CRON] Relances automatiques programmées (08:00).');
}

module.exports = { start };
