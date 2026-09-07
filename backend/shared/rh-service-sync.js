/**
 * Synchronisation direction/service (magapp.users.service_code / service_complement,
 * et hub.users en SQLite) depuis le référentiel RH source de vérité
 * (oracle.rh_v_extract_dsi), au lieu de dépendre des attributs AD (company/department)
 * recopiés une seule fois au moment de la connexion — cf. investigation Sarah MEDALEL
 * (service affiché obsolète tant que l'agent ne se reconnecte pas, ou si l'attribut AD
 * lui-même n'a pas été mis à jour par l'équipe infra au moment du changement de poste).
 *
 * Rapprochement par nom d'utilisateur reconstruit (1re lettre du prénom + nom, sans
 * accents/espaces) — c'est la convention de nommage des comptes AD/Hub observée sur
 * l'ensemble des comptes existants. Les collisions (deux agents donneraient le même
 * nom d'utilisateur) sont détectées et exclues par prudence plutôt que d'affecter la
 * mauvaise fiche à quelqu'un.
 */
const { pool, getSqlite } = require('./database');

const ACTIVE_FILTER = `("POSITION_L" LIKE 'Activité%' OR "POSITION_L" LIKE 'Temps partiel%')`;

function normalizeForUsername(s) {
    return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '') // accents
        .replace(/[^a-zA-Z]/g, '') // ne garde que les lettres (espaces, tirets, apostrophes retirés)
        .toLowerCase();
}

function titleCaseFr(s) {
    if (!s) return s;
    return String(s).toLowerCase().split(' ').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

async function syncAgentServicesFromRH({ dryRun = false } = {}) {
    const rhRes = await pool.query(`
        SELECT "MATRICULE", "NOM", "PRENOM", "DIRECTION_L", "SERVICE_L"
        FROM oracle.rh_v_extract_dsi
        WHERE ${ACTIVE_FILTER}
    `);

    const byUsername = new Map();
    for (const r of rhRes.rows) {
        const p = normalizeForUsername(r.PRENOM);
        const n = normalizeForUsername(r.NOM);
        if (!p || !n) continue;
        const candidate = p[0] + n;
        if (!byUsername.has(candidate)) byUsername.set(candidate, []);
        byUsername.get(candidate).push(r);
    }

    const targets = [];
    const collisions = [];
    for (const [username, list] of byUsername.entries()) {
        if (list.length > 1) {
            collisions.push({ username, matricules: list.map(r => r.MATRICULE) });
            continue;
        }
        const r = list[0];
        targets.push({
            username,
            matricule: r.MATRICULE,
            direction: titleCaseFr(r.DIRECTION_L),
            service: titleCaseFr(r.SERVICE_L)
        });
    }

    let pgChecked = 0, pgUpdated = 0;
    const pgChanges = [];
    for (const t of targets) {
        const existing = await pool.query(
            'SELECT service_code, service_complement FROM magapp.users WHERE username = $1',
            [t.username]
        );
        if (existing.rowCount === 0) continue; // pas de compte existant, on ne crée rien
        pgChecked++;
        const cur = existing.rows[0];
        if (cur.service_code === t.direction && cur.service_complement === t.service) continue;
        pgChanges.push({ username: t.username, before: cur, after: { service_code: t.direction, service_complement: t.service } });
        if (!dryRun) {
            await pool.query(
                'UPDATE magapp.users SET service_code = $1, service_complement = $2 WHERE username = $3',
                [t.direction, t.service, t.username]
            );
            pgUpdated++;
        }
    }

    // hub.users : SQLite locale à CETTE instance uniquement (voir avertissement mail_settings —
    // même limite : ce script/cron doit tourner sur chaque instance pour la couvrir).
    let sqliteChecked = 0, sqliteUpdated = 0;
    const sqliteChanges = [];
    try {
        const db = getSqlite();
        if (db) {
            for (const t of targets) {
                const existing = await db.get('SELECT service_code, service_complement FROM users WHERE LOWER(username) = ?', [t.username]);
                if (!existing) continue;
                sqliteChecked++;
                if (existing.service_code === t.direction && existing.service_complement === t.service) continue;
                sqliteChanges.push({ username: t.username, before: existing, after: { service_code: t.direction, service_complement: t.service } });
                if (!dryRun) {
                    await db.run('UPDATE users SET service_code = ?, service_complement = ? WHERE LOWER(username) = ?', [t.direction, t.service, t.username]);
                    sqliteUpdated++;
                }
            }
        }
    } catch (e) {
        console.error('[RH-SYNC] Erreur SQLite:', e.message);
    }

    return {
        dryRun,
        rhAgents: rhRes.rows.length,
        usableUsernames: targets.length,
        collisions,
        pg: { checked: pgChecked, updated: pgUpdated, changes: pgChanges },
        sqlite: { checked: sqliteChecked, updated: sqliteUpdated, changes: sqliteChanges }
    };
}

module.exports = { syncAgentServicesFromRH, normalizeForUsername, titleCaseFr };
