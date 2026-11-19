/**
 * Enrichit l'affichage des entretiens avec la fiche SEDIT RH de l'agent : grade, fonction (poste), direction et service.
 * Rapprochement par matricule (celui de l'EP, sinon celui de l'annuaire DSI retrouvé par e-mail ou identifiant).
 * Les valeurs RH priment ; sans fiche RH, l'entretien est renvoyé tel quel. Rien n'est écrit en base.
 */
const { pgDb } = require('../../shared/database');
const sedit = require('../../shared/sedit-rh');

const clean = (v) => String(v || '').trim();

async function enrichFromRh(items) {
    if (!items || !items.length || !sedit.configured()) return items;
    try {
        const byDsi = new Map();
        const missing = items.filter(r => !clean(r.agent_matricule) && (r.agent_email || r.agent_username));
        if (missing.length) {
            const dsi = await pgDb.all("SELECT LOWER(username) AS u, LOWER(email) AS e, matricule FROM hub_calendrier.agents_dsi WHERE COALESCE(matricule, '') <> ''");
            for (const d of dsi) { if (d.u) byDsi.set('u:' + d.u, d.matricule); if (d.e) byDsi.set('e:' + d.e, d.matricule); }
        }
        const matOf = (r) => clean(r.agent_matricule)
            || byDsi.get('u:' + clean(r.agent_username).toLowerCase()) || byDsi.get('e:' + clean(r.agent_email).toLowerCase()) || '';
        const mats = items.map(matOf).filter(Boolean);
        const rh = await sedit.agentsByMatricule(mats);
        // Sans matricule connu : identité (prénom + nom) si elle est unique dans SEDIT RH
        const byName = await sedit.agentsByName(items.filter(r => !rh.get(matOf(r))).map(r => ({ prenom: r.agent_prenom, nom: r.agent_nom })));
        return items.map(r => {
            const a = rh.get(matOf(r)) || byName.get(sedit.nameKey(r.agent_prenom, r.agent_nom));
            if (!a) return r;
            return {
                ...r,
                agent_matricule: r.agent_matricule || a.matricule,
                agent_grade: a.grade || r.agent_grade,
                poste: a.poste || a.fonction || r.poste,
                direction: a.direction || r.direction,
                service: a.service || r.service,
            };
        });
    } catch (e) {
        console.warn('[EP] enrichissement RH indisponible:', e.message);
        return items;
    }
}

module.exports = { enrichFromRh };
