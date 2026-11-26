/**
 * Base des agents à évaluer — gestes d'administration hors classeur :
 *  - désactiver un agent (départ en retraite prochain…) et le réactiver ;
 *  - ajouter un agent absent du classeur, retrouvé dans la base RH (API SEDIT RH).
 *
 * Un agent désactivé a `a_conserver = FALSE` (il sort de toutes les listes) et `desactive = TRUE` (le prochain dépôt du
 * classeur ne le réintègre pas). Un agent ajouté à la main porte `ajoute_manuel = TRUE` (le dépôt ne le retire pas).
 */
const { pgDb } = require('../../shared/database');
const sedit = require('../../shared/sedit-rh');
const base = require('./ep-base.service');

const text = (v) => (v === null || v === undefined ? '' : String(v)).trim();
/** Matricules comparés sans les zéros de tête (« 2209 » = « 0002209 »). */
const mkey = (m) => (/^\d+$/.test(text(m)) ? text(m).replace(/^0+/, '') : text(m));
const fail = (status, message, extra) => Object.assign(new Error(message), { status, ...extra });

const findAgent = (matricule) => pgDb.get("SELECT * FROM hub_entretiens.base_agents WHERE matricule = ? OR (matricule ~ '^[0-9]+$' AND ltrim(matricule, '0') = ?)", [text(matricule), mkey(matricule)]);

/** Entretiens non terminés de l'agent dans les campagnes non closes. */
const openEntretiens = (matricule) => pgDb.all(
    `SELECT e.* FROM hub_entretiens.entretiens e JOIN hub_entretiens.campaigns c ON c.id = e.campaign_id
     WHERE e.deleted_at IS NULL AND c.statut <> 'close' AND e.statut NOT IN ('realise', 'cloture') AND ltrim(e.agent_matricule, '0') = ?`, [mkey(matricule)]);

const started = (e) => e.statut !== 'a_planifier' || e.preparation_statut !== 'non_commencee'
    || e.evaluation_statut !== 'non_commencee' || (e.crep_statut && e.crep_statut !== 'non_envoye');

const REMOVED_BY = 'agent désactivé';

/** Désactive un agent : il sort de la liste et ses entretiens non terminés sont retirés (suppression logique, restaurable). */
async function desactiver(matricule, { motif, confirm } = {}, actor) {
    await base.ensureSchema();
    const a = await findAgent(matricule);
    if (!a) throw fail(404, 'Agent introuvable.');
    if (a.desactive) throw fail(409, 'Cet·te agent·e est déjà désactivé·e.');
    const entretiens = await openEntretiens(a.matricule);
    const commences = entretiens.filter(started);
    const evalues = Number((await pgDb.get('SELECT COUNT(*)::int AS n FROM hub_entretiens.base_agents WHERE a_conserver AND valideur_matricule = ?', [a.matricule]))?.n) || 0;
    if (commences.length && !confirm) {
        throw fail(409, `L’entretien de ${a.nom_prenom} est déjà engagé (planifié, préparé ou saisi). Il sera retiré des listes, mais pourra être retrouvé en réactivant l’agent·e.`, { needsConfirm: true });
    }
    await pgDb.run(
        `UPDATE hub_entretiens.base_agents SET desactive = TRUE, a_conserver = FALSE, desactive_motif = ?, desactive_par = ?, desactive_at = NOW() WHERE matricule = ?`,
        [text(motif).slice(0, 200) || 'Départ en retraite', actor?.username || '', a.matricule]);
    const ent = require('../entretiens/entretiens.service');
    for (const e of entretiens) {
        await ent.removeOutlook(e);
        await pgDb.run("UPDATE hub_entretiens.entretiens SET deleted_at = NOW(), deleted_by = ?, outlook_event_id = NULL, outlook_status = 'non_planifie' WHERE id = ?", [REMOVED_BY, e.id]);
    }
    base.invalidateBaseCache();
    await ent.logAudit({ actor, action: 'agent_desactive', details: { matricule: a.matricule, agent: a.nom_prenom, motif: text(motif) || 'Départ en retraite', entretiens_retires: entretiens.length } });
    return { retires: entretiens.length, evalues };
}

