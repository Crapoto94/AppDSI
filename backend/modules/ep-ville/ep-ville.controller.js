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
const hierarchy = require('./ep-ville.hierarchy');
const adHelper = require('../../shared/ad_helper');

const text = (v) => (v === null || v === undefined ? '' : String(v)).trim();
const NIVEAUX = ['direction', 'dga', 'dg'];

function fail(res, status, message, extra) { return res.status(status).json({ message, ...(extra || {}) }); }
function handle(res, tag, err) {
    if (err instanceof sedit.SeditError) return fail(res, err.status === 404 ? 404 : 502, err.message);
    if (err && err.status) return fail(res, err.status, err.message);
    console.error(`[EP-VILLE] ${tag}:`, err.message);
    return fail(res, 500, err.message);
}
const fullName = (a) => ((a.agent_prenom ? a.agent_prenom + ' ' : '') + (a.agent_nom || '')).trim();
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

/** Paramètres AD actifs (SQLite), ou null. */
async function adConfig() {
    try {
        const db = require('../../shared/database').getSqlite();
        const cfg = db && await db.get('SELECT * FROM ad_settings WHERE id = 1');
        return cfg && cfg.is_enabled ? cfg : null;
    } catch (e) { return null; }
}

/** Recherche dans l'Active Directory (identifiant, nom, e-mail) ; [] si l'AD n'est pas configuré. */
async function adSearch(q) {
    const cfg = await adConfig();
    return cfg ? adHelper.searchADUsersByQuery(q, cfg) : [];
}

/** Matricule SEDIT RH sur 7 chiffres (« 575 » -> « 0000575 »), pour comparer avec ce que porte l'AD. */
const matriculeVariants = (m) => {
    const raw = text(m); if (!raw) return [];
    return [...new Set([raw, /^\d+$/.test(raw) ? raw.padStart(7, '0') : raw, /^\d+$/.test(raw) ? String(Number(raw)) : raw])];
};

/** Compte AppDSI correspondant à un agent SEDIT RH : par identifiant imposé, sinon par nom (un seul compte plausible). */
async function findAccount(agent, username) {
    // Le compte de connexion se cherche dans l'Active Directory (hub.users n'est pas utilisé : un agent peut ne s'être jamais connecté au Hub).
    if (username) {
        const hit = (await adSearch(username).catch(() => [])).find(h => text(h.username).toLowerCase() === username.toLowerCase());
        return hit ? { username: hit.username, email: hit.email, displayName: hit.displayName } : null;
    }
    const hits = await adSearch(agent.prenom + ' ' + agent.nom).catch(() => []);
    const key = svc.tokenKey(agent.prenom + ' ' + agent.nom);
    const exact = hits.filter(h => svc.tokenKey(h.displayName) === key);
    return exact.length === 1 ? { username: exact[0].username, email: exact[0].email, displayName: exact[0].displayName } : null;
}

// ─── Entretiens des agents rattachés ────────────────────────────────────────

/** Libellés SEDIT RH des directions (codes) couvertes par un valideur, plus une direction éventuelle. */
async function libellesDirections(codes, extra) {
    const out = new Set(extra ? [extra] : []);
    try {
        const all = await sedit.directions();
        for (const d of all) if ((codes || []).includes(d.code)) out.add(d.libelle);
    } catch (e) { /* SEDIT RH indisponible : on garde la direction du valideur */ }
    return [...out];
}

const hasProgress = (e) => e.statut !== 'a_planifier' || e.preparation_statut !== 'non_commencee'
    || e.evaluation_statut !== 'non_commencee' || (e.crep_statut && e.crep_statut !== 'non_envoye');

/**
 * EP déjà créé dans le DSI Hub (hors Ville) pour ce même agent, non encore rattaché à une liste de valideur.
 * Rapprochement par e-mail, par identité (prénom + nom, sans tenir compte de l'ordre ni des accents) ou par le compte
 * DSI (matricule -> agents du calendrier DSI). Évite de créer un second entretien pour un agent de la DSI.
 */
async function findDsiEntretien(rat, campaignId) {
    if (!campaignId) return null;
    const rows = await pgDb.all(
        "SELECT * FROM hub_entretiens.entretiens WHERE campaign_id = ? AND deleted_at IS NULL AND COALESCE(source, 'hub') <> 'ville' AND rattachement_id IS NULL", [campaignId]);
    if (!rows.length) return null;
    const key = svc.tokenKey((rat.agent_prenom || '') + ' ' + (rat.agent_nom || ''));
    const email = svc.norm(rat.agent_email);
    const usernames = new Set(); const emails = new Set();
    if (rat.agent_matricule) {
        try {
            const dsi = await pgDb.all('SELECT username, email FROM hub_calendrier.agents_dsi WHERE matricule = ?', [rat.agent_matricule]);
            for (const d of dsi) { if (d.username) usernames.add(svc.norm(d.username)); if (d.email) emails.add(svc.norm(d.email)); }
        } catch (e) { /* annuaire DSI indisponible : rapprochement par nom seulement */ }
    }
    return rows.find(r =>
        (email && svc.norm(r.agent_email) === email)
        || (svc.norm(r.agent_email) && emails.has(svc.norm(r.agent_email)))
        || (svc.norm(r.agent_username) && usernames.has(svc.norm(r.agent_username)))
        || (key && svc.tokenKey((r.agent_prenom || '') + ' ' + (r.agent_nom || '')) === key)) || null;
}

const sameEvaluator = (e, valideur) =>
    (svc.norm(e.evaluator_username) && svc.norm(e.evaluator_username) === svc.norm(valideur.username))
    || (svc.norm(e.evaluator_email) && svc.norm(e.evaluator_email) === svc.norm(valideur.email));

/**
 * L'EP de la campagne en cours pour un agent rattaché (créé au besoin ; l'évaluateur est son valideur).
 * Si l'agent a déjà un EP côté DSI Hub, c'est celui-là qui est rattaché : aucun doublon. Un éventuel doublon déjà créé
 * (EP Ville sans aucune saisie) est supprimé ; s'il a déjà du contenu, il est conservé et signalé dans les logs.
 */
