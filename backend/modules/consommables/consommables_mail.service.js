/**
 * Collecteur « Consommables ».
 *
 * Boîte : consoivry@ivry94.fr. Chaque email présent dans la boîte (y compris
 * ceux déjà reçus avant la mise en place du collecteur) est transformé en
 * demande de consommables au statut « pending », afin que les demandes
 * suivantes soient interprétées de la même façon. La déduplication se fait par
 * internetMessageId (table request_email_mapping).
 *
 * Le message d'origine est conservé au format .eml dans la GED (hub_docs,
 * module « consommables ») et rattaché à la demande (source_document_id) pour
 * l'affichage via la visionneuse. Les pièces jointes non inline sont également
 * enregistrées dans la GED.
 */
const axios = require('axios');
const { pgDb } = require('../../shared/database');
const storage = require('../../shared/storage');
const docsService = require('../../shared/documents.service');

const SUBJECT_PREFIX = /^\s*((re|ré|rep|rép|tr|fw|fwd|réf|ref)\s*:\s*)+/i;
const MAX_MESSAGES = 1000;

function stripHtml(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function safeFileName(title, fallback = 'mail') {
  const base = String(title || fallback)
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
  return base || fallback;
}

async function getOrgTable() {
  const v2 = await pgDb.get('SELECT COUNT(*) c FROM oracle.rh_siim_organigramme_v2').catch(() => ({ c: 0 }));
  return Number(v2?.c) > 0 ? 'oracle.rh_siim_organigramme_v2' : 'oracle.rh_siim_organigramme';
}

async function fetchAllMessages(mailbox, token, axiosOpts, sinceTs = null) {
  // Boîte de réception uniquement : les demandes sont les mails reçus (pas les
  // réponses envoyées). Au premier passage (last_run vide), tous les messages
  // présents sont importés ; ensuite on ne relit que la veille + les nouveaux
  // (marge de sécurité pour l'indexation Graph), la déduplication évitant les doublons.
  const baseUrl = `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/inbox/messages`;
  const params = {
    $top: 100,
    $select: 'id,subject,receivedDateTime,from,body,bodyPreview,internetMessageId,hasAttachments',
    $orderby: 'receivedDateTime desc',
  };
  if (sinceTs) params.$filter = `receivedDateTime ge ${new Date(sinceTs).toISOString()}`;
  const all = [];
  let nextLink = null;
  const first = await axios.get(baseUrl, { ...axiosOpts, headers: { Authorization: `Bearer ${token}` }, params });
  all.push(...(first.data.value || []));
  nextLink = first.data['@odata.nextLink'] || null;
  while (nextLink && all.length < MAX_MESSAGES) {
    const res = await axios.get(nextLink, { ...axiosOpts, headers: { Authorization: `Bearer ${token}` } });
    all.push(...(res.data.value || []));
    nextLink = res.data['@odata.nextLink'] || null;
  }
  return all.slice(0, MAX_MESSAGES);
}

async function fetchRawMessage(mailbox, messageId, token, axiosOpts) {
  try {
    const res = await axios.get(
      `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}/$value`,
      { ...axiosOpts, headers: { Authorization: `Bearer ${token}`, Accept: 'message/rfc822' }, responseType: 'arraybuffer' }
    );
    return Buffer.from(res.data);
  } catch (e) {
    console.error('[CONSOMMABLES-MAIL] téléchargement du message brut échoué:', e.message);
    return null;
  }
}

async function fetchAttachments(mailbox, messageId, token, axiosOpts) {
  try {
    const res = await axios.get(
      `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}/attachments`,
      { ...axiosOpts, headers: { Authorization: `Bearer ${token}` }, params: { $top: 20 } }
    );
    return (res.data.value || [])
      .filter(a => a['@odata.type'] === '#microsoft.graph.fileAttachment' && a.isInline !== true)
      .map(a => ({
        buffer: Buffer.from(a.contentBytes || '', 'base64'),
        originalName: a.name || 'piece-jointe',
        mimetype: a.contentType || 'application/octet-stream',
      }))
      .filter(a => a.buffer.length > 0);
  } catch (e) {
    console.error('[CONSOMMABLES-MAIL] récupération des pièces jointes échouée:', e.message);
    return [];
  }
}

async function pickTypeId(subject, bodyText) {
  const types = await pgDb.all('SELECT id, name FROM hub_consommables.consumable_types ORDER BY id');
  if (!types.length) return null;
  const hay = `${subject || ''} ${bodyText || ''}`.toLowerCase();
  const find = (pred) => types.find(t => pred(String(t.name || '').toLowerCase()));
  let type = null;
  if (/fax/.test(hay)) type = find(n => n.includes('fax'));
  else if (/couleur/.test(hay)) type = find(n => n.includes('couleur'));
  else if (/toner|cartouche|laser|noir|mono/.test(hay)) type = find(n => n.includes('laser mono')) || find(n => n.includes('laser'));
  else if (/encre|jet/.test(hay)) type = find(n => n.includes('encre'));
  const divers = find(n => n.includes('divers'));
  return (type || divers || types[0]).id;
}

/**
 * @param {object} collector  ligne hub_tickets.mail_collectors
 * @param {string} token      jeton Graph
 * @param {object} axiosOpts  options axios (proxy/TLS)
 */
async function collect(collector, token, axiosOpts) {
  const log = {
    collector_id: collector.id,
    emails_received: 0, emails_imported: 0, emails_skipped: 0, emails_failed: 0,
    tickets_created: 0, comments_added: 0, attachments_processed: 0,
    errors: [], status: 'success',
  };

  try {
    const sinceTs = collector.last_run
      ? new Date(collector.last_run).getTime() - 86400000
      : null;
    const emails = await fetchAllMessages(collector.mailbox, token, axiosOpts, sinceTs);
    log.emails_received = emails.length;
    const orgTable = await getOrgTable();

    for (const email of emails) {
      const msgId = email.internetMessageId || email.id;
      try {
        const existing = await pgDb.get(
          'SELECT id FROM hub_consommables.request_email_mapping WHERE email_message_id = ?',
          [msgId]
        );
        if (existing) { log.emails_skipped++; continue; }

        const fromEmail = String(email.from?.emailAddress?.address || '').trim();
        const fromName = String(email.from?.emailAddress?.name || fromEmail || 'Inconnu').trim();
        const subject = String(email.subject || '').replace(SUBJECT_PREFIX, '').trim();
        const bodyText = stripHtml(email.body?.content || email.bodyPreview || '');
        const receivedAt = email.receivedDateTime ? new Date(email.receivedDateTime) : new Date();
        const dateCommande = receivedAt.toLocaleString('sv-SE').slice(0, 10);

        // Demandeur : compte Hub par email (ou partie locale), sinon l'adresse.
        let user = null;
        if (fromEmail) {
          user = await pgDb.get(
            `SELECT id, username, displayname, email, service_code, service_complement, requester_phone
             FROM hub.users
             WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)
             LIMIT 1`,
            [fromEmail, fromEmail.split('@')[0]]
          );
        }
        const username = user?.username || fromEmail.split('@')[0] || fromEmail || 'inconnu';
        const nomReferent = user?.displayname || fromName || fromEmail;

        // Direction / service : organigramme RH à partir du code service du compte.
        let direction = '—';
        let service = '—';
        if (user?.service_code) {
          try {
            const org = await pgDb.get(
              `SELECT "DIRECTION_L" AS d, "SERVICE_L" AS s FROM ${orgTable}
               WHERE TRIM("SERVICE") = TRIM(?) LIMIT 1`,
              [user.service_code]
            );
            if (org?.d) direction = String(org.d).trim();
            if (org?.s) service = String(org.s).trim();
            else if (user.service_complement) service = String(user.service_complement).trim();
          } catch { /* organigramme indisponible */ }
        }

        const typeId = await pickTypeId(subject, bodyText);
        if (!typeId) { log.emails_failed++; log.errors.push('Aucun type de consommable configuré'); continue; }

        // Règle métier : un mail sans fichier joint n'est PAS une demande de
        // consommables (les messages d'information, accusés, newsletters sont ignorés).
        const atts = email.hasAttachments
          ? await fetchAttachments(collector.mailbox, email.id, token, axiosOpts)
          : [];
        if (!atts.length) {
          log.emails_skipped++;
          continue;
        }

        const comment = [
          `Reçu par mail le ${receivedAt.toLocaleDateString('fr-FR')} — Objet : ${subject || '(sans objet)'}`,
          bodyText ? `\n\n${bodyText}` : '',
        ].join('').slice(0, 4000);

        const ins = await pgDb.run(
          `INSERT INTO hub_consommables.consumable_requests
             (user_id, username, email, date_commande, direction, service, nom_referent, tel_complet,
              type_id, status, user_comment, source, mail_subject, mail_from, mail_received_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'mail', ?, ?, ?)`,
          [
            String(user?.id || fromEmail || username), username, fromEmail || user?.email || '',
            dateCommande, direction, service, nomReferent, user?.requester_phone || '',
            typeId, comment, subject || null, fromEmail || null, receivedAt.toISOString(),
          ]
        );
        const requestId = ins.lastID;

        // Réservation atomique de l'email (évite les doublons entre deux collectes).
        const map = await pgDb.run(
          `INSERT INTO hub_consommables.request_email_mapping
             (request_id, email_message_id, email_from, email_subject, email_received_at)
           VALUES (?, ?, ?, ?, ?) ON CONFLICT (email_message_id) DO NOTHING`,
          [requestId, msgId, fromEmail || null, subject || null, receivedAt.toISOString()]
        );
        if (map.changes === 0) {
          await pgDb.run('DELETE FROM hub_consommables.consumable_requests WHERE id = ?', [requestId]);
          log.emails_skipped++;
          continue;
        }

        // Fichier original (.eml) → GED + visionneuse.
        const raw = await fetchRawMessage(collector.mailbox, email.id, token, axiosOpts);
        if (raw && raw.length) {
          try {
            const emlName = `${safeFileName(subject || 'Demande consommables')}.eml`;
            const saved = await storage.saveFile('consommables', requestId, {
              buffer: raw, originalname: emlName, mimetype: 'message/rfc822',
            });
            const reg = await docsService.registerExternalUpload({
              module: 'consommables', entityType: 'request', entityId: requestId,
              title: emlName, filename: saved.filename, originalName: emlName,
              mimetype: 'message/rfc822', size: raw.length, storageRef: saved.dbPath,
              uploadedBy: 'collecteur-mail',
              metadata: { kind: 'email', email_message_id: msgId, subject },
            });
            if (reg?.document?.id) {
              await pgDb.run(
                'UPDATE hub_consommables.consumable_requests SET source_document_id = ? WHERE id = ?',
                [reg.document.id, requestId]
              );
            }
            log.attachments_processed++;
          } catch (e) {
            log.errors.push(`Message original non stocké (demande ${requestId}) : ${e.message}`);
          }
        }

        // Pièces jointes (PDF, images…) → GED également.
        for (const att of atts) {
          try {
            const name = safeFileName(att.originalName, 'piece-jointe');
            const saved = await storage.saveFile('consommables', requestId, {
              buffer: att.buffer, originalname: name, mimetype: att.mimetype,
            });
            await docsService.registerExternalUpload({
              module: 'consommables', entityType: 'request', entityId: requestId,
              title: name, filename: saved.filename, originalName: name,
              mimetype: att.mimetype, size: att.buffer.length, storageRef: saved.dbPath,
              uploadedBy: 'collecteur-mail',
              metadata: { kind: 'attachment', email_message_id: msgId, subject },
            });
            log.attachments_processed++;
          } catch (e) {
            log.errors.push(`Pièce jointe « ${att.originalName} » non stockée : ${e.message}`);
          }
        }

        log.emails_imported++;
        log.tickets_created++;
      } catch (e) {
        log.emails_failed++;
        log.errors.push(`${email.subject || msgId} : ${e.message}`);
        if (log.status === 'success') log.status = 'partial_error';
      }
    }
  } catch (e) {
    log.status = 'failed';
    log.errors.push(e.response?.data ? JSON.stringify(e.response.data) : e.message);
  }

  return log;
}

module.exports = { collect };
