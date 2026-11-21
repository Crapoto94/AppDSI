const { pgDb } = require('../../shared/database');
const { PDFDocument } = require('../../shared/lazy').lazy('pdf-lib');
const svc = require('./entretiens.service');
const { normalizeCrep, missingFields, definitionFor, gridWarning } = require('./crep.definition');
const epBase = require('../ep-base/ep-base.service');
const { buildCrepPdf } = require('./crep-pdf.service');
const storage = require('../../shared/storage');
const DG_NOTE_DEFAULT = require('./dg-note.default');
const { draftComment, reviewCrep } = require('./ai.service');
const { summarizeCrep, coherenceIssues } = require('./crep.coherence');
const workflow = require('./crep.workflow');

const PREP_FIELDS = [
    'realisations', 'difficultes', 'pistes_amelioration', 'competences_a_developper',
    'perspectives_missions', 'perspectives_responsabilite', 'perspectives_expertise',
    'perspectives_projet', 'perspectives_concours', 'commentaire_agent',
];

const NOMENCLATURE_STATUTS = [
    { key: 'a_planifier', label: 'À planifier', color: '#94a3b8' },
    { key: 'planifie', label: 'Planifié', color: '#2563eb' },
    { key: 'preparation_recue', label: 'Préparation reçue', color: '#0891b2' },
    { key: 'realise', label: 'Réalisé', color: '#16a34a' },
    { key: 'cloture', label: 'Clôturé', color: '#475569' },
];

const text = (v) => (v === null || v === undefined ? '' : String(v));
const intOr = (v, fallback) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
};

/** Réponse d'erreur homogène. */
function fail(res, status, message) {
    return res.status(status).json({ message });
}

async function loadCampaignOrCurrent(campaignId) {
    if (campaignId) {
        const c = await pgDb.get('SELECT * FROM hub_entretiens.campaigns WHERE id = ?', [campaignId]);
        if (c) return c;
    }
    return svc.getCurrentCampaign();
}

/** Enregistre/actualise les objectifs d'un entretien (préserve l'avis évaluateur). */
async function replaceObjectifs(entretienId, objectifs) {
    const existing = await pgDb.all('SELECT * FROM hub_entretiens.objectifs WHERE entretien_id = ?', [entretienId]);
    const byId = new Map(existing.map(o => [Number(o.id), o]));
    const keptIds = new Set();
    let order = 0;

    for (const raw of Array.isArray(objectifs) ? objectifs : []) {
        const libelle = text(raw?.libelle).trim();
        if (!libelle) continue;
        order++;
        const id = raw?.id ? Number(raw.id) : null;
        const current = id && byId.has(id) ? byId.get(id) : null;
        const niveau = ['A', 'PA', 'NA'].includes(text(raw?.niveau).trim()) ? text(raw.niveau).trim() : null;

        if (current) {
            keptIds.add(id);
            await pgDb.run(
                `UPDATE hub_entretiens.objectifs
                 SET ordre = ?, libelle = ?, niveau = ?, resultats = ?, difficultes = ?, contexte = ?, updated_at = NOW()
                 WHERE id = ? AND entretien_id = ?`,
                [order, libelle, niveau, text(raw?.resultats), text(raw?.difficultes), text(raw?.contexte), id, entretienId]
            );
        } else {
            await pgDb.run(
                `INSERT INTO hub_entretiens.objectifs
                   (entretien_id, ordre, libelle, niveau, resultats, difficultes, contexte)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [entretienId, order, libelle, niveau, text(raw?.resultats), text(raw?.difficultes), text(raw?.contexte)]
            );
        }
    }

    for (const o of existing) {
        if (!keptIds.has(Number(o.id))) {
            await pgDb.run('DELETE FROM hub_entretiens.objectifs WHERE id = ? AND entretien_id = ?', [o.id, entretienId]);
        }
    }
}

/** Enregistre/actualise les demandes de formation (préserve l'avis évaluateur). */
async function replaceFormations(entretienId, formations) {
    const existing = await pgDb.all('SELECT * FROM hub_entretiens.formations WHERE entretien_id = ?', [entretienId]);
    const byId = new Map(existing.map(f => [Number(f.id), f]));
    const keptIds = new Set();

    for (const raw of Array.isArray(formations) ? formations : []) {
        const formation = text(raw?.formation).trim();
        const competence = text(raw?.competence).trim();
        if (!formation && !competence) continue;
        const id = raw?.id ? Number(raw.id) : null;
        const current = id && byId.has(id) ? byId.get(id) : null;

        if (current) {
            keptIds.add(id);
            await pgDb.run(
                `UPDATE hub_entretiens.formations
                 SET competence = ?, formation = ?, benefices = ?, reference_cnfpt = ?, updated_at = NOW()
                 WHERE id = ? AND entretien_id = ?`,
                [competence, formation, text(raw?.benefices), text(raw?.reference_cnfpt), id, entretienId]
            );
        } else {
            await pgDb.run(
                `INSERT INTO hub_entretiens.formations
                   (entretien_id, competence, formation, benefices, reference_cnfpt)
                 VALUES (?, ?, ?, ?, ?)`,
                [entretienId, competence, formation, text(raw?.benefices), text(raw?.reference_cnfpt)]
            );
        }
    }

    for (const f of existing) {
        if (!keptIds.has(Number(f.id))) {
            await pgDb.run('DELETE FROM hub_entretiens.formations WHERE id = ? AND entretien_id = ?', [f.id, entretienId]);
        }
    }
}

// ─── Annuaire DSI (agents du calendrier DSI) ───────────────────────────────
const capitalize = (v) => String(v || '').toLowerCase().replace(/(^|[\s-])(\S)/g, (m, a, b) => a + b.toUpperCase());

/** Agents du calendrier DSI, enrichis (direction / service / poste) depuis l'extraction RH par matricule. */
/** Direction (base des agents à évaluer) de l'utilisateur connecté. */
async function baseDirectionOf(actor) {
    const mat = await epBase.meMatricule(actor);
    if (!mat) return '';
    const row = await pgDb.get('SELECT direction FROM hub_entretiens.base_agents WHERE matricule = ?', [mat]);
    return text(row?.direction);
}

/** Un valideur peut gérer un agent sans évaluateur de sa direction, même avant son rattachement. */
async function canManageUnassigned(actor, row) {
    if (!row || row.evaluator_email || row.evaluator_username) return false;
    const direction = await baseDirectionOf(actor);
    if (!direction) return false;
    if (text(row.direction) === direction) return true;
    if (!row.agent_matricule) return false;
    const base = await pgDb.get('SELECT direction FROM hub_entretiens.base_agents WHERE matricule = ?', [row.agent_matricule]);
    return !!base && text(base.direction) === direction;
}

async function loadDirectory() {
    const agentsRows = await pgDb.all('SELECT username, nom, email, service, matricule FROM hub_calendrier.agents_dsi ORDER BY LOWER(nom)');
    const matricules = agentsRows.map(a => a.matricule).filter(Boolean);
    let rh = [];
    if (matricules.length) {
        const list = matricules.map(m => `'${String(m).replace(/'/g, "''")}'`).join(',');
        rh = await pgDb.all(`SELECT "MATRICULE","NOM","PRENOM","DIRECTION_L","SERVICE_L","POSTE_L" FROM oracle.rh_v_extract_dsi WHERE "MATRICULE" IN (${list})`);
    }
    const rhByMat = new Map(rh.map(r => [String(r.MATRICULE).trim(), r]));
    const agents = agentsRows.map(a => {
        const r = rhByMat.get(String(a.matricule || '').trim());
        const parts = String(a.nom || '').trim().split(/\s+/);
        return {
            username: a.username,
            email: a.email || '',
            matricule: String(a.matricule || '').trim(),
            nom: String(r?.NOM || parts[0] || '').toUpperCase(),
            prenom: r?.PRENOM ? capitalize(r.PRENOM) : parts.slice(1).join(' '),
            direction: r?.DIRECTION_L || '',
            service: r?.SERVICE_L || a.service || '',
            poste: r?.POSTE_L || '',
        };
    });
    return { agents };
}

/** Agents DSI qui n'ont pas encore d'entretien dans la campagne (chaque agent DSI doit avoir le sien). */
async function agentsSansEntretien(rows) {
    const { agents } = await loadDirectory();
    const users = new Set(rows.map(r => svc.norm(r.agent_username)).filter(Boolean));
    const emails = new Set(rows.map(r => svc.norm(r.agent_email)).filter(Boolean));
    return agents.filter(a => !users.has(svc.norm(a.username)) && !(a.email && emails.has(svc.norm(a.email))));
}

/** Fusionne plusieurs PDF (impression en masse des CREP / EP). */
async function mergePdfBuffers(buffers) {
    const out = await PDFDocument.create();
    for (const buf of buffers) {
        const src = await PDFDocument.load(buf);
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const page of pages) out.addPage(page);
    }
    out.setTitle('CREP - sélection');
    out.setAuthor("DSI Hub - Ville d'Ivry-sur-Seine");
    return out.save();
}

/** Ajoute l'état du parapheur (signature) au compte rendu, s'il a été transmis. */
async function attachParapheur(entretien) {
    if (!entretien || !entretien.crep_parapheur_id) return entretien;
    try {
        const p = await pgDb.get('SELECT status FROM hub_parapheur.parapheurs WHERE id = ?', [entretien.crep_parapheur_id]);
        return { ...entretien, crep_parapheur_status: p?.status || null };
    } catch (e) { return entretien; }
}

/**
 * Après un changement d'évaluateur ou le rattachement d'un e-mail à l'agent : remet à jour l'invitation Outlook
 * et prévient les bonnes personnes (best effort, n'échoue jamais). Sans date de rendez-vous : rien à faire.
 * who = 'evaluateur' (nouvel évaluateur : invitation + e-mail) | 'agent' (e-mail de préparation + CREP vierge).
 */
async function refreshAfterChange(rowId, actor, who) {
    try {
        const fresh = await svc.getEntretienById(rowId);
        if (!fresh || !fresh.date_entretien || ['realise', 'cloture'].includes(fresh.statut)) return;
        const campaign = await pgDb.get('SELECT * FROM hub_entretiens.campaigns WHERE id = ?', [fresh.campaign_id]);
        await svc.syncOutlook(fresh, actor, campaign);
        if (who === 'evaluateur') await svc.sendEvaluatorMail(fresh, campaign);
        if (who === 'agent' && fresh.preparation_statut !== 'soumis') await svc.sendPreparationMail(fresh, campaign);
    } catch (e) { console.warn('[ENTRETIENS] mise à jour après changement:', e.message); }
}

