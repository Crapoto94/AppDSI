/**
 * Import one-shot du dossier DSALE (boîte consoivry@ivry94.fr), depuis
 * septembre 2025. Traite les bons de commande Excel (y compris imbriqués dans
 * des .eml), rattache l'école, calcule les prix TTC, et crée les demandes
 * historiques « commandées » et archivées.
 *
 * Usage :
 *   node scripts/import_dsale_consommables.js            # simulation
 *   node scripts/import_dsale_consommables.js --execute  # écriture réelle
 */
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { simpleParser } = require('mailparser');
const dbm = require('../shared/database');
const { pgDb, pool } = require('../shared/pg_db');
const storage = require('../shared/storage');
const docsService = require('../shared/documents.service');
const MailCollectorService = require('../modules/mail_collector/mail_collector.service');
const { parseWorkbook, refKey } = require('../modules/consommables/consumables_excel');

const EXECUTE = process.argv.includes('--execute');
const MAILBOX = 'consoivry@ivry94.fr';
const SINCE = '2025-09-01T00:00:00Z';
const DSALE_FOLDER = 'AAMkADU3NWJmNmVkLTVhMWMtNDFjNC05ZmRmLThiNjAyMzk4NzUwZgAuAAAAAAAOdEi_cVNQSL5oSllvNKOTAQCUsFgW2IrvSaOQFkSCMs2JAAAHfSIBAAA=';
const SCHOOL_DIRECTION_FALLBACK = 'DIRECTION SCOLA. ACCUEILS LOISIRS EDUC.';

// ─── Résolution des écoles ───────────────────────────────────────────────────
const norm = (s) => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const STOP = new Set([
  'DE', 'DU', 'DES', 'LA', 'LE', 'LES', 'ET', 'A', 'B', 'AU', 'AUX', 'SUR', 'SEINE', 'IVRY',
  'ECOLE', 'ELEMENTAIRE', 'MATERNELLE', 'MUNICIPALE', 'PUBLIQUE', 'PRIVEE',
  'PU', 'EE', 'EM', 'E', 'M', 'PRIMAIRE', 'L',
]);
function canonicalName(s) {
  return norm(s)
    .replace(/\bJ C A\b/g, 'JOLIOT CURIE A')
    .replace(/\bJ C B\b/g, 'JOLIOT CURIE B')
    .replace(/\bJCA\b/g, 'JOLIOT CURIE A')
    .replace(/\bJCB\b/g, 'JOLIOT CURIE B')
    .replace(/\bJ CURIE\b/g, 'JOLIOT CURIE')
    .replace(/\bJC\b/g, 'JOLIOT CURIE')
    .replace(/\bRF\b/g, 'ROSALIND FRANKLIN')
    .replace(/\bOAC\b/g, 'ORME AU CHAT')
    .replace(/\bTHOREZ\b/g, 'THOREZ');
}
function senderType(s) {
  const n = norm(s);
  if (/E M PU|MATERNELLE/.test(n)) return 'Maternelle';
  if (/E E PU|E P PU|E E A|ELEMENTAIRE|PRIMAIRE/.test(n)) return 'Elémentaire';
  return '';
}
function resolveSchool(excelHint, senderHint, schools) {
  const excelType = senderType(excelHint);
  const fromSender = senderType(senderHint);
  const type = excelType || fromSender;
  // On combine les indices : le nom Excel d'abord, l'expéditeur pour désambiguïser.
  const sn = canonicalName(`${excelHint || ''} ${senderHint || ''}`);
  if (!sn) return null;
  let best = null;
  for (const s of schools) {
    const tokens = canonicalName(s.nom).split(' ')
      .filter(t => t.length >= 2 && !STOP.has(t));
    if (!tokens.length) continue;
    const matched = tokens.filter(t => sn.includes(t)).length;
    if (matched < Math.max(1, tokens.length - 1)) continue;
    let score = 100 + tokens.length * 5 + (matched === tokens.length ? 15 : 0);
    if (type) score += s.type === type ? 40 : -25;
    else score += s.type === 'Elémentaire' ? 2 : 0;
    // Bonus si le nom Excel contient le nom de l'école (hors type)
    const excelTokens = canonicalName(excelHint || '').split(' ').filter(t => t.length >= 2 && !STOP.has(t));
    if (excelTokens.length && excelTokens.every(t => canonicalName(s.nom).includes(t))) score += 20;
    if (!best || score > best.score) best = { school: s, score };
  }
  return best ? best.school : null;
}

