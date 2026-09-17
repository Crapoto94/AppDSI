/**
 * Tâches planifiées du Parapheur électronique.
 *
 * - Digest de signature : vérifié toutes les minutes, l'envoi effectif est
 *   espacé selon `parapheur.notify_interval_minutes` (défaut 2 min). Regroupe
 *   en un seul e-mail les parapheurs activés depuis le dernier envoi.
 * - Relances : tous les jours à 08:00, pour les signataires en retard.
 */
const cron = require('node-cron');
const service = require('./parapheur.service');

let task = null;
let digestTask = null;

function start() {
    if (task) return;
    task = cron.schedule('0 8 * * *', () => {
        service.runReminders().catch((e) => {
            console.error('[PARAPHEUR CRON] échec relances:', e.message);
        });
    });
    console.log('[PARAPHEUR CRON] Relances automatiques programmées (08:00).');

    if (!digestTask) {
        digestTask = cron.schedule('* * * * *', () => {
            service.runSignatureDigest().catch((e) => {
                console.error('[PARAPHEUR CRON] échec digest:', e.message);
            });
        });
        console.log('[PARAPHEUR CRON] Digest de signature programmé (toutes les minutes, envoi selon intervalle paramétré).');
    }
}

module.exports = { start };
