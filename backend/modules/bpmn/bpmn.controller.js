const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { getSqlite, pgDb, pool } = require('../../shared/database');
const { isAdminLike } = require('../../shared/middleware');
const apmAi = require('../../shared/apm_ai');

const MAX_XML_CHARS = 60000;
const MAX_APPS = 300;

const SYSTEM_PROMPT = `Tu es un expert en modélisation de processus BPMN 2.0 pour une DSI de collectivité. Tu construis ou modifies un diagramme BPMN à partir de la demande de l'utilisateur.

RÈGLES DE SORTIE (strictes) :
- Réponds avec UNE courte phrase en français décrivant ce que tu as fait, puis le diagramme COMPLET dans un unique bloc \`\`\`xml.
- Le XML est un document BPMN 2.0 valide (<bpmn:definitions>) avec les préfixes bpmn: et les espaces de noms xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" et xmlns:dsi="http://dsi.ivry/schema/bpmn".
- Ne génère PAS la partie graphique (bpmndi:BPMNDiagram, coordonnées) : le positionnement est calculé automatiquement ensuite. Fournis uniquement <bpmn:process> (et <bpmn:collaboration>/<bpmn:participant> si tu utilises des couloirs).
- N'écris PAS <bpmn:incoming> ni <bpmn:outgoing> et PAS de <bpmn:documentation> : ils sont recalculés/conservés automatiquement (réponse plus courte).
- Chaque élément a un id unique (lettres, chiffres, underscore, commençant par une lettre) et un name en français. Chaque flux (bpmn:sequenceFlow) a un id, un sourceRef et un targetRef qui désignent des éléments EXISTANTS du process.
- Si le diagramme comporte des couloirs (<bpmn:laneSet>), conserve-les et déclare chaque élément dans le couloir adapté via <bpmn:flowNodeRef>.
- Utilise des éléments adaptés : startEvent, endEvent, userTask, serviceTask, manualTask, exclusiveGateway (conditions nommées sur les flux sortants), parallelGateway, subProcess, etc.
- Si un diagramme existant t'est fourni, modifie-le STRICTEMENT selon la demande : conserve tous les éléments, ids, noms, flux, couloirs et attributs dsi: qui ne sont pas concernés, puis renvoie le diagramme COMPLET modifié (jamais un extrait, jamais « le reste est inchangé »). Quand tu insères une étape entre deux autres, remplace le flux existant par deux flux (ou redirige sourceRef/targetRef) pour que le processus reste connecté de bout en bout.`;

const APP_RULE = `APPLICATIONS (actifs logiciels) : une application n'est pas une étape mais un ACTIF utilisé par une tâche. Quand une tâche s'exécute dans l'une des applications de la liste ci-dessous, déclare l'actif dans le même process : <bpmn:dataStoreReference id="App_X" name="<nom exact de l'application>" dsi:applicationId="<id de la liste>" /> et relie-le à la tâche par une <bpmn:dataOutputAssociation id="DA_X"><bpmn:targetRef>App_X</bpmn:targetRef></bpmn:dataOutputAssociation> placée DANS la tâche. Plusieurs tâches peuvent référencer le même actif. N'invente jamais d'application ni d'id qui ne figure pas dans la liste.`;

async function loadConfig() {
    const sqlite = getSqlite();
    const cfg = {};
    const keys = ['bpmn_ai_source', 'bpmn_ai_apm_model', 'ai_provider', 'groq_api_key', 'openrouter_api_key', 'anthropic_api_key', 'ollama_host', 'anthropic_model', 'default_model'];
    for (const k of keys) {
        const row = await sqlite.get('SELECT setting_value FROM app_settings WHERE setting_key = ?', [k]);
        cfg[k] = row && row.setting_value != null ? String(row.setting_value) : '';
    }
    return cfg;
}

