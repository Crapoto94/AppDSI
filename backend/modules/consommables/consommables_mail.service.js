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
const { pgDb, getSqlite } = require('../../shared/database');
const storage = require('../../shared/storage');
const docsService = require('../../shared/documents.service');
const { parseWorkbook, itemKey, refKey } = require('./consumables_excel');

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

// ── Écoles (@ac-creteil.fr) ─────────────────────────────────────────────────
// Les demandes venant d'une adresse @ac-creteil.fr émanent d'une école : le
// demandeur est l'école (et non la personne), avec conservation de l'e-mail.
const SCHOOL_DOMAIN = /@ac-creteil\.fr$/i;
const normSchool = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const SCHOOL_STOP = new Set([
  'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'ET', 'A', 'B', 'SUR', 'SEINE', 'IVRY',
  'ECOLE', 'ELEMENTAIRE', 'MATERNELLE', 'MUNICIPALE', 'PUBLIQUE', 'PRIVEE',
  'PU', 'EE', 'EM', 'E', 'M',
]);

function resolveSchool(fromName, schools) {
  const sn = normSchool(fromName);
  if (!sn) return null;
  const wantsMaternelle = /MATERNELLE|\bMAT\b/.test(sn);
  const wantsElementaire = /ELEMENTAIRE|\bELEM\b|\bE E\b|\bE M\b/.test(sn);
  let best = null;
  for (const s of schools || []) {
    const tokens = normSchool(s.nom).split(' ').filter(t => t.length >= 2 && !SCHOOL_STOP.has(t));
    if (!tokens.length) continue;
    const matched = tokens.filter(t => sn.includes(t)).length;
    if (matched !== tokens.length) continue; // tous les mots du nom doivent correspondre
    let score = 100 + tokens.join('').length;
    if (wantsMaternelle) score += s.type === 'Maternelle' ? 20 : -10;
    else if (wantsElementaire) score += s.type === 'Elémentaire' ? 20 : -10;
    else score += s.type === 'Elémentaire' ? 5 : 0; // convention : élémentaire par défaut
    if (!best || score > best.score) best = { school: s, score };
  }
  return best ? best.school : null;
}

async function loadSchoolContext() {
  const schools = await pgDb.all('SELECT id, nom, type FROM hub.ecoles').catch(() => []);
  const orgTable = await getOrgTable();
  let direction = 'DIRECTION SCOLA. ACCUEILS LOISIRS EDUC.';
  try {
    const row = await pgDb.get(
      `SELECT DISTINCT "DIRECTION_L" AS d FROM ${orgTable}
       WHERE UPPER("DIRECTION_L") LIKE '%SCOLA%'
         AND (UPPER("DIRECTION_L") LIKE '%ACCUEIL%' OR UPPER("DIRECTION_L") LIKE '%LOISIR%')
       LIMIT 1`
    );
    if (row?.d) direction = String(row.d).trim();
  } catch { /* repli sur le libellé connu */ }
  return { schools: Array.isArray(schools) ? schools : [], orgTable, direction };
}

async function directionForSchool(schoolName, orgTable, fallback) {
  try {
    const row = await pgDb.get(
      `SELECT DISTINCT "DIRECTION_L" AS d FROM ${orgTable}
       WHERE UPPER(TRIM("SERVICE_L")) = UPPER(TRIM(?)) LIMIT 1`,
      [schoolName]
    );
    if (row?.d) return String(row.d).trim();
  } catch { /* organigramme indisponible */ }
  return fallback;
}

/**
 * Ajoute au catalogue les références du bon de commande encore inconnues, afin
 * qu'elles puissent être commandées (et pas seulement signalées). Les doublons
 * sont détectés par référence cartouche puis par référence fournisseur.
 */
async function ensureCatalogEntries(items, catalog) {
  for (const it of items) {
    if (it.catalog_id) continue;
    const ck = refKey(it.article);
    const sk = refKey(it.code_fabricant);
    const existing = (catalog || []).find(c =>
      (ck && refKey(c.article) === ck) ||
      (sk && (refKey(c.code_fabricant) === sk || refKey(c.ref_commande) === sk))
    );
    if (existing) {
      it.catalog_id = existing.id;
      it.type_id = existing.type_id;
      it.article = existing.article;
      it.designation = existing.designation;
      continue;
    }
    const ins = await pgDb.run(
      `INSERT INTO hub_consommables.consumable_catalog
         (type_id, designation, article, code_fabricant, ref_commande)
       VALUES (?, ?, ?, ?, ?)`,
      [it.type_id, it.designation || '', it.article || '', it.code_fabricant || '', it.ref_commande || '']
    );
    it.catalog_id = ins.lastID;
    catalog.push({
      id: ins.lastID,
      type_id: it.type_id,
      designation: it.designation || '',
      article: it.article || '',
      code_fabricant: it.code_fabricant || '',
      ref_commande: it.ref_commande || '',
    });
  }
}

