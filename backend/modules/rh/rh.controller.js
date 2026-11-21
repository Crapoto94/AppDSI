const sedit = require('../../shared/sedit-rh');

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
 * Indexe les responsables actifs par niveau depuis l'API SEDIT RH.
 * Tolérant : renvoie un index vide si l'API échoue (la page ne casse jamais).
 */
async function resolveManagerIndex() {
    const empty = { ok: false, directorsByDir: new Map(), serviceBySvc: new Map(), secteurBySvc: new Map() };
    try {
        const agents = (await sedit.allAgents()).map(sedit.summary);
        const directorsByDir = new Map();
        const serviceBySvc = new Map();
        const secteurBySvc = new Map();
        const push = (map, key, val) => { if (!key) return; if (!map.has(key)) map.set(key, []); map.get(key).push(val); };

        for (const a of agents) {
            const poste = String(a.poste || '').toUpperCase();
            const r = { NOM: a.nom, PRENOM: a.prenom, DIRECTION: a.direction_code, SERVICE: a.service_code, SECTEUR: a.secteur, POSTE_L: a.poste };
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
            const org = await sedit.organisation();
            const tree = org.map(d => ({
                code: d.code,
                label: d.libelle || d.code,
                services: (d.services || []).map(s => ({ code: s.code, label: s.libelle || s.code })).sort((a, b) => a.label.localeCompare(b.label, 'fr')),
            })).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
            res.json(tree);
        } catch (err) {
            res.status(500).json({ message: 'Erreur récupération services', error: err.message });
        }
    },

    // Organisation chart depuis l'API SEDIT RH (directions > services > secteurs)
    getOrganisationChart: async (req, res) => {
        try {
            const org = await sedit.organisation();
            const mgr = await resolveManagerIndex();

            const result = org.map(dir => ({
                code: dir.code,
                label: dir.libelle || dir.code,
                ...pickDirector(mgr, dir.code, dir.libelle || dir.code),
                services: (dir.services || []).map(svc => ({
                    code: svc.code,
                    label: svc.libelle || svc.code,
                    ...pickServiceResp(mgr, svc.code, dir.code, dir.libelle || dir.code),
                    secteurs: (svc.secteurs || []).map(sec => ({
                        code: sec.code,
                        label: sec.libelle || sec.code,
                        ...pickSecteurResp(mgr, svc.code, sec.libelle || sec.code),
                    })),
                })),
            }));

            res.json(result);
        } catch (err) {
            res.status(500).json({ message: 'Erreur organigramme', error: err.message });
        }
    },
};

module.exports = rhController;
