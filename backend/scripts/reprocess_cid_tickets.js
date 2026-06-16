/**
 * reprocess_cid_tickets.js
 *
 * Trouve tous les tickets dont le contenu contient encore des références "cid:"
 * (images inline non résolues depuis le collecteur mail O365) et les réintègre.
 *
 * Usage :
 *   node backend/scripts/reprocess_cid_tickets.js [--dry-run]
 *
 * Options :
 *   --dry-run   Liste les tickets concernés sans effectuer de réintégration.
 */

'use strict';

const path = require('path');
const https = require('https');
const axios = require('axios');

// Initialisation des modules partagés
const setupSqlite = require('../shared/sqlite_db');
const { pool, setupPgDb } = require('../shared/pg_db');
const MailCollectorService = require('../modules/mail_collector/mail_collector.service');

const DRY_RUN = process.argv.includes('--dry-run');

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }
function warn(msg) { console.warn(`[${new Date().toISOString()}] ⚠  ${msg}`); }
function err(msg)  { console.error(`[${new Date().toISOString()}] ✗  ${msg}`); }

// ─── Core ────────────────────────────────────────────────────────────────────

async function findCidTickets(pgPool) {
  const { rows } = await pgPool.query(`
    SELECT t.glpi_id, t.title, t.date_creation
    FROM hub_tickets.tickets t
    WHERE t.content ILIKE '%cid:%'
      AND t.status != 8
    ORDER BY t.glpi_id DESC
  `);
  return rows;
}