// ─── Prix TTC ────────────────────────────────────────────────────────────────
const digits = (s) => String(s || '').replace(/\D/g, '');
const articleKey = (s) => norm(s).replace(/\b(NOIRE?|NOIR|CYAN|JAUNE|MAGENTA|YELLOW|BLACK)\b/g, '').replace(/[^A-Z0-9]/g, '');
const PRICE_BY_CODE = new Map(Object.entries({
  '2777655': 17.56, '2777656': 17.44, '2777657': 17.44, '2777658': 17.44,
  '1882911': 30.50, '2052680': 59.82, '2777429': 25.76,
  '1926980': 127.87, '1926977': 109.06, '4033711': 170.39, '2777744': 18.12,
  '2759270': 78.66, '2759271': 101.58, '2759273': 101.58, '2759272': 101.58,
  '1887201': 8.51, '4033704': 92.69, '2777689': 17.80, '2777690': 17.83, '2777691': 17.76,
  '4033738': 150.58, '4033739': 205.74, '4033740': 205.74, '4033741': 205.73,
  '2759236': 87.76, '2759237': 98.56, '2759238': 98.56, '2759239': 98.54,
  '2759180': 107.81,
}).map(([k, v]) => [k, Number(v)]));
const PRICE_BY_ARTICLE = new Map(Object.entries({
  TN3600: 75.56, TN3600XXL: 75.56, TN3380: 25.76, TN3480: 109.06,
  CF259XR: 170.39, CF283A: 18.12, DR3200: 30.50, DR3300: 59.82, DR3400: 127.87, DR243CL: 107.81,
  TN247BK: 87.76, TN247C: 98.56, TN247M: 98.56, TN247Y: 98.54,
  W2030A: 17.56, W2031A: 17.44, W2032A: 17.44, W2033A: 17.44,
  W2030X: 150.58, W2031X: 205.74, W2032X: 205.74, W2033X: 205.73,
  TN423BK: 78.66, TN423C: 101.58, TN423M: 101.58, TN423Y: 101.58,
  CE410X: 92.69, CE411A: 17.80, CE412A: 17.83, CE413A: 17.76,
}));
function priceForCatalog(c) {
  const byArticle = PRICE_BY_ARTICLE.get(articleKey(c.article));
  if (byArticle != null) return byArticle;
  for (const cand of [c.code_fabricant, c.ref_commande, c.article]) {
    const d = digits(cand);
    if (d && PRICE_BY_CODE.has(d)) return PRICE_BY_CODE.get(d);
  }
  return null;
}