/** Même logique que le fournisseur local des contrats/transcripts (ai_provider de /admin). */
async function callLocalAi(prompt, cfg) {
    const provider = cfg.ai_provider || 'groq';
    if (provider === 'anthropic' && cfg.anthropic_api_key) {
        const resp = await axios.post('https://api.anthropic.com/v1/messages',
            { model: cfg.anthropic_model || 'claude-3-5-sonnet-20240620', max_tokens: 16000, messages: [{ role: 'user', content: prompt }] },
            { headers: { 'x-api-key': cfg.anthropic_api_key, 'anthropic-version': '2023-06-01' }, timeout: 180000 });
        return resp.data?.content?.[0]?.text || '';
    }
    if (provider === 'ollama' && cfg.ollama_host) {
        const host = cfg.ollama_host.replace(/\/+$/, '');
        const resp = await axios.post(`${host}/api/generate`, { model: cfg.default_model || 'llama3', prompt, stream: false }, { timeout: 180000 });
        return resp.data?.response || '';
    }
    const apiKey = provider === 'openrouter' ? cfg.openrouter_api_key : cfg.groq_api_key;
    if (!apiKey) throw new Error(`Clé API manquante pour ${provider} (IA locale — à configurer dans /admin, section IA)`);
    const baseURL = provider === 'openrouter' ? 'https://openrouter.ai/api/v1' : 'https://api.groq.com/openai/v1';
    const model = cfg.default_model || (provider === 'openrouter' ? 'google/gemini-2.0-flash-001' : 'llama-3.3-70b-versatile');
    const resp = await axios.post(`${baseURL}/chat/completions`,
        { model, messages: [{ role: 'user', content: prompt }], stream: false },
        { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 180000 });
    return resp.data?.choices?.[0]?.message?.content || '';
}

/** Extrait le bloc XML (```xml ... ``` ou <definitions>...</definitions>) et le texte explicatif. */
function parseAiAnswer(raw) {
    const text = String(raw || '');
    let xml = null;
    const fence = text.match(/```(?:xml|bpmn)?\s*([\s\S]*?)```/i);
    if (fence && /definitions/.test(fence[1])) xml = fence[1].trim();
    if (!xml) {
        const m = text.match(/<(?:\w+:)?definitions[\s\S]*<\/(?:\w+:)?definitions>/);
        if (m) xml = m[0].trim();
    }
    const message = text.replace(/```[\s\S]*?```/g, '').replace(/<(?:\w+:)?definitions[\s\S]*<\/(?:\w+:)?definitions>/, '').trim();
    return { xml, message };
}

/**
 * Version allégée du diagramme envoyée à l'IA : sans partie graphique, sans documentation ni
 * incoming/outgoing (redondants avec les flux, recalculés ensuite). Évite de tronquer le
 * contexte et de dépasser la taille de réponse utile.
 */
function compactXml(xml) {
    return String(xml)
        .replace(/<bpmndi:BPMNDiagram[\s\S]*?<\/bpmndi:BPMNDiagram>/g, '')
        .replace(/<bpmn:documentation[\s\S]*?<\/bpmn:documentation>/g, '')
        .replace(/\s*<bpmn:(?:incoming|outgoing)>[^<]*<\/bpmn:(?:incoming|outgoing)>/g, '')
        .replace(/\n\s*\n/g, '\n')
        .trim();
}

