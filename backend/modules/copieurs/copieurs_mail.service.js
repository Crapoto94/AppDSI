const axios = require('axios');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { pgDb, getSqlite } = require('../../shared/database');

async function importEmailsService(mailbox, domainFilter) {
  const db = getSqlite();
  const settings = await db.get('SELECT * FROM o365_settings WHERE id = 1');
  if (!settings || !settings.is_enabled || !settings.client_id || !settings.client_secret || !settings.tenant_id) {
    throw new Error('O365 non configuré');
  }

  const targetMailbox = mailbox || settings.mailbox;
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy || null;
  const axiosOpts = proxyUrl
    ? { httpsAgent: new HttpsProxyAgent(proxyUrl, { rejectUnauthorized: false }), proxy: false }
    : { httpsAgent: new https.Agent({ rejectUnauthorized: false }) };

  const tokenRes = await axios.post(
    `https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`,
    new URLSearchParams({ client_id: settings.client_id, client_secret: settings.client_secret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }).toString(),
    { ...axiosOpts, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const token = tokenRes.data.access_token;

  let filter = "from/emailAddress/address eq 'sav.idf@koesio.com'";
  if (domainFilter) filter += ` and from/emailAddress/address ne null`;

  const allEmails = [];
  let nextLink = null;
  const firstRes = await axios.get(`https://graph.microsoft.com/v1.0/users/${targetMailbox}/messages`, {
    ...axiosOpts,
    headers: { Authorization: `Bearer ${token}` },
    params: { $filter: filter, $top: 100, $select: 'id,subject,receivedDateTime,from,body,bodyPreview,internetMessageId' }
  });
  allEmails.push(...(firstRes.data.value || []));
  nextLink = firstRes.data['@odata.nextLink'] || null;
  while (nextLink) {
    const pageRes = await axios.get(nextLink, { ...axiosOpts, headers: { Authorization: `Bearer ${token}` } });
    allEmails.push(...(pageRes.data.value || []));
    nextLink = pageRes.data['@odata.nextLink'] || null;
  }

  let imported = 0, skipped = 0, matched = 0, noMatch = 0;

  for (const email of allEmails) {
    try {
      const existing = await pgDb.get('SELECT id FROM hub_copieurs.copieur_interventions WHERE email_message_id = ?', [email.internetMessageId || email.id]);
      if (existing) { skipped++; continue; }

      const body = email.body?.content || email.bodyPreview || '';
      const cleanBody = body.replace(/<[^>]+>/g, '\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
      const lines = cleanBody.split('\n').map(l => l.trim()).filter(l => l);

      let demandeur = '';
      const bonjourMatch = cleanBody.match(/Bonjour\s+(.{2,50}?)\s*,/);
      if (bonjourMatch) demandeur = bonjourMatch[1].trim();

      let technicien = '', serialNumber = '';
      const bienLine = lines.find(l => /^bien\s*:/i.test(l));
      if (bienLine) {
        const words = bienLine.split(/\s+/).filter(w => w);
        const candidate = words[words.length - 1].replace(/[^a-zA-Z0-9]/g, '');
        if (candidate.length >= 5) serialNumber = candidate;
        const cordIdx = lines.findIndex(l => /^cordialement/i.test(l));
        if (cordIdx !== -1 && lines[cordIdx + 1]) technicien = lines[cordIdx + 1].trim();
      } else {
        let matLineIdx = -1;
        for (let li = lines.length - 1; li >= 0; li--) {
          if (/mat.riel\s*concern./i.test(lines[li])) { matLineIdx = li; break; }
        }
        if (matLineIdx !== -1) {
          const afterColon = lines[matLineIdx].replace(/mat.riel\s*concern.\s*:?\s*/i, '').trim();
          const sourceLine = afterColon.length > 3 ? afterColon : (lines[matLineIdx + 1] || '');
          const words = sourceLine.split(/\s+/).filter(w => w);
          if (words.length) {
            const candidate = words[words.length - 1].replace(/[^a-zA-Z0-9]/g, '');
            if (candidate.length >= 5) serialNumber = candidate;
          }
        }
        const techMatch = cleanBody.match(/Notre technicien[^,]*,\s*([^,]+),/i);
        if (techMatch) technicien = techMatch[1].trim();
      }

      let detailText = '';
      const rawLines = cleanBody.split('\n');
      let detailStartIdx = -1;
      for (let li = 0; li < rawLines.length; li++) {
        const trimmed = rawLines[li].trim();
        if (/^d[eé]tail(?:\s+dit|\s+de\s+l.intervention)\s*:?\s*$/i.test(trimmed)) { detailStartIdx = li + 1; break; }
        const inline = trimmed.match(/^d[eé]tail(?:\s+dit|\s+de\s+l.intervention)\s*:?\s*(.+)/i);
        if (inline) { detailText = inline[1].trim(); detailStartIdx = li + 1; break; }
      }
      if (detailStartIdx !== -1) {
        for (let li = detailStartIdx; li < rawLines.length; li++) {
          const l = rawLines[li].trim();
          if (/^(cordialement|bien\s+cordialement|notre\s+technicien|de\s*:|à\s*:|--)/i.test(l)) break;
          if (!l && detailText.length > 30) break;
          if (l) detailText += (detailText ? '\n' : '') + l;
        }
      }
      if (!detailText) detailText = cleanBody.substring(0, 800);

      const copieur = serialNumber ? await pgDb.get('SELECT id FROM hub_copieurs.copieurs WHERE numero_serie = ?', [serialNumber]) : null;
      if (copieur) matched++; else noMatch++;

      const receivedDate = email.receivedDateTime ? new Date(email.receivedDateTime) : new Date();
      const localDate = receivedDate.toLocaleString('sv').split(' ')[0];

      await pgDb.run(
        `INSERT INTO hub_copieurs.copieur_interventions (copieur_id, date_intervention, mainteneur, technicien, description, created_by, email_message_id, email_subject, email_received_at, email_from, email_demandeur) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [copieur ? copieur.id : null, localDate, email.from?.emailAddress?.name || 'Koesio', technicien, detailText.substring(0, 1500), 'import-email', email.internetMessageId || email.id, email.subject || '', email.receivedDateTime || null, email.from?.emailAddress?.address || '', demandeur]
      );
      imported++;
    } catch (e) {
      console.error('[CopieursMailService] Erreur traitement email:', e.message);
    }
  }

  return { emails_received: allEmails.length, emails_imported: imported, emails_skipped: skipped, matched, noMatch };
}

module.exports = { importEmailsService };
