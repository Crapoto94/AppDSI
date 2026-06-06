const { getSqlite, pgDb } = require('../../shared/database');
const { 
    logMouchard, 
    flattenLDAPEntry, 
    decodeLDAPString, 
    parseOracleDate, 
    parseLDAPDate,
    calculateMatchScore 
} = require('../../shared/utils');
const ldap = require('ldapjs');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

let adSyncProgress = { current: 0, total: 0, status: 'idle', currentName: '', associations: 0 };
let azureSyncProgress = { current: 0, total: 0, status: 'idle' };

// ─── Organigramme : résolution des responsables (skill « organigramme ») ──────

const _norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** Vrai si svcCode est le service d'accueil de la direction dirCode
 *  (ex. BF1 pour BF, BB1 pour BB : code service = code direction + 1-2 chars). */
function isDirectionService(dirCode, svcCode) {
    if (!dirCode || !svcCode) return false;
    const tail = svcCode.slice(dirCode.length);
    return svcCode.startsWith(dirCode) && tail.length >= 1 && tail.length <= 2;
}
const _fullName = (a) => `${(a.PRENOM || '').trim()} ${(a.NOM || '').trim()}`.trim();

// Tokenisation pour comparer un intitulé de poste à un libellé de direction.
// On compare par PRÉFIXE de 5 caractères pour absorber les variantes inclusives
// (GENERAL·E vs GENERALE, etc.).
const _STOP = new Set(['DE', 'DES', 'DU', 'LA', 'LE', 'LES', 'ET', 'AU', 'AUX', 'EN', 'SUR', 'POUR', 'DSI']);
const _tokens = (s) => _norm(s).split(' ').filter(t => t.length > 1 && !_STOP.has(t));
const _keyset = (s) => new Set(_tokens(s).map(t => t.slice(0, 5)));
function _overlap(aKeys, bKeys) {
    if (!aKeys.size || !bKeys.size) return 0;
    let inter = 0;
    for (const k of aKeys) if (bKeys.has(k)) inter++;
    return inter / Math.min(aKeys.size, bKeys.size);
}

/**
 * Indexe, depuis le référentiel agents (SQLite), les responsables actifs par niveau.
 * Détecte la table réelle (`referentiel_agents` en prod, `V_EXTRACT_DSI` ici).
 * Tolérant : renvoie un index vide si la lecture échoue (la page ne casse jamais).
 */
async function resolveManagerIndex() {
    const empty = { ok: false, directorsByDir: new Map(), serviceBySvc: new Map(), secteurBySvc: new Map() };
    try {
        // Source : oracle.rh_v_extract_dsi (PostgreSQL)
        // POSITION_L : "Activité*" et "Temps partiel*" = agent en poste
        // DATE_DEPART : stocké en DD/MM/YYYY (texte) → on se fie à POSITION_L uniquement
        const rows = await pgDb.all(`
            SELECT "NOM", "PRENOM", "DIRECTION", "SERVICE", "POSTE_L"
            FROM oracle.rh_v_extract_dsi
            WHERE ("POSITION_L" LIKE 'Activité%' OR "POSITION_L" LIKE 'Temps partiel%')
              AND (
                "POSTE_L" LIKE 'DIRECTEUR%'
                OR "POSTE_L" LIKE 'RESPONSABLE DU SERVICE%'
                OR "POSTE_L" LIKE 'RESPONSABLE DU SECTEUR%'
              )
        `);

        const directorsByDir = new Map();
        const serviceBySvc = new Map();
        const secteurBySvc = new Map();
        const push = (map, key, val) => { if (!key) return; if (!map.has(key)) map.set(key, []); map.get(key).push(val); };

        for (const r of rows) {
            const poste = (r.POSTE_L || '').toUpperCase();
            if (poste.startsWith('DIRECTEUR')) push(directorsByDir, r.DIRECTION, r);
            else if (poste.startsWith('RESPONSABLE DU SERVICE')) push(serviceBySvc, r.SERVICE, r);
            else if (poste.startsWith('RESPONSABLE DU SECTEUR')) push(secteurBySvc, r.SERVICE, r);
        }
        return { ok: true, directorsByDir, serviceBySvc, secteurBySvc };
    } catch (e) {
        console.warn('[ORGANIGRAMME] Résolution responsables impossible:', e.message);
        return empty;
    }
}

function _result(agent, role, ambiguite) {
    return {
        responsable: agent ? _fullName(agent) : null,
        responsable_poste: agent ? agent.POSTE_L : null,
        responsable_role: agent ? role : null,
        vacant: !agent,
        ambiguite: ambiguite || null,
    };
}

function pickDirector(mgr, dirCode, dirLabel) {
    const cands = mgr.directorsByDir.get(dirCode) || [];
    if (cands.length === 0) return _result(null, 'Directeur', mgr.ok ? null : 'indéterminé (référentiel agents indisponible)');

    // Le vrai chef de direction est celui dont l'intitulé reprend le nom de la direction.
    // Beaucoup de « directeurs » sont des chefs d'équipement (crèche, maison de quartier)
    // ou des adjoints (DGA) : on les départage par similarité de libellé.
    const dirKeys = _keyset(String(dirLabel).replace(/^DIRECTION\s+/i, ''));
    const scored = cands.map(a => {
        const tail = String(a.POSTE_L || '').replace(/^DIRECTEUR[^\s]*\s*/i, ''); // retire « DIRECTEUR·TRICE »
        return { a, score: _overlap(dirKeys, _keyset(tail)), adjoint: /ADJOINT/i.test(a.POSTE_L || '') };
    });
    scored.sort((x, y) => (y.score - x.score) || (x.adjoint - y.adjoint));
    const best = scored[0];

    if (best.score === 0) {
        // Aucun « directeur » ne correspond à l'intitulé de la direction → poste de direction vacant,
        // mais on signale les titres « directeur » présents (souvent des chefs d'équipement).
        const liste = cands.map(c => `${_fullName(c)} [${c.POSTE_L}]`).join(' ; ');
        return _result(null, 'Directeur', `Aucun directeur rattaché à l'intitulé de la direction. Présents : ${liste}`);
    }
    const top = scored.filter(s => s.score === best.score && s.adjoint === best.adjoint);
    const ambiguite = top.length > 1 ? `Plusieurs directeurs équivalents : ${top.map(t => _fullName(t.a)).join(', ')}` : null;
    return _result(best.a, 'Directeur', ambiguite);
}

function pickServiceResp(mgr, svcCode, dirCode, dirLabel) {
    const cands = mgr.serviceBySvc.get(svcCode) || [];
    if (cands.length > 0) {
        const ambiguite = cands.length > 1 ? `Plusieurs responsables : ${cands.map(_fullName).join(', ')}` : null;
        return _result(cands[0], 'Responsable de service', ambiguite);
    }
    // Pas de responsable de service trouvé → vérifie si c'est le service d'accueil de la direction
    // (code service = code direction + 1-2 chars, ex. BF1 pour BF).
    // Dans ce cas, le directeur fait office de responsable de service.
    if (isDirectionService(dirCode, svcCode)) {
        const dirResult = pickDirector(mgr, dirCode, dirLabel);
        if (!dirResult.vacant && dirResult.responsable) {
            return {
                ...dirResult,
                responsable_role: 'Directeur (resp. service d\'accueil)',
                ambiguite: dirResult.ambiguite
            };
        }
    }
    return _result(null, 'Responsable de service', null);
}

