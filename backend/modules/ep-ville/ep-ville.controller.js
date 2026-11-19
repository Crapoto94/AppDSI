/**
 * Entretiens professionnels — version « Ville » (MagApp).
 *
 * Principe repris du module EP du DSI Hub (mêmes tables `hub_entretiens`, mêmes formulaires de préparation / compte rendu),
 * avec trois différences :
 *  - les administrateurs de l'application ne font que DÉSIGNER des valideurs (directeurs, DGA, DG) : ils n'ont pas accès
 *    au contenu des EP ;
 *  - chaque valideur choisit les agents dont il valide l'EP (proposition issue de son périmètre RH, ou n'importe quel agent) ;
 *    un agent n'a qu'un seul valideur (unicité du matricule dans `rattachements`) ;
 *  - les agents viennent de l'API SEDIT RH (matricule, grade, direction, service), pas de l'AD : beaucoup n'ont pas d'e-mail,
 *    et un agent peut aussi être saisi à la volée.
 *
 * Le valideur est enregistré comme évaluateur (`evaluator_username`) de chaque EP : la préparation, l'évaluation, le compte
 * rendu et le PDF passent donc par les routes existantes `/api/entretiens/:id/...`, dont les droits d'accès sont inchangés.
 */
const { pgDb } = require('../../shared/database');
const svc = require('../entretiens/entretiens.service');
const sedit = require('../../shared/sedit-rh');

const text = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const NIVEAUX = ['direction', 'dga', 'dg'];

function fail(res, status, message, extra) { return res.status(status).json({ message, ...(extra || {}) }); }
function handle(res, tag, err) {
    if (err instanceof sedit.SeditError) return fail(res, err.status === 404 ? 404 : 502, err.message);
    if (err && err.status) return fail(res, err.status, err.message);
    console.error(`[EP-VILLE] ${tag}:`, err.message);
    return fail(res, 500, err.message);
}
const httpError = (status, message) => Object.assign(new Error(message), { status });

const dirName = (v) => (v ? `${v.display_name || v.username}` : '');

// ─── Identités ──────────────────────────────────────────────────────────────

async function getValideur(actor) {
    const clauses = []; const params = [];
    if (actor.username) { clauses.push('LOWER(username) = LOWER(?)'); params.push(actor.username); }
    if (actor.email) { clauses.push('LOWER(email) = LOWER(?)'); params.push(actor.email); }
    if (!clauses.length) return null;
    return (await pgDb.get(`SELECT * FROM hub_entretiens.valideurs WHERE ${clauses.join(' OR ')} LIMIT 1`, params)) || null;
}

async function requireAdmin(req) {
    const actor = await svc.getActor(req);
    if (!(await svc.isEpAdmin(actor))) throw httpError(403, 'Accès réservé aux administrateurs de l’application.');
    return actor;
}
async function requireValideur(req) {
    const actor = await svc.getActor(req);
    const valideur = await getValideur(actor);
    if (!valideur) throw httpError(403, 'Vous n’avez pas été désigné valideur des entretiens professionnels.');
    return { actor, valideur };
}

/** Compte AppDSI correspondant à un agent SEDIT RH : par identifiant imposé, sinon par nom (un seul compte plausible). */
async function findAccount(agent, username) {
    if (username) {
        const u = await pgDb.get('SELECT username, email, displayName AS "displayName" FROM hub.users WHERE LOWER(username) = LOWER(?)', [username]);
        return u || null;
    }
    const nom = text(agent.nom).split(/\s+/)[0];
    if (!nom) return null;
    const rows = await pgDb.all('SELECT username, email, displayName AS "displayName" FROM hub.users WHERE displayName ILIKE ? LIMIT 50', [`%${nom}%`]);
    const key = svc.tokenKey(`${agent.prenom} ${agent.nom}`);
    const hits = rows.filter(r => svc.tokenKey(r.displayName) === key);
    return hits.length === 1 ? hits[0] : null;
}

// ─── Entretiens des agents rattachés ────────────────────────────────────────

