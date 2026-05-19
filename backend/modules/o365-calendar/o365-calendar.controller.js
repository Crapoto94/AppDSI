const { pgDb } = require('../../shared/pg_db');
const { getSqlite } = require('../../shared/database');
const axios = require('axios');

async function getAzureToken() {
    const db = getSqlite();
    const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
    if (!settings || !settings.is_enabled) throw new Error('Azure AD non configuré');
    if (!settings.client_id || !settings.client_secret || !settings.tenant_id) throw new Error('Identifiants Azure AD incomplets');

    const tokenRes = await axios.post(
        `https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`,
        new URLSearchParams({
            client_id: settings.client_id,
            client_secret: settings.client_secret,
            grant_type: 'client_credentials',
            scope: 'https://graph.microsoft.com/.default'
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return tokenRes.data.access_token;
}

const O365CalendarController = {
    // --- Calendar CRUD ---
    getCalendars: async (req, res) => {
        try {
            const calendars = await pgDb.all('SELECT * FROM o365_calendars ORDER BY name ASC');
            res.json(calendars);
        } catch (err) {
            console.error('[O365] Error fetching calendars:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    addCalendar: async (req, res) => {
        try {
            const { name, email, calendar_id } = req.body;
            if (!name || !email) return res.status(400).json({ message: 'Nom et email requis' });
            const result = await pgDb.run(
                'INSERT INTO o365_calendars (name, email, calendar_id, enabled) VALUES (?, ?, ?, 1)',
                [name, email, calendar_id || '']
            );
            const calendar = await pgDb.get('SELECT * FROM o365_calendars WHERE id = ?', [result.lastID]);
            res.json(calendar);
        } catch (err) {
            console.error('[O365] Error adding calendar:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    updateCalendar: async (req, res) => {
        try {
            const { name, email, calendar_id, enabled, default_categorie } = req.body;
            await pgDb.run(
                'UPDATE o365_calendars SET name=?, email=?, calendar_id=?, enabled=?, default_categorie=? WHERE id=?',
                [name, email, calendar_id || '', enabled !== undefined ? (enabled ? 1 : 0) : 1, default_categorie || 'reunion', req.params.id]
            );
            const calendar = await pgDb.get('SELECT * FROM o365_calendars WHERE id = ?', [req.params.id]);
            res.json(calendar);
        } catch (err) {
            console.error('[O365] Error updating calendar:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    deleteCalendar: async (req, res) => {
        try {
            await pgDb.run('DELETE FROM o365_events WHERE calendar_id = ?', [req.params.id]);
            await pgDb.run('DELETE FROM o365_calendars WHERE id = ?', [req.params.id]);
            res.json({ message: 'Supprimé' });
        } catch (err) {
            console.error('[O365] Error deleting calendar:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    // --- List available calendars from Microsoft Graph ---
listAvailableCalendars: async (req, res) => {
        try {
            const { email } = req.query;
            if (email && !email.includes('@')) {
                return res.status(400).json({ message: 'Veuillez entrer une adresse email complète (ex: prenom.nom@domaine.com)', error: 'Invalid email format' });
            }
            const token = await getAzureToken();

            if (email) {
                let userRes;
                try {
                    userRes = await axios.get(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/calendars`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                } catch (graphErr) {
                    const errMsg = graphErr.response?.data?.error?.message || graphErr.message;
                    const errStatus = graphErr.response?.status;
                    console.error('[O365] Graph API error listing calendars for', email, ':', errStatus, errMsg);
                    if (errStatus === 403 || (errMsg || '').toLowerCase().includes('access denied') || (errMsg || '').toLowerCase().includes('insufficient privileges')) {
                        return res.status(403).json({ message: 'Permission insuffisante : l\'application Azure AD doit avoir la permission Application "Calendars.Read". Ajoutez-la dans Azure AD > App Registrations > API Permissions > Add permission > Microsoft Graph > Application permissions > Calendars.Read, puis accordez le consentement administrateur.', error: errMsg });
                    }
                    if (errStatus === 404 || (errMsg || '').includes('invalid') || (errMsg || '').includes('not found')) {
                        return res.status(404).json({ message: `Utilisateur "${email}" introuvable dans Azure AD. Vérifiez que l'email correspond à un compte existant.`, error: errMsg });
                    }
                    throw graphErr;
                }
                const calendars = userRes.data.value.map(c => ({
                    id: c.id,
                    name: c.name,
                    owner: c.owner?.address || email,
                    isDefaultCalendar: c.isDefaultCalendar
                }));
                return res.json(calendars);
            }

            return res.status(400).json({ message: 'Un email est requis pour rechercher des calendriers' });
        } catch (err) {
            console.error('[O365] Error listing calendars:', err.response?.data || err.message);
            res.status(500).json({ message: 'Erreur lors de la recherche des calendriers O365', error: err.response?.data?.error?.message || err.message });
        }
    },

    _syncCalendar: async (calendar) => {
        const token = await getAzureToken();
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
        const startStr = start.toISOString();
        const endStr = end.toISOString();

        const url = calendar.calendar_id
            ? `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(calendar.email)}/calendars/${encodeURIComponent(calendar.calendar_id)}/calendarView?startDateTime=${encodeURIComponent(startStr)}&endDateTime=${encodeURIComponent(endStr)}&$top=500`
            : `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(calendar.email)}/calendarView?startDateTime=${encodeURIComponent(startStr)}&endDateTime=${encodeURIComponent(endStr)}&$top=500`;

        const eventsRes = await axios.get(url, {
            headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="Europe/Paris"' }
        });

        const events = eventsRes.data.value || [];
        let upserted = 0;
        let deleted = 0;

        const currentIds = new Set(events.map(e => e.id));

        for (const evt of events) {
            const isAllDay = evt.isAllDay || (evt.start && evt.start.dateTime && evt.end && evt.end.dateTime && evt.start.dateTime.includes('00:00:00') && evt.end.dateTime.includes('00:00:00'));
            let startDate, endDate;

            if (isAllDay && evt.start && evt.start.date) {
                startDate = evt.start.date;
                endDate = evt.end ? evt.end.date : startDate;
            } else if (evt.start && evt.start.dateTime) {
                const s = new Date(evt.start.dateTime);
                const e = new Date(evt.end.dateTime);
                startDate = `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
                endDate = startDate;
            } else {
                continue;
            }

            let categorie = 'reunion';
            const subject = (evt.subject || '').toLowerCase();
            const o365Categories = (evt.categories || []).map(c => c.toLowerCase());
            if (subject.includes('cong') || subject.includes('absence') || subject.includes('leave') || subject.includes('holiday') || subject.includes('rtt') || subject.includes('repos') || o365Categories.some(c => c.includes('absence') || c.includes('cong') || c.includes('holiday') || c.includes('leave'))) {
                categorie = 'absence';
            } else if (subject.includes('télétravail') || subject.includes('teletravail') || subject.includes('tt ') || subject.includes('wk@home') || o365Categories.some(c => c.includes('teletravail') || c.includes('télétravail'))) {
                categorie = 'teletravail';
            } else if (subject.includes('déploiement') || subject.includes('deploiement') || subject.includes('maintenance') || subject.includes('release') || o365Categories.some(c => c.includes('déploiement') || c.includes('deploiement') || c.includes('maintenance') || c.includes('release'))) {
                categorie = 'deploiement';
            }

            if (categorie === 'reunion') {
                if (calendar.default_categorie && calendar.default_categorie !== 'reunion') {
                    categorie = calendar.default_categorie;
                } else if (subject.includes('réunion') || subject.includes('reunion') || subject.includes('meeting') || subject.includes('point') || subject.includes('stand-up') || subject.includes('standup') || subject.includes('retro') || subject.includes('sprint') || subject.includes('workshop') || subject.includes('atelier')) {
                    categorie = 'reunion';
                }
            }

            try {
                await pgDb.run(
                    `INSERT INTO o365_events (calendar_id, o365_id, subject, body_preview, start_date, end_date, is_all_day, location, organizer, categorie)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON CONFLICT (calendar_id, o365_id) DO UPDATE SET subject=EXCLUDED.subject, body_preview=EXCLUDED.body_preview, start_date=EXCLUDED.start_date, end_date=EXCLUDED.end_date, is_all_day=EXCLUDED.is_all_day, location=EXCLUDED.location, organizer=EXCLUDED.organizer, categorie=EXCLUDED.categorie`,
                    [calendar.id, evt.id, evt.subject || '', evt.bodyPreview || '', startDate, endDate || startDate, isAllDay ? 1 : 0, evt.location?.displayName || '', evt.organizer?.emailAddress?.address || '', categorie]
                );
                upserted++;
            } catch (e) {
                console.error('[O365] Error upserting event:', e.message);
            }
        }

        const existing = await pgDb.all('SELECT o365_id FROM o365_events WHERE calendar_id = ?', [calendar.id]);
        for (const row of existing) {
            if (!currentIds.has(row.o365_id)) {
                await pgDb.run('DELETE FROM o365_events WHERE calendar_id = ? AND o365_id = ?', [calendar.id, row.o365_id]);
                deleted++;
            }
        }

        await pgDb.run('UPDATE o365_calendars SET last_sync_at = CURRENT_TIMESTAMP WHERE id = ?', [calendar.id]);
        return { upserted, deleted };
    },

    syncAllEnabled: async () => {
        try {
            const calendars = await pgDb.all('SELECT * FROM o365_calendars WHERE enabled = 1');
            if (calendars.length === 0) return { synced: 0, errors: 0 };
            let synced = 0;
            let errors = 0;
            for (const cal of calendars) {
                try {
                    const result = await O365CalendarController._syncCalendar(cal);
                    console.log(`[O365 AUTO-SYNC] Synced "${cal.name}" (${cal.email}): ${result.upserted} upserted, ${result.deleted} deleted`);
                    synced++;
                } catch (e) {
                    console.error(`[O365 AUTO-SYNC] Error syncing "${cal.name}" (${cal.email}):`, e.response?.data?.error?.message || e.message);
                    errors++;
                }
            }
            return { synced, errors };
        } catch (e) {
            console.error('[O365 AUTO-SYNC] Error:', e.message);
            return { synced: 0, errors: 1 };
        }
    },

    syncCalendar: async (req, res) => {
        try {
            const calendar = await pgDb.get('SELECT * FROM o365_calendars WHERE id = ?', [req.params.id]);
            if (!calendar) return res.status(404).json({ message: 'Calendrier non trouvé' });

            try {
                const result = await O365CalendarController._syncCalendar(calendar);
                res.json({ message: `Synchronisé: ${result.upserted} événements mis à jour, ${result.deleted} supprimés`, synced: result.upserted, deleted: result.deleted });
            } catch (graphErr) {
                const errMsg = graphErr.response?.data?.error?.message || graphErr.message;
                const errStatus = graphErr.response?.status;
                if (errStatus === 403 || (errMsg || '').toLowerCase().includes('access denied') || (errMsg || '').toLowerCase().includes('insufficient privileges')) {
                    return res.status(403).json({ message: 'Permission insuffisante : l\'application Azure AD doit avoir la permission Application "Calendars.Read". Ajoutez-la dans Azure AD > App Registrations > API Permissions > Add permission > Microsoft Graph > Application permissions > Calendars.Read, puis accordez le consentement administrateur.', error: errMsg });
                }
                if (errStatus === 404 || (errMsg || '').includes('invalid') || (errMsg || '').includes('not found')) {
                    return res.status(404).json({ message: `Utilisateur "${calendar.email}" introuvable dans Azure AD.`, error: errMsg });
                }
                throw graphErr;
            }
        } catch (err) {
            console.error('[O365] Error syncing calendar:', err.response?.data || err.message);
            res.status(500).json({ message: 'Erreur de synchronisation', error: err.response?.data?.error?.message || err.message });
        }
    },

    // --- Get sync status ---
    getSyncStatus: async (req, res) => {
        try {
            const calendars = await pgDb.all('SELECT id, name, email, last_sync_at, enabled FROM o365_calendars ORDER BY name ASC');
            for (const cal of calendars) {
                const count = await pgDb.get('SELECT COUNT(*) as cnt FROM o365_events WHERE calendar_id = ?', [cal.id]);
                cal.event_count = count.cnt;
            }
            res.json(calendars);
        } catch (err) {
            console.error('[O365] Error getting sync status:', err.message);
            res.status(500).json({ message: err.message });
        }
    },

    // --- Get events for calendrier-dsi integration ---
    getEventsForDateRange: async (startDate, endDate) => {
        try {
            const calendars = await pgDb.all('SELECT id, name, email FROM o365_calendars WHERE enabled = 1');
            if (calendars.length === 0) return [];

            const events = [];
            for (const cal of calendars) {
                const rows = await pgDb.all(
                    `SELECT * FROM o365_events WHERE calendar_id = ? AND start_date::date >= ?::date AND start_date::date <= ?::date`,
                    [cal.id, startDate, endDate]
                );
                console.log(`[O365] Calendar "${cal.name}" (${cal.email}): found ${rows.length} events between ${startDate} and ${endDate}`);
                for (const row of rows) {
                    events.push({
                        id: `o365_${row.id}`,
                        date: row.start_date ? (row.start_date instanceof Date ? `${row.start_date.getFullYear()}-${String(row.start_date.getMonth() + 1).padStart(2, '0')}-${String(row.start_date.getDate()).padStart(2, '0')}` : String(row.start_date).substring(0, 10)) : '',
                        categorie: row.categorie || 'reunion',
                        periode: row.is_all_day ? '' : (row.categorie === 'absence' || row.categorie === 'teletravail' ? '' : ''),
                        titre: `[O365] ${row.subject || 'Événement'}`,
                        description: row.body_preview || '',
                        agent_username: null,
                        agent_nom: null,
                        agent_email: row.organizer || cal.email,
                        couleur: row.categorie === 'absence' ? '#E30613' : row.categorie === 'teletravail' ? '#003366' : '#6366f1',
                        created_by: `o365:${cal.email}`,
                        created_at: row.created_at,
                        generated: false,
                        source: 'o365'
                    });
                }
            }
            return events;
        } catch (err) {
            console.error('[O365] Error getting events for date range:', err.message);
            return [];
        }
    }
};

module.exports = O365CalendarController;