function pickSecteurResp(mgr, svcCode, secteurLabel) {
    // Les agents n'ont pas de code secteur : on aligne par libellé sur le suffixe de POSTE_L
    const cands = mgr.secteurBySvc.get(svcCode) || [];
    if (cands.length === 0) return _result(null, 'Responsable de secteur', null);
    const target = _norm(secteurLabel);
    const matches = cands.filter(a => {
        const tail = _norm((a.POSTE_L || '').replace(/^RESPONSABLE DU SECTEUR\s*/i, ''));
        return tail && target && (tail === target || tail.includes(target) || target.includes(tail));
    });
    if (matches.length === 0) return _result(null, 'Responsable de secteur', null);
    const ambiguite = matches.length > 1 ? `Plusieurs responsables : ${matches.map(_fullName).join(', ')}` : null;
    return _result(matches[0], 'Responsable de secteur', ambiguite);
}

const rhController = {
    // Statistiques du référentiel agents
    getStats: async (req, res) => {
        try {
            const db = getSqlite();
            const today = new Date().toISOString().substring(0, 10);

            // Positions actives configurées
            const activePosSetting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_active_positions'");
            let activePosSql = "";
            let activePosParams = [];
            if (activePosSetting && activePosSetting.setting_value) {
                const positions = JSON.parse(activePosSetting.setting_value);
                if (positions.length > 0) {
                    activePosSql = ` AND POSITION_L IN (${positions.map(() => '?').join(',')})`;
                    activePosParams = positions;
                }
            }

            const total = (await db.get("SELECT count(*) as c FROM rh.referentiel_agents")).c;
            const actif = (await db.get(`
                SELECT count(*) as c FROM rh.referentiel_agents 
                WHERE date_plusvu IS NULL 
                AND (DATE_DEPART IS NULL OR DATE_DEPART = "" OR DATE_DEPART > ?)
                ${activePosSql}
            `, [today, ...activePosParams])).c;

            const partiQuery = `
                SELECT count(*) as c FROM rh.referentiel_agents 
                WHERE date_plusvu IS NOT NULL 
                OR (DATE_DEPART IS NOT NULL AND DATE_DEPART != '' AND DATE_DEPART <= ?)
            `;
            const parti = (await db.get(partiQuery, [today])).c;

            const arriveeFuture = (await db.get(`
                SELECT count(*) as c FROM rh.referentiel_agents 
                WHERE DATE_ARRIVEE > ?
            `, [today])).c;

            const adLie = (await db.get(`
                SELECT count(*) as c FROM rh.referentiel_agents 
                WHERE ad_username IS NOT NULL AND ad_username != ''
                AND date_plusvu IS NULL 
                AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)
            `, [today])).c;

            const adNonLie = Math.max(0, actif - adLie);

            res.json({ total, actif, parti, arriveeFuture, adLie, adNonLie });
        } catch (err) {
            console.error("Stats RH Error:", err);
            res.status(500).json({ message: 'Erreur stats', error: err.message });
        }
    },

    // Récupérer la hiérarchie des agents
    getHierarchy: async (req, res) => {
        try {
            const db = getSqlite();
            const today = new Date().toISOString().substring(0, 10);
            const agents = await db.all(`
                SELECT DIRECTION_L, SERVICE_L, SECTEUR_L, MATRICULE, NOM, PRENOM, POSTE_L, date_plusvu, DATE_DEPART, DATE_ARRIVEE
                FROM rh.referentiel_agents 
                WHERE date_plusvu IS NULL 
                AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)
                ORDER BY DIRECTION_L, SERVICE_L, SECTEUR_L, NOM, PRENOM
            `, [today]);

            const hierarchy = {};
            agents.forEach(agent => {
                const direction = agent.DIRECTION_L || 'SANS DIRECTION';
                const service = agent.SERVICE_L;
                const secteur = agent.SECTEUR_L;
                
                if (!hierarchy[direction]) hierarchy[direction] = { name: direction, count: 0, agents: [], services: {} };
                if (service && service.trim() !== '' && service !== 'SANS SERVICE') {
                    if (!hierarchy[direction].services[service]) hierarchy[direction].services[service] = { name: service, count: 0, agents: [], secteurs: {} };
                }
                if (secteur && secteur.trim() !== '' && secteur !== 'SANS SECTEUR' && service) {
                    if (!hierarchy[direction].services[service].secteurs[secteur]) hierarchy[direction].services[service].secteurs[secteur] = { name: secteur, count: 0, agents: [] };
                }
                
                hierarchy[direction].count++;
                if (!service || service.trim() === '' || service === 'SANS SERVICE') {
                    hierarchy[direction].agents.push(agent);
                } else {
                    hierarchy[direction].services[service].count++;
                    if (!secteur || secteur.trim() === '' || secteur === 'SANS SECTEUR') {
                        hierarchy[direction].services[service].agents.push(agent);
                    } else {
                        hierarchy[direction].services[service].secteurs[secteur].count++;
                        hierarchy[direction].services[service].secteurs[secteur].agents.push(agent);
                    }
                }
            });

            const result = Object.values(hierarchy).map(d => ({
                ...d,
                services: Object.values(d.services).map(s => ({
                    ...s,
                    secteurs: Object.values(s.secteurs)
                }))
            }));

            res.json(result);
        } catch (err) {
            res.status(500).json({ message: 'Erreur hiérarchie', error: err.message });
        }
    },

    // Organisation chart depuis oracle.rh_siim_organigramme_v2 (repli sur v1 si vide)
    getOrganisationChart: async (req, res) => {
        try {
            // Détermine la table à utiliser : v2 en priorité, repli sur v1 si vide
            const v2Count = await pgDb.get('SELECT COUNT(*) c FROM oracle.rh_siim_organigramme_v2').catch(() => ({ c: 0 }));
            const orgTable = Number(v2Count.c) > 0 ? 'oracle.rh_siim_organigramme_v2' : 'oracle.rh_siim_organigramme';

            const rows = await pgDb.all(`
                SELECT DISTINCT
                    "DIRECTION"   AS direction_code,
                    "DIRECTION_L" AS direction_label,
                    "SERVICE"     AS service_code,
                    "SERVICE_L"   AS service_label,
                    "SECTEUR"     AS secteur_code,
                    "SECTEUR_L"   AS secteur_label
                FROM ${orgTable}
                WHERE "DIRECTION" IS NOT NULL
                  AND "DIRECTION" NOT LIKE '$%'
                  AND "DIRECTION" != ''
                  AND "DIRECTION" NOT IN ('AA', 'BZ')
            `);

            // Build hierarchy: Direction → Service → Secteur
            // Les valeurs commençant par '$' sont des placeholders SIIM à ignorer.
            const isReal = (v) => v && v.trim() && !v.trim().startsWith('$');
            const dirMap = new Map();
            for (const row of rows) {
                const dCode = row.direction_code?.trim();
                const dLabel = row.direction_label?.trim() || dCode;
                const sCode = row.service_code?.trim();
                const sLabel = row.service_label?.trim() || sCode;
                const secCode = row.secteur_code?.trim();
                const secLabel = row.secteur_label?.trim() || secCode;

                if (!isReal(dCode)) continue;

                if (!dirMap.has(dCode)) {
                    dirMap.set(dCode, { code: dCode, label: dLabel, services: new Map() });
                }
                const dir = dirMap.get(dCode);

                if (isReal(sCode)) {
                    if (!dir.services.has(sCode)) {
                        dir.services.set(sCode, { code: sCode, label: sLabel, secteurs: new Map() });
                    }
                    const svc = dir.services.get(sCode);

                    if (isReal(secCode)) {
                        if (!svc.secteurs.has(secCode)) {
                            svc.secteurs.set(secCode, { code: secCode, label: secLabel });
                        }
                    }
                }
            }

            // Résolution des responsables par niveau (skill « organigramme »).
            // Non bloquant : si la table agents est absente/illisible, on rend l'arbre sans responsables.
            const mgr = await resolveManagerIndex();

            const result = Array.from(dirMap.values())
                .sort((a, b) => a.code.localeCompare(b.code))
                .map(dir => ({
                    code: dir.code,
                    label: dir.label,
                    ...pickDirector(mgr, dir.code, dir.label),
                    services: Array.from(dir.services.values())
                        .sort((a, b) => a.code.localeCompare(b.code))
                        .map(svc => ({
                            code: svc.code,
                            label: svc.label,
                            ...pickServiceResp(mgr, svc.code, dir.code, dir.label),
                            secteurs: Array.from(svc.secteurs.values())
                                .sort((a, b) => a.code.localeCompare(b.code))
                                .map(sec => ({
                                    code: sec.code,
                                    label: sec.label,
                                    ...pickSecteurResp(mgr, svc.code, sec.label)
                                }))
                        }))
                }));

            res.json(result);
        } catch (err) {
            res.status(500).json({ message: 'Erreur organigramme', error: err.message });
        }
    },

    // Onboarding
    getOnboarding: async (req, res) => {
        try {
            const db = getSqlite();
            const today = new Date().toISOString().substring(0, 10);
            const limitDate = new Date();
            limitDate.setDate(limitDate.getDate() - 30);
            const limitDateStr = limitDate.toISOString().substring(0, 10);

            const agents = await db.all(`
                SELECT MATRICULE, NOM, PRENOM, SERVICE_L, DIRECTION_L, DATE_ARRIVEE, POSTE_L, ad_username, email, ad_account_enabled 
                FROM rh.referentiel_agents 
                WHERE DATE_ARRIVEE >= ? AND DATE_ARRIVEE != ''
                AND date_plusvu IS NULL
                ORDER BY DATE_ARRIVEE ASC
            `, [limitDateStr]);

            const result = { not_started: [], in_progress: [], completed: [] };
            const now = new Date().getTime();

            agents.forEach(agent => {
                const arrivalTime = agent.DATE_ARRIVEE ? new Date(agent.DATE_ARRIVEE).getTime() : 0;
                const daysSince = (now - arrivalTime) / (1000 * 3600 * 24);
                const isNouvOrProch = daysSince <= 30;

                if (isNouvOrProch) {
                    result.not_started.push(agent);
                } else if (!agent.ad_username) {
                    result.not_started.push(agent);
                } else if (!agent.email || agent.email === '') {
                    result.in_progress.push(agent);
                } else {
                    result.completed.push(agent);
                }
            });
            res.json(result);
        } catch (err) {
            res.status(500).json({ message: 'Erreur onboarding', error: err.message });
        }
    },

    // Alignments
    getAlignments: async (req, res) => {
        try {
            const db = getSqlite();
            const today = new Date().toISOString().substring(0, 10);
            const mappingsStr = req.query.mappings;
            let mappings = [{rhField: 'DIRECTION_L', adField: 'department'}, {rhField: 'SERVICE_L', adField: 'company'}];
            if (mappingsStr) {
                try { mappings = JSON.parse(mappingsStr); } catch (e) {}
            }

            const agents = await db.all(`
                SELECT * FROM rh.referentiel_agents 
                WHERE ad_username IS NOT NULL AND ad_username != ''
                AND date_plusvu IS NULL 
                AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)
            `, [today]);

            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            if (!adSettings || !adSettings.is_enabled) return res.status(400).json({ message: "AD non configuré" });

            const adAttributes = [...new Set(['sAMAccountName', ...mappings.map(m => m.adField)])];

            const allADUsers = await new Promise((resolve, reject) => {
                const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
                client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                    if (err) { client.destroy(); return reject(err); }
                    const users = new Map();
                    const searchOptions = {
                        filter: '(objectClass=user)',
                        scope: 'sub',
                        attributes: adAttributes,
                        paged: true
                    };
                    client.search(adSettings.base_dn, searchOptions, (err, searchRes) => {
                        if (err) { client.destroy(); return reject(err); }
                        searchRes.on('searchEntry', (entry) => { 
                            const u = flattenLDAPEntry(entry);
                            if (u.sAMAccountName) users.set(u.sAMAccountName.toLowerCase(), u);
                        });
                        searchRes.on('end', () => { client.destroy(); resolve(users); });
                        searchRes.on('error', (err) => { client.destroy(); reject(err); });
                    });
                });
            });

            const discrepancies = [];
            for (const agent of agents) {
                const sam = agent.ad_username.includes('\\') ? agent.ad_username.split('\\').pop().toLowerCase() : agent.ad_username.toLowerCase();
                const adUser = allADUsers.get(sam);
                if (adUser) {
                    let hasDiscrepancy = false;
                    const rhData = {};
                    const adData = {};
                    for (const m of mappings) {
                        const rhVal = agent[m.rhField] || '';
                        const adVal = adUser[m.adField] || '';
                        rhData[m.rhField] = rhVal;
                        adData[m.adField] = adVal;
                        if (String(rhVal).trim() !== String(adVal).trim()) hasDiscrepancy = true;
                    }
                    if (hasDiscrepancy) {
                        discrepancies.push({ matricule: agent.MATRICULE, nom: agent.NOM, prenom: agent.PRENOM, ad_username: agent.ad_username, rh: rhData, ad: adData, mappings });
                    }
                }
            }
            res.json(discrepancies);
        } catch (err) {
            res.status(500).json({ message: 'Erreur alignements', error: err.message });
        }
    },

    alignToAD: async (req, res) => {
        try {
            const db = getSqlite();
            const { agents } = req.body;
            if (!agents || !Array.isArray(agents)) return res.status(400).json({ message: "Liste d'agents invalide" });

            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            if (!adSettings || !adSettings.is_enabled) return res.status(400).json({ message: "AD non configuré" });

            const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
            await new Promise((resolve, reject) => {
                client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => err ? reject(err) : resolve());
            });

            const results = { success: 0, error: 0, details: [] };
            for (const agent of agents) {
                try {
                    const sam = agent.ad_username.includes('\\') ? agent.ad_username.split('\\').pop() : agent.ad_username;
                    const searchRes = await new Promise((resolve, reject) => {
                        client.search(adSettings.base_dn, { filter: `(sAMAccountName=${sam})`, scope: 'sub', attributes: ['dn'] }, (err, res) => {
                            if (err) return reject(err);
                            let dn = null;
                            res.on('searchEntry', (entry) => { dn = entry.objectName; });
                            res.on('end', () => resolve(dn));
                            res.on('error', reject);
                        });
                    });

                    if (!searchRes) throw new Error("Utilisateur AD non trouvé");
                    const changes = [];
                    for (const [adField, newValue] of Object.entries(agent.updates)) {
                        changes.push(new ldap.Change({ operation: 'replace', modification: { [adField]: newValue || '' } }));
                    }
                    if (changes.length > 0) {
                        await new Promise((resolve, reject) => {
                            client.modify(searchRes, changes, (err) => err ? reject(err) : resolve());
                        });
                    }
                    results.success++;
                } catch (err) {
                    results.error++;
                    results.details.push({ matricule: agent.matricule, error: err.message });
                }
            }
            client.destroy();
            res.json(results);
        } catch (err) {
            res.status(500).json({ message: 'Erreur mise à jour AD', error: err.message });
        }
    },

    // Liste des agents avec filtrage
    getAgents: async (req, res) => {
        try {
            const db = getSqlite();
            const { q, filter, management_level, page = 1, limit = 50 } = req.query;
            let whereClauses = [];
            let params = [];
            const today = new Date().toISOString().substring(0, 10);

            if (q && q.trim()) {
                const term = `%${q.trim()}%`;
                whereClauses.push("(NOM LIKE ? OR PRENOM LIKE ? OR MATRICULE LIKE ? OR ad_username LIKE ?)");
                params.push(term, term, term, term);
            }

            if (filter) {
                switch (filter) {
                    case 'actif':
                        const activePosSetting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_active_positions'");
                        if (activePosSetting && activePosSetting.setting_value) {
                            const positions = JSON.parse(activePosSetting.setting_value);
                            if (positions.length > 0) {
                                whereClauses.push(`POSITION_L IN (${positions.map(() => '?').join(',')})`);
                                params.push(...positions);
                            }
                        }
                        whereClauses.push("date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)");
                        params.push(today);
                        break;
                    case 'non_actif':
                        const inactivePosSetting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_active_positions'");
                        if (inactivePosSetting && inactivePosSetting.setting_value) {
                            const positions = JSON.parse(inactivePosSetting.setting_value);
                            if (positions.length > 0) {
                                whereClauses.push(`POSITION_L NOT IN (${positions.map(() => '?').join(',')})`);
                                params.push(...positions);
                            } else whereClauses.push("1=0");
                        } else whereClauses.push("1=0");
                        break;
                    case 'parti':
                        whereClauses.push("(date_plusvu IS NOT NULL OR (DATE_DEPART IS NOT NULL AND DATE_DEPART != '' AND DATE_DEPART <= ?))");
                        params.push(today);
                        break;
                    case 'future':
                        whereClauses.push("DATE_ARRIVEE IS NOT NULL AND DATE_ARRIVEE != '' AND DATE_ARRIVEE > ?");
                        params.push(today);
                        break;
                    case 'ad_linked':
                        whereClauses.push("ad_username IS NOT NULL AND date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)");
                        params.push(today);
                        break;
                    case 'ad_unlinked':
                        whereClauses.push("ad_username IS NULL AND date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)");
                        params.push(today);
                        break;
                    case 'arrivals':
                        whereClauses.push("DATE_ARRIVEE IS NOT NULL AND DATE_ARRIVEE > ?");
                        params.push(today);
                        break;
                    case 'departures':
                        whereClauses.push("(DATE_DEPART IS NOT NULL AND DATE_DEPART != '' AND DATE_DEPART >= ?)");
                        params.push(today);
                        break;
                    case 'modified':
                        whereClauses.push("last_sync_modified = 1");
                        break;
                }
            }

            if (management_level) {
                switch (management_level) {
                    case 'dg': whereClauses.push("POSTE_L LIKE 'DIRECTEUR·TRICE GENERAL·E%'"); break;
                    case 'dir': whereClauses.push("POSTE_L LIKE 'DIRECTEUR·TRICE D%'"); break;
                    case 'service': whereClauses.push("POSTE_L LIKE 'RESPONSABLE DU SERVICE%'"); break;
                    case 'secteur': whereClauses.push("POSTE_L LIKE 'RESPONSABLE DU SECTEUR%'"); break;
                }
            }

            const whereSql = whereClauses.length > 0 ? "WHERE " + whereClauses.join(" AND ") : "";
            const countQuery = `SELECT count(*) as c FROM rh.referentiel_agents ${whereSql}`;
            const total = (await db.get(countQuery, params)).c;

            const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
            const agentsQuery = `SELECT * FROM rh.referentiel_agents ${whereSql} ORDER BY NOM ASC, PRENOM ASC LIMIT ? OFFSET ?`;
            const agents = await db.all(agentsQuery, [...params, parseInt(limit), offset]);

            const activePosSetting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_active_positions'");
            const activePositions = activePosSetting && activePosSetting.setting_value ? JSON.parse(activePosSetting.setting_value) : [];
            const activePosSet = new Set(activePositions.map(p => String(p).toUpperCase()));

            for (let agent of agents) {
                const agentPos = (agent.POSITION_L || '').trim().toUpperCase();
                agent.is_active_position = (activePositions.length === 0) || (agentPos !== '' && activePosSet.has(agentPos));
                if (management_level) {
                    let countQuery = '';
                    let countParams = [today];
                    if (management_level === 'service' || management_level === 'secteur') {
                        if (agent.SERVICE_L) {
                            countQuery = `SELECT count(*) as c FROM rh.referentiel_agents WHERE SERVICE_L = ? AND date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)`;
                            countParams.unshift(agent.SERVICE_L);
                        }
                    } else if (management_level === 'dir' || management_level === 'dg') {
                        if (agent.DIRECTION_L) {
                            countQuery = `SELECT count(*) as c FROM rh.referentiel_agents WHERE DIRECTION_L = ? AND date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)`;
                            countParams.unshift(agent.DIRECTION_L);
                        }
                    }
                    if (countQuery) {
                        const resCount = await db.get(countQuery, countParams);
                        agent.subordinate_count = resCount.c;
                    } else agent.subordinate_count = 0;
                }
            }
            res.json({ agents, total, page: parseInt(page), limit: parseInt(limit) });
        } catch (err) {
            res.status(500).json({ message: 'Erreur lecture agents', error: err.message });
        }
    },

    deleteADLink: async (req, res) => {
        try {
            const db = getSqlite();
            const { matricule } = req.params;
            await db.run(
                `UPDATE rh.referentiel_agents SET ad_username = NULL, ad_account_enabled = NULL, ad_last_logon = NULL, date_fin_association_ad = ? WHERE MATRICULE = ?`,
                [new Date().toISOString().substring(0, 10), matricule]
            );
            res.json({ message: `Lien AD supprimé pour ${matricule}` });
        } catch (err) {
            res.status(500).json({ message: 'Erreur suppression lien AD', error: err.message });
        }
    },

    getPositions: async (req, res) => {
        try {
            const db = getSqlite();
            const positions = await db.all('SELECT DISTINCT POSITION_L FROM rh.referentiel_agents WHERE POSITION_L IS NOT NULL AND POSITION_L != "" ORDER BY POSITION_L ASC');
            res.json(positions.map(p => p.POSITION_L));
        } catch (err) {
            res.status(500).json({ message: 'Erreur lecture positions', error: err.message });
        }
    },

    getActivePositions: async (req, res) => {
        try {
            const db = getSqlite();
            const setting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_active_positions'");
            res.json(setting ? JSON.parse(setting.setting_value) : []);
        } catch (err) {
            res.status(500).json({ message: 'Erreur lecture positions actives', error: err.message });
        }
    },

    setActivePositions: async (req, res) => {
        try {
            const db = getSqlite();
            const { positions } = req.body;
            await db.run("INSERT OR REPLACE INTO app_settings (setting_key, setting_value, description) VALUES (?, ?, ?)",
                ['rh_active_positions', JSON.stringify(positions || []), 'Liste des positions POSITION_L considérées comme actives']);
            res.json({ message: 'Positions enregistrées' });
        } catch (err) {
            res.status(500).json({ message: 'Erreur sauvegarde positions actives', error: err.message });
        }
    },

    getAlignMappings: async (req, res) => {
        try {
            const db = getSqlite();
            const setting = await db.get("SELECT setting_value FROM app_settings WHERE setting_key = 'rh_ad_align_mappings'");
            res.json(setting && setting.setting_value ? JSON.parse(setting.setting_value) : [{rhField: 'DIRECTION_L', adField: 'department'}, {rhField: 'SERVICE_L', adField: 'company'}]);
        } catch (err) {
            res.status(500).json({ message: 'Erreur lecture mappings', error: err.message });
        }
    },

    setAlignMappings: async (req, res) => {
        try {
            const db = getSqlite();
            const { mappings } = req.body;
            await db.run("INSERT OR REPLACE INTO app_settings (setting_key, setting_value, description) VALUES (?, ?, ?)",
                ['rh_ad_align_mappings', JSON.stringify(mappings || []), 'Paramétrage des champs RH/AD pour les alignements']);
            res.json({ message: 'Mappings enregistrés' });
        } catch (err) {
            res.status(500).json({ message: 'Erreur sauvegarde mappings', error: err.message });
        }
    },

    // Synchronisation RH Oracle
    syncRH: async (req, res) => {
        const username = req.user?.username || 'system';
        const db = getSqlite();
        console.log("[SYNC RH] Début de la synchronisation RH complète...");
        try {
            const oracleColsInfo = await db.all("PRAGMA rh.table_info('V_EXTRACT_DSI')");
            if (!oracleColsInfo || oracleColsInfo.length === 0) return res.status(500).json({ message: "La table source V_EXTRACT_DSI est introuvable." });
            const oracleCols = oracleColsInfo.map(c => c.name);

            const createCols = oracleCols.map(c => `"${c}" TEXT${c === 'MATRICULE' ? ' PRIMARY KEY' : ''}`).join(', ');
            await db.run(`CREATE TABLE IF NOT EXISTS rh.referentiel_agents (${createCols}, ad_username TEXT, date_plusvu DATETIME, last_sync_modified INTEGER DEFAULT 0)`);
            
            try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN ad_username TEXT"); } catch (e) {}
            try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN date_plusvu DATETIME"); } catch (e) {}
            for (const col of oracleCols) { try { await db.run(`ALTER TABLE rh.referentiel_agents ADD COLUMN "${col}" TEXT`); } catch (e) {} }
            try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN date_fin_association_ad DATETIME"); } catch (e) {}
            try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN azure_id TEXT"); } catch (e) {}
            try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN azure_license TEXT"); } catch (e) {}
            try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN azure_account_enabled INTEGER DEFAULT 1"); } catch (e) {}
            try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN last_sync_modified INTEGER DEFAULT 0"); } catch (e) {}
            try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN ad_last_logon TEXT"); } catch (e) {}
            try { await db.run("ALTER TABLE rh.referentiel_agents ADD COLUMN ad_account_enabled INTEGER DEFAULT 1"); } catch (e) {}

            const extractData = await db.all("SELECT * FROM rh.V_EXTRACT_DSI");
            const existingMatricules = new Set((await db.all("SELECT MATRICULE FROM rh.referentiel_agents")).map(r => String(r.MATRICULE)));
            await db.run('UPDATE rh.referentiel_agents SET last_sync_modified = 0');

            await db.run('BEGIN TRANSACTION');
            try {
                const placeholders = oracleCols.map(() => '?').join(',');
                const setCols = oracleCols.map(c => `"${c}"=excluded."${c}"`).join(',');
                const stmt = await db.prepare(`
                    INSERT INTO rh.referentiel_agents (${oracleCols.map(c => `"${c}"`).join(', ')}, date_plusvu, last_sync_modified) 
                    VALUES (${placeholders}, NULL, 0)
                    ON CONFLICT(MATRICULE) DO UPDATE SET ${setCols}, last_sync_modified = CASE WHEN ${oracleCols.map(c => `COALESCE(rh.referentiel_agents."${c}", '') <> COALESCE(excluded."${c}", '')`).join(' OR ')} THEN 1 ELSE 0 END, date_plusvu=NULL
                `);
                for (const row of extractData) {
                    const rowKeys = Object.keys(row);
                    const values = oracleCols.map(c => {
                        const actualKey = rowKeys.find(k => k.toUpperCase() === c.toUpperCase());
                        let val = actualKey ? row[actualKey] : null;
                        if (c.toUpperCase().includes('DATE')) val = parseOracleDate(val);
                        return val !== null ? String(val) : null;
                    });
                    await stmt.run(values);
                }
                await stmt.finalize();
                await db.run('UPDATE rh.referentiel_agents SET date_plusvu = CURRENT_TIMESTAMP WHERE date_plusvu IS NULL AND MATRICULE NOT IN (SELECT MATRICULE FROM rh.V_EXTRACT_DSI)');
                const agentsToFix = await db.all('SELECT MATRICULE, DATE_ARRIVEE, DATE_DEPART FROM rh.referentiel_agents');
                for (const a of agentsToFix) {
                    const newArrival = parseOracleDate(a.DATE_ARRIVEE);
                    const newDepart = parseOracleDate(a.DATE_DEPART);
                    if (newArrival !== a.DATE_ARRIVEE || newDepart !== a.DATE_DEPART) await db.run('UPDATE rh.referentiel_agents SET DATE_ARRIVEE = ?, DATE_DEPART = ? WHERE MATRICULE = ?', [newArrival, newDepart, a.MATRICULE]);
                }
                await db.run('COMMIT');
            } catch (err) { await db.run('ROLLBACK'); throw err; }

            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            let matchedCount = 0;
            if (adSettings && adSettings.is_enabled) {
                const agentsADaLier = await db.all("SELECT MATRICULE, NOM, PRENOM FROM rh.referentiel_agents WHERE ad_username IS NULL AND DATE_DEPART IS NULL AND date_plusvu IS NULL");
                for (const rhA of agentsADaLier) {
                    try {
                        const adMatch = await searchADUserByName(rhA.NOM, rhA.PRENOM, adSettings);
                        if (adMatch) {
                            await db.run('UPDATE rh.referentiel_agents SET ad_username = ? WHERE MATRICULE = ?', [adMatch.sAMAccountName, rhA.MATRICULE]);
                            matchedCount++;
                        }
                    } catch (e) {}
                }
            }
            const beforeSyncCount = (await db.get("SELECT COUNT(*) as c FROM rh.referentiel_agents WHERE date_plusvu IS NULL")).c; // This logic needs careful check if it's correct
            const results = { total: extractData.length, new: extractData.filter(r => !existingMatricules.has(String(r.MATRICULE))).length, modified: (await db.get("SELECT COUNT(*) as c FROM rh.referentiel_agents WHERE last_sync_modified = 1")).c, departed: 0, matched_ad: matchedCount };
            // Departed calculation was Math.max(0, beforeSyncCount + newAgentsCount - afterSyncActiveCount)
            
            await db.run('INSERT INTO rh_sync_logs (sync_type, status, message, details, username) VALUES (?, ?, ?, ?, ?)', ['RH Oracle', 'success', `Sync RH terminée`, JSON.stringify(results), username]);
            res.json({ message: 'Synchronisation complète terminée', stats: results });
        } catch (err) {
            res.status(500).json({ message: 'Erreur synchronisation', error: err.message });
        }
    },

    getADSyncProgress: (req, res) => res.json(adSyncProgress),

    syncAD: async (req, res) => {
        const username = req.user?.username || 'system';
        const db = getSqlite();
        if (adSyncProgress.status === 'running') return res.status(400).json({ message: "Synchro déjà en cours" });
        adSyncProgress = { current: 0, total: 0, status: 'running', associations: 0, currentName: 'Synchronisation en cours...' };
        res.json({ message: "Synchronisation AD lancée" });

        (async () => {
            try {
                const today = new Date().toISOString().substring(0, 10);
                const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
                if (!adSettings || !adSettings.is_enabled) { adSyncProgress.status = 'error'; return; }

                const allADUsers = await new Promise((resolve, reject) => {
                    const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
                    client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                        if (err) { client.destroy(); return reject(err); }
                        const users = [];
                        const searchOptions = { filter: '(objectClass=user)', scope: 'sub', attributes: ['*', 'lastLogonTimestamp', 'lastLogon'], paged: true, sizeLimit: 10000 };
                        client.search(adSettings.base_dn, searchOptions, (err, searchRes) => {
                            if (err) { client.destroy(); return reject(err); }
                            searchRes.on('searchEntry', (entry) => { users.push(flattenLDAPEntry(entry)); });
                            searchRes.on('end', () => { client.destroy(); resolve(users); });
                            searchRes.on('error', (err) => { client.destroy(); reject(err); });
                        });
                    });
                });

                const adMatriculeMap = new Map();
                const adNameMap = new Map();
                allADUsers.forEach(u => {
                    if (!u.sAMAccountName) return;
                    const sam = u.sAMAccountName.toString().toLowerCase();
                    adMatriculeMap.set(sam, u);
                    if (u.employeeID) adMatriculeMap.set(u.employeeID.toString().toLowerCase(), u);
                    if (u.description && typeof u.description === 'string') {
                        const match = u.description.match(/\d{5,8}/);
                        if (match) adMatriculeMap.set(match[0], u);
                    }
                    const displayName = decodeLDAPString(u.displayName);
                    const cn = decodeLDAPString(u.cn);
                    const norm = (displayName || cn || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
                    if (norm.length > 5) adNameMap.set(norm, u);
                });

                const agentsToSync = await db.all(`SELECT MATRICULE, NOM, PRENOM, ad_username FROM rh.referentiel_agents WHERE date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)`, [today]);
                adSyncProgress.total = agentsToSync.length;

                for (let i = 0; i < agentsToSync.length; i++) {
                    const agent = agentsToSync[i];
                    adSyncProgress.current = i + 1;
                    adSyncProgress.currentName = `Traitement: ${i+1}/${agentsToSync.length}`;
                    if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 30));

                    const agentMatricule = agent.MATRICULE;
                    const matricule = String(agentMatricule).toLowerCase().trim();
                    const fullNameNorm = (agent.NOM + agent.PRENOM).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
                    const fullNameNormReverse = (agent.PRENOM + agent.NOM).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");

                    let match = null;
                    if (agent.ad_username) {
                        const samLookup = agent.ad_username.includes('\\') ? agent.ad_username.split('\\').pop().toLowerCase() : agent.ad_username.toLowerCase();
                        const existingAD = adMatriculeMap.get(samLookup);
                        if (existingAD) {
                            const uac = parseInt(existingAD.userAccountControl);
                            const enabled = isNaN(uac) ? 1 : (!(uac & 2) ? 1 : 0);
                            const d1 = parseLDAPDate(existingAD.lastLogonTimestamp);
                            const d2 = parseLDAPDate(existingAD.lastLogon);
                            let bestLogon = (d1 && d2) ? (d1 > d2 ? d1 : d2) : (d1 || d2 || null);
                            await db.run('UPDATE rh.referentiel_agents SET ad_account_enabled = ?, ad_last_logon = ? WHERE MATRICULE = ?', [enabled, bestLogon ? bestLogon.toISOString() : null, agentMatricule]);
                            adSyncProgress.associations++;
                        } else await db.run('UPDATE rh.referentiel_agents SET ad_account_enabled = 0 WHERE MATRICULE = ?', [agentMatricule]);
                        continue;
                    }

                    if (matricule) match = adMatriculeMap.get(matricule);
                    if (!match && fullNameNorm.length > 3) match = adNameMap.get(fullNameNorm) || adNameMap.get(fullNameNormReverse);

                    if (match) {
                        const uac = parseInt(match.userAccountControl);
                        const enabled = isNaN(uac) ? 1 : (!(uac & 2) ? 1 : 0);
                        const d1 = parseLDAPDate(match.lastLogonTimestamp);
                        const d2 = parseLDAPDate(match.lastLogon);
                        let bestLogon = (d1 && d2) ? (d1 > d2 ? d1 : d2) : (d1 || d2 || null);
                        const email = Array.isArray(match.mail) ? match.mail[0] : (match.mail || null);
                        await db.run(`UPDATE rh.referentiel_agents SET ad_username = ?, ad_account_enabled = ?, ad_last_logon = ?, mail = ?, date_fin_association_ad = NULL WHERE MATRICULE = ?`, [match.sAMAccountName, enabled, bestLogon ? bestLogon.toISOString() : null, email, agentMatricule]);
                        adSyncProgress.associations++;
                    }
                }
                adSyncProgress.status = 'done';
                await db.run('INSERT INTO rh_sync_logs (sync_type, status, message, details, username) VALUES (?, ?, ?, ?, ?)', ['Active Directory', 'success', `Sync AD terminée: ${adSyncProgress.associations} associations`, JSON.stringify(adSyncProgress), username]);
            } catch (err) {
                console.error("Erreur Synchro AD:", err);
                adSyncProgress.status = 'error';
                await db.run('INSERT INTO rh_sync_logs (sync_type, status, message, details, username) VALUES (?, ?, ?, ?, ?)', ['Active Directory', 'error', `Erreur: ${err.message}`, JSON.stringify(adSyncProgress), username]);
            }
        })();
    },

    getAzureSyncProgress: (req, res) => res.json(azureSyncProgress),

    syncAzure: async (req, res) => {
        const username = req.user?.username || 'system';
        const db = getSqlite();
        if (azureSyncProgress.status === 'running') return res.status(400).json({ message: "Synchro Azure déjà en cours" });
        azureSyncProgress = { current: 0, total: 0, status: 'running' };
        res.json({ message: "Synchronisation Azure AD lancée" });

        (async () => {
            try {
                const today = new Date().toISOString().substring(0, 10);
                const settings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
                if (!settings || !settings.is_enabled) { azureSyncProgress.status = 'error'; return; }

                const tokenRes = await axios.post(`https://login.microsoftonline.com/${settings.tenant_id}/oauth2/v2.0/token`, new URLSearchParams({ client_id: settings.client_id, client_secret: settings.client_secret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
                const accessToken = tokenRes.data.access_token;

                const skuMap = new Map();
                try {
                    const skuRes = await axios.get('https://graph.microsoft.com/v1.0/subscribedSkus', { headers: { Authorization: `Bearer ${accessToken}` } });
                    skuRes.data.value.forEach(sku => skuMap.set(sku.skuId, sku.skuPartNumber));
                } catch (e) {}

                let allAzureUsers = [];
                let nextLink = 'https://graph.microsoft.com/v1.0/users?$select=id,displayName,userPrincipalName,mail,assignedLicenses,accountEnabled';
                while (nextLink) {
                    const graphRes = await axios.get(nextLink, { headers: { Authorization: `Bearer ${accessToken}` } });
                    allAzureUsers = allAzureUsers.concat(graphRes.data.value);
                    nextLink = graphRes.data['@odata.nextLink'];
                }

                const agents = await db.all(`SELECT MATRICULE, NOM, PRENOM, mail, azure_id FROM rh.referentiel_agents WHERE date_plusvu IS NULL AND (DATE_DEPART IS NULL OR DATE_DEPART = '' OR DATE_DEPART > ?)`, [today]);
                azureSyncProgress.total = agents.length;

                const azNameMap = new Map();
                const azEmailMap = new Map();
                allAzureUsers.forEach(u => {
                    if (u.displayName) {
                        const normalized = u.displayName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
                        azNameMap.set(normalized, u);
                        const parts = u.displayName.trim().split(/\s+/);
                        if (parts.length >= 2) {
                            const reversed = (parts.slice(1).join('') + parts[0]).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
                            if (!azNameMap.has(reversed)) azNameMap.set(reversed, u);
                        }
                    }
                    if (u.mail) azEmailMap.set(u.mail.toLowerCase(), u);
                    if (u.userPrincipalName) azEmailMap.set(u.userPrincipalName.toLowerCase(), u);
                });

                for (let i = 0; i < agents.length; i++) {
                    const agent = agents[i];
                    azureSyncProgress.current = i + 1;
                    if (i % 5 === 0) await new Promise(resolve => setTimeout(resolve, 30));

                    const agentNom = agent.NOM || '';
                    const agentPrenom = agent.PRENOM || '';
                    const agentMail = agent.mail || '';
                    const normalizedRH = (agentNom + agentPrenom).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");
                    const normalizedRHReverse = (agentPrenom + agentNom).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z]/g, "");

                    let match = agentMail ? azEmailMap.get(agentMail.toLowerCase()) : null;
                    if (!match) match = azNameMap.get(normalizedRH) || azNameMap.get(normalizedRHReverse);
                    if (match) {
                        let mainLicense = null;
                        if (match.assignedLicenses && match.assignedLicenses.length > 0) {
                            const userSkus = match.assignedLicenses.map(l => skuMap.get(l.skuId) || l.skuId);
                            const priorities = ['SPE_E5', 'SPE_E3', 'SPE_E1', 'ENTERPRISEPREMIUM', 'ENTERPRISEPACK', 'M365_BUSINESS_PREMIUM', 'O365_BUSINESS_PREMIUM', 'M365_BUSINESS_STANDARD', 'O365_BUSINESS_STANDARD', 'M365_BUSINESS_BASIC', 'O365_BUSINESS_ESSENTIALS', 'DEVELOPER_PACK', 'DEVELOPERPACK_E5', 'MICROSOFT_365_COPILOT', 'TEAMS_EXPLORATORY', 'FLOW_FREE', 'ET1', 'E1', 'E3', 'E5'];
                            for (const p of priorities) { if (userSkus.includes(p)) { mainLicense = p; break; } }
                            if (!mainLicense) mainLicense = userSkus[0] || null;
                        }
                        await db.run('UPDATE rh.referentiel_agents SET azure_id = ?, azure_license = ?, azure_account_enabled = ? WHERE MATRICULE = ?', [match.id, mainLicense, match.accountEnabled ? 1 : 0, agent.MATRICULE]);
                    }
                }
                azureSyncProgress.status = 'done';
                await db.run('INSERT INTO rh_sync_logs (sync_type, status, message, details, username) VALUES (?, ?, ?, ?, ?)', ['Azure AD', 'success', `Sync Azure terminée.`, JSON.stringify(azureSyncProgress), username]);
            } catch (err) {
                console.error("Erreur Synchro Azure:", err);
                azureSyncProgress.status = 'error';
                await db.run('INSERT INTO rh_sync_logs (sync_type, status, message, details, username) VALUES (?, ?, ?, ?, ?)', ['Azure AD', 'error', `Erreur: ${err.message}`, JSON.stringify(azureSyncProgress), username]);
            }
        })();
    },

    getLogs: async (req, res) => {
        try {
            const db = getSqlite();
            const logs = await db.all('SELECT * FROM rh_sync_logs ORDER BY created_at DESC LIMIT 100');
            res.json(logs);
        } catch (err) {
            res.status(500).json({ message: 'Erreur lecture logs', error: err.message });
        }
    },

    getADProposals: async (req, res) => {
        try {
            const db = getSqlite();
            await db.run('CREATE TABLE IF NOT EXISTS rh.ad_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, matricule TEXT, ad_username TEXT, score INTEGER, status TEXT DEFAULT "pending", date_creation DATETIME DEFAULT CURRENT_TIMESTAMP)');
            const proposals = await db.all(`
                SELECT p.*, a.NOM, a.PRENOM 
                FROM rh.ad_proposals p 
                JOIN rh.referentiel_agents a ON p.matricule = a.MATRICULE
            `);
            res.json(proposals);
        } catch (err) {
            res.status(500).json({ message: 'Erreur lecture propositions', error: err.message });
        }
    },

    handleADProposal: async (req, res) => {
        const { id, action } = req.body;
        try {
            const db = getSqlite();
            const prop = await db.get('SELECT * FROM rh.ad_proposals WHERE id = ?', [id]);
            if (!prop) return res.status(404).json({ message: 'Proposition introuvable' });

            if (action === 'accept') {
                await db.run('UPDATE rh.referentiel_agents SET ad_username = ?, date_fin_association_ad = NULL WHERE MATRICULE = ?', [prop.ad_username, prop.matricule]);
            }
            await db.run('DELETE FROM rh.ad_proposals WHERE id = ?', [id]);
            res.json({ message: 'Action effectuée' });
        } catch (err) {
            res.status(500).json({ message: 'Erreur action', error: err.message });
        }
    },

    getUnlinkedAD: async (req, res) => {
        try {
            const db = getSqlite();
            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            if (!adSettings || !adSettings.is_enabled) return res.status(503).json({ message: "AD non configuré" });

            const allADUsers = await new Promise((resolve, reject) => {
                const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
                client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                    if (err) { client.destroy(); return reject(err); }
                    const users = [];
                    client.search(adSettings.base_dn, { filter: '(objectClass=user)', paged: true, scope: 'sub', attributes: ['sAMAccountName', 'displayName', 'cn', 'mail'] }, (err, searchRes) => {
                        if (err) { client.destroy(); return reject(err); }
                        searchRes.on('searchEntry', (entry) => { users.push(flattenLDAPEntry(entry)); });
                        searchRes.on('end', () => { client.destroy(); resolve(users); });
                        searchRes.on('error', (err) => { client.destroy(); reject(err); });
                    });
                });
            });

            const associated = await db.all('SELECT ad_username FROM rh.referentiel_agents WHERE ad_username IS NOT NULL');
            const associatedSet = new Set(associated.map(a => a.ad_username ? a.ad_username.toLowerCase() : ''));
            const unlinked = allADUsers.filter(u => u.sAMAccountName && !associatedSet.has(u.sAMAccountName.toLowerCase()));
            res.json(unlinked);
        } catch (err) {
            res.status(500).json({ message: 'Erreur recherche AD', error: err.message });
        }
    },

    associateManual: async (req, res) => {
        const { matricule, ad_username } = req.body;
        if (!matricule) return res.status(400).json({ message: 'Matricule manquant' });
        try {
            const db = getSqlite();
            if (!ad_username) {
                await db.run('UPDATE rh.referentiel_agents SET ad_username = NULL, date_fin_association_ad = NULL WHERE MATRICULE = ?', [matricule]);
            } else {
                await db.run('UPDATE rh.referentiel_agents SET ad_username = ?, date_fin_association_ad = NULL WHERE MATRICULE = ?', [ad_username, matricule]);
            }
            res.json({ message: 'Association mise à jour' });
        } catch (err) {
            res.status(500).json({ message: 'Erreur association', error: err.message });
        }
    },

    searchADManual: async (req, res) => {
        const { q } = req.query;
        if (!q || q.length < 2) return res.json([]);
        try {
            const db = getSqlite();
            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            if (!adSettings || !adSettings.is_enabled) return res.status(503).json({ message: "AD non configuré" });

            const results = await new Promise((resolve, reject) => {
                const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}`, connectTimeout: 5000, timeout: 5000 });
                client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                    if (err) { client.destroy(); return reject(err); }
                    const users = [];
                    client.search(adSettings.base_dn, { filter: `(&(objectClass=user)(|(sAMAccountName=*${q}*)(cn=*${q}*)(displayName=*${q}*)(mail=*${q}*)))`, scope: 'sub', attributes: ['sAMAccountName', 'displayName', 'cn', 'mail', 'title', 'department'], sizeLimit: 20 }, (err, searchRes) => {
                        if (err) { client.destroy(); return reject(err); }
                        searchRes.on('searchEntry', (entry) => { users.push(flattenLDAPEntry(entry)); });
                        searchRes.on('end', () => { client.destroy(); resolve(users); });
                        searchRes.on('error', (err) => { client.destroy(); reject(err); });
                    });
                });
            });
            res.json(results);
        } catch (err) {
            res.status(500).json({ message: 'Erreur recherche AD', error: err.message });
        }
    },

    getAgentDetails: async (req, res) => {
        const { matricule } = req.params;
        try {
            const db = getSqlite();
            const agent = await db.get('SELECT * FROM rh.referentiel_agents WHERE MATRICULE = ?', [matricule]);
            if (!agent) return res.status(404).json({ message: 'Agent introuvable' });

            const details = { rh: agent, ad: null, azure: null };
            const adSettings = await db.get('SELECT * FROM ad_settings WHERE id = 1');
            if (agent.ad_username && adSettings && adSettings.is_enabled) {
                try {
                    details.ad = await new Promise((resolve, reject) => {
                        const client = ldap.createClient({ url: `ldap://${adSettings.host}:${adSettings.port}` });
                        client.bind(adSettings.bind_dn, adSettings.bind_password, (err) => {
                            if (err) { client.destroy(); return resolve(null); }
                            client.search(adSettings.base_dn, { filter: `(sAMAccountName=${agent.ad_username})`, scope: 'sub', attributes: ['sAMAccountName', 'displayName', 'cn', 'mail', 'userAccountControl', 'employeeID', 'description', 'lastLogonTimestamp'] }, (err, searchRes) => {
                                if (err) { client.destroy(); return resolve(null); }
                                let found = null;
                                searchRes.on('searchEntry', (entry) => {
                                    found = flattenLDAPEntry(entry);
                                    if (found.lastLogonTimestamp) {
                                        try {
                                            const ts = parseInt(found.lastLogonTimestamp);
                                            if (ts > 0) found.lastLogonFormatted = new Date((ts / 10000) - 11644473600000).toLocaleString();
                                        } catch (e) { }
                                    }
                                });
                                searchRes.on('end', () => { client.destroy(); resolve(found); });
                                searchRes.on('error', () => { client.destroy(); resolve(null); });
                            });
                        });
                    });
                } catch (e) {}
            }

            const azureSettings = await db.get('SELECT * FROM azure_ad_settings WHERE id = 1');
            if (azureSettings && azureSettings.is_enabled) {
                try {
                    const email = details.ad?.mail || agent.mail || agent.MAIL || agent.EMAIL;
                    if (email) {
                        const tokenRes = await axios.post(`https://login.microsoftonline.com/${azureSettings.tenant_id}/oauth2/v2.0/token`, new URLSearchParams({ client_id: azureSettings.client_id, client_secret: azureSettings.client_secret, grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
                        const accessToken = tokenRes.data.access_token;
                        const azureRes = await axios.get(`https://graph.microsoft.com/v1.0/users?$filter=mail eq '${email}' or userPrincipalName eq '${email}'&$select=id,displayName,mail,userPrincipalName,jobTitle,department,officeLocation,accountEnabled,userType,createdDateTime,onPremisesSyncEnabled,usageLocation,proxyAddresses`, { headers: { Authorization: `Bearer ${accessToken}` } });
                        if (azureRes.data.value && azureRes.data.value.length > 0) {
                            details.azure = azureRes.data.value[0];
                            try {
                                const licenseRes = await axios.get(`https://graph.microsoft.com/v1.0/users/${details.azure.id}/licenseDetails`, { headers: { Authorization: `Bearer ${accessToken}` } });
                                details.azure.licenses = licenseRes.data.value.map(l => l.skuPartNumber);
                            } catch (le) { details.azure.licenses = ["Erreur ou Permissions insuffisantes"]; }
                        }
                    }
                } catch (e) {}
            }
            res.json(details);
        } catch (err) {
            res.status(500).json({ message: 'Erreur détails agent', error: err.message });
        }
    }
};

// Local helpers
async function searchADUserByName(nom, prenom, config) {
    return new Promise((resolve, reject) => {
        const client = ldap.createClient({ url: `ldap://${config.host}:${config.port}` });
        client.bind(config.bind_dn, config.bind_password, (err) => {
            if (err) { client.destroy(); return reject(err); }
            const filter = `(&(objectClass=user)(|(displayName=*${nom}*${prenom}*)(displayName=*${prenom}*${nom}*)(cn=*${nom}*${prenom}*)(cn=*${prenom}*${nom}*)))`;
            client.search(config.base_dn, { filter, scope: 'sub', attributes: ['sAMAccountName', 'displayName', 'cn'] }, (err, searchRes) => {
                if (err) { client.destroy(); return reject(err); }
                let found = null;
                searchRes.on('searchEntry', (entry) => { found = flattenLDAPEntry(entry); });
                searchRes.on('end', () => { client.destroy(); resolve(found); });
                searchRes.on('error', (err) => { client.destroy(); reject(err); });
            });
        });
    });
}

module.exports = rhController;