async function isMailAckEnabled() {
  try {
    const db = getSqlite();
    if (!db) return false;
    const row = await db.get(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'consumables.mail_ack_enabled'"
    );
    return ['1', 'true', 'yes', 'on'].includes(String(row?.setting_value || '').trim().toLowerCase());
  } catch { return false; }
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

/**
 * Réponse à un accusé de réception de commande : le mail contient le code
 * CONSO-<id>-XXXX. On stocke le message de réponse et ses pièces jointes
 * (bordereau de livraison) sur la demande, puis on la place « à archiver ».
 * Retourne true si le mail a été traité comme une réponse AR.
 */
async function handleArReply({ collector, email, msgId, subject, bodyText, token, axiosOpts, log }) {
  const hay = `${subject || ''} ${bodyText || ''}`;
  const codeMatch = /CONSO-(\d+)-[A-Z0-9]{4,12}/i.exec(hay);
  const subjectMatch = /AR\s+Commande\s+consommables\s+n[°o]\s*(\d+)/i.exec(subject || '');
  if (!codeMatch && !subjectMatch) return false;

  const requestId = parseInt(codeMatch ? codeMatch[1] : subjectMatch[1], 10);
  let request = requestId
    ? await pgDb.get(
      `SELECT id, email, nom_referent, ar_code FROM hub_consommables.consumable_requests WHERE id = ?`,
      [requestId]
    )
    : null;
  if (request && codeMatch && request.ar_code && request.ar_code.toUpperCase() !== codeMatch[0].toUpperCase()) {
    log.errors.push(`Réponse AR : code ${codeMatch[0]} incohérent pour la demande ${requestId}`);
  }
  if (!request && subjectMatch) {
    request = await pgDb.get(
      `SELECT id, email, nom_referent, ar_code FROM hub_consommables.consumable_requests
       WHERE id = ? AND LOWER(COALESCE(email,'')) = LOWER(?)`,
      [requestId, email.from?.emailAddress?.address || '']
    );
  }
  if (!request) {
    log.errors.push(`Réponse AR non rattachée : demande ${requestId} introuvable (${subject})`);
    // On ne crée surtout pas une nouvelle demande de consommables avec un BL.
    return true;
  }

  const replyKey = `${msgId}#AR`;
  const mapping = await pgDb.run(
    `INSERT INTO hub_consommables.request_email_mapping
       (request_id, email_message_id, email_from, email_subject, email_received_at)
     VALUES (?, ?, ?, ?, ?) ON CONFLICT (email_message_id) DO NOTHING`,
    [request.id, replyKey, email.from?.emailAddress?.address || null, subject || null, new Date().toISOString()]
  );
  if (mapping.changes === 0) return true;

  let firstDocId = null;
  const raw = await fetchRawMessage(collector.mailbox, email.id, token, axiosOpts);
  if (raw && raw.length) {
    try {
      const emlName = `Reponse AR - ${safeFileName(subject || `commande ${request.id}`)}.eml`;
      const saved = await storage.saveFile('consommables', request.id, {
        buffer: raw, originalname: emlName, mimetype: 'message/rfc822',
      });
      const reg = await docsService.registerExternalUpload({
        module: 'consommables', entityType: 'request', entityId: request.id,
        title: emlName, filename: saved.filename, originalName: emlName,
        mimetype: 'message/rfc822', size: raw.length, storageRef: saved.dbPath,
        storageBackend: saved.backend || 'filesystem',
        uploadedBy: 'collecteur-mail',
        metadata: { kind: 'ar_reply', email_message_id: msgId, ar_code: request.ar_code || null },
      });
      if (reg?.document?.id) firstDocId = reg.document.id;
      log.attachments_processed++;
    } catch (e) {
      log.errors.push(`Réponse AR non stockée (demande ${request.id}) : ${e.message}`);
    }
  }

  const atts = email.hasAttachments
    ? await fetchAttachments(collector.mailbox, email.id, token, axiosOpts)
    : [];
  for (const att of atts) {
    try {
      const name = safeFileName(att.originalName, 'bordereau-livraison');
      const saved = await storage.saveFile('consommables', request.id, {
        buffer: att.buffer, originalname: name, mimetype: att.mimetype,
      });
      const reg = await docsService.registerExternalUpload({
        module: 'consommables', entityType: 'request', entityId: request.id,
        title: name, filename: saved.filename, originalName: name,
        mimetype: att.mimetype, size: att.buffer.length, storageRef: saved.dbPath,
        storageBackend: saved.backend || 'filesystem',
        uploadedBy: 'collecteur-mail',
        metadata: { kind: 'delivery_note', email_message_id: msgId, ar_code: request.ar_code || null },
      });
      if (reg?.document?.id && !firstDocId) firstDocId = reg.document.id;
      log.attachments_processed++;
    } catch (e) {
      log.errors.push(`Pièce jointe AR « ${att.originalName} » non stockée : ${e.message}`);
    }
  }

  await pgDb.run(
    `UPDATE hub_consommables.consumable_requests
     SET to_archive = TRUE,
         ar_reply_at = COALESCE(ar_reply_at, NOW()),
         ar_reply_document_id = COALESCE(ar_reply_document_id, ?),
         updated_at = NOW()
     WHERE id = ?`,
    [firstDocId, request.id]
  );
  log.comments_added++;
  console.log(`[CONSOMMABLES-MAIL] Réponse AR rattachée à la demande ${request.id} (${atts.length} PJ)`);
  return true;
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
    const schoolCtx = await loadSchoolContext();
    const orgTable = schoolCtx.orgTable;
    const catalog = await pgDb.all(
      `SELECT id, type_id, designation, article, code_fabricant, ref_commande
       FROM hub_consommables.consumable_catalog`
    ).catch(() => []);

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

        // Réponse à un AR de commande (bordereau de livraison) : on la rattache
        // à la demande via le code CONSO-<id>-XXXX, sans créer de nouvelle demande.
        if (await handleArReply({
          collector, email, msgId, subject, bodyText, token, axiosOpts, log,
        })) {
          continue;
        }

        // Les expéditeurs @ac-creteil.fr sont des écoles : le demandeur est l'école,
        // et l'e-mail d'origine est conservé.
        const school = SCHOOL_DOMAIN.test(fromEmail)
          ? resolveSchool(fromName, schoolCtx.schools)
          : null;

        // Demandeur : compte Hub par email (ou partie locale), sinon l'adresse.
        let user = null;
        if (fromEmail && !school) {
          user = await pgDb.get(
            `SELECT id, username, displayname, email, service_code, service_complement, requester_phone
             FROM hub.users
             WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)
             LIMIT 1`,
            [fromEmail, fromEmail.split('@')[0]]
          );
        }
        const username = user?.username || fromEmail.split('@')[0] || fromEmail || 'inconnu';
        let nomReferent = user?.displayname || fromName || fromEmail;

        // Direction / service : organigramme RH à partir du code service du compte.
        let direction = '—';
        let service = '—';
        let isSchool = false;
        if (school) {
          isSchool = true;
          nomReferent = school.nom;
          service = school.nom;
          direction = await directionForSchool(school.nom, orgTable, schoolCtx.direction);
        } else if (user?.service_code) {
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

        // Règle métier : un mail sans fichier joint n'est PAS une demande de
        // consommables (les messages d'information, accusés, newsletters sont ignorés).
        const atts = email.hasAttachments
          ? await fetchAttachments(collector.mailbox, email.id, token, axiosOpts)
          : [];
        if (!atts.length) {
          log.emails_skipped++;
          continue;
        }

        // Interprétation des bons de commande Excel joints : seules les lignes
        // avec une quantité > 0 deviennent des articles de la demande.
        const bulk = { items: [], unmatched: [], school: null, director: null, phone: null, date: null };
        for (const att of atts) {
          const isExcel = /\.(xlsx|xls|csv)$/i.test(att.originalName || '')
            || /spreadsheet|excel|csv/i.test(att.mimetype || '');
          if (!isExcel) continue;
          try {
            const parsed = parseWorkbook(att.buffer, catalog);
            for (const it of parsed.items) {
              const key = itemKey(it);
              const prev = bulk.items.find(x => itemKey(x) === key);
              if (prev) prev.quantite += it.quantite;
              else bulk.items.push({ ...it });
            }
            bulk.unmatched.push(...parsed.unmatched);
            bulk.school = bulk.school || parsed.school;
            bulk.director = bulk.director || parsed.director;
            bulk.phone = bulk.phone || parsed.phone;
            bulk.date = bulk.date || parsed.date;
          } catch (e) {
            log.errors.push(`Lecture Excel « ${att.originalName} » impossible : ${e.message}`);
          }
        }

        let typeId = bulk.items.length ? bulk.items[0].type_id : await pickTypeId(subject, bodyText);
        if (!typeId) { log.emails_failed++; log.errors.push('Aucun type de consommable configuré'); continue; }

        const excelInfo = [];
        if (bulk.school) excelInfo.push(`École (bon de commande) : ${[bulk.school.type, bulk.school.name].filter(Boolean).join(' — ')}`);
        if (bulk.director) excelInfo.push(`Directeur/Directrice : ${bulk.director}`);
        if (bulk.phone) excelInfo.push(`Téléphone : ${bulk.phone}`);
        if (bulk.unmatched.length) excelInfo.push(`Références ajoutées au catalogue : ${bulk.unmatched.map(u => `${u.cartridge || u.model} (qté ${u.quantite})`).join(' ; ')}`);

        const comment = [
          `Reçu par mail le ${receivedAt.toLocaleDateString('fr-FR')} — Objet : ${subject || '(sans objet)'}`,
          excelInfo.length ? `\n${excelInfo.join('\n')}` : '',
          bodyText ? `\n\n${bodyText}` : '',
        ].join('').slice(0, 4000);

        const ins = await pgDb.run(
          `INSERT INTO hub_consommables.consumable_requests
             (user_id, username, email, date_commande, direction, service, nom_referent, tel_complet,
              type_id, status, user_comment, source, mail_subject, mail_from, mail_from_name, mail_received_at, is_school)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 'mail', ?, ?, ?, ?, ?)`,
          [
            String(user?.id || fromEmail || username), username, fromEmail || user?.email || '',
            dateCommande, direction, service, nomReferent, user?.requester_phone || '',
            typeId, comment, subject || null, fromEmail || null, fromName || null, receivedAt.toISOString(), isSchool,
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

        // Articles issus du bon de commande Excel (quantités > 0). Les
        // références inconnues sont ajoutées au catalogue avant rattachement.
        await ensureCatalogEntries(bulk.items, catalog);
        for (const it of bulk.items) {
          await pgDb.run(
            'INSERT INTO hub_consommables.request_articles (request_id, catalog_id, quantite) VALUES (?, ?, ?)',
            [requestId, it.catalog_id, it.quantite]
          );
        }
        if (bulk.items.length && bulk.items[0].type_id !== typeId) {
          await pgDb.run(
            'UPDATE hub_consommables.consumable_requests SET type_id = ? WHERE id = ?',
            [bulk.items[0].type_id, requestId]
          );
        }
        if (bulk.date || bulk.phone) {
          await pgDb.run(
            `UPDATE hub_consommables.consumable_requests
             SET date_commande = COALESCE(?, date_commande),
                 tel_complet = CASE WHEN ? <> '' THEN ? ELSE tel_complet END,
                 updated_at = NOW()
             WHERE id = ?`,
            [bulk.date, bulk.phone || '', bulk.phone || '', requestId]
          );
        }
        // Repli : si le nom de l'expéditeur n'a pas permis de trouver l'école,
        // on utilise le champ ECOLE du bon de commande.
        if (!school && bulk.school) {
          const fallback = resolveSchool(`${bulk.school.type || ''} ${bulk.school.name || ''}`, schoolCtx.schools);
          if (fallback) {
            const dir = await directionForSchool(fallback.nom, orgTable, schoolCtx.direction);
            await pgDb.run(
              `UPDATE hub_consommables.consumable_requests
               SET nom_referent = ?, direction = ?, service = ?, is_school = TRUE, updated_at = NOW()
               WHERE id = ?`,
              [fallback.nom, dir, fallback.nom, requestId]
            );
          }
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
              storageBackend: saved.backend || 'filesystem',
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
              storageBackend: saved.backend || 'filesystem',
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

        // Accusé de réception : DÉSACTIVÉ par défaut (le temps que le client
        // valide le texte). Activation via app_settings
        // « consumables.mail_ack_enabled » = true.
        if (await isMailAckEnabled()) {
          try {
            await require('./consommables.controller').sendMailConfirmationForRequest(requestId);
          } catch (e) {
            log.errors.push(`Confirmation non envoyée (demande ${requestId}) : ${e.message}`);
          }
        }
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