/** Crée (si absent) l'EP de la campagne en cours pour un agent rattaché ; l'évaluateur est son valideur. */
async function ensureEntretien(rat, valideur, campaign, actorName) {
    if (!campaign) return null;
    const existing = await pgDb.get(
        'SELECT id FROM hub_entretiens.entretiens WHERE campaign_id = ? AND rattachement_id = ? AND deleted_at IS NULL', [campaign.id, rat.id]);
    if (existing) return existing.id;
    const r = await pgDb.run(
        `INSERT INTO hub_entretiens.entretiens
           (campaign_id, agent_username, agent_email, agent_nom, agent_prenom, direction, service, poste,
            agent_matricule, agent_grade, rattachement_id, source,
            evaluator_username, evaluator_email, evaluator_nom, statut, created_by)
         VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ville', ?, ?, ?, 'a_planifier', ?)`,
        [campaign.id, rat.agent_email || '', rat.agent_nom, rat.agent_prenom || '', rat.direction || '', rat.service || '', rat.poste || '',
            rat.agent_matricule || '', rat.agent_grade || '', rat.id,
            valideur.username, (valideur.email || '').toLowerCase(), valideur.display_name || valideur.username, actorName || null]);
    return r.lastID;
}

/** L'EP d'un agent suit son valideur (changement de valideur par l'administrateur). */
async function moveEntretiens(ratId, valideur) {
    await pgDb.run(
        `UPDATE hub_entretiens.entretiens SET evaluator_username = ?, evaluator_email = ?, evaluator_nom = ?, updated_at = NOW()
         WHERE rattachement_id = ? AND deleted_at IS NULL AND statut <> 'cloture'`,
        [valideur.username, (valideur.email || '').toLowerCase(), valideur.display_name || valideur.username, ratId]);
}

const rattachementView = (r, ent) => ({
    id: r.id, matricule: r.agent_matricule || '', nom: r.agent_nom, prenom: r.agent_prenom, grade: r.agent_grade,
    email: r.agent_email, direction: r.direction, service: r.service, poste: r.poste, saisi_a_la_volee: !!r.saisi_a_la_volee,
    entretien: ent || null,
});

