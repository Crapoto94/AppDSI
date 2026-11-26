/**
 * Moisson d'une boîte mail pour les CREP signés (collecteur de module « entretiens », configuré dans l'administration du DSI Hub).
 *
 * Chaque PDF reçu en pièce jointe devient un lot « à vérifier » dans Suivi, avec le canal d'entrée « mail »
 * (expéditeur, objet, date de réception conservés). Le lot passe par la même chaîne que la numérisation DRH :
 * reconnaissance des pages par QR code, regroupement par agent, vérification et validation par un administrateur.
 * Un PDF où aucun QR code de CREP n'est reconnu (signature, facture…) est rangé en « Aucun CREP reconnu » sans solliciter l'administrateur.
 */
const axios = require('axios');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { pgDb, getSqlite } = require('../../shared/database');
const ret = require('./crep-return.service');

const MAX_MESSAGES = 200;          // par passage
const FIRST_RUN_DAYS = 45;         // première moisson : on remonte à 45 jours
const MARGIN_MS = 15 * 60 * 1000;  // marge de recul sur le curseur (indexation tardive de Graph) : les doublons sont écartés par identifiant de message

let ready = null;
function ensureTable() {
    if (!ready) {
        ready = (async () => {
            await ret.ensureTable();
            await pgDb.run(`CREATE TABLE IF NOT EXISTS hub_entretiens.crep_mail_messages (
                id SERIAL PRIMARY KEY,
                message_id TEXT NOT NULL,
                attachment_id TEXT NOT NULL DEFAULT '',
                batch_id INTEGER,
                sender TEXT,
                subject TEXT,
                received_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (message_id, attachment_id)
            )`);
        })().catch(e => { ready = null; throw e; });
    }
    return ready;
}

const isPdf = (att) => /pdf/i.test(att.contentType || '') || /\.pdf$/i.test(att.name || '');

/**
 * Collecte une boîte (appelée par MailCollectorService.performCollection pour les collecteurs du module « entretiens »).
 * @returns {Promise<object>} journal { emails_received, emails_imported, emails_skipped, emails_failed, attachments_processed, errors, status }
 */
async function collect(collector, token, axiosOpts) {
    await ensureTable();
    const log = { collector_id: collector.id, emails_received: 0, emails_imported: 0, emails_skipped: 0, emails_failed: 0, tickets_created: 0, comments_added: 0, attachments_processed: 0, errors: [], status: 'success' };
    const base = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(collector.mailbox)}`;
    const headers = { Authorization: `Bearer ${token}` };
    const since = new Date((collector.last_run ? new Date(collector.last_run).getTime() : Date.now() - FIRST_RUN_DAYS * 86400000) - MARGIN_MS).toISOString();

    // Campagne de rattachement : la campagne ouverte, à défaut la plus récente
    const camp = await pgDb.get("SELECT id FROM hub_entretiens.campaigns ORDER BY (statut = 'ouverte') DESC, annee DESC LIMIT 1");

    const messages = [];
    let url = `${base}/messages`;
    let params = { $filter: `receivedDateTime ge ${since} and hasAttachments eq true`, $orderby: 'receivedDateTime', $top: 50, $select: 'id,subject,from,receivedDateTime,internetMessageId,hasAttachments' };
    while (url && messages.length < MAX_MESSAGES) {
        const r = await axios.get(url, { ...axiosOpts, headers, params });
        messages.push(...(r.data.value || []));
        url = r.data['@odata.nextLink'] || null;
        params = undefined;
    }
    log.emails_received = messages.length;

    for (const m of messages) {
        try {
            const mid = m.internetMessageId || m.id;
            const atts = (await axios.get(`${base}/messages/${m.id}/attachments`, { ...axiosOpts, headers, params: { $top: 30 } })).data.value || [];
            const pdfs = atts.filter(a => a['@odata.type'] === '#microsoft.graph.fileAttachment' && !a.isInline && isPdf(a));
            if (!pdfs.length) { log.emails_skipped++; continue; }
            let imported = 0;
            for (const a of pdfs) {
                const done = await pgDb.get('SELECT id FROM hub_entretiens.crep_mail_messages WHERE message_id = ? AND attachment_id = ?', [mid, a.id]);
                if (done) continue;
                let buffer = a.contentBytes ? Buffer.from(a.contentBytes, 'base64') : null;
                if (!buffer) {
                    const raw = await axios.get(`${base}/messages/${m.id}/attachments/${a.id}/$value`, { ...axiosOpts, headers, responseType: 'arraybuffer' });
                    buffer = Buffer.from(raw.data);
                }
                if (buffer.slice(0, 5).toString('latin1') !== '%PDF-') continue;
                const sender = m.from?.emailAddress?.address || '';
                const batch = await ret.createBatch({
                    file: { buffer, originalname: a.name || 'crep.pdf' },
                    campaignId: camp?.id || null,
                    actor: { username: 'collecte-mail' },
                    channel: 'mail',
                    meta: { from: sender, from_name: m.from?.emailAddress?.name || '', subject: m.subject || '', received_at: m.receivedDateTime || null, message_id: mid, mailbox: collector.mailbox },
                });
                await pgDb.run('INSERT INTO hub_entretiens.crep_mail_messages (message_id, attachment_id, batch_id, sender, subject, received_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
                    [mid, a.id, batch.id, sender, m.subject || '', m.receivedDateTime || null]);
                imported++; log.attachments_processed++;
            }
            if (imported) log.emails_imported++; else log.emails_skipped++;
        } catch (e) {
            log.emails_failed++;
            log.errors.push(`${m.subject || m.id} : ${e.response?.data ? JSON.stringify(e.response.data).slice(0, 200) : e.message}`);
        }
    }
    if (log.emails_failed) log.status = log.emails_imported ? 'partial_error' : 'failed';
    return log;
}

module.exports = { collect, ensureTable };
