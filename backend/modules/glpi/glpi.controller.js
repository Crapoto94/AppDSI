const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { getSqlite, pgDb, pool } = require('../../shared/database');

// Internal state for progress tracking
let glpiSyncProgress = {
    active: false,
    processed: 0,
    total: 0,
    startTime: null,
    lastUpdate: null,
    type: null
};

let glpiSyncCancelled = false;

let observersSyncProgress = {
    active: false,
    processed: 0,
    total: 0,
    startTime: null,
    lastUpdate: null
};

let observersSyncCancelled = false;

let followupsSyncProgress = { 
    active: false, 
    processed: 0, 
    total: 0,
    startTime: null,
    lastUpdate: null
};

let followupsSyncCancelled = false;

// Scheduled sync state
let currentRunningSync = null;
let syncQueue = [];


const glpiController = {
    // Basic Settings & Status
    getSyncStatus: (req, res) => res.json(glpiSyncProgress),
    
    cancelSync: (req, res) => {
        console.log('[GLPI Cancel] Demande d\'annulation reçue');
        glpiSyncCancelled = true;
        res.json({ success: true, message: 'Annulation demandée' });
    },

    getObserversStatus: (req, res) => res.json(observersSyncProgress),

    cancelObserversSync: (req, res) => {
        console.log('[GLPI Observers Cancel] Demande d\'annulation reçue');
        observersSyncCancelled = true;
        res.json({ success: true, message: 'Annulation demandée' });
    },

    getFollowupsStatus: (req, res) => res.json(followupsSyncProgress),

    cancelFollowupsSync: (req, res) => {
        console.log('[GLPI Followups Cancel] Demande d\'annulation reçue');
        followupsSyncCancelled = true;
        res.json({ success: true });
    },

    getSettings: async (req, res) => {
        try {
            const db = getSqlite();
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            res.json(settings || { url: '', app_token: '', user_token: '', is_enabled: 0 });
        } catch (error) {
            res.status(500).json({ message: 'Erreur lecture paramètres GLPI' });
        }
    },

    saveSettings: async (req, res) => {
        const { url, app_token, user_token, login, password, is_enabled } = req.body;
        try {
            const db = getSqlite();
            const exists = await db.get('SELECT id FROM glpi_settings WHERE id = 1');
            if (exists) {
                await db.run(
                    'UPDATE glpi_settings SET url = ?, app_token = ?, user_token = ?, login = ?, password = ?, is_enabled = ? WHERE id = 1',
                    [url, app_token, user_token, login, password, is_enabled ? 1 : 0]
                );
            } else {
                await db.run(
                    'INSERT INTO glpi_settings (id, url, app_token, user_token, login, password, is_enabled) VALUES (1, ?, ?, ?, ?, ?, ?)',
                    [url, app_token, user_token, login, password, is_enabled ? 1 : 0]
                );
            }
            res.json({ message: 'Paramètres GLPI enregistrés' });
        } catch (error) {
            res.status(500).json({ message: 'Erreur enregistrement paramètres GLPI' });
        }
    },

    testConnection: async (req, res) => {
        let { url, app_token, user_token, login, password } = req.body;
        try {
            url = (url || '').trim();
            app_token = (app_token || '').trim();
            user_token = (user_token || '').trim();
            login = (login || '').trim();
            password = (password || '').trim();

            if (url && !url.includes('apirest.php')) {
                url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
            }

            const commonHeaders = {
                'App-Token': app_token,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            let authHeader = (login && password)
                ? `Basic ${Buffer.from(`${login}:${password}`).toString('base64')}`
                : `user_token ${user_token}`;

            const response = await axios.get(`${url}/initSession`, {
                headers: { ...commonHeaders, 'Authorization': authHeader },
                timeout: 10000
            });

            if (response.data && response.data.session_token) {
                await axios.get(`${url}/killSession`, {
                    headers: { ...commonHeaders, 'Session-Token': response.data.session_token }
                });
                res.json({ success: true, message: 'Connexion GLPI réussie !' });
            } else {
                res.status(400).json({ success: false, message: 'Réponse invalide de GLPI' });
            }
        } catch (error) {
            console.error('GLPI Test Error:', error.message);
            const msg = error.response?.data?.[1] || error.response?.data?.message || error.message;
            res.status(500).json({ success: false, message: `Erreur de connexion : ${msg}` });
        }
    },

    // Ticket Operations
    getTicketsCount: async (req, res) => {
        try {
            const db = getSqlite();
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            if (!settings || !settings.url) return res.status(400).json({ message: 'Paramètres GLPI non configurés' });

            let url = settings.url.trim();
            if (!url.includes('apirest.php')) {
                url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
            }

            const commonHeaders = {
                'App-Token': settings.app_token?.trim() || '',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            let authHeader = (settings.login && settings.password)
                ? `Basic ${Buffer.from(`${settings.login.trim()}:${settings.password.trim()}`).toString('base64')}`
                : `user_token ${settings.user_token?.trim()}`;

            const sessionRes = await axios.get(`${url}/initSession`, {
                headers: { ...commonHeaders, 'Authorization': authHeader },
                timeout: 10000
            });

            const sessionToken = sessionRes.data?.session_token;
            if (!sessionToken) return res.status(401).json({ message: 'Impossible d\'initier la session GLPI.' });

            await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
            await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

            const searchUrl = `${url}/search/Ticket?session_token=${sessionToken}&range=0-1&get_all_entities=1`;
            const ticketsRes = await axios.get(searchUrl, { headers: commonHeaders });

            let count = 0;
            if (ticketsRes.data && ticketsRes.data.totalcount !== undefined) {
                count = parseInt(ticketsRes.data.totalcount, 10) || 0;
            } else {
                const contentRange = ticketsRes.headers['content-range'];
                if (contentRange) count = parseInt(contentRange.split('/')[1], 10) || 0;
            }

            await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
            res.json({ count });
        } catch (error) {
            console.error('[GLPI] Erreur tickets-count:', error.message);
            res.status(500).json({ success: false, message: `Erreur: ${error.message}` });
        }
    },

    getRecentTickets: async (req, res) => {
        try {
            const db = getSqlite();
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            if (!settings || !settings.url) return res.status(400).json({ message: 'Paramètres GLPI non configurés' });

            let url = settings.url.trim();
            if (!url.includes('apirest.php')) {
                url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
            }

            const commonHeaders = {
                'App-Token': settings.app_token?.trim() || '',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            let authHeader = (settings.login && settings.password)
                ? `Basic ${Buffer.from(`${settings.login.trim()}:${settings.password.trim()}`).toString('base64')}`
                : `user_token ${settings.user_token?.trim()}`;

            const sessionRes = await axios.get(`${url}/initSession`, {
                headers: { ...commonHeaders, 'Authorization': authHeader },
                timeout: 10000
            });

            const sessionToken = sessionRes.data?.session_token;
            if (!sessionToken) throw new Error('Session GLPI échouée');

            await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
            await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

            const searchUrl = `${url}/search/Ticket?session_token=${sessionToken}&range=0-5&sort=1&order=DESC&get_all_entities=1`;
            const ticketsRes = await axios.get(searchUrl, { headers: commonHeaders });

            let tickets = [];
            if (ticketsRes.data && Array.isArray(ticketsRes.data.data)) {
                tickets = ticketsRes.data.data.map(t => ({
                    id: t[2],
                    title: t[1],
                    date: t[19] || t[15]
                }));
            }

            await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
            res.json({ tickets });
        } catch (error) {
            console.error('[GLPI] Erreur tickets récents:', error.message);
            res.status(500).json({ message: 'Erreur lors de la récupération des tickets récents' });
        }
    },

    getUserTickets: async (req, res) => {
        try {
            const { username } = req.params;
            if (!username) return res.status(400).json({ message: 'Username requis' });

            const db = getSqlite();
            const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
            if (!user) return res.status(404).json({ message: 'Utilisateur non trouvé' });

            const userEmail = `${username}@ivry94.fr`;

            const createdTickets = await pgDb.all(
                `SELECT id, glpi_id, title, status, priority, urgency, date_creation,
                        date_mod, requester_name, requester_email_22 as requester_email, 'created' as ticket_type
                 FROM glpi.tickets
                 WHERE LOWER(requester_email_22) = LOWER($1) OR LOWER(email_alt) = LOWER($1)
                 ORDER BY date_mod DESC`,
                [userEmail]
            );

            const observedTickets = await pgDb.all(
                `SELECT t.id, t.glpi_id, t.title, t.status, t.priority, t.urgency,
                        t.date_creation, t.date_mod, t.requester_name, t.requester_email_22 as requester_email, 'observed' as ticket_type
                 FROM glpi.tickets t
                 INNER JOIN glpi.observers go ON t.glpi_id = go.ticket_id
                 WHERE LOWER(go.login) = LOWER($1) OR LOWER(go.email) = LOWER($2)
                 ORDER BY t.date_mod DESC`,
                [username, userEmail]
            );

            const allTickets = [...createdTickets];
            const createdIds = new Set(createdTickets.map(t => t.glpi_id));

            for (const ticket of observedTickets) {
                if (!createdIds.has(ticket.glpi_id)) {
                    allTickets.push(ticket);
                } else {
                    const idx = allTickets.findIndex(t => t.glpi_id === ticket.glpi_id);
                    if (idx >= 0) allTickets[idx].ticket_type = 'created_and_observed';
                }
            }

            res.json({
                username,
                userEmail,
                total: allTickets.length,
                created_count: createdTickets.length,
                observed_count: observedTickets.filter(t => !createdIds.has(t.glpi_id)).length,
                tickets: allTickets
            });
        } catch (error) {
            console.error('[GLPI] Erreur user-tickets:', error.message);
            res.status(500).json({ message: 'Erreur lors de la récupération des tickets utilisateur' });
        }
    },

    createTicket: async (req, res) => {
        try {
            const db = getSqlite();
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            if (!settings || !settings.url) return res.status(400).json({ message: 'GLPI non configuré' });

            let url = settings.url.trim();
            if (!url.includes('apirest.php')) {
                url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
            }

            const { title, content, type, urgency, priority, category_id } = req.body;
            if (!title) return res.status(400).json({ message: 'Titre requis' });

            const commonHeaders = {
                'App-Token': settings.app_token?.trim() || '',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            let authHeader = (settings.user_token?.trim())
                ? `user_token ${settings.user_token.trim()}`
                : `Basic ${Buffer.from(`${settings.login?.trim()}:${settings.password?.trim()}`).toString('base64')}`;

            const sessionRes = await axios.get(`${url}/initSession`, {
                headers: { ...commonHeaders, 'Authorization': authHeader },
                timeout: 10000
            });

            const sessionToken = sessionRes.data?.session_token;
            if (!sessionToken) throw new Error('Session GLPI échouée');

            await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });

            const ticketData = {
                input: {
                    name: title,
                    content: content || title,
                    type: type || 1,
                    urgency: urgency || 3,
                    priority: priority || 3,
                    itilcategories_id: category_id || 0
                }
            };

            const createRes = await axios.post(`${url}/Ticket`, ticketData, {
                headers: { ...commonHeaders, 'Session-Token': sessionToken },
                timeout: 15000
            });

            await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

            res.json({ success: true, ticket: createRes.data });

            // Background sync after creation
            setTimeout(() => glpiController.runBackgroundSyncRecent('magapp-user'), 2000);
        } catch (error) {
            console.error('[GLPI] Erreur création ticket:', error.message);
            res.status(500).json({ message: `Erreur création ticket: ${error.message}` });
        }
    },

    closeTicket: async (req, res) => {
        try {
            const ticketId = req.params.id;
            const db = getSqlite();
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            if (!settings || !settings.url) return res.status(400).json({ message: 'GLPI non configuré' });

            let url = settings.url.trim();
            if (!url.includes('apirest.php')) {
                url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
            }

            const commonHeaders = {
                'App-Token': settings.app_token?.trim() || '',
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            };

            let authHeader = (settings.user_token?.trim())
                ? `user_token ${settings.user_token.trim()}`
                : `Basic ${Buffer.from(`${settings.login?.trim()}:${settings.password?.trim()}`).toString('base64')}`;

            const sessionRes = await axios.get(`${url}/initSession`, {
                headers: { ...commonHeaders, 'Authorization': authHeader },
                timeout: 10000
            });

            const sessionToken = sessionRes.data?.session_token;
            if (!sessionToken) throw new Error('Session GLPI échouée');

            await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });

            await pool.query(
                `INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, total_tickets) VALUES ($1, $2, $3, $4, $5)`,
                ['ticket', 'close', 'magapp-user', 'running', 1]
            );

            const updateRes = await axios.put(`${url}/Ticket/${ticketId}`, {
                input: { id: parseInt(ticketId), status: 6 }
            }, {
                headers: { ...commonHeaders, 'Session-Token': sessionToken },
                timeout: 15000
            });

            // Immediate sync for this ticket
            const forcedFields = [1, 2, 3, 10, 11, 7, 12, 14, 15, 16, 17, 19, 83, 24, 9, 80, 4, 34, 22, 62];
            const forcedStr = forcedFields.map(id => `forcedisplay[${id}]=${id}`).join('&');
            const ticketRes = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&criteria[0][field]=2&criteria[0][searchtype]=equals&criteria[0][value]=${ticketId}&${forcedStr}`, { headers: commonHeaders, timeout: 10000 });

            if (ticketRes.data?.data && ticketRes.data.data.length > 0) {
                const t = ticketRes.data.data[0];
                await glpiController.saveTicketsToPg([t]);
            }

            await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
            res.json({ success: true, ticket: updateRes.data });
        } catch (error) {
            console.error('[GLPI] Erreur clôture ticket:', error.message);
            res.status(500).json({ message: `Erreur clôture ticket: ${error.message}` });
        }
    },

    // Synchronization Methods
    syncRecent: async (req, res) => {
        const triggeredBy = req.user?.username || 'admin';
        try {
            const count = await glpiController.runBackgroundSyncRecent(triggeredBy);
            res.json({ success: true, count });
        } catch (error) {
            res.status(500).json({ message: `Erreur: ${error.message}` });
        }
    },

    syncAllTickets: async (req, res) => {
        const triggeredBy = req.user?.username || 'admin';
        glpiSyncCancelled = false;
        glpiSyncProgress = { active: true, processed: 0, total: 0, startTime: new Date().toISOString(), lastUpdate: new Date().toISOString(), type: 'full' };

        try {
            const db = getSqlite();
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            if (!settings || !settings.url) {
                glpiSyncProgress.active = false;
                return res.status(400).json({ message: 'GLPI non configuré' });
            }

            const url = glpiController.getApiUrl(settings.url);
            const commonHeaders = { 'App-Token': settings.app_token?.trim() || '', 'Content-Type': 'application/json', 'Accept': 'application/json' };
            const authHeader = glpiController.getAuthHeader(settings);

            const sessionRes = await axios.get(`${url}/initSession`, { headers: { ...commonHeaders, 'Authorization': authHeader } });
            const sessionToken = sessionRes.data?.session_token;
            if (!sessionToken) throw new Error('Session GLPI échouée');
            
            await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
            await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

            const countRes = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&range=0-1&get_all_entities=1`, { headers: commonHeaders });
            const totalCount = parseInt(countRes.data.totalcount, 10) || 0;
            glpiSyncProgress.total = totalCount;

            const logResult = await pool.query(
                `INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, total_tickets) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                ['tickets', 'full', triggeredBy, 'running', totalCount]
            );
            const syncLogId = logResult.rows[0]?.id;

            if (totalCount === 0) {
                await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
                glpiSyncProgress.active = false;
                return res.json({ success: true, count: 0 });
            }

            const batchSize = 500;
            let processedCount = 0;

            const forcedFields = [1, 2, 3, 10, 11, 7, 12, 14, 15, 16, 17, 19, 83, 24, 9, 80, 4, 34, 22, 62];
            const forcedStr = forcedFields.map(id => `forcedisplay[${id}]=${id}`).join('&');

            for (let start = 0; start < totalCount; start += batchSize) {
                if (glpiSyncCancelled) {
                    glpiSyncProgress.active = false;
                    glpiSyncCancelled = false;
                    await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
                    return res.status(499).json({ message: 'Synchronisation annulée' });
                }

                const end = Math.min(start + batchSize, totalCount);
                const batchRes = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&range=${start}-${end - 1}&get_all_entities=1&${forcedStr}`, { headers: commonHeaders });

                if (batchRes.data && Array.isArray(batchRes.data.data)) {
                    await glpiController.saveTicketsToPg(batchRes.data.data);
                    processedCount += batchRes.data.data.length;
                    glpiSyncProgress.processed = processedCount;
                    glpiSyncProgress.lastUpdate = new Date().toISOString();
                }
            }

            await pool.query(`UPDATE glpi.sync_logs SET status = 'completed', processed_tickets = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2`, [processedCount, syncLogId]);
            await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
            
            glpiSyncProgress.active = false;
            res.json({ success: true, count: processedCount });
        } catch (error) {
            console.error('[GLPI] Sync Error:', error.message);
            glpiSyncProgress.active = false;
            res.status(500).json({ message: error.message });
        }
    },

    syncObservers: async (req, res) => {
        const triggeredBy = req.user?.username || 'admin';
        observersSyncCancelled = false;
        observersSyncProgress = { active: true, processed: 0, total: 0, startTime: new Date().toISOString(), lastUpdate: new Date().toISOString() };

        try {
            const db = getSqlite();
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            const url = glpiController.getApiUrl(settings.url);
            const commonHeaders = { 'App-Token': settings.app_token?.trim() || '', 'Content-Type': 'application/json' };
            const authHeader = glpiController.getAuthHeader(settings);

            const sessionRes = await axios.get(`${url}/initSession`, { headers: { ...commonHeaders, 'Authorization': authHeader } });
            const sessionToken = sessionRes.data?.session_token;
            
            const tickets = await pgDb.all('SELECT glpi_id FROM glpi.tickets ORDER BY glpi_id');
            observersSyncProgress.total = tickets.length;

            const batchSize = 100;
            let observerCount = 0;

            for (let i = 0; i < tickets.length; i += batchSize) {
                if (observersSyncCancelled) {
                    observersSyncProgress.active = false;
                    return res.status(499).json({ message: 'Annulé' });
                }

                const batch = tickets.slice(i, i + batchSize);
                const results = await Promise.all(batch.map(t => 
                    axios.get(`${url}/Ticket/${t.glpi_id}/Ticket_User?session_token=${sessionToken}`, { headers: commonHeaders }).catch(() => ({ data: [] }))
                ));

                const obsToInsert = [];
                results.forEach((r, idx) => {
                    const ticketId = batch[idx].glpi_id;
                    const observers = (r.data || []).filter(tu => tu.type === 3);
                    observers.forEach(obs => {
                        obsToInsert.push({
                            ticket_id: ticketId,
                            user_id: obs.users_id,
                            name: obs.users_id?.toString() || '',
                            login: obs.users_id?.toString() || '',
                            email: obs.alternative_email || ''
                        });
                    });
                });

                if (obsToInsert.length > 0) {
                    await glpiController.saveObserversToPg(obsToInsert);
                    observerCount += obsToInsert.length;
                }

                observersSyncProgress.processed = Math.min(i + batchSize, tickets.length);
                observersSyncProgress.lastUpdate = new Date().toISOString();
            }

            await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
            observersSyncProgress.active = false;
            res.json({ success: true, count: observerCount });
        } catch (error) {
            observersSyncProgress.active = false;
            res.status(500).json({ message: error.message });
        }
    },

    syncFollowups: async (req, res) => {
        followupsSyncCancelled = false;
        followupsSyncProgress = { active: true, processed: 0, total: 0, startTime: new Date().toISOString(), lastUpdate: new Date().toISOString() };

        try {
            const db = getSqlite();
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            const url = glpiController.getApiUrl(settings.url);
            const commonHeaders = { 'App-Token': settings.app_token?.trim() || '', 'Content-Type': 'application/json' };
            const authHeader = glpiController.getAuthHeader(settings);

            const sessionRes = await axios.get(`${url}/initSession`, { headers: { ...commonHeaders, 'Authorization': authHeader } });
            const sessionToken = sessionRes.data?.session_token;

            const tickets = await pgDb.all('SELECT glpi_id FROM glpi.tickets ORDER BY glpi_id DESC');
            followupsSyncProgress.total = tickets.length;

            const CONCURRENCY = 50;
            for (let i = 0; i < tickets.length; i += CONCURRENCY) {
                if (followupsSyncCancelled) {
                    followupsSyncProgress.active = false;
                    return res.status(499).json({ message: 'Annulé' });
                }

                const batch = tickets.slice(i, i + CONCURRENCY);
                const results = await Promise.allSettled(batch.map(t => 
                    axios.get(`${url}/Ticket/${t.glpi_id}/ITILFollowup?session_token=${sessionToken}`, { headers: commonHeaders, timeout: 5000 })
                ));

                const followupsToInsert = [];
                results.forEach((r, idx) => {
                    if (r.status === 'fulfilled') {
                        const fus = r.value.data || [];
                        fus.forEach(fu => {
                            if (fu.content) {
                                followupsToInsert.push({
                                    ticket_id: batch[idx].glpi_id,
                                    content: fu.content,
                                    author_name: fu.users_id?.name || fu.users_id?.toString() || '',
                                    author_email: fu.users_id?.email || '',
                                    is_private: fu.is_private || 0,
                                    date_creation: fu.date || null
                                });
                            }
                        });
                    }
                });

                if (followupsToInsert.length > 0) {
                    await glpiController.saveFollowupsToPg(followupsToInsert);
                }

                followupsSyncProgress.processed = Math.min(i + CONCURRENCY, tickets.length);
                followupsSyncProgress.lastUpdate = new Date().toISOString();
            }

            await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
            followupsSyncProgress.active = false;
            res.json({ success: true });
        } catch (error) {
            followupsSyncProgress.active = false;
            res.status(500).json({ message: error.message });
        }
    },

    // Helpers & Background Logic
    runBackgroundSyncRecent: async (triggeredBy) => {
        let syncLogId = null;
        try {
            const db = getSqlite();
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            if (!settings || !settings.url) return 0;

            const url = glpiController.getApiUrl(settings.url);
            const commonHeaders = { 'App-Token': settings.app_token?.trim() || '', 'Content-Type': 'application/json' };
            const authHeader = glpiController.getAuthHeader(settings);

            const sessionRes = await axios.get(`${url}/initSession`, { headers: { ...commonHeaders, 'Authorization': authHeader } });
            const sessionToken = sessionRes.data?.session_token;
            if (!sessionToken) return 0;

            await axios.get(`${url}/getMyProfiles?session_token=${sessionToken}`, { headers: commonHeaders });
            await axios.get(`${url}/getFullSession?session_token=${sessionToken}`, { headers: commonHeaders });

            const countRes = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&range=0-1&get_all_entities=1`, { headers: commonHeaders });
            const totalAvailable = parseInt(countRes.data.totalcount, 10) || 0;
            const startOffset = Math.max(0, totalAvailable - 50);

            const logRes = await pool.query(
                `INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, total_tickets) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                ['tickets', 'recent', triggeredBy, 'running', 50]
            );
            syncLogId = logRes.rows[0]?.id;

            const forcedFields = [1, 2, 3, 10, 11, 7, 12, 14, 15, 16, 17, 19, 83, 24, 9, 80, 4, 34, 22, 62];
            const forcedStr = forcedFields.map(id => `forcedisplay[${id}]=${id}`).join('&');
            const ticketsRes = await axios.get(`${url}/search/Ticket?session_token=${sessionToken}&range=${startOffset}-${totalAvailable - 1}&get_all_entities=1&${forcedStr}`, { headers: commonHeaders });

            let count = 0;
            if (ticketsRes.data && Array.isArray(ticketsRes.data.data)) {
                await glpiController.saveTicketsToPg(ticketsRes.data.data);
                count = ticketsRes.data.data.length;
            }

            if (syncLogId) {
                await pool.query(`UPDATE glpi.sync_logs SET status = 'completed', processed_tickets = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2`, [count, syncLogId]);
            }

            await axios.get(`${url}/killSession?session_token=${sessionToken}`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
            return count;
        } catch (error) {
            if (syncLogId) {
                await pool.query(`UPDATE glpi.sync_logs SET status = 'error', error_message = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2`, [error.message, syncLogId]);
            }
            throw error;
        }
    },

    saveTicketsToPg: async (tickets) => {
        if (tickets.length === 0) return;

        const val = (t, id) => {
            const v = t[id];
            if (v === undefined || v === null) return '';
            if (typeof v === 'object' && v !== null) return v.name || v.id || JSON.stringify(v);
            return String(v);
        };

        const valInt = (t, id) => {
            const v = t[id];
            if (v === undefined || v === null) return 0;
            if (typeof v === 'object' && v !== null) {
                return Number(v.id) || Number(v.name) || 0;
            }
            const num = parseInt(String(v), 10);
            return isNaN(num) ? 0 : num;
        };

        const normEmail = (email) => {
            if (!email) return '';
            email = email.trim().toLowerCase();
            if (!email.includes('@')) email += '@ivry94.fr';
            return email;
        };

        const cols = 'glpi_id, title, content, status, priority, urgency, impact, category, type, date_creation, date_mod, date_closed, date_solved, location, solution, source, entity, requester_name, email_alt, requester_email_22';
        
        const BATCH_LIMIT = 50; // To stay within PostgreSQL param limit (20 * 50 = 1000)
        for (let i = 0; i < tickets.length; i += BATCH_LIMIT) {
            const batch = tickets.slice(i, i + BATCH_LIMIT);
            const valuesSql = batch.map((_, idx) => {
                const base = idx * 20;
                return `($${base+1}, $${base+2}, $${base+3}, $${base+4}, $${base+5}, $${base+6}, $${base+7}, $${base+8}, $${base+9}, $${base+10}, $${base+11}, $${base+12}, $${base+13}, $${base+14}, $${base+15}, $${base+16}, $${base+17}, $${base+18}, $${base+19}, $${base+20})`;
            }).join(', ');

            const params = batch.flatMap(t => [
                valInt(t, 2), val(t, 1), val(t, 62) || '', valInt(t, 12), valInt(t, 3), valInt(t, 10), valInt(t, 11),
                val(t, 7), val(t, 14), val(t, 15), val(t, 19) || val(t, 15), val(t, 16) || null, val(t, 17) || null,
                val(t, 83), val(t, 24), val(t, 9), val(t, 80), val(t, 4) || 'Inconnu', normEmail(val(t, 34)), normEmail(val(t, 22))
            ]);

            await pool.query(`INSERT INTO glpi.tickets (${cols}) VALUES ${valuesSql} ON CONFLICT (glpi_id) DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, status = EXCLUDED.status, priority = EXCLUDED.priority, urgency = EXCLUDED.urgency, impact = EXCLUDED.impact, category = EXCLUDED.category, type = EXCLUDED.type, date_creation = EXCLUDED.date_creation, date_mod = EXCLUDED.date_mod, date_closed = EXCLUDED.date_closed, date_solved = EXCLUDED.date_solved, location = EXCLUDED.location, solution = EXCLUDED.solution, source = EXCLUDED.source, entity = EXCLUDED.entity, requester_name = EXCLUDED.requester_name, email_alt = EXCLUDED.email_alt, requester_email_22 = EXCLUDED.requester_email_22, last_sync = CURRENT_TIMESTAMP`, params);
        }
    },

    saveObserversToPg: async (obs) => {
        const pgBatchSize = 100;
        for (let i = 0; i < obs.length; i += pgBatchSize) {
            const batch = obs.slice(i, i + pgBatchSize);
            const values = batch.map((_, idx) => {
                const base = idx * 5;
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, CURRENT_TIMESTAMP)`;
            }).join(', ');
            const params = batch.flatMap(o => [o.ticket_id, o.user_id, o.name, o.login, o.email]);
            await pool.query(`INSERT INTO glpi.observers (ticket_id, user_id, name, login, email, last_sync) VALUES ${values} ON CONFLICT (ticket_id, user_id) DO UPDATE SET name = EXCLUDED.name, login = EXCLUDED.login, email = EXCLUDED.email, last_sync = EXCLUDED.last_sync`, params);
        }
    },

    saveFollowupsToPg: async (fus) => {
        const pgBatchSize = 100;
        for (let i = 0; i < fus.length; i += pgBatchSize) {
            const batch = fus.slice(i, i + pgBatchSize);
            const values = batch.map((_, idx) => {
                const base = idx * 6;
                return `($${base + 1}, $${base + 2}, md5($${base + 2}), $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, CURRENT_TIMESTAMP)`;
            }).join(', ');
            const params = batch.flatMap(f => [f.ticket_id, f.content, f.author_name, f.author_email, f.is_private, f.date_creation]);
            await pool.query(`INSERT INTO glpi.ticket_followups (ticket_id, content, content_hash, author_name, author_email, is_private, date_creation, last_sync) VALUES ${values} ON CONFLICT (ticket_id, content_hash, date_creation) DO NOTHING`, params);
        }
    },

    getApiUrl: (rawUrl) => {
        let url = rawUrl.trim();
        if (!url.includes('apirest.php')) {
            url = url.endsWith('/') ? `${url}apirest.php` : `${url}/apirest.php`;
        }
        return url;
    },

    getAuthHeader: (settings) => {
        return (settings.login && settings.password)
            ? `Basic ${Buffer.from(`${settings.login.trim()}:${settings.password.trim()}`).toString('base64')}`
            : `user_token ${settings.user_token?.trim()}`;
    },

    // Changelog & Sync Logs
    getSyncLogs: async (req, res) => {
        try {
            const { type, status, date_from, date_to } = req.query;
            let sql = 'SELECT * FROM glpi.sync_logs WHERE 1=1';
            const params = [];
            let idx = 1;
            if (type) { sql += ` AND sync_type = $${idx++}`; params.push(type); }
            if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
            if (date_from) { sql += ` AND started_at >= $${idx++}`; params.push(date_from); }
            if (date_to) { sql += ` AND started_at <= $${idx++}`; params.push(date_to + ' 23:59:59'); }
            sql += ' ORDER BY started_at DESC LIMIT 500';
            const logs = await pgDb.all(sql, params);
            res.json(logs);
        } catch (error) {
            console.error('[GLPI] Erreur logs:', error.message);
            res.status(500).json({ message: `Erreur: ${error.message}` });
        }
    },

    getMyProfile: async (req, res) => {
        try {
            const db = getSqlite();
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            if (!settings || !settings.url) return res.status(400).json({ message: 'Non configuré' });

            const url = glpiController.getApiUrl(settings.url);
            const commonHeaders = { 'App-Token': settings.app_token?.trim() || '', 'Content-Type': 'application/json', 'Accept': 'application/json' };
            const userToken = settings.user_token?.trim();

            const sessionRes = await axios.get(`${url}/initSession`, {
                headers: { ...commonHeaders, 'Authorization': `user_token ${userToken}` },
                timeout: 10000
            });

            const sessionToken = sessionRes.data?.session_token;
            if (!sessionToken) return res.status(401).json({ message: 'Echec initialisation session GLPI' });

            const profileRes = await axios.get(`${url}/getMyProfiles`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });
            await axios.get(`${url}/killSession`, { headers: { ...commonHeaders, 'Session-Token': sessionToken } });

            res.json({ profiles: profileRes.data });
        } catch (e) {
            const msg = e.response?.data?.[1] || e.response?.data?.message || e.message;
            res.status(500).json({ message: `Erreur Get Profiles : ${msg}` });
        }
    },

    // Scheduled Syncs Management
    getSyncStatusGlobal: (req, res) => {
        res.json({
            running: currentRunningSync,
            queue: syncQueue,
            queueLength: syncQueue.length
        });
    },

    getScheduledSyncs: async (req, res) => {
        try {
            const syncs = await pool.query('SELECT * FROM glpi.scheduled_syncs ORDER BY id');
            res.json(syncs.rows);
        } catch (error) {
            console.error('Erreur lecture scheduled syncs:', error);
            res.status(500).json({ message: 'Erreur lecture' });
        }
    },

    createScheduledSync: async (req, res) => {
        try {
            const { sync_type, sync_mode, frequency_type, frequency_value, execution_time, is_enabled } = req.body;

            if (!sync_type || !sync_mode || !frequency_type || !frequency_value) {
                return res.status(400).json({ message: 'Données incomplètes' });
            }

            const validTypes = ['tickets', 'observers', 'followups'];
            const validModes = {
                'tickets': ['recent', 'full'],
                'observers': ['recent', 'full'],
                'followups': ['recent', 'full']
            };
            const validFreq = ['minutes', 'hours', 'days'];
            const execTime = execution_time || '00:00';

            if (!validTypes.includes(sync_type)) return res.status(400).json({ message: 'Type invalide' });
            if (!validModes[sync_type]?.includes(sync_mode)) return res.status(400).json({ message: 'Mode invalide pour ce type' });
            if (!validFreq.includes(frequency_type)) return res.status(400).json({ message: 'Fréquence invalide' });

            const nextRun = new Date();
            switch (frequency_type) {
                case 'minutes': nextRun.setMinutes(nextRun.getMinutes() + frequency_value); break;
                case 'hours': nextRun.setHours(nextRun.getHours() + frequency_value); break;
                case 'days': {
                    nextRun.setDate(nextRun.getDate() + frequency_value);
                    const [targetHour, targetMin] = execTime.split(':').map(Number);
                    nextRun.setHours(targetHour, targetMin, 0, 0);
                    break;
                }
            }

            const result = await pool.query(
                `INSERT INTO glpi.scheduled_syncs (sync_type, sync_mode, frequency_type, frequency_value, execution_time, is_enabled, next_run)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [sync_type, sync_mode, frequency_type, frequency_value, execTime, is_enabled !== false ? 1 : 0, nextRun]
            );

            res.json(result.rows[0]);
        } catch (error) {
            console.error('Erreur création scheduled sync:', error);
            res.status(500).json({ message: 'Erreur création' });
        }
    },

    updateScheduledSync: async (req, res) => {
        try {
            const { id } = req.params;
            const { frequency_type, frequency_value, execution_time, is_enabled } = req.body;

            let nextRun = null;
            const execTime = execution_time || '00:00';
            if (frequency_type && frequency_value) {
                nextRun = new Date();
                switch (frequency_type) {
                    case 'minutes': nextRun.setMinutes(nextRun.getMinutes() + frequency_value); break;
                    case 'hours': nextRun.setHours(nextRun.getHours() + frequency_value); break;
                    case 'days': {
                        nextRun.setDate(nextRun.getDate() + frequency_value);
                        const [targetHour, targetMin] = execTime.split(':').map(Number);
                        nextRun.setHours(targetHour, targetMin, 0, 0);
                        break;
                    }
                }
            }

            const updates = [];
            const values = [];
            let paramIndex = 1;

            if (frequency_type) { updates.push(`frequency_type = $${paramIndex++}`); values.push(frequency_type); }
            if (frequency_value) { updates.push(`frequency_value = $${paramIndex++}`); values.push(frequency_value); }
            if (execution_time) { updates.push(`execution_time = $${paramIndex++}`); values.push(execution_time); }
            if (is_enabled !== undefined) { updates.push(`is_enabled = $${paramIndex++}`); values.push(is_enabled ? 1 : 0); }
            if (nextRun) { updates.push(`next_run = $${paramIndex++}`); values.push(nextRun); }

            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(id);
            const result = await pool.query(
                `UPDATE glpi.scheduled_syncs SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
                values
            );

            if (result.rows.length === 0) return res.status(404).json({ message: 'Sync non trouvé' });
            res.json(result.rows[0]);
        } catch (error) {
            console.error('Erreur mise à jour scheduled sync:', error);
            res.status(500).json({ message: 'Erreur mise à jour' });
        }
    },

    deleteScheduledSync: async (req, res) => {
        try {
            const { id } = req.params;
            await pool.query('DELETE FROM glpi.scheduled_syncs WHERE id = $1', [id]);
            res.json({ message: 'Supprimé avec succès' });
        } catch (error) {
            console.error('Erreur suppression scheduled sync:', error);
            res.status(500).json({ message: 'Erreur suppression' });
        }
    },

    runScheduledSyncManually: async (req, res) => {
        try {
            const { id } = req.params;
            const sync = await pool.query('SELECT * FROM glpi.scheduled_syncs WHERE id = $1', [id]);
            if (sync.rows.length === 0) return res.status(404).json({ message: 'Sync non trouvé' });

            glpiController.executeScheduledSync(sync.rows[0]);
            res.json({ message: 'Sync lancé manuellement' });
        } catch (error) {
            console.error('Erreur exécution scheduled sync:', error);
            res.status(500).json({ message: 'Erreur exécution' });
        }
    },

    processScheduledSyncs: async () => {
        console.log(`[SCHEDULED SYNC] Cron déclenché à ${new Date().toISOString()}`);
        try {
            const now = new Date();
            const dueSyncs = await pool.query(
                `SELECT * FROM glpi.scheduled_syncs WHERE is_enabled = 1 AND (next_run IS NULL OR next_run <= $1)`,
                [now.toISOString()]
            );

            console.log(`[SCHEDULED SYNC] Vérification: ${dueSyncs.rows.length} syncs dus`);

            for (const sync of dueSyncs.rows) {
                const syncKey = `${sync.sync_type}-${sync.sync_mode}`;
                if (currentRunningSync && `${currentRunningSync.sync_type}-${currentRunningSync.sync_mode}` === syncKey) {
                    console.log(`[SCHEDULED SYNC] Déja en cours: ${syncKey}. Ignoré.`);
                    continue;
                }

                glpiController.executeScheduledSync(sync);

                const nextRun = new Date(now);
                const execTime = sync.execution_time || '00:00';
                const [targetHour, targetMin] = execTime.split(':').map(Number);

                switch (sync.frequency_type) {
                    case 'minutes': nextRun.setMinutes(nextRun.getMinutes() + sync.frequency_value); break;
                    case 'hours': nextRun.setHours(nextRun.getHours() + sync.frequency_value); break;
                    case 'days':
                        nextRun.setDate(nextRun.getDate() + sync.frequency_value);
                        nextRun.setHours(targetHour, targetMin, 0, 0);
                        break;
                }

                await pool.query(
                    `UPDATE glpi.scheduled_syncs SET last_run = $1, next_run = $2 WHERE id = $3`,
                    [now, nextRun, sync.id]
                );
            }
        } catch (error) {
            console.error(`[SCHEDULED SYNC] Erreur: ${error.message}`);
        }
    },

    executeScheduledSync: async (scheduledSync) => {
        const { sync_type, sync_mode } = scheduledSync;
        console.log(`[SCHEDULED SYNC] Exécution: ${sync_type} - ${sync_mode}`);

        try {
            const syncRoutes = {
                'tickets': { 'recent': '/api/glpi/sync-recent', 'full': '/api/glpi/sync-all-tickets' },
                'observers': { 'recent': '/api/glpi/sync-observers-recent', 'full': '/api/glpi/sync-observers' },
                'followups': { 'recent': '/api/glpi/sync-followups-recent', 'full': '/api/glpi/sync-followups' }
            };

            const route = syncRoutes[sync_type]?.[sync_mode];
            if (!route) return console.error(`[SCHEDULED SYNC] Route non trouvée: ${sync_type} - ${sync_mode}`);

            const db = getSqlite();
            const settings = await db.get('SELECT * FROM glpi_settings WHERE id = 1');
            if (!settings || !settings.url) {
                console.error('[SCHEDULED SYNC] GLPI non configuré');
                await pool.query(
                    `INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, error_message) VALUES ($1, $2, $3, $4, $5)`,
                    [sync_type, sync_mode, 'scheduled-cron', 'error', 'GLPI non configuré']
                );
                return;
            }

            const internalToken = Buffer.from('scheduled-sync:internal').toString('base64');
            currentRunningSync = { sync_type, sync_mode, started_at: new Date().toISOString() };

            const response = await axios.post(`http://localhost:${process.env.PORT || 3001}${route}`, {}, {
                headers: { 'Authorization': `Internal ${internalToken}`, 'Content-Type': 'application/json' },
                timeout: 300000
            });

            currentRunningSync = null;
            console.log(`[SCHEDULED SYNC] Terminé: ${sync_type} - ${sync_mode} (HTTP ${response?.status})`);
        } catch (error) {
            currentRunningSync = null;
            const errorMsg = error.response ? `HTTP ${error.response.status}: ${error.response.statusText}` : error.message;
            console.error(`[SCHEDULED SYNC] Erreur: ${errorMsg}`);
            await pool.query(
                `INSERT INTO glpi.sync_logs (sync_type, sync_mode, triggered_by, status, error_message) VALUES ($1, $2, $3, $4, $5)`,
                [sync_type, sync_mode, 'scheduled-cron', 'error', errorMsg]
            ).catch(e => console.error('[SCHEDULED SYNC] Erreur log:', e.message));
        }
    }

};

module.exports = glpiController;