const controller = {

    // GET /api/ep-ville/me
    me: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const [isAdmin, valideur, campaign] = await Promise.all([svc.isEpAdmin(actor), getValideur(actor), svc.getCurrentCampaign()]);
            res.json({ isAdmin, isValideur: !!valideur, valideur, campaign, sedit_configured: sedit.configured() });
        } catch (e) { handle(res, 'me', e); }
    },

    // ─── Référentiel SEDIT RH ───────────────────────────────────────────

    // GET /api/ep-ville/rh/agents?q= — recherche de n'importe quel agent en poste (administrateurs et valideurs)
    rhSearch: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor)) && !(await getValideur(actor))) throw httpError(403, 'Accès refusé.');
            const agents = await sedit.searchAgents(req.query.q, 20);
            const rats = agents.length
                ? await pgDb.all(`SELECT r.agent_matricule, v.display_name, v.username FROM hub_entretiens.rattachements r
                                  JOIN hub_entretiens.valideurs v ON v.id = r.valideur_id
                                  WHERE r.agent_matricule IN (${agents.map(() => '?').join(',')})`, agents.map(a => a.matricule))
                : [];
            const by = new Map(rats.map(r => [r.agent_matricule, r.display_name || r.username]));
            res.json({ agents: agents.map(a => ({ ...a, valideur: by.get(a.matricule) || null })) });
        } catch (e) { handle(res, 'rhSearch', e); }
    },

    // GET /api/ep-ville/rh/candidats — directeurs / DGA / DG en poste (administrateurs)
    rhCandidats: async (req, res) => {
        try {
            await requireAdmin(req);
            res.json({ agents: await sedit.candidatsValideurs() });
        } catch (e) { handle(res, 'rhCandidats', e); }
    },

    // GET /api/ep-ville/rh/directions
    rhDirections: async (req, res) => {
        try {
            await requireAdmin(req);
            res.json({ directions: await sedit.directions() });
        } catch (e) { handle(res, 'rhDirections', e); }
    },

    // ─── Administration : désignation des valideurs ─────────────────────

    // GET /api/ep-ville/valideurs — uniquement des effectifs, jamais le contenu des EP
    listValideurs: async (req, res) => {
        try {
            await requireAdmin(req);
            const rows = await pgDb.all(
                `SELECT v.*, (SELECT COUNT(*) FROM hub_entretiens.rattachements r WHERE r.valideur_id = v.id)::int AS nb_agents
                 FROM hub_entretiens.valideurs v ORDER BY v.niveau, LOWER(v.display_name)`);
            res.json({ valideurs: rows });
        } catch (e) { handle(res, 'listValideurs', e); }
    },

    // POST /api/ep-ville/valideurs { matricule, niveau, username?, directions? }
    addValideur: async (req, res) => {
        try {
            const actor = await requireAdmin(req);
            const b = req.body || {};
            const niveau = NIVEAUX.includes(b.niveau) ? b.niveau : 'direction';
            const agent = await sedit.getAgent(b.matricule);
            if (!agent) throw httpError(404, 'Agent introuvable dans SEDIT RH.');
            const account = await findAccount(agent, text(b.username));
            if (!account) {
                return fail(res, 422, `Aucun compte unique trouvé pour ${agent.prenom} ${agent.nom} : indiquez son identifiant de connexion.`, { need_username: true });
            }
            let directions = Array.isArray(b.directions) ? b.directions.map(text).filter(Boolean) : [];
            if (!directions.length && agent.direction_code) directions = [agent.direction_code];
            const dup = await pgDb.get('SELECT id FROM hub_entretiens.valideurs WHERE LOWER(username) = LOWER(?)', [account.username]);
            if (dup) throw httpError(409, 'Cet agent est déjà valideur.');
            const r = await pgDb.run(
                `INSERT INTO hub_entretiens.valideurs (username, email, display_name, matricule, grade, niveau, direction_code, direction_libelle, directions, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?)`,
                [account.username, account.email || '', `${agent.prenom} ${agent.nom}`.trim(), agent.matricule, agent.grade, niveau,
                    agent.direction_code, agent.direction, JSON.stringify(directions), actor.username || null]);
            res.status(201).json({ valideur: await pgDb.get('SELECT * FROM hub_entretiens.valideurs WHERE id = ?', [r.lastID]) });
        } catch (e) {
            if (e.code === '23505') return fail(res, 409, 'Cet agent est déjà valideur.');
            handle(res, 'addValideur', e);
        }
    },

    // PUT /api/ep-ville/valideurs/:id { niveau?, directions? }
    updateValideur: async (req, res) => {
        try {
            await requireAdmin(req);
            const b = req.body || {};
            const set = []; const params = [];
            if (b.niveau !== undefined) { if (!NIVEAUX.includes(b.niveau)) throw httpError(400, 'Niveau invalide.'); set.push('niveau = ?'); params.push(b.niveau); }
            if (b.directions !== undefined) { set.push('directions = CAST(? AS jsonb)'); params.push(JSON.stringify((Array.isArray(b.directions) ? b.directions : []).map(text).filter(Boolean))); }
            if (!set.length) throw httpError(400, 'Aucune modification fournie.');
            params.push(Number(req.params.id));
            await pgDb.run(`UPDATE hub_entretiens.valideurs SET ${set.join(', ')} WHERE id = ?`, params);
            res.json({ valideur: await pgDb.get('SELECT * FROM hub_entretiens.valideurs WHERE id = ?', [Number(req.params.id)]) });
        } catch (e) { handle(res, 'updateValideur', e); }
    },

    // DELETE /api/ep-ville/valideurs/:id — refusé tant que des EP ont démarré (réaffecter d'abord les agents)
    removeValideur: async (req, res) => {
        try {
            await requireAdmin(req);
            const id = Number(req.params.id);
            const started = await pgDb.get(
                `SELECT COUNT(*)::int AS n FROM hub_entretiens.entretiens e
                 JOIN hub_entretiens.rattachements r ON r.id = e.rattachement_id
                 WHERE r.valideur_id = ? AND e.deleted_at IS NULL
                   AND (e.statut <> 'a_planifier' OR e.preparation_statut <> 'non_commencee' OR e.evaluation_statut <> 'non_commencee')`, [id]);
            if (Number(started?.n) > 0) {
                throw httpError(409, `Ce valideur a ${started.n} entretien(s) commencé(s) : réaffectez d’abord ses agents à un autre valideur.`);
            }
            await pgDb.run(
                `UPDATE hub_entretiens.entretiens SET deleted_at = NOW(), deleted_by = 'suppression valideur'
                 WHERE deleted_at IS NULL AND rattachement_id IN (SELECT id FROM hub_entretiens.rattachements WHERE valideur_id = ?)`, [id]);
            await pgDb.run('DELETE FROM hub_entretiens.valideurs WHERE id = ?', [id]);
            res.json({ message: 'Valideur retiré.' });
        } catch (e) { handle(res, 'removeValideur', e); }
    },

    // GET /api/ep-ville/valideurs/:id/agents — qui valide qui (identité et valideur uniquement)
    valideurAgents: async (req, res) => {
        try {
            await requireAdmin(req);
            const rows = await pgDb.all('SELECT * FROM hub_entretiens.rattachements WHERE valideur_id = ? ORDER BY LOWER(agent_nom), LOWER(agent_prenom)', [Number(req.params.id)]);
            res.json({ agents: rows.map(r => rattachementView(r)) });
        } catch (e) { handle(res, 'valideurAgents', e); }
    },

    // PUT /api/ep-ville/rattachements/:id { valideur_id } — l'administrateur change le valideur d'un agent
    reassign: async (req, res) => {
        try {
            await requireAdmin(req);
            const rat = await pgDb.get('SELECT * FROM hub_entretiens.rattachements WHERE id = ?', [Number(req.params.id)]);
            if (!rat) throw httpError(404, 'Rattachement introuvable.');
            const target = await pgDb.get('SELECT * FROM hub_entretiens.valideurs WHERE id = ?', [Number(req.body?.valideur_id)]);
            if (!target) throw httpError(404, 'Valideur introuvable.');
            await pgDb.run('UPDATE hub_entretiens.rattachements SET valideur_id = ? WHERE id = ?', [target.id, rat.id]);
            await moveEntretiens(rat.id, target);
            res.json({ message: 'Agent réaffecté.' });
        } catch (e) { handle(res, 'reassign', e); }
    },

    // ─── Espace valideur ────────────────────────────────────────────────

    // GET /api/ep-ville/mon-perimetre — agents en poste de ses directions, avec leur éventuel valideur
    monPerimetre: async (req, res) => {
        try {
            const { valideur } = await requireValideur(req);
            const dirs = Array.isArray(valideur.directions) && valideur.directions.length ? valideur.directions : [valideur.direction_code];
            let agents = await sedit.agentsOfDirections(dirs);
            // Niveau DGA / DG : en plus de leurs directions, les directeurs de la collectivité sont proposés.
            if (valideur.niveau !== 'direction') {
                const dirigeants = await sedit.candidatsValideurs();
                const seen = new Set(agents.map(a => a.matricule));
                agents = agents.concat(dirigeants.filter(a => !seen.has(a.matricule)));
            }
            agents = agents.filter(a => a.matricule !== valideur.matricule);
            const rats = await pgDb.all(
                `SELECT r.agent_matricule, r.valideur_id, v.display_name, v.username FROM hub_entretiens.rattachements r
                 JOIN hub_entretiens.valideurs v ON v.id = r.valideur_id WHERE r.agent_matricule <> ''`);
            const by = new Map(rats.map(r => [r.agent_matricule, r]));
            res.json({
                directions: dirs,
                agents: agents.map(a => {
                    const r = by.get(a.matricule);
                    return { ...a, valideur: r ? dirName(r) : null, mien: !!r && r.valideur_id === valideur.id };
                }),
            });
        } catch (e) { handle(res, 'monPerimetre', e); }
    },

    // GET /api/ep-ville/mes-agents — mes agents et leur EP de la campagne en cours (créé au besoin)
    mesAgents: async (req, res) => {
        try {
            const { actor, valideur } = await requireValideur(req);
            const campaign = await svc.getCurrentCampaign();
            const rats = await pgDb.all('SELECT * FROM hub_entretiens.rattachements WHERE valideur_id = ? ORDER BY LOWER(agent_nom), LOWER(agent_prenom)', [valideur.id]);
            const out = [];
            for (const rat of rats) {
                const id = await ensureEntretien(rat, valideur, campaign, actor.username);
                const ent = id ? await pgDb.get(
                    `SELECT id, statut, date_entretien, lieu, preparation_statut, evaluation_statut, crep_statut FROM hub_entretiens.entretiens WHERE id = ?`, [id]) : null;
                out.push(rattachementView(rat, ent ? { ...ent, date_entretien_label: svc.formatDateTimeFr(ent.date_entretien) } : null));
            }
            res.json({ campaign, valideur, agents: out });
        } catch (e) { handle(res, 'mesAgents', e); }
    },

    // POST /api/ep-ville/mes-agents { matricules?: [], libres?: [{nom, prenom, grade, direction, service, poste, email}] }
    addAgents: async (req, res) => {
        try {
            const { actor, valideur } = await requireValideur(req);
            const campaign = await svc.getCurrentCampaign();
            const b = req.body || {};
            const added = []; const conflits = []; const erreurs = [];

            for (const m of [...new Set((Array.isArray(b.matricules) ? b.matricules : []).map(text).filter(Boolean))]) {
                const agent = await sedit.getAgent(m);
                if (!agent) { erreurs.push({ matricule: m, message: 'Introuvable dans SEDIT RH' }); continue; }
                const nom = `${agent.prenom} ${agent.nom}`.trim();
                const exist = await pgDb.get(
                    `SELECT r.id, r.valideur_id, v.display_name, v.username FROM hub_entretiens.rattachements r
                     JOIN hub_entretiens.valideurs v ON v.id = r.valideur_id WHERE r.agent_matricule = ?`, [agent.matricule]);
                if (exist) {
                    if (exist.valideur_id !== valideur.id) conflits.push({ matricule: m, agent: nom, valideur: dirName(exist) });
                    continue;
                }
                const r = await pgDb.run(
                    `INSERT INTO hub_entretiens.rattachements (valideur_id, agent_matricule, agent_nom, agent_prenom, agent_grade, direction, service, poste, created_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [valideur.id, agent.matricule, agent.nom, agent.prenom, agent.grade, agent.direction, agent.service, agent.poste, actor.username || null]);
                added.push(nom);
                await ensureEntretien({ id: r.lastID, agent_matricule: agent.matricule, agent_nom: agent.nom, agent_prenom: agent.prenom, agent_grade: agent.grade,
                    agent_email: '', direction: agent.direction, service: agent.service, poste: agent.poste }, valideur, campaign, actor.username);
            }

            for (const l of (Array.isArray(b.libres) ? b.libres : [])) {
                const nom = text(l.nom).toUpperCase(); const prenom = text(l.prenom);
                if (!nom) { erreurs.push({ message: 'Le nom de l’agent est requis' }); continue; }
                const email = text(l.email).toLowerCase();
                if (email && !svc.isEmail(email)) { erreurs.push({ agent: nom, message: 'Adresse e-mail invalide' }); continue; }
                const row = { agent_matricule: '', agent_nom: nom, agent_prenom: prenom, agent_grade: text(l.grade), agent_email: email,
                    direction: text(l.direction) || valideur.direction_libelle || '', service: text(l.service), poste: text(l.poste) };
                const r = await pgDb.run(
                    `INSERT INTO hub_entretiens.rattachements (valideur_id, agent_matricule, agent_nom, agent_prenom, agent_grade, agent_email, direction, service, poste, saisi_a_la_volee, created_by)
                     VALUES (?, '', ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
                    [valideur.id, row.agent_nom, row.agent_prenom, row.agent_grade, row.agent_email, row.direction, row.service, row.poste, actor.username || null]);
                added.push(`${prenom} ${nom}`.trim());
                await ensureEntretien({ id: r.lastID, ...row }, valideur, campaign, actor.username);
            }
            res.status(added.length ? 201 : 200).json({ added, conflits, erreurs });
        } catch (e) {
            if (e.code === '23505') return fail(res, 409, 'Cet agent a déjà un valideur.');
            handle(res, 'addAgents', e);
        }
    },

    // DELETE /api/ep-ville/mes-agents/:id — retire l'agent de ma liste (refusé si son EP a démarré)
    removeAgent: async (req, res) => {
        try {
            const { valideur } = await requireValideur(req);
            const id = Number(req.params.id);
            const rat = await pgDb.get('SELECT * FROM hub_entretiens.rattachements WHERE id = ? AND valideur_id = ?', [id, valideur.id]);
            if (!rat) throw httpError(404, 'Agent introuvable dans votre liste.');
            const started = await pgDb.get(
                `SELECT COUNT(*)::int AS n FROM hub_entretiens.entretiens
                 WHERE rattachement_id = ? AND deleted_at IS NULL
                   AND (statut <> 'a_planifier' OR preparation_statut <> 'non_commencee' OR evaluation_statut <> 'non_commencee')`, [id]);
            if (Number(started?.n) > 0) throw httpError(409, 'L’entretien de cet agent a déjà démarré : demandez à un administrateur de le réaffecter.');
            await pgDb.run(`UPDATE hub_entretiens.entretiens SET deleted_at = NOW(), deleted_by = ? WHERE rattachement_id = ? AND deleted_at IS NULL`, [valideur.username, id]);
            await pgDb.run('DELETE FROM hub_entretiens.rattachements WHERE id = ?', [id]);
            res.json({ message: 'Agent retiré de votre liste.' });
        } catch (e) { handle(res, 'removeAgent', e); }
    },
};

module.exports = controller;
