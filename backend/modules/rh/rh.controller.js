const { pgDb } = require('../../shared/database');

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
 * Indexe, depuis l'extraction Oracle (PostgreSQL), les responsables actifs par niveau.
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
    // Arborescence Direction -> Services (utilisée pour alimenter des listes
    // déroulantes en cascade ailleurs dans l'app, ex. module certificats).
    getServicesTree: async (req, res) => {
        try {
            const v2Count = await pgDb.get('SELECT COUNT(*) c FROM oracle.rh_siim_organigramme_v2').catch(() => ({ c: 0 }));
            const orgTable = Number(v2Count.c) > 0 ? 'oracle.rh_siim_organigramme_v2' : 'oracle.rh_siim_organigramme';
            const rows = await pgDb.all(`
                SELECT DISTINCT "DIRECTION" AS dcode, "DIRECTION_L" AS dlabel, "SERVICE" AS scode, "SERVICE_L" AS slabel
                FROM ${orgTable}
                WHERE "DIRECTION" IS NOT NULL AND "DIRECTION" NOT LIKE '$%' AND "DIRECTION" != ''
                  AND "SERVICE" IS NOT NULL AND "SERVICE" NOT LIKE '$%' AND "SERVICE" != ''
            `);
            const isReal = (v) => v && v.trim() && !v.trim().startsWith('$');
            const dirMap = new Map();
            for (const row of rows) {
                const dCode = (row.dcode || '').trim();
                const dLabel = (row.dlabel || '').trim() || dCode;
                const sCode = (row.scode || '').trim();
                const sLabel = (row.slabel || '').trim() || sCode;
                if (!isReal(dCode) || !isReal(sCode)) continue;
                if (!dirMap.has(dCode)) dirMap.set(dCode, { code: dCode, label: dLabel, services: new Map() });
                dirMap.get(dCode).services.set(sCode, { code: sCode, label: sLabel });
            }
            const tree = Array.from(dirMap.values())
                .map(d => ({
                    code: d.code,
                    label: d.label,
                    services: Array.from(d.services.values()).sort((a, b) => a.label.localeCompare(b.label, 'fr'))
                }))
                .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
            res.json(tree);
        } catch (err) {
            res.status(500).json({ message: 'Erreur récupération services', error: err.message });
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
};

module.exports = rhController;
