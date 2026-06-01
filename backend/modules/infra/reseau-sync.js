/**
 * Synchronisation du réseau (switchs + liens) depuis l'API Infra réseau.
 *
 * Source : hub.infra_apis WHERE key='reseau_links' (URL + clé + header).
 * Effet  : vide toutes les tables hub_reseau puis réinjecte :
 *   - les switchs uniques → hub_reseau.equipements
 *   - les liens port-à-port → hub_reseau.switch_links
 *
 * Réutilisé par la route Admin (POST /api/infra/sync/reseau) et le cron quotidien.
 * fetch natif (Node ≥18) — undici n'utilise pas HTTP_PROXY → connexion directe.
 */
const { pgDb, pool } = require('../../shared/database');

function stripQuotes(s) {
    if (s == null) return null;
    return String(s).replace(/^"+|"+$/g, '').trim() || null;
}

// Certains stacks IRF renvoient site_id/alias sous forme de chaîne JSON
// mappant membre → valeur (ex. {"11_m1":"S001B02","11_m2":"S004B01"}).
function looksLikeJsonObject(s) {
    return typeof s === 'string' && s.trim().startsWith('{');
}
function summarizeJsonValues(s) {
    try {
        const obj = JSON.parse(s);
        const vals = [...new Set(Object.values(obj).map(v => stripQuotes(String(v))).filter(Boolean))];
        return vals.join(', ');
    } catch { return null; }
}
// site_code propre pour equipements : null si c'est un blob JSON multi-membres.
function cleanSiteCode(siteId) {
    if (!siteId || looksLikeJsonObject(siteId)) return null;
    return siteId;
}
// alias lisible pour notes : résume le mapping JSON le cas échéant.
function cleanAlias(alias) {
    if (looksLikeJsonObject(alias)) {
        const s = summarizeJsonValues(alias);
        return s ? `Membres : ${s}` : null;
    }
    return stripQuotes(alias);
}

async function fetchLinks(cfg) {
    const url = `${(cfg.base_url || '').replace(/\/+$/, '')}${cfg.endpoint || ''}`;
    const headerName = cfg.header_name || 'x-api-key';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
        const resp = await fetch(url, {
            headers: { [headerName]: cfg.api_key || '', Accept: 'application/json' },
            signal: ctrl.signal,
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} depuis ${url}`);
        const data = await resp.json();
        if (!Array.isArray(data)) throw new Error('Réponse inattendue (tableau attendu)');
        return data;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * @param {string} origin  'manual' | 'cron' (traçabilité)
 * @returns {Promise<{switches:number, links:number}>}
 */
async function syncReseauLinks(origin = 'manual') {
    const cfg = await pgDb.get(`SELECT * FROM hub.infra_apis WHERE key = ?`, ['reseau_links']);
    if (!cfg) throw new Error("Configuration 'reseau_links' introuvable dans hub.infra_apis");
    if (cfg.enabled === false) throw new Error("L'API 'reseau_links' est désactivée");

    const links = await fetchLinks(cfg);

    // Dédup des switchs par switch_id (côtés local + remote)
    const switches = new Map();
    for (const l of links) {
        for (const side of [l.local, l.remote]) {
            if (side && side.switch_id != null && !switches.has(side.switch_id)) {
                switches.set(side.switch_id, side);
            }
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(`
            TRUNCATE hub_reseau.switch_links, hub_reseau.equipements, hub_reseau.network_links,
                     hub_reseau.network_access, hub_reseau.ducts, hub_reseau.liaisons_fo,
                     hub_reseau.vlans, hub_reseau.irf_stacks
            RESTART IDENTITY CASCADE
        `);

        // Switchs → equipements
        for (const sw of switches.values()) {
            await client.query(
                `INSERT INTO hub_reseau.equipements
                   (site_code, nom, type, ip_management, statut, notes)
                 VALUES ($1,$2,'SWITCH_L2',$3,'PROD',$4)`,
                [cleanSiteCode(sw.site_id), sw.hostname || `switch-${sw.switch_id}`, sw.ip || null, cleanAlias(sw.alias)]
            );
        }

        // Liens → switch_links
        for (const l of links) {
            const a = l.local || {};
            const b = l.remote || {};
            const intra = !!a.site_id && !!b.site_id && a.site_id === b.site_id;
            await client.query(
                `INSERT INTO hub_reseau.switch_links
                   (ext_id, local_switch_id, local_hostname, local_alias, local_site_id, local_ip, local_port, local_port_description,
                    remote_switch_id, remote_hostname, remote_alias, remote_site_id, remote_ip, remote_port, remote_port_description,
                    is_intra_site)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
                [l.id ?? null,
                 a.switch_id ?? null, a.hostname || null, stripQuotes(a.alias), a.site_id || null, a.ip || null, a.port || null, a.port_description || null,
                 b.switch_id ?? null, b.hostname || null, stripQuotes(b.alias), b.site_id || null, b.ip || null, b.port || null, b.port_description || null,
                 intra]
            );
        }

        await client.query(
            `UPDATE hub.infra_apis
               SET last_sync_at = NOW(), last_sync_status = $1, last_sync_count = $2, updated_at = NOW()
             WHERE key = 'reseau_links'`,
            [`OK (${origin})`, links.length]
        );
        await client.query('COMMIT');
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        await pool.query(
            `UPDATE hub.infra_apis SET last_sync_at = NOW(), last_sync_status = $1, updated_at = NOW() WHERE key = 'reseau_links'`,
            [`ERREUR (${origin}): ${e.message}`.slice(0, 300)]
        ).catch(() => {});
        throw e;
    } finally {
        client.release();
    }

    return { switches: switches.size, links: links.length };
}

module.exports = { syncReseauLinks, fetchLinks };