const generate = async (req, res) => {
    try {
        const { prompt, xml, history, model } = req.body || {};
        if (!prompt || !String(prompt).trim()) return res.status(400).json({ message: 'Demande vide' });

        // Applications du Magasin d'applications, fournies à l'IA pour qu'elle puisse les référencer
        let apps = [];
        try {
            apps = await pgDb.all('SELECT id, name FROM magapp.apps ORDER BY name ASC');
        } catch (e) {
            console.warn('[BPMN] lecture des applications magapp impossible :', e.message);
        }
        const appList = apps.slice(0, MAX_APPS).map(a => `- ${a.id} : ${a.name}`).join('\n');

        // Le diagramme courant est envoyé sans sa partie graphique (inutile pour l'IA, coûteuse en tokens)
        let currentXml = '';
        if (xml && String(xml).trim()) {
            currentXml = compactXml(xml);
            if (currentXml.length > MAX_XML_CHARS) {
                return res.status(413).json({ message: `Diagramme trop volumineux pour l'assistant IA (${currentXml.length} caractères, ${MAX_XML_CHARS} max). Simplifiez-le ou découpez-le en plusieurs diagrammes.` });
            }
        }

        const past = Array.isArray(history) ? history.slice(-6) : [];
        const historyText = past
            .map(h => `${h.role === 'assistant' ? 'Assistant' : 'Utilisateur'} : ${String(h.content || '').slice(0, 1500)}`)
            .join('\n');

        const fullPrompt = [
            SYSTEM_PROMPT,
            apps.length ? `${APP_RULE}\n\nListe des applications (id : nom) :\n${appList}` : '',
            currentXml ? `DIAGRAMME ACTUEL :\n\`\`\`xml\n${currentXml}\n\`\`\`` : 'Aucun diagramme existant : crée-le depuis zéro.',
            historyText ? `ÉCHANGES PRÉCÉDENTS :\n${historyText}` : '',
            `DEMANDE DE L'UTILISATEUR :\n${String(prompt).slice(0, 4000)}`,
        ].filter(Boolean).join('\n\n');

        const cfg = await loadConfig();
        const useLocal = cfg.bpmn_ai_source === 'local';
        const apmModel = (typeof model === 'string' && model.trim()) || cfg.bpmn_ai_apm_model || undefined;

        let raw;
        if (useLocal) {
            raw = await callLocalAi(fullPrompt, cfg);
        } else {
            try {
                raw = await apmAi.queryApmWithProgress(fullPrompt, apmModel);
            } catch (apmError) {
                // Repli sur l'IA locale si l'API Ville est indisponible
                console.warn('[BPMN] API IA Ville en échec, repli sur IA locale :', apmError.message);
                try {
                    raw = await callLocalAi(fullPrompt, cfg);
                } catch (localError) {
                    throw new Error(`API Ville : ${apmError.message} — IA locale : ${localError.message}`);
                }
            }
        }

        const parsed = parseAiAnswer(raw);
        if (!parsed.xml) {
            const truncated = /<(?:\w+:)?definitions/.test(String(raw || ''));
            return res.status(422).json({
                message: truncated
                    ? "La réponse de l'IA est incomplète (diagramme trop long, coupé en cours de route). Demandez une modification plus ciblée ou simplifiez le diagramme."
                    : "L'IA n'a pas renvoyé de diagramme BPMN exploitable. Reformulez votre demande.",
                answer: String(raw || '').slice(0, 2000),
            });
        }
        res.json({ xml: parsed.xml, message: parsed.message || 'Diagramme mis à jour.' });
    } catch (error) {
        console.error('[BPMN] Erreur génération IA :', error.message);
        res.status(500).json({ message: error.message || 'Erreur lors de la génération IA' });
    }
};

// ─── Bibliothèque de diagrammes (hub.bpmn_diagrams) ──────────────────────────

const LIST_COLUMNS = 'id, title, description, assets, tags, created_by, created_at, updated_by, updated_at';

/**
 * Actifs concernés par un diagramme, recalculés depuis le XML (jamais fournis par le client) :
 * chaque élément portant dsi:applicationId référence une application du Magasin d'applications.
 */
async function extractAssets(xml) {
    const ids = [...new Set([...String(xml || '').matchAll(/dsi:applicationId="(\d+)"/g)].map((m) => Number(m[1])))];
    if (ids.length === 0) return [];
    const { rows } = await pool.query('SELECT id, name FROM magapp.apps WHERE id = ANY($1::int[]) ORDER BY name', [ids]);
    return rows.map((a) => ({ type: 'application', id: a.id, name: a.name }));
}