async function reprocessTicket(ticketId, sqlite, pgPool, o365, proxyOpts) {
  // 1. Mapping email ↔ ticket
  const { rows: mappings } = await pgPool.query(
    `SELECT * FROM hub_tickets.ticket_email_mapping
     WHERE ticket_id = $1 AND is_initial_email = true
     LIMIT 1`,
    [ticketId]
  );
  if (!mappings.length || !mappings[0].email_message_id) {
    return { status: 'skip', reason: 'Aucun mapping email initial trouvé' };
  }
  const internetMsgId = mappings[0].email_message_id;

  // 2. Collecteur actif
  const { rows: collectors } = await pgPool.query(
    `SELECT * FROM hub_tickets.mail_collectors
     WHERE is_enabled = true AND module != 'copieurs'
     ORDER BY id LIMIT 1`
  );
  if (!collectors.length) {
    return { status: 'skip', reason: 'Aucun collecteur mail actif' };
  }
  const collector = collectors[0];
  const mailbox = collector.mailbox;

  // 3. Token O365
  const token = await MailCollectorService.getGraphToken(o365);

  // 4. Retrouve le message dans Graph par internetMessageId
  const filter = `internetMessageId eq '${internetMsgId.replace(/'/g, "''")}'`;
  let messages = [];

  try {
    const searchRes = await axios.get(
      `https://graph.microsoft.com/v1.0/users/${mailbox}/messages`,
      {
        ...proxyOpts,
        headers: { Authorization: `Bearer ${token}` },
        params: { $filter: filter, $top: 1, $select: 'id,internetMessageId,hasAttachments,subject' }
      }
    );
    messages = searchRes.data.value || [];
  } catch (e) {
    warn(`  ticket ${ticketId} — recherche $filter échouée (${e.message}), tentative $search...`);
  }

  if (!messages.length) {
    try {
      const searchAll = await axios.get(
        `https://graph.microsoft.com/v1.0/users/${mailbox}/messages`,
        {
          ...proxyOpts,
          headers: { Authorization: `Bearer ${token}` },
          params: {
            $search: `"internetMessageId:${internetMsgId}"`,
            $top: 1,
            $select: 'id,internetMessageId,hasAttachments,subject'
          }
        }
      );
      messages = searchAll.data.value || [];
    } catch (e) {
      return { status: 'error', reason: `Introuvable dans Graph : ${e.message}` };
    }
  }

  if (!messages.length) {
    return { status: 'skip', reason: `Email introuvable dans la boîte ${mailbox} (peut avoir été supprimé/archivé)` };
  }

  const graphMsgId = messages[0].id;

  // 5. Télécharge les pièces jointes (inline incluses)
  const attachments = await MailCollectorService.downloadAttachments(token, mailbox, graphMsgId, proxyOpts);
  if (!attachments.length) {
    return { status: 'skip', reason: 'Aucune pièce jointe dans cet email' };
  }

  // 6. Sauvegarde et réécriture cid:
  const createdAtt = await MailCollectorService.addAttachments(ticketId, attachments, 'reprocess-script');
  await MailCollectorService.rewriteInlineImages(ticketId, createdAtt);

  return { status: 'ok', attachments: createdAtt.length };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  log('=== Réintégration des tickets avec images cid: non résolues ===');
  if (DRY_RUN) log('Mode DRY-RUN activé — aucune modification ne sera effectuée.\n');

  // Init SQLite (nécessaire pour les paramètres O365)
  log('Connexion SQLite...');
  const sqlite = await setupSqlite();

  // Init PostgreSQL
  log('Connexion PostgreSQL...');
  await setupPgDb();

  // Config O365
  const o365 = await sqlite.get('SELECT * FROM o365_settings WHERE id = 1');
  if (!o365 || !o365.client_id) {
    err('O365 non configuré dans SQLite (o365_settings). Abandon.');
    process.exit(1);
  }

  // Config proxy
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || null;
  const proxyOpts = proxyUrl
    ? { httpsAgent: new (require('https-proxy-agent').HttpsProxyAgent)(proxyUrl, { rejectUnauthorized: false }), proxy: false }
    : { httpsAgent: new https.Agent({ rejectUnauthorized: false }) };

  // Trouve les tickets concernés
  log('Recherche des tickets avec cid: dans le contenu...');
  const tickets = await findCidTickets(pool);

  if (!tickets.length) {
    log('✓ Aucun ticket avec cid: non résolu trouvé. Rien à faire.');
    await pool.end();
    return;
  }

  log(`\n${tickets.length} ticket(s) trouvé(s) :\n`);
  for (const t of tickets) {
    log(`  #${t.glpi_id} — ${(t.title || '').substring(0, 60)} — créé le ${t.date_creation?.toISOString().slice(0,10) || '?'}`);
  }
  console.log('');

  if (DRY_RUN) {
    log('Dry-run terminé. Relancez sans --dry-run pour effectuer la réintégration.');
    await pool.end();
    return;
  }

  // Traitement ticket par ticket
  const results = { ok: 0, skip: 0, error: 0 };

  for (const t of tickets) {
    log(`→ Ticket ${t.glpi_id} (${(t.title || '').substring(0, 50)})...`);
    try {
      const result = await reprocessTicket(t.glpi_id, sqlite, pool, o365, proxyOpts);
      if (result.status === 'ok') {
        log(`  ✓ ${result.attachments} pièce(s) jointe(s) importée(s)`);
        results.ok++;
      } else if (result.status === 'skip') {
        warn(`  → Ignoré : ${result.reason}`);
        results.skip++;
      } else {
        err(`  Erreur : ${result.reason}`);
        results.error++;
      }
    } catch (e) {
      err(`  Exception : ${e.message}`);
      results.error++;
    }
    // Petite pause entre chaque ticket pour ne pas saturer l'API Graph
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('');
  log('=== Résumé ===');
  log(`  ✓ Réintégrés  : ${results.ok}`);
  log(`  → Ignorés     : ${results.skip}`);
  log(`  ✗ Erreurs     : ${results.error}`);
  log(`  Total traités : ${tickets.length}`);

  await pool.end();
}

main().catch(e => {
  err(`Erreur fatale : ${e.message}`);
  console.error(e);
  process.exit(1);
});
