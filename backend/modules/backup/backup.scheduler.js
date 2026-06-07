/**
 * Planificateur de la sauvegarde automatique.
 *
 * Lit la configuration (SQLite app_settings, clé `backup.auto_config`) via le
 * contrôleur, programme une tâche cron unique et déclenche
 * `runAutomaticBackup('auto')` à l'heure choisie. La tâche est reprogrammée à
 * chaque enregistrement de la configuration (voir saveAutoConfigRoute).
 *
 * Multiplateforme : node-cron n'a aucune dépendance OS (Windows dev / Linux prod).
 */
const cron = require('node-cron');
const { getSqlite } = require('../../shared/database');
const controller = require('./backup.controller');

let task = null;        // tâche cron de sauvegarde (ou null)
let currentExpr = null;
let watchdogTask = null; // tâche cron de surveillance (alerte si retard)

/**
 * Construit l'expression cron à partir de la config.
 *   daily   -> tous les jours à HH:00
 *   weekly  -> chaque <weekday> à HH:00 (0 = dimanche)
 *   monthly -> le 1er du mois à HH:00
 * Format : minute heure jour_du_mois mois jour_de_semaine
 */
function cronExpr(cfg) {
  const h = Math.min(23, Math.max(0, parseInt(cfg.hour, 10) || 0));
  const wd = Math.min(6, Math.max(0, parseInt(cfg.weekday, 10) || 0));
  switch (cfg.frequency) {
    case 'daily':   return `0 ${h} * * *`;
    case 'monthly': return `0 ${h} 1 * *`;
    case 'weekly':
    default:        return `0 ${h} * * ${wd}`;
  }
}

/** Arrête la tâche cron en cours, le cas échéant. */
function stop() {
  if (task) {
    try { task.stop(); } catch (e) {}
    task = null;
    currentExpr = null;
    console.log('[Backup Scheduler] Tâche arrêtée.');
  }
}

/** (Re)programme la tâche d'après la configuration fournie. */
function reschedule(cfg) {
  stop();
  if (!cfg || !cfg.enabled) {
    console.log('[Backup Scheduler] Sauvegarde automatique désactivée.');
    return;
  }
  const expr = cronExpr(cfg);
  if (!cron.validate(expr)) {
    console.error(`[Backup Scheduler] Expression cron invalide : ${expr}`);
    return;
  }
  task = cron.schedule(expr, () => {
    console.log(`[Backup Scheduler] Déclenchement (cron: ${expr})`);
    controller.runAutomaticBackup('auto').catch((e) => {
      console.error('[Backup Scheduler] Échec sauvegarde automatique :', e.message);
    });
  });
  currentExpr = expr;
  console.log(`[Backup Scheduler] Programmée : ${cfg.frequency} (cron: ${expr})`);
}

/**
 * Surveillance quotidienne : alerte par e-mail si aucune sauvegarde réussie
 * depuis trop longtemps. Toujours active (indépendante de la fréquence choisie).
 */
function startWatchdog() {
  if (watchdogTask) return;
  // tous les jours à 09:00
  watchdogTask = cron.schedule('0 9 * * *', () => {
    controller.checkBackupHealth().catch((e) => {
      console.error('[Backup Watchdog] Échec vérification :', e.message);
    });
  });
  console.log('[Backup Scheduler] Surveillance activée (alerte si retard, 09:00).');
}

/**
 * Initialisation au démarrage du serveur : lit la config et programme.
 * Retry si SQLite n'est pas encore prêt (la config y est stockée), pour rester
 * robuste quel que soit l'ordre d'initialisation (conteneur Docker).
 */
async function init(attempt = 0) {
  if (!getSqlite() && attempt < 10) {
    setTimeout(() => init(attempt + 1).catch(() => {}), 3000);
    return;
  }
  try {
    const cfg = await controller.getAutoConfig();
    reschedule(cfg);
    startWatchdog();
  } catch (e) {
    console.error('[Backup Scheduler] Erreur init :', e.message);
  }
}

module.exports = { init, reschedule, stop, cronExpr, startWatchdog, get currentExpr() { return currentExpr; } };
