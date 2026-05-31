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
const controller = require('./backup.controller');

let task = null;       // tâche cron courante (ou null)
let currentExpr = null;

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

/** Initialisation au démarrage du serveur : lit la config et programme. */
async function init() {
  try {
    const cfg = await controller.getAutoConfig();
    reschedule(cfg);
  } catch (e) {
    console.error('[Backup Scheduler] Erreur init :', e.message);
  }
}

module.exports = { init, reschedule, stop, cronExpr, get currentExpr() { return currentExpr; } };