/** Réactive un agent et restaure les entretiens retirés à sa désactivation. */
async function reactiver(matricule, actor) {
    await base.ensureSchema();
    const a = await findAgent(matricule);
    if (!a || !a.desactive) throw fail(404, 'Agent désactivé introuvable.');
    await pgDb.run("UPDATE hub_entretiens.base_agents SET desactive = FALSE, a_conserver = TRUE, desactive_motif = '', desactive_par = '', desactive_at = NULL WHERE matricule = ?", [a.matricule]);
    const removed = await pgDb.all(
        `SELECT e.id, e.campaign_id FROM hub_entretiens.entretiens e JOIN hub_entretiens.campaigns c ON c.id = e.campaign_id
         WHERE e.deleted_at IS NOT NULL AND e.deleted_by = ? AND c.statut <> 'close' AND ltrim(e.agent_matricule, '0') = ? ORDER BY e.id DESC`, [REMOVED_BY, mkey(a.matricule)]);
    let restaures = 0;
    for (const e of removed) {
        const live = await pgDb.get("SELECT 1 AS x FROM hub_entretiens.entretiens WHERE campaign_id = ? AND deleted_at IS NULL AND ltrim(agent_matricule, '0') = ?", [e.campaign_id, mkey(a.matricule)]);
        if (live) continue;
        await pgDb.run('UPDATE hub_entretiens.entretiens SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [e.id]);
        restaures++;
    }
    base.invalidateBaseCache();
    await base.syncEntretiens({ matricules: [a.matricule], actor }).catch((e) => console.warn('[ep-base] synchro entretiens :', e.message));
    await require('../entretiens/entretiens.service').logAudit({ actor, action: 'agent_reactive', details: { matricule: a.matricule, agent: a.nom_prenom, entretiens_restaures: restaures } });
    return { restaures };
}

async function listDesactives() {
    await base.ensureSchema();
    return pgDb.all('SELECT matricule, nom_prenom, direction, service, poste, desactive_motif, desactive_par, desactive_at FROM hub_entretiens.base_agents WHERE desactive ORDER BY nom_prenom');
}

/** Matricules désactivés (clés sans zéros de tête). */
async function disabledKeys() {
    await base.ensureSchema();
    return new Set((await pgDb.all('SELECT matricule FROM hub_entretiens.base_agents WHERE desactive')).map(r => mkey(r.matricule)));
}

/** Recherche dans la base RH (API SEDIT RH), avec la situation de chaque agent dans la base des entretiens. */
async function rechercherRh(q) {
    await base.ensureSchema();
    if (text(q).length < 2) return [];
    if (!sedit.configured()) throw fail(409, 'L’API SEDIT RH n’est pas configurée : la recherche dans la base RH est indisponible.');
    const hits = await sedit.searchAgentsFull(q, 30);
    const rows = await pgDb.all('SELECT matricule, a_conserver, desactive FROM hub_entretiens.base_agents');
    const by = new Map(rows.map(r => [mkey(r.matricule), r]));
    return hits.map(h => {
        const r = by.get(mkey(h.matricule));
        return { ...h, situation: r?.desactive ? 'desactive' : r?.a_conserver ? 'present' : 'absent' };
    });
}

/**
 * Ajoute à la base un agent retrouvé dans la base RH. Direction, chemin et évaluateurs proposés sont repris d'un collègue du même
 * service quand il y en a un ; sinon on garde les libellés RH et l'administrateur choisit l'évaluateur.
 */
async function ajouter({ matricule, modele, categorie, valideur_matricule: valideur } = {}, actor) {
    await base.ensureSchema();
    if (!sedit.configured()) throw fail(409, 'L’API SEDIT RH n’est pas configurée.');
    const wanted = text(matricule);
    if (!wanted) throw fail(400, 'Choisissez un agent de la base RH.');
    const found = await sedit.agentsByMatricule([wanted]);
    const rh = found.get(wanted);
    if (!rh) throw fail(404, 'Agent introuvable dans la base RH.');
    if (!(await pgDb.get('SELECT 1 AS x FROM hub_entretiens.crep_templates WHERE name = ?', [text(modele)]))) throw fail(400, 'Choisissez un modèle de compte rendu.');
    const existing = await findAgent(rh.matricule);
    if (existing?.desactive) throw fail(409, `${existing.nom_prenom} est désactivé·e : réactivez-le·la depuis « Agent·e·s désactivé·e·s ».`);
    if (existing?.a_conserver) throw fail(409, `${existing.nom_prenom} est déjà dans la liste des agent·e·s à évaluer.`);

    const mat = existing ? existing.matricule : (/^\d+$/.test(rh.matricule) ? rh.matricule.padStart(7, '0') : rh.matricule);
    const boss = text(valideur);
    if (boss) {
        if (mkey(boss) === mkey(mat)) throw fail(400, 'Un agent ne peut pas être son propre évaluateur.');
        if (!(await pgDb.get('SELECT 1 AS x FROM hub_entretiens.base_agents WHERE matricule = ?', [boss]))) throw fail(400, 'Évaluateur inconnu.');
    }
    const cat = ['A', 'B', 'C'].includes(text(categorie).toUpperCase()) ? text(categorie).toUpperCase() : '';
    const nomPrenom = `${rh.nom} ${rh.prenom.toUpperCase()}`.trim();

    if (existing) {
        await pgDb.run(
            `UPDATE hub_entretiens.base_agents SET a_conserver = TRUE, ajoute_manuel = TRUE, ajoute_par = ?, modele = ?, categorie = COALESCE(NULLIF(?, ''), categorie) WHERE matricule = ?`,
            [actor?.username || '', text(modele), cat, mat]);
        if (boss) await pgDb.run("UPDATE hub_entretiens.base_agents SET valideur_matricule = ?, valideur_source = 'admin' WHERE matricule = ?", [boss, mat]);
    } else {
        const peer = await pgDb.get(
            "SELECT direction, chemin, unit_code, valideur_candidats FROM hub_entretiens.base_agents WHERE a_conserver AND LOWER(service) = LOWER(?) AND ? <> '' AND NOT ajoute_manuel LIMIT 1",
            [rh.service, rh.service]);
        const candidats = peer ? (typeof peer.valideur_candidats === 'string' ? peer.valideur_candidats : JSON.stringify(peer.valideur_candidats || [])) : '[]';
        await pgDb.run(
            `INSERT INTO hub_entretiens.base_agents (matricule, nom_prenom, nom, prenom, modele, a_conserver, direction, service, poste, grade, chemin, unit_code,
                valideur_candidats, valideur_matricule, valideur_source, categorie, ajoute_manuel, ajoute_par)
             VALUES (?, ?, ?, ?, ?, TRUE, ?, ?, ?, ?, ?, ?, CAST(? AS jsonb), ?, ?, ?, TRUE, ?)`,
            [mat, nomPrenom, rh.nom, rh.prenom, text(modele), peer?.direction || rh.direction, rh.service, rh.poste || rh.fonction, rh.grade,
                peer?.chemin || rh.direction, peer?.unit_code || '', candidats, boss, boss ? 'admin' : '', cat, actor?.username || '']);
        await base.rapprocherAd(mat).catch((e) => console.warn('[ep-base] rapprochement AD :', e.message));
    }
    base.invalidateBaseCache();
    await base.loadTemplateCache();
    const sync = await base.syncEntretiens({ matricules: [mat], actor }).catch((e) => ({ erreurs: [e.message] }));
    await require('../entretiens/entretiens.service').logAudit({ actor, action: 'agent_ajoute_rh', details: { matricule: mat, agent: nomPrenom, modele: text(modele), evaluateur: boss } });
    const row = await findAgent(mat);
    return { matricule: mat, nom_prenom: row.nom_prenom, email: row.email || '', entretien_cree: !!sync.crees, sans_valideur: !boss && !row.valideur_matricule, erreurs: sync.erreurs || [] };
}

module.exports = { desactiver, reactiver, listDesactives, disabledKeys, rechercherRh, ajouter, mkey };