async function ensureEntretien(rat, valideur, campaign, actorName) {
    if (!campaign) return null;
    const existing = await pgDb.get(
        'SELECT * FROM hub_entretiens.entretiens WHERE campaign_id = ? AND rattachement_id = ? AND deleted_at IS NULL', [campaign.id, rat.id]);
    const dsi = (!existing || existing.source === 'ville') ? await findDsiEntretien(rat, campaign.id) : null;
    if (dsi) {
        if (existing) {
            if (hasProgress(existing)) { console.warn('[EP-VILLE] doublon conservé (contenu déjà saisi) : EP ' + existing.id + ' et EP DSI ' + dsi.id + ' pour ' + rat.agent_nom); return existing.id; }
            await pgDb.run("UPDATE hub_entretiens.entretiens SET deleted_at = NOW(), deleted_by = 'doublon EP DSI' WHERE id = ?", [existing.id]);
        }
        const noEval = "COALESCE(evaluator_username, '') = '' AND COALESCE(evaluator_email, '') = ''";
        await pgDb.run(
            "UPDATE hub_entretiens.entretiens SET rattachement_id = ?, agent_matricule = COALESCE(NULLIF(agent_matricule, ''), ?), agent_grade = COALESCE(NULLIF(agent_grade, ''), ?), "
            + "evaluator_username = CASE WHEN " + noEval + " THEN ? ELSE evaluator_username END, "
            + "evaluator_email = CASE WHEN " + noEval + " THEN ? ELSE evaluator_email END, "
            + "evaluator_nom = CASE WHEN " + noEval + " THEN ? ELSE evaluator_nom END, "
            + "updated_at = NOW() WHERE id = ?",
            [rat.id, rat.agent_matricule || '', rat.agent_grade || '', valideur.username, (valideur.email || '').toLowerCase(), valideur.display_name || valideur.username, dsi.id]);
        return dsi.id;
    }
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

/**
 * Supprime un valideur (et sa liste d'agents) tant qu'aucun EP n'a démarré et qu'il n'a pas de sous-valideur.
 * Sinon, lève une 409 qui explique quoi faire (réaffecter les agents, retirer d'abord les sous-valideurs).
 */
async function deleteValideurSafely(id) {
    const subs = await pgDb.get('SELECT COUNT(*)::int AS n FROM hub_entretiens.valideurs WHERE parent_valideur_id = ?', [id]);
    if (Number(subs?.n) > 0) throw httpError(409, `Ce valideur a désigné ${subs.n} sous-valideur(s) : ils doivent d’abord être retirés.`);
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
}

/** Matricules de la chaîne hiérarchique au-dessus d'un valideur (son valideur, puis le valideur de celui-ci, etc.). */
async function chaineAuDessus(valideur) {
    const out = new Set();
    let mat = valideur.matricule;
    for (let i = 0; i < 20 && mat; i++) {
        const up = await pgDb.get(
            `SELECT v.matricule FROM hub_entretiens.rattachements r JOIN hub_entretiens.valideurs v ON v.id = r.valideur_id WHERE r.agent_matricule = ?`, [mat]);
        if (!up || !up.matricule || out.has(up.matricule)) break;
        out.add(up.matricule);
        mat = up.matricule;
    }
    return out;
}

/** Rapprochement automatique d'un agent avec l'AD : par matricule (employeeID), sinon par nom exact unique. Renseigne compte et e-mail. */
async function autoLinkAd(rat) {
    let hit = null;
    try {
        // 1) par e-mail (déjà connu, ex. repris des EP DSI) : correspondance exacte
        const mail = text(rat.agent_email).toLowerCase();
        if (mail) hit = (await adSearch(mail)).find(h => text(h.email).toLowerCase() === mail) || null;
        if (hit) return hit;
        const hits = await adSearch((rat.agent_prenom || '') + ' ' + rat.agent_nom);
        const mats = matriculeVariants(rat.agent_matricule);
        if (mats.length) hit = hits.find(h => h.matricule && mats.includes(text(h.matricule))) || null;
        if (!hit) {
            const key = svc.tokenKey((rat.agent_prenom || '') + ' ' + rat.agent_nom);
            const exact = hits.filter(h => svc.tokenKey(h.displayName) === key);
            if (exact.length === 1) hit = exact[0];
        }
    } catch (e) { return null; }
    return hit;
}

/** Rapprochement automatique d'un agent avec l'AD si ce n'est pas déjà fait (au plus une tentative par jour et par agent). */
async function ensureAdLink(rat) {
    if (rat.agent_username || (rat.ad_checked_at && Date.now() - new Date(rat.ad_checked_at).getTime() < 86400000)) return rat;
    const hit = await autoLinkAd(rat);
    if (hit) { await applyAdAccount(rat.id, hit); return await pgDb.get('SELECT * FROM hub_entretiens.rattachements WHERE id = ?', [rat.id]); }
    await pgDb.run('UPDATE hub_entretiens.rattachements SET ad_checked_at = NOW() WHERE id = ?', [rat.id]);
    return rat;
}

/** Enregistre le compte AD d'un agent sur son rattachement et sur son EP (l'agent retrouve ainsi son entretien à la connexion). */
async function applyAdAccount(ratId, hit) {
    const email = text(hit.email).toLowerCase();
    await pgDb.run('UPDATE hub_entretiens.rattachements SET agent_username = ?, agent_email = COALESCE(NULLIF(?, \'\'), agent_email), ad_checked_at = NOW() WHERE id = ?', [hit.username, email, ratId]);
    await pgDb.run(
        "UPDATE hub_entretiens.entretiens SET agent_username = ?, agent_email = COALESCE(NULLIF(?, ''), agent_email), updated_at = NOW() WHERE rattachement_id = ? AND deleted_at IS NULL",
        [hit.username, email, ratId]);
}

/**
 * Agents à proposer à un valideur : on écarte ceux qui ont déjà un EP dans la campagne en cours (rattachés à un valideur,
 * ou EP DSI Hub, repérés par matricule ou par identité) et les valideurs situés au-dessus de lui (sa chaîne de valideurs
 * et les valideurs de niveau supérieur), ainsi que lui-même.
 */
async function proposables(valideur, agents) {
    if (!agents.length) return agents;
    const RANG = { sous: 0, direction: 1, dga: 2, dg: 3 };
    const campaign = await svc.getCurrentCampaign();
    const withEp = new Set(); const withEpNames = new Set();
    for (const r of await pgDb.all("SELECT agent_matricule FROM hub_entretiens.rattachements WHERE agent_matricule <> ''")) withEp.add(r.agent_matricule);
    if (campaign) {
        for (const r of await pgDb.all('SELECT agent_matricule, agent_nom, agent_prenom FROM hub_entretiens.entretiens WHERE campaign_id = ? AND deleted_at IS NULL', [campaign.id])) {
            if (r.agent_matricule) withEp.add(r.agent_matricule);
            const k = svc.tokenKey((r.agent_prenom || '') + ' ' + (r.agent_nom || '')); if (k) withEpNames.add(k);
        }
    }
    const above = await chaineAuDessus(valideur);
    // Chaîne par désignation (sous-valideurs) : le valideur qui m'a désigné, et ainsi de suite.
    let p = valideur.parent_valideur_id;
    for (let i = 0; i < 20 && p; i++) {
        const pv = await pgDb.get('SELECT matricule, parent_valideur_id FROM hub_entretiens.valideurs WHERE id = ?', [p]);
        if (!pv) break; if (pv.matricule) above.add(pv.matricule); p = pv.parent_valideur_id;
    }
    // Valideurs de niveau supérieur au mien (ex. DGA et DG pour un directeur).
    for (const v of await pgDb.all('SELECT matricule, niveau FROM hub_entretiens.valideurs')) {
        if (v.matricule && (RANG[v.niveau] ?? 0) > (RANG[valideur.niveau] ?? 0)) above.add(v.matricule);
    }
    return agents.filter(a => a.matricule !== valideur.matricule && !above.has(a.matricule) && !withEp.has(a.matricule)
        && !withEpNames.has(svc.tokenKey((a.prenom || '') + ' ' + (a.nom || ''))));
}

/** Rattachement d'un agent placé sous moi : mes agents directs ou ceux de mes sous-valideurs (à tous les niveaux). */
async function ratUnderMe(valideur, id) {
    const rat = await pgDb.get('SELECT * FROM hub_entretiens.rattachements WHERE id = ?', [id]);
    if (!rat) return null;
    if (rat.valideur_id === valideur.id) return rat;
    const { ratIds } = await hierarchy.descendants(valideur.id);
    return ratIds.includes(id) ? rat : null;
}

const rattachementView = (r, ent) => ({
    id: r.id, username: r.agent_username || '', ad: !!r.agent_username, matricule: r.agent_matricule || '', nom: r.agent_nom, prenom: r.agent_prenom, grade: r.agent_grade,
    email: r.agent_email, direction: r.direction, service: r.service, poste: r.poste, saisi_a_la_volee: !!r.saisi_a_la_volee,
    entretien: ent || null,
});

/** Comptes et matricule d'un agent DSI : champs de son EP + annuaire DSI (agents du calendrier, rapproché par matricule, compte ou e-mail). */
async function dsiIdentity(r) {
    const usernames = new Set(); const emails = new Set(); let matricule = text(r.agent_matricule);
    if (r.agent_username) usernames.add(svc.norm(r.agent_username));
    if (r.agent_email) emails.add(svc.norm(r.agent_email));
    try {
        const rows = await pgDb.all(
            "SELECT username, email, matricule FROM hub_calendrier.agents_dsi WHERE (? <> '' AND matricule = ?) OR (? <> '' AND LOWER(username) = LOWER(?)) OR (? <> '' AND LOWER(email) = LOWER(?))",
            [matricule, matricule, r.agent_username || '', r.agent_username || '', r.agent_email || '', r.agent_email || '']);
        for (const d of rows) {
            if (d.username) usernames.add(svc.norm(d.username));
            if (d.email) emails.add(svc.norm(d.email));
            if (!matricule && d.matricule) matricule = text(d.matricule);
        }
    } catch (e) { /* annuaire DSI indisponible : on s'en tient aux champs de l'EP */ }
    return { usernames: [...usernames], emails: [...emails], matricule };
}

/** Compte de connexion d'un agent DSI : son identifiant connu (EP, annuaire DSI), sinon l'Active Directory par son nom. hub.users n'est pas utilisé. */
async function accountOf(idn, nom) {
    if (idn.usernames.length) return { username: idn.usernames[0], email: idn.emails[0] || '' };
    const hits = await adSearch(nom).catch(() => []);
    const key = svc.tokenKey(nom);
    const exact = hits.filter(h => svc.tokenKey(h.displayName) === key);
    return exact.length === 1 ? { username: exact[0].username, email: exact[0].email } : null;
}

/**
 * Reprend les EP DSI conduits par un valideur : chaque agent évalué est ajouté à sa liste (l'EP existant est rattaché, pas dupliqué) ;
 * si cet agent est lui-même évaluateur d'autres EP, il est désigné sous-valideur et la reprise se poursuit pour lui, de proche en proche.
 */
async function importDsiFor(valideur, campaign, actorName, state) {
    if (state.visited.has(valideur.id) || state.visited.size > 80) return;
    state.visited.add(valideur.id);
    const rows = await pgDb.all(
        "SELECT * FROM hub_entretiens.entretiens WHERE campaign_id = ? AND deleted_at IS NULL AND COALESCE(source, 'hub') <> 'ville'", [campaign.id]);
    const mine = rows.filter(r => !r.rattachement_id && sameEvaluator(r, valideur));

    for (const r of mine) {
        const nom = ((r.agent_prenom ? r.agent_prenom + ' ' : '') + r.agent_nom).trim();
        const idn = await dsiIdentity(r);
        let grade = text(r.agent_grade); let unit = '';
        if (idn.matricule) {
            try { const a = await sedit.getAgent(idn.matricule); if (a) { grade = grade || a.grade; unit = a.service_code || a.direction_code; } } catch (e) { /* grade facultatif */ }
        }
        let ratId = null;
        if (idn.matricule) {
            const ex = await pgDb.get('SELECT id, valideur_id FROM hub_entretiens.rattachements WHERE agent_matricule = ?', [idn.matricule]);
            if (ex && ex.valideur_id !== valideur.id) { state.conflits.push({ agent: nom, message: 'déjà rattaché à un autre valideur' }); continue; }
            if (ex) ratId = ex.id;
        }
        if (!ratId) {
            const ins = await pgDb.run(
                'INSERT INTO hub_entretiens.rattachements (valideur_id, agent_matricule, agent_nom, agent_prenom, agent_grade, agent_email, direction, service, poste, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [valideur.id, idn.matricule, r.agent_nom, r.agent_prenom || '', grade, r.agent_email || '', r.direction || '', r.service || '', r.poste || '', actorName || 'reprise DSI']);
            ratId = ins.lastID;
        }
        await pgDb.run("UPDATE hub_entretiens.entretiens SET rattachement_id = ?, agent_matricule = COALESCE(NULLIF(agent_matricule, ''), ?), agent_grade = COALESCE(NULLIF(agent_grade, ''), ?), updated_at = NOW() WHERE id = ?", [ratId, idn.matricule, grade, r.id]);
        state.repris.push(nom);

        // Cet agent évalue-t-il lui-même d'autres agents ? Alors il devient sous-valideur et reprend les siens.
        const evaluates = rows.some(o => o.id !== r.id
            && ((svc.norm(o.evaluator_username) && idn.usernames.includes(svc.norm(o.evaluator_username)))
                || (svc.norm(o.evaluator_email) && idn.emails.includes(svc.norm(o.evaluator_email)))));
        if (!evaluates) continue;
        let sub = null;
        for (const u of idn.usernames) { sub = sub || await pgDb.get('SELECT * FROM hub_entretiens.valideurs WHERE LOWER(username) = LOWER(?)', [u]); }
        if (!sub) {
            const account = await accountOf(idn, nom);
            if (!account) { state.nonResolus.push({ agent: nom, raison: 'évaluateur sans compte de connexion retrouvé : à désigner à la main (identifiant requis)' }); continue; }
            sub = await pgDb.get('SELECT * FROM hub_entretiens.valideurs WHERE LOWER(username) = LOWER(?)', [account.username]);
            if (!sub) {
                const ins = await pgDb.run(
                    "INSERT INTO hub_entretiens.valideurs (username, email, display_name, matricule, grade, niveau, direction_code, direction_libelle, directions, parent_valideur_id, rattachement_id, created_by) VALUES (?, ?, ?, ?, ?, 'sous', '', ?, CAST(? AS jsonb), ?, ?, ?)",
                    [account.username, account.email || r.agent_email || '', nom, idn.matricule, grade, r.direction || '', JSON.stringify(unit ? [unit] : []), valideur.id, ratId, actorName || 'reprise DSI']);
                sub = await pgDb.get('SELECT * FROM hub_entretiens.valideurs WHERE id = ?', [ins.lastID]);
                state.sousValideurs.push(nom);
            }
        }
        await importDsiFor(sub, campaign, actorName, state);
    }
}

const controller = {

    // GET /api/ep-ville/me
    me: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            const [isAdmin, valideur, campaign] = await Promise.all([svc.isEpAdmin(actor), getValideur(actor), svc.getCurrentCampaign()]);
            // « EP de mon équipe » n'a de sens que si au moins un de mes agents est lui-même valideur
            const hasSubs = valideur ? Number((await pgDb.get('SELECT COUNT(*)::int AS n FROM hub_entretiens.valideurs WHERE parent_valideur_id = ?', [valideur.id]))?.n) > 0 : false;
            res.json({ isAdmin, isValideur: !!valideur, hasSubValideurs: hasSubs, valideur, campaign, sedit_configured: sedit.configured() });
        } catch (e) { handle(res, 'me', e); }
    },

    // ─── Référentiel SEDIT RH ───────────────────────────────────────────

    // GET /api/ep-ville/rh/agents?q= — recherche de n'importe quel agent en poste (administrateurs et valideurs)
    rhSearch: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor)) && !(await getValideur(actor))) throw httpError(403, 'Accès refusé.');
            let agents = await sedit.searchAgents(req.query.q, 40);
            const mine = await getValideur(actor);
            if (mine) agents = (await proposables(mine, agents)).slice(0, 20);
            const rats = agents.length
                ? await pgDb.all(`SELECT r.agent_matricule, v.display_name, v.username FROM hub_entretiens.rattachements r
                                  JOIN hub_entretiens.valideurs v ON v.id = r.valideur_id
                                  WHERE r.agent_matricule IN (${agents.map(() => '?').join(',')})`, agents.map(a => a.matricule))
                : [];
            const by = new Map(rats.map(r => [r.agent_matricule, r.display_name || r.username]));
            res.json({ agents: agents.map(a => ({ ...a, valideur: by.get(a.matricule) || null })) });
        } catch (e) { handle(res, 'rhSearch', e); }
    },

    // GET /api/ep-ville/ad/search?q= — recherche dans l'Active Directory (administrateurs et valideurs)
    adSearch: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor)) && !(await getValideur(actor))) throw httpError(403, 'Accès refusé.');
            const q = text(req.query.q);
            if (q.length < 2) return res.json({ users: [] });
            if (!(await adConfig())) throw httpError(400, 'Active Directory non configuré.');
            res.json({ users: (await adSearch(q)).slice(0, 20) });
        } catch (e) { handle(res, 'adSearch', e); }
    },

    // POST /api/ep-ville/valideurs/resolve { username, displayName, matricule? } — lien RH d'un compte AD :
    // 1) par matricule (porté par l'AD), 2) à défaut par le nom exact (prénom + nom, un seul agent). Sinon : introuvable en RH.
    resolveRh: async (req, res) => {
        try {
            await requireAdmin(req);
            const b = req.body || {};
            const displayName = text(b.displayName) || text(b.username);
            let agent = null; let lien = null;
            for (const m of matriculeVariants(b.matricule)) { agent = await sedit.getAgent(m); if (agent) { lien = 'matricule'; break; } }
            if (!agent && displayName) {
                const key = svc.tokenKey(displayName);
                const hits = (await sedit.searchAgents(displayName, 50)).filter(a => svc.tokenKey(a.prenom + ' ' + a.nom) === key);
                if (hits.length === 1) { agent = hits[0]; lien = 'nom'; }
            }
            if (!agent) {
                return res.json({
                    lien: null,
                    message: `« ${displayName} » n’existe pas écrit comme ça en RH (${text(b.matricule) ? 'matricule AD ' + text(b.matricule) + ' inconnu de SEDIT RH et ' : 'aucun matricule dans l’AD et '}aucun agent portant exactement ce nom). Recherchez l’agent dans la base RH par nom, prénom, direction, service…`,
                });
            }
            res.json({ lien, agent });
        } catch (e) { handle(res, 'resolveRh', e); }
    },

    // GET /api/ep-ville/rh/recherche?q= — recherche étendue dans SEDIT RH (nom, prénom, matricule, direction, service, poste, grade)
    rhRecherche: async (req, res) => {
        try {
            const actor = await svc.getActor(req);
            if (!(await svc.isEpAdmin(actor)) && !(await getValideur(actor))) throw httpError(403, 'Accès refusé.');
            res.json({ agents: await sedit.searchAgentsFull(req.query.q, 30) });
        } catch (e) { handle(res, 'rhRecherche', e); }
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
                `SELECT v.*, (SELECT COUNT(*) FROM hub_entretiens.rattachements r WHERE r.valideur_id = v.id)::int AS nb_agents,
                        p.display_name AS parent_nom
                 FROM hub_entretiens.valideurs v LEFT JOIN hub_entretiens.valideurs p ON p.id = v.parent_valideur_id
                 ORDER BY COALESCE(p.display_name, v.display_name), (v.parent_valideur_id IS NOT NULL), LOWER(v.display_name)`);
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
            // Le compte vient de l'Active Directory (choisi par l'administrateur) ; à défaut, recherche par identifiant puis par nom.
            let account = null;
            const ba = b.account || {};
            if (text(ba.username)) account = { username: text(ba.username), email: text(ba.email), displayName: text(ba.displayName) };
            if (!account) account = await findAccount(agent, text(b.username));
            if (!account) {
                return fail(res, 422, `Aucun compte unique trouvé pour ${agent.prenom} ${agent.nom} : recherchez-le dans l’Active Directory.`, { need_username: true });
            }
            let directions = Array.isArray(b.directions) ? b.directions.map(text).filter(Boolean) : [];
            if (!directions.length && agent.direction_code) directions = [agent.direction_code];
            const libelles = await libellesDirections(directions, agent.direction);
            const dup = await pgDb.get('SELECT id FROM hub_entretiens.valideurs WHERE LOWER(username) = LOWER(?)', [account.username]);
            if (dup) throw httpError(409, 'Cet agent est déjà valideur.');
            const r = await pgDb.run(
                `INSERT INTO hub_entretiens.valideurs (username, email, display_name, matricule, grade, niveau, direction_code, direction_libelle, directions, perimetre_libelles, created_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb), ?)`,
                [account.username, account.email || '', `${agent.prenom} ${agent.nom}`.trim(), agent.matricule, agent.grade, niveau,
                    agent.direction_code, agent.direction, JSON.stringify(directions), JSON.stringify(libelles), actor.username || null]);
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
            if (b.directions !== undefined) {
                const dirs = (Array.isArray(b.directions) ? b.directions : []).map(text).filter(Boolean);
                set.push('directions = CAST(? AS jsonb)'); params.push(JSON.stringify(dirs));
                set.push('perimetre_libelles = CAST(? AS jsonb)'); params.push(JSON.stringify(await libellesDirections(dirs, '')));
            }
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
            await deleteValideurSafely(Number(req.params.id));
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

    // GET /api/ep-ville/valideurs/agents — tous les agents rattachés (vue arborescente des administrateurs : effectif, jamais le contenu des EP)
    allAgents: async (req, res) => {
        try {
            await requireAdmin(req);
            const rows = await pgDb.all('SELECT * FROM hub_entretiens.rattachements ORDER BY LOWER(agent_nom), LOWER(agent_prenom)');
            res.json({ agents: rows.map(r => ({ ...rattachementView(r), valideur_id: r.valideur_id })) });
        } catch (e) { handle(res, 'allAgents', e); }
    },

    // PUT /api/ep-ville/rattachements/:id { valideur_id } — l'administrateur change le valideur d'un agent
    reassign: async (req, res) => {
        try {
            await requireAdmin(req);
            const rat = await pgDb.get('SELECT * FROM hub_entretiens.rattachements WHERE id = ?', [Number(req.params.id)]);
            if (!rat) throw httpError(404, 'Rattachement introuvable.');
            const target = await pgDb.get('SELECT * FROM hub_entretiens.valideurs WHERE id = ?', [Number(req.body?.valideur_id)]);
            if (!target) throw httpError(404, 'Valideur introuvable.');
            // Cycle : on ne peut pas placer un agent sous un valideur qu'il valide lui-même (directement ou en cascade).
            if (rat.agent_matricule && (await chaineAuDessus(target)).has(rat.agent_matricule)) throw httpError(409, 'Cette réaffectation créerait une boucle : cet agent valide déjà son futur valideur.');
            if (rat.agent_matricule && rat.agent_matricule === target.matricule) throw httpError(409, 'Un valideur ne peut pas se valider lui-même.');
            await pgDb.run('UPDATE hub_entretiens.rattachements SET valideur_id = ? WHERE id = ?', [target.id, rat.id]);
            // Si cet agent est lui-même un sous-valideur, il est désormais désigné par son nouveau valideur.
            await pgDb.run('UPDATE hub_entretiens.valideurs SET parent_valideur_id = ? WHERE rattachement_id = ?', [target.id, rat.id]);
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
            // Direction / DGA / DG : codes de directions. Sous-valideur : code de son service (ou de son unité), plus fin.
            let agents = await sedit.agentsOfUnits(dirs);
            // Niveau DGA / DG : en plus de leurs directions, les directeurs de la collectivité sont proposés.
            if (['dga', 'dg'].includes(valideur.niveau)) {
                const dirigeants = await sedit.candidatsValideurs();
                const seen = new Set(agents.map(a => a.matricule));
                agents = agents.concat(dirigeants.filter(a => !seen.has(a.matricule)));
            }
            agents = await proposables(valideur, agents.filter(a => a.matricule !== valideur.matricule));
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
            const subs = await pgDb.all(
                `SELECT v.id, v.rattachement_id, (SELECT COUNT(*) FROM hub_entretiens.rattachements r WHERE r.valideur_id = v.id)::int AS nb_agents
                 FROM hub_entretiens.valideurs v WHERE v.parent_valideur_id = ?`, [valideur.id]);
            const subBy = new Map(subs.map(s => [s.rattachement_id, s]));
            const out = [];
            for (const rat0 of rats) {
                const rat = await ensureAdLink(rat0);
                const id = await ensureEntretien(rat, valideur, campaign, actor.username);
                const ent = id ? await pgDb.get(
                    `SELECT id, statut, date_entretien, lieu, preparation_statut, evaluation_statut, crep_statut, crep_signed_at,
                            (SELECT p.status FROM hub_parapheur.parapheurs p WHERE p.id = crep_parapheur_id) AS crep_parapheur_status
                     FROM hub_entretiens.entretiens WHERE id = ?`, [id]) : null;
                const view = rattachementView(rat, ent ? { ...ent, date_entretien_label: svc.formatDateTimeFr(ent.date_entretien) } : null);
                const sub = subBy.get(rat.id);
                out.push({ ...view, sous_valideur: sub ? { id: sub.id, nb_agents: sub.nb_agents } : null });
            }
            // Vue arborescente : agents de mes sous-valideurs (à tous les niveaux), rattachés à leur valideur
            let sousAgents = [];
            try {
                const { valideurs: subIds } = await hierarchy.descendants(valideur.id);
                if (subIds.length) {
                    const ph = subIds.map(() => '?').join(',');
                    const rows0 = await pgDb.all(`SELECT * FROM hub_entretiens.rattachements WHERE valideur_id IN (${ph}) ORDER BY LOWER(agent_nom), LOWER(agent_prenom)`, subIds);
                    const rows = []; for (const r0 of rows0) rows.push(await ensureAdLink(r0));
                    const vals = await pgDb.all(`SELECT id, rattachement_id, matricule FROM hub_entretiens.valideurs WHERE parent_valideur_id IN (${ph}) OR id IN (${ph})`, [...subIds, ...subIds]);
                    const ents = rows.length && campaign ? await pgDb.all(
                        `SELECT id, rattachement_id, statut, preparation_statut, evaluation_statut, crep_statut, crep_signed_at,
                                (SELECT p.status FROM hub_parapheur.parapheurs p WHERE p.id = crep_parapheur_id) AS crep_parapheur_status FROM hub_entretiens.entretiens
                         WHERE campaign_id = ? AND deleted_at IS NULL AND rattachement_id IN (${rows.map(() => '?').join(',')})`, [campaign.id, ...rows.map(r => r.id)]) : [];
                    const entBy = new Map(ents.map(e => [e.rattachement_id, e]));
                    sousAgents = rows.map(r => {
                        const w = vals.find(x => x.rattachement_id === r.id) || vals.find(x => r.agent_matricule && x.matricule === r.agent_matricule);
                        return { ...rattachementView(r, entBy.get(r.id) || null), valideur_id: r.valideur_id, sous_valideur: w ? { id: w.id } : null };
                    });
                }
            } catch (e) { console.warn('[EP-VILLE] arbre des agents:', e.message); }
            res.json({ campaign, valideur, agents: out, sous_agents: sousAgents });
        } catch (e) { handle(res, 'mesAgents', e); }
    },

    // POST /api/ep-ville/dsi/rattacher — administrateur : rattache les EP DSI existants à leurs valideurs et supprime les doublons.
    // 1) pour chaque agent déjà rattaché, l'EP DSI de la campagne remplace un éventuel doublon « Ville » vide ;
    // 2) tout EP DSI dont l'évaluateur est un valideur est ajouté à la liste de ce valideur (matricule retrouvé par l'annuaire DSI).
    // Les évaluateurs qui ne sont pas encore valideurs sont listés : il suffit de les désigner puis de relancer.
    reconcileDsi: async (req, res) => {
        try {
            await requireAdmin(req);
            const campaign = await svc.getCurrentCampaign();
            if (!campaign) throw httpError(400, 'Aucune campagne en cours.');
            const report = { lies: [], conflits: [], evaluateurs_sans_valideur: [], doublons_traites: 0 };
            const valideurs = await pgDb.all('SELECT * FROM hub_entretiens.valideurs');

            for (const v of valideurs) {
                const rats = await pgDb.all('SELECT * FROM hub_entretiens.rattachements WHERE valideur_id = ?', [v.id]);
                for (const rat of rats) {
                    const before = await pgDb.get("SELECT COUNT(*)::int AS n FROM hub_entretiens.entretiens WHERE campaign_id = ? AND rattachement_id = ? AND deleted_at IS NULL", [campaign.id, rat.id]);
                    await ensureEntretien(rat, v, campaign, 'rapprochement DSI');
                    const after = await pgDb.get("SELECT source FROM hub_entretiens.entretiens WHERE campaign_id = ? AND rattachement_id = ? AND deleted_at IS NULL", [campaign.id, rat.id]);
                    if (Number(before?.n) > 0 && after && after.source !== 'ville') report.doublons_traites++;
                }
            }

            const rows = await pgDb.all(
                "SELECT * FROM hub_entretiens.entretiens WHERE campaign_id = ? AND deleted_at IS NULL AND COALESCE(source, 'hub') <> 'ville' AND rattachement_id IS NULL", [campaign.id]);
            const sansValideur = new Set();
            for (const r of rows) {
                const v = valideurs.find(x => sameEvaluator(r, x));
                if (!v) { if (r.evaluator_nom || r.evaluator_email) sansValideur.add(r.evaluator_nom || r.evaluator_email); continue; }
                let matricule = text(r.agent_matricule);
                if (!matricule) {
                    try {
                        const d = await pgDb.get(
                            'SELECT matricule FROM hub_calendrier.agents_dsi WHERE (? <> \'\' AND LOWER(username) = LOWER(?)) OR (? <> \'\' AND LOWER(email) = LOWER(?)) LIMIT 1',
                            [r.agent_username || '', r.agent_username || '', r.agent_email || '', r.agent_email || '']);
                        matricule = text(d && d.matricule);
                    } catch (e) { /* annuaire DSI indisponible */ }
                }
                let grade = text(r.agent_grade);
                if (matricule && !grade) { try { const a = await sedit.getAgent(matricule); grade = a ? a.grade : ''; } catch (e) { /* grade facultatif */ } }
                const nom = (r.agent_prenom ? r.agent_prenom + ' ' : '') + r.agent_nom;
                let ratId = null;
                if (matricule) {
                    const ex = await pgDb.get('SELECT id, valideur_id FROM hub_entretiens.rattachements WHERE agent_matricule = ?', [matricule]);
                    if (ex && ex.valideur_id !== v.id) { report.conflits.push({ agent: nom, message: 'déjà rattaché à un autre valideur' }); continue; }
                    if (ex) ratId = ex.id;
                }
                if (!ratId) {
                    const ins = await pgDb.run(
                        'INSERT INTO hub_entretiens.rattachements (valideur_id, agent_matricule, agent_nom, agent_prenom, agent_grade, agent_email, direction, service, poste, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                        [v.id, matricule, r.agent_nom, r.agent_prenom || '', grade, r.agent_email || '', r.direction || '', r.service || '', r.poste || '', 'rapprochement DSI']);
                    ratId = ins.lastID;
                }
                await pgDb.run("UPDATE hub_entretiens.entretiens SET rattachement_id = ?, agent_matricule = COALESCE(NULLIF(agent_matricule, ''), ?), agent_grade = COALESCE(NULLIF(agent_grade, ''), ?), updated_at = NOW() WHERE id = ?", [ratId, matricule, grade, r.id]);
                report.lies.push({ agent: nom, valideur: v.display_name });
            }
            report.evaluateurs_sans_valideur = [...sansValideur].sort();
            res.json(report);
        } catch (e) { handle(res, 'reconcileDsi', e); }
    },

    // POST /api/ep-ville/mes-agents/importer-dsi — je reprends mes agents d'après les EP DSI que j'évalue ;
    // chaque agent qui évalue lui-même d'autres agents est désigné sous-valideur et reprend les siens (récursif).
    importerDsi: async (req, res) => {
        try {
            const { actor, valideur } = await requireValideur(req);
            const campaign = await svc.getCurrentCampaign();
            if (!campaign) throw httpError(400, 'Aucune campagne en cours.');
            const state = { visited: new Set(), repris: [], sousValideurs: [], nonResolus: [], conflits: [] };
            await importDsiFor(valideur, campaign, actor.username, state);
            res.json({ agents_repris: state.repris, sous_valideurs: state.sousValideurs, non_resolus: state.nonResolus, conflits: state.conflits });
        } catch (e) { handle(res, 'importerDsi', e); }
    },

    // GET /api/ep-ville/equipe — les EP que JE NE conduis PAS mais qui sont sous ma responsabilité :
    // agents de mes sous-valideurs (cascade) et, pour un directeur / DGA / DG, tous les EP de sa direction. Lecture seule.
    equipe: async (req, res) => {
        try {
            const { actor, valideur } = await requireValideur(req);
            const campaign = await svc.getCurrentCampaign();
            if (!campaign) return res.json({ campaign: null, stats: svc.computeStats([]), items: [], portee: [] });
            const identity = await svc.evaluatorIdentity(actor);
            const mine = (r) => (svc.norm(r.evaluator_email) && identity.emails.includes(svc.norm(r.evaluator_email)))
                || (svc.norm(r.evaluator_username) && identity.usernames.includes(svc.norm(r.evaluator_username)));
            const { ratIds } = await hierarchy.descendants(valideur.id);
            const all = await svc.listEntretiens({ campaignId: campaign.id });
            const ratSet = new Set(ratIds);
            const items = all.filter(r => !mine(r) && ((r.rattachement_id && ratSet.has(r.rattachement_id)) || hierarchy.inPerimetre(valideur, r)));
            const portee = [];
            if (ratIds.length) portee.push('agents de vos sous-valideurs');
            if (valideur.niveau !== 'sous') portee.push('toute votre direction');
            res.json({ campaign, stats: svc.computeStats(items), items: await require('../entretiens/ep-rh-enrich').enrichFromRh(items), portee });
        } catch (e) { handle(res, 'equipe', e); }
    },

    // POST /api/ep-ville/mes-agents { matricules?: [], libres?: [{nom, prenom, grade, direction, service, poste, email}] }
    addAgents: async (req, res) => {
        try {
            const { actor, valideur } = await requireValideur(req);
            const campaign = await svc.getCurrentCampaign();
            const b = req.body || {};
            const added = []; const conflits = []; const erreurs = [];
            const auDessus = await chaineAuDessus(valideur); // les supérieurs hiérarchiques ne peuvent pas devenir mes agents (boucle)

            for (const m of [...new Set((Array.isArray(b.matricules) ? b.matricules : []).map(text).filter(Boolean))]) {
                const agent = await sedit.getAgent(m);
                if (!agent) { erreurs.push({ matricule: m, message: 'Introuvable dans SEDIT RH' }); continue; }
                const nom = `${agent.prenom} ${agent.nom}`.trim();
                if (agent.matricule === valideur.matricule) { erreurs.push({ matricule: m, message: 'Vous ne pouvez pas être votre propre valideur' }); continue; }
                if (auDessus.has(agent.matricule)) { erreurs.push({ matricule: m, message: `${nom} est votre supérieur dans la chaîne de validation` }); continue; }
                const exist = await pgDb.get(
                    `SELECT r.id, r.valideur_id, v.display_name, v.username FROM hub_entretiens.rattachements r
                     JOIN hub_entretiens.valideurs v ON v.id = r.valideur_id WHERE r.agent_matricule = ?`, [agent.matricule]);
                if (!exist) {
                    const dsi = await findDsiEntretien({ agent_matricule: agent.matricule, agent_nom: agent.nom, agent_prenom: agent.prenom, agent_email: '' }, campaign && campaign.id);
                    if (dsi && (dsi.evaluator_username || dsi.evaluator_email) && !sameEvaluator(dsi, valideur)) {
                        conflits.push({ matricule: m, agent: nom, valideur: (dsi.evaluator_nom || dsi.evaluator_email) + ' (entretien DSI déjà attribué)' });
                        continue;
                    }
                }
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
                {
                    const dsi = await findDsiEntretien({ agent_matricule: '', agent_nom: nom, agent_prenom: prenom, agent_email: email }, campaign && campaign.id);
                    if (dsi && (dsi.evaluator_username || dsi.evaluator_email) && !sameEvaluator(dsi, valideur)) {
                        conflits.push({ agent: (prenom + ' ' + nom).trim(), valideur: (dsi.evaluator_nom || dsi.evaluator_email) + ' (entretien DSI déjà attribué)' });
                        continue;
                    }
                }
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

    // POST /api/ep-ville/mes-agents/:id/valideur { username? } — je désigne un de MES agents comme sous-valideur :
    // il choisira à son tour ses propres agents (dans son service, ou n'importe quel agent), et ainsi de suite.
    promote: async (req, res) => {
        try {
            const { actor, valideur } = await requireValideur(req);
            const rat = await pgDb.get('SELECT * FROM hub_entretiens.rattachements WHERE id = ? AND valideur_id = ?', [Number(req.params.id), valideur.id]);
            if (!rat) throw httpError(404, 'Agent introuvable dans votre liste.');
            if (await pgDb.get('SELECT 1 AS x FROM hub_entretiens.valideurs WHERE rattachement_id = ?', [rat.id])) throw httpError(409, 'Cet agent est déjà valideur.');

            const agent = rat.agent_matricule ? await sedit.getAgent(rat.agent_matricule) : null;
            const account = await findAccount({ nom: rat.agent_nom, prenom: rat.agent_prenom }, text(req.body?.username));
            if (!account) {
                return fail(res, 422, `Aucun compte unique trouvé pour ${fullName(rat)} : indiquez son identifiant de connexion.`, { need_username: true });
            }
            if (await pgDb.get('SELECT id FROM hub_entretiens.valideurs WHERE LOWER(username) = LOWER(?)', [account.username])) {
                throw httpError(409, `${fullName(rat)} est déjà valideur (désigné par un administrateur ou par un autre valideur).`);
            }
            // Périmètre proposé au sous-valideur : son service SEDIT RH (à défaut sa direction).
            const unit = agent ? (agent.service_code || agent.direction_code) : '';
            const r = await pgDb.run(
                `INSERT INTO hub_entretiens.valideurs
                   (username, email, display_name, matricule, grade, niveau, direction_code, direction_libelle, directions, parent_valideur_id, rattachement_id, created_by)
                 VALUES (?, ?, ?, ?, ?, 'sous', ?, ?, CAST(? AS jsonb), ?, ?, ?)`,
                [account.username, account.email || '', fullName(rat), rat.agent_matricule || '', rat.agent_grade || '',
                    agent ? agent.direction_code : '', rat.direction || '', JSON.stringify(unit ? [unit] : []), valideur.id, rat.id, actor.username || null]);
            res.status(201).json({ valideur: await pgDb.get('SELECT * FROM hub_entretiens.valideurs WHERE id = ?', [r.lastID]) });
        } catch (e) {
            if (e.code === '23505') return fail(res, 409, 'Cet agent est déjà valideur.');
            handle(res, 'promote', e);
        }
    },

    // DELETE /api/ep-ville/mes-agents/:id/valideur — je retire la fonction de valideur à l'un de mes agents
    demote: async (req, res) => {
        try {
            const { valideur } = await requireValideur(req);
            const sub = await pgDb.get(
                `SELECT v.id FROM hub_entretiens.valideurs v JOIN hub_entretiens.rattachements r ON r.id = v.rattachement_id
                 WHERE r.id = ? AND r.valideur_id = ? AND v.parent_valideur_id = ?`, [Number(req.params.id), valideur.id, valideur.id]);
            if (!sub) throw httpError(404, 'Cet agent n’est pas un sous-valideur désigné par vous.');
            await deleteValideurSafely(sub.id);
            res.json({ message: 'Fonction de valideur retirée.' });
        } catch (e) { handle(res, 'demote', e); }
    },

    // PUT /api/ep-ville/mes-agents/:id/compte-ad { username } — rattache l'agent à un compte de l'AD (agent inconnu de l'AD sous son nom RH)
    linkAd: async (req, res) => {
        try {
            const { valideur } = await requireValideur(req);
            const id = Number(req.params.id);
            const rat = await ratUnderMe(valideur, id);
            if (!rat) throw httpError(404, 'Agent introuvable dans votre liste.');
            const username = text(req.body && req.body.username);
            if (!username) throw httpError(400, 'Compte AD à rattacher manquant.');
            const hit = (await adSearch(username).catch(() => [])).find(h => text(h.username).toLowerCase() === username.toLowerCase());
            if (!hit) throw httpError(404, 'Compte introuvable dans l’Active Directory.');
            const other = await pgDb.get('SELECT id FROM hub_entretiens.rattachements WHERE LOWER(agent_username) = LOWER(?) AND id <> ?', [hit.username, id]);
            if (other) throw httpError(409, 'Ce compte AD est déjà rattaché à un autre agent.');
            await applyAdAccount(id, hit);
            res.json({ message: 'Compte AD rattaché.', username: hit.username, email: text(hit.email) });
        } catch (e) { handle(res, 'linkAd', e); }
    },

    // DELETE /api/ep-ville/mes-agents/:id/compte-ad — détache le compte AD (rattachement erroné)
    unlinkAd: async (req, res) => {
        try {
            const { valideur } = await requireValideur(req);
            const id = Number(req.params.id);
            const rat = await ratUnderMe(valideur, id);
            if (!rat) throw httpError(404, 'Agent introuvable dans votre liste.');
            await pgDb.run("UPDATE hub_entretiens.rattachements SET agent_username = NULL, agent_email = '', ad_checked_at = NOW() WHERE id = ?", [id]);
            await pgDb.run("UPDATE hub_entretiens.entretiens SET agent_username = '', agent_email = '', updated_at = NOW() WHERE rattachement_id = ? AND deleted_at IS NULL AND COALESCE(source, 'hub') = 'ville'", [id]);
            res.json({ message: 'Compte AD détaché.' });
        } catch (e) { handle(res, 'unlinkAd', e); }
    },

    // DELETE /api/ep-ville/mes-agents/:id — retire l'agent de ma liste (refusé si son EP a démarré)
    removeAgent: async (req, res) => {
        try {
            const { valideur } = await requireValideur(req);
            const id = Number(req.params.id);
            const rat = await pgDb.get('SELECT * FROM hub_entretiens.rattachements WHERE id = ? AND valideur_id = ?', [id, valideur.id]);
            if (!rat) throw httpError(404, 'Agent introuvable dans votre liste.');
            const asValideur = await pgDb.get('SELECT 1 AS x FROM hub_entretiens.valideurs WHERE rattachement_id = ?', [id]);
            if (asValideur) throw httpError(409, 'Cet agent est valideur : retirez d’abord sa fonction de valideur.');
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
