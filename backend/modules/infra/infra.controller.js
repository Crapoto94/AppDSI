/**
 * Module Infra — gestion des définitions d'API externes (hub.infra_apis)
 * et déclenchement des synchronisations associées.
 */
const { pgDb, pool } = require('../../shared/database');
const { syncReseauLinks, fetchLinks } = require('./reseau-sync');
const { fetchAgentPresence, matchAgent } = require('./agent-presence');
const studioOnboarding = require('./studio-onboarding');
const xlsx = require('xlsx');

function maskKey(k) {
    if (!k) return null;
    const s = String(k);
    if (s.length <= 4) return '••••';
    return '••••••••' + s.slice(-4);
}

function publicApi(row) {
    return { ...row, api_key: maskKey(row.api_key), api_key_set: !!row.api_key };
}

module.exports = {
    // GET /api/infra/apis
    listApis: async (req, res) => {
        try {
            const rows = await pgDb.all('SELECT * FROM hub.infra_apis ORDER BY key');
            res.json(rows.map(publicApi));
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // PUT /api/infra/apis/:key
    updateApi: async (req, res) => {
        try {
            const { key } = req.params;
            const existing = await pgDb.get('SELECT * FROM hub.infra_apis WHERE key = ?', [key]);
            if (!existing) return res.status(404).json({ message: 'API inconnue' });

            const f = req.body || {};
            // api_key : ne pas écraser si non fourni / vide (la valeur affichée est masquée)
            const newKey = (f.api_key !== undefined && f.api_key !== '' && !/^•/.test(f.api_key)) ? f.api_key : existing.api_key;

            const { rows } = await pool.query(
                `UPDATE hub.infra_apis SET
                   label=COALESCE($1,label), base_url=COALESCE($2,base_url), endpoint=COALESCE($3,endpoint),
                   api_key=$4, header_name=COALESCE($5,header_name), enabled=COALESCE($6,enabled), updated_at=NOW()
                 WHERE key=$7 RETURNING *`,
                [f.label, f.base_url, f.endpoint, newKey, f.header_name,
                 f.enabled !== undefined ? !!f.enabled : null, key]
            );
            res.json(publicApi(rows[0]));
        } catch (e) { res.status(500).json({ message: e.message }); }
    },

    // POST /api/infra/apis/:key/test
    testApi: async (req, res) => {
        try {
            const { key } = req.params;
            const cfg = await pgDb.get('SELECT * FROM hub.infra_apis WHERE key = ?', [key]);
            if (!cfg) return res.status(404).json({ message: 'API inconnue' });

            if (key === 'rh_studio_presence') {
                const result = await fetchAgentPresence(cfg, { q: 'test' });
                return res.json({ ok: true, count: result.found ? 1 : 0, sample: [result] });
            }

            const data = await fetchLinks(cfg);
            res.json({ ok: true, count: data.length, sample: data.slice(0, 3) });
        } catch (e) {
            res.status(502).json({ ok: false, message: e.message });
        }
    },

    // POST /api/infra/sync/reseau
    syncReseau: async (req, res) => {
        try {
            const result = await syncReseauLinks('manual');
            res.json({ ok: true, ...result });
        } catch (e) {
            res.status(502).json({ ok: false, message: e.message });
        }
    },

    // GET /api/infra/agents/presence
    agentPresence: async (req, res) => {
        try {
            const { email, q, nom, prenom } = req.query;
            if (!email && !q && !nom && !prenom) {
                return res.status(400).json({ message: 'Fournir email, q, ou nom/prenom' });
            }
            const cfg = await pgDb.get('SELECT * FROM hub.infra_apis WHERE key = ?', ['rh_studio_presence']);
            if (!cfg) return res.status(404).json({ message: "Configuration 'rh_studio_presence' introuvable" });
            if (cfg.enabled === false) return res.status(503).json({ message: "L'API RH Studio est désactivée" });

            const result = await fetchAgentPresence(cfg, { email, q, nom, prenom });
            res.json(result);
        } catch (e) {
            res.status(502).json({ message: e.message });
        }
    },

    // POST /api/infra/agents/presence/parse-excel
    // Lit un fichier Excel uploadé et renvoie ses en-têtes + toutes ses lignes
    // (sans logique métier), pour que le frontend propose un mapping colonne -> champ.
    parseAgentsExcel: async (req, res) => {
        if (!req.file) return res.status(400).json({ message: 'Aucun fichier fourni' });
        try {
            const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            if (!sheet) return res.status(400).json({ message: 'Le fichier ne contient aucune feuille exploitable' });

            const headerRow = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' })[0] || [];
            const headers = headerRow.map((h) => String(h).trim()).filter((h) => h.length > 0);
            const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

            if (rows.length > 2000) {
                return res.status(400).json({ message: `Fichier trop volumineux (${rows.length} lignes, 2000 maximum)` });
            }

            res.json({ headers, rows, count: rows.length });
        } catch (e) {
            res.status(400).json({ message: 'Erreur lors de la lecture du fichier Excel', error: e.message });
        }
    },

    // POST /api/infra/agents/presence/batch
    // { agents: [{ nom, prenom, email }, ...] } -> recherche RH Studio en lot
    // (email d'abord, repli sur le nom avec tolerance aux fautes de frappe).
    verifyAgentsBatch: async (req, res) => {
        try {
            const { agents } = req.body || {};
            if (!Array.isArray(agents) || agents.length === 0) {
                return res.status(400).json({ message: 'Fournir un tableau "agents" non vide' });
            }
            if (agents.length > 500) {
                return res.status(400).json({ message: `Trop de lignes (${agents.length}, 500 maximum par lot)` });
            }

            const cfg = await pgDb.get('SELECT * FROM hub.infra_apis WHERE key = ?', ['rh_studio_presence']);
            if (!cfg) return res.status(404).json({ message: "Configuration 'rh_studio_presence' introuvable" });
            if (cfg.enabled === false) return res.status(503).json({ message: "L'API RH Studio est désactivée" });

            const CONCURRENCY = 5;
            const results = new Array(agents.length);
            let cursor = 0;
            async function worker() {
                while (cursor < agents.length) {
                    const i = cursor++;
                    try {
                        results[i] = await matchAgent(cfg, agents[i] || {});
                    } catch (e) {
                        results[i] = { input: agents[i], matchedBy: null, similarity: null, found: false, agent: null, error: e.message };
                    }
                }
            }
            await Promise.all(Array.from({ length: Math.min(CONCURRENCY, agents.length) }, worker));

            res.json({ results });
        } catch (e) {
            res.status(502).json({ message: e.message });
        }
    },

    // ── Onboarding RH Studio (formulaire de demande "Arrivée d'agent") ────────

    // POST /api/infra/rh-studio/onboarding
    // { agent_id?, nom_temp?, prenom_temp?, manager_id, date_arrivee_prevue?, dsihub_ticket_id? }
    createOnboarding: async (req, res) => {
        try {
            const result = await studioOnboarding.createOnboarding(req.body || {});
            res.status(201).json(result);
        } catch (e) {
            res.status(502).json({ message: e.message });
        }
    },

    // GET /api/infra/rh-studio/futurs-agents
    listFutursAgents: async (req, res) => {
        try {
            const result = await studioOnboarding.listFutursAgents();
            res.json(Array.isArray(result) ? result : []);
        } catch (e) {
            res.status(502).json({ message: e.message });
        }
    },

    // GET /api/infra/rh-studio/agents/search?q=...
    // Renvoie un tableau brut (pas {data:[...]}) façonné comme le retour de
    // useADSearch (username/displayName/email/service) pour pouvoir réutiliser
    // ce hook côté frontend malgré la source différente (RH Studio, pas l'AD)
    // — l'id numérique RefAgent (nécessaire pour agent_id/manager_id) est
    // transporté dans `username` (converti en nombre côté composant).
    searchStudioAgents: async (req, res) => {
        try {
            const { q } = req.query;
            if (!q || String(q).trim().length < 2) return res.json([]);
            const result = await studioOnboarding.searchAgents(q);
            const agents = Array.isArray(result?.data) ? result.data : [];
            res.json(agents.map((a) => ({
                username: String(a.id),
                displayName: `${a.prenom || ''} ${a.nom || ''}`.trim(),
                email: a.email || '',
                service: a.service || '',
                matricule: a.matricule || '',
            })));
        } catch (e) {
            res.status(502).json({ message: e.message });
        }
    },
};
