const { pgDb, pool } = require('../../shared/pg_db');
const { getSqlite } = require('../../shared/database');
const ldap = require('ldapjs');
const { flattenLDAPEntry } = require('../../shared/utils');

let sendMailFn = null;

function pad2(n) { return String(n).padStart(2, '0'); }

function formatDateStr(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

async function buildCalendarDailyHtml(date) {
    const { getEventsForDate } = require('../calendrier-dsi/calendrier-dsi.controller');
    const events = await getEventsForDate(date);
    const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const byCategory = {};
    const rhAbsences = [];
    const manualAbsences = [];
    const CATEGORY_LABELS = {
        absence: 'Absents', teletravail: 'Télétravailleurs', deploiement: 'Déploiements',
        maintenance: 'Maintenances', reunion: 'Réunions importantes'
    };
    const CATEGORY_COLORS = {
        absence: '#E30613', teletravail: '#003366', deploiement: '#4CAF50',
        maintenance: '#FF9800', reunion: '#9C27B0'
    };

    for (const evt of events) {
        if (evt.categorie === 'absence' && (evt.source === 'demabs' || evt.created_by === 'auto-rh' || evt.created_by === 'auto-rh-pending')) {
            rhAbsences.push(evt);
        } else if (evt.categorie === 'absence') {
            manualAbsences.push(evt);
        } else {
            if (!byCategory[evt.categorie]) byCategory[evt.categorie] = [];
            byCategory[evt.categorie].push(evt);
        }
    }

    let html = `
        <html><head><meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; color: #333; margin: 0; padding: 20px; background: #f8fafc; }
            .container { max-width: 800px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
            h1 { color: #0f172a; border-bottom: 3px solid #0f172a; padding-bottom: 15px; margin-bottom: 30px; text-align: center; }
            .category-section { margin-bottom: 30px; }
            .category-header { display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: 8px; margin-bottom: 15px; font-weight: 700; color: white; }
            .category-item { padding: 12px 16px; background: #f8fafc; border-left: 4px solid #ccc; border-radius: 4px; margin-bottom: 10px; }
            .item-name { font-weight: 600; color: #0f172a; font-size: 0.95rem; }
            .item-period { color: #64748b; font-size: 0.85rem; margin-top: 4px; }
            .item-desc { color: #475569; font-size: 0.85rem; margin-top: 4px; font-style: italic; }
            .empty-day { text-align: center; color: #94a3b8; font-style: italic; padding: 40px 20px; }
        </style></head><body><div class="container">
        <h1>📅 Calendrier du ${formattedDate}</h1>`;

    if (events.length === 0) {
        html += '<div class="empty-day">✅ Aucun événement prévu pour cette journée</div>';
    } else {
        if (manualAbsences.length > 0) {
            html += `<div class="category-section"><div class="category-header" style="background-color: ${CATEGORY_COLORS.absence}">❌ Absences saisies (${manualAbsences.length})</div>`;
            for (const evt of manualAbsences) {
                const periodLabel = evt.periode ? ` - ${evt.periode === 'matin' ? 'Matin' : 'Après-midi'}` : ' - Journée entière';
                html += `<div class="category-item"><div class="item-name">${evt.titre}${periodLabel}</div>${evt.agent_nom ? `<div class="item-period">👤 ${evt.agent_nom}</div>` : ''}${evt.description ? `<div class="item-desc">${evt.description}</div>` : ''}</div>`;
            }
            html += '</div>';
        }

        if (rhAbsences.length > 0) {
            const rhKeys = new Set();
            const uniqueRh = rhAbsences.filter(e => { const k = `${e.titre || ''}|${e.periode || ''}`; if (rhKeys.has(k)) return false; rhKeys.add(k); return true; });
            const validated = uniqueRh.filter(e => !e.pending);
            const pending = uniqueRh.filter(e => e.pending);
            html += `<div class="category-section"><div class="category-header" style="background-color: ${CATEGORY_COLORS.absence}">🏥 Absences RH${validated.length > 0 ? ` (${validated.length} validée${validated.length > 1 ? 's' : ''})` : ''}${pending.length > 0 ? ` (${pending.length} en attente)` : ''}</div>`;
            for (const evt of uniqueRh) {
                const periodLabel = evt.periode ? ` - ${evt.periode === 'matin' ? 'Matin' : 'Après-midi'}` : ' - Journée entière';
                const badge = evt.pending ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:4px;font-size:0.75rem;margin-left:8px">⏳ En attente</span>' : '<span style="background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-size:0.75rem;margin-left:8px">✅ Validé</span>';
                html += `<div class="category-item" style="${evt.pending ? 'border-left-color: #f59e0b; background: #fffbeb;' : ''}"><div class="item-name">${evt.titre}${periodLabel}${badge}</div>${evt.agent_nom ? `<div class="item-period">👤 ${evt.agent_nom}</div>` : ''}</div>`;
            }
            html += '</div>';
        }

        const categoryOrder = ['teletravail', 'deploiement', 'maintenance', 'reunion'];
        for (const cat of categoryOrder) {
            if (byCategory[cat]) {
                const catEvents = byCategory[cat];
                const bgColor = CATEGORY_COLORS[cat];
                html += `<div class="category-section"><div class="category-header" style="background-color: ${bgColor}">${cat === 'teletravail' ? '💻' : cat === 'deploiement' ? '🔧' : cat === 'maintenance' ? '⚙️' : '📢'} ${CATEGORY_LABELS[cat]} (${catEvents.length})</div>`;
                for (const evt of catEvents) {
                    const periodLabel = evt.periode ? ` - ${evt.periode === 'matin' ? 'Matin' : 'Après-midi'}` : ' - Journée entière';
                    html += `<div class="category-item"><div class="item-name">${evt.titre}${periodLabel}</div>${evt.agent_nom ? `<div class="item-period">👤 ${evt.agent_nom}</div>` : ''}${evt.description ? `<div class="item-desc">${evt.description}</div>` : ''}</div>`;
                }
                html += '</div>';
            }
        }
    }

    html += '</div></body></html>';
    return { html, eventCount: events.length, formattedDate };
}

const EmailAutomationController = {
    getAutomations: async (req, res) => {
        try {
            const automations = await pgDb.all('SELECT * FROM email_automations ORDER BY name ASC');
            for (const a of automations) {
                a.recipients = await pgDb.all('SELECT * FROM email_automation_recipients WHERE automation_id = ?', [a.id]);
            }
            res.json(automations);
        } catch (err) {
            console.error('[EMAIL-AUTO] Error fetching automations:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    getAutomation: async (req, res) => {
        try {
            const automation = await pgDb.get('SELECT * FROM email_automations WHERE id = ?', [req.params.id]);
            if (!automation) return res.status(404).json({ message: 'Not found' });
            automation.recipients = await pgDb.all('SELECT * FROM email_automation_recipients WHERE automation_id = ?', [req.params.id]);
            res.json(automation);
        } catch (err) {
            console.error('[EMAIL-AUTO] Error fetching automation:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    createAutomation: async (req, res) => {
        try {
            const { name, description, frequency, content_type, content_url, subject_template, condition_type, condition_value } = req.body;
            const result = await pgDb.run(
                `INSERT INTO email_automations (name, description, frequency, content_type, content_url, subject_template, condition_type, condition_value)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [name, description || '', frequency || 'daily:08:00', content_type || 'calendar_daily', content_url || '', subject_template || '', condition_type || 'none', condition_value || '']
            );
            const automation = await pgDb.get('SELECT * FROM email_automations WHERE id = ?', [result.lastID]);
            automation.recipients = [];
            res.json(automation);
        } catch (err) {
            console.error('[EMAIL-AUTO] Error creating automation:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    updateAutomation: async (req, res) => {
        try {
            const { name, description, frequency, enabled, content_type, content_url, subject_template, condition_type, condition_value } = req.body;
            await pgDb.run(
                `UPDATE email_automations SET name=?, description=?, frequency=?, enabled=?, content_type=?, content_url=?, subject_template=?, condition_type=?, condition_value=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
                [name, description || '', frequency, enabled !== undefined ? (enabled ? 1 : 0) : 1, content_type || 'calendar_daily', content_url || '', subject_template || '', condition_type || 'none', condition_value || '', req.params.id]
            );
            const automation = await pgDb.get('SELECT * FROM email_automations WHERE id = ?', [req.params.id]);
            automation.recipients = await pgDb.all('SELECT * FROM email_automation_recipients WHERE automation_id = ?', [req.params.id]);
            res.json(automation);
        } catch (err) {
            console.error('[EMAIL-AUTO] Error updating automation:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    deleteAutomation: async (req, res) => {
        try {
            await pgDb.run('DELETE FROM email_automation_recipients WHERE automation_id = ?', [req.params.id]);
            await pgDb.run('DELETE FROM email_automation_logs WHERE automation_id = ?', [req.params.id]);
            await pgDb.run('DELETE FROM email_automations WHERE id = ?', [req.params.id]);
            res.json({ message: 'Supprimé' });
        } catch (err) {
            console.error('[EMAIL-AUTO] Error deleting automation:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    addRecipient: async (req, res) => {
        try {
            const { email, name, source } = req.body;
            const result = await pgDb.run(
                'INSERT INTO email_automation_recipients (automation_id, email, name, source) VALUES (?, ?, ?, ?)',
                [req.params.id, email, name || '', source || 'manual']
            );
            const recipient = await pgDb.get('SELECT * FROM email_automation_recipients WHERE id = ?', [result.lastID]);
            res.json(recipient);
        } catch (err) {
            console.error('[EMAIL-AUTO] Error adding recipient:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    removeRecipient: async (req, res) => {
        try {
            await pgDb.run('DELETE FROM email_automation_recipients WHERE id = ? AND automation_id = ?', [req.params.recipientId, req.params.id]);
            res.json({ message: 'Supprimé' });
        } catch (err) {
            console.error('[EMAIL-AUTO] Error removing recipient:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    searchAD: async (req, res) => {
        const { query } = req.body;
        if (!query || query.length < 2) return res.json([]);
        try {
            const db = getSqlite();
            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            if (!adSettings || !adSettings.is_enabled) return res.status(503).json({ message: 'AD Desactive' });

            const results = await new Promise((resolve, reject) => {
                const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
                client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                    if (err) { client.destroy(); return reject(err); }
                    const filter = `(&(objectClass=user)(|(sAMAccountName=*${query}*)(displayName=*${query}*)(cn=*${query}*)(mail=*${query}*)))`;
                    const entries = [];
                    client.search(adSettings.base_dn, { filter, scope: 'sub', attributes: ['sAMAccountName', 'displayName', 'cn', 'mail'], sizeLimit: 20 }, (err, searchRes) => {
                        if (err) { client.destroy(); return reject(err); }
                        searchRes.on('searchEntry', (entry) => {
                            const obj = flattenLDAPEntry(entry);
                            if (obj && obj.sAMAccountName) entries.push(obj);
                        });
                        searchRes.on('end', () => { client.destroy(); resolve(entries); });
                        searchRes.on('error', (err) => { client.destroy(); reject(err); });
                    });
                });
            });

            res.json(results.map(r => ({
                username: r.sAMAccountName,
                displayName: r.displayName || r.cn || r.sAMAccountName,
                email: r.mail || ''
            })));
        } catch (error) {
            console.error('[EMAIL-AUTO] Error searching AD:', error.message);
            res.status(500).json({ message: 'Erreur recherche AD', error: error.message });
        }
    },

    executeAutomation: async (req, res) => {
        try {
            const automation = await pgDb.get('SELECT * FROM email_automations WHERE id = ?', [req.params.id]);
            if (!automation) return res.status(404).json({ message: 'Automatisation non trouvée' });

            const result = await EmailAutomationController._runAutomation(automation);
            res.json(result);
        } catch (err) {
            console.error('[EMAIL-AUTO] Error executing automation:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    getLogs: async (req, res) => {
        try {
            const logs = await pgDb.all(
                'SELECT * FROM email_automation_logs WHERE automation_id = ? ORDER BY sent_at DESC LIMIT 200',
                [req.params.id]
            );
            res.json(logs);
        } catch (err) {
            console.error('[EMAIL-AUTO] Error fetching logs:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    _runAutomation: async (automation) => {
        const recipients = await pgDb.all('SELECT * FROM email_automation_recipients WHERE automation_id = ?', [automation.id]);

        if (recipients.length === 0) return { message: 'Aucun destinataire', sent: 0, failed: 0 };

        if (!sendMailFn) return { message: 'Service email non configuré', sent: 0, failed: 0 };

        let html = '';
        let subject = automation.subject_template || 'Notification automatique';
        let shouldSend = true;

        if (automation.content_type === 'calendar_daily') {
            const today = formatDateStr(new Date());
            const { html: contentHtml, eventCount, formattedDate } = await buildCalendarDailyHtml(today);

            if (automation.condition_type === 'has_events' && eventCount === 0) {
                shouldSend = false;
            }

            html = contentHtml;
            subject = subject.replace('{{date}}', formattedDate).replace('{{eventCount}}', String(eventCount));
        } else if (automation.content_type === 'url' && automation.content_url) {
            try {
                const axios = require('axios');
                const resp = await axios.get(automation.content_url, { timeout: 15000, responseType: 'text' });
                html = resp.data;
                subject = subject.replace('{{date}}', formatDateStr(new Date()));
            } catch (err) {
                console.error(`[EMAIL-AUTO] Error fetching URL ${automation.content_url}:`, err.message);
                for (const r of recipients) {
                    await pgDb.run(
                        'INSERT INTO email_automation_logs (automation_id, recipient_email, subject, status, error_message) VALUES (?, ?, ?, ?, ?)',
                        [automation.id, r.email, subject, 'failed', `Erreur fetch URL: ${err.message}`]
                    );
                }
                return { message: `Erreur fetch URL: ${err.message}`, sent: 0, failed: recipients.length };
            }
        } else {
            html = automation.content_url || 'Aucun contenu';
        }

        if (!shouldSend) {
            return { message: 'Condition non remplie (pas d\'événements)', sent: 0, failed: 0, skipped: true };
        }

        let sent = 0;
        let failed = 0;
        for (const r of recipients) {
            try {
                await sendMailFn(r.email, subject, html);
                await pgDb.run(
                    'INSERT INTO email_automation_logs (automation_id, recipient_email, subject, status) VALUES (?, ?, ?, ?)',
                    [automation.id, r.email, subject, 'sent']
                );
                sent++;
            } catch (err) {
                console.error(`[EMAIL-AUTO] Error sending to ${r.email}:`, err.message);
                await pgDb.run(
                    'INSERT INTO email_automation_logs (automation_id, recipient_email, subject, status, error_message) VALUES (?, ?, ?, ?, ?)',
                    [automation.id, r.email, subject, 'failed', err.message]
                );
                failed++;
            }
        }

        await pgDb.run('UPDATE email_automations SET last_sent_at = CURRENT_TIMESTAMP WHERE id = ?', [automation.id]);

        return { message: `Envoyé à ${sent} destinataire(s)${failed > 0 ? `, ${failed} échec(s)` : ''}`, sent, failed };
    }
};

const EmailAutomationExtra = {

    // GET /api/admin/email-automation/task-alerts
    getTaskAlertUsers: async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT username, displayname, email
                 FROM hub.users
                 WHERE task_alert_email = TRUE
                 ORDER BY displayname, username`
            );
            res.json(rows);
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    },

    // DELETE /api/admin/email-automation/task-alerts/:username
    disableTaskAlert: async (req, res) => {
        try {
            await pool.query(
                'UPDATE hub.users SET task_alert_email = FALSE WHERE LOWER(username) = LOWER($1)',
                [req.params.username]
            );
            res.json({ ok: true });
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    },

    // GET /api/admin/email-automation/mail-logs
    getAllMailLogs: async (req, res) => {
        try {
            const limit = Math.min(parseInt(req.query.limit) || 300, 1000);
            const source = req.query.source || null;
            const status = req.query.status || null;

            let where = '';
            const params = [];
            const conditions = [];
            if (source) { params.push(source); conditions.push(`source = $${params.length}`); }
            if (status) { params.push(status); conditions.push(`status = $${params.length}`); }
            if (conditions.length) where = 'WHERE ' + conditions.join(' AND ');
            params.push(limit);

            const { rows } = await pool.query(
                `SELECT * FROM hub.email_logs ${where} ORDER BY sent_at DESC LIMIT $${params.length}`,
                params
            );
            res.json(rows);
        } catch (err) {
            res.status(500).json({ message: err.message });
        }
    }
};

module.exports = {
    setSendMail: (fn) => { sendMailFn = fn; },
    ...EmailAutomationController,
    ...EmailAutomationExtra
};