// ─── Graph ───────────────────────────────────────────────────────────────────
function axiosOpts() {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || null;
  return proxyUrl
    ? { httpsAgent: new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false }), proxy: false }
    : { httpsAgent: new https.Agent({ rejectUnauthorized: false }) };
}
const isExcel = (name, mime) => /\.(xlsx|xls|xlsm|csv)$/i.test(name || '') || /spreadsheet|excel|csv/i.test(mime || '');
const isEml = (name, mime) => /\.eml$/i.test(name || '') || /message\/rfc822|application\/eml/i.test(mime || '');
async function walkEml(buffer, depth, out, mails) {
  const parsed = await simpleParser(buffer);
  mails.push({ depth, subject: parsed.subject || '', from: parsed.from?.text || '', date: parsed.date ? new Date(parsed.date).toISOString() : null });
  for (const att of parsed.attachments || []) {
    const name = att.filename || '';
    const mime = att.contentType || '';
    const buf = Buffer.from(att.content || []);
    if (isExcel(name, mime)) out.push({ buffer: buf, name, mime, depth });
    else if (isEml(name, mime) && depth < 6) await walkEml(buf, depth + 1, out, mails);
  }
}
async function graphGetAllMessages(token, o) {
  let url = `https://graph.microsoft.com/v1.0/users/${MAILBOX}/mailFolders/${DSALE_FOLDER}/messages`;
  const params = {
    $top: 100,
    $select: 'id,subject,receivedDateTime,from,hasAttachments,internetMessageId,bodyPreview',
    $filter: `receivedDateTime ge ${SINCE}`,
    $orderby: 'receivedDateTime asc',
  };
  const all = [];
  let next = null;
  const first = await axios.get(url, { ...o, headers: { Authorization: `Bearer ${token}` }, params });
  all.push(...(first.data.value || []));
  next = first.data['@odata.nextLink'];
  while (next) {
    const r = await axios.get(next, { ...o, headers: { Authorization: `Bearer ${token}` } });
    all.push(...(r.data.value || []));
    next = r.data['@odata.nextLink'];
  }
  return all;
}
async function fetchRaw(token, o, id) {
  const r = await axios.get(`https://graph.microsoft.com/v1.0/users/${MAILBOX}/messages/${id}/$value`, {
    ...o, headers: { Authorization: `Bearer ${token}`, Accept: 'message/rfc822' }, responseType: 'arraybuffer',
  });
  return Buffer.from(r.data);
}
async function directionForSchool(schoolName) {
  try {
    const row = await pgDb.get(
      `SELECT DISTINCT "DIRECTION_L" AS d FROM oracle.rh_siim_organigramme_v2
       WHERE UPPER(TRIM("SERVICE_L")) = UPPER(TRIM(?)) LIMIT 1`,
      [schoolName]
    );
    if (row?.d) return String(row.d).trim();
  } catch { /* repli */ }
  return SCHOOL_DIRECTION_FALLBACK;
}
async function ensureCatalog(catalog, item) {
  if (item.catalog_id) return item;
  const key = articleKey(item.article);
  const found = catalog.find(c => articleKey(c.article) === key || (item.code_fabricant && digits(c.code_fabricant) === digits(item.code_fabricant)));
  if (found) {
    item.catalog_id = found.id;
    item.type_id = found.type_id;
    item.article = found.article;
    item.designation = found.designation;
    item.prix_ttc = found.prix_ttc;
    return item;
  }
  const price = PRICE_BY_ARTICLE.get(key) ?? null;
  const ins = await pgDb.run(
    `INSERT INTO hub_consommables.consumable_catalog (type_id, designation, article, code_fabricant, ref_commande, prix_ttc)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [item.type_id, item.designation || '', item.article || '', item.code_fabricant || '', item.ref_commande || '', price]
  );
  item.catalog_id = ins.lastID;
  item.prix_ttc = price;
  catalog.push({ id: ins.lastID, type_id: item.type_id, designation: item.designation || '', article: item.article || '', code_fabricant: item.code_fabricant || '', ref_commande: item.ref_commande || '', prix_ttc: price });
  return item;
}

// ─── Main ────────────────────────────────────────────────────────────────────
(async () => {
  try {
    await dbm.setupDb();
    const token = await MailCollectorService.getGraphToken(await dbm.getSqlite().get('SELECT * FROM o365_settings WHERE id = 1'));
    const o = axiosOpts();
    const messages = await graphGetAllMessages(token, o);
    const schools = (await pool.query('SELECT id, nom, type FROM hub.ecoles')).rows;
    let catalog = (await pool.query('SELECT id, type_id, designation, article, code_fabricant, ref_commande, prix_ttc FROM hub_consommables.consumable_catalog')).rows;

    // Mise à jour des prix connus du catalogue.
    for (const c of catalog) {
      const price = priceForCatalog(c);
      if (price != null && (c.prix_ttc == null || Number(c.prix_ttc) !== price)) {
        if (EXECUTE) await pgDb.run('UPDATE hub_consommables.consumable_catalog SET prix_ttc = ? WHERE id = ?', [price, c.id]);
        c.prix_ttc = price;
      }
    }

    // Empreintes des demandes déjà présentes (pour ne pas ressaisir).
    const existingRows = (await pool.query(`
      SELECT cr.id, cr.service, cr.nom_referent, cr.is_school, to_char(cr.date_commande, 'YYYY-MM-DD') AS d,
             json_agg(json_build_object('article', cc.article, 'qty', ra.quantite)) FILTER (WHERE ra.id IS NOT NULL) AS articles
      FROM hub_consommables.consumable_requests cr
      LEFT JOIN hub_consommables.request_articles ra ON ra.request_id = cr.id
      LEFT JOIN hub_consommables.consumable_catalog cc ON cc.id = ra.catalog_id
      GROUP BY cr.id
    `)).rows;
    const existingFingerprints = new Set();
    for (const r of existingRows) {
      const school = r.is_school ? r.service : r.nom_referent;
      const items = (r.articles || []).map(a => `${articleKey(a.article)}x${a.qty}`).sort().join('|');
      existingFingerprints.add(`${canonicalName(school)}|${r.d}|${items}`);
    }
    const existingMappings = new Set((await pool.query('SELECT email_message_id FROM hub_consommables.request_email_mapping')).rows.map(r => r.email_message_id));
    const seenFingerprints = new Set(existingFingerprints);
    const seenMappings = new Set(existingMappings);
    const seenFileKeys = new Set();

    const candidates = [];
    for (const m of messages) {
      const sender = (m.from?.emailAddress?.address || '').toLowerCase();
      const senderName = m.from?.emailAddress?.name || '';
      // Les accusés UGAP / transporteurs ne sont pas des demandes.
      if (/ugap\.fr$|officexpress\.fr$/i.test(sender)) continue;
      let raw;
      try { raw = await fetchRaw(token, o, m.id); } catch { continue; }
      const files = [];
      const mails = [];
      try { await walkEml(raw, 0, files, mails); } catch { continue; }
      if (!files.length) continue;
      const nestedSender = mails.find(x => x.depth === 1)?.from || mails[0]?.from || '';
      const senderHint = /campo/i.test(senderName) ? nestedSender : senderName;
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        let parsed;
        try { parsed = parseWorkbook(f.buffer, catalog); } catch { continue; }
        if (!parsed.items.length) continue;
        const excelHint = [parsed.school?.type, parsed.school?.name].filter(Boolean).join(' ');
        const isCms = /MEDECINE SCOLAIRE|MÉDECINE SCOLAIRE|CMS IVRY/i.test(`${excelHint} ${senderHint} ${m.subject}`);
        const school = isCms
          ? { id: 0, nom: 'Médecine scolaire', type: 'Service' }
          : resolveSchool(excelHint, senderHint, schools);
        if (!school) {
          console.log(`[IGNORÉ] école non résolue : ${m.receivedDateTime} | ${sender} | ${m.subject} | ${excelHint} | ${f.name}`);
          continue;
        }
        // Date du bon : on l'utilise si elle est cohérente avec le mail, sinon
        // on retombe sur la date de réception (certains bons gardent une date
        // de l'année précédente, ce qui fausserait l'année scolaire).
        const msgDate = (m.receivedDateTime || '').slice(0, 10);
        let date = msgDate;
        if (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) && parsed.date.slice(5, 7) !== '00') {
          const diff = Math.abs((new Date(parsed.date).getTime() - new Date(msgDate).getTime()) / 86400000);
          if (Number.isFinite(diff) && diff <= 180) date = parsed.date;
        }
        const items = parsed.items.map(it => ({ ...it }));
        const fpItems = items.map(it => `${articleKey(it.article)}x${it.quantite}`).sort().join('|');
        const fingerprint = `${canonicalName(school.nom)}|${date}|${fpItems}`;
        // Les copies / transferts du même bon gardent le même nom de fichier et
        // les mêmes lignes : on les déduplique même si la date du bon a changé.
        const fileKey = `${canonicalName(school.nom)}|${canonicalName(f.name)}|${fpItems}`;
        const mappingKey = `${m.internetMessageId || m.id}#${i}`;
        if (seenFingerprints.has(fingerprint) || seenFileKeys.has(fileKey) || seenMappings.has(mappingKey)) {
          continue;
        }
        seenFingerprints.add(fingerprint);
        seenFileKeys.add(fileKey);
        seenMappings.add(mappingKey);
        candidates.push({
          message: m, sender, senderName, raw, file: f, parsed, school, date, items,
          fingerprint, mappingKey, nestedSender,
        });
      }
    }

    console.log(`\n${candidates.length} commande(s) à importer sur ${messages.length} messages.`);
    let totalGeneral = 0;
    for (const c of candidates) {
      for (const it of c.items) {
        const cat = catalog.find(x => x.id === it.catalog_id);
        it.prix_ttc = cat?.prix_ttc != null ? Number(cat.prix_ttc) : (PRICE_BY_ARTICLE.get(articleKey(it.article)) ?? null);
      }
      const total = c.items.reduce((s, it) => s + (Number(it.prix_ttc) || 0) * Number(it.quantite || 0), 0);
      totalGeneral += total;
      console.log(`  ${c.date} | ${c.school.type} ${c.school.nom} | ${c.items.map(it => `${it.article} x${it.quantite} (${it.prix_ttc != null ? it.prix_ttc.toFixed(2) : '?'} €)`).join(' | ')} | TOTAL ${total.toFixed(2)} € | ${c.message.subject}`);
    }
    console.log(`TOTAL GÉNÉRAL : ${totalGeneral.toFixed(2)} €\n`);
    if (!EXECUTE) {
      console.log('Simulation terminée. Relancer avec --execute pour écrire.');
      return;
    }

    for (const c of candidates) {
      // Prix et type
      for (const it of c.items) {
        await ensureCatalog(catalog, it);
        const cat = catalog.find(x => x.id === it.catalog_id);
        it.prix_ttc = cat?.prix_ttc != null ? Number(cat.prix_ttc) : (PRICE_BY_ARTICLE.get(articleKey(it.article)) ?? null);
      }
      const total = c.items.reduce((s, it) => s + (Number(it.prix_ttc) || 0) * Number(it.quantite || 0), 0);
      const typeId = c.items.some(it => it.type_id === 2)
        ? 2
        : (c.items[0].type_id || 5);
      const isSchool = c.school.type !== 'Service';
      const direction = await directionForSchool(c.school.nom);
      const receivedAt = new Date(c.message.receivedDateTime);
      const comment = [
        `Import DSALE — bon de commande « ${c.file.name} »`,
        `École : ${c.school.type} ${c.school.nom}`,
        c.parsed.director ? `Directeur/Directrice : ${c.parsed.director}` : '',
        c.parsed.phone ? `Téléphone : ${c.parsed.phone}` : '',
        c.parsed.date ? `Date du bon : ${c.parsed.date}` : '',
        `Message : ${c.message.subject || ''} — expéditeur : ${c.sender}`,
      ].filter(Boolean).join('\n');
      const ins = await pgDb.run(
        `INSERT INTO hub_consommables.consumable_requests
           (user_id, username, email, date_commande, direction, service, nom_referent, tel_complet,
            type_id, status, order_number, tier, total_amount_ttc, is_school, user_comment, archived,
            source, mail_subject, mail_from, mail_from_name, mail_received_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ordered', ?, 'UGAP', ?, ?, ?, TRUE,
                 'mail', ?, ?, ?, ?, ?)`,
        [
          c.sender || 'mail', c.sender.split('@')[0] || 'mail', c.sender, c.date,
          direction, c.school.nom, c.school.nom, c.parsed.phone || '',
          typeId, `DSALE-${c.date}`, total, isSchool, comment,
          c.message.subject || null, c.sender || null, c.senderName || null, receivedAt.toISOString(), receivedAt.toISOString(),
        ]
      );
      const requestId = ins.lastID;
      await pgDb.run('UPDATE hub_consommables.consumable_requests SET order_number = ? WHERE id = ?', [`DSALE-${c.date}-${requestId}`, requestId]);
      for (const it of c.items) {
        await pgDb.run(
          'INSERT INTO hub_consommables.request_articles (request_id, catalog_id, quantite) VALUES (?, ?, ?)',
          [requestId, it.catalog_id, it.quantite]
        );
      }
      await pgDb.run(
        `INSERT INTO hub_consommables.request_email_mapping
           (request_id, email_message_id, email_from, email_subject, email_received_at)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT (email_message_id) DO NOTHING`,
        [requestId, c.mappingKey, c.sender || null, c.message.subject || null, receivedAt.toISOString()]
      );
      // GED : message d'origine + bon Excel
      try {
        const emlName = `DSALE - ${(c.message.subject || 'demande').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 80)}.eml`;
        const saved = await storage.saveFile('consommables', requestId, { buffer: c.raw, originalname: emlName, mimetype: 'message/rfc822' });
        const reg = await docsService.registerExternalUpload({
          module: 'consommables', entityType: 'request', entityId: requestId,
          title: emlName, filename: saved.filename, originalName: emlName,
          mimetype: 'message/rfc822', size: c.raw.length, storageRef: saved.dbPath,
          storageBackend: saved.backend || 'filesystem', uploadedBy: 'import-dsale',
          metadata: { kind: 'email', source: 'dsale' },
        });
        if (reg?.document?.id) {
          await pgDb.run('UPDATE hub_consommables.consumable_requests SET source_document_id = ? WHERE id = ?', [reg.document.id, requestId]);
        }
        const xlsxName = (c.file.name || 'bon-commande.xlsx').replace(/[\\/:*?"<>|]/g, ' ').slice(0, 120);
        const savedX = await storage.saveFile('consommables', requestId, { buffer: c.file.buffer, originalname: xlsxName, mimetype: c.file.mime || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        await docsService.registerExternalUpload({
          module: 'consommables', entityType: 'request', entityId: requestId,
          title: xlsxName, filename: savedX.filename, originalName: xlsxName,
          mimetype: c.file.mime || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: c.file.buffer.length,
          storageRef: savedX.dbPath, storageBackend: savedX.backend || 'filesystem', uploadedBy: 'import-dsale',
          metadata: { kind: 'attachment', source: 'dsale' },
        });
      } catch (e) {
        console.error(`  GED demande ${requestId}: ${e.message}`);
      }
      existingFingerprints.add(c.fingerprint);
      existingMappings.add(c.mappingKey);
      console.log(`  + demande ${requestId} — ${c.school.nom} — ${total.toFixed(2)} €`);
    }
    console.log('\nImport terminé.');
  } catch (e) {
    console.error('ERR', e.response?.data ? JSON.stringify(e.response.data) : e.stack);
  } finally {
    await pool.end();
    process.exit(0);
  }
})();