const entretiensController = {

    // ─── Espace agent / rôle ─────────────────────────────────────────────

    // GET /api/entretiens/magapp-url — adresse de MagApp : les anciens liens DSI Hub (/entretiens) y sont redirigés
    magappUrl: async (req, res) => {
        try { res.json({ url: await require('../../shared/app_url').getMagappBaseUrl() }); }
        catch (err) { fail(res, 500, err.message); }
    },

    // GET /api/entretiens/me
    me: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const role = await svc.resolveRole(actor);
            const campaign = await svc.getCurrentCampaign();
            const selfAccess = await svc.selfAccessFor(actor);

            let entretien = null;
            if (campaign && (actor.email || actor.username)) {
                const clauses = [];
                const params = [campaign.id];
                if (actor.email) { clauses.push('LOWER(agent_email) = LOWER(?)'); params.push(actor.email); }
                if (actor.username) { clauses.push('LOWER(agent_username) = LOWER(?)'); params.push(actor.username); }
                const row = await pgDb.get(
                    `SELECT * FROM hub_entretiens.entretiens
                     WHERE deleted_at IS NULL AND campaign_id = ? AND (${clauses.join(' OR ')})
                     ORDER BY id DESC LIMIT 1`,
                    params
                );
                if (row) {
                    const access = await svc.buildAccess(actor, row, role.isAdmin);
                    if (access) {
                        entretien = svc.forViewer(await svc.attachReprise(await svc.withRelations(row)), access);
                        entretien.access = access;
                    }
                }
            }

            // « Mes EP » : entretiens que je dois conduire en tant qu'évaluateur, et qu'il reste à faire.
            let evaluatorCount = 0;
            const evClause = svc.evaluatorClause(await svc.evaluatorIdentity(actor));
            if (evClause) {
                const n = await pgDb.get(
                    `SELECT COUNT(*)::int AS n FROM hub_entretiens.entretiens
                     WHERE deleted_at IS NULL AND campaign_id = ? AND ${evClause.sql} AND statut NOT IN ('realise', 'cloture')`,
                    [campaign?.id || 0, ...evClause.params]
                );
                evaluatorCount = Number(n?.n || 0);
            }

            res.json({
                role: role.role,
                isAdmin: role.isAdmin,
                isEvaluator: role.isEvaluator,
                actor: { username: actor.username, email: actor.email, displayName: actor.displayName },
                campaign,
                entretien,
                evaluatorCount,
                selfAccess,
                esignAccess: await svc.esignAllowedFor(actor),
                aiAccess: {
                    draft: await svc.aiAccessFor(actor, 'draft'),
                    review: await svc.aiAccessFor(actor, 'review'),
                },
                now: svc.localNow(),
            });
        } catch (err) {
            console.error('[ENTRETIENS] me:', err.message);
            fail(res, 500, err.message);
        }
    },

    // ─── Campagnes ───────────────────────────────────────────────────────

    listCampaigns: async (req, res) => {
        try {
            const rows = await pgDb.all('SELECT * FROM hub_entretiens.campaigns ORDER BY annee DESC, id DESC');
            res.json(rows || []);
        } catch (err) { fail(res, 500, err.message); }
    },

    createCampaign: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const annee = intOr(req.body?.annee, 0);
            if (annee < 2000 || annee > 2100) return fail(res, 400, 'Année invalide.');
            const existing = await pgDb.get('SELECT id FROM hub_entretiens.campaigns WHERE annee = ?', [annee]);
            if (existing) return fail(res, 409, `Une campagne existe déjà pour ${annee}.`);

            const result = await pgDb.run(
                `INSERT INTO hub_entretiens.campaigns
                   (annee, libelle, date_ouverture, date_cloture, date_limite_ep, statut, instructions, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    annee,
                    text(req.body?.libelle).trim() || `Campagne ${annee}`,
                    svc.normalizeDate(req.body?.date_ouverture),
                    svc.normalizeDate(req.body?.date_cloture),
                    svc.normalizeDate(req.body?.date_limite_ep),
                    ['ouverte', 'close', 'preparation'].includes(req.body?.statut) ? req.body.statut : 'ouverte',
                    text(req.body?.instructions),
                    actor.username || null,
                ]
            );
            const row = await pgDb.get('SELECT * FROM hub_entretiens.campaigns WHERE id = ?', [result.lastID]);
            res.status(201).json(row);
        } catch (err) { fail(res, 500, err.message); }
    },

    updateCampaign: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const id = Number(req.params.id);
            const current = await pgDb.get('SELECT * FROM hub_entretiens.campaigns WHERE id = ?', [id]);
            if (!current) return fail(res, 404, 'Campagne introuvable.');

            const b = req.body || {};
            await pgDb.run(
                `UPDATE hub_entretiens.campaigns
                 SET annee = ?, libelle = ?, date_ouverture = ?, date_cloture = ?, date_limite_ep = ?,
                     statut = ?, instructions = ?, updated_at = NOW()
                 WHERE id = ?`,
                [
                    intOr(b.annee, current.annee),
                    b.libelle !== undefined ? text(b.libelle) : current.libelle,
                    b.date_ouverture !== undefined ? svc.normalizeDate(b.date_ouverture) : current.date_ouverture,
                    b.date_cloture !== undefined ? svc.normalizeDate(b.date_cloture) : current.date_cloture,
                    b.date_limite_ep !== undefined ? svc.normalizeDate(b.date_limite_ep) : current.date_limite_ep,
                    ['ouverte', 'close', 'preparation'].includes(b.statut) ? b.statut : current.statut,
                    b.instructions !== undefined ? text(b.instructions) : current.instructions,
                    id,
                ]
            );
            res.json(await pgDb.get('SELECT * FROM hub_entretiens.campaigns WHERE id = ?', [id]));
        } catch (err) { fail(res, 500, err.message); }
    },

    // ─── Administration déléguée / paramètres ────────────────────────────

    listAdmins: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const rows = await pgDb.all('SELECT * FROM hub_entretiens.admins ORDER BY display_name, username');
            res.json(rows || []);
        } catch (err) { fail(res, 500, err.message); }
    },

    addAdmin: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            let username = text(req.body?.username).trim();
            let email = text(req.body?.email).trim();
            let displayName = text(req.body?.display_name || req.body?.displayName).trim();
            if (!username) return fail(res, 400, 'Identifiant utilisateur requis.');

            const u = await pgDb.get(
                'SELECT username, displayName AS "displayName", email FROM hub.users WHERE LOWER(username) = LOWER(?)',
                [username]
            );
            if (u) {
                username = u.username;
                email = email || u.email || '';
                displayName = displayName || u.displayName || '';
            }
            const exists = await pgDb.get('SELECT id FROM hub_entretiens.admins WHERE LOWER(username) = LOWER(?)', [username]);
            if (exists) return fail(res, 409, 'Cet utilisateur est déjà administrateur du module.');
            const r = await pgDb.run(
                'INSERT INTO hub_entretiens.admins (username, email, display_name, created_by) VALUES (?, ?, ?, ?)',
                [username, email || null, displayName || null, actor.username || null]
            );
            res.status(201).json(await pgDb.get('SELECT * FROM hub_entretiens.admins WHERE id = ?', [r.lastID]));
        } catch (err) { fail(res, 500, err.message); }
    },

    removeAdmin: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            await pgDb.run('DELETE FROM hub_entretiens.admins WHERE id = ?', [Number(req.params.id)]);
            res.json({ message: 'Administrateur retiré.' });
        } catch (err) { fail(res, 500, err.message); }
    },

    getSettings: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const [ai, self, esign] = await Promise.all([
                svc.getAiSettings(), svc.getSelfSettings(), svc.getEsignSettings(),
            ]);
            res.json({
                simulation: await require('./simulation').isOn(),
                calendar_organizer_email: await svc.getSetting('calendar_organizer_email'),
                dg_note: (await svc.getSetting('dg_note')) || DG_NOTE_DEFAULT,
                dg_note_default: DG_NOTE_DEFAULT,
                ai,
                self,
                esign,
                actor_email: actor.email || '',
            });
        } catch (err) { fail(res, 500, err.message); }
    },

    updateSettings: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const b = req.body || {};

            const updates = {};

            if (b.dg_note !== undefined) {
                updates.dg_note = text(b.dg_note);
            }

            if (b.calendar_organizer_email !== undefined) {
                const email = text(b.calendar_organizer_email).trim();
                if (email && !svc.isEmail(email)) return fail(res, 400, 'Adresse email invalide.');
                updates.calendar_organizer_email = email;
            }

            const parseBool = (v) => [true, 1, '1', 'true', 'on', 'yes'].includes(
                typeof v === 'string' ? v.trim().toLowerCase() : v
            );

            // Chaque fonction IA (rédaction / relecture des compétences) a son
            // propre interrupteur et sa propre liste d'évaluateurs autorisés.
            for (const feature of ['draft', 'review']) {
                const enabledKey = `ai_${feature}_enabled`;
                const listKey = `ai_${feature}_evaluators`;
                const allKey = `ai_${feature}_all`;
                if (b[enabledKey] === undefined && b[listKey] === undefined && b[allKey] === undefined) continue;

                const currentRaw = (await svc.getSetting(enabledKey)).trim().toLowerCase();
                let enabled = currentRaw === 'true' || currentRaw === '1';
                if (b[enabledKey] !== undefined) enabled = parseBool(b[enabledKey]);
                let all = ['true', '1'].includes((await svc.getSetting(allKey)).trim().toLowerCase());
                if (b[allKey] !== undefined) all = parseBool(b[allKey]);

                let evaluators;
                if (b[listKey] !== undefined) {
                    if (!Array.isArray(b[listKey])) return fail(res, 400, 'Liste d’évaluateurs invalide.');
                    const seen = new Set();
                    evaluators = [];
                    for (const raw of b[listKey]) {
                        const username = text(typeof raw === 'string' ? raw : raw?.username).trim();
                        const email = text(typeof raw === 'string' ? '' : raw?.email).trim();
                        const displayName = text(typeof raw === 'string' ? '' : (raw?.display_name || raw?.displayName)).trim();
                        if (!username && !email) continue;
                        if (email && !svc.isEmail(email)) return fail(res, 400, `Adresse email invalide : ${email}`);
                        const key = (username || email).toLowerCase();
                        if (seen.has(key)) continue;
                        seen.add(key);
                        evaluators.push({ username, email, display_name: displayName });
                    }
                } else {
                    evaluators = await svc.getAiEvaluators(feature);
                }

                if (enabled && !all && !evaluators.length) {
                    return fail(res, 400, `Sélectionnez au moins un évaluateur avant d’activer l’IA (${feature === 'draft' ? 'rédaction' : 'évaluation des compétences'}).`);
                }
                if (b[enabledKey] !== undefined) updates[enabledKey] = enabled ? 'true' : 'false';
                if (b[allKey] !== undefined) updates[allKey] = all ? 'true' : 'false';
                if (b[listKey] !== undefined) updates[listKey] = JSON.stringify(evaluators);
            }

            // Accès à « Mon entretien » : fermé par défaut, ouvert à des agents ou à tous.
            if (b.self_enabled !== undefined || b.self_agents !== undefined || b.self_all !== undefined) {
                const currentRaw = (await svc.getSetting('self_enabled')).trim().toLowerCase();
                let enabled = currentRaw === 'true' || currentRaw === '1';
                if (b.self_enabled !== undefined) enabled = parseBool(b.self_enabled);
                let all = ['true', '1'].includes((await svc.getSetting('self_all')).trim().toLowerCase());
                if (b.self_all !== undefined) all = parseBool(b.self_all);

                let agents;
                if (b.self_agents !== undefined) {
                    if (!Array.isArray(b.self_agents)) return fail(res, 400, 'Liste d’agents invalide.');
                    const seen = new Set();
                    agents = [];
                    for (const raw of b.self_agents) {
                        const username = text(typeof raw === 'string' ? raw : raw?.username).trim();
                        const email = text(typeof raw === 'string' ? '' : raw?.email).trim();
                        const displayName = text(typeof raw === 'string' ? '' : (raw?.display_name || raw?.displayName)).trim();
                        if (!username && !email) continue;
                        if (email && !svc.isEmail(email)) return fail(res, 400, `Adresse email invalide : ${email}`);
                        const key = (username || email).toLowerCase();
                        if (seen.has(key)) continue;
                        seen.add(key);
                        agents.push({ username, email, display_name: displayName });
                    }
                } else {
                    agents = await svc.getSelfAgents();
                }

                if (enabled && !all && !agents.length) {
                    return fail(res, 400, 'Sélectionnez au moins un agent avant d’ouvrir « Mon entretien ».');
                }
                if (b.self_enabled !== undefined) updates.self_enabled = enabled ? 'true' : 'false';
                if (b.self_all !== undefined) updates.self_all = all ? 'true' : 'false';
                if (b.self_agents !== undefined) updates.self_agents = JSON.stringify(agents);
            }

            // Signature électronique du CREP : fermée par défaut, ouverte à des agents ou à tous.
            if (b.esign_enabled !== undefined || b.esign_agents !== undefined || b.esign_all !== undefined) {
                const currentRaw = (await svc.getSetting('esign_enabled')).trim().toLowerCase();
                let enabled = currentRaw === 'true' || currentRaw === '1';
                if (b.esign_enabled !== undefined) enabled = parseBool(b.esign_enabled);
                let all = ['true', '1'].includes((await svc.getSetting('esign_all')).trim().toLowerCase());
                if (b.esign_all !== undefined) all = parseBool(b.esign_all);

                let agents;
                if (b.esign_agents !== undefined) {
                    if (!Array.isArray(b.esign_agents)) return fail(res, 400, 'Liste d’agents invalide.');
                    const seen = new Set();
                    agents = [];
                    for (const raw of b.esign_agents) {
                        const username = text(typeof raw === 'string' ? raw : raw?.username).trim();
                        const email = text(typeof raw === 'string' ? '' : raw?.email).trim();
                        const displayName = text(typeof raw === 'string' ? '' : (raw?.display_name || raw?.displayName)).trim();
                        if (!username && !email) continue;
                        if (email && !svc.isEmail(email)) return fail(res, 400, `Adresse email invalide : ${email}`);
                        const key = (username || email).toLowerCase();
                        if (seen.has(key)) continue;
                        seen.add(key);
                        agents.push({ username, email, display_name: displayName });
                    }
                } else {
                    agents = await svc.getEsignAgents();
                }

                if (enabled && !all && !agents.length) {
                    return fail(res, 400, 'Sélectionnez au moins un agent avant d’ouvrir la signature électronique.');
                }
                if (b.esign_enabled !== undefined) updates.esign_enabled = enabled ? 'true' : 'false';
                if (b.esign_all !== undefined) updates.esign_all = all ? 'true' : 'false';
                if (b.esign_agents !== undefined) updates.esign_agents = JSON.stringify(agents);
            }

            for (const [key, value] of Object.entries(updates)) {
                await svc.setSetting(key, value);
            }

            const [ai, self, esign] = await Promise.all([
                svc.getAiSettings(), svc.getSelfSettings(), svc.getEsignSettings(),
            ]);
            res.json({
                simulation: await require('./simulation').isOn(),
                calendar_organizer_email: await svc.getSetting('calendar_organizer_email'),
                dg_note: (await svc.getSetting('dg_note')) || DG_NOTE_DEFAULT,
                dg_note_default: DG_NOTE_DEFAULT,
                ai,
                self,
                esign,
                actor_email: actor.email || '',
            });
        } catch (err) { fail(res, 500, err.message); }
    },

    // GET /api/entretiens/users-search?q=...
    usersSearch: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const q = text(req.query.q).trim();
            if (q.length < 2) return res.json([]);
            const like = `%${q}%`;
            const rows = await pgDb.all(
                `SELECT username, displayName AS "displayName", email, service_code, service_complement
                 FROM hub.users
                 WHERE is_approved = 1
                   AND (username ILIKE ? OR displayName ILIKE ? OR email ILIKE ?)
                 ORDER BY displayName, username
                 LIMIT 20`,
                [like, like, like]
            );
            res.json(rows || []);
        } catch (err) { fail(res, 500, err.message); }
    },

    // ─── Listes / tableau de bord ───────────────────────────────────────

    // GET /api/entretiens?campaign_id=&statut=&q=
    list: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const role = await svc.resolveRole(actor);
            if (!role.isAdmin && !role.isEvaluator) return fail(res, 403, 'Accès réservé.');
            const campaign = await loadCampaignOrCurrent(req.query.campaign_id);

            const filters = {
                campaignId: campaign?.id,
                statut: text(req.query.statut) || undefined,
                search: text(req.query.q) || undefined,
            };
            if (role.isAdmin) filters.excludeVille = true;
            if (!role.isAdmin) filters.evaluatorEmail = actor.email || '__none__';
            if (!role.isAdmin && !actor.email && actor.username) {
                // Repli : filtre sur le username évaluateur.
                delete filters.evaluatorEmail;
            }

            let rows;
            if (!role.isAdmin && !actor.email && actor.username) {
                rows = await svc.listEntretiens(filters);
                rows = rows.filter(r => svc.norm(r.evaluator_username) === svc.norm(actor.username));
            } else {
                rows = await svc.listEntretiens(filters);
            }

            let aProgrammer = [];
            if (role.isAdmin && campaign) {
                const all = filters.statut || filters.search ? await svc.listEntretiens({ campaignId: campaign.id, excludeVille: true }) : rows;
                aProgrammer = await agentsSansEntretien(all).catch(() => []);
            }
            res.json({ campaign, stats: svc.computeStats(rows, aProgrammer.length), items: rows, a_programmer: aProgrammer });
        } catch (err) {
            console.error('[ENTRETIENS] list:', err.message);
            fail(res, 500, err.message);
        }
    },

    // GET /api/entretiens/evaluateur
    evaluatorList: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const role = await svc.resolveRole(actor);
            const campaign = await loadCampaignOrCurrent(req.query.campaign_id);
            const epBase = require('../ep-base/ep-base.service');
            const pid = await epBase.plannerIdentities(actor).catch(() => ({ usernames: [], emails: [] }));
            const isPlannerUser = pid.usernames.length > 0 || pid.emails.length > 0;
            if (!role.isEvaluator && !isPlannerUser) return res.json({ campaign, stats: svc.computeStats([]), items: [] });
            const identityCache = await svc.evaluatorIdentity(actor);
            const matches = (r, identity) => (svc.norm(r.evaluator_email) && identity.emails.includes(svc.norm(r.evaluator_email)))
                || (svc.norm(r.evaluator_username) && identity.usernames.includes(svc.norm(r.evaluator_username)));

            const all = await svc.listEntretiens({ campaignId: campaign?.id });
            const rows = [];
            for (const r of all) {
                if (matches(r, identityCache)) rows.push(r);
                else if (isPlannerUser && matches(r, pid)) rows.push({ ...r, planification_seule: true });
            }
            const items = await epBase.attachInfo(await require('./ep-rh-enrich').enrichFromRh(rows));
            res.json({ campaign, stats: svc.computeStats(rows), items });
        } catch (err) { fail(res, 500, err.message); }
    },

    // POST /api/entretiens/:id/crep/scan (multipart « file » : PDF ou image) — lit un compte rendu papier (manuscrit) et PROPOSE un contenu ;
    // rien n'est enregistré : l'évaluateur relit, corrige puis applique la proposition au formulaire.
    crepScan: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access || !access.canEditEvaluation) return fail(res, 403, 'Seul l’évaluateur peut importer un compte rendu papier.');
            const up = [...(req.files?.files || []), ...(req.files?.file || [])].filter(f => f && f.buffer && f.buffer.length);
            if (!up.length) return fail(res, 400, 'Aucun fichier reçu.');
            if (up.some(f => !/^(application\/pdf|image\/(png|jpe?g|webp|tiff?))$/i.test(f.mimetype || ''))) return fail(res, 400, 'Format non pris en charge : PDF ou image (PNG, JPEG).');
            const cdef = definitionFor(await epBase.modeleOfEntretien(row));
            // Analyse en tâche de fond (plusieurs minutes) : on répond tout de suite, l'évaluateur est prévenu par e-mail à la fin.
            const campaign = await pgDb.get('SELECT annee FROM hub_entretiens.campaigns WHERE id = ?', [row.campaign_id]);
            const job = await require('./crep-scan-jobs').start({
                row, actor, definition: cdef, annee: campaign?.annee,
                // CREP déjà saisi et validé dans l'outil (origine numérique) : le document signé à la main n'apporte que les 2 commentaires de l'agent
                mode: row.evaluation_statut === 'soumis' ? 'agent' : 'complet',
                files: up.map(f => ({ buffer: f.buffer, mimetype: f.mimetype, name: f.originalname })),
                contexte: { agent: svc.fullName(row.agent_prenom, row.agent_nom), poste: row.poste || '', service: row.service || '', direction: row.direction || '', grade: row.agent_grade || '' },
            });
            await svc.logAudit({ actor, action: 'crep_analyse_lancee', entretien: row, details: { fichiers: up.length, job: job.id } });
            res.status(202).json({ job });
        } catch (err) {
            if (err && err.status) return fail(res, err.status, err.message);
            console.error('[ENTRETIENS] crepScan:', err.message);
            fail(res, 500, `Lecture du document impossible : ${err.message}`);
        }
    },

    // GET /api/entretiens/:id/crep/scan/latest — dernière analyse du CREP manuscrit de cet entretien (en cours, terminée, en échec)
    crepScanLatest: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access || !access.canEditEvaluation) return fail(res, 403, 'Réservé à l’évaluateur.');
            res.json({ job: await require('./crep-scan-jobs').latest(row.id) });
        } catch (err) { fail(res, 500, err.message); }
    },

    // GET /api/entretiens/:id/crep/scans/:idx.pdf — scan original conservé (papier signé)
    crepScanFile: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access || !(access.isEvaluator || access.isSuperieur || access.isAdmin)) return fail(res, 403, 'Réservé à l’évaluateur, à son valideur et aux administrateurs.');
            const list = Array.isArray(row.crep_scans) ? row.crep_scans : [];
            const item = list[Number(req.params.idx)];
            if (!item) return fail(res, 404, 'Scan introuvable.');
            const f = await storage.getFileForServe(item.path);
            if (!f) return fail(res, 404, 'Fichier introuvable.');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${String(item.name || 'scan.pdf').replace(/[^\w.\-]+/g, '_')}"`);
            if (f.absolutePath) return res.sendFile(f.absolutePath);
            res.send(f.buffer);
        } catch (err) { fail(res, 500, err.message); }
    },

    // POST /api/entretiens/:id/crep/scan/:jobId/ack — la proposition a été appliquée ou écartée : on la range
    crepScanAck: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access || !access.canEditEvaluation) return fail(res, 403, 'Réservé à l’évaluateur.');
            await require('./crep-scan-jobs').ack(row.id, Number(req.params.jobId), req.body?.applied === true, actor.username || actor.email || '');
            res.json({ ok: true });
        } catch (err) { fail(res, 500, err.message); }
    },

    // GET /api/entretiens/stats?campaign_id=...
    stats: async (req, res) => {
        try {
            const campaign = await loadCampaignOrCurrent(req.query.campaign_id);
            const rows = await svc.listEntretiens({ campaignId: campaign?.id, excludeVille: true });
            const sans = campaign ? await agentsSansEntretien(rows).catch(() => []) : [];
            const stats = svc.computeStats(rows, sans.length);

            const parStatut = NOMENCLATURE_STATUTS.map(s => ({
                key: s.key,
                label: s.label,
                color: s.color,
                value: rows.filter(r => r.statut === s.key).length + (s.key === 'a_planifier' ? sans.length : 0),
            }));
            const byService = new Map();
            for (const r of [...rows, ...sans]) {
                const key = (r.service || r.direction || 'Non renseigné').trim() || 'Non renseigné';
                byService.set(key, (byService.get(key) || 0) + 1);
            }
            const parService = Array.from(byService.entries())
                .map(([label, value]) => ({ label, value }))
                .sort((a, b) => b.value - a.value)
                .slice(0, 8);

            res.json({ campaign, stats, par_statut: parStatut, par_service: parService });
        } catch (err) { fail(res, 500, err.message); }
    },

    // --- Détail ---
    getOne: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const role = await svc.resolveRole(actor);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access) return fail(res, 403, 'Vous n’avez pas accès à cet entretien.');
            const [rich] = await require('./ep-rh-enrich').enrichFromRh([row]);
            res.json({
                ...(await attachParapheur(svc.forViewer(await svc.attachReprise(await svc.withRelations(rich)), access))),
                access,
                ai_access: {
                    draft: await svc.aiAccessFor(actor, 'draft'),
                    review: await svc.aiAccessFor(actor, 'review'),
                },
                esign_access: await svc.esignAllowedFor({ username: row.agent_username, email: row.agent_email }),
            });
        } catch (err) { fail(res, 500, err.message); }
    },

    // ─── Création / modification (admin) ─────────────────────────────────

    create: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const b = req.body || {};
            const campaign = await loadCampaignOrCurrent(b.campaign_id);
            if (!campaign) return fail(res, 400, 'Aucune campagne disponible : créez d’abord une campagne.');

            const agentNom = text(b.agent_nom || b.nom).trim();
            const agentPrenom = text(b.agent_prenom || b.prenom).trim();
            const agentEmail = text(b.agent_email || b.email).trim();
            if (!agentNom && !agentPrenom) return fail(res, 400, 'Le nom de l’agent est requis.');
            if (agentEmail && !svc.isEmail(agentEmail)) return fail(res, 400, 'Adresse email de l’agent invalide.');

            if (agentEmail) {
                const dup = await pgDb.get(
                    'SELECT id FROM hub_entretiens.entretiens WHERE deleted_at IS NULL AND campaign_id = ? AND LOWER(agent_email) = LOWER(?)',
                    [campaign.id, agentEmail]
                );
                if (dup) return fail(res, 409, 'Un entretien existe déjà pour cet agent sur cette campagne.');
            }

            const evaluatorEmail = text(b.evaluator_email).trim();
            if (evaluatorEmail && !svc.isEmail(evaluatorEmail)) return fail(res, 400, 'Adresse email de l’évaluateur invalide.');
            const dateEntretien = svc.normalizeDateTime(b.date_entretien);
            const statut = dateEntretien ? 'planifie' : 'a_planifier';

            const r = await pgDb.run(
                `INSERT INTO hub_entretiens.entretiens
                   (campaign_id, agent_username, agent_email, agent_nom, agent_prenom, direction, service, poste,
                    evaluator_username, evaluator_email, evaluator_nom, date_entretien, duree_minutes, lieu,
                    statut, notes_admin, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    campaign.id,
                    text(b.agent_username).trim(),
                    agentEmail.toLowerCase(),
                    agentNom,
                    agentPrenom,
                    text(b.direction).trim(),
                    text(b.service).trim(),
                    text(b.poste).trim(),
                    text(b.evaluator_username).trim(),
                    evaluatorEmail.toLowerCase(),
                    text(b.evaluator_nom).trim(),
                    dateEntretien,
                    intOr(b.duree_minutes, 120),
                    text(b.lieu).trim(),
                    statut,
                    text(b.notes_admin),
                    actor.username || null,
                ]
            );

            let row = await svc.getEntretienById(r.lastID);
            const outlook = await svc.syncOutlook(row, actor, campaign);
            row = await svc.getEntretienById(r.lastID);
            if (row.date_entretien) await svc.sendPreparationMail(row, campaign);
            if (row.evaluator_email) await svc.sendEvaluatorMail(row, campaign); // sans date : à planifier ; avec date : confirmation
            res.status(201).json({ entretien: await svc.withRelations(row), outlook });
        } catch (err) {
            if (err.code === '23505') return fail(res, 409, 'Un entretien existe déjà pour cet agent sur cette campagne.');
            console.error('[ENTRETIENS] create:', err.message);
            fail(res, 500, err.message);
        }
    },

    update: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const id = Number(req.params.id);
            const current = await svc.getEntretienById(id);
            if (!current) return fail(res, 404, 'Entretien introuvable.');
            const b = req.body || {};

            const set = [];
            const params = [];
            const add = (col, value) => { set.push(`${col} = ?`); params.push(value); };

            if (b.agent_nom !== undefined) add('agent_nom', text(b.agent_nom).trim());
            if (b.agent_prenom !== undefined) add('agent_prenom', text(b.agent_prenom).trim());
            if (b.agent_email !== undefined) {
                const email = text(b.agent_email).trim().toLowerCase();
                if (email && !svc.isEmail(email)) return fail(res, 400, 'Adresse email de l’agent invalide.');
                if (email) {
                    const dup = await pgDb.get(
                        'SELECT id FROM hub_entretiens.entretiens WHERE deleted_at IS NULL AND campaign_id = ? AND LOWER(agent_email) = LOWER(?) AND id <> ?',
                        [current.campaign_id, email, id]
                    );
                    if (dup) return fail(res, 409, 'Un entretien existe déjà pour cet agent sur cette campagne.');
                }
                add('agent_email', email);
            }
            if (b.agent_username !== undefined) add('agent_username', text(b.agent_username).trim());
            if (b.direction !== undefined) add('direction', text(b.direction).trim());
            if (b.service !== undefined) add('service', text(b.service).trim());
            if (b.poste !== undefined) add('poste', text(b.poste).trim());
            if (b.evaluator_nom !== undefined) add('evaluator_nom', text(b.evaluator_nom).trim());
            if (b.evaluator_username !== undefined) add('evaluator_username', text(b.evaluator_username).trim());
            if (b.evaluator_email !== undefined) {
                const email = text(b.evaluator_email).trim().toLowerCase();
                if (email && !svc.isEmail(email)) return fail(res, 400, 'Adresse email de l’évaluateur invalide.');
                add('evaluator_email', email);
            }
            if (b.date_entretien !== undefined) {
                const d = svc.normalizeDateTime(b.date_entretien);
                add('date_entretien', d);
                if (d && ['a_planifier'].includes(current.statut)) add('statut', 'planifie');
                if (!d && !['realise', 'cloture'].includes(current.statut)) add('statut', 'a_planifier');
            }
            if (b.duree_minutes !== undefined) add('duree_minutes', Math.max(15, intOr(b.duree_minutes, 120)));
            if (b.lieu !== undefined) add('lieu', text(b.lieu).trim());
            if (b.notes_admin !== undefined) add('notes_admin', text(b.notes_admin));
            if (b.statut !== undefined && NOMENCLATURE_STATUTS.some(s => s.key === b.statut)) add('statut', b.statut);

            if (!set.length) return fail(res, 400, 'Aucune modification fournie.');
            params.push(id);
            await pgDb.run(
                `UPDATE hub_entretiens.entretiens SET ${set.join(', ')}, updated_at = NOW() WHERE id = ?`,
                params
            );

            const updated = await svc.getEntretienById(id);
            let outlook = null;
            const evaluatorChanged = b.evaluator_email !== undefined && text(b.evaluator_email).trim().toLowerCase() !== text(current.evaluator_email).trim().toLowerCase() && updated.evaluator_email;
            const planChanged = ['agent_email', 'agent_nom', 'agent_prenom', 'evaluator_email', 'evaluator_nom', 'date_entretien', 'duree_minutes', 'lieu']
                .some(k => b[k] !== undefined);
            if (planChanged || b.resync_outlook) {
                const campaign = await pgDb.get('SELECT * FROM hub_entretiens.campaigns WHERE id = ?', [updated.campaign_id]);
                outlook = await svc.syncOutlook(updated, actor, campaign);
                // Nouvelle date ou nouvel agent/évaluateur : l'agent est (re)prévenu qu'il doit préparer son entretien.
                const dateChanged = b.date_entretien !== undefined && svc.normalizeDateTime(b.date_entretien) && svc.normalizeDateTime(b.date_entretien) !== svc.normalizeDateTime(current.date_entretien);
                if (dateChanged && updated.preparation_statut !== 'soumis') await svc.sendPreparationMail(updated, campaign);
                if (dateChanged) await svc.sendEvaluatorMail(updated, campaign);
            }
            // Nouvel évaluateur désigné sans rendez-vous fixé : il est invité à planifier lui-même l'entretien.
            if (evaluatorChanged && !updated.date_entretien) {
                const camp = await pgDb.get('SELECT * FROM hub_entretiens.campaigns WHERE id = ?', [updated.campaign_id]);
                await svc.sendEvaluatorMail(updated, camp);
            }
            res.json({ entretien: await svc.withRelations(await svc.getEntretienById(id)), outlook });
        } catch (err) {
            if (err.code === '23505') return fail(res, 409, 'Un entretien existe déjà pour cet agent sur cette campagne.');
            console.error('[ENTRETIENS] update:', err.message);
            fail(res, 500, err.message);
        }
    },

    remove: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const id = Number(req.params.id);
            const current = await svc.getEntretienById(id);
            if (!current) return fail(res, 404, 'Entretien introuvable.');
            await svc.removeOutlook(current);
            // Suppression logique : seul l'EP est retiré (planning, invitation Outlook, compte rendu) ;
            // les données saisies par l'agent (préparation, objectifs, formations) sont conservées.
            await pgDb.run('UPDATE hub_entretiens.entretiens SET deleted_at = NOW(), deleted_by = ?, outlook_event_id = NULL, outlook_status = ? WHERE id = ?', [actor.username || null, 'non_planifie', id]);
            res.json({ message: 'Entretien supprimé.', outlook_cancelled: !!current.outlook_event_id });
        } catch (err) { fail(res, 500, err.message); }
    },

    // ─── Préparation de l'agent ──────────────────────────────────────────

    savePreparation: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const id = Number(req.params.id);
            const row = await svc.getEntretienById(id);
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access) return fail(res, 403, 'Vous n’avez pas accès à cet entretien.');
            if (!access.canEditPreparation) return fail(res, 403, 'La préparation n’est plus modifiable (entretien réalisé ou délai dépassé).');

            const b = req.body || {};
            const set = [];
            const params = [];
            for (const field of PREP_FIELDS) {
                if (b[field] !== undefined) { set.push(`${field} = ?`); params.push(text(b[field])); }
            }
            set.push(`preparation_statut = ?`);
            params.push('brouillon');
            params.push(id);
            await pgDb.run(`UPDATE hub_entretiens.entretiens SET ${set.join(', ')}, updated_at = NOW() WHERE id = ?`, params);

            await replaceObjectifs(id, b.objectifs);
            await replaceFormations(id, b.formations);

            await svc.logAudit({ actor, action: 'preparation_enregistree', entretien: row, details: { statut: row.preparation_statut } });
            res.json({ entretien: svc.forViewer(await svc.withRelations(await svc.getEntretienById(id)), access) });
        } catch (err) {
            console.error('[ENTRETIENS] savePreparation:', err.message);
            fail(res, 500, err.message);
        }
    },

    submitPreparation: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const id = Number(req.params.id);
            const row = await svc.getEntretienById(id);
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access) return fail(res, 403, 'Vous n’avez pas accès à cet entretien.');
            if (!access.canEditPreparation) return fail(res, 403, 'La préparation n’est plus modifiable.');

            const objectifs = await pgDb.all('SELECT * FROM hub_entretiens.objectifs WHERE entretien_id = ?', [id]);
            const hasContent = objectifs.some(o => o.niveau) ||
                ['realisations', 'difficultes', 'pistes_amelioration', 'perspectives_missions', 'perspectives_responsabilite', 'perspectives_expertise', 'perspectives_projet', 'perspectives_concours', 'commentaire_agent']
                    .some(f => text(row[f]).trim());
            if (!hasContent) return fail(res, 400, 'Complétez au moins un élément de votre préparation avant de la transmettre.');

            const nextStatut = ['a_planifier', 'planifie'].includes(row.statut) ? 'preparation_recue' : row.statut;
            await pgDb.run(
                `UPDATE hub_entretiens.entretiens
                 SET preparation_statut = 'soumis', agent_submitted_at = NOW(), statut = ?, updated_at = NOW()
                 WHERE id = ?`,
                [nextStatut, id]
            );
            await svc.logAudit({ actor, action: 'preparation_transmise', entretien: row, details: { statut: nextStatut } });
            res.json({ entretien: svc.forViewer(await svc.withRelations(await svc.getEntretienById(id)), access) });
        } catch (err) { fail(res, 500, err.message); }
    },

    // ─── Compte rendu de l'évaluateur ───────────────────────────────────

    saveEvaluation: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const id = Number(req.params.id);
            const row = await svc.getEntretienById(id);
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access) return fail(res, 403, 'Vous n’avez pas accès à cet entretien.');
            if (!access.canEditEvaluation) return fail(res, 403, 'Cet entretien est clôturé.');

            const b = req.body || {};
            const submit = b.submit === true || b.submit === 'true';
            const set = [];
            const params = [];
            for (const field of ['synthese', 'appreciation_generale', 'objectifs_suivants', 'avis_agent']) {
                if (b[field] !== undefined) { set.push(`${field} = ?`); params.push(text(b[field])); }
            }
            set.push('evaluation_statut = ?');
            params.push(submit ? 'soumis' : 'brouillon');
            if (submit) {
                set.push('evaluator_submitted_at = NOW()');
                if (b.mark_realise !== false && !['cloture'].includes(row.statut)) {
                    set.push('statut = ?');
                    params.push('realise');
                }
            }
            params.push(id);
            await pgDb.run(`UPDATE hub_entretiens.entretiens SET ${set.join(', ')}, updated_at = NOW() WHERE id = ?`, params);

            // Avis de l'évaluateur sur les objectifs.
            for (const o of Array.isArray(b.objectifs) ? b.objectifs : []) {
                const oid = Number(o?.id);
                if (!oid) continue;
                const niveau = ['A', 'PA', 'NA'].includes(text(o?.niveau_evaluateur).trim()) ? text(o.niveau_evaluateur).trim() : null;
                await pgDb.run(
                    `UPDATE hub_entretiens.objectifs
                     SET niveau_evaluateur = ?, commentaire_evaluateur = ?, updated_at = NOW()
                     WHERE id = ? AND entretien_id = ?`,
                    [niveau, text(o?.commentaire_evaluateur), oid, id]
                );
            }

            // Avis de l'évaluateur sur les demandes de formation.
            for (const f of Array.isArray(b.formations) ? b.formations : []) {
                const fid = Number(f?.id);
                if (!fid) continue;
                const statut = ['soumise', 'a_etudier', 'validee', 'refusee'].includes(f?.statut) ? f.statut : 'soumise';
                await pgDb.run(
                    `UPDATE hub_entretiens.formations
                     SET statut = ?, avis_evaluateur = ?, updated_at = NOW()
                     WHERE id = ? AND entretien_id = ?`,
                    [statut, text(f?.avis_evaluateur), fid, id]
                );
            }

            res.json({ entretien: await svc.withRelations(await svc.getEntretienById(id)) });
        } catch (err) {
            console.error('[ENTRETIENS] saveEvaluation:', err.message);
            fail(res, 500, err.message);
        }
    },



    // ─── Compte-rendu officiel (CREP) ───────────────────────────────────

    // PUT /api/entretiens/:id/crep  { crep, submit? }
    saveCrep: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const id = Number(req.params.id);
            const row = await svc.getEntretienById(id);
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access || !(access.isEvaluator || access.isAdmin)) return fail(res, 403, 'Seul l’évaluateur peut renseigner le compte rendu.');
            if (!access.canEditEvaluation) return fail(res, 403, row.crep_statut && row.crep_statut !== 'non_envoye' ? 'Le compte rendu a été envoyé à l’agent : il n’est plus modifiable.' : 'Cet entretien est clôturé.');

            const cdef = definitionFor(await epBase.modeleOfEntretien(row));
            const crep = normalizeCrep(req.body?.crep, cdef);
            const submit = req.body?.submit === true || req.body?.submit === 'true';
            if (submit) {
                const missing = missingFields(crep, cdef);
                if (missing.length) return res.status(400).json({ message: 'Le compte rendu est incomplet : il ne peut pas être validé.', missing });
            }
            // keep_status : simple enregistrement de la saisie (ex. avant génération du PDF), sans changer le statut du compte rendu.
            const keepStatus = req.body?.keep_status === true && !submit;
            const set = ['crep = CAST(? AS jsonb)'];
            const params = [JSON.stringify(crep)];
            if (!keepStatus) {
                set.push('evaluation_statut = ?');
                params.push(submit ? 'soumis' : (row.evaluation_statut === 'soumis' ? 'soumis' : 'brouillon'));
            }
            if (submit) {
                set.push('evaluator_submitted_at = NOW()');
                if (row.statut !== 'cloture') { set.push('statut = ?'); params.push('realise'); }
            }
            params.push(id);
            await pgDb.run(`UPDATE hub_entretiens.entretiens SET ${set.join(', ')}, updated_at = NOW() WHERE id = ?`, params);
            res.json({ entretien: await svc.withRelations(await svc.getEntretienById(id)) });
        } catch (err) {
            console.error('[ENTRETIENS] saveCrep:', err.message);
            fail(res, 500, err.message);
        }
    },


    // POST /api/entretiens/:id/ai-draft  { rubrique, notes, contexte?, existant? }
    // Rédaction assistée (IA locale Ollama) d'une rubrique du compte rendu, proposée à l'évaluateur.
    aiDraft: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access || !(access.isEvaluator || access.isAdmin) || !access.canEditEvaluation) return fail(res, 403, 'Réservé à l’évaluateur de cet entretien.');
            const ai = await svc.aiAccessFor(actor, 'draft');
            if (!ai.allowed) {
                return fail(res, 403, ai.reason === 'disabled'
                    ? 'La rédaction assistée par IA est désactivée pour le module des entretiens professionnels.'
                    : 'La rédaction assistée n’est pas autorisée pour votre compte. Contactez un administrateur du module.');
            }
            const b = req.body || {};
            if (!text(b.notes).trim()) return fail(res, 400, 'Indiquez en quelques mots ce que le commentaire doit exprimer.');
            // Appréciation générale : l'IA reçoit TOUT ce que l'évaluateur a saisi (grille, objectifs, observations…)
            // et doit rester cohérente avec cet ensemble.
            const rubrique = text(b.rubrique) || 'Commentaire';
            const cdef = definitionFor(await epBase.modeleOfEntretien(row));
            const global = /appréciation générale/i.test(rubrique) && b.crep && typeof b.crep === 'object';
            const result = await draftComment({
                rubrique,
                notes: text(b.notes),
                contexte: global ? summarizeCrep(b.crep, row, cdef) : text(b.contexte),
                existant: text(b.existant),
                agent: svc.fullName(row.agent_prenom, row.agent_nom),
                coherent: global,
                crep: global ? normalizeCrep(b.crep, cdef) : undefined,
            });
            res.json(result);
        } catch (err) {
            console.error('[ENTRETIENS] aiDraft:', err.message);
            fail(res, 502, err.message);
        }
    },



    // PUT /api/entretiens/:id/planning  { date_entretien, duree_minutes?, lieu? }
    // L'évaluateur (ou un administrateur) fixe lui-même le rendez-vous : invitation Outlook + e-mail de préparation à l'agent.
    planning: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const id = Number(req.params.id);
            const current = await svc.getEntretienById(id);
            if (!current) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, current, role.isAdmin);
            if (!access || !(access.isEvaluator || access.isAdmin || access.isPlanner)) return fail(res, 403, 'Seul l’évaluateur de cet entretien (ou son délégué) peut le planifier.');
            if (['realise', 'cloture'].includes(current.statut)) return fail(res, 409, 'Cet entretien est déjà réalisé.');
            const b = req.body || {};
            const d = svc.normalizeDateTime(b.date_entretien);
            if (!d) return fail(res, 400, 'La date et l’heure de l’entretien sont requises.');

            const set = ['date_entretien = ?', 'statut = ?', 'duree_minutes = ?', 'lieu = ?'];
            const params = [d, current.statut === 'a_planifier' ? 'planifie' : current.statut, Math.max(15, intOr(b.duree_minutes, current.duree_minutes || 120)), b.lieu !== undefined ? text(b.lieu).trim() : (current.lieu || '')];
            params.push(id);
            await pgDb.run(`UPDATE hub_entretiens.entretiens SET ${set.join(', ')}, updated_at = NOW() WHERE id = ?`, params);

            const updated = await svc.getEntretienById(id);
            const campaign = await pgDb.get('SELECT * FROM hub_entretiens.campaigns WHERE id = ?', [updated.campaign_id]);
            const outlook = await svc.syncOutlook(updated, actor, campaign);
            const dateChanged = d !== svc.normalizeDateTime(current.date_entretien);
            if (dateChanged && updated.preparation_statut !== 'soumis') await svc.sendPreparationMail(updated, campaign);
            if (dateChanged) await svc.sendEvaluatorMail(updated, campaign);
            res.json({ entretien: await svc.withRelations(await svc.getEntretienById(id)), outlook });
        } catch (err) {
            console.error('[ENTRETIENS] planning:', err.message);
            fail(res, 500, err.message);
        }
    },




    // GET /api/entretiens/formations — demandes de formation de la campagne (admin, non nominatif), par direction puis service
    formationsGlobales: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const campaign = await loadCampaignOrCurrent(req.query.campaign_id);
            if (!campaign) return res.json({ campaign: null, types: [], directions: [], total: 0, analyse: null, etat: null });
            const fg = require('./formations-globales');
            const demandes = await fg.listDemandes(campaign.id);
            res.json({ simulation: await require('./simulation').isOn(), campaign, types: fg.TYPES, total: demandes.length, directions: fg.grouper(demandes), analyse: await fg.lastAnalysis(campaign.id), etat: fg.state() });
        } catch (err) { console.error('[ENTRETIENS] formationsGlobales:', err.message); fail(res, 500, err.message); }
    },

    // GET /api/entretiens/prompts — prompts de l'IA locale (administrateurs) ; PUT /api/entretiens/prompts/:id { text } — modifier / rétablir (text vide)
    listPrompts: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const P = require('./prompts');
            await P.refresh(true);
            res.json({ prompts: P.list() });
        } catch (err) { fail(res, 500, err.message); }
    },
    savePrompt: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            await require('./prompts').save(String(req.params.id), req.body?.text);
            await svc.logAudit({ actor, action: 'prompt_ia', entretien: null, details: { id: req.params.id, rétabli: !String(req.body?.text || '').trim() } });
            res.json({ ok: true, prompts: require('./prompts').list() });
        } catch (err) { fail(res, err.status || 500, err.message); }
    },

    // PUT /api/entretiens/simulation { on } — active / désactive le mode simulation (administrateurs du module)
    setSimulation: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Le mode simulation est réservé aux administrateurs du module.');
            const on = [true, 1, '1', 'true'].includes(req.body?.on);
            await require('./simulation').setOn(on, actor);
            res.json({ simulation: on });
        } catch (err) { console.error('[ENTRETIENS] setSimulation:', err.message); fail(res, 500, err.message); }
    },

    // POST /api/entretiens/simulation/reset — « Supprimer la base de simulation » : efface RDV, entretiens et contenu ; garde valideurs et lien AD
    resetSimulation: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Réservé aux administrateurs du module.');
            const sim = require('./simulation');
            if (!(await sim.isOn())) return fail(res, 409, 'Le mode simulation n’est pas actif : rien n’est supprimé (les données réelles sont protégées).');
            res.json({ ok: true, ...(await sim.resetAll(actor, req)) });
        } catch (err) { console.error('[ENTRETIENS] resetSimulation:', err.message); fail(res, 500, err.message); }
    },

    // POST /api/entretiens/formations/analyse — analyse globale par l'IA locale (tâche de fond)
    formationsAnalyse: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const campaign = await loadCampaignOrCurrent(req.body?.campaign_id);
            if (!campaign) return fail(res, 400, 'Aucune campagne.');
            res.status(202).json({ etat: require('./formations-globales').startAnalysis(campaign.id) });
        } catch (err) { fail(res, 500, err.message); }
    },

    // GET /api/entretiens/export.xlsx?campaign_id= — export Excel du suivi de la campagne (administrateurs du module)
    exportXlsx: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const campaign = await loadCampaignOrCurrent(req.query.campaign_id);
            const rows = await svc.listEntretiens({ campaignId: campaign?.id, excludeVille: true });
            const ExcelJS = require('exceljs');
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet(`Entretiens ${campaign?.annee || ''}`.trim());
            ws.columns = [
                { header: 'Agent', key: 'agent', width: 28 }, { header: 'Direction', key: 'direction', width: 30 }, { header: 'Service', key: 'service', width: 32 },
                { header: 'Évaluateur', key: 'evaluateur', width: 26 }, { header: 'Date de l’entretien', key: 'date', width: 20 },
                { header: 'Statut', key: 'statut', width: 18 }, { header: 'Préparation agent', key: 'prep', width: 18 },
                { header: 'Compte rendu', key: 'cr', width: 20 }, { header: 'Envoyé à l’agent le', key: 'envoye', width: 18 },
                { header: 'Validé par l’agent le', key: 'valide', width: 20 }, { header: 'Parapheur', key: 'para', width: 16 }, { header: 'Statut parapheur', key: 'parast', width: 16 },
            ];
            ws.getRow(1).font = { bold: true };
            ws.views = [{ state: 'frozen', ySplit: 1 }];
            const lab = (map, k) => (map[k] || k || '');
            const STATUT = { a_planifier: 'À planifier', planifie: 'Planifié', preparation_recue: 'Préparation reçue', realise: 'Réalisé', cloture: 'Clôturé' };
            const PREP = { non_commencee: 'Non commencée', brouillon: 'En cours', soumis: 'Transmise' };
            const CR = { non_envoye: 'Non envoyé', envoye_agent: 'Envoyé à l’agent', en_signature: 'En signature' };
            const PARA = { en_cours: 'En cours', termine: 'Signé', refuse: 'Refusé', annule: 'Annulé' };
            const d = (v) => (v ? new Date(v).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris' }) : '');
            for (const r of rows) {
                ws.addRow({
                    agent: svc.fullName(r.agent_prenom, r.agent_nom), direction: r.direction || '', service: r.service || '',
                    evaluateur: r.evaluator_nom || r.evaluator_email || '', date: r.date_entretien ? svc.formatDateTimeFr(r.date_entretien) : '',
                    statut: lab(STATUT, r.statut), prep: lab(PREP, r.preparation_statut), cr: lab(CR, r.crep_statut || 'non_envoye'),
                    envoye: d(r.crep_sent_at), valide: d(r.crep_agent_validated_at), para: r.crep_parapheur_ref || '', parast: lab(PARA, r.crep_parapheur_status),
                });
            }
            ws.autoFilter = { from: 'A1', to: 'L1' };
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="Entretiens-professionnels-${campaign?.annee || ''}.xlsx"`);
            await wb.xlsx.write(res);
            res.end();
        } catch (err) {
            console.error('[ENTRETIENS] exportXlsx:', err.message);
            if (!res.headersSent) fail(res, 500, err.message);
        }
    },

    // POST /api/entretiens/relances/run  { dry_run? } — déclenche les relances (administrateurs du module)
    runRelances: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const dry = req.body?.dry_run === true || req.body?.dry_run === 'true';
            res.json(await require('./entretiens-reminders').runReminders({ dryRun: dry }));
        } catch (err) {
            console.error('[ENTRETIENS] runRelances:', err.message);
            fail(res, 500, err.message);
        }
    },

    // POST /api/entretiens/:id/crep/check  { crep, ai? }
    // Vérification globale avant validation : contrôles de cohérence fiables + relecture par l'IA locale (facultative).
    crepCheck: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access || !(access.isEvaluator || access.isAdmin)) return fail(res, 403, 'Réservé à l’évaluateur de cet entretien.');
            const cdef = definitionFor(await epBase.modeleOfEntretien(row));
            const crep = normalizeCrep(req.body?.crep, cdef);
            const out = { missing: missingFields(crep, cdef), issues: coherenceIssues(crep, cdef), warnings: [gridWarning(crep, cdef)].filter(Boolean), ai: null, ai_error: null };
            // La relecture par l'IA ne s'exécute que si le module l'autorise pour cet évaluateur.
            const aiAllowed = req.body?.ai !== false && (await svc.aiAccessFor(actor, 'review')).allowed;
            if (aiAllowed) {
                try { out.ai = (await reviewCrep(summarizeCrep(crep, row, cdef))).items; }
                catch (e) { out.ai_error = e.message; }
            }
            res.json(out);
        } catch (err) {
            console.error('[ENTRETIENS] crepCheck:', err.message);
            fail(res, 500, err.message);
        }
    },


    // PUT /api/entretiens/:id/crep/agent-draft — l'agent enregistre un brouillon de ses observations
    crepAgentDraft: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access) return fail(res, 403, 'Vous n’avez pas accès à cet entretien.');
            await workflow.agentSaveDraft({ row, access, body: req.body || {} });
            await svc.logAudit({ actor, action: 'crep_observations_brouillon', entretien: row, details: {} });
            res.json({ ok: true });
        } catch (e) {
            if (e && e.status) return fail(res, e.status, e.message);
            console.error('[ENTRETIENS] crepAgentDraft:', e.message);
            fail(res, 500, e.message);
        }
    },

    // POST /api/entretiens/:id/crep/recall — l'évaluateur rappelle un compte rendu envoyé (avant validation de l'agent)
    crepRecall: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access) return fail(res, 403, 'Vous n’avez pas accès à cet entretien.');
            const mail = await workflow.recall({ row, access });
            const fresh = await svc.getEntretienById(row.id);
            const newAccess = await svc.buildAccess(actor, fresh, role.isAdmin);
            res.json({ mail, entretien: { ...(await attachParapheur(await svc.withRelations(fresh))), access: newAccess } });
        } catch (e) {
            if (e && e.status) return fail(res, e.status, e.message);
            console.error('[ENTRETIENS] crepRecall:', e.message);
            fail(res, 500, e.message);
        }
    },

    // POST /api/entretiens/:id/crep/send-to-agent — l'évaluateur transmet le compte rendu à l'agent
    crepSendToAgent: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access) return fail(res, 403, 'Vous n’avez pas accès à cet entretien.');
            const mail = await workflow.sendToAgent({ row, access });
            await svc.logAudit({ actor, action: 'crep_envoye_agent', entretien: row, details: { mail_ok: mail?.ok !== false } });
            const freshRow = await svc.getEntretienById(row.id);
            const newAccess = await svc.buildAccess(actor, freshRow, role.isAdmin);
            res.json({ mail, entretien: { ...(await attachParapheur(await svc.withRelations(freshRow))), access: newAccess } });
        } catch (e) {
            if (e && e.status) return fail(res, e.status, e.message);
            console.error('[ENTRETIENS] crepSendToAgent:', e.message);
            fail(res, 500, e.message);
        }
    },

    // POST /api/entretiens/:id/crep/agent-validate — l'agent valide : envoi au parapheur (co-signature)
    crepAgentValidate: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access) return fail(res, 403, 'Vous n’avez pas accès à cet entretien.');
            const result = await workflow.agentValidate({ row, access, body: req.body || {}, actor, req });
            await svc.logAudit({ actor, action: 'crep_valide_agent', entretien: row, details: { parapheur: result?.parapheur?.reference || '' } });
            const fresh = await svc.withRelations(await svc.getEntretienById(row.id));
            const newAccess = await svc.buildAccess(actor, await svc.getEntretienById(row.id), role.isAdmin);
            res.json({ ...result, entretien: { ...svc.forViewer(await attachParapheur(fresh), newAccess), access: newAccess } });
        } catch (e) {
            if (e && e.status) return fail(res, e.status, e.message);
            console.error('[ENTRETIENS] crepAgentValidate:', e.message);
            fail(res, 500, e.message);
        }
    },

    // GET /api/entretiens/:id/crep.pdf — PDF de 4 pages, reflet du document papier
    crepPdf: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access) return fail(res, 403, 'Vous n’avez pas accès à cet entretien.');
            if (!access.isAdmin && !access.isEvaluator && !access.isSuperieur && (!row.crep_statut || row.crep_statut === 'non_envoye')) return fail(res, 403, 'Le compte rendu ne vous a pas encore été envoyé.');
            const campaign = await pgDb.get('SELECT annee FROM hub_entretiens.campaigns WHERE id = ?', [row.campaign_id]);
            const pdf = await buildCrepPdf(row, campaign?.annee);
            const name = `CREP-${campaign?.annee || ''}-${svc.fullName(row.agent_prenom, row.agent_nom)}`.replace(/[^\w\-]+/g, '_');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${name}.pdf"`);
            res.send(pdf);
        } catch (err) {
            console.error('[ENTRETIENS] crepPdf:', err.message);
            fail(res, 500, err.message);
        }
    },

    // GET /api/entretiens/:id/crep-signe.pdf — PDF signé : version téléversée (signée sur papier) sinon PDF co-signé du parapheur
    crepSignedPdf: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access) return fail(res, 403, 'Vous n’avez pas accès à cet entretien.');
            const campaign = await pgDb.get('SELECT annee FROM hub_entretiens.campaigns WHERE id = ?', [row.campaign_id]);
            const base = `CREP-${campaign?.annee || ''}-${svc.fullName(row.agent_prenom, row.agent_nom)}`.replace(/[^\w\-]+/g, '_');
            let f = null;
            if (row.crep_signed_path) {
                f = await storage.getFileForServe(row.crep_signed_path);
            } else if (row.crep_parapheur_id) {
                const p = await pgDb.get('SELECT status FROM hub_parapheur.parapheurs WHERE id = ?', [row.crep_parapheur_id]);
                if (p?.status === 'termine') {
                    const doc = await pgDb.get('SELECT id FROM hub_parapheur.documents WHERE parapheur_id = ? AND COALESCE(is_annexe, FALSE) = FALSE ORDER BY sort_order, id LIMIT 1', [row.crep_parapheur_id]);
                    if (doc) f = await require('../parapheur/parapheur.service').getSignedDocument(row.crep_parapheur_id, doc.id, { signed: true });
                }
            }
            if (!f) return fail(res, 404, 'Aucun compte rendu signé n’est disponible pour cet entretien.');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${base}_signe.pdf"`);
            if (f.absolutePath) return res.sendFile(f.absolutePath);
            res.send(f.buffer);
        } catch (err) {
            console.error('[ENTRETIENS] crepSignedPdf:', err.message);
            fail(res, 500, err.message);
        }
    },

    // POST /api/entretiens/:id/crep/signed-upload — l'évaluateur téléverse le CREP imprimé puis signé à la main (agent sans e-mail, hors parapheur)
    crepSignedUpload: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access) return fail(res, 403, 'Vous n’avez pas accès à cet entretien.');
            if (!(access.isEvaluator || access.isAdmin)) return fail(res, 403, 'Seul l’évaluateur peut téléverser le compte rendu signé.');
            if (row.statut !== 'realise' || row.evaluation_statut !== 'soumis') return fail(res, 400, 'Validez d’abord le compte rendu : l’entretien doit être marqué « réalisé ».');
            const f = req.file;
            if (!f || !f.buffer || !f.buffer.length) return fail(res, 400, 'Aucun fichier reçu.');
            if (f.buffer.slice(0, 5).toString('latin1') !== '%PDF-') return fail(res, 400, 'Le fichier doit être un PDF.');
            if (row.crep_statut === 'en_signature') {
                const p = row.crep_parapheur_id ? await pgDb.get('SELECT status FROM hub_parapheur.parapheurs WHERE id = ?', [row.crep_parapheur_id]) : null;
                if (p && !['refuse', 'annule'].includes(p.status)) return fail(res, 409, 'Ce compte rendu est en cours de signature dans le parapheur : attendez la fin du circuit (ou annulez-le) avant de téléverser une version papier.');
            }
            if (row.crep_statut === 'envoye_agent') return fail(res, 409, 'Ce compte rendu a été envoyé à l’agent : rappelez-le d’abord pour passer par une signature papier.');
            const saved = await storage.saveFile('entretiens', row.id, { buffer: f.buffer, originalname: f.originalname || 'crep-signe.pdf' });
            const previous = row.crep_signed_path;
            await pgDb.run(
                `UPDATE hub_entretiens.entretiens SET crep_signed_path = ?, crep_signed_name = ?, crep_signed_at = NOW(), crep_signed_by = ?, crep_statut = 'signe_papier', updated_at = NOW() WHERE id = ?`,
                [saved.dbPath, f.originalname || 'crep-signe.pdf', actor.username || actor.email || '', row.id]);
            if (previous && previous !== saved.dbPath) { try { await storage.deleteFile(previous); } catch (e) { /* ancien fichier : sans conséquence */ } }
            const fresh = await svc.withRelations(await svc.getEntretienById(row.id));
            const newAccess = await svc.buildAccess(actor, await svc.getEntretienById(row.id), role.isAdmin);
            res.json({ ok: true, entretien: { ...svc.forViewer(await attachParapheur(fresh), newAccess), access: newAccess } });
        } catch (err) {
            console.error('[ENTRETIENS] crepSignedUpload:', err.message);
            fail(res, 500, err.message);
        }
    },

    // ─── Annuaire : agents du calendrier DSI ──

    // POST /api/entretiens/:id/reset - RAZ administrateur : remet l'EP à zéro (RDV, saisies, PJ, commentaires).
    resetEntretien: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'La remise à zéro est réservée aux administrateurs du module.');
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');

            const warnings = [];
            const parapheur = row.crep_parapheur_id
                ? await pgDb.get('SELECT id, status FROM hub_parapheur.parapheurs WHERE id = ?', [row.crep_parapheur_id])
                : null;
            if (parapheur?.status === 'en_cours') {
                try {
                    await require('../parapheur/parapheur.service').cancel(
                        row.crep_parapheur_id, actor.username || actor.email || 'admin', req);
                } catch (e) {
                    warnings.push('Annulation du parapheur : ' + e.message);
                }
            } else if (parapheur?.status === 'termine') {
                warnings.push('Le parapheur signé est conservé dans les archives ; seul le lien avec cet EP est supprimé.');
            }
            if (row.outlook_event_id) {
                try { await svc.removeOutlook(row); } catch (e) { warnings.push('Suppression Outlook : ' + e.message); }
            }
            if (row.crep_signed_path) {
                try { await storage.deleteFile(row.crep_signed_path); } catch (e) { warnings.push('Pièce jointe : ' + e.message); }
            }
            // Scans originaux conservés (papier signé) et analyses en cours : supprimés avec l'EP
            try {
                const scans = typeof row.crep_scans === 'string' ? JSON.parse(row.crep_scans || '[]') : (row.crep_scans || []);
                const paths = new Set((Array.isArray(scans) ? scans : []).map(s => s && s.path).filter(Boolean));
                const jobs = await pgDb.all('SELECT scan_path FROM hub_entretiens.crep_scan_jobs WHERE entretien_id = ?', [row.id]).catch(() => []);
                for (const j of jobs) if (j.scan_path) paths.add(j.scan_path);
                for (const pth of paths) { try { await storage.deleteFile(pth); } catch (e) { /* fichier déjà absent */ } }
                await pgDb.run('DELETE FROM hub_entretiens.crep_scan_jobs WHERE entretien_id = ?', [row.id]).catch(() => {});
                await pgDb.run('DELETE FROM hub_entretiens.relances WHERE entretien_id = ?', [row.id]).catch(() => {});
            } catch (e) { warnings.push('Scans originaux : ' + e.message); }
            try { await pgDb.run('DELETE FROM hub_entretiens.objectifs WHERE entretien_id = ?', [row.id]); } catch (e) { warnings.push('Objectifs : ' + e.message); }
            try { await pgDb.run('DELETE FROM hub_entretiens.formations WHERE entretien_id = ?', [row.id]); } catch (e) { warnings.push('Formations : ' + e.message); }

            await pgDb.run(
                `UPDATE hub_entretiens.entretiens SET
                    date_entretien = NULL, duree_minutes = 120, lieu = '', statut = 'a_planifier',
                    realisations = '', difficultes = '', pistes_amelioration = '', competences_a_developper = '',
                    perspectives_missions = '', perspectives_responsabilite = '', perspectives_expertise = '',
                    perspectives_projet = '', perspectives_concours = '', commentaire_agent = '',
                    preparation_statut = 'non_commencee', agent_submitted_at = NULL,
                    synthese = '', appreciation_generale = '', objectifs_suivants = '', avis_agent = '',
                    evaluation_statut = 'non_commencee', evaluator_submitted_at = NULL,
                    outlook_event_id = NULL, outlook_organizer = NULL, outlook_web_link = NULL,
                    outlook_status = 'non_planifie', outlook_error = NULL,
                    notes_admin = '', crep = NULL, crep_statut = 'non_envoye', crep_sent_at = NULL,
                    crep_agent_validated_at = NULL, crep_parapheur_id = NULL, crep_parapheur_ref = NULL,
                    crep_signed_path = NULL, crep_signed_name = NULL, crep_signed_at = NULL, crep_signed_by = NULL,
                    crep_scans = '[]'::jsonb, updated_at = NOW()
                 WHERE id = ?`, [row.id]);

            await svc.logAudit({
                actor, action: 'raz_ep', entretien: row,
                details: {
                    rdv: !!row.date_entretien, outlook: !!row.outlook_event_id, crep: !!row.crep,
                    signed_file: !!row.crep_signed_path, parapheur: row.crep_parapheur_id || null,
                    objectifs: true, formations: true, warnings,
                },
            });
            const fresh = await svc.withRelations(await svc.getEntretienById(row.id));
            const newAccess = await svc.buildAccess(actor, await svc.getEntretienById(row.id));
            res.json({ ok: true, warnings, entretien: { ...svc.forViewer(await attachParapheur(fresh), newAccess), access: newAccess } });
        } catch (err) {
            console.error('[ENTRETIENS] resetEntretien:', err.message);
            fail(res, 500, err.message);
        }
    },

    // POST /api/entretiens/:id/crep/manuscript - CREP rempli à la main : 4 pages scannées (images) ou un PDF.
    crepManuscriptUpload: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const role = await svc.resolveRole(actor);
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            if (!access) return fail(res, 403, 'Vous n’avez pas accès à cet entretien.');
            if (!(access.isEvaluator || access.isAdmin)) return fail(res, 403, 'Seul l’évaluateur peut téléverser le CREP manuscrit.');
            if (row.statut !== 'realise' || row.evaluation_statut !== 'soumis') return fail(res, 400, 'Validez d’abord le compte rendu : l’entretien doit être marqué « réalisé ».');
            if (row.crep_statut === 'en_signature') {
                const p = row.crep_parapheur_id ? await pgDb.get('SELECT status FROM hub_parapheur.parapheurs WHERE id = ?', [row.crep_parapheur_id]) : null;
                if (p && !['refuse', 'annule'].includes(p.status)) return fail(res, 409, 'Ce compte rendu est en cours de signature dans le parapheur : attendez la fin du circuit (ou annulez-le) avant de téléverser une version papier.');
            }
            if (row.crep_statut === 'envoye_agent') return fail(res, 409, 'Ce compte rendu a été envoyé à l’agent : rappelez-le d’abord pour passer par une signature papier.');
            const files = Array.isArray(req.files) ? req.files.filter(f => f && f.buffer && f.buffer.length) : [];
            if (!files.length) return fail(res, 400, 'Aucun fichier reçu.');
            if (files.length > 8) return fail(res, 400, '8 pages maximum.');

            let buffer;
            const pdfFile = files.find(f => f.buffer.slice(0, 5).toString('latin1') === '%PDF-');
            if (pdfFile) {
                buffer = pdfFile.buffer;
            } else {
                const pdf = await PDFDocument.create();
                for (const f of files) {
                    let img;
                    try {
                        if (/jpe?g/i.test(f.mimetype || '') || /\.jpe?g$/i.test(f.originalname || '')) img = await pdf.embedJpg(f.buffer);
                        else if (/png/i.test(f.mimetype || '') || /\.png$/i.test(f.originalname || '')) img = await pdf.embedPng(f.buffer);
                        else return fail(res, 400, 'Formats acceptés : PDF ou images JPG/PNG.');
                    } catch (e) { return fail(res, 400, 'Image illisible : ' + (f.originalname || '')); }
                    const page = pdf.addPage([595.28, 841.89]);
                    const scale = Math.min((595.28 - 40) / img.width, (841.89 - 40) / img.height);
                    page.drawImage(img, {
                        x: (595.28 - img.width * scale) / 2,
                        y: (841.89 - img.height * scale) / 2,
                        width: img.width * scale,
                        height: img.height * scale,
                    });
                }
                buffer = Buffer.from(await pdf.save());
            }

            const saved = await storage.saveFile('entretiens', row.id, { buffer, originalname: 'CREP-manuscrit.pdf' });
            const previous = row.crep_signed_path;
            await pgDb.run(
                `UPDATE hub_entretiens.entretiens SET crep_signed_path = ?, crep_signed_name = ?, crep_signed_at = NOW(), crep_signed_by = ?, crep_statut = 'signe_papier', updated_at = NOW() WHERE id = ?`,
                [saved.dbPath, 'CREP-manuscrit.pdf', actor.username || actor.email || '', row.id]);
            if (previous && previous !== saved.dbPath) { try { await storage.deleteFile(previous); } catch (e) { /* ancien fichier */ } }
            await svc.logAudit({ actor, action: 'crep_manuscrit', entretien: row, details: { pages: files.length } });
            const fresh = await svc.withRelations(await svc.getEntretienById(row.id));
            const newAccess = await svc.buildAccess(actor, await svc.getEntretienById(row.id), role.isAdmin);
            res.json({ ok: true, entretien: { ...svc.forViewer(await attachParapheur(fresh), newAccess), access: newAccess } });
        } catch (err) {
            console.error('[ENTRETIENS] crepManuscriptUpload:', err.message);
            fail(res, 500, err.message);
        }
    },

    // GET /api/entretiens/directory
    // Renvoie les agents DSI (hub_calendrier.agents_dsi) : agents évalués ET évaluateurs possibles.
    directory: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            res.json(await loadDirectory());
        } catch (err) { fail(res, 500, err.message); }
    },


    // POST /api/entretiens/free-slots
    // Prochains créneaux libres communs à l'agent évalué et à l'évaluateur (même moteur que le module Réunions).
    freeSlots: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            // Administrateurs du module ET évaluateurs (qui prennent eux-mêmes leurs rendez-vous).
            const role = await svc.resolveRole(actor);
            if (!role.isAdmin && !role.isEvaluator) return fail(res, 403, 'Accès réservé aux administrateurs du module et aux évaluateurs.');
            const { participants, duree_minutes, after_hours, strict, horizon_jours, apres } = req.body || {};
            if (!actor.email) return fail(res, 400, 'Aucune adresse email associée à votre compte.');
            const parts = (Array.isArray(participants) ? participants : [])
                .filter(p => p && p.email && String(p.email).includes('@'))
                .map(p => ({ email: p.email, name: p.name || p.email }));
            if (parts.length === 0) return fail(res, 400, 'Choisissez d’abord l’agent et l’évaluateur (adresse e-mail requise).');

            const { findCommonSlots } = require('../rencontres/outlook.service');
            const slots = await findCommonSlots({
                organizerEmail: actor.email,
                participants: parts,
                includeOrganizer: false,
                durationMinutes: parseInt(duree_minutes, 10) || 120,
                afterHours: !!after_hours,
                strict: strict !== false,
                after: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(apres || '') ? String(apres).slice(0, 16) : null,
                horizonDays: [30, 61, 91, 183, 365].includes(parseInt(horizon_jours, 10)) ? parseInt(horizon_jours, 10) : 30,
                count: 5,
            });
            res.json({ slots });
        } catch (err) {
            console.error('[ENTRETIENS] freeSlots:', err.message);
            fail(res, 500, err.message);
        }
    },

    // ─── Outlook : renvoyer / resynchroniser l'invitation ───────────────

    // POST /api/entretiens/print/crep  { ids: number[], mode: 'blank'|'filled' }
    // Impression individuelle ou en masse des CREP / EP (PDF fusionné).
    printCrep: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const role = await svc.resolveRole(actor);
            const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(n => Number.isFinite(n) && n > 0))];
            if (!ids.length) return fail(res, 400, 'Sélectionnez au moins un entretien.');
            if (ids.length > 200) return fail(res, 400, 'Sélectionnez au plus 200 entretiens à la fois.');
            const blank = req.body?.mode === 'blank';
            const buffers = [];
            for (const id of ids) {
                const row = await svc.getEntretienById(id);
                if (!row) continue;
                const access = await svc.buildAccess(actor, row, role.isAdmin);
                if (!access) return fail(res, 403, `Vous n’avez pas accès à l’entretien de ${svc.fullName(row.agent_prenom, row.agent_nom)}.`);
                const campaign = await pgDb.get('SELECT annee FROM hub_entretiens.campaigns WHERE id = ?', [row.campaign_id]);
                buffers.push(await buildCrepPdf(blank ? { ...row, crep: null, crep_sent_at: null, crep_agent_validated_at: null } : row, campaign?.annee));
                await svc.logAudit({ actor, action: blank ? 'impression_crep_vierge' : 'impression_crep', entretien: row, details: { mode: blank ? 'blank' : 'filled' } });
            }
            if (!buffers.length) return fail(res, 404, 'Aucun entretien à imprimer.');
            const pdf = await mergePdfBuffers(buffers);
            const name = `CREP-${blank ? 'vierges' : 'renseignes'}-${new Date().toISOString().slice(0, 10)}.pdf`;
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `inline; filename="${name}"`);
            res.send(Buffer.from(pdf));
        } catch (err) {
            console.error('[ENTRETIENS] printCrep:', err.message);
            fail(res, 500, err.message);
        }
    },

    // GET /api/entretiens/evaluateur/sans-evaluateur?q=
    listUnassigned: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const role = await svc.resolveRole(actor);
            const myMatricule = (!role.isAdmin && !role.isEvaluator) ? await epBase.meMatricule(actor) : '';
            if (!role.isAdmin && !role.isEvaluator && !myMatricule) return fail(res, 403, 'Accès réservé aux évaluateurs et aux valideurs.');
            const campaign = await loadCampaignOrCurrent(req.query.campaign_id);
            if (!campaign) return res.json({ campaign: null, items: [] });
            const q = text(req.query.q).trim().toLowerCase();
            const direction = !role.isAdmin ? await baseDirectionOf(actor) : '';
            if (!role.isAdmin && !direction && !q) return res.json({ campaign, items: [] });
            const params = [campaign.id];
            let where = `e.deleted_at IS NULL AND e.campaign_id = ?
                AND COALESCE(e.evaluator_email, '') = '' AND COALESCE(e.evaluator_username, '') = ''`;
            // Par défaut : uniquement ma direction. Dès qu'une recherche est saisie, on cherche
            // parmi tous les agents sans entretien (nom, e-mail, service).
            if (direction && !q) {
                where += ` AND (e.direction = ? OR EXISTS (
                    SELECT 1 FROM hub_entretiens.base_agents b
                    WHERE b.matricule = e.agent_matricule AND b.direction = ?))`;
                params.push(direction, direction);
            }
            const rows = await pgDb.all(
                `SELECT e.* FROM hub_entretiens.entretiens e
                 WHERE ${where}
                 ORDER BY LOWER(e.agent_nom), LOWER(e.agent_prenom)`, params);
            let items = rows || [];
            if (q) items = items.filter(r => `${r.agent_prenom || ''} ${r.agent_nom || ''} ${r.agent_email || ''} ${r.service || ''} ${r.direction || ''}`.toLowerCase().includes(q));
            res.json({ campaign, items });
        } catch (err) {
            console.error('[ENTRETIENS] listUnassigned:', err.message);
            fail(res, 500, err.message);
        }
    },

    // POST /api/entretiens/evaluateur/agents/:id/claim - un valideur prend en charge un agent sans évaluateur.
    claimAgent: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const role = await svc.resolveRole(actor);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            if (row.evaluator_email || row.evaluator_username) return fail(res, 409, 'Cet entretien a déjà un évaluateur.');
            const matricule = await epBase.meMatricule(actor);
            if (!role.isAdmin) {
                if (!matricule) return fail(res, 403, 'Vous n’êtes pas reconnu comme valideur dans la base des agents.');
            }
            const evaluatorName = actor.displayName || actor.username || actor.email || 'Évaluateur';
            if (matricule && row.agent_matricule) {
                try { await epBase.setValideurAndSync(row.agent_matricule, matricule, actor); } catch (e) { console.warn('[ENTRETIENS] claim valideur:', e.message); }
            }
            await pgDb.run(
                `UPDATE hub_entretiens.entretiens
                 SET evaluator_username = ?, evaluator_email = ?, evaluator_nom = ?, updated_at = NOW()
                 WHERE id = ?`,
                [actor.username || '', actor.email || '', evaluatorName, row.id]
            );
            await svc.logAudit({ actor, action: 'agent_ajoute', entretien: row, details: { evaluator: evaluatorName, matricule } });
            await refreshAfterChange(row.id, actor, 'evaluateur');
            res.json({ entretien: await svc.withRelations(await svc.getEntretienById(row.id)) });
        } catch (err) {
            console.error('[ENTRETIENS] claimAgent:', err.message);
            fail(res, 500, err.message);
        }
    },

    // GET /api/entretiens/:id/evaluator-candidates
    evaluatorCandidates: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const role = await svc.resolveRole(actor);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            const unassigned = !row.evaluator_email && !row.evaluator_username;
            const baseValideur = unassigned ? !!(await epBase.meValideur(actor).catch(() => ({ isValideur: false }))).isValideur : false;
            const manager = !!(access && (access.isEvaluator || access.isSuperieur || access.isAdmin))
                || await canManageUnassigned(actor, row)
                || (unassigned && (role.isEvaluator || baseValideur));
            if (!manager) return fail(res, 403, 'Réservé à l’évaluateur, à son valideur ou à un administrateur.');
            const candidates = await epBase.candidatesForAgent(row.agent_matricule || '', { all: true });
            res.json({ candidates, current: { username: row.evaluator_username || '', email: row.evaluator_email || '', nom: row.evaluator_nom || '' } });
        } catch (err) { fail(res, 500, err.message); }
    },

    // POST /api/entretiens/:id/reassign-evaluator  { evaluator_matricule }
    reassignEvaluator: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const role = await svc.resolveRole(actor);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            const unassigned = !row.evaluator_email && !row.evaluator_username;
            const baseValideur = unassigned ? !!(await epBase.meValideur(actor).catch(() => ({ isValideur: false }))).isValideur : false;
            const manager = !!(access && (access.isEvaluator || access.isSuperieur || access.isAdmin))
                || await canManageUnassigned(actor, row)
                || (unassigned && (role.isEvaluator || baseValideur));
            if (!manager) return fail(res, 403, 'Réservé à l’évaluateur, à son valideur ou à un administrateur.');
            if (row.crep_statut === 'en_signature') return fail(res, 409, 'Le compte rendu est en cours de signature dans le parapheur avec l’évaluateur actuel : attendez la fin du circuit (ou faites annuler le parapheur par un administrateur) avant de changer d’évaluateur.');
            const matricule = text(req.body?.evaluator_matricule).trim();
            if (!matricule) return fail(res, 400, 'Choisissez le nouvel évaluateur.');
            if (String(matricule) === String(row.agent_matricule)) return fail(res, 400, 'Un agent ne peut pas être son propre évaluateur.');
            const candidates = await epBase.candidatesForAgent(row.agent_matricule || '', { all: true });
            const chosen = candidates.find(c => String(c.matricule) === String(matricule));
            if (!chosen) return fail(res, 400, 'Cet agent ne fait pas partie des évaluateurs possibles pour cet entretien.');
            const evaluator = await pgDb.get('SELECT matricule, nom_prenom, email, ad_username FROM hub_entretiens.base_agents WHERE matricule = ?', [matricule]);
            if (!evaluator) return fail(res, 404, 'Évaluateur introuvable dans la base des agents.');
            const oldName = row.evaluator_nom || row.evaluator_email || '';
            if (row.agent_matricule) {
                try { await epBase.setValideurAndSync(row.agent_matricule, matricule, actor); } catch (e) { console.warn('[ENTRETIENS] reassign valideur:', e.message); }
            }
            await pgDb.run(
                `UPDATE hub_entretiens.entretiens
                 SET evaluator_username = ?, evaluator_email = ?, evaluator_nom = ?, updated_at = NOW()
                 WHERE id = ?`,
                [evaluator.ad_username || '', evaluator.email || '', evaluator.nom_prenom || '', row.id]
            );
            await svc.logAudit({
                actor, action: 'evaluateur_change', entretien: row,
                details: { ancien: oldName, nouveau: evaluator.nom_prenom || '', matricule },
            });
            await refreshAfterChange(row.id, actor, 'evaluateur');
            res.json({ entretien: await svc.withRelations(await svc.getEntretienById(row.id)) });
        } catch (err) {
            console.error('[ENTRETIENS] reassignEvaluator:', err.message);
            fail(res, 500, err.message);
        }
    },

    // POST /api/entretiens/:id/link-ad  { username } - rattache le compte AD de l'agent (e-mail, login).
    linkAgentAd: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const role = await svc.resolveRole(actor);
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const access = await svc.buildAccess(actor, row, role.isAdmin);
            const unassigned = !row.evaluator_email && !row.evaluator_username;
            const baseValideur = unassigned ? !!(await epBase.meValideur(actor).catch(() => ({ isValideur: false }))).isValideur : false;
            const manager = !!(access && (access.isEvaluator || access.isSuperieur || access.isAdmin))
                || await canManageUnassigned(actor, row)
                || (unassigned && (role.isEvaluator || baseValideur));
            if (!manager) return fail(res, 403, 'Réservé à l’évaluateur, à son valideur ou à un administrateur.');
            if (!row.agent_matricule) return fail(res, 400, 'Cet agent n’est pas rattaché à la base des agents : impossible de lier un compte AD.');
            const username = text(req.body?.username).trim();
            if (!username) return fail(res, 400, 'Choisissez un compte AD.');
            const linked = await epBase.linkAd(row.agent_matricule, username);
            await pgDb.run(
                `UPDATE hub_entretiens.entretiens SET agent_email = ?, agent_username = ?, updated_at = NOW() WHERE id = ?`,
                [linked?.email || '', linked?.username || username, row.id]
            );
            await svc.logAudit({
                actor, action: 'agent_ad_lie', entretien: row,
                details: { username: linked?.username || username, email: linked?.email || '' },
            });
            if (linked?.email) await refreshAfterChange(row.id, actor, 'agent');
            res.json({ entretien: await svc.withRelations(await svc.getEntretienById(row.id)) });
        } catch (err) {
            if (err && err.status) return fail(res, err.status, err.message);
            console.error('[ENTRETIENS] linkAgentAd:', err.message);
            fail(res, 500, err.message);
        }
    },

    // GET /api/entretiens/audit-logs?limit=300
    auditLogs: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            res.json(await svc.listAuditLogs(req.query || {}));
        } catch (err) { fail(res, 500, err.message); }
    },

    resyncOutlook: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor))) return fail(res, 403, 'Accès réservé aux administrateurs du module.');
            const row = await svc.getEntretienById(Number(req.params.id));
            if (!row) return fail(res, 404, 'Entretien introuvable.');
            const campaign = await pgDb.get('SELECT * FROM hub_entretiens.campaigns WHERE id = ?', [row.campaign_id]);
            const forceCreate = req.body?.force_create === true || req.body?.force_create === 'true';
            const outlook = await svc.syncOutlook(row, actor, campaign, { forceCreate });
            const prepMail = row.date_entretien ? await svc.sendPreparationMail(row, campaign) : null;
            res.json({ outlook, prepMail, entretien: await svc.withRelations(await svc.getEntretienById(row.id)) });
        } catch (err) { fail(res, 500, err.message); }
    },
};

module.exports = entretiensController;