function cleanTags(tags) {
    if (!Array.isArray(tags)) return [];
    return [...new Set(tags.map((t) => String(t).trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
}

const canModify = (user, row) => isAdminLike(user) || (row.created_by && user && row.created_by === user.username);

const TEMPLATE_OWNER = 'AppDSI (modèle)';
let templatesSignature = null;
/**
 * Insère les modèles livrés avec l'application (idempotent, par titre). Rejoué dès que le contenu du
 * dossier templates change (fichier ajouté ou modifié), sans attendre un redémarrage du serveur.
 */
async function seedTemplates() {
    const dir = path.join(__dirname, 'templates');
    let signature = '';
    try {
        signature = fs.readdirSync(dir).filter((f) => f.endsWith('.bpmn'))
            .map((f) => `${f}:${fs.statSync(path.join(dir, f)).mtimeMs}`).join('|');
    } catch { /* pas de dossier de modèles */ }
    if (signature === templatesSignature) return;
    templatesSignature = signature;
    try {
        if (!fs.existsSync(dir)) return;
        for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.bpmn'))) {
            const xml = fs.readFileSync(path.join(dir, file), 'utf8');
            const title = (xml.match(/<bpmn:participant[^>]*\bname="([^"]+)"/) || [])[1] || file.replace(/\.bpmn$/, '');
            const description = (xml.match(/<bpmn:documentation id="Doc_Process">([\s\S]*?)<\/bpmn:documentation>/) || [])[1] || null;
            const { rows } = await pool.query('SELECT id, xml, created_by, updated_by FROM hub.bpmn_diagrams WHERE title = $1', [title]);
            if (rows.length > 0) {
                // Modèle jamais modifié par un utilisateur : on le met à jour quand le fichier livré évolue
                const row = rows[0];
                if (row.created_by === TEMPLATE_OWNER && row.updated_by === TEMPLATE_OWNER && row.xml !== xml) {
                    await pool.query(
                        'UPDATE hub.bpmn_diagrams SET xml = $1, description = $2, assets = $3::jsonb, updated_at = NOW() WHERE id = $4',
                        [xml, description, JSON.stringify(await extractAssets(xml)), row.id]
                    );
                }
                continue;
            }
            await pool.query(
                `INSERT INTO hub.bpmn_diagrams (title, description, xml, assets, tags, created_by, updated_by)
                 VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $6)`,
                [title, description, xml, JSON.stringify(await extractAssets(xml)), JSON.stringify(['modèle']), TEMPLATE_OWNER]
            );
        }
    } catch (e) {
        templatesSignature = null; // nouvel essai au prochain affichage de la bibliothèque
        console.warn('[BPMN] seed des modèles impossible :', e.message);
    }
}

const listDiagrams = async (req, res) => {
    try {
        await seedTemplates();
        const search = String(req.query.search || '').trim();
        const applicationId = Number(req.query.application_id) || null;
        const where = [];
        const params = [];
        if (search) {
            params.push(`%${search}%`);
            where.push(`(title ILIKE $${params.length} OR description ILIKE $${params.length} OR created_by ILIKE $${params.length}
                         OR assets::text ILIKE $${params.length} OR tags::text ILIKE $${params.length})`);
        }
        if (applicationId) {
            params.push(JSON.stringify([{ type: 'application', id: applicationId }]));
            where.push(`assets @> $${params.length}::jsonb`);
        }
        const { rows } = await pool.query(
            `SELECT ${LIST_COLUMNS} FROM hub.bpmn_diagrams ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC LIMIT 500`,
            params
        );
        res.json(rows.map((r) => ({ ...r, can_modify: canModify(req.user, r) })));
    } catch (error) {
        console.error('[BPMN] liste des diagrammes :', error.message);
        res.status(500).json({ message: 'Erreur lors de la lecture de la bibliothèque' });
    }
};

const getDiagram = async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT ${LIST_COLUMNS}, xml FROM hub.bpmn_diagrams WHERE id = $1`, [req.params.id]);
        if (!rows[0]) return res.status(404).json({ message: 'Diagramme introuvable' });
        res.json({ ...rows[0], can_modify: canModify(req.user, rows[0]) });
    } catch (error) {
        console.error('[BPMN] lecture du diagramme :', error.message);
        res.status(500).json({ message: 'Erreur lors de la lecture du diagramme' });
    }
};

const validateBody = (body) => {
    const title = String(body?.title || '').trim().slice(0, 200);
    const xml = String(body?.xml || '');
    if (!title) return { error: 'Le titre est obligatoire' };
    if (!/<(?:\w+:)?definitions[\s>]/.test(xml)) return { error: "Le contenu n'est pas un diagramme BPMN valide" };
    if (xml.length > 5 * 1024 * 1024) return { error: 'Diagramme trop volumineux (5 Mo max)' };
    return { title, xml, description: String(body?.description || '').trim().slice(0, 4000) || null, tags: cleanTags(body?.tags) };
};

const createDiagram = async (req, res) => {
    const v = validateBody(req.body);
    if (v.error) return res.status(400).json({ message: v.error });
    try {
        const { rows } = await pool.query(
            `INSERT INTO hub.bpmn_diagrams (title, description, xml, assets, tags, created_by, updated_by)
             VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $6) RETURNING ${LIST_COLUMNS}`,
            [v.title, v.description, v.xml, JSON.stringify(await extractAssets(v.xml)), JSON.stringify(v.tags), req.user.username]
        );
        res.status(201).json({ ...rows[0], can_modify: true });
    } catch (error) {
        console.error('[BPMN] création du diagramme :', error.message);
        res.status(500).json({ message: "Erreur lors de l'enregistrement du diagramme" });
    }
};

const updateDiagram = async (req, res) => {
    const v = validateBody(req.body);
    if (v.error) return res.status(400).json({ message: v.error });
    try {
        const existing = (await pool.query('SELECT id, created_by FROM hub.bpmn_diagrams WHERE id = $1', [req.params.id])).rows[0];
        if (!existing) return res.status(404).json({ message: 'Diagramme introuvable' });
        if (!canModify(req.user, existing)) {
            return res.status(403).json({ message: 'Seul le créateur du diagramme (ou un administrateur) peut le modifier' });
        }
        const { rows } = await pool.query(
            `UPDATE hub.bpmn_diagrams SET title = $1, description = $2, xml = $3, assets = $4::jsonb, tags = $5::jsonb,
                    updated_by = $6, updated_at = NOW()
             WHERE id = $7 RETURNING ${LIST_COLUMNS}`,
            [v.title, v.description, v.xml, JSON.stringify(await extractAssets(v.xml)), JSON.stringify(v.tags), req.user.username, req.params.id]
        );
        res.json({ ...rows[0], can_modify: true });
    } catch (error) {
        console.error('[BPMN] mise à jour du diagramme :', error.message);
        res.status(500).json({ message: 'Erreur lors de la mise à jour du diagramme' });
    }
};

const deleteDiagram = async (req, res) => {
    try {
        const existing = (await pool.query('SELECT id, created_by FROM hub.bpmn_diagrams WHERE id = $1', [req.params.id])).rows[0];
        if (!existing) return res.status(404).json({ message: 'Diagramme introuvable' });
        if (!canModify(req.user, existing)) {
            return res.status(403).json({ message: 'Seul le créateur du diagramme (ou un administrateur) peut le supprimer' });
        }
        await pool.query('DELETE FROM hub.bpmn_diagrams WHERE id = $1', [req.params.id]);
        res.json({ ok: true });
    } catch (error) {
        console.error('[BPMN] suppression du diagramme :', error.message);
        res.status(500).json({ message: 'Erreur lors de la suppression du diagramme' });
    }
};

module.exports = { generate, parseAiAnswer, listDiagrams, getDiagram, createDiagram, updateDiagram, deleteDiagram, extractAssets };
