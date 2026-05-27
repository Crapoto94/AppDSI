const axios = require('axios');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { pgDb, getSqlite } = require('../../shared/database');
const MailRulesService = require('./mail_rules.service');
const observerRepo = require('../tickets/repositories/observer.repository');
const commentRepo = require('../tickets/repositories/comment.repository');
const attachmentRepo = require('../tickets/repositories/attachment.repository');
const ticketRepo = require('../tickets/repositories/ticket.repository');
const fs = require('fs');
const path = require('path');

class MailCollectorService {

  static async getGraphToken(settings) {
    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || null;
    const axiosOpts = proxyUrl
      ? { httpsAgent: new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false }), proxy: false }
      : { httpsAgent: new https.Agent({ rejectUnauthorized: false }) };

    const tokenRes = await axios.post(
      `https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`,
      new URLSearchParams({
        client_id: settings.client_id,
        client_secret: settings.client_secret,
        grant_type: 'client_credentials',
        scope: 'https://graph.microsoft.com/.default'
      }).toString(),
      { ...axiosOpts, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return tokenRes.data.access_token;
  }

  static extractReplyContent(body) {
    if (!body) return '';

    const cleanBody = body
      .replace(/<[^>]+>/g, '\n')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

    const lines = cleanBody.split('\n').map(l => l.trim()).filter(l => l);
    let content = '';

    for (const line of lines) {
      if (/^(--|De\s*:|À\s*:|Envoyé\s*:|Cordialement|Bien cordialement|---)/i.test(line)) break;
      content += (content ? '\n' : '') + line;
    }

    if (!content && lines.length > 0) {
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        if (!/^(--|De\s*:|À\s*:|Envoyé\s*:|Cordialement)/i.test(lines[i])) {
          content += (content ? '\n' : '') + lines[i];
        }
      }
    }

    return content.substring(0, 1500).trim();
  }

  static extractFromEmail(email) {
    const from = email.from || {};
    const name = from.emailAddress?.name || 'Inconnu';
    const emailAddr = from.emailAddress?.address || 'unknown@example.com';
    return { name, email: emailAddr };
  }

  static extractRecipients(email) {
    const recipients = [];
    const to = email.toRecipients || [];
    const cc = email.ccRecipients || [];

    for (const recipient of to.concat(cc)) {
      if (recipient.emailAddress?.address) {
        recipients.push({
          email: recipient.emailAddress.address,
          name: recipient.emailAddress.name || recipient.emailAddress.address
        });
      }
    }

    return recipients;
  }

  static async downloadAttachments(token, mailbox, messageId, axiosOpts) {
    try {
      const attachRes = await axios.get(
        `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}/attachments`,
        {
          ...axiosOpts,
          headers: { Authorization: `Bearer ${token}` },
          params: { $top: 20 }
        }
      );

      const attachments = attachRes.data.value || [];
      const uploaded = [];

      for (const att of attachments) {
        if (att['@odata.type'] === '#microsoft.graph.fileAttachment') {
          try {
            const contentBinary = Buffer.from(att.contentBytes, 'base64');
            const ext = path.extname(att.name) || '.bin';
            const filename = `mail_${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
            const destPath = path.join(__dirname, '..', '..', 'uploads', filename);

            if (!fs.existsSync(path.join(__dirname, '..', '..', 'uploads'))) {
              fs.mkdirSync(path.join(__dirname, '..', '..', 'uploads'), { recursive: true });
            }

            fs.writeFileSync(destPath, contentBinary);
            uploaded.push({ filename, originalName: att.name, path: `/uploads/${filename}` });
          } catch (e) {
            console.error(`Erreur téléchargement attachment ${att.name}:`, e.message);
          }
        }
      }

      return uploaded;
    } catch (e) {
      console.error('Erreur récupération attachments:', e.message);
      return [];
    }
  }

  static async findExistingTicket(emailMessageId, inReplyTo) {
    let mapping = await pgDb.get(
      'SELECT ticket_id FROM hub_tickets.ticket_email_mapping WHERE email_message_id = ?',
      [emailMessageId]
    );

    if (!mapping && inReplyTo) {
      mapping = await pgDb.get(
        'SELECT ticket_id FROM hub_tickets.ticket_email_mapping WHERE email_message_id = ?',
        [inReplyTo]
      );
    }

    return mapping?.ticket_id || null;
  }

  static async findExistingTicketBySubject(subject) {
    if (!subject) return null;
    const baseSubject = subject.replace(/^(RE:|FW:)\s*/i, '').trim();

    const ticket = await pgDb.get(
      `SELECT DISTINCT m.ticket_id
       FROM hub_tickets.ticket_email_mapping m
       JOIN hub_tickets.tickets t ON m.ticket_id = t.glpi_id
       WHERE t.title ILIKE ?
       AND m.is_initial_email = true
       ORDER BY m.imported_at DESC
       LIMIT 1`,
      [`%${baseSubject}%`]
    );

    return ticket?.ticket_id || null;
  }

  static async createTicket(email, classificationResult, collector) {
    const from = this.extractFromEmail(email);
    const subject = (email.subject || 'Sans titre').substring(0, 255);
    const bodyContent = email.body?.content
      ? email.body.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 1000)
      : (email.bodyPreview || '');

    const ticketId = await ticketRepo.create({
      title: subject,
      content: bodyContent,
      requester_name: from.name,
      requester_email: from.email,
      type: String(classificationResult.type),
      source: 'mail',
      status: 1,
      priority: 3,
      urgency: 3,
      impact: 2
    });

    return ticketId;
  }

  static async addObservers(ticketId, email) {
    const recipients = this.extractRecipients(email);
    if (recipients.length === 0) return 0;

    let count = 0;
    for (const recipient of recipients) {
      try {
        let user = await pgDb.get('SELECT id FROM hub.users WHERE email = ?', [recipient.email]);

        if (!user) {
          const username = recipient.email.split('@')[0];
          const createResult = await pgDb.run(
            'INSERT INTO hub.users (username, email, display_name, is_active, role) VALUES (?, ?, ?, 1, ?)',
            [username, recipient.email, recipient.name, 'user']
          );
          user = { id: createResult.lastID };
        }

        await observerRepo.add(ticketId, user.id, {
          user_id: user.id,
          username: recipient.email.split('@')[0],
          name: recipient.name,
          email: recipient.email
        });

        count++;
      } catch (e) {
        console.error(`Erreur ajout observateur ${recipient.email}:`, e.message);
      }
    }

    return count;
  }

  static async addAttachments(ticketId, attachments, username) {
    if (!attachments || attachments.length === 0) return 0;

    let count = 0;
    for (const att of attachments) {
      try {
        const stat = fs.statSync(path.join(__dirname, '..', '..', 'uploads', path.basename(att.path)));
        const user = await pgDb.get('SELECT id FROM hub.users WHERE username = ?', [username]);

        await attachmentRepo.create(ticketId, {
          filename: att.filename,
          original_name: att.originalName,
          file_path: att.path,
          file_size: stat.size,
          mimetype: 'application/octet-stream',
          uploaded_by: user?.id || 1
        });

        count++;
      } catch (e) {
        console.error(`Erreur ajout attachment ${att.filename}:`, e.message);
      }
    }

    return count;
  }

  static async collectMailbox(collector, token, o365Settings, axiosOpts) {
    const log = {
      collector_id: collector.id,
      emails_received: 0,
      emails_imported: 0,
      emails_skipped: 0,
      emails_failed: 0,
      tickets_created: 0,
      comments_added: 0,
      attachments_processed: 0,
      errors: [],
      status: 'success'
    };

    try {
      let allEmails = [];
      const filterDate = collector.last_run ? new Date(collector.last_run).toISOString() : null;
      let filter = filterDate ? `receivedDateTime ge ${filterDate}` : '';

      if (collector.domain_filter) {
        const domainFilter = `from/emailAddress/address endsWith '${collector.domain_filter.replace(/'/g, "''")}'`;
        filter = filter ? `${filter} and ${domainFilter}` : domainFilter;
      }

      let nextLink = null;
      const firstRes = await axios.get(
        `https://graph.microsoft.com/v1.0/users/${collector.mailbox}/messages`,
        {
          ...axiosOpts,
          headers: { Authorization: `Bearer ${token}` },
          params: {
            $filter: filter || undefined,
            $top: 100,
            $select: 'id,subject,receivedDateTime,from,toRecipients,ccRecipients,body,bodyPreview,internetMessageId,hasAttachments'
          }
        }
      );

      allEmails.push(...(firstRes.data.value || []));
      nextLink = firstRes.data['@odata.nextLink'] || null;

      while (nextLink) {
        const pageRes = await axios.get(nextLink, {
          ...axiosOpts,
          headers: { Authorization: `Bearer ${token}` }
        });
        allEmails.push(...(pageRes.data.value || []));
        nextLink = pageRes.data['@odata.nextLink'] || null;
      }

      log.emails_received = allEmails.length;

      for (const email of allEmails) {
        try {
          const msgId = email.internetMessageId || email.id;
          const existing = await pgDb.get(
            'SELECT ticket_id FROM hub_tickets.ticket_email_mapping WHERE email_message_id = ?',
            [msgId]
          );

          if (existing) {
            log.emails_skipped++;
            continue;
          }

          // Detect reply emails by subject line (RE: or FW:)
          const isReply = /^(RE:|FW:)/i.test(email.subject || '');
          const existingTicket = isReply ? await this.findExistingTicketBySubject(email.subject) : null;

          if (existingTicket) {
            // Ajout comme commentaire
            const from = this.extractFromEmail(email);
            const content = this.extractReplyContent(email.body?.content);

            if (content) {
              const systemUser = {
                username: from.email.split('@')[0],
                displayName: from.name,
                email: from.email
              };
              await commentRepo.create(existingTicket, {
                content,
                is_private: 0
              }, systemUser);
              log.comments_added++;
            }

            // Attachments pour le commentaire
            if (email.hasAttachments) {
              const attachments = await this.downloadAttachments(token, collector.mailbox, email.id, axiosOpts);
              const attachCount = await this.addAttachments(existingTicket, attachments, 'system');
              log.attachments_processed += attachCount;
            }

            // Enregistrer le mapping
            await pgDb.run(
              'INSERT INTO hub_tickets.ticket_email_mapping (ticket_id, email_message_id, email_in_reply_to, is_initial_email, email_from, email_received_at) VALUES (?, ?, ?, 0, ?, ?)',
              [existingTicket, msgId, null, this.extractFromEmail(email).email, email.receivedDateTime]
            );

            log.emails_imported++;
          } else {
            // Nouveau ticket
            const classif = await MailRulesService.classifyTicket(email.subject, email.body?.content);
            const ticketId = await this.createTicket(email, classif, collector);

            // Observateurs
            const obsCount = await this.addObservers(ticketId, email);

            // Attachments
            let attachCount = 0;
            if (email.hasAttachments) {
              const attachments = await this.downloadAttachments(token, collector.mailbox, email.id, axiosOpts);
              attachCount = await this.addAttachments(ticketId, attachments, 'system');
              log.attachments_processed += attachCount;
            }

            // Mapping
            await pgDb.run(
              'INSERT INTO hub_tickets.ticket_email_mapping (ticket_id, email_message_id, email_in_reply_to, is_initial_email, email_from, email_received_at) VALUES (?, ?, ?, 1, ?, ?)',
              [ticketId, msgId, null, this.extractFromEmail(email).email, email.receivedDateTime]
            );

            log.tickets_created++;
            log.emails_imported++;
          }
        } catch (e) {
          console.error('Erreur traitement email:', e.message);
          log.emails_failed++;
          log.errors.push(`Email ${email.subject}: ${e.message}`);
          if (log.status === 'success') log.status = 'partial_error';
        }
      }

      return log;
    } catch (error) {
      log.status = 'failed';
      log.errors.push(error.message);
      throw error;
    }
  }

  static async performCollection(collectorId) {
    const collector = await pgDb.get('SELECT * FROM hub_tickets.mail_collectors WHERE id = ?', [collectorId]);
    if (!collector || !collector.is_enabled) {
      throw new Error('Collecteur non trouvé ou désactivé');
    }

    const sqlite = getSqlite();
    const o365Settings = await sqlite.get('SELECT * FROM o365_settings WHERE id = 1');

    if (!o365Settings || !o365Settings.is_enabled || !o365Settings.client_id || !o365Settings.client_secret || !o365Settings.tenant_id) {
      throw new Error('O365 non configuré dans les paramètres (/admin > Messagerie & Emails)');
    }

    // Credentials depuis o365_settings, mailbox propre à ce collecteur
    o365Settings.mailbox = collector.mailbox;

    const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || null;
    const axiosOpts = proxyUrl
      ? { httpsAgent: new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false }), proxy: false }
      : { httpsAgent: new https.Agent({ rejectUnauthorized: false }) };

    const token = await this.getGraphToken(o365Settings);
    const log = await this.collectMailbox(collector, token, o365Settings, axiosOpts);

    // Sauvegarder le log
    await pgDb.run(
      `INSERT INTO hub_tickets.mail_collector_logs (
        collector_id, emails_received, emails_imported, emails_skipped, emails_failed,
        tickets_created, comments_added, attachments_processed, errors, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        collectorId, log.emails_received, log.emails_imported, log.emails_skipped,
        log.emails_failed, log.tickets_created, log.comments_added, log.attachments_processed,
        JSON.stringify(log.errors), log.status
      ]
    );

    // Mettre à jour last_run et next_run
    const now = new Date();
    const nextRun = this.getNextRunTime(collector.frequency, now);
    await pgDb.run(
      'UPDATE hub_tickets.mail_collectors SET last_run = ?, next_run = ?, updated_at = NOW() WHERE id = ?',
      [now.toISOString(), nextRun.toISOString(), collectorId]
    );

    return log;
  }

  static getNextRunTime(frequency, fromDate = new Date()) {
    const next = new Date(fromDate);
    switch (frequency) {
      case 'every_15_min':
        next.setMinutes(next.getMinutes() + 15);
        break;
      case 'hourly':
        next.setHours(next.getHours() + 1);
        break;
      case '4_hours':
        next.setHours(next.getHours() + 4);
        break;
      case 'daily':
        next.setDate(next.getDate() + 1);
        next.setHours(2, 0, 0, 0);
        break;
      default:
        next.setHours(next.getHours() + 1);
    }
    return next;
  }
}

module.exports = MailCollectorService